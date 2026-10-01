import { useEffect, useState, type CSSProperties } from 'react';
import clsx from 'clsx';
import type { MagicMode } from '@wailers/shared';
import { magicModeIcon } from './magicModes';

function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic dark-fantasy gradient for campaigns without a cover image. */
export function campaignGradient(seed: string): CSSProperties {
  const h = hashString(seed);
  const hue = h % 360;
  const hue2 = (hue + 40 + ((h >> 9) % 80)) % 360;
  const x = 20 + ((h >> 3) % 60);
  return {
    background: [
      `radial-gradient(ellipse 85% 95% at ${x}% 0%, hsla(${hue}, 62%, 42%, 0.55), transparent 62%)`,
      `radial-gradient(ellipse 70% 80% at ${100 - x}% 100%, hsla(${hue2}, 55%, 30%, 0.5), transparent 70%)`,
      'linear-gradient(160deg, #1c1915 0%, #0b0a08 100%)',
    ].join(', '),
  };
}

export interface CampaignArtProps {
  id: string;
  name: string;
  coverUrl: string | null;
  magicMode: MagicMode;
  className?: string;
}

/** Cover image of a campaign, or generated gradient art with a faded emblem when there is none (or it fails). */
export function CampaignArt({ id, name, coverUrl, magicMode, className }: CampaignArtProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [coverUrl]);
  const showImage = !!coverUrl && !broken;

  return (
    <div className={clsx('relative overflow-hidden bg-ink-950', className)}>
      {showImage ? (
        <img
          src={coverUrl ?? undefined}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setBroken(true)}
          className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.04]"
        />
      ) : (
        <div className="absolute inset-0" style={campaignGradient(id)} aria-hidden>
          <span className="absolute inset-0 opacity-[0.07] [background-image:repeating-linear-gradient(45deg,#f3ead6_0_1px,transparent_1px_14px)]" />
          <span className="absolute -right-6 -top-8 text-parchment-50 opacity-[0.09] transition duration-500 group-hover:rotate-6 group-hover:scale-110 group-hover:opacity-[0.16] [&>svg]:h-40 [&>svg]:w-40">
            {magicModeIcon(magicMode)}
          </span>
          <span className="absolute bottom-3 left-4 font-display text-5xl font-bold uppercase text-parchment-50/10">
            {name.trim().charAt(0) || '?'}
          </span>
        </div>
      )}
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/25 to-transparent" />
    </div>
  );
}
