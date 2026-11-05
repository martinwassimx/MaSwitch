import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';
import {
  DEFAULT_EXCLUDED_UTILITY_EXECUTABLES,
  PlaytimeTrackerEngine,
} from '../electron/services/tracker/playtimeTrackerEngine';

describe('MaSwitch 2.0 — Performance & Application Exclusion Suite', () => {
  let tempDir: string;
  let dbPath: string;
  let db: MaSwitchSqliteDatabase;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-2-perf-test-'));
    dbPath = path.join(tempDir, 'maswitch.db');
    db = new MaSwitchSqliteDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('excludes Wallpaper Engine and desktop utility executables by default', async () => {
    // Confirm default utility blacklist contains all Wallpaper Engine variants
    expect(DEFAULT_EXCLUDED_UTILITY_EXECUTABLES.has('wallpaper64.exe')).toBe(true);
    expect(DEFAULT_EXCLUDED_UTILITY_EXECUTABLES.has('wallpaper32.exe')).toBe(true);
    expect(DEFAULT_EXCLUDED_UTILITY_EXECUTABLES.has('webwallpaper32.exe')).toBe(true);
    expect(DEFAULT_EXCLUDED_UTILITY_EXECUTABLES.has('ui32.exe')).toBe(true);

    // Add a custom game pointing to wallpaper64.exe
    const wallpaperExePath = path.join(tempDir, 'wallpaper64.exe');
    fs.writeFileSync(wallpaperExePath, 'MZ');

    db.addCustomGame({
      title: 'Wallpaper Engine Live Wallpapers',
      executablePath: wallpaperExePath,
      platformId: 'custom',
    });

    const nowMs = 1000000;
    const runningProcesses = [
      { imageNameLower: 'wallpaper64.exe', pid: 4400 },
      { imageNameLower: 'ui32.exe', pid: 4401 },
    ];

    const tracker = new PlaytimeTrackerEngine(db, {
      pollIntervalMs: 5000,
      nowFn: () => nowMs,
      processProvider: async () => runningProcesses,
    });

    // Poll tracker while Wallpaper Engine is running continuously
    await tracker.pollOnce();

    const status = tracker.getStatus();
    // Must NOT be tracked as a game
    expect(status.activeSessions.length).toBe(0);

    const stats = db.getRealStatisticsOverview();
    expect(stats.totalGamingHours).toBe(0);
  });

  it('dynamically excludes games/executables when configured by the user', async () => {
    const gameExePath = path.join(tempDir, 'game_util.exe');
    fs.writeFileSync(gameExePath, 'MZ');

    const game = db.addCustomGame({
      title: 'Utility Background Tool',
      executablePath: gameExePath,
      platformId: 'custom',
    });

    let nowMs = 1000000;
    const runningProcesses = [{ imageNameLower: 'game_util.exe', pid: 1234 }];

    const tracker = new PlaytimeTrackerEngine(db, {
      pollIntervalMs: 5000,
      nowFn: () => nowMs,
      processProvider: async () => runningProcesses,
    });

    // Initially not excluded -> should track
    await tracker.pollOnce();
    let status = tracker.getStatus();
    expect(status.activeSessions.length).toBe(1);
    expect(status.activeSessions[0].gameId).toBe(game.id);

    // User excludes 'game_util.exe' -> immediately closes active session
    tracker.setExcludedApplications([
      {
        executableName: 'game_util.exe',
        displayName: 'Utility Background Tool',
        excludeFuture: true,
        excludeHistorical: false,
      },
    ]);

    status = tracker.getStatus();
    expect(status.activeSessions.length).toBe(0);

    // Subsequent polls do not track it
    nowMs += 10000;
    await tracker.pollOnce();
    status = tracker.getStatus();
    expect(status.activeSessions.length).toBe(0);
  });

  it('distinguishes exclude future tracking from historical statistics exclusion reversibly', () => {
    const game1 = db.addCustomGame({
      title: 'Real Game 1',
      executablePath: path.join(tempDir, 'realgame1.exe'),
      platformId: 'custom',
    });
    const wallpaperGame = db.addCustomGame({
      title: 'Wallpaper Engine',
      executablePath: path.join(tempDir, 'wallpaper64.exe'),
      platformId: 'custom',
    });

    const nowIso = new Date().toISOString();

    // Insert 10 hours for Real Game 1
    db.startPlaytimeSession({
      sessionId: 'sess-1',
      gameId: game1.id,
      executablePath: path.join(tempDir, 'realgame1.exe'),
      startedAtIso: nowIso,
      source: 'maswitch-launch',
    });
    db.endPlaytimeSession('sess-1', nowIso, 36000, 'completed'); // 10 hours

    // Insert 20 hours for Wallpaper Engine
    db.startPlaytimeSession({
      sessionId: 'sess-2',
      gameId: wallpaperGame.id,
      executablePath: path.join(tempDir, 'wallpaper64.exe'),
      startedAtIso: nowIso,
      source: 'background-monitor',
    });
    db.endPlaytimeSession('sess-2', nowIso, 72000, 'completed'); // 20 hours

    // Without exclusion: total hours = 30
    const rawStats = db.getRealStatisticsOverview();
    expect(rawStats.totalGamingHours).toBe(30);

    // With historical exclusion for wallpaper64.exe:
    const filteredStats = db.getRealStatisticsOverview({
      exes: new Set(['wallpaper64.exe']),
    });
    expect(filteredStats.totalGamingHours).toBe(10);

    // Verify reversibility: original session rows in SQLite are never deleted
    const allSessions = db.getRecentSessions(10);
    expect(allSessions.length).toBe(2);

    // Toggling exclusion off restores full statistics instantly
    const restoredStats = db.getRealStatisticsOverview();
    expect(restoredStats.totalGamingHours).toBe(30);
  });

  it('Game-Aware Performance Mode adjusts polling interval and emits game state transitions', async () => {
    const gameExePath = path.join(tempDir, 'real_fps_game.exe');
    fs.writeFileSync(gameExePath, 'MZ');

    db.addCustomGame({
      title: 'Real FPS Game',
      executablePath: gameExePath,
      platformId: 'custom',
    });

    let nowMs = 1000000;
    let runningProcesses = [
      { imageNameLower: 'real_fps_game.exe', pid: 9999 },
    ];

    const gameModeEvents: Array<{ inGame: boolean; activeGameCount: number }> = [];

    const tracker = new PlaytimeTrackerEngine(db, {
      pollIntervalMs: 5000,
      inGamePollIntervalMs: 15000,
      nowFn: () => nowMs,
      processProvider: async () => runningProcesses,
      onGameModeChanged: (inGame, count) => {
        gameModeEvents.push({ inGame, activeGameCount: count });
      },
    });

    // Baseline interval when no games are active
    expect(tracker.getCurrentPollIntervalMs()).toBe(5000);

    // Game starts
    await tracker.pollOnce();
    expect(tracker.getStatus().activeSessions.length).toBe(1);
    expect(gameModeEvents).toEqual([{ inGame: true, activeGameCount: 1 }]);

    // Game-aware mode active: polling interval increases to 15s to reduce CPU impact on gaming FPS
    expect(tracker.getCurrentPollIntervalMs()).toBe(15000);

    // Game exits
    runningProcesses = [];
    nowMs += 20000;
    await tracker.pollOnce();

    expect(tracker.getStatus().activeSessions.length).toBe(0);
    expect(gameModeEvents).toEqual([
      { inGame: true, activeGameCount: 1 },
      { inGame: false, activeGameCount: 0 },
    ]);

    // Interval returns to normal 5s
    expect(tracker.getCurrentPollIntervalMs()).toBe(5000);
  });

  it('Low-End PC Mode throttles tracker polling interval to preserve CPU/RAM', () => {
    const tracker = new PlaytimeTrackerEngine(db, {
      pollIntervalMs: 5000,
      lowEndPollIntervalMs: 15000,
    });

    expect(tracker.getCurrentPollIntervalMs()).toBe(5000);

    tracker.setLowEndMode(true);
    expect(tracker.getCurrentPollIntervalMs()).toBe(15000);

    tracker.setLowEndMode(false);
    expect(tracker.getCurrentPollIntervalMs()).toBe(5000);
  });

  it('Sleep and resume handling resets tick timestamps without counting sleep time', async () => {
    const gameExePath = path.join(tempDir, 'rpg_game.exe');
    fs.writeFileSync(gameExePath, 'MZ');

    db.addCustomGame({
      title: 'RPG Game',
      executablePath: gameExePath,
      platformId: 'custom',
    });

    let nowMs = 1000000;
    const runningProcesses = [{ imageNameLower: 'rpg_game.exe', pid: 1111 }];

    const tracker = new PlaytimeTrackerEngine(db, {
      pollIntervalMs: 5000,
      nowFn: () => nowMs,
      processProvider: async () => runningProcesses,
    });

    await tracker.pollOnce();

    // Play for 10 seconds (2 polls of 5s)
    nowMs += 5000;
    await tracker.pollOnce();
    nowMs += 5000;
    await tracker.pollOnce();

    let status = tracker.getStatus();
    expect(status.activeSessions[0].durationSeconds).toBe(10);

    // System goes to sleep
    tracker.handleSystemSuspend();

    // System sleeps for 8 hours (28,800,000 ms)
    nowMs += 8 * 3600 * 1000;

    // System wakes up
    tracker.handleSystemResume();

    // Play 5 seconds after wake
    nowMs += 5000;
    await tracker.pollOnce();

    status = tracker.getStatus();
    // Duration must be 15 seconds (10s before sleep + 5s after wake), NOT 8 hours!
    expect(status.activeSessions[0].durationSeconds).toBe(15);
  });
});
