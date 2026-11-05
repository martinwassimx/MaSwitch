export interface SystemMemoryMetrics {
  totalPhysicalBytes: number;
  availablePhysicalBytes: number;
  usedPhysicalBytes: number;
  utilizationPercent: number;
  totalPhysicalMb: number;
  availablePhysicalMb: number;
  usedPhysicalMb: number;
  maSwitchWorkingSetBytes: number;
  maSwitchWorkingSetMb: number;
  lastCleanupTimeIso: string | null;
  lastCleanupBeforeMb: number | null;
  lastCleanupAfterMb: number | null;
  lastCleanupFreedMb: number | null;
  lastCleanupResult: string | null;
  isGameRunning: boolean;
  activeGameTitle: string | null;
}

export interface CleanableAppCandidate {
  pid: number;
  name: string;
  displayName: string;
  workingSetBytes: number;
  workingSetMb: number;
  category: 'browser' | 'chat' | 'utility' | 'other';
  isSafeToClose: boolean;
}

export interface MemoryCleanupHistoryEntry {
  id: string;
  timestampIso: string;
  mode: 'standard' | 'advanced';
  action: 'self_trim' | 'close_apps' | 'working_set_trim';
  status: 'success' | 'partial' | 'failed' | 'cancelled';
  ramBeforeMb: number;
  ramAfterMb: number;
  freedMb: number;
  elevationRequired: boolean;
  message: string;
  targetProcesses?: string[];
}

export interface MemoryCleanupRequest {
  mode: 'standard' | 'advanced';
  closeAppPids?: number[];
  trimProcessWorkingSets?: boolean;
}

export interface MemoryCleanupResult {
  success: boolean;
  mode: 'standard' | 'advanced';
  status: 'success' | 'partial' | 'failed' | 'cancelled';
  ramBeforeMb: number;
  ramAfterMb: number;
  freedMb: number;
  message: string;
  historyEntry?: MemoryCleanupHistoryEntry;
}

