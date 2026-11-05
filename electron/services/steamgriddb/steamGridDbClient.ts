import type {
  SteamGridDbAsset,
  SteamGridDbArtworkBundle,
  SteamGridDbGame,
  SteamGridDbStatus,
} from '../../../src/shared/types/steamgriddb';
import { SteamGridDbSecretStore } from './steamGridDbSecretStore';

const BASE_URL = 'https://www.steamgriddb.com/api/v2';

/**
 * Normalizes game titles for optimal SteamGridDB search matching without destructively
 * modifying the stored title in the library.
 */
export function normalizeTitleForArtworkSearch(title: string): string {
  if (!title) return '';

  let cleaned = title.trim();

  // 1. Remove file extensions (.exe, .lnk, etc.)
  cleaned = cleaned.replace(/\.(exe|lnk|url|bat|cmd|zip|rar)$/i, '');

  // 2. Remove common version suffixes, build numbers, patch strings:
  // e.g. "Schedule.I.v0.4.6f13" -> "Schedule I", "v1.0.3", "v.1.2.0", "build.12345"
  cleaned = cleaned.replace(/[._-]v\d+(\.\d+)*[a-z0-9]*/gi, ' ');
  cleaned = cleaned.replace(/\bv\d+(\.\d+)*[a-z0-9]*/gi, ' ');
  cleaned = cleaned.replace(/\b(build|patch|update|release|hotfix|early access)[._\s]*#?\d*/gi, ' ');

  // 3. Replace dots and underscores with spaces while preserving single letters/Roman numerals
  cleaned = cleaned.replace(/([a-zA-Z0-9])\.(?=[a-zA-Z0-9])/g, '$1 ');
  cleaned = cleaned.replace(/[_-]+/g, ' ');
  cleaned = cleaned.replace(/\b(build|patch|update|release|hotfix|early access)\s*#?\d*/gi, ' ');

  // 4. Split CamelCase / PascalCase words stuck together:
  // "ItTakesTwo" -> "It Takes Two"
  cleaned = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2');
  cleaned = cleaned.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

  // 5. Standard franchise formatting
  cleaned = cleaned.replace(/\bMarvels\b/gi, "Marvel's");
  cleaned = cleaned.replace(/\bSpider\s*Man\b/gi, "Spider-Man");

  // 6. Remove trademark & copyright symbols
  cleaned = cleaned.replace(/[™®©]/g, '');

  // 7. Collapse whitespace and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Strips punctuation and whitespace for string matching comparison.
 */
function canonicalizeForComparison(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Calculates similarity score (0.0 to 1.0) between two game title strings.
 */
export function calculateTitleSimilarity(a: string, b: string): number {
  const normA = canonicalizeForComparison(a);
  const normB = canonicalizeForComparison(b);

  if (normA === normB) {
    return 1.0;
  }

  if (normA.length === 0 || normB.length === 0) {
    return 0;
  }

  // Exact substring containment
  if (normA.includes(normB) || normB.includes(normA)) {
    const minLen = Math.min(normA.length, normB.length);
    const maxLen = Math.max(normA.length, normB.length);
    const ratio = minLen / maxLen;
    return ratio >= 0.8 ? ratio : ratio * 0.9;
  }

  // Word token overlap
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 1));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 1));

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) {
      intersection++;
    }
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

export class SteamGridDbClient {
  private readonly secretStore: SteamGridDbSecretStore;

  constructor(secretStore: SteamGridDbSecretStore) {
    this.secretStore = secretStore;
  }

  public getSecretStore(): SteamGridDbSecretStore {
    return this.secretStore;
  }

  public isConfigured(): boolean {
    return this.secretStore.hasApiKey();
  }

