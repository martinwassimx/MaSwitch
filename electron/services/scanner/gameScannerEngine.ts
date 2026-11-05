import path from 'node:path';
import type { PlatformDetectionReport } from '../../../src/shared/types/platform';
import type {
  DiscoveredGameCandidate,
  PlatformScanDiagnostic,
  ScanDiagnostics,
  ScanProgressPayload,
  ScanResultSummary,
} from '../../../src/shared/types/scanner';
import { scanEpicGamesManifests } from './epicScanner';
import {
  detectCommonWindowsGameDirectories,
  scanUserSelectedFolders,
  scanWindowsUninstallRegistryForGames,
} from './generalWindowsScanner';
import { scanAdditionalPlatforms } from './platformAdapters';
import { scanSteamLibraries } from './steamScanner';

export interface GameScannerOptions {
  steamOverridePath?: string;
  epicOverrideManifestsDir?: string;
  customFolders?: string[];
  includeRegistry?: boolean;
  skipPlatformRegistryProbes?: boolean;
  onProgress?: (progress: ScanProgressPayload) => void;
}

export interface DeduplicationResult {
  uniqueGames: DiscoveredGameCandidate[];
  duplicatesSkipped: number;
}

const PLATFORM_PRIORITY: Record<string, number> = {
  steam: 1,
  epic: 1,
  riot: 1,
  gog: 1,
  ubisoft: 1,
  ea: 1,
  rockstar: 1,
  custom: 2,
  discord: 3,
};

/**
 * Deduplicates discovered game installations across platforms, folders, and registry entries.
 * Prioritizes official launcher platform detections over generic folder scans.
 * Primary keys:
 *  1) `${platformId}::${externalAppId}`
 *  2) Normalized canonical `executablePath`
 *  3) Normalized canonical `installPath`
 *  4) Clean title match across official platforms
 */
export function deduplicateDiscoveredGames(
  candidates: readonly DiscoveredGameCandidate[]
): DeduplicationResult {
  // Sort so dedicated platform candidates are processed before generic folder scans
  const sorted = [...candidates].sort((a, b) => {
    const prioA = PLATFORM_PRIORITY[a.platformId] ?? 2;
    const prioB = PLATFORM_PRIORITY[b.platformId] ?? 2;
    return prioA - prioB;
  });

  const uniqueGames: DiscoveredGameCandidate[] = [];
  const seenKeys = new Set<string>();
  const seenExePaths = new Set<string>();
  const seenInstallPaths = new Set<string>();
  const seenCleanTitles = new Set<string>();
  let duplicatesSkipped = 0;

  for (const candidate of sorted) {
    const primaryKey = candidate.externalAppId
      ? `${candidate.platformId}::${candidate.externalAppId.toLowerCase()}`
      : `${candidate.platformId}::title:${candidate.title.toLowerCase()}`;

    const normExe = candidate.executablePath
      ? path.normalize(candidate.executablePath).toLowerCase()
      : null;

    const normInstall = candidate.installPath
      ? path.normalize(candidate.installPath).toLowerCase()
      : null;

    const cleanTitle = candidate.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    // If an official launcher already registered this game by install path, exe, or title, skip the duplicate
    const isDuplicate =
      seenKeys.has(primaryKey) ||
      (normExe !== null && seenExePaths.has(normExe)) ||
      (normInstall !== null && seenInstallPaths.has(normInstall)) ||
      (candidate.platformId === 'custom' && cleanTitle.length >= 4 && seenCleanTitles.has(cleanTitle));

    if (isDuplicate) {
      duplicatesSkipped += 1;
      continue;
    }

    seenKeys.add(primaryKey);
    if (normExe) {
      seenExePaths.add(normExe);
    }
    if (normInstall) {
      seenInstallPaths.add(normInstall);
    }
    if (cleanTitle.length >= 4) {
      seenCleanTitles.add(cleanTitle);
    }

    uniqueGames.push(candidate);
  }

  return {
    uniqueGames,
    duplicatesSkipped,
  };
}

