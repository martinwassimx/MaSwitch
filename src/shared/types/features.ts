export type OptionalFeatureId =
  | 'yearInReview'
  | 'smartCollections'
  | 'performanceMonitor'
  | 'gameNews'
  | 'backupRestore';

export type InstallPresetId = 'minimal' | 'recommended' | 'complete' | 'custom';

export interface OptionalFeatureMeta {
  id: OptionalFeatureId;
  name: string;
  category: 'analytics' | 'organization' | 'monitoring' | 'content' | 'maintenance';
  description: string;
  ramImpactLabel: string;
  cpuImpactLabel: string;
  diskImpactBytes: number;
  diskImpactLabel: string;
  defaultInPreset: Record<Exclude<InstallPresetId, 'custom'>, boolean>;
}

export const OPTIONAL_FEATURES_METADATA: Record<OptionalFeatureId, OptionalFeatureMeta> = {
  yearInReview: {
    id: 'yearInReview',
    name: 'Gaming Year in Review',
    category: 'analytics',
    description:
      'Annual gaming recap card with playtime milestones, 365-day activity heatmaps, top 5 games, temporal trends, and offline PNG infographic export.',
    ramImpactLabel: '0 MB idle (loaded into memory only when tab is viewed)',
    cpuImpactLabel: '0.0% idle (0 background calculations or timers)',
    diskImpactBytes: 350 * 1024,
    diskImpactLabel: '~350 KB (UI charts, SVG assets, aggregation logic)',
    defaultInPreset: {
      minimal: false,
      recommended: false,
      complete: true,
    },
  },
  smartCollections: {
    id: 'smartCollections',
    name: 'Smart Game Collections',
    category: 'organization',
    description:
      'Organize your gaming library into custom manual collections or dynamic rule-based folders (by platform, favorites, playtime range, or installation status).',
    ramImpactLabel: '0 MB idle (evaluated in-memory on demand)',
    cpuImpactLabel: '0.0% idle (no background indexing or scanning)',
    diskImpactBytes: 250 * 1024,
    diskImpactLabel: '~250 KB (collection manager, rule evaluator, icons)',
    defaultInPreset: {
      minimal: false,
      recommended: true,
      complete: true,
    },
  },
  performanceMonitor: {
    id: 'performanceMonitor',
    name: 'Lightweight Performance Monitor',
    category: 'monitoring',
    description:
      'Real-time system CPU, RAM, and MaSwitch process resource tracking with zero background polling. Displays graceful fallback for unsupported sensors.',
    ramImpactLabel: '0 MB idle (< 2 MB while actively viewing dashboard)',
    cpuImpactLabel: '0.0% idle (polling timer destroyed immediately when hidden)',
    diskImpactBytes: 180 * 1024,
    diskImpactLabel: '~180 KB (native CPU delta calculator, sparklines)',
    defaultInPreset: {
      minimal: false,
      recommended: false,
      complete: true,
    },
  },
  gameNews: {
    id: 'gameNews',
    name: 'Game Updates & News',
    category: 'content',
    description:
      'Official Steamworks patch notes, major game updates, and community news for your installed library games with 1-hour offline caching.',
    ramImpactLabel: '0 MB idle (cached in memory on demand)',
    cpuImpactLabel: '0.0% idle (no background web requests; manual or on-view refresh only)',
    diskImpactBytes: 300 * 1024,
    diskImpactLabel: '~300 KB (Steamworks API client, feed sanitizers)',
    defaultInPreset: {
      minimal: false,
      recommended: false,
      complete: true,
    },
  },
  backupRestore: {
    id: 'backupRestore',
    name: 'Backup & Restore',
    category: 'maintenance',
    description:
      '100% offline versioned JSON archive creator with SHA-256 manifest verification and pre-restore safety snapshots. DPAPI secrets are strictly isolated.',
    ramImpactLabel: '0 MB idle',
    cpuImpactLabel: '0.0% idle (runs only when creating or restoring backups)',
    diskImpactBytes: 220 * 1024,
    diskImpactLabel: '~220 KB (archive serializer, checksum validator)',
    defaultInPreset: {
      minimal: false,
      recommended: true,
      complete: true,
    },
  },
};

export const PRESET_CONFIGURATIONS: Record<
  InstallPresetId,
  {
    name: string;
    tagline: string;
    description: string;
    features: Record<OptionalFeatureId, boolean>;
  }
> = {
  minimal: {
    name: 'Minimal',
    tagline: 'Ultra-lightweight core setup for low-end PCs',
    description:
      'Installs only the essential game library, account management, DPAPI vault, and Riot automatic login. Zero optional features.',
    features: {
      yearInReview: false,
      smartCollections: false,
      performanceMonitor: false,
      gameNews: false,
      backupRestore: false,
    },
  },
  recommended: {
    name: 'Recommended',
    tagline: 'Balanced setup for most gamers',
    description:
      'Includes core MaSwitch plus Smart Game Collections and Backup & Restore for complete data safety with minimal resource overhead.',
    features: {
      yearInReview: false,
      smartCollections: true,
      performanceMonitor: false,
      gameNews: false,
      backupRestore: true,
    },
  },
  complete: {
    name: 'Complete',
    tagline: 'Full-featured premium experience',
    description:
      'Installs all five optional components including Year in Review, Performance Monitor, and Game News.',
    features: {
      yearInReview: true,
      smartCollections: true,
      performanceMonitor: true,
      gameNews: true,
      backupRestore: true,
    },
  },
  custom: {
    name: 'Custom',
    tagline: 'Tailor each component to your exact hardware',
    description:
      'Select and configure each optional feature individually according to your preferences and system capabilities.',
    features: {
      yearInReview: false,
      smartCollections: true,
      performanceMonitor: false,
      gameNews: false,
      backupRestore: true,
    },
  },
};

export interface InstalledFeatureState {
  installed: boolean;
  enabled: boolean;
  installedAtIso?: string;
}

export interface InstalledFeaturesManifest {
  manifestVersion: '1.0.0';
  appVersion: string;
  preset: InstallPresetId;
  installedAtIso: string;
  updatedAtIso: string;
  features: Record<OptionalFeatureId, InstalledFeatureState>;
  isInstallerManaged: boolean;
  installerPath?: string | null;
}
