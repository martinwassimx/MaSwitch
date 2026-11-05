import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type {
  ApplyArtworkInput,
  ArtworkSyncProgress,
  SteamGridDbAssetType,
  SteamGridDbGame,
} from '../../../src/shared/types/steamgriddb';
import type { GameItem } from '../../../src/shared/types/game';
import { MaSwitchSqliteDatabase } from '../database/sqliteDatabase';
import { SteamGridDbClient } from './steamGridDbClient';

const MAX_DOWNLOAD_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_CDN_HOSTS = ['cdn2.steamgriddb.com', 'steamgriddb.com'];

export type AutoArtworkResult = 'downloaded' | 'unmatched' | 'failed' | 'skipped';

export class SteamGridDbArtworkService {
  private readonly client: SteamGridDbClient;
  private readonly sqliteDb: MaSwitchSqliteDatabase;
  private readonly artworkDir: string;
  private isSyncing = false;
  private onSyncProgressCallback?: (progress: ArtworkSyncProgress) => void;

  constructor(
    client: SteamGridDbClient,
    sqliteDb: MaSwitchSqliteDatabase,
    artworkDir: string,
    onSyncProgressCallback?: (progress: ArtworkSyncProgress) => void
  ) {
    this.client = client;
    this.sqliteDb = sqliteDb;
    this.artworkDir = artworkDir;
    this.onSyncProgressCallback = onSyncProgressCallback;

    try {
      fs.mkdirSync(this.artworkDir, { recursive: true });
    } catch {
      // ignore
    }
  }

  public setProgressCallback(cb: (progress: ArtworkSyncProgress) => void): void {
    this.onSyncProgressCallback = cb;
  }

