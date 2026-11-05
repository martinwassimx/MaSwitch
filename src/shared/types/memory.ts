export interface SystemMemoryMetrics {
  totalPhysicalBytes: number;
  availablePhysicalBytes: number;
  usedPhysicalBytes: number;
  utilizationPercent: number;
  totalPhysicalMb: number;
  availablePhysicalMb: number;
  usedPhysicalMb: number;
  pageFileTotalMb?: number;
  pageFileAvailableMb?: number;
  pageFileUsedMb?: number;
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

export interface MemoryCleanupOperations {
  /** REDUCT_WORKINGSET (0x01): Trims working sets across processes */
  workingSets: boolean;
  /** REDUCT_SYSTEMFILECACHE (0x02): Flushes system file cache working sets (elevated) */
  systemFileCache: boolean;
  /** REDUCT_STANDBYPRIORITY0LIST (0x04): Purges low-priority (priority 0) standby pages (elevated) */
  standbyPriority0: boolean;
  /** REDUCT_STANDBYLIST (0x08): Purges all standby cache pages (elevated, potential micro-stutter) */
  standbyList: boolean;
  /** REDUCT_MODIFIEDLIST (0x10): Flushes modified page list to disk (elevated, disk I/O burst) */
  modifiedPageList: boolean;
  /** REDUCT_COMBINEMEMORYLISTS (0x20): Physical memory page deduplication (Win 10+) */
  combineMemoryLists: boolean;
  /** REDUCT_REGISTRYCACHE (0x40): Flushes Windows registry cache buffers (Win 8.1+) */
  registryCache: boolean;
}

export const DEFAULT_STANDARD_OPERATIONS: MemoryCleanupOperations = {
  workingSets: true,
  systemFileCache: false,
  standbyPriority0: true,
  standbyList: false,
  modifiedPageList: false,
  combineMemoryLists: true,
  registryCache: true,
};

export const DEFAULT_ADVANCED_OPERATIONS: MemoryCleanupOperations = {
  workingSets: true,
  systemFileCache: true,
  standbyPriority0: true,
  standbyList: false, // Disabled by default to prevent freeze/stutter
  modifiedPageList: false, // Disabled by default to prevent disk write burst
  combineMemoryLists: true,
  registryCache: true,
};

export type MemoryCleanupAction =
  | 'working_set_clean'
  | 'system_lists_clean'
  | 'standard_clean'
  | 'advanced_clean'
  | 'self_trim'
  | 'close_apps'
  | 'working_set_trim';

export interface MemoryCleanupHistoryEntry {
  id: string;
  timestampIso: string;
  mode: 'standard' | 'advanced';
  action: MemoryCleanupAction;
  status: 'success' | 'partial' | 'failed' | 'cancelled';
  ramBeforeMb: number;
  ramAfterMb: number;
  freedMb: number;
  elevationRequired: boolean;
  message: string;
  operations?: Partial<MemoryCleanupOperations>;
  targetProcesses?: string[];
}

export interface MemoryCleanupRequest {
  mode: 'standard' | 'advanced';
  operations?: Partial<MemoryCleanupOperations>;
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
