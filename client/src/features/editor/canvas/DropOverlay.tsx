import clsx from 'clsx';
import { Ban, ImagePlus } from 'lucide-react';
import { Spinner } from '../../../components/ui/Spinner';
import { useCanvasUi } from './canvasUiStore';

/** Drag-over frame with a hint, plus the "uploading" pill. Purely visual (no pointer events). */
export function DropOverlay() {
  const hint = useCanvasUi((s) => s.dragHint);
  const uploads = useCanvasUi((s) => s.uploads);
  return (
    <>
      {hint && (
        <div
          className={clsx(
            'pointer-events-none absolute inset-2 z-10 flex animate-fade-in items-start justify-center rounded-xl border-2 border-dashed pt-6',
            hint.tone === 'ok' ? 'border-gold-400/70 bg-gold-400/[0.04]' : 'border-blood-400/70 bg-blood-500/[0.05]',
          )}
        >
          <span
            className={clsx(
              'flex items-center gap-2 rounded-full border bg-ink-950/90 px-4 py-1.5 text-sm font-medium shadow-modal backdrop-blur',
              hint.tone === 'ok' ? 'border-gold-500/60 text-gold-200' : 'border-blood-500/60 text-blood-300',
            )}
          >
            {hint.tone === 'ok' ? <ImagePlus className="h-4 w-4" aria-hidden /> : <Ban className="h-4 w-4" aria-hidden />}
            {hint.text}
          </span>
        </div>
      )}
      {uploads > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 animate-fade-in">
          <span className="flex items-center gap-2 rounded-full border border-ink-500 bg-ink-900/95 px-3.5 py-1.5 text-xs font-medium text-parchment-100 shadow-modal backdrop-blur">
            <Spinner size="xs" label="Subiendo imagen" />
            {uploads === 1 ? 'Subiendo imagen…' : `Subiendo ${uploads} imágenes…`}
          </span>
        </div>
      )}
    </>
  );
}
