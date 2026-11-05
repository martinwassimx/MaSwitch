# MaSwitch — Riot Games Live Account Switching Security Approval Gate

**Document Version:** 1.0.0  
**Phase:** Phase 9 — Formal Security Approval Request  
**Status:** AWAITING USER DECISION  

---

## 1. Exact Requested Permissions

Before MaSwitch can perform genuine one-click switching between remembered Riot Games accounts (e.g., `LOL EUW — Melynelas` and `LOL EUWN — littleimad`), it requires explicit authorization from you to perform the following operations on your Windows system:

1. **Read & Export Live Session Files:**
   - Permission to read files inside `%LOCALAPPDATA%\Riot Games\Riot Client\Data\`.
2. **Encrypted Vault Storage:**
   - Permission to create and write encrypted session archives inside `%APPDATA%\MaSwitch\vault\riot\`.
3. **Graceful Process Management:**
   - Permission to inspect running processes (`RiotClientServices.exe`, `LeagueClientUx.exe`, `VALORANT.exe`) and request graceful termination of `RiotClientServices.exe` when switching accounts.
4. **Filesystem Replacement:**
   - Permission to swap and replace active session files in `%LOCALAPPDATA%\Riot Games\Riot Client\Data\` with stored encrypted snapshots using atomic file replacement.
5. **Riot Client Launch:**
   - Permission to launch `RiotClientServices.exe` after a session swap is successfully committed.

---

## 2. Sensitive Files and Operations Involved

The following specific files will be read, encrypted, backed up, and swapped:

| Path | Nature of File | Operations Performed |
| :--- | :--- | :--- |
| `%LOCALAPPDATA%\Riot Games\Riot Client\Data\Cookies\Cookies` | SQLite database storing persistent session cookies (`ssid`, `tdid`, `sub`, `csid`, `did`). | Read, encrypted export, backup, overwrite. |
| `%LOCALAPPDATA%\Riot Games\Riot Client\Data\RiotGamesPrivateSettings.yaml` | YAML file containing active OAuth2 refresh tokens and user PUUID. | Read, encrypted export, backup, overwrite. |
| `%LOCALAPPDATA%\Riot Games\Riot Client\Data\Sessions\` | Directory storing active session states and device pairings. | Read, encrypted export, backup, overwrite. |

> [!CAUTION]
> These files contain **active OAuth2 refresh tokens and session cookies**. In security terms, they are **credential equivalents**: anyone who possesses these files can authenticate as your Riot account without entering your password or 2FA code until the tokens expire or are revoked.

---

## 3. Security Consequences

1. **Storage at Rest:**
   - MaSwitch will encrypt all session archives using the **Windows Data Protection API (DPAPI)** (`CryptProtectData`). Only your Windows user account on this physical machine can decrypt them.
   - However, any program running under your Windows user account with appropriate permissions could theoretically call DPAPI decrypt.
2. **Zero Plaintext Token Exposure:**
   - MaSwitch guarantees that session tokens will **never** be logged, never sent across the Electron IPC to React, and never stored in SQLite.
3. **Zero Third-Party Sharing:**
   - Stored session archives remain 100% local to your machine.

---

## 4. Account-Access and Account-Restriction Risks

1. **Riot Terms of Service (ToS):**
   - Riot Games prohibits unauthorized third-party software that automates gameplay or modifies game files.
   - While session swapping does not touch game memory or gameplay, it operates outside Riot's officially supported workflows. Riot could theoretically flag rapid switching patterns.
2. **Vanguard Anti-Cheat Interaction:**
   - If session files are swapped while Riot Vanguard is actively monitoring a game process, Vanguard could perceive the file changes as an anomaly.
   - *Mitigation:* MaSwitch enforces a strict preflight check that refuses to execute if any League of Legends or Valorant process is active.
3. **Session Invalidation:**
   - If Riot rotates tokens server-side, if you change your password, or if you click "Log out everywhere" on Riot's website, the stored session snapshot will become invalid. You would simply need to log in once manually to refresh it.

---

## 5. Recovery and Rollback Limitations

While MaSwitch implements atomic staging backups and transaction journaling:
1. **Server-Side Revocation Cannot Be Rolled Back:**
   - If Riot's authentication server revokes a session token, restoring the local file cannot restore access; manual login will be required.
2. **Concurrent File Locks:**
   - If a background antivirus scanner locks `RiotGamesPrivateSettings.yaml` during a swap, MaSwitch will abort and roll back to the previous session.
3. **Client Format Updates:**
   - If a future Riot Client update restructures the `Data` directory, the session switcher may fail until updated.

---

## 6. Proposed First Live Test

If you grant approval, the very first live verification test will be strictly bounded:
1. **DPAPI-Encrypted Pre-Switch Backup:**
   - With your explicit authorization, MaSwitch will create a DPAPI-encrypted session backup inside `%APPDATA%\MaSwitch\vault\riot\backups\pre_switch_<timestamp>.msriot.enc`.
   - **No unencrypted ZIP archives or plaintext credential files will ever be created or stored.**
2. **Single Profile Snapshot:**
   - Test snapshotting only the currently logged-in account (`Melynelas`) and verifying DPAPI encryption.
3. **Dry-Run Integrity Check:**
   - Verify that the snapshot can be decrypted and matched against the source files before any write operation is attempted.
4. **Single Supervised Switch:**
   - Perform a single switch to `littleimad` under your observation.

---

## 7. Expected Network Activity

> [!IMPORTANT]
> **MaSwitch will generate ZERO network calls for Riot account switching.**
> - MaSwitch contacts NO Riot servers.
> - MaSwitch makes NO external API requests.
> - MaSwitch transmits NO data over the internet.
> - All network communication during authentication occurs strictly inside the official Riot Client itself when it launches.

---

## 8. Clear Approval and Rejection Options

Please review the above terms and choose one of the following two options:

### OPTION A: GRANT APPROVAL (Proceed with Live Switching)
To grant permission, reply with:
> **"I approve live Riot account switching. Proceed with live adapter integration and the first safe test."**

*Effect:*
- The feature flag `riotLiveSwitchingEnabled` will be enabled.
- Production adapters (`RiotProductionSessionVault`, `RiotProductionSessionStorage`, `RiotProductionProcessCoordinator`) will be connected.
- Safe initial live testing will proceed.

### OPTION B: REJECT / KEEP MANUAL HANDOFF (Default Safe Mode)
To decline live switching, reply with:
> **"Do not enable live switching. Keep the safe launcher handoff and manual login guidance."**

*Effect:*
- The live engine remains isolated and disabled.
- MaSwitch continues using the official launcher handoff with manual sign-in and user confirmation.
- Zero Riot session files will ever be touched.

