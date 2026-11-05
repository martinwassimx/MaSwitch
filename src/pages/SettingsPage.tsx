import React, { useEffect, useMemo, useState } from 'react';
import {
  RotateCcw,
  Check,
  Trash2,
  Eye,
  EyeOff,
  ShieldCheck,
  Cpu,
  Zap,
  Shield,
  Bell,
  Palette,
  Layers,
  Activity,
  Plus,
  Search,
  Sliders,
  Monitor,
  Ban,
  Clock,
  Archive,
  FileCheck,
  AlertTriangle,
  Boxes,
  PackageCheck,
  Sparkles,
  HardDrive,
} from 'lucide-react';
import type {
  AccentColorId,
  ExcludedApplicationRule,
  ThemePresetId,
  WindowCloseBehavior,
} from '../shared/types/settings';
import type {
  OptionalFeatureId,
} from '../shared/types/features';
import {
  OPTIONAL_FEATURES_METADATA,
  PRESET_CONFIGURATIONS,
} from '../shared/types/features';
import { useAppStore } from '../store/useAppStore';
import { BrandMarkImg } from '../components/common/BrandLogo';
import { localDatabaseService } from '../services/localDatabaseService';

export type SettingsTabId =
  | 'all'
  | 'general'
  | 'features'
  | 'appearance'
  | 'performance'
  | 'memory'
  | 'tracking'
  | 'accounts'
  | 'notifications'
  | 'backup'
  | 'about';

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
  const [activeTab, setActiveTab] = useState<SettingsTabId>('all');

  const settings = useAppStore((s) => s.settings);
  const runtimeInfo = useAppStore((s) => s.runtimeInfo);
  const games = useAppStore((s) => s.games);
  const trackerStatus = useAppStore((s) => s.trackerStatus);
  const inGameMode = useAppStore((s) => s.inGameMode);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const resetSettings = useAppStore((s) => s.resetSettings);
  const updateWindowsStartup = useAppStore((s) => s.updateWindowsStartup);
  const updateExcludedApplication = useAppStore((s) => s.updateExcludedApplication);
  const removeExcludedApplication = useAppStore((s) => s.removeExcludedApplication);

  // SteamGridDB artwork state
  const steamGridDbStatus = useAppStore((s) => s.steamGridDbStatus);
  const isSavingSteamGridDbKey = useAppStore((s) => s.isSavingSteamGridDbKey);
  const saveSteamGridDbKey = useAppStore((s) => s.saveSteamGridDbKey);
  const removeSteamGridDbKey = useAppStore((s) => s.removeSteamGridDbKey);
  const testSteamGridDbKey = useAppStore((s) => s.testSteamGridDbKey);
  const refreshSteamGridDbStatus = useAppStore((s) => s.refreshSteamGridDbStatus);

  // Modular Features State
  const featuresManifest = useAppStore((s) => s.featuresManifest);
  const featuresLoading = useAppStore((s) => s.featuresLoading);
  const featuresFeedback = useAppStore((s) => s.featuresFeedback);
  const loadFeaturesManifest = useAppStore((s) => s.loadFeaturesManifest);
  const setFeatureEnabled = useAppStore((s) => s.setFeatureEnabled);
  const applyInstallPreset = useAppStore((s) => s.applyInstallPreset);
  const launchInstallerModify = useAppStore((s) => s.launchInstallerModify);
  const clearFeaturesFeedback = useAppStore((s) => s.clearFeaturesFeedback);

  useEffect(() => {
    void loadFeaturesManifest();
  }, [loadFeaturesManifest]);

  // Feature 5: Backup & Restore state
  const backupInfo = useAppStore((s) => s.backupInfo);
  const backupValidation = useAppStore((s) => s.backupValidation);
  const backupLoading = useAppStore((s) => s.backupLoading);
  const backupFeedback = useAppStore((s) => s.backupFeedback);
  const loadBackupInfo = useAppStore((s) => s.loadBackupInfo);
  const createBackup = useAppStore((s) => s.createBackup);
  const validateBackupFile = useAppStore((s) => s.validateBackupFile);
  const restoreBackupFile = useAppStore((s) => s.restoreBackupFile);
  const clearBackupFeedback = useAppStore((s) => s.clearBackupFeedback);

  // Feature 6: Memory Management state
  const cleanupHistory = useAppStore((s) => s.cleanupHistory);
  const fetchCleanupHistory = useAppStore((s) => s.fetchCleanupHistory);
  const clearCleanupHistory = useAppStore((s) => s.clearCleanupHistory);
  const [showAdvancedWarningModal, setShowAdvancedWarningModal] = useState(false);

  useEffect(() => {
    void fetchCleanupHistory();
  }, [fetchCleanupHistory]);

  const [selectedBackupPath, setSelectedBackupPath] = useState<string | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  const handleCreateBackupWithDialog = async () => {
    const selected = await localDatabaseService.selectBackupDestination();
    if (selected) {
      await createBackup(selected);
    }
  };

  const handleSelectBackupFile = async () => {
    const selected = await localDatabaseService.selectBackupFile();
    if (selected) {
      setSelectedBackupPath(selected);
      await validateBackupFile(selected);
    }
  };

  const handleExecuteRestore = async () => {
    if (!selectedBackupPath) return;
    setShowRestoreConfirm(false);
    await restoreBackupFile(selectedBackupPath);
  };

  useEffect(() => {
    void loadBackupInfo();
  }, [loadBackupInfo]);

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

  // Excluded Applications UI state
  const [exclusionSearch, setExclusionSearch] = useState('');
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [customExeName, setCustomExeName] = useState('');
  const [customDisplayName, setCustomDisplayName] = useState('');
  const [customExcludeHistorical, setCustomExcludeHistorical] = useState(false);

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

  const handleClearCache = async () => {
    if (!window.maswitch?.artwork?.clearCache) return;
    setCacheClearing(true);
    setCacheFeedback(null);
    try {
      const res = await window.maswitch.artwork.clearCache();
      const freedMb = Math.round((res.freedBytes / (1024 * 1024)) * 10) / 10;
      setCacheFeedback(`Cleared ${res.clearedFilesCount} files (${freedMb} MB freed).`);
      await loadCacheStats();
    } catch {
      setCacheFeedback('Failed to clear artwork cache.');
    } finally {
      setCacheClearing(false);
    }
  };

  // Compile unified application tracking list (library games + configured exclusions)
  const unifiedAppList = useMemo(() => {
    const rules = settings.excludedApplications ?? [];
    const ruleMap = new Map<string, ExcludedApplicationRule>();
    for (const r of rules) {
      ruleMap.set(r.executableName.toLowerCase().trim(), r);
    }

    const items: Array<{
      key: string;
      displayName: string;
      executableName: string;
      gameId?: string;
      isLibraryGame: boolean;
      excludeFuture: boolean;
      excludeHistorical: boolean;
      isRunning: boolean;
    }> = [];

    const runningExes = new Set(
      trackerStatus?.activeSessions?.map((s) =>
        (s.executablePath ? (s.executablePath.split(/[/\\]/).pop() ?? '') : '').toLowerCase()
      ) ?? []
    );

    // 1. Add library games
    for (const g of games) {
      const exe = (
        g.executablePath
          ? (g.executablePath.split(/[/\\]/).pop() ?? '')
          : (g.executableName ?? '')
      ).toLowerCase().trim();
      if (!exe) continue;

      const rule = ruleMap.get(exe);
      items.push({
        key: `game-${g.id}`,
        displayName: g.title,
        executableName: exe,
        gameId: g.id,
        isLibraryGame: true,
        excludeFuture: rule ? rule.excludeFuture : false,
        excludeHistorical: rule ? rule.excludeHistorical : false,
        isRunning: runningExes.has(exe),
      });
    }

    // 2. Add standalone utility exclusions (e.g. Wallpaper Engine) not already in library
    for (const r of rules) {
      const exeLower = r.executableName.toLowerCase().trim();
      if (!items.some((i) => i.executableName === exeLower)) {
        items.push({
          key: `rule-${exeLower}`,
          displayName: r.displayName ?? r.executableName,
          executableName: exeLower,
          gameId: r.gameId,
          isLibraryGame: false,
          excludeFuture: r.excludeFuture,
          excludeHistorical: r.excludeHistorical,
          isRunning: runningExes.has(exeLower),
        });
      }
    }

    // Filter by search query
    if (!exclusionSearch.trim()) {
      return items;
    }
    const q = exclusionSearch.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.displayName.toLowerCase().includes(q) ||
        item.executableName.toLowerCase().includes(q)
    );
  }, [games, settings.excludedApplications, trackerStatus?.activeSessions, exclusionSearch]);

  const handleToggleCountHours = async (
    executableName: string,
    currentExcludeFuture: boolean,
    displayName?: string,
    gameId?: string
  ) => {
    const existingRule = settings.excludedApplications?.find(
      (r) => r.executableName.toLowerCase() === executableName.toLowerCase()
    );

    await updateExcludedApplication({
      executableName: executableName.toLowerCase(),
      displayName: displayName ?? existingRule?.displayName,
      gameId: gameId ?? existingRule?.gameId,
      excludeFuture: !currentExcludeFuture,
      excludeHistorical: existingRule?.excludeHistorical ?? false,
      addedAtIso: existingRule?.addedAtIso ?? new Date().toISOString(),
    });
  };

  const handleToggleHistoricalExclusion = async (
    executableName: string,
    currentExcludeHistorical: boolean,
    displayName?: string,
    gameId?: string
  ) => {
    const existingRule = settings.excludedApplications?.find(
      (r) => r.executableName.toLowerCase() === executableName.toLowerCase()
    );

    await updateExcludedApplication({
      executableName: executableName.toLowerCase(),
      displayName: displayName ?? existingRule?.displayName,
      gameId: gameId ?? existingRule?.gameId,
      excludeFuture: existingRule?.excludeFuture ?? false,
      excludeHistorical: !currentExcludeHistorical,
      addedAtIso: existingRule?.addedAtIso ?? new Date().toISOString(),
    });
  };

  const handleAddCustomExecutable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customExeName.trim()) return;

    let cleanExe = customExeName.trim().toLowerCase();
    if (cleanExe.includes('/') || cleanExe.includes('\\')) {
      cleanExe = cleanExe.split(/[/\\]/).pop() ?? cleanExe;
    }
    if (!cleanExe.endsWith('.exe')) {
      cleanExe += '.exe';
    }

    await updateExcludedApplication({
      executableName: cleanExe,
      displayName: customDisplayName.trim() || cleanExe,
      excludeFuture: true,
      excludeHistorical: customExcludeHistorical,
      addedAtIso: new Date().toISOString(),
    });

    setCustomExeName('');
    setCustomDisplayName('');
    setCustomExcludeHistorical(false);
    setShowAddCustomModal(false);
  };

  const handleBrowseExecutable = async () => {
    if (window.maswitch?.library?.selectExecutableDialog) {
      try {
        const filePath = await window.maswitch.library.selectExecutableDialog();
        if (filePath) {
          const exe = filePath.split(/[/\\]/).pop() ?? filePath;
          setCustomExeName(exe);
          if (!customDisplayName) {
            setCustomDisplayName(exe.replace(/\.exe$/i, ''));
          }
        }
      } catch {
        // ignore
      }
    }
  };

  const shouldShowSection = (section: SettingsTabId) => {
    return (
      activeTab === 'all' ||
      activeTab === section ||
      (section === 'memory' && activeTab === 'performance')
    );
  };

  return (
    <div
      data-testid="page-settings"
      className="max-w-5xl mx-auto space-y-8 pb-16 animate-fadeIn"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ms-border/60 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ms-text">
            Settings & Preferences
          </h1>
          <p className="text-xs text-ms-muted mt-1">
            Configure performance, game tracking exclusions, themes, and Windows desktop integration
          </p>
        </div>

        <button
          type="button"
          data-testid="reset-settings-btn"
          onClick={() => void resetSettings()}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-ms-muted hover:text-ms-text bg-ms-card hover:bg-ms-elevated border border-ms-border rounded-xl transition-all shadow-sm self-start sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Defaults</span>
        </button>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-ms-border/40">
        {[
          { id: 'all' as const, label: 'All Settings', icon: Sliders },
          { id: 'general' as const, label: 'General', icon: Monitor },
          { id: 'features' as const, label: 'Installed Features', icon: Boxes },
          { id: 'appearance' as const, label: 'Appearance', icon: Palette },
          { id: 'performance' as const, label: 'Performance', icon: Zap },
          ...(featuresManifest?.features.memoryManagement?.installed !== false
            ? [{ id: 'memory' as const, label: 'Memory Management', icon: Sparkles }]
            : []),
          { id: 'tracking' as const, label: 'Game Tracking', icon: Activity },
          { id: 'accounts' as const, label: 'Accounts & Security', icon: Shield },
          { id: 'notifications' as const, label: 'Notifications', icon: Bell },
          ...(featuresManifest?.features.backupRestore?.enabled !== false
            ? [{ id: 'backup' as const, label: 'Backup & Restore', icon: Archive }]
            : []),
          { id: 'about' as const, label: 'About', icon: Layers },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`settings-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id as SettingsTabId)}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                active
                  ? 'bg-ms-accent text-white shadow-sm ring-1 ring-ms-accent/40'
                  : 'text-ms-muted hover:text-ms-text hover:bg-ms-card/80 bg-ms-card/30 border border-ms-border/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SECTION: Installed Features & Modular Components */}
      {shouldShowSection('features') && (
        <section
          data-testid="section-installed-features"
          aria-label="Installed Features & Modular Components"
          className="space-y-6"
        >
          {/* Header & Presets banner */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-br from-ms-card via-[#161822] to-ms-card border border-ms-border shadow-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-ms-text flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-violet-400" />
                  <span>Modular Installation Preset:</span>
                </span>
                <span className="text-xs uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  {featuresManifest?.preset
                    ? PRESET_CONFIGURATIONS[featuresManifest.preset]?.name ?? featuresManifest.preset
                    : 'Complete'}
                </span>
              </div>
              <p className="text-xs text-ms-muted max-w-xl">
                {featuresManifest?.preset && PRESET_CONFIGURATIONS[featuresManifest.preset]?.description}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="modify-installation-btn"
                disabled={featuresLoading}
                onClick={() => void launchInstallerModify()}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-xl transition-all shadow-md shadow-violet-900/30"
              >
                <PackageCheck className="w-3.5 h-3.5" />
                <span>Modify Installation via Setup...</span>
              </button>
            </div>
          </div>

          {/* Preset Quick Selectors */}
          <div className="p-4 rounded-xl bg-ms-card/60 border border-ms-border/60 space-y-3">
            <div className="text-xs font-bold text-ms-muted uppercase tracking-wider">
              Quick Preset Switcher
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(['minimal', 'recommended', 'complete'] as const).map((pId) => {
                const preset = PRESET_CONFIGURATIONS[pId];
                const isActive = featuresManifest?.preset === pId;
                return (
                  <button
                    key={pId}
                    type="button"
                    data-testid={`apply-preset-${pId}`}
                    onClick={() => void applyInstallPreset(pId)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isActive
                        ? 'bg-violet-600/15 border-violet-500 text-white shadow-sm ring-1 ring-violet-500/30'
                        : 'bg-ms-card hover:bg-ms-elevated border-ms-border text-ms-muted hover:text-ms-text'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-ms-text">{preset.name}</span>
                      {isActive && <Check className="w-3.5 h-3.5 text-violet-400" />}
                    </div>
                    <p className="text-[11px] text-ms-muted mt-1 leading-snug">{preset.tagline}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feedback banner */}
          {featuresFeedback && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-center justify-between gap-3 ${
                featuresFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
              }`}
            >
              <span>{featuresFeedback.message}</span>
              <button
                type="button"
                onClick={clearFeaturesFeedback}
                className="text-ms-muted hover:text-ms-text text-[11px] font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Optional Features List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-ms-muted uppercase tracking-wider px-1">
              Optional Components & Resource Impact
            </h3>

            <div className="space-y-3">
              {(Object.keys(OPTIONAL_FEATURES_METADATA) as OptionalFeatureId[]).map((featureId) => {
                const meta = OPTIONAL_FEATURES_METADATA[featureId];
                const featureState = featuresManifest?.features[featureId] ?? {
                  installed: true,
                  enabled: true,
                };
                const isInstalled = featureState.installed;
                const isEnabled = featureState.enabled && isInstalled;

                return (
                  <div
                    key={featureId}
                    data-testid={`feature-card-${featureId}`}
                    className="p-5 rounded-2xl bg-ms-card border border-ms-border space-y-3 hover:border-ms-border/80 transition-all shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-ms-text">{meta.name}</h4>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-ms-elevated text-ms-muted border border-ms-border/50">
                            {meta.category}
                          </span>
                          {isInstalled ? (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <Check className="w-3 h-3" /> Installed
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                              Not Installed
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ms-muted leading-relaxed max-w-2xl">
                          {meta.description}
                        </p>
                      </div>

                      {/* Enable/Disable Control */}
                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        {isInstalled ? (
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              data-testid={`toggle-feature-${featureId}`}
                              checked={isEnabled}
                              onChange={(e) => void setFeatureEnabled(featureId, e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-ms-elevated peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600 border border-ms-border"></div>
                            <span className="ml-2.5 text-xs font-semibold text-ms-text">
                              {isEnabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </label>
                        ) : (
                          <span className="text-[11px] text-amber-400/90 font-medium">
                            Requires Setup
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Measured Footprint Metrics */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-ms-border/40 text-[11px]">
                      <div className="p-2 rounded-lg bg-ms-elevated/40 border border-ms-border/40">
                        <span className="text-ms-muted block text-[10px] uppercase font-bold">RAM Impact</span>
                        <span className="text-ms-text font-medium">{meta.ramImpactLabel}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-ms-elevated/40 border border-ms-border/40">
                        <span className="text-ms-muted block text-[10px] uppercase font-bold">CPU Footprint</span>
                        <span className="text-ms-text font-medium">{meta.cpuImpactLabel}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-ms-elevated/40 border border-ms-border/40">
                        <span className="text-ms-muted block text-[10px] uppercase font-bold">Disk Footprint</span>
                        <span className="text-ms-text font-medium">{meta.diskImpactLabel}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* SECTION: Performance & Low-End PC Optimization */}
      {shouldShowSection('performance') && (
        <section aria-label="Performance" className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-ms-muted uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-ms-accent" />
              <span>Performance & Low-End PC Optimization</span>
            </h2>
            {inGameMode && (
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Game Active: Performance Mode Engaged
              </span>
            )}
          </div>

          <div className="rounded-2xl bg-ms-card border border-ms-border divide-y divide-ms-border shadow-card overflow-hidden">
            {/* Low-End PC Mode */}
            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-ms-text">Low-End PC Mode</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/20">
                    Max FPS & Low RAM
                  </span>
                </div>
                <div className="text-xs text-ms-muted max-w-2xl">
                  Disables GPU backdrop blurs, expensive shadows, and decorative animations. Throttles background scanner polling to preserve CPU, GPU memory, and integrated graphics bandwidth.
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="low-end-pc-toggle"
                checked={settings.lowEndPcMode}
                onChange={(e) => void updateSettings({ lowEndPcMode: e.target.checked })}
                className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
              />
            </label>

            {/* Game-Aware Performance Mode */}
            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-bold text-ms-text">Game-Aware Performance Mode</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-500/20">
                    Zero FPS Impact
                  </span>
                </div>
                <div className="text-xs text-ms-muted max-w-2xl">
                  Automatically detects when a real game is active. Freezes decorative UI animations, reduces background polling frequency (from 5s to 15s), and defers artwork syncs so gaming performance is unaffected.
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="game-aware-mode-toggle"
                checked={settings.gameAwarePerformanceMode !== false}
                onChange={(e) => void updateSettings({ gameAwarePerformanceMode: e.target.checked })}
                className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
              />
            </label>

            {/* Continuous Playtime Tracking */}
            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-ms-text">Continuous Playtime Tracking</span>
                </div>
                <div className="text-xs text-ms-muted max-w-2xl">
                  Accurate local Windows process monitoring with alias matching, sleep/resume protection, and crash recovery.
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-playtime-tracking"
                checked={settings.playtimeTrackingEnabled}
                onChange={(e) => void updateSettings({ playtimeTrackingEnabled: e.target.checked })}
                className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
              />
            </label>

            {/* UI Animations */}
            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div>
                <div className="text-sm font-bold text-ms-text">Interface Animations</div>
                <div className="text-xs text-ms-muted">
                  Smooth transitions across library, accounts, and statistics pages
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="pref-animations"
                checked={settings.animationsEnabled}
                onChange={(e) => void updateSettings({ animationsEnabled: e.target.checked })}
                className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
              />
            </label>

            {/* Reduced Motion */}
            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div>
                <div className="text-sm font-bold text-ms-text">Reduced Motion Preference</div>
                <div className="text-xs text-ms-muted">
                  Honor accessibility preferences by skipping sliding and scaling animations
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="pref-reduced-motion"
                checked={settings.reducedMotion}
                onChange={(e) => void updateSettings({ reducedMotion: e.target.checked })}
                className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
              />
            </label>
          </div>
        </section>
      )}

      {/* SECTION: Memory Management & RAM Optimization */}
      {shouldShowSection('memory') && (
        <section
          data-testid="section-memory-management"
          aria-label="Memory Management"
          className="space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-sm font-bold text-ms-muted uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <span>Memory Management & Optimization</span>
              </h2>
              <p className="text-xs text-ms-muted mt-0.5">
                Safe, lightweight RAM management for low-end PCs inspired by clean-room Win32 APIs (no background services, no kernel drivers)
              </p>
            </div>
            {settings.enableMemoryManagement !== false && (
              <span className="text-xs font-semibold text-violet-300 bg-violet-500/10 px-2.5 py-0.5 rounded-full border border-violet-500/20 flex items-center gap-1.5 self-start sm:self-auto">
                <span className="w-2 h-2 rounded-full bg-violet-400" />
                Memory Management Active
              </span>
            )}
          </div>

          <div className="rounded-2xl bg-ms-card border border-ms-border divide-y divide-ms-border shadow-card overflow-hidden">
            {/* Enable Memory Management Toggle */}
            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-bold text-ms-text">Enable Memory Management</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-300 border border-violet-500/20">
                    Low-End PC Optimizer
                  </span>
                </div>
                <div className="text-xs text-ms-muted max-w-2xl">
                  Enables memory monitoring telemetry, candidate background app detection, and quick RAM optimization tools.
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-enable-memory-mgmt"
                checked={settings.enableMemoryManagement !== false}
                onChange={(e) => void updateSettings({ enableMemoryManagement: e.target.checked })}
                className="w-5 h-5 accent-violet-600 rounded cursor-pointer shrink-0"
              />
            </label>

            {/* Show RAM Statistics Toggle */}
            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-bold text-ms-text">Show RAM Statistics</span>
                </div>
                <div className="text-xs text-ms-muted max-w-2xl">
                  Display real-time RAM usage counters and available memory badges in telemetry views and resource headers.
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-show-ram-stats"
                checked={settings.showRamStatistics !== false}
                onChange={(e) => void updateSettings({ showRamStatistics: e.target.checked })}
                className="w-5 h-5 accent-violet-600 rounded cursor-pointer shrink-0"
              />
            </label>

            {/* Refresh Interval Selector */}
            <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-ms-elevated/30 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-ms-text">Memory Monitoring Refresh Interval</span>
                </div>
                <div className="text-xs text-ms-muted max-w-2xl">
                  Control how frequently memory metrics are polled when the Performance tab is actively viewed (polling completely halts when inactive).
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {([3000, 5000, 10000] as const).map((ms) => (
                  <button
                    key={ms}
                    type="button"
                    data-testid={`refresh-interval-${ms}`}
                    onClick={() => void updateSettings({ memoryRefreshIntervalMs: ms })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      (settings.memoryRefreshIntervalMs || 5000) === ms
                        ? 'bg-violet-600 text-white shadow-sm ring-1 ring-violet-500/50'
                        : 'bg-ms-elevated/60 text-ms-muted hover:text-ms-text border border-ms-border'
                    }`}
                  >
                    {ms / 1000}s {ms === 5000 ? '(Balanced)' : ms === 10000 ? '(Low CPU)' : '(Fast)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Confirm Before Cleanup Toggle */}
            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-ms-text">Confirm Before Cleanup</span>
                </div>
                <div className="text-xs text-ms-muted max-w-2xl">
                  Require a confirmation modal showing detected background apps and cleanup modes before executing memory optimization.
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-confirm-cleanup"
                checked={settings.confirmBeforeCleanup !== false}
                onChange={(e) => void updateSettings({ confirmBeforeCleanup: e.target.checked })}
                className="w-5 h-5 accent-violet-600 rounded cursor-pointer shrink-0"
              />
            </label>

            {/* Advanced Memory Mode (with Warning Modal) */}
            <div className="p-6 flex items-center justify-between gap-4 hover:bg-ms-elevated/30 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-rose-400" />
                  <span className="text-sm font-bold text-ms-text">Advanced Memory Mode (EmptyWorkingSet)</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/20">
                    Opt-in Only
                  </span>
                </div>
                <div className="text-xs text-ms-muted max-w-2xl">
                  Enables documented Win32 <code className="font-mono text-violet-300">EmptyWorkingSet</code> page trimming across permitted desktop applications. Never affects system processes, security software, or games.
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-advanced-memory-mode"
                checked={Boolean(settings.enableAdvancedMemoryMode)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setShowAdvancedWarningModal(true);
                  } else {
                    void updateSettings({ enableAdvancedMemoryMode: false });
                  }
                }}
                className="w-5 h-5 accent-violet-600 rounded cursor-pointer shrink-0"
              />
            </div>

            {/* Prepare PC Before Launching Game */}
            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-ms-text">Prepare PC Before Launching a Game</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/20">
                    Anti-Stutter
                  </span>
                </div>
                <div className="text-xs text-ms-muted max-w-2xl">
                  Automatically measures free RAM when launching a game from MaSwitch. If available RAM is below 1.5 GB, prompts to optimize memory to prevent in-game page faults and stuttering.
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-prepare-pc-before-launch"
                checked={Boolean(settings.preparePcBeforeLaunch)}
                onChange={(e) => void updateSettings({ preparePcBeforeLaunch: e.target.checked })}
                className="w-5 h-5 accent-violet-600 rounded cursor-pointer shrink-0"
              />
            </label>

            {/* Cleanup History Maintenance */}
            <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-ms-elevated/30 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-bold text-ms-text">Cleanup History Log</span>
                </div>
                <div className="text-xs text-ms-muted max-w-2xl">
                  MaSwitch stores operational cleanup logs locally in SQLite. Currently holding{' '}
                  <span className="font-semibold text-ms-text">{cleanupHistory.length} recorded events</span>.
                </div>
              </div>
              <button
                type="button"
                data-testid="btn-clear-settings-memory-history"
                disabled={cleanupHistory.length === 0}
                onClick={() => void clearCleanupHistory()}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  cleanupHistory.length === 0
                    ? 'opacity-40 cursor-not-allowed bg-ms-elevated text-ms-muted border-ms-border'
                    : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear History</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* SECTION: Game Tracking & Excluded Applications */}
      {shouldShowSection('tracking') && (
        <section aria-label="Game Tracking" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-sm font-bold text-ms-muted uppercase tracking-wider flex items-center gap-2">
                <Ban className="w-4 h-4 text-rose-400" />
                <span>Game Tracking & Excluded Applications</span>
              </h2>
              <p className="text-xs text-ms-muted mt-0.5">
                Prevent background utilities like Wallpaper Engine from counting as games or contributing to statistics
              </p>
            </div>

            <button
              type="button"
              data-testid="add-excluded-app-btn"
              onClick={() => setShowAddCustomModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-ms-accent text-white hover:bg-ms-accent/90 shadow-sm transition-all self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Excluded Executable</span>
            </button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-ms-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              data-testid="excluded-apps-search"
              value={exclusionSearch}
              onChange={(e) => setExclusionSearch(e.target.value)}
              placeholder="Search detected games, background utilities, or executables (e.g. wallpaper64.exe)..."
              className="w-full h-10 bg-ms-card border border-ms-border rounded-xl pl-10 pr-4 text-xs text-ms-text placeholder:text-ms-muted/70 focus:outline-none focus:border-ms-accent transition-colors shadow-inner"
            />
          </div>

          {/* Add Custom Executable Form Modal */}
          {showAddCustomModal && (
            <div className="p-5 rounded-2xl bg-ms-elevated/80 border border-ms-border space-y-4 animate-fadeIn shadow-lg">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-ms-text">Add Executable to Exclusion List</div>
                <button
                  type="button"
                  onClick={() => setShowAddCustomModal(false)}
                  className="text-xs text-ms-muted hover:text-ms-text"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleAddCustomExecutable} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-ms-muted block mb-1">
                      Executable Name or File (.exe)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={customExeName}
                        onChange={(e) => setCustomExeName(e.target.value)}
                        placeholder="e.g. wallpaper64.exe"
                        className="flex-1 h-9 px-3 text-xs bg-ms-card border border-ms-border rounded-lg text-ms-text focus:outline-none focus:border-ms-accent"
                      />
                      <button
                        type="button"
                        onClick={handleBrowseExecutable}
                        className="px-3 py-1.5 text-xs font-medium bg-ms-card border border-ms-border hover:bg-ms-elevated rounded-lg text-ms-text transition-colors"
                      >
                        Browse...
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-ms-muted block mb-1">
                      Display Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={customDisplayName}
                      onChange={(e) => setCustomDisplayName(e.target.value)}
                      placeholder="e.g. Wallpaper Engine"
                      className="w-full h-9 px-3 text-xs bg-ms-card border border-ms-border rounded-lg text-ms-text focus:outline-none focus:border-ms-accent"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-ms-muted pt-1">
                  <input
                    type="checkbox"
                    checked={customExcludeHistorical}
                    onChange={(e) => setCustomExcludeHistorical(e.target.checked)}
                    className="w-4 h-4 accent-[#4C8DFF] rounded"
                  />
                  <span>Also remove historical hours for this executable from statistics charts</span>
                </label>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddCustomModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-ms-muted hover:text-ms-text bg-ms-card border border-ms-border rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold bg-ms-accent text-white hover:bg-ms-accent/90 rounded-xl transition-all shadow-sm"
                  >
                    Save Exclusion
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Applications list */}
          <div className="rounded-2xl bg-ms-card border border-ms-border divide-y divide-ms-border shadow-card overflow-hidden">
            {unifiedAppList.length === 0 ? (
              <div className="p-8 text-center text-xs text-ms-muted">
                No matching applications or utilities found. Use &quot;Add Excluded Executable&quot; to add a custom binary.
              </div>
            ) : (
              unifiedAppList.map((app) => (
                <div
                  key={app.key}
                  className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-ms-elevated/20 transition-colors"
                >
                  {/* Identity */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        app.excludeFuture
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                          : app.isRunning
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : 'bg-ms-elevated border-ms-border text-ms-muted'
                      }`}
                    >
                      {app.excludeFuture ? (
                        <Ban className="w-4 h-4" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-ms-text truncate">
                          {app.displayName}
                        </span>
                        {app.isRunning && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Running Now
                          </span>
                        )}
                        {app.excludeFuture && (
                          <span className="text-[10px] font-semibold text-rose-300 bg-rose-500/15 px-2 py-0.5 rounded-full border border-rose-500/20">
                            Tracking Excluded
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ms-muted font-mono truncate">
                        {app.executableName}
                        {app.isLibraryGame && (
                          <span className="text-ms-muted/60 font-sans ml-2">• Library Game</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Toggles */}
                  <div className="flex flex-wrap items-center gap-4 sm:gap-6 self-start md:self-auto">
                    {/* Count Hours Switch */}
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-semibold text-ms-muted">Count Hours:</span>
                      <button
                        type="button"
                        data-testid={`toggle-count-hours-${app.executableName}`}
                        onClick={() =>
                          void handleToggleCountHours(
                            app.executableName,
                            app.excludeFuture,
                            app.displayName,
                            app.gameId
                          )
                        }
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                          !app.excludeFuture
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : 'bg-ms-elevated text-ms-muted border-ms-border hover:text-ms-text'
                        }`}
                      >
                        {!app.excludeFuture ? 'ON' : 'OFF'}
                      </button>
                    </div>

                    {/* Exclude Historical Statistics */}
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-ms-muted hover:text-ms-text">
                      <input
                        type="checkbox"
                        checked={app.excludeHistorical}
                        onChange={() =>
                          void handleToggleHistoricalExclusion(
                            app.executableName,
                            app.excludeHistorical,
                            app.displayName,
                            app.gameId
                          )
                        }
                        className="w-4 h-4 accent-[#4C8DFF] rounded"
                      />
                      <span>Remove From Stats</span>
                    </label>

                    {/* Remove Rule (for non-library entries) */}
                    {!app.isLibraryGame && (
                      <button
                        type="button"
                        title="Remove custom exclusion"
                        onClick={() => void removeExcludedApplication(app.executableName)}
                        className="p-1.5 rounded-lg text-ms-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* SECTION: Appearance & Themes */}
      {shouldShowSection('appearance') && (
        <section aria-label="Appearance" className="space-y-4">
          <h2 className="text-sm font-bold text-ms-muted uppercase tracking-wider px-1 flex items-center gap-2">
            <Palette className="w-4 h-4 text-ms-accent" />
            <span>Appearance & Themes</span>
          </h2>

          <div className="rounded-2xl bg-ms-card border border-ms-border divide-y divide-ms-border shadow-card overflow-hidden">
            {/* Theme Presets */}
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
                        {active && <Check className="w-4 h-4 text-ms-accent" />}
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

            {/* Accent Colors */}
            <div className="p-6 space-y-4">
              <div>
                <div className="text-sm font-bold text-ms-text">Accent Color</div>
                <div className="text-xs text-ms-muted">
                  Interactive highlights, buttons, and active indicators
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {ACCENT_OPTIONS.map((accent) => {
                  const active = settings.accentColor === accent.id;
                  return (
                    <button
                      key={accent.id}
                      type="button"
                      data-testid={`accent-option-${accent.id}`}
                      onClick={() => void updateSettings({ accentColor: accent.id })}
                      className={`p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${
                        active
                          ? 'bg-ms-elevated border-ms-accent ring-2 ring-ms-accent/30 shadow-md'
                          : 'bg-ms-bg border-ms-border hover:border-ms-muted/60'
                      }`}
                    >
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-sm"
                        style={{ backgroundColor: accent.swatchHex }}
                      >
                        {active && <Check className="w-3 h-3 text-white" />}
                      </span>
                      <span className="text-xs font-semibold text-ms-text truncate">
                        {accent.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Artwork Cache Management */}
            <div className="p-6 space-y-4">
              <div>
                <div className="text-sm font-bold text-ms-text">Artwork & Icon Cache</div>
                <div className="text-xs text-ms-muted">
                  Local cache of extracted game icons and SteamGridDB artwork covers
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-ms-bg border border-ms-border">
                <div className="text-xs text-ms-muted">
                  {cacheStats ? (
                    <span>
                      Cached Covers: <strong className="text-ms-text">{cacheStats.artworkCount}</strong> • Cached Icons: <strong className="text-ms-text">{cacheStats.iconCount}</strong> • Total: <strong className="text-ms-text">{Math.round((cacheStats.totalSizeBytes / (1024 * 1024)) * 10) / 10} MB</strong>
                    </span>
                  ) : (
                    <span>Analyzing local artwork cache...</span>
                  )}
                  {cacheFeedback && (
                    <span className="ml-3 text-emerald-400 font-semibold">{cacheFeedback}</span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={cacheClearing}
                  onClick={() => void handleClearCache()}
                  className="px-3.5 py-1.5 text-xs font-semibold text-ms-muted hover:text-rose-400 bg-ms-card hover:bg-ms-elevated border border-ms-border rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Cache</span>
                </button>
              </div>
            </div>

            {/* SteamGridDB API Integration */}
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-ms-text">SteamGridDB Integration</div>
                  <div className="text-xs text-ms-muted">
                    Fetch official vertical game box-arts, heroes, and logos
                  </div>
                </div>

                {steamGridDbStatus?.statusText === 'connected' && (
                  <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                    Connected
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showSgdbKey ? 'text' : 'password'}
                      value={enteredSgdbKey}
                      onChange={(e) => setEnteredSgdbKey(e.target.value)}
                      placeholder={
                        steamGridDbStatus?.statusText === 'connected'
                          ? '•••••••••••• (Key Configured)'
                          : 'Paste SteamGridDB API key...'
                      }
                      className="w-full h-9 px-3 pr-9 text-xs bg-ms-bg border border-ms-border rounded-lg text-ms-text focus:outline-none focus:border-ms-accent font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSgdbKey(!showSgdbKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ms-muted hover:text-ms-text"
                    >
                      {showSgdbKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isTestingSgdbKey}
                    onClick={() => void handleTestSgdbKey()}
                    className="px-3.5 py-1.5 text-xs font-medium bg-ms-bg border border-ms-border hover:bg-ms-elevated rounded-lg text-ms-text transition-colors"
                  >
                    {isTestingSgdbKey ? 'Testing...' : 'Test Key'}
                  </button>

                  <button
                    type="button"
                    disabled={isSavingSteamGridDbKey}
                    onClick={() => void handleSaveSgdbKey()}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-ms-accent text-white hover:bg-ms-accent/90 rounded-lg transition-colors shadow-sm"
                  >
                    Save Key
                  </button>

                  {steamGridDbStatus?.statusText === 'connected' && (
                    <button
                      type="button"
                      onClick={() => void handleRemoveSgdbKey()}
                      className="px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {sgdbFeedback && (
                  <div
                    className={`text-xs px-3 py-2 rounded-lg border ${
                      sgdbFeedback.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : sgdbFeedback.type === 'error'
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                          : 'bg-ms-elevated border-ms-border text-ms-muted'
                    }`}
                  >
                    {sgdbFeedback.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SECTION: Accounts & Security */}
      {shouldShowSection('accounts') && (
        <section aria-label="Accounts & Security" className="space-y-4">
          <h2 className="text-sm font-bold text-ms-muted uppercase tracking-wider px-1 flex items-center gap-2">
            <Shield className="w-4 h-4 text-ms-accent" />
            <span>Accounts & Security</span>
          </h2>

          <div className="rounded-2xl bg-ms-card border border-ms-border divide-y divide-ms-border shadow-card overflow-hidden">
            {/* Riot Desktop Automation Auto-Press Login Button */}
            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-ms-text">Auto-Press Riot Client Login Button</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-ms-accent/15 text-ms-accent border border-ms-accent/20">
                    Desktop Automation
                  </span>
                </div>
                <div className="text-xs text-ms-muted max-w-2xl">
                  Automatically submit login (press Enter / click official Riot sign-in button) immediately after inserting vault credentials into the official Riot Client window.
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-riot-auto-submit"
                checked={settings.riotAutoSubmitLogin ?? true}
                onChange={(e) => void updateSettings({ riotAutoSubmitLogin: e.target.checked })}
                className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
              />
            </label>

            {/* Windows DPAPI Credential Vault Status */}
            <div className="p-6 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-ms-text">Windows DPAPI Credential Vault</span>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                    Active & Encrypted
                  </span>
                </div>
                <div className="text-xs text-ms-muted max-w-2xl">
                  Your Riot credentials and third-party account details are protected using Windows DPAPI (Electron safeStorage). Plaintext passwords are never written to disk, SQLite, or telemetry logs.
                </div>
              </div>
            </div>

            {/* Demo Mode Toggle */}
            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div>
                <div className="text-sm font-bold text-ms-text">Demo Simulation Mode</div>
                <div className="text-xs text-ms-muted">
                  Use synthetic sample games, multi-account profiles, and statistics for previewing
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="pref-demo-mode"
                checked={settings.demoModeEnabled}
                onChange={(e) => void updateSettings({ demoModeEnabled: e.target.checked })}
                className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
              />
            </label>
          </div>
        </section>
      )}

      {/* SECTION: Notifications */}
      {shouldShowSection('notifications') && (
        <section aria-label="Notifications" className="space-y-4">
          <h2 className="text-sm font-bold text-ms-muted uppercase tracking-wider px-1 flex items-center gap-2">
            <Bell className="w-4 h-4 text-ms-accent" />
            <span>Desktop Notifications</span>
          </h2>

          <div className="rounded-2xl bg-ms-card border border-ms-border divide-y divide-ms-border shadow-card overflow-hidden">
            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div>
                <div className="text-sm font-bold text-ms-text">Windows System Notifications</div>
                <div className="text-xs text-ms-muted">
                  Receive native Windows desktop notifications for account switching status and tracking errors
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="notifications-toggle"
                checked={settings.notificationsEnabled !== false}
                onChange={(e) => void updateSettings({ notificationsEnabled: e.target.checked })}
                className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
              />
            </label>

            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-ms-text">Suppress Notifications During Gaming</span>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                    Do Not Disturb
                  </span>
                </div>
                <div className="text-xs text-ms-muted">
                  Automatically mute all non-critical desktop notifications when a full-screen game session is active
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="suppress-in-game-toggle"
                checked={settings.suppressNotificationsInGame !== false}
                onChange={(e) => void updateSettings({ suppressNotificationsInGame: e.target.checked })}
                className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
              />
            </label>
          </div>
        </section>
      )}

      {/* SECTION: General */}
      {shouldShowSection('general') && (
        <section aria-label="General Settings" className="space-y-4">
          <h2 className="text-sm font-bold text-ms-muted uppercase tracking-wider px-1 flex items-center gap-2">
            <Monitor className="w-4 h-4 text-ms-accent" />
            <span>General & Desktop Integration</span>
          </h2>

          <div className="rounded-2xl bg-ms-card border border-ms-border divide-y divide-ms-border shadow-card overflow-hidden">
            {/* Close behavior */}
            <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <label htmlFor="close-behavior-select" className="text-sm font-bold text-ms-text block">
                  Window Close Behavior
                </label>
                <div className="text-xs text-ms-muted">
                  Minimize to system tray to continue background playtime tracking seamlessly
                </div>
              </div>
              <select
                id="close-behavior-select"
                data-testid="select-close-behavior"
                value={settings.closeBehavior}
                onChange={(e) => void updateSettings({ closeBehavior: e.target.value as WindowCloseBehavior })}
                className="h-9 px-3 bg-ms-bg border border-ms-border rounded-xl text-xs text-ms-text focus:outline-none focus:border-ms-accent shadow-sm"
              >
                <option value="minimize-to-tray" data-testid="pref-close-tray">
                  Minimize to System Tray (Recommended)
                </option>
                <option value="exit" data-testid="pref-close-exit">
                  Exit Application Completely
                </option>
              </select>
            </div>

            {/* Launch on Windows startup */}
            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div>
                <div className="text-sm font-bold text-ms-text">Launch on Windows Startup</div>
                <div className="text-xs text-ms-muted">
                  Automatically start MaSwitch when logging into Windows
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="pref-open-startup"
                checked={settings.launchOnWindowsStartupPreference}
                onChange={(e) => {
                  const val = e.target.checked;
                  void updateSettings({ launchOnWindowsStartupPreference: val });
                  void updateWindowsStartup({
                    openAtLogin: val,
                    startMinimized: settings.startMinimizedToTrayPreference,
                  });
                }}
                className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
              />
            </label>

            {/* Start minimized */}
            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div>
                <div className="text-sm font-bold text-ms-text">Start Minimized to Tray</div>
                <div className="text-xs text-ms-muted">
                  Launch quietly into the system tray without showing the main window on login
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="pref-minimized-tray"
                checked={settings.startMinimizedToTrayPreference}
                onChange={(e) => {
                  const val = e.target.checked;
                  void updateSettings({ startMinimizedToTrayPreference: val });
                  void updateWindowsStartup({
                    openAtLogin: settings.launchOnWindowsStartupPreference,
                    startMinimized: val,
                  });
                }}
                className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
              />
            </label>

            {/* Compact cards */}
            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div>
                <div className="text-sm font-bold text-ms-text">Compact Game Cards</div>
                <div className="text-xs text-ms-muted">
                  Use dense grid layout with smaller covers for displaying larger libraries
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="pref-compact-cards"
                checked={settings.compactGameCards}
                onChange={(e) => void updateSettings({ compactGameCards: e.target.checked })}
                className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
              />
            </label>

            {/* Sidebar counts */}
            <label className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-ms-elevated/30 transition-colors">
              <div>
                <div className="text-sm font-bold text-ms-text">Show Sidebar Item Counts</div>
                <div className="text-xs text-ms-muted">
                  Display real-time library counts alongside navigation icons
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="pref-sidebar-counts"
                checked={settings.showSidebarCounts}
                onChange={(e) => void updateSettings({ showSidebarCounts: e.target.checked })}
                className="w-5 h-5 accent-[#4C8DFF] rounded cursor-pointer shrink-0"
              />
            </label>
          </div>
        </section>
      )}

      {/* SECTION: Backup & Restore */}
      {shouldShowSection('backup') && (
        <section aria-label="Backup & Restore" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-sm font-bold text-ms-muted uppercase tracking-wider flex items-center gap-2">
                <Archive className="w-4 h-4 text-violet-400" />
                <span>Backup & Restore</span>
              </h2>
              <p className="text-xs text-ms-muted mt-0.5">
                Export and restore local library metadata, smart collections, playtime history, and preferences safely
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                100% Offline & DPAPI Protected
              </span>
            </div>
          </div>

          {/* Feedback banner */}
          {backupFeedback && (
            <div
              className={`p-4 rounded-xl text-xs flex items-center justify-between gap-3 ${
                backupFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
              }`}
            >
              <span>{backupFeedback.message}</span>
              <button
                type="button"
                onClick={clearBackupFeedback}
                className="text-ms-muted hover:text-ms-text"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Create Backup Card */}
            <div className="p-6 rounded-2xl bg-ms-card border border-ms-border space-y-4 shadow-sm flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-ms-text flex items-center gap-2">
                    <Archive className="w-4 h-4 text-violet-400" />
                    <span>Create Archive Backup</span>
                  </h3>
                  <span className="text-xs text-ms-muted tabular-nums">
                    {backupInfo?.backupsCount ?? 0} archives saved
                  </span>
                </div>
                <p className="text-xs text-ms-muted">
                  Exports your library games, smart collections, tracking exclusions, playtime sessions, and UI settings into an integrity-hashed JSON archive.
                </p>
                <div className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
                  <strong>Security Guarantee:</strong> Passwords, DPAPI vault keys, and authentication tokens are strictly excluded from backups.
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="text-xs text-ms-muted">
                  Last backup:{' '}
                  <strong className="text-ms-text">
                    {backupInfo?.lastBackupIso
                      ? new Date(backupInfo.lastBackupIso).toLocaleString()
                      : 'Never'}
                  </strong>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="create-backup-btn"
                    disabled={backupLoading}
                    onClick={() => void createBackup()}
                    className="flex-1 py-2 px-3.5 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white shadow-md transition-all text-center"
                  >
                    {backupLoading ? 'Creating...' : 'Create Backup'}
                  </button>

                  <button
                    type="button"
                    data-testid="choose-backup-dest-btn"
                    disabled={backupLoading}
                    onClick={() => void handleCreateBackupWithDialog()}
                    className="py-2 px-3 rounded-xl text-xs font-semibold bg-ms-elevated hover:bg-ms-border text-ms-text border border-ms-border transition-colors"
                    title="Choose custom destination folder"
                  >
                    Custom Destination...
                  </button>
                </div>
              </div>
            </div>

            {/* Restore Backup Card */}
            <div className="p-6 rounded-2xl bg-ms-card border border-ms-border space-y-4 shadow-sm flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-ms-text flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-cyan-400" />
                    <span>Restore From Archive</span>
                  </h3>
                  <span className="text-[10px] uppercase font-bold text-cyan-400">
                    Safe Snapshot
                  </span>
                </div>
                <p className="text-xs text-ms-muted">
                  Select a valid `.json` backup file. A safe pre-restore snapshot is automatically taken before restoring records.
                </p>
              </div>

              {/* Selected File Preview */}
              {selectedBackupPath ? (
                <div className="p-3.5 rounded-xl bg-ms-elevated/40 border border-ms-border space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ms-text truncate max-w-[200px]">
                      {selectedBackupPath.split(/[/\\]/).pop()}
                    </span>
                    {backupValidation?.valid ? (
                      <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Checksum Valid
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-rose-400">
                        {backupValidation?.error ?? 'Invalid archive'}
                      </span>
                    )}
                  </div>

                  {backupValidation?.manifest && (
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-ms-muted pt-1">
                      <div>Games: <strong className="text-ms-text">{backupValidation.manifest.counts.games}</strong></div>
                      <div>Sessions: <strong className="text-ms-text">{backupValidation.manifest.counts.sessions}</strong></div>
                      <div>Collections: <strong className="text-ms-text">{backupValidation.manifest.counts.collections}</strong></div>
                      <div>Exclusions: <strong className="text-ms-text">{backupValidation.manifest.counts.exclusions}</strong></div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-ms-border text-center text-xs text-ms-muted">
                  No backup archive currently selected.
                </div>
              )}

              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="select-backup-file-btn"
                    onClick={() => void handleSelectBackupFile()}
                    className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold bg-ms-elevated hover:bg-ms-border text-ms-text border border-ms-border transition-colors text-center"
                  >
                    Select Backup File...
                  </button>

                  {selectedBackupPath && backupValidation?.valid && (
                    <button
                      type="button"
                      data-testid="execute-restore-btn"
                      disabled={backupLoading}
                      onClick={() => setShowRestoreConfirm(true)}
                      className="py-2 px-4 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md transition-all"
                    >
                      Restore...
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Restore Confirmation Dialog */}
          {showRestoreConfirm && (
            <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
              <div className="w-full max-w-md bg-ms-card border border-ms-border rounded-2xl p-6 space-y-4 shadow-2xl">
                <div className="flex items-center gap-3 text-amber-400">
                  <AlertTriangle className="w-6 h-6 shrink-0" />
                  <h3 className="text-base font-bold text-ms-text">Confirm Data Restoration</h3>
                </div>

                <p className="text-xs text-ms-muted leading-relaxed">
                  Restoring will merge games, collections, and preferences from this backup. A safe pre-restore snapshot will be saved automatically beforehand.
                </p>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRestoreConfirm(false)}
                    className="px-3.5 py-2 text-xs font-semibold text-ms-muted hover:text-ms-text"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-testid="confirm-restore-btn"
                    onClick={() => void handleExecuteRestore()}
                    className="px-4 py-2 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl shadow-md"
                  >
                    Confirm & Restore
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* SECTION: About */}
      {shouldShowSection('about') && (
        <section aria-label="About MaSwitch" className="space-y-4">
          <h2 className="text-xs font-bold text-ms-muted uppercase tracking-wider px-1">
            About MaSwitch
          </h2>

          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ms-card via-[#161822] to-[#10121a] border border-ms-border/80 p-6 md:p-8 space-y-6 shadow-xl">
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              {/* Brand Identity */}
              <div className="flex items-center gap-5">
                <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-cyan-500/20 border border-violet-500/30 flex items-center justify-center p-2.5 shadow-[0_0_24px_rgba(139,92,246,0.2)] shrink-0">
                  <BrandMarkImg size={44} />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-black tracking-tight text-white">
                      MaSwitch
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30 text-violet-300">
                      v2.0 Lightweight
                    </span>
                  </div>
                  <p className="text-xs text-ms-muted mt-1 max-w-md">
                    Fast, privacy-focused gaming account manager & playtime tracker for Windows
                  </p>
                </div>
              </div>

              {/* System Specs */}
              {runtimeInfo && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-xl bg-ms-bg/60 border border-ms-border/50">
                    <div className="text-[10px] text-ms-muted uppercase font-bold">Electron</div>
                    <div className="font-semibold text-ms-text font-mono mt-0.5">
                      v{runtimeInfo.electronVersion}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-ms-bg/60 border border-ms-border/50">
                    <div className="text-[10px] text-ms-muted uppercase font-bold">Chromium</div>
                    <div className="font-semibold text-ms-text font-mono mt-0.5">
                      v{runtimeInfo.chromeVersion}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-ms-bg/60 border border-ms-border/50">
                    <div className="text-[10px] text-ms-muted uppercase font-bold">Node.js</div>
                    <div className="font-semibold text-ms-text font-mono mt-0.5">
                      v{runtimeInfo.nodeVersion}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-ms-bg/60 border border-ms-border/50">
                    <div className="text-[10px] text-ms-muted uppercase font-bold">Platform</div>
                    <div className="font-semibold text-ms-text font-mono mt-0.5">
                      {runtimeInfo.platform}-{runtimeInfo.arch}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Advanced Memory Mode Confirmation Warning Modal */}
      {showAdvancedWarningModal && (
        <div
          data-testid="advanced-mode-warning-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
        >
          <div className="w-full max-w-md rounded-3xl bg-ms-card border border-rose-500/40 p-6 space-y-4 shadow-2xl animate-scaleUp">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ms-text">Enable Advanced Memory Mode?</h3>
                <p className="text-xs text-ms-muted">Performance trade-offs & technical explanation</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-ms-elevated/40 border border-ms-border space-y-2 text-xs text-ms-muted">
              <p>
                Advanced Mode uses the documented Windows Psapi <code className="font-mono text-violet-300">EmptyWorkingSet</code> API to trim memory pages across permitted desktop processes.
              </p>
              <div className="space-y-1 text-[11px] text-amber-300">
                <div>• Trimming moves idle memory pages to the system paging file.</div>
                <div>• When trimmed applications are focused again, brief disk activity may occur.</div>
                <div>• Higher free RAM numbers do not equal guaranteed higher FPS in games.</div>
                <div>• System processes, security tools, and active games remain strictly protected.</div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowAdvancedWarningModal(false)}
                className="px-4 py-2 text-xs font-semibold text-ms-muted hover:text-ms-text bg-ms-card border border-ms-border rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="btn-confirm-enable-advanced-mode"
                onClick={() => {
                  void updateSettings({ enableAdvancedMemoryMode: true });
                  setShowAdvancedWarningModal(false);
                }}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-md transition-all"
              >
                I Understand & Enable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
