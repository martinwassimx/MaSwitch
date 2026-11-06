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
import {
  detectEpicGameFromManifests,
  isEpicGamesLauncherInstalled,
  isFortniteGame,
  type ParsedEpicManifest,
} from '../scanner/epicScanner';
import { resolveGameProcessAliases } from '../tracker/gameProcessAliases';
import { assertAllowedCustomExecutable, assertSafeLaunchArguments } from './executableApproval';
import { listWindowsProcessImageNames } from '../tracker/playtimeTrackerEngine';

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

  assertAllowedCustomExecutable(normalizedExe);

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
  isEpicLauncherInstalled?: () => boolean;
  epicManifestResolver?: (game: GameItem) => ParsedEpicManifest | null;
  processChecker?: (candidateExeNames: string[]) => Promise<boolean>;
  verificationTimeoutMs?: number;
  verificationPollIntervalMs?: number;
  verifyProcessActive?: boolean;
  sleepFn?: (ms: number) => Promise<void>;
}

export function getRequiredPlatformLauncher(game: GameItem): {
  isRequired: boolean;
  launcherName: string;
  protocolPrefix: string;
  advice: string;
} {
  if (isFortniteGame(game.title, game.executablePath) || game.platformId === 'epic') {
    return {
      isRequired: true,
      launcherName: 'Epic Games Launcher',
      protocolPrefix: 'com.epicgames.launcher://apps/',
      advice:
        'Launch via Epic Games Launcher is required to satisfy Epic DRM and anti-cheat (Easy Anti-Cheat / BattlEye).',
    };
  }
  if (game.platformId === 'riot') {
    return {
      isRequired: true,
      launcherName: 'Riot Client',
      protocolPrefix: 'RiotClientServices.exe',
      advice:
        'Launch via RiotClientServices.exe is required to initialize Riot Vanguard anti-cheat.',
    };
  }
  if (game.platformId === 'steam' && game.externalAppId) {
    return {
      isRequired: true,
      launcherName: 'Steam',
      protocolPrefix: 'steam://rungameid/',
      advice:
        'Launch via Steam is recommended to satisfy Steamworks DRM and community overlays.',
    };
  }
  if (game.platformId === 'ea' && game.externalAppId) {
    return {
      isRequired: true,
      launcherName: 'EA App',
      protocolPrefix: 'origin2://game/launch',
      advice:
        'Launch via EA App is required to satisfy EA DRM and entitlement checks.',
    };
  }
  if (game.platformId === 'ubisoft' && game.externalAppId) {
    return {
      isRequired: true,
      launcherName: 'Ubisoft Connect',
      protocolPrefix: 'uplay://launch/',
      advice:
        'Launch via Ubisoft Connect is required to satisfy Ubisoft account entitlement.',
    };
  }
  if (game.platformId === 'gog' && game.externalAppId) {
    return {
      isRequired: false,
      launcherName: 'GOG Galaxy',
      protocolPrefix: 'goggalaxy://openGameView/',
      advice:
        'DRM-free title. Can be launched via GOG Galaxy or direct executable.',
    };
  }
  if (game.platformId === 'rockstar' && game.externalAppId) {
    return {
      isRequired: true,
      launcherName: 'Rockstar Games Launcher',
      protocolPrefix: 'rockstar://run/',
      advice:
        'Launch via Rockstar Games Launcher is required to initialize Social Club DRM.',
    };
  }
  return {
    isRequired: false,
    launcherName: 'None (Direct Executable)',
    protocolPrefix: '',
    advice: 'Standard Windows executable launch.',
  };
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

  private async verifyGameProcessActive(
    _game: GameItem,
    child?: ChildProcess,
    candidateExeNames: string[] = []
  ): Promise<{ active: boolean; error?: string }> {
    // If verification is not configured (e.g. legacy tests without mock processChecker), return active immediately
    if (!this.adapters.processChecker && !this.adapters.verifyProcessActive) {
      return { active: true };
    }

    const timeoutMs = this.adapters.verificationTimeoutMs ?? 10_000;
    const pollIntervalMs = this.adapters.verificationPollIntervalMs ?? 500;
    const sleep =
      this.adapters.sleepFn ??
      ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

    let childExitedEarly = false;
    let childExitCode: number | null = null;
    if (child) {
      child.once('exit', (code) => {
        childExitedEarly = true;
        childExitCode = code;
      });
    }

    const checker =
      this.adapters.processChecker ??
      (async (candidates: string[]) => {
        const list = await listWindowsProcessImageNames();
        const set = new Set(candidates.map((c) => c.toLowerCase()));
        return list.some((p) => set.has(p.imageNameLower));
      });

    const startTime = Date.now();

    while (Date.now() - startTime <= timeoutMs) {
      await sleep(pollIntervalMs);

      if (childExitedEarly && childExitCode !== null && childExitCode !== 0) {
        return {
          active: false,
          error: `Target process exited prematurely with exit code ${childExitCode}. Check game files and launcher requirements.`,
        };
      }

      if (candidateExeNames.length > 0) {
        try {
          const isRunning = await checker(candidateExeNames);
          if (isRunning) {
            return { active: true };
          }
        } catch {
          // Continue polling
        }
      } else if (child && !childExitedEarly) {
        return { active: true };
      }
    }

    if (childExitedEarly) {
      return {
        active: false,
        error:
          'Target process closed immediately without launching the game session. Verify your installation in the official launcher.',
      };
    }

    return {
      active: false,
      error:
        'Launch timed out: The game process was not detected running on the system.',
    };
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
      let child: ChildProcess | undefined;
      let pid: number | undefined;
      let launchSuccessMessage = `Launched ${game.title}.`;
      let protocolLaunched = false;

      const isFortnite = isFortniteGame(game.title, game.executablePath);

      // 0. Dedicated Fortnite / Epic Games Enforcement
      if (isFortnite) {
        const isEpicInstalled = this.adapters.isEpicLauncherInstalled
          ? this.adapters.isEpicLauncherInstalled()
          : isEpicGamesLauncherInstalled();

        if (!isEpicInstalled) {
          const errMessage =
            'Epic Games Launcher is required to launch Fortnite. Please install the official Epic Games Launcher.';
          this.setGameStatus(game.id, 'failed', errMessage);
          const diagnostics: GameLaunchDiagnostics = {
            gameId: game.id,
            gameTitle: game.title,
            platformId: 'epic',
            launchMethod: 'epic-protocol',
            executablePath: game.executablePath,
            executableExists: Boolean(
              game.executablePath && fs.existsSync(game.executablePath)
            ),
            workingDirectory: game.workingDirectory,
            workingDirectoryExists: Boolean(
              game.workingDirectory && fs.existsSync(game.workingDirectory)
            ),
            errorCategory: 'protocol-unavailable',
            technicalDetails:
              'Direct execution of FortniteClient-Win64-Shipping.exe is blocked by Epic DRM/anti-cheat.',
            troubleshootingAdvice:
              'Install or update Epic Games Launcher, sign into your account, and verify the Fortnite installation.',
          };
          return {
            success: false,
            gameId: game.id,
            status: 'failed',
            message: errMessage,
            diagnostics,
          };
        }

        const manifest = this.adapters.epicManifestResolver
          ? this.adapters.epicManifestResolver(game)
          : detectEpicGameFromManifests({
              executablePath: game.executablePath,
              installPath: game.installPath,
              title: game.title,
            });

        const appName = manifest?.appName ?? game.externalAppId ?? 'Fortnite';
        const uri = validateEpicLaunchUri(appName);

        if (!this.adapters.openExternalProtocol) {
          throw new Error('Protocol handler is not configured.');
        }

        await this.adapters.openExternalProtocol(uri);
        launchSuccessMessage = `Handoff to Epic Games Launcher accepted (${uri}).`;
        protocolLaunched = true;
      }

      // 1. Steam Protocol Launch
      else if (
        game.launchMethod === 'steam-protocol' ||
        (game.platformId === 'steam' && game.externalAppId)
      ) {
        try {
          const uri = validateSteamLaunchUri(game.externalAppId);
          if (!this.adapters.openExternalProtocol) {
            throw new Error('Protocol handler is not configured.');
          }

          await this.adapters.openExternalProtocol(uri);
          launchSuccessMessage = `Steam launch request accepted (${uri}).`;
          protocolLaunched = true;
        } catch (steamErr) {
          if (!game.executablePath) {
            throw steamErr;
          }
        }
      }

      // 2. Epic Games Protocol Launch (general non-Fortnite Epic titles)
      else if (
        game.launchMethod === 'epic-protocol' ||
        (game.platformId === 'epic' && game.externalAppId)
      ) {
        try {
          const uri = validateEpicLaunchUri(game.externalAppId);
          if (!this.adapters.openExternalProtocol) {
            throw new Error('Protocol handler is not configured.');
          }

          await this.adapters.openExternalProtocol(uri);
          launchSuccessMessage = `Epic Games Launcher handoff accepted (${uri}).`;
          protocolLaunched = true;
        } catch (epicErr) {
          if (!game.executablePath) {
            throw epicErr;
          }
        }
      }

      // 3. Riot Games Launch (requires RiotClientServices.exe with product flags to avoid anti-cheat crash)
      else if (game.platformId === 'riot') {
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

          const spawned = await this.executeSpawn(riotClientPath, args, cwd);
          pid = spawned.pid;
          child = spawned.child;
          launchSuccessMessage = `Launched ${game.title} via Riot Client Services.`;
        } else {
          const riotErr = new Error(
            `RiotClientServices.exe was not found. ${game.title} requires the official Riot Client to initialize Vanguard anti-cheat.`
          );
          this.setGameStatus(game.id, 'failed', riotErr.message);
          return {
            success: false,
            gameId: game.id,
            status: 'failed',
            message: riotErr.message,
            diagnostics: createLaunchDiagnostics(game, riotErr),
          };
        }
      }

      // 4. EA App Launch (origin2:// protocol)
      else if (
        game.platformId === 'ea' &&
        game.externalAppId &&
        this.adapters.openExternalProtocol
      ) {
        try {
          const uri = validateEaLaunchUri(game.externalAppId);
          await this.adapters.openExternalProtocol(uri);
          launchSuccessMessage = `EA App launch request accepted (${uri}).`;
          protocolLaunched = true;
        } catch {
          // Fall through to executable if protocol fails
        }
      }

      // 5. Ubisoft Connect Protocol Launch
      else if (
        game.platformId === 'ubisoft' &&
        game.externalAppId &&
        this.adapters.openExternalProtocol
      ) {
        try {
          const uri = validateUbisoftLaunchUri(game.externalAppId);
          await this.adapters.openExternalProtocol(uri);
          launchSuccessMessage = `Ubisoft Connect launch accepted (${uri}).`;
          protocolLaunched = true;
        } catch {
          // Fall through
        }
      }

      // 6. GOG Galaxy Protocol Launch
      else if (
        game.platformId === 'gog' &&
        game.externalAppId &&
        this.adapters.openExternalProtocol
      ) {
        try {
          const uri = validateGogLaunchUri(game.externalAppId);
          await this.adapters.openExternalProtocol(uri);
          launchSuccessMessage = `GOG Galaxy launch accepted (${uri}).`;
          protocolLaunched = true;
        } catch {
          // Fall through
        }
      }

      // 7. Rockstar Games Protocol Launch
      else if (
        game.platformId === 'rockstar' &&
        game.externalAppId &&
        this.adapters.openExternalProtocol
      ) {
        try {
          const uri = validateRockstarLaunchUri(game.externalAppId);
          await this.adapters.openExternalProtocol(uri);
          launchSuccessMessage = `Rockstar Games launch accepted (${uri}).`;
          protocolLaunched = true;
        } catch {
          // Fall through
        }
      }

      // 8. Direct Validated Executable Launch (fallback or standalone/custom games)
      if (
        !protocolLaunched &&
        !pid &&
        (game.launchMethod === 'executable' || game.executablePath)
      ) {
        if (isFortnite || game.platformId === 'riot') {
          const barrierErr = new Error(
            `${game.title} cannot be launched directly via binary execution due to launcher DRM/anti-cheat requirements.`
          );
          this.setGameStatus(game.id, 'failed', barrierErr.message);
          return {
            success: false,
            gameId: game.id,
            status: 'failed',
            message: barrierErr.message,
            diagnostics: createLaunchDiagnostics(game, barrierErr),
          };
        }

        const { exePath, cwd } = validateExecutableLaunchTarget(
          game.executablePath,
          game.workingDirectory
        );
        assertSafeLaunchArguments(game.launchArgs);
        const args = parseSafeLaunchArguments(game.launchArgs);

        const spawned = await this.executeSpawn(exePath, args, cwd);
        pid = spawned.pid;
        child = spawned.child;
        launchSuccessMessage = `Launched ${game.title} (${path.basename(exePath)}).`;
      } else if (!protocolLaunched && !pid) {
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
      }

      // Process Verification Pass: Candidate image names for checking
      const aliases = resolveGameProcessAliases(
        game.title,
        game.platformId,
        game.executableName
      );
      const candidateExeNames = Array.from(
        new Set([
          ...(game.executableName
            ? [path.basename(game.executableName).toLowerCase()]
            : []),
          ...aliases.map((a) => a.toLowerCase()),
        ])
      );
      if (isFortnite) {
        candidateExeNames.push(
          'fortniteclient-win64-shipping.exe',
          'fortniteclient-win64-shipping_eac.exe',
          'fortniteclient-win64-shipping_be.exe',
          'fortnitelauncher.exe',
          'fortnitebootstrapper.exe'
        );
      }

      const verification = await this.verifyGameProcessActive(
        game,
        child,
        candidateExeNames
      );

      if (!verification.active) {
        const failureReason =
          verification.error ?? 'Game process failed to start or exited immediately.';
        this.setGameStatus(game.id, 'failed', failureReason);
        const diagnostics = createLaunchDiagnostics(
          game,
          new Error(failureReason)
        );
        return {
          success: false,
          gameId: game.id,
          status: 'failed',
          message: failureReason,
          diagnostics,
        };
      }

      // Process is verified active! Transition to 'running'
      const startedAtIso = new Date().toISOString();
      this.setGameStatus(
        game.id,
        'running',
        `${game.title} is running${pid ? ` (PID ${pid})` : ''}.`
      );

      const resolvedExePath =
        game.executablePath || candidateExeNames[0] || game.title;
      this.adapters.onGameLaunchedForTracking?.({
        game,
        executablePath: resolvedExePath,
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
        message: launchSuccessMessage,
        pid,
        startedAtIso,
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
