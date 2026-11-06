import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  NewsService,
  UNSUPPORTED_NEWS_SOURCE_MESSAGE,
  isUtilityApplication,
  normalizeGameTitleForNews,
  resolveNewsProviderDescriptor,
} from '../electron/services/newsService';
import type { GameItem } from '../src/shared/types/game';

describe('MaSwitch 3.0: Multi-Platform Game Updates & News Test Suite', () => {
  let service: NewsService;

  const steamCs2: Partial<GameItem> = {
    id: 'steam-730',
    title: 'Counter-Strike 2',
    platformId: 'steam',
    externalAppId: '730',
    executablePath: 'C:\\Steam\\cs2.exe',
    coverImage: 'maswitch-asset://artwork/cs2.png',
    isInstalled: true,
    playtimeHours: 50,
    tags: [],
  };

  const riotLol: Partial<GameItem> = {
    id: 'riot-league-of-legends',
    title: 'League of Legends',
    platformId: 'riot',
    externalAppId: 'league_of_legends',
    executablePath: 'C:\\Riot Games\\League of Legends\\LeagueClient.exe',
    coverImage: 'maswitch-asset://artwork/lol.png',
    isInstalled: true,
    playtimeHours: 120,
    tags: [],
  };

  const riotVal: Partial<GameItem> = {
    id: 'riot-live-valorant',
    title: 'VALORANT',
    platformId: 'riot',
    externalAppId: 'valorant',
    coverImage: 'maswitch-asset://artwork/valorant.png',
    isInstalled: true,
    playtimeHours: 95,
    tags: [],
  };

  const epicFortnite: Partial<GameItem> = {
    id: 'epic-fortnite-fortnite',
    title: 'Fortnite',
    platformId: 'epic',
    externalAppId: 'Fortnite',
    coverImage: 'maswitch-asset://artwork/fortnite.png',
    isInstalled: true,
    playtimeHours: 80,
    tags: [],
  };

  const eaFc27: Partial<GameItem> = {
    id: 'custom-ea-sports-fc-27',
    title: 'EA SPORTS FC 27',
    platformId: 'ea',
    externalAppId: '16425884',
    coverImage: 'maswitch-asset://artwork/eafc27.png',
    isInstalled: true,
    playtimeHours: 40,
    tags: [],
  };

  const ubisoftR6: Partial<GameItem> = {
    id: 'ubisoft-r6-siege',
    title: "Tom Clancy's Rainbow Six Siege",
    platformId: 'ubisoft',
    externalAppId: 'r6_siege_uplay',
    coverImage: 'maswitch-asset://artwork/r6.png',
    isInstalled: true,
    playtimeHours: 30,
    tags: [],
  };

  const rockstarGta5: Partial<GameItem> = {
    id: 'custom-gta-v',
    title: 'Grand Theft Auto V',
    platformId: 'custom',
    externalAppId: 'C:\\Games\\GTA5\\GTA5.exe',
    coverImage: 'maswitch-asset://artwork/gtav.png',
    isInstalled: true,
    playtimeHours: 65,
    tags: [],
  };

  const wallpaperEngine: Partial<GameItem> = {
    id: 'steam-wallpaper-engine-431960',
    title: 'Wallpaper Engine',
    platformId: 'steam',
    externalAppId: '431960',
    coverImage: 'maswitch-asset://artwork/wallpaper.png',
    isInstalled: true,
    playtimeHours: 200,
    tags: [],
  };

  const unsupportedCustomGame: Partial<GameItem> = {
    id: 'custom-obscure-indie-prototype',
    title: 'My Homemade Sandbox Prototype',
    platformId: 'custom',
    externalAppId: 'C:\\Dev\\prototype.exe',
    isInstalled: true,
    playtimeHours: 2,
    tags: [],
  };

  beforeEach(() => {
    service = new NewsService({ cacheTtlMs: 5000 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. validates external URLs and blocks malicious or unsafe protocols', () => {
    expect(
      NewsService.isValidExternalUrl('https://store.steampowered.com/news/app/730')
    ).toBe(true);
    expect(
      NewsService.isValidExternalUrl('http://www.leagueoflegends.com/en-us/news/')
    ).toBe(true);
    expect(
      NewsService.isValidExternalUrl('file:///C:/Windows/System32/cmd.exe')
    ).toBe(false);
    expect(NewsService.isValidExternalUrl('javascript:alert(1)')).toBe(false);
    expect(
      NewsService.isValidExternalUrl('data:text/html,<html>malicious</html>')
    ).toBe(false);
    expect(NewsService.isValidExternalUrl('not-a-valid-url')).toBe(false);
  });

  it('2. resolves multi-platform games accurately and marks unknown custom binaries as unsupported', () => {
    expect(resolveNewsProviderDescriptor(steamCs2 as GameItem)?.providerId).toBe(
      'steam-news'
    );
    expect(resolveNewsProviderDescriptor(riotLol as GameItem)?.providerId).toBe(
      'riot-official'
    );
    expect(resolveNewsProviderDescriptor(riotVal as GameItem)?.providerId).toBe(
      'riot-official'
    );
    expect(
      resolveNewsProviderDescriptor(epicFortnite as GameItem)?.providerId
    ).toBe('epic-fortnite');
    expect(resolveNewsProviderDescriptor(eaFc27 as GameItem)?.providerId).toBe(
      'ea-official'
    );
    expect(
      resolveNewsProviderDescriptor(ubisoftR6 as GameItem)?.providerId
    ).toBe('steam-news');
    expect(
      resolveNewsProviderDescriptor(rockstarGta5 as GameItem)?.providerId
    ).toBe('steam-news');
    expect(
      resolveNewsProviderDescriptor(unsupportedCustomGame as GameItem)
    ).toBeNull();

    // Versioned title normalization (e.g. "Schedule.I.v0.4.6f13" -> "schedule i" -> Steam 3164500)
    expect(normalizeGameTitleForNews('Schedule.I.v0.4.6f13')).toBe('schedule i');
    const scheduleDescriptor = resolveNewsProviderDescriptor({
      id: 'custom-schedule-i',
      title: 'Schedule.I.v0.4.6f13',
      platformId: 'custom',
    } as GameItem);
    expect(scheduleDescriptor).toEqual({
      providerId: 'steam-news',
      providerName: 'Steam Official News',
      steamAppId: '3164500',
    });
  });

  it('3. fetches and normalizes Steam, Riot (LoL & VALORANT), Fortnite, and EA Sports FC news simultaneously', async () => {
    const nowIso = new Date().toISOString();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('ISteamNews/GetNewsForApp') && url.includes('appid=730')) {
        return {
          ok: true,
          json: async () => ({
            appnews: {
              appid: 730,
              newsitems: [
                {
                  gid: 'cs2-1',
                  title: 'Release Notes for CS2 Update',
                  url: 'https://store.steampowered.com/news/app/730/view/1',
                  author: 'Valve',
                  contents: '[b]Fixed[/b] map clipping bugs.',
                  feedlabel: 'Community Announcements',
                  feedname: 'steam_community_announcements',
                  feed_type: 1,
                  date: Math.floor(Date.now() / 1000) - 3600,
                },
              ],
            },
          }),
        } as unknown as Response;
      }

      if (url.includes('leagueoflegends.com/en-us/news')) {
        const nextData = {
          props: {
            pageProps: {
              page: {
                blades: [
                  {
                    items: [
                      {
                        title: 'League of Legends Patch 16.22 Notes',
                        publishedAt: nowIso,
                        category: { title: 'Game Updates' },
                        description: { body: 'Champion balance updates and ARAM changes.' },
                        action: {
                          payload: { url: '/en-us/news/game-updates/patch-16-22-notes/' },
                        },
                        media: { url: 'https://cmsassets.rgpub.io/lol-patch.jpg' },
                      },
                    ],
                  },
                ],
              },
            },
          },
        };
        return {
          ok: true,
          text: async () =>
            `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
              nextData
            )}</script></html>`,
        } as unknown as Response;
      }

      if (url.includes('playvalorant.com/en-us/news')) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              items: [
                {
                  title: 'VALORANT Agent Balance Patch 9.10',
                  publishedAt: nowIso,
                  category: { title: 'Game Updates' },
                  description: { body: 'Sentinel adjustments and map pool rotation.' },
                  action: {
                    payload: { url: '/en-us/news/game-updates/valorant-patch-9-10/' },
                  },
                },
              ],
            }),
        } as unknown as Response;
      }

      if (url.includes('fortnite-api.com/v2/news')) {
        return {
          ok: true,
          json: async () => ({
            status: 200,
            data: {
              br: {
                date: nowIso,
                motds: [
                  {
                    id: 'fn-motd-1',
                    title: 'Fortnite Battle Royale v32.10 Update',
                    body: 'Drop into the island with new items and seasonal quests!',
                    image: 'https://cdn.epicgames.com/fn-banner.jpg',
                    hidden: false,
                  },
                ],
              },
            },
          }),
        } as unknown as Response;
      }

      if (url.includes('ea.com/games/ea-sports-fc')) {
        const eaNextData = {
          props: {
            pageProps: {
              initialNewsData: {
                items: [
                  {
                    title: 'EA SPORTS FC 27 | Gameplay Developer Notes',
                    summary: 'Explore the upcoming gameplay tuning in Title Update 4.',
                    publishingDate: nowIso,
                    slug: 'fc27-gameplay-dev-notes',
                    type: 'Pitch Notes',
                  },
                ],
              },
            },
          },
        };
        return {
          ok: true,
          text: async () =>
            `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
              eaNextData
            )}</script></html>`,
        } as unknown as Response;
      }

      return { ok: false, status: 404 } as unknown as Response;
    });

    const games = [
      steamCs2,
      riotLol,
      riotVal,
      epicFortnite,
      eaFc27,
      unsupportedCustomGame,
    ] as GameItem[];

    const result = await service.getLibraryNews(games);

    expect(result.isOffline).toBe(false);
    expect(result.supportedGamesCount).toBe(5);
    expect(result.unsupportedGamesCount).toBe(1);
    expect(result.articles).toHaveLength(5);

    const titles = result.articles.map((a) => a.gameTitle);
    expect(titles).toContain('Counter-Strike 2');
    expect(titles).toContain('League of Legends');
    expect(titles).toContain('VALORANT');
    expect(titles).toContain('Fortnite');
    expect(titles).toContain('EA SPORTS FC 27');

    // Verify unsupported game coverage entry has the exact required message
    const unsupportedCoverage = result.gameCoverage?.find(
      (c) => c.gameId === unsupportedCustomGame.id
    );
    expect(unsupportedCoverage?.status).toBe('unsupported');
    expect(unsupportedCoverage?.statusMessage).toBe(
      UNSUPPORTED_NEWS_SOURCE_MESSAGE
    );
  });

  it('4. excludes Wallpaper Engine from dominating the default feed while allowing explicit game filter access', async () => {
    expect(isUtilityApplication(wallpaperEngine as GameItem)).toBe(true);
    expect(isUtilityApplication(riotLol as GameItem)).toBe(false);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('appid=431960')) {
        return {
          ok: true,
          json: async () => ({
            appnews: {
              newsitems: [
                {
                  gid: 'we-old-1',
                  title: 'Wallpaper Engine Patch 2.5 Released',
                  url: 'https://store.steampowered.com/news/app/431960/view/1',
                  contents: 'Updated wallpaper editor.',
                  feed_type: 1,
                  date: 1700000000,
                },
              ],
            },
          }),
        } as unknown as Response;
      }
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            items: [
              {
                title: 'League Patch Notes',
                publishedAt: new Date().toISOString(),
                action: { payload: { url: 'https://www.leagueoflegends.com/en-us/news/1' } },
              },
            ],
          }),
      } as unknown as Response;
    });

    const games = [wallpaperEngine, riotLol] as GameItem[];

    // Default multi-game feed excludes Wallpaper Engine
    const defaultFeed = await service.getLibraryNews(games);
    expect(defaultFeed.articles.map((a) => a.gameTitle)).toEqual([
      'League of Legends',
    ]);

    // Explicitly selecting Wallpaper Engine in gameId filter shows its articles
    const weFeed = await service.getLibraryNews(games, {
      gameId: wallpaperEngine.id,
    });
    expect(weFeed.articles).toHaveLength(1);
    expect(weFeed.articles[0].gameTitle).toBe('Wallpaper Engine');
  });

  it('5. deduplicates duplicate articles, handles invalid timestamps, and preserves game-specific artwork', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        appnews: {
          newsitems: [
            {
              gid: 'dup-1',
              title: 'Duplicate Headline Update',
              url: 'https://store.steampowered.com/news/app/730/view/dup',
              contents: 'First copy',
              feed_type: 1,
              date: 1715000000,
            },
            {
              gid: 'dup-2',
              title: 'Duplicate Headline Update',
              url: 'https://store.steampowered.com/news/app/730/view/dup',
              contents: 'Second identical copy',
              feed_type: 1,
              date: 1715000000,
            },
            {
              gid: 'invalid-date',
              title: 'Update With Missing Timestamp',
              url: 'https://store.steampowered.com/news/app/730/view/nodate',
              contents: 'Still valid article',
              feed_type: 1,
              date: Number.NaN,
            },
          ],
        },
      }),
    } as unknown as Response);

    const result = await service.getLibraryNews([steamCs2 as GameItem]);
    expect(result.articles).toHaveLength(2);
    expect(result.articles[0].gameCoverUrl).toBe(
      'maswitch-asset://artwork/cs2.png'
    );
    for (const art of result.articles) {
      expect(Number.isNaN(Date.parse(art.publishedAtIso))).toBe(false);
    }
  });

  it('6. retains cached articles and original lastUpdatedIso when a forced refresh fails offline', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        appnews: {
          newsitems: [
            {
              gid: 'cs2-cached',
              title: 'Cached CS2 Announcement',
              url: 'https://store.steampowered.com/news/app/730/view/cached',
              contents: 'Cached content',
              feed_type: 1,
              date: 1715000000,
            },
          ],
        },
      }),
    } as unknown as Response);

    const initial = await service.getLibraryNews([steamCs2 as GameItem]);
    expect(initial.articles).toHaveLength(1);
    expect(initial.isOffline).toBe(false);
    const initialTimestamp = initial.lastUpdatedIso;

    // Simulate network failure on forced refresh
    fetchSpy.mockRejectedValueOnce(new Error('DNS lookup failed'));

    const afterFailedRefresh = await service.getLibraryNews(
      [steamCs2 as GameItem],
      { forceRefresh: true }
    );
    expect(afterFailedRefresh.isOffline).toBe(true);
    expect(afterFailedRefresh.articles).toHaveLength(1);
    expect(afterFailedRefresh.articles[0].headline).toBe(
      'Cached CS2 Announcement'
    );
    expect(afterFailedRefresh.lastUpdatedIso).toBe(initialTimestamp);
  });

  it('7. records no-articles status when a provider responds with an empty list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ appnews: { newsitems: [] } }),
    } as unknown as Response);

    const result = await service.getLibraryNews([steamCs2 as GameItem]);
    expect(result.articles).toHaveLength(0);
    expect(result.isOffline).toBe(false);
    expect(result.gameCoverage?.[0]?.status).toBe('no-articles');
  });

  it('8. prevents duplicate concurrent refresh requests and respects cache expiration TTL', async () => {
    const shortTtlService = new NewsService({ cacheTtlMs: 30 });
    let fetchCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      fetchCount++;
      await new Promise((r) => setTimeout(r, 15));
      return {
        ok: true,
        json: async () => ({
          appnews: {
            newsitems: [
              {
                gid: `item-${fetchCount}`,
                title: `Update #${fetchCount}`,
                url: `https://store.steampowered.com/news/app/730/view/${fetchCount}`,
                contents: 'Details',
                feed_type: 1,
                date: 1715000000,
              },
            ],
          },
        }),
      } as unknown as Response;
    });

    // Two concurrent calls should share the same in-flight promise
    const [res1, res2] = await Promise.all([
      shortTtlService.getLibraryNews([steamCs2 as GameItem]),
      shortTtlService.getLibraryNews([steamCs2 as GameItem]),
    ]);
    expect(fetchCount).toBe(1);
    expect(res1.articles[0].headline).toBe('Update #1');
    expect(res2.articles[0].headline).toBe('Update #1');

    // Wait for cache TTL to expire
    await new Promise((r) => setTimeout(r, 45));
    const res3 = await shortTtlService.getLibraryNews([steamCs2 as GameItem]);
    expect(fetchCount).toBe(2);
    expect(res3.articles[0].headline).toBe('Update #2');
  });

  it('9. prevents incorrect game mapping for non-Steam numeric externalAppIds', () => {
    const unmappedEaGame: Partial<GameItem> = {
      id: 'ea-unknown-prototype',
      title: 'Unannounced EA Internal Test App',
      platformId: 'ea',
      externalAppId: '99887766', // EA content ID, NOT a Steam AppID
    };
    expect(
      resolveNewsProviderDescriptor(unmappedEaGame as GameItem)
    ).toBeNull();
  });

  it('10. filters by platformId and balances multi-game feeds cleanly', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('appid=730')) {
        return {
          ok: true,
          json: async () => ({
            appnews: {
              newsitems: Array.from({ length: 6 }, (_, i) => ({
                gid: `cs2-${i}`,
                title: `CS2 Patch Note ${i + 1}`,
                url: `https://store.steampowered.com/news/app/730/view/${i}`,
                contents: 'Patch content',
                feed_type: 1,
                date: nowSec - i * 600,
              })),
            },
          }),
        } as unknown as Response;
      }
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            items: [
              {
                title: 'VALORANT Patch 9.11',
                publishedAt: new Date(nowSec * 1000).toISOString(),
                action: {
                  payload: { url: 'https://playvalorant.com/en-us/news/game-updates/9-11/' },
                },
              },
            ],
          }),
      } as unknown as Response;
    });

    const games = [steamCs2, riotVal] as GameItem[];
    const allFeed = await service.getLibraryNews(games);

    // Multi-game feed caps per-game recent articles to 4 so one game cannot monopolize the entire feed
    const cs2InDefault = allFeed.articles.filter(
      (a) => a.gameId === steamCs2.id
    );
    expect(cs2InDefault.length).toBeLessThanOrEqual(4);

    // Platform filter returns only Riot articles
    const riotOnly = await service.getLibraryNews(games, {
      platformId: 'riot',
    });
    expect(riotOnly.articles).toHaveLength(1);
    expect(riotOnly.articles[0].gameTitle).toBe('VALORANT');
  });
});
