import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto, { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  createProductionRiotLiveSwitchingEngine,
  isSymlinkOrReparsePoint,
  RiotWindowsSessionStorage,
  validateArchiveRelativePath,
  type SafeStorageLike,
} from '../electron/services/accounts/riotProductionAdapters';
import {
  RiotConcurrentOperationError,
  RiotRecoveryFailedError,
  RiotRecoveryRequiredError,
  RiotSessionCorruptedError,
  RiotStorageError,
  RiotValidationError,
} from '../electron/services/accounts/riotLiveSwitchingEngine';
import type { RunningProcessEntry } from '../electron/services/tracker/playtimeTrackerEngine';

describe('Riot Switching Final Reliability & Regression Test Suite', () => {
  let testRoot: string;
  let userDataDir: string;
  let vaultDir: string;
  let syntheticRiotDataDir: string;
  let stagingParentDir: string;
  let runningProcesses: RunningProcessEntry[] = [];

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
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-riot-reliability-'));
    userDataDir = path.join(testRoot, 'user-data');
    vaultDir = path.join(userDataDir, 'vault', 'riot');
    syntheticRiotDataDir = path.join(testRoot, 'synthetic-riot-data');
    stagingParentDir = path.join(userDataDir, 'staging');

    fs.mkdirSync(vaultDir, { recursive: true });
    fs.mkdirSync(syntheticRiotDataDir, { recursive: true });
    fs.mkdirSync(stagingParentDir, { recursive: true });

    runningProcesses = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    sessionFiles?: Record<string, string>;
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

    if (options?.sessionFiles) {
      const sessionsDir = path.join(syntheticRiotDataDir, 'Sessions');
      fs.mkdirSync(sessionsDir, { recursive: true });
      for (const [filename, content] of Object.entries(options.sessionFiles)) {
        fs.writeFileSync(path.join(sessionsDir, filename), content, 'utf8');
      }
    }
  }

  function createTestHarness(enabled = true) {
    return createProductionRiotLiveSwitchingEngine({
      userDataDir,
      riotDataDir: syntheticRiotDataDir,
      riotLiveSwitchingEnabled: enabled,
      safeStorageOverride: mockSafeStorage,
      processLister: async () => runningProcesses,
      commandExecutor: async () => {
        runningProcesses = runningProcesses.filter(
          (p) => !p.imageNameLower.includes('riotclient')
        );
        return { stdout: '', stderr: '' };
      },
      clientLauncher: async () => {},
    });
  }

  // 1. Mid-swap process crash
  it('recovers safely from a mid-swap process crash via recoverPendingOperation', async () => {
    populateSyntheticRiotData({
      username: 'Melynelas',
      puuid: 'puuid-melynelas-original',
      sessionFiles: { 'melynelas_token.json': '{"token":"12345"}' },
    });

    const { engine, vault, storage } = createTestHarness(true);

    // Export original session and save an encrypted backup in vault
    const originalPkg = await storage.exportLiveSession();
    expect(originalPkg).not.toBeNull();
    const backupPath = await vault.createEncryptedBackup('recovery_crash_op', originalPkg!);

    // Corrupt the live directory simulating a crash mid-swap (stale partial write)
    fs.writeFileSync(
      path.join(syntheticRiotDataDir, 'RiotGamesPrivateSettings.yaml'),
      'partial broken yaml'
    );
    const sessionsDir = path.join(syntheticRiotDataDir, 'Sessions');
    fs.writeFileSync(path.join(sessionsDir, 'interrupted_target.json'), '{"incomplete":true}');

    // Record crash in journal with pending: true
    const journalPath = path.join(vaultDir, 'journal.json');
    const journalEntry = {
      operationId: 'crash-op-123',
      fromAccountId: 'Melynelas',
      targetAccountId: 'littleimad',
      timestampIso: new Date().toISOString(),
      stage: 'swapping-session',
      pending: true,
      encryptedBackupPath: backupPath,
    };
    fs.writeFileSync(journalPath, JSON.stringify(journalEntry, null, 2), 'utf8');

    // Perform recovery
    const recoveryResult = await engine.recoverPendingOperation();
    expect(recoveryResult.recovered).toBe(true);
    expect(recoveryResult.operationId).toBe('crash-op-123');
    expect(recoveryResult.restoredAccountId).toBe('Melynelas');

    // Verify original session identity was restored
    const identity = await storage.inspectLocalSessionIdentity();
    expect(identity.extractedUsername).toBe('Melynelas');

    // Verify partial target file was cleaned up and original token file was restored
    expect(fs.existsSync(path.join(sessionsDir, 'interrupted_target.json'))).toBe(false);
    expect(fs.existsSync(path.join(sessionsDir, 'melynelas_token.json'))).toBe(true);

    // Verify journal is resolved
    const journalAfter = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    expect(journalAfter.pending).toBe(false);
    expect(journalAfter.stage).toBe('rolled-back');
  });

  // 2. Missing or corrupted encrypted backup
  it('fails closed and preserves pending recovery state when encrypted backup is missing or corrupt', async () => {
    populateSyntheticRiotData();
    const { engine } = createTestHarness(true);

    const journalPath = path.join(vaultDir, 'journal.json');
    const nonExistentBackupPath = path.join(vaultDir, 'backups', 'missing.msriot.enc');

    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        operationId: 'missing-backup-op',
        fromAccountId: 'unknown-prior',
        targetAccountId: 'target',
        timestampIso: new Date().toISOString(),
        stage: 'swapping-session',
        pending: true,
        encryptedBackupPath: nonExistentBackupPath,
      }),
      'utf8'
    );

    await expect(engine.recoverPendingOperation()).rejects.toThrow(RiotRecoveryFailedError);

    // Journal MUST remain pending: true
    const journalAfter = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    expect(journalAfter.pending).toBe(true);

    // Now test corrupted ciphertext in encrypted backup
    fs.mkdirSync(path.dirname(nonExistentBackupPath), { recursive: true });
    fs.writeFileSync(nonExistentBackupPath, 'NOT_VALID_ENCRYPTED_DATA_CORRUPT', 'utf8');

    await expect(engine.recoverPendingOperation()).rejects.toThrow(RiotRecoveryFailedError);
    expect(JSON.parse(fs.readFileSync(journalPath, 'utf8')).pending).toBe(true);
  });

  // 3. Restored file with incorrect SHA-256
  it('rejects restored files failing exact manifest SHA-256 checksum verification', async () => {
    populateSyntheticRiotData({ username: 'littleimad' });
    const storage = new RiotWindowsSessionStorage(syntheticRiotDataDir, stagingParentDir);

    const validManifest = [
      {
        relativePath: 'RiotGamesPrivateSettings.yaml',
        sha256: crypto
          .createHash('sha256')
          .update(fs.readFileSync(path.join(syntheticRiotDataDir, 'RiotGamesPrivateSettings.yaml')))
          .digest('hex'),
        byteSize: fs.statSync(path.join(syntheticRiotDataDir, 'RiotGamesPrivateSettings.yaml')).size,
      },
      {
        relativePath: 'Cookies/Cookies.sqlite',
        sha256: 'tampered_hash_that_does_not_match',
        byteSize: 100,
      },
    ];

    // Verification must fail because hash does not match
    const verified = await storage.verifySessionFiles(validManifest);
    expect(verified).toBe(false);
  });

  // 4. Extra files remaining after rollback
  it('detects and rejects extra managed files not present in the expected manifest', async () => {
    populateSyntheticRiotData({ username: 'Melynelas' });
    const storage = new RiotWindowsSessionStorage(syntheticRiotDataDir, stagingParentDir);

    // Introduce an extra file into Sessions/ that is not in the manifest
    const sessionsDir = path.join(syntheticRiotDataDir, 'Sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, 'unexpected_extra.json'), '{"extra":true}');

    const yamlPath = path.join(syntheticRiotDataDir, 'RiotGamesPrivateSettings.yaml');
    const cookiePath = path.join(syntheticRiotDataDir, 'Cookies', 'Cookies.sqlite');

    const manifestWithoutExtra = [
      {
        relativePath: 'RiotGamesPrivateSettings.yaml',
        sha256: crypto.createHash('sha256').update(fs.readFileSync(yamlPath)).digest('hex'),
        byteSize: fs.statSync(yamlPath).size,
      },
      {
        relativePath: 'Cookies/Cookies.sqlite',
        sha256: crypto.createHash('sha256').update(fs.readFileSync(cookiePath)).digest('hex'),
        byteSize: fs.statSync(cookiePath).size,
      },
    ];

    // Verification must fail because extra unexpected managed file exists
    const verified = await storage.verifySessionFiles(manifestWithoutExtra);
    expect(verified).toBe(false);
  });

  // 5. Corrupt journal
  it('treats corrupted or invalid JSON journals as blockers, failing closed', async () => {
    populateSyntheticRiotData();
    const { engine } = createTestHarness(true);

    const journalPath = path.join(vaultDir, 'journal.json');
    // Write invalid/corrupt JSON into journal
    fs.writeFileSync(journalPath, '{{{ CORRUPTED JOURNAL RAW TEXT !!!', 'utf8');

    // switchAccount must be blocked and fail closed
    await expect(engine.switchAccount('Melynelas')).rejects.toThrow(
      RiotRecoveryRequiredError
    );

    // recoverPendingOperation must detect corrupt journal and return explicit manual guidance
    const recoveryResult = await engine.recoverPendingOperation();
    expect(recoveryResult.recovered).toBe(false);
    expect(recoveryResult.manualGuidance).toBeDefined();
    expect(recoveryResult.message).toContain('Recovery blocked by corrupt journal file');
  });

  // 6. Simultaneous switch/recovery attempts
  it('prevents concurrent switch and recovery operations via synchronous lock', async () => {
    populateSyntheticRiotData({ username: 'Melynelas' });
    const { engine, vault, storage } = createTestHarness(true);

    const pkg = await storage.exportLiveSession();
    await vault.saveSession('Melynelas', pkg!);
    await vault.saveSession('littleimad', pkg!);

    // Start switch operation
    const op1 = engine.switchAccount('Melynelas');

    // Concurrently attempt a second operation immediately
    await expect(engine.switchAccount('littleimad')).rejects.toThrow(
      RiotConcurrentOperationError
    );
    await expect(engine.recoverPendingOperation()).rejects.toThrow(
      RiotConcurrentOperationError
    );

    // First operation finishes cleanly
    const res1 = await op1;
    expect(res1.success).toBe(true);
  });

  // 7. Symlink and path traversal attempts
  it('rejects path traversal, duplicate entries, nested subdirectories, and symlinks', async () => {
    // A. Path traversal
    expect(() => validateArchiveRelativePath('../evil.yaml')).toThrow(RiotValidationError);
    expect(() => validateArchiveRelativePath('/Cookies/Cookies')).toThrow(RiotValidationError);
    expect(() => validateArchiveRelativePath('Cookies/../../system.ini')).toThrow(RiotValidationError);

    // B. Duplicate paths
    const seen = new Set<string>();
    validateArchiveRelativePath('Cookies/Cookies', seen);
    expect(() => validateArchiveRelativePath('Cookies/Cookies', seen)).toThrow(RiotValidationError);

    // C. Nested subdirectories (only 1 level inside Cookies or Sessions permitted)
    expect(() => validateArchiveRelativePath('Cookies/nested/deep/file.sqlite')).toThrow(RiotValidationError);
    expect(() => validateArchiveRelativePath('OtherDir/file.txt')).toThrow(RiotValidationError);

    // D. Symlink detection helper
    const regularFile = path.join(testRoot, 'regular.txt');
    fs.writeFileSync(regularFile, 'hello');
    expect(isSymlinkOrReparsePoint(regularFile)).toBe(false);
  });

  // 8. Failure while removing obsolete files
  it('rolls back and restores original state if obsolete file deletion fails', async () => {
    populateSyntheticRiotData({
      username: 'littleimad',
      puuid: 'puuid-littleimad-initial',
      sessionFiles: { 'obsolete_session.json': '{"stale":true}' },
    });

    const storage = new RiotWindowsSessionStorage(syntheticRiotDataDir, stagingParentDir);

    // Target package that does not have obsolete_session.json (triggering removal)
    const targetPkg = {
      magic: 'MSRIOT_PKG_V1',
      exportedAtIso: new Date().toISOString(),
      activeAccountId: 'Melynelas',
      files: [
        {
          relativePath: 'RiotGamesPrivateSettings.yaml',
          dataBase64: Buffer.from('client:\n  patchline: live\nsub: "puuid-melynelas-new"\nusername: "Melynelas"\n').toString('base64'),
          sha256: crypto.createHash('sha256').update('client:\n  patchline: live\nsub: "puuid-melynelas-new"\nusername: "Melynelas"\n').digest('hex'),
          byteSize: Buffer.from('client:\n  patchline: live\nsub: "puuid-melynelas-new"\nusername: "Melynelas"\n').length,
        },
        {
          relativePath: 'Cookies/Cookies.sqlite',
          dataBase64: Buffer.from('TARGET_COOKIE_CONTENT').toString('base64'),
          sha256: crypto.createHash('sha256').update('TARGET_COOKIE_CONTENT').digest('hex'),
          byteSize: Buffer.from('TARGET_COOKIE_CONTENT').length,
        },
      ],
      packageSha256: 'valid',
    };
    const targetGzip = zlib.gzipSync(Buffer.from(JSON.stringify(targetPkg)));

    // Mock unlinkSync to simulate EPERM when deleting obsolete file
    const realUnlink = fs.unlinkSync;
    vi.spyOn(fs, 'unlinkSync').mockImplementation((targetPath: fs.PathLike) => {
      if (String(targetPath).includes('obsolete_session.json')) {
        throw new Error('EPERM: operation not permitted, unlink locked file');
      }
      return realUnlink(targetPath);
    });

    await expect(storage.applySessionAtomically(targetGzip)).rejects.toThrow();

    // Verify in-memory rollback restored original identity and preserved obsolete file
    vi.restoreAllMocks();
    const restoredIdentity = await storage.inspectLocalSessionIdentity();
    expect(restoredIdentity.extractedUsername).toBe('littleimad');
    expect(fs.existsSync(path.join(syntheticRiotDataDir, 'Sessions', 'obsolete_session.json'))).toBe(true);
  });

  // 9. Failure while writing replacement files
  it('rolls back cleanly and removes newly introduced files if writing a replacement file fails', async () => {
    populateSyntheticRiotData({
      username: 'Melynelas',
      puuid: 'puuid-melynelas-orig',
    });

    const storage = new RiotWindowsSessionStorage(syntheticRiotDataDir, stagingParentDir);

    // Target package with 2 files: first succeeds, second fails
    const targetPkg = {
      magic: 'MSRIOT_PKG_V1',
      exportedAtIso: new Date().toISOString(),
      activeAccountId: 'littleimad',
      files: [
        {
          relativePath: 'Sessions/introduced_new_session.json',
          dataBase64: Buffer.from('{"introduced":true}').toString('base64'),
          sha256: crypto.createHash('sha256').update('{"introduced":true}').digest('hex'),
          byteSize: Buffer.from('{"introduced":true}').length,
        },
        {
          relativePath: 'Cookies/Cookies.sqlite',
          dataBase64: Buffer.from('TARGET_COOKIE').toString('base64'),
          sha256: crypto.createHash('sha256').update('TARGET_COOKIE').digest('hex'),
          byteSize: Buffer.from('TARGET_COOKIE').length,
        },
      ],
      packageSha256: 'xyz',
    };
    const targetGzip = zlib.gzipSync(Buffer.from(JSON.stringify(targetPkg)));

    // Mock openSync on Cookies.sqlite to simulate failure mid-replacement
    const realOpen = fs.openSync;
    vi.spyOn(fs, 'openSync').mockImplementation((destPath: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode | null) => {
      if (String(destPath).includes('Cookies.sqlite')) {
        throw new Error('EBUSY: resource busy or locked on write');
      }
      return realOpen(destPath, flags, mode);
    });

    await expect(storage.applySessionAtomically(targetGzip)).rejects.toThrow();

    vi.restoreAllMocks();

    // Verify newly introduced file in Sessions/ was removed by rollback
    expect(
      fs.existsSync(path.join(syntheticRiotDataDir, 'Sessions', 'introduced_new_session.json'))
    ).toBe(false);

    // Verify original identity remains intact
    const identity = await storage.inspectLocalSessionIdentity();
    expect(identity.extractedUsername).toBe('Melynelas');
  });

  // 10. Issue 1: Plaintext live write without .tmp files & handling dangling temporary writes
  it('Issue 1: writes directly to target files without creating .tmp files and cleans dangling artifacts before switch', async () => {
    populateSyntheticRiotData({ username: 'Melynelas' });
    const { engine, vault, storage } = createTestHarness(true);

    const targetPkg = {
      magic: 'MSRIOT_PKG_V1',
      exportedAtIso: new Date().toISOString(),
      activeAccountId: 'littleimad',
      files: [
        {
          relativePath: 'RiotGamesPrivateSettings.yaml',
          dataBase64: Buffer.from('client:\n  patchline: live\nsub: "puuid-littleimad"\nusername: "littleimad"\n').toString('base64'),
          sha256: crypto.createHash('sha256').update('client:\n  patchline: live\nsub: "puuid-littleimad"\nusername: "littleimad"\n').digest('hex'),
          byteSize: Buffer.from('client:\n  patchline: live\nsub: "puuid-littleimad"\nusername: "littleimad"\n').length,
        },
        {
          relativePath: 'Cookies/Cookies.sqlite',
          dataBase64: Buffer.from('COOKIE_LITTLEIMAD').toString('base64'),
          sha256: crypto.createHash('sha256').update('COOKIE_LITTLEIMAD').digest('hex'),
          byteSize: Buffer.from('COOKIE_LITTLEIMAD').length,
        },
      ],
      packageSha256: 'valid',
    };
    await vault.saveSession('littleimad', zlib.gzipSync(Buffer.from(JSON.stringify(targetPkg))));

    // Plant an orphaned dangling temporary file from a simulated interrupted write
    const danglingTemp = path.join(syntheticRiotDataDir, 'Cookies', 'Cookies.tmp.12345');
    fs.writeFileSync(danglingTemp, 'orphaned temp content');
    expect(fs.existsSync(danglingTemp)).toBe(true);

    // Switch account: should clean dangling artifacts and perform switch without creating .tmp files
    const result = await engine.switchAccount('littleimad');
    expect(result.success).toBe(true);

    // Verify dangling temp was cleaned up
    expect(fs.existsSync(danglingTemp)).toBe(false);

    // Verify no .tmp files exist in syntheticRiotDataDir
    const files = storage.listCurrentManagedFiles();
    expect(files.some((f) => f.includes('.tmp.'))).toBe(false);
  });

  // 11. Issue 2: Rollback verification failure handling
  it('Issue 2: treats rollback verification failure as a rollback failure and throws RiotSessionCorruptedError', async () => {
    populateSyntheticRiotData({ username: 'Melynelas' });
    const storage = new RiotWindowsSessionStorage(syntheticRiotDataDir, stagingParentDir);

    const invalidPkg = {
      magic: 'MSRIOT_PKG_V1',
      exportedAtIso: new Date().toISOString(),
      activeAccountId: 'bad',
      files: [
        {
          relativePath: 'RiotGamesPrivateSettings.yaml',
          dataBase64: Buffer.from('bad').toString('base64'), // < 10 bytes -> triggers post-swap verify failure
          sha256: crypto.createHash('sha256').update('bad').digest('hex'),
          byteSize: 3,
        },
      ],
      packageSha256: 'bad',
    };
    const invalidGzip = zlib.gzipSync(Buffer.from(JSON.stringify(invalidPkg)));

    // Mock verifySessionFiles so that the rollback verification returns false
    const origVerify = storage.verifySessionFiles.bind(storage);
    let verifyCallCount = 0;
    vi.spyOn(storage, 'verifySessionFiles').mockImplementation(async (manifest) => {
      verifyCallCount++;
      if (verifyCallCount > 1) {
        // Rollback verification call fails
        return false;
      }
      return origVerify(manifest);
    });

    await expect(storage.applySessionAtomically(invalidGzip)).rejects.toThrow(
      RiotSessionCorruptedError
    );
  });

  // 12. Issue 3: Do not substitute saved account profile unless exact file manifest matches
  it('Issue 3: does not substitute saved account profile for original encrypted snapshot if manifests do not match', async () => {
    populateSyntheticRiotData({ username: 'Melynelas', puuid: 'puuid-live-pre-switch' });
    const { engine, vault } = createTestHarness(true);

    // Save a profile in the vault for Melynelas with DIFFERENT content (e.g. old token)
    const oldVaultPkg = {
      magic: 'MSRIOT_PKG_V1',
      exportedAtIso: new Date().toISOString(),
      activeAccountId: 'Melynelas',
      files: [
        {
          relativePath: 'RiotGamesPrivateSettings.yaml',
          dataBase64: Buffer.from('client:\n  patchline: live\nsub: "puuid-old-vault"\nusername: "Melynelas"\n').toString('base64'),
          sha256: crypto.createHash('sha256').update('client:\n  patchline: live\nsub: "puuid-old-vault"\nusername: "Melynelas"\n').digest('hex'),
          byteSize: Buffer.from('client:\n  patchline: live\nsub: "puuid-old-vault"\nusername: "Melynelas"\n').length,
        },
      ],
      packageSha256: 'old',
    };
    await vault.saveSession('Melynelas', zlib.gzipSync(Buffer.from(JSON.stringify(oldVaultPkg))));

    // Journal points to a MISSING encrypted backup, but has outgoingManifest for puuid-live-pre-switch
    const journalPath = path.join(vaultDir, 'journal.json');
    const liveYamlPath = path.join(syntheticRiotDataDir, 'RiotGamesPrivateSettings.yaml');
    const journalEntry = {
      operationId: 'substitute-test-op',
      fromAccountId: 'Melynelas',
      targetAccountId: 'littleimad',
      timestampIso: new Date().toISOString(),
      stage: 'swapping-session',
      pending: true,
      encryptedBackupPath: path.join(vaultDir, 'backups', 'missing_backup.msriot.enc'),
      outgoingManifest: [
        {
          relativePath: 'RiotGamesPrivateSettings.yaml',
          sha256: crypto.createHash('sha256').update(fs.readFileSync(liveYamlPath)).digest('hex'),
          byteSize: fs.statSync(liveYamlPath).size,
        },
      ],
    };
    fs.writeFileSync(journalPath, JSON.stringify(journalEntry, null, 2), 'utf8');

    // recoverPendingOperation MUST reject substituting oldVaultPkg because manifest does not match!
    await expect(engine.recoverPendingOperation()).rejects.toThrow(RiotRecoveryFailedError);

    // Journal remains pending
    expect(JSON.parse(fs.readFileSync(journalPath, 'utf8')).pending).toBe(true);
  });

  // 13. Issue 4: Abort before modifying anything if existing session files cannot be exported
  it('Issue 4: aborts switch before modifying any files if existing session files cannot be exported', async () => {
    populateSyntheticRiotData({ username: 'Melynelas', puuid: 'puuid-live-melynelas' });
    const { engine, vault, storage } = createTestHarness(true);

    const targetPkg = {
      magic: 'MSRIOT_PKG_V1',
      exportedAtIso: new Date().toISOString(),
      activeAccountId: 'littleimad',
      files: [
        {
          relativePath: 'RiotGamesPrivateSettings.yaml',
          dataBase64: Buffer.from('client:\n  install: 1\nsub: "puuid-target"\nusername: "littleimad"\n').toString('base64'),
          sha256: crypto.createHash('sha256').update('client:\n  install: 1\nsub: "puuid-target"\nusername: "littleimad"\n').digest('hex'),
          byteSize: Buffer.from('client:\n  install: 1\nsub: "puuid-target"\nusername: "littleimad"\n').length,
        },
      ],
      packageSha256: 'valid',
    };
    await vault.saveSession('littleimad', zlib.gzipSync(Buffer.from(JSON.stringify(targetPkg))));

    // Simulate exportLiveSession returning null (e.g. read error / corruption during export)
    vi.spyOn(storage, 'exportLiveSession').mockResolvedValue(null);

    // switchAccount must ABORT immediately with RiotStorageError
    await expect(engine.switchAccount('littleimad')).rejects.toThrow(
      RiotStorageError
    );

    // Existing live files MUST NOT be modified or replaced
    const identity = await storage.inspectLocalSessionIdentity();
    expect(identity.extractedUsername).toBe('Melynelas');
  });

  // 14. Issue 5: Legacy recovery cannot delete recovery copies based only on structural verification
  it('Issue 5: legacy recoverInterruptedSwap verifies exact manifest and never deletes backup on mismatch', async () => {
    const storage = new RiotWindowsSessionStorage(syntheticRiotDataDir, stagingParentDir);

    const opId = randomUUID();
    const backupDir = path.join(stagingParentDir, `.maswitch_backup_${opId}`);
    fs.mkdirSync(backupDir, { recursive: true });

    // Put valid files in backup
    fs.writeFileSync(
      path.join(backupDir, 'RiotGamesPrivateSettings.yaml'),
      'client:\n  install: 1\nusername: "backup_user"\n'
    );

    // Mock verifySessionFiles to fail exact manifest check
    vi.spyOn(storage, 'verifySessionFiles').mockResolvedValue(false);

    const recovered = await storage.recoverInterruptedSwap(opId);
    expect(recovered).toBe(false);

    // Backup directory MUST NOT be deleted!
    expect(fs.existsSync(backupDir)).toBe(true);
  });

  // 15. Issue 6: Require a valid original manifest before declaring exact recovery successful
  it('Issue 6: requires valid original manifest for recovery and rejects silent fallback to basic checks', async () => {
    populateSyntheticRiotData();
    const { engine } = createTestHarness(true);

    const journalPath = path.join(vaultDir, 'journal.json');
    // Journal with pending: true but NO outgoingManifest and NO encrypted backup
    const journalEntry = {
      operationId: 'no-manifest-op',
      fromAccountId: null,
      targetAccountId: 'littleimad',
      timestampIso: new Date().toISOString(),
      stage: 'swapping-session',
      pending: true,
      encryptedBackupPath: null,
      outgoingManifest: null, // missing manifest!
    };
    fs.writeFileSync(journalPath, JSON.stringify(journalEntry, null, 2), 'utf8');

    await expect(engine.recoverPendingOperation()).rejects.toThrow(RiotRecoveryFailedError);

    // Journal remains pending: true
    expect(JSON.parse(fs.readFileSync(journalPath, 'utf8')).pending).toBe(true);
  });
});
