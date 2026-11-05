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
  Clock,
  Gamepad2,
} from 'lucide-react';
import type {
  AccountProfile,
  CreateAccountProfileInput,
  PlatformLauncherStatus,
  UpdateAccountProfileInput,
} from '../shared/types/account';
import type { PlatformId } from '../shared/types/platform';
import { useAppStore } from '../store/useAppStore';
import { DemoNoticeBanner } from '../components/common/DemoNoticeBanner';
import {
  PlatformLogo,
  PLATFORM_DISPLAY_NAMES,
} from '../components/platforms/PlatformLogo';

/**
 * Platforms displayed in the MaSwitch Accounts navigation.
 * Riot Games is the active account manager in MaSwitch 3.0;
 * other platforms are clearly marked Coming Soon for account management.
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
  const launcherStatuses = useAppStore((s) => s.launcherStatuses);
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
  const refreshLauncherStatuses = useAppStore((s) => s.refreshLauncherStatuses);
  const openPlatformLauncher = useAppStore((s) => s.openPlatformLauncher);

  // Navigation, Search, Filter & Sort State
  // Riot Games is the default selected platform when opening the Accounts page.
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<PlatformId>('riot');
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

  // Add / Edit Riot Profile Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
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

  const openCreateModal = () => {
    setOpenMenuProfileId(null);
    setEditingProfileId(null);
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
    if (profile.platformId !== 'riot') return;
    setOpenMenuProfileId(null);
    setEditingProfileId(profile.id);
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
        if (formRiotPassword) {
          await saveRiotCredentials(
            editingProfileId,
            formRiotLoginUser.trim() || username,
            formRiotPassword
          );
        }
      } else {
        const createPayload: CreateAccountProfileInput = {
          platformId: 'riot',
          displayName,
          username,
          nickname: formNickname.trim() || null,
          notes: formNotes.trim() || null,
          isPreferred: formIsPreferred,
        };
        const created = await createAccountProfile(createPayload);
        if (created && formRiotPassword) {
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

  // Memoized Riot profiles & platform counts (preserving all non-Riot profiles safely in SQLite)
  const riotProfiles = useMemo(
    () => accountProfiles.filter((p) => p.platformId === 'riot'),
    [accountProfiles]
  );

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

  const securityStats = useMemo(() => {
    const configuredRiotCount = riotProfiles.filter(
      (p) => riotCredentialStatuses[p.id]?.hasSavedCredentials
    ).length;
    const missingRiotCount = Math.max(0, riotProfiles.length - configuredRiotCount);
    return {
      totalRiot: riotProfiles.length,
      configuredCount: configuredRiotCount,
      missingCount: missingRiotCount,
    };
  }, [riotProfiles, riotCredentialStatuses]);

  // Memoized Filtered & Sorted Riot Profiles (Zero DB queries on keystroke)
  const filteredAndSortedRiotProfiles = useMemo(() => {
    const filtered = riotProfiles.filter((p) => {
      if (favoritesOnly && !favoriteAccountIds.includes(p.id) && !p.isPreferred) {
        return false;
      }
      if (credentialFilter !== 'all') {
        const hasSaved = Boolean(riotCredentialStatuses[p.id]?.hasSavedCredentials);
        if (credentialFilter === 'configured' && !hasSaved) return false;
        if (credentialFilter === 'missing' && hasSaved) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.displayName.toLowerCase().includes(q);
        const matchesUser = p.username.toLowerCase().includes(q);
        const matchesNick = p.nickname?.toLowerCase().includes(q) ?? false;
        const matchesNotes = p.notes?.toLowerCase().includes(q) ?? false;
        const region = extractAccountRegion(p)?.toLowerCase() ?? '';
        const matchesRegion = region.includes(q);
        return matchesName || matchesUser || matchesNick || matchesNotes || matchesRegion;
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
      // Default: Preferred first, then alphabetical
      if (a.isPreferred && !b.isPreferred) return -1;
      if (!a.isPreferred && b.isPreferred) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [
    riotProfiles,
    favoritesOnly,
    favoriteAccountIds,
    credentialFilter,
    riotCredentialStatuses,
    searchQuery,
    sortBy,
  ]);

  const isRiotTabSelected = selectedPlatformFilter === 'riot';

  return (
    <div
      data-testid="page-accounts"
      className="max-w-7xl mx-auto space-y-6 pb-16"
      onClick={() => {
        if (openMenuProfileId) setOpenMenuProfileId(null);
      }}
    >
      {/* 1. Accounts Page Title, Subtitle & Header Actions */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ms-border/80 pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-extrabold text-ms-text tracking-tight">Accounts</h1>
            <span
              data-testid="total-account-slots-count"
              className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30 tabular-nums"
            >
              {riotProfiles.length} {riotProfiles.length === 1 ? 'account' : 'accounts'}
            </span>
            <span
              data-testid="active-platform-badge"
              className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/25"
            >
              Riot Games Active
            </span>
          </div>
          <p className="text-xs sm:text-sm text-ms-muted">
            Manage and switch your gaming identities
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isRiotTabSelected && (
            <button
              type="button"
              data-testid="riot-section-open-launcher-btn"
              onClick={() => void openPlatformLauncher('riot')}
              className="h-9 px-3.5 rounded-xl bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-text text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-violet-400" />
              <span>Open Riot Client</span>
            </button>
          )}

          <button
            type="button"
            data-testid="refresh-launcher-status-btn"
            onClick={() => void handleRefreshStatuses()}
            disabled={isRefreshingStatuses}
            title="Check Riot Client status"
            className="h-9 px-3.5 rounded-xl bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-text text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshingStatuses ? 'animate-spin text-ms-accent' : ''}`}
            />
            <span>Check Launchers</span>
          </button>

          {isRiotTabSelected && (
            <button
              type="button"
              data-testid="add-account-profile-btn"
              onClick={openCreateModal}
              className="h-9 px-4 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Riot Account</span>
            </button>
          )}
        </div>
      </header>

      {isDemoMode && (
        <DemoNoticeBanner
          title="Demo Mode: Riot Games Account Manager Preview"
          description="Sample Riot Games profiles are displayed. Disable Demo Mode in Settings to manage your real Windows DPAPI encrypted Riot accounts."
        />
      )}

      {/* 2. Compact Platform Navigation (Fits on one row at desktop widths, wraps cleanly on narrow windows) */}
      <nav
        aria-label="Platform Filter"
        className="flex flex-wrap items-center gap-1.5"
      >
        {SUPPORTED_ACCOUNT_PLATFORMS.map((platformId) => {
          const isRiot = platformId === 'riot';
          const active = selectedPlatformFilter === platformId;
          const status = launcherStatuses[platformId] as PlatformLauncherStatus | undefined;
          const isRunning = Boolean(status?.isRunning);

          return (
            <button
              key={platformId}
              type="button"
              data-testid={`accounts-filter-${platformId}`}
              onClick={() => setSelectedPlatformFilter(platformId)}
              className={`h-9 px-2.5 rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
                active
                  ? isRiot
                    ? 'bg-violet-600/25 border border-violet-500/80 text-white shadow-sm'
                    : 'bg-ms-elevated border border-ms-border text-white shadow-sm'
                  : 'bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text'
              }`}
            >
              <span className="relative flex items-center justify-center">
                <PlatformLogo platformId={platformId} size={14} colorMode="brand" />
                {isRiot && isRunning && (
                  <span
                    title="Riot Client Running"
                    className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute -top-0.5 -right-0.5 ring-2 ring-ms-card"
                  />
                )}
              </span>
              <span>{PLATFORM_DISPLAY_NAMES[platformId]}</span>
              {isRiot ? (
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-md tabular-nums ${
                    active
                      ? 'bg-violet-500/30 text-violet-200'
                      : 'bg-ms-elevated text-ms-text/80'
                  }`}
                >
                  {riotProfiles.length}
                </span>
              ) : (
                <span
                  data-testid={`coming-soon-badge-${platformId}`}
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-ms-elevated/80 text-ms-muted border border-ms-border/70"
                >
                  Soon
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 3. Active Riot Games View vs Non-Riot Coming Soon View */}
      {!isRiotTabSelected ? (
        /* Coming Soon State for Non-Riot Platforms */
        <div
          data-testid="platform-coming-soon-state"
          className="rounded-2xl bg-ms-card border border-ms-border p-8 sm:p-10 text-center max-w-2xl mx-auto my-2 space-y-5 shadow-card"
        >
          <div className="relative w-14 h-14 rounded-2xl bg-ms-elevated border border-ms-border flex items-center justify-center mx-auto">
            <PlatformLogo platformId={selectedPlatformFilter} size={32} colorMode="brand" />
            <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-lg bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-300">
              <Clock className="w-3.5 h-3.5" />
            </span>
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-violet-500/15 text-violet-300 border border-violet-500/30">
              <Clock className="w-3 h-3" />
              <span>Coming Soon</span>
            </div>

            <h2
              data-testid="coming-soon-platform-title"
              className="text-xl font-extrabold text-ms-text tracking-tight"
            >
              {PLATFORM_DISPLAY_NAMES[selectedPlatformFilter]} Account Management
            </h2>

            <p
              data-testid="coming-soon-platform-description"
              className="text-xs sm:text-sm text-ms-muted max-w-md mx-auto leading-relaxed"
            >
              Multi-account management for {PLATFORM_DISPLAY_NAMES[selectedPlatformFilter]} is
              planned for a future MaSwitch update.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-lg mx-auto pt-1">
            <div className="p-3.5 rounded-xl bg-ms-bg/80 border border-ms-border/80 space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <Gamepad2 className="w-4 h-4 shrink-0" />
                <span>Game Library Active</span>
              </div>
              <p className="text-[11px] text-ms-muted leading-relaxed">
                {PLATFORM_DISPLAY_NAMES[selectedPlatformFilter]} game discovery, direct launching,
                playtime tracking, and game news remain fully active in MaSwitch.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-ms-bg/80 border border-ms-border/80 space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-violet-300">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Data Safely Preserved</span>
              </div>
              <p className="text-[11px] text-ms-muted leading-relaxed">
                {(platformAccountCounts[selectedPlatformFilter] ?? 0) > 0
                  ? `${platformAccountCounts[selectedPlatformFilter]} saved ${PLATFORM_DISPLAY_NAMES[selectedPlatformFilter]} profile(s) are safely preserved in your local database for future updates.`
                  : 'Riot Games account management with Windows DPAPI encryption and automatic login is available right now.'}
              </p>
            </div>
          </div>

          <div className="pt-1">
            <button
              type="button"
              data-testid="return-to-riot-btn"
              onClick={() => setSelectedPlatformFilter('riot')}
              className="h-9 px-4 rounded-xl bg-ms-elevated hover:bg-ms-border border border-ms-border text-ms-text text-xs font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <PlatformLogo platformId="riot" size={14} colorMode="brand" />
              <span>Return to Riot Games Accounts</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Search, Filter & Sort Toolbar for Riot Games */}
          {riotProfiles.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-ms-card/70 border border-ms-border/80 rounded-2xl p-3">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-ms-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  data-testid="accounts-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Riot accounts by display name, username, or region..."
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
                <button
                  type="button"
                  data-testid="accounts-filter-favorites"
                  onClick={() => setFavoritesOnly(!favoritesOnly)}
                  className={`h-9 px-3 rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 border ${
                    favoritesOnly
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                      : 'bg-ms-bg hover:bg-ms-elevated border-ms-border text-ms-muted hover:text-ms-text'
                  }`}
                >
                  <Star
                    className={`w-3.5 h-3.5 ${favoritesOnly ? 'fill-amber-400 text-amber-400' : ''}`}
                  />
                  <span>Preferred</span>
                </button>

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
                    <option value="missing">Setup Required</option>
                  </select>
                </div>

                <div className="relative inline-flex items-center">
                  <ArrowUpDown className="w-3.5 h-3.5 text-ms-muted absolute left-3 pointer-events-none" />
                  <select
                    data-testid="accounts-sort-select"
                    aria-label="Sort accounts"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as AccountSortMode)}
                    className="h-9 pl-8 pr-7 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-xs font-semibold text-ms-text focus:outline-none focus:border-ms-accent cursor-pointer"
                  >
                    <option value="platform">Sort: Default</option>
                    <option value="name">Sort: Name (A–Z)</option>
                    <option value="recent">Sort: Recently Used</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {riotCredentialError && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs">
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

          {/* 3. Riot Account Cards Grid OR Single Compact Empty State */}
          {filteredAndSortedRiotProfiles.length === 0 ? (
            <div
              data-testid="accounts-empty-state"
              className="rounded-2xl bg-ms-card border border-ms-border p-10 text-center max-w-xl mx-auto my-2 space-y-4 shadow-card"
            >
              <div className="w-12 h-12 rounded-2xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center mx-auto">
                <PlatformLogo platformId="riot" size={26} colorMode="brand" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-base font-bold text-ms-text">
                  {searchQuery || favoritesOnly || credentialFilter !== 'all'
                    ? 'No matching Riot accounts found'
                    : 'No Riot Games accounts yet.'}
                </h2>
                <p className="text-xs text-ms-muted max-w-md mx-auto leading-relaxed">
                  {searchQuery || favoritesOnly || credentialFilter !== 'all'
                    ? 'Try clearing your search query or adjusting the active filters.'
                    : 'Add your Riot Games accounts to enable one-click Windows DPAPI encrypted desktop login automation.'}
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
                  onClick={openCreateModal}
                  className="h-9 px-4 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Riot Games Account</span>
                </button>
              </div>
            </div>
          ) : (
            <div
              data-testid="accounts-card-grid"
              className={`grid grid-cols-1 md:grid-cols-2 ${
                filteredAndSortedRiotProfiles.length >= 3 ? '2xl:grid-cols-3' : ''
              } gap-5`}
            >
              {filteredAndSortedRiotProfiles.map((profile) => {
                const credStatus = riotCredentialStatuses[profile.id];
                const hasCredentials = Boolean(credStatus?.hasSavedCredentials);
                const region = extractAccountRegion(profile);
                const isMenuOpen = openMenuProfileId === profile.id;

                const isThisRiotAutomating =
                  isRiotLoginAutomating && loginModalProfile?.id === profile.id;
                const isThisRiotWaitingMfa =
                  loginModalProfile?.id === profile.id &&
                  riotLoginAutomationProgress?.status === 'waiting-for-user';

                return (
                  <article
                    key={profile.id}
                    data-testid={`account-card-${profile.id}`}
                    className={`group relative rounded-2xl bg-ms-card border transition-colors p-5 flex flex-col justify-between gap-4 shadow-card ${
                      profile.isPreferred
                        ? 'border-violet-500/45 hover:border-violet-500/70'
                        : 'border-ms-border hover:border-ms-border/90'
                    }`}
                  >
                    {/* Card Header & Status */}
                    <div className="space-y-3.5">
                      {/* Header: Riot Icon/Avatar, Display Name, Username, Region, Compact Overflow Menu */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3.5 min-w-0 flex-1">
                          <div className="relative w-11 h-11 rounded-xl bg-ms-elevated border border-ms-border flex items-center justify-center shrink-0">
                            {profile.avatarUrl ? (
                              <img
                                src={profile.avatarUrl}
                                alt={profile.displayName}
                                className="w-full h-full rounded-xl object-cover"
                              />
                            ) : (
                              <PlatformLogo platformId="riot" size={22} colorMode="brand" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <h3
                                data-testid={`riot-display-name-${profile.id}`}
                                className="text-[15px] font-bold text-ms-text truncate"
                                title={profile.displayName}
                              >
                                {profile.displayName}
                              </h3>
                              {region && (
                                <span
                                  data-testid={`account-region-${profile.id}`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/30 text-[10px] font-bold text-violet-300 shrink-0"
                                >
                                  <Globe className="w-2.5 h-2.5" />
                                  {region}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-xs text-ms-muted min-w-0">
                              <span
                                data-testid={`account-username-${profile.id}`}
                                className="font-mono text-ms-muted/90 truncate"
                              >
                                {credStatus?.username || profile.username}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Compact Overflow Menu (Contains Make Preferred & Delete) */}
                        <div
                          className="relative shrink-0"
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
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {isMenuOpen && (
                            <div
                              data-testid={`more-menu-dropdown-${profile.id}`}
                              className="absolute right-0 top-9 z-30 w-48 rounded-xl bg-ms-elevated border border-ms-border shadow-2xl py-1.5 text-xs"
                            >
                              <button
                                type="button"
                                data-testid={`preferred-toggle-${profile.id}`}
                                onClick={() => {
                                  setOpenMenuProfileId(null);
                                  void setPreferredAccount(profile.id);
                                }}
                                className="w-full px-3 py-2 text-left text-ms-text hover:bg-ms-card flex items-center gap-2"
                              >
                                <Star
                                  className={`w-3.5 h-3.5 text-amber-400 ${
                                    profile.isPreferred ? 'fill-amber-400' : ''
                                  }`}
                                />
                                <span>
                                  {profile.isPreferred
                                    ? 'Preferred Account'
                                    : 'Make Preferred'}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditModal(profile)}
                                className="w-full px-3 py-2 text-left text-ms-text hover:bg-ms-card flex items-center gap-2"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-ms-muted" />
                                <span>Edit Account</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openCredentialModal(profile)}
                                className="w-full px-3 py-2 text-left text-ms-text hover:bg-ms-card flex items-center gap-2"
                              >
                                <Key className="w-3.5 h-3.5 text-violet-400" />
                                <span>Set Up Credentials</span>
                              </button>
                              <div className="my-1 border-t border-ms-border/60" />
                              <button
                                type="button"
                                data-testid={`delete-profile-${profile.id}`}
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

                      {/* Status Row: Credentials Saved or Setup Required + Last Selected indicator */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          data-testid={`status-badge-credentials-${profile.id}`}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${
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
                            {hasCredentials ? 'Credentials Saved' : 'Setup Required'}
                          </span>
                        </span>

                        {profile.isLastSelected && (
                          <span
                            data-testid={`status-badge-selected-${profile.id}`}
                            className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/25"
                          >
                            Last Selected
                          </span>
                        )}

                        {profile.isPreferred && (
                          <span
                            data-testid={`status-badge-preferred-${profile.id}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30"
                          >
                            <Star className="w-2.5 h-2.5 fill-amber-400" />
                            <span>Preferred</span>
                          </span>
                        )}

                        {isThisRiotAutomating && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            <span>Login in Progress</span>
                          </span>
                        )}

                        {isThisRiotWaitingMfa && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            <span>Verification Required</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions: Full-width Primary Login + Separate Secondary Row */}
                    <div className="pt-3.5 border-t border-ms-border/60 space-y-2.5">
                      <button
                        type="button"
                        data-testid={`riot-login-btn-${profile.id}`}
                        onClick={() => void handleInitiateRiotLogin(profile)}
                        className="w-full h-10 px-4 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors shadow-sm"
                        title="Open official Riot Client and automatically enter credentials"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Login</span>
                      </button>

                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          data-testid={`setup-credentials-btn-${profile.id}`}
                          onClick={() => openCredentialModal(profile)}
                          className={`w-full h-9 px-3 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors border ${
                            hasCredentials
                              ? 'bg-ms-bg hover:bg-ms-elevated border-ms-border text-ms-text'
                              : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-amber-300'
                          }`}
                          title="Configure Windows DPAPI encrypted credentials"
                        >
                          <Key className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Set Up Credentials</span>
                        </button>

                        <button
                          type="button"
                          data-testid={`edit-profile-${profile.id}`}
                          onClick={() => openEditModal(profile)}
                          title="Edit Riot account details"
                          className="w-full h-9 px-3 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-text text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-ms-muted shrink-0" />
                          <span className="truncate">Edit Account</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* 4. Add Riot Account Action */}
          {riotProfiles.length > 0 && (
            <div className="rounded-2xl bg-ms-card/40 border border-dashed border-ms-border/80 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs text-ms-muted">
                <div className="w-8 h-8 rounded-xl bg-ms-elevated border border-ms-border flex items-center justify-center shrink-0">
                  <Plus className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <span className="font-bold text-ms-text block">Add Another Riot Account</span>
                  <span className="text-[11px] text-ms-muted">
                    Store multiple EUW, EUNE, NA, or KR profiles with encrypted Windows DPAPI credentials.
                  </span>
                </div>
              </div>
              <button
                type="button"
                data-testid="add-riot-account-section-btn"
                onClick={openCreateModal}
                className="h-9 px-4 rounded-xl bg-ms-elevated hover:bg-ms-border border border-ms-border text-ms-text text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-violet-400" />
                <span>Add Riot Account</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* 5. Compact Security Overview (Visually Secondary, Single Unified Section) */}
      <section
        data-testid="security-overview-panel"
        aria-label="Security Overview"
        className="rounded-2xl bg-ms-card/50 border border-ms-border/70 px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-ms-text">Security Overview</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Windows DPAPI Active
              </span>
            </div>
            <p className="text-ms-muted text-[11px] truncate">
              Riot credentials are encrypted with Windows DPAPI bound to your OS user account.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px]">
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

      {/* Add / Edit Riot Profile Modal */}
      {isFormModalOpen && (
        <div
          data-testid="account-profile-form-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-ms-card border border-ms-border shadow-2xl space-y-5 p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-ms-border/80 pb-4">
              <div className="flex items-center gap-2.5">
                <PlatformLogo platformId="riot" size={22} colorMode="brand" />
                <div>
                  <h3 className="text-base font-bold text-ms-text">
                    {editingProfileId ? 'Edit Riot Account Profile' : 'Add Riot Games Account'}
                  </h3>
                  <p className="text-[11px] text-ms-muted">Riot Games Identity</p>
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
              {/* Step 1: Platform indicator (Riot Games Active, others Coming Soon) */}
              {!editingProfileId && (
                <div>
                  <label className="block font-semibold text-ms-text mb-1.5">
                    1. Platform (Riot Games Active • Other Platforms Coming Soon)
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {SUPPORTED_ACCOUNT_PLATFORMS.map((pid) => {
                      const isRiot = pid === 'riot';
                      return (
                        <button
                          key={pid}
                          type="button"
                          disabled={!isRiot}
                          data-testid={`form-platform-${pid}`}
                          className={`p-2 rounded-xl border text-center flex flex-col items-center gap-1 transition-all ${
                            isRiot
                              ? 'bg-violet-500/20 border-violet-500 text-white shadow-sm'
                              : 'bg-ms-bg/50 border-ms-border/50 text-ms-muted/50 cursor-not-allowed opacity-60'
                          }`}
                        >
                          <PlatformLogo platformId={pid} size={18} colorMode="brand" />
                          <span className="text-[10px] font-semibold truncate w-full">
                            {PLATFORM_DISPLAY_NAMES[pid]}
                          </span>
                          <span
                            className={`text-[9px] font-bold uppercase px-1 rounded ${
                              isRiot
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-ms-elevated text-ms-muted'
                            }`}
                          >
                            {isRiot ? 'Active' : 'Soon'}
                          </span>
                        </button>
                      );
                    })}
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
                  placeholder="e.g. LOL EUW — Melynelas"
                  className="w-full h-9 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-xl px-3 text-xs text-ms-text placeholder:text-ms-muted focus:outline-none"
                  required
                />
              </div>

              {/* Username / Public Identifier / Riot ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-ms-text mb-1">
                    Riot ID or Username *
                  </label>
                  <input
                    type="text"
                    data-testid="input-username"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="e.g. Melynelas#EUW"
                    className="w-full h-9 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-xl px-3 font-mono text-xs text-ms-text placeholder:text-ms-muted focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-ms-text mb-1">Region / Game Tag</label>
                  <input
                    type="text"
                    data-testid="input-nickname"
                    value={formNickname}
                    onChange={(e) => setFormNickname(e.target.value)}
                    placeholder="e.g. League of Legends — EUW"
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

              {/* Optional DPAPI Credentials Section for Riot Games */}
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
                  Set as preferred account for Riot Games
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
              This will remove the account profile from MaSwitch and unlink any associated games.
              Your game files, launcher data, and platform accounts will remain intact.
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
                  Passwords are encrypted with Windows DPAPI (bound to your Windows user account on
                  this machine). MaSwitch never stores plaintext passwords in databases or logs.
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
                      MaSwitch will focus the official Riot Client login window, locate the username
                      and password fields using Windows UI Automation, and automatically enter
                      credentials for <strong>{loginModalProfile.displayName}</strong>.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-ms-elevated/50 border border-ms-border space-y-2">
                    <div className="flex items-center gap-2 font-bold text-ms-text">
                      <ShieldCheck className="w-4 h-4 text-ms-accent" />
                      <span>Ready to Launch Official Riot Client</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-ms-muted">
                      Riot Client is not currently running. Would you like MaSwitch to launch the
                      official Riot Client and automatically enter your credentials?
                    </p>
                  </div>
                )}

                <div className="p-3.5 rounded-xl bg-ms-elevated/30 border border-ms-border/70 text-[11px] text-ms-muted space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-ms-text">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Direct Desktop Automation Security Guarantee</span>
                  </div>
                  <p>
                    Credentials are streamed directly to the native Windows UI Automation engine via
                    encrypted memory. MaSwitch never uses clipboard copy/paste, never injects code
                    into Riot Client, and never bypasses Riot authentication.
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
                      Credentials have been automatically filled into the official window without
                      copying or pasting. If Riot Client asks for a CAPTCHA or two-factor
                      authentication code, please complete it directly in the client.
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
