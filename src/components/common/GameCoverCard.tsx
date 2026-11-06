import React, { useEffect, useState } from 'react';
import { Star, Play, Loader2 } from 'lucide-react';
import type { GameItem, GameLaunchState } from '../../shared/types/game';
import { PlatformBadge } from './PlatformBadge';
import { PlatformLogo } from '../platforms/PlatformLogo';

interface GameCoverCardProps {
  game: GameItem;
  isFavorite: boolean;
  isSelected?: boolean;
  compact?: boolean;
  launchState?: GameLaunchState;
  onSelect?: (gameId: string) => void;
  onOpenDetails: (gameId: string) => void;
  onToggleFavorite: (gameId: string) => void;
  onLaunchGame?: (gameId: string) => void;
}

export const GameCoverCard: React.FC<GameCoverCardProps> = React.memo(({
  game,
  isFavorite,
  isSelected = false,
  compact: _compact = false,
  launchState = 'idle',
  onSelect,
  onOpenDetails,
  onToggleFavorite,
  onLaunchGame,
}) => {
  const [imageError, setImageError] = useState(false);
  const [iconError, setIconError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [game.coverImage]);

  useEffect(() => {
    setIconError(false);
  }, [game.iconImage]);

  const canQuickLaunch =
    Boolean(onLaunchGame) && game.isInstalled && !game.isDemoData;

  const formatPlaytime = (hours: number) => {
    if (hours <= 0) {
      return null;
    }
    return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
  };

  const playtimeLabel = formatPlaytime(game.playtimeHours);

  return (
    <div
      data-testid={`game-card-${game.id}`}
      onClick={() => {
        if (onSelect) {
          onSelect(game.id);
        } else {
          onOpenDetails(game.id);
        }
      }}
      onDoubleClick={() => onOpenDetails(game.id)}
      className="group cursor-pointer flex flex-col select-none"
    >
      {/* Cover Image or Neutral Cartridge Fallback */}
      <div
        className={`relative w-full overflow-hidden rounded-xl bg-ms-card border transition-colors duration-200 aspect-[2/3] ${
          isSelected
            ? 'border-violet-500 ring-2 ring-violet-500/40'
            : 'border-ms-border group-hover:border-violet-500/50'
        }`}
      >
        {!imageError && game.coverImage ? (
          <img
            src={game.coverImage}
            alt={game.title}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          /* Stylized Neutral Cartridge Fallback */
          <div className="w-full h-full bg-gradient-to-b from-[#1c1f26] via-[#14161b] to-[#0e1014] flex flex-col items-center justify-center p-4 text-center">
            <div className="flex flex-col items-center gap-3 pt-4">
              {game.iconImage && !iconError ? (
                <img
                  src={game.iconImage}
                  alt=""
                  onError={() => setIconError(true)}
                  className="w-12 h-12 rounded-xl object-contain transition-transform duration-200 group-hover:scale-105"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-ms-elevated border border-ms-border/70 flex items-center justify-center text-ms-muted transition-transform duration-200 group-hover:scale-105">
                  <PlatformLogo platformId={game.platformId} size="lg" />
                </div>
              )}
              <span className="text-xs font-semibold text-ms-text/90 line-clamp-3 px-2 leading-relaxed">
                {game.title}
              </span>
            </div>
          </div>
        )}

        {/* Subtle hover vignette for controls */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />

        {/* Platform Badge on top-left of cover */}
        <div className="absolute top-2.5 left-2.5 pointer-events-none">
          <PlatformBadge platformId={game.platformId} size="xs" />
        </div>

        {/* Favorite toggle (visible when favorited or on hover) */}
        <button
          type="button"
          aria-label={
            isFavorite
              ? `Remove ${game.title} from favorites`
              : `Add ${game.title} to favorites`
          }
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(game.id);
          }}
          className={`absolute top-2.5 right-2.5 w-8 h-8 rounded-lg flex items-center justify-center transition-opacity duration-150 ${
            isFavorite
              ? 'opacity-100 bg-[#0d0f14]/90 text-amber-400 border border-amber-400/30'
              : 'opacity-0 group-hover:opacity-100 bg-[#0d0f14]/85 text-ms-muted hover:text-ms-text border border-ms-border/80'
          }`}
        >
          <Star
            className={`w-4 h-4 ${
              isFavorite ? 'fill-amber-400 text-amber-400' : ''
            }`}
          />
        </button>

        {/* Running status pill or Quick Play button on hover */}
        {launchState === 'running' ? (
          <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between px-3 py-1.5 rounded-lg bg-emerald-950/95 border border-emerald-500/40 text-xs font-semibold text-emerald-400">
            <span className="inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Running
            </span>
          </div>
        ) : (
          canQuickLaunch && (
            <div className="absolute bottom-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <button
                type="button"
                data-testid={`card-launch-${game.id}`}
                aria-label={`Launch ${game.title}`}
                disabled={launchState === 'launching'}
                onClick={(e) => {
                  e.stopPropagation();
                  onLaunchGame?.(game.id);
                }}
                className="h-9 px-3.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60 transition-transform active:scale-95"
              >
                {launchState === 'launching' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Play</span>
              </button>
            </div>
          )
        )}
      </div>

      {/* Metadata Below Cover */}
      <div className="pt-2.5 px-0.5 space-y-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <h3 className="text-sm font-semibold text-ms-text truncate tracking-tight group-hover:text-white transition-colors">
            {game.title}
          </h3>
          {game.isInstalled && (
            <span
              title="Installed locally"
              className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-ms-muted">
          <span className="truncate text-ms-muted/80">{game.platformName}</span>
          {playtimeLabel && (
            <span className="tabular-nums text-xs font-medium text-ms-muted/90 shrink-0">
              {playtimeLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
