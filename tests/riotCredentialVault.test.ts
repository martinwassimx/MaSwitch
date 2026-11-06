import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RiotCredentialVault } from '../electron/services/accounts/riotCredentialVault';

describe('RiotCredentialVault Unit & Integration Test Suite', () => {
  let testVaultDir: string;
  let vault: RiotCredentialVault;

  beforeEach(() => {
    testVaultDir = path.join(os.tmpdir(), `maswitch-cred-vault-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(testVaultDir, { recursive: true });

    vault = new RiotCredentialVault(testVaultDir, {
      allowInsecureTestCipher: true,
      safeStorageOverride: null, // test fallback AES-GCM cipher without Electron native binary
    });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testVaultDir)) {
        fs.rmSync(testVaultDir, { recursive: true, force: true });
      }
    } catch {
      // best effort cleanup
    }
  });

  it('initially reports no credentials for an account', async () => {
    const hasCreds = await vault.hasCredentials('acc-melynelas');
    expect(hasCreds).toBe(false);

    const status = await vault.getCredentialStatus('acc-melynelas');
    expect(status.hasSavedCredentials).toBe(false);
    expect(status.username).toBeUndefined();
  });

  it('saves synthetic credentials with encryption and returns success', async () => {
    const res = await vault.saveCredentials('acc-melynelas', 'Melynelas', 'synthetic-test-password-12345');
    expect(res.success).toBe(true);
    expect(typeof res.updatedAtIso).toBe('string');

    // Confirm file exists on disk
    const credFilePath = path.join(testVaultDir, 'acc-melynelas.cred.enc');
    expect(fs.existsSync(credFilePath)).toBe(true);

    // Verify plaintext password is NEVER stored raw in the file
    const rawFileContent = fs.readFileSync(credFilePath, 'utf8');
    expect(rawFileContent.includes('synthetic-test-password-12345')).toBe(false);

    const envelope = JSON.parse(rawFileContent);
    expect(envelope.format).toBe('MS_CRED_V1');
    expect(envelope.profileId).toBe('acc-melynelas');
    expect(envelope.ciphertextBase64).toBeDefined();
    // An unsalted digest of the plaintext would allow offline password guessing (MS-05)
    expect(envelope.payloadSha256).toBeUndefined();
  });

  it('retrieves credential status without exposing plaintext password', async () => {
    await vault.saveCredentials('acc-melynelas', 'Melynelas', 'secret-password');

    const status = await vault.getCredentialStatus('acc-melynelas');
    expect(status.hasSavedCredentials).toBe(true);
    expect(status.username).toBe('Melynelas');
    expect(status.updatedAtIso).toBeDefined();
    // @ts-expect-error - password must not exist on status object
    expect(status.password).toBeUndefined();
  });

  it('decrypts credentials correctly for main-process authorized request', async () => {
    await vault.saveCredentials('acc-melynelas', 'Melynelas', 'my-super-secret-pass');

    const decrypted = await vault.getDecryptedCredentials('acc-melynelas');
    expect(decrypted).not.toBeNull();
    expect(decrypted?.username).toBe('Melynelas');
    expect(decrypted?.password).toBe('my-super-secret-pass');
  });

  it('updates existing credentials cleanly and reflects new timestamp', async () => {
    await vault.saveCredentials('acc-melynelas', 'Melynelas', 'first-password');
    const firstStatus = await vault.getCredentialStatus('acc-melynelas');

    await new Promise((r) => setTimeout(r, 10));
    await vault.saveCredentials('acc-melynelas', 'MelynelasUpdated', 'second-password');

    const updatedStatus = await vault.getCredentialStatus('acc-melynelas');
    expect(updatedStatus.username).toBe('MelynelasUpdated');
    expect(updatedStatus.updatedAtIso).not.toBe(firstStatus.updatedAtIso);

    const decrypted = await vault.getDecryptedCredentials('acc-melynelas');
    expect(decrypted?.password).toBe('second-password');
  });

  it('deletes saved credentials and wipes file from disk', async () => {
    await vault.saveCredentials('acc-melynelas', 'Melynelas', 'secret-to-delete');
    expect(await vault.hasCredentials('acc-melynelas')).toBe(true);

    const deleteRes = await vault.deleteCredentials('acc-melynelas');
    expect(deleteRes).toBe(true);

    expect(await vault.hasCredentials('acc-melynelas')).toBe(false);
    const status = await vault.getCredentialStatus('acc-melynelas');
    expect(status.hasSavedCredentials).toBe(false);

    const credFilePath = path.join(testVaultDir, 'acc-melynelas.cred.enc');
    expect(fs.existsSync(credFilePath)).toBe(false);
  });

  it('rejects invalid or traversal profile IDs', async () => {
    await expect(
      vault.saveCredentials('../hacked', 'user', 'pass')
    ).rejects.toThrow();

    await expect(
      vault.saveCredentials('', 'user', 'pass')
    ).rejects.toThrow();

    await expect(
      vault.saveCredentials('acc-test', '', 'pass')
    ).rejects.toThrow();

    await expect(
      vault.saveCredentials('acc-test', 'user', '')
    ).rejects.toThrow();
  });

  it('lists all credential statuses for multi-account management', async () => {
    await vault.saveCredentials('acc-melynelas', 'Melynelas', 'pass1');
    await vault.saveCredentials('acc-other', 'OtherAccount', 'pass2');

    const all = await vault.listAllCredentialStatuses();
    expect(all['acc-melynelas']?.hasSavedCredentials).toBe(true);
    expect(all['acc-melynelas']?.username).toBe('Melynelas');
    expect(all['acc-other']?.hasSavedCredentials).toBe(true);
    expect(all['acc-other']?.username).toBe('OtherAccount');
  });

  it('detects tampering or corruption and fails closed', async () => {
    await vault.saveCredentials('acc-tamper', 'TamperUser', 'tamper-pass');
    const credFilePath = path.join(testVaultDir, 'acc-tamper.cred.enc');

    // Flip one ciphertext byte; authenticated encryption must reject it
    const raw = JSON.parse(fs.readFileSync(credFilePath, 'utf8'));
    const ciphertext = Buffer.from(raw.ciphertextBase64, 'base64');
    ciphertext[ciphertext.length - 1] ^= 0xff;
    raw.ciphertextBase64 = ciphertext.toString('base64');
    fs.writeFileSync(credFilePath, JSON.stringify(raw));

    const decrypted = await vault.getDecryptedCredentials('acc-tamper');
    expect(decrypted).toBeNull();
  });
});

