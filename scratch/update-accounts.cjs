const fs = require('fs');
const path = require('path');

const targetFile = path.resolve('src/pages/AccountsPage.tsx');
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Replace the Riot header panel
const oldPanelStart = '{/* Riot Games Focused Account Switcher Panel */}';
const oldPanelEnd = '{/* Profiles List */}';

const newPanel = `{/* Riot Games Platform Status & Guidance Panel */}
              {group.platformId === 'riot' && group.profiles.length > 0 && (
                <div
                  data-testid="riot-account-status-panel"
                  className="px-6 py-3.5 bg-gradient-to-r from-rose-950/20 via-ms-card to-ms-card border-b border-ms-border/80 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-4 text-ms-muted">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-ms-muted/70 block">
                          Vault Security
                        </span>
                        <span className="font-semibold text-emerald-400 inline-flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          Windows DPAPI Encrypted
                        </span>
                      </div>
                      <div className="w-px h-6 bg-ms-border/80 hidden sm:block" />
                      <div>
                        <span className="text-[10px] uppercase font-bold text-ms-muted/70 block">
                          Saved Credentials
                        </span>
                        <span className="font-bold text-white">
                          {group.profiles.filter((p) => riotCredentialStatuses[p.id]?.hasSavedCredentials).length} of {group.profiles.length} Profiles Configured
                        </span>
                      </div>
                      <div className="w-px h-6 bg-ms-border/80 hidden sm:block" />
                      <div>
                        <span className="text-[10px] uppercase font-bold text-ms-muted/70 block">
                          Official Riot Client
                        </span>
                        <span className="font-medium text-cyan-300">
                          Official Launcher Handoff • Safe Manual Login Helper
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid="riot-section-open-launcher-btn"
                        onClick={() => void openPlatformLauncher('riot')}
                        className="h-8 px-3 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Riot Client</span>
                      </button>
                    </div>
                  </div>

                  {riotCredentialError && (
                    <div className="mt-2.5 flex items-center justify-between gap-3 p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs">
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
              )}

              `;

const panelStartIndex = content.indexOf(oldPanelStart);
const panelEndIndex = content.indexOf(oldPanelEnd);

if (panelStartIndex === -1 || panelEndIndex === -1) {
  console.error('Failed to locate panel boundaries:', { panelStartIndex, panelEndIndex });
  process.exit(1);
}

content = content.slice(0, panelStartIndex) + newPanel + content.slice(panelEndIndex);
console.log('Panel replaced successfully.');

fs.writeFileSync(targetFile, content, 'utf8');

