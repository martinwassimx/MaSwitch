import { execFile, execFileSync, spawn } from 'node:child_process';
import crypto, { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { safeStorage } from 'electron';
import type { RiotSessionFileManifestEntry } from '../../../src/shared/types/account';
import type {
  RiotProcessCoordinator,
  RiotSessionStorage,
  RiotSessionVault,
} from './riotLiveSwitchingEngine';
import {
  RiotLiveSwitchingEngine,
  RiotProcessDetectionError,
  RiotSessionCorruptedError,
  RiotStorageError,
  RiotValidationError,
  RiotStateDriftError,
} from './riotLiveSwitchingEngine';
import type { RunningProcessEntry } from '../tracker/playtimeTrackerEngine';
import { listWindowsProcessImageNames } from '../tracker/playtimeTrackerEngine';

const execFileAsync = promisify(execFile);

// --- Interface for safeStorage abstraction ---

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

// --- Restrictive Permissions Helper (Synchronous & Fail-Closed) ---

let cachedUserSid: string | null | undefined;

/** Parses `whoami /user /fo csv /nh` output; the SID avoids %USERNAME% spoofing and local/domain name ambiguity. */
export function parseWhoamiUserSid(output: string): string | null {
  const match = output.trim().match(/,"(S-1-[0-9]+(?:-[0-9]+)+)"\s*$/);
  return match ? match[1] : null;
}

function resolveCurrentUserSid(): string | null {
  if (cachedUserSid !== undefined) {
    return cachedUserSid;
  }
  try {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const output = execFileSync(path.join(systemRoot, 'System32', 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], {
      windowsHide: true,
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    cachedUserSid = parseWhoamiUserSid(output);
  } catch {
    cachedUserSid = null;
  }
  return cachedUserSid;
}

/**
 * Enforces restrictive filesystem ACL permissions on Windows synchronously.
 * Fails closed (throws RiotStorageError) if permission configuration fails on Windows.
 */
export function enforceSecureDirectoryPermissionsSync(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
  try {
    fs.chmodSync(dirPath, 0o700);
  } catch {
    // Non-fatal on Windows where POSIX modes do not apply
  }

  if (process.platform === 'win32') {
    const sid = resolveCurrentUserSid();
    const username = process.env.USERNAME;
    const principal = sid ? `*${sid}` : username;
    if (principal) {
      try {
        execFileSync(
          'icacls.exe',
          [
            dirPath,
            '/inheritance:r',
            '/grant:r',
            `${principal}:(OI)(CI)F`,
            '*S-1-5-18:(OI)(CI)F',
          ],
          { windowsHide: true, timeout: 5000, stdio: 'ignore' }
        );
      } catch (err) {
        throw new RiotStorageError(
          `Failed to enforce secure directory permissions on '${dirPath}': ${err instanceof Error ? err.message : String(err)}. Operations fail closed for security.`
        );
      }
    }
  }
}

export const enforceSecureDirectoryPermissions = enforceSecureDirectoryPermissionsSync;

// --- Symlink & Path Security Helpers ---

/**
 * Checks whether a path points to a symbolic link or Windows reparse point.
 * Used to reject symlink redirection attacks on session credential stores.
 */
export function isSymlinkOrReparsePoint(targetPath: string): boolean {
  try {
    if (!fs.existsSync(targetPath)) return false;
    const stat = fs.lstatSync(targetPath);
    return stat.isSymbolicLink() || (stat as { isReparsePoint?: () => boolean }).isReparsePoint?.() === true;
  } catch {
    return false;
  }
}

/**
 * Strictly validates an archive relative path against directory traversal,
 * symlinks, duplicate entries, and unexpected nested hierarchies.
 */
export function validateArchiveRelativePath(relPath: string, seenPaths?: Set<string>): string {
  if (typeof relPath !== 'string' || relPath.trim() === '') {
    throw new RiotValidationError('Archive entry relative path must be a non-empty string.');
  }
  const normalized = relPath.replace(/\\/g, '/');

  if (seenPaths) {
    if (seenPaths.has(normalized)) {
      throw new RiotValidationError(`Duplicate archive entry relative path '${normalized}' rejected.`);
    }
    seenPaths.add(normalized);
  }

  if (
    normalized.includes('..') ||
    normalized.startsWith('/') ||
    normalized.endsWith('/') ||
    normalized.includes('//') ||
    normalized.includes(':')
  ) {
    throw new RiotValidationError(`Illegal relative path '${relPath}' in session archive.`);
  }

  // Allowed session file patterns:
  // 1. Exactly 'RiotGamesPrivateSettings.yaml'
  // 2. 'Cookies/<safe-filename>' (single file in Cookies/, no nested dirs)
  // 3. 'Sessions/<safe-filename>' (single file in Sessions/, no nested dirs)
  const isYaml = normalized === 'RiotGamesPrivateSettings.yaml';
  const isCookie = /^Cookies\/[a-zA-Z0-9_.-]+$/.test(normalized);
  const isSession = /^Sessions\/[a-zA-Z0-9_.-]+$/.test(normalized);

  if (!isYaml && !isCookie && !isSession) {
    throw new RiotValidationError(
      `Unauthorized archive entry path '${relPath}'. Only RiotGamesPrivateSettings.yaml, Cookies/<file>, and Sessions/<file> are permitted.`
    );
  }

  return normalized;
}

// --- 1. Windows DPAPI Encrypted Session Vault ---

interface EncryptedVaultEnvelope {
  format: 'MSRIOT_VAULT_V1';
  accountId: string;
  encryptionScheme: 'dpapi' | 'aes-256-gcm';
  ivHex?: string;
  authTagHex?: string;
  sha256: string;
  createdAtIso: string;
  isExpired?: boolean;
  payloadBase64: string;
}

export interface RiotWindowsSessionVaultOptions {
  safeStorageOverride?: SafeStorageLike | null;
  hardwareKeySalt?: string;
  allowInsecureTestCipher?: boolean;
}

export class RiotWindowsSessionVault implements RiotSessionVault {
  private readonly vaultDir: string;
  private readonly safeStorageClient: SafeStorageLike | null;
  private readonly fallbackKey: Buffer;
  private readonly allowInsecureTestCipher: boolean;

  constructor(vaultDir: string, options?: RiotWindowsSessionVaultOptions) {
    this.vaultDir = path.resolve(vaultDir);
    enforceSecureDirectoryPermissionsSync(this.vaultDir);

    this.allowInsecureTestCipher = options?.allowInsecureTestCipher ?? false;

    if (options?.safeStorageOverride !== undefined) {
      this.safeStorageClient = options.safeStorageOverride;
    } else if (
      typeof safeStorage !== 'undefined' &&
      safeStorage &&
      typeof safeStorage.isEncryptionAvailable === 'function'
    ) {
      this.safeStorageClient = safeStorage;
    } else {
      this.safeStorageClient = null;
    }

    // Hardware/User bound key derivation for fallback cipher (test-only)
    const salt =
      options?.hardwareKeySalt ||
      `${process.env.COMPUTERNAME || 'M'}-${process.env.USERNAME || 'U'}-maswitch-riot-vault`;
    this.fallbackKey = crypto.scryptSync(salt, 'maswitch-vault-scrypt-salt', 32);
  }

  public getVaultDirectory(): string {
    return this.vaultDir;
  }

  private validateAccountId(accountId: string): void {
    if (!accountId || typeof accountId !== 'string') {
      throw new RiotValidationError('Account ID must be a non-empty string.');
    }
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(accountId) || accountId.includes('..')) {
      throw new RiotValidationError(
        `Invalid Riot account ID '${accountId}'. Must be alphanumeric and under 64 chars.`
      );
    }
  }

  private getSessionFilePath(accountId: string): string {
    this.validateAccountId(accountId);
    return path.join(this.vaultDir, `${accountId}.msriot.enc`);
  }

  public async hasSession(accountId: string): Promise<boolean> {
    try {
      const filePath = this.getSessionFilePath(accountId);
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  public async saveSession(
    accountId: string,
    sessionData: Buffer,
    options?: { isExpired?: boolean }
  ): Promise<void> {
    this.validateAccountId(accountId);
    if (!Buffer.isBuffer(sessionData) || sessionData.length === 0) {
      throw new RiotValidationError('Session data must be a non-empty Buffer.');
    }

    const filePath = this.getSessionFilePath(accountId);
    await this.saveSessionToFile(filePath, accountId, sessionData, options);
  }

  private async saveSessionToFile(
    destPath: string,
    accountId: string,
    sessionData: Buffer,
    options?: { isExpired?: boolean }
  ): Promise<void> {
    const sha256 = crypto.createHash('sha256').update(sessionData).digest('hex');
    let envelope: EncryptedVaultEnvelope;

    const hasDpapi =
      this.safeStorageClient && this.safeStorageClient.isEncryptionAvailable();

    if (hasDpapi) {
      try {
        const encryptedBuffer = this.safeStorageClient!.encryptString(
          sessionData.toString('base64')
        );
        envelope = {
          format: 'MSRIOT_VAULT_V1',
          accountId,
          encryptionScheme: 'dpapi',
          sha256,
          createdAtIso: new Date().toISOString(),
          isExpired: options?.isExpired ?? false,
          payloadBase64: encryptedBuffer.toString('base64'),
        };
      } catch (dpapiErr) {
        throw new RiotStorageError(
          `Windows DPAPI encryption failed: ${dpapiErr instanceof Error ? dpapiErr.message : String(dpapiErr)}. Credentials will not be stored without DPAPI protection.`
        );
      }
    } else {
      if (!this.allowInsecureTestCipher) {
        throw new RiotStorageError(
          'Windows DPAPI encryption is unavailable. Production Riot session storage requires secure OS-level DPAPI protection and fails closed.'
        );
      }

      envelope = this.encryptFallback(
        accountId,
        sessionData,
        sha256,
        options?.isExpired
      );
    }

    const tempPath = `${destPath}.${randomUUID()}.tmp`;

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(tempPath, JSON.stringify(envelope, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.renameSync(tempPath, destPath);
  }

  /**
   * Creates an encrypted pre-switch snapshot of session credentials.
   * Stored in `<vaultDir>/backups/` with Windows DPAPI encryption.
   */
  public async createEncryptedBackup(
    backupLabel: string,
    sessionData: Buffer
  ): Promise<string> {
    this.validateAccountId(backupLabel);
    const backupsDir = path.join(this.vaultDir, 'backups');
    enforceSecureDirectoryPermissionsSync(backupsDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${backupLabel}_${timestamp}.msriot.enc`;
    const destPath = path.join(backupsDir, filename);

    await this.saveSessionToFile(destPath, backupLabel, sessionData);
    return destPath;
  }

  private encryptFallback(
    accountId: string,
    sessionData: Buffer,
    sha256: string,
    isExpired?: boolean
  ): EncryptedVaultEnvelope {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.fallbackKey, iv);
    const encrypted = Buffer.concat([cipher.update(sessionData), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      format: 'MSRIOT_VAULT_V1',
      accountId,
      encryptionScheme: 'aes-256-gcm',
      ivHex: iv.toString('hex'),
      authTagHex: authTag.toString('hex'),
      sha256,
      createdAtIso: new Date().toISOString(),
      isExpired: isExpired ?? false,
      payloadBase64: encrypted.toString('base64'),
    };
  }

  public async loadSession(accountId: string): Promise<Buffer | null> {
    this.validateAccountId(accountId);
    const filePath = this.getSessionFilePath(accountId);
    return this.loadSessionFromFile(filePath, accountId);
  }

  public async loadSessionFromFile(
    filePath: string,
    accountId: string
  ): Promise<Buffer | null> {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const envelope = JSON.parse(raw) as EncryptedVaultEnvelope;

      if (envelope.format !== 'MSRIOT_VAULT_V1') {
        throw new RiotSessionCorruptedError('Invalid vault envelope magic identifier.');
      }

      let decryptedBuffer: Buffer;

      if (envelope.encryptionScheme === 'dpapi') {
        if (!this.safeStorageClient || !this.safeStorageClient.isEncryptionAvailable()) {
          throw new RiotStorageError(
            'Windows DPAPI encryption unavailable to decrypt vault session.'
          );
        }
        const decryptedBase64 = this.safeStorageClient.decryptString(
          Buffer.from(envelope.payloadBase64, 'base64')
        );
        decryptedBuffer = Buffer.from(decryptedBase64, 'base64');
      } else if (envelope.encryptionScheme === 'aes-256-gcm') {
        if (!this.allowInsecureTestCipher) {
          throw new RiotSessionCorruptedError(
            'Insecure AES cipher session encountered in vault. DPAPI encryption is strictly enforced in production.'
          );
        }
        if (!envelope.ivHex || !envelope.authTagHex) {
          throw new RiotSessionCorruptedError(
            'Missing IV or AuthTag in AES-GCM vault envelope.'
          );
        }
        const iv = Buffer.from(envelope.ivHex, 'hex');
        const authTag = Buffer.from(envelope.authTagHex, 'hex');
        const encrypted = Buffer.from(envelope.payloadBase64, 'base64');

        const decipher = crypto.createDecipheriv('aes-256-gcm', this.fallbackKey, iv);
        decipher.setAuthTag(authTag);
        decryptedBuffer = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      } else {
        throw new RiotSessionCorruptedError(
          `Unsupported vault encryption scheme '${envelope.encryptionScheme}'.`
        );
      }

      const calculatedHash = crypto
        .createHash('sha256')
        .update(decryptedBuffer)
        .digest('hex');
      if (calculatedHash !== envelope.sha256) {
        throw new RiotSessionCorruptedError(
          'Decrypted session payload failed checksum verification.'
        );
      }

      return decryptedBuffer;
    } catch (err: unknown) {
      if (err instanceof RiotSessionCorruptedError || err instanceof RiotStorageError) {
        throw err;
      }
      throw new RiotSessionCorruptedError(
        `Failed to decrypt vault session for '${accountId}': ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  public async deleteSession(accountId: string): Promise<void> {
    this.validateAccountId(accountId);
    const filePath = this.getSessionFilePath(accountId);
    if (!fs.existsSync(filePath)) {
      return;
    }

    try {
      const size = fs.statSync(filePath).size;
      if (size > 0) {
        fs.writeFileSync(filePath, Buffer.alloc(size, 0));
      }
      fs.unlinkSync(filePath);
    } catch {
      // Best-effort cleanup
    }
  }

  public async isSessionExpired(accountId: string): Promise<boolean> {
    this.validateAccountId(accountId);
    const filePath = this.getSessionFilePath(accountId);
    if (!fs.existsSync(filePath)) {
      return false;
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const envelope = JSON.parse(raw) as EncryptedVaultEnvelope;
      return envelope.isExpired === true;
    } catch {
      return false;
    }
  }

  public async markSessionExpired(accountId: string, expired: boolean): Promise<void> {
    this.validateAccountId(accountId);
    const filePath = this.getSessionFilePath(accountId);
    if (!fs.existsSync(filePath)) {
      return;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const envelope = JSON.parse(raw) as EncryptedVaultEnvelope;
    envelope.isExpired = expired;
    fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2), 'utf8');
  }

  public async listStoredAccountIds(): Promise<string[]> {
    if (!fs.existsSync(this.vaultDir)) return [];
    try {
      const files = fs.readdirSync(this.vaultDir);
      return files
        .filter((f) => f.endsWith('.msriot.enc'))
        .map((f) => f.replace(/\.msriot\.enc$/, ''));
    } catch {
      return [];
    }
  }
}

// --- 2. Windows Atomic Filesystem Session Storage ---

interface SessionArchiveFileEntry {
  relativePath: string;
  dataBase64: string;
  sha256: string;
  byteSize: number;
}

interface SessionArchivePackage {
  magic: 'MSRIOT_PKG_V1';
  exportedAtIso: string;
  activeAccountId: string | null;
  files: SessionArchiveFileEntry[];
  packageSha256: string;
}

export class RiotWindowsSessionStorage implements RiotSessionStorage {
  private readonly riotDataDir: string;
  private readonly stagingParentDir: string;

  constructor(riotDataDir?: string, stagingParentDir?: string) {
    if (riotDataDir) {
      this.riotDataDir = path.resolve(riotDataDir);
    } else {
      const localAppData = process.env.LOCALAPPDATA || 'C:\\RiotGames';
      this.riotDataDir = path.join(localAppData, 'Riot Games', 'Riot Client', 'Data');
    }

    this.stagingParentDir = stagingParentDir
      ? path.resolve(stagingParentDir)
      : path.dirname(this.riotDataDir);

    enforceSecureDirectoryPermissionsSync(this.stagingParentDir);
  }

  public getDataDirectory(): string {
    return this.riotDataDir;
  }

  public getStagingParentDirectory(): string {
    return this.stagingParentDir;
  }

  /**
   * Distinguishes a genuinely empty Riot session folder from a folder with existing files.
   * Checks for presence of settings YAML or any files in Cookies/ or Sessions/.
   */
  public hasExistingSessionFiles(): boolean {
    if (!fs.existsSync(this.riotDataDir)) return false;

    const yaml = path.join(this.riotDataDir, 'RiotGamesPrivateSettings.yaml');
    if (fs.existsSync(yaml)) return true;

    const cookiesDir = path.join(this.riotDataDir, 'Cookies');
    if (fs.existsSync(cookiesDir)) {
      try {
        const entries = fs.readdirSync(cookiesDir);
        if (entries.length > 0) return true;
      } catch {
        return true;
      }
    }

    const sessionsDir = path.join(this.riotDataDir, 'Sessions');
    if (fs.existsSync(sessionsDir)) {
      try {
        const entries = fs.readdirSync(sessionsDir);
        if (entries.length > 0) return true;
      } catch {
        return true;
      }
    }

    return false;
  }

  /**
   * Inspects local session files to extract identity markers (username and PUUID).
   *
   * SECURITY NOTICE:
   * Local session markers extracted from client files do NOT represent verified Riot authentication
   * or server-accepted authorization. Riot servers may reject, revoke, or require re-authentication.
   */
  public async inspectLocalSessionIdentity(): Promise<{
    extractedUsername: string | null;
    extractedPuuid: string | null;
    isUnverified: true;
  }> {
    const privateSettingsPath = path.join(
      this.riotDataDir,
      'RiotGamesPrivateSettings.yaml'
    );
    if (!fs.existsSync(privateSettingsPath) || isSymlinkOrReparsePoint(privateSettingsPath)) {
      return { extractedUsername: null, extractedPuuid: null, isUnverified: true };
    }

    try {
      const content = fs.readFileSync(privateSettingsPath, 'utf8');

      // 1. Look for OAuth sub (PUUID)
      let extractedPuuid: string | null = null;
      const subMatch = content.match(/sub:\s*["']?([a-zA-Z0-9_.-]{8,64})["']?/i);
      if (subMatch && subMatch[1]) {
        extractedPuuid = subMatch[1].trim();
      }

      // 2. Look for username or account tag
      let extractedUsername: string | null = null;
      const userMatch = content.match(/username:\s*["']?([^"'\r\n]+)["']?/i);
      if (userMatch && userMatch[1]) {
        extractedUsername = userMatch[1].trim();
      } else {
        const chatUserMatch = content.match(/current_user:\s*["']?([^"'\r\n]+)["']?/i);
        if (chatUserMatch && chatUserMatch[1]) {
          extractedUsername = chatUserMatch[1].trim();
        } else {
          const accountMatch = content.match(/account:\s*["']?([^"'\r\n]+)["']?/i);
          if (accountMatch && accountMatch[1]) {
            extractedUsername = accountMatch[1].trim();
          }
        }
      }

      return { extractedUsername, extractedPuuid, isUnverified: true };
    } catch {
      return { extractedUsername: null, extractedPuuid: null, isUnverified: true };
    }
  }

  public async readCurrentActiveSessionId(): Promise<string | null> {
    return this.readCurrentLocalSessionIdentifier();
  }

  public async readCurrentLocalSessionIdentifier(): Promise<string | null> {
    const identity = await this.inspectLocalSessionIdentity();
    return identity.extractedPuuid || identity.extractedUsername || null;
  }

  /**
   * Returns all relative file paths currently managed under the supported Riot session paths:
   * 1. RiotGamesPrivateSettings.yaml
   * 2. Cookies/
   * 3. Sessions/
   *
   * Strictly rejects any symlinks or reparse points encountered.
   */
  public listCurrentManagedFiles(): string[] {
    const list: string[] = [];
    if (!fs.existsSync(this.riotDataDir)) return list;

    if (isSymlinkOrReparsePoint(this.riotDataDir)) {
      throw new RiotValidationError(
        `Riot data directory '${this.riotDataDir}' is a symlink or reparse point. Prohibited for security.`
      );
    }

    const yaml = path.join(this.riotDataDir, 'RiotGamesPrivateSettings.yaml');
    if (fs.existsSync(yaml)) {
      if (isSymlinkOrReparsePoint(yaml)) {
        throw new RiotValidationError(`Session file '${yaml}' is a symlink or reparse point.`);
      }
      if (fs.statSync(yaml).isFile()) {
        list.push('RiotGamesPrivateSettings.yaml');
      }
    }

    const scanSubdir = (dirName: string) => {
      const fullDir = path.join(this.riotDataDir, dirName);
      if (fs.existsSync(fullDir)) {
        if (isSymlinkOrReparsePoint(fullDir)) {
          throw new RiotValidationError(`Session directory '${fullDir}' is a symlink or reparse point.`);
        }
        if (fs.statSync(fullDir).isDirectory()) {
          const entries = fs.readdirSync(fullDir);
          for (const entry of entries) {
            const fullEntry = path.join(fullDir, entry);
            if (isSymlinkOrReparsePoint(fullEntry)) {
              throw new RiotValidationError(`Session file '${fullEntry}' is a symlink or reparse point.`);
            }
            if (fs.statSync(fullEntry).isFile()) {
              list.push(path.join(dirName, entry).replace(/\\/g, '/'));
            }
          }
        }
      }
    };

    scanSubdir('Cookies');
    scanSubdir('Sessions');

    list.sort();
    return list;
  }

  /**
   * Computes a true cryptographic content SHA256 signature of all managed session files.
   * Hashes actual file content bytes for RiotGamesPrivateSettings.yaml, Cookies/, and Sessions/.
   * Fails closed (throws RiotStorageError) if any managed file cannot be read.
   */
  public async computeLiveStateSignature(): Promise<string | null> {
    if (!fs.existsSync(this.riotDataDir)) return null;

    try {
      const managedFiles = this.listCurrentManagedFiles();
      if (managedFiles.length === 0) return null;

      managedFiles.sort();

      const hash = crypto.createHash('sha256');
      for (const rel of managedFiles) {
        const full = path.join(this.riotDataDir, rel);
        const data = fs.readFileSync(full);
        hash.update(rel);
        hash.update(data);
      }
      return hash.digest('hex');
    } catch (err) {
      if (err instanceof RiotValidationError) throw err;
      throw new RiotStorageError(
        `Failed to compute live state signature in '${this.riotDataDir}': ${err instanceof Error ? err.message : String(err)}. State cannot be safely determined.`
      );
    }
  }

  /**
   * Verifies session files on disk.
   *
   * When `expectedManifest` is provided:
   * 1. Confirms EVERY file in manifest exists on disk, is not a symlink, and matches exact SHA-256 and byte size.
   * 2. Confirms NO unexpected or extra managed files remain in Cookies/, Sessions/, or root.
   *
   * When `expectedManifest` is omitted (fallback/pre-export check):
   * Confirms basic existence of RiotGamesPrivateSettings.yaml and Cookies without symlinks.
   */
  public async verifySessionFiles(
    expectedManifest?: RiotSessionFileManifestEntry[]
  ): Promise<boolean> {
    try {
      if (expectedManifest && Array.isArray(expectedManifest)) {
        // 1. Check for extra or unexpected managed files
        const currentManaged = this.listCurrentManagedFiles();
        const expectedPaths = new Set(
          expectedManifest.map((m) => m.relativePath.replace(/\\/g, '/'))
        );

        if (currentManaged.length !== expectedManifest.length) {
          return false;
        }

        for (const rel of currentManaged) {
          if (!expectedPaths.has(rel)) {
            return false; // Extra managed file detected!
          }
        }

        // 2. Check each expected file exists, is not a symlink, and matches SHA-256 and byteSize
        for (const entry of expectedManifest) {
          const rel = entry.relativePath.replace(/\\/g, '/');
          const full = path.join(this.riotDataDir, rel);

          if (!fs.existsSync(full)) return false;
          if (isSymlinkOrReparsePoint(full)) return false;

          const stat = fs.statSync(full);
          if (!stat.isFile()) return false;
          if (entry.byteSize !== undefined && stat.size !== entry.byteSize) return false;
          if (rel === 'RiotGamesPrivateSettings.yaml' && stat.size < 10) return false;

          const content = fs.readFileSync(full);
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          if (hash !== entry.sha256) return false;
        }

        return true;
      }

      // Fallback basic structural verification
      const privateSettingsPath = path.join(
        this.riotDataDir,
        'RiotGamesPrivateSettings.yaml'
      );
      if (!fs.existsSync(privateSettingsPath) || isSymlinkOrReparsePoint(privateSettingsPath)) {
        return false;
      }
      const stat = fs.statSync(privateSettingsPath);
      if (stat.size < 10) return false;

      const cookiesPath = path.join(this.riotDataDir, 'Cookies');
      const sessionsPath = path.join(this.riotDataDir, 'Sessions');
      const hasCookies = fs.existsSync(cookiesPath) && !isSymlinkOrReparsePoint(cookiesPath);
      const hasSessions = fs.existsSync(sessionsPath) && !isSymlinkOrReparsePoint(sessionsPath);

      // Require either Cookies/ or Sessions/ (or both) to exist without symlinks
      if (!hasCookies && !hasSessions) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  public async exportLiveSession(): Promise<Buffer | null> {
    if (!(await this.verifySessionFiles())) {
      return null;
    }

    const files: SessionArchiveFileEntry[] = [];
    const activeAccountId = await this.readCurrentActiveSessionId();
    const managedFiles = this.listCurrentManagedFiles();

    for (const rel of managedFiles) {
      const full = path.join(this.riotDataDir, rel);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        const data = fs.readFileSync(full);
        files.push({
          relativePath: rel,
          dataBase64: data.toString('base64'),
          sha256: crypto.createHash('sha256').update(data).digest('hex'),
          byteSize: data.length,
        });
      }
    }

    if (files.length === 0) {
      return null;
    }

    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    const packageSha256 = crypto
      .createHash('sha256')
      .update(files.map((f) => `${f.relativePath}:${f.sha256}`).join(';'))
      .digest('hex');

    const pkg: SessionArchivePackage = {
      magic: 'MSRIOT_PKG_V1',
      exportedAtIso: new Date().toISOString(),
      activeAccountId,
      files,
      packageSha256,
    };

    return zlib.gzipSync(Buffer.from(JSON.stringify(pkg), 'utf8'));
  }

  /**
   * Applies incoming session package with consistent replacement and in-memory rollback.
   *
   * SECURITY & ARCHITECTURE GUARANTEES:
   * 1. NO persistent unencrypted staging directories (`.maswitch_stage_*`) are created outside Riot's live directory.
   * 2. Replacement writes target files directly into their intended destination folders with synchronous fsync,
   *    avoiding unnecessary plaintext temporary copies.
   * 3. NOTE ON UNAVOIDABLE PLAINTEXT LIVE FILES:
   *    Riot Client requires local configuration and cookie files (RiotGamesPrivateSettings.yaml, Cookies/Cookies.sqlite,
   *    Sessions/*.json) to exist unencrypted on disk in %LOCALAPPDATA%\Riot Games\Riot Client\Data to authenticate.
   *    Writing to these live destinations in plaintext is mandatory for Riot Client compatibility.
   * 4. In-memory backup of the original state is preserved during the swap.
   * 5. If any error occurs:
   *    - Any newly introduced files not present in the original state are deleted.
   *    - Original files are restored from in-memory backup.
   *    - The restored state is strictly verified against the original snapshot manifest.
   *    - If in-memory rollback fails exact manifest verification, it throws RiotSessionCorruptedError
   *      and leaves the transaction pending in the journal for persistent crash recovery.
   */
  public async applySessionAtomically(
    sessionData: Buffer,
    options?: { expectedPreStateSha256?: string | null }
  ): Promise<void> {
    if (!Buffer.isBuffer(sessionData) || sessionData.length === 0) {
      throw new RiotValidationError('Session data buffer is empty or invalid.');
    }

    // 1. Decompress and validate package format
    let pkg: SessionArchivePackage;
    try {
      const unzipped = zlib.gunzipSync(sessionData);
      pkg = JSON.parse(unzipped.toString('utf8')) as SessionArchivePackage;
    } catch {
      throw new RiotSessionCorruptedError('Failed to decompress or parse session archive.');
    }

    if (pkg.magic !== 'MSRIOT_PKG_V1' || !Array.isArray(pkg.files) || pkg.files.length === 0) {
      throw new RiotSessionCorruptedError('Invalid archive manifest structure or empty file set.');
    }

    // 2. Strict path validation, duplicate checking, and integrity check
    const seenPaths = new Set<string>();
    for (const file of pkg.files) {
      const rel = validateArchiveRelativePath(file.relativePath, seenPaths);
      file.relativePath = rel;

      const fileBuf = Buffer.from(file.dataBase64, 'base64');
      if (file.byteSize !== undefined && fileBuf.length !== file.byteSize) {
        throw new RiotSessionCorruptedError(`Byte size mismatch for '${file.relativePath}'.`);
      }
      const hash = crypto.createHash('sha256').update(fileBuf).digest('hex');
      if (hash !== file.sha256) {
        throw new RiotSessionCorruptedError(`File checksum mismatch for '${file.relativePath}'.`);
      }
    }

    // 3. Pre-swap Content Drift Verification
    if (options?.expectedPreStateSha256) {
      const currentSignature = await this.computeLiveStateSignature();
      if (currentSignature !== options.expectedPreStateSha256) {
        throw new RiotStateDriftError(
          `External file modification detected in Riot Data directory prior to swap. Expected ${options.expectedPreStateSha256}, got ${currentSignature}. Aborting swap to prevent data collision.`
        );
      }
    }

    // 4. In-Memory Live Backup (Zero unencrypted disk backup directories outside live folder)
    const inMemoryLiveBackup = new Map<string, Buffer>();
    const currentLiveManagedFiles = this.listCurrentManagedFiles();
    for (const rel of currentLiveManagedFiles) {
      const full = path.join(this.riotDataDir, rel);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        inMemoryLiveBackup.set(rel, fs.readFileSync(full));
      }
    }

    // Original snapshot manifest for exact verification during rollback
    const rollbackManifest: RiotSessionFileManifestEntry[] = Array.from(
      inMemoryLiveBackup.entries()
    ).map(([rel, buf]) => ({
      relativePath: rel,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      byteSize: buf.length,
    }));

    // Target manifest
    const targetManifest: RiotSessionFileManifestEntry[] = pkg.files.map((f) => ({
      relativePath: f.relativePath,
      sha256: f.sha256,
      byteSize: f.byteSize,
    }));
    const targetRelSet = new Set(targetManifest.map((m) => m.relativePath));

    try {
      // 5. Apply target files directly without external staging directories
      // Documented unavoidable write: writes directly to live files required by Riot Client
      fs.mkdirSync(this.riotDataDir, { recursive: true });

      for (const file of pkg.files) {
        const liveDest = path.join(this.riotDataDir, file.relativePath);
        if (isSymlinkOrReparsePoint(liveDest)) {
          throw new RiotValidationError(
            `Target file location '${liveDest}' is a symlink or reparse point. Prohibited for security.`
          );
        }
        fs.mkdirSync(path.dirname(liveDest), { recursive: true });

        const dataBuf = Buffer.from(file.dataBase64, 'base64');
        const fd = fs.openSync(liveDest, 'w', 0o600);
        try {
          fs.writeFileSync(fd, dataBuf);
          fs.fsyncSync(fd);
        } finally {
          fs.closeSync(fd);
        }
      }

      // 6. Clean up obsolete managed files in Cookies/ and Sessions/ not present in target package
      const managedFilesAfterWrite = this.listCurrentManagedFiles();
      for (const rel of managedFilesAfterWrite) {
        if (!targetRelSet.has(rel)) {
          const full = path.join(this.riotDataDir, rel);
          if (fs.existsSync(full) && fs.statSync(full).isFile()) {
            fs.unlinkSync(full);
          }
        }
      }

      // 7. Post-swap Exact Manifest Verification
      const postVerified = await this.verifySessionFiles(targetManifest);
      if (!postVerified) {
        throw new RiotSessionCorruptedError('Live session directory failed exact manifest verification after swap.');
      }
    } catch (swapErr) {
      // Immediate In-Memory Rollback: restore all previous files exactly and remove newly introduced files
      if (inMemoryLiveBackup.size > 0) {
        try {
          // A. Remove newly introduced managed files not in original state
          const currentFiles = this.listCurrentManagedFiles();
          for (const rel of currentFiles) {
            if (!inMemoryLiveBackup.has(rel)) {
              const full = path.join(this.riotDataDir, rel);
              try {
                if (fs.existsSync(full)) fs.unlinkSync(full);
              } catch {
                // ignore
              }
            }
          }

          // B. Restore every original file from in-memory backup
          for (const [rel, buf] of inMemoryLiveBackup.entries()) {
            const liveDest = path.join(this.riotDataDir, rel);
            fs.mkdirSync(path.dirname(liveDest), { recursive: true });
            fs.writeFileSync(liveDest, buf);
          }

          // C. Verify exact manifest of restored state
          // Treat verifySessionFiles(rollbackManifest) === false as a rollback failure
          const rollbackVerified = await this.verifySessionFiles(rollbackManifest);
          if (!rollbackVerified) {
            throw new RiotSessionCorruptedError(
              'In-memory rollback failed: Restored session files failed exact manifest verification.'
            );
          }
        } catch (rollbackErr) {
          // If in-memory rollback fails, journal remains pending for persistent recovery
          throw rollbackErr instanceof RiotSessionCorruptedError ? rollbackErr : swapErr;
        }
      }
      throw swapErr;
    }
  }

  private restoreFromDirectory(sourceDir: string, relativePrefix = ''): void {
    const items = fs.readdirSync(sourceDir);
    for (const item of items) {
      if (item.startsWith('.')) continue;
      const fullSource = path.join(sourceDir, item);
      const rel = path.join(relativePrefix, item);
      if (fs.statSync(fullSource).isDirectory()) {
        this.restoreFromDirectory(fullSource, rel);
      } else {
        const liveDest = path.join(this.riotDataDir, rel);
        fs.mkdirSync(path.dirname(liveDest), { recursive: true });
        fs.copyFileSync(fullSource, liveDest);
      }
    }
  }

  private safeShredAndRemoveDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) return;
    try {
      const shredRecursive = (targetDir: string) => {
        const entries = fs.readdirSync(targetDir);
        for (const entry of entries) {
          const full = path.join(targetDir, entry);
          if (fs.statSync(full).isDirectory()) {
            shredRecursive(full);
          } else {
            try {
              const size = fs.statSync(full).size;
              if (size > 0) {
                fs.writeFileSync(full, Buffer.alloc(size, 0));
              }
              fs.unlinkSync(full);
            } catch {
              // best effort
            }
          }
        }
      };
      shredRecursive(dirPath);
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }

  /**
   * Scans for persistent uncommitted backup directories left from a legacy interrupted swap.
   * If found, verifies the restored files using the EXACT MANIFEST of the backup directory.
   * Does NOT delete recovery copies based only on structural verification.
   */
  public async recoverInterruptedSwap(operationId?: string): Promise<boolean> {
    if (!fs.existsSync(this.stagingParentDir)) return false;

    try {
      const entries = fs.readdirSync(this.stagingParentDir);
      const prefix = operationId ? `.maswitch_backup_${operationId}` : '.maswitch_backup_';
      const backupDirs = entries.filter((e) =>
        operationId ? e === prefix : e.startsWith('.maswitch_backup_')
      );

      if (backupDirs.length === 0) return false;

      let allVerified = true;
      for (const backupDirName of backupDirs) {
        const backupPath = path.join(this.stagingParentDir, backupDirName);
        if (fs.existsSync(backupPath) && fs.statSync(backupPath).isDirectory()) {
          // Build exact manifest of files present in the backup directory
          const backupManifest: RiotSessionFileManifestEntry[] = [];
          const collectBackupFiles = (dir: string, relPrefix = '') => {
            for (const item of fs.readdirSync(dir)) {
              if (item.startsWith('.')) continue;
              const full = path.join(dir, item);
              const rel = path.join(relPrefix, item).replace(/\\/g, '/');
              const stat = fs.statSync(full);
              if (stat.isDirectory()) {
                collectBackupFiles(full, rel);
              } else if (stat.isFile()) {
                const data = fs.readFileSync(full);
                backupManifest.push({
                  relativePath: rel,
                  sha256: crypto.createHash('sha256').update(data).digest('hex'),
                  byteSize: data.length,
                });
              }
            }
          };
          collectBackupFiles(backupPath);

          if (backupManifest.length === 0) {
            allVerified = false;
            continue; // Cannot verify empty or invalid backup; do NOT delete
          }

          this.restoreFromDirectory(backupPath);

          // Verify using the EXACT manifest of the backup directory (NOT just structural checks)
          const verified = await this.verifySessionFiles(backupManifest);
          if (verified) {
            this.safeShredAndRemoveDir(backupPath);
          } else {
            allVerified = false; // NEVER delete if exact manifest verification fails
          }
        }
      }

      await this.cleanDanglingArtifacts();
      return allVerified;
    } catch {
      return false;
    }
  }

  /**
   * Cleans any orphaned temporary files (.tmp.*) and legacy staging directories left behind.
   * NEVER deletes .maswitch_backup_* recovery directories.
   */
  public async cleanDanglingArtifacts(): Promise<void> {
    const cleanDir = (parent: string) => {
      if (!fs.existsSync(parent)) return;
      try {
        const entries = fs.readdirSync(parent);
        for (const entry of entries) {
          if (entry.startsWith('.maswitch_stage_')) {
            this.safeShredAndRemoveDir(path.join(parent, entry));
          } else if (entry.includes('.tmp.')) {
            try {
              fs.unlinkSync(path.join(parent, entry));
            } catch {
              // best effort
            }
          }
        }
      } catch {
        // best effort
      }
    };

    cleanDir(this.stagingParentDir);
    cleanDir(this.riotDataDir);

    const cookiesDir = path.join(this.riotDataDir, 'Cookies');
    if (fs.existsSync(cookiesDir)) cleanDir(cookiesDir);

    const sessionsDir = path.join(this.riotDataDir, 'Sessions');
    if (fs.existsSync(sessionsDir)) cleanDir(sessionsDir);
  }
}

// --- 3. Windows Process Coordinator ---

export const RIOT_GAME_IMAGE_NAMES = new Set([
  'leagueclient.exe',
  'leagueclientux.exe',
  'league of legends.exe',
  'valorant.exe',
  'valorant-win64-shipping.exe',
  'vgc.exe',
  'lor.exe',
]);

export const RIOT_CLIENT_IMAGE_NAMES = new Set([
  'riotclientservices.exe',
  'riotclientux.exe',
  'riotclientcrashhandler.exe',
]);

export class RiotWindowsProcessCoordinator implements RiotProcessCoordinator {
  private readonly processLister: () => Promise<RunningProcessEntry[]>;
  private readonly commandExecutor: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  private readonly clientLauncher: (executablePath: string) => Promise<void>;
  private readonly graceTimeoutMs: number;
  private readonly riotClientExecutablePath: string;

  constructor(options?: {
    processLister?: () => Promise<RunningProcessEntry[]>;
    commandExecutor?: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
    clientLauncher?: (executablePath: string) => Promise<void>;
    graceTimeoutMs?: number;
    riotClientExecutablePath?: string;
  }) {
    this.processLister = options?.processLister || listWindowsProcessImageNames;
    this.commandExecutor =
      options?.commandExecutor ||
      (async (cmd, args) => execFileAsync(cmd, args, { windowsHide: true, timeout: 5000 }));
    this.clientLauncher =
      options?.clientLauncher ||
      (async (exePath) => {
        spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref();
      });
    this.graceTimeoutMs = options?.graceTimeoutMs ?? 3000;
    this.riotClientExecutablePath =
      options?.riotClientExecutablePath ||
      'C:\\Riot Games\\Riot Client\\RiotClientServices.exe';
  }

  /**
   * Safely checks whether any Riot game process is currently running.
   * If process enumeration throws an error, FAILS CLOSED by throwing RiotProcessDetectionError.
   */
  public async isGameRunning(): Promise<boolean> {
    let processes: RunningProcessEntry[];
    try {
      processes = await this.processLister();
    } catch (err) {
      throw new RiotProcessDetectionError(
        `Failed to enumerate running processes: ${err instanceof Error ? err.message : String(err)}. Aborting operation for safety.`
      );
    }
    return processes.some((p) => RIOT_GAME_IMAGE_NAMES.has(p.imageNameLower));
  }

  /**
   * Safely checks whether Riot Client is currently running.
   * If process enumeration throws an error, FAILS CLOSED by throwing RiotProcessDetectionError.
   */
  public async isClientRunning(): Promise<boolean> {
    let processes: RunningProcessEntry[];
    try {
      processes = await this.processLister();
    } catch (err) {
      throw new RiotProcessDetectionError(
        `Failed to enumerate running processes: ${err instanceof Error ? err.message : String(err)}. Aborting operation for safety.`
      );
    }
    return processes.some((p) => RIOT_CLIENT_IMAGE_NAMES.has(p.imageNameLower));
  }

  /**
   * Requests graceful termination of Riot Client without /F.
   */
  public async requestGracefulShutdown(): Promise<boolean> {
    if (!(await this.isClientRunning())) {
      return true;
    }

    if (await this.isGameRunning()) {
      return false;
    }

    try {
      await this.commandExecutor('taskkill.exe', ['/IM', 'RiotClientServices.exe']);
    } catch {
      // taskkill returns non-zero if already exiting or window not found
    }

    const startTime = Date.now();
    while (Date.now() - startTime < this.graceTimeoutMs) {
      if (!(await this.isClientRunning())) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    return !(await this.isClientRunning());
  }

  public async launchClient(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      if (!fs.existsSync(this.riotClientExecutablePath)) {
        throw new RiotStorageError(
          `Riot Client executable not found at '${this.riotClientExecutablePath}'.`
        );
      }
    }
    await this.clientLauncher(this.riotClientExecutablePath);
  }
}

// --- 4. Factory for Production Riot Live Switching Engine ---

export interface ProductionRiotLiveSwitchingEngineOptions {
  userDataDir: string;
  riotLiveSwitchingEnabled: boolean;
  riotDataDir?: string;
  riotClientExecutablePath?: string;
  safeStorageOverride?: SafeStorageLike | null;
  allowInsecureTestCipher?: boolean;
  processLister?: () => Promise<RunningProcessEntry[]>;
  commandExecutor?: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  clientLauncher?: (executablePath: string) => Promise<void>;
}

export function createProductionRiotLiveSwitchingEngine(
  options: ProductionRiotLiveSwitchingEngineOptions
): {
  engine: RiotLiveSwitchingEngine;
  vault: RiotWindowsSessionVault;
  storage: RiotWindowsSessionStorage;
  processCoordinator: RiotWindowsProcessCoordinator;
} {
  const vaultDir = path.join(options.userDataDir, 'vault', 'riot');
  const journalFilePath = path.join(vaultDir, 'journal.json');
  const stagingParentDir = path.join(vaultDir, 'staging');

  const vault = new RiotWindowsSessionVault(vaultDir, {
    safeStorageOverride: options.safeStorageOverride,
    allowInsecureTestCipher: options.allowInsecureTestCipher ?? false,
  });

  const storage = new RiotWindowsSessionStorage(options.riotDataDir, stagingParentDir);

  const processCoordinator = new RiotWindowsProcessCoordinator({
    processLister: options.processLister,
    commandExecutor: options.commandExecutor,
    clientLauncher: options.clientLauncher,
    riotClientExecutablePath: options.riotClientExecutablePath,
  });

  const engine = new RiotLiveSwitchingEngine(
    {
      enabled: options.riotLiveSwitchingEnabled,
      journalFilePath,
    },
    processCoordinator,
    vault,
    storage
  );

  return { engine, vault, storage, processCoordinator };
}
