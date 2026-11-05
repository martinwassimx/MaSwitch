import type { PlatformId } from '../types/platform';

const PLATFORM_PALETTES: Record<
  PlatformId,
  { accent: string; surface: string; deep: string }
> = {
  steam: { accent: '#4C8DFF', surface: '#182235', deep: '#10141D' },
  epic: { accent: '#94A3B8', surface: '#1E2229', deep: '#111317' },
  gog: { accent: '#A78BFA', surface: '#211B30', deep: '#12101A' },
  riot: { accent: '#F43F5E', surface: '#2A161D', deep: '#150D10' },
  ea: { accent: '#34D399', surface: '#142822', deep: '#0E1714' },
  ubisoft: { accent: '#60A5FA', surface: '#172033', deep: '#10131C' },
  rockstar: { accent: '#FBBF24', surface: '#292112', deep: '#16130C' },
  discord: { accent: '#818CF8', surface: '#1B1E32', deep: '#11131D' },
  custom: { accent: '#4C8DFF', surface: '#1B2028', deep: '#111317' },
};

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateLocalGameCoverSvg(
  title: string,
  platformId: PlatformId,
  subtitle = 'Installed'
): string {
  const palette = PLATFORM_PALETTES[platformId] ?? PLATFORM_PALETTES.custom;
  const safeTitle = escapeXml(title.slice(0, 26));
  const safeSubtitle = escapeXml(subtitle.slice(0, 32));
  const safePlatform = escapeXml(
    platformId.charAt(0).toUpperCase() + platformId.slice(1)
  );
  const monogram = escapeXml(
    title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || 'MS'
  );

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 840" width="600" height="840">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${palette.surface}"/>
          <stop offset="100%" stop-color="${palette.deep}"/>
        </linearGradient>
      </defs>
      <rect width="600" height="840" fill="url(#bg)"/>
      <line x1="48" y1="120" x2="552" y2="120" stroke="#2A2D32" stroke-width="1.5"/>
      <line x1="48" y1="620" x2="552" y2="620" stroke="#2A2D32" stroke-width="1.5"/>
      <text x="48" y="82" fill="#92959D" font-family="Inter, Segoe UI, sans-serif" font-size="20" font-weight="500">${safePlatform}</text>
      <circle cx="536" cy="74" r="6" fill="${palette.accent}"/>
      <text x="48" y="410" fill="#F2F2F3" fill-opacity="0.08" font-family="Inter, Segoe UI, sans-serif" font-size="180" font-weight="700" letter-spacing="-6">${monogram}</text>
      <text x="48" y="684" fill="#92959D" font-family="Inter, Segoe UI, sans-serif" font-size="20" font-weight="500">${safeSubtitle}</text>
      <text x="48" y="736" fill="#F2F2F3" font-family="Inter, Segoe UI, sans-serif" font-size="34" font-weight="600">${safeTitle}</text>
    </svg>
  `
    .replace(/\s+/g, ' ')
    .trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function generateLocalGameHeroSvg(
  title: string,
  platformId: PlatformId
): string {
  const palette = PLATFORM_PALETTES[platformId] ?? PLATFORM_PALETTES.custom;
  const safeTitle = escapeXml(title.slice(0, 44));

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 680" width="1600" height="680">
      <defs>
        <linearGradient id="hBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${palette.surface}"/>
          <stop offset="100%" stop-color="${palette.deep}"/>
        </linearGradient>
      </defs>
      <rect width="1600" height="680" fill="url(#hBg)"/>
      <line x1="0" y1="520" x2="1600" y2="520" stroke="#2A2D32" stroke-width="1"/>
      <text x="72" y="480" fill="#F2F2F3" fill-opacity="0.06" font-family="Inter, Segoe UI, sans-serif" font-size="96" font-weight="700" letter-spacing="-2">${safeTitle}</text>
    </svg>
  `
    .replace(/\s+/g, ' ')
    .trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
