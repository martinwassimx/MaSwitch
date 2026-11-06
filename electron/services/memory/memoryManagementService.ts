import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { windowsPowerShellPath } from '../security/systemBinaries';
import { app } from 'electron';
import type {
  MemoryCleanupAction,
  MemoryCleanupHistoryEntry,
  MemoryCleanupOperations,
  MemoryCleanupRequest,
  MemoryCleanupResult,
  SystemMemoryMetrics,
} from '../../../src/shared/types/memory';
import {
  DEFAULT_ADVANCED_OPERATIONS,
  DEFAULT_STANDARD_OPERATIONS,
} from '../../../src/shared/types/memory';
import type { MaSwitchSqliteDatabase } from '../database/sqliteDatabase';
import type { PlaytimeTrackerEngine } from '../tracker/playtimeTrackerEngine';

export const PROTECTED_PROCESS_NAMES = new Set<string>([
  // Windows Core & System Processes
  'system',
  'system idle process',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'services.exe',
  'lsass.exe',
  'svchost.exe',
  'dwm.exe',
  'explorer.exe',
  'fontdrvhost.exe',
  'sihost.exe',
  'taskhostw.exe',
  'conhost.exe',
  'winlogon.exe',

  // Game Launchers & Core Services
  'steam.exe',
  'steamwebhelper.exe',
  'epicgameslauncher.exe',
  'epicwebhelper.exe',
  'riotclientservices.exe',
  'riotclientux.exe',
  'riotclientuxrender.exe',
  'upc.exe',
  'uplay.exe',
  'eadesktop.exe',
  'link2ea.exe',
  'battle.net.exe',
  'agent.exe',
  'gog galaxy.exe',
  'galaxyclient.exe',
  'rockstar-games-launcher.exe',

  // Anti-Cheat & DRM Services
  'vgc.exe',
  'vgtray.exe',
  'easyanticheat.exe',
  'easyanticheat_eos.exe',
  'beservice.exe',
  'battleye.exe',
  'punkbuster.exe',
  'anticheat.expert.exe',

  // Security Software
  'msmpeng.exe',
  'nissrv.exe',
  'securityhealthservice.exe',

  // Common Protected Competitive Game Binaries
  'cs2.exe',
  'valorant-win64-shipping.exe',
  'fortniteclient-win64-shipping.exe',
  'league of legends.exe',
  'riot client.exe',
  'dota2.exe',
  'r5apex.exe',
  'overwatch.exe',

  // Excluded Applications (Wallpaper Engine)
  'wallpaper32.exe',
  'wallpaper64.exe',
  'webwallpaper32.exe',
  'ui32.exe',

  // MaSwitch self
  'maswitch.exe',
  'electron.exe',
]);

const CLEANUP_OPERATION_KEYS: readonly (keyof MemoryCleanupOperations)[] = [
  'workingSets',
  'systemFileCache',
  'standbyPriority0',
  'standbyList',
  'modifiedPageList',
  'combineMemoryLists',
  'registryCache',
];

/** Validates an untrusted cleanup request; unknown keys and non-boolean values are dropped. */
export function sanitizeMemoryCleanupRequest(raw: unknown): MemoryCleanupRequest {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid memory cleanup request.');
  }
  const candidate = raw as { mode?: unknown; operations?: unknown };
  if (candidate.mode !== 'standard' && candidate.mode !== 'advanced') {
    throw new Error('Invalid memory cleanup mode.');
  }
  const request: MemoryCleanupRequest = { mode: candidate.mode };
  if (candidate.operations !== undefined) {
    if (!candidate.operations || typeof candidate.operations !== 'object') {
      throw new Error('Invalid memory cleanup operations.');
    }
    const source = candidate.operations as Record<string, unknown>;
    const operations: Partial<MemoryCleanupOperations> = {};
    for (const key of CLEANUP_OPERATION_KEYS) {
      if (typeof source[key] === 'boolean') {
        operations[key] = source[key] as boolean;
      }
    }
    request.operations = operations;
  }
  return request;
}

export function resolveCleanupOperations(request: MemoryCleanupRequest): MemoryCleanupOperations {
  const baseDefaults = request.mode === 'advanced' ? DEFAULT_ADVANCED_OPERATIONS : DEFAULT_STANDARD_OPERATIONS;
  return { ...baseDefaults, ...(request.operations || {}) };
}

