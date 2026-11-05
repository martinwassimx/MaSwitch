export interface SteamGridDbStatus {
  isConfigured: boolean;
  isValid: boolean | null;
  statusText: 'not-configured' | 'connected' | 'invalid-key' | 'network-error' | 'checking';
  lastCheckedIso: string | null;
  errorMessage?: string;
}

export interface SteamGridDbGame {
  id: number;
  name: string;
  releaseDate?: number | null;
  types?: string[];
  verified?: boolean;
}

export type SteamGridDbAssetType = 'grid' | 'hero' | 'logo' | 'icon';

export interface SteamGridDbAsset {
  id: number;
  score: number;
  style?: string;
  width: number;
  height: number;
  nsfw: boolean;
  humor: boolean;
  notes?: string;
  mime: string;
  language?: string;
  url: string;
  thumb: string;
  upvotes: number;
  downvotes: number;
  author?: {
    name: string;
    steam64?: string;
    avatar?: string;
  };
}

export interface SteamGridDbArtworkBundle {
  gameId: number;
  gameName: string;
  grids: SteamGridDbAsset[];
  heroes: SteamGridDbAsset[];
  logos: SteamGridDbAsset[];
  icons: SteamGridDbAsset[];
}

export interface ApplyArtworkInput {
  gameId: string;
  sgdbGameId?: number;
  coverUrl?: string;
  heroUrl?: string;
  logoUrl?: string;
  iconUrl?: string;
}

export interface ArtworkSyncProgress {
  totalGames: number;
  processedGames: number;
  successCount: number;
  unmatchedCount: number;
  failedCount: number;
  currentTitle?: string;
  summaryText?: string;
  status: 'idle' | 'syncing' | 'completed' | 'cancelled' | 'error';
}

