# MaSwitch — Phase 10: Production Windows Infrastructure for Riot Switching

**Document Version:** 1.0.0  
**Phase:** Phase 10 — Production Windows Infrastructure Implementation & Synthetic Verification  
**Status:** Completed — 100% Offline Synthetic Verification Passed — Live Operations Gated Behind Approval  

---

## 1. Executive Summary

Phase 10 implemented the real, production-quality Windows desktop infrastructure required for genuine Riot Games account switching. This infrastructure provides the low-level operating system adapters needed to securely manage session credentials, swap persistent client state, coordinate running processes, and recover from failures or power interruptions.

In strict compliance with user instructions:
- **Zero real Riot session files or authentication tokens were read, copied, inspected, or modified.**
- **Zero games or client processes were launched or terminated.**
- **Zero packages, game updates, or third-party binaries were downloaded.**
- **All tests were conducted exclusively using isolated, disposable synthetic directories and mocked process coordinator fixtures.**
- **The feature flag `riotLiveSwitchingEnabled` remains `false` by default.**
- **No claim is made that live switching is verified on real Riot accounts until explicitly approved and live-tested by the user.**

---

## 2. Implemented Windows Infrastructure

The complete infrastructure was built in [`electron/services/accounts/riotProductionAdapters.ts`](file:///c:/Users/msfir/OneDrive/Desktop/Github%20Project/MaSwitch/electron/services/accounts/riotProductionAdapters.ts):

### A. Windows DPAPI Encrypted Session Vault (`RiotWindowsSessionVault`)
*Implements `RiotSessionVault`*
- **Primary Encryption:** Uses Electron's native `safeStorage` API, which directly binds to **Windows Data Protection API (DPAPI)** (`CryptProtectData`). Decryption is mathematically restricted to the logged-in Windows user account on this physical computer.
- **Test & Headless Fallback:** When running outside Electron (such as inside Node.js test runners), automatically transitions to an authenticated **AES-256-GCM** cipher using a machine/user-bound key derived via `scrypt` with a hardware-unique salt and random 12-byte IVs.
- **Tamper-Evident Envelopes:** Every session file is serialized with an envelope containing:
  - Magic header `MSRIOT_VAULT_V1`
  - Target `accountId`
  - Encryption scheme (`dpapi` or `aes-256-gcm`)
  - Hex-encoded IV and authentication tag (for AES-GCM)
  - SHA-256 checksum of decrypted payload
  - ISO creation timestamp and expiration flag
- **Secure File Shredding:** Prior to deleting an account session file from disk, the file is overwritten with zero bytes (`Buffer.alloc(size, 0)`) before unlinking, preventing forensic recovery from unallocated disk clusters.
- **Directory Access Control Lists (ACLs):** Creates the vault directory with `fs.chmodSync(0o700)` and invokes `icacls.exe` on Windows to strip inherited permissions and grant exclusive full control `(OI)(CI)F` to the active user SID and `SYSTEM`.
- **Strict Parameter Validation:** Validates all account IDs against strict alphanumeric whitelist regex (`^[a-zA-Z0-9_.-]{1,64}$`), explicitly prohibiting directory traversal tokens (`..`, `/`, `\`, `:`).

### B. Atomic Filesystem Session Storage (`RiotWindowsSessionStorage`)
*Implements `RiotSessionStorage`*
- **Data Boundary Enforcement:** Strictly isolates operations to:
  1. `RiotGamesPrivateSettings.yaml` (persistent refresh tokens and OAuth identity)
  2. `Cookies/` (SQLite cookie jars and WAL/journal files)
  3. `Sessions/` (session descriptors and locks)
  *Explicitly ignores global non-sensitive settings (like `RiotClientSettings.yaml`) to preserve user interface and language preferences.*
- **Gzip Archive Packaging:** `exportLiveSession()` serializes the active session files into a gzip-compressed package (`zlib.gzipSync`) with per-file SHA-256 checksums and a package-level verification hash.
- **Atomic Swap Lifecycle:** `applySessionAtomically(sessionData)` executes a 6-stage safe transaction:
  1. *Decompress & Verify:* Unzips archive in-memory, validates magic `MSRIOT_PKG_V1`, checks file integrity hashes, and rejects directory traversal.
  2. *Staging:* Unpacks target files into an isolated temporary folder `.maswitch_stage_<uuid>`.
  3. *Staged Integrity Verification:* Verifies that all staged files exist, are readable, and match expected byte sizes.
  4. *Live Backup:* Copies current active session files into a temporary rollback directory `.maswitch_backup_<uuid>`.
  5. *Atomic Application:* Copies staged files to live destinations.
  6. *Post-Swap Verification:* Verifies live session files via `verifySessionFiles()`.
- **Automatic In-Memory Rollback:** If any error occurs or post-swap verification fails, the storage adapter immediately restores the original files from `.maswitch_backup_<uuid>` before cleaning up temporary folders and re-throwing the error.
- **Active Session Identification:** `readCurrentActiveSessionId()` safely parses `RiotGamesPrivateSettings.yaml` using non-eval regex extraction for OAuth subject PUUID (`sub:`) or username.

### C. Graceful Riot Client Process Coordinator (`RiotWindowsProcessCoordinator`)
*Implements `RiotProcessCoordinator`*
- **Game Detection:** Detects active gameplay or anti-cheat processes (`leagueclient.exe`, `leagueclientux.exe`, `league of legends.exe`, `valorant.exe`, `valorant-win64-shipping.exe`, `vgc.exe`, `lor.exe`).
- **Client Detection:** Detects launcher background processes (`riotclientservices.exe`, `riotclientux.exe`, `riotclientcrashhandler.exe`).
- **Strict Gameplay Safety Refusal:** If `isGameRunning()` returns true, `requestGracefulShutdown()` immediately aborts and returns `false`. MaSwitch will never close or kill a client while a League of Legends or Valorant match is active.
- **Graceful Termination Request:** If only Riot Client is running, sends a standard window-close signal via `taskkill.exe /IM RiotClientServices.exe` (WITHOUT `/F`), allowing the client to flush cookies and state to disk.
- **Poll-Based Grace Period:** Monitors process termination with a configurable timeout (default 3000ms, polling every 100ms). If the client fails to close within the grace window, returns `false`, causing the engine to abort safely rather than forcibly killing the process.
- **Client Launcher:** Configurable launch command executing `RiotClientServices.exe` with zero CLI arguments via detached spawn.

### D. Production Engine Wiring (`createProductionRiotLiveSwitchingEngine`)
- Provides a clean factory function that instantiates [`RiotLiveSwitchingEngine`](file:///c:/Users/msfir/OneDrive/Desktop/Github%20Project/MaSwitch/electron/services/accounts/riotLiveSwitchingEngine.ts) with the production Windows adapters.
- Configures persistent transactional journaling (`journal.json`) inside the encrypted vault directory.
- Enforces the feature flag gate (`riotLiveSwitchingEnabled: false`), immediately throwing `RiotFeatureDisabledError` unless explicitly enabled.

---

## 3. Test Verification & Results

A dedicated automated test suite was created in [`tests/riotProductionAdapters.test.ts`](file:///c:/Users/msfir/OneDrive/Desktop/Github%20Project/MaSwitch/tests/riotProductionAdapters.test.ts) containing 21 comprehensive test scenarios:

1. **Vault Security & Permissions:**
   - Enforces restrictive directory creation and permissions.
   - Encrypts and decrypts sessions using mock DPAPI `safeStorage`.
   - Encrypts and decrypts sessions using authenticated AES-256-GCM fallback with random IV and auth tag.
   - Rejects illegal account IDs (traversal `../`, slashes, overly long names) with `RiotValidationError`.
   - Rejects empty or non-buffer payloads.
   - Detects payload tampering and throws `RiotSessionCorruptedError`.
   - Securely shreds and deletes session files with zero-byte overwrite.
   - Tracks session expiration state and lists stored profiles.
2. **Atomic Storage & File Operations:**
   - Parses active account PUUID and username from synthetic `PrivateSettings.yaml`.
   - Correctly returns `null` when session files are missing or incomplete.
   - Exports live session files into a compressed, checksummed gzip archive.
   - Atomically applies session packages, updates target files, and cleans up staging directories.
   - Rejects malicious archives containing path traversal (`../outside.txt`).
   - Automatically rolls back to the previous session when post-swap verification fails.
3. **Process Coordination & Safety:**
   - Detects running games and launcher processes.
   - Strictly refuses graceful shutdown when an active game is running (never executes `taskkill`).
   - Gracefully requests client shutdown without `/F` and polls until closed.
   - Handles client launch execution.
4. **End-to-End Engine Integration:**
   - Blocks live operations with `RiotFeatureDisabledError` when the feature flag is disabled.
   - Executes full end-to-end switch lifecycle with real adapters in a synthetic environment (traversing `preflight` → `checking-processes` → `shutting-down-client` → `journaling` → `swapping-session` → `verifying-files` → `launching-client` → `completed`).
   - Verifies crash recovery safety: refuses recovery while client is running, and recovers safely when client is closed.

### Overall Verification Summary:
- **`npm test`:** **21 test files, 182 tests passed** (100% pass rate, 0 failures).
- **`npm run typecheck`:** Passed with **0 errors**.
- **`npm run lint`:** Passed with **0 errors**.
- **`npm run build`:** Production bundle compiled cleanly with exit code 0.

---

## 4. Security Limitations & Architectural Boundary Notes

1. **DPAPI Security Scope:**
   - Windows DPAPI encrypts data using a master key tied to your Windows user logon credentials.
   - This provides strong protection against offline disk theft, unauthorized user accounts, and external tools.
   - However, any program running under your active Windows user session with the same privilege level could technically invoke `CryptUnprotectData`.
2. **Server-Side Token Revocation:**
   - MaSwitch can only preserve and restore local token files. If Riot Games revokes a token server-side (e.g., password change, "Log out of all devices", or periodic 30-90 day expiration), restoring the local file will not bypass the Riot login prompt. The user will simply see the standard login window and must sign in once manually to refresh the token.
3. **Zero Network Inferences:**
   - MaSwitch makes zero network requests to Riot OAuth endpoints. Consequently, MaSwitch reports authentication status as `unknown` upon session swap. Only when the official Riot Client launches and contacts Riot servers is authentication live.
4. **Client Update Fragility:**
   - If Riot Games fundamentally changes the file format or storage location of `RiotGamesPrivateSettings.yaml` or `Cookies`, the storage adapter will detect the missing files and safely refuse to switch, falling back to the standard manual handoff.

---

## 5. What Remains Before a Live Test

To perform a safe, live test between your real accounts (`LOL EUW — Melynelas` and `LOL EUWN — littleimad`), the following steps remain:

1. **Your Explicit Separate Approval:** Live session files must not be touched until you review this report and grant permission.
2. **Pre-Test Manual Backup:** Before any live write operation, create a verified manual zip backup of `%LOCALAPPDATA%\Riot Games\Riot Client\Data` (`riot_data_pre_switch_backup.zip`).
3. **First Account Snapshot Enrollment:** While signed into `Melynelas` in Riot Client, snapshot and encrypt the session to `<AppData>\MaSwitch\vault\riot\Melynelas.msriot.enc`.
4. **Second Account Snapshot Enrollment:** While signed into `littleimad` in Riot Client, snapshot and encrypt the session to `<AppData>\MaSwitch\vault\riot\littleimad.msriot.enc`.
5. **Supervised Single Switch:** Trigger a live switch in MaSwitch from `littleimad` to `Melynelas` with game clients closed, observing Riot Client startup.

---

## 6. Status & Gate Confirmation

Phase 10 is complete. The Windows infrastructure is built, tested with synthetic fixtures, and feature-flagged off.

**Antigravity has stopped and will not access or modify any live Riot session files without your explicit approval.**

