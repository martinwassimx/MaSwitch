import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuickAccountSwitch } from '../src/components/home/QuickAccountSwitch';
import { useAppStore } from '../src/store/useAppStore';
import type { AccountProfile } from '../src/shared/types/account';

function profile(partial: Partial<AccountProfile> & Pick<AccountProfile, 'id' | 'displayName'>): AccountProfile {
  return {
    platformId: 'riot',
    username: 'private-login',
    avatarUrl: null,
    nickname: null,
    isPreferred: false,
    isLastSelected: false,
    lastUsedAt: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('Quick account switch', () => {
  it('switches through the existing workflow and does not call an account logged in', async () => {
    const switchAccount = vi.fn().mockResolvedValue({ success: true, message: 'Started' });
    useAppStore.setState({
      accountProfiles: [
        profile({ id: 'a', displayName: 'Old Name', nickname: 'Main', isLastSelected: true, lolRegion: 'EUW', lolRegionSource: 'riot-client' }),
        profile({ id: 'b', displayName: 'Other', nickname: 'Smurf', lolRegion: 'NA', lolRegionSource: 'user', valorantRegion: 'NA', valorantRegionSource: 'user' }),
      ],
      riotCredentialStatuses: {
        a: { hasSavedCredentials: true },
        b: { hasSavedCredentials: true },
      },
      isSwitchingAccount: false,
      switchError: null,
      switchAccount,
    });

    render(<QuickAccountSwitch />);
    expect(screen.getByTestId('quick-switch-selected')).toHaveTextContent('Main');
    expect(screen.getByTestId('quick-switch-selected')).toHaveTextContent('Selected account');
    expect(screen.queryByText(/currently logged in/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('quick-switch-b'));
    await waitFor(() => expect(switchAccount).toHaveBeenCalledWith('b'));
  });

  it('does not start a switch when credentials are missing and shows a failed switch error', async () => {
    const switchAccount = vi.fn().mockResolvedValue({ success: false, message: 'Riot Client could not be closed.' });
    useAppStore.setState({
      accountProfiles: [
        profile({ id: 'a', displayName: 'Main', isLastSelected: true }),
        profile({ id: 'b', displayName: 'Missing' }),
        profile({ id: 'c', displayName: 'Fails' }),
      ],
      riotCredentialStatuses: {
        a: { hasSavedCredentials: true },
        c: { hasSavedCredentials: true },
      },
      isSwitchingAccount: false,
      switchError: null,
      switchAccount,
    });

    render(<QuickAccountSwitch />);
    fireEvent.click(screen.getByTestId('quick-switch-b'));
    expect(switchAccount).not.toHaveBeenCalled();
    expect(screen.getByTestId('quick-switch-notice')).toHaveTextContent(/set up credentials/i);

    fireEvent.click(screen.getByTestId('quick-switch-c'));
    await waitFor(() => expect(screen.getByTestId('quick-switch-notice')).toHaveTextContent('Riot Client could not be closed.'));
  });
});
