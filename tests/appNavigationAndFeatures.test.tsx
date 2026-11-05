import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../src/App';
import { useAppStore } from '../src/store/useAppStore';
import { DEFAULT_SETTINGS } from '../src/shared/types/settings';
import { accountManagerService } from '../src/services/accountManagerService';
import { DEMO_GAMES } from '../src/services/demoData/demoGames';
import { getMockDiskSettings } from './setup';

describe('MaSwitch Desktop Application Integration (Phase 1 & Phase 2)', () => {
  beforeEach(() => {
    useAppStore.setState({
      isHydrated: true,
      activeSection: 'home',
      previousSection: 'home',
      selectedGameId: null,
      inspectedLibraryGameId: 'cyber-odyssey-2099',
      searchQuery: '',
      platformFilter: 'all',
      installFilter: 'all',
      favoritesOnly: false,
      sortBy: 'playtimeHours',
      sortDirection: 'desc',
      viewMode: 'grid',
      games: DEMO_GAMES,
      realGames: [],
      settings: {
        ...DEFAULT_SETTINGS,
        demoModeEnabled: true,
        autoScanOnStartup: false,
        animationsEnabled: false,
      },
      accountGroups: accountManagerService.getInitialPreviewGroups(),
    });
  });

  it('renders custom Windows title bar and invokes window controls IPC bridge', async () => {
    render(<App />);

    expect(screen.getByTestId('custom-titlebar')).toBeInTheDocument();

    const minimizeBtn = screen.getByTestId('win-minimize-btn');
    const maximizeBtn = screen.getByTestId('win-maximize-btn');
    const closeBtn = screen.getByTestId('win-close-btn');

    fireEvent.click(minimizeBtn);
    expect(window.maswitch?.windowControls.minimize).toHaveBeenCalledTimes(1);

    fireEvent.click(maximizeBtn);
    await waitFor(() => {
      expect(
        window.maswitch?.windowControls.toggleMaximize
      ).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(closeBtn);
    expect(window.maswitch?.windowControls.close).toHaveBeenCalledTimes(1);
  });

  it('navigates across all 6 main sections via the sidebar', () => {
    render(<App />);

    expect(screen.getByTestId('page-home')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('nav-library'));
    expect(screen.getByTestId('page-library')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('nav-accounts'));
    expect(screen.getByTestId('page-accounts')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('nav-platforms'));
    expect(screen.getByTestId('page-platforms')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('nav-statistics'));
    expect(screen.getByTestId('page-statistics')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('nav-settings'));
    expect(screen.getByTestId('page-settings')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('nav-home'));
    expect(screen.getByTestId('page-home')).toBeInTheDocument();
  });

  it('supports library search, platform filtering, grid/list switching, and game details navigation in Demo Mode', async () => {
    await window.maswitch?.settings.save({
      demoModeEnabled: true,
      autoScanOnStartup: false,
      animationsEnabled: false,
    });

    render(<App />);

    await waitFor(() => {
      expect(useAppStore.getState().games.length).toBe(8);
    });

    fireEvent.click(screen.getByTestId('nav-library'));
    expect(screen.getByTestId('library-grid-container')).toBeInTheDocument();

    // Switch to List View
    fireEvent.click(screen.getByTestId('view-mode-list'));
    expect(screen.getByTestId('library-list-container')).toBeInTheDocument();

    // Filter by Steam platform
    fireEvent.click(screen.getByTestId('platform-filter-steam'));
    expect(screen.getByTestId('library-results-count')).toHaveTextContent(
      'Showing 3 of 8 titles'
    );

    // Search for Valkyrie
    const searchInput = screen.getByTestId('library-search-input');
    fireEvent.change(searchInput, { target: { value: 'Valkyrie' } });
    expect(screen.getByTestId('library-results-count')).toHaveTextContent(
      'Showing 1 of 8 titles'
    );

    // Open full Game Details page from side inspector panel
    fireEvent.click(screen.getByTestId('panel-open-details-btn'));
    expect(screen.getByTestId('page-game-details')).toBeInTheDocument();
    expect(screen.getByTestId('details-game-title')).toHaveTextContent(
      'Valkyrie Horizon: Eclipse Armada'
    );

    // Return back from details
    fireEvent.click(screen.getByTestId('back-from-details-btn'));
    expect(screen.getByTestId('page-library')).toBeInTheDocument();
  });

  it('supports adding a custom game executable, launching it, and removing it from SQLite library', async () => {
    await useAppStore.getState().setDemoMode(false);

    render(<App />);

    fireEvent.click(screen.getByTestId('nav-library'));

    // Open Add Custom Game modal
    fireEvent.click(screen.getByTestId('open-add-custom-game-btn'));
    expect(screen.getByTestId('add-custom-game-form')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('custom-game-title-input'), {
      target: { value: 'Starlight Commander' },
    });
    fireEvent.change(screen.getByTestId('custom-game-exe-input'), {
      target: { value: 'C:\\Games\\Starlight\\Starlight.exe' },
    });

    fireEvent.click(screen.getByTestId('submit-custom-game-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('library-results-count')).toHaveTextContent(
        'Showing 1 of 1 titles'
      );
    });

    // Launch custom game from side inspector panel
    const launchBtn = screen.getByTestId('panel-launch-game-btn');
    fireEvent.click(launchBtn);

    await waitFor(() => {
      expect(window.maswitch?.launcher?.launchGame).toHaveBeenCalledTimes(1);
    });

    // Remove game from MaSwitch library
    const removeBtn = screen.getByTestId('panel-remove-game-btn');
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(window.maswitch?.library?.removeGame).toHaveBeenCalledTimes(1);
    });
  });

  it('displays all 7 required account platforms and supports adding unlimited preview slots', () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('nav-accounts'));
    const requiredPlatforms = [
      'steam',
      'epic',
      'riot',
      'ea',
      'ubisoft',
      'rockstar',
      'discord',
    ] as const;

    for (const platformId of requiredPlatforms) {
      expect(
        screen.getByTestId(`account-group-${platformId}`)
      ).toBeInTheDocument();
    }

    // In Phase 6, clicking add profile opens the modal
    const addSteamSlotBtn = screen.getByTestId('add-slot-steam');
    fireEvent.click(addSteamSlotBtn);
    expect(screen.getByTestId('account-profile-form-modal')).toBeInTheDocument();
  });

  it('persists theme, accent color, and Windows startup preferences locally', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('nav-settings'));
    fireEvent.click(screen.getByTestId('theme-option-deep-navy'));
    fireEvent.click(screen.getByTestId('accent-option-cyber-violet'));

    await waitFor(() => {
      const persisted = getMockDiskSettings();
      expect(persisted.theme).toBe('deep-navy');
      expect(persisted.accentColor).toBe('cyber-violet');
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe(
      'deep-navy'
    );
    expect(document.documentElement.getAttribute('data-accent')).toBe(
      'cyber-violet'
    );
  });
});
