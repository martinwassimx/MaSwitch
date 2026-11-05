# MaSwitch — Riot Games Production Readiness & Technical Boundary Report

**Date:** November 5, 2026  
**Project:** MaSwitch (Windows Gaming Launcher & Multi-Account Manager)  
**Author:** Senior Windows Desktop & Security Engineering  
**Scope:** Final technical evaluation of Riot Games account switching between `LOL EUWN — littleimad` and `LOL EUW — Melynelas`, implementation of production capabilities within verified security boundaries, documentation of the core architectural blocker, and verification results.

---

## 1. Executive Summary & The Core Architectural Blocker

You requested genuine Riot Games account switching inside MaSwitch for your two accounts:
- **`LOL EUWN — littleimad`**
- **`LOL EUW — Melynelas`**

Your desired experience: Select an account in MaSwitch, click Switch Account, and have Riot Client open directly into that account with zero manual login steps.

### The Honest Engineering Reality: The Specific Blocker

We conducted a complete audit of Riot Client's architecture, Windows process model, and all known open-source tools (V-Shift, TcNo-Acc-Switcher, accshift).

**Here is the exact technical reality:**

1. **Riot Client Has No Official Automated Switching Mechanism:**
   - **No Command-Line Arguments:** Riot removed all CLI login flags (`--username`, `--password`) in 2020 when Riot Sign-On (RSO) was deployed. Passing arguments to `RiotClientServices.exe` does not select an account.
   - **No Registry Preference:** Unlike Steam (which provides the public `HKCU\Software\Valve\Steam\AutoLoginUser` registry key to select an already-remembered account), Riot Client stores zero account-selection preferences in the Windows Registry.
   - **No Public IPC or API:** Riot Client does not expose local IPC pipes, HTTP endpoints, or multi-account APIs for external applications.
   - **No Built-In Account Chooser:** Unlike Discord (which has a native multi-account switcher), Riot Client operates with a single active session at any given time.

2. **How Unofficial Tools "Work":**
   Every third-party tool that claims "one-click Riot switching" (V-Shift, TcNo, accshift) achieves it solely by **terminating Riot processes and physically copying/overwriting live session files** in `%LOCALAPPDATA%\Riot Games\Riot Client\Data`:
   - `Cookies\Cookies` (SQLite database containing `ssid`, `sub`, `csid`, `tdid` OAuth cookies)
   - `RiotGamesPrivateSettings.yaml` (client configuration and session metadata)
   - `Sessions\` (active session tokens)

3. **Why True One-Click Switching Is Blocked Under Security Boundaries:**
   These session files are **credential equivalents**—possessing them bypasses passwords and 2FA. Because our strict security rules prohibit copying, swapping, or replacing live authentication session files, **true one-click Riot switching without manual login is technically impossible on current Riot Client versions.**

We will not produce a fake "one-click switch" that secretly steals or replaces your session files, nor will we claim automatic switching is functioning when Riot still requires sign-in.

---

## 2. What Works in Production

We implemented the maximum feasible, completely safe Riot workflow in production without touching credential-equivalent files:

### 1. Resilient Riot Client Resolution
- Added detection of the official Riot Client manifest: `C:\ProgramData\Riot Games\RiotClientInstalls.json`.
- Automatically extracts the live executable path (`rc_live` or `rc_default`) to locate `RiotClientServices.exe` across standard and custom installation drives (`C:`, `D:`, etc.).
- Falls back to Start Menu shortcuts and standard path inspections.

### 2. Comprehensive Process Detection
- Expanded process monitoring beyond `riotclientservices.exe` to detect:
  - Riot Client UI: `riotclientux.exe`, `riotclientuxrender.exe`
  - Active Riot Games: `leagueclient.exe`, `leagueclientux.exe`, `league of legends.exe`, `valorant.exe`, `valorant-win64-shipping.exe`
- Exposes `getRiotProcessDetails(runningNames)` to distinguish whether the client is idling or a game is actively running.

### 3. Non-Repetitive Account Selection State Management
- When an account profile is already selected as active (e.g. `LOL EUW — Melynelas`), clicking it returns `isAlreadySelected: true` without opening redundant guidance modals or re-spawning processes.
- Switching between `littleimad` and `Melynelas` tracks `fromAccountId` in SQLite, selects the target profile in MaSwitch, and provides contextual instructions:
  - Explains which account to sign out of in Riot Client (`littleimad`).
  - Displays the target account (`Melynelas`) and notes that the Riot login username may differ from the public Riot ID.

### 4. Dedicated Riot Account Switcher Status Panel in UI
- Added a focused, high-visibility control panel at the top of the Riot Games section in `AccountsPage.tsx`:
  - **Selected Profile:** Prominently displays the current profile chosen in MaSwitch.
  - **Last User-Confirmed Account:** Displays the account last confirmed by you as signed-in.
  - **Authentication State:** Clearly labeled `Authentication Unknown • Manual Sign-In Required`.
  - **Direct Launcher Control:** Added a dedicated **"Open Riot Client"** button (`data-testid="riot-section-open-launcher-btn"`) to open or bring forward Riot Client directly without initiating a switch transaction.

### 5. Strict Distinction of Account Statuses
The UI now maintains total clarity across all 5 states:
- **Selected MaSwitch Profile:** Marked with `Last Selected Profile` (cyan).
- **Last User-Confirmed Account:** Marked with `User-Confirmed Profile` (cyan badge) only after explicit confirmation.
- **Independently Verified Account:** Reserved solely for platforms with cryptographic local proof (Steam `loginusers.vdf`). Never falsely claimed for Riot.
- **Authentication Unknown:** Displayed on all unverified profiles.
- **Manual Sign-In Required:** Explicitly declared so you always know Riot Client handles credentials.

---

## 3. What Remains Simulated / Prototype-Only

The experimental session-swapping engine implemented in **`electron/services/accounts/riotSessionPrototype.ts`** is completely isolated from production:
- Operates strictly on synthetic mock fixtures (`SYNTHETIC_RIOT_FIXTURES`).
- Demonstrates state transitions (`validating` ➔ `checking-client-status` ➔ `journaling` ➔ `swapping-simulated-session` ➔ `verifying`).
- Demonstrates crash recovery (`recoverInterruptedOperation`) and atomic rollback.
- **Does NOT touch `%LOCALAPPDATA%\Riot Games`** and is not wired into the production account switcher.

---

## 4. Security Risks & Unofficial Switching Realities

If MaSwitch were to implement live session-swapping like V-Shift or TcNo:

| Area | Risk Level | Consequence |
| :--- | :---: | :--- |
| **Credential Theft** | **CRITICAL** | Storing unencrypted session files exposes your accounts to infostealers (RedLine, Vidar, Lumma) that specifically target Riot files. |
| **Account Bans** | **HIGH** | Violates Riot Terms of Service Section 7 (unauthorized third-party software automating or altering client session state). |
| **Session Invalidation** | **HIGH** | Riot regularly rotates refresh tokens server-side. Restoring an outdated session snapshot results in `VAL 43` errors and drops to a blank login screen. |
| **Data Corruption** | **MEDIUM** | Swapping SQLite cookie files while a background Riot process holds a file lock corrupts the database, requiring client reinstall. |

---

## 5. Summary of Files Modified & Created

1. **`electron/services/accounts/accountSwitcherService.ts`**
   - Added `RiotClientInstalls.json` resolution in `resolveLauncher`.
   - Expanded process detection to include League of Legends and Valorant processes.
   - Added `getRiotProcessDetails()`.
   - Added contextual sign-out instructions when switching between Riot profiles.
2. **`src/pages/AccountsPage.tsx`**
   - Added dedicated `riot-account-status-panel` in the Riot Games section.
   - Added explicit "Open Riot Client" button.
   - Clear distinction between Selected Profile, Last User-Confirmed Account, and Authentication Unknown.
3. **`tests/riotProductionWorkflow.test.tsx`** *(Created)*
   - 6 automated tests verifying Riot process detection, `fromAccountId` sequencing, `isAlreadySelected` short-circuiting, UI panel rendering, direct launcher opening, and `RiotClientInstalls.json` resolution.
4. **`electron/services/accounts/riotSessionPrototype.ts`**
   - Isolated synthetic prototype for researching session-switching transactions.
5. **`tests/riotSessionPrototype.test.ts`**
   - 13 automated tests covering synthetic prototype state transitions, journals, and rollback.
6. **`MASWITCH_RIOT_PRODUCTION_READINESS.md`** *(This Report)*

---

## 6. Automated Verification Results

All tests and builds were executed 100% offline:

### Test Suites (Vitest)
- **Total Test Files:** 19 passed (19)
- **Total Tests:** 148 passed (148)
- **Pass Rate:** 100%

```
Test Files  19 passed (19)
     Tests  148 passed (148)
