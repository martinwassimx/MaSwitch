import type { PlatformId } from './platform';

export interface YearInReviewTopGame {
  gameId: string;
  title: string;
  platformId: PlatformId;
  coverImage?: string;
  iconImage?: string;
  hoursPlayed: number;
  sessionCount: number;
  percentageOfYear: number;
}

export interface YearInReviewMonthBreakdown {
  month: number; // 1-12
  monthName: string; // "January", "February", etc.
  shortName: string; // "Jan", "Feb", etc.
  hoursPlayed: number;
  sessionsCount: number;
}

export interface YearInReviewDayOfWeekBreakdown {
  dayIndex: number; // 0 (Sun) to 6 (Sat)
  dayName: string; // "Sunday", "Monday", etc.
  hoursPlayed: number;
  sessionCount: number;
}

export interface YearInReviewCalendarDay {
  date: string; // "YYYY-MM-DD"
  minutes: number;
  hours: number;
  sessionCount: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface YearInReviewLongestSession {
  gameId: string;
  gameTitle: string;
  platformId: PlatformId;
  durationMinutes: number;
  durationHours: number;
  startedAtIso: string;
}

export interface YearInReviewComparison {
  previousYear: number;
  previousYearHours: number;
  hoursDiff: number;
  percentageChange: number | null;
}

export interface YearInReviewData {
  year: number;
  totalGamingHours: number;
  totalSessions: number;
  uniqueGamesCount: number;
  averageSessionMinutes: number;
  topGames: YearInReviewTopGame[];
  mostActiveMonth: YearInReviewMonthBreakdown | null;
  mostActiveDayOfWeek: YearInReviewDayOfWeekBreakdown | null;
  longestSession: YearInReviewLongestSession | null;
  monthlyPlaytime: YearInReviewMonthBreakdown[];
  dayOfWeekPlaytime: YearInReviewDayOfWeekBreakdown[];
  activityCalendar: YearInReviewCalendarDay[];
  comparison: YearInReviewComparison | null;
  hasData: boolean;
}

