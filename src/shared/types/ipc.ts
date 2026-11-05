import type {
  CustomGameInput,
  EditGameInput,
  GameItem,
  GameLaunchResult,
  GameLaunchState,
} from './game';
import type { PlatformDetectionReport } from './platform';
import type { ScanProgressPayload, ScanResultSummary } from './scanner';
import type {
  AppRuntimeInfo,
  MaSwitchSettings,
  WindowsStartupState,
} from './settings';
import type { PlaytimeTrackerStatus, StatisticsOverview } from './statistics';
import type {
  ApplyArtworkInput,
  ArtworkSyncProgress,
  SteamGridDbArtworkBundle,
  SteamGridDbGame,
  SteamGridDbStatus,
} from './steamgriddb';

export const IPC_CHANNELS = {
  // Window controls
  WINDOW_MINIMIZE: 'maswitch:window:minimize',
  WINDOW_MAXIMIZE_TOGGLE: 'maswitch:window:maximize-toggle',
  WINDOW_CLOSE: 'maswitch:window:close',
  WINDOW_GET_STATE: 'maswitch:window:get-state',
  WINDOW_STATE_CHANGED: 'maswitch:window:state-changed',
  WINDOW_VISIBILITY_CHANGED: 'maswitch:window:visibility-changed',

  // Settings
  SETTINGS_LOAD: 'maswitch:settings:load',
  SETTINGS_SAVE: 'maswitch:settings:save',
  SETTINGS_RESET: 'maswitch:settings:reset',

  // Runtime info
  APP_GET_RUNTIME_INFO: 'maswitch:app:get-runtime-info',

  // Phase 2: SQLite Library & Custom Games
  LIBRARY_GET_GAMES: 'maswitch:library:get-games',
  LIBRARY_ADD_CUSTOM_GAME: 'maswitch:library:add-custom-game',
  LIBRARY_UPDATE_GAME: 'maswitch:library:update-game',
  LIBRARY_REMOVE_GAME: 'maswitch:library:remove-game',
  LIBRARY_RESTORE_GAME: 'maswitch:library:restore-game',
  LIBRARY_GET_REMOVED_GAMES: 'maswitch:library:get-removed-games',
  LIBRARY_TOGGLE_FAVORITE: 'maswitch:library:toggle-favorite',
  LIBRARY_SELECT_EXECUTABLE: 'maswitch:library:select-executable',
  LIBRARY_SELECT_FOLDER: 'maswitch:library:select-folder',
  LIBRARY_UPDATED_EVENT: 'maswitch:library:updated',

  // Phase 2: Installed Game Scanner
  SCANNER_START: 'maswitch:scanner:start',
  SCANNER_CANCEL: 'maswitch:scanner:cancel',
  SCANNER_GET_HISTORY: 'maswitch:scanner:get-history',
  SCANNER_GET_PLATFORM_REPORTS: 'maswitch:scanner:get-platform-reports',
  SCANNER_PROGRESS_EVENT: 'maswitch:scanner:progress',

  // Phase 2: Functional Game Launching
  LAUNCHER_LAUNCH_GAME: 'maswitch:launcher:launch-game',
  LAUNCHER_GET_STATUSES: 'maswitch:launcher:get-statuses',
  LAUNCHER_STATUS_CHANGED_EVENT: 'maswitch:launcher:status-changed',

  // Phase 2: Background Playtime Tracker & Statistics
  TRACKER_GET_STATISTICS: 'maswitch:tracker:get-statistics',
  TRACKER_GET_STATUS: 'maswitch:tracker:get-status',
  TRACKER_SET_PAUSED: 'maswitch:tracker:set-paused',
  TRACKER_SESSION_UPDATED_EVENT: 'maswitch:tracker:session-updated',
  TRACKER_GAME_MODE_CHANGED: 'maswitch:tracker:game-mode-changed',
  APP_SHOW_NOTIFICATION: 'maswitch:app:show-notification',

  // Phase 2: Windows Startup Integration
  STARTUP_GET_STATE: 'maswitch:startup:get-state',
  STARTUP_SET_CONFIG: 'maswitch:startup:set-config',

  // Artwork & Icon Cache
  ARTWORK_GET_STATS: 'maswitch:artwork:get-stats',
  ARTWORK_CLEAR_CACHE: 'maswitch:artwork:clear-cache',

  // SteamGridDB Integration
  STEAMGRIDDB_SAVE_KEY: 'maswitch:steamgriddb:save-key',
  STEAMGRIDDB_REMOVE_KEY: 'maswitch:steamgriddb:remove-key',
  STEAMGRIDDB_GET_STATUS: 'maswitch:steamgriddb:get-status',
  STEAMGRIDDB_TEST_KEY: 'maswitch:steamgriddb:test-key',
  STEAMGRIDDB_SEARCH_GAMES: 'maswitch:steamgriddb:search-games',
  STEAMGRIDDB_GET_GAME_ARTWORK: 'maswitch:steamgriddb:get-game-artwork',
  STEAMGRIDDB_APPLY_ARTWORK: 'maswitch:steamgriddb:apply-artwork',
  STEAMGRIDDB_SYNC_LIBRARY_ARTWORK: 'maswitch:steamgriddb:sync-library-artwork',
  STEAMGRIDDB_RESTORE_DEFAULT_ARTWORK: 'maswitch:steamgriddb:restore-default-artwork',
  STEAMGRIDDB_SYNC_PROGRESS_EVENT: 'maswitch:steamgriddb:sync-progress',

  // Phase 6: Real Multi-Account Management & Switching
  ACCOUNTS_GET_PROFILES: 'maswitch:accounts:get-profiles',
  ACCOUNTS_CREATE_PROFILE: 'maswitch:accounts:create-profile',
  ACCOUNTS_UPDATE_PROFILE: 'maswitch:accounts:update-profile',
  ACCOUNTS_DELETE_PROFILE: 'maswitch:accounts:delete-profile',
  ACCOUNTS_SET_PREFERRED: 'maswitch:accounts:set-preferred',
  ACCOUNTS_GET_CAPABILITIES: 'maswitch:accounts:get-capabilities',
  ACCOUNTS_GET_LAUNCHER_STATUSES: 'maswitch:accounts:get-launcher-statuses',
  ACCOUNTS_GET_ACTIVE_PROFILES: 'maswitch:accounts:get-active-profiles',
  ACCOUNTS_CLEAR_ACTIVE_PROFILE: 'maswitch:accounts:clear-active-profile',
  ACCOUNTS_SWITCH_ACCOUNT: 'maswitch:accounts:switch-account',
  ACCOUNTS_CANCEL_SWITCH: 'maswitch:accounts:cancel-switch',
  ACCOUNTS_CONFIRM_SWITCH: 'maswitch:accounts:confirm-switch',
  ACCOUNTS_OPEN_LAUNCHER: 'maswitch:accounts:open-launcher',
  ACCOUNTS_GET_SWITCH_HISTORY: 'maswitch:accounts:get-switch-history',
  ACCOUNTS_GET_GAME_ASSOCIATIONS: 'maswitch:accounts:get-game-associations',
  ACCOUNTS_SET_GAME_ASSOCIATION: 'maswitch:accounts:set-game-association',
  ACCOUNTS_UPDATED_EVENT: 'maswitch:accounts:updated',
  ACCOUNTS_RIOT_GET_ENROLLED_PROFILES: 'maswitch:accounts:riot:get-enrolled-profiles',
  ACCOUNTS_RIOT_ENROLL_SESSION: 'maswitch:accounts:riot:enroll-session',
  ACCOUNTS_RIOT_REMOVE_SESSION: 'maswitch:accounts:riot:remove-session',
  ACCOUNTS_RIOT_LIVE_SWITCH: 'maswitch:accounts:riot:live-switch',
  ACCOUNTS_RIOT_RECOVER_PENDING: 'maswitch:accounts:riot:recover-pending',
  ACCOUNTS_RIOT_GET_CREDENTIAL_STATUS: 'maswitch:accounts:riot:get-credential-status',
  ACCOUNTS_RIOT_GET_ALL_CREDENTIAL_STATUSES: 'maswitch:accounts:riot:get-all-credential-statuses',
  ACCOUNTS_RIOT_SAVE_CREDENTIALS: 'maswitch:accounts:riot:save-credentials',
  ACCOUNTS_RIOT_DELETE_CREDENTIALS: 'maswitch:accounts:riot:delete-credentials',
  ACCOUNTS_RIOT_GET_LOGIN_CREDENTIALS: 'maswitch:accounts:riot:get-login-credentials',
  ACCOUNTS_RIOT_CHECK_CLIENT_RUNNING: 'maswitch:accounts:riot:check-client-running',
  ACCOUNTS_RIOT_LAUNCH_CLIENT: 'maswitch:accounts:riot:launch-client',
  ACCOUNTS_RIOT_START_DESKTOP_LOGIN: 'maswitch:accounts:riot:start-desktop-login',
  ACCOUNTS_RIOT_CANCEL_DESKTOP_LOGIN: 'maswitch:accounts:riot:cancel-desktop-login',
  ACCOUNTS_RIOT_LOGIN_AUTOMATION_PROGRESS: 'maswitch:accounts:riot:login-automation-progress',
} as const;

