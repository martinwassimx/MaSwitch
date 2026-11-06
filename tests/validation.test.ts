import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/shared/types/settings';
import {
  isTrustedRendererUrl,
  sanitizeSettings,
} from '../src/shared/validation/settingsValidator';

describe('Electron Security & Settings Validation', () => {
  it('returns default settings when input is malformed or null', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('invalid')).toEqual(DEFAULT_SETTINGS);
  });

  it('sanitizes invalid theme, accentColor, and malicious favorite IDs', () => {
    const result = sanitizeSettings({
      theme: 'unknown-theme',
      accentColor: 'neon-cyan',
      sidebarCollapsed: true,
      favoriteGameIds: ['cyber-odyssey-2099', '<script>alert(1)</script>', ''],
      updateChannel: 'untrusted-channel',
      autoCheckForUpdates: 'not-a-boolean',
    });

    expect(result.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(result.accentColor).toBe('neon-cyan');
    expect(result.sidebarCollapsed).toBe(true);
    expect(result.favoriteGameIds).toEqual(['cyber-odyssey-2099']);
    expect(result.updateChannel).toBe('stable');
    expect(result.autoCheckForUpdates).toBe(true);
  });

  it('validates trusted renderer sender URLs strictly', () => {
    expect(isTrustedRendererUrl('file:///C:/MaSwitch/dist/index.html')).toBe(
      true
    );
    expect(
      isTrustedRendererUrl('http://localhost:5173/', 'http://localhost:5173')
    ).toBe(true);
    expect(
      isTrustedRendererUrl('https://malicious.example.com', 'http://localhost:5173')
    ).toBe(false);
    expect(isTrustedRendererUrl(undefined)).toBe(false);
  });
});

