import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const UpdateAvailableDialog: React.FC = () => {
  const {
    showUpdateModal,
    setShowUpdateModal,
    updaterState,
    startUpdateDownload,
    cancelUpdateDownload,
    installAndRestartUpdate,
    dismissUpdateBanner,
  } = useAppStore();

  const [installError, setInstallError] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  if (!showUpdateModal) {
    return null;
  }

  const updateInfo = updaterState.latestCheckResult?.updateInfo;
  const status = updaterState.status;
  const progress = updaterState.downloadProgress;

  const handleClose = () => {
    setShowUpdateModal(false);
  };

  const handleRemindLater = () => {
    if (updateInfo) {
      dismissUpdateBanner(updateInfo.version);
    }
    setShowUpdateModal(false);
  };

  const handleStartDownload = async () => {
    setInstallError(null);
    await startUpdateDownload();
  };

  const handleInstall = async () => {
    setIsInstalling(true);
    setInstallError(null);
    const result = await installAndRestartUpdate();
    setIsInstalling(false);
    if (!result.success) {
      setInstallError(result.message || 'Failed to start installation.');
    }
  };

  const handleOpenExternal = (url: string) => {
    if (window.maswitch?.news?.openExternalLink) {
      void window.maswitch.news.openExternalLink(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
    if (bytesPerSec > 1024 * 1024) {
      return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-purple-500/30 bg-[#12131a] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-purple-900/30 via-slate-900/40 to-purple-900/20">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-400">
              <ArrowDownCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 id="update-dialog-title" className="text-lg font-bold text-white">
                Application Update Available
              </h2>
              <p className="text-xs text-slate-400">
                A new version of MaSwitch is ready for download
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {updateInfo ? (
            <>
              {/* Version Comparison Header */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl border border-white/10 bg-white/[0.02]">
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-400 font-medium">
                    Current Version
                  </div>
                  <div className="text-sm font-semibold text-slate-300 mt-1 flex items-center gap-2">
                    <span>v{updaterState.currentVersion}</span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      Installed
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wider text-purple-400 font-medium">
                    Latest Version
                  </div>
                  <div className="text-sm font-semibold text-purple-200 mt-1 flex items-center gap-2">
                    <span>v{updateInfo.version}</span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-300 border border-purple-500/40">
                      {updateInfo.isPrerelease ? 'Beta' : 'Stable'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Release Metadata */}
              <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2 px-1">
                <span>
                  Published:{' '}
                  {new Date(updateInfo.publishedAtIso).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span>
                  Download Size:{' '}
                  {formatBytes(updateInfo.installerAsset.size)}
                </span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  SHA-256 Verified
                </span>
              </div>

              {/* Release Notes */}
              <div>
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Release Notes
                </h3>
                <div className="p-4 rounded-xl border border-white/10 bg-slate-950/60 max-h-56 overflow-y-auto text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap select-text custom-scrollbar">
                  {updateInfo.releaseNotes}
                </div>
              </div>

              {/* Download Progress State */}
              {status === 'downloading' && (
                <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-950/20 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-purple-300 flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Downloading MaSwitch v{updateInfo.version}...
                    </span>
                    <span className="font-mono text-purple-200 font-semibold">
                      {progress?.percent ?? 0}%
                    </span>
                  </div>

                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-600 via-indigo-500 to-cyan-400 transition-all duration-200"
                      style={{ width: `${progress?.percent ?? 0}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>
                      {progress ? `${progress.transferredMb} MB / ${progress.totalMb} MB` : 'Connecting...'}
                    </span>
                    <span>{progress ? formatSpeed(progress.speedBytesPerSec) : ''}</span>
                  </div>
                </div>
              )}

              {!updateInfo.signatureVerified && status !== 'downloading' && status !== 'downloaded' && (
                <div
                  data-testid="update-unverified-warning"
                  className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/20 text-amber-300 text-xs"
                >
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <span className="font-semibold text-amber-200">Automatic installation unavailable</span>
                    <p className="text-slate-300 mt-0.5">
                      This release could not be verified with a trusted MaSwitch update signature
                      {updateInfo.verificationError ? ` (${updateInfo.verificationError})` : ''}. Only download it
                      manually from the official release page if you trust it.
                    </p>
                  </div>
                </div>
              )}

              {/* Downloaded State */}
              {status === 'downloaded' && (
                <div className="flex items-center gap-3 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-xs">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                  <div>
                    <span className="font-semibold text-emerald-200">
                      Update Downloaded & Verified!
                    </span>
                    <p className="text-slate-300 mt-0.5">
                      Installer matches the signed MaSwitch release manifest and is ready to install.
                    </p>
                  </div>
                </div>
              )}

              {/* Error State */}
              {(status === 'error' || installError) && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300 text-xs">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
                  <div>
                    <span className="font-semibold text-rose-200">
                      Installation Precheck Warning
                    </span>
                    <p className="text-slate-300 mt-0.5">
                      {installError || updaterState.error || 'Failed to prepare update.'}
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-8 text-center text-slate-400 text-xs">
              No update information found.
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-slate-950/40">
          <div>
            {updateInfo && (
              <button
                type="button"
                onClick={() => handleOpenExternal(updateInfo.htmlUrl)}
                className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 hover:underline transition-colors"
              >
                <span>View on GitHub</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRemindLater}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              Remind Later
            </button>

            {status === 'downloading' ? (
              <button
                type="button"
                onClick={cancelUpdateDownload}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 transition-colors"
              >
                Cancel Download
              </button>
            ) : status === 'downloaded' ? (
              <button
                type="button"
                onClick={handleInstall}
                disabled={isInstalling}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-md shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50"
              >
                {isInstalling ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Preparing Installer...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Install & Restart</span>
                  </>
                )}
              </button>
            ) : updateInfo && !updateInfo.signatureVerified ? (
              <button
                type="button"
                onClick={() => handleOpenExternal(updateInfo.htmlUrl)}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold text-amber-200 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Release Page</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartDownload}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-purple-500/20 active:scale-95 transition-all"
              >
                <ArrowDownCircle className="w-3.5 h-3.5" />
                <span>Download Update</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
