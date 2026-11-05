import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type RiotPrototypeSwitchState =
  | 'idle'
  | 'validating'
  | 'checking-client-status'
  | 'reading-fixtures'
  | 'journaling'
  | 'swapping-simulated-session'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'rolled-back'
  | 'cancelled';

export interface SyntheticRiotSessionFixture {
  profileId: string;
  displayName: string;
  riotId: string;
  region: string;
  sessionTokenHash: string; // Synthetic hash only, no real token
  createdAtIso: string;
  expiresAtIso: string;
  isRevoked?: boolean;
}

export interface RiotPrototypeJournal {
  operationId: string;
  previousProfileId: string | null;
  targetProfileId: string;
  timestampIso: string;
  pending: boolean;
}

export interface RiotPrototypeCapabilities {
  platformId: 'riot';
  capabilityType: 'experimental-synthetic-prototype';
  isLiveOperationSupported: false;
  requiresClientShutdown: true;
  sessionStorageType: 'synthetic-file-journal';
  canDetectRunning: true;
  authenticationStatus: 'unknown';
  securityNotice: string;
}

export interface RiotPrototypeSwitchResult {
  success: boolean;
  operationId: string;
  targetProfileId: string;
  previousProfileId: string | null;
  activeProfileId: string | null;
  state: RiotPrototypeSwitchState;
  authenticationStatus: 'unknown';
  verificationStatus: 'unverified';
  isSimulated: true;
  warningMessage: string;
  durationMs: number;
}

export interface RiotPrototypeRecoveryResult {
  recovered: boolean;
  operationId?: string;
  restoredProfileId: string | null;
  message: string;
}

export interface RiotSystemAccess {
  isRunning(): Promise<boolean>;
  readActiveSession(): Promise<string | null>;
  writeActiveSession(profileId: string | null): Promise<void>;
  readJournal(): Promise<RiotPrototypeJournal | null>;
  writeJournal(journal: RiotPrototypeJournal | null): Promise<void>;
  openClientMock(): Promise<void>;
  readFixture(profileId: string): Promise<SyntheticRiotSessionFixture | null>;
}

export class RiotClientRunningError extends Error {
  constructor(message = 'Exit Riot Client and League of Legends completely before attempting session prototype switch.') {
    super(message);
    this.name = 'RiotClientRunningError';
  }
}

export class RiotFixtureNotFoundError extends Error {
  constructor(profileId: string) {
    super(`Synthetic Riot session fixture for profile '${profileId}' not found.`);
    this.name = 'RiotFixtureNotFoundError';
  }
}

export class RiotSessionExpiredError extends Error {
  constructor(profileId: string) {
    super(`Simulated Riot session fixture for profile '${profileId}' is expired or revoked.`);
    this.name = 'RiotSessionExpiredError';
  }
}

export class RiotConcurrentOperationError extends Error {
  constructor() {
    super('Another Riot account switch operation is already in progress.');
    this.name = 'RiotConcurrentOperationError';
  }
}

export class RiotOperationCancelledError extends Error {
  constructor(operationId: string) {
    super(`Riot switch operation '${operationId}' was cancelled by user.`);
    this.name = 'RiotOperationCancelledError';
  }
}

/** Built-in synthetic test fixtures representing user accounts and test edge cases */
export const SYNTHETIC_RIOT_FIXTURES: Record<string, SyntheticRiotSessionFixture> = {
  'riot-euwn-littleimad': {
    profileId: 'riot-euwn-littleimad',
    displayName: 'LOL EUWN — littleimad',
    riotId: 'littleimad#EUWN',
    region: 'EUWN',
    sessionTokenHash: 'mock-synthetic-token-hash-littleimad-982348',
    createdAtIso: '2026-01-01T00:00:00.000Z',
    expiresAtIso: '2028-01-01T00:00:00.000Z',
  },
  'riot-euw-melynelas': {
    profileId: 'riot-euw-melynelas',
    displayName: 'LOL EUW — Melynelas',
    riotId: 'Melynelas#EUW',
    region: 'EUW',
    sessionTokenHash: 'mock-synthetic-token-hash-melynelas-102934',
    createdAtIso: '2026-01-01T00:00:00.000Z',
    expiresAtIso: '2028-01-01T00:00:00.000Z',
  },
  'riot-expired-account': {
    profileId: 'riot-expired-account',
    displayName: 'Expired Account',
    riotId: 'Expired#NA1',
    region: 'NA1',
    sessionTokenHash: 'mock-synthetic-token-hash-expired',
    createdAtIso: '2024-01-01T00:00:00.000Z',
    expiresAtIso: '2024-06-01T00:00:00.000Z',
  },
  'riot-revoked-account': {
    profileId: 'riot-revoked-account',
    displayName: 'Revoked Account',
    riotId: 'Revoked#EUW',
    region: 'EUW',
    sessionTokenHash: 'mock-synthetic-token-hash-revoked',
    createdAtIso: '2026-01-01T00:00:00.000Z',
    expiresAtIso: '2028-01-01T00:00:00.000Z',
    isRevoked: true,
  },
};

