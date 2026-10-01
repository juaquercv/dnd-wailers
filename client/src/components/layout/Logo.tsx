import { useId } from 'react';
import clsx from 'clsx';

export interface D20IconProps {
  size?: number;
  className?: string;
  /** Show the "20" on the top face. Default true. */
  showNumber?: boolean;
}

/** Golden d20 emblem (same art as the favicon). */
export function D20Icon({ size = 32, className, showNumber = true }: D20IconProps) {
  const uid = useId().replace(/:/g, '');
  const g = `d20g-${uid}`;
  const d = `d20d-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fcf1d2" />
          <stop offset="0.35" stopColor="#f3d58a" />
          <stop offset="0.7" stopColor="#d4a63f" />
          <stop offset="1" stopColor="#7d5d1d" />
        </linearGradient>
        <linearGradient id={d} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9c063" />
          <stop offset="1" stopColor="#7d5d1d" />
        </linearGradient>
      </defs>
      <polygon points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5" fill="#13110e" stroke={`url(#${g})`} strokeWidth="3" strokeLinejoin="round" />
      <polygon points="32,14 47,40 17,40" fill={`url(#${d})`} opacity="0.28" />
      <g fill="none" stroke={`url(#${g})`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <polygon points="32,14 47,40 17,40" />
        <line x1="32" y1="3" x2="32" y2="14" />
        <line x1="57" y1="17.5" x2="47" y2="40" />
        <line x1="7" y1="17.5" x2="17" y2="40" />
        <line x1="57" y1="17.5" x2="32" y2="14" />
        <line x1="7" y1="17.5" x2="32" y2="14" />
        <line x1="47" y1="40" x2="57" y2="46.5" />
        <line x1="17" y1="40" x2="7" y2="46.5" />
        <line x1="47" y1="40" x2="32" y2="61" />
        <line x1="17" y1="40" x2="32" y2="61" />
      </g>
      {showNumber && (
        <text x="32" y="35.5" textAnchor="middle" fontFamily="Cinzel, Georgia, serif" fontWeight="700" fontSize="11" fill="#fcf1d2">
          20
        </text>
      )}
    </svg>
  );
}

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Hide the wordmark (icon only). */
  iconOnly?: boolean;
}

/** App logo: d20 + "D&D Wailers" wordmark. */
export function Logo({ size = 'md', className, iconOnly = false }: LogoProps) {
  const icon = size === 'sm' ? 24 : size === 'lg' ? 48 : 32;
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <D20Icon size={icon} className="shrink-0 drop-shadow-[0_0_8px_rgba(233,192,99,0.35)]" />
      {!iconOnly && (
        <span
          className={clsx(
            'title-epic whitespace-nowrap leading-none',
            size === 'sm' ? 'text-base' : size === 'lg' ? 'text-3xl' : 'text-xl',
          )}
        >
          D&amp;D Wailers
        </span>
      )}
    </span>
  );
}
