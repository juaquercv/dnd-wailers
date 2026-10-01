import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ImageIcon, Scaling } from 'lucide-react';
import type { OverviewMap } from '@wailers/shared';
import { ImageUpload } from '../../../../components/ui/ImageUpload';
import { NumberInput } from '../../../../components/ui/NumberInput';
import { Spinner } from '../../../../components/ui/Spinner';
import { OVERVIEW_MAX_SIZE, OVERVIEW_MIN_SIZE } from './overviewStyles';

export interface OverviewImageMenuProps {
  overview: OverviewMap;
  busy: boolean;
  onImage: (url: string | null) => void;
  onResize: (width: number, height: number) => void;
}

/** Toolbar dropdown to upload / replace the overview image and adjust the canvas size. */
export function OverviewImageMenu({ overview, busy, onImage, onResize }: OverviewImageMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={clsx(
          'btn btn-sm',
          open ? 'border-gold-600/70 bg-gold-500/15 text-gold-200' : 'btn-ghost',
        )}
        title="Imagen del mapa general"
      >
        {busy ? <Spinner size="xs" /> : <ImageIcon className="h-3.5 w-3.5" />}
        <span className="hidden md:inline">Imagen</span>
        <ChevronDown className={clsx('h-3 w-3 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Imagen del mapa general"
          className="panel absolute left-0 top-full z-40 mt-2 w-80 animate-scale-in border-gold-700/40 bg-ink-900 p-4 shadow-modal"
        >
          <ImageUpload
            label="Imagen del mapa general"
            value={overview.imageUrl}
            onChange={(url) => onImage(url)}
            fit="contain"
            height={160}
            hint="Al cambiarla se usa su tamaño real y los pines se reajustan"
            disabled={busy}
          />
          <div className="mt-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-parchment-300">
              <Scaling className="h-3.5 w-3.5" />
              Tamaño del lienzo
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberInput
                size="sm"
                integer
                min={OVERVIEW_MIN_SIZE}
                max={OVERVIEW_MAX_SIZE}
                value={overview.width}
                suffix="px"
                aria-label="Ancho del lienzo"
                onChange={(w) => onResize(w, overview.height)}
              />
              <NumberInput
                size="sm"
                integer
                min={OVERVIEW_MIN_SIZE}
                max={OVERVIEW_MAX_SIZE}
                value={overview.height}
                suffix="px"
                aria-label="Alto del lienzo"
                onChange={(h) => onResize(overview.width, h)}
              />
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-parchment-400">
              La imagen se estira a este tamaño. Los pines conservan su posición en píxeles.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
