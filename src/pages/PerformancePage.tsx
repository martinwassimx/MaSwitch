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
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export const PerformancePage: React.FC = () => {
  const performanceMetrics = useAppStore((s) => s.performanceMetrics);
  const metricsHistory = useAppStore((s) => s.metricsHistory);
  const setPerformanceMonitoringActive = useAppStore((s) => s.setPerformanceMonitoringActive);
  const fetchPerformanceMetrics = useAppStore((s) => s.fetchPerformanceMetrics);

  const [intervalChoice, setIntervalChoice] = useState<3000 | 5000 | 10000>(3000);

  // Poll only while the Performance page is mounted / visible!
  useEffect(() => {
    void fetchPerformanceMetrics();
    void setPerformanceMonitoringActive(true, intervalChoice);

    const intId = setInterval(() => {
      void fetchPerformanceMetrics();
    }, intervalChoice);

    return () => {
      clearInterval(intId);
      // Immediately stop monitoring when page unmounts!
      void setPerformanceMonitoringActive(false);
    };
  }, [fetchPerformanceMetrics, setPerformanceMonitoringActive, intervalChoice]);

  const handleIntervalChange = (val: 3000 | 5000 | 10000) => {
    setIntervalChoice(val);
    void setPerformanceMonitoringActive(true, val);
  };

  const currentCpu = performanceMetrics?.cpuPercent ?? 0;
  const currentRamPercent = performanceMetrics?.ramPercent ?? 0;
  const currentRamUsed = performanceMetrics?.ramUsedMb ?? 0;
  const currentRamTotal = performanceMetrics?.ramTotalMb ?? 0;
  const maSwitchCpu = performanceMetrics?.maSwitchCpuPercent ?? 0;
  const maSwitchRam = performanceMetrics?.maSwitchRamMb ?? 0;
  const perfMode = performanceMetrics?.performanceMode ?? 'standard';

  return (
    <div data-testid="page-performance-monitor" className="max-w-6xl mx-auto space-y-8 pb-16 animate-fadeIn select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ms-border/60 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-semibold uppercase tracking-wider mb-2">
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            <span>Lightweight System Monitor</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ms-text">
            Performance & Resources
          </h1>
          <p className="text-xs text-ms-muted mt-1">
            Real-time Windows telemetry with zero background impact (polls only while this tab is active)
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
              onClick={() => handleIntervalChange(ms)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                intervalChoice === ms
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-ms-card hover:bg-ms-elevated text-ms-muted border border-ms-border'
              }`}
            >
              {ms / 1000}s
            </button>
          ))}
        </div>
      </div>

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
              {performanceMetrics?.isGameRunning
                ? `Active Game Running: ${performanceMetrics.activeGameTitle ?? 'Detected Game'} (background polling throttled)`
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

      {/* GPU & Temperature Metrics (Per Requirement: show Unsupported when unavailable reliably) */}
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

      {/* Rolling CPU History Chart (In-Memory only, max 30 samples) */}
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
    </div>
  );
};
