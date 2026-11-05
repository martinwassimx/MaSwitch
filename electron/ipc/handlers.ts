import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  safeStorage,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import type { CustomGameInput, EditGameInput } from '../../src/shared/types/game';
import {
  IPC_CHANNELS,
  type WindowStatePayload,
} from '../../src/shared/types/ipc';
import type { AppRuntimeInfo } from '../../src/shared/types/settings';
import { isTrustedRendererUrl } from '../../src/shared/validation/settingsValidator';
import type { MaSwitchSqliteDatabase } from '../services/database/sqliteDatabase';
import type { GameLauncherEngine } from '../services/launcher/gameLauncherEngine';
import type { GameScannerEngine } from '../services/scanner/gameScannerEngine';
import type { ElectronSettingsStore } from '../services/settingsStore';
import type { MaSwitchStartupService } from '../services/startupService';
import type { PlaytimeTrackerEngine } from '../services/tracker/playtimeTrackerEngine';
import type { ArtworkCacheService } from '../services/artwork/artworkCacheService';
import type { SteamGridDbArtworkService } from '../services/steamgriddb/steamGridDbArtworkService';
import type { SteamGridDbClient } from '../services/steamgriddb/steamGridDbClient';
import type { SteamGridDbSecretStore } from '../services/steamgriddb/steamGridDbSecretStore';
import type { ApplyArtworkInput } from '../../src/shared/types/steamgriddb';
import type { AccountSwitcherService } from '../services/accounts/accountSwitcherService';
import { listWindowsProcessImageNames } from '../services/tracker/playtimeTrackerEngine';
import type {
  CreateAccountProfileInput,
  UpdateAccountProfileInput,
} from '../../src/shared/types/account';
import type { PlatformId } from '../../src/shared/types/platform';
import type { RiotLiveSwitchingEngine } from '../services/accounts/riotLiveSwitchingEngine';
import type {
  RiotWindowsSessionVault,
  RiotWindowsSessionStorage,
  RiotWindowsProcessCoordinator,
} from '../services/accounts/riotProductionAdapters';
import type { RiotCredentialVault } from '../services/accounts/riotCredentialVault';
import { RiotDesktopLoginAutomationService } from '../services/accounts/riotDesktopLoginAutomation';
import { PerformanceMonitorService } from '../services/performanceMonitorService';
import { NewsService } from '../services/newsService';
import { BackupService } from '../services/backupService';
import { InstalledFeaturesManager } from '../services/features/installedFeaturesManager';
import { MemoryManagementService } from '../services/memory/memoryManagementService';
import type { MemoryCleanupRequest } from '../../src/shared/types/memory';
import type { CreateCollectionInput, UpdateCollectionInput } from '../../src/shared/types/collection';
import type { PerformanceMonitoringConfig } from '../../src/shared/types/performance';
import type { OptionalFeatureId, InstallPresetId } from '../../src/shared/types/features';

export function assertTrustedSender(
  event: IpcMainInvokeEvent,
  getMainWindow: () => BrowserWindow | null,
  devServerUrl?: string
): BrowserWindow {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Unauthorized IPC call: Main window unavailable.');
  }

  if (event.sender.id !== mainWindow.webContents.id) {
    throw new Error('Unauthorized IPC call: Untrusted WebContents sender.');
  }

  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  if (!isTrustedRendererUrl(senderUrl, devServerUrl)) {
    throw new Error('Unauthorized IPC call: Untrusted sender origin.');
  }

  return mainWindow;
}

export function getWindowStatePayload(win: BrowserWindow): WindowStatePayload {
  if (win.isDestroyed()) {
    return {
      isMaximized: false,
      isFullScreen: false,
      isFocused: false,
    };
  }
  return {
    isMaximized: win.isMaximized(),
    isFullScreen: win.isFullScreen(),
    isFocused: win.isFocused(),
  };
}

