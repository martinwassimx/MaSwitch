# MaSwitch — Windows Gaming Launcher & Multi-Account Manager

> Developed by **Martin Wassim** · [martinx.work](https://martinx.work)

**Phase 2: Real Windows Gaming Engine (`v0.2.0`)**

MaSwitch is a standalone Windows 10 and Windows 11 desktop gaming launcher and multi-account manager built with **Electron**, **React**, **TypeScript**, **Vite**, **Tailwind CSS**, **Motion for React**, **Zustand**, **Lucide React**, and **SQLite (`node-sqlite3-wasm`)**.

---

## 1. Key Capabilities in Phase 2 (`v0.2.0`)

### 1.1 Real Installed-Game Scanner (`electron/services/scanner/`)
- **Steam Detection (`steamScanner.ts` & `vdfParser.ts`)**:
  - Resolves Steam installation paths via Windows Registry (`HKCU\Software\Valve\Steam\SteamPath`, `HKLM\SOFTWARE\WOW6432Node\Valve\Steam\InstallPath`) and known paths.
  - Parses `libraryfolders.vdf` across multiple drives and all `appmanifest_*.acf` manifests inside each `steamapps` folder.
  - Excludes non-game redistributables (`Steamworks Common Redistributables`, `Proton`, `SteamVR`) and discovers the primary game executable inside `steamapps/common/<installdir>`.
- **Epic Games Detection (`epicScanner.ts`)**:
  - Reads local JSON manifests (`*.item`) from `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\`.
  - Extracts `AppName`, `DisplayName`, `InstallLocation`, `LaunchExecutable`, `LaunchCommand`, `InstallSize`, and `AppVersionString` without accessing any Epic authentication tokens.
- **Additional Platform Adapters (`platformAdapters.ts`)**:
  - **GOG Galaxy**: Reads `HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\*` registry entries (`gameID`, `gameName`, `path`, `exe`, `workingDir`).
  - **Ubisoft Connect**: Reads `HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs\*` registry entries (`InstallDir`) and resolves local binaries.
  - **Riot Games**: Reads `C:\ProgramData\Riot Games\RiotClientInstalls.json` and `Metadata\*.live.settings.yaml`.
  - **EA App & Rockstar Games Launcher (Documented Limitations)**: Local catalog state is stored inside proprietary encrypted caches (`IS` / `.dat`); MaSwitch explicitly reports `unsupported` for proprietary cache parsing while scanning their standard Windows Uninstall Registry keys and installation directories.
- **General Windows & Custom Folder Scanner (`generalWindowsScanner.ts`)**:
  - Scans Windows Uninstall Registry keys and user-selected custom game directories (`settings.customScanDirectories`).
  - Applies a deterministic **Game Confidence & Classification System (`0–100`)** (`verified-game`, `probable-game`, `custom-app`, `non-game`, `unknown`) using publisher signatures, installation directory heuristics, and game engine DLL signatures (`UnityPlayer.dll`, `steam_api64.dll`, `EOSSDK-Win64-Shipping.dll`, etc.) so system utilities, drivers, and browsers are never misclassified as games.
- **Safe Scanner Execution (`gameScannerEngine.ts`)**:
  - Supports automatic scan on startup, manual rescan, live IPC progress events, cancellation (`AbortSignal`), multi-source deduplication, symlink loop protection, and strictly read-only filesystem operations.

### 1.2 Local SQLite Database (`electron/services/database/sqliteDatabase.ts`)
- Stored locally at `%APPDATA%\maswitch\maswitch-library.sqlite` (inside Electron's `userData` directory).
- **Normalized Schema (`Schema Version 1`)**:
  - `schema_migrations`: Versioned migration tracking.
  - `platforms`: Supported platform definitions (`steam`, `epic`, `gog`, `ubisoft`, `riot`, `ea`, `rockstar`, `custom`, `windows`).
  - `games`: Core game titles, normalized titles, developers, publishers, genres, release years, and cover/hero artwork metadata.
  - `game_installations`: Local installation paths, executable paths, launch arguments, launch methods, confidence scores, and classifications (`UNIQUE(platform_id, external_app_id)`).
  - `library_ownership`: Local ownership & detection state.
  - `user_favorites`: Persisted favorite game IDs (automatically migrated from Phase 1 `settings.json`).
  - `custom_applications`: User-added custom games and applications.
  - `playtime_sessions`: Individual tracked sessions (`started_at`, `ended_at`, `duration_seconds`, `status`, `exit_reason`, `process_name`, `pid`).
  - `game_metadata_cache`: Local metadata cache.
  - `scanner_history`: Audit log of completed and cancelled scans.
- **Corruption Recovery**: Automatically verifies the SQLite 16-byte header and `PRAGMA integrity_check` on startup. If a database file is corrupted, MaSwitch renames it to `maswitch-library.sqlite.corrupted-<timestamp>.bak` without deleting user data and initializes a clean database.

### 1.3 Functional Game Launcher (`electron/services/launcher/gameLauncherEngine.ts`)
- **Steam Protocol**: Launches via validated `steam://rungameid/<numericAppId>` (`shell.openExternal`) or falls back to direct executable launch.
- **Epic Games Protocol**: Launches via validated `com.epicgames.launcher://apps/<AppName>?action=launch&silent=true` or direct executable fallback.
- **Direct & Custom Executables**: Uses `child_process.spawn(exePath, argsArray, { cwd, detached: true, stdio: 'ignore', shell: false })`.
- **Strict Security**: Rejects shell metacharacters and null-byte injection, never uses `shell: true` or command string concatenation, and verifies executable files exist on disk with `.exe` extensions before spawning.

### 1.4 Background Playtime Tracker (`electron/services/tracker/playtimeTrackerEngine.ts`)
- Polls active Windows processes via `tasklist.exe /FO CSV /NH` (`shell: false`) every 5 seconds.
- Matches running executable names against installed games in SQLite while **excluding launcher idle processes** (`steam.exe`, `steamwebhelper.exe`, `epicgameslauncher.exe`, `galaxyclient.exe`, `upc.exe`, `eadktop.exe`, `riotclientservices.exe`, `launcher.exe`).
- Records session start time, end time, elapsed seconds, `lastPlayedAt`, and cumulative `totalPlaytimeMinutes` in SQLite.
- Handles **Windows Sleep/Suspend (`powerMonitor`)** by pausing active sessions on `suspend` / `lock-screen` and starting fresh intervals on `resume`.
- Handles **Crash/Restart Recovery** on startup (`recoverUnclosedSessionsOnStartup`) so orphaned sessions from unexpected shutdowns are safely closed.
- Continues tracking while MaSwitch is minimized to the Windows System Tray, and cleanly closes active sessions when MaSwitch exits completely.

### 1.5 Windows System Tray & Startup Integration (`trayService.ts` & `startupService.ts`)
- **System Tray**: Native Windows notification tray icon and context menu (`Open MaSwitch`, `Rescan Installed Games`, `Pause/Resume Playtime Tracking`, `Exit MaSwitch Completely`).
- **Close-to-Tray vs Full Exit**: Configurable in **Settings → Startup & System Tray** (`Minimize to System Tray` or `Exit Application Completely`).
- **Launch at Windows Startup**: Uses Electron's `app.getLoginItemSettings` / `app.setLoginItemSettings` with `--hidden` support when `Start Minimized to Tray` is enabled.

---

## 2. Electron Security Architecture

MaSwitch enforces strict Electron desktop security practices:
- `contextIsolation: true`
- `nodeIntegration: false` (including workers and subframes)
- `sandbox: true`
- Strict Content Security Policy (`script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`)
- Frozen `contextBridge` API (`window.maswitch`) exposing only explicitly approved IPC channels
- Main-process IPC sender verification (`assertTrustedSender` & `isTrustedRendererUrl`) and strict payload validation
- Zero shell interpolation (`shell: false` for all process execution)
- **Zero-Credential Guarantee**: MaSwitch never collects or stores platform passwords, cookies, or authentication tokens.

---

## 3. Setup, Development & Build Commands

### Install Dependencies
```powershell
npm install
```

### Run in Development Mode (Vite HMR + Electron Desktop Window)
```powershell
npm run dev
```

### Quality & Validation Checks
```powershell
# TypeScript validation (Renderer + Electron Main/Preload)
npm run typecheck

# ESLint code quality checks
npm run lint

# Automated unit & integration tests (Vitest)
npm run test
```

### Production Build & Packaging (`electron-builder`)
```powershell
# Compile Renderer (dist/) and Electron Main/Preload (dist-electron/)
npm run build

# Build Windows NSIS Setup Installer (.exe), Portable (.exe), and win-unpacked directory
npm run dist:win

# Headless smoke verification of packaged executable
.\release\win-unpacked\MaSwitch.exe --smoke-test
```

Generated Windows deliverables in `release/`:
- `release/win-unpacked/MaSwitch.exe` — Standalone unpacked Windows executable
- `release/MaSwitch-Setup-0.2.0.exe` — Windows NSIS installer
- `release/MaSwitch-Portable-0.2.0.exe` — Standalone portable Windows executable

---

## Author & Developer

- **Developer**: Martin Wassim
- **Website**: [martinx.work](https://martinx.work)
- **License**: MIT

