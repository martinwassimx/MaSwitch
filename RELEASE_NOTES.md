# MaSwitch v1.1.0 — Security Hardening, Signed Updates & Riot Quick Switch

## About MaSwitch

**MaSwitch** is a lightweight Windows gaming launcher and account manager that organizes your installed games, manages Riot Games accounts, and provides gaming utilities.

---

## Important for existing users

**A one-time manual installation is required to move to the new secure update system.**

MaSwitch 1.0.4 and earlier cannot authenticate this release, because they predate signed update manifests. Download `MaSwitch-Setup-1.1.0.exe` from this page and run it over your existing installation. Your game library, playtime history, settings, account profiles and encrypted Riot credentials are kept.

From 1.1.0 onward, MaSwitch installs an update only after verifying its Ed25519-signed release manifest against the public key built into the app.

---

## Security

- **Stronger Riot credential protection**: the renderer can no longer request decrypted credentials, credential status is read without decrypting passwords, vault records are bound to their account profile, and removing an account deletes its stored credentials.
- **Riot Client verification**: credentials are typed only into a window whose process is signed by Riot Games, Inc. (verified with Windows Authenticode on every login) and that currently has focus.
- **Electron hardening**: Electron 44 runtime, restrictive Content Security Policy, blocked navigation, webview and drag-and-drop, packaged builds ignore development server overrides, and Electron fuses disable Node.js entry points.
- **Secure application updates**: update manifests are signed with Ed25519 and pin the installer's SHA-256 and size. Downgrades, pre-release builds on the stable channel and unsigned releases are refused, and the installer is re-verified immediately before it runs.
- **Safer Windows operations**: system tools are run from their absolute System32 paths, custom game executables and launch arguments require approval, administrator memory cleanup asks for confirmation every time, and file, backup and artwork paths are confined to their expected folders.
- **Dependency updates**: updated build and test tooling. Production dependencies report no known vulnerabilities. Some moderate advisories remain in build-only tooling.

## Riot Accounts

- **Improved account cards** showing the account name, League of Legends region, VALORANT region and credential status.
- **Account nicknames**: the old display-name field is now an optional nickname, used when no verified Riot ID is available.
- **Region detection**: League of Legends and VALORANT regions are read from the Riot Client configuration on your PC after a successful login, or when you choose *Refresh regions*.
- **Manual region selection**: choose a region yourself in *Edit Account*. Your choice is never replaced by automatic detection.
- **VALORANT default**: when no region can be detected, VALORANT is shown as **EMEA (default)** and labelled as a default.
- **Home Quick Account Switch**: switch Riot accounts from the top of the Home page using the same secure switching flow as the Accounts page.

Known limitations:
- Riot IDs (`Name#TAG`) are not detected automatically. The Riot Client files MaSwitch can safely read do not contain them. Cards show your nickname instead.
- Region detection reflects the Riot Client's current configuration on this PC, not a lookup on Riot's servers. If you play on several servers, set each account's region manually.
- MaSwitch shows which account it last selected. It does not claim to know which account is signed in to Riot Client.

## Improvements

- Game icons are extracted with Electron's built-in icon API instead of PowerShell.
- More reliable game library, launching and installer component handling.
- Performance and reliability fixes across updates, backups and artwork downloads.

---

## Installation

1. Download **`MaSwitch-Setup-1.1.0.exe`** from the **Assets** section below.
2. Optionally verify it against `SHA256SUMS.txt` (see below).
3. Run the installer and choose **Minimal**, **Recommended**, **Complete** or **Custom**.

**Windows SmartScreen**: the installer is not Authenticode code-signed, so Windows may show *Unknown Publisher*. Do not disable Windows Defender or your antivirus. Verify the checksum instead.

## Assets

| File | Purpose |
| :--- | :--- |
| `MaSwitch-Setup-1.1.0.exe` | Windows installer |
| `SHA256SUMS.txt` | SHA-256 checksum of the installer |
| `maswitch-update-manifest.json` | Signed update manifest used by MaSwitch's updater |
| `maswitch-update-manifest.json.sig` | Ed25519 signature of the manifest |

A checksum from the same page confirms the download is intact. It does not prove who published it. MaSwitch's built-in updater additionally checks the signed manifest.

Verify in PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 .\MaSwitch-Setup-1.1.0.exe
```
