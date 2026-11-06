import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  AppUpdateService,
  type AppUpdateServiceDependencies,
  type GitHubReleaseItem,
} from '../electron/services/updater/appUpdateService';
import {
  computeKeyId,
  verifySignedUpdateManifest,
  UPDATE_APP_ID,
  UPDATE_MANIFEST_ASSET_NAME,
  UPDATE_SIGNATURE_ASSET_NAME,
  UpdateVerificationError,
  type UpdateTrustKey,
} from '../electron/services/updater/updateManifest';
import { UPDATE_TRUSTED_KEYS } from '../electron/services/updater/updateTrustRoot';
import type { MaSwitchSettings } from '../src/shared/types/settings';
import { DEFAULT_SETTINGS } from '../src/shared/types/settings';
import type { PlaytimeTrackerStatus } from '../src/shared/types/statistics';

const API_URL = 'https://api.github.com/repos/martinwassimx/MaSwitch/releases';
const DL = 'https://github.com/martinwassimx/MaSwitch/releases/download';

interface TestKey {
  privateKey: crypto.KeyObject;
  trust: UpdateTrustKey;
}

function makeKey(): TestKey {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privateKey,
    trust: {
      keyId: computeKeyId(publicKey),
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    },
  };
}

const trustedKey = makeKey();
const otherKey = makeKey();

interface ManifestOptions {
  version?: string;
  tag?: string;
  channel?: string;
  appId?: string;
  fileName?: string;
  payload?: Buffer;
  size?: number;
  keyId?: string;
}

function buildManifest(opts: ManifestOptions = {}): Buffer {
  const version = opts.version ?? '1.0.5';
  const payload = opts.payload ?? Buffer.from('authentic installer');
  return Buffer.from(
    JSON.stringify(
      {
        schemaVersion: 1,
        appId: opts.appId ?? UPDATE_APP_ID,
        version,
        channel: opts.channel ?? 'stable',
        releaseTag: opts.tag ?? `v${version}`,
        installer: {
          fileName: opts.fileName ?? `MaSwitch-Setup-${version}.exe`,
          sha256: crypto.createHash('sha256').update(payload).digest('hex'),
          size: opts.size ?? payload.length,
        },
        keyId: opts.keyId ?? trustedKey.trust.keyId,
        createdAtIso: '2026-11-06T12:00:00Z',
      },
      null,
      2
    )
  );
}

function signManifest(manifest: Buffer, key: TestKey = trustedKey, keyId = key.trust.keyId): Buffer {
  return Buffer.from(
    JSON.stringify({
      keyId,
      algorithm: 'ed25519',
      signature: crypto.sign(null, manifest, key.privateKey).toString('base64'),
    })
  );
}

function release(version: string, extraAssets: GitHubReleaseItem['assets'] = [], withInstaller = true): GitHubReleaseItem {
  const installerName = `MaSwitch-Setup-${version}.exe`;
  return {
    tag_name: `v${version}`,
    name: `MaSwitch ${version}`,
    body: 'Notes',
    prerelease: version.includes('-'),
    published_at: '2026-11-06T12:00:00Z',
    html_url: `https://github.com/martinwassimx/MaSwitch/releases/tag/v${version}`,
    assets: [
      ...(withInstaller
        ? [{ name: installerName, browser_download_url: `${DL}/v${version}/${installerName}`, size: 10, content_type: 'application/octet-stream' }]
        : []),
      ...extraAssets,
    ],
  };
}

function signedAssets(version: string) {
  return [
    { name: UPDATE_MANIFEST_ASSET_NAME, browser_download_url: `${DL}/v${version}/${UPDATE_MANIFEST_ASSET_NAME}`, size: 300, content_type: 'application/json' },
    { name: UPDATE_SIGNATURE_ASSET_NAME, browser_download_url: `${DL}/v${version}/${UPDATE_SIGNATURE_ASSET_NAME}`, size: 150, content_type: 'application/octet-stream' },
  ];
}

interface FetchRoutes {
  releases: GitHubReleaseItem[];
  manifest?: Buffer;
  signature?: Buffer;
  installer?: Buffer;
  installerFinalUrl?: string;
  manifestFinalUrl?: string;
}

