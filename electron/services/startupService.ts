import { app } from 'electron';
import type { WindowsStartupState } from '../../src/shared/types/settings';
import type { ElectronSettingsStore } from './settingsStore';

export class MaSwitchStartupService {
  private readonly settingsStore: ElectronSettingsStore;

  constructor(settingsStore: ElectronSettingsStore) {
    this.settingsStore = settingsStore;
  }

  public getStartupState(): WindowsStartupState {
    const saved = this.settingsStore.load();
    const supported = process.platform === 'win32' || process.platform === 'darwin';

    if (!supported) {
      return {
        openAtLogin: saved.launchOnWindowsStartupPreference,
        startMinimized: saved.startMinimizedToTrayPreference,
        osOpenAtLoginActive: false,
        supported: false,
        errorMessage: 'OS login item registration is only supported on Windows and macOS.',
      };
    }

    try {
      const args = saved.startMinimizedToTrayPreference ? ['--hidden'] : [];
      const loginInfo = app.getLoginItemSettings({ args });

      return {
        openAtLogin: saved.launchOnWindowsStartupPreference,
        startMinimized: saved.startMinimizedToTrayPreference,
        osOpenAtLoginActive: Boolean(loginInfo.openAtLogin),
        supported: true,
      };
    } catch (err) {
      return {
        openAtLogin: saved.launchOnWindowsStartupPreference,
        startMinimized: saved.startMinimizedToTrayPreference,
        osOpenAtLoginActive: false,
        supported: true,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public setStartupConfiguration(config: {
    openAtLogin: boolean;
    startMinimized: boolean;
  }): WindowsStartupState {
    const openAtLogin = Boolean(config.openAtLogin);
    const startMinimized = Boolean(config.startMinimized);

    this.settingsStore.save({
      launchOnWindowsStartupPreference: openAtLogin,
      startMinimizedToTrayPreference: startMinimized,
    });

    const supported = process.platform === 'win32' || process.platform === 'darwin';
    if (!supported) {
      return {
        openAtLogin,
        startMinimized,
        osOpenAtLoginActive: false,
        supported: false,
        errorMessage: 'OS login item registration is only supported on Windows and macOS.',
      };
    }

    try {
      const args = startMinimized ? ['--hidden'] : [];
      app.setLoginItemSettings({
        openAtLogin,
        args,
      });

      const updatedInfo = app.getLoginItemSettings({ args });
      return {
        openAtLogin,
        startMinimized,
        osOpenAtLoginActive: Boolean(updatedInfo.openAtLogin),
        supported: true,
      };
    } catch (err) {
      return {
        openAtLogin,
        startMinimized,
        osOpenAtLoginActive: false,
        supported: true,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

