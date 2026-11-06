import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const registered = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getPath: () => os.tmpdir(),
    getVersion: () => '0.0.0-test',
    on: () => undefined,
  },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => registered.set(channel, fn),
    on: () => undefined,
    removeHandler: () => undefined,
  },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  dialog: {},
  Notification: class {},
  safeStorage: { isEncryptionAvailable: () => false },
  shell: {},
}));

import { registerIpcHandlers, type MainServicesContainer } from '../electron/ipc/handlers';
import { IPC_CHANNELS } from '../src/shared/types/ipc';
import { RiotCredentialVault } from '../electron/services/accounts/riotCredentialVault';
import { RiotWindowsSessionVault } from '../electron/services/accounts/riotProductionAdapters';
import { setTrustedRendererFileUrl } from '../src/shared/validation/settingsValidator';

const PRELOAD_SOURCE = fs.readFileSync(path.join(__dirname, '../electron/preload.ts'), 'utf8');
const SYNTHETIC_PASSWORD = 'Synthetic-IPC-Pass!42';

describe('Riot credential IPC isolation (MS-01, MS-02, MS-10)', () => {
  let root: string;
  let vault: RiotCredentialVault;
  let sessions: RiotWindowsSessionVault;
  let executeAutofill: ReturnType<typeof vi.fn>;
  let deleteAccountProfile: ReturnType<typeof vi.fn>;
  const sent: unknown[] = [];

  const mainWindow = {
    isDestroyed: () => false,
    webContents: { id: 1, isDestroyed: () => false, send: (...args: unknown[]) => sent.push(args) },
  };
  const trustedEvent = {
    sender: { id: 1, getURL: () => 'file:///C:/MaSwitch/resources/app.asar/dist/index.html' },
    senderFrame: { url: 'file:///C:/MaSwitch/resources/app.asar/dist/index.html' },
  };

  const invoke = (channel: string, ...args: unknown[]) => {
    const handler = registered.get(channel);
    if (!handler) throw new Error(`No handler for ${channel}`);
    return handler(trustedEvent, ...args);
  };

  beforeEach(async () => {
    registered.clear();
    setTrustedRendererFileUrl(trustedEvent.senderFrame.url);
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-ipc-'));
    vault = new RiotCredentialVault(path.join(root, 'creds'), {
      safeStorageOverride: null,
      allowInsecureTestCipher: true,
    });
    sessions = new RiotWindowsSessionVault(path.join(root, 'sessions'), {
      safeStorageOverride: null,
      allowInsecureTestCipher: true,
    });
    await vault.saveCredentials('acc-riot-1', 'synthetic_login', SYNTHETIC_PASSWORD);
    await vault.saveCredentials('acc-riot-2', 'other_login', 'Other-Pass!7');
    await sessions.saveSession('acc-riot-1', Buffer.from('synthetic-session-1'));
    await sessions.saveSession('acc-riot-2', Buffer.from('synthetic-session-2'));

    executeAutofill = vi.fn(async () => ({ success: false, profileId: 'acc-riot-1', message: 'x' }));
    deleteAccountProfile = vi.fn(() => true);

    const services = {
      settingsStore: { load: () => ({ riotAutoSubmitLogin: true }) },
      sqliteDb: {
        getAccountProfileById: (id: string) => (id.startsWith('acc-riot') ? { id, platformId: 'riot' } : null),
        deleteAccountProfile,
        selectAccountProfile: vi.fn(),
        recordAccountSwitch: vi.fn(),
      },
      installedFeaturesManager: { onUpdated: () => undefined, isFeatureEnabled: () => false },
      riotCredentialVault: vault,
      riotDesktopLoginAutomation: { executeAutofill, isLoginInProgress: () => false },
      riotLiveServices: { vault: sessions },
    } as unknown as MainServicesContainer;

    registerIpcHandlers(() => mainWindow as never, services);
  });

  afterEach(() => {
    setTrustedRendererFileUrl(null);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('rejects IPC from a local file page other than the registered renderer', async () => {
    const handler = registered.get(IPC_CHANNELS.ACCOUNTS_RIOT_GET_CREDENTIAL_STATUS);
    expect(handler).toBeDefined();
    const dropped = {
      sender: { id: 1, getURL: () => 'file:///C:/Users/victim/Downloads/evil.html' },
      senderFrame: { url: 'file:///C:/Users/victim/Downloads/evil.html' },
    };
    await expect(Promise.resolve().then(() => handler!(dropped, 'profile-1'))).rejects.toThrow(/Untrusted sender origin/);
  });

  it('exposes no channel or preload function that returns decrypted credentials', () => {
    const channelNames = Object.entries(IPC_CHANNELS);
    expect(channelNames.some(([k, v]) => /LOGIN_CREDENTIALS/.test(k) || /get-login-credentials/.test(v))).toBe(false);
    expect([...registered.keys()].some((c) => /get-login-credentials/.test(c))).toBe(false);
    expect(registered.has('maswitch:accounts:riot:get-login-credentials')).toBe(false);
    expect(PRELOAD_SOURCE).not.toMatch(/riotGetLoginCredentials|GET_LOGIN_CREDENTIALS|get-login-credentials/);
  });

  it('never returns the password from any Riot credential channel', async () => {
    const results = [
      await invoke(IPC_CHANNELS.ACCOUNTS_RIOT_GET_CREDENTIAL_STATUS, 'acc-riot-1'),
      await invoke(IPC_CHANNELS.ACCOUNTS_RIOT_GET_ALL_CREDENTIAL_STATUSES),
      await invoke(IPC_CHANNELS.ACCOUNTS_RIOT_SAVE_CREDENTIALS, 'acc-riot-3', 'new_login', 'New-Pass!9'),
    ];
    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain(SYNTHETIC_PASSWORD);
    expect(serialized).not.toContain('Other-Pass!7');
    expect(serialized).not.toContain('New-Pass!9');
    expect(serialized).not.toContain('ciphertext');
    expect(serialized).not.toContain(JSON.stringify(root).slice(1, -1));
    expect(serialized).not.toContain('.cred.enc');
    expect(JSON.stringify(sent)).not.toContain(SYNTHETIC_PASSWORD);
  });

  it('drops renderer-supplied synthetic mode, HWND and PID when starting desktop login', async () => {
    await invoke(IPC_CHANNELS.ACCOUNTS_RIOT_START_DESKTOP_LOGIN, 'acc-riot-1', false, true, true, '4660', 4242);

    expect(executeAutofill).toHaveBeenCalledTimes(1);
    const options = executeAutofill.mock.calls[0][0] as Record<string, unknown>;
    expect(options.profileId).toBe('acc-riot-1');
    expect(options.autoSubmit).toBe(true);
    expect(options).not.toHaveProperty('isSyntheticTest');
    expect(options).not.toHaveProperty('targetHwnd');
    expect(options).not.toHaveProperty('targetPid');
  });

  it('preload forwards only profile, auto-launch and auto-submit for desktop login', () => {
    const match = PRELOAD_SOURCE.match(/riotStartDesktopLogin:\s*\(([^)]*)\)\s*=>\s*\n?\s*ipcRenderer\.invoke\(([^)]*)\)/);
    expect(match).not.toBeNull();
    expect(match![1]).not.toMatch(/Synthetic|Hwnd|Pid/i);
    expect(match![2]).not.toMatch(/Synthetic|Hwnd|Pid/i);
  });

  it('deleting a profile removes only that profile\u2019s credential and session files', async () => {
    const deleted = await invoke(IPC_CHANNELS.ACCOUNTS_DELETE_PROFILE, 'acc-riot-1');

    expect(deleted).toBe(true);
    expect(deleteAccountProfile).toHaveBeenCalledWith('acc-riot-1');
    expect(await vault.hasCredentials('acc-riot-1')).toBe(false);
    expect(await sessions.hasSession('acc-riot-1')).toBe(false);
    expect((await vault.getDecryptedCredentials('acc-riot-2'))?.password).toBe('Other-Pass!7');
    expect(await sessions.hasSession('acc-riot-2')).toBe(true);
  });

  it('keeps stored artifacts when the database delete does not succeed', async () => {
    deleteAccountProfile.mockReturnValueOnce(false);
    const deleted = await invoke(IPC_CHANNELS.ACCOUNTS_DELETE_PROFILE, 'acc-riot-1');

    expect(deleted).toBe(false);
    expect(await vault.hasCredentials('acc-riot-1')).toBe(true);
    expect(await sessions.hasSession('acc-riot-1')).toBe(true);
  });

  it('rejects calls from an untrusted sender before touching the vault', async () => {
    const handler = registered.get(IPC_CHANNELS.ACCOUNTS_RIOT_GET_ALL_CREDENTIAL_STATUSES)!;
    const foreign = { sender: { id: 99, getURL: () => 'https://evil.example' }, senderFrame: { url: 'https://evil.example' } };
    await expect(Promise.resolve().then(() => handler(foreign))).rejects.toThrow(/Unauthorized/);
  });
});