function makeFetch(routes: FetchRoutes) {
  return vi.fn().mockImplementation(async (url: string) => {
    if (url === API_URL) {
      return { ok: true, status: 200, json: async () => routes.releases };
    }
    const small = (bytes: Buffer | undefined, finalUrl?: string) =>
      bytes
        ? {
            ok: true,
            status: 200,
            url: finalUrl ?? 'https://objects.githubusercontent.com/github-production-release-asset/1',
            headers: new Headers({ 'content-length': String(bytes.length) }),
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          }
        : { ok: false, status: 404, statusText: 'Not Found' };
    if (url.endsWith(UPDATE_MANIFEST_ASSET_NAME)) return small(routes.manifest, routes.manifestFinalUrl);
    if (url.endsWith(UPDATE_SIGNATURE_ASSET_NAME)) return small(routes.signature);
    if (url.endsWith('.exe') && routes.installer) {
      const payload = routes.installer;
      let sent = false;
      return {
        ok: true,
        status: 200,
        url: routes.installerFinalUrl ?? 'https://release-assets.githubusercontent.com/github-production-release-asset/2',
        headers: new Headers({ 'content-length': String(payload.length) }),
        body: {
          getReader: () => ({
            read: async () => {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: new Uint8Array(payload) };
            },
          }),
        },
      };
    }
    return { ok: false, status: 404, statusText: 'Not Found' };
  });
}

