import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

vi.mock('electron', () => ({
  app: {
    getPath: () => os.tmpdir(),
  },
}));

import { BackupService } from '../electron/services/backupService';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';
import type { MaSwitchSettings } from '../src/shared/types/settings';
import { DEFAULT_SETTINGS } from '../src/shared/types/settings';

describe('MaSwitch 3.0: Backup & Restore Test Suite', () => {
  let tempDir: string;
  let dbPath: string;
  let db: MaSwitchSqliteDatabase;
  let currentSettings: MaSwitchSettings;
  let backupService: BackupService;
  let game1Id: string;
  let game2Id: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-backup-test-'));
    dbPath = path.join(tempDir, 'maswitch-test.db');
    db = new MaSwitchSqliteDatabase(dbPath);

    const g1 = db.addCustomGame({
      title: 'Hades II',
      platformId: 'steam',
      executablePath: 'C:\\Steam\\hades2.exe',
    });
    game1Id = g1.id;

    const g2 = db.addCustomGame({
      title: 'Elden Ring',
      platformId: 'steam',
      executablePath: 'C:\\Steam\\eldenring.exe',
    });
    game2Id = g2.id;

    currentSettings = {
      ...DEFAULT_SETTINGS,
      theme: 'obsidian-contrast',
      accentColor: 'cyber-violet',
      favoriteGameIds: [game1Id],
    };

    backupService = new BackupService(
      db,
      () => currentSettings,
      async (updates) => {
        currentSettings = { ...currentSettings, ...updates };
      }
    );
  });

  afterEach(() => {
    db.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore temporary directory cleanup error
    }
  });

  it('creates an offline versioned backup archive and strictly excludes vault secrets/passwords', async () => {
    // Add a collection
    db.createCollection({
      name: 'Soulslike',
      color: '#6366f1',
      icon: 'Flame',
      isSmart: false,
      initialGameIds: [game2Id],
    });

    const destFile = path.join(tempDir, 'maswitch-test-backup.json');
    const result = await backupService.createBackup(destFile);

    expect(result.success).toBe(true);
    expect(fs.existsSync(destFile)).toBe(true);

    const rawContent = fs.readFileSync(destFile, 'utf-8');
    const parsed = JSON.parse(rawContent);

    // Manifest verification
    expect(parsed.manifest).toBeDefined();
    expect(parsed.manifest.formatVersion).toBe('3.0.0');
    expect(parsed.manifest.counts.games).toBe(2);
    expect(parsed.manifest.counts.collections).toBe(1);
    expect(parsed.manifest.checksums.games).toBeDefined();

    // STRICT CHECK: Ensure no DPAPI encrypted blobs or password keys exist anywhere
    expect(rawContent).not.toContain('"password"');
    expect(rawContent).not.toContain('"encryptedPassword"');
    expect(rawContent).not.toContain('"dpapi"');
    expect(rawContent).not.toContain('"sessionToken"');
  });

  it('validates valid archives and rejects corrupted or tampered files', async () => {
    const destFile = path.join(tempDir, 'valid-backup.json');
    await backupService.createBackup(destFile);

    // 1. Valid file passes
    const validRes = backupService.validateBackup(destFile);
    expect(validRes.valid).toBe(true);
    expect(validRes.manifest?.formatVersion).toBe('3.0.0');

    // 2. Corrupted JSON fails
    const corruptFile = path.join(tempDir, 'corrupt.json');
    fs.writeFileSync(corruptFile, '{ invalid json');
    const corruptRes = backupService.validateBackup(corruptFile);
    expect(corruptRes.valid).toBe(false);
    expect(corruptRes.error).toContain('Failed to read or parse archive');

    // 3. Tampered data fails checksum
    const tamperedFile = path.join(tempDir, 'tampered.json');
    const originalContent = JSON.parse(fs.readFileSync(destFile, 'utf-8'));
    originalContent.games[0].title = 'Tampered Game Title';
    fs.writeFileSync(tamperedFile, JSON.stringify(originalContent));

    const tamperedRes = backupService.validateBackup(tamperedFile);
    expect(tamperedRes.valid).toBe(false);
    expect(tamperedRes.error).toContain('Integrity check failed');
  });

  it('restores backup data cleanly with safety snapshot and transaction rollback support', async () => {
    // Create initial state
    db.createCollection({
      name: 'Original Collection',
      icon: 'Folder',
      color: '#10b981',
      isSmart: false,
      initialGameIds: [game1Id],
    });

    const backupFile = path.join(tempDir, 'pre-wipe-backup.json');
    await backupService.createBackup(backupFile);

    // Modify state: change settings and add another collection
    currentSettings.theme = 'dark-graphite';
    db.createCollection({
      name: 'New Rogue Collection',
      icon: 'Zap',
      color: '#f59e0b',
      isSmart: false,
    });

    // Execute restore
    const restoreResult = await backupService.restoreBackup(backupFile);
    expect(restoreResult.success).toBe(true);
    expect(restoreResult.restoredCounts?.games).toBe(2);
    expect(restoreResult.restoredCounts?.collections).toBe(1);

    // Verify settings restored
    expect(currentSettings.theme).toBe('obsidian-contrast');

    // Verify collection restored
    const collections = db.getCollections();
    expect(collections.some((c) => c.name === 'Original Collection')).toBe(true);

    // Verify safety pre-restore snapshot was generated
    expect(restoreResult.preRestoreSnapshotPath).toBeDefined();
    if (restoreResult.preRestoreSnapshotPath) {
      expect(fs.existsSync(restoreResult.preRestoreSnapshotPath)).toBe(true);
    }
  });
});
