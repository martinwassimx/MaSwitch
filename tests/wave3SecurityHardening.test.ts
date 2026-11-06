import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const electronState = vi.hoisted(() => ({ encryptionAvailable: false }));

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir(), isPackaged: false },
  safeStorage: {
    isEncryptionAvailable: () => electronState.encryptionAvailable,
    encryptString: (value: string) => Buffer.from(`dpapi:${value}`, 'utf8'),
    decryptString: (buffer: Buffer) => {
      const text = buffer.toString('utf8');
      if (!text.startsWith('dpapi:')) {
        throw new Error('not dpapi');
      }
      return text.slice('dpapi:'.length);
    },
  },
}));

import {
  assertAllowedCustomExecutable,
  assertSafeLaunchArguments,
} from '../electron/services/launcher/executableApproval';
import { PathApprovalRegistry, isPathInside } from '../electron/services/security/pathApprovalRegistry';
import { isBackupFileName, pickRestorableSettings } from '../electron/services/backupService';
import {
  createElevatedCleanupGate,
  requiresElevatedCleanup,
  resolveCleanupOperations,
  sanitizeMemoryCleanupRequest,
} from '../electron/services/memory/memoryManagementService';
import {
  SteamGridDbArtworkService,
  sanitizeApplyArtworkInput,
} from '../electron/services/steamgriddb/steamGridDbArtworkService';
import { SteamGridDbSecretStore } from '../electron/services/steamgriddb/steamGridDbSecretStore';
import { parseWhoamiUserSid } from '../electron/services/accounts/riotProductionAdapters';
import type { SteamGridDbClient } from '../electron/services/steamgriddb/steamGridDbClient';
import type { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';
import type { MaSwitchSettings } from '../src/shared/types/settings';

describe('custom executable approval (MS-07)', () => {
  it('accepts a normal game executable', () => {
    expect(assertAllowedCustomExecutable('D:\\Games\\Cool Game\\game.exe')).toBe('D:\\Games\\Cool Game\\game.exe');
  });

  it.each([
    ['C:\\Tools\\cmd.exe'],
    ['D:\\portable\\PowerShell.exe'],
    ['E:\\x\\mshta.exe'],
    ['E:\\x\\rundll32.exe'],
  ])('rejects interpreter or LOLBin %s', (candidate) => {
    expect(() => assertAllowedCustomExecutable(candidate)).toThrow(/system tool/);
  });

  it('rejects programs inside the Windows directory', () => {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    expect(() => assertAllowedCustomExecutable(`${systemRoot}\\System32\\notepad.exe`)).toThrow(/Windows system folder/);
  });

  it.each([
    ['\\\\server\\share\\game.exe', /absolute local path/],
    ['game.exe', /absolute local path/],
    ['D:\\Games\\game.bat', /\.exe/],
    ['D:\\Games\\game.exe" --evil', /invalid characters/],
    ['D:\\Games\\game.exe\n', /invalid characters/],
  ])('rejects malformed path %s', (candidate, error) => {
    expect(() => assertAllowedCustomExecutable(candidate)).toThrow(error);
  });

  it('rejects oversized or multi-line launch arguments', () => {
    expect(() => assertSafeLaunchArguments('-windowed -novid')).not.toThrow();
    expect(() => assertSafeLaunchArguments('a\r\nb')).toThrow();
    expect(() => assertSafeLaunchArguments('x'.repeat(5000))).toThrow();
    expect(() => assertSafeLaunchArguments(42)).toThrow();
  });
});

describe('path approval registry', () => {
  it('approves case-insensitively and expires after the TTL', () => {
    let now = 1_000;
    const registry = new PathApprovalRegistry(() => now, 5_000);
    registry.approve('D:\\Backups\\MaSwitch.json');
    expect(registry.isApproved('d:\\backups\\maswitch.json')).toBe(true);
    expect(registry.isApproved('D:\\Backups\\other.json')).toBe(false);
    now += 6_000;
    expect(registry.isApproved('D:\\Backups\\MaSwitch.json')).toBe(false);
  });

  it('detects traversal outside a root', () => {
    expect(isPathInside('C:\\Data\\backups', 'C:\\Data\\backups\\a.json')).toBe(true);
    expect(isPathInside('C:\\Data\\backups', 'C:\\Data\\backups\\..\\vault.json')).toBe(false);
    expect(isPathInside('C:\\Data\\backups', 'C:\\Data\\backups')).toBe(false);
    expect(isPathInside('C:\\Data\\backups', 'D:\\Data\\backups\\a.json')).toBe(false);
  });
});

describe('backup restore allowlist (MS-08)', () => {
  it('drops security-sensitive settings from untrusted backups', () => {
    const hostile = {
      theme: 'dark',
      excludedApplications: ['obs64.exe'],
      launchOnWindowsStartupPreference: true,
      updateChannel: 'beta',
      autoInstallUpdates: true,
      developerMode: true,
    } as unknown as Partial<MaSwitchSettings>;
    const picked = pickRestorableSettings(hostile) as Record<string, unknown>;
    expect(picked.theme).toBe('dark');
    expect(picked.excludedApplications).toEqual(['obs64.exe']);
    expect(picked).not.toHaveProperty('launchOnWindowsStartupPreference');
    expect(picked).not.toHaveProperty('updateChannel');
    expect(picked).not.toHaveProperty('autoInstallUpdates');
    expect(picked).not.toHaveProperty('developerMode');
  });

  it('only accepts .json backup files', () => {
    expect(isBackupFileName('C:\\b\\MaSwitch-backup.JSON')).toBe(true);
    expect(isBackupFileName('C:\\b\\riot-vault.enc')).toBe(false);
  });
});

describe('memory cleanup request validation and UAC gate (MS-14)', () => {
  it('validates mode and drops unknown or non-boolean operations', () => {
    expect(() => sanitizeMemoryCleanupRequest(null)).toThrow();
    expect(() => sanitizeMemoryCleanupRequest({ mode: 'nuke' })).toThrow();
    const request = sanitizeMemoryCleanupRequest({
      mode: 'standard',
      operations: { standbyList: 'yes', workingSets: true, injected: true },
    });
    expect(request.operations).toEqual({ workingSets: true });

    const workingSetsOnly = {
      workingSets: true,
      systemFileCache: false,
      standbyPriority0: false,
      standbyList: false,
      modifiedPageList: false,
      combineMemoryLists: false,
      registryCache: false,
    };
    const unprivileged = sanitizeMemoryCleanupRequest({ mode: 'standard', operations: workingSetsOnly });
    expect(requiresElevatedCleanup(resolveCleanupOperations(unprivileged))).toBe(false);
    const privileged = sanitizeMemoryCleanupRequest({ mode: 'standard', operations: { ...workingSetsOnly, standbyList: true } });
    expect(requiresElevatedCleanup(resolveCleanupOperations(privileged))).toBe(true);
  });

  it('requires main-process confirmation and rate-limits repeated prompts', async () => {
    let now = 0;
    const confirm = vi.fn(async () => true);
    const gate = createElevatedCleanupGate(confirm, () => now, 60_000);

    expect((await gate()).allowed).toBe(true);
    const second = await gate();
    expect(second.allowed).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);

    now = 61_000;
    expect((await gate()).allowed).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('does not run when the user declines, and declines also start the cooldown', async () => {
    let now = 0;
    const confirm = vi.fn(async () => false);
    const gate = createElevatedCleanupGate(confirm, () => now, 60_000);
    expect((await gate()).allowed).toBe(false);
    now = 1_000;
    await gate();
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('refuses concurrent prompts while a confirmation is pending', async () => {
    let release: (value: boolean) => void = () => undefined;
    const confirm = vi.fn(() => new Promise<boolean>((resolve) => (release = resolve)));
    const gate = createElevatedCleanupGate(confirm, () => 0, 0);
    const first = gate();
    expect((await gate()).allowed).toBe(false);
    release(true);
    expect((await first).allowed).toBe(true);
  });
});

describe('SteamGridDB artwork hardening (MS-19)', () => {
  let artworkDir: string;
  let service: SteamGridDbArtworkService;

  beforeEach(() => {
    artworkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-sgdb-'));
    service = new SteamGridDbArtworkService(
      {} as unknown as SteamGridDbClient,
      {} as unknown as MaSwitchSqliteDatabase,
      artworkDir
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(artworkDir, { recursive: true, force: true });
  });

  const imageResponse = (bytes: number, init?: { url?: string; contentType?: string }) => {
    const response = new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { 'content-type': init?.contentType ?? 'image/png' },
    });
    if (init?.url) {
      Object.defineProperty(response, 'url', { value: init.url });
    }
    return response;
  };

  it('keeps cached files inside the artwork folder even with a hostile game id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(16)));
    const result = await service.downloadAndCacheAsset(
      '..\\..\\evil' as unknown as number,
      'grid',
      'https://cdn2.steamgriddb.com/grid/abc.png',
      5
    );
    expect(result).toBe('maswitch-asset://artwork/sgdb_0_grid_5.png');
    expect(fs.readdirSync(artworkDir)).toEqual(['sgdb_0_grid_5.png']);
  });

  it('rejects an unknown asset type', async () => {
    const fetchMock = vi.fn(async () => imageResponse(16));
    vi.stubGlobal('fetch', fetchMock);
    const result = await service.downloadAndCacheAsset(1, '../x' as never, 'https://cdn2.steamgriddb.com/a.png', 1);
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a redirect that leaves the SteamGridDB CDN', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(16, { url: 'https://evil.example/a.png' })));
    expect(await service.downloadAndCacheAsset(1, 'grid', 'https://cdn2.steamgriddb.com/a.png', 2)).toBeNull();
    expect(fs.readdirSync(artworkDir)).toEqual([]);
  });

  it('rejects non-image responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(16, { contentType: 'text/html' })));
    expect(await service.downloadAndCacheAsset(1, 'grid', 'https://cdn2.steamgriddb.com/a.png', 3)).toBeNull();
  });

  it('enforces the size cap on streamed bytes when Content-Length is absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(15 * 1024 * 1024 + 1)));
    expect(await service.downloadAndCacheAsset(1, 'hero', 'https://cdn2.steamgriddb.com/big.png', 4)).toBeNull();
    expect(fs.readdirSync(artworkDir)).toEqual([]);
  });

  it('validates manual artwork input from the renderer', () => {
    expect(sanitizeApplyArtworkInput(null)).toBeNull();
    expect(sanitizeApplyArtworkInput({ gameId: 'g1', sgdbGameId: '../1' })).toBeNull();
    expect(sanitizeApplyArtworkInput({ gameId: 'g1', coverUrl: 42 })).toBeNull();
    expect(
      sanitizeApplyArtworkInput({
        gameId: ' g1 ',
        sgdbGameId: 77,
        coverUrl: 'https://cdn2.steamgriddb.com/grid/a.png',
        heroUrl: 'maswitch-asset://artwork/sgdb_77_hero_1.jpg',
        logoUrl: 'file:///C:/Windows/win.ini',
        iconUrl: 'javascript:alert(1)',
      })
    ).toEqual({
      gameId: 'g1',
      sgdbGameId: 77,
      coverUrl: 'https://cdn2.steamgriddb.com/grid/a.png',
      heroUrl: 'maswitch-asset://artwork/sgdb_77_hero_1.jpg',
    });
  });
});

