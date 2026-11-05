import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  cleanEaGameTitle,
  parseEaInstallerDataXml,
  detectEaAppGameInDirectory,
} from '../electron/services/scanner/eaScanner';
import { deduplicateDiscoveredGames } from '../electron/services/scanner/gameScannerEngine';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';
import type { DiscoveredGameCandidate } from '../src/shared/types/scanner';

describe('EA Platform Classification & Reconciliation', () => {
  describe('DiPManifest XML Parsing & Title Cleaning', () => {
    it('cleans title strings with registered trademark artifacts and encoding issues', () => {
      expect(cleanEaGameTitle('EA SPORTS FC™ 27')).toBe('EA SPORTS FC 27');
      expect(cleanEaGameTitle('F1® 25')).toBe('F1 25');
      expect(cleanEaGameTitle('F1Ar 25')).toBe('F1 25');
      expect(cleanEaGameTitle('It Takes Two™')).toBe('It Takes Two');
    });

    it('parses valid EA DiPManifest 4.0 XML content correctly', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<DiPManifest version="4.0">
  <gameTitles>
    <gameTitle locale="en_US">EA SPORTS FC™ 27</gameTitle>
  </gameTitles>
  <contentIDs>
    <contentID>16425884</contentID>
  </contentIDs>
  <installMetaData>
    <locales>en_US</locales>
  </installMetaData>
  <runtime>
    <launcher>
      <filePath>FC27.exe</filePath>
      <parameters></parameters>
    </launcher>
    <launcher>
      <filePath>EAAntiCheat.GameServiceLauncher.exe</filePath>
      <parameters></parameters>
    </launcher>
  </runtime>
</DiPManifest>`;

      const parsed = parseEaInstallerDataXml(xml);
      expect(parsed).not.toBeNull();
      expect(parsed?.title).toBe('EA SPORTS FC 27');
      expect(parsed?.contentId).toBe('16425884');
      expect(parsed?.relativeExePath).toBe('FC27.exe');
    });

    it('returns null for invalid or non-manifest XML', () => {
      const invalidXml = `<root><other>data</other></root>`;
      const parsed = parseEaInstallerDataXml(invalidXml);
      expect(parsed).toBeNull();
    });
  });

  describe('detectEaAppGameInDirectory with Mock Filesystem', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-ea-test-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });

    it('detects EA game when __Installer/installerdata.xml is present', () => {
      const gameDir = path.join(tempDir, 'F1 25');
      const installerDir = path.join(gameDir, '__Installer');
      fs.mkdirSync(installerDir, { recursive: true });

      const xml = `<?xml version="1.0" encoding="utf-8"?>
<DiPManifest version="4.0">
  <gameTitles>
    <gameTitle locale="en_US">F1® 25</gameTitle>
  </gameTitles>
  <contentIDs>
    <contentID>16425845</contentID>
  </contentIDs>
  <runtime>
    <launcher>
      <filePath>F1_25.exe</filePath>
    </launcher>
  </runtime>
</DiPManifest>`;

      fs.writeFileSync(path.join(installerDir, 'installerdata.xml'), xml, 'utf8');
      fs.writeFileSync(path.join(gameDir, 'F1_25.exe'), 'mock-binary', 'utf8');

      const candidate = detectEaAppGameInDirectory(gameDir);
      expect(candidate).not.toBeNull();
      expect(candidate?.platformId).toBe('ea');
      expect(candidate?.platformName).toBe('EA App');
      expect(candidate?.title).toBe('F1 25');
      expect(candidate?.externalAppId).toBe('16425845');
      expect(candidate?.executableName).toBe('F1_25.exe');
      expect(candidate?.classification).toBe('verified-game');
    });

    it('returns null when folder lacks EA manifest (e.g. Forza or standard Custom game)', () => {
      const gameDir = path.join(tempDir, 'Forza Horizon 5');
      fs.mkdirSync(gameDir, { recursive: true });
      fs.writeFileSync(path.join(gameDir, 'ForzaHorizon5.exe'), 'mock-binary', 'utf8');

      const candidate = detectEaAppGameInDirectory(gameDir);
      expect(candidate).toBeNull();
    });
  });

  describe('Deduplication & Official Launcher Priority', () => {
    it('prioritizes EA App platform candidate over generic custom folder candidate', () => {
      const customCandidate: DiscoveredGameCandidate = {
        platformId: 'custom',
        platformName: 'Custom PC Game',
        sourceType: 'custom-folder',
        externalAppId: null,
        title: 'EA SPORTS FC 27',
        installPath: 'D:\\Games\\EA SPORTS FC 27',
        executablePath: 'D:\\Games\\EA SPORTS FC 27\\FC27.exe',
        executableName: 'FC27.exe',
        workingDirectory: 'D:\\Games\\EA SPORTS FC 27',
        launchArgs: null,
        launchMethod: 'executable',
        launchUri: null,
        isInstalled: true,
        installSizeBytes: 50000000000,
        buildVersion: 'Local',
        developer: 'EA Canada',
        publisher: 'Electronic Arts',
        confidenceScore: 70,
        classification: 'verified-game',
      };

      const eaCandidate: DiscoveredGameCandidate = {
        platformId: 'ea',
        platformName: 'EA App',
        sourceType: 'ea',
        externalAppId: '16425884',
        title: 'EA SPORTS FC 27',
        installPath: 'D:\\Games\\EA SPORTS FC 27',
        executablePath: 'D:\\Games\\EA SPORTS FC 27\\FC27.exe',
        executableName: 'FC27.exe',
        workingDirectory: 'D:\\Games\\EA SPORTS FC 27',
        launchArgs: null,
        launchMethod: 'executable',
        launchUri: 'origin2://game/launch?offerIds=16425884',
        isInstalled: true,
        installSizeBytes: 50000000000,
        buildVersion: 'Local',
        developer: 'EA Canada',
        publisher: 'Electronic Arts',
        confidenceScore: 98,
        classification: 'verified-game',
      };

      // Both candidates supplied in arbitrary order
      const result = deduplicateDiscoveredGames([customCandidate, eaCandidate]);

      expect(result.uniqueGames).toHaveLength(1);
      expect(result.uniqueGames[0].platformId).toBe('ea');
      expect(result.uniqueGames[0].platformName).toBe('EA App');
      expect(result.duplicatesSkipped).toBe(1);
    });
  });

  describe('Database Reconciliation & User Platform Override', () => {
    let db: MaSwitchSqliteDatabase;
    let tempDir: string;
    let dbFile: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-db-ea-test-'));
      dbFile = path.join(tempDir, 'test.sqlite');
      db = new MaSwitchSqliteDatabase(dbFile);
    });

    afterEach(() => {
      try {
        db.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });

    it('upgrades a custom game to ea in place when official EA manifest is detected', () => {
      // Create fake game folder with EA manifest
      const gameDir = path.join(tempDir, 'ItTakesTwo');
      const instDir = path.join(gameDir, '__Installer');
      fs.mkdirSync(instDir, { recursive: true });
      fs.writeFileSync(
        path.join(instDir, 'installerdata.xml'),
        `<DiPManifest version="4.0"><gameTitles><gameTitle>It Takes Two</gameTitle></gameTitles><contentIDs><contentID>16050355</contentID></contentIDs></DiPManifest>`,
        'utf8'
      );
      fs.writeFileSync(path.join(gameDir, 'ItTakesTwo.exe'), 'mock', 'utf8');

      // Seed initial custom game
      db.upsertDiscoveredGames([
        {
          platformId: 'custom',
          platformName: 'Custom PC Game',
          sourceType: 'custom-folder',
          externalAppId: null,
          title: 'ItTakesTwo',
          installPath: gameDir,
          executablePath: path.join(gameDir, 'ItTakesTwo.exe'),
          executableName: 'ItTakesTwo.exe',
          workingDirectory: gameDir,
          launchArgs: null,
          launchMethod: 'executable',
          launchUri: null,
          isInstalled: true,
          installSizeBytes: 1000,
          buildVersion: 'Local',
          developer: 'Local',
          publisher: 'Custom',
          confidenceScore: 70,
          classification: 'verified-game',
        },
      ]);

      const initialGames = db.getAllLibraryGames();
      expect(initialGames).toHaveLength(1);
      expect(initialGames[0].platformId).toBe('custom');
      const gameId = initialGames[0].id;

      // Add a favorite and a playtime session to verify preservation
      db.toggleFavorite(gameId);
      db.startPlaytimeSession({
        sessionId: 'session-1',
        gameId,
        executablePath: path.join(gameDir, 'ItTakesTwo.exe'),
        startedAtIso: new Date(Date.now() - 3600000).toISOString(),
        source: 'background-monitor',
      });
      db.endPlaytimeSession('session-1', new Date().toISOString(), 3600, 'completed');

      // Run reconciliation
      const reconciled = db.reconcileExistingLibraryPlatforms();
      expect(reconciled).toBe(1);

      const updatedGames = db.getAllLibraryGames();
      expect(updatedGames).toHaveLength(1);
      expect(updatedGames[0].id).toBe(gameId); // Same ID preserved!
      expect(updatedGames[0].platformId).toBe('ea'); // Reconciled to EA App!
      expect(updatedGames[0].platformName).toBe('EA App');
      expect(updatedGames[0].title).toBe('It Takes Two');
      expect(updatedGames[0].playtimeHours).toBe(1); // Playtime preserved!

      // Favorites preserved!
      const favorites = db.getFavoriteGameIds();
      expect(favorites).toContain(gameId);
    });

    it('respects userPlatformOverride across rescans and does not overwrite user choice', () => {
      // Seed game
      db.upsertDiscoveredGames([
        {
          platformId: 'custom',
          platformName: 'Custom PC Game',
          sourceType: 'custom-folder',
          externalAppId: null,
          title: 'Custom Title',
          installPath: 'D:\\Games\\CustomTitle',
          executablePath: 'D:\\Games\\CustomTitle\\Game.exe',
          executableName: 'Game.exe',
          workingDirectory: 'D:\\Games\\CustomTitle',
          launchArgs: null,
          launchMethod: 'executable',
          launchUri: null,
          isInstalled: true,
          installSizeBytes: 1000,
          buildVersion: 'Local',
          developer: 'Developer',
          publisher: 'Publisher',
          confidenceScore: 70,
          classification: 'verified-game',
        },
      ]);

      const games = db.getAllLibraryGames();
      const gameId = games[0].id;

      // User manually overrides platform to 'steam'
      const edited = db.updateGameDetails(gameId, {
        platformId: 'steam',
        title: 'Manually Overridden Steam Game',
      });

      expect(edited).not.toBeNull();
      expect(edited?.platformId).toBe('steam');
      expect(edited?.platformName).toBe('Steam');
      expect(edited?.userPlatformOverride).toBe('steam');
      expect(edited?.isUserEdited).toBe(true);

      // Now run another scan candidate with 'ea' for the same directory
      db.upsertDiscoveredGames([
        {
          platformId: 'ea',
          platformName: 'EA App',
          sourceType: 'ea',
          externalAppId: '99999',
          title: 'EA Game Title',
          installPath: 'D:\\Games\\CustomTitle',
          executablePath: 'D:\\Games\\CustomTitle\\Game.exe',
          executableName: 'Game.exe',
          workingDirectory: 'D:\\Games\\CustomTitle',
          launchArgs: null,
          launchMethod: 'executable',
          launchUri: null,
          isInstalled: true,
          installSizeBytes: 1000,
          buildVersion: 'Local',
          developer: 'EA',
          publisher: 'EA',
          confidenceScore: 90,
          classification: 'verified-game',
        },
      ]);

      // Verify that user's manual override 'steam' remained intact and no duplicate was created
      const allGames = db.getAllLibraryGames();
      expect(allGames).toHaveLength(1);
      expect(allGames[0].id).toBe(gameId);
      expect(allGames[0].platformId).toBe('steam');
      expect(allGames[0].userPlatformOverride).toBe('steam');
    });
  });
});
