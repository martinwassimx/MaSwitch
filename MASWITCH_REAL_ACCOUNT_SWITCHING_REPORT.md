# MaSwitch account switching report

November 5, 2026

## A. Root cause

The original **Switch Profile** button called `useAppStore.switchAccount` in Zustand. In live mode the store called `localDatabaseService.switchAccount`, which used `window.maswitch.accounts.switchAccount` exposed by the Electron preload bridge. The main process handled `ACCOUNTS_SWITCH_ACCOUNT`, retrieved the profile from SQLite, enumerated running processes and delegated to `AccountSwitcherService`. `AccountManagerService` wrapped the same database bridge, but this button called the bridge through the store.

The service could start an executable or open a general launcher URI. It passed no account selection to Riot Client. The Accounts page then presented a hard-coded sign-out and sign-in checklist even when MaSwitch had already requested that the launcher open. Some launch branches returned success after an unsuccessful request. Steam opened its main window even though MaSwitch advertised a native chooser handoff, and a matching `MostRecent` entry in `loginusers.vdf` plus a running process could produce a verification badge.

The original confirmation button invoked `ACCOUNTS_CONFIRM_SWITCH` with a profile ID and optional prior profile ID. Confirmation updated `account_profiles.last_used_at`, wrote `account_switch_history` and populated `platform_active_profiles`. The renderer interpreted that stored profile as **Current Profile**. Those operations recorded MaSwitch state. Authentication happened separately in the publisher’s client.

## B. Riot Games technical findings