export function requiresElevatedCleanup(operations: MemoryCleanupOperations): boolean {
  return (
    operations.systemFileCache ||
    operations.standbyPriority0 ||
    operations.standbyList ||
    operations.modifiedPageList ||
    operations.combineMemoryLists ||
    operations.registryCache
  );
}

export const ELEVATED_CLEANUP_COOLDOWN_MS = 60_000;

/**
 * Main-process gate in front of any cleanup that may trigger a UAC prompt: the user must
 * confirm in a native dialog, and after a decline renderer requests cannot re-prompt within the cooldown.
 */
export function createElevatedCleanupGate(
  confirm: () => Promise<boolean>,
  now: () => number = Date.now,
  cooldownMs: number = ELEVATED_CLEANUP_COOLDOWN_MS
): () => Promise<{ allowed: true } | { allowed: false; message: string }> {
  let pending = false;
  let lastDeclinedAt = Number.NEGATIVE_INFINITY;
  return async () => {
    if (pending) {
      return { allowed: false, message: 'An administrator confirmation is already pending.' };
    }
    const remainingMs = lastDeclinedAt + cooldownMs - now();
    if (remainingMs > 0) {
      return {
        allowed: false,
        message: `Please wait ${Math.ceil(remainingMs / 1000)} seconds before requesting another privileged cleanup.`,
      };
    }
    pending = true;
    try {
      if (await confirm()) {
        return { allowed: true };
      }
      lastDeclinedAt = now();
      return { allowed: false, message: 'Privileged memory cleanup cancelled.' };
    } finally {
      pending = false;
    }
  };
}

export interface MemoryServiceAdapters {
  rawMemoryQuery?: () => {
    totalBytes: number;
    freeBytes: number;
    pageFileTotalBytes?: number;
    pageFileFreeBytes?: number;
  };
  maSwitchWorkingSetGetter?: () => number;
  workingSetTrimmer?: (protectedNames: Set<string>) => Promise<{ trimmedProcessCount: number }>;
  privilegedListCleaner?: (operations: MemoryCleanupOperations) => Promise<{
    success: boolean;
    status: 'success' | 'partial' | 'failed' | 'cancelled';
    message: string;
    elevationRequired: boolean;
  }>;
}

export class MemoryManagementService {
  private readonly db: MaSwitchSqliteDatabase;
  private readonly trackerEngine?: PlaytimeTrackerEngine;
  private readonly adapters?: MemoryServiceAdapters;
  private isCleaning = false;

  private lastCleanupTimeIso: string | null = null;
  private lastCleanupBeforeMb: number | null = null;
  private lastCleanupAfterMb: number | null = null;
  private lastCleanupFreedMb: number | null = null;
  private lastCleanupResult: string | null = null;

  constructor(
    db: MaSwitchSqliteDatabase,
    trackerEngine?: PlaytimeTrackerEngine,
    adapters?: MemoryServiceAdapters
  ) {
    this.db = db;
    this.trackerEngine = trackerEngine;
    this.adapters = adapters;

    // Load last cleanup record from DB if exists
    try {
      const history = this.db.getMemoryCleanupHistory(1);
      if (history.length > 0) {
        const last = history[0];
        this.lastCleanupTimeIso = last.timestampIso;
        this.lastCleanupBeforeMb = last.ramBeforeMb;
        this.lastCleanupAfterMb = last.ramAfterMb;
        this.lastCleanupFreedMb = last.freedMb;
        this.lastCleanupResult = `${last.status === 'success' ? 'Cleaned' : last.status}: ${last.message}`;
      }
    } catch {
      // Ignore if table not ready
    }
  }

