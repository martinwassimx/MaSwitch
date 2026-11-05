import fs from 'node:fs';
import path from 'node:path';
import type { PlatformDetectionReport } from '../../../src/shared/types/platform';
import type { DiscoveredGameCandidate } from '../../../src/shared/types/scanner';
import {
  extractSteamLibraryFoldersFromVdf,
  parseSteamAcfManifest,
} from './vdfParser';
import {
  findPrimaryGameExecutable,
  queryRegistryValue,
} from './windowsRegistryHelper';

const NON_GAME_STEAM_APP_IDS = new Set([
  '228980', // Steamworks Common Redistributables
  '250820', // SteamVR
  '1070560', // Steam Linux Runtime
  '1391110', // Steam Linux Runtime - Soldier
  '1628350', // Steam Linux Runtime - Sniper
]);

export interface SteamScanResult {
  report: PlatformDetectionReport;
  games: DiscoveredGameCandidate[];
  diagnostics?: {
    searchedDirs: string[];
    manifestFilesFound: number;
    parsedCandidatesCount: number;
  };
}

export async function detectSteamInstallPath(
  overrideSteamPath?: string
): Promise<string | null> {
  if (overrideSteamPath) {
    return fs.existsSync(overrideSteamPath) ? overrideSteamPath : null;
  }

  const regCandidates = [
    { key: 'HKCU\\Software\\Valve\\Steam', value: 'SteamPath' },
    {
      key: 'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam',
      value: 'InstallPath',
    },
    { key: 'HKLM\\SOFTWARE\\Valve\\Steam', value: 'InstallPath' },
  ];

  for (const reg of regCandidates) {
    const val = await queryRegistryValue(reg.key, reg.value);
    if (val) {
      const normalized = path.normalize(val.replace(/\//g, '\\'));
      if (fs.existsSync(normalized)) {
        return normalized;
      }
    }
  }

  const defaultPaths = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
  ];

  for (const p of defaultPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

export function resolveSteamLibraryFolders(steamRootPath: string): string[] {
  const folderSet = new Set<string>();
  folderSet.add(path.normalize(steamRootPath));

  const vdfCandidates = [
    path.join(steamRootPath, 'steamapps', 'libraryfolders.vdf'),
    path.join(steamRootPath, 'config', 'libraryfolders.vdf'),
  ];

  for (const vdfPath of vdfCandidates) {
    try {
      if (!fs.existsSync(vdfPath)) {
        continue;
      }
      const content = fs.readFileSync(vdfPath, 'utf-8');
      const extracted = extractSteamLibraryFoldersFromVdf(content);
      for (const libPath of extracted) {
        const normalized = path.normalize(libPath);
        if (fs.existsSync(normalized)) {
          folderSet.add(normalized);
        }
      }
    } catch {
      // Ignore unreadable or malformed libraryfolders.vdf
    }
  }

  return Array.from(folderSet);
}

export async function scanSteamLibraries(
  overrideSteamPath?: string,
  signal?: AbortSignal
): Promise<SteamScanResult> {
  const steamRoot = await detectSteamInstallPath(overrideSteamPath);

  if (!steamRoot) {
    return {
      report: {
        platformId: 'steam',
        platformName: 'Steam',
        supported: true,
        status: 'not-found',
        detectedInstallPath: null,
        gamesDetectedCount: 0,
        detectionMethod:
          'Windows Registry (HKCU/HKLM Valve\\Steam) + libraryfolders.vdf + appmanifest_*.acf',
      },
      games: [],
    };
  }

  const libraryFolders = resolveSteamLibraryFolders(steamRoot);
  const discovered: DiscoveredGameCandidate[] = [];
  const seenAppIds = new Set<string>();
  let manifestFilesFound = 0;

  for (const libFolder of libraryFolders) {
    if (signal?.aborted) {
      break;
    }

    const steamappsDir = path.join(libFolder, 'steamapps');
    if (!fs.existsSync(steamappsDir)) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(steamappsDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (signal?.aborted) {
        break;
      }

      if (
        !entry.isFile() ||
        !entry.name.toLowerCase().startsWith('appmanifest_') ||
        !entry.name.toLowerCase().endsWith('.acf')
      ) {
        continue;
      }

      manifestFilesFound += 1;

      const acfFilePath = path.join(steamappsDir, entry.name);
      let acfContent: string;
      try {
        acfContent = fs.readFileSync(acfFilePath, 'utf-8');
      } catch {
        continue;
      }

      const manifest = parseSteamAcfManifest(acfContent);
      if (!manifest) {
        continue;
      }

      if (
        NON_GAME_STEAM_APP_IDS.has(manifest.appId) ||
        seenAppIds.has(manifest.appId)
      ) {
        continue;
      }

      const gameInstallDir = path.join(
        steamappsDir,
        'common',
        manifest.installDir
      );
      const dirExists = fs.existsSync(gameInstallDir);
      const primaryExe = dirExists
        ? findPrimaryGameExecutable(gameInstallDir, manifest.name)
        : null;

      seenAppIds.add(manifest.appId);

      discovered.push({
        title: manifest.name,
        subtitle: `Steam App #${manifest.appId}`,
        platformId: 'steam',
        platformName: 'Steam',
        sourceType: 'steam',
        externalAppId: manifest.appId,
        developer: 'Steamworks Local Manifest',
        publisher: 'Steam',
        installPath: dirExists ? gameInstallDir : null,
        executablePath: primaryExe,
        executableName: primaryExe ? path.basename(primaryExe) : null,
        workingDirectory: primaryExe
          ? path.dirname(primaryExe)
          : dirExists
            ? gameInstallDir
            : null,
        launchArgs: null,
        launchMethod: 'steam-protocol',
        launchUri: `steam://rungameid/${manifest.appId}`,
        isInstalled: dirExists && manifest.isFullyInstalled,
        installSizeBytes: manifest.sizeOnDiskBytes,
        buildVersion: `Build ${manifest.buildId}`,
        confidenceScore: 100,
        classification: 'verified-game',
        coverImage: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${manifest.appId}/library_600x900.jpg`,
        heroImage: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${manifest.appId}/library_hero.jpg`,
      });
    }
  }

  return {
    report: {
      platformId: 'steam',
      platformName: 'Steam',
      supported: true,
      status: discovered.length > 0 || fs.existsSync(steamRoot) ? 'detected' : 'not-found',
      detectedInstallPath: steamRoot,
      gamesDetectedCount: discovered.length,
      detectionMethod: `Parsed ${libraryFolders.length} Steam library folder(s) via libraryfolders.vdf & appmanifest_*.acf`,
    },
    games: discovered,
    diagnostics: {
      searchedDirs: libraryFolders,
      manifestFilesFound,
      parsedCandidatesCount: discovered.length,
    },
  };
}

