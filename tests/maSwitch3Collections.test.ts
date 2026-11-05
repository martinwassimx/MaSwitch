import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';

describe('MaSwitch 3.0: Smart Game Collections Test Suite', () => {
  let tempDir: string;
  let dbPath: string;
  let db: MaSwitchSqliteDatabase;
  let gameSteam1Id: string;
  let gameSteam2Id: string;
  let gameRiotId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-coll-test-'));
    dbPath = path.join(tempDir, 'maswitch-test.db');
    db = new MaSwitchSqliteDatabase(dbPath);

    const g1 = db.addCustomGame({
      title: 'Portal 2',
      platformId: 'steam',
      executablePath: 'C:\\Steam\\portal2.exe',
    });
    gameSteam1Id = g1.id;

    const g2 = db.addCustomGame({
      title: 'Half-Life: Alyx',
      platformId: 'steam',
      executablePath: 'C:\\Steam\\hlvr.exe',
    });
    gameSteam2Id = g2.id;

    const g3 = db.addCustomGame({
      title: 'Valorant',
      platformId: 'riot',
      executablePath: 'C:\\Riot\\Valorant.exe',
    });
    gameRiotId = g3.id;
  });

  afterEach(() => {
    db.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore temporary directory cleanup error
    }
  });

  it('creates and manages manual collections with custom order', () => {
    const coll = db.createCollection({
      name: 'Co-op Favorites',
      description: 'Best games to play with friends',
      icon: 'Heart',
      color: '#ec4899',
      isSmart: false,
      initialGameIds: [gameSteam1Id],
    });

    expect(coll.id).toBeDefined();
    expect(coll.name).toBe('Co-op Favorites');
    expect(coll.icon).toBe('Heart');
    expect(coll.color).toBe('#ec4899');
    expect(coll.isSmart).toBe(false);
    expect(coll.gameIds).toEqual([gameSteam1Id]);

    // Add another game
    const added = db.addGameToCollection(coll.id, gameRiotId);
    expect(added).toBe(true);

    let collections = db.getCollections();
    let found = collections.find((c) => c.id === coll.id);
    expect(found?.gameIds).toEqual([gameSteam1Id, gameRiotId]);

    // Set custom game order
    db.setCollectionGameOrder(coll.id, [gameRiotId, gameSteam1Id]);
    collections = db.getCollections();
    found = collections.find((c) => c.id === coll.id);
    expect(found?.gameIds).toEqual([gameRiotId, gameSteam1Id]);

    // Remove game
    const removed = db.removeGameFromCollection(coll.id, gameSteam1Id);
    expect(removed).toBe(true);
    collections = db.getCollections();
    found = collections.find((c) => c.id === coll.id);
    expect(found?.gameIds).toEqual([gameRiotId]);
  });

  it('evaluates smart collections with dynamic filtering rules', () => {
    // Smart collection 1: Steam games only
    const steamColl = db.createCollection({
      name: 'Steam Vault',
      isSmart: true,
      rules: {
        platformId: 'steam',
      },
    });

    // Smart collection 2: Favorites only
    const favsColl = db.createCollection({
      name: 'All Stars',
      isSmart: true,
      rules: {
        isFavorite: true,
      },
    });

    // Mark Portal 2 and Valorant as favorites
    db.toggleFavorite(gameSteam1Id);
    db.toggleFavorite(gameRiotId);

    const collections = db.getCollections(undefined, [gameSteam1Id, gameRiotId]);

    const steamFound = collections.find((c) => c.id === steamColl.id);
    expect(steamFound?.gameIds).toContain(gameSteam1Id);
    expect(steamFound?.gameIds).toContain(gameSteam2Id);
    expect(steamFound?.gameIds).not.toContain(gameRiotId);

    const favsFound = collections.find((c) => c.id === favsColl.id);
    expect(favsFound?.gameIds).toContain(gameSteam1Id);
    expect(favsFound?.gameIds).toContain(gameRiotId);
    expect(favsFound?.gameIds).not.toContain(gameSteam2Id);
  });

  it('updates collection metadata and rules cleanly', () => {
    const coll = db.createCollection({
      name: 'Old Name',
      icon: 'Folder',
      color: '#6366f1',
      isSmart: false,
    });

    const updated = db.updateCollection({
      id: coll.id,
      name: 'New Enhanced Name',
      icon: 'Flame',
      color: '#f97316',
      description: 'Updated collection description',
    });

    expect(updated).toBe(true);

    const found = db.getCollections().find((c) => c.id === coll.id);
    expect(found?.name).toBe('New Enhanced Name');
    expect(found?.icon).toBe('Flame');
    expect(found?.color).toBe('#f97316');
    expect(found?.description).toBe('Updated collection description');
  });

  it('deletes collection non-destructively without modifying underlying games', () => {
    const coll = db.createCollection({
      name: 'Temporary List',
      isSmart: false,
      initialGameIds: [gameSteam1Id, gameRiotId],
    });

    expect(db.getCollections().some((c) => c.id === coll.id)).toBe(true);

    const deleted = db.deleteCollection(coll.id);
    expect(deleted).toBe(true);

    // Verify collection is gone
    expect(db.getCollections().some((c) => c.id === coll.id)).toBe(false);

    // Verify underlying games are completely intact and untouched!
    const allGames = db.getAllLibraryGames(undefined, 'all');
    expect(allGames.some((g) => g.id === gameSteam1Id)).toBe(true);
    expect(allGames.some((g) => g.id === gameRiotId)).toBe(true);
  });
});
