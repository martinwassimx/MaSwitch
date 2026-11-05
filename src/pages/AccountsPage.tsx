import React, { useState, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  Star,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  User,
  X,
  Play,
  Loader2,
  ExternalLink,
  Key,
  Eye,
  EyeOff,
  MoreVertical,
  Globe,
  SlidersHorizontal,
  ArrowUpDown,
  Lock,
  Sparkles,
} from 'lucide-react';
import type {
  AccountProfile,
  CreateAccountProfileInput,
  PlatformCapabilities,
  PlatformLauncherStatus,
  UpdateAccountProfileInput,
} from '../shared/types/account';
import { LAUNCHER_DISPLAY_NAMES } from '../shared/types/account';
import type { PlatformId } from '../shared/types/platform';
import { useAppStore } from '../store/useAppStore';
import { DemoNoticeBanner } from '../components/common/DemoNoticeBanner';
import {
  PlatformLogo,
  PLATFORM_DISPLAY_NAMES,
} from '../components/platforms/PlatformLogo';

/**
 * Supported platforms in MaSwitch Accounts Manager.
 * Ordered with Riot Games, Steam, and Epic Games first for quick access.
 */
const SUPPORTED_ACCOUNT_PLATFORMS: PlatformId[] = [
  'riot',
  'steam',
  'epic',
  'ea',
  'ubisoft',
  'gog',
  'rockstar',
  'discord',
];

type CredentialFilterMode = 'all' | 'configured' | 'missing';
type AccountSortMode = 'platform' | 'name' | 'recent';

/**
 * Extracts a clean region badge (e.g. EUW, NA, EUNE, KR) from a profile's metadata when available.
 */
