import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { app } from 'electron';
import type {
  InstalledFeaturesManifest,
  InstallPresetId,
  OptionalFeatureId,
} from '../../../src/shared/types/features';
import {
  OPTIONAL_FEATURES_METADATA,
  PRESET_CONFIGURATIONS,
} from '../../../src/shared/types/features';

export class InstalledFeaturesManager {
  private manifest: InstalledFeaturesManifest;
  private manifestPath: string;
  private onUpdatedCallback?: (manifest: InstalledFeaturesManifest) => void;

  constructor(options?: {
    customManifestPath?: string;
    installerPath?: string;
    defaultPreset?: InstallPresetId;
  }) {
    const userDataDir = typeof app?.getPath === 'function' ? app.getPath('userData') : process.cwd();
    const appDir = typeof app?.getPath === 'function' ? path.dirname(app.getPath('exe')) : process.cwd();

    // 1. Determine manifest file path
    if (options?.customManifestPath) {
      this.manifestPath = options.customManifestPath;
    } else {
      // Prefer userData directory for write safety (Program Files requires UAC)
      this.manifestPath = path.join(userDataDir, 'installed-features.json');
    }

    // Check for an installer-written seed manifest in the application directory
    const installerSeedPath = path.join(appDir, 'installed-features.json');

    this.manifest = this.loadOrInitializeManifest({
      installerSeedPath,
      userManifestPath: this.manifestPath,
      installerPath: options?.installerPath,
      defaultPreset: options?.defaultPreset ?? 'complete',
    });
  }

