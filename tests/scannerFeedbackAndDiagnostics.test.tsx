import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useAppStore } from '../src/store/useAppStore';
import { ScanningFeedbackBanner } from '../src/components/scanner/ScanningFeedbackBanner';
import { ScanDiagnosticsModal } from '../src/components/scanner/ScanDiagnosticsModal';
import { HomePage } from '../src/pages/HomePage';
import { LibraryPage } from '../src/pages/LibraryPage';
import type { ScanResultSummary } from '../src/shared/types/scanner';

const mockScanSummary: ScanResultSummary = {
  scanId: 'scan-test-123',
  status: 'completed',
  startedAtIso: new Date(Date.now() - 3500).toISOString(),
  finishedAtIso: new Date().toISOString(),
  totalFound: 12,
  addedOrUpdatedCount: 12,
  duplicatesSkipped: 0,
  platformReports: [
    {
      platformId: 'steam',
      platformName: 'Steam',
      status: 'detected',
      supported: true,
      gamesDetectedCount: 12,
      detectedInstallPath: 'C:\\Program Files (x86)\\Steam',
      detectionMethod: 'Steam libraryfolders.vdf parser',
    },
    {
      platformId: 'epic',
      platformName: 'Epic Games',
      status: 'detected',
      supported: true,
      gamesDetectedCount: 0,
      detectedInstallPath: 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests',
      detectionMethod: 'Epic Games .item manifest parser',
    },
  ],
  errors: [],
  diagnostics: {
    timestamp: new Date().toISOString(),
    durationMs: 3500,
    platformsChecked: [
      {
        platformId: 'steam',
        platformName: 'Steam',
        status: 'detected',
        pathsSearched: ['C:\\Program Files (x86)\\Steam\\steamapps'],
        manifestFilesFound: 12,
        gamesDiscoveredCount: 12,
        detectedGames: [
          {
            title: 'Cyberpunk 2077',
            installPath: 'C:\\Steam\\steamapps\\common\\Cyberpunk 2077',
            executablePath: 'C:\\Steam\\steamapps\\common\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe',
            launchMethod: 'steam-protocol',
          },
        ],
      },
      {
        platformId: 'epic',
        platformName: 'Epic Games',
        status: 'detected',
        pathsSearched: ['C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'],
        manifestFilesFound: 0,
        gamesDiscoveredCount: 0,
        detectedGames: [],
      },
    ],
    commonFoldersSearched: ['C:\\Games', 'D:\\Games'],
    totalDiscovered: 12,
    totalUniqueSaved: 12,
    duplicatesSkipped: 0,
    warnings: [],
    errors: [],
  },
};

