import clsx from 'clsx';

const STYLE_ID = 'wailers-audio-styles';
const BARS = [0, 1, 2, 3];

function ensureStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
@keyframes wailers-eq {
  0% { transform: scaleY(0.25); }
  40% { transform: scaleY(1); }
  70% { transform: scaleY(0.45); }
  100% { transform: scaleY(0.8); }
}`;
  document.head.appendChild(style);
}

export interface EqualizerProps {
  active: boolean;
  className?: string;
}

/** Small animated "now playing" bars (static when inactive or with reduced motion). */
export function Equalizer({ active, className }: EqualizerProps) {
  ensureStyles();
  return (
    <span aria-hidden className={clsx('inline-flex h-3.5 items-end gap-[2px]', className)}>
      {BARS.map((i) => (
        <span
          key={i}
          className={clsx('h-full w-[3px] origin-bottom rounded-[1px]', active ? 'bg-gold-400' : 'bg-ink-500')}
          style={{
            transform: active ? undefined : `scaleY(${0.25 + (i % 2) * 0.15})`,
            animation: active ? `wailers-eq ${0.75 + i * 0.17}s ease-in-out ${-i * 0.31}s infinite alternate` : 'none',
          }}
        />
      ))}
    </span>
  );
}
