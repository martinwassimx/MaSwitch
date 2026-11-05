import type { PlatformId } from './platform';

export interface DailyActivityPoint {
  dayLabel: string;
  dateLabel: string;
  hoursPlayed: number;
  sessionsCount: number;
  topPlatformId: PlatformId;
}

export interface MonthlyActivityPoint {
  monthLabel: string;
  hoursPlayed: number;
  titlesPlayed: number;
}

export interface PlatformPlaytimeBreakdown {
  platformId: PlatformId;
  platformName: string;
  hoursPlayed: number;
  percentage: number;
  titlesCount: number;
  accentColor: string;
}

export interface GenrePlaytimeBreakdown {
  genre: string;
  hoursPlayed: number;
  percentage: number;
}

export type PlaytimeSessionSource = 'maswitch-launch' | 'background-monitor';

export type PlaytimeSessionStatus =
  | 'active'
  | 'completed'
  | 'recovered-after-restart'
  | 'terminated-unexpectedly';

export interface PlaytimeSessionRecord {
  id: string;
  gameId: string;
  gameTitle: string;
  platformId: PlatformId;
  executablePath: string;
  startedAtIso: string;
  endedAtIso: string | null;
  durationSeconds: number;
  source: PlaytimeSessionSource;
  status: PlaytimeSessionStatus;
}

export interface PlaytimeTrackerStatus {
  enabled: boolean;
  paused: boolean;
  activeSessions: PlaytimeSessionRecord[];
}

export interface StatisticsOverview {
  totalGamingHours: number;
  todayHours?: number;
  thisWeekHours?: number;
  thisMonthHours?: number;
  totalSessionsCount?: number;
  activeDaysLast30: number;
  averageSessionHours: number;
  completionAveragePercent: number;
  currentStreakDays: number;
  weeklyActivity: DailyActivityPoint[];
  monthlyActivity: MonthlyActivityPoint[];
  platformBreakdown: PlatformPlaytimeBreakdown[];
  genreBreakdown: GenrePlaytimeBreakdown[];
  recentSessions?: PlaytimeSessionRecord[];
  isDemoData: boolean;
}
