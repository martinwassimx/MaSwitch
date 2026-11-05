delete process.env.ELECTRON_RUN_AS_NODE;
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  app,
  BrowserWindow,
  powerMonitor,
  protocol,
  session,
  shell,
} from 'electron';
import { IPC_CHANNELS } from '../src/shared/types/ipc';
import { isTrustedRendererUrl } from '../src/shared/validation/settingsValidator';
import {
  getWindowStatePayload,
  registerIpcHandlers,
} from './ipc/handlers';
import { ArtworkCacheService } from './services/artwork/artworkCacheService';
import { MaSwitchSqliteDatabase } from './services/database/sqliteDatabase';
import { GameLauncherEngine } from './services/launcher/gameLauncherEngine';
import { GameScannerEngine } from './services/scanner/gameScannerEngine';
import { ElectronSettingsStore } from './services/settingsStore';
import { MaSwitchStartupService } from './services/startupService';
import {
  PlaytimeTrackerEngine,
  listWindowsProcessImageNames,
} from './services/tracker/playtimeTrackerEngine';
import {
  detectEpicGameFromManifests,
  isEpicGamesLauncherInstalled,
} from './services/scanner/epicScanner';
import { MaSwitchTrayService } from './services/trayService';
import { SteamGridDbArtworkService } from './services/steamgriddb/steamGridDbArtworkService';
import { SteamGridDbClient } from './services/steamgriddb/steamGridDbClient';
import { SteamGridDbSecretStore } from './services/steamgriddb/steamGridDbSecretStore';
import { AccountSwitcherService, createWindowsAccountLauncherAdapter } from './services/accounts/accountSwitcherService';
import { createProductionRiotLiveSwitchingEngine } from './services/accounts/riotProductionAdapters';
import { RiotCredentialVault } from './services/accounts/riotCredentialVault';
import { RiotDesktopLoginAutomationService } from './services/accounts/riotDesktopLoginAutomation';
import { InstalledFeaturesManager } from './services/features/installedFeaturesManager';

// Register privileged custom scheme for streaming local artwork & extracted icons
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'maswitch-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: false,
      stream: true,
    },
  },
]);

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const IS_SMOKE_TEST = process.argv.includes('--smoke-test');
const START_HIDDEN = process.argv.includes('--hidden');

let mainWindow: BrowserWindow | null = null;
let isExplicitQuit = false;
let sqliteDatabase: MaSwitchSqliteDatabase | null = null;
let playtimeTracker: PlaytimeTrackerEngine | null = null;
let trayService: MaSwitchTrayService | null = null;

if (process.platform === 'win32') {
  app.setAppUserModelId('com.maswitch.desktop');
}

if (!app.isPackaged) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222');
}

app.disableHardwareAcceleration();

const logFile = path.join(app.getPath('userData'), 'desktop-launch.log');
const logStartup = (msg: string) => {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // ignore
  }
};

process.on('uncaughtException', (err) => {
  logStartup(`[FATAL CRASH] uncaughtException: ${err?.stack || err}`);
});

process.on('unhandledRejection', (reason) => {
  logStartup(`[FATAL CRASH] unhandledRejection: ${reason}`);
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
logStartup(`requestSingleInstanceLock: ${gotSingleInstanceLock}`);
if (!gotSingleInstanceLock && !IS_SMOKE_TEST) {
  logStartup('Failed to acquire single instance lock. Exiting duplicate instance.');
  app.quit();
}

function broadcastToRenderer(channel: string, payload?: unknown): void {
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.webContents.isDestroyed()
  ) {
    mainWindow.webContents.send(channel, payload);
  }
}

function broadcastWindowState(win: BrowserWindow): void {
  if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(
      IPC_CHANNELS.WINDOW_STATE_CHANGED,
      getWindowStatePayload(win)
    );
  }
}

function configureSecurityPolicies(): void {
  const defaultSession = session.defaultSession;

  defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    }
  );

  defaultSession.setPermissionCheckHandler(() => false);

  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const cspPolicy = DEV_SERVER_URL
      ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: maswitch-asset: https:; font-src 'self' data:; media-src 'self' data: blob: https:; connect-src 'self' maswitch-asset: https: ws://localhost:5173 http://localhost:5173; object-src 'none'; base-uri 'self'; form-action 'none';"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: maswitch-asset: https:; font-src 'self' data:; media-src 'self' data: blob: https:; connect-src 'self' maswitch-asset: https:; object-src 'none'; base-uri 'self'; form-action 'none';";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspPolicy],
      },
    });
  });
}

