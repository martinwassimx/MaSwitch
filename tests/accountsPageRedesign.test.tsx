import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AccountsPage } from '../src/pages/AccountsPage';
import { useAppStore } from '../src/store/useAppStore';
import { DEFAULT_SETTINGS } from '../src/shared/types/settings';
import type {
  AccountProfile,
  ActivePlatformProfile,
  PlatformCapabilities,
  PlatformLauncherStatus,
} from '../src/shared/types/account';
import type { PlatformId } from '../src/shared/types/platform';

const mockProfiles: AccountProfile[] = [
  {
    id: 'riot-euw-1',
    platformId: 'riot',
    displayName: 'LOL EUW — Melynelas',
    username: 'Melynelas#EUW',
    nickname: 'League of Legends — EUW',
    avatarUrl: null,
    isPreferred: true,
    isLastSelected: true,
    lastUsedAt: '2026-11-05T19:00:00.000Z',
    notes: 'Grandmaster ADC',
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-11-05T19:00:00.000Z',
  },
  {
    id: 'riot-na-2',
    platformId: 'riot',
    displayName: 'VAL NA — SmurfAccount',
    username: 'Smurf#NA1',
    nickname: 'Valorant — NA',
    avatarUrl: null,
    isPreferred: false,
    isLastSelected: false,
    lastUsedAt: '2026-11-01T12:00:00.000Z',
    notes: null,
    createdAt: '2026-02-15T10:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
  },
  {
    id: 'steam-main-1',
    platformId: 'steam',
    displayName: 'Alpha Steam Library',
    username: 'kestrel_prime',
    nickname: 'Main PC',
    avatarUrl: null,
    isPreferred: true,
    isLastSelected: false,
    lastUsedAt: '2026-11-04T15:30:00.000Z',
    notes: 'Primary Steam Deck & PC account',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-11-04T15:30:00.000Z',
  },
];

const mockLauncherStatuses: Partial<Record<PlatformId, PlatformLauncherStatus>> = {
  riot: {
    platformId: 'riot',
    isInstalled: true,
    isRunning: true,
    installPath: 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
    verifiedActiveAccountUsername: null,
    lastCheckedAtIso: '2026-11-06T00:00:00.000Z',
  },
  steam: {
    platformId: 'steam',
    isInstalled: true,
    isRunning: false,
    installPath: 'C:\\Program Files (x86)\\Steam\\steam.exe',
    verifiedActiveAccountUsername: null,
    lastCheckedAtIso: '2026-11-06T00:00:00.000Z',
  },
  epic: {
    platformId: 'epic',
    isInstalled: true,
    isRunning: false,
    installPath: 'C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe',
    verifiedActiveAccountUsername: null,
    lastCheckedAtIso: '2026-11-06T00:00:00.000Z',
  },
};

const mockCapabilities: Partial<Record<PlatformId, PlatformCapabilities>> = {
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
    switchingMethodName: 'Desktop Login Automation',
    switchingMethodDescription: 'Encrypted Windows DPAPI desktop UI Automation into official Riot Client.',
    requiresManualSignIn: true,
    securityNote: 'Zero file swapping or session injection.',
  },
  steam: {
    selectionCapability: 'native-account-chooser',
    authenticationStatus: 'unknown',
    platformId: 'steam',
    platformName: 'Steam',
    canOpenLauncher: true,
    canDetectInstalled: true,
    canDetectRunning: true,
    canDetectActiveAccount: true,
    supportedSwitchingMethod: 'steam-account-selection',
    switchingMethodName: 'Steam Account Chooser',
    switchingMethodDescription: 'Opens the official Steam account chooser.',
    requiresManualSignIn: false,
    securityNote: 'Uses official Steam loginusers.vdf read-only inspection.',
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
    switchingMethodName: 'Launcher Handoff',
    switchingMethodDescription: 'Opens Epic Games Launcher for official sign-in.',
    requiresManualSignIn: true,
    securityNote: 'Profile metadata only.',
  },
};

