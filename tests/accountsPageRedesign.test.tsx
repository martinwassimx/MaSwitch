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
    lolRegion: 'EUW',
    lolRegionSource: 'user',
    valorantRegion: 'EMEA',
    valorantRegionSource: 'riot-client',
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
    lolRegion: 'NA',
    lolRegionSource: 'user',
    valorantRegion: 'NA',
    valorantRegionSource: 'user',
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

describe('Streamlined Passwords & Accounts Main Screen', () => {
  beforeEach(() => {
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
      activePlatformProfiles: {} as Record<PlatformId, ActivePlatformProfile>,
      launcherStatuses: {} as Record<PlatformId, PlatformLauncherStatus>,
      platformCapabilities: {} as Record<PlatformId, PlatformCapabilities>,
      riotCredentialStatuses: {
        'riot-euw-1': {
          hasSavedCredentials: true,
          username: 'melynelas_login',
          updatedAtIso: '2026-11-05T18:00:00.000Z',
        },
        'riot-na-2': {
          hasSavedCredentials: false,
        },
      },
      vaultPinStatus: {
        isConfigured: true,
        isUnlocked: true,
        failedAttempts: 0,
        lockedUntilIso: null,
      },
      isPinModalOpen: false,
      loadRiotCredentialStatuses: vi.fn().mockResolvedValue(undefined),
      loadVaultPinStatus: vi.fn().mockResolvedValue({
        isConfigured: true,
        isUnlocked: true,
        failedAttempts: 0,
        lockedUntilIso: null,
      }),
      isRiotLoginAutomating: false,
      riotLoginAutomationProgress: null,
      riotCredentialError: null,
    });
  });

  it('1. renders simplified Passwords & Accounts header with PIN lock controls, Open Riot Client, and Add Account', () => {
    render(<AccountsPage />);

    expect(screen.getByText('Passwords & Accounts')).toBeInTheDocument();
    expect(screen.getByTestId('total-account-slots-count')).toHaveTextContent('2 accounts');
    expect(screen.getByTestId('vault-lock-badge')).toHaveTextContent('Unlocked');
    expect(screen.getByTestId('pin-lock-header-btn')).toBeInTheDocument();
    expect(screen.getByTestId('pin-change-header-btn')).toBeInTheDocument();
    expect(screen.getByTestId('riot-section-open-launcher-btn')).toBeInTheDocument();
    expect(screen.getByTestId('add-account-profile-btn')).toHaveTextContent('Add Account');
  });

  it('2. supports client-side search, password status filter, and preferred filter', () => {
    render(<AccountsPage />);

    expect(screen.getByTestId('account-card-riot-euw-1')).toBeInTheDocument();
    expect(screen.getByTestId('account-card-riot-na-2')).toBeInTheDocument();

    const searchInput = screen.getByTestId('accounts-search-input');
    fireEvent.change(searchInput, { target: { value: 'EUW' } });
    expect(screen.getByTestId('account-card-riot-euw-1')).toBeInTheDocument();
    expect(screen.queryByTestId('account-card-riot-na-2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('accounts-search-clear-btn'));
    expect(screen.getByTestId('account-card-riot-na-2')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('accounts-credential-filter'), {
      target: { value: 'missing' },
    });
    expect(screen.getByTestId('account-card-riot-na-2')).toBeInTheDocument();
    expect(screen.queryByTestId('account-card-riot-euw-1')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('accounts-credential-filter'), {
      target: { value: 'configured' },
    });
    expect(screen.getByTestId('account-card-riot-euw-1')).toBeInTheDocument();
    expect(screen.queryByTestId('account-card-riot-na-2')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('accounts-credential-filter'), {
      target: { value: 'all' },
    });
    fireEvent.click(screen.getByTestId('accounts-filter-favorites'));
    expect(screen.getByTestId('account-card-riot-euw-1')).toBeInTheDocument();
    expect(screen.queryByTestId('account-card-riot-na-2')).not.toBeInTheDocument();
  });

  it('3. triggers 1-click desktop login immediately when clicking Login on an unlocked account with saved password', async () => {
    const startRiotDesktopLoginSpy = vi.fn().mockResolvedValue({
      success: true,
      profileId: 'riot-euw-1',
      message: 'Signed in.',
    });
    useAppStore.setState({ startRiotDesktopLogin: startRiotDesktopLoginSpy });

    render(<AccountsPage />);

    expect(screen.getByTestId('status-badge-credentials-riot-euw-1')).toHaveTextContent(
      'Password Saved'
    );
    expect(screen.getByTestId('status-badge-credentials-riot-na-2')).toHaveTextContent(
      'No Password Set'
    );

    fireEvent.click(screen.getByTestId('riot-login-btn-riot-euw-1'));
    await waitFor(() => {
      expect(startRiotDesktopLoginSpy).toHaveBeenCalledWith('riot-euw-1', true, true);
    });
  });

  it('4. creates a Riot account and saves its encrypted password in a single unified form', async () => {
    const createAccountProfileSpy = vi.fn().mockResolvedValue({
      id: 'riot-kr-new',
      platformId: 'riot',
      displayName: 'My KR Account',
      username: 'faker_kr_login',
      nickname: 'My KR Account',
      avatarUrl: null,
      isPreferred: true,
      isLastSelected: false,
      lastUsedAt: null,
      notes: null,
      createdAt: '2026-11-06T00:00:00.000Z',
      updatedAt: '2026-11-06T00:00:00.000Z',
    } satisfies AccountProfile);
    const saveRiotCredentialsSpy = vi.fn().mockResolvedValue({
      success: true,
      updatedAtIso: '2026-11-06T00:00:00.000Z',
    });
    const setRiotRegionsSpy = vi.fn().mockResolvedValue(undefined);

    useAppStore.setState({
      createAccountProfile: createAccountProfileSpy,
      saveRiotCredentials: saveRiotCredentialsSpy,
      setRiotRegions: setRiotRegionsSpy,
    });

    render(<AccountsPage />);

    fireEvent.click(screen.getByTestId('add-account-profile-btn'));
    expect(screen.getByTestId('account-profile-form-modal')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('input-username'), {
      target: { value: 'faker_kr_login' },
    });
    fireEvent.change(screen.getByTestId('form-riot-login-password'), {
      target: { value: 'SuperSecretPassword123!' },
    });
    fireEvent.change(screen.getByTestId('input-nickname'), {
      target: { value: 'My KR Account' },
    });
    fireEvent.click(screen.getByTestId('toggle-more-account-options'));
    fireEvent.change(screen.getByTestId('input-lol-region'), {
      target: { value: 'KR' },
    });
    fireEvent.click(screen.getByTestId('checkbox-is-preferred'));

    fireEvent.click(screen.getByTestId('save-profile-submit-btn'));

    await waitFor(() => {
      expect(createAccountProfileSpy).toHaveBeenCalledWith({
        platformId: 'riot',
        displayName: 'My KR Account',
        username: 'faker_kr_login',
        nickname: 'My KR Account',
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

  it('5. prompts PIN unlock before allowing Login or Add Account when vault is PIN-locked', async () => {
    const openPinModalSpy = vi.fn();
    const startRiotDesktopLoginSpy = vi.fn();

    useAppStore.setState({
      vaultPinStatus: {
        isConfigured: true,
        isUnlocked: false,
        failedAttempts: 0,
        lockedUntilIso: null,
      },
      openPinModal: openPinModalSpy,
      startRiotDesktopLogin: startRiotDesktopLoginSpy,
    });

    render(<AccountsPage />);

    expect(screen.getByTestId('vault-locked-banner')).toBeInTheDocument();
    expect(screen.getByTestId('status-badge-credentials-riot-euw-1')).toHaveTextContent(
      'Password Saved (Locked)'
    );
    expect(screen.getByTestId('riot-login-btn-riot-euw-1')).toHaveTextContent(
      'Unlock & Login'
    );

    fireEvent.click(screen.getByTestId('riot-login-btn-riot-euw-1'));
    expect(startRiotDesktopLoginSpy).not.toHaveBeenCalled();
    expect(openPinModalSpy).toHaveBeenCalledWith('unlock', expect.any(Function));
  });
});
