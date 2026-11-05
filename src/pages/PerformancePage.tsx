import React, { useState, useEffect } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Clock,
  Sparkles,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ShieldCheck,
  Info,
  Database,
  ArrowRight,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type {
  MemoryCleanupOperations,
  MemoryCleanupRequest,
} from '../shared/types/memory';
import {
  DEFAULT_ADVANCED_OPERATIONS,
  DEFAULT_STANDARD_OPERATIONS,
} from '../shared/types/memory';

export const PerformancePage: React.FC = () => {
  const performanceMetrics = useAppStore((s) => s.performanceMetrics);
  const metricsHistory = useAppStore((s) => s.metricsHistory);
  const setPerformanceMonitoringActive = useAppStore((s) => s.setPerformanceMonitoringActive);
  const fetchPerformanceMetrics = useAppStore((s) => s.fetchPerformanceMetrics);

  // Memory management store
  const memoryMetrics = useAppStore((s) => s.memoryMetrics);
  const cleanupHistory = useAppStore((s) => s.cleanupHistory);
  const isCleaningMemory = useAppStore((s) => s.isCleaningMemory);
  const fetchMemoryMetrics = useAppStore((s) => s.fetchMemoryMetrics);
  const performMemoryCleanup = useAppStore((s) => s.performMemoryCleanup);
  const fetchCleanupHistory = useAppStore((s) => s.fetchCleanupHistory);
  const clearCleanupHistory = useAppStore((s) => s.clearCleanupHistory);

  const settings = useAppStore((s) => s.settings);
  const featuresManifest = useAppStore((s) => s.featuresManifest);
  const inGameMode = useAppStore((s) => s.inGameMode);
  const setActiveSection = useAppStore((s) => s.setActiveSection);

  const isPerfMonitorInstalled = featuresManifest?.features.performanceMonitor?.installed ?? true;
  const isPerfMonitorEnabled = featuresManifest?.features.performanceMonitor?.enabled ?? true;
  const isMemMgmtInstalled = featuresManifest?.features.memoryManagement?.installed ?? true;
  const isMemMgmtEnabled = featuresManifest?.features.memoryManagement?.enabled ?? true;

  // Default active tab based on what's available
  const [activeTab, setActiveTab] = useState<'telemetry' | 'memory'>(() => {
    if (!isPerfMonitorInstalled || !isPerfMonitorEnabled) {
      return 'memory';
    }
    return 'telemetry';
  });

  const [intervalChoice] = useState<3000 | 5000 | 10000>(
    (settings.memoryRefreshIntervalMs as 3000 | 5000 | 10000) || 5000
  );

  // Clean memory mode and operation toggles (Mem Reduct inspired)
  const [cleanupMode, setCleanupMode] = useState<'standard' | 'advanced'>('standard');
  const [selectedOperations, setSelectedOperations] = useState<MemoryCleanupOperations>({
    ...DEFAULT_STANDARD_OPERATIONS,
  });
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleanupFeedback, setCleanupFeedback] = useState<{
    status: 'success' | 'partial' | 'cancelled' | 'error';
    message: string;
  } | null>(null);

  // Sync mode changes with operation defaults
  const handleModeChange = (mode: 'standard' | 'advanced') => {
    setCleanupMode(mode);
    if (mode === 'standard') {
      setSelectedOperations({ ...DEFAULT_STANDARD_OPERATIONS });
    } else {
      setSelectedOperations({ ...DEFAULT_ADVANCED_OPERATIONS });
    }
  };

  const handleToggleOperation = (key: keyof MemoryCleanupOperations) => {
    setSelectedOperations((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Telemetry polling: Only while telemetry tab is active
  useEffect(() => {
    if (activeTab !== 'telemetry' || !isPerfMonitorEnabled) return;

    void fetchPerformanceMetrics();
    void setPerformanceMonitoringActive(true, intervalChoice);

    const intId = setInterval(() => {
      void fetchPerformanceMetrics();
    }, intervalChoice);

    return () => {
      clearInterval(intId);
      void setPerformanceMonitoringActive(false);
    };
  }, [activeTab, isPerfMonitorEnabled, fetchPerformanceMetrics, setPerformanceMonitoringActive, intervalChoice]);

  // Memory polling: Only while memory tab is active
  useEffect(() => {
    if (activeTab !== 'memory' || !isMemMgmtEnabled) return;

    void fetchMemoryMetrics();
    void fetchCleanupHistory();

    const intId = setInterval(() => {
      void fetchMemoryMetrics();
    }, intervalChoice);

    return () => {
      clearInterval(intId);
    };
  }, [activeTab, isMemMgmtEnabled, fetchMemoryMetrics, fetchCleanupHistory, intervalChoice]);

  const handleOpenCleanupModal = () => {
    setCleanupFeedback(null);
    setShowCleanupModal(true);
  };

  const handleExecuteCleanup = async () => {
    try {
      setCleanupFeedback(null);
      const req: MemoryCleanupRequest = {
        mode: cleanupMode,
        operations: selectedOperations,
      };
      const result = await performMemoryCleanup(req);
      setShowCleanupModal(false);
      await fetchMemoryMetrics();
      await fetchCleanupHistory();

      if (result.status === 'cancelled') {
        setCleanupFeedback({
          status: 'cancelled',
          message: result.message,
        });
      } else if (result.success) {
        setCleanupFeedback({
          status: result.status === 'failed' ? 'error' : result.status,
          message: result.message,
        });
      } else {
        setCleanupFeedback({
          status: 'error',
          message: result.message,
        });
      }
    } catch (err) {
      setCleanupFeedback({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const currentCpu = performanceMetrics?.cpuPercent ?? 0;
  const currentRamPercent = performanceMetrics?.ramPercent ?? 0;
  const currentRamUsed = performanceMetrics?.ramUsedMb ?? 0;
  const currentRamTotal = performanceMetrics?.ramTotalMb ?? 0;
  const maSwitchCpu = performanceMetrics?.maSwitchCpuPercent ?? 0;
  const maSwitchRam = performanceMetrics?.maSwitchRamMb ?? 0;

  const isGameRunningNow = inGameMode || performanceMetrics?.isGameRunning || memoryMetrics?.isGameRunning;
  const activeGameTitle = performanceMetrics?.activeGameTitle ?? memoryMetrics?.activeGameTitle ?? 'Active Game';

  return (
    <div data-testid="page-performance-monitor" className="max-w-6xl mx-auto space-y-8 pb-16 animate-fadeIn select-none">
      {/* Page Header with Tab Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-ms-border/60 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-violet-500/10 text-violet-400 border border-violet-500/20">
              Low-End PC Optimizer
            </span>
            {isGameRunningNow && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Active Game: {activeGameTitle}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ms-text mt-1">
            {activeTab === 'memory' ? 'Memory Management' : 'Performance & Resources'}
          </h1>
          <p className="text-xs text-ms-muted mt-1">
            {activeTab === 'memory'
              ? 'Mem Reduct memory cleaning: Working sets, system caches, and standby list reduction.'
              : 'Zero-overhead hardware metrics and lightweight background monitoring.'}
          </p>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-ms-card border border-ms-border">
          {isPerfMonitorInstalled && (
            <button
              type="button"
              data-testid="tab-telemetry"
              onClick={() => setActiveTab('telemetry')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'telemetry'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-ms-muted hover:text-ms-text'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Telemetry</span>
            </button>
          )}

          {isMemMgmtInstalled && (
            <button
              type="button"
              data-testid="tab-memory"
              onClick={() => setActiveTab('memory')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'memory'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-ms-muted hover:text-ms-text'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>Memory Cleaner</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: TELEMETRY & RESOURCES */}
      {activeTab === 'telemetry' && (
        <div className="space-y-6">
          {!isPerfMonitorInstalled ? (
            <div className="p-8 rounded-3xl bg-ms-card border border-ms-border text-center space-y-4">
              <Activity className="w-10 h-10 text-ms-muted mx-auto" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-ms-text">Performance Monitor Not Installed</h3>
                <p className="text-xs text-ms-muted max-w-md mx-auto">
                  The lightweight Performance Monitor component is optional and not included in your current setup.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('settings')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white"
              >
                <span>Manage Optional Components</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : !isPerfMonitorEnabled ? (
            <div className="p-8 rounded-3xl bg-ms-card border border-ms-border text-center space-y-4">
              <Activity className="w-10 h-10 text-ms-muted mx-auto" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-ms-text">Performance Monitor is Disabled</h3>
                <p className="text-xs text-ms-muted max-w-md mx-auto">
                  You disabled this feature to maximize system resources and game FPS.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('settings')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white"
              >
                <span>Enable in Settings</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              {/* Telemetry Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div data-testid="metric-card-cpu" className="p-5 rounded-2xl bg-ms-card border border-ms-border space-y-3 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                    <span className="flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-violet-400" />
                      <span>CPU Utilization</span>
                    </span>
                    <span className="text-ms-text font-mono tabular-nums">{currentCpu.toFixed(1)}%</span>
                  </div>
                  <div className="text-3xl font-black text-ms-text tracking-tight tabular-nums">
                    {currentCpu.toFixed(0)}%
                  </div>
                  <div className="w-full h-1.5 bg-ms-elevated rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        currentCpu > 85 ? 'bg-rose-500' : currentCpu > 70 ? 'bg-amber-400' : 'bg-violet-500'
                      }`}
                      style={{ width: `${Math.min(100, currentCpu)}%` }}
                    />
                  </div>
                </div>

                <div data-testid="metric-card-ram" className="p-5 rounded-2xl bg-ms-card border border-ms-border space-y-3 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                    <span className="flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                      <span>System RAM</span>
                    </span>
                    <span className="text-ms-text font-mono tabular-nums">{currentRamPercent.toFixed(1)}%</span>
                  </div>
                  <div className="text-3xl font-black text-ms-text tracking-tight tabular-nums">
                    {(currentRamUsed / 1024).toFixed(1)}
                    <span className="text-sm font-normal text-ms-muted ml-1">/ {(currentRamTotal / 1024).toFixed(1)} GB</span>
                  </div>
                  <div className="w-full h-1.5 bg-ms-elevated rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        currentRamPercent > 85 ? 'bg-rose-500' : currentRamPercent > 70 ? 'bg-amber-400' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, currentRamPercent)}%` }}
                    />
                  </div>
                </div>

                <div data-testid="metric-card-maswitch-cpu" className="p-5 rounded-2xl bg-ms-card border border-ms-border space-y-3 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>MaSwitch CPU</span>
                    </span>
                  </div>
                  <div className="text-3xl font-black text-ms-text tracking-tight tabular-nums">
                    {maSwitchCpu.toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-ms-muted">Ultra-light background thread</div>
                </div>

                <div data-testid="metric-card-maswitch-ram" className="p-5 rounded-2xl bg-ms-card border border-ms-border space-y-3 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                    <span className="flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-sky-400" />
                      <span>MaSwitch RAM</span>
                    </span>
                  </div>
                  <div className="text-3xl font-black text-ms-text tracking-tight tabular-nums">
                    {maSwitchRam.toFixed(0)}
                    <span className="text-sm font-normal text-ms-muted ml-1">MB</span>
                  </div>
                  <div className="text-[11px] text-ms-muted">Zero FPS interference</div>
                </div>
              </div>

              {/* Sparkline History Visualizer */}
              <div className="p-6 rounded-3xl bg-ms-card border border-ms-border space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold text-ms-text">Activity Sparkline (Last 60s)</h3>
                    <p className="text-xs text-ms-muted">Discrete snapshots taken only when viewer is active</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-semibold">
                    <span className="flex items-center gap-1.5 text-violet-400">
                      <span className="w-2.5 h-2.5 rounded-sm bg-violet-500" /> CPU
                    </span>
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> RAM
                    </span>
                  </div>
                </div>

                <div className="h-28 flex items-end gap-1.5 pt-4 px-2 bg-ms-elevated/20 rounded-2xl border border-ms-border/40">
                  {metricsHistory.length === 0 ? (
                    <div className="w-full text-center text-xs text-ms-muted my-auto">Collecting telemetry samples...</div>
                  ) : (
                    metricsHistory.slice(-24).map((pt, idx) => (
                      <div key={idx} className="flex-1 flex flex-col justify-end items-center gap-1 h-full group relative">
                        <div
                          className="w-full bg-violet-500/70 rounded-t-sm transition-all duration-300 group-hover:bg-violet-400"
                          style={{ height: `${Math.max(4, pt.cpuPercent)}%` }}
                        />
                        <div
                          className="w-full bg-emerald-500/70 rounded-t-sm transition-all duration-300 group-hover:bg-emerald-400"
                          style={{ height: `${Math.max(4, pt.ramPercent)}%` }}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: MEMORY MANAGEMENT (MEM REDUCT INTEGRATION) */}
      {activeTab === 'memory' && (
        <div className="space-y-6">
          {!isMemMgmtInstalled ? (
            <div className="p-8 rounded-3xl bg-ms-card border border-ms-border text-center space-y-4">
              <HardDrive className="w-10 h-10 text-ms-muted mx-auto" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-ms-text">Memory Management Not Installed</h3>
                <p className="text-xs text-ms-muted max-w-md mx-auto">
                  The optional Memory Management component (inspired by Mem Reduct) is not installed in this setup.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('settings')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white"
              >
                <span>Manage Optional Components</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : !isMemMgmtEnabled ? (
            <div className="p-8 rounded-3xl bg-ms-card border border-ms-border text-center space-y-4">
              <HardDrive className="w-10 h-10 text-ms-muted mx-auto" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-ms-text">Memory Management is Disabled</h3>
                <p className="text-xs text-ms-muted max-w-md mx-auto">
                  Enable Memory Management in Settings to activate Mem Reduct-style physical RAM cleaning.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('settings')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white"
              >
                <span>Enable in Settings</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              {/* Active Game Protection Warning Banner */}
              {isGameRunningNow && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-amber-200 text-xs">
                  <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <span className="font-bold">Active Game Protection: </span>
                    Memory cleanup is safely locked while &quot;{activeGameTitle}&quot; is running to preserve game FPS, protect against memory paging stalls, and prevent anti-cheat interruptions.
                  </div>
                </div>
              )}

              {/* Feedback Alert Banner */}
              {cleanupFeedback && (
                <div
                  className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
                    cleanupFeedback.status === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      : cleanupFeedback.status === 'cancelled'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {cleanupFeedback.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : cleanupFeedback.status === 'cancelled' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : (
                      <Info className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span>{cleanupFeedback.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCleanupFeedback(null)}
                    className="text-xs opacity-60 hover:opacity-100"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Live Physical RAM Usage Visualization Bar */}
              <div className="p-6 rounded-3xl bg-ms-card border border-violet-500/20 space-y-4 shadow-sm">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-violet-400" />
                    <span className="font-bold text-ms-text text-sm">Physical Memory Load</span>
                    <span className="text-[10px] text-ms-muted uppercase tracking-wider">
                      (GlobalMemoryStatusEx)
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ms-muted">
                      Used: <strong className="text-ms-text tabular-nums">{memoryMetrics ? (memoryMetrics.usedPhysicalMb / 1024).toFixed(1) : '--'} GB</strong> of{' '}
                      <strong className="text-ms-text tabular-nums">{memoryMetrics ? (memoryMetrics.totalPhysicalMb / 1024).toFixed(1) : '--'} GB</strong>
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-black tabular-nums ${
                        (memoryMetrics?.utilizationPercent ?? 0) >= 85
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : (memoryMetrics?.utilizationPercent ?? 0) >= 70
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {memoryMetrics ? memoryMetrics.utilizationPercent.toFixed(1) : '--'}%
                    </span>
                  </div>
                </div>

                {/* Progress bar gauge */}
                <div className="w-full h-3.5 bg-ms-elevated/60 rounded-full overflow-hidden p-0.5 border border-ms-border/40">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      (memoryMetrics?.utilizationPercent ?? 0) >= 85
                        ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                        : (memoryMetrics?.utilizationPercent ?? 0) >= 70
                        ? 'bg-gradient-to-r from-violet-500 to-amber-500'
                        : 'bg-gradient-to-r from-violet-600 to-emerald-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(1, memoryMetrics?.utilizationPercent ?? 0))}%` }}
                  />
                </div>
              </div>

              {/* Statistics Cards (Accurate Measurements) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Physical Memory Used */}
                <div data-testid="memory-metric-used" className="p-5 rounded-2xl bg-ms-card border border-violet-500/20 space-y-2 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-violet-400" />
                      <span>Physical In Use</span>
                    </span>
                    <span className="text-violet-300 font-extrabold text-[11px] tabular-nums">
                      {memoryMetrics ? `${memoryMetrics.utilizationPercent}%` : '--'}
                    </span>
                  </div>
                  <div className="text-2xl font-black text-ms-text tracking-tight tabular-nums">
                    {memoryMetrics ? (memoryMetrics.usedPhysicalMb / 1024).toFixed(2) : '--'}
                    <span className="text-xs font-normal text-ms-muted ml-1">GB</span>
                  </div>
                  <div className="text-[11px] text-ms-muted">Total: {memoryMetrics ? (memoryMetrics.totalPhysicalMb / 1024).toFixed(1) : '--'} GB</div>
                </div>

                {/* Available Physical Memory */}
                <div data-testid="memory-metric-available" className="p-5 rounded-2xl bg-ms-card border border-emerald-500/20 space-y-2 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Available RAM</span>
                    </span>
                    <span className="text-emerald-400 font-extrabold text-[11px] tabular-nums">
                      {memoryMetrics ? (100 - memoryMetrics.utilizationPercent).toFixed(1) : '--'}%
                    </span>
                  </div>
                  <div className="text-2xl font-black text-ms-text tracking-tight tabular-nums">
                    {memoryMetrics ? (memoryMetrics.availablePhysicalMb / 1024).toFixed(2) : '--'}
                    <span className="text-xs font-normal text-ms-muted ml-1">GB</span>
                  </div>
                  <div className="text-[11px] text-ms-muted">Instant headroom for games</div>
                </div>

                {/* MaSwitch RAM Footprint */}
                <div data-testid="memory-metric-maswitch" className="p-5 rounded-2xl bg-ms-card border border-violet-500/20 space-y-2 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                    <span className="flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-sky-400" />
                      <span>MaSwitch RAM</span>
                    </span>
                  </div>
                  <div className="text-2xl font-black text-ms-text tracking-tight tabular-nums">
                    {memoryMetrics ? memoryMetrics.maSwitchWorkingSetMb.toFixed(1) : '--'}
                    <span className="text-xs font-normal text-ms-muted ml-1">MB</span>
                  </div>
                  <div className="text-[11px] text-ms-muted">Working set footprint</div>
                </div>

                {/* Last Cleanup Reclaimed */}
                <div data-testid="memory-metric-reclaimed" className="p-5 rounded-2xl bg-ms-card border border-violet-500/20 space-y-2 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                      <span>Last Reclaimed</span>
                    </span>
                  </div>
                  <div className="text-2xl font-black text-ms-text tracking-tight tabular-nums">
                    {memoryMetrics?.lastCleanupFreedMb !== null && memoryMetrics?.lastCleanupFreedMb !== undefined
                      ? `${memoryMetrics.lastCleanupFreedMb.toFixed(0)} MB`
                      : '--'}
                  </div>
                  <div className="text-[11px] text-ms-muted truncate">
                    {memoryMetrics?.lastCleanupBeforeMb && memoryMetrics?.lastCleanupAfterMb
                      ? `Before: ${memoryMetrics.lastCleanupBeforeMb} MB → After: ${memoryMetrics.lastCleanupAfterMb} MB`
                      : 'No cleanups run yet'}
                  </div>
                </div>
              </div>

              {/* Memory Cleanup Command Center */}
              <div className="p-6 rounded-3xl bg-ms-card border border-violet-500/30 space-y-6 shadow-sm">
                {/* Header with Mode Toggle and Clean Button */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 border-b border-ms-border/50 pb-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-violet-400" />
                      <h2 className="text-base font-bold text-ms-text">Mem Reduct Memory Cleaning</h2>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                        Zero App Closures
                      </span>
                    </div>
                    <p className="text-xs text-ms-muted max-w-xl">
                      Purges memory lists and working sets using Windows NT memory management APIs without terminating user applications or modifying game files.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {/* Clean Memory Button */}
                    <button
                      type="button"
                      data-testid="btn-clean-memory"
                      disabled={isCleaningMemory || Boolean(isGameRunningNow)}
                      onClick={handleOpenCleanupModal}
                      className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs shadow-md transition-all ${
                        isCleaningMemory || isGameRunningNow
                          ? 'bg-ms-elevated text-ms-muted cursor-not-allowed opacity-60'
                          : 'bg-violet-600 hover:bg-violet-500 text-white active:scale-95'
                      }`}
                    >
                      <Sparkles className={`w-4 h-4 ${isCleaningMemory ? 'animate-spin' : ''}`} />
                      <span>{isCleaningMemory ? 'Cleaning Memory...' : 'Clean Memory'}</span>
                    </button>
                  </div>
                </div>

                {/* Mode Selector */}
                <div className="space-y-3">
                  <div className="text-xs font-bold text-ms-muted uppercase tracking-wider">Cleanup Method Selection:</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Standard Mode Card */}
                    <div
                      data-testid="mode-card-standard"
                      onClick={() => handleModeChange('standard')}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all space-y-1.5 ${
                        cleanupMode === 'standard'
                          ? 'bg-violet-600/10 border-violet-500/50 shadow-sm'
                          : 'bg-ms-elevated/20 border-ms-border/40 hover:bg-ms-elevated/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="cleanupMode"
                            checked={cleanupMode === 'standard'}
                            onChange={() => handleModeChange('standard')}
                            className="accent-violet-600"
                          />
                          <span className="font-bold text-xs text-ms-text">Standard Mode (Conservative)</span>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          Recommended
                        </span>
                      </div>
                      <p className="text-[11px] text-ms-muted pl-5">
                        Trims process working sets, purges priority-0 standby pages, and runs memory combining. Prevents game micro-stutters and protects disk read caches.
                      </p>
                    </div>

                    {/* Advanced Mode Card */}
                    <div
                      data-testid="mode-card-advanced"
                      onClick={() => handleModeChange('advanced')}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all space-y-1.5 ${
                        cleanupMode === 'advanced'
                          ? 'bg-violet-600/10 border-violet-500/50 shadow-sm'
                          : 'bg-ms-elevated/20 border-ms-border/40 hover:bg-ms-elevated/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="cleanupMode"
                            checked={cleanupMode === 'advanced'}
                            onChange={() => handleModeChange('advanced')}
                            className="accent-violet-600"
                          />
                          <span className="font-bold text-xs text-ms-text">Advanced Mode (Granular Lists)</span>
                        </div>
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          Granular Control
                        </span>
                      </div>
                      <p className="text-[11px] text-ms-muted pl-5">
                        Select supported Windows NT memory list operations individually. Allows purging full standby and modified page lists with explicit safety warnings.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Advanced Operations Settings Grid */}
                {cleanupMode === 'advanced' && (
                  <div className="p-4 rounded-2xl bg-ms-elevated/30 border border-ms-border/60 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Advanced Memory Operations Warning</span>
                    </div>
                    <p className="text-[11px] text-amber-200/80 leading-relaxed">
                      Purging the entire Standby List or flushing the Modified Page List flushes system disk caches back to storage. While this maximizes immediate free RAM numbers, it can temporarily reduce disk read performance and cause brief micro-stutters in open applications while file pages are re-read from SSD/HDD.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-ms-border/30">
                      {/* Working Sets */}
                      <label className="flex items-center gap-2 p-2 rounded-xl hover:bg-ms-elevated/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedOperations.workingSets}
                          onChange={() => handleToggleOperation('workingSets')}
                          className="accent-violet-600 rounded"
                        />
                        <div className="text-xs">
                          <div className="font-bold text-ms-text">Process Working Sets</div>
                          <div className="text-[10px] text-ms-muted">EmptyWorkingSet across user processes</div>
                        </div>
                      </label>

                      {/* System File Cache */}
                      <label className="flex items-center gap-2 p-2 rounded-xl hover:bg-ms-elevated/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedOperations.systemFileCache}
                          onChange={() => handleToggleOperation('systemFileCache')}
                          className="accent-violet-600 rounded"
                        />
                        <div className="text-xs">
                          <div className="font-bold text-ms-text">System File Cache</div>
                          <div className="text-[10px] text-ms-muted">SystemFileCacheInformationEx (Elevated)</div>
                        </div>
                      </label>

                      {/* Standby Priority 0 */}
                      <label className="flex items-center gap-2 p-2 rounded-xl hover:bg-ms-elevated/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedOperations.standbyPriority0}
                          onChange={() => handleToggleOperation('standbyPriority0')}
                          className="accent-violet-600 rounded"
                        />
                        <div className="text-xs">
                          <div className="font-bold text-ms-text">Standby List (Priority 0)</div>
                          <div className="text-[10px] text-ms-muted">MemoryPurgeLowPriorityStandbyList (Safe)</div>
                        </div>
                      </label>

                      {/* Standby List (All) */}
                      <label className="flex items-center gap-2 p-2 rounded-xl hover:bg-ms-elevated/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedOperations.standbyList}
                          onChange={() => handleToggleOperation('standbyList')}
                          className="accent-violet-600 rounded"
                        />
                        <div className="text-xs">
                          <div className="font-bold text-rose-300 flex items-center gap-1">
                            <span>Standby List (All Priorities) *</span>
                            <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-rose-500/20 text-rose-300">Stutter Risk</span>
                          </div>
                          <div className="text-[10px] text-ms-muted">MemoryPurgeStandbyList (Flushes all cached files)</div>
                        </div>
                      </label>

                      {/* Modified Page List */}
                      <label className="flex items-center gap-2 p-2 rounded-xl hover:bg-ms-elevated/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedOperations.modifiedPageList}
                          onChange={() => handleToggleOperation('modifiedPageList')}
                          className="accent-violet-600 rounded"
                        />
                        <div className="text-xs">
                          <div className="font-bold text-rose-300 flex items-center gap-1">
                            <span>Modified Page List *</span>
                            <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-rose-500/20 text-rose-300">Disk I/O</span>
                          </div>
                          <div className="text-[10px] text-ms-muted">MemoryFlushModifiedList (Writes dirty pages to disk)</div>
                        </div>
                      </label>

                      {/* Combine Memory Lists */}
                      <label className="flex items-center gap-2 p-2 rounded-xl hover:bg-ms-elevated/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedOperations.combineMemoryLists}
                          onChange={() => handleToggleOperation('combineMemoryLists')}
                          className="accent-violet-600 rounded"
                        />
                        <div className="text-xs">
                          <div className="font-bold text-ms-text">Combine Memory Lists</div>
                          <div className="text-[10px] text-ms-muted">SystemCombinePhysicalMemoryInformation (Win 10+)</div>
                        </div>
                      </label>

                      {/* Registry Cache */}
                      <label className="flex items-center gap-2 p-2 rounded-xl hover:bg-ms-elevated/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedOperations.registryCache}
                          onChange={() => handleToggleOperation('registryCache')}
                          className="accent-violet-600 rounded"
                        />
                        <div className="text-xs">
                          <div className="font-bold text-ms-text">Registry Cache</div>
                          <div className="text-[10px] text-ms-muted">SystemRegistryReconciliationInformation (Win 8.1+)</div>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Cleanup History Section */}
              <div className="p-6 rounded-3xl bg-ms-card border border-ms-border space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-ms-text flex items-center gap-2">
                      <Clock className="w-4 h-4 text-violet-400" />
                      <span>Cleanup History</span>
                    </h3>
                    <p className="text-xs text-ms-muted mt-0.5">
                      Verified record of past memory cleanups and measured RAM reclamation
                    </p>
                  </div>
                  {cleanupHistory.length > 0 && (
                    <button
                      type="button"
                      data-testid="btn-clear-history"
                      onClick={() => void clearCleanupHistory()}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Clear History</span>
                    </button>
                  )}
                </div>

                {cleanupHistory.length === 0 ? (
                  <div className="p-6 text-center text-xs text-ms-muted bg-ms-elevated/20 rounded-2xl">
                    No cleanup operations recorded yet. Click &quot;Clean Memory&quot; to optimize RAM.
                  </div>
                ) : (
                  <div className="overflow-x-auto" data-testid="cleanup-history-table">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-ms-border/60 text-ms-muted uppercase tracking-wider text-[10px]">
                          <th className="pb-2">Time</th>
                          <th className="pb-2">Mode</th>
                          <th className="pb-2">Before RAM</th>
                          <th className="pb-2">After RAM</th>
                          <th className="pb-2 text-right">Reclaimed</th>
                          <th className="pb-2 pl-4">Status & Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ms-border/30">
                        {cleanupHistory.map((entry) => (
                          <tr key={entry.id} className="hover:bg-ms-elevated/20">
                            <td className="py-2.5 font-mono text-[11px] text-ms-muted">
                              {new Date(entry.timestampIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </td>
                            <td className="py-2.5">
                              <span
                                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                                  entry.mode === 'advanced'
                                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                    : 'bg-violet-500/10 text-violet-300 border-violet-500/20'
                                }`}
                              >
                                {entry.mode}
                              </span>
                            </td>
                            <td className="py-2.5 font-mono text-ms-muted tabular-nums">
                              {(entry.ramBeforeMb / 1024).toFixed(2)} GB
                            </td>
                            <td className="py-2.5 font-mono text-ms-muted tabular-nums">
                              {(entry.ramAfterMb / 1024).toFixed(2)} GB
                            </td>
                            <td className="py-2.5 text-right font-extrabold text-emerald-400 tabular-nums">
                              {entry.freedMb > 0 ? `+${entry.freedMb} MB` : '0 MB'}
                            </td>
                            <td className="py-2.5 pl-4 text-ms-muted text-[11px] max-w-xs truncate" title={entry.message}>
                              {entry.message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Confirmation & Execution Modal */}
      {showCleanupModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-ms-card border border-violet-500/40 p-6 space-y-5 shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between border-b border-ms-border/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-ms-text">Confirm Memory Cleanup</h3>
                  <p className="text-[11px] text-ms-muted">Mem Reduct memory list purge</p>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                Mode: {cleanupMode}
              </span>
            </div>

            {/* Current RAM status before cleaning */}
            <div className="p-4 rounded-2xl bg-ms-elevated/40 border border-ms-border/40 flex items-center justify-between text-xs">
              <div>
                <span className="text-ms-muted">Current Physical RAM In Use:</span>
                <div className="text-lg font-black text-ms-text tabular-nums mt-0.5">
                  {memoryMetrics ? (memoryMetrics.usedPhysicalMb / 1024).toFixed(2) : '--'} GB{' '}
                  <span className="text-xs font-normal text-ms-muted">({memoryMetrics ? memoryMetrics.utilizationPercent : '--'}%)</span>
                </div>
              </div>
              <div>
                <span className="text-ms-muted">Available Headroom:</span>
                <div className="text-lg font-black text-emerald-400 tabular-nums mt-0.5">
                  {memoryMetrics ? (memoryMetrics.availablePhysicalMb / 1024).toFixed(2) : '--'} GB
                </div>
              </div>
            </div>

            {/* Selected Operations List */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-ms-muted uppercase tracking-wider">
                Operations to be applied:
              </div>
              <div className="p-3 rounded-2xl bg-ms-elevated/20 border border-ms-border/40 space-y-1.5 text-xs text-ms-text">
                {selectedOperations.workingSets && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Process Working Sets (Trims process heap and working set)</span>
                  </div>
                )}
                {selectedOperations.systemFileCache && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>System File Cache (Trims kernel file cache working set)</span>
                  </div>
                )}
                {selectedOperations.standbyPriority0 && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Low-Priority Standby List (Safely purges priority-0 pages)</span>
                  </div>
                )}
                {selectedOperations.standbyList && (
                  <div className="flex items-center gap-2 text-rose-300">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Full Standby List * (Flushes all cached files; brief micro-stutter possible)</span>
                  </div>
                )}
                {selectedOperations.modifiedPageList && (
                  <div className="flex items-center gap-2 text-rose-300">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Modified Page List * (Flushes dirty pages to disk)</span>
                  </div>
                )}
                {selectedOperations.combineMemoryLists && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Combine Physical Memory Lists (Page deduplication)</span>
                  </div>
                )}
                {selectedOperations.registryCache && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Registry Cache (Reconciles registry buffers)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Administrator elevation notice */}
            {(selectedOperations.systemFileCache ||
              selectedOperations.standbyPriority0 ||
              selectedOperations.standbyList ||
              selectedOperations.modifiedPageList ||
              selectedOperations.combineMemoryLists ||
              selectedOperations.registryCache) && (
              <div className="p-3 rounded-xl bg-violet-950/20 border border-violet-500/30 text-violet-300 text-xs flex items-center gap-2">
                <Info className="w-4 h-4 text-violet-400 shrink-0" />
                <span>
                  Privileged memory list operations may trigger a standard Windows UAC administrator elevation prompt for a transient helper process.
                </span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-2 border-t border-ms-border/40">
              <button
                type="button"
                onClick={() => setShowCleanupModal(false)}
                className="px-4 py-2 text-xs font-semibold text-ms-muted hover:text-ms-text bg-ms-card border border-ms-border rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="btn-confirm-cleanup"
                disabled={isCleaningMemory}
                onClick={() => void handleExecuteCleanup()}
                className="px-5 py-2 text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isCleaningMemory ? 'animate-spin' : ''}`} />
                <span>{isCleaningMemory ? 'Cleaning Memory...' : 'Confirm & Clean'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
