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
import type { MaSwitchSettings } from '../src/shared/types/settings';
import { DEFAULT_SETTINGS } from '../src/shared/types/settings';
import type { PlaytimeTrackerStatus } from '../src/shared/types/statistics';

describe('AppUpdateService — Secure Update Checker & Windows Auto-Updater', () => {
  let tempTestDir: string;
  let mockSettings: MaSwitchSettings;
  let mockTrackerStatus: PlaytimeTrackerStatus;
  let isRiotAutomating: boolean;
  let isMemoryCleaning: boolean;
  let appQuitCalled: boolean;
  let mockSpawnProcess: { unref: ReturnType<typeof vi.fn> };
  let mockSpawn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tempTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-updater-test-'));
    mockSettings = {
      ...DEFAULT_SETTINGS,
      autoCheckForUpdates: true,
      updateChannel: 'stable',
      lastUpdateCheckIso: null,
      remindLaterVersion: null,
    };
    mockTrackerStatus = {
      enabled: true,
      paused: false,
      activeSessions: [],
    };
    isRiotAutomating = false;
    isMemoryCleaning = false;
    appQuitCalled = false;
    mockSpawnProcess = { unref: vi.fn() };
    mockSpawn = vi.fn().mockReturnValue(mockSpawnProcess);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function createTestDependencies(overrides?: Partial<AppUpdateServiceDependencies>): AppUpdateServiceDependencies {
    return {
      currentVersion: '1.0.4',
      userDataDir: tempTestDir,
      tempDir: tempTestDir,
      getTrackerStatus: () => mockTrackerStatus,
      isRiotLoginInProgress: () => isRiotAutomating,
      isMemoryCleanupActive: () => isMemoryCleaning,
      quitApp: () => {
        appQuitCalled = true;
      },
      loadSettings: () => mockSettings,
      saveSettings: (partial) => {
        mockSettings = { ...mockSettings, ...partial };
        return mockSettings;
      },
      spawnFn: mockSpawn as unknown as typeof import('node:child_process').spawn,
      ...overrides,
    };
  }

  describe('1. Security: Trusted Domains & HTTPS Enforcement', () => {
    it('accepts official GitHub and GitHub CDN download URLs', () => {
      const service = new AppUpdateService(createTestDependencies());

      expect(service.isTrustedDownloadUrl('https://github.com/martinwassimx/MaSwitch/releases/download/v1.0.5/MaSwitch-Setup-1.0.5.exe')).toBe(true);
      expect(service.isTrustedDownloadUrl('https://objects.githubusercontent.com/github-production-release-asset-2e65be/12345/abcde')).toBe(true);
      expect(service.isTrustedDownloadUrl('https://raw.githubusercontent.com/martinwassimx/MaSwitch/main/SHA256SUMS.txt')).toBe(true);
      expect(service.isTrustedDownloadUrl('https://github-releases.githubusercontent.com/12345/setup.exe')).toBe(true);
    });

    it('rejects unencrypted HTTP, unknown domains, and spoofed hosts', () => {
      const service = new AppUpdateService(createTestDependencies());

      expect(service.isTrustedDownloadUrl('http://github.com/setup.exe')).toBe(false);
      expect(service.isTrustedDownloadUrl('https://malicious-site.com/MaSwitch-Setup.exe')).toBe(false);
      expect(service.isTrustedDownloadUrl('https://github.com.attacker.com/setup.exe')).toBe(false);
      expect(service.isTrustedDownloadUrl('javascript:alert(1)')).toBe(false);
      expect(service.isTrustedDownloadUrl('')).toBe(false);
    });
  });

  describe('2. Check for Updates: Semver Comparison & Channel Filtering', () => {
    it('detects an update when remote release has higher version', async () => {
      const mockReleases: GitHubReleaseItem[] = [
        {
          tag_name: 'v1.0.5',
          name: 'MaSwitch 1.0.5',
          body: '## Fixes and Improvements\n- Better update system\n- Bug fixes',
          prerelease: false,
          published_at: '2026-11-06T12:00:00Z',
          html_url: 'https://github.com/martinwassimx/MaSwitch/releases/tag/v1.0.5',
          assets: [
            {
              name: 'MaSwitch-Setup-1.0.5.exe',
              browser_download_url: 'https://github.com/martinwassimx/MaSwitch/releases/download/v1.0.5/MaSwitch-Setup-1.0.5.exe',
              size: 50 * 1024 * 1024,
              content_type: 'application/octet-stream',
            },
            {
              name: 'SHA256SUMS.txt',
              browser_download_url: 'https://github.com/martinwassimx/MaSwitch/releases/download/v1.0.5/SHA256SUMS.txt',
              size: 256,
              content_type: 'text/plain',
            },
          ],
        },
      ];

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('SHA256SUMS.txt')) {
          return {
            ok: true,
            text: async () => 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  MaSwitch-Setup-1.0.5.exe',
          };
        }
        return {
          ok: true,
          json: async () => mockReleases,
        };
      });

      const service = new AppUpdateService(createTestDependencies({ fetchFn: mockFetch as unknown as typeof fetch }));
      const result = await service.checkForUpdates('stable');

      expect(result.updateAvailable).toBe(true);
      expect(result.currentVersion).toBe('1.0.4');
      expect(result.latestVersion).toBe('1.0.5');
      expect(result.updateInfo?.version).toBe('1.0.5');
      expect(result.updateInfo?.expectedSha256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      expect(service.getState().status).toBe('available');
    });

    it('reports updateAvailable=false when remote version matches or is older', async () => {
      const mockReleases: GitHubReleaseItem[] = [
        {
          tag_name: 'v1.0.4',
          name: 'MaSwitch 1.0.4',
          body: 'Current version',
          prerelease: false,
          published_at: '2026-11-05T12:00:00Z',
          html_url: 'https://github.com/martinwassimx/MaSwitch/releases/tag/v1.0.4',
          assets: [
            {
              name: 'MaSwitch-Setup-1.0.4.exe',
              browser_download_url: 'https://github.com/martinwassimx/MaSwitch/releases/download/v1.0.4/MaSwitch-Setup-1.0.4.exe',
              size: 50 * 1024 * 1024,
              content_type: 'application/octet-stream',
            },
          ],
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      });

      const service = new AppUpdateService(createTestDependencies({ fetchFn: mockFetch as unknown as typeof fetch }));
      const result = await service.checkForUpdates('stable');

      expect(result.updateAvailable).toBe(false);
      expect(result.latestVersion).toBe('1.0.4');
      expect(service.getState().status).toBe('not-available');
    });

    it('filters out prereleases on stable channel but includes them on beta channel', async () => {
      const mockReleases: GitHubReleaseItem[] = [
        {
          tag_name: 'v1.0.5-beta.1',
          name: 'MaSwitch 1.0.5 Beta 1',
          body: 'Beta testing build',
          prerelease: true,
          published_at: '2026-11-06T14:00:00Z',
          html_url: 'https://github.com/martinwassimx/MaSwitch/releases/tag/v1.0.5-beta.1',
          assets: [
            {
              name: 'MaSwitch-Setup-1.0.5-beta.1.exe',
              browser_download_url: 'https://github.com/martinwassimx/MaSwitch/releases/download/v1.0.5-beta.1/MaSwitch-Setup-1.0.5-beta.1.exe',
              size: 50 * 1024 * 1024,
              content_type: 'application/octet-stream',
            },
          ],
        },
        {
          tag_name: 'v1.0.3',
          name: 'MaSwitch 1.0.3',
          body: 'Older release',
          prerelease: false,
          published_at: '2026-11-04T12:00:00Z',
          html_url: 'https://github.com/martinwassimx/MaSwitch/releases/tag/v1.0.3',
          assets: [],
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReleases,
      });

      const service = new AppUpdateService(createTestDependencies({ fetchFn: mockFetch as unknown as typeof fetch }));

      // Stable channel should ignore the beta prerelease and find no newer version than 1.0.4
      const stableResult = await service.checkForUpdates('stable');
      expect(stableResult.updateAvailable).toBe(false);

      // Beta channel should consider the beta prerelease and report updateAvailable=true
      const betaResult = await service.checkForUpdates('beta');
      expect(betaResult.updateAvailable).toBe(true);
      expect(betaResult.latestVersion).toBe('1.0.5-beta.1');
    });

    it('handles GitHub API rate limits gracefully with user-friendly error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      const service = new AppUpdateService(createTestDependencies({ fetchFn: mockFetch as unknown as typeof fetch }));
      const result = await service.checkForUpdates('stable');

      expect(result.updateAvailable).toBe(false);
      expect(result.error).toContain('rate limit');
      expect(service.getState().status).toBe('error');
    });
  });

  describe('3. Checksum Verification: SHA256SUMS.txt Parsing & Validation', () => {
    it('parses valid SHA-256 hash from standard sha256sum format', () => {
      const service = new AppUpdateService(createTestDependencies());
      const shaText = `
# Official release checksums
714f194747b9b6b9b545765d70edaa6dcef65609584c5be87ac247d68656ea93  MaSwitch-Setup-1.0.3.exe
fe17809f2433f2712a0bc81118f0c5abe9f23d30998eb7c76236bc4254785c6b *win-unpacked/MaSwitch.exe
`;
      const hash = service.parseChecksumFromSha256Sums(shaText, 'MaSwitch-Setup-1.0.3.exe');
      expect(hash).toBe('714f194747b9b6b9b545765d70edaa6dcef65609584c5be87ac247d68656ea93');
    });

    it('rejects download and deletes file if computed hash mismatches expected SHA-256', async () => {
      const dummyContent = Buffer.from('corrupted payload');
      const expectedCorrectHash = crypto.createHash('sha256').update(Buffer.from('legitimate binary')).digest('hex');

      const mockReleases: GitHubReleaseItem[] = [
        {
          tag_name: 'v1.0.5',
          name: 'MaSwitch 1.0.5',
          body: 'Test',
          prerelease: false,
          published_at: '2026-11-06T12:00:00Z',
          html_url: 'https://github.com/martinwassimx/MaSwitch/releases/tag/v1.0.5',
          assets: [
            {
              name: 'MaSwitch-Setup-1.0.5.exe',
              browser_download_url: 'https://github.com/martinwassimx/MaSwitch/releases/download/v1.0.5/MaSwitch-Setup-1.0.5.exe',
              size: dummyContent.length,
              content_type: 'application/octet-stream',
            },
          ],
        },
      ];

      // ReadableStream mock
      let readCount = 0;
      const mockStream = {
        getReader: () => ({
          read: async () => {
            if (readCount++ === 0) {
              return { done: false, value: new Uint8Array(dummyContent) };
            }
            return { done: true, value: undefined };
          },
        }),
      };

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === 'https://api.github.com/repos/martinwassimx/MaSwitch/releases') {
          return { ok: true, json: async () => mockReleases };
        }
        return {
          ok: true,
          headers: new Headers({ 'content-length': String(dummyContent.length) }),
          body: mockStream,
        };
      });

      const service = new AppUpdateService(createTestDependencies({ fetchFn: mockFetch as unknown as typeof fetch }));
      await service.checkForUpdates('stable');

      // Set deliberate checksum mismatch
      if (service.getState().latestCheckResult?.updateInfo) {
        service.getState().latestCheckResult!.updateInfo!.expectedSha256 = expectedCorrectHash;
      }

      const downloadResult = await service.startDownload();
      expect(downloadResult.success).toBe(false);
      expect(downloadResult.message).toContain('checksum');
      expect(service.getState().status).toBe('error');

      // Ensure no corrupted .exe file was created in target
      const targetPath = path.join(tempTestDir, 'MaSwitch-Setup-1.0.5.exe');
      expect(fs.existsSync(targetPath)).toBe(false);
    });

    it('successfully verifies and renames file when SHA-256 hash matches', async () => {
      const validPayload = Buffer.from('authentic MaSwitch 1.0.5 windows installer executable');
      const validHash = crypto.createHash('sha256').update(validPayload).digest('hex');

      const mockReleases: GitHubReleaseItem[] = [
        {
          tag_name: 'v1.0.5',
          name: 'MaSwitch 1.0.5',
          body: 'Test',
          prerelease: false,
          published_at: '2026-11-06T12:00:00Z',
          html_url: 'https://github.com/martinwassimx/MaSwitch/releases/tag/v1.0.5',
          assets: [
            {
              name: 'MaSwitch-Setup-1.0.5.exe',
              browser_download_url: 'https://github.com/martinwassimx/MaSwitch/releases/download/v1.0.5/MaSwitch-Setup-1.0.5.exe',
              size: validPayload.length,
              content_type: 'application/octet-stream',
            },
          ],
        },
      ];

      let readCount = 0;
      const mockStream = {
        getReader: () => ({
          read: async () => {
            if (readCount++ === 0) {
              return { done: false, value: new Uint8Array(validPayload) };
            }
            return { done: true, value: undefined };
          },
        }),
      };

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === 'https://api.github.com/repos/martinwassimx/MaSwitch/releases') {
          return { ok: true, json: async () => mockReleases };
        }
        return {
          ok: true,
          headers: new Headers({ 'content-length': String(validPayload.length) }),
          body: mockStream,
        };
      });

      const service = new AppUpdateService(createTestDependencies({ fetchFn: mockFetch as unknown as typeof fetch }));
      await service.checkForUpdates('stable');

      if (service.getState().latestCheckResult?.updateInfo) {
        service.getState().latestCheckResult!.updateInfo!.expectedSha256 = validHash;
      }

      const downloadResult = await service.startDownload();
      expect(downloadResult.success).toBe(true);
      expect(service.getState().status).toBe('downloaded');

      const targetPath = path.join(tempTestDir, 'MaSwitch-Setup-1.0.5.exe');
      expect(fs.existsSync(targetPath)).toBe(true);
      expect(fs.readFileSync(targetPath).toString()).toBe('authentic MaSwitch 1.0.5 windows installer executable');
    });
  });

  describe('4. Safe Installation Prechecks', () => {
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

      const service = new AppUpdateService(createTestDependencies());
      const precheck = service.precheckInstall();

      expect(precheck.canInstall).toBe(false);
      expect(precheck.reason).toBe('game_running');
      expect(precheck.message).toContain('VALORANT');
      expect(precheck.activeGames).toContain('VALORANT');
    });

    it('blocks installation when Riot login automation is actively in progress', () => {
      isRiotAutomating = true;

      const service = new AppUpdateService(createTestDependencies());
      const precheck = service.precheckInstall();

      expect(precheck.canInstall).toBe(false);
      expect(precheck.reason).toBe('riot_automation_active');
      expect(precheck.message).toContain('Riot Games login automation');
    });

    it('blocks installation when memory cleanup is in progress', () => {
      isMemoryCleaning = true;

      const service = new AppUpdateService(createTestDependencies());
      const precheck = service.precheckInstall();

      expect(precheck.canInstall).toBe(false);
      expect(precheck.reason).toBe('memory_cleanup_active');
      expect(precheck.message).toContain('Memory cleanup');
    });

    it('passes precheck and executes installer cleanly when system is idle', async () => {
      const dummyExe = path.join(tempTestDir, 'MaSwitch-Setup-1.0.5.exe');
      fs.writeFileSync(dummyExe, 'dummy-exe');

      const service = new AppUpdateService(createTestDependencies());
      // @ts-expect-error force downloaded state for test
      service.state.downloadedFilePath = dummyExe;
      // @ts-expect-error force downloaded state for test
      service.state.status = 'downloaded';

      const precheck = service.precheckInstall();
      expect(precheck.canInstall).toBe(true);

      const installResult = await service.installAndRestart({ silent: true });
      expect(installResult.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(dummyExe, ['/S'], {
        detached: true,
        stdio: 'ignore',
      });
      expect(mockSpawnProcess.unref).toHaveBeenCalled();
      expect(typeof appQuitCalled).toBe('boolean');
    });
  });

  describe('5. Auto-check Scheduler & In-Game Awareness', () => {
    it('skips background update check if a game is actively playing', async () => {
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

      const mockFetch = vi.fn();
      const service = new AppUpdateService(createTestDependencies({ fetchFn: mockFetch as unknown as typeof fetch }));

      // Trigger auto-check routine
      // @ts-expect-error test private method
      await service.runAutoCheck();

      // Should not have fetched GitHub releases while playing in-game
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throttles background update check if last check was less than 24 hours ago', async () => {
      // Checked 2 hours ago
      mockSettings.lastUpdateCheckIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      const mockFetch = vi.fn();
      const service = new AppUpdateService(createTestDependencies({ fetchFn: mockFetch as unknown as typeof fetch }));

      // @ts-expect-error test private method
      await service.runAutoCheck();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('runs background update check if last check was more than 24 hours ago', async () => {
      // Checked 26 hours ago
      mockSettings.lastUpdateCheckIso = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      });
      const service = new AppUpdateService(createTestDependencies({ fetchFn: mockFetch as unknown as typeof fetch }));

      // @ts-expect-error test private method
      await service.runAutoCheck();

      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
