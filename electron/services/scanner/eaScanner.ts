import fs from 'node:fs';
import path from 'node:path';
import type { PlatformDetectionReport } from '../../../src/shared/types/platform';
import type { DiscoveredGameCandidate } from '../../../src/shared/types/scanner';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { system32Binary } from '../security/systemBinaries';
import {
  findPrimaryGameExecutable,
  queryRegistrySubkeys,
  queryRegistryValue,
} from './windowsRegistryHelper';

const execFileAsync = promisify(execFile);

export interface ParsedEaManifest {
  contentId: string | null;
  title: string | null;
  version: string | null;
  relativeExePath: string | null;
  rawXml: string;
}

/**
 * Normalizes title strings found in EA manifests.
 * Handles trademark/copyright symbols and artifact encodings like "F1Ar 25" -> "F1 25".
 */
export function cleanEaGameTitle(rawTitle: string): string {
  let cleaned = rawTitle
    .replace(/\bF1[®Ar]+\s*25\b/i, 'F1 25')
    .replace(/\bF1r\s*25\b/i, 'F1 25')
    .replace(/\bEA SPORTS FC[™T]*\s*27\b/i, 'EA SPORTS FC 27')
    .replace(/\bEA SPORTS FC[™T]*\s*26\b/i, 'EA SPORTS FC 26')
    .replace(/[®™©]/g, '')
    .trim();

  // Strip trial / play pro suffixes if desired for clean title matching
  cleaned = cleaned.replace(/\s+(Trial|EA Play Pro Edition|Demo)$/i, '').trim();
  return cleaned || rawTitle.trim();
}

/**
 * Parses an EA Download in Place (DiPManifest) XML manifest.
 * Location: `<GameInstallDir>/__Installer/installerdata.xml`
 */
export function parseEaInstallerDataXml(xmlContent: string): ParsedEaManifest | null {
  if (!xmlContent || !xmlContent.includes('<DiPManifest')) {
    return null;
  }

  // 1. Content ID
  const contentIdMatch = xmlContent.match(/<contentID>\s*([^<\r\n]+?)\s*<\/contentID>/i);
  const contentId = contentIdMatch?.[1]?.trim() ?? null;

  // 2. Game Version
  const versionMatch = xmlContent.match(/<gameVersion\s+version="([^"]+)"/i);
  const version = versionMatch?.[1]?.trim() ?? null;

  // 3. Game Title (Prefer en_US, en_GB, then first available)
  let title: string | null = null;
  const enUsMatch = xmlContent.match(/<gameTitle\s+locale="en_US">\s*([^<]+?)\s*<\/gameTitle>/i);
  const enGbMatch = xmlContent.match(/<gameTitle\s+locale="en_GB">\s*([^<]+?)\s*<\/gameTitle>/i);
  const anyTitleMatch = xmlContent.match(/<gameTitle[^>]*>\s*([^<]+?)\s*<\/gameTitle>/i);

  const rawTitle = enUsMatch?.[1] ?? enGbMatch?.[1] ?? anyTitleMatch?.[1];
  if (rawTitle) {
    title = cleanEaGameTitle(rawTitle);
  }

  // 4. Relative Executable Path from <runtime><launcher>
  let relativeExePath: string | null = null;
  const launcherBlocks = xmlContent.match(/<launcher[\s\S]*?<\/launcher>/gi) ?? [];

  // Prefer non-trial launcher (<trial>0</trial> or without -trial parameter)
  let chosenLauncherBlock: string | null = null;
  for (const block of launcherBlocks) {
    if (block.includes('<trial>0</trial>') || !block.includes('-trial')) {
      chosenLauncherBlock = block;
      break;
    }
  }
  if (!chosenLauncherBlock && launcherBlocks.length > 0) {
    chosenLauncherBlock = launcherBlocks[0] ?? null;
  }

  if (chosenLauncherBlock) {
    const fileMatch = chosenLauncherBlock.match(/<filePath>(?:\[.*?\])?\s*([^<\r\n]+?\.exe)\s*<\/filePath>/i);
    if (fileMatch?.[1]) {
      relativeExePath = fileMatch[1].trim().replace(/\//g, '\\');
    }
  }

  return {
    contentId,
    title,
    version,
    relativeExePath,
    rawXml: xmlContent,
  };
}

/**
 * Validates whether a specific folder is an EA App / Origin game installation
 * using verified local manifest evidence (__Installer/installerdata.xml).
 */
