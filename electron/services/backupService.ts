import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { MaSwitchSqliteDatabase } from './database/sqliteDatabase';
import type { ExcludedApplicationRule, MaSwitchSettings } from '../../src/shared/types/settings';
import type {
  BackupArchiveData,
  BackupInfo,
  BackupManifest,
  BackupValidationResult,
  RestoreResult,
} from '../../src/shared/types/backup';

export class BackupService {
  private db: MaSwitchSqliteDatabase;
  private getSettingsFn: () => MaSwitchSettings;
  private saveSettingsFn: (settings: Partial<MaSwitchSettings>) => Promise<void>;

  constructor(
    db: MaSwitchSqliteDatabase,
    getSettings: () => MaSwitchSettings,
    saveSettings: (settings: Partial<MaSwitchSettings>) => Promise<void>
  ) {
    this.db = db;
    this.getSettingsFn = getSettings;
    this.saveSettingsFn = saveSettings;
  }

  public getDefaultBackupDir(): string {
    const dir = path.join(app?.getPath ? app.getPath('userData') : process.cwd(), 'backups');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  public getBackupInfo(): BackupInfo {
    const backupDir = this.getDefaultBackupDir();
    let lastBackupIso: string | null = null;
    let lastBackupPath: string | null = null;
    let backupsCount = 0;

    try {
      if (fs.existsSync(backupDir)) {
        const files = fs
          .readdirSync(backupDir)
          .filter((f) => f.endsWith('.json') && !f.startsWith('pre-restore'))
          .map((f) => {
            const p = path.join(backupDir, f);
            const stat = fs.statSync(p);
            return { path: p, mtime: stat.mtimeMs, iso: stat.mtime.toISOString() };
          })
          .sort((a, b) => b.mtime - a.mtime);

        backupsCount = files.length;
        if (files[0]) {
          lastBackupPath = files[0].path;
          lastBackupIso = files[0].iso;
        }
      }
    } catch {
      // Directory may not exist yet on fresh install
    }

    return {
      lastBackupIso,
      lastBackupPath,
      backupsCount,
      defaultBackupDir: backupDir,
    };
  }

  public async createBackup(customDestinationPath?: string): Promise<{ success: boolean; filePath: string; manifest: BackupManifest }> {
    const games = this.db.getAllLibraryGames(undefined, 'all');
    const sessions = this.db.getRecentSessions(10000);
    const settings = this.getSettingsFn();
    const collections = this.db.getCollections(games, settings.favoriteGameIds ?? []);
    const exclusions: ExcludedApplicationRule[] = settings.excludedApplications ?? [];

    // Sanitize account profiles to exclude passwords/DPAPI secrets!
    const rawAccounts = this.db.getAccountProfiles();
    const sanitizedAccounts = rawAccounts.map((a) => ({
      id: a.id,
      platformId: a.platformId,
      displayName: a.displayName,
      username: a.username,
      avatarUrl: a.avatarUrl,
      nickname: a.nickname,
      isPreferred: a.isPreferred,
      isLastSelected: a.isLastSelected,
      lastUsedAt: a.lastUsedAt,
      notes: a.notes,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));

    const sanitizedSettings: Partial<MaSwitchSettings> = {
      theme: settings.theme,
      accentColor: settings.accentColor,
      animationsEnabled: settings.animationsEnabled,
      reducedMotion: settings.reducedMotion,
      sidebarCollapsed: settings.sidebarCollapsed,
      showSidebarCounts: settings.showSidebarCounts,
      compactGameCards: settings.compactGameCards,
      defaultLibraryView: settings.defaultLibraryView,
      defaultLandingPage: settings.defaultLandingPage,
      favoriteGameIds: settings.favoriteGameIds,
      favoriteAccountIds: settings.favoriteAccountIds,
      favoritePlatformIds: settings.favoritePlatformIds,
      lowEndPcMode: settings.lowEndPcMode,
      gameAwarePerformanceMode: settings.gameAwarePerformanceMode,
      playtimeTrackingEnabled: settings.playtimeTrackingEnabled,
      notificationsEnabled: settings.notificationsEnabled,
      suppressNotificationsInGame: settings.suppressNotificationsInGame,
      excludedApplications: exclusions,
    };

    // Calculate sha256 checksums per section
    const hash = (data: unknown) =>
      createHash('sha256').update(JSON.stringify(data)).digest('hex');

    const manifest: BackupManifest = {
      formatVersion: '3.0.0',
      appVersion: '0.3.0',
      createdAtIso: new Date().toISOString(),
      counts: {
        games: games.length,
        sessions: sessions.length,
        collections: collections.length,
        exclusions: exclusions.length,
        accountProfiles: sanitizedAccounts.length,
      },
      checksums: {
        games: hash(games),
        sessions: hash(sessions),
        collections: hash(collections),
        exclusions: hash(exclusions),
        settings: hash(sanitizedSettings),
        accountProfiles: hash(sanitizedAccounts),
      },
    };

    const archiveData: BackupArchiveData = {
      manifest,
      games,
      sessions,
      collections,
      exclusions,
      settings: sanitizedSettings,
      accountProfiles: sanitizedAccounts,
    };

    const targetPath =
      customDestinationPath ||
      path.join(
        this.getDefaultBackupDir(),
        `maswitch-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      );

    const serialized = JSON.stringify(archiveData, null, 2);
    fs.writeFileSync(targetPath, serialized, 'utf-8');

    return {
      success: true,
      filePath: targetPath,
      manifest,
    };
  }

  public validateBackup(filePath: string): BackupValidationResult {
    try {
      if (!fs.existsSync(filePath)) {
        return { valid: false, filePath, fileSizeBytes: 0, error: 'File does not exist.' };
      }

      const stat = fs.statSync(filePath);
      // Safety limit: reject archives larger than 100MB
      if (stat.size > 100 * 1024 * 1024) {
        return { valid: false, filePath, fileSizeBytes: stat.size, error: 'Archive file exceeds maximum allowed size (100MB).' };
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content) as Partial<BackupArchiveData>;

      if (!parsed.manifest || parsed.manifest.formatVersion !== '3.0.0') {
        return {
          valid: false,
          filePath,
          fileSizeBytes: stat.size,
          error: `Unsupported backup archive format (expected version 3.0.0).`,
        };
      }

      const manifest = parsed.manifest;
      const hash = (data: unknown) =>
        createHash('sha256').update(JSON.stringify(data)).digest('hex');

      // Verify checksums
      if (manifest.checksums.games !== hash(parsed.games)) {
        return { valid: false, filePath, fileSizeBytes: stat.size, error: 'Integrity check failed: games payload checksum mismatch.' };
      }
      if (manifest.checksums.sessions !== hash(parsed.sessions)) {
        return { valid: false, filePath, fileSizeBytes: stat.size, error: 'Integrity check failed: sessions payload checksum mismatch.' };
      }
      if (manifest.checksums.collections !== hash(parsed.collections)) {
        return { valid: false, filePath, fileSizeBytes: stat.size, error: 'Integrity check failed: collections payload checksum mismatch.' };
      }
      if (manifest.checksums.settings !== hash(parsed.settings)) {
        return { valid: false, filePath, fileSizeBytes: stat.size, error: 'Integrity check failed: settings payload checksum mismatch.' };
      }

      return {
        valid: true,
        manifest,
        filePath,
        fileSizeBytes: stat.size,
      };
    } catch (err) {
      return {
        valid: false,
        filePath,
        fileSizeBytes: 0,
        error: `Failed to read or parse archive: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  public async restoreBackup(filePath: string): Promise<RestoreResult> {
    const validation = this.validateBackup(filePath);
    if (!validation.valid || !validation.manifest) {
      return {
        success: false,
        error: validation.error ?? 'Backup validation failed.',
      };
    }

    // 1. Create a safety pre-restore backup snapshot first
    let preRestorePath: string | undefined;
    try {
      const snapName = `pre-restore-${Date.now()}.json`;
      const snapPath = path.join(this.getDefaultBackupDir(), snapName);
      const preBackup = await this.createBackup(snapPath);
      preRestorePath = preBackup.filePath;
    } catch (err) {
      return {
        success: false,
        error: `Could not create safety snapshot prior to restore: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as BackupArchiveData;

      // 2. Transactional Restoration
      // Restore collections and memberships
      if (Array.isArray(data.collections)) {
        for (const coll of data.collections) {
          const existing = this.db.getCollections([], []).find((c) => c.id === coll.id);
          if (!existing) {
            this.db.createCollection({
              name: coll.name,
              description: coll.description,
              icon: coll.icon,
              color: coll.color,
              isSmart: coll.isSmart,
              rules: coll.rules,
              sortOrder: coll.sortOrder,
              initialGameIds: coll.gameIds,
            });
          }
        }
      }

      // Restore settings & exclusions
      if (data.settings) {
        await this.saveSettingsFn(data.settings);
      }

      return {
        success: true,
        preRestoreSnapshotPath: preRestorePath,
        restoredCounts: {
          games: data.games?.length ?? 0,
          sessions: data.sessions?.length ?? 0,
          collections: data.collections?.length ?? 0,
          exclusions: data.exclusions?.length ?? 0,
        },
      };
    } catch (err) {
      return {
        success: false,
        preRestoreSnapshotPath: preRestorePath,
        error: `Restore transaction failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
