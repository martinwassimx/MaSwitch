import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isFortniteGame,
  detectEpicGameFromManifests,
  parseEpicManifestItem,
} from '../electron/services/scanner/epicScanner';
import {
  GameLauncherEngine,
  getRequiredPlatformLauncher,
} from '../electron/services/launcher/gameLauncherEngine';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';
import type { GameItem } from '../src/shared/types/game';

function createMockGame(overrides: Partial<GameItem> = {}): GameItem {
  return {
    id: 'game-fortnite-test',
    title: 'Fortnite',
    subtitle: 'Epic Games Store',
    platformId: 'epic',
    platformName: 'Epic Games',
    developer: 'Epic Games',
    publisher: 'Epic Games',
    releaseYear: 2017,
    releaseDateLabel: 'July 21, 2017',
    genres: ['Battle Royale', 'Action'],
    tags: ['Multiplayer', 'PvP'],
    isInstalled: true,
    playtimeHours: 0,
    recentTwoWeeksHours: 0,
    lastPlayedIso: null,
    lastPlayedLabel: 'Never played',
    coverImage: 'data:image/svg+xml;base64,mock',
    heroBackgroundImage: 'data:image/svg+xml;base64,mock',
    accentHex: '#0078f2',
    shortDescription: 'Drop into Fortnite Chapter 5.',
    fullDescription: ['Full game description'],
    keyFeatures: ['100-player Battle Royale'],
    screenshots: [],
    trailers: [],
    rating: {
      overallScore: 85,
      userScore: 8.5,
      criticScore: 85,
      reviewSummary: 'Very Positive',
      totalReviewsLabel: '1M+ reviews',
      ageRating: 'Teen',
      contentDescriptors: ['Violence'],
    },
    systemRequirements: {
      minimum: { os: 'Windows 10', processor: 'Core i3', memory: '8 GB', graphics: 'Intel HD 4000', directX: '11', storage: '30 GB' },
      recommended: { os: 'Windows 11', processor: 'Core i5', memory: '16 GB', graphics: 'GTX 960', directX: '12', storage: '30 GB' },
    },
    ownership: {
      accountSlotLabel: 'Epic Games • Local',
      licenseType: 'Free-to-Play Entitlement',
      acquiredDateLabel: '2023-01-01',
      drmSystem: 'Epic Games Launcher',
      installSizeGb: 35,
      installLocationPreview: 'C:\\Program Files\\Epic Games\\Fortnite',
      buildVersion: '28.00',
    },
    achievements: { supported: false, platformSource: 'Not Available', unlockedCount: 0, totalCount: 0, completionPercentage: 0, items: [] },
    isDemoData: false,
    sourceType: 'epic',
    externalAppId: 'Fortnite',
    installPath: 'C:\\Program Files\\Epic Games\\Fortnite',
    executablePath: 'C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe',
    executableName: 'FortniteClient-Win64-Shipping.exe',
    workingDirectory: 'C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64',
    launchMethod: 'epic-protocol',
    launchUri: 'com.epicgames.launcher://apps/Fortnite?action=launch&silent=true',
    ...overrides,
  };
}

