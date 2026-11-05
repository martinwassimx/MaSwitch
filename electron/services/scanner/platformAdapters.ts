import fs from 'node:fs';
import path from 'node:path';
import type { PlatformDetectionReport } from '../../../src/shared/types/platform';
import type { DiscoveredGameCandidate } from '../../../src/shared/types/scanner';
import {
  findPrimaryGameExecutable,
  queryRegistrySubkeys,
  queryRegistryValue,
} from './windowsRegistryHelper';
import { scanEaAppInstallations } from './eaScanner';

export interface AdditionalPlatformsScanResult {
  reports: PlatformDetectionReport[];
  games: DiscoveredGameCandidate[];
}

/**
 * 1. GOG Galaxy Adapter
 * Reads documented `HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\<gameId>` entries.
 */
export async function scanGogGalaxyGames(
  signal?: AbortSignal
): Promise<{
  report: PlatformDetectionReport;
  games: DiscoveredGameCandidate[];
}> {
  const gogClientPath = await queryRegistryValue(
    'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\GalaxyClient\\paths',
    'client'
  );
  const subkeys = await queryRegistrySubkeys(
    'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games'
  );

  if (!gogClientPath && subkeys.length === 0) {
    return {
      report: {
        platformId: 'gog',
        platformName: 'GOG Galaxy',
        supported: true,
        status: 'not-found',
        detectedInstallPath: null,
        gamesDetectedCount: 0,
        detectionMethod: 'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games',
      },
      games: [],
    };
  }

  const discovered: DiscoveredGameCandidate[] = [];
  for (const record of subkeys) {
    if (signal?.aborted) break;

    const gameId =
      record.values.gameID ??
      record.values.GameID ??
      path.basename(record.subkeyPath);
    const gameName = record.values.gameName ?? record.values.GameName;
    const installDir = record.values.path ?? record.values.PATH;
    const exeVal = record.values.exe ?? record.values.EXE;
    const workingDir = record.values.workingDir ?? installDir;
    const launchParam = record.values.launchParam ?? null;
    const ver = record.values.ver ?? '1.0';

    if (!gameName || !installDir) {
      continue;
    }

    const normalizedDir = path.normalize(installDir);
    if (!fs.existsSync(normalizedDir)) {
      continue;
    }

    let resolvedExe: string | null = null;
    if (exeVal && fs.existsSync(path.normalize(exeVal))) {
      resolvedExe = path.normalize(exeVal);
    } else {
      resolvedExe = findPrimaryGameExecutable(normalizedDir, gameName);
    }

    discovered.push({
      title: gameName,
      subtitle: `GOG #${gameId}`,
      platformId: 'gog',
      platformName: 'GOG Galaxy',
      sourceType: 'gog',
      externalAppId: gameId,
      developer: 'GOG.com Local Manifest',
      publisher: 'GOG.com',
      installPath: normalizedDir,
      executablePath: resolvedExe,
      executableName: resolvedExe ? path.basename(resolvedExe) : null,
      workingDirectory: workingDir
        ? path.normalize(workingDir)
        : resolvedExe
          ? path.dirname(resolvedExe)
          : normalizedDir,
      launchArgs: launchParam,
      launchMethod: resolvedExe ? 'executable' : 'unavailable',
      launchUri: null,
      isInstalled: true,
      installSizeBytes: 0,
      buildVersion: ver,
      confidenceScore: 100,
      classification: 'verified-game',
    });
  }

  return {
    report: {
      platformId: 'gog',
      platformName: 'GOG Galaxy',
      supported: true,
      status: 'detected',
      detectedInstallPath: gogClientPath,
      gamesDetectedCount: discovered.length,
      detectionMethod: 'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games',
    },
    games: discovered,
  };
}

/**
 * 2. Ubisoft Connect Adapter
 * Reads documented `HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs\<id>` entries.
 */
