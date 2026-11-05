import os from 'node:os';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../src/shared/types/ipc';
import type { PerformanceMetrics, PerformanceMonitoringConfig } from '../../src/shared/types/performance';
import type { PlaytimeTrackerEngine } from './tracker/playtimeTrackerEngine';

export class PerformanceMonitorService {
  private active = false;
  private intervalMs = 3000;
  private timer: NodeJS.Timeout | null = null;
  private prevCpus = os.cpus();
  private prevProcessCpuTime: NodeJS.CpuUsage | null = null;
  private prevSampleTimeMs = Date.now();
  private trackerEngine: PlaytimeTrackerEngine | null = null;
  private getLowEndModeFn: (() => boolean) | null = null;
  private getWindowFn: (() => BrowserWindow | null) | null = null;

  constructor(options?: {
    trackerEngine?: PlaytimeTrackerEngine;
    getLowEndMode?: () => boolean;
    getWindow?: () => BrowserWindow | null;
  }) {
    if (options?.trackerEngine) this.trackerEngine = options.trackerEngine;
    if (options?.getLowEndMode) this.getLowEndModeFn = options.getLowEndMode;
    if (options?.getWindow) this.getWindowFn = options.getWindow;
    this.prevProcessCpuTime = process.cpuUsage();
  }

  public setDependencies(deps: {
    trackerEngine?: PlaytimeTrackerEngine;
    getLowEndMode?: () => boolean;
    getWindow?: () => BrowserWindow | null;
  }): void {
    if (deps.trackerEngine) this.trackerEngine = deps.trackerEngine;
    if (deps.getLowEndMode) this.getLowEndModeFn = deps.getLowEndMode;
    if (deps.getWindow) this.getWindowFn = deps.getWindow;
  }

  public setMonitoringConfig(config: Partial<PerformanceMonitoringConfig>): void {
    if (config.intervalMs && [3000, 5000, 10000].includes(config.intervalMs)) {
      this.intervalMs = config.intervalMs;
    }

    if (config.active !== undefined) {
      if (config.active && !this.active) {
        this.active = true;
        this.startTimer();
      } else if (!config.active && this.active) {
        this.active = false;
        this.stopTimer();
      }
    } else if (this.active) {
      // Restart timer with new interval if changed
      this.startTimer();
    }
  }

  public isMonitoringActive(): boolean {
    return this.active;
  }

  public getCurrentMetrics(): PerformanceMetrics {
    const nowMs = Date.now();
    const timeDeltaMs = Math.max(1, nowMs - this.prevSampleTimeMs);
    this.prevSampleTimeMs = nowMs;

    // 1. System CPU Usage via os.cpus() delta (0 native overhead)
    const currentCpus = os.cpus();
    let totalDiff = 0;
    let idleDiff = 0;

    for (let i = 0; i < currentCpus.length; i++) {
      const prev = this.prevCpus[i];
      const curr = currentCpus[i];
      if (prev && curr) {
        const prevTotal = Object.values(prev.times).reduce((a, b) => a + b, 0);
        const currTotal = Object.values(curr.times).reduce((a, b) => a + b, 0);
        totalDiff += currTotal - prevTotal;
        idleDiff += curr.times.idle - prev.times.idle;
      }
    }
    this.prevCpus = currentCpus;

    const cpuPercent =
      totalDiff > 0
        ? Math.max(0, Math.min(100, Math.round(((totalDiff - idleDiff) / totalDiff) * 1000) / 10))
        : 0;

    // 2. System RAM Usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramTotalMb = Math.round(totalMem / (1024 * 1024));
    const ramUsedMb = Math.round(usedMem / (1024 * 1024));
    const ramPercent = Math.round((ramUsedMb / ramTotalMb) * 1000) / 10;

    // 3. MaSwitch CPU Usage
    let maSwitchCpuPercent = 0;
    if (this.prevProcessCpuTime) {
      const currentUsage = process.cpuUsage(this.prevProcessCpuTime);
      const totalProcessMicroseconds = currentUsage.user + currentUsage.system;
      const numCores = os.cpus().length || 1;
      const processPercent = (totalProcessMicroseconds / (timeDeltaMs * 1000 * numCores)) * 100;
      maSwitchCpuPercent = Math.max(0, Math.min(100, Math.round(processPercent * 10) / 10));
    }
    this.prevProcessCpuTime = process.cpuUsage();

    // 4. MaSwitch Memory Usage
    const memUsage = process.memoryUsage();
    const maSwitchRamMb = Math.round((memUsage.rss / (1024 * 1024)) * 10) / 10;

    // 5. Game Awareness & Mode
    const activeSessions = this.trackerEngine?.getStatus().activeSessions ?? [];
    const isGameRunning = activeSessions.length > 0;
    const activeGameTitle = isGameRunning ? activeSessions[0]?.gameTitle : undefined;
    const isLowEnd = this.getLowEndModeFn ? this.getLowEndModeFn() : false;

    let performanceMode: 'standard' | 'game-aware' | 'low-end' = 'standard';
    if (isLowEnd) {
      performanceMode = 'low-end';
    } else if (isGameRunning) {
      performanceMode = 'game-aware';
    }

    // 6. GPU & Temperature metrics
    // Strictly per specification: Show null ("Unsupported") when unavailable reliably without heavy WMI/kernel polling
    const gpuPercent: number | null = null;
    const temperatureCelsius: number | null = null;

    return {
      timestamp: nowMs,
      cpuPercent,
      ramUsedMb,
      ramTotalMb,
      ramPercent,
      gpuPercent,
      gpuName: undefined,
      maSwitchCpuPercent,
      maSwitchRamMb,
      temperatureCelsius,
      performanceMode,
      isGameRunning,
      activeGameTitle,
    };
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => {
      if (!this.active) {
        this.stopTimer();
        return;
      }

      const metrics = this.getCurrentMetrics();
      const win = this.getWindowFn ? this.getWindowFn() : null;
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.PERFORMANCE_METRICS_UPDATED_EVENT, metrics);
      }
    }, this.intervalMs);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public destroy(): void {
    this.active = false;
    this.stopTimer();
  }
}
