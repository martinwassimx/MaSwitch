import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ArtworkCacheService } from '../electron/services/artwork/artworkCacheService';
import {
  PLATFORM_LOGOS,
  PLATFORM_NAMES,
  PLATFORM_CLIENT_LOGOS,
} from '../src/components/platforms/PlatformLogo';

function createTempDir(): string {
  const dir = path.join(
    os.tmpdir(),
    `maswitch-art-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('Gaming UI 3.0: Artwork Resolution & Official Platform Logos', () => {
  describe('1. Official Platform Brand Logos', () => {
    it('provides genuine vector assets for all 9 supported platforms', () => {
      const requiredPlatforms = [
        'steam',
        'epic',
        'riot',
        'ea',
        'ubisoft',
        'rockstar',
        'discord',
        'gog',
        'custom',
      ] as const;

      for (const p of requiredPlatforms) {
        expect(PLATFORM_LOGOS[p]).toBeDefined();
        expect(PLATFORM_NAMES[p]).toBeDefined();
      }
    });

    it('provides genuine client logos from client logos directory for launcher platforms', () => {
      const clientPlatforms = [
        'steam',
        'epic',
        'riot',
        'ea',
        'ubisoft',
        'rockstar',
        'gog',
      ] as const;

      for (const cp of clientPlatforms) {
        expect(PLATFORM_CLIENT_LOGOS[cp]).toBeDefined();
        expect(typeof PLATFORM_CLIENT_LOGOS[cp]).toBe('string');
      }
    });
  });

  describe('2. ArtworkCacheService & Steam Artwork Resolution', () => {
    it('initializes artwork and icon cache directories safely', () => {
      const tempDir = createTempDir();
      const service = new ArtworkCacheService(tempDir);

      expect(fs.existsSync(service.getArtworkDir())).toBe(true);
      expect(fs.existsSync(service.getIconDir())).toBe(true);

      const stats = service.getStats();
      expect(stats.artworkCount).toBe(0);
      expect(stats.iconCount).toBe(0);
      expect(stats.totalSizeBytes).toBe(0);
    });

    it('resolves official Cloudflare Steam CDN artwork URLs for Steam App IDs', async () => {
      const tempDir = createTempDir();
      const service = new ArtworkCacheService(tempDir);

      // Cyberpunk 2077 AppID = 1091500
      const urls = await service.resolveSteamArtwork('1091500');

      expect(urls.coverUrl).toBe(
        'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1091500/library_600x900.jpg'
      );
      expect(urls.heroUrl).toBe(
        'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1091500/library_hero.jpg'
      );
      expect(urls.headerUrl).toBe(
        'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1091500/header.jpg'
      );
    });

    it('caches artwork files and clears cache upon user request', () => {
      const tempDir = createTempDir();
      const service = new ArtworkCacheService(tempDir);

      const dummyFile = path.join(service.getArtworkDir(), 'test_art.jpg');
      fs.writeFileSync(dummyFile, Buffer.alloc(1024, 0xff));

      const statsBefore = service.getStats();
      expect(statsBefore.artworkCount).toBe(1);
      expect(statsBefore.artworkSizeBytes).toBe(1024);

      const clearRes = service.clearCache();
      expect(clearRes.clearedFilesCount).toBe(1);
      expect(clearRes.freedBytes).toBe(1024);

      const statsAfter = service.getStats();
      expect(statsAfter.artworkCount).toBe(0);
      expect(statsAfter.artworkSizeBytes).toBe(0);
    });
  });
});
