import fs from 'node:fs';
import path from 'node:path';
import type { GameClassification } from '../../../src/shared/types/game';
import type { DiscoveredGameCandidate } from '../../../src/shared/types/scanner';
import {
  findPrimaryGameExecutable,
  isIgnoredHelperExecutable,
  queryRegistrySubkeys,
} from './windowsRegistryHelper';
import { detectEaAppGameInDirectory } from './eaScanner';

const NON_GAME_PUBLISHER_OR_NAME_PATTERNS = [
  /microsoft visual c\+\+/i,
  /microsoft \.net/i,
  /windows sdk/i,
  /windows software development kit/i,
  /microsoft office/i,
  /microsoft 365/i,
  /microsoft edge/i,
  /microsoft teams/i,
  /onedrive/i,
  /google chrome/i,
  /mozilla firefox/i,
  /nvidia graphics driver/i,
  /nvidia physx/i,
  /nvidia geforce experience/i,
  /amd software/i,
  /intel\(r\)/i,
  /realtek/i,
  /adobe/i,
  /jetbrains/i,
  /visual studio/i,
  /node\.js/i,
  /python/i,
  /git/i,
  /docker/i,
  /7-zip/i,
  /winrar/i,
  /vlc media player/i,
  /obs studio/i,
  /audacity/i,
  /postman/i,
  /slack/i,
  /zoom/i,
  /anydesk/i,
  /teamviewer/i,
  /vmware/i,
  /virtualbox/i,
  /antivirus/i,
  /security/i,
  /driver/i,
  /redistributable/i,
  /runtime/i,
  /updatekb/i,
];

const KNOWN_GAME_PUBLISHERS = [
  /valve/i,
  /epic games/i,
  /electronic arts/i,
  /ubisoft/i,
  /riot games/i,
  /rockstar games/i,
  /cd projekt/i,
  /bethesda/i,
  /square enix/i,
  /capcom/i,
  /bandai namco/i,
  /sega/i,
  /activision/i,
  /blizzard/i,
  /2k games/i,
  /take-two/i,
  /paradox interactive/i,
  /fromsoftware/i,
  /larian/i,
  /remedy/i,
  /devolver/i,
  /focus entertainment/i,
  /THQ/i,
  /gog\.com/i,
  /xbox game studios/i,
  /playstation pc/i,
];

const GAME_ENGINE_SIGNATURE_FILES = [
  'UnityPlayer.dll',
  'steam_api64.dll',
  'steam_api.dll',
  'EOSSDK-Win64-Shipping.dll',
  'Galaxy64.dll',
  'bink2w64.dll',
  'amd_ags_x64.dll',
  'nvngx_dlss.dll',
  'sl.interposer.dll',
];

export interface ClassificationEvaluation {
  confidenceScore: number;
  classification: GameClassification;
  reason: string;
}

const KNOWN_LAUNCHER_CLIENT_EXECUTABLES = new Set([
  'epicgameslauncher.exe',
  'steam.exe',
  'steamservice.exe',
  'riotclientservices.exe',
  'riotclientux.exe',
  'eadesktop.exe',
  'origin.exe',
  'galaxyclient.exe',
  'upc.exe',
  'ubisoftgamelauncher.exe',
  'rockstarlauncher.exe',
]);

