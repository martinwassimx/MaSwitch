import React, { useEffect, useRef, useState } from 'react';
import { Minus, Square, Copy, X, Search, Loader2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { BrandLogo } from '../common/BrandLogo';

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const activeSection = useAppStore((s) => s.activeSection);
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const isScanning = useAppStore((s) => s.isScanning);
  const scanProgress = useAppStore((s) => s.scanProgress);
  const trackerStatus = useAppStore((s) => s.trackerStatus);

  useEffect(() => {
    const controls = window.maswitch?.windowControls;
    if (!controls) {
      return;
    }

    let isMounted = true;
    void controls.getState().then((state) => {
      if (isMounted) {
        setIsMaximized((prev) =>
          prev === state.isMaximized ? prev : state.isMaximized
        );
      }
    });

    const unsubscribe = controls.onStateChanged((state) => {
      if (isMounted) {
        setIsMaximized((prev) =>
          prev === state.isMaximized ? prev : state.isMaximized
        );
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMinimize = async () => {
    await window.maswitch?.windowControls.minimize();
  };

  const handleToggleMaximize = async () => {
    const state = await window.maswitch?.windowControls.toggleMaximize();
    if (state) {
      setIsMaximized(state.isMaximized);
    } else {
      setIsMaximized((prev) => !prev);
    }
  };

  const handleClose = async () => {
    await window.maswitch?.windowControls.close();
  };

  const handleQuickSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (value.trim().length > 0 && activeSection !== 'library') {
      setActiveSection('library');
    }
  };

  const activeSession = trackerStatus.activeSessions[0];

  return (
    <header
      data-testid="custom-titlebar"
      className="h-14 bg-ms-sidebar border-b border-ms-border flex items-center justify-between pl-4 pr-1 select-none shrink-0 app-drag-region z-30"
    >
      {/* Left: MaSwitch Brand & Live Launcher Telemetry */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="app-no-drag py-1" title="MaSwitch Launcher">
          <BrandLogo size="xl" />
        </div>

        {isScanning && scanProgress && (
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-ms-card border border-ms-border/80 text-xs text-ms-text truncate">
            <Loader2 className="w-3.5 h-3.5 text-ms-accent animate-spin shrink-0" />
            <span className="font-medium truncate">
              Scanning {scanProgress.phase} ({scanProgress.percent}%)
            </span>
          </div>
        )}

        {!isScanning && activeSession && (
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 truncate">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="font-medium truncate">
              In-Game: {activeSession.gameTitle}
            </span>
          </div>
        )}
      </div>

      {/* Center: Global Game Search */}
      <div className="flex-1 max-w-md mx-6 app-no-drag">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-ms-muted absolute left-3 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            aria-label="Global game search"
            value={searchQuery}
            onChange={handleQuickSearchChange}
            placeholder="Search installed library, genres, or platforms..."
            className="w-full h-9 bg-ms-card/90 hover:bg-ms-elevated/80 border border-ms-border/80 focus:border-violet-500/80 focus:ring-2 focus:ring-violet-500/25 rounded-xl pl-9 pr-9 text-xs text-ms-text placeholder:text-ms-muted/70 focus:outline-none transition-all shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 text-ms-muted hover:text-ms-text text-sm leading-none p-1 transition-colors"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Right: Native Windows Controls */}
      <div className="flex items-center gap-1 app-no-drag">
        <button
          type="button"
          data-testid="win-minimize-btn"
          aria-label="Minimize window"
          onClick={handleMinimize}
          className="w-11 h-9 rounded-md flex items-center justify-center text-ms-muted hover:text-ms-text hover:bg-ms-elevated transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>

        <button
          type="button"
          data-testid="win-maximize-btn"
          aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
          onClick={handleToggleMaximize}
          className="w-11 h-9 rounded-md flex items-center justify-center text-ms-muted hover:text-ms-text hover:bg-ms-elevated transition-colors"
        >
          {isMaximized ? (
            <Copy className="w-3.5 h-3.5" />
          ) : (
            <Square className="w-3.5 h-3.5" />
          )}
        </button>

        <button
          type="button"
          data-testid="win-close-btn"
          aria-label="Close window"
          onClick={handleClose}
          className="w-11 h-9 rounded-md flex items-center justify-center text-ms-muted hover:text-white hover:bg-[#E81123] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
