import path from 'node:path';
import { normalizeWindowsPath } from '../security/pathApprovalRegistry';

const MAX_LAUNCH_ARGS_LENGTH = 2048;

/** Windows binaries that can execute arbitrary commands or scripts on behalf of a caller. */
const DENIED_EXECUTABLE_NAMES = new Set([
  'bash.exe',
  'bitsadmin.exe',
  'certutil.exe',
  'cmd.exe',
  'cmstp.exe',
  'conhost.exe',
  'cscript.exe',
  'curl.exe',
  'explorer.exe',
  'forfiles.exe',
  'ftp.exe',
  'hh.exe',
  'installutil.exe',
  'msbuild.exe',
  'mshta.exe',
  'msiexec.exe',
  'powershell.exe',
  'powershell_ise.exe',
  'pwsh.exe',
  'reg.exe',
  'regasm.exe',
  'regsvcs.exe',
  'regsvr32.exe',
  'rundll32.exe',
  'schtasks.exe',
  'wmic.exe',
  'wscript.exe',
  'wsl.exe',
]);

export const normalizeExecutablePath = normalizeWindowsPath;

function windowsDirectory(): string {
  return path.win32.normalize(process.env.SystemRoot || process.env.windir || 'C:\\Windows').toLowerCase();
}

/**
 * Structural checks for executables stored as custom launch targets. Throws on rejection.
 */
export function assertAllowedCustomExecutable(rawPath: unknown): string {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0 || rawPath.length > 1024) {
    throw new Error('Executable path is missing or too long.');
  }
  if (/[\0\r\n"<>|*?]/.test(rawPath)) {
    throw new Error('Executable path contains invalid characters.');
  }
  const normalized = path.win32.normalize(rawPath.trim());
  if (!path.win32.isAbsolute(normalized) || normalized.startsWith('\\\\')) {
    throw new Error('Executable path must be an absolute local path.');
  }
  const lower = normalized.toLowerCase();
  if (!lower.endsWith('.exe')) {
    throw new Error('Target file must be a Windows executable (.exe).');
  }
  if (DENIED_EXECUTABLE_NAMES.has(path.win32.basename(lower))) {
    throw new Error('This system tool cannot be added as a game or application.');
  }
  const winDir = windowsDirectory();
  if (lower === winDir || lower.startsWith(`${winDir}\\`)) {
    throw new Error('Programs inside the Windows system folder cannot be added as games.');
  }
  return normalized;
}

export function assertSafeLaunchArguments(rawArgs: unknown): void {
  if (rawArgs === undefined || rawArgs === null) {
    return;
  }
  if (typeof rawArgs !== 'string' || rawArgs.length > MAX_LAUNCH_ARGS_LENGTH || /[\0\r\n]/.test(rawArgs)) {
    throw new Error('Launch arguments are invalid.');
  }
}

export { PathApprovalRegistry as ExecutableApprovalRegistry } from '../security/pathApprovalRegistry';