/**
 * Creates a file-system backed RiotSystemAccess that writes strictly to an isolated synthetic sandbox directory.
 * Never connects to or reads %LOCALAPPDATA%\Riot Games.
 */
export function createSyntheticFileRiotSystemAccess(
  storageDir: string,
  overrides?: {
    isRunning?: () => Promise<boolean>;
    openClientMock?: () => Promise<void>;
    fixtures?: Record<string, SyntheticRiotSessionFixture>;
  }
): RiotSystemAccess {
  fs.mkdirSync(storageDir, { recursive: true });
  const activeSessionFile = path.join(storageDir, 'synthetic_active_session.json');
  const journalFile = path.join(storageDir, 'synthetic_riot_journal.json');
  const fixtures = { ...SYNTHETIC_RIOT_FIXTURES, ...(overrides?.fixtures ?? {}) };

  const saveAtomic = (filePath: string, content: string) => {
    const tempFile = `${filePath}.${randomUUID()}.tmp`;
    const fd = fs.openSync(tempFile, 'wx');
    try {
      fs.writeFileSync(fd, content);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.renameSync(tempFile, filePath);
    } finally {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
      }
    }
  };

  return {
    isRunning: overrides?.isRunning ?? (async () => false),
    readActiveSession: async () => {
      if (!fs.existsSync(activeSessionFile)) return null;
      try {
        const raw = fs.readFileSync(activeSessionFile, 'utf8');
        const parsed = JSON.parse(raw) as { activeProfileId: string | null };
        return parsed.activeProfileId ?? null;
      } catch {
        return null;
      }
    },
    writeActiveSession: async (profileId) => {
      saveAtomic(activeSessionFile, JSON.stringify({ activeProfileId: profileId }));
    },
    readJournal: async () => {
      if (!fs.existsSync(journalFile)) return null;
      try {
        const raw = fs.readFileSync(journalFile, 'utf8');
        return JSON.parse(raw) as RiotPrototypeJournal;
      } catch {
        return null;
      }
    },
    writeJournal: async (journal) => {
      if (journal === null) {
        if (fs.existsSync(journalFile)) {
          try { fs.unlinkSync(journalFile); } catch { /* ignore */ }
        }
      } else {
        saveAtomic(journalFile, JSON.stringify(journal));
      }
    },
    openClientMock: overrides?.openClientMock ?? (async () => {}),
    readFixture: async (profileId) => fixtures[profileId] ?? null,
  };
}

/**
 * Isolated prototype adapter for simulating session-based Riot switching.
 * Strictly operates on synthetic fixtures and enforces unknown authentication status.
 */
export class RiotSessionPrototypeAdapter {
  private activeOperationId: string | null = null;
  private cancellationRequested = false;
  private currentState: RiotPrototypeSwitchState = 'idle';
  private stateListeners: Array<(state: RiotPrototypeSwitchState, details?: unknown) => void> = [];

  constructor(
    private readonly systemAccess: RiotSystemAccess,
    private readonly nowProvider: () => Date = () => new Date()
  ) {}

