import { describe, expect, it } from 'vitest';
import { DEMO_GAMES } from '../src/services/demoData/demoGames';
import { filterAndSortGames } from '../src/services/libraryFilterService';

describe('Library Search, Filter, and Sort Engine', () => {
  it('filters games by search query matching title, studio, or genre', () => {
    const results = filterAndSortGames(DEMO_GAMES, {
      searchQuery: 'Kestrel',
      platformFilter: 'all',
      installFilter: 'all',
      favoritesOnly: false,
      favoriteGameIds: [],
      sortBy: 'title',
      sortDirection: 'asc',
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('cyber-odyssey-2099');
  });

  it('filters games by platform and installed state', () => {
    const steamInstalled = filterAndSortGames(DEMO_GAMES, {
      searchQuery: '',
      platformFilter: 'steam',
      installFilter: 'installed',
      favoritesOnly: false,
      favoriteGameIds: [],
      sortBy: 'playtimeHours',
      sortDirection: 'desc',
    });

    expect(steamInstalled).toHaveLength(2);
    expect(steamInstalled.every((g) => g.platformId === 'steam')).toBe(true);
    expect(steamInstalled.every((g) => g.isInstalled)).toBe(true);

    const steamUninstalled = filterAndSortGames(DEMO_GAMES, {
      searchQuery: '',
      platformFilter: 'steam',
      installFilter: 'uninstalled',
      favoritesOnly: false,
      favoriteGameIds: [],
      sortBy: 'playtimeHours',
      sortDirection: 'desc',
    });

    expect(steamUninstalled).toHaveLength(1);
    expect(steamUninstalled[0]?.id).toBe('titancore-vii');
  });

  it('filters favorites only and sorts by playtime and rating', () => {
    const favResults = filterAndSortGames(DEMO_GAMES, {
      searchQuery: '',
      platformFilter: 'all',
      installFilter: 'all',
      favoritesOnly: true,
      favoriteGameIds: ['chronos-citadel', 'cyber-odyssey-2099'],
      sortBy: 'playtimeHours',
      sortDirection: 'asc',
    });

    expect(favResults).toHaveLength(2);
    expect(favResults[0]?.id).toBe('chronos-citadel');
    expect(favResults[1]?.id).toBe('cyber-odyssey-2099');
  });
});

