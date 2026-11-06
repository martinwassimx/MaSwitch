import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { safeStorage } from 'electron';
import { enforceSecureDirectoryPermissionsSync } from './riotProductionAdapters';

export interface SavedCredentialPayload {
  version: 1;
  profileId: string;
  username: string;
  password: string;
  updatedAtIso: string;
}

export interface CredentialStatusInfo {
  hasSavedCredentials: boolean;
  username?: string;
  updatedAtIso?: string;
}

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface RiotCredentialVaultOptions {
  safeStorageOverride?: SafeStorageLike | null;
  allowInsecureTestCipher?: boolean;
}

type EncryptionScheme = 'dpapi' | 'aes-gcm-test';

/**
 * On-disk envelope. `payloadSha256` exists only in legacy records: it was an unsalted
 * digest of the plaintext payload and acted as an offline password-guessing oracle.
 * New records never write it; `migrateLegacyEnvelopes` strips it without decrypting.
 */
interface CredentialEnvelope {
  format: 'MS_CRED_V1';
  profileId: string;
  encryptionScheme: EncryptionScheme;
  ciphertextBase64: string;
  usernameCiphertextBase64?: string;
  payloadSha256?: string;
  updatedAtIso: string;
}

const CRED_FILE_SUFFIX = '.cred.enc';

export class RiotCredentialVault {
  private readonly vaultDir: string;
  private readonly safeStorageClient: SafeStorageLike | null;
  private readonly allowInsecureTestCipher: boolean;
  private readonly fallbackKey: Buffer;

  constructor(vaultDir: string, options?: RiotCredentialVaultOptions) {
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

    const salt = `${process.env.COMPUTERNAME || 'M'}-${process.env.USERNAME || 'U'}-maswitch-cred-salt`;
    this.fallbackKey = crypto.scryptSync(salt, 'maswitch-riot-cred-scrypt-salt', 32);
  }

  public getVaultDir(): string {
    return this.vaultDir;
  }

