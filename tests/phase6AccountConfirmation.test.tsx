import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AccountsPage } from '../src/pages/AccountsPage';
import { useAppStore } from '../src/store/useAppStore';
import { AccountSwitcherService } from '../electron/services/accounts/accountSwitcherService';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';

describe('Accounts page non-Riot preservation & backend service integrity', () => {
  let dir: string;
  let db: MaSwitchSqliteDatabase;
  let epicId: string;
  let steamId: string;
  let riotId: string;
  let service: AccountSwitcherService;
  const openLauncher = vi.fn(async (_executable: string) => {});
  let cancelSwitch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    openLauncher.mockReset();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-confirm-'));
    db = new MaSwitchSqliteDatabase(path.join(dir, 'accounts.sqlite'));
    epicId = db.createAccountProfile({
      platformId: 'epic',
      username: 'Melynelas',
      displayName: 'Epic Main',
      isPreferred: true,
    }).id;
    steamId = db.createAccountProfile({
      platformId: 'steam',
      username: 'steam-user',
      displayName: 'Steam Main',
    }).id;
    riotId = db.createAccountProfile({
      platformId: 'riot',
      username: 'Melynelas#EUW',
      displayName: 'LOL EUW — Melynelas',
      isPreferred: true,
    }).id;
    service = new AccountSwitcherService(db, {
      resolveLauncher: (platformId) => `C:/mock/${platformId}.exe`,
      openLauncher,
    });
    cancelSwitch = vi.fn(async (switchId: string) => service.cancelAccountSwitch(switchId));

    vi.stubGlobal('maswitch', {
      accounts: {
        getProfiles: async () => db.getAccountProfiles(),
        getLauncherStatuses: async () =>
          service.getPlatformLauncherStatuses(new Set(['steam.exe'])),
        getGameAssociations: async () => [],
        getActiveProfiles: async () => service.getActivePlatformProfiles(),
        switchAccount: (id: string, force: boolean) =>
          service.switchAccount(db.getAccountProfileById(id)!, force),
        confirmSwitch: async (id: string, switchId: string) =>
          service.confirmAccountSwitch(id, switchId),
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

  it('defaults to Riot Games and displays active Riot account cards with Login, Set Up Credentials, Edit Account, and overflow menu Delete', () => {
    render(<AccountsPage />);
    expect(screen.getByTestId(`account-card-${riotId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`status-badge-preferred-${riotId}`)).toHaveTextContent(
      'Preferred'
    );
    expect(screen.getByTestId(`riot-login-btn-${riotId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`setup-credentials-btn-${riotId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`edit-profile-${riotId}`)).toBeInTheDocument();

    // Open overflow menu to access Delete and Make Preferred
    fireEvent.click(screen.getByTestId(`more-menu-btn-${riotId}`));
    expect(screen.getByTestId(`delete-profile-${riotId}`)).toBeInTheDocument();
  });

  it('marks non-Riot platforms as Coming Soon in the UI while preserving existing SQLite records safely', () => {
    render(<AccountsPage />);

    // Select Epic Games tab
    fireEvent.click(screen.getByTestId('accounts-filter-epic'));
    expect(screen.getByTestId('platform-coming-soon-state')).toBeInTheDocument();
    expect(screen.getByTestId('coming-soon-platform-title')).toHaveTextContent(
      'Epic Games Account Management'
    );
    expect(screen.getByTestId('coming-soon-platform-description')).toHaveTextContent(
      'Multi-account management for Epic Games is planned for a future MaSwitch update.'
    );
    expect(
      screen.getByText(/1 saved Epic Games profile\(s\) are safely preserved/i)
    ).toBeInTheDocument();

    // Verify no misleading functional controls are displayed for Epic Games
    expect(screen.queryByTestId(`switch-btn-${epicId}`)).toBeNull();
    expect(screen.queryByTestId('add-account-profile-btn')).toBeNull();

    // Select Steam tab
    fireEvent.click(screen.getByTestId('accounts-filter-steam'));
    expect(screen.getByTestId('coming-soon-platform-title')).toHaveTextContent(
      'Steam Account Management'
    );
    expect(screen.queryByTestId(`switch-btn-${steamId}`)).toBeNull();

    // Confirm SQLite database records for Epic and Steam are untouched
    const allStored = db.getAccountProfiles();
    expect(allStored.some((p) => p.id === epicId)).toBe(true);
    expect(allStored.some((p) => p.id === steamId)).toBe(true);
    expect(allStored.some((p) => p.id === riotId)).toBe(true);
  });

  it('preserves AccountSwitcherService backend handoff and confirmation logic for future updates', async () => {
    const epicProfile = db.getAccountProfileById(epicId)!;
    const res = await service.switchAccount(epicProfile, false);
    expect(res.success).toBe(true);
    expect(res.pendingConfirmation).toBe(true);
    expect(openLauncher).toHaveBeenCalledWith('C:/mock/epic.exe');

    const confirmed = service.confirmAccountSwitch(epicId, res.switchId!);
    expect(confirmed.success).toBe(true);
    expect(confirmed.verificationStatus).toBe('user-confirmed');
  });

  it('preserves AccountSwitcherService cancellation without recording false switch history', async () => {
    const epicProfile = db.getAccountProfileById(epicId)!;
    const res = await service.switchAccount(epicProfile, false);
    service.cancelAccountSwitch(res.switchId!);
    expect(db.getAccountSwitchHistory()).toEqual([]);
  });

  it('preserves independent Steam launcher status inspection in AccountSwitcherService', async () => {
    const statuses = await service.getPlatformLauncherStatuses(new Set(['steam.exe']));
    expect(statuses.steam.isRunning).toBe(true);
    expect(statuses.epic.isRunning).toBe(false);
  });
});
