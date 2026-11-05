import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FolderSearch,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { ScanResultSummary } from '../../shared/types/scanner';

interface ScanningFeedbackBannerProps {
  onOpenDiagnostics: () => void;
}

function formatPlatformBreakdown(summary: ScanResultSummary): string {
  if (
    summary.diagnostics?.platformsChecked &&
    summary.diagnostics.platformsChecked.length > 0
  ) {
    const relevant = summary.diagnostics.platformsChecked.filter(
      (p) =>
        p.gamesDiscoveredCount > 0 ||
        p.platformId === 'steam' ||
        p.platformId === 'epic'
    );
    if (relevant.length > 0) {
      return relevant
        .map((p) => {
          const name = p.platformId === 'epic' ? 'Epic' : p.platformName;
          return `${name}: ${p.gamesDiscoveredCount}`;
        })
        .join(', ');
    }
  }

  if (summary.platformReports && summary.platformReports.length > 0) {
    const relevant = summary.platformReports.filter(
      (p) =>
        p.gamesDetectedCount > 0 ||
        p.platformId === 'steam' ||
        p.platformId === 'epic'
    );
    if (relevant.length > 0) {
      return relevant
        .map((p) => {
          const name = p.platformId === 'epic' ? 'Epic' : p.platformName;
          return `${name}: ${p.gamesDetectedCount}`;
        })
        .join(', ');
    }
  }

  return `Steam: ${summary.totalFound}, Epic: 0`;
}

export const ScanningFeedbackBanner: React.FC<ScanningFeedbackBannerProps> = ({
  onOpenDiagnostics,
}) => {
  const isScanning = useAppStore((s) => s.isScanning);
  const scanProgress = useAppStore((s) => s.scanProgress);
  const scanError = useAppStore((s) => s.scanError);
  const showScanBanner = useAppStore((s) => s.showScanBanner);
  const lastScanSummary = useAppStore((s) => s.lastScanSummary);
  const clearScanError = useAppStore((s) => s.clearScanError);
  const dismissScanBanner = useAppStore((s) => s.dismissScanBanner);
  const triggerGameScan = useAppStore((s) => s.startGameScan);
  const cancelGameScan = useAppStore((s) => s.cancelGameScan);

  // 1. Active scanning state
  if (isScanning) {
    const percent = Math.max(5, Math.min(100, scanProgress?.percent ?? 10));
    const message =
      scanProgress?.message || 'Scanning system for installed game libraries...';
    const count = scanProgress?.discoveredCount ?? 0;

    return (
      <div
        data-testid="scanner-active-banner"
        className="rounded-xl bg-ms-card border border-ms-accent/40 shadow-lg p-4 space-y-3 animate-in fade-in duration-200"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-ms-accent/20 border border-ms-accent/40 flex items-center justify-center text-ms-accent">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-ms-text">
                  Scanning for installed games...
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-ms-accent/20 text-ms-accent border border-ms-accent/30">
                  {scanProgress?.phase?.replace('scanning-', '') || 'active'}
                </span>
              </div>
              <p className="text-xs text-ms-muted">
                {message}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-ms-accent tabular-nums">
              {count} detected ({percent}%)
            </span>
            <button
              type="button"
              data-testid="banner-cancel-scan-btn"
              onClick={() => void cancelGameScan()}
              className="h-8 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel scan</span>
            </button>
          </div>
        </div>

        {/* Real-time progress track */}
        <div className="w-full h-2 rounded-full bg-ms-elevated overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-ms-accent to-indigo-400 transition-all duration-300 rounded-full"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  // 2. Scan error alert banner
  if (scanError) {
    return (
      <div
        data-testid="scanner-error-banner"
        className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0 mt-0.5">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-rose-200">
              Game scan failed
            </h3>
            <p className="text-xs text-rose-300/90 leading-relaxed max-w-2xl font-mono">
              {scanError}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="banner-error-diagnostics-btn"
            onClick={onOpenDiagnostics}
            className="h-8 px-3 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <FolderSearch className="w-3.5 h-3.5" />
            <span>View Diagnostics</span>
          </button>
          <button
            type="button"
            data-testid="banner-retry-scan-btn"
            onClick={() => void triggerGameScan()}
            className="h-8 px-3 rounded-lg bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-text text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
          <button
            type="button"
            data-testid="banner-dismiss-error-btn"
            onClick={clearScanError}
            className="w-8 h-8 rounded-lg hover:bg-rose-500/20 flex items-center justify-center text-rose-400 hover:text-rose-200 transition-colors"
            title="Dismiss error"
            aria-label="Dismiss scan error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // 3. Scan completed success banner
  if (showScanBanner && lastScanSummary) {
    const totalFound = lastScanSummary.totalFound;
    const breakdownText = formatPlatformBreakdown(lastScanSummary);

    return (
      <div
        data-testid="scanner-complete-banner"
        className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-emerald-200">
              Scan complete — {totalFound} game{totalFound === 1 ? '' : 's'} found ({breakdownText})
            </h3>
            <p className="text-xs text-emerald-300/80">
              {lastScanSummary.addedOrUpdatedCount} titles synchronized in the local SQLite library.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="banner-view-diagnostics-btn"
            onClick={onOpenDiagnostics}
            className="h-8 px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <FolderSearch className="w-3.5 h-3.5" />
            <span>View Diagnostics</span>
          </button>
          <button
            type="button"
            data-testid="banner-dismiss-complete-btn"
            onClick={dismissScanBanner}
            className="w-8 h-8 rounded-lg hover:bg-emerald-500/20 flex items-center justify-center text-emerald-400 hover:text-emerald-200 transition-colors"
            title="Dismiss notification"
            aria-label="Dismiss completion banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
};
