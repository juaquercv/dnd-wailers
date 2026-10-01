import { useEffect, useState, type CSSProperties } from 'react';
import clsx from 'clsx';
import { withAlpha } from './Badge';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const SIZE_PX: Record<AvatarSize, number> = { xs: 20, sm: 28, md: 36, lg: 48, xl: 72, '2xl': 104 };

export interface AvatarProps {
  name: string;
  /** User color (ring + background tint). */
  color?: string | null;
  imageUrl?: string | null;
  size?: AvatarSize | number;
  /** Presence dot. */
  status?: 'online' | 'offline' | 'busy' | null;
  /** Glowing ring in the user color. */
  ring?: boolean;
  className?: string;
  title?: string;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.charAt(0).toUpperCase();
  return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
}

/** Round avatar: portrait when available, otherwise the user color with initials. */
export function Avatar({ name, color, imageUrl, size = 'md', status, ring = false, className, title }: AvatarProps) {
  const px = typeof size === 'number' ? size : SIZE_PX[size];
  const tint = color || '#d4a63f';
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [imageUrl]);
  const showImage = !!imageUrl && !broken;
  const style: CSSProperties = {
    width: px,
    height: px,
    fontSize: Math.max(10, Math.round(px * 0.42)),
    background: showImage
      ? undefined
      : `radial-gradient(circle at 30% 25%, ${withAlpha(tint, 0.95)}, ${withAlpha(tint, 0.55)} 55%, ${withAlpha(tint, 0.3)} 100%)`,
    boxShadow: ring
      ? `0 0 0 2px #13110e, 0 0 0 ${px >= 48 ? 4 : 3}px ${tint}, 0 0 ${Math.round(px / 2.5)}px ${withAlpha(tint, 0.55)}`
      : `0 0 0 1.5px ${withAlpha(tint, 0.7)}`,
  };
  const dot = Math.max(8, Math.round(px * 0.26));
  return (
    <span
      className={clsx('relative inline-flex shrink-0 select-none items-center justify-center rounded-full', className)}
      style={style}
      title={title ?? name}
      role="img"
      aria-label={name}
    >
      {showImage ? (
        <img
          src={imageUrl ?? undefined}
          alt=""
          className="h-full w-full rounded-full object-cover"
          draggable={false}
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="font-display font-bold leading-none text-ink-950 [text-shadow:0_1px_0_rgba(255,255,255,0.35)]">
          {initials(name)}
        </span>
      )}
      {status && (
        <span
          aria-hidden
          className={clsx(
            'absolute bottom-0 right-0 rounded-full ring-2 ring-ink-900',
            status === 'online' && 'bg-emerald-400',
            status === 'busy' && 'bg-blood-400',
            status === 'offline' && 'bg-ink-400',
          )}
          style={{ width: dot, height: dot }}
        />
      )}
    </span>
  );
}
