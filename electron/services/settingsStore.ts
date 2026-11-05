import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  DEFAULT_SETTINGS,
  type MaSwitchSettings,
} from '../../src/shared/types/settings';
import { sanitizeSettings } from '../../src/shared/validation/settingsValidator';

export class ElectronSettingsStore {
  private readonly filePath: string;
  private cachedSettings: MaSwitchSettings | null = null;

  constructor(customDir?: string) {
    const baseDir = customDir ?? app.getPath('userData');
    this.filePath = path.join(baseDir, 'maswitch-settings.v1.json');
  }

  public load(): MaSwitchSettings {
    if (this.cachedSettings) {
      return {
        ...this.cachedSettings,
        favoriteGameIds: [...this.cachedSettings.favoriteGameIds],
      };
    }

    try {
      if (!fs.existsSync(this.filePath)) {
        const initial = sanitizeSettings(DEFAULT_SETTINGS);
        this.writeToDisk(initial);
        this.cachedSettings = initial;
        return initial;
      }

      const rawText = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(rawText) as unknown;
      const sanitized = sanitizeSettings(parsed, DEFAULT_SETTINGS);
      this.cachedSettings = sanitized;
      return {
        ...sanitized,
        favoriteGameIds: [...sanitized.favoriteGameIds],
      };
    } catch {
      const fallback = sanitizeSettings(DEFAULT_SETTINGS);
      this.cachedSettings = fallback;
      return fallback;
    }
  }

  public save(partial: unknown): MaSwitchSettings {
    const current = this.load();
    const merged =
      partial && typeof partial === 'object'
        ? { ...current, ...(partial as Record<string, unknown>) }
        : current;
    const sanitized = sanitizeSettings(merged, current);
    this.writeToDisk(sanitized);
    this.cachedSettings = sanitized;
    return {
      ...sanitized,
      favoriteGameIds: [...sanitized.favoriteGameIds],
    };
  }

  public reset(): MaSwitchSettings {
    const defaults = sanitizeSettings(DEFAULT_SETTINGS);
    this.writeToDisk(defaults);
    this.cachedSettings = defaults;
    return {
      ...defaults,
      favoriteGameIds: [...defaults.favoriteGameIds],
    };
  }

  private writeToDisk(settings: MaSwitchSettings): void {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch {
      // Fallback direct write if rename across locked handles fails on Windows
      try {
        fs.writeFileSync(
          this.filePath,
          JSON.stringify(settings, null, 2),
          'utf-8'
        );
      } catch {
        // Ignore disk write failure in read-only environments
      }
    }
  }
}

