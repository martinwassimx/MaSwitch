import { describe, expect, it, afterEach } from 'vitest';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';
import type { DiscoveredGameCandidate } from '../src/shared/types/scanner';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-rescan-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe('Priority 1.3: Remove & Rescan Reliability Test Suite', () => {
  it('correctly hides a removed game, and unhides it upon rescan with all metadata and history preserved', () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test-rescan.sqlite');
    const db = new MaSwitchSqliteDatabase(dbPath);

    // 1. Initial discovery of an official game (e.g. EA SPORTS FC 27)
    const initialCandidate: DiscoveredGameCandidate = {
      title: 'EA SPORTS FC 27',
      subtitle: 'EA App Local Installation',
      platformId: 'ea',
      platformName: 'EA App',
      sourceType: 'ea',
      externalAppId: 'Origin.OFR.50.0001234',
      developer: 'EA Canada',
      publisher: 'Electronic Arts',
      installPath: 'D:\\Games\\EA SPORTS FC 27',
      executablePath: 'D:\\Games\\EA SPORTS FC 27\\fc27.exe',
      executableName: 'fc27.exe',
      workingDirectory: 'D:\\Games\\EA SPORTS FC 27',
      launchArgs: null,
      launchUri: null,
      launchMethod: 'executable',
      isInstalled: true,
      buildVersion: '1.0.0',
      confidenceScore: 100,
      classification: 'verified-game',
      installSizeBytes: 50_000_000_000,
    };

    db.upsertDiscoveredGames([initialCandidate]);
    const initialGames = db.getAllLibraryGames();
    expect(initialGames.length).toBe(1);
    const gameId = initialGames[0]!.id;

    // 2. Add user customizations: favorite, artwork override, playtime, account association
    db.toggleFavorite(gameId);
    db.updateGameArtwork({
      gameId,
      coverUrl: 'maswitch-asset://custom_covers/fc27_custom.jpg',
      heroUrl: 'maswitch-asset://custom_heroes/fc27_custom.jpg',
      sgdbGameId: 54321,
      isUserEdited: true,
    });
    db.startPlaytimeSession({
      sessionId: 'sess-1',
      gameId,
      startedAtIso: new Date(Date.now() - 3600_000).toISOString(),
      executablePath: 'D:\\Games\\EA SPORTS FC 27\\fc27.exe',
      source: 'maswitch-launch',
    });
    db.endPlaytimeSession('sess-1', new Date().toISOString(), 3600, 'completed');
    const profile = db.createAccountProfile({
      platformId: 'ea',
      displayName: 'EA Primary',
      username: 'fc_master_pro',
    });
    db.setGameAccountAssociation(gameId, profile.id);

    // Verify initial enriched state
    const enriched = db.getGameById(gameId);
    expect(db.getFavoriteGameIds()).toContain(gameId);
    expect(enriched?.playtimeHours).toBeCloseTo(1.0, 1);
    expect(enriched?.isArtworkUserEdited).toBe(true);
    expect(enriched?.coverImage).toBe('maswitch-asset://custom_covers/fc27_custom.jpg');

    // 3. User removes game from library
    const removed = db.removeGameFromLibrary(gameId);
    expect(removed).toBe(true);

    // Removed game is excluded from active library view
    const afterRemoval = db.getAllLibraryGames();
    expect(afterRemoval.length).toBe(0);

    // Removed game is accessible via getRemovedGames
    const removedList = db.getRemovedGames();
    expect(removedList.length).toBe(1);
    expect(removedList[0]!.id).toBe(gameId);

    // 4. Rescan with slight variation (e.g. path has trailing slash or different case)
    const rescannedCandidate: DiscoveredGameCandidate = {
      ...initialCandidate,
      installPath: 'D:\\Games\\EA SPORTS FC 27\\', // Trailing slash
      executablePath: 'd:\\games\\ea sports fc 27\\fc27.exe', // Lowercase
    };

    const affected = db.upsertDiscoveredGames([rescannedCandidate]);
    expect(affected).toBe(1);

    // 5. Game must reappear in active library view without duplicates
    const restoredGames = db.getAllLibraryGames();
    expect(restoredGames.length).toBe(1);
    const restoredGame = restoredGames[0]!;
    expect(restoredGame.id).toBe(gameId);
    expect(restoredGame.title).toBe('EA SPORTS FC 27');

    // 6. All user state is strictly preserved
    expect(db.getFavoriteGameIds()).toContain(gameId);
    expect(restoredGame.playtimeHours).toBeCloseTo(1.0, 1);
    expect(restoredGame.isArtworkUserEdited).toBe(true);
    expect(restoredGame.coverImage).toBe('maswitch-asset://custom_covers/fc27_custom.jpg');

    const assoc = db.getGameAccountAssociation(gameId);
    expect(assoc?.accountId).toBe(profile.id);

    db.close();
  });

  it('re-adding a removed game via addCustomGame unhides it and preserves history', () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test-custom-rescan.sqlite');
    const db = new MaSwitchSqliteDatabase(dbPath);

    // Create a dummy executable
    const exePath = path.join(dir, 'SuperGame.exe');
    fs.writeFileSync(exePath, 'binary content');

    // 1. Add custom game
    const added = db.addCustomGame({
      title: 'Super Game 2026',
      executablePath: exePath,
      classification: 'verified-game',
    });
    expect(added.id).toBeDefined();
    const gameId = added.id;

    // Record playtime
    db.startPlaytimeSession({
      sessionId: 'sess-super-1',
      gameId,
      startedAtIso: new Date(Date.now() - 7200_000).toISOString(),
      executablePath: exePath,
      source: 'maswitch-launch',
    });
    db.endPlaytimeSession('sess-super-1', new Date().toISOString(), 7200, 'completed');

    // 2. Remove game
    db.removeGameFromLibrary(gameId);
    expect(db.getAllLibraryGames().length).toBe(0);

    // 3. User manually adds it back with "+ Add Game"
    const reAdded = db.addCustomGame({
      title: 'Super Game 2026',
      executablePath: exePath,
      classification: 'verified-game',
    });

    expect(reAdded.id).toBe(gameId);
    const libraryAfter = db.getAllLibraryGames();
    expect(libraryAfter.length).toBe(1);
    expect(libraryAfter[0]!.id).toBe(gameId);
    expect(libraryAfter[0]!.playtimeHours).toBeCloseTo(2.0, 1);

    db.close();
  });

  it('explicitly restores removed games using restoreGameToLibrary', () => {
    const dir = createTempDir();
    const dbPath = path.join(dir, 'test-restore.sqlite');
    const db = new MaSwitchSqliteDatabase(dbPath);

    const exePath = path.join(dir, 'IndieGame.exe');
    fs.writeFileSync(exePath, 'binary content');

    const game = db.addCustomGame({
      title: 'Indie Game',
      executablePath: exePath,
    });

    // Remove
    db.removeGameFromLibrary(game.id);
    expect(db.getAllLibraryGames().length).toBe(0);
    expect(db.getRemovedGames().length).toBe(1);

    // Restore
    const restored = db.restoreGameToLibrary(game.id);
    expect(restored).toBe(true);
    expect(db.getAllLibraryGames().length).toBe(1);
    expect(db.getRemovedGames().length).toBe(0);

    db.close();
  });
});
