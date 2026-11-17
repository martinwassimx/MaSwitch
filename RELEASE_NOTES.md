# MaSwitch v1.2.0 — Password-First Interface & Startup PIN Code Protection

## About MaSwitch

**MaSwitch** is a lightweight Windows account & password switcher and gaming launcher designed to manage Riot Games accounts securely with 1-click desktop auto-login alongside your installed PC games.

Official website: [maswitch.martinx.work](https://maswitch.martinx.work/) · [FAQ](https://maswitch.martinx.work/faq) · [Privacy & Security](https://maswitch.martinx.work/privacy)

---

## What's New in `v1.2.0`

### 1. Simplified Password-First Interface (Home Removed)
- **Opens Straight to Passwords & Accounts**: Removed the separate Home page so MaSwitch opens immediately to **Passwords & Accounts**, with **Passwords** placed first in a streamlined sidebar followed by **Games** and secondary tools.
- **True 1-Click Login**: Clicking **Login** on an account immediately launches or focuses the official Riot Client and enters your username and password—eliminating intermediate confirmation modals and "Coming Soon" platform clutter.
- **Single Unified Account & Password Form**: Add or edit your Riot login username, encrypted password, and optional display label in one simple dialog.

### 2. Startup PIN Code Lock (`VaultPinService`)
- **Session PIN Protection**: Prompts for a **4–6 digit PIN** whenever MaSwitch opens before saved passwords can be used, added, edited, or deleted (first launch guides you to set your PIN).
- **Main-Process Cryptographic Enforcement**: Salted `scrypt` verifier protected by **Windows DPAPI** (`vault-pin.enc.json`), constant-time verification (`crypto.timingSafeEqual`), and a persisted 30-second cooldown after 5 wrong attempts.
- **1-Click Lock & Change PIN**: Re-lock your passwords anytime from the header or **Settings → Accounts & Security**, while keeping 100% of existing saved `.cred.enc` passwords intact.

### 3. Startup Password Hydration Fix
- Fixed an app initialization issue where saved password statuses were not hydrated on startup (`initializeApp()`), ensuring all saved passwords show **Password Saved** and work immediately when opening MaSwitch without needing to re-save any password.
- Replaced external `semver` runtime resolution with a built-in SemVer 2.0.0 engine (`semverUtils.ts`) for reliable `app.asar` execution.

---

## Installation

1. Download **`MaSwitch-Setup-1.2.0.exe`** (or standalone **`MaSwitch-Portable-1.2.0.exe`**) from the **Assets** section below.
2. Optionally verify it against `SHA256SUMS.txt`.
3. Run the installer and choose **Minimal**, **Recommended**, **Complete**, or **Custom**.

**Windows SmartScreen**: Because this open-source release is built without a commercial EV/OV Authenticode certificate, Windows Defender SmartScreen may display an *Unknown Publisher* prompt. Do not disable Windows Defender or your antivirus—verify the SHA-256 checksum below instead.

## Assets & SHA-256 Checksums

| File | Size | SHA-256 |
| :--- | :--- | :--- |
| `MaSwitch-Setup-1.2.0.exe` | `117.25 MB` | `b6504d50f627ed69f56457cf4feee897fad3f6d905129b119df3a5fd53b4ab27` |
| `MaSwitch-Portable-1.2.0.exe` | `106.05 MB` | `4b51c748229476617997bc1432627e7c10c574f54a27eb3eccdcbbe203a00320` |
| `SHA256SUMS.txt` | `265 B` | SHA-256 checksums of the release executables |

Verify in PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 .\MaSwitch-Setup-1.2.0.exe
```
