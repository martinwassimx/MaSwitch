import React from 'react';
import { ArrowDownCircle, CheckCircle2, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const UpdateBanner: React.FC = () => {
  const {
    showUpdateBanner,
    updaterState,
    dismissUpdateBanner,
    setShowUpdateModal,
    setActiveSection,
    installAndRestartUpdate,
  } = useAppStore();

  const updateInfo = updaterState.latestCheckResult?.updateInfo;
  if (!showUpdateBanner || !updateInfo) {
    return null;
  }

  const isDownloaded = updaterState.status === 'downloaded';
  const targetVersion = updateInfo.version;

  const handleAction = () => {
    if (isDownloaded) {
      void installAndRestartUpdate();
    } else {
      setShowUpdateModal(true);
    }
  };

  const handleOpenSettings = () => {
    setActiveSection('settings');
    setShowUpdateModal(false);
  };

  return (
    <div
      role="region"
      aria-label="Application update announcement"
      className="relative z-30 flex items-center justify-between gap-3 px-4 py-2 border-b border-purple-500/30 bg-gradient-to-r from-purple-950/80 via-slate-900/90 to-purple-950/80 text-white text-xs backdrop-blur-md shadow-lg"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {isDownloaded ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
        ) : (
          <ArrowDownCircle className="w-4 h-4 text-purple-400 shrink-0" />
        )}
        <div className="truncate">
          <span className="font-semibold text-purple-200">
            {isDownloaded ? 'Update Ready: ' : 'New Version: '}
          </span>
          <span className="text-slate-300">
            {isDownloaded
              ? `MaSwitch v${targetVersion} is verified and ready to install.`
              : `MaSwitch v${targetVersion} is available.`}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleAction}
          className="px-2.5 py-1 rounded font-medium transition-all shadow-sm bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white hover:shadow-purple-500/25 active:scale-95"
        >
          {isDownloaded ? 'Install & Restart' : 'View Update'}
        </button>

        <button
          type="button"
          onClick={handleOpenSettings}
          className="px-2 py-1 rounded font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
          title="Go to Settings"
        >
          Details
        </button>

        <button
          type="button"
          onClick={() => dismissUpdateBanner(targetVersion)}
          className="px-2 py-1 rounded font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
        >
          Later
        </button>

        <button
          type="button"
          onClick={() => dismissUpdateBanner(targetVersion)}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Dismiss banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
