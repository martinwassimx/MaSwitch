import React, { useMemo } from 'react';
import {
  Library,
  KeyRound,
  Layers,
  BarChart3,
  Gauge,
  Newspaper,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Lock,
} from 'lucide-react';
import type { NavigationSection } from '../../shared/types/settings';
import { useAppStore } from '../../store/useAppStore';

interface NavItemConfig {
  id: NavigationSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
}

export const Sidebar: React.FC = React.memo(() => {
  const activeSection = useAppStore((s) => s.activeSection);
  const selectedGameId = useAppStore((s) => s.selectedGameId);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const games = useAppStore((s) => s.games);
  const accountProfiles = useAppStore((s) => s.accountProfiles);
  const isDemoMode = useAppStore((s) => s.settings.demoModeEnabled);
  const vaultPinStatus = useAppStore((s) => s.vaultPinStatus);
  const isCollapsed = useAppStore((s) => s.settings.sidebarCollapsed);
  const showSidebarCounts = useAppStore((s) => s.settings.showSidebarCounts);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const featuresManifest = useAppStore((s) => s.featuresManifest);
  const hasUpdate = useAppStore(
    (s) => s.updaterState.status === 'available' || s.updaterState.status === 'downloaded'
  );

  const riotAccountCount = useMemo(
    () => accountProfiles.filter((p) => p.platformId === 'riot').length,
    [accountProfiles]
  );

  const isVaultLocked =
    !isDemoMode && (!vaultPinStatus.isConfigured || !vaultPinStatus.isUnlocked);

  const isPerfEnabled = featuresManifest
    ? Boolean(featuresManifest.features.performanceMonitor?.enabled) ||
      Boolean(featuresManifest.features.memoryManagement?.enabled)
    : true;
  const isNewsEnabled = featuresManifest
    ? Boolean(featuresManifest.features.gameNews?.enabled)
    : true;

  const primaryItems: NavItemConfig[] = useMemo(
    () => [
      { id: 'accounts', label: 'Passwords', icon: KeyRound, count: riotAccountCount },
      { id: 'library', label: 'Games', icon: Library, count: games.length },
    ],
    [riotAccountCount, games.length]
  );

  const secondaryItems: NavItemConfig[] = useMemo(
    () => [
      ...(isPerfEnabled
        ? [{ id: 'performance' as const, label: 'Performance', icon: Gauge }]
        : []),
      ...(isNewsEnabled
        ? [{ id: 'news' as const, label: 'Game News', icon: Newspaper }]
        : []),
      { id: 'statistics', label: 'Statistics', icon: BarChart3 },
      { id: 'platforms', label: 'Platforms', icon: Layers },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
    [isPerfEnabled, isNewsEnabled]
  );

  const renderNavButton = (item: NavItemConfig) => {
    const Icon = item.icon;
    const isActive = activeSection === item.id && selectedGameId === null;

    return (
      <button
        key={item.id}
        type="button"
        data-testid={`nav-${item.id}`}
        onClick={() => setActiveSection(item.id)}
        title={isCollapsed ? item.label : undefined}
        className={`relative w-full flex items-center ${
          isCollapsed ? 'justify-center px-0' : 'justify-between px-3'
        } h-10 rounded-xl text-sm font-medium transition-all ${
          isActive
            ? 'bg-gradient-to-r from-violet-600/20 via-violet-600/10 to-transparent text-white font-semibold shadow-sm'
            : 'text-ms-muted hover:text-ms-text hover:bg-ms-elevated/60'
        }`}
      >
        {isActive && (
          <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-cyan-400 to-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.7)]" />
        )}

        <div className="flex items-center gap-3 min-w-0">
          <Icon
            className={`w-4 h-4 shrink-0 transition-colors ${
              isActive ? 'text-violet-400' : 'text-ms-muted'
            }`}
          />
          {!isCollapsed && <span className="truncate tracking-tight">{item.label}</span>}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {item.id === 'accounts' && isVaultLocked && (
            <Lock
              aria-label="Vault locked"
              className="w-3.5 h-3.5 text-amber-400 shrink-0"
            />
          )}

          {item.id === 'settings' && hasUpdate && (
            isCollapsed ? (
              <span
                title="Update Available"
                className="absolute top-2 right-2 w-2 h-2 rounded-full bg-purple-400 animate-pulse shadow-[0_0_6px_rgba(168,85,247,0.8)]"
              />
            ) : (
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 animate-pulse">
                Update
              </span>
            )
          )}

          {!isCollapsed &&
            showSidebarCounts &&
            item.count !== undefined && (
              <span
                className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded-md border transition-colors ${
                  isActive
                    ? 'bg-violet-500/20 border-violet-500/40 text-violet-200'
                    : 'text-ms-muted/90 bg-ms-card/80 border-ms-border/50'
                }`}
              >
                {item.count}
              </span>
            )}
        </div>
      </button>
    );
  };

  return (
    <aside
      data-testid="app-sidebar"
      className={`${
        isCollapsed ? 'w-16' : 'w-56'
      } bg-ms-sidebar border-r border-ms-border flex flex-col justify-between transition-[width] duration-150 shrink-0 select-none z-20`}
    >
      <div className="p-3 space-y-4 overflow-y-auto">
        <nav aria-label="Main Navigation" className="space-y-1">
          {primaryItems.map(renderNavButton)}
        </nav>

        <div className="pt-3 border-t border-ms-border/70">
          {!isCollapsed && (
            <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-ms-muted/70">
              Tools &amp; More
            </div>
          )}
          <nav aria-label="Secondary Navigation" className="space-y-1">
            {secondaryItems.map(renderNavButton)}
          </nav>
        </div>
      </div>

      {/* Bottom Collapse Action */}
      <div className="p-3 border-t border-ms-border">
        <button
          type="button"
          data-testid="sidebar-collapse-btn"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() =>
            void updateSettings({ sidebarCollapsed: !isCollapsed })
          }
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`w-full h-9 rounded-xl flex items-center ${
            isCollapsed ? 'justify-center px-0' : 'justify-between px-3'
          } text-xs text-ms-muted hover:text-ms-text hover:bg-ms-elevated/60 transition-colors`}
        >
          {!isCollapsed && <span className="font-medium">Collapse</span>}
          {isCollapsed ? (
            <PanelLeftOpen className="w-4 h-4 shrink-0" />
          ) : (
            <PanelLeftClose className="w-4 h-4 shrink-0" />
          )}
        </button>
      </div>
    </aside>
  );
});
