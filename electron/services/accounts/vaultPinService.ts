import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { safeStorage } from 'electron';
import { enforceSecureDirectoryPermissionsSync } from './riotProductionAdapters';
import type { SafeStorageLike } from './riotCredentialVault';
import type { VaultPinOperationResult, VaultPinStatus } from '../../../src/shared/types/vaultPin';

export interface VaultPinServiceOptions {
  safeStorageOverride?: SafeStorageLike | null;
  allowInsecureTestCipher?: boolean;
  nowFn?: () => number;
}

type PinStorageScheme = 'dpapi' | 'aes-gcm-test';

interface StoredPinSecret {
  version: 1;
  saltBase64: string;
  derivedKeyBase64: string;
  updatedAtIso: string;
}

interface StoredPinEnvelope {
  format: 'MS_PIN_V1';
  scheme: PinStorageScheme;
  ciphertextBase64: string;
  failedAttempts: number;
  lockedUntilMs: number | null;
  updatedAtIso: string;
}

const PIN_FILE_NAME = 'vault-pin.enc.json';
const PIN_REGEX = /^\d{4,6}$/;
const MAX_ATTEMPTS_BEFORE_LOCKOUT = 5;
const BASE_LOCKOUT_MS = 30_000;

export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === 'string' && PIN_REGEX.test(pin);
}

export class VaultPinLockedError extends Error {
  public readonly code = 'PIN_LOCKED';
  constructor(message = 'Enter your PIN code to unlock saved passwords first.') {
    super(message);
    this.name = 'VaultPinLockedError';
  }
}

export class VaultPinService {
  private readonly vaultDir: string;
  private readonly filePath: string;
  private readonly safeStorageClient: SafeStorageLike | null;
  private readonly allowInsecureTestCipher: boolean;
  private readonly fallbackKey: Buffer;
  private readonly now: () => number;
  private unlocked = false;

  constructor(vaultDir: string, options?: VaultPinServiceOptions) {
    this.vaultDir = path.resolve(vaultDir);
    enforceSecureDirectoryPermissionsSync(this.vaultDir);
    this.filePath = path.join(this.vaultDir, PIN_FILE_NAME);
    this.allowInsecureTestCipher = options?.allowInsecureTestCipher ?? false;
    this.now = options?.nowFn ?? (() => Date.now());

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

    const salt = `${process.env.COMPUTERNAME || 'M'}-${process.env.USERNAME || 'U'}-maswitch-pin-salt`;
    this.fallbackKey = crypto.scryptSync(salt, 'maswitch-vault-pin-scrypt-salt', 32);
  }

  private hasDpapi(): boolean {
    return Boolean(this.safeStorageClient && this.safeStorageClient.isEncryptionAvailable());
  }

  private encrypt(plainText: string): { buffer: Buffer; scheme: PinStorageScheme } {
    if (this.hasDpapi()) {
      return { buffer: this.safeStorageClient!.encryptString(plainText), scheme: 'dpapi' };
    }
    if (!this.allowInsecureTestCipher) {
      throw new Error('Windows DPAPI encryption is unavailable to protect the vault PIN.');
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.fallbackKey, iv);
    const enc = Buffer.concat([cipher.update(Buffer.from(plainText, 'utf8')), cipher.final()]);
    return { buffer: Buffer.concat([iv, cipher.getAuthTag(), enc]), scheme: 'aes-gcm-test' };
  }

