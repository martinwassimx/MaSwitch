import type { GameAchievementsBundle, GameItem } from '../shared/types/game';

/**
 * Module 6: Game Metadata & Achievements Service (Phase 1 Foundation)
 *
 * Manages typed game metadata, ratings, system requirements, and Steam achievements
 * from the Phase 1 demonstration dataset while preparing Phase 2 Steamworks/IGDB connectors.
 */
export class MetadataAchievementService {
  public getAchievementsSummary(games: readonly GameItem[]): {
    supportedTitlesCount: number;
    totalUnlocked: number;
    totalAvailable: number;
  } {
    let supportedTitlesCount = 0;
    let totalUnlocked = 0;
    let totalAvailable = 0;

    for (const game of games) {
      if (game.achievements.supported) {
        supportedTitlesCount += 1;
        totalUnlocked += game.achievements.unlockedCount;
        totalAvailable += game.achievements.totalCount;
      }
    }

    return {
      supportedTitlesCount,
      totalUnlocked,
      totalAvailable,
    };
  }

  public getGameAchievements(game: GameItem): GameAchievementsBundle {
    return game.achievements;
  }
}

export const metadataAchievementService = new MetadataAchievementService();

