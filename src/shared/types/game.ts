import type { PlatformId } from './platform';

export interface GameScreenshot {
  id: string;
  title: string;
  caption: string;
  imageUrl: string;
  resolution: string;
}

export interface GameTrailer {
  id: string;
  title: string;
  duration: string;
  resolution: string;
  frameRate: string;
  thumbnailUrl: string;
  description: string;
  releaseTag: string;
}

export interface GameRatingInfo {
  overallScore: number; // Out of 100 (0 when unavailable)
  userScore: number; // Out of 10 (0 when unavailable)
  criticScore: number; // Out of 100 (0 when unavailable)
  reviewSummary: string;
  totalReviewsLabel: string;
  ageRating: string;
  contentDescriptors: string[];
}

export interface SystemRequirementSpec {
  os: string;
  processor: string;
  memory: string;
  graphics: string;
  directX: string;
  storage: string;
  additionalNotes?: string;
}

export interface GameSystemRequirements {
  minimum: SystemRequirementSpec;
  recommended: SystemRequirementSpec;
}

export interface GameOwnershipInfo {
  accountSlotLabel: string;
  licenseType:
    | 'Full Digital License'
    | 'Deluxe Edition License'
    | 'Free-to-Play Entitlement'
    | 'Collector Edition'
    | 'Local Installed Manifest'
    | 'Custom Executable Entry';
  acquiredDateLabel: string;
  drmSystem: string;
  installSizeGb: number;
  installLocationPreview: string;
  buildVersion: string;
}

export interface SteamAchievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAtLabel?: string;
  globalUnlockPercentage: number;
  isRare: boolean;
  pointsLabel: string;
}

export interface GameAchievementsBundle {
  supported: boolean;
  platformSource:
    | 'Steamworks Achievements (Demo)'
    | 'Steam Local Manifest (Metadata API Not Configured)'
    | 'Not Available';
  unlockedCount: number;
  totalCount: number;
  completionPercentage: number;
  items: SteamAchievement[];
}

export type GameSourceType =
  | 'steam'
  | 'epic'
  | 'gog'
  | 'ea'
  | 'ubisoft'
  | 'riot'
  | 'rockstar'
  | 'windows-registry'
  | 'custom-folder'
  | 'custom-manual'
  | 'demo';

export type GameLaunchMethod =
  | 'auto'
  | 'steam-protocol'
  | 'epic-protocol'
  | 'ea-protocol'
  | 'ubisoft-protocol'
  | 'gog-protocol'
  | 'rockstar-protocol'
  | 'riot-services'
  | 'executable'
  | 'unavailable';

export type GameClassification =
  | 'verified-game'
  | 'probable-game'
  | 'custom-app'
  | 'non-game';

export type GameLaunchState =
  | 'idle'
  | 'launching'
  | 'running'
  | 'failed'
  | 'not-installed'
  | 'launcher-unavailable';

export interface GameItem {
  id: string;
  title: string;
  subtitle: string;
  platformId: PlatformId;
  platformName: string;
  developer: string;
  publisher: string;
  releaseYear: number;
  releaseDateLabel: string;
  genres: string[];
  tags: string[];
  isInstalled: boolean;
  isFeatured?: boolean;
  playtimeHours: number;
  recentTwoWeeksHours: number;
  lastPlayedIso: string | null;
  lastPlayedLabel: string;
  coverImage: string;
  iconImage?: string;
  heroBackgroundImage: string;
  accentHex: string;
  shortDescription: string;
  fullDescription: string[];
  keyFeatures: string[];
  screenshots: GameScreenshot[];
  trailers: GameTrailer[];
  rating: GameRatingInfo;
  systemRequirements: GameSystemRequirements;
  ownership: GameOwnershipInfo;
  achievements: GameAchievementsBundle;
  isDemoData: boolean;

  // Phase 2 Real Local Library & Launcher Fields
  sourceType?: GameSourceType;
  externalAppId?: string | null;
  installPath?: string | null;
  executablePath?: string | null;
  executableName?: string | null;
  workingDirectory?: string | null;
  launchArgs?: string | null;
  launchMethod?: GameLaunchMethod;
  launchUri?: string | null;
  confidenceScore?: number;
  classification?: GameClassification;
  metadataAvailable?: boolean;
  userPlatformOverride?: PlatformId | null;
  isUserEdited?: boolean;
  logoImage?: string;
  sgdbGameId?: number | null;
  userCoverOverride?: string | null;
  userHeroOverride?: string | null;
  userLogoOverride?: string | null;
  userIconOverride?: string | null;
  isArtworkUserEdited?: boolean;
}

export interface EditGameInput {
  title?: string;
  platformId?: PlatformId;
  executablePath?: string;
  installPath?: string;
  launchMethod?: GameLaunchMethod;
  externalAppId?: string | null;
  launchUri?: string | null;
  launchArgs?: string | null;
  workingDirectory?: string | null;
}

export interface CustomGameInput {
  title: string;
  executablePath: string;
  workingDirectory?: string;
  launchArgs?: string;
  platformId?: PlatformId;
  launchMethod?: GameLaunchMethod;
  externalAppId?: string | null;
  coverImage?: string;
  classification?: 'verified-game' | 'custom-app';
}

export type GameLaunchErrorCategory =
  | 'file-not-found'
  | 'permission-denied'
  | 'protocol-unavailable'
  | 'drm-anti-cheat-barrier'
  | 'corrupted-installation'
  | 'cancelled'
  | 'unknown';

export interface GameLaunchDiagnostics {
  gameId: string;
  gameTitle: string;
  platformId: PlatformId;
  launchMethod: string;
  executablePath?: string | null;
  executableExists: boolean;
  workingDirectory?: string | null;
  workingDirectoryExists: boolean;
  errorCategory: GameLaunchErrorCategory;
  technicalDetails?: string;
  troubleshootingAdvice: string;
}

export interface GameLaunchResult {
  success: boolean;
  gameId: string;
  status: GameLaunchState;
  message: string;
  pid?: number;
  startedAtIso?: string;
  diagnostics?: GameLaunchDiagnostics;
}

export type LibrarySortField =
  | 'title'
  | 'playtimeHours'
  | 'lastPlayed'
  | 'rating'
  | 'releaseYear';

export type SortDirection = 'asc' | 'desc';

export type LibraryViewMode = 'grid' | 'list';

export type InstallStatusFilter = 'all' | 'installed' | 'uninstalled';
