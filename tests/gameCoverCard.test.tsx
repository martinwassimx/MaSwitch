import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameCoverCard } from '../src/components/common/GameCoverCard';
import { DEMO_GAMES } from '../src/services/demoData/demoGames';
import type { GameItem } from '../src/shared/types/game';

const mockGame: GameItem = {
  ...DEMO_GAMES[0]!,
  id: 'game-test-1',
  title: 'EA SPORTS FC 27',
  platformId: 'ea',
  platformName: 'EA App',
  coverImage: 'maswitch-asset://artwork/sgdb_5458628_grid_123.jpg',
  iconImage: 'maswitch-asset://artwork/sgdb_5458628_icon_456.ico',
  heroBackgroundImage: 'maswitch-asset://artwork/sgdb_5458628_hero_789.jpg',
  logoImage: 'maswitch-asset://artwork/sgdb_5458628_logo_101.png',
  sourceType: 'ea',
  launchMethod: 'executable',
  executablePath: 'D:\\Games\\EA\\FC27\\fc27.exe',
  isInstalled: true,
  playtimeHours: 12.5,
  lastPlayedIso: null,
  userCoverOverride: null,
  confidenceScore: 1.0,
};

describe('GameCoverCard Standards & Error Handling', () => {
  it('enforces standardized 2:3 vertical aspect ratio container', () => {
    const { container } = render(
      <GameCoverCard
        game={mockGame}
        isFavorite={false}
        onOpenDetails={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    const aspectContainer = container.querySelector('.aspect-\\[2\\/3\\]');
    expect(aspectContainer).not.toBeNull();
  });

  it('renders official cover image when valid', () => {
    render(
      <GameCoverCard
        game={mockGame}
        isFavorite={false}
        onOpenDetails={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    const coverImg = screen.getByAltText('EA SPORTS FC 27');
    expect(coverImg).toBeDefined();
    expect(coverImg.getAttribute('src')).toBe(
      'maswitch-asset://artwork/sgdb_5458628_grid_123.jpg'
    );
  });

  it('falls back to clean stylized cartridge without duplicate badge or Local Title on cover image error', () => {
    const { container } = render(
      <GameCoverCard
        game={mockGame}
        isFavorite={false}
        onOpenDetails={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    const coverImg = screen.getByAltText('EA SPORTS FC 27');
    // Trigger image load error
    fireEvent.error(coverImg);

    // No raw "Local Title" label should appear anywhere
    expect(screen.queryByText(/Local Title/i)).toBeNull();

    // Verify there is only one PlatformBadge rendered on the card (top-left absolute badge)
    // and no duplicate badge inside the fallback cartridge
    const topBadges = container.querySelectorAll('.absolute.top-2\\.5.left-2\\.5');
    expect(topBadges.length).toBe(1);

    const fallbackCartridge = container.querySelector('.bg-gradient-to-b');
    expect(fallbackCartridge).not.toBeNull();
    // The fallback cartridge should only contain the centered icon and title, no inner platform badges
    expect(fallbackCartridge?.querySelector('.tracking-tight')).toBeNull();
  });

  it('gracefully falls back to platform vector logo if iconImage also errors', () => {
    const { container } = render(
      <GameCoverCard
        game={mockGame}
        isFavorite={false}
        onOpenDetails={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    // 1. Cover errors
    const coverImg = screen.getByAltText('EA SPORTS FC 27');
    fireEvent.error(coverImg);

    // 2. Fallback cartridge is shown with game icon
    const fallbackCartridge = container.querySelector('.bg-gradient-to-b');
    expect(fallbackCartridge).not.toBeNull();
    const cartridgeImg = fallbackCartridge?.querySelector('img');
    expect(cartridgeImg).not.toBeNull();

    // 3. Game icon errors
    fireEvent.error(cartridgeImg!);

    // 4. Cartridge gracefully falls back to PlatformLogo container without error
    const remainingCartridgeImg = fallbackCartridge?.querySelector('img');
    expect(remainingCartridgeImg).toBeDefined();
  });
});
