import React from 'react';
import type { PlatformId } from '../../shared/types/platform';
import {
  SteamLogo,
  EpicGamesLogo,
  RiotGamesLogo,
  EaLogo,
  UbisoftLogo,
  RockstarLogo,
  DiscordLogo,
  GogLogo,
  CustomPcLogo,
  type PlatformIconProps,
} from '../../assets/platforms/platformLogos';

import steamLogoImg from '../../assets/platforms/logos/steam.png';
import epicLogoImg from '../../assets/platforms/logos/epic.png';
import riotLogoImg from '../../assets/platforms/logos/riot.png';
import eaLogoSvg from '../../assets/platforms/logos/ea.svg';
import ubisoftLogoSvg from '../../assets/platforms/logos/ubisoft.svg';
import rockstarLogoImg from '../../assets/platforms/logos/rockstar.png';
import gogLogoImg from '../../assets/platforms/logos/gog.png';

export const PLATFORM_CLIENT_LOGOS: Partial<Record<PlatformId, string>> = {
  steam: steamLogoImg,
  epic: epicLogoImg,
  riot: riotLogoImg,
  ea: eaLogoSvg,
  ubisoft: ubisoftLogoSvg,
  rockstar: rockstarLogoImg,
  gog: gogLogoImg,
};

export const PLATFORM_BRAND_COLORS: Record<PlatformId, string> = {
  steam: '#1A9FFF',
  epic: '#F5F5F7',
  riot: '#EB0029',
  ea: '#FF4747',
  ubisoft: '#0070FF',
  rockstar: '#FCAF17',
  discord: '#5865F2',
  gog: '#A78BFA',
  custom: '#38BDF8',
};

export const PLATFORM_DISPLAY_NAMES: Record<PlatformId, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  riot: 'Riot Games',
  ea: 'EA App',
  ubisoft: 'Ubisoft Connect',
  rockstar: 'Rockstar Games',
  discord: 'Discord',
  gog: 'GOG Galaxy',
  custom: 'Custom PC',
};

export const PLATFORM_NAMES = PLATFORM_DISPLAY_NAMES;

export const PLATFORM_LOGOS: Record<PlatformId, React.FC<PlatformIconProps>> = {
  steam: SteamLogo,
  epic: EpicGamesLogo,
  riot: RiotGamesLogo,
  ea: EaLogo,
  ubisoft: UbisoftLogo,
  rockstar: RockstarLogo,
  discord: DiscordLogo,
  gog: GogLogo,
  custom: CustomPcLogo,
};

export type PlatformLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;

export interface PlatformLogoProps {
  platformId: PlatformId;
  size?: PlatformLogoSize;
  colorMode?: 'brand' | 'monochrome' | 'auto';
  className?: string;
  showTitle?: boolean;
}

function resolveSizePx(size: PlatformLogoSize): number {
  if (typeof size === 'number') return size;
  switch (size) {
    case 'xs':
      return 16;
    case 'sm':
      return 20;
    case 'md':
      return 26;
    case 'lg':
      return 34;
    case 'xl':
      return 42;
    default:
      return 24;
  }
}

export const PlatformLogo: React.FC<PlatformLogoProps> = React.memo(({
  platformId,
  size = 'md',
  colorMode = 'brand',
  className = '',
  showTitle = true,
}) => {
  const pixelSize = resolveSizePx(size);
  const brandColor = PLATFORM_BRAND_COLORS[platformId] ?? '#38BDF8';
  const name = PLATFORM_DISPLAY_NAMES[platformId] ?? 'Gaming Platform';

  const clientLogo = PLATFORM_CLIENT_LOGOS[platformId];
  if (clientLogo) {
    return (
      <img
        src={clientLogo}
        alt={name}
        title={showTitle ? name : undefined}
        width={pixelSize}
        height={pixelSize}
        className={`shrink-0 object-contain select-none ${className}`}
        style={{ width: `${pixelSize}px`, height: `${pixelSize}px` }}
        loading="lazy"
        decoding="async"
      />
    );
  }

  const style: React.CSSProperties =
    colorMode === 'brand' ? { color: brandColor } : {};

  const commonProps = {
    size: pixelSize,
    className: `shrink-0 ${className}`,
    style,
    'aria-label': name,
    title: showTitle ? name : undefined,
  };

  switch (platformId) {
    case 'steam':
      return <SteamLogo {...commonProps} />;
    case 'epic':
      return <EpicGamesLogo {...commonProps} />;
    case 'riot':
      return <RiotGamesLogo {...commonProps} />;
    case 'ea':
      return <EaLogo {...commonProps} />;
    case 'ubisoft':
      return <UbisoftLogo {...commonProps} />;
    case 'rockstar':
      return <RockstarLogo {...commonProps} />;
    case 'discord':
      return <DiscordLogo {...commonProps} />;
    case 'gog':
      return <GogLogo {...commonProps} />;
    case 'custom':
    default:
      return <CustomPcLogo {...commonProps} />;
  }
});
