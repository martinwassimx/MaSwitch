import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import semver from './semverUtils';
import {
  MAX_MANIFEST_BYTES,
  UPDATE_MANIFEST_ASSET_NAME,
  UPDATE_SIGNATURE_ASSET_NAME,
  verifySignedUpdateManifest,
  type SignedUpdateManifest,
  type UpdateTrustKey,
} from './updateManifest';
import { UPDATE_TRUSTED_KEYS } from './updateTrustRoot';
import type {
  UpdateChannel,
  UpdateCheckResult,
  UpdateDownloadProgress,
  UpdateInfo,
  UpdateInstallPrecheckResult,
  UpdaterState,
  UpdateStatus,
} from '../../../src/shared/types/updater';
import type { MaSwitchSettings } from '../../../src/shared/types/settings';
import type { PlaytimeTrackerStatus } from '../../../src/shared/types/statistics';

export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

export interface GitHubReleaseItem {
  tag_name: string;
  name: string;
  body: string;
  prerelease: boolean;
  published_at: string;
  html_url: string;
  assets: GitHubReleaseAsset[];
}

export interface AppUpdateServiceDependencies {
  currentVersion: string;
  userDataDir: string;
  /** Overrides the download directory (defaults to `<userData>/updates`). */
  tempDir?: string;
  getTrackerStatus: () => PlaytimeTrackerStatus;
  isRiotLoginInProgress?: () => boolean;
  isMemoryCleanupActive?: () => boolean;
  quitApp: () => void;
  loadSettings: () => MaSwitchSettings;
  saveSettings: (partial: Partial<MaSwitchSettings>) => MaSwitchSettings;
  broadcastStatusChanged?: (state: UpdaterState) => void;
  broadcastProgress?: (progress: UpdateDownloadProgress) => void;
  fetchFn?: typeof fetch;
  spawnFn?: typeof spawn;
  trustedKeys?: readonly UpdateTrustKey[];
}

interface VerifiedDownload {
  filePath: string;
  sha256: string;
  size: number;
  version: string;
}

const GITHUB_RELEASES_API = 'https://api.github.com/repos/martinwassimx/MaSwitch/releases';
const RELEASE_DOWNLOAD_PATH_PREFIX = '/martinwassimx/MaSwitch/releases/download/';
const TRUSTED_ASSET_CDN_HOSTS = new Set([
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'github-releases.githubusercontent.com',
]);
const AUTO_CHECK_STARTUP_DELAY_MS = 10_000;
const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CHECK_THROTTLE_HOURS = 24;

export const UNVERIFIED_UPDATE_MESSAGE =
  'Automatic installation is unavailable because this release could not be verified with a trusted MaSwitch update signature. Download the installer manually from the release page only if you trust it.';

export function isValidUpdateChannel(value: unknown): value is UpdateChannel {
  return value === 'stable' || value === 'beta';
}

async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

export class AppUpdateService {
  private readonly dependencies: AppUpdateServiceDependencies;
  private readonly fetchImpl: typeof fetch;
  private readonly spawnImpl: typeof spawn;
  private readonly trustedKeys: readonly UpdateTrustKey[];
  private state: UpdaterState;
  private verifiedManifest: SignedUpdateManifest | null = null;
  private verifiedDownload: VerifiedDownload | null = null;
  private downloadAbortController: AbortController | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private periodicTimer: NodeJS.Timeout | null = null;
  private lastProgressEmitTime = 0;

  constructor(dependencies: AppUpdateServiceDependencies) {
    this.dependencies = dependencies;
    this.fetchImpl = dependencies.fetchFn ?? globalThis.fetch;
    this.spawnImpl = dependencies.spawnFn ?? spawn;
    this.trustedKeys = dependencies.trustedKeys ?? UPDATE_TRUSTED_KEYS;

    const initialSettings = dependencies.loadSettings();
    this.state = {
      status: 'idle',
      channel: isValidUpdateChannel(initialSettings.updateChannel) ? initialSettings.updateChannel : 'stable',
      currentVersion: dependencies.currentVersion,
      latestCheckResult: null,
      downloadProgress: null,
      downloadedFilePath: null,
      downloadedVersion: null,
      error: null,
    };
  }

