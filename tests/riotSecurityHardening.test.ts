import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto, { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  createProductionRiotLiveSwitchingEngine,
  RiotWindowsProcessCoordinator,
  RiotWindowsSessionStorage,
  RiotWindowsSessionVault,
  type SafeStorageLike,
} from '../electron/services/accounts/riotProductionAdapters';
import {
  RiotConcurrentOperationError,
  RiotOperationCancelledError,
  RiotSessionCorruptedError,
  RiotStorageError,
  RiotValidationError,
} from '../electron/services/accounts/riotLiveSwitchingEngine';
import type { RunningProcessEntry } from '../electron/services/tracker/playtimeTrackerEngine';

describe('Phase 11: Riot Live Switching Security Hardening & Adversarial Audits', () => {
  let testRoot: string;
  let vaultDir: string;
  let syntheticRiotDataDir: string;
  let stagingParentDir: string;

  const mockSafeStorage: SafeStorageLike = {
    isEncryptionAvailable: () => true,
    encryptString: (str) => Buffer.from(`MOCK_DPAPI_PROTECTED:${str}`),
    decryptString: (buf) => {
      const raw = buf.toString('utf8');
      if (!raw.startsWith('MOCK_DPAPI_PROTECTED:')) throw new Error('Decryption failed');
      return raw.replace('MOCK_DPAPI_PROTECTED:', '');
    },
  };

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-phase11-security-'));
    vaultDir = path.join(testRoot, 'vault', 'riot');
    syntheticRiotDataDir = path.join(testRoot, 'synthetic-riot-data');
    stagingParentDir = path.join(testRoot, 'staging');

    fs.mkdirSync(vaultDir, { recursive: true });
    fs.mkdirSync(syntheticRiotDataDir, { recursive: true });
    fs.mkdirSync(stagingParentDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function setupSyntheticLiveFiles(puuid = 'puuid-alpha-1234'): void {
    const yamlContent = [
      'client:',
      '  install_id: "test-install-uuid"',
      'riot-login:',
      '  persist:',
      `    sub: "${puuid}"`,
      '    username: "littleimad"',
      '    remember: true',
    ].join('\n');

    fs.writeFileSync(
      path.join(syntheticRiotDataDir, 'RiotGamesPrivateSettings.yaml'),
      yamlContent,
      'utf8'
    );

    const cookiesDir = path.join(syntheticRiotDataDir, 'Cookies');
    fs.mkdirSync(cookiesDir, { recursive: true });
    fs.writeFileSync(
      path.join(cookiesDir, 'Cookies'),
      Buffer.from('SYNTHETIC_SQLITE_COOKIE_CONTENT')
    );
  }

  describe('1. DPAPI Strict Enforcement & Fail-Closed Behavior', () => {
    it('fails closed when DPAPI safeStorage is unavailable in production mode', async () => {
      const unavailableSafeStorage: SafeStorageLike = {
        isEncryptionAvailable: () => false,
        encryptString: () => {
          throw new Error('DPAPI unavailable');
        },
        decryptString: () => {
          throw new Error('DPAPI unavailable');
        },
      };

      const vault = new RiotWindowsSessionVault(vaultDir, {
        safeStorageOverride: unavailableSafeStorage,
        allowInsecureTestCipher: false, // Strict production setting
      });

      // Saving must reject immediately
      await expect(
        vault.saveSession('Melynelas', Buffer.from('TEST_DATA'))
      ).rejects.toThrow(RiotStorageError);
    });

    it('refuses to decrypt an AES-GCM envelope in production mode (allowInsecureTestCipher = false)', async () => {
      // Create an AES-GCM envelope using test mode
      const testVault = new RiotWindowsSessionVault(vaultDir, {
        safeStorageOverride: {
          isEncryptionAvailable: () => false,
          encryptString: () => {
            throw new Error();
          },
          decryptString: () => {
            throw new Error();
          },
        },
        allowInsecureTestCipher: true,
      });
      await testVault.saveSession('littleimad', Buffer.from('TEST_PAYLOAD'));

      // Now open with strict production vault
      const prodVault = new RiotWindowsSessionVault(vaultDir, {
        safeStorageOverride: mockSafeStorage,
        allowInsecureTestCipher: false, // Production mode strictly rejects non-DPAPI
      });

      await expect(prodVault.loadSession('littleimad')).rejects.toThrow(
        RiotSessionCorruptedError
      );
    });
  });

  describe('2. Multi-File Swap Staging, External Drift & Rollback Persistence', () => {
    it('detects external file modification (state drift) and aborts before swap begins', async () => {
      setupSyntheticLiveFiles('puuid-original-1111');

      const storage = new RiotWindowsSessionStorage(
        syntheticRiotDataDir,
        stagingParentDir
      );

      // Record baseline state signature
      const initialSignature = await storage.computeLiveStateSignature();
      expect(initialSignature).not.toBeNull();

      // Simulate external drift: user or launcher modifies PrivateSettings
      fs.appendFileSync(
        path.join(syntheticRiotDataDir, 'RiotGamesPrivateSettings.yaml'),
        '\n# External state modification'
      );

      // Prepare target package
      const targetPkg = await storage.exportLiveSession();

      // Apply with original pre-state signature -> must abort due to drift
      await expect(
        storage.applySessionAtomically(targetPkg!, {
          expectedPreStateSha256: initialSignature,
        })
      ).rejects.toThrow(RiotStorageError);
    });

    it('recovers from an interrupted crash where backup files remained on disk (recoverInterruptedSwap)', async () => {
      setupSyntheticLiveFiles('puuid-initial-state');

      const storage = new RiotWindowsSessionStorage(
        syntheticRiotDataDir,
        stagingParentDir
      );

      // Simulate a crashed swap operation:
      // Live directory was modified/corrupted midway
      fs.writeFileSync(
        path.join(syntheticRiotDataDir, 'RiotGamesPrivateSettings.yaml'),
        'CORRUPTED_MIDWAY_STATE'
      );

      // And an uncommitted backup directory was left on disk
      const crashOpId = randomUUID();
      const backupDir = path.join(stagingParentDir, `.maswitch_backup_${crashOpId}`);
      fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(
        path.join(backupDir, 'RiotGamesPrivateSettings.yaml'),
        'client:\n  install_id: "uuid"\nriot-login:\n  persist:\n    sub: "puuid-initial-state"\n    username: "littleimad"\n'
      );
      fs.mkdirSync(path.join(backupDir, 'Cookies'), { recursive: true });
      fs.writeFileSync(
        path.join(backupDir, 'Cookies', 'Cookies'),
        Buffer.from('RESTORED_COOKIE_DATA')
      );

      // Startup recovery discovers the abandoned backup
      const recovered = await storage.recoverInterruptedSwap();
      expect(recovered).toBe(true);

      // Live directory is restored to initial state
      const restoredId = await storage.readCurrentActiveSessionId();
      expect(restoredId).toBe('puuid-initial-state');

      // Backup and staging artifacts are cleaned up
      const remainingBackups = fs
        .readdirSync(stagingParentDir)
        .filter((f) => f.startsWith('.maswitch_'));
      expect(remainingBackups).toHaveLength(0);
    });

    it('cleans dangling staging artifacts without impacting live files', async () => {
      setupSyntheticLiveFiles('puuid-clean-test');

      const storage = new RiotWindowsSessionStorage(
        syntheticRiotDataDir,
        stagingParentDir
      );

      // Create abandoned staging directory
      const staleStage = path.join(stagingParentDir, `.maswitch_stage_${randomUUID()}`);
      fs.mkdirSync(staleStage, { recursive: true });
      fs.writeFileSync(path.join(staleStage, 'stale.txt'), 'stale');

      await storage.cleanDanglingArtifacts();

      expect(fs.existsSync(staleStage)).toBe(false);
      expect(await storage.readCurrentActiveSessionId()).toBe('puuid-clean-test');
    });
  });

  describe('3. Adversarial Path Traversal & Injection Attacks', () => {
    it('rejects path traversal in account IDs on vault operations', async () => {
      const vault = new RiotWindowsSessionVault(vaultDir, {
        safeStorageOverride: mockSafeStorage,
      });

      const maliciousIds = [
        '../System32',
        '../../boot.ini',
        'sub/dir',
        'foo\\bar',
        'account:id',
        'acct;rm -rf',
        'null\0byte',
      ];

      for (const badId of maliciousIds) {
        await expect(
          vault.saveSession(badId, Buffer.from('payload'))
        ).rejects.toThrow(RiotValidationError);
        await expect(vault.loadSession(badId)).rejects.toThrow(RiotValidationError);
        await expect(vault.deleteSession(badId)).rejects.toThrow(RiotValidationError);
      }
    });

    it('rejects malicious archive packages targeting paths outside allowed boundaries', async () => {
      const storage = new RiotWindowsSessionStorage(
        syntheticRiotDataDir,
        stagingParentDir
      );

      const maliciousPaths = [
        '../../../Windows/System32/cmd.exe',
        'C:/Windows/win.ini',
        'RiotClientSettings.yaml', // Outside allowed boundary (Cookies, Sessions, PrivateSettings)
        'System32/drivers/etc/hosts',
        '/etc/passwd',
      ];

      for (const badPath of maliciousPaths) {
        const pkg = {
          magic: 'MSRIOT_PKG_V1',
          exportedAtIso: new Date().toISOString(),
          activeAccountId: 'evil',
          files: [
            {
              relativePath: badPath,
              dataBase64: Buffer.from('data').toString('base64'),
              sha256: crypto.createHash('sha256').update('data').digest('hex'),
              byteSize: 4,
            },
          ],
          packageSha256: 'hash',
        };

        const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(pkg)));
        await expect(storage.applySessionAtomically(compressed)).rejects.toThrow(
          RiotValidationError
        );
      }
    });
  });

  describe('4. Corruption & Tampering Handling', () => {
    it('rejects corrupt gzip archives with RiotSessionCorruptedError', async () => {
      const storage = new RiotWindowsSessionStorage(
        syntheticRiotDataDir,
        stagingParentDir
      );

      const corruptBuffer = Buffer.from('NOT_A_VALID_GZIP_ARCHIVE');
      await expect(storage.applySessionAtomically(corruptBuffer)).rejects.toThrow(
        RiotSessionCorruptedError
      );
    });

    it('rejects valid gzip containing invalid JSON structure', async () => {
      const storage = new RiotWindowsSessionStorage(
        syntheticRiotDataDir,
        stagingParentDir
      );

      const invalidJsonGzip = zlib.gzipSync(Buffer.from('{ broken json: true'));
      await expect(storage.applySessionAtomically(invalidJsonGzip)).rejects.toThrow(
        RiotSessionCorruptedError
      );
    });

    it('rejects archive where file checksum does not match payload', async () => {
      const storage = new RiotWindowsSessionStorage(
        syntheticRiotDataDir,
        stagingParentDir
      );

      const tamperedPkg = {
        magic: 'MSRIOT_PKG_V1',
        exportedAtIso: new Date().toISOString(),
        activeAccountId: 'tampered',
        files: [
          {
            relativePath: 'RiotGamesPrivateSettings.yaml',
            dataBase64: Buffer.from('ACTUAL_DATA').toString('base64'),
            sha256: '0000000000000000000000000000000000000000000000000000000000000000', // mismatched
            byteSize: 11,
          },
        ],
        packageSha256: 'hash',
      };

      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(tamperedPkg)));
      await expect(storage.applySessionAtomically(compressed)).rejects.toThrow(
        RiotSessionCorruptedError
      );
    });
  });

  describe('5. Concurrency Protection & Cooperative Cancellation', () => {
    it('rejects concurrent switchAccount calls while one is in flight', async () => {
      setupSyntheticLiveFiles('puuid-concurrent-test');

      let unblock = false;
      const slowProcessLister = vi.fn(async (): Promise<RunningProcessEntry[]> => {
        while (!unblock) {
          await new Promise((r) => setTimeout(r, 20));
        }
        return [];
      });

      const { engine, vault, storage } = createProductionRiotLiveSwitchingEngine({
        userDataDir: testRoot,
        riotLiveSwitchingEnabled: true,
        riotDataDir: syntheticRiotDataDir,
        safeStorageOverride: mockSafeStorage,
        processLister: slowProcessLister,
      });

      const targetPkg = await storage.exportLiveSession();
      await vault.saveSession('Melynelas', targetPkg!);

      // Launch first switch (it will pause during process check)
      const op1Promise = engine.switchAccount('Melynelas');

      // Wait 50ms to ensure op1 has acquired the activeOperationId lock
      await new Promise((r) => setTimeout(r, 50));

      // Attempt second switch concurrently -> must reject immediately with RiotConcurrentOperationError
      await expect(engine.switchAccount('Melynelas')).rejects.toThrow(
        RiotConcurrentOperationError
      );

      // Unblock first switch
      unblock = true;
      const result1 = await op1Promise;
      expect(result1.success).toBe(true);
    });

    it('cancels operation cooperatively when cancelOperation is requested before swap', async () => {
      setupSyntheticLiveFiles('puuid-cancel-test');

      const { engine, vault, storage } = createProductionRiotLiveSwitchingEngine({
        userDataDir: testRoot,
        riotLiveSwitchingEnabled: true,
        riotDataDir: syntheticRiotDataDir,
        safeStorageOverride: mockSafeStorage,
        processLister: async () => [],
      });

      const targetPkg = await storage.exportLiveSession();
      await vault.saveSession('Melynelas', targetPkg!);

      // Hook listener to cancel during preflight
      engine.onStateChange((state) => {
        if (state === 'checking-processes') {
          const opId = engine.getActiveOperationId();
          if (opId) engine.cancelOperation(opId);
        }
      });

      await expect(engine.switchAccount('Melynelas')).rejects.toThrow(
        RiotOperationCancelledError
      );
      expect(engine.getCurrentState()).toBe('cancelled');
    });
  });

  describe('6. Process Coordinator Audit: Taskkill & System Tray Behavior', () => {
    it('fails closed and times out when Riot Client ignores WM_CLOSE (e.g. tray minimization)', async () => {
      // Simulate Riot Client continuously running (ignoring WM_CLOSE)
      const mockLister = vi.fn(async (): Promise<RunningProcessEntry[]> => [
        { imageNameLower: 'riotclientservices.exe', pid: 100 },
      ]);

      const mockExecutor = vi.fn(async (cmd: string, args: string[]) => {
        // Verify taskkill was invoked WITHOUT /F
        expect(cmd).toBe('taskkill.exe');
        expect(args).not.toContain('/F');
        return { stdout: 'Sent termination signal', stderr: '' };
      });

      const coordinator = new RiotWindowsProcessCoordinator({
        processLister: mockLister,
        commandExecutor: mockExecutor,
        graceTimeoutMs: 250, // Short timeout for test
      });

      const shutdownSuccess = await coordinator.requestGracefulShutdown();
      // Must fail closed because client remained alive
      expect(shutdownSuccess).toBe(false);
    });

    it('strictly refuses shutdown when game is running without executing taskkill', async () => {
      const mockLister = vi.fn(async (): Promise<RunningProcessEntry[]> => [
        { imageNameLower: 'leagueclient.exe', pid: 200 },
        { imageNameLower: 'riotclientservices.exe', pid: 100 },
      ]);
      const mockExecutor = vi.fn(async () => ({ stdout: '', stderr: '' }));

      const coordinator = new RiotWindowsProcessCoordinator({
        processLister: mockLister,
        commandExecutor: mockExecutor,
      });

      const shutdownSuccess = await coordinator.requestGracefulShutdown();
      expect(shutdownSuccess).toBe(false);
      expect(mockExecutor).not.toHaveBeenCalled();
    });
  });

  describe('7. DPAPI Encrypted Pre-Switch Backup (No Plaintext Zip)', () => {
    it('creates an encrypted backup file in the vault without plaintext zip files', async () => {
      setupSyntheticLiveFiles('puuid-backup-test');

      const storage = new RiotWindowsSessionStorage(
        syntheticRiotDataDir,
        stagingParentDir
      );
      const vault = new RiotWindowsSessionVault(vaultDir, {
        safeStorageOverride: mockSafeStorage,
      });

      const sessionData = await storage.exportLiveSession();
      expect(sessionData).not.toBeNull();

      const backupFilePath = await vault.createEncryptedBackup(
        'pre_switch_backup',
        sessionData!
      );

      expect(fs.existsSync(backupFilePath)).toBe(true);
      expect(backupFilePath.endsWith('.msriot.enc')).toBe(true);

      // Verify file is encrypted and contains no plaintext tokens
      const rawContent = fs.readFileSync(backupFilePath, 'utf8');
      expect(rawContent).not.toContain('SYNTHETIC_SQLITE_COOKIE_CONTENT');
      expect(rawContent).toContain('"encryptionScheme": "dpapi"');

      // Verify it can be loaded back via DPAPI
      const decrypted = await vault.loadSessionFromFile(backupFilePath, 'pre_switch_backup');
      expect(decrypted).not.toBeNull();
      expect(decrypted?.length).toBe(sessionData!.length);
    });
  });

  describe('8. Journal Sanitization & Authentication Truthfulness', () => {
    it('verifies journal.json contains zero token, cookie, or credential strings', async () => {
      setupSyntheticLiveFiles('puuid-journal-test');

      const { engine, vault, storage } = createProductionRiotLiveSwitchingEngine({
        userDataDir: testRoot,
        riotLiveSwitchingEnabled: true,
        riotDataDir: syntheticRiotDataDir,
        safeStorageOverride: mockSafeStorage,
        processLister: async () => [],
      });

      const targetPkg = await storage.exportLiveSession();
      await vault.saveSession('Melynelas', targetPkg!);

      const result = await engine.switchAccount('Melynelas');
      expect(result.success).toBe(true);
      expect(result.authenticationStatus).toBe('unknown');
      expect(result.verificationStatus).toBe('unverified');

      const journalFile = path.join(vaultDir, 'journal.json');
      expect(fs.existsSync(journalFile)).toBe(true);

      const journalRaw = fs.readFileSync(journalFile, 'utf8');
      // Must not contain any cookie, auth, or private setting keywords
      expect(journalRaw).not.toContain('COOKIE');
      expect(journalRaw).not.toContain('SYNTHETIC');
      expect(journalRaw).not.toContain('ssid');
      expect(journalRaw).not.toContain('tdid');
      expect(journalRaw).not.toContain('payloadBase64');
    });
  });
});
