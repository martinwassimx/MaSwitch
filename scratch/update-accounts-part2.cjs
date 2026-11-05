const fs = require('fs');
const path = require('path');

const targetFile = path.resolve('src/pages/AccountsPage.tsx');
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Replace the Card Content & Actions for Riot
// We find where the card content begins:
const cardStartTarget = '                    const isRiot = group.platformId === \'riot\';';
const cardEndTarget = '{/* Add / Edit Profile Modal */}';

const cardStartIndex = content.indexOf(cardStartTarget);
const cardEndIndex = content.indexOf(cardEndTarget);

if (cardStartIndex === -1 || cardEndIndex === -1) {
  console.error('Failed to locate card boundaries:', { cardStartIndex, cardEndIndex });
  process.exit(1);
}

const newCardAndModals = `                    const isRiot = group.platformId === 'riot';
                    const credStatus = isRiot ? riotCredentialStatuses[profile.id] : undefined;
                    const hasCredentials = Boolean(credStatus?.hasSavedCredentials);

                    return (
                      <div
                        key={profile.id}
                        data-testid={\`account-card-\${profile.id}\`}
                        className="px-6 py-4 flex flex-wrap md:flex-nowrap items-center justify-between gap-4 hover:bg-ms-elevated/30 transition-colors"
                      >
                        {/* Profile Info */}
                        <div className="flex items-start gap-4 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-xl bg-ms-elevated border border-ms-border flex items-center justify-center shrink-0 text-ms-muted mt-0.5">
                            {profile.avatarUrl ? (
                              <img
                                src={profile.avatarUrl}
                                alt={profile.displayName}
                                className="w-full h-full rounded-xl object-cover"
                              />
                            ) : (
                              <User className="w-5 h-5 text-ms-accent" />
                            )}
                          </div>

                          {isRiot ? (
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span data-testid={\`riot-display-name-\${profile.id}\`} className="text-sm font-bold text-ms-text truncate">
                                  {profile.displayName}
                                </span>

                                <span
                                  data-testid={\`status-badge-credentials-\${profile.id}\`}
                                  className={\`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border \${
                                    hasCredentials
                                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                      : 'bg-amber-500/10 text-amber-300/80 border border-amber-500/20'
                                  }\`}
                                >
                                  <span className={\`w-1.5 h-1.5 rounded-full \${hasCredentials ? 'bg-emerald-400' : 'bg-amber-400'}\`} />
                                  <span>Credentials: {hasCredentials ? 'Saved' : 'Not Saved'}</span>
                                </span>

                                {profile.isPreferred && (
                                  <span
                                    data-testid={\`status-badge-preferred-\${profile.id}\`}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                  >
                                    <Star className="w-2.5 h-2.5 fill-amber-400" />
                                    <span>Preferred Profile</span>
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-xs text-ms-muted">
                                <span className="font-medium text-ms-text/90">
                                  {profile.nickname || (profile.notes && profile.notes.includes('League') ? profile.notes : 'League of Legends — EUW')}
                                </span>
                                <span>•</span>
                                <span className="font-mono text-ms-muted/80">User: {profile.username}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-ms-text truncate">
                                  {profile.displayName}
                                </span>

                                <span className="text-xs font-mono px-2 py-0.5 rounded bg-ms-bg border border-ms-border/80 text-ms-muted truncate">
                                  {profile.username}
                                </span>

                                {profile.nickname && (
                                  <span className="text-xs text-ms-muted italic">
                                    ({profile.nickname})
                                  </span>
                                )}

                                {verified && (
                                  <span
                                    data-testid={\`status-badge-verified-\${profile.id}\`}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Verified Active Account</span>
                                  </span>
                                )}

                                {confirmed && (
                                  <span
                                    data-testid={\`status-badge-confirmed-\${profile.id}\`}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>User-Confirmed Profile</span>
                                  </span>
                                )}

                                {profile.isLastSelected && (
                                  <span data-testid={\`status-badge-selected-\${profile.id}\`} className="text-[11px] font-bold text-cyan-300">
                                    Last Selected Profile
                                  </span>
                                )}

                                {!verified && (
                                  <span className="text-[11px] text-ms-muted">
                                    {pendingSwitchAccountId === profile.id && activeSwitchResult
                                      ? group.capability?.requiresManualSignIn === false ? 'Choose Account in Client' : 'Sign-In Required'
                                      : 'Authentication Unknown'}
                                  </span>
                                )}

                                {profile.isPreferred && (
                                  <span
                                    data-testid={\`status-badge-preferred-\${profile.id}\`}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                  >
                                    <Star className="w-2.5 h-2.5 fill-amber-400" />
                                    <span>Preferred Profile</span>
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-3 text-xs text-ms-muted">
                                {gameCount > 0 && (
                                  <span className="text-violet-300 font-medium">
                                    {gameCount} {gameCount === 1 ? 'game' : 'games'} linked
                                  </span>
                                )}
                                {confirmed && (
                                  <span>
                                    Reported sign-in {new Date(activePlatformProfiles[profile.platformId].confirmedAt).toLocaleDateString()}
                                  </span>
                                )}
                                {profile.notes && (
                                  <span className="truncate max-w-sm text-ms-muted/80">
                                    • {profile.notes}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Preferred Star Toggle */}
                          <button
                            type="button"
                            data-testid={\`preferred-toggle-\${profile.id}\`}
                            onClick={() => void setPreferredAccount(profile.id)}
                            title={profile.isPreferred ? 'Preferred account' : 'Set as preferred account'}
                            className={\`h-8.5 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors \${
                              profile.isPreferred
                                ? 'bg-amber-400/15 border-amber-400/40 text-amber-400'
                                : 'bg-ms-bg hover:bg-ms-elevated border-ms-border text-ms-muted hover:text-ms-text'
                            }\`}
                          >
                            <Star className={\`w-3.5 h-3.5 \${profile.isPreferred ? 'fill-amber-400' : ''}\`} />
                            <span className="hidden sm:inline">
                              {profile.isPreferred ? 'Preferred' : 'Make Preferred'}
                            </span>
                          </button>

                          {isRiot ? (
                            <div className="flex items-center gap-1.5">
                              {/* Login Button */}
                              <button
                                type="button"
                                data-testid={\`riot-login-btn-\${profile.id}\`}
                                onClick={() => void handleInitiateRiotLogin(profile)}
                                className="h-8.5 px-4 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white text-xs font-bold inline-flex items-center gap-1.5 transition-transform active:scale-95 shadow-md"
                                title="Open official Riot Client with saved credentials"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>Login</span>
                              </button>

                              {/* Edit Credentials & Profile Button */}
                              <button
                                type="button"
                                data-testid={\`edit-profile-\${profile.id}\`}
                                onClick={() => openCredentialModal(profile)}
                                className="h-8.5 px-3 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-text text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                                title="Manage saved credentials"
                              >
                                <Key className="w-3.5 h-3.5 text-violet-400" />
                                <span>Edit</span>
                              </button>

                              {/* Delete Profile Button */}
                              <button
                                type="button"
                                data-testid={\`delete-profile-\${profile.id}\`}
                                onClick={() => setDeletingProfile(profile)}
                                title="Delete profile"
                                className="h-8.5 w-8.5 rounded-xl bg-ms-bg hover:bg-rose-500/10 border border-ms-border hover:border-rose-500/30 text-ms-muted hover:text-rose-400 flex items-center justify-center transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                data-testid={profile.isLastSelected ? \`sign-in-again-btn-\${profile.id}\` : \`switch-btn-\${profile.id}\`}
                                onClick={() => void switchAccount(profile.id, Boolean(profile.isLastSelected))}
                                disabled={isSwitchingAccount || isConfirmingSwitch}
                                className="h-8.5 px-3.5 rounded-lg bg-ms-accent hover:bg-ms-accentHover disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-transform active:scale-95 shadow-sm"
                              >
                                {isSwitchingAccount && pendingSwitchAccountId === profile.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                )}
                                <span>{profile.isLastSelected ? 'Sign In Again' : 'Select & Open Launcher'}</span>
                              </button>

                              {/* Edit Profile */}
                              <button
                                type="button"
                                data-testid={\`edit-profile-\${profile.id}\`}
                                onClick={() => openEditModal(profile)}
                                title="Edit profile information"
                                className="h-8.5 w-8.5 rounded-lg bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text flex items-center justify-center transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete Profile */}
                              <button
                                type="button"
                                data-testid={\`delete-profile-\${profile.id}\`}
                                onClick={() => setDeletingProfile(profile)}
                                title="Delete profile"
                                className="h-8.5 w-8.5 rounded-lg bg-ms-bg hover:bg-rose-500/10 border border-ms-border hover:border-rose-500/30 text-ms-muted hover:text-rose-400 flex items-center justify-center transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      `;

