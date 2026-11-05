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
    return path.join(this.vaultDir, `${profileId}.cred.enc`);
  }

  public async hasCredentials(profileId: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(profileId);
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  public async getCredentialStatus(profileId: string): Promise<CredentialStatusInfo> {
    try {
      this.validateProfileId(profileId);
      const filePath = this.getFilePath(profileId);
      if (!fs.existsSync(filePath)) {
        return { hasSavedCredentials: false };
      }

      // Read decrypted metadata to get username and updatedAtIso, without returning the password
      const creds = await this.getDecryptedCredentials(profileId);
      if (!creds) {
        return { hasSavedCredentials: false };
      }

      return {
        hasSavedCredentials: true,
        username: creds.username,
        updatedAtIso: creds.updatedAtIso,
      };
    } catch {
      return { hasSavedCredentials: false };
    }
  }

  public async listAllCredentialStatuses(): Promise<Record<string, CredentialStatusInfo>> {
    const result: Record<string, CredentialStatusInfo> = {};
    if (!fs.existsSync(this.vaultDir)) return result;

    try {
      const files = fs.readdirSync(this.vaultDir);
      for (const file of files) {
        if (file.endsWith('.cred.enc')) {
          const profileId = file.slice(0, -'.cred.enc'.length);
          const status = await this.getCredentialStatus(profileId);
          result[profileId] = status;
        }
      }
    } catch {
      // return whatever was gathered
    }

    return result;
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

    const hasDpapi = Boolean(
      this.safeStorageClient && this.safeStorageClient.isEncryptionAvailable()
    );

    if (!hasDpapi && !this.allowInsecureTestCipher) {
      throw new Error(
        'Windows DPAPI encryption is not available on this system. Cannot securely store credentials.'
      );
    }

    const updatedAtIso = new Date().toISOString();
    const payload: SavedCredentialPayload = {
      version: 1,
      profileId,
      username: username.trim(),
      password,
      updatedAtIso,
    };

    const plainText = JSON.stringify(payload);
    let encryptedBuffer: Buffer;
    let encryptionScheme: 'dpapi' | 'aes-gcm-test';

    if (hasDpapi) {
      encryptedBuffer = this.safeStorageClient!.encryptString(plainText);
      encryptionScheme = 'dpapi';
    } else {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.fallbackKey, iv);
      const enc = Buffer.concat([cipher.update(Buffer.from(plainText, 'utf8')), cipher.final()]);
      const tag = cipher.getAuthTag();
      encryptedBuffer = Buffer.concat([iv, tag, enc]);
      encryptionScheme = 'aes-gcm-test';
    }

    const envelope = {
      format: 'MS_CRED_V1',
      profileId,
      encryptionScheme,
      payloadSha256: crypto.createHash('sha256').update(plainText).digest('hex'),
      ciphertextBase64: encryptedBuffer.toString('base64'),
      updatedAtIso,
    };

    const destPath = this.getFilePath(profileId);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    // Write file with restricted permissions
    const jsonStr = JSON.stringify(envelope, null, 2);
    const fd = fs.openSync(destPath, 'w', 0o600);
    try {
      fs.writeFileSync(fd, jsonStr, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    return { success: true, updatedAtIso };
  }

  public async getDecryptedCredentials(
    profileId: string
  ): Promise<{ username: string; password: string; updatedAtIso: string } | null> {
    this.validateProfileId(profileId);
    const destPath = this.getFilePath(profileId);

    if (!fs.existsSync(destPath)) {
      return null;
    }

    try {
      const envelopeRaw = fs.readFileSync(destPath, 'utf8');
      const envelope = JSON.parse(envelopeRaw) as {
        format: string;
        profileId: string;
        encryptionScheme: 'dpapi' | 'aes-gcm-test';
        payloadSha256: string;
        ciphertextBase64: string;
        updatedAtIso: string;
      };

      if (envelope.format !== 'MS_CRED_V1' || envelope.profileId !== profileId) {
        throw new Error('Credential envelope corrupted or mismatched profile ID.');
      }

      const ciphertext = Buffer.from(envelope.ciphertextBase64, 'base64');
      let plainText: string;

      if (envelope.encryptionScheme === 'dpapi') {
        if (!this.safeStorageClient || !this.safeStorageClient.isEncryptionAvailable()) {
          throw new Error('Windows DPAPI is unavailable to decrypt credentials.');
        }
        plainText = this.safeStorageClient.decryptString(ciphertext);
      } else if (envelope.encryptionScheme === 'aes-gcm-test') {
        if (!this.allowInsecureTestCipher) {
          throw new Error('Fallback cipher is disabled in production.');
        }
        const iv = ciphertext.subarray(0, 12);
        const tag = ciphertext.subarray(12, 28);
        const encData = ciphertext.subarray(28);
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.fallbackKey, iv);
        decipher.setAuthTag(tag);
        plainText = Buffer.concat([decipher.update(encData), decipher.final()]).toString('utf8');
      } else {
        throw new Error(`Unsupported encryption scheme: ${envelope.encryptionScheme}`);
      }

      const hash = crypto.createHash('sha256').update(plainText).digest('hex');
      if (hash !== envelope.payloadSha256) {
        throw new Error('Credential integrity check failed: payload checksum mismatch.');
      }

      const payload = JSON.parse(plainText) as SavedCredentialPayload;
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

