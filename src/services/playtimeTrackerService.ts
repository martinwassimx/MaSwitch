import type { StatisticsOverview } from '../shared/types/statistics';
import { DEMO_STATISTICS } from './demoData/demoStatistics';

/**
 * Module 5: Background Playtime Tracking Service (Phase 1 Foundation)
 *
 * Returns clearly labeled demonstration analytics in Phase 1 while preparing
 * the service contract for Phase 2 Windows process monitoring & playtime aggregation.
 */
export class PlaytimeTrackerService {
  public getDemoStatistics(): StatisticsOverview {
    return DEMO_STATISTICS;
  }

  public getTrackerPhaseStatus(): {
    activeMonitoring: false;
    targetPhase: 'Phase 2';
    description: string;
  } {
    return {
      activeMonitoring: false,
      targetPhase: 'Phase 2',
      description:
        'Background Windows process telemetry and session duration logging will be activated in Phase 2.',
    };
  }
}

export const playtimeTrackerService = new PlaytimeTrackerService();

