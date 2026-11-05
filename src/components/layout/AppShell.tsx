import React, { Suspense, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '../../store/useAppStore';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { HomePage } from '../../pages/HomePage';
import { LibraryPage as EagerLibraryPage } from '../../pages/LibraryPage';
import { GameDetailsPage as EagerGameDetailsPage } from '../../pages/GameDetailsPage';
import { AccountsPage as EagerAccountsPage } from '../../pages/AccountsPage';
import { PlatformsPage as EagerPlatformsPage } from '../../pages/PlatformsPage';
import { StatisticsPage as EagerStatisticsPage } from '../../pages/StatisticsPage';
import { PerformancePage as EagerPerformancePage } from '../../pages/PerformancePage';
import { NewsPage as EagerNewsPage } from '../../pages/NewsPage';
import { SettingsPage as EagerSettingsPage } from '../../pages/SettingsPage';

const isVitest =
  typeof process !== 'undefined' && Boolean(process.env?.VITEST);

// Lazy load secondary views for production build to reduce memory and render overhead
const LazyLibraryPage = React.lazy(() =>
  import('../../pages/LibraryPage').then((m) => ({ default: m.LibraryPage }))
);
const LazyGameDetailsPage = React.lazy(() =>
  import('../../pages/GameDetailsPage').then((m) => ({
    default: m.GameDetailsPage,
  }))
);
const LazyAccountsPage = React.lazy(() =>
  import('../../pages/AccountsPage').then((m) => ({ default: m.AccountsPage }))
);
const LazyPlatformsPage = React.lazy(() =>
  import('../../pages/PlatformsPage').then((m) => ({ default: m.PlatformsPage }))
);
const LazyStatisticsPage = React.lazy(() =>
  import('../../pages/StatisticsPage').then((m) => ({
    default: m.StatisticsPage,
  }))
);
const LazyPerformancePage = React.lazy(() =>
  import('../../pages/PerformancePage').then((m) => ({
    default: m.PerformancePage,
  }))
);
const LazyNewsPage = React.lazy(() =>
  import('../../pages/NewsPage').then((m) => ({ default: m.NewsPage }))
);
const LazySettingsPage = React.lazy(() =>
  import('../../pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);

const LibraryView = isVitest ? EagerLibraryPage : LazyLibraryPage;
const GameDetailsView = isVitest ? EagerGameDetailsPage : LazyGameDetailsPage;
const AccountsView = isVitest ? EagerAccountsPage : LazyAccountsPage;
const PlatformsView = isVitest ? EagerPlatformsPage : LazyPlatformsPage;
const StatisticsView = isVitest ? EagerStatisticsPage : LazyStatisticsPage;
const PerformanceView = isVitest ? EagerPerformancePage : LazyPerformancePage;
const NewsView = isVitest ? EagerNewsPage : LazyNewsPage;
const SettingsView = isVitest ? EagerSettingsPage : LazySettingsPage;

const ViewLoadingFallback: React.FC = () => (
  <div className="flex h-full w-full items-center justify-center p-12 text-ms-muted text-xs">
    <div className="flex items-center gap-2">
      <div className="h-4 w-4 rounded-full border-2 border-ms-border border-t-ms-accent animate-spin" />
      <span>Loading view...</span>
    </div>
  </div>
);

export const AppShell: React.FC = () => {
  const activeSection = useAppStore((s) => s.activeSection);
  const selectedGameId = useAppStore((s) => s.selectedGameId);
  const settings = useAppStore((s) => s.settings);
  const inGameMode = useAppStore((s) => s.inGameMode);
  const isWindowVisible = useAppStore((s) => s.isWindowVisible);
  const initializeApp = useAppStore((s) => s.initializeApp);
  const refreshLibraryAndStats = useAppStore((s) => s.refreshLibraryAndStats);
  const setInGameMode = useAppStore((s) => s.setInGameMode);
  const setWindowVisible = useAppStore((s) => s.setWindowVisible);

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
          // If a game is actively running, avoid expensive library refetches
          if (!useAppStore.getState().inGameMode) {
            void refreshLibraryAndStats();
          }
        })
      );
    }

    if (window.maswitch?.launcher?.onStatusChanged) {
      cleanups.push(
        window.maswitch.launcher.onStatusChanged((payload) => {
          useAppStore
            .getState()
            .updateLaunchStatus(payload.gameId, payload.status, payload.message);
        })
      );
    }

    if (window.maswitch?.tracker?.onSessionUpdated) {
      cleanups.push(
        window.maswitch.tracker.onSessionUpdated(() => {
          // In game mode, avoid re-aggregating whole library stats on each session tick
          if (!useAppStore.getState().inGameMode) {
            void refreshLibraryAndStats();
          }
        })
      );
    }

    if (window.maswitch?.tracker?.onGameModeChanged) {
      cleanups.push(
        window.maswitch.tracker.onGameModeChanged((payload) => {
          setInGameMode(payload.inGame, payload.activeGameCount);
          if (!payload.inGame) {
            // Game just exited, perform a single consolidated refresh
            void refreshLibraryAndStats();
          }
        })
      );
    }

    if (window.maswitch?.windowControls?.onVisibilityChanged) {
      cleanups.push(
        window.maswitch.windowControls.onVisibilityChanged((visible) => {
          setWindowVisible(visible);
        })
      );
    }

    if (window.maswitch?.app?.onNavigateSection) {
      cleanups.push(
        window.maswitch.app.onNavigateSection((section) => {
          useAppStore
            .getState()
            .setActiveSection(
              section as import('../../shared/types/settings').NavigationSection
            );
        })
      );
    }

    if (window.maswitch?.app?.onFilterFavorites) {
      cleanups.push(
        window.maswitch.app.onFilterFavorites((favs) => {
          useAppStore.getState().setFavoritesOnly(favs);
        })
      );
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [refreshLibraryAndStats, setInGameMode, setWindowVisible]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedGameId) {
          useAppStore.getState().closeGameDetails();
        }
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          useAppStore.getState().setActiveSection('library');
          const searchInput = document.querySelector<HTMLInputElement>(
            'input[aria-label="Global game search"]'
          );
          searchInput?.focus();
        } else if (e.key === ',') {
          e.preventDefault();
          useAppStore.getState().setActiveSection('settings');
        } else if (e.key === '1') {
          e.preventDefault();
          useAppStore.getState().setActiveSection('home');
        } else if (e.key === '2') {
          e.preventDefault();
          useAppStore.getState().setActiveSection('library');
        } else if (e.key === '3') {
          e.preventDefault();
          useAppStore.getState().setActiveSection('accounts');
        } else if (e.key === '4') {
          e.preventDefault();
          useAppStore.getState().setActiveSection('platforms');
        } else if (e.key === '5') {
          e.preventDefault();
          useAppStore.getState().setActiveSection('statistics');
        } else if (e.key === '6') {
          e.preventDefault();
          useAppStore.getState().setActiveSection('performance');
        } else if (e.key === '7') {
          e.preventDefault();
          useAppStore.getState().setActiveSection('news');
        } else if (e.key === '8') {
          e.preventDefault();
          useAppStore.getState().setActiveSection('settings');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedGameId]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.documentElement.setAttribute('data-accent', settings.accentColor);
    document.documentElement.classList.toggle(
      'low-end-pc-mode',
      Boolean(settings.lowEndPcMode)
    );
    document.documentElement.setAttribute(
      'data-low-end',
      settings.lowEndPcMode ? 'true' : 'false'
    );
    document.documentElement.classList.toggle(
      'in-game-mode',
      Boolean(inGameMode)
    );
    document.documentElement.setAttribute(
      'data-in-game',
      inGameMode ? 'true' : 'false'
    );
  }, [settings.theme, settings.accentColor, settings.lowEndPcMode, inGameMode]);

  const viewKey = selectedGameId ? `details-${selectedGameId}` : activeSection;
  const shouldAnimate =
    settings.animationsEnabled &&
    !settings.reducedMotion &&
    !settings.lowEndPcMode &&
    !inGameMode &&
    isWindowVisible;

  const renderActiveView = () => {
    if (selectedGameId) {
      return (
        <Suspense fallback={<ViewLoadingFallback />}>
          <GameDetailsView />
        </Suspense>
      );
    }

    switch (activeSection) {
      case 'home':
        return <HomePage />;
      case 'library':
        return (
          <Suspense fallback={<ViewLoadingFallback />}>
            <LibraryView />
          </Suspense>
        );
      case 'accounts':
        return (
          <Suspense fallback={<ViewLoadingFallback />}>
            <AccountsView />
          </Suspense>
        );
      case 'platforms':
        return (
          <Suspense fallback={<ViewLoadingFallback />}>
            <PlatformsView />
          </Suspense>
        );
      case 'statistics':
        return (
          <Suspense fallback={<ViewLoadingFallback />}>
            <StatisticsView />
          </Suspense>
        );
      case 'performance':
        return (
          <Suspense fallback={<ViewLoadingFallback />}>
            <PerformanceView />
          </Suspense>
        );
      case 'news':
        return (
          <Suspense fallback={<ViewLoadingFallback />}>
            <NewsView />
          </Suspense>
        );
      case 'settings':
        return (
          <Suspense fallback={<ViewLoadingFallback />}>
            <SettingsView />
          </Suspense>
        );
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
