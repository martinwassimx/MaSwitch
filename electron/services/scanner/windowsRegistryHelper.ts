import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { system32Binary } from '../security/systemBinaries';

const execFileAsync = promisify(execFile);

const IGNORED_EXECUTABLE_PATTERNS = [
  /^unins\d*\.exe$/i,
  /uninstall/i,
  /unitycrashhandler/i,
  /crashreport/i,
  /crashpad/i,
  /crashsender/i,
  /bugreport/i,
  /vc_redist/i,
  /vcredist/i,
  /dxsetup/i,
  /directx/i,
  /dotnet/i,
  /easyanticheat/i,
  /eaanticheat/i,
  /beservice/i,
  /battleye/i,
  /cefprocess/i,
  /zosSteamStarter/i,
  /cleanup\.exe$/i,
  /touchup\.exe$/i,
  /quicksfv/i,
  /notification_helper/i,
  /msedgewebview2/i,
  /crs-handler/i,
  /vroriginselector/i,
  /forzaprotocolselector/i,
  /installer\.exe$/i,
  /oalinst\.exe$/i,
];

const IGNORED_FOLDER_NAMES = new Set([
  '_commonredist',
  'directx',
  'redist',
  'vcredist',
  'support',
  'installers',
  '__installer',
  'easyanticheat',
  'eaanticheat',
  'battleye',
  'crashreporter',
]);

export function isIgnoredHelperExecutable(exeFileName: string): boolean {
  const base = path.basename(exeFileName);
  return IGNORED_EXECUTABLE_PATTERNS.some((regex) => regex.test(base));
}

/**
 * Safely scans a game installation folder up to `maxDepth` (default 3)
 * without following symlinks/junctions to locate the primary game executable.
 */
export function findPrimaryGameExecutable(
  installDir: string,
  gameTitle?: string,
  maxDepth = 3
): string | null {
  if (!installDir || !fs.existsSync(installDir)) {
    return null;
  }

  const candidates: Array<{ fullPath: string; score: number }> = [];
  const normalizedTitleTokens = (gameTitle ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  function walk(currentDir: string, depth: number): void {
    if (depth > maxDepth || candidates.length >= 40) {
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      // Never follow symbolic links to prevent recursive loops
      if (entry.isSymbolicLink()) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_FOLDER_NAMES.has(entry.name.toLowerCase())) {
          continue;
        }
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
        if (isIgnoredHelperExecutable(entry.name)) {
          continue;
        }

        let sizeScore = 0;
        try {
          const stat = fs.statSync(fullPath);
          // Larger executables (> 1 MB) are more likely to be the main game binary
          sizeScore = Math.min(35, Math.floor(stat.size / (1024 * 1024)));
        } catch {
          continue;
        }

        const lowerName = entry.name.toLowerCase();
        let matchScore = sizeScore - depth * 6;

        for (const token of normalizedTitleTokens) {
          if (lowerName.includes(token)) {
            matchScore += 30;
          }
        }

        const cleanTitle = (gameTitle ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanName = entry.name.toLowerCase().replace(/\.exe$/i, '').replace(/[^a-z0-9]/g, '');
        if (
          cleanTitle.length >= 3 &&
          cleanName.length >= 2 &&
          (cleanName.includes(cleanTitle) || cleanTitle.includes(cleanName))
        ) {
          matchScore += 40;
        }

        if (lowerName.includes('win64') || lowerName.includes('shipping')) {
          matchScore += 18;
        }

        if (
          lowerName.includes('_trial') ||
          lowerName.includes('trial.exe') ||
          lowerName.includes('showcase')
        ) {
          matchScore -= 40;
        }

        candidates.push({ fullPath, score: matchScore });
      }
    }
  }

  walk(installDir, 0);

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.fullPath ?? null;
}

/**
 * Safely queries a Windows registry value using `reg.exe` without shell interpolation.
 */
export async function queryRegistryValue(
  keyPath: string,
  valueName: string
): Promise<string | null> {
  if (process.platform !== 'win32') {
    return null;
  }

  try {
    const { stdout } = await execFileAsync(
      system32Binary('reg.exe'),
      ['query', keyPath, '/v', valueName],
      { windowsHide: true, timeout: 4000 }
    );

    const lines = stdout.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.toLowerCase().startsWith(valueName.toLowerCase()) &&
        /REG_(SZ|EXPAND_SZ|DWORD)/i.test(trimmed)
      ) {
        const parts = trimmed.split(/\s+REG_(?:SZ|EXPAND_SZ|DWORD)\s+/i);
        if (parts[1]) {
          return parts[1].trim();
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export interface RegistrySubkeyRecord {
  subkeyPath: string;
  values: Record<string, string>;
}

/**
 * Safely enumerates immediate subkeys and their string values under a Windows registry path.
 */
export async function queryRegistrySubkeys(
  rootKeyPath: string
): Promise<RegistrySubkeyRecord[]> {
  if (process.platform !== 'win32') {
    return [];
  }

  try {
    const { stdout } = await execFileAsync(
      system32Binary('reg.exe'),
      ['query', rootKeyPath, '/s'],
      {
        windowsHide: true,
        timeout: 7000,
        maxBuffer: 12 * 1024 * 1024,
      }
    );

    const records: RegistrySubkeyRecord[] = [];
    let currentRecord: RegistrySubkeyRecord | null = null;

    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      if (/^HKEY_/i.test(line)) {
        if (
          line.toLowerCase() !== rootKeyPath.toLowerCase() &&
          line.toLowerCase().startsWith(rootKeyPath.toLowerCase() + '\\')
        ) {
          currentRecord = {
            subkeyPath: line,
            values: {},
          };
          records.push(currentRecord);
        } else {
          currentRecord = null;
        }
        continue;
      }

      if (currentRecord) {
        const match = line.match(
          /^(.+?)\s+REG_(?:SZ|EXPAND_SZ|DWORD)\s+(.+)$/i
        );
        if (match && match[1] && match[2]) {
          currentRecord.values[match[1].trim()] = match[2].trim();
        }
      }
    }

    return records;
  } catch {
    return [];
  }
}

