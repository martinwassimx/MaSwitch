import fs from 'node:fs';
import path from 'node:path';
import { normalizeWindowsPath } from '../security/pathApprovalRegistry';
import { windowsDirectory } from '../security/systemBinaries';

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

/** Chromium/Electron switches that make the launched program run another command line. */
const COMMAND_PREFIX_SWITCH_PATTERN =
  /(^|\s)["']?--?(gpu-launcher|renderer-cmd-prefix|utility-cmd-prefix|gpu-process-cmd-prefix|plugin-launcher|ppapi-plugin-launcher|nacl-loader-cmd-prefix|browser-subprocess-path|renderer-process-cmd-prefix|utility-process-cmd-prefix)\b/i;

const DRIVE_PATH_PATTERN = /^[A-Za-z]:\\/;
const UNC_SHARE_PATH_PATTERN = /^\\\\[^\\?.][^\\]*\\[^\\]+\\/;

function realPathOrSelf(candidate: string): string {
  try {
    return fs.realpathSync.native(candidate);
  } catch {
    return candidate;
  }
}

function isInsideWindowsDirectory(candidate: string): boolean {
  const winDir = windowsDirectory().toLowerCase();
  const realWinDir = realPathOrSelf(winDir).toLowerCase();
  // Resolving a UNC path would contact the remote server (and offer NTLM credentials) during validation.
  const resolved = DRIVE_PATH_PATTERN.test(candidate) ? realPathOrSelf(candidate) : candidate;
  return [candidate.toLowerCase(), resolved.toLowerCase()].some(
    (p) => p === winDir || p.startsWith(`${winDir}\\`) || p === realWinDir || p.startsWith(`${realWinDir}\\`)
  );
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
  if (!DRIVE_PATH_PATTERN.test(normalized) && !UNC_SHARE_PATH_PATTERN.test(normalized)) {
    throw new Error('Executable path must be a full drive-letter or network share path.');
  }
  const segments = normalized.split('\\').filter(Boolean);
  if (segments.some((segment) => /[. ]$/.test(segment) || segment.includes(':', segment === segments[0] ? 2 : 0))) {
    throw new Error('Executable path contains an invalid folder or file name.');
  }
  const lower = normalized.toLowerCase();
  if (!lower.endsWith('.exe')) {
    throw new Error('Target file must be a Windows executable (.exe).');
  }
  if (DENIED_EXECUTABLE_NAMES.has(path.win32.basename(lower))) {
    throw new Error('This system tool cannot be added as a game or application.');
  }
  if (isInsideWindowsDirectory(normalized)) {
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
  if (COMMAND_PREFIX_SWITCH_PATTERN.test(rawArgs)) {
    throw new Error('Launch arguments that run other programs are not allowed.');
  }
}

export { PathApprovalRegistry as ExecutableApprovalRegistry } from '../security/pathApprovalRegistry';
