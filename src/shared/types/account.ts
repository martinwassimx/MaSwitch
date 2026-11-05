import type { PlatformId } from './platform';

export type AccountProfileState =
  | 'saved'
  | 'switch-pending'
  | 'user-confirmed'
  | 'verified'
  | 'sign-in-required'
  | 'launcher-unavailable';

export interface AccountProfile {
  id: string;
  platformId: PlatformId;
  displayName: string;
  username: string; // Public identifier / handle / SteamID64 / Riot ID
  avatarUrl?: string | null;
  nickname?: string | null;
  isPreferred: boolean;
  isLastSelected?: boolean;
  isEnrolled?: boolean;
  lastUsedAt: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountProfileInput {
  platformId: PlatformId;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  nickname?: string | null;
  isPreferred?: boolean;
  notes?: string | null;
}

export interface UpdateAccountProfileInput {
  displayName?: string;
  username?: string;
  avatarUrl?: string | null;
  nickname?: string | null;
  isPreferred?: boolean;
  notes?: string | null;
}

export type SupportedSwitchingMethodId =
  | 'steam-account-selection'
  | 'manual-launcher-sign-in'
  | 'client-account-switcher'
  | 'unsupported';

export interface PlatformAccountCapabilities {
  selectionCapability: 'automatic-remembered-account' | 'native-account-chooser' | 'manual-sign-in' | 'unsupported';
  authenticationStatus: 'unknown';
  platformId: PlatformId;
  platformName: string;
  canOpenLauncher: boolean;
  canDetectInstalled: boolean;
  canDetectRunning: boolean;
  canDetectActiveAccount: boolean;
  supportedSwitchingMethod: SupportedSwitchingMethodId;
  switchingMethodName: string;
  switchingMethodDescription: string;
  requiresManualSignIn: boolean;
  securityNote: string;
}

export type PlatformCapabilities = PlatformAccountCapabilities;

export interface PlatformLauncherStatus {
  platformId: PlatformId;
  isInstalled: boolean;
  isRunning: boolean;
  installPath?: string | null;
  verifiedActiveAccountUsername?: string | null;
  lastCheckedAtIso: string;
}

export interface GameAccountAssociation {
  gameId: string;
  accountId: string;
  platformId: PlatformId;
  assignedAt: string;
}

export interface ActivePlatformProfile {
  platformId: PlatformId;
  accountId: string;
  confirmedAt: string;
  verificationStatus: 'user-confirmed';
}

export interface AccountSwitchResult {
  /** Whether MaSwitch handled the selection or launcher handoff. Authentication is separate. */
  success: boolean;
  accountId: string;
  fromAccountId?: string | null;
  platformId: PlatformId;
  methodUsed: string;
  launcherStarted: boolean;
  verificationStatus:
    | 'unverified'
    | 'manual-confirmation-needed'
    | 'user-confirmed';
  message: string;
  instructions?: string[];
  pendingConfirmation?: boolean;
  isAlreadySelected?: boolean;
  switchId?: string;
}

export interface AccountSwitchHistoryRecord {
  id: string;
  accountId: string;
  fromAccountId?: string | null;
  platformId: PlatformId;
  switchedAt: string;
  success: boolean;
  methodUsed: string;
  details?: string | null;
  encryptedBackupPath?: string | null;
}

export const LAUNCHER_DISPLAY_NAMES: Record<PlatformId, string> = {
  steam: 'Steam',
  epic: 'Epic Games Launcher',
  riot: 'Riot Client',
  ea: 'EA App',
  ubisoft: 'Ubisoft Connect',
  rockstar: 'Rockstar Games Launcher',
  gog: 'GOG Galaxy',
  discord: 'Discord',
  custom: 'PC Game Launcher',
};

/**
 * Backward compatibility definitions for Phase 1 preview/demo mode.
 */
export type AccountPreviewState =
  | 'active-slot-preview'
  | 'standby-slot-preview'
  | 'unlinked-slot-preview';

export type SwitchingMethodType =
  | 'Registry & LoginUsers VDF Switch (Phase 2)'
  | 'Launcher Profile Config Switch (Phase 2)'
  | 'Riot Client Local Session Profile (Phase 2)'
  | 'EA Desktop Local Profile Selector (Phase 2)'
  | 'Ubisoft Connect Account Cache Profile (Phase 2)'
  | 'Rockstar Launcher Profile Slot (Phase 2)'
  | 'Discord Multi-Client Profile Pointer (Phase 2)';

export interface AccountPreviewEntry {
  id: string;
  platformId: PlatformId;
  slotIndex: number;
  aliasLabel: string;
  handlePreview: string;
  regionLabel: string;
  roleTag: string;
  previewState: AccountPreviewState;
  lastDetectedLabel: string;
  gamesAssociatedCount: number;
  avatarColorHex: string;
  switchingMethod: SwitchingMethodType;
  securityNote: string;
  isPreviewOnly: true;
}

/** State stages for live Riot session switching transactions */
export type RiotSwitchLiveState =
  | 'idle'
  | 'preflight'
  | 'checking-processes'
  | 'shutting-down-client'
  | 'journaling'
  | 'swapping-session'
  | 'verifying-files'
  | 'launching-client'
  | 'completed'
  | 'failed'
  | 'rolled-back'
  | 'cancelled';

/** Non-sensitive capability definition for Riot live switching architecture */
export interface RiotLiveSwitchCapability {
  platformId: 'riot';
  liveSwitchingSupported: boolean;
  requiresUserApproval: true;
  approvalStatus: 'pending-user-approval' | 'approved' | 'rejected';
  storageProtection: 'windows-dpapi-encrypted';
  requiresClientShutdown: true;
  supportsGameSwitching: false;
  authenticationStatus: 'unknown';
}

/** Manifest entry tracking an exact session file for strict cryptographic verification */
export interface RiotSessionFileManifestEntry {
  relativePath: string;
  sha256: string;
  byteSize: number;
}

/** Non-sensitive journal record tracking live switch transactions for recovery */
export interface RiotLiveSwitchJournalEntry {
  operationId: string;
  fromAccountId: string | null;
  targetAccountId: string;
  timestampIso: string;
  stage: RiotSwitchLiveState;
  pending: boolean;
  details?: string | null;
  encryptedBackupPath?: string | null;
  outgoingManifest?: RiotSessionFileManifestEntry[] | null;
  targetManifest?: RiotSessionFileManifestEntry[] | null;
}

/** Result of a Riot live account switch operation */
export interface RiotLiveSwitchResult {
  success: boolean;
  operationId: string;
  fromAccountId: string | null;
  targetAccountId: string;
  state: RiotSwitchLiveState;
  authenticationStatus: 'unknown';
  verificationStatus: 'unverified';
  durationMs: number;
  details?: string;
  warningNotice: string;
}

export interface PlatformAccountGroup {
  platformId: PlatformId;
  platformName: string;
  switchingSupportedInPhase2: boolean;
  switchingMechanismSummary: string;
  unlimitedSlotsSupported: true;
  accounts: AccountPreviewEntry[];
  isPreviewOnly: true;
}

export interface RiotAccountEnrollmentResult {
  success: boolean;
  profileId: string;
  activeAccountId?: string | null;
  enrolledAtIso?: string;
  message: string;
}

export interface RiotRecoveryResult {
  recovered: boolean;
  operationId?: string;
  restoredAccountId: string | null;
  message: string;
  manualGuidance?: string;
}