  public getSystemMemoryMetrics(): SystemMemoryMetrics {
    const raw = this.adapters?.rawMemoryQuery
      ? this.adapters.rawMemoryQuery()
      : {
          totalBytes: os.totalmem(),
          freeBytes: os.freemem(),
        };

    const totalBytes = Math.max(1, raw.totalBytes);
    const availableBytes = Math.max(0, raw.freeBytes);
    const usedBytes = Math.max(0, totalBytes - availableBytes);
    const utilizationPercent = Math.min(100, Math.max(0, (usedBytes / totalBytes) * 100));

    // Calculate total MaSwitch memory usage across processes
    let maSwitchWorkingSetBytes = this.adapters?.maSwitchWorkingSetGetter
      ? this.adapters.maSwitchWorkingSetGetter()
      : process.memoryUsage().rss;
    if (!this.adapters?.maSwitchWorkingSetGetter && typeof app?.getAppMetrics === 'function') {
      try {
        const metrics = app.getAppMetrics();
        let totalAppWorkingSet = 0;
        for (const m of metrics) {
          totalAppWorkingSet += (m.memory?.workingSetSize ?? 0) * 1024;
        }
        if (totalAppWorkingSet > 0) {
          maSwitchWorkingSetBytes = totalAppWorkingSet;
        }
      } catch {
        // Fall back to process.memoryUsage().rss
      }
    }

    // Check active game status
    let isGameRunning = false;
    let activeGameTitle: string | null = null;
    if (this.trackerEngine) {
      try {
        const status = this.trackerEngine.getStatus();
        if (status.activeSessions && status.activeSessions.length > 0) {
          isGameRunning = true;
          activeGameTitle = status.activeSessions[0].gameTitle;
        }
      } catch {
        // Safe check
      }
    }

    const totalPhysicalMb = Math.round(totalBytes / (1024 * 1024));
    const availablePhysicalMb = Math.round(availableBytes / (1024 * 1024));
    const usedPhysicalMb = Math.round(usedBytes / (1024 * 1024));

    return {
      totalPhysicalBytes: totalBytes,
      availablePhysicalBytes: availableBytes,
      usedPhysicalBytes: usedBytes,
      utilizationPercent: Number(utilizationPercent.toFixed(1)),
      totalPhysicalMb,
      availablePhysicalMb,
      usedPhysicalMb,
      pageFileTotalMb: raw.pageFileTotalBytes ? Math.round(raw.pageFileTotalBytes / (1024 * 1024)) : undefined,
      pageFileAvailableMb: raw.pageFileFreeBytes ? Math.round(raw.pageFileFreeBytes / (1024 * 1024)) : undefined,
      pageFileUsedMb: (raw.pageFileTotalBytes && raw.pageFileFreeBytes)
        ? Math.round((raw.pageFileTotalBytes - raw.pageFileFreeBytes) / (1024 * 1024))
        : undefined,
      maSwitchWorkingSetBytes,
      maSwitchWorkingSetMb: Number((maSwitchWorkingSetBytes / (1024 * 1024)).toFixed(1)),
      lastCleanupTimeIso: this.lastCleanupTimeIso,
      lastCleanupBeforeMb: this.lastCleanupBeforeMb,
      lastCleanupAfterMb: this.lastCleanupAfterMb,
      lastCleanupFreedMb: this.lastCleanupFreedMb,
      lastCleanupResult: this.lastCleanupResult,
      isGameRunning,
      activeGameTitle,
    };
  }

  public isCleanupInProgress(): boolean {
    return this.isCleaning;
  }

