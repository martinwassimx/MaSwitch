# MaSwitch v1.0.1 — Riot Accounts Layout Polish & Windows Release

## About MaSwitch

**MaSwitch** is a lightweight Windows gaming launcher and account manager designed to organize games, manage supported gaming accounts, and provide useful gaming utilities.

---

## What's New in `v1.0.1`

- **Redesigned Riot Account Cards**:
  - **Clean Header**: Riot brand icon/avatar, account display name, region badge (`EUW`, `EUNE`, `NA`, `KR`, etc.), username, and a compact top-right overflow menu (`⋮`).
  - **Streamlined Status Row**: Clear `Credentials Saved` or `Setup Required` badge alongside `Last Selected` and `Preferred` indicators.
  - **Two-Row Action Hierarchy**: Full-width primary **Login** button (`w-full`) above a separate 2-column secondary row containing **Set Up Credentials** and **Edit Account**—eliminating cramped or overlapping controls.
  - **Overflow Menu Actions**: Moved **Make Preferred** and **Delete Account** into the card's overflow menu (`⋮`).
- **Balanced Responsive Account Grid**:
  - Two balanced columns at standard desktop widths (filling the container symmetrically when 1 or 2 accounts exist), three columns on wide displays when 3+ accounts exist, and one column on narrow windows, with zero horizontal scrolling across `1920×1080`, `1366×768`, `1280×720`, and `1024×768`.
- **Simplified Security Overview**:
  - Removed redundant security banners and kept a single visually secondary **Security Overview** section showing Windows DPAPI status, configured credentials count, and accounts requiring setup.

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

1. Download **`MaSwitch-Setup-1.0.1.exe`** from the **Assets** section below.
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
| `MaSwitch-Setup-1.0.1.exe` | `82.43 MB` (`86,436,054 bytes`) | `6bfab3e27a91de4f07d8c59018abce591ad26b600d1608016d7703534c3b31d9` |
| `win-unpacked/MaSwitch.exe` | `180.08 MB` (`188,827,136 bytes`) | `5364b3b1a1e76f5dd6b3f2e6e2d207953c8d220e800f54cf2a7dbb03f42e145e` |

Verify in PowerShell:
```powershell
Get-FileHash -Algorithm SHA256 .\MaSwitch-Setup-1.0.1.exe
```
