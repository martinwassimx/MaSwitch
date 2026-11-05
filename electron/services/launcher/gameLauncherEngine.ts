import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {
  GameItem,
  GameLaunchDiagnostics,
  GameLaunchErrorCategory,
  GameLaunchResult,
  GameLaunchState,
} from '../../../src/shared/types/game';
import type { LauncherStatusChangedPayload } from '../../../src/shared/types/ipc';

/**
 * Safely tokenizes a launch arguments string into an array of discrete arguments
 * without shell evaluation or command injection vectors.
 */
export function parseSafeLaunchArguments(rawArgs?: string | null): string[] {
  if (!rawArgs || typeof rawArgs !== 'string') {
    return [];
  }

  const trimmed = rawArgs.trim();
  if (trimmed.length === 0) {
    return [];
  }

  if (trimmed.includes('\0')) {
    throw new Error('Launch arguments contain invalid null characters.');
  }

  const args: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if ((ch === ' ' || ch === '\t') && !inQuotes) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

export function validateSteamLaunchUri(appId: string | null | undefined): string {
  if (!appId || typeof appId !== 'string' || !/^\d{1,10}$/.test(appId.trim())) {
    throw new Error('Invalid Steam App ID. Expected numeric identifier.');
  }
  return `steam://rungameid/${appId.trim()}`;
}

export function validateEpicLaunchUri(
  appName: string | null | undefined
): string {
  if (
    !appName ||
    typeof appName !== 'string' ||
    !/^[a-zA-Z0-9._-]+$/.test(appName.trim())
  ) {
    throw new Error('Invalid Epic Games AppName identifier.');
  }
  return `com.epicgames.launcher://apps/${encodeURIComponent(appName.trim())}?action=launch&silent=true`;
}

export function validateUbisoftLaunchUri(
  appId: string | null | undefined
): string {
  if (!appId || typeof appId !== 'string' || !/^\d{1,10}$/.test(appId.trim())) {
    throw new Error('Invalid Ubisoft Connect App ID. Expected numeric identifier.');
  }
  return `uplay://launch/${appId.trim()}/0`;
}

export function validateGogLaunchUri(
  appId: string | null | undefined
): string {
  if (!appId || typeof appId !== 'string' || !/^\d{1,15}$/.test(appId.trim())) {
    throw new Error('Invalid GOG Galaxy game ID. Expected numeric identifier.');
  }
  return `goggalaxy://openGameView/${appId.trim()}`;
}

export function validateRockstarLaunchUri(
  appId: string | null | undefined
): string {
  if (
    !appId ||
    typeof appId !== 'string' ||
    !/^[a-zA-Z0-9._-]+$/.test(appId.trim())
  ) {
    throw new Error('Invalid Rockstar Games launch title.');
  }
  return `rockstar://run/${encodeURIComponent(appId.trim())}`;
}

export function validateEaLaunchUri(
  offerId: string | null | undefined
): string {
  if (
    !offerId ||
    typeof offerId !== 'string' ||
    !/^[a-zA-Z0-9._-]+$/.test(offerId.trim())
  ) {
    throw new Error('Invalid EA App Offer ID.');
  }
  return `origin2://game/launch?offerIds=${encodeURIComponent(offerId.trim())}`;
}

/**
 * Discovers the local Windows path to RiotClientServices.exe from the official
 * ProgramData installation registry or standard install locations.
 */
export function resolveRiotClientServicesPath(): string | null {
  if (process.platform !== 'win32') return null;

  try {
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    const configPath = path.join(
      programData,
      'Riot Games',
      'RiotClientInstalls.json'
    );
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(content);
      const candidate = parsed.rc_live || parsed.rc_default;
      if (typeof candidate === 'string' && fs.existsSync(candidate)) {
        return path.normalize(candidate);
      }
    }
  } catch {
    // Continue to standard path fallback
  }

  const standardPaths = [
    path.join('C:', 'Riot Games', 'Riot Client', 'RiotClientServices.exe'),
    path.join('D:', 'Riot Games', 'Riot Client', 'RiotClientServices.exe'),
  ];

  for (const p of standardPaths) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

/**
 * Determines the Riot Client product key and launch patchline.
 */
export function resolveRiotProductFromGame(game: GameItem): {
  product: string;
  patchline: string;
} {
  const titleLower = game.title.toLowerCase();
  const appIdLower = (game.externalAppId ?? '').toLowerCase();

  if (titleLower.includes('valorant') || appIdLower.includes('valorant')) {
    return { product: 'valorant', patchline: 'live' };
  }
  if (
    titleLower.includes('teamfight') ||
    titleLower.includes('tft') ||
    appIdLower.includes('tft')
  ) {
    return { product: 'league_of_legends', patchline: 'live' };
  }
  return { product: 'league_of_legends', patchline: 'live' };
}

export function validateExecutableLaunchTarget(
  executablePath: string | null | undefined,
  workingDirectory?: string | null
): { exePath: string; cwd: string } {
  if (!executablePath || typeof executablePath !== 'string') {
    throw new Error('Executable path is missing.');
  }

  if (executablePath.includes('\0')) {
    throw new Error('Executable path contains invalid characters.');
  }

  const normalizedExe = path.normalize(executablePath.trim());
  if (!path.isAbsolute(normalizedExe)) {
    throw new Error('Executable path must be an absolute path.');
  }

  if (!normalizedExe.toLowerCase().endsWith('.exe')) {
    throw new Error('Target file must be a Windows executable (.exe).');
  }

  let exeStat: fs.Stats;
  try {
    exeStat = fs.statSync(normalizedExe);
  } catch {
    throw new Error(`Executable file not found on disk: ${normalizedExe}`);
  }

  if (!exeStat.isFile()) {
    throw new Error(`Target path is not a valid file: ${normalizedExe}`);
  }

  const resolvedCwd =
    workingDirectory && workingDirectory.trim().length > 0
      ? path.normalize(workingDirectory.trim())
      : path.dirname(normalizedExe);

  try {
    const cwdStat = fs.statSync(resolvedCwd);
    if (!cwdStat.isDirectory()) {
      throw new Error(`Working directory is not a folder: ${resolvedCwd}`);
    }
  } catch {
    throw new Error(`Working directory does not exist: ${resolvedCwd}`);
  }

  return {
    exePath: normalizedExe,
    cwd: resolvedCwd,
  };
}

/**
 * Builds actionable troubleshooting diagnostics when a launch attempt encounters an error.
 */
export function createLaunchDiagnostics(
  game: GameItem,
  err: unknown
): GameLaunchDiagnostics {
  const errMsg = err instanceof Error ? err.message : String(err);
  let errorCategory: GameLaunchErrorCategory = 'unknown';
  let advice =
    'Check your game installation or verify the official launcher settings.';

  const exePath = game.executablePath;
  let exeExists = false;
  if (exePath) {
    try {
      exeExists = fs.existsSync(exePath);
    } catch {
      exeExists = false;
    }
  }

  const cwd = game.workingDirectory || (exePath ? path.dirname(exePath) : null);
  let cwdExists = false;
  if (cwd) {
    try {
      cwdExists = fs.existsSync(cwd);
    } catch {
      cwdExists = false;
    }
  }

  if (
    errMsg.includes('not found') ||
    errMsg.includes('missing') ||
    (!exeExists && exePath)
  ) {
    errorCategory = 'file-not-found';
    advice = `The target game executable was not found at "${exePath ?? 'unknown'}". Verify that the game is still installed or scan your library again.`;
  } else if (
    errMsg.includes('EACCES') ||
    errMsg.includes('permission') ||
    errMsg.includes('access')
  ) {
    errorCategory = 'permission-denied';
    advice =
      'Windows denied permission to execute the target process. Check file ownership and antivirus software permissions.';
  } else if (
    errMsg.includes('Protocol') ||
    errMsg.includes('protocol') ||
    errMsg.includes('No verified launch')
  ) {
    errorCategory = 'protocol-unavailable';
    advice = `The official desktop client for ${game.platformId.toUpperCase()} is required to launch this title. Ensure the platform launcher is installed and up-to-date.`;
  } else if (
    errMsg.includes('anti-cheat') ||
    errMsg.includes('vanguard') ||
    errMsg.includes('DRM')
  ) {
    errorCategory = 'drm-anti-cheat-barrier';
    advice =
      'Background anti-cheat services (e.g. Riot Vanguard, Easy Anti-Cheat) must be active to launch this title.';
  } else {
    errorCategory = 'corrupted-installation';
    advice =
      'An unexpected execution error occurred. Verify the game installation integrity through its native launcher.';
  }

  return {
    gameId: game.id,
    gameTitle: game.title,
    platformId: game.platformId,
    launchMethod: game.launchMethod ?? 'executable',
    executablePath: exePath,
    executableExists: exeExists,
    workingDirectory: cwd,
    workingDirectoryExists: cwdExists,
    errorCategory,
    technicalDetails: errMsg,
    troubleshootingAdvice: advice,
  };
}

export interface LauncherEngineAdapters {
  openExternalProtocol?: (uri: string) => Promise<void>;
  spawnProcess?: (
    exePath: string,
    args: string[],
    cwd: string
  ) => Promise<{ pid?: number; child?: ChildProcess }>;
  onStatusChanged?: (payload: LauncherStatusChangedPayload) => void;
  onGameLaunchedForTracking?: (params: {
    game: GameItem;
    executablePath: string;
    pid?: number;
  }) => void;
  riotClientPathResolver?: () => string | null;
}

export class GameLauncherEngine {
  private readonly statuses = new Map<string, GameLaunchState>();
  private readonly adapters: LauncherEngineAdapters;

  constructor(adapters: LauncherEngineAdapters = {}) {
    this.adapters = adapters;
  }

  public getAllStatuses(): Record<string, GameLaunchState> {
    const out: Record<string, GameLaunchState> = {};
    for (const [gameId, state] of this.statuses.entries()) {
      out[gameId] = state;
    }
    return out;
  }

  public setGameStatus(
    gameId: string,
    status: GameLaunchState,
    message?: string
  ): void {
    this.statuses.set(gameId, status);
    this.adapters.onStatusChanged?.({ gameId, status, message });
  }

  private async executeSpawn(
    exePath: string,
    args: string[],
    cwd: string
  ): Promise<{ pid?: number; child?: ChildProcess }> {
    const spawnFn =
      this.adapters.spawnProcess ??
      ((targetExe: string, targetArgs: string[], targetCwd: string) =>
        new Promise<{ pid?: number; child?: ChildProcess }>(
          (resolve, reject) => {
            const child = spawn(targetExe, targetArgs, {
              cwd: targetCwd,
              detached: true,
              stdio: 'ignore',
              shell: false,
              windowsHide: false,
            });

            child.once('error', (err) => {
              reject(err);
            });

            child.once('spawn', () => {
              child.unref();
              resolve({ pid: child.pid, child });
            });
          }
        ));

    return spawnFn(exePath, args, cwd);
  }

  public async launchGame(game: GameItem): Promise<GameLaunchResult> {
    if (game.isDemoData) {
      return {
        success: false,
        gameId: game.id,
        status: 'launcher-unavailable',
        message:
          'This title is a Demo Mode showcase entry. Disable Demo Mode to launch real installed games.',
      };
    }

    if (!game.isInstalled) {
      this.setGameStatus(
        game.id,
        'not-installed',
        `${game.title} is not currently installed on disk.`
      );
      const diagnostics = createLaunchDiagnostics(
        game,
        new Error(`${game.title} is marked as not installed on disk.`)
      );
      return {
        success: false,
        gameId: game.id,
        status: 'not-installed',
        message: `${game.title} is marked as not installed.`,
        diagnostics,
      };
    }

    this.setGameStatus(game.id, 'launching', `Launching ${game.title}...`);

    try {
      // 1. Steam Protocol Launch
      if (
        game.launchMethod === 'steam-protocol' ||
        (game.platformId === 'steam' && game.externalAppId)
      ) {
        try {
          const uri = validateSteamLaunchUri(game.externalAppId);
          if (!this.adapters.openExternalProtocol) {
            throw new Error('Protocol handler is not configured.');
          }

          await this.adapters.openExternalProtocol(uri);

          const startedAtIso = new Date().toISOString();
          this.setGameStatus(
            game.id,
            'running',
            `Steam launch request accepted (${uri}).`
          );

          if (game.executablePath) {
            this.adapters.onGameLaunchedForTracking?.({
              game,
              executablePath: game.executablePath,
            });
          }

          return {
            success: true,
            gameId: game.id,
            status: 'running',
            message: `Launched ${game.title} via Steam (${uri}).`,
            startedAtIso,
          };
        } catch (steamErr) {
          // If protocol failed but executable path exists on disk, fallback to direct launch
          if (!game.executablePath) {
            throw steamErr;
          }
        }
      }

      // 2. Epic Games Protocol Launch
      if (
        game.launchMethod === 'epic-protocol' ||
        (game.platformId === 'epic' && game.externalAppId)
      ) {
        try {
          const uri = validateEpicLaunchUri(game.externalAppId);
          if (!this.adapters.openExternalProtocol) {
            throw new Error('Protocol handler is not configured.');
          }

          await this.adapters.openExternalProtocol(uri);

          const startedAtIso = new Date().toISOString();
          this.setGameStatus(
            game.id,
            'running',
            `Epic Games Launcher handoff accepted.`
          );

          if (game.executablePath) {
            this.adapters.onGameLaunchedForTracking?.({
              game,
              executablePath: game.executablePath,
            });
          }

          return {
            success: true,
            gameId: game.id,
            status: 'running',
            message: `Launched ${game.title} via Epic Games Launcher.`,
            startedAtIso,
          };
        } catch (epicErr) {
          if (!game.executablePath) {
            throw epicErr;
          }
        }
      }

      // 3. Riot Games Launch (requires RiotClientServices.exe with product flags to avoid anti-cheat crash)
      if (game.platformId === 'riot') {
        const resolver =
          this.adapters.riotClientPathResolver ?? resolveRiotClientServicesPath;
        const riotClientPath = resolver();

        if (riotClientPath) {
          const { product, patchline } = resolveRiotProductFromGame(game);
          const args = [
            `--launch-product=${product}`,
            `--launch-patchline=${patchline}`,
          ];
          const cwd = path.dirname(riotClientPath);

          const { pid } = await this.executeSpawn(riotClientPath, args, cwd);
          const startedAtIso = new Date().toISOString();

          this.setGameStatus(
            game.id,
            'running',
            `Launched ${game.title} via Riot Client Services.`
          );

          if (game.executablePath) {
            this.adapters.onGameLaunchedForTracking?.({
              game,
              executablePath: game.executablePath,
              pid,
            });
          }

          return {
            success: true,
            gameId: game.id,
            status: 'running',
            message: `Launched ${game.title} via Riot Client Services.`,
            pid,
            startedAtIso,
          };
        }
        // If RiotClientServices is not located, fall through to executable launch below
      }

      // 4. EA App Launch (origin2:// protocol or direct executable)
      if (game.platformId === 'ea' && game.externalAppId && this.adapters.openExternalProtocol) {
        try {
          const uri = validateEaLaunchUri(game.externalAppId);
          await this.adapters.openExternalProtocol(uri);

          const startedAtIso = new Date().toISOString();
          this.setGameStatus(
            game.id,
            'running',
            `EA App launch request accepted (${uri}).`
          );

          if (game.executablePath) {
            this.adapters.onGameLaunchedForTracking?.({
              game,
              executablePath: game.executablePath,
            });
          }

          return {
            success: true,
            gameId: game.id,
            status: 'running',
            message: `Launched ${game.title} via EA App protocol.`,
            startedAtIso,
          };
        } catch {
          // If protocol fails, continue to executable launch
        }
      }

      // 5. Ubisoft Connect Protocol Launch
      if (
        game.platformId === 'ubisoft' &&
        game.externalAppId &&
        this.adapters.openExternalProtocol
      ) {
        try {
          const uri = validateUbisoftLaunchUri(game.externalAppId);
          await this.adapters.openExternalProtocol(uri);

          const startedAtIso = new Date().toISOString();
          this.setGameStatus(
            game.id,
            'running',
            `Ubisoft Connect launch accepted (${uri}).`
          );

          if (game.executablePath) {
            this.adapters.onGameLaunchedForTracking?.({
              game,
              executablePath: game.executablePath,
            });
          }

          return {
            success: true,
            gameId: game.id,
            status: 'running',
            message: `Launched ${game.title} via Ubisoft Connect.`,
            startedAtIso,
          };
        } catch {
          // Fall through to executable launch
        }
      }

      // 6. GOG Galaxy Protocol Launch
      if (
        game.platformId === 'gog' &&
        game.externalAppId &&
        this.adapters.openExternalProtocol
      ) {
        try {
          const uri = validateGogLaunchUri(game.externalAppId);
          await this.adapters.openExternalProtocol(uri);

          const startedAtIso = new Date().toISOString();
          this.setGameStatus(
            game.id,
            'running',
            `GOG Galaxy launch accepted (${uri}).`
          );

          if (game.executablePath) {
            this.adapters.onGameLaunchedForTracking?.({
              game,
              executablePath: game.executablePath,
            });
          }

          return {
            success: true,
            gameId: game.id,
            status: 'running',
            message: `Launched ${game.title} via GOG Galaxy.`,
            startedAtIso,
          };
        } catch {
          // Fall through to executable launch
        }
      }

      // 7. Direct Validated Executable Launch (Steam/Epic fallback, EA, Riot, Custom PC)
      if (game.launchMethod === 'executable' || game.executablePath) {
        const { exePath, cwd } = validateExecutableLaunchTarget(
          game.executablePath,
          game.workingDirectory
        );
        const args = parseSafeLaunchArguments(game.launchArgs);

        const { pid, child } = await this.executeSpawn(exePath, args, cwd);
        const startedAtIso = new Date().toISOString();

        this.setGameStatus(
          game.id,
          'running',
          `${game.title} is running${pid ? ` (PID ${pid})` : ''}.`
        );

        this.adapters.onGameLaunchedForTracking?.({
          game,
          executablePath: exePath,
          pid,
        });

        if (child) {
          child.once('exit', () => {
            this.setGameStatus(game.id, 'idle');
          });
        }

        return {
          success: true,
          gameId: game.id,
          status: 'running',
          message: `Launched ${game.title} (${path.basename(exePath)}).`,
          pid,
          startedAtIso,
        };
      }

      this.setGameStatus(
        game.id,
        'launcher-unavailable',
        'No verified launch executable or protocol is available for this title.'
      );
      const diagnostics = createLaunchDiagnostics(
        game,
        new Error('No verified launch executable or protocol is available.')
      );
      return {
        success: false,
        gameId: game.id,
        status: 'launcher-unavailable',
        message:
          'No verified launch executable or protocol is available for this title.',
        diagnostics,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.setGameStatus(game.id, 'failed', errorMessage);
      const diagnostics = createLaunchDiagnostics(game, err);
      return {
        success: false,
        gameId: game.id,
        status: 'failed',
        message: errorMessage,
        diagnostics,
      };
    }
  }
}
