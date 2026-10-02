import { useId } from 'react';
import clsx from 'clsx';
import type { VisionMode } from '@wailers/shared';

/** Tiny map illustration for each vision mode. */
export function ModeIllustration({ mode, active, className }: { mode: VisionMode; active: boolean; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const soft = `vf-soft-${uid}`;
  const visionMask = `vf-vision-${uid}`;
  const unexploredMask = `vf-unexp-${uid}`;
  const dimMask = `vf-dim-${uid}`;
  const explored = 'M0 0 H58 C 66 18, 52 36, 62 56 H0 Z';
  return (
    <svg
      viewBox="0 0 96 56"
      className={clsx('block h-auto w-full transition', active ? 'opacity-100' : 'opacity-80 group-hover:opacity-100', className)}
      aria-hidden
    >
      <defs>
        <radialGradient id={soft}>
          <stop offset="0.6" stopColor="#000" />
          <stop offset="1" stopColor="#fff" />
        </radialGradient>
        <mask id={visionMask}>
          <rect width="96" height="56" fill="#fff" />
          <circle cx="40" cy="28" r="17" fill={`url(#${soft})`} />
        </mask>
        <mask id={unexploredMask}>
          <rect width="96" height="56" fill="#fff" />
          <path d={explored} fill="#000" />
          <circle cx="40" cy="28" r="17" fill={`url(#${soft})`} />
        </mask>
        <mask id={dimMask}>
          <path d={explored} fill="#fff" />
          <circle cx="40" cy="28" r="17" fill={`url(#${soft})`} />
        </mask>
      </defs>
      {mode !== 'none' && (
        <g>
          <rect width="96" height="56" fill="#3a3527" />
          <path d="M0 40 C 20 34, 30 46, 50 40 S 80 30, 96 36 L96 45 C 80 40, 70 52, 50 49 S 18 43, 0 49 Z" fill="#2f5d7a" opacity="0.9" />
          <circle cx="12" cy="13" r="6" fill="#3f6b3a" />
          <circle cx="21" cy="9" r="5" fill="#4a7a43" />
          <circle cx="79" cy="15" r="7" fill="#3f6b3a" />
          <circle cx="87" cy="22" r="5" fill="#4a7a43" />
          <rect x="57" y="7" width="12" height="10" fill="#8a6a45" />
          <path d="M55 8 L63 2 L71 8 Z" fill="#a8463c" />
          <path d="M26 20 L36 26 L30 34" stroke="#cdb98f" strokeWidth="1.2" fill="none" strokeDasharray="2 2" />
          <circle cx="68" cy="36" r="3.2" fill="#c43d33" stroke="#13110e" strokeWidth="1" />
          <circle cx="40" cy="28" r="4" fill="#e9c063" stroke="#13110e" strokeWidth="1.5" />
        </g>
      )}
      {mode === 'vision' && <rect width="96" height="56" fill="#000" mask={`url(#${visionMask})`} />}
      {mode === 'explored' && (
        <>
          <rect width="96" height="56" fill="#000" mask={`url(#${unexploredMask})`} />
          <rect width="96" height="56" fill="#000" opacity="0.55" mask={`url(#${dimMask})`} />
        </>
      )}
      {mode === 'none' && (
        <g>
          <rect width="96" height="56" fill="#050505" />
          <path d="M52 18 A 11 11 0 1 0 58 36 A 9 9 0 1 1 52 18 Z" fill="#cdb98f" opacity="0.55" />
          <circle cx="24" cy="14" r="0.8" fill="#cdb98f" opacity="0.6" />
          <circle cx="72" cy="40" r="0.8" fill="#cdb98f" opacity="0.5" />
          <circle cx="80" cy="12" r="0.6" fill="#cdb98f" opacity="0.5" />
        </g>
      )}
    </svg>
  );
}