function performCompleteShutdown(): void {
  isExplicitQuit = true;
  if (playtimeTracker) {
    playtimeTracker.stop();
  }
  if (trayService) {
    trayService.destroy();
  }
  if (sqliteDatabase) {
    sqliteDatabase.close();
  }
  app.quit();
}

function createMainWindow(
  settingsStore: ElectronSettingsStore,
  iconPath: string
): BrowserWindow {
  const preloadPath = (() => {
    const candidates = [
      path.join(__dirname, 'preload.js'),
      path.join(__dirname, 'electron/preload.js'),
      path.join(app.getAppPath(), 'dist-electron/electron/preload.js'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return path.join(__dirname, 'preload.js');
  })();
  const logFile = path.join(app.getPath('userData'), 'desktop-launch.log');
  const logStartup = (msg: string) => {
    try {
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
    } catch {
      // ignore
    }
  };

  logStartup('Initializing main BrowserWindow...');
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#101114',
    show: false,
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow = win;
  win.setMenuBarVisibility(false);

  win.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('https://') || details.url.startsWith('http://')) {
      void shell.openExternal(details.url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isTrustedRendererUrl(navigationUrl, DEV_SERVER_URL)) {
      event.preventDefault();
    }
  });

  win.webContents.on('will-frame-navigate', (event) => {
    if (!isTrustedRendererUrl(event.url, DEV_SERVER_URL)) {
      event.preventDefault();
    }
  });

  // Intercept native window close to support minimize-to-tray when configured
  win.on('close', (event) => {
    if (isExplicitQuit || IS_SMOKE_TEST) {
      return;
    }
    const currentSettings = settingsStore.load();
    if (currentSettings.closeBehavior === 'minimize-to-tray') {
      event.preventDefault();
      win.hide();
    } else {
      isExplicitQuit = true;
    }
  });

  const notifyState = () => broadcastWindowState(win);
  const sendVisibility = (visible: boolean) => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.WINDOW_VISIBILITY_CHANGED, { visible });
    }
  };

  win.on('maximize', notifyState);
  win.on('unmaximize', notifyState);
  win.on('enter-full-screen', notifyState);
  win.on('leave-full-screen', notifyState);
  win.on('focus', notifyState);
  win.on('blur', notifyState);
  win.on('minimize', () => {
    notifyState();
    sendVisibility(false);
  });
  win.on('restore', () => {
    notifyState();
    sendVisibility(true);
  });
  win.on('hide', () => {
    notifyState();
    sendVisibility(false);
  });
  win.on('show', () => {
    notifyState();
    sendVisibility(true);
  });

  const bringToFront = () => {
    if (win.isDestroyed()) return;
    if (!START_HIDDEN || IS_SMOKE_TEST) {
      if (win.isMinimized()) {
        win.restore();
      }
      win.show();
      win.focus();
      win.setAlwaysOnTop(true);
      win.setAlwaysOnTop(false);
      logStartup(`Window brought to front: visible=${win.isVisible()}, focused=${win.isFocused()}, bounds=${JSON.stringify(win.getBounds())}`);
    }
  };

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logStartup(`did-fail-load: code ${errorCode}, desc: ${errorDescription}, url: ${validatedURL}`);
  });

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    logStartup(`[Renderer Console][lvl ${level}] ${message} (${sourceId}:${line})`);
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    logStartup(`render-process-gone: reason=${details.reason}, exitCode=${details.exitCode}`);
  });

  win.once('ready-to-show', () => {
    logStartup('Event: ready-to-show');
    bringToFront();
    broadcastWindowState(win);

    if (IS_SMOKE_TEST) {
      setTimeout(() => {
        performCompleteShutdown();
        app.exit(0);
      }, 1800);
    }
  });

  win.webContents.on('did-finish-load', () => {
    logStartup('Event: did-finish-load');
    bringToFront();
  });

  // Safety fallback: ensure window is brought to front within 1.2s if ready-to-show is delayed
  setTimeout(() => {
    if (!win.isDestroyed() && (!win.isVisible() || !win.isFocused())) {
      logStartup('Executing safety fallback bringToFront...');
      bringToFront();
    }
  }, 1200);

  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL);
  } else {
    const indexHtmlPath = (() => {
      const candidates = [
        path.join(__dirname, '../../dist/index.html'),
        path.join(__dirname, '../dist/index.html'),
        path.join(app.getAppPath(), 'dist/index.html'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return c;
      }
      return path.join(__dirname, '../../dist/index.html');
    })();
    void win.loadFile(indexHtmlPath);
  }

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  return win;
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

function getAssetMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.ico':
      return 'image/x-icon';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

app.whenReady().then(() => {
  configureSecurityPolicies();

  const userDataDir = app.getPath('userData');
  const artworkCacheService = new ArtworkCacheService(userDataDir);

  // Register maswitch-asset:// streaming handler
  protocol.handle('maswitch-asset', (request) => {
    try {
      const parsedUrl = new URL(request.url);
      const category = parsedUrl.hostname; // 'artwork' or 'icon'
      const rawFilename = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
      const filename = path.basename(rawFilename);

      if (!filename || filename === '.' || filename === '..') {
        return new Response('Bad Request', { status: 400 });
      }

      const primaryDir =
        category === 'icon'
          ? artworkCacheService.getIconDir()
          : artworkCacheService.getArtworkDir();

      let targetFile = path.resolve(primaryDir, filename);

      // Boundary check to prevent path traversal
      if (!targetFile.startsWith(path.resolve(primaryDir))) {
        return new Response('Access Denied', { status: 403 });
      }

      // Check primary directory, fallback to alternate if not found
      if (!fs.existsSync(targetFile)) {
        const alternateDir =
          category === 'icon'
            ? artworkCacheService.getArtworkDir()
            : artworkCacheService.getIconDir();
        const altFile = path.resolve(alternateDir, filename);
        if (altFile.startsWith(path.resolve(alternateDir)) && fs.existsSync(altFile)) {
          targetFile = altFile;
        } else {
          return new Response('Not Found', { status: 404 });
        }
      }

      const mimeType = getAssetMimeType(targetFile);
      const stream = Readable.toWeb(fs.createReadStream(targetFile));

      return new Response(stream as import('stream/web').ReadableStream, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch {
      return new Response('Server Error', { status: 500 });
    }
  });

  const settingsStore = new ElectronSettingsStore(userDataDir);
  const currentSettings = settingsStore.load();

  const dbPath = path.join(userDataDir, 'maswitch-library.sqlite');
  const sqliteDb = new MaSwitchSqliteDatabase(dbPath);
  sqliteDatabase = sqliteDb;

  // Sync existing favorites from settings store into SQLite user_favorites table
  sqliteDb.syncInitialFavorites(currentSettings.favoriteGameIds);

  const steamGridDbSecretStore = new SteamGridDbSecretStore(userDataDir);
  const steamGridDbClient = new SteamGridDbClient(steamGridDbSecretStore);
  const steamGridDbService = new SteamGridDbArtworkService(
    steamGridDbClient,
    sqliteDb,
    artworkCacheService.getArtworkDir(),
    (progress) => {
      broadcastToRenderer(IPC_CHANNELS.STEAMGRIDDB_SYNC_PROGRESS_EVENT, progress);
    }
  );

  const scannerEngine = new GameScannerEngine();
  const startupService = new MaSwitchStartupService(settingsStore);

  const launcherEngine = new GameLauncherEngine({
    openExternalProtocol: async (uri: string) => {
      const allowedPrefixes = [
        'steam://rungameid/',
        'com.epicgames.launcher://apps/',
        'origin2://game/launch',
        'uplay://launch/',
        'goggalaxy://openGameView/',
        'rockstar://run/',
      ];
      const isAllowed = allowedPrefixes.some((prefix) => uri.startsWith(prefix));
      if (!isAllowed) {
        throw new Error(`Unsupported or untrusted launch protocol URI: ${uri}`);
      }
      await shell.openExternal(uri);
    },
    onStatusChanged: (payload) => {
      broadcastToRenderer(IPC_CHANNELS.LAUNCHER_STATUS_CHANGED_EVENT, payload);
    },
    onGameLaunchedForTracking: ({ game, executablePath }) => {
      playtimeTracker?.notifyGameLaunchedFromMaSwitch({
        gameId: game.id,
        executableName: path.basename(executablePath),
      });
    },
    isEpicLauncherInstalled: () => isEpicGamesLauncherInstalled(),
    epicManifestResolver: (game) =>
      detectEpicGameFromManifests({
        executablePath: game.executablePath,
        installPath: game.installPath,
        title: game.title,
      }),
    processChecker: async (candidates: string[]) => {
      const processes = await listWindowsProcessImageNames();
      const set = new Set(candidates.map((c) => c.toLowerCase()));
      return processes.some((p) => set.has(p.imageNameLower));
    },
    verificationTimeoutMs: 12_000,
    verificationPollIntervalMs: 500,
  });

  const trackerEngine = new PlaytimeTrackerEngine(sqliteDb, {
    pollIntervalMs: 5000,
    inGamePollIntervalMs: 15000,
    lowEndPollIntervalMs: 15000,
    gracePolls: 2,
    onSessionUpdated: () => {
      broadcastToRenderer(IPC_CHANNELS.TRACKER_SESSION_UPDATED_EVENT);
      broadcastToRenderer(IPC_CHANNELS.LIBRARY_UPDATED_EVENT);
    },
    onGameRunningStateChanged: (gameId, isRunning) => {
      launcherEngine.setGameStatus(
        gameId,
        isRunning ? 'running' : 'idle',
        isRunning ? 'Active gameplay session detected' : 'Session ended'
      );
    },
    onGameModeChanged: (inGame, activeGameCount) => {
      broadcastToRenderer(IPC_CHANNELS.TRACKER_GAME_MODE_CHANGED, {
        inGame,
        activeGameCount,
      });
    },
  });
  playtimeTracker = trackerEngine;
  trackerEngine.setEnabled(currentSettings.playtimeTrackingEnabled);
  trackerEngine.setLowEndMode(Boolean(currentSettings.lowEndPcMode));
  trackerEngine.setGameAwareMode(
    currentSettings.gameAwarePerformanceMode !== false
  );
  if (currentSettings.excludedApplications) {
    trackerEngine.setExcludedApplications(currentSettings.excludedApplications);
  }
  trackerEngine.start();

  // Hook Windows power suspend/resume events for accurate playtime calculation
  powerMonitor.on('suspend', () => {
    trackerEngine.handleSystemSuspend();
  });
  powerMonitor.on('resume', () => {
    trackerEngine.handleSystemResume();
  });

  const iconPath = (() => {
    const candidates = [
      path.join(__dirname, '../../build/icon.ico'),
      path.join(__dirname, '../build/icon.ico'),
      path.join(process.resourcesPath, 'build/icon.ico'),
      path.join(app.getAppPath(), 'build/icon.ico'),
      path.join(__dirname, '../../build/icon.png'),
      path.join(app.getAppPath(), 'build/icon.png'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return path.join(__dirname, '../../build/icon.ico');
  })();

  const triggerBackgroundScan = async () => {
    if (scannerEngine.isScanning()) {
      return;
    }
    const latestSettings = settingsStore.load();
    try {
      const { summary } = await scannerEngine.runScan(
        {
          customFolders: latestSettings.customScanFolders,
          includeRegistry: latestSettings.includeRegistryApps,
          onProgress: (progress) => {
            broadcastToRenderer(IPC_CHANNELS.SCANNER_PROGRESS_EVENT, progress);
          },
        },
        async (discovered) => {
          // Asynchronously enrich discovered candidates with executable icons if available
          for (const item of discovered) {
            if (item.executablePath && !item.iconImage) {
              const gameKey = `${item.platformId}-${item.externalAppId ?? path.basename(item.executablePath)}`;
              try {
                const iconUri = await artworkCacheService.extractExeIcon(
                  item.executablePath,
                  gameKey
                );
                if (iconUri) {
                  item.iconImage = iconUri;
                }
              } catch {
                // ignore
              }
            }
          }
          return sqliteDb.upsertDiscoveredGames(discovered);
        }
      );
      sqliteDb.recordScanHistory(summary);
      broadcastToRenderer(IPC_CHANNELS.LIBRARY_UPDATED_EVENT);

      // Non-blocking background SteamGridDB artwork sync if configured
      if (steamGridDbClient.isConfigured()) {
        void steamGridDbService.syncMissingLibraryArtwork().then(() => {
          broadcastToRenderer(IPC_CHANNELS.LIBRARY_UPDATED_EVENT);
        });
      }
    } catch {
      // Ignore background scan contention
    }
  };

  const showAppWindow = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  };

  trayService = new MaSwitchTrayService(iconPath, {
    onOpenWindow: showAppWindow,
    onOpenSettings: () => {
      showAppWindow();
      broadcastToRenderer('maswitch:navigate:section', 'settings');
    },
    onOpenFavorites: () => {
      showAppWindow();
      broadcastToRenderer('maswitch:navigate:section', 'library');
      broadcastToRenderer('maswitch:filter:favorites', true);
    },
    onToggleLowEndMode: () => {
      const current = settingsStore.load();
      const next = !current.lowEndPcMode;
      const updated = settingsStore.save({ lowEndPcMode: next });
      trackerEngine.setLowEndMode(next);
      trayService?.refreshMenu();
      broadcastToRenderer(IPC_CHANNELS.SETTINGS_SAVE, updated);
    },
    isLowEndMode: () => Boolean(settingsStore.load().lowEndPcMode),
    onRescanGames: () => {
      void triggerBackgroundScan();
    },
    onTogglePauseTracking: () => {
      const cur = trackerEngine.getStatus();
      trackerEngine.setPaused(!cur.paused);
      trayService?.refreshMenu();
      broadcastToRenderer(IPC_CHANNELS.TRACKER_SESSION_UPDATED_EVENT);
    },
    onExitApplication: () => {
      performCompleteShutdown();
    },
    isTrackingPaused: () => trackerEngine.getStatus().paused,
  });
  trayService.initialize();

  const accountSwitcherService = new AccountSwitcherService(
    sqliteDb,
    createWindowsAccountLauncherAdapter((shortcut) => shell.readShortcutLink(shortcut).target,
      path.join(userDataDir, 'steam-selection-backup.json'))
  );

  const riotCredentialVault = new RiotCredentialVault(path.join(userDataDir, 'vault', 'riot_credentials'));
  const riotLiveServices = createProductionRiotLiveSwitchingEngine({
    userDataDir,
    riotLiveSwitchingEnabled: currentSettings.riotLiveSwitchingEnabled ?? false,
  });
  const riotDesktopLoginAutomation = new RiotDesktopLoginAutomationService(
    riotCredentialVault,
    riotLiveServices?.processCoordinator
  );

  const installedFeaturesManager = new InstalledFeaturesManager();

  registerIpcHandlers(
    () => mainWindow,
    {
      settingsStore,
      sqliteDb,
      scannerEngine,
      launcherEngine,
      trackerEngine,
      startupService,
      artworkService: artworkCacheService,
      steamGridDbSecretStore,
      steamGridDbClient,
      steamGridDbService,
      accountSwitcherService,
      riotLiveServices,
      riotCredentialVault,
      riotDesktopLoginAutomation,
      installedFeaturesManager,
      onRequestWindowClose: () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          return;
        }
        const s = settingsStore.load();
        if (s.closeBehavior === 'minimize-to-tray') {
          mainWindow.hide();
        } else {
          performCompleteShutdown();
        }
      },
      onTrayStateUpdate: () => {
        trayService?.refreshMenu();
      },
    },
    DEV_SERVER_URL
  );

  mainWindow = createMainWindow(settingsStore, iconPath);

  if (currentSettings.autoScanOnStartup) {
    setTimeout(() => {
      void triggerBackgroundScan();
    }, 600);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow(settingsStore, iconPath);
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', (_e) => {
  logStartup(`app event 'before-quit': isExplicitQuit was ${isExplicitQuit}`);
  isExplicitQuit = true;
  if (playtimeTracker) {
    playtimeTracker.stop();
  }
  if (trayService) {
    trayService.destroy();
  }
  if (sqliteDatabase) {
    sqliteDatabase.close();
  }
});

app.on('will-quit', () => {
  logStartup("app event 'will-quit'");
});

app.on('quit', (_e, exitCode) => {
  logStartup(`app event 'quit' with exitCode ${exitCode}`);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isExplicitQuit) {
    app.quit();
  }
});
