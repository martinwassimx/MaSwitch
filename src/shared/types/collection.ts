import type { PlatformId } from './platform';

export type CollectionSortOrder =
  | 'title-asc'
  | 'title-desc'
  | 'playtime-desc'
  | 'recent-desc'
  | 'manual';

export interface SmartCollectionRules {
  platformId?: PlatformId;
  genre?: string;
  isFavorite?: boolean;
  isInstalled?: boolean;
  neverPlayed?: boolean;
  recentlyPlayedDays?: number;
  minPlaytimeHours?: number;
  maxPlaytimeHours?: number;
}

export interface CollectionItem {
  id: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
  isSmart: boolean;
  rules?: SmartCollectionRules;
  sortOrder: CollectionSortOrder;
  gameIds: string[];
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CreateCollectionInput {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  isSmart?: boolean;
  rules?: SmartCollectionRules;
  sortOrder?: CollectionSortOrder;
  initialGameIds?: string[];
}

export interface UpdateCollectionInput {
  id: string;
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  rules?: SmartCollectionRules;
  sortOrder?: CollectionSortOrder;
}

