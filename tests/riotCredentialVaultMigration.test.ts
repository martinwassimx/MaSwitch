import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  RiotCredentialVault,
  type SafeStorageLike,
} from '../electron/services/accounts/riotCredentialVault';

// Reversible stand-in for DPAPI so legacy records use the production 'dpapi' scheme.
function createFakeDpapi(): SafeStorageLike & { decrypted: string[] } {
  const decrypted: string[] = [];
  const xor = (buf: Buffer) => Buffer.from(buf.map((b) => b ^ 0x5a));
  return {
    decrypted,
    isEncryptionAvailable: () => true,
    encryptString: (plain) => xor(Buffer.from(`FAKEDPAPI:${plain}`, 'utf8')),
    decryptString: (encrypted) => {
      const text = xor(encrypted).toString('utf8');
      if (!text.startsWith('FAKEDPAPI:')) throw new Error('bad ciphertext');
      const plain = text.slice('FAKEDPAPI:'.length);
      decrypted.push(plain);
      return plain;
    },
  };
}

function writeLegacyRecord(
  dir: string,
  dpapi: SafeStorageLike,
  profileId: string,
  username: string,
  password: string
): string {
  const updatedAtIso = '2026-01-01T00:00:00.000Z';
  const plainText = JSON.stringify({ version: 1, profileId, username, password, updatedAtIso });
  const envelope = {
    format: 'MS_CRED_V1',
    profileId,
    encryptionScheme: 'dpapi',
    payloadSha256: crypto.createHash('sha256').update(plainText).digest('hex'),
    ciphertextBase64: dpapi.encryptString(plainText).toString('base64'),
    updatedAtIso,
  };
  const filePath = path.join(dir, `${profileId}.cred.enc`);
  fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2), 'utf8');
  return filePath;
}

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

