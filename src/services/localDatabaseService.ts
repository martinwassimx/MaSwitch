import type { CustomGameInput, EditGameInput, GameItem } from '../shared/types/game';
import type { PlatformDetectionReport, PlatformId } from '../shared/types/platform';
import type { ScanResultSummary } from '../shared/types/scanner';
import type {
  RiotDesktopLoginProgressPayload,
  RiotDesktopLoginResultPayload,
} from '../shared/types/ipc';
import type {
  AccountProfile,
  AccountSwitchHistoryRecord,
  AccountSwitchResult,
  ActivePlatformProfile,
  CreateAccountProfileInput,
  GameAccountAssociation,
  PlatformCapabilities as AccountPlatformCapabilities,
  PlatformLauncherStatus,
  UpdateAccountProfileInput,
  RiotAccountEnrollmentResult,
  RiotLiveSwitchResult,
  RiotRecoveryResult,
} from '../shared/types/account';
import type {
  ApplyArtworkInput,
  ArtworkSyncProgress,
  SteamGridDbArtworkBundle,
  SteamGridDbGame,
  SteamGridDbStatus,
} from '../shared/types/steamgriddb';
import {
  DEFAULT_SETTINGS,
  type AppRuntimeInfo,
  type MaSwitchSettings,
  type WindowsStartupState,
} from '../shared/types/settings';
import type {
  PlaytimeTrackerStatus,
  StatisticsOverview,
} from '../shared/types/statistics';
import { sanitizeSettings } from '../shared/validation/settingsValidator';

const LOCAL_STORAGE_KEY = 'maswitch.settings.v1';

