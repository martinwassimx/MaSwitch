import type {
  GameItem,
  InstallStatusFilter,
  LibrarySortField,
  SortDirection,
} from '../shared/types/game';
import type { PlatformId } from '../shared/types/platform';

export interface LibraryFilterCriteria {
  searchQuery: string;
  platformFilter: 'all' | PlatformId;
  installFilter: InstallStatusFilter;
  favoritesOnly: boolean;
  favoriteGameIds: readonly string[];
  sortBy: LibrarySortField;
  sortDirection: SortDirection;
}

export function filterAndSortGames(
  games: readonly GameItem[],
  criteria: LibraryFilterCriteria
): GameItem[] {
  const normalizedQuery = criteria.searchQuery.trim().toLowerCase();
  const favSet = new Set(criteria.favoriteGameIds);

  const filtered = games.filter((game) => {
    if (
      criteria.platformFilter !== 'all' &&
      game.platformId !== criteria.platformFilter
    ) {
      return false;
    }

    if (criteria.installFilter === 'installed' && !game.isInstalled) {
      return false;
    }

    if (criteria.installFilter === 'uninstalled' && game.isInstalled) {
      return false;
    }

    if (criteria.favoritesOnly && !favSet.has(game.id)) {
      return false;
    }

    if (normalizedQuery.length > 0) {
      const match =
        game.title.toLowerCase().includes(normalizedQuery) ||
        game.subtitle?.toLowerCase().includes(normalizedQuery) ||
        game.developer?.toLowerCase().includes(normalizedQuery) ||
        game.publisher?.toLowerCase().includes(normalizedQuery) ||
        game.platformName.toLowerCase().includes(normalizedQuery) ||
        game.genres.some((g) => g.toLowerCase().includes(normalizedQuery)) ||
        game.tags.some((t) => t.toLowerCase().includes(normalizedQuery));

      if (!match) {
        return false;
      }
    }

    return true;
  });

  const directionMultiplier = criteria.sortDirection === 'asc' ? 1 : -1;

  return [...filtered].sort((a, b) => {
    let comparison = 0;

    switch (criteria.sortBy) {
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
      case 'playtimeHours':
        comparison = a.playtimeHours - b.playtimeHours;
        break;
      case 'lastPlayed': {
        const timeA = a.lastPlayedIso ? Date.parse(a.lastPlayedIso) : 0;
        const timeB = b.lastPlayedIso ? Date.parse(b.lastPlayedIso) : 0;
        comparison = timeA - timeB;
        break;
      }
      case 'rating':
        comparison = a.rating.overallScore - b.rating.overallScore;
        break;
      case 'releaseYear':
        comparison = a.releaseYear - b.releaseYear;
        break;
    }

    if (comparison === 0) {
      return a.title.localeCompare(b.title);
    }

    return comparison * directionMultiplier;
  });
}

