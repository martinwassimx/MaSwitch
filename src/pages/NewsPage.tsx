import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  Newspaper,
  RefreshCw,
  Search,
  WifiOff,
  Calendar,
  Gamepad2,
  Clock,
  SlidersHorizontal,
  X,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { PlatformId } from '../shared/types/platform';
import type { GameItem } from '../shared/types/game';
import type {
  GameNewsCoverageItem,
  GameNewsItem,
  NewsProviderStatus,
  NewsSortMode,
} from '../shared/types/news';

const INITIAL_VISIBLE_COUNT = 13; // 1 featured + 12 grid cards (divisible by 2 and 3)
const LOAD_MORE_STEP = 12;

const PLATFORM_LABELS: Record<string, string> = {
  steam: 'Steam',
  riot: 'Riot Games',
  epic: 'Epic Games',
  ea: 'EA App',
  ubisoft: 'Ubisoft Connect',
  gog: 'GOG Galaxy',
  xbox: 'Xbox PC',
  battlenet: 'Battle.net',
  custom: 'Custom PC',
};

function formatPlatformLabel(platformId: string): string {
  return PLATFORM_LABELS[platformId] || platformId.toUpperCase();
}

function formatArticleDate(iso: string): string {
  const pubDate = new Date(iso);
  const pubMs = pubDate.getTime();
  if (Number.isNaN(pubMs)) return 'Recent';
  return pubDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function resolveCardArtwork(
  article: GameNewsItem,
  matchedGame?: GameItem
): { url?: string; isSmallIcon: boolean } {
  // Prefer wide article/hero banner first so 16:9 containers look crisp without vertical cropping
  const wideCandidate =
    article.articleImageUrl ||
    matchedGame?.userHeroOverride ||
    matchedGame?.heroBackgroundImage;
  if (wideCandidate) {
    return { url: wideCandidate, isSmallIcon: false };
  }

  const coverCandidate =
    matchedGame?.userCoverOverride ||
    matchedGame?.coverImage ||
    article.gameCoverUrl;
  if (coverCandidate) {
    const isIconPath =
      coverCandidate.endsWith('.ico') || coverCandidate.includes('_icon_');
    return { url: coverCandidate, isSmallIcon: isIconPath };
  }

  const iconCandidate =
    matchedGame?.userIconOverride || matchedGame?.iconImage;
  if (iconCandidate) {
    return { url: iconCandidate, isSmallIcon: true };
  }

  return { url: undefined, isSmallIcon: false };
}

function getCoverageStatusMeta(status: NewsProviderStatus): {
  label: string;
  badgeClass: string;
  dotClass: string;
} {
  switch (status) {
    case 'available':
      return {
        label: 'Available',
        badgeClass:
          'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
        dotClass: 'bg-emerald-400',
      };
    case 'no-articles':
      return {
        label: 'No Articles',
        badgeClass: 'bg-sky-500/10 text-sky-300 border-sky-500/25',
        dotClass: 'bg-sky-400',
      };
    case 'temporarily-unavailable':
      return {
        label: 'Unavailable',
        badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
        dotClass: 'bg-amber-400',
      };
    case 'refresh-failed':
      return {
        label: 'Refresh Failed',
        badgeClass: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
        dotClass: 'bg-rose-400',
      };
    case 'unsupported':
    default:
      return {
        label: 'Unsupported',
        badgeClass: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/25',
        dotClass: 'bg-zinc-500',
      };
  }
}

interface FeaturedNewsCardProps {
  article: GameNewsItem;
  matchedGame?: GameItem;
  onOpenArticle: (url: string) => void;
}

const FeaturedNewsCard: React.FC<FeaturedNewsCardProps> = memo(
  ({ article, matchedGame, onOpenArticle }) => {
    const [imgFailed, setImgFailed] = useState(false);
    const { url: artworkUrl, isSmallIcon } = resolveCardArtwork(
      article,
      matchedGame
    );
    const showArtwork = Boolean(artworkUrl) && !imgFailed;
    const dateLabel = formatArticleDate(article.publishedAtIso);

    return (
      <article
        data-testid="news-featured-card"
        className="rounded-2xl bg-ms-card border border-ms-border/90 hover:border-violet-500/40 overflow-hidden transition-colors duration-150 motion-reduce:transition-none"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Featured Artwork */}
          <div className="lg:col-span-5 relative h-44 sm:h-48 lg:h-[196px] bg-ms-elevated border-b lg:border-b-0 lg:border-r border-ms-border/60 overflow-hidden flex items-center justify-center ring-1 ring-inset ring-white/5">
            {showArtwork ? (
              isSmallIcon ? (
                <div className="flex flex-col items-center justify-center gap-2.5 p-6 text-center">
                  <img
                    src={artworkUrl}
                    alt={article.gameTitle}
                    decoding="async"
                    onError={() => setImgFailed(true)}
                    className="w-16 h-16 object-contain rounded-xl"
                  />
                  <span className="text-xs font-semibold text-ms-muted">
                    {article.gameTitle}
                  </span>
                </div>
              ) : (
                <img
                  src={artworkUrl}
                  alt={article.gameTitle}
                  decoding="async"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-cover object-center"
                />
              )
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
                <Gamepad2 className="w-10 h-10 text-violet-400/80" />
                <span className="text-xs font-bold text-ms-text">
                  {article.gameTitle}
                </span>
              </div>
            )}
          </div>

          {/* Featured Content */}
          <div className="lg:col-span-7 p-4 sm:p-5 flex flex-col justify-between gap-3 min-w-0">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ms-muted">
                <span className="px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/30 text-violet-300 font-semibold text-[11px]">
                  Featured
                </span>
                <span className="font-bold text-ms-text truncate max-w-[220px]">
                  {article.gameTitle}
                </span>
                <span>•</span>
                <span>{formatPlatformLabel(article.platformId)}</span>
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-ms-muted">
                  <Calendar className="w-3 h-3 text-violet-400/80" />
                  <span>{dateLabel}</span>
                </span>
              </div>

              <h2 className="text-lg sm:text-xl font-extrabold text-ms-text leading-snug line-clamp-2">
                {article.headline}
              </h2>

              <p className="text-xs sm:text-sm text-ms-muted leading-relaxed line-clamp-3">
                {article.summary}
              </p>
            </div>

            <div className="pt-3 border-t border-ms-border/50 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-ms-muted truncate max-w-[65%]">
                Source:{' '}
                <strong className="text-ms-text font-semibold">
                  {article.source}
                </strong>
              </span>

              {article.url ? (
                <button
                  type="button"
                  data-testid={`news-open-btn-${article.id}`}
                  onClick={() => onOpenArticle(article.url)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none cursor-pointer shrink-0"
                >
                  <span>Read Article</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              ) : (
                <span className="text-[11px] text-ms-muted">
                  No external link
                </span>
              )}
            </div>
          </div>
        </div>
      </article>
    );
  }
);
FeaturedNewsCard.displayName = 'FeaturedNewsCard';

interface NewsFeedCardProps {
  article: GameNewsItem;
  matchedGame?: GameItem;
  onOpenArticle: (url: string) => void;
}

const NewsFeedCard: React.FC<NewsFeedCardProps> = memo(
  ({ article, matchedGame, onOpenArticle }) => {
    const [imgFailed, setImgFailed] = useState(false);
    const { url: artworkUrl, isSmallIcon } = resolveCardArtwork(
      article,
      matchedGame
    );
    const showArtwork = Boolean(artworkUrl) && !imgFailed;
    const dateLabel = formatArticleDate(article.publishedAtIso);

    return (
      <article
        data-testid={`news-card-${article.id}`}
        className="rounded-2xl bg-ms-card border border-ms-border/80 hover:border-violet-500/40 overflow-hidden flex flex-col justify-between transition-colors duration-150 motion-reduce:transition-none group"
      >
        <div>
          {/* Consistent Artwork Header */}
          <div className="relative w-full h-36 sm:h-40 bg-ms-elevated border-b border-ms-border/50 overflow-hidden flex items-center justify-center ring-1 ring-inset ring-white/5">
            {showArtwork ? (
              isSmallIcon ? (
                <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                  <img
                    src={artworkUrl}
                    alt={article.gameTitle}
                    loading="lazy"
                    decoding="async"
                    onError={() => setImgFailed(true)}
                    className="w-14 h-14 object-contain rounded-xl"
                  />
                  <span className="text-[11px] font-semibold text-ms-muted truncate max-w-[200px]">
                    {article.gameTitle}
                  </span>
                </div>
              ) : (
                <img
                  src={artworkUrl}
                  alt={article.gameTitle}
                  loading="lazy"
                  decoding="async"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-cover object-center"
                />
              )
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 p-4 text-center">
                <Gamepad2 className="w-8 h-8 text-violet-400/80" />
                <span className="text-xs font-bold text-ms-text line-clamp-1">
                  {article.gameTitle}
                </span>
              </div>
            )}
          </div>

          {/* Card Body */}
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px] text-ms-muted">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-bold text-violet-300 truncate">
                  {article.gameTitle}
                </span>
                <span className="shrink-0">•</span>
                <span className="shrink-0">
                  {formatPlatformLabel(article.platformId)}
                </span>
              </div>
              <span className="shrink-0 text-ms-muted">{dateLabel}</span>
            </div>

            <h3 className="text-sm font-bold text-ms-text group-hover:text-violet-300 transition-colors duration-150 motion-reduce:transition-none leading-snug line-clamp-2">
              {article.headline}
            </h3>

            <p className="text-xs text-ms-muted leading-relaxed line-clamp-2">
              {article.summary}
            </p>
          </div>
        </div>

        {/* Card Footer */}
        <div className="px-4 py-3 border-t border-ms-border/40 flex items-center justify-between gap-2 text-[11px]">
          <span className="text-ms-muted truncate">
            {article.source}
          </span>

          {article.url ? (
            <button
              type="button"
              data-testid={`news-open-btn-${article.id}`}
              onClick={() => onOpenArticle(article.url)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-ms-elevated hover:bg-violet-600 hover:text-white text-violet-300 font-semibold transition-colors duration-150 motion-reduce:transition-none cursor-pointer shrink-0"
            >
              <span>Open Article</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          ) : (
            <span className="text-ms-muted shrink-0">No link</span>
          )}
        </div>
      </article>
    );
  }
);
NewsFeedCard.displayName = 'NewsFeedCard';

export const NewsPage: React.FC = () => {
  const newsFeed = useAppStore((s) => s.newsFeed);
  const newsLoading = useAppStore((s) => s.newsLoading);
  const loadNews = useAppStore((s) => s.loadNews);
  const newsFilterGameId = useAppStore((s) => s.newsFilterGameId);
  const newsFilterPlatformId = useAppStore((s) => s.newsFilterPlatformId);
  const setNewsFilterGameId = useAppStore((s) => s.setNewsFilterGameId);
  const setNewsFilterPlatformId = useAppStore((s) => s.setNewsFilterPlatformId);
  const openNewsArticle = useAppStore((s) => s.openNewsArticle);
  const games = useAppStore((s) => s.games);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState<NewsSortMode>('newest');
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_VISIBLE_COUNT);
  const [coverageExpanded, setCoverageExpanded] = useState<boolean>(false);

  // Fetch only when the Game News page opens or when manually refreshed
  useEffect(() => {
    void loadNews();
  }, [loadNews]);

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [searchTerm, newsFilterGameId, newsFilterPlatformId, sortMode]);

  const handleOpenArticle = useCallback(
    (url: string) => {
      void openNewsArticle(url);
    },
    [openNewsArticle]
  );

  const gameById = useMemo(() => {
    const map = new Map<string, GameItem>();
    for (const g of games) {
      map.set(g.id, g);
    }
    return map;
  }, [games]);

  const coverageList: GameNewsCoverageItem[] = useMemo(() => {
    if (newsFeed?.gameCoverage && newsFeed.gameCoverage.length > 0) {
      return newsFeed.gameCoverage;
    }
    return games.map((g) => ({
      gameId: g.id,
      gameTitle: g.title,
      platformId: g.platformId,
      gameCoverUrl: g.coverImage,
      providerId: 'unknown',
      providerName: formatPlatformLabel(g.platformId),
      status: 'available' as NewsProviderStatus,
      articleCount: (newsFeed?.articles ?? []).filter((a) => a.gameId === g.id)
        .length,
      statusMessage: '',
    }));
  }, [newsFeed, games]);

  const selectedGameCoverage = useMemo(() => {
    if (!newsFilterGameId) return null;
    return coverageList.find((c) => c.gameId === newsFilterGameId) ?? null;
  }, [coverageList, newsFilterGameId]);

  const selectedGameObj = useMemo(() => {
    if (!newsFilterGameId) return null;
    return gameById.get(newsFilterGameId) ?? null;
  }, [gameById, newsFilterGameId]);

  const articles = useMemo(() => newsFeed?.articles ?? [], [newsFeed]);

  const filteredAndSortedArticles = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    const filtered = articles.filter((art) => {
      if (newsFilterGameId && art.gameId !== newsFilterGameId) {
        return false;
      }
      if (newsFilterPlatformId && art.platformId !== newsFilterPlatformId) {
        return false;
      }
      if (query) {
        const match =
          art.headline.toLowerCase().includes(query) ||
          art.summary.toLowerCase().includes(query) ||
          art.gameTitle.toLowerCase().includes(query) ||
          (art.source && art.source.toLowerCase().includes(query)) ||
          (art.category && art.category.toLowerCase().includes(query));
        if (!match) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    if (sortMode === 'by-game') {
      sorted.sort((a, b) => {
        const titleCmp = a.gameTitle.localeCompare(b.gameTitle);
        if (titleCmp !== 0) return titleCmp;
        return Date.parse(b.publishedAtIso) - Date.parse(a.publishedAtIso);
      });
    } else if (sortMode === 'recent-updates') {
      sorted.sort((a, b) => {
        const aUpdate = a.isUpdate ? 1 : 0;
        const bUpdate = b.isUpdate ? 1 : 0;
        if (aUpdate !== bUpdate) return bUpdate - aUpdate;
        return Date.parse(b.publishedAtIso) - Date.parse(a.publishedAtIso);
      });
    } else {
      sorted.sort(
        (a, b) => Date.parse(b.publishedAtIso) - Date.parse(a.publishedAtIso)
      );
    }

    return sorted;
  }, [articles, newsFilterGameId, newsFilterPlatformId, searchTerm, sortMode]);

  const featuredArticle = useMemo(
    () => filteredAndSortedArticles[0] ?? null,
    [filteredAndSortedArticles]
  );

  const gridArticles = useMemo(
    () => filteredAndSortedArticles.slice(1, visibleCount),
    [filteredAndSortedArticles, visibleCount]
  );

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
      newsFilterGameId ||
      newsFilterPlatformId ||
      sortMode !== 'newest'
  );

  const handleClearFilters = useCallback(() => {
    setSearchTerm('');
    setSortMode('newest');
    if (newsFilterGameId) setNewsFilterGameId(null);
    if (newsFilterPlatformId) setNewsFilterPlatformId(null);
  }, [newsFilterGameId, newsFilterPlatformId, setNewsFilterGameId, setNewsFilterPlatformId]);

  const coverageStats = useMemo(() => {
    let available = 0;
    let unsupported = 0;
    let failed = 0;
    for (const item of coverageList) {
      if (item.status === 'available') available++;
      else if (item.status === 'unsupported') unsupported++;
      else if (item.status !== 'no-articles') failed++;
    }
    return { available, unsupported, failed };
  }, [coverageList]);

  return (
    <div
      data-testid="page-game-news"
      className="max-w-7xl mx-auto space-y-5 pb-14 select-none"
    >
      {/* Compact Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ms-border/60 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ms-text">
            Game News
          </h1>
          <p className="text-xs text-ms-muted mt-0.5">
            Official updates, patch notes, and announcements for games in your library
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 whitespace-nowrap">
          {games.length > 0 && (
            <button
              type="button"
              data-testid="news-coverage-toggle-btn"
              onClick={() => setCoverageExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text transition-colors duration-150 motion-reduce:transition-none cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{coverageStats.available} Sources</span>
              {coverageExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          )}

          {newsFeed?.lastUpdatedIso && (
            <span
              data-testid="news-last-updated"
              className="text-[11px] text-ms-muted inline-flex items-center gap-1.5 bg-ms-card border border-ms-border/70 px-2.5 py-1.5 rounded-xl"
            >
              <Clock className="w-3.5 h-3.5 text-violet-400" />
              <span>
                Updated{' '}
                {new Date(newsFeed.lastUpdatedIso).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </span>
          )}

          <button
            type="button"
            data-testid="news-refresh-btn"
            disabled={newsLoading}
            onClick={() => void loadNews({ forceRefresh: true })}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white transition-colors duration-150 motion-reduce:transition-none cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${newsLoading ? 'animate-spin' : ''}`}
            />
            <span>{newsLoading ? 'Refreshing...' : 'Refresh Feed'}</span>
          </button>
        </div>
      </header>

      {/* Collapsible Library Coverage Drawer */}
      {coverageExpanded && games.length > 0 && (
        <section
          data-testid="news-coverage-section"
          className="p-4 rounded-2xl bg-ms-card border border-ms-border/80 space-y-3"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 font-bold text-ms-text">
              <Layers className="w-3.5 h-3.5 text-violet-400" />
              <span>Library News Coverage ({coverageList.length} Games)</span>
            </span>
            <span className="text-ms-muted text-[11px]">
              Click any game to filter its feed
            </span>
          </div>
          <div
            data-testid="news-coverage-list"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2"
          >
            {coverageList.map((item) => {
              const meta = getCoverageStatusMeta(item.status);
              const isSelected = newsFilterGameId === item.gameId;
              return (
                <button
                  key={item.gameId}
                  type="button"
                  data-testid={`news-coverage-item-${item.gameId}`}
                  onClick={() =>
                    setNewsFilterGameId(isSelected ? null : item.gameId)
                  }
                  className={`p-2.5 rounded-xl border text-left transition-colors duration-150 motion-reduce:transition-none flex items-center justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-violet-600/15 border-violet-500/50'
                      : 'bg-ms-elevated/40 hover:bg-ms-elevated/80 border-ms-border/60'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-ms-text truncate">
                        {item.gameTitle}
                      </span>
                      {item.isUtilityExcluded && (
                        <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-zinc-500/20 text-zinc-300 shrink-0">
                          Utility
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-ms-muted truncate mt-0.5">
                      {formatPlatformLabel(item.platformId)} •{' '}
                      {item.providerName}
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${meta.badgeClass}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`}
                    />
                    <span>
                      {item.status === 'available'
                        ? `${item.articleCount}`
                        : meta.label}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Offline or Provider Failure Banner */}
      {(newsFeed?.isOffline || newsFeed?.refreshError) && (
        <div
          data-testid="news-status-banner"
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            newsFeed?.isOffline
              ? 'bg-amber-500/10 border-amber-500/25 text-amber-200'
              : 'bg-violet-500/10 border-violet-500/25 text-violet-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {newsFeed?.isOffline ? (
              <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-violet-400" />
            )}
            <span>
              {newsFeed.refreshError ||
                'Offline mode. Displaying cached news articles.'}
            </span>
          </div>
          <button
            type="button"
            disabled={newsLoading}
            onClick={() => void loadNews({ forceRefresh: true })}
            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-semibold shrink-0 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Unified Compact Filter Toolbar */}
      <div
        data-testid="news-filter-toolbar"
        className="p-2.5 rounded-2xl bg-ms-card border border-ms-border/80 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5"
      >
        {/* Search Input */}
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-ms-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            data-testid="news-search-input"
            placeholder="Search news by game, headline, or summary..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-9 pl-9 pr-8 text-xs bg-ms-elevated/60 border border-ms-border/80 rounded-xl text-ms-text placeholder:text-ms-muted focus:outline-none focus:border-violet-500"
          />
          {searchTerm && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ms-muted hover:text-ms-text cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            data-testid="news-game-filter"
            value={newsFilterGameId ?? ''}
            onChange={(e) => setNewsFilterGameId(e.target.value || null)}
            className="h-9 px-3 text-xs font-semibold bg-ms-elevated/60 border border-ms-border/80 rounded-xl text-ms-text focus:outline-none focus:border-violet-500 cursor-pointer max-w-[200px] truncate"
          >
            <option value="" className="bg-ms-card text-ms-text">
              All Library Games
            </option>
            {games.map((g) => (
              <option
                key={g.id}
                value={g.id}
                className="bg-ms-card text-ms-text"
              >
                {g.title}
              </option>
            ))}
          </select>

          <select
            data-testid="news-platform-filter"
            value={newsFilterPlatformId ?? ''}
            onChange={(e) =>
              setNewsFilterPlatformId((e.target.value as PlatformId) || null)
            }
            className="h-9 px-3 text-xs font-semibold bg-ms-elevated/60 border border-ms-border/80 rounded-xl text-ms-text focus:outline-none focus:border-violet-500 cursor-pointer"
          >
            <option value="" className="bg-ms-card text-ms-text">
              All Platforms
            </option>
            <option value="riot" className="bg-ms-card text-ms-text">
              Riot Games
            </option>
            <option value="epic" className="bg-ms-card text-ms-text">
              Epic Games
            </option>
            <option value="ea" className="bg-ms-card text-ms-text">
              EA App
            </option>
            <option value="steam" className="bg-ms-card text-ms-text">
              Steam
            </option>
            <option value="ubisoft" className="bg-ms-card text-ms-text">
              Ubisoft Connect
            </option>
            <option value="gog" className="bg-ms-card text-ms-text">
              GOG Galaxy
            </option>
            <option value="custom" className="bg-ms-card text-ms-text">
              Custom PC
            </option>
          </select>

          <div className="inline-flex items-center gap-1.5 bg-ms-elevated/60 border border-ms-border/80 rounded-xl px-2.5 h-9">
            <SlidersHorizontal className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <select
              data-testid="news-sort-filter"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as NewsSortMode)}
              className="bg-transparent text-xs font-semibold text-ms-text focus:outline-none cursor-pointer"
            >
              <option value="newest" className="bg-ms-card text-ms-text">
                Newest First
              </option>
              <option value="recent-updates" className="bg-ms-card text-ms-text">
                Recent Updates
              </option>
              <option value="by-game" className="bg-ms-card text-ms-text">
                By Game
              </option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              data-testid="news-clear-filters-btn"
              onClick={handleClearFilters}
              className="h-9 px-3 rounded-xl text-xs font-semibold bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 text-violet-300 inline-flex items-center gap-1.5 transition-colors duration-150 motion-reduce:transition-none cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area: Skeleton, Featured + Responsive Card Grid, or Empty State */}
      {newsLoading && articles.length === 0 ? (
        <div data-testid="news-loading-skeleton" className="space-y-5">
          <div className="h-52 rounded-2xl bg-ms-card border border-ms-border/60 p-5 flex flex-col lg:flex-row gap-5">
            <div className="w-full lg:w-2/5 h-36 lg:h-full rounded-xl bg-ms-elevated" />
            <div className="flex-1 space-y-3 py-2">
              <div className="h-4 w-32 rounded bg-ms-elevated" />
              <div className="h-6 w-3/4 rounded bg-ms-elevated" />
              <div className="h-4 w-full rounded bg-ms-elevated" />
              <div className="h-4 w-2/3 rounded bg-ms-elevated" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="rounded-2xl bg-ms-card border border-ms-border/60 overflow-hidden"
              >
                <div className="aspect-[16/9] bg-ms-elevated" />
                <div className="p-4 space-y-2.5">
                  <div className="h-3.5 w-28 rounded bg-ms-elevated" />
                  <div className="h-4 w-4/5 rounded bg-ms-elevated" />
                  <div className="h-3.5 w-full rounded bg-ms-elevated" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : featuredArticle ? (
        <div className="space-y-5">
          {/* Featured Top Article */}
          <FeaturedNewsCard
            article={featuredArticle}
            matchedGame={gameById.get(featuredArticle.gameId)}
            onOpenArticle={handleOpenArticle}
          />

          {/* Responsive News Card Grid (1 col narrow, 2 cols desktop default, 3 cols wide) */}
          {gridArticles.length > 0 && (
            <div
              data-testid="news-feed-grid"
              className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4"
            >
              {gridArticles.map((article) => (
                <NewsFeedCard
                  key={article.id}
                  article={article}
                  matchedGame={gameById.get(article.gameId)}
                  onOpenArticle={handleOpenArticle}
                />
              ))}
            </div>
          )}

          {/* Incremental Pagination */}
          {filteredAndSortedArticles.length > visibleCount && (
            <div className="pt-2 text-center">
              <button
                type="button"
                data-testid="news-load-more-btn"
                onClick={() =>
                  setVisibleCount((prev) => prev + LOAD_MORE_STEP)
                }
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-text transition-colors duration-150 motion-reduce:transition-none cursor-pointer"
              >
                <span>
                  Load More Articles (
                  {filteredAndSortedArticles.length - visibleCount} remaining)
                </span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Empty / Unsupported State */
        <div
          data-testid="news-empty-state"
          className="p-10 text-center rounded-2xl bg-ms-card border border-ms-border/70 max-w-lg mx-auto space-y-3"
        >
          <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto text-violet-400">
            <Newspaper className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-ms-text">
              {selectedGameCoverage?.status === 'unsupported'
                ? selectedGameObj?.title || 'Unsupported Game'
                : 'No News Available'}
            </h3>
            <p
              data-testid="news-empty-message"
              className="text-xs text-ms-muted max-w-sm mx-auto leading-relaxed"
            >
              {selectedGameCoverage?.status === 'unsupported'
                ? 'No supported news source available for this game.'
                : selectedGameCoverage?.status === 'temporarily-unavailable' ||
                  selectedGameCoverage?.status === 'refresh-failed'
                ? selectedGameCoverage.statusMessage ||
                  'News provider is temporarily unavailable for this game.'
                : hasActiveFilters
                ? 'No updates match your selected filters. Try clearing filters.'
                : 'No official updates were found for your installed library games.'}
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors duration-150 motion-reduce:transition-none cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset All Filters</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
