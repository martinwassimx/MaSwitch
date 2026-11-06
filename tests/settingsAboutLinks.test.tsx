import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SettingsPage } from '../src/pages/SettingsPage';
import { useAppStore } from '../src/store/useAppStore';
import { ABOUT_LINKS, MASWITCH_WEBSITE_URL } from '../src/shared/officialLinks';

describe('Settings → About official links', () => {
  it('links to the official website, help, privacy, GitHub and issues', () => {
    useAppStore.setState({ isHydrated: true });
    render(<SettingsPage />);
    fireEvent.click(screen.getByTestId('settings-tab-about'));

    expect(screen.getByTestId('about-link-website')).toHaveAttribute('href', 'https://maswitch.martinx.work/');
    expect(screen.getByTestId('about-link-website')).toHaveTextContent('maswitch.martinx.work');
    for (const link of ABOUT_LINKS) {
      const anchor = screen.getByTestId(`about-link-${link.id}`);
      expect(anchor).toHaveAttribute('href', link.url);
      expect(link.url.startsWith('https://')).toBe(true);
    }
  });

  it('opens links in the default browser through the main process instead of navigating', () => {
    const openExternalLink = vi.fn(async () => true);
    window.maswitch = {
      ...window.maswitch,
      news: { getLibraryNews: vi.fn(), openExternalLink },
    } as unknown as typeof window.maswitch;
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null);

    useAppStore.setState({ isHydrated: true });
    render(<SettingsPage />);
    fireEvent.click(screen.getByTestId('settings-tab-about'));

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    screen.getByTestId('about-link-website').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(openExternalLink).toHaveBeenCalledWith(MASWITCH_WEBSITE_URL);
    expect(windowOpen).not.toHaveBeenCalled();
    windowOpen.mockRestore();
  });
});