  private decrypt(ciphertext: Buffer, scheme: PinStorageScheme): string {
    if (scheme === 'dpapi') {
      if (!this.hasDpapi()) {
        throw new Error('Windows DPAPI is unavailable to verify the vault PIN.');
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
    throw new Error(`Unsupported PIN encryption scheme: ${String(scheme)}`);
  }

  private readEnvelope(): StoredPinEnvelope | null {
    if (!fs.existsSync(this.filePath)) {
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as StoredPinEnvelope;
    if (parsed.format !== 'MS_PIN_V1' || typeof parsed.ciphertextBase64 !== 'string') {
      throw new Error('Vault PIN configuration file is corrupted.');
    }
    return parsed;
  }

  private writeEnvelope(envelope: StoredPinEnvelope): void {
    fs.mkdirSync(this.vaultDir, { recursive: true });
    const tempPath = `${this.filePath}.${crypto.randomUUID()}.tmp`;
    const fd = fs.openSync(tempPath, 'w', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(envelope, null, 2), 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // best effort
      }
      throw err;
    }
  }

  private derivePinVerifier(pin: string, salt: Buffer): Buffer {
    return crypto.scryptSync(pin, salt, 64, { N: 16384, r: 8, p: 1 });
  }

  private createSecretEnvelope(pin: string): StoredPinEnvelope {
    const salt = crypto.randomBytes(32);
    const derived = this.derivePinVerifier(pin, salt);
    const updatedAtIso = new Date(this.now()).toISOString();
    const secret: StoredPinSecret = {
      version: 1,
      saltBase64: salt.toString('base64'),
      derivedKeyBase64: derived.toString('base64'),
      updatedAtIso,
    };
    const encrypted = this.encrypt(JSON.stringify(secret));
    return {
      format: 'MS_PIN_V1',
      scheme: encrypted.scheme,
      ciphertextBase64: encrypted.buffer.toString('base64'),
      failedAttempts: 0,
      lockedUntilMs: null,
      updatedAtIso,
    };
  }

  public isPinConfigured(): boolean {
    try {
      return this.readEnvelope() !== null;
    } catch {
      return true; // Fail closed if corrupted
    }
  }

  public isSessionUnlocked(): boolean {
    return this.unlocked;
  }

  public isAuthorized(): boolean {
    return this.isPinConfigured() && this.unlocked;
  }

  public assertUnlocked(): void {
    if (!this.isPinConfigured()) {
      throw new VaultPinLockedError('Set up your 4–6 digit PIN code first to protect and use saved passwords.');
    }
    if (!this.unlocked) {
      throw new VaultPinLockedError('Passwords are locked. Enter your PIN code to use saved passwords.');
    }
  }

  public getStatus(): VaultPinStatus {
    try {
      const envelope = this.readEnvelope();
      if (!envelope) {
        return {
          isConfigured: false,
          isUnlocked: false,
          failedAttempts: 0,
          lockedUntilIso: null,
        };
      }
      const nowMs = this.now();
      const activeLockMs =
        typeof envelope.lockedUntilMs === 'number' && envelope.lockedUntilMs > nowMs
          ? envelope.lockedUntilMs
          : null;
      return {
        isConfigured: true,
        isUnlocked: this.unlocked,
        failedAttempts: Number(envelope.failedAttempts ?? 0),
        lockedUntilIso: activeLockMs ? new Date(activeLockMs).toISOString() : null,
      };
    } catch {
      return {
        isConfigured: true,
        isUnlocked: false,
        failedAttempts: 0,
        lockedUntilIso: null,
      };
    }
  }

  public setupPin(pin: unknown): VaultPinOperationResult {
    if (this.isPinConfigured()) {
      return {
        success: false,
        message: 'A PIN code is already configured. Use Change PIN instead.',
        status: this.getStatus(),
        errorCode: 'ALREADY_CONFIGURED',
      };
    }
    if (!isValidPinFormat(pin)) {
      return {
        success: false,
        message: 'PIN must be 4 to 6 digits (numbers 0–9).',
        status: this.getStatus(),
        errorCode: 'INVALID_PIN_FORMAT',
      };
    }

    const envelope = this.createSecretEnvelope(pin);
    this.writeEnvelope(envelope);
    this.unlocked = true;

    return {
      success: true,
      message: 'PIN code set! Your saved passwords are now unlocked for this session.',
      status: this.getStatus(),
    };
  }

  private verifyAgainstEnvelope(pin: string, envelope: StoredPinEnvelope): VaultPinOperationResult {
    const nowMs = this.now();
    if (typeof envelope.lockedUntilMs === 'number' && envelope.lockedUntilMs > nowMs) {
      const remainingSec = Math.max(1, Math.ceil((envelope.lockedUntilMs - nowMs) / 1000));
      return {
        success: false,
        message: `Too many wrong attempts. Please wait ${remainingSec}s before trying again.`,
        status: this.getStatus(),
        errorCode: 'RATE_LIMITED',
      };
    }

    if (!isValidPinFormat(pin)) {
      return {
        success: false,
        message: 'PIN must be 4 to 6 digits (numbers 0–9).',
        status: this.getStatus(),
        errorCode: 'INVALID_PIN_FORMAT',
      };
    }

    const secretJson = this.decrypt(Buffer.from(envelope.ciphertextBase64, 'base64'), envelope.scheme);
    const secret = JSON.parse(secretJson) as StoredPinSecret;
    const salt = Buffer.from(secret.saltBase64, 'base64');
    const expected = Buffer.from(secret.derivedKeyBase64, 'base64');
    const candidate = this.derivePinVerifier(pin, salt);

    const matches =
      expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);

    if (!matches) {
      const nextFailed = Number(envelope.failedAttempts ?? 0) + 1;
      let lockedUntilMs: number | null = null;
      if (nextFailed >= MAX_ATTEMPTS_BEFORE_LOCKOUT) {
        const extraBatches = Math.floor((nextFailed - MAX_ATTEMPTS_BEFORE_LOCKOUT) / 3);
        const penaltyMs = Math.min(BASE_LOCKOUT_MS * Math.pow(2, extraBatches), 10 * 60_000);
        lockedUntilMs = nowMs + penaltyMs;
      }
      this.writeEnvelope({
        ...envelope,
        failedAttempts: nextFailed,
        lockedUntilMs,
      });

      const remainingBeforeLock = MAX_ATTEMPTS_BEFORE_LOCKOUT - nextFailed;
      const msg = lockedUntilMs
        ? `Incorrect PIN. Too many attempts — locked for ${Math.ceil((lockedUntilMs - nowMs) / 1000)}s.`
        : `Incorrect PIN (${remainingBeforeLock} ${remainingBeforeLock === 1 ? 'attempt' : 'attempts'} left before cooldown).`;

      return {
        success: false,
        message: msg,
        status: this.getStatus(),
        errorCode: lockedUntilMs ? 'RATE_LIMITED' : 'WRONG_PIN',
      };
    }

    if (envelope.failedAttempts > 0 || envelope.lockedUntilMs !== null) {
      this.writeEnvelope({
        ...envelope,
        failedAttempts: 0,
        lockedUntilMs: null,
      });
    }

    return {
      success: true,
      message: 'Passwords unlocked.',
      status: this.getStatus(),
    };
  }

  public unlock(pin: unknown): VaultPinOperationResult {
    let envelope: StoredPinEnvelope | null;
    try {
      envelope = this.readEnvelope();
    } catch {
      return {
        success: false,
        message: 'PIN vault configuration could not be read.',
        status: this.getStatus(),
        errorCode: 'WRONG_PIN',
      };
    }

    if (!envelope) {
      return {
        success: false,
        message: 'No PIN code is set yet. Please create a PIN first.',
        status: this.getStatus(),
        errorCode: 'NOT_CONFIGURED',
      };
    }

    const check = this.verifyAgainstEnvelope(typeof pin === 'string' ? pin : '', envelope);
    if (!check.success) {
      return check;
    }

    this.unlocked = true;
    return {
      success: true,
      message: 'Passwords unlocked for this session.',
      status: this.getStatus(),
    };
  }

  public lock(): VaultPinStatus {
    this.unlocked = false;
    return this.getStatus();
  }

  public changePin(currentPin: unknown, newPin: unknown): VaultPinOperationResult {
    let envelope: StoredPinEnvelope | null;
    try {
      envelope = this.readEnvelope();
    } catch {
      return {
        success: false,
        message: 'PIN vault configuration could not be read.',
        status: this.getStatus(),
        errorCode: 'WRONG_PIN',
      };
    }

    if (!envelope) {
      return {
        success: false,
        message: 'No PIN code is set yet.',
        status: this.getStatus(),
        errorCode: 'NOT_CONFIGURED',
      };
    }

    if (!isValidPinFormat(newPin)) {
      return {
        success: false,
        message: 'New PIN must be 4 to 6 digits (numbers 0–9).',
        status: this.getStatus(),
        errorCode: 'INVALID_PIN_FORMAT',
      };
    }

    const check = this.verifyAgainstEnvelope(typeof currentPin === 'string' ? currentPin : '', envelope);
    if (!check.success) {
      return check;
    }

    const nextEnvelope = this.createSecretEnvelope(newPin);
    this.writeEnvelope(nextEnvelope);
    this.unlocked = true;

    return {
      success: true,
      message: 'PIN code updated.',
      status: this.getStatus(),
    };
  }
}

