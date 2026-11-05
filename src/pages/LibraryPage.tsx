import React, { useMemo, useState } from 'react';
import {
  Search,
  LayoutGrid,
  List,
  ArrowUpDown,
  Star,
  RotateCcw,
  RefreshCw,
  Plus,
  Play,
  Loader2,
  Activity,
  Trash2,
  FolderOpen,
  XCircle,
  HardDrive,
  FolderSearch,
  Copy,
  Check,
  Clock,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import type {
  InstallStatusFilter,
  LibrarySortField,
} from '../shared/types/game';
import type { PlatformId } from '../shared/types/platform';
import { useAppStore } from '../store/useAppStore';
import { filterAndSortGames } from '../services/libraryFilterService';
import { DemoNoticeBanner } from '../components/common/DemoNoticeBanner';
import { GameCoverCard } from '../components/common/GameCoverCard';
import { PlatformBadge } from '../components/common/PlatformBadge';
import { PlatformLogo } from '../components/platforms/PlatformLogo';
import { ScanDiagnosticsModal } from '../components/scanner/ScanDiagnosticsModal';
import { ScanningFeedbackBanner } from '../components/scanner/ScanningFeedbackBanner';
import { CollectionsManager } from '../components/collections/CollectionsManager';

const PLATFORM_FILTER_OPTIONS: ReadonlyArray<{
  id: 'all' | PlatformId;
  label: string;
}> = [
  { id: 'all', label: 'All Platforms' },
  { id: 'steam', label: 'Steam' },
  { id: 'epic', label: 'Epic Games' },
  { id: 'gog', label: 'GOG Galaxy' },
  { id: 'ubisoft', label: 'Ubisoft Connect' },
  { id: 'riot', label: 'Riot Games' },
  { id: 'ea', label: 'EA App' },
  { id: 'rockstar', label: 'Rockstar' },
  { id: 'custom', label: 'Custom' },
];

const INSTALL_FILTER_OPTIONS: ReadonlyArray<{
  id: InstallStatusFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'installed', label: 'Installed' },
  { id: 'uninstalled', label: 'Not installed' },
];

const SORT_OPTIONS: ReadonlyArray<{
  id: LibrarySortField;
  label: string;
}> = [
  { id: 'playtimeHours', label: 'Playtime' },
  { id: 'lastPlayed', label: 'Last played' },
  { id: 'title', label: 'Title' },
  { id: 'rating', label: 'Rating' },
  { id: 'releaseYear', label: 'Release year' },
];

