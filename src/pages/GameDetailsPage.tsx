import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Star,
  Lock,
  Play,
  Loader2,
  Activity,
  Trash2,
  Edit3,
  FolderOpen,
  FileCode,
  X,
  Check,
  Image,
  Search,
  Sparkles,
  RotateCcw,
  AlertTriangle,
  User,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { gameLauncherService } from '../services/gameLauncherService';
import { localDatabaseService } from '../services/localDatabaseService';
import { DemoNoticeBanner } from '../components/common/DemoNoticeBanner';
import { PlatformBadge } from '../components/common/PlatformBadge';
import { PlatformLogo } from '../components/platforms/PlatformLogo';
import type { PlatformId } from '../shared/types/platform';
import type { GameLaunchMethod } from '../shared/types/game';
import type {
  SteamGridDbArtworkBundle,
  SteamGridDbGame,
} from '../shared/types/steamgriddb';

export const GameDetailsPage: React.FC = () => {
  const games = useAppStore((s) => s.games);
  const selectedGameId = useAppStore((s) => s.selectedGameId);
  const closeGameDetails = useAppStore((s) => s.closeGameDetails);
  const settings = useAppStore((s) => s.settings);
  const toggleFavoriteGame = useAppStore((s) => s.toggleFavoriteGame);
  const launchStatuses = useAppStore((s) => s.launchStatuses);
  const launchMessages = useAppStore((s) => s.launchMessages);
  const launchDiagnostics = useAppStore((s) => s.launchDiagnostics);
  const launchGameById = useAppStore((s) => s.launchGame);
  const removeGameFromLibrary = useAppStore((s) => s.removeGameFromLibrary);
  const editGame = useAppStore((s) => s.editGame);
  const steamGridDbStatus = useAppStore((s) => s.steamGridDbStatus);
  const applyManualArtwork = useAppStore((s) => s.applyManualArtwork);
  const restoreDefaultArtwork = useAppStore((s) => s.restoreDefaultArtwork);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const trackerStatus = useAppStore((s) => s.trackerStatus);

  // Phase 6 Account Management Hooks
  const accountProfiles = useAppStore((s) => s.accountProfiles);
  const gameAccountAssociations = useAppStore((s) => s.gameAccountAssociations);
  const launcherStatuses = useAppStore((s) => s.launcherStatuses);
  const setGameAccountAssociation = useAppStore((s) => s.setGameAccountAssociation);
  const switchAccount = useAppStore((s) => s.switchAccount);

  const game = games.find((g) => g.id === selectedGameId) ?? games[0];
  const [activeScreenshotIndex, setActiveScreenshotIndex] = useState(0);

  // Associated account for this game
  const associatedAssociation = gameAccountAssociations.find((a) => a.gameId === game?.id);
  const associatedAccount = accountProfiles.find((p) => p.id === associatedAssociation?.accountId);
  const platformAccounts = accountProfiles.filter(
    (p) => game?.platformId === 'custom' || p.platformId === game?.platformId
  );

  // Launch advisory state
  const [showLaunchAdvisory, setShowLaunchAdvisory] = useState(false);

  const handleLaunchWithAccountCheck = () => {
    if (!game) return;
    const launcherStatus = launcherStatuses[game.platformId];
    if (
      associatedAccount &&
      launcherStatus?.isRunning &&
      launcherStatus.verifiedActiveAccountUsername &&
      launcherStatus.verifiedActiveAccountUsername.toLowerCase() !== associatedAccount.username.toLowerCase()
    ) {
      setShowLaunchAdvisory(true);
      return;
    }
    void launchGameById(game.id);
  };

  // Edit Game Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editPlatform, setEditPlatform] = useState<PlatformId>('custom');
  const [editExePath, setEditExePath] = useState('');
  const [editInstallPath, setEditInstallPath] = useState('');
  const [editLaunchMethod, setEditLaunchMethod] = useState<GameLaunchMethod>('auto');
  const [editExternalAppId, setEditExternalAppId] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Artwork Customization Modal State
  const [isArtworkModalOpen, setIsArtworkModalOpen] = useState(false);
  const [artworkSearchQuery, setArtworkSearchQuery] = useState('');
  const [artworkMatches, setArtworkMatches] = useState<SteamGridDbGame[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<SteamGridDbGame | null>(null);
  const [artworkBundle, setArtworkBundle] = useState<SteamGridDbArtworkBundle | null>(null);
  const [activeArtworkTab, setActiveArtworkTab] = useState<'grids' | 'heroes' | 'logos' | 'icons'>('grids');
  const [selectedGridUrl, setSelectedGridUrl] = useState<string | null>(null);
  const [selectedHeroUrl, setSelectedHeroUrl] = useState<string | null>(null);
  const [selectedLogoUrl, setSelectedLogoUrl] = useState<string | null>(null);
  const [selectedIconUrl, setSelectedIconUrl] = useState<string | null>(null);
  const [isLoadingArtwork, setIsLoadingArtwork] = useState(false);
  const [isSavingArtwork, setIsSavingArtwork] = useState(false);
  const [artworkModalError, setArtworkModalError] = useState<string | null>(null);

  const activeSession = trackerStatus.activeSessions.find(
    (sess) => sess.gameId === game?.id
  );
  const [liveDurationSeconds, setLiveDurationSeconds] = useState(0);

  useEffect(() => {
    if (!activeSession) {
      setLiveDurationSeconds(0);
      return;
    }

    const updateDuration = () => {
      const start = new Date(activeSession.startedAtIso).getTime();
      const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setLiveDurationSeconds(elapsed);
    };

    updateDuration();
    const interval = setInterval(updateDuration, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  if (!game) {
    return null;
  }

  const isFavorite = settings.favoriteGameIds.includes(game.id);
  const activeScreenshot =
    game.screenshots[activeScreenshotIndex] ?? game.screenshots[0];
  const launchSpec = gameLauncherService.getPlannedProtocolSpec(
    game.platformId
  );
  const launchState = launchStatuses[game.id] ?? 'idle';
  const launchMessage = launchMessages[game.id];
  const isOfflineLocalRecord = game.metadataAvailable === false;
  const isGameRunning = Boolean(activeSession) || launchState === 'running';
  const isLaunchActive = launchState === 'launching' || launchState === 'failed' || isGameRunning;
  const showLaunchMessage = Boolean(launchMessage && isLaunchActive);

  const formatLiveDuration = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const remainingSecs = secs % 60;
    if (hours > 0) {
      return `${hours}h ${minutes.toString().padStart(2, '0')}m ${remainingSecs.toString().padStart(2, '0')}s`;
    }
    return `${minutes}m ${remainingSecs.toString().padStart(2, '0')}s`;
  };

  const handleRemoveGame = async () => {
    const removed = await removeGameFromLibrary(game.id);
    if (removed) {
      closeGameDetails();
    }
  };

  const openEditModal = () => {
    setEditTitle(game.title);
    setEditPlatform(game.platformId);
    setEditExePath(game.executablePath ?? '');
    setEditInstallPath(game.installPath ?? '');
    setEditLaunchMethod(game.launchMethod ?? 'auto');
    setEditExternalAppId(game.externalAppId ?? '');
    setEditError(null);
    setIsEditModalOpen(true);
  };

  const handleBrowseExe = async () => {
    const picked = await window.maswitch?.library?.selectExecutableDialog();
    if (picked) {
      setEditExePath(picked);
    }
  };

  const handleBrowseFolder = async () => {
    const picked = await window.maswitch?.library?.selectFolderDialog();
    if (picked) {
      setEditInstallPath(picked);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) {
      setEditError('Game title cannot be empty.');
      return;
    }
    setIsSavingEdit(true);
    setEditError(null);
    try {
      const res = await editGame(game.id, {
        title: editTitle.trim(),
        platformId: editPlatform,
        executablePath: editExePath.trim() || undefined,
        installPath: editInstallPath.trim() || undefined,
        launchMethod: editLaunchMethod,
        externalAppId: editExternalAppId.trim() || undefined,
      });
      if (res) {
        setIsEditModalOpen(false);
      } else {
        setEditError('Failed to update game details.');
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error updating game');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const openArtworkModal = async () => {
    setArtworkSearchQuery(game.title);
    setSelectedGridUrl(game.userCoverOverride || game.coverImage);
    setSelectedHeroUrl(game.userHeroOverride || game.heroBackgroundImage);
    setSelectedLogoUrl(game.userLogoOverride || game.logoImage || null);
    setSelectedIconUrl(game.userIconOverride || game.iconImage || null);
    setArtworkModalError(null);
    setIsArtworkModalOpen(true);
    setActiveArtworkTab('grids');

    if (steamGridDbStatus.isConfigured) {
      setIsLoadingArtwork(true);
      try {
        if (game.sgdbGameId) {
          const bundle = await localDatabaseService.getSteamGridDbArtwork(
            game.sgdbGameId,
            game.title
          );
          setArtworkBundle(bundle);
          setSelectedMatch({ id: game.sgdbGameId, name: game.title, releaseDate: null });
        } else {
          const matches = await localDatabaseService.searchSteamGridDbGames(game.title);
          setArtworkMatches(matches);
          if (matches.length > 0) {
            const first = matches[0];
            setSelectedMatch(first);
            const bundle = await localDatabaseService.getSteamGridDbArtwork(
              first.id,
              first.name
            );
            setArtworkBundle(bundle);
          }
        }
      } catch {
        setArtworkModalError('Failed to fetch artwork from SteamGridDB.');
      } finally {
        setIsLoadingArtwork(false);
      }
    }
  };

  const handleSearchArtwork = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!artworkSearchQuery.trim()) return;
    setIsLoadingArtwork(true);
    setArtworkModalError(null);
    try {
      const matches = await localDatabaseService.searchSteamGridDbGames(artworkSearchQuery.trim());
      setArtworkMatches(matches);
      if (matches.length > 0) {
        const first = matches[0];
        setSelectedMatch(first);
        const bundle = await localDatabaseService.getSteamGridDbArtwork(first.id, first.name);
        setArtworkBundle(bundle);
      } else {
        setArtworkBundle(null);
        setSelectedMatch(null);
        setArtworkModalError(`No games found on SteamGridDB for "${artworkSearchQuery.trim()}".`);
      }
    } catch {
      setArtworkModalError('Error connecting to SteamGridDB.');
    } finally {
      setIsLoadingArtwork(false);
    }
  };

  const handleSelectGameMatch = async (match: SteamGridDbGame) => {
    setSelectedMatch(match);
    setIsLoadingArtwork(true);
    setArtworkModalError(null);
    try {
      const bundle = await localDatabaseService.getSteamGridDbArtwork(match.id, match.name);
      setArtworkBundle(bundle);
    } catch {
      setArtworkModalError('Failed to load artwork for selected game.');
    } finally {
      setIsLoadingArtwork(false);
    }
  };

  const handleSaveArtwork = async () => {
    setIsSavingArtwork(true);
    setArtworkModalError(null);
    try {
      await applyManualArtwork({
        gameId: game.id,
        sgdbGameId: selectedMatch?.id ?? game.sgdbGameId ?? undefined,
        coverUrl: selectedGridUrl ?? undefined,
        heroUrl: selectedHeroUrl ?? undefined,
        logoUrl: selectedLogoUrl ?? undefined,
        iconUrl: selectedIconUrl ?? undefined,
      });
      setIsArtworkModalOpen(false);
    } catch (err) {
      setArtworkModalError(err instanceof Error ? err.message : 'Failed to save artwork');
    } finally {
      setIsSavingArtwork(false);
    }
  };

  const handleRestoreDefaults = async () => {
    setIsSavingArtwork(true);
    setArtworkModalError(null);
    try {
      await restoreDefaultArtwork(game.id);
      setIsArtworkModalOpen(false);
    } catch (err) {
      setArtworkModalError(err instanceof Error ? err.message : 'Failed to restore default artwork');
    } finally {
      setIsSavingArtwork(false);
    }
  };

  return (
    <div
      data-testid="page-game-details"
      className="max-w-6xl mx-auto space-y-8 pb-16"
    >
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          data-testid="back-from-details-btn"
          onClick={closeGameDetails}
          className="h-10 px-4 rounded-lg bg-ms-card hover:bg-ms-elevated border border-ms-border text-sm font-semibold text-ms-text inline-flex items-center gap-2 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 text-ms-muted" />
          <span>Back to Library</span>
        </button>

        <span className="text-xs font-mono text-ms-muted uppercase tracking-wider bg-ms-card px-3 py-1.5 rounded-md border border-ms-border">
          {game.isDemoData ? 'Demo Catalog' : 'Local Windows Manifest'}
        </span>
      </div>

      {game.isDemoData && (
        <DemoNoticeBanner
          title={game.title}
          description="Sample game details entry for UI previewing."
        />
      )}

      {/* Cinematic Game Header Banner */}
      <section
        aria-label="Game header"
        className="rounded-2xl overflow-hidden bg-ms-card border border-ms-border shadow-card flex flex-col"
      >
        {/* Hero Background Banner */}
        <div className="relative h-64 sm:h-72 md:h-80 w-full bg-ms-bg overflow-hidden select-none">
          <img
            src={game.heroBackgroundImage}
            alt={`${game.title} banner`}
            className="w-full h-full object-cover opacity-45 scale-105 transition-transform duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ms-card via-ms-card/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-ms-card/80 via-transparent to-transparent hidden md:block" />
        </div>

        {/* Content Container Below/Over Banner */}
        <div className="relative px-6 sm:px-8 pb-8 -mt-24 sm:-mt-28 md:-mt-32 flex flex-col md:flex-row items-start gap-6 md:gap-8 z-10">
          {/* Vertical Game Cover (Left Column) */}
          <div className="w-36 sm:w-44 md:w-52 aspect-[2/3] rounded-2xl overflow-hidden border-2 border-ms-border/80 bg-ms-card shrink-0 shadow-2xl relative group">
            <img
              src={game.coverImage}
              alt={game.title}
              className="w-full h-full object-cover"
            />
            {isGameRunning && (
              <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                <span>Active</span>
              </div>
            )}
          </div>

          {/* Game Title, Metadata & Actions (Right Column) */}
          <div className="flex-1 min-w-0 space-y-4 w-full pt-1 md:pt-4">
            {/* Metadata Tags Bar */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <PlatformBadge platformId={game.platformId} size="sm" />

              {/* Status Badge */}
              {isGameRunning ? (
                <span
                  data-testid="status-badge-running"
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Running</span>
                </span>
              ) : launchState === 'launching' ? (
                <span
                  data-testid="status-badge-launching"
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Launching...</span>
                </span>
              ) : launchState === 'failed' ? (
                <span
                  data-testid="status-badge-failed"
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40"
                  title={launchMessage ?? 'Game failed to start'}
                >
                  <AlertCircle className="w-3 h-3" />
                  <span>Launch Failed</span>
                </span>
              ) : game.isInstalled ? (
                <span
                  data-testid="status-badge-installed"
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-ms-elevated text-emerald-400 border border-emerald-500/30"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Installed</span>
                </span>
              ) : (
                <span
                  data-testid="status-badge-not-installed"
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-ms-elevated text-ms-muted border border-ms-border"
                >
                  <span>Not Installed</span>
                </span>
              )}

              {game.releaseYear && (
                <>
                  <span className="text-xs text-ms-border">•</span>
                  <span className="text-xs text-ms-muted tabular-nums">
                    {game.releaseYear}
                  </span>
                </>
              )}

              <span className="text-xs text-ms-border">•</span>
              {game.userPlatformOverride || game.isUserEdited ? (
                <span
                  data-testid="user-override-badge"
                  className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold"
                  title={`User Override: Classified as ${game.platformName}`}
                >
                  User Override
                </span>
              ) : (
                <span
                  data-testid="auto-detected-badge"
                  className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-ms-card text-ms-muted border border-ms-border"
                >
                  Auto-Detected
                </span>
              )}

              {(game.isArtworkUserEdited || game.userCoverOverride) && (
                <>
                  <span className="text-xs text-ms-border">•</span>
                  <span
                    data-testid="custom-artwork-badge"
                    className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-ms-accent/20 text-ms-accent border border-ms-accent/40 font-semibold flex items-center gap-1"
                    title="Artwork manually selected or locked"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Custom Artwork</span>
                  </span>
                </>
              )}
            </div>

            {/* Game Logo if available */}
            {game.logoImage && (
              <div className="max-h-16 max-w-sm mb-1 flex items-center">
                <img
                  src={game.logoImage}
                  alt={`${game.title} logo`}
                  className="max-h-16 max-w-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]"
                />
              </div>
            )}

            {/* Prominent Game Title (Never truncated to 0 width) */}
            <h1
              data-testid="details-game-title"
              className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight break-words"
            >
              {game.title}
            </h1>

            {/* Subtitle / Developer */}
            <p className="text-sm text-ms-muted">
              <span className="font-semibold text-ms-text/90">{game.developer}</span>
              {game.publisher && game.publisher !== game.developer
                ? ` • ${game.publisher}`
                : ''}
            </p>

            {/* Action Buttons Toolbar */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {!game.isDemoData && game.isInstalled ? (
                <button
                  type="button"
                  data-testid="details-launch-btn"
                  disabled={launchState === 'launching'}
                  onClick={handleLaunchWithAccountCheck}
                  className={`h-11 sm:h-12 px-7 rounded-xl font-bold text-sm inline-flex items-center gap-2.5 shadow-lg transition-transform active:scale-95 ${
                    isGameRunning
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/30'
                      : 'bg-ms-accent hover:bg-ms-accentHover disabled:opacity-60 text-white'
                  }`}
                >
                  {launchState === 'launching' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Launching...</span>
                    </>
                  ) : isGameRunning ? (
                    <>
                      <Activity className="w-4 h-4 text-emerald-200 animate-pulse" />
                      <span>Running</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Play Now</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  title={`Protocol: ${launchSpec.protocolScheme}`}
                  className="h-11 sm:h-12 px-5 rounded-xl bg-ms-elevated border border-ms-border text-ms-muted font-semibold text-sm cursor-not-allowed inline-flex items-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>{game.isDemoData ? 'Demo Preview' : 'Not Installed'}</span>
                </button>
              )}

              <button
                type="button"
                data-testid="details-favorite-btn"
                onClick={() => void toggleFavoriteGame(game.id)}
                className={`h-11 sm:h-12 px-4 rounded-xl border text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
                  isFavorite
                    ? 'bg-amber-400/15 border-amber-400/40 text-amber-400'
                    : 'bg-ms-elevated hover:bg-ms-border border-ms-border text-ms-text'
                }`}
              >
                <Star
                  className={`w-4 h-4 ${
                    isFavorite ? 'fill-amber-400 text-amber-400' : ''
                  }`}
                />
                <span>{isFavorite ? 'Favorited' : 'Favorite'}</span>
              </button>

              {!game.isDemoData && (
                <button
                  type="button"
                  data-testid="details-edit-artwork-btn"
                  onClick={() => void openArtworkModal()}
                  title="Customize game covers, banners, logos, and icons via SteamGridDB"
                  className="h-11 sm:h-12 px-4 rounded-xl bg-ms-elevated hover:bg-ms-border border border-ms-border text-ms-text text-sm font-semibold inline-flex items-center gap-2 transition-colors"
                >
                  <Image className="w-4 h-4 text-ms-accent" />
                  <span>Edit Artwork</span>
                </button>
              )}

              {!game.isDemoData && (
                <button
                  type="button"
                  data-testid="details-edit-btn"
                  onClick={openEditModal}
                  title="Edit game classification, title, or paths"
                  className="h-11 sm:h-12 px-4 rounded-xl bg-ms-elevated hover:bg-ms-border border border-ms-border text-ms-text text-sm font-semibold inline-flex items-center gap-2 transition-colors"
                >
                  <Edit3 className="w-4 h-4 text-ms-accent" />
                  <span>Edit Game</span>
                </button>
              )}

              {!game.isDemoData && (
                <button
                  type="button"
                  data-testid="details-remove-btn"
                  onClick={() => void handleRemoveGame()}
                  title="Remove from MaSwitch library (keeps files on disk)"
                  className="h-11 sm:h-12 px-4 rounded-xl bg-ms-elevated hover:bg-rose-500/10 border border-ms-border hover:border-rose-500/30 text-rose-400 text-sm font-semibold inline-flex items-center gap-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Remove</span>
                </button>
              )}
            </div>

            {/* Single Unified Launch Notification banner */}
            {showLaunchMessage && (
              <div
                data-testid="details-launch-message"
                className={`w-full px-4 py-3 rounded-xl border flex items-center gap-2.5 text-xs font-semibold shadow-sm transition-all ${
                  launchState === 'failed'
                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                    : isGameRunning
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                }`}
              >
                {launchState === 'failed' ? (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                ) : isGameRunning ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                )}
                <span className="leading-snug">{launchMessage}</span>
              </div>
            )}

            {/* Launch Failure Diagnostics card */}
            {launchState === 'failed' && launchDiagnostics[game.id] && (
              <div
                data-testid="details-launch-diagnostics"
                className="w-full p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs space-y-2"
              >
                <div className="font-bold text-rose-300 flex items-center gap-2 text-sm">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Launch Troubleshooting &amp; Diagnostics</span>
                </div>
                <p className="text-ms-muted leading-relaxed">
                  {launchDiagnostics[game.id].troubleshootingAdvice}
                </p>
                {launchDiagnostics[game.id].technicalDetails && (
                  <p className="font-mono text-[11px] text-rose-300/80 bg-black/30 p-2.5 rounded border border-rose-500/20 break-all">
                    {launchDiagnostics[game.id].technicalDetails}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Telemetry Strip */}
        <div className="px-6 sm:px-8 py-4 border-t border-ms-border bg-ms-sidebar/60 flex flex-wrap items-center gap-x-8 sm:gap-x-10 gap-y-3 text-sm">
          <div>
            <span className="text-ms-muted">Playtime:</span>
            <span className="ml-2 font-bold text-ms-text tabular-nums">
              {game.playtimeHours.toFixed(1)} hrs
            </span>
          </div>
          <div>
            <span className="text-ms-muted">Last Played:</span>
            {isGameRunning ? (
              <span className="ml-2 font-bold text-emerald-400 inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Playing Now ({formatLiveDuration(liveDurationSeconds)})</span>
              </span>
            ) : (
              <span className="ml-2 font-medium text-ms-text">
                {game.lastPlayedLabel}
              </span>
            )}
          </div>
          <div>
            <span className="text-ms-muted">Platform:</span>
            <span className="ml-2 font-medium text-ms-text">
              {game.platformName}
            </span>
          </div>
          {game.ownership.installSizeGb > 0 && (
            <div>
              <span className="text-ms-muted">Disk Size:</span>
              <span className="ml-2 font-bold text-ms-text tabular-nums">
                {game.ownership.installSizeGb} GB
              </span>
            </div>
          )}
          {!isOfflineLocalRecord && (
            <div>
              <span className="text-ms-muted">Rating:</span>
              <span className="ml-2 font-bold text-ms-text tabular-nums">
                {game.rating.overallScore}/100
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Description, Screenshots, System Requirements */}
        <div className="lg:col-span-8 space-y-8">
          {/* Description */}
          <section aria-label="Description" className="space-y-4">
            <h2 className="text-lg font-bold text-ms-text">About This Game</h2>
            <div className="space-y-3.5 text-sm text-ms-muted leading-relaxed">
              {game.fullDescription.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>

            {game.genres.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {game.genres.map((genre) => (
                  <span
                    key={genre}
                    className="px-3 py-1 rounded-lg bg-ms-card border border-ms-border text-xs font-medium text-ms-text/90"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Screenshots Gallery */}
          {game.screenshots.length > 0 && (
            <section
              aria-label="Screenshots"
              className="space-y-4 pt-6 border-t border-ms-border"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-ms-text">
                  Screenshots & Media
                </h2>
                {activeScreenshot && (
                  <span className="text-xs text-ms-muted">
                    {activeScreenshot.title}
                  </span>
                )}
              </div>

              {activeScreenshot && (
                <div className="rounded-2xl overflow-hidden bg-ms-card border border-ms-border shadow-card aspect-[16/9]">
                  <img
                    src={activeScreenshot.imageUrl}
                    alt={activeScreenshot.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {game.screenshots.length > 1 && (
                <div className="grid grid-cols-4 gap-3">
                  {game.screenshots.map((shot, idx) => (
                    <button
                      key={shot.id}
                      type="button"
                      onClick={() => setActiveScreenshotIndex(idx)}
                      className={`rounded-xl overflow-hidden border aspect-[16/9] transition-all ${
                        idx === activeScreenshotIndex
                          ? 'border-ms-accent ring-2 ring-ms-accent/40 opacity-100 shadow-md'
                          : 'border-ms-border opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={shot.imageUrl}
                        alt={shot.title}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* System Requirements */}
          {!isOfflineLocalRecord && game.systemRequirements?.minimum && (
            <section
              aria-label="System requirements"
              className="space-y-4 pt-6 border-t border-ms-border"
            >
              <h2 className="text-lg font-bold text-ms-text">
                System Requirements
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 rounded-2xl bg-ms-card border border-ms-border p-6 text-xs">
                <div className="space-y-3">
                  <div className="font-bold text-sm text-ms-text pb-2 border-b border-ms-border">
                    Minimum Requirements
                  </div>
                  <dl className="space-y-2">
                    <div className="flex justify-between gap-3">
                      <dt className="text-ms-muted">OS</dt>
                      <dd className="text-ms-text font-medium text-right">
                        {game.systemRequirements.minimum.os}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ms-muted">Processor</dt>
                      <dd className="text-ms-text font-medium text-right">
                        {game.systemRequirements.minimum.processor}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ms-muted">Memory</dt>
                      <dd className="text-ms-text font-medium text-right">
                        {game.systemRequirements.minimum.memory}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ms-muted">Graphics</dt>
                      <dd className="text-ms-text font-medium text-right">
                        {game.systemRequirements.minimum.graphics}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ms-muted">Storage</dt>
                      <dd className="text-ms-text font-medium text-right">
                        {game.systemRequirements.minimum.storage}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="space-y-3">
                  <div className="font-bold text-sm text-ms-text pb-2 border-b border-ms-border">
                    Recommended Requirements
                  </div>
                  <dl className="space-y-2">
                    <div className="flex justify-between gap-3">
                      <dt className="text-ms-muted">OS</dt>
                      <dd className="text-ms-text font-medium text-right">
                        {game.systemRequirements.recommended.os}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ms-muted">Processor</dt>
                      <dd className="text-ms-text font-medium text-right">
                        {game.systemRequirements.recommended.processor}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ms-muted">Memory</dt>
                      <dd className="text-ms-text font-medium text-right">
                        {game.systemRequirements.recommended.memory}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ms-muted">Graphics</dt>
                      <dd className="text-ms-text font-medium text-right">
                        {game.systemRequirements.recommended.graphics}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ms-muted">Storage</dt>
                      <dd className="text-ms-text font-medium text-right">
                        {game.systemRequirements.recommended.storage}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Achievements & Installation Details */}
        <div className="lg:col-span-4 space-y-6">
          {/* Achievements */}
          {game.achievements?.supported && (
            <section
              aria-label="Achievements"
              className="rounded-2xl bg-ms-card border border-ms-border p-6 space-y-4 shadow-card"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-ms-text">Achievements</h2>
                <span className="text-xs text-ms-muted tabular-nums font-semibold">
                  {game.achievements.unlockedCount} /{' '}
                  {game.achievements.totalCount} (
                  {game.achievements.completionPercentage}%)
                </span>
              </div>

              <div className="w-full h-2 rounded-full bg-ms-bg overflow-hidden">
                <div
                  className="h-full bg-ms-accent rounded-full transition-all"
                  style={{
                    width: `${game.achievements.completionPercentage}%`,
                  }}
                />
              </div>

              {game.achievements.items.length > 0 && (
                <div className="divide-y divide-ms-border pt-1">
                  {game.achievements.items.map((ach) => (
                    <div
                      key={ach.id}
                      className="py-3 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div
                          className={`font-semibold truncate ${
                            ach.unlocked ? 'text-ms-text' : 'text-ms-muted'
                          }`}
                        >
                          {ach.title}
                        </div>
                        <div className="text-[11px] text-ms-muted line-clamp-1 mt-0.5">
                          {ach.description}
                        </div>
                      </div>
                      <span className="text-xs font-mono text-ms-muted tabular-nums shrink-0">
                        {ach.globalUnlockPercentage}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Installation & Manifest Details */}
          <section
            aria-label="Installation details"
            className="rounded-2xl bg-ms-card border border-ms-border p-6 space-y-4 text-xs shadow-card"
          >
            <h2 className="text-base font-bold text-ms-text">Local Manifest</h2>

            <dl className="divide-y divide-ms-border">
              <div className="py-2.5 flex justify-between gap-3">
                <dt className="text-ms-muted">Platform</dt>
                <dd className="text-ms-text font-medium text-right flex items-center gap-1.5">
                  <PlatformLogo platformId={game.platformId} size={14} colorMode="brand" />
                  <span>{game.platformName}</span>
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-3">
                <dt className="text-ms-muted">Launch Method</dt>
                <dd className="text-ms-text font-medium text-right">
                  {game.launchMethod === 'epic-protocol'
                    ? 'Epic Games Launcher Protocol'
                    : game.launchMethod === 'steam-protocol'
                      ? 'Steam Protocol'
                      : game.launchMethod === 'ea-protocol'
                        ? 'EA App Protocol'
                        : game.launchMethod === 'ubisoft-protocol'
                          ? 'Ubisoft Connect Protocol'
                          : game.launchMethod === 'gog-protocol'
                            ? 'GOG Galaxy Protocol'
                            : game.launchMethod === 'rockstar-protocol'
                              ? 'Rockstar Games Protocol'
                              : game.launchMethod === 'riot-services'
                                ? 'Riot Client Services'
                                : 'Direct Executable'}
                </dd>
              </div>
              {(game.platformId === 'epic' || game.title.toLowerCase().includes('fortnite')) && (
                <div className="py-2.5 flex justify-between items-center gap-3">
                  <dt className="text-ms-muted">Launcher Requirement</dt>
                  <dd className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 text-right">
                    Official Epic Games Launcher Required
                  </dd>
                </div>
              )}
              {game.platformId === 'riot' && (
                <div className="py-2.5 flex justify-between items-center gap-3">
                  <dt className="text-ms-muted">Launcher Requirement</dt>
                  <dd className="text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30 text-right">
                    Riot Client & Vanguard Required
                  </dd>
                </div>
              )}
              <div className="py-2.5 flex justify-between gap-3">
                <dt className="text-ms-muted">Source</dt>
                <dd className="text-ms-text font-medium text-right">
                  {game.ownership.accountSlotLabel}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-3">
                <dt className="text-ms-muted">License Type</dt>
                <dd className="text-ms-text font-medium text-right">
                  {game.ownership.licenseType}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-3">
                <dt className="text-ms-muted">Build Version</dt>
                <dd className="text-ms-text font-mono text-right truncate max-w-[180px]">
                  {game.ownership.buildVersion}
                </dd>
              </div>
              {game.launchUri && (
                <div className="pt-2.5 space-y-1.5">
                  <dt className="text-ms-muted font-semibold uppercase tracking-wider text-[11px]">Launch URI / Protocol</dt>
                  <dd className="font-mono text-[11px] text-cyan-300 bg-ms-bg p-2.5 rounded-lg border border-ms-border/70 break-all">
                    {game.launchUri}
                  </dd>
                </div>
              )}
              {(game.installPath || game.ownership.installLocationPreview) && (
                <div className="pt-2.5 space-y-1.5">
                  <dt className="text-ms-muted font-semibold uppercase tracking-wider text-[11px]">Install Path</dt>
                  <dd className="font-mono text-[11px] text-ms-muted/90 bg-ms-bg p-2.5 rounded-lg border border-ms-border/70 break-all">
                    {game.installPath || game.ownership.installLocationPreview}
                  </dd>
                </div>
              )}
              {game.executablePath && (
                <div className="pt-2.5 space-y-1.5">
                  <dt className="text-ms-muted font-semibold uppercase tracking-wider text-[11px]">Executable Path</dt>
                  <dd className="font-mono text-[11px] text-ms-muted/90 bg-ms-bg p-2.5 rounded-lg border border-ms-border/70 break-all">
                    {game.executablePath}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Account Profile Association */}
          <section
            aria-label="Account Association"
            data-testid="game-account-association-card"
            className="rounded-2xl bg-ms-card border border-ms-border p-5 space-y-4 shadow-card"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ms-text uppercase tracking-wider">
                Account Association
              </h3>
              <User className="w-4 h-4 text-ms-muted" />
            </div>

            {associatedAccount ? (
              <div className="p-3 rounded-xl bg-ms-bg border border-ms-border space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <PlatformLogo platformId={associatedAccount.platformId} size={18} colorMode="brand" />
                    <span className="font-bold text-xs text-ms-text truncate">
                      {associatedAccount.displayName}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-ms-muted px-1.5 py-0.5 rounded bg-ms-card border border-ms-border shrink-0">
                    {associatedAccount.username}
                  </span>
                </div>
                {associatedAccount.nickname && (
                  <p className="text-[11px] text-ms-muted italic">
                    "{associatedAccount.nickname}"
                  </p>
                )}
                <div className="pt-1 flex items-center justify-between text-[11px]">
                  <span className="text-emerald-400 font-medium">Linked for this game</span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSection('accounts');
                      void switchAccount(associatedAccount.id, Boolean(associatedAccount.isLastSelected));
                    }}
                    className="text-ms-accent hover:underline font-semibold"
                  >
                    Sign In to Account
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-ms-muted">
                No specific account profile linked. The game will launch using whatever profile is currently active in the launcher.
              </p>
            )}

            <div className="space-y-1.5">
              <label htmlFor="select-game-account" className="block text-[11px] font-semibold text-ms-muted uppercase tracking-wider">
                Assign Preferred Account
              </label>
              <select
                id="select-game-account"
                data-testid="select-game-account"
                value={associatedAccount?.id ?? ''}
                onChange={(e) => void setGameAccountAssociation(game.id, e.target.value || null)}
                className="w-full h-9 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-xl px-3 text-xs text-ms-text focus:outline-none"
              >
                <option value="">None (Default / Active Launcher Account)</option>
                {platformAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.displayName} ({acc.username}) {acc.isPreferred ? '★' : ''}
                  </option>
                ))}
              </select>
            </div>
          </section>
        </div>
      </div>

      {/* Account Mismatch Launch Advisory Modal */}
      {showLaunchAdvisory && associatedAccount && (
        <div
          data-testid="launch-advisory-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-2xl bg-ms-card border border-ms-border shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-amber-400">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-ms-text">
                Account Mismatch Advisory
              </h3>
            </div>

            <p className="text-xs text-ms-muted leading-relaxed">
              This game is associated with profile{' '}
              <span className="font-bold text-ms-text">
                {associatedAccount.displayName} ({associatedAccount.username})
              </span>
              , but your running {associatedAccount.platformId.toUpperCase()} launcher is currently active as{' '}
              <span className="font-bold text-amber-300">
                {launcherStatuses[game.platformId]?.verifiedActiveAccountUsername}
              </span>
              .
            </p>

            <p className="text-xs text-ms-muted/90">
              Launching now will use the currently signed-in account in the launcher. You can proceed directly or switch profiles first.
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowLaunchAdvisory(false)}
                className="h-9 px-3.5 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-muted text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="advisory-switch-btn"
                onClick={() => {
                  setShowLaunchAdvisory(false);
                  setActiveSection('accounts');
                  void switchAccount(associatedAccount.id, true);
                }}
                className="h-9 px-3.5 rounded-xl bg-ms-elevated hover:bg-ms-border border border-ms-border text-ms-text text-xs font-semibold"
              >
                Sign In First
              </button>
              <button
                type="button"
                data-testid="advisory-launch-btn"
                onClick={() => {
                  setShowLaunchAdvisory(false);
                  void launchGameById(game.id);
                }}
                className="h-9 px-4 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white text-xs font-bold shadow-md"
              >
                Launch Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Game Modal */}
      {isEditModalOpen && (
        <div
          data-testid="edit-game-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-lg rounded-2xl bg-ms-card border border-ms-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-ms-border bg-ms-elevated/40">
              <div className="flex items-center gap-2.5">
                <Edit3 className="w-5 h-5 text-ms-accent" />
                <h3 className="text-base font-bold text-white">Edit Game Classification</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 rounded-lg text-ms-muted hover:text-white hover:bg-ms-elevated transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              {editError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
                  {editError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-ms-muted">
                  Game Title
                </label>
                <input
                  type="text"
                  data-testid="edit-game-title-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg bg-ms-bg border border-ms-border text-sm text-white focus:outline-none focus:border-ms-accent transition-colors"
                  placeholder="e.g. EA SPORTS FC 27"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-ms-muted">
                  Platform
                </label>
                <select
                  data-testid="edit-game-platform-select"
                  value={editPlatform}
                  onChange={(e) => setEditPlatform(e.target.value as PlatformId)}
                  className="w-full h-10 px-3 rounded-lg bg-ms-bg border border-ms-border text-sm text-white focus:outline-none focus:border-ms-accent transition-colors cursor-pointer"
                >
                  <option value="ea">EA App</option>
                  <option value="steam">Steam</option>
                  <option value="epic">Epic Games</option>
                  <option value="riot">Riot Games</option>
                  <option value="gog">GOG Galaxy</option>
                  <option value="ubisoft">Ubisoft Connect</option>
                  <option value="rockstar">Rockstar Games</option>
                  <option value="custom">Custom PC Game</option>
                </select>
                <p className="text-[11px] text-ms-muted">
                  Changing platform manually will override auto-detection and persist across library rescans.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-ms-muted">
                  Executable Path (.exe)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    data-testid="edit-game-exe-input"
                    value={editExePath}
                    onChange={(e) => setEditExePath(e.target.value)}
                    className="flex-1 h-10 px-3.5 rounded-lg bg-ms-bg border border-ms-border text-xs font-mono text-white focus:outline-none focus:border-ms-accent transition-colors"
                    placeholder="D:\Games\GameFolder\Game.exe"
                  />
                  <button
                    type="button"
                    data-testid="edit-game-browse-exe-btn"
                    onClick={handleBrowseExe}
                    className="h-10 px-3 rounded-lg bg-ms-elevated hover:bg-ms-border border border-ms-border text-xs font-semibold text-ms-text inline-flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    <FileCode className="w-3.5 h-3.5 text-ms-accent" />
                    <span>Browse...</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-ms-muted">
                  Installation Directory
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    data-testid="edit-game-install-input"
                    value={editInstallPath}
                    onChange={(e) => setEditInstallPath(e.target.value)}
                    className="flex-1 h-10 px-3.5 rounded-lg bg-ms-bg border border-ms-border text-xs font-mono text-white focus:outline-none focus:border-ms-accent transition-colors"
                    placeholder="D:\Games\GameFolder"
                  />
                  <button
                    type="button"
                    data-testid="edit-game-browse-folder-btn"
                    onClick={handleBrowseFolder}
                    className="h-10 px-3 rounded-lg bg-ms-elevated hover:bg-ms-border border border-ms-border text-xs font-semibold text-ms-text inline-flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-ms-accent" />
                    <span>Browse...</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-ms-muted">
                  Launch Method Override
                </label>
                <select
                  data-testid="edit-game-launch-method-select"
                  value={editLaunchMethod}
                  onChange={(e) => setEditLaunchMethod(e.target.value as GameLaunchMethod)}
                  className="w-full h-10 px-3 rounded-lg bg-ms-bg border border-ms-border text-sm text-white focus:outline-none focus:border-ms-accent transition-colors cursor-pointer"
                >
                  <option value="auto">Auto-detect (Recommended)</option>
                  <option value="epic-protocol">Epic Games Launcher (Official Protocol)</option>
                  <option value="steam-protocol">Steam (Official Protocol)</option>
                  <option value="ea-protocol">EA App (Official Protocol)</option>
                  <option value="ubisoft-protocol">Ubisoft Connect (Official Protocol)</option>
                  <option value="gog-protocol">GOG Galaxy (Official Protocol)</option>
                  <option value="rockstar-protocol">Rockstar Games (Official Protocol)</option>
                  <option value="riot-services">Riot Client Services</option>
                  <option value="executable">Direct Executable (.exe)</option>
                </select>
                <p className="text-[11px] text-ms-muted">
                  For games requiring native launchers (e.g. Fortnite on Epic), select the launcher protocol to avoid anti-cheat/DRM launch errors.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-ms-muted">
                  Launcher App Identifier (e.g. Fortnite or numeric Steam ID)
                </label>
                <input
                  type="text"
                  data-testid="edit-game-app-id-input"
                  value={editExternalAppId}
                  onChange={(e) => setEditExternalAppId(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-lg bg-ms-bg border border-ms-border text-xs font-mono text-white focus:outline-none focus:border-ms-accent transition-colors"
                  placeholder="e.g. Fortnite, 730, Origin.OFR.50.0000557"
                />
                <p className="text-[11px] text-ms-muted">
                  Identifier parsed by the official platform launcher (AppName for Epic, App ID for Steam).
                </p>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-ms-border">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="h-10 px-4 rounded-xl bg-ms-elevated hover:bg-ms-border border border-ms-border text-xs font-semibold text-ms-text transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="edit-game-save-btn"
                  disabled={isSavingEdit}
                  className="h-10 px-5 rounded-xl bg-ms-accent hover:bg-ms-accentHover disabled:opacity-50 text-white font-bold text-xs inline-flex items-center gap-2 shadow-sm transition-colors"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Artwork Customization Modal */}
      {isArtworkModalOpen && (
        <div
          data-testid="artwork-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
        >
          <div className="w-full max-w-4xl max-h-[90vh] bg-ms-card border border-ms-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-ms-border flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-ms-elevated border border-ms-border flex items-center justify-center shrink-0">
                  <Image className="w-5 h-5 text-ms-accent" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white truncate">
                    Customize Artwork — {game.title}
                  </h3>
                  <p className="text-xs text-ms-muted truncate">
                    Choose official SteamGridDB covers, hero banners, transparent logos, or icons
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsArtworkModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-ms-elevated text-ms-muted hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Search Bar & Key Warning */}
            <div className="px-6 py-3.5 bg-ms-bg border-b border-ms-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {!steamGridDbStatus.isConfigured ? (
                <div className="w-full flex items-center justify-between gap-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                  <span>SteamGridDB API key is not configured. Connect your free API key in Settings to search and download artwork.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsArtworkModalOpen(false);
                      setActiveSection('settings');
                    }}
                    className="px-3 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-semibold whitespace-nowrap text-white"
                  >
                    Open Settings
                  </button>
                </div>
              ) : (
                <>
                  <form onSubmit={handleSearchArtwork} className="flex-1 flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-ms-muted absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        data-testid="artwork-search-input"
                        value={artworkSearchQuery}
                        onChange={(e) => setArtworkSearchQuery(e.target.value)}
                        placeholder="Search SteamGridDB game title..."
                        className="w-full h-9 pl-9 pr-3 rounded-lg bg-ms-card border border-ms-border text-xs text-white placeholder-ms-muted/70 focus:outline-none focus:border-ms-accent transition-colors"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isLoadingArtwork || !artworkSearchQuery.trim()}
                      className="h-9 px-3.5 rounded-lg bg-ms-elevated hover:bg-ms-border border border-ms-border text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {isLoadingArtwork ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      <span>Search</span>
                    </button>
                  </form>

                  {/* Matching Games Selector if multiple games returned */}
                  {artworkMatches.length > 1 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto max-w-xs">
                      {artworkMatches.slice(0, 4).map((m) => {
                        const active = selectedMatch?.id === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => void handleSelectGameMatch(m)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap border transition-colors ${
                              active
                                ? 'bg-ms-accent/20 border-ms-accent text-white font-semibold'
                                : 'bg-ms-card border-ms-border text-ms-muted hover:text-white'
                            }`}
                          >
                            {m.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Asset Category Tabs */}
            <div className="px-6 border-b border-ms-border bg-ms-card flex items-center gap-4 text-xs font-semibold">
              <button
                type="button"
                data-testid="tab-grids"
                onClick={() => setActiveArtworkTab('grids')}
                className={`py-3 border-b-2 transition-colors ${
                  activeArtworkTab === 'grids'
                    ? 'border-ms-accent text-white'
                    : 'border-transparent text-ms-muted hover:text-ms-text'
                }`}
              >
                Vertical Covers ({artworkBundle?.grids.length ?? 0})
              </button>
              <button
                type="button"
                data-testid="tab-heroes"
                onClick={() => setActiveArtworkTab('heroes')}
                className={`py-3 border-b-2 transition-colors ${
                  activeArtworkTab === 'heroes'
                    ? 'border-ms-accent text-white'
                    : 'border-transparent text-ms-muted hover:text-ms-text'
                }`}
              >
                Hero Banners ({artworkBundle?.heroes.length ?? 0})
              </button>
              <button
                type="button"
                data-testid="tab-logos"
                onClick={() => setActiveArtworkTab('logos')}
                className={`py-3 border-b-2 transition-colors ${
                  activeArtworkTab === 'logos'
                    ? 'border-ms-accent text-white'
                    : 'border-transparent text-ms-muted hover:text-ms-text'
                }`}
              >
                Logos ({artworkBundle?.logos.length ?? 0})
              </button>
              <button
                type="button"
                data-testid="tab-icons"
                onClick={() => setActiveArtworkTab('icons')}
                className={`py-3 border-b-2 transition-colors ${
                  activeArtworkTab === 'icons'
                    ? 'border-ms-accent text-white'
                    : 'border-transparent text-ms-muted hover:text-ms-text'
                }`}
              >
                Icons ({artworkBundle?.icons.length ?? 0})
              </button>
            </div>

            {/* Tab Body — Grid of Assets */}
            <div className="flex-1 p-6 overflow-y-auto min-h-[300px] max-h-[50vh] bg-ms-bg">
              {isLoadingArtwork ? (
                <div className="h-48 flex flex-col items-center justify-center gap-3 text-ms-muted text-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-ms-accent" />
                  <span>Loading artwork options from SteamGridDB...</span>
                </div>
              ) : artworkModalError ? (
                <div className="h-48 flex flex-col items-center justify-center gap-2 text-ms-muted text-xs">
                  <p className="text-rose-400 font-medium">{artworkModalError}</p>
                  <p className="text-[11px]">Try refining your search query above.</p>
                </div>
              ) : (
                <>
                  {/* Vertical Covers Tab */}
                  {activeArtworkTab === 'grids' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3.5">
                      {artworkBundle?.grids && artworkBundle.grids.length > 0 ? (
                        artworkBundle.grids.map((grid) => {
                          const isSelected = selectedGridUrl === grid.url;
                          return (
                            <div
                              key={grid.id}
                              data-testid={`grid-item-${grid.id}`}
                              onClick={() => setSelectedGridUrl(grid.url)}
                              className={`relative aspect-[2/3] rounded-xl overflow-hidden border cursor-pointer group transition-all ${
                                isSelected
                                  ? 'border-ms-accent ring-2 ring-ms-accent/50 shadow-glow'
                                  : 'border-ms-border hover:border-ms-muted'
                              }`}
                            >
                              <img
                                src={grid.thumb || grid.url}
                                alt="Grid cover"
                                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                                loading="lazy"
                              />
                              {isSelected && (
                                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-ms-accent text-white flex items-center justify-center shadow-md">
                                  <Check className="w-3.5 h-3.5" />
                                </div>
                              )}
                              <div className="absolute bottom-0 inset-x-0 p-1.5 bg-black/75 backdrop-blur-xs text-[10px] text-ms-muted flex justify-between">
                                <span>{grid.width}x{grid.height}</span>
                                <span>▲ {grid.upvotes ?? grid.score ?? 0}</span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="col-span-full py-12 text-center text-xs text-ms-muted">
                          No vertical grid covers found for this game.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hero Banners Tab */}
                  {activeArtworkTab === 'heroes' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {artworkBundle?.heroes && artworkBundle.heroes.length > 0 ? (
                        artworkBundle.heroes.map((hero) => {
                          const isSelected = selectedHeroUrl === hero.url;
                          return (
                            <div
                              key={hero.id}
                              data-testid={`hero-item-${hero.id}`}
                              onClick={() => setSelectedHeroUrl(hero.url)}
                              className={`relative aspect-video rounded-xl overflow-hidden border cursor-pointer group transition-all ${
                                isSelected
                                  ? 'border-ms-accent ring-2 ring-ms-accent/50 shadow-glow'
                                  : 'border-ms-border hover:border-ms-muted'
                              }`}
                            >
                              <img
                                src={hero.thumb || hero.url}
                                alt="Hero banner"
                                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                                loading="lazy"
                              />
                              {isSelected && (
                                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-ms-accent text-white flex items-center justify-center shadow-md">
                                  <Check className="w-3.5 h-3.5" />
                                </div>
                              )}
                              <div className="absolute bottom-0 inset-x-0 p-1.5 bg-black/75 backdrop-blur-xs text-[10px] text-ms-muted flex justify-between">
                                <span>{hero.width}x{hero.height}</span>
                                <span>▲ {hero.upvotes ?? hero.score ?? 0}</span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="col-span-full py-12 text-center text-xs text-ms-muted">
                          No hero banners found for this game.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Logos Tab */}
                  {activeArtworkTab === 'logos' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {artworkBundle?.logos && artworkBundle.logos.length > 0 ? (
                        artworkBundle.logos.map((logo) => {
                          const isSelected = selectedLogoUrl === logo.url;
                          return (
                            <div
                              key={logo.id}
                              data-testid={`logo-item-${logo.id}`}
                              onClick={() => setSelectedLogoUrl(logo.url)}
                              className={`relative h-28 rounded-xl p-3 bg-[#111317] border cursor-pointer group flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'border-ms-accent ring-2 ring-ms-accent/50 shadow-glow'
                                  : 'border-ms-border hover:border-ms-muted'
                              }`}
                            >
                              <img
                                src={logo.thumb || logo.url}
                                alt="Game logo"
                                className="max-h-20 max-w-full object-contain filter drop-shadow"
                                loading="lazy"
                              />
                              {isSelected && (
                                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-ms-accent text-white flex items-center justify-center shadow-md">
                                  <Check className="w-3.5 h-3.5" />
                                </div>
                              )}
                              <div className="absolute bottom-0 inset-x-0 p-1 bg-black/75 backdrop-blur-xs text-[10px] text-ms-muted flex justify-between rounded-b-xl px-2">
                                <span>{logo.width}x{logo.height}</span>
                                <span>▲ {logo.upvotes ?? 0}</span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="col-span-full py-12 text-center text-xs text-ms-muted">
                          No transparent logos found for this game.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Icons Tab */}
                  {activeArtworkTab === 'icons' && (
                    <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">
                      {artworkBundle?.icons && artworkBundle.icons.length > 0 ? (
                        artworkBundle.icons.map((icon) => {
                          const isSelected = selectedIconUrl === icon.url;
                          return (
                            <div
                              key={icon.id}
                              data-testid={`icon-item-${icon.id}`}
                              onClick={() => setSelectedIconUrl(icon.url)}
                              className={`relative aspect-square rounded-xl p-3 bg-[#111317] border cursor-pointer group flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'border-ms-accent ring-2 ring-ms-accent/50 shadow-glow'
                                  : 'border-ms-border hover:border-ms-muted'
                              }`}
                            >
                              <img
                                src={icon.thumb || icon.url}
                                alt="Game icon"
                                className="w-12 h-12 object-contain"
                                loading="lazy"
                              />
                              {isSelected && (
                                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-ms-accent text-white flex items-center justify-center shadow-md">
                                  <Check className="w-3 h-3" />
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="col-span-full py-12 text-center text-xs text-ms-muted">
                          No custom icons found for this game.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="px-6 py-4 border-t border-ms-border bg-ms-card flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                data-testid="artwork-restore-default-btn"
                disabled={isSavingArtwork}
                onClick={handleRestoreDefaults}
                className="h-10 px-4 rounded-xl bg-ms-elevated hover:bg-ms-border border border-ms-border text-xs font-semibold text-ms-muted hover:text-white inline-flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore Default Artwork</span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsArtworkModalOpen(false)}
                  className="h-10 px-4 rounded-xl bg-ms-elevated hover:bg-ms-border border border-ms-border text-xs font-semibold text-ms-text transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  data-testid="artwork-save-btn"
                  disabled={isSavingArtwork}
                  onClick={handleSaveArtwork}
                  className="h-10 px-5 rounded-xl bg-ms-accent hover:bg-ms-accentHover disabled:opacity-50 text-white font-bold text-xs inline-flex items-center gap-2 shadow-sm transition-colors"
                >
                  {isSavingArtwork ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Artwork...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Selection</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
