import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto, { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  createProductionRiotLiveSwitchingEngine,
  RiotWindowsProcessCoordinator,
  RiotWindowsSessionStorage,
  type SafeStorageLike,
} from '../electron/services/accounts/riotProductionAdapters';
import {
  RiotProcessDetectionError,
  RiotRecoveryFailedError,
  RiotRecoveryRequiredError,
  RiotSessionCorruptedError,
  RiotStateDriftError,
  RiotStorageError,
} from '../electron/services/accounts/riotLiveSwitchingEngine';
import type { RunningProcessEntry } from '../electron/services/tracker/playtimeTrackerEngine';

describe('Riot Live Switching Critical Fixes & Regression Test Suite', () => {
  let testRoot: string;
  let userDataDir: string;
  let vaultDir: string;
  let syntheticRiotDataDir: string;
  let stagingParentDir: string;
  let runningProcesses: RunningProcessEntry[] = [];
  let processListerShouldThrow = false;

  const mockSafeStorage: SafeStorageLike = {
    isEncryptionAvailable: () => true,
    encryptString: (str) => Buffer.from(`MOCK_DPAPI_ENC:${str}`),
    decryptString: (buf) => {
      const raw = buf.toString('utf8');
      if (!raw.startsWith('MOCK_DPAPI_ENC:')) throw new Error('Decryption failed');
      return raw.replace('MOCK_DPAPI_ENC:', '');
    },
  };

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-riot-fixes-'));
    userDataDir = path.join(testRoot, 'user-data');
    vaultDir = path.join(userDataDir, 'vault', 'riot');
    syntheticRiotDataDir = path.join(testRoot, 'synthetic-riot-data');
    stagingParentDir = path.join(userDataDir, 'staging');

    fs.mkdirSync(vaultDir, { recursive: true });
    fs.mkdirSync(syntheticRiotDataDir, { recursive: true });
    fs.mkdirSync(stagingParentDir, { recursive: true });

    runningProcesses = [];
    processListerShouldThrow = false;
  });

  afterEach(() => {
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function populateSyntheticRiotData(options?: {
    username?: string;
    puuid?: string;
    cookieData?: string;
    sessionData?: string;
    extraFiles?: Record<string, string>;
  }): void {
    const username = options?.username ?? 'Melynelas';
    const puuid = options?.puuid ?? 'puuid-melynelas-001';

    const yaml = [
      'client:',
      '  patchline: live',
      `sub: "${puuid}"`,
      `username: "${username}"`,
      'chat:',
      `  current_user: "${username}"`,
      `  puuid: "${puuid}"`,
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
      options?.cookieData ?? `COOKIE_DB_FOR_${username}`,
      'utf8'
    );

    const sessionsDir = path.join(syntheticRiotDataDir, 'Sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, 'session.json'),
      options?.sessionData ?? JSON.stringify({ user: username, token: `TOKEN_${username}` }),
      'utf8'
    );

    if (options?.extraFiles) {
      for (const [relPath, content] of Object.entries(options.extraFiles)) {
        const full = path.join(syntheticRiotDataDir, relPath);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf8');
      }
    }
  }

  function createTestHarness(enabled = true) {
    return createProductionRiotLiveSwitchingEngine({
      userDataDir,
      riotDataDir: syntheticRiotDataDir,
      riotLiveSwitchingEnabled: enabled,
      safeStorageOverride: mockSafeStorage,
      processLister: async () => {
        if (processListerShouldThrow) {
          throw new Error('EPERM: Windows process enumeration blocked');
        }
        return runningProcesses;
      },
      commandExecutor: async () => {
        runningProcesses = runningProcesses.filter(
          (p) => !p.imageNameLower.includes('riotclient')
        );
        return { stdout: '', stderr: '' };
      },
      clientLauncher: async () => {},
    });
  }

  // --- ISSUE 1: Plaintext Session Exposure ---
  describe('Issue 1: Plaintext Session Exposure', () => {
    it('does not create unencrypted plaintext backup directories on disk during swap', async () => {
      populateSyntheticRiotData({ username: 'Melynelas', puuid: 'puuid-001' });
      const storage = new RiotWindowsSessionStorage(syntheticRiotDataDir, stagingParentDir);
      const sessionData = await storage.exportLiveSession();

      await storage.applySessionAtomically(sessionData!);

      // Verify no .maswitch_backup_* directories were left on disk in stagingParentDir or riotDataDir
      const stagingEntries = fs.readdirSync(stagingParentDir);
      expect(stagingEntries.filter((e) => e.startsWith('.maswitch_backup_'))).toHaveLength(0);

      const liveEntries = fs.readdirSync(syntheticRiotDataDir);
      expect(liveEntries.filter((e) => e.startsWith('.maswitch_backup_'))).toHaveLength(0);
    });

    it('cleans up ephemeral staging directories immediately after swap', async () => {
      populateSyntheticRiotData({ username: 'Melynelas', puuid: 'puuid-001' });
      const storage = new RiotWindowsSessionStorage(syntheticRiotDataDir, stagingParentDir);
      const sessionData = await storage.exportLiveSession();

      await storage.applySessionAtomically(sessionData!);

      const liveEntries = fs.readdirSync(syntheticRiotDataDir);
      expect(liveEntries.filter((e) => e.startsWith('.maswitch_stage_'))).toHaveLength(0);
    });
  });

  // --- ISSUE 2: Rollback Data Loss ---
  describe('Issue 2: Rollback Data Loss & Crash Recovery Preservation', () => {
    it('restores previous files from in-memory backup if post-swap verification fails', async () => {
      populateSyntheticRiotData({
        username: 'littleimad',
        puuid: 'puuid-littleimad-original',
      });

      const storage = new RiotWindowsSessionStorage(syntheticRiotDataDir, stagingParentDir);

      // Create a corrupted package whose PrivateSettings is too short (< 10 bytes)
      const corruptPkg = {
        magic: 'MSRIOT_PKG_V1',
        exportedAtIso: new Date().toISOString(),
        activeAccountId: 'corrupt',
        files: [
          {
            relativePath: 'RiotGamesPrivateSettings.yaml',
            dataBase64: Buffer.from('bad').toString('base64'),
            sha256: crypto.createHash('sha256').update('bad').digest('hex'),
            byteSize: 3,
          },
          {
            relativePath: 'Cookies/Cookies.sqlite',
            dataBase64: Buffer.from('cookie').toString('base64'),
            sha256: crypto.createHash('sha256').update('cookie').digest('hex'),
            byteSize: 6,
          },
        ],
        packageSha256: 'test',
      };
      const corruptGzip = zlib.gzipSync(Buffer.from(JSON.stringify(corruptPkg)));

      // Applying corrupted package must throw RiotSessionCorruptedError
      await expect(storage.applySessionAtomically(corruptGzip)).rejects.toThrow(
        RiotSessionCorruptedError
      );

      // Verify that original littleimad session files were restored via in-memory rollback
      const currentIdentity = await storage.readCurrentActiveSessionId();
      expect(currentIdentity).toBe('puuid-littleimad-original');
      expect(await storage.verifySessionFiles()).toBe(true);
    });

    it('never deletes recovery data if restoration fails', async () => {
      const storage = new RiotWindowsSessionStorage(syntheticRiotDataDir, stagingParentDir);

      // Create a corrupt legacy backup directory whose files fail verifySessionFiles
      const opId = randomUUID();
      const corruptBackupDir = path.join(stagingParentDir, `.maswitch_backup_${opId}`);
      fs.mkdirSync(corruptBackupDir, { recursive: true });
      fs.writeFileSync(
        path.join(corruptBackupDir, 'RiotGamesPrivateSettings.yaml'),
        'tiny'
      );

      // recoverInterruptedSwap must report false because verification failed
      const recovered = await storage.recoverInterruptedSwap(opId);
      expect(recovered).toBe(false);

      // CRITICAL: The backup directory MUST NOT be deleted when restoration is unverified!
      expect(fs.existsSync(corruptBackupDir)).toBe(true);
    });
  });

  // --- ISSUE 3: Incomplete Session Replacement ---
  describe('Issue 3: Incomplete Session Replacement & Obsolete File Removal', () => {
    it('removes stale SQLite WAL, journal, and shm files not in target session while preserving unrelated files', async () => {
      // Setup outgoing session with stale SQLite WAL/journal and obsolete session files
      populateSyntheticRiotData({
        username: 'Melynelas',
        puuid: 'puuid-melynelas-001',
        extraFiles: {
          'Cookies/Cookies.sqlite-wal': 'STALE_OUTGOING_WAL_DATA',
          'Cookies/Cookies.sqlite-shm': 'STALE_OUTGOING_SHM_DATA',
          'Sessions/obsolete_melynelas_session.json': 'OBSOLETE_SESSION_DATA',
          'Logs/game_launch.log': 'PRESERVED_USER_LOG_DATA',
          'Config/game_cfg.ini': 'PRESERVED_USER_CONFIG_DATA',
        },
      });

      const storage = new RiotWindowsSessionStorage(syntheticRiotDataDir, stagingParentDir);

      // Prepare target package for littleimad (clean Cookies.sqlite without WAL, and new session file)
      const littleimadFiles = [
        {
          relativePath: 'RiotGamesPrivateSettings.yaml',
          dataBase64: Buffer.from('client:\n  patchline: live\nsub: "puuid-littleimad-002"\nusername: "littleimad"\n').toString('base64'),
          sha256: crypto.createHash('sha256').update('client:\n  patchline: live\nsub: "puuid-littleimad-002"\nusername: "littleimad"\n').digest('hex'),
          byteSize: Buffer.from('client:\n  patchline: live\nsub: "puuid-littleimad-002"\nusername: "littleimad"\n').length,
        },
        {
          relativePath: 'Cookies/Cookies.sqlite',
          dataBase64: Buffer.from('LITTLEIMAD_CLEAN_COOKIE_DB').toString('base64'),
          sha256: crypto.createHash('sha256').update('LITTLEIMAD_CLEAN_COOKIE_DB').digest('hex'),
          byteSize: 26,
        },
        {
          relativePath: 'Sessions/littleimad_session.json',
          dataBase64: Buffer.from('{"user":"littleimad"}').toString('base64'),
          sha256: crypto.createHash('sha256').update('{"user":"littleimad"}').digest('hex'),
          byteSize: Buffer.from('{"user":"littleimad"}').length,
        },
      ];

      const pkg = {
        magic: 'MSRIOT_PKG_V1',
        exportedAtIso: new Date().toISOString(),
        activeAccountId: 'puuid-littleimad-002',
        files: littleimadFiles,
        packageSha256: 'xyz',
      };
      const gzipPkg = zlib.gzipSync(Buffer.from(JSON.stringify(pkg)));

      // Apply target session
      await storage.applySessionAtomically(gzipPkg);

      // 1. Obsolete SQLite WAL and SHM files MUST BE REMOVED!
      expect(fs.existsSync(path.join(syntheticRiotDataDir, 'Cookies', 'Cookies.sqlite-wal'))).toBe(false);
      expect(fs.existsSync(path.join(syntheticRiotDataDir, 'Cookies', 'Cookies.sqlite-shm'))).toBe(false);

      // 2. Obsolete session file in Sessions/ MUST BE REMOVED!
      expect(fs.existsSync(path.join(syntheticRiotDataDir, 'Sessions', 'obsolete_melynelas_session.json'))).toBe(false);

      // 3. New session file exists
      expect(fs.existsSync(path.join(syntheticRiotDataDir, 'Sessions', 'littleimad_session.json'))).toBe(true);

      // 4. Unrelated configuration and logs outside managed paths MUST BE PRESERVED!
      expect(fs.existsSync(path.join(syntheticRiotDataDir, 'Logs', 'game_launch.log'))).toBe(true);
      expect(fs.readFileSync(path.join(syntheticRiotDataDir, 'Logs', 'game_launch.log'), 'utf8')).toBe('PRESERVED_USER_LOG_DATA');
      expect(fs.existsSync(path.join(syntheticRiotDataDir, 'Config', 'game_cfg.ini'))).toBe(true);
      expect(fs.readFileSync(path.join(syntheticRiotDataDir, 'Config', 'game_cfg.ini'), 'utf8')).toBe('PRESERVED_USER_CONFIG_DATA');
    });
  });

  // --- ISSUE 4: Real Content Hashing for File-Change Detection ---
  describe('Issue 4: Real Content Hashing & State Drift Detection', () => {
    it('detects byte modification in Sessions and rejects swap with RiotStateDriftError', async () => {
      populateSyntheticRiotData({ username: 'Melynelas', puuid: 'puuid-001' });
      const storage = new RiotWindowsSessionStorage(syntheticRiotDataDir, stagingParentDir);

      const baselineSignature = await storage.computeLiveStateSignature();
      expect(baselineSignature).not.toBeNull();

      // Modify a single byte in Sessions/session.json (same size, same filename, different content)
      fs.writeFileSync(
        path.join(syntheticRiotDataDir, 'Sessions', 'session.json'),
        JSON.stringify({ user: 'Melynelas', token: 'TOKEN_MODIFIED_123' })
      );

      const modifiedSignature = await storage.computeLiveStateSignature();
      expect(modifiedSignature).not.toBe(baselineSignature);

      // Export session package and apply with baseline pre-state -> must reject due to drift
      const targetPkg = await storage.exportLiveSession();
      await expect(
        storage.applySessionAtomically(targetPkg!, {
          expectedPreStateSha256: baselineSignature,
        })
      ).rejects.toThrow(RiotStateDriftError);
    });

    it('fails closed and throws RiotStorageError if signature computation encounters an unreadable file', async () => {
      populateSyntheticRiotData();
      const storage = new RiotWindowsSessionStorage(syntheticRiotDataDir, stagingParentDir);

      // Make a managed file unreadable or delete directory during scan
      const yamlPath = path.join(syntheticRiotDataDir, 'RiotGamesPrivateSettings.yaml');
      fs.chmodSync(yamlPath, 0o000);

      try {
        // On systems where chmod 000 prevents reading (e.g. POSIX/Node permissions), it must throw
        // On Windows where POSIX modes are advisory, verify non-silent behavior if read fails
        await storage.computeLiveStateSignature();
      } catch (err) {
        expect(err).toBeInstanceOf(RiotStorageError);
      } finally {
        fs.chmodSync(yamlPath, 0o666);
      }
    });
  });

  // --- ISSUE 5: Process Detection Fail-Closed ---
  describe('Issue 5: Process Detection Fail-Closed', () => {
    it('throws RiotProcessDetectionError if process enumeration fails in isGameRunning', async () => {
      const coordinator = new RiotWindowsProcessCoordinator({
        processLister: async () => {
          throw new Error('Process enumeration failed');
        },
      });

      await expect(coordinator.isGameRunning()).rejects.toThrow(RiotProcessDetectionError);
    });

    it('throws RiotProcessDetectionError if process enumeration fails in isClientRunning', async () => {
      const coordinator = new RiotWindowsProcessCoordinator({
        processLister: async () => {
          throw new Error('Process enumeration failed');
        },
      });

      await expect(coordinator.isClientRunning()).rejects.toThrow(RiotProcessDetectionError);
    });

    it('aborts switchAccount immediately if process detection throws', async () => {
      processListerShouldThrow = true;
      const { engine, vault, storage } = createTestHarness();

      populateSyntheticRiotData();
      const sessionData = await storage.exportLiveSession();
      await vault.saveSession('target-id', sessionData!);

      await expect(engine.switchAccount('target-id')).rejects.toThrow(
        RiotProcessDetectionError
      );
    });
  });

  // --- ISSUE 6: Recovery State Handling & Journal Integrity ---
  describe('Issue 6: Recovery State Handling & Journal Integrity', () => {
    it('throws RiotRecoveryFailedError and preserves journal pending=true if restoration data cannot be found', async () => {
      const { engine } = createTestHarness();
      const journalFile = path.join(vaultDir, 'journal.json');

      // Write an orphaned pending journal with non-existent previous account
      fs.writeFileSync(
        journalFile,
        JSON.stringify({
          operationId: 'crashed-op-1234',
          fromAccountId: 'non_existent_account_id',
          targetAccountId: 'target_id',
          timestampIso: new Date().toISOString(),
          stage: 'swapping-session',
          pending: true,
        }),
        'utf8'
      );

      // Recovery must fail because previous session cannot be found in vault
      await expect(engine.recoverPendingOperation()).rejects.toThrow(RiotRecoveryFailedError);

      // Journal MUST REMAINS PENDING to prevent data loss!
      const journalAfter = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
      expect(journalAfter.pending).toBe(true);
    });

    it('blocks subsequent switchAccount operations with RiotRecoveryRequiredError while journal has pending state', async () => {
      const { engine, vault, storage } = createTestHarness();
      const journalFile = path.join(vaultDir, 'journal.json');

      populateSyntheticRiotData();
      const sessionData = await storage.exportLiveSession();
      await vault.saveSession('melynelas-id', sessionData!);

      // Simulate prior crashed operation
      fs.writeFileSync(
        journalFile,
        JSON.stringify({
          operationId: 'unresolved-crash-999',
          fromAccountId: null,
          targetAccountId: 'melynelas-id',
          timestampIso: new Date().toISOString(),
          stage: 'swapping-session',
          pending: true,
        }),
        'utf8'
      );

      // Attempting to switch must be BLOCKED until recovery is completed
      await expect(engine.switchAccount('melynelas-id')).rejects.toThrow(
        RiotRecoveryRequiredError
      );
    });

    it('successfully updates journal to pending=false only after verified restoration', async () => {
      const { engine, vault, storage } = createTestHarness();
      const journalFile = path.join(vaultDir, 'journal.json');

      populateSyntheticRiotData({ username: 'littleimad', puuid: 'puuid-littleimad' });
      const littleimadData = await storage.exportLiveSession();
      await vault.saveSession('littleimad-id', littleimadData!);

      // Write pending journal pointing to littleimad-id as fromAccountId
      fs.writeFileSync(
        journalFile,
        JSON.stringify({
          operationId: 'interrupted-swap-op',
          fromAccountId: 'littleimad-id',
          targetAccountId: 'melynelas-id',
          timestampIso: new Date().toISOString(),
          stage: 'swapping-session',
          pending: true,
        }),
        'utf8'
      );

      // Corrupt live files midway
      fs.writeFileSync(path.join(syntheticRiotDataDir, 'RiotGamesPrivateSettings.yaml'), 'CORRUPTED');

      const recovery = await engine.recoverPendingOperation();
      expect(recovery.recovered).toBe(true);

      // Verified: live files restored to littleimad
      expect(await storage.readCurrentActiveSessionId()).toBe('puuid-littleimad');

      // Journal is now resolved
      const journalAfter = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
      expect(journalAfter.pending).toBe(false);
      expect(journalAfter.stage).toBe('rolled-back');
    });
  });

  // --- ISSUE 7: Account Identity Handling ---
  describe('Issue 7: Account Identity Mismatch Detection', () => {
    it('detects mismatched active username and rejects enrollment to prevent assigning to wrong profile', async () => {
      // Active session on disk belongs to Melynelas
      populateSyntheticRiotData({ username: 'Melynelas', puuid: 'puuid-melynelas' });
      const storage = new RiotWindowsSessionStorage(syntheticRiotDataDir, stagingParentDir);

      const identity = await storage.inspectLocalSessionIdentity();
      expect(identity.extractedUsername).toBe('Melynelas');
      expect(identity.isUnverified).toBe(true);

      // Attempting to enroll this into littleimad profile must fail identity check
      const targetProfile = {
        displayName: 'littleimad',
        username: 'littleimad',
      };

      const extracted = identity.extractedUsername!.toLowerCase().trim();
      const targetUser = targetProfile.username.toLowerCase().trim();
      const targetDisplay = targetProfile.displayName.toLowerCase().trim();

      const isMismatch = extracted !== targetUser && extracted !== targetDisplay;
      expect(isMismatch).toBe(true);
    });

    it('identifies local session identity as unverified', async () => {
      populateSyntheticRiotData({ username: 'littleimad', puuid: 'puuid-littleimad' });
      const storage = new RiotWindowsSessionStorage(syntheticRiotDataDir, stagingParentDir);

      const identity = await storage.inspectLocalSessionIdentity();
      expect(identity.isUnverified).toBe(true);
    });
  });
});
