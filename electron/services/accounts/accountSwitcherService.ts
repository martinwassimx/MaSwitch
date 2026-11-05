import { SteamRememberedSelection, windowsSteamPreferences } from './steamRememberedSelection';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AccountProfile,
  AccountSwitchResult,
  ActivePlatformProfile,
  PlatformCapabilities,
  PlatformLauncherStatus,
} from '../../../src/shared/types/account';
import { LAUNCHER_DISPLAY_NAMES } from '../../../src/shared/types/account';
import type { PlatformId } from '../../../src/shared/types/platform';
import type { MaSwitchSqliteDatabase } from '../database/sqliteDatabase';

export const PLATFORM_CAPABILITIES: Record<PlatformId, PlatformCapabilities> = {
  steam: {
    selectionCapability: 'automatic-remembered-account',
    authenticationStatus: 'unknown',
    platformId: 'steam',
    platformName: 'Steam',
    canOpenLauncher: true,
    canDetectInstalled: true,
    canDetectRunning: true,
    canDetectActiveAccount: false,
    supportedSwitchingMethod: 'steam-account-selection',
    switchingMethodName: 'Steam Native Account Switcher',
    switchingMethodDescription:
      'Experimental remembered-account selection requires Steam to be closed and the saved Steam login name or SteamID64. Steam may still request sign-in.',
    requiresManualSignIn: false,
    securityNote:
      'Steam handles account selection and authentication in its own client.',
  },
  epic: {
    selectionCapability: 'manual-sign-in',
    authenticationStatus: 'unknown',
    platformId: 'epic',
    platformName: 'Epic Games',
    canOpenLauncher: true,
    canDetectInstalled: true,
    canDetectRunning: true,
    canDetectActiveAccount: false,
    supportedSwitchingMethod: 'manual-launcher-sign-in',
    switchingMethodName: 'Epic Games Launcher Sign-Out / Sign-In',
    switchingMethodDescription:
      'Opens Epic Games Launcher to sign out and log in with your selected account.',
    requiresManualSignIn: true,
    securityNote:
      'Never intercepts Epic browser cookies, tokens, or 2FA credentials.',
  },
  riot: {
    selectionCapability: 'manual-sign-in',
    authenticationStatus: 'unknown',
    platformId: 'riot',
    platformName: 'Riot Games',
    canOpenLauncher: true,
    canDetectInstalled: true,
    canDetectRunning: true,
    canDetectActiveAccount: false,
    supportedSwitchingMethod: 'manual-launcher-sign-in',
    switchingMethodName: 'Riot Client Sign-In',
    switchingMethodDescription:
      'Opens Riot Client for sign-in. Your Riot login username may differ from the saved Riot ID.',
    requiresManualSignIn: true,
    securityNote:
      'Riot Client handles sign-in and any verification prompts.',
  },
  ea: {
    selectionCapability: 'manual-sign-in',
    authenticationStatus: 'unknown',
    platformId: 'ea',
    platformName: 'EA App',
    canOpenLauncher: true,
    canDetectInstalled: true,
    canDetectRunning: true,
    canDetectActiveAccount: false,
    supportedSwitchingMethod: 'manual-launcher-sign-in',
    switchingMethodName: 'EA Desktop Sign-In / Account Switch',
    switchingMethodDescription:
      'Launches EA Desktop to sign out and authenticate into the desired EA account profile.',
    requiresManualSignIn: true,
    securityNote:
      'Zero password or credential interception. Uses legitimate EA launcher process.',
  },
  ubisoft: {
    selectionCapability: 'manual-sign-in',
    authenticationStatus: 'unknown',
    platformId: 'ubisoft',
    platformName: 'Ubisoft Connect',
    canOpenLauncher: true,
    canDetectInstalled: true,
    canDetectRunning: true,
    canDetectActiveAccount: false,
    supportedSwitchingMethod: 'manual-launcher-sign-in',
    switchingMethodName: 'Ubisoft Connect Account Switch',
    switchingMethodDescription:
      'Opens Ubisoft Connect to log in with your selected Ubisoft profile.',
    requiresManualSignIn: true,
    securityNote: 'Direct official Ubisoft Connect sign-in flow.',
  },
  rockstar: {
    selectionCapability: 'manual-sign-in',
    authenticationStatus: 'unknown',
    platformId: 'rockstar',
    platformName: 'Rockstar Games',
    canOpenLauncher: true,
    canDetectInstalled: true,
    canDetectRunning: true,
    canDetectActiveAccount: false,
    supportedSwitchingMethod: 'manual-launcher-sign-in',
    switchingMethodName: 'Rockstar Games Launcher Sign-In',
    switchingMethodDescription:
      'Opens Rockstar Games Launcher to switch active Social Club profile.',
    requiresManualSignIn: true,
    securityNote: 'Rockstar Games Launcher handles sign-in.',
  },
  gog: {
    selectionCapability: 'manual-sign-in',
    authenticationStatus: 'unknown',
    platformId: 'gog',
    platformName: 'GOG Galaxy',
    canOpenLauncher: true,
    canDetectInstalled: true,
    canDetectRunning: true,
    canDetectActiveAccount: false,
    supportedSwitchingMethod: 'manual-launcher-sign-in',
    switchingMethodName: 'GOG Galaxy Log In / Log Out',
    switchingMethodDescription:
      'Opens GOG Galaxy client to switch active user account.',
    requiresManualSignIn: true,
    securityNote: 'Direct GOG Galaxy client authentication.',
  },
  discord: {
    selectionCapability: 'native-account-chooser',
    authenticationStatus: 'unknown',
    platformId: 'discord',
    platformName: 'Discord',
    canOpenLauncher: true,
    canDetectInstalled: true,
    canDetectRunning: true,
    canDetectActiveAccount: false,
    supportedSwitchingMethod: 'client-account-switcher',
    switchingMethodName: 'Discord Multi-Account Switcher',
    switchingMethodDescription:
      'Opens Discord. Choose Switch Accounts from your avatar to use a saved account or add one.',
    requiresManualSignIn: false,
    securityNote: 'Utilizes Discord built-in account switching feature.',
  },
  custom: {
    selectionCapability: 'unsupported',
    authenticationStatus: 'unknown',
    platformId: 'custom',
    platformName: 'Custom PC Game',
    canOpenLauncher: false,
    canDetectInstalled: true,
    canDetectRunning: true,
    canDetectActiveAccount: false,
    supportedSwitchingMethod: 'unsupported',
    switchingMethodName: 'Standalone Application (No Shared Launcher)',
    switchingMethodDescription:
      'Custom PC games manage user profiles internally within their game save files.',
    requiresManualSignIn: false,
    securityNote: 'No shared authentication infrastructure.',
  },
};

