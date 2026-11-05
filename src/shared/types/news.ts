import type { PlatformId } from './platform';

export interface GameNewsItem {
  id: string;
  gameId: string;
  gameTitle: string;
  gameCoverUrl?: string;
  platformId: PlatformId;
  headline: string;
  summary: string;
  url: string;
  source: string;
  publishedAtIso: string;
  author?: string;
}

export interface GameNewsFeedResult {
  articles: GameNewsItem[];
  lastUpdatedIso: string;
  supportedGamesCount: number;
  unsupportedGamesCount: number;
  isOffline: boolean;
}
