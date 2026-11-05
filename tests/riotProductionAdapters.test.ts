import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto, { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  createProductionRiotLiveSwitchingEngine,
  enforceSecureDirectoryPermissions,
  RiotWindowsProcessCoordinator,
  RiotWindowsSessionStorage,
  RiotWindowsSessionVault,
  type SafeStorageLike,
} from '../electron/services/accounts/riotProductionAdapters';
import {
  RiotClientRunningError,
  RiotFeatureDisabledError,
  RiotSessionCorruptedError,
  RiotStorageError,
  RiotValidationError,
} from '../electron/services/accounts/riotLiveSwitchingEngine';
import type { RunningProcessEntry } from '../electron/services/tracker/playtimeTrackerEngine';

describe('Phase 10: Production Windows Infrastructure for Riot Switching Engine', () => {
  let testRoot: string;
  let vaultDir: string;
  let syntheticRiotDataDir: string;
  let stagingParentDir: string;

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-riot-phase10-'));
    vaultDir = path.join(testRoot, 'vault', 'riot');
    syntheticRiotDataDir = path.join(testRoot, 'synthetic-riot-data');
    stagingParentDir = path.join(testRoot, 'staging');

    fs.mkdirSync(vaultDir, { recursive: true });
    fs.mkdirSync(syntheticRiotDataDir, { recursive: true });
    fs.mkdirSync(stagingParentDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const defaultMockSafeStorage: SafeStorageLike = {
    isEncryptionAvailable: () => true,
    encryptString: (str) => Buffer.from(`DPAPI_ENCRYPTED:${str}`),
    decryptString: (buf) => {
      const raw = buf.toString('utf8');
      if (!raw.startsWith('DPAPI_ENCRYPTED:')) throw new Error('Decryption failed');
      return raw.replace('DPAPI_ENCRYPTED:', '');
    },
  };

  // Helper to create synthetic Riot Client Data files
  function populateSyntheticRiotData(options: {
    puuid?: string;
    username?: string;
    hasCookies?: boolean;
    sessionFiles?: Record<string, string>;
  }): void {
    const puuid = options.puuid ?? 'test-puuid-littleimad-12345';
    const yamlContent = [
      'client:',
      '  install_id: "test-install-uuid"',
      'riot-login:',
      '  persist:',
      `    sub: "${puuid}"`,
      `    username: "${options.username ?? 'littleimad'}"`,
      '    remember: true',
    ].join('\n');

    fs.writeFileSync(
      path.join(syntheticRiotDataDir, 'RiotGamesPrivateSettings.yaml'),
      yamlContent,
      'utf8'
    );

    if (options.hasCookies !== false) {
      const cookiesDir = path.join(syntheticRiotDataDir, 'Cookies');
      fs.mkdirSync(cookiesDir, { recursive: true });
      fs.writeFileSync(
        path.join(cookiesDir, 'Cookies'),
        Buffer.from('SYNTHETIC_SQLITE_COOKIE_DB_CONTENT_FOR_TESTING')
      );
    }

    if (options.sessionFiles) {
      const sessionsDir = path.join(syntheticRiotDataDir, 'Sessions');
      fs.mkdirSync(sessionsDir, { recursive: true });
      for (const [filename, content] of Object.entries(options.sessionFiles)) {
        fs.writeFileSync(path.join(sessionsDir, filename), content, 'utf8');
      }
    }
  }

  describe('1. Windows DPAPI & Fallback Encrypted Session Vault', () => {
    it('enforces secure permissions on the vault directory', () => {
      const secureDir = path.join(testRoot, 'secure-vault-perm-test');
      enforceSecureDirectoryPermissions(secureDir);
      expect(fs.existsSync(secureDir)).toBe(true);
    });

    it('encrypts and decrypts sessions using mock DPAPI safeStorage', async () => {
      const mockSafeStorage: SafeStorageLike = {
        isEncryptionAvailable: () => true,
        encryptString: (str) => Buffer.from(`DPAPI_ENCRYPTED:${str}`),
        decryptString: (buf) => {
          const raw = buf.toString('utf8');
          if (!raw.startsWith('DPAPI_ENCRYPTED:')) throw new Error('Decryption failed');
          return raw.replace('DPAPI_ENCRYPTED:', '');
        },
      };

      const vault = new RiotWindowsSessionVault(vaultDir, {
        safeStorageOverride: mockSafeStorage,
      });

      const payload = Buffer.from('DISPOSABLE_SYNTHETIC_RIOT_OAUTH_TOKEN_PAYLOAD');
      await vault.saveSession('Melynelas', payload);

      expect(await vault.hasSession('Melynelas')).toBe(true);

      const decrypted = await vault.loadSession('Melynelas');
      expect(decrypted).not.toBeNull();
      expect(decrypted?.toString('utf8')).toBe('DISPOSABLE_SYNTHETIC_RIOT_OAUTH_TOKEN_PAYLOAD');

      // Verify file contains envelope and no plaintext payload
      const diskContent = fs.readFileSync(
        path.join(vaultDir, 'Melynelas.msriot.enc'),
        'utf8'
      );
      expect(diskContent).not.toContain('DISPOSABLE_SYNTHETIC_RIOT_OAUTH_TOKEN_PAYLOAD');
      expect(diskContent).toContain('"encryptionScheme": "dpapi"');
    });

    it('fails closed and throws RiotStorageError when DPAPI is unavailable in production mode', async () => {
      const mockSafeStorageDisabled: SafeStorageLike = {
        isEncryptionAvailable: () => false,
        encryptString: () => {
          throw new Error('DPAPI unavailable');
        },
        decryptString: () => {
          throw new Error('DPAPI unavailable');
        },
      };

      const vault = new RiotWindowsSessionVault(vaultDir, {
        safeStorageOverride: mockSafeStorageDisabled,
        allowInsecureTestCipher: false, // Strict production default
      });

      await expect(
        vault.saveSession('Melynelas', Buffer.from('DISPOSABLE_DATA'))
      ).rejects.toThrow(RiotStorageError);
    });

    it('encrypts and decrypts sessions using authenticated AES-256-GCM fallback ONLY when allowInsecureTestCipher is true', async () => {
      const mockSafeStorageDisabled: SafeStorageLike = {
        isEncryptionAvailable: () => false,
        encryptString: () => {
          throw new Error('DPAPI unavailable');
        },
        decryptString: () => {
          throw new Error('DPAPI unavailable');
        },
      };

      const vault = new RiotWindowsSessionVault(vaultDir, {
        safeStorageOverride: mockSafeStorageDisabled,
        hardwareKeySalt: 'test-synthetic-salt-key-98765',
        allowInsecureTestCipher: true, // Explicitly allowed for headless test runners
      });

      const payload = Buffer.from('DISPOSABLE_SYNTHETIC_AES_GCM_TOKEN_PAYLOAD');
      await vault.saveSession('littleimad', payload);

      expect(await vault.hasSession('littleimad')).toBe(true);

      const decrypted = await vault.loadSession('littleimad');
      expect(decrypted).not.toBeNull();
      expect(decrypted?.toString('utf8')).toBe('DISPOSABLE_SYNTHETIC_AES_GCM_TOKEN_PAYLOAD');

      const diskContent = fs.readFileSync(
        path.join(vaultDir, 'littleimad.msriot.enc'),
        'utf8'
      );
      expect(diskContent).not.toContain('DISPOSABLE_SYNTHETIC_AES_GCM_TOKEN_PAYLOAD');
      expect(diskContent).toContain('"encryptionScheme": "aes-256-gcm"');
      expect(diskContent).toContain('"ivHex"');
      expect(diskContent).toContain('"authTagHex"');
    });

    it('rejects invalid or traversal account IDs', async () => {
      const vault = new RiotWindowsSessionVault(vaultDir, {
        safeStorageOverride: defaultMockSafeStorage,
      });
      const payload = Buffer.from('payload');

      await expect(vault.saveSession('../bad-path', payload)).rejects.toThrow(
        RiotValidationError
      );
      await expect(vault.saveSession('bad/slash', payload)).rejects.toThrow(
        RiotValidationError
      );
      await expect(vault.saveSession('', payload)).rejects.toThrow(RiotValidationError);
      await expect(vault.saveSession('a'.repeat(65), payload)).rejects.toThrow(
        RiotValidationError
      );
    });

    it('rejects empty or non-buffer session data', async () => {
      const vault = new RiotWindowsSessionVault(vaultDir, {
        safeStorageOverride: defaultMockSafeStorage,
      });
      await expect(vault.saveSession('Melynelas', Buffer.alloc(0))).rejects.toThrow(
        RiotValidationError
      );
    });

    it('detects tampering and throws RiotSessionCorruptedError on payload modification', async () => {
      const vault = new RiotWindowsSessionVault(vaultDir, {
        safeStorageOverride: defaultMockSafeStorage,
      });
      await vault.saveSession('Melynelas', Buffer.from('ORIGINAL_DATA'));

      const filePath = path.join(vaultDir, 'Melynelas.msriot.enc');
      const envelope = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Tamper with payload
      envelope.payloadBase64 = Buffer.from('TAMPERED_BYTES').toString('base64');
      fs.writeFileSync(filePath, JSON.stringify(envelope));

      await expect(vault.loadSession('Melynelas')).rejects.toThrow(
        RiotSessionCorruptedError
      );
    });

    it('securely shreds and deletes session archives', async () => {
      const vault = new RiotWindowsSessionVault(vaultDir, {
        safeStorageOverride: defaultMockSafeStorage,
      });
      await vault.saveSession('Melynelas', Buffer.from('DELETE_ME_DATA'));

      expect(await vault.hasSession('Melynelas')).toBe(true);
      await vault.deleteSession('Melynelas');

      expect(await vault.hasSession('Melynelas')).toBe(false);
      expect(await vault.loadSession('Melynelas')).toBeNull();
    });

    it('tracks session expiration state and lists stored profiles', async () => {
      const vault = new RiotWindowsSessionVault(vaultDir, {
        safeStorageOverride: defaultMockSafeStorage,
      });
      await vault.saveSession('Melynelas', Buffer.from('MELY_DATA'), {
        isExpired: false,
      });
      await vault.saveSession('littleimad', Buffer.from('LITTLE_DATA'), {
        isExpired: true,
      });

      expect(await vault.isSessionExpired('Melynelas')).toBe(false);
      expect(await vault.isSessionExpired('littleimad')).toBe(true);

      await vault.markSessionExpired('Melynelas', true);
      expect(await vault.isSessionExpired('Melynelas')).toBe(true);

      const accounts = await vault.listStoredAccountIds();
      expect(accounts.sort()).toEqual(['Melynelas', 'littleimad'].sort());
    });
  });

  describe('2. Windows Atomic Filesystem Session Storage', () => {
    it('correctly parses active account PUUID and username from PrivateSettings', async () => {
      populateSyntheticRiotData({
        puuid: 'puuid-alpha-99887766',
        username: 'Melynelas',
      });

      const storage = new RiotWindowsSessionStorage(
        syntheticRiotDataDir,
        stagingParentDir
      );
      const activeId = await storage.readCurrentActiveSessionId();
      expect(activeId).toBe('puuid-alpha-99887766');

      expect(await storage.verifySessionFiles()).toBe(true);
    });

    it('returns null when PrivateSettings or Cookies are missing', async () => {
      const storage = new RiotWindowsSessionStorage(
        syntheticRiotDataDir,
        stagingParentDir
      );
      expect(await storage.readCurrentActiveSessionId()).toBeNull();
      expect(await storage.verifySessionFiles()).toBe(false);
      expect(await storage.exportLiveSession()).toBeNull();
    });

    it('exports live session files into a compressed, checksummed package', async () => {
      populateSyntheticRiotData({
        puuid: 'puuid-littleimad-5544',
        sessionFiles: {
          'session-1.session': 'SESSION_DESCRIPTOR_1',
          'session-2.session': 'SESSION_DESCRIPTOR_2',
        },
      });

      const storage = new RiotWindowsSessionStorage(
        syntheticRiotDataDir,
        stagingParentDir
      );
      const pkgBuffer = await storage.exportLiveSession();

      expect(pkgBuffer).not.toBeNull();
      expect(Buffer.isBuffer(pkgBuffer)).toBe(true);

      // Verify gzipped archive contents
      const unzipped = zlib.gunzipSync(pkgBuffer!);
      const parsed = JSON.parse(unzipped.toString('utf8'));

      expect(parsed.magic).toBe('MSRIOT_PKG_V1');
      expect(parsed.activeAccountId).toBe('puuid-littleimad-5544');
      expect(parsed.files.length).toBeGreaterThanOrEqual(2);

      const filePaths = parsed.files.map((f: { relativePath: string }) => f.relativePath);
      expect(filePaths).toContain('RiotGamesPrivateSettings.yaml');
      expect(filePaths).toContain('Cookies/Cookies');
      expect(filePaths).toContain('Sessions/session-1.session');
    });

    it('atomically applies session package and updates live directory', async () => {
      // 1. Initial state: Melynelas session
      populateSyntheticRiotData({
        puuid: 'puuid-melynelas-1111',
        username: 'Melynelas',
      });

      const storage = new RiotWindowsSessionStorage(
        syntheticRiotDataDir,
        stagingParentDir
      );
      const melynelasPkg = await storage.exportLiveSession();

      // 2. Prepare littleimad package in a separate clean directory
      const littleimadSourceDir = path.join(testRoot, 'littleimad-source');
      fs.mkdirSync(littleimadSourceDir, { recursive: true });
      fs.writeFileSync(
        path.join(littleimadSourceDir, 'RiotGamesPrivateSettings.yaml'),
        'client:\n  install_id: "uuid"\nriot-login:\n  persist:\n    sub: "puuid-littleimad-2222"\n    username: "littleimad"\n'
      );
      fs.mkdirSync(path.join(littleimadSourceDir, 'Cookies'), { recursive: true });
      fs.writeFileSync(
        path.join(littleimadSourceDir, 'Cookies', 'Cookies'),
        Buffer.from('LITTLEIMAD_COOKIES')
      );

      const littleimadStorage = new RiotWindowsSessionStorage(
        littleimadSourceDir,
        stagingParentDir
      );
      const littleimadPkg = await littleimadStorage.exportLiveSession();
      expect(littleimadPkg).not.toBeNull();

      // 3. Atomically apply littleimad package to synthetic live dir
      await storage.applySessionAtomically(littleimadPkg!);

      // 4. Verify live dir now reflects littleimad
      const activeIdAfter = await storage.readCurrentActiveSessionId();
      expect(activeIdAfter).toBe('puuid-littleimad-2222');

      const liveCookie = fs.readFileSync(
        path.join(syntheticRiotDataDir, 'Cookies', 'Cookies'),
        'utf8'
      );
      expect(liveCookie).toBe('LITTLEIMAD_COOKIES');

      // 5. Verify staging and backup folders were cleaned up
      const stagingContents = fs.readdirSync(stagingParentDir);
      expect(stagingContents.filter((f) => f.startsWith('.maswitch_'))).toHaveLength(0);

      // 6. Apply back Melynelas package
      await storage.applySessionAtomically(melynelasPkg!);
      expect(await storage.readCurrentActiveSessionId()).toBe('puuid-melynelas-1111');
    });

    it('rejects archives containing directory traversal or forbidden paths', async () => {
      const maliciousPkg = {
        magic: 'MSRIOT_PKG_V1',
        exportedAtIso: new Date().toISOString(),
        activeAccountId: 'evil',
        files: [
          {
            relativePath: '../outside.txt',
            dataBase64: Buffer.from('evil').toString('base64'),
            sha256: crypto.createHash('sha256').update('evil').digest('hex'),
            byteSize: 4,
          },
        ],
        packageSha256: 'abc',
      };

      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(maliciousPkg)));
      const storage = new RiotWindowsSessionStorage(
        syntheticRiotDataDir,
        stagingParentDir
      );

      await expect(storage.applySessionAtomically(compressed)).rejects.toThrow(
        RiotValidationError
      );
    });

    it('rolls back to previous session if post-swap verification fails', async () => {
      populateSyntheticRiotData({
        puuid: 'puuid-original-valid',
      });

      const storage = new RiotWindowsSessionStorage(
        syntheticRiotDataDir,
        stagingParentDir
      );

      // Package with an empty/corrupt PrivateSettings that will fail verifySessionFiles
      const corruptPkg = {
        magic: 'MSRIOT_PKG_V1',
        exportedAtIso: new Date().toISOString(),
        activeAccountId: 'corrupt',
        files: [
          {
            relativePath: 'RiotGamesPrivateSettings.yaml',
            dataBase64: Buffer.from('tiny').toString('base64'), // Less than 10 bytes -> fails verifySessionFiles
            sha256: crypto.createHash('sha256').update('tiny').digest('hex'),
            byteSize: 4,
          },
          {
            relativePath: 'Cookies/Cookies',
            dataBase64: Buffer.from('cookies').toString('base64'),
            sha256: crypto.createHash('sha256').update('cookies').digest('hex'),
            byteSize: 7,
          },
        ],
        packageSha256: 'xyz',
      };

      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(corruptPkg)));

      await expect(storage.applySessionAtomically(compressed)).rejects.toThrow();

      // Original session must be restored
      expect(await storage.readCurrentActiveSessionId()).toBe('puuid-original-valid');
    });
  });

  describe('3. Windows Process Coordinator', () => {
    it('detects running games and client processes from process list', async () => {
      const mockLister = vi.fn(async (): Promise<RunningProcessEntry[]> => [
        { imageNameLower: 'explorer.exe', pid: 100 },
        { imageNameLower: 'leagueclientux.exe', pid: 200 },
        { imageNameLower: 'riotclientservices.exe', pid: 300 },
      ]);

      const coordinator = new RiotWindowsProcessCoordinator({
        processLister: mockLister,
      });

      expect(await coordinator.isGameRunning()).toBe(true);
      expect(await coordinator.isClientRunning()).toBe(true);
    });

    it('strictly refuses graceful shutdown when an active game is in session', async () => {
      const mockLister = vi.fn(async (): Promise<RunningProcessEntry[]> => [
        { imageNameLower: 'valorant.exe', pid: 500 },
        { imageNameLower: 'riotclientservices.exe', pid: 600 },
      ]);
      const mockExecutor = vi.fn(async () => ({ stdout: '', stderr: '' }));

      const coordinator = new RiotWindowsProcessCoordinator({
        processLister: mockLister,
        commandExecutor: mockExecutor,
      });

      const shutdownResult = await coordinator.requestGracefulShutdown();
      expect(shutdownResult).toBe(false);
      // Ensure taskkill was NEVER called while game is running
      expect(mockExecutor).not.toHaveBeenCalled();
    });

    it('gracefully requests Riot Client shutdown without /F and polls until closed', async () => {
      let isClientAlive = true;
      const mockLister = vi.fn(async (): Promise<RunningProcessEntry[]> => {
        if (!isClientAlive) return [];
        return [{ imageNameLower: 'riotclientservices.exe', pid: 700 }];
      });

      const mockExecutor = vi.fn(async (cmd: string, args: string[]) => {
        expect(cmd).toBe('taskkill.exe');
        expect(args).toEqual(['/IM', 'RiotClientServices.exe']);
        // Verify /F was NOT passed
        expect(args).not.toContain('/F');
        // Simulate client exiting after WM_CLOSE
        setTimeout(() => {
          isClientAlive = false;
        }, 50);
        return { stdout: 'SUCCESS: Sent termination signal.', stderr: '' };
      });

      const coordinator = new RiotWindowsProcessCoordinator({
        processLister: mockLister,
        commandExecutor: mockExecutor,
        graceTimeoutMs: 1000,
      });

      const shutdownResult = await coordinator.requestGracefulShutdown();
      expect(shutdownResult).toBe(true);
      expect(mockExecutor).toHaveBeenCalledTimes(1);
    });

    it('handles launchClient invoking the configured client launcher', async () => {
      const mockLauncher = vi.fn(async () => {});
      const coordinator = new RiotWindowsProcessCoordinator({
        clientLauncher: mockLauncher,
        riotClientExecutablePath: 'C:\\Synthetic\\RiotClientServices.exe',
      });

      await coordinator.launchClient();
      expect(mockLauncher).toHaveBeenCalledWith('C:\\Synthetic\\RiotClientServices.exe');
    });
  });

  describe('4. Full Windows Production Engine Integration (Disposable Synthetic Harness)', () => {
    it('blocks live operations with RiotFeatureDisabledError when feature flag is disabled', async () => {
      const { engine } = createProductionRiotLiveSwitchingEngine({
        userDataDir: testRoot,
        riotLiveSwitchingEnabled: false, // Feature flag gated off by default
        riotDataDir: syntheticRiotDataDir,
      });

      await expect(engine.switchAccount('Melynelas')).rejects.toThrow(
        RiotFeatureDisabledError
      );
    });

    it('executes full end-to-end switch lifecycle with real Windows adapters in synthetic environment', async () => {
      // 1. Setup initial synthetic live Riot session (littleimad)
      populateSyntheticRiotData({
        puuid: 'puuid-littleimad-999',
        username: 'littleimad',
      });

      let clientRunning = true;
      const mockLister = vi.fn(async (): Promise<RunningProcessEntry[]> => {
        if (clientRunning) {
          return [{ imageNameLower: 'riotclientservices.exe', pid: 1000 }];
        }
        return [];
      });

      const mockExecutor = vi.fn(async () => {
        clientRunning = false;
        return { stdout: '', stderr: '' };
      });

      const mockLauncher = vi.fn(async () => {
        clientRunning = true;
      });

      // 2. Initialize production engine with feature flag enabled in test
      const { engine, vault, storage } = createProductionRiotLiveSwitchingEngine({
        userDataDir: testRoot,
        riotLiveSwitchingEnabled: true,
        riotDataDir: syntheticRiotDataDir,
        safeStorageOverride: defaultMockSafeStorage,
        processLister: mockLister,
        commandExecutor: mockExecutor,
        clientLauncher: mockLauncher,
      });

      // 3. Pre-create target session for Melynelas in encrypted vault
      const targetSourceDir = path.join(testRoot, 'target-melynelas-dir');
      fs.mkdirSync(targetSourceDir, { recursive: true });
      fs.writeFileSync(
        path.join(targetSourceDir, 'RiotGamesPrivateSettings.yaml'),
        'client:\n  install_id: "uuid"\nriot-login:\n  persist:\n    sub: "puuid-melynelas-888"\n    username: "Melynelas"\n'
      );
      fs.mkdirSync(path.join(targetSourceDir, 'Cookies'), { recursive: true });
      fs.writeFileSync(
        path.join(targetSourceDir, 'Cookies', 'Cookies'),
        Buffer.from('MELYNELAS_SYNTHETIC_COOKIES')
      );

      const targetStorage = new RiotWindowsSessionStorage(
        targetSourceDir,
        stagingParentDir
      );
      const targetPkg = await targetStorage.exportLiveSession();
      expect(targetPkg).not.toBeNull();

      await vault.saveSession('Melynelas', targetPkg!);

      // Track state machine transitions
      const stateLog: string[] = [];
      engine.onStateChange((state) => stateLog.push(state));

      // 4. Perform Switch to Melynelas
      const result = await engine.switchAccount('Melynelas');

      expect(result.success).toBe(true);
      expect(result.targetAccountId).toBe('Melynelas');
      expect(result.fromAccountId).toBe('puuid-littleimad-999');
      expect(result.authenticationStatus).toBe('unknown');

      // 5. Verify states traversed
      expect(stateLog).toContain('preflight');
      expect(stateLog).toContain('checking-processes');
      expect(stateLog).toContain('shutting-down-client');
      expect(stateLog).toContain('journaling');
      expect(stateLog).toContain('swapping-session');
      expect(stateLog).toContain('verifying-files');
      expect(stateLog).toContain('launching-client');
      expect(stateLog).toContain('completed');

      // 6. Verify synthetic live directory now contains Melynelas PUUID
      expect(await storage.readCurrentActiveSessionId()).toBe('puuid-melynelas-888');

      // 7. Verify launcher was called
      expect(mockLauncher).toHaveBeenCalledTimes(1);

      // 8. Verify crash recovery safety: rejects when client is running
      await expect(engine.recoverPendingOperation()).rejects.toThrow(RiotClientRunningError);

      // 9. When client is closed, verify recovery detects clean state
      clientRunning = false;
      const recovery = await engine.recoverPendingOperation();
      expect(recovery.recovered).toBe(false);
    });

    it('recovers safely from an interrupted crash via recoverPendingOperation', async () => {
      populateSyntheticRiotData({
        puuid: 'puuid-prior-account',
      });

      const { engine, vault, storage } = createProductionRiotLiveSwitchingEngine({
        userDataDir: testRoot,
        riotLiveSwitchingEnabled: true,
        riotDataDir: syntheticRiotDataDir,
        safeStorageOverride: defaultMockSafeStorage,
        processLister: async () => [],
      });

      // Prepare target session
      const targetPkg = await storage.exportLiveSession();
      await vault.saveSession('prior-account', targetPkg!);

      // Simulate a crashed pending journal
      const journalPath = path.join(testRoot, 'vault', 'riot', 'journal.json');
      fs.writeFileSync(
        journalPath,
        JSON.stringify({
          operationId: randomUUID(),
          fromAccountId: 'prior-account',
          targetAccountId: 'failed-target',
          timestampIso: new Date().toISOString(),
          stage: 'swapping-session',
          pending: true,
        }),
        'utf8'
      );

      // Perform crash recovery on startup
      const recovery = await engine.recoverPendingOperation();
      expect(recovery.recovered).toBe(true);
      expect(recovery.restoredAccountId).toBe('prior-account');

      // Journal is now resolved
      const journalAfter = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      expect(journalAfter.pending).toBe(false);
      expect(journalAfter.stage).toBe('rolled-back');
    });
  });
});