describe('AppUpdateService — authenticated updates', () => {
  let tempTestDir: string;
  let mockSettings: MaSwitchSettings;
  let mockTrackerStatus: PlaytimeTrackerStatus;
  let isRiotAutomating: boolean;
  let isMemoryCleaning: boolean;
  let mockSpawnProcess: { unref: ReturnType<typeof vi.fn> };
  let mockSpawn: ReturnType<typeof vi.fn>;
  let quitApp: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tempTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-updater-test-'));
    mockSettings = {
      ...DEFAULT_SETTINGS,
      autoCheckForUpdates: true,
      updateChannel: 'stable',
      lastUpdateCheckIso: null,
      remindLaterVersion: null,
    };
    mockTrackerStatus = { enabled: true, paused: false, activeSessions: [] };
    isRiotAutomating = false;
    isMemoryCleaning = false;
    mockSpawnProcess = { unref: vi.fn() };
    mockSpawn = vi.fn().mockReturnValue(mockSpawnProcess);
    quitApp = vi.fn();
  });

  afterEach(() => {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
  });

  function deps(overrides?: Partial<AppUpdateServiceDependencies>): AppUpdateServiceDependencies {
    return {
      currentVersion: '1.0.4',
      userDataDir: tempTestDir,
      getTrackerStatus: () => mockTrackerStatus,
      isRiotLoginInProgress: () => isRiotAutomating,
      isMemoryCleanupActive: () => isMemoryCleaning,
      quitApp,
      loadSettings: () => mockSettings,
      saveSettings: (partial) => {
        mockSettings = { ...mockSettings, ...partial };
        return mockSettings;
      },
      spawnFn: mockSpawn as unknown as typeof import('node:child_process').spawn,
      trustedKeys: [trustedKey.trust],
      ...overrides,
    };
  }

  function signedRoutes(payload = Buffer.from('authentic installer'), overrides: Partial<FetchRoutes> = {}): FetchRoutes {
    const manifest = buildManifest({ payload });
    return {
      releases: [release('1.0.5', signedAssets('1.0.5'))],
      manifest,
      signature: signManifest(manifest),
      installer: payload,
      ...overrides,
    };
  }

  async function checkWith(routes: FetchRoutes, overrides?: Partial<AppUpdateServiceDependencies>) {
    const fetchFn = makeFetch(routes);
    const service = new AppUpdateService(deps({ fetchFn: fetchFn as unknown as typeof fetch, ...overrides }));
    const result = await service.checkForUpdates('stable');
    return { service, result, fetchFn };
  }

  const updatesDir = () => path.join(tempTestDir, 'updates');
  const installerPath = () => path.join(updatesDir(), 'MaSwitch-Setup-1.0.5.exe');

  describe('trust root', () => {
    it('ships with no production key so automatic installation stays disabled until one is provisioned', () => {
      expect(Array.isArray(UPDATE_TRUSTED_KEYS)).toBe(true);
      for (const key of UPDATE_TRUSTED_KEYS) {
        expect(key.publicKeyPem).toContain('BEGIN PUBLIC KEY');
        expect(key.publicKeyPem).not.toContain('PRIVATE');
      }
    });

    it('treats a build without configured keys as unverified (missing configuration)', async () => {
      const { service, result } = await checkWith(signedRoutes(), { trustedKeys: [] });
      expect(result.updateAvailable).toBe(true);
      expect(result.updateInfo?.signatureVerified).toBe(false);
      expect(result.updateInfo?.verificationError).toMatch(/no update signing key/i);
      const dl = await service.startDownload();
      expect(dl.success).toBe(false);
      expect(dl.message).toMatch(/could not be verified/i);
    });
  });

  describe('download URL policy', () => {
    it('accepts this repository release downloads and GitHub release CDN hosts', () => {
      const service = new AppUpdateService(deps());
      expect(service.isTrustedDownloadUrl(`${DL}/v1.0.5/MaSwitch-Setup-1.0.5.exe`)).toBe(true);
      expect(service.isTrustedDownloadUrl('https://objects.githubusercontent.com/github-production-release-asset-2e65be/1')).toBe(true);
      expect(service.isTrustedDownloadUrl('https://release-assets.githubusercontent.com/x')).toBe(true);
    });

    it('rejects HTTP, other repositories, user content hosts and spoofed hosts', () => {
      const service = new AppUpdateService(deps());
      expect(service.isTrustedDownloadUrl('http://github.com/martinwassimx/MaSwitch/releases/download/v1/x.exe')).toBe(false);
      expect(service.isTrustedDownloadUrl('https://github.com/attacker/MaSwitch/releases/download/v1/x.exe')).toBe(false);
      expect(service.isTrustedDownloadUrl('https://raw.githubusercontent.com/attacker/repo/main/x.exe')).toBe(false);
      expect(service.isTrustedDownloadUrl('https://github.com.attacker.com/setup.exe')).toBe(false);
      expect(service.isTrustedDownloadUrl('https://user:pw@github.com/martinwassimx/MaSwitch/releases/download/v1/x.exe')).toBe(false);
      expect(service.isTrustedDownloadUrl('javascript:alert(1)')).toBe(false);
      expect(service.isTrustedDownloadUrl('')).toBe(false);
    });
  });

  describe('manifest verification during update checks', () => {
    it('verifies a valid signed manifest and takes the hash and size from it', async () => {
      const payload = Buffer.from('authentic installer');
      const { result, service } = await checkWith(signedRoutes(payload));
      expect(result.updateAvailable).toBe(true);
      expect(result.updateInfo?.signatureVerified).toBe(true);
      expect(result.updateInfo?.expectedSha256).toBe(crypto.createHash('sha256').update(payload).digest('hex'));
      expect(result.updateInfo?.installerAsset.size).toBe(payload.length);
      expect(service.getState().status).toBe('available');
    });

    it('marks releases without a manifest as unverified and never downloads the installer', async () => {
      const { service, result, fetchFn } = await checkWith({ releases: [release('1.0.5')], installer: Buffer.from('x') });
      expect(result.updateInfo?.signatureVerified).toBe(false);
      expect(result.updateInfo?.verificationError).toMatch(/signed update manifest/i);
      expect(result.updateInfo?.expectedSha256).toBeUndefined();
      const dl = await service.startDownload();
      expect(dl.success).toBe(false);
      expect(fetchFn.mock.calls.some(([u]) => String(u).endsWith('.exe'))).toBe(false);
    });

    it('rejects a missing signature asset', async () => {
      const routes = signedRoutes();
      routes.releases = [release('1.0.5', [signedAssets('1.0.5')[0]])];
      const { result } = await checkWith(routes);
      expect(result.updateInfo?.signatureVerified).toBe(false);
    });

    it('rejects a signature asset that cannot be downloaded', async () => {
      const { result } = await checkWith(signedRoutes(undefined, { signature: undefined }));
      expect(result.updateInfo?.signatureVerified).toBe(false);
      expect(result.updateInfo?.verificationError).toMatch(/HTTP 404/);
    });

    it('rejects a manifest modified after signing', async () => {
      const routes = signedRoutes();
      routes.manifest = Buffer.from(routes.manifest!.toString().replace('"size": 19', '"size": 20'));
      const { result } = await checkWith(routes);
      expect(result.updateInfo?.signatureVerified).toBe(false);
      expect(result.updateInfo?.verificationError).toMatch(/signature is invalid/i);
    });

    it('rejects an invalid signature value', async () => {
      const routes = signedRoutes();
      routes.signature = Buffer.from(
        JSON.stringify({ keyId: trustedKey.trust.keyId, algorithm: 'ed25519', signature: crypto.randomBytes(64).toString('base64') })
      );
      const { result } = await checkWith(routes);
      expect(result.updateInfo?.verificationError).toMatch(/signature is invalid/i);
    });

    it('rejects a malformed signature file', async () => {
      const { result } = await checkWith(signedRoutes(undefined, { signature: Buffer.from('not json') }));
      expect(result.updateInfo?.verificationError).toMatch(/not valid JSON/i);
    });

    it('rejects a manifest signed by an untrusted key', async () => {
      const manifest = buildManifest({ keyId: otherKey.trust.keyId });
      const { result } = await checkWith(signedRoutes(undefined, { manifest, signature: signManifest(manifest, otherKey) }));
      expect(result.updateInfo?.verificationError).toMatch(/untrusted key/i);
    });

    it('rejects an attacker key that claims the trusted key ID', async () => {
      const manifest = buildManifest();
      const forged = signManifest(manifest, otherKey, trustedKey.trust.keyId);
      const { result } = await checkWith(signedRoutes(undefined, { manifest, signature: forged }));
      expect(result.updateInfo?.verificationError).toMatch(/signature is invalid/i);
    });

    it('rejects a validly signed manifest for a different application', async () => {
      const manifest = buildManifest({ appId: 'com.example.other' });
      const { result } = await checkWith(signedRoutes(undefined, { manifest, signature: signManifest(manifest) }));
      expect(result.updateInfo?.verificationError).toMatch(/different application/i);
    });

    it('rejects a beta-channel manifest offered to the stable channel', async () => {
      const manifest = buildManifest({ channel: 'beta' });
      const { result } = await checkWith(signedRoutes(undefined, { manifest, signature: signManifest(manifest) }));
      expect(result.updateInfo?.verificationError).toMatch(/stable-channel/i);
    });

    it('rejects replaying an older signed manifest on a newer release tag', async () => {
      const manifest = buildManifest({ version: '1.0.3' });
      const routes = signedRoutes(undefined, { manifest, signature: signManifest(manifest) });
      const { result } = await checkWith(routes);
      expect(result.updateInfo?.signatureVerified).toBe(false);
      expect(result.updateInfo?.verificationError).toMatch(/does not belong to this release/i);
    });

    it('rejects a signed manifest whose installer is not attached to the release', async () => {
      const routes = signedRoutes();
      routes.releases = [release('1.0.5', signedAssets('1.0.5'), false)];
      const { result } = await checkWith(routes);
      expect(result.updateAvailable).toBe(false);
    });

    it('rejects a manifest redirected to an untrusted host', async () => {
      const { result } = await checkWith(signedRoutes(undefined, { manifestFinalUrl: 'https://evil.example.com/m.json' }));
      expect(result.updateInfo?.verificationError).toMatch(/untrusted host/i);
    });

    it('detects updates and filters prereleases by channel', async () => {
      const fetchFn = makeFetch({ releases: [release('1.0.5-beta.1'), release('1.0.3')] });
      const service = new AppUpdateService(deps({ fetchFn: fetchFn as unknown as typeof fetch }));
      expect((await service.checkForUpdates('stable')).updateAvailable).toBe(false);
      const beta = await service.checkForUpdates('beta');
      expect(beta.updateAvailable).toBe(true);
      expect(beta.latestVersion).toBe('1.0.5-beta.1');
    });

    it('ignores an invalid channel value', async () => {
      const fetchFn = makeFetch({ releases: [release('1.0.5-beta.1')] });
      const service = new AppUpdateService(deps({ fetchFn: fetchFn as unknown as typeof fetch }));
      const result = await service.checkForUpdates('nightly' as never);
      expect(result.channel).toBe('stable');
      expect(result.updateAvailable).toBe(false);
    });

    it('handles GitHub API rate limits with a user-friendly error', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });
      const service = new AppUpdateService(deps({ fetchFn: fetchFn as unknown as typeof fetch }));
      const result = await service.checkForUpdates('stable');
      expect(result.error).toContain('rate limit');
      expect(service.getState().status).toBe('error');
    });
  });

  describe('verifySignedUpdateManifest', () => {
    const expectations = {
      currentVersion: '1.0.4',
      requestedChannel: 'stable' as const,
      releaseTag: 'v1.0.5',
      releaseAssetNames: ['MaSwitch-Setup-1.0.5.exe'],
    };

    it('rejects downgrades even when the manifest is validly signed', () => {
      const manifest = buildManifest();
      expect(() =>
        verifySignedUpdateManifest(manifest, signManifest(manifest), [trustedKey.trust], { ...expectations, currentVersion: '1.0.6' })
      ).toThrow(/downgrade/i);
    });

    it('rejects path-traversal installer filenames', () => {
      const manifest = buildManifest({ fileName: '..\\..\\evil.exe' });
      expect(() =>
        verifySignedUpdateManifest(manifest, signManifest(manifest), [trustedKey.trust], {
          ...expectations,
          releaseAssetNames: ['..\\..\\evil.exe'],
        })
      ).toThrow(UpdateVerificationError);
    });

    it('rejects oversized manifests before parsing', () => {
      const big = Buffer.alloc(32 * 1024, 0x20);
      expect(() => verifySignedUpdateManifest(big, signManifest(big), [trustedKey.trust], expectations)).toThrow(/size/i);
    });

    it('rejects a tampered embedded key whose ID does not match', () => {
      const manifest = buildManifest();
      const tampered = { keyId: trustedKey.trust.keyId, publicKeyPem: otherKey.trust.publicKeyPem };
      expect(() => verifySignedUpdateManifest(manifest, signManifest(manifest), [tampered], expectations)).toThrow(/trust key is invalid/i);
    });
  });

  describe('verified download', () => {
    it('downloads into userData/updates and verifies the signed hash', async () => {
      const payload = Buffer.from('authentic installer');
      const { service } = await checkWith(signedRoutes(payload));
      const dl = await service.startDownload();
      expect(dl.success).toBe(true);
      expect(service.getState().status).toBe('downloaded');
      expect(service.getState().downloadedFilePath).toBe(installerPath());
      expect(fs.readFileSync(installerPath())).toEqual(payload);
      expect(fs.readdirSync(updatesDir()).filter((f) => f.endsWith('.part'))).toHaveLength(0);
    });

    it('rejects a modified installer and leaves no file behind', async () => {
      const { service } = await checkWith(signedRoutes(Buffer.from('authentic installer'), { installer: Buffer.from('tampered installer!') }));
      const dl = await service.startDownload();
      expect(dl.success).toBe(false);
      expect(dl.message).toMatch(/does not match the signed release manifest/i);
      expect(fs.existsSync(installerPath())).toBe(false);
      expect(fs.readdirSync(updatesDir())).toHaveLength(0);
    });

    it('rejects a download larger than the signed size', async () => {
      const { service } = await checkWith(signedRoutes(Buffer.from('authentic installer'), { installer: Buffer.from('authentic installer plus extra bytes') }));
      const dl = await service.startDownload();
      expect(dl.success).toBe(false);
      expect(dl.message).toMatch(/larger than the signed size/i);
      expect(fs.readdirSync(updatesDir())).toHaveLength(0);
    });

    it('rejects an installer redirected to an untrusted host', async () => {
      const { service } = await checkWith(signedRoutes(undefined, { installerFinalUrl: 'https://evil.example.com/setup.exe' }));
      const dl = await service.startDownload();
      expect(dl.success).toBe(false);
      expect(dl.message).toMatch(/untrusted host/i);
      expect(fs.existsSync(installerPath())).toBe(false);
    });

    it('rejects tampering with the in-memory hash from outside the verified manifest', async () => {
      const { service } = await checkWith(signedRoutes(Buffer.from('authentic installer'), { installer: Buffer.from('tampered installer!') }));
      const info = service.getState().latestCheckResult!.updateInfo!;
      info.expectedSha256 = crypto.createHash('sha256').update('tampered installer!').digest('hex');
      const dl = await service.startDownload();
      expect(dl.success).toBe(false);
    });
  });

  describe('installation', () => {
    async function downloaded(payload = Buffer.from('authentic installer')) {
      const { service } = await checkWith(signedRoutes(payload));
      expect((await service.startDownload()).success).toBe(true);
      return service;
    }

    it('re-verifies and launches the installer interactively by default', async () => {
      vi.useFakeTimers();
      try {
        const service = await downloaded();
        const res = await service.installAndRestart();
        expect(res.success).toBe(true);
        expect(mockSpawn).toHaveBeenCalledWith(installerPath(), [], { detached: true, stdio: 'ignore' });
        expect(mockSpawnProcess.unref).toHaveBeenCalled();
        vi.runAllTimers();
        expect(quitApp).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('passes /S only when silent installation is explicitly requested', async () => {
      const service = await downloaded();
      await service.installAndRestart({ silent: true });
      expect(mockSpawn).toHaveBeenCalledWith(installerPath(), ['/S'], { detached: true, stdio: 'ignore' });
    });

    it('refuses to run an installer replaced after download', async () => {
      const service = await downloaded();
      fs.writeFileSync(installerPath(), 'replaced installer!');
      const res = await service.installAndRestart();
      expect(res.success).toBe(false);
      expect(res.message).toMatch(/changed or is missing/i);
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(fs.existsSync(installerPath())).toBe(false);
      expect(service.getState().downloadedFilePath).toBeNull();
    });

    it('refuses when the verified installer is missing', async () => {
      const service = await downloaded();
      fs.rmSync(installerPath());
      const res = await service.installAndRestart();
      expect(res.success).toBe(false);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('refuses forged downloaded state that was never verified', async () => {
      const fake = path.join(tempTestDir, 'MaSwitch-Setup-1.0.5.exe');
      fs.writeFileSync(fake, 'dummy-exe');
      const service = new AppUpdateService(deps());
      // @ts-expect-error force downloaded state for test
      service.state.downloadedFilePath = fake;
      // @ts-expect-error force downloaded state for test
      service.state.status = 'downloaded';
      const res = await service.installAndRestart({ silent: true });
      expect(res.success).toBe(false);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('reports an interrupted installer launch without quitting', async () => {
      const service = await downloaded();
      mockSpawn.mockImplementation(() => {
        throw new Error('spawn EACCES');
      });
      const res = await service.installAndRestart();
      expect(res.success).toBe(false);
      expect(res.message).toMatch(/Failed to launch installer/);
      expect(quitApp).not.toHaveBeenCalled();
    });
  });

  describe('safe installation prechecks', () => {
    it('blocks installation when a game is currently running', () => {
      mockTrackerStatus = {
        enabled: true,
        paused: false,
        activeSessions: [
          {
            id: 'sess-1',
            gameId: 'game-1',
            gameTitle: 'VALORANT',
            platformId: 'riot',
            executablePath: 'C:\\Riot Games\\VALORANT\\live\\VALORANT.exe',
            startedAtIso: new Date().toISOString(),
            endedAtIso: null,
            durationSeconds: 2700,
            source: 'background-monitor',
            status: 'active',
          },
        ],
      };
      const precheck = new AppUpdateService(deps()).precheckInstall();
      expect(precheck.canInstall).toBe(false);
      expect(precheck.reason).toBe('game_running');
      expect(precheck.activeGames).toContain('VALORANT');
    });

    it('blocks installation while Riot login automation is in progress', () => {
      isRiotAutomating = true;
      const precheck = new AppUpdateService(deps()).precheckInstall();
      expect(precheck.reason).toBe('riot_automation_active');
    });

    it('blocks installation while memory cleanup is in progress', () => {
      isMemoryCleaning = true;
      const precheck = new AppUpdateService(deps()).precheckInstall();
      expect(precheck.reason).toBe('memory_cleanup_active');
    });
  });

  describe('auto-check scheduler', () => {
    it('skips background checks while a game is playing', async () => {
      mockTrackerStatus = {
        enabled: true,
        paused: false,
        activeSessions: [
          {
            id: 'sess-2',
            gameId: 'game-1',
            gameTitle: 'League of Legends',
            platformId: 'riot',
            executablePath: 'C:\\Riot Games\\League of Legends\\LeagueClient.exe',
            startedAtIso: new Date().toISOString(),
            endedAtIso: null,
            durationSeconds: 1200,
            source: 'background-monitor',
            status: 'active',
          },
        ],
      };
      const fetchFn = vi.fn();
      const service = new AppUpdateService(deps({ fetchFn: fetchFn as unknown as typeof fetch }));
      // @ts-expect-error test private method
      await service.runAutoCheck();
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('throttles background checks to once per 24 hours', async () => {
      mockSettings.lastUpdateCheckIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const fetchFn = vi.fn();
      const service = new AppUpdateService(deps({ fetchFn: fetchFn as unknown as typeof fetch }));
      // @ts-expect-error test private method
      await service.runAutoCheck();
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('runs background checks after 24 hours', async () => {
      mockSettings.lastUpdateCheckIso = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
      const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
      const service = new AppUpdateService(deps({ fetchFn: fetchFn as unknown as typeof fetch }));
      // @ts-expect-error test private method
      await service.runAutoCheck();
      expect(fetchFn).toHaveBeenCalled();
    });
  });
});