describe('RiotCredentialVault format hardening (MS-05) and status without decryption (MS-26)', () => {
  let dir: string;
  let dpapi: ReturnType<typeof createFakeDpapi>;
  let vault: RiotCredentialVault;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-vault-migration-'));
    dpapi = createFakeDpapi();
    vault = new RiotCredentialVault(dir, { safeStorageOverride: dpapi });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('new records contain no plaintext-derived digest that allows offline guessing', async () => {
    await vault.saveCredentials('acc-riot-new', 'synthetic_user', 'Summer2024!');
    const envelope = readJson(path.join(dir, 'acc-riot-new.cred.enc'));

    expect(envelope.payloadSha256).toBeUndefined();
    const raw = fs.readFileSync(path.join(dir, 'acc-riot-new.cred.enc'), 'utf8');
    expect(raw).not.toContain('Summer2024!');
    expect(raw).not.toContain('synthetic_user');

    const guess = JSON.stringify({
      version: 1,
      profileId: envelope.profileId,
      username: 'synthetic_user',
      password: 'Summer2024!',
      updatedAtIso: envelope.updatedAtIso,
    });
    const digest = crypto.createHash('sha256').update(guess).digest('hex');
    expect(raw).not.toContain(digest);
  });

  it('decrypts legacy records that still carry payloadSha256', async () => {
    writeLegacyRecord(dir, dpapi, 'acc-riot-legacy', 'legacy_user', 'LegacyPass!1');
    const creds = await vault.getDecryptedCredentials('acc-riot-legacy');
    expect(creds?.username).toBe('legacy_user');
    expect(creds?.password).toBe('LegacyPass!1');
  });

  it('still rejects a legacy record whose stored digest was tampered with', async () => {
    const filePath = writeLegacyRecord(dir, dpapi, 'acc-riot-legacy', 'legacy_user', 'LegacyPass!1');
    const env = readJson(filePath);
    env.payloadSha256 = '0'.repeat(64);
    fs.writeFileSync(filePath, JSON.stringify(env));
    expect(await vault.getDecryptedCredentials('acc-riot-legacy')).toBeNull();
  });

  it('migration strips the digest without decrypting and keeps the ciphertext byte-identical', async () => {
    const pathA = writeLegacyRecord(dir, dpapi, 'acc-riot-a', 'user_a', 'PassA!1');
    const pathB = writeLegacyRecord(dir, dpapi, 'acc-riot-b', 'user_b', 'PassB!2');
    await vault.saveCredentials('acc-riot-c', 'user_c', 'PassC!3');
    const cipherA = readJson(pathA).ciphertextBase64;
    dpapi.decrypted.length = 0;

    const result = vault.migrateLegacyEnvelopes();

    expect(result).toEqual({ migrated: 2, failed: 0 });
    expect(dpapi.decrypted).toHaveLength(0);
    expect(readJson(pathA).payloadSha256).toBeUndefined();
    expect(readJson(pathB).payloadSha256).toBeUndefined();
    expect(readJson(pathA).ciphertextBase64).toBe(cipherA);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toHaveLength(0);

    expect((await vault.getDecryptedCredentials('acc-riot-a'))?.password).toBe('PassA!1');
    expect((await vault.getDecryptedCredentials('acc-riot-b'))?.password).toBe('PassB!2');
    expect((await vault.getDecryptedCredentials('acc-riot-c'))?.password).toBe('PassC!3');
    expect(vault.migrateLegacyEnvelopes()).toEqual({ migrated: 0, failed: 0 });
  });

  it('migration skips unreadable records without touching them', () => {
    const corruptPath = path.join(dir, 'acc-riot-corrupt.cred.enc');
    fs.writeFileSync(corruptPath, '{not json');
    writeLegacyRecord(dir, dpapi, 'acc-riot-ok', 'user_ok', 'PassOk!1');

    expect(vault.migrateLegacyEnvelopes()).toEqual({ migrated: 1, failed: 1 });
    expect(fs.readFileSync(corruptPath, 'utf8')).toBe('{not json');
  });

  it('listing statuses never decrypts a password payload', async () => {
    await vault.saveCredentials('acc-riot-1', 'user_one', 'SecretOne!1');
    await vault.saveCredentials('acc-riot-2', 'user_two', 'SecretTwo!2');
    writeLegacyRecord(dir, dpapi, 'acc-riot-3', 'user_three', 'SecretThree!3');
    dpapi.decrypted.length = 0;

    const all = await vault.listAllCredentialStatuses();

    expect(all['acc-riot-1']).toMatchObject({ hasSavedCredentials: true, username: 'user_one' });
    expect(all['acc-riot-2']).toMatchObject({ hasSavedCredentials: true, username: 'user_two' });
    expect(all['acc-riot-3']).toMatchObject({ hasSavedCredentials: true, username: undefined });
    expect(all['acc-riot-3'].updatedAtIso).toBe('2026-01-01T00:00:00.000Z');
    for (const plain of dpapi.decrypted) {
      expect(plain).not.toMatch(/Secret(One|Two|Three)/);
    }
    expect(JSON.stringify(all)).not.toMatch(/Secret(One|Two|Three)/);
  });

  it('resolves a legacy username on explicit request and upgrades only that record', async () => {
    const legacyPath = writeLegacyRecord(dir, dpapi, 'acc-riot-legacy', 'legacy_login', 'LegacyPass!1');
    const otherPath = writeLegacyRecord(dir, dpapi, 'acc-riot-other', 'other_login', 'OtherPass!2');

    const status = await vault.getCredentialStatus('acc-riot-legacy', { resolveLegacyUsername: true });

    expect(status).toMatchObject({ hasSavedCredentials: true, username: 'legacy_login' });
    expect(JSON.stringify(status)).not.toContain('LegacyPass!1');
    expect(readJson(legacyPath).usernameCiphertextBase64).toBeDefined();
    expect(readJson(legacyPath).payloadSha256).toBeUndefined();
    expect(readJson(otherPath).payloadSha256).toBeDefined();

    dpapi.decrypted.length = 0;
    const listed = await vault.listAllCredentialStatuses();
    expect(listed['acc-riot-legacy'].username).toBe('legacy_login');
    expect(dpapi.decrypted.some((p) => p.includes('LegacyPass!1'))).toBe(false);
    expect((await vault.getDecryptedCredentials('acc-riot-legacy'))?.password).toBe('LegacyPass!1');
  });

  it('rejects a ciphertext moved from another profile file', async () => {
    await vault.saveCredentials('acc-riot-victim', 'victim_user', 'VictimPass!1');
    await vault.saveCredentials('acc-riot-attacker', 'attacker_user', 'AttackerPass!2');
    const victimPath = path.join(dir, 'acc-riot-victim.cred.enc');
    const attacker = readJson(path.join(dir, 'acc-riot-attacker.cred.enc'));
    const victim = readJson(victimPath);
    victim.ciphertextBase64 = attacker.ciphertextBase64;
    victim.usernameCiphertextBase64 = attacker.usernameCiphertextBase64;
    fs.writeFileSync(victimPath, JSON.stringify(victim));

    expect(await vault.getDecryptedCredentials('acc-riot-victim')).toBeNull();
    expect((await vault.getCredentialStatus('acc-riot-victim')).hasSavedCredentials).toBe(false);
  });

  it('rejects corrupted ciphertext', async () => {
    await vault.saveCredentials('acc-riot-x', 'user_x', 'PassX!1');
    const p = path.join(dir, 'acc-riot-x.cred.enc');
    const env = readJson(p);
    env.ciphertextBase64 = Buffer.from('garbage').toString('base64');
    fs.writeFileSync(p, JSON.stringify(env));
    expect(await vault.getDecryptedCredentials('acc-riot-x')).toBeNull();
  });

  it('fails closed without DPAPI and never falls back to plaintext', async () => {
    const noDpapi = new RiotCredentialVault(dir, { safeStorageOverride: null });
    await expect(noDpapi.saveCredentials('acc-riot-y', 'u', 'p')).rejects.toThrow(/DPAPI/);
    expect(fs.existsSync(path.join(dir, 'acc-riot-y.cred.enc'))).toBe(false);
  });

  it('preserves the test-cipher path used by existing suites', async () => {
    const testVault = new RiotCredentialVault(dir, {
      safeStorageOverride: null,
      allowInsecureTestCipher: true,
    });
    await testVault.saveCredentials('acc-riot-t', 'test_user', 'TestPass!1');
    expect((await testVault.getCredentialStatus('acc-riot-t')).username).toBe('test_user');
    expect((await testVault.getDecryptedCredentials('acc-riot-t'))?.password).toBe('TestPass!1');
  });

  it('surfaces a decrypt failure as missing status rather than throwing', async () => {
    await vault.saveCredentials('acc-riot-z', 'user_z', 'PassZ!1');
    vi.spyOn(dpapi, 'decryptString').mockImplementation(() => {
      throw new Error('DPAPI failure');
    });
    expect((await vault.getCredentialStatus('acc-riot-z')).hasSavedCredentials).toBe(false);
  });
});