export const LibraryPage: React.FC = () => {
  const games = useAppStore((s) => s.games);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const platformFilter = useAppStore((s) => s.platformFilter);
  const installFilter = useAppStore((s) => s.installFilter);
  const favoritesOnly = useAppStore((s) => s.favoritesOnly);
  const sortBy = useAppStore((s) => s.sortBy);
  const sortDirection = useAppStore((s) => s.sortDirection);
  const viewMode = useAppStore((s) => s.viewMode);
  const inspectedLibraryGameId = useAppStore((s) => s.inspectedLibraryGameId);
  const settings = useAppStore((s) => s.settings);
  const isScanning = useAppStore((s) => s.isScanning);
  const scanProgress = useAppStore((s) => s.scanProgress);
  const lastScanSummary = useAppStore((s) => s.lastScanSummary);
  const launchStatuses = useAppStore((s) => s.launchStatuses);
  const launchMessages = useAppStore((s) => s.launchMessages);
  const launchDiagnostics = useAppStore((s) => s.launchDiagnostics);

  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [librarySubView, setLibrarySubView] = useState<'games' | 'collections'>('games');
  const loadCollections = useAppStore((s) => s.loadCollections);
  const featuresManifest = useAppStore((s) => s.featuresManifest);
  const isCollectionsEnabled = featuresManifest
    ? Boolean(featuresManifest.features.smartCollections?.enabled)
    : true;

  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const setPlatformFilter = useAppStore((s) => s.setPlatformFilter);
  const setInstallFilter = useAppStore((s) => s.setInstallFilter);
  const setFavoritesOnly = useAppStore((s) => s.setFavoritesOnly);
  const setSortBy = useAppStore((s) => s.setSortBy);
  const toggleSortDirection = useAppStore((s) => s.toggleSortDirection);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const resetLibraryFilters = useAppStore((s) => s.resetLibraryFilters);
  const setInspectedLibraryGameId = useAppStore(
    (s) => s.setInspectedLibraryGameId
  );
  const openGameDetails = useAppStore((s) => s.openGameDetails);
  const toggleFavoriteGame = useAppStore((s) => s.toggleFavoriteGame);
  const triggerGameScan = useAppStore((s) => s.startGameScan);
  const cancelGameScan = useAppStore((s) => s.cancelGameScan);
  const addCustomGame = useAppStore((s) => s.addCustomGame);
  const removeGameFromLibrary = useAppStore((s) => s.removeGameFromLibrary);
  const launchGameById = useAppStore((s) => s.launchGame);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customExePath, setCustomExePath] = useState('');
  const [customWorkingDir, setCustomWorkingDir] = useState('');
  const [customLaunchArgs, setCustomLaunchArgs] = useState('');
  const [customCoverUrl, setCustomCoverUrl] = useState('');
  const [customClassification, setCustomClassification] =
    useState<'verified-game' | 'custom-app'>('verified-game');
  const [customFormError, setCustomFormError] = useState<string | null>(null);

  const handleBrowseExecutable = async () => {
    const picked = await window.maswitch?.library?.selectExecutableDialog();
    if (picked) {
      setCustomExePath(picked);
      if (!customTitle.trim()) {
        const baseName =
          picked
            .split(/[/\\]/)
            .pop()
            ?.replace(/\.(exe|bat|cmd|lnk)$/i, '') ?? '';
        if (baseName) {
          setCustomTitle(baseName);
        }
      }
    }
  };

  const handleBrowseWorkingDir = async () => {
    const picked = await window.maswitch?.library?.selectFolderDialog();
    if (picked) {
      setCustomWorkingDir(picked);
    }
  };

  const handleAddCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomFormError(null);
    if (!customTitle.trim()) {
      setCustomFormError('Enter a game title.');
      return;
    }
    if (!customExePath.trim()) {
      setCustomFormError('Select an executable (.exe) path.');
      return;
    }

    const added = await addCustomGame({
      title: customTitle.trim(),
      executablePath: customExePath.trim(),
      workingDirectory: customWorkingDir.trim() || undefined,
      launchArgs: customLaunchArgs.trim() || undefined,
      coverImage: customCoverUrl.trim() || undefined,
      classification: customClassification,
    });

    if (!added) {
      setCustomFormError(
        'Could not add executable. Verify that the file path exists.'
      );
      return;
    }

    setCustomTitle('');
    setCustomExePath('');
    setCustomWorkingDir('');
    setCustomLaunchArgs('');
    setCustomCoverUrl('');
    setShowAddCustomModal(false);
  };

  const filteredGames = useMemo(
    () =>
      filterAndSortGames(games, {
        searchQuery,
        platformFilter,
        installFilter,
        favoritesOnly,
        favoriteGameIds: settings.favoriteGameIds,
        sortBy,
        sortDirection,
      }),
    [
      games,
      searchQuery,
      platformFilter,
      installFilter,
      favoritesOnly,
      settings.favoriteGameIds,
      sortBy,
      sortDirection,
    ]
  );

  const inspectedGame =
    filteredGames.find((g) => g.id === inspectedLibraryGameId) ??
    filteredGames[0] ??
    games.find((g) => g.id === inspectedLibraryGameId) ??
    games[0];

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    platformFilter !== 'all' ||
    installFilter !== 'all' ||
    favoritesOnly;

  const inspectedLaunchState = inspectedGame
    ? launchStatuses[inspectedGame.id] ?? 'idle'
    : 'idle';
  const inspectedLaunchMessage = inspectedGame
    ? launchMessages[inspectedGame.id]
    : undefined;

  return (
    <div data-testid="page-library" className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* Spacious Gaming Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ms-border/80 pb-5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-ms-text tracking-tight">
            Library
          </h1>
          <span
            data-testid="library-results-count"
            className="text-sm text-ms-muted tabular-nums"
          >
            Showing <strong className="font-semibold text-ms-text">{filteredGames.length}</strong> of{' '}
            {games.length} titles
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isScanning ? (
            <button
              type="button"
              data-testid="library-cancel-scan-btn"
              onClick={() => void cancelGameScan()}
              className="h-10 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-sm font-semibold inline-flex items-center gap-2 transition-colors shadow-sm"
            >
              <XCircle className="w-4 h-4" />
              <span>Cancel scan ({scanProgress?.percent ?? 0}%)</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="library-rescan-btn"
              onClick={() => void triggerGameScan()}
              className="h-10 px-4 rounded-xl bg-gradient-to-r from-violet-600/20 via-violet-600/10 to-cyan-500/10 hover:from-violet-600/30 hover:to-cyan-500/20 border border-violet-500/40 text-violet-200 hover:text-white text-sm font-semibold inline-flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(139,92,246,0.15)] active:scale-95"
            >
              <RefreshCw className="w-4 h-4 text-violet-300" />
              <span>Scan games</span>
            </button>
          )}

          <button
            type="button"
            data-testid="library-view-diagnostics-btn"
            onClick={() => setShowDiagnostics(true)}
            className="h-10 px-3.5 rounded-xl bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-text text-sm font-medium inline-flex items-center gap-2 transition-all shadow-sm active:scale-95"
            title="View system & scanner diagnostics"
          >
            <FolderSearch className="w-4 h-4 text-cyan-400" />
            <span>Diagnostics</span>
          </button>

          <button
            type="button"
            data-testid="open-add-custom-game-btn"
            onClick={() => setShowAddCustomModal((v) => !v)}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500 text-white text-sm font-bold inline-flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add game</span>
          </button>

          <button
            type="button"
            data-testid="library-demo-mode-btn"
            onClick={() =>
              void updateSettings({
                demoModeEnabled: !settings.demoModeEnabled,
              })
            }
            className={`h-10 px-3.5 rounded-xl border text-xs font-semibold transition-all ${
              settings.demoModeEnabled
                ? 'bg-violet-500/15 border-violet-500/40 text-violet-300'
                : 'bg-ms-card/80 border-ms-border/70 text-ms-muted hover:text-ms-text'
            }`}
          >
            {settings.demoModeEnabled ? 'Demo: On' : 'Demo: Off'}
          </button>
        </div>
      </div>

      {/* Sub-view switcher: All Games vs Smart Collections */}
      {isCollectionsEnabled && (
        <div className="flex items-center gap-2 border-b border-ms-border/40 pb-2">
          <button
            type="button"
            data-testid="library-tab-games"
            onClick={() => setLibrarySubView('games')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              librarySubView === 'games'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-ms-muted hover:text-ms-text hover:bg-ms-card'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>All Games ({games.length})</span>
          </button>
          <button
            type="button"
            data-testid="library-tab-collections"
            onClick={() => {
              setLibrarySubView('collections');
              void loadCollections();
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              librarySubView === 'collections'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-ms-muted hover:text-ms-text hover:bg-ms-card'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Collections</span>
          </button>
        </div>
      )}

      {isCollectionsEnabled && librarySubView === 'collections' ? (
        <CollectionsManager />
      ) : (
        <>
          {/* Real-time Scanning Activity / Error / Completion Feedback */}
      <ScanningFeedbackBanner
        onOpenDiagnostics={() => setShowDiagnostics(true)}
      />

      {/* Add Custom Game Drawer */}
      {showAddCustomModal && (
        <form
          data-testid="add-custom-game-form"
          onSubmit={(e) => void handleAddCustomSubmit(e)}
          className="rounded-2xl bg-ms-card border border-ms-border p-6 space-y-5 shadow-card"
        >
          <div className="flex items-center justify-between border-b border-ms-border pb-3">
            <h2 className="text-base font-bold text-ms-text">
              Add Custom Windows Game or Executable
            </h2>
            <button
              type="button"
              onClick={() => setShowAddCustomModal(false)}
              className="text-xs text-ms-muted hover:text-ms-text font-medium"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ms-muted uppercase tracking-wider block">Title</label>
              <input
                type="text"
                data-testid="custom-game-title-input"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g. Hades II"
                className="w-full h-10 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-lg px-3 text-sm text-ms-text focus:outline-none transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ms-muted uppercase tracking-wider block">
                Executable Path (.exe)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  data-testid="custom-game-exe-input"
                  value={customExePath}
                  onChange={(e) => setCustomExePath(e.target.value)}
                  placeholder="C:\Games\HadesII\Ship\Hades2.exe"
                  className="flex-1 h-10 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-lg px-3 text-sm text-ms-text font-mono focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleBrowseExecutable()}
                  className="h-10 px-4 rounded-lg bg-ms-elevated hover:bg-ms-border border border-ms-border text-sm text-ms-text font-medium inline-flex items-center gap-2 shrink-0"
                >
                  <FolderOpen className="w-4 h-4 text-ms-muted" />
                  <span>Browse</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ms-muted uppercase tracking-wider block">
                Working directory (optional)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  data-testid="custom-game-workdir-input"
                  value={customWorkingDir}
                  onChange={(e) => setCustomWorkingDir(e.target.value)}
                  placeholder="Defaults to executable folder"
                  className="flex-1 h-10 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-lg px-3 text-sm text-ms-text font-mono focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleBrowseWorkingDir()}
                  className="h-10 px-4 rounded-lg bg-ms-elevated hover:bg-ms-border border border-ms-border text-sm text-ms-text font-medium inline-flex items-center gap-2 shrink-0"
                >
                  <FolderOpen className="w-4 h-4 text-ms-muted" />
                  <span>Folder</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ms-muted uppercase tracking-wider block">
                Launch arguments (optional)
              </label>
              <input
                type="text"
                data-testid="custom-game-args-input"
                value={customLaunchArgs}
                onChange={(e) => setCustomLaunchArgs(e.target.value)}
                placeholder="-novid -dx12"
                className="w-full h-10 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-lg px-3 text-sm text-ms-text font-mono focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ms-muted uppercase tracking-wider block">
                Cover image URL (optional)
              </label>
              <input
                type="text"
                data-testid="custom-game-cover-input"
                value={customCoverUrl}
                onChange={(e) => setCustomCoverUrl(e.target.value)}
                placeholder="Leave blank for automatic cartridge artwork"
                className="w-full h-10 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-lg px-3 text-sm text-ms-text focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ms-muted uppercase tracking-wider block">Type</label>
              <select
                data-testid="custom-game-classification-select"
                value={customClassification}
                onChange={(e) =>
                  setCustomClassification(
                    e.target.value as 'verified-game' | 'custom-app'
                  )
                }
                className="w-full h-10 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-lg px-3 text-sm text-ms-text focus:outline-none"
              >
                <option value="verified-game">PC Game</option>
                <option value="custom-app">Desktop Application</option>
              </select>
            </div>
          </div>

          {customFormError && (
            <p
              data-testid="custom-game-form-error"
              className="text-xs text-rose-400 font-medium"
            >
              {customFormError}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowAddCustomModal(false)}
              className="h-10 px-4 rounded-lg bg-ms-bg border border-ms-border text-sm text-ms-muted hover:text-ms-text font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="submit-custom-game-btn"
              className="h-10 px-5 rounded-lg bg-ms-accent hover:bg-ms-accentHover text-white font-semibold text-sm transition-colors shadow-md"
            >
              Add to Library
            </button>
          </div>
        </form>
      )}

      {settings.demoModeEnabled && (
        <DemoNoticeBanner
          title="Demo library preview"
          description="Browsing sample games. Turn off Demo mode to view your real locally installed library."
        />
      )}

      {/* Filter & Search Toolbar */}
      <div className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="w-4 h-4 text-ms-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              data-testid="library-search-input"
              aria-label="Search library games"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, developer, or genre..."
              className="w-full h-10 bg-ms-card border border-ms-border focus:border-ms-accent rounded-lg pl-9 pr-8 text-sm text-ms-text placeholder:text-ms-muted focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear library search"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ms-muted hover:text-ms-text text-sm"
              >
                ×
              </button>
            )}
          </div>

          {/* Right Controls: Favorites, Install Status, Sort, View Mode */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              data-testid="library-favorites-filter-btn"
              onClick={() => setFavoritesOnly(!favoritesOnly)}
              className={`h-10 px-3.5 rounded-lg border text-sm font-medium inline-flex items-center gap-2 transition-colors ${
                favoritesOnly
                  ? 'bg-amber-400/15 border-amber-400/40 text-amber-400 font-semibold'
                  : 'bg-ms-card border-ms-border text-ms-muted hover:text-ms-text'
              }`}
            >
              <Star
                className={`w-4 h-4 ${
                  favoritesOnly ? 'fill-amber-400 text-amber-400' : ''
                }`}
              />
              <span>Favorites</span>
            </button>

            {/* Install Status Segmented Control */}
            <div className="inline-flex h-10 rounded-lg bg-ms-card border border-ms-border p-1">
              {INSTALL_FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`install-filter-${opt.id}`}
                  onClick={() => setInstallFilter(opt.id)}
                  className={`px-3 rounded-md text-xs font-semibold transition-colors ${
                    installFilter === opt.id
                      ? 'bg-ms-elevated text-ms-text shadow-sm'
                      : 'text-ms-muted hover:text-ms-text'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Sort Select & Direction */}
            <div className="flex items-center gap-1.5">
              <select
                aria-label="Sort games by"
                data-testid="library-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as LibrarySortField)}
                className="h-10 bg-ms-card border border-ms-border rounded-lg px-3 text-sm text-ms-text font-medium focus:outline-none focus:border-ms-accent"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    Sort: {opt.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                data-testid="library-sort-dir-btn"
                aria-label={`Sort direction ${
                  sortDirection === 'asc' ? 'Ascending' : 'Descending'
                }`}
                onClick={toggleSortDirection}
                className="h-10 w-10 rounded-lg bg-ms-card border border-ms-border flex items-center justify-center text-ms-muted hover:text-ms-text transition-colors"
                title={`Sort order: ${
                  sortDirection === 'asc' ? 'Ascending' : 'Descending'
                }`}
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
            </div>

            {/* Grid / List View Switcher */}
            <div
              role="group"
              aria-label="View mode switcher"
              className="inline-flex h-10 rounded-lg bg-ms-card border border-ms-border p-1"
            >
              <button
                type="button"
                data-testid="view-mode-grid"
                aria-label="Grid view"
                onClick={() => setViewMode('grid')}
                className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-ms-elevated text-ms-text shadow-sm'
                    : 'text-ms-muted hover:text-ms-text'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                data-testid="view-mode-list"
                aria-label="List view"
                onClick={() => setViewMode('list')}
                className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                  viewMode === 'list'
                    ? 'bg-ms-elevated text-ms-text shadow-sm'
                    : 'text-ms-muted hover:text-ms-text'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Platform Filter Bar with Authentic Official Logos */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {PLATFORM_FILTER_OPTIONS.map((platform) => {
              const active = platformFilter === platform.id;
              return (
                <button
                  key={platform.id}
                  type="button"
                  data-testid={`platform-filter-${platform.id}`}
                  onClick={() => setPlatformFilter(platform.id)}
                  className={`h-9 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-2.5 transition-all select-none ${
                    active
                      ? 'bg-gradient-to-r from-violet-600/30 to-fuchsia-600/30 border border-violet-500/70 text-white shadow-[0_0_16px_rgba(168,85,247,0.3)] ring-1 ring-violet-500/40'
                      : 'bg-ms-card/85 hover:bg-ms-elevated border border-ms-border/70 text-ms-muted hover:text-white hover:border-ms-border'
                  }`}
                >
                  {platform.id !== 'all' ? (
                    <PlatformLogo
                      platformId={platform.id}
                      size={18}
                      colorMode="brand"
                    />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-violet-400" />
                  )}
                  <span>{platform.label}</span>
                </button>
              );
            })}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              data-testid="reset-filters-btn"
              onClick={resetLibraryFilters}
              className="text-xs font-medium text-ms-muted hover:text-ms-text inline-flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area: Responsive Grid / List View + Sticky Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-7 items-start">
        <div className="xl:col-span-8">
          {filteredGames.length === 0 ? (
            <div
              data-testid="library-empty-state"
              className="rounded-2xl bg-ms-card border border-ms-border p-12 text-center space-y-4 shadow-card"
            >
              <div className="w-12 h-12 rounded-xl bg-ms-elevated border border-ms-border flex items-center justify-center text-ms-muted mx-auto">
                <HardDrive className="w-6 h-6" />
              </div>
              <p className="text-base font-bold text-ms-text">
                {games.length === 0
                  ? 'No games in your library'
                  : 'No games match your current filters'}
              </p>
              <p className="text-sm text-ms-muted max-w-md mx-auto leading-relaxed">
                {games.length === 0
                  ? 'Scan your drives for installed games or add a local Windows executable manually.'
                  : 'Try clearing your search query or resetting the platform and installation filters.'}
              </p>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={resetLibraryFilters}
                  className="h-10 px-4 rounded-lg bg-ms-elevated hover:bg-ms-border border border-ms-border text-ms-text font-semibold text-sm transition-colors"
                >
                  Reset filters
                </button>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => void triggerGameScan()}
                    className="h-10 px-5 rounded-lg bg-ms-accent hover:bg-ms-accentHover text-white font-semibold text-sm transition-colors shadow-lg"
                  >
                    Scan installed games
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddCustomModal(true)}
                    className="h-10 px-4 rounded-lg bg-ms-elevated hover:bg-ms-border border border-ms-border text-ms-text font-semibold text-sm transition-colors"
                  >
                    Add executable
                  </button>
                </div>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div
              data-testid="library-grid-container"
              className={`grid gap-5 ${
                settings.compactGameCards
                  ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
                  : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
              }`}
            >
              {filteredGames.map((game) => (
                <GameCoverCard
                  key={game.id}
                  game={game}
                  isFavorite={settings.favoriteGameIds.includes(game.id)}
                  isSelected={inspectedGame?.id === game.id}
                  compact={settings.compactGameCards}
                  launchState={launchStatuses[game.id] ?? 'idle'}
                  onSelect={setInspectedLibraryGameId}
                  onOpenDetails={openGameDetails}
                  onToggleFavorite={(id) => void toggleFavoriteGame(id)}
                  onLaunchGame={(id) => void launchGameById(id)}
                />
              ))}
            </div>
          ) : (
            <div
              data-testid="library-list-container"
              className="rounded-2xl bg-ms-card border border-ms-border divide-y divide-ms-border overflow-hidden shadow-card"
            >
              {filteredGames.map((game) => {
                const isFav = settings.favoriteGameIds.includes(game.id);
                const isSelected = inspectedGame?.id === game.id;

                return (
                  <div
                    key={game.id}
                    data-testid={`game-list-row-${game.id}`}
                    onClick={() => setInspectedLibraryGameId(game.id)}
                    onDoubleClick={() => openGameDetails(game.id)}
                    className={`px-4 py-3.5 flex items-center justify-between gap-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-ms-elevated' : 'hover:bg-ms-elevated/50'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {game.iconImage ? (
                        <img
                          src={game.iconImage}
                          alt=""
                          className="w-9 h-9 rounded object-contain shrink-0"
                        />
                      ) : (
                        <img
                          src={game.coverImage}
                          alt={game.title}
                          className="w-9 h-12 rounded object-cover shrink-0 border border-ms-border bg-ms-bg"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-ms-text truncate tracking-tight">
                            {game.title}
                          </h3>
                          {game.isInstalled && (
                            <span
                              title="Installed"
                              className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-ms-muted mt-1">
                          <PlatformBadge
                            platformId={game.platformId}
                            size="xs"
                          />
                          <span>•</span>
                          <span className="tabular-nums font-medium">
                            {game.playtimeHours.toFixed(1)}h
                          </span>
                          <span>•</span>
                          <span className="truncate">
                            {game.lastPlayedLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        aria-label={
                          isFav
                            ? `Remove ${game.title} from favorites`
                            : `Add ${game.title} to favorites`
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleFavoriteGame(game.id);
                        }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-ms-muted hover:text-ms-text hover:bg-ms-bg transition-colors"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            isFav ? 'fill-amber-400 text-amber-400' : ''
                          }`}
                        />
                      </button>

                      {game.isInstalled && !game.isDemoData && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void launchGameById(game.id);
                          }}
                          className="h-8 px-3 rounded-md bg-ms-accent hover:bg-ms-accentHover text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Play</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openGameDetails(game.id);
                        }}
                        className="h-8 px-3 rounded-md bg-ms-elevated hover:bg-ms-border border border-ms-border text-ms-text text-xs font-medium transition-colors"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Spacious Inspector Panel */}
        {inspectedGame && (
          <aside
            data-testid="library-details-panel"
            aria-label="Game Details Inspector Panel"
            className="xl:col-span-4 rounded-2xl bg-ms-card border border-ms-border overflow-hidden sticky top-4 shadow-card"
          >
            {/* Cinematic Hero Artwork Header */}
            <div className="relative h-48 bg-ms-bg border-b border-ms-border overflow-hidden">
              <img
                src={inspectedGame.heroBackgroundImage || inspectedGame.coverImage}
                alt={inspectedGame.title}
                className="w-full h-full object-cover opacity-60 transition-transform duration-500 hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ms-card via-ms-card/40 to-black/30" />

              {/* Top Pill Badges */}
              <div className="absolute top-3.5 left-4 right-4 flex items-center justify-between gap-2 pointer-events-none">
                <PlatformBadge
                  platformId={inspectedGame.platformId}
                  size="xs"
                />
                {inspectedGame.isInstalled && (
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-950/85 border border-emerald-500/40 text-emerald-400 backdrop-blur-md inline-flex items-center gap-1.5 shadow-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Installed</span>
                  </span>
                )}
              </div>

              {/* Bottom Title & Developer Info */}
              <div className="absolute bottom-3.5 left-4 right-4">
                <h2 className="text-xl font-black text-white tracking-tight drop-shadow-md truncate">
                  {inspectedGame.title}
                </h2>
                <p className="text-xs text-white/75 truncate mt-0.5 font-medium">
                  {inspectedGame.developer}
                </p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Primary Launch & Details Action Row */}
              <div className="flex items-center gap-2.5">
                {!inspectedGame.isDemoData && inspectedGame.isInstalled ? (
                  <button
                    type="button"
                    data-testid="panel-launch-game-btn"
                    disabled={inspectedLaunchState === 'launching'}
                    onClick={() => void launchGameById(inspectedGame.id)}
                    className="flex-1 h-11 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-60 text-white font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.35)]"
                  >
                    {inspectedLaunchState === 'launching' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Launching...</span>
                      </>
                    ) : inspectedLaunchState === 'running' ? (
                      <>
                        <Activity className="w-4 h-4 text-emerald-200" />
                        <span>Running</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>Play</span>
                      </>
                    )}
                  </button>
                ) : null}

                <button
                  type="button"
                  data-testid="panel-open-details-btn"
                  onClick={() => openGameDetails(inspectedGame.id)}
                  className="flex-1 h-11 px-4 rounded-xl bg-ms-elevated hover:bg-ms-border/80 border border-ms-border text-ms-text font-semibold text-sm transition-all flex items-center justify-center"
                >
                  Full Details
                </button>
              </div>

              {inspectedLaunchMessage && (
                <p
                  data-testid="panel-launch-message"
                  className={`text-xs font-medium ${
                    inspectedLaunchState === 'failed'
                      ? 'text-rose-400'
                      : inspectedLaunchState === 'running'
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                  }`}
                >
                  {inspectedLaunchMessage}
                </p>
              )}

              {inspectedLaunchState === 'failed' &&
                launchDiagnostics[inspectedGame.id] && (
                  <div
                    data-testid="panel-launch-diagnostics"
                    className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs space-y-1"
                  >
                    <div className="font-semibold text-rose-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                      <span>Launch Troubleshooting</span>
                    </div>
                    <p className="text-ms-muted text-[11px] leading-relaxed">
                      {launchDiagnostics[inspectedGame.id].troubleshootingAdvice}
                    </p>
                  </div>
                )}

              {inspectedGame.shortDescription && (
                <p className="text-xs text-ms-muted leading-relaxed line-clamp-2">
                  {inspectedGame.shortDescription}
                </p>
              )}

              {/* Stats 2x2 Metric Grid */}
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-ms-bg/80 border border-ms-border/60 flex flex-col gap-1">
                  <dt className="text-[11px] font-medium text-ms-muted flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-violet-400" />
                    <span>Status</span>
                  </dt>
                  <dd className="text-ms-text font-semibold truncate flex items-center gap-1.5">
                    {inspectedGame.isInstalled ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>Installed</span>
                      </>
                    ) : (
                      <span>Not installed</span>
                    )}
                  </dd>
                </div>

                <div className="p-2.5 rounded-xl bg-ms-bg/80 border border-ms-border/60 flex flex-col gap-1">
                  <dt className="text-[11px] font-medium text-ms-muted flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Playtime</span>
                  </dt>
                  <dd className="text-ms-text tabular-nums font-semibold truncate">
                    {inspectedGame.playtimeHours.toFixed(1)} hrs
                  </dd>
                </div>

                <div className="p-2.5 rounded-xl bg-ms-bg/80 border border-ms-border/60 flex flex-col gap-1">
                  <dt className="text-[11px] font-medium text-ms-muted flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-fuchsia-400" />
                    <span>Last played</span>
                  </dt>
                  <dd className="text-ms-text truncate font-semibold">
                    {inspectedGame.lastPlayedLabel}
                  </dd>
                </div>

                <div className="p-2.5 rounded-xl bg-ms-bg/80 border border-ms-border/60 flex flex-col gap-1">
                  <dt className="text-[11px] font-medium text-ms-muted flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                    <span>Disk size</span>
                  </dt>
                  <dd className="text-ms-text tabular-nums font-semibold truncate">
                    {inspectedGame.ownership.installSizeGb > 0
                      ? `${inspectedGame.ownership.installSizeGb} GB`
                      : 'N/A'}
                  </dd>
                </div>
              </dl>

              {/* Install Path */}
              {inspectedGame.installPath && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-ms-muted uppercase tracking-wider">
                    <span>Install path</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (inspectedGame.installPath) {
                          void navigator.clipboard?.writeText(inspectedGame.installPath);
                          setCopiedPath(true);
                          setTimeout(() => setCopiedPath(false), 2000);
                        }
                      }}
                      className="text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 transition-colors"
                    >
                      {copiedPath ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy path</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-2.5 rounded-xl bg-ms-bg/90 border border-ms-border/70 text-[11px] font-mono text-ms-muted/90 truncate flex items-center gap-2">
                    <HardDrive className="w-3.5 h-3.5 text-ms-muted shrink-0" />
                    <span className="truncate flex-1 select-all">
                      {inspectedGame.installPath}
                    </span>
                  </div>
                </div>
              )}

              {!inspectedGame.isDemoData && (
                <div className="pt-1">
                  <button
                    type="button"
                    data-testid="panel-remove-game-btn"
                    onClick={() => void removeGameFromLibrary(inspectedGame.id)}
                    title="Removes this entry from MaSwitch library without deleting files on disk"
                    className="w-full h-9 px-3 rounded-xl bg-ms-bg hover:bg-rose-500/10 border border-ms-border hover:border-rose-500/30 text-rose-400 hover:text-rose-300 text-xs font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Remove from library</span>
                  </button>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
      </>
      )}

      {/* Diagnostics Modal */}
      <ScanDiagnosticsModal
        summary={lastScanSummary}
        isOpen={showDiagnostics}
        onClose={() => setShowDiagnostics(false)}
      />
    </div>
  );
};
