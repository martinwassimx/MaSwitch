import type { GameItem } from './game';
import type { PlaytimeSessionRecord } from './statistics';
import type { CollectionItem } from './collection';
import type { ExcludedApplicationRule, MaSwitchSettings } from './settings';
import type { AccountProfile } from './account';

export interface BackupManifest {
  formatVersion: '3.0.0';
  appVersion: string;
  createdAtIso: string;
  counts: {
    games: number;
    sessions: number;
    collections: number;
    exclusions: number;
    accountProfiles: number;
  };
  checksums: {
    games: string;
    sessions: string;
    collections: string;
    exclusions: string;
    settings: string;
    accountProfiles: string;
  };
}

export interface BackupArchiveData {
  manifest: BackupManifest;
  games: GameItem[];
  sessions: PlaytimeSessionRecord[];
  collections: CollectionItem[];
  exclusions: ExcludedApplicationRule[];
  settings: Partial<MaSwitchSettings>;
  accountProfiles: Array<Omit<AccountProfile, 'credentials'>>;
}

export interface BackupValidationResult {
  valid: boolean;
  manifest?: BackupManifest;
  error?: string;
  warnings?: string[];
  filePath: string;
  fileSizeBytes: number;
}

export interface RestoreResult {
  success: boolean;
  preRestoreSnapshotPath?: string;
  restoredCounts?: {
    games: number;
    sessions: number;
    collections: number;
    exclusions: number;
  };
  error?: string;
}

export interface BackupInfo {
  lastBackupIso: string | null;
  lastBackupPath: string | null;
  backupsCount: number;
  defaultBackupDir: string;
}
