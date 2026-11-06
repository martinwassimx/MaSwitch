import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { CustomGameInput, EditGameInput } from '../src/shared/types/game';
import type {
  LauncherStatusChangedPayload,
  MaSwitchBridge,
  WindowStatePayload,
  RiotDesktopLoginProgressPayload,
} from '../src/shared/types/ipc';
import type { ScanProgressPayload } from '../src/shared/types/scanner';
import type { MaSwitchSettings } from '../src/shared/types/settings';
import type {
  ApplyArtworkInput,
  ArtworkSyncProgress,
} from '../src/shared/types/steamgriddb';

/**
 * Self-contained IPC channel constants for the sandboxed preload script.
 * Must match `src/shared/types/ipc.ts` exactly.
 * In sandboxed renderers, relative `require()` calls to outside files are blocked by Electron.
 */
const IPC_CHANNELS = {
  WINDOW_MINIMIZE: 'maswitch:window:minimize',
  WINDOW_MAXIMIZE_TOGGLE: 'maswitch:window:maximize-toggle',
  WINDOW_CLOSE: 'maswitch:window:close',
  WINDOW_GET_STATE: 'maswitch:window:get-state',
  WINDOW_STATE_CHANGED: 'maswitch:window:state-changed',
  WINDOW_VISIBILITY_CHANGED: 'maswitch:window:visibility-changed',
  SETTINGS_LOAD: 'maswitch:settings:load',
  SETTINGS_SAVE: 'maswitch:settings:save',
  SETTINGS_RESET: 'maswitch:settings:reset',
  APP_GET_RUNTIME_INFO: 'maswitch:app:get-runtime-info',
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
  SCANNER_START: 'maswitch:scanner:start',
  SCANNER_CANCEL: 'maswitch:scanner:cancel',
  SCANNER_GET_HISTORY: 'maswitch:scanner:get-history',
  SCANNER_GET_PLATFORM_REPORTS: 'maswitch:scanner:get-platform-reports',
  SCANNER_PROGRESS_EVENT: 'maswitch:scanner:progress',
  LAUNCHER_LAUNCH_GAME: 'maswitch:launcher:launch-game',
  LAUNCHER_GET_STATUSES: 'maswitch:launcher:get-statuses',
  LAUNCHER_STATUS_CHANGED_EVENT: 'maswitch:launcher:status-changed',
  TRACKER_GET_STATISTICS: 'maswitch:tracker:get-statistics',
  TRACKER_GET_STATUS: 'maswitch:tracker:get-status',
  TRACKER_SET_PAUSED: 'maswitch:tracker:set-paused',
  TRACKER_SESSION_UPDATED_EVENT: 'maswitch:tracker:session-updated',
  TRACKER_GAME_MODE_CHANGED: 'maswitch:tracker:game-mode-changed',
  APP_SHOW_NOTIFICATION: 'maswitch:app:show-notification',
  STARTUP_GET_STATE: 'maswitch:startup:get-state',
  STARTUP_SET_CONFIG: 'maswitch:startup:set-config',
  ARTWORK_GET_STATS: 'maswitch:artwork:get-stats',
  ARTWORK_CLEAR_CACHE: 'maswitch:artwork:clear-cache',
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
  ACCOUNTS_RIOT_CHECK_CLIENT_RUNNING: 'maswitch:accounts:riot:check-client-running',
  ACCOUNTS_RIOT_LAUNCH_CLIENT: 'maswitch:accounts:riot:launch-client',
  ACCOUNTS_RIOT_START_DESKTOP_LOGIN: 'maswitch:accounts:riot:start-desktop-login',
  ACCOUNTS_RIOT_CANCEL_DESKTOP_LOGIN: 'maswitch:accounts:riot:cancel-desktop-login',
  ACCOUNTS_RIOT_LOGIN_AUTOMATION_PROGRESS: 'maswitch:accounts:riot:login-automation-progress',

  // MaSwitch 3.0: Gaming Year in Review
  STATISTICS_GET_YEAR_IN_REVIEW: 'maswitch:statistics:get-year-in-review',
  STATISTICS_GET_AVAILABLE_YEARS: 'maswitch:statistics:get-available-years',

  // MaSwitch 3.0: Smart Game Collections
  COLLECTIONS_GET_ALL: 'maswitch:collections:get-all',
  COLLECTIONS_CREATE: 'maswitch:collections:create',
  COLLECTIONS_UPDATE: 'maswitch:collections:update',
  COLLECTIONS_DELETE: 'maswitch:collections:delete',
  COLLECTIONS_ADD_GAME: 'maswitch:collections:add-game',
  COLLECTIONS_REMOVE_GAME: 'maswitch:collections:remove-game',
  COLLECTIONS_SET_GAME_ORDER: 'maswitch:collections:set-game-order',
  COLLECTIONS_UPDATED_EVENT: 'maswitch:collections:updated',

  // MaSwitch 3.0: Lightweight Performance Monitor
  PERFORMANCE_GET_METRICS: 'maswitch:performance:get-metrics',
  PERFORMANCE_SET_MONITORING_ACTIVE: 'maswitch:performance:set-monitoring-active',
  PERFORMANCE_METRICS_UPDATED_EVENT: 'maswitch:performance:metrics-updated',

  // MaSwitch 3.0: Game Updates & News
  NEWS_GET_LIBRARY_NEWS: 'maswitch:news:get-library-news',
  NEWS_OPEN_EXTERNAL_LINK: 'maswitch:news:open-external-link',

  // MaSwitch 3.0: Backup & Restore
  BACKUP_CREATE: 'maswitch:backup:create',
  BACKUP_VALIDATE: 'maswitch:backup:validate',
  BACKUP_RESTORE: 'maswitch:backup:restore',
  BACKUP_GET_INFO: 'maswitch:backup:get-info',
  BACKUP_SELECT_FILE: 'maswitch:backup:select-file',
  BACKUP_SELECT_DESTINATION: 'maswitch:backup:select-destination',

  // MaSwitch 3.0: Modular Installer & Feature Gating
  FEATURES_GET_MANIFEST: 'maswitch:features:get-manifest',
  FEATURES_SET_ENABLED: 'maswitch:features:set-enabled',
  FEATURES_APPLY_PRESET: 'maswitch:features:apply-preset',
  FEATURES_LAUNCH_MODIFY: 'maswitch:features:launch-modify',
  FEATURES_UPDATED_EVENT: 'maswitch:features:updated',

  // MaSwitch 3.0: Optional Memory Management (Mem Reduct)
  MEMORY_GET_METRICS: 'maswitch:memory:get-metrics',
  MEMORY_GET_CLEANABLE_APPS: 'maswitch:memory:get-cleanable-apps',
  MEMORY_PERFORM_CLEANUP: 'maswitch:memory:perform-cleanup',
  MEMORY_GET_HISTORY: 'maswitch:memory:get-history',
  MEMORY_CLEAR_HISTORY: 'maswitch:memory:clear-history',

  // Application Updates
  UPDATER_CHECK_FOR_UPDATES: 'maswitch:updater:check-for-updates',
  UPDATER_GET_STATUS: 'maswitch:updater:get-status',
  UPDATER_START_DOWNLOAD: 'maswitch:updater:start-download',
  UPDATER_CANCEL_DOWNLOAD: 'maswitch:updater:cancel-download',
  UPDATER_INSTALL_AND_RESTART: 'maswitch:updater:install-and-restart',
  UPDATER_PRECHECK_INSTALL: 'maswitch:updater:precheck-install',
  UPDATER_STATUS_CHANGED_EVENT: 'maswitch:updater:status-changed',
  UPDATER_PROGRESS_EVENT: 'maswitch:updater:progress',
} as const;

