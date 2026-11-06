import React from 'react';
import maswitchMark from '../../assets/branding/maswitch-mark.png';

interface BrandLogoProps {
  compact?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  showSubtitle?: boolean;
}

export const BrandMarkImg: React.FC<{ size?: number; className?: string }> = React.memo(({
  size = 28,
  className = '',
}) => (
  <img
    src={maswitchMark}
    alt="MaSwitch"
    width={size}
    height={size}
    decoding="async"
    className={`shrink-0 object-contain select-none ${className}`}
    style={{ width: `${size}px`, height: `${size}px` }}
  />
));

export const BrandMarkSvg = BrandMarkImg;

export const BrandLogo: React.FC<BrandLogoProps> = React.memo(({
  compact = false,
  size = 'md',
  className = '',
  showSubtitle = true,
}) => {
  const pixelSize =
    size === 'sm'
      ? 24
      : size === 'lg'
        ? 36
        : size === 'xl'
          ? 42
          : size === '2xl'
            ? 52
            : 30;

  const textClass =
    size === 'sm'
      ? 'text-sm font-bold'
      : size === 'lg'
        ? 'text-lg font-black'
        : size === 'xl'
          ? 'text-xl font-black'
          : size === '2xl'
            ? 'text-2xl font-black'
            : 'text-base font-black';

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <BrandMarkImg size={pixelSize} />

      {!compact && (
        <div className="flex flex-col leading-none">
          <span className={`${textClass} tracking-tight font-black bg-gradient-to-r from-white via-slate-100 to-slate-200 bg-clip-text text-transparent`}>
            MaSwitch
          </span>
          {showSubtitle && (
            <span className="text-[11px] font-extrabold bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent uppercase tracking-widest mt-1">
              Launcher
            </span>
          )}
        </div>
      )}
    </div>
  );
});
