import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  parseSafeLaunchArguments,
  validateSteamLaunchUri,
  validateEpicLaunchUri,
  validateUbisoftLaunchUri,
  validateGogLaunchUri,
  validateRockstarLaunchUri,
  validateEaLaunchUri,
  resolveRiotProductFromGame,
  validateExecutableLaunchTarget,
  createLaunchDiagnostics,
  GameLauncherEngine,
} from '../electron/services/launcher/gameLauncherEngine';
import {
  resolveGameProcessAliases,
  LAUNCHER_CLIENT_EXECUTABLES,
} from '../electron/services/tracker/gameProcessAliases';
import { PlaytimeTrackerEngine } from '../electron/services/tracker/playtimeTrackerEngine';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';
import type { GameItem } from '../src/shared/types/game';

function createTestGame(overrides: Partial<GameItem> = {}): GameItem {
  return {
    id: 'test-game',
    title: 'Test Game',
    subtitle: 'Test Subtitle',
    platformId: 'custom',
    platformName: 'Custom PC',
    developer: 'Test Dev',
    publisher: 'Test Pub',
    releaseYear: 2024,
    releaseDateLabel: '2024',
    genres: ['Action'],
    tags: ['Singleplayer'],
    isInstalled: true,
    playtimeHours: 0,
    recentTwoWeeksHours: 0,
    lastPlayedIso: null,
    lastPlayedLabel: 'Never played',
    coverImage: '',
    heroBackgroundImage: '',
    accentHex: '#38bdf8',
    shortDescription: '',
    fullDescription: [],
    keyFeatures: [],
    screenshots: [],
    trailers: [],
    systemRequirements: {
      minimum: {
        os: 'Windows 10',
        processor: 'x64',
        memory: '8GB',
        graphics: 'DirectX 11',
        directX: 'Version 11',
        storage: '10GB',
      },
      recommended: {
        os: 'Windows 11',
        processor: 'x64',
        memory: '16GB',
        graphics: 'DirectX 12',
        directX: 'Version 12',
        storage: '10GB',
      },
    },
    rating: {
      overallScore: 85,
      userScore: 8.5,
      criticScore: 85,
      reviewSummary: 'Very Positive',
      totalReviewsLabel: '1,000 reviews',
      ageRating: 'Teen',
      contentDescriptors: [],
    },
    achievements: {
      supported: false,
      platformSource: 'Not Available',
      unlockedCount: 0,
      totalCount: 0,
      completionPercentage: 0,
      items: [],
    },
    isDemoData: false,
    ownership: {
      accountSlotLabel: 'Primary',
      licenseType: 'Local Installed Manifest',
      acquiredDateLabel: '2024',
      drmSystem: 'None',
      installSizeGb: 1,
      installLocationPreview: 'C:\\Games',
      buildVersion: '1.0.0',
    },
    ...overrides,
  };
}

