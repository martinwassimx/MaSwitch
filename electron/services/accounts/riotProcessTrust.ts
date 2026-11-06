import { execFile } from 'node:child_process';
import { windowsPowerShellPath } from '../security/systemBinaries';

/**
 * Organization (O=) of the Authenticode signer on the official Riot Client binaries
 * (RiotClientServices.exe and RiotClientElectron\Riot Client.exe), chained to DigiCert.
 */
export const RIOT_SIGNER_ORGANIZATION = 'Riot Games, Inc.';

export interface ProcessTrustResult {
  trusted: boolean;
  imagePath?: string;
  reason?: string;
}

export interface AuthenticodeReport {
  path: string | null;
  status: string | null;
  subject: string | null;
}

/**
 * Reads the process image path and its Authenticode status. The PID reaches PowerShell only
 * through an environment variable and is re-parsed as an integer inside the fixed script.
 */
const VERIFY_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '$targetPid = 0',
  'if (-not [int]::TryParse($env:MASWITCH_VERIFY_PID, [ref]$targetPid) -or $targetPid -le 0) { throw "invalid pid" }',
  '$imagePath = (Get-Process -Id $targetPid).Path',
  'if (-not $imagePath) { throw "no image path" }',
  '$sig = Get-AuthenticodeSignature -LiteralPath $imagePath',
  '$subject = $null',
  'if ($sig.SignerCertificate) { $subject = $sig.SignerCertificate.Subject }',
  '[PSCustomObject]@{ path = $imagePath; status = [string]$sig.Status; subject = $subject } | ConvertTo-Json -Compress',
].join('; ');

export function readSignerOrganization(subject: string | null | undefined): string | null {
  if (!subject) {
    return null;
  }
  const match = /(?:^|,\s*)O=(?:"((?:[^"]|"")*)"|([^,]*))/.exec(subject);
  if (!match) {
    return null;
  }
  return (match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2]).trim();
}

export function evaluateRiotSignature(report: AuthenticodeReport): ProcessTrustResult {
  const imagePath = report.path ?? undefined;
  if (report.status !== 'Valid') {
    return { trusted: false, imagePath, reason: `Authenticode status is ${report.status ?? 'unknown'}.` };
  }
  const organization = readSignerOrganization(report.subject);
  if (organization !== RIOT_SIGNER_ORGANIZATION) {
    return { trusted: false, imagePath, reason: 'Process is not signed by Riot Games.' };
  }
  return { trusted: true, imagePath };
}

export function queryAuthenticode(pid: number): Promise<AuthenticodeReport> {
  return new Promise((resolve, reject) => {
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      reject(new Error('Invalid process ID.'));
      return;
    }
    execFile(
      windowsPowerShellPath(),
      ['-NoProfile', '-NonInteractive', '-Command', VERIFY_SCRIPT],
      {
        env: { ...process.env, MASWITCH_VERIFY_PID: String(pid) },
        timeout: 20_000,
        windowsHide: true,
        maxBuffer: 64 * 1024,
      },
      (err, stdout) => {
        if (err) {
          reject(new Error('Unable to verify the Riot Client process signature.'));
          return;
        }
        try {
          const parsed = JSON.parse(String(stdout).trim()) as Partial<AuthenticodeReport>;
          resolve({
            path: typeof parsed.path === 'string' ? parsed.path : null,
            status: typeof parsed.status === 'string' ? parsed.status : null,
            subject: typeof parsed.subject === 'string' ? parsed.subject : null,
          });
        } catch {
          reject(new Error('Unable to parse the Riot Client signature check.'));
        }
      }
    );
  });
}

/**
 * Verifies that a process image is signed by Riot Games. Results are not cached: a PID can be
 * reused by another process after the Riot Client exits.
 */
export function createRiotProcessTrustVerifier(
  query: (pid: number) => Promise<AuthenticodeReport> = queryAuthenticode
): (pid: number) => Promise<ProcessTrustResult> {
  return async (pid: number) => {
    try {
      return evaluateRiotSignature(await query(pid));
    } catch (err) {
      return { trusted: false, reason: err instanceof Error ? err.message : String(err) };
    }
  };
}