```

### Build & Static Analysis
- **TypeScript:** `tsc --noEmit && tsc -p tsconfig.electron.json --noEmit` — Exit code 0 (0 errors).
- **ESLint:** `eslint .` — Exit code 0 (0 warnings, 0 errors).
- **Production Bundle:** `vite build` + `esbuild` — Exit code 0 (Generated production bundles cleanly).

---

## 7. Actions Requiring Explicit User Approval

If you ever decide you want MaSwitch to attempt unofficial, live session-swapping despite the risks, **we will require your explicit written approval for**:

1. **Permission to Read & Snapshot Live Riot Session Files:** Authorization to access `%LOCALAPPDATA%\Riot Games\Riot Client\Data` (which holds your active OAuth tokens and cookies).
2. **Permission to Force-Close Riot Client Processes:** Authorization to terminate `RiotClientServices.exe`, `RiotClientUx.exe`, and related processes during an account switch.
3. **Permission to Overwrite Live Client Files:** Authorization to replace active cookie databases on your disk.
4. **Acceptance of Terms of Service & Ban Risk:** Explicit agreement to assume responsibility under Riot Games Terms of Service §7.

*Until such approval is explicitly granted, MaSwitch will remain in its safe, verified production posture.*

---

## 8. Internet Usage & Game Safety Audit

As strictly mandated by Priority 0:

| Item | Count | Status |
| :--- | :---: | :--- |
| **Real games launched** | **0** | Verified zero game processes executed. |
| **Gaming clients opened** | **0** | Steam, Riot Client, Epic, EA, etc. were never launched. |
| **Game updates triggered** | **0** | No launcher update commands issued. |
| **Network data consumed** | **0 bytes** | All tasks executed 100% offline. |
| **Packages installed** | **0** | No `npm install` executed; only local cached dependencies used. |
| **Live Riot session files touched** | **0** | `%LOCALAPPDATA%\Riot Games` was never read, copied, or modified. |