function extractAccountRegion(profile: AccountProfile): string | null {
  const hashMatch = profile.username.match(/#([A-Za-z0-9]{2,6})$/);
  if (hashMatch) {
    return hashMatch[1].toUpperCase();
  }

  const combined = `${profile.displayName} ${profile.nickname ?? ''} ${profile.notes ?? ''}`;
  const regionMatch = combined.match(
    /\b(EUWN|EUW|EUNE|NA1|NA|KR|BR1|BR|LAN|LAS|OCE|TR1|TR|RU|JP1|JP|ME1|ME|AP|LATAM)\b/i
  );
  if (regionMatch) {
    return regionMatch[1].toUpperCase();
  }

  if (profile.platformId === 'riot') {
    return 'EUW';
  }
  return null;
}

export const AccountsPage: React.FC = () => {
  const accountProfiles = useAppStore((s) => s.accountProfiles);
  const activePlatformProfiles = useAppStore((s) =>
    s.settings.demoModeEnabled ? s.demoActiveProfiles : s.activePlatformProfiles
  );
  const platformCapabilities = useAppStore((s) => s.platformCapabilities);
  const launcherStatuses = useAppStore((s) => s.launcherStatuses);
  const gameAccountAssociations = useAppStore((s) => s.gameAccountAssociations);
  const activeSwitchResult = useAppStore((s) => s.activeSwitchResult);
  const pendingSwitchAccountId = useAppStore((s) => s.pendingSwitchAccountId);
  const isSwitchingAccount = useAppStore((s) => s.isSwitchingAccount);
  const isConfirmingSwitch = useAppStore((s) => s.isConfirmingSwitch);
  const switchError = useAppStore((s) => s.switchError);
  const isDemoMode = useAppStore((s) => s.settings.demoModeEnabled);

  // Riot DPAPI Credential Vault & Desktop Automation Store Hooks (Unchanged Backend Logic)
  const riotCredentialStatuses = useAppStore((s) => s.riotCredentialStatuses);
  const isSavingRiotCredentials = useAppStore((s) => s.isSavingRiotCredentials);
  const riotCredentialError = useAppStore((s) => s.riotCredentialError);
  const saveRiotCredentials = useAppStore((s) => s.saveRiotCredentials);
  const deleteRiotCredentials = useAppStore((s) => s.deleteRiotCredentials);
  const checkRiotClientRunning = useAppStore((s) => s.checkRiotClientRunning);
  const clearRiotCredentialError = useAppStore((s) => s.clearRiotCredentialError);
  const riotLoginAutomationProgress = useAppStore((s) => s.riotLoginAutomationProgress);
  const isRiotLoginAutomating = useAppStore((s) => s.isRiotLoginAutomating);
  const startRiotDesktopLogin = useAppStore((s) => s.startRiotDesktopLogin);
  const cancelRiotDesktopLogin = useAppStore((s) => s.cancelRiotDesktopLogin);
  const clearRiotLoginAutomationProgress = useAppStore((s) => s.clearRiotLoginAutomationProgress);
  const riotAutoSubmitLogin = useAppStore((s) => s.settings.riotAutoSubmitLogin ?? true);
  const updateSettings = useAppStore((s) => s.updateSettings);

  // Account Actions (Unchanged Backend Logic)
  const createAccountProfile = useAppStore((s) => s.createAccountProfile);
  const updateAccountProfile = useAppStore((s) => s.updateAccountProfile);
  const deleteAccountProfile = useAppStore((s) => s.deleteAccountProfile);
  const setPreferredAccount = useAppStore((s) => s.setPreferredAccount);
  const switchAccount = useAppStore((s) => s.switchAccount);
  const confirmAccountSwitch = useAppStore((s) => s.confirmAccountSwitch);
  const cancelSwitchWorkflow = useAppStore((s) => s.cancelSwitchWorkflow);
  const refreshLauncherStatuses = useAppStore((s) => s.refreshLauncherStatuses);
  const openPlatformLauncher = useAppStore((s) => s.openPlatformLauncher);

  // Navigation, Search, Filter & Sort State
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<'all' | PlatformId>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [credentialFilter, setCredentialFilter] = useState<CredentialFilterMode>('all');
  const [sortBy, setSortBy] = useState<AccountSortMode>('platform');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshingStatuses, setIsRefreshingStatuses] = useState(false);
  const [openMenuProfileId, setOpenMenuProfileId] = useState<string | null>(null);

  const favoriteAccountIds = useAppStore((s) => s.settings.favoriteAccountIds ?? []);

  // Riot Credential Management Modal State
  const [credentialModalProfile, setCredentialModalProfile] = useState<AccountProfile | null>(null);
  const [credUsername, setCredUsername] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);
  const [credSuccessMsg, setCredSuccessMsg] = useState<string | null>(null);

  // Riot Desktop Login Automation Modal State
  const [loginModalProfile, setLoginModalProfile] = useState<AccountProfile | null>(null);
  const [isCheckingClient, setIsCheckingClient] = useState(false);
  const [isClientRunning, setIsClientRunning] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Add / Edit Profile Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [formPlatformId, setFormPlatformId] = useState<PlatformId>('riot');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formNickname, setFormNickname] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formIsPreferred, setFormIsPreferred] = useState(false);
  // Optional inline DPAPI credential setup when creating a Riot profile
  const [formRiotLoginUser, setFormRiotLoginUser] = useState('');
  const [formRiotPassword, setFormRiotPassword] = useState('');
  const [showFormRiotPassword, setShowFormRiotPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete Confirmation Modal State
  const [deletingProfile, setDeletingProfile] = useState<AccountProfile | null>(null);

  const openCredentialModal = (profile: AccountProfile) => {
    setOpenMenuProfileId(null);
    setCredentialModalProfile(profile);
    const existingUsername = riotCredentialStatuses[profile.id]?.username || profile.username;
    setCredUsername(existingUsername);
    setCredPassword('');
    setShowPassword(false);
    setCredError(null);
    setCredSuccessMsg(null);
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentialModalProfile) return;
    if (!credUsername.trim()) {
      setCredError('Riot login username is required.');
      return;
    }
    if (!credPassword) {
      setCredError('Riot login password is required.');
      return;
    }

    try {
      setCredError(null);
      await saveRiotCredentials(credentialModalProfile.id, credUsername.trim(), credPassword);
      setCredSuccessMsg('Credentials securely saved with Windows DPAPI encryption.');
      setCredPassword('');
      setTimeout(() => {
        setCredentialModalProfile(null);
        setCredSuccessMsg(null);
      }, 1200);
    } catch (err) {
      setCredError(err instanceof Error ? err.message : 'Failed to save credentials.');
    }
  };

  const handleDeleteCredentials = async () => {
    if (!credentialModalProfile) return;
    try {
      setCredError(null);
      await deleteRiotCredentials(credentialModalProfile.id);
      setCredPassword('');
      setCredentialModalProfile(null);
    } catch (err) {
      setCredError(err instanceof Error ? err.message : 'Failed to delete credentials.');
    }
  };

  const handleInitiateRiotLogin = async (profile: AccountProfile) => {
    setOpenMenuProfileId(null);
    setLoginModalProfile(profile);
    clearRiotLoginAutomationProgress();
    setIsCheckingClient(true);
    setLoginError(null);

    try {
      const running = await checkRiotClientRunning();
      setIsClientRunning(running);
    } catch {
      setIsClientRunning(false);
    } finally {
      setIsCheckingClient(false);
    }
  };

  const handleStartDesktopAutomation = async (autoLaunch: boolean) => {
    if (!loginModalProfile) return;
    setLoginError(null);
    try {
      const res = await startRiotDesktopLogin(loginModalProfile.id, autoLaunch, riotAutoSubmitLogin);
      if (!res.success && res.error !== 'CANCELLED') {
        setLoginError(res.message);
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login automation failed.');
    }
  };

  const handleCancelDesktopAutomation = async () => {
    await cancelRiotDesktopLogin();
  };

  const handleCloseLoginModal = () => {
    if (isRiotLoginAutomating) {
      void cancelRiotDesktopLogin();
    }
    setLoginModalProfile(null);
    clearRiotLoginAutomationProgress();
  };

  const handleRefreshStatuses = async () => {
    setIsRefreshingStatuses(true);
    try {
      await refreshLauncherStatuses();
    } finally {
      setTimeout(() => setIsRefreshingStatuses(false), 400);
    }
  };

  const openCreateModal = (platformId?: PlatformId) => {
    setOpenMenuProfileId(null);
    setEditingProfileId(null);
    setFormPlatformId(platformId ?? (selectedPlatformFilter === 'all' ? 'riot' : selectedPlatformFilter));
    setFormDisplayName('');
    setFormUsername('');
    setFormNickname('');
    setFormNotes('');
    setFormIsPreferred(false);
    setFormRiotLoginUser('');
    setFormRiotPassword('');
    setShowFormRiotPassword(false);
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const openEditModal = (profile: AccountProfile) => {
    setOpenMenuProfileId(null);
    setEditingProfileId(profile.id);
    setFormPlatformId(profile.platformId);
    setFormDisplayName(profile.displayName);
    setFormUsername(profile.username);
    setFormNickname(profile.nickname ?? '');
    setFormNotes(profile.notes ?? '');
    setFormIsPreferred(profile.isPreferred);
    setFormRiotLoginUser(riotCredentialStatuses[profile.id]?.username || profile.username);
    setFormRiotPassword('');
    setShowFormRiotPassword(false);
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const displayName = formDisplayName.trim();
    const username = formUsername.trim();

    if (!displayName) {
      setFormError('Account display name is required.');
      return;
    }
    if (!username) {
      setFormError('Username or public identifier is required.');
      return;
    }

    try {
      if (editingProfileId) {
        const updatePayload: UpdateAccountProfileInput = {
          displayName,
          username,
          nickname: formNickname.trim() || null,
          notes: formNotes.trim() || null,
          isPreferred: formIsPreferred,
        };
        await updateAccountProfile(editingProfileId, updatePayload);
        if (formPlatformId === 'riot' && formRiotPassword) {
          await saveRiotCredentials(
            editingProfileId,
            formRiotLoginUser.trim() || username,
            formRiotPassword
          );
        }
      } else {
        const createPayload: CreateAccountProfileInput = {
          platformId: formPlatformId,
          displayName,
          username,
          nickname: formNickname.trim() || null,
          notes: formNotes.trim() || null,
          isPreferred: formIsPreferred,
        };
        const created = await createAccountProfile(createPayload);
        if (created && formPlatformId === 'riot' && formRiotPassword) {
          await saveRiotCredentials(
            created.id,
            formRiotLoginUser.trim() || username,
            formRiotPassword
          );
        }
      }
      setIsFormModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save account profile.');
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deletingProfile) return;
    try {
      await deleteAccountProfile(deletingProfile.id);
      setDeletingProfile(null);
    } catch {
      // ignore
    }
  };

  // Memoized platform counts & security statistics
  const platformAccountCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const pid of SUPPORTED_ACCOUNT_PLATFORMS) {
      counts[pid] = 0;
    }
    for (const profile of accountProfiles) {
      counts[profile.platformId] = (counts[profile.platformId] ?? 0) + 1;
    }
    return counts;
  }, [accountProfiles]);

  const connectedPlatformsCount = useMemo(() => {
    const installedOrActive = new Set<string>();
    for (const pid of SUPPORTED_ACCOUNT_PLATFORMS) {
      const status = launcherStatuses[pid] as PlatformLauncherStatus | undefined;
      if (status?.isInstalled || status?.isRunning || (platformAccountCounts[pid] ?? 0) > 0) {
        installedOrActive.add(pid);
      }
    }
    return installedOrActive.size;
  }, [launcherStatuses, platformAccountCounts]);

  const securityStats = useMemo(() => {
    const riotProfiles = accountProfiles.filter((p) => p.platformId === 'riot');
    const configuredRiotCount = riotProfiles.filter(
      (p) => riotCredentialStatuses[p.id]?.hasSavedCredentials
    ).length;
    const missingRiotCount = Math.max(0, riotProfiles.length - configuredRiotCount);
    return {
      totalRiot: riotProfiles.length,
      configuredCount: configuredRiotCount,
      missingCount: missingRiotCount,
    };
  }, [accountProfiles, riotCredentialStatuses]);

  // Memoized Filtered & Sorted Profiles (Zero DB queries on keystroke)
  const filteredAndSortedProfiles = useMemo(() => {
    const filtered = accountProfiles.filter((p) => {
      if (selectedPlatformFilter !== 'all' && p.platformId !== selectedPlatformFilter) {
        return false;
      }
      if (favoritesOnly && !favoriteAccountIds.includes(p.id) && !p.isPreferred) {
        return false;
      }
      if (credentialFilter !== 'all') {
        const hasSaved =
          p.platformId === 'riot' && Boolean(riotCredentialStatuses[p.id]?.hasSavedCredentials);
        if (credentialFilter === 'configured' && !hasSaved) return false;
        if (credentialFilter === 'missing' && hasSaved) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.displayName.toLowerCase().includes(q);
        const matchesUser = p.username.toLowerCase().includes(q);
        const matchesNick = p.nickname?.toLowerCase().includes(q) ?? false;
        const matchesNotes = p.notes?.toLowerCase().includes(q) ?? false;
        const matchesPlatform = (PLATFORM_DISPLAY_NAMES[p.platformId] ?? p.platformId)
          .toLowerCase()
          .includes(q);
        return matchesName || matchesUser || matchesNick || matchesNotes || matchesPlatform;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') {
        return a.displayName.localeCompare(b.displayName);
      }
      if (sortBy === 'recent') {
        if (a.isLastSelected && !b.isLastSelected) return -1;
        if (!a.isLastSelected && b.isLastSelected) return 1;
        const aTime = a.lastUsedAt || a.updatedAt || a.createdAt;
        const bTime = b.lastUsedAt || b.updatedAt || b.createdAt;
        return bTime.localeCompare(aTime);
      }
      // Default 'platform': Preferred first within platform order
      const idxA = SUPPORTED_ACCOUNT_PLATFORMS.indexOf(a.platformId);
      const idxB = SUPPORTED_ACCOUNT_PLATFORMS.indexOf(b.platformId);
      if (idxA !== idxB) return idxA - idxB;
      if (a.isPreferred && !b.isPreferred) return -1;
      if (!a.isPreferred && b.isPreferred) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [
    accountProfiles,
    selectedPlatformFilter,
    favoritesOnly,
    favoriteAccountIds,
    credentialFilter,
    riotCredentialStatuses,
    searchQuery,
    sortBy,
  ]);

  const riotProfiles = useMemo(
    () => accountProfiles.filter((p) => p.platformId === 'riot'),
    [accountProfiles]
  );

  const isVerified = (profile: AccountProfile, status?: PlatformLauncherStatus) =>
    !isDemoMode &&
    Boolean(status?.isRunning) &&
    status?.verifiedActiveAccountUsername?.toLowerCase() === profile.username.toLowerCase();

  const getAssociatedGameCount = (profileId: string) =>
    gameAccountAssociations.filter((a) => a.accountId === profileId).length;

  const showRiotBanner =
    riotProfiles.length > 0 &&
    (selectedPlatformFilter === 'all' || selectedPlatformFilter === 'riot');

  return (
    <div
      data-testid="page-accounts"
      className="max-w-7xl mx-auto space-y-6 pb-16"
      onClick={() => {
        if (openMenuProfileId) setOpenMenuProfileId(null);
      }}
    >
      {/* 1. Top Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ms-border/80 pb-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-extrabold text-ms-text tracking-tight">Accounts</h1>
            <span
              data-testid="total-account-slots-count"
              className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30 tabular-nums"
            >
              {accountProfiles.length} {accountProfiles.length === 1 ? 'account' : 'accounts'}
            </span>
            <span
              data-testid="connected-platforms-count"
              className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-ms-card text-ms-muted border border-ms-border tabular-nums"
            >
              {connectedPlatformsCount} connected{' '}
              {connectedPlatformsCount === 1 ? 'platform' : 'platforms'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-ms-muted">
            Manage and switch your gaming identities
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            data-testid="refresh-launcher-status-btn"
            onClick={() => void handleRefreshStatuses()}
            disabled={isRefreshingStatuses}
            title="Check installed and running launchers"
            className="h-10 px-3.5 rounded-xl bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-text text-xs font-semibold inline-flex items-center gap-2 transition-colors shadow-sm"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshingStatuses ? 'animate-spin text-ms-accent' : ''}`}
            />
            <span>Check Launchers</span>
          </button>

          <button
            type="button"
            data-testid="add-account-profile-btn"
            onClick={() => openCreateModal()}
            className="h-10 px-4 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white text-xs font-bold inline-flex items-center gap-2 transition-transform active:scale-95 shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Add Account</span>
          </button>
        </div>
      </header>

      {isDemoMode && (
        <DemoNoticeBanner
          title="Demo Mode: Multi-Account Management Simulation"
          description="Sample profiles are shown for Steam, Epic, Riot, EA, and other platforms. You can create, edit, delete, and test switching workflows safely."
        />
      )}

      {/* 2. Horizontal Platform Selector */}
      <nav
        aria-label="Platform Filter"
        className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar"
      >
        <button
          type="button"
          data-testid="accounts-filter-all"
          onClick={() => setSelectedPlatformFilter('all')}
          className={`h-10 px-4 rounded-xl text-xs font-bold transition-all shrink-0 inline-flex items-center gap-2 ${
            selectedPlatformFilter === 'all'
              ? 'bg-ms-accent text-white shadow-md ring-1 ring-violet-400/40'
              : 'bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text'
          }`}
        >
          <span>All Accounts</span>
          <span
            className={`text-[11px] px-1.5 py-0.2 rounded-md tabular-nums ${
              selectedPlatformFilter === 'all'
                ? 'bg-white/20 text-white'
                : 'bg-ms-elevated text-ms-muted'
            }`}
          >
            {accountProfiles.length}
          </span>
        </button>

        {SUPPORTED_ACCOUNT_PLATFORMS.map((platformId) => {
          const count = platformAccountCounts[platformId] ?? 0;
          const active = selectedPlatformFilter === platformId;
          const status = launcherStatuses[platformId] as PlatformLauncherStatus | undefined;
          const isRunning = Boolean(status?.isRunning);

          return (
            <button
              key={platformId}
              type="button"
              data-testid={`accounts-filter-${platformId}`}
              onClick={() => setSelectedPlatformFilter(platformId)}
              className={`h-10 px-3.5 rounded-xl text-xs font-semibold transition-all shrink-0 inline-flex items-center gap-2 ${
                active
                  ? 'bg-violet-600/25 border border-violet-500/80 text-white shadow-sm ring-1 ring-violet-500/30'
                  : 'bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text'
              }`}
            >
              <span className="relative flex items-center justify-center">
                <PlatformLogo platformId={platformId} size={16} colorMode="brand" />
                {isRunning && (
                  <span
                    title="Launcher Running"
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute -top-0.5 -right-0.5 ring-2 ring-ms-card"
                  />
                )}
              </span>
              <span>{PLATFORM_DISPLAY_NAMES[platformId]}</span>
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-md tabular-nums ${
                  active
                    ? 'bg-violet-500/30 text-violet-200'
                    : count > 0
                    ? 'bg-ms-elevated text-ms-text/80'
                    : 'bg-ms-elevated/40 text-ms-muted/60'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* 3. Search, Filter & Sort Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-ms-card/60 border border-ms-border/80 rounded-2xl p-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-ms-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            data-testid="accounts-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by display name, username, Riot ID, or region..."
            className="w-full h-9 bg-ms-bg hover:bg-ms-elevated/60 border border-ms-border focus:border-ms-accent rounded-xl pl-9 pr-8 text-xs text-ms-text placeholder:text-ms-muted focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              data-testid="accounts-search-clear-btn"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ms-muted hover:text-ms-text text-xs"
            >
              ×
            </button>
          )}
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Preferred Filter Toggle */}
          <button
            type="button"
            data-testid="accounts-filter-favorites"
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            className={`h-9 px-3 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 border ${
              favoritesOnly
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                : 'bg-ms-bg hover:bg-ms-elevated border-ms-border text-ms-muted hover:text-ms-text'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${favoritesOnly ? 'fill-amber-400 text-amber-400' : ''}`} />
            <span>Preferred</span>
          </button>

          {/* Credential Status Filter */}
          <div className="relative inline-flex items-center">
            <SlidersHorizontal className="w-3.5 h-3.5 text-ms-muted absolute left-3 pointer-events-none" />
            <select
              data-testid="accounts-credential-filter"
              aria-label="Filter by credential status"
              value={credentialFilter}
              onChange={(e) => setCredentialFilter(e.target.value as CredentialFilterMode)}
              className="h-9 pl-8 pr-7 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-xs font-semibold text-ms-text focus:outline-none focus:border-ms-accent cursor-pointer"
            >
              <option value="all">All Credentials</option>
              <option value="configured">Credentials Saved</option>
              <option value="missing">Credentials Missing</option>
            </select>
          </div>

          {/* Sort Order Selector */}
          <div className="relative inline-flex items-center">
            <ArrowUpDown className="w-3.5 h-3.5 text-ms-muted absolute left-3 pointer-events-none" />
            <select
              data-testid="accounts-sort-select"
              aria-label="Sort accounts"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as AccountSortMode)}
              className="h-9 pl-8 pr-7 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-xs font-semibold text-ms-text focus:outline-none focus:border-ms-accent cursor-pointer"
            >
              <option value="platform">Sort: Platform</option>
              <option value="name">Sort: Name (A–Z)</option>
              <option value="recent">Sort: Recently Used</option>
            </select>
          </div>
        </div>
      </div>

      {/* Switch Error Alert (When no guidance modal is open) */}
      {switchError && !activeSwitchResult && (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300"
        >
          {switchError}
        </p>
      )}

      {/* Selected Platform Context Bar (When a specific platform is filtered) */}
      {selectedPlatformFilter !== 'all' && selectedPlatformFilter !== 'riot' && (() => {
        const status = launcherStatuses[selectedPlatformFilter] as PlatformLauncherStatus | undefined;
        const capability = platformCapabilities[selectedPlatformFilter] as
          | PlatformCapabilities
          | undefined;
        const isRunning = Boolean(status?.isRunning);
        const isInstalled = Boolean(status?.isInstalled);
        const platformName = PLATFORM_DISPLAY_NAMES[selectedPlatformFilter];

        return (
          <div
            data-testid={`platform-context-bar-${selectedPlatformFilter}`}
            className="px-5 py-3.5 rounded-2xl bg-ms-card border border-ms-border flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-ms-elevated border border-ms-border flex items-center justify-center shrink-0">
                <PlatformLogo platformId={selectedPlatformFilter} size={20} colorMode="brand" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-ms-text">{platformName}</span>
                  {isRunning ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Launcher Running</span>
                    </span>
                  ) : isInstalled ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                      <span>Installed</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/30">
                      <span>{status ? 'Launcher Unavailable' : 'Status Unknown'}</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-ms-muted truncate">
                  {capability?.switchingMethodDescription ??
                    'Choose or sign in to your account in the official platform client.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid={`add-slot-${selectedPlatformFilter}`}
                onClick={() => openCreateModal(selectedPlatformFilter)}
                className="h-8.5 px-3 rounded-xl bg-ms-elevated hover:bg-ms-border border border-ms-border text-ms-text text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add {platformName} Account</span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* Riot Games Quick Status & Client Control Bar */}
      {showRiotBanner && (() => {
        const riotActive = activePlatformProfiles['riot'];
        const lastSelectedProfile =
          riotProfiles.find((p) => p.isLastSelected) ||
          riotProfiles.find((p) => p.id === riotActive?.accountId) ||
          riotProfiles[0];
        const confirmedProfile = riotProfiles.find((p) => p.id === riotActive?.accountId);

        return (
          <div
            data-testid="riot-account-status-panel"
            className="px-5 py-3.5 rounded-2xl bg-gradient-to-r from-violet-950/30 via-ms-card to-ms-card border border-violet-500/25 text-xs shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 text-ms-muted">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-ms-elevated border border-ms-border flex items-center justify-center shrink-0">
                    <PlatformLogo platformId="riot" size={18} colorMode="brand" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-ms-muted/70 block">
                      Riot Vault Security
                    </span>
                    <span className="font-semibold text-emerald-400 inline-flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      Windows DPAPI Encrypted
                    </span>
                  </div>
                </div>
                <div className="w-px h-6 bg-ms-border/80 hidden sm:block" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-ms-muted/70 block">
                    Saved Credentials
                  </span>
                  <span className="font-bold text-white">
                    {securityStats.configuredCount} of {riotProfiles.length} Profiles Configured
                  </span>
                </div>
                <div className="w-px h-6 bg-ms-border/80 hidden sm:block" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-ms-muted/70 block">
                    Selected Profile
                  </span>
                  <span className="font-bold text-white">
                    {lastSelectedProfile ? lastSelectedProfile.displayName : 'None'}
                  </span>
                </div>
                <div className="w-px h-6 bg-ms-border/80 hidden sm:block" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-ms-muted/70 block">
                    Last User-Confirmed
                  </span>
                  <span className="font-medium text-slate-300">
                    {confirmedProfile ? confirmedProfile.displayName : 'None'} • Authentication Unknown • Manual Sign-In Required
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="riot-section-open-launcher-btn"
                  onClick={() => void openPlatformLauncher('riot')}
                  className="h-8.5 px-3.5 rounded-xl bg-ms-elevated hover:bg-ms-border border border-ms-border text-ms-text text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-violet-400" />
                  <span>Open Riot Client</span>
                </button>
              </div>
            </div>

            {riotCredentialError && (
              <div className="mt-2.5 flex items-center justify-between gap-3 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{riotCredentialError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => clearRiotCredentialError()}
                  className="p-1 text-rose-300 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* 4. Account Cards Grid OR Single Compact Empty State */}
      {filteredAndSortedProfiles.length === 0 ? (
        <div
          data-testid="accounts-empty-state"
          className="rounded-2xl bg-ms-card border border-ms-border p-10 text-center max-w-xl mx-auto my-4 space-y-4 shadow-card"
        >
          <div className="w-12 h-12 rounded-2xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center mx-auto">
            {selectedPlatformFilter !== 'all' ? (
              <PlatformLogo platformId={selectedPlatformFilter} size={26} colorMode="brand" />
            ) : (
              <User className="w-6 h-6 text-violet-400" />
            )}
          </div>

          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-ms-text">
              {searchQuery || favoritesOnly || credentialFilter !== 'all'
                ? 'No matching accounts found'
                : selectedPlatformFilter !== 'all'
                ? `No ${PLATFORM_DISPLAY_NAMES[selectedPlatformFilter]} accounts yet.`
                : 'No gaming accounts saved yet.'}
            </h2>
            <p className="text-xs text-ms-muted max-w-md mx-auto leading-relaxed">
              {searchQuery || favoritesOnly || credentialFilter !== 'all'
                ? 'Try clearing your search query or adjusting the active filters.'
                : selectedPlatformFilter === 'riot'
                ? 'Add your Riot Games accounts to enable one-click Windows DPAPI encrypted desktop login automation.'
                : selectedPlatformFilter !== 'all'
                ? `Save your ${PLATFORM_DISPLAY_NAMES[selectedPlatformFilter]} profiles to quickly switch identities and launch the official client.`
                : 'Add your Riot Games, Steam, Epic Games, and other gaming profiles to manage all your identities in one place.'}
            </p>
          </div>

          <div className="flex items-center justify-center gap-2.5 pt-1">
            {(searchQuery || favoritesOnly || credentialFilter !== 'all') && (
              <button
                type="button"
                data-testid="reset-account-filters-btn"
                onClick={() => {
                  setSearchQuery('');
                  setFavoritesOnly(false);
                  setCredentialFilter('all');
                }}
                className="h-9 px-4 rounded-xl bg-ms-elevated hover:bg-ms-border border border-ms-border text-xs font-semibold text-ms-text transition-colors"
              >
                Reset Filters
              </button>
            )}
            <button
              type="button"
              data-testid="empty-state-add-account-btn"
              onClick={() =>
                openCreateModal(selectedPlatformFilter === 'all' ? undefined : selectedPlatformFilter)
              }
              className="h-9 px-4 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-md transition-transform active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>
                {selectedPlatformFilter !== 'all'
                  ? `Add ${PLATFORM_DISPLAY_NAMES[selectedPlatformFilter]} Account`
                  : 'Add Account'}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div
          data-testid="accounts-card-grid"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {filteredAndSortedProfiles.map((profile) => {
            const platformStatus = launcherStatuses[profile.platformId] as
              | PlatformLauncherStatus
              | undefined;
            const capability = platformCapabilities[profile.platformId] as
              | PlatformCapabilities
              | undefined;
            const verified = isVerified(profile, platformStatus);
            const confirmedRecord = activePlatformProfiles[profile.platformId];
            const confirmed = confirmedRecord?.accountId === profile.id;
            const gameCount = getAssociatedGameCount(profile.id);
            const isRiot = profile.platformId === 'riot';
            const credStatus = isRiot ? riotCredentialStatuses[profile.id] : undefined;
            const hasCredentials = Boolean(credStatus?.hasSavedCredentials);
            const region = extractAccountRegion(profile);
            const isMenuOpen = openMenuProfileId === profile.id;

            const isThisRiotAutomating =
              isRiot && isRiotLoginAutomating && loginModalProfile?.id === profile.id;
            const isThisRiotWaitingMfa =
              isRiot &&
              loginModalProfile?.id === profile.id &&
              riotLoginAutomationProgress?.status === 'waiting-for-user';

            return (
              <article
                key={profile.id}
                data-testid={`account-card-${profile.id}`}
                className={`group relative rounded-2xl bg-ms-card border transition-all duration-150 p-5 flex flex-col justify-between gap-4 shadow-card ${
                  profile.isPreferred
                    ? 'border-violet-500/40 hover:border-violet-500/70'
                    : 'border-ms-border hover:border-ms-border/90 hover:bg-ms-card/90'
                }`}
              >
                {/* Top Identity Header */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      {/* Avatar / Platform Brand Badge */}
                      <div className="relative w-11 h-11 rounded-xl bg-ms-elevated border border-ms-border flex items-center justify-center shrink-0">
                        {profile.avatarUrl ? (
                          <img
                            src={profile.avatarUrl}
                            alt={profile.displayName}
                            className="w-full h-full rounded-xl object-cover"
                          />
                        ) : (
                          <PlatformLogo
                            platformId={profile.platformId}
                            size={22}
                            colorMode="brand"
                          />
                        )}
                        <span
                          title={PLATFORM_DISPLAY_NAMES[profile.platformId]}
                          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-md bg-ms-bg border border-ms-border flex items-center justify-center shadow-sm"
                        >
                          <PlatformLogo
                            platformId={profile.platformId}
                            size={11}
                            colorMode="brand"
                          />
                        </span>
                      </div>

                      {/* Account Name, Username & Platform */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3
                            data-testid={isRiot ? `riot-display-name-${profile.id}` : undefined}
                            className="text-sm font-bold text-ms-text truncate"
                            title={profile.displayName}
                          >
                            {profile.displayName}
                          </h3>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-ms-muted">
                          <span className="font-semibold text-ms-text/80">
                            {PLATFORM_DISPLAY_NAMES[profile.platformId]}
                          </span>
                          {region && (
                            <>
                              <span>•</span>
                              <span
                                data-testid={`account-region-${profile.id}`}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-300"
                              >
                                <Globe className="w-3 h-3" />
                                {region}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ms-muted truncate">
                          <span className="font-mono text-ms-muted/90 truncate">
                            {isRiot && credStatus?.username
                              ? `User: ${credStatus.username}`
                              : profile.username}
                          </span>
                          {profile.nickname && (
                            <span className="text-ms-muted/70 truncate">• {profile.nickname}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Top-Right Controls: Preferred Toggle + More Menu */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        data-testid={`preferred-toggle-${profile.id}`}
                        onClick={() => void setPreferredAccount(profile.id)}
                        title={
                          profile.isPreferred ? 'Preferred account' : 'Set as preferred account'
                        }
                        className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${
                          profile.isPreferred
                            ? 'bg-amber-400/15 border-amber-400/40 text-amber-400'
                            : 'bg-ms-bg hover:bg-ms-elevated border-ms-border text-ms-muted hover:text-ms-text'
                        }`}
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${profile.isPreferred ? 'fill-amber-400' : ''}`}
                        />
                      </button>

                      {/* More Dropdown Trigger */}
                      <div
                        className="relative"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <button
                          type="button"
                          data-testid={`more-menu-btn-${profile.id}`}
                          aria-label="More account actions"
                          onClick={() =>
                            setOpenMenuProfileId(isMenuOpen ? null : profile.id)
                          }
                          className="w-8 h-8 rounded-lg bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text flex items-center justify-center transition-colors"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {isMenuOpen && (
                          <div
                            data-testid={`more-menu-dropdown-${profile.id}`}
                            className="absolute right-0 top-9 z-30 w-48 rounded-xl bg-ms-elevated border border-ms-border shadow-2xl py-1.5 text-xs"
                          >
                            <button
                              type="button"
                              onClick={() => openEditModal(profile)}
                              className="w-full px-3 py-2 text-left text-ms-text hover:bg-ms-card flex items-center gap-2"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-ms-muted" />
                              <span>Edit Profile Info</span>
                            </button>
                            {isRiot && (
                              <button
                                type="button"
                                onClick={() => openCredentialModal(profile)}
                                className="w-full px-3 py-2 text-left text-ms-text hover:bg-ms-card flex items-center gap-2"
                              >
                                <Key className="w-3.5 h-3.5 text-violet-400" />
                                <span>
                                  {hasCredentials
                                    ? 'Manage DPAPI Credentials'
                                    : 'Set Up Credentials'}
                                </span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuProfileId(null);
                                void setPreferredAccount(profile.id);
                              }}
                              className="w-full px-3 py-2 text-left text-ms-text hover:bg-ms-card flex items-center gap-2"
                            >
                              <Star className="w-3.5 h-3.5 text-amber-400" />
                              <span>
                                {profile.isPreferred ? 'Preferred Account' : 'Set as Preferred'}
                              </span>
                            </button>
                            <div className="my-1 border-t border-ms-border/60" />
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuProfileId(null);
                                setDeletingProfile(profile);
                              }}
                              className="w-full px-3 py-2 text-left text-rose-400 hover:bg-rose-500/10 flex items-center gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Account</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status Badges Row */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {profile.isPreferred && (
                      <span
                        data-testid={`status-badge-preferred-${profile.id}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      >
                        <Star className="w-2.5 h-2.5 fill-amber-400" />
                        <span>Preferred Profile</span>
                      </span>
                    )}

                    {isRiot && (
                      <span
                        data-testid={`status-badge-credentials-${profile.id}`}
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                          hasCredentials
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            hasCredentials ? 'bg-emerald-400' : 'bg-amber-400'
                          }`}
                        />
                        <span>
                          {hasCredentials ? 'Credentials Saved' : 'Credentials Missing'}
                        </span>
                      </span>
                    )}

                    {isThisRiotAutomating && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        <span>Login in Progress</span>
                      </span>
                    )}

                    {isThisRiotWaitingMfa && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        <span>Verification Required</span>
                      </span>
                    )}

                    {verified && (
                      <span
                        data-testid={`status-badge-verified-${profile.id}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Verified Active Account</span>
                      </span>
                    )}

                    {confirmed && (
                      <span
                        data-testid={`status-badge-confirmed-${profile.id}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>User-Confirmed Profile</span>
                      </span>
                    )}

                    {profile.isLastSelected && (
                      <span
                        data-testid={`status-badge-selected-${profile.id}`}
                        className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/25"
                      >
                        Last Selected Profile
                      </span>
                    )}

                    {!isRiot && !verified && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-ms-bg border border-ms-border/70 text-ms-muted">
                        {pendingSwitchAccountId === profile.id && activeSwitchResult
                          ? capability?.requiresManualSignIn === false
                            ? 'Choose Account in Client'
                            : 'Sign-In Required'
                          : 'Authentication Unknown'}
                      </span>
                    )}
                  </div>

                  {/* Metadata Line (Last confirmed login / Linked games / Notes) */}
                  {(confirmed || gameCount > 0 || profile.notes) && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-ms-muted pt-0.5">
                      {confirmed && confirmedRecord?.confirmedAt && (
                        <span>
                          Last Confirmed Login:{' '}
                          {new Date(confirmedRecord.confirmedAt).toLocaleDateString()}
                        </span>
                      )}
                      {gameCount > 0 && (
                        <span className="text-violet-300 font-medium">
                          {gameCount} {gameCount === 1 ? 'game' : 'games'} linked
                        </span>
                      )}
                      {profile.notes && (
                        <span className="truncate max-w-[220px] text-ms-muted/80">
                          {profile.notes}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer: Prominent Primary Action + Secondary Edit & Delete */}
                <div className="pt-3 border-t border-ms-border/60 flex items-center justify-between gap-2">
                  {isRiot ? (
                    <>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <button
                          type="button"
                          data-testid={`riot-login-btn-${profile.id}`}
                          onClick={() => void handleInitiateRiotLogin(profile)}
                          className="h-9 px-4 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-transform active:scale-95 shadow-md flex-1"
                          title="Open official Riot Client and automatically enter credentials"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Login</span>
                        </button>

                        {!hasCredentials && (
                          <button
                            type="button"
                            data-testid={`setup-credentials-btn-${profile.id}`}
                            onClick={() => openCredentialModal(profile)}
                            className="h-9 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0"
                            title="Configure Windows DPAPI encrypted credentials"
                          >
                            <Key className="w-3.5 h-3.5" />
                            <span>Set Up Credentials</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          data-testid={`edit-profile-${profile.id}`}
                          onClick={() => openCredentialModal(profile)}
                          title="Edit Riot credentials"
                          className="h-9 px-3 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-text text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Key className="w-3.5 h-3.5 text-violet-400" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          data-testid={`delete-profile-${profile.id}`}
                          onClick={() => setDeletingProfile(profile)}
                          title="Delete profile"
                          className="h-9 w-9 rounded-xl bg-ms-bg hover:bg-rose-500/10 border border-ms-border hover:border-rose-500/30 text-ms-muted hover:text-rose-400 flex items-center justify-center transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        data-testid={
                          profile.isLastSelected
                            ? `sign-in-again-btn-${profile.id}`
                            : `switch-btn-${profile.id}`
                        }
                        onClick={() => void switchAccount(profile.id, Boolean(profile.isLastSelected))}
                        disabled={isSwitchingAccount || isConfirmingSwitch}
                        className="h-9 px-4 rounded-xl bg-ms-accent hover:bg-ms-accentHover disabled:opacity-60 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-transform active:scale-95 shadow-md flex-1"
                      >
                        {isSwitchingAccount && pendingSwitchAccountId === profile.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        <span>
                          {profile.isLastSelected ? 'Sign In Again' : 'Switch Account'}
                        </span>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          data-testid={`edit-profile-${profile.id}`}
                          onClick={() => openEditModal(profile)}
                          title="Edit profile information"
                          className="h-9 px-3 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-text text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-ms-muted" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          data-testid={`delete-profile-${profile.id}`}
                          onClick={() => setDeletingProfile(profile)}
                          title="Delete profile"
                          className="h-9 w-9 rounded-xl bg-ms-bg hover:bg-rose-500/10 border border-ms-border hover:border-rose-500/30 text-ms-muted hover:text-rose-400 flex items-center justify-center transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 8. Compact Security Overview Panel (Visually Secondary) */}
      <section
        data-testid="security-overview-panel"
        aria-label="Security Overview"
        className="rounded-2xl bg-ms-card/60 border border-ms-border/70 px-5 py-4 flex flex-wrap items-center justify-between gap-4 text-xs"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-ms-text">Security Overview</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Windows DPAPI Active
              </span>
            </div>
            <p className="text-ms-muted text-[11px] truncate">
              Riot credentials are encrypted with Windows DPAPI bound to your OS user account. Plaintext passwords and tokens are never stored in SQLite.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          <div className="px-3 py-1.5 rounded-xl bg-ms-bg border border-ms-border/70">
            <span className="text-ms-muted">Configured Credentials: </span>
            <strong
              data-testid="security-configured-count"
              className="text-emerald-400 font-bold tabular-nums"
            >
              {securityStats.configuredCount}
            </strong>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-ms-bg border border-ms-border/70">
            <span className="text-ms-muted">Requiring Setup: </span>
            <strong
              data-testid="security-missing-count"
              className="text-amber-300 font-bold tabular-nums"
            >
              {securityStats.missingCount}
            </strong>
          </div>
        </div>
      </section>

      {/* Add / Edit Profile Modal */}
      {isFormModalOpen && (
        <div
          data-testid="account-profile-form-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-ms-card border border-ms-border shadow-2xl space-y-5 p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-ms-border/80 pb-4">
              <div className="flex items-center gap-2.5">
                <PlatformLogo platformId={formPlatformId} size={22} colorMode="brand" />
                <div>
                  <h3 className="text-base font-bold text-ms-text">
                    {editingProfileId ? 'Edit Account Profile' : 'Add Account Profile'}
                  </h3>
                  <p className="text-[11px] text-ms-muted">
                    {PLATFORM_DISPLAY_NAMES[formPlatformId]} Identity
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-ms-elevated text-ms-muted hover:text-ms-text flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
              {/* Step 1: Platform selector (only when creating) */}
              {!editingProfileId && (
                <div>
                  <label className="block font-semibold text-ms-text mb-1.5">
                    1. Select Platform
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {SUPPORTED_ACCOUNT_PLATFORMS.map((pid) => (
                      <button
                        key={pid}
                        type="button"
                        data-testid={`form-platform-${pid}`}
                        onClick={() => setFormPlatformId(pid)}
                        className={`p-2 rounded-xl border text-center flex flex-col items-center gap-1.5 transition-all ${
                          formPlatformId === pid
                            ? 'bg-violet-500/20 border-violet-500 text-white shadow-sm'
                            : 'bg-ms-bg hover:bg-ms-elevated border-ms-border text-ms-muted'
                        }`}
                      >
                        <PlatformLogo platformId={pid} size={18} colorMode="brand" />
                        <span className="text-[11px] font-semibold truncate w-full">
                          {PLATFORM_DISPLAY_NAMES[pid]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Display Name */}
              <div>
                <label className="block font-semibold text-ms-text mb-1">
                  Account Display Name *
                </label>
                <input
                  type="text"
                  data-testid="input-display-name"
                  value={formDisplayName}
                  onChange={(e) => setFormDisplayName(e.target.value)}
                  placeholder={
                    formPlatformId === 'riot'
                      ? 'e.g. LOL EUW — Melynelas'
                      : 'e.g. Primary Main Library, Competitive Alt'
                  }
                  className="w-full h-9 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-xl px-3 text-xs text-ms-text placeholder:text-ms-muted focus:outline-none"
                  required
                />
              </div>

              {/* Username / Public Identifier / Riot ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-ms-text mb-1">
                    {formPlatformId === 'riot'
                      ? 'Riot ID or Username *'
                      : 'Username or Identifier *'}
                  </label>
                  <input
                    type="text"
                    data-testid="input-username"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder={
                      formPlatformId === 'riot'
                        ? 'e.g. Melynelas#EUW'
                        : 'e.g. kestrel_prime, SteamID'
                    }
                    className="w-full h-9 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-xl px-3 font-mono text-xs text-ms-text placeholder:text-ms-muted focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-ms-text mb-1">
                    {formPlatformId === 'riot' ? 'Region / Game Tag' : 'Nickname (Optional)'}
                  </label>
                  <input
                    type="text"
                    data-testid="input-nickname"
                    value={formNickname}
                    onChange={(e) => setFormNickname(e.target.value)}
                    placeholder={
                      formPlatformId === 'riot'
                        ? 'e.g. League of Legends — EUW'
                        : 'e.g. Main, Alt, EUW'
                    }
                    className="w-full h-9 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-xl px-3 text-xs text-ms-text placeholder:text-ms-muted focus:outline-none"
                  />
                </div>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block font-semibold text-ms-text mb-1">Notes (Optional)</label>
                <textarea
                  data-testid="input-notes"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Notes about games, rank, or region..."
                  rows={2}
                  className="w-full bg-ms-bg border border-ms-border focus:border-ms-accent rounded-xl p-3 text-xs text-ms-text placeholder:text-ms-muted focus:outline-none resize-none"
                />
              </div>

              {/* Optional DPAPI Credentials Section — ONLY for Riot Games */}
              {formPlatformId === 'riot' ? (
                <div className="p-3.5 rounded-xl bg-violet-500/10 border border-violet-500/25 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-violet-200 inline-flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-violet-400" />
                      <span>Automated Login Credentials (Optional)</span>
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-400">
                      Windows DPAPI Vault
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-ms-muted mb-1">
                        Riot Sign-In Username
                      </label>
                      <input
                        type="text"
                        data-testid="form-riot-login-username"
                        value={formRiotLoginUser}
                        onChange={(e) => setFormRiotLoginUser(e.target.value)}
                        placeholder="Defaults to username above"
                        className="w-full h-8.5 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-lg px-2.5 text-xs text-ms-text placeholder:text-ms-muted focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-ms-muted mb-1">
                        Riot Sign-In Password
                      </label>
                      <div className="relative">
                        <input
                          type={showFormRiotPassword ? 'text' : 'password'}
                          data-testid="form-riot-login-password"
                          value={formRiotPassword}
                          onChange={(e) => setFormRiotPassword(e.target.value)}
                          placeholder="Leave blank to configure later"
                          className="w-full h-8.5 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-lg pl-2.5 pr-8 text-xs text-ms-text placeholder:text-ms-muted focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowFormRiotPassword(!showFormRiotPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-ms-muted hover:text-ms-text"
                        >
                          {showFormRiotPassword ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-ms-bg/80 border border-ms-border/60 text-[11px] text-ms-muted flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    {PLATFORM_DISPLAY_NAMES[formPlatformId]} uses official launcher handoff. MaSwitch stores your profile identity only—never passwords or session tokens.
                  </span>
                </div>
              )}

              {/* Set as Preferred Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer pt-1 select-none">
                <input
                  type="checkbox"
                  data-testid="checkbox-is-preferred"
                  checked={formIsPreferred}
                  onChange={(e) => setFormIsPreferred(e.target.checked)}
                  className="w-4 h-4 rounded border-ms-border bg-ms-bg text-ms-accent focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-xs text-ms-text font-medium">
                  Set as preferred account for {PLATFORM_DISPLAY_NAMES[formPlatformId]}
                </span>
              </label>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-ms-border/80">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="h-9 px-4 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="save-profile-submit-btn"
                  className="h-9 px-5 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white font-bold transition-transform active:scale-95 shadow-md"
                >
                  {editingProfileId ? 'Update Profile' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Launcher Sign-In Handoff Modal */}
      {activeSwitchResult && (
        <div
          data-testid="account-switch-guidance-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-lg rounded-2xl bg-ms-card border border-ms-border shadow-2xl overflow-hidden space-y-4 p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-ms-border/80 pb-3">
              <div className="flex items-center gap-2.5">
                <PlatformLogo
                  platformId={activeSwitchResult.platformId}
                  size={22}
                  colorMode="brand"
                />
                <h3 className="text-base font-bold text-ms-text">
                  Complete Sign-In in Launcher
                </h3>
              </div>
              <button
                type="button"
                data-testid="guidance-close-btn"
                onClick={cancelSwitchWorkflow}
                disabled={isConfirmingSwitch}
                className="w-8 h-8 rounded-lg hover:bg-ms-elevated text-ms-muted hover:text-ms-text flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const targetProfile = accountProfiles.find(
                (p) => p.id === activeSwitchResult.accountId
              );
              const launcherName = LAUNCHER_DISPLAY_NAMES[activeSwitchResult.platformId];
              const requiresSignIn =
                platformCapabilities[activeSwitchResult.platformId]?.requiresManualSignIn !== false;

              return (
                <div className="space-y-4 text-xs">
                  <div className="p-3.5 rounded-xl bg-ms-bg border border-ms-border flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-ms-elevated border border-ms-border flex items-center justify-center font-bold text-ms-accent shrink-0">
                        {targetProfile?.avatarUrl ? (
                          <img
                            src={targetProfile.avatarUrl}
                            alt=""
                            className="w-full h-full rounded-xl object-cover"
                          />
                        ) : (
                          <User className="w-5 h-5 text-ms-accent" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4
                            data-testid="guidance-target-name"
                            className="font-bold text-ms-text text-sm truncate"
                          >
                            {targetProfile?.displayName || 'Target Account'}
                          </h4>
                          {targetProfile?.nickname && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-ms-elevated text-ms-muted border border-ms-border shrink-0">
                              {targetProfile.nickname}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-ms-muted mt-0.5">
                          <span className="font-medium text-ms-text/80">
                            {PLATFORM_DISPLAY_NAMES[activeSwitchResult.platformId]}
                          </span>
                          <span>•</span>
                          <span
                            data-testid="guidance-target-username"
                            className="font-mono text-ms-muted truncate"
                          >
                            {targetProfile?.username || ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <span
                        data-testid="guidance-status-pill"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      >
                        <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                        <span>{requiresSignIn ? 'Sign-In Required' : 'Choose Account in Client'}</span>
                      </span>
                    </div>
                  </div>

                  <p className="text-ms-muted">{activeSwitchResult.message}</p>
                  <ol className="list-decimal space-y-2 rounded-xl border border-ms-border bg-ms-bg p-3 pl-7 text-ms-text/90">
                    {activeSwitchResult.instructions?.map((instruction) => (
                      <li key={instruction}>{instruction}</li>
                    ))}
                  </ol>
                  {!isDemoMode && (
                    <p className="text-ms-muted">
                      If {launcherName} is already open, use its taskbar or tray icon to bring it forward.
                    </p>
                  )}

                  <div className="p-3 rounded-xl bg-ms-bg/80 border border-ms-border/60 text-[11px] text-ms-muted flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      Only {launcherName} handles authentication. This button records your confirmation in MaSwitch.
                    </span>
                  </div>

                  {switchError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-bold">Confirmation Notice</p>
                        <p className="text-[11px] mt-0.5 opacity-90">{switchError}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-ms-border/80">
                    <button
                      type="button"
                      data-testid="guidance-cancel-btn"
                      onClick={cancelSwitchWorkflow}
                      disabled={isConfirmingSwitch}
                      className="h-9 px-4 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text text-xs font-semibold transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      data-testid="guidance-confirm-btn"
                      onClick={() => void confirmAccountSwitch(activeSwitchResult.accountId)}
                      disabled={isConfirmingSwitch}
                      className="h-9 px-5 rounded-xl bg-ms-accent hover:bg-ms-accentHover disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold transition-transform active:scale-95 shadow-md flex items-center gap-1.5"
                    >
                      {isConfirmingSwitch ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving Confirmation...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>I&apos;ve Signed In</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingProfile && (
        <div
          data-testid="delete-profile-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-2xl bg-ms-card border border-ms-border shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-ms-text">
              Delete Profile &ldquo;{deletingProfile.displayName}&rdquo;?
            </h3>
            <p className="text-xs text-ms-muted leading-relaxed">
              This will remove the account profile from MaSwitch and unlink any associated games. Your game files, launcher data, and platform accounts will remain intact.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingProfile(null)}
                className="h-9 px-4 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-delete-btn"
                onClick={() => void handleDeleteConfirmed()}
                className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md"
              >
                Delete Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Riot Secure Credentials Modal (DPAPI) */}
      {credentialModalProfile && (
        <div
          data-testid="riot-credentials-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-2xl bg-ms-card border border-ms-border shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-4 border-b border-ms-border/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Riot Credentials</h3>
                  <p className="text-xs text-ms-muted">
                    {credentialModalProfile.displayName} (
                    {credentialModalProfile.nickname || 'League of Legends — EUW'})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCredentialModalProfile(null)}
                className="p-1 rounded-lg hover:bg-ms-elevated text-ms-muted hover:text-ms-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {credError && (
              <div
                data-testid="riot-cred-error-banner"
                className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{credError}</span>
              </div>
            )}

            {credSuccessMsg && (
              <div
                data-testid="riot-cred-success-banner"
                className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{credSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveCredentials} className="space-y-4 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-ms-text">Account Display Name</label>
                  <button
                    type="button"
                    onClick={() => {
                      const target = credentialModalProfile;
                      setCredentialModalProfile(null);
                      openEditModal(target);
                    }}
                    className="text-[11px] font-semibold text-violet-400 hover:underline"
                  >
                    Edit Profile Details
                  </button>
                </div>
                <input
                  type="text"
                  value={credentialModalProfile.displayName}
                  disabled
                  className="w-full h-9 bg-ms-elevated/50 border border-ms-border/80 rounded-xl px-3 text-xs text-ms-muted cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-semibold text-ms-text mb-1">
                  Riot Login Username
                </label>
                <input
                  type="text"
                  data-testid="input-riot-cred-username"
                  value={credUsername}
                  onChange={(e) => setCredUsername(e.target.value)}
                  placeholder="Your Riot sign-in username"
                  className="w-full h-9 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-xl px-3 text-xs text-ms-text placeholder:text-ms-muted focus:outline-none"
                  required
                />
                <p className="text-[11px] text-ms-muted mt-1">
                  The username you type to log into Riot Client (not your in-game Riot ID).
                </p>
              </div>

              <div>
                <label className="block font-semibold text-ms-text mb-1">Riot Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    data-testid="input-riot-cred-password"
                    value={credPassword}
                    onChange={(e) => setCredPassword(e.target.value)}
                    placeholder={
                      riotCredentialStatuses[credentialModalProfile.id]?.hasSavedCredentials
                        ? 'Enter new password to update'
                        : 'Enter Riot password'
                    }
                    className="w-full h-9 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-xl pl-3 pr-10 text-xs text-ms-text placeholder:text-ms-muted focus:outline-none"
                    required={
                      !riotCredentialStatuses[credentialModalProfile.id]?.hasSavedCredentials
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ms-muted hover:text-ms-text"
                  >
                    {showPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-ms-elevated/40 border border-ms-border/80 text-[11px] text-ms-muted space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Windows DPAPI Protection</span>
                </div>
                <p>
                  Passwords are encrypted with Windows DPAPI (bound to your Windows user account on this machine). MaSwitch never stores plaintext passwords in databases or logs.
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-ms-border/80">
                {riotCredentialStatuses[credentialModalProfile.id]?.hasSavedCredentials ? (
                  <button
                    type="button"
                    data-testid="delete-saved-credentials-btn"
                    onClick={() => void handleDeleteCredentials()}
                    className="h-9 px-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Saved Credentials</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCredentialModalProfile(null)}
                    className="h-9 px-4 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-testid="save-credentials-btn"
                    disabled={isSavingRiotCredentials}
                    className="h-9 px-4 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white font-bold transition-transform active:scale-95 shadow-md flex items-center gap-1.5"
                  >
                    {isSavingRiotCredentials ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {riotCredentialStatuses[credentialModalProfile.id]?.hasSavedCredentials
                        ? 'Update Credentials'
                        : 'Save Credentials'}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Genuine Windows Desktop Login Automation Modal (Preserved Intact) */}
      {loginModalProfile && (
        <div
          data-testid="riot-desktop-login-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
        >
          <div className="w-full max-w-lg rounded-2xl bg-ms-card border border-ms-border shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-4 border-b border-ms-border/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Desktop Login Automation — {loginModalProfile.displayName}
                  </h3>
                  <p className="text-xs text-ms-muted">
                    {loginModalProfile.nickname || 'League of Legends — EUW'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseLoginModal}
                className="p-1 rounded-lg hover:bg-ms-elevated text-ms-muted hover:text-ms-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loginError && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Automation Error</p>
                  <p className="text-[11px] opacity-90">{loginError}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-semibold text-ms-muted">
              <div
                className={`p-1.5 rounded-lg border transition-colors ${
                  riotLoginAutomationProgress
                    ? 'bg-ms-accent/20 border-ms-accent text-white'
                    : 'bg-ms-elevated/40 border-ms-border'
                }`}
              >
                1. Client
              </div>
              <div
                className={`p-1.5 rounded-lg border transition-colors ${
                  riotLoginAutomationProgress &&
                  [
                    'waiting-for-window',
                    'connecting-client',
                    'verifying-window',
                    'finding-fields',
                    'entering-credentials',
                    'waiting-for-user',
                    'success',
                  ].includes(riotLoginAutomationProgress.status)
                    ? 'bg-ms-accent/20 border-ms-accent text-white'
                    : 'bg-ms-elevated/40 border-ms-border'
                }`}
              >
                2. Window
              </div>
              <div
                className={`p-1.5 rounded-lg border transition-colors ${
                  riotLoginAutomationProgress &&
                  [
                    'finding-fields',
                    'entering-credentials',
                    'waiting-for-user',
                    'success',
                  ].includes(riotLoginAutomationProgress.status)
                    ? 'bg-ms-accent/20 border-ms-accent text-white'
                    : 'bg-ms-elevated/40 border-ms-border'
                }`}
              >
                3. UI Automation
              </div>
              <div
                className={`p-1.5 rounded-lg border transition-colors ${
                  riotLoginAutomationProgress &&
                  ['waiting-for-user', 'success'].includes(riotLoginAutomationProgress.status)
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-ms-elevated/40 border-ms-border'
                }`}
              >
                4. Verify / MFA
              </div>
            </div>

            {!riotLoginAutomationProgress && (
              <div className="space-y-4 text-xs text-ms-muted">
                {isCheckingClient ? (
                  <div className="py-8 flex flex-col items-center justify-center gap-3 text-ms-muted">
                    <Loader2 className="w-7 h-7 animate-spin text-ms-accent" />
                    <span>Detecting official Riot Client status...</span>
                  </div>
                ) : isClientRunning ? (
                  <div className="p-4 rounded-xl bg-ms-elevated/50 border border-ms-border space-y-2">
                    <div className="flex items-center gap-2 font-bold text-ms-text">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Official Riot Client is Running</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-ms-muted">
                      MaSwitch will focus the official Riot Client login window, locate the username and password fields using Windows UI Automation, and automatically enter credentials for{' '}
                      <strong>{loginModalProfile.displayName}</strong>.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-ms-elevated/50 border border-ms-border space-y-2">
                    <div className="flex items-center gap-2 font-bold text-ms-text">
                      <ShieldCheck className="w-4 h-4 text-ms-accent" />
                      <span>Ready to Launch Official Riot Client</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-ms-muted">
                      Riot Client is not currently running. Would you like MaSwitch to launch the official Riot Client and automatically enter your credentials?
                    </p>
                  </div>
                )}

                <div className="p-3.5 rounded-xl bg-ms-elevated/30 border border-ms-border/70 text-[11px] text-ms-muted space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-ms-text">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Direct Desktop Automation Security Guarantee</span>
                  </div>
                  <p>
                    Credentials are streamed directly to the native Windows UI Automation engine via encrypted memory. MaSwitch never uses clipboard copy/paste, never injects code into Riot Client, and never bypasses Riot authentication.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-ms-elevated/40 border border-ms-border flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-ms-text block">
                      Auto-Press Login Button
                    </span>
                    <span className="text-[11px] text-ms-muted block">
                      Automatically submit credentials (press Enter / click Sign In) after filling.
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      data-testid="toggle-riot-auto-submit-modal"
                      checked={riotAutoSubmitLogin}
                      onChange={(e) =>
                        void updateSettings({ riotAutoSubmitLogin: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-ms-bg peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-ms-accent border border-ms-border"></div>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-ms-border/80">
                  <button
                    type="button"
                    onClick={handleCloseLoginModal}
                    className="h-9 px-4 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-testid="proceed-riot-login-btn"
                    disabled={isCheckingClient}
                    onClick={() => void handleStartDesktopAutomation(!isClientRunning)}
                    className="h-9 px-5 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white font-bold inline-flex items-center gap-2 transition-transform active:scale-95 shadow-md disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>
                      {isClientRunning
                        ? 'Focus Riot Client & Autofill'
                        : 'Launch Riot Client & Autofill'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {riotLoginAutomationProgress && (
              <div className="space-y-4 text-xs">
                <div
                  className={`p-4 rounded-xl border flex items-start gap-3.5 ${
                    riotLoginAutomationProgress.status === 'success' ||
                    riotLoginAutomationProgress.status === 'waiting-for-user'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      : riotLoginAutomationProgress.status === 'failed'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                      : riotLoginAutomationProgress.status === 'cancelled'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      : 'bg-ms-elevated border-ms-border text-ms-text'
                  }`}
                >
                  {isRiotLoginAutomating ? (
                    <Loader2 className="w-5 h-5 animate-spin text-ms-accent shrink-0 mt-0.5" />
                  ) : riotLoginAutomationProgress.status === 'waiting-for-user' ||
                    riotLoginAutomationProgress.status === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : riotLoginAutomationProgress.status === 'cancelled' ? (
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  )}

                  <div className="flex-1 space-y-1">
                    <p className="font-bold text-sm">
                      {riotLoginAutomationProgress.status === 'checking-client' &&
                        'Checking Riot Client...'}
                      {riotLoginAutomationProgress.status === 'launching-client' &&
                        'Starting Riot Client...'}
                      {riotLoginAutomationProgress.status === 'waiting-for-window' &&
                        'Waiting for Login Window...'}
                      {riotLoginAutomationProgress.status === 'connecting-client' &&
                        'Connecting to Riot Client...'}
                      {riotLoginAutomationProgress.status === 'verifying-window' &&
                        'Connecting to Riot Client...'}
                      {riotLoginAutomationProgress.status === 'finding-fields' &&
                        'Locating Login Fields via UI Automation...'}
                      {riotLoginAutomationProgress.status === 'entering-credentials' &&
                        'Entering Credentials...'}
                      {riotLoginAutomationProgress.status === 'waiting-for-user' &&
                        'Waiting for Verification'}
                      {riotLoginAutomationProgress.status === 'success' && 'Completed'}
                      {riotLoginAutomationProgress.status === 'failed' && 'Automation Failed'}
                      {riotLoginAutomationProgress.status === 'cancelled' && 'Automation Cancelled'}
                    </p>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      {riotLoginAutomationProgress.message}
                    </p>
                  </div>
                </div>

                {(riotLoginAutomationProgress.status === 'waiting-for-user' ||
                  riotLoginAutomationProgress.status === 'success') && (
                  <div className="p-3.5 rounded-xl bg-ms-elevated/40 border border-ms-border space-y-2 text-ms-muted text-[11px]">
                    <div className="flex items-center gap-2 font-semibold text-ms-text">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Complete Login in Riot Client</span>
                    </div>
                    <p className="leading-relaxed">
                      Credentials have been automatically filled into the official window without copying or pasting. If Riot Client asks for a CAPTCHA or two-factor authentication code, please complete it directly in the client.
                    </p>
                    {riotLoginAutomationProgress.methodUsed && (
                      <p className="text-[10px] text-ms-muted/70 font-mono">
                        Automation method: {riotLoginAutomationProgress.methodUsed}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-ms-border/80">
                  <div className="text-[11px] text-ms-muted">
                    {isRiotLoginAutomating && 'Working in background...'}
                  </div>

                  <div className="flex items-center gap-3">
                    {isRiotLoginAutomating && (
                      <button
                        type="button"
                        data-testid="cancel-riot-automation-btn"
                        onClick={() => void handleCancelDesktopAutomation()}
                        className="h-9 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-semibold transition-colors"
                      >
                        Cancel Automation
                      </button>
                    )}

                    {!isRiotLoginAutomating &&
                      riotLoginAutomationProgress.status === 'failed' && (
                        <>
                          <button
                            type="button"
                            onClick={handleCloseLoginModal}
                            className="h-9 px-4 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text font-semibold"
                          >
                            Close
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleStartDesktopAutomation(true)}
                            className="h-9 px-5 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white font-bold"
                          >
                            Retry Automation
                          </button>
                        </>
                      )}

                    {!isRiotLoginAutomating &&
                      (riotLoginAutomationProgress.status === 'waiting-for-user' ||
                        riotLoginAutomationProgress.status === 'success' ||
                        riotLoginAutomationProgress.status === 'cancelled') && (
                        <button
                          type="button"
                          data-testid="confirm-riot-automation-done-btn"
                          onClick={handleCloseLoginModal}
                          className="h-9 px-6 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white font-bold shadow-md transition-transform active:scale-95"
                        >
                          Confirm & Close
                        </button>
                      )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
