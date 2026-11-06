import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { safeStorage } from 'electron';

export class SteamGridDbSecretStore {
  private readonly secretFilePath: string;
  private readonly secretDir: string;
  private cachedApiKey: string | null = null;

  constructor(userDataDir: string) {
    this.secretDir = path.join(userDataDir, 'secrets');
    this.secretFilePath = path.join(this.secretDir, 'steamgriddb.enc');

    try {
      fs.mkdirSync(this.secretDir, { recursive: true });
    } catch {
      // Ignore directory creation errors
    }
  }

  public hasApiKey(): boolean {
    return this.getApiKey() !== null;
  }

  public getApiKey(): string | null {
    if (this.cachedApiKey) {
      return this.cachedApiKey;
    }

    if (!fs.existsSync(this.secretFilePath)) {
      return null;
    }

    try {
      const encryptedBuffer = fs.readFileSync(this.secretFilePath);
      if (encryptedBuffer.length === 0) {
        return null;
      }

      // 1. Try Electron safeStorage (DPAPI on Windows)
      if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
        try {
          const decrypted = safeStorage.decryptString(encryptedBuffer);
          if (decrypted && decrypted.trim().length > 0) {
            this.cachedApiKey = decrypted.trim();
            return this.cachedApiKey;
          }
        } catch {
          // If safeStorage failed, fallback below
        }
      }

      // 2. Legacy read-only format written by older versions with a fixed key (obfuscation, not encryption).
      // It is migrated to DPAPI when available; new keys are never written in this format.
      const raw = encryptedBuffer.toString('utf8');
      if (raw.startsWith('fb:')) {
        const payload = raw.slice(3);
        const decipher = crypto.createDecipheriv(
          'aes-256-cbc',
          crypto.scryptSync('maswitch-local-secret-salt', 'salt', 32),
          Buffer.alloc(16, 0)
        );
        let decrypted = decipher.update(payload, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        this.cachedApiKey = decrypted.trim();
        if (this.isSecureStorageAvailable()) {
          this.writeProtected(this.cachedApiKey);
        }
        return this.cachedApiKey;
      }

      return null;
    } catch {
      return null;
    }
  }

  public isSecureStorageAvailable(): boolean {
    try {
      return Boolean(
        safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()
      );
    } catch {
      return false;
    }
  }

  /**
   * Persists the key with DPAPI. Without DPAPI the key is kept for this session only and
   * `false` is returned, so a weakly protected copy is never written to disk.
   */
  public saveApiKey(apiKey: string): boolean {
    const trimmed = (apiKey || '').trim();
    if (!trimmed) {
      return this.removeApiKey();
    }

    this.cachedApiKey = trimmed;
    if (!this.isSecureStorageAvailable()) {
      return false;
    }
    return this.writeProtected(trimmed);
  }

  private writeProtected(apiKey: string): boolean {
    try {
      const encrypted = safeStorage.encryptString(apiKey);
      const tempPath = `${this.secretFilePath}.tmp-${process.pid}`;
      fs.writeFileSync(tempPath, encrypted, { mode: 0o600 });
      fs.renameSync(tempPath, this.secretFilePath);
      return true;
    } catch {
      return false;
    }
  }

  public removeApiKey(): boolean {
    this.cachedApiKey = null;
    if (fs.existsSync(this.secretFilePath)) {
      try {
        fs.unlinkSync(this.secretFilePath);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }
}

