import React, { useEffect, useState } from 'react';
import {
  Activity,
  Cpu,
  Database,
  HardDrive,
  Sliders,
  Thermometer,
  Zap,
  AlertCircle,
  Clock,
  Gauge,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Trash2,
  CheckCircle2,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { MemoryCleanupRequest } from '../shared/types/memory';

export const PerformancePage: React.FC = () => {
  const performanceMetrics = useAppStore((s) => s.performanceMetrics);
  const metricsHistory = useAppStore((s) => s.metricsHistory);
  const setPerformanceMonitoringActive = useAppStore((s) => s.setPerformanceMonitoringActive);
  const fetchPerformanceMetrics = useAppStore((s) => s.fetchPerformanceMetrics);

  // Memory management store
  const memoryMetrics = useAppStore((s) => s.memoryMetrics);
  const cleanableApps = useAppStore((s) => s.cleanableApps);
  const cleanupHistory = useAppStore((s) => s.cleanupHistory);
  const isCleaningMemory = useAppStore((s) => s.isCleaningMemory);
  const lastCleanupResult = useAppStore((s) => s.lastCleanupResult);
  const fetchMemoryMetrics = useAppStore((s) => s.fetchMemoryMetrics);
  const fetchCleanableApps = useAppStore((s) => s.fetchCleanableApps);
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

  const [intervalChoice, setIntervalChoice] = useState<3000 | 5000 | 10000>(
    (settings.memoryRefreshIntervalMs as 3000 | 5000 | 10000) || 5000
  );

  // Clean memory modal state
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [selectedPids, setSelectedPids] = useState<number[]>([]);
  const [cleanupMode, setCleanupMode] = useState<'standard' | 'advanced'>('standard');
  const [cleanupError, setCleanupError] = useState<string | null>(null);

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
    void fetchCleanableApps();
    void fetchCleanupHistory();

    const intId = setInterval(() => {
      void fetchMemoryMetrics();
    }, intervalChoice);

    return () => {
      clearInterval(intId);
    };
  }, [activeTab, isMemMgmtEnabled, fetchMemoryMetrics, fetchCleanableApps, fetchCleanupHistory, intervalChoice]);

  // Open cleanup modal
  const handleOpenCleanupModal = async () => {
    await fetchCleanableApps();
    setSelectedPids([]);
    setCleanupMode(settings.enableAdvancedMemoryMode ? 'advanced' : 'standard');
    setCleanupError(null);
    setShowCleanupModal(true);
  };

  const handleToggleAppPid = (pid: number) => {
    setSelectedPids((prev) =>
      prev.includes(pid) ? prev.filter((p) => p !== pid) : [...prev, pid]
    );
  };

  const handleExecuteCleanup = async () => {
    try {
      setCleanupError(null);
      const req: MemoryCleanupRequest = {
        mode: cleanupMode,
        closeAppPids: selectedPids.length > 0 ? selectedPids : undefined,
        trimProcessWorkingSets: cleanupMode === 'advanced',
      };
      await performMemoryCleanup(req);
      setShowCleanupModal(false);
      await fetchMemoryMetrics();
      await fetchCleanableApps();
      await fetchCleanupHistory();
    } catch (err) {
      setCleanupError(err instanceof Error ? err.message : String(err));
    }
  };

  const currentCpu = performanceMetrics?.cpuPercent ?? 0;
  const currentRamPercent = performanceMetrics?.ramPercent ?? 0;
  const currentRamUsed = performanceMetrics?.ramUsedMb ?? 0;
  const currentRamTotal = performanceMetrics?.ramTotalMb ?? 0;
  const maSwitchCpu = performanceMetrics?.maSwitchCpuPercent ?? 0;
  const maSwitchRam = performanceMetrics?.maSwitchRamMb ?? 0;
  const perfMode = performanceMetrics?.performanceMode ?? 'standard';

  const isGameRunningNow = inGameMode || performanceMetrics?.isGameRunning;
  const activeGameTitle = performanceMetrics?.activeGameTitle ?? 'Active Game';

  return (
    <div data-testid="page-performance-monitor" className="max-w-6xl mx-auto space-y-8 pb-16 animate-fadeIn select-none">
      {/* Header with Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ms-border/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            {isPerfMonitorInstalled && isPerfMonitorEnabled && (
              <button
                type="button"
                data-testid="tab-telemetry"
                onClick={() => setActiveTab('telemetry')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider transition-all ${
                  activeTab === 'telemetry'
                    ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-sm'
                    : 'bg-ms-card hover:bg-ms-elevated text-ms-muted border border-ms-border'
                }`}
              >
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                <span>System Telemetry</span>
              </button>
            )}

            {isMemMgmtInstalled && isMemMgmtEnabled && (
              <button
                type="button"
                data-testid="tab-memory-mgmt"
                onClick={() => setActiveTab('memory')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider transition-all ${
                  activeTab === 'memory'
                    ? 'bg-violet-500/20 border border-violet-500/40 text-violet-300 shadow-sm'
                    : 'bg-ms-card hover:bg-ms-elevated text-ms-muted border border-ms-border'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                <span>Memory Management</span>
              </button>
            )}
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-ms-text">
            {activeTab === 'memory' ? 'Memory Management & Optimization' : 'Performance & Resources'}
          </h1>
          <p className="text-xs text-ms-muted mt-1">
            {activeTab === 'memory'
              ? 'Safe, lightweight Windows memory optimizer designed for gaming PCs (zero background polling when inactive)'
              : 'Real-time Windows telemetry with zero background impact (polls only while this tab is active)'}
          </p>
        </div>

        {/* Polling Interval Selector */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <span className="text-xs text-ms-muted font-medium flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Refresh:
          </span>
          {([3000, 5000, 10000] as const).map((ms) => (
            <button
              key={ms}
              type="button"
              data-testid={`perf-interval-${ms}`}
              onClick={() => {
                setIntervalChoice(ms);
                if (activeTab === 'telemetry') {
                  void setPerformanceMonitoringActive(true, ms);
                }
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                intervalChoice === ms
                  ? activeTab === 'memory'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-cyan-600 text-white shadow-sm'
                  : 'bg-ms-card hover:bg-ms-elevated text-ms-muted border border-ms-border'
              }`}
            >
              {ms / 1000}s
            </button>
          ))}
        </div>
      </div>

      {/* ========================================================== */}
      {/* TAB 1: SYSTEM TELEMETRY VIEW                               */}
      {/* ========================================================== */}
      {activeTab === 'telemetry' && (
        <>
          {/* Mode Banner */}
          <div className="p-4 rounded-2xl bg-ms-card border border-ms-border/80 flex items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  perfMode === 'low-end'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : perfMode === 'game-aware'
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                    : 'bg-violet-500/15 text-violet-400 border border-violet-500/30'
                }`}
              >
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-ms-text">
                    Current Mode:{' '}
                    <span className="capitalize text-violet-300">
                      {perfMode === 'low-end'
                        ? 'Low-End PC Mode'
                        : perfMode === 'game-aware'
                        ? 'Game-Aware Active'
                        : 'Standard Performance'}
                    </span>
                  </span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                    0% FPS Impact
                  </span>
                </div>
                <p className="text-xs text-ms-muted mt-0.5">
                  {isGameRunningNow
                    ? `Active Game Running: ${activeGameTitle} (background polling throttled)`
                    : 'No games currently active. Normal desktop performance profile active.'}
                </p>
              </div>
            </div>

            <div className="text-right hidden sm:block shrink-0">
              <div className="text-xs text-ms-muted">Live Polling Status</div>
              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 justify-end mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Active
              </div>
            </div>
          </div>

          {/* Primary Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* System CPU */}
            <div className="p-6 rounded-3xl bg-ms-card border border-ms-border space-y-3 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-violet-400" />
                  <span>System CPU</span>
                </span>
                <span className="text-violet-400 font-extrabold">{currentCpu}%</span>
              </div>
              <div className="text-3xl font-extrabold text-ms-text tracking-tight tabular-nums">
                {currentCpu.toFixed(1)}%
              </div>
              <div className="w-full h-2 bg-ms-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-600 to-cyan-400 transition-all duration-300"
                  style={{ width: `${Math.min(100, currentCpu)}%` }}
                />
              </div>
            </div>

            {/* System RAM */}
            <div className="p-6 rounded-3xl bg-ms-card border border-ms-border space-y-3 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-cyan-400" />
                  <span>System RAM</span>
                </span>
                <span className="text-cyan-400 font-extrabold">{currentRamPercent}%</span>
              </div>
              <div className="text-3xl font-extrabold text-ms-text tracking-tight tabular-nums">
                {(currentRamUsed / 1024).toFixed(1)}{' '}
                <span className="text-sm font-normal text-ms-muted">/ {(currentRamTotal / 1024).toFixed(1)} GB</span>
              </div>
              <div className="w-full h-2 bg-ms-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all duration-300"
                  style={{ width: `${Math.min(100, currentRamPercent)}%` }}
                />
              </div>
            </div>

            {/* MaSwitch CPU */}
            <div className="p-6 rounded-3xl bg-ms-card border border-ms-border space-y-3 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>MaSwitch CPU</span>
                </span>
                <span className="text-emerald-400 font-extrabold">{maSwitchCpu}%</span>
              </div>
              <div className="text-3xl font-extrabold text-ms-text tracking-tight tabular-nums">
                {maSwitchCpu.toFixed(2)}%
              </div>
              <div className="text-xs text-ms-muted">Ultra-low background usage</div>
            </div>

            {/* MaSwitch RAM */}
            <div className="p-6 rounded-3xl bg-ms-card border border-ms-border space-y-3 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                <span className="flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-amber-400" />
                  <span>MaSwitch RAM</span>
                </span>
                <span className="text-amber-400 font-extrabold">{maSwitchRam} MB</span>
              </div>
              <div className="text-3xl font-extrabold text-ms-text tracking-tight tabular-nums">
                {maSwitchRam.toFixed(1)}{' '}
                <span className="text-sm font-normal text-ms-muted">MB</span>
              </div>
              <div className="text-xs text-ms-muted">Working set across processes</div>
            </div>
          </div>

          {/* GPU & Temperature Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* GPU Usage Card */}
            <div className="p-6 rounded-3xl bg-ms-card border border-ms-border space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-ms-muted flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-violet-400" />
                  <span>DirectX / GPU Utilization</span>
                </span>
                <span className="text-xs font-semibold text-ms-muted">Hardware Counter</span>
              </div>
              <div className="flex items-baseline gap-3">
                {performanceMetrics?.gpuPercent !== null ? (
                  <span className="text-3xl font-extrabold text-ms-text">
                    {performanceMetrics?.gpuPercent}%
                  </span>
                ) : (
                  <div className="flex items-center gap-2 text-ms-muted">
                    <AlertCircle className="w-4 h-4 text-ms-muted/70" />
                    <span className="text-base font-bold">Unsupported on Current Hardware</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-ms-muted">
                MaSwitch refuses to install intrusive kernel drivers or heavy background polling to fabricate GPU metrics.
              </p>
            </div>

            {/* Temperature Card */}
            <div className="p-6 rounded-3xl bg-ms-card border border-ms-border space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-ms-muted flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-rose-400" />
                  <span>Hardware Temperature</span>
                </span>
                <span className="text-xs font-semibold text-ms-muted">Thermal Sensor</span>
              </div>
              <div className="flex items-baseline gap-3">
                {performanceMetrics?.temperatureCelsius !== null ? (
                  <span className="text-3xl font-extrabold text-ms-text">
                    {performanceMetrics?.temperatureCelsius}°C
                  </span>
                ) : (
                  <div className="flex items-center gap-2 text-ms-muted">
                    <AlertCircle className="w-4 h-4 text-ms-muted/70" />
                    <span className="text-base font-bold">Unsupported on Current Interface</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-ms-muted">
                Thermal monitoring is suppressed to avoid WMI query overhead that can cause micro-stuttering in games.
              </p>
            </div>
          </div>

          {/* Rolling CPU History Chart */}
          <div className="p-6 rounded-3xl bg-ms-card border border-ms-border space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-ms-text flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span>Rolling CPU History</span>
                </h3>
                <p className="text-xs text-ms-muted mt-0.5">
                  Recent CPU activity samples captured in memory during active view
                </p>
              </div>
              <span className="text-xs text-ms-muted font-medium tabular-nums">
                {metricsHistory.length} samples
              </span>
            </div>

            <div className="h-32 flex items-end gap-1.5 pt-4 border-b border-ms-border/60">
              {metricsHistory.map((pt, i) => {
                const h = Math.max(4, Math.min(100, pt.cpuPercent));
                return (
                  <div
                    key={pt.timestamp || i}
                    title={`CPU: ${pt.cpuPercent.toFixed(1)}%`}
                    className="flex-1 bg-gradient-to-t from-violet-600 to-cyan-400 rounded-t-sm transition-all duration-200 hover:brightness-125"
                    style={{ height: `${h}%` }}
                  />
                );
              })}

              {metricsHistory.length === 0 && (
                <div className="w-full text-center text-xs text-ms-muted py-8">
                  Collecting in-memory samples...
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ========================================================== */}
      {/* TAB 2: MEMORY MANAGEMENT VIEW                              */}
      {/* ========================================================== */}
      {activeTab === 'memory' && (
        <div className="space-y-6">
          {/* Feature Gating Check */}
          {(!isMemMgmtInstalled || !isMemMgmtEnabled) ? (
            <div className="p-8 rounded-3xl bg-ms-card border border-ms-border text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-violet-400 flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-ms-text">Memory Management is Disabled</h2>
              <p className="text-xs text-ms-muted max-w-md mx-auto">
                Memory Management is an optional component designed for low-end PCs. You can enable it in Settings or run the MaSwitch installer to manage optional components.
              </p>
              <button
                type="button"
                onClick={() => setActiveSection('settings')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold shadow-sm transition-all"
              >
                <span>Go to Settings</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              {/* Gaming Safety Warning Banner */}
              {isGameRunningNow && (
                <div
                  data-testid="active-game-warning"
                  className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-amber-300">
                        Active Game Detected: {activeGameTitle}
                      </div>
                      <div className="text-[11px] text-amber-400/80 mt-0.5">
                        Disruptive memory cleanup is disabled to protect game process stability, prevent anti-cheat triggers, and avoid FPS drops.
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                    Safety Lock Active
                  </span>
                </div>
              )}

              {/* Memory Metrics Grid (Violet Accents) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Total RAM */}
                <div
                  data-testid="memory-metric-total"
                  className="p-5 rounded-2xl bg-ms-card border border-violet-500/20 space-y-2 shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                    <span className="flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-violet-400" />
                      <span>Total RAM</span>
                    </span>
                  </div>
                  <div className="text-2xl font-black text-ms-text tracking-tight tabular-nums">
                    {memoryMetrics ? (memoryMetrics.totalPhysicalMb / 1024).toFixed(1) : '--'}
                    <span className="text-xs font-normal text-ms-muted ml-1">GB</span>
                  </div>
                  <div className="text-[11px] text-ms-muted">Installed Physical RAM</div>
                </div>

                {/* Available RAM */}
                <div
                  data-testid="memory-metric-available"
                  className="p-5 rounded-2xl bg-ms-card border border-emerald-500/20 space-y-2 shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Available</span>
                    </span>
                    <span className="text-emerald-400 font-extrabold text-[11px]">
                      {memoryMetrics ? (100 - memoryMetrics.utilizationPercent).toFixed(0) : '--'}%
                    </span>
                  </div>
                  <div className="text-2xl font-black text-ms-text tracking-tight tabular-nums">
                    {memoryMetrics ? (memoryMetrics.availablePhysicalMb / 1024).toFixed(1) : '--'}
                    <span className="text-xs font-normal text-ms-muted ml-1">GB</span>
                  </div>
                  <div className="text-[11px] text-ms-muted">Free for games & apps</div>
                </div>

                {/* Used RAM */}
                <div
                  data-testid="memory-metric-used"
                  className="p-5 rounded-2xl bg-ms-card border border-violet-500/20 space-y-2 shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-violet-400" />
                      <span>Used RAM</span>
                    </span>
                    <span className="text-violet-400 font-extrabold text-[11px]">
                      {memoryMetrics ? memoryMetrics.utilizationPercent : '--'}%
                    </span>
                  </div>
                  <div className="text-2xl font-black text-ms-text tracking-tight tabular-nums">
                    {memoryMetrics ? (memoryMetrics.usedPhysicalMb / 1024).toFixed(1) : '--'}
                    <span className="text-xs font-normal text-ms-muted ml-1">GB</span>
                  </div>
                  <div className="text-[11px] text-ms-muted">Allocated by OS & tasks</div>
                </div>

                {/* Memory Load */}
                <div className="p-5 rounded-2xl bg-ms-card border border-violet-500/20 space-y-2 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Utilization</span>
                    </span>
                  </div>
                  <div className="text-2xl font-black text-ms-text tracking-tight tabular-nums">
                    {memoryMetrics ? `${memoryMetrics.utilizationPercent}%` : '--'}
                  </div>
                  <div className="w-full h-1.5 bg-ms-elevated rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full transition-all duration-300 ${
                        (memoryMetrics?.utilizationPercent ?? 0) > 85
                          ? 'bg-rose-500'
                          : (memoryMetrics?.utilizationPercent ?? 0) > 70
                          ? 'bg-amber-400'
                          : 'bg-violet-500'
                      }`}
                      style={{ width: `${Math.min(100, memoryMetrics?.utilizationPercent ?? 0)}%` }}
                    />
                  </div>
                </div>

                {/* MaSwitch RAM */}
                <div
                  data-testid="memory-metric-maswitch"
                  className="p-5 rounded-2xl bg-ms-card border border-violet-500/20 space-y-2 shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ms-muted">
                    <span className="flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-violet-400" />
                      <span>MaSwitch RAM</span>
                    </span>
                  </div>
                  <div className="text-2xl font-black text-ms-text tracking-tight tabular-nums">
                    {memoryMetrics ? memoryMetrics.maSwitchWorkingSetMb.toFixed(1) : '--'}
                    <span className="text-xs font-normal text-ms-muted ml-1">MB</span>
                  </div>
                  <div className="text-[11px] text-ms-muted">App process working set</div>
                </div>
              </div>

              {/* Memory Action Bar */}
              <div className="p-6 rounded-3xl bg-ms-card border border-violet-500/30 flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-sm">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-400" />
                    <h2 className="text-base font-bold text-ms-text">Quick Memory Optimization</h2>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                      Standard & Advanced Modes
                    </span>
                  </div>
                  <p className="text-xs text-ms-muted max-w-xl">
                    Trims background working sets, frees dormant memory caches, and safely releases RAM locked by non-essential desktop applications before launching your games.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    data-testid="btn-clean-memory"
                    disabled={isCleaningMemory || Boolean(isGameRunningNow)}
                    onClick={handleOpenCleanupModal}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all ${
                      isCleaningMemory || isGameRunningNow
                        ? 'bg-ms-elevated text-ms-muted cursor-not-allowed opacity-60'
                        : 'bg-violet-600 hover:bg-violet-500 text-white active:scale-95'
                    }`}
                  >
                    <Sparkles className={`w-4 h-4 ${isCleaningMemory ? 'animate-spin' : ''}`} />
                    <span>{isCleaningMemory ? 'Optimizing Memory...' : 'Clean Memory'}</span>
                  </button>
                </div>
              </div>

              {/* Last Cleanup Banner (if any) */}
              {lastCleanupResult && (
                <div className="p-4 rounded-2xl bg-violet-950/20 border border-violet-500/30 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-violet-200">
                        Last Cleanup: Freed {lastCleanupResult.freedMb.toFixed(1)} MB RAM
                      </div>
                      <div className="text-[11px] text-ms-muted">
                        Before: {(lastCleanupResult.ramBeforeMb / 1024).toFixed(1)} GB → After:{' '}
                        {(lastCleanupResult.ramAfterMb / 1024).toFixed(1)} GB ({lastCleanupResult.message})
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                    Mode: {lastCleanupResult.mode}
                  </span>
                </div>
              )}

              {/* Cleanable Background Apps Table */}
              <div className="p-6 rounded-3xl bg-ms-card border border-ms-border space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-ms-text flex items-center gap-2">
                      <Layers className="w-4 h-4 text-violet-400" />
                      <span>Non-Essential Background Applications</span>
                    </h3>
                    <p className="text-xs text-ms-muted mt-0.5">
                      Candidate desktop apps that consume significant memory (never closed automatically without your approval)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void fetchCleanableApps()}
                    className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Refresh Candidates
                  </button>
                </div>

                {cleanableApps.length === 0 ? (
                  <div className="p-6 text-center text-xs text-ms-muted bg-ms-elevated/20 rounded-2xl">
                    No heavy non-essential background applications currently detected.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-ms-border/60 text-ms-muted uppercase tracking-wider text-[10px]">
                          <th className="pb-2">Application</th>
                          <th className="pb-2">Process</th>
                          <th className="pb-2">PID</th>
                          <th className="pb-2 text-right">RAM Footprint</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ms-border/30">
                        {cleanableApps.map((app) => (
                          <tr key={`${app.pid}-${app.name}`} className="hover:bg-ms-elevated/20">
                            <td className="py-2.5 font-bold text-ms-text">{app.displayName}</td>
                            <td className="py-2.5 font-mono text-[11px] text-ms-muted">{app.name}</td>
                            <td className="py-2.5 font-mono text-[11px] text-ms-muted">{app.pid}</td>
                            <td className="py-2.5 text-right font-extrabold text-violet-300 tabular-nums">
                              {app.workingSetMb.toFixed(1)} MB
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
                      Log of past memory cleanup events and RAM reclamation metrics
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
                    No cleanup operations recorded yet. Use &quot;Clean Memory&quot; to optimize RAM.
                  </div>
                ) : (
                  <div className="overflow-x-auto" data-testid="cleanup-history-table">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-ms-border/60 text-ms-muted uppercase tracking-wider text-[10px]">
                          <th className="pb-2">Time</th>
                          <th className="pb-2">Mode</th>
                          <th className="pb-2">Freed</th>
                          <th className="pb-2">Before → After</th>
                          <th className="pb-2">Details</th>
                          <th className="pb-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ms-border/30">
                        {cleanupHistory.map((item) => (
                          <tr key={item.id} className="hover:bg-ms-elevated/20">
                            <td className="py-2.5 text-ms-muted">
                              {new Date(item.timestampIso).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </td>
                            <td className="py-2.5 capitalize font-semibold text-ms-text">
                              {item.mode}
                            </td>
                            <td className="py-2.5 font-bold text-emerald-400 tabular-nums">
                              +{item.freedMb.toFixed(1)} MB
                            </td>
                            <td className="py-2.5 tabular-nums text-ms-muted">
                              {(item.ramBeforeMb / 1024).toFixed(1)} GB →{' '}
                              {(item.ramAfterMb / 1024).toFixed(1)} GB
                            </td>
                            <td className="py-2.5 text-ms-muted truncate max-w-xs">{item.message}</td>
                            <td className="py-2.5 text-right">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  item.status === 'success'
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                }`}
                              >
                                {item.status}
                              </span>
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

      {/* ========================================================== */}
      {/* CLEAN MEMORY MODAL                                         */}
      {/* ========================================================== */}
      {showCleanupModal && (
        <div
          data-testid="clean-memory-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
        >
          <div className="w-full max-w-lg rounded-3xl bg-ms-card border border-violet-500/40 p-6 space-y-5 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-violet-500/20 text-violet-400 border border-violet-500/30 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ms-text">Clean & Optimize Memory</h3>
                  <p className="text-[11px] text-ms-muted">Review cleanup settings before proceeding</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCleanupModal(false)}
                className="text-xs text-ms-muted hover:text-ms-text"
              >
                ✕
              </button>
            </div>

            {/* Mode Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-ms-muted uppercase tracking-wider">
                Cleanup Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCleanupMode('standard')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    cleanupMode === 'standard'
                      ? 'bg-violet-500/15 border-violet-500 text-violet-200'
                      : 'bg-ms-elevated/40 border-ms-border text-ms-muted hover:bg-ms-elevated'
                  }`}
                >
                  <div className="text-xs font-bold text-ms-text">Standard Mode</div>
                  <div className="text-[10px] text-ms-muted mt-0.5">
                    Close selected apps + trim MaSwitch working set
                  </div>
                </button>

                <button
                  type="button"
                  disabled={!settings.enableAdvancedMemoryMode}
                  onClick={() => setCleanupMode('advanced')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    cleanupMode === 'advanced'
                      ? 'bg-violet-500/15 border-violet-500 text-violet-200'
                      : !settings.enableAdvancedMemoryMode
                      ? 'opacity-40 cursor-not-allowed bg-ms-elevated/20 border-ms-border text-ms-muted'
                      : 'bg-ms-elevated/40 border-ms-border text-ms-muted hover:bg-ms-elevated'
                  }`}
                >
                  <div className="text-xs font-bold text-ms-text flex items-center gap-1.5">
                    <span>Advanced Mode</span>
                    {!settings.enableAdvancedMemoryMode && (
                      <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-ms-border text-ms-muted">
                        Disabled in Settings
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-ms-muted mt-0.5">
                    Trim working sets via Win32 EmptyWorkingSet
                  </div>
                </button>
              </div>
            </div>

            {/* Performance Trade-Off Explanation */}
            <div className="p-3.5 rounded-xl bg-violet-950/20 border border-violet-500/20 text-[11px] text-violet-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-violet-200">
                <ShieldCheck className="w-3.5 h-3.5 text-violet-400" />
                <span>Performance & Safety Notice</span>
              </div>
              <p className="text-violet-300/80 leading-relaxed">
                Trimming memory reduces RAM utilization by paging idle data. Note that more free RAM does not guarantee higher FPS, and trimmed apps may experience minor disk reads when re-focused. System files and games are protected.
              </p>
            </div>

            {/* Cleanable Background Apps Checkbox List */}
            {cleanableApps.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-ms-muted uppercase tracking-wider text-[10px]">
                    Optionally Close Background Apps:
                  </span>
                  <span className="text-ms-muted text-[11px]">
                    {selectedPids.length} selected
                  </span>
                </div>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-ms-border divide-y divide-ms-border/40 bg-ms-elevated/30 p-1">
                  {cleanableApps.map((app) => (
                    <label
                      key={app.pid}
                      data-testid={`cleanable-app-item-${app.pid}`}
                      className="p-2 flex items-center justify-between gap-3 hover:bg-ms-elevated/40 rounded-lg cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedPids.includes(app.pid)}
                          onChange={() => handleToggleAppPid(app.pid)}
                          className="w-4 h-4 accent-violet-600 rounded"
                        />
                        <div>
                          <div className="text-xs font-bold text-ms-text">{app.displayName}</div>
                          <div className="text-[10px] text-ms-muted">{app.name} (PID: {app.pid})</div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-violet-300 tabular-nums">
                        {app.workingSetMb.toFixed(0)} MB
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {cleanupError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {cleanupError}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-2">
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
                <span>{isCleaningMemory ? 'Optimizing...' : 'Confirm & Optimize'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
