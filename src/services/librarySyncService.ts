import type { GameItem } from '../shared/types/game';
import type { PlatformId, PlatformInfo } from '../shared/types/platform';
import { DEMO_GAMES } from './demoData/demoGames';
import { DEMO_PLATFORMS } from './demoData/demoPlatforms';

export interface LibrarySyncModuleStatus {
  isLiveSyncEnabled: false;
  phaseLabel: 'Phase 1 Demonstration Dataset';
  plannedConnectors: ReadonlyArray<{
    platformId: PlatformId;
    connectorType: string;
    targetPhase: string;
  }>;
}

/**
 * Module 2: Steam & Epic Library Synchronization Service (Phase 1 Foundation)
 *
 * Provides typed demonstration data in Phase 1 while defining the service contract
 * for Phase 2 Steam VDF/API & Epic Games manifest synchronization.
 */
export class LibrarySyncService {
  public getDemoLibrary(): GameItem[] {
    return DEMO_GAMES;
  }

  public getSupportedPlatforms(): PlatformInfo[] {
    return DEMO_PLATFORMS;
  }

  public getModuleStatus(): LibrarySyncModuleStatus {
    return {
      isLiveSyncEnabled: false,
      phaseLabel: 'Phase 1 Demonstration Dataset',
      plannedConnectors: [
        {
          platformId: 'steam',
          connectorType: 'Local libraryfolders.vdf + Steam Web API Public Profile Reader',
          targetPhase: 'Phase 2',
        },
        {
          platformId: 'epic',
          connectorType: 'ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests Reader',
          targetPhase: 'Phase 2',
        },
      ],
    };
  }
}

export const librarySyncService = new LibrarySyncService();

