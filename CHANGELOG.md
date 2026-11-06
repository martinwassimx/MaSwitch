# Changelog

All notable changes to **MaSwitch** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.3] - 2026-11-06 — Premium Game News UI/UX Redesign (Zero Performance Overhead)

### Changed
- **Featured News Hero Card (`FeaturedNewsCard`)**:
  - Added a prominent top **Featured News** split card highlighting the latest real article from the user's library with widescreen artwork, game & platform attribution, publication date, headline, summary, source label, and a **Read Article** action.
- **Responsive Multi-Column News Card Grid (`NewsFeedCard`)**:
  - Replaced full-width stacked article rows with a responsive CSS Grid: **1 column** on narrow windows, **2 columns** by default on standard desktop screens (`1024×768`, `1280×720`, `1366×768`), and **3 columns** on wide displays (`1920×1080`).
  - Standardized card header heights (`h-36 sm:h-40`) with widescreen banner resolution (`articleImageUrl` / `heroBackgroundImage` / `coverImage`) and centered icon containment so small `.ico` icons are never stretched.
- **Compact Header & Unified Filter Toolbar**:
  - Consolidated **Search**, **Game Filter**, **Platform Filter**, **Sort Selector** (`Newest First`, `Recent Updates`, `By Game`), and **Clear** into a single compact toolbar.
- **Low-End PC Performance Optimizations**:
  - Added `React.memo` card isolation, `loading="lazy"` + `decoding="async"` on all grid images, and `motion-reduce:transition-none` support, reducing page DOM nodes to `355` and JS Heap usage to `4.61 MB` (`0%` idle CPU).

---

## [1.0.2] - 2026-11-06 — Multi-Platform Game News, Provider Coverage & Feed Reliability

### Added
- **Multi-Platform Game News Provider Architecture**:
  - **Riot Games Official Provider**: Live patch notes, game updates, dev blogs, and announcements for **League of Legends**, **VALORANT**, **Teamfight Tactics**, and **Legends of Runeterra**.
  - **Epic Games Fortnite Provider**: Official Battle Royale news, seasonal updates, and MOTD announcements with automatic Epic Content API fallback.
  - **EA Sports Official Provider**: Official Pitch Notes, Title Updates, and developer notes for **EA SPORTS FC** (`FC 27`, `FC 26`, `FC 25`) with Steam Official News fallback.
  - **Cross-Platform Steam Community Announcements Resolver**: Resolves installed EA, Ubisoft, Rockstar, and Custom PC games (including `F1 25`, `It Takes Two`, `Forza Horizon 5`, `Marvel's Spider-Man: Miles Morales`, `R.E.P.O.`, `Schedule I`, `Rainbow Six Siege`, `Grand Theft Auto V`, `Red Dead Redemption 2`, and 60+ popular titles) to their official developer announcement feeds while filtering out non-English third-party syndication and generic store chart spam.
- **Library News Coverage & Provider Diagnostics**:
  - Added a collapsible **Library News Coverage** status bar and per-game diagnostic grid (`Available`, `No Articles`, `Unsupported`, `Temporarily Unavailable`, `Refresh Failed`).
  - Unsupported games clearly display `"No supported news source available for this game."` without substituting unrelated articles.

### Fixed
- **Wallpaper Engine Feed Domination**:
  - Fixed the issue where `NewsService` previously queried only `platformId === 'steam'` entries, causing **Wallpaper Engine** (`431960`) to dominate the entire feed. Background utilities are now automatically excluded from the default multi-game feed while remaining accessible when explicitly selected in the game filter.
- **Balanced Sorting, Search & Instant Filtering**:
  - Added **Newest First**, **Recent Updates**, and **By Game** sorting modes, **Recent** vs **Archive** date badges, a **Clear Filters** action, incremental **Load More Articles** pagination, and concurrent refresh deduplication that preserves cached articles and `lastUpdatedIso` when offline.

---

## [1.0.1] - 2026-11-06 — Riot Accounts UI/UX Polish & Layout Refinement

### Changed
- **Refined Riot Account Cards**:
  - Replaced the single cramped footer action row with a two-row action hierarchy: a full-width primary **Login** button above a balanced 2-column secondary row (**Set Up Credentials** and **Edit Account**).
  - Moved **Make Preferred** and **Delete Account** into the card's top-right compact overflow menu (`⋮`).
  - Streamlined status badges to show **Credentials Saved** or **Setup Required** alongside **Last Selected** and **Preferred** indicators.
- **Responsive Account Grid & Navigation**:
  - Balanced CSS Grid across `1920×1080`, `1366×768`, `1280×720`, and `1024×768` viewports so two accounts fill the desktop container symmetrically without wasted horizontal space.
  - Compacted platform navigation pills so all 8 platforms fit cleanly on one row at desktop widths and wrap without horizontal scrollbars on narrower screens.
- **Simplified Security Information**:
  - Removed the redundant top vault banner and consolidated security telemetry into a single visually secondary **Security Overview** section at the bottom of the page.

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

