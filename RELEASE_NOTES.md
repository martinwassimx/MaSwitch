# MaSwitch 3.0 Release Notes (v0.2.0)

## Highlights & Overview

MaSwitch 3.0 is a lightweight Windows gaming account manager and performance optimization hub engineered specifically to run smoothly on low-end and high-end gaming PCs alike.

This release introduces:
1. **Mem Reduct Memory Cleaning Integration**: Real Windows memory list purging inspired by the open-source Mem Reduct utility by Henry++. Features genuine memory list reduction (working sets, system file cache, priority-0 standby list, full standby list, modified page list, page combining, registry cache) with zero application termination and zero process killing.
2. **Standard & Advanced Cleanup Modes**: Standard Mode applies conservative, reviewed operations that never cause game micro-stutters or disk stalls. Advanced Mode provides granular control with explicit warnings regarding disk writes and cache purging.
3. **Gaming Year in Review**: Interactive personalized annual statistics, total playtime breakdown, favorite titles, and gaming streaks.
4. **Smart Game Collections**: Dynamic smart collections with real-time rule filters (most played, unplayed, platform-specific, genre) and custom manual collections.
5. **Lightweight Performance Monitor**: Zero-overhead hardware telemetry (CPU, RAM, MaSwitch process footprint, sparkline graphs) active only when viewed.
6. **Game Updates & News**: Offline-first RSS news feeds for all library titles with zero background polling.
7. **Safe Backup & Restore**: Portable versioned backup archives excluding sensitive DPAPI credential vault secrets.
8. **Fortnite Epic Games Launcher Integration**: Seamless protocol launching through Epic Games Launcher with accurate running-state detection.
9. **Riot Automatic Desktop Login & UIA First-Attempt Self-Healing**: Resilient Windows UI Automation login engine with automatic retries for slow client start-up.

---

## Binary Information & Verified Checksums

| Distribution Artifact | File Size | SHA-256 Checksum | Digital Signature |
| :--- | :--- | :--- | :--- |
| **Modular NSIS Installer** (`release/MaSwitch-Setup-0.2.0.exe`) | **82.43 MB** (86,435,243 bytes) | `a0bfb491d8ba1df6a03f40eb40a224c666fc2aefb132f94ccc7399d83a1b39d4` | Authenticode-Ready (`asInvoker`) |
| **Standalone Portable** (`release/win-unpacked/MaSwitch.exe`) | **180.08 MB** (188,827,136 bytes) | `7fbd12ec6754c6a37225f5d6ae64d57576df586272c6c51966988a6afa1ade29` | Standalone Unpacked |

The official SHA-256 manifest is located in `release/SHA256SUMS.txt`. You can verify any downloaded executable in PowerShell with:
```powershell
Get-FileHash -Algorithm SHA256 "path\to\MaSwitch-Setup-0.2.0.exe"
```

---

## Memory Management Safety & Architecture

- **No Application Closing**: MaSwitch will never close or terminate background user applications (such as Discord, Brave, Spotify, Steam, etc.) to free RAM.
- **Genuine Windows NT Memory List APIs**: Calls `NtSetSystemInformation` with `SystemMemoryListInformation` commands (`MemoryEmptyWorkingSets`, `MemoryPurgeLowPriorityStandbyList`, `MemoryPurgeStandbyList`, `MemoryFlushModifiedList`) and `psapi!EmptyWorkingSet`.
- **Active Game Protection**: Memory cleanup is strictly blocked while any game is running to prevent FPS dips, cache drops, or anti-cheat triggers.
- **No Automatic Timers or Startup Cleaning**: Cleanup executes only when explicitly triggered by the user.
- **Privilege Separation**: MaSwitch runs as a standard user (`asInvoker`). Privileged list flushes request elevation via a transient, narrowly scoped Windows UAC helper that exits immediately upon completing the flush.

---

## Installation & Distribution Instructions

1. Download `MaSwitch-Setup-0.2.0.exe`.
2. Run the installer and choose your preferred installation preset (**Recommended** or **Minimal** for low-end PCs).
3. If upgrading from MaSwitch 2.0 or earlier, **all existing account profiles, DPAPI credentials, games, and playtime hours are automatically preserved**.
4. The installer does not require Administrator privileges and installs cleanly to `%LOCALAPPDATA%\Programs\MaSwitch`.