export interface MainServicesContainer {
  settingsStore: ElectronSettingsStore;
  sqliteDb: MaSwitchSqliteDatabase;
  scannerEngine: GameScannerEngine;
  launcherEngine: GameLauncherEngine;
  trackerEngine: PlaytimeTrackerEngine;
  startupService: MaSwitchStartupService;
  artworkService: ArtworkCacheService;
  steamGridDbSecretStore: SteamGridDbSecretStore;
  steamGridDbClient: SteamGridDbClient;
  steamGridDbService: SteamGridDbArtworkService;
  accountSwitcherService: AccountSwitcherService;
  onRequestWindowClose: () => void;
  onTrayStateUpdate?: () => void;
  riotCredentialVault?: RiotCredentialVault;
  riotDesktopLoginAutomation?: RiotDesktopLoginAutomationService;
  performanceMonitorService?: PerformanceMonitorService;
  newsService?: NewsService;
  backupService?: BackupService;
  memoryService?: MemoryManagementService;
  installedFeaturesManager?: InstalledFeaturesManager;
  riotLiveServices?: {
    engine: RiotLiveSwitchingEngine;
    vault: RiotWindowsSessionVault;
    storage: RiotWindowsSessionStorage;
    processCoordinator: RiotWindowsProcessCoordinator;
  };
}

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  services: MainServicesContainer,
  devServerUrl?: string
): void {
  const {
    settingsStore,
    sqliteDb,
    scannerEngine,
    launcherEngine,
    trackerEngine,
    startupService,
    accountSwitcherService,
  } = services;

  const featuresManager =
    services.installedFeaturesManager ??
    new InstalledFeaturesManager();

  featuresManager.onUpdated((manifest) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.FEATURES_UPDATED_EVENT, manifest);
    }
  });

  // Gated service initializers to ensure ZERO background overhead when features are unselected/disabled
  let perfService: PerformanceMonitorService | null = null;
  const getPerfService = () => {
    if (!featuresManager.isFeatureEnabled('performanceMonitor')) {
      return null;
    }
    if (!perfService) {
      perfService =
        services.performanceMonitorService ??
        new PerformanceMonitorService({
          trackerEngine,
          getLowEndMode: () => settingsStore.load().lowEndPcMode ?? false,
          getWindow: getMainWindow,
        });
    }
    return perfService;
  };

  let newsService: NewsService | null = null;
  const getNewsService = () => {
    if (!featuresManager.isFeatureEnabled('gameNews')) {
      return null;
    }
    if (!newsService) {
      newsService = services.newsService ?? new NewsService();
    }
    return newsService;
  };

  let backupService: BackupService | null = null;
  const getBackupService = () => {
    if (!featuresManager.isFeatureEnabled('backupRestore')) {
      return null;
    }
    if (!backupService) {
      backupService =
        services.backupService ??
        new BackupService(
          sqliteDb,
          () => settingsStore.load(),
          async (s) => {
            settingsStore.save(s);
          }
        );
    }
    return backupService;
  };

  // Window Controls
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, (event) => {
    const win = assertTrustedSender(event, getMainWindow, devServerUrl);
    win.minimize();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE, (event) => {
    const win = assertTrustedSender(event, getMainWindow, devServerUrl);
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return getWindowStatePayload(win);
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    services.onRequestWindowClose();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_STATE, (event) => {
    const win = assertTrustedSender(event, getMainWindow, devServerUrl);
    return getWindowStatePayload(win);
  });

  // Settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_LOAD, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    const loaded = settingsStore.load();
    const dbFavorites = sqliteDb.getFavoriteGameIds();
    const mergedFavorites = Array.from(
      new Set([...loaded.favoriteGameIds, ...dbFavorites])
    );
    return {
      ...loaded,
      favoriteGameIds: mergedFavorites,
    };
  });

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SAVE,
    (event, partialSettings: unknown) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      const saved = settingsStore.save(partialSettings);
      trackerEngine.setEnabled(saved.playtimeTrackingEnabled);
      if (saved.lowEndPcMode !== undefined) {
        trackerEngine.setLowEndMode(Boolean(saved.lowEndPcMode));
      }
      if (saved.gameAwarePerformanceMode !== undefined) {
        trackerEngine.setGameAwareMode(Boolean(saved.gameAwarePerformanceMode));
      }
      if (saved.excludedApplications !== undefined) {
        trackerEngine.setExcludedApplications(saved.excludedApplications);
      }
      services.onTrayStateUpdate?.();
      if (saved.riotLiveSwitchingEnabled !== undefined && services.riotLiveServices) {
        services.riotLiveServices.engine.setEnabled(Boolean(saved.riotLiveSwitchingEnabled));
      }
      return saved;
    }
  );

  ipcMain.handle(IPC_CHANNELS.SETTINGS_RESET, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    const reset = settingsStore.reset();
    trackerEngine.setEnabled(reset.playtimeTrackingEnabled);
    trackerEngine.setLowEndMode(Boolean(reset.lowEndPcMode));
    trackerEngine.setGameAwareMode(Boolean(reset.gameAwarePerformanceMode));
    if (reset.excludedApplications) {
      trackerEngine.setExcludedApplications(reset.excludedApplications);
    }
    services.onTrayStateUpdate?.();
    return reset;
  });

  // Runtime Info
  ipcMain.handle(IPC_CHANNELS.APP_GET_RUNTIME_INFO, (event): AppRuntimeInfo => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return {
      appName: 'MaSwitch',
      appVersion: app.getVersion() || '1.0.0',
      phaseLabel: 'MaSwitch 3.0 — Windows Gaming Launcher & Account Manager',
      electronVersion: process.versions.electron ?? '33.x',
      chromeVersion: process.versions.chrome ?? '130.x',
      nodeVersion: process.versions.node ?? '22.x',
      platform: process.platform,
      arch: process.arch,
      isPackaged: app.isPackaged,
    };
  });

  // Phase 2: SQLite Library & Custom Games
  ipcMain.handle(IPC_CHANNELS.LIBRARY_GET_GAMES, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return sqliteDb.getAllLibraryGames();
  });

  ipcMain.handle(
    IPC_CHANNELS.LIBRARY_ADD_CUSTOM_GAME,
    (event, rawInput: unknown) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      if (!rawInput || typeof rawInput !== 'object') {
        throw new Error('Invalid custom game payload.');
      }
      const input = rawInput as CustomGameInput;
      return sqliteDb.addCustomGame(input);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.LIBRARY_UPDATE_GAME,
    (event, rawGameId: unknown, rawInput: unknown) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawGameId !== 'string' || rawGameId.trim().length === 0) {
        throw new Error('Invalid game ID.');
      }
      if (!rawInput || typeof rawInput !== 'object') {
        throw new Error('Invalid update game payload.');
      }
      const input = rawInput as EditGameInput;
      const updated = sqliteDb.updateGameDetails(rawGameId.trim(), input);
      const win = getMainWindow();
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.LIBRARY_UPDATED_EVENT);
      }
      return updated;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.LIBRARY_REMOVE_GAME,
    (event, rawGameId: unknown) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawGameId !== 'string' || rawGameId.trim().length === 0) {
        throw new Error('Invalid game ID.');
      }
      return sqliteDb.removeGameFromLibrary(rawGameId.trim());
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.LIBRARY_RESTORE_GAME,
    (event, rawGameId: unknown) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawGameId !== 'string' || rawGameId.trim().length === 0) {
        throw new Error('Invalid game ID.');
      }
      return sqliteDb.restoreGameToLibrary(rawGameId.trim());
    }
  );

  ipcMain.handle(IPC_CHANNELS.LIBRARY_GET_REMOVED_GAMES, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return sqliteDb.getRemovedGames();
  });

  ipcMain.handle(
    IPC_CHANNELS.LIBRARY_TOGGLE_FAVORITE,
    (event, rawGameId: unknown) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawGameId !== 'string' || rawGameId.trim().length === 0) {
        throw new Error('Invalid game ID.');
      }
      const res = sqliteDb.toggleFavorite(rawGameId.trim());
      settingsStore.save({ favoriteGameIds: res.favoriteGameIds });
      return res;
    }
  );

  ipcMain.handle(IPC_CHANNELS.LIBRARY_SELECT_EXECUTABLE, async (event) => {
    const win = assertTrustedSender(event, getMainWindow, devServerUrl);
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Game or Application Executable (.exe)',
      properties: ['openFile'],
      filters: [{ name: 'Windows Executables', extensions: ['exe'] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARY_SELECT_FOLDER, async (event) => {
    const win = assertTrustedSender(event, getMainWindow, devServerUrl);
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Custom Games Folder to Scan',
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0] ?? null;
  });

  // Phase 2: Installed Game Scanner
  ipcMain.handle(
    IPC_CHANNELS.SCANNER_START,
    async (event, rawOptions: unknown) => {
      const win = assertTrustedSender(event, getMainWindow, devServerUrl);
      const currentSettings = settingsStore.load();
      const opts =
        rawOptions && typeof rawOptions === 'object'
          ? (rawOptions as {
              customFolders?: string[];
              includeRegistry?: boolean;
            })
          : {};

      const customFolders = Array.isArray(opts.customFolders)
        ? opts.customFolders
        : currentSettings.customScanFolders;
      const includeRegistry =
        typeof opts.includeRegistry === 'boolean'
          ? opts.includeRegistry
          : currentSettings.includeRegistryApps;

      const { summary } = await scannerEngine.runScan(
        {
          customFolders,
          includeRegistry,
          onProgress: (progress) => {
            if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
              win.webContents.send(IPC_CHANNELS.SCANNER_PROGRESS_EVENT, progress);
            }
          },
        },
        (discovered) => sqliteDb.upsertDiscoveredGames(discovered)
      );

      sqliteDb.recordScanHistory(summary);
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.LIBRARY_UPDATED_EVENT);
      }

      // If SteamGridDB is configured, trigger background non-blocking artwork sync
      if (services.steamGridDbClient.isConfigured()) {
        void services.steamGridDbService.syncMissingLibraryArtwork().then(() => {
          if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.LIBRARY_UPDATED_EVENT);
          }
        });
      }

      return summary;
    }
  );

  ipcMain.handle(IPC_CHANNELS.SCANNER_CANCEL, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return scannerEngine.cancelActiveScan();
  });

  ipcMain.handle(IPC_CHANNELS.SCANNER_GET_HISTORY, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return sqliteDb.getScanHistory(10);
  });

  ipcMain.handle(IPC_CHANNELS.SCANNER_GET_PLATFORM_REPORTS, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    const reports = scannerEngine.getLastPlatformReports();
    if (reports.length > 0) {
      return reports;
    }
    const history = sqliteDb.getScanHistory(1);
    return history[0]?.platformReports ?? [];
  });

  // Phase 2: Functional Game Launching
  ipcMain.handle(
    IPC_CHANNELS.LAUNCHER_LAUNCH_GAME,
    async (event, rawGameId: unknown) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawGameId !== 'string' || rawGameId.trim().length === 0) {
        throw new Error('Invalid game ID.');
      }

      const game = sqliteDb.getGameById(rawGameId.trim());
      if (!game) {
        return {
          success: false,
          gameId: rawGameId.trim(),
          status: 'not-installed' as const,
          message: 'Game was not found in the local SQLite library.',
        };
      }

      return launcherEngine.launchGame(game);
    }
  );

  ipcMain.handle(IPC_CHANNELS.LAUNCHER_GET_STATUSES, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return launcherEngine.getAllStatuses();
  });

  // Phase 2: Background Playtime Tracker & Real Statistics
  ipcMain.handle(IPC_CHANNELS.TRACKER_GET_STATISTICS, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    const settings = settingsStore.load();
    const excludedHistoricalExes = new Set<string>();
    const excludedHistoricalGameIds = new Set<string>();

    if (Array.isArray(settings.excludedApplications)) {
      for (const rule of settings.excludedApplications) {
        if (rule.excludeHistorical) {
          if (rule.executableName) {
            excludedHistoricalExes.add(rule.executableName.toLowerCase().trim());
          }
          if (rule.gameId) {
            excludedHistoricalGameIds.add(rule.gameId.trim());
          }
        }
      }
    }

    return sqliteDb.getRealStatisticsOverview({
      exes: excludedHistoricalExes,
      gameIds: excludedHistoricalGameIds,
    });
  });

  ipcMain.handle(
    IPC_CHANNELS.APP_SHOW_NOTIFICATION,
    (event, rawPayload: unknown) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      const settings = settingsStore.load();
      if (!settings.notificationsEnabled) {
        return;
      }
      if (
        settings.suppressNotificationsInGame &&
        trackerEngine.getStatus().activeSessions.length > 0
      ) {
        return;
      }
      if (!rawPayload || typeof rawPayload !== 'object') {
        return;
      }
      const data = rawPayload as { title?: string; body?: string };
      if (Notification.isSupported() && data.title) {
        new Notification({
          title: data.title,
          body: data.body ?? '',
        }).show();
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.TRACKER_GET_STATUS, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return trackerEngine.getStatus();
  });

  ipcMain.handle(
    IPC_CHANNELS.TRACKER_SET_PAUSED,
    (event, rawPaused: unknown) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      const status = trackerEngine.setPaused(Boolean(rawPaused));
      services.onTrayStateUpdate?.();
      return status;
    }
  );

  // Phase 2: Windows Startup Integration
  ipcMain.handle(IPC_CHANNELS.STARTUP_GET_STATE, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return startupService.getStartupState();
  });

  ipcMain.handle(
    IPC_CHANNELS.STARTUP_SET_CONFIG,
    (event, rawConfig: unknown) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      const cfg =
        rawConfig && typeof rawConfig === 'object'
          ? (rawConfig as { openAtLogin?: boolean; startMinimized?: boolean })
          : {};
      return startupService.setStartupConfiguration({
        openAtLogin: Boolean(cfg.openAtLogin),
        startMinimized: Boolean(cfg.startMinimized),
      });
    }
  );

  // Artwork & Icon Cache
  ipcMain.handle(IPC_CHANNELS.ARTWORK_GET_STATS, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return services.artworkService.getStats();
  });

  ipcMain.handle(IPC_CHANNELS.ARTWORK_CLEAR_CACHE, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return services.artworkService.clearCache();
  });

  // SteamGridDB Integration
  ipcMain.handle(IPC_CHANNELS.STEAMGRIDDB_SAVE_KEY, async (event, rawKey: unknown) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    if (typeof rawKey !== 'string' || !rawKey.trim()) {
      return { success: false, message: 'Invalid API key provided.' };
    }
    const cleanKey = rawKey.trim();
    const testResult = await services.steamGridDbClient.testConnection(cleanKey);
    if (!testResult.success) {
      return { success: false, message: testResult.message };
    }
    services.steamGridDbSecretStore.saveApiKey(cleanKey);
    return { success: true, message: 'SteamGridDB API key verified and saved securely.' };
  });

  ipcMain.handle(IPC_CHANNELS.STEAMGRIDDB_REMOVE_KEY, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return services.steamGridDbSecretStore.removeApiKey();
  });

  ipcMain.handle(IPC_CHANNELS.STEAMGRIDDB_GET_STATUS, async (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return services.steamGridDbClient.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.STEAMGRIDDB_TEST_KEY, async (event, rawKey: unknown) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    const key = typeof rawKey === 'string' && rawKey.trim() ? rawKey.trim() : undefined;
    const testResult = await services.steamGridDbClient.testConnection(key);
    return { success: testResult.success, message: testResult.message };
  });

  ipcMain.handle(IPC_CHANNELS.STEAMGRIDDB_SEARCH_GAMES, async (event, rawQuery: unknown) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    if (typeof rawQuery !== 'string' || !rawQuery.trim()) {
      return [];
    }
    return services.steamGridDbClient.searchGames(rawQuery.trim());
  });

  ipcMain.handle(
    IPC_CHANNELS.STEAMGRIDDB_GET_GAME_ARTWORK,
    async (event, rawSgdbGameId: unknown, rawGameName?: unknown) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      const sgdbGameId = Number(rawSgdbGameId);
      if (!sgdbGameId || isNaN(sgdbGameId)) {
        return { gameId: 0, gameName: '', grids: [], heroes: [], logos: [], icons: [] };
      }
      const gameName = typeof rawGameName === 'string' ? rawGameName : '';
      return services.steamGridDbClient.getGameArtworkBundle(sgdbGameId, gameName);
    }
  );

  ipcMain.handle(IPC_CHANNELS.STEAMGRIDDB_APPLY_ARTWORK, async (event, rawInput: unknown) => {
    const win = assertTrustedSender(event, getMainWindow, devServerUrl);
    if (!rawInput || typeof rawInput !== 'object') {
      return null;
    }
    const result = await services.steamGridDbService.applyManualArtwork(rawInput as ApplyArtworkInput);
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.LIBRARY_UPDATED_EVENT);
    }
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.STEAMGRIDDB_RESTORE_DEFAULT_ARTWORK, async (event, rawGameId: unknown) => {
    const win = assertTrustedSender(event, getMainWindow, devServerUrl);
    if (typeof rawGameId !== 'string' || !rawGameId.trim()) {
      return null;
    }
    const result = await services.steamGridDbService.restoreDefaultArtwork(rawGameId.trim());
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.LIBRARY_UPDATED_EVENT);
    }
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.STEAMGRIDDB_SYNC_LIBRARY_ARTWORK, async (event) => {
    const win = assertTrustedSender(event, getMainWindow, devServerUrl);
    const result = await services.steamGridDbService.syncMissingLibraryArtwork();
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.LIBRARY_UPDATED_EVENT);
    }
    return result;
  });

  // Phase 6: Multi-Account Management & Switching
  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_GET_PROFILES,
    (event, rawPlatformId: unknown) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      const platformId =
        typeof rawPlatformId === 'string' && rawPlatformId
          ? (rawPlatformId as PlatformId)
          : undefined;
      return sqliteDb.getAccountProfiles(platformId);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_CREATE_PROFILE,
    (event, rawInput: unknown) => {
      const win = assertTrustedSender(event, getMainWindow, devServerUrl);
      if (!rawInput || typeof rawInput !== 'object') {
        throw new Error('Invalid account profile input.');
      }
      const created = sqliteDb.createAccountProfile(
        rawInput as CreateAccountProfileInput
      );
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT);
      }
      return created;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_UPDATE_PROFILE,
    (event, rawId: unknown, rawInput: unknown) => {
      const win = assertTrustedSender(event, getMainWindow, devServerUrl);
      if (
        typeof rawId !== 'string' ||
        !rawId.trim() ||
        !rawInput ||
        typeof rawInput !== 'object'
      ) {
        throw new Error('Invalid account update parameters.');
      }
      const updated = sqliteDb.updateAccountProfile(
        rawId.trim(),
        rawInput as UpdateAccountProfileInput
      );
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT);
      }
      return updated;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_DELETE_PROFILE,
    (event, rawId: unknown) => {
      const win = assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawId !== 'string' || !rawId.trim()) {
        throw new Error('Invalid account ID.');
      }
      const deleted = sqliteDb.deleteAccountProfile(rawId.trim());
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT);
      }
      return deleted;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_SET_PREFERRED,
    (event, rawId: unknown) => {
      const win = assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawId !== 'string' || !rawId.trim()) {
        throw new Error('Invalid account ID.');
      }
      const success = sqliteDb.setPreferredAccount(rawId.trim());
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT);
      }
      return success;
    }
  );

  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_GET_CAPABILITIES, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return accountSwitcherService.getCapabilities();
  });

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_GET_LAUNCHER_STATUSES,
    async (event) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      const processes = await listWindowsProcessImageNames();
      const runningNames = new Set(processes.map((p) => p.imageNameLower));
      return accountSwitcherService.getPlatformLauncherStatuses(runningNames);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_GET_ACTIVE_PROFILES,
    (event) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      return accountSwitcherService.getActivePlatformProfiles();
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_CLEAR_ACTIVE_PROFILE,
    (event, rawPlatformId: unknown) => {
      const win = assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawPlatformId !== 'string' || !rawPlatformId.trim()) {
        throw new Error('Invalid platform ID for clearing active profile.');
      }
      accountSwitcherService.clearActivePlatformProfile(
        rawPlatformId.trim() as PlatformId
      );
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT);
      }
      return true;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_SWITCH_ACCOUNT,
    async (event, rawAccountId: unknown, forceReauth?: unknown) => {
      const win = assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawAccountId !== 'string' || !rawAccountId.trim()) {
        throw new Error('Invalid account ID for switching.');
      }
      const profile = sqliteDb.getAccountProfileById(rawAccountId.trim());
      if (!profile) {
        throw new Error('Target account profile was not found in SQLite.');
      }
      const result = await accountSwitcherService.switchAccount(profile, forceReauth === true);
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT);
      }
      return result;
    }
  );

  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_CANCEL_SWITCH, (event, switchId: unknown) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    if (typeof switchId === 'string') accountSwitcherService.cancelAccountSwitch(switchId);
  });

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_CONFIRM_SWITCH,
    (event, rawAccountId: unknown, switchId: unknown) => {
      const win = assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawAccountId !== 'string' || !rawAccountId.trim()) {
        throw new Error('Invalid account ID for confirmation.');
      }
      if (typeof switchId !== 'string') throw new Error('Invalid sign-in request.');
      const result = accountSwitcherService.confirmAccountSwitch(rawAccountId.trim(), switchId);
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT);
      }
      return result;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_OPEN_LAUNCHER,
    async (event, rawPlatformId: unknown) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawPlatformId !== 'string' || !rawPlatformId.trim()) {
        throw new Error('Invalid platform ID for launcher opening.');
      }
      return accountSwitcherService.openPlatformLauncher(
        rawPlatformId.trim() as PlatformId
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_GET_SWITCH_HISTORY,
    (event, rawAccountId: unknown) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      const accountId =
        typeof rawAccountId === 'string' && rawAccountId.trim()
          ? rawAccountId.trim()
          : undefined;
      return sqliteDb.getAccountSwitchHistory(accountId);
    }
  );

  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_GET_GAME_ASSOCIATIONS, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return sqliteDb.getGameAccountAssociations();
  });

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_SET_GAME_ASSOCIATION,
    (event, rawGameId: unknown, rawAccountId: unknown) => {
      const win = assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawGameId !== 'string' || !rawGameId.trim()) {
        throw new Error('Invalid game ID for account association.');
      }
      const accountId =
        typeof rawAccountId === 'string' && rawAccountId.trim()
          ? rawAccountId.trim()
          : null;
      sqliteDb.setGameAccountAssociation(rawGameId.trim(), accountId);
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT);
        win.webContents.send(IPC_CHANNELS.LIBRARY_UPDATED_EVENT);
      }
    }
  );

  // --- Phase 12: Production Riot Live Switching & DPAPI Vault Handlers ---

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_RIOT_GET_ENROLLED_PROFILES,
    async (event) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      if (!services.riotLiveServices) return [];
      return services.riotLiveServices.vault.listStoredAccountIds();
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_RIOT_ENROLL_SESSION,
    async (event, rawProfileId: unknown, rawConsentGiven: unknown) => {
      const win = assertTrustedSender(event, getMainWindow, devServerUrl);
      if (rawConsentGiven !== true) {
        throw new Error(
          'Session enrollment requires explicit user approval and consent before accessing authentication session files.'
        );
      }
      if (typeof rawProfileId !== 'string' || !rawProfileId.trim()) {
        throw new Error('Invalid account profile ID for session enrollment.');
      }
      const profileId = rawProfileId.trim();
      const profile = sqliteDb.getAccountProfileById(profileId);
      if (!profile) {
        throw new Error(`Profile with ID '${profileId}' was not found in database.`);
      }
      if (profile.platformId !== 'riot') {
        throw new Error(`Profile '${profile.displayName}' is not a Riot Games profile.`);
      }
      if (!services.riotLiveServices) {
        throw new Error('Riot live switching services are not available.');
      }

      const currentSettings = settingsStore.load();
      if (!currentSettings.riotLiveSwitchingEnabled) {
        throw new Error(
          'Riot live switching is disabled in settings. Enable "One-Click Riot Switching" first.'
        );
      }

      if (typeof safeStorage.isEncryptionAvailable === 'function' && !safeStorage.isEncryptionAvailable()) {
        throw new Error(
          'Windows DPAPI encryption is not available on this system. Cannot securely store credentials.'
        );
      }

      // Safety checks: Never enroll while game is running
      if (await services.riotLiveServices.processCoordinator.isGameRunning()) {
        throw new Error(
          'A Riot game is currently running. Please exit all games before enrolling an account.'
        );
      }

      // Ensure Riot Client is closed so session files are completely flushed
      if (await services.riotLiveServices.processCoordinator.isClientRunning()) {
        const closed = await services.riotLiveServices.processCoordinator.requestGracefulShutdown();
        if (!closed && (await services.riotLiveServices.processCoordinator.isClientRunning())) {
          throw new Error(
            'Riot Client is currently open. Please close Riot Client so that session files can be safely read.'
          );
        }
      }

      // Identity check: prevent accidental association with the wrong profile (Issue 7)
      if (typeof services.riotLiveServices.storage.inspectLocalSessionIdentity === 'function') {
        const localIdentity = await services.riotLiveServices.storage.inspectLocalSessionIdentity();
        if (localIdentity.extractedUsername) {
          const extracted = localIdentity.extractedUsername.toLowerCase().trim();
          const targetUsername = profile.username.toLowerCase().trim();
          const targetDisplayName = profile.displayName.toLowerCase().trim();
          if (extracted !== targetUsername && extracted !== targetDisplayName) {
            throw new Error(
              `Active Riot Client session appears to belong to "${localIdentity.extractedUsername}", which does not match target profile "${profile.displayName}" (${profile.username}). Please sign into "${profile.displayName}" in Riot Client before enrolling.`
            );
          }
        }
      }

      const sessionData = await services.riotLiveServices.storage.exportLiveSession();
      if (!sessionData || sessionData.length === 0) {
        throw new Error(
          'No active Riot Client session files found in local data directory. Please sign in to Riot Client once, close it, and try again.'
        );
      }

      await services.riotLiveServices.vault.saveSession(profileId, sessionData);

      // Update SQLite active profile
      sqliteDb.selectAccountProfile(profileId, 'riot');
      sqliteDb.recordAccountSwitch(
        profileId,
        'riot',
        'live_dpapi_enrollment',
        true,
        'Riot session securely enrolled into Windows DPAPI vault'
      );

      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT);
      }

      const activeAccountId = await services.riotLiveServices.storage.readCurrentActiveSessionId();
      return {
        success: true,
        profileId,
        activeAccountId,
        enrolledAtIso: new Date().toISOString(),
        message: `Session for "${profile.displayName}" has been securely enrolled with Windows DPAPI encryption.`,
      };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_RIOT_REMOVE_SESSION,
    async (event, rawProfileId: unknown) => {
      const win = assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawProfileId !== 'string' || !rawProfileId.trim()) {
        throw new Error('Invalid account profile ID.');
      }
      const profileId = rawProfileId.trim();
      if (!services.riotLiveServices) {
        throw new Error('Riot live switching services are not available.');
      }

      await services.riotLiveServices.vault.deleteSession(profileId);

      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT);
      }

      return {
        success: true,
        message: 'Session removed from vault successfully.',
      };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_RIOT_LIVE_SWITCH,
    async (event, rawProfileId: unknown) => {
      const win = assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawProfileId !== 'string' || !rawProfileId.trim()) {
        throw new Error('Invalid account profile ID for switching.');
      }
      const profileId = rawProfileId.trim();
      const profile = sqliteDb.getAccountProfileById(profileId);
      if (!profile) {
        throw new Error(`Profile with ID '${profileId}' was not found in database.`);
      }
      if (profile.platformId !== 'riot') {
        throw new Error(`Profile '${profile.displayName}' is not a Riot Games profile.`);
      }
      if (!services.riotLiveServices) {
        throw new Error('Riot live switching services are not available.');
      }

      const currentSettings = settingsStore.load();
      if (!currentSettings.riotLiveSwitchingEnabled) {
        throw new Error(
          'Riot live switching is disabled in settings. Enable "One-Click Riot Switching" first.'
        );
      }

      const hasSession = await services.riotLiveServices.vault.hasSession(profileId);
      if (!hasSession) {
        throw new Error(
          `No enrolled session found for "${profile.displayName}". Please enroll this account first.`
        );
      }

      const result = await services.riotLiveServices.engine.switchAccount(profileId);

      if (result.success) {
        sqliteDb.selectAccountProfile(profileId, 'riot');
        sqliteDb.recordAccountSwitch(
          profileId,
          'riot',
          'live_dpapi',
          true,
          result.warningNotice ?? 'Switched via Windows DPAPI encrypted session vault',
          result.fromAccountId
        );
      }

      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT);
      }

      return result;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_RIOT_GET_CREDENTIAL_STATUS,
    async (event, rawProfileId: unknown) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawProfileId !== 'string' || !rawProfileId.trim()) {
        return { hasSavedCredentials: false };
      }
      if (!services.riotCredentialVault) {
        return { hasSavedCredentials: false };
      }
      return services.riotCredentialVault.getCredentialStatus(rawProfileId.trim());
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_RIOT_GET_ALL_CREDENTIAL_STATUSES,
    async (event) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      if (!services.riotCredentialVault) {
        return {};
      }
      return services.riotCredentialVault.listAllCredentialStatuses();
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_RIOT_SAVE_CREDENTIALS,
    async (event, rawProfileId: unknown, rawUsername: unknown, rawPassword: unknown) => {
      const win = assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawProfileId !== 'string' || !rawProfileId.trim()) {
        throw new Error('Invalid account profile ID.');
      }
      if (typeof rawUsername !== 'string' || !rawUsername.trim()) {
        throw new Error('Riot login username is required.');
      }
      if (typeof rawPassword !== 'string' || !rawPassword) {
        throw new Error('Riot login password is required.');
      }
      if (!services.riotCredentialVault) {
        throw new Error('Windows DPAPI Credential Vault is unavailable.');
      }
      const result = await services.riotCredentialVault.saveCredentials(
        rawProfileId.trim(),
        rawUsername.trim(),
        rawPassword
      );
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT);
      }
      return result;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_RIOT_DELETE_CREDENTIALS,
    async (event, rawProfileId: unknown) => {
      const win = assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawProfileId !== 'string' || !rawProfileId.trim()) {
        throw new Error('Invalid account profile ID.');
      }
      if (!services.riotCredentialVault) {
        throw new Error('Windows DPAPI Credential Vault is unavailable.');
      }
      const result = await services.riotCredentialVault.deleteCredentials(rawProfileId.trim());
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT);
      }
      return result;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_RIOT_GET_LOGIN_CREDENTIALS,
    async (event, rawProfileId: unknown) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawProfileId !== 'string' || !rawProfileId.trim()) {
        return null;
      }
      if (!services.riotCredentialVault) {
        return null;
      }
      return services.riotCredentialVault.getDecryptedCredentials(rawProfileId.trim());
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_RIOT_CHECK_CLIENT_RUNNING,
    async (event) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      if (services.riotLiveServices) {
        return services.riotLiveServices.processCoordinator.isClientRunning();
      }
      const list = await listWindowsProcessImageNames();
      return list.some(
        (p) =>
          p.imageNameLower === 'riotclientservices.exe' ||
          p.imageNameLower === 'riotclientux.exe'
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_RIOT_LAUNCH_CLIENT,
    async (event) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      return services.accountSwitcherService.openPlatformLauncher('riot');
    }
  );

