export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export type UpdateChannel = 'stable' | 'beta';

export interface UpdateAssetInfo {
  name: string;
  downloadUrl: string;
  size: number;
  contentType: string;
}

export interface UpdateInfo {
  version: string;
  releaseName: string;
  releaseNotes: string;
  publishedAtIso: string;
  isPrerelease: boolean;
  htmlUrl: string;
  installerAsset: UpdateAssetInfo;
  /** SHA-256 from the signature-verified manifest; absent when unverified. */
  expectedSha256?: string;
  /** True only when the release manifest was verified against an embedded trust key. */
  signatureVerified: boolean;
  /** Why automatic installation is unavailable for this release. */
  verificationError?: string;
}

export interface UpdateDownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
  speedBytesPerSec: number;
  transferredMb: number;
  totalMb: number;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  channel: UpdateChannel;
  updateInfo?: UpdateInfo;
  error?: string;
  checkedAtIso: string;
}

export interface UpdateInstallPrecheckResult {
  canInstall: boolean;
  reason?: 'game_running' | 'riot_automation_active' | 'memory_cleanup_active';
  message?: string;
  activeGames?: string[];
}

export interface UpdaterState {
  status: UpdateStatus;
  channel: UpdateChannel;
  currentVersion: string;
  latestCheckResult: UpdateCheckResult | null;
  downloadProgress: UpdateDownloadProgress | null;
  downloadedFilePath: string | null;
  downloadedVersion: string | null;
  error: string | null;
}