export function detectEaAppGameInDirectory(
  gameDirPath: string
): DiscoveredGameCandidate | null {
  if (!fs.existsSync(gameDirPath)) {
    return null;
  }

  const manifestPath = path.join(gameDirPath, '__Installer', 'installerdata.xml');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  let xmlContent = '';
  try {
    xmlContent = fs.readFileSync(manifestPath, 'utf-8');
  } catch {
    return null;
  }

  const parsed = parseEaInstallerDataXml(xmlContent);
  if (!parsed || !parsed.contentId) {
    return null;
  }

  const folderName = path.basename(gameDirPath);
  const displayTitle = parsed.title || cleanEaGameTitle(folderName);

  // Resolve executable:
  // 1. Check relative executable from manifest if present
  let resolvedExe: string | null = null;
  if (parsed.relativeExePath) {
    const candidatePath = path.resolve(gameDirPath, parsed.relativeExePath);
    if (fs.existsSync(candidatePath)) {
      resolvedExe = path.normalize(candidatePath);
    }
  }

  // 2. If launcher is EAAntiCheat.GameServiceLauncher.exe or missing, check if direct game exe exists
  if (!resolvedExe || path.basename(resolvedExe).toLowerCase() === 'eaanticheat.gameservicelauncher.exe') {
    // Check direct root game exe (e.g. FC27.exe, F1_25.exe)
    const directExe = findPrimaryGameExecutable(gameDirPath, displayTitle, 2);
    if (directExe && !path.basename(directExe).toLowerCase().includes('anticheat')) {
      resolvedExe = directExe;
    } else if (!resolvedExe && directExe) {
      resolvedExe = directExe;
    }
  }

  if (!resolvedExe) {
    resolvedExe = findPrimaryGameExecutable(gameDirPath, displayTitle, 3);
  }

  const workingDir = resolvedExe ? path.dirname(resolvedExe) : gameDirPath;
  const appId = parsed.contentId;

  return {
    title: displayTitle,
    subtitle: `EA App · #${appId}`,
    platformId: 'ea',
    platformName: 'EA App',
    sourceType: 'ea',
    externalAppId: appId,
    developer: 'Electronic Arts',
    publisher: 'Electronic Arts',
    installPath: path.normalize(gameDirPath),
    executablePath: resolvedExe ? path.normalize(resolvedExe) : null,
    executableName: resolvedExe ? path.basename(resolvedExe) : null,
    workingDirectory: path.normalize(workingDir),
    launchArgs: null,
    launchMethod: resolvedExe ? 'executable' : 'unavailable',
    launchUri: `origin2://game/launch?offerIds=${appId}`,
    isInstalled: true,
    installSizeBytes: 0,
    buildVersion: parsed.version ?? 'Local',
    confidenceScore: 100,
    classification: 'verified-game',
  };
}

/**
 * Scans Windows registry and local EA Desktop manifests to detect installed EA App games.
 */
