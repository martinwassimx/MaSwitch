import { createHash } from 'node:crypto';
import type { GameItem } from '../../src/shared/types/game';
import type {
  GameNewsCoverageItem,
  GameNewsFeedResult,
  GameNewsItem,
} from '../../src/shared/types/news';

export const UNSUPPORTED_NEWS_SOURCE_MESSAGE =
  'No supported news source available for this game.';

const RECENT_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ARCHIVE_DEMOTION_THRESHOLD_MS = 45 * 24 * 60 * 60 * 1000; // 45 days
const MAX_ARTICLES_PER_GAME = 5;
const DEFAULT_FEED_MAX_PER_GAME = 3;
const DEFAULT_FEED_MAX_ARCHIVE_PER_GAME = 2;

const UTILITY_STEAM_APP_IDS = new Set([
  '431960', // Wallpaper Engine
  '388080', // Borderless Gaming
  '993090', // Lossless Scaling
  '629520', // Soundpad
  '223850', // 3DMark
  '400040', // ShareX
  '1905180', // OBS Studio
  '607380', // Fences
]);

const UTILITY_TITLES = new Set([
  'wallpaper engine',
  'borderless gaming',
  'lossless scaling',
  'soundpad',
  '3dmark',
  'sharex',
  'obs studio',
]);

const UTILITY_EXECUTABLES = new Set([
  'wallpaper64.exe',
  'wallpaper32.exe',
  'borderlessgaming.exe',
  'losslessscaling.exe',
]);

/**
 * Curated cross-platform catalog mapping normalized game titles (and known EA/launcher IDs)
 * to official Steam AppIDs where developer community announcements are published.
 */
const KNOWN_CROSS_PLATFORM_STEAM_APP_IDS: Record<string, string> = {
  // EA Games
  'ea sports fc 27': '4080220',
  'fc 27': '4080220',
  'ea sports fc 26': '3239620',
  'fc 26': '3239620',
  'ea sports fc 25': '2669320',
  'fc 25': '2669320',
  'ea sports fc 24': '2195250',
  'fc 24': '2195250',
  'ea sports fc': '2669320',
  'fifa 23': '1811260',
  'f1 25': '3059520',
  'f1 24': '2488620',
  'f1 23': '2108330',
  'it takes two': '1426210',
  'ittakestwo': '1426210',
  'split fiction': '2001120',
  'a way out': '1222700',
  'apex legends': '1172470',
  'the sims 4': '1222670',
  'sims 4': '1222670',
  'battlefield 2042': '1517290',
  'battlefield v': '1238810',
  'battlefield 5': '1238810',
  'battlefield 1': '1238840',
  'star wars jedi survivor': '1774580',
  'star wars jedi fallen order': '1172380',
  'need for speed unbound': '1846380',
  'need for speed heat': '1222680',
  'dead space': '1693980',
  'dragon age the veilguard': '1845910',
  'mass effect legendary edition': '1328670',
  'titanfall 2': '1237970',

  // Ubisoft Games
  'tom clancys rainbow six siege': '359550',
  'rainbow six siege': '359550',
  'r6 siege': '359550',
  'assassins creed shadows': '3159330',
  'assassins creed mirage': '3035570',
  'assassins creed valhalla': '2208920',
  'assassins creed odyssey': '812140',
  'assassins creed origins': '582160',
  'far cry 6': '2369390',
  'far cry 5': '552520',
  'tom clancys the division 2': '2221490',
  'the division 2': '2221490',
  'for honor': '304390',
  'the crew motorfest': '2698940',
  'riders republic': '2290180',
  'watch dogs legion': '2239550',
  'anno 1800': '916440',

  // Rockstar Games
  'grand theft auto v': '271590',
  'grand theft auto 5': '271590',
  'gta v': '271590',
  'gta 5': '271590',
  'red dead redemption 2': '1174180',
  'rdr2': '1174180',
  'red dead redemption': '2668510',
  'grand theft auto iv': '12210',
  'gta iv': '12210',

  // Popular PC / Custom / Xbox / Epic / GOG Titles
  'forza horizon 5': '1551360',
  'forzahorizon5': '1551360',
  'forza horizon 4': '1293830',
  'forza motorsport': '2440510',
  'marvels spiderman miles morales': '1817190',
  'marvels spider man miles morales': '1817190',
  'spider man miles morales': '1817190',
  'spiderman miles morales': '1817190',
  'miles morales': '1817190',
  'marvels spiderman remastered': '1817070',
  'marvels spider man remastered': '1817070',
  'spider man remastered': '1817070',
  'marvels spiderman 2': '2651280',
  'marvels spider man 2': '2651280',
  'spider man 2': '2651280',
  'repo': '3241660',
  'r e p o': '3241660',
  'schedule i': '3164500',
  'schedule 1': '3164500',
  'cyberpunk 2077': '1091500',
  'the witcher 3 wild hunt': '292030',
  'the witcher 3': '292030',
  'witcher 3': '292030',
  'baldurs gate 3': '1086940',
  'elden ring': '1245620',
  'helldivers 2': '553850',
  'palworld': '1623730',
  'black myth wukong': '2358720',
  'counter strike 2': '730',
  'cs2': '730',
  'dota 2': '570',
  'pubg battlegrounds': '578080',
  'overwatch 2': '2357570',
  'diablo iv': '2344520',
  'diablo 4': '2344520',
  'call of duty': '1938090',
  'rocket league': '252950',
  'fall guys': '1097150',
  'dead by daylight': '381210',
  'destiny 2': '1085660',
  'warframe': '230410',
  'path of exile 2': '2694490',
  'path of exile': '238960',
  'rust': '252490',
  'terraria': '105600',
  'stardew valley': '413150',
  'hollow knight': '367520',
  'god of war': '1593500',
  'god of war ragnarok': '2322010',
  'ghost of tsushima directors cut': '2215430',
  'ghost of tsushima': '2215430',
  'horizon forbidden west': '2420110',
  'horizon zero dawn': '1151640',
  'the last of us part i': '1888930',
  'lethal company': '1966720',
  'phasmophobia': '739630',
  'among us': '945360',
  'valheim': '892970',
  'no mans sky': '275850',
  'monster hunter wilds': '2246340',
  'monster hunter world': '582010',
};

