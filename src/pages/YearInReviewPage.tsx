import React, { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  Clock,
  Download,
  Flame,
  Gamepad2,
  Sparkles,
  Trophy,
  TrendingUp,
  TrendingDown,
  Layers,
  ChevronDown,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export const YearInReviewPage: React.FC = () => {
  const availableYears = useAppStore((s) => s.availableYears);
  const selectedYear = useAppStore((s) => s.selectedYear);
  const yearInReviewData = useAppStore((s) => s.yearInReviewData);
  const yearInReviewLoading = useAppStore((s) => s.yearInReviewLoading);
  const loadYearInReview = useAppStore((s) => s.loadYearInReview);
  const setSelectedYear = useAppStore((s) => s.setSelectedYear);

  const [exporting, setExporting] = useState(false);
  const recapCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadYearInReview(selectedYear);
  }, [loadYearInReview, selectedYear]);

  const handleExportSummary = () => {
    if (!yearInReviewData) return;
    setExporting(true);

    try {
      // Build high-resolution canvas export offline
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1400;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Dark violet gradient background
      const grad = ctx.createLinearGradient(0, 0, 1200, 1400);
      grad.addColorStop(0, '#0F0E17');
      grad.addColorStop(0.5, '#1A162B');
      grad.addColorStop(1, '#0B0A10');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1200, 1400);

      // Accent glow circles
      const glow1 = ctx.createRadialGradient(250, 200, 10, 250, 200, 400);
      glow1.addColorStop(0, 'rgba(139, 92, 246, 0.25)');
      glow1.addColorStop(1, 'rgba(139, 92, 246, 0)');
      ctx.fillStyle = glow1;
      ctx.fillRect(0, 0, 1200, 1400);

      // Card Header
      ctx.fillStyle = '#A78BFA';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText('MASWITCH YEAR IN REVIEW', 80, 100);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.fillText(`${yearInReviewData.year} Gaming Recap`, 80, 180);

      // Hero Metrics Block
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(80, 240, 1040, 240, 24);
      ctx.fill();
      ctx.stroke();

      // Hours Played
      ctx.fillStyle = '#8B5CF6';
      ctx.font = 'bold 72px system-ui, sans-serif';
      ctx.fillText(`${yearInReviewData.totalGamingHours}`, 130, 360);
      ctx.fillStyle = '#A1A1AA';
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText('HOURS PLAYED', 130, 410);

      // Total Sessions
      ctx.fillStyle = '#38BDF8';
      ctx.font = 'bold 72px system-ui, sans-serif';
      ctx.fillText(`${yearInReviewData.totalSessions}`, 490, 360);
      ctx.fillStyle = '#A1A1AA';
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText('TOTAL SESSIONS', 490, 410);

      // Unique Games
      ctx.fillStyle = '#34D399';
      ctx.font = 'bold 72px system-ui, sans-serif';
      ctx.fillText(`${yearInReviewData.uniqueGamesCount}`, 850, 360);
      ctx.fillStyle = '#A1A1AA';
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText('GAMES PLAYED', 850, 410);

      // Top 5 Games Section
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 36px system-ui, sans-serif';
      ctx.fillText('Top 5 Most-Played Games', 80, 560);

      let topY = 620;
      yearInReviewData.topGames.slice(0, 5).forEach((game, idx) => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.beginPath();
        ctx.roundRect(80, topY, 1040, 90, 16);
        ctx.fill();

        // Rank Number
        ctx.fillStyle = '#A78BFA';
        ctx.font = 'bold 32px system-ui, sans-serif';
        ctx.fillText(`#${idx + 1}`, 110, topY + 56);

        // Title
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 26px system-ui, sans-serif';
        const truncatedTitle = game.title.length > 32 ? game.title.slice(0, 32) + '...' : game.title;
        ctx.fillText(truncatedTitle, 180, topY + 55);

        // Hours & Share
        ctx.fillStyle = '#8B5CF6';
        ctx.font = 'bold 26px system-ui, sans-serif';
        ctx.fillText(`${game.hoursPlayed} hrs`, 900, topY + 55);

        ctx.fillStyle = '#71717A';
        ctx.font = '18px system-ui, sans-serif';
        ctx.fillText(`(${game.percentageOfYear}%)`, 1010, topY + 55);

        topY += 105;
      });

      // Highlights Block
      topY += 40;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.beginPath();
      ctx.roundRect(80, topY, 1040, 180, 20);
      ctx.fill();

      // Peak Month
      ctx.fillStyle = '#A1A1AA';
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText('Peak Month', 120, topY + 60);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.fillText(yearInReviewData.mostActiveMonth?.monthName ?? 'N/A', 120, topY + 110);

      // Peak Day
      ctx.fillStyle = '#A1A1AA';
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText('Favorite Day', 450, topY + 60);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.fillText(yearInReviewData.mostActiveDayOfWeek?.dayName ?? 'N/A', 450, topY + 110);

      // Longest Session
      ctx.fillStyle = '#A1A1AA';
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText('Longest Session', 780, topY + 60);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.fillText(
        yearInReviewData.longestSession
          ? `${yearInReviewData.longestSession.durationHours} hrs`
          : 'N/A',
        780,
        topY + 110
      );

      // Footer
      ctx.fillStyle = '#71717A';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText('Generated locally by MaSwitch Gaming Launcher & Account Manager', 80, 1340);

      // Trigger download
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `MaSwitch-YearInReview-${yearInReviewData.year}.png`;
      a.click();
    } catch (err) {
      console.error('Failed to export recap:', err);
    } finally {
      setExporting(false);
    }
  };

  const hasData = yearInReviewData && yearInReviewData.totalSessions > 0;

  return (
    <div data-testid="page-year-in-review" className="max-w-6xl mx-auto space-y-8 pb-16 animate-fadeIn select-none">
      {/* Header and Year Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ms-border/60 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span>Gaming Year in Review</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ms-text">
            {selectedYear} Wrapped
          </h1>
          <p className="text-xs text-ms-muted mt-1">
            Personal annual gaming analytics, top titles, activity calendar, and peak milestones
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Year Selector Dropdown */}
          <div className="relative">
            <select
              data-testid="year-selector"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="appearance-none bg-ms-card hover:bg-ms-elevated text-ms-text text-xs font-bold pl-4 pr-9 py-2 rounded-xl border border-ms-border focus:outline-none focus:border-ms-accent transition-colors cursor-pointer shadow-sm"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr} Review
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-ms-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Export PNG Recap Button */}
          {hasData && (
            <button
              type="button"
              data-testid="export-recap-btn"
              disabled={exporting}
              onClick={handleExportSummary}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exporting ? 'Exporting...' : 'Export Recap PNG'}</span>
            </button>
          )}
        </div>
      </div>

      {yearInReviewLoading ? (
        <div className="py-24 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-ms-muted font-medium">Aggregating local playtime sessions for {selectedYear}...</p>
        </div>
      ) : !hasData ? (
        /* Empty State */
        <div className="p-12 text-center rounded-3xl bg-ms-card/40 border border-ms-border/60 max-w-lg mx-auto space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto text-violet-400">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-ms-text">No Playtime Recorded in {selectedYear}</h3>
            <p className="text-xs text-ms-muted mt-1 max-w-sm mx-auto">
              Play sessions tracked locally while MaSwitch is running will automatically populate your annual recap here.
            </p>
          </div>
        </div>
      ) : (
        /* Recap Content */
        <div ref={recapCardRef} className="space-y-8">
          {/* Hero Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Hours */}
            <div className="relative overflow-hidden p-6 rounded-3xl bg-gradient-to-br from-violet-950/40 via-ms-card to-ms-card border border-violet-500/20 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-violet-300">Total Gaming Time</span>
                <Clock className="w-4 h-4 text-violet-400" />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-white tracking-tight">
                  {yearInReviewData.totalGamingHours}
                </span>
                <span className="text-xs text-ms-muted font-semibold">hours</span>
              </div>
              {yearInReviewData.comparison && (
                <div className="mt-3 flex items-center gap-1.5 text-xs">
                  {yearInReviewData.comparison.hoursDiff >= 0 ? (
                    <>
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">+{yearInReviewData.comparison.hoursDiff} hrs</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                      <span className="text-rose-400 font-semibold">{yearInReviewData.comparison.hoursDiff} hrs</span>
                    </>
                  )}
                  <span className="text-ms-muted">vs {yearInReviewData.comparison.previousYear}</span>
                </div>
              )}
            </div>

            {/* Total Sessions */}
            <div className="relative overflow-hidden p-6 rounded-3xl bg-gradient-to-br from-cyan-950/30 via-ms-card to-ms-card border border-cyan-500/20 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">Play Sessions</span>
                <Flame className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-white tracking-tight">
                  {yearInReviewData.totalSessions}
                </span>
                <span className="text-xs text-ms-muted font-semibold">sessions</span>
              </div>
              <div className="mt-3 text-xs text-ms-muted">
                Avg duration:{' '}
                <strong className="text-ms-text">{yearInReviewData.averageSessionMinutes} mins</strong>
              </div>
            </div>

            {/* Unique Games */}
            <div className="relative overflow-hidden p-6 rounded-3xl bg-gradient-to-br from-emerald-950/30 via-ms-card to-ms-card border border-emerald-500/20 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">Games Explored</span>
                <Layers className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-white tracking-tight">
                  {yearInReviewData.uniqueGamesCount}
                </span>
                <span className="text-xs text-ms-muted font-semibold">unique titles</span>
              </div>
              <div className="mt-3 text-xs text-ms-muted">
                Top Game: <strong className="text-ms-text">{yearInReviewData.topGames[0]?.title ?? 'N/A'}</strong>
              </div>
            </div>
          </div>

          {/* Top 5 Most-Played Games */}
          <div className="p-6 rounded-3xl bg-ms-card border border-ms-border space-y-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-ms-text flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <span>Top 5 Most-Played Games</span>
              </h2>
              <span className="text-xs text-ms-muted">Ranked by local hours in {selectedYear}</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {yearInReviewData.topGames.map((game, idx) => (
                <div
                  key={game.gameId}
                  className="p-4 rounded-2xl bg-ms-elevated/40 hover:bg-ms-elevated/70 border border-ms-border/60 flex items-center justify-between gap-4 transition-all"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span
                      className={`text-lg font-black tabular-nums w-7 text-center shrink-0 ${
                        idx === 0
                          ? 'text-amber-400'
                          : idx === 1
                          ? 'text-slate-300'
                          : idx === 2
                          ? 'text-amber-600'
                          : 'text-ms-muted'
                      }`}
                    >
                      #{idx + 1}
                    </span>

                    {game.coverImage ? (
                      <img
                        src={game.coverImage}
                        alt={game.title}
                        className="w-12 h-16 object-cover rounded-xl shadow shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-16 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0">
                        <Gamepad2 className="w-6 h-6 text-violet-400" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="text-sm font-bold text-ms-text truncate">{game.title}</div>
                      <div className="text-xs text-ms-muted mt-0.5 flex items-center gap-2">
                        <span className="capitalize">{game.platformId}</span>
                        <span>•</span>
                        <span>{game.sessionCount} sessions</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-base font-extrabold text-ms-text tabular-nums">
                      {game.hoursPlayed}{' '}
                      <span className="text-xs font-normal text-ms-muted">hrs</span>
                    </div>
                    <div className="text-xs font-bold text-violet-400 tabular-nums">
                      {game.percentageOfYear}% of year
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Heatmap Calendar */}
          <div className="p-6 rounded-3xl bg-ms-card border border-ms-border space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-ms-text flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-violet-400" />
                  <span>Activity Heatmap</span>
                </h2>
                <p className="text-xs text-ms-muted mt-0.5">
                  Daily gaming frequency across all {yearInReviewData.activityCalendar.length} days of {selectedYear}
                </p>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-2 text-[11px] text-ms-muted">
                <span>Less</span>
                <div className="flex gap-1">
                  <span className="w-3 h-3 rounded-sm bg-ms-elevated border border-ms-border/40" />
                  <span className="w-3 h-3 rounded-sm bg-violet-900/60" />
                  <span className="w-3 h-3 rounded-sm bg-violet-700/80" />
                  <span className="w-3 h-3 rounded-sm bg-violet-500" />
                  <span className="w-3 h-3 rounded-sm bg-cyan-400" />
                </div>
                <span>More</span>
              </div>
            </div>

            <div className="overflow-x-auto pb-2 scrollbar-none">
              <div className="inline-grid grid-rows-7 grid-flow-col gap-1.5 p-1">
                {yearInReviewData.activityCalendar.map((day) => {
                  let bg = 'bg-ms-elevated/60 border border-ms-border/30';
                  if (day.intensity === 1) bg = 'bg-violet-900/60';
                  if (day.intensity === 2) bg = 'bg-violet-700/80';
                  if (day.intensity === 3) bg = 'bg-violet-500 shadow-sm';
                  if (day.intensity === 4) bg = 'bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]';

                  return (
                    <div
                      key={day.date}
                      title={`${day.date}: ${day.hours} hours (${day.sessionCount} sessions)`}
                      className={`w-3.5 h-3.5 rounded-sm ${bg} transition-transform hover:scale-125 cursor-pointer`}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Peak Milestones Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Most Active Month */}
            <div className="p-6 rounded-3xl bg-ms-card border border-ms-border space-y-2 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-ms-muted">Peak Month</span>
              <div className="text-xl font-extrabold text-ms-text">
                {yearInReviewData.mostActiveMonth?.monthName ?? 'None'}
              </div>
              <p className="text-xs text-ms-muted">
                {yearInReviewData.mostActiveMonth
                  ? `${yearInReviewData.mostActiveMonth.hoursPlayed} hours across ${yearInReviewData.mostActiveMonth.sessionsCount} sessions`
                  : 'No sessions logged'}
              </p>
            </div>

            {/* Most Active Day of Week */}
            <div className="p-6 rounded-3xl bg-ms-card border border-ms-border space-y-2 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-ms-muted">Favorite Gaming Day</span>
              <div className="text-xl font-extrabold text-ms-text">
                {yearInReviewData.mostActiveDayOfWeek?.dayName ?? 'None'}
              </div>
              <p className="text-xs text-ms-muted">
                {yearInReviewData.mostActiveDayOfWeek
                  ? `${yearInReviewData.mostActiveDayOfWeek.hoursPlayed} hours logged on ${yearInReviewData.mostActiveDayOfWeek.dayName}s`
                  : 'No sessions logged'}
              </p>
            </div>

            {/* Longest Single Session */}
            <div className="p-6 rounded-3xl bg-ms-card border border-ms-border space-y-2 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-ms-muted">Marathon Session</span>
              <div className="text-xl font-extrabold text-ms-text">
                {yearInReviewData.longestSession
                  ? `${yearInReviewData.longestSession.durationHours} hours`
                  : 'None'}
              </div>
              <p className="text-xs text-ms-muted truncate">
                {yearInReviewData.longestSession
                  ? yearInReviewData.longestSession.gameTitle
                  : 'No session data'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
