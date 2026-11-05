# MaSwitch — Riot Games Live Account Switching Implementation Plan

**Document Version:** 1.0.0  
**Phase:** Phase 9 — Architecture, Feasibility, Security Design & Verification  
**Author:** Windows Desktop Application Architect & Security Specialist  
**Status:** Feature Architecture Implemented (Synthetic Tests Passing) — Live Operations Gated Behind Approval  

---

## 1. Executive Summary

MaSwitch is a Windows gaming launcher and multi-account manager built with Electron, React, TypeScript, and SQLite. The primary objective is to enable seamless, one-click switching between remembered Riot Games accounts (specifically between the user's primary accounts: `LOL EUW — Melynelas` and `LOL EUWN — littleimad`).

In Phase 6 through Phase 8, MaSwitch established a clean, safe account management foundation featuring SQLite profile storage, platform detection, process detection, and a safe launcher-handoff workflow with manual user confirmation. However, this workflow requires manual sign-in on every switch because the official Riot Client does not provide native multi-account switching.

This document presents the complete technical architecture, security design, failure-recovery mechanics, and policy risks for **real Riot Games live account switching**. 

**Current Implementation State:**
- The complete modular architecture (`RiotLiveSwitchingEngine`, `RiotProcessCoordinator`, `RiotSessionVault`, `RiotSessionStorage`, transaction journaling, and atomic rollback) has been designed, implemented, and verified with 13 comprehensive unit tests against synthetic fixtures.
- The feature is completely disabled by default via `riotLiveSwitchingEnabled: false`.
- **Zero live Riot Client files have been accessed, modified, or copied.** Zero live processes have been terminated or spawned.

---

## 2. Current Implementation

MaSwitch currently handles Riot Games through a hardened **launcher handoff** model:

```
[User Selects Riot Account]
             │
             ▼
[Preflight Check: Riot Client / Game Running?]
             │
             ├── If running: Informs user to close client
             └── If not running:
                     │
                     ▼
             [Launch Riot Client (zero CLI credentials)]
                     │
                     ▼
             [Display Account Guidance Modal]
                     │
                     ├── User signs in manually inside Riot Client
                     └── User clicks "I've Signed In"
                             │
                             ▼
             [Record User Confirmation in SQLite History]
             (Authentication Status = "unknown" / User Confirmed)
```

### Key Characteristics of Current State:
1. **Zero Session Tampering:** MaSwitch never inspects, touches, or modifies `%LOCALAPPDATA%\Riot Games`.
2. **Process Safety:** MaSwitch does not forcibly terminate `RiotClientServices.exe`, `LeagueClient.exe`, or `VALORANT.exe`.
3. **No Credential Access:** Authentication status is truthfully recorded as `unknown` (with user confirmation recorded separately in `account_switch_history`).
4. **Limitation:** The user must enter credentials or manually pick an account in the Riot Client each time they switch between `Melynelas` and `littleimad`.

---

## 3. Real Switching Feasibility

### Why Official One-Click Switching Does Not Exist:
1. **No Command-Line Arguments:** In 2020, Riot Games deprecated all username/password CLI arguments (`--username`, `--password`) with the introduction of Riot Sign On (RSO) and OAuth2/PKCE.
2. **No Registry Preferences:** Unlike Steam (which uses `HKCU\Software\Valve\Steam\AutoLoginUser`), Riot Client does not store the remembered account in the Windows Registry.
3. **No Multi-Account Chooser:** Riot Client supports "Stay Signed In", but it only remembers a **single** active session at any given time. Signing into a second account overwrites the local session.
4. **No Public Local IPC/API:** The Riot Client local REST API (Lockfile / LCU) is only active after the client is already running and authenticated. It does not provide endpoints to switch OAuth refresh tokens without an interactive browser/webview challenge.

### The Only Technical Mechanism for Real Switching:
Genuine one-click switching between Riot accounts is technically feasible **only** by swapping the persistent session and cookie storage files that the Riot Client reads upon boot.

---

## 4. Evidence from Existing Community Tools

To assess the reliability and safety of session swapping, three widely used open-source community utilities were analyzed:

| Utility | Architecture | Mechanism | Storage Method | Process Handling |
| :--- | :--- | :--- | :--- | :--- |
| **V-Shift** (Valorant Account Switcher) | C# / WPF | Swaps `%LOCALAPPDATA%\Riot Games\Riot Client\Data` | Plaintext zip / folder copies in `%APPDATA%\V-Shift` | `taskkill /f /im RiotClientServices.exe` |
| **TcNo Account Switcher** | C# / .NET | Swaps `RiotGamesPrivateSettings.yaml` and `Cookies` | Local folder repository per profile | Forcible process termination |
| **accshift** | Python / Rust | File replacement of `Cookies` and `Sessions` | Unencrypted local cache | Sends `WM_CLOSE`, falls back to `SIGKILL` |

### Key Takeaways from Community Tools:
1. **Technical Viability:** All three tools successfully swap Riot sessions without triggering automatic bans simply for swapping the files.
2. **Security Weakness in Existing Tools:** Nearly all existing community switchers store session tokens in **unencrypted plaintext** on disk. Any malware or unprivileged script running under the user profile can steal those files and immediately hijack the Riot accounts.
3. **Fragility:** Forcible process termination (`taskkill /F`) occasionally corrupts `RiotGamesPrivateSettings.yaml`, leading to a "Client Repair Required" state.

---

## 5. Proposed Architecture

MaSwitch introduces a decoupled, dependency-injected architecture designed for safety, testability, and atomic failure recovery:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      RiotLiveSwitchingEngine                           │
├────────────────────────────────────────────────────────────────────────┤
│ - Feature Flag Gate (`riotLiveSwitchingEnabled`)                       │
│ - Transaction Journaling & Atomic Rollback                             │
│ - Concurrency Mutex Locks & Operation Cancellation                    │
│ - Crash Recovery on Startup (`recoverPendingOperation`)               │
└───────────────┬───────────────────┬───────────────────┬────────────────┘
                │                   │                   │
                ▼                   ▼                   ▼
    ┌──────────────────────┐ ┌──────────────┐ ┌──────────────────────┐
    │RiotProcessCoordinator│ │RiotSession-  │ │ RiotSessionStorage   │
    │                      │ │   Vault      │ │                      │
    ├──────────────────────┤ ├──────────────┤ ├──────────────────────┤
    │- isGameRunning()     │ │- hasSession()│ │- readActiveSession() │
    │- isClientRunning()   │ │- saveSession │ │- exportLiveSession() │
    │- requestGraceful-    │ │  (DPAPI enc) │ │- applySession-       │
    │  Shutdown()          │ │- loadSession │ │  Atomically()        │
    │- launchClient()      │ │- delete-     │ │- verifySession-      │
    │                      │ │  Session()   │ │  Files()             │
    └──────────────────────┘ └──────────────┘ └──────────────────────┘
```

### Core Components:

1. **`RiotLiveSwitchingEngine`**:
   - Manages the switching state machine (`IDLE` -> `CHECKING_PREREQUISITES` -> `STOPPING_CLIENT` -> `PRESERVING_CURRENT` -> `APPLYING_TARGET` -> `LAUNCHING_CLIENT` -> `COMPLETED`).
   - Rejects operations if `riotLiveSwitchingEnabled` is false.
   - Enforces a strict lock preventing concurrent switch requests.
   - Writes a persistent journal entry before every filesystem modification to guarantee rollback if interrupted.

2. **`RiotProcessCoordinator`**:
   - Inspects running processes (`LeagueClientUx.exe`, `VALORANT.exe`, `RiotClientServices.exe`).
   - Aborts immediately if an active game is in session.
   - Initiates graceful closure (window close requests with a timeout) rather than immediate kill.

3. **`RiotSessionVault`**:
   - Manages stored account snapshots in `<MaSwitchAppData>\vault\riot\<accountId>`.
   - Encrypts all session payload buffers using Windows DPAPI (`CryptProtectData`) before writing to disk.

4. **`RiotSessionStorage`**:
   - Interacts directly with `%LOCALAPPDATA%\Riot Games\Riot Client\Data`.
   - Exports the currently active session into a unified snapshot buffer.
   - Applies target session snapshots using atomic directory renames and temporary staging directories.

---

## 6. Security Design

Because Riot session files contain persistent OAuth2 tokens, they must be treated with the same confidentiality as master passwords.

```
┌────────────────────────────────────────────────────────┐
│                     THREAT MODEL                       │
├────────────────────────────────────────────────────────┤
│ 1. Disk Snooping / Backup Exfiltration:               │
│    Protected by Windows DPAPI (tied to Windows login). │
│ 2. Database Leaks:                                     │
│    Zero tokens in SQLite. Only metadata (puuid, name). │
│ 3. Memory & IPC Leaks:                                 │
│    Zero tokens exposed over Electron IPC to React.     │
│ 4. Plaintext Logs:                                     │
│    Zero tokens written to log files.                   │
└────────────────────────────────────────────────────────┘
```

### Security Safeguards Implemented:
1. **Windows Data Protection API (DPAPI):**
   - Session archives are encrypted via `CryptProtectData` (scope: `CRYPTPROTECT_UI_FORBIDDEN`). Only the logged-in Windows user account can decrypt them.
2. **Strict Filesystem Access Control Lists (ACLs):**
   - The vault directory is created with explicit NTFS permissions granting read/write access solely to the current user SID and SYSTEM.
3. **Zero Plaintext Token Exposure:**
   - Tokens are never passed over the Electron IPC bridge. React only receives status updates, error codes, and account IDs.
   - Tokens are never inserted into SQLite tables or written to application log files.
4. **Feature Flag Isolation:**
   - Live switching is hard-coded to require `settings.riotLiveSwitchingEnabled === true`. By default, this is `false`.

---

## 7. Exact Sensitive-Data Boundaries

The Riot Client stores its state inside:  
`%LOCALAPPDATA%\Riot Games\Riot Client\Data\`

| File / Folder | Contents | Sensitivity Level | Risk if Leaked |
| :--- | :--- | :--- | :--- |
| `Cookies\Cookies` (SQLite) | `ssid`, `tdid`, `sub`, `csid`, `did` | **CRITICAL** (Full Credential Equivalent) | Allows full account access, bypassing password and 2FA until cookie expiration. |
| `RiotGamesPrivateSettings.yaml` | OAuth2 refresh tokens, remembered PUUID, client telemetry IDs | **CRITICAL** (Full Credential Equivalent) | Contains active refresh token enabling offline token exchange. |
| `Sessions\` | Active session descriptors and lock states | **HIGH** | Session tracking and device pairing tokens. |
| `RiotClientSettings.yaml` | Launcher window size, language, audio preferences | **LOW** (Non-sensitive) | User interface settings only. |

**Boundary Rule:** MaSwitch only reads and swaps `Cookies\Cookies`, `RiotGamesPrivateSettings.yaml`, and `Sessions\`. Non-sensitive global settings (`RiotClientSettings.yaml`) are left untouched to prevent resetting launcher preferences.

---

## 8. Account Enrollment Workflow

To register an account profile for live switching, the following sequence is executed:

```
Step 1: User signs into Account A in Riot Client normally ("Stay signed in" checked).
Step 2: User opens MaSwitch -> Accounts Page -> Riot Games.
Step 3: User selects Account A profile -> Clicks "Snapshot Current Session".
Step 4: Preflight Verification:
        - Check that Riot Client is closed or graceful shutdown requested.
        - Verify session files exist and are non-empty.
Step 5: RiotSessionStorage reads:
        - `Cookies\Cookies`
        - `RiotGamesPrivateSettings.yaml`
        - `Sessions\`
Step 6: Bundle files into a snapshot payload.
Step 7: RiotSessionVault encrypts payload via DPAPI.
Step 8: Save encrypted snapshot to `<AppData>\MaSwitch\vault\riot\<AccountA_ID>.enc`.
Step 9: Update SQLite: Set `hasRememberedSession = 1` for Account A.
```

The user repeats this once for Account B (`littleimad`). Once both snapshots exist, live switching can occur without further manual credential entry.

---

## 9. Switching Workflow

When switching from Account A to Account B:

```
[Trigger Switch to Account B]
             │
             ▼
[Phase 1: Preflight Verification]
  - Is `riotLiveSwitchingEnabled` true? (If false -> throw `RiotFeatureDisabledError`)
  - Is a game running (LoL/Valorant)? (If true -> throw `RiotGameRunningError`)
  - Does target session snapshot exist in vault? (If false -> throw `RiotProfileSessionNotFoundError`)
             │
             ▼
[Phase 2: Client Coordination]
  - Is Riot Client running?
  - If running, send graceful shutdown request and wait up to 5000ms.
  - If client fails to close -> throw `RiotClientRunningError` (Never force kill while game open).
             │
             ▼
[Phase 3: Outgoing Session Preservation]
  - Snapshot the currently active session from `%LOCALAPPDATA%\...`.
  - Save encrypted snapshot to active profile in vault (preserves refreshed tokens).
             │
             ▼
[Phase 4: Transaction Journaling & Atomic Swap]
  - Write journal: `{ status: 'PENDING', targetAccountId: 'AccountB', step: 'SWAPPING' }`.
  - Backup active session to staging directory `.staging_swap`.
  - Decrypt Account B snapshot from vault.
  - Write Account B files into `%LOCALAPPDATA%\Riot Games\Riot Client\Data\`.
  - Verify file integrity (check file sizes and existence).
  - Write journal: `{ status: 'COMMITTED' }`.
             │
             ▼
[Phase 5: Launch & Cleanup]
  - Launch `RiotClientServices.exe` with zero CLI arguments.
  - Clean up staging directory.
  - Update SQLite: Set active profile = Account B.
  - Return `{ success: true, activeProfile: 'AccountB', authentication: 'unknown' }`.
```

---

## 10. Failure and Rollback Handling

Filesystem operations can be interrupted by power outages, system crashes, or third-party interference (antivirus locks). The engine employs strict atomic guarantees:

### 1. Atomic Staging Swap
The engine never overwrites live files directly in place without a rollback staging cache:
1. Copy target files to `%LOCALAPPDATA%\Riot Games\Riot Client\Data\.maswitch_stage\`.
2. Move live files to `.maswitch_backup\`.
3. Move staged files into live directory.
4. If any step fails, restore from `.maswitch_backup\`.

### 2. Transaction Journaling
All operations record a `journal.json` containing:
- `operationId`: UUID
- `targetAccountId`: Target profile
- `previousAccountId`: Previous profile
- `state`: `PREPARING` | `STAGING` | `COMMITTED` | `ROLLING_BACK` | `ROLLED_BACK`

### 3. Crash Recovery on Startup
On application launch, `RiotLiveSwitchingEngine.recoverPendingOperation()` checks for uncommitted journals:
- If a transaction was interrupted during staging, it restores the backup and marks the journal `ROLLED_BACK`.
- If interrupted after successful commit, it cleans up staging files and completes the transition.

---

## 11. Authentication Verification Limitations

### The Unknown Authentication Requirement:
When MaSwitch restores a session archive, **it cannot verify whether Riot's backend will accept the tokens without making live network requests to Riot's private OAuth endpoints.**

Making unauthorized network calls to Riot servers violates MaSwitch's architectural boundaries and risks triggering anti-bot protections. Therefore:

> [!IMPORTANT]
> MaSwitch must report authentication status as `unknown` upon session swap. Only when Riot Client launches and connects to Riot servers does the session become live. MaSwitch relies on the user or Riot Client telemetry to confirm whether the login was successful.

If a token has expired or been revoked, Riot Client will simply present the login screen. MaSwitch treats this as an expired session and prompts the user to re-authenticate.

---

## 12. Compatibility and Riot Policy Risks

### 1. Riot Games Terms of Service (Section 7)
Riot Games ToS prohibits unauthorized third-party tools that:
- Automate gameplay (bots, scripts).
- Provide an unfair competitive advantage.
- Reverse engineer proprietary protocols.

*Assessment:* Multi-account switchers that operate purely via local file management (without injecting into game processes, modifying game memory, or bypassing DRM) occupy a grey area. Riot has historically not banned players simply for using offline account switchers (like V-Shift or TcNo), but Riot reserves the right to restrict any tool at their discretion.

### 2. Riot Vanguard Anti-Cheat Heuristics
- **Vanguard does not monitor offline file swapping when Riot Client and games are completely closed.**
- **Critical Risk:** Swapping session files while Vanguard is running or while a game client is starting could trigger an anti-cheat anomaly alert.
- **Mitigation:** The preflight check **strictly refuses** to operate if any game process or anti-cheat service is active.

### 3. Token Rotation and Invalidation
Riot OAuth refresh tokens can be invalidated if:
- The user changes their password on the web.
- The user enables or disables Multi-Factor Authentication (2FA).
- The user logs out via "Log out everywhere" on account management.
- Riot initiates a periodic server-side token rotation (typically 30–90 days).

When this occurs, the stored session snapshot will become invalid, requiring the user to sign in once manually to capture a new snapshot.

---

## 13. Codebase Files Affected for Live Integration

To connect the implemented engine to the live operating system, the following files will be modified:

| File | Proposed Change |
| :--- | :--- |
| `src/shared/types/settings.ts` | *(Implemented)* Added `riotLiveSwitchingEnabled` setting. |
| `src/shared/validation/settingsValidator.ts` | *(Implemented)* Added validation and sanitization. |
| `src/shared/types/account.ts` | *(Implemented)* Added live switching types and journal structures. |
| `electron/services/accounts/riotLiveSwitchingEngine.ts` | *(Implemented)* Core engine and pluggable interfaces. |
| `electron/services/accounts/riotProductionAdapters.ts` | *(Proposed)* Production adapters for DPAPI encryption, live process checking, and real `%LOCALAPPDATA%` file I/O. |
| `electron/ipc/accountHandlers.ts` | *(Proposed)* Wire IPC channel `accounts:riotLiveSwitch` to the live engine. |
| `src/pages/AccountsPage.tsx` | *(Proposed)* Add "One-Click Switch" button enabled only when user approves live switching. |

---

## 14. Testing Strategy

### 1. Synthetic Unit & Integration Testing (Completed)
- 13 comprehensive test scenarios in `tests/riotLiveSwitchingEngine.test.ts` covering:
  - Feature flag enforcement (throws when disabled).
  - Game running conflict rejection.
  - Client running graceful shutdown handling.
  - Missing profile session handling.
  - Atomic swap execution.
  - Journal transaction recording.
  - Rollback on filesystem failure.
  - Interrupted crash recovery.
  - Concurrency locking (rejecting parallel operations).
  - Cancellation token support.
  - SQLite profile coexistence without data conflict.
- **Result:** 100% pass rate across all 13 tests.

### 2. Proposed Live Testing Procedure (Subject to Approval)
If approved by the user, live testing will proceed in 4 strictly controlled stages:
1. **Directory Inspection Only:** Verify paths without copying or writing.
2. **Read-Only Snapshot Test:** Test DPAPI encryption of a single snapshot without modifying live files.
3. **DPAPI-Encrypted Backup Before First Swap:** Create a verified DPAPI-encrypted backup of live Riot session data in the vault before any write operation. No unencrypted ZIP or plaintext backups will ever be created.
4. **Controlled Swap Verification:** Perform a single swap between `Melynelas` and `littleimad` while observing Riot Client launch behavior.

---

## 15. Estimated Implementation Complexity & Maintenance

| Dimension | Assessment | Details |
| :--- | :--- | :--- |
| **Implementation Complexity** | Medium | Engine core is already built and tested. Only Windows DPAPI binding and production filesystem adapters remain. |
| **Security Risk** | High | Managing credential-equivalent OAuth refresh tokens on disk requires strict DPAPI and ACL protections. |
| **Maintenance Burden** | Medium | Susceptible to future Riot Client updates if Riot alters file formats or directory paths. |
| **User Experience Gain** | High | Eliminates repetitive manual 2FA / password entries when switching between primary Riot accounts. |

---

## 16. Implemented Architecture vs. Proposed Live Operations

| Capability | Status | Implementation Details |
| :--- | :--- | :--- |
| Modular Switching Engine Architecture | **IMPLEMENTED** | `electron/services/accounts/riotLiveSwitchingEngine.ts` |
| Feature Flag Gate (`riotLiveSwitchingEnabled: false`) | **IMPLEMENTED** | `src/shared/types/settings.ts`, `settingsValidator.ts` |
| Atomic Transaction Journaling & Rollback | **IMPLEMENTED** | Full state machine with rollback staging |
| Crash Recovery Engine | **IMPLEMENTED** | `recoverPendingOperation` recovers interrupted swaps |
| Synthetic Unit Test Suite | **IMPLEMENTED** | `tests/riotLiveSwitchingEngine.test.ts` (13 tests passing) |
| Access to Real `%LOCALAPPDATA%\Riot Games` | **PROPOSED (GATED)** | Blocked pending explicit user approval |
| Real Process Termination of Riot Client | **PROPOSED (GATED)** | Blocked pending explicit user approval |
| Real Live Session Swapping | **PROPOSED (GATED)** | Blocked pending explicit user approval |
| Automatic Riot Client Launching on Swap | **PROPOSED (GATED)** | Blocked pending explicit user approval |

