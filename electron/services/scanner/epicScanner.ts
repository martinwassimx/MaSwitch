import fs from 'node:fs';
import path from 'node:path';
import type { PlatformDetectionReport } from '../../../src/shared/types/platform';
import type { DiscoveredGameCandidate } from '../../../src/shared/types/scanner';
import { findPrimaryGameExecutable } from './windowsRegistryHelper';

export const DEFAULT_EPIC_MANIFESTS_DIR =
  'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';

export interface ParsedEpicManifest {
  appName: string;
  displayName: string;
  installLocation: string;
  launchExecutable: string | null;
  launchCommand: string | null;
  catalogNamespace: string | null;
  catalogItemId: string | null;
  appVersionString: string;
  installSizeBytes: number;
  isIncompleteInstall: boolean;
  isApplication: boolean;
}

/**
 * Parses an Epic Games Launcher `.item` JSON manifest safely.
 * Returns null if required fields (AppName, DisplayName, InstallLocation) are missing.
 */
export function parseEpicManifestItem(
  jsonContent: string
): ParsedEpicManifest | null {
  if (!jsonContent || typeof jsonContent !== 'string') {
    return null;
  }

  try {
    const raw = JSON.parse(jsonContent) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const appName =
      typeof raw.AppName === 'string' ? raw.AppName.trim() : '';
    const displayName =
      typeof raw.DisplayName === 'string' ? raw.DisplayName.trim() : '';
    const installLocation =
      typeof raw.InstallLocation === 'string'
        ? raw.InstallLocation.trim()
        : '';

    if (!appName || !displayName || !installLocation) {
      return null;
    }

    // Validate AppName contains safe characters for Epic launch protocol URI
    if (!/^[a-zA-Z0-9._-]+$/.test(appName)) {
      return null;
    }

    const launchExecutable =
      typeof raw.LaunchExecutable === 'string' &&
      raw.LaunchExecutable.trim().length > 0
        ? raw.LaunchExecutable.trim()
        : null;

    const launchCommand =
      typeof raw.LaunchCommand === 'string' &&
      raw.LaunchCommand.trim().length > 0
        ? raw.LaunchCommand.trim()
        : null;

    const catalogNamespace =
      typeof raw.CatalogNamespace === 'string'
        ? raw.CatalogNamespace.trim()
        : null;

    const catalogItemId =
      typeof raw.CatalogItemId === 'string' ? raw.CatalogItemId.trim() : null;

    const appVersionString =
      typeof raw.AppVersionString === 'string' &&
      raw.AppVersionString.trim().length > 0
        ? raw.AppVersionString.trim()
        : '1.0';

    const installSizeBytes =
      typeof raw.InstallSize === 'number' && Number.isFinite(raw.InstallSize)
        ? Math.max(0, Math.floor(raw.InstallSize))
        : 0;

    const isIncompleteInstall = Boolean(raw.bIsIncompleteInstall);

    // Filter out non-launchable engine plugins/DLCs if bIsApplication === false and no LaunchExecutable
    const isApplication =
      raw.bIsApplication === undefined
        ? Boolean(launchExecutable)
        : Boolean(raw.bIsApplication);

    return {
      appName,
      displayName,
      installLocation,
      launchExecutable,
      launchCommand,
      catalogNamespace,
      catalogItemId,
      appVersionString,
      installSizeBytes,
      isIncompleteInstall,
      isApplication,
    };
  } catch {
    return null;
  }
}

export interface EpicScanResult {
  report: PlatformDetectionReport;
  games: DiscoveredGameCandidate[];
  diagnostics?: {
    searchedDirs: string[];
    manifestFilesFound: number;
    parsedCandidatesCount: number;
  };
}

