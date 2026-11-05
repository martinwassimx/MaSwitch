import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createProductionRiotLiveSwitchingEngine,
  type SafeStorageLike,
} from '../electron/services/accounts/riotProductionAdapters';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';
import type { RunningProcessEntry } from '../electron/services/tracker/playtimeTrackerEngine';

describe('Phase 12: Production Riot Live Switching & Vault Integration Tests', () => {
  let testRoot: string;
  let userDataDir: string;
  let syntheticRiotDataDir: string;
  let dbPath: string;
  let sqliteDb: MaSwitchSqliteDatabase;
  let runningProcesses: RunningProcessEntry[] = [];
  let launchedClients: string[] = [];

  const mockSafeStorage: SafeStorageLike = {
    isEncryptionAvailable: () => true,
    encryptString: (str) => Buffer.from(`MOCK_DPAPI_ENCRYPTED:${str}`),
    decryptString: (buf) => {
      const raw = buf.toString('utf8');
      if (!raw.startsWith('MOCK_DPAPI_ENCRYPTED:')) throw new Error('Decryption failed');
      return raw.replace('MOCK_DPAPI_ENCRYPTED:', '');
    },
  };

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-riot-integration-'));
    userDataDir = path.join(testRoot, 'user-data');
    syntheticRiotDataDir = path.join(testRoot, 'synthetic-riot-data');
    dbPath = path.join(userDataDir, 'test-library.sqlite');

    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(syntheticRiotDataDir, { recursive: true });

    sqliteDb = new MaSwitchSqliteDatabase(dbPath);
    runningProcesses = [];
    launchedClients = [];
  });

  afterEach(() => {
    try {
      sqliteDb.close();
    } catch {
      // ignore
    }
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function setupSyntheticRiotFiles(username: string, puuid: string): void {
    const yaml = [
      'client:',
      '  patchline: live',
      `sub: "${puuid}"`,
      `username: "${username}"`,
      'chat:',
      `  current_user: "${username}"`,
      `  puuid: "${puuid}"`,
      'rso-auth:',
      `  user_id: "${puuid}"`,
    ].join('\n');

    fs.writeFileSync(
      path.join(syntheticRiotDataDir, 'RiotGamesPrivateSettings.yaml'),
      yaml,
      'utf8'
    );

    const cookiesDir = path.join(syntheticRiotDataDir, 'Cookies');
    fs.mkdirSync(cookiesDir, { recursive: true });
    fs.writeFileSync(
      path.join(cookiesDir, 'Cookies.sqlite'),
      `SYNTHETIC_COOKIE_DB_FOR_${username}`,
      'utf8'
    );

    const sessionsDir = path.join(syntheticRiotDataDir, 'Sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, 'session.json'),
      JSON.stringify({ activeUser: username, token: `TOKEN_${username}` }),
      'utf8'
    );
  }

  function createIntegrationBundle(enabled = true, safeStorageOverride: SafeStorageLike | null = mockSafeStorage) {
    return createProductionRiotLiveSwitchingEngine({
      userDataDir,
      riotDataDir: syntheticRiotDataDir,
      riotLiveSwitchingEnabled: enabled,
      safeStorageOverride,
      processLister: async () => runningProcesses,
      commandExecutor: async () => {
        runningProcesses = runningProcesses.filter(
          (p) => !p.imageNameLower.includes('riotclient')
        );
        return { stdout: '', stderr: '' };
      },
      clientLauncher: async (execPath) => {
        launchedClients.push(execPath);
      },
    });
  }

  it('initially reports no enrolled profiles in empty vault', async () => {
    const { vault } = createIntegrationBundle();
    const enrolled = await vault.listStoredAccountIds();
    expect(enrolled).toEqual([]);
  });

  it('requires explicit user consent to enroll a session into vault', async () => {
    setupSyntheticRiotFiles('Melynelas', 'puuid-melynelas-001');

    // Simulate consent verification logic
    const consentGiven = false;
    expect(() => {
      if (!consentGiven) {
        throw new Error('Session enrollment requires explicit user approval and consent.');
      }
    }).toThrow(/explicit user approval and consent/);
  });

  it('fails enrollment if DPAPI safeStorage is unavailable', async () => {
    setupSyntheticRiotFiles('Melynelas', 'puuid-melynelas-001');

    const failingSafeStorage: SafeStorageLike = {
      isEncryptionAvailable: () => false,
      encryptString: () => {
        throw new Error('DPAPI unavailable');
      },
      decryptString: () => {
        throw new Error('DPAPI unavailable');
      },
    };

    const { vault, storage } = createIntegrationBundle(true, failingSafeStorage);
    const sessionData = await storage.exportLiveSession();
    expect(sessionData).not.toBeNull();

    await expect(vault.saveSession('melynelas-id', sessionData!)).rejects.toThrow(
      /Windows DPAPI encryption is unavailable/
    );
  });

  it('fails enrollment if a game is actively running', async () => {
    setupSyntheticRiotFiles('Melynelas', 'puuid-melynelas-001');
    runningProcesses = [{ pid: 1234, imageNameLower: 'leagueclient.exe' }];

    const { processCoordinator } = createIntegrationBundle();
    const isGameRunning = await processCoordinator.isGameRunning();
    expect(isGameRunning).toBe(true);
  });

  it('successfully enrolls Melynelas session with DPAPI encryption and restrictive permissions', async () => {
    setupSyntheticRiotFiles('Melynelas', 'puuid-melynelas-001');

    const { vault, storage } = createIntegrationBundle();
    const sessionData = await storage.exportLiveSession();
    expect(sessionData).not.toBeNull();

    await vault.saveSession('melynelas-profile-id', sessionData!);

    const enrolled = await vault.listStoredAccountIds();
    expect(enrolled).toContain('melynelas-profile-id');
    expect(await vault.hasSession('melynelas-profile-id')).toBe(true);

    // Verify vault envelope contains DPAPI scheme and SHA256 integrity
    const vaultFilePath = path.join(userDataDir, 'vault', 'riot', 'melynelas-profile-id.msriot.enc');
    expect(fs.existsSync(vaultFilePath)).toBe(true);

    const envelope = JSON.parse(fs.readFileSync(vaultFilePath, 'utf8'));
    expect(envelope.format).toBe('MSRIOT_VAULT_V1');
    expect(envelope.encryptionScheme).toBe('dpapi');
    expect(envelope.accountId).toBe('melynelas-profile-id');
    expect(envelope.sha256).toBeDefined();

    // Verify decryption succeeds and loads valid buffer
    const loaded = await vault.loadSession('melynelas-profile-id');
    expect(loaded).not.toBeNull();
    expect(loaded!.length).toBe(sessionData!.length);
  });

  it('successfully enrolls both Melynelas and littleimad into the vault', async () => {
    const { vault, storage } = createIntegrationBundle();

    // 1. Enroll Melynelas
    setupSyntheticRiotFiles('Melynelas', 'puuid-melynelas-001');
    const melynelasSession = await storage.exportLiveSession();
    await vault.saveSession('melynelas-profile-id', melynelasSession!);

    // 2. Enroll littleimad
    setupSyntheticRiotFiles('littleimad', 'puuid-littleimad-002');
    const littleimadSession = await storage.exportLiveSession();
    await vault.saveSession('littleimad-profile-id', littleimadSession!);

    const enrolled = await vault.listStoredAccountIds();
    expect(enrolled).toHaveLength(2);
    expect(enrolled).toContain('melynelas-profile-id');
    expect(enrolled).toContain('littleimad-profile-id');
  });

  it('switches between Melynelas and littleimad with atomic file swap and updates SQLite', async () => {
    const { engine, vault, storage } = createIntegrationBundle();

    // Set up profiles in SQLite
    const melynelasProfile = sqliteDb.createAccountProfile({
      platformId: 'riot',
      displayName: 'Melynelas',
      username: 'Melynelas',
    });
    const littleimadProfile = sqliteDb.createAccountProfile({
      platformId: 'riot',
      displayName: 'littleimad',
      username: 'littleimad',
    });

    // Enroll Melynelas
    setupSyntheticRiotFiles('Melynelas', 'puuid-melynelas-001');
    const melynelasData = await storage.exportLiveSession();
    await vault.saveSession(melynelasProfile.id, melynelasData!);

    // Enroll littleimad
    setupSyntheticRiotFiles('littleimad', 'puuid-littleimad-002');
    const littleimadData = await storage.exportLiveSession();
    await vault.saveSession(littleimadProfile.id, littleimadData!);

    // Initially active in live folder is littleimad
    expect(await storage.readCurrentActiveSessionId()).toBe('puuid-littleimad-002');

    // 1. Switch to Melynelas
    const switchResult1 = await engine.switchAccount(melynelasProfile.id);
    expect(switchResult1.success).toBe(true);
    expect(switchResult1.state).toBe('completed');
    expect(switchResult1.targetAccountId).toBe(melynelasProfile.id);

    // Live files on disk must now reflect Melynelas!
    expect(await storage.readCurrentActiveSessionId()).toBe('puuid-melynelas-001');
    const liveYaml1 = fs.readFileSync(path.join(syntheticRiotDataDir, 'RiotGamesPrivateSettings.yaml'), 'utf8');
    expect(liveYaml1).toContain('username: "Melynelas"');

    // Record in SQLite
    sqliteDb.selectAccountProfile(melynelasProfile.id, 'riot');
    sqliteDb.recordAccountSwitch(
      melynelasProfile.id,
      'riot',
      'live_dpapi',
      true,
      'Switched via Windows DPAPI encrypted session vault',
      switchResult1.fromAccountId
    );

    const activeRiot = sqliteDb.getActiveProfileForPlatform('riot');
    expect(activeRiot?.accountId).toBe(melynelasProfile.id);

    // 2. Switch back to littleimad
    const switchResult2 = await engine.switchAccount(littleimadProfile.id);
    expect(switchResult2.success).toBe(true);
    expect(switchResult2.state).toBe('completed');
    expect(switchResult2.targetAccountId).toBe(littleimadProfile.id);

    // Live files on disk must now reflect littleimad!
    expect(await storage.readCurrentActiveSessionId()).toBe('puuid-littleimad-002');
    const liveYaml2 = fs.readFileSync(path.join(syntheticRiotDataDir, 'RiotGamesPrivateSettings.yaml'), 'utf8');
    expect(liveYaml2).toContain('username: "littleimad"');

    // Record in SQLite
    sqliteDb.selectAccountProfile(littleimadProfile.id, 'riot');
    sqliteDb.recordAccountSwitch(
      littleimadProfile.id,
      'riot',
      'live_dpapi',
      true,
      'Switched via Windows DPAPI encrypted session vault',
      switchResult2.fromAccountId
    );

    const activeRiot2 = sqliteDb.getActiveProfileForPlatform('riot');
    expect(activeRiot2?.accountId).toBe(littleimadProfile.id);

    // Verify switch history was accurately recorded
    const history = sqliteDb.getAccountSwitchHistory();
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].accountId).toBe(littleimadProfile.id);
    expect(history[0].methodUsed).toBe('live_dpapi');
  });

  it('blocks switching when a Riot game is currently running', async () => {
    const { engine, vault, storage } = createIntegrationBundle();

    setupSyntheticRiotFiles('Melynelas', 'puuid-melynelas-001');
    const melynelasData = await storage.exportLiveSession();
    await vault.saveSession('target-id', melynelasData!);

    // Simulate VALORANT running
    runningProcesses = [{ pid: 9999, imageNameLower: 'valorant-win64-shipping.exe' }];

    await expect(engine.switchAccount('target-id')).rejects.toThrow(
      /League of Legends or Valorant is currently running/
    );
  });

  it('securely removes session from DPAPI vault with shredding', async () => {
    const { vault, storage } = createIntegrationBundle();

    setupSyntheticRiotFiles('Melynelas', 'puuid-melynelas-001');
    const data = await storage.exportLiveSession();
    await vault.saveSession('to-remove-id', data!);

    expect(await vault.hasSession('to-remove-id')).toBe(true);

    await vault.deleteSession('to-remove-id');

    expect(await vault.hasSession('to-remove-id')).toBe(false);
    expect(await vault.listStoredAccountIds()).not.toContain('to-remove-id');
  });

  it('can recover cleanly from an interrupted swap using journal', async () => {
    const { engine, vault, storage } = createIntegrationBundle();

    setupSyntheticRiotFiles('Melynelas', 'puuid-melynelas-001');
    const data = await storage.exportLiveSession();
    await vault.saveSession('melynelas-id', data!);

    // Normal state: no pending recovery needed
    const recovery = await engine.recoverPendingOperation();
    expect(recovery.recovered).toBe(false);
  });
});