const KNOWN_EA_CONTENT_ID_TO_STEAM_APP_ID: Record<string, string> = {
  '16425884': '4080220', // EA SPORTS FC 27
  '16425845': '3059520', // F1 25
  '16050355': '1426210', // It Takes Two
};

export type ResolvedNewsProviderDescriptor =
  | {
      providerId: 'riot-official';
      providerName: 'Riot Games Official';
      endpointUrl: string;
      baseOrigin: string;
      defaultArticleUrl: string;
    }
  | {
      providerId: 'epic-fortnite';
      providerName: 'Epic Games Official';
      endpointUrl: string;
      fallbackEndpointUrl: string;
      defaultArticleUrl: string;
    }
  | {
      providerId: 'ea-official';
      providerName: 'EA Sports Official';
      endpointUrl: string;
      eaSlug: string;
      fallbackSteamAppId: string;
      defaultArticleUrl: string;
    }
  | {
      providerId: 'steam-news';
      providerName: 'Steam Official News';
      steamAppId: string;
    };

export function normalizeGameTitleForNews(rawTitle: string): string {
  if (!rawTitle) return '';
  return rawTitle
    .toLowerCase()
    .replace(/[™®©]/g, '')
    // Strip trailing version patterns such as ".v0.4.6f13", " v1.2.3", "-build-123"
    .replace(/([.\s_-]+v\d+(?:[.\d\w_-]*)?)$/i, '')
    .replace(/\.exe$/i, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function isUtilityApplication(game: GameItem): boolean {
  const extId = String(
    (game as unknown as { externalAppId?: string }).externalAppId ?? ''
  ).trim();
  if (UTILITY_STEAM_APP_IDS.has(extId)) return true;

  for (const utilId of UTILITY_STEAM_APP_IDS) {
    if (game.id.endsWith(`-${utilId}`) || game.id === `steam-${utilId}`) {
      return true;
    }
  }

  const normTitle = normalizeGameTitleForNews(game.title);
  if (UTILITY_TITLES.has(normTitle)) return true;

  const exePath = (game.executablePath ?? extId).toLowerCase();
  for (const exe of UTILITY_EXECUTABLES) {
    if (exePath.endsWith(exe)) return true;
  }

  return false;
}

export function isUpdateArticle(
  headline: string,
  category?: string,
  summary?: string
): boolean {
  const combined = `${headline} ${category ?? ''} ${summary ?? ''}`;
  return /\b(patch|update|hotfix|release notes|changelog|version|v\d+\.\d+|developer notes|dev notes|pitch notes|title update|bug fix|balance|maintenance)\b/i.test(
    combined
  );
}

export function resolveNewsProviderDescriptor(
  game: GameItem
): ResolvedNewsProviderDescriptor | null {
  const extId = String(
    (game as unknown as { externalAppId?: string }).externalAppId ?? ''
  )
    .trim()
    .toLowerCase();
  const normTitle = normalizeGameTitleForNews(game.title);
  const idLower = (game.id ?? '').toLowerCase();

  // 1. Riot Games Official Provider
  if (
    extId === 'league_of_legends' ||
    extId === 'leagueoflegends' ||
    normTitle === 'league of legends' ||
    idLower.includes('league-of-legends')
  ) {
    return {
      providerId: 'riot-official',
      providerName: 'Riot Games Official',
      endpointUrl: 'https://www.leagueoflegends.com/en-us/news/',
      baseOrigin: 'https://www.leagueoflegends.com',
      defaultArticleUrl: 'https://www.leagueoflegends.com/en-us/news/',
    };
  }

  if (
    extId === 'valorant' ||
    normTitle === 'valorant' ||
    idLower.includes('valorant')
  ) {
    return {
      providerId: 'riot-official',
      providerName: 'Riot Games Official',
      endpointUrl: 'https://playvalorant.com/en-us/news/',
      baseOrigin: 'https://playvalorant.com',
      defaultArticleUrl: 'https://playvalorant.com/en-us/news/',
    };
  }

  if (
    extId === 'teamfighttactics' ||
    extId === 'tft' ||
    normTitle === 'teamfight tactics' ||
    idLower.includes('ghttactics') ||
    idLower.includes('teamfight-tactics')
  ) {
    return {
      providerId: 'riot-official',
      providerName: 'Riot Games Official',
      endpointUrl: 'https://teamfighttactics.leagueoflegends.com/en-us/news/',
      baseOrigin: 'https://teamfighttactics.leagueoflegends.com',
      defaultArticleUrl: 'https://teamfighttactics.leagueoflegends.com/en-us/news/',
    };
  }

  if (
    extId === 'bacon' ||
    extId === 'legends_of_runeterra' ||
    normTitle === 'legends of runeterra'
  ) {
    return {
      providerId: 'riot-official',
      providerName: 'Riot Games Official',
      endpointUrl: 'https://playruneterra.com/en-us/news/',
      baseOrigin: 'https://playruneterra.com',
      defaultArticleUrl: 'https://playruneterra.com/en-us/news/',
    };
  }

  // 2. Epic Games Fortnite Official Provider
  if (
    extId === 'fortnite' ||
    normTitle === 'fortnite' ||
    idLower.includes('fortnite')
  ) {
    return {
      providerId: 'epic-fortnite',
      providerName: 'Epic Games Official',
      endpointUrl: 'https://fortnite-api.com/v2/news',
      fallbackEndpointUrl:
        'https://fortnitecontent-website-prod07.ol.epicgames.com/content/api/pages/fortnite-game',
      defaultArticleUrl: 'https://www.fortnite.com/news',
    };
  }

  // 3. EA SPORTS FC Official Provider (with Steam fallback)
  if (
    normTitle.startsWith('ea sports fc') ||
    /^fc 2[4567]$/.test(normTitle) ||
    extId === '16425884'
  ) {
    let eaSlug = 'fc-27';
    let fallbackSteamAppId = '4080220';
    if (normTitle.includes('26')) {
      eaSlug = 'fc-26';
      fallbackSteamAppId = '3239620';
    } else if (normTitle.includes('25')) {
      eaSlug = 'fc-25';
      fallbackSteamAppId = '2669320';
    } else if (normTitle.includes('24')) {
      eaSlug = 'fc-25';
      fallbackSteamAppId = '2195250';
    }

    return {
      providerId: 'ea-official',
      providerName: 'EA Sports Official',
      endpointUrl: `https://www.ea.com/games/ea-sports-fc/${eaSlug}/news`,
      eaSlug,
      fallbackSteamAppId,
      defaultArticleUrl: `https://www.ea.com/games/ea-sports-fc/${eaSlug}/news`,
    };
  }

  // 4. Native Steam Game
  if (game.platformId === 'steam') {
    const rawAppId =
      extId && /^\d+$/.test(extId)
        ? extId
        : game.id.match(/(\d+)$/)?.[1] ?? '';
    if (rawAppId && /^\d+$/.test(rawAppId)) {
      return {
        providerId: 'steam-news',
        providerName: 'Steam Official News',
        steamAppId: rawAppId,
      };
    }
  }

  // 5. Known EA Content ID -> Steam AppID
  if (extId && KNOWN_EA_CONTENT_ID_TO_STEAM_APP_ID[extId]) {
    return {
      providerId: 'steam-news',
      providerName: 'Steam Official News',
      steamAppId: KNOWN_EA_CONTENT_ID_TO_STEAM_APP_ID[extId],
    };
  }

  // 6. Cross-platform Catalog Title -> Steam AppID
  if (normTitle && KNOWN_CROSS_PLATFORM_STEAM_APP_IDS[normTitle]) {
    return {
      providerId: 'steam-news',
      providerName: 'Steam Official News',
      steamAppId: KNOWN_CROSS_PLATFORM_STEAM_APP_IDS[normTitle],
    };
  }

  return null;
}

function cleanTextSummary(raw: string, maxLen = 240): string {
  if (!raw) return 'No description available.';
  const cleaned = raw
    .replace(/\{STEAM_CLAN_IMAGE\}\/[^\s[\]"<>]+/gi, '')
    .replace(/<[^>]*>?/gm, ' ')
    .replace(/\[\/?(b|i|u|h1|h2|h3|url|img|list|quote|code|spoiler|table|tr|td|th|hr|\*)[^\]]*\]/gi, ' ')
    .replace(/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp)\S*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 'Official update and announcement details.';
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen).trim()}...` : cleaned;
}

function extractSteamImage(contents: string): string | undefined {
  if (!contents) return undefined;
  const clanMatch = contents.match(/\{STEAM_CLAN_IMAGE\}\/([^\s[\]"<>]+\.(?:jpg|jpeg|png|webp))/i);
  if (clanMatch?.[1]) {
    return `https://clan.akamai.steamstatic.com/images/${clanMatch[1]}`;
  }
  const urlMatch = contents.match(/https?:\/\/[^\s[\]"<>]+\.(?:jpg|jpeg|png|webp)/i);
  if (urlMatch?.[0]) {
    return urlMatch[0];
  }
  return undefined;
}

function normalizePublishedIso(rawDate: string | number | undefined): string | null {
  if (rawDate === undefined || rawDate === null || rawDate === '') return null;
  let ms: number;
  if (typeof rawDate === 'number') {
    ms = rawDate < 1e11 ? rawDate * 1000 : rawDate;
  } else {
    ms = Date.parse(rawDate);
  }
  if (Number.isNaN(ms) || ms <= 0) return null;
  // Clamp timestamps more than 48 hours in the future to current time
  const maxFutureMs = Date.now() + 48 * 60 * 60 * 1000;
  if (ms > maxFutureMs) {
    ms = Date.now();
  }
  return new Date(ms).toISOString();
}

function makeArticleId(gameId: string, uniquePart: string): string {
  return createHash('sha256')
    .update(`${gameId}_${uniquePart}`)
    .digest('hex')
    .slice(0, 16);
}

export class NewsService {
  private cache: GameNewsFeedResult | null = null;
  private cacheLibrarySignature = '';
  private cacheTtlMs = 60 * 60 * 1000; // 1 hour TTL
  private lastFetchedAtMs = 0;
  private activeRefreshPromise: Promise<GameNewsFeedResult> | null = null;
  private timeoutMs = 6500;

  constructor(options?: { cacheTtlMs?: number; timeoutMs?: number }) {
    if (options?.cacheTtlMs) this.cacheTtlMs = options.cacheTtlMs;
    if (options?.timeoutMs) this.timeoutMs = options.timeoutMs;
  }

  public async getLibraryNews(
    games: GameItem[],
    options?: { forceRefresh?: boolean; gameId?: string; platformId?: string }
  ): Promise<GameNewsFeedResult> {
    const signature = games
      .map((g) => `${g.id}:${g.platformId}:${g.title}:${g.coverImage ?? ''}`)
      .join('|');

    const now = Date.now();
    const isCacheValid =
      !options?.forceRefresh &&
      this.cache !== null &&
      this.cacheLibrarySignature === signature &&
      now - this.lastFetchedAtMs < this.cacheTtlMs;

    if (isCacheValid && this.cache) {
      return this.filterResult(this.cache, games, options);
    }

    // Prevent duplicate concurrent refresh requests for the same library
    if (this.activeRefreshPromise && this.cacheLibrarySignature === signature) {
      const sharedResult = await this.activeRefreshPromise;
      return this.filterResult(sharedResult, games, options);
    }

    this.cacheLibrarySignature = signature;
    this.activeRefreshPromise = this.fetchAllProviders(games, now);

    try {
      const result = await this.activeRefreshPromise;
      return this.filterResult(result, games, options);
    } finally {
      this.activeRefreshPromise = null;
    }
  }

  private async fetchAllProviders(
    games: GameItem[],
    now: number
  ): Promise<GameNewsFeedResult> {
    try {
      const allArticles: GameNewsItem[] = [];
      const gameCoverage: GameNewsCoverageItem[] = [];
      let supportedGamesCount = 0;
      let unsupportedGamesCount = 0;
      let failedProvidersCount = 0;
      let successfulFetchesCount = 0;

      // Evaluate up to 25 library games
      const targetGames = games.slice(0, 25);

      const tasks = targetGames.map(async (game) => {
        const isUtility = isUtilityApplication(game);
        const descriptor = resolveNewsProviderDescriptor(game);

        if (!descriptor) {
          unsupportedGamesCount++;
          gameCoverage.push({
            gameId: game.id,
            gameTitle: game.title,
            platformId: game.platformId,
            gameCoverUrl: game.coverImage,
            providerId: 'unsupported',
            providerName: 'Unsupported',
            status: 'unsupported',
            articleCount: 0,
            statusMessage: UNSUPPORTED_NEWS_SOURCE_MESSAGE,
            isUtilityExcluded: isUtility,
          });
          return;
        }

        supportedGamesCount++;

        const outcome = await this.fetchGameArticlesWithDescriptor(
          game,
          descriptor,
          isUtility
        );

        if (outcome.networkFailed) {
          failedProvidersCount++;
          gameCoverage.push({
            gameId: game.id,
            gameTitle: game.title,
            platformId: game.platformId,
            gameCoverUrl: game.coverImage,
            providerId: descriptor.providerId,
            providerName: descriptor.providerName,
            status: this.cache ? 'refresh-failed' : 'temporarily-unavailable',
            articleCount: 0,
            statusMessage:
              outcome.errorMessage ||
              'News provider is temporarily unavailable.',
            isUtilityExcluded: isUtility,
          });
          return;
        }

        successfulFetchesCount++;

        if (outcome.articles.length === 0) {
          gameCoverage.push({
            gameId: game.id,
            gameTitle: game.title,
            platformId: game.platformId,
            gameCoverUrl: game.coverImage,
            providerId: descriptor.providerId,
            providerName: descriptor.providerName,
            status: 'no-articles',
            articleCount: 0,
            statusMessage: 'No recent announcements published by this source.',
            isUtilityExcluded: isUtility,
          });
          return;
        }

        allArticles.push(...outcome.articles);
        gameCoverage.push({
          gameId: game.id,
          gameTitle: game.title,
          platformId: game.platformId,
          gameCoverUrl: game.coverImage,
          providerId: descriptor.providerId,
          providerName: descriptor.providerName,
          status: 'available',
          articleCount: outcome.articles.length,
          statusMessage: isUtility
            ? `${outcome.articles.length} articles cached (utility hidden in main feed)`
            : `${outcome.articles.length} official articles available`,
          isUtilityExcluded: isUtility,
        });
      });

      await Promise.allSettled(tasks);

      // Preserve game order in coverage
      const orderMap = new Map(targetGames.map((g, idx) => [g.id, idx]));
      gameCoverage.sort(
        (a, b) => (orderMap.get(a.gameId) ?? 999) - (orderMap.get(b.gameId) ?? 999)
      );

      const allProvidersFailed =
        supportedGamesCount > 0 &&
        successfulFetchesCount === 0 &&
        failedProvidersCount > 0;

      if (allProvidersFailed) {
        if (this.cache) {
          // Retain previously cached articles and do NOT overwrite lastUpdatedIso
          return {
            ...this.cache,
            isOffline: true,
            failedProvidersCount,
            totalGamesEvaluated: targetGames.length,
            refreshError:
              'Unable to reach news providers. Displaying previously cached articles.',
          };
        }
        return {
          articles: [],
          lastUpdatedIso: new Date(now).toISOString(),
          supportedGamesCount,
          unsupportedGamesCount,
          isOffline: true,
          gameCoverage,
          failedProvidersCount,
          totalGamesEvaluated: targetGames.length,
          refreshError:
            'Unable to reach news providers. Check your internet connection and try refreshing.',
        };
      }

      // Deduplicate articles per game by URL and normalized headline
      const seenKeys = new Set<string>();
      const dedupedArticles: GameNewsItem[] = [];
      for (const article of allArticles) {
        if (!article.headline?.trim()) continue;
        if (!NewsService.isValidExternalUrl(article.url)) continue;

        const normHeadline = article.headline.trim().toLowerCase();
        const urlKey = `${article.gameId}::url::${article.url.trim().toLowerCase()}`;
        const titleKey = `${article.gameId}::title::${normHeadline}`;
        const idKey = `${article.gameId}::id::${article.id}`;

        // If URL is generic landing page (e.g. fortnite.com/news), deduplicate by headline/id
        const isGenericUrl =
          article.url === 'https://www.fortnite.com/news' ||
          article.url.endsWith('/en-us/news/');

        if ((!isGenericUrl && seenKeys.has(urlKey)) || seenKeys.has(titleKey) || seenKeys.has(idKey)) {
          continue;
        }
        seenKeys.add(urlKey);
        seenKeys.add(titleKey);
        seenKeys.add(idKey);
        dedupedArticles.push(article);
      }

      // Sort newest first
      dedupedArticles.sort(
        (a, b) => Date.parse(b.publishedAtIso) - Date.parse(a.publishedAtIso)
      );

      const finalResult: GameNewsFeedResult = {
        articles: dedupedArticles,
        lastUpdatedIso: new Date(now).toISOString(),
        supportedGamesCount,
        unsupportedGamesCount,
        isOffline: false,
        gameCoverage,
        failedProvidersCount,
        totalGamesEvaluated: targetGames.length,
        refreshError:
          failedProvidersCount > 0
            ? `${failedProvidersCount} news provider(s) failed to respond during refresh.`
            : undefined,
      };

      this.cache = finalResult;
      this.lastFetchedAtMs = now;
      return finalResult;
    } catch {
      if (this.cache) {
        return {
          ...this.cache,
          isOffline: true,
          refreshError:
            'Unable to refresh feed. Displaying previously cached articles.',
        };
      }
      return {
        articles: [],
        lastUpdatedIso: new Date(now).toISOString(),
        supportedGamesCount: 0,
        unsupportedGamesCount: games.length,
        isOffline: true,
        gameCoverage: [],
        failedProvidersCount: 1,
        totalGamesEvaluated: games.length,
        refreshError: 'Failed to load game news feed.',
      };
    }
  }

  private async fetchWithTimeout(
    url: string,
    init?: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, {
        ...init,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'application/json, text/html, application/xhtml+xml, */*',
          ...(init?.headers ?? {}),
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchGameArticlesWithDescriptor(
    game: GameItem,
    descriptor: ResolvedNewsProviderDescriptor,
    isUtility: boolean
  ): Promise<{
    articles: GameNewsItem[];
    networkFailed: boolean;
    errorMessage?: string;
  }> {
    try {
      switch (descriptor.providerId) {
        case 'riot-official':
          return await this.fetchRiotNews(game, descriptor, isUtility);
        case 'epic-fortnite':
          return await this.fetchFortniteNews(game, descriptor, isUtility);
        case 'ea-official':
          return await this.fetchEaNews(game, descriptor, isUtility);
        case 'steam-news':
          return await this.fetchSteamNews(
            game,
            descriptor.steamAppId,
            descriptor.providerName,
            isUtility
          );
      }
    } catch (err) {
      return {
        articles: [],
        networkFailed: true,
        errorMessage:
          err instanceof Error ? err.message : 'Network error fetching news',
      };
    }
  }

  private async fetchSteamNews(
    game: GameItem,
    appId: string,
    providerName: string,
    isUtility: boolean
  ): Promise<{
    articles: GameNewsItem[];
    networkFailed: boolean;
    errorMessage?: string;
  }> {
    if (!appId || !/^\d+$/.test(appId)) {
      return { articles: [], networkFailed: false };
    }

    try {
      const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${encodeURIComponent(
        appId
      )}&count=12&maxlength=420&format=json`;

      const res = await this.fetchWithTimeout(url);
      if (!res.ok) {
        return {
          articles: [],
          networkFailed: true,
          errorMessage: `Steam News API returned HTTP ${res.status}`,
        };
      }

      const data = (await res.json()) as {
        appnews?: {
          newsitems?: Array<{
            gid?: string;
            title?: string;
            url?: string;
            author?: string;
            contents?: string;
            feedlabel?: string;
            feedname?: string;
            feed_type?: number;
            date?: number;
          }>;
        };
      };

      const rawItems = data.appnews?.newsitems ?? [];
      if (rawItems.length === 0) {
        return { articles: [], networkFailed: false };
      }

      // Filter out non-English Cyrillic syndication and generic SteamDB top-seller spam when official announcements exist
      const hasOfficialOrEnglish = rawItems.some(
        (item) =>
          item.feed_type === 1 ||
          item.feedname === 'steam_community_announcements' ||
          (item.title &&
            !/[А-Яа-яЁё]/.test(item.title) &&
            !item.title.startsWith('Steam Global Top Sellers'))
      );

      const filteredRaw = hasOfficialOrEnglish
        ? rawItems.filter((item) => {
            if (!item.title) return false;
            if (/[А-Яа-яЁё]/.test(item.title)) return false;
            if (
              item.feedlabel === 'SteamDB' &&
              item.title.startsWith('Steam Global Top Sellers')
            ) {
              return false;
            }
            return true;
          })
        : rawItems;

      // Prioritize official community announcements (feed_type === 1) if available
      const officialAnnouncements = filteredRaw.filter(
        (item) =>
          item.feed_type === 1 ||
          item.feedname === 'steam_community_announcements'
      );
      const selectedItems = (
        officialAnnouncements.length >= 2 ? officialAnnouncements : filteredRaw
      ).slice(0, MAX_ARTICLES_PER_GAME);

      const articles: GameNewsItem[] = [];
      for (const item of selectedItems) {
        const headline = (item.title ?? '').trim();
        if (!headline) continue;

        const dateIso =
          normalizePublishedIso(item.date) ?? new Date().toISOString();
        const rawUrl = (item.url ?? '').trim();
        const safeUrl = NewsService.isValidExternalUrl(rawUrl)
          ? rawUrl
          : `https://store.steampowered.com/news/app/${appId}`;

        const cleanSummary = cleanTextSummary(item.contents ?? '');
        const articleImageUrl = extractSteamImage(item.contents ?? '');
        const category =
          item.feed_type === 1 ||
          item.feedname === 'steam_community_announcements'
            ? 'Community Announcements'
            : item.feedlabel || 'Game News';

        const articleId =
          item.gid || makeArticleId(game.id, `${safeUrl}_${headline}`);

        articles.push({
          id: String(articleId),
          gameId: game.id,
          gameTitle: game.title,
          gameCoverUrl: game.coverImage,
          articleImageUrl,
          platformId: game.platformId,
          headline,
          summary: cleanSummary,
          url: safeUrl,
          source: item.feedlabel || providerName,
          publishedAtIso: dateIso,
          author: item.author || undefined,
          category,
          isUpdate: isUpdateArticle(headline, category, cleanSummary),
          isRecent: Date.now() - Date.parse(dateIso) <= RECENT_THRESHOLD_MS,
          providerId: 'steam-news',
          isUtilityApp: isUtility,
        });
      }

      return { articles, networkFailed: false };
    } catch (err) {
      return {
        articles: [],
        networkFailed: true,
        errorMessage:
          err instanceof Error ? err.message : 'Failed to fetch Steam news',
      };
    }
  }

  private async fetchRiotNews(
    game: GameItem,
    descriptor: Extract<
      ResolvedNewsProviderDescriptor,
      { providerId: 'riot-official' }
    >,
    isUtility: boolean
  ): Promise<{
    articles: GameNewsItem[];
    networkFailed: boolean;
    errorMessage?: string;
  }> {
    try {
      const res = await this.fetchWithTimeout(descriptor.endpointUrl);
      if (!res.ok) {
        return {
          articles: [],
          networkFailed: true,
          errorMessage: `Riot News returned HTTP ${res.status}`,
        };
      }

      const rawText = await res.text();
      let items: Array<{
        title?: string;
        publishedAt?: string;
        category?: { title?: string };
        description?: { body?: string };
        action?: { payload?: { url?: string } };
        media?: { url?: string };
      }> = [];

      // Support both __NEXT_DATA__ HTML from Riot's official site and direct JSON payloads in tests
      const nextDataIdx = rawText.indexOf('__NEXT_DATA__');
      if (nextDataIdx !== -1) {
        const jsonStart = rawText.indexOf('>', nextDataIdx) + 1;
        const jsonEnd = rawText.indexOf('</script>', jsonStart);
        if (jsonStart > 0 && jsonEnd > jsonStart) {
          const parsed = JSON.parse(rawText.slice(jsonStart, jsonEnd)) as {
            props?: {
              pageProps?: {
                page?: {
                  blades?: Array<{
                    items?: typeof items;
                  }>;
                };
              };
            };
          };
          const blades = parsed.props?.pageProps?.page?.blades ?? [];
          const articleBlade = blades.find(
            (b) => Array.isArray(b.items) && b.items.length > 0
          );
          items = articleBlade?.items ?? [];
        }
      } else {
        try {
          const parsedJson = JSON.parse(rawText) as {
            items?: typeof items;
            articles?: typeof items;
          };
          items = parsedJson.items ?? parsedJson.articles ?? [];
        } catch {
          items = [];
        }
      }

      const articles: GameNewsItem[] = [];
      for (const item of items.slice(0, MAX_ARTICLES_PER_GAME)) {
        const headline = (item.title ?? '').trim();
        if (!headline) continue;

        const dateIso =
          normalizePublishedIso(item.publishedAt) ?? new Date().toISOString();
        const rawActionUrl = item.action?.payload?.url?.trim() ?? '';
        let resolvedUrl = descriptor.defaultArticleUrl;
        if (rawActionUrl.startsWith('https://') || rawActionUrl.startsWith('http://')) {
          resolvedUrl = rawActionUrl;
        } else if (rawActionUrl.startsWith('/')) {
          resolvedUrl = `${descriptor.baseOrigin}${rawActionUrl}`;
        }

        const category = item.category?.title || 'Game Updates';
        const summary = cleanTextSummary(
          item.description?.body ||
            `${game.title} — ${category}: ${headline}`
        );

        articles.push({
          id: makeArticleId(game.id, `${resolvedUrl}_${headline}`),
          gameId: game.id,
          gameTitle: game.title,
          gameCoverUrl: game.coverImage,
          articleImageUrl: item.media?.url,
          platformId: game.platformId,
          headline,
          summary,
          url: resolvedUrl,
          source: `Riot Games • ${category}`,
          publishedAtIso: dateIso,
          author: 'Riot Games',
          category,
          isUpdate: isUpdateArticle(headline, category, summary),
          isRecent: Date.now() - Date.parse(dateIso) <= RECENT_THRESHOLD_MS,
          providerId: 'riot-official',
          isUtilityApp: isUtility,
        });
      }

      return { articles, networkFailed: false };
    } catch (err) {
      return {
        articles: [],
        networkFailed: true,
        errorMessage:
          err instanceof Error ? err.message : 'Failed to fetch Riot news',
      };
    }
  }

  private async fetchFortniteNews(
    game: GameItem,
    descriptor: Extract<
      ResolvedNewsProviderDescriptor,
      { providerId: 'epic-fortnite' }
    >,
    isUtility: boolean
  ): Promise<{
    articles: GameNewsItem[];
    networkFailed: boolean;
    errorMessage?: string;
  }> {
    // Try primary Fortnite BR News endpoint first, then fallback to Epic Content API
    try {
      const res = await this.fetchWithTimeout(descriptor.endpointUrl);
      if (res.ok) {
        const json = (await res.json()) as {
          data?: {
            br?: {
              date?: string;
              motds?: Array<{
                id?: string;
                title?: string;
                tabTitle?: string;
                body?: string;
                image?: string;
                tileImage?: string;
                websiteUrl?: string;
                hidden?: boolean;
              }>;
            };
            motds?: Array<{
              id?: string;
              title?: string;
              tabTitle?: string;
              body?: string;
              image?: string;
              tileImage?: string;
              websiteUrl?: string;
              hidden?: boolean;
            }>;
          };
        };

        const feedDateIso =
          normalizePublishedIso(json.data?.br?.date) ?? new Date().toISOString();
        const feedBaseMs = Date.parse(feedDateIso);
        const motds = json.data?.br?.motds ?? json.data?.motds ?? [];

        if (motds.length > 0) {
          const articles: GameNewsItem[] = [];
          motds
            .filter((m) => !m.hidden && (m.title || m.tabTitle))
            .slice(0, MAX_ARTICLES_PER_GAME)
            .forEach((motd, idx) => {
              const headline = (motd.title || motd.tabTitle || '').trim();
              if (!headline) return;
              const summary = cleanTextSummary(motd.body ?? '');
              const itemDateIso = new Date(
                Math.max(1000, feedBaseMs - idx * 36 * 3600 * 1000)
              ).toISOString();
              const itemUrl =
                motd.websiteUrl && NewsService.isValidExternalUrl(motd.websiteUrl)
                  ? motd.websiteUrl
                  : descriptor.defaultArticleUrl;

              articles.push({
                id: motd.id || makeArticleId(game.id, headline),
                gameId: game.id,
                gameTitle: game.title,
                gameCoverUrl: game.coverImage,
                articleImageUrl: motd.tileImage || motd.image,
                platformId: game.platformId,
                headline,
                summary,
                url: itemUrl,
                source: 'Epic Games • Battle Royale News',
                publishedAtIso: itemDateIso,
                author: 'Epic Games',
                category: 'Battle Royale Update',
                isUpdate: isUpdateArticle(headline, 'Update', summary),
                isRecent:
                  Date.now() - Date.parse(itemDateIso) <= RECENT_THRESHOLD_MS,
                providerId: 'epic-fortnite',
                isUtilityApp: isUtility,
              });
            });

          if (articles.length > 0) {
            return { articles, networkFailed: false };
          }
        }
      }
    } catch {
      // Fall through to official Epic Content API
    }

    try {
      const fallbackRes = await this.fetchWithTimeout(
        descriptor.fallbackEndpointUrl
      );
      if (!fallbackRes.ok) {
        return {
          articles: [],
          networkFailed: true,
          errorMessage: `Fortnite News API returned HTTP ${fallbackRes.status}`,
        };
      }

      const fnJson = (await fallbackRes.json()) as {
        lastModified?: string;
        battleroyalenews?: {
          lastModified?: string;
          news?: {
            motds?: Array<{
              id?: string;
              title?: string;
              body?: string;
              image?: string;
              tileImage?: string;
              websiteUrl?: string;
            }>;
            messages?: Array<{
              title?: string;
              body?: string;
              image?: string;
            }>;
          };
        };
      };

      const baseIso =
        normalizePublishedIso(
          fnJson.battleroyalenews?.lastModified || fnJson.lastModified
        ) ?? new Date().toISOString();
      const rawMessages =
        fnJson.battleroyalenews?.news?.motds?.length
          ? fnJson.battleroyalenews.news.motds
          : fnJson.battleroyalenews?.news?.messages ?? [];

      const articles: GameNewsItem[] = [];
      for (const msg of rawMessages.slice(0, MAX_ARTICLES_PER_GAME)) {
        const headline = (msg.title ?? '').trim();
        if (!headline) continue;
        const summary = cleanTextSummary(msg.body ?? '');
        articles.push({
          id: makeArticleId(game.id, headline),
          gameId: game.id,
          gameTitle: game.title,
          gameCoverUrl: game.coverImage,
          articleImageUrl: msg.image,
          platformId: game.platformId,
          headline,
          summary,
          url: descriptor.defaultArticleUrl,
          source: 'Epic Games • Fortnite',
          publishedAtIso: baseIso,
          author: 'Epic Games',
          category: 'Announcement',
          isUpdate: isUpdateArticle(headline, 'Announcement', summary),
          isRecent: Date.now() - Date.parse(baseIso) <= RECENT_THRESHOLD_MS,
          providerId: 'epic-fortnite',
          isUtilityApp: isUtility,
        });
      }

      return { articles, networkFailed: false };
    } catch (err) {
      return {
        articles: [],
        networkFailed: true,
        errorMessage:
          err instanceof Error ? err.message : 'Failed to fetch Fortnite news',
      };
    }
  }

  private async fetchEaNews(
    game: GameItem,
    descriptor: Extract<
      ResolvedNewsProviderDescriptor,
      { providerId: 'ea-official' }
    >,
    isUtility: boolean
  ): Promise<{
    articles: GameNewsItem[];
    networkFailed: boolean;
    errorMessage?: string;
  }> {
    try {
      const res = await this.fetchWithTimeout(descriptor.endpointUrl);
      if (res.ok) {
        const rawText = await res.text();
        let items: Array<{
          title?: string;
          summary?: string;
          publishingDate?: string;
          slug?: string;
          url?: string;
          type?: string;
          image?: {
            ar16X9?: string;
            ar2X1?: string;
          };
        }> = [];

        const nextIdx = rawText.indexOf('__NEXT_DATA__');
        if (nextIdx !== -1) {
          const jsonStart = rawText.indexOf('>', nextIdx) + 1;
          const jsonEnd = rawText.indexOf('</script>', jsonStart);
          if (jsonStart > 0 && jsonEnd > jsonStart) {
            const parsed = JSON.parse(rawText.slice(jsonStart, jsonEnd)) as {
              props?: {
                pageProps?: {
                  initialNewsData?: {
                    items?: typeof items;
                  };
                };
              };
            };
            items = parsed.props?.pageProps?.initialNewsData?.items ?? [];
          }
        } else {
          try {
            const parsed = JSON.parse(rawText) as {
              items?: typeof items;
              initialNewsData?: { items?: typeof items };
            };
            items =
              parsed.items ?? parsed.initialNewsData?.items ?? [];
          } catch {
            items = [];
          }
        }

        if (items.length > 0) {
          const articles: GameNewsItem[] = [];
          for (const item of items.slice(0, MAX_ARTICLES_PER_GAME)) {
            const headline = (item.title ?? '').trim();
            if (!headline) continue;
            const dateIso =
              normalizePublishedIso(item.publishingDate) ??
              new Date().toISOString();
            const summary = cleanTextSummary(item.summary ?? '');
            const articleUrl =
              item.url && NewsService.isValidExternalUrl(item.url)
                ? item.url
                : item.slug
                ? `https://www.ea.com/games/ea-sports-fc/${descriptor.eaSlug}/news/${item.slug.replace(
                    /^\/+/,
                    ''
                  )}`
                : descriptor.defaultArticleUrl;

            const category = item.type || 'Pitch Notes';

            articles.push({
              id: makeArticleId(game.id, `${articleUrl}_${headline}`),
              gameId: game.id,
              gameTitle: game.title,
              gameCoverUrl: game.coverImage,
              articleImageUrl: item.image?.ar16X9 || item.image?.ar2X1,
              platformId: game.platformId,
              headline,
              summary,
              url: articleUrl,
              source: 'EA SPORTS Official',
              publishedAtIso: dateIso,
              author: 'EA SPORTS',
              category,
              isUpdate: isUpdateArticle(headline, category, summary),
              isRecent: Date.now() - Date.parse(dateIso) <= RECENT_THRESHOLD_MS,
              providerId: 'ea-official',
              isUtilityApp: isUtility,
            });
          }

          if (articles.length > 0) {
            return { articles, networkFailed: false };
          }
        }
      }
    } catch {
      // Fall back to Steam News for the corresponding EA Sports FC AppID
    }

    return await this.fetchSteamNews(
      game,
      descriptor.fallbackSteamAppId,
      'EA Sports (via Steam Official News)',
      isUtility
    );
  }

  private filterResult(
    result: GameNewsFeedResult,
    games: GameItem[],
    options?: { gameId?: string; platformId?: string }
  ): GameNewsFeedResult {
    // Always sync latest cover artwork from live library games
    const gameArtworkMap = new Map<string, string | undefined>();
    for (const g of games) {
      gameArtworkMap.set(
        g.id,
        g.userCoverOverride ||
          g.coverImage ||
          g.heroBackgroundImage ||
          g.iconImage
      );
    }

    let filtered: GameNewsItem[] = result.articles.map((a) => ({
      ...a,
      gameCoverUrl: gameArtworkMap.get(a.gameId) ?? a.gameCoverUrl,
    }));

    if (options?.gameId) {
      filtered = filtered.filter((a) => a.gameId === options.gameId);
    } else {
      // In the default multi-game view, exclude background utilities (like Wallpaper Engine)
      // so they never dominate the user's game news feed
      filtered = filtered.filter((a) => !a.isUtilityApp);
    }

    if (options?.platformId) {
      filtered = filtered.filter((a) => a.platformId === options.platformId);
    }

    // Balance multi-game feed when no single game is selected:
    // Cap per-game count and prioritize recent articles (< 45 days) before older archive announcements
    if (!options?.gameId) {
      const now = Date.now();
      const recentPool: GameNewsItem[] = [];
      const archivePool: GameNewsItem[] = [];
      const perGameRecentCount = new Map<string, number>();
      const perGameArchiveCount = new Map<string, number>();

      for (const item of filtered) {
        const ageMs = now - Date.parse(item.publishedAtIso);
        if (ageMs <= ARCHIVE_DEMOTION_THRESHOLD_MS) {
          const count = perGameRecentCount.get(item.gameId) ?? 0;
          if (count < DEFAULT_FEED_MAX_PER_GAME) {
            perGameRecentCount.set(item.gameId, count + 1);
            recentPool.push(item);
          }
        } else {
          const count = perGameArchiveCount.get(item.gameId) ?? 0;
          if (count < DEFAULT_FEED_MAX_ARCHIVE_PER_GAME) {
            perGameArchiveCount.set(item.gameId, count + 1);
            archivePool.push(item);
          }
        }
      }

      filtered = [...recentPool, ...archivePool];
    }

    const updatedCoverage = result.gameCoverage?.map((c) => ({
      ...c,
      gameCoverUrl: gameArtworkMap.get(c.gameId) ?? c.gameCoverUrl,
    }));

    return {
      ...result,
      articles: filtered,
      gameCoverage: updatedCoverage,
    };
  }

  public clearCache(): void {
    this.cache = null;
    this.cacheLibrarySignature = '';
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