export async function scanEpicGamesManifests(
  overrideManifestsDir?: string,
  signal?: AbortSignal
): Promise<EpicScanResult> {
  const manifestsDir = overrideManifestsDir ?? DEFAULT_EPIC_MANIFESTS_DIR;
  const searchedDirs: string[] = [];
  const candidateItemFiles: string[] = [];

  const candidateDirs = [
    manifestsDir,
    path.join(manifestsDir, 'Pending'),
  ];

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) {
      continue;
    }
    searchedDirs.push(dir);
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.item')) {
          candidateItemFiles.push(path.join(dir, entry.name));
        }
      }
    } catch {
      // Ignore directory read error
    }
  }

  // Also check standard LauncherInstalled.dat if manifests directory was empty
  const launcherInstalledDat = 'C:\\ProgramData\\Epic\\UnrealEngineLauncher\\LauncherInstalled.dat';
  if (fs.existsSync(launcherInstalledDat)) {
    searchedDirs.push(launcherInstalledDat);
  }

  if (candidateItemFiles.length === 0 && !fs.existsSync(manifestsDir)) {
    return {
      report: {
        platformId: 'epic',
        platformName: 'Epic Games',
        supported: true,
        status: 'not-found',
        detectedInstallPath: null,
        gamesDetectedCount: 0,
        detectionMethod:
          'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests\\*.item (including Pending)',
      },
      games: [],
      diagnostics: {
        searchedDirs,
        manifestFilesFound: 0,
        parsedCandidatesCount: 0,
      },
    };
  }

  const discovered: DiscoveredGameCandidate[] = [];
  const seenAppNames = new Set<string>();

  for (const itemFilePath of candidateItemFiles) {
    if (signal?.aborted) {
      break;
    }

    let content: string;
    try {
      content = fs.readFileSync(itemFilePath, 'utf-8');
    } catch {
      continue;
    }

    const parsed = parseEpicManifestItem(content);
    if (!parsed || !parsed.isApplication) {
      continue;
    }

    if (seenAppNames.has(parsed.appName)) {
      continue;
    }

    const normalizedInstallDir = path.normalize(parsed.installLocation);
    const dirExists = fs.existsSync(normalizedInstallDir);

    let resolvedExePath: string | null = null;
    if (parsed.launchExecutable && dirExists) {
      const candidateExe = path.normalize(
        path.join(normalizedInstallDir, parsed.launchExecutable)
      );
      if (fs.existsSync(candidateExe)) {
        resolvedExePath = candidateExe;
      }
    }

    if (!resolvedExePath && dirExists) {
      resolvedExePath = findPrimaryGameExecutable(
        normalizedInstallDir,
        parsed.displayName,
        3
      );
    }

    // A game is installed if its directory exists AND either its executable exists or it was not flagged incomplete
    const isInstalled = dirExists && (resolvedExePath !== null || !parsed.isIncompleteInstall);

    // If game has no executable on disk and was marked incomplete (e.g. uninstalled stub), skip it from installed games
    if (!dirExists || (!resolvedExePath && parsed.isIncompleteInstall)) {
      continue;
    }

    seenAppNames.add(parsed.appName);

    const catalogNote = parsed.catalogItemId
      ? `Catalog ${parsed.catalogNamespace ?? 'epic'}:${parsed.catalogItemId.slice(0, 8)}`
      : `Epic App ${parsed.appName}`;

    discovered.push({
      title: parsed.displayName,
      subtitle: catalogNote,
      platformId: 'epic',
      platformName: 'Epic Games',
      sourceType: 'epic',
      externalAppId: parsed.appName,
      developer: 'Epic Games Manifest',
      publisher: 'Epic Games Store',
      installPath: dirExists ? normalizedInstallDir : null,
      executablePath: resolvedExePath,
      executableName: resolvedExePath
        ? path.basename(resolvedExePath)
        : parsed.launchExecutable
          ? path.basename(parsed.launchExecutable)
          : null,
      workingDirectory: resolvedExePath
        ? path.dirname(resolvedExePath)
        : dirExists
          ? normalizedInstallDir
          : null,
      launchArgs: parsed.launchCommand,
      launchMethod: 'epic-protocol',
      launchUri: `com.epicgames.launcher://apps/${encodeURIComponent(parsed.appName)}?action=launch&silent=true`,
      isInstalled,
      installSizeBytes: parsed.installSizeBytes,
      buildVersion: parsed.appVersionString,
      confidenceScore: 100,
      classification: 'verified-game',
    });
  }

  return {
    report: {
      platformId: 'epic',
      platformName: 'Epic Games',
      supported: true,
      status: discovered.length > 0 || fs.existsSync(manifestsDir) ? 'detected' : 'not-found',
      detectedInstallPath: manifestsDir,
      gamesDetectedCount: discovered.length,
      detectionMethod:
        'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests\\*.item (including Pending)',
    },
    games: discovered,
    diagnostics: {
      searchedDirs,
      manifestFilesFound: candidateItemFiles.length,
      parsedCandidatesCount: discovered.length,
    },
  };
}

/**
 * Known Epic Games Launcher executable locations on 64-bit and 32-bit Windows.
 */
export const STANDARD_EPIC_LAUNCHER_PATHS = [
  'C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe',
  'C:\\Program Files\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe',
  'C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win32\\EpicGamesLauncher.exe',
  'D:\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe',
  'E:\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe',
];

