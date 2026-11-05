import type { GameItem } from '../shared/types/game';

export interface ScannerArchitectureDescriptor {
  scannerReadyInPhase1: false;
  targetPhase: 'Phase 2';
  plannedWindowsLocations: readonly string[];
}

/**
 * Module 3: Installed-Game Scanning Service (Phase 1 Foundation)
 *
 * Defines the contract for scanning local Windows drives and registry entries
 * for installed Steam, Epic, Riot, EA, Ubisoft, and Rockstar titles in Phase 2.
 */
export class InstalledGameScannerService {
  public getInstalledCount(games: readonly GameItem[]): number {
    return games.filter((g) => g.isInstalled).length;
  }

  public getTotalInstalledDiskSizeGb(games: readonly GameItem[]): number {
    const total = games
      .filter((g) => g.isInstalled)
      .reduce((acc, game) => acc + game.ownership.installSizeGb, 0);
    return Math.round(total * 10) / 10;
  }

  public getScannerDescriptor(): ScannerArchitectureDescriptor {
    return {
      scannerReadyInPhase1: false,
      targetPhase: 'Phase 2',
      plannedWindowsLocations: [
        'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam (appmanifest_*.acf)',
        'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests (*.item)',
        'C:\\ProgramData\\Riot Games\\Metadata',
        'HKLM\\SOFTWARE\\Electronic Arts\\EA Desktop\\Installations',
        'HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs',
      ],
    };
  }
}

export const installedGameScannerService = new InstalledGameScannerService();

