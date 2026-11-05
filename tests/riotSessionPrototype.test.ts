import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RiotSessionPrototypeAdapter,
  createSyntheticFileRiotSystemAccess,
  RiotClientRunningError,
  RiotFixtureNotFoundError,
  RiotSessionExpiredError,
  RiotConcurrentOperationError,
  RiotOperationCancelledError,
  type RiotPrototypeSwitchState,
  type RiotPrototypeJournal,
  type RiotSystemAccess,
} from '../electron/services/accounts/riotSessionPrototype';
import { SteamRememberedSelection } from '../electron/services/accounts/steamRememberedSelection';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';

describe('Phase 7: Riot Games Unofficial Account Switching Safe Prototype', () => {
  let dir: string;
  let systemAccess: RiotSystemAccess;
  let adapter: RiotSessionPrototypeAdapter;
  let isRunningMock: ReturnType<typeof vi.fn>;
  let openClientMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Use an isolated temporary test sandbox for synthetic files
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-riot-proto-'));
    isRunningMock = vi.fn(async () => false);
    openClientMock = vi.fn(async () => {});

    systemAccess = createSyntheticFileRiotSystemAccess(dir, {
      isRunning: isRunningMock,
      openClientMock: openClientMock,
    });

    adapter = new RiotSessionPrototypeAdapter(systemAccess, () => new Date('2026-11-05T12:00:00.000Z'));
  });

  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  // 1. Selecting account A
  it('1. selects Account A (LOL EUWN — littleimad) on synthetic fixtures', async () => {
    const transitions: RiotPrototypeSwitchState[] = [];
    adapter.onStateChange((state) => transitions.push(state));

    const result = await adapter.selectProfile('riot-euwn-littleimad');

    expect(result.success).toBe(true);
    expect(result.targetProfileId).toBe('riot-euwn-littleimad');
    expect(result.activeProfileId).toBe('riot-euwn-littleimad');
    expect(result.previousProfileId).toBeNull();
    expect(result.isSimulated).toBe(true);
    expect(result.authenticationStatus).toBe('unknown');
    expect(result.verificationStatus).toBe('unverified');

    const activeInStorage = await systemAccess.readActiveSession();
    expect(activeInStorage).toBe('riot-euwn-littleimad');
    expect(openClientMock).toHaveBeenCalledTimes(1);
    expect(transitions).toContain('validating');
    expect(transitions).toContain('checking-client-status');
    expect(transitions).toContain('reading-fixtures');
    expect(transitions).toContain('journaling');
    expect(transitions).toContain('swapping-simulated-session');
    expect(transitions).toContain('verifying');
    expect(transitions).toContain('completed');
  });

  // 2. Selecting account B
  it('2. selects Account B (LOL EUW — Melynelas) on synthetic fixtures', async () => {
    const result = await adapter.selectProfile('riot-euw-melynelas');

    expect(result.success).toBe(true);
    expect(result.targetProfileId).toBe('riot-euw-melynelas');
    expect(result.activeProfileId).toBe('riot-euw-melynelas');
    expect(result.authenticationStatus).toBe('unknown');
    expect(result.verificationStatus).toBe('unverified');

    const activeInStorage = await systemAccess.readActiveSession();
    expect(activeInStorage).toBe('riot-euw-melynelas');
  });

  // 3. Simulated A-to-B transition
  it('3. executes simulated A-to-B transition, preserving prior session in journal and updating active profile', async () => {
    // Start with Account A active
    await systemAccess.writeActiveSession('riot-euwn-littleimad');

    const result = await adapter.selectProfile('riot-euw-melynelas');

    expect(result.success).toBe(true);
    expect(result.previousProfileId).toBe('riot-euwn-littleimad');
    expect(result.targetProfileId).toBe('riot-euw-melynelas');
    expect(result.activeProfileId).toBe('riot-euw-melynelas');

    const activeInStorage = await systemAccess.readActiveSession();
    expect(activeInStorage).toBe('riot-euw-melynelas');

    const journal = await systemAccess.readJournal();
    expect(journal).toMatchObject({
      previousProfileId: 'riot-euwn-littleimad',
      targetProfileId: 'riot-euw-melynelas',
      pending: false,
    });
  });

  // 4. Missing session fixture
  it('4. rejects switch when session fixture is missing without modifying active session', async () => {
    await systemAccess.writeActiveSession('riot-euwn-littleimad');

    await expect(adapter.selectProfile('non-existent-account')).rejects.toThrow(RiotFixtureNotFoundError);

    expect(await systemAccess.readActiveSession()).toBe('riot-euwn-littleimad');
    expect(adapter.getCurrentState()).toBe('failed');
    expect(openClientMock).not.toHaveBeenCalled();
  });

  // 5. Expired simulated session
  it('5. rejects switch when simulated session fixture is expired or revoked', async () => {
    await systemAccess.writeActiveSession('riot-euwn-littleimad');

    // Expired fixture
    await expect(adapter.selectProfile('riot-expired-account')).rejects.toThrow(RiotSessionExpiredError);
    expect(await systemAccess.readActiveSession()).toBe('riot-euwn-littleimad');
    expect(adapter.getCurrentState()).toBe('failed');

    // Revoked fixture
    await expect(adapter.selectProfile('riot-revoked-account')).rejects.toThrow(RiotSessionExpiredError);
    expect(await systemAccess.readActiveSession()).toBe('riot-euwn-littleimad');
  });

  // 6. Client already running
  it('6. rejects switch when Riot Client or game is running (ClientRunningError)', async () => {
    isRunningMock.mockResolvedValue(true);
    await systemAccess.writeActiveSession('riot-euwn-littleimad');

    await expect(adapter.selectProfile('riot-euw-melynelas')).rejects.toThrow(RiotClientRunningError);

    // Active session and files must be untouched
    expect(await systemAccess.readActiveSession()).toBe('riot-euwn-littleimad');
    expect(await systemAccess.readJournal()).toBeNull();
    expect(openClientMock).not.toHaveBeenCalled();
  });

  // 7. Interrupted switch with automatic rollback
  it('7. automatically rolls back simulated session when launch fails', async () => {
    await systemAccess.writeActiveSession('riot-euwn-littleimad');
    openClientMock.mockRejectedValueOnce(new Error('Simulated launcher startup failure'));

    await expect(adapter.selectProfile('riot-euw-melynelas')).rejects.toThrow('Simulated launcher startup failure');

    // Active session must be rolled back to Account A
    expect(await systemAccess.readActiveSession()).toBe('riot-euwn-littleimad');
    expect(adapter.getCurrentState()).toBe('rolled-back');
  });

  // 8. Recovery of pending journal on restart
  it('8. recovers an interrupted switch from pending journal on restart', async () => {
    // Simulate a crash scenario where journal was pending and active session was halfway modified
    await systemAccess.writeActiveSession('riot-euw-melynelas');
    const crashedJournal: RiotPrototypeJournal = {
      operationId: 'crashed-op-12345',
      previousProfileId: 'riot-euwn-littleimad',
      targetProfileId: 'riot-euw-melynelas',
      timestampIso: '2026-11-05T10:00:00.000Z',
      pending: true,
    };
    await systemAccess.writeJournal(crashedJournal);

    const recovery = await adapter.recoverInterruptedOperation();

    expect(recovery.recovered).toBe(true);
    expect(recovery.operationId).toBe('crashed-op-12345');
    expect(recovery.restoredProfileId).toBe('riot-euwn-littleimad');

    // Active session is restored to Account A
    expect(await systemAccess.readActiveSession()).toBe('riot-euwn-littleimad');
    // Journal is marked no longer pending
    const updatedJournal = await systemAccess.readJournal();
    expect(updatedJournal?.pending).toBe(false);
  });

  // 9. Operation cancellation
  it('9. supports cancelling an in-flight operation before swap', async () => {
    let capturedOpId: string | null = null;
    adapter.onStateChange((state) => {
      if (state === 'validating') {
        capturedOpId = adapter.getActiveOperationId();
        if (capturedOpId) {
          adapter.cancelOperation(capturedOpId);
        }
      }
    });

    await expect(adapter.selectProfile('riot-euw-melynelas')).rejects.toThrow(RiotOperationCancelledError);
    expect(adapter.getCurrentState()).toBe('cancelled');
    expect(openClientMock).not.toHaveBeenCalled();
  });

  // 10. Concurrent operations locking
  it('10. prevents concurrent operations with explicit lock error', async () => {
    // Artificially delay isRunningMock to simulate async in-flight operation
    let resolveRunning: (val: boolean) => void;
    isRunningMock.mockImplementationOnce(
      () =>
        new Promise<boolean>((res) => {
          resolveRunning = res;
        })
    );

    const promise1 = adapter.selectProfile('riot-euwn-littleimad');

    // Attempting a second switch while first is in-flight must throw
    await expect(adapter.selectProfile('riot-euw-melynelas')).rejects.toThrow(RiotConcurrentOperationError);

    // Complete the first operation
    resolveRunning!(false);
    const result1 = await promise1;
    expect(result1.success).toBe(true);
  });

  // 11. False authentication prevention
  it('11. strictly prevents false authentication reporting (status remains unknown)', async () => {
    const capabilities = adapter.getCapabilities();
    expect(capabilities.authenticationStatus).toBe('unknown');
    expect(capabilities.isLiveOperationSupported).toBe(false);

    const result = await adapter.selectProfile('riot-euwn-littleimad');
    expect(result.authenticationStatus).toBe('unknown');
    expect(result.verificationStatus).toBe('unverified');
    expect((result as unknown as Record<string, unknown>).verified).toBeUndefined();
  });

  // 12. Steam adapter regression check
  it('12. ensures Steam remembered-account adapter remains unaffected and operational', async () => {
    let steamValue: string | null = 'alice';
    const steamRunning = vi.fn(async () => false);
    const steamWrite = vi.fn(async (next: string | null) => {
      steamValue = next;
    });
    const steamOpen = vi.fn(async () => {});

    const steamBackupPath = path.join(dir, 'steam_backup.json');
    const steamConfigDir = path.join(dir, 'config');
    fs.mkdirSync(steamConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(steamConfigDir, 'loginusers.vdf'),
      '"users" { "1" { "AccountName" "alice" "RememberPassword" "1" "AllowAutoLogin" "1" } "2" { "AccountName" "bob" "RememberPassword" "1" "AllowAutoLogin" "1" } }'
    );

    const steamSelector = new SteamRememberedSelection(
      { running: steamRunning, read: async () => steamValue, write: steamWrite },
      steamBackupPath
    );

    await steamSelector.select(path.join(dir, 'steam.exe'), 'bob', steamOpen);
    expect(steamValue).toBe('bob');
    expect(steamOpen).toHaveBeenCalledTimes(1);
  });

  // 13. Database persistence check
  it('13. confirms SQLite database profiles persist alongside Riot prototype without interference', () => {
    const dbPath = path.join(dir, 'maswitch-test.sqlite');
    const db = new MaSwitchSqliteDatabase(dbPath);

    try {
      const p1 = db.createAccountProfile({
        platformId: 'riot',
        displayName: 'LOL EUWN — littleimad',
        username: 'littleimad#EUWN',
        isPreferred: true,
      });

      const p2 = db.createAccountProfile({
        platformId: 'riot',
        displayName: 'LOL EUW — Melynelas',
        username: 'Melynelas#EUW',
        isPreferred: false,
      });

      expect(p1.id).toBeDefined();
      expect(p2.id).toBeDefined();

      const riotProfiles = db.getAccountProfiles('riot');
      expect(riotProfiles).toHaveLength(2);
      expect(riotProfiles.map((p) => p.username)).toEqual(['littleimad#EUWN', 'Melynelas#EUW']);

      // Record switch history
      const historyId = db.recordAccountSwitch(
        p2.id,
        'riot',
        'synthetic-prototype-research',
        true,
        'Simulated prototype verification run',
        p1.id
      );

      expect(historyId).toBeDefined();
      expect(db.getAccountSwitchHistory(p2.id)).toHaveLength(1);
    } finally {
      db.close();
    }
  });
});
