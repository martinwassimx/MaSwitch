import type {
  GameClassification,
  GameLaunchMethod,
  GameSourceType,
} from './game';
import type { PlatformDetectionReport, PlatformId } from './platform';

export type ScanPhase =
  | 'idle'
  | 'scanning-steam'
  | 'scanning-epic'
  | 'scanning-gog'
  | 'scanning-ubisoft'
  | 'scanning-riot'
  | 'scanning-ea'
  | 'scanning-rockstar'
  | 'scanning-registry'
  | 'scanning-folders'
  | 'saving'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface ScanProgressPayload {
  scanId: string;
  phase: ScanPhase;
  message: string;
  percent: number;
  discoveredCount: number;
}

export interface DiscoveredGameCandidate {
  title: string;
  subtitle?: string;
  platformId: PlatformId;
  platformName: string;
  sourceType: GameSourceType;
  externalAppId: string | null;
  developer: string;
  publisher: string;
  installPath: string | null;
  executablePath: string | null;
  executableName: string | null;
  workingDirectory: string | null;
  launchArgs: string | null;
  launchMethod: GameLaunchMethod;
  launchUri: string | null;
  isInstalled: boolean;
  installSizeBytes: number;
  buildVersion: string;
  confidenceScore: number;
  classification: GameClassification;
  coverImage?: string;
  heroImage?: string;
  iconImage?: string;
}

export interface PlatformScanDiagnostic {
  platformId: PlatformId;
  platformName: string;
  status: 'detected' | 'not-found' | 'unsupported' | 'error';
  pathsSearched: string[];
  manifestFilesFound: number;
  gamesDiscoveredCount: number;
  detectedGames: Array<{
    title: string;
    installPath: string | null;
    executablePath: string | null;
    launchMethod: string;
  }>;
  details?: string;
  warningsOrErrors?: string[];
}

export interface ScanDiagnostics {
  timestamp: string;
  durationMs: number;
  platformsChecked: PlatformScanDiagnostic[];
  commonFoldersSearched: string[];
  totalDiscovered: number;
  totalUniqueSaved: number;
  duplicatesSkipped: number;
  warnings: string[];
  errors: string[];
}

export interface ScanResultSummary {
  scanId: string;
  status: 'completed' | 'cancelled' | 'failed';
  startedAtIso: string;
  finishedAtIso: string;
  totalFound: number;
  addedOrUpdatedCount: number;
  duplicatesSkipped: number;
  platformReports: PlatformDetectionReport[];
  errors: string[];
  diagnostics?: ScanDiagnostics;
}

