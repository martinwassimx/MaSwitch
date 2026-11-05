# MaSwitch — First Public Release (`v1.0.0`)

## About MaSwitch

**MaSwitch** is a lightweight Windows gaming launcher and account manager designed to organize games, manage supported gaming accounts, and provide useful gaming utilities.

---

## Main Features

- **Unified Game Library**: Automatic detection and organization of installed PC games across Steam, Epic Games, EA App, Ubisoft Connect, GOG Galaxy, Riot Games, Rockstar Games Launcher, and Custom PC folders.
- **Riot Games Account Management**: Multi-account profile cards with region badges (`EUW`, `NA`, `EUNE`, `KR`, etc.), preferred account selection, instant search, credential status filters, and sorting.
- **Automatic Riot Login**: Launches or focuses the official Riot Client, detects login window readiness with automatic retries, and fills credentials via Windows UI Automation (`System.Windows.Automation`) with optional auto-submit and native MFA/CAPTCHA support.
- **Encrypted Credential Storage**: Protects Riot Games credentials locally using the Windows Data Protection API (**Windows DPAPI** / `CryptProtectData`).
- **Game Launching**: Official protocol launching (`steam://` and `com.epicgames.launcher://`, including Fortnite Epic Games Launcher routing) and validated direct executable launching.
- **Game Playtime Tracking**: Real-time session tracking (`Starting` → `Running` → `Completed`) with Windows Sleep/Resume support and crash recovery.
- **Game Tracking Exclusions**: Built-in exclusions for **Wallpaper Engine** (`wallpaper64.exe`, `wallpaper32.exe`) and idle launchers, plus custom user exclusions.
- **Gaming Statistics**: Detailed playtime analytics, daily/weekly activity breakdowns, and platform distribution charts.
- **Optional Memory Management**: Windows NT memory list cleaning (`Working Sets`, `System File Cache`, `Standby List`, `Modified Page List`) inspired by [Mem Reduct](https://github.com/henrypp/memreduct)—never closes user applications and automatically locks while a game is running.
- **Smart Game Collections**: Dynamic rule-based collections and custom manual collections.
- **Gaming Year in Review**: Annual gaming recap and exportable summary card.
- **Game Updates & News**: On-demand official Steam RSS news and patch notes with offline caching.
- **Backup & Restore**: Local versioned backups of profiles, settings, collections, and playtime history (excluding sensitive DPAPI secrets).
- **Lightweight Performance Monitoring**: On-demand CPU, system RAM, and MaSwitch footprint telemetry with zero background polling when closed.
- **Modular Windows Installer**: Choose **Minimal**, **Recommended**, **Complete**, or **Custom** presets during setup to install only the features you want.

---

## Coming Soon

Account management is currently active exclusively for **Riot Games**. Multi-account management for the following platforms is marked **Coming Soon** in the Accounts tab (while their game library discovery, launching, and playtime tracking remain fully active):
- Steam account management
- Epic Games account management
- EA account management
- Ubisoft account management
- GOG account management
- Rockstar account management
- Other supported platforms

---

## Installation

1. Download **`MaSwitch-Setup-1.0.0.exe`** from the **Assets** section below.
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
| `MaSwitch-Setup-1.0.0.exe` | `82.43 MB` (`86,436,446 bytes`) | `8166af2789f3cffc1dd2574d4cf1ab43cd6e24f005d66da8bc9900cb6ebdf477` |
| `win-unpacked/MaSwitch.exe` | `180.08 MB` (`188,827,136 bytes`) | `485f9ad29025e71a8f4803c25fe8e8ce06028e45dc1a2ff9d8026a13ba672195` |

Verify in PowerShell:
```powershell
Get-FileHash -Algorithm SHA256 .\MaSwitch-Setup-1.0.0.exe
```
