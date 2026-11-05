import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SteamRememberedSelection } from '../electron/services/accounts/steamRememberedSelection';

let dir: string;
let value: string | null;
let selector: SteamRememberedSelection;
const running = vi.fn(async () => false);
const write = vi.fn(async (next: string | null) => { value = next; });
const open = vi.fn(async () => {});
beforeEach(() => {
  vi.resetAllMocks();
  running.mockResolvedValue(false);
  write.mockImplementation(async (next) => { value = next; });
  value = 'alice';
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-preference-'));
  fs.mkdirSync(path.join(dir, 'config'));
  fs.writeFileSync(path.join(dir, 'config/loginusers.vdf'), '"users" { "1" { "AccountName" "alice" "RememberPassword" "1" "AllowAutoLogin" "1" } "2" { "AccountName" "bob" "RememberPassword" "1" "AllowAutoLogin" "1" } }');
  selector = new SteamRememberedSelection({ running, read: async () => value, write }, path.join(dir, 'backup.json'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const select = (name: string) => selector.select(path.join(dir, 'steam.exe'), name, open);
it('selects A to B and B to A while preserving the remembered-account file', async () => {
  const original = fs.readFileSync(path.join(dir, 'config/loginusers.vdf'), 'utf8');
  await select('bob'); expect(value).toBe('bob');
  await select('alice'); expect(value).toBe('alice');
  expect(open).toHaveBeenCalledTimes(2);
  expect(fs.readFileSync(path.join(dir, 'config/loginusers.vdf'), 'utf8')).toBe(original);
});
it('rejects a missing remembered account without changing preferences or opening Steam', async () => {
  await expect(select('missing')).rejects.toThrow(/Remember me/);
  expect(write).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
});
it('refuses to modify preferences while Steam is running', async () => {
  running.mockResolvedValue(true);
  await expect(select('bob')).rejects.toThrow(/Exit Steam/);
  expect(write).not.toHaveBeenCalled();
});
it('backs up before a failed configuration update', async () => {
  write.mockRejectedValueOnce(new Error('access denied'));
  await expect(select('bob')).rejects.toThrow('access denied');
  expect(JSON.parse(fs.readFileSync(path.join(dir, 'backup.json'), 'utf8')).previous).toBe('alice');
  expect(value).toBe('alice'); expect(open).not.toHaveBeenCalled();
});
it('rolls back when opening the launcher fails', async () => {
  open.mockRejectedValueOnce(new Error('launcher unavailable'));
  await expect(select('bob')).rejects.toThrow('launcher unavailable');
  expect(value).toBe('alice');
});
it('recovers an interrupted request after application restart', async () => {
  value = 'bob';
  fs.writeFileSync(path.join(dir, 'backup.json'), JSON.stringify({ previous: 'alice', target: 'bob', pending: true }));
  await select('alice');
  expect(value).toBe('alice');
  expect(write).toHaveBeenNthCalledWith(1, 'alice');
});
it('preserves an external preference change instead of overwriting it during recovery', async () => {
  value = 'charlie';
  fs.writeFileSync(path.join(dir, 'backup.json'), JSON.stringify({ previous: 'alice', target: 'bob', pending: true }));
  await expect(select('alice')).rejects.toThrow(/changed externally/);
  expect(value).toBe('charlie'); expect(write).not.toHaveBeenCalled();
});
