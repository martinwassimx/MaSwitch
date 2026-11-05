import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import {
  parseVdf,
  extractSteamLibraryFoldersFromVdf,
  parseSteamAcfManifest,
} from '../electron/services/scanner/vdfParser';
import {
  parseEpicManifestItem,
  scanEpicGamesManifests,
} from '../electron/services/scanner/epicScanner';
import { classifyWindowsCandidate } from '../electron/services/scanner/generalWindowsScanner';
import {
  deduplicateDiscoveredGames,
  GameScannerEngine,
} from '../electron/services/scanner/gameScannerEngine';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';
import {
  validateSteamLaunchUri,
  validateEpicLaunchUri,
  parseSafeLaunchArguments,
  validateExecutableLaunchTarget,
} from '../electron/services/launcher/gameLauncherEngine';
import { generateDiagnosticReportText } from '../src/shared/utils/diagnosticReport';
import { PlaytimeTrackerEngine } from '../electron/services/tracker/playtimeTrackerEngine';
import { buildTrayMenuTemplate } from '../electron/services/trayService';
import type { DiscoveredGameCandidate, ScanResultSummary } from '../src/shared/types/scanner';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-p2-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup lock
    }
  }
});

describe('Phase 2 Real Windows Gaming Engine Unit & Integration Suite', () => {
  describe('1. Steam VDF & ACF Manifest Parsing', () => {
    it('extracts multiple Steam library folders across drives from libraryfolders.vdf', () => {
      const sampleVdf = `
"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Program Files (x86)\\\\Steam"
    "label"   ""
    "apps"
    {
      "730"   "349281928"
    }
  }
  "1"
  {
    "path"    "D:\\\\SteamLibrary"
    "label"   "NVMe Games"
  }
}
`;
      const folders = extractSteamLibraryFoldersFromVdf(sampleVdf);
      expect(folders).toContain('C:\\Program Files (x86)\\Steam');
      expect(folders).toContain('D:\\SteamLibrary');
      expect(folders.length).toBe(2);
    });

    it('parses valid Steam appmanifest_*.acf and computes install status & disk footprint', () => {
      const sampleAcf = `
"AppState"
{
  "appid"       "1091500"
  "Universe"    "1"
  "name"        "Cyberpunk 2077"
  "StateFlags"  "4"
  "installdir"  "Cyberpunk 2077"
  "SizeOnDisk"  "75161927680"
  "buildid"     "14289102"
  "LastUpdated" "1730000000"
}
`;
      const parsed = parseSteamAcfManifest(sampleAcf);
      expect(parsed).not.toBeNull();
      expect(parsed?.appId).toBe('1091500');
      expect(parsed?.name).toBe('Cyberpunk 2077');
      expect(parsed?.installDir).toBe('Cyberpunk 2077');
      expect(parsed?.stateFlags).toBe(4);
      expect(parsed?.sizeOnDiskBytes).toBe(75161927680);
      expect(parsed?.buildId).toBe('14289102');
      expect(parsed?.lastUpdated).toBe(1730000000);
      expect(parsed?.isFullyInstalled).toBe(true);
    });

    it('gracefully handles malformed or incomplete VDF/ACF files without throwing', () => {
      const malformed = `"AppState" { "appid" "not-a-number" "name" `;
      expect(() => parseVdf(malformed)).not.toThrow();
      expect(parseSteamAcfManifest(malformed)).toBeNull();
      expect(parseSteamAcfManifest('')).toBeNull();
    });
  });

  describe('2. Epic Games .item Manifest Parsing', () => {
    it('parses valid Epic Games Launcher .item manifest and extracts launch metadata', async () => {
      const tempDir = createTempDir();
      const installDir = path.join(tempDir, 'AlanWake2');
      fs.mkdirSync(installDir, { recursive: true });
      const exePath = path.join(installDir, 'AlanWake2.exe');
      fs.writeFileSync(exePath, 'MZ-fake-pe');

      const sampleEpicItem = JSON.stringify({
        FormatVersion: 0,
        AppName: 'dc92810291a',
        DisplayName: 'Alan Wake 2',
        InstallLocation: installDir,
        LaunchExecutable: 'AlanWake2.exe',
        LaunchCommand: '-dx12',
        CatalogNamespace: 'epic-aw2-ns',
        CatalogItemId: 'item-aw2-99',
        InstallSize: 85899345920,
        AppVersionString: '1.1.4',
        bIsIncompleteInstall: false,
      });

      const parsed = parseEpicManifestItem(sampleEpicItem);
      expect(parsed).not.toBeNull();
      expect(parsed?.appName).toBe('dc92810291a');
      expect(parsed?.displayName).toBe('Alan Wake 2');
      expect(parsed?.launchExecutable).toBe('AlanWake2.exe');
      expect(parsed?.isIncompleteInstall).toBe(false);

      const manifestsDir = path.join(tempDir, 'Manifests');
      fs.mkdirSync(manifestsDir, { recursive: true });
      fs.writeFileSync(path.join(manifestsDir, 'aw2.item'), sampleEpicItem);

      const scanRes = await scanEpicGamesManifests(manifestsDir);
      expect(scanRes.games.length).toBe(1);
      expect(scanRes.games[0].platformId).toBe('epic');
      expect(scanRes.games[0].externalAppId).toBe('dc92810291a');
      expect(scanRes.games[0].launchMethod).toBe('epic-protocol');
      expect(scanRes.games[0].launchUri).toBe(
        'com.epicgames.launcher://apps/dc92810291a?action=launch&silent=true'
      );
      expect(scanRes.games[0].executablePath).toBe(exePath);
      expect(scanRes.games[0].isInstalled).toBe(true);
    });

    it('handles malformed Epic .item JSON gracefully', () => {
      expect(parseEpicManifestItem('{ bad json')).toBeNull();
      expect(
        parseEpicManifestItem(JSON.stringify({ AppName: '' }))
      ).toBeNull();
    });
  });

  describe('3. Duplicate Game Deduplication & Confidence Classification', () => {
    it('deduplicates identical games discovered across multiple sources', () => {
      const candidates: DiscoveredGameCandidate[] = [
        {
          title: 'Hades II',
          platformId: 'steam',
          platformName: 'Steam',
          externalAppId: '1145350',
          sourceType: 'steam',
          classification: 'verified-game',
          confidenceScore: 100,
          isInstalled: true,
          installPath: 'D:\\SteamLibrary\\steamapps\\common\\Hades II',
          executablePath:
            'D:\\SteamLibrary\\steamapps\\common\\Hades II\\Hades2.exe',
          executableName: 'Hades2.exe',
          workingDirectory: 'D:\\SteamLibrary\\steamapps\\common\\Hades II',
          launchArgs: null,
          launchMethod: 'steam-protocol',
          launchUri: 'steam://rungameid/1145350',
          installSizeBytes: 12000000000,
          buildVersion: '1.0',
          developer: 'Supergiant Games',
          publisher: 'Supergiant Games',
        },
        {
          title: 'Hades II',
          platformId: 'steam',
          platformName: 'Steam',
          externalAppId: '1145350',
          sourceType: 'windows-registry',
          classification: 'probable-game',
          confidenceScore: 78,
          isInstalled: true,
          installPath: 'D:\\SteamLibrary\\steamapps\\common\\Hades II',
          executablePath:
            'D:\\SteamLibrary\\steamapps\\common\\Hades II\\Hades2.exe',
          executableName: 'Hades2.exe',
          workingDirectory: 'D:\\SteamLibrary\\steamapps\\common\\Hades II',
          launchArgs: null,
          launchMethod: 'executable',
          launchUri: null,
          installSizeBytes: 12000000000,
          buildVersion: '1.0',
          developer: 'Supergiant Games',
          publisher: 'Supergiant Games',
        },
      ];

      const { uniqueGames, duplicatesSkipped } =
        deduplicateDiscoveredGames(candidates);
      expect(uniqueGames.length).toBe(1);
      expect(duplicatesSkipped).toBe(1);
      expect(uniqueGames[0].confidenceScore).toBe(100);
      expect(uniqueGames[0].launchMethod).toBe('steam-protocol');
    });

    it('classifies real games vs system utilities, drivers, and browsers accurately', () => {
      const tempGameDir = createTempDir();
      fs.writeFileSync(path.join(tempGameDir, 'UnityPlayer.dll'), 'dll');
      const gameExe = path.join(tempGameDir, 'HollowKnight.exe');
      fs.writeFileSync(gameExe, 'exe');

      const gameScore = classifyWindowsCandidate({
        displayName: 'Hollow Knight',
        publisher: 'Team Cherry',
        installLocation: tempGameDir,
        executablePath: gameExe,
      });

      expect(gameScore.classification).toBe('verified-game');
      expect(gameScore.confidenceScore).toBeGreaterThanOrEqual(80);

      const utilityScore = classifyWindowsCandidate({
        displayName: 'NVIDIA Graphics Driver 560.94',
        publisher: 'NVIDIA Corporation',
        installLocation: 'C:\\Program Files\\NVIDIA Corporation\\Installer2',
        executablePath: 'C:\\Program Files\\NVIDIA Corporation\\setup.exe',
      });

      expect(utilityScore.classification).toBe('non-game');
      expect(utilityScore.confidenceScore).toBe(0);
    });
  });

  describe('4. SQLite Database Migrations, Corruption Recovery & Library CRUD', () => {
    it('initializes schema v1, persists scanned & custom games, favorites, and removes games non-destructively', () => {
      const tempDir = createTempDir();
      const dbPath = path.join(tempDir, 'maswitch-test.sqlite');
      const fakeExe = path.join(tempDir, 'Starfield.exe');
      fs.writeFileSync(fakeExe, 'MZ-binary');

      const db = new MaSwitchSqliteDatabase(dbPath);
      expect(db.getSchemaVersion()).toBeGreaterThanOrEqual(1);

      // Add a custom game pointing to fakeExe
      const customGame = db.addCustomGame({
        title: 'Starfield Custom Build',
        executablePath: fakeExe,
        launchArgs: '-skipintro',
        classification: 'verified-game',
      });

      expect(customGame).not.toBeNull();
      expect(customGame.title).toBe('Starfield Custom Build');
      expect(db.getAllLibraryGames().length).toBe(1);

      // Toggle favorite
      const favRes = db.toggleFavorite(customGame.id);
      expect(favRes.isFavorite).toBe(true);
      expect(favRes.favoriteGameIds).toContain(customGame.id);

      // Remove game from MaSwitch SQLite library and verify fakeExe on disk is NOT deleted
      const removed = db.removeGameFromLibrary(customGame.id);
      expect(removed).toBe(true);
      expect(db.getAllLibraryGames().length).toBe(0);
      expect(fs.existsSync(fakeExe)).toBe(true);

      db.close();
    });

    it('recovers safely from a corrupted SQLite file by backing it up without data loss', () => {
      const tempDir = createTempDir();
      const dbPath = path.join(tempDir, 'corrupted.sqlite');
      fs.writeFileSync(dbPath, 'NOT_A_VALID_SQLITE_HEADER_1234567890');

      const db = new MaSwitchSqliteDatabase(dbPath);
      expect(db.getSchemaVersion()).toBeGreaterThanOrEqual(1);
      db.close();

      const filesInDir = fs.readdirSync(tempDir);
      const backupFile = filesInDir.find((f) => f.includes('.corrupted-'));
      expect(backupFile).toBeDefined();
    });
  });

  describe('5. Safe Launch Validation & Argument Tokenization', () => {
    it('validates Steam and Epic protocol URIs strictly', () => {
      expect(validateSteamLaunchUri('1091500')).toBe(
        'steam://rungameid/1091500'
      );
      expect(() => validateSteamLaunchUri('1091500; rm -rf /')).toThrow();
      expect(() => validateSteamLaunchUri('')).toThrow();

      expect(validateEpicLaunchUri('Fortnite')).toBe(
        'com.epicgames.launcher://apps/Fortnite?action=launch&silent=true'
      );
      expect(() => validateEpicLaunchUri('bad app name with spaces')).toThrow();
    });

    it('tokenizes launch arguments safely and rejects null-byte injection', () => {
      const safe = parseSafeLaunchArguments('-windowed -width 1920 -height 1080');
      expect(safe).toEqual(['-windowed', '-width', '1920', '-height', '1080']);

      expect(() => parseSafeLaunchArguments('-windowed\0calc.exe')).toThrow();
    });

    it('validates executable targets exist on disk and have allowed .exe extension', () => {
      const tempDir = createTempDir();
      const validExe = path.join(tempDir, 'Game.exe');
      const invalidTxt = path.join(tempDir, 'notes.txt');
      fs.writeFileSync(validExe, 'MZ');
      fs.writeFileSync(invalidTxt, 'hello');

      const resolved = validateExecutableLaunchTarget(validExe);
      expect(resolved.exePath).toBe(path.normalize(validExe));

      expect(() => validateExecutableLaunchTarget(invalidTxt)).toThrow();
      expect(() =>
        validateExecutableLaunchTarget(path.join(tempDir, 'Missing.exe'))
      ).toThrow();
    });
  });

  describe('6. Playtime Tracking, Sleep/Resume Handling & Crash Recovery', () => {
    it('excludes idle launcher processes and matches running game processes to library records', async () => {
      const tempDir = createTempDir();
      const dbPath = path.join(tempDir, 'tracker.sqlite');
      const exePath = path.join(tempDir, 'EldenRing.exe');
      fs.writeFileSync(exePath, 'MZ');

      const db = new MaSwitchSqliteDatabase(dbPath);
      const added = db.addCustomGame({
        title: 'Elden Ring',
        executablePath: exePath,
      });

      let currentNowMs = 1730000000000;
      let runningProcs = [
        { imageNameLower: 'steam.exe', pid: 1001 },
        { imageNameLower: 'eldenring.exe', pid: 4242 },
      ];

      const tracker = new PlaytimeTrackerEngine(db, {
        nowFn: () => currentNowMs,
        processProvider: async () => runningProcs,
      });

      tracker.notifyGameLaunchedFromMaSwitch({
        gameId: added.id,
        executableName: 'EldenRing.exe',
      });

      await tracker.pollOnce();
      expect(tracker.getStatus().activeSessions.length).toBe(1);
      expect(tracker.getStatus().activeSessions[0].source).toBe(
        'maswitch-launch'
      );

      // Advance 10 seconds of gameplay
      currentNowMs += 10_000;
      await tracker.pollOnce();
      expect(tracker.getStatus().activeSessions[0].durationSeconds).toBe(10);

      // Simulate Windows Sleep & Resume (1 hour sleep jump should NOT inflate playtime)
      tracker.handleSystemSuspend();
      currentNowMs += 3600_000;
      tracker.handleSystemResume();
      currentNowMs += 5_000;
      await tracker.pollOnce();
      expect(tracker.getStatus().activeSessions[0].durationSeconds).toBe(15);

      // Simulate game exit
      runningProcs = [{ imageNameLower: 'steam.exe', pid: 1001 }];
      currentNowMs += 5_000;
      await tracker.pollOnce();
      expect(tracker.getStatus().activeSessions.length).toBe(0);

      const sessions = db.getRecentSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].status).toBe('completed');
      expect(sessions[0].durationSeconds).toBe(20);

      db.close();
    });

    it('recovers unclosed active sessions on startup after an unexpected crash or restart', () => {
      const tempDir = createTempDir();
      const dbPath = path.join(tempDir, 'sessions.sqlite');
      const exePath = path.join(tempDir, 'Balatro.exe');
      fs.writeFileSync(exePath, 'MZ');

      const db = new MaSwitchSqliteDatabase(dbPath);
      const game = db.addCustomGame({
        title: 'Balatro',
        executablePath: exePath,
      });

      db.startPlaytimeSession({
        sessionId: 'sess-crash-1',
        gameId: game.id,
        executablePath: exePath,
        source: 'maswitch-launch',
        startedAtIso: '2026-11-04T10:00:00.000Z',
      });
      db.heartbeatPlaytimeSession(
        'sess-crash-1',
        1800,
        '2026-11-04T10:30:00.000Z'
      );

      const recoveredCount = db.recoverUnclosedSessionsOnStartup();
      expect(recoveredCount).toBe(1);

      const statsAfterRecovery = db.getRealStatisticsOverview();
      expect(statsAfterRecovery.totalGamingHours).toBe(0.5);
      expect(statsAfterRecovery.recentSessions?.[0]?.status).toBe(
        'recovered-after-restart'
      );

      db.close();
    });
  });

  describe('7. Scanner Cancellation & System Tray Menu Contract', () => {
    it('supports safe scanner cancellation check', () => {
      const scanner = new GameScannerEngine();
      expect(scanner.isScanning()).toBe(false);
      expect(scanner.cancelActiveScan()).toBe(false);
    });

    it('builds system tray menu template with Open, Rescan, Pause/Resume Tracking, and Exit actions', () => {
      const menuItems = buildTrayMenuTemplate({
        onOpenWindow: () => undefined,
        onRescanGames: () => undefined,
        onTogglePauseTracking: () => undefined,
        onExitApplication: () => undefined,
        isTrackingPaused: () => false,
      });

      const labels = menuItems.map((item) => item.label).filter(Boolean);
      expect(labels).toContain('Open MaSwitch');
      expect(labels).toContain('Rescan Installed Games');
      expect(labels).toContain('Pause Playtime Tracking');
      expect(labels).toContain('Exit MaSwitch Completely');
    });
  });

  describe('8. Phase 4 Comprehensive Diagnostics & Scanner Verifications', () => {
    it('scans Epic Games manifests located in Pending subdirectory with executable verification', async () => {
      const tempDir = createTempDir();
      const pendingDir = path.join(tempDir, 'Pending');
      fs.mkdirSync(pendingDir, { recursive: true });

      const gameInstallDir = path.join(tempDir, 'FortniteGame');
      const binDir = path.join(gameInstallDir, 'Binaries', 'Win64');
      fs.mkdirSync(binDir, { recursive: true });
      const exePath = path.join(binDir, 'FortniteBootstrapper.exe');
      fs.writeFileSync(exePath, 'MZ_FORTNITE');

      const manifestContent = JSON.stringify({
        DisplayName: 'Fortnite',
        AppName: 'Fortnite',
        InstallLocation: gameInstallDir,
        LaunchExecutable: 'Binaries/Win64/FortniteBootstrapper.exe',
        bIsIncompleteInstall: true,
        bIsApplication: true,
      });

      fs.writeFileSync(path.join(pendingDir, 'FN.item'), manifestContent, 'utf-8');

      const result = await scanEpicGamesManifests(tempDir);
      expect(result.games.length).toBe(1);
      expect(result.games[0]?.title).toBe('Fortnite');
      expect(result.games[0]?.isInstalled).toBe(true);
      expect(result.games[0]?.executablePath).toBe(path.normalize(exePath));
    });

    it('generates rich human-readable diagnostic report text for copy to clipboard', () => {
      const mockSummary: ScanResultSummary = {
        scanId: 'scan-test-123',
        status: 'completed',
        startedAtIso: '2026-11-04T12:00:00.000Z',
        finishedAtIso: '2026-11-04T12:00:01.000Z',
        totalFound: 1,
        addedOrUpdatedCount: 1,
        duplicatesSkipped: 0,
        platformReports: [],
        errors: [],
        diagnostics: {
          timestamp: '2026-11-04T12:00:01.000Z',
          durationMs: 1000,
          platformsChecked: [
            {
              platformId: 'steam',
              platformName: 'Steam',
              status: 'detected',
              pathsSearched: ['C:\\SteamLibrary'],
              manifestFilesFound: 1,
              gamesDiscoveredCount: 1,
              detectedGames: [
                {
                  title: 'Wallpaper Engine',
                  installPath: 'C:\\SteamLibrary\\steamapps\\common\\wallpaper_engine',
                  executablePath: 'C:\\SteamLibrary\\steamapps\\common\\wallpaper_engine\\wallpaper.exe',
                  launchMethod: 'steam-protocol',
                },
              ],
            },
          ],
          commonFoldersSearched: ['D:\\Games'],
          totalDiscovered: 1,
          totalUniqueSaved: 1,
          duplicatesSkipped: 0,
          warnings: [],
          errors: [],
        },
      };

      const text = generateDiagnosticReportText(mockSummary);
      expect(text).toContain('MaSwitch — Game Scanner Diagnostic Report');
      expect(text).toContain('Scan ID: scan-test-123');
      expect(text).toContain('Wallpaper Engine [Steam]');
      expect(text).toContain('C:\\SteamLibrary');
      expect(text).toContain('steam-protocol');
    });
  });
});
