import fs from 'node:fs';
import { Menu, nativeImage, Tray } from 'electron';

export interface TrayServiceCallbacks {
  onOpenWindow: () => void;
  onRescanGames: () => void;
  onTogglePauseTracking: () => void;
  onExitApplication: () => void;
  isTrackingPaused: () => boolean;
}

export function buildTrayMenuTemplate(callbacks: TrayServiceCallbacks) {
  const paused = callbacks.isTrackingPaused();

  return [
    {
      label: 'MaSwitch — Windows Gaming Engine',
      enabled: false,
    },
    { type: 'separator' as const },
    {
      label: 'Open MaSwitch',
      click: () => callbacks.onOpenWindow(),
    },
    {
      label: 'Rescan Installed Games',
      click: () => callbacks.onRescanGames(),
    },
    {
      label: paused
        ? 'Resume Playtime Tracking'
        : 'Pause Playtime Tracking',
      click: () => callbacks.onTogglePauseTracking(),
    },
    { type: 'separator' as const },
    {
      label: 'Exit MaSwitch Completely',
      click: () => callbacks.onExitApplication(),
    },
  ];
}

export class MaSwitchTrayService {
  private tray: Tray | null = null;
  private readonly iconPath: string;
  private readonly callbacks: TrayServiceCallbacks;

  constructor(iconPath: string, callbacks: TrayServiceCallbacks) {
    this.iconPath = iconPath;
    this.callbacks = callbacks;
  }

  public initialize(): void {
    if (this.tray) {
      return;
    }

    try {
      const img = fs.existsSync(this.iconPath)
        ? nativeImage.createFromPath(this.iconPath)
        : nativeImage.createEmpty();

      this.tray = new Tray(img);
      this.tray.setToolTip('MaSwitch — Windows Gaming Launcher & Playtime Tracker');
      this.tray.on('double-click', () => {
        this.callbacks.onOpenWindow();
      });

      this.refreshMenu();
    } catch {
      // Gracefully skip tray creation in headless environments without system tray support
    }
  }

  public refreshMenu(): void {
    if (!this.tray) {
      return;
    }
    const template = buildTrayMenuTemplate(this.callbacks);
    const contextMenu = Menu.buildFromTemplate(template);
    this.tray.setContextMenu(contextMenu);
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

