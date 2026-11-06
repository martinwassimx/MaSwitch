import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import semver from './semverUtils';
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
}

const GITHUB_RELEASES_API = 'https://api.github.com/repos/martinwassimx/MaSwitch/releases';
const AUTO_CHECK_STARTUP_DELAY_MS = 10_000;
const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CHECK_THROTTLE_HOURS = 24;

export class AppUpdateService {
  private readonly dependencies: AppUpdateServiceDependencies;
  private readonly fetchImpl: typeof fetch;
  private readonly spawnImpl: typeof spawn;
  private state: UpdaterState;
  private downloadAbortController: AbortController | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private periodicTimer: NodeJS.Timeout | null = null;
  private lastProgressEmitTime = 0;

  constructor(dependencies: AppUpdateServiceDependencies) {
    this.dependencies = dependencies;
    this.fetchImpl = dependencies.fetchFn ?? globalThis.fetch;
    this.spawnImpl = dependencies.spawnFn ?? spawn;

    const initialSettings = dependencies.loadSettings();
    this.state = {
      status: 'idle',
      channel: initialSettings.updateChannel ?? 'stable',
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

  /**
   * Validate that a remote URL strictly belongs to trusted GitHub download domains and uses HTTPS.
   */
  public isTrustedDownloadUrl(rawUrl: string): boolean {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:') {
        return false;
      }
      const host = parsed.hostname.toLowerCase();
      return (
        host === 'github.com' ||
        host === 'api.github.com' ||
        host === 'objects.githubusercontent.com' ||
        host === 'raw.githubusercontent.com' ||
        host.endsWith('.githubusercontent.com')
      );
    } catch {
      return false;
    }
  }