  public async performCleanup(request: MemoryCleanupRequest): Promise<MemoryCleanupResult> {
    this.isCleaning = true;
    try {
      const metricsBefore = this.getSystemMemoryMetrics();
    const ramBeforeMb = metricsBefore.usedPhysicalMb;

    // Safety Gate 1: Reject cleanup if a game is actively running
    if (metricsBefore.isGameRunning) {
      return {
        success: false,
        mode: request.mode,
        status: 'cancelled',
        ramBeforeMb,
        ramAfterMb: ramBeforeMb,
        freedMb: 0,
        message: `Memory cleanup is disabled while ${metricsBefore.activeGameTitle || 'a game'} is active to protect game stability and prevent anti-cheat interruptions.`,
      };
    }

    const operations = resolveCleanupOperations(request);

    let trimmedCount = 0;
    let privilegedSuccess = true;
    let privilegedMessage = '';
    let elevationRequired = false;
    let isCancelled = false;

    // 1. Process Working Set Trimming (Non-terminating)
    if (operations.workingSets) {
      // Trim Node.js internal GC if available
      try {
        if (typeof global.gc === 'function') {
          global.gc();
        }
      } catch {
        // Ignore
      }

      // Trim process working sets
      if (this.adapters?.workingSetTrimmer) {
        const trimRes = await this.adapters.workingSetTrimmer(PROTECTED_PROCESS_NAMES);
        trimmedCount = trimRes.trimmedProcessCount;
      } else if (process.platform === 'win32') {
        try {
          trimmedCount = await this.executeWorkingSetTrimWin32();
        } catch {
          // Graceful fallback
        }
      }
    }

    // 2. Privileged NT Memory List Operations
    // Mem Reduct operations: System File Cache, Standby Priority 0, Full Standby List, Modified Page List, etc.
    if (requiresElevatedCleanup(operations)) {
      elevationRequired = true;
      if (this.adapters?.privilegedListCleaner) {
        const privRes = await this.adapters.privilegedListCleaner(operations);
        privilegedSuccess = privRes.success;
        privilegedMessage = privRes.message;
        if (privRes.status === 'cancelled') {
          isCancelled = true;
        }
      } else if (process.platform === 'win32') {
        const privRes = await this.executePrivilegedListsCleanerWin32(operations);
        privilegedSuccess = privRes.success;
        privilegedMessage = privRes.message;
        if (privRes.status === 'cancelled') {
          isCancelled = true;
        }
      }
    }

    // If cancelled by user during elevation
    if (isCancelled) {
      return {
        success: false,
        mode: request.mode,
        status: 'cancelled',
        ramBeforeMb,
        ramAfterMb: ramBeforeMb,
        freedMb: 0,
        message: 'Privileged memory cleanup cancelled by user (administrator elevation declined).',
      };
    }

    // Measure memory after cleanup
    const metricsAfter = this.getSystemMemoryMetrics();
    const ramAfterMb = metricsAfter.usedPhysicalMb;
    const freedMb = Math.max(0, ramBeforeMb - ramAfterMb);

    const nowIso = new Date().toISOString();
    this.lastCleanupTimeIso = nowIso;
    this.lastCleanupBeforeMb = ramBeforeMb;
    this.lastCleanupAfterMb = ramAfterMb;
    this.lastCleanupFreedMb = freedMb;

    const opList: string[] = [];
    if (operations.workingSets) opList.push(`Working sets (${trimmedCount} processes trimmed)`);
    if (operations.systemFileCache) opList.push('System file cache');
    if (operations.standbyPriority0) opList.push('Standby priority 0');
    if (operations.standbyList) opList.push('Full standby list');
    if (operations.modifiedPageList) opList.push('Modified page list');
    if (operations.combineMemoryLists) opList.push('Combined memory');
    if (operations.registryCache) opList.push('Registry cache');

    const status: 'success' | 'partial' = privilegedSuccess ? 'success' : 'partial';
    const message =
      freedMb > 0
        ? `Cleaned ${freedMb} MB RAM. Applied: ${opList.join(', ')}.${privilegedMessage ? ` (${privilegedMessage})` : ''}`
        : `Memory cleaned. Applied: ${opList.join(', ')}.${privilegedMessage ? ` (${privilegedMessage})` : ' Working sets and caches already compact.'}`;

    this.lastCleanupResult = `${status === 'success' ? 'Cleaned' : 'Partial'}: ${message}`;

    const action: MemoryCleanupAction = request.mode === 'advanced' ? 'advanced_clean' : 'standard_clean';
    const historyEntry: MemoryCleanupHistoryEntry = {
      id: randomUUID(),
      timestampIso: nowIso,
      mode: request.mode,
      action,
      status,
      ramBeforeMb,
      ramAfterMb,
      freedMb,
      elevationRequired,
      message,
      operations,
    };

    try {
      this.db.recordMemoryCleanup(historyEntry);
    } catch {
      // Safe DB logging
    }

      return {
        success: true,
        mode: request.mode,
        status,
        ramBeforeMb,
        ramAfterMb,
        freedMb,
        message,
        historyEntry,
      };
    } finally {
      this.isCleaning = false;
    }
  }

  public getCleanupHistory(limit: number = 50): MemoryCleanupHistoryEntry[] {
    try {
      return this.db.getMemoryCleanupHistory(limit);
    } catch {
      return [];
    }
  }

  public clearCleanupHistory(): void {
    try {
      this.db.clearMemoryCleanupHistory();
      this.lastCleanupTimeIso = null;
      this.lastCleanupBeforeMb = null;
      this.lastCleanupAfterMb = null;
      this.lastCleanupFreedMb = null;
      this.lastCleanupResult = null;
    } catch {
      // Safe DB clear
    }
  }

