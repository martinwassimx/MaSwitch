import React, { useEffect, useState } from 'react';
import {
  RotateCcw,
  Check,
  FolderPlus,
  Trash2,
  Image,
  Key,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  WifiOff,
  Sparkles,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import type {
  AccentColorId,
  ThemePresetId,
  WindowCloseBehavior,
} from '../shared/types/settings';
import { useAppStore } from '../store/useAppStore';
import { BrandMarkImg } from '../components/common/BrandLogo';

const THEME_OPTIONS: ReadonlyArray<{
  id: ThemePresetId;
  name: string;
  description: string;
  previewBg: string;
}> = [
  {
    id: 'dark-graphite',
    name: 'Graphite',
    description: 'Neutral dark graphite surfaces (#101114).',
    previewBg: 'bg-[#101114]',
  },
  {
    id: 'deep-navy',
    name: 'Slate Navy',
    description: 'Deep navy background with cool undertones (#0D1017).',
    previewBg: 'bg-[#0D1017]',
  },
  {
    id: 'obsidian-contrast',
    name: 'Obsidian',
    description: 'High-contrast near-black appearance (#0A0B0D).',
    previewBg: 'bg-[#0A0B0D]',
  },
];

const ACCENT_OPTIONS: ReadonlyArray<{
  id: AccentColorId;
  name: string;
  swatchHex: string;
}> = [
  {
    id: 'electric-blue',
    name: 'Electric Blue',
    swatchHex: '#4C8DFF',
  },
  {
    id: 'cyber-violet',
    name: 'Cyber Violet',
    swatchHex: '#8B5CF6',
  },
  {
    id: 'neon-cyan',
    name: 'Neon Cyan',
    swatchHex: '#38BDF8',
  },
  {
    id: 'emerald-pulse',
    name: 'Emerald Pulse',
    swatchHex: '#34D399',
  },
  {
    id: 'crimson-core',
    name: 'Crimson Core',
    swatchHex: '#F43F5E',
  },
];

export const SettingsPage: React.FC = () => {
  const settings = useAppStore((s) => s.settings);
  const runtimeInfo = useAppStore((s) => s.runtimeInfo);
  const windowsStartupState = useAppStore((s) => s.windowsStartupState);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const resetSettings = useAppStore((s) => s.resetSettings);
  const updateWindowsStartup = useAppStore((s) => s.updateWindowsStartup);

  const steamGridDbStatus = useAppStore((s) => s.steamGridDbStatus);
  const artworkSyncProgress = useAppStore((s) => s.artworkSyncProgress);
  const isSavingSteamGridDbKey = useAppStore((s) => s.isSavingSteamGridDbKey);
  const isSyncingArtwork = useAppStore((s) => s.isSyncingArtwork);
  const saveSteamGridDbKey = useAppStore((s) => s.saveSteamGridDbKey);
  const removeSteamGridDbKey = useAppStore((s) => s.removeSteamGridDbKey);
  const testSteamGridDbKey = useAppStore((s) => s.testSteamGridDbKey);
  const syncLibraryArtwork = useAppStore((s) => s.syncLibraryArtwork);
  const refreshSteamGridDbStatus = useAppStore((s) => s.refreshSteamGridDbStatus);

  const [enteredSgdbKey, setEnteredSgdbKey] = useState('');
  const [showSgdbKey, setShowSgdbKey] = useState(false);
  const [isTestingSgdbKey, setIsTestingSgdbKey] = useState(false);
  const [sgdbFeedback, setSgdbFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const [cacheStats, setCacheStats] = useState<{
    artworkCount: number;
    artworkSizeBytes: number;
    iconCount: number;
    iconSizeBytes: number;
    totalSizeBytes: number;
  } | null>(null);
  const [cacheClearing, setCacheClearing] = useState(false);
  const [cacheFeedback, setCacheFeedback] = useState<string | null>(null);

  const loadCacheStats = async () => {
    if (window.maswitch?.artwork?.getStats) {
      try {
        const stats = await window.maswitch.artwork.getStats();
        setCacheStats(stats);
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    void loadCacheStats();
    void refreshSteamGridDbStatus();
  }, [refreshSteamGridDbStatus]);

  const handleTestSgdbKey = async () => {
    setIsTestingSgdbKey(true);
    setSgdbFeedback(null);
    try {
      const res = await testSteamGridDbKey(enteredSgdbKey.trim() || undefined);
      setSgdbFeedback({
        type: res.success ? 'success' : 'error',
        message: res.message,
      });
      await refreshSteamGridDbStatus();
    } catch {
      setSgdbFeedback({
        type: 'error',
        message: 'Failed to test connection. Check your network connection.',
      });
    } finally {
      setIsTestingSgdbKey(false);
    }
  };

  const handleSaveSgdbKey = async () => {
    if (!enteredSgdbKey.trim()) {
      setSgdbFeedback({
        type: 'error',
        message: 'Please enter a valid SteamGridDB API key before saving.',
      });
      return;
    }
    setSgdbFeedback(null);
    try {
      const res = await saveSteamGridDbKey(enteredSgdbKey.trim());
      setSgdbFeedback({
        type: res.success ? 'success' : 'error',
        message: res.message,
      });
      if (res.success) {
        setEnteredSgdbKey('');
        await loadCacheStats();
      }
    } catch {
      setSgdbFeedback({
        type: 'error',
        message: 'Failed to save API key securely.',
      });
    }
  };

  const handleRemoveSgdbKey = async () => {
    setSgdbFeedback(null);
    try {
      await removeSteamGridDbKey();
      setEnteredSgdbKey('');
      setSgdbFeedback({
        type: 'info',
        message: 'SteamGridDB API key removed from secure storage.',
      });
    } catch {
      setSgdbFeedback({
        type: 'error',
        message: 'Failed to remove API key.',
      });
    }
  };

  const handleSyncMissingArtwork = async () => {
    setSgdbFeedback(null);
    try {
      await syncLibraryArtwork();
      await loadCacheStats();
    } catch {
      setSgdbFeedback({
        type: 'error',
        message: 'Error during artwork synchronization.',
      });
    }
  };

  const handleClearArtworkCache = async () => {
    if (!window.maswitch?.artwork?.clearCache) {
      return;
    }
    setCacheClearing(true);
    setCacheFeedback(null);
    try {
      const res = await window.maswitch.artwork.clearCache();
      const freedMb = (res.freedBytes / (1024 * 1024)).toFixed(1);
      setCacheFeedback(`Cleared ${res.clearedFilesCount} cached file(s) (${freedMb} MB freed).`);
      await loadCacheStats();
    } catch {
      setCacheFeedback('Failed to clear artwork cache.');
    } finally {
      setCacheClearing(false);
    }
  };

  const handleAddCustomScanFolder = async () => {
    const picked = await window.maswitch?.library?.selectFolderDialog();
    if (picked && !settings.customScanFolders.includes(picked)) {
      await updateSettings({
        customScanFolders: [...settings.customScanFolders, picked],
      });
    }
  };

  const handleRemoveCustomScanFolder = async (folder: string) => {
    await updateSettings({
      customScanFolders: settings.customScanFolders.filter((f) => f !== folder),
    });
  };

  return (
    <div
      data-testid="page-settings"
      className="max-w-4xl mx-auto space-y-9 pb-20"
    >
      {/* Spacious Gaming Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ms-border/80 pb-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-ms-text tracking-tight">
            Settings
          </h1>
          <p className="text-sm text-ms-muted">
            Desktop theme, artwork cache, background playtime tracking, and Windows integration
          </p>
        </div>

        <button
          type="button"
          data-testid="reset-settings-btn"
          onClick={() => void resetSettings()}
          className="h-10 px-4 rounded-lg bg-ms-card hover:bg-ms-elevated border border-ms-border text-sm font-semibold text-ms-muted hover:text-ms-text inline-flex items-center gap-2 transition-colors shadow-sm"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset Defaults</span>
        </button>
      </div>

      {/* 1. Appearance */}
      <section aria-label="Appearance" className="space-y-3">
        <h2 className="text-sm font-bold text-ms-muted uppercase tracking-wider px-1">
          Appearance & Themes
        </h2>

        <div className="rounded-2xl bg-ms-card border border-ms-border divide-y divide-ms-border shadow-card overflow-hidden">
          {/* Theme */}
          <div className="p-6 space-y-4">
            <div>
              <div className="text-sm font-bold text-ms-text">Theme Preset</div>
              <div className="text-xs text-ms-muted">
                Choose the desktop surface palette and contrast levels
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {THEME_OPTIONS.map((theme) => {
                const active = settings.theme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    data-testid={`theme-option-${theme.id}`}
                    onClick={() => void updateSettings({ theme: theme.id })}
                    className={`p-4 rounded-xl border text-left transition-all flex items-center gap-3.5 ${
                      active
                        ? 'bg-ms-elevated border-ms-accent ring-2 ring-ms-accent/30 shadow-md'
                        : 'bg-ms-bg border-ms-border hover:border-ms-muted/60'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-lg ${theme.previewBg} border border-ms-border flex items-center justify-center shrink-0 shadow-sm`}
                    >
                      {active && (
                        <Check className="w-4 h-4 text-ms-accent" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ms-text truncate">
                        {theme.name}
                      </div>
                      <div className="text-xs text-ms-muted truncate">
                        {theme.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accent Color */}
          <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-ms-text">
                Accent Highlight Color
              </div>
              <div className="text-xs text-ms-muted">
                Vibrant electric tint for primary buttons, focus states, and badges
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {ACCENT_OPTIONS.map((accent) => {
                const active = settings.accentColor === accent.id;
                return (
                  <button
                    key={accent.id}
                    type="button"
                    data-testid={`accent-option-${accent.id}`}
                    onClick={() =>
                      void updateSettings({ accentColor: accent.id })
                    }
                    className={`h-9 px-3.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-2 transition-all ${
                      active
                        ? 'bg-ms-elevated border-ms-accent text-ms-text shadow-sm'
                        : 'bg-ms-bg border-ms-border text-ms-muted hover:text-ms-text'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: accent.swatchHex }}
                    />
                    <span>{accent.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Artwork & Cache Management */}
      <section aria-label="Artwork & Cache" className="space-y-3">
        <h2 className="text-sm font-bold text-ms-muted uppercase tracking-wider px-1">
          Artwork & Metadata Cache
        </h2>

        <div className="rounded-2xl bg-ms-card border border-ms-border divide-y divide-ms-border shadow-card overflow-hidden">
          {/* Cache Stats */}
          <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="space-y-1">
              <div className="text-sm font-bold text-ms-text flex items-center gap-2">
                <Image className="w-4 h-4 text-ms-accent" />
                <span>Local Disk Artwork Cache</span>
              </div>
              <p className="text-xs text-ms-muted leading-relaxed">
                MaSwitch caches high-definition 600x900 cover artwork and native application icons locally.
              </p>
              {cacheStats && (
                <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-ms-muted pt-1">
                  <span>
                    Covers & Heroes:{' '}
                    <strong className="text-ms-text font-bold">
                      {cacheStats.artworkCount}
                    </strong>{' '}
                    ({(cacheStats.artworkSizeBytes / (1024 * 1024)).toFixed(1)} MB)
                  </span>
                  <span>•</span>
                  <span>
                    Icons:{' '}
                    <strong className="text-ms-text font-bold">
                      {cacheStats.iconCount}
                    </strong>{' '}
                    ({(cacheStats.iconSizeBytes / 1024).toFixed(0)} KB)
                  </span>
                </div>
              )}
              {cacheFeedback && (
                <p className="text-xs text-emerald-400 font-medium pt-1">
                  {cacheFeedback}
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={cacheClearing}
              onClick={() => void handleClearArtworkCache()}
              className="h-10 px-4 rounded-lg bg-ms-elevated hover:bg-rose-500/10 border border-ms-border hover:border-rose-500/30 text-rose-400 text-xs font-semibold inline-flex items-center gap-2 transition-colors shrink-0"
            >
              <Trash2 className="w-4 h-4" />
              <span>{cacheClearing ? 'Clearing...' : 'Clear Cache'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 3. SteamGridDB Integration */}
      <section aria-label="SteamGridDB Integration" className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-ms-muted uppercase tracking-wider">
            SteamGridDB Artwork Integration
          </h2>

          {/* Connection Status Pill */}
          <div className="flex items-center gap-2">
            {steamGridDbStatus.statusText === 'connected' ? (
              <span
                data-testid="sgdb-status-connected"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Connected & Verified</span>
              </span>
            ) : steamGridDbStatus.statusText === 'invalid-key' ? (
              <span
                data-testid="sgdb-status-invalid"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Invalid API Key</span>
              </span>
            ) : steamGridDbStatus.statusText === 'network-error' ? (
              <span
                data-testid="sgdb-status-network-error"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30"
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span>Network Error</span>
              </span>
            ) : (
              <span
                data-testid="sgdb-status-not-configured"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-ms-elevated text-ms-muted border border-ms-border"
              >
                <span className="w-2 h-2 rounded-full bg-ms-muted/40" />
                <span>Not Configured</span>
              </span>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-ms-card border border-ms-border divide-y divide-ms-border shadow-card overflow-hidden">
          {/* Key Configuration Row */}
          <div className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-ms-text flex items-center gap-2">
                  <Key className="w-4 h-4 text-ms-accent" />
                  <span>SteamGridDB v2 API Key</span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-ms-elevated text-ms-accent border border-ms-accent/20 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>DPAPI Encrypted</span>
                  </span>
                </div>
                <div className="text-xs text-ms-muted pt-0.5">
                  Stored securely using Windows DPAPI encryption in your local OS user profile. Never exposed to web views or logs.
                </div>
              </div>

              <a
                href="https://www.steamgriddb.com/profile/preferences/api"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-ms-accent hover:underline inline-flex items-center gap-1 shrink-0 self-start sm:self-auto font-medium"
              >
                <span>Get SteamGridDB Key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <input
                  type={showSgdbKey ? 'text' : 'password'}
                  data-testid="input-steamgriddb-key"
                  value={enteredSgdbKey}
                  onChange={(e) => setEnteredSgdbKey(e.target.value)}
                  placeholder={
                    steamGridDbStatus.isConfigured
                      ? '•••••••••••••••••••••••••••••••• (API key securely stored)'
                      : 'Enter SteamGridDB v2 API Key...'
                  }
                  className="w-full h-10 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-lg pl-3 pr-10 text-sm text-ms-text font-mono focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowSgdbKey(!showSgdbKey)}
                  title={showSgdbKey ? 'Hide API key' : 'Show API key'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ms-muted hover:text-ms-text transition-colors p-1"
                >
                  {showSgdbKey ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-testid="sgdb-test-btn"
                  disabled={isTestingSgdbKey || (!enteredSgdbKey && !steamGridDbStatus.isConfigured)}
                  onClick={() => void handleTestSgdbKey()}
                  className="h-10 px-4 rounded-lg bg-ms-elevated hover:bg-ms-border disabled:opacity-50 border border-ms-border text-xs font-semibold text-ms-text inline-flex items-center gap-1.5 transition-colors"
                >
                  {isTestingSgdbKey ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 text-ms-muted" />
                  )}
                  <span>Test Connection</span>
                </button>

                <button
                  type="button"
                  data-testid="sgdb-save-btn"
                  disabled={isSavingSteamGridDbKey || !enteredSgdbKey.trim()}
                  onClick={() => void handleSaveSgdbKey()}
                  className="h-10 px-4 rounded-lg bg-ms-accent hover:bg-ms-accentHover disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  {isSavingSteamGridDbKey ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{steamGridDbStatus.isConfigured ? 'Replace Key' : 'Save Key'}</span>
                </button>

                {steamGridDbStatus.isConfigured && (
                  <button
                    type="button"
                    data-testid="sgdb-remove-btn"
                    onClick={() => void handleRemoveSgdbKey()}
                    title="Remove API key from Windows Credential / DPAPI store"
                    className="h-10 px-3.5 rounded-lg bg-ms-elevated hover:bg-rose-500/10 border border-ms-border hover:border-rose-500/30 text-rose-400 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>

            {/* Feedback alert message */}
            {sgdbFeedback && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  sgdbFeedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : sgdbFeedback.type === 'error'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    : 'bg-ms-elevated border-ms-border text-ms-text'
                }`}
              >
                {sgdbFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{sgdbFeedback.message}</span>
              </div>
            )}
          </div>

          {/* Artwork Synchronization Control */}
          <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5 bg-ms-card">
            <div className="space-y-1">
              <div className="text-sm font-bold text-ms-text flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-ms-accent" />
                <span>Library Artwork Synchronization</span>
              </div>
              <p className="text-xs text-ms-muted leading-relaxed">
                Scan your local game library and download official 600x900 vertical covers, heroes, and logos from SteamGridDB.
              </p>

              {artworkSyncProgress && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-ms-text font-medium">
                      {isSyncingArtwork
                        ? `Syncing: ${artworkSyncProgress.currentTitle || 'Searching...'}`
                        : artworkSyncProgress.summaryText ||
                          `Sync ${artworkSyncProgress.status}: ${artworkSyncProgress.successCount} covers`}
                    </span>
                    <span className="text-ms-muted">
                      {artworkSyncProgress.processedGames} / {artworkSyncProgress.totalGames} games
                    </span>
                  </div>

                  <div className="w-full h-1.5 bg-ms-bg rounded-full overflow-hidden border border-ms-border">
                    <div
                      className="h-full bg-ms-accent transition-all duration-300"
                      style={{
                        width: `${
                          artworkSyncProgress.totalGames > 0
                            ? Math.round(
                                (artworkSyncProgress.processedGames /
                                  artworkSyncProgress.totalGames) *
                                  100
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  {artworkSyncProgress.summaryText && !isSyncingArtwork && (
                    <div className="text-[11px] font-mono text-emerald-400/90 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>{artworkSyncProgress.summaryText}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              data-testid="sgdb-refresh-missing-artwork-btn"
              disabled={isSyncingArtwork || !steamGridDbStatus.isConfigured}
              onClick={() => void handleSyncMissingArtwork()}
              title={
                !steamGridDbStatus.isConfigured
                  ? 'Connect a SteamGridDB API key first'
                  : 'Download missing artwork for your entire library'
              }
              className="h-10 px-4 rounded-lg bg-ms-elevated hover:bg-ms-accent/20 border border-ms-border hover:border-ms-accent/40 text-ms-accent text-xs font-semibold inline-flex items-center gap-2 transition-colors shrink-0 disabled:opacity-50"
            >
              {isSyncingArtwork ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Syncing Artwork...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Refresh Missing Artwork</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* 3. Library Scanner & Custom Folders */}
      <section aria-label="Library scanner" className="space-y-3">
        <h2 className="text-sm font-bold text-ms-muted uppercase tracking-wider px-1">
          Installed Game Scanner & Storage
        </h2>

        <div className="rounded-2xl bg-ms-card border border-ms-border divide-y divide-ms-border shadow-card overflow-hidden">
          <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
            <div>
              <div className="text-sm font-bold text-ms-text">
                Scan installed games on application startup
              </div>
              <div className="text-xs text-ms-muted">
                Automatically scans Steam libraries and Epic Games manifests when MaSwitch launches
              </div>
            </div>
            <input
              type="checkbox"
              data-testid="toggle-auto-scan"
              checked={settings.autoScanOnStartup}
              onChange={(e) =>
                void updateSettings({ autoScanOnStartup: e.target.checked })
              }
              className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
            />
          </label>

          <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
            <div>
              <div className="text-sm font-bold text-ms-text">
                Include Windows Uninstall Registry entries
              </div>
              <div className="text-xs text-ms-muted">
                Checks general Windows 64-bit and 32-bit uninstall keys for standalone games
              </div>
            </div>
            <input
              type="checkbox"
              data-testid="toggle-registry-scan"
              checked={settings.includeRegistryApps}
              onChange={(e) =>
                void updateSettings({ includeRegistryApps: e.target.checked })
              }
              className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
            />
          </label>

          {/* Custom Scan Folders */}
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-ms-text">
                  Custom Game Folders ({settings.customScanFolders.length})
                </div>
                <div className="text-xs text-ms-muted">
                  Additional local directories searched for game executables
                </div>
              </div>
              <button
                type="button"
                data-testid="add-custom-scan-folder-btn"
                onClick={() => void handleAddCustomScanFolder()}
                className="h-10 px-4 rounded-lg bg-ms-elevated hover:bg-ms-border border border-ms-border text-xs font-semibold text-ms-text inline-flex items-center gap-2 transition-colors shrink-0 shadow-sm"
              >
                <FolderPlus className="w-4 h-4 text-ms-muted" />
                <span>Add folder</span>
              </button>
            </div>

            {settings.customScanFolders.length > 0 && (
              <div className="divide-y divide-ms-border rounded-xl bg-ms-bg border border-ms-border overflow-hidden">
                {settings.customScanFolders.map((folder) => (
                  <div
                    key={folder}
                    className="px-4 py-3 flex items-center justify-between gap-3 text-xs font-mono"
                  >
                    <span className="text-ms-text truncate">{folder}</span>
                    <button
                      type="button"
                      onClick={() => void handleRemoveCustomScanFolder(folder)}
                      className="text-ms-muted hover:text-rose-400 transition-colors p-1"
                      title="Remove folder"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
            <div>
              <div className="text-sm font-bold text-ms-text">
                Demo Library Mode
              </div>
              <div className="text-xs text-ms-muted">
                Preview sample titles instead of your local installed library
              </div>
            </div>
            <input
              type="checkbox"
              data-testid="toggle-demo-mode-settings"
              checked={settings.demoModeEnabled}
              onChange={(e) =>
                void updateSettings({ demoModeEnabled: e.target.checked })
              }
              className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
            />
          </label>
        </div>
      </section>

      {/* 4. Windows Integration & Background Telemetry */}
      <section aria-label="Windows integration" className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-ms-muted uppercase tracking-wider">
            Windows Desktop & Background Behavior
          </h2>
          {windowsStartupState?.osOpenAtLoginActive && (
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
              Startup Enabled
            </span>
          )}
        </div>

        <div className="rounded-2xl bg-ms-card border border-ms-border divide-y divide-ms-border shadow-card overflow-hidden">
          <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
            <div>
              <div className="text-sm font-bold text-ms-text">
                Continuous Playtime Tracking
              </div>
              <div className="text-xs text-ms-muted">
                Monitors active game executable processes and records gameplay durations
              </div>
            </div>
            <input
              type="checkbox"
              data-testid="toggle-playtime-tracking"
              checked={settings.playtimeTrackingEnabled}
              onChange={(e) =>
                void updateSettings({
                  playtimeTrackingEnabled: e.target.checked,
                })
              }
              className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
            />
          </label>

          <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <label
                htmlFor="close-behavior-select"
                className="text-sm font-bold text-ms-text block"
              >
                Window Close Behavior
              </label>
              <div className="text-xs text-ms-muted">
                Minimize to the Windows system tray to keep background playtime tracking running
              </div>
            </div>
            <select
              id="close-behavior-select"
              data-testid="select-close-behavior"
              value={settings.closeBehavior}
              onChange={(e) =>
                void updateSettings({
                  closeBehavior: e.target.value as WindowCloseBehavior,
                })
              }
              className="h-10 bg-ms-bg border border-ms-border rounded-lg px-3 text-sm text-ms-text font-medium focus:outline-none focus:border-ms-accent"
            >
              <option value="minimize-to-tray">Minimize to System Tray</option>
              <option value="exit">Quit MaSwitch</option>
            </select>
          </div>

          <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
            <div>
              <div className="text-sm font-bold text-ms-text">
                Launch at Windows Sign-in
              </div>
              <div className="text-xs text-ms-muted">
                Starts MaSwitch automatically when logging in to your Windows desktop
              </div>
            </div>
            <input
              type="checkbox"
              data-testid="toggle-startup-preference"
              checked={settings.launchOnWindowsStartupPreference}
              onChange={(e) =>
                void updateWindowsStartup({
                  openAtLogin: e.target.checked,
                  startMinimized: settings.startMinimizedToTrayPreference,
                })
              }
              className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
            />
          </label>

          <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
            <div>
              <div className="text-sm font-bold text-ms-text">
                Start Minimized in System Tray
              </div>
              <div className="text-xs text-ms-muted">
                Launches quietly in the Windows notification tray on startup without opening the main window
              </div>
            </div>
            <input
              type="checkbox"
              data-testid="toggle-minimized-preference"
              checked={settings.startMinimizedToTrayPreference}
              onChange={(e) =>
                void updateWindowsStartup({
                  openAtLogin: settings.launchOnWindowsStartupPreference,
                  startMinimized: e.target.checked,
                })
              }
              className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
            />
          </label>
        </div>
      </section>

      {/* 5. Riot Games & Desktop Automation */}
      <section aria-label="Desktop automation" className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-ms-muted uppercase tracking-wider">
            Riot Games & Desktop Automation
          </h2>
          <span className="text-xs font-semibold text-ms-accent bg-ms-accent/10 px-2.5 py-1 rounded-md border border-ms-accent/20">
            UI Automation
          </span>
        </div>

        <div className="rounded-2xl bg-ms-card border border-ms-border divide-y divide-ms-border shadow-card overflow-hidden">
          <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
            <div>
              <div className="text-sm font-bold text-ms-text">
                Auto-Press Login Button
              </div>
              <div className="text-xs text-ms-muted">
                Automatically submit login (press Enter or click Sign In) after entering credentials into the Riot Client window
              </div>
            </div>
            <input
              type="checkbox"
              data-testid="toggle-riot-auto-submit"
              checked={settings.riotAutoSubmitLogin ?? true}
              onChange={(e) =>
                void updateSettings({
                  riotAutoSubmitLogin: e.target.checked,
                })
              }
              className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
            />
          </label>
        </div>
      </section>

      {/* 5. About MaSwitch & Developer Attribution */}
      <section aria-label="About MaSwitch" className="space-y-4">
        <h2 className="text-xs font-bold text-ms-muted uppercase tracking-wider px-1">
          About MaSwitch
        </h2>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ms-card via-[#161822] to-[#10121a] border border-ms-border/80 p-6 md:p-8 space-y-6 shadow-xl">
          {/* Subtle neon gradient ambient background glow */}
          <div className="absolute -right-16 -top-16 w-56 h-56 bg-gradient-to-br from-violet-600/15 via-fuchsia-600/10 to-transparent rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 w-56 h-56 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Brand Identity */}
            <div className="flex items-center gap-5">
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-cyan-500/20 border border-violet-500/30 flex items-center justify-center p-2.5 shadow-[0_0_24px_rgba(139,92,246,0.2)] shrink-0">
                <BrandMarkImg size={44} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-black text-white tracking-tight">
                    MaSwitch for Windows
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-violet-500/20 text-violet-300 border border-violet-500/40 uppercase tracking-wider shadow-sm">
                    Official
                  </span>
                </div>
                <p className="text-xs text-ms-muted max-w-md leading-relaxed">
                  Next-generation native desktop gaming launcher and unified multi-account manager.
                </p>
              </div>
            </div>

            {/* Developer Attribution Card */}
            <div className="flex items-center gap-3.5 px-4 py-2.5 rounded-xl bg-ms-elevated/60 border border-ms-border/70 hover:border-violet-500/40 backdrop-blur-md self-start lg:self-auto shrink-0 shadow-sm transition-colors">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-black text-xs shadow-sm">
                MW
              </div>
              <div className="text-xs leading-tight">
                <span className="text-ms-muted block text-[10px] font-medium uppercase tracking-wider">Developed by</span>
                <span className="text-sm font-bold text-white tracking-tight">Martin Wassim</span>
              </div>
              <a
                href="https://martinx.work"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-all shadow-[0_0_14px_rgba(139,92,246,0.35)] hover:scale-105 active:scale-95"
                title="Visit Martin Wassim's website"
              >
                <span>martinx.work</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Bottom Telemetry Strip */}
          <div className="relative z-10 pt-5 border-t border-ms-border/60 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="px-3.5 py-2.5 rounded-xl bg-ms-elevated/40 border border-ms-border/50 flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-ms-muted">App Version</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span data-testid="settings-app-version" className="font-mono font-bold text-white text-xs">
                  v{runtimeInfo?.appVersion ?? '0.2.0'}
                </span>
              </div>
            </div>

            <div className="px-3.5 py-2.5 rounded-xl bg-ms-elevated/40 border border-ms-border/50 flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-ms-muted">Platform</span>
              <span className="font-mono font-semibold text-ms-text text-xs">Windows x64</span>
            </div>

            <div className="px-3.5 py-2.5 rounded-xl bg-ms-elevated/40 border border-ms-border/50 flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-ms-muted">Electron</span>
              <span className="font-mono font-semibold text-ms-text text-xs">
                {runtimeInfo?.electronVersion ?? '33.4.11'}
              </span>
            </div>

            <div className="px-3.5 py-2.5 rounded-xl bg-ms-elevated/40 border border-ms-border/50 flex flex-col gap-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-ms-muted">Node.js</span>
              <span className="font-mono font-semibold text-ms-text text-xs">
                {runtimeInfo?.nodeVersion ?? '20.18.3'}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
