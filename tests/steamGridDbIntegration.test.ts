import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir(), isPackaged: false },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`mock-dpapi:${Buffer.from(value, 'utf8').toString('base64')}`, 'utf8'),
    decryptString: (buffer: Buffer) =>
      Buffer.from(buffer.toString('utf8').replace(/^mock-dpapi:/, ''), 'base64').toString('utf8'),
  },
}));

import {
  normalizeTitleForArtworkSearch,
  calculateTitleSimilarity,
  SteamGridDbClient,
} from '../electron/services/steamgriddb/steamGridDbClient';
import { SteamGridDbSecretStore } from '../electron/services/steamgriddb/steamGridDbSecretStore';
import { SteamGridDbArtworkService } from '../electron/services/steamgriddb/steamGridDbArtworkService';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';
import type { DiscoveredGameCandidate } from '../src/shared/types/scanner';

describe('SteamGridDB Integration Test Suite', () => {
  let tempDir: string;
  let secretStore: SteamGridDbSecretStore;
  let db: MaSwitchSqliteDatabase;
  let artworkDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-sgdb-test-'));
    secretStore = new SteamGridDbSecretStore(tempDir);
    const dbPath = path.join(tempDir, 'test-library.sqlite');
    db = new MaSwitchSqliteDatabase(dbPath);
    artworkDir = path.join(tempDir, 'artwork');
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  describe('1. Game Title Normalization & Similarity', () => {
    it('normalizes compound titles, versions, and build tags accurately', () => {
      expect(normalizeTitleForArtworkSearch('ItTakesTwo')).toBe('It Takes Two');
      expect(
        normalizeTitleForArtworkSearch('Marvels SpiderMan Miles Morales')
      ).toBe("Marvel's Spider-Man Miles Morales");
      expect(
        normalizeTitleForArtworkSearch('Schedule.I.v0.4.6f13.exe')
      ).toBe('Schedule I');
      expect(normalizeTitleForArtworkSearch('EA SPORTS FC 27')).toBe('EA SPORTS FC 27');
      expect(normalizeTitleForArtworkSearch('F1 25.lnk')).toBe('F1 25');
      expect(normalizeTitleForArtworkSearch('Cyberpunk_2077_build.1234')).toBe(
        'Cyberpunk 2077'
      );
    });

    it('calculates similarity scores with high confidence for matches', () => {
      const sim1 = calculateTitleSimilarity('It Takes Two', 'It Takes Two');
      expect(sim1).toBe(1.0);

      const sim2 = calculateTitleSimilarity('Schedule I', 'Schedule I');
      expect(sim2).toBe(1.0);

      const sim3 = calculateTitleSimilarity('EA SPORTS FC 27', 'EA Sports FC 24');
      expect(sim3).toBeGreaterThan(0.5);

      const simDifferent = calculateTitleSimilarity('Cyberpunk 2077', 'Forza Horizon 5');
      expect(simDifferent).toBeLessThan(0.3);
    });
  });

  describe('2. Secure Secret Store (DPAPI / Fallback)', () => {
    it('saves, verifies, and removes API keys securely without plain text exposure', () => {
      expect(secretStore.hasApiKey()).toBe(false);
      expect(secretStore.getApiKey()).toBeNull();

      const testKey = 'test_sgdb_api_key_secret_12345';
      const saved = secretStore.saveApiKey(testKey);
      expect(saved).toBe(true);
      expect(secretStore.hasApiKey()).toBe(true);
      expect(secretStore.getApiKey()).toBe(testKey);

      // Verify file on disk is encrypted, not plain text
      const secretFilePath = path.join(tempDir, 'secrets', 'steamgriddb.enc');
      expect(fs.existsSync(secretFilePath)).toBe(true);
      const rawDiskContent = fs.readFileSync(secretFilePath, 'utf8');
      expect(rawDiskContent.includes(testKey)).toBe(false);

      // Removal
      const removed = secretStore.removeApiKey();
      expect(removed).toBe(true);
      expect(secretStore.hasApiKey()).toBe(false);
      expect(secretStore.getApiKey()).toBeNull();
      expect(fs.existsSync(secretFilePath)).toBe(false);
    });
  });

  describe('3. SteamGridDB Client Requests & Auth', () => {
    it('returns not-configured when API key is missing', async () => {
      const client = new SteamGridDbClient(secretStore);
      const res = await client.testConnection();
      expect(res.success).toBe(false);
      expect(res.status).toBe('not-configured');
    });

    it('authenticates and parses responses with mock fetch', async () => {
      secretStore.saveApiKey('mock_valid_key');
      const client = new SteamGridDbClient(secretStore);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { id: 431960, name: 'Wallpaper Engine' },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const test = await client.testConnection();
      expect(test.success).toBe(true);
      expect(test.status).toBe('connected');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.steamgriddb.com/api/v2/games/steam/431960',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock_valid_key',
          }),
        })
      );
    });

    it('handles 401 unauthorized gracefully', async () => {
      secretStore.saveApiKey('mock_bad_key');
      const client = new SteamGridDbClient(secretStore);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({ success: false, errors: ['Unauthorized'] }),
        })
      );

      const test = await client.testConnection();
      expect(test.success).toBe(false);
      expect(test.status).toBe('invalid-key');
    });
  });

  describe('4. Artwork Downloading, Cache & Rescan Persistence', () => {
    it('enforces CDN URL domain security', async () => {
      secretStore.saveApiKey('mock_key');
      const client = new SteamGridDbClient(secretStore);
      const service = new SteamGridDbArtworkService(client, db, artworkDir);

      // Untrusted domain rejected
      const maliciousUrl = 'https://evil-hacker.com/malicious.jpg';
      const downloaded = await service.downloadAndCacheAsset(123, 'grid', maliciousUrl);
      expect(downloaded).toBeNull();
    });

    it('downloads and returns maswitch-asset:// URL, and hits cache on subsequent calls', async () => {
      secretStore.saveApiKey('mock_key');
      const client = new SteamGridDbClient(secretStore);
      const service = new SteamGridDbArtworkService(client, db, artworkDir);

      const fakeImageBytes = Buffer.from('FAKE_JPEG_IMAGE_DATA_12345');
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': String(fakeImageBytes.length) }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(fakeImageBytes));
            controller.close();
          },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const assetUrl = 'https://cdn2.steamgriddb.com/grid/test_cover_123.jpg';
      const localUrl = await service.downloadAndCacheAsset(555, 'grid', assetUrl, 999);
      expect(localUrl).toBe('maswitch-asset://artwork/sgdb_555_grid_999.jpg');

      // Verify file exists on disk
      const diskFile = path.join(artworkDir, 'sgdb_555_grid_999.jpg');
      expect(fs.existsSync(diskFile)).toBe(true);

      // Second call should hit local disk cache without calling fetch again
      const cachedUrl = await service.downloadAndCacheAsset(555, 'grid', assetUrl, 999);
      expect(cachedUrl).toBe(localUrl);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('persists manual artwork overrides across game library rescans', async () => {
      // 1. Initial scan detects a game
      const initialCandidate: DiscoveredGameCandidate = {
        title: 'EA SPORTS FC 27',
        platformId: 'ea',
        platformName: 'EA App',
        sourceType: 'ea',
        externalAppId: 'fc27_ea',
        developer: 'EA Sports',
        publisher: 'Electronic Arts',
        executablePath: 'D:\\Games\\EA\\FC27\\FC27.exe',
        installPath: 'D:\\Games\\EA\\FC27',
        executableName: 'FC27.exe',
        workingDirectory: 'D:\\Games\\EA\\FC27',
        launchArgs: null,
        launchMethod: 'executable',
        launchUri: null,
        isInstalled: true,
        installSizeBytes: 50 * 1024 * 1024 * 1024,
        buildVersion: '1.0.0',
        confidenceScore: 0.95,
        classification: 'verified-game',
        coverImage: 'data:image/svg+xml;utf8,<svg></svg>',
      };

      const scanResult1 = db.upsertDiscoveredGames([initialCandidate]);
      expect(scanResult1).toBe(1);

      const libraryBefore = db.getAllLibraryGames();
      expect(libraryBefore.length).toBe(1);
      const gameId = libraryBefore[0]!.id;

      // 2. User manually applies custom artwork
      db.updateGameArtwork({
        gameId,
        sgdbGameId: 8888,
        coverUrl: 'maswitch-asset://artwork/custom_fc27_cover.jpg',
        heroUrl: 'maswitch-asset://artwork/custom_fc27_hero.jpg',
        logoUrl: 'maswitch-asset://artwork/custom_fc27_logo.png',
        iconUrl: 'maswitch-asset://artwork/custom_fc27_icon.png',
        isUserEdited: true,
      });

      const updatedGame = db.getGameById(gameId);
      expect(updatedGame?.coverImage).toBe('maswitch-asset://artwork/custom_fc27_cover.jpg');
      expect(updatedGame?.heroBackgroundImage).toBe('maswitch-asset://artwork/custom_fc27_hero.jpg');
      expect(updatedGame?.logoImage).toBe('maswitch-asset://artwork/custom_fc27_logo.png');
      expect(updatedGame?.isArtworkUserEdited).toBe(true);

      // 3. User rescans the library
      const scanResult2 = db.upsertDiscoveredGames([initialCandidate]);
      expect(scanResult2).toBe(1);

      // 4. Verify custom artwork was preserved!
      const libraryAfterRescan = db.getAllLibraryGames();
      const rescannedGame = libraryAfterRescan.find((g) => g.id === gameId);
      expect(rescannedGame?.coverImage).toBe('maswitch-asset://artwork/custom_fc27_cover.jpg');
      expect(rescannedGame?.heroBackgroundImage).toBe('maswitch-asset://artwork/custom_fc27_hero.jpg');
      expect(rescannedGame?.logoImage).toBe('maswitch-asset://artwork/custom_fc27_logo.png');
      expect(rescannedGame?.isArtworkUserEdited).toBe(true);
      expect(rescannedGame?.sgdbGameId).toBe(8888);

      // 5. Restoring defaults restores clean state
      db.restoreGameDefaultArtwork(gameId);
      const restored = db.getGameById(gameId);
      expect(restored?.isArtworkUserEdited).toBe(false);
      expect(restored?.userCoverOverride).toBeFalsy();
    });
  });

  describe('5. Content Security Policy & Custom Protocol Standards', () => {
    it('verifies index.html CSP directive permits maswitch-asset: for img-src and connect-src', () => {
      const indexPath = path.join(__dirname, '../index.html');
      expect(fs.existsSync(indexPath)).toBe(true);
      const html = fs.readFileSync(indexPath, 'utf8');

      // Must allow maswitch-asset: for images
      expect(html).toMatch(/img-src[^;]*maswitch-asset:/);
      // Must allow maswitch-asset: for connect
      expect(html).toMatch(/connect-src[^;]*maswitch-asset:/);
    });

    it('verifies electron main.ts CSP configuration permits maswitch-asset: in webRequest headers', () => {
      const mainPath = path.join(__dirname, '../electron/main.ts');
      expect(fs.existsSync(mainPath)).toBe(true);
      const mainCode = fs.readFileSync(mainPath, 'utf8');

      expect(mainCode).toMatch(/protocol\.registerSchemesAsPrivileged/);
      expect(mainCode).toMatch(/scheme:\s*'maswitch-asset'/);
      expect(mainCode).toMatch(/corsEnabled:\s*true/);
      expect(mainCode).toMatch(/stream:\s*true/);
      expect(mainCode).toMatch(/img-src[^;]*maswitch-asset:/);
    });
  });

  describe('6. Acronym Dotted Fallback & Trailing Franchise Edition Matching', () => {
    it('queries dotted variant for short acronyms like REPO -> R.E.P.O.', async () => {
      secretStore.saveApiKey('mock_valid_key');
      const client = new SteamGridDbClient(secretStore);

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('autocomplete/REPO')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: [] }),
          };
        }
        if (url.includes('autocomplete/R.E.P.O.')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: [
                { id: 5478421, name: 'R.E.P.O.', verified: true },
              ],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        };
      });
      vi.stubGlobal('fetch', mockFetch);

      const match = await client.findBestMatchingGame('REPO');
      expect(match).not.toBeNull();
      expect(match?.name).toBe('R.E.P.O.');
      expect(match?.id).toBe(5478421);
    });

    it('falls back to franchise base title when edition is unreleased like EA SPORTS FC 27', async () => {
      secretStore.saveApiKey('mock_valid_key');
      const client = new SteamGridDbClient(secretStore);

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('autocomplete/EA%20SPORTS%20FC%2027')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: [] }),
          };
        }
        if (url.includes('autocomplete/EA%20SPORTS%20FC')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: [
                { id: 5495669, name: 'EA SPORTS FC™ 26' },
                { id: 5458628, name: 'EA Sports FC 25' },
              ],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        };
      });
      vi.stubGlobal('fetch', mockFetch);

      const match = await client.findBestMatchingGame('EA SPORTS FC 27');
      expect(match).not.toBeNull();
      expect(match?.name).toContain('EA SPORTS FC');
    });
  });

  describe('7. Detailed Artwork Synchronization Metrics & Progress Reporting', () => {
    it('tracks totalGames, processedGames, successCount, unmatchedCount, and summaryText accurately', async () => {
      secretStore.saveApiKey('mock_valid_key');
      const client = new SteamGridDbClient(secretStore);

      // Add 2 mock games into SQLite: 1 that will match, 1 that will be unmatched
      const game1: DiscoveredGameCandidate = {
        title: 'Matching Game',
        platformId: 'steam',
        platformName: 'Steam',
        sourceType: 'steam',
        externalAppId: '1001',
        developer: 'Valve',
        publisher: 'Valve',
        executablePath: 'C:\\Games\\Match\\game.exe',
        installPath: 'C:\\Games\\Match',
        executableName: 'game.exe',
        workingDirectory: 'C:\\Games\\Match',
        launchArgs: null,
        launchMethod: 'executable',
        launchUri: null,
        isInstalled: true,
        installSizeBytes: 1000,
        buildVersion: '1.0.0',
        confidenceScore: 0.9,
        classification: 'verified-game',
        coverImage: 'data:image/svg+xml;utf8,<svg></svg>',
      };

      const game2: DiscoveredGameCandidate = {
        title: 'Completely Unknown Obscure Title XYZ',
        platformId: 'custom',
        platformName: 'Custom PC',
        sourceType: 'custom-folder',
        externalAppId: null,
        developer: 'Indie Dev',
        publisher: 'Self',
        executablePath: 'C:\\Games\\Unknown\\unknown.exe',
        installPath: 'C:\\Games\\Unknown',
        executableName: 'unknown.exe',
        workingDirectory: 'C:\\Games\\Unknown',
        launchArgs: null,
        launchMethod: 'executable',
        launchUri: null,
        isInstalled: true,
        installSizeBytes: 1000,
        buildVersion: '1.0.0',
        confidenceScore: 0.9,
        classification: 'verified-game',
        coverImage: 'data:image/svg+xml;utf8,<svg></svg>',
      };

      db.upsertDiscoveredGames([game1, game2]);

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/games/steam/1001') || url.includes('autocomplete/Matching%20Game')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: url.includes('/games/steam/')
                ? { id: 777, name: 'Matching Game' }
                : [{ id: 777, name: 'Matching Game' }],
            }),
          };
        }
        if (url.includes('/grids/game/777')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: [
                {
                  id: 9991,
                  score: 10,
                  width: 600,
                  height: 900,
                  nsfw: false,
                  humor: false,
                  mime: 'image/jpeg',
                  url: 'https://cdn2.steamgriddb.com/grid/matching.jpg',
                  thumb: 'https://cdn2.steamgriddb.com/thumb/matching.jpg',
                  upvotes: 10,
                  downvotes: 0,
                },
              ],
            }),
          };
        }
        if (url.includes('matching.jpg')) {
          const fakeBytes = Buffer.from('FAKE_IMG');
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-length': String(fakeBytes.length) }),
            body: new ReadableStream({
              start(c) {
                c.enqueue(new Uint8Array(fakeBytes));
                c.close();
              },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        };
      });
      vi.stubGlobal('fetch', mockFetch);

      const progressSnapshots: unknown[] = [];
      const service = new SteamGridDbArtworkService(
        client,
        db,
        artworkDir,
        (p) => {
          progressSnapshots.push({ ...p });
        }
      );

      const finalProgress = await service.syncMissingLibraryArtwork();

      expect(finalProgress.status).toBe('completed');
      expect(finalProgress.totalGames).toBe(2);
      expect(finalProgress.processedGames).toBe(2);
      expect(finalProgress.successCount).toBe(1);
      expect(finalProgress.unmatchedCount).toBe(1);
      expect(finalProgress.failedCount).toBe(0);
      expect(finalProgress.summaryText).toBe(
        '2 games checked · 1 covers downloaded · 1 unmatched · 0 failed'
      );
    });
  });
});
