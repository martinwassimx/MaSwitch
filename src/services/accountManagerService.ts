import type {
  AccountPreviewEntry,
  AccountProfile,
  AccountSwitchResult,
  CreateAccountProfileInput,
  GameAccountAssociation,
  PlatformAccountGroup,
  PlatformCapabilities,
  PlatformLauncherStatus,
  UpdateAccountProfileInput,
} from '../shared/types/account';
import type { PlatformId } from '../shared/types/platform';
import { DEMO_ACCOUNT_GROUPS } from './demoData/demoAccounts';
import { localDatabaseService } from './localDatabaseService';

export interface AccountSwitchArchitecturalResult {
  supportedInCurrentPhase: boolean;
  targetPhase?: string;
  message: string;
}

/**
 * Phase 6 Multi-Account Management & Switching Service
 *
 * Legitimate platform-supported profile switching and association.
 * Security Guarantee: Never collects, stores, or transmits passwords, cookies, or session tokens.
 */
export class AccountManagerService {
  public async getAccountProfiles(
    platformId?: PlatformId
  ): Promise<AccountProfile[]> {
    return localDatabaseService.getAccountProfiles(platformId);
  }

  public async createAccountProfile(
    input: CreateAccountProfileInput
  ): Promise<AccountProfile | null> {
    return localDatabaseService.createAccountProfile(input);
  }

  public async updateAccountProfile(
    id: string,
    input: UpdateAccountProfileInput
  ): Promise<AccountProfile | null> {
    return localDatabaseService.updateAccountProfile(id, input);
  }

  public async deleteAccountProfile(id: string): Promise<boolean> {
    return localDatabaseService.deleteAccountProfile(id);
  }

  public async setPreferredAccount(id: string): Promise<boolean> {
    return localDatabaseService.setPreferredAccount(id);
  }

  public async switchAccount(
    accountId: string,
    forceReauth?: boolean
  ): Promise<AccountSwitchResult> {
    return localDatabaseService.switchAccount(accountId, forceReauth);
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
    return localDatabaseService.confirmAccountSwitch(accountId, switchId);
  }

  public async getActiveProfiles() {
    return localDatabaseService.getActivePlatformProfiles();
  }

  public async clearActiveProfile(platformId: PlatformId) {
    return localDatabaseService.clearActivePlatformProfile(platformId);
  }

  public async openPlatformLauncher(
    platformId: PlatformId
  ): Promise<{ success: boolean; message: string }> {
    return localDatabaseService.openPlatformLauncher(platformId);
  }

  public async getSwitchHistory(accountId?: string) {
    return localDatabaseService.getAccountSwitchHistory(accountId);
  }

  public async getCapabilities(): Promise<
    Record<PlatformId, PlatformCapabilities>
  > {
    return localDatabaseService.getPlatformCapabilities();
  }

  public async getLauncherStatuses(): Promise<
    Record<PlatformId, PlatformLauncherStatus>
  > {
    return localDatabaseService.getPlatformLauncherStatuses();
  }

  public async getGameAssociations(): Promise<GameAccountAssociation[]> {
    return localDatabaseService.getGameAccountAssociations();
  }

  public async setGameAssociation(
    gameId: string,
    accountProfileId: string | null
  ): Promise<boolean> {
    return localDatabaseService.setGameAccountAssociation(
      gameId,
      accountProfileId
    );
  }

  // ==========================================
  // Demo Mode & Backward Compatibility
  // ==========================================

  public getInitialPreviewGroups(): PlatformAccountGroup[] {
    return DEMO_ACCOUNT_GROUPS.map((group) => ({
      ...group,
      accounts: group.accounts.map((acc) => ({ ...acc })),
    }));
  }

  public createPreviewAccountSlot(
    platformId: PlatformId,
    existingSlotsCount: number,
    customLabel?: string
  ): AccountPreviewEntry {
    const nextSlot = existingSlotsCount + 1;
    const sanitizedAlias =
      customLabel && customLabel.trim().length > 0
        ? customLabel.trim().slice(0, 36)
        : `Preview Profile Slot #${nextSlot}`;

    return {
      id: `${platformId}-preview-slot-${Date.now()}-${nextSlot}`,
      platformId,
      slotIndex: nextSlot,
      aliasLabel: sanitizedAlias,
      handlePreview: `PreviewSlot_${nextSlot}`,
      regionLabel: 'Local Preview',
      roleTag: `Slot #${nextSlot} (UI Preview)`,
      previewState: 'unlinked-slot-preview',
      lastDetectedLabel: 'Preview Slot • No Credentials Stored',
      gamesAssociatedCount: 0,
      avatarColorHex: '#38bdf8',
      switchingMethod: 'Registry & LoginUsers VDF Switch (Phase 2)',
      securityNote:
        'Preview slot. No platform credentials or tokens are collected.',
      isPreviewOnly: true,
    };
  }

  public getSwitchReadinessStatus(
    platformId: PlatformId
  ): AccountSwitchArchitecturalResult {
    return {
      supportedInCurrentPhase: false,
      message: `Choose or sign in to your ${platformId.toUpperCase()} account in its client.`,
    };
  }
}

export const accountManagerService = new AccountManagerService();