export interface LauncherPathConfig {
  standardPaths: string[];
  processNames: string[];
}

export const LAUNCHER_CONFIGS: Record<PlatformId, LauncherPathConfig> = {
  steam: {
    standardPaths: [
      path.join(
        process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
        'Steam',
        'steam.exe'
      ),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Steam', 'steam.exe'),
      'D:\\SteamLibrary\\steam.exe',
      'D:\\Steam\\steam.exe',
    ],
    processNames: ['steam.exe'],
  },
  epic: {
    standardPaths: [
      path.join(
        process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
        'Epic Games',
        'Launcher',
        'Portal',
        'Binaries',
        'Win64',
        'EpicGamesLauncher.exe'
      ),
      path.join(
        process.env.ProgramFiles || 'C:\\Program Files',
        'Epic Games',
        'Launcher',
        'Portal',
        'Binaries',
        'Win64',
        'EpicGamesLauncher.exe'
      ),
    ],
    processNames: ['epicgameslauncher.exe'],
  },
  riot: {
    standardPaths: [
      path.join('C:', 'Riot Games', 'Riot Client', 'RiotClientServices.exe'),
      path.join('D:', 'Riot Games', 'Riot Client', 'RiotClientServices.exe'),
    ],
    processNames: [
      'riotclientservices.exe',
      'riotclientux.exe',
      'riotclientuxrender.exe',
      'leagueclient.exe',
      'leagueclientux.exe',
      'league of legends.exe',
      'valorant.exe',
      'valorant-win64-shipping.exe',
    ],
  },
  ea: {
    standardPaths: [
      path.join(
        process.env.ProgramFiles || 'C:\\Program Files',
        'Electronic Arts',
        'EA Desktop',
        'EA Desktop',
        'EADesktop.exe'
      ),
      path.join(
        process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
        'Electronic Arts',
        'EA Desktop',
        'EA Desktop',
        'EADesktop.exe'
      ),
    ],
    processNames: ['eadesktop.exe'],
  },
  ubisoft: {
    standardPaths: [
      path.join(
        process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
        'Ubisoft',
        'Ubisoft Game Launcher',
        'upc.exe'
      ),
      path.join(
        process.env.ProgramFiles || 'C:\\Program Files',
        'Ubisoft',
        'Ubisoft Game Launcher',
        'upc.exe'
      ),
    ],
    processNames: ['upc.exe'],
  },
  rockstar: {
    standardPaths: [
      path.join(
        process.env.ProgramFiles || 'C:\\Program Files',
        'Rockstar Games',
        'Launcher',
        'Launcher.exe'
      ),
      path.join(
        process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
        'Rockstar Games',
        'Launcher',
        'Launcher.exe'
      ),
    ],
    processNames: ['launcher.exe', 'rockstargameslauncher.exe'],
  },
  gog: {
    standardPaths: [
      path.join(
        process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
        'GOG Galaxy',
        'GalaxyClient.exe'
      ),
      path.join(
        process.env.ProgramFiles || 'C:\\Program Files',
        'GOG Galaxy',
        'GalaxyClient.exe'
      ),
    ],
    processNames: ['galaxyclient.exe'],
  },
  discord: {
    standardPaths: [],
    processNames: ['discord.exe'],
  },
  custom: {
    standardPaths: [],
    processNames: [],
  },
};

