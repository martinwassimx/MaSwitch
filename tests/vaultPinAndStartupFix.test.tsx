import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const registered = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getPath: () => os.tmpdir(),
    getVersion: () => '1.1.0',
    on: () => undefined,
  },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) =>
      registered.set(channel, fn),
    on: () => undefined,
    removeHandler: () => undefined,
  },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  dialog: {},
  Notification: class {},
  safeStorage: { isEncryptionAvailable: () => false },
  shell: {},
}));

import { VaultPinService } from '../electron/services/accounts/vaultPinService';
import { RiotCredentialVault } from '../electron/services/accounts/riotCredentialVault';
import { ElectronSettingsStore } from '../electron/services/settingsStore';
import {
  registerIpcHandlers,
  type MainServicesContainer,
} from '../electron/ipc/handlers';
import { IPC_CHANNELS } from '../src/shared/types/ipc';
import { setTrustedRendererFileUrl } from '../src/shared/validation/settingsValidator';
import { useAppStore } from '../src/store/useAppStore';
import { VaultPinModal } from '../src/components/accounts/VaultPinModal';

describe('Vault PIN Protection & Startup Credential Hydration Regression Suite', () => {
  let tempDir: string;

  beforeEach(() => {
    registered.clear();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-pin-suite-'));
  });

  afterEach(() => {
    setTrustedRendererFileUrl(null);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('1. VaultPinService Cryptography, Session Lock & Brute-Force Protection', () => {
    it('rejects invalid PIN formats and never writes plaintext PIN to disk', () => {
      const pinService = new VaultPinService(tempDir, {
        safeStorageOverride: null,
        allowInsecureTestCipher: true,
      });

      expect(pinService.getStatus()).toEqual({
        isConfigured: false,
        isUnlocked: false,
        failedAttempts: 0,
        lockedUntilIso: null,
      });

      expect(pinService.setupPin('123').success).toBe(false);
      expect(pinService.setupPin('1234567').success).toBe(false);
      expect(pinService.setupPin('12ab').success).toBe(false);

      const setupRes = pinService.setupPin('4829');
      expect(setupRes.success).toBe(true);
      expect(setupRes.status.isConfigured).toBe(true);
      expect(setupRes.status.isUnlocked).toBe(true);

      const rawDisk = fs.readFileSync(path.join(tempDir, 'vault-pin.enc.json'), 'utf8');
      expect(rawDisk).not.toContain('4829');
    });

    it('starts locked on every new app launch and unlocks only with the correct PIN', () => {
      const firstLaunch = new VaultPinService(tempDir, {
        safeStorageOverride: null,
        allowInsecureTestCipher: true,
      });
      expect(firstLaunch.setupPin('195724').success).toBe(true);

      // Simulate closing and reopening MaSwitch (new main-process instance)
      const secondLaunch = new VaultPinService(tempDir, {
        safeStorageOverride: null,
        allowInsecureTestCipher: true,
      });
      expect(secondLaunch.isPinConfigured()).toBe(true);
      expect(secondLaunch.isSessionUnlocked()).toBe(false);
      expect(() => secondLaunch.assertUnlocked()).toThrow(/locked/i);

      expect(secondLaunch.unlock('000000').success).toBe(false);
      expect(secondLaunch.isSessionUnlocked()).toBe(false);

      expect(secondLaunch.unlock('195724').success).toBe(true);
      expect(secondLaunch.isSessionUnlocked()).toBe(true);

      secondLaunch.lock();
      expect(secondLaunch.isSessionUnlocked()).toBe(false);
    });

    it('enforces cooldown lockout after 5 wrong PIN attempts and persists across restarts', () => {
      let nowMs = 1_700_000_000_000;
      const pinService = new VaultPinService(tempDir, {
        safeStorageOverride: null,
        allowInsecureTestCipher: true,
        nowFn: () => nowMs,
      });
      pinService.setupPin('2580');
      pinService.lock();

      for (let i = 0; i < 4; i++) {
        const res = pinService.unlock('9999');
        expect(res.success).toBe(false);
        expect(res.errorCode).toBe('WRONG_PIN');
      }

      const fifth = pinService.unlock('9999');
      expect(fifth.success).toBe(false);
      expect(fifth.errorCode).toBe('RATE_LIMITED');
      expect(fifth.status.lockedUntilIso).not.toBeNull();

      // Even the correct PIN is rejected during active cooldown, even after restart
      const restarted = new VaultPinService(tempDir, {
        safeStorageOverride: null,
        allowInsecureTestCipher: true,
        nowFn: () => nowMs + 5_000,
      });
      const blocked = restarted.unlock('2580');
      expect(blocked.success).toBe(false);
      expect(blocked.errorCode).toBe('RATE_LIMITED');

      // After 30s cooldown elapses, valid PIN succeeds and resets failedAttempts
      nowMs += 31_000;
      const unlocked = restarted.unlock('2580');
      expect(unlocked.success).toBe(true);
      expect(unlocked.status.failedAttempts).toBe(0);
    });
  });

  describe('2. Main-Process IPC Enforcement & Existing Saved Passwords Compatibility', () => {
    it('reports hasSavedCredentials=true on startup while blocking password use until PIN is entered', async () => {
      const trustedUrl = 'file:///C:/MaSwitch/resources/app.asar/dist/index.html';
      setTrustedRendererFileUrl(trustedUrl);

      const credsDir = path.join(tempDir, 'creds');
      const vault = new RiotCredentialVault(credsDir, {
        safeStorageOverride: null,
        allowInsecureTestCipher: true,
      });
      // Pre-existing saved passwords on disk from earlier sessions
      await vault.saveCredentials('riot-acc-1', 'first_user', 'Pass-One!1');
      await vault.saveCredentials('riot-acc-2', 'second_user', 'Pass-Two!2');

      const pinSetupInstance = new VaultPinService(tempDir, {
        safeStorageOverride: null,
        allowInsecureTestCipher: true,
      });
      pinSetupInstance.setupPin('7391');

      // Simulate fresh app open: vaultPinService starts LOCKED
      const freshPinService = new VaultPinService(tempDir, {
        safeStorageOverride: null,
        allowInsecureTestCipher: true,
      });

      const executeAutofill = vi.fn(async () => ({
        success: true,
        profileId: 'riot-acc-1',
        message: 'Autofilled',
      }));

      const mainWindow = {
        isDestroyed: () => false,
        webContents: { id: 1, isDestroyed: () => false, send: vi.fn() },
      };
      const trustedEvent = {
        sender: { id: 1, getURL: () => trustedUrl },
        senderFrame: { url: trustedUrl },
      };

      registerIpcHandlers(
        () => mainWindow as never,
        {
          settingsStore: { load: () => ({ riotAutoSubmitLogin: true }) },
          sqliteDb: {
            getAccountProfileById: (id: string) => ({ id, platformId: 'riot' }),
            selectAccountProfile: vi.fn(),
            recordAccountSwitch: vi.fn(),
          },
          installedFeaturesManager: {
            onUpdated: () => undefined,
            isFeatureEnabled: () => false,
          },
          riotCredentialVault: vault,
          vaultPinService: freshPinService,
          riotDesktopLoginAutomation: {
            executeAutofill,
            isLoginInProgress: () => false,
          },
        } as unknown as MainServicesContainer
      );

      const invoke = (ch: string, ...args: unknown[]) =>
        registered.get(ch)!(trustedEvent, ...args);

      // While PIN-locked on startup: BOTH accounts still report hasSavedCredentials: true!
      const lockedStatuses = (await invoke(
        IPC_CHANNELS.ACCOUNTS_RIOT_GET_ALL_CREDENTIAL_STATUSES
      )) as Record<string, { hasSavedCredentials: boolean; username?: string }>;
      expect(lockedStatuses['riot-acc-1']?.hasSavedCredentials).toBe(true);
      expect(lockedStatuses['riot-acc-2']?.hasSavedCredentials).toBe(true);
      expect(lockedStatuses['riot-acc-1']?.username).toBeUndefined();

      // Desktop login & saving passwords are blocked while locked
      const blockedLogin = (await invoke(
        IPC_CHANNELS.ACCOUNTS_RIOT_START_DESKTOP_LOGIN,
        'riot-acc-1',
        true,
        true
      )) as { success: boolean; error?: string };
      expect(blockedLogin.success).toBe(false);
      expect(blockedLogin.error).toBe('PIN_LOCKED');
      expect(executeAutofill).not.toHaveBeenCalled();

      await expect(
        invoke(IPC_CHANNELS.ACCOUNTS_RIOT_SAVE_CREDENTIALS, 'riot-acc-3', 'u', 'p')
      ).rejects.toThrow(/locked/i);

      // Unlock with PIN -> ALL saved passwords immediately work without adding any password!
      const unlockRes = (await invoke(IPC_CHANNELS.ACCOUNTS_PIN_UNLOCK, '7391')) as {
        success: boolean;
      };
      expect(unlockRes.success).toBe(true);

      const unlockedStatuses = (await invoke(
        IPC_CHANNELS.ACCOUNTS_RIOT_GET_ALL_CREDENTIAL_STATUSES
      )) as Record<string, { hasSavedCredentials: boolean; username?: string }>;
      expect(unlockedStatuses['riot-acc-1']?.username).toBe('first_user');
      expect(unlockedStatuses['riot-acc-2']?.username).toBe('second_user');

      const allowedLogin = (await invoke(
        IPC_CHANNELS.ACCOUNTS_RIOT_START_DESKTOP_LOGIN,
        'riot-acc-1',
        true,
        true
      )) as { success: boolean };
      expect(allowedLogin.success).toBe(true);
      expect(executeAutofill).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Renderer Startup Hydration & PIN Modal Flow', () => {
    it('hydrates all saved password statuses on initializeApp() and opens PIN prompt when locked', async () => {
      window.maswitch!.accounts = {
        getProfiles: vi.fn(async () => [
          {
            id: 'riot-1',
            platformId: 'riot' as const,
            displayName: 'Main EUW',
            username: 'main_user',
            nickname: 'Main EUW',
            avatarUrl: null,
            isPreferred: true,
            isLastSelected: true,
            lastUsedAt: null,
            notes: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'riot-2',
            platformId: 'riot' as const,
            displayName: 'Alt EUW',
            username: 'alt_user',
            nickname: 'Alt EUW',
            avatarUrl: null,
            isPreferred: false,
            isLastSelected: false,
            lastUsedAt: null,
            notes: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
        createProfile: vi.fn(),
        updateProfile: vi.fn(),
        deleteProfile: vi.fn(),
        setPreferred: vi.fn(),
        getCapabilities: vi.fn(async () => ({} as never)),
        getLauncherStatuses: vi.fn(async () => ({} as never)),
        getActiveProfiles: vi.fn(async () => ({} as never)),
        clearActiveProfile: vi.fn(),
        switchAccount: vi.fn(),
        cancelSwitch: vi.fn(),
        confirmSwitch: vi.fn(),
        openLauncher: vi.fn(),
        getSwitchHistory: vi.fn(async () => []),
        getGameAssociations: vi.fn(async () => []),
        setGameAssociation: vi.fn(),
        onAccountsUpdated: vi.fn(() => () => undefined),
        riotGetAllCredentialStatuses: vi.fn(async () => ({
          'riot-1': { hasSavedCredentials: true },
          'riot-2': { hasSavedCredentials: true },
        })),
        riotGetEnrolledProfiles: vi.fn(async () => []),
        pinGetStatus: vi.fn(async () => ({
          isConfigured: true,
          isUnlocked: false,
          failedAttempts: 0,
          lockedUntilIso: null,
        })),
        pinUnlock: vi.fn(async (pin: string) => ({
          success: pin === '1234',
          message: pin === '1234' ? 'Unlocked' : 'Incorrect PIN',
          status: {
            isConfigured: true,
            isUnlocked: pin === '1234',
            failedAttempts: pin === '1234' ? 0 : 1,
            lockedUntilIso: null,
          },
        })),
        onPinStatusChanged: vi.fn(() => () => undefined),
      };

      useAppStore.setState({
        isHydrated: false,
        riotCredentialStatuses: {},
        isPinModalOpen: false,
      });

      await useAppStore.getState().initializeApp();

      const state = useAppStore.getState();
      expect(state.activeSection).toBe('accounts');
      expect(state.riotCredentialStatuses['riot-1']?.hasSavedCredentials).toBe(true);
      expect(state.riotCredentialStatuses['riot-2']?.hasSavedCredentials).toBe(true);
      expect(state.isPinModalOpen).toBe(true);
      expect(state.pinModalMode).toBe('unlock');

      render(<VaultPinModal />);
      expect(screen.getByTestId('vault-pin-modal')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('input-vault-pin'), {
        target: { value: '1234' },
      });
      fireEvent.click(screen.getByTestId('pin-submit-btn'));

      await waitFor(() => {
        expect(useAppStore.getState().vaultPinStatus.isUnlocked).toBe(true);
        expect(useAppStore.getState().isPinModalOpen).toBe(false);
      });
    });

    it('migrates legacy defaultLandingPage="home" settings on disk once to "accounts"', () => {
      const settingsFile = path.join(tempDir, 'maswitch-settings.v1.json');
      fs.writeFileSync(
        settingsFile,
        JSON.stringify({ defaultLandingPage: 'home', demoModeEnabled: false }),
        'utf8'
      );

      const store = new ElectronSettingsStore(tempDir);
      const loaded = store.load();
      expect(loaded.defaultLandingPage).toBe('accounts');
      expect(loaded.accountsMainMigrationVersion).toBe(1);
    });
  });
});

