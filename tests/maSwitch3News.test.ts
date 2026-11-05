import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NewsService } from '../electron/services/newsService';
import type { GameItem } from '../src/shared/types/game';

describe('MaSwitch 3.0: Game Updates & News Test Suite', () => {
  let service: NewsService;

  const sampleGames: Partial<GameItem>[] = [
    {
      id: 'steam-730',
      title: 'Counter-Strike 2',
      platformId: 'steam',
      externalAppId: '730',
      executablePath: 'C:\\Steam\\cs2.exe',
      isInstalled: true,
      playtimeHours: 50,
      tags: [],
    },
    {
      id: 'riot-lol',
      title: 'League of Legends',
      platformId: 'riot',
      executablePath: 'C:\\Riot\\LoL.exe',
      isInstalled: true,
      playtimeHours: 120,
      tags: [],
    },
  ];

  beforeEach(() => {
    service = new NewsService({ cacheTtlMs: 5000 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates external URLs and blocks malicious or unsafe protocols', () => {
    expect(NewsService.isValidExternalUrl('https://store.steampowered.com/news/app/730')).toBe(true);
    expect(NewsService.isValidExternalUrl('http://store.steampowered.com/news')).toBe(true);
    expect(NewsService.isValidExternalUrl('file:///C:/Windows/System32/cmd.exe')).toBe(false);
    expect(NewsService.isValidExternalUrl('javascript:alert(1)')).toBe(false);
    expect(NewsService.isValidExternalUrl('data:text/html,<html>malicious</html>')).toBe(false);
    expect(NewsService.isValidExternalUrl('not-a-valid-url')).toBe(false);
  });

  it('fetches, parses, and caches Steam official news without paid APIs', async () => {
    const mockApiResponse = {
      appnews: {
        appid: 730,
        newsitems: [
          {
            gid: 'news-item-1',
            title: 'Release Notes for CS2 Update',
            url: 'https://store.steampowered.com/news/1',
            author: 'Valve',
            contents: 'Fixed various map bugs and performance hitches.',
            feedlabel: 'Community Announcements',
            date: 1710000000,
            feedname: 'steam_community_announcements',
            feed_type: 1,
            appid: 730,
          },
          {
            gid: 'news-item-2',
            title: 'CS2 Major Championship Schedule',
            url: 'https://store.steampowered.com/news/2',
            author: 'Valve',
            contents: 'Tickets are now on sale.',
            feedlabel: 'Press Releases',
            date: 1709000000,
            feedname: 'steam_community_announcements',
            feed_type: 1,
            appid: 730,
          },
        ],
      },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiResponse,
    } as unknown as Response);

    const result = await service.getLibraryNews(sampleGames as GameItem[]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.articles).toHaveLength(2);
    expect(result.articles[0].headline).toBe('Release Notes for CS2 Update');
    expect(result.articles[0].gameTitle).toBe('Counter-Strike 2');
    expect(result.articles[0].platformId).toBe('steam');
    expect(result.isOffline).toBe(false);

    // Call again within cache TTL -> should return cached result without hitting fetch
    const cachedResult = await service.getLibraryNews(sampleGames as GameItem[]);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // Still 1!
    expect(cachedResult.articles).toHaveLength(2);

    // Filter by gameId
    const filtered = await service.getLibraryNews(sampleGames as GameItem[], { gameId: 'steam-730' });
    expect(filtered.articles).toHaveLength(2);

    const riotFilter = await service.getLibraryNews(sampleGames as GameItem[], { gameId: 'riot-lol' });
    expect(riotFilter.articles).toHaveLength(0);
  });

  it('falls back cleanly to cached articles or safe offline payload when network fails', async () => {
    service.clearCache();

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network offline or DNS unreachable'));

    const result = await service.getLibraryNews(sampleGames as GameItem[]);
    expect(result.articles).toEqual([]);
    expect(result.isOffline).toBe(true);
    expect(result.unsupportedGamesCount).toBe(1);
  });
});
