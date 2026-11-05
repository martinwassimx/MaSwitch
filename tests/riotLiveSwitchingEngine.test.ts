import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createSyntheticRiotLiveSwitchingEngine,
  RiotClientRunningError,
  RiotConcurrentOperationError,
  RiotFeatureDisabledError,
  RiotGameRunningError,
  RiotOperationCancelledError,
  RiotProfileSessionNotFoundError,
  RiotSessionExpiredError,
  type RiotLiveSwitchingEngine,
  type RiotSessionStorage,
} from '../electron/services/accounts/riotLiveSwitchingEngine';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';
import type { RiotSwitchLiveState } from '../src/shared/types/account';

describe('Phase 9: Riot Games Live Switching Engine & Approval Gate Test Suite', () => {
  let testDir: string;
  let engine: RiotLiveSwitchingEngine;
  let storage: RiotSessionStorage;
  let isGameRunningMock: ReturnType<typeof vi.fn>;
  let isClientRunningMock: ReturnType<typeof vi.fn>;
  let requestGracefulShutdownMock: ReturnType<typeof vi.fn>;
  let launchClientMock: ReturnType<typeof vi.fn>;

  const ACCOUNT_A = 'melynelas-euw-id';
  const ACCOUNT_B = 'littleimad-euwn-id';

  beforeEach(async () => {
    vi.clearAllMocks();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-live-test-'));

    isGameRunningMock = vi.fn(async () => false);
    isClientRunningMock = vi.fn(async () => false);
    requestGracefulShutdownMock = vi.fn(async () => true);
    launchClientMock = vi.fn(async () => {});

    const synthetic = createSyntheticRiotLiveSwitchingEngine({
      enabled: true, // Enabled for testing the engine logic
      testDir,
      isGameRunning: isGameRunningMock,
      isClientRunning: isClientRunningMock,
      requestGracefulShutdown: requestGracefulShutdownMock,
      launchClient: launchClientMock,
      vaultSessions: {
        [ACCOUNT_A]: { data: Buffer.from('SESSION_DATA_FOR_ACCOUNT:melynelas-euw-id') },
        [ACCOUNT_B]: { data: Buffer.from('SESSION_DATA_FOR_ACCOUNT:littleimad-euwn-id') },
        'expired-account-id': { data: Buffer.from('SESSION_DATA_FOR_ACCOUNT:expired-account-id'), expired: true },
      },
    });

    engine = synthetic.engine;
    storage = synthetic.storage;
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // 1. Account A selection (LOL EUW — Melynelas)
  it('1. successfully selects Account A (LOL EUW — Melynelas) through the live engine', async () => {
    const states: RiotSwitchLiveState[] = [];
    engine.onStateChange((state) => states.push(state));

    const result = await engine.switchAccount(ACCOUNT_A);

    expect(result.success).toBe(true);
    expect(result.targetAccountId).toBe(ACCOUNT_A);
    expect(result.fromAccountId).toBeNull();
    expect(result.state).toBe('completed');
    expect(launchClientMock).toHaveBeenCalledTimes(1);

    const activeSession = await storage.readCurrentActiveSessionId();
    expect(activeSession).toBe(ACCOUNT_A);

    expect(states).toContain('preflight');
    expect(states).toContain('checking-processes');
    expect(states).toContain('journaling');
    expect(states).toContain('swapping-session');
    expect(states).toContain('verifying-files');
    expect(states).toContain('launching-client');
    expect(states).toContain('completed');
  });

  // 2. Account B selection (LOL EUWN — littleimad)
  it('2. successfully selects Account B (LOL EUWN — littleimad) when starting from Account A', async () => {
    // Start with Account A active in storage
    await storage.applySessionAtomically(Buffer.from('SESSION_DATA_FOR_ACCOUNT:melynelas-euw-id'));
    expect(await storage.readCurrentActiveSessionId()).toBe(ACCOUNT_A);

    const result = await engine.switchAccount(ACCOUNT_B);

    expect(result.success).toBe(true);
    expect(result.fromAccountId).toBe(ACCOUNT_A);
    expect(result.targetAccountId).toBe(ACCOUNT_B);
    expect(result.state).toBe('completed');

    const activeSession = await storage.readCurrentActiveSessionId();
    expect(activeSession).toBe(ACCOUNT_B);
    expect(launchClientMock).toHaveBeenCalledTimes(1);
  });

  // 3. Missing profile rejection
  it('3. rejects switch when target profile session is missing from vault', async () => {
    await storage.applySessionAtomically(Buffer.from('SESSION_DATA_FOR_ACCOUNT:melynelas-euw-id'));

    await expect(engine.switchAccount('nonexistent-profile-id')).rejects.toThrow(
      RiotProfileSessionNotFoundError
    );

    // Active session remains unchanged
    expect(await storage.readCurrentActiveSessionId()).toBe(ACCOUNT_A);
    expect(launchClientMock).not.toHaveBeenCalled();
    expect(engine.getCurrentState()).toBe('failed');
  });

  // 4. Running Riot Client rejection (when shutdown fails)
  it('4. rejects switch when Riot Client is running and cannot be closed', async () => {
    isClientRunningMock.mockResolvedValue(true);
    requestGracefulShutdownMock.mockResolvedValue(false); // Shutdown fails

    await expect(engine.switchAccount(ACCOUNT_A)).rejects.toThrow(RiotClientRunningError);
    expect(launchClientMock).not.toHaveBeenCalled();
    expect(engine.getCurrentState()).toBe('failed');
  });

  // 5. Running League of Legends rejection
  it('5. strictly rejects switch when League of Legends or Valorant is actively running', async () => {
    isGameRunningMock.mockResolvedValue(true); // Game active

    await expect(engine.switchAccount(ACCOUNT_A)).rejects.toThrow(RiotGameRunningError);
    expect(launchClientMock).not.toHaveBeenCalled();
    expect(engine.getCurrentState()).toBe('failed');
  });

  // 6. Expired simulated session rejection
  it('6. rejects switch when target session is marked expired in vault', async () => {
    await expect(engine.switchAccount('expired-account-id')).rejects.toThrow(
      RiotSessionExpiredError
    );
    expect(launchClientMock).not.toHaveBeenCalled();
    expect(engine.getCurrentState()).toBe('failed');
  });

  // 7. Interrupted operation & atomic rollback
  it('7. automatically rolls back to previous session when client launch fails', async () => {
    // Start with Account A active
    await storage.applySessionAtomically(Buffer.from('SESSION_DATA_FOR_ACCOUNT:melynelas-euw-id'));
    launchClientMock.mockRejectedValueOnce(new Error('Process execution blocked by OS'));

    await expect(engine.switchAccount(ACCOUNT_B)).rejects.toThrow(
      'Process execution blocked by OS'
    );

    // Active session must be rolled back to Account A
    expect(await storage.readCurrentActiveSessionId()).toBe(ACCOUNT_A);
    expect(engine.getCurrentState()).toBe('rolled-back');
  });

  // 8. Cancellation
  it('8. cleanly aborts switch when cancellation is requested before swap', async () => {
    engine.onStateChange((state) => {
      if (state === 'preflight') {
        const opId = engine.getActiveOperationId();
        if (opId) {
          engine.cancelOperation(opId);
        }
      }
    });

    await expect(engine.switchAccount(ACCOUNT_A)).rejects.toThrow(
      RiotOperationCancelledError
    );
    expect(engine.getCurrentState()).toBe('cancelled');
    expect(launchClientMock).not.toHaveBeenCalled();
  });

  // 9. Concurrent switching attempts rejection
  it('9. prohibits concurrent switching attempts with lock error', async () => {
    let unblockGameCheck: (val: boolean) => void;
    isGameRunningMock.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          unblockGameCheck = resolve;
        })
    );

    const promise1 = engine.switchAccount(ACCOUNT_A);

    // Attempting a second switch while first is in-flight must throw
    await expect(engine.switchAccount(ACCOUNT_B)).rejects.toThrow(
      RiotConcurrentOperationError
    );

    unblockGameCheck!(false);
    const result1 = await promise1;
    expect(result1.success).toBe(true);
  });

  // 10. Recovery from pending journal
  it('10. detects and recovers interrupted operation from durable journal on restart', async () => {
    // Simulate a crash scenario where journal was left pending
    const journalPath = path.join(testDir, 'live_switch_journal.json');
    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        operationId: 'crashed-op-999',
        fromAccountId: ACCOUNT_A,
        targetAccountId: ACCOUNT_B,
        timestampIso: new Date().toISOString(),
        stage: 'swapping-session',
        pending: true,
      })
    );

    const recovery = await engine.recoverPendingOperation();

    expect(recovery.recovered).toBe(true);
    expect(recovery.operationId).toBe('crashed-op-999');
    expect(recovery.restoredAccountId).toBe(ACCOUNT_A);

    // Journal must be marked no longer pending
    const savedJournal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    expect(savedJournal.pending).toBe(false);
    expect(savedJournal.stage).toBe('rolled-back');
  });

  // 11. False success prevention
  it('11. strictly prevents false authentication reporting (status remains unknown)', async () => {
    const caps = engine.getCapabilities();
    expect(caps.authenticationStatus).toBe('unknown');
    expect(caps.liveSwitchingSupported).toBe(true);

    const result = await engine.switchAccount(ACCOUNT_A);
    expect(result.authenticationStatus).toBe('unknown');
    expect(result.verificationStatus).toBe('unverified');
    expect((result as unknown as Record<string, unknown>).verified).toBeUndefined();
  });

  // 12. Disabled experimental feature (approval gate test)
  it('12. enforces approval gate: strictly rejects live switching when feature flag is disabled', async () => {
    // Engine created with enabled: false (the production default)
    const disabledEngine = createSyntheticRiotLiveSwitchingEngine({
      enabled: false,
      testDir,
      vaultSessions: {
        [ACCOUNT_A]: { data: Buffer.from('SESSION_DATA_FOR_ACCOUNT:melynelas-euw-id') },
      },
    }).engine;

    const caps = disabledEngine.getCapabilities();
    expect(caps.approvalStatus).toBe('pending-user-approval');

    await expect(disabledEngine.switchAccount(ACCOUNT_A)).rejects.toThrow(
      RiotFeatureDisabledError
    );
    expect(launchClientMock).not.toHaveBeenCalled();
  });

  // 13. Existing database preservation
  it('13. confirms SQLite database profiles persist alongside Riot live engine without conflict', () => {
    const dbPath = path.join(testDir, 'maswitch-db-preservation.sqlite');
    const db = new MaSwitchSqliteDatabase(dbPath);

    try {
      const a = db.createAccountProfile({
        platformId: 'riot',
        displayName: 'LOL EUW — Melynelas',
        username: 'Melynelas#EUW',
        isPreferred: true,
      });

      const b = db.createAccountProfile({
        platformId: 'riot',
        displayName: 'LOL EUWN — littleimad',
        username: 'littleimad#EUWN',
        isPreferred: false,
      });

      expect(a.id).toBeDefined();
      expect(b.id).toBeDefined();

      const profiles = db.getAccountProfiles('riot');
      expect(profiles).toHaveLength(2);
      expect(profiles.map((p) => p.displayName)).toEqual([
        'LOL EUW — Melynelas',
        'LOL EUWN — littleimad',
      ]);

      // Record switch
      const switchId = db.recordAccountSwitch(
        b.id,
        'riot',
        'riot-live-switching-architecture',
        true,
        'Simulated live switch run',
        a.id
      );

      expect(switchId).toBeDefined();
      const history = db.getAccountSwitchHistory(b.id);
      expect(history).toHaveLength(1);
      expect(history[0].fromAccountId).toBe(a.id);
    } finally {
      db.close();
    }
  });
});
