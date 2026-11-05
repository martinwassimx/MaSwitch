export interface ArtworkThemeConfig {
  title: string;
  subtitle: string;
  studio: string;
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  motif: 'cyber' | 'orbital' | 'tactical' | 'mythic' | 'velocity' | 'mech' | 'stealth' | 'astral';
}

function encodeSvgDataUri(svg: string): string {
  const compact = svg.replace(/\s+/g, ' ').trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(compact)}`;
}

function renderMotifElements(
  motif: ArtworkThemeConfig['motif'],
  c1: string,
  c2: string
): string {
  switch (motif) {
    case 'cyber':
      return `
        <g opacity="0.55">
          <polygon points="300,70 510,240 430,520 170,520 90,240" fill="none" stroke="${c1}" stroke-width="2.5" stroke-dasharray="12 6"/>
          <circle cx="300" cy="290" r="145" fill="none" stroke="${c2}" stroke-width="2" opacity="0.7"/>
          <circle cx="300" cy="290" r="95" fill="none" stroke="${c1}" stroke-width="4" stroke-dasharray="45 18"/>
          <path d="M80 410 L230 330 L370 330 L520 410" fill="none" stroke="${c1}" stroke-width="2.5"/>
          <line x1="300" y1="60" x2="300" y2="500" stroke="${c2}" stroke-width="1.5" opacity="0.4"/>
        </g>
      `;
    case 'orbital':
      return `
        <g opacity="0.6">
          <circle cx="320" cy="250" r="130" fill="url(#planetGrad)" />
          <ellipse cx="320" cy="250" rx="220" ry="58" transform="rotate(-18 320 250)" fill="none" stroke="${c1}" stroke-width="3.5"/>
          <ellipse cx="320" cy="250" rx="185" ry="42" transform="rotate(-18 320 250)" fill="none" stroke="${c2}" stroke-width="1.5" stroke-dasharray="10 8"/>
          <circle cx="150" cy="145" r="14" fill="${c1}" opacity="0.8"/>
          <circle cx="470" cy="175" r="6" fill="#ffffff" opacity="0.9"/>
        </g>
      `;
    case 'tactical':
      return `
        <g opacity="0.55">
          <rect x="135" y="125" width="330" height="330" rx="16" fill="none" stroke="${c1}" stroke-width="2" stroke-dasharray="24 12"/>
          <line x1="300" y1="85" x2="300" y2="495" stroke="${c1}" stroke-width="1.5"/>
          <line x1="95" y1="290" x2="505" y2="290" stroke="${c1}" stroke-width="1.5"/>
          <circle cx="300" cy="290" r="110" fill="none" stroke="${c2}" stroke-width="3"/>
          <circle cx="300" cy="290" r="50" fill="none" stroke="${c1}" stroke-width="2"/>
          <polygon points="300,195 335,260 265,260" fill="${c1}" opacity="0.35"/>
        </g>
      `;
    case 'mythic':
      return `
        <g opacity="0.6">
          <polygon points="300,85 455,290 300,495 145,290" fill="none" stroke="${c1}" stroke-width="3"/>
          <polygon points="300,130 415,290 300,450 185,290" fill="none" stroke="${c2}" stroke-width="2" stroke-dasharray="8 8"/>
          <circle cx="300" cy="290" r="68" fill="none" stroke="${c1}" stroke-width="3"/>
          <path d="M300 120 L330 290 L300 460 L270 290 Z" fill="${c1}" opacity="0.28"/>
        </g>
      `;
    case 'velocity':
      return `
        <g opacity="0.65">
          <path d="M50 420 L260 220 L550 220" fill="none" stroke="${c1}" stroke-width="6"/>
          <path d="M50 455 L285 255 L550 255" fill="none" stroke="${c2}" stroke-width="3"/>
          <path d="M70 485 L310 285 L550 285" fill="none" stroke="${c1}" stroke-width="1.5" stroke-dasharray="16 8"/>
          <polygon points="280,150 460,150 390,340 210,340" fill="${c1}" opacity="0.18"/>
        </g>
      `;
    case 'mech':
      return `
        <g opacity="0.58">
          <polygon points="300,105 440,185 440,355 300,435 160,355 160,185" fill="none" stroke="${c1}" stroke-width="3.5"/>
          <polygon points="300,150 395,205 395,335 300,390 205,335 205,205" fill="${c2}" opacity="0.2" stroke="${c2}" stroke-width="2"/>
          <line x1="160" y1="185" x2="440" y2="355" stroke="${c1}" stroke-width="1.5" opacity="0.5"/>
          <line x1="440" y1="185" x2="160" y2="355" stroke="${c1}" stroke-width="1.5" opacity="0.5"/>
        </g>
      `;
    case 'stealth':
      return `
        <g opacity="0.55">
          <circle cx="300" cy="270" r="160" fill="none" stroke="${c1}" stroke-width="1.5" stroke-dasharray="6 10"/>
          <circle cx="300" cy="270" r="115" fill="none" stroke="${c2}" stroke-width="2.5"/>
          <polygon points="300,120 430,375 300,325 170,375" fill="${c1}" opacity="0.28" stroke="${c1}" stroke-width="2.5"/>
        </g>
      `;
    case 'astral':
    default:
      return `
        <g opacity="0.6">
          <circle cx="300" cy="265" r="140" fill="none" stroke="${c1}" stroke-width="2.5"/>
          <circle cx="300" cy="265" r="95" fill="none" stroke="${c2}" stroke-width="2" stroke-dasharray="15 10"/>
          <polygon points="300,105 342,222 465,265 342,308 300,425 258,308 135,265 258,222" fill="${c1}" opacity="0.25" stroke="${c1}" stroke-width="2"/>
        </g>
      `;
  }
}

export function createGameCoverDataUri(config: ArtworkThemeConfig): string {
  const {
    title,
    subtitle,
    studio,
    primaryColor,
    secondaryColor,
    tertiaryColor,
    motif,
  } = config;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 840" width="600" height="840">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#070b14"/>
          <stop offset="48%" stop-color="${tertiaryColor}"/>
          <stop offset="100%" stop-color="#05070e"/>
        </linearGradient>
        <radialGradient id="glowGrad" cx="50%" cy="34%" r="60%">
          <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0.52"/>
          <stop offset="55%" stop-color="${secondaryColor}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#05070e" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="planetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#060913" stop-opacity="0.95"/>
        </linearGradient>
        <linearGradient id="bottomFade" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#05070e" stop-opacity="0"/>
          <stop offset="55%" stop-color="#05070e" stop-opacity="0.82"/>
          <stop offset="100%" stop-color="#05070e" stop-opacity="0.98"/>
        </linearGradient>
      </defs>

      <rect width="600" height="840" fill="url(#bgGrad)"/>
      <rect width="600" height="840" fill="url(#glowGrad)"/>

      <!-- Subtle sci-fi grid -->
      <g stroke="#ffffff" stroke-opacity="0.04" stroke-width="1">
        <line x1="0" y1="140" x2="600" y2="140"/>
        <line x1="0" y1="280" x2="600" y2="280"/>
        <line x1="0" y1="420" x2="600" y2="420"/>
        <line x1="0" y1="560" x2="600" y2="560"/>
        <line x1="150" y1="0" x2="150" y2="840"/>
        <line x1="300" y1="0" x2="300" y2="840"/>
        <line x1="450" y1="0" x2="450" y2="840"/>
      </g>

      ${renderMotifElements(motif, primaryColor, secondaryColor)}

      <!-- Bottom cinematic vignette -->
      <rect y="430" width="600" height="410" fill="url(#bottomFade)"/>

      <!-- Top Studio Header -->
      <rect x="36" y="34" width="12" height="12" rx="3" fill="${primaryColor}"/>
      <text x="60" y="45" fill="#cbd5e1" font-family="Segoe UI, Inter, sans-serif" font-size="15" font-weight="700" letter-spacing="3">${studio.toUpperCase()}</text>

      <!-- Accent bar -->
      <rect x="40" y="625" width="74" height="5" rx="2.5" fill="${primaryColor}"/>

      <!-- Subtitle -->
      <text x="40" y="662" fill="${primaryColor}" font-family="Segoe UI, Inter, sans-serif" font-size="16" font-weight="700" letter-spacing="3.5">${subtitle.toUpperCase()}</text>

      <!-- Main Title -->
      <text x="40" y="718" fill="#f8fafc" font-family="Segoe UI, Inter, sans-serif" font-size="42" font-weight="800" letter-spacing="0.5">${title}</text>

      <!-- Border frame -->
      <rect x="14" y="14" width="572" height="812" rx="18" fill="none" stroke="${primaryColor}" stroke-opacity="0.24" stroke-width="2"/>
    </svg>
  `;

  return encodeSvgDataUri(svg);
}