export interface AccountLauncherAdapter {
  resolveLauncher(platformId: PlatformId): string | null;
  openLauncher(executable: string): Promise<void>;
  selectRememberedAccount?(executable: string, identifier: string): Promise<void>;
}

function resolveLauncher(
  platformId: PlatformId,
  readShortcutTarget: (shortcut: string) => string
): string | null {
  if (process.platform !== 'win32') return null;

  if (platformId === 'discord' && process.env.LOCALAPPDATA) {
    const discordDir = path.join(process.env.LOCALAPPDATA, 'Discord');
    if (!fs.existsSync(discordDir)) return null;
    const versions = fs.readdirSync(discordDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^app-\d+(\.\d+)+$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
    return versions.map((version) => path.join(discordDir, version, 'Discord.exe'))
      .find((candidate) => fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) ?? null;
  }

  // Check official RiotClientInstalls.json manifest first for Riot
  if (platformId === 'riot') {
    const installsJson = path.join(
      process.env.ALLUSERSPROFILE || process.env.ProgramData || 'C:\\ProgramData',
      'Riot Games',
      'RiotClientInstalls.json'
    );
    if (fs.existsSync(installsJson)) {
      try {
        const raw = fs.readFileSync(installsJson, 'utf8');
        const parsed = JSON.parse(raw) as { rc_live?: string; rc_default?: string };
        const candidate = parsed.rc_live || parsed.rc_default;
        if (typeof candidate === 'string' && fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
          return candidate;
        }
      } catch {
        // ignore parse error and proceed to standard paths
      }
    }
  }

  const installed = LAUNCHER_CONFIGS[platformId].standardPaths.find((candidate) =>
    fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()
  );
  if (installed || platformId !== 'riot') return installed ?? null;

  for (const root of [process.env.APPDATA, process.env.ProgramData]) {
    if (!root) continue;
    const programs = path.join(root, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    for (const shortcut of ['Riot Client.lnk', path.join('Riot Games', 'Riot Client.lnk')]) {
      const shortcutPath = path.join(programs, shortcut);
      if (!fs.existsSync(shortcutPath)) continue;
      try {
        const target = readShortcutTarget(shortcutPath);
        if (path.isAbsolute(target) && path.basename(target).toLowerCase() === 'riotclientservices.exe' &&
            fs.statSync(target, { throwIfNoEntry: false })?.isFile()) {
          return target;
        }
      } catch {
        // An unreadable or stale shortcut does not rule out other locations.
      }
    }
  }
  return null;
}

export function createWindowsAccountLauncherAdapter(
  readShortcutTarget: (shortcut: string) => string,
  backupPath?: string
): AccountLauncherAdapter {
  const adapter: AccountLauncherAdapter = {
    resolveLauncher: (platformId) => resolveLauncher(platformId, readShortcutTarget),
    openLauncher: (executable) => new Promise((resolve, reject) => {
      const child = spawn(executable, [], {
        cwd: path.dirname(executable),
        detached: true,
        stdio: 'ignore',
      });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    }),
  };
  if (backupPath) {
    const selector = new SteamRememberedSelection(windowsSteamPreferences(), backupPath);
    adapter.selectRememberedAccount = (executable, identifier) =>
      selector.select(executable, identifier, () => adapter.openLauncher(executable));
  }
  return adapter;
}

const CLIENT_ACCOUNT_STEPS: Record<Exclude<PlatformId, 'custom'>, string[]> = {
  riot: [
    'In Riot Client, sign out if a different account is signed in. Sign in to the selected account and follow any prompts.',
    'Use your Riot login username or a linked sign-in option. The saved Riot ID can differ from the login username.',
  ],
  steam: ['In Steam, use the startup account chooser or select Change Account. Choose the saved account or sign in.'],
  discord: ['Select your avatar, then Switch Accounts. Choose the saved account or add it and sign in.'],
  epic: ['If another account is signed in, choose Sign Out from the launcher menu or profile settings. Sign in to the selected account.'],
  ea: ['Open the menu in the upper left and choose Sign out if needed. Sign in to the selected account in the EA app.'],
  ubisoft: ['Log out of the other account in Ubisoft Connect PC if needed, then sign in to the selected account.'],
  rockstar: ['If needed, open the player menu in the upper right and choose Sign Out. Sign in to the selected account.'],
  gog: ['Sign in to the selected account in GOG Galaxy. Sign out first if a different account is signed in.'],
};

export class AccountSwitcherService {
  private pendingSwitch: { id: string; profile: AccountProfile; fromAccountId: string | null } | null = null;
  private openingForSwitch = false;

  constructor(
    private readonly db: MaSwitchSqliteDatabase,
    private readonly launcher: AccountLauncherAdapter
  ) {}

  public getCapabilities(): Record<PlatformId, PlatformCapabilities> {
    return { ...PLATFORM_CAPABILITIES };
  }

  public getRiotProcessDetails(runningNames = new Set<string>()): {
    isClientRunning: boolean;
    isGameRunning: boolean;
    runningProcesses: string[];
  } {
    const clientProcesses = ['riotclientservices.exe', 'riotclientux.exe', 'riotclientuxrender.exe'];
    const gameProcesses = [
      'leagueclient.exe',
      'leagueclientux.exe',
      'league of legends.exe',
      'valorant.exe',
      'valorant-win64-shipping.exe',
    ];
    const detectedClient = clientProcesses.filter((name) => runningNames.has(name));
    const detectedGame = gameProcesses.filter((name) => runningNames.has(name));
    return {
      isClientRunning: detectedClient.length > 0,
      isGameRunning: detectedGame.length > 0,
      runningProcesses: [...detectedClient, ...detectedGame],
    };
  }

  public getPlatformLauncherStatuses(
    runningNames = new Set<string>()
  ): Record<PlatformId, PlatformLauncherStatus> {
    const statuses = {} as Record<PlatformId, PlatformLauncherStatus>;
    const nowIso = new Date().toISOString();
    for (const platformId of Object.keys(LAUNCHER_CONFIGS) as PlatformId[]) {
      const installPath = this.findLauncher(platformId);
      statuses[platformId] = {
        platformId,
        isInstalled: installPath !== null,
        isRunning: LAUNCHER_CONFIGS[platformId].processNames.some((name) => runningNames.has(name)),
        installPath,
        lastCheckedAtIso: nowIso,
      };
    }
    return statuses;
  }

  public getActivePlatformProfiles(): Record<PlatformId, ActivePlatformProfile> {
    return this.db.getActivePlatformProfiles();
  }

  public clearActivePlatformProfile(platformId: PlatformId): void {
    this.db.clearActiveProfileForPlatform(platformId);
  }

  public async switchAccount(profile: AccountProfile, forceReauth = false): Promise<AccountSwitchResult> {
    const caps = PLATFORM_CAPABILITIES[profile.platformId];
    const base = {
      accountId: profile.id,
      platformId: profile.platformId,
      methodUsed: caps.switchingMethodName,
      launcherStarted: false,
      verificationStatus: 'unverified' as const,
    };

    if (profile.platformId === 'custom' || this.openingForSwitch) {
      return {
        ...base,
        success: false,
        message: this.openingForSwitch
          ? 'MaSwitch is already opening a launcher for another request.'
          : 'This profile has no standalone launcher.',
      };
    }

    if (this.db.getAccountProfileById(profile.id)?.isLastSelected && !forceReauth) {
      return {
        ...base,
        success: true,
        isAlreadySelected: true,
        message: `"${profile.displayName}" is already selected in MaSwitch.`,
      };
    }

    this.openingForSwitch = true;
    this.pendingSwitch = null;
    try {
      const previouslyConfirmed = this.db.getActiveProfileForPlatform(profile.platformId);
      const fromAccountId = previouslyConfirmed?.accountId !== profile.id
        ? previouslyConfirmed?.accountId ?? null
        : null;
      this.db.selectAccountProfile(profile.id, profile.platformId);

      const remembered = profile.platformId === 'steam' && this.launcher.selectRememberedAccount;
      let open: { success: boolean; message: string };
      if (remembered) {
        const executable = this.findLauncher('steam');
        if (!executable) return { ...base, success: false, message: 'Steam launcher is unavailable.' };
        try {
          await remembered(executable, profile.username);
          open = { success: true, message: 'Remembered Steam account preference applied. Authentication remains unknown.' };
        } catch (error) {
          return { ...base, success: false, message: error instanceof Error ? error.message : 'Steam account selection failed.' };
        }
      } else {
        open = await this.openPlatformLauncher(profile.platformId);
      }
      if (!open.success) return { ...base, success: false, message: open.message };

      const launcherName = LAUNCHER_DISPLAY_NAMES[profile.platformId];
      const switchId = randomUUID();
      this.pendingSwitch = { id: switchId, profile, fromAccountId };
      return {
        ...base,
        success: true,
        switchId,
        fromAccountId,
        launcherStarted: true,
        verificationStatus: 'manual-confirmation-needed',
        message: remembered ? open.message : `Requested opening ${launcherName} for "${profile.displayName}". Complete the account change in the client.`,
        instructions: (profile.platformId === 'riot' && fromAccountId)
          ? [
              `If Riot Client is currently signed in as "${this.db.getAccountProfileById(fromAccountId)?.displayName ?? 'previous account'}", sign out of that account in the client first.`,
              ...CLIENT_ACCOUNT_STEPS.riot,
            ]
          : (remembered ? ['Check the account shown in Steam. Steam may still require sign-in or display its chooser.'] : CLIENT_ACCOUNT_STEPS[profile.platformId]),
        pendingConfirmation: true,
      };
    } finally {
      this.openingForSwitch = false;
    }
  }

  public cancelAccountSwitch(switchId: string): void {
    if (this.pendingSwitch?.id === switchId) this.pendingSwitch = null;
  }

  public confirmAccountSwitch(accountId: string, switchId: string) {
    const pending = this.pendingSwitch;
    if (!pending || pending.id !== switchId || pending.profile.id !== accountId) {
      throw new Error('There is no matching sign-in request to confirm.');
    }

    const profile = this.db.getAccountProfileById(accountId);
    if (!profile || profile.username !== pending.profile.username || !profile.isLastSelected) {
      this.pendingSwitch = null;
      throw new Error('The selected profile changed. Start a new sign-in request.');
    }

    const { platformId } = profile;
    const lastUsedAt = this.db.recordAccountSwitch(
      profile.id,
      platformId,
      PLATFORM_CAPABILITIES[platformId].switchingMethodName,
      true,
      'User reported signing in through the launcher.',
      pending.fromAccountId
    );
    this.pendingSwitch = null;

    return {
      success: true,
      accountId,
      platformId,
      verificationStatus: 'user-confirmed' as const,
      lastUsedAt,
      message: `Sign-in for "${profile.displayName}" recorded as user-confirmed. Launcher authentication is unknown.`,
    };
  }

  public async openPlatformLauncher(platformId: PlatformId): Promise<{
    success: boolean;
    message: string;
  }> {
    const caps = PLATFORM_CAPABILITIES[platformId];
    if (!Object.hasOwn(PLATFORM_CAPABILITIES, platformId) || !caps.canOpenLauncher) {
      return { success: false, message: 'No standalone launcher is available for this platform.' };
    }

    const launcherName = LAUNCHER_DISPLAY_NAMES[platformId];
    const executable = this.findLauncher(platformId);
    if (!executable) {
      return { success: false, message: `MaSwitch could not locate ${launcherName}.` };
    }

    try {
      await this.launcher.openLauncher(executable);
      return { success: true, message: `Requested opening ${launcherName}.` };
    } catch {
      return { success: false, message: `MaSwitch could not open ${launcherName}. Try opening it from Windows.` };
    }
  }

  private findLauncher(platformId: PlatformId): string | null {
    try {
      return this.launcher.resolveLauncher(platformId);
    } catch {
      return null;
    }
  }
}