content = content.slice(0, cardStartIndex) + newCardAndModals + content.slice(cardEndIndex);
console.log('Cards replaced successfully.');

// 2. Replace the old consent modal with the new Credential & Login Modals
const consentModalStart = '{/* Riot Session Enrollment Consent Modal */}';
const consentModalEnd = '    </div>\n  );\n};';

const consentStartIndex = content.indexOf(consentModalStart);
if (consentStartIndex !== -1) {
  const newModals = `{/* Riot Secure Credentials Modal (DPAPI) */}
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
                  <h3 className="text-base font-bold text-white">
                    Riot Credentials
                  </h3>
                  <p className="text-xs text-ms-muted">
                    {credentialModalProfile.displayName} ({credentialModalProfile.nickname || 'League of Legends — EUW'})
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
              <div data-testid="riot-cred-error-banner" className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{credError}</span>
              </div>
            )}

            {credSuccessMsg && (
              <div data-testid="riot-cred-success-banner" className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{credSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveCredentials} className="space-y-4 text-xs">
              {/* Account Display Name (Read-only) */}
              <div>
                <label className="block font-semibold text-ms-text mb-1">
                  Account Display Name
                </label>
                <input
                  type="text"
                  value={credentialModalProfile.displayName}
                  disabled
                  className="w-full h-9 bg-ms-elevated/50 border border-ms-border/80 rounded-xl px-3 text-xs text-ms-muted cursor-not-allowed"
                />
              </div>

              {/* Riot Login Username */}
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
                  The username you type to log into Riot Client (not your in-game summoner name).
                </p>
              </div>

              {/* Riot Password */}
              <div>
                <label className="block font-semibold text-ms-text mb-1">
                  Riot Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    data-testid="input-riot-cred-password"
                    value={credPassword}
                    onChange={(e) => setCredPassword(e.target.value)}
                    placeholder={riotCredentialStatuses[credentialModalProfile.id]?.hasSavedCredentials ? 'Enter new password to update' : 'Enter Riot password'}
                    className="w-full h-9 bg-ms-bg border border-ms-border focus:border-ms-accent rounded-xl pl-3 pr-10 text-xs text-ms-text placeholder:text-ms-muted focus:outline-none"
                    required={!riotCredentialStatuses[credentialModalProfile.id]?.hasSavedCredentials}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ms-muted hover:text-ms-text"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Security DPAPI Assurance */}
              <div className="p-3 rounded-xl bg-ms-elevated/40 border border-ms-border/80 text-[11px] text-ms-muted space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Windows DPAPI Protection</span>
                </div>
                <p>
                  Passwords are encrypted with Windows DPAPI (bound to your Windows user account on this machine). MaSwitch never stores plaintext passwords in databases or logs.
                </p>
              </div>

              {/* Action Buttons */}
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

      {/* Riot Login Workflow & Safe Credential Helper Modal */}
      {loginModalProfile && (
        <div
          data-testid="riot-login-helper-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="w-full max-w-lg rounded-2xl bg-ms-card border border-ms-border shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-4 border-b border-ms-border/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                  <Play className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Riot Client Login — {loginModalProfile.displayName}
                  </h3>
                  <p className="text-xs text-ms-muted">
                    {loginModalProfile.nickname || 'League of Legends — EUW'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLoginModalProfile(null)}
                className="p-1 rounded-lg hover:bg-ms-elevated text-ms-muted hover:text-ms-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            {loginStep === 'check' ? (
              <div className="space-y-4 text-xs text-ms-muted">
                {isCheckingClient ? (
                  <div className="py-6 flex flex-col items-center justify-center gap-2 text-ms-muted">
                    <Loader2 className="w-6 h-6 animate-spin text-ms-accent" />
                    <span>Checking Riot Client status...</span>
                  </div>
                ) : isClientRunning ? (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2 text-amber-200">
                    <div className="flex items-center gap-2 font-bold text-amber-300">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>Riot Client is already open</span>
                    </div>
                    <p className="leading-relaxed text-[11px]">
                      Riot Client is currently running on your PC. To sign into <strong>{loginModalProfile.displayName}</strong>, please make sure to sign out of any active session inside Riot Client.
                    </p>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-ms-elevated/40 border border-ms-border space-y-1 text-ms-muted">
                    <p className="font-semibold text-ms-text">Ready to launch official Riot Client</p>
                    <p className="text-[11px]">
                      MaSwitch will open Riot Client and display your saved credentials with one-click copy helpers so you can easily sign into <strong>{loginModalProfile.displayName}</strong>.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-ms-border/80">
                  <button
                    type="button"
                    onClick={() => setLoginModalProfile(null)}
                    className="h-9 px-4 rounded-xl bg-ms-bg hover:bg-ms-elevated border border-ms-border text-ms-muted hover:text-ms-text font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-testid="proceed-riot-login-btn"
                    onClick={() => void handleProceedRiotLogin()}
                    className="h-9 px-5 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white font-bold inline-flex items-center gap-2 transition-transform active:scale-95 shadow-md"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{isClientRunning ? 'Switch to Riot Client & Show Credentials' : 'Open Riot Client & Show Credentials'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Riot Client opened. Paste credentials into the official login window:</span>
                </div>

                {loginCredentials ? (
                  <div className="space-y-3 bg-ms-bg/80 p-4 rounded-xl border border-ms-border">
                    {/* Username Copy Row */}
                    <div>
                      <span className="text-[11px] font-semibold text-ms-muted block mb-1">
                        Riot Login Username
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={loginCredentials.username}
                          className="flex-1 h-9 bg-ms-elevated border border-ms-border rounded-xl px-3 font-mono text-xs text-ms-text focus:outline-none select-all"
                        />
                        <button
                          type="button"
                          data-testid="copy-riot-username-btn"
                          onClick={() => void handleCopyField(loginCredentials.username, 'username')}
                          className={\`h-9 px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors \${
                            copiedField === 'username'
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                              : 'bg-ms-elevated hover:bg-ms-border border-ms-border text-ms-text'
                          }\`}
                        >
                          {copiedField === 'username' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedField === 'username' ? 'Copied!' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Password Copy Row */}
                    <div>
                      <span className="text-[11px] font-semibold text-ms-muted block mb-1">
                        Riot Password
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type={showLoginPassword ? 'text' : 'password'}
                            readOnly
                            value={loginCredentials.password}
                            className="w-full h-9 bg-ms-elevated border border-ms-border rounded-xl pl-3 pr-9 font-mono text-xs text-ms-text focus:outline-none select-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowLoginPassword(!showLoginPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ms-muted hover:text-ms-text"
                          >
                            {showLoginPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <button
                          type="button"
                          data-testid="copy-riot-password-btn"
                          onClick={() => void handleCopyField(loginCredentials.password, 'password')}
                          className={\`h-9 px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors \${
                            copiedField === 'password'
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                              : 'bg-ms-elevated hover:bg-ms-border border-ms-border text-ms-text'
                          }\`}
                        >
                          {copiedField === 'password' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedField === 'password' ? 'Copied!' : 'Copy'}</span>
                        </button>
                      </div>
                      {copiedField === 'password' && (
                        <p className="text-[10px] text-emerald-400 mt-1">
                          Password copied to clipboard. Auto-clearing in 30 seconds for security.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-ms-elevated border border-ms-border text-xs text-ms-muted space-y-2">
                    <p>No saved password found for this profile.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setLoginModalProfile(null);
                        openCredentialModal(loginModalProfile);
                      }}
                      className="text-xs font-semibold text-ms-accent hover:underline inline-flex items-center gap-1"
                    >
                      <Key className="w-3 h-3" />
                      <span>Save credentials now</span>
                    </button>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-ms-elevated/40 border border-ms-border/70 text-[11px] text-ms-muted space-y-1">
                  <div className="flex items-center gap-1 font-semibold text-ms-text">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Non-Invasive Security Guarantee</span>
                  </div>
                  <p>
                    MaSwitch never injects code into Riot Client or intercepts your authentication. Your login is securely processed by Riot's official client.
                  </p>
                </div>

                <div className="flex items-center justify-end pt-3 border-t border-ms-border/80">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginCredentials(null);
                      setLoginModalProfile(null);
                    }}
                    className="h-9 px-5 rounded-xl bg-ms-accent hover:bg-ms-accentHover text-white font-bold text-xs"
                  >
                    Done / Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
`;

  content = content.slice(0, consentStartIndex) + newModals;
  console.log('Modals replaced successfully.');
} else {
  console.error('Could not find consentModalStart');
}

fs.writeFileSync(targetFile, content, 'utf8');

