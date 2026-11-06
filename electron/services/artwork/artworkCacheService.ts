import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GameScreenshot, GameSystemRequirements } from '../../../src/shared/types/game';

const execFileAsync = promisify(execFile);

export interface ArtworkCacheStats {
  artworkCount: number;
  artworkSizeBytes: number;
  iconCount: number;
  iconSizeBytes: number;
  totalSizeBytes: number;
}

export interface SteamArtworkUrls {
  coverUrl: string;
  heroUrl: string;
  headerUrl: string;
  logoUrl?: string;
  isLocalCached: boolean;
}

export interface SteamStoreMetadata {
  description?: string;
  shortDescription?: string;
  developer?: string;
  publisher?: string;
  releaseDate?: string;
  screenshots: GameScreenshot[];
  systemRequirements?: Partial<GameSystemRequirements>;
  website?: string;
}

export class ArtworkCacheService {
  private readonly artworkDir: string;
  private readonly iconDir: string;
  private readonly thumbsDir: string;
  private steamInstallDirCache: string | null | undefined = undefined;
  private readonly memoryBufferCache = new Map<
    string,
    { buffer: Buffer; mimeType: string }
  >();
  private memoryCacheBytes = 0;
  private static readonly MAX_MEMORY_CACHE_BYTES = 24 * 1024 * 1024; // 24 MB cap

  constructor(userDataDir: string) {
    this.artworkDir = path.join(userDataDir, 'artwork_cache');
    this.iconDir = path.join(userDataDir, 'icon_cache');
    this.thumbsDir = path.join(userDataDir, 'artwork_thumbs');

    try {
      fs.mkdirSync(this.artworkDir, { recursive: true });
      fs.mkdirSync(this.iconDir, { recursive: true });
      fs.mkdirSync(this.thumbsDir, { recursive: true });
    } catch {
      // Ignore if exists
    }
  }

  public getArtworkDir(): string {
    return this.artworkDir;
  }

  public getIconDir(): string {
    return this.iconDir;
  }

  public getThumbsDir(): string {
    return this.thumbsDir;
  }

  public getCachedBuffer(
    key: string
  ): { buffer: Buffer; mimeType: string } | undefined {
    const entry = this.memoryBufferCache.get(key);
    if (entry) {
      // Refresh LRU order
      this.memoryBufferCache.delete(key);
      this.memoryBufferCache.set(key, entry);
    }
    return entry;
  }

  public setCachedBuffer(
    key: string,
    buffer: Buffer,
    mimeType: string
  ): void {
    if (buffer.byteLength > 2 * 1024 * 1024) {
      return; // Do not store single buffers > 2 MB in RAM
    }
    const existing = this.memoryBufferCache.get(key);
    if (existing) {
      this.memoryCacheBytes -= existing.buffer.byteLength;
      this.memoryBufferCache.delete(key);
    }
    while (
      this.memoryCacheBytes + buffer.byteLength >
        ArtworkCacheService.MAX_MEMORY_CACHE_BYTES &&
      this.memoryBufferCache.size > 0
    ) {
      const oldestKey = this.memoryBufferCache.keys().next().value;
      if (!oldestKey) break;
      const oldest = this.memoryBufferCache.get(oldestKey);
      if (oldest) {
        this.memoryCacheBytes -= oldest.buffer.byteLength;
      }
      this.memoryBufferCache.delete(oldestKey);
    }
    this.memoryBufferCache.set(key, { buffer, mimeType });
    this.memoryCacheBytes += buffer.byteLength;
  }

