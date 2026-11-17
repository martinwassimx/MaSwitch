import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('displays active Riot account cards with direct Login, Password, Edit, Preferred, and Delete controls', () => {
    render(<AccountsPage />);
    expect(screen.getByTestId(`account-card-${riotId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`preferred-toggle-${riotId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`riot-login-btn-${riotId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`setup-credentials-btn-${riotId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`edit-profile-${riotId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`delete-profile-${riotId}`)).toBeInTheDocument();
  });

  it('keeps non-Riot accounts out of the simplified Riot password UI while preserving existing SQLite records safely', () => {
    render(<AccountsPage />);

    // Verify no misleading functional controls are displayed for Epic Games or Steam
    expect(screen.queryByTestId(`account-card-${epicId}`)).toBeNull();
    expect(screen.queryByTestId(`account-card-${steamId}`)).toBeNull();
    expect(screen.queryByTestId(`switch-btn-${epicId}`)).toBeNull();
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
