import React, { useState } from 'react';
import { Pause, Play, BarChart2, TrendingUp, Clock, Zap, Sparkles } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { DemoNoticeBanner } from '../components/common/DemoNoticeBanner';
import { PlatformBadge } from '../components/common/PlatformBadge';
import { PlatformLogo } from '../components/platforms/PlatformLogo';
import { YearInReviewPage } from './YearInReviewPage';

export const StatisticsPage: React.FC = () => {
  const games = useAppStore((s) => s.games);
  const statistics = useAppStore((s) => s.statistics);
  const settings = useAppStore((s) => s.settings);
  const trackerStatus = useAppStore((s) => s.trackerStatus);
  const openGameDetails = useAppStore((s) => s.openGameDetails);
  const setTrackerPaused = useAppStore((s) => s.setTrackerPaused);

  const [subView, setSubView] = useState<'overview' | 'yearInReview'>('overview');
  const featuresManifest = useAppStore((s) => s.featuresManifest);
  const isYearInReviewEnabled = featuresManifest
    ? Boolean(featuresManifest.features.yearInReview?.enabled)
    : true;
  const [chartView, setChartView] = useState<'weekly' | 'monthly'>('weekly');

  const mostPlayedGames = [...games]
    .sort((a, b) => b.playtimeHours - a.playtimeHours)
    .slice(0, 5);

  const recentlyPlayedGames = [...games]
    .filter((g) => g.lastPlayedIso !== null)
    .sort((a, b) => {
      const tA = a.lastPlayedIso ? Date.parse(a.lastPlayedIso) : 0;
      const tB = b.lastPlayedIso ? Date.parse(b.lastPlayedIso) : 0;
      return tB - tA;
    })
    .slice(0, 5);

  const maxWeeklyHours = Math.max(
    ...statistics.weeklyActivity.map((d) => d.hoursPlayed),
    1
  );
  const maxMonthlyHours = Math.max(
    ...statistics.monthlyActivity.map((m) => m.hoursPlayed),
    1
  );
  const maxMostPlayedHours = Math.max(
    ...mostPlayedGames.map((g) => g.playtimeHours),
    1
  );

  const isDemoStats = Boolean(
    statistics.isDemoData || settings.demoModeEnabled
  );

  return (
    <div
      data-testid="page-statistics"
      className="max-w-6xl mx-auto space-y-8 pb-16"
    >
      {/* Spacious Gaming Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ms-border/80 pb-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-ms-text tracking-tight">
            Gaming Telemetry & Statistics
          </h1>
          <p className="text-sm text-ms-muted">
            {trackerStatus.paused
              ? 'Background playtime tracking is currently paused'
              : trackerStatus.activeSessions.length > 0
              ? `Tracking active session: ${trackerStatus.activeSessions[0].gameTitle}`
              : 'Continuous background playtime metrics and session telemetry'}
          </p>
        </div>

        <button
          type="button"
          data-testid="stats-toggle-tracker-btn"
          onClick={() => void setTrackerPaused(!trackerStatus.paused)}
          className="h-10 px-4 rounded-lg bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-text text-sm font-semibold inline-flex items-center gap-2 transition-colors shadow-sm"
        >
          {trackerStatus.paused ? (
            <>
              <Play className="w-4 h-4 text-emerald-400 fill-current" />
              <span>Resume Tracking</span>
            </>
          ) : (
            <>
              <Pause className="w-4 h-4 text-ms-muted" />
              <span>Pause Tracking</span>
            </>
          )}
        </button>
      </div>

      {/* Sub-navigation Tabs */}
      {isYearInReviewEnabled && (
        <div className="flex items-center gap-2 border-b border-ms-border/40 pb-2">
          <button
            type="button"
            data-testid="stats-tab-overview"
            onClick={() => setSubView('overview')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              subView === 'overview'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-ms-muted hover:text-ms-text hover:bg-ms-card'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Telemetry Overview</span>
          </button>
          <button
            type="button"
            data-testid="stats-tab-year-in-review"
            onClick={() => setSubView('yearInReview')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              subView === 'yearInReview'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-ms-muted hover:text-ms-text hover:bg-ms-card'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Year in Review</span>
          </button>
        </div>
      )}

      {isYearInReviewEnabled && subView === 'yearInReview' ? (
        <YearInReviewPage />
      ) : (
        <>
          {isDemoStats && (
            <DemoNoticeBanner
              title="Sample statistics"
              description="Displaying demonstration playtime metrics. Turn off Demo mode to view your real recorded local sessions."
            />
          )}

      {!isDemoStats && (statistics.totalSessionsCount ?? 0) === 0 && (
        <div
          data-testid="stats-empty-real-sessions"
          className="rounded-2xl bg-ms-card border border-ms-border p-6 flex items-center justify-between gap-4 text-sm shadow-card"
        >
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-ms-accent" />
            <span className="text-ms-muted">
              No playtime sessions recorded yet. Launch any installed game to
              begin tracking playtime and telemetry automatically.
            </span>
          </div>
          <span className="text-xs font-mono font-semibold text-ms-muted shrink-0 bg-ms-bg px-2.5 py-1 rounded border border-ms-border">
            0 sessions logged
          </span>
        </div>
      )}

      {/* Playtime Summary Cards — Bold Typography */}
      <section
        aria-label="Playtime summaries"
        className="grid grid-cols-2 lg:grid-cols-4 gap-5"
      >
        <div className="p-6 rounded-2xl bg-ms-card border border-ms-border space-y-2 shadow-card">
          <div className="flex items-center justify-between text-xs font-semibold text-ms-muted uppercase tracking-wider">
            <span>Total Playtime</span>
            <Clock className="w-4 h-4 text-ms-accent" />
          </div>
          <div
            data-testid="stats-total-hours"
            className="text-3xl font-extrabold text-ms-text tabular-nums tracking-tight"
          >
            {statistics.totalGamingHours.toFixed(1)}h
          </div>
          <p className="text-xs text-ms-muted tabular-nums">
            {isDemoStats
              ? 'Across all platforms'
              : `Today ${(statistics.todayHours ?? 0).toFixed(1)}h • This week ${(statistics.thisWeekHours ?? 0).toFixed(1)}h`}
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-ms-card border border-ms-border space-y-2 shadow-card">
          <div className="flex items-center justify-between text-xs font-semibold text-ms-muted uppercase tracking-wider">
            <span>Active Days (30d)</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-ms-text tabular-nums tracking-tight">
            {statistics.activeDaysLast30}
          </div>
          <p className="text-xs text-ms-muted tabular-nums">
            Average {statistics.averageSessionHours.toFixed(1)}h per session
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-ms-card border border-ms-border space-y-2 shadow-card">
          <div className="flex items-center justify-between text-xs font-semibold text-ms-muted uppercase tracking-wider">
            <span>Current Streak</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-ms-text tabular-nums tracking-tight">
            {statistics.currentStreakDays}d
          </div>
          <p className="text-xs text-ms-muted tabular-nums">
            {isDemoStats
              ? 'Consecutive active days'
              : `${statistics.totalSessionsCount ?? 0} sessions logged`}
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-ms-card border border-ms-border space-y-2 shadow-card">
          <div className="flex items-center justify-between text-xs font-semibold text-ms-muted uppercase tracking-wider">
            <span>{isDemoStats ? 'Achievements' : 'Monthly Total'}</span>
            <BarChart2 className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-3xl font-extrabold text-ms-text tabular-nums tracking-tight">
            {isDemoStats
              ? `${statistics.completionAveragePercent}%`
              : `${(statistics.thisMonthHours ?? 0).toFixed(1)}h`}
          </div>
          <p className="text-xs text-ms-muted">
            {isDemoStats ? 'Steam achievements unlock rate' : 'Last 30 days total playtime'}
          </p>
        </div>
      </section>

      {/* Activity Chart & Platform Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
        {/* Activity Chart */}
        <section
          aria-label="Activity history"
          className="lg:col-span-7 rounded-2xl bg-ms-card border border-ms-border p-6 space-y-5 shadow-card"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-ms-text tracking-tight">
                Activity History
              </h2>
              <p className="text-xs text-ms-muted">
                {chartView === 'weekly'
                  ? 'Hours played over the last 7 days'
                  : 'Monthly gameplay volume over the last 6 months'}
              </p>
            </div>

            <div className="inline-flex h-8 rounded-lg bg-ms-bg border border-ms-border p-1">
              <button
                type="button"
                data-testid="chart-toggle-weekly"
                onClick={() => setChartView('weekly')}
                className={`px-3 rounded-md text-xs font-semibold transition-colors ${
                  chartView === 'weekly'
                    ? 'bg-ms-elevated text-ms-text shadow-sm'
                    : 'text-ms-muted hover:text-ms-text'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                data-testid="chart-toggle-monthly"
                onClick={() => setChartView('monthly')}
                className={`px-3 rounded-md text-xs font-semibold transition-colors ${
                  chartView === 'monthly'
                    ? 'bg-ms-elevated text-ms-text shadow-sm'
                    : 'text-ms-muted hover:text-ms-text'
                }`}
              >
                6 Months
              </button>
            </div>
          </div>

          {chartView === 'weekly' ? (
            <div
              data-testid="weekly-activity-chart"
              className="pt-6 grid grid-cols-7 gap-4 items-end h-56 border-b border-ms-border pb-4"
            >
              {statistics.weeklyActivity.map((day) => {
                const heightPercent = Math.round(
                  (day.hoursPlayed / maxWeeklyHours) * 100
                );
                return (
                  <div
                    key={day.dayLabel}
                    className="flex flex-col items-center justify-end h-full gap-2 group"
                  >
                    <span className="text-xs tabular-nums font-semibold text-ms-muted group-hover:text-ms-text transition-colors">
                      {day.hoursPlayed.toFixed(1)}h
                    </span>
                    <div className="w-full max-w-[40px] h-36 bg-ms-bg rounded-lg flex items-end overflow-hidden p-0.5">
                      <div
                        className="w-full bg-ms-accent group-hover:bg-ms-accentHover rounded-md transition-all duration-300"
                        style={{
                          height: `${
                            day.hoursPlayed > 0 ? Math.max(heightPercent, 10) : 4
                          }%`,
                          opacity: day.hoursPlayed > 0 ? 1 : 0.25,
                        }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-ms-text/90">
                      {day.dayLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              data-testid="monthly-activity-chart"
              className="pt-6 grid grid-cols-6 gap-4 items-end h-56 border-b border-ms-border pb-4"
            >
              {statistics.monthlyActivity.map((month) => {
                const heightPercent = Math.round(
                  (month.hoursPlayed / maxMonthlyHours) * 100
                );
                return (
                  <div
                    key={month.monthLabel}
                    className="flex flex-col items-center justify-end h-full gap-2 group"
                  >
                    <span className="text-xs tabular-nums font-semibold text-ms-muted group-hover:text-ms-text transition-colors">
                      {month.hoursPlayed}h
                    </span>
                    <div className="w-full max-w-[44px] h-36 bg-ms-bg rounded-lg flex items-end overflow-hidden p-0.5">
                      <div
                        className="w-full bg-ms-accent group-hover:bg-ms-accentHover rounded-md transition-all duration-300"
                        style={{
                          height: `${
                            month.hoursPlayed > 0
                              ? Math.max(heightPercent, 10)
                              : 4
                          }%`,
                          opacity: month.hoursPlayed > 0 ? 1 : 0.25,
                        }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-ms-text/90 truncate">
                      {month.monthLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Playtime by Platform */}
        <section
          aria-label="Playtime by platform"
          className="lg:col-span-5 rounded-2xl bg-ms-card border border-ms-border p-6 space-y-5 shadow-card"
        >
          <div>
            <h2 className="text-base font-bold text-ms-text tracking-tight">
              Playtime by Platform
            </h2>
            <p className="text-xs text-ms-muted">
              Distribution across detected Windows game launchers
            </p>
          </div>

          <div className="space-y-4 pt-1">
            {statistics.platformBreakdown.map((plat) => (
              <div key={plat.platformId} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <PlatformLogo
                      platformId={plat.platformId}
                      size={18}
                      colorMode="brand"
                    />
                    <span className="font-semibold text-ms-text">
                      {plat.platformName}
                    </span>
                    <span className="text-ms-muted tabular-nums">
                      ({plat.titlesCount} titles)
                    </span>
                  </div>
                  <span className="tabular-nums text-ms-text font-bold">
                    {plat.hoursPlayed.toFixed(1)}h{' '}
                    <span className="text-ms-muted font-normal">
                      ({plat.percentage}%)
                    </span>
                  </span>
                </div>

                <div className="w-full h-2 rounded-full bg-ms-bg overflow-hidden">
                  <div
                    className="h-full rounded-full bg-ms-accent transition-all duration-300"
                    style={{ width: `${plat.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Bottom Split: Top 5 Most-Played Games & Recent Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-7">
        {/* Most-Played Games */}
        <section
          aria-label="Most-played games"
          className="rounded-2xl bg-ms-card border border-ms-border overflow-hidden shadow-card"
        >
          <div className="px-6 py-4 border-b border-ms-border flex items-center justify-between">
            <h2 className="text-base font-bold text-ms-text">
              Top Most-Played Games
            </h2>
            <span className="text-xs font-semibold text-ms-muted">Top 5</span>
          </div>

          <div className="divide-y divide-ms-border">
            {mostPlayedGames.map((game, index) => {
              const barPercent = Math.round(
                (game.playtimeHours / maxMostPlayedHours) * 100
              );
              return (
                <div
                  key={game.id}
                  onClick={() => openGameDetails(game.id)}
                  className="px-6 py-3.5 hover:bg-ms-elevated/50 transition-colors cursor-pointer space-y-2"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <span className="text-xs font-mono font-bold text-ms-muted tabular-nums w-4">
                        #{index + 1}
                      </span>
                      {game.iconImage ? (
                        <img
                          src={game.iconImage}
                          alt=""
                          className="w-8 h-8 rounded object-contain shrink-0"
                        />
                      ) : (
                        <img
                          src={game.coverImage}
                          alt=""
                          className="w-8 h-10 rounded object-cover shrink-0 bg-ms-bg border border-ms-border"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ms-text truncate tracking-tight">
                          {game.title}
                        </div>
                        <PlatformBadge
                          platformId={game.platformId}
                          size="xs"
                        />
                      </div>
                    </div>

                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-sm font-bold text-ms-text">
                        {game.playtimeHours.toFixed(1)}h
                      </div>
                    </div>
                  </div>

                  <div className="w-full h-1.5 rounded-full bg-ms-bg overflow-hidden">
                    <div
                      className="h-full rounded-full bg-ms-accent transition-all duration-300"
                      style={{ width: `${barPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent Activity History */}
        <section
          aria-label="Recent activity"
          className="rounded-2xl bg-ms-card border border-ms-border overflow-hidden shadow-card"
        >
          <div className="px-6 py-4 border-b border-ms-border flex items-center justify-between">
            <h2 className="text-base font-bold text-ms-text">
              Recent Activity History
            </h2>
            <span className="text-xs font-semibold text-ms-muted">Latest Sessions</span>
          </div>

          <div className="divide-y divide-ms-border">
            {recentlyPlayedGames.map((game) => (
              <div
                key={game.id}
                onClick={() => openGameDetails(game.id)}
                className="px-6 py-3.5 hover:bg-ms-elevated/50 transition-colors cursor-pointer flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {game.iconImage ? (
                    <img
                      src={game.iconImage}
                      alt=""
                      className="w-8 h-8 rounded object-contain shrink-0"
                    />
                  ) : (
                    <img
                      src={game.coverImage}
                      alt=""
                      className="w-8 h-10 rounded object-cover shrink-0 bg-ms-bg border border-ms-border"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ms-text truncate tracking-tight">
                      {game.title}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-ms-muted mt-0.5">
                      <PlatformBadge
                        platformId={game.platformId}
                        size="xs"
                      />
                      <span>•</span>
                      <span>{game.lastPlayedLabel}</span>
                    </div>
                  </div>
                </div>

                <span className="text-sm font-bold text-ms-text tabular-nums shrink-0">
                  {game.playtimeHours.toFixed(1)}h
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
      </>
      )}
    </div>
  );
};
