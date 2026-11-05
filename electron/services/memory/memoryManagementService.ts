import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import type {
  CleanableAppCandidate,
  MemoryCleanupHistoryEntry,
  MemoryCleanupRequest,
  MemoryCleanupResult,
  SystemMemoryMetrics,
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

export const CANDIDATE_NON_ESSENTIAL_APPS: Record<
  string,
  { displayName: string; category: CleanableAppCandidate['category'] }
> = {
  'discord.exe': { displayName: 'Discord', category: 'chat' },
  'spotify.exe': { displayName: 'Spotify', category: 'utility' },
  'chrome.exe': { displayName: 'Google Chrome', category: 'browser' },
  'msedge.exe': { displayName: 'Microsoft Edge', category: 'browser' },
  'firefox.exe': { displayName: 'Mozilla Firefox', category: 'browser' },
  'brave.exe': { displayName: 'Brave Browser', category: 'browser' },
  'slack.exe': { displayName: 'Slack', category: 'chat' },
  'teams.exe': { displayName: 'Microsoft Teams', category: 'chat' },
  'telegram.exe': { displayName: 'Telegram', category: 'chat' },
  'obs64.exe': { displayName: 'OBS Studio', category: 'utility' },
  'notion.exe': { displayName: 'Notion', category: 'utility' },
};

export interface MemoryServiceAdapters {
  rawMemoryQuery?: () => { totalBytes: number; freeBytes: number };
  maSwitchWorkingSetGetter?: () => number;
  processLister?: () => Promise<Array<{ id: number; name: string; workingSetBytes: number }>>;
  processTerminator?: (pid: number) => Promise<boolean>;
  workingSetTrimmer?: (pids: number[]) => Promise<{ trimmedCount: number }>;
}

export class MemoryManagementService {
  private readonly db: MaSwitchSqliteDatabase;
  private readonly trackerEngine?: PlaytimeTrackerEngine;
  private readonly adapters?: MemoryServiceAdapters;

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

    return {
      totalPhysicalBytes: totalBytes,
      availablePhysicalBytes: availableBytes,
      usedPhysicalBytes: usedBytes,
      utilizationPercent: Number(utilizationPercent.toFixed(1)),
      totalPhysicalMb: Math.round(totalBytes / (1024 * 1024)),
      availablePhysicalMb: Math.round(availableBytes / (1024 * 1024)),
      usedPhysicalMb: Math.round(usedBytes / (1024 * 1024)),
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

  public async getCleanableAppCandidates(): Promise<CleanableAppCandidate[]> {
    let processList: Array<{ id: number; name: string; workingSetBytes: number }> = [];

    if (this.adapters?.processLister) {
      processList = await this.adapters.processLister();
    } else {
      processList = await new Promise((resolve) => {
        // Efficient Win32 process enumeration via PowerShell (.NET Process API)
        const cmd = `[System.Diagnostics.Process]::GetProcesses() | Where-Object { $_.WorkingSet64 -gt 25MB } | Select-Object Id, ProcessName, WorkingSet64 | ConvertTo-Json -Compress`;
        const proc = spawn('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          cmd,
        ]);

        let stdout = '';
        proc.stdout.on('data', (d) => (stdout += d.toString()));
        proc.on('close', () => {
          try {
            const parsed = JSON.parse(stdout.trim());
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            const result = arr
              .filter((p) => p && p.Id && p.ProcessName)
              .map((p) => ({
                id: Number(p.Id),
                name: String(p.ProcessName),
                workingSetBytes: Number(p.WorkingSet64 || 0),
              }));
            resolve(result);
          } catch {
            resolve([]);
          }
        });
        proc.on('error', () => resolve([]));
      });
    }

    const candidates: CleanableAppCandidate[] = [];

    for (const p of processList) {
      const exeName = `${p.name.toLowerCase()}.exe`;
      const baseName = p.name.toLowerCase();

      // Check protection list
      if (PROTECTED_PROCESS_NAMES.has(exeName) || PROTECTED_PROCESS_NAMES.has(baseName)) {
        continue;
      }

      // Check if known non-essential application
      const matched = CANDIDATE_NON_ESSENTIAL_APPS[exeName] || CANDIDATE_NON_ESSENTIAL_APPS[baseName];
      if (matched) {
        candidates.push({
          pid: p.id,
          name: p.name,
          displayName: matched.displayName,
          workingSetBytes: p.workingSetBytes,
          workingSetMb: Math.round(p.workingSetBytes / (1024 * 1024)),
          category: matched.category,
          isSafeToClose: true,
        });
      }
    }

    // Sort descending by working set (highest RAM consumer first)
    return candidates.sort((a, b) => b.workingSetBytes - a.workingSetBytes);
  }

  public async performCleanup(request: MemoryCleanupRequest): Promise<MemoryCleanupResult> {
    const metricsBefore = this.getSystemMemoryMetrics();

    // 1. Gaming Safety Lockout
    if (metricsBefore.isGameRunning) {
      return {
        success: false,
        mode: request.mode,
        status: 'cancelled',
        ramBeforeMb: metricsBefore.usedPhysicalMb,
        ramAfterMb: metricsBefore.usedPhysicalMb,
        freedMb: 0,
        message: `Memory cleanup is disabled while ${metricsBefore.activeGameTitle || 'a game'} is active to protect game stability and prevent frame stuttering.`,
      };
    }

    const closedProcesses: string[] = [];

    // 2. Standard Mode: Gracefully close requested user-selected background apps
    if (request.closeAppPids && request.closeAppPids.length > 0) {
      for (const pid of request.closeAppPids) {
        if (this.adapters?.processTerminator) {
          const ok = await this.adapters.processTerminator(pid);
          if (ok) closedProcesses.push(`PID ${pid}`);
        } else {
          try {
            // Non-elevated graceful close request
            process.kill(pid, 'SIGTERM');
            closedProcesses.push(`PID ${pid}`);
          } catch {
            // Ignore non-critical process close errors
          }
        }
      }
    }

    // 3. Trim MaSwitch internal working set and heap
    try {
      if (typeof global.gc === 'function') {
        global.gc();
      }
    } catch {
      // Ignore GC invocation error
    }

    // Trim process working set on Windows if supported
    if (process.platform === 'win32') {
      try {
        const proc = spawn('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `$code = '[DllImport("kernel32.dll")] public static extern bool SetProcessWorkingSetSize(IntPtr h, IntPtr min, IntPtr max);';
           Add-Type -MemberDefinition $code -Name Win32Mem -Namespace Win32 -ErrorAction SilentlyContinue;
           [Win32.Win32Mem]::SetProcessWorkingSetSize([System.Diagnostics.Process]::GetCurrentProcess().Handle, [IntPtr](-1), [IntPtr](-1)) | Out-Null;`,
        ]);
        await new Promise((r) => proc.on('close', r));
      } catch {
        // Fallback gracefully if powershell fails
      }
    }

    // 4. Advanced Mode: Working set trimming for permitted user processes
    let advancedTrimmedCount = 0;
    if (request.mode === 'advanced' && request.trimProcessWorkingSets) {
      if (this.adapters?.workingSetTrimmer) {
        const res = await this.adapters.workingSetTrimmer([]);
        advancedTrimmedCount = res.trimmedCount;
      } else if (process.platform === 'win32') {
        try {
          const trimScript = `
            $trimCode = @"
            using System;
            using System.Runtime.InteropServices;
            using System.Diagnostics;

            public class SafeMemTrimmer {
                [DllImport("psapi.dll")]
                public static extern bool EmptyWorkingSet(IntPtr hProcess);

                public static int TrimNonSystemProcesses() {
                    int count = 0;
                    foreach (var p in Process.GetProcesses()) {
                        try {
                            if (p.Id > 4 && !p.HasExited && p.SessionId != 0) {
                                string name = p.ProcessName.ToLower();
                                if (name != "system" && name != "csrss" && name != "dwm" && name != "maswitch") {
                                    if (EmptyWorkingSet(p.Handle)) count++;
                                }
                            }
                        } catch {}
                    }
                    return count;
                }
            }
"@
            Add-Type -TypeDefinition $trimCode -ErrorAction SilentlyContinue
            [SafeMemTrimmer]::TrimNonSystemProcesses()
          `;

          const proc = spawn('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            trimScript,
          ]);

          let out = '';
          proc.stdout.on('data', (d) => (out += d.toString()));
          await new Promise((r) => proc.on('close', r));
          advancedTrimmedCount = parseInt(out.trim(), 10) || 0;
        } catch {
          // Graceful fallback
        }
      }
    }

    // Wait a brief tick for OS memory counters to refresh
    if (!this.adapters) {
      await new Promise((r) => setTimeout(r, 200));
    }

    const metricsAfter = this.getSystemMemoryMetrics();
    const rawFreed = metricsBefore.usedPhysicalMb - metricsAfter.usedPhysicalMb;
    const freedMb = Math.max(0, rawFreed);

    let summaryMessage = '';
    if (request.mode === 'advanced') {
      summaryMessage = `Advanced cleanup completed. Trimmed ${advancedTrimmedCount} user processes. Freed ${freedMb} MB RAM.`;
    } else if (closedProcesses.length > 0) {
      summaryMessage = `Standard cleanup completed. Gracefully closed ${closedProcesses.length} background application(s) (${closedProcesses.join(', ')}). Freed ${freedMb} MB RAM.`;
    } else {
      summaryMessage = `Standard memory optimization completed. MaSwitch internal heap & working set optimized. Freed ${freedMb} MB RAM.`;
    }

    const historyEntry: MemoryCleanupHistoryEntry = {
      id: randomUUID(),
      timestampIso: new Date().toISOString(),
      mode: request.mode,
      action: request.mode === 'advanced' ? 'working_set_trim' : closedProcesses.length > 0 ? 'close_apps' : 'self_trim',
      status: 'success',
      ramBeforeMb: metricsBefore.usedPhysicalMb,
      ramAfterMb: metricsAfter.usedPhysicalMb,
      freedMb,
      elevationRequired: false,
      message: summaryMessage,
      targetProcesses: closedProcesses.length > 0 ? closedProcesses : undefined,
    };

    // Update internal state
    this.lastCleanupTimeIso = historyEntry.timestampIso;
    this.lastCleanupBeforeMb = historyEntry.ramBeforeMb;
    this.lastCleanupAfterMb = historyEntry.ramAfterMb;
    this.lastCleanupFreedMb = historyEntry.freedMb;
    this.lastCleanupResult = summaryMessage;

    // Persist to SQLite
    try {
      this.db.recordMemoryCleanup(historyEntry);
    } catch {
      // Safe DB recording
    }

    return {
      success: true,
      mode: request.mode,
      status: 'success',
      ramBeforeMb: metricsBefore.usedPhysicalMb,
      ramAfterMb: metricsAfter.usedPhysicalMb,
      freedMb,
      message: summaryMessage,
      historyEntry,
    };
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
      // Ignore clear error
    }
  }
}
