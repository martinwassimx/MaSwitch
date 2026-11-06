import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { InstalledFeaturesManager, isAcceptableInstallerPath } from '../electron/services/features/installedFeaturesManager';
import {
  OPTIONAL_FEATURES_METADATA,
  PRESET_CONFIGURATIONS,
  type InstalledFeaturesManifest,
} from '../src/shared/types/features';

describe('MaSwitch 3.0 Modular Installer & Feature Gating Test Suite', () => {
  let tempDir: string;
  let customManifestPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maswitch-features-test-'));
    customManifestPath = path.join(tempDir, 'user-manifest.json');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error on windows
    }
  });

  describe('1. Manifest Initialization & Seed Loading', () => {
    it('creates default complete manifest when no user or seed manifest exists', () => {
      const manager = new InstalledFeaturesManager({
        customManifestPath,
        defaultPreset: 'complete',
      });

      const manifest = manager.getManifest();
      expect(manifest.manifestVersion).toBe('1.0.0');
      expect(manifest.preset).toBe('complete');
      expect(manager.isFeatureInstalled('yearInReview')).toBe(true);
      expect(manager.isFeatureInstalled('smartCollections')).toBe(true);
      expect(manager.isFeatureInstalled('performanceMonitor')).toBe(true);
      expect(manager.isFeatureInstalled('gameNews')).toBe(true);
      expect(manager.isFeatureInstalled('backupRestore')).toBe(true);
      expect(fs.existsSync(customManifestPath)).toBe(true);
    });

    it('creates minimal preset manifest when specified', () => {
      const manager = new InstalledFeaturesManager({
        customManifestPath,
        defaultPreset: 'minimal',
      });

      const manifest = manager.getManifest();
      expect(manifest.preset).toBe('minimal');
      expect(manager.isFeatureEnabled('yearInReview')).toBe(false);
      expect(manager.isFeatureEnabled('smartCollections')).toBe(false);
      expect(manager.isFeatureEnabled('performanceMonitor')).toBe(false);
      expect(manager.isFeatureEnabled('gameNews')).toBe(false);
      expect(manager.isFeatureEnabled('backupRestore')).toBe(false);
    });

    it('creates recommended preset manifest with collections and backup enabled', () => {
      const manager = new InstalledFeaturesManager({
        customManifestPath,
        defaultPreset: 'recommended',
      });

      const manifest = manager.getManifest();
      expect(manifest.preset).toBe('recommended');
      expect(manager.isFeatureEnabled('smartCollections')).toBe(true);
      expect(manager.isFeatureEnabled('backupRestore')).toBe(true);
      expect(manager.isFeatureEnabled('yearInReview')).toBe(false);
      expect(manager.isFeatureEnabled('performanceMonitor')).toBe(false);
      expect(manager.isFeatureEnabled('gameNews')).toBe(false);
    });

    it('loads and sanitizes an existing user manifest from disk', () => {
      const initial: InstalledFeaturesManifest = {
        manifestVersion: '1.0.0',
        appVersion: '0.2.0',
        preset: 'custom',
        installedAtIso: '2026-11-05T12:00:00.000Z',
        updatedAtIso: '2026-11-05T12:00:00.000Z',
        features: {
          yearInReview: { installed: true, enabled: false },
          smartCollections: { installed: true, enabled: true },
          performanceMonitor: { installed: false, enabled: false },
          gameNews: { installed: true, enabled: true },
          backupRestore: { installed: true, enabled: false },
          memoryManagement: { installed: false, enabled: false },
        },
        isInstallerManaged: true,
        installerPath: 'C:\\Setup\\MaSwitch-Setup-0.2.0.exe',
      };

      fs.writeFileSync(customManifestPath, JSON.stringify(initial), 'utf-8');

      const manager = new InstalledFeaturesManager({
        customManifestPath,
      });

      expect(manager.isFeatureEnabled('smartCollections')).toBe(true);
      expect(manager.isFeatureEnabled('gameNews')).toBe(true);
      expect(manager.isFeatureEnabled('yearInReview')).toBe(false);
      expect(manager.isFeatureEnabled('performanceMonitor')).toBe(false);
      expect(manager.isFeatureInstalled('performanceMonitor')).toBe(false);
    });

    it('parses NSIS-written manifest with unescaped Windows backslashes in installerPath', () => {
      const nsisRaw = String.raw`{
  "manifestVersion": "1.0.0",
  "appVersion": "1.0.0",
  "preset": "recommended",
  "installedAtIso": "2026-11-05T18:00:00.000Z",
  "updatedAtIso": "2026-11-05T18:00:00.000Z",
  "features": {
    "yearInReview": { "installed": false, "enabled": false },
    "smartCollections": { "installed": true, "enabled": true },
    "performanceMonitor": { "installed": false, "enabled": false },
    "gameNews": { "installed": false, "enabled": false },
    "backupRestore": { "installed": true, "enabled": true },
    "memoryManagement": { "installed": false, "enabled": false }
  },
  "isInstallerManaged": true,
  "installerPath": "C:\Users\Gamer\Downloads\MaSwitch-Setup-1.0.0.exe"
}`;

      fs.writeFileSync(customManifestPath, nsisRaw, 'utf-8');

      const manager = new InstalledFeaturesManager({
        customManifestPath,
      });

      expect(manager.getManifest().preset).toBe('recommended');
      expect(manager.isFeatureEnabled('smartCollections')).toBe(true);
      expect(manager.isFeatureEnabled('backupRestore')).toBe(true);
      expect(manager.isFeatureEnabled('yearInReview')).toBe(false);
      expect(manager.getManifest().installerPath).toContain('MaSwitch-Setup-1.0.0.exe');
    });
  });

  describe('2. Preset Application & Resource Metrics', () => {
    it('applies minimal preset and updates all feature states', async () => {
      const manager = new InstalledFeaturesManager({
        customManifestPath,
        defaultPreset: 'complete',
      });

      const updated = await manager.applyPreset('minimal');
      expect(updated.preset).toBe('minimal');
      expect(manager.isFeatureEnabled('yearInReview')).toBe(false);
      expect(manager.isFeatureEnabled('smartCollections')).toBe(false);
      expect(manager.isFeatureEnabled('performanceMonitor')).toBe(false);
      expect(manager.isFeatureEnabled('gameNews')).toBe(false);
      expect(manager.isFeatureEnabled('backupRestore')).toBe(false);
    });

    it('applies recommended preset and enables collections and backup', async () => {
      const manager = new InstalledFeaturesManager({
        customManifestPath,
        defaultPreset: 'minimal',
      });

      const updated = await manager.applyPreset('recommended');
      expect(updated.preset).toBe('recommended');
      expect(manager.isFeatureEnabled('smartCollections')).toBe(true);
      expect(manager.isFeatureEnabled('backupRestore')).toBe(true);
      expect(manager.isFeatureEnabled('performanceMonitor')).toBe(false);
      expect(manager.isFeatureEnabled('gameNews')).toBe(false);
      expect(manager.isFeatureEnabled('yearInReview')).toBe(false);
    });

    it('contains transparent, realistic resource metrics in metadata', () => {
      const perfMeta = OPTIONAL_FEATURES_METADATA.performanceMonitor;
      expect(perfMeta.ramImpactLabel).toMatch(/0 MB idle/);
      expect(perfMeta.cpuImpactLabel).toMatch(/0.0% idle/);
      expect(perfMeta.diskImpactBytes).toBeGreaterThan(0);
      expect(perfMeta.diskImpactLabel).toMatch(/KB/);

      const newsMeta = OPTIONAL_FEATURES_METADATA.gameNews;
      expect(newsMeta.ramImpactLabel).toMatch(/0 MB idle/);
      expect(newsMeta.cpuImpactLabel).toMatch(/0.0% idle/);

      const backupMeta = OPTIONAL_FEATURES_METADATA.backupRestore;
      expect(backupMeta.ramImpactLabel).toMatch(/0 MB idle/);
    });

    it('preset configurations define exact feature selection', () => {
      expect(PRESET_CONFIGURATIONS.minimal.features.performanceMonitor).toBe(false);
      expect(PRESET_CONFIGURATIONS.minimal.features.gameNews).toBe(false);

      expect(PRESET_CONFIGURATIONS.recommended.features.smartCollections).toBe(true);
      expect(PRESET_CONFIGURATIONS.recommended.features.backupRestore).toBe(true);
      expect(PRESET_CONFIGURATIONS.recommended.features.performanceMonitor).toBe(false);

      expect(PRESET_CONFIGURATIONS.complete.features.yearInReview).toBe(true);
      expect(PRESET_CONFIGURATIONS.complete.features.smartCollections).toBe(true);
      expect(PRESET_CONFIGURATIONS.complete.features.performanceMonitor).toBe(true);
      expect(PRESET_CONFIGURATIONS.complete.features.gameNews).toBe(true);
      expect(PRESET_CONFIGURATIONS.complete.features.backupRestore).toBe(true);
    });
  });

  describe('3. Real Modular Feature Gating & Anti-Fake Verification', () => {
    it('disables and enables installed features with persistent disk update', async () => {
      const manager = new InstalledFeaturesManager({
        customManifestPath,
        defaultPreset: 'complete',
      });

      expect(manager.isFeatureEnabled('performanceMonitor')).toBe(true);

      // Disable performance monitor
      await manager.setFeatureEnabled('performanceMonitor', false);
      expect(manager.isFeatureEnabled('performanceMonitor')).toBe(false);

      // Re-read directly from disk to confirm persistence
      const raw = JSON.parse(fs.readFileSync(customManifestPath, 'utf-8'));
      expect(raw.features.performanceMonitor.enabled).toBe(false);

      // Re-enable
      await manager.setFeatureEnabled('performanceMonitor', true);
      expect(manager.isFeatureEnabled('performanceMonitor')).toBe(true);
    });

    it('prevents enabling an uninstalled feature without installation files (genuine gating)', async () => {
      // Setup manifest where gameNews is NOT installed
      const initial: InstalledFeaturesManifest = {
        manifestVersion: '1.0.0',
        appVersion: '0.2.0',
        preset: 'custom',
        installedAtIso: new Date().toISOString(),
        updatedAtIso: new Date().toISOString(),
        features: {
          yearInReview: { installed: true, enabled: true },
          smartCollections: { installed: true, enabled: true },
          performanceMonitor: { installed: true, enabled: true },
          gameNews: { installed: false, enabled: false },
          backupRestore: { installed: true, enabled: true },
          memoryManagement: { installed: true, enabled: true },
        },
        isInstallerManaged: true,
        installerPath: null,
      };

      fs.writeFileSync(customManifestPath, JSON.stringify(initial), 'utf-8');

      const manager = new InstalledFeaturesManager({ customManifestPath });

      expect(manager.isFeatureInstalled('gameNews')).toBe(false);
      expect(manager.isFeatureEnabled('gameNews')).toBe(false);

      // Attempting to enable uninstalled feature must throw real error
      await expect(manager.setFeatureEnabled('gameNews', true)).rejects.toThrow(
        /is not installed.*Run the MaSwitch Setup installer/i
      );
      expect(manager.isFeatureEnabled('gameNews')).toBe(false);
    });

    it('invokes update callback listener when manifest changes', async () => {
      const manager = new InstalledFeaturesManager({
        customManifestPath,
        defaultPreset: 'complete',
      });

      const listener = vi.fn();
      const unsubscribe = manager.onUpdated(listener);

      await manager.setFeatureEnabled('yearInReview', false);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].features.yearInReview.enabled).toBe(false);

      unsubscribe();
      await manager.setFeatureEnabled('yearInReview', true);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Installer Modify Mode & Setup Handling', () => {
    it('detects and launches installer when candidate exists', async () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('MaSwitch-Setup')) {
          return true;
        }
        return false;
      });

      const manager = new InstalledFeaturesManager({
        customManifestPath,
      });

      const result = await manager.launchInstallerModify();
      expect(result.success).toBe(true);
      existsSpy.mockRestore();
    });

    it('gracefully reports missing installer when no installer binary exists', async () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (typeof p === 'string' && (p.includes('Setup') || p.includes('installer'))) {
          return false;
        }
        return true;
      });

      const manager = new InstalledFeaturesManager({
        customManifestPath,
        installerPath: 'C:\\NonExistentPath\\MaSwitch-Setup.exe',
      });

      const result = await manager.launchInstallerModify();
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/installer setup file was not found/i);

      existsSpy.mockRestore();
    });

    it('only accepts a local MaSwitch setup executable as the recorded installer path', () => {
      expect(isAcceptableInstallerPath('C:\\Users\\u\\Downloads\\MaSwitch-Setup-1.0.5.exe')).toBe(true);
      expect(isAcceptableInstallerPath('C:/Users/u/Downloads/MaSwitch-Setup-1.0.5 (1).exe')).toBe(true);
      expect(isAcceptableInstallerPath('C:\\Windows\\System32\\cmd.exe')).toBe(false);
      expect(isAcceptableInstallerPath('\\\\attacker\\share\\MaSwitch-Setup.exe')).toBe(false);
      expect(isAcceptableInstallerPath('//attacker/share/MaSwitch-Setup.exe')).toBe(false);
      expect(isAcceptableInstallerPath('MaSwitch-Setup.exe')).toBe(false);
      expect(isAcceptableInstallerPath('C:\\x\\MaSwitch-Setup.exe" --evil')).toBe(false);
      expect(isAcceptableInstallerPath('C:\\x\\MaSwitch-Setup.bat')).toBe(false);
    });

    it('does not launch a recorded installer path that is not a MaSwitch setup executable', async () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === 'C:\\Windows\\System32\\cmd.exe');
      const manager = new InstalledFeaturesManager({
        customManifestPath,
        installerPath: 'C:\\Windows\\System32\\cmd.exe',
      });

      const result = await manager.launchInstallerModify();
      expect(result.success).toBe(false);
      existsSpy.mockRestore();
    });
  });
});