export type AllowedIpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export interface WindowStatePayload {
  isMaximized: boolean;
  isFullScreen: boolean;
  isFocused: boolean;
}

export type RiotDesktopLoginProgressStatus =
  | 'idle'
  | 'checking-client'
  | 'waiting-for-launch-approval'
  | 'launching-client'
  | 'waiting-for-window'
  | 'verifying-window'
  | 'finding-fields'
  | 'entering-credentials'
  | 'waiting-for-user'
  | 'success'
  | 'failed'
  | 'cancelled';

export interface RiotDesktopLoginProgressPayload {
  profileId: string;
  status: RiotDesktopLoginProgressStatus;
  message: string;
  fieldsIdentified?: boolean;
  methodUsed?: string;
  autoSubmitted?: boolean;
  error?: string;
  timestamp: string;
}

export interface RiotDesktopLoginResultPayload {
  success: boolean;
  profileId: string;
  methodUsed?: string;
  fieldsIdentified?: boolean;
  autoSubmitted?: boolean;
  message: string;
  error?: string;
}

export interface LauncherStatusChangedPayload {
  gameId: string;
  status: GameLaunchState;
  message?: string;
}

export interface MaSwitchBridge {
  windowControls: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<WindowStatePayload>;
    close: () => Promise<void>;
    getState: () => Promise<WindowStatePayload>;
    onStateChanged: (callback: (state: WindowStatePayload) => void) => () => void;
    onVisibilityChanged?: (callback: (visible: boolean) => void) => () => void;
  };
  settings: {
    load: () => Promise<MaSwitchSettings>;
    save: (partial: Partial<MaSwitchSettings>) => Promise<MaSwitchSettings>;
    reset: () => Promise<MaSwitchSettings>;
  };
  app: {
    getRuntimeInfo: () => Promise<AppRuntimeInfo>;
    showNotification?: (options: {
      title: string;
      body: string;
      type?: 'info' | 'warning' | 'error';
    }) => Promise<void>;
    onNavigateSection?: (callback: (section: string) => void) => () => void;
    onFilterFavorites?: (callback: (favoritesOnly: boolean) => void) => () => void;
  };
  library?: {
    getGames: () => Promise<GameItem[]>;
    addCustomGame: (input: CustomGameInput) => Promise<GameItem>;
    updateGame: (gameId: string, input: EditGameInput) => Promise<GameItem | null>;
    removeGame: (gameId: string) => Promise<boolean>;
    restoreGame: (gameId: string) => Promise<boolean>;
    getRemovedGames: () => Promise<GameItem[]>;
    toggleFavorite: (
      gameId: string
    ) => Promise<{ gameId: string; isFavorite: boolean; favoriteGameIds: string[] }>;
    selectExecutableDialog: () => Promise<string | null>;
    selectFolderDialog: () => Promise<string | null>;
    onLibraryUpdated: (callback: () => void) => () => void;
  };
  scanner?: {
    startScan: (options?: {
      customFolders?: string[];
      includeRegistry?: boolean;
    }) => Promise<ScanResultSummary>;
    cancelScan: () => Promise<boolean>;
    getHistory: () => Promise<ScanResultSummary[]>;
    getPlatformReports: () => Promise<PlatformDetectionReport[]>;
    onProgress: (callback: (progress: ScanProgressPayload) => void) => () => void;
  };
  launcher?: {
    launchGame: (gameId: string) => Promise<GameLaunchResult>;
    getStatuses: () => Promise<Record<string, GameLaunchState>>;
    onStatusChanged: (
      callback: (payload: LauncherStatusChangedPayload) => void
    ) => () => void;
  };
  tracker?: {
    getStatistics: () => Promise<StatisticsOverview>;
    getStatus: () => Promise<PlaytimeTrackerStatus>;
    setPaused: (paused: boolean) => Promise<PlaytimeTrackerStatus>;
    onSessionUpdated: (callback: () => void) => () => void;
    onGameModeChanged?: (
      callback: (data: { inGame: boolean; activeGameCount: number }) => void
    ) => () => void;
  };
  startup?: {
    getState: () => Promise<WindowsStartupState>;
    setConfiguration: (config: {
      openAtLogin: boolean;
      startMinimized: boolean;
    }) => Promise<WindowsStartupState>;
  };
  artwork?: {
    getStats: () => Promise<{
      artworkCount: number;
      artworkSizeBytes: number;
      iconCount: number;
      iconSizeBytes: number;
      totalSizeBytes: number;
    }>;
    clearCache: () => Promise<{ clearedFilesCount: number; freedBytes: number }>;
  };
  steamGridDb?: {
    saveApiKey: (apiKey: string) => Promise<{ success: boolean; message: string }>;
    removeApiKey: () => Promise<boolean>;
    getStatus: () => Promise<SteamGridDbStatus>;
    testConnection: (apiKey?: string) => Promise<{ success: boolean; message: string }>;
    searchGames: (query: string) => Promise<SteamGridDbGame[]>;
    getGameArtwork: (sgdbGameId: number, gameName?: string) => Promise<SteamGridDbArtworkBundle>;
    applyArtwork: (input: ApplyArtworkInput) => Promise<GameItem | null>;
    restoreDefaultArtwork: (gameId: string) => Promise<GameItem | null>;
    syncLibraryArtwork: () => Promise<ArtworkSyncProgress>;
    onSyncProgress: (callback: (progress: ArtworkSyncProgress) => void) => () => void;
  };
  accounts?: {
    getProfiles: (platformId?: import('./platform').PlatformId) => Promise<import('./account').AccountProfile[]>;
    createProfile: (input: import('./account').CreateAccountProfileInput) => Promise<import('./account').AccountProfile>;
    updateProfile: (id: string, input: import('./account').UpdateAccountProfileInput) => Promise<import('./account').AccountProfile | null>;
    deleteProfile: (id: string) => Promise<boolean>;
    setPreferred: (id: string) => Promise<boolean>;
    getCapabilities: () => Promise<Record<import('./platform').PlatformId, import('./account').PlatformCapabilities>>;
    getLauncherStatuses: () => Promise<Record<import('./platform').PlatformId, import('./account').PlatformLauncherStatus>>;
    getActiveProfiles: () => Promise<Record<import('./platform').PlatformId, import('./account').ActivePlatformProfile>>;
    clearActiveProfile: (platformId: import('./platform').PlatformId) => Promise<boolean>;
    switchAccount: (accountId: string, forceReauth?: boolean) => Promise<import('./account').AccountSwitchResult>;
    cancelSwitch: (switchId: string) => Promise<void>;
    confirmSwitch: (accountId: string, switchId: string) => Promise<{
      success: boolean;
      accountId: string;
      platformId?: import('./platform').PlatformId;
      lastUsedAt: string;
      verificationStatus: string;
      message?: string;
    }>;
    openLauncher: (
      platformId: import('./platform').PlatformId
    ) => Promise<{ success: boolean; message: string }>;
    getSwitchHistory: (
      accountId?: string
    ) => Promise<import('./account').AccountSwitchHistoryRecord[]>;
    getGameAssociations: () => Promise<import('./account').GameAccountAssociation[]>;
    setGameAssociation: (gameId: string, accountId: string | null) => Promise<void>;
    onAccountsUpdated: (callback: () => void) => () => void;
    riotGetEnrolledProfiles?: () => Promise<string[]>;
    riotEnrollSession?: (profileId: string, consentGiven: boolean) => Promise<import('./account').RiotAccountEnrollmentResult>;
    riotRemoveSession?: (profileId: string) => Promise<{ success: boolean; message: string }>;
    riotLiveSwitch?: (profileId: string) => Promise<import('./account').RiotLiveSwitchResult>;
    riotRecoverPending?: () => Promise<import('./account').RiotRecoveryResult>;
    riotGetCredentialStatus?: (profileId: string) => Promise<{ hasSavedCredentials: boolean; username?: string; updatedAtIso?: string }>;
    riotGetAllCredentialStatuses?: () => Promise<Record<string, { hasSavedCredentials: boolean; username?: string; updatedAtIso?: string }>>;
    riotSaveCredentials?: (profileId: string, username: string, password: string) => Promise<{ success: boolean; updatedAtIso: string }>;
    riotDeleteCredentials?: (profileId: string) => Promise<boolean>;
    riotGetLoginCredentials?: (profileId: string) => Promise<{ username: string; password: string } | null>;
    riotCheckClientRunning?: () => Promise<boolean>;
    riotLaunchClient?: () => Promise<{ success: boolean; message: string }>;
    riotStartDesktopLogin?: (profileId: string, autoLaunchClient?: boolean, autoSubmit?: boolean, isSyntheticTest?: boolean, targetHwnd?: string, targetPid?: number) => Promise<RiotDesktopLoginResultPayload>;
    riotCancelDesktopLogin?: () => Promise<void>;
    onRiotDesktopLoginProgress?: (callback: (payload: RiotDesktopLoginProgressPayload) => void) => () => void;
  };
}

declare global {
  interface Window {
    maswitch?: MaSwitchBridge;
  }
}
