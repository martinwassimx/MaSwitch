import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Database } from 'node-sqlite3-wasm';
import type {
  CustomGameInput,
  EditGameInput,
  GameClassification,
  GameItem,
  GameLaunchMethod,
  GameSourceType,
} from '../../../src/shared/types/game';
import type {
  AccountProfile,
  AccountSwitchHistoryRecord,
  ActivePlatformProfile,
  CreateAccountProfileInput,
  GameAccountAssociation,
  UpdateAccountProfileInput,
} from '../../../src/shared/types/account';
import type { PlatformId } from '../../../src/shared/types/platform';
import type {
  DiscoveredGameCandidate,
  ScanResultSummary,
} from '../../../src/shared/types/scanner';
import type {
  DailyActivityPoint,
  MonthlyActivityPoint,
  PlatformPlaytimeBreakdown,
  PlaytimeSessionRecord,
  PlaytimeSessionSource,
  PlaytimeSessionStatus,
  StatisticsOverview,
} from '../../../src/shared/types/statistics';
import type {
  YearInReviewCalendarDay,
  YearInReviewComparison,
  YearInReviewData,
  YearInReviewDayOfWeekBreakdown,
  YearInReviewLongestSession,
  YearInReviewMonthBreakdown,
  YearInReviewTopGame,
} from '../../../src/shared/types/yearInReview';
import type {
  CollectionItem,
  CollectionSortOrder,
  CreateCollectionInput,
  SmartCollectionRules,
  UpdateCollectionInput,
} from '../../../src/shared/types/collection';
import {
  generateLocalGameCoverSvg,
  generateLocalGameHeroSvg,
} from '../../../src/shared/utils/proceduralCover';
import { detectEaAppGameInDirectory } from '../scanner/eaScanner';
import { resolveGameProcessAliases } from '../tracker/gameProcessAliases';

export interface MigrationDefinition {
  version: number;
  name: string;
  sql: string;
}