export class GameScannerEngine {
  private activeAbortController: AbortController | null = null;
  private lastPlatformReports: PlatformDetectionReport[] = [];

  public isScanning(): boolean {
    return this.activeAbortController !== null;
  }

  public cancelActiveScan(): boolean {
    if (!this.activeAbortController) {
      return false;
    }
    this.activeAbortController.abort();
    return true;
  }

  public getLastPlatformReports(): PlatformDetectionReport[] {
    return [...this.lastPlatformReports];
  }

  public async runScan(
    options: GameScannerOptions = {},
    persistCallback?: (
      candidates: DiscoveredGameCandidate[]
    ) => Promise<number> | number
  ): Promise<{
    summary: ScanResultSummary;
    games: DiscoveredGameCandidate[];
  }> {
    if (this.activeAbortController) {
      throw new Error('A game scan job is already in progress.');
    }

    const abortController = new AbortController();
    this.activeAbortController = abortController;
    const { signal } = abortController;

    const startTimeMs = Date.now();
    const scanId = `scan-${Date.now()}`;
    const startedAtIso = new Date().toISOString();
    const rawCandidates: DiscoveredGameCandidate[] = [];
    const platformReports: PlatformDetectionReport[] = [];
    const platformDiagnostics: PlatformScanDiagnostic[] = [];
    let commonFoldersSearched: string[] = [];
    const errors: string[] = [];

    const emitProgress = (
      phase: ScanProgressPayload['phase'],
      message: string,
      percent: number
    ) => {
      options.onProgress?.({
        scanId,
        phase,
        message,
        percent,
        discoveredCount: rawCandidates.length,
      });
    };

    try {
      // 1. Steam Scan
      emitProgress(
        'scanning-steam',
        'Scanning Steam library folders and ACF manifests...',
        15
      );
      await new Promise((resolve) => setImmediate(resolve));

      if (!signal.aborted) {
        try {
          const steamRes = await scanSteamLibraries(
            options.steamOverridePath,
            signal
          );
          platformReports.push(steamRes.report);
          rawCandidates.push(...steamRes.games);
          platformDiagnostics.push({
            platformId: 'steam',
            platformName: 'Steam',
            status: steamRes.report.status,
            pathsSearched:
              steamRes.diagnostics?.searchedDirs ??
              (steamRes.report.detectedInstallPath
                ? [steamRes.report.detectedInstallPath]
                : []),
            manifestFilesFound: steamRes.diagnostics?.manifestFilesFound ?? 0,
            gamesDiscoveredCount: steamRes.games.length,
            detectedGames: steamRes.games.map((g) => ({
              title: g.title,
              installPath: g.installPath,
              executablePath: g.executablePath,
              launchMethod: g.launchMethod,
            })),
            details: steamRes.report.detectionMethod,
          });
        } catch (err) {
          const msg = `Steam scan warning: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(msg);
          platformDiagnostics.push({
            platformId: 'steam',
            platformName: 'Steam',
            status: 'error',
            pathsSearched: [],
            manifestFilesFound: 0,
            gamesDiscoveredCount: 0,
            detectedGames: [],
            warningsOrErrors: [msg],
          });
        }
      }

      // 2. Epic Games Scan
      emitProgress(
        'scanning-epic',
        'Scanning Epic Games Launcher local .item manifests...',
        35
      );
      await new Promise((resolve) => setImmediate(resolve));

      if (!signal.aborted) {
        try {
          const epicRes = await scanEpicGamesManifests(
            options.epicOverrideManifestsDir,
            signal
          );
          platformReports.push(epicRes.report);
          rawCandidates.push(...epicRes.games);
          platformDiagnostics.push({
            platformId: 'epic',
            platformName: 'Epic Games',
            status: epicRes.report.status,
            pathsSearched:
              epicRes.diagnostics?.searchedDirs ??
              (epicRes.report.detectedInstallPath
                ? [epicRes.report.detectedInstallPath]
                : []),
            manifestFilesFound: epicRes.diagnostics?.manifestFilesFound ?? 0,
            gamesDiscoveredCount: epicRes.games.length,
            detectedGames: epicRes.games.map((g) => ({
              title: g.title,
              installPath: g.installPath,
              executablePath: g.executablePath,
              launchMethod: g.launchMethod,
            })),
            details: epicRes.report.detectionMethod,
          });
        } catch (err) {
          const msg = `Epic scan warning: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(msg);
          platformDiagnostics.push({
            platformId: 'epic',
            platformName: 'Epic Games',
            status: 'error',
            pathsSearched: [],
            manifestFilesFound: 0,
            gamesDiscoveredCount: 0,
            detectedGames: [],
            warningsOrErrors: [msg],
          });
        }
      }

      // 3. Additional Platforms (GOG, Ubisoft, Riot, EA, Rockstar)
      if (!options.skipPlatformRegistryProbes && !signal.aborted) {
        emitProgress(
          'scanning-gog',
          'Checking GOG Galaxy, Ubisoft Connect, Riot Games, EA, and Rockstar records...',
          58
        );
        await new Promise((resolve) => setImmediate(resolve));

        try {
          const additionalRes = await scanAdditionalPlatforms(signal);
          platformReports.push(...additionalRes.reports);
          rawCandidates.push(...additionalRes.games);

          for (const rep of additionalRes.reports) {
            const platformGames = additionalRes.games.filter(
              (g) => g.platformId === rep.platformId
            );
            platformDiagnostics.push({
              platformId: rep.platformId,
              platformName: rep.platformName,
              status: rep.status,
              pathsSearched: rep.detectedInstallPath
                ? [rep.detectedInstallPath]
                : [],
              manifestFilesFound: platformGames.length,
              gamesDiscoveredCount: platformGames.length,
              detectedGames: platformGames.map((g) => ({
                title: g.title,
                installPath: g.installPath,
                executablePath: g.executablePath,
                launchMethod: g.launchMethod,
              })),
              details: rep.detectionMethod,
              warningsOrErrors: rep.limitationNote ? [rep.limitationNote] : [],
            });
          }
        } catch (err) {
          const msg = `Additional platform scan warning: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(msg);
        }
      }

      // 4. Common Game Directories & Custom User-Selected Folders
      const detectedCommon = detectCommonWindowsGameDirectories();
      const combinedFolders = Array.from(
        new Set([...detectedCommon, ...(options.customFolders ?? [])])
      );
      commonFoldersSearched = combinedFolders;

      if (combinedFolders.length > 0 && !signal.aborted) {
        emitProgress(
          'scanning-folders',
          `Scanning ${combinedFolders.length} common & custom game director${combinedFolders.length === 1 ? 'y' : 'ies'}...`,
          75
        );
        await new Promise((resolve) => setImmediate(resolve));

        try {
          const folderGames = scanUserSelectedFolders(combinedFolders, signal);
          rawCandidates.push(...folderGames);

          platformDiagnostics.push({
            platformId: 'custom',
            platformName: 'Common Game Folders',
            status: folderGames.length > 0 ? 'detected' : 'not-found',
            pathsSearched: combinedFolders,
            manifestFilesFound: 0,
            gamesDiscoveredCount: folderGames.length,
            detectedGames: folderGames.map((g) => ({
              title: g.title,
              installPath: g.installPath,
              executablePath: g.executablePath,
              launchMethod: g.launchMethod,
            })),
            details: `Proactively searched ${combinedFolders.length} directory path(s) across Windows drives.`,
          });
        } catch (err) {
          const msg = `Folder scan warning: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(msg);
        }
      }

      // 5. Optional General Windows Uninstall Registry
      if (
        options.includeRegistry &&
        !options.skipPlatformRegistryProbes &&
        !signal.aborted
      ) {
        emitProgress(
          'scanning-registry',
          'Evaluating Windows installed application registry entries...',
          88
        );
        await new Promise((resolve) => setImmediate(resolve));

        try {
          const regGames = await scanWindowsUninstallRegistryForGames(signal);
          rawCandidates.push(...regGames);

          platformDiagnostics.push({
            platformId: 'custom',
            platformName: 'Windows Registry',
            status: regGames.length > 0 ? 'detected' : 'not-found',
            pathsSearched: ['HKLM/HKCU Uninstall Registry'],
            manifestFilesFound: regGames.length,
            gamesDiscoveredCount: regGames.length,
            detectedGames: regGames.map((g) => ({
              title: g.title,
              installPath: g.installPath,
              executablePath: g.executablePath,
              launchMethod: g.launchMethod,
            })),
          });
        } catch (err) {
          const msg = `Registry scan warning: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(msg);
        }
      }

      if (signal.aborted) {
        const cancelledSummary: ScanResultSummary = {
          scanId,
          status: 'cancelled',
          startedAtIso,
          finishedAtIso: new Date().toISOString(),
          totalFound: rawCandidates.length,
          addedOrUpdatedCount: 0,
          duplicatesSkipped: 0,
          platformReports,
          errors,
        };
        emitProgress('cancelled', 'Game scan cancelled by user.', 100);
        return { summary: cancelledSummary, games: [] };
      }

      // Deduplicate discoveries
      const { uniqueGames, duplicatesSkipped } =
        deduplicateDiscoveredGames(rawCandidates);

      emitProgress(
        'saving',
        `Saving ${uniqueGames.length} verified installation(s) to local SQLite library...`,
        95
      );

      let addedOrUpdatedCount = uniqueGames.length;
      if (persistCallback) {
        addedOrUpdatedCount = await persistCallback(uniqueGames);
      }

      this.lastPlatformReports = platformReports;

      // Filter diagnostic items to final deduplicated set per platform
      for (const diag of platformDiagnostics) {
        diag.detectedGames = uniqueGames
          .filter((g) => {
            if (diag.platformName === 'Common Game Folders') {
              return g.platformId === 'custom';
            }
            return g.platformId === diag.platformId;
          })
          .map((g) => ({
            title: g.title,
            installPath: g.installPath,
            executablePath: g.executablePath,
            launchMethod: g.launchMethod,
          }));
        diag.gamesDiscoveredCount = diag.detectedGames.length;
      }

      const durationMs = Date.now() - startTimeMs;
      const diagnostics: ScanDiagnostics = {
        timestamp: new Date().toISOString(),
        durationMs,
        platformsChecked: platformDiagnostics,
        commonFoldersSearched,
        totalDiscovered: rawCandidates.length,
        totalUniqueSaved: uniqueGames.length,
        duplicatesSkipped,
        warnings: errors.filter((e) => e.toLowerCase().includes('warning')),
        errors: errors.filter((e) => !e.toLowerCase().includes('warning')),
      };

      const summary: ScanResultSummary = {
        scanId,
        status: 'completed',
        startedAtIso,
        finishedAtIso: new Date().toISOString(),
        totalFound: uniqueGames.length,
        addedOrUpdatedCount,
        duplicatesSkipped,
        platformReports,
        errors,
        diagnostics,
      };

      emitProgress(
        'completed',
        `Scan complete: ${uniqueGames.length} game(s) detected.`,
        100
      );

      return {
        summary,
        games: uniqueGames,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(errMsg);
      const failedSummary: ScanResultSummary = {
        scanId,
        status: 'failed',
        startedAtIso,
        finishedAtIso: new Date().toISOString(),
        totalFound: 0,
        addedOrUpdatedCount: 0,
        duplicatesSkipped: 0,
        platformReports,
        errors,
      };
      emitProgress('failed', `Scan failed: ${errMsg}`, 100);
      return { summary: failedSummary, games: [] };
    } finally {
      this.activeAbortController = null;
    }
  }
}

