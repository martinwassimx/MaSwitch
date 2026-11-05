import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  OPTIONAL_FEATURES_METADATA,
  PRESET_CONFIGURATIONS,
} from '../src/shared/types/features';
import {
  MemoryManagementService,
  PROTECTED_PROCESS_NAMES,
} from '../electron/services/memory/memoryManagementService';
import type {
  MemoryCleanupHistoryEntry,
  MemoryCleanupOperations,
} from '../src/shared/types/memory';
import {
  DEFAULT_ADVANCED_OPERATIONS,
} from '../src/shared/types/memory';
import type { MaSwitchSqliteDatabase } from '../electron/services/database/sqliteDatabase';
import type { PlaytimeTrackerEngine } from '../electron/services/tracker/playtimeTrackerEngine';

// Mock DB
class MockDatabase {
  public history: MemoryCleanupHistoryEntry[] = [];

  public recordMemoryCleanup(entry: MemoryCleanupHistoryEntry) {
    this.history.unshift({ ...entry });
  }

  public getMemoryCleanupHistory(limit: number = 50) {
    return this.history.slice(0, limit);
  }

  public clearMemoryCleanupHistory() {
    this.history = [];
  }
}

describe('MaSwitch Mem Reduct Integration & Memory Management Test Suite', () => {
  describe('1. Feature Specification & Preset Configuration', () => {
    it('defines memoryManagement metadata as a recognized optional feature', () => {
      const meta = OPTIONAL_FEATURES_METADATA.memoryManagement;
      expect(meta).toBeDefined();
      expect(meta.id).toBe('memoryManagement');
      expect(meta.name).toContain('Memory Management');
      expect(meta.description).toContain('RAM');
    });

    it('ensures Memory Management is DISABLED in Minimal preset', () => {
      expect(PRESET_CONFIGURATIONS.minimal.features.memoryManagement).toBe(false);
    });

    it('ensures Memory Management is DISABLED in Recommended preset', () => {
      expect(PRESET_CONFIGURATIONS.recommended.features.memoryManagement).toBe(false);
    });

    it('ensures Memory Management is ENABLED in Complete preset', () => {
      expect(PRESET_CONFIGURATIONS.complete.features.memoryManagement).toBe(true);
    });
  });

  describe('2. Memory Readings & Accurate Metrics', () => {
    let mockDb: MockDatabase;
    let service: MemoryManagementService;

    beforeEach(() => {
      mockDb = new MockDatabase();
      service = new MemoryManagementService(
        mockDb as unknown as MaSwitchSqliteDatabase,
        {
          getStatus: () => ({ enabled: true, paused: false, activeSessions: [] }),
        } as unknown as PlaytimeTrackerEngine,
        {
          rawMemoryQuery: () => ({
            totalBytes: 16 * 1024 * 1024 * 1024, // 16 GB
            freeBytes: 6 * 1024 * 1024 * 1024,  // 6 GB free
            pageFileTotalBytes: 20 * 1024 * 1024 * 1024,
            pageFileFreeBytes: 12 * 1024 * 1024 * 1024,
          }),
          maSwitchWorkingSetGetter: () => 85 * 1024 * 1024, // 85 MB
        }
      );
    });

    it('calculates physical memory metrics accurately without fabrication', () => {
      const metrics = service.getSystemMemoryMetrics();
      expect(metrics.totalPhysicalMb).toBe(16384);
      expect(metrics.availablePhysicalMb).toBe(6144);
      expect(metrics.usedPhysicalMb).toBe(10240);
      expect(metrics.utilizationPercent).toBe(62.5);
      expect(metrics.maSwitchWorkingSetMb).toBe(85);
      expect(metrics.isGameRunning).toBe(false);
      expect(metrics.activeGameTitle).toBeNull();
    });
  });

  describe('3. Active-Game Protection Gate (Safety Requirement)', () => {
    it('strictly aborts cleanup when a game is currently active', async () => {
      const mockDb = new MockDatabase();
      const gameService = new MemoryManagementService(
        mockDb as unknown as MaSwitchSqliteDatabase,
        {
          getStatus: () => ({
            enabled: true,
            paused: false,
            activeSessions: [
              {
                id: 'sess-cs2',
                gameId: 'game-1',
                gameTitle: 'Counter-Strike 2',
                startTime: Date.now() - 30000,
                durationSeconds: 30,
                platformId: 'steam',
                executable: 'cs2.exe',
              },
            ],
          }),
        } as unknown as PlaytimeTrackerEngine,
        {
          rawMemoryQuery: () => ({
            totalBytes: 16e9,
            freeBytes: 4e9,
          }),
        }
      );

      const result = await gameService.performCleanup({ mode: 'standard' });

      expect(result.success).toBe(false);
      expect(result.status).toBe('cancelled');
      expect(result.message).toContain('Counter-Strike 2');
      expect(result.message).toContain('active to protect');
      expect(result.freedMb).toBe(0);
      expect(mockDb.history.length).toBe(0); // Never recorded as a cleanup
    });
  });

  describe('4. Standard Mode vs Advanced Mode Cleanup Operations', () => {
    let mockDb: MockDatabase;
    let service: MemoryManagementService;
    let lastPrivilegedOps: MemoryCleanupOperations | null = null;
    let trimmedCountResult = 0;

    beforeEach(() => {
      mockDb = new MockDatabase();
      lastPrivilegedOps = null;
      let callCount = 0;

      service = new MemoryManagementService(
        mockDb as unknown as MaSwitchSqliteDatabase,
        {
          getStatus: () => ({ enabled: true, paused: false, activeSessions: [] }),
        } as unknown as PlaytimeTrackerEngine,
        {
          rawMemoryQuery: () => {
            callCount++;
            // Simulate 800 MB reclaimed after cleanup
            const free = callCount > 1 ? 5800 * 1024 * 1024 : 5000 * 1024 * 1024;
            return {
              totalBytes: 16 * 1024 * 1024 * 1024,
              freeBytes: free,
            };
          },
          maSwitchWorkingSetGetter: () => 70 * 1024 * 1024,
          workingSetTrimmer: async () => {
            trimmedCountResult = 18;
            return { trimmedProcessCount: 18 };
          },
          privilegedListCleaner: async (ops: MemoryCleanupOperations) => {
            lastPrivilegedOps = { ...ops };
            return {
              success: true,
              status: 'success',
              message: 'Purged',
              elevationRequired: true,
            };
          },
        }
      );
    });

    it('runs conservative operations in Standard Mode without freezing/stuttering risks', async () => {
      const res = await service.performCleanup({ mode: 'standard' });

      expect(res.success).toBe(true);
      expect(res.mode).toBe('standard');
      expect(res.status).toBe('success');
      expect(res.freedMb).toBe(800);
      expect(trimmedCountResult).toBe(18);

      // Verify conservative defaults:
      expect(lastPrivilegedOps).toBeDefined();
      expect(lastPrivilegedOps?.workingSets).toBe(true);
      expect(lastPrivilegedOps?.standbyPriority0).toBe(true);
      expect(lastPrivilegedOps?.combineMemoryLists).toBe(true);
      // Stuttering risks MUST BE FALSE in standard mode:
      expect(lastPrivilegedOps?.standbyList).toBe(false);
      expect(lastPrivilegedOps?.modifiedPageList).toBe(false);

      expect(mockDb.history.length).toBe(1);
      expect(mockDb.history[0].mode).toBe('standard');
    });

    it('allows granular selection of operations in Advanced Mode', async () => {
      const res = await service.performCleanup({
        mode: 'advanced',
        operations: {
          ...DEFAULT_ADVANCED_OPERATIONS,
          standbyList: true, // User explicitly opted into standby purge
          modifiedPageList: false,
        },
      });

      expect(res.success).toBe(true);
      expect(res.mode).toBe('advanced');
      expect(lastPrivilegedOps?.standbyList).toBe(true);
      expect(lastPrivilegedOps?.modifiedPageList).toBe(false);
      expect(mockDb.history[0].mode).toBe('advanced');
    });
  });

  describe('5. Permission-Denied & User-Cancellation Handling', () => {
    it('handles user cancellation of UAC elevation gracefully', async () => {
      const mockDb = new MockDatabase();
      const cancellingService = new MemoryManagementService(
        mockDb as unknown as MaSwitchSqliteDatabase,
        {
          getStatus: () => ({ enabled: true, paused: false, activeSessions: [] }),
        } as unknown as PlaytimeTrackerEngine,
        {
          rawMemoryQuery: () => ({ totalBytes: 16e9, freeBytes: 4e9 }),
          privilegedListCleaner: async () => ({
            success: false,
            status: 'cancelled',
            message: 'Elevation declined by user',
            elevationRequired: true,
          }),
        }
      );

      const result = await cancellingService.performCleanup({
        mode: 'advanced',
        operations: {
          workingSets: true,
          standbyPriority0: true,
          systemFileCache: true,
          standbyList: false,
          modifiedPageList: false,
          combineMemoryLists: false,
          registryCache: false,
        },
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('cancelled');
      expect(result.message).toContain('cancelled by user');
      expect(result.freedMb).toBe(0);
    });

    it('handles partial execution if a native operation is unsupported', async () => {
      const mockDb = new MockDatabase();
      const partialService = new MemoryManagementService(
        mockDb as unknown as MaSwitchSqliteDatabase,
        {
          getStatus: () => ({ enabled: true, paused: false, activeSessions: [] }),
        } as unknown as PlaytimeTrackerEngine,
        {
          rawMemoryQuery: () => ({ totalBytes: 16e9, freeBytes: 4e9 }),
          workingSetTrimmer: async () => ({ trimmedProcessCount: 5 }),
          privilegedListCleaner: async () => ({
            success: false,
            status: 'partial',
            message: 'NtSetSystemInformation returned STATUS_NOT_SUPPORTED',
            elevationRequired: true,
          }),
        }
      );

      const result = await partialService.performCleanup({ mode: 'standard' });
      expect(result.success).toBe(true);
      expect(result.status).toBe('partial');
      expect(result.message).toContain('STATUS_NOT_SUPPORTED');
    });
  });

  describe('6. Zero Application Termination Guarantee', () => {
    it('confirms MemoryManagementService contains NO process termination logic', () => {
      const serviceFile = fs.readFileSync(
        path.join(__dirname, '../electron/services/memory/memoryManagementService.ts'),
        'utf8'
      );

      // Verify absence of application closing logic
      expect(serviceFile).not.toContain('process.kill');
      expect(serviceFile).not.toContain('CANDIDATE_NON_ESSENTIAL_APPS');
      expect(serviceFile).not.toContain('getCleanableAppCandidates');
      expect(serviceFile).not.toContain('processTerminator');
    });

    it('strictly maintains protected process whitelist', () => {
      expect(PROTECTED_PROCESS_NAMES.has('steam.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('epicgameslauncher.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('riotclientservices.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('valorant-win64-shipping.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('cs2.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('wallpaper64.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('vgc.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('msmpeng.exe')).toBe(true);
    });
  });

  describe('7. Non-Regression: Riot Login Automation Integrity', () => {
    it('guarantees riotDesktopLoginAutomation.ts exists and has not been refactored', () => {
      const riotAutomationPath = path.join(
        __dirname,
        '../electron/services/accounts/riotDesktopLoginAutomation.ts'
      );
      expect(fs.existsSync(riotAutomationPath)).toBe(true);

      const content = fs.readFileSync(riotAutomationPath, 'utf8');
      expect(content).toContain('RiotDesktopLoginAutomationService');
      expect(content).toContain('$username');
      expect(content).toContain('$password');
      expect(content).toContain('$autoSubmit');
    });
  });
});
