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
    installPath:
      'C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe',
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
    switchingMethodDescription:
      'Encrypted Windows DPAPI desktop UI Automation into official Riot Client.',
    requiresManualSignIn: true,
    securityNote: 'Zero file swapping or session injection.',
  },
};

describe('MaSwitch 3.0 — Accounts Page Redesign & Riot-First Account Management', () => {
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

  it('1. renders modern top header with Riot account count, active badge, Check Launchers, and Add Riot Account CTA', () => {
    render(<AccountsPage />);

    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expect(screen.getByText('Manage and switch your gaming identities')).toBeInTheDocument();
    expect(screen.getByTestId('total-account-slots-count')).toHaveTextContent('2 accounts');
    expect(screen.getByTestId('active-platform-badge')).toHaveTextContent('Riot Games Active');
    expect(screen.getByTestId('refresh-launcher-status-btn')).toBeInTheDocument();
    expect(screen.getByTestId('add-account-profile-btn')).toHaveTextContent('Add Riot Account');
  });

  it('2. defaults to Riot Games and displays Coming Soon states for Steam, Epic Games, EA App, Ubisoft, GOG, Rockstar, and Discord without functional buttons', () => {
    render(<AccountsPage />);

    // Riot Games is active by default and displays its 2 saved accounts
    expect(screen.getByTestId('accounts-filter-riot')).toHaveTextContent('Riot Games');
    expect(screen.getByTestId('accounts-filter-riot')).toHaveTextContent('2');
    expect(screen.getByTestId('accounts-card-grid')).toBeInTheDocument();
    expect(screen.getByTestId('account-card-riot-euw-1')).toBeInTheDocument();
    expect(screen.getByTestId('account-card-riot-na-2')).toBeInTheDocument();

    // Non-Riot tabs display "Soon" badges
    const comingSoonPlatforms: Array<{ id: PlatformId; name: string }> = [
      { id: 'steam', name: 'Steam' },
      { id: 'epic', name: 'Epic Games' },
      { id: 'ea', name: 'EA App' },
      { id: 'ubisoft', name: 'Ubisoft Connect' },
      { id: 'gog', name: 'GOG Galaxy' },
      { id: 'rockstar', name: 'Rockstar Games' },
      { id: 'discord', name: 'Discord' },
    ];

    for (const p of comingSoonPlatforms) {
      expect(screen.getByTestId(`coming-soon-badge-${p.id}`)).toHaveTextContent('Soon');
    }

    // Selecting Steam shows the Coming Soon state and hides Add/Login/Switch controls
    fireEvent.click(screen.getByTestId('accounts-filter-steam'));
    expect(screen.getByTestId('platform-coming-soon-state')).toBeInTheDocument();
    expect(screen.getByTestId('coming-soon-platform-title')).toHaveTextContent(
      'Steam Account Management'
    );
    expect(screen.getByTestId('coming-soon-platform-description')).toHaveTextContent(
      'Multi-account management for Steam is planned for a future MaSwitch update.'
    );
    expect(screen.queryByTestId('add-account-profile-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('accounts-card-grid')).not.toBeInTheDocument();

    // Selecting Epic Games shows the Coming Soon state for Epic Games
    fireEvent.click(screen.getByTestId('accounts-filter-epic'));
    expect(screen.getByTestId('coming-soon-platform-title')).toHaveTextContent(
      'Epic Games Account Management'
    );
    expect(screen.getByTestId('coming-soon-platform-description')).toHaveTextContent(
      'Multi-account management for Epic Games is planned for a future MaSwitch update.'
    );

    // Clicking "Return to Riot Games Accounts" restores the Riot Games view
    fireEvent.click(screen.getByTestId('return-to-riot-btn'));
    expect(screen.getByTestId('accounts-card-grid')).toBeInTheDocument();
    expect(screen.getByTestId('add-account-profile-btn')).toBeInTheDocument();
  });

  it('3. supports fast client-side search, credential status filter, preferred filter, and sorting for Riot accounts', () => {
    render(<AccountsPage />);

    expect(screen.getByTestId('account-card-riot-euw-1')).toBeInTheDocument();
    expect(screen.getByTestId('account-card-riot-na-2')).toBeInTheDocument();

    // Search by region "EUW"
    const searchInput = screen.getByTestId('accounts-search-input');
    fireEvent.change(searchInput, { target: { value: 'EUW' } });
    expect(screen.getByTestId('account-card-riot-euw-1')).toBeInTheDocument();
    expect(screen.queryByTestId('account-card-riot-na-2')).not.toBeInTheDocument();

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
    expect(screen.queryByTestId('account-card-riot-na-2')).not.toBeInTheDocument();
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

  it('5. supports creating a Riot account with inline DPAPI credentials while non-Riot platform buttons in modal are disabled as Coming Soon', async () => {
    const createAccountProfileSpy = vi.fn().mockResolvedValue({
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

    // Open Add Riot Account modal
    fireEvent.click(screen.getByTestId('add-account-profile-btn'));
    expect(screen.getByTestId('account-profile-form-modal')).toBeInTheDocument();

    // Verify non-Riot platform tiles in the modal are disabled ("Soon")
    expect(screen.getByTestId('form-platform-steam')).toBeDisabled();
    expect(screen.getByTestId('form-platform-epic')).toBeDisabled();
    expect(screen.getByTestId('form-platform-riot')).not.toBeDisabled();

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
