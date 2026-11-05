import React from 'react';
import {
  Home,
  Library,
  Users,
  Layers,
  BarChart3,
  Gauge,
  Newspaper,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { NavigationSection } from '../../shared/types/settings';
import { useAppStore } from '../../store/useAppStore';

interface NavItemConfig {
  id: NavigationSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
}

export const Sidebar: React.FC = () => {
  const activeSection = useAppStore((s) => s.activeSection);
  const selectedGameId = useAppStore((s) => s.selectedGameId);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const openGameDetails = useAppStore((s) => s.openGameDetails);
  const games = useAppStore((s) => s.games);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const featuresManifest = useAppStore((s) => s.featuresManifest);

  const isPerfEnabled = featuresManifest
    ? Boolean(featuresManifest.features.performanceMonitor?.enabled) ||
      Boolean(featuresManifest.features.memoryManagement?.enabled)
    : true;
  const isNewsEnabled = featuresManifest
    ? Boolean(featuresManifest.features.gameNews?.enabled)
    : true;

  const navItems: NavItemConfig[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'library', label: 'Library', icon: Library, count: games.length },
    { id: 'accounts', label: 'Accounts', icon: Users },
    { id: 'platforms', label: 'Platforms', icon: Layers },
    { id: 'statistics', label: 'Statistics', icon: BarChart3 },
    ...(isPerfEnabled
      ? [{ id: 'performance' as const, label: 'Performance', icon: Gauge }]
      : []),
    ...(isNewsEnabled
      ? [{ id: 'news' as const, label: 'Game News', icon: Newspaper }]
      : []),
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const favoriteGames = games.filter((g) =>
    settings.favoriteGameIds.includes(g.id)
  );

  const isCollapsed = settings.sidebarCollapsed;

  return (
    <aside
      data-testid="app-sidebar"
      className={`${
        isCollapsed ? 'w-16' : 'w-64'
      } bg-ms-sidebar border-r border-ms-border flex flex-col justify-between transition-[width] duration-150 shrink-0 select-none z-20`}
    >
      {/* Primary Navigation */}
      <div className="p-3 space-y-6 overflow-y-auto">
        <nav aria-label="Main Navigation" className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeSection === item.id && selectedGameId === null;

            return (
              <button
                key={item.id}
                type="button"
                data-testid={`nav-${item.id}`}
                onClick={() => setActiveSection(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`relative w-full flex items-center ${
                  isCollapsed ? 'justify-center px-0' : 'justify-between px-3.5'
                } h-11 rounded-lg text-[15px] font-medium transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-violet-600/20 via-violet-600/10 to-transparent text-white font-semibold shadow-sm'
                    : 'text-ms-muted hover:text-ms-text hover:bg-ms-elevated/60'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-cyan-400 to-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.7)]" />
                )}

                <div className="flex items-center gap-3.5 min-w-0">
                  <Icon
                    className={`w-5 h-5 shrink-0 transition-colors ${
                      isActive ? 'text-violet-400' : 'text-ms-muted'
                    }`}
                  />
                  {!isCollapsed && (
                    <span className="truncate tracking-tight">{item.label}</span>
                  )}
                </div>

                {!isCollapsed &&
                  settings.showSidebarCounts &&
                  item.count !== undefined && (
                    <span className={`text-xs tabular-nums px-2 py-0.5 rounded-md border transition-colors ${
                      isActive
                        ? 'bg-violet-500/20 border-violet-500/40 text-violet-200'
                        : 'text-ms-muted/90 bg-ms-card/80 border-ms-border/50'
                    }`}>
                      {item.count}
                    </span>
                  )}
              </button>
            );
          })}
        </nav>

        {/* Pinned Favorites Quick Shelf */}
        {!isCollapsed && favoriteGames.length > 0 && (
          <div className="pt-3 border-t border-ms-border/80">
            <div className="px-3.5 pb-2 flex items-center justify-between text-xs font-semibold text-ms-muted uppercase tracking-wider">
              <span>Favorites</span>
              <span className="text-[11px] font-normal text-ms-muted/70">
                {favoriteGames.length}
              </span>
            </div>
            <div className="space-y-1">
              {favoriteGames.slice(0, 7).map((game) => {
                const isSelected = selectedGameId === game.id;
                return (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => openGameDetails(game.id)}
                    className={`w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-left text-sm transition-colors ${
                      isSelected
                        ? 'bg-ms-elevated text-ms-text'
                        : 'text-ms-muted hover:text-ms-text hover:bg-ms-elevated/50'
                    }`}
                  >
                    {game.iconImage ? (
                      <img
                        src={game.iconImage}
                        alt=""
                        className="w-5 h-5 rounded-sm object-contain shrink-0"
                      />
                    ) : (
                      <img
                        src={game.coverImage}
                        alt=""
                        className="w-5 h-7 rounded-sm object-cover shrink-0 bg-ms-card border border-ms-border/50"
                      />
                    )}
                    <span className="truncate flex-1 font-medium tracking-tight">
                      {game.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
          className={`w-full h-10 rounded-lg flex items-center ${
            isCollapsed ? 'justify-center px-0' : 'justify-between px-3'
          } text-sm text-ms-muted hover:text-ms-text hover:bg-ms-elevated/60 transition-colors`}
        >
          {!isCollapsed && <span className="font-medium">Collapse sidebar</span>}
          {isCollapsed ? (
            <PanelLeftOpen className="w-5 h-5 shrink-0" />
          ) : (
            <PanelLeftClose className="w-5 h-5 shrink-0" />
          )}
        </button>
      </div>
    </aside>
  );
};
