# MaSwitch — Production Riot Account Switching Integration Report

**Date:** November 5, 2026  
**Status:** Integrated, Hardened, Verified & Ready for First Supervised Live Operation  
**Target Accounts:** `Melynelas` (LoL EUW) & `littleimad` (LoL EUW)  
**Safety Gate:** Offline Synthetic Verification Only — Zero Real Credential Access During Integration  

---

## 1. Executive Summary

Genuine, one-click Riot Games account switching has been fully integrated into the production **MaSwitch** desktop application.

All simulation layers and mock placeholders have been replaced with real, production-grade Windows architecture:
- **Windows DPAPI Vault**: Cryptographic credential storage secured with OS-level DPAPI keys tied to the user's Windows login.
- **Atomic Session Swapping**: Multi-file staging, state signature hashing, and atomic rename swapping for `%LOCALAPPDATA%\Riot Games\Riot Client\Data`.
- **Crash Recovery & Rollback**: Persistent JSON journaling with automatic recovery if an operation is ever interrupted.
- **Process Coordination & Safety**: Graceful client termination (`WM_CLOSE` via `taskkill` without `/F`) and strict lockouts preventing any file operations while games are running.
- **Explicit Consent Permission Gate**: Live session enrollment is strictly gated behind an explicit consent modal. No session files are touched until the user acknowledges the action.

---

## 2. Changed & Created Files

| File | Status | Description |
| :--- | :---: | :--- |
| `src/shared/types/account.ts` | Modified | Added `isEnrolled?: boolean;`, `RiotAccountEnrollmentResult`, and `RiotRecoveryResult`. |
| `src/shared/types/ipc.ts` | Modified | Added 5 Riot IPC channel constants and declared typed renderer methods in `MaSwitchBridge.accounts`. |
| `electron/preload.ts` | Modified | Implemented contextBridge bindings for `riotGetEnrolledProfiles`, `riotEnrollSession`, `riotRemoveSession`, `riotLiveSwitch`, and `riotRecoverPending`. |
| `electron/ipc/handlers.ts` | Modified | Registered IPC handlers with `assertTrustedSender`, input validation, DPAPI checks, process coordination, SQLite switch history recording, and event broadcasting. |
| `electron/main.ts` | Modified | Initialized `createProductionRiotLiveSwitchingEngine` with DPAPI vault and passed services into IPC handler registry. |
| `electron/services/accounts/riotLiveSwitchingEngine.ts` | Modified | Added dynamic `setEnabled(enabled: boolean)` method for runtime feature-flag toggling. |
| `src/services/localDatabaseService.ts` | Modified | Added desktop bridge wrapper methods for enrollment, switching, session deletion, and crash recovery. |
| `src/store/useAppStore.ts` | Modified | Added Zustand reactive state (`enrolledRiotProfileIds`, `isEnrollingRiot`, `isLiveSwitchingRiot`, `riotLiveSwitchError`) and corresponding async actions. |
| `src/pages/AccountsPage.tsx` | Modified | Added One-Click Riot Switching toggle, DPAPI vault status panel, enrollment badges, Switch/Enroll/Remove buttons, recovery banner, and `RiotSessionConsentModal`. |
| `tests/riotLiveIntegration.test.ts` | Created | 10 integration tests validating consent gating, DPAPI enrollment, process lockouts, atomic switching, SQLite persistence, and crash recovery. |

---

## 3. Verification & Quality Gates

All automated verification commands passed with zero warnings and zero failures:

- **Integration Tests**: 10 passed in `tests/riotLiveIntegration.test.ts`.
- **Full Vitest Suite**: **23 test files passed, 209 tests passed** (100% pass rate).
- **TypeScript Typecheck (`npm run typecheck`)**: 0 errors across client and Electron targets.
- **ESLint (`npm run lint`)**: 0 warnings, 0 errors.
- **Production Build (`npm run build`)**: Vite renderer bundle and Electron main/preload bundling completed cleanly.

---

## 4. End-to-End Workflow: Enrolling & Switching

### Step 1: Enable One-Click Switching in MaSwitch
1. Open MaSwitch and navigate to **Accounts**.
2. In the Riot Games section header, toggle **"One-Click Switching"** to **Enabled**.
3. The Vault Status will show `0 of 2 Accounts Enrolled`.

### Step 2: Enroll the First Account (`Melynelas`)
1. Open the Riot Client normally and log into **`Melynelas`**. Make sure **"Stay signed in"** is checked.
2. Completely close Riot Client (right-click the Riot Client system tray icon and click **Exit**).
3. In MaSwitch, locate the **Melynelas** card and click **"Enroll Current Session"**.
4. Review the **Enroll Riot Account Session** consent modal and click **"I Understand & Approve Session Access"**.
5. MaSwitch securely reads the session files, encrypts them via Windows DPAPI, and saves them to `<userData>/vault/riot/<id>.msriot.enc`.
6. The card badge changes to **"Enrolled (DPAPI Encrypted)"**, and the primary action changes to **"Switch Account"**.

### Step 3: Enroll the Second Account (`littleimad`)
1. Open Riot Client and sign out of Melynelas.
2. Sign into **`littleimad`** and check **"Stay signed in"**.
3. Completely close Riot Client (system tray -> Exit).
4. In MaSwitch, locate the **littleimad** card and click **"Enroll Current Session"**.
5. Review the consent modal and click **"I Understand & Approve Session Access"**.
6. Both accounts are now enrolled in your DPAPI session vault!

### Step 4: One-Click Switching
1. Whenever you want to play on **`Melynelas`**, click **"Switch Account"** on Melynelas.
   - MaSwitch closes Riot Client if open (without force-killing).
   - Atomically swaps the session files into `%LOCALAPPDATA%\Riot Games\Riot Client\Data`.
   - Opens Riot Client already authenticated as Melynelas.
2. Whenever you want to switch to **`littleimad`**, click **"Switch Account"** on littleimad.
   - MaSwitch swaps the session files back and opens Riot Client as littleimad.

---

## 5. What Remains Unverified Until Live Supervised Use

While the Windows filesystem atomicity, DPAPI encryption, process coordination, and UI state have been verified with 100% passing tests on synthetic fixtures:

1. **Riot Server-Side Token Lifespan**: Riot refresh tokens can expire after an extended period of inactivity (typically 30 days) or if passwords/security settings change. In such cases, Riot Client will prompt for re-authentication.
2. **Machine/IP Binding**: Riot authorization servers may challenge sessions if your public IP changes significantly or if hardware tokens are refreshed.
3. **Vanguard / Kernel Interactions**: Vanguard anti-cheat monitors active game sessions. MaSwitch strictly refuses to perform any account swaps while a Riot game is running to ensure Vanguard never observes session files changing under an active game.

