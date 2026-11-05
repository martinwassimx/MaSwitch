import type { LibraryViewMode } from './game';

export type NavigationSection =
  | 'home'
  | 'library'
  | 'accounts'
  | 'platforms'
  | 'statistics'
  | 'settings';

export type ThemePresetId = 'dark-graphite' | 'deep-navy' | 'obsidian-contrast';

export type AccentColorId =
  | 'electric-blue'
  | 'cyber-violet'
  | 'neon-cyan'
  | 'emerald-pulse'
  | 'crimson-core';

export type WindowCloseBehavior = 'minimize-to-tray' | 'exit';

export interface MaSwitchSettings {
  theme: ThemePresetId;
  accentColor: AccentColorId;
  animationsEnabled: boolean;
  reducedMotion: boolean;
  sidebarCollapsed: boolean;
  showSidebarCounts: boolean;
  compactGameCards: boolean;
  defaultLibraryView: LibraryViewMode;
  defaultLandingPage: NavigationSection;
  launchOnWindowsStartupPreference: boolean;
  startMinimizedToTrayPreference: boolean;
  showDemoNotices: boolean;
  favoriteGameIds: string[];

  // Phase 2 Real Gaming Engine Settings
  demoModeEnabled: boolean;
  autoScanOnStartup: boolean;
  includeRegistryApps: boolean;
  customScanFolders: string[];
  closeBehavior: WindowCloseBehavior;
  playtimeTrackingEnabled: boolean;
  steamGridDbApiKey?: string;
  riotLiveSwitchingEnabled?: boolean;
  riotAutoSubmitLogin?: boolean;
}

export const DEFAULT_SETTINGS: MaSwitchSettings = {
  theme: 'dark-graphite',
  accentColor: 'electric-blue',
  animationsEnabled: true,
  reducedMotion: false,
  sidebarCollapsed: false,
  showSidebarCounts: true,
  compactGameCards: false,
  defaultLibraryView: 'grid',
  defaultLandingPage: 'home',
  launchOnWindowsStartupPreference: false,
  startMinimizedToTrayPreference: false,
  showDemoNotices: true,
  favoriteGameIds: ['cyber-odyssey-2099', 'aether-protocol', 'valkyrie-horizon'],
  demoModeEnabled: false,
  autoScanOnStartup: true,
  includeRegistryApps: false,
  customScanFolders: [],
  closeBehavior: 'minimize-to-tray',
  playtimeTrackingEnabled: true,
  steamGridDbApiKey: '',
  riotLiveSwitchingEnabled: false,
  riotAutoSubmitLogin: true,
};

export interface WindowsStartupState {
  openAtLogin: boolean;
  startMinimized: boolean;
  osOpenAtLoginActive: boolean;
  supported: boolean;
  errorMessage?: string;
}

export interface AppRuntimeInfo {
  appName: string;
  appVersion: string;
  phaseLabel: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  isPackaged: boolean;
}
