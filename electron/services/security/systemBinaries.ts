import { execFileSync } from 'node:child_process';
import path from 'node:path';

const SYSTEM32_TOOLS = new Set(['icacls.exe', 'reg.exe', 'taskkill.exe', 'tasklist.exe', 'whoami.exe']);

/**
 * Windows resolves bare command names against the working directory before PATH, so system tools
 * are always started by absolute path.
 */
export function windowsDirectory(): string {
  const root = process.env.SystemRoot || process.env.windir || '';
  return /^[A-Za-z]:\\[^\\]/.test(root) ? path.win32.normalize(root) : 'C:\\Windows';
}

export function windowsPowerShellPath(): string {
  return path.win32.join(windowsDirectory(), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

export function system32Binary(name: string): string {
  return path.win32.join(windowsDirectory(), 'System32', name);
}

const HIGH_OR_SYSTEM_INTEGRITY_SIDS = ['S-1-16-12288', 'S-1-16-16384'];
let cachedElevation: boolean | undefined;

/** True when `whoami /groups` output shows a high or system mandatory integrity level. */
export function parseElevatedFromWhoamiGroups(output: string): boolean {
  return HIGH_OR_SYSTEM_INTEGRITY_SIDS.some((sid) => output.includes(`"${sid}"`));
}

/** Whether this process runs elevated; a token's integrity level is fixed for the process lifetime. */
export function isCurrentProcessElevated(): boolean {
  if (cachedElevation !== undefined) {
    return cachedElevation;
  }
  if (process.platform !== 'win32') {
    cachedElevation = false;
    return cachedElevation;
  }
  try {
    const output = execFileSync(system32Binary('whoami.exe'), ['/groups', '/fo', 'csv', '/nh'], {
      windowsHide: true,
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    cachedElevation = parseElevatedFromWhoamiGroups(output);
  } catch {
    cachedElevation = false;
  }
  return cachedElevation;
}

/** Maps a known bare system tool name to its absolute path; other commands are returned unchanged. */
export function resolveSystemBinary(command: string): string {
  const lower = command.toLowerCase();
  if (lower === 'powershell.exe') {
    return windowsPowerShellPath();
  }
  return SYSTEM32_TOOLS.has(lower) ? system32Binary(lower) : command;
}
