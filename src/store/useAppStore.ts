import { create } from 'zustand';
import type {
  RiotDesktopLoginProgressPayload,
  RiotDesktopLoginResultPayload,
} from '../shared/types/ipc';
import type {
  AccountProfile,
  AccountSwitchResult,
  ActivePlatformProfile,
  CreateAccountProfileInput,
  GameAccountAssociation,
  PlatformAccountGroup,
  PlatformCapabilities as AccountPlatformCapabilities,
  PlatformLauncherStatus,
  UpdateAccountProfileInput,
  RiotAccountEnrollmentResult,
  RiotLiveSwitchResult,
  RiotRecoveryResult,
} from '../shared/types/account';
import {
  DEMO_ACCOUNT_PROFILES,
  DEMO_GAME_ACCOUNT_ASSOCIATIONS,
} from '../services/demoData/demoAccountProfiles';
import type {
  CustomGameInput,
  EditGameInput,
  GameItem,
  GameLaunchDiagnostics,
  GameLaunchResult,
  GameLaunchState,
  InstallStatusFilter,
  LibrarySortField,
  LibraryViewMode,
  SortDirection,
} from '../shared/types/game';
import type {
  PlatformDetectionReport,
  PlatformId,
  PlatformInfo,
} from '../shared/types/platform';
import type {
  ScanProgressPayload,
  ScanResultSummary,
} from '../shared/types/scanner';
import {
  type AppRuntimeInfo,
  type ExcludedApplicationRule,
  type MaSwitchSettings,
  type NavigationSection,
  type WindowsStartupState,
} from '../shared/types/settings';
import type {
  PlaytimeTrackerStatus,
  StatisticsOverview,
} from '../shared/types/statistics';
import type {
  ApplyArtworkInput,
  ArtworkSyncProgress,
  SteamGridDbStatus,
} from '../shared/types/steamgriddb';
import type { YearInReviewData } from '../shared/types/yearInReview';
import type {
  CollectionItem,
  CreateCollectionInput,
  UpdateCollectionInput,
} from '../shared/types/collection';
import type { PerformanceMetrics } from '../shared/types/performance';
import type { GameNewsFeedResult } from '../shared/types/news';
import type {
  BackupInfo,
  BackupValidationResult,
  RestoreResult,
} from '../shared/types/backup';
import type {
  InstalledFeaturesManifest,
  InstallPresetId,
  OptionalFeatureId,
} from '../shared/types/features';
import {
  OPTIONAL_FEATURES_METADATA,
  PRESET_CONFIGURATIONS,
} from '../shared/types/features';
import { sanitizeSettings } from '../shared/validation/settingsValidator';
import { accountManagerService } from '../services/accountManagerService';
import { gameLauncherService } from '../services/gameLauncherService';
import { librarySyncService } from '../services/librarySyncService';
import { localDatabaseService } from '../services/localDatabaseService';
import { playtimeTrackerService } from '../services/playtimeTrackerService';

export interface AppStoreState {
  isHydrated: boolean;
  activeSection: NavigationSection;
  previousSection: NavigationSection;
  selectedGameId: string | null;
  inspectedLibraryGameId: string;

  // Library controls
  searchQuery: string;
  platformFilter: 'all' | PlatformId;
  installFilter: InstallStatusFilter;
  favoritesOnly: boolean;
  sortBy: LibrarySortField;
  sortDirection: SortDirection;
  viewMode: LibraryViewMode;

  // Domain data (Real SQLite vs Demo Mode)
  games: GameItem[];
  realGames: GameItem[];
  demoGames: GameItem[];
  platforms: PlatformInfo[];
  accountGroups: PlatformAccountGroup[];
  statistics: StatisticsOverview;
  realStatistics: StatisticsOverview;
  demoStatistics: StatisticsOverview;

  // Phase 2 Scanner, Launcher, Tracker, and Windows Startup state
  isScanning: boolean;
  scanProgress: ScanProgressPayload | null;
  lastScanSummary: ScanResultSummary | null;
  scanError: string | null;
  showScanBanner: boolean;
  platformReports: PlatformDetectionReport[];
  launchStatuses: Record<string, GameLaunchState>;
  launchMessages: Record<string, string>;
  launchDiagnostics: Record<string, GameLaunchDiagnostics>;
  trackerStatus: PlaytimeTrackerStatus;
  windowsStartupState: WindowsStartupState | null;

  // SteamGridDB artwork state
  steamGridDbStatus: SteamGridDbStatus;
  artworkSyncProgress: ArtworkSyncProgress | null;
  isSavingSteamGridDbKey: boolean;
  isSyncingArtwork: boolean;

  // Phase 6 Multi-Account Management
  accountProfiles: AccountProfile[];
  realAccountProfiles: AccountProfile[];
  demoAccountProfiles: AccountProfile[];
  activePlatformProfiles: Record<PlatformId, ActivePlatformProfile>;
  demoActiveProfiles: Record<PlatformId, ActivePlatformProfile>;
  platformCapabilities: Record<PlatformId, AccountPlatformCapabilities>;
  launcherStatuses: Record<PlatformId, PlatformLauncherStatus>;
  gameAccountAssociations: GameAccountAssociation[];
  activeSwitchResult: AccountSwitchResult | null;
  pendingSwitchAccountId: string | null;
  isSwitchingAccount: boolean;
  isConfirmingSwitch: boolean;
  switchError: string | null;

  // Phase 12 Production Riot Live Switching
  enrolledRiotProfileIds: string[];
  isEnrollingRiot: boolean;
  isLiveSwitchingRiot: boolean;
  riotLiveSwitchError: string | null;
  lastRiotLiveSwitchResult: RiotLiveSwitchResult | null;
  riotCredentialStatuses: Record<string, { hasSavedCredentials: boolean; username?: string; updatedAtIso?: string }>;
  isSavingRiotCredentials: boolean;
  riotCredentialError: string | null;
  riotLoginAutomationProgress: RiotDesktopLoginProgressPayload | null;
  isRiotLoginAutomating: boolean;
  riotLoginAutomationResult: RiotDesktopLoginResultPayload | null;

  // Persisted settings & runtime info
  settings: MaSwitchSettings;
  runtimeInfo: AppRuntimeInfo | null;

  // Performance & System state
  inGameMode: boolean;
  activeGameCount: number;
  isWindowVisible: boolean;

  // Actions
  initializeApp: () => Promise<void>;
  refreshLibraryAndStats: () => Promise<void>;
  setActiveSection: (section: NavigationSection) => void;
  openGameDetails: (gameId: string) => void;
  closeGameDetails: () => void;
  setInspectedLibraryGameId: (gameId: string) => void;
  setInGameMode: (inGame: boolean, activeGameCount: number) => void;
  setWindowVisible: (visible: boolean) => void;

  setSearchQuery: (query: string) => void;
  setPlatformFilter: (platform: 'all' | PlatformId) => void;
  setInstallFilter: (status: InstallStatusFilter) => void;
  setFavoritesOnly: (enabled: boolean) => void;
  setSortBy: (field: LibrarySortField) => void;
  toggleSortDirection: () => void;
  setViewMode: (mode: LibraryViewMode) => void;
  resetLibraryFilters: () => void;