  onStateChange(listener: (state: RiotPrototypeSwitchState, details?: unknown) => void): () => void {
    this.stateListeners.push(listener);
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== listener);
    };
  }

  private transition(state: RiotPrototypeSwitchState, details?: unknown): void {
    this.currentState = state;
    for (const listener of this.stateListeners) {
      try {
        listener(state, details);
      } catch {
        // Safe emission
      }
    }
  }

  getCapabilities(): RiotPrototypeCapabilities {
    return {
      platformId: 'riot',
      capabilityType: 'experimental-synthetic-prototype',
      isLiveOperationSupported: false,
      requiresClientShutdown: true,
      sessionStorageType: 'synthetic-file-journal',
      canDetectRunning: true,
      authenticationStatus: 'unknown',
      securityNotice:
        'Operates strictly on synthetic test fixtures. Real Riot authentication session files are never accessed or modified. Authentication status remains unknown.',
    };
  }

  getCurrentState(): RiotPrototypeSwitchState {
    return this.currentState;
  }

  getActiveOperationId(): string | null {
    return this.activeOperationId;
  }

  cancelOperation(operationId: string): boolean {
    if (this.activeOperationId === operationId) {
      this.cancellationRequested = true;
      return true;
    }
    return false;
  }

  async selectProfile(targetProfileId: string): Promise<RiotPrototypeSwitchResult> {
    const startTime = Date.now();
    const operationId = randomUUID();

    // 1. Concurrency Check
    if (this.activeOperationId !== null) {
      throw new RiotConcurrentOperationError();
    }

    this.activeOperationId = operationId;
    this.cancellationRequested = false;
    let previousProfileId: string | null = null;

    try {
      this.transition('validating', { operationId, targetProfileId });
      this.checkCancellation(operationId);

      // 2. Client Running Check
      this.transition('checking-client-status', { operationId });
      if (await this.systemAccess.isRunning()) {
        throw new RiotClientRunningError();
      }
      this.checkCancellation(operationId);

      // 3. Read & Validate Target Fixture
      this.transition('reading-fixtures', { operationId, targetProfileId });
      const fixture = await this.systemAccess.readFixture(targetProfileId);
      if (!fixture) {
        throw new RiotFixtureNotFoundError(targetProfileId);
      }

      const now = this.nowProvider();
      const expiresAt = new Date(fixture.expiresAtIso);
      if (fixture.isRevoked || expiresAt.getTime() <= now.getTime()) {
        throw new RiotSessionExpiredError(targetProfileId);
      }
      this.checkCancellation(operationId);

      // 4. Read Active Simulated Session
      previousProfileId = await this.systemAccess.readActiveSession();

      // 5. Atomic Journaling
      this.transition('journaling', { operationId, previousProfileId, targetProfileId });
      const journal: RiotPrototypeJournal = {
        operationId,
        previousProfileId,
        targetProfileId,
        timestampIso: now.toISOString(),
        pending: true,
      };
      await this.systemAccess.writeJournal(journal);
      this.checkCancellation(operationId);

      // 6. Simulated Session Swap
      this.transition('swapping-simulated-session', { operationId, targetProfileId });
      if (await this.systemAccess.isRunning()) {
        throw new RiotClientRunningError('Riot Client was started while switch was in progress.');
      }
      await this.systemAccess.writeActiveSession(targetProfileId);

      // 7. Verification
      this.transition('verifying', { operationId, targetProfileId });
      const verifiedSession = await this.systemAccess.readActiveSession();
      if (verifiedSession !== targetProfileId) {
        throw new Error(`Session swap verification failed: expected '${targetProfileId}', found '${verifiedSession}'`);
      }

      this.checkCancellation(operationId);

      // 8. Open Client Mock
      await this.systemAccess.openClientMock();

      // Mark journal complete
      await this.systemAccess.writeJournal({ ...journal, pending: false });

      this.transition('completed', { operationId, targetProfileId });

      return {
        success: true,
        operationId,
        targetProfileId,
        previousProfileId,
        activeProfileId: targetProfileId,
        state: 'completed',
        authenticationStatus: 'unknown',
        verificationStatus: 'unverified',
        isSimulated: true,
        warningMessage:
          'Simulated switch completed successfully on synthetic test fixtures. Real authentication is unverified and credentials remain managed solely by Riot Client.',
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isCancelled = err instanceof RiotOperationCancelledError;

      // Handle Rollback if session was swapped or verification was in progress
      const wasSwapped =
        this.currentState === 'swapping-simulated-session' ||
        this.currentState === 'verifying';

      if (wasSwapped) {
        try {
          this.transition('rolled-back', { operationId, previousProfileId });
          await this.systemAccess.writeActiveSession(previousProfileId);
          const currentJournal = await this.systemAccess.readJournal();
          if (currentJournal && currentJournal.operationId === operationId) {
            await this.systemAccess.writeJournal({ ...currentJournal, pending: false });
          }
        } catch {
          // If rollback write fails, journal remains pending for crash recovery
        }
      }

      if (isCancelled) {
        this.transition('cancelled', { operationId });
      } else if (!wasSwapped) {
        this.transition('failed', { operationId, error: errorMessage });
      }

      throw err;
    } finally {
      this.activeOperationId = null;
      this.cancellationRequested = false;
    }
  }

  private checkCancellation(operationId: string): void {
    if (this.cancellationRequested) {
      throw new RiotOperationCancelledError(operationId);
    }
  }

  async recoverInterruptedOperation(): Promise<RiotPrototypeRecoveryResult> {
    if (await this.systemAccess.isRunning()) {
      throw new RiotClientRunningError('Cannot recover interrupted switch while Riot Client is running.');
    }

    const journal = await this.systemAccess.readJournal();
    if (!journal || !journal.pending) {
      return {
        recovered: false,
        restoredProfileId: await this.systemAccess.readActiveSession(),
        message: 'No pending or interrupted operation found in journal.',
      };
    }

    // Rollback active session to previousProfileId recorded in journal
    await this.systemAccess.writeActiveSession(journal.previousProfileId);
    await this.systemAccess.writeJournal({ ...journal, pending: false });

    return {
      recovered: true,
      operationId: journal.operationId,
      restoredProfileId: journal.previousProfileId,
      message: `Interrupted operation '${journal.operationId}' was recovered: simulated session restored to '${journal.previousProfileId}'.`,
    };
  }
}
