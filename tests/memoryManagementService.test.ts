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
  CleanableAppCandidate,
  MemoryCleanupHistoryEntry,
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

describe('Memory Management Integration (Mem Reduct technical reference)', () => {
  describe('1. Feature Specification & Preset Configuration', () => {
    it('defines memoryManagement metadata as a recognized optional feature', () => {
      const meta = OPTIONAL_FEATURES_METADATA.memoryManagement;
      expect(meta).toBeDefined();
      expect(meta.id).toBe('memoryManagement');
      expect(meta.name).toContain('Memory Management');
      expect(meta.description).toContain('RAM');
    });

    it('ensures Memory Management is DISABLED by default in Minimal preset', () => {
      expect(PRESET_CONFIGURATIONS.minimal.features.memoryManagement).toBe(false);
    });

    it('ensures Memory Management is DISABLED by default in Recommended preset', () => {
      expect(PRESET_CONFIGURATIONS.recommended.features.memoryManagement).toBe(false);
    });

    it('ensures Memory Management is ENABLED in Complete preset', () => {
      expect(PRESET_CONFIGURATIONS.complete.features.memoryManagement).toBe(true);
    });
  });

  describe('2. MemoryManagementService Core Logic & Protections', () => {
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
            freeBytes: 4 * 1024 * 1024 * 1024,  // 4 GB free
          }),
          maSwitchWorkingSetGetter: () => 120 * 1024 * 1024, // 120 MB
          processLister: async () => [
            { id: 1001, name: 'discord.exe', workingSetBytes: 300 * 1024 * 1024 },
            { id: 1002, name: 'spotify.exe', workingSetBytes: 250 * 1024 * 1024 },
            { id: 2001, name: 'steam.exe', workingSetBytes: 400 * 1024 * 1024 }, // Protected!
            { id: 2002, name: 'cs2.exe', workingSetBytes: 3000 * 1024 * 1024 },   // Protected!
            { id: 2003, name: 'wallpaper64.exe', workingSetBytes: 150 * 1024 * 1024 }, // Protected!
          ],
          processTerminator: async (pid: number) => {
            return pid === 1001 || pid === 1002;
          },
          workingSetTrimmer: async (protectedPids: number[]) => {
            expect(protectedPids).toBeDefined();
            return { trimmedCount: 12 };
          },
        }
      );
    });

    it('calculates system memory metrics accurately without external tools', () => {
      const metrics = service.getSystemMemoryMetrics();
      expect(metrics.totalPhysicalMb).toBe(16384);
      expect(metrics.availablePhysicalMb).toBe(4096);
      expect(metrics.usedPhysicalMb).toBe(12288);
      expect(metrics.utilizationPercent).toBe(75);
      expect(metrics.maSwitchWorkingSetMb).toBe(120);
      expect(metrics.isGameRunning).toBe(false);
    });

    it('identifies cleanable non-essential background apps while filtering protected processes', async () => {
      const candidates: CleanableAppCandidate[] = await service.getCleanableAppCandidates();

      // discord and spotify should be candidates
      const names = candidates.map((c) => c.name);
      expect(names).toContain('discord.exe');
      expect(names).toContain('spotify.exe');

      // Protected processes MUST NEVER appear as cleanable candidates
      expect(names).not.toContain('steam.exe');
      expect(names).not.toContain('cs2.exe');
      expect(names).not.toContain('wallpaper64.exe');
    });

    it('strictly protects gaming processes, launchers, security software, and wallpaper engine', () => {
      expect(PROTECTED_PROCESS_NAMES.has('steam.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('epicgameslauncher.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('riotclientservices.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('valorant-win64-shipping.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('cs2.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('fortniteclient-win64-shipping.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('wallpaper64.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('wallpaper32.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('vgc.exe')).toBe(true); // Vanguard
      expect(PROTECTED_PROCESS_NAMES.has('easyanticheat.exe')).toBe(true);
      expect(PROTECTED_PROCESS_NAMES.has('msmpeng.exe')).toBe(true); // Windows Defender
    });

    it('prevents memory cleanup when a game is currently active (Gaming Safety Rule)', async () => {
      // Simulate active game running
      const gameRunningService = new MemoryManagementService(
        mockDb as unknown as MaSwitchSqliteDatabase,
        {
          getStatus: () => ({
            enabled: true,
            paused: false,
            activeSessions: [
              {
                id: 'sess-1',
                gameId: 'game-123',
                gameTitle: 'Counter-Strike 2',
                startTime: Date.now() - 60000,
                durationSeconds: 60,
                platformId: 'steam',
                executable: 'cs2.exe',
              },
            ],
          }),
        } as unknown as PlaytimeTrackerEngine,
        {
          rawMemoryQuery: () => ({ totalBytes: 16e9, freeBytes: 4e9 }),
          maSwitchWorkingSetGetter: () => 100e6,
        }
      );

      const result = await gameRunningService.performCleanup({
        mode: 'standard',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('cancelled');
      expect(result.message).toContain('active to protect');
      expect(result.message).toContain('Counter-Strike 2');
    });

    it('performs standard mode cleanup and closes selected user-approved apps', async () => {
      const result = await service.performCleanup({
        mode: 'standard',
        closeAppPids: [1001], // Only Discord
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('standard');
      expect(result.status).toBe('success');
      expect(result.message).toContain('Gracefully closed 1 background application');
      expect(mockDb.history.length).toBe(1);
      expect(mockDb.history[0].mode).toBe('standard');
    });

    it('performs advanced mode working set trimming via Win32 EmptyWorkingSet reference', async () => {
      const result = await service.performCleanup({
        mode: 'advanced',
        trimProcessWorkingSets: true,
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('advanced');
      expect(result.status).toBe('success');
      expect(result.message).toContain('Advanced cleanup completed');
      expect(mockDb.history.length).toBe(1);
      expect(mockDb.history[0].mode).toBe('advanced');
    });

    it('persists and clears cleanup history correctly', () => {
      mockDb.recordMemoryCleanup({
        id: 'cl-1',
        timestampIso: new Date().toISOString(),
        mode: 'standard',
        action: 'self_trim',
        status: 'success',
        ramBeforeMb: 12000,
        ramAfterMb: 11500,
        freedMb: 500,
        elevationRequired: false,
        message: 'Trimming complete',
      });

      expect(service.getCleanupHistory().length).toBe(1);
      service.clearCleanupHistory();
      expect(service.getCleanupHistory().length).toBe(0);
    });
  });
});
