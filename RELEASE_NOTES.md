# MaSwitch v1.0.3 — Premium Lightweight Game News Hub

## About MaSwitch

**MaSwitch** is a lightweight Windows gaming launcher and account manager designed to organize games, manage supported gaming accounts, and provide useful gaming utilities.

---

## What's New in `v1.0.3`

- **Premium Game News Hub Redesign (`src/pages/NewsPage.tsx`)**:
  - **Featured News Hero Card (`news-featured-card`)**: Prominent split hero card at the top of the feed showcasing the latest article with high-visibility game artwork (`h-44 sm:h-48 lg:h-[196px]`), `Featured` pill, platform badge, publication timestamp, headline, clean summary, source attribution, and a primary **Read Article** action.
  - **Responsive Multi-Column News Feed Grid (`news-feed-grid`)**:
    - Adapts cleanly across all desktop resolutions: **1 column** on narrow viewports (`< 768px`), **2 columns** by default on standard desktop screens (`1024×768`, `1280×720`, `1366×768`), and **3 columns** on widescreen displays (`1920×1080` / `2xl:grid-cols-3`).
    - Balanced article cards (`news-card-<id>`) with fixed `h-36 sm:h-40` media headers (`CLS = 0`), bottom gradient overlays, game & platform badges, relative date indicators, 2-line clamped headlines, 2-line clamped summaries, and clean source + external-link footers.
  - **Smart Artwork Resolution & Icon Fallback**:
    - Prioritizes widescreen article banners (`articleImageUrl`) and library hero backdrops (`heroBackgroundImage`) over portrait covers, while automatically detecting small `.ico` / executable icons so they render centered at `56×56` (`object-contain`) over a subtle radial backdrop instead of being stretched or pixelated.
  - **Compact Header & Unified Filter Bar**:
    - Streamlined header with live `Updated HH:MM` timestamp, collapsible **Sources** coverage pill (`Available` / `No News` / `Unsupported`), and **Refresh Feed** button.
    - Single-row filter bar with instant keyword search (`news-search-input`), game filter (`news-game-filter`), platform filter (`news-platform-filter`), sort mode (`news-sort-filter`: **Newest First**, **Recent Updates**, **By Game**), and one-click **Clear** (`news-clear-filters-btn`).
- **Low-End PC Performance Engineering (Zero Unnecessary Overhead)**:
  - **Lazy-Loaded Card Media**: Added native `loading="lazy"` and `decoding="async"` to 100% of grid card images (`12/12` initial grid cards), keeping offscreen image decoding off the main thread.
  - **Memoized Card Subtrees**: Isolated `FeaturedNewsCard` and `NewsFeedCard` with `React.memo` and memoized filter/sort pipelines (`useMemo`) so typing or toggling filters avoids unnecessary card re-renders.
  - **Zero Continuous GPU/CPU Effects**: No `backdrop-filter: blur()` on cards, no continuous background animations, no scroll listeners, and full `motion-reduce:transition-none` support—reducing renderer JS heap usage by **15.1%** (`5.43 MB` → `4.61 MB`) and maintaining **0% idle CPU**.

---

## Main Features

- **Unified Game Library**: Automatic detection and organization of installed PC games across Steam, Epic Games, EA App, Ubisoft Connect, GOG Galaxy, Riot Games, Rockstar Games Launcher, and Custom PC folders.
- **Riot Games Account Management**: Multi-account profile cards with region badges, preferred account selection, instant search, credential status filters, and sorting.
- **Automatic Riot Login**: Launches or focuses the official Riot Client, detects login window readiness with automatic retries, and fills credentials via Windows UI Automation (`System.Windows.Automation`) with optional auto-submit and native MFA/CAPTCHA support.
- **Encrypted Credential Storage**: Protects Riot Games credentials locally using the Windows Data Protection API (**Windows DPAPI** / `CryptProtectData`).
- **Multi-Platform Game News**: Personalized official game news and community announcements across Riot Games, Epic Games, EA Sports, and Steam Community Announcements.
- **Game Launching**: Official protocol launching (`steam://` and `com.epicgames.launcher://`, including Fortnite Epic Games Launcher routing) and validated direct executable launching.
- **Game Playtime Tracking**: Real-time session tracking (`Starting` → `Running` → `Completed`) with Windows Sleep/Resume support and crash recovery.
- **Game Tracking Exclusions**: Built-in exclusions for **Wallpaper Engine** (`wallpaper64.exe`, `wallpaper32.exe`) and idle launchers, plus custom user exclusions.
- **Optional Memory Management**: Windows NT memory list cleaning (`Working Sets`, `System File Cache`, `Standby List`, `Modified Page List`) inspired by [Mem Reduct](https://github.com/henrypp/memreduct)—never closes user applications and automatically locks while a game is running.
- **Modular Windows Installer**: Choose **Minimal**, **Recommended**, **Complete**, or **Custom** presets during setup to install only the features you want.

---

## Coming Soon

Account management is currently active exclusively for **Riot Games**. Multi-account management for the following platforms is marked **Coming Soon** in the Accounts tab (while their game library discovery, launching, game news, and playtime tracking remain fully active):
- Steam account management
- Epic Games account management
- EA account management
- Ubisoft account management
- GOG account management
- Rockstar account management
- Other supported platforms

---

## Installation

1. Download **`MaSwitch-Setup-1.0.3.exe`** from the **Assets** section below.
2. Run the installer.
3. Select **Minimal**, **Recommended**, **Complete**, or **Custom**.
4. Complete installation.
5. Launch **MaSwitch**.

---

## Security & Verification

- **Local Windows DPAPI Encryption**: Credentials are stored locally using Windows DPAPI bound to your Windows user account. MaSwitch never stores plaintext passwords in SQLite or logs.
- **Official Riot Client**: Riot login automation interacts exclusively with the official Riot Client window via Windows UI Automation.
- **No Cloud Account Required**: All data stays locally on your PC in `%APPDATA%\maswitch`.
- **SmartScreen Notice**: Because this installer is currently unsigned (built without a commercial EV/OV Authenticode certificate), Windows Defender SmartScreen or your browser may display an *"Unknown Publisher"* reputation prompt. Do not disable Windows Defender or antivirus protection; you can verify the installer's integrity using its SHA-256 checksum below.

### SHA-256 Checksums (`SHA256SUMS.txt`)

| Asset | Size | SHA-256 Checksum |
| :--- | :--- | :--- |
| `MaSwitch-Setup-1.0.3.exe` | `82.44 MB` (`86,444,713 bytes`) | `714f194747b9b6b9b545765d70edaa6dcef65609584c5be87ac247d68656ea93` |
| `win-unpacked/MaSwitch.exe` | `180.08 MB` (`188,827,136 bytes`) | `fe17809f2433f2712a0bc81118f0c5abe9f23d30998eb7c76236bc4254785c6b` |

Verify in PowerShell:
```powershell
Get-FileHash -Algorithm SHA256 .\MaSwitch-Setup-1.0.3.exe
```