  private validateProfileId(profileId: string): void {
    if (!profileId || typeof profileId !== 'string') {
      throw new Error('Profile ID must be a non-empty string.');
    }
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(profileId) || profileId.includes('..')) {
      throw new Error(`Invalid profile ID '${profileId}'. Must be alphanumeric under 64 chars.`);
    }
  }

  private getFilePath(profileId: string): string {
    this.validateProfileId(profileId);
    return path.join(this.vaultDir, `${profileId}${CRED_FILE_SUFFIX}`);
  }

  private hasDpapi(): boolean {
    return Boolean(this.safeStorageClient && this.safeStorageClient.isEncryptionAvailable());
  }

  private encrypt(plainText: string): { buffer: Buffer; scheme: EncryptionScheme } {
    if (this.hasDpapi()) {
      return { buffer: this.safeStorageClient!.encryptString(plainText), scheme: 'dpapi' };
    }
    if (!this.allowInsecureTestCipher) {
      throw new Error(
        'Windows DPAPI encryption is not available on this system. Cannot securely store credentials.'
      );
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.fallbackKey, iv);
    const enc = Buffer.concat([cipher.update(Buffer.from(plainText, 'utf8')), cipher.final()]);
    return { buffer: Buffer.concat([iv, cipher.getAuthTag(), enc]), scheme: 'aes-gcm-test' };
  }

  private decrypt(ciphertext: Buffer, scheme: EncryptionScheme): string {
    if (scheme === 'dpapi') {
      if (!this.hasDpapi()) {
        throw new Error('Windows DPAPI is unavailable to decrypt credentials.');
      }
      return this.safeStorageClient!.decryptString(ciphertext);
    }
    if (scheme === 'aes-gcm-test') {
      if (!this.allowInsecureTestCipher) {
        throw new Error('Fallback cipher is disabled in production.');
      }
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.fallbackKey, ciphertext.subarray(0, 12));
      decipher.setAuthTag(ciphertext.subarray(12, 28));
      return Buffer.concat([decipher.update(ciphertext.subarray(28)), decipher.final()]).toString('utf8');
    }
    throw new Error(`Unsupported encryption scheme: ${String(scheme)}`);
  }

  private readEnvelope(profileId: string): CredentialEnvelope | null {
    const filePath = this.getFilePath(profileId);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const envelope = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CredentialEnvelope;
    if (
      envelope.format !== 'MS_CRED_V1' ||
      envelope.profileId !== profileId ||
      typeof envelope.ciphertextBase64 !== 'string'
    ) {
      throw new Error('Credential envelope corrupted or mismatched profile ID.');
    }
    return envelope;
  }

  /** Atomic replace so an interrupted write never destroys an existing record. */
  private writeEnvelope(profileId: string, envelope: CredentialEnvelope): void {
    const destPath = this.getFilePath(profileId);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const tempPath = `${destPath}.${crypto.randomUUID()}.tmp`;
    const fd = fs.openSync(tempPath, 'w', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(envelope, null, 2), 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.renameSync(tempPath, destPath);
    } catch (err) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // best effort
      }
      throw err;
    }
  }

  private decryptUsernameField(envelope: CredentialEnvelope): string | undefined {
    if (!envelope.usernameCiphertextBase64) {
      return undefined;
    }
    const parsed = JSON.parse(
      this.decrypt(Buffer.from(envelope.usernameCiphertextBase64, 'base64'), envelope.encryptionScheme)
    ) as { profileId?: string; username?: string };
    if (parsed.profileId !== envelope.profileId || typeof parsed.username !== 'string') {
      throw new Error('Credential username field mismatched profile ID.');
    }
    return parsed.username;
  }

  private decryptPayload(envelope: CredentialEnvelope): SavedCredentialPayload {
    const plainText = this.decrypt(
      Buffer.from(envelope.ciphertextBase64, 'base64'),
      envelope.encryptionScheme
    );
    if (envelope.payloadSha256 !== undefined) {
      const legacyHash = crypto.createHash('sha256').update(plainText).digest('hex');
      if (legacyHash !== envelope.payloadSha256) {
        throw new Error('Credential integrity check failed: payload checksum mismatch.');
      }
    }
    const payload = JSON.parse(plainText) as SavedCredentialPayload;
    if (payload.version !== 1 || payload.profileId !== envelope.profileId) {
      throw new Error('Credential payload mismatched profile ID.');
    }
    return payload;
  }

  public async hasCredentials(profileId: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(profileId);
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Status for UI rendering. Never decrypts the password. For legacy records that lack
   * the separately encrypted username, `resolveLegacyUsername` decrypts that single
   * record once (explicit per-profile request) and upgrades it in place.
   */
  public async getCredentialStatus(
    profileId: string,
    options?: { resolveLegacyUsername?: boolean }
  ): Promise<CredentialStatusInfo> {
    try {
      const envelope = this.readEnvelope(profileId);
      if (!envelope) {
        return { hasSavedCredentials: false };
      }

      let username = this.decryptUsernameField(envelope);
      if (username === undefined && options?.resolveLegacyUsername) {
        username = this.upgradeLegacyRecord(envelope);
      }

      return {
        hasSavedCredentials: true,
        username,
        updatedAtIso: envelope.updatedAtIso,
      };
    } catch {
      return { hasSavedCredentials: false };
    }
  }

  private upgradeLegacyRecord(envelope: CredentialEnvelope): string | undefined {
    try {
      const payload = this.decryptPayload(envelope);
      const usernameField = this.encrypt(
        JSON.stringify({ profileId: envelope.profileId, username: payload.username })
      );
      if (usernameField.scheme === envelope.encryptionScheme) {
        const upgraded: CredentialEnvelope = { ...envelope };
        delete upgraded.payloadSha256;
        upgraded.usernameCiphertextBase64 = usernameField.buffer.toString('base64');
        this.writeEnvelope(envelope.profileId, upgraded);
      }
      return payload.username;
    } catch {
      return undefined;
    }
  }

  public async listAllCredentialStatuses(): Promise<Record<string, CredentialStatusInfo>> {
    const result: Record<string, CredentialStatusInfo> = {};
    if (!fs.existsSync(this.vaultDir)) return result;

    try {
      const files = fs.readdirSync(this.vaultDir);
      for (const file of files) {
        if (file.endsWith(CRED_FILE_SUFFIX)) {
          const profileId = file.slice(0, -CRED_FILE_SUFFIX.length);
          result[profileId] = await this.getCredentialStatus(profileId);
        }
      }
    } catch {
      // return whatever was gathered
    }

    return result;
  }

  /**
   * Removes the legacy `payloadSha256` field from existing records. Ciphertext is copied
   * verbatim, so nothing is decrypted. Returns the number of records rewritten.
   */
  public migrateLegacyEnvelopes(): { migrated: number; failed: number } {
    let migrated = 0;
    let failed = 0;
    if (!fs.existsSync(this.vaultDir)) return { migrated, failed };

    for (const file of fs.readdirSync(this.vaultDir)) {
      if (!file.endsWith(CRED_FILE_SUFFIX)) continue;
      const profileId = file.slice(0, -CRED_FILE_SUFFIX.length);
      try {
        const envelope = this.readEnvelope(profileId);
        if (!envelope || envelope.payloadSha256 === undefined) continue;
        const upgraded: CredentialEnvelope = { ...envelope };
        delete upgraded.payloadSha256;
        this.writeEnvelope(profileId, upgraded);
        migrated++;
      } catch {
        failed++;
      }
    }
    return { migrated, failed };
  }

  public async saveCredentials(
    profileId: string,
    username: string,
    password: string
  ): Promise<{ success: boolean; updatedAtIso: string }> {
    this.validateProfileId(profileId);

    if (!username || typeof username !== 'string' || !username.trim()) {
      throw new Error('Username must be a non-empty string.');
    }
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string.');
    }

    const updatedAtIso = new Date().toISOString();
    const trimmedUsername = username.trim();
    const payload: SavedCredentialPayload = {
      version: 1,
      profileId,
      username: trimmedUsername,
      password,
      updatedAtIso,
    };

    const payloadCipher = this.encrypt(JSON.stringify(payload));
    const usernameCipher = this.encrypt(JSON.stringify({ profileId, username: trimmedUsername }));

    this.writeEnvelope(profileId, {
      format: 'MS_CRED_V1',
      profileId,
      encryptionScheme: payloadCipher.scheme,
      ciphertextBase64: payloadCipher.buffer.toString('base64'),
      usernameCiphertextBase64: usernameCipher.buffer.toString('base64'),
      updatedAtIso,
    });

    return { success: true, updatedAtIso };
  }

  /** Main-process only (autofill). Must never be exposed over IPC. */
  public async getDecryptedCredentials(
    profileId: string
  ): Promise<{ username: string; password: string; updatedAtIso: string } | null> {
    this.validateProfileId(profileId);
    try {
      const envelope = this.readEnvelope(profileId);
      if (!envelope) {
        return null;
      }
      const payload = this.decryptPayload(envelope);
      return {
        username: payload.username,
        password: payload.password,
        updatedAtIso: payload.updatedAtIso,
      };
    } catch {
      return null;
    }
  }

  public async deleteCredentials(profileId: string): Promise<boolean> {
    try {
      this.validateProfileId(profileId);
      const destPath = this.getFilePath(profileId);
      if (!fs.existsSync(destPath)) {
        return false;
      }

      // Secure wipe before unlinking
      try {
        const size = fs.statSync(destPath).size;
        if (size > 0) {
          fs.writeFileSync(destPath, Buffer.alloc(size, 0));
        }
      } catch {
        // best effort overwrite
      }

      fs.unlinkSync(destPath);
      return true;
    } catch {
      return false;
    }
  }
}