export const SQLITE_MIGRATIONS: readonly MigrationDefinition[] = [
  {
    version: 1,
    name: '001_initial_phase2_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS platforms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        vendor TEXT NOT NULL,
        category TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subtitle TEXT NOT NULL,
        platform_id TEXT NOT NULL,
        platform_name TEXT NOT NULL,
        source_type TEXT NOT NULL,
        external_app_id TEXT,
        developer TEXT NOT NULL,
        publisher TEXT NOT NULL,
        release_year INTEGER NOT NULL DEFAULT 2026,
        genres_json TEXT NOT NULL DEFAULT '[]',
        tags_json TEXT NOT NULL DEFAULT '[]',
        cover_image TEXT NOT NULL,
        hero_image TEXT NOT NULL,
        accent_hex TEXT NOT NULL DEFAULT '#38bdf8',
        short_description TEXT NOT NULL,
        confidence_score INTEGER NOT NULL DEFAULT 100,
        classification TEXT NOT NULL DEFAULT 'verified-game',
        metadata_available INTEGER NOT NULL DEFAULT 0,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(platform_id, external_app_id)
      );

      CREATE TABLE IF NOT EXISTS game_installations (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
        install_path TEXT,
        executable_path TEXT,
        executable_name TEXT,
        working_directory TEXT,
        launch_args TEXT,
        launch_method TEXT NOT NULL,
        launch_uri TEXT,
        is_installed INTEGER NOT NULL DEFAULT 1,
        install_size_bytes INTEGER NOT NULL DEFAULT 0,
        build_version TEXT NOT NULL DEFAULT 'Local',
        last_verified_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS library_ownership (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
        platform_id TEXT NOT NULL,
        account_label TEXT NOT NULL,
        license_type TEXT NOT NULL,
        drm_system TEXT NOT NULL,
        acquired_date TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_favorites (
        game_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS custom_applications (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
        executable_path TEXT NOT NULL,
        working_directory TEXT,
        launch_args TEXT,
        custom_cover_image TEXT,
        added_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS playtime_sessions (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        executable_path TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        last_heartbeat_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS game_metadata_cache (
        game_id TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
        description_json TEXT NOT NULL DEFAULT '[]',
        features_json TEXT NOT NULL DEFAULT '[]',
        screenshots_json TEXT NOT NULL DEFAULT '[]',
        trailers_json TEXT NOT NULL DEFAULT '[]',
        rating_json TEXT,
        requirements_json TEXT,
        achievements_json TEXT,
        cached_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scanner_history (
        scan_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        status TEXT NOT NULL,
        total_found INTEGER NOT NULL DEFAULT 0,
        added_or_updated INTEGER NOT NULL DEFAULT 0,
        duplicates_skipped INTEGER NOT NULL DEFAULT 0,
        reports_json TEXT NOT NULL DEFAULT '[]',
        errors_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE INDEX IF NOT EXISTS idx_games_platform ON games(platform_id);
      CREATE INDEX IF NOT EXISTS idx_games_title ON games(title);
      CREATE INDEX IF NOT EXISTS idx_installations_exe_name ON game_installations(executable_name);
      CREATE INDEX IF NOT EXISTS idx_installations_exe_path ON game_installations(executable_path);
      CREATE INDEX IF NOT EXISTS idx_sessions_game_started ON playtime_sessions(game_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON playtime_sessions(status);
    `,
  },
  {
    version: 2,
    name: '002_add_icon_image_column',
    sql: `
      ALTER TABLE games ADD COLUMN icon_image TEXT;
    `,
  },
  {
    version: 3,
    name: '003_add_user_platform_override',
    sql: `
      ALTER TABLE games ADD COLUMN user_platform_override TEXT DEFAULT NULL;
      ALTER TABLE games ADD COLUMN is_user_edited INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 4,
    name: '004_add_is_removed_and_steamgriddb_columns',
    sql: `
      ALTER TABLE games ADD COLUMN is_removed INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE games ADD COLUMN removed_at TEXT DEFAULT NULL;
      ALTER TABLE games ADD COLUMN hidden_at TEXT DEFAULT NULL;
      ALTER TABLE games ADD COLUMN logo_image TEXT DEFAULT NULL;
      ALTER TABLE games ADD COLUMN sgdb_game_id INTEGER DEFAULT NULL;
      ALTER TABLE games ADD COLUMN user_cover_override TEXT DEFAULT NULL;
      ALTER TABLE games ADD COLUMN user_hero_override TEXT DEFAULT NULL;
      ALTER TABLE games ADD COLUMN user_logo_override TEXT DEFAULT NULL;
      ALTER TABLE games ADD COLUMN user_icon_override TEXT DEFAULT NULL;
      ALTER TABLE games ADD COLUMN is_artwork_user_edited INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 5,
    name: '005_phase6_accounts_and_game_associations',
    sql: `
      CREATE TABLE IF NOT EXISTS account_profiles (
        id TEXT PRIMARY KEY,
        platform_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        username TEXT NOT NULL,
        avatar_url TEXT,
        nickname TEXT,
        is_preferred INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS game_account_associations (
        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES account_profiles(id) ON DELETE CASCADE,
        platform_id TEXT NOT NULL,
        assigned_at TEXT NOT NULL,
        PRIMARY KEY (game_id, platform_id)
      );

      CREATE TABLE IF NOT EXISTS account_switch_history (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES account_profiles(id) ON DELETE CASCADE,
        platform_id TEXT NOT NULL,
        switched_at TEXT NOT NULL,
        success INTEGER NOT NULL DEFAULT 1,
        method_used TEXT NOT NULL,
        details TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_accounts_platform ON account_profiles(platform_id);
      CREATE INDEX IF NOT EXISTS idx_accounts_preferred ON account_profiles(platform_id, is_preferred);
      CREATE INDEX IF NOT EXISTS idx_game_accounts_game ON game_account_associations(game_id);
      CREATE INDEX IF NOT EXISTS idx_game_accounts_account ON game_account_associations(account_id);
    `,
  },
  {
    version: 6,
    name: '006_performance_indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_games_is_hidden ON games(is_hidden);
      CREATE INDEX IF NOT EXISTS idx_games_external_app_id ON games(external_app_id);
      CREATE INDEX IF NOT EXISTS idx_installations_game_id ON game_installations(game_id);
      CREATE INDEX IF NOT EXISTS idx_account_switch_history_acc ON account_switch_history(account_id);
    `,
  },
  {
    version: 7,
    name: '007_platform_active_profiles',
    sql: `
      CREATE TABLE IF NOT EXISTS platform_active_profiles (
        platform_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES account_profiles(id) ON DELETE CASCADE,
        confirmed_at TEXT NOT NULL,
        verification_status TEXT NOT NULL DEFAULT 'user-confirmed'
      );

      CREATE INDEX IF NOT EXISTS idx_platform_active_profiles_acc ON platform_active_profiles(account_id);

      ALTER TABLE account_switch_history ADD COLUMN from_account_id TEXT;

      INSERT OR IGNORE INTO platform_active_profiles (platform_id, account_id, confirmed_at, verification_status)
      SELECT p.platform_id, p.id, p.last_used_at, 'user-confirmed'
      FROM account_profiles p
      INNER JOIN (
        SELECT platform_id, MAX(last_used_at) as max_used
        FROM account_profiles
        WHERE last_used_at IS NOT NULL
        GROUP BY platform_id
      ) latest ON p.platform_id = latest.platform_id AND p.last_used_at = latest.max_used;
    `,
  },
  {
    version: 8,
    name: '008_separate_account_selection',
    sql: `
      ALTER TABLE account_profiles ADD COLUMN is_last_selected INTEGER NOT NULL DEFAULT 0;
      UPDATE account_profiles SET is_last_selected = 1
      WHERE id IN (SELECT account_id FROM platform_active_profiles);

      CREATE UNIQUE INDEX idx_account_profiles_last_selected
        ON account_profiles(platform_id) WHERE is_last_selected = 1;

      UPDATE platform_active_profiles
      SET verification_status = CASE WHEN EXISTS (
        SELECT 1 FROM account_switch_history h
        WHERE h.account_id = platform_active_profiles.account_id AND h.success = 1
          AND (h.details LIKE 'User confirmed %' OR h.details LIKE 'Authentication verified via local Steam configuration%')
      ) THEN 'user-confirmed' ELSE 'unverified' END;
    `,
  },
  {
    version: 9,
    name: '009_game_collections',
    sql: `
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT NOT NULL DEFAULT 'Folder',
        color TEXT NOT NULL DEFAULT '#8B5CF6',
        is_smart INTEGER NOT NULL DEFAULT 0,
        rules_json TEXT,
        sort_order TEXT NOT NULL DEFAULT 'title-asc',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS collection_games (
        collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        added_at TEXT NOT NULL,
        custom_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (collection_id, game_id)
      );

      CREATE INDEX IF NOT EXISTS idx_collection_games_game ON collection_games(game_id);
      CREATE INDEX IF NOT EXISTS idx_collections_name ON collections(name);
    `,
  },
];

const PLATFORM_NAMES: Record<PlatformId, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  gog: 'GOG Galaxy',
  riot: 'Riot Games',
  ea: 'EA App',
  ubisoft: 'Ubisoft Connect',
  rockstar: 'Rockstar Games',
  discord: 'Discord',
  custom: 'Custom PC Game',
};

const PLATFORM_ACCENT_HEX: Record<PlatformId, string> = {
  steam: '#38bdf8',
  epic: '#a855f7',
  gog: '#c084fc',
  riot: '#f43f5e',
  ea: '#10b981',
  ubisoft: '#6366f1',
  rockstar: '#f59e0b',
  discord: '#818cf8',
  custom: '#06b6d4',
};

function slugifyId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function formatLastPlayedLabel(iso: string | null): string {
  if (!iso) {
    return 'Never played';
  }
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return 'Never played';
    }
    return date.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Never played';
  }
}

export interface InstalledExecutableMatcher {
  gameId: string;
  gameTitle: string;
  platformId: PlatformId;
  executablePath: string | null;
  executableNameLower: string;
  aliasesLower: string[];
  installPathLower: string | null;
}

export class MaSwitchSqliteDatabase {
  private db!: Database;
  private readonly dbFilePath: string;
  private corruptedBackupPath: string | null = null;
  private yearInReviewCache = new Map<string, YearInReviewData>();

  constructor(customFilePath: string) {
    this.dbFilePath = customFilePath;
    this.openAndInitialize();
  }

  public getDatabaseFilePath(): string {
    return this.dbFilePath;
  }

  public getCorruptedBackupPath(): string | null {
    return this.corruptedBackupPath;
  }

  private openAndInitialize(): void {
    if (this.dbFilePath !== ':memory:') {
      const dir = path.dirname(this.dbFilePath);
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      if (this.dbFilePath !== ':memory:' && fs.existsSync(this.dbFilePath)) {
        const stat = fs.statSync(this.dbFilePath);
        if (stat.size > 0) {
          const fd = fs.openSync(this.dbFilePath, 'r');
          const headerBuf = Buffer.alloc(16);
          fs.readSync(fd, headerBuf, 0, 16, 0);
          fs.closeSync(fd);
          if (!headerBuf.toString('utf8', 0, 15).startsWith('SQLite format 3')) {
            throw new Error('Invalid SQLite file header');
          }
        }
      }

      this.db = new Database(this.dbFilePath);
      const checkRow = this.db.get('PRAGMA integrity_check;') as {
        integrity_check?: string;
      } | null;

      if (
        checkRow &&
        checkRow.integrity_check &&
        checkRow.integrity_check.toLowerCase() !== 'ok'
      ) {
        throw new Error(`SQLite integrity check failed: ${checkRow.integrity_check}`);
      }

      // Verify file header by reading user_version
      this.db.get('PRAGMA user_version;');
    } catch {
      // Safe corruption handling: backup the corrupted database file without destroying it
      try {
        if (this.db?.isOpen) {
          this.db.close();
        }
      } catch {
        // Ignore close error
      }

      if (this.dbFilePath !== ':memory:' && fs.existsSync(this.dbFilePath)) {
        const backupPath = `${this.dbFilePath}.corrupted-${Date.now()}.bak`;
        try {
          fs.renameSync(this.dbFilePath, backupPath);
          this.corruptedBackupPath = backupPath;
        } catch {
          // If locked, fallback to in-memory or new file
        }
      }

      this.db = new Database(this.dbFilePath);
    }

    this.db.exec('PRAGMA foreign_keys = ON;');
    this.runMigrations();
    this.seedBasePlatforms();
    this.reconcileExistingLibraryPlatforms();
  }

  public close(): void {
    if (this.db && this.db.isOpen) {
      this.db.close();
    }
  }

  public withTransaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (error) {
      try {
        if (this.db.inTransaction) {
          this.db.exec('ROLLBACK;');
        }
      } catch {
        // Ignore rollback failure
      }
      throw error;
    }
  }

  public getSchemaVersion(): number {
    const row = this.db.get('PRAGMA user_version;') as {
      user_version?: number;
    } | null;
    return Number(row?.user_version ?? 0);
  }

  private runMigrations(): void {
    const currentVersion = this.getSchemaVersion();

    for (const migration of SQLITE_MIGRATIONS) {
      if (migration.version > currentVersion) {
        this.withTransaction(() => {
          this.db.exec(migration.sql);
          this.db.run(
            'INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
            [migration.version, migration.name, new Date().toISOString()]
          );
          this.db.exec(`PRAGMA user_version = ${migration.version};`);
        });
      }
    }
  }

  private seedBasePlatforms(): void {
    const now = new Date().toISOString();
    const basePlatforms: Array<[PlatformId, string, string, string]> = [
      ['steam', 'Steam', 'Valve Corporation', 'game-launcher'],
      ['epic', 'Epic Games', 'Epic Games, Inc.', 'game-launcher'],
      ['gog', 'GOG Galaxy', 'GOG.com', 'game-launcher'],
      ['riot', 'Riot Games', 'Riot Games, Inc.', 'game-launcher'],
      ['ea', 'EA App', 'Electronic Arts', 'game-launcher'],
      ['ubisoft', 'Ubisoft Connect', 'Ubisoft Entertainment', 'game-launcher'],
      ['rockstar', 'Rockstar Games', 'Rockstar Games', 'game-launcher'],
      ['discord', 'Discord', 'Discord Inc.', 'social-platform'],
      ['custom', 'Custom PC Game', 'Local Windows Executable', 'custom-executable'],
    ];

    this.withTransaction(() => {
      for (const [id, name, vendor, category] of basePlatforms) {
        this.db.run(
          `INSERT OR IGNORE INTO platforms (id, name, vendor, category, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [id, name, vendor, category, now]
        );
      }
    });
  }

  /**
   * Reconciles existing database records with verified official launcher installation evidence.
   * Runs safely on startup and preserves all playtime, statistics, and user favorites.
   * If a user has manually set a platform override, it is preserved.
   */
  public reconcileExistingLibraryPlatforms(): number {
    let reconciledCount = 0;

    const rows = this.db.all(`
      SELECT
        g.id,
        g.title,
        g.platform_id,
        g.user_platform_override,
        g.is_user_edited,
        i.install_path,
        i.executable_path,
        i.executable_name
      FROM games g
      LEFT JOIN game_installations i ON i.game_id = g.id
    `) as Array<{
      id: string;
      title: string;
      platform_id: string;
      user_platform_override?: string | null;
      is_user_edited?: number;
      install_path?: string | null;
      executable_path?: string | null;
      executable_name?: string | null;
    }>;

    const now = new Date().toISOString();

    this.withTransaction(() => {
      for (const row of rows) {
        // If user explicitly edited this game or set a platform override, preserve it
        if (row.user_platform_override || row.is_user_edited === 1) {
          continue;
        }

        // Check if this game is currently marked as custom (or non-EA) but has genuine EA manifests on disk
        const installDir =
          row.install_path ||
          (row.executable_path ? path.dirname(row.executable_path) : null);

        if (!installDir || !fs.existsSync(installDir)) {
          continue;
        }

        const eaCandidate = detectEaAppGameInDirectory(installDir);
        if (eaCandidate && row.platform_id !== 'ea') {
          const newTitle =
            row.title.toLowerCase().replace(/[^a-z0-9]/g, '') ===
            eaCandidate.title.toLowerCase().replace(/[^a-z0-9]/g, '')
              ? eaCandidate.title
              : row.title;
          const accentHex = PLATFORM_ACCENT_HEX.ea;
          const subtitle = eaCandidate.subtitle ?? 'EA App Local Installation';
          const coverImage = generateLocalGameCoverSvg(newTitle, 'ea', subtitle);
          const heroImage = generateLocalGameHeroSvg(newTitle, 'ea');

          // Update game record preserving id, playtime, favorites
          this.db.run(
            `UPDATE games
             SET platform_id = 'ea',
                 platform_name = 'EA App',
                 title = ?,
                 subtitle = ?,
                 developer = COALESCE(?, developer),
                 publisher = COALESCE(?, publisher),
                 external_app_id = COALESCE(?, external_app_id),
                 accent_hex = ?,
                 is_hidden = 0,
                 cover_image = CASE WHEN cover_image LIKE 'data:image/svg+xml%' THEN ? ELSE cover_image END,
                 hero_image = CASE WHEN hero_image LIKE 'data:image/svg+xml%' THEN ? ELSE hero_image END,
                 updated_at = ?
             WHERE id = ?`,
            [
              newTitle,
              subtitle,
              eaCandidate.developer,
              eaCandidate.publisher,
              eaCandidate.externalAppId,
              accentHex,
              coverImage,
              heroImage,
              now,
              row.id,
            ]
          );

          // Update library ownership
          this.db.run(
            `UPDATE library_ownership
             SET platform_id = 'ea',
                 account_label = 'EA App • Local System Detection',
                 drm_system = 'EA App Local Client'
             WHERE game_id = ?`,
            [row.id]
          );

          // Update game installation with verified EA executable / launch method if available
          if (eaCandidate.executablePath) {
            this.db.run(
              `UPDATE game_installations
               SET executable_path = ?,
                   executable_name = ?,
                   launch_method = ?,
                   launch_uri = ?
               WHERE game_id = ?`,
              [
                eaCandidate.executablePath,
                eaCandidate.executableName,
                eaCandidate.launchMethod,
                eaCandidate.launchUri,
                row.id,
              ]
            );
          }

          reconciledCount += 1;
        }
      }
    });

    return reconciledCount;
  }

  /**
   * Batch upserts discovered game installations inside a single transaction.
   * Preserves user-hidden state and never duplicates `(platform_id, external_app_id)`.
   */
  public upsertDiscoveredGames(
    candidates: readonly DiscoveredGameCandidate[]
  ): number {
    if (candidates.length === 0) {
      return 0;
    }

    const now = new Date().toISOString();
    let affected = 0;

    this.withTransaction(() => {
      for (const item of candidates) {
        const externalId =
          item.externalAppId ??
          item.executablePath?.toLowerCase() ??
          item.installPath?.toLowerCase() ??
          slugifyId(item.title);

        const cleanPath = (p?: string | null) =>
          p ? path.normalize(p).replace(/[/\\]+$/, '').toLowerCase() : '';
        const normInstall = cleanPath(item.installPath);
        const normExe = cleanPath(item.executablePath);

        // 1. Direct platform + external_app_id match (case-insensitive)
        let existingRow = this.db.get(
          `SELECT id, platform_id, is_hidden, user_platform_override
           FROM games
           WHERE platform_id = ? AND LOWER(external_app_id) = LOWER(?)`,
          [item.platformId, externalId]
        ) as {
          id?: string;
          platform_id?: string;
          is_hidden?: number;
          user_platform_override?: string | null;
        } | null;

        // 2. Cross-platform external_app_id match (e.g. if platform changed between custom and official launcher)
        if (!existingRow && externalId) {
          existingRow = this.db.get(
            `SELECT id, platform_id, is_hidden, user_platform_override
             FROM games
             WHERE LOWER(external_app_id) = LOWER(?)`,
            [externalId]
          ) as typeof existingRow;
        }

        // 3. Path-based lookup: check if installation exists under another platform or slash formatting
        if (!existingRow && (normInstall || normExe)) {
          const pathMatch = this.db.get(
            `SELECT g.id, g.platform_id, g.is_hidden, g.user_platform_override
             FROM games g
             JOIN game_installations i ON i.game_id = g.id
             WHERE (? != '' AND i.install_path IS NOT NULL AND LOWER(REPLACE(RTRIM(i.install_path, '/\\'), '/', '\\')) = ?)
                OR (? != '' AND i.executable_path IS NOT NULL AND LOWER(REPLACE(RTRIM(i.executable_path, '/\\'), '/', '\\')) = ?)
             LIMIT 1`,
            [normInstall, normInstall, normExe, normExe]
          ) as typeof existingRow;

          if (pathMatch) {
            existingRow = pathMatch;
          }
        }

        // 4. Exact title-based reconciliation for hidden/removed games or platform upgrade
        if (!existingRow && item.title) {
          const titleMatch = this.db.get(
            `SELECT id, platform_id, is_hidden, user_platform_override
             FROM games
             WHERE LOWER(TRIM(title)) = LOWER(TRIM(?))
               AND (platform_id = ? OR platform_id = 'custom' OR ? = 'custom')
             LIMIT 1`,
            [item.title, item.platformId, item.platformId]
          ) as typeof existingRow;

          if (titleMatch) {
            existingRow = titleMatch;
          }
        }

        const effectivePlatformId: PlatformId =
          (existingRow?.user_platform_override as PlatformId) || item.platformId;
        const effectivePlatformName =
          PLATFORM_NAMES[effectivePlatformId] ?? item.platformName;
        const accentHex =
          PLATFORM_ACCENT_HEX[effectivePlatformId] ?? '#38bdf8';

        const gameId =
          existingRow?.id ??
          `${item.platformId}-${slugifyId(item.title)}-${slugifyId(externalId).slice(-10)}`;

        const subtitle =
          item.subtitle ?? `${effectivePlatformName} Local Installation`;
        const coverImage =
          item.coverImage && item.coverImage.trim().length > 0
            ? item.coverImage.trim()
            : generateLocalGameCoverSvg(
                item.title,
                effectivePlatformId,
                subtitle
              );
        const heroImage =
          item.heroImage && item.heroImage.trim().length > 0
            ? item.heroImage.trim()
            : generateLocalGameHeroSvg(
                item.title,
                effectivePlatformId
              );
        const iconImage = item.iconImage ?? null;

        const shortDescription = item.installPath
          ? `Detected local ${effectivePlatformName} installation at ${item.installPath}.`
          : `Detected ${effectivePlatformName} title (${item.title}).`;

        const genresJson = JSON.stringify([
          item.classification === 'custom-app'
            ? 'Custom Application'
            : 'PC Game',
          effectivePlatformName,
        ]);
        const tagsJson = JSON.stringify([
          'Local Installation',
          item.launchMethod === 'steam-protocol'
            ? 'Steam Protocol'
            : item.launchMethod === 'epic-protocol'
              ? 'Epic Protocol'
              : 'Direct Executable',
        ]);

        if (!existingRow) {
          this.db.run(
            `INSERT INTO games (
              id, title, subtitle, platform_id, platform_name, source_type,
              external_app_id, developer, publisher, release_year,
              genres_json, tags_json, cover_image, hero_image, icon_image, accent_hex,
              short_description, confidence_score, classification,
              metadata_available, is_hidden, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
            [
              gameId,
              item.title,
              subtitle,
              effectivePlatformId,
              effectivePlatformName,
              item.sourceType ?? 'local-executable',
              externalId ?? null,
              item.developer ?? 'Unknown Developer',
              item.publisher ?? 'Unknown Publisher',
              new Date().getFullYear(),
              genresJson,
              tagsJson,
              coverImage,
              heroImage,
              iconImage,
              accentHex,
              shortDescription,
              item.confidenceScore ?? 1.0,
              item.classification ?? 'standard-game',
              now,
              now,
            ]
          );
        } else {
          this.db.run(
            `UPDATE games
             SET title = ?, subtitle = ?, platform_id = ?, platform_name = ?, accent_hex = ?,
                 is_hidden = 0, updated_at = ?, confidence_score = ?,
                 cover_image = CASE
                   WHEN is_artwork_user_edited = 1 THEN cover_image
                   WHEN cover_image LIKE 'maswitch-asset:%' THEN cover_image
                   WHEN ? IS NOT NULL THEN ?
                   ELSE cover_image
                 END,
                 hero_image = CASE
                   WHEN is_artwork_user_edited = 1 THEN hero_image
                   WHEN hero_image LIKE 'maswitch-asset:%' THEN hero_image
                   WHEN ? IS NOT NULL THEN ?
                   ELSE hero_image
                 END,
                 icon_image = CASE
                   WHEN is_artwork_user_edited = 1 THEN icon_image
                   WHEN icon_image LIKE 'maswitch-asset:%' THEN icon_image
                   WHEN ? IS NOT NULL THEN ?
                   ELSE icon_image
                 END
             WHERE id = ?`,
            [
              item.title,
              subtitle,
              effectivePlatformId,
              effectivePlatformName,
              accentHex,
              now,
              item.confidenceScore ?? 1.0,
              item.coverImage ?? null,
              item.coverImage ?? null,
              item.heroImage ?? null,
              item.heroImage ?? null,
              item.iconImage ?? null,
              item.iconImage ?? null,
              gameId,
            ]
          );
        }

        // Upsert game_installations
        this.db.run(
          `INSERT INTO game_installations (
            id, game_id, install_path, executable_path, executable_name,
            working_directory, launch_args, launch_method, launch_uri,
            is_installed, install_size_bytes, build_version, last_verified_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(game_id) DO UPDATE SET
            install_path = excluded.install_path,
            executable_path = COALESCE(excluded.executable_path, game_installations.executable_path),
            executable_name = COALESCE(excluded.executable_name, game_installations.executable_name),
            working_directory = COALESCE(excluded.working_directory, game_installations.working_directory),
            launch_method = excluded.launch_method,
            launch_uri = excluded.launch_uri,
            is_installed = excluded.is_installed,
            install_size_bytes = CASE WHEN excluded.install_size_bytes > 0 THEN excluded.install_size_bytes ELSE game_installations.install_size_bytes END,
            build_version = excluded.build_version,
            last_verified_at = excluded.last_verified_at`,
          [
            `inst-${gameId}`,
            gameId,
            item.installPath ?? null,
            item.executablePath ?? null,
            item.executableName ?? null,
            item.workingDirectory ?? null,
            item.launchArgs ?? null,
            item.launchMethod ?? 'direct-executable',
            item.launchUri ?? null,
            (item.isInstalled ?? true) ? 1 : 0,
            item.installSizeBytes ?? 0,
            item.buildVersion ?? '1.0.0',
            now,
          ]
        );

        // Upsert library_ownership
        this.db.run(
          `INSERT INTO library_ownership (
            id, game_id, platform_id, account_label, license_type, drm_system, acquired_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(game_id) DO UPDATE SET
            platform_id = excluded.platform_id,
            account_label = excluded.account_label,
            drm_system = excluded.drm_system`,
          [
            `own-${gameId}`,
            gameId,
            effectivePlatformId,
            `${effectivePlatformName} • Local System Detection`,
            'Local Installed Manifest',
            `${effectivePlatformName} Local Client`,
            now.slice(0, 10),
          ]
        );

        affected += 1;
      }
    });

    return affected;
  }

  /**
   * Manually adds or updates a user-selected custom executable game or application.
   */
  public addCustomGame(input: CustomGameInput): GameItem {
    const title = input.title?.trim();
    const exePathRaw = input.executablePath?.trim();

    if (!title || title.length === 0) {
      throw new Error('Custom game display name is required.');
    }
    if (!exePathRaw || !exePathRaw.toLowerCase().endsWith('.exe')) {
      throw new Error('A valid Windows executable (.exe) path is required.');
    }

    const normalizedExe = path.normalize(exePathRaw);
    const exeName = path.basename(normalizedExe);
    const workingDir = input.workingDirectory?.trim()
      ? path.normalize(input.workingDirectory.trim())
      : path.dirname(normalizedExe);
    const launchArgs = input.launchArgs?.trim() || null;
    const platformId: PlatformId = input.platformId ?? 'custom';
    const platformName = PLATFORM_NAMES[platformId] ?? 'Custom PC Game';
    const classification: GameClassification =
      input.classification ?? 'verified-game';

    let fileSizeBytes = 0;
    let fileExists = false;
    try {
      const st = fs.statSync(normalizedExe);
      fileExists = st.isFile();
      fileSizeBytes = st.size;
    } catch {
      fileExists = false;
    }

    const externalId = normalizedExe.toLowerCase();
    const now = new Date().toISOString();

    let targetGameId = '';

    this.withTransaction(() => {
      const existing = this.db.get(
        `SELECT id FROM games
         WHERE (platform_id = ? AND LOWER(external_app_id) = LOWER(?))
            OR LOWER(external_app_id) = LOWER(?)
            OR LOWER(TRIM(title)) = LOWER(TRIM(?))
         LIMIT 1`,
        [platformId, externalId, externalId, title]
      ) as { id?: string } | null;

      targetGameId =
        existing?.id ?? `custom-${slugifyId(title)}-${Date.now().toString(36)}`;

      const subtitle =
        classification === 'custom-app'
          ? `Custom Application (${exeName})`
          : `Custom Executable (${exeName})`;

      const coverImage =
        input.coverImage && input.coverImage.trim().length > 0
          ? input.coverImage.trim()
          : generateLocalGameCoverSvg(title, platformId, subtitle);

      const heroImage = generateLocalGameHeroSvg(title, platformId);
      const accentHex = PLATFORM_ACCENT_HEX[platformId] ?? '#06b6d4';

      this.db.run(
        `INSERT INTO games (
          id, title, subtitle, platform_id, platform_name, source_type,
          external_app_id, developer, publisher, release_year,
          genres_json, tags_json, cover_image, hero_image, accent_hex,
          short_description, confidence_score, classification,
          metadata_available, is_hidden, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'custom-manual', ?, 'Custom Executable', 'Local PC', ?, ?, ?, ?, ?, ?, ?, 100, ?, 0, 0, ?, ?)
        ON CONFLICT(platform_id, external_app_id) DO UPDATE SET
          title = excluded.title,
          subtitle = excluded.subtitle,
          cover_image = excluded.cover_image,
          classification = excluded.classification,
          is_hidden = 0,
          updated_at = excluded.updated_at`,
        [
          targetGameId,
          title,
          subtitle,
          platformId,
          platformName,
          externalId,
          new Date().getFullYear(),
          JSON.stringify([
            classification === 'custom-app' ? 'Custom Application' : 'Custom Game',
          ]),
          JSON.stringify(['Manual Executable', exeName]),
          coverImage,
          heroImage,
          accentHex,
          `Manually added Windows executable at ${normalizedExe}.`,
          classification,
          now,
          now,
        ]
      );

      this.db.run(
        `INSERT INTO game_installations (
          id, game_id, install_path, executable_path, executable_name,
          working_directory, launch_args, launch_method, launch_uri,
          is_installed, install_size_bytes, build_version, last_verified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'executable', NULL, ?, ?, 'Custom', ?)
        ON CONFLICT(game_id) DO UPDATE SET
          install_path = excluded.install_path,
          executable_path = excluded.executable_path,
          executable_name = excluded.executable_name,
          working_directory = excluded.working_directory,
          launch_args = excluded.launch_args,
          is_installed = excluded.is_installed,
          install_size_bytes = excluded.install_size_bytes,
          last_verified_at = excluded.last_verified_at`,
        [
          `inst-${targetGameId}`,
          targetGameId,
          workingDir,
          normalizedExe,
          exeName,
          workingDir,
          launchArgs,
          fileExists ? 1 : 0,
          fileSizeBytes,
          now,
        ]
      );

      this.db.run(
        `INSERT INTO custom_applications (
          id, game_id, executable_path, working_directory, launch_args, custom_cover_image, added_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(game_id) DO UPDATE SET
          executable_path = excluded.executable_path,
          working_directory = excluded.working_directory,
          launch_args = excluded.launch_args,
          custom_cover_image = excluded.custom_cover_image`,
        [
          `cust-${targetGameId}`,
          targetGameId,
          normalizedExe,
          workingDir,
          launchArgs,
          input.coverImage ?? null,
          now,
        ]
      );

      this.db.run(
        `INSERT INTO library_ownership (
          id, game_id, platform_id, account_label, license_type, drm_system, acquired_date
        ) VALUES (?, ?, ?, 'Local Windows User', 'Custom Executable Entry', 'None (Direct Executable)', ?)
        ON CONFLICT(game_id) DO NOTHING`,
        [`own-${targetGameId}`, targetGameId, platformId, now.slice(0, 10)]
      );
    });

    const created = this.getGameById(targetGameId);
    if (!created) {
      throw new Error('Failed to retrieve newly created custom game.');
    }
    return created;
  }

  /**
   * Removes a game from MaSwitch's library view without deleting or modifying any files on disk.
   */
  public removeGameFromLibrary(gameId: string): boolean {
    const res = this.db.run(
      'UPDATE games SET is_hidden = 1, updated_at = ? WHERE id = ?',
      [new Date().toISOString(), gameId]
    );
    return res.changes > 0;
  }

  /**
   * Restores a previously removed game back to MaSwitch's active library view.
   */
  public restoreGameToLibrary(gameId: string): boolean {
    const res = this.db.run(
      'UPDATE games SET is_hidden = 0, updated_at = ? WHERE id = ?',
      [new Date().toISOString(), gameId]
    );
    return res.changes > 0;
  }

  /**
   * Retrieves all user-removed / hidden games.
   */
  public getRemovedGames(): GameItem[] {
    return this.getAllLibraryGames(undefined, 'hidden-only');
  }

  /**
   * Updates game metadata, executable paths, or platform override based on user manual edits.
   * Sets `is_user_edited = 1` and persists user overrides across rescans.
   */
  public updateGameDetails(gameId: string, input: EditGameInput): GameItem | null {
    const existing = this.getGameById(gameId);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const newTitle = input.title?.trim() || existing.title;
    const newPlatformId: PlatformId = input.platformId ?? existing.platformId;
    const platformChanged = newPlatformId !== existing.platformId;
    const titleChanged = newTitle !== existing.title;

    const newPlatformName = PLATFORM_NAMES[newPlatformId] ?? existing.platformName;
    const newAccentHex = PLATFORM_ACCENT_HEX[newPlatformId] ?? existing.accentHex;

    let newExePath = existing.executablePath;
    let newExeName = existing.executableName;
    let newWorkingDir = existing.workingDirectory;
    if (input.executablePath && input.executablePath.trim().length > 0) {
      newExePath = path.normalize(input.executablePath.trim());
      newExeName = path.basename(newExePath);
      newWorkingDir = path.dirname(newExePath);
    }

    let newInstallPath = existing.installPath;
    if (input.installPath && input.installPath.trim().length > 0) {
      newInstallPath = path.normalize(input.installPath.trim());
    }

    this.withTransaction(() => {
      // Procedural SVG updates if needed
      let coverImage = existing.coverImage;
      let heroImage = existing.heroBackgroundImage;
      if (
        (platformChanged || titleChanged) &&
        existing.coverImage.startsWith('data:image/svg+xml')
      ) {
        coverImage = generateLocalGameCoverSvg(
          newTitle,
          newPlatformId,
          `${newPlatformName} Local Installation`
        );
        heroImage = generateLocalGameHeroSvg(newTitle, newPlatformId);
      }

      const userOverride = input.platformId ? input.platformId : existing.userPlatformOverride ?? null;

      this.db.run(
        `UPDATE games
         SET title = ?,
             platform_id = ?,
             platform_name = ?,
             accent_hex = ?,
             cover_image = ?,
             hero_image = ?,
             user_platform_override = ?,
             is_user_edited = 1,
             updated_at = ?
         WHERE id = ?`,
        [
          newTitle,
          newPlatformId,
          newPlatformName,
          newAccentHex,
          coverImage,
          heroImage,
          userOverride,
          now,
          gameId,
        ]
      );

      this.db.run(
        `UPDATE game_installations
         SET executable_path = ?,
             executable_name = ?,
             working_directory = ?,
             install_path = ?,
             last_verified_at = ?
         WHERE game_id = ?`,
        [
          newExePath ?? null,
          newExeName ?? null,
          newWorkingDir ?? null,
          newInstallPath ?? null,
          now,
          gameId,
        ]
      );

      this.db.run(
        `UPDATE library_ownership
         SET platform_id = ?,
             account_label = ?,
             drm_system = ?
         WHERE game_id = ?`,
        [
          newPlatformId,
          `${newPlatformName} • User Configured`,
          `${newPlatformName} Client`,
          gameId,
        ]
      );
    });

    return this.getGameById(gameId);
  }

  /**
   * Updates game artwork (cover, hero, logo, icon, and SteamGridDB metadata).
   * If isUserEdited is true, locks manual selections across automatic rescans.
   */
  public updateGameArtwork(input: {
    gameId: string;
    sgdbGameId?: number;
    coverUrl?: string;
    heroUrl?: string;
    logoUrl?: string;
    iconUrl?: string;
    isUserEdited: boolean;
  }): boolean {
    const existing = this.getGameById(input.gameId);
    if (!existing) {
      return false;
    }

    const now = new Date().toISOString();
    const newCover = input.coverUrl || existing.coverImage;
    const newHero = input.heroUrl || existing.heroBackgroundImage;
    const newLogo = input.logoUrl !== undefined ? input.logoUrl : existing.logoImage;
    const newIcon = input.iconUrl !== undefined ? input.iconUrl : existing.iconImage;
    const sgdbId = input.sgdbGameId !== undefined ? input.sgdbGameId : (existing.sgdbGameId ?? null);

    const isEdited = input.isUserEdited ? 1 : existing.isArtworkUserEdited ? 1 : 0;
    const userCover = input.isUserEdited && input.coverUrl ? input.coverUrl : existing.userCoverOverride ?? null;
    const userHero = input.isUserEdited && input.heroUrl ? input.heroUrl : existing.userHeroOverride ?? null;
    const userLogo = input.isUserEdited && input.logoUrl ? input.logoUrl : existing.userLogoOverride ?? null;
    const userIcon = input.isUserEdited && input.iconUrl ? input.iconUrl : existing.userIconOverride ?? null;

    const res = this.db.run(
      `UPDATE games
       SET cover_image = ?,
           hero_image = ?,
           logo_image = ?,
           icon_image = ?,
           sgdb_game_id = ?,
           user_cover_override = ?,
           user_hero_override = ?,
           user_logo_override = ?,
           user_icon_override = ?,
           is_artwork_user_edited = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        newCover,
        newHero,
        newLogo ?? null,
        newIcon ?? null,
        sgdbId ?? null,
        userCover,
        userHero,
        userLogo,
        userIcon,
        isEdited,
        now,
        input.gameId,
      ]
    );

    return res.changes > 0;
  }

  /**
   * Restores procedural SVG artwork or default state, clearing user overrides.
   */
  public restoreGameDefaultArtwork(gameId: string): boolean {
    const existing = this.getGameById(gameId);
    if (!existing) {
      return false;
    }

    const defaultCover = generateLocalGameCoverSvg(
      existing.title,
      existing.platformId,
      `${existing.platformName} Local Installation`
    );
    const defaultHero = generateLocalGameHeroSvg(existing.title, existing.platformId);
    const now = new Date().toISOString();

    const res = this.db.run(
      `UPDATE games
       SET cover_image = ?,
           hero_image = ?,
           logo_image = NULL,
           sgdb_game_id = NULL,
           user_cover_override = NULL,
           user_hero_override = NULL,
           user_logo_override = NULL,
           user_icon_override = NULL,
           is_artwork_user_edited = 0,
           updated_at = ?
       WHERE id = ?`,
      [defaultCover, defaultHero, now, gameId]
    );

    return res.changes > 0;
  }

  public syncInitialFavorites(favoriteIds: readonly string[]): void {
    const now = new Date().toISOString();
    this.withTransaction(() => {
      for (const id of favoriteIds) {
        if (typeof id === 'string' && id.trim().length > 0) {
          this.db.run(
            'INSERT OR IGNORE INTO user_favorites (game_id, created_at) VALUES (?, ?)',
            [id.trim(), now]
          );
        }
      }
    });
  }

  public getFavoriteGameIds(): string[] {
    const rows = this.db.all(
      'SELECT game_id FROM user_favorites ORDER BY created_at ASC'
    ) as Array<{ game_id: string }>;
    return rows.map((r) => String(r.game_id));
  }

  public toggleFavorite(gameId: string): {
    gameId: string;
    isFavorite: boolean;
    favoriteGameIds: string[];
  } {
    const existing = this.db.get(
      'SELECT game_id FROM user_favorites WHERE game_id = ?',
      [gameId]
    );

    if (existing) {
      this.db.run('DELETE FROM user_favorites WHERE game_id = ?', [gameId]);
    } else {
      this.db.run(
        'INSERT INTO user_favorites (game_id, created_at) VALUES (?, ?)',
        [gameId, new Date().toISOString()]
      );
    }

    return {
      gameId,
      isFavorite: !existing,
      favoriteGameIds: this.getFavoriteGameIds(),
    };
  }

  public getGameById(gameId: string): GameItem | null {
    const all = this.getAllLibraryGames(gameId);
    return all[0] ?? null;
  }

  public getAllLibraryGames(
    onlyGameId?: string,
    filterHidden: 'visible-only' | 'hidden-only' | 'all' = 'visible-only'
  ): GameItem[] {
    const twoWeeksAgoIso = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000
    ).toISOString();

    let whereClause = '';
    if (onlyGameId) {
      if (filterHidden === 'visible-only') {
        whereClause = 'WHERE g.id = ? AND g.is_hidden = 0';
      } else if (filterHidden === 'hidden-only') {
        whereClause = 'WHERE g.id = ? AND g.is_hidden = 1';
      } else {
        whereClause = 'WHERE g.id = ?';
      }
    } else {
      if (filterHidden === 'visible-only') {
        whereClause = 'WHERE g.is_hidden = 0';
      } else if (filterHidden === 'hidden-only') {
        whereClause = 'WHERE g.is_hidden = 1';
      } else {
        whereClause = '';
      }
    }
    const params = onlyGameId ? [twoWeeksAgoIso, onlyGameId] : [twoWeeksAgoIso];

    const rows = this.db.all(
      `SELECT
        g.id,
        g.title,
        g.subtitle,
        g.platform_id,
        g.platform_name,
        g.source_type,
        g.external_app_id,
        g.developer,
        g.publisher,
        g.release_year,
        g.genres_json,
        g.tags_json,
        g.cover_image,
        g.hero_image,
        g.icon_image,
        g.accent_hex,
        g.short_description,
        g.confidence_score,
        g.classification,
        g.metadata_available,
        g.created_at,
        g.user_platform_override,
        g.is_user_edited,
        g.logo_image,
        g.sgdb_game_id,
        g.user_cover_override,
        g.user_hero_override,
        g.user_logo_override,
        g.user_icon_override,
        g.is_artwork_user_edited,
        i.install_path,
        i.executable_path,
        i.executable_name,
        i.working_directory,
        i.launch_args,
        i.launch_method,
        i.launch_uri,
        i.is_installed,
        i.install_size_bytes,
        i.build_version,
        o.account_label,
        o.license_type,
        o.drm_system,
        o.acquired_date,
        COALESCE(
          (SELECT SUM(duration_seconds) FROM playtime_sessions ps WHERE ps.game_id = g.id),
          0
        ) AS total_seconds,
        COALESCE(
          (SELECT SUM(duration_seconds) FROM playtime_sessions ps WHERE ps.game_id = g.id AND ps.started_at >= ?),
          0
        ) AS recent_seconds,
        (SELECT MAX(started_at) FROM playtime_sessions ps WHERE ps.game_id = g.id) AS last_played_iso
      FROM games g
      LEFT JOIN game_installations i ON i.game_id = g.id
      LEFT JOIN library_ownership o ON o.game_id = g.id
      ${whereClause}
      ORDER BY total_seconds DESC, g.title ASC`,
      params
    ) as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const totalSeconds = Number(row.total_seconds ?? 0);
      const recentSeconds = Number(row.recent_seconds ?? 0);
      const playtimeHours = Math.round((totalSeconds / 3600) * 100) / 100;
      const recentTwoWeeksHours =
        Math.round((recentSeconds / 3600) * 100) / 100;
      const lastPlayedIso =
        typeof row.last_played_iso === 'string' ? row.last_played_iso : null;
      const installSizeBytes = Number(row.install_size_bytes ?? 0);
      const installSizeGb =
        Math.round((installSizeBytes / (1024 * 1024 * 1024)) * 100) / 100;

      const platformId = String(row.platform_id) as PlatformId;
      const installPath =
        typeof row.install_path === 'string' ? row.install_path : null;
      const executablePath =
        typeof row.executable_path === 'string' ? row.executable_path : null;
      const launchMethod = (row.launch_method ??
        'unavailable') as GameLaunchMethod;

      let genres: string[] = ['PC Game'];
      let tags: string[] = [];
      try {
        genres = JSON.parse(String(row.genres_json ?? '["PC Game"]')) as string[];
        tags = JSON.parse(String(row.tags_json ?? '[]')) as string[];
      } catch {
        // Keep defaults
      }

      return {
        id: String(row.id),
        title: String(row.title),
        subtitle: String(row.subtitle),
        platformId,
        platformName: String(row.platform_name),
        developer: String(row.developer),
        publisher: String(row.publisher),
        releaseYear: Number(row.release_year ?? 2026),
        releaseDateLabel: 'Local Manifest Record',
        genres,
        tags,
        isInstalled: Number(row.is_installed ?? 0) === 1,
        playtimeHours,
        recentTwoWeeksHours,
        lastPlayedIso,
        lastPlayedLabel: formatLastPlayedLabel(lastPlayedIso),
        coverImage: String(row.cover_image),
        iconImage:
          typeof row.icon_image === 'string' && row.icon_image.trim().length > 0
            ? row.icon_image
            : undefined,
        heroBackgroundImage: String(row.hero_image),
        accentHex: String(row.accent_hex ?? '#38bdf8'),
        shortDescription: String(row.short_description),
        fullDescription: [
          String(row.short_description),
          installPath
            ? `Installation directory verified at: ${installPath}`
            : 'Local installation path unavailable.',
          executablePath
            ? `Detected primary executable: ${executablePath}`
            : `Launch mechanism: ${launchMethod}`,
        ],
        keyFeatures: [
          `Source: ${String(row.platform_name)} (${String(row.source_type)})`,
          `Launch Method: ${launchMethod}`,
          executablePath
            ? `Tracked Executable: ${path.basename(executablePath)}`
            : 'Protocol-based Launcher Handoff',
        ],
        screenshots: [],
        trailers: [],
        rating: {
          overallScore: 0,
          userScore: 0,
          criticScore: 0,
          reviewSummary: 'Metadata Unavailable Offline',
          totalReviewsLabel: 'No Online Store Metadata Connected',
          ageRating: 'Unrated (Local Scan)',
          contentDescriptors: ['Local Installation'],
        },
        systemRequirements: {
          minimum: {
            os: 'Windows 10 / Windows 11 (64-bit)',
            processor: 'Metadata Unavailable Offline',
            memory: 'Metadata Unavailable Offline',
            graphics: 'Metadata Unavailable Offline',
            directX: 'Metadata Unavailable Offline',
            storage:
              installSizeGb > 0
                ? `${installSizeGb} GB on disk`
                : 'Local Disk Installation',
          },
          recommended: {
            os: 'Windows 10 / Windows 11 (64-bit)',
            processor: 'Metadata Unavailable Offline',
            memory: 'Metadata Unavailable Offline',
            graphics: 'Metadata Unavailable Offline',
            directX: 'Metadata Unavailable Offline',
            storage:
              installSizeGb > 0
                ? `${installSizeGb} GB on disk`
                : 'Local Disk Installation',
          },
        },
        ownership: {
          accountSlotLabel: String(
            row.account_label ?? `${String(row.platform_name)} Local Install`
          ),
          licenseType:
            (row.license_type as GameItem['ownership']['licenseType']) ??
            'Local Installed Manifest',
          acquiredDateLabel: String(row.acquired_date ?? 'Local Scan'),
          drmSystem: String(row.drm_system ?? String(row.platform_name)),
          installSizeGb,
          installLocationPreview:
            installPath ?? executablePath ?? 'Path Unavailable',
          buildVersion: String(row.build_version ?? 'Local'),
        },
        achievements: {
          supported: false,
          platformSource:
            platformId === 'steam'
              ? 'Steam Local Manifest (Metadata API Not Configured)'
              : 'Not Available',
          unlockedCount: 0,
          totalCount: 0,
          completionPercentage: 0,
          items: [],
        },
        isDemoData: false,
        sourceType: String(row.source_type) as GameSourceType,
        externalAppId:
          typeof row.external_app_id === 'string' ? row.external_app_id : null,
        installPath,
        executablePath,
        executableName:
          typeof row.executable_name === 'string' ? row.executable_name : null,
        workingDirectory:
          typeof row.working_directory === 'string'
            ? row.working_directory
            : null,
        launchArgs:
          typeof row.launch_args === 'string' ? row.launch_args : null,
        launchMethod,
        launchUri:
          typeof row.launch_uri === 'string' ? row.launch_uri : null,
        confidenceScore: Number(row.confidence_score ?? 100),
        classification: String(
          row.classification ?? 'verified-game'
        ) as GameClassification,
        metadataAvailable: Number(row.metadata_available ?? 0) === 1,
        userPlatformOverride:
          typeof row.user_platform_override === 'string' &&
          row.user_platform_override.trim().length > 0
            ? (row.user_platform_override as PlatformId)
            : null,
        isUserEdited: Number(row.is_user_edited ?? 0) === 1,
        logoImage:
          typeof row.logo_image === 'string' && row.logo_image.trim().length > 0
            ? row.logo_image
            : undefined,
        sgdbGameId:
          typeof row.sgdb_game_id === 'number'
            ? row.sgdb_game_id
            : null,
        userCoverOverride:
          typeof row.user_cover_override === 'string'
            ? row.user_cover_override
            : null,
        userHeroOverride:
          typeof row.user_hero_override === 'string'
            ? row.user_hero_override
            : null,
        userLogoOverride:
          typeof row.user_logo_override === 'string'
            ? row.user_logo_override
            : null,
        userIconOverride:
          typeof row.user_icon_override === 'string'
            ? row.user_icon_override
            : null,
        isArtworkUserEdited: Number(row.is_artwork_user_edited ?? 0) === 1,
      };
    });
  }

  /**
   * Returns all installed games with known executable names/paths for the background Playtime Tracker.
   */
  public getInstalledExecutableMatchers(): InstalledExecutableMatcher[] {
    const rows = this.db.all(
      `SELECT
        g.id AS game_id,
        g.title AS game_title,
        g.platform_id,
        i.executable_path,
        i.executable_name,
        i.install_path
      FROM games g
      INNER JOIN game_installations i ON i.game_id = g.id
      WHERE g.is_hidden = 0 AND i.is_installed = 1 AND i.executable_name IS NOT NULL`
    ) as Array<Record<string, unknown>>;

    return rows.map((r) => {
      const gameTitle = String(r.game_title);
      const platformId = String(r.platform_id) as PlatformId;
      const primaryExe = String(r.executable_name);
      const aliases = resolveGameProcessAliases(gameTitle, platformId, primaryExe);

      return {
        gameId: String(r.game_id),
        gameTitle,
        platformId,
        executablePath:
          typeof r.executable_path === 'string' ? r.executable_path : null,
        executableNameLower: primaryExe.toLowerCase(),
        aliasesLower: aliases,
        installPathLower:
          typeof r.install_path === 'string'
            ? path.normalize(r.install_path).toLowerCase()
            : null,
      };
    });
  }

  /**
   * Playtime Session Management
   */
  public startPlaytimeSession(params: {
    sessionId: string;
    gameId: string;
    executablePath: string;
    startedAtIso: string;
    source: PlaytimeSessionSource;
  }): void {
    this.db.run(
      `INSERT INTO playtime_sessions (
        id, game_id, executable_path, started_at, ended_at,
        duration_seconds, source, status, last_heartbeat_at
      ) VALUES (?, ?, ?, ?, NULL, 0, ?, 'active', ?)`,
      [
        params.sessionId,
        params.gameId,
        params.executablePath,
        params.startedAtIso,
        params.source,
        params.startedAtIso,
      ]
    );
    this.yearInReviewCache.clear();
  }

  public heartbeatPlaytimeSession(
    sessionId: string,
    durationSeconds: number,
    heartbeatIso: string
  ): void {
    this.db.run(
      `UPDATE playtime_sessions
       SET duration_seconds = ?, last_heartbeat_at = ?
       WHERE id = ? AND status = 'active'`,
      [Math.max(0, Math.floor(durationSeconds)), heartbeatIso, sessionId]
    );
  }

  public endPlaytimeSession(
    sessionId: string,
    endedAtIso: string,
    durationSeconds: number,
    finalStatus: PlaytimeSessionStatus = 'completed'
  ): void {
    this.db.run(
      `UPDATE playtime_sessions
       SET ended_at = ?, duration_seconds = ?, status = ?, last_heartbeat_at = ?
       WHERE id = ?`,
      [
        endedAtIso,
        Math.max(0, Math.floor(durationSeconds)),
        finalStatus,
        endedAtIso,
        sessionId,
      ]
    );
    this.yearInReviewCache.clear();
  }

  /**
   * On MaSwitch startup, recovers any sessions that were left 'active'
   * due to power loss or app restart, closing them at their last recorded heartbeat.
   */
  public recoverUnclosedSessionsOnStartup(): number {
    const activeRows = this.db.all(
      `SELECT id, started_at, last_heartbeat_at, duration_seconds
       FROM playtime_sessions
       WHERE status = 'active'`
    ) as Array<{
      id: string;
      started_at: string;
      last_heartbeat_at: string;
      duration_seconds: number;
    }>;

    if (activeRows.length === 0) {
      return 0;
    }

    this.withTransaction(() => {
      for (const row of activeRows) {
        const startMs = Date.parse(row.started_at) || Date.now();
        const hbMs = Date.parse(row.last_heartbeat_at) || startMs;
        const computedSec = Math.max(
          Number(row.duration_seconds ?? 0),
          Math.max(0, Math.floor((hbMs - startMs) / 1000))
        );

        this.db.run(
          `UPDATE playtime_sessions
           SET ended_at = ?, duration_seconds = ?, status = 'recovered-after-restart'
           WHERE id = ?`,
          [row.last_heartbeat_at, computedSec, row.id]
        );
      }
    });

    return activeRows.length;
  }

  public getRecentSessions(limit = 20): PlaytimeSessionRecord[] {
    const rows = this.db.all(
      `SELECT
        ps.id,
        ps.game_id,
        g.title AS game_title,
        g.platform_id,
        ps.executable_path,
        ps.started_at,
        ps.ended_at,
        ps.duration_seconds,
        ps.source,
        ps.status
      FROM playtime_sessions ps
      INNER JOIN games g ON g.id = ps.game_id
      ORDER BY ps.started_at DESC
      LIMIT ?`,
      [limit]
    ) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      gameId: String(r.game_id),
      gameTitle: String(r.game_title),
      platformId: String(r.platform_id) as PlatformId,
      executablePath: String(r.executable_path ?? ''),
      startedAtIso: String(r.started_at),
      endedAtIso: typeof r.ended_at === 'string' ? r.ended_at : null,
      durationSeconds: Number(r.duration_seconds ?? 0),
      source: String(r.source) as PlaytimeSessionSource,
      status: String(r.status) as PlaytimeSessionStatus,
    }));
  }

  /**
   * Computes real local statistics from recorded SQLite `playtime_sessions`.
   * Supports optional historical exclusion filtering for non-game utilities like Wallpaper Engine.
   */
  public getRealStatisticsOverview(
    excludedHistorical?: { exes?: Set<string>; gameIds?: Set<string> }
  ): StatisticsOverview {
    const rawSessions = this.getRecentSessions(1000);
    const allSessions = rawSessions.filter((s) => {
      if (!excludedHistorical) return true;
      if (excludedHistorical.gameIds?.has(s.gameId)) return false;
      const exeName = (
        s.executablePath ? path.basename(s.executablePath) : ''
      ).toLowerCase();
      if (exeName && excludedHistorical.exes?.has(exeName)) return false;
      return true;
    });
    const totalSeconds = allSessions.reduce(
      (sum, s) => sum + s.durationSeconds,
      0
    );
    const totalGamingHours = Math.round((totalSeconds / 3600) * 100) / 100;

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).getTime();
    const startOf30Days = startOfToday - 29 * 24 * 60 * 60 * 1000;

    let todaySeconds = 0;
    let weekSeconds = 0;
    let monthSeconds = 0;
    const activeDayKeys30 = new Set<string>();

    for (const s of allSessions) {
      const t = Date.parse(s.startedAtIso);
      if (Number.isNaN(t)) continue;

      if (t >= startOfToday) {
        todaySeconds += s.durationSeconds;
      }
      if (t >= startOfWeek) {
        weekSeconds += s.durationSeconds;
      }
      if (t >= startOfMonth) {
        monthSeconds += s.durationSeconds;
      }
      if (t >= startOf30Days) {
        activeDayKeys30.add(s.startedAtIso.slice(0, 10));
      }
    }

    const averageSessionHours =
      allSessions.length > 0
        ? Math.round((totalSeconds / allSessions.length / 3600) * 100) / 100
        : 0;

    // Build 7-day weekly activity chart
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyActivity: DailyActivityPoint[] = [];

    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date(startOfToday - offset * 24 * 60 * 60 * 1000);
      const isoPrefix = d.toISOString().slice(0, 10);
      const dayLabel = dayNames[d.getDay()] ?? 'Day';
      const dateLabel = d.toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
      });

      const matching = allSessions.filter((s) =>
        s.startedAtIso.startsWith(isoPrefix)
      );
      const daySec = matching.reduce((acc, s) => acc + s.durationSeconds, 0);
      const topPlatformId: PlatformId = matching[0]?.platformId ?? 'steam';

      weeklyActivity.push({
        dayLabel,
        dateLabel,
        hoursPlayed: Math.round((daySec / 3600) * 100) / 100,
        sessionsCount: matching.length,
        topPlatformId,
      });
    }

    // Build 6-month trend chart
    const monthlyActivity: MonthlyActivityPoint[] = [];
    for (let mOffset = 5; mOffset >= 0; mOffset--) {
      const mDate = new Date(now.getFullYear(), now.getMonth() - mOffset, 1);
      const ymPrefix = `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = mDate.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      });

      const matching = allSessions.filter((s) =>
        s.startedAtIso.startsWith(ymPrefix)
      );
      const monthSec = matching.reduce((acc, s) => acc + s.durationSeconds, 0);
      const uniqueTitles = new Set(matching.map((s) => s.gameId)).size;

      monthlyActivity.push({
        monthLabel,
        hoursPlayed: Math.round((monthSec / 3600) * 10) / 10,
        titlesPlayed: uniqueTitles,
      });
    }

    // Platform breakdown from library games and sessions (respecting exclusions)
    const games = this.getAllLibraryGames().filter((g) => {
      if (!excludedHistorical) return true;
      if (excludedHistorical.gameIds?.has(g.id)) return false;
      const exeName = (
        g.executablePath
          ? path.basename(g.executablePath)
          : (g.executableName ?? '')
      ).toLowerCase();
      if (exeName && excludedHistorical.exes?.has(exeName)) return false;
      return true;
    });
    const byPlatform = new Map<
      PlatformId,
      { seconds: number; titlesCount: number }
    >();

    for (const g of games) {
      const cur = byPlatform.get(g.platformId) ?? {
        seconds: 0,
        titlesCount: 0,
      };
      cur.titlesCount += 1;
      cur.seconds += Math.round(g.playtimeHours * 3600);
      byPlatform.set(g.platformId, cur);
    }

    const platformBreakdown: PlatformPlaytimeBreakdown[] = Array.from(
      byPlatform.entries()
    )
      .map(([platformId, data]) => {
        const hoursPlayed = Math.round((data.seconds / 3600) * 100) / 100;
        const percentage =
          totalSeconds > 0
            ? Math.round((data.seconds / totalSeconds) * 1000) / 10
            : data.titlesCount > 0 && games.length > 0
              ? Math.round((data.titlesCount / games.length) * 1000) / 10
              : 0;

        return {
          platformId,
          platformName: PLATFORM_NAMES[platformId] ?? platformId,
          hoursPlayed,
          percentage,
          titlesCount: data.titlesCount,
          accentColor: PLATFORM_ACCENT_HEX[platformId] ?? '#38bdf8',
        };
      })
      .sort((a, b) => b.hoursPlayed - a.hoursPlayed || b.titlesCount - a.titlesCount);

    return {
      totalGamingHours,
      todayHours: Math.round((todaySeconds / 3600) * 100) / 100,
      thisWeekHours: Math.round((weekSeconds / 3600) * 100) / 100,
      thisMonthHours: Math.round((monthSeconds / 3600) * 100) / 100,
      totalSessionsCount: allSessions.length,
      activeDaysLast30: activeDayKeys30.size,
      averageSessionHours,
      completionAveragePercent: 0,
      currentStreakDays: activeDayKeys30.size,
      weeklyActivity,
      monthlyActivity,
      platformBreakdown,
      genreBreakdown:
        platformBreakdown.length > 0
          ? platformBreakdown.map((p) => ({
              genre: `${p.platformName} Titles (${p.titlesCount})`,
              hoursPlayed: p.hoursPlayed,
              percentage: p.percentage,
            }))
          : [],
      recentSessions: allSessions.slice(0, 15),
      isDemoData: false,
    };
  }

  /**
   * Scanner History Persistence
   */
  public recordScanHistory(summary: ScanResultSummary): void {
    this.db.run(
      `INSERT OR REPLACE INTO scanner_history (
        scan_id, started_at, finished_at, status,
        total_found, added_or_updated, duplicates_skipped,
        reports_json, errors_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        summary.scanId,
        summary.startedAtIso,
        summary.finishedAtIso,
        summary.status,
        summary.totalFound,
        summary.addedOrUpdatedCount,
        summary.duplicatesSkipped,
        JSON.stringify(summary.platformReports),
        JSON.stringify(summary.errors),
      ]
    );
    this.yearInReviewCache.clear();
  }

  public getScanHistory(limit = 10): ScanResultSummary[] {
    const rows = this.db.all(
      `SELECT * FROM scanner_history ORDER BY started_at DESC LIMIT ?`,
      [limit]
    ) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      scanId: String(r.scan_id),
      startedAtIso: String(r.started_at),
      finishedAtIso: String(r.finished_at),
      status: String(r.status) as ScanResultSummary['status'],
      totalFound: Number(r.total_found ?? 0),
      addedOrUpdatedCount: Number(r.added_or_updated ?? 0),
      duplicatesSkipped: Number(r.duplicates_skipped ?? 0),
      platformReports: JSON.parse(String(r.reports_json ?? '[]')),
      errors: JSON.parse(String(r.errors_json ?? '[]')),
    }));
  }

  /**
   * Phase 6: Multi-Account Management & Game Associations
   */
  public getAccountProfiles(platformId?: PlatformId): AccountProfile[] {
    const rows = (
      platformId
        ? this.db.all(
            `SELECT * FROM account_profiles WHERE platform_id = ? ORDER BY is_preferred DESC, updated_at DESC`,
            [platformId]
          )
        : this.db.all(
            `SELECT * FROM account_profiles ORDER BY platform_id ASC, is_preferred DESC, updated_at DESC`
          )
    ) as Array<Record<string, unknown>>;

    return rows.map((r) => this.mapAccountProfileRow(r));
  }

  public getAccountProfileById(id: string): AccountProfile | null {
    const row = this.db.get(
      `SELECT * FROM account_profiles WHERE id = ?`,
      [id]
    ) as Record<string, unknown> | null;

    if (!row) return null;
    return this.mapAccountProfileRow(row);
  }

  public createAccountProfile(input: CreateAccountProfileInput): AccountProfile {
    const now = new Date().toISOString();
    const id = `acc-${input.platformId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const isPreferred = Boolean(input.isPreferred);

    this.withTransaction(() => {
      if (isPreferred) {
        this.db.run(
          `UPDATE account_profiles SET is_preferred = 0 WHERE platform_id = ?`,
          [input.platformId]
        );
      }

      this.db.run(
        `INSERT INTO account_profiles (
          id, platform_id, display_name, username, avatar_url, nickname,
          is_preferred, last_used_at, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        [
          id,
          input.platformId,
          input.displayName.trim(),
          input.username.trim(),
          input.avatarUrl?.trim() || null,
          input.nickname?.trim() || null,
          isPreferred ? 1 : 0,
          input.notes?.trim() || null,
          now,
          now,
        ]
      );
    });

    const created = this.getAccountProfileById(id);
    if (!created) {
      throw new Error(`Failed to create account profile for ${input.displayName}`);
    }
    return created;
  }

  public updateAccountProfile(
    id: string,
    input: UpdateAccountProfileInput
  ): AccountProfile | null {
    const existing = this.getAccountProfileById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const isPreferred =
      input.isPreferred !== undefined ? Boolean(input.isPreferred) : existing.isPreferred;

    this.withTransaction(() => {
      if (input.username !== undefined && input.username.trim() !== existing.username) {
        this.db.run('DELETE FROM platform_active_profiles WHERE account_id = ?', [id]);
      }
      if (isPreferred && !existing.isPreferred) {
        this.db.run(
          `UPDATE account_profiles SET is_preferred = 0 WHERE platform_id = ?`,
          [existing.platformId]
        );
      }

      this.db.run(
        `UPDATE account_profiles
         SET display_name = COALESCE(?, display_name),
             username = COALESCE(?, username),
             avatar_url = CASE WHEN ? IS NOT NULL THEN ? ELSE avatar_url END,
             nickname = CASE WHEN ? IS NOT NULL THEN ? ELSE nickname END,
             is_preferred = ?,
             notes = CASE WHEN ? IS NOT NULL THEN ? ELSE notes END,
             updated_at = ?
         WHERE id = ?`,
        [
          input.displayName?.trim() ?? null,
          input.username?.trim() ?? null,
          input.avatarUrl !== undefined ? 1 : null,
          input.avatarUrl?.trim() || null,
          input.nickname !== undefined ? 1 : null,
          input.nickname?.trim() || null,
          isPreferred ? 1 : 0,
          input.notes !== undefined ? 1 : null,
          input.notes?.trim() || null,
          now,
          id,
        ]
      );
    });

    return this.getAccountProfileById(id);
  }

  public deleteAccountProfile(id: string): boolean {
    let deleted = false;
    this.withTransaction(() => {
      this.db.run(`DELETE FROM platform_active_profiles WHERE account_id = ?`, [id]);
      const result = this.db.run(
        `DELETE FROM account_profiles WHERE id = ?`,
        [id]
      );
      deleted = (result.changes ?? 0) > 0;
    });
    return deleted;
  }

  public setPreferredAccount(id: string): boolean {
    const account = this.getAccountProfileById(id);
    if (!account) return false;

    this.withTransaction(() => {
      this.db.run(
        `UPDATE account_profiles SET is_preferred = 0 WHERE platform_id = ?`,
        [account.platformId]
      );
      this.db.run(
        `UPDATE account_profiles SET is_preferred = 1, updated_at = ? WHERE id = ?`,
        [new Date().toISOString(), id]
      );
    });

    return true;
  }

  public selectAccountProfile(accountId: string, platformId: PlatformId): void {
    this.withTransaction(() => {
      this.db.run(
        'UPDATE account_profiles SET is_last_selected = 0 WHERE platform_id = ? AND is_last_selected = 1',
        [platformId]
      );
      this.db.run(
        'UPDATE account_profiles SET is_last_selected = 1 WHERE id = ? AND platform_id = ?',
        [accountId, platformId]
      );
    });
  }

  public getActivePlatformProfiles(): Record<PlatformId, ActivePlatformProfile> {
    const rows = this.db.all(
      `SELECT platform_id, account_id, confirmed_at, verification_status FROM platform_active_profiles WHERE verification_status = 'user-confirmed'`
    ) as Array<Record<string, unknown>>;

    const result: Partial<Record<PlatformId, ActivePlatformProfile>> = {};
    for (const r of rows) {
      const pid = String(r.platform_id) as PlatformId;
      result[pid] = {
        platformId: pid,
        accountId: String(r.account_id),
        confirmedAt: String(r.confirmed_at),
        verificationStatus: 'user-confirmed',
      };
    }
    return result as Record<PlatformId, ActivePlatformProfile>;
  }

  public getActiveProfileForPlatform(
    platformId: PlatformId
  ): ActivePlatformProfile | null {
    const row = this.db.get(
      `SELECT platform_id, account_id, confirmed_at, verification_status FROM platform_active_profiles WHERE platform_id = ? AND verification_status = 'user-confirmed'`,
      [platformId]
    ) as Record<string, unknown> | null;

    if (!row) return null;
    return {
      platformId: String(row.platform_id) as PlatformId,
      accountId: String(row.account_id),
      confirmedAt: String(row.confirmed_at),
      verificationStatus: 'user-confirmed',
    };
  }

  public clearActiveProfileForPlatform(platformId: PlatformId): void {
    this.db.run(
      `DELETE FROM platform_active_profiles WHERE platform_id = ?`,
      [platformId]
    );
  }

  public recordAccountSwitch(
    accountId: string,
    platformId: PlatformId,
    methodUsed: string,
    success: boolean,
    details?: string,
    fromAccountId?: string | null
  ): string {
    const now = new Date().toISOString();

    // Debounce duplicate switch-history records (same accountId within 3 seconds)
    const recentDuplicate = this.db.get(
      `SELECT id, switched_at FROM account_switch_history
       WHERE account_id = ? AND platform_id = ? AND success = ? AND from_account_id IS ?
       ORDER BY switched_at DESC LIMIT 1`,
      [accountId, platformId, success ? 1 : 0, fromAccountId ?? null]
    ) as { id: string; switched_at: string } | null;

    const duplicate = recentDuplicate &&
      Date.parse(now) - Date.parse(recentDuplicate.switched_at) < 3000;

    this.withTransaction(() => {
      if (!duplicate) this.db.run(
        `INSERT INTO account_switch_history (
          id, account_id, platform_id, switched_at, success, method_used, details, from_account_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          accountId,
          platformId,
          now,
          success ? 1 : 0,
          methodUsed,
          typeof details === 'string' ? details : null,
          typeof fromAccountId === 'string' ? fromAccountId : null,
        ]
      );

      if (success) {
        this.db.run(
          `UPDATE account_profiles SET last_used_at = ?, updated_at = ? WHERE id = ?`,
          [now, now, accountId]
        );

        this.db.run(
          `INSERT INTO platform_active_profiles (platform_id, account_id, confirmed_at, verification_status)
           VALUES (?, ?, ?, 'user-confirmed')
           ON CONFLICT(platform_id) DO UPDATE SET
             account_id = excluded.account_id,
             confirmed_at = excluded.confirmed_at,
             verification_status = excluded.verification_status`,
          [platformId, accountId, now]
        );
      }
    });
    return now;
  }

  public getAccountSwitchHistory(
    accountId?: string
  ): AccountSwitchHistoryRecord[] {
    const query = accountId
      ? `SELECT * FROM account_switch_history WHERE account_id = ? ORDER BY switched_at DESC`
      : `SELECT * FROM account_switch_history ORDER BY switched_at DESC`;
    const rows = (
      accountId ? this.db.all(query, [accountId]) : this.db.all(query)
    ) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      accountId: String(r.account_id),
      fromAccountId:
        typeof r.from_account_id === 'string' ? r.from_account_id : null,
      platformId: String(r.platform_id) as PlatformId,
      switchedAt: String(r.switched_at),
      success: Boolean(r.success),
      methodUsed: String(r.method_used),
      details: typeof r.details === 'string' ? r.details : null,
    }));
  }

  public getGameAccountAssociations(): GameAccountAssociation[] {
    const rows = this.db.all(
      `SELECT * FROM game_account_associations`
    ) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      gameId: String(r.game_id),
      accountId: String(r.account_id),
      platformId: String(r.platform_id) as PlatformId,
      assignedAt: String(r.assigned_at),
    }));
  }

  public getGameAccountAssociation(gameId: string): GameAccountAssociation | null {
    const row = this.db.get(
      `SELECT * FROM game_account_associations WHERE game_id = ?`,
      [gameId]
    ) as Record<string, unknown> | null;

    if (!row) return null;
    return {
      gameId: String(row.game_id),
      accountId: String(row.account_id),
      platformId: String(row.platform_id) as PlatformId,
      assignedAt: String(row.assigned_at),
    };
  }

  public setGameAccountAssociation(
    gameId: string,
    accountId: string | null
  ): void {
    if (!accountId) {
      this.db.run(
        `DELETE FROM game_account_associations WHERE game_id = ?`,
        [gameId]
      );
      return;
    }

    const account = this.getAccountProfileById(accountId);
    if (!account) {
      throw new Error(`Account profile not found: ${accountId}`);
    }

    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO game_account_associations (game_id, account_id, platform_id, assigned_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(game_id, platform_id) DO UPDATE SET
         account_id = excluded.account_id,
         assigned_at = excluded.assigned_at`,
      [gameId, accountId, account.platformId, now]
    );
  }

  public getGameAccountAssociationsForAccount(accountId: string): string[] {
    const rows = this.db.all(
      `SELECT game_id FROM game_account_associations WHERE account_id = ?`,
      [accountId]
    ) as Array<{ game_id: string }>;

    return rows.map((r) => String(r.game_id));
  }

  private mapAccountProfileRow(r: Record<string, unknown>): AccountProfile {
    return {
      id: String(r.id),
      platformId: String(r.platform_id) as PlatformId,
      displayName: String(r.display_name),
      username: String(r.username),
      avatarUrl: typeof r.avatar_url === 'string' ? r.avatar_url : null,
      nickname: typeof r.nickname === 'string' ? r.nickname : null,
      isPreferred: Boolean(r.is_preferred),
      isLastSelected: Number(r.is_last_selected) === 1,
      lastUsedAt: typeof r.last_used_at === 'string' ? r.last_used_at : null,
      notes: typeof r.notes === 'string' ? r.notes : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  public getAvailableYears(): number[] {
    const rows = this.db.all(
      `SELECT DISTINCT SUBSTR(started_at, 1, 4) as yr
       FROM playtime_sessions
       WHERE started_at IS NOT NULL AND LENGTH(started_at) >= 4
       ORDER BY yr DESC;`
    ) as Array<{ yr: string }>;

    const years = rows
      .map((r) => parseInt(r.yr, 10))
      .filter((y) => !isNaN(y) && y > 2000 && y < 2100);

    const currentYear = new Date().getFullYear();
    if (!years.includes(currentYear)) {
      years.unshift(currentYear);
    }
    return years.sort((a, b) => b - a);
  }

  public getYearInReview(
    targetYear?: number,
    excludedHistorical?: { exes?: Set<string>; gameIds?: Set<string> }
  ): YearInReviewData {
    const year = targetYear ?? new Date().getFullYear();
    const cacheKey = `${year}_${Array.from(excludedHistorical?.exes ?? []).sort().join(',')}_${Array.from(excludedHistorical?.gameIds ?? []).sort().join(',')}`;
    
    if (this.yearInReviewCache.has(cacheKey)) {
      return this.yearInReviewCache.get(cacheKey)!;
    }

    const yearPrefix = year.toString();
    const rows = this.db.all(
      `SELECT 
         s.id,
         s.game_id as gameId,
         s.executable_path as executablePath,
         s.started_at as startedAtIso,
         s.ended_at as endedAtIso,
         s.duration_seconds as durationSeconds,
         s.source,
         s.status,
         g.title as gameTitle,
         g.platform_id as platformId,
         g.cover_image as coverImage,
         g.icon_image as iconImage
       FROM playtime_sessions s
       LEFT JOIN games g ON s.game_id = g.id
       WHERE SUBSTR(s.started_at, 1, 4) = ?
       ORDER BY s.started_at ASC;`,
      [yearPrefix]
    ) as Array<{
      id: string;
      gameId: string;
      executablePath: string;
      startedAtIso: string;
      endedAtIso: string | null;
      durationSeconds: number;
      source: PlaytimeSessionSource;
      status: PlaytimeSessionStatus;
      gameTitle: string | null;
      platformId: string | null;
      coverImage: string | null;
      iconImage: string | null;
    }>;

    const validSessions = rows.filter((s) => {
      if (!excludedHistorical) return true;
      if (excludedHistorical.gameIds?.has(s.gameId)) return false;
      const exeName = (s.executablePath ? path.basename(s.executablePath) : '').toLowerCase();
      if (exeName && excludedHistorical.exes?.has(exeName)) return false;
      return true;
    });

    const totalSeconds = validSessions.reduce((acc, s) => acc + s.durationSeconds, 0);
    const totalGamingHours = Math.round((totalSeconds / 3600) * 10) / 10;
    const totalSessions = validSessions.length;
    const uniqueGames = new Set(validSessions.map((s) => s.gameId));
    const uniqueGamesCount = uniqueGames.size;
    const averageSessionMinutes = totalSessions > 0 ? Math.round((totalSeconds / totalSessions) / 60) : 0;

    const gameMap = new Map<string, {
      title: string;
      platformId: PlatformId;
      coverImage?: string;
      iconImage?: string;
      seconds: number;
      sessions: number;
    }>();

    for (const s of validSessions) {
      const g = gameMap.get(s.gameId);
      if (!g) {
        gameMap.set(s.gameId, {
          title: s.gameTitle ?? 'Unknown Game',
          platformId: (s.platformId ?? 'custom') as PlatformId,
          coverImage: s.coverImage ?? undefined,
          iconImage: s.iconImage ?? undefined,
          seconds: s.durationSeconds,
          sessions: 1,
        });
      } else {
        g.seconds += s.durationSeconds;
        g.sessions += 1;
      }
    }

    const topGames: YearInReviewTopGame[] = Array.from(gameMap.entries())
      .map(([gameId, val]) => {
        const hoursPlayed = Math.round((val.seconds / 3600) * 10) / 10;
        const percentageOfYear = totalGamingHours > 0 ? Math.round((hoursPlayed / totalGamingHours) * 1000) / 10 : 0;
        return {
          gameId,
          title: val.title,
          platformId: val.platformId,
          coverImage: val.coverImage,
          iconImage: val.iconImage,
          hoursPlayed,
          sessionCount: val.sessions,
          percentageOfYear,
        };
      })
      .sort((a, b) => b.hoursPlayed - a.hoursPlayed)
      .slice(0, 5);

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const shortNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyPlaytime: YearInReviewMonthBreakdown[] = monthNames.map((name, idx) => ({
      month: idx + 1,
      monthName: name,
      shortName: shortNames[idx] ?? name.slice(0, 3),
      hoursPlayed: 0,
      sessionsCount: 0,
    }));

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeekPlaytime: YearInReviewDayOfWeekBreakdown[] = dayNames.map((name, idx) => ({
      dayIndex: idx,
      dayName: name,
      hoursPlayed: 0,
      sessionCount: 0,
    }));

    let longestSessionRow: (typeof validSessions)[0] | null = null;
    const calendarMap = new Map<string, { minutes: number; count: number }>();

    for (const s of validSessions) {
      if (!longestSessionRow || s.durationSeconds > longestSessionRow.durationSeconds) {
        longestSessionRow = s;
      }

      const d = new Date(s.startedAtIso);
      if (!isNaN(d.getTime())) {
        const m = d.getMonth();
        if (monthlyPlaytime[m]) {
          monthlyPlaytime[m].hoursPlayed += s.durationSeconds / 3600;
          monthlyPlaytime[m].sessionsCount += 1;
        }

        const dow = d.getDay();
        if (dayOfWeekPlaytime[dow]) {
          dayOfWeekPlaytime[dow].hoursPlayed += s.durationSeconds / 3600;
          dayOfWeekPlaytime[dow].sessionCount += 1;
        }

        const dateKey = s.startedAtIso.slice(0, 10);
        const dayEntry = calendarMap.get(dateKey) ?? { minutes: 0, count: 0 };
        dayEntry.minutes += s.durationSeconds / 60;
        dayEntry.count += 1;
        calendarMap.set(dateKey, dayEntry);
      }
    }

    for (const m of monthlyPlaytime) {
      m.hoursPlayed = Math.round(m.hoursPlayed * 10) / 10;
    }
    for (const d of dayOfWeekPlaytime) {
      d.hoursPlayed = Math.round(d.hoursPlayed * 10) / 10;
    }

    let mostActiveMonth: YearInReviewMonthBreakdown | null = null;
    for (const m of monthlyPlaytime) {
      if (m.hoursPlayed > 0 && (!mostActiveMonth || m.hoursPlayed > mostActiveMonth.hoursPlayed)) {
        mostActiveMonth = m;
      }
    }

    let mostActiveDayOfWeek: YearInReviewDayOfWeekBreakdown | null = null;
    for (const d of dayOfWeekPlaytime) {
      if (d.hoursPlayed > 0 && (!mostActiveDayOfWeek || d.hoursPlayed > mostActiveDayOfWeek.hoursPlayed)) {
        mostActiveDayOfWeek = d;
      }
    }

    let longestSession: YearInReviewLongestSession | null = null;
    if (longestSessionRow && longestSessionRow.durationSeconds > 0) {
      const minutes = Math.round(longestSessionRow.durationSeconds / 60);
      longestSession = {
        gameId: longestSessionRow.gameId,
        gameTitle: longestSessionRow.gameTitle ?? 'Unknown Game',
        platformId: (longestSessionRow.platformId ?? 'custom') as PlatformId,
        durationMinutes: minutes,
        durationHours: Math.round((minutes / 60) * 10) / 10,
        startedAtIso: longestSessionRow.startedAtIso,
      };
    }

    const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const daysInYear = isLeap ? 366 : 365;
    const startDate = new Date(Date.UTC(year, 0, 1));
    const activityCalendar: YearInReviewCalendarDay[] = [];

    for (let dayOffset = 0; dayOffset < daysInYear; dayOffset++) {
      const cur = new Date(startDate.getTime() + dayOffset * 86400000);
      const isoDate = cur.toISOString().slice(0, 10);
      const dayData = calendarMap.get(isoDate) ?? { minutes: 0, count: 0 };
      const minutes = Math.round(dayData.minutes);
      const hours = Math.round((minutes / 60) * 10) / 10;
      let intensity: 0 | 1 | 2 | 3 | 4 = 0;
      if (minutes > 360) intensity = 4;
      else if (minutes > 180) intensity = 3;
      else if (minutes > 60) intensity = 2;
      else if (minutes > 0) intensity = 1;

      activityCalendar.push({
        date: isoDate,
        minutes,
        hours,
        sessionCount: dayData.count,
        intensity,
      });
    }

    let comparison: YearInReviewComparison | null = null;
    const prevYearPrefix = (year - 1).toString();
    const prevRows = this.db.all(
      `SELECT duration_seconds, game_id, executable_path
       FROM playtime_sessions
       WHERE SUBSTR(started_at, 1, 4) = ?;`,
      [prevYearPrefix]
    ) as Array<{ duration_seconds: number; game_id: string; executable_path: string }>;

    const validPrev = prevRows.filter((s) => {
      if (!excludedHistorical) return true;
      if (excludedHistorical.gameIds?.has(s.game_id)) return false;
      const exeName = (s.executable_path ? path.basename(s.executable_path) : '').toLowerCase();
      if (exeName && excludedHistorical.exes?.has(exeName)) return false;
      return true;
    });

    if (validPrev.length > 0) {
      const prevSeconds = validPrev.reduce((acc, s) => acc + s.duration_seconds, 0);
      const prevHours = Math.round((prevSeconds / 3600) * 10) / 10;
      const hoursDiff = Math.round((totalGamingHours - prevHours) * 10) / 10;
      const percentageChange = prevHours > 0 ? Math.round(((totalGamingHours - prevHours) / prevHours) * 1000) / 10 : null;
      comparison = {
        previousYear: year - 1,
        previousYearHours: prevHours,
        hoursDiff,
        percentageChange,
      };
    }

    const result: YearInReviewData = {
      year,
      totalGamingHours,
      totalSessions,
      uniqueGamesCount,
      averageSessionMinutes,
      topGames,
      mostActiveMonth,
      mostActiveDayOfWeek,
      longestSession,
      monthlyPlaytime,
      dayOfWeekPlaytime,
      activityCalendar,
      comparison,
      hasData: totalSessions > 0,
    };

    this.yearInReviewCache.set(cacheKey, result);
    return result;
  }

  public invalidateYearInReviewCache(): void {
    this.yearInReviewCache.clear();
  }

  public getCollections(games?: GameItem[], favoriteGameIds: string[] = []): CollectionItem[] {
    const targetGames = games ?? this.getAllLibraryGames(undefined, 'all');
    const collRows = this.db.all(
      `SELECT id, name, description, icon, color, is_smart, rules_json, sort_order, created_at, updated_at
       FROM collections
       ORDER BY is_smart DESC, name ASC;`
    ) as Array<{
      id: string;
      name: string;
      description: string | null;
      icon: string;
      color: string;
      is_smart: number;
      rules_json: string | null;
      sort_order: string;
      created_at: string;
      updated_at: string;
    }>;

    const gameLinks = this.db.all(
      `SELECT collection_id, game_id, custom_order
       FROM collection_games
       ORDER BY custom_order ASC, added_at ASC;`
    ) as Array<{
      collection_id: string;
      game_id: string;
      custom_order: number;
    }>;

    const linksMap = new Map<string, string[]>();
    for (const link of gameLinks) {
      const list = linksMap.get(link.collection_id) ?? [];
      list.push(link.game_id);
      linksMap.set(link.collection_id, list);
    }

    const gameMap = new Map<string, GameItem>();
    for (const g of targetGames) {
      gameMap.set(g.id, g);
    }

    return collRows.map((r) => {
      const isSmart = Boolean(r.is_smart);
      let rules: SmartCollectionRules | undefined;
      if (r.rules_json) {
        try {
          rules = JSON.parse(r.rules_json) as SmartCollectionRules;
        } catch {
          rules = undefined;
        }
      }

      let matchingGameIds: string[];
      if (isSmart && rules) {
        matchingGameIds = targetGames
          .filter((g) => this.matchSmartRules(g, rules!, favoriteGameIds))
          .map((g) => g.id);
      } else {
        matchingGameIds = linksMap.get(r.id) ?? [];
      }

      const sortOrder = (r.sort_order ?? 'title-asc') as CollectionSortOrder;
      const sortedIds = this.sortCollectionGameIds(matchingGameIds, sortOrder, gameMap);

      return {
        id: r.id,
        name: r.name,
        description: r.description ?? undefined,
        icon: r.icon,
        color: r.color,
        isSmart,
        rules,
        sortOrder,
        gameIds: sortedIds,
        createdAtIso: r.created_at,
        updatedAtIso: r.updated_at,
      };
    });
  }

  private matchSmartRules(
    game: GameItem,
    rules: SmartCollectionRules,
    favoriteGameIds: string[]
  ): boolean {
    if (rules.platformId && game.platformId !== rules.platformId) return false;
    if (
      rules.genre &&
      (!game.genres ||
        !game.genres.some((g) =>
          g.toLowerCase().includes(rules.genre!.toLowerCase())
        ))
    ) {
      return false;
    }
    if (
      rules.isFavorite !== undefined &&
      rules.isFavorite !== favoriteGameIds.includes(game.id)
    ) {
      return false;
    }
    if (
      rules.isInstalled !== undefined &&
      rules.isInstalled !== (game.isInstalled ?? true)
    ) {
      return false;
    }
    if (rules.neverPlayed) {
      if ((game.playtimeHours ?? 0) > 0) return false;
    }
    if (rules.minPlaytimeHours !== undefined) {
      if ((game.playtimeHours ?? 0) < rules.minPlaytimeHours) return false;
    }
    if (rules.maxPlaytimeHours !== undefined) {
      if ((game.playtimeHours ?? 0) > rules.maxPlaytimeHours) return false;
    }
    if (
      rules.recentlyPlayedDays !== undefined &&
      rules.recentlyPlayedDays > 0
    ) {
      if (!game.lastPlayedIso) return false;
      const lastPlayedMs = Date.parse(game.lastPlayedIso);
      if (isNaN(lastPlayedMs)) return false;
      const cutoff = Date.now() - rules.recentlyPlayedDays * 24 * 60 * 60 * 1000;
      if (lastPlayedMs < cutoff) return false;
    }
    return true;
  }

  private sortCollectionGameIds(
    gameIds: string[],
    sortOrder: CollectionSortOrder,
    gameMap: Map<string, GameItem>
  ): string[] {
    const list = [...gameIds];
    if (sortOrder === 'manual') return list;

    return list.sort((aId, bId) => {
      const a = gameMap.get(aId);
      const b = gameMap.get(bId);
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;

      switch (sortOrder) {
        case 'title-asc':
          return a.title.localeCompare(b.title);
        case 'title-desc':
          return b.title.localeCompare(a.title);
        case 'playtime-desc':
          return (b.playtimeHours ?? 0) - (a.playtimeHours ?? 0);
        case 'recent-desc': {
          const aTime = a.lastPlayedIso ? Date.parse(a.lastPlayedIso) : 0;
          const bTime = b.lastPlayedIso ? Date.parse(b.lastPlayedIso) : 0;
          return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
        }
        default:
          return 0;
      }
    });
  }

  public createCollection(input: CreateCollectionInput): CollectionItem {
    const id = randomUUID();
    const now = new Date().toISOString();
    const icon = input.icon ?? 'Folder';
    const color = input.color ?? '#8B5CF6';
    const isSmart = input.isSmart ? 1 : 0;
    const rulesJson = input.rules ? JSON.stringify(input.rules) : null;
    const sortOrder = input.sortOrder ?? 'title-asc';

    this.withTransaction(() => {
      this.db.run(
        `INSERT INTO collections (id, name, description, icon, color, is_smart, rules_json, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [id, input.name.trim(), input.description?.trim() || null, icon, color, isSmart, rulesJson, sortOrder, now, now]
      );

      if (!input.isSmart && input.initialGameIds && input.initialGameIds.length > 0) {
        let order = 0;
        for (const gameId of input.initialGameIds) {
          this.db.run(
            `INSERT OR IGNORE INTO collection_games (collection_id, game_id, added_at, custom_order)
             VALUES (?, ?, ?, ?);`,
            [id, gameId, now, order++]
          );
        }
      }
    });

    return {
      id,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      icon,
      color,
      isSmart: Boolean(isSmart),
      rules: input.rules,
      sortOrder,
      gameIds: input.initialGameIds ?? [],
      createdAtIso: now,
      updatedAtIso: now,
    };
  }

  public updateCollection(input: UpdateCollectionInput): boolean {
    const now = new Date().toISOString();
    const existing = this.db.get(
      `SELECT id, rules_json, sort_order FROM collections WHERE id = ?;`,
      [input.id]
    ) as { id: string; rules_json: string | null; sort_order: string } | undefined;

    if (!existing) return false;

    const updates: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [now];

    if (input.name !== undefined) {
      updates.push('name = ?');
      params.push(input.name.trim());
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      params.push(input.description.trim() || null);
    }
    if (input.icon !== undefined) {
      updates.push('icon = ?');
      params.push(input.icon);
    }
    if (input.color !== undefined) {
      updates.push('color = ?');
      params.push(input.color);
    }
    if (input.rules !== undefined) {
      updates.push('rules_json = ?');
      params.push(input.rules ? JSON.stringify(input.rules) : null);
    }
    if (input.sortOrder !== undefined) {
      updates.push('sort_order = ?');
      params.push(input.sortOrder);
    }

    params.push(input.id);
    this.db.run(
      `UPDATE collections SET ${updates.join(', ')} WHERE id = ?;`,
      params
    );
    return true;
  }

  public deleteCollection(id: string): boolean {
    this.db.run(`DELETE FROM collections WHERE id = ?;`, [id]);
    return true;
  }

  public addGameToCollection(collectionId: string, gameId: string): boolean {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT OR IGNORE INTO collection_games (collection_id, game_id, added_at, custom_order)
       VALUES (?, ?, ?, (
         SELECT COALESCE(MAX(custom_order), 0) + 1 FROM collection_games WHERE collection_id = ?
       ));`,
      [collectionId, gameId, now, collectionId]
    );
    return true;
  }

  public removeGameFromCollection(collectionId: string, gameId: string): boolean {
    this.db.run(
      `DELETE FROM collection_games WHERE collection_id = ? AND game_id = ?;`,
      [collectionId, gameId]
    );
    return true;
  }

  public setCollectionGameOrder(collectionId: string, gameIds: string[]): boolean {
    this.withTransaction(() => {
      this.db.run(`UPDATE collections SET sort_order = 'manual' WHERE id = ?;`, [collectionId]);
      let order = 0;
      for (const gId of gameIds) {
        this.db.run(
          `UPDATE collection_games SET custom_order = ? WHERE collection_id = ? AND game_id = ?;`,
          [order++, collectionId, gId]
        );
      }
    });
    return true;
  }
}
