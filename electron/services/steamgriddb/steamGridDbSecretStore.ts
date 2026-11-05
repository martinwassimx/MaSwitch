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

      // 2. Fallback decryption for test or non-DPAPI environments
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
        return this.cachedApiKey;
      }

      return null;
    } catch {
      return null;
    }
  }

  public saveApiKey(apiKey: string): boolean {
    const trimmed = (apiKey || '').trim();
    if (!trimmed) {
      return this.removeApiKey();
    }

    try {
      // 1. Try Electron safeStorage (DPAPI on Windows)
      if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(trimmed);
        fs.writeFileSync(this.secretFilePath, encrypted);
        this.cachedApiKey = trimmed;
        return true;
      }

      // 2. Fallback encryption for test environments
      const cipher = crypto.createCipheriv(
        'aes-256-cbc',
        crypto.scryptSync('maswitch-local-secret-salt', 'salt', 32),
        Buffer.alloc(16, 0)
      );
      let encrypted = cipher.update(trimmed, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      fs.writeFileSync(this.secretFilePath, `fb:${encrypted}`, 'utf8');
      this.cachedApiKey = trimmed;
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

