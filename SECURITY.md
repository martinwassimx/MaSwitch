# MaSwitch Security & Trust Architecture

MaSwitch is designed from the ground up with a strict security-first philosophy: **no cloud dependencies, no third-party telemetry, no kernel drivers, no elevated privileges, and military-grade local credential encryption**.

This document explains the security architecture of MaSwitch for users, system administrators, and security analysts.

---

## 1. Windows Credential Storage (DPAPI)

MaSwitch never stores passwords in plaintext or in accessible databases.

### Cryptographic Implementation
- All sensitive credentials (such as Riot Games account passwords) are encrypted using the official **Windows Data Protection API (DPAPI)** via `CryptProtectData`.
- **Key Derivation & Protection**:
  - DPAPI uses symmetric encryption keys derived by Windows Local Security Authority (LSA) tied specifically to the currently logged-in Windows user account.
  - The encryption key is protected by the user's Windows login credentials and system TPM (Trusted Platform Module) where available.
- **Isolation**:
  - Even if another user or process gains read access to the local application storage, they **cannot** decrypt the stored credentials.
  - Credentials cannot be copied or exported to another computer.
  - Passwords are decrypted in memory only at the exact instant automation requires them and are immediately discarded from memory buffers.

---

## 2. Desktop UI Automation: Why and How

MaSwitch automatically inputs credentials into the official Riot Client login window. Security software may monitor inter-process automation; here is the transparent explanation of how it operates safely.

### Why UI Automation is Used
- Riot Games does not provide a public REST API for automated desktop client authentication.
- Other tools attempt to bypass this by:
  - Reading or modifying internal Riot private memory (`memory injection` or `hooks`), which triggers Vanguard anti-cheat bans.
  - Stealing or copying session tokens, which risks session hijacking.
  - Placing passwords into the Windows system clipboard (`Copy to Clipboard`), which exposes credentials to any clipboard-monitoring background malware.
- **MaSwitch's Clean-Room Solution**:
  - Uses the official Microsoft Windows **UI Automation API** (`System.Windows.Automation`) and standard Windows accessibility messages.
  - Interacts exclusively with the genuine Riot Client window surface.
  - The user never has to copy, paste, or expose credentials in plaintext.
  - The user can pause, inspect, or take over authentication at any moment (e.g. to solve CAPTCHAs or enter 2FA codes).

### Safety Protections
- **Process Verification**: Before focusing or sending keystrokes, MaSwitch inspects the target window's process ID to verify that it belongs exclusively to `RiotClientServices.exe` or `RiotClientUx.exe`.
- **No Keystroke Logging**: MaSwitch does not install keyboard hooks (`SetWindowsHookEx`) or global keyloggers.
- **Single-Execution Workers**: Automation scripts run in ephemeral worker processes that terminate immediately upon completion.

---

## 3. Memory Management & Gaming Safety

MaSwitch 3.0 includes an optional memory management utility inspired by technical analysis of the open-source Mem Reduct project.

### Clean-Room Win32 Implementation
- **Zero GPL Code**: Implemented independently under MIT without incorporating GPL-3.0 code or binaries.
- **Documented APIs Only**: Uses standard, documented Win32 APIs:
  - `kernel32!SetProcessWorkingSetSize` (trims MaSwitch internal working set).
  - `psapi!EmptyWorkingSet` (optional Advanced Mode working set trimming).
  - `os.totalmem()` / `os.freemem()` (Node.js runtime queries).
- **Rejection of Unsafe Kernel Calls**:
  - Mem Reduct uses undocumented `NtSetSystemInformation` with `MemoryPurgeStandbyList` to purge file caches.
  - MaSwitch deliberately **rejects** this call because purging the Windows standby list purges disk read caches, causing active games to stutter while re-reading textures from disk.

### Gaming Safety Lock (Non-Negotiable)
- Memory cleanup is **completely locked** whenever an active game session is detected by the playtime tracker.
- **Protected Process Whitelist (`PROTECTED_PROCESS_NAMES`)**:
  The memory optimizer strictly excludes:
  - System processes: `csrss.exe`, `dwm.exe`, `explorer.exe`, `services.exe`, `lsass.exe`, `svchost.exe`.
  - Game launchers: `steam.exe`, `epicgameslauncher.exe`, `riotclientservices.exe`, `battle.net.exe`.
  - Anti-cheat drivers: `vgc.exe` (Vanguard), `easyanticheat.exe`, `beservice.exe` (BattlEye).
  - Security software: `msmpeng.exe` (Windows Defender).
  - Excluded desktop utilities: `wallpaper64.exe` (Wallpaper Engine).

---

## 4. Electron Desktop Sandbox & Content Security Policy

MaSwitch's desktop frontend runs inside a hardened Electron container:
- **Sandbox Enabled**: `sandbox: true` is strictly enforced on all browser windows.
- **Context Isolation**: `contextIsolation: true` completely separates the renderer execution environment from the Node.js main process.
- **Node Integration Disabled**: `nodeIntegration: false`, `nodeIntegrationInWorker: false`, and `nodeIntegrationInSubFrames: false`.
- **Strict Content Security Policy (CSP)**:
  ```http
  default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none';
  ```
- **Permission Requests Blocked**: All ambient web permission requests (`geolocation`, `camera`, `microphone`, `notifications`) are unconditionally denied (`callback(false)`).
- **Navigation Lockdown**: External URLs open strictly in the user's default system browser via `shell.openExternal`; child window creation is denied.

---

## 5. Least-Privilege Execution

- **No Administrator Rights Required**: MaSwitch runs with standard user privileges (`requestedExecutionLevel: "asInvoker"`).
- **Per-User Installation**: Installs to `%LOCALAPPDATA%\Programs\MaSwitch`.
- **Data Preservation**: User databases and vault storage in `%APPDATA%\maswitch` are maintained outside the installation directory and preserved across updates and clean uninstallation.

---

## 6. Code Signing Guide (For Developers & Maintainers)

MaSwitch supports standard Authenticode signing via Electron Builder:

### Using a Local or Hardware PFX Certificate
Set the following environment variables prior to running the packaging build:
```powershell
$env:CSC_LINK = "C:\path\to\authenticode-cert.pfx"
$env:CSC_KEY_PASSWORD = "YourCertificatePassword"
npm run dist:installer
```

### Using CI/CD (GitHub Actions / Azure Trusted Signing)
1. Store the base64-encoded PFX in GitHub Secrets as `CSC_LINK`.
2. Store the password in GitHub Secrets as `CSC_KEY_PASSWORD`.
3. In your workflow step:
   ```yaml
   - name: Build & Sign Windows Installer
     env:
       CSC_LINK: ${{ secrets.CSC_LINK }}
       CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
     run: npm run dist:installer
   ```
4. Verify the generated executable:
   ```powershell
   npm run verify:release
   ```

---

## 7. Reporting Security Issues

If you discover a potential security vulnerability in MaSwitch, please report it responsibly by contacting:
**Martin Wassim** — <https://martinx.work>

Please do not disclose security issues publicly until they have been addressed.