export function createHeroBannerDataUri(
  config: ArtworkThemeConfig & { sceneLabel?: string }
): string {
  const {
    title,
    subtitle,
    primaryColor,
    secondaryColor,
    tertiaryColor,
    motif,
    sceneLabel,
  } = config;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 680" width="1600" height="680">
      <defs>
        <linearGradient id="heroBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#060913"/>
          <stop offset="50%" stop-color="${tertiaryColor}"/>
          <stop offset="100%" stop-color="#070a14"/>
        </linearGradient>
        <radialGradient id="heroGlow1" cx="72%" cy="42%" r="55%">
          <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0.48"/>
          <stop offset="50%" stop-color="${secondaryColor}" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="#060913" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="planetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0.75"/>
          <stop offset="100%" stop-color="#060913" stop-opacity="0.95"/>
        </linearGradient>
      </defs>

      <rect width="1600" height="680" fill="url(#heroBg)"/>
      <rect width="1600" height="680" fill="url(#heroGlow1)"/>

      <!-- Perspective Horizon Grid -->
      <g stroke="${primaryColor}" stroke-opacity="0.12" stroke-width="1.2">
        <line x1="0" y1="480" x2="1600" y2="480"/>
        <line x1="0" y1="540" x2="1600" y2="540"/>
        <line x1="0" y1="600" x2="1600" y2="600"/>
        <line x1="800" y1="340" x2="150" y2="680"/>
        <line x1="800" y1="340" x2="480" y2="680"/>
        <line x1="800" y1="340" x2="800" y2="680"/>
        <line x1="800" y1="340" x2="1120" y2="680"/>
        <line x1="800" y1="340" x2="1450" y2="680"/>
      </g>

      <g transform="translate(830, 30) scale(1.15)">
        ${renderMotifElements(motif, primaryColor, secondaryColor)}
      </g>

      ${
        sceneLabel
          ? `
        <g transform="translate(70, 80)">
          <rect width="280" height="38" rx="8" fill="#090d18" fill-opacity="0.75" stroke="${primaryColor}" stroke-opacity="0.45"/>
          <text x="20" y="24" fill="${primaryColor}" font-family="Segoe UI, Inter, sans-serif" font-size="14" font-weight="700" letter-spacing="2.2">${sceneLabel.toUpperCase()}</text>
        </g>
        <text x="70" y="575" fill="#f8fafc" fill-opacity="0.9" font-family="Segoe UI, Inter, sans-serif" font-size="34" font-weight="800">${title} — ${subtitle}</text>
      `
          : ''
      }
    </svg>
  `;

  return encodeSvgDataUri(svg);
}

