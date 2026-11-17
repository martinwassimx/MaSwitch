import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  Star,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Search,
  X,
  Play,
  Loader2,
  ExternalLink,
  KeyRound,
  Eye,
  EyeOff,
  Globe,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  AccountProfile,
  CreateAccountProfileInput,
  UpdateAccountProfileInput,
} from '../shared/types/account';
import {
  LOL_REGIONS,
  VALORANT_REGIONS,
  accountPrimaryLabel,
} from '../shared/riot/riotAccountIdentity';
import { useAppStore } from '../store/useAppStore';
import { DemoNoticeBanner } from '../components/common/DemoNoticeBanner';
import { PlatformLogo } from '../components/platforms/PlatformLogo';

type CredentialFilterMode = 'all' | 'configured' | 'missing';

export const AccountsPage: React.FC = () => {
  const accountProfiles = useAppStore((s) => s.accountProfiles);
  const isDemoMode = useAppStore((s) => s.settings.demoModeEnabled);

  // Riot Credential Vault & Desktop Automation Store Hooks
  const riotCredentialStatuses = useAppStore((s) => s.riotCredentialStatuses);
  const isSavingRiotCredentials = useAppStore((s) => s.isSavingRiotCredentials);
  const riotCredentialError = useAppStore((s) => s.riotCredentialError);
  const loadRiotCredentialStatuses = useAppStore((s) => s.loadRiotCredentialStatuses);
  const saveRiotCredentials = useAppStore((s) => s.saveRiotCredentials);
  const deleteRiotCredentials = useAppStore((s) => s.deleteRiotCredentials);
  const resolveRiotCredentialUsername = useAppStore((s) => s.resolveRiotCredentialUsername);
  const clearRiotCredentialError = useAppStore((s) => s.clearRiotCredentialError);

  const riotLoginAutomationProgress = useAppStore((s) => s.riotLoginAutomationProgress);
  const isRiotLoginAutomating = useAppStore((s) => s.isRiotLoginAutomating);
  const startRiotDesktopLogin = useAppStore((s) => s.startRiotDesktopLogin);
  const setRiotRegions = useAppStore((s) => s.setRiotRegions);
  const cancelRiotDesktopLogin = useAppStore((s) => s.cancelRiotDesktopLogin);
  const clearRiotLoginAutomationProgress = useAppStore((s) => s.clearRiotLoginAutomationProgress);
  const riotAutoSubmitLogin = useAppStore((s) => s.settings.riotAutoSubmitLogin ?? true);
  const updateSettings = useAppStore((s) => s.updateSettings);

  // Vault PIN Lock Store Hooks
  const vaultPinStatus = useAppStore((s) => s.vaultPinStatus);
  const loadVaultPinStatus = useAppStore((s) => s.loadVaultPinStatus);
  const openPinModal = useAppStore((s) => s.openPinModal);
  const lockVaultPin = useAppStore((s) => s.lockVaultPin);

  // Account Profile CRUD Actions
  const createAccountProfile = useAppStore((s) => s.createAccountProfile);
  const updateAccountProfile = useAppStore((s) => s.updateAccountProfile);
  const deleteAccountProfile = useAppStore((s) => s.deleteAccountProfile);
  const setPreferredAccount = useAppStore((s) => s.setPreferredAccount);
  const openPlatformLauncher = useAppStore((s) => s.openPlatformLauncher);

  // Ensure credential statuses & PIN status are always hydrated when opening AccountsPage
  useEffect(() => {
    if (!isDemoMode) {
      void loadRiotCredentialStatuses();
      void loadVaultPinStatus();
    }
  }, [isDemoMode, loadRiotCredentialStatuses, loadVaultPinStatus]);

  const isVaultLocked =
    !isDemoMode && (!vaultPinStatus.isConfigured || !vaultPinStatus.isUnlocked);

  // Search & Filter State
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [credentialFilter, setCredentialFilter] = useState<CredentialFilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const favoriteAccountIds = useAppStore((s) => s.settings.favoriteAccountIds ?? []);

  // Unified Add / Edit Account & Password Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [focusPasswordOnOpen, setFocusPasswordOnOpen] = useState(false);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [formNickname, setFormNickname] = useState('');
  const [formLolRegion, setFormLolRegion] = useState('');
  const [formValorantRegion, setFormValorantRegion] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formIsPreferred, setFormIsPreferred] = useState(false);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const usernameInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  // Active login tracking state
  const [activeLoginProfileId, setActiveLoginProfileId] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Delete Confirmation Modal State
  const [deletingProfile, setDeletingProfile] = useState<AccountProfile | null>(null);

  useEffect(() => {
    if (!isFormModalOpen) return undefined;
    const timer = setTimeout(() => {
      if (focusPasswordOnOpen) {
        passwordInputRef.current?.focus();
      } else {
        usernameInputRef.current?.focus();
      }
    }, 40);
    return () => clearTimeout(timer);
  }, [isFormModalOpen, focusPasswordOnOpen]);

  const requireUnlocked = (action: () => void) => {
    if (isDemoMode) {
      action();
      return;
    }
    if (!vaultPinStatus.isConfigured) {
      openPinModal('setup', action);
      return;
    }
    if (!vaultPinStatus.isUnlocked) {
      openPinModal('unlock', action);
      return;
    }
    action();
  };

  const prefillStoredRiotLoginUser = (profile: AccountProfile) => {
    const status = riotCredentialStatuses[profile.id];
    if (!status?.hasSavedCredentials || status.username) return;
    void resolveRiotCredentialUsername(profile.id).then((storedUsername) => {
      if (storedUsername) {
        setFormUsername((current) =>
          current === profile.username ? storedUsername : current
        );
      }
    });
  };

  const openCreateModal = () => {
    requireUnlocked(() => {
      setEditingProfileId(null);
      setFocusPasswordOnOpen(false);
      setFormUsername('');
      setFormPassword('');
      setShowFormPassword(false);
      setFormNickname('');
      setFormLolRegion('');
      setFormValorantRegion('');
      setFormNotes('');
      setFormIsPreferred(riotProfiles.length === 0);
      setShowAdvancedFields(false);
      setFormError(null);
      setIsFormModalOpen(true);
    });
  };

  const openEditModal = (profile: AccountProfile, focusPassword = false) => {
    if (profile.platformId !== 'riot') return;
    requireUnlocked(() => {
      setEditingProfileId(profile.id);
      setFocusPasswordOnOpen(focusPassword);
      const existingUsername =
        riotCredentialStatuses[profile.id]?.username || profile.username;
      setFormUsername(existingUsername);
      prefillStoredRiotLoginUser(profile);
      setFormPassword('');
      setShowFormPassword(false);
      setFormNickname(profile.nickname ?? '');
      setFormLolRegion(
        profile.lolRegionSource === 'user' || profile.lolRegionSource === 'riot-client'
          ? profile.lolRegion ?? ''
          : ''
      );
      setFormValorantRegion(
        profile.valorantRegionSource === 'user' ||
          profile.valorantRegionSource === 'riot-client'
          ? profile.valorantRegion ?? ''
          : ''
      );
      setFormNotes(profile.notes ?? '');
      setFormIsPreferred(profile.isPreferred);
      setShowAdvancedFields(Boolean(profile.notes || profile.lolRegion));
      setFormError(null);
      setIsFormModalOpen(true);
    });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const username = formUsername.trim();
    const nickname = formNickname.trim();

    if (!username) {
      setFormError('Riot login username is required.');
      return;
    }

    const existingHasSaved = editingProfileId
      ? Boolean(riotCredentialStatuses[editingProfileId]?.hasSavedCredentials)
      : false;

    if (!editingProfileId && !formPassword && !isDemoMode) {
      setFormError('Please enter the Riot password for this account.');
      return;
    }

    if (editingProfileId && focusPasswordOnOpen && !existingHasSaved && !formPassword && !isDemoMode) {
      setFormError('Please enter the Riot password to save.');
      return;
    }

    try {
      if (editingProfileId) {
        const updatePayload: UpdateAccountProfileInput = {
          displayName: nickname || username,
          username,
          nickname: nickname || null,
          notes: formNotes.trim() || null,
          isPreferred: formIsPreferred,
        };
        await updateAccountProfile(editingProfileId, updatePayload);

        const existing = accountProfiles.find((p) => p.id === editingProfileId);
        const currentLol =
          existing?.lolRegionSource === 'user' || existing?.lolRegionSource === 'riot-client'
            ? existing.lolRegion ?? ''
            : '';
        const currentVal =
          existing?.valorantRegionSource === 'user' ||
          existing?.valorantRegionSource === 'riot-client'
            ? existing.valorantRegion ?? ''
            : '';
        if (formLolRegion !== currentLol || formValorantRegion !== currentVal) {
          await setRiotRegions(editingProfileId, {
            lolRegion: formLolRegion || null,
            valorantRegion: formValorantRegion || null,
          });
        }

        if (formPassword) {
          await saveRiotCredentials(editingProfileId, username, formPassword);
        } else if (existingHasSaved && riotCredentialStatuses[editingProfileId]?.username !== username) {
          // Username stays updated on profile; password updates when re-entered
        }
      } else {
        const createPayload: CreateAccountProfileInput = {
          platformId: 'riot',
          displayName: nickname || username,
          username,
          nickname: nickname || null,
          notes: formNotes.trim() || null,
          isPreferred: formIsPreferred,
        };
        const created = await createAccountProfile(createPayload);
        if (created && (formLolRegion || formValorantRegion)) {
          await setRiotRegions(created.id, {
            lolRegion: formLolRegion || null,
            valorantRegion: formValorantRegion || null,
          });
        }
        if (created && formPassword) {
          await saveRiotCredentials(created.id, username, formPassword);
        }
      }

      setFormPassword('');
      setIsFormModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save account.');
    }
  };

  const handleRemoveSavedPassword = async () => {
    if (!editingProfileId) return;
    try {
      setFormError(null);
      await deleteRiotCredentials(editingProfileId);
      setFormPassword('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to remove saved password.');
    }
  };

  const runDirectLogin = async (profile: AccountProfile) => {
    setActiveLoginProfileId(profile.id);
    setLoginError(null);
    clearRiotLoginAutomationProgress();
    try {
      const res = await startRiotDesktopLogin(profile.id, true, riotAutoSubmitLogin);
      if (!res.success && res.error !== 'CANCELLED' && res.error !== 'PIN_LOCKED') {
        setLoginError(res.message);
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login automation failed.');
    }
  };

  const handlePrimaryCardAction = (profile: AccountProfile) => {
    const hasSaved = Boolean(riotCredentialStatuses[profile.id]?.hasSavedCredentials);
    if (!hasSaved) {
      openEditModal(profile, true);
      return;
    }
    requireUnlocked(() => {
      void runDirectLogin(profile);
    });
  };

  const handleDeleteConfirmed = async () => {
    if (!deletingProfile) return;
    const target = deletingProfile;
    requireUnlocked(() => {
      void deleteAccountProfile(target.id).finally(() => {
        setDeletingProfile(null);
      });
    });
  };

  const riotProfiles = useMemo(
    () => accountProfiles.filter((p) => p.platformId === 'riot'),
    [accountProfiles]
  );

  const securityStats = useMemo(() => {
    const configuredCount = riotProfiles.filter(
      (p) => riotCredentialStatuses[p.id]?.hasSavedCredentials
    ).length;
    return {
      totalRiot: riotProfiles.length,
      configuredCount,
      missingCount: Math.max(0, riotProfiles.length - configuredCount),
    };
  }, [riotProfiles, riotCredentialStatuses]);

  const filteredProfiles = useMemo(() => {
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
        const savedUser = riotCredentialStatuses[p.id]?.username?.toLowerCase() ?? '';
        return (
          p.displayName.toLowerCase().includes(q) ||
          (p.nickname?.toLowerCase().includes(q) ?? false) ||
          p.username.toLowerCase().includes(q) ||
          savedUser.includes(q) ||
          (p.riotId?.toLowerCase().includes(q) ?? false) ||
          `${p.lolRegion ?? ''} ${p.valorantRegion ?? ''}`.toLowerCase().includes(q)
        );
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (a.isPreferred && !b.isPreferred) return -1;
      if (!a.isPreferred && b.isPreferred) return 1;
      if (a.isLastSelected && !b.isLastSelected) return -1;
      if (!a.isLastSelected && b.isLastSelected) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [
    riotProfiles,
    favoritesOnly,
    favoriteAccountIds,
    credentialFilter,
    riotCredentialStatuses,
    searchQuery,
  ]);

  const activeLoginProfile = useMemo(
    () =>
      activeLoginProfileId
        ? riotProfiles.find((p) => p.id === activeLoginProfileId) ?? null
        : null,
    [activeLoginProfileId, riotProfiles]
  );

  return (
    <div data-testid="page-accounts" className="max-w-5xl mx-auto space-y-5 pb-16">
      {/* 1. Clean Password-First Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ms-border/80 pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-extrabold text-ms-text tracking-tight">
              Passwords &amp; Accounts
            </h1>
            <span
              data-testid="total-account-slots-count"
              className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30 tabular-nums"
            >
              {riotProfiles.length} {riotProfiles.length === 1 ? 'account' : 'accounts'}
            </span>

            {!isDemoMode && (
              <span
                data-testid="vault-lock-badge"
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  isVaultLocked
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                }`}
              >
                {isVaultLocked ? (
                  <>
                    <Lock className="w-3 h-3" />
                    <span>{vaultPinStatus.isConfigured ? 'PIN Locked' : 'Set PIN Required'}</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3" />
                    <span>Unlocked</span>
                  </>
                )}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-ms-muted">
            Save your Riot login passwords once and sign in with a single click.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isDemoMode && (
            <>
              {!vaultPinStatus.isConfigured ? (
                <button
                  type="button"
                  data-testid="pin-setup-header-btn"
                  onClick={() => openPinModal('setup')}
                  className="h-9 px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Set PIN</span>
                </button>
              ) : isVaultLocked ? (
                <button
                  type="button"
                  data-testid="pin-unlock-header-btn"
                  onClick={() => openPinModal('unlock')}
                  className="h-9 px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Unlock with PIN</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="pin-change-header-btn"
                    onClick={() => openPinModal('change')}
                    className="h-9 px-3 rounded-xl bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Change PIN</span>
                  </button>
                  <button
                    type="button"
                    data-testid="pin-lock-header-btn"
                    onClick={() => void lockVaultPin()}
                    title="Lock saved passwords immediately"
                    className="h-9 px-3 rounded-xl bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-text text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Lock</span>
                  </button>
                </>
              )}
            </>
          )}

          <button
            type="button"
            data-testid="riot-section-open-launcher-btn"
            onClick={() => void openPlatformLauncher('riot')}
            className="h-9 px-3.5 rounded-xl bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-text text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-violet-400" />
            <span>Open Riot Client</span>
          </button>

          <button
            type="button"
            data-testid="add-account-profile-btn"
            onClick={openCreateModal}
            className="h-9 px-4 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Account</span>
          </button>
        </div>
      </header>

      {isDemoMode && (
        <DemoNoticeBanner
          title="Demo Mode Preview"
          description="Sample accounts are displayed. Turn off Demo Mode in Settings to manage your real PIN-protected passwords."
        />
      )}

      {/* Locked Vault Prompt Banner when user skipped startup modal */}
      {isVaultLocked && (
        <div
          data-testid="vault-locked-banner"
          className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/35 flex items-center justify-center text-amber-300 shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-ms-text">
                {vaultPinStatus.isConfigured
                  ? 'Saved passwords are locked'
                  : 'Create a PIN code to protect your passwords'}
              </p>
              <p className="text-[11px] text-ms-muted">
                {vaultPinStatus.isConfigured
                  ? 'Enter your 4–6 digit PIN to sign in, add, or edit passwords.'
                  : 'Set a quick 4–6 digit PIN once. MaSwitch will ask for it each time the app opens.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="banner-unlock-pin-btn"
            onClick={() => openPinModal(vaultPinStatus.isConfigured ? 'unlock' : 'setup')}
            className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Unlock className="w-3.5 h-3.5" />
            <span>{vaultPinStatus.isConfigured ? 'Enter PIN' : 'Create PIN'}</span>
          </button>
        </div>
      )}

      {/* Live 1-Click Login Progress Banner */}
      {(riotLoginAutomationProgress || loginError) && (
        <div
          data-testid="riot-desktop-login-banner"
          className={`rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 text-xs ${
            loginError || riotLoginAutomationProgress?.status === 'failed'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              : riotLoginAutomationProgress?.status === 'success' ||
                riotLoginAutomationProgress?.status === 'waiting-for-user'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              : 'bg-violet-500/10 border-violet-500/30 text-ms-text'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {isRiotLoginAutomating ? (
              <Loader2 className="w-5 h-5 animate-spin text-ms-accent shrink-0" />
            ) : loginError || riotLoginAutomationProgress?.status === 'failed' ? (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">
                {activeLoginProfile
                  ? `${accountPrimaryLabel(activeLoginProfile)} — `
                  : ''}
                {isRiotLoginAutomating
                  ? 'Signing in to Riot Client...'
                  : loginError || riotLoginAutomationProgress?.status === 'failed'
                  ? 'Sign-in could not complete'
                  : 'Credentials entered in Riot Client'}
              </p>
              <p className="text-[11px] opacity-90">
                {loginError ||
                  riotLoginAutomationProgress?.message ||
                  'Complete any verification prompt directly in Riot Client.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isRiotLoginAutomating ? (
              <button
                type="button"
                data-testid="cancel-riot-automation-btn"
                onClick={() => void cancelRiotDesktopLogin()}
                className="h-8 px-3 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/35 text-rose-200 font-semibold"
              >
                Cancel
              </button>
            ) : (
              <>
                {(loginError || riotLoginAutomationProgress?.status === 'failed') &&
                  activeLoginProfile && (
                    <button
                      type="button"
                      onClick={() => void runDirectLogin(activeLoginProfile)}
                      className="h-8 px-3 rounded-lg bg-ms-accent hover:bg-ms-accentHover text-white font-bold"
                    >
                      Retry
                    </button>
                  )}
                <button
                  type="button"
                  data-testid="dismiss-riot-automation-btn"
                  onClick={() => {
                    setLoginError(null);
                    clearRiotLoginAutomationProgress();
                  }}
                  className="h-8 px-3 rounded-lg bg-ms-card hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text font-semibold"
                >
                  Dismiss
                </button>
              </>
            )}
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

      {/* 2. Simple Search & Filter Bar (when 2+ accounts or filter active) */}
      {(riotProfiles.length >= 2 ||
        Boolean(searchQuery) ||
        favoritesOnly ||
        credentialFilter !== 'all') && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-ms-card/70 border border-ms-border/80 rounded-2xl p-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-ms-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              data-testid="accounts-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search accounts by name, username, or region..."
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
                aria-label="Filter by password status"
                value={credentialFilter}
                onChange={(e) => setCredentialFilter(e.target.value as CredentialFilterMode)}
                className="h-9 pl-8 pr-7 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-xs font-semibold text-ms-text focus:outline-none focus:border-ms-accent cursor-pointer"
              >
                <option value="all">All Accounts</option>
                <option value="configured">Password Saved</option>
                <option value="missing">No Password</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* 3. Account & Password Cards OR Clean Empty State */}
      {filteredProfiles.length === 0 ? (
        <div
          data-testid="accounts-empty-state"
          className="rounded-2xl bg-ms-card border border-ms-border p-10 text-center max-w-lg mx-auto my-4 space-y-4 shadow-card"
        >
          <div className="w-12 h-12 rounded-2xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center mx-auto">
            <KeyRound className="w-6 h-6 text-violet-300" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-ms-text">
              {searchQuery || favoritesOnly || credentialFilter !== 'all'
                ? 'No matching accounts'
                : 'No saved passwords yet'}
            </h2>
            <p className="text-xs text-ms-muted max-w-sm mx-auto leading-relaxed">
              {searchQuery || favoritesOnly || credentialFilter !== 'all'
                ? 'Clear your search or filter to see all saved accounts.'
                : 'Add your Riot username and password once to sign in automatically with 1 click.'}
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
              <span>Add Account &amp; Password</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          data-testid="accounts-card-grid"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {filteredProfiles.map((profile) => {
            const credStatus = riotCredentialStatuses[profile.id];
            const hasCredentials = Boolean(credStatus?.hasSavedCredentials);
            const primaryLabel = accountPrimaryLabel(profile);
            const displayedUsername = !isVaultLocked
              ? credStatus?.username || profile.username
              : null;
            const isThisLoggingIn =
              isRiotLoginAutomating && activeLoginProfileId === profile.id;

            return (
              <article
                key={profile.id}
                data-testid={`account-card-${profile.id}`}
                className={`rounded-2xl bg-ms-card border p-5 flex flex-col justify-between gap-4 shadow-card transition-colors ${
                  profile.isPreferred
                    ? 'border-violet-500/45 hover:border-violet-500/70'
                    : 'border-ms-border hover:border-ms-border/90'
                }`}
              >
                <div className="space-y-3">
                  {/* Top Row: Icon, Name, Username, Star */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-11 h-11 rounded-xl bg-ms-elevated border border-ms-border flex items-center justify-center shrink-0">
                        <PlatformLogo platformId="riot" size={22} colorMode="brand" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3
                            data-testid={`riot-display-name-${profile.id}`}
                            className="text-[15px] font-bold text-ms-text truncate"
                            title={primaryLabel}
                          >
                            {primaryLabel}
                          </h3>
                          {profile.lolRegion && (
                            <span
                              data-testid={`account-region-${profile.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/30 text-[10px] font-bold text-violet-300 shrink-0"
                            >
                              <Globe className="w-2.5 h-2.5" />
                              {profile.lolRegion}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ms-muted truncate mt-0.5">
                          {displayedUsername
                            ? `Login: ${displayedUsername}`
                            : hasCredentials && isVaultLocked
                            ? 'Login hidden while PIN locked'
                            : `Login: ${profile.username}`}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      data-testid={`preferred-toggle-${profile.id}`}
                      onClick={() => void setPreferredAccount(profile.id)}
                      title={profile.isPreferred ? 'Preferred account' : 'Set as preferred'}
                      className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                        profile.isPreferred
                          ? 'bg-amber-500/15 border-amber-500/35 text-amber-400'
                          : 'bg-ms-bg hover:bg-ms-elevated border-ms-border text-ms-muted hover:text-ms-text'
                      }`}
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          profile.isPreferred ? 'fill-amber-400 text-amber-400' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {/* Status Pills */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      data-testid={`status-badge-credentials-${profile.id}`}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${
                        hasCredentials
                          ? isVaultLocked
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-300 border-rose-500/25'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          hasCredentials
                            ? isVaultLocked
                              ? 'bg-amber-400'
                              : 'bg-emerald-400'
                            : 'bg-rose-400'
                        }`}
                      />
                      <span>
                        {hasCredentials
                          ? isVaultLocked
                            ? 'Password Saved (Locked)'
                            : 'Password Saved'
                          : 'No Password Set'}
                      </span>
                    </span>

                    {profile.isLastSelected && (
                      <span
                        data-testid={`status-badge-selected-${profile.id}`}
                        className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/25"
                      >
                        Last Used
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions: 1-Click Primary Login + Simple Edit/Delete Row */}
                <div className="pt-3 border-t border-ms-border/60 space-y-2">
                  <button
                    type="button"
                    data-testid={`riot-login-btn-${profile.id}`}
                    disabled={isRiotLoginAutomating}
                    onClick={() => handlePrimaryCardAction(profile)}
                    className={`w-full h-10 px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-60 ${
                      !hasCredentials
                        ? 'bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200'
                        : 'bg-ms-accent hover:bg-ms-accentHover text-white'
                    }`}
                  >
                    {isThisLoggingIn ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Signing In...</span>
                      </>
                    ) : !hasCredentials ? (
                      <>
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Set Password</span>
                      </>
                    ) : isVaultLocked ? (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Unlock &amp; Login</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Login</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid={`setup-credentials-btn-${profile.id}`}
                      onClick={() => openEditModal(profile, true)}
                      className="flex-1 h-9 px-3 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-text text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                      <span className="truncate">Password</span>
                    </button>

                    <button
                      type="button"
                      data-testid={`edit-profile-${profile.id}`}
                      onClick={() => openEditModal(profile, false)}
                      className="flex-1 h-9 px-3 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-text text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-ms-muted shrink-0" />
                      <span className="truncate">Edit</span>
                    </button>

                    <button
                      type="button"
                      data-testid={`delete-profile-${profile.id}`}
                      aria-label={`Delete ${primaryLabel}`}
                      onClick={() => {
                        requireUnlocked(() => setDeletingProfile(profile));
                      }}
                      className="w-9 h-9 rounded-xl bg-ms-bg hover:bg-rose-500/15 border border-ms-border hover:border-rose-500/35 text-ms-muted hover:text-rose-400 flex items-center justify-center shrink-0 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 4. Compact Security Summary Bar */}
      <section
        data-testid="security-overview-panel"
        aria-label="Security Overview"
        className="rounded-2xl bg-ms-card/50 border border-ms-border/70 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-ms-muted text-[11px]">
            Encrypted locally with <strong className="text-ms-text">Windows DPAPI</strong> and protected by your startup PIN code.
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          <span>
            <span className="text-ms-muted">Saved Passwords: </span>
            <strong
              data-testid="security-configured-count"
              className="text-emerald-400 font-bold tabular-nums"
            >
              {securityStats.configuredCount}
            </strong>
          </span>
          {securityStats.missingCount > 0 && (
            <span>
              <span className="text-ms-muted">Missing Password: </span>
              <strong
                data-testid="security-missing-count"
                className="text-amber-300 font-bold tabular-nums"
              >
                {securityStats.missingCount}
              </strong>
            </span>
          )}
        </div>
      </section>

      {/* Unified Simple Add / Edit Account & Password Modal */}
      {isFormModalOpen && (
        <div
          data-testid="account-profile-form-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-ms-card border border-ms-border shadow-2xl space-y-5 p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-ms-border/80 pb-4">
              <div className="flex items-center gap-2.5">
                <PlatformLogo platformId="riot" size={22} colorMode="brand" />
                <div>
                  <h3 className="text-base font-bold text-ms-text">
                    {editingProfileId ? 'Edit Account & Password' : 'Add Riot Account & Password'}
                  </h3>
                  <p className="text-[11px] text-ms-muted">
                    Encrypted locally with Windows DPAPI
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
              {/* 1. Riot Username */}
              <div>
                <label className="block font-semibold text-ms-text mb-1">
                  Riot Login Username
                </label>
                <input
                  ref={usernameInputRef}
                  type="text"
                  data-testid="input-username"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="Username you type in Riot Client"
                  className="w-full h-10 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-xl px-3 text-xs text-ms-text placeholder:text-ms-muted focus:outline-none"
                  required
                />
              </div>

              {/* 2. Riot Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-ms-text">Riot Password</label>
                  {editingProfileId &&
                    riotCredentialStatuses[editingProfileId]?.hasSavedCredentials && (
                      <button
                        type="button"
                        data-testid="delete-saved-credentials-btn"
                        onClick={() => void handleRemoveSavedPassword()}
                        className="text-[11px] font-semibold text-rose-400 hover:underline"
                      >
                        Remove saved password
                      </button>
                    )}
                </div>
                <div className="relative">
                  <input
                    ref={passwordInputRef}
                    type={showFormPassword ? 'text' : 'password'}
                    data-testid="form-riot-login-password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder={
                      editingProfileId &&
                      riotCredentialStatuses[editingProfileId]?.hasSavedCredentials
                        ? 'Leave blank to keep saved password, or type new one'
                        : 'Enter Riot password'
                    }
                    className="w-full h-10 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-xl pl-3 pr-10 text-xs text-ms-text placeholder:text-ms-muted focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label={showFormPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowFormPassword(!showFormPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ms-muted hover:text-ms-text"
                  >
                    {showFormPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* 3. Friendly Display Label */}
              <div>
                <label className="block font-semibold text-ms-text mb-1">
                  Display Label <span className="text-ms-muted font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  data-testid="input-nickname"
                  value={formNickname}
                  onChange={(e) => setFormNickname(e.target.value)}
                  placeholder="e.g. Main EUW, Smurf (uses username if blank)"
                  className="w-full h-10 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-xl px-3 text-xs text-ms-text placeholder:text-ms-muted focus:outline-none"
                />
              </div>

              {/* Optional Collapsible Details */}
              <div className="pt-1">
                <button
                  type="button"
                  data-testid="toggle-more-account-options"
                  onClick={() => setShowAdvancedFields((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-ms-muted hover:text-ms-text"
                >
                  {showAdvancedFields ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  <span>More options (Regions, Notes, Auto-Submit)</span>
                </button>

                {showAdvancedFields && (
                  <div className="mt-3 p-3.5 rounded-xl bg-ms-bg/70 border border-ms-border/80 space-y-3">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-ms-text mb-1">
                          LoL Region
                        </label>
                        <select
                          data-testid="input-lol-region"
                          value={formLolRegion}
                          onChange={(e) => setFormLolRegion(e.target.value)}
                          className="w-full h-9 bg-ms-card border border-ms-border rounded-lg px-2.5 text-xs text-ms-text focus:outline-none"
                        >
                          <option value="">Auto / Unset</option>
                          {LOL_REGIONS.map((region) => (
                            <option key={region.code} value={region.code}>
                              {region.code}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-ms-text mb-1">
                          VALORANT Region
                        </label>
                        <select
                          data-testid="input-valorant-region"
                          value={formValorantRegion}
                          onChange={(e) => setFormValorantRegion(e.target.value)}
                          className="w-full h-9 bg-ms-card border border-ms-border rounded-lg px-2.5 text-xs text-ms-text focus:outline-none"
                        >
                          <option value="">EMEA (default)</option>
                          {VALORANT_REGIONS.map((region) => (
                            <option key={region.code} value={region.code}>
                              {region.code}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-ms-text mb-1">
                        Notes
                      </label>
                      <input
                        type="text"
                        data-testid="input-notes"
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        placeholder="Optional rank or note..."
                        className="w-full h-9 bg-ms-card border border-ms-border rounded-lg px-2.5 text-xs text-ms-text placeholder:text-ms-muted focus:outline-none"
                      />
                    </div>

                    <label className="flex items-center justify-between gap-2 cursor-pointer select-none pt-1">
                      <span className="text-[11px] text-ms-muted">
                        Auto-press Sign In after filling password
                      </span>
                      <input
                        type="checkbox"
                        checked={riotAutoSubmitLogin}
                        onChange={(e) =>
                          void updateSettings({ riotAutoSubmitLogin: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-ms-border bg-ms-card text-ms-accent cursor-pointer"
                      />
                    </label>
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1 select-none">
                <input
                  type="checkbox"
                  data-testid="checkbox-is-preferred"
                  checked={formIsPreferred}
                  onChange={(e) => setFormIsPreferred(e.target.checked)}
                  className="w-4 h-4 rounded border-ms-border bg-ms-bg text-ms-accent cursor-pointer"
                />
                <span className="text-xs text-ms-text font-medium">
                  Set as preferred main account
                </span>
              </label>

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
                  disabled={isSavingRiotCredentials}
                  className="h-9 px-5 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white font-bold transition-transform active:scale-95 shadow-md disabled:opacity-60"
                >
                  {isSavingRiotCredentials
                    ? 'Saving...'
                    : editingProfileId
                    ? 'Save Changes'
                    : 'Save Account'}
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
          <div className="w-full max-w-sm rounded-2xl bg-ms-card border border-ms-border shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-ms-text">
              Delete &ldquo;{accountPrimaryLabel(deletingProfile)}&rdquo;?
            </h3>
            <p className="text-xs text-ms-muted leading-relaxed">
              This removes the saved account and wipes its encrypted password from MaSwitch.
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
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
