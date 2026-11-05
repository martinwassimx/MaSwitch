export type PlatformId =
  | 'steam'
  | 'epic'
  | 'gog'
  | 'riot'
  | 'ea'
  | 'ubisoft'
  | 'rockstar'
  | 'discord'
  | 'custom';

export type PlatformConnectionState =
  | 'detected'
  | 'disconnected'
  | 'preview-ready'
  | 'planned';

export type LibrarySyncStatus =
  | 'local-scan-active'
  | 'not-configured'
  | 'phase-2-scheduled'
  | 'demo-preview'
  | 'not-applicable';

export type CapabilityReadiness = 'active' | 'phase-2' | 'phase-3' | 'not-applicable';

export interface PlatformCapabilities {
  multiAccountSwitch: CapabilityReadiness;
  librarySync: CapabilityReadiness;
  installedScan: CapabilityReadiness;
  gameLaunch: CapabilityReadiness;
  playtimeTracking: CapabilityReadiness;
  achievements: CapabilityReadiness;
}

export interface PlatformInfo {
  id: PlatformId;
  name: string;
  shortName: string;
  vendor: string;
  category: 'game-launcher' | 'social-platform' | 'custom-executable';
  description: string;
  connectionState: PlatformConnectionState;
  syncStatus: LibrarySyncStatus;
  accentColor: string;
  secondaryColor: string;
  accountMechanismNote: string;
  demoLibraryCount: number;
  demoAccountCount: number;
  capabilities: PlatformCapabilities;
  phaseRoadmapNote: string;
  isDemoData: boolean;
}

export interface PlatformDetectionReport {
  platformId: PlatformId;
  platformName: string;
  supported: boolean;
  status: 'detected' | 'not-found' | 'unsupported' | 'error';
  detectedInstallPath: string | null;
  gamesDetectedCount: number;
  detectionMethod: string;
  limitationNote?: string;
}