  /**
   * Validates that a remote asset URL belongs to official SteamGridDB CDNs.
   */
  private isValidSteamGridDbUrl(rawUrl: string): boolean {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:') return false;
      return ALLOWED_CDN_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
    } catch {
      return false;
    }
  }

  /**
   * Downloads an asset to the local artwork cache and returns the maswitch-asset:// URL.
   * If already downloaded and cached, returns immediately without re-fetching.
   */
  public async downloadAndCacheAsset(
    sgdbGameId: number,
    type: SteamGridDbAssetType,
    assetUrl: string,
    assetId?: number
  ): Promise<string | null> {
    if (!assetUrl) {
      return null;
    }

    // If it's already a local maswitch-asset:// URL or data: URL, return as-is
    if (assetUrl.startsWith('maswitch-asset://') || assetUrl.startsWith('data:')) {
      return assetUrl;
    }

    if (!this.isValidSteamGridDbUrl(assetUrl)) {
      return null;
    }

    const extMatch = assetUrl.match(/\.(png|jpg|jpeg|webp|ico)(\?.*)?$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : type === 'logo' || type === 'icon' ? 'png' : 'jpg';

    // Stable filename e.g. sgdb_1234_grid_5678.jpg
    const safeAssetId = assetId ?? Math.abs(this.hashCode(assetUrl));
    const filename = `sgdb_${sgdbGameId}_${type}_${safeAssetId}.${ext}`;
    const destinationPath = path.join(this.artworkDir, filename);

    // Cache hit: file already exists on disk and is non-empty
    try {
      if (fs.existsSync(destinationPath)) {
        const st = fs.statSync(destinationPath);
        if (st.size > 0) {
          return `maswitch-asset://artwork/${filename}`;
        }
      }
    } catch {
      // ignore
    }

    // Download stream to temp file
    const tempPath = `${destinationPath}.tmp-${Date.now()}`;
    try {
      const response = await fetch(assetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'MaSwitch-Desktop/0.2.0',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok || !response.body) {
        return null;
      }

      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > MAX_DOWNLOAD_SIZE_BYTES) {
        return null;
      }

      // Stream to file
      const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream);
      const writeStream = fs.createWriteStream(tempPath);
      await pipeline(nodeStream, writeStream);

      // Verify file was written and is non-empty
      const st = fs.statSync(tempPath);
      if (st.size === 0) {
        fs.unlinkSync(tempPath);
        return null;
      }

      // Atomic rename
      fs.renameSync(tempPath, destinationPath);
      return `maswitch-asset://artwork/${filename}`;
    } catch {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
        // ignore
      }
      return null;
    }
  }

  /**
   * Fetches and automatically applies the best SteamGridDB artwork for a single game.
   */
  public async autoFetchAndApplyGameArtwork(game: GameItem): Promise<AutoArtworkResult> {
    if (!this.client.isConfigured()) {
      return 'skipped';
    }

    // If user manually edited artwork, do not overwrite
    if (game.isArtworkUserEdited) {
      return 'skipped';
    }

    try {
      // 1. Find matching game on SteamGridDB
      let sgdbGame: SteamGridDbGame | null = null;
      if (game.sgdbGameId && game.sgdbGameId > 0) {
        sgdbGame = { id: game.sgdbGameId, name: game.title };
      } else {
        sgdbGame = await this.client.findBestMatchingGame(
          game.title,
          game.platformId,
          game.externalAppId
        );
      }

      if (!sgdbGame) {
        return 'unmatched';
      }

      // 2. Fetch asset categories
      let bundle = await this.client.getGameArtworkBundle(sgdbGame.id, sgdbGame.name);

      // If existing cached sgdbGameId has no grids (e.g. invalid/deprecated match), re-search by title
      if (bundle.grids.length === 0 && game.sgdbGameId) {
        const reMatch = await this.client.findBestMatchingGame(
          game.title,
          game.platformId,
          game.externalAppId
        );
        if (reMatch && reMatch.id !== sgdbGame.id) {
          sgdbGame = reMatch;
          bundle = await this.client.getGameArtworkBundle(sgdbGame.id, sgdbGame.name);
        }
      }

      const bestGrid = bundle.grids[0] ?? null;
      const bestHero = bundle.heroes[0] ?? null;
      const bestLogo = bundle.logos[0] ?? null;
      const bestIcon = bundle.icons[0] ?? null;

      if (!bestGrid) {
        return 'unmatched';
      }

      // 3. Download & Cache in parallel
      const [localCover, localHero, localLogo, localIcon] = await Promise.all([
        this.downloadAndCacheAsset(sgdbGame.id, 'grid', bestGrid.url, bestGrid.id),
        bestHero ? this.downloadAndCacheAsset(sgdbGame.id, 'hero', bestHero.url, bestHero.id) : null,
        bestLogo ? this.downloadAndCacheAsset(sgdbGame.id, 'logo', bestLogo.url, bestLogo.id) : null,
        bestIcon ? this.downloadAndCacheAsset(sgdbGame.id, 'icon', bestIcon.url, bestIcon.id) : null,
      ]);

      if (!localCover) {
        return 'failed';
      }

      // 4. Update SQLite record
      this.sqliteDb.updateGameArtwork({
        gameId: game.id,
        sgdbGameId: sgdbGame.id,
        coverUrl: localCover,
        heroUrl: localHero || undefined,
        logoUrl: localLogo || undefined,
        iconUrl: localIcon || undefined,
        isUserEdited: false,
      });

      return 'downloaded';
    } catch {
      return 'failed';
    }
  }

  /**
   * Manually applies user-selected artwork to a game.
   */
  public async applyManualArtwork(input: ApplyArtworkInput): Promise<GameItem | null> {
    const game = this.sqliteDb.getGameById(input.gameId);
    if (!game) {
      return null;
    }

    const sgdbId = input.sgdbGameId ?? game.sgdbGameId ?? 0;

    // Download any remote URLs selected by user
    const [localCover, localHero, localLogo, localIcon] = await Promise.all([
      input.coverUrl ? this.downloadAndCacheAsset(sgdbId, 'grid', input.coverUrl) : undefined,
      input.heroUrl ? this.downloadAndCacheAsset(sgdbId, 'hero', input.heroUrl) : undefined,
      input.logoUrl ? this.downloadAndCacheAsset(sgdbId, 'logo', input.logoUrl) : undefined,
      input.iconUrl ? this.downloadAndCacheAsset(sgdbId, 'icon', input.iconUrl) : undefined,
    ]);

    this.sqliteDb.updateGameArtwork({
      gameId: input.gameId,
      sgdbGameId: input.sgdbGameId ?? game.sgdbGameId ?? undefined,
      coverUrl: localCover || undefined,
      heroUrl: localHero || undefined,
      logoUrl: localLogo || undefined,
      iconUrl: localIcon || undefined,
      isUserEdited: true, // Mark user override
    });

    return this.sqliteDb.getGameById(input.gameId);
  }

  /**
   * Restores automatic procedural or default SteamGridDB artwork.
   */
  public async restoreDefaultArtwork(gameId: string): Promise<GameItem | null> {
    this.sqliteDb.restoreGameDefaultArtwork(gameId);
    const game = this.sqliteDb.getGameById(gameId);
    if (game && this.client.isConfigured()) {
      await this.autoFetchAndApplyGameArtwork(game);
    }
    return this.sqliteDb.getGameById(gameId);
  }

  /**
   * Synchronizes missing artwork for all games in the library in the background.
   */
  public async syncMissingLibraryArtwork(): Promise<ArtworkSyncProgress> {
    if (this.isSyncing) {
      return {
        totalGames: 0,
        processedGames: 0,
        successCount: 0,
        unmatchedCount: 0,
        failedCount: 0,
        status: 'syncing',
        summaryText: 'Artwork synchronization is already in progress...',
      };
    }

    if (!this.client.isConfigured()) {
      return {
        totalGames: 0,
        processedGames: 0,
        successCount: 0,
        unmatchedCount: 0,
        failedCount: 0,
        status: 'error',
        summaryText: 'SteamGridDB API key is not configured.',
      };
    }

    this.isSyncing = true;
    const games = this.sqliteDb.getAllLibraryGames();

    const progress: ArtworkSyncProgress = {
      totalGames: games.length,
      processedGames: 0,
      successCount: 0,
      unmatchedCount: 0,
      failedCount: 0,
      status: 'syncing',
      summaryText: `Checking 0 of ${games.length} games...`,
    };

    this.onSyncProgressCallback?.(progress);

    for (const game of games) {
      progress.currentTitle = game.title;
      this.onSyncProgressCallback?.(progress);

      const hasValidLocalCover =
        Boolean(game.coverImage) &&
        game.coverImage.startsWith('maswitch-asset://artwork/') &&
        !game.coverImage.startsWith('data:image/svg+xml') &&
        Boolean(game.sgdbGameId);

      if (hasValidLocalCover) {
        progress.processedGames++;
        progress.successCount++;
      } else {
        const res = await this.autoFetchAndApplyGameArtwork(game);
        progress.processedGames++;
        if (res === 'downloaded' || res === 'skipped') {
          progress.successCount++;
        } else if (res === 'unmatched') {
          progress.unmatchedCount++;
        } else {
          progress.failedCount++;
        }
        await new Promise((r) => setTimeout(r, 250));
      }

      progress.summaryText = `${progress.totalGames} games checked · ${progress.successCount} covers downloaded · ${progress.unmatchedCount} unmatched · ${progress.failedCount} failed`;
      this.onSyncProgressCallback?.(progress);
    }

    progress.status = 'completed';
    progress.currentTitle = undefined;
    progress.summaryText = `${progress.totalGames} games checked · ${progress.successCount} covers downloaded · ${progress.unmatchedCount} unmatched · ${progress.failedCount} failed`;
    this.onSyncProgressCallback?.(progress);
    this.isSyncing = false;
    return progress;
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash;
  }
}