export function classifyWindowsCandidate(params: {
  displayName: string;
  publisher?: string;
  installLocation?: string | null;
  executablePath?: string | null;
  isUserSelectedFolder?: boolean;
}): ClassificationEvaluation {
  const {
    displayName,
    publisher = '',
    installLocation = '',
    executablePath = '',
    isUserSelectedFolder = false,
  } = params;

  if (
    executablePath &&
    KNOWN_LAUNCHER_CLIENT_EXECUTABLES.has(
      path.basename(executablePath).toLowerCase()
    )
  ) {
    return {
      confidenceScore: 0,
      classification: 'non-game',
      reason: 'Gaming launcher client binary; excluded from game titles.',
    };
  }

  const lowerDisplayName = displayName.trim().toLowerCase();
  if (
    lowerDisplayName === 'launcher' ||
    lowerDisplayName === 'directxredist' ||
    lowerDisplayName === 'redist' ||
    lowerDisplayName === 'commonredist'
  ) {
    return {
      confidenceScore: 0,
      classification: 'non-game',
      reason: 'Redistributable or launcher root folder; excluded.',
    };
  }

  const combinedMeta = `${displayName} ${publisher}`;
  if (
    NON_GAME_PUBLISHER_OR_NAME_PATTERNS.some((pattern) =>
      pattern.test(combinedMeta)
    )
  ) {
    return {
      confidenceScore: 0,
      classification: 'non-game',
      reason: 'Matches known system utility, runtime, driver, or productivity software.',
    };
  }

  let score = isUserSelectedFolder ? 55 : 20;
  const reasons: string[] = [];

  if (KNOWN_GAME_PUBLISHERS.some((pattern) => pattern.test(publisher))) {
    score += 45;
    reasons.push('Known gaming publisher');
  }

  const normalizedLocation = (installLocation ?? '').toLowerCase();
  if (
    normalizedLocation.includes('\\games\\') ||
    normalizedLocation.includes('\\steamapps\\') ||
    normalizedLocation.includes('\\epic games\\') ||
    normalizedLocation.includes('\\gog games\\') ||
    normalizedLocation.includes('\\xboxgames\\') ||
    normalizedLocation.includes('\\ea games\\') ||
    normalizedLocation.includes('\\ubisoft game launcher\\')
  ) {
    score += 35;
    reasons.push('Located in a dedicated games directory');
  }

  // Check for game engine DLL signatures inside the installation directory
  if (installLocation && fs.existsSync(installLocation)) {
    for (const sigFile of GAME_ENGINE_SIGNATURE_FILES) {
      try {
        if (fs.existsSync(path.join(installLocation, sigFile))) {
          score += 65;
          reasons.push(`Detected game engine signature (${sigFile})`);
          break;
        }
      } catch {
        // Ignore access errors
      }
    }
  }

  const lowerExe = (executablePath ?? '').toLowerCase();
  if (
    lowerExe.includes('win64-shipping.exe') ||
    lowerExe.includes('game.exe')
  ) {
    score += 30;
    reasons.push('Unreal/Game shipping binary signature');
  }

  const clampedScore = Math.max(0, Math.min(100, score));

  if (clampedScore >= 80) {
    return {
      confidenceScore: clampedScore,
      classification: 'verified-game',
      reason: reasons.join('; ') || 'High-confidence game signature',
    };
  }

  if (clampedScore >= 60) {
    return {
      confidenceScore: clampedScore,
      classification: 'probable-game',
      reason: reasons.join('; ') || 'Probable game directory structure',
    };
  }

  return {
    confidenceScore: clampedScore,
    classification: 'non-game',
    reason: 'Insufficient gaming signatures; excluded from automatic import.',
  };
}

/**
 * Proactively discovers common game directories across all available Windows drives
 * (e.g. `D:\Games`, `C:\Games`, `C:\Program Files\EA Games`, etc.).
 */
export function detectCommonWindowsGameDirectories(): string[] {
  const commonRelativePaths = [
    'Games',
    'SteamLibrary\\steamapps\\common',
    'Program Files\\EA Games',
    'Program Files (x86)\\Origin Games',
    'Program Files\\Epic Games',
    'Epic Games',
    'GOG Games',
    'Ubisoft\\games',
    'Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games',
  ];

  const driveLetters = ['C', 'D', 'E', 'F', 'G', 'H', 'I'];
  const foundDirectories = new Set<string>();

  for (const drive of driveLetters) {
    const driveRoot = `${drive}:\\`;
    try {
      if (!fs.existsSync(driveRoot)) {
        continue;
      }
    } catch {
      continue;
    }

    for (const rel of commonRelativePaths) {
      const full = path.join(driveRoot, rel);
      try {
        if (fs.existsSync(full)) {
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            foundDirectories.add(path.normalize(full));
          }
        }
      } catch {
        // ignore access errors
      }
    }
  }

  return Array.from(foundDirectories);
}

/**
 * Scans user-selected custom folders for game subfolders and executables.
 * Never scans entire root drives and never follows symbolic links.
 */
