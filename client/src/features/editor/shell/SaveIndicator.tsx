import { useState } from 'react';
import clsx from 'clsx';
import { CircleAlert, CloudUpload, Check, RotateCw } from 'lucide-react';
import { Spinner, toast } from '../../../components/ui';
import { useEditorStore } from '../editorStore';
import { currentSaveError, retrySave, useCampaignSaveStore } from './campaignSave';

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error';

const STATUS_LABELS: Record<Exclude<SaveStatus, 'error'>, string> = {
  saved: 'Guardado',
  saving: 'Guardando…',
  dirty: 'Cambios sin guardar',
};

/** Combined zone + campaign save status ('error' while a zone or campaign save failed and is still unsaved). */
export function useSaveStatus(): { status: SaveStatus; error: string | null } {
  const saveState = useEditorStore((s) => s.saveState);
  const saveError = useEditorStore((s) => s.saveError);
  const campaignSaveError = useEditorStore((s) => s.campaignSaveError);
  const campaignPending = useCampaignSaveStore((s) => s.pending);
  if (saveState === 'error') return { status: 'error', error: saveError };
  if (campaignSaveError !== null) return { status: 'error', error: campaignSaveError };
  if (saveState === 'saving' || campaignPending) return { status: 'saving', error: null };
  if (saveState === 'dirty') return { status: 'dirty', error: null };
  return { status: 'saved', error: null };
}

/** "Guardado ✓ / Guardando… / Cambios sin guardar / Error al guardar + Reintentar". */
export function SaveIndicator({ className }: { className?: string }) {
  const { status, error } = useSaveStatus();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      const ok = await retrySave();
      if (ok) toast.success('Cambios guardados');
      else toast.error('Sigue sin poder guardarse', { description: currentSaveError() ?? undefined });
    } finally {
      setRetrying(false);
    }
  };

  if (status === 'error') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-full border border-blood-500/60 bg-blood-600/15 py-0.5 pl-2 pr-0.5 text-xs font-medium text-blood-300',
          className,
        )}
        title={error ?? undefined}
      >
        <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="hidden whitespace-nowrap lg:inline">Error al guardar</span>
        <button
          type="button"
          onClick={() => void retry()}
          disabled={retrying}
          className="inline-flex items-center gap-1 rounded-full bg-blood-600/40 px-2 py-0.5 text-[11px] font-semibold text-parchment-50 transition hover:bg-blood-500/60 disabled:opacity-60"
        >
          <RotateCw className={clsx('h-3 w-3', retrying && 'animate-spin')} aria-hidden />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        status === 'saved' && 'border-emerald-600/40 bg-emerald-500/10 text-emerald-300',
        status === 'saving' && 'border-gold-700/50 bg-gold-500/10 text-gold-200',
        status === 'dirty' && 'border-ink-500 bg-ink-800 text-parchment-200',
        className,
      )}
      title={STATUS_LABELS[status]}
      aria-label={STATUS_LABELS[status]}
    >
      {status === 'saved' && <Check className="h-3.5 w-3.5" aria-hidden />}
      {status === 'saving' && <Spinner size="xs" label="Guardando…" />}
      {status === 'dirty' && <CloudUpload className="h-3.5 w-3.5 text-gold-400" aria-hidden />}
      <span className="hidden xl:inline">{STATUS_LABELS[status]}</span>
    </div>
  );
}