describe('MaSwitch 3.0 — Complete Accounts Page Redesign', () => {
  beforeEach(() => {
    const activeProfiles: Partial<Record<PlatformId, ActivePlatformProfile>> = {
      riot: {
        platformId: 'riot',
        accountId: 'riot-euw-1',
        confirmedAt: '2026-11-05T19:00:00.000Z',
        verificationStatus: 'user-confirmed',
      },
    };

    useAppStore.setState({
      isHydrated: true,
      activeSection: 'accounts',
      settings: {
        ...DEFAULT_SETTINGS,
        demoModeEnabled: false,
        animationsEnabled: false,
        riotAutoSubmitLogin: true,
      },
      accountProfiles: [...mockProfiles],
      activePlatformProfiles: activeProfiles as Record<PlatformId, ActivePlatformProfile>,
      launcherStatuses: mockLauncherStatuses as Record<PlatformId, PlatformLauncherStatus>,
      platformCapabilities: mockCapabilities as Record<PlatformId, PlatformCapabilities>,
      gameAccountAssociations: [
        {
          gameId: 'game-lol',
          accountId: 'riot-euw-1',
          platformId: 'riot',
          assignedAt: '2026-11-05T00:00:00.000Z',
        },
      ],
      riotCredentialStatuses: {
        'riot-euw-1': {
          hasSavedCredentials: true,
          username: 'melynelas_login',
          updatedAtIso: '2026-11-05T18:00:00.000Z',
        },
        'riot-na-2': {
          hasSavedCredentials: false,
          username: undefined,
          updatedAtIso: undefined,
        },
      },
      isRiotLoginAutomating: false,
      riotLoginAutomationProgress: null,
      riotCredentialError: null,
      activeSwitchResult: null,
      pendingSwitchAccountId: null,
      switchError: null,
    });
  });

  it('1. renders modern top header with total saved accounts, connected platforms, Check Launchers, and Add Account CTA', () => {
    render(<AccountsPage />);

    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expect(screen.getByText('Manage and switch your gaming identities')).toBeInTheDocument();
    expect(screen.getByTestId('total-account-slots-count')).toHaveTextContent('3 accounts');
    expect(screen.getByTestId('connected-platforms-count')).toHaveTextContent('3 connected platforms');
    expect(screen.getByTestId('refresh-launcher-status-btn')).toBeInTheDocument();
    expect(screen.getByTestId('add-account-profile-btn')).toBeInTheDocument();
  });

  it('2. renders horizontal platform selector with real counts and shows a single compact empty state instead of 8 stacked empty boxes', () => {
    render(<AccountsPage />);

    expect(screen.getByTestId('accounts-filter-all')).toHaveTextContent('All Accounts');
    expect(screen.getByTestId('accounts-filter-riot')).toHaveTextContent('Riot Games');
    expect(screen.getByTestId('accounts-filter-riot')).toHaveTextContent('2');
    expect(screen.getByTestId('accounts-filter-steam')).toHaveTextContent('Steam');
    expect(screen.getByTestId('accounts-filter-steam')).toHaveTextContent('1');
    expect(screen.getByTestId('accounts-filter-epic')).toHaveTextContent('Epic Games');
    expect(screen.getByTestId('accounts-filter-epic')).toHaveTextContent('0');

    // In "All Accounts" view, no empty platform boxes are stacked on the page
    expect(screen.queryByTestId('accounts-empty-state')).not.toBeInTheDocument();
    expect(screen.getByTestId('accounts-card-grid')).toBeInTheDocument();

    // Selecting Epic Games (0 accounts) displays a single attractive empty state
    fireEvent.click(screen.getByTestId('accounts-filter-epic'));
    expect(screen.getByTestId('accounts-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No Epic Games accounts yet.')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-add-account-btn')).toHaveTextContent(
      'Add Epic Games Account'
    );

    // Clicking "Add Epic Games Account" opens the Add Account modal pre-selected to Epic Games
    fireEvent.click(screen.getByTestId('empty-state-add-account-btn'));
    expect(screen.getByTestId('account-profile-form-modal')).toBeInTheDocument();
    expect(screen.getByText('Epic Games Identity')).toBeInTheDocument();
  });

  it('3. supports fast client-side search, credential status filter, preferred filter, and sorting', () => {
    render(<AccountsPage />);

    // Initially all 3 accounts are visible
    expect(screen.getByTestId('account-card-riot-euw-1')).toBeInTheDocument();
    expect(screen.getByTestId('account-card-riot-na-2')).toBeInTheDocument();
    expect(screen.getByTestId('account-card-steam-main-1')).toBeInTheDocument();

    // Search by region "EUW"
    const searchInput = screen.getByTestId('accounts-search-input');
    fireEvent.change(searchInput, { target: { value: 'EUW' } });
    expect(screen.getByTestId('account-card-riot-euw-1')).toBeInTheDocument();
    expect(screen.queryByTestId('account-card-riot-na-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-card-steam-main-1')).not.toBeInTheDocument();

    // Clear search
    fireEvent.click(screen.getByTestId('accounts-search-clear-btn'));
    expect(screen.getByTestId('account-card-riot-na-2')).toBeInTheDocument();

    // Filter by "Credentials Missing"
    fireEvent.change(screen.getByTestId('accounts-credential-filter'), {
      target: { value: 'missing' },
    });
    expect(screen.getByTestId('account-card-riot-na-2')).toBeInTheDocument();
    expect(screen.queryByTestId('account-card-riot-euw-1')).not.toBeInTheDocument();

    // Filter by "Credentials Saved"
    fireEvent.change(screen.getByTestId('accounts-credential-filter'), {
      target: { value: 'configured' },
    });
    expect(screen.getByTestId('account-card-riot-euw-1')).toBeInTheDocument();
    expect(screen.queryByTestId('account-card-riot-na-2')).not.toBeInTheDocument();

    // Reset credential filter and toggle Preferred filter
    fireEvent.change(screen.getByTestId('accounts-credential-filter'), {
      target: { value: 'all' },
    });
    fireEvent.click(screen.getByTestId('accounts-filter-favorites'));
    expect(screen.getByTestId('account-card-riot-euw-1')).toBeInTheDocument();
    expect(screen.getByTestId('account-card-steam-main-1')).toBeInTheDocument();
    expect(screen.queryByTestId('account-card-riot-na-2')).not.toBeInTheDocument();

    // Sort by Name (A-Z): "Alpha Steam Library" should appear first
    fireEvent.click(screen.getByTestId('accounts-filter-favorites')); // uncheck preferred
    fireEvent.change(screen.getByTestId('accounts-sort-select'), {
      target: { value: 'name' },
    });
    const cardsByName = screen.getAllByRole('article');
    expect(cardsByName[0]).toHaveAttribute('data-testid', 'account-card-steam-main-1');

    // Sort by Recently Used: "riot-euw-1" (Nov 5) -> "steam-main-1" (Nov 4) -> "riot-na-2" (Nov 1)
    fireEvent.change(screen.getByTestId('accounts-sort-select'), {
      target: { value: 'recent' },
    });
    const cardsByRecent = screen.getAllByRole('article');
    expect(cardsByRecent[0]).toHaveAttribute('data-testid', 'account-card-riot-euw-1');
    expect(cardsByRecent[1]).toHaveAttribute('data-testid', 'account-card-steam-main-1');
    expect(cardsByRecent[2]).toHaveAttribute('data-testid', 'account-card-riot-na-2');
  });

  it('4. renders Riot account cards with region badge, DPAPI credential status, Set Up Credentials action, and Login modal without exposing passwords', async () => {
    render(<AccountsPage />);

    // Region extraction
    expect(screen.getByTestId('account-region-riot-euw-1')).toHaveTextContent('EUW');
    expect(screen.getByTestId('account-region-riot-na-2')).toHaveTextContent('NA');

    // Credential status badges
    expect(screen.getByTestId('status-badge-credentials-riot-euw-1')).toHaveTextContent(
      'Credentials Saved'
    );
    expect(screen.getByTestId('status-badge-credentials-riot-na-2')).toHaveTextContent(
      'Credentials Missing'
    );

    // Quick "Set Up Credentials" button appears only when credentials are missing
    expect(screen.queryByTestId('setup-credentials-btn-riot-euw-1')).not.toBeInTheDocument();
    const setupBtn = screen.getByTestId('setup-credentials-btn-riot-na-2');
    expect(setupBtn).toBeInTheDocument();

    // Clicking "Set Up Credentials" opens the DPAPI credentials modal
    fireEvent.click(setupBtn);
    expect(screen.getByTestId('riot-credentials-modal')).toBeInTheDocument();

    // Clicking "Login" on a configured Riot account opens the Desktop Login Automation modal
    fireEvent.click(screen.getByTestId('riot-login-btn-riot-euw-1'));
    await waitFor(() => {
      expect(screen.getByTestId('riot-desktop-login-modal')).toBeInTheDocument();
    });
  });

  it('5. supports creating a Riot account with inline DPAPI credentials vs non-Riot launcher handoff notice', async () => {
    const createAccountProfileSpy = vi
      .fn()
      .mockResolvedValue({
        id: 'riot-kr-new',
        platformId: 'riot',
        displayName: 'LOL KR — FakerFan',
        username: 'FakerFan#KR1',
        nickname: 'League of Legends — KR',
        avatarUrl: null,
        isPreferred: true,
        isLastSelected: false,
        lastUsedAt: null,
        notes: null,
        createdAt: '2026-11-06T00:00:00.000Z',
        updatedAt: '2026-11-06T00:00:00.000Z',
      } satisfies AccountProfile);
    const saveRiotCredentialsSpy = vi.fn().mockResolvedValue(true);

    useAppStore.setState({
      createAccountProfile: createAccountProfileSpy,
      saveRiotCredentials: saveRiotCredentialsSpy,
    });

    render(<AccountsPage />);

    // Open Add Account modal
    fireEvent.click(screen.getByTestId('add-account-profile-btn'));
    expect(screen.getByTestId('account-profile-form-modal')).toBeInTheDocument();

    // Selecting Steam hides the Riot DPAPI password inputs and shows launcher handoff notice
    fireEvent.click(screen.getByTestId('form-platform-steam'));
    expect(screen.queryByTestId('form-riot-login-password')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Steam uses official launcher handoff/i)
    ).toBeInTheDocument();

    // Selecting Riot Games reveals the optional Windows DPAPI credential fields
    fireEvent.click(screen.getByTestId('form-platform-riot'));
    expect(screen.getByTestId('form-riot-login-username')).toBeInTheDocument();
    expect(screen.getByTestId('form-riot-login-password')).toBeInTheDocument();

    // Fill out new Riot account + inline DPAPI credentials
    fireEvent.change(screen.getByTestId('input-display-name'), {
      target: { value: 'LOL KR — FakerFan' },
    });
    fireEvent.change(screen.getByTestId('input-username'), {
      target: { value: 'FakerFan#KR1' },
    });
    fireEvent.change(screen.getByTestId('input-nickname'), {
      target: { value: 'League of Legends — KR' },
    });
    fireEvent.change(screen.getByTestId('form-riot-login-username'), {
      target: { value: 'faker_kr_login' },
    });
    fireEvent.change(screen.getByTestId('form-riot-login-password'), {
      target: { value: 'SuperSecretPassword123!' },
    });
    fireEvent.click(screen.getByTestId('checkbox-is-preferred'));

    fireEvent.click(screen.getByTestId('save-profile-submit-btn'));

    await waitFor(() => {
      expect(createAccountProfileSpy).toHaveBeenCalledWith({
        platformId: 'riot',
        displayName: 'LOL KR — FakerFan',
        username: 'FakerFan#KR1',
        nickname: 'League of Legends — KR',
        notes: null,
        isPreferred: true,
      });
      expect(saveRiotCredentialsSpy).toHaveBeenCalledWith(
        'riot-kr-new',
        'faker_kr_login',
        'SuperSecretPassword123!'
      );
    });
  });

  it('6. renders compact Security Overview panel and More actions dropdown menu', () => {
    render(<AccountsPage />);

    // Compact Security Overview Panel
    const securityPanel = screen.getByTestId('security-overview-panel');
    expect(securityPanel).toBeInTheDocument();
    expect(screen.getByText('Windows DPAPI Active')).toBeInTheDocument();
    expect(screen.getByTestId('security-configured-count')).toHaveTextContent('1');
    expect(screen.getByTestId('security-missing-count')).toHaveTextContent('1');

    // Open More menu on a card
    fireEvent.click(screen.getByTestId('more-menu-btn-riot-euw-1'));
    expect(screen.getByTestId('more-menu-dropdown-riot-euw-1')).toBeInTheDocument();
    expect(screen.getByText('Edit Profile Info')).toBeInTheDocument();
    expect(screen.getByText('Manage DPAPI Credentials')).toBeInTheDocument();
  });
});
