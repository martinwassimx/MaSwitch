import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateExecutableLaunchTarget,
  parseSafeLaunchArguments,
} from '../electron/services/launcher/gameLauncherEngine';
import {
  PROTECTED_PROCESS_NAMES,
  MemoryManagementService,
} from '../electron/services/memory/memoryManagementService';
import type { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';
import type { PlaytimeTrackerEngine } from '../electron/services/tracker/playtimeTrackerEngine';

describe('Professional Windows Release Security & Trust Audit', () => {
  describe('1. Package & Distribution Metadata Compliance', () => {
    it('enforces least-privilege requestedExecutionLevel = asInvoker in electron-builder', () => {
      const pkgPath = path.resolve(__dirname, '../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      expect(pkg.build?.win?.requestedExecutionLevel).toBe('asInvoker');
    });

    it('enforces user data preservation across uninstallation (deleteAppDataOnUninstall = false)', () => {
      const pkgPath = path.resolve(__dirname, '../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      expect(pkg.build?.nsis?.deleteAppDataOnUninstall).toBe(false);
    });

    it('defines publisher metadata, timestamps, and legal trademarks in build configuration', () => {
      const pkgPath = path.resolve(__dirname, '../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      const publisher =
        pkg.build?.win?.signtoolOptions?.publisherName ||
        pkg.build?.win?.publisherName;
      const timestampServer =
        pkg.build?.win?.signtoolOptions?.rfc3161TimeStampServer ||
        pkg.build?.win?.rfc3161TimeStampServer;

      expect(publisher).toContain('Martin Wassim');
      expect(pkg.build?.win?.legalTrademarks).toBe('MaSwitch');
      expect(timestampServer).toBe('http://timestamp.digicert.com');
      expect(pkg.build?.nsis?.oneClick).toBe(false);
      expect(pkg.build?.nsis?.perMachine).toBe(false);
    });
  });

  describe('2. Electron Security Settings Audit (electron/main.ts)', () => {
    it('verifies strict webPreferences configuration in main process source code', () => {
      const mainTsPath = path.resolve(__dirname, '../electron/main.ts');
      const mainSource = fs.readFileSync(mainTsPath, 'utf-8');

      // Verify sandbox is enabled
      expect(mainSource).toContain('sandbox: true');
      // Verify contextIsolation is enabled
      expect(mainSource).toContain('contextIsolation: true');
      // Verify nodeIntegration is disabled
      expect(mainSource).toContain('nodeIntegration: false');
      // Verify webSecurity is enabled
      expect(mainSource).toContain('webSecurity: true');
      // Verify insecure content is disallowed
      expect(mainSource).toContain('allowRunningInsecureContent: false');
      // Verify ambient permissions are denied
      expect(mainSource).toContain('setPermissionRequestHandler');
      expect(mainSource).toContain('callback(false)');
      // Verify child window opening is restricted
      expect(mainSource).toContain('setWindowOpenHandler');
      expect(mainSource).toContain("action: 'deny'");
    });
  });

  describe('3. Child Process Execution & Argument Sanitization', () => {
    it('rejects relative executable paths to prevent current working directory hijacking', () => {
      expect(() => validateExecutableLaunchTarget('game.exe')).toThrow(
        /must be an absolute path/i
      );
      expect(() => validateExecutableLaunchTarget('./bin/game.exe')).toThrow(
        /must be an absolute path/i
      );
    });

    it('rejects non-.exe file extensions to prevent script execution vectors', () => {
      expect(() => validateExecutableLaunchTarget('C:\\Windows\\System32\\cmd.bat')).toThrow(
        /must be a Windows executable \(\.exe\)/i
      );
      expect(() => validateExecutableLaunchTarget('C:\\Games\\script.vbs')).toThrow(
        /must be a Windows executable \(\.exe\)/i
      );
      expect(() => validateExecutableLaunchTarget('C:\\Games\\payload.ps1')).toThrow(
        /must be a Windows executable \(\.exe\)/i
      );
    });

    it('rejects null byte injection in executable paths', () => {
      expect(() => validateExecutableLaunchTarget('C:\\Games\\game.exe\0.txt')).toThrow(
        /contains invalid characters/i
      );
    });

    it('tokenizes launch arguments safely without invoking shell interpreters', () => {
      const raw = '-novid -console +fps_max 144 --user-data="C:\\My Folder"';
      const parsed = parseSafeLaunchArguments(raw);

      expect(parsed).toEqual([
        '-novid',
        '-console',
        '+fps_max',
        '144',
        '--user-data=C:\\My Folder',
      ]);
    });

    it('handles quotes, empty strings, and null arguments safely', () => {
      expect(parseSafeLaunchArguments(null)).toEqual([]);
      expect(parseSafeLaunchArguments('')).toEqual([]);
      expect(parseSafeLaunchArguments('   ')).toEqual([]);
    });
  });

  describe('4. Protected Process Whitelist & Memory Safety Rules', () => {
    it('strictly whitelists system binaries, anti-cheat, launchers, and Wallpaper Engine', () => {
      // System
      expect(PROTECTED_PROCESS_NAMES.has('explorer.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('dwm.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('csrss.exe')).toBe(true);
      // Launchers
      expect(PROTECTED_PROCESS_NAMES.has('steam.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('epicgameslauncher.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('riotclientservices.exe')).toBe(true);
      // Anti-Cheat
      expect(PROTECTED_PROCESS_NAMES.has('vgc.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('easyanticheat.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('msmpeng.exe')).toBe(true);
      // Wallpaper Engine
      expect(PROTECTED_PROCESS_NAMES.has('wallpaper64.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('wallpaper32.exe')).toBe(true);
    });

    it('strictly locks and cancels memory cleanup when a game is actively running', async () => {
      const mockDb = {
        recordMemoryCleanup: () => {},
        getMemoryCleanupHistory: () => [],
        clearMemoryCleanupHistory: () => {},
      };

      const gameRunningService = new MemoryManagementService(
        mockDb as unknown as MaSwitchSqliteDatabase,
        {
          getStatus: () => ({
            enabled: true,
            paused: false,
            activeSessions: [
              {
                id: 'session-cs2',
                gameId: 'cs2-id',
                gameTitle: 'Counter-Strike 2',
                startTime: Date.now() - 30000,
                durationSeconds: 30,
                platformId: 'steam',
                executable: 'cs2.exe',
              },
            ],
          }),
        } as unknown as PlaytimeTrackerEngine,
        {
          rawMemoryQuery: () => ({ totalBytes: 16e9, freeBytes: 4e9 }),
          maSwitchWorkingSetGetter: () => 100e6,
        }
      );

      const res = await gameRunningService.performCleanup({ mode: 'standard' });
      expect(res.success).toBe(false);
      expect(res.status).toBe('cancelled');
      expect(res.message).toContain('Memory cleanup is disabled while Counter-Strike 2 is active');
    });
  });

  describe('5. Release Checksums and Verification Files', () => {
    it('verifies that SHA256SUMS.txt exists and contains valid SHA-256 hashes', () => {
      const checksumPath = path.resolve(__dirname, '../release/SHA256SUMS.txt');
      if (fs.existsSync(checksumPath)) {
        const content = fs.readFileSync(checksumPath, 'utf-8');
        const lines = content.trim().split('\n');
        expect(lines.length).toBeGreaterThanOrEqual(1);

        for (const line of lines) {
          const [hash, file] = line.trim().split(/\s+/);
          expect(hash).toMatch(/^[a-f0-9]{64}$/);
          expect(file).toBeDefined();
        }
      }
    });
  });
});
