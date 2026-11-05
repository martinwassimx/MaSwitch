import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AccountsPage } from '../src/pages/AccountsPage';
import { useAppStore } from '../src/store/useAppStore';
import { AccountSwitcherService } from '../electron/services/accounts/accountSwitcherService';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';

describe('Accounts page launcher handoff', () => {
  let dir: string;
  let db: MaSwitchSqliteDatabase;
  let epicId: string;
  let steamId: string;
  const openLauncher = vi.fn(async (_executable: string) => {});
  let cancelSwitch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    openLauncher.mockReset();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-confirm-'));
    db = new MaSwitchSqliteDatabase(path.join(dir, 'accounts.sqlite'));
    epicId = db.createAccountProfile({
      platformId: 'epic', username: 'Melynelas', displayName: 'Epic Main', isPreferred: true,
    }).id;
    steamId = db.createAccountProfile({
      platformId: 'steam', username: 'steam-user', displayName: 'Steam Main',
    }).id;
    const service = new AccountSwitcherService(db, {
      resolveLauncher: (platformId) => `C:/mock/${platformId}.exe`,
      openLauncher,
    });
    cancelSwitch = vi.fn(async (switchId: string) => service.cancelAccountSwitch(switchId));

    vi.stubGlobal('maswitch', {
      accounts: {
        getProfiles: async () => db.getAccountProfiles(),
        getLauncherStatuses: async () => service.getPlatformLauncherStatuses(new Set(['steam.exe'])),
        getGameAssociations: async () => [],
        getActiveProfiles: async () => service.getActivePlatformProfiles(),
        switchAccount: (id: string, force: boolean) => service.switchAccount(db.getAccountProfileById(id)!, force),
        confirmSwitch: async (id: string, switchId: string) => service.confirmAccountSwitch(id, switchId),
        cancelSwitch,
      },
    });
    useAppStore.setState((state) => ({
      platformCapabilities: service.getCapabilities(),
      activeSwitchResult: null,
      pendingSwitchAccountId: null,
      isSwitchingAccount: false,
      isConfirmingSwitch: false,
      switchError: null,
      settings: { ...state.settings, demoModeEnabled: false },
    }));
    await useAppStore.getState().loadAccountProfiles();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('opens Epic Games once, displays the selected profile, and records a user report with authentication unknown', async () => {
    render(<AccountsPage />);
    expect(screen.getByTestId(`status-badge-preferred-${epicId}`)).toHaveTextContent('Preferred Profile');
    fireEvent.click(screen.getByTestId(`switch-btn-${epicId}`));
    expect(await screen.findByTestId('guidance-target-name')).toHaveTextContent('Epic Main');
    expect(screen.getByTestId('guidance-target-username')).toHaveTextContent('Melynelas');
    expect(screen.getByTestId('guidance-status-pill')).toHaveTextContent('Sign-In Required');
    expect(screen.queryByTestId('guidance-open-launcher-btn')).toBeNull();
    expect(screen.getByTestId(`status-badge-selected-${epicId}`)).toHaveTextContent('Last Selected Profile');
    expect(openLauncher.mock.calls).toEqual([['C:/mock/epic.exe']]);

    fireEvent.click(screen.getByTestId('guidance-confirm-btn'));
    expect(await screen.findByTestId(`status-badge-confirmed-${epicId}`)).toHaveTextContent('User-Confirmed Profile');
    expect(screen.queryByTestId('account-switch-guidance-modal')).toBeNull();
    expect(screen.queryByText('Current Profile')).toBeNull();
    expect(screen.queryByText('Switch Complete')).toBeNull();
    expect(screen.queryByTestId(`status-badge-verified-${epicId}`)).toBeNull();
    expect(screen.getAllByText('Authentication Unknown')).toHaveLength(2);
  });

  it('cancels the main-process request and leaves only the last selection', async () => {
    render(<AccountsPage />);
    fireEvent.click(screen.getByTestId(`switch-btn-${epicId}`));
    await screen.findByTestId('guidance-cancel-btn');
    const switchId = useAppStore.getState().activeSwitchResult?.switchId;
    fireEvent.click(screen.getByTestId('guidance-cancel-btn'));
    expect(cancelSwitch.mock.calls).toEqual([[switchId]]);
    expect(screen.queryByTestId('account-switch-guidance-modal')).toBeNull();
    expect(screen.getByTestId(`status-badge-selected-${epicId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`sign-in-again-btn-${epicId}`)).toBeInTheDocument();
    expect(db.getAccountSwitchHistory()).toEqual([]);
  });

  it('shows launcher failures without an attestation button', async () => {
    openLauncher.mockRejectedValueOnce(new Error('launch failed'));
    render(<AccountsPage />);
    fireEvent.click(screen.getByTestId(`switch-btn-${epicId}`));
    expect(await screen.findByRole('alert')).toHaveTextContent('MaSwitch could not open Epic Games Launcher');
    expect(screen.queryByTestId('guidance-confirm-btn')).toBeNull();
    expect(db.getAccountSwitchHistory()).toEqual([]);
  });

  it('shows a verified badge only from matching independent launcher evidence', () => {
    const original = useAppStore.getState().launcherStatuses;
    const view = render(<AccountsPage />);
    expect(screen.queryByTestId(`status-badge-verified-${steamId}`)).toBeNull();
    view.unmount();
    useAppStore.setState({
      launcherStatuses: {
        ...original,
        steam: { ...original.steam, verifiedActiveAccountUsername: 'steam-user' },
      },
    });
    render(<AccountsPage />);
    expect(screen.getByTestId(`status-badge-verified-${steamId}`)).toHaveTextContent('Verified Active Account');
    expect(screen.queryByTestId(`status-badge-verified-${epicId}`)).toBeNull();
  });

  it('uses Steam account chooser instructions in the UI', async () => {
    render(<AccountsPage />);
    fireEvent.click(screen.getByTestId(`switch-btn-${steamId}`));
    await waitFor(() => expect(screen.getByText(/startup account chooser/)).toBeInTheDocument());
    expect(screen.getByTestId('guidance-status-pill')).toHaveTextContent('Choose Account in Client');
    expect(db.getAccountSwitchHistory()).toEqual([]);
  });
});

