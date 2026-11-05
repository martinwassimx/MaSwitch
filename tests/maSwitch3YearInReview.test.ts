import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';

describe('MaSwitch 3.0: Gaming Year in Review Test Suite', () => {
  let tempDir: string;
  let dbPath: string;
  let db: MaSwitchSqliteDatabase;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-yir-test-'));
    dbPath = path.join(tempDir, 'maswitch-test.db');
    db = new MaSwitchSqliteDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore temporary directory cleanup error
    }
  });

  it('handles an empty year gracefully with 0 totals and no errors', () => {
    const yir = db.getYearInReview(2026);
    expect(yir.year).toBe(2026);
    expect(yir.totalGamingHours).toBe(0);
    expect(yir.totalSessions).toBe(0);
    expect(yir.uniqueGamesCount).toBe(0);
    expect(yir.averageSessionMinutes).toBe(0);
    expect(yir.topGames).toEqual([]);
    expect(yir.longestSession).toBeNull();
    expect(yir.monthlyPlaytime).toHaveLength(12);
    expect(yir.dayOfWeekPlaytime).toHaveLength(7);
    expect(yir.activityCalendar.length).toBeGreaterThanOrEqual(365);
    expect(yir.comparison).toBeNull();
    expect(yir.hasData).toBe(false);
  });

  it('aggregates yearly metrics, top games, and heatmap quartiles accurately', () => {
    // Insert test games
    const game1 = db.addCustomGame({
      title: 'League of Legends',
      executablePath: 'C:\\Games\\Riot Games\\League of Legends\\LeagueClient.exe',
      platformId: 'riot',
    });

    const game2 = db.addCustomGame({
      title: 'Cyberpunk 2077',
      executablePath: 'C:\\Steam\\Cyberpunk2077.exe',
      platformId: 'steam',
    });

    const game3 = db.addCustomGame({
      title: 'Wallpaper Engine',
      executablePath: 'C:\\Steam\\wallpaper_engine\\wallpaper64.exe',
      platformId: 'steam',
    });

    // Insert sessions in 2026
    // League: 3 sessions of 60 mins each = 180 mins (3 hrs)
    db.startPlaytimeSession({
      sessionId: 's-lol-1',
      gameId: game1.id,
      executablePath: game1.executablePath ?? '',
      startedAtIso: '2026-03-10T14:00:00.000Z',
      source: 'background-monitor',
    });
    db.endPlaytimeSession('s-lol-1', '2026-03-10T15:00:00.000Z', 3600);

    db.startPlaytimeSession({
      sessionId: 's-lol-2',
      gameId: game1.id,
      executablePath: game1.executablePath ?? '',
      startedAtIso: '2026-03-11T14:00:00.000Z',
      source: 'background-monitor',
    });
    db.endPlaytimeSession('s-lol-2', '2026-03-11T15:00:00.000Z', 3600);

    db.startPlaytimeSession({
      sessionId: 's-lol-3',
      gameId: game1.id,
      executablePath: game1.executablePath ?? '',
      startedAtIso: '2026-05-20T10:00:00.000Z',
      source: 'background-monitor',
    });
    db.endPlaytimeSession('s-lol-3', '2026-05-20T11:00:00.000Z', 3600);

    // Cyberpunk: 1 session of 120 mins = 120 mins (2 hrs)
    db.startPlaytimeSession({
      sessionId: 's-cp-1',
      gameId: game2.id,
      executablePath: game2.executablePath ?? '',
      startedAtIso: '2026-06-15T18:00:00.000Z',
      source: 'background-monitor',
    });
    db.endPlaytimeSession('s-cp-1', '2026-06-15T20:00:00.000Z', 7200);

    // Wallpaper Engine session (2026)
    db.startPlaytimeSession({
      sessionId: 's-wp-1',
      gameId: game3.id,
      executablePath: game3.executablePath ?? '',
      startedAtIso: '2026-01-05T08:00:00.000Z',
      source: 'background-monitor',
    });
    db.endPlaytimeSession('s-wp-1', '2026-01-05T12:00:00.000Z', 14400);

    // Also insert a session in 2025 for comparison
    db.startPlaytimeSession({
      sessionId: 's-lol-2025',
      gameId: game1.id,
      executablePath: game1.executablePath ?? '',
      startedAtIso: '2025-11-10T14:00:00.000Z',
      source: 'background-monitor',
    });
    db.endPlaytimeSession('s-lol-2025', '2025-11-10T15:00:00.000Z', 3600);

    const availableYears = db.getAvailableYears();
    expect(availableYears).toContain(2026);
    expect(availableYears).toContain(2025);
    expect(availableYears[0]).toBeGreaterThanOrEqual(availableYears[1]);

    const excludedHistorical = {
      exes: new Set(['wallpaper64.exe']),
    };

    const yir = db.getYearInReview(2026, excludedHistorical);

    // Wallpaper Engine should be excluded
    // Total time = 3 hrs (LoL) + 2 hrs (Cyberpunk) = 5 hours
    expect(yir.totalGamingHours).toBe(5);
    expect(yir.totalSessions).toBe(4);
    expect(yir.uniqueGamesCount).toBe(2);

    // Top game should be LoL
    expect(yir.topGames.length).toBe(2);
    expect(yir.topGames[0].title).toBe('League of Legends');
    expect(yir.topGames[0].hoursPlayed).toBe(3);
    expect(yir.topGames[0].sessionCount).toBe(3);
    expect(yir.topGames[0].percentageOfYear).toBe(60);

    // Second game should be Cyberpunk
    expect(yir.topGames[1].title).toBe('Cyberpunk 2077');
    expect(yir.topGames[1].hoursPlayed).toBe(2);
    expect(yir.topGames[1].sessionCount).toBe(1);
    expect(yir.topGames[1].percentageOfYear).toBe(40);

    // Longest session should be Cyberpunk (120 mins)
    expect(yir.longestSession).not.toBeNull();
    expect(yir.longestSession?.gameTitle).toBe('Cyberpunk 2077');
    expect(yir.longestSession?.durationMinutes).toBe(120);

    // Heatmap calendar days
    expect(yir.activityCalendar.length).toBeGreaterThan(0);
    const dayWithLongest = yir.activityCalendar.find((d) => d.date === '2026-06-15');
    expect(dayWithLongest).toBeDefined();
    expect(dayWithLongest?.hours).toBe(2);
    expect(dayWithLongest?.intensity).toBeGreaterThan(0);

    // Previous year comparison (2025 had 1 hour)
    expect(yir.comparison).not.toBeNull();
    expect(yir.comparison?.previousYear).toBe(2025);
    expect(yir.comparison?.previousYearHours).toBe(1);
    expect(yir.comparison?.hoursDiff).toBe(4); // 5 - 1 = +4
  });

  it('returns cached results on identical query and respects cache invalidation', () => {
    const yir1 = db.getYearInReview(2026);
    const yir2 = db.getYearInReview(2026);
    expect(yir1).toEqual(yir2);

    // Invalidate cache
    db.invalidateYearInReviewCache();
    const yir3 = db.getYearInReview(2026);
    expect(yir3.year).toBe(2026);
  });
});