export async function scanEaAppInstallations(
  signal?: AbortSignal
): Promise<{
  report: PlatformDetectionReport;
  games: DiscoveredGameCandidate[];
}> {
  // 1. Detect EA Desktop launcher installation
  const eaDesktopPath32 = await queryRegistryValue(
    'HKLM\\SOFTWARE\\WOW6432Node\\Electronic Arts\\EA Desktop',
    'InstallLocation'
  );
  const eaDesktopPathNative = await queryRegistryValue(
    'HKLM\\SOFTWARE\\Electronic Arts\\EA Desktop',
    'InstallLocation'
  );
  const eaDesktopClientExe = await queryRegistryValue(
    'HKLM\\SOFTWARE\\WOW6432Node\\Electronic Arts\\EA Desktop',
    'DesktopAppPath'
  );

  const fallbackEaClientDir = 'C:\\Program Files\\Electronic Arts\\EA Desktop';
  const detectedEaPath =
    eaDesktopPath32 ??
    eaDesktopPathNative ??
    (fs.existsSync(fallbackEaClientDir) ? fallbackEaClientDir : null);

  const uninstallRoots = [
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];

  const discoveredGames: DiscoveredGameCandidate[] = [];
  const seenPaths = new Set<string>();

  // 2. Query Windows Uninstall registry for EA games using fast filtered queries
  for (const root of uninstallRoots) {
    if (signal?.aborted) break;

    try {
      const { stdout } = await execFileAsync(
        system32Binary('reg.exe'),
        ['query', root, '/f', 'Electronic Arts', '/s'],
        { windowsHide: true, timeout: 5000 }
      );

      const matchingKeyPaths = new Set<string>();
      for (const line of stdout.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (/^HKEY_/i.test(trimmed)) {
          matchingKeyPaths.add(trimmed);
        }
      }

      for (const subkey of matchingKeyPaths) {
        if (signal?.aborted) break;
        try {
          const { stdout: keyDetails } = await execFileAsync(
            system32Binary('reg.exe'),
            ['query', subkey],
            { windowsHide: true, timeout: 2000 }
          );

          const values: Record<string, string> = {};
          for (const line of keyDetails.split(/\r?\n/)) {
            const match = line.trim().match(/^([^\s]+)\s+REG_(?:SZ|EXPAND_SZ|DWORD)\s*(.*)$/i);
            if (match) {
              values[match[1]] = match[2]?.trim() ?? '';
            }
          }

          const installLocation = values.InstallLocation;
          const displayName = values.DisplayName;
          const displayIcon = values.DisplayIcon;

          if (!installLocation) {
            continue;
          }

          const normalizedDir = path.normalize(installLocation.replace(/"/g, '').trim());
          if (!fs.existsSync(normalizedDir)) {
            continue;
          }

          const lowerDir = normalizedDir.toLowerCase();
          if (seenPaths.has(lowerDir)) {
            continue;
          }
          seenPaths.add(lowerDir);

          // Check if folder has __Installer\installerdata.xml manifest
          const candidate = detectEaAppGameInDirectory(normalizedDir);
          if (candidate) {
            discoveredGames.push(candidate);
          } else if (displayName) {
            // Fallback: verified registry entry without installerdata.xml
            const cleanTitle = cleanEaGameTitle(displayName);
            let resolvedExe: string | null = null;
            if (displayIcon) {
              const cleanedIconPath = path.normalize(displayIcon.replace(/"/g, '').split(',')[0].trim());
              if (fs.existsSync(cleanedIconPath) && cleanedIconPath.toLowerCase().endsWith('.exe')) {
                resolvedExe = cleanedIconPath;
              }
            }
            if (!resolvedExe) {
              resolvedExe = findPrimaryGameExecutable(normalizedDir, cleanTitle, 2);
            }

            if (resolvedExe) {
              discoveredGames.push({
                title: cleanTitle,
                subtitle: 'EA App · Registry Installation',
                platformId: 'ea',
                platformName: 'EA App',
                sourceType: 'ea',
                externalAppId: path.basename(subkey),
                developer: 'Electronic Arts',
                publisher: 'Electronic Arts',
                installPath: normalizedDir,
                executablePath: resolvedExe,
                executableName: path.basename(resolvedExe),
                workingDirectory: path.dirname(resolvedExe),
                launchArgs: null,
                launchMethod: 'executable',
                launchUri: null,
                isInstalled: true,
                installSizeBytes: 0,
                buildVersion: values.DisplayVersion ?? '1.0',
                confidenceScore: 95,
                classification: 'verified-game',
              });
            }
          }
        } catch {
          // Ignore individual key read errors
        }
      }
    } catch {
      // Ignore reg error
    }
  }

  // 3. Query Origin Games registry key (HKLM\SOFTWARE\WOW6432Node\Origin Games)
  const originGamesRoots = [
    'HKLM\\SOFTWARE\\WOW6432Node\\Origin Games',
    'HKLM\\SOFTWARE\\Origin Games',
  ];

  for (const root of originGamesRoots) {
    if (signal?.aborted) break;
    const records = await queryRegistrySubkeys(root);

    for (const rec of records) {
      if (signal?.aborted) break;
      const contentId = path.basename(rec.subkeyPath);
      const rawTitle = rec.values.DisplayName;
      const installLocation = rec.values.InstallDir ?? rec.values.InstallLocation;

      if (!installLocation) continue;
      const normalizedDir = path.normalize(installLocation.replace(/"/g, '').trim());
      if (!fs.existsSync(normalizedDir)) continue;

      const lowerDir = normalizedDir.toLowerCase();
      if (seenPaths.has(lowerDir)) continue;
      seenPaths.add(lowerDir);

      const candidate = detectEaAppGameInDirectory(normalizedDir);
      if (candidate) {
        discoveredGames.push(candidate);
      } else {
        const cleanTitle = rawTitle ? cleanEaGameTitle(rawTitle) : path.basename(normalizedDir);
        const resolvedExe = findPrimaryGameExecutable(normalizedDir, cleanTitle, 2);
        if (resolvedExe) {
          discoveredGames.push({
            title: cleanTitle,
            subtitle: `EA App · #${contentId}`,
            platformId: 'ea',
            platformName: 'EA App',
            sourceType: 'ea',
            externalAppId: contentId,
            developer: 'Electronic Arts',
            publisher: 'Electronic Arts',
            installPath: normalizedDir,
            executablePath: resolvedExe,
            executableName: path.basename(resolvedExe),
            workingDirectory: path.dirname(resolvedExe),
            launchArgs: null,
            launchMethod: 'executable',
            launchUri: `origin2://game/launch?offerIds=${contentId}`,
            isInstalled: true,
            installSizeBytes: 0,
            buildVersion: '1.0',
            confidenceScore: 95,
            classification: 'verified-game',
          });
        }
      }
    }
  }

  const isDetected = Boolean(detectedEaPath || discoveredGames.length > 0);

  return {
    report: {
      platformId: 'ea',
      platformName: 'EA App',
      supported: true,
      status: isDetected ? 'detected' : 'not-found',
      detectedInstallPath: eaDesktopClientExe ? path.dirname(eaDesktopClientExe) : detectedEaPath,
      gamesDetectedCount: discoveredGames.length,
      detectionMethod:
        'Registry Uninstall Keys + Origin Games Subkeys + __Installer\\installerdata.xml DiPManifest',
      limitationNote:
        discoveredGames.length > 0
          ? undefined
          : 'No EA App installations detected in Windows registry or default manifest locations.',
    },
    games: discoveredGames,
  };
}
