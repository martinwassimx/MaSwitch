import React, { useState } from 'react';
import {
  Star,
  ArrowRight,
  RefreshCw,
  Play,
  Loader2,
  XCircle,
  Plus,
  HardDrive,
  Clock,
  Sparkles,
  FolderSearch,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { PlatformId } from '../shared/types/platform';
import { installedGameScannerService } from '../services/installedGameScannerService';
import { DemoNoticeBanner } from '../components/common/DemoNoticeBanner';
import { PlatformBadge } from '../components/common/PlatformBadge';
import { GameCoverCard } from '../components/common/GameCoverCard';
import { PlatformLogo } from '../components/platforms/PlatformLogo';
import { ScanDiagnosticsModal } from '../components/scanner/ScanDiagnosticsModal';
import { ScanningFeedbackBanner } from '../components/scanner/ScanningFeedbackBanner';

export const HomePage: React.FC = () => {
  const games = useAppStore((s) => s.games);
  const platforms = useAppStore((s) => s.platforms);
  const settings = useAppStore((s) => s.settings);
  const isScanning = useAppStore((s) => s.isScanning);
  const scanProgress = useAppStore((s) => s.scanProgress);
  const lastScanSummary = useAppStore((s) => s.lastScanSummary);
  const trackerStatus = useAppStore((s) => s.trackerStatus);
  const launchStatuses = useAppStore((s) => s.launchStatuses);
  const launchMessages = useAppStore((s) => s.launchMessages);

  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const setPlatformFilter = useAppStore((s) => s.setPlatformFilter);
  const openGameDetails = useAppStore((s) => s.openGameDetails);
  const toggleFavoriteGame = useAppStore((s) => s.toggleFavoriteGame);
  const triggerGameScan = useAppStore((s) => s.startGameScan);
  const cancelGameScan = useAppStore((s) => s.cancelGameScan);
  const launchGameById = useAppStore((s) => s.launchGame);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const recentlyPlayedGames = [...games]
    .filter((g) => g.lastPlayedIso !== null)
    .sort((a, b) => {
      const tA = a.lastPlayedIso ? Date.parse(a.lastPlayedIso) : 0;
      const tB = b.lastPlayedIso ? Date.parse(b.lastPlayedIso) : 0;
      return tB - tA;
    });

  const activeSessionGame =
    trackerStatus.activeSessions.length > 0
      ? games.find((g) => g.id === trackerStatus.activeSessions[0].gameId)
      : undefined;

  const continuePlayingGame =
    activeSessionGame ??
    recentlyPlayedGames[0] ??
    games.find((g) => g.isFeatured) ??
    games[0];

  const favoriteGames = games.filter((g) =>
    settings.favoriteGameIds.includes(g.id)
  );

  const totalPlaytimeHours = games.reduce(
    (sum, g) => sum + g.playtimeHours,
    0
  );
  const installedCount = installedGameScannerService.getInstalledCount(games);

  const featuredLaunchState = continuePlayingGame
    ? launchStatuses[continuePlayingGame.id] ?? 'idle'
    : 'idle';
  const featuredLaunchMessage = continuePlayingGame
    ? launchMessages[continuePlayingGame.id]
    : undefined;

  const handlePlatformClick = (platformId: PlatformId) => {
    setPlatformFilter(platformId);
    setActiveSection('library');
  };

  return (
    <div data-testid="page-home" className="max-w-7xl mx-auto space-y-10 pb-16">
      {/* Spacious Gaming Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ms-border/80 pb-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-ms-text tracking-tight">
            Home
          </h1>
          <p className="text-sm text-ms-muted">
            {isScanning && scanProgress
              ? `${scanProgress.message} (${scanProgress.percent}% · ${scanProgress.discoveredCount} detected)`
              : trackerStatus.activeSessions.length > 0
              ? `Currently running ${trackerStatus.activeSessions[0].gameTitle}`
              : `${installedCount} games installed · ${totalPlaytimeHours.toFixed(1)}h total playtime`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isScanning ? (
            <button
              type="button"
              data-testid="home-cancel-scan-btn"
              onClick={() => void cancelGameScan()}
              className="h-10 px-4 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-sm font-medium inline-flex items-center gap-2 transition-colors"
            >
              <XCircle className="w-4 h-4" />
              <span>Cancel scan ({scanProgress?.percent ?? 0}%)</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="home-rescan-btn"
              onClick={() => void triggerGameScan()}
              className="h-10 px-4 rounded-lg bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-text text-sm font-medium inline-flex items-center gap-2 transition-colors shadow-sm"
            >
              <RefreshCw className="w-4 h-4 text-ms-muted" />
              <span>Scan installed games</span>
            </button>
          )}

          <button
            type="button"
            data-testid="home-view-diagnostics-btn"
            onClick={() => setShowDiagnostics(true)}
            className="h-10 px-3.5 rounded-lg bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-text text-sm font-medium inline-flex items-center gap-2 transition-colors shadow-sm"
            title="View system & scanner diagnostics"
          >
            <FolderSearch className="w-4 h-4 text-ms-accent" />
            <span>Diagnostics</span>
          </button>

          <button
            type="button"
            data-testid="toggle-demo-mode-btn"
            onClick={() =>
              void updateSettings({
                demoModeEnabled: !settings.demoModeEnabled,
              })
            }
            className={`h-10 px-4 rounded-lg border text-sm font-medium transition-colors ${
              settings.demoModeEnabled
                ? 'bg-ms-accent/15 border-ms-accent text-ms-accent'
                : 'bg-ms-card border-ms-border text-ms-muted hover:text-ms-text'
            }`}
          >
            {settings.demoModeEnabled ? 'Demo mode: On' : 'Demo mode: Off'}
          </button>
        </div>
      </div>

      {/* Real-time Scanning Activity / Error / Completion Feedback */}
      <ScanningFeedbackBanner
        onOpenDiagnostics={() => setShowDiagnostics(true)}
      />

      {settings.demoModeEnabled && (
        <DemoNoticeBanner
          title="Demo mode active"
          description="Showing sample library titles. Turn off Demo mode to view your real installed Windows games."
        />
      )}

      {/* Empty Library Onboarding State */}
      {games.length === 0 && (
        <section
          data-testid="home-empty-library-card"
          className="rounded-2xl bg-ms-card border border-ms-border p-12 text-center space-y-5"
        >
          <div className="w-14 h-14 rounded-2xl bg-ms-elevated border border-ms-border flex items-center justify-center text-ms-accent mx-auto">
            <HardDrive className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-xl font-bold text-ms-text">
              No games detected yet
            </h2>
            <p className="text-sm text-ms-muted leading-relaxed">
              Scan your drives for installed Steam, Epic Games, GOG, Ubisoft,
              and Riot titles, or add a Windows game executable manually.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => void triggerGameScan()}
              disabled={isScanning}
              className="h-11 px-5 rounded-lg bg-ms-accent hover:bg-ms-accentHover text-white font-semibold text-sm inline-flex items-center gap-2 transition-colors shadow-lg"
            >
              <RefreshCw
                className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`}
              />
              <span>{isScanning ? 'Scanning...' : 'Scan installed games'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('library')}
              className="h-11 px-5 rounded-lg bg-ms-elevated hover:bg-ms-border border border-ms-border text-ms-text font-semibold text-sm inline-flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add executable manually</span>
            </button>
            <button
              type="button"
              onClick={() => void updateSettings({ demoModeEnabled: true })}
              className="h-11 px-5 rounded-lg bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text font-medium text-sm transition-colors"
            >
              Load demo games
            </button>
            <button
              type="button"
              data-testid="empty-view-diagnostics-btn"
              onClick={() => setShowDiagnostics(true)}
              className="h-11 px-5 rounded-lg bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-text font-semibold text-sm inline-flex items-center gap-2 transition-colors"
            >
              <FolderSearch className="w-4 h-4 text-ms-accent" />
              <span>
                {lastScanSummary
                  ? `View diagnostics (${lastScanSummary.totalFound} found)`
                  : 'System Diagnostics'}
              </span>
            </button>
          </div>
        </section>
      )}

      {/* Continue Playing Cinematic Spotlight Banner */}
      {continuePlayingGame && (
        <section aria-label="Continue playing" className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-ms-accent" />
              <h2 className="text-sm font-semibold text-ms-muted uppercase tracking-wider">
                Continue Playing
              </h2>
            </div>
          </div>

          <div className="relative rounded-2xl overflow-hidden bg-ms-card border border-ms-border shadow-card">
            {/* Cinematic Background Hero */}
            <div className="relative min-h-[340px] md:min-h-[360px] flex flex-col justify-end p-8 md:p-10">
              <img
                src={continuePlayingGame.heroBackgroundImage}
                alt={continuePlayingGame.title}
                className="absolute inset-0 w-full h-full object-cover opacity-40 scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-ms-bg via-ms-bg/90 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-ms-bg via-ms-bg/40 to-transparent" />

              <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="flex items-end gap-6 min-w-0 max-w-3xl">
                  {/* Vertical 2:3 Cover Poster */}
                  <div className="hidden sm:block w-32 md:w-36 aspect-[2/3] rounded-xl overflow-hidden border border-ms-border shadow-2xl shrink-0 bg-ms-bg">
                    <img
                      src={continuePlayingGame.coverImage}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="space-y-3 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5 text-xs text-ms-muted">
                      <PlatformBadge
                        platformId={continuePlayingGame.platformId}
                        size="sm"
                      />
                      <span>•</span>
                      <span className="tabular-nums font-medium text-ms-text/90">
                        {continuePlayingGame.playtimeHours.toFixed(1)}h played
                      </span>
                      {continuePlayingGame.lastPlayedLabel && (
                        <>
                          <span>•</span>
                          <span>Last played {continuePlayingGame.lastPlayedLabel}</span>
                        </>
                      )}
                    </div>

                    <h3 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight truncate">
                      {continuePlayingGame.title}
                    </h3>

                    <p className="text-sm text-ms-muted line-clamp-2 max-w-xl leading-relaxed">
                      {continuePlayingGame.shortDescription}
                    </p>

                    {featuredLaunchMessage && (
                      <p className="text-xs text-amber-400 font-medium">
                        {featuredLaunchMessage}
                      </p>
                    )}
                  </div>
                </div>

                {/* Primary Launch & Details Actions */}
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {continuePlayingGame.isInstalled && !continuePlayingGame.isDemoData && (
                    <button
                      type="button"
                      data-testid="hero-play-btn"
                      disabled={featuredLaunchState === 'launching'}
                      onClick={() => void launchGameById(continuePlayingGame.id)}
                      className="h-11 px-6 rounded-lg bg-ms-accent hover:bg-ms-accentHover text-white text-sm font-semibold inline-flex items-center gap-2 shadow-lg disabled:opacity-60 transition-transform active:scale-95"
                    >
                      {featuredLaunchState === 'launching' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Launching...</span>
                        </>
                      ) : featuredLaunchState === 'running' ? (
                        <>
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Running</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current" />
                          <span>Play Game</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openGameDetails(continuePlayingGame.id)}
                    className="h-11 px-5 rounded-lg bg-ms-elevated/80 hover:bg-ms-elevated border border-ms-border text-ms-text text-sm font-medium inline-flex items-center gap-2 transition-colors"
                  >
                    <span>View Details</span>
                    <ArrowRight className="w-4 h-4 text-ms-muted" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Shelf: Recently Played */}
      {recentlyPlayedGames.length > 0 && (
        <section aria-label="Recently played games" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-ms-accent" />
              <h2 className="text-lg font-bold text-ms-text tracking-tight">
                Recently Played
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setActiveSection('library')}
              className="text-xs font-semibold text-ms-accent hover:underline inline-flex items-center gap-1"
            >
              <span>View all in Library</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {recentlyPlayedGames.slice(0, 6).map((game) => (
              <GameCoverCard
                key={game.id}
                game={game}
                isFavorite={settings.favoriteGameIds.includes(game.id)}
                launchState={launchStatuses[game.id] ?? 'idle'}
                onOpenDetails={openGameDetails}
                onToggleFavorite={toggleFavoriteGame}
                onLaunchGame={launchGameById}
              />
            ))}
          </div>
        </section>
      )}

      {/* Shelf: Favorites */}
      {favoriteGames.length > 0 && (
        <section aria-label="Favorite games" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              <h2 className="text-lg font-bold text-ms-text tracking-tight">
                Favorites
              </h2>
            </div>
            <span className="text-xs text-ms-muted">
              {favoriteGames.length} saved
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {favoriteGames.slice(0, 6).map((game) => (
              <GameCoverCard
                key={game.id}
                game={game}
                isFavorite={true}
                launchState={launchStatuses[game.id] ?? 'idle'}
                onOpenDetails={openGameDetails}
                onToggleFavorite={toggleFavoriteGame}
                onLaunchGame={launchGameById}
              />
            ))}
          </div>
        </section>
      )}

      {/* Shelf: All Games / My Games */}
      {games.length > 0 && (
        <section aria-label="My games collection" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-ms-text tracking-tight">
              All Games ({games.length})
            </h2>
            <button
              type="button"
              onClick={() => setActiveSection('library')}
              className="text-xs font-semibold text-ms-accent hover:underline inline-flex items-center gap-1"
            >
              <span>Explore full library</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {games.slice(0, 12).map((game) => (
              <GameCoverCard
                key={game.id}
                game={game}
                isFavorite={settings.favoriteGameIds.includes(game.id)}
                launchState={launchStatuses[game.id] ?? 'idle'}
                onOpenDetails={openGameDetails}
                onToggleFavorite={toggleFavoriteGame}
                onLaunchGame={launchGameById}
              />
            ))}
          </div>
        </section>
      )}

      {/* Platforms Overview Strip */}
      <section aria-label="Gaming platforms" className="space-y-4 pt-4 border-t border-ms-border/80">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ms-text tracking-tight">
            Gaming Platforms
          </h2>
          <button
            type="button"
            onClick={() => setActiveSection('platforms')}
            className="text-xs font-semibold text-ms-accent hover:underline inline-flex items-center gap-1"
          >
            <span>Platform matrix</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {platforms.map((p) => {
            const count = games.filter((g) => g.platformId === p.id).length;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePlatformClick(p.id)}
                className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-ms-card hover:bg-ms-elevated border border-ms-border/80 hover:border-ms-muted/60 transition-all text-center gap-2 group"
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                  <PlatformLogo platformId={p.id} size="md" colorMode="brand" />
                </div>
                <span className="text-xs font-semibold text-ms-text truncate max-w-full">
                  {p.name}
                </span>
                <span className="text-[11px] text-ms-muted font-mono">
                  {count} game{count === 1 ? '' : 's'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Diagnostics Modal */}
      <ScanDiagnosticsModal
        summary={lastScanSummary}
        isOpen={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
      />
    </div>
  );
};
