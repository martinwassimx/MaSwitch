import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AccountsPage } from '../src/pages/AccountsPage';
import { useAppStore } from '../src/store/useAppStore';
import {
  AccountSwitcherService,
  createWindowsAccountLauncherAdapter,
} from '../electron/services/accounts/accountSwitcherService';
import { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';

describe('Riot Games Production Account Switching Workflow', () => {
  let dir: string;
  let db: MaSwitchSqliteDatabase;
  let service: AccountSwitcherService;
  let littleimadId: string;
  let melynelasId: string;
  const openLauncher = vi.fn(async (_executable: string) => {});

  beforeEach(async () => {
    vi.clearAllMocks();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-riot-prod-'));
    db = new MaSwitchSqliteDatabase(path.join(dir, 'accounts.sqlite'));

    littleimadId = db.createAccountProfile({
      platformId: 'riot',
      displayName: 'LOL EUWN — littleimad',
      username: 'littleimad#EUWN',
      isPreferred: true,
    }).id;

    melynelasId = db.createAccountProfile({
      platformId: 'riot',
      displayName: 'LOL EUW — Melynelas',
      username: 'Melynelas#EUW',
      isPreferred: false,
    }).id;

    service = new AccountSwitcherService(db, {
      resolveLauncher: (platformId) => (platformId === 'riot' ? 'C:/Riot Games/Riot Client/RiotClientServices.exe' : null),
      openLauncher,
    });

    vi.stubGlobal('maswitch', {
      accounts: {
        getProfiles: async () => db.getAccountProfiles(),
        getLauncherStatuses: async () =>
          service.getPlatformLauncherStatuses(new Set(['riotclientservices.exe', 'leagueclient.exe'])),
        getGameAssociations: async () => [],
        getActiveProfiles: async () => service.getActivePlatformProfiles(),
        switchAccount: (id: string, force: boolean) =>
          service.switchAccount(db.getAccountProfileById(id)!, force),
        confirmSwitch: async (id: string, switchId: string) =>
          service.confirmAccountSwitch(id, switchId),
        cancelSwitch: async (switchId: string) => service.cancelAccountSwitch(switchId),
        openLauncher: async () => {
          await openLauncher('C:/Riot Games/Riot Client/RiotClientServices.exe');
          return { success: true, message: 'Requested opening Riot Client.' };
        },
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
    await useAppStore.getState().refreshLauncherStatuses();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    db.close();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('1. correctly detects Riot running status when Riot Client and League of Legends are active', () => {
    const statuses = service.getPlatformLauncherStatuses(
      new Set(['riotclientservices.exe', 'leagueclient.exe'])
    );
    expect(statuses.riot.isRunning).toBe(true);

    const processDetails = service.getRiotProcessDetails(
      new Set(['riotclientservices.exe', 'leagueclient.exe'])
    );
    expect(processDetails.isClientRunning).toBe(true);
    expect(processDetails.isGameRunning).toBe(true);
    expect(processDetails.runningProcesses).toEqual([
      'riotclientservices.exe',
      'leagueclient.exe',
    ]);
  });

  it('2. transitions from littleimad to Melynelas, recording fromAccountId and contextual instructions', async () => {
    // Select Account A (littleimad) and confirm it
    const firstSwitch = await service.switchAccount(db.getAccountProfileById(littleimadId)!);
    service.confirmAccountSwitch(littleimadId, firstSwitch.switchId!);
    expect(db.getActivePlatformProfiles().riot?.accountId).toBe(littleimadId);

    // Now switch from littleimad to Account B (Melynelas)
    const secondSwitch = await service.switchAccount(db.getAccountProfileById(melynelasId)!);
    expect(secondSwitch.success).toBe(true);
    expect(secondSwitch.fromAccountId).toBe(littleimadId);
    expect(secondSwitch.instructions?.[0]).toContain('sign out of that account in the client first');
    expect(openLauncher).toHaveBeenCalledTimes(2);

    // Profile in SQLite must be updated as last selected
    expect(db.getAccountProfileById(melynelasId)?.isLastSelected).toBe(true);
    expect(db.getAccountProfileById(littleimadId)?.isLastSelected).toBe(false);

    // But confirmed active profile remains littleimad until user confirms Melynelas
    expect(db.getActivePlatformProfiles().riot?.accountId).toBe(littleimadId);

    // Confirm Melynelas
    const confirmation = service.confirmAccountSwitch(melynelasId, secondSwitch.switchId!);
    expect(confirmation.verificationStatus).toBe('user-confirmed');
    expect(db.getActivePlatformProfiles().riot?.accountId).toBe(melynelasId);

    // History record shows transition from littleimad to Melynelas
    const history = db.getAccountSwitchHistory(melynelasId);
    expect(history[0]).toMatchObject({
      fromAccountId: littleimadId,
      platformId: 'riot',
      success: true,
    });
  });

  it('3. does not re-open launcher or create redundant requests when selecting an already active profile', async () => {
    // Select and confirm littleimad
    const first = await service.switchAccount(db.getAccountProfileById(littleimadId)!);
    service.confirmAccountSwitch(littleimadId, first.switchId!);
    expect(openLauncher).toHaveBeenCalledTimes(1);

    // Selecting littleimad again without forceReauth returns isAlreadySelected: true
    const repeated = await service.switchAccount(db.getAccountProfileById(littleimadId)!);
    expect(repeated.isAlreadySelected).toBe(true);
    expect(repeated.launcherStarted).toBe(false);
    expect(openLauncher).toHaveBeenCalledTimes(1); // not called again
  });

  it('4. renders the focused Riot Account Switcher Status Panel in the UI', () => {
    render(<AccountsPage />);

    const panel = screen.getByTestId('riot-account-status-panel');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent('Selected Profile');
    expect(panel).toHaveTextContent('Last User-Confirmed');
    expect(panel).toHaveTextContent('Authentication Unknown • Manual Sign-In Required');
    expect(screen.getByTestId('riot-section-open-launcher-btn')).toBeInTheDocument();
  });

  it('5. clicking Open Riot Client in section header invokes launcher directly without creating switch records', async () => {
    render(<AccountsPage />);

    const openBtn = screen.getByTestId('riot-section-open-launcher-btn');
    fireEvent.click(openBtn);

    expect(openLauncher).toHaveBeenCalledWith('C:/Riot Games/Riot Client/RiotClientServices.exe');
    // Switch history must remain completely empty
    expect(db.getAccountSwitchHistory()).toEqual([]);
  });

  it('6. resolves Riot Client from RiotClientInstalls.json if standard path is missing', () => {
    const mockJsonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-riot-installs-'));
    const manifestDir = path.join(mockJsonDir, 'Riot Games');
    fs.mkdirSync(manifestDir, { recursive: true });

    const mockExe = path.join(mockJsonDir, 'CustomRiotClient.exe');
    fs.writeFileSync(mockExe, 'mock-binary');

    fs.writeFileSync(
      path.join(manifestDir, 'RiotClientInstalls.json'),
      JSON.stringify({ rc_live: mockExe, rc_default: mockExe })
    );

    const oldProgramData = process.env.ProgramData;
    const oldAllUsers = process.env.ALLUSERSPROFILE;
    try {
      process.env.ProgramData = mockJsonDir;
      process.env.ALLUSERSPROFILE = mockJsonDir;

      const adapter = createWindowsAccountLauncherAdapter(() => {
        throw new Error('No shortcuts');
      });

      const resolved = adapter.resolveLauncher('riot');
      expect(resolved).toBe(mockExe);
    } finally {
      process.env.ProgramData = oldProgramData;
      process.env.ALLUSERSPROFILE = oldAllUsers;
      fs.rmSync(mockJsonDir, { recursive: true, force: true });
    }
  });
});