export async function scanUbisoftConnectGames(
  signal?: AbortSignal
): Promise<{
  report: PlatformDetectionReport;
  games: DiscoveredGameCandidate[];
}> {
  const launcherDir = await queryRegistryValue(
    'HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher',
    'InstallDir'
  );
  const subkeys = await queryRegistrySubkeys(
    'HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs'
  );

  if (!launcherDir && subkeys.length === 0) {
    return {
      report: {
        platformId: 'ubisoft',
        platformName: 'Ubisoft Connect',
        supported: true,
        status: 'not-found',
        detectedInstallPath: null,
        gamesDetectedCount: 0,
        detectionMethod:
          'HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs',
      },
      games: [],
    };
  }

  const discovered: DiscoveredGameCandidate[] = [];
  for (const record of subkeys) {
    if (signal?.aborted) break;

    const uplayId = path.basename(record.subkeyPath);
    const rawInstallDir = record.values.InstallDir;
    if (!rawInstallDir) continue;

    const normalizedDir = path.normalize(rawInstallDir.replace(/\//g, '\\'));
    if (!fs.existsSync(normalizedDir)) continue;

    const inferredTitle = path.basename(normalizedDir);
    const primaryExe = findPrimaryGameExecutable(normalizedDir, inferredTitle);

    discovered.push({
      title: inferredTitle,
      subtitle: `Ubisoft Install #${uplayId}`,
      platformId: 'ubisoft',
      platformName: 'Ubisoft Connect',
      sourceType: 'ubisoft',
      externalAppId: uplayId,
      developer: 'Ubisoft Connect Local Install',
      publisher: 'Ubisoft',
      installPath: normalizedDir,
      executablePath: primaryExe,
      executableName: primaryExe ? path.basename(primaryExe) : null,
      workingDirectory: primaryExe ? path.dirname(primaryExe) : normalizedDir,
      launchArgs: null,
      launchMethod: primaryExe ? 'executable' : 'unavailable',
      launchUri: null,
      isInstalled: true,
      installSizeBytes: 0,
      buildVersion: 'Local Build',
      confidenceScore: 95,
      classification: 'verified-game',
    });
  }

  return {
    report: {
      platformId: 'ubisoft',
      platformName: 'Ubisoft Connect',
      supported: true,
      status: 'detected',
      detectedInstallPath: launcherDir,
      gamesDetectedCount: discovered.length,
      detectionMethod:
        'HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs',
      limitationNote:
        'Ubisoft Connect registry records provide install path and ID; display name is inferred from the installation folder name.',
    },
    games: discovered,
  };
}

/**
 * 3. Riot Games Adapter
 * Reads documented `C:\ProgramData\Riot Games\Metadata\*\*.product_settings.yaml`.
 */
export async function scanRiotGamesInstallations(
  overrideProgramDataDir?: string,
  signal?: AbortSignal
): Promise<{
  report: PlatformDetectionReport;
  games: DiscoveredGameCandidate[];
}> {
  const riotBaseDir =
    overrideProgramDataDir ?? 'C:\\ProgramData\\Riot Games';
  const metadataDir = path.join(riotBaseDir, 'Metadata');

  if (!fs.existsSync(metadataDir)) {
    return {
      report: {
        platformId: 'riot',
        platformName: 'Riot Games',
        supported: true,
        status: 'not-found',
        detectedInstallPath: null,
        gamesDetectedCount: 0,
        detectionMethod:
          'C:\\ProgramData\\Riot Games\\Metadata\\*\\*.product_settings.yaml',
      },
      games: [],
    };
  }

  // Parse RiotClientInstalls.json if present
  let riotClientExe: string | null = null;
  const clientInstallsFile = path.join(riotBaseDir, 'RiotClientInstalls.json');
  if (fs.existsSync(clientInstallsFile)) {
    try {
      const rawJson = JSON.parse(fs.readFileSync(clientInstallsFile, 'utf-8')) as Record<string, unknown>;
      if (typeof rawJson.rc_live === 'string' && fs.existsSync(rawJson.rc_live)) {
        riotClientExe = path.normalize(rawJson.rc_live);
      } else if (typeof rawJson.rc_default === 'string' && fs.existsSync(rawJson.rc_default)) {
        riotClientExe = path.normalize(rawJson.rc_default);
      }
    } catch {
      // Ignore JSON error
    }
  }

  const RIOT_PRODUCT_DISPLAY_NAMES: Record<string, string> = {
    valorant: 'VALORANT',
    league_of_legends: 'League of Legends',
    teamfighttactics: 'Teamfight Tactics',
    bacon: 'Legends of Runeterra',
  };

  const discovered: DiscoveredGameCandidate[] = [];
  let productFolders: fs.Dirent[] = [];
  try {
    productFolders = fs.readdirSync(metadataDir, { withFileTypes: true });
  } catch {
    productFolders = [];
  }

  for (const folder of productFolders) {
    if (signal?.aborted) break;
    if (!folder.isDirectory() || folder.isSymbolicLink()) continue;

    const productDir = path.join(metadataDir, folder.name);
    let files: fs.Dirent[] = [];
    try {
      files = fs.readdirSync(productDir, { withFileTypes: true });
    } catch {
      continue;
    }

    const settingsFile = files.find(
      (f) => f.isFile() && f.name.endsWith('.product_settings.yaml')
    );
    if (!settingsFile) continue;

    try {
      const yamlContent = fs.readFileSync(
        path.join(productDir, settingsFile.name),
        'utf-8'
      );
      const match = yamlContent.match(
        /product_install_full_path:\s*"?([^"\r\n]+)"?/i
      );
      const rawInstallPath = match?.[1]?.trim();
      if (!rawInstallPath) continue;

      const normalizedInstall = path.normalize(
        rawInstallPath.replace(/\//g, '\\')
      );
      if (!fs.existsSync(normalizedInstall)) continue;

      const productId = folder.name.replace(/\.live$/i, '').toLowerCase();

      // Resolve human-friendly game title
      let displayTitle = RIOT_PRODUCT_DISPLAY_NAMES[productId];
      if (!displayTitle) {
        const base = path.basename(normalizedInstall);
        if (base.toLowerCase() === 'live') {
          displayTitle = path.basename(path.dirname(normalizedInstall));
        } else {
          displayTitle = base;
        }
      }

      // Check specific preferred launcher executables before generic walk
      let primaryExe: string | null = null;
      if (productId === 'valorant') {
        const valExeCandidate = path.join(normalizedInstall, 'VALORANT.exe');
        if (fs.existsSync(valExeCandidate)) {
          primaryExe = valExeCandidate;
        }
      } else if (productId === 'league_of_legends') {
        const lolExeCandidate = path.join(normalizedInstall, 'LeagueClient.exe');
        if (fs.existsSync(lolExeCandidate)) {
          primaryExe = lolExeCandidate;
        }
      }

      if (!primaryExe) {
        primaryExe = findPrimaryGameExecutable(
          normalizedInstall,
          displayTitle,
          3
        );
      }

      discovered.push({
        title: displayTitle,
        subtitle: `Riot Games (${productId})`,
        platformId: 'riot',
        platformName: 'Riot Games',
        sourceType: 'riot',
        externalAppId: productId,
        developer: 'Riot Games',
        publisher: 'Riot Games',
        installPath: normalizedInstall,
        executablePath: primaryExe,
        executableName: primaryExe ? path.basename(primaryExe) : null,
        workingDirectory: primaryExe
          ? path.dirname(primaryExe)
          : normalizedInstall,
        launchArgs: null,
        launchMethod: primaryExe ? 'executable' : 'unavailable',
        launchUri: null,
        isInstalled: true,
        installSizeBytes: 0,
        buildVersion: 'Live',
        confidenceScore: 100,
        classification: 'verified-game',
      });
    } catch {
      continue;
    }
  }

  return {
    report: {
      platformId: 'riot',
      platformName: 'Riot Games',
      supported: true,
      status: 'detected',
      detectedInstallPath: riotClientExe ? path.dirname(riotClientExe) : riotBaseDir,
      gamesDetectedCount: discovered.length,
      detectionMethod:
        'C:\\ProgramData\\Riot Games\\Metadata\\*\\*.product_settings.yaml + RiotClientInstalls.json',
      limitationNote:
        'Riot games require Riot Client authentication and Vanguard anti-cheat when launched.',
    },
    games: discovered,
  };
}

/**
 * 4. Rockstar Games Launcher Adapter
 * Checks whether the launcher client itself is present on the machine.
 */
export async function scanRockstarStatus(): Promise<PlatformDetectionReport> {
  const rockstarPath = await queryRegistryValue(
    'HKLM\\SOFTWARE\\WOW6432Node\\Rockstar Games\\Launcher',
    'InstallFolder'
  );

  return {
    platformId: 'rockstar',
    platformName: 'Rockstar Games Launcher',
    supported: false,
    status: rockstarPath ? 'unsupported' : 'not-found',
    detectedInstallPath: rockstarPath,
    gamesDetectedCount: 0,
    detectionMethod: 'HKLM\\SOFTWARE\\WOW6432Node\\Rockstar Games\\Launcher',
    limitationNote:
      'Rockstar Games Launcher does not expose a documented public manifest file format. Installed Rockstar titles can be imported via Custom Folder or Executable selection.',
  };
}

export async function scanAdditionalPlatforms(
  signal?: AbortSignal
): Promise<AdditionalPlatformsScanResult> {
  const [gog, ubisoft, riot, ea, rockstarReport] = await Promise.all([
    scanGogGalaxyGames(signal),
    scanUbisoftConnectGames(signal),
    scanRiotGamesInstallations(undefined, signal),
    scanEaAppInstallations(signal),
    scanRockstarStatus(),
  ]);

  return {
    reports: [gog.report, ubisoft.report, riot.report, ea.report, rockstarReport],
    games: [...gog.games, ...ubisoft.games, ...riot.games, ...ea.games],
  };
}
