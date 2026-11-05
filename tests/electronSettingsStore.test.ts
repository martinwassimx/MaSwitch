import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => os.tmpdir(),
  },
}));

import { ElectronSettingsStore } from '../electron/services/settingsStore';
import { DEFAULT_SETTINGS } from '../src/shared/types/settings';

describe('ElectronSettingsStore Local Disk Persistence', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('persists settings to disk and reloads them across instances', () => {
    const storeA = new ElectronSettingsStore(tempDir);
    const initial = storeA.load();
    expect(initial).toEqual(DEFAULT_SETTINGS);

    const saved = storeA.save({
      theme: 'obsidian-contrast',
      accentColor: 'emerald-pulse',
      sidebarCollapsed: true,
      favoriteGameIds: ['cyber-odyssey-2099', 'titancore-vii'],
    });

    expect(saved.theme).toBe('obsidian-contrast');
    expect(saved.accentColor).toBe('emerald-pulse');
    expect(saved.sidebarCollapsed).toBe(true);

    // Create a second independent store instance reading from the same Windows directory
    const storeB = new ElectronSettingsStore(tempDir);
    const reloaded = storeB.load();
    expect(reloaded.theme).toBe('obsidian-contrast');
    expect(reloaded.accentColor).toBe('emerald-pulse');
    expect(reloaded.sidebarCollapsed).toBe(true);
    expect(reloaded.favoriteGameIds).toEqual([
      'cyber-odyssey-2099',
      'titancore-vii',
    ]);

    const afterReset = storeB.reset();
    expect(afterReset).toEqual(DEFAULT_SETTINGS);
  });
});