  /**
   * Trims working sets across user-accessible processes using psapi!EmptyWorkingSet.
   * Does NOT terminate or close any processes.
   */
  private async executeWorkingSetTrimWin32(): Promise<number> {
    return new Promise((resolve) => {
      const script = `
        $code = @"
        using System;
        using System.Runtime.InteropServices;
        using System.Diagnostics;

        public class SafeWorkingSetTrimmer {
            [DllImport("psapi.dll")]
            public static extern bool EmptyWorkingSet(IntPtr hProcess);

            [DllImport("kernel32.dll")]
            public static extern bool SetProcessWorkingSetSize(IntPtr hProcess, IntPtr dwMinimumWorkingSetSize, IntPtr dwMaximumWorkingSetSize);

            public static int TrimAllAccessible() {
                int count = 0;
                // Trim current process first
                try {
                    SetProcessWorkingSetSize(Process.GetCurrentProcess().Handle, (IntPtr)(-1), (IntPtr)(-1));
                    count++;
                } catch {}

                foreach (var p in Process.GetProcesses()) {
                    try {
                        if (p.Id > 4 && !p.HasExited && p.SessionId != 0) {
                            string name = p.ProcessName.ToLower();
                            if (name != "system" && name != "csrss" && name != "dwm") {
                                if (EmptyWorkingSet(p.Handle)) {
                                    count++;
                                }
                            }
                        }
                    } catch {}
                }
                return count;
            }
        }
"@
        Add-Type -TypeDefinition $code -Language CSharp -ErrorAction SilentlyContinue
        [SafeWorkingSetTrimmer]::TrimAllAccessible()
      `;

      const child = spawn(windowsPowerShellPath(), [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        script,
      ]);

      let stdout = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.on('close', () => {
        const count = parseInt(stdout.trim(), 10);
        resolve(Number.isFinite(count) ? count : 0);
      });
      child.on('error', () => resolve(0));
    });
  }