  /**
   * Parse SHA-256 checksum from SHA256SUMS.txt text for a target file.
   */
  public parseChecksumFromSha256Sums(sha256Text: string, targetFilename: string): string | null {
    const lines = sha256Text.split(/\r?\n/);
    const normalizedTarget = targetFilename.toLowerCase().trim();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        const hash = parts[0].toLowerCase().trim();
        const file = parts.slice(1).join(' ').replace(/^\*/, '').toLowerCase().trim();
        const baseName = path.basename(file);
        if (file === normalizedTarget || baseName === normalizedTarget) {
          if (/^[a-f0-9]{64}$/i.test(hash)) {
            return hash;
          }
        }
      }
    }
    return null;
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

    const channel = targetChannel ?? this.state.channel;
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
        if (!r.tag_name) return false;
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

      // Find Windows installer asset (.exe)
      const installerAsset = bestCandidate.release.assets.find(
        (a) =>
          a.name.toLowerCase().endsWith('.exe') &&
          !a.name.toLowerCase().includes('portable')
      ) ?? bestCandidate.release.assets.find((a) => a.name.toLowerCase().endsWith('.exe'));

      const sha256Asset = bestCandidate.release.assets.find(
        (a) => a.name.toLowerCase() === 'sha256sums.txt' || a.name.toLowerCase().endsWith('.sha256')
      );

      // Save check timestamp in settings
      this.dependencies.saveSettings({ lastUpdateCheckIso: nowIso });

      if (isNewer && installerAsset) {
        let expectedSha256: string | undefined;

        // Attempt pre-fetching SHA256SUMS if present
        if (sha256Asset && this.isTrustedDownloadUrl(sha256Asset.browser_download_url)) {
          try {
            const shaResp = await this.fetchImpl(sha256Asset.browser_download_url);
            if (shaResp.ok) {
              const shaText = await shaResp.text();
              const parsedHash = this.parseChecksumFromSha256Sums(shaText, installerAsset.name);
              if (parsedHash) {
                expectedSha256 = parsedHash;
              }
            }
          } catch {
            // Checksum asset fetch failure will be handled gracefully during download
          }
        }

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
            size: installerAsset.size,
            contentType: installerAsset.content_type,
          },
          sha256Asset: sha256Asset
            ? {
                name: sha256Asset.name,
                downloadUrl: sha256Asset.browser_download_url,
                size: sha256Asset.size,
                contentType: sha256Asset.content_type,
              }
            : undefined,
          expectedSha256,
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
        // If downloaded file already exists for this exact version, mark downloaded
        if (
          this.state.downloadedVersion === bestCandidate.version &&
          this.state.downloadedFilePath &&
          fs.existsSync(this.state.downloadedFilePath)
        ) {
          this.setStatus('downloaded');
        } else {
          this.setStatus('available');
        }

        return result;
      }

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
   * Start downloading the available update executable.
   */
  public async startDownload(): Promise<{ success: boolean; message?: string }> {
    if (this.state.status === 'downloading') {
      return { success: false, message: 'Download already in progress.' };
    }

    const updateInfo = this.state.latestCheckResult?.updateInfo;
    if (!updateInfo) {
      return { success: false, message: 'No update available to download.' };
    }

    const downloadUrl = updateInfo.installerAsset.downloadUrl;
    if (!this.isTrustedDownloadUrl(downloadUrl)) {
      const msg = `Security Error: Untrusted update download domain (${downloadUrl})`;
      this.setStatus('error', msg);
      return { success: false, message: msg };
    }

    // Prepare download directory
    const tempRoot = this.dependencies.tempDir ?? path.join(os.tmpdir(), 'maswitch-updates');
    try {
      fs.mkdirSync(tempRoot, { recursive: true });
    } catch (mkdirErr) {
      const msg = `Failed to create update cache directory: ${mkdirErr instanceof Error ? mkdirErr.message : String(mkdirErr)}`;
      this.setStatus('error', msg);
      return { success: false, message: msg };
    }

    const targetFileName = updateInfo.installerAsset.name;
    const targetFilePath = path.join(tempRoot, targetFileName);
    const partFilePath = `${targetFilePath}.part`;

    // Abort controller for cancellation
    this.downloadAbortController = new AbortController();
    this.setStatus('downloading');

    let bytesDownloaded = 0;
    const totalBytes = updateInfo.installerAsset.size || 0;
    let expectedHash = updateInfo.expectedSha256;

    // Fetch SHA-256 checksum if not yet fetched
    if (!expectedHash && updateInfo.sha256Asset && this.isTrustedDownloadUrl(updateInfo.sha256Asset.downloadUrl)) {
      try {
        const shaResp = await this.fetchImpl(updateInfo.sha256Asset.downloadUrl);
        if (shaResp.ok) {
          const shaText = await shaResp.text();
          const parsed = this.parseChecksumFromSha256Sums(shaText, targetFileName);
          if (parsed) {
            expectedHash = parsed;
            updateInfo.expectedSha256 = parsed;
          }
        }
      } catch {
        // If checksum file cannot be fetched, continue with HTTPS transport verification
      }
    }

    const hash = crypto.createHash('sha256');
    let speedSamples: { bytes: number; time: number }[] = [];

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
        throw new Error(`Security Error: Redirected to untrusted URL: ${response.url}`);
      }

      const contentLength = Number(response.headers.get('content-length'));
      const finalTotalBytes = contentLength > 0 ? contentLength : totalBytes;

      const fileStream = fs.createWriteStream(partFilePath, { flags: 'w' });

      // Handle stream body
      if (!response.body) {
        throw new Error('Update response contained no data stream.');
      }

      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          const chunk = Buffer.from(value);
          fileStream.write(chunk);
          hash.update(chunk);
          bytesDownloaded += chunk.length;

          const now = Date.now();
          speedSamples.push({ bytes: chunk.length, time: now });
          speedSamples = speedSamples.filter((s) => now - s.time <= 2000);

          const timeSpan = (now - speedSamples[0].time) / 1000;
          const bytesSpan = speedSamples.reduce((acc, s) => acc + s.bytes, 0);
          const speedBytesPerSec = timeSpan > 0 ? Math.round(bytesSpan / timeSpan) : 0;

          const percent = finalTotalBytes > 0 ? Math.min(100, Math.round((bytesDownloaded / finalTotalBytes) * 1000) / 10) : 0;

          if (now - this.lastProgressEmitTime >= 200 || percent === 100) {
            this.lastProgressEmitTime = now;
            this.emitProgress({
              bytesDownloaded,
              totalBytes: finalTotalBytes,
              percent,
              speedBytesPerSec,
              transferredMb: Math.round((bytesDownloaded / (1024 * 1024)) * 100) / 100,
              totalMb: Math.round((finalTotalBytes / (1024 * 1024)) * 100) / 100,
            });
          }
        }
      }

      await new Promise<void>((resolve, reject) => {
        fileStream.end((err?: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Verify SHA-256
      const computedHash = hash.digest('hex').toLowerCase();
      if (expectedHash && computedHash !== expectedHash.toLowerCase()) {
        try {
          fs.unlinkSync(partFilePath);
        } catch {
          // ignore
        }
        const mismatchError = `Security Error: Downloaded file checksum (${computedHash.slice(0, 8)}...) did not match official SHA-256 (${expectedHash.slice(0, 8)}...). Download rejected.`;
        this.setStatus('error', mismatchError);
        return { success: false, message: mismatchError };
      }

      // Rename .part to final
      if (fs.existsSync(targetFilePath)) {
        try {
          fs.unlinkSync(targetFilePath);
        } catch {
          // ignore
        }
      }
      fs.renameSync(partFilePath, targetFilePath);

      this.downloadAbortController = null;
      this.state.downloadedFilePath = targetFilePath;
      this.state.downloadedVersion = updateInfo.version;
      this.setStatus('downloaded');

      return { success: true };
    } catch (err) {
      this.downloadAbortController = null;
      try {
        if (fs.existsSync(partFilePath)) {
          fs.unlinkSync(partFilePath);
        }
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
   * Execute the downloaded installer and restart the application cleanly.
   */
  public async installAndRestart(options?: { silent?: boolean }): Promise<{ success: boolean; message?: string }> {
    const precheck = this.precheckInstall();
    if (!precheck.canInstall) {
      return { success: false, message: precheck.message };
    }

    const installerPath = this.state.downloadedFilePath;
    if (!installerPath || !fs.existsSync(installerPath)) {
      return { success: false, message: 'Installer executable not found. Please download the update again.' };
    }

    const args: string[] = [];
    if (options?.silent) {
      args.push('/S');
    }

    try {
      const installerProcess = this.spawnImpl(installerPath, args, {
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