const bridge: MaSwitchBridge = {
  windowControls: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
    toggleMaximize: () =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_STATE),
    onStateChanged: (callback: (state: WindowStatePayload) => void) => {
      const listener = (
        _event: IpcRendererEvent,
        payload: WindowStatePayload
      ) => {
        if (payload && typeof payload === 'object') {
          callback({
            isMaximized: Boolean(payload.isMaximized),
            isFullScreen: Boolean(payload.isFullScreen),
            isFocused: Boolean(payload.isFocused),
          });
        }
      };

      ipcRenderer.on(IPC_CHANNELS.WINDOW_STATE_CHANGED, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_STATE_CHANGED, listener);
      };
    },
    onVisibilityChanged: (callback: (visible: boolean) => void) => {
      const listener = (_event: IpcRendererEvent, payload: { visible: boolean }) => {
        if (payload && typeof payload.visible === 'boolean') {
          callback(payload.visible);
        }
      };
      ipcRenderer.on(IPC_CHANNELS.WINDOW_VISIBILITY_CHANGED, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_VISIBILITY_CHANGED, listener);
      };
    },
  },
  settings: {
    load: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_LOAD),
    save: (partial: Partial<MaSwitchSettings>) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, partial),
    reset: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_RESET),
  },
  app: {
    getRuntimeInfo: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_RUNTIME_INFO),
    showNotification: (options: {
      title: string;
      body: string;
      type?: 'info' | 'warning' | 'error';
    }) => ipcRenderer.invoke(IPC_CHANNELS.APP_SHOW_NOTIFICATION, options),
    onNavigateSection: (callback: (section: string) => void) => {
      const listener = (
        _event: IpcRendererEvent,
        section: string
      ) => {
        if (typeof section === 'string') callback(section);
      };
      ipcRenderer.on('maswitch:navigate:section', listener);
      return () => {
        ipcRenderer.removeListener('maswitch:navigate:section', listener);
      };
    },
    onFilterFavorites: (callback: (favoritesOnly: boolean) => void) => {
      const listener = (
        _event: IpcRendererEvent,
        val: boolean
      ) => {
        callback(Boolean(val));
      };
      ipcRenderer.on('maswitch:filter:favorites', listener);
      return () => {
        ipcRenderer.removeListener('maswitch:filter:favorites', listener);
      };
    },
  },
  library: {
    getGames: () => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_GET_GAMES),
    addCustomGame: (input: CustomGameInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_ADD_CUSTOM_GAME, input),
    updateGame: (gameId: string, input: EditGameInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_UPDATE_GAME, gameId, input),
    removeGame: (gameId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_REMOVE_GAME, gameId),
    restoreGame: (gameId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_RESTORE_GAME, gameId),
    getRemovedGames: () =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_GET_REMOVED_GAMES),
    toggleFavorite: (gameId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_TOGGLE_FAVORITE, gameId),
    selectExecutableDialog: () =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_SELECT_EXECUTABLE),
    selectFolderDialog: () =>
      ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_SELECT_FOLDER),
    onLibraryUpdated: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on(IPC_CHANNELS.LIBRARY_UPDATED_EVENT, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.LIBRARY_UPDATED_EVENT, listener);
      };
    },
  },
  scanner: {
    startScan: (options?: {
      customFolders?: string[];
      includeRegistry?: boolean;
    }) => ipcRenderer.invoke(IPC_CHANNELS.SCANNER_START, options),
    cancelScan: () => ipcRenderer.invoke(IPC_CHANNELS.SCANNER_CANCEL),
    getHistory: () => ipcRenderer.invoke(IPC_CHANNELS.SCANNER_GET_HISTORY),
    getPlatformReports: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SCANNER_GET_PLATFORM_REPORTS),
    onProgress: (callback: (progress: ScanProgressPayload) => void) => {
      const listener = (
        _event: IpcRendererEvent,
        payload: ScanProgressPayload
      ) => {
        if (payload && typeof payload === 'object') {
          callback(payload);
        }
      };
      ipcRenderer.on(IPC_CHANNELS.SCANNER_PROGRESS_EVENT, listener);
      return () => {
        ipcRenderer.removeListener(
          IPC_CHANNELS.SCANNER_PROGRESS_EVENT,
          listener
        );
      };
    },
  },
  launcher: {
    launchGame: (gameId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LAUNCHER_LAUNCH_GAME, gameId),
    getStatuses: () => ipcRenderer.invoke(IPC_CHANNELS.LAUNCHER_GET_STATUSES),
    onStatusChanged: (
      callback: (payload: LauncherStatusChangedPayload) => void
    ) => {
      const listener = (
        _event: IpcRendererEvent,
        payload: LauncherStatusChangedPayload
      ) => {
        if (payload && typeof payload === 'object') {
          callback(payload);
        }
      };
      ipcRenderer.on(IPC_CHANNELS.LAUNCHER_STATUS_CHANGED_EVENT, listener);
      return () => {
        ipcRenderer.removeListener(
          IPC_CHANNELS.LAUNCHER_STATUS_CHANGED_EVENT,
          listener
        );
      };
    },
  },
  tracker: {
    getStatistics: () =>
      ipcRenderer.invoke(IPC_CHANNELS.TRACKER_GET_STATISTICS),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.TRACKER_GET_STATUS),
    setPaused: (paused: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.TRACKER_SET_PAUSED, paused),
    onSessionUpdated: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on(IPC_CHANNELS.TRACKER_SESSION_UPDATED_EVENT, listener);
      return () => {
        ipcRenderer.removeListener(
          IPC_CHANNELS.TRACKER_SESSION_UPDATED_EVENT,
          listener
        );
      };
    },
    onGameModeChanged: (
      callback: (data: { inGame: boolean; activeGameCount: number }) => void
    ) => {
      const listener = (
        _event: IpcRendererEvent,
        payload: { inGame: boolean; activeGameCount: number }
      ) => {
        if (payload && typeof payload === 'object') {
          callback(payload);
        }
      };
      ipcRenderer.on(IPC_CHANNELS.TRACKER_GAME_MODE_CHANGED, listener);
      return () => {
        ipcRenderer.removeListener(
          IPC_CHANNELS.TRACKER_GAME_MODE_CHANGED,
          listener
        );
      };
    },
  },
  startup: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.STARTUP_GET_STATE),
    setConfiguration: (config: {
      openAtLogin: boolean;
      startMinimized: boolean;
    }) => ipcRenderer.invoke(IPC_CHANNELS.STARTUP_SET_CONFIG, config),
  },
  artwork: {
    getStats: () => ipcRenderer.invoke(IPC_CHANNELS.ARTWORK_GET_STATS),
    clearCache: () => ipcRenderer.invoke(IPC_CHANNELS.ARTWORK_CLEAR_CACHE),
  },
  steamGridDb: {
    saveApiKey: (apiKey: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.STEAMGRIDDB_SAVE_KEY, apiKey),
    removeApiKey: () =>
      ipcRenderer.invoke(IPC_CHANNELS.STEAMGRIDDB_REMOVE_KEY),
    getStatus: () =>
      ipcRenderer.invoke(IPC_CHANNELS.STEAMGRIDDB_GET_STATUS),
    testConnection: (apiKey?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.STEAMGRIDDB_TEST_KEY, apiKey),
    searchGames: (query: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.STEAMGRIDDB_SEARCH_GAMES, query),
    getGameArtwork: (sgdbGameId: number, gameName?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.STEAMGRIDDB_GET_GAME_ARTWORK, sgdbGameId, gameName),
    applyArtwork: (input: ApplyArtworkInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.STEAMGRIDDB_APPLY_ARTWORK, input),
    restoreDefaultArtwork: (gameId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.STEAMGRIDDB_RESTORE_DEFAULT_ARTWORK, gameId),
    syncLibraryArtwork: () =>
      ipcRenderer.invoke(IPC_CHANNELS.STEAMGRIDDB_SYNC_LIBRARY_ARTWORK),
    onSyncProgress: (callback: (progress: ArtworkSyncProgress) => void) => {
      const listener = (
        _event: IpcRendererEvent,
        payload: ArtworkSyncProgress
      ) => {
        if (payload && typeof payload === 'object') {
          callback(payload);
        }
      };
      ipcRenderer.on(IPC_CHANNELS.STEAMGRIDDB_SYNC_PROGRESS_EVENT, listener);
      return () => {
        ipcRenderer.removeListener(
          IPC_CHANNELS.STEAMGRIDDB_SYNC_PROGRESS_EVENT,
          listener
        );
      };
    },
  },
  accounts: {
    getProfiles: (platformId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_GET_PROFILES, platformId),
    createProfile: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_CREATE_PROFILE, input),
    updateProfile: (id, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_UPDATE_PROFILE, id, input),
    deleteProfile: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_DELETE_PROFILE, id),
    setPreferred: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_SET_PREFERRED, id),
    getCapabilities: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_GET_CAPABILITIES),
    getLauncherStatuses: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_GET_LAUNCHER_STATUSES),
    getActiveProfiles: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_GET_ACTIVE_PROFILES),
    clearActiveProfile: (platformId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_CLEAR_ACTIVE_PROFILE, platformId),
    switchAccount: (accountId, forceReauth) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_SWITCH_ACCOUNT, accountId, forceReauth),
    cancelSwitch: (switchId) => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_CANCEL_SWITCH, switchId),
    confirmSwitch: (accountId, switchId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_CONFIRM_SWITCH, accountId, switchId),
    openLauncher: (platformId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_OPEN_LAUNCHER, platformId),
    getSwitchHistory: (accountId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_GET_SWITCH_HISTORY, accountId),
    getGameAssociations: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_GET_GAME_ASSOCIATIONS),
    setGameAssociation: (gameId, accountId) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_SET_GAME_ASSOCIATION, gameId, accountId),
    riotGetEnrolledProfiles: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_RIOT_GET_ENROLLED_PROFILES),
    riotEnrollSession: (profileId: string, consentGiven: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_RIOT_ENROLL_SESSION, profileId, consentGiven),
    riotRemoveSession: (profileId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_RIOT_REMOVE_SESSION, profileId),
    riotLiveSwitch: (profileId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_RIOT_LIVE_SWITCH, profileId),
    riotRecoverPending: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_RIOT_RECOVER_PENDING),
    riotGetCredentialStatus: (profileId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_RIOT_GET_CREDENTIAL_STATUS, profileId),
    riotGetAllCredentialStatuses: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_RIOT_GET_ALL_CREDENTIAL_STATUSES),
    riotSaveCredentials: (profileId: string, username: string, password: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_RIOT_SAVE_CREDENTIALS, profileId, username, password),
    riotDeleteCredentials: (profileId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_RIOT_DELETE_CREDENTIALS, profileId),
    riotCheckClientRunning: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_RIOT_CHECK_CLIENT_RUNNING),
    riotLaunchClient: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_RIOT_LAUNCH_CLIENT),
    riotStartDesktopLogin: (profileId: string, autoLaunchClient?: boolean, autoSubmit?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_RIOT_START_DESKTOP_LOGIN, profileId, autoLaunchClient, autoSubmit),
    riotCancelDesktopLogin: () =>
      ipcRenderer.invoke(IPC_CHANNELS.ACCOUNTS_RIOT_CANCEL_DESKTOP_LOGIN),
    onRiotDesktopLoginProgress: (callback: (payload: RiotDesktopLoginProgressPayload) => void) => {
      const listener = (_event: IpcRendererEvent, payload: RiotDesktopLoginProgressPayload) => {
        if (payload && typeof payload === 'object') {
          callback(payload);
        }
      };
      ipcRenderer.on(IPC_CHANNELS.ACCOUNTS_RIOT_LOGIN_AUTOMATION_PROGRESS, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.ACCOUNTS_RIOT_LOGIN_AUTOMATION_PROGRESS, listener);
      };
    },
    onAccountsUpdated: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT, listener);
      };
    },
  },
  yearInReview: {
    getAvailableYears: () => ipcRenderer.invoke(IPC_CHANNELS.STATISTICS_GET_AVAILABLE_YEARS),
    getYearInReview: (year?: number) => ipcRenderer.invoke(IPC_CHANNELS.STATISTICS_GET_YEAR_IN_REVIEW, year),
  },
  collections: {
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.COLLECTIONS_GET_ALL),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.COLLECTIONS_CREATE, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.COLLECTIONS_UPDATE, input),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.COLLECTIONS_DELETE, id),
    addGame: (collectionId, gameId) => ipcRenderer.invoke(IPC_CHANNELS.COLLECTIONS_ADD_GAME, collectionId, gameId),
    removeGame: (collectionId, gameId) => ipcRenderer.invoke(IPC_CHANNELS.COLLECTIONS_REMOVE_GAME, collectionId, gameId),
    setGameOrder: (collectionId, gameIds) => ipcRenderer.invoke(IPC_CHANNELS.COLLECTIONS_SET_GAME_ORDER, collectionId, gameIds),
    onCollectionsUpdated: (callback) => {
      const listener = () => callback();
      ipcRenderer.on(IPC_CHANNELS.COLLECTIONS_UPDATED_EVENT, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.COLLECTIONS_UPDATED_EVENT, listener);
      };
    },
  },
  performance: {
    getMetrics: () => ipcRenderer.invoke(IPC_CHANNELS.PERFORMANCE_GET_METRICS),
    setMonitoringActive: (config) => ipcRenderer.invoke(IPC_CHANNELS.PERFORMANCE_SET_MONITORING_ACTIVE, config),
    onMetricsUpdated: (callback) => {
      const listener = (_event: IpcRendererEvent, metrics: import('../src/shared/types/performance').PerformanceMetrics) => {
        if (metrics && typeof metrics === 'object') {
          callback(metrics);
        }
      };
      ipcRenderer.on(IPC_CHANNELS.PERFORMANCE_METRICS_UPDATED_EVENT, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.PERFORMANCE_METRICS_UPDATED_EVENT, listener);
      };
    },
  },
  news: {
    getLibraryNews: (options) => ipcRenderer.invoke(IPC_CHANNELS.NEWS_GET_LIBRARY_NEWS, options),
    openExternalLink: (url) => ipcRenderer.invoke(IPC_CHANNELS.NEWS_OPEN_EXTERNAL_LINK, url),
  },
  backup: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_GET_INFO),
    create: (customPath) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_CREATE, customPath),
    validate: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_VALIDATE, filePath),
    restore: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_RESTORE, filePath),
    selectFile: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_SELECT_FILE),
    selectDestination: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_SELECT_DESTINATION),
  },
  features: {
    getManifest: () => ipcRenderer.invoke(IPC_CHANNELS.FEATURES_GET_MANIFEST),
    setEnabled: (featureId, enabled) => ipcRenderer.invoke(IPC_CHANNELS.FEATURES_SET_ENABLED, featureId, enabled),
    applyPreset: (presetId) => ipcRenderer.invoke(IPC_CHANNELS.FEATURES_APPLY_PRESET, presetId),
    launchModify: () => ipcRenderer.invoke(IPC_CHANNELS.FEATURES_LAUNCH_MODIFY),
    onFeaturesUpdated: (callback) => {
      const listener = (_event: IpcRendererEvent, manifest: import('../src/shared/types/features').InstalledFeaturesManifest) => {
        if (manifest && typeof manifest === 'object') {
          callback(manifest);
        }
      };
      ipcRenderer.on(IPC_CHANNELS.FEATURES_UPDATED_EVENT, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.FEATURES_UPDATED_EVENT, listener);
      };
    },
  },
  memory: {
    getMetrics: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_GET_METRICS),
    performCleanup: (request) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_PERFORM_CLEANUP, request),
    getHistory: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_GET_HISTORY),
    clearHistory: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_CLEAR_HISTORY),
  },
  updater: {
    checkForUpdates: (channel) => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_CHECK_FOR_UPDATES, channel),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_GET_STATUS),
    startDownload: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_START_DOWNLOAD),
    cancelDownload: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_CANCEL_DOWNLOAD),
    installAndRestart: (options) => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_INSTALL_AND_RESTART, options),
    precheckInstall: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_PRECHECK_INSTALL),
    onStatusChanged: (callback) => {
      const listener = (_event: IpcRendererEvent, state: import('../src/shared/types/updater').UpdaterState) => {
        if (state && typeof state === 'object') {
          callback(state);
        }
      };
      ipcRenderer.on(IPC_CHANNELS.UPDATER_STATUS_CHANGED_EVENT, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_STATUS_CHANGED_EVENT, listener);
      };
    },
    onDownloadProgress: (callback) => {
      const listener = (_event: IpcRendererEvent, progress: import('../src/shared/types/updater').UpdateDownloadProgress) => {
        if (progress && typeof progress === 'object') {
          callback(progress);
        }
      };
      ipcRenderer.on(IPC_CHANNELS.UPDATER_PROGRESS_EVENT, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_PROGRESS_EVENT, listener);
      };
    },
  },
};

interface DropEventLike {
  preventDefault(): void;
  dataTransfer?: { dropEffect: string } | null;
}
const rendererWindow = globalThis as unknown as {
  addEventListener(type: 'dragover' | 'drop', listener: (event: DropEventLike) => void, capture: boolean): void;
};
const blockExternalDrop = (event: DropEventLike) => {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'none';
  }
};
rendererWindow.addEventListener('dragover', blockExternalDrop, true);
rendererWindow.addEventListener('drop', blockExternalDrop, true);

try {
  contextBridge.exposeInMainWorld('maswitch', bridge);
} catch (err) {
  console.error('[MaSwitch Preload] Failed to expose contextBridge bridge:', err);
}