describe('Fortnite Epic Games Launching & Multi-State Running Lifecycle', () => {
  let tempDir: string;
  let manifestsDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-fortnite-test-'));
    manifestsDir = path.join(tempDir, 'Manifests');
    fs.mkdirSync(manifestsDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('1. Fortnite Detection & Manifest Parsing', () => {
    it('detects Fortnite from game title and executable patterns', () => {
      expect(isFortniteGame('Fortnite', null)).toBe(true);
      expect(isFortniteGame('Fortnite Battle Royale', null)).toBe(true);
      expect(
        isFortniteGame(
          'Custom PC Game',
          'D:\\Games\\Epic\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe'
        )
      ).toBe(true);
      expect(
        isFortniteGame(
          'Custom PC Game',
          'C:\\Program Files\\Epic Games\\Fortnite\\FortniteLauncher.exe'
        )
      ).toBe(true);
      expect(
        isFortniteGame(
          'My Game',
          'D:\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping_EAC.exe'
        )
      ).toBe(true);

      // Rejects non-Fortnite games
      expect(isFortniteGame('Counter-Strike 2', 'C:\\Steam\\cs2.exe')).toBe(false);
      expect(isFortniteGame('Cyberpunk 2077', 'D:\\Cyberpunk\\Cyberpunk2077.exe')).toBe(false);
    });

    it('parses Epic Games manifest .item files accurately', () => {
      const mockManifest = JSON.stringify({
        FormatVersion: 0,
        AppName: 'Fortnite',
        CatalogItemId: '4fe75bbc5a674f4f9b356b5c90567da5',
        CatalogNamespace: 'fn',
        DisplayName: 'Fortnite',
        InstallLocation: 'C:\\Program Files\\Epic Games\\Fortnite',
        LaunchExecutable: 'FortniteLauncher.exe',
        LaunchCommand: '',
        bIsIncompleteInstall: false,
        bIsApplication: true,
        AppVersionString: '28.10.0',
        InstallSize: 37580963840,
      });

      const parsed = parseEpicManifestItem(mockManifest);
      expect(parsed).not.toBeNull();
      expect(parsed?.appName).toBe('Fortnite');
      expect(parsed?.displayName).toBe('Fortnite');
      expect(parsed?.launchExecutable).toBe('FortniteLauncher.exe');
      expect(parsed?.isApplication).toBe(true);
      expect(parsed?.isIncompleteInstall).toBe(false);
    });

    it('detects Epic manifest from folder path or title matching', () => {
      const itemFile = path.join(manifestsDir, 'fn-fortnite.item');
      fs.writeFileSync(
        itemFile,
        JSON.stringify({
          AppName: 'Fortnite',
          DisplayName: 'Fortnite',
          InstallLocation: path.join(tempDir, 'Fortnite'),
          LaunchExecutable: 'FortniteLauncher.exe',
          bIsApplication: true,
        })
      );

      const matched = detectEpicGameFromManifests(
        {
          executablePath: path.join(
            tempDir,
            'Fortnite',
            'FortniteGame',
            'Binaries',
            'Win64',
            'FortniteClient-Win64-Shipping.exe'
          ),
          installPath: path.join(tempDir, 'Fortnite'),
          title: 'Fortnite',
        },
        manifestsDir
      );

      expect(matched).not.toBeNull();
      expect(matched?.appName).toBe('Fortnite');
      expect(matched?.displayName).toBe('Fortnite');
    });
  });

  describe('2. Fortnite Launch Routing via Official Epic Protocol', () => {
    it('launches Fortnite via com.epicgames.launcher://apps/ protocol and NEVER directly executes shipping binary', async () => {
      const openProtocolMock = vi.fn().mockResolvedValue(undefined);
      const spawnMock = vi.fn();
      const statusChanges: string[] = [];

      const engine = new GameLauncherEngine({
        openExternalProtocol: openProtocolMock,
        spawnProcess: spawnMock,
        isEpicLauncherInstalled: () => true,
        epicManifestResolver: () => ({
          appName: 'Fortnite',
          displayName: 'Fortnite',
          installLocation: 'C:\\Program Files\\Epic Games\\Fortnite',
          launchExecutable: 'FortniteLauncher.exe',
          launchCommand: null,
          catalogNamespace: 'fn',
          catalogItemId: 'fn-id',
          appVersionString: '1.0',
          installSizeBytes: 1000,
          isIncompleteInstall: false,
          isApplication: true,
        }),
        onStatusChanged: (payload) => {
          statusChanges.push(payload.status);
        },
      });

      const fortniteCustom = createMockGame({
        platformId: 'custom',
        launchMethod: 'executable',
        executablePath:
          'D:\\Games\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe',
      });

      const result = await engine.launchGame(fortniteCustom);

      expect(result.success).toBe(true);
      expect(openProtocolMock).toHaveBeenCalledWith(
        'com.epicgames.launcher://apps/Fortnite?action=launch&silent=true'
      );
      // Ensure the direct binary was NEVER spawned!
      expect(spawnMock).not.toHaveBeenCalled();
      expect(statusChanges).toContain('launching');
    });

    it('fails safely with clear diagnostics when Epic Games Launcher is not installed', async () => {
      const openProtocolMock = vi.fn();
      const spawnMock = vi.fn();

      const engine = new GameLauncherEngine({
        openExternalProtocol: openProtocolMock,
        spawnProcess: spawnMock,
        isEpicLauncherInstalled: () => false,
      });

      const fortniteGame = createMockGame();
      const result = await engine.launchGame(fortniteGame);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.message).toContain('Epic Games Launcher is required');
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.errorCategory).toBe('protocol-unavailable');
      expect(result.diagnostics?.troubleshootingAdvice).toContain('Epic Games Launcher');
      // Direct binary must NOT be spawned on failure
      expect(spawnMock).not.toHaveBeenCalled();
      expect(openProtocolMock).not.toHaveBeenCalled();
    });

    it('provides launcher requirements advisory information', () => {
      const fortniteGame = createMockGame();
      const reqInfo = getRequiredPlatformLauncher(fortniteGame);
      expect(reqInfo.isRequired).toBe(true);
      expect(reqInfo.launcherName).toBe('Epic Games Launcher');
      expect(reqInfo.protocolPrefix).toBe('com.epicgames.launcher://apps/');
      expect(reqInfo.advice).toContain('Epic DRM and anti-cheat');
    });
  });

  describe('3. Multi-State Running Lifecycle & Process Verification', () => {
    it('transitions to launching, verifies active process, and only then transitions to running', async () => {
      const statuses: string[] = [];
      let processRunning = false;

      const engine = new GameLauncherEngine({
        openExternalProtocol: vi.fn().mockImplementation(async () => {
          // Protocol accepted, game process appears shortly after
          setTimeout(() => {
            processRunning = true;
          }, 30);
        }),
        isEpicLauncherInstalled: () => true,
        epicManifestResolver: () => ({
          appName: 'Fortnite',
          displayName: 'Fortnite',
          installLocation: 'C:\\Games\\Fortnite',
          launchExecutable: 'FortniteLauncher.exe',
          launchCommand: null,
          catalogNamespace: 'fn',
          catalogItemId: null,
          appVersionString: '1.0',
          installSizeBytes: 100,
          isIncompleteInstall: false,
          isApplication: true,
        }),
        processChecker: async (candidates) => {
          if (!processRunning) return false;
          return candidates.includes('fortniteclient-win64-shipping.exe');
        },
        verificationTimeoutMs: 500,
        verificationPollIntervalMs: 20,
        onStatusChanged: (p) => statuses.push(p.status),
      });

      const fortnite = createMockGame();
      const launchPromise = engine.launchGame(fortnite);

      // Verify that while waiting, it was set to launching
      expect(engine.getAllStatuses()[fortnite.id]).toBe('launching');

      const result = await launchPromise;
      expect(result.success).toBe(true);
      expect(result.status).toBe('running');
      expect(statuses).toEqual(['launching', 'running']);
    });

    it('marks launch as failed when the game process fails to appear within the timeout', async () => {
      const statuses: string[] = [];

      const engine = new GameLauncherEngine({
        openExternalProtocol: vi.fn().mockResolvedValue(undefined),
        isEpicLauncherInstalled: () => true,
        processChecker: async () => false, // Process never appears (e.g. user cancelled or launcher error)
        verificationTimeoutMs: 100,
        verificationPollIntervalMs: 20,
        onStatusChanged: (p) => statuses.push(p.status),
      });

      const fortnite = createMockGame();
      const result = await engine.launchGame(fortnite);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.message).toContain('Launch timed out');
      expect(statuses).toEqual(['launching', 'failed']);
    });

    it('detects immediate child process exit with error and marks status as failed with 0 playtime recorded', async () => {
      const statuses: string[] = [];
      const listeners: Record<string, (code: number) => void> = {};

      const mockChild = {
        pid: 1234,
        once: vi.fn((event: string, cb: (code: number) => void) => {
          listeners[event] = cb;
        }),
        unref: vi.fn(),
      } as unknown as import('node:child_process').ChildProcess;

      const engine = new GameLauncherEngine({
        spawnProcess: async () => {
          // Simulate shipping binary exiting immediately with error code 1 (like Fortnite direct launch)
          setTimeout(() => {
            listeners['exit']?.(1);
          }, 15);
          return { pid: 1234, child: mockChild };
        },
        processChecker: async () => false,
        verificationTimeoutMs: 300,
        verificationPollIntervalMs: 15,
        onStatusChanged: (p) => statuses.push(p.status),
      });

      const exeGame = createMockGame({
        title: 'NonFortniteGame',
        platformId: 'custom',
        launchMethod: 'executable',
        executablePath: path.join(tempDir, 'TestGame.exe'),
        workingDirectory: tempDir,
      });
      fs.writeFileSync(path.join(tempDir, 'TestGame.exe'), 'MZ');

      const result = await engine.launchGame(exeGame);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.message).toContain('exited prematurely with exit code 1');
      expect(statuses).toEqual(['launching', 'failed']);
    });
  });

  describe('4. Database Platform Reconciliation & Manual Override', () => {
    let db: MaSwitchSqliteDatabase;
    let dbPath: string;

    beforeEach(() => {
      dbPath = path.join(tempDir, 'maswitch-test.sqlite');
      db = new MaSwitchSqliteDatabase(dbPath);
    });

    afterEach(() => {
      db.close();
    });

    it('automatically reconciles and upgrades a custom Fortnite game to epic platform with epic-protocol', () => {
      const fakeExe = path.join(tempDir, 'FortniteClient-Win64-Shipping.exe');
      fs.writeFileSync(fakeExe, 'MZ');

      // User previously added Fortnite as a custom game
      const added = db.addCustomGame({
        title: 'Fortnite',
        executablePath: fakeExe,
        platformId: 'custom',
      });

      expect(added.platformId).toBe('epic');
      expect(added.launchMethod).toBe('epic-protocol');
      expect(added.launchUri).toContain('com.epicgames.launcher://apps/Fortnite');
    });

    it('allows users to manually configure or override launch method and app ID', () => {
      const fakeExe = path.join(tempDir, 'MyGame.exe');
      fs.writeFileSync(fakeExe, 'MZ');

      const added = db.addCustomGame({
        title: 'My Game',
        executablePath: fakeExe,
        platformId: 'custom',
      });

      expect(added.launchMethod).toBe('executable');

      // User edits the game to launch via Epic Games Protocol
      const updated = db.updateGameDetails(added.id, {
        platformId: 'epic',
        launchMethod: 'epic-protocol',
        externalAppId: 'Fortnite',
      });

      expect(updated).not.toBeNull();
      expect(updated?.platformId).toBe('epic');
      expect(updated?.launchMethod).toBe('epic-protocol');
      expect(updated?.externalAppId).toBe('Fortnite');
      expect(updated?.launchUri).toBe(
        'com.epicgames.launcher://apps/Fortnite?action=launch&silent=true'
      );
    });

    it('allows users to override to Steam Protocol with numeric App ID', () => {
      const fakeExe = path.join(tempDir, 'SteamGame.exe');
      fs.writeFileSync(fakeExe, 'MZ');

      const added = db.addCustomGame({
        title: 'Steam Title',
        executablePath: fakeExe,
        platformId: 'custom',
      });

      const updated = db.updateGameDetails(added.id, {
        platformId: 'steam',
        launchMethod: 'steam-protocol',
        externalAppId: '730',
      });

      expect(updated?.platformId).toBe('steam');
      expect(updated?.launchMethod).toBe('steam-protocol');
      expect(updated?.externalAppId).toBe('730');
      expect(updated?.launchUri).toBe('steam://rungameid/730');
    });

    it('preserves userPlatformOverride across library reconciliation', () => {
      const fakeExe = path.join(tempDir, 'FortniteLauncher.exe');
      fs.writeFileSync(fakeExe, 'MZ');

      const added = db.addCustomGame({
        title: 'Fortnite',
        executablePath: fakeExe,
        platformId: 'custom',
      });

      // User explicitly set platform override to custom
      db.updateGameDetails(added.id, {
        platformId: 'custom',
      });

      const before = db.getGameById(added.id);
      expect(before?.userPlatformOverride).toBe('custom');

      // Rescan / reconcile
      db.reconcileExistingLibraryPlatforms();

      const after = db.getGameById(added.id);
      expect(after?.userPlatformOverride).toBe('custom');
      // But launch method is protected to avoid direct execution error
      expect(after?.launchMethod).toBe('epic-protocol');
    });
  });
});
