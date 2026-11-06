import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { system32Binary } from '../security/systemBinaries';
import type { PlatformId } from '../../../src/shared/types/platform';
import type {
  PlaytimeSessionRecord,
  PlaytimeSessionSource,
  PlaytimeTrackerStatus,
} from '../../../src/shared/types/statistics';
import type { MaSwitchSqliteDatabase } from '../database/sqliteDatabase';

const execFileAsync = promisify(execFile);

/**
 * Standard third-party gaming launcher client executables that must NOT be counted
 * as gameplay idle time during automatic background scans.
 */
const LAUNCHER_CLIENT_EXECUTABLES = new Set([
  'steam.exe',
  'steamwebhelper.exe',
  'steamservice.exe',
  'epicgameslauncher.exe',
  'epicwebhelper.exe',
  'riotclientservices.exe',
  'riotclientux.exe',
  'riotclientcrashhandler.exe',
  'eadesktop.exe',
  'eabackgroundservice.exe',
  'upc.exe',
  'ubisoftgamelauncher.exe',
  'galaxyclient.exe',
  'galaxyclienthelper.exe',
  'rockstarservice.exe',
]);

/**
 * Standard Windows desktop utilities, wallpaper engines, and background hosts
 * that should never be detected as active games by default.
 */
export const DEFAULT_EXCLUDED_UTILITY_EXECUTABLES = new Set([
  'wallpaper64.exe',
  'wallpaper32.exe',
  'webwallpaper32.exe',
  'ui32.exe',
]);

export interface RunningProcessEntry {
  imageNameLower: string;
  pid: number;
}

/**
 * Queries active Windows process image names and PIDs using `tasklist.exe /FO CSV /NH`.
 * Does NOT collect window titles, command-line arguments, or user activity.
 */
export async function listWindowsProcessImageNames(): Promise<
  RunningProcessEntry[]
