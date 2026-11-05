import type { ScanResultSummary } from '../types/scanner';

export interface SystemDiagnosticInput {
  isBridgeAvailable: boolean;
  bridgeKeys: string[];
  dbConnected: boolean;
  dbGamesCount: number;
  scanError?: string | null;
  runtimeInfo?: {
    appName: string;
    appVersion: string;
    electronVersion: string;
    chromeVersion: string;
    nodeVersion: string;
    platform: string;
    arch: string;
    isPackaged: boolean;
  } | null;
  platformReports?: Array<{
    platformName: string;
    status: string;
    detectedInstallPath?: string | null;
    detectionMethod?: string;
  }>;
  customScanFolders?: string[];
}

export function generateSystemDiagnosticReportText(input: SystemDiagnosticInput): string {
  const lines: string[] = [];
  lines.push('================================================================================');
  lines.push('MaSwitch — System & IPC Bridge Diagnostics');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(
    `App: ${input.runtimeInfo?.appName ?? 'MaSwitch'} v${input.runtimeInfo?.appVersion ?? '0.2.0'} (Packaged: ${input.runtimeInfo?.isPackaged ? 'Yes' : 'No'})`
  );
  lines.push(
    `OS Platform: ${input.runtimeInfo?.platform ?? 'win32'} (${input.runtimeInfo?.arch ?? 'x64'})`
  );
  lines.push(
    `Electron: ${input.runtimeInfo?.electronVersion ?? 'N/A'} | Chrome: ${input.runtimeInfo?.chromeVersion ?? 'N/A'} | Node: ${input.runtimeInfo?.nodeVersion ?? 'N/A'}`
  );
  lines.push('================================================================================');
  lines.push('');

  lines.push('--- ELECTRON PRELOAD BRIDGE & IPC STATUS ---');
  lines.push(
    `Preload Bridge (window.maswitch): ${input.isBridgeAvailable ? 'AVAILABLE (OK)' : 'MISSING / INJECTION ERROR'}`
  );
  lines.push(
    `Exposed Bridge Modules: ${input.bridgeKeys.length > 0 ? input.bridgeKeys.join(', ') : 'None'}`
  );
  lines.push(
    `Local SQLite Database: ${input.dbConnected ? `CONNECTED (OK) — ${input.dbGamesCount} game(s) currently stored in DB` : 'UNAVAILABLE'}`
  );
  lines.push('');

  if (input.scanError) {
    lines.push('--- RECENT SCAN ERROR ---');
    lines.push(`Error: ${input.scanError}`);
    lines.push('');
  }

  lines.push('--- DEFAULT SCAN PATHS & PLATFORM TARGETS ---');
  lines.push('• Steam Library: C:\\Program Files (x86)\\Steam (reads libraryfolders.vdf & appmanifest_*.acf)');
  lines.push('• Epic Games Launcher: %ProgramData%\\Epic\\EpicGamesLauncher\\Data\\Manifests (*.item)');
  lines.push('• GOG Galaxy: %ProgramFiles(x86)%\\GOG Galaxy\\Games & Registry');
  lines.push('• Ubisoft Connect: %ProgramFiles(x86)%\\Ubisoft\\Ubisoft Game Launcher & Registry');
  lines.push('• Riot Games: C:\\Riot Games & %ProgramData%\\Riot Games');
  lines.push('• EA App: %ProgramFiles%\\Electronic Arts\\EA Desktop & Registry');
  if (input.customScanFolders && input.customScanFolders.length > 0) {
    lines.push(`• Custom Scan Folders (${input.customScanFolders.length}):`);
    for (const f of input.customScanFolders) {
      lines.push(`    - ${f}`);
    }
  }
  lines.push('');

  if (input.platformReports && input.platformReports.length > 0) {
    lines.push('--- PLATFORM DETECTION STATUS ---');
    for (const p of input.platformReports) {
      lines.push(
        `[${p.platformName}] Status: ${p.status.toUpperCase()}${p.detectedInstallPath ? ` — Path: ${p.detectedInstallPath}` : ''}`
      );
    }
    lines.push('');
  }

  lines.push('================================================================================');
  return lines.join('\r\n');
}

