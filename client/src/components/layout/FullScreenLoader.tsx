import clsx from 'clsx';
import { D20Icon } from './Logo';

export interface FullScreenLoaderProps {
  label?: string;
  /** Cover the viewport (default) or just fill the parent. */
  inline?: boolean;
  className?: string;
}

/** Themed loader: a slowly spinning golden d20 with a pulsing glow. */
export function FullScreenLoader({ label = 'Cargando…', inline = false, className }: FullScreenLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        'flex animate-fade-in flex-col items-center justify-center gap-5',
        inline ? 'h-full min-h-[12rem] w-full' : 'fixed inset-0 z-60 bg-ink-950/80 backdrop-blur-sm',
        className,
      )}
    >
      <div className="relative">
        <div className="absolute inset-0 -m-6 animate-glow-pulse rounded-full bg-gold-500/10 blur-2xl" aria-hidden />
        <D20Icon size={inline ? 48 : 72} className="relative animate-spin-slow drop-shadow-[0_0_16px_rgba(233,192,99,0.55)]" />
      </div>
      <p className="font-display text-sm uppercase tracking-[0.25em] text-gold-300/90">{label}</p>
    </div>
  );
}