> {
  if (process.platform !== 'win32') {
    return [];
  }

  try {
    const { stdout } = await execFileAsync(
      system32Binary('tasklist.exe'),
      ['/FO', 'CSV', '/NH'],
      {
        windowsHide: true,
        timeout: 4000,
        maxBuffer: 4 * 1024 * 1024,
      }
    );

    const results: RunningProcessEntry[] = [];
    const lines = stdout.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('"')) continue;

      // Format: "ImageName.exe","1234","Console","1","12,345 K"
      const parts = trimmed.split('","');
      if (parts.length < 2) continue;

      const rawName = (parts[0] ?? '').replace(/^"/, '').trim();
      const rawPid = (parts[1] ?? '').replace(/"$/, '').trim();
      const pid = Number.parseInt(rawPid, 10);

      if (rawName && Number.isFinite(pid)) {
        results.push({
          imageNameLower: rawName.toLowerCase(),
          pid,
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

interface ActiveTrackedSession {
  sessionId: string;
  gameId: string;
  gameTitle: string;
  platformId: PlatformId;
  executablePath: string;
  executableNameLower: string;
  aliasesLower: string[];
  startedAtIso: string;
  lastTickMs: number;
  accumulatedSeconds: number;
  source: PlaytimeSessionSource;
  missingPollsCount: number;
}

export interface PlaytimeTrackerOptions {
  pollIntervalMs?: number;
  inGamePollIntervalMs?: number;
  lowEndPollIntervalMs?: number;
  gracePolls?: number;
  processProvider?: () => Promise<RunningProcessEntry[]>;
  nowFn?: () => number;
  onSessionUpdated?: (lifecycleChanged?: boolean) => void;
  onGameRunningStateChanged?: (gameId: string, isRunning: boolean) => void;
  onGameModeChanged?: (inGame: boolean, activeGameCount: number) => void;
}

export class PlaytimeTrackerEngine {
  private readonly db: MaSwitchSqliteDatabase;
  private readonly basePollIntervalMs: number;
  private readonly inGamePollIntervalMs: number;
  private readonly lowEndPollIntervalMs: number;
  private readonly gracePolls: number;
  private readonly processProvider: () => Promise<RunningProcessEntry[]>;
  private readonly nowFn: () => number;
  private readonly onSessionUpdated?: (lifecycleChanged?: boolean) => void;
  private readonly onGameRunningStateChanged?: (
    gameId: string,
    isRunning: boolean
  ) => void;
  private readonly onGameModeChanged?: (
    inGame: boolean,
    activeGameCount: number
  ) => void;

  private timer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private enabled = true;
  private paused = false;
  private systemSuspended = false;
  private lowEndMode = false;
  private gameAwareMode = true;
  private excludedFutureExecutables = new Set<string>(
    DEFAULT_EXCLUDED_UTILITY_EXECUTABLES
  );
  private excludedFutureGameIds = new Set<string>();

  private readonly activeSessions = new Map<string, ActiveTrackedSession>();
  private readonly pendingLaunchHints = new Map<
    string,
    { executableNameLower: string; expiresAtMs: number }
  >();

  constructor(
    db: MaSwitchSqliteDatabase,
    options: PlaytimeTrackerOptions = {}
  ) {
    this.db = db;
    this.basePollIntervalMs = options.pollIntervalMs ?? 5000;
    this.inGamePollIntervalMs = options.inGamePollIntervalMs ?? 15000;
    this.lowEndPollIntervalMs = options.lowEndPollIntervalMs ?? 15000;
    this.gracePolls = options.gracePolls ?? 0;
    this.processProvider =
      options.processProvider ?? listWindowsProcessImageNames;
    this.nowFn = options.nowFn ?? (() => Date.now());
    this.onSessionUpdated = options.onSessionUpdated;
    this.onGameRunningStateChanged = options.onGameRunningStateChanged;
    this.onGameModeChanged = options.onGameModeChanged;
  }

  public get pollIntervalMs(): number {
    return this.getCurrentPollIntervalMs();
  }

  public getCurrentPollIntervalMs(): number {
    if (this.gameAwareMode && this.activeSessions.size > 0) {
      return this.inGamePollIntervalMs;
    }
    if (this.lowEndMode) {
      return this.lowEndPollIntervalMs;
    }
    return this.basePollIntervalMs;
  }

  private rescheduleTimer(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.getCurrentPollIntervalMs());
  }

  public setLowEndMode(enabled: boolean): void {
    this.lowEndMode = enabled;
    this.rescheduleTimer();
  }

  public setGameAwareMode(enabled: boolean): void {
    this.gameAwareMode = enabled;
    this.rescheduleTimer();
  }

  public setExcludedApplications(
    rules: Array<{
      executableName: string;
      displayName?: string;
      gameId?: string;
      excludeFuture: boolean;
      excludeHistorical: boolean;
    }>
  ): void {
    this.excludedFutureExecutables = new Set(
      DEFAULT_EXCLUDED_UTILITY_EXECUTABLES
    );
    this.excludedFutureGameIds.clear();

    for (const rule of rules) {
      if (rule.excludeFuture) {
        if (rule.executableName) {
          this.excludedFutureExecutables.add(
            rule.executableName.toLowerCase().trim()
          );
        }
        if (rule.gameId) {
          this.excludedFutureGameIds.add(rule.gameId.trim());
        }
      }
    }

    // Immediately finalize any active sessions that became excluded
    const nowMs = this.nowFn();
    const nowIso = new Date(nowMs).toISOString();

    for (const [gameId, session] of Array.from(this.activeSessions.entries())) {
      const isExcluded =
        this.excludedFutureGameIds.has(gameId) ||
        this.excludedFutureExecutables.has(session.executableNameLower) ||
        session.aliasesLower.some((a) => this.excludedFutureExecutables.has(a));

      if (isExcluded) {
        const totalSec = Math.max(1, Math.round(session.accumulatedSeconds));
        this.db.endPlaytimeSession(
          session.sessionId,
          nowIso,
          totalSec,
          'completed'
        );
        this.activeSessions.delete(gameId);
        this.onGameRunningStateChanged?.(gameId, false);
      }
    }
  }

  public isExecutableExcluded(exeNameLower: string): boolean {
    return (
      DEFAULT_EXCLUDED_UTILITY_EXECUTABLES.has(exeNameLower) ||
      this.excludedFutureExecutables.has(exeNameLower)
    );
  }

  public start(): void {
    // Recover any orphaned active sessions from a previous application crash/restart
    this.db.recoverUnclosedSessionsOnStartup();

    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.getCurrentPollIntervalMs());
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.finalizeAllActiveSessions('completed');
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.finalizeAllActiveSessions('completed');
    }
  }

  public setPaused(paused: boolean): PlaytimeTrackerStatus {
    this.paused = paused;
    const nowMs = this.nowFn();
    for (const session of this.activeSessions.values()) {
      session.lastTickMs = nowMs;
    }
    this.onSessionUpdated?.();
    return this.getStatus();
  }

  public handleSystemSuspend(): void {
    this.systemSuspended = true;
    const nowMs = this.nowFn();
    const nowIso = new Date(nowMs).toISOString();

    for (const session of this.activeSessions.values()) {
      const deltaSec = Math.max(
        0,
        Math.min(
          (this.pollIntervalMs * 3) / 1000,
          (nowMs - session.lastTickMs) / 1000
        )
      );
      session.accumulatedSeconds += deltaSec;
      session.lastTickMs = nowMs;
      this.db.heartbeatPlaytimeSession(
        session.sessionId,
        Math.round(session.accumulatedSeconds),
        nowIso
      );
    }
  }

  public handleSystemResume(): void {
    const nowMs = this.nowFn();
    for (const session of this.activeSessions.values()) {
      // Reset lastTickMs on wake so sleep duration is never counted as gameplay
      session.lastTickMs = nowMs;
    }
    this.systemSuspended = false;
  }

  /**
   * Registers a hint when a game is launched from inside MaSwitch so the tracker
   * attributes the session source as `'maswitch-launch'`.
   */
  public notifyGameLaunchedFromMaSwitch(params: {
    gameId: string;
    executableName: string;
  }): void {
    this.pendingLaunchHints.set(params.gameId, {
      executableNameLower: params.executableName.toLowerCase(),
      expiresAtMs: this.nowFn() + 90_000,
    });
  }

  public getStatus(): PlaytimeTrackerStatus {
    const active: PlaytimeSessionRecord[] = Array.from(
      this.activeSessions.values()
    ).map((s) => ({
      id: s.sessionId,
      gameId: s.gameId,
      gameTitle: s.gameTitle,
      platformId: s.platformId,
      executablePath: s.executablePath,
      startedAtIso: s.startedAtIso,
      endedAtIso: null,
      durationSeconds: Math.round(s.accumulatedSeconds),
      source: s.source,
      status: 'active',
    }));

    return {
      enabled: this.enabled,
      paused: this.paused,
      activeSessions: active,
    };
  }

  public async pollOnce(): Promise<void> {
    if (
      this.isPolling ||
      !this.enabled ||
      this.paused ||
      this.systemSuspended
    ) {
      return;
    }

    this.isPolling = true;
    try {
      const nowMs = this.nowFn();
      const nowIso = new Date(nowMs).toISOString();

      const wasInGame = this.activeSessions.size > 0;

      // Clean expired launch hints
      for (const [gameId, hint] of this.pendingLaunchHints.entries()) {
        if (nowMs > hint.expiresAtMs) {
          this.pendingLaunchHints.delete(gameId);
        }
      }

      const processes = await this.processProvider();
      const runningNames = new Set(processes.map((p) => p.imageNameLower));

      const matchers = this.db.getInstalledExecutableMatchers();
      const matchedByGameId = new Map<
        string,
        (typeof matchers)[number]
      >();

      for (const matcher of matchers) {
        if (this.excludedFutureGameIds.has(matcher.gameId)) {
          continue;
        }
        if (
          matcher.executableNameLower &&
          this.isExecutableExcluded(matcher.executableNameLower)
        ) {
          continue;
        }

        const candidates = [
          matcher.executableNameLower,
          ...(matcher.aliasesLower ?? []),
        ];

        const isRunning = candidates.some((candidate) => {
          if (
            LAUNCHER_CLIENT_EXECUTABLES.has(candidate) &&
            matcher.platformId !== 'custom'
          ) {
            return false;
          }
          if (this.isExecutableExcluded(candidate)) {
            return false;
          }
          return runningNames.has(candidate);
        });

        if (isRunning) {
          matchedByGameId.set(matcher.gameId, matcher);
        }
      }

      let hasChanges = false;
      let lifecycleChanged = false;

      // 1. Update or close existing active sessions
      for (const [gameId, session] of this.activeSessions.entries()) {
        const isStillRunning =
          matchedByGameId.has(gameId) ||
          runningNames.has(session.executableNameLower) ||
          session.aliasesLower.some((a) => runningNames.has(a));

        // Cap maximum single-tick delta to 3× pollIntervalMs to guard against sleep/hibernation clock jumps
        const maxAllowedTickSec = (this.pollIntervalMs * 3) / 1000;
        const rawDeltaSec = Math.max(0, (nowMs - session.lastTickMs) / 1000);
        const safeDeltaSec = Math.min(rawDeltaSec, maxAllowedTickSec);

        if (isStillRunning) {
          session.accumulatedSeconds += safeDeltaSec;
          session.lastTickMs = nowMs;
          session.missingPollsCount = 0;

          this.db.heartbeatPlaytimeSession(
            session.sessionId,
            Math.round(session.accumulatedSeconds),
            nowIso
          );
          hasChanges = true;
        } else {
          session.missingPollsCount += 1;
          // Grace period: allow up to gracePolls missed polls before declaring the session dead
          // to absorb bootstrapper-to-shipping-binary process transitions (e.g., FortniteBootstrapper -> FortniteClient-Win64-Shipping)
          if (session.missingPollsCount <= this.gracePolls) {
            session.lastTickMs = nowMs;
            continue;
          }

          // Process truly exited after grace period
          session.accumulatedSeconds += Math.min(
            safeDeltaSec,
            this.pollIntervalMs / 1000
          );
          const totalSec = Math.max(1, Math.round(session.accumulatedSeconds));

          this.db.endPlaytimeSession(
            session.sessionId,
            nowIso,
            totalSec,
            'completed'
          );
          this.activeSessions.delete(gameId);
          this.onGameRunningStateChanged?.(gameId, false);
          hasChanges = true;
          lifecycleChanged = true;
        }
      }

      // 2. Start new sessions for newly detected game processes (preventing overlaps)
      for (const [gameId, matcher] of matchedByGameId.entries()) {
        if (this.activeSessions.has(gameId)) {
          continue;
        }

        const wasLaunchedFromMaSwitch = this.pendingLaunchHints.has(gameId);
        if (wasLaunchedFromMaSwitch) {
          this.pendingLaunchHints.delete(gameId);
        }

        const sessionId = `sess-${gameId}-${nowMs}-${Math.random().toString(36).slice(2, 7)}`;
        const source: PlaytimeSessionSource = wasLaunchedFromMaSwitch
          ? 'maswitch-launch'
          : 'background-monitor';
        const exePath = matcher.executablePath ?? matcher.executableNameLower;

        this.db.startPlaytimeSession({
          sessionId,
          gameId,
          executablePath: exePath,
          startedAtIso: nowIso,
          source,
        });

        this.activeSessions.set(gameId, {
          sessionId,
          gameId,
          gameTitle: matcher.gameTitle,
          platformId: matcher.platformId,
          executablePath: exePath,
          executableNameLower: matcher.executableNameLower,
          aliasesLower: matcher.aliasesLower ?? [],
          startedAtIso: nowIso,
          lastTickMs: nowMs,
          accumulatedSeconds: 0,
          source,
          missingPollsCount: 0,
        });

        this.onGameRunningStateChanged?.(gameId, true);
        hasChanges = true;
        lifecycleChanged = true;
      }

      const isInGame = this.activeSessions.size > 0;
      if (wasInGame !== isInGame) {
        this.onGameModeChanged?.(isInGame, this.activeSessions.size);
        this.rescheduleTimer();
      }

      if (hasChanges) {
        this.onSessionUpdated?.(lifecycleChanged);
      }
    } finally {
      this.isPolling = false;
    }
  }

  public finalizeAllActiveSessions(
    status: 'completed' | 'terminated-unexpectedly' = 'completed'
  ): void {
    const wasInGame = this.activeSessions.size > 0;
    const nowMs = this.nowFn();
    const nowIso = new Date(nowMs).toISOString();

    for (const [gameId, session] of this.activeSessions.entries()) {
      const maxAllowedTickSec = (this.pollIntervalMs * 3) / 1000;
      const rawDeltaSec = Math.max(0, (nowMs - session.lastTickMs) / 1000);
      const safeDeltaSec = Math.min(rawDeltaSec, maxAllowedTickSec);
      const finalSec = Math.max(
        1,
        Math.round(session.accumulatedSeconds + safeDeltaSec)
      );

      this.db.endPlaytimeSession(
        session.sessionId,
        nowIso,
        finalSec,
        status
      );
      this.onGameRunningStateChanged?.(gameId, false);
    }

    this.activeSessions.clear();
    if (wasInGame) {
      this.onGameModeChanged?.(false, 0);
      this.rescheduleTimer();
    }
  }
}

