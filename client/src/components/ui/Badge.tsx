import type { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';
import { RARITY_INFO, type Rarity } from '@wailers/shared';

export type BadgeTone = 'neutral' | 'gold' | 'blood' | 'arcane' | 'emerald' | 'sky' | 'outline';

export interface BadgeProps {
  children?: ReactNode;
  tone?: BadgeTone;
  /** Custom hex color (overrides tone): tinted background + colored text/border. */
  color?: string | null;
  icon?: ReactNode;
  size?: 'xs' | 'sm' | 'md';
  title?: string;
  className?: string;
  /** Small leading dot. */
  dot?: boolean;
}

const TONE: Record<BadgeTone, string> = {
  neutral: 'border-ink-500 bg-ink-700/80 text-parchment-200',
  gold: 'border-gold-600/60 bg-gold-500/15 text-gold-300',
  blood: 'border-blood-500/60 bg-blood-500/15 text-blood-300',
  arcane: 'border-arcane-500/60 bg-arcane-500/15 text-arcane-300',
  emerald: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300',
  sky: 'border-sky-500/50 bg-sky-500/15 text-sky-300',
  outline: 'border-ink-400 bg-transparent text-parchment-300',
};

const SIZE: Record<NonNullable<BadgeProps['size']>, string> = {
  xs: 'px-1.5 py-0 text-[10px] leading-4 gap-1',
  sm: 'px-2 py-0.5 text-[11px] leading-4 gap-1',
  md: 'px-2.5 py-0.5 text-xs leading-5 gap-1.5',
};

/** Converts "#rrggbb" to "rgba(r,g,b,a)". Falls back to the input for other formats. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function Badge({ children, tone = 'neutral', color, icon, size = 'sm', title, className, dot }: BadgeProps) {
  const style: CSSProperties | undefined = color
    ? { color, borderColor: withAlpha(color, 0.55), backgroundColor: withAlpha(color, 0.14) }
    : undefined;
  return (
    <span
      title={title}
      style={style}
      className={clsx(
        'inline-flex max-w-full shrink-0 items-center whitespace-nowrap rounded-full border font-semibold',
        !color && TONE[tone],
        SIZE[size],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />}
      {icon && <span className="inline-flex shrink-0 [&>svg]:h-3 [&>svg]:w-3">{icon}</span>}
      {children !== undefined && <span className="truncate">{children}</span>}
    </span>
  );
}

export interface RarityBadgeProps {
  rarity: Rarity | null | undefined;
  size?: BadgeProps['size'];
  className?: string;
  /** Render "Sin rareza" instead of nothing when rarity is null. */
  showEmpty?: boolean;
}

/** Item rarity pill using the shared RARITY_INFO colors. */
export function RarityBadge({ rarity, size = 'sm', className, showEmpty = false }: RarityBadgeProps) {
  if (!rarity) {
    return showEmpty ? (
      <Badge tone="outline" size={size} className={className}>
        Sin rareza
      </Badge>
    ) : null;
  }
  const info = RARITY_INFO[rarity];
  return (
    <Badge color={info.color} size={size} className={clsx('uppercase tracking-wide', className)} title={`Rareza: ${info.label}`} dot>
      {info.label}
    </Badge>
  );
}