  public getState(): UpdaterState {
    return { ...this.state };
  }

  public getChannel(): UpdateChannel {
    return this.state.channel;
  }

  public setChannel(channel: UpdateChannel): void {
    if (!isValidUpdateChannel(channel)) {
      throw new Error('Invalid update channel.');
    }
    if (this.state.channel !== channel) {
      this.state.channel = channel;
      this.dependencies.saveSettings({ updateChannel: channel });
      this.emitState();
    }
  }

  private setStatus(status: UpdateStatus, error: string | null = null): void {
    this.state.status = status;
    this.state.error = error;
    this.emitState();
  }

  private emitState(): void {
    this.dependencies.broadcastStatusChanged?.({ ...this.state });
  }

  private emitProgress(progress: UpdateDownloadProgress): void {
    this.state.downloadProgress = progress;
    this.dependencies.broadcastProgress?.(progress);
  }

  private getDownloadDir(): string {
    return this.dependencies.tempDir ?? path.join(this.dependencies.userDataDir, 'updates');
  }

  /**
   * HTTPS only. Initial URLs must be this repository's release downloads; redirects
   * may only land on GitHub's release-asset CDN hosts.
   */
  public isTrustedDownloadUrl(rawUrl: string): boolean {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
        return false;
      }
      const host = parsed.hostname.toLowerCase();
      if (host === 'github.com') {
        return parsed.pathname.startsWith(RELEASE_DOWNLOAD_PATH_PREFIX);
      }
      return TRUSTED_ASSET_CDN_HOSTS.has(host);
    } catch {
      return false;
    }
  }

  private async fetchSmallAsset(url: string): Promise<Buffer> {
    if (!this.isTrustedDownloadUrl(url)) {
      throw new Error('Untrusted update metadata URL.');
    }
    const response = await this.fetchImpl(url, {
      headers: { 'User-Agent': `MaSwitch-Desktop-Updater/${this.state.currentVersion}` },
    });
    if (!response.ok) {
      throw new Error(`Update metadata download failed (HTTP ${response.status}).`);
    }
    if (response.url && !this.isTrustedDownloadUrl(response.url)) {
      throw new Error('Update metadata was redirected to an untrusted host.');
    }
    const declared = Number(response.headers?.get?.('content-length') ?? 0);
    if (declared > MAX_MANIFEST_BYTES) {
      throw new Error('Update metadata is too large.');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_MANIFEST_BYTES) {
      throw new Error('Update metadata is too large.');
    }
    return bytes;
  }

  private async verifyReleaseManifest(
    release: GitHubReleaseItem,
    channel: UpdateChannel
  ): Promise<SignedUpdateManifest> {
    const manifestAsset = release.assets.find((a) => a.name === UPDATE_MANIFEST_ASSET_NAME);
    const signatureAsset = release.assets.find((a) => a.name === UPDATE_SIGNATURE_ASSET_NAME);
    if (!manifestAsset || !signatureAsset) {
      throw new Error('This release does not include a signed update manifest.');
    }
    const [manifestBytes, signatureBytes] = await Promise.all([
      this.fetchSmallAsset(manifestAsset.browser_download_url),
      this.fetchSmallAsset(signatureAsset.browser_download_url),
    ]);
    return verifySignedUpdateManifest(manifestBytes, signatureBytes, this.trustedKeys, {
      currentVersion: this.state.currentVersion,
      requestedChannel: channel,
      releaseTag: release.tag_name,
      releaseAssetNames: release.assets.map((a) => a.name),
    });
  }

  private clearVerifiedDownload(deleteFile: boolean): void {
    if (deleteFile && this.verifiedDownload) {
      try {
        fs.rmSync(this.verifiedDownload.filePath, { force: true });
      } catch {
        // ignore
      }
    }
    this.verifiedDownload = null;
    this.state.downloadedFilePath = null;
    this.state.downloadedVersion = null;
  }

  /**
   * Check for updates against GitHub Releases.
   */
  public async checkForUpdates(
    targetChannel?: UpdateChannel,
    _isManualCheck = false
  ): Promise<UpdateCheckResult> {
    if (this.state.status === 'downloading') {
      return {
        updateAvailable: true,
        currentVersion: this.state.currentVersion,
        latestVersion: this.state.latestCheckResult?.latestVersion ?? this.state.currentVersion,
        channel: this.state.channel,
        updateInfo: this.state.latestCheckResult?.updateInfo,
        checkedAtIso: new Date().toISOString(),
      };
    }

    const channel = isValidUpdateChannel(targetChannel) ? targetChannel : this.state.channel;
    this.state.channel = channel;
    this.setStatus('checking', null);

    const nowIso = new Date().toISOString();

    try {
      const response = await this.fetchImpl(GITHUB_RELEASES_API, {
        headers: {
          'User-Agent': `MaSwitch-Desktop-Updater/${this.state.currentVersion}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        if (response.status === 403 || response.status === 429) {
          const errMsg = 'GitHub update rate limit exceeded. Please wait a while or try again later.';
          this.setStatus('error', errMsg);
          return {
            updateAvailable: false,
            currentVersion: this.state.currentVersion,
            latestVersion: this.state.currentVersion,
            channel,
            error: errMsg,
            checkedAtIso: nowIso,
          };
        }
        throw new Error(`GitHub releases API returned HTTP ${response.status} ${response.statusText}`);
      }

      const releases = (await response.json()) as GitHubReleaseItem[];
      if (!Array.isArray(releases) || releases.length === 0) {
        this.setStatus('not-available');
        const res: UpdateCheckResult = {
          updateAvailable: false,
          currentVersion: this.state.currentVersion,
          latestVersion: this.state.currentVersion,
          channel,
          checkedAtIso: nowIso,
        };
        this.state.latestCheckResult = res;
        return res;
      }

      // Filter releases based on channel
      const filteredReleases = releases.filter((r) => {
        if (!r || typeof r.tag_name !== 'string' || !Array.isArray(r.assets)) return false;
        if (channel === 'stable') {
          if (r.prerelease) return false;
          const tagLower = r.tag_name.toLowerCase();
          if (tagLower.includes('-beta') || tagLower.includes('-rc') || tagLower.includes('-alpha')) {
            return false;
          }
        }
        return true;
      });

      // Sort releases by semver descending
      const parsedReleases = filteredReleases
        .map((r) => {
          const rawTag = r.tag_name.replace(/^v/i, '').trim();
          const cleanVer = semver.clean(rawTag) ?? semver.valid(semver.coerce(rawTag)?.version);
          return { release: r, version: cleanVer };
        })
        .filter((item): item is { release: GitHubReleaseItem; version: string } => item.version !== null)
        .sort((a, b) => semver.rcompare(a.version, b.version));

      if (parsedReleases.length === 0) {
        this.setStatus('not-available');
        const res: UpdateCheckResult = {
          updateAvailable: false,
          currentVersion: this.state.currentVersion,
          latestVersion: this.state.currentVersion,
          channel,
          checkedAtIso: nowIso,
        };
        this.state.latestCheckResult = res;
        return res;
      }

      const bestCandidate = parsedReleases[0];
      const isNewer = semver.gt(bestCandidate.version, this.state.currentVersion);

      // Save check timestamp in settings
      this.dependencies.saveSettings({ lastUpdateCheckIso: nowIso });

      if (isNewer) {
        let manifest: SignedUpdateManifest | null = null;
        let verificationError: string | undefined;
        try {
          manifest = await this.verifyReleaseManifest(bestCandidate.release, channel);
        } catch (verifyErr) {
          verificationError = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        }

        const installerAsset = manifest
          ? bestCandidate.release.assets.find((a) => a.name === manifest!.installer.fileName)
          : bestCandidate.release.assets.find(
              (a) => a.name.toLowerCase().endsWith('.exe') && !a.name.toLowerCase().includes('portable')
            ) ?? bestCandidate.release.assets.find((a) => a.name.toLowerCase().endsWith('.exe'));

        if (manifest && (!installerAsset || !this.isTrustedDownloadUrl(installerAsset.browser_download_url))) {
          manifest = null;
          verificationError = 'The signed installer asset is missing or hosted at an untrusted URL.';
        }

        if (installerAsset) {
          if (this.verifiedManifest?.version !== manifest?.version) {
            this.clearVerifiedDownload(false);
          }
          this.verifiedManifest = manifest;

          const updateInfo: UpdateInfo = {
            version: bestCandidate.version,
            releaseName: bestCandidate.release.name || `MaSwitch v${bestCandidate.version}`,
            releaseNotes: bestCandidate.release.body || 'No release notes provided.',
            publishedAtIso: bestCandidate.release.published_at || nowIso,
            isPrerelease: bestCandidate.release.prerelease,
            htmlUrl: bestCandidate.release.html_url,
            installerAsset: {
              name: installerAsset.name,
              downloadUrl: installerAsset.browser_download_url,
              size: manifest ? manifest.installer.size : installerAsset.size,
              contentType: installerAsset.content_type,
            },
            expectedSha256: manifest?.installer.sha256,
            signatureVerified: Boolean(manifest),
            verificationError: manifest ? undefined : verificationError,
          };

          const result: UpdateCheckResult = {
            updateAvailable: true,
            currentVersion: this.state.currentVersion,
            latestVersion: bestCandidate.version,
            channel,
            updateInfo,
            checkedAtIso: nowIso,
          };

          this.state.latestCheckResult = result;
          if (
            manifest &&
            this.verifiedDownload?.version === manifest.version &&
            fs.existsSync(this.verifiedDownload.filePath)
          ) {
            this.setStatus('downloaded');
          } else {
            this.setStatus('available');
          }

          return result;
        }
      }

      this.verifiedManifest = null;
      this.setStatus('not-available');
      const res: UpdateCheckResult = {
        updateAvailable: false,
        currentVersion: this.state.currentVersion,
        latestVersion: bestCandidate.version,
        channel,
        checkedAtIso: nowIso,
      };
      this.state.latestCheckResult = res;
      return res;
    } catch (err) {
      const errorMsg =
        err instanceof Error
          ? err.message.includes('fetch') || err.message.includes('network') || err.message.includes('ENOTFOUND')
            ? 'Unable to connect to GitHub. Please check your internet connection.'
            : err.message
          : 'An unexpected error occurred while checking for updates.';

      this.setStatus('error', errorMsg);
      const res: UpdateCheckResult = {
        updateAvailable: false,
        currentVersion: this.state.currentVersion,
        latestVersion: this.state.currentVersion,
        channel,
        error: errorMsg,
        checkedAtIso: nowIso,
      };
      this.state.latestCheckResult = res;
      return res;
    }
  }

  /**
   * Download the installer named in the verified manifest and check its size and SHA-256.
   */
  public async startDownload(): Promise<{ success: boolean; message?: string }> {
    if (this.state.status === 'downloading') {
      return { success: false, message: 'Download already in progress.' };
    }

    const updateInfo = this.state.latestCheckResult?.updateInfo;
    if (!updateInfo) {
      return { success: false, message: 'No update available to download.' };
    }

    const manifest = this.verifiedManifest;
    if (!manifest || !updateInfo.signatureVerified || manifest.version !== updateInfo.version) {
      return { success: false, message: updateInfo.verificationError ? `${UNVERIFIED_UPDATE_MESSAGE} (${updateInfo.verificationError})` : UNVERIFIED_UPDATE_MESSAGE };
    }

    const downloadUrl = updateInfo.installerAsset.downloadUrl;
    if (!this.isTrustedDownloadUrl(downloadUrl) || updateInfo.installerAsset.name !== manifest.installer.fileName) {
      const msg = 'Security Error: Untrusted update download location.';
      this.setStatus('error', msg);
      return { success: false, message: msg };
    }

    const downloadDir = this.getDownloadDir();
    try {
      fs.mkdirSync(downloadDir, { recursive: true });
    } catch (mkdirErr) {
      const msg = `Failed to create update cache directory: ${mkdirErr instanceof Error ? mkdirErr.message : String(mkdirErr)}`;
      this.setStatus('error', msg);
      return { success: false, message: msg };
    }

    this.clearVerifiedDownload(false);
    const targetFilePath = path.join(downloadDir, manifest.installer.fileName);
    const partFilePath = `${targetFilePath}.${crypto.randomUUID()}.part`;
    const expectedSize = manifest.installer.size;

    this.downloadAbortController = new AbortController();
    this.setStatus('downloading');

    let bytesDownloaded = 0;
    const hash = crypto.createHash('sha256');
    let speedSamples: { bytes: number; time: number }[] = [];
    let fileHandle: fs.promises.FileHandle | null = null;

    try {
      const response = await this.fetchImpl(downloadUrl, {
        signal: this.downloadAbortController.signal,
        headers: {
          'User-Agent': `MaSwitch-Desktop-Updater/${this.state.currentVersion}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to download installer (HTTP ${response.status} ${response.statusText})`);
      }

      // Verify final response URL (after redirects)
      if (response.url && !this.isTrustedDownloadUrl(response.url)) {
        throw new Error('Security Error: Update download was redirected to an untrusted host.');
      }

      if (!response.body) {
        throw new Error('Update response contained no data stream.');
      }

      fileHandle = await fs.promises.open(partFilePath, 'wx', 0o600);
      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          const chunk = Buffer.from(value);
          bytesDownloaded += chunk.length;
          if (bytesDownloaded > expectedSize) {
            throw new Error('Security Error: Downloaded installer is larger than the signed size. Download rejected.');
          }
          await fileHandle.write(chunk);
          hash.update(chunk);

          const now = Date.now();
          speedSamples.push({ bytes: chunk.length, time: now });
          speedSamples = speedSamples.filter((s) => now - s.time <= 2000);

          const timeSpan = (now - speedSamples[0].time) / 1000;
          const bytesSpan = speedSamples.reduce((acc, s) => acc + s.bytes, 0);
          const speedBytesPerSec = timeSpan > 0 ? Math.round(bytesSpan / timeSpan) : 0;

          const percent = Math.min(100, Math.round((bytesDownloaded / expectedSize) * 1000) / 10);

          if (now - this.lastProgressEmitTime >= 200 || percent === 100) {
            this.lastProgressEmitTime = now;
            this.emitProgress({
              bytesDownloaded,
              totalBytes: expectedSize,
              percent,
              speedBytesPerSec,
              transferredMb: Math.round((bytesDownloaded / (1024 * 1024)) * 100) / 100,
              totalMb: Math.round((expectedSize / (1024 * 1024)) * 100) / 100,
            });
          }
        }
      }

      await fileHandle.sync();
      await fileHandle.close();
      fileHandle = null;

      const computedHash = hash.digest('hex');
      if (bytesDownloaded !== expectedSize || computedHash !== manifest.installer.sha256) {
        throw new Error(
          'Security Error: Downloaded installer does not match the signed release manifest. Download rejected.'
        );
      }

      fs.rmSync(targetFilePath, { force: true });
      fs.renameSync(partFilePath, targetFilePath);

      this.downloadAbortController = null;
      this.verifiedDownload = {
        filePath: targetFilePath,
        sha256: computedHash,
        size: expectedSize,
        version: manifest.version,
      };
      this.state.downloadedFilePath = targetFilePath;
      this.state.downloadedVersion = manifest.version;
      this.setStatus('downloaded');

      return { success: true };
    } catch (err) {
      this.downloadAbortController = null;
      if (fileHandle) {
        await fileHandle.close().catch(() => undefined);
      }
      try {
        fs.rmSync(partFilePath, { force: true });
      } catch {
        // ignore
      }

      if (err instanceof Error && err.name === 'AbortError') {
        this.setStatus('available');
        return { success: false, message: 'Download cancelled.' };
      }

      const errMsg = err instanceof Error ? err.message : 'Download failed.';
      this.setStatus('error', errMsg);
      return { success: false, message: errMsg };
    }
  }

  /**
   * Cancel an in-progress update download.
   */
  public cancelDownload(): boolean {
    if (this.state.status === 'downloading' && this.downloadAbortController) {
      this.downloadAbortController.abort();
      this.downloadAbortController = null;
      this.setStatus('available');
      return true;
    }
    return false;
  }

  /**
   * Safe precheck before running the installer.
   */
  public precheckInstall(): UpdateInstallPrecheckResult {
    // Check 1: Game running
    const trackerStatus = this.dependencies.getTrackerStatus();
    if (trackerStatus && trackerStatus.activeSessions && trackerStatus.activeSessions.length > 0) {
      const activeTitles = trackerStatus.activeSessions.map((s) => s.gameTitle || 'Active Game');
      return {
        canInstall: false,
        reason: 'game_running',
        message: `Cannot update while games are running (${activeTitles.join(', ')}). Please close your games before installing the update.`,
        activeGames: activeTitles,
      };
    }

    // Check 2: Riot login automation in progress
    if (this.dependencies.isRiotLoginInProgress?.() === true) {
      return {
        canInstall: false,
        reason: 'riot_automation_active',
        message: 'Riot Games login automation is currently in progress. Please wait for login to finish.',
      };
    }

    // Check 3: Memory cleanup in progress
    if (this.dependencies.isMemoryCleanupActive?.() === true) {
      return {
        canInstall: false,
        reason: 'memory_cleanup_active',
        message: 'Memory cleanup is currently in progress. Please wait a moment.',
      };
    }

    return { canInstall: true };
  }

  /**
   * Re-verify the downloaded installer immediately before executing it, then quit.
   */
  public async installAndRestart(options?: { silent?: boolean }): Promise<{ success: boolean; message?: string }> {
    const precheck = this.precheckInstall();
    if (!precheck.canInstall) {
      return { success: false, message: precheck.message };
    }

    const download = this.verifiedDownload;
    if (!download || !this.verifiedManifest || download.version !== this.verifiedManifest.version) {
      return { success: false, message: 'No verified installer is available. Please download the update again.' };
    }

    try {
      const stat = fs.lstatSync(download.filePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== download.size) {
        throw new Error('size');
      }
      if ((await sha256File(download.filePath)) !== download.sha256) {
        throw new Error('hash');
      }
    } catch {
      this.clearVerifiedDownload(true);
      const msg = 'Security Error: The downloaded installer changed or is missing since it was verified. Please download the update again.';
      this.setStatus('error', msg);
      return { success: false, message: msg };
    }

    const args: string[] = [];
    if (options?.silent === true) {
      args.push('/S');
    }

    try {
      const installerProcess = this.spawnImpl(download.filePath, args, {
        detached: true,
        stdio: 'ignore',
      });
      installerProcess.unref();

      // Gracefully quit application
      setTimeout(() => {
        this.dependencies.quitApp();
      }, 500);

      return { success: true };
    } catch (spawnErr) {
      const msg = `Failed to launch installer: ${spawnErr instanceof Error ? spawnErr.message : String(spawnErr)}`;
      return { success: false, message: msg };
    }
  }

  /**
   * Start the automatic background update scheduler.
   */
  public startAutoCheckScheduler(): void {
    this.stopAutoCheckScheduler();

    // 10s startup delay
    this.startupTimer = setTimeout(() => {
      void this.runAutoCheck();
    }, AUTO_CHECK_STARTUP_DELAY_MS);

    // Periodic check every 6 hours
    this.periodicTimer = setInterval(() => {
      void this.runAutoCheck();
    }, AUTO_CHECK_INTERVAL_MS);
  }

  public stopAutoCheckScheduler(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }

  private async runAutoCheck(): Promise<void> {
    const settings = this.dependencies.loadSettings();
    if (!settings.autoCheckForUpdates) {
      return;
    }

    // Skip if in-game
    const trackerStatus = this.dependencies.getTrackerStatus();
    if (trackerStatus && trackerStatus.activeSessions && trackerStatus.activeSessions.length > 0) {
      return;
    }

    // Throttling: only check if last check was > 24 hours ago
    if (settings.lastUpdateCheckIso) {
      const lastCheckTime = new Date(settings.lastUpdateCheckIso).getTime();
      const elapsedHours = (Date.now() - lastCheckTime) / (1000 * 60 * 60);
      if (elapsedHours < CHECK_THROTTLE_HOURS) {
        return;
      }
    }

    try {
      await this.checkForUpdates(settings.updateChannel ?? 'stable', false);
    } catch {
      // Background auto-check fails silently without popping errors
    }
  }
}
