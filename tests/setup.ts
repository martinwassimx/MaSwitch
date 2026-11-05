import '@testing-library/jest-dom';
import { beforeEach, vi } from 'vitest';
import { DEFAULT_SETTINGS, type MaSwitchSettings } from '../src/shared/types/settings';
import { sanitizeSettings } from '../src/shared/validation/settingsValidator';
import type { GameItem, CustomGameInput, EditGameInput } from '../src/shared/types/game';
import {
  generateLocalGameCoverSvg,
  generateLocalGameHeroSvg,
} from '../src/shared/utils/proceduralCover';

let mockDiskSettings: MaSwitchSettings = sanitizeSettings(DEFAULT_SETTINGS);
let mockIsMaximized = false;
let mockRealLibraryGames: GameItem[] = [];

export function getMockDiskSettings(): MaSwitchSettings {
  return mockDiskSettings;
}

export function setMockRealLibraryGames(games: GameItem[]): void {
  mockRealLibraryGames = [...games];
}

beforeEach(() => {
  window.localStorage.clear();
  mockDiskSettings = sanitizeSettings(DEFAULT_SETTINGS);
  mockIsMaximized = false;
  mockRealLibraryGames = [];

  window.maswitch = {
    windowControls: {
      minimize: vi.fn(async () => undefined),
      toggleMaximize: vi.fn(async () => {
        mockIsMaximized = !mockIsMaximized;
        return {
          isMaximized: mockIsMaximized,
          isFullScreen: false,
          isFocused: true,
        };
      }),
      close: vi.fn(async () => undefined),
      getState: vi.fn(async () => ({
        isMaximized: mockIsMaximized,
        isFullScreen: false,
        isFocused: true,
      })),
      onStateChanged: vi.fn(() => () => undefined),
    },
    settings: {
      load: vi.fn(async () => ({
        ...mockDiskSettings,
        favoriteGameIds: [...mockDiskSettings.favoriteGameIds],
      })),
      save: vi.fn(async (partial: Partial<MaSwitchSettings>) => {
        mockDiskSettings = sanitizeSettings(
          { ...mockDiskSettings, ...partial },
          mockDiskSettings
        );
        return {
          ...mockDiskSettings,
          favoriteGameIds: [...mockDiskSettings.favoriteGameIds],
        };
      }),
      reset: vi.fn(async () => {
        mockDiskSettings = sanitizeSettings(DEFAULT_SETTINGS);
        return {
          ...mockDiskSettings,
          favoriteGameIds: [...mockDiskSettings.favoriteGameIds],
        };
      }),
    },
    app: {
      getRuntimeInfo: vi.fn(async () => ({
        appName: 'MaSwitch',
        appVersion: '0.2.0',
        phaseLabel: 'Phase 2 — Real Windows Gaming Engine',
        electronVersion: '33.4.11',
        chromeVersion: '130.0.0',
        nodeVersion: '20.18.3',
        platform: 'win32',
        arch: 'x64',
        isPackaged: false,
      })),
    },
    library: {
      getGames: vi.fn(async () => [...mockRealLibraryGames]),
      addCustomGame: vi.fn(async (input: CustomGameInput) => {
        const created: GameItem = {
          id: `custom-${Date.now()}`,
          title: input.title,
          subtitle: 'Custom Windows Executable',
          platformId: 'custom',
          platformName: 'Custom PC',
          isInstalled: true,
          isFeatured: false,
          isDemoData: false,
          metadataAvailable: false,
          sourceType: 'custom-manual',
          launchMethod: 'executable',
          executablePath: input.executablePath,
          workingDirectory: input.workingDirectory,
          launchArgs: input.launchArgs,
          playtimeHours: 0,
          recentTwoWeeksHours: 0,
          lastPlayedIso: null,
          lastPlayedLabel: 'Never played',
          releaseYear: 2026,
          releaseDateLabel: 'Local Custom Entry',
          developer: 'Local Executable',
          publisher: 'Custom PC',
          genres: ['Custom Game'],
          tags: ['Local'],
          coverImage:
            input.coverImage ??
            generateLocalGameCoverSvg(input.title, 'custom', 'Custom PC'),
          heroBackgroundImage: generateLocalGameHeroSvg(input.title, 'custom'),
          accentHex: '#06b6d4',
          shortDescription: `Custom executable at ${input.executablePath}`,
          fullDescription: [`Custom executable at ${input.executablePath}`],
          keyFeatures: ['Safe Direct Launch'],
          screenshots: [],
          trailers: [],
          rating: {
            overallScore: 0,
            criticScore: 0,
            userScore: 0,
            totalReviewsLabel: 'Metadata Unavailable Offline',
            reviewSummary: 'Metadata Unavailable Offline',
            ageRating: 'Unrated',
            contentDescriptors: [],
          },
          systemRequirements: {
            minimum: {
              os: 'Windows 10/11',
              processor: 'Metadata Unavailable Offline',
              memory: 'Metadata Unavailable Offline',
              graphics: 'Metadata Unavailable Offline',
              directX: 'Metadata Unavailable Offline',
              storage: '0 GB',
            },
            recommended: {
              os: 'Windows 10/11',
              processor: 'Metadata Unavailable Offline',
              memory: 'Metadata Unavailable Offline',
              graphics: 'Metadata Unavailable Offline',
              directX: 'Metadata Unavailable Offline',
              storage: '0 GB',
            },
          },
          ownership: {
            accountSlotLabel: 'Local Windows Machine (Custom)',
            licenseType: 'Custom Executable Entry',
            acquiredDateLabel: 'Added Locally',
            drmSystem: 'None',
            installSizeGb: 0,
            installLocationPreview: input.executablePath,
            buildVersion: 'Local',
          },
          achievements: {
            supported: false,
            platformSource: 'Not Available',
            unlockedCount: 0,
            totalCount: 0,
            completionPercentage: 0,
            items: [],
          },
        };
        mockRealLibraryGames.push(created);
        return created;
      }),
      removeGame: vi.fn(async (gameId: string) => {
        mockRealLibraryGames = mockRealLibraryGames.filter(
          (g) => g.id !== gameId
        );
        return true;
      }),
      restoreGame: vi.fn(async (_gameId: string) => {
        return true;
      }),
      getRemovedGames: vi.fn(async () => []),
      updateGame: vi.fn(async (gameId: string, input: EditGameInput) => {
        const idx = mockRealLibraryGames.findIndex((g) => g.id === gameId);
        if (idx === -1) return null;
        const current = mockRealLibraryGames[idx];
        const updated: GameItem = {
          ...current,
          title: input.title?.trim() || current.title,
          platformId: input.platformId ?? current.platformId,
          platformName: input.platformId
            ? input.platformId === 'ea'
              ? 'EA App'
              : String(input.platformId)
            : current.platformName,
          executablePath: input.executablePath ?? current.executablePath,
          installPath: input.installPath ?? current.installPath,
          userPlatformOverride: input.platformId ?? current.userPlatformOverride,
          isUserEdited: true,
        };
        mockRealLibraryGames[idx] = updated;
        return updated;
      }),
      toggleFavorite: vi.fn(async (gameId: string) => {
        const exists = mockDiskSettings.favoriteGameIds.includes(gameId);
        mockDiskSettings = {
          ...mockDiskSettings,
          favoriteGameIds: exists
            ? mockDiskSettings.favoriteGameIds.filter((id) => id !== gameId)
            : [...mockDiskSettings.favoriteGameIds, gameId],
        };
        return {
          gameId,
          isFavorite: !exists,
          favoriteGameIds: [...mockDiskSettings.favoriteGameIds],
        };
      }),
      selectExecutableDialog: vi.fn(
        async () => 'C:\\Games\\TestGame\\TestGame.exe'
      ),
      selectFolderDialog: vi.fn(async () => 'C:\\Games\\TestGame'),
      onLibraryUpdated: vi.fn(() => () => undefined),
    },
    scanner: {
      startScan: vi.fn(async () => ({
        scanId: 'mock-scan-1',
        status: 'completed' as const,
        startedAtIso: new Date().toISOString(),
        finishedAtIso: new Date().toISOString(),
        totalFound: mockRealLibraryGames.length,
        addedOrUpdatedCount: 0,
        duplicatesSkipped: 0,
        platformReports: [],
        errors: [],
      })),
      cancelScan: vi.fn(async () => true),
      getHistory: vi.fn(async () => []),
      getPlatformReports: vi.fn(async () => []),
      onProgress: vi.fn(() => () => undefined),
    },
    launcher: {
      launchGame: vi.fn(async (gameId: string) => ({
        success: true,
        gameId,
        status: 'launching' as const,
        message: 'Launched game process.',
        startedAtIso: new Date().toISOString(),
      })),
      getStatuses: vi.fn(async () => ({})),
      onStatusChanged: vi.fn(() => () => undefined),
    },
    tracker: {
      getStatistics: vi.fn(async () => ({
        totalGamingHours: 0,
        activeDaysLast30: 0,
        averageSessionHours: 0,
        currentStreakDays: 0,
        completionAveragePercent: 0,
        todayHours: 0,
        thisWeekHours: 0,
        thisMonthHours: 0,
        totalSessionsCount: 0,
        isDemoData: false,
        weeklyActivity: [],
        monthlyActivity: [],
        platformBreakdown: [],
        genreBreakdown: [],
        recentSessions: [],
      })),
      getStatus: vi.fn(async () => ({
        enabled: true,
        paused: false,
        activeSessions: [],
      })),
      setPaused: vi.fn(async (paused: boolean) => ({
        enabled: true,
        paused,
        activeSessions: [],
      })),
      onSessionUpdated: vi.fn(() => () => undefined),
    },
    startup: {
      getState: vi.fn(async () => ({
        openAtLogin: mockDiskSettings.launchOnWindowsStartupPreference,
        startMinimized: mockDiskSettings.startMinimizedToTrayPreference,
        supported: true,
        osOpenAtLoginActive: mockDiskSettings.launchOnWindowsStartupPreference,
      })),
      setConfiguration: vi.fn(
        async (config: { openAtLogin: boolean; startMinimized: boolean }) => {
          mockDiskSettings = {
            ...mockDiskSettings,
            launchOnWindowsStartupPreference: config.openAtLogin,
            startMinimizedToTrayPreference: config.startMinimized,
          };
          return {
            openAtLogin: config.openAtLogin,
            startMinimized: config.startMinimized,
            supported: true,
            osOpenAtLoginActive: config.openAtLogin,
          };
        }
      ),
    },
  };
});