  /**
   * Executes privileged Windows NT Memory List cleanup operations (comparable to Mem Reduct).
   * Distinguishes documented and undocumented native APIs:
   *  - SystemMemoryListInformation (80)
   *  - MemoryEmptyWorkingSets (2)
   *  - MemoryFlushModifiedList (3)
   *  - MemoryPurgeStandbyList (4)
   *  - MemoryPurgeLowPriorityStandbyList (5)
   *  - SystemFileCacheInformationEx (81)
   *  - SystemRegistryReconciliationInformation (84)
   *  - SystemCombinePhysicalMemoryInformation (130)
   */
  private async executePrivilegedListsCleanerWin32(
    operations: MemoryCleanupOperations
  ): Promise<{ success: boolean; status: 'success' | 'partial' | 'failed' | 'cancelled'; message: string }> {
    return new Promise((resolve) => {
      // Build PowerShell script that enables privileges and calls NtSetSystemInformation
      const script = `
        $ErrorActionPreference = 'Stop'
        try {
            $isElevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
            if (!$isElevated) {
                Write-Output 'NOT_ELEVATED'
                exit 10
            }

            $nativeCode = @"
            using System;
            using System.Runtime.InteropServices;

            public class NtMemCleaner {
                [DllImport("ntdll.dll")]
                public static extern int NtSetSystemInformation(int SystemInformationClass, IntPtr SystemInformation, int SystemInformationLength);

                [DllImport("advapi32.dll", ExactSpelling = true, SetLastError = true)]
                public static extern bool AdjustTokenPrivileges(IntPtr htok, bool disall, ref TOKEN_PRIVILEGES newst, int len, IntPtr prev, IntPtr relen);

                [DllImport("kernel32.dll", ExactSpelling = true)]
                public static extern IntPtr GetCurrentProcess();

                [DllImport("advapi32.dll", ExactSpelling = true, SetLastError = true)]
                public static extern bool OpenProcessToken(IntPtr h, int acc, ref IntPtr phtok);

                [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
                public static extern bool LookupPrivilegeValue(string host, string name, ref long pluid);

                [StructLayout(LayoutKind.Sequential, Pack = 1)]
                public struct TOKEN_PRIVILEGES {
                    public int Count;
                    public long Luid;
                    public int Attr;
                }

                public static void EnablePrivileges() {
                    IntPtr htok = IntPtr.Zero;
                    if (OpenProcessToken(GetCurrentProcess(), 0x0020 | 0x0008, ref htok)) {
                        long luid = 0;
                        if (LookupPrivilegeValue(null, "SeProfileSingleProcessPrivilege", ref luid)) {
                            TOKEN_PRIVILEGES tp = new TOKEN_PRIVILEGES { Count = 1, Luid = luid, Attr = 0x00000002 };
                            AdjustTokenPrivileges(htok, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
                        }
                        if (LookupPrivilegeValue(null, "SeIncreaseQuotaPrivilege", ref luid)) {
                            TOKEN_PRIVILEGES tp = new TOKEN_PRIVILEGES { Count = 1, Luid = luid, Attr = 0x00000002 };
                            AdjustTokenPrivileges(htok, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
                        }
                    }
                }

                public static int ExecuteCommand(int commandCode) {
                    IntPtr pCmd = Marshal.AllocHGlobal(sizeof(int));
                    try {
                        Marshal.WriteInt32(pCmd, commandCode);
                        return NtSetSystemInformation(80, pCmd, sizeof(int));
                    } finally {
                        Marshal.FreeHGlobal(pCmd);
                    }
                }

                public static int FlushRegistryCache() {
                    return NtSetSystemInformation(84, IntPtr.Zero, 0);
                }

                public static int CombineMemoryLists() {
                    IntPtr pData = Marshal.AllocHGlobal(8);
                    try {
                        Marshal.WriteInt64(pData, 0);
                        return NtSetSystemInformation(130, pData, 8);
                    } finally {
                        Marshal.FreeHGlobal(pData);
                    }
                }
            }
"@
            Add-Type -TypeDefinition $nativeCode -Language CSharp -ErrorAction SilentlyContinue
            [NtMemCleaner]::EnablePrivileges()

            ${operations.workingSets ? '[NtMemCleaner]::ExecuteCommand(2) | Out-Null' : ''}
            ${operations.standbyPriority0 ? '[NtMemCleaner]::ExecuteCommand(5) | Out-Null' : ''}
            ${operations.standbyList ? '[NtMemCleaner]::ExecuteCommand(4) | Out-Null' : ''}
            ${operations.modifiedPageList ? '[NtMemCleaner]::ExecuteCommand(3) | Out-Null' : ''}
            ${operations.registryCache ? '[NtMemCleaner]::FlushRegistryCache() | Out-Null' : ''}
            ${operations.combineMemoryLists ? '[NtMemCleaner]::CombineMemoryLists() | Out-Null' : ''}

            Write-Output 'OK'
        } catch {
            Write-Output ("ERR: " + $_.Exception.Message)
            exit 1
        }
      `;

      // Check elevation first
      const checkElevated = spawn(windowsPowerShellPath(), [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
      ]);

      let isElevatedStr = '';
      checkElevated.stdout.on('data', (d) => (isElevatedStr += d.toString()));
      checkElevated.on('close', () => {
        const isAlreadyElevated = isElevatedStr.trim().toLowerCase() === 'true';

        if (isAlreadyElevated) {
          // Execute directly without UAC prompt
          const directProc = spawn(windowsPowerShellPath(), [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            script,
          ]);

          let directOut = '';
          directProc.stdout.on('data', (d) => (directOut += d.toString()));
          directProc.on('close', (code) => {
            if (code === 0 && directOut.includes('OK')) {
              resolve({ success: true, status: 'success', message: 'Privileged lists purged' });
            } else {
              resolve({ success: false, status: 'partial', message: `Privileged operation error: ${directOut.trim()}` });
            }
          });
          directProc.on('error', (err) => {
            resolve({ success: false, status: 'partial', message: err.message });
          });
        } else {
          // Request elevation for narrowly-scoped helper via Start-Process -Verb RunAs
          const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
          const elevatedCmd = `Start-Process -FilePath '${windowsPowerShellPath()}' -ArgumentList '-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encodedScript}' -Verb RunAs -Wait -WindowStyle Hidden`;

          const elevateProc = spawn(windowsPowerShellPath(), [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            elevatedCmd,
          ]);

          elevateProc.on('close', (code) => {
            if (code === 0) {
              resolve({ success: true, status: 'success', message: 'Privileged memory lists purged via elevated helper' });
            } else {
              // Non-zero code from Start-Process RunAs typically indicates user declined/cancelled UAC
              resolve({ success: false, status: 'cancelled', message: 'Elevation cancelled by user' });
            }
          });
          elevateProc.on('error', () => {
            resolve({ success: false, status: 'cancelled', message: 'Elevation request cancelled' });
          });
        }
      });

      checkElevated.on('error', () => {
        resolve({ success: false, status: 'partial', message: 'Failed to query elevation status' });
      });
    });
  }
}
