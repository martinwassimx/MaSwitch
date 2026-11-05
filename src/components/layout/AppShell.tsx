import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '../../store/useAppStore';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { HomePage } from '../../pages/HomePage';
import { LibraryPage } from '../../pages/LibraryPage';
import { GameDetailsPage } from '../../pages/GameDetailsPage';
import { AccountsPage } from '../../pages/AccountsPage';
import { PlatformsPage } from '../../pages/PlatformsPage';
import { StatisticsPage } from '../../pages/StatisticsPage';
import { SettingsPage } from '../../pages/SettingsPage';

export const AppShell: React.FC = () => {
  const activeSection = useAppStore((s) => s.activeSection);
  const selectedGameId = useAppStore((s) => s.selectedGameId);
  const settings = useAppStore((s) => s.settings);
  const initializeApp = useAppStore((s) => s.initializeApp);
  const refreshLibraryAndStats = useAppStore((s) => s.refreshLibraryAndStats);

  useEffect(() => {
    void initializeApp();
  }, [initializeApp]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    if (window.maswitch?.scanner?.onProgress) {
      cleanups.push(
        window.maswitch.scanner.onProgress((progress) => {
          const done =
            progress.phase === 'completed' ||
            progress.phase === 'cancelled' ||
            progress.phase === 'failed';
          useAppStore.setState((state) => ({
            scanProgress: progress,
            isScanning: !done,
            scanError:
              progress.phase === 'failed'
                ? progress.message
                : state.scanError,
          }));
        })
      );
    }

    if (window.maswitch?.launcher?.onStatusChanged) {
      cleanups.push(
        window.maswitch.launcher.onStatusChanged((result) => {
          useAppStore.setState((s) => ({
            launchStatuses: {
              ...s.launchStatuses,
              [result.gameId]: result.status,
            },
            launchMessages: {
              ...s.launchMessages,
              ...(result.message
                ? { [result.gameId]: result.message }
                : {}),
            },
          }));
        })
      );
    }

    if (window.maswitch?.library?.onLibraryUpdated) {
      cleanups.push(
        window.maswitch.library.onLibraryUpdated(() => {
          void refreshLibraryAndStats();
        })
      );
    }

    if (window.maswitch?.tracker?.onSessionUpdated) {
      cleanups.push(
        window.maswitch.tracker.onSessionUpdated(() => {
          void refreshLibraryAndStats();
        })
      );
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [refreshLibraryAndStats]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.documentElement.setAttribute('data-accent', settings.accentColor);
  }, [settings.theme, settings.accentColor]);

  const viewKey = selectedGameId ? `details-${selectedGameId}` : activeSection;
  const shouldAnimate =
    settings.animationsEnabled && !settings.reducedMotion;

  const renderActiveView = () => {
    if (selectedGameId) {
      return <GameDetailsPage />;
    }

    switch (activeSection) {
      case 'home':
        return <HomePage />;
      case 'library':
        return <LibraryPage />;
      case 'accounts':
        return <AccountsPage />;
      case 'platforms':
        return <PlatformsPage />;
      case 'statistics':
        return <StatisticsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div
      data-testid="maswitch-app-shell"
      data-theme={settings.theme}
      data-accent={settings.accentColor}
      className="h-screen w-screen overflow-hidden bg-ms-bg text-ms-text flex flex-col font-sans text-[13px]"
    >
      <TitleBar />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar />

        <main
          aria-label="Main Application Viewport"
          className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-5 bg-ms-bg"
        >
          {shouldAnimate ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={viewKey}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
              >
                {renderActiveView()}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div key={viewKey}>{renderActiveView()}</div>
          )}
        </main>
      </div>
    </div>
  );
};