export class LocalDatabaseService {
  public readCachedSettings(): MaSwitchSettings {
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) {
        return sanitizeSettings(DEFAULT_SETTINGS);
      }
      const parsed = JSON.parse(raw) as unknown;
      return sanitizeSettings(parsed, DEFAULT_SETTINGS);
    } catch {
      return sanitizeSettings(DEFAULT_SETTINGS);
    }
  }

  public writeCachedSettings(settings: MaSwitchSettings): void {
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage quota errors
    }
  }

  public async loadSettings(): Promise<MaSwitchSettings> {
    const cached = this.readCachedSettings();
    if (window.maswitch?.settings) {
      try {
        const diskSettings = await window.maswitch.settings.load();
        const sanitized = sanitizeSettings(diskSettings, cached);
        this.writeCachedSettings(sanitized);
        return sanitized;
      } catch {
        return cached;
      }
    }
    return cached;
  }

  public async saveSettings(
    partial: Partial<MaSwitchSettings>,
    current: MaSwitchSettings
  ): Promise<MaSwitchSettings> {
    const optimistic = sanitizeSettings({ ...current, ...partial }, current);
    this.writeCachedSettings(optimistic);

    if (window.maswitch?.settings) {
      try {
        const persisted = await window.maswitch.settings.save(optimistic);
        const sanitized = sanitizeSettings(persisted, optimistic);
        this.writeCachedSettings(sanitized);
        return sanitized;
      } catch {
        return optimistic;
      }
    }
    return optimistic;
  }

  public async resetSettings(): Promise<MaSwitchSettings> {
    const defaults = sanitizeSettings(DEFAULT_SETTINGS);
    this.writeCachedSettings(defaults);

    if (window.maswitch?.settings) {
      try {
        const persisted = await window.maswitch.settings.reset();
        const sanitized = sanitizeSettings(persisted, defaults);
        this.writeCachedSettings(sanitized);
        return sanitized;
      } catch {
        return defaults;
      }
    }
    return defaults;
  }

  public async getRuntimeInfo(): Promise<AppRuntimeInfo> {
    if (window.maswitch?.app) {
      try {
        return await window.maswitch.app.getRuntimeInfo();
      } catch {
        // Fallback below
      }
    }
    return {
      appName: 'MaSwitch',
      appVersion: '0.2.0',
      phaseLabel: 'Phase 2 — Real Windows Gaming Engine',
      electronVersion: '33.x',
      chromeVersion: '130.x',
      nodeVersion: '22.x',
      platform: 'win32',
      arch: 'x64',
      isPackaged: false,
    };
  }

  public async getRealLibraryGames(): Promise<GameItem[]> {
    if (window.maswitch?.library) {
      try {
        return await window.maswitch.library.getGames();
      } catch {
        return [];
      }
    }
    return [];
  }

  public async addCustomGame(input: CustomGameInput): Promise<GameItem | null> {
    if (window.maswitch?.library) {
      return window.maswitch.library.addCustomGame(input);
    }
    return null;
  }

  public async updateGame(
    gameId: string,
    input: EditGameInput
  ): Promise<GameItem | null> {
    if (window.maswitch?.library) {
      return window.maswitch.library.updateGame(gameId, input);
    }
    return null;
  }

  public async removeGameFromLibrary(gameId: string): Promise<boolean> {
    if (window.maswitch?.library) {
      return window.maswitch.library.removeGame(gameId);
    }
    return false;
  }

  public async restoreGameToLibrary(gameId: string): Promise<boolean> {
    if (window.maswitch?.library) {
      return window.maswitch.library.restoreGame(gameId);
    }
    return false;
  }

  public async getRemovedGames(): Promise<GameItem[]> {
    if (window.maswitch?.library) {
      return window.maswitch.library.getRemovedGames();
    }
    return [];
  }

  public async toggleFavoriteInDb(
    gameId: string
  ): Promise<string[] | null> {
    if (window.maswitch?.library) {
      try {
        const res = await window.maswitch.library.toggleFavorite(gameId);
        return res.favoriteGameIds;
      } catch {
        return null;
      }
    }
    return null;
  }

  public async selectExecutableDialog(): Promise<string | null> {
    if (window.maswitch?.library) {
      return window.maswitch.library.selectExecutableDialog();
    }
    return null;
  }

  public async selectFolderDialog(): Promise<string | null> {
    if (window.maswitch?.library) {
      return window.maswitch.library.selectFolderDialog();
    }
    return null;
  }

  public async startInstalledGameScan(options?: {
    customFolders?: string[];
    includeRegistry?: boolean;
  }): Promise<ScanResultSummary | null> {
    if (window.maswitch?.scanner) {
      return window.maswitch.scanner.startScan(options);
    }
    return null;
  }

  public async cancelInstalledGameScan(): Promise<boolean> {
    if (window.maswitch?.scanner) {
      return window.maswitch.scanner.cancelScan();
    }
    return false;
  }

  public async getScanHistory(): Promise<ScanResultSummary[]> {
    if (window.maswitch?.scanner) {
      try {
        return await window.maswitch.scanner.getHistory();
      } catch {
        return [];
      }
    }
    return [];
  }

  public async getPlatformDetectionReports(): Promise<
    PlatformDetectionReport[]
  > {
    if (window.maswitch?.scanner) {
      try {
        return await window.maswitch.scanner.getPlatformReports();
      } catch {
        return [];
      }
    }
    return [];
  }

  public async getRealStatistics(): Promise<StatisticsOverview> {
    if (window.maswitch?.tracker) {
      try {
        return await window.maswitch.tracker.getStatistics();
      } catch {
        // Fallback below
      }
    }
    return {
      totalGamingHours: 0,
      todayHours: 0,
      thisWeekHours: 0,
      thisMonthHours: 0,
      totalSessionsCount: 0,
      activeDaysLast30: 0,
      averageSessionHours: 0,
      completionAveragePercent: 0,
      currentStreakDays: 0,
      weeklyActivity: [],
      monthlyActivity: [],
      platformBreakdown: [],
      genreBreakdown: [],
      recentSessions: [],
      isDemoData: false,
    };
  }

  public async getTrackerStatus(): Promise<PlaytimeTrackerStatus> {
    if (window.maswitch?.tracker) {
      try {
        return await window.maswitch.tracker.getStatus();
      } catch {
        // Fallback below
      }
    }
    return {
      enabled: true,
      paused: false,
      activeSessions: [],
    };
  }

  public async setTrackerPaused(paused: boolean): Promise<PlaytimeTrackerStatus> {
    if (window.maswitch?.tracker) {
      return window.maswitch.tracker.setPaused(paused);
    }
    return {
      enabled: true,
      paused,
      activeSessions: [],
    };
  }

  public async getWindowsStartupState(): Promise<WindowsStartupState> {
    if (window.maswitch?.startup) {
      try {
        return await window.maswitch.startup.getState();
      } catch {
        // Fallback below
      }
    }
    return {
      openAtLogin: false,
      startMinimized: false,
      osOpenAtLoginActive: false,
      supported: true,
    };
  }

  public async setWindowsStartupConfiguration(config: {
    openAtLogin: boolean;
    startMinimized: boolean;
  }): Promise<WindowsStartupState> {
    if (window.maswitch?.startup) {
      return window.maswitch.startup.setConfiguration(config);
    }
    return {
      openAtLogin: config.openAtLogin,
      startMinimized: config.startMinimized,
      osOpenAtLoginActive: config.openAtLogin,
      supported: true,
    };
  }

  // SteamGridDB Integration
  public async saveSteamGridDbApiKey(
    apiKey: string
  ): Promise<{ success: boolean; message: string }> {
    if (window.maswitch?.steamGridDb) {
      return window.maswitch.steamGridDb.saveApiKey(apiKey);
    }
    return {
      success: false,
      message: 'Electron SteamGridDB bridge is not available.',
    };
  }

  public async removeSteamGridDbApiKey(): Promise<boolean> {
    if (window.maswitch?.steamGridDb) {
      return window.maswitch.steamGridDb.removeApiKey();
    }
    return false;
  }

  public async getSteamGridDbStatus(): Promise<SteamGridDbStatus> {
    if (window.maswitch?.steamGridDb) {
      try {
        return await window.maswitch.steamGridDb.getStatus();
      } catch {
        // Fallback below
      }
    }
    return {
      isConfigured: false,
      isValid: null,
      statusText: 'not-configured',
      lastCheckedIso: null,
    };
  }

  public async testSteamGridDbConnection(
    apiKey?: string
  ): Promise<{ success: boolean; message: string }> {
    if (window.maswitch?.steamGridDb) {
      return window.maswitch.steamGridDb.testConnection(apiKey);
    }
    return {
      success: false,
      message: 'SteamGridDB service bridge unavailable.',
    };
  }

  public async searchSteamGridDbGames(query: string): Promise<SteamGridDbGame[]> {
    if (window.maswitch?.steamGridDb) {
      try {
        return await window.maswitch.steamGridDb.searchGames(query);
      } catch {
        return [];
      }
    }
    return [];
  }

  public async getSteamGridDbArtwork(
    sgdbGameId: number,
    gameName?: string
  ): Promise<SteamGridDbArtworkBundle> {
    if (window.maswitch?.steamGridDb) {
      try {
        return await window.maswitch.steamGridDb.getGameArtwork(sgdbGameId, gameName);
      } catch {
        // Fallback below
      }
    }
    return {
      gameId: sgdbGameId,
      gameName: gameName || '',
      grids: [],
      heroes: [],
      logos: [],
      icons: [],
    };
  }

  public async applySteamGridDbArtwork(
    input: ApplyArtworkInput
  ): Promise<GameItem | null> {
    if (window.maswitch?.steamGridDb) {
      return window.maswitch.steamGridDb.applyArtwork(input);
    }
    return null;
  }

  public async restoreSteamGridDbDefaultArtwork(
    gameId: string
  ): Promise<GameItem | null> {
    if (window.maswitch?.steamGridDb) {
      return window.maswitch.steamGridDb.restoreDefaultArtwork(gameId);
    }
    return null;
  }

  public async syncSteamGridDbLibraryArtwork(): Promise<ArtworkSyncProgress> {
    if (window.maswitch?.steamGridDb) {
      return window.maswitch.steamGridDb.syncLibraryArtwork();
    }
    return {
      totalGames: 0,
      processedGames: 0,
      successCount: 0,
      unmatchedCount: 0,
      failedCount: 0,
      status: 'error',
    };
  }

  public onSteamGridDbSyncProgress(
    callback: (progress: ArtworkSyncProgress) => void
  ): () => void {
    if (window.maswitch?.steamGridDb) {
      return window.maswitch.steamGridDb.onSyncProgress(callback);
    }
    return () => {};
  }

  // ==========================================
  // Phase 6: Multi-Account Management & Switching
  // ==========================================

  public async getAccountProfiles(platformId?: PlatformId): Promise<AccountProfile[]> {
    if (window.maswitch?.accounts) {
      try {
        return await window.maswitch.accounts.getProfiles(platformId);
      } catch {
        return [];
      }
    }
    return [];
  }

  public async createAccountProfile(
    input: CreateAccountProfileInput
  ): Promise<AccountProfile | null> {
    if (window.maswitch?.accounts) {
      try {
        return await window.maswitch.accounts.createProfile(input);
      } catch {
        return null;
      }
    }
    return null;
  }

  public async updateAccountProfile(
    id: string,
    input: UpdateAccountProfileInput
  ): Promise<AccountProfile | null> {
    if (window.maswitch?.accounts) {
      try {
        return await window.maswitch.accounts.updateProfile(id, input);
      } catch {
        return null;
      }
    }
    return null;
  }

  public async deleteAccountProfile(id: string): Promise<boolean> {
    if (window.maswitch?.accounts) {
      try {
        return await window.maswitch.accounts.deleteProfile(id);
      } catch {
        return false;
      }
    }
    return false;
  }

  public async setPreferredAccount(id: string): Promise<boolean> {
    if (window.maswitch?.accounts) {
      try {
        return await window.maswitch.accounts.setPreferred(id);
      } catch {
        return false;
      }
    }
    return false;
  }

  public async getPlatformCapabilities(): Promise<
    Record<PlatformId, AccountPlatformCapabilities>
  > {
    if (window.maswitch?.accounts) {
      try {
        return await window.maswitch.accounts.getCapabilities();
      } catch {
        return {} as Record<PlatformId, AccountPlatformCapabilities>;
      }
    }
    return {} as Record<PlatformId, AccountPlatformCapabilities>;
  }

  public async getPlatformLauncherStatuses(): Promise<
    Record<PlatformId, PlatformLauncherStatus>
  > {
    if (window.maswitch?.accounts) {
      try {
        return await window.maswitch.accounts.getLauncherStatuses();
      } catch {
        return {} as Record<PlatformId, PlatformLauncherStatus>;
      }
    }
    return {} as Record<PlatformId, PlatformLauncherStatus>;
  }

  public async getActivePlatformProfiles(): Promise<
    Record<PlatformId, ActivePlatformProfile>
  > {
    if (window.maswitch?.accounts) {
      try {
        return await window.maswitch.accounts.getActiveProfiles();
      } catch {
        return {} as Record<PlatformId, ActivePlatformProfile>;
      }
    }
    return {} as Record<PlatformId, ActivePlatformProfile>;
  }

  public async clearActivePlatformProfile(
    platformId: PlatformId
  ): Promise<boolean> {
    if (window.maswitch?.accounts) {
      try {
        return await window.maswitch.accounts.clearActiveProfile(platformId);
      } catch {
        return false;
      }
    }
    return false;
  }

  public async switchAccount(
    accountId: string,
    forceReauth?: boolean
  ): Promise<AccountSwitchResult> {
    if (window.maswitch?.accounts) {
      try {
        return await window.maswitch.accounts.switchAccount(accountId, forceReauth);
      } catch (err) {
        return {
          success: false,
          accountId,
          platformId: 'custom',
          methodUsed: 'ipc-error',
          launcherStarted: false,
          verificationStatus: 'unverified',
          message:
            err instanceof Error
              ? err.message
              : 'Failed to communicate with account switching service.',
        };
      }
    }
    return {
      success: false,
      accountId,
      platformId: 'custom',
      methodUsed: 'demo-mode',
      launcherStarted: false,
      verificationStatus: 'unverified',
      message: 'Account switching requires running in MaSwitch desktop application.',
    };
  }

  public async confirmAccountSwitch(
    accountId: string,
    switchId: string
  ): Promise<{
    success: boolean;
    accountId: string;
    lastUsedAt: string;
    verificationStatus: string;
  }> {
    if (window.maswitch?.accounts) {
      return window.maswitch.accounts.confirmSwitch(accountId, switchId);
    }
    throw new Error('Recording sign-in requires the MaSwitch desktop application.');
  }

  public async cancelAccountSwitch(switchId: string): Promise<void> {
    await window.maswitch?.accounts?.cancelSwitch(switchId);
  }

  public async openPlatformLauncher(
    platformId: PlatformId
  ): Promise<{ success: boolean; message: string }> {
    if (window.maswitch?.accounts) {
      return window.maswitch.accounts.openLauncher(platformId);
    }
    return {
      success: false,
      message: `Opening ${platformId} requires the MaSwitch desktop application.`,
    };
  }

  public async getAccountSwitchHistory(
    accountId?: string
  ): Promise<AccountSwitchHistoryRecord[]> {
    if (window.maswitch?.accounts) {
      try {
        return await window.maswitch.accounts.getSwitchHistory(accountId);
      } catch {
        return [];
      }
    }
    return [];
  }

  public async getGameAccountAssociations(): Promise<GameAccountAssociation[]> {
    if (window.maswitch?.accounts) {
      try {
        return await window.maswitch.accounts.getGameAssociations();
      } catch {
        return [];
      }
    }
    return [];
  }

  public async setGameAccountAssociation(
    gameId: string,
    accountProfileId: string | null
  ): Promise<boolean> {
    if (window.maswitch?.accounts) {
      try {
        await window.maswitch.accounts.setGameAssociation(
          gameId,
          accountProfileId
        );
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  // Phase 12: Production Riot Live Switching & Vault Integration
  public async riotGetEnrolledProfiles(): Promise<string[]> {
    if (window.maswitch?.accounts?.riotGetEnrolledProfiles) {
      try {
        return await window.maswitch.accounts.riotGetEnrolledProfiles();
      } catch {
        return [];
      }
    }
    return [];
  }

  public async riotEnrollSession(
    profileId: string,
    consentGiven: boolean
  ): Promise<RiotAccountEnrollmentResult> {
    if (window.maswitch?.accounts?.riotEnrollSession) {
      return window.maswitch.accounts.riotEnrollSession(profileId, consentGiven);
    }
    throw new Error('Riot session enrollment requires the MaSwitch desktop application.');
  }

  public async riotRemoveSession(
    profileId: string
  ): Promise<{ success: boolean; message: string }> {
    if (window.maswitch?.accounts?.riotRemoveSession) {
      return window.maswitch.accounts.riotRemoveSession(profileId);
    }
    throw new Error('Removing enrolled sessions requires the MaSwitch desktop application.');
  }

  public async riotLiveSwitch(
    profileId: string
  ): Promise<RiotLiveSwitchResult> {
    if (window.maswitch?.accounts?.riotLiveSwitch) {
      return window.maswitch.accounts.riotLiveSwitch(profileId);
    }
    throw new Error('Riot live switching requires the MaSwitch desktop application.');
  }

  public async riotRecoverPending(): Promise<RiotRecoveryResult> {
    if (window.maswitch?.accounts?.riotRecoverPending) {
      return window.maswitch.accounts.riotRecoverPending();
    }
    return {
      recovered: false,
      restoredAccountId: null,
      message: 'Desktop bridge unavailable for recovery.',
    };
  }

  public async riotGetCredentialStatus(profileId: string): Promise<{ hasSavedCredentials: boolean; username?: string; updatedAtIso?: string }> {
    if (window.maswitch?.accounts?.riotGetCredentialStatus) {
      return window.maswitch.accounts.riotGetCredentialStatus(profileId);
    }
    return { hasSavedCredentials: false };
  }

  public async riotGetAllCredentialStatuses(): Promise<Record<string, { hasSavedCredentials: boolean; username?: string; updatedAtIso?: string }>> {
    if (window.maswitch?.accounts?.riotGetAllCredentialStatuses) {
      return window.maswitch.accounts.riotGetAllCredentialStatuses();
    }
    return {};
  }

  public async riotSaveCredentials(profileId: string, username: string, password: string): Promise<{ success: boolean; updatedAtIso: string }> {
    if (window.maswitch?.accounts?.riotSaveCredentials) {
      return window.maswitch.accounts.riotSaveCredentials(profileId, username, password);
    }
    throw new Error('Credential saving requires the MaSwitch desktop application.');
  }

  public async riotDeleteCredentials(profileId: string): Promise<boolean> {
    if (window.maswitch?.accounts?.riotDeleteCredentials) {
      return window.maswitch.accounts.riotDeleteCredentials(profileId);
    }
    return false;
  }

  public async riotGetLoginCredentials(profileId: string): Promise<{ username: string; password: string } | null> {
    if (window.maswitch?.accounts?.riotGetLoginCredentials) {
      return window.maswitch.accounts.riotGetLoginCredentials(profileId);
    }
    return null;
  }

  public async riotCheckClientRunning(): Promise<boolean> {
    if (window.maswitch?.accounts?.riotCheckClientRunning) {
      return window.maswitch.accounts.riotCheckClientRunning();
    }
    return false;
  }

  public async riotLaunchClient(): Promise<{ success: boolean; message: string }> {
    if (window.maswitch?.accounts?.riotLaunchClient) {
      return window.maswitch.accounts.riotLaunchClient();
    }
    throw new Error('Launching Riot Client requires the MaSwitch desktop application.');
  }

  public async riotStartDesktopLogin(
    profileId: string,
    autoLaunchClient?: boolean,
    autoSubmit?: boolean,
    isSyntheticTest?: boolean,
    targetHwnd?: string,
    targetPid?: number
  ): Promise<RiotDesktopLoginResultPayload> {
    if (window.maswitch?.accounts?.riotStartDesktopLogin) {
      return window.maswitch.accounts.riotStartDesktopLogin(
        profileId,
        autoLaunchClient,
        autoSubmit,
        isSyntheticTest,
        targetHwnd,
        targetPid
      );
    }
    throw new Error('Riot desktop login automation requires the MaSwitch desktop application.');
  }

  public async riotCancelDesktopLogin(): Promise<void> {
    if (window.maswitch?.accounts?.riotCancelDesktopLogin) {
      return window.maswitch.accounts.riotCancelDesktopLogin();
    }
  }

  public onRiotDesktopLoginProgress(
    callback: (payload: RiotDesktopLoginProgressPayload) => void
  ): () => void {
    if (window.maswitch?.accounts?.onRiotDesktopLoginProgress) {
      return window.maswitch.accounts.onRiotDesktopLoginProgress(callback);
    }
    return () => {};
  }

  public onAccountsUpdated(callback: () => void): () => void {
    if (window.maswitch?.accounts) {
      return window.maswitch.accounts.onAccountsUpdated(callback);
    }
    return () => {};
  }
}

export const localDatabaseService = new LocalDatabaseService();
