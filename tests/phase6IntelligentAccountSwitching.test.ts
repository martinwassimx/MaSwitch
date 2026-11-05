import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Database } from 'node-sqlite3-wasm';
import {
  AccountSwitcherService, createWindowsAccountLauncherAdapter, PLATFORM_CAPABILITIES,
} from '../electron/services/accounts/accountSwitcherService';
import {
  MaSwitchSqliteDatabase, SQLITE_MIGRATIONS,
} from '../electron/services/database/sqliteDatabase';
import type { PlatformId } from '../src/shared/types/platform';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const spawn = vi.fn();
  return { ...actual, default: { ...actual, spawn }, spawn };
});

describe('Account selection and client handoff', () => {
  let dir: string;
  let dbPath: string;
  let db: MaSwitchSqliteDatabase;
  let service: AccountSwitcherService;
  const resolveLauncher = vi.fn((platform: PlatformId): string | null => `C:/mock/${platform}.exe`);
  const openLauncher = vi.fn(async (_executable: string) => {});
  const adapter = { resolveLauncher, openLauncher };

  beforeEach(() => {
    vi.clearAllMocks();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-handoff-'));
    dbPath = path.join(dir, 'accounts.sqlite');
    db = new MaSwitchSqliteDatabase(dbPath);
    service = new AccountSwitcherService(db, adapter);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const addProfile = (platformId: PlatformId, username: string, isPreferred = false) =>
    db.createAccountProfile({ platformId, username, displayName: username, isPreferred });

  it('selects Riot A then B, opens Riot once per choice, and records only explicit sign-in reports', async () => {
    const a = addProfile('riot', 'littleimad', true);
    const b = addProfile('riot', 'Melynelas');

    const first = await service.switchAccount(a);
    expect(first).toMatchObject({ success: true, launcherStarted: true, pendingConfirmation: true,
      verificationStatus: 'manual-confirmation-needed' });
    expect(first.instructions?.join(' ')).toContain('Riot login username');
    expect(db.getAccountProfileById(a.id)).toMatchObject({ isLastSelected: true, lastUsedAt: null });
    expect(db.getActivePlatformProfiles().riot).toBeUndefined();
    expect(db.getAccountSwitchHistory()).toEqual([]);
    expect(service.confirmAccountSwitch(a.id, first.switchId!).verificationStatus).toBe('user-confirmed');

    const second = await service.switchAccount(b);
    expect(second.fromAccountId).toBe(a.id);
    expect(openLauncher.mock.calls).toEqual([['C:/mock/riot.exe'], ['C:/mock/riot.exe']]);
    expect(db.getAccountProfileById(a.id)).toMatchObject({ isPreferred: true, isLastSelected: false });
    expect(db.getAccountProfileById(b.id)).toMatchObject({ isPreferred: false, isLastSelected: true });
    expect(db.getActivePlatformProfiles().riot?.accountId).toBe(a.id);
    const confirmed = service.confirmAccountSwitch(b.id, second.switchId!);
    expect(confirmed.verificationStatus).toBe('user-confirmed');
    expect(db.getAccountProfileById(b.id)?.lastUsedAt).toBe(confirmed.lastUsedAt);
    expect(db.getAccountSwitchHistory(b.id)[0]).toMatchObject({
      fromAccountId: a.id, details: 'User reported signing in through the launcher.',
    });
    expect(service.getPlatformLauncherStatuses(new Set(['riotclientservices.exe'])).riot
      .verifiedActiveAccountUsername).toBeUndefined();
  });

  it.each([
    ['steam', 'Change Account'],
    ['discord', 'Switch Accounts'],
  ] as const)('hands A to B off to the supported %s native chooser', async (platform, menu) => {
    const a = addProfile(platform, 'Account A');
    const b = addProfile(platform, 'Account B');
    const first = await service.switchAccount(a);
    service.confirmAccountSwitch(a.id, first.switchId!);
    const second = await service.switchAccount(b);
    expect(openLauncher).toHaveBeenNthCalledWith(2, `C:/mock/${platform}.exe`);
    expect(second.instructions?.[0]).toContain(menu);
    expect(second.verificationStatus).toBe('manual-confirmation-needed');
    expect(db.getActivePlatformProfiles()[platform]?.accountId).toBe(a.id);
    expect(PLATFORM_CAPABILITIES[platform].canDetectActiveAccount).toBe(false);
    expect(db.getAccountSwitchHistory(b.id)).toEqual([]);
  });

  it.each([
    ['epic', 'Sign Out'],
    ['ea', 'upper left'],
    ['ubisoft', 'Ubisoft Connect PC'],
    ['rockstar', 'upper right'],
    ['gog', 'GOG Galaxy'],
  ] as const)('opens the %s client for manual sign-in', async (platform, instruction) => {
    const target = addProfile(platform, 'Account A');
    const result = await service.switchAccount(target);
    expect(openLauncher.mock.calls).toEqual([[`C:/mock/${platform}.exe`]]);
    expect(result.instructions?.[0]).toContain(instruction);
    expect(result.verificationStatus).toBe('manual-confirmation-needed');
    expect(PLATFORM_CAPABILITIES[platform].requiresManualSignIn).toBe(true);
    expect(db.getAccountSwitchHistory()).toEqual([]);
  });

  it('passes zero arguments and waits for Windows spawn acknowledgement', async () => {
    const unref = vi.fn();
    const child = Object.assign(new EventEmitter(), { unref });
    vi.mocked(spawn).mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);
    const adapter = createWindowsAccountLauncherAdapter(() => {
      throw new Error('No shortcuts needed to open a resolved path.');
    });
    const executable = path.resolve('fake', 'RiotClientServices.exe');
    const opened = adapter.openLauncher(executable);
    expect(spawn).toHaveBeenCalledWith(executable, [], {
      cwd: path.dirname(executable), detached: true, stdio: 'ignore',
    });
    expect(unref).not.toHaveBeenCalled();
    child.emit('spawn');
    await expect(opened).resolves.toBeUndefined();
    expect(unref).toHaveBeenCalledTimes(1);

    const failingChild = new EventEmitter();
    vi.mocked(spawn).mockReturnValueOnce(failingChild as unknown as ReturnType<typeof spawn>);
    const failed = adapter.openLauncher(executable);
    failingChild.emit('error', new Error('Access denied'));
    await expect(failed).rejects.toThrow('Access denied');
  });

  it('cancels without changing confirmation, and requires an explicit retry of the last selection', async () => {
    const target = addProfile('riot', 'Melynelas');
    const first = await service.switchAccount(target);
    service.cancelAccountSwitch(first.switchId!);
    expect(() => service.confirmAccountSwitch(target.id, first.switchId!)).toThrow(/no matching/);
    expect(db.getAccountSwitchHistory()).toEqual([]);
    expect(await service.switchAccount(target)).toMatchObject({ isAlreadySelected: true, launcherStarted: false });
    expect(openLauncher).toHaveBeenCalledTimes(1);
    const retry = await service.switchAccount(target, true);
    expect(retry.pendingConfirmation).toBe(true);
    expect(retry.switchId).not.toBe(first.switchId);
    expect(openLauncher).toHaveBeenCalledTimes(2);
  });

  it('rejects unrelated, replaced, repeated and edited-profile confirmations', async () => {
    const a = addProfile('riot', 'Account A');
    const b = addProfile('riot', 'Account B');
    expect(() => service.confirmAccountSwitch(a.id, 'unknown')).toThrow(/no matching/);
    const first = await service.switchAccount(a);
    expect(() => service.confirmAccountSwitch(b.id, first.switchId!)).toThrow(/no matching/);
    const second = await service.switchAccount(b);
    expect(() => service.confirmAccountSwitch(a.id, first.switchId!)).toThrow(/no matching/);
    db.updateAccountProfile(b.id, { username: 'New account' });
    expect(() => service.confirmAccountSwitch(b.id, second.switchId!)).toThrow(/profile changed/);
    expect(db.getAccountSwitchHistory()).toEqual([]);
    const retry = await service.switchAccount(db.getAccountProfileById(b.id)!, true);
    service.confirmAccountSwitch(b.id, retry.switchId!);
    expect(() => service.confirmAccountSwitch(b.id, retry.switchId!)).toThrow(/no matching/);
  });

  it('keeps selection, confirmation, and both account records after restart, discarding pending requests', async () => {
    const a = addProfile('riot', 'Account A', true);
    const b = addProfile('riot', 'Account B');
    const first = await service.switchAccount(a);
    service.confirmAccountSwitch(a.id, first.switchId!);
    const second = await service.switchAccount(b);

    db.close();
    db = new MaSwitchSqliteDatabase(dbPath);
    service = new AccountSwitcherService(db, adapter);

    expect(db.getAccountProfiles('riot').map((p) => p.id)).toEqual([a.id, b.id]);
    expect(db.getActivePlatformProfiles().riot?.accountId).toBe(a.id);
    expect(db.getAccountProfileById(b.id)?.isLastSelected).toBe(true);
    expect(await service.switchAccount(b)).toMatchObject({ isAlreadySelected: true });
    expect(() => service.confirmAccountSwitch(b.id, second.switchId!)).toThrow(/no matching/);
  });

  it('distinguishes missing, failed, and unsupported launcher actions from a pending sign-in', async () => {
    const riot = addProfile('riot', 'Account A');
    resolveLauncher.mockReturnValueOnce(null);
    expect(await service.switchAccount(riot)).toMatchObject({
      success: false, launcherStarted: false, message: 'MaSwitch could not locate Riot Client.',
    });
    expect(openLauncher).not.toHaveBeenCalled();

    openLauncher.mockRejectedValueOnce(new Error('spawn ENOENT'));
    expect(await service.switchAccount(riot, true)).toMatchObject({
      success: false, launcherStarted: false, verificationStatus: 'unverified',
      message: 'MaSwitch could not open Riot Client. Try opening it from Windows.',
    });
    expect(await service.switchAccount(addProfile('custom', 'Local User'))).toMatchObject({
      success: false, launcherStarted: false,
    });
    expect(db.getAccountProfileById(riot.id)).toMatchObject({ isLastSelected: true, lastUsedAt: null });
    expect(db.getAccountSwitchHistory()).toEqual([]);
  });

  it('does not treat Steam MostRecent data as supported identity evidence', () => {
    const config = path.join(dir, 'config');
    fs.mkdirSync(config);
    const steamExe = path.join(dir, 'steam.exe');
    const vdf = path.join(config, 'loginusers.vdf');
    const fixture = '"users" { "76561198000000001" { "AccountName" "player" "MostRecent" "1" } }';
    fs.writeFileSync(vdf, fixture);
    resolveLauncher.mockImplementationOnce(() => steamExe);
    const steam = service.getPlatformLauncherStatuses(new Set(['steam.exe'])).steam;
    expect(steam.isRunning).toBe(true);
    expect(steam.verifiedActiveAccountUsername).toBeUndefined();
    expect(fs.readFileSync(vdf, 'utf8')).toBe(fixture);
  });

  it('migrates legacy rows without converting launcher opens or cached identity into verification', () => {
    const legacyPath = path.join(dir, 'legacy.sqlite');
    const legacy = new Database(legacyPath);
    for (const migration of SQLITE_MIGRATIONS.filter(({ version }) => version <= 7)) {
      legacy.exec(migration.sql);
    }
    legacy.exec(`
      PRAGMA user_version = 7;
      INSERT INTO account_profiles (id, platform_id, display_name, username, is_preferred, last_used_at, created_at, updated_at)
      VALUES ('a', 'riot', 'Riot A', 'a', 1, '2026-01-01', '2026-01-01', '2026-01-01'),
        ('b', 'steam', 'Steam B', 'b', 0, '2026-01-01', '2026-01-01', '2026-01-01');
      INSERT INTO platform_active_profiles (platform_id, account_id, confirmed_at, verification_status)
      VALUES ('riot', 'a', '2026-01-01', 'user-confirmed'), ('steam', 'b', '2026-01-01', 'verified');
      INSERT INTO account_switch_history (id, account_id, platform_id, switched_at, success, method_used, details)
      VALUES ('sw-b', 'b', 'steam', '2026-01-01', 1, 'Steam', 'Authentication verified via local Steam configuration for b');
    `);
    legacy.close();
    const migrated = new MaSwitchSqliteDatabase(legacyPath);
    try {
      expect(migrated.getAccountProfiles()).toHaveLength(2);
      expect(migrated.getAccountProfileById('a')).toMatchObject({ isPreferred: true, isLastSelected: true });
      expect(migrated.getActivePlatformProfiles().riot).toBeUndefined();
      expect(migrated.getActivePlatformProfiles().steam?.verificationStatus).toBe('user-confirmed');
      expect(migrated.getAccountSwitchHistory()).toHaveLength(1);
    } finally {
      migrated.close();
    }
  });
});

