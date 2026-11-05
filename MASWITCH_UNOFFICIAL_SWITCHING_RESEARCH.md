# MaSwitch unofficial switching research

Reviewed November 5, 2026. This report supersedes the earlier Steam implementation description in MASWITCH_REAL_ACCOUNT_SWITCHING_REPORT.md.

## 1. Mechanisms and evidence

V-Shift currently contains a Go backend with Steam-specific switching and a platform descriptor for Riot. Its Steam routine stops client processes, rewrites remembered-account flags, writes HKCU AutoLoginUser and RememberPassword, optionally changes the chooser and persona settings, and starts Steam. Its Riot descriptor names Cookies, Sessions and RiotGamesPrivateSettings.yaml as login files. That Riot method manipulates authenticated session material. The reviewed commit was bc0eeda591d89af941be863e4761bafe0eb3295f. [Steam source](https://github.com/Nanda070/V-Shift/blob/bc0eeda591d89af941be863e4761bafe0eb3295f/internal/steam/switcher.go), [Riot descriptor](https://github.com/Nanda070/V-Shift/blob/bc0eeda591d89af941be863e4761bafe0eb3295f/Platforms.json)

TcNo's current master also has a Go Steam implementation and platform descriptors. Its Steam routine manages MostRecent, AutoLogin and RememberPassword flags, including reconstructing missing rows from its own account store. The Riot descriptor includes Cookies, Sessions, private settings and a switcher identity file. This is private launcher state. The routines go substantially beyond selecting an existing remembered account. [Steam source](https://github.com/TCNOco/TcNo-Acc-Switcher/blob/master/internal/steam/switcher.go), [Riot descriptor](https://github.com/TCNOco/TcNo-Acc-Switcher/blob/master/Platforms.json)

accshift separates its Rust core from application and GUI layers. Its Steam code reads the startup preference and remembered-account metadata, and its switch options include graceful shutdown and optional elevation. Its Riot switch explicitly quits the client to flush rotated tokens, snapshots the outgoing session and restores the target session. This directly establishes why its Riot switching falls outside this task. Reviewed tree 76c63388a7bc591b26a4a5f3d4421932e5918e25. [Steam core](https://github.com/klNuno/accshift/blob/76c63388a7bc591b26a4a5f3d4421932e5918e25/crates/accshift-core/src/platforms/steam/mod.rs), [Riot switching](https://github.com/klNuno/accshift/blob/76c63388a7bc591b26a4a5f3d4421932e5918e25/crates/accshift-core/src/platforms/riot/switch.rs), [Switch options](https://github.com/klNuno/accshift/blob/76c63388a7bc591b26a4a5f3d4421932e5918e25/crates/accshift-core/src/platforms/steam/switch_params.rs)

V-Shift and TcNo publish GPL version 3 licenses. accshift publishes an MIT license. This implementation was written independently and copies no source from those projects. The review covered relevant switching files and descriptors, rather than a complete security audit of each application. [V-Shift license](https://github.com/Nanda070/V-Shift/blob/main/LICENSE), [TcNo license](https://github.com/TCNOco/TcNo-Acc-Switcher/blob/master/LICENSE), [accshift license](https://github.com/klNuno/accshift/blob/main/LICENSE)

## 2. Windows, privileges and update compatibility

The narrow Steam preference operation uses HKCU, which normally needs no administrator rights. V-Shift and accshift expose optional elevated launching. Process termination, service operations and protected installation directories can require additional rights in the broader third-party workflows. I did not establish a universal privilege requirement for every code path in each application.

All three approaches depend on undocumented client state. Their future compatibility is unverified. Token rotation and expiry specifically complicate Riot snapshots. Opening any launcher can initiate background updates. No source review can establish that future launcher releases will preserve these behaviors.

Electron can implement the non-secret preference operation in its main process using Windows APIs or a bounded child process. The renderer should receive only operation results. The new adapter uses argument-based process execution, encoded PowerShell scripts, timeouts and hidden helper windows. Riot session copying and private API authentication were excluded.

## 3. Implemented functionality

Steam now has an experimental remembered-account preference adapter wired into the normal Select & Open Launcher action. It requires Steam and steamwebhelper to be closed. It reads loginusers.vdf metadata, matches exactly one existing login name or SteamID, and requires RememberPassword and AllowAutoLogin to already be enabled. A persona display name is insufficient.

Before modifying AutoLoginUser, it writes and flushes an atomic JSON backup containing only the previous preference, target name and pending flag. It rechecks process state and the previous value, applies the target and reads it back. It then asks the existing launcher adapter to start Steam with zero game arguments. A write or launch failure restores the previous preference when Steam is stopped and no external preference change conflicts. Pending requests are recovered on the next selection after restarting MaSwitch. The backup is retained at steam-selection-backup.json under MaSwitch userData.

The implementation deliberately uses a smaller operation than the reviewed projects. It leaves VDF flags and the chooser preference under Steam's control. Consequently a client version or chooser setting may ignore the preference or still ask the user to choose or sign in. Actual account activation has not been demonstrated live. The result says the preference was applied and authentication remains unknown.

Each platform declares selectionCapability and authenticationStatus. Steam declares experimental automatic remembered-account selection, Discord a native chooser, Riot/Epic/EA/Ubisoft/Rockstar/GOG manual sign-in, and custom games unsupported. Existing user-confirmation and independent-identity gates continue to apply.

## 4. Unsupported functionality

No reviewed Riot route provided one-click switching without manipulating sensitive session material. Riot retains its direct client handoff. No Riot tokens, cookies, session files or private API credentials are accessed. Vanguard is untouched.

Steam accounts absent from its remembered-account list are rejected. Expired authentication still requires Steam sign-in. A running client must be exited normally by the user. MaSwitch does not close games or kill launcher processes. Registry selection is experimental, and the adapter never reports verified authentication from a preference value.

## 5. Security and account-ban risks

A saved account name is personal metadata and is kept locally in the backup. Authenticated session snapshots can confer account access, so importing the Riot mechanisms would violate the requested boundary. The narrow Steam path changes only a non-secret user preference, but unofficial integration has no publisher compatibility or enforcement guarantee. No claim of zero ban risk is made. This source review did not establish a ban incident attributable to this narrow preference operation.

## 6. Exact files changed

- electron/services/accounts/steamRememberedSelection.ts adds the Windows preference adapter, remembered-account validation, durable backup and recovery.
- electron/services/accounts/accountSwitcherService.ts routes Steam selection through the optional account adapter and declares explicit platform capabilities.
- electron/main.ts supplies the backup location when wiring the production adapter.
- src/shared/types/account.ts declares selection capabilities and unknown authentication status.
- tests/steamRememberedSelection.test.ts covers both directions, missing accounts, running Steam, failed writes, launch failure rollback, restart recovery and external changes.
- MASWITCH_UNOFFICIAL_SWITCHING_RESEARCH.md records findings and limits.

## 7. Automated verification

The full offline run of npm.cmd test passed with 17 files and 129 tests. After tightening rollback verification, the targeted steamRememberedSelection suite passed again with 7/7 tests. TypeScript checks, ESLint and production build all exited 0. Vite emitted its existing CJS deprecation and large-chunk warnings, and the existing navigation test emitted a React act warning.

All new tests use temporary files and mocked process/registry adapters. Existing integration tests retain launcher mocks. Tests exercise preference changes, not a live Steam authentication result. The test TEMP and TMP point to node_modules/.cache/maswitch-offline-tests because the Windows sandbox default temporary directory blocks atomic rename operations.

## 8. Internet and game-launch safety

Research retrieved GitHub pages, API file listings and selected raw source text. No third-party binaries were downloaded or executed. No packages were installed. No real gaming launcher or game was opened. No live registry preferences or authentication sessions were modified by automated tests. No game artwork or game updates were downloaded. The existing local Python 3.12 executable was used for edits.

## 9. User-authorized live validation

1. Prepare two accounts through Steam's own sign-in UI with Remember me enabled. Save their actual login names or SteamID64 values in MaSwitch.
2. Exit Steam normally, including its tray process, and ensure games are closed.
3. For a first check with zero download traffic, disconnect from the internet. Select account B in MaSwitch. Check the account Steam actually displays. Offline authentication may be unavailable.
4. Exit Steam, select account A and inspect again. Record a user confirmation only after checking Steam's own account display.
5. If Steam opens its chooser or ignores the preference, report that result. The preference path has not established live switching on that client version.
6. For network-dependent sign-in, use a connection on which launcher updates are acceptable. Starting an online launcher can cause updates even without pressing Play. Do not change update settings as part of this test.
7. After an interrupted request, exit Steam before retrying so the retained backup can be recovered. An external preference conflict intentionally stops recovery for review.