describe('Scanning Feedback and Diagnostics System', () => {
  beforeEach(() => {
    useAppStore.setState({
      isScanning: false,
      scanProgress: null,
      scanError: null,
      showScanBanner: false,
      lastScanSummary: null,
      games: [],
      realGames: [],
    });
  });

  describe('ScanningFeedbackBanner', () => {
    it('renders active progress bar when isScanning is true', () => {
      useAppStore.setState({
        isScanning: true,
        scanProgress: {
          scanId: 'scan-1',
          phase: 'scanning-steam',
          message: 'Scanning Steam library folders...',
          percent: 35,
          discoveredCount: 6,
        },
      });

      const onOpenDiagnostics = vi.fn();
      render(<ScanningFeedbackBanner onOpenDiagnostics={onOpenDiagnostics} />);

      expect(screen.getByTestId('scanner-active-banner')).toBeInTheDocument();
      expect(screen.getByText('Scanning for installed games...')).toBeInTheDocument();
      expect(screen.getByText('Scanning Steam library folders...')).toBeInTheDocument();
      expect(screen.getByText('6 detected (35%)')).toBeInTheDocument();
      expect(screen.getByTestId('banner-cancel-scan-btn')).toBeInTheDocument();
    });

    it('renders error banner when scanError is present', () => {
      useAppStore.setState({
        isScanning: false,
        scanError: 'Failed to access Steam registry keys: Permission denied.',
      });

      const onOpenDiagnostics = vi.fn();
      render(<ScanningFeedbackBanner onOpenDiagnostics={onOpenDiagnostics} />);

      expect(screen.getByTestId('scanner-error-banner')).toBeInTheDocument();
      expect(screen.getByText('Game scan failed')).toBeInTheDocument();
      expect(
        screen.getByText('Failed to access Steam registry keys: Permission denied.')
      ).toBeInTheDocument();

      const diagBtn = screen.getByTestId('banner-error-diagnostics-btn');
      fireEvent.click(diagBtn);
      expect(onOpenDiagnostics).toHaveBeenCalledTimes(1);

      const dismissBtn = screen.getByTestId('banner-dismiss-error-btn');
      fireEvent.click(dismissBtn);
      expect(useAppStore.getState().scanError).toBeNull();
    });

    it('renders completion banner with platform breakdown when scan finishes', () => {
      useAppStore.setState({
        isScanning: false,
        showScanBanner: true,
        lastScanSummary: mockScanSummary,
      });

      const onOpenDiagnostics = vi.fn();
      render(<ScanningFeedbackBanner onOpenDiagnostics={onOpenDiagnostics} />);

      expect(screen.getByTestId('scanner-complete-banner')).toBeInTheDocument();
      expect(
        screen.getByText(/Scan complete — 12 games found \(Steam: 12, Epic: 0\)/)
      ).toBeInTheDocument();

      const viewDiagBtn = screen.getByTestId('banner-view-diagnostics-btn');
      fireEvent.click(viewDiagBtn);
      expect(onOpenDiagnostics).toHaveBeenCalledTimes(1);

      const dismissBtn = screen.getByTestId('banner-dismiss-complete-btn');
      fireEvent.click(dismissBtn);
      expect(useAppStore.getState().showScanBanner).toBe(false);
    });
  });

  describe('ScanDiagnosticsModal', () => {
    it('opens without a scan summary and displays System & IPC status checklist', () => {
      const onClose = vi.fn();
      render(
        <ScanDiagnosticsModal
          summary={null}
          isOpen={true}
          onClose={onClose}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('System & Scanner Diagnostics')).toBeInTheDocument();
      expect(screen.getByText('Preload Bridge (window.maswitch)')).toBeInTheDocument();
      expect(screen.getByText('Local SQLite Database')).toBeInTheDocument();
      expect(screen.getByText('Default Windows Game Scan Paths')).toBeInTheDocument();

      // Check copy button text
      expect(screen.getByText('Copy system diagnostics')).toBeInTheDocument();
    });

    it('displays full diagnostic tabs and summary when scan summary is provided', () => {
      const onClose = vi.fn();
      render(
        <ScanDiagnosticsModal
          summary={mockScanSummary}
          isOpen={true}
          onClose={onClose}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Scan Diagnostics Report')).toBeInTheDocument();
      expect(screen.getByText('Overview & Stats')).toBeInTheDocument();
      expect(screen.getByText('Platforms Checked (2)')).toBeInTheDocument();
      expect(screen.getByText('Discovered Games (1)')).toBeInTheDocument();
      expect(screen.getByText('System & IPC Status')).toBeInTheDocument();
      expect(screen.getByText('Raw Diagnostic Text')).toBeInTheDocument();

      // Switch to platforms tab
      fireEvent.click(screen.getByText('Platforms Checked (2)'));
      expect(screen.getByText(/C:\\Program Files \(x86\)\\Steam\\steamapps/)).toBeInTheDocument();

      // Switch to discovered games tab
      fireEvent.click(screen.getByText('Discovered Games (1)'));
      expect(screen.getByText('Cyberpunk 2077')).toBeInTheDocument();
    });
  });

  describe('Page Diagnostics Access', () => {
    it('provides accessible Diagnostics button on HomePage even before any scan runs', () => {
      render(<HomePage />);

      const headerDiagBtn = screen.getByTestId('home-view-diagnostics-btn');
      expect(headerDiagBtn).toBeInTheDocument();
      expect(headerDiagBtn).toHaveTextContent('Diagnostics');

      // Click Diagnostics button
      fireEvent.click(headerDiagBtn);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('System & Scanner Diagnostics')).toBeInTheDocument();
    });

    it('provides accessible Diagnostics button on LibraryPage even before any scan runs', () => {
      render(<LibraryPage />);

      const libDiagBtn = screen.getByTestId('library-view-diagnostics-btn');
      expect(libDiagBtn).toBeInTheDocument();
      expect(libDiagBtn).toHaveTextContent('Diagnostics');

      // Click Diagnostics button
      fireEvent.click(libDiagBtn);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('System & Scanner Diagnostics')).toBeInTheDocument();
    });
  });

  describe('useAppStore Scan Flow', () => {
    it('sets scanError when window.maswitch.scanner is missing', async () => {
      const originalScanner = window.maswitch?.scanner;
      // @ts-expect-error simulate missing scanner
      delete window.maswitch.scanner;

      const res = await useAppStore.getState().startGameScan();
      expect(res).toBeNull();
      expect(useAppStore.getState().isScanning).toBe(false);
      expect(useAppStore.getState().scanError).toContain('Electron preload bridge');

      // Restore scanner
      if (window.maswitch && originalScanner) {
        window.maswitch.scanner = originalScanner;
      }
    });

    it('sets lastScanSummary and showScanBanner on successful scan', async () => {
      const res = await useAppStore.getState().startGameScan();
      expect(res).not.toBeNull();
      expect(useAppStore.getState().isScanning).toBe(false);
      expect(useAppStore.getState().scanError).toBeNull();
      expect(useAppStore.getState().showScanBanner).toBe(true);
      expect(useAppStore.getState().lastScanSummary).not.toBeNull();
    });
  });
});
