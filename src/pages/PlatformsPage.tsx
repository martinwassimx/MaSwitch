import React, { useState } from 'react';
import { RefreshCw, ArrowRight, Star } from 'lucide-react';
import type { CapabilityReadiness } from '../shared/types/platform';
import { useAppStore } from '../store/useAppStore';
import { PlatformLogo } from '../components/platforms/PlatformLogo';

function isCapabilitySupported(readiness: CapabilityReadiness): boolean {
  return readiness === 'active' || readiness === 'phase-2';
}

export const PlatformsPage: React.FC = () => {
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const platforms = useAppStore((s) => s.platforms);
  const platformReports = useAppStore((s) => s.platformReports);
  const games = useAppStore((s) => s.games);
  const isScanning = useAppStore((s) => s.isScanning);
  const triggerGameScan = useAppStore((s) => s.startGameScan);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const setPlatformFilter = useAppStore((s) => s.setPlatformFilter);
  const favoritePlatformIds = useAppStore(
    (s) => s.settings.favoritePlatformIds ?? []
  );
  const togglePlatformFavorite = useAppStore((s) => s.togglePlatformFavorite);

  const handleInspectPlatformLibrary = (
    platformId: (typeof platforms)[number]['id']
  ) => {
    setPlatformFilter(platformId);
    setActiveSection('library');
  };

  const displayedPlatforms = favoritesOnly
    ? platforms.filter((p) => favoritePlatformIds.includes(p.id))
    : platforms;

  return (
    <div
      data-testid="page-platforms"
      className="max-w-6xl mx-auto space-y-7 pb-16 animate-fadeIn"
    >
      {/* Spacious Gaming Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ms-border/80 pb-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-ms-text tracking-tight">
            Gaming Platforms
          </h1>
          <p className="text-sm text-ms-muted">
            Supported Windows launchers, official brand logos, and local discovery status
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            data-testid="toggle-platform-favorites-filter"
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            className={`h-10 px-3.5 rounded-lg border text-sm font-semibold inline-flex items-center gap-1.5 transition-colors ${
              favoritesOnly
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                : 'bg-ms-card hover:bg-ms-elevated border-ms-border text-ms-muted hover:text-ms-text'
            }`}
          >
            <Star
              className={`w-4 h-4 ${
                favoritesOnly ? 'fill-amber-400 text-amber-400' : ''
              }`}
            />
            <span>Favorites</span>
          </button>

          <button
            type="button"
            data-testid="platforms-rescan-btn"
            disabled={isScanning}
            onClick={() => void triggerGameScan()}
            className="h-10 px-4 rounded-lg bg-ms-card hover:bg-ms-elevated disabled:opacity-60 border border-ms-border text-ms-text text-sm font-semibold inline-flex items-center gap-2 transition-colors shadow-sm"
          >
            <RefreshCw
              className={`w-4 h-4 text-ms-muted ${
                isScanning ? 'animate-spin' : ''
              }`}
            />
            <span>{isScanning ? 'Scanning...' : 'Scan All Launchers'}</span>
          </button>
        </div>
      </div>

      {/* Grid of Platform Cards */}
      <section
        aria-label="Supported Gaming Platforms"
        className="grid grid-cols-1 md:grid-cols-2 gap-5"
      >
        {displayedPlatforms.map((platform) => {
          const liveReport = platformReports.find(
            (r) => r.platformId === platform.id
          );
          const platformGames = games.filter((g) => g.platformId === platform.id);
          const isDetected = liveReport?.status === 'detected' || platformGames.length > 0;
          const detectedCount = platformGames.length;
          const isFav = favoritePlatformIds.includes(platform.id);

          const activeCapabilities: string[] = [];
          if (isCapabilitySupported(platform.capabilities.installedScan)) {
            activeCapabilities.push('Installed Scan');
          }
          if (isCapabilitySupported(platform.capabilities.gameLaunch)) {
            activeCapabilities.push('Direct Launch');
          }
          if (isCapabilitySupported(platform.capabilities.playtimeTracking)) {
            activeCapabilities.push('Playtime Tracking');
          }
          if (isCapabilitySupported(platform.capabilities.multiAccountSwitch)) {
            activeCapabilities.push('Account Switcher');
          }

          return (
            <div
              key={platform.id}
              data-testid={`platform-card-${platform.id}`}
              className="rounded-2xl bg-ms-card border border-ms-border/80 p-6 flex flex-col justify-between gap-5 hover:border-ms-muted/60 transition-all shadow-card group"
            >
              {/* Top Row: Authentic Logo, Name, Detection Status */}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-ms-elevated border border-ms-border flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                      <PlatformLogo platformId={platform.id} size={32} colorMode="brand" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-ms-text tracking-tight">
                          {platform.name}
                        </h2>
                        <button
                          type="button"
                          data-testid={`favorite-platform-${platform.id}`}
                          onClick={() => void togglePlatformFavorite(platform.id)}
                          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                          className={`p-1 rounded-md transition-colors ${
                            isFav
                              ? 'text-amber-400 hover:text-amber-300'
                              : 'text-ms-muted/50 hover:text-amber-400'
                          }`}
                        >
                          <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400' : ''}`} />
                        </button>
                      </div>
                      <p className="text-xs text-ms-muted">
                        {platform.vendor}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                      isDetected
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-ms-bg text-ms-muted border-ms-border'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isDetected ? 'bg-emerald-400 animate-pulse' : 'bg-ms-muted/60'
                      }`}
                    />
                    {isDetected
                      ? `Detected (${detectedCount} game${detectedCount === 1 ? '' : 's'})`
                      : 'Not Detected'}
                  </span>
                </div>

                <p className="text-xs text-ms-muted leading-relaxed">
                  {liveReport?.limitationNote
                    ? liveReport.limitationNote
                    : platform.description}
                </p>

                {/* Capabilities pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {activeCapabilities.map((cap) => (
                    <span
                      key={cap}
                      className="px-2.5 py-0.5 rounded-md bg-ms-bg border border-ms-border/80 text-[11px] font-medium text-ms-muted"
                    >
                      {cap}
                    </span>
                  ))}
                </div>

                {liveReport?.detectedInstallPath && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[11px] font-mono text-ms-muted/80 truncate block bg-ms-bg p-2 rounded-lg border border-ms-border/60">
                      {liveReport.detectedInstallPath}
                    </span>
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-ms-border/60">
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={() => void triggerGameScan()}
                  className="h-9 px-3.5 rounded-lg bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`}
                  />
                  <span>Scan</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleInspectPlatformLibrary(platform.id)}
                  className="h-9 px-4 rounded-lg bg-ms-elevated hover:bg-ms-border border border-ms-border text-ms-text text-xs font-semibold inline-flex items-center gap-2 transition-colors"
                >
                  <span>View Games</span>
                  <ArrowRight className="w-3.5 h-3.5 text-ms-muted" />
                </button>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
};
