import React from 'react';
import { Info } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

interface DemoNoticeBannerProps {
  title: string;
  description: string;
  securityBadge?: string;
}

export const DemoNoticeBanner: React.FC<DemoNoticeBannerProps> = ({
  title,
  description,
}) => {
  const showDemoNotices = useAppStore((s) => s.settings.showDemoNotices);

  if (!showDemoNotices) {
    return null;
  }

  return (
    <div
      role="status"
      aria-label="Demonstration mode notice"
      className="rounded-lg bg-ms-card border border-ms-border px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Info className="w-3.5 h-3.5 text-ms-accent shrink-0" />
        <p className="text-ms-muted truncate">
          <span className="font-medium text-ms-text">{title}</span>
          <span className="mx-1.5 text-ms-border">·</span>
          <span>{description}</span>
        </p>
      </div>
      <span className="text-[11px] text-ms-muted shrink-0 hidden sm:inline">
        Demo preview
      </span>
    </div>
  );
};