**Automatic switching to a specific Riot account is unsupported through any public Riot interface identified in this review.** Riot’s public Client FAQ describes opening Riot Client and its role as the desktop hub. Riot’s account documentation describes signing in using the login username and password or linked sign-in options. I found no documented desktop account-switch API, URI, command-line argument, or supported way to invoke a saved-account chooser. A Riot desktop chooser for multiple previously authenticated accounts remains unverified. Riot distinguishes the login username from the Riot ID and tagline. [Riot Client FAQ](https://support.riotgames.com/en-us/riot/client/riot-client-faq), [Managing Your Riot Account](https://support.riotgames.com/en-us/riot/account/managing-your-riot-account)

Riot Sign On is a separate, consent-based OAuth flow for an approved production app. The documented `/riot/account/v1/accounts/me` endpoint identifies the account that authorized the app through RSO. Its response provides no evidence about which account is currently signed into a particular Windows Riot Client. MaSwitch uses no RSO integration or Riot Client session access. [Riot Developer Portal FAQ](https://developer.riotgames.com/docs/faqs), [League of Legends RSO integration](https://developer.riotgames.com/docs/lol), [Account API reference](https://developer.riotgames.com/apis/)

Selecting **LOL EUW** or **LOL EUWN** now saves that choice and requests opening the installed `RiotClientServices.exe` with zero arguments. MaSwitch checks known install paths and, as a fallback, reads the target of a Riot Client shortcut in the Windows Start Menu. It accepts an existing absolute path to `RiotClientServices.exe` and discards shortcut arguments. If Windows leaves the client in the background, use its taskbar or tray icon. Complete any sign-out, account sign-in and MFA in Riot Client. Use the Riot login username or a linked sign-in option if the saved identifier is a Riot ID. [Windows Start Menu folders](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid), [Electron shortcut API](https://www.electronjs.org/docs/latest/api/shell#shellreadshortcutlinkshortcutpath-windows)

## C. Platform capability matrix

“Automatic” means MaSwitch can tell the desktop launcher to activate a specific saved account. A native chooser can switch between remembered accounts after the user picks one.

| Platform | Automatic from MaSwitch | Manual authentication | Documented mechanism | Implemented behavior | Independent desktop verification |
| --- | --- | --- | --- | --- | --- |
| Steam | No public target-selection interface identified | Choose the saved account. Sign in if Steam prompts. | Steam offers a startup chooser when enabled and a Change Account command while running. Valve also documents a credential-based launch option, which is outside this task. [Steam client update](https://store.steampowered.com/news/posts/?enddate=1788304067&feed=steam_community_announcements), [Steam launch options](https://help.steampowered.com/en/faqs/view/0188-6BB7-D467-08E1) | Opens Steam and directs the user to its chooser. Steam applies the chosen account. | Unavailable in MaSwitch. Valve documents current-user identity in the [Steamworks client API](https://partner.steamgames.com/doc/api/ISteamUser), which MaSwitch does not integrate. A remembered account entry proves no live identity. |
| Epic Games | No public target-selection interface identified | Sign out when necessary and sign in in the launcher. | Official sign-out instructions cover legacy and preview launchers. [Epic Games Support](https://www.epicgames.com/help/c-36624475/a12923547) | Opens Epic Games Launcher and points to its sign-out options. | Unknown |
| Riot Games | Unsupported through the reviewed public interfaces | Sign out when necessary and sign in in Riot Client. | Riot Client sign-in. Multiple remembered accounts and an external chooser are unverified. [Riot Account Support](https://support.riotgames.com/en-us/riot/account/managing-your-riot-account) | Opens Riot Client directly and keeps the chosen profile visible in MaSwitch. | Unknown. RSO identifies an independently authorized account. [Riot RSO documentation](https://developer.riotgames.com/docs/lol) |
| EA App | No public target-selection interface identified | Sign out when necessary and sign in with the other EA account. | The app menu signs out and opens the sign-in flow. [EA Help](https://help.ea.com/en/articles/platforms/how-to-use-ea-app/) | Opens EA App and points to the upper-left menu. | Unknown |
| Ubisoft Connect | No public target-selection interface identified | Log out when necessary and sign in in the client. | Ubisoft documents logging out of Ubisoft Connect PC. A third-party chooser remains unverified. [Ubisoft Help](https://www.ubisoft.com/en-us/help/connectivity-and-performance/article/emptying-the-cache-of-ubisoft-connect-pc/000061966) | Opens Ubisoft Connect PC for the client sign-in flow. | Unknown |
| Rockstar Games Launcher | No public target-selection interface identified | Sign out when necessary and sign in with the desired account. | Rockstar documents switching through the player menu and sign-in screen. [Rockstar Support](https://support.rockstargames.com/articles/7BjSyiI3152iK5Yip6QvpJ/signing-into-a-different-rockstar-games-account-when-using-the-rockstar-games-launcher) | Opens Rockstar Games Launcher and points to the player menu. | Unknown |
| GOG Galaxy | No public target-selection interface identified | Sign in in Galaxy. Sign out first if a different account is signed in. | GOG documents signing into Galaxy. A native multi-account picker or external account switch was unverified. [GOG Support](https://support.gog.com/hc/en-us/articles/213039045-Installation-issue-corrupt-files) | Opens GOG Galaxy for client sign-in. | Unknown |
| Discord | No public target-selection interface identified | Pick a saved account. Sign in when adding an account or when prompted. | **Avatar → Switch Accounts** is an official desktop feature and supports up to five accounts. [Discord Account Switcher FAQ](https://support.discord.com/hc/en-us/articles/4412732047127-Discord-Account-Switcher-FAQ) | Opens Discord and points to its built-in picker. Discord applies the chosen account. | Unknown |

## D. Code changes

| File | Change |
| --- | --- |
| `electron/services/accounts/accountSwitcherService.ts` | Replaced account-path protocol calls and Steam VDF inspection with an injectable launcher adapter, argument-free Windows launch, platform-specific handoffs and a pending request that can be cancelled or confirmed once. The adapter waits for the process spawn event and reports missing or failed launches. |
| `electron/main.ts` | Wires the Windows launcher adapter and Electron’s shortcut target resolver into the account service. |
| `electron/ipc/handlers.ts` | Uses a trusted renderer and a matching main-process request ID for confirmation, adds cancellation, and removes process enumeration from switch and confirmation requests. Launcher status checks still detect running processes. |
| `electron/preload.ts` | Exposes cancellation and forwards request IDs through the existing accounts bridge. |
| `electron/services/database/sqliteDatabase.ts` | Adds migration 8 and a single last selection per platform. Preserves account records, preferences, associations and historical rows. Legacy selections are carried forward, and recognizable historical user reports remain user-confirmed. Ambiguous historical rows are excluded from confirmation status. Records a new user report and its timestamp together and invalidates a stored confirmation if the account identifier is edited. |
| `src/shared/types/account.ts` | Separates the last selection, historical user confirmation, optional independent launcher identity and handoff result. |
| `src/shared/types/ipc.ts` | Declares the request ID and cancellation API. |
| `src/services/localDatabaseService.ts` | Forwards cancellation and confirmation and removes fallback success responses when the desktop bridge is missing. |
| `src/services/accountManagerService.ts` | Uses the request ID contract and removes the legacy claim that native switching is ready for all platforms. |
| `src/store/useAppStore.ts` | Manages the handoff, ignores unchanged selections until explicit retry, surfaces launcher errors, and keeps demo simulation separate from live confirmation. |
| `src/pages/AccountsPage.tsx` | Uses **Select & Open Launcher** and **Sign In Again**, renders the relevant client steps, and labels preferred, selected and user-confirmed profiles independently from authentication status. |
| `src/pages/GameDetailsPage.tsx` | Routes the existing associated-account action to the Accounts workflow and requires independent identity evidence for the account-mismatch advisory. |
| `tests/phase6AccountManagement.test.ts` | Keeps account CRUD, migrations, capability and association coverage. Removes obsolete tests that treated cached Steam login data as live evidence. |
| `tests/phase6IntelligentAccountSwitching.test.ts` | Exercises the service with mock launchers and temporary SQLite, including migration, restart, cancellation, stale confirmations and launcher failure. Also mocks process creation to verify the argument-free Windows adapter. |
| `tests/phase6AccountConfirmation.test.tsx` | Exercises the real page and Zustand actions against a mocked preload bridge backed by the account service, with an injected launcher. Covers the Riot handoff, cancellation, errors, Steam guidance and the evidence gate. |
| `MASWITCH_REAL_ACCOUNT_SWITCHING_REPORT.md` | Records research, verification results and manual validation steps. |

## E. Functional tests

| Command | Result |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0. Renderer and Electron TypeScript checks passed. |
| `npm.cmd run lint` | Exit 0. ESLint passed. |
| `npm.cmd test` | Exit 0. 16/16 files and 122/122 tests passed, including 28 account tests. |
| `npm.cmd run build` | Exit 0. Vite renderer, Electron main and bundled preload built successfully. |

Vite reported its CJS API deprecation and a renderer chunk above 500 kB. The existing app-navigation test emitted a React `act` warning.

All launcher invocations in account tests use mocks. The Steam VDF fixture lives in a temporary test directory. The renderer test supplies synthetic evidence to exercise the verified badge. There is no production provider for that evidence. The tests cover A and B selection, client handoffs for all eight platforms, unchanged selection and explicit retry, unverified manual sign-in, cancellation, stale or duplicate confirmation, restart, legacy migration, account preservation, missing and failing launchers, and the Windows adapter’s spawn acknowledgement. They do not demonstrate a real publisher sign-in or account switch.

The first full run hit Windows sandbox `EPERM` on file renames under the default temp path, which affected SQLite recovery and two mocked artwork tests. The verification run sets `TEMP` and `TMP` to a writable workspace cache and uses the existing dependencies. No game, gaming launcher or Electron application was started during verification. No game files or artwork were downloaded. A Windows Python launcher command reported a Python install-manager self-update before it was stopped. Subsequent edit commands used the existing Python 3.12 executable directly.

## F. Remaining limitations

- Opening the launcher confirms Windows accepted the process launch. The launcher still controls whether it shows a window, goes to the foreground, asks for an update, or displays sign-in. Discovery uses known install paths, the Riot Start Menu fallback and the local Discord desktop install layout. Other custom installations can require opening the client from Windows.
- The eight production integrations do not expose a supported source of current desktop identity to MaSwitch. **Authentication Unknown** therefore applies even after **User-Confirmed Profile**. Historical switch records remain in their existing table, and a new successful record means the user’s sign-in report was saved.
- Cancelling clears MaSwitch’s pending confirmation and keeps **Last Selected Profile**. It cannot undo actions taken in the launcher. Restart also discards pending requests.
- Steam and Discord can reuse remembered accounts through their own interfaces. Riot sign-in and all publisher authentication prompts remain in the client. No actual launcher interaction was used to verify client UI details.

## G. Manual validation

1. To validate the Windows handoff with zero download traffic, disconnect the PC from the internet first. Open MaSwitch, go to **Accounts**, select Riot Games and choose **Select & Open Launcher** on **LOL EUW**. If Riot Client is already open and stays in the background, select its taskbar or tray icon. Leave **Play**, **Install** and **Update** untouched.
2. In MaSwitch, check for **Last Selected Profile** on **LOL EUW**. If the client needs a network connection, cancel the handoff. Check that cancellation leaves the selection and does not create a user confirmation. Select **LOL EUWN** and repeat. The preferred star should stay where you set it.
3. Restart MaSwitch. Check that both profiles and the last selection remain. Choose **Sign In Again** only when you want another launcher handoff. If the client cannot be located or started, MaSwitch should show an error without a confirmation button.
4. To validate actual sign-in, repeat on a connection where you can accept publisher background patching. If you need zero download traffic, stop after the offline handoff checks. Riot documents that a running Riot Client can patch games in the background even when you never click **Play**. Leave launcher update settings as they are. [Riot background patching](https://support.riotgames.com/en-us/valorant/support-tools/background-patching)
5. In Riot Client, sign out if it shows the other account. Sign in with the target account’s Riot login username or linked sign-in option, complete any MFA, and check the account shown in the client. Return to MaSwitch and click **I've Signed In** only after that check. Confirm that **User-Confirmed Profile** appears alongside **Authentication Unknown**. Repeat in the other direction without opening a game.

