import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RiotCredentialVault } from '../electron/services/accounts/riotCredentialVault';
import { RiotWindowsSessionVault } from '../electron/services/accounts/riotProductionAdapters';
import { removeRiotAccountArtifacts } from '../electron/services/accounts/riotAccountCleanup';

describe('removeRiotAccountArtifacts (MS-10)', () => {
  let root: string;
  let credDir: string;
  let sessionDir: string;
  let credentials: RiotCredentialVault;
  let sessions: RiotWindowsSessionVault;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-cleanup-'));
    credDir = path.join(root, 'vault', 'riot_credentials');
    sessionDir = path.join(root, 'vault', 'riot');
    credentials = new RiotCredentialVault(credDir, { safeStorageOverride: null, allowInsecureTestCipher: true });
    sessions = new RiotWindowsSessionVault(sessionDir, { safeStorageOverride: null, allowInsecureTestCipher: true });

    for (const id of ['acc-riot-1', 'acc-riot-2', 'acc-riot-3']) {
      await credentials.saveCredentials(id, `user_${id}`, `Pass_${id}!`);
      await sessions.saveSession(id, Buffer.from(`synthetic-session-${id}`));
    }
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('removes only the selected profile and leaves the others intact', async () => {
    const result = await removeRiotAccountArtifacts('acc-riot-2', { credentials, sessions });

    expect(result).toEqual({ credentials: 'removed', session: 'removed' });
    expect(await credentials.hasCredentials('acc-riot-2')).toBe(false);
    expect(await sessions.hasSession('acc-riot-2')).toBe(false);
    for (const id of ['acc-riot-1', 'acc-riot-3']) {
      expect((await credentials.getDecryptedCredentials(id))?.password).toBe(`Pass_${id}!`);
      expect((await sessions.loadSession(id))?.toString()).toBe(`synthetic-session-${id}`);
    }
  });

  it('reports absent artifacts without error', async () => {
    const result = await removeRiotAccountArtifacts('acc-riot-unknown', { credentials, sessions });
    expect(result).toEqual({ credentials: 'absent', session: 'absent' });
  });

  it.each(['../riot_credentials', '..\\x', 'a/b', 'C:\\Windows', '*', '', 'x'.repeat(65)])(
    'refuses unsafe identifier %j and touches no files',
    async (badId) => {
      const credSpy = vi.spyOn(credentials, 'deleteCredentials');
      const sessionSpy = vi.spyOn(sessions, 'deleteSession');
      const before = [...fs.readdirSync(credDir), ...fs.readdirSync(sessionDir)].sort();

      const result = await removeRiotAccountArtifacts(badId, { credentials, sessions });

      expect(result).toEqual({ credentials: 'skipped', session: 'skipped' });
      expect(credSpy).not.toHaveBeenCalled();
      expect(sessionSpy).not.toHaveBeenCalled();
      expect([...fs.readdirSync(credDir), ...fs.readdirSync(sessionDir)].sort()).toEqual(before);
    }
  );

  it('continues with the session when credential removal throws', async () => {
    vi.spyOn(credentials, 'deleteCredentials').mockRejectedValue(new Error('EBUSY'));
    const result = await removeRiotAccountArtifacts('acc-riot-1', { credentials, sessions });

    expect(result).toEqual({ credentials: 'failed', session: 'removed' });
    expect(await credentials.hasCredentials('acc-riot-1')).toBe(true);
    expect(await sessions.hasSession('acc-riot-1')).toBe(false);
  });

  it('detects a silent session deletion failure by re-checking existence', async () => {
    vi.spyOn(sessions, 'deleteSession').mockResolvedValue(undefined);
    const result = await removeRiotAccountArtifacts('acc-riot-3', { credentials, sessions });

    expect(result).toEqual({ credentials: 'removed', session: 'failed' });
    expect(await sessions.hasSession('acc-riot-3')).toBe(true);
  });

  it('skips stores that are not configured', async () => {
    const result = await removeRiotAccountArtifacts('acc-riot-1', { credentials });
    expect(result).toEqual({ credentials: 'removed', session: 'skipped' });
    expect(await sessions.hasSession('acc-riot-1')).toBe(true);
  });
});
