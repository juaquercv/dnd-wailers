import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useDisplayState, useSessionStore } from '../../stores/session';

/**
 * What players see with vision mode "Nada": a black screen or the DM's scene image, full-bleed with a
 * vignette and the zone / campaign title.
 */
export function SceneScreen() {
  const { effective, isPreview } = useDisplayState();
  const campaignName = useSessionStore((s) => s.campaign?.name ?? null);
  const sessionName = useSessionStore((s) => s.view?.state.name ?? null);
  const viewedZoneName = useSessionStore((s) => (s.viewZone ? s.zonesById[s.viewZone.zoneId]?.name ?? null : null));
  // Players with vision "Nada" receive no zones: the DM preview must not reveal the DM's zone either.
  const zoneName = isPreview ? null : viewedZoneName;
  const imageUrl = effective?.sceneImageUrl ?? null;
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setBroken(false);
  }, [imageUrl]);

  const title = zoneName ?? campaignName ?? sessionName ?? 'La escena continúa';
  const subtitle = zoneName && campaignName ? campaignName : imageUrl ? null : 'El DM narra la escena…';
  const showImage = !!imageUrl && !broken;

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {showImage && (
        <img
          key={imageUrl}
          src={imageUrl}
          alt=""
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          className={clsx(
            'absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-[1600ms] ease-out',
            loaded ? 'scale-100 opacity-100' : 'scale-105 opacity-0',
          )}
        />
      )}
      {!showImage && (
        <div
          aria-hidden
          className="absolute inset-0 opacity-70"
          style={{ background: 'radial-gradient(ellipse 60% 45% at 50% 55%, rgba(212, 166, 63, 0.07), transparent 70%)' }}
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0, 0, 0, 0.55) 70%, rgba(0, 0, 0, 0.92) 100%)' }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/85 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-6 pb-[12vh] text-center">
        <span className="h-px w-40 bg-gradient-to-r from-transparent via-gold-500/70 to-transparent" aria-hidden />
        <h2 className="title-epic animate-slide-up text-3xl sm:text-5xl">{title}</h2>
        {subtitle && <p className="animate-fade-in font-display text-sm tracking-[0.3em] text-parchment-300/80 uppercase">{subtitle}</p>}
        <span className="h-px w-40 bg-gradient-to-r from-transparent via-gold-500/70 to-transparent" aria-hidden />
      </div>
    </div>
  );
}
