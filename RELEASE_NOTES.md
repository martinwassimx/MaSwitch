# MaSwitch 3.0 — Public Release Notes

**Version**: 0.2.0 (MaSwitch 3.0)  
**Release Date**: November 2026  
**License**: MIT  
**Platform**: Windows 10 / Windows 11 (64-bit)  
**Developer**: Martin Wassim (<https://martinx.work>)  

---

## What's New in MaSwitch 3.0

MaSwitch 3.0 is a lightweight, privacy-first gaming launcher, multi-account switcher, and resource manager designed specifically to deliver top performance even on low-end Windows PCs.

### Key Features
1. **Riot Client Desktop Automation**:
   - Automated credential entry directly into the official Riot Client login window.
   - Resilient startup detection with automatic silent retry and handle recovery.
   - Direct credential injection without manual clipboard copying or pasting.
2. **Modular Custom Installer**:
   - Choose between **Minimal** (core app only, 0 MB extra RAM), **Recommended** (Core + Smart Collections + Backup), or **Complete** (all 6 features).
   - Install only what you need to keep background resource consumption at absolute zero.
3. **Optional Memory Management (Inspired by Mem Reduct)**:
   - Clean-room MIT Win32 implementation (no GPL-3.0 code, no kernel drivers).
   - Working set trimming and graceful closing of user-selected non-essential background applications (Discord, Spotify, browsers).
   - **Gaming Safety Rule**: Memory cleanup is automatically locked when an active game is detected to prevent frame stuttering or anti-cheat conflicts.
   - Before-game anti-stutter RAM check (< 1.5 GB warning).
4. **Smart Game Collections**:
   - Organize games into custom folders or dynamic smart collections filtered by genre, platform, tag, or playtime.
5. **Lightweight System Performance Telemetry**:
   - Zero-impact hardware monitor that polls only when actively viewed in the foreground.
6. **Game Updates & RSS News**:
   - Aggregated news feed for titles in your local library.
7. **Offline Backup & Restore**:
   - Single-file JSON/ZIP database export excluding DPAPI secrets for complete privacy.

---

## Release Artifacts & Checksums

Always verify the SHA-256 hash of your downloaded installer before running.

| Artifact | File Name | Size | SHA-256 Checksum |
| :--- | :--- | :--- | :--- |
| **Setup Installer** | `MaSwitch-Setup-0.2.0.exe` | ~82.4 MB | `7354b383112f685981bf8517b8dd5ac58b006b68cd0cad8af94320c0eb6223c9` |
| **Portable Unpacked** | `win-unpacked/MaSwitch.exe` | ~180.1 MB | `3d86b4005bbd4da8c61f1385593e33291c1c128cd284356370ad71d79f99d44c` |

*Official checksum file: `release/SHA256SUMS.txt`*

To verify the checksum on Windows PowerShell:
```powershell
Get-FileHash -Algorithm SHA256 "MaSwitch-Setup-0.2.0.exe"
```

---

## Understanding Windows & Browser Security Warnings

When downloading or installing MaSwitch on Windows, you may encounter security prompts. Here is an honest explanation of what causes them and how to proceed safely.

### 1. Windows SmartScreen ("Windows protected your PC")
- **Cause**: Microsoft Defender SmartScreen evaluates executables based on cloud download reputation. Because open-source community releases and new binary hashes start without established download volume, SmartScreen displays an informational prompt: *"Microsoft Defender SmartScreen prevented an unrecognized app from starting"*.
- **How to proceed safely**:
  1. Click **More info**.
  2. Confirm the publisher and file name match this release.
  3. Click **Run anyway**.
  - **Do NOT disable your antivirus or Windows Defender.**

### 2. Browser Download Warnings (Chrome / Edge)
- **Cause**: Browsers display *"MaSwitch-Setup-0.2.0.exe is not commonly downloaded"* for newly published releases until global download reputation builds.
- **How to proceed safely**:
  - In Edge: Select `...` > **Keep** > **Show more** > **Keep anyway**.
  - In Chrome: Select **Keep dangerous file** or click the download shelf item to proceed.

### 3. Digital Signatures & Authenticode
- Free and open-source personal software releases are distributed unsigned unless built in an enterprise CI pipeline with an EV or Azure Trusted Signing certificate.
- To inspect digital signature status in PowerShell:
  ```powershell
  Get-AuthenticodeSignature "MaSwitch-Setup-0.2.0.exe"
  ```
- If you are building MaSwitch from source, you can sign the build with your own Authenticode certificate using the standard `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables.

---

## Installation & Upgrade Instructions

1. Download `MaSwitch-Setup-0.2.0.exe`.
2. Run the installer and choose your preferred installation preset (**Recommended** or **Minimal** for low-end PCs).
3. If upgrading from MaSwitch 2.0 or earlier, **all existing account profiles, DPAPI credentials, games, and playtime hours are automatically preserved**.
4. The installer does not require Administrator privileges and installs cleanly to `%LOCALAPPDATA%\Programs\MaSwitch`.
