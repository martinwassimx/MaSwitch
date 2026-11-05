# Changelog

All notable changes to **MaSwitch** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-11-06 — First Official Public Release (MaSwitch 3.0)

### Added
- **Redesigned Riot Games Account Manager**:
  - Modern multi-column responsive card grid with region badges (`EUW`, `NA`, `KR`, `EUNE`, etc.), preferred account indicators, and instant client-side search, credential filter, and sorting.
  - Dedicated Windows DPAPI (`CryptProtectData` / Electron `safeStorage`) credential vault for Riot Games accounts.
  - Automated Riot Client desktop login via Windows UI Automation (`System.Windows.Automation`) with automatic login-window readiness detection, silent first-attempt retries, configurable auto-submit (`Auto-Press Login Button`), and full MFA/CAPTCHA support.
  - Clear **Coming Soon** states for non-Riot account management platforms (`Steam`, `Epic Games`, `EA App`, `Ubisoft Connect`, `GOG Galaxy`, `Rockstar Games`, `Discord`) while preserving all existing database records safely.
- **Unified Multi-Platform Game Library**:
  - Automatic detection of installed games across Steam (`libraryfolders.vdf` & `appmanifest_*.acf`), Epic Games Launcher (`*.item` manifests), EA App (`__Installer/installerdata.xml`), Ubisoft Connect, GOG Galaxy, Riot Games, Rockstar Games Launcher, and Custom PC directories.
  - Official protocol launching for Steam (`steam://rungameid/<id>`) and Epic Games (`com.epicgames.launcher://apps/<AppName>?action=launch&silent=true`), including automatic Fortnite Epic Games Launcher routing and multi-state lifecycle tracking (`Starting` → `Running` → `Play`).
  - Optional SteamGridDB artwork integration (`grids`, `heroes`, `logos`, `icons`) with local disk caching.
- **Accurate Playtime Tracking & Application Exclusions**:
  - Lightweight background playtime tracking with Windows Sleep/Resume (`powerMonitor`) handling and crash-recovery session reconciliation.
  - Built-in exclusion list (`Wallpaper Engine` `wallpaper64.exe`/`wallpaper32.exe`, game launchers, system utilities) plus user-configurable process exclusions.
- **Modular Windows NSIS Installer**:
  - Four installation presets (**Minimal**, **Recommended**, **Complete**, **Custom**) and six genuinely optional modules controlled via `installed-features.json`:
    1. **Gaming Year in Review**
    2. **Smart Game Collections**
    3. **Lightweight Performance Monitor**
    4. **Game Updates & News**
    5. **Backup & Restore**
    6. **Memory Management**
- **Optional Memory Management (Mem Reduct Integration)**:
  - Genuine Windows NT memory list cleaning (`EmptyWorkingSet`, `SetSystemFileCacheSize`, and `NtSetSystemInformation` with `SystemMemoryListInformation` for working sets, priority-0 standby list, standby list, and modified page list).
  - Never closes or terminates user applications.
  - Automatically locked while any game is running to prevent FPS drops or anti-cheat conflicts.
- **Low-End PC & Game-Aware Performance Optimizations**:
  - Game-Aware Performance Mode automatically pauses non-essential UI timers while a game is running.
  - Low-End PC Mode disables decorative transitions and minimizes RAM/GPU footprint.

