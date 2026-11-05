import { createHash } from 'node:crypto';
import type { GameItem } from '../../src/shared/types/game';
import type { GameNewsFeedResult, GameNewsItem } from '../../src/shared/types/news';

export class NewsService {
  private cache: GameNewsFeedResult | null = null;
  private cacheTtlMs = 60 * 60 * 1000; // 1 hour TTL
  private lastFetchedAtMs = 0;

  constructor(options?: { cacheTtlMs?: number }) {
    if (options?.cacheTtlMs) this.cacheTtlMs = options.cacheTtlMs;
  }

  public async getLibraryNews(
    games: GameItem[],
    options?: { forceRefresh?: boolean; gameId?: string; platformId?: string }
  ): Promise<GameNewsFeedResult> {
    const now = Date.now();
    const isCacheValid =
      !options?.forceRefresh &&
      this.cache &&
      now - this.lastFetchedAtMs < this.cacheTtlMs;

    if (isCacheValid && this.cache) {
      return this.filterResult(this.cache, options);
    }

    try {
      const articles: GameNewsItem[] = [];
      let supportedGamesCount = 0;
      let unsupportedGamesCount = 0;

      // Filter games to those from supported official news sources (e.g., Steam official feeds)
      const steamGames = games.filter(
        (g) => g.platformId === 'steam' &&
               (g.id || (g as unknown as { externalAppId?: string }).externalAppId)
      );

      // We process up to top 10 games to avoid network overhead
      const targetSteamGames = steamGames.slice(0, 10);
      supportedGamesCount += targetSteamGames.length;
      unsupportedGamesCount += Math.max(0, games.length - targetSteamGames.length);

      let networkErrorsCount = 0;
      let successfulFetchesCount = 0;

      const fetchPromises = targetSteamGames.map(async (game) => {
        const appId = (game as unknown as { externalAppId?: string }).externalAppId || game.id.replace(/^steam-/, '');
        if (!appId || !/^\d+$/.test(appId)) return [];

        try {
          const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${encodeURIComponent(
            appId
          )}&count=4&maxlength=300&format=json`;

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 6000);

          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timeout);

          if (!res.ok) {
            networkErrorsCount++;
            return [];
          }

          successfulFetchesCount++;
          const data = (await res.json()) as {
            appnews?: {
              newsitems?: Array<{
                gid: string;
                title: string;
                url: string;
                author?: string;
                contents: string;
                feedlabel?: string;
                date: number;
              }>;
            };
          };

          const items = data.appnews?.newsitems ?? [];
          return items.map((item): GameNewsItem => {
            const cleanSummary = item.contents
              ? item.contents
                  .replace(/<[^>]*>?/gm, '')
                  .replace(/\[\/?(b|i|u|url|img|list|\*)[^\]]*\]/gi, '')
                  .trim()
                  .slice(0, 240) + (item.contents.length > 240 ? '...' : '')
              : 'No description available.';

            const dateIso = item.date
              ? new Date(item.date * 1000).toISOString()
              : new Date().toISOString();

            const articleId =
              item.gid ||
              createHash('sha256').update(`${game.id}_${item.url || item.title}`).digest('hex').slice(0, 16);

            return {
              id: articleId,
              gameId: game.id,
              gameTitle: game.title,
              gameCoverUrl: game.coverImage,
              platformId: game.platformId,
              headline: item.title || 'Official Game Update',
              summary: cleanSummary,
              url: item.url || '',
              source: item.feedlabel || 'Steam Official News',
              publishedAtIso: dateIso,
              author: item.author || undefined,
            };
          });
        } catch {
          networkErrorsCount++;
          return [];
        }
      });

      const results = await Promise.allSettled(fetchPromises);
      for (const res of results) {
        if (res.status === 'fulfilled') {
          articles.push(...res.value);
        }
      }

      const isOffline = targetSteamGames.length > 0 && successfulFetchesCount === 0 && networkErrorsCount > 0;
      if (isOffline) {
        if (this.cache) {
          return {
            ...this.filterResult(this.cache, options),
            isOffline: true,
          };
        }
        return {
          articles: [],
          lastUpdatedIso: new Date().toISOString(),
          supportedGamesCount,
          unsupportedGamesCount,
          isOffline: true,
        };
      }

      // Deduplicate articles by URL or ID
      const seen = new Set<string>();
      const dedupedArticles: GameNewsItem[] = [];
      for (const a of articles) {
        const key = a.url || a.id;
        if (!seen.has(key)) {
          seen.add(key);
          dedupedArticles.push(a);
        }
      }

      // Sort newest first
      dedupedArticles.sort((a, b) => Date.parse(b.publishedAtIso) - Date.parse(a.publishedAtIso));

      const finalResult: GameNewsFeedResult = {
        articles: dedupedArticles,
        lastUpdatedIso: new Date().toISOString(),
        supportedGamesCount,
        unsupportedGamesCount,
        isOffline: false,
      };

      this.cache = finalResult;
      this.lastFetchedAtMs = now;

      return this.filterResult(finalResult, options);
    } catch {
      // Offline fallback: return existing cache or empty offline payload
      if (this.cache) {
        return {
          ...this.filterResult(this.cache, options),
          isOffline: true,
        };
      }

      return {
        articles: [],
        lastUpdatedIso: new Date().toISOString(),
        supportedGamesCount: 0,
        unsupportedGamesCount: games.length,
        isOffline: true,
      };
    }
  }

  private filterResult(
    result: GameNewsFeedResult,
    options?: { gameId?: string; platformId?: string }
  ): GameNewsFeedResult {
    let filtered = [...result.articles];

    if (options?.gameId) {
      filtered = filtered.filter((a) => a.gameId === options.gameId);
    }
    if (options?.platformId) {
      filtered = filtered.filter((a) => a.platformId === options.platformId);
    }

    return {
      ...result,
      articles: filtered,
    };
  }

  public clearCache(): void {
    this.cache = null;
    this.lastFetchedAtMs = 0;
  }

  public static isValidExternalUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }
}
