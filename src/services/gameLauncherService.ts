import type { GameLaunchResult, GameLaunchState } from '../shared/types/game';
import type { PlatformId } from '../shared/types/platform';

export interface LaunchProtocolSpec {
  platformId: PlatformId;
  protocolScheme: string;
  phaseStatus: 'Active in Phase 2' | 'Direct Executable';
}

export class GameLauncherService {
  public getPlannedProtocolSpec(platformId: PlatformId): LaunchProtocolSpec {
    const schemes: Record<PlatformId, string> = {
      steam: 'steam://rungameid/<appId>',
      epic: 'com.epicgames.launcher://apps/<appName>?action=launch&silent=true',
      gog: 'Direct Validated Executable Spawn (shell: false)',
      riot: 'Direct Validated Executable Spawn (shell: false)',
      ea: 'Direct Validated Executable Spawn (shell: false)',
      ubisoft: 'Direct Validated Executable Spawn (shell: false)',
      rockstar: 'Direct Validated Executable Spawn (shell: false)',
      discord: 'Direct Validated Executable Spawn (shell: false)',
      custom: 'Direct Validated Executable Spawn (shell: false)',
    };

    return {
      platformId,
      protocolScheme: schemes[platformId] ?? 'Direct Executable',
      phaseStatus: 'Active in Phase 2',
    };
  }

  public async launchGame(gameId: string): Promise<GameLaunchResult> {
    if (window.maswitch?.launcher) {
      return window.maswitch.launcher.launchGame(gameId);
    }
    return {
      success: false,
      gameId,
      status: 'launcher-unavailable',
      message: 'Electron launcher bridge is unavailable in this environment.',
    };
  }

  public async getStatuses(): Promise<Record<string, GameLaunchState>> {
    if (window.maswitch?.launcher) {
      try {
        return await window.maswitch.launcher.getStatuses();
      } catch {
        return {};
      }
    }
    return {};
  }
}

export const gameLauncherService = new GameLauncherService();
