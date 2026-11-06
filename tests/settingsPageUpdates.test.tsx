import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPage } from '../src/pages/SettingsPage';
import { UpdateBanner } from '../src/components/updater/UpdateBanner';
import { UpdateAvailableDialog } from '../src/components/updater/UpdateAvailableDialog';
import { useAppStore } from '../src/store/useAppStore';
import { DEFAULT_SETTINGS } from '../src/shared/types/settings';

describe('Settings Page — Application Updates UI & Updater Components', () => {
  beforeEach(() => {
    useAppStore.setState({
      isHydrated: true,
      settings: {
        ...DEFAULT_SETTINGS,
        autoCheckForUpdates: true,
        updateChannel: 'stable',
        lastUpdateCheckIso: '2026-11-06T10:00:00.000Z',
        remindLaterVersion: null,
      },
      updaterState: {
        status: 'idle',
        channel: 'stable',
        currentVersion: '1.0.4',
        latestCheckResult: null,
        downloadProgress: null,
        downloadedFilePath: null,
        downloadedVersion: null,
        error: null,
      },
      isCheckingUpdates: false,
      isDownloadingUpdate: false,
      showUpdateBanner: false,
      showUpdateModal: false,
    });
  });

  it('renders the Application Updates tab button in Settings', () => {
    render(<SettingsPage />);
    const updatesTab = screen.getByTestId('settings-tab-updates');
    expect(updatesTab).toBeInTheDocument();
    expect(updatesTab).toHaveTextContent(/Application Updates/i);
  });

  it('switches to the updates tab and shows version and status', async () => {
    render(<SettingsPage />);
    const updatesTab = screen.getByTestId('settings-tab-updates');
    fireEvent.click(updatesTab);

    expect(screen.getByTestId('section-application-updates')).toBeInTheDocument();
    expect(screen.getByText(/MaSwitch Desktop/i)).toBeInTheDocument();
    expect(screen.getByText(/v1.0.4/i)).toBeInTheDocument();
    expect(screen.getByTestId('btn-check-updates-header')).toBeInTheDocument();
  });

  it('invokes checkForUpdates when check button is clicked', async () => {
    const mockCheck = vi.fn().mockResolvedValue({
      updateAvailable: false,
      currentVersion: '1.0.4',
      latestVersion: '1.0.4',
      channel: 'stable',
      checkedAtIso: new Date().toISOString(),
    });
    useAppStore.setState({ checkForUpdates: mockCheck });

    render(<SettingsPage />);
    fireEvent.click(screen.getByTestId('settings-tab-updates'));

    const checkBtn = screen.getByTestId('btn-check-updates-header');
    fireEvent.click(checkBtn);

    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  it('renders update available state and download actions', () => {
    useAppStore.setState({
      updaterState: {
        status: 'available',
        channel: 'stable',
        currentVersion: '1.0.4',
        latestCheckResult: {
          updateAvailable: true,
          currentVersion: '1.0.4',
          latestVersion: '1.0.5',
          channel: 'stable',
          checkedAtIso: '2026-11-06T12:00:00Z',
          updateInfo: {
            version: '1.0.5',
            releaseName: 'MaSwitch 1.0.5',
            releaseNotes: 'Awesome new features',
            publishedAtIso: '2026-11-06T12:00:00Z',
            isPrerelease: false,
            htmlUrl: 'https://github.com/martinwassimx/MaSwitch/releases/tag/v1.0.5',
            installerAsset: {
              name: 'MaSwitch-Setup-1.0.5.exe',
              downloadUrl: 'https://github.com/martinwassimx/MaSwitch/releases/download/v1.0.5/MaSwitch-Setup-1.0.5.exe',
              size: 52 * 1024 * 1024,
              contentType: 'application/octet-stream',
            },
            signatureVerified: true,
          },
        },
        downloadProgress: null,
        downloadedFilePath: null,
        downloadedVersion: null,
        error: null,
      },
    });

    render(<SettingsPage />);
    fireEvent.click(screen.getByTestId('settings-tab-updates'));

    expect(screen.getByText(/MaSwitch v1.0.5/i)).toBeInTheDocument();
    expect(screen.getByTestId('btn-start-update-download')).toBeInTheDocument();
    expect(screen.getByText(/Awesome new features/i)).toBeInTheDocument();
  });

  it('renders UpdateBanner when showUpdateBanner is true', () => {
    useAppStore.setState({
      showUpdateBanner: true,
      updaterState: {
        status: 'available',
        channel: 'stable',
        currentVersion: '1.0.4',
        latestCheckResult: {
          updateAvailable: true,
          currentVersion: '1.0.4',
          latestVersion: '1.0.5',
          channel: 'stable',
          checkedAtIso: '2026-11-06T12:00:00Z',
          updateInfo: {
            version: '1.0.5',
            releaseName: 'MaSwitch 1.0.5',
            releaseNotes: 'Awesome new features',
            publishedAtIso: '2026-11-06T12:00:00Z',
            isPrerelease: false,
            htmlUrl: 'https://github.com/martinwassimx/MaSwitch/releases/tag/v1.0.5',
            installerAsset: {
              name: 'MaSwitch-Setup-1.0.5.exe',
              downloadUrl: 'https://github.com/martinwassimx/MaSwitch/releases/download/v1.0.5/MaSwitch-Setup-1.0.5.exe',
              size: 52 * 1024 * 1024,
              contentType: 'application/octet-stream',
            },
            signatureVerified: true,
          },
        },
        downloadProgress: null,
        downloadedFilePath: null,
        downloadedVersion: null,
        error: null,
      },
    });

    render(<UpdateBanner />);
    expect(screen.getByText(/MaSwitch v1.0.5 is available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View Update/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Later/i })).toBeInTheDocument();
  });

  it('renders UpdateAvailableDialog when showUpdateModal is true', () => {
    useAppStore.setState({
      showUpdateModal: true,
      updaterState: {
        status: 'available',
        channel: 'stable',
        currentVersion: '1.0.4',
        latestCheckResult: {
          updateAvailable: true,
          currentVersion: '1.0.4',
          latestVersion: '1.0.5',
          channel: 'stable',
          checkedAtIso: '2026-11-06T12:00:00Z',
          updateInfo: {
            version: '1.0.5',
            releaseName: 'MaSwitch 1.0.5',
            releaseNotes: 'Security and updater enhancements',
            publishedAtIso: '2026-11-06T12:00:00Z',
            isPrerelease: false,
            htmlUrl: 'https://github.com/martinwassimx/MaSwitch/releases/tag/v1.0.5',
            installerAsset: {
              name: 'MaSwitch-Setup-1.0.5.exe',
              downloadUrl: 'https://github.com/martinwassimx/MaSwitch/releases/download/v1.0.5/MaSwitch-Setup-1.0.5.exe',
              size: 52 * 1024 * 1024,
              contentType: 'application/octet-stream',
            },
            signatureVerified: true,
          },
        },
        downloadProgress: null,
        downloadedFilePath: null,
        downloadedVersion: null,
        error: null,
      },
    });

    render(<UpdateAvailableDialog />);
    expect(screen.getByText(/Application Update Available/i)).toBeInTheDocument();
    expect(screen.getByText(/Security and updater enhancements/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download Update/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remind Later/i })).toBeInTheDocument();
  });

  it('withholds automatic download for releases without a verified signature', () => {
    const baseState = useAppStore.getState().updaterState;
    useAppStore.setState({
      showUpdateModal: true,
      updaterState: {
        ...baseState,
        status: 'available',
        currentVersion: '1.0.4',
        latestCheckResult: {
          updateAvailable: true,
          currentVersion: '1.0.4',
          latestVersion: '1.0.5',
          channel: 'stable',
          checkedAtIso: '2026-11-06T12:00:00Z',
          updateInfo: {
            version: '1.0.5',
            releaseName: 'MaSwitch 1.0.5',
            releaseNotes: 'Unsigned release',
            publishedAtIso: '2026-11-06T12:00:00Z',
            isPrerelease: false,
            htmlUrl: 'https://github.com/martinwassimx/MaSwitch/releases/tag/v1.0.5',
            installerAsset: {
              name: 'MaSwitch-Setup-1.0.5.exe',
              downloadUrl: 'https://github.com/martinwassimx/MaSwitch/releases/download/v1.0.5/MaSwitch-Setup-1.0.5.exe',
              size: 52 * 1024 * 1024,
              contentType: 'application/octet-stream',
            },
            signatureVerified: false,
            verificationError: 'This release does not include a signed update manifest.',
          },
        },
      },
    });

    render(<UpdateAvailableDialog />);
    expect(screen.getByTestId('update-unverified-warning')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download Update/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open Release Page/i })).toBeInTheDocument();
  });
});