export function scanUserSelectedFolders(
  folders: readonly string[],
  signal?: AbortSignal
): DiscoveredGameCandidate[] {
  const discovered: DiscoveredGameCandidate[] = [];

  for (const rawFolder of folders) {
    if (signal?.aborted) break;
    if (!rawFolder || typeof rawFolder !== 'string') continue;

    const folderPath = path.normalize(rawFolder.trim());
    // Safety guard: refuse to scan bare drive roots like `C:\`
    if (/^[a-zA-Z]:\\?$/.test(folderPath)) {
      continue;
    }

    let stat: fs.Stats;
    try {
      const lstat = fs.lstatSync(folderPath);
      if (lstat.isSymbolicLink() || !lstat.isDirectory()) {
        continue;
      }
      stat = lstat;
    } catch {
      continue;
    }

    if (!stat.isDirectory()) continue;

    // Check if the selected folder itself is a single game folder or a parent folder containing game subfolders
    let subEntries: fs.Dirent[] = [];
    try {
      subEntries = fs.readdirSync(folderPath, { withFileTypes: true });
    } catch {
      continue;
    }

    const directExe = subEntries.find(
      (e) =>
        e.isFile() &&
        e.name.toLowerCase().endsWith('.exe') &&
        !isIgnoredHelperExecutable(e.name)
    );

    const candidateDirs = directExe
      ? [folderPath]
      : subEntries
          .filter((e) => e.isDirectory() && !e.isSymbolicLink())
          .map((e) => path.join(folderPath, e.name));

    for (const gameDir of candidateDirs) {
      if (signal?.aborted) break;

      // 1. Check for verified launcher installation metadata/manifests before falling back to generic custom
      const eaCandidate = detectEaAppGameInDirectory(gameDir);
      if (eaCandidate) {
        discovered.push(eaCandidate);
        continue;
      }

      const folderTitle = path.basename(gameDir);
      const primaryExe = findPrimaryGameExecutable(gameDir, folderTitle, 4);
      if (!primaryExe) continue;

      const evaluation = classifyWindowsCandidate({
        displayName: folderTitle,
        installLocation: gameDir,
        executablePath: primaryExe,
        isUserSelectedFolder: true,
      });

      if (evaluation.classification === 'non-game') {
        continue;
      }

      discovered.push({
        title: folderTitle,
        subtitle: `Custom Folder (${evaluation.confidenceScore}% confidence)`,
        platformId: 'custom',
        platformName: 'Custom PC Game',
        sourceType: 'custom-folder',
        externalAppId: primaryExe.toLowerCase(),
        developer: 'Local PC Installation',
        publisher: 'Local Folder Scan',
        installPath: gameDir,
        executablePath: primaryExe,
        executableName: path.basename(primaryExe),
        workingDirectory: path.dirname(primaryExe),
        launchArgs: null,
        launchMethod: 'executable',
        launchUri: null,
        isInstalled: true,
        installSizeBytes: 0,
        buildVersion: 'Local',
        confidenceScore: evaluation.confidenceScore,
        classification: evaluation.classification,
      });
    }
  }

  return discovered;
}

/**
 * Optional Windows Uninstall Registry Scanner.
 * Uses strict `classifyWindowsCandidate` filtering so only verified/probable games are imported.
 */
export async function scanWindowsUninstallRegistryForGames(
  signal?: AbortSignal
): Promise<DiscoveredGameCandidate[]> {
  const uninstallRoots = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];

  const discovered: DiscoveredGameCandidate[] = [];

  for (const root of uninstallRoots) {
    if (signal?.aborted) break;
    const records = await queryRegistrySubkeys(root);

    for (const rec of records) {
      if (signal?.aborted) break;

      const displayName = rec.values.DisplayName;
      const publisher = rec.values.Publisher ?? '';
      const installLocation = rec.values.InstallLocation;

      if (!displayName || !installLocation) {
        continue;
      }

      const normalizedDir = path.normalize(installLocation.replace(/"/g, ''));
      if (!fs.existsSync(normalizedDir)) {
        continue;
      }

      const evaluation = classifyWindowsCandidate({
        displayName,
        publisher,
        installLocation: normalizedDir,
      });

      if (
        evaluation.classification !== 'verified-game' &&
        evaluation.classification !== 'probable-game'
      ) {
        continue;
      }

      const primaryExe = findPrimaryGameExecutable(
        normalizedDir,
        displayName,
        2
      );
      if (!primaryExe) {
        continue;
      }

      discovered.push({
        title: displayName,
        subtitle: `${publisher || 'Windows Installed Game'} (${evaluation.confidenceScore}% match)`,
        platformId: 'custom',
        platformName: 'Windows Installed',
        sourceType: 'windows-registry',
        externalAppId: primaryExe.toLowerCase(),
        developer: publisher || 'Unknown Studio',
        publisher: publisher || 'Windows Registry',
        installPath: normalizedDir,
        executablePath: primaryExe,
        executableName: path.basename(primaryExe),
        workingDirectory: path.dirname(primaryExe),
        launchArgs: null,
        launchMethod: 'executable',
        launchUri: null,
        isInstalled: true,
        installSizeBytes: 0,
        buildVersion: rec.values.DisplayVersion ?? '1.0',
        confidenceScore: evaluation.confidenceScore,
        classification: evaluation.classification,
      });
    }
  }

  return discovered;
}
