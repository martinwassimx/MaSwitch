# MaSwitch v1.0.4 — Windows Auto-Updater, Scrolling Optimizations & Safe Releases

## About MaSwitch

**MaSwitch** is a lightweight Windows gaming launcher and account manager designed to organize games, manage supported gaming accounts, and provide useful gaming utilities.

---

## What's New in `v1.0.4`

### 1. Built-in Update Checker & Windows Auto-Updater (`AppUpdateService`)
- **Official GitHub Releases Integration**:
  - Automatically queries the official GitHub repository (`martinwassimx/MaSwitch/releases`) for new releases using semantic versioning (`semver.gt`).
  - Dual release channels: **Stable** (default, production releases) and **Beta** (opt-in pre-releases).
  - Background update scheduler with a 10-second startup delay, 24-hour throttling, and **gameplay-aware suppression** (never checks or downloads while a game is active).
  - Respects **Low-End PC Mode** by pausing background checks when resource-saving mode is enabled.
- **Cryptographic Payload Integrity & Secure HTTPS Streaming**:
  - Downloads are strictly restricted to trusted GitHub CDN domains (`github.com`, `api.github.com`, `objects.githubusercontent.com`, `*.githubusercontent.com`).
  - Downloads payload streams directly to temporary `.part` files with atomic swap upon completion.
  - Automatically downloads and parses `SHA256SUMS.txt` from the GitHub Release, calculates the local SHA-256 hash on the fly, and validates the file before permitting installation. Corrupt or tampered files are deleted immediately.
- **Safety Prechecks Before Installation**:
  - Non-destructive pre-installation checks strictly prevent update installation if any tracked game is running, if Riot desktop login automation is actively typing/authenticating, or if Mem Reduct memory cleanup is in progress.
- **User-Friendly Notifications & Controls**:
  - **Settings → Application Updates**: View current version (`1.0.4`), change update channels, trigger manual update checks, view live download progress bars, inspect release notes, and install updates with a single click.
  - **In-App Update Banner (`UpdateBanner`)**: Unobtrusive top banner alerting users when a new update is ready to install, with "View Details" and "Remind Me Later" actions.
  - **Sidebar Indicator**: Visual update badge on the Settings tab when a new version is detected.
  - **Update Available Dialog (`UpdateAvailableDialog`)**: Clean modal dialog displaying version comparison, changelog highlights, and download controls.
- **Modular Installer & User Data Preservation**:
  - Enhanced NSIS installer logic (`build/installer.nsh`) to automatically preserve existing component selections (`installed-features.json`) across silent/unattended updates without reverting to default presets.
  - Guarantees DPAPI credential vault (`vault.enc`), SQLite game database (`maswitch-library.sqlite`), and user preferences (`maswitch-settings.v1.json`) remain untouched across updates.

### 2. Smooth 60 FPS Scrolling & Low-End PC Performance Optimizations
- **Hardware GPU Compositing Restored (`electron/main.ts`)**:
  - Re-enabled Direct3D11 hardware acceleration and GPU rasterization by removing unconditional `disableHardwareAcceleration()`, while retaining an opt-in `--disable-gpu` / `MASWITCH_DISABLE_GPU=1` flag.
- **Automatic Local Artwork Thumbnailing & LRU Cache (`ArtworkCacheService`)**:
  - Upgraded custom protocol (`maswitch-asset://`) to generate and persist appropriately sized thumbnails (`artwork_thumbs/`) and an in-memory 24 MB LRU buffer cache.
  - Optimized bundled platform assets, reducing Home page decoded image footprint by **74.7%** (`34.73 MP` → `8.78 MP`).
  - Added native `decoding="async"` and `loading="lazy"` across all cards and images.
- **Eliminated Scroll-Time Compositor Stutter**:
  - Removed expensive CSS `backdrop-filter: blur(12px)` overlays and heavy drop shadows on game cards, replacing them with high-contrast GPU-friendly translucent surfaces (`bg-[#0d0f14]/90`) and viewport containment (`contain: content`), reducing worst-case scroll frame times by **89.9%** (`69.4 ms` → `7.0 ms`, `0` dropped frames).
- **React Memoization & Background IPC Throttling**:
  - Memoized all cards, platform logos, and list items with `React.memo` and throttled idle background IPC queries, reducing idle CPU usage to **0.02%**.

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

1. Download **`MaSwitch-Setup-1.0.4.exe`** from the **Assets** section below.
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
| `MaSwitch-Setup-1.0.4.exe` | `81.63 MB` (`85,599,147 bytes`) | `da0f64bb50449a51daeee087c49872000149c6ee032bb42040d7154e8ade92c5` |
| `win-unpacked/MaSwitch.exe` | `180.08 MB` (`188,827,136 bytes`) | `b8fa97b1276aaa8c8df3bd6334e5b638f1ae5a8697a29beb046df89b33bb0fc5` |

Verify in PowerShell:
```powershell
Get-FileHash -Algorithm SHA256 .\MaSwitch-Setup-1.0.4.exe
```