  /**
   * Returns disk statistics for cached game artwork and extracted executable icons.
   */
  public getStats(): ArtworkCacheStats {
    let artworkCount = 0;
    let artworkSizeBytes = 0;
    let iconCount = 0;
    let iconSizeBytes = 0;

    try {
      const artFiles = fs.readdirSync(this.artworkDir);
      for (const file of artFiles) {
        try {
          const st = fs.statSync(path.join(this.artworkDir, file));
          if (st.isFile()) {
            artworkCount++;
            artworkSizeBytes += st.size;
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    try {
      const iconFiles = fs.readdirSync(this.iconDir);
      for (const file of iconFiles) {
        try {
          const st = fs.statSync(path.join(this.iconDir, file));
          if (st.isFile()) {
            iconCount++;
            iconSizeBytes += st.size;
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    return {
      artworkCount,
      artworkSizeBytes,
      iconCount,
      iconSizeBytes,
      totalSizeBytes: artworkSizeBytes + iconSizeBytes,
    };
  }

  /**
   * Deletes all cached artwork and icon files, returning the freed byte count.
   */
  public clearCache(): { clearedFilesCount: number; freedBytes: number } {
    let clearedFilesCount = 0;
    let freedBytes = 0;

    const clearFolder = (dir: string) => {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          try {
            const filePath = path.join(dir, file);
            const st = fs.statSync(filePath);
            if (st.isFile()) {
              freedBytes += st.size;
              fs.unlinkSync(filePath);
              clearedFilesCount++;
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    };

    clearFolder(this.artworkDir);
    clearFolder(this.iconDir);
    clearFolder(this.thumbsDir);
    this.memoryBufferCache.clear();
    this.memoryCacheBytes = 0;

    return { clearedFilesCount, freedBytes };
  }

  /**
   * Resolves artwork for a Steam App ID.
   * Checks local Steam librarycache first; if present, copies to our local cache or serves directly.
   * Otherwise falls back to high-res official Steam Cloudflare CDN URLs.
   */
  public async resolveSteamArtwork(appId: string | number): Promise<SteamArtworkUrls> {
    const idStr = String(appId).trim();
    if (!idStr || !/^\d+$/.test(idStr)) {
      return {
        coverUrl: '',
        heroUrl: '',
        headerUrl: '',
        isLocalCached: false,
      };
    }

    const cdnCover = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${idStr}/library_600x900.jpg`;
    const cdnHero = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${idStr}/library_hero.jpg`;
    const cdnHeader = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${idStr}/header.jpg`;
    const cdnLogo = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${idStr}/logo.png`;

    // Check if we already have local cached versions
    const cachedCoverFile = `steam_${idStr}_cover.jpg`;
    const cachedHeroFile = `steam_${idStr}_hero.jpg`;
    const cachedCoverPath = path.join(this.artworkDir, cachedCoverFile);
    const cachedHeroPath = path.join(this.artworkDir, cachedHeroFile);

    if (fs.existsSync(cachedCoverPath)) {
      return {
        coverUrl: `maswitch-asset://artwork/${cachedCoverFile}`,
        heroUrl: fs.existsSync(cachedHeroPath)
          ? `maswitch-asset://artwork/${cachedHeroFile}`
          : cdnHero,
        headerUrl: cdnHeader,
        logoUrl: cdnLogo,
        isLocalCached: true,
      };
    }

    // Try finding local Steam librarycache folder
    const localSteamCache = this.findSteamLibraryCacheDir();
    if (localSteamCache) {
      try {
        const localCover = path.join(localSteamCache, `${idStr}_library_600x900.jpg`);
        if (fs.existsSync(localCover)) {
          fs.copyFileSync(localCover, cachedCoverPath);
          const localHero = path.join(localSteamCache, `${idStr}_hero.jpg`);
          if (fs.existsSync(localHero)) {
            fs.copyFileSync(localHero, cachedHeroPath);
          }
          return {
            coverUrl: `maswitch-asset://artwork/${cachedCoverFile}`,
            heroUrl: fs.existsSync(cachedHeroPath)
              ? `maswitch-asset://artwork/${cachedHeroFile}`
              : cdnHero,
            headerUrl: cdnHeader,
            logoUrl: cdnLogo,
            isLocalCached: true,
          };
        }
      } catch {
        // Fall back to CDN
      }
    }

    // Direct official Cloudflare CDN URLs
    return {
      coverUrl: cdnCover,
      heroUrl: cdnHero,
      headerUrl: cdnHeader,
      logoUrl: cdnLogo,
      isLocalCached: false,
    };
  }

  /**
   * Fetches rich store metadata from Steam Store API (screenshots, requirements, description).
   */
  public async fetchSteamStoreMetadata(appId: string | number): Promise<SteamStoreMetadata | null> {
    const idStr = String(appId).trim();
    if (!idStr || !/^\d+$/.test(idStr)) {
      return null;
    }

    try {
      const url = `https://store.steampowered.com/api/appdetails?appids=${idStr}&l=english`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: {
          'User-Agent': 'MaSwitch-Desktop/1.0',
        },
      });

      if (!res.ok) {
        return null;
      }

      const json = (await res.json()) as Record<string, { success?: boolean; data?: Record<string, unknown> }>;
      const appData = json[idStr];
      if (!appData || !appData.success || !appData.data) {
        return null;
      }

      const data = appData.data;
      const screenshots: GameScreenshot[] = [];

      if (Array.isArray(data.screenshots)) {
        for (const s of data.screenshots) {
          if (typeof s === 'object' && s !== null && typeof s.path_full === 'string') {
            screenshots.push({
              id: `steam-ss-${s.id ?? screenshots.length}`,
              title: 'Steam In-Game Screenshot',
              caption: 'Official Steam Store Media Asset',
              imageUrl: s.path_full,
              resolution: '1920x1080',
            });
          }
        }
      }

      const developers = Array.isArray(data.developers) ? (data.developers as string[]).join(', ') : undefined;
      const publishers = Array.isArray(data.publishers) ? (data.publishers as string[]).join(', ') : undefined;
      const shortDesc = typeof data.short_description === 'string' ? data.short_description : undefined;
      const detailedDesc = typeof data.detailed_description === 'string' ? data.detailed_description : undefined;
      const website = typeof data.website === 'string' ? data.website : undefined;

      const releaseDateObj = typeof data.release_date === 'object' && data.release_date !== null
        ? (data.release_date as { date?: string }).date
        : undefined;

      return {
        description: detailedDesc,
        shortDescription: shortDesc,
        developer: developers,
        publisher: publishers,
        releaseDate: releaseDateObj,
        screenshots,
        website,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extracts the native application icon from a Windows .exe binary and saves as PNG.
   * Returns a maswitch-asset:// icon URI if successful.
   */
  public async extractExeIcon(executablePath: string, gameId: string): Promise<string | null> {
    if (process.platform !== 'win32') {
      return null;
    }

    if (!executablePath || !fs.existsSync(executablePath)) {
      return null;
    }

    const safeFilename = `${gameId.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    const targetPngPath = path.join(this.iconDir, safeFilename);

    if (fs.existsSync(targetPngPath)) {
      try {
        const st = fs.statSync(targetPngPath);
        if (st.size > 200) {
          return `maswitch-asset://icon/${safeFilename}`;
        }
      } catch {
        // re-extract
      }
    }

    try {
      const psScript = `
        Add-Type -AssemblyName System.Drawing
        $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${executablePath.replace(/'/g, "''")}')
        if ($icon) {
          $bmp = $icon.ToBitmap()
          $bmp.Save('${targetPngPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
          $bmp.Dispose()
          $icon.Dispose()
          Write-Output "OK"
        } else {
          Write-Output "NO_ICON"
        }
      `;

      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        psScript,
      ], { timeout: 8000 });

      if (fs.existsSync(targetPngPath) && fs.statSync(targetPngPath).size > 200) {
        return `maswitch-asset://icon/${safeFilename}`;
      }
    } catch {
      // Icon extraction failed or executable has no embedded icon resource
    }

    return null;
  }

  /**
   * Queries SteamGridDB API if user has supplied an API key.
   */
  public async querySteamGridDb(
    steamAppId: string | number,
    apiKey: string
  ): Promise<{ coverUrl?: string; heroUrl?: string; logoUrl?: string } | null> {
    if (!apiKey || !apiKey.trim()) {
      return null;
    }

    try {
      const res = await fetch(`https://www.steamgriddb.com/api/v2/grids/steam/${steamAppId}`, {
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        return null;
      }

      const data = (await res.json()) as { success?: boolean; data?: Array<{ url?: string }> };
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        return {
          coverUrl: data.data[0].url,
        };
      }
    } catch {
      // ignore
    }
    return null;
  }

  private findSteamLibraryCacheDir(): string | null {
    if (this.steamInstallDirCache !== undefined) {
      return this.steamInstallDirCache;
    }

    const candidatePaths = [
      'C:\\Program Files (x86)\\Steam\\appcache\\librarycache',
      'C:\\Program Files\\Steam\\appcache\\librarycache',
      'D:\\Steam\\appcache\\librarycache',
      'E:\\Steam\\appcache\\librarycache',
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        this.steamInstallDirCache = p;
        return p;
      }
    }

    this.steamInstallDirCache = null;
    return null;
  }
}