describe('SteamGridDB key storage (MS-20)', () => {
  let userDataDir: string;

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-sgdb-key-'));
  });

  afterEach(() => {
    electronState.encryptionAvailable = false;
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  const secretFile = () => path.join(userDataDir, 'secrets', 'steamgriddb.enc');

  it('keeps the key in memory only when DPAPI is unavailable', () => {
    electronState.encryptionAvailable = false;
    const store = new SteamGridDbSecretStore(userDataDir);
    expect(store.saveApiKey('synthetic-test-key')).toBe(false);
    expect(store.getApiKey()).toBe('synthetic-test-key');
    expect(fs.existsSync(secretFile())).toBe(false);
  });

  it('persists with DPAPI when available', () => {
    electronState.encryptionAvailable = true;
    const store = new SteamGridDbSecretStore(userDataDir);
    expect(store.saveApiKey('synthetic-test-key')).toBe(true);
    expect(fs.readFileSync(secretFile(), 'utf8')).toBe('dpapi:synthetic-test-key');
    expect(new SteamGridDbSecretStore(userDataDir).getApiKey()).toBe('synthetic-test-key');
  });

  it('reads the legacy fixed-key format and migrates it to DPAPI', async () => {
    const crypto = await import('node:crypto');
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      crypto.scryptSync('maswitch-local-secret-salt', 'salt', 32),
      Buffer.alloc(16, 0)
    );
    const legacy = `fb:${cipher.update('synthetic-legacy-key', 'utf8', 'hex')}${cipher.final('hex')}`;
    fs.mkdirSync(path.dirname(secretFile()), { recursive: true });
    fs.writeFileSync(secretFile(), legacy, 'utf8');

    electronState.encryptionAvailable = true;
    expect(new SteamGridDbSecretStore(userDataDir).getApiKey()).toBe('synthetic-legacy-key');
    expect(fs.readFileSync(secretFile(), 'utf8')).toBe('dpapi:synthetic-legacy-key');
  });
});

describe('vault ACL principal (H-05)', () => {
  it('parses the SID from whoami CSV output', () => {
    expect(parseWhoamiUserSid('"host\\user","S-1-5-21-1111-2222-3333-1001"\r\n')).toBe('S-1-5-21-1111-2222-3333-1001');
    expect(parseWhoamiUserSid('"host\\user","not-a-sid"')).toBeNull();
    expect(parseWhoamiUserSid('')).toBeNull();
  });
});
