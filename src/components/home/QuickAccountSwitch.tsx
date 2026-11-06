import React, { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { PlatformLogo } from '../platforms/PlatformLogo';
import {
  accountPrimaryLabel,
  lolRegionLine,
  valorantRegionLine,
} from '../../shared/riot/riotAccountIdentity';

/**
 * Starts the existing account switch. It does not decide which Riot account is
 * logged in; MaSwitch only knows which profile it last selected.
 */
export const QuickAccountSwitch: React.FC = () => {
  const profiles = useAppStore((s) => s.accountProfiles);
  const credentialStatuses = useAppStore((s) => s.riotCredentialStatuses);
  const isSwitching = useAppStore((s) => s.isSwitchingAccount);
  const switchError = useAppStore((s) => s.switchError);
  const switchAccount = useAppStore((s) => s.switchAccount);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const [notice, setNotice] = useState<string | null>(null);

  const riotProfiles = profiles.filter((profile) => profile.platformId === 'riot');
  const selected = riotProfiles.find((profile) => profile.isLastSelected) ?? null;
  const others = riotProfiles.filter((profile) => profile.id !== selected?.id);

  const choose = async (accountId: string) => {
    const status = credentialStatuses[accountId];
    if (!status?.hasSavedCredentials) {
      setNotice('This account has no saved login. Set up credentials before switching.');
      return;
    }
    setNotice(null);
    const result = await switchAccount(accountId);
    if (!result.success) {
      setNotice(result.message);
    }
  };

  return (
    <section
      data-testid="quick-account-switch"
      className="rounded-2xl border border-ms-border bg-ms-card px-4 py-3.5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <PlatformLogo platformId="riot" size={18} colorMode="brand" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-ms-text">Quick Account Switch</h2>
            <p className="text-[11px] text-ms-muted">Riot Games</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActiveSection('accounts')}
          className="text-[11px] font-semibold text-violet-300 hover:underline shrink-0"
        >
          Manage accounts
        </button>
      </div>

      {riotProfiles.length === 0 ? (
        <p className="mt-3 text-xs text-ms-muted">No Riot accounts yet. Add one from Accounts.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {selected && (
            <div data-testid="quick-switch-selected" className="rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300">Selected account</p>
              <p className="text-sm font-bold text-ms-text truncate">{accountPrimaryLabel(selected)}</p>
              <p className="text-[11px] text-ms-muted truncate">
                {lolRegionLine(selected.lolRegion ?? null, selected.lolRegionSource ?? null)}
              </p>
              <p className="text-[11px] text-ms-muted truncate">
                {valorantRegionLine(selected.valorantRegion ?? null, selected.valorantRegionSource ?? null)}
              </p>
            </div>
          )}

          {others.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {others.map((profile) => {
                const ready = Boolean(credentialStatuses[profile.id]?.hasSavedCredentials);
                return (
                  <button
                    key={profile.id}
                    type="button"
                    data-testid={`quick-switch-${profile.id}`}
                    disabled={isSwitching}
                    onClick={() => void choose(profile.id)}
                    className="rounded-xl border border-ms-border bg-ms-bg px-3 py-2 text-left hover:border-violet-500/40 disabled:opacity-60"
                  >
                    <span className="block text-xs font-bold text-ms-text truncate">{accountPrimaryLabel(profile)}</span>
                    <span className="block text-[11px] text-ms-muted truncate">
                      {profile.lolRegion ? `LoL ${profile.lolRegion}` : 'LoL region not detected'}
                      {' · '}
                      {profile.valorantRegionSource === 'riot-client' || profile.valorantRegionSource === 'user'
                        ? `VALORANT ${profile.valorantRegion}`
                        : 'VALORANT EMEA (default)'}
                    </span>
                    <span className={`block text-[10px] font-semibold ${ready ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {ready ? 'Ready' : 'Credentials needed'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {isSwitching && (
            <p className="text-[11px] text-ms-muted inline-flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Switching…
            </p>
          )}
          {(notice || switchError) && (
            <p data-testid="quick-switch-notice" className="text-[11px] text-amber-300 inline-flex items-start gap-1.5">
              <KeyRound className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{notice || switchError}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
};
