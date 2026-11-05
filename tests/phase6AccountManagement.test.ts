import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';
import { PLATFORM_CAPABILITIES } from '../electron/services/accounts/accountSwitcherService';
import type { PlatformId } from '../src/shared/types/platform';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-p6-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe('Phase 6 Multi-Account Management & Switching Test Suite', () => {
  describe('1. SQLite Migration 5 & Schema Integrity', () => {
    it('applies Migration 5 creating account_profiles, game_account_associations, and account_switch_history', () => {
      const dir = createTempDir();
      const dbPath = path.join(dir, 'test-accounts.sqlite');
      const db = new MaSwitchSqliteDatabase(dbPath);

      // Verify tables exist
      const profiles = db.getAccountProfiles();
      expect(Array.isArray(profiles)).toBe(true);
      expect(profiles.length).toBe(0);

      const associations = db.getGameAccountAssociations();
      expect(Array.isArray(associations)).toBe(true);
      expect(associations.length).toBe(0);

      db.close();
    });

    it('upgrades an existing database without modifying existing games', () => {
      const dir = createTempDir();
      const dbPath = path.join(dir, 'test-upgrade.sqlite');
      const db1 = new MaSwitchSqliteDatabase(dbPath);

      // Add a game to db1
      db1.addCustomGame({
        title: 'Counter-Strike 2',
        executablePath: 'C:\\Games\\CS2\\cs2.exe',
        classification: 'verified-game',
      });
      const games1 = db1.getAllLibraryGames();
      expect(games1.length).toBe(1);
      db1.close();

      // Reopen database
      const db2 = new MaSwitchSqliteDatabase(dbPath);
      const games2 = db2.getAllLibraryGames();
      expect(games2.length).toBe(1);
      expect(games2[0].title).toBe('Counter-Strike 2');

      // Now create an account profile
      const profile = db2.createAccountProfile({
        platformId: 'steam',
        displayName: 'CS Pro Profile',
        username: 'pro_gamer_730',
        isPreferred: true,
      });
      expect(profile.id).toBeDefined();
      expect(profile.displayName).toBe('CS Pro Profile');

      db2.close();
    });
  });

  describe('2. Account Profiles CRUD & Unlimited Slots', () => {
    it('creates, reads, updates, and deletes account profiles across platforms', () => {
      const dir = createTempDir();
      const dbPath = path.join(dir, 'test-crud.sqlite');
      const db = new MaSwitchSqliteDatabase(dbPath);

      // Create profile for Epic Games
      const created = db.createAccountProfile({
        platformId: 'epic',
        displayName: 'Epic Primary',
        username: 'EpicHero_99',
        nickname: 'Main',
        notes: 'Includes Fortnite and Unreal Engine.',
        isPreferred: true,
      });

      expect(created.id).toMatch(/^acc-epic-/);
      expect(created.displayName).toBe('Epic Primary');
      expect(created.username).toBe('EpicHero_99');
      expect(created.nickname).toBe('Main');
      expect(created.isPreferred).toBe(true);
      expect(created.notes).toBe('Includes Fortnite and Unreal Engine.');
      expect(created.lastUsedAt).toBeNull();

      // Read by ID
      const fetched = db.getAccountProfileById(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);

      // Update profile
      const updated = db.updateAccountProfile(created.id, {
        displayName: 'Epic Ultimate',
        nickname: 'Primary Alt',
        notes: 'Updated notes',
      });
      expect(updated).not.toBeNull();
      expect(updated?.displayName).toBe('Epic Ultimate');
      expect(updated?.nickname).toBe('Primary Alt');
      expect(updated?.notes).toBe('Updated notes');

      // Delete profile
      const deleted = db.deleteAccountProfile(created.id);
      expect(deleted).toBe(true);

      const afterDelete = db.getAccountProfileById(created.id);
      expect(afterDelete).toBeNull();

      db.close();
    });

    it('supports creating unlimited profiles without artificial limits', () => {
      const dir = createTempDir();
      const dbPath = path.join(dir, 'test-unlimited.sqlite');
      const db = new MaSwitchSqliteDatabase(dbPath);

      const profileCount = 35;
      for (let i = 1; i <= profileCount; i++) {
        db.createAccountProfile({
          platformId: 'steam',
          displayName: `Steam Slot #${i}`,
          username: `steam_user_${i}`,
          isPreferred: i === 1,
        });
      }

      const allSteamProfiles = db.getAccountProfiles('steam');
      expect(allSteamProfiles.length).toBe(profileCount);

      // Check preferred count on Steam
      const preferred = allSteamProfiles.filter((p) => p.isPreferred);
      expect(preferred.length).toBe(1);
      expect(preferred[0].username).toBe('steam_user_1');

      db.close();
    });

    it('toggles preferred account correctly without affecting other platforms', () => {
      const dir = createTempDir();
      const dbPath = path.join(dir, 'test-preferred.sqlite');
      const db = new MaSwitchSqliteDatabase(dbPath);

      const steam1 = db.createAccountProfile({
        platformId: 'steam',
        displayName: 'Steam A',
        username: 'steam_a',
        isPreferred: true,
      });
      const steam2 = db.createAccountProfile({
        platformId: 'steam',
        displayName: 'Steam B',
        username: 'steam_b',
        isPreferred: false,
      });

      const riot1 = db.createAccountProfile({
        platformId: 'riot',
        displayName: 'Riot A',
        username: 'riot_a',
        isPreferred: true,
      });

      // Switch Steam preferred to steam2
      db.setPreferredAccount(steam2.id);

      const steam1Reloaded = db.getAccountProfileById(steam1.id);
      const steam2Reloaded = db.getAccountProfileById(steam2.id);
      const riot1Reloaded = db.getAccountProfileById(riot1.id);

      expect(steam1Reloaded?.isPreferred).toBe(false);
      expect(steam2Reloaded?.isPreferred).toBe(true);
      // Riot account should remain preferred
      expect(riot1Reloaded?.isPreferred).toBe(true);

      db.close();
    });
  });

  describe('3. Platform Capability Registry', () => {
    it('declares authentic capabilities for all 8 supported gaming platforms', () => {
      const platforms: PlatformId[] = [
        'steam',
        'epic',
        'riot',
        'ea',
        'ubisoft',
        'rockstar',
        'gog',
        'discord',
      ];

      for (const p of platforms) {
        const cap = PLATFORM_CAPABILITIES[p];
        expect(cap).toBeDefined();
        expect(cap.platformId).toBe(p);
        expect(cap.canOpenLauncher).toBe(true);
        expect(typeof cap.canDetectInstalled).toBe('boolean');
        expect(typeof cap.canDetectRunning).toBe('boolean');
        expect(typeof cap.requiresManualSignIn).toBe('boolean');
        expect(typeof cap.securityNote).toBe('string');
        expect(cap.securityNote.length).toBeGreaterThan(10);
      }

      // Steam specific capabilities
      expect(PLATFORM_CAPABILITIES.steam.canDetectActiveAccount).toBe(false);
      expect(PLATFORM_CAPABILITIES.steam.supportedSwitchingMethod).toBe(
        'steam-account-selection'
      );

      // Riot specific capabilities
      expect(PLATFORM_CAPABILITIES.riot.canDetectActiveAccount).toBe(false);
      expect(PLATFORM_CAPABILITIES.riot.requiresManualSignIn).toBe(true);
    });
  });

  describe('6. Game-to-Account Associations', () => {
    it('associates a game with an account profile and retrieves it', () => {
      const dir = createTempDir();
      const dbPath = path.join(dir, 'test-assoc.sqlite');
      const db = new MaSwitchSqliteDatabase(dbPath);

      // Insert game first to satisfy foreign key constraint
      const game = db.addCustomGame({
        title: 'EA SPORTS FC 27',
        executablePath: 'D:\\Games\\FC27\\fc27.exe',
        classification: 'verified-game',
      });
      expect(game).not.toBeNull();
      const gameId = game!.id;

      const profile = db.createAccountProfile({
        platformId: 'ea',
        displayName: 'EA FC Account',
        username: 'eafc_player',
        isPreferred: true,
      });

      // Associate game with account
      db.setGameAccountAssociation(gameId, profile.id);

      const assoc = db.getGameAccountAssociation(gameId);
      expect(assoc).not.toBeNull();
      expect(assoc?.gameId).toBe(gameId);
      expect(assoc?.accountId).toBe(profile.id);
      expect(assoc?.platformId).toBe('ea');

      // Retrieve all associations
      const allAssocs = db.getGameAccountAssociations();
      expect(allAssocs.length).toBe(1);

      // Remove association
      db.setGameAccountAssociation(gameId, null);
      const afterRemove = db.getGameAccountAssociation(gameId);
      expect(afterRemove).toBeNull();

      db.close();
    });

    it('cleans up game associations when the account profile is deleted', () => {
      const dir = createTempDir();
      const dbPath = path.join(dir, 'test-cascade.sqlite');
      const db = new MaSwitchSqliteDatabase(dbPath);

      // Insert game first to satisfy foreign key constraint
      const game = db.addCustomGame({
        title: 'VALORANT',
        executablePath: 'D:\\Games\\Riot Games\\VALORANT\\live\\VALORANT.exe',
        classification: 'verified-game',
      });
      expect(game).not.toBeNull();
      const gameId = game!.id;

      const profile = db.createAccountProfile({
        platformId: 'riot',
        displayName: 'Valorant Ranked',
        username: 'riot_val_pro',
      });

      db.setGameAccountAssociation(gameId, profile.id);
      expect(db.getGameAccountAssociation(gameId)).not.toBeNull();

      // Delete profile
      db.deleteAccountProfile(profile.id);

      // Association should be removed via cascade
      expect(db.getGameAccountAssociation(gameId)).toBeNull();

      db.close();
    });
  });
});
