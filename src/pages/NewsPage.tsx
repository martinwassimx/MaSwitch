import React, { useEffect, useState } from 'react';
import {
  ExternalLink,
  Newspaper,
  RefreshCw,
  Search,
  WifiOff,
  Calendar,
  Gamepad2,
  Clock,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { PlatformId } from '../shared/types/platform';

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

  // Fetch only when page opens or user clicks refresh!
  useEffect(() => {
    void loadNews();
  }, [loadNews]);

  const articles = newsFeed?.articles ?? [];

  const filteredArticles = articles.filter((art) => {
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const match =
        art.headline.toLowerCase().includes(q) ||
        art.summary.toLowerCase().includes(q) ||
        art.gameTitle.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div data-testid="page-game-news" className="max-w-6xl mx-auto space-y-8 pb-16 animate-fadeIn select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ms-border/60 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold uppercase tracking-wider mb-2">
            <Newspaper className="w-3.5 h-3.5 text-violet-400" />
            <span>Official Game Updates & News</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ms-text">
            Game Updates
          </h1>
          <p className="text-xs text-ms-muted mt-1">
            Official publisher patch notes and news for titles in your local library
          </p>
        </div>

        {/* Refresh & Last Updated Timestamp */}
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {newsFeed?.lastUpdatedIso && (
            <span className="text-[11px] text-ms-muted flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>
                Updated {new Date(newsFeed.lastUpdatedIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </span>
          )}

          <button
            type="button"
            data-testid="news-refresh-btn"
            disabled={newsLoading}
            onClick={() => void loadNews({ forceRefresh: true })}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-text shadow-sm transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${newsLoading ? 'animate-spin' : ''}`} />
            <span>{newsLoading ? 'Checking...' : 'Refresh Feed'}</span>
          </button>
        </div>
      </div>

      {/* Offline Banner if applicable */}
      {newsFeed?.isOffline && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2.5">
          <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Offline mode. Displaying cached news articles. Connect to the internet and click Refresh to fetch latest updates.</span>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-ms-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            data-testid="news-search-input"
            placeholder="Search news, headlines, or patches..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-xs bg-ms-card border border-ms-border rounded-xl text-ms-text focus:outline-none focus:border-violet-500 shadow-sm"
          />
        </div>

        {/* Game Filter Dropdown */}
        <div className="flex items-center gap-2">
          <select
            data-testid="news-game-filter"
            value={newsFilterGameId ?? ''}
            onChange={(e) => setNewsFilterGameId(e.target.value || null)}
            className="h-9 px-3 text-xs font-semibold bg-ms-card border border-ms-border rounded-xl text-ms-text focus:outline-none focus:border-violet-500 cursor-pointer shadow-sm"
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
            onChange={(e) => setNewsFilterPlatformId((e.target.value as PlatformId) || null)}
            className="h-9 px-3 text-xs font-semibold bg-ms-card border border-ms-border rounded-xl text-ms-text focus:outline-none focus:border-violet-500 cursor-pointer shadow-sm"
          >
            <option value="">All Platforms</option>
            <option value="steam">Steam</option>
            <option value="epic">Epic Games</option>
            <option value="riot">Riot Games</option>
            <option value="gog">GOG Galaxy</option>
            <option value="ea">EA App</option>
          </select>
        </div>
      </div>

      {/* Articles Feed */}
      {newsLoading && articles.length === 0 ? (
        <div className="py-24 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-ms-muted">Fetching official game updates...</p>
        </div>
      ) : filteredArticles.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {filteredArticles.map((article) => {
            const pubDate = new Date(article.publishedAtIso);
            const dateLabel = !isNaN(pubDate.getTime())
              ? pubDate.toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Recent';

            return (
              <article
                key={article.id}
                data-testid={`news-card-${article.id}`}
                className="p-5 rounded-2xl bg-ms-card border border-ms-border hover:border-violet-500/40 transition-all flex flex-col md:flex-row gap-5 shadow-sm"
              >
                {/* Game artwork thumbnail */}
                {article.gameCoverUrl ? (
                  <img
                    src={article.gameCoverUrl}
                    alt={article.gameTitle}
                    className="w-full md:w-32 h-40 md:h-32 object-cover rounded-xl shadow shrink-0"
                  />
                ) : (
                  <div className="w-full md:w-32 h-40 md:h-32 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0">
                    <Gamepad2 className="w-8 h-8 text-violet-400" />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 flex flex-col justify-between space-y-3 min-w-0">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ms-muted">
                      <span className="font-bold text-violet-400">{article.gameTitle}</span>
                      <span>•</span>
                      <span className="capitalize">{article.platformId}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{dateLabel}</span>
                      </span>
                    </div>

                    <h2 className="text-base font-bold text-ms-text hover:text-violet-300 transition-colors">
                      {article.headline}
                    </h2>

                    <p className="text-xs text-ms-muted leading-relaxed line-clamp-2">
                      {article.summary}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-ms-border/40 text-xs">
                    <span className="text-[11px] text-ms-muted/80">
                      Source: <strong className="text-ms-muted">{article.source}</strong>
                    </span>

                    {article.url ? (
                      <button
                        type="button"
                        data-testid={`news-open-btn-${article.id}`}
                        onClick={() => void openNewsArticle(article.url)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ms-elevated hover:bg-violet-600 hover:text-white text-violet-300 font-semibold transition-all shadow-sm"
                      >
                        <span>Open Article</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    ) : (
                      <span className="text-[11px] text-ms-muted">No external link</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="p-12 text-center rounded-3xl bg-ms-card/40 border border-ms-border/60 max-w-lg mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto text-violet-400">
            <Newspaper className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-ms-text">No News Available</h3>
            <p className="text-xs text-ms-muted mt-1 max-w-sm mx-auto">
              {searchTerm || newsFilterGameId || newsFilterPlatformId
                ? 'No updates match your selected filters. Try clearing filters.'
                : 'No official updates were found for your installed library games.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
