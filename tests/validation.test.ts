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
    const indexUrl = 'file:///C:/Program%20Files/MaSwitch/resources/app.asar/dist/index.html';
    expect(isTrustedRendererUrl(indexUrl, undefined, indexUrl)).toBe(true);
    expect(
      isTrustedRendererUrl('file:///c:/program files/MaSwitch/resources/app.asar/dist/index.html#/library', undefined, indexUrl)
    ).toBe(true);
    expect(isTrustedRendererUrl('file:///C:/Users/victim/Downloads/evil.html', undefined, indexUrl)).toBe(false);
    expect(isTrustedRendererUrl('file://attacker-share/MaSwitch/resources/app.asar/dist/index.html', undefined, indexUrl)).toBe(false);
    expect(isTrustedRendererUrl('file:///C:/MaSwitch/dist/index.html', undefined, null)).toBe(false);
    expect(
      isTrustedRendererUrl('file:///C:/MaSwitch/dist/index.html', 'http://localhost:5173', null)
    ).toBe(false);
    expect(
      isTrustedRendererUrl('http://localhost:5173/', 'http://localhost:5173')
    ).toBe(true);
    expect(
      isTrustedRendererUrl('https://malicious.example.com', 'http://localhost:5173')
    ).toBe(false);
    expect(isTrustedRendererUrl(undefined)).toBe(false);
  });
});

