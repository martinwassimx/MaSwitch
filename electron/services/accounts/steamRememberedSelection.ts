import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { windowsPowerShellPath } from '../security/systemBinaries';
import { parseVdf } from '../scanner/vdfParser';

const exec = promisify(execFile);
export interface SteamPreferenceAccess {
  running(): Promise<boolean>;
  read(): Promise<string | null>;
  write(value: string | null): Promise<void>;
}

export function windowsSteamPreferences(): SteamPreferenceAccess {
  const invoke = async (script: string) => {
    const result = await exec(windowsPowerShellPath(), ['-NoProfile', '-NonInteractive', '-EncodedCommand',
      Buffer.from("$ErrorActionPreference='Stop'; " + script, 'utf16le').toString('base64')],
    { windowsHide: true, timeout: 10000 });
    return result.stdout.trim();
  };
  const key = "HKCU:\\Software\\Valve\\Steam";
  return {
    running: async () => (await invoke("[bool](Get-Process steam,steamwebhelper -ErrorAction SilentlyContinue)")) === 'True',
    read: async () => JSON.parse(await invoke(
      `$k=Get-Item -LiteralPath '${key}'; if ($k.GetValueNames() -contains 'AutoLoginUser') { if ($k.GetValueKind('AutoLoginUser') -ne 'String') { throw 'Unexpected preference type' }; ConvertTo-Json -Compress $k.GetValue('AutoLoginUser') } else { 'null' }`
    )) as string | null,
    write: async (value) => {
      if (value === null) {
        await invoke(`if ((Get-Item -LiteralPath '${key}').GetValueNames() -contains 'AutoLoginUser') { Remove-ItemProperty -LiteralPath '${key}' -Name AutoLoginUser }`);
      } else {
        const encoded = Buffer.from(value, 'utf8').toString('base64');
        await invoke(`$v=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')); New-ItemProperty -LiteralPath '${key}' -Name AutoLoginUser -PropertyType String -Value $v -Force | Out-Null`);
      }
    },
  };
}

/** Only the non-secret AutoLoginUser preference is written. Steam owns authentication. */
export class SteamRememberedSelection {
  constructor(private readonly access: SteamPreferenceAccess, private readonly backupPath: string) {}

  async select(executable: string, identifier: string, open: () => Promise<void>): Promise<void> {
    if (await this.access.running()) throw new Error('Exit Steam normally, then retry remembered-account selection.');
    this.validateIdentifier(identifier);
    const users = parseVdf(fs.readFileSync(path.join(path.dirname(executable), 'config', 'loginusers.vdf'), 'utf8')).users;
    if (!users || typeof users !== 'object') throw new Error('Steam remembered accounts are unavailable.');
    const matches = Object.entries(users).filter(([id, value]) => typeof value === 'object' &&
      (id === identifier || String(value.AccountName).toLowerCase() === identifier.toLowerCase()));
    if (matches.length !== 1) throw new Error('Sign in to this account in Steam with Remember me enabled first.');
    const account = matches[0][1];
    if (typeof account !== 'object' || account.RememberPassword !== '1' || account.AllowAutoLogin !== '1' || typeof account.AccountName !== 'string') {
      throw new Error('Steam has not enabled remembered sign-in for this account. Use its account chooser.');
    }
    this.validateIdentifier(account.AccountName);
    if (fs.existsSync(this.backupPath)) {
      const prior = JSON.parse(fs.readFileSync(this.backupPath, 'utf8')) as { previous: string | null; target: string; pending: boolean };
      if (prior.pending) {
        if (prior.previous !== null && (typeof prior.previous !== 'string' || prior.previous.length > 1024)) throw new Error('Invalid saved Steam preference.');
        this.validateIdentifier(prior.target);
        const current = await this.access.read();
        if (current !== prior.target && current !== prior.previous) throw new Error('Steam preference changed externally. Review the saved backup before retrying.');
        await this.access.write(prior.previous);
        if (await this.access.read() !== prior.previous) throw new Error('Steam preference recovery failed. Backup retained.');
      }
    }
    const previous = await this.access.read();
    const target = account.AccountName;
    const journal = { previous, target, pending: true };
    fs.mkdirSync(path.dirname(this.backupPath), { recursive: true });
    // Write and flush the backup before touching Steam's preference.
    this.saveJournal(journal);
    try {
      if (await this.access.running()) throw new Error('Steam started during selection. Exit it and retry.');
      if (await this.access.read() !== previous) throw new Error('Steam preference changed during selection.');
      await this.access.write(target);
      if (await this.access.read() !== target) throw new Error('Steam preference update could not be verified.');
      await open();
      this.saveJournal({ ...journal, pending: false });
    } catch (error) {
      if (await this.access.running()) throw new Error('Selection failed while Steam was running. Exit Steam and retry to recover the saved preference.');
      const current = await this.access.read();
      if (current === target) await this.access.write(previous);
      else if (current !== previous) throw new Error('Steam preference changed externally. The backup was retained for recovery.');
      if (await this.access.read() !== previous) throw new Error('Steam preference rollback failed. Backup retained.');
      this.saveJournal({ ...journal, pending: false });
      throw error;
    }
  }

  private saveJournal(journal: { previous: string | null; target: string; pending: boolean }): void {
    const temporary = `${this.backupPath}.${randomUUID()}.tmp`;
    const fd = fs.openSync(temporary, 'wx');
    try {
      fs.writeFileSync(fd, JSON.stringify(journal));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try { fs.renameSync(temporary, this.backupPath); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }

  private validateIdentifier(value: string): void {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_]{1,64}$/.test(value)) throw new Error('Use the Steam login name or SteamID64 for remembered-account selection.');
  }
}