describe('Phase 5: Real Game Launching & Playtime Tracking Engine', () => {
  describe('1. Launch URI & Protocol Validation', () => {
    it('validates Steam launch URIs correctly', () => {
      expect(validateSteamLaunchUri('431960')).toBe('steam://rungameid/431960');
      expect(() => validateSteamLaunchUri('')).toThrow(/Invalid Steam App ID/);
      expect(() => validateSteamLaunchUri('not-numeric')).toThrow(/Invalid Steam App ID/);
      expect(() => validateSteamLaunchUri(null)).toThrow(/Invalid Steam App ID/);
    });

    it('validates Epic Games launch URIs correctly', () => {
      expect(validateEpicLaunchUri('Fortnite')).toBe(
        'com.epicgames.launcher://apps/Fortnite?action=launch&silent=true'
      );
      expect(() => validateEpicLaunchUri('')).toThrow(/Invalid Epic Games AppName/);
      expect(() => validateEpicLaunchUri('invalid uri & space')).toThrow(/Invalid Epic Games AppName/);
    });

    it('validates Ubisoft Connect launch URIs correctly', () => {
      expect(validateUbisoftLaunchUri('1234')).toBe('uplay://launch/1234/0');
      expect(() => validateUbisoftLaunchUri('invalid')).toThrow(/Invalid Ubisoft Connect App ID/);
    });

    it('validates GOG Galaxy launch URIs correctly', () => {
      expect(validateGogLaunchUri('142589')).toBe('goggalaxy://openGameView/142589');
      expect(() => validateGogLaunchUri('')).toThrow(/Invalid GOG Galaxy game ID/);
    });

    it('validates Rockstar Games launch URIs correctly', () => {
      expect(validateRockstarLaunchUri('rdr2')).toBe('rockstar://run/rdr2');
      expect(() => validateRockstarLaunchUri('')).toThrow(/Invalid Rockstar Games launch title/);
    });

    it('validates EA App launch URIs correctly', () => {
      expect(validateEaLaunchUri('16425884')).toBe('origin2://game/launch?offerIds=16425884');
      expect(() => validateEaLaunchUri('')).toThrow(/Invalid EA App Offer ID/);
    });
  });

  describe('2. Safe Argument Parsing & Target Validation', () => {
    it('parses launch arguments with quotes safely without shell injection', () => {
      expect(parseSafeLaunchArguments(null)).toEqual([]);
      expect(parseSafeLaunchArguments('')).toEqual([]);
      expect(parseSafeLaunchArguments('  ')).toEqual([]);
      expect(parseSafeLaunchArguments('-dx11 -novid')).toEqual(['-dx11', '-novid']);
      expect(parseSafeLaunchArguments('-custom "C:\\Path With Space\\config.cfg" -fullscreen')).toEqual([
        '-custom',
        'C:\\Path With Space\\config.cfg',
        '-fullscreen',
      ]);
      expect(() => parseSafeLaunchArguments('arg\0injection')).toThrow(/invalid null characters/);
    });

    it('validates executable targets on disk correctly', () => {
      expect(() => validateExecutableLaunchTarget(null)).toThrow(/Executable path is missing/);
      expect(() => validateExecutableLaunchTarget('relative\\game.exe')).toThrow(/must be an absolute path/);
      expect(() => validateExecutableLaunchTarget('C:\\Games\\game.bat')).toThrow(/must be a Windows executable/);
      expect(() => validateExecutableLaunchTarget('C:\\NonExistentFolder123\\FakeGame.exe')).toThrow(/not found on disk/);
    });
  });

  describe('3. Riot Games Launch Parameters', () => {
    it('resolves product and patchline for Valorant and League of Legends', () => {
      const valorantGame = createTestGame({
        id: 'riot-val',
        title: 'VALORANT',
        platformId: 'riot',
        externalAppId: 'valorant',
      });
      expect(resolveRiotProductFromGame(valorantGame)).toEqual({
        product: 'valorant',
        patchline: 'live',
      });

      const lolGame = createTestGame({
        id: 'riot-lol',
        title: 'League of Legends',
        platformId: 'riot',
        externalAppId: 'league_of_legends',
      });
      expect(resolveRiotProductFromGame(lolGame)).toEqual({
        product: 'league_of_legends',
        patchline: 'live',
      });
    });
  });

  describe('4. Process Image Aliases & Anti-Cheat Hand-off', () => {
    it('resolves aliases for Fortnite (bootstrapper and shipping binary)', () => {
      const aliases = resolveGameProcessAliases('Fortnite', 'epic', 'FortniteBootstrapper.exe');
      expect(aliases).toContain('fortnitebootstrapper.exe');
      expect(aliases).toContain('fortniteclient-win64-shipping.exe');
    });

    it('resolves aliases for VALORANT (launcher and shipping binary)', () => {
      const aliases = resolveGameProcessAliases('VALORANT', 'riot', 'VALORANT.exe');
      expect(aliases).toContain('valorant.exe');
      expect(aliases).toContain('valorant-win64-shipping.exe');
    });

    it('resolves aliases for EA SPORTS FC 27 and F1 25', () => {
      const fc27Aliases = resolveGameProcessAliases('EA SPORTS FC 27', 'ea', 'FC27.exe');
      expect(fc27Aliases).toContain('fc27.exe');

      const f1Aliases = resolveGameProcessAliases('F1 25', 'ea', 'F1_25.exe');
      expect(f1Aliases).toContain('f1_25.exe');
    });

    it('flags launcher clients that must never be counted as gameplay idle time', () => {
      expect(LAUNCHER_CLIENT_EXECUTABLES.has('steam.exe')).toBe(true);
      expect(LAUNCHER_CLIENT_EXECUTABLES.has('riotclientservices.exe')).toBe(true);
      expect(LAUNCHER_CLIENT_EXECUTABLES.has('epicgameslauncher.exe')).toBe(true);
      expect(LAUNCHER_CLIENT_EXECUTABLES.has('eadesktop.exe')).toBe(true);
    });
  });

  describe('5. GameLauncherEngine Multi-Platform Orchestration', () => {
    it('launches Steam games via protocol handler', async () => {
      const openProtocolMock = vi.fn().mockResolvedValue(undefined);
      const engine = new GameLauncherEngine({
        openExternalProtocol: openProtocolMock,
      });

      const steamGame = createTestGame({
        id: 'steam-431960',
        title: 'Wallpaper Engine',
        platformId: 'steam',
        externalAppId: '431960',
        launchMethod: 'steam-protocol',
      });

      const result = await engine.launchGame(steamGame);
      expect(result.success).toBe(true);
      expect(result.status).toBe('running');
      expect(openProtocolMock).toHaveBeenCalledWith('steam://rungameid/431960');
    });

    it('launches Riot games via RiotClientServices when available', async () => {
      const spawnMock = vi.fn().mockResolvedValue({ pid: 8888 });
      const engine = new GameLauncherEngine({
        spawnProcess: spawnMock,
        riotClientPathResolver: () => 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
      });

      const riotGame = createTestGame({
        id: 'riot-val',
        title: 'VALORANT',
        platformId: 'riot',
        externalAppId: 'valorant',
      });

      const result = await engine.launchGame(riotGame);
      expect(result.success).toBe(true);
      expect(result.pid).toBe(8888);
      expect(spawnMock).toHaveBeenCalledWith(
        'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
        ['--launch-product=valorant', '--launch-patchline=live'],
        'C:\\Riot Games\\Riot Client'
      );
    });

    it('generates rich diagnostics when a launch fails', async () => {
      const brokenGame = createTestGame({
        id: 'custom-broken',
        title: 'Broken Game',
        platformId: 'custom',
        executablePath: 'C:\\NonExistentDir999\\Game.exe',
      });

      const diagnostics = createLaunchDiagnostics(brokenGame, new Error('File not found'));
      expect(diagnostics.errorCategory).toBe('file-not-found');
      expect(diagnostics.troubleshootingAdvice).toContain('executable was not found');

      const engine = new GameLauncherEngine();
      const result = await engine.launchGame(brokenGame);
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.errorCategory).toBe('file-not-found');
      expect(result.diagnostics?.troubleshootingAdvice).toContain('executable was not found');
    });
  });

  describe('6. PlaytimeTrackerEngine Session Lifecycle & Grace Period', () => {
    it('tracks active sessions via alias process and respects 2-poll grace period', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-tracker-test-'));
      const dbPath = path.join(tempDir, 'tracker-test.sqlite');
      const db = new MaSwitchSqliteDatabase(dbPath);

      const exePath = path.join(tempDir, 'FortniteBootstrapper.exe');
      fs.writeFileSync(exePath, 'MZ');

      const added = db.addCustomGame({
        title: 'Fortnite',
        executablePath: exePath,
        platformId: 'epic',
      });

      let nowMs = 1000000;
      let runningProcesses = [
        { imageNameLower: 'fortniteclient-win64-shipping.exe', pid: 5555 },
      ];

      const tracker = new PlaytimeTrackerEngine(db, {
        pollIntervalMs: 5000,
        gracePolls: 2,
        nowFn: () => nowMs,
        processProvider: async () => runningProcesses,
      });

      // 1. First poll: detects game via alias 'fortniteclient-win64-shipping.exe'
      await tracker.pollOnce();
      let status = tracker.getStatus();
      expect(status.activeSessions.length).toBe(1);
      expect(status.activeSessions[0].gameId).toBe(added.id);

      // 2. Second poll: game still running, accumulated time advances
      nowMs += 5000;
      await tracker.pollOnce();
      status = tracker.getStatus();
      expect(status.activeSessions.length).toBe(1);
      expect(status.activeSessions[0].durationSeconds).toBe(5);

      // 3. Third poll: simulate momentary process hand-off gap (0 processes) -> grace period keeps session alive!
      nowMs += 5000;
      runningProcesses = [];
      await tracker.pollOnce();
      status = tracker.getStatus();
      expect(status.activeSessions.length).toBe(1); // Grace period: NOT closed

      // 4. Fourth poll: process still missing -> second grace tick
      nowMs += 5000;
      await tracker.pollOnce();
      status = tracker.getStatus();
      expect(status.activeSessions.length).toBe(1);

      // 5. Fifth poll: process still missing -> grace period exhausted (> 2 polls) -> session completed!
      nowMs += 5000;
      await tracker.pollOnce();
      status = tracker.getStatus();
      expect(status.activeSessions.length).toBe(0);

      // Verify session was persisted in SQLite
      const sessions = db.getRecentSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].status).toBe('completed');
      expect(sessions[0].durationSeconds).toBeGreaterThanOrEqual(5);

      tracker.stop();
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });
});
