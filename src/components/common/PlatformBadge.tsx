import React from 'react';
import type { PlatformId } from '../../shared/types/platform';
import {
  PlatformLogo,
  PLATFORM_DISPLAY_NAMES,
} from '../platforms/PlatformLogo';

interface PlatformBadgeProps {
  platformId: PlatformId;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'pill' | 'plain' | 'icon-only';
  className?: string;
}

export const PlatformBadge: React.FC<PlatformBadgeProps> = ({
  platformId,
  size = 'sm',
  variant = 'pill',
  className = '',
}) => {
  const name = PLATFORM_DISPLAY_NAMES[platformId] ?? 'Custom';

  const logoSize =
    size === 'xs' ? 'xs' : size === 'lg' ? 'md' : 'sm';

  if (variant === 'icon-only') {
    return (
      <span
        title={name}
        className={`inline-flex items-center justify-center ${className}`}
      >
        <PlatformLogo platformId={platformId} size={logoSize} colorMode="brand" />
      </span>
    );
  }

  if (variant === 'plain') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs text-ms-muted ${className}`}
      >
        <PlatformLogo
          platformId={platformId}
          size={logoSize}
          colorMode="brand"
          showTitle={false}
        />
        <span className="font-medium text-ms-text/90">{name}</span>
      </span>
    );
  }

  const paddingClass =
    size === 'xs'
      ? 'px-2 py-0.5 text-[11px]'
      : size === 'lg'
        ? 'px-3 py-1.5 text-sm'
        : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-medium bg-black/75 backdrop-blur-md text-white/95 border border-white/15 shadow-md ${paddingClass} ${className}`}
    >
      <PlatformLogo
        platformId={platformId}
        size={logoSize}
        colorMode="brand"
        showTitle={false}
      />
      <span className="tracking-tight text-xs">{name}</span>
    </span>
  );
};
