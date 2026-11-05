# Security Policy & Trust Architecture

MaSwitch is built with a strict local-first security philosophy: **no cloud accounts, no third-party telemetry, no kernel drivers, no game file modification, and Windows DPAPI local credential encryption**.

---

## 1. Supported Versions

| Version | Supported |
| :--- | :--- |
| `1.0.x` | :white_check_mark: Active Support |
| `< 1.0.0` | :x: Pre-release versions (upgrade to `1.0.0` recommended) |

---

## 2. Reporting a Vulnerability

If you discover a security vulnerability in MaSwitch, please report it responsibly:

1. **GitHub Security Advisories / Issues**: Open a report on the [MaSwitch GitHub repository](https://github.com/martinwassimx/MaSwitch/security) or via [martinx.work](https://martinx.work).
2. **Do Not Include Personal Secrets**: Never include real account passwords, DPAPI vault files, or personal tokens in bug reports.
3. **Coordinated Disclosure**: Please allow reasonable time for investigation and a patched release before public disclosure of exploitable issues.

---

## 3. Windows Credential Storage (DPAPI)

MaSwitch never stores passwords in plaintext or in SQLite databases.

- **Windows Data Protection API (`CryptProtectData` / Electron `safeStorage`)**:
  - Riot Games login credentials are encrypted using Windows DPAPI tied specifically to the currently signed-in Windows user account on the local machine.
  - Encrypted vault entries cannot be decrypted by other Windows users or copied to another PC.
  - Plaintext passwords are never written to SQLite, logs, or backup archives (`Backup & Restore` explicitly excludes credential vault secrets).

---

## 4. Riot Client Desktop Login Automation

MaSwitch automates sign-in to the official Riot Client without modifying Riot files or bypassing authentication:

- **Official Windows UI Automation (`System.Windows.Automation`)**:
  - Launches or focuses the official `RiotClientServices.exe` / `RiotClientUx.exe` process.
  - Verifies the target window's process ID (PID) belongs to the genuine Riot Client before interacting with input fields.
  - Streams credentials directly into the username and password controls without using the Windows clipboard (`Copy/Paste` is never used).
  - Preserves Riot's native MFA, 2FA, and CAPTCHA steps inside the official Riot Client window.

---

## 5. Memory Management Safety

MaSwitch includes an optional Windows memory management utility inspired by the open-source [Mem Reduct](https://github.com/henrypp/memreduct) project by Henry++:

- **Never Closes User Applications**: MaSwitch never terminates or closes background user applications (such as Discord, browsers, or launchers).
- **Windows NT Memory List APIs**: Uses Windows memory management calls (`EmptyWorkingSet`, `SetSystemFileCacheSize`, and `NtSetSystemInformation` with `SystemMemoryListInformation` commands for working sets, priority-0 standby list, standby list, and modified page list).
- **Active Game Lock**: Memory cleanup is automatically disabled while any game session is active to prevent frame-time spikes or anti-cheat interference.
- **Protected Process Whitelist**: Strictly excludes Windows core processes (`csrss.exe`, `dwm.exe`, `lsass.exe`), game launchers (`steam.exe`, `epicgameslauncher.exe`, `riotclientservices.exe`), anti-cheat services (`vgc.exe`, `easyanticheat.exe`, `beservice.exe`), and desktop utilities (`wallpaper64.exe` / `wallpaper32.exe`).

---

## 6. Electron Sandbox & Process Hardening

- `sandbox: true`
- `contextIsolation: true`
- `nodeIntegration: false`
- Strict Content Security Policy (`default-src 'self'; script-src 'self'; object-src 'none'`)
- Sender validation on all IPC handlers (`assertTrustedSender`)
- Zero shell command interpolation (`shell: false` for game executable launching)
- Standard user execution level (`requestedExecutionLevel: "asInvoker"`)

---

## 7. Windows SmartScreen & Unsigned Installer Notice

If a release binary is built without a commercial Authenticode code-signing certificate (`CSC_LINK`):
- Windows Defender SmartScreen may display an *"Unknown Publisher"* warning until binary reputation is established.
- Always verify your downloaded `MaSwitch-Setup-1.0.0.exe` against the published `SHA256SUMS.txt` on the official GitHub Release page using PowerShell:
  ```powershell
  Get-FileHash -Algorithm SHA256 .\MaSwitch-Setup-1.0.0.exe
  ```
- Never disable Windows Defender, SmartScreen, or antivirus software to install MaSwitch.
