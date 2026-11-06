# MaSwitch v1.0.2 — Multi-Platform Game News, Provider Coverage & Feed Reliability

## About MaSwitch

**MaSwitch** is a lightweight Windows gaming launcher and account manager designed to organize games, manage supported gaming accounts, and provide useful gaming utilities.

---

## What's New in `v1.0.2`

- **Multi-Platform Game News Provider System**:
  - **Riot Games Official News**: Real-time official news, patch notes, dev blogs, and game updates for **League of Legends**, **VALORANT**, **Teamfight Tactics**, and **Legends of Runeterra**.
  - **Epic Games Official News**: Official **Fortnite** Battle Royale news, seasonal updates, and MOTD announcements with Epic Content API fallback.
  - **EA Sports Official News**: Official Pitch Notes, Title Updates, and Gameplay Developer Notes for **EA SPORTS FC** (`FC 27`, `FC 26`, `FC 25`) with Steam Official News fallback.
  - **Cross-Platform Steam Community Announcements**: Resolves installed EA, Ubisoft, Rockstar, and Custom PC games (including **F1 25**, **It Takes Two**, **Forza Horizon 5**, **Marvel's Spider-Man: Miles Morales**, **R.E.P.O.**, **Schedule I**, **Rainbow Six Siege**, **Grand Theft Auto V**, **Red Dead Redemption 2**, and 60+ titles) to their official developer community announcement feeds while filtering out non-English third-party syndication and generic store chart spam.
- **Fixed Wallpaper Engine Feed Domination**:
  - Previously, `NewsService` only queried `platformId === 'steam'` entries, causing **Wallpaper Engine** (`431960`) to dominate the entire Game News feed. Background utilities are now automatically excluded from the default multi-game feed while remaining accessible when explicitly selected in the game filter dropdown.
- **Library News Coverage & Provider Status Diagnostics**:
  - Added a compact **Library News Coverage** status bar and expandable per-game status grid (`Available`, `No Articles`, `Unsupported`, `Temporarily Unavailable`, `Refresh Failed`).
  - Unsupported games clearly report `"No supported news source available for this game."` without substituting unrelated articles.
- **Enhanced Sorting, Search, Artwork & Offline Reliability**:
  - Added **Newest First**, **Recent Updates**, and **By Game** sorting modes, **Recent** vs **Archive** date badges, **Patch / Update** indicators, a **Clear Filters** action, incremental **Load More Articles** pagination, game-specific library artwork resolution, and concurrent refresh deduplication that preserves cached articles and `lastUpdatedIso` when offline.

---

## Main Features

- **Unified Game Library**: Automatic detection and organization of installed PC games across Steam, Epic Games, EA App, Ubisoft Connect, GOG Galaxy, Riot Games, Rockstar Games Launcher, and Custom PC folders.
- **Riot Games Account Management**: Multi-account profile cards with region badges, preferred account selection, instant search, credential status filters, and sorting.
- **Automatic Riot Login**: Launches or focuses the official Riot Client, detects login window readiness with automatic retries, and fills credentials via Windows UI Automation (`System.Windows.Automation`) with optional auto-submit and native MFA/CAPTCHA support.
- **Encrypted Credential Storage**: Protects Riot Games credentials locally using the Windows Data Protection API (**Windows DPAPI** / `CryptProtectData`).
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

1. Download **`MaSwitch-Setup-1.0.2.exe`** from the **Assets** section below.
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
| `MaSwitch-Setup-1.0.2.exe` | `82.44 MB` (`86,444,561 bytes`) | `275efb0a5df9c77851834f8b0e5101e292e32c8faf4f61a9939a03547141cb88` |
| `win-unpacked/MaSwitch.exe` | `180.08 MB` (`188,827,136 bytes`) | `bc5e33a3bc624fcb657dbf702fb1c53240d9251ef0bb7d541579fcc0ed974e32` |

Verify in PowerShell:
```powershell
Get-FileHash -Algorithm SHA256 .\MaSwitch-Setup-1.0.2.exe
```
