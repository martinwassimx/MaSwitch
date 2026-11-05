import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameDetailsPage } from '../src/pages/GameDetailsPage';
import { useAppStore } from '../src/store/useAppStore';
import { DEMO_GAMES } from '../src/services/demoData/demoGames';
import type { GameItem } from '../src/shared/types/game';

const testGame: GameItem = {
  ...DEMO_GAMES[0]!,
  id: 'test-lol',
  title: 'League of Legends',
  platformId: 'riot',
  platformName: 'Riot Games',
  coverImage: 'maswitch-asset://artwork/lol_grid.jpg',
  iconImage: 'maswitch-asset://artwork/lol_icon.ico',
  heroBackgroundImage: 'maswitch-asset://artwork/lol_hero.jpg',
  logoImage: 'maswitch-asset://artwork/lol_logo.png',
  developer: 'Riot Games',
  publisher: 'Riot Games',
  releaseYear: 2009,
  isInstalled: true,
  playtimeHours: 42.5,
  lastPlayedIso: null,
  lastPlayedLabel: 'Never played',
  genres: ['MOBA', 'Strategy', 'Multiplayer'],
  fullDescription: ['Team-based strategy game where two teams of five powerful champions face off.'],
  isDemoData: false,
};

describe('GameDetailsPage Hero & Running-State Robustness', () => {
  beforeEach(() => {
    useAppStore.setState({
      games: [testGame],
      selectedGameId: testGame.id,
      launchStatuses: {},
      launchMessages: {},
      launchDiagnostics: {},
      trackerStatus: {
        enabled: true,
        paused: false,
        activeSessions: [],
      },
    });
  });

  it('renders prominent game title, vertical cover, and action buttons in idle state', () => {
    render(<GameDetailsPage />);

    const title = screen.getByTestId('details-game-title');
    expect(title).toBeDefined();
    expect(title.textContent).toBe('League of Legends');

    // Title does not have the vanishing 'truncate' class
    expect(title.className).not.toContain('truncate');
    expect(title.className).toContain('break-words');

    // Vertical cover is rendered
    const cover = screen.getByAltText('League of Legends');
    expect(cover).toBeDefined();
    expect(cover.getAttribute('src')).toBe('maswitch-asset://artwork/lol_grid.jpg');

    // Action buttons are present
    expect(screen.getByTestId('details-launch-btn')).toBeDefined();
    expect(screen.getByTestId('details-favorite-btn')).toBeDefined();
    expect(screen.getByTestId('details-edit-artwork-btn')).toBeDefined();
    expect(screen.getByTestId('details-edit-btn')).toBeDefined();
    expect(screen.getByTestId('details-remove-btn')).toBeDefined();

    // Idle telemetry shows last played label
    expect(screen.getByText('Never played')).toBeDefined();
  });

  it('renders only ONE launch message when running and updates status to Playing Now', () => {
    const launchMsg = 'Launched League of Legends via Riot Client Services.';

    useAppStore.setState({
      launchStatuses: { [testGame.id]: 'running' },
      launchMessages: { [testGame.id]: launchMsg },
      trackerStatus: {
        enabled: true,
        paused: false,
        activeSessions: [
          {
            id: 'session-123',
            gameId: testGame.id,
            gameTitle: testGame.title,
            platformId: 'riot',
            executablePath: 'C:\\Riot Games\\League of Legends\\LeagueClient.exe',
            startedAtIso: new Date(Date.now() - 120_000).toISOString(),
            endedAtIso: null,
            durationSeconds: 120,
            source: 'maswitch-launch',
            status: 'active',
          },
        ],
      },
    });

    render(<GameDetailsPage />);

    // Game Title must remain visible
    const title = screen.getByTestId('details-game-title');
    expect(title.textContent).toBe('League of Legends');

    // Must have EXACTLY ONE launch message (no duplicates!)
    const messages = screen.getAllByTestId('details-launch-message');
    expect(messages.length).toBe(1);
    expect(messages[0]!.textContent).toContain(launchMsg);

    // Play button now displays Running
    const launchBtn = screen.getByTestId('details-launch-btn');
    expect(launchBtn.textContent).toContain('Running');

    // Telemetry shows Playing Now instead of Never played
    expect(screen.queryByText('Never played')).toBeNull();
    expect(screen.getByText(/Playing Now/)).toBeDefined();

    // All action buttons stay visible and accessible
    expect(screen.getByTestId('details-favorite-btn')).toBeDefined();
    expect(screen.getByTestId('details-edit-artwork-btn')).toBeDefined();
    expect(screen.getByTestId('details-edit-btn')).toBeDefined();
    expect(screen.getByTestId('details-remove-btn')).toBeDefined();
  });

  it('renders failure diagnostics when launch fails without breaking hero layout', () => {
    useAppStore.setState({
      launchStatuses: { [testGame.id]: 'failed' },
      launchMessages: { [testGame.id]: 'Failed to launch game' },
      launchDiagnostics: {
        [testGame.id]: {
          gameId: testGame.id,
          gameTitle: testGame.title,
          platformId: 'riot',
          launchMethod: 'executable',
          executableExists: false,
          workingDirectoryExists: false,
          errorCategory: 'file-not-found',
          troubleshootingAdvice: 'Check if Riot Client is installed at the expected path.',
          technicalDetails: 'CreateProcess failed error code 2',
        },
      },
    });

    render(<GameDetailsPage />);

    // Title still visible
    expect(screen.getByTestId('details-game-title').textContent).toBe('League of Legends');

    // Single launch message
    const messages = screen.getAllByTestId('details-launch-message');
    expect(messages.length).toBe(1);

    // Diagnostics box visible
    const diag = screen.getByTestId('details-launch-diagnostics');
    expect(diag).toBeDefined();
    expect(diag.textContent).toContain('Check if Riot Client is installed');
  });
});