  private async request<T>(
    endpoint: string,
    overrideApiKey?: string
  ): Promise<{ success: boolean; data?: T; status: number; errorMessage?: string }> {
    const key = overrideApiKey || this.secretStore.getApiKey();
    if (!key) {
      return {
        success: false,
        status: 401,
        errorMessage: 'SteamGridDB API key is not configured.',
      };
    }

    const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          'User-Agent': 'MaSwitch-Desktop/0.2.0',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (response.status === 401) {
        return {
          success: false,
          status: 401,
          errorMessage: 'Invalid or unauthorized SteamGridDB API key.',
        };
      }

      if (response.status === 404) {
        return {
          success: false,
          status: 404,
          errorMessage: 'Requested resource not found on SteamGridDB.',
        };
      }

      if (!response.ok) {
        return {
          success: false,
          status: response.status,
          errorMessage: `SteamGridDB API error (HTTP ${response.status}).`,
        };
      }

      const json = (await response.json()) as { success?: boolean; data?: T; errors?: string[] };
      if (json.success === false) {
        const msg = json.errors?.[0] || 'SteamGridDB returned an unsuccessful response.';
        return { success: false, status: response.status, errorMessage: msg };
      }

      return {
        success: true,
        status: response.status,
        data: json.data,
      };
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'TimeoutError';
      return {
        success: false,
        status: 0,
        errorMessage: isTimeout
          ? 'SteamGridDB connection timed out (12s).'
          : 'Failed to connect to SteamGridDB. Check internet connection.',
      };
    }
  }

  /**
   * Tests connection with SteamGridDB using either stored key or user-provided test key.
   */
  public async testConnection(
    testKey?: string
  ): Promise<{ success: boolean; message: string; status: SteamGridDbStatus['statusText'] }> {
    const key = testKey?.trim() || this.secretStore.getApiKey();
    if (!key) {
      return {
        success: false,
        message: 'No API key provided. Please enter a SteamGridDB v2 API key.',
        status: 'not-configured',
      };
    }

    // Call a reliable lightweight Steam ID endpoint (Wallpaper Engine: 431960)
    const res = await this.request<unknown>('/games/steam/431960', key);

    if (res.success) {
      return {
        success: true,
        message: 'Connected to SteamGridDB successfully! API key is valid.',
        status: 'connected',
      };
    }

    if (res.status === 401) {
      return {
        success: false,
        message: 'Invalid SteamGridDB API key. Please check your credentials.',
        status: 'invalid-key',
      };
    }

    return {
      success: false,
      message: res.errorMessage || 'Network connection error while reaching SteamGridDB.',
      status: 'network-error',
    };
  }

  public async getStatus(): Promise<SteamGridDbStatus> {
    const hasKey = this.secretStore.hasApiKey();
    if (!hasKey) {
      return {
        isConfigured: false,
        isValid: null,
        statusText: 'not-configured',
        lastCheckedIso: null,
      };
    }

    const test = await this.testConnection();
    return {
      isConfigured: true,
      isValid: test.success,
      statusText: test.status,
      lastCheckedIso: new Date().toISOString(),
      errorMessage: test.success ? undefined : test.message,
    };
  }

  /**
   * Searches games by title using autocomplete endpoint.
   */
  public async searchGames(searchTerm: string): Promise<SteamGridDbGame[]> {
    const normalized = normalizeTitleForArtworkSearch(searchTerm);
    if (!normalized || normalized.length < 2) {
      return [];
    }

    const candidateList: SteamGridDbGame[] = [];
    const seenIds = new Set<number>();

    const res = await this.request<
      Array<{
        id: number;
        name: string;
        release_date?: number | null;
        types?: string[];
        verified?: boolean;
      }>
    >(`/search/autocomplete/${encodeURIComponent(normalized)}`);

    if (res.success && Array.isArray(res.data)) {
      for (const g of res.data) {
        if (!seenIds.has(g.id)) {
          seenIds.add(g.id);
          candidateList.push({
            id: g.id,
            name: g.name,
            releaseDate: g.release_date ?? null,
            types: g.types ?? [],
            verified: g.verified ?? false,
          });
        }
      }
    }

    // Acronym dotted fallback: if word is 2-6 letters without dots (e.g. "REPO"), also query "R.E.P.O."
    if (/^[a-zA-Z]{2,6}$/.test(normalized)) {
      const dotted = normalized.split('').join('.') + '.';
      const fallback = await this.request<
        Array<{
          id: number;
          name: string;
          release_date?: number | null;
          types?: string[];
          verified?: boolean;
        }>
      >(`/search/autocomplete/${encodeURIComponent(dotted)}`);

      if (fallback.success && Array.isArray(fallback.data)) {
        for (const g of fallback.data) {
          if (!seenIds.has(g.id)) {
            seenIds.add(g.id);
            candidateList.push({
              id: g.id,
              name: g.name,
              releaseDate: g.release_date ?? null,
              types: g.types ?? [],
              verified: g.verified ?? false,
            });
          }
        }
      }
    }

    return candidateList;
  }

  /**
   * Resolves a Steam App ID directly on SteamGridDB.
   */
  public async findGameBySteamAppId(appId: string | number): Promise<SteamGridDbGame | null> {
    const str = String(appId).trim();
    if (!str || !/^\d+$/.test(str)) {
      return null;
    }

    const res = await this.request<{
      id: number;
      name: string;
      release_date?: number | null;
      types?: string[];
      verified?: boolean;
    }>(`/games/steam/${str}`);

    if (res.success && res.data && typeof res.data.id === 'number') {
      return {
        id: res.data.id,
        name: res.data.name,
        releaseDate: res.data.release_date ?? null,
        types: res.data.types ?? [],
        verified: res.data.verified ?? false,
      };
    }

    return null;
  }

  /**
   * Automatically finds the highest-confidence matching game on SteamGridDB.
   */
  public async findBestMatchingGame(
    rawTitle: string,
    platformId?: string,
    externalAppId?: string | null
  ): Promise<SteamGridDbGame | null> {
    // 1. Direct Steam App ID probe if game is from Steam
    if (platformId === 'steam' && externalAppId && /^\d+$/.test(externalAppId)) {
      const direct = await this.findGameBySteamAppId(externalAppId);
      if (direct) {
        return direct;
      }
    }

    const normalized = normalizeTitleForArtworkSearch(rawTitle);
    const searchResults = await this.searchGames(normalized);

    // 2. Score candidates by title similarity
    let bestMatch: SteamGridDbGame | null = null;
    let highestScore = -1;

    for (const cand of searchResults) {
      const score = calculateTitleSimilarity(normalized, cand.name);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = cand;
      }
    }

    // High confidence threshold (at least 70% match)
    if (highestScore >= 0.7 && bestMatch) {
      return bestMatch;
    }

    // Fallback: if candidate 0 has exact canonical match
    if (searchResults[0] && canonicalizeForComparison(searchResults[0].name) === canonicalizeForComparison(normalized)) {
      return searchResults[0];
    }

    // 3. Fallback for unreleased or future franchise edition numbers:
    // e.g. "EA SPORTS FC 27" -> "EA SPORTS FC"
    const franchiseBase = normalized.replace(/\s+(20\d{2}|\d{2})$/i, '').trim();
    if (franchiseBase && franchiseBase !== normalized) {
      const franchiseResults = await this.searchGames(franchiseBase);
      if (franchiseResults.length > 0) {
        let bestFranchiseMatch: SteamGridDbGame | null = null;
        let highestFranchiseScore = -1;

        for (const cand of franchiseResults) {
          const score = calculateTitleSimilarity(franchiseBase, cand.name);
          if (score > highestFranchiseScore) {
            highestFranchiseScore = score;
            bestFranchiseMatch = cand;
          }
        }

        if (highestFranchiseScore >= 0.7 && bestFranchiseMatch) {
          return bestFranchiseMatch;
        }

        const baseCanon = canonicalizeForComparison(franchiseBase);
        const matchingFranchise = franchiseResults.find((c) =>
          canonicalizeForComparison(c.name).includes(baseCanon)
        );
        if (matchingFranchise) {
          return matchingFranchise;
        }
      }
    }

    return null;
  }

  /**
   * Fetches vertical cover grids for a SteamGridDB game ID.
   */
  public async getGrids(gameId: number): Promise<SteamGridDbAsset[]> {
    // Try preferred 600x900 dimension first
    const res = await this.request<SteamGridDbAsset[]>(
      `/grids/game/${gameId}?dimensions=600x900&types=static&nsfw=false&humor=false`
    );

    if (res.success && Array.isArray(res.data) && res.data.length > 0) {
      return res.data.sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0) || (b.score ?? 0) - (a.score ?? 0));
    }

    // Fallback to any static vertical grids
    const fallback = await this.request<SteamGridDbAsset[]>(
      `/grids/game/${gameId}?types=static&nsfw=false&humor=false`
    );

    if (fallback.success && Array.isArray(fallback.data)) {
      return fallback.data
        .filter((g) => g.width <= g.height)
        .sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0) || (b.score ?? 0) - (a.score ?? 0));
    }

    return [];
  }

  /**
   * Fetches horizontal hero backgrounds for a SteamGridDB game ID.
   */
  public async getHeroes(gameId: number): Promise<SteamGridDbAsset[]> {
    const res = await this.request<SteamGridDbAsset[]>(
      `/heroes/game/${gameId}?types=static&nsfw=false&humor=false`
    );

    if (res.success && Array.isArray(res.data)) {
      return res.data.sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0) || (b.score ?? 0) - (a.score ?? 0));
    }

    return [];
  }

  /**
   * Fetches transparent logos for a SteamGridDB game ID.
   */
  public async getLogos(gameId: number): Promise<SteamGridDbAsset[]> {
    const res = await this.request<SteamGridDbAsset[]>(
      `/logos/game/${gameId}?types=static&nsfw=false&humor=false`
    );

    if (res.success && Array.isArray(res.data)) {
      return res.data.sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0) || (b.score ?? 0) - (a.score ?? 0));
    }

    return [];
  }

  /**
   * Fetches game icons for a SteamGridDB game ID.
   */
  public async getIcons(gameId: number): Promise<SteamGridDbAsset[]> {
    const res = await this.request<SteamGridDbAsset[]>(
      `/icons/game/${gameId}?nsfw=false&humor=false`
    );

    if (res.success && Array.isArray(res.data)) {
      return res.data.sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0) || (b.score ?? 0) - (a.score ?? 0));
    }

    return [];
  }

  /**
   * Retrieves all asset categories (grids, heroes, logos, icons) for a given game in parallel.
   */
  public async getGameArtworkBundle(gameId: number, gameName = ''): Promise<SteamGridDbArtworkBundle> {
    const [grids, heroes, logos, icons] = await Promise.all([
      this.getGrids(gameId),
      this.getHeroes(gameId),
      this.getLogos(gameId),
      this.getIcons(gameId),
    ]);

    return {
      gameId,
      gameName,
      grids,
      heroes,
      logos,
      icons,
    };
  }
}
