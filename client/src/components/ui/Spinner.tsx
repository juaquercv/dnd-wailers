import { useId } from 'react';
import clsx from 'clsx';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_PX: Record<SpinnerSize, number> = { xs: 12, sm: 16, md: 24, lg: 40, xl: 64 };

export interface SpinnerProps {
  size?: SpinnerSize | number;
  className?: string;
  /** Accessible label (also shown below when `showLabel`). */
  label?: string;
  showLabel?: boolean;
}

/** Golden rune ring spinner. */
export function Spinner({ size = 'md', className, label = 'Cargando…', showLabel = false }: SpinnerProps) {
  const gradientId = `spin-${useId().replace(/:/g, '')}`;
  const px = typeof size === 'number' ? size : SIZE_PX[size];
  const stroke = Math.max(2, Math.round(px / 10));
  const r = (px - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span role="status" aria-live="polite" className={clsx('inline-flex flex-col items-center gap-2', className)}>
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} className="animate-spin" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fcf1d2" />
            <stop offset="50%" stopColor="#e9c063" />
            <stop offset="100%" stopColor="#7d5d1d" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke="rgba(243,234,214,0.08)" strokeWidth={stroke} />
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * 0.7} ${c}`}
        />
      </svg>
      {showLabel ? (
        <span className="text-xs font-medium tracking-wide text-parchment-300">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}