/**
 * Checks whether the official Epic Games Launcher executable is present on disk.
 */
export function findEpicGamesLauncherExecutable(): string | null {
  for (const p of STANDARD_EPIC_LAUNCHER_PATHS) {
    try {
      if (fs.existsSync(p)) {
        return path.normalize(p);
      }
    } catch {
      // Ignore
    }
  }
  return null;
}

/**
 * Checks if the Epic Games Launcher is installed on the system, either via executable
 * or manifest directory.
 */
export function isEpicGamesLauncherInstalled(
  overrideManifestsDir?: string
): boolean {
  if (findEpicGamesLauncherExecutable() !== null) {
    return true;
  }
  const manifestsDir = overrideManifestsDir ?? DEFAULT_EPIC_MANIFESTS_DIR;
  try {
    if (fs.existsSync(manifestsDir)) {
      return true;
    }
  } catch {
    // Ignore
  }
  return false;
}

/**
 * Checks whether a game title or executable corresponds to Fortnite.
 */
export function isFortniteGame(
  title?: string,
  executablePath?: string | null
): boolean {
  const normalizedTitle = (title ?? '').toLowerCase().trim();
  if (normalizedTitle === 'fortnite' || normalizedTitle.startsWith('fortnite ')) {
    return true;
  }
  if (!executablePath) {
    return false;
  }
  const normalizedExe = executablePath.toLowerCase().replace(/\\/g, '/');
  return (
    normalizedExe.endsWith('fortniteclient-win64-shipping.exe') ||
    normalizedExe.endsWith('fortniteclient-win64-shipping_eac.exe') ||
    normalizedExe.endsWith('fortniteclient-win64-shipping_be.exe') ||
    normalizedExe.endsWith('fortnitelauncher.exe') ||
    normalizedExe.endsWith('fortnitebootstrapper.exe') ||
    normalizedExe.includes('/fortnite/fortnitegame/') ||
    normalizedExe.includes('/epic games/fortnite/')
  );
}

/**
 * Inspects all available Epic Games installation manifests (.item) to match a game
 * by its directory, executable path, or title.
 */
export function detectEpicGameFromManifests(
  input: {
    executablePath?: string | null;
    installPath?: string | null;
    title?: string;
  },
  overrideManifestsDir?: string
): ParsedEpicManifest | null {
  const manifestsDir = overrideManifestsDir ?? DEFAULT_EPIC_MANIFESTS_DIR;
  const candidateDirs = [manifestsDir, path.join(manifestsDir, 'Pending')];

  const candidateItemFiles: string[] = [];
  for (const dir of candidateDirs) {
    try {
      if (fs.existsSync(dir)) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.toLowerCase().endsWith('.item')) {
            candidateItemFiles.push(path.join(dir, entry.name));
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  const normExe = input.executablePath
    ? path.normalize(input.executablePath).toLowerCase()
    : null;
  const normInstall = input.installPath
    ? path.normalize(input.installPath).toLowerCase()
    : null;
  const titleClean = (input.title ?? '').trim().toLowerCase();

  for (const itemPath of candidateItemFiles) {
    let content: string;
    try {
      content = fs.readFileSync(itemPath, 'utf8');
    } catch {
      continue;
    }

    const parsed = parseEpicManifestItem(content);
    if (!parsed || !parsed.isApplication) {
      continue;
    }

    const manifestInstallNorm = path.normalize(parsed.installLocation).toLowerCase();
    const manifestTitle = parsed.displayName.toLowerCase();
    const manifestAppName = parsed.appName.toLowerCase();

    // 1. Install location matches input install path or is a prefix of executable path
    if (
      (normInstall && (normInstall === manifestInstallNorm || normInstall.startsWith(manifestInstallNorm))) ||
      (normExe && normExe.startsWith(manifestInstallNorm))
    ) {
      return parsed;
    }

    // 2. Title matches
    if (
      titleClean &&
      (manifestTitle === titleClean ||
        manifestAppName === titleClean ||
        (titleClean === 'fortnite' && manifestAppName === 'fortnite'))
    ) {
      return parsed;
    }

    // 3. Executable basename matches manifest launchExecutable
    if (normExe && parsed.launchExecutable) {
      const parsedExeName = path.basename(parsed.launchExecutable).toLowerCase();
      if (path.basename(normExe) === parsedExeName) {
        return parsed;
      }
    }
  }

  return null;
}

