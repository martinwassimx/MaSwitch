import React, { useMemo, useState } from 'react';
import {
  X,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  FolderSearch,
  HardDrive,
  Clock,
  Layers,
  Cpu,
  RefreshCw,
  Server,
  FolderCode,
} from 'lucide-react';
import type { ScanResultSummary } from '../../shared/types/scanner';
import {
  generateDiagnosticReportText,
  generateSystemDiagnosticReportText,
} from '../../shared/utils/diagnosticReport';
import { PlatformBadge } from '../common/PlatformBadge';
import { useAppStore } from '../../store/useAppStore';

interface ScanDiagnosticsModalProps {
  summary: ScanResultSummary | null;
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'overview' | 'platforms' | 'games' | 'system' | 'raw';

export const ScanDiagnosticsModal: React.FC<ScanDiagnosticsModalProps> = ({
  summary,
  isOpen,
  onClose,
}) => {
  const realGames = useAppStore((s) => s.realGames);
  const runtimeInfo = useAppStore((s) => s.runtimeInfo);
  const platformReports = useAppStore((s) => s.platformReports);
  const settings = useAppStore((s) => s.settings);
  const scanError = useAppStore((s) => s.scanError);
  const isScanning = useAppStore((s) => s.isScanning);
  const startGameScan = useAppStore((s) => s.startGameScan);

  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>(
    summary ? 'overview' : 'system'
  );

  const isBridgeAvailable = typeof window !== 'undefined' && !!window.maswitch;
  const bridgeKeys = useMemo(
    () => (isBridgeAvailable ? Object.keys(window.maswitch ?? {}) : []),
    [isBridgeAvailable]
  );

  if (!isOpen) {
    return null;
  }

  const reportText = summary ? generateDiagnosticReportText(summary) : '';
  const systemReportText = generateSystemDiagnosticReportText({
    isBridgeAvailable,
    bridgeKeys,
    dbConnected: true,
    dbGamesCount: realGames.length,
    scanError,
    runtimeInfo,
    platformReports,
    customScanFolders: settings.customScanFolders,
  });

  const durationSec = summary
    ? summary.diagnostics?.durationMs
      ? (summary.diagnostics.durationMs / 1000).toFixed(2)
      : (
          (Date.parse(summary.finishedAtIso) -
            Date.parse(summary.startedAtIso)) /
          1000
        ).toFixed(2)
    : '0.00';

  const handleCopy = async () => {
    const textToCopy =
      activeTab === 'system' || !summary ? systemReportText : reportText;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const platforms = summary?.diagnostics?.platformsChecked ?? [];
  const allDiscovered = platforms.flatMap((p) =>
    p.detectedGames.map((g) => ({
      ...g,
      platformId: p.platformId,
      platformName: p.platformName,
    }))
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="diagnostics-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-ms-card border border-ms-border rounded-2xl shadow-2xl flex flex-col overflow-hidden text-ms-text">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ms-border/80 bg-ms-elevated/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ms-accent/15 border border-ms-accent/30 flex items-center justify-center text-ms-accent">
              <FolderSearch className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="diagnostics-modal-title"
                className="text-lg font-bold text-ms-text"
              >
                {summary
                  ? 'Scan Diagnostics Report'
                  : 'System & Scanner Diagnostics'}
              </h2>
              <p className="text-xs text-ms-muted">
                {summary
                  ? `${summary.status.toUpperCase()} in ${durationSec}s · ${summary.totalFound} detected · ${summary.addedOrUpdatedCount} saved to SQLite database`
                  : `Real-time IPC bridge & database diagnostics · ${realGames.length} titles in SQLite`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="copy-diagnostic-report-btn"
              onClick={() => void handleCopy()}
              className="h-9 px-3.5 rounded-lg bg-ms-accent hover:bg-ms-accentHover text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-sm"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Copied to clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>
                    {activeTab === 'system' || !summary
                      ? 'Copy system diagnostics'
                      : 'Copy scan report'}
                  </span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-lg hover:bg-ms-elevated border border-transparent hover:border-ms-border flex items-center justify-center text-ms-muted hover:text-ms-text transition-colors"
              aria-label="Close diagnostics dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-ms-border bg-ms-card text-xs font-medium">
          {summary && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-2 border-b-2 transition-colors ${
                  activeTab === 'overview'
                    ? 'border-ms-accent text-ms-accent font-semibold'
                    : 'border-transparent text-ms-muted hover:text-ms-text'
                }`}
              >
                Overview & Stats
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('platforms')}
                className={`px-3 py-2 border-b-2 transition-colors ${
                  activeTab === 'platforms'
                    ? 'border-ms-accent text-ms-accent font-semibold'
                    : 'border-transparent text-ms-muted hover:text-ms-text'
                }`}
              >
                Platforms Checked ({platforms.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('games')}
                className={`px-3 py-2 border-b-2 transition-colors ${
                  activeTab === 'games'
                    ? 'border-ms-accent text-ms-accent font-semibold'
                    : 'border-transparent text-ms-muted hover:text-ms-text'
                }`}
              >
                Discovered Games ({allDiscovered.length})
              </button>
            </>
          )}
          <button
            type="button"
            data-testid="tab-system-status"
            onClick={() => setActiveTab('system')}
            className={`px-3 py-2 border-b-2 transition-colors ${
              activeTab === 'system'
                ? 'border-ms-accent text-ms-accent font-semibold'
                : 'border-transparent text-ms-muted hover:text-ms-text'
            }`}
          >
            System & IPC Status
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('raw')}
            className={`px-3 py-2 border-b-2 transition-colors ${
              activeTab === 'raw'
                ? 'border-ms-accent text-ms-accent font-semibold'
                : 'border-transparent text-ms-muted hover:text-ms-text'
            }`}
          >
            Raw Diagnostic Text
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* TAB 1: OVERVIEW (Available when summary exists) */}
          {activeTab === 'overview' && summary && (
            <div className="space-y-6">
              {/* Stat Metric Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-ms-elevated border border-ms-border space-y-1">
                  <div className="flex items-center justify-between text-ms-muted text-xs">
                    <span>Total Detected</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-ms-text tabular-nums">
                    {summary.totalFound}
                  </div>
                  <div className="text-[11px] text-ms-muted">Verified PC games</div>
                </div>

                <div className="p-4 rounded-xl bg-ms-elevated border border-ms-border space-y-1">
                  <div className="flex items-center justify-between text-ms-muted text-xs">
                    <span>SQLite Saved</span>
                    <HardDrive className="w-3.5 h-3.5 text-ms-accent" />
                  </div>
                  <div className="text-2xl font-bold text-ms-text tabular-nums">
                    {summary.addedOrUpdatedCount}
                  </div>
                  <div className="text-[11px] text-ms-muted">
                    Persisted in local db
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-ms-elevated border border-ms-border space-y-1">
                  <div className="flex items-center justify-between text-ms-muted text-xs">
                    <span>Scan Duration</span>
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <div className="text-2xl font-bold text-ms-text tabular-nums">
                    {durationSec}s
                  </div>
                  <div className="text-[11px] text-ms-muted">
                    End-to-end execution
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-ms-elevated border border-ms-border space-y-1">
                  <div className="flex items-center justify-between text-ms-muted text-xs">
                    <span>Duplicates Filtered</span>
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold text-ms-text tabular-nums">
                    {summary.duplicatesSkipped}
                  </div>
                  <div className="text-[11px] text-ms-muted">
                    Merged across paths
                  </div>
                </div>
              </div>

              {/* Status Banner */}
              {summary.totalFound > 0 ? (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-emerald-200">
                      Game detection completed successfully
                    </p>
                    <p className="text-emerald-300/80">
                      Discovered {summary.totalFound} local games across Steam,
                      Epic Games, Riot Games, and Windows game directories. All
                      entries have been upserted into the local SQLite database.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-amber-200">
                      No installed games found on default paths
                    </p>
                    <p className="text-amber-300/80">
                      If your games are located on a custom drive or directory
                      (e.g.{' '}
                      <code className="text-amber-200 font-mono">D:\Games</code>
                      ), you can add them under Settings or use the executable
                      import option.
                    </p>
                  </div>
                </div>
              )}

              {/* Platforms Quick Summary */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ms-muted">
                  Platform Discovery Breakdown
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {platforms.map((p) => (
                    <div
                      key={p.platformId + p.platformName}
                      className="p-3 rounded-lg bg-ms-elevated/60 border border-ms-border flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <PlatformBadge platformId={p.platformId} />
                        <div>
                          <p className="font-medium text-xs text-ms-text">
                            {p.platformName}
                          </p>
                          <p className="text-[11px] text-ms-muted">
                            {p.status === 'detected'
                              ? `${p.gamesDiscoveredCount} game(s) found`
                              : p.status === 'unsupported'
                              ? 'Proprietary format (manual import)'
                              : 'Client not detected'}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                          p.gamesDiscoveredCount > 0
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : p.status === 'detected'
                            ? 'bg-ms-card text-ms-muted border border-ms-border'
                            : 'bg-ms-card/50 text-ms-muted/70'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PLATFORMS CHECKED */}
          {activeTab === 'platforms' && summary && (
            <div className="space-y-4">
              {platforms.map((p) => (
                <div
                  key={p.platformId + p.platformName}
                  className="p-4 rounded-xl bg-ms-elevated border border-ms-border space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <PlatformBadge platformId={p.platformId} />
                      <h4 className="font-semibold text-sm text-ms-text">
                        {p.platformName}
                      </h4>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${
                        p.gamesDiscoveredCount > 0
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : p.status === 'detected'
                          ? 'bg-ms-card text-ms-muted border border-ms-border'
                          : 'bg-ms-card/50 text-ms-muted/70'
                      }`}
                    >
                      {p.status} ({p.gamesDiscoveredCount} games)
                    </span>
                  </div>

                  {p.pathsSearched.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-ms-muted uppercase tracking-wider">
                        Paths Searched:
                      </p>
                      <ul className="text-xs font-mono text-ms-text/90 space-y-0.5 bg-ms-card p-2.5 rounded-lg border border-ms-border">
                        {p.pathsSearched.map((pathStr) => (
                          <li key={pathStr} className="truncate">
                            • {pathStr}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {p.details && (
                    <p className="text-xs text-ms-muted">
                      <strong className="text-ms-text">Detection Method:</strong>{' '}
                      {p.details}
                    </p>
                  )}

                  {p.warningsOrErrors && p.warningsOrErrors.length > 0 && (
                    <p className="text-xs text-amber-400/90 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                      {p.warningsOrErrors.join('; ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: DISCOVERED GAMES */}
          {activeTab === 'games' && summary && (
            <div className="space-y-3">
              {allDiscovered.length > 0 ? (
                allDiscovered.map((g, idx) => (
                  <div
                    key={g.title + idx}
                    className="p-3.5 rounded-xl bg-ms-elevated border border-ms-border space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-ms-muted tabular-nums">
                          #{idx + 1}
                        </span>
                        <h4 className="font-bold text-sm text-ms-text">
                          {g.title}
                        </h4>
                      </div>
                      <PlatformBadge platformId={g.platformId} />
                    </div>
                    <div className="text-xs font-mono space-y-0.5 text-ms-muted">
                      <p className="truncate">
                        <span className="text-ms-text font-semibold">Install:</span>{' '}
                        {g.installPath ?? 'N/A'}
                      </p>
                      <p className="truncate">
                        <span className="text-ms-text font-semibold">
                          Executable:
                        </span>{' '}
                        {g.executablePath ?? 'N/A'}
                      </p>
                      <p>
                        <span className="text-ms-text font-semibold">Launch:</span>{' '}
                        {g.launchMethod}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-ms-muted">
                  No games discovered during this scan.
                </div>
              )}
            </div>
          )}

          {/* TAB: SYSTEM & IPC STATUS (Always available) */}
          {activeTab === 'system' && (
            <div className="space-y-6">
              {/* Scan Error Alert if present */}
              {scanError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <div className="space-y-1">
                    <p className="font-semibold text-rose-200">
                      Recent Scan Error
                    </p>
                    <p className="font-mono text-rose-300/90 leading-relaxed">
                      {scanError}
                    </p>
                  </div>
                </div>
              )}

              {/* Status Checklist Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Preload Bridge Card */}
                <div className="p-4 rounded-xl bg-ms-elevated border border-ms-border space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-ms-accent" />
                      <h4 className="font-semibold text-xs text-ms-text">
                        Preload Bridge (window.maswitch)
                      </h4>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                        isBridgeAvailable
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {isBridgeAvailable ? 'Available' : 'Missing'}
                    </span>
                  </div>
                  <p className="text-xs text-ms-muted leading-relaxed">
                    {isBridgeAvailable
                      ? `Electron contextBridge successfully exposed ${bridgeKeys.length} native module(s) to the renderer.`
                      : 'window.maswitch is undefined. The Electron preload script failed to execute.'}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {bridgeKeys.map((k) => (
                      <span
                        key={k}
                        className="px-2 py-0.5 rounded bg-ms-card border border-ms-border text-[11px] font-mono text-ms-text"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>

                {/* SQLite Database Card */}
                <div className="p-4 rounded-xl bg-ms-elevated border border-ms-border space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-emerald-400" />
                      <h4 className="font-semibold text-xs text-ms-text">
                        Local SQLite Database
                      </h4>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      Connected
                    </span>
                  </div>
                  <p className="text-xs text-ms-muted leading-relaxed">
                    Persistent database in user profile directory (`maswitch.db`).
                  </p>
                  <div className="p-2.5 rounded-lg bg-ms-card border border-ms-border flex items-center justify-between text-xs">
                    <span className="text-ms-muted">Stored Games Count:</span>
                    <span className="font-bold text-ms-text tabular-nums">
                      {realGames.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* IPC Channel Probes */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-ms-muted">
                  IPC Module Availability
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    {
                      name: 'maswitch.scanner',
                      ready: !!window.maswitch?.scanner,
                    },
                    {
                      name: 'maswitch.library',
                      ready: !!window.maswitch?.library,
                    },
                    {
                      name: 'maswitch.launcher',
                      ready: !!window.maswitch?.launcher,
                    },
                    {
                      name: 'maswitch.tracker',
                      ready: !!window.maswitch?.tracker,
                    },
                    {
                      name: 'maswitch.settings',
                      ready: !!window.maswitch?.settings,
                    },
                    {
                      name: 'maswitch.windowControls',
                      ready: !!window.maswitch?.windowControls,
                    },
                  ].map((chan) => (
                    <div
                      key={chan.name}
                      className="p-2.5 rounded-lg bg-ms-elevated border border-ms-border flex items-center justify-between"
                    >
                      <span className="font-mono text-[11px] truncate text-ms-text">
                        {chan.name}
                      </span>
                      {chan.ready ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Default Scan Targets & Paths */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FolderCode className="w-4 h-4 text-ms-accent" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-ms-muted">
                    Default Windows Game Scan Paths
                  </h4>
                </div>
                <div className="space-y-1.5 text-xs font-mono bg-ms-card p-3 rounded-xl border border-ms-border">
                  <p className="text-ms-text">
                    <strong className="text-ms-accent font-sans">Steam:</strong>{' '}
                    C:\Program Files (x86)\Steam\steamapps\libraryfolders.vdf & *.acf
                  </p>
                  <p className="text-ms-text">
                    <strong className="text-ms-accent font-sans">Epic Games:</strong>{' '}
                    %ProgramData%\Epic\EpicGamesLauncher\Data\Manifests\*.item
                  </p>
                  <p className="text-ms-text">
                    <strong className="text-ms-accent font-sans">GOG Galaxy:</strong>{' '}
                    %ProgramFiles(x86)%\GOG Galaxy\Games & Windows Registry
                  </p>
                  <p className="text-ms-text">
                    <strong className="text-ms-accent font-sans">Ubisoft Connect:</strong>{' '}
                    %ProgramFiles(x86)%\Ubisoft\Ubisoft Game Launcher & Registry
                  </p>
                  <p className="text-ms-text">
                    <strong className="text-ms-accent font-sans">Riot Games:</strong>{' '}
                    C:\Riot Games & %ProgramData%\Riot Games
                  </p>
                  <p className="text-ms-text">
                    <strong className="text-ms-accent font-sans">EA App:</strong>{' '}
                    %ProgramFiles%\Electronic Arts\EA Desktop & Registry
                  </p>
                  {settings.customScanFolders.length > 0 && (
                    <div className="pt-1 border-t border-ms-border">
                      <p className="font-sans font-semibold text-ms-muted">
                        Custom Folders:
                      </p>
                      {settings.customScanFolders.map((f) => (
                        <p key={f} className="text-ms-text">
                          • {f}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Scan Action */}
              <div className="p-4 rounded-xl bg-ms-elevated border border-ms-border flex items-center justify-between">
                <div className="space-y-0.5">
                  <h5 className="font-semibold text-xs text-ms-text">
                    Run Installed Game Scan
                  </h5>
                  <p className="text-[11px] text-ms-muted">
                    Trigger background scan to populate or update the SQLite library.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="diag-run-scan-btn"
                  onClick={() => {
                    void startGameScan();
                    onClose();
                  }}
                  disabled={isScanning}
                  className="h-9 px-4 rounded-lg bg-ms-accent hover:bg-ms-accentHover text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`}
                  />
                  <span>{isScanning ? 'Scanning...' : 'Scan Games Now'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: RAW DIAGNOSTIC TEXT */}
          {activeTab === 'raw' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ms-muted">
                  Standard ASCII diagnostic report for troubleshooting and support
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="h-8 px-3 rounded bg-ms-elevated hover:bg-ms-border border border-ms-border text-xs text-ms-text inline-flex items-center gap-1.5 transition-colors"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <pre
                data-testid="diagnostic-report-text-pre"
                className="p-4 rounded-xl bg-black/60 border border-ms-border text-xs font-mono text-emerald-300/90 whitespace-pre overflow-x-auto max-h-[50vh] leading-relaxed"
              >
                {summary ? reportText : systemReportText}
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-ms-border/80 bg-ms-elevated/40 text-xs text-ms-muted">
          <span>
            {summary ? `Scan ID: ${summary.scanId}` : 'MaSwitch System Status: OK'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-text text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
