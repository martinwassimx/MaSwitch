import React from 'react';

export interface PlatformIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
}

// 1. Official Steam Logo (Valve Corporation)
export const SteamLogo: React.FC<PlatformIconProps> = ({
  size = 24,
  className = '',
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-label="Steam"
    className={className}
    {...props}
  >
    <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.811c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 12-5.373 12-12s-5.373-12-12-12zm-3.447 17.155a2.038 2.038 0 1 1-2.038-2.038 2.038 2.038 0 0 1 2.038 2.038zm7.406-8.245a3.17 3.17 0 1 1 0-6.34 3.17 3.17 0 0 1 0 6.34z" />
  </svg>
);

// 2. Official Epic Games Logo (Epic Games, Inc.)
export const EpicGamesLogo: React.FC<PlatformIconProps> = ({
  size = 24,
  className = '',
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-label="Epic Games"
    className={className}
    {...props}
  >
    <path d="M4.09 0C1.83 0 0 1.83 0 4.09v15.82C0 22.17 1.83 24 4.09 24h15.82C22.17 24 24 22.17 24 19.91V4.09C24 1.83 22.17 0 19.91 0H4.09zm7.91 3.27c3.48 0 6.3 2.82 6.3 6.3 0 3.12-2.28 5.71-5.27 6.2v-3.7a2.62 2.62 0 0 0 1.63-2.45c0-1.45-1.18-2.63-2.63-2.63s-2.63 1.18-2.63 2.63c0 1.09.67 2.03 1.63 2.44v3.71A6.302 6.302 0 0 1 5.7 9.57c0-3.48 2.82-6.3 6.3-6.3z" />
  </svg>
);

// 3. Official Riot Games Logo (Riot Games, Inc.)
export const RiotGamesLogo: React.FC<PlatformIconProps> = ({
  size = 24,
  className = '',
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-label="Riot Games"
    className={className}
    {...props}
  >
    <path d="M13.414 1.748L0 8.016l3.528 10.603 4.22-.647-.732-2.735 2.193-.336.812 3.033 7.828-1.202 6.151 4.72.001-4.707L24 16.732 13.414 1.748zm-1.85 4.316l5.772 8.163-4.896.751-.78-2.916-2.194.336.78 2.916-2.482.381-2.183-6.561 5.983-3.07z" />
  </svg>
);

// 4. Official EA Logo (Electronic Arts)
export const EaLogo: React.FC<PlatformIconProps> = ({
  size = 24,
  className = '',
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-label="Electronic Arts"
    className={className}
    {...props}
  >
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.28 6.467h6.634l-1.077 2.083h-3.435l-.658 1.272h3.58l-1.077 2.084h-3.58l-.893 1.727h4.093l-1.077 2.084H7.236l3.484-9.25zm-3.834 9.25l2.42-6.425 2.42 6.425H6.886z" />
  </svg>
);

// 5. Official Ubisoft Logo (Ubisoft Entertainment)
export const UbisoftLogo: React.FC<PlatformIconProps> = ({
  size = 24,
  className = '',
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-label="Ubisoft"
    className={className}
    {...props}
  >
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm.014 2.4c4.15 0 7.632 2.68 8.877 6.42a8.887 8.887 0 0 1-2.072 9.07 8.847 8.847 0 0 1-9.062 2.073A8.888 8.888 0 0 1 3.336 10.9a8.846 8.846 0 0 1 8.678-8.5zm-.014 3.6a6.012 6.012 0 0 0-4.243 10.257 6.012 6.012 0 0 0 8.486 0A6.012 6.012 0 0 0 12 6z" />
  </svg>
);

// 6. Official Rockstar Games Logo (Rockstar Games, Inc.)
export const RockstarLogo: React.FC<PlatformIconProps> = ({
  size = 24,
  className = '',
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-label="Rockstar Games"
    className={className}
    {...props}
  >
    <path d="M4.8 0C2.15 0 0 2.15 0 4.8v14.4C0 21.85 2.15 24 4.8 24h14.4c2.65 0 4.8-2.15 4.8-4.8V4.8C24 2.15 21.85 0 19.2 0H4.8zm3.84 4.8h6.4c2.12 0 3.84 1.72 3.84 3.84 0 1.57-.95 2.92-2.3 3.52l2.62 5.84h-3.48l-2.28-5.36h-1.96v5.36H8.64V4.8zm3.04 2.72v2.88h3.36c.8 0 1.44-.64 1.44-1.44s-.64-1.44-1.44-1.44h-3.36zm5.82 8.38l.84 2.58 2.71-.02-2.18 1.6.83 2.58-2.2-1.58-2.2 1.58.83-2.58-2.18-1.6 2.71.02.85-2.58z" />
  </svg>
);

// 7. Official Discord Logo (Discord Inc.)
export const DiscordLogo: React.FC<PlatformIconProps> = ({
  size = 24,
  className = '',
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-label="Discord"
    className={className}
    {...props}
  >
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

// 8. Official GOG Galaxy Logo (GOG.com)
export const GogLogo: React.FC<PlatformIconProps> = ({
  size = 24,
  className = '',
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-label="GOG Galaxy"
    className={className}
    {...props}
  >
    <path d="M12 0a12 12 0 1 0 12 12A12.014 12.014 0 0 0 12 0zm0 3.273a8.727 8.727 0 1 1-8.727 8.727A8.737 8.737 0 0 1 12 3.273zm3.818 4.363a1.091 1.091 0 0 0-.77.32l-3.048 3.048-1.411-1.411a1.091 1.091 0 0 0-1.543 1.543l2.183 2.183a1.091 1.091 0 0 0 1.543 0l3.818-3.818a1.091 1.091 0 0 0-.772-1.865z" />
  </svg>
);

// 9. Custom PC Game / Executable
export const CustomPcLogo: React.FC<PlatformIconProps> = ({
  size = 24,
  className = '',
  ...props
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-label="Custom PC Game"
    className={className}
    {...props}
  >
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