  private parseManifestJson(raw: string): Partial<InstalledFeaturesManifest> {
    const normalized = raw.replace(
      /"installerPath":\s*"([^"]*)"/g,
      (_match, p1: string) => `"installerPath": "${p1.replace(/\\/g, '/').replace(/\/+/g, '/')}"`
    );
    return JSON.parse(normalized) as Partial<InstalledFeaturesManifest>;
  }

  private loadOrInitializeManifest(config: {
    installerSeedPath: string;
    userManifestPath: string;
    installerPath?: string;
    defaultPreset: InstallPresetId;
  }): InstalledFeaturesManifest {
    const now = new Date().toISOString();
    const appVersion = typeof app?.getVersion === 'function' ? app.getVersion() : '1.0.0';

    // A. Check if user manifest already exists
    if (fs.existsSync(config.userManifestPath)) {
      try {
        const raw = fs.readFileSync(config.userManifestPath, 'utf-8');
        const parsed = this.parseManifestJson(raw);
        if (parsed.manifestVersion === '1.0.0' && parsed.features) {
          return this.sanitizeManifest(parsed as InstalledFeaturesManifest);
        }
      } catch {
        // Fall back to seed or default
      }
    }

    // B. Check if installer placed a seed file during installation
    if (fs.existsSync(config.installerSeedPath)) {
      try {
        const raw = fs.readFileSync(config.installerSeedPath, 'utf-8');
        const parsed = this.parseManifestJson(raw);
        if (parsed.features) {
          const sanitized = this.sanitizeManifest({
            ...parsed,
            isInstallerManaged: true,
          } as InstalledFeaturesManifest);
          this.saveManifestToDisk(sanitized);
          return sanitized;
        }
      } catch {
        // Fall through to default
      }
    }

    // C. Default installation configuration (e.g. Complete for unpacked, or specified preset)
    const presetConfig = PRESET_CONFIGURATIONS[config.defaultPreset];
    const initialFeatures: InstalledFeaturesManifest['features'] = {
      yearInReview: {
        installed: presetConfig.features.yearInReview,
        enabled: presetConfig.features.yearInReview,
        installedAtIso: presetConfig.features.yearInReview ? now : undefined,
      },
      smartCollections: {
        installed: presetConfig.features.smartCollections,
        enabled: presetConfig.features.smartCollections,
        installedAtIso: presetConfig.features.smartCollections ? now : undefined,
      },
      performanceMonitor: {
        installed: presetConfig.features.performanceMonitor,
        enabled: presetConfig.features.performanceMonitor,
        installedAtIso: presetConfig.features.performanceMonitor ? now : undefined,
      },
      gameNews: {
        installed: presetConfig.features.gameNews,
        enabled: presetConfig.features.gameNews,
        installedAtIso: presetConfig.features.gameNews ? now : undefined,
      },
      backupRestore: {
        installed: presetConfig.features.backupRestore,
        enabled: presetConfig.features.backupRestore,
        installedAtIso: presetConfig.features.backupRestore ? now : undefined,
      },
      memoryManagement: {
        installed: presetConfig.features.memoryManagement,
        enabled: presetConfig.features.memoryManagement,
        installedAtIso: presetConfig.features.memoryManagement ? now : undefined,
      },
    };

    const initialManifest: InstalledFeaturesManifest = {
      manifestVersion: '1.0.0',
      appVersion,
      preset: config.defaultPreset,
      installedAtIso: now,
      updatedAtIso: now,
      features: initialFeatures,
      isInstallerManaged: false,
      installerPath: config.installerPath ?? null,
    };

    this.saveManifestToDisk(initialManifest);
    return initialManifest;
  }

  private sanitizeManifest(manifest: InstalledFeaturesManifest): InstalledFeaturesManifest {
    const featureIds: OptionalFeatureId[] = [
      'yearInReview',
      'smartCollections',
      'performanceMonitor',
      'gameNews',
      'backupRestore',
      'memoryManagement',
    ];

    const sanitizedFeatures = { ...manifest.features };
    for (const id of featureIds) {
      if (!sanitizedFeatures[id]) {
        sanitizedFeatures[id] = {
          installed: false,
          enabled: false,
        };
      }
    }

    return {
      manifestVersion: '1.0.0',
      appVersion: manifest.appVersion || '1.0.0',
      preset: manifest.preset || 'custom',
      installedAtIso: manifest.installedAtIso || new Date().toISOString(),
      updatedAtIso: manifest.updatedAtIso || new Date().toISOString(),
      features: sanitizedFeatures,
      isInstallerManaged: Boolean(manifest.isInstallerManaged),
      installerPath: manifest.installerPath ?? null,
    };
  }

  private saveManifestToDisk(manifest: InstalledFeaturesManifest): void {
    try {
      const dir = path.dirname(this.manifestPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    } catch (err) {
      console.error('[InstalledFeaturesManager] Failed to persist features manifest:', err);
    }
  }

  public getManifest(): InstalledFeaturesManifest {
    return { ...this.manifest };
  }

  public isFeatureInstalled(featureId: OptionalFeatureId): boolean {
    return Boolean(this.manifest.features[featureId]?.installed);
  }

  public isFeatureEnabled(featureId: OptionalFeatureId): boolean {
    const f = this.manifest.features[featureId];
    return Boolean(f?.installed && f?.enabled);
  }

  public async setFeatureEnabled(
    featureId: OptionalFeatureId,
    enabled: boolean
  ): Promise<InstalledFeaturesManifest> {
    const f = this.manifest.features[featureId];
    if (!f) {
      throw new Error(`Unknown feature: ${featureId}`);
    }

    // Genuine requirement: if not installed, user cannot pretend to enable it without installation files
    if (enabled && !f.installed) {
      throw new Error(
        `Feature "${OPTIONAL_FEATURES_METADATA[featureId]?.name ?? featureId}" is not installed. Run the MaSwitch Setup installer to install this component.`
      );
    }

    this.manifest.features[featureId] = {
      ...f,
      enabled,
    };
    this.manifest.updatedAtIso = new Date().toISOString();
    this.saveManifestToDisk(this.manifest);

    if (this.onUpdatedCallback) {
      this.onUpdatedCallback(this.getManifest());
    }

    return this.getManifest();
  }

  public async applyPreset(presetId: InstallPresetId): Promise<InstalledFeaturesManifest> {
    const preset = PRESET_CONFIGURATIONS[presetId];
    if (!preset) {
      throw new Error(`Unknown preset: ${presetId}`);
    }

    const now = new Date().toISOString();
    const updatedFeatures = { ...this.manifest.features };

    for (const [key, shouldEnable] of Object.entries(preset.features) as [OptionalFeatureId, boolean][]) {
      const current = updatedFeatures[key] || { installed: false, enabled: false };
      updatedFeatures[key] = {
        installed: shouldEnable || current.installed,
        enabled: shouldEnable,
        installedAtIso: shouldEnable ? current.installedAtIso || now : current.installedAtIso,
      };
    }

    this.manifest = {
      ...this.manifest,
      preset: presetId,
      updatedAtIso: now,
      features: updatedFeatures,
    };

    this.saveManifestToDisk(this.manifest);

    if (this.onUpdatedCallback) {
      this.onUpdatedCallback(this.getManifest());
    }

    return this.getManifest();
  }

  public onUpdated(callback: (manifest: InstalledFeaturesManifest) => void): () => void {
    this.onUpdatedCallback = callback;
    return () => {
      if (this.onUpdatedCallback === callback) {
        this.onUpdatedCallback = undefined;
      }
    };
  }

  public async launchInstallerModify(): Promise<{ success: boolean; message?: string }> {
    // 1. If explicit installer path is recorded, try that
    if (this.manifest.installerPath && fs.existsSync(this.manifest.installerPath)) {
      try {
        const child = spawn(this.manifest.installerPath, ['--modify'], {
          detached: true,
          stdio: 'ignore',
        });
        child.on('error', () => {});
        child.unref?.();
        return { success: true };
      } catch (err) {
        return { success: false, message: `Failed to launch installer: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    // 2. Check standard release or download locations
    const exeDir = typeof app?.getPath === 'function' ? path.dirname(app.getPath('exe')) : process.cwd();
    const version = typeof app?.getVersion === 'function' ? app.getVersion() : '1.0.0';
    const candidatePaths = [
      path.join(process.cwd(), 'release', `MaSwitch-Setup-${version}.exe`),
      path.join(process.cwd(), 'release', 'MaSwitch-Setup-1.0.0.exe'),
      path.join(process.cwd(), 'release', 'MaSwitch-Setup-0.2.0.exe'),
      path.join(exeDir, `MaSwitch-Setup-${version}.exe`),
      path.join(exeDir, 'MaSwitch-Setup-1.0.0.exe'),
      path.join(exeDir, 'MaSwitch-Setup-0.2.0.exe'),
      path.join(exeDir, 'MaSwitch-Setup.exe'),
      path.join(exeDir, '..', 'MaSwitch-Setup.exe'),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const child = spawn(p, ['--modify'], { detached: true, stdio: 'ignore' });
          child.on('error', () => {});
          child.unref?.();
          return { success: true };
        } catch (err) {
          return { success: false, message: `Failed to launch installer at ${p}: ${err instanceof Error ? err.message : String(err)}` };
        }
      }
    }

    return {
      success: false,
      message: 'MaSwitch installer setup file was not found on this system. You can enable or disable any currently installed feature directly from this page.',
    };
  }
}
