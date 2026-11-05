import type {
  MemoryCleanupHistoryEntry,
  MemoryCleanupRequest,
  MemoryCleanupResult,
  SystemMemoryMetrics,
} from '../shared/types/memory';

class MemoryManagementFrontendService {
  public async getMetrics(): Promise<SystemMemoryMetrics | null> {
    if (!window.maswitch?.memory?.getMetrics) {
      return null;
    }
    try {
      return await window.maswitch.memory.getMetrics();
    } catch {
      return null;
    }
  }

  public async performCleanup(request: MemoryCleanupRequest): Promise<MemoryCleanupResult> {
    if (!window.maswitch?.memory?.performCleanup) {
      return {
        success: false,
        mode: request.mode,
        status: 'failed',
        ramBeforeMb: 0,
        ramAfterMb: 0,
        freedMb: 0,
        message: 'Memory management service is unavailable in the current runtime environment.',
      };
    }
    try {
      return await window.maswitch.memory.performCleanup(request);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        mode: request.mode,
        status: 'failed',
        ramBeforeMb: 0,
        ramAfterMb: 0,
        freedMb: 0,
        message: msg,
      };
    }
  }

  public async getHistory(): Promise<MemoryCleanupHistoryEntry[]> {
    if (!window.maswitch?.memory?.getHistory) {
      return [];
    }
    try {
      return await window.maswitch.memory.getHistory();
    } catch {
      return [];
    }
  }

  public async clearHistory(): Promise<void> {
    if (!window.maswitch?.memory?.clearHistory) {
      return;
    }
    try {
      await window.maswitch.memory.clearHistory();
    } catch {
      // Fallback
    }
  }
}

export const memoryManagementService = new MemoryManagementFrontendService();
