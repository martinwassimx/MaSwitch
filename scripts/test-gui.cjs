const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const { MaSwitchSqliteDatabase } = require(path.join(__dirname, '../dist-electron/electron/services/database/sqliteDatabase.js'));
const { GameScannerEngine } = require(path.join(__dirname, '../dist-electron/electron/services/scanner/gameScannerEngine.js'));
const { ElectronSettingsStore } = require(path.join(__dirname, '../dist-electron/electron/services/settingsStore.js'));
const { registerIpcHandlers } = require(path.join(__dirname, '../dist-electron/electron/ipc/handlers.js'));
const { GameLauncherEngine } = require(path.join(__dirname, '../dist-electron/electron/services/launcher/gameLauncherEngine.js'));
const { PlaytimeTrackerEngine } = require(path.join(__dirname, '../dist-electron/electron/services/tracker/playtimeTrackerEngine.js'));
const { MaSwitchStartupService } = require(path.join(__dirname, '../dist-electron/electron/services/startupService.js'));
const { ArtworkCacheService } = require(path.join(__dirname, '../dist-electron/electron/services/artwork/artworkCacheService.js'));

app.whenReady().then(async () => {
  console.log('[Test] Electron app ready');
  const userDataDir = app.getPath('userData');
  const settingsStore = new ElectronSettingsStore(userDataDir);
  const sqliteDb = new MaSwitchSqliteDatabase(':memory:');
  const scannerEngine = new GameScannerEngine();
  const launcherEngine = new GameLauncherEngine();
  const trackerEngine = new PlaytimeTrackerEngine(sqliteDb);
  const startupService = new MaSwitchStartupService(settingsStore);
  const artworkService = new ArtworkCacheService(userDataDir);

  let win = null;

  registerIpcHandlers(
    () => win,
    {
      settingsStore,
      sqliteDb,
      scannerEngine,
      launcherEngine,
      trackerEngine,
      startupService,
      artworkService,
      onRequestWindowClose: () => { },
    }
  );

  const preloadPath = path.join(__dirname, '../dist-electron/electron/preload.js');
  console.log('[Test] Using preload path:', preloadPath);

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log('[Renderer Console]', message, `(at ${sourceId}:${line})`);
  });

  win.webContents.on('preload-error', (event, pPath, error) => {
    console.error('[Preload Error in ' + pPath + ']:', error);
  });

  const indexHtml = path.join(__dirname, '../dist/index.html');
  console.log('[Test] Loading index HTML:', indexHtml);
  await win.loadFile(indexHtml);

  // Check if window.maswitch is defined in renderer!
  const bridgeCheck = await win.webContents.executeJavaScript(`
    ({
      hasMaswitch: typeof window.maswitch !== 'undefined',
      keys: typeof window.maswitch !== 'undefined' ? Object.keys(window.maswitch) : [],
      hasScanner: typeof window.maswitch?.scanner !== 'undefined',
      hasStartScan: typeof window.maswitch?.scanner?.startScan === 'function'
    })
  `);
  console.log('[Test] Bridge check in renderer:', JSON.stringify(bridgeCheck, null, 2));

  // Now trigger scan from renderer via executeJavaScript!
  console.log('[Test] Triggering scan from renderer via window.maswitch.scanner.startScan()...');
  try {
    const scanResult = await win.webContents.executeJavaScript(`
      window.maswitch.scanner.startScan()
    `);
    console.log('[Test] Scan result returned to renderer:', JSON.stringify({
      totalFound: scanResult?.totalFound,
      status: scanResult?.status,
      addedOrUpdatedCount: scanResult?.addedOrUpdatedCount,
      diagnosticsFound: Boolean(scanResult?.diagnostics)
    }, null, 2));
  } catch (err) {
    console.error('[Test] Error invoking scan from renderer:', err);
  }

  // Check SQLite database in main process
  const dbGames = sqliteDb.getAllLibraryGames();
  console.log('[Test] Games in SQLite database after renderer scan:', dbGames.length);

  app.quit();
});