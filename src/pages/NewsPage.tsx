import React, { useEffect, useMemo, useState } from 'react';
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
  HelpCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { PlatformId } from '../shared/types/platform';
import type {
  GameNewsCoverageItem,
  NewsProviderStatus,
  NewsSortMode,
} from '../shared/types/news';

const INITIAL_VISIBLE_COUNT = 12;
const LOAD_MORE_STEP = 12;
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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

function formatRelativeAge(dateMs: number): string {
  if (Number.isNaN(dateMs)) return '';
  const diffMs = Math.max(0, Date.now() - dateMs);
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}y ago`;
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
        label: 'Temporarily Unavailable',
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
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // Fetch only when the Game News page opens or when manually refreshed
  useEffect(() => {
    void loadNews();
  }, [loadNews]);

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [searchTerm, newsFilterGameId, newsFilterPlatformId, sortMode]);

  const gameById = useMemo(() => {
    const map = new Map<string, (typeof games)[number]>();
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
      // 'newest'
      sorted.sort(
        (a, b) => Date.parse(b.publishedAtIso) - Date.parse(a.publishedAtIso)
      );
    }

    return sorted;
  }, [articles, newsFilterGameId, newsFilterPlatformId, searchTerm, sortMode]);

  const visibleArticles = useMemo(
    () => filteredAndSortedArticles.slice(0, visibleCount),
    [filteredAndSortedArticles, visibleCount]
  );

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
      newsFilterGameId ||
      newsFilterPlatformId ||
      sortMode !== 'newest'
  );

  const handleClearFilters = () => {
    setSearchTerm('');
    setSortMode('newest');
    if (newsFilterGameId) setNewsFilterGameId(null);
    if (newsFilterPlatformId) setNewsFilterPlatformId(null);
  };

  const coverageStats = useMemo(() => {
    let available = 0;
    let noArticles = 0;
    let unsupported = 0;
    let failed = 0;
    for (const item of coverageList) {
      if (item.status === 'available') available++;
      else if (item.status === 'no-articles') noArticles++;
      else if (item.status === 'unsupported') unsupported++;
      else failed++;
    }
    return { available, noArticles, unsupported, failed };
  }, [coverageList]);

  const distinctPlatformsInFeed = useMemo(() => {
    const set = new Set<string>();
    for (const a of filteredAndSortedArticles) {
      set.add(a.platformId);
    }
    return set.size;
  }, [filteredAndSortedArticles]);

  const distinctGamesInFeed = useMemo(() => {
    const set = new Set<string>();
    for (const a of filteredAndSortedArticles) {
      set.add(a.gameId);
    }
    return set.size;
  }, [filteredAndSortedArticles]);

  return (
    <div
      data-testid="page-game-news"
      className="max-w-6xl mx-auto space-y-6 pb-16 animate-fadeIn select-none"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ms-border/60 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold uppercase tracking-wider mb-2">
            <Newspaper className="w-3.5 h-3.5 text-violet-400" />
            <span>Multi-Platform Game News & Updates</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ms-text">
            Game Updates & News
          </h1>
          <p className="text-xs text-ms-muted mt-1">
            Official publisher announcements, patch notes, and live events personalized for your local game library
          </p>
        </div>

        {/* Refresh & Last Updated Timestamp */}
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {newsFeed?.lastUpdatedIso && (
            <span
              data-testid="news-last-updated"
              className="text-[11px] text-ms-muted flex items-center gap-1.5 bg-ms-card/70 border border-ms-border/60 px-2.5 py-1.5 rounded-lg"
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-violet-600/20 hover:bg-violet-600/30 disabled:opacity-60 border border-violet-500/30 text-violet-200 shadow-sm transition-all cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${newsLoading ? 'animate-spin' : ''}`}
            />
            <span>{newsLoading ? 'Refreshing...' : 'Refresh Feed'}</span>
          </button>
        </div>
      </div>

      {/* Offline or Provider Failure Banner */}
      {(newsFeed?.isOffline || newsFeed?.refreshError) && (
        <div
          data-testid="news-status-banner"
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            newsFeed?.isOffline
              ? 'bg-amber-500/10 border-amber-500/25 text-amber-200'
              : 'bg-violet-500/10 border-violet-500/25 text-violet-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {newsFeed?.isOffline ? (
              <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-violet-400" />
            )}
            <span>
              {newsFeed.refreshError ||
                'Offline mode. Displaying cached news articles. Connect to the internet and click Refresh Feed to fetch latest updates.'}
            </span>
          </div>
          <button
            type="button"
            disabled={newsLoading}
            onClick={() => void loadNews({ forceRefresh: true })}
            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-semibold shrink-0 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Compact Library Coverage & Provider Status Bar */}
      {games.length > 0 && (
        <div
          data-testid="news-coverage-section"
          className="rounded-2xl bg-ms-card/70 border border-ms-border/80 overflow-hidden shadow-sm"
        >
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-ms-text">
                <Layers className="w-3.5 h-3.5 text-violet-400" />
                <span>Library News Coverage</span>
              </span>
              <span className="text-ms-muted">•</span>
              <span className="inline-flex items-center gap-1 text-emerald-300 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{coverageStats.available} Active Sources</span>
              </span>
              { distinctGamesInFeed > 0 && (
                <span className="text-ms-muted">
                  ({filteredAndSortedArticles.length} articles across{' '}
                  {distinctGamesInFeed} games / {distinctPlatformsInFeed}{' '}
                  {distinctPlatformsInFeed === 1 ? 'platform' : 'platforms'})
                </span>
              )}
              {coverageStats.unsupported > 0 && (
                <span className="inline-flex items-center gap-1 text-zinc-400">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>{coverageStats.unsupported} Unsupported</span>
                </span>
              )}
              {coverageStats.failed > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{coverageStats.failed} Unavailable</span>
                </span>
              )}
            </div>

            <button
              type="button"
              data-testid="news-coverage-toggle-btn"
              onClick={() => setCoverageExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300 hover:text-violet-200 transition-colors cursor-pointer"
            >
              <span>{coverageExpanded ? 'Hide Game Status' : 'View Game Status'}</span>
              {coverageExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {coverageExpanded && (
            <div
              data-testid="news-coverage-list"
              className="px-4 pb-4 pt-2 border-t border-ms-border/50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5"
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
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
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
                          ? `${item.articleCount} News`
                          : meta.label}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-ms-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            data-testid="news-search-input"
            placeholder="Search by game name, headline, or patch summary..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-9 pl-9 pr-8 text-xs bg-ms-card border border-ms-border rounded-xl text-ms-text focus:outline-none focus:border-violet-500 shadow-sm"
          />
          {searchTerm && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ms-muted hover:text-ms-text"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Game, Platform & Sort Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Game Filter Dropdown */}
          <select
            data-testid="news-game-filter"
            value={newsFilterGameId ?? ''}
            onChange={(e) => setNewsFilterGameId(e.target.value || null)}
            className="h-9 px-3 text-xs font-semibold bg-ms-card border border-ms-border rounded-xl text-ms-text focus:outline-none focus:border-violet-500 cursor-pointer shadow-sm max-w-[220px] truncate"
          >
            <option value="">All Library Games</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>

          {/* Platform Filter Dropdown */}
          <select
            data-testid="news-platform-filter"
            value={newsFilterPlatformId ?? ''}
            onChange={(e) =>
              setNewsFilterPlatformId((e.target.value as PlatformId) || null)
            }
            className="h-9 px-3 text-xs font-semibold bg-ms-card border border-ms-border rounded-xl text-ms-text focus:outline-none focus:border-violet-500 cursor-pointer shadow-sm"
          >
            <option value="">All Platforms</option>
            <option value="riot">Riot Games</option>
            <option value="epic">Epic Games</option>
            <option value="ea">EA App</option>
            <option value="steam">Steam</option>
            <option value="ubisoft">Ubisoft Connect</option>
            <option value="gog">GOG Galaxy</option>
            <option value="custom">Custom PC</option>
          </select>

          {/* Sort Mode Selector */}
          <div className="inline-flex items-center gap-1.5 bg-ms-card border border-ms-border rounded-xl px-2.5 h-9 shadow-sm">
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

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              data-testid="news-clear-filters-btn"
              onClick={handleClearFilters}
              className="h-9 px-3 rounded-xl text-xs font-semibold bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 text-violet-300 inline-flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Articles Feed */}
      {newsLoading && articles.length === 0 ? (
        <div
          data-testid="news-loading-skeleton"
          className="grid grid-cols-1 gap-4"
        >
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="p-5 rounded-2xl bg-ms-card/70 border border-ms-border/60 flex flex-col md:flex-row gap-5 animate-pulse"
            >
              <div className="w-full md:w-36 h-36 rounded-xl bg-ms-elevated shrink-0" />
              <div className="flex-1 space-y-3 py-1">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-28 rounded bg-ms-elevated" />
                  <div className="h-4 w-20 rounded bg-ms-elevated" />
                </div>
                <div className="h-5 w-3/4 rounded bg-ms-elevated" />
                <div className="h-3.5 w-full rounded bg-ms-elevated" />
                <div className="h-3.5 w-2/3 rounded bg-ms-elevated" />
              </div>
            </div>
          ))}
        </div>
      ) : visibleArticles.length > 0 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {visibleArticles.map((article) => {
              const pubDate = new Date(article.publishedAtIso);
              const pubMs = pubDate.getTime();
              const isValidDate = !Number.isNaN(pubMs);
              const dateLabel = isValidDate
                ? pubDate.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'Recent';
              const relativeLabel = isValidDate ? formatRelativeAge(pubMs) : '';
              const isRecentArticle =
                article.isRecent ??
                (isValidDate && Date.now() - pubMs <= RECENT_WINDOW_MS);

              // Resolve artwork strictly from the matched game or article banner (never another game's artwork)
              const matchedGame = gameById.get(article.gameId);
              const rawArtwork =
                matchedGame?.userCoverOverride ||
                matchedGame?.coverImage ||
                matchedGame?.heroBackgroundImage ||
                article.gameCoverUrl ||
                article.articleImageUrl ||
                matchedGame?.iconImage;
              const showArtwork =
                Boolean(rawArtwork) && !brokenImages[article.id];

              return (
                <article
                  key={article.id}
                  data-testid={`news-card-${article.id}`}
                  className="p-5 rounded-2xl bg-ms-card border border-ms-border hover:border-violet-500/40 transition-all flex flex-col md:flex-row gap-5 shadow-sm group"
                >
                  {/* Game artwork thumbnail */}
                  {showArtwork ? (
                    <div className="w-full md:w-36 h-40 md:h-32 rounded-xl overflow-hidden bg-ms-elevated border border-ms-border/60 shrink-0 relative">
                      <img
                        src={rawArtwork}
                        alt={article.gameTitle}
                        onError={() =>
                          setBrokenImages((prev) => ({
                            ...prev,
                            [article.id]: true,
                          }))
                        }
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                    </div>
                  ) : (
                    <div className="w-full md:w-36 h-40 md:h-32 rounded-xl bg-gradient-to-br from-violet-600/20 via-indigo-600/10 to-ms-elevated border border-violet-500/30 flex flex-col items-center justify-center p-3 text-center shrink-0">
                      <Gamepad2 className="w-7 h-7 text-violet-400 mb-1.5" />
                      <span className="text-[11px] font-bold text-violet-200 line-clamp-2">
                        {article.gameTitle}
                      </span>
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 flex flex-col justify-between space-y-3 min-w-0">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-ms-muted">
                        <span className="font-bold text-violet-300 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-md">
                          {article.gameTitle}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-ms-elevated text-ms-muted font-medium">
                          {formatPlatformLabel(article.platformId)}
                        </span>

                        {article.isUpdate && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-semibold text-[11px]">
                            <Sparkles className="w-3 h-3" />
                            <span>Patch / Update</span>
                          </span>
                        )}

                        {isRecentArticle ? (
                          <span className="px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-300 font-semibold text-[11px]">
                            Recent
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-zinc-500/15 text-zinc-400 font-medium text-[11px]">
                            Archive
                          </span>
                        )}

                        <span className="flex items-center gap-1 ml-auto text-[11px] text-ms-muted">
                          <Calendar className="w-3 h-3 text-violet-400/80" />
                          <span>{dateLabel}</span>
                          {relativeLabel && (
                            <span className="text-ms-muted/70">
                              ({relativeLabel})
                            </span>
                          )}
                        </span>
                      </div>

                      <h2 className="text-base font-bold text-ms-text group-hover:text-violet-300 transition-colors leading-snug">
                        {article.headline}
                      </h2>

                      <p className="text-xs text-ms-muted leading-relaxed line-clamp-2">
                        {article.summary}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-ms-border/40 text-xs">
                      <span className="text-[11px] text-ms-muted/90">
                        Source:{' '}
                        <strong className="text-ms-text font-semibold">
                          {article.source}
                        </strong>
                        {article.author ? ` • ${article.author}` : ''}
                      </span>

                      {article.url ? (
                        <button
                          type="button"
                          data-testid={`news-open-btn-${article.id}`}
                          onClick={() => void openNewsArticle(article.url)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-ms-elevated hover:bg-violet-600 hover:text-white text-violet-300 font-semibold transition-all shadow-sm cursor-pointer"
                        >
                          <span>Open Article</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      ) : (
                        <span className="text-[11px] text-ms-muted">
                          No external link
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Load More Pagination */}
          {filteredAndSortedArticles.length > visibleCount && (
            <div className="pt-2 text-center">
              <button
                type="button"
                data-testid="news-load-more-btn"
                onClick={() =>
                  setVisibleCount((prev) => prev + LOAD_MORE_STEP)
                }
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-text shadow-sm transition-all cursor-pointer"
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
          className="p-12 text-center rounded-3xl bg-ms-card/40 border border-ms-border/60 max-w-lg mx-auto space-y-4"
        >
          <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto text-violet-400">
            <Newspaper className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-ms-text">
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
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-all shadow-sm cursor-pointer"
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
