import type { PlatformId } from './platform';

export type NewsProviderStatus =
  | 'available'
  | 'no-articles'
  | 'unsupported'
  | 'temporarily-unavailable'
  | 'refresh-failed';

export type NewsSortMode = 'newest' | 'by-game' | 'recent-updates';

export interface GameNewsCoverageItem {
  gameId: string;
  gameTitle: string;
  platformId: PlatformId;
  gameCoverUrl?: string;
  providerId: string;
  providerName: string;
  status: NewsProviderStatus;
  articleCount: number;
  statusMessage: string;
  isUtilityExcluded?: boolean;
}

export interface GameNewsItem {
  id: string;
  gameId: string;
  gameTitle: string;
  gameCoverUrl?: string;
  articleImageUrl?: string;
  platformId: PlatformId;
  headline: string;
  summary: string;
  url: string;
  source: string;
  publishedAtIso: string;
  author?: string;
  category?: string;
  isUpdate?: boolean;
  isRecent?: boolean;
  providerId?: string;
  isUtilityApp?: boolean;
}

export interface GameNewsFeedResult {
  articles: GameNewsItem[];
  lastUpdatedIso: string;
  supportedGamesCount: number;
  unsupportedGamesCount: number;
  isOffline: boolean;
  gameCoverage?: GameNewsCoverageItem[];
  failedProvidersCount?: number;
  totalGamesEvaluated?: number;
  refreshError?: string;
}