  toggleFavoriteGame: (gameId: string) => Promise<void>;
  toggleAccountFavorite: (accountId: string) => Promise<void>;
  togglePlatformFavorite: (platformId: string) => Promise<void>;
  updateExcludedApplication: (rule: ExcludedApplicationRule) => Promise<void>;
  removeExcludedApplication: (executableName: string) => Promise<void>;
  updateSettings: (partial: Partial<MaSwitchSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  setDemoMode: (enabled: boolean) => Promise<void>;

  // Phase 2 Engine Actions
  startGameScan: () => Promise<ScanResultSummary | null>;
  cancelGameScan: () => Promise<void>;
  clearScanError: () => void;
  dismissScanBanner: () => void;
  addCustomGame: (input: CustomGameInput) => Promise<GameItem | null>;
  editGame: (gameId: string, input: EditGameInput) => Promise<GameItem | null>;
  removeGameFromLibrary: (gameId: string) => Promise<boolean>;
  restoreGameToLibrary: (gameId: string) => Promise<boolean>;
  launchGame: (gameId: string) => Promise<GameLaunchResult>;
  updateLaunchStatus: (
    gameId: string,
    status: GameLaunchState,
    message?: string
  ) => void;
  setTrackerPaused: (paused: boolean) => Promise<void>;
  updateWindowsStartup: (config: {
    openAtLogin: boolean;
    startMinimized: boolean;
  }) => Promise<void>;

  // SteamGridDB Actions
  refreshSteamGridDbStatus: () => Promise<void>;
  saveSteamGridDbKey: (apiKey: string) => Promise<{ success: boolean; message: string }>;
  removeSteamGridDbKey: () => Promise<boolean>;
  testSteamGridDbKey: (apiKey?: string) => Promise<{ success: boolean; message: string }>;
  syncLibraryArtwork: () => Promise<void>;
  applyManualArtwork: (input: ApplyArtworkInput) => Promise<GameItem | null>;
  restoreDefaultArtwork: (gameId: string) => Promise<GameItem | null>;

  // Phase 6 Account Management Actions
  loadAccountProfiles: () => Promise<void>;
  createAccountProfile: (input: CreateAccountProfileInput) => Promise<AccountProfile | null>;
  updateAccountProfile: (id: string, input: UpdateAccountProfileInput) => Promise<AccountProfile | null>;
  deleteAccountProfile: (id: string) => Promise<boolean>;
  setPreferredAccount: (id: string) => Promise<boolean>;
  switchAccount: (accountId: string, forceReauth?: boolean) => Promise<AccountSwitchResult>;
  confirmAccountSwitch: (accountId: string) => Promise<boolean>;
  clearActiveProfile: (platformId: PlatformId) => Promise<boolean>;
  cancelSwitchWorkflow: () => void;
  openPlatformLauncher: (platformId: PlatformId) => Promise<boolean>;
  setGameAccountAssociation: (gameId: string, accountProfileId: string | null) => Promise<boolean>;
  refreshLauncherStatuses: () => Promise<void>;

  addPreviewAccountSlot: (platformId: PlatformId, customAlias?: string) => void;
  removePreviewAccountSlot: (platformId: PlatformId, accountId: string) => void;

  // Phase 12 Riot Live Switching Actions
  loadEnrolledRiotProfiles: () => Promise<void>;
  enrollRiotProfile: (profileId: string, consentGiven: boolean) => Promise<RiotAccountEnrollmentResult>;
  removeEnrolledRiotProfile: (profileId: string) => Promise<boolean>;
  liveSwitchRiotProfile: (profileId: string) => Promise<RiotLiveSwitchResult>;
  recoverRiotLiveSwitch: () => Promise<RiotRecoveryResult>;
  clearRiotLiveSwitchError: () => void;
  loadRiotCredentialStatuses: () => Promise<void>;
  saveRiotCredentials: (profileId: string, username: string, password: string) => Promise<{ success: boolean; updatedAtIso: string }>;
  deleteRiotCredentials: (profileId: string) => Promise<boolean>;
  getRiotLoginCredentials: (profileId: string) => Promise<{ username: string; password: string } | null>;
  checkRiotClientRunning: () => Promise<boolean>;
  launchRiotClient: () => Promise<{ success: boolean; message: string }>;
  clearRiotCredentialError: () => void;
  startRiotDesktopLogin: (profileId: string, autoLaunchClient?: boolean, autoSubmit?: boolean, isSyntheticTest?: boolean, targetHwnd?: string, targetPid?: number) => Promise<RiotDesktopLoginResultPayload>;
  cancelRiotDesktopLogin: () => Promise<void>;
  clearRiotLoginAutomationProgress: () => void;

  // Feature 1: Year in Review
  availableYears: number[];
  selectedYear: number;
  yearInReviewData: YearInReviewData | null;
  yearInReviewLoading: boolean;
  loadYearInReview: (year?: number) => Promise<void>;
  setSelectedYear: (year: number) => void;

  // Feature 2: Smart Collections
  collections: CollectionItem[];
  activeCollectionId: string | null;
  collectionsLoading: boolean;
  loadCollections: () => Promise<void>;
  createCollection: (input: CreateCollectionInput) => Promise<CollectionItem | null>;
  updateCollection: (input: UpdateCollectionInput) => Promise<boolean>;
  deleteCollection: (id: string) => Promise<boolean>;
  addGameToCollection: (collectionId: string, gameId: string) => Promise<boolean>;
  removeGameFromCollection: (collectionId: string, gameId: string) => Promise<boolean>;
  setCollectionGameOrder: (collectionId: string, gameIds: string[]) => Promise<boolean>;
  setActiveCollectionId: (id: string | null) => void;

  // Feature 3: Performance Monitor
  performanceMetrics: PerformanceMetrics | null;
  metricsHistory: PerformanceMetrics[];
  monitoringActive: boolean;
  monitoringIntervalMs: number;
  setPerformanceMonitoringActive: (active: boolean, intervalMs?: number) => Promise<void>;
  fetchPerformanceMetrics: () => Promise<PerformanceMetrics | null>;

  // Feature 4: Game Updates & News
  newsFeed: GameNewsFeedResult | null;
  newsLoading: boolean;
  newsFilterGameId: string | null;
  newsFilterPlatformId: string | null;
  loadNews: (options?: { forceRefresh?: boolean }) => Promise<void>;
  setNewsFilterGameId: (gameId: string | null) => void;
  setNewsFilterPlatformId: (platformId: string | null) => void;
  openNewsArticle: (url: string) => Promise<boolean>;

  // Feature 5: Backup & Restore
  backupInfo: BackupInfo | null;
  backupValidation: BackupValidationResult | null;
  backupLoading: boolean;
  backupFeedback: { type: 'success' | 'error'; message: string } | null;
  loadBackupInfo: () => Promise<void>;
  createBackup: (customPath?: string) => Promise<boolean>;
  validateBackupFile: (filePath: string) => Promise<BackupValidationResult | null>;
  restoreBackupFile: (filePath: string) => Promise<RestoreResult>;
  clearBackupFeedback: () => void;

  // Modular Features & Installer Gating
  featuresManifest: InstalledFeaturesManifest | null;
  featuresLoading: boolean;
  featuresFeedback: { type: 'success' | 'error'; message: string } | null;
  loadFeaturesManifest: () => Promise<void>;
  setFeatureEnabled: (featureId: OptionalFeatureId, enabled: boolean) => Promise<boolean>;
  applyInstallPreset: (presetId: InstallPresetId) => Promise<boolean>;
  launchInstallerModify: () => Promise<{ success: boolean; message?: string }>;
  clearFeaturesFeedback: () => void;
}

const initialSettings = localDatabaseService.readCachedSettings();
const initialDemoGames = librarySyncService.getDemoLibrary();
const initialDemoStats = playtimeTrackerService.getDemoStatistics();

const emptyRealStats: StatisticsOverview = {
  totalGamingHours: 0,
  todayHours: 0,
  thisWeekHours: 0,
  thisMonthHours: 0,
  totalSessionsCount: 0,
  activeDaysLast30: 0,
  averageSessionHours: 0,
  completionAveragePercent: 0,
  currentStreakDays: 0,
  weeklyActivity: [],
  monthlyActivity: [],
  platformBreakdown: [],
  genreBreakdown: [],
  recentSessions: [],
  isDemoData: false,
};

export const useAppStore = create<AppStoreState>((set, get) => ({
  isHydrated: false,
  activeSection: initialSettings.defaultLandingPage,
  previousSection: 'home',
  selectedGameId: null,
  inspectedLibraryGameId: initialDemoGames[0]?.id ?? 'cyber-odyssey-2099',

  searchQuery: '',
  platformFilter: 'all',
  installFilter: 'all',
  favoritesOnly: false,
  sortBy: 'playtimeHours',
  sortDirection: 'desc',
  viewMode: initialSettings.defaultLibraryView,

  games: initialSettings.demoModeEnabled ? initialDemoGames : [],
  realGames: [],
  demoGames: initialDemoGames,
  platforms: librarySyncService.getSupportedPlatforms(),
  accountGroups: accountManagerService.getInitialPreviewGroups(),
  statistics: initialSettings.demoModeEnabled
    ? initialDemoStats
    : emptyRealStats,
  realStatistics: emptyRealStats,
  demoStatistics: initialDemoStats,

  isScanning: false,
  scanProgress: null,
  lastScanSummary: null,
  scanError: null,
  showScanBanner: false,
  platformReports: [],
  launchStatuses: {},
  launchMessages: {},
  launchDiagnostics: {},
  trackerStatus: {
    enabled: initialSettings.playtimeTrackingEnabled,
    paused: false,
    activeSessions: [],
  },
  windowsStartupState: null,

  steamGridDbStatus: {
    isConfigured: false,
    isValid: null,
    statusText: 'not-configured',
    lastCheckedIso: null,
  },
  artworkSyncProgress: null,
  isSavingSteamGridDbKey: false,
  isSyncingArtwork: false,

  // Phase 6 Multi-Account Management
  accountProfiles: initialSettings.demoModeEnabled ? DEMO_ACCOUNT_PROFILES : [],
  realAccountProfiles: [],
  demoAccountProfiles: DEMO_ACCOUNT_PROFILES,
  activePlatformProfiles: {} as Record<PlatformId, ActivePlatformProfile>,
  demoActiveProfiles: {} as Record<PlatformId, ActivePlatformProfile>,
  platformCapabilities: {} as Record<PlatformId, AccountPlatformCapabilities>,
  launcherStatuses: {} as Record<PlatformId, PlatformLauncherStatus>,
  gameAccountAssociations: initialSettings.demoModeEnabled
    ? DEMO_GAME_ACCOUNT_ASSOCIATIONS
    : [],
  activeSwitchResult: null,
  pendingSwitchAccountId: null,
  isSwitchingAccount: false,
  isConfirmingSwitch: false,
  switchError: null,

  // Phase 12 Production Riot Live Switching Initial State
  enrolledRiotProfileIds: [],
  isEnrollingRiot: false,
  isLiveSwitchingRiot: false,
  riotLiveSwitchError: null,
  lastRiotLiveSwitchResult: null,
  riotCredentialStatuses: {},
  isSavingRiotCredentials: false,
  riotCredentialError: null,
  riotLoginAutomationProgress: null,
  isRiotLoginAutomating: false,
  riotLoginAutomationResult: null,

  settings: initialSettings,
  runtimeInfo: null,

  inGameMode: false,
  activeGameCount: 0,

  // Feature 1: Year in Review
  availableYears: [new Date().getFullYear()],
  selectedYear: new Date().getFullYear(),
  yearInReviewData: null,
  yearInReviewLoading: false,

  // Feature 2: Smart Collections
  collections: [],
  activeCollectionId: null,
  collectionsLoading: false,

  // Feature 3: Performance Monitor
  performanceMetrics: null,
  metricsHistory: [],
  monitoringActive: false,
  monitoringIntervalMs: 3000,

  // Feature 4: Game Updates & News
  newsFeed: null,
  newsLoading: false,
  newsFilterGameId: null,
  newsFilterPlatformId: null,

  // Feature 5: Backup & Restore
  backupInfo: null,
  backupValidation: null,
  backupLoading: false,
  backupFeedback: null,
  isWindowVisible: true,

  // Modular Features & Installer Gating
  featuresManifest: null,
  featuresLoading: false,
  featuresFeedback: null,

  setInGameMode: (inGame: boolean, activeGameCount: number) => {
    set({ inGameMode: inGame, activeGameCount });
  },

  setWindowVisible: (visible: boolean) => {
    set({ isWindowVisible: visible });
  },

  initializeApp: async () => {
    if (get().isHydrated) {
      return;
    }

    const [
      loadedSettings,
      runtimeInfo,
      realGames,
      realStatistics,
      launchStatuses,
      trackerStatus,
      windowsStartupState,
      platformReports,
      scanHistory,
      steamGridDbStatus,
      realAccountProfiles,
      platformCapabilities,
      launcherStatuses,
      gameAccountAssociations,
    ] = await Promise.all([
      localDatabaseService.loadSettings(),
      localDatabaseService.getRuntimeInfo(),
      localDatabaseService.getRealLibraryGames(),
      localDatabaseService.getRealStatistics(),
      gameLauncherService.getStatuses(),
      localDatabaseService.getTrackerStatus(),
      localDatabaseService.getWindowsStartupState(),
      localDatabaseService.getPlatformDetectionReports(),
      localDatabaseService.getScanHistory(),
      localDatabaseService.getSteamGridDbStatus(),
      localDatabaseService.getAccountProfiles(),
      localDatabaseService.getPlatformCapabilities(),
      localDatabaseService.getPlatformLauncherStatuses(),
      localDatabaseService.getGameAccountAssociations(),
    ]);

    if (get().isHydrated) {
      return;
    }

    const activeGames = loadedSettings.demoModeEnabled
      ? get().demoGames
      : realGames;
    const activeStats = loadedSettings.demoModeEnabled
      ? get().demoStatistics
      : realStatistics;
    const activeAccounts = loadedSettings.demoModeEnabled
      ? get().demoAccountProfiles
      : realAccountProfiles;
    const activeAssociations = loadedSettings.demoModeEnabled
      ? DEMO_GAME_ACCOUNT_ASSOCIATIONS
      : gameAccountAssociations;

    set({
      settings: loadedSettings,
      viewMode: loadedSettings.defaultLibraryView,
      activeSection: loadedSettings.defaultLandingPage,
      runtimeInfo,
      realGames,
      realStatistics,
      games: activeGames,
      statistics: activeStats,
      inspectedLibraryGameId:
        activeGames[0]?.id ?? get().inspectedLibraryGameId,
      launchStatuses,
      trackerStatus,
      windowsStartupState,
      platformReports,
      lastScanSummary: scanHistory[0] ?? null,
      steamGridDbStatus,
      realAccountProfiles,
      platformCapabilities,
      launcherStatuses,
      gameAccountAssociations: activeAssociations,
      accountProfiles: activeAccounts,
      featuresManifest: await localDatabaseService.getFeaturesManifest(),
      isHydrated: true,
    });

    localDatabaseService.onFeaturesUpdated((manifest) => {
      set({ featuresManifest: manifest });
    });

    localDatabaseService.onSteamGridDbSyncProgress((progress) => {
      set({
        artworkSyncProgress: progress,
        isSyncingArtwork: progress.status === 'syncing',
      });
    });

    localDatabaseService.onAccountsUpdated(() => {
      void get().loadAccountProfiles();
    });

    localDatabaseService.onRiotDesktopLoginProgress((progress) => {
      set({
        riotLoginAutomationProgress: progress,
        isRiotLoginAutomating:
          progress.status !== 'success' &&
          progress.status !== 'failed' &&
          progress.status !== 'cancelled' &&
          progress.status !== 'idle',
      });
    });
  },

  refreshLibraryAndStats: async () => {
    const [realGames, realStatistics, trackerStatus, platformReports] =
      await Promise.all([
        localDatabaseService.getRealLibraryGames(),
        localDatabaseService.getRealStatistics(),
        localDatabaseService.getTrackerStatus(),
        localDatabaseService.getPlatformDetectionReports(),
      ]);

    set((state) => {
      const useDemo = state.settings.demoModeEnabled;
      const nextGames = useDemo ? state.demoGames : realGames;
      return {
        realGames,
        realStatistics,
        games: nextGames,
        statistics: useDemo ? state.demoStatistics : realStatistics,
        trackerStatus,
        platformReports:
          platformReports.length > 0 ? platformReports : state.platformReports,
        inspectedLibraryGameId:
          nextGames.find((g) => g.id === state.inspectedLibraryGameId)?.id ??
          nextGames[0]?.id ??
          state.inspectedLibraryGameId,
      };
    });
  },

  setActiveSection: (section) => {
    set((state) => ({
      activeSection: section,
      previousSection: state.activeSection,
      selectedGameId: null,
    }));
  },

  openGameDetails: (gameId) => {
    set((state) => ({
      selectedGameId: gameId,
      inspectedLibraryGameId: gameId,
      previousSection: state.activeSection,
    }));
  },

  closeGameDetails: () => {
    set({
      selectedGameId: null,
    });
  },

  setInspectedLibraryGameId: (gameId) => {
    set({ inspectedLibraryGameId: gameId });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  setPlatformFilter: (platform) => {
    set({ platformFilter: platform });
  },

  setInstallFilter: (status) => {
    set({ installFilter: status });
  },

  setFavoritesOnly: (enabled) => {
    set({ favoritesOnly: enabled });
  },

  setSortBy: (field) => {
    set({ sortBy: field });
  },

  toggleSortDirection: () => {
    set((state) => ({
      sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc',
    }));
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
  },

  resetLibraryFilters: () => {
    set({
      searchQuery: '',
      platformFilter: 'all',
      installFilter: 'all',
      favoritesOnly: false,
      sortBy: 'playtimeHours',
      sortDirection: 'desc',
    });
  },

  toggleFavoriteGame: async (gameId) => {
    const current = get().settings;
    const exists = current.favoriteGameIds.includes(gameId);
    const updatedFavorites = exists
      ? current.favoriteGameIds.filter((id) => id !== gameId)
      : [...current.favoriteGameIds, gameId];

    const optimistic = sanitizeSettings(
      { ...current, favoriteGameIds: updatedFavorites },
      current
    );
    set({ settings: optimistic });

    const dbFavs = await localDatabaseService.toggleFavoriteInDb(gameId);
    if (dbFavs) {
      const synced = sanitizeSettings(
        { ...get().settings, favoriteGameIds: dbFavs },
        get().settings
      );
      set({ settings: synced });
      localDatabaseService.writeCachedSettings(synced);
    } else {
      await localDatabaseService.saveSettings(
        { favoriteGameIds: updatedFavorites },
        optimistic
      );
    }
  },

  toggleAccountFavorite: async (accountId: string) => {
    const current = get().settings;
    const favs = current.favoriteAccountIds ?? [];
    const nextFavs = favs.includes(accountId)
      ? favs.filter((id) => id !== accountId)
      : [...favs, accountId];
    await get().updateSettings({ favoriteAccountIds: nextFavs });
  },

  togglePlatformFavorite: async (platformId: string) => {
    const current = get().settings;
    const favs = current.favoritePlatformIds ?? [];
    const nextFavs = favs.includes(platformId)
      ? favs.filter((id) => id !== platformId)
      : [...favs, platformId];
    await get().updateSettings({ favoritePlatformIds: nextFavs });
  },

  updateExcludedApplication: async (rule: ExcludedApplicationRule) => {
    const current = get().settings;
    const existing = [...(current.excludedApplications ?? [])];
    const index = existing.findIndex(
      (r) => r.executableName.toLowerCase() === rule.executableName.toLowerCase()
    );
    if (index >= 0) {
      existing[index] = rule;
    } else {
      existing.push(rule);
    }
    await get().updateSettings({ excludedApplications: existing });
    await get().refreshLibraryAndStats();
  },

  removeExcludedApplication: async (executableName: string) => {
    const current = get().settings;
    const existing = (current.excludedApplications ?? []).filter(
      (r) => r.executableName.toLowerCase() !== executableName.toLowerCase()
    );
    await get().updateSettings({ excludedApplications: existing });
    await get().refreshLibraryAndStats();
  },

  updateSettings: async (partial) => {
    const current = get().settings;
    const optimistic = sanitizeSettings({ ...current, ...partial }, current);

    if (current.demoModeEnabled !== optimistic.demoModeEnabled) get().cancelSwitchWorkflow();
    set((state) => {
      const useDemo = optimistic.demoModeEnabled;
      const nextGames = useDemo ? state.demoGames : state.realGames;
      const nextStats = useDemo ? state.demoStatistics : state.realStatistics;
      const nextAccounts = useDemo
        ? state.demoAccountProfiles
        : state.realAccountProfiles;
      const nextAssociations = useDemo
        ? DEMO_GAME_ACCOUNT_ASSOCIATIONS
        : state.gameAccountAssociations;

      return {
        settings: optimistic,
        games: nextGames,
        statistics: nextStats,
        accountProfiles: nextAccounts,
        gameAccountAssociations: nextAssociations,
        viewMode:
          partial.defaultLibraryView !== undefined
            ? optimistic.defaultLibraryView
            : state.viewMode,
      };
    });

    await localDatabaseService.saveSettings(partial, optimistic);
  },

  setDemoMode: async (enabled) => {
    await get().updateSettings({ demoModeEnabled: enabled });
  },

  resetSettings: async () => {
    const defaults = await localDatabaseService.resetSettings();
    set((state) => ({
      settings: defaults,
      viewMode: defaults.defaultLibraryView,
      games: defaults.demoModeEnabled ? state.demoGames : state.realGames,
      statistics: defaults.demoModeEnabled
        ? state.demoStatistics
        : state.realStatistics,
      accountProfiles: defaults.demoModeEnabled
        ? state.demoAccountProfiles
        : state.realAccountProfiles,
      gameAccountAssociations: defaults.demoModeEnabled
        ? DEMO_GAME_ACCOUNT_ASSOCIATIONS
        : state.gameAccountAssociations,
    }));
  },

  startGameScan: async () => {
    if (get().isScanning) {
      return null;
    }

    console.log('[MaSwitch GUI] Starting scan requested by user');
    set({
      isScanning: true,
      scanError: null,
      showScanBanner: false,
      scanProgress: {
        scanId: `scan-${Date.now()}`,
        phase: 'scanning-steam',
        message: 'Starting local game installation scan...',
        percent: 5,
        discoveredCount: 0,
      },
    });

    try {
      if (!window.maswitch?.scanner) {
        const errorMsg =
          'Electron preload bridge (window.maswitch.scanner) is unavailable. Preload script was not loaded.';
        console.error('[MaSwitch GUI]', errorMsg);
        set({
          isScanning: false,
          scanError: errorMsg,
          scanProgress: null,
        });
        return null;
      }

      const { settings } = get();
      const summary = await localDatabaseService.startInstalledGameScan({
        customFolders: settings.customScanFolders,
        includeRegistry: settings.includeRegistryApps,
      });

      if (!summary) {
        throw new Error(
          'Scanner service returned an empty response. Verify process permissions and configuration.'
        );
      }

      if (summary.status === 'failed') {
        const errDetails =
          summary.errors.length > 0
            ? summary.errors.join('; ')
            : 'Scanner engine failed to complete.';
        throw new Error(`Scan failed: ${errDetails}`);
      }

      await get().refreshLibraryAndStats();

      set({
        isScanning: false,
        scanError: null,
        showScanBanner: true,
        lastScanSummary: summary,
        platformReports: summary.platformReports ?? get().platformReports,
        scanProgress: null,
      });

      console.log('[MaSwitch GUI] Scan completed successfully:', summary);
      return summary;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[MaSwitch GUI] Scan failed with error:', errMsg);
      set({
        isScanning: false,
        scanError: errMsg,
        scanProgress: null,
      });
      return null;
    }
  },

  clearScanError: () => {
    set({ scanError: null });
  },

  dismissScanBanner: () => {
    set({ showScanBanner: false });
  },

  cancelGameScan: async () => {
    await localDatabaseService.cancelInstalledGameScan();
    set({
      isScanning: false,
      scanProgress: null,
    });
  },

  addCustomGame: async (input) => {
    const created = await localDatabaseService.addCustomGame(input);
    if (created) {
      await get().refreshLibraryAndStats();
      set({ inspectedLibraryGameId: created.id });
    }
    return created;
  },

  editGame: async (gameId, input) => {
    const updated = await localDatabaseService.updateGame(gameId, input);
    if (updated) {
      await get().refreshLibraryAndStats();
    }
    return updated;
  },

  removeGameFromLibrary: async (gameId) => {
    const removed = await localDatabaseService.removeGameFromLibrary(gameId);
    if (removed) {
      await get().refreshLibraryAndStats();
      if (get().selectedGameId === gameId) {
        set({ selectedGameId: null });
      }
    }
    return removed;
  },

  restoreGameToLibrary: async (gameId) => {
    const restored = await localDatabaseService.restoreGameToLibrary(gameId);
    if (restored) {
      await get().refreshLibraryAndStats();
    }
    return restored;
  },

  launchGame: async (gameId) => {
    set((state) => ({
      launchStatuses: { ...state.launchStatuses, [gameId]: 'launching' },
      launchMessages: {
        ...state.launchMessages,
        [gameId]: 'Sending launch request...',
      },
    }));

    const result = await gameLauncherService.launchGame(gameId);

    set((state) => ({
      launchStatuses: { ...state.launchStatuses, [gameId]: result.status },
      launchMessages: { ...state.launchMessages, [gameId]: result.message },
      launchDiagnostics: result.diagnostics
        ? { ...state.launchDiagnostics, [gameId]: result.diagnostics }
        : state.launchDiagnostics,
    }));

    return result;
  },

  updateLaunchStatus: (gameId, status, message) => {
    set((state) => ({
      launchStatuses: { ...state.launchStatuses, [gameId]: status },
      launchMessages: message
        ? { ...state.launchMessages, [gameId]: message }
        : state.launchMessages,
    }));
  },

  setTrackerPaused: async (paused) => {
    const status = await localDatabaseService.setTrackerPaused(paused);
    set({ trackerStatus: status });
  },

  updateWindowsStartup: async (config) => {
    const startupState =
      await localDatabaseService.setWindowsStartupConfiguration(config);
    set((state) => ({
      windowsStartupState: startupState,
      settings: {
        ...state.settings,
        launchOnWindowsStartupPreference: startupState.openAtLogin,
        startMinimizedToTrayPreference: startupState.startMinimized,
      },
    }));
  },

  refreshSteamGridDbStatus: async () => {
    const status = await localDatabaseService.getSteamGridDbStatus();
    set({ steamGridDbStatus: status });
  },

  saveSteamGridDbKey: async (apiKey: string) => {
    set({ isSavingSteamGridDbKey: true });
    try {
      const res = await localDatabaseService.saveSteamGridDbApiKey(apiKey);
      await get().refreshSteamGridDbStatus();
      if (res.success) {
        void get().syncLibraryArtwork();
      }
      return res;
    } finally {
      set({ isSavingSteamGridDbKey: false });
    }
  },

  removeSteamGridDbKey: async () => {
    const success = await localDatabaseService.removeSteamGridDbApiKey();
    await get().refreshSteamGridDbStatus();
    return success;
  },

  testSteamGridDbKey: async (apiKey?: string) => {
    return localDatabaseService.testSteamGridDbConnection(apiKey);
  },

  syncLibraryArtwork: async () => {
    set({ isSyncingArtwork: true });
    try {
      const progress = await localDatabaseService.syncSteamGridDbLibraryArtwork();
      set({ artworkSyncProgress: progress });
      await get().refreshLibraryAndStats();
    } finally {
      set({ isSyncingArtwork: false });
    }
  },

  applyManualArtwork: async (input: ApplyArtworkInput) => {
    const updated = await localDatabaseService.applySteamGridDbArtwork(input);
    await get().refreshLibraryAndStats();
    return updated;
  },

  restoreDefaultArtwork: async (gameId: string) => {
    const updated = await localDatabaseService.restoreSteamGridDbDefaultArtwork(gameId);
    await get().refreshLibraryAndStats();
    return updated;
  },

  // Phase 6 Account Management Actions
  loadAccountProfiles: async () => {
    const [
      realAccountProfiles,
      launcherStatuses,
      gameAccountAssociations,
      activePlatformProfiles,
    ] = await Promise.all([
      localDatabaseService.getAccountProfiles(),
      localDatabaseService.getPlatformLauncherStatuses(),
      localDatabaseService.getGameAccountAssociations(),
      localDatabaseService.getActivePlatformProfiles(),
    ]);
    set((state) => ({
      realAccountProfiles,
      launcherStatuses,
      activePlatformProfiles,
      gameAccountAssociations: state.settings.demoModeEnabled
        ? DEMO_GAME_ACCOUNT_ASSOCIATIONS
        : gameAccountAssociations,
      accountProfiles: state.settings.demoModeEnabled
        ? state.demoAccountProfiles
        : realAccountProfiles,
    }));
    void get().loadEnrolledRiotProfiles();
    void get().loadRiotCredentialStatuses();
  },

  createAccountProfile: async (input) => {
    if (get().settings.demoModeEnabled) {
      const newProfile: AccountProfile = {
        id: `demo-${input.platformId}-${Date.now()}`,
        platformId: input.platformId,
        displayName: input.displayName.trim(),
        username: input.username.trim(),
        nickname: input.nickname?.trim() || null,
        avatarUrl: input.avatarUrl || null,
        isPreferred: input.isPreferred ?? false,
        lastUsedAt: null,
        notes: input.notes?.trim() || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      set((state) => {
        let updatedList = [...state.demoAccountProfiles];
        if (newProfile.isPreferred) {
          updatedList = updatedList.map((p) =>
            p.platformId === newProfile.platformId ? { ...p, isPreferred: false } : p
          );
        }
        updatedList.push(newProfile);
        return {
          demoAccountProfiles: updatedList,
          accountProfiles: updatedList,
        };
      });
      return newProfile;
    }

    const created = await localDatabaseService.createAccountProfile(input);
    if (created) {
      await get().loadAccountProfiles();
    }
    return created;
  },

  updateAccountProfile: async (id, input) => {
    if (get().settings.demoModeEnabled) {
      set((state) => {
        let updatedList = state.demoAccountProfiles.map((p) => {
          if (p.id !== id) return p;
          return {
            ...p,
            displayName: input.displayName ?? p.displayName,
            username: input.username ?? p.username,
            nickname: input.nickname !== undefined ? input.nickname : p.nickname,
            notes: input.notes !== undefined ? input.notes : p.notes,
            isPreferred: input.isPreferred ?? p.isPreferred,
            updatedAt: new Date().toISOString(),
          };
        });
        if (input.isPreferred) {
          const target = updatedList.find((p) => p.id === id);
          if (target) {
            updatedList = updatedList.map((p) =>
              p.platformId === target.platformId && p.id !== id
                ? { ...p, isPreferred: false }
                : p
            );
          }
        }
        return {
          demoAccountProfiles: updatedList,
          accountProfiles: updatedList,
        };
      });
      return get().demoAccountProfiles.find((p) => p.id === id) ?? null;
    }

    const updated = await localDatabaseService.updateAccountProfile(id, input);
    if (updated) {
      await get().loadAccountProfiles();
    }
    return updated;
  },

  deleteAccountProfile: async (id) => {
    if (get().settings.demoModeEnabled) {
      set((state) => {
        const filtered = state.demoAccountProfiles.filter((p) => p.id !== id);
        const updatedDemoActive = { ...state.demoActiveProfiles };
        for (const [pId, act] of Object.entries(updatedDemoActive)) {
          if (act.accountId === id) {
            delete updatedDemoActive[pId as PlatformId];
          }
        }
        return {
          demoAccountProfiles: filtered,
          accountProfiles: filtered,
          demoActiveProfiles: updatedDemoActive,
        };
      });
      return true;
    }

    const success = await localDatabaseService.deleteAccountProfile(id);
    if (success) {
      await get().loadAccountProfiles();
    }
    return success;
  },

  setPreferredAccount: async (id) => {
    if (get().settings.demoModeEnabled) {
      set((state) => {
        const target = state.demoAccountProfiles.find((p) => p.id === id);
        if (!target) return state;
        const updated = state.demoAccountProfiles.map((p) => {
          if (p.platformId === target.platformId) {
            return { ...p, isPreferred: p.id === id };
          }
          return p;
        });
        return {
          demoAccountProfiles: updated,
          accountProfiles: updated,
        };
      });
      return true;
    }

    const success = await localDatabaseService.setPreferredAccount(id);
    if (success) {
      await get().loadAccountProfiles();
    }
    return success;
  },

  switchAccount: async (accountId, forceReauth = false) => {
    const demo = get().settings.demoModeEnabled;
    const target = get().accountProfiles.find((p) => p.id === accountId);
    if (!target || get().isSwitchingAccount || get().isConfirmingSwitch) {
      return {
        success: false,
        accountId,
        platformId: target?.platformId ?? 'custom',
        methodUsed: 'None',
        launcherStarted: false,
        verificationStatus: 'unverified',
        message: 'This sign-in request is unavailable.',
      };
    }
    if (target.isLastSelected && !forceReauth) {
      return {
        success: true,
        accountId,
        platformId: target.platformId,
        methodUsed: 'Profile selection',
        launcherStarted: false,
        verificationStatus: 'unverified',
        isAlreadySelected: true,
        message: `"${target.displayName}" is already selected in MaSwitch.`,
      };
    }
    get().cancelSwitchWorkflow();
    set({ isSwitchingAccount: true, pendingSwitchAccountId: accountId });
    try {
      let result: AccountSwitchResult;
      if (demo) {
        const profiles = get().demoAccountProfiles.map((profile) =>
          profile.platformId === target.platformId
            ? { ...profile, isLastSelected: profile.id === target.id }
            : profile
        );
        set({ demoAccountProfiles: profiles, accountProfiles: profiles });
        result = {
          success: true,
          accountId,
          platformId: target.platformId,
          methodUsed: 'Demo',
          launcherStarted: false,
          verificationStatus: 'manual-confirmation-needed',
          message: 'Demo mode simulates a launcher handoff.',
          instructions: ['In live mode, complete sign-in in the platform client.'],
          pendingConfirmation: true,
        };
      } else {
        result = await localDatabaseService.switchAccount(accountId, forceReauth);
        await get().loadAccountProfiles();
        if (get().settings.demoModeEnabled !== demo || get().pendingSwitchAccountId !== accountId) {
          if (result.switchId) await localDatabaseService.cancelAccountSwitch(result.switchId);
          return result;
        }
      }
      set({
        activeSwitchResult: result.pendingConfirmation ? result : null,
        pendingSwitchAccountId: result.pendingConfirmation ? accountId : null,
        switchError: result.success ? null : result.message,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start the sign-in request.';
      set({ switchError: message, pendingSwitchAccountId: null });
      return {
        success: false, accountId, platformId: target.platformId, methodUsed: 'None',
        launcherStarted: false, verificationStatus: 'unverified', message,
      };
    } finally {
      set({ isSwitchingAccount: false });
    }
  },

  confirmAccountSwitch: async (accountId) => {
    const request = get().activeSwitchResult;
    if (get().isConfirmingSwitch || !request?.pendingConfirmation || request.accountId !== accountId) {
      return false;
    }
    set({ isConfirmingSwitch: true, switchError: null });
    try {
      if (get().settings.demoModeEnabled) {
        const now = new Date().toISOString();
        const profiles = get().demoAccountProfiles.map((profile) =>
          profile.id === accountId ? { ...profile, lastUsedAt: now } : profile
        );
        set((state) => ({
          demoAccountProfiles: profiles,
          accountProfiles: profiles,
          demoActiveProfiles: {
            ...state.demoActiveProfiles,
            [request.platformId]: {
              platformId: request.platformId,
              accountId,
              confirmedAt: now,
              verificationStatus: 'user-confirmed',
            },
          },
        }));
      } else {
        if (!request.switchId) throw new Error('There is no matching sign-in request to confirm.');
        const confirmation = await localDatabaseService.confirmAccountSwitch(accountId, request.switchId);
        if (!confirmation.success) throw new Error('Could not record your sign-in confirmation.');
        await get().loadAccountProfiles();
      }
      set({ activeSwitchResult: null, pendingSwitchAccountId: null });
      return true;
    } catch (err) {
      set({ switchError: err instanceof Error ? err.message : 'Could not record your sign-in confirmation.' });
      return false;
    } finally {
      set({ isConfirmingSwitch: false });
    }
  },

  clearActiveProfile: async (platformId: PlatformId) => {
    if (get().settings.demoModeEnabled) {
      set((state) => {
        const updated = { ...state.demoActiveProfiles };
        delete updated[platformId];
        return { demoActiveProfiles: updated };
      });
      return true;
    }
    const success = await localDatabaseService.clearActivePlatformProfile(platformId);
    if (success) {
      await get().loadAccountProfiles();
    }
    return success;
  },

  cancelSwitchWorkflow: () => {
    if (get().isConfirmingSwitch) return;
    const switchId = get().activeSwitchResult?.switchId;
    set({ activeSwitchResult: null, pendingSwitchAccountId: null, switchError: null });
    if (switchId) {
      void localDatabaseService.cancelAccountSwitch(switchId).catch(() => {
        set({ switchError: 'Could not close the sign-in request in the desktop service.' });
      });
    }
  },

  openPlatformLauncher: async (platformId) => {
    if (get().settings.demoModeEnabled) return false;
    try {
      const result = await localDatabaseService.openPlatformLauncher(platformId);
      set({ switchError: result.success ? null : result.message });
      await get().refreshLauncherStatuses();
      return result.success;
    } catch (err) {
      set({ switchError: err instanceof Error ? err.message : 'Could not open the launcher.' });
      return false;
    }
  },

  setGameAccountAssociation: async (gameId, accountProfileId) => {
    if (get().settings.demoModeEnabled) {
      set((state) => {
        const filtered = state.gameAccountAssociations.filter(
          (a) => a.gameId !== gameId
        );
        if (accountProfileId) {
          const profile = state.demoAccountProfiles.find(
            (p) => p.id === accountProfileId
          );
          if (profile) {
            filtered.push({
              gameId,
              accountId: accountProfileId,
              platformId: profile.platformId,
              assignedAt: new Date().toISOString(),
            });
          }
        }
        return { gameAccountAssociations: filtered };
      });
      return true;
    }

    const success = await localDatabaseService.setGameAccountAssociation(
      gameId,
      accountProfileId
    );
    if (success) {
      const gameAccountAssociations =
        await localDatabaseService.getGameAccountAssociations();
      set({ gameAccountAssociations });
    }
    return success;
  },

  refreshLauncherStatuses: async () => {
    const launcherStatuses =
      await localDatabaseService.getPlatformLauncherStatuses();
    set({ launcherStatuses });
  },

  addPreviewAccountSlot: (platformId, customAlias) => {
    set((state) => ({
      accountGroups: state.accountGroups.map((group) => {
        if (group.platformId !== platformId) {
          return group;
        }
        const newSlot = accountManagerService.createPreviewAccountSlot(
          platformId,
          group.accounts.length,
          customAlias
        );
        return {
          ...group,
          accounts: [...group.accounts, newSlot],
        };
      }),
    }));
  },

  removePreviewAccountSlot: (platformId, accountId) => {
    set((state) => ({
      accountGroups: state.accountGroups.map((group) => {
        if (group.platformId !== platformId) {
          return group;
        }
        if (group.accounts.length <= 1) {
          return group;
        }
        const remaining = group.accounts
          .filter((acc) => acc.id !== accountId)
          .map((acc, idx) => ({
            ...acc,
            slotIndex: idx + 1,
          }));
        return {
          ...group,
          accounts: remaining,
        };
      }),
    }));
  },

  // Phase 12 Production Riot Live Switching Actions
  loadEnrolledRiotProfiles: async () => {
    try {
      const enrolled = await localDatabaseService.riotGetEnrolledProfiles();
      set({ enrolledRiotProfileIds: enrolled });
    } catch {
      set({ enrolledRiotProfileIds: [] });
    }
  },

  enrollRiotProfile: async (profileId: string, consentGiven: boolean) => {
    set({ isEnrollingRiot: true, riotLiveSwitchError: null });
    try {
      const result = await localDatabaseService.riotEnrollSession(profileId, consentGiven);
      await get().loadEnrolledRiotProfiles();
      await get().loadAccountProfiles();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ riotLiveSwitchError: msg });
      return { success: false, profileId, activeAccountId: null, enrolledAtIso: new Date().toISOString(), message: msg };
    } finally {
      set({ isEnrollingRiot: false });
    }
  },

  removeEnrolledRiotProfile: async (profileId: string) => {
    try {
      const res = await localDatabaseService.riotRemoveSession(profileId);
      await get().loadEnrolledRiotProfiles();
      return res.success;
    } catch (err) {
      set({ riotLiveSwitchError: err instanceof Error ? err.message : String(err) });
      return false;
    }
  },

  liveSwitchRiotProfile: async (profileId: string) => {
    set({ isLiveSwitchingRiot: true, riotLiveSwitchError: null });
    try {
      const result = await localDatabaseService.riotLiveSwitch(profileId);
      set({ lastRiotLiveSwitchResult: result });
      await get().loadAccountProfiles();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ riotLiveSwitchError: msg });
      throw err;
    } finally {
      set({ isLiveSwitchingRiot: false });
    }
  },

  recoverRiotLiveSwitch: async () => {
    try {
      const res = await localDatabaseService.riotRecoverPending();
      if (res.recovered) {
        await get().loadAccountProfiles();
      }
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ riotLiveSwitchError: msg });
      return { recovered: false, restoredAccountId: null, message: msg };
    }
  },

  clearRiotLiveSwitchError: () => set({ riotLiveSwitchError: null }),

  loadRiotCredentialStatuses: async () => {
    try {
      const statuses = await localDatabaseService.riotGetAllCredentialStatuses();
      set({ riotCredentialStatuses: statuses });
    } catch {
      set({ riotCredentialStatuses: {} });
    }
  },

  saveRiotCredentials: async (profileId: string, username: string, password: string) => {
    set({ isSavingRiotCredentials: true, riotCredentialError: null });
    try {
      const res = await localDatabaseService.riotSaveCredentials(profileId, username, password);
      await get().loadRiotCredentialStatuses();
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ riotCredentialError: msg });
      throw err;
    } finally {
      set({ isSavingRiotCredentials: false });
    }
  },

  deleteRiotCredentials: async (profileId: string) => {
    try {
      const res = await localDatabaseService.riotDeleteCredentials(profileId);
      await get().loadRiotCredentialStatuses();
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ riotCredentialError: msg });
      return false;
    }
  },

  getRiotLoginCredentials: async (profileId: string) => {
    try {
      return await localDatabaseService.riotGetLoginCredentials(profileId);
    } catch {
      return null;
    }
  },

  checkRiotClientRunning: async () => {
    try {
      return await localDatabaseService.riotCheckClientRunning();
    } catch {
      return false;
    }
  },

  launchRiotClient: async () => {
    try {
      return await localDatabaseService.riotLaunchClient();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(msg);
    }
  },

  clearRiotCredentialError: () => set({ riotCredentialError: null }),

  startRiotDesktopLogin: async (profileId, autoLaunchClient, autoSubmit, isSyntheticTest, targetHwnd, targetPid) => {
    set({
      isRiotLoginAutomating: true,
      riotLoginAutomationResult: null,
      riotLoginAutomationProgress: {
        profileId,
        status: 'checking-client',
        message: 'Starting Riot login automation...',
        timestamp: new Date().toISOString(),
      },
    });

    try {
      const shouldAutoSubmit = autoSubmit ?? (get().settings.riotAutoSubmitLogin ?? true);
      const result = await localDatabaseService.riotStartDesktopLogin(
        profileId,
        autoLaunchClient,
        shouldAutoSubmit,
        isSyntheticTest,
        targetHwnd,
        targetPid
      );
      set({
        riotLoginAutomationResult: result,
        isRiotLoginAutomating: false,
      });
      await get().loadAccountProfiles();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const failResult: RiotDesktopLoginResultPayload = {
        success: false,
        profileId,
        message: msg,
        error: 'AUTOMATION_ERROR',
      };
      set({
        riotLoginAutomationResult: failResult,
        isRiotLoginAutomating: false,
        riotLoginAutomationProgress: {
          profileId,
          status: 'failed',
          message: msg,
          error: 'AUTOMATION_ERROR',
          timestamp: new Date().toISOString(),
        },
      });
      return failResult;
    }
  },

  cancelRiotDesktopLogin: async () => {
    try {
      await localDatabaseService.riotCancelDesktopLogin();
      set({
        isRiotLoginAutomating: false,
        riotLoginAutomationProgress: {
          profileId: '',
          status: 'cancelled',
          message: 'Automation cancelled by user.',
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // ignore
    }
  },

  clearRiotLoginAutomationProgress: () =>
    set({
      riotLoginAutomationProgress: null,
      riotLoginAutomationResult: null,
      isRiotLoginAutomating: false,
    }),

  // Feature 1: Year in Review Actions
  loadYearInReview: async (year?: number) => {
    const yr = year ?? get().selectedYear;
    set({ yearInReviewLoading: true, selectedYear: yr });
    try {
      const years = await localDatabaseService.getAvailableYears();
      const data = await localDatabaseService.getYearInReview(yr);
      set({
        availableYears: years.length > 0 ? years : [yr],
        yearInReviewData: data,
        yearInReviewLoading: false,
      });
    } catch {
      set({ yearInReviewLoading: false });
    }
  },

  setSelectedYear: (year: number) => {
    set({ selectedYear: year });
    void get().loadYearInReview(year);
  },

  // Feature 2: Smart Collections Actions
  loadCollections: async () => {
    set({ collectionsLoading: true });
    try {
      const list = await localDatabaseService.getCollections();
      set({ collections: list, collectionsLoading: false });
    } catch {
      set({ collectionsLoading: false });
    }
  },

  createCollection: async (input: CreateCollectionInput) => {
    try {
      const created = await localDatabaseService.createCollection(input);
      if (created) {
        await get().loadCollections();
      }
      return created;
    } catch {
      return null;
    }
  },

  updateCollection: async (input: UpdateCollectionInput) => {
    try {
      const res = await localDatabaseService.updateCollection(input);
      if (res) {
        await get().loadCollections();
      }
      return res;
    } catch {
      return false;
    }
  },

  deleteCollection: async (id: string) => {
    try {
      const res = await localDatabaseService.deleteCollection(id);
      if (res) {
        if (get().activeCollectionId === id) {
          set({ activeCollectionId: null });
        }
        await get().loadCollections();
      }
      return res;
    } catch {
      return false;
    }
  },

  addGameToCollection: async (collectionId: string, gameId: string) => {
    try {
      const res = await localDatabaseService.addGameToCollection(collectionId, gameId);
      if (res) {
        await get().loadCollections();
      }
      return res;
    } catch {
      return false;
    }
  },

  removeGameFromCollection: async (collectionId: string, gameId: string) => {
    try {
      const res = await localDatabaseService.removeGameFromCollection(collectionId, gameId);
      if (res) {
        await get().loadCollections();
      }
      return res;
    } catch {
      return false;
    }
  },

  setCollectionGameOrder: async (collectionId: string, gameIds: string[]) => {
    try {
      const res = await localDatabaseService.setCollectionGameOrder(collectionId, gameIds);
      if (res) {
        await get().loadCollections();
      }
      return res;
    } catch {
      return false;
    }
  },

  setActiveCollectionId: (id: string | null) => set({ activeCollectionId: id }),

  // Feature 3: Performance Monitor Actions
  setPerformanceMonitoringActive: async (active: boolean, intervalMs?: number) => {
    const intMs = intervalMs ?? get().monitoringIntervalMs;
    set({ monitoringActive: active, monitoringIntervalMs: intMs });
    await localDatabaseService.setPerformanceMonitoringActive({ active, intervalMs: intMs });
  },

  fetchPerformanceMetrics: async () => {
    const m = await localDatabaseService.getPerformanceMetrics();
    if (m) {
      set((state) => ({
        performanceMetrics: m,
        metricsHistory: [...state.metricsHistory.slice(-29), m],
      }));
    }
    return m;
  },

  // Feature 4: Game Updates & News Actions
  loadNews: async (options?: { forceRefresh?: boolean }) => {
    set({ newsLoading: true });
    try {
      const feed = await localDatabaseService.getLibraryNews({
        forceRefresh: options?.forceRefresh,
        gameId: get().newsFilterGameId ?? undefined,
        platformId: get().newsFilterPlatformId ?? undefined,
      });
      set({ newsFeed: feed, newsLoading: false });
    } catch {
      set({ newsLoading: false });
    }
  },

  setNewsFilterGameId: (gameId: string | null) => {
    set({ newsFilterGameId: gameId });
    void get().loadNews();
  },

  setNewsFilterPlatformId: (platformId: string | null) => {
    set({ newsFilterPlatformId: platformId });
    void get().loadNews();
  },

  openNewsArticle: async (url: string) => {
    return await localDatabaseService.openExternalNewsLink(url);
  },

  // Feature 5: Backup & Restore Actions
  loadBackupInfo: async () => {
    try {
      const info = await localDatabaseService.getBackupInfo();
      set({ backupInfo: info });
    } catch {
      // Retain previous or fallback backup info
    }
  },

  createBackup: async (customPath?: string) => {
    set({ backupLoading: true, backupFeedback: null });
    try {
      const res = await localDatabaseService.createBackup(customPath);
      await get().loadBackupInfo();
      set({
        backupLoading: false,
        backupFeedback: {
          type: 'success',
          message: `Backup created successfully (${res.manifest?.counts.games ?? 0} games, ${res.manifest?.counts.sessions ?? 0} sessions).`,
        },
      });
      return true;
    } catch (err) {
      set({
        backupLoading: false,
        backupFeedback: {
          type: 'error',
          message: `Failed to create backup: ${err instanceof Error ? err.message : String(err)}`,
        },
      });
      return false;
    }
  },

  validateBackupFile: async (filePath: string) => {
    set({ backupLoading: true, backupValidation: null });
    try {
      const res = await localDatabaseService.validateBackup(filePath);
      set({ backupValidation: res, backupLoading: false });
      return res;
    } catch (err) {
      const fail = { valid: false, filePath, fileSizeBytes: 0, error: String(err) };
      set({ backupValidation: fail, backupLoading: false });
      return fail;
    }
  },

  restoreBackupFile: async (filePath: string) => {
    set({ backupLoading: true, backupFeedback: null });
    try {
      const res = await localDatabaseService.restoreBackup(filePath);
      if (res.success) {
        set({
          backupLoading: false,
          backupFeedback: {
            type: 'success',
            message: `Restore completed successfully (${res.restoredCounts?.games ?? 0} games restored).`,
          },
        });
        const [reloadedGames, reloadedSettings] = await Promise.all([
          localDatabaseService.getRealLibraryGames(),
          localDatabaseService.loadSettings(),
        ]);
        set({
          realGames: reloadedGames,
          games: reloadedGames,
          settings: reloadedSettings,
        });
        await get().loadCollections();
      } else {
        set({
          backupLoading: false,
          backupFeedback: {
            type: 'error',
            message: `Restore failed: ${res.error ?? 'Unknown error'}`,
          },
        });
      }
      return res;
    } catch (err) {
      const res = { success: false, error: String(err) };
      set({
        backupLoading: false,
        backupFeedback: { type: 'error', message: `Restore error: ${res.error}` },
      });
      return res;
    }
  },

  clearBackupFeedback: () => set({ backupFeedback: null }),

  // Modular Features & Installer Gating Actions
  loadFeaturesManifest: async () => {
    set({ featuresLoading: true });
    try {
      const manifest = await localDatabaseService.getFeaturesManifest();
      set({ featuresManifest: manifest, featuresLoading: false });
    } catch {
      set({ featuresLoading: false });
    }
  },

  setFeatureEnabled: async (featureId, enabled) => {
    set({ featuresLoading: true, featuresFeedback: null });
    try {
      const manifest = await localDatabaseService.setFeatureEnabled(featureId, enabled);
      set({
        featuresManifest: manifest,
        featuresLoading: false,
        featuresFeedback: {
          type: 'success',
          message: `Feature "${OPTIONAL_FEATURES_METADATA[featureId]?.name ?? featureId}" ${enabled ? 'enabled' : 'disabled'} successfully.`,
        },
      });
      return true;
    } catch (err) {
      set({
        featuresLoading: false,
        featuresFeedback: {
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        },
      });
      return false;
    }
  },

  applyInstallPreset: async (presetId) => {
    set({ featuresLoading: true, featuresFeedback: null });
    try {
      const preset = PRESET_CONFIGURATIONS[presetId];
      if (!preset) return false;
      const manifest = await localDatabaseService.applyPreset(presetId);
      set({
        featuresManifest: manifest,
        featuresLoading: false,
        featuresFeedback: {
          type: 'success',
          message: `Preset "${preset.name}" applied successfully.`,
        },
      });
      return true;
    } catch (err) {
      set({
        featuresLoading: false,
        featuresFeedback: {
          type: 'error',
          message: `Failed to apply preset: ${err instanceof Error ? err.message : String(err)}`,
        },
      });
      return false;
    }
  },

  launchInstallerModify: async () => {
    set({ featuresLoading: true, featuresFeedback: null });
    try {
      const res = await localDatabaseService.launchInstallerModify();
      set({ featuresLoading: false });
      if (!res.success) {
        set({
          featuresFeedback: {
            type: 'error',
            message: res.message ?? 'Installer setup executable not found.',
          },
        });
      }
      return res;
    } catch (err) {
      set({
        featuresLoading: false,
        featuresFeedback: {
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        },
      });
      return { success: false, message: String(err) };
    }
  },

  clearFeaturesFeedback: () => set({ featuresFeedback: null }),
}));