// --- Phase 13: Riot Desktop Login Automation Handlers ---
  const getAutomationService = () => {
    if (services.riotDesktopLoginAutomation) {
      return services.riotDesktopLoginAutomation;
    }
    if (services.riotCredentialVault) {
      const coordinator = services.riotLiveServices?.processCoordinator;
      services.riotDesktopLoginAutomation = new RiotDesktopLoginAutomationService(
        services.riotCredentialVault,
        coordinator
      );
      return services.riotDesktopLoginAutomation;
    }
    return null;
  };

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_RIOT_START_DESKTOP_LOGIN,
    async (
      event,
      rawProfileId: unknown,
      rawAutoLaunch: unknown,
      rawAutoSubmit: unknown,
      rawIsSynthetic: unknown,
      rawTargetHwnd: unknown,
      rawTargetPid: unknown
    ) => {
      const win = assertTrustedSender(event, getMainWindow, devServerUrl);
      if (typeof rawProfileId !== 'string' || !rawProfileId.trim()) {
        throw new Error('Invalid account profile ID for desktop login automation.');
      }
      const profileId = rawProfileId.trim();
      const profile = sqliteDb.getAccountProfileById(profileId);
      if (!profile) {
        throw new Error(`Profile with ID '${profileId}' was not found.`);
      }

      const autoService = getAutomationService();
      if (!autoService) {
        throw new Error('Riot desktop login automation service is unavailable.');
      }

      const currentSettings = settingsStore.load();
      const shouldAutoSubmit =
        typeof rawAutoSubmit === 'boolean'
          ? rawAutoSubmit
          : (currentSettings.riotAutoSubmitLogin ?? true);

      const result = await autoService.executeAutofill({
        profileId,
        autoLaunchClient: rawAutoLaunch === true,
        autoSubmit: shouldAutoSubmit,
        isSyntheticTest: rawIsSynthetic === true,
        targetHwnd: typeof rawTargetHwnd === 'string' ? rawTargetHwnd : undefined,
        targetPid: typeof rawTargetPid === 'number' ? rawTargetPid : undefined,
        onProgress: (payload) => {
          if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.ACCOUNTS_RIOT_LOGIN_AUTOMATION_PROGRESS, payload);
          }
        },
      });

      if (result.success) {
        sqliteDb.selectAccountProfile(profileId, 'riot');
        sqliteDb.recordAccountSwitch(
          profileId,
          'riot',
          'desktop_automation',
          true,
          'Autofilled credentials into official Riot Client via desktop automation'
        );
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT);
        }
      }

      return result;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_RIOT_CANCEL_DESKTOP_LOGIN,
    (event) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      const autoService = getAutomationService();
      if (autoService) {
        autoService.cancelActiveAutomation();
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ACCOUNTS_RIOT_RECOVER_PENDING,
    async (event) => {
      const win = assertTrustedSender(event, getMainWindow, devServerUrl);
      if (!services.riotLiveServices) {
        return {
          recovered: false,
          restoredAccountId: null,
          message: 'Riot live switching services are not available.',
        };
      }
      const result = await services.riotLiveServices.engine.recoverPendingOperation();
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ACCOUNTS_UPDATED_EVENT);
      }
      return result;
    }
  );

  // Helper for historical exclusions
  const getHistoricalExclusionSets = () => {
    const settings = settingsStore.load();
    const exes = new Set<string>();
    const gameIds = new Set<string>();

    if (Array.isArray(settings.excludedApplications)) {
      for (const rule of settings.excludedApplications) {
        if (rule.excludeHistorical) {
          if (rule.executableName) {
            exes.add(rule.executableName.toLowerCase().trim());
          }
          if (rule.gameId) {
            gameIds.add(rule.gameId.trim());
          }
        }
      }
    }

    return { exes, gameIds };
  };

  // 1. Feature 1: Year in Review Handlers
  ipcMain.handle(IPC_CHANNELS.STATISTICS_GET_AVAILABLE_YEARS, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    if (!featuresManager.isFeatureEnabled('yearInReview')) {
      return [new Date().getFullYear()];
    }
    return sqliteDb.getAvailableYears();
  });

  ipcMain.handle(IPC_CHANNELS.STATISTICS_GET_YEAR_IN_REVIEW, (event, year?: number) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    if (!featuresManager.isFeatureEnabled('yearInReview')) {
      return {
        year: year ?? new Date().getFullYear(),
        totalGamingHours: 0,
        totalSessions: 0,
        uniqueGamesCount: 0,
        averageSessionMinutes: 0,
        topGames: [],
        mostActiveMonth: null,
        mostActiveDayOfWeek: null,
        longestSession: null,
        monthlyPlaytime: [],
        dayOfWeekPlaytime: [],
        activityCalendar: [],
        comparison: null,
        hasData: false,
      };
    }
    const exclusions = getHistoricalExclusionSets();
    return sqliteDb.getYearInReview(year, exclusions);
  });

  // 2. Feature 2: Smart Collections Handlers
  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_GET_ALL, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    if (!featuresManager.isFeatureEnabled('smartCollections')) {
      return [];
    }
    const games = sqliteDb.getAllLibraryGames(undefined, 'all');
    const settings = settingsStore.load();
    return sqliteDb.getCollections(games, settings.favoriteGameIds ?? []);
  });

  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_CREATE, (event, input: CreateCollectionInput) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    if (!featuresManager.isFeatureEnabled('smartCollections')) {
      throw new Error('Feature "Smart Game Collections" is not enabled in this installation.');
    }
    const created = sqliteDb.createCollection(input);
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.COLLECTIONS_UPDATED_EVENT);
    }
    return created;
  });

  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_UPDATE, (event, input: UpdateCollectionInput) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    if (!featuresManager.isFeatureEnabled('smartCollections')) {
      throw new Error('Feature "Smart Game Collections" is not enabled in this installation.');
    }
    const updated = sqliteDb.updateCollection(input);
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.COLLECTIONS_UPDATED_EVENT);
    }
    return updated;
  });

  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_DELETE, (event, id: string) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    if (!featuresManager.isFeatureEnabled('smartCollections')) {
      throw new Error('Feature "Smart Game Collections" is not enabled in this installation.');
    }
    const res = sqliteDb.deleteCollection(id);
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.COLLECTIONS_UPDATED_EVENT);
    }
    return res;
  });

  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_ADD_GAME, (event, collectionId: string, gameId: string) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    if (!featuresManager.isFeatureEnabled('smartCollections')) {
      throw new Error('Feature "Smart Game Collections" is not enabled in this installation.');
    }
    const res = sqliteDb.addGameToCollection(collectionId, gameId);
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.COLLECTIONS_UPDATED_EVENT);
    }
    return res;
  });

  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_REMOVE_GAME, (event, collectionId: string, gameId: string) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    if (!featuresManager.isFeatureEnabled('smartCollections')) {
      throw new Error('Feature "Smart Game Collections" is not enabled in this installation.');
    }
    const res = sqliteDb.removeGameFromCollection(collectionId, gameId);
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.COLLECTIONS_UPDATED_EVENT);
    }
    return res;
  });

  ipcMain.handle(IPC_CHANNELS.COLLECTIONS_SET_GAME_ORDER, (event, collectionId: string, gameIds: string[]) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    if (!featuresManager.isFeatureEnabled('smartCollections')) {
      throw new Error('Feature "Smart Game Collections" is not enabled in this installation.');
    }
    const res = sqliteDb.setCollectionGameOrder(collectionId, gameIds);
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.COLLECTIONS_UPDATED_EVENT);
    }
    return res;
  });

  // 3. Feature 3: Performance Monitor Handlers
  ipcMain.handle(IPC_CHANNELS.PERFORMANCE_GET_METRICS, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    const svc = getPerfService();
    if (!svc) {
      throw new Error('Feature "Lightweight Performance Monitor" is not enabled in this installation.');
    }
    return svc.getCurrentMetrics();
  });

  ipcMain.handle(IPC_CHANNELS.PERFORMANCE_SET_MONITORING_ACTIVE, (event, config: Partial<PerformanceMonitoringConfig>) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    const svc = getPerfService();
    if (!svc) return false;
    svc.setMonitoringConfig(config);
    return svc.isMonitoringActive();
  });

  // 4. Feature 4: Game Updates & News Handlers
  ipcMain.handle(IPC_CHANNELS.NEWS_GET_LIBRARY_NEWS, async (event, options?: { forceRefresh?: boolean; gameId?: string; platformId?: string }) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    const svc = getNewsService();
    if (!svc) {
      return {
        articles: [],
        lastUpdatedIso: new Date().toISOString(),
        supportedGamesCount: 0,
        unsupportedGamesCount: 0,
        isOffline: true,
      };
    }
    const games = sqliteDb.getAllLibraryGames(undefined, 'visible-only');
    return await svc.getLibraryNews(games, options);
  });

  ipcMain.handle(IPC_CHANNELS.NEWS_OPEN_EXTERNAL_LINK, async (event, url: string) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  // 5. Feature 5: Backup & Restore Handlers
  ipcMain.handle(IPC_CHANNELS.BACKUP_GET_INFO, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    const svc = getBackupService();
    if (!svc) {
      return {
        lastBackupIso: null,
        lastBackupPath: null,
        backupsCount: 0,
        defaultBackupDir: '',
      };
    }
    return svc.getBackupInfo();
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_CREATE, async (event, customPath?: string) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    const svc = getBackupService();
    if (!svc) {
      throw new Error('Feature "Backup & Restore" is not enabled in this installation.');
    }
    return await svc.createBackup(customPath);
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_VALIDATE, (event, filePath: string) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    const svc = getBackupService();
    if (!svc) {
      return { valid: false, filePath, fileSizeBytes: 0, error: 'Feature "Backup & Restore" is disabled.' };
    }
    return svc.validateBackup(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_RESTORE, async (event, filePath: string) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    const svc = getBackupService();
    if (!svc) {
      return { success: false, error: 'Feature "Backup & Restore" is disabled.' };
    }
    return await svc.restoreBackup(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_SELECT_FILE, async (event) => {
    const win = assertTrustedSender(event, getMainWindow, devServerUrl);
    const res = await dialog.showOpenDialog(win, {
      title: 'Select MaSwitch Backup File',
      filters: [{ name: 'MaSwitch Backup (*.json)', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return res.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.BACKUP_SELECT_DESTINATION, async (event) => {
    const win = assertTrustedSender(event, getMainWindow, devServerUrl);
    const res = await dialog.showSaveDialog(win, {
      title: 'Save MaSwitch Backup',
      defaultPath: `maswitch-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'MaSwitch Backup (*.json)', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return null;
    return res.filePath;
  });

  // 6. Modular Features & Installer Management Handlers
  ipcMain.handle(IPC_CHANNELS.FEATURES_GET_MANIFEST, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return featuresManager.getManifest();
  });

  ipcMain.handle(
    IPC_CHANNELS.FEATURES_SET_ENABLED,
    async (event, featureId: OptionalFeatureId, enabled: boolean) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      const updated = await featuresManager.setFeatureEnabled(featureId, enabled);
      if (featureId === 'performanceMonitor' && !enabled && perfService) {
        perfService.destroy();
        perfService = null;
      }
      if (featureId === 'memoryManagement' && !enabled && memoryServiceInstance) {
        memoryServiceInstance = null;
      }
      return updated;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.FEATURES_APPLY_PRESET,
    async (event, presetId: InstallPresetId) => {
      assertTrustedSender(event, getMainWindow, devServerUrl);
      const updated = await featuresManager.applyPreset(presetId);
      if (!featuresManager.isFeatureEnabled('performanceMonitor') && perfService) {
        perfService.destroy();
        perfService = null;
      }
      if (!featuresManager.isFeatureEnabled('memoryManagement') && memoryServiceInstance) {
        memoryServiceInstance = null;
      }
      return updated;
    }
  );

  ipcMain.handle(IPC_CHANNELS.FEATURES_LAUNCH_MODIFY, async (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return await featuresManager.launchInstallerModify();
  });

  // 7. Memory Management Handlers
  let memoryServiceInstance: MemoryManagementService | null = services.memoryService ?? null;
  const getMemoryService = (): MemoryManagementService => {
    if (!featuresManager.isFeatureEnabled('memoryManagement')) {
      throw new Error('Memory Management optional component is not enabled or installed.');
    }
    if (!memoryServiceInstance) {
      memoryServiceInstance = new MemoryManagementService(sqliteDb, trackerEngine);
    }
    return memoryServiceInstance;
  };

  ipcMain.handle(IPC_CHANNELS.MEMORY_GET_METRICS, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    const memService = getMemoryService();
    return memService.getSystemMemoryMetrics();
  });

  ipcMain.handle(IPC_CHANNELS.MEMORY_GET_CLEANABLE_APPS, async (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    return [];
  });

  ipcMain.handle(IPC_CHANNELS.MEMORY_PERFORM_CLEANUP, async (event, request: MemoryCleanupRequest) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    const memService = getMemoryService();
    return await memService.performCleanup(request);
  });

  ipcMain.handle(IPC_CHANNELS.MEMORY_GET_HISTORY, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    const memService = getMemoryService();
    return memService.getCleanupHistory();
  });

  ipcMain.handle(IPC_CHANNELS.MEMORY_CLEAR_HISTORY, (event) => {
    assertTrustedSender(event, getMainWindow, devServerUrl);
    const memService = getMemoryService();
    memService.clearCleanupHistory();
  });
}
