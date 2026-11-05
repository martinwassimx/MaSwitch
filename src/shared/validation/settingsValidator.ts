import {
  DEFAULT_SETTINGS,
  DEFAULT_EXCLUDED_APPLICATIONS,
  type AccentColorId,
  type ExcludedApplicationRule,
  type MaSwitchSettings,
  type NavigationSection,
  type ThemePresetId,
  type WindowCloseBehavior,
} from '../types/settings';
import type { LibraryViewMode } from '../types/game';

const VALID_THEMES: readonly ThemePresetId[] = [
  'dark-graphite',
  'deep-navy',
  'obsidian-contrast',
];

const VALID_ACCENTS: readonly AccentColorId[] = [
  'electric-blue',
  'cyber-violet',
  'neon-cyan',
  'emerald-pulse',
  'crimson-core',
];

const VALID_VIEWS: readonly LibraryViewMode[] = ['grid', 'list'];

const VALID_SECTIONS: readonly NavigationSection[] = [
  'home',
  'library',
  'accounts',
  'platforms',
  'statistics',
  'performance',
  'news',
  'settings',
];

const VALID_CLOSE_BEHAVIORS: readonly WindowCloseBehavior[] = [
  'minimize-to-tray',
  'exit',
];

export function sanitizeSettings(
  input: unknown,
  fallback: MaSwitchSettings = DEFAULT_SETTINGS
): MaSwitchSettings {
  if (!input || typeof input !== 'object') {
    return {
      ...fallback,
      favoriteGameIds: [...fallback.favoriteGameIds],
      customScanFolders: [...fallback.customScanFolders],
    };
  }

  const raw = input as Record<string, unknown>;

  const theme = VALID_THEMES.includes(raw.theme as ThemePresetId)
    ? (raw.theme as ThemePresetId)
    : fallback.theme;

  const accentColor = VALID_ACCENTS.includes(raw.accentColor as AccentColorId)
    ? (raw.accentColor as AccentColorId)
    : fallback.accentColor;

  const defaultLibraryView = VALID_VIEWS.includes(
    raw.defaultLibraryView as LibraryViewMode
  )
    ? (raw.defaultLibraryView as LibraryViewMode)
    : fallback.defaultLibraryView;

  const defaultLandingPage = VALID_SECTIONS.includes(
    raw.defaultLandingPage as NavigationSection
  )
    ? (raw.defaultLandingPage as NavigationSection)
    : fallback.defaultLandingPage;

  const closeBehavior = VALID_CLOSE_BEHAVIORS.includes(
    raw.closeBehavior as WindowCloseBehavior
  )
    ? (raw.closeBehavior as WindowCloseBehavior)
    : fallback.closeBehavior;

  const favoriteGameIds = Array.isArray(raw.favoriteGameIds)
    ? Array.from(
        new Set(
          raw.favoriteGameIds.filter(
            (id): id is string =>
              typeof id === 'string' &&
              id.length > 0 &&
              id.length <= 120 &&
              /^[a-z0-9._-]+$/i.test(id)
          )
        )
      )
    : [...fallback.favoriteGameIds];

  const customScanFolders = Array.isArray(raw.customScanFolders)
    ? Array.from(
        new Set(
          raw.customScanFolders.filter(
            (folder): folder is string =>
              typeof folder === 'string' &&
              folder.trim().length > 0 &&
              folder.length <= 512 &&
              !folder.includes('\0')
          )
        )
      )
    : [...fallback.customScanFolders];

  const favoriteAccountIds = Array.isArray(raw.favoriteAccountIds)
    ? Array.from(
        new Set(
          raw.favoriteAccountIds.filter(
            (id): id is string =>
              typeof id === 'string' &&
              id.length > 0 &&
              id.length <= 120 &&
              /^[a-z0-9._-]+$/i.test(id)
          )
        )
      )
    : [...(fallback.favoriteAccountIds ?? [])];

  const favoritePlatformIds = Array.isArray(raw.favoritePlatformIds)
    ? Array.from(
        new Set(
          raw.favoritePlatformIds.filter(
            (id): id is string =>
              typeof id === 'string' &&
              id.length > 0 &&
              id.length <= 64 &&
              /^[a-z0-9._-]+$/i.test(id)
          )
        )
      )
    : [...(fallback.favoritePlatformIds ?? [])];

  const excludedApplications: ExcludedApplicationRule[] = Array.isArray(
    raw.excludedApplications
  )
    ? (raw.excludedApplications
        .map((entry: unknown): ExcludedApplicationRule | null => {
          if (!entry || typeof entry !== 'object') return null;
          const e = entry as Record<string, unknown>;
          if (
            typeof e.executableName !== 'string' ||
            e.executableName.trim().length === 0
          ) {
            return null;
          }
          return {
            executableName: e.executableName.trim().toLowerCase(),
            displayName:
              typeof e.displayName === 'string'
                ? e.displayName.trim()
                : undefined,
            gameId:
              typeof e.gameId === 'string' ? e.gameId.trim() : undefined,
            excludeFuture:
              typeof e.excludeFuture === 'boolean' ? e.excludeFuture : true,
            excludeHistorical:
              typeof e.excludeHistorical === 'boolean'
                ? e.excludeHistorical
                : false,
            addedAtIso:
              typeof e.addedAtIso === 'string'
                ? e.addedAtIso
                : new Date().toISOString(),
          };
        })
        .filter(
          (rule): rule is ExcludedApplicationRule => rule !== null
        ))
    : [...(fallback.excludedApplications ?? DEFAULT_EXCLUDED_APPLICATIONS)];

  return {
    theme,
    accentColor,
    animationsEnabled:
      typeof raw.animationsEnabled === 'boolean'
        ? raw.animationsEnabled
        : fallback.animationsEnabled,
    reducedMotion:
      typeof raw.reducedMotion === 'boolean'
        ? raw.reducedMotion
        : fallback.reducedMotion,
    sidebarCollapsed:
      typeof raw.sidebarCollapsed === 'boolean'
        ? raw.sidebarCollapsed
        : fallback.sidebarCollapsed,
    showSidebarCounts:
      typeof raw.showSidebarCounts === 'boolean'
        ? raw.showSidebarCounts
        : fallback.showSidebarCounts,
    compactGameCards:
      typeof raw.compactGameCards === 'boolean'
        ? raw.compactGameCards
        : fallback.compactGameCards,
    defaultLibraryView,
    defaultLandingPage,
    launchOnWindowsStartupPreference:
      typeof raw.launchOnWindowsStartupPreference === 'boolean'
        ? raw.launchOnWindowsStartupPreference
        : fallback.launchOnWindowsStartupPreference,
    startMinimizedToTrayPreference:
      typeof raw.startMinimizedToTrayPreference === 'boolean'
        ? raw.startMinimizedToTrayPreference
        : fallback.startMinimizedToTrayPreference,
    showDemoNotices:
      typeof raw.showDemoNotices === 'boolean'
        ? raw.showDemoNotices
        : fallback.showDemoNotices,
    favoriteGameIds,
    demoModeEnabled:
      typeof raw.demoModeEnabled === 'boolean'
        ? raw.demoModeEnabled
        : fallback.demoModeEnabled,
    autoScanOnStartup:
      typeof raw.autoScanOnStartup === 'boolean'
        ? raw.autoScanOnStartup
        : fallback.autoScanOnStartup,
    includeRegistryApps:
      typeof raw.includeRegistryApps === 'boolean'
        ? raw.includeRegistryApps
        : fallback.includeRegistryApps,
    customScanFolders,
    closeBehavior,
    playtimeTrackingEnabled:
      typeof raw.playtimeTrackingEnabled === 'boolean'
        ? raw.playtimeTrackingEnabled
        : fallback.playtimeTrackingEnabled,
    steamGridDbApiKey:
      typeof raw.steamGridDbApiKey === 'string'
        ? raw.steamGridDbApiKey.trim().slice(0, 128)
        : fallback.steamGridDbApiKey ?? '',
    riotLiveSwitchingEnabled:
      typeof raw.riotLiveSwitchingEnabled === 'boolean'
        ? raw.riotLiveSwitchingEnabled
        : fallback.riotLiveSwitchingEnabled ?? false,
    riotAutoSubmitLogin:
      typeof raw.riotAutoSubmitLogin === 'boolean'
        ? raw.riotAutoSubmitLogin
        : fallback.riotAutoSubmitLogin ?? true,
    lowEndPcMode:
      typeof raw.lowEndPcMode === 'boolean'
        ? raw.lowEndPcMode
        : fallback.lowEndPcMode ?? false,
    gameAwarePerformanceMode:
      typeof raw.gameAwarePerformanceMode === 'boolean'
        ? raw.gameAwarePerformanceMode
        : fallback.gameAwarePerformanceMode ?? true,
    favoriteAccountIds,
    favoritePlatformIds,
    excludedApplications,
    notificationsEnabled:
      typeof raw.notificationsEnabled === 'boolean'
        ? raw.notificationsEnabled
        : fallback.notificationsEnabled ?? true,
    suppressNotificationsInGame:
      typeof raw.suppressNotificationsInGame === 'boolean'
        ? raw.suppressNotificationsInGame
        : fallback.suppressNotificationsInGame ?? true,
  };
}

export function isTrustedRendererUrl(
  senderUrl: string | undefined,
  devServerUrl?: string
): boolean {
  if (!senderUrl || typeof senderUrl !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(senderUrl);
    if (parsed.protocol === 'file:') {
      return true;
    }
    if (devServerUrl) {
      const devParsed = new URL(devServerUrl);
      return (
        parsed.protocol === devParsed.protocol &&
        parsed.host === devParsed.host
      );
    }
    return false;
  } catch {
    return false;
  }
}