export function generateDiagnosticReportText(summary: ScanResultSummary): string {
  const lines: string[] = [];
  const started = summary.startedAtIso ? new Date(summary.startedAtIso).toLocaleString() : 'Unknown';
  const durationMs = summary.diagnostics?.durationMs ??
    (summary.finishedAtIso && summary.startedAtIso
      ? Math.max(0, Date.parse(summary.finishedAtIso) - Date.parse(summary.startedAtIso))
      : 0);

  lines.push('================================================================================');
  lines.push('MaSwitch — Game Scanner Diagnostic Report');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`Scan ID: ${summary.scanId}`);
  lines.push(`Status: ${summary.status.toUpperCase()} (${(durationMs / 1000).toFixed(2)}s)`);
  lines.push(`Started At: ${started}`);
  lines.push(`Total Unique Games Detected: ${summary.totalFound}`);
  lines.push(`Saved/Updated in SQLite: ${summary.addedOrUpdatedCount}`);
  lines.push(`Duplicates Skipped: ${summary.duplicatesSkipped}`);
  lines.push('================================================================================');
  lines.push('');

  lines.push('--- PLATFORMS CHECKED ---');
  if (summary.diagnostics?.platformsChecked && summary.diagnostics.platformsChecked.length > 0) {
    for (const p of summary.diagnostics.platformsChecked) {
      lines.push(`[${p.platformName}] Status: ${p.status.toUpperCase()} — Games: ${p.gamesDiscoveredCount}`);
      if (p.pathsSearched.length > 0) {
        lines.push(`  Paths Searched:`);
        for (const pathStr of p.pathsSearched) {
          lines.push(`    - ${pathStr}`);
        }
      }
      if (p.manifestFilesFound > 0) {
        lines.push(`  Manifest Files Found: ${p.manifestFilesFound}`);
      }
      if (p.details) {
        lines.push(`  Details: ${p.details}`);
      }
      if (p.warningsOrErrors && p.warningsOrErrors.length > 0) {
        lines.push(`  Warnings/Errors: ${p.warningsOrErrors.join('; ')}`);
      }
    }
  } else {
    for (const report of summary.platformReports) {
      lines.push(`[${report.platformName}] Status: ${report.status.toUpperCase()} — Games: ${report.gamesDetectedCount}`);
      if (report.detectedInstallPath) {
        lines.push(`  Install Path: ${report.detectedInstallPath}`);
      }
      if (report.detectionMethod) {
        lines.push(`  Method: ${report.detectionMethod}`);
      }
      if (report.limitationNote) {
        lines.push(`  Note: ${report.limitationNote}`);
      }
    }
  }
  lines.push('');

  if (summary.diagnostics?.commonFoldersSearched && summary.diagnostics.commonFoldersSearched.length > 0) {
    lines.push('--- COMMON & CUSTOM DIRECTORIES SEARCHED ---');
    for (const f of summary.diagnostics.commonFoldersSearched) {
      lines.push(`  - ${f}`);
    }
    lines.push('');
  }

  lines.push('--- DISCOVERED GAMES BREAKDOWN ---');
  if (summary.diagnostics?.platformsChecked) {
    let index = 1;
    for (const p of summary.diagnostics.platformsChecked) {
      if (p.detectedGames.length > 0) {
        for (const g of p.detectedGames) {
          lines.push(`${index}. ${g.title} [${p.platformName}]`);
          lines.push(`   Install: ${g.installPath ?? 'N/A'}`);
          lines.push(`   Executable: ${g.executablePath ?? 'N/A'}`);
          lines.push(`   Launch Method: ${g.launchMethod}`);
          index++;
        }
      }
    }
    if (index === 1) {
      lines.push('  No games discovered.');
    }
  } else {
    lines.push(`  Total discovered: ${summary.totalFound}`);
  }
  lines.push('');

  lines.push('--- WARNINGS & ERRORS ---');
  const allErrors = [
    ...(summary.diagnostics?.warnings ?? []),
    ...(summary.diagnostics?.errors ?? []),
    ...summary.errors,
  ];
  if (allErrors.length > 0) {
    for (const err of allErrors) {
      lines.push(`  ! ${err}`);
    }
  } else {
    lines.push('  None. All scan modules executed cleanly.');
  }
  lines.push('================================================================================');

  return lines.join('\r\n');
}

