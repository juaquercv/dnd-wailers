import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  Check,
  CircleAlert,
  FileAudio,
  Music,
  Pause,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Trash2,
  Upload,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { MAX_UPLOAD_BYTES, SOUND_TYPES, normalizeText, type CategoryNode, type SoundType } from '@wailers/shared';
import { api } from '../../api/http';
import { withAlpha } from '../../components/ui/Badge';
import { Button, type ButtonSize, type ButtonVariant } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { IconButton } from '../../components/ui/IconButton';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { Tabs } from '../../components/ui/Tabs';
import { TextInput } from '../../components/ui/TextInput';
import { toast } from '../../components/ui/toast';
import { Toggle } from '../../components/ui/Toggle';
import { formatBytes, formatDuration, plural } from '../../lib/format';
import { useCategories } from '../../stores/categories';
import { stopSoundPreview, toggleSoundPreview, useSoundPreviewPlaying } from '../library/soundPreview';
import {
  AUDIO_ACCEPT,
  AUDIO_FORMATS_LABEL,
  SOUND_NAME_MAX,
  detectAudioDuration,
  guessSoundType,
  normalizeAudioFile,
  soundNameFromFile,
} from './audioFiles';
import { notifySoundLibraryChanged, type SoundEntry } from './soundLibrary';

export { AUDIO_ACCEPT, AUDIO_FORMATS_LABEL, soundNameFromFile };

/** True when a drag carries files (used to show drop targets). */
export function dragHasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

const DEFAULT_VOLUME = 0.8;
const UPLOAD_CONCURRENCY = 2;

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

type RowStatus = 'ready' | 'uploading' | 'saving' | 'done' | 'error';

interface UploadRow {
  key: string;
  file: File;
  previewUrl: string;
  name: string;
  soundType: SoundType;
  typeTouched: boolean;
  loop: boolean;
  loopTouched: boolean;
  moodIds: string[];
  durationSec: number | null;
  status: RowStatus;
  error: string | null;
  /** Kept after a successful upload so a retry only creates the library entry. */
  uploadedUrl: string | null;
  entry: SoundEntry | null;
}

export const SOUND_TYPE_UI: Record<SoundType, { label: string; short: string; icon: LucideIcon; hint: string }> = {
  music: { label: 'Música de fondo', short: 'Música', icon: Music, hint: 'Suena en bucle de fondo; cambia con fundido.' },
  ambience: { label: 'Ambiente', short: 'Ambiente', icon: Wind, hint: 'Capa continua: lluvia, taberna, viento…' },
  effect: { label: 'Efecto de sonido', short: 'Efecto', icon: Zap, hint: 'Suena una vez cuando lo lanzas.' },
};

let rowSeq = 0;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Mood values: children of the sound facet "Estado de ánimo" (or of the first sound facet). */
function moodOptions(tree: CategoryNode[]): CategoryNode[] {
  const facet = tree.find((f) => normalizeText(f.name).includes('animo')) ?? tree[0] ?? null;
  return facet ? facet.children : [];
}

function emojiOf(icon: string | null): string | null {
  return icon && !/^[a-z0-9_-]+$/i.test(icon) ? icon : null;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export interface SoundUploadOptions {
  /** Type for files that cannot be guessed (default "music"). */
  defaultType?: SoundType;
  /** Types the user can choose (default all). */
  types?: SoundType[];
  /** Allow several files (default true). */
  multiple?: boolean;
  title?: string;
  /** Category ids added to every new sound (e.g. the library filters in use). */
  extraCategoryIds?: string[];
  /** Called after each batch with the sounds created in it. */
  onUploaded?: (entries: SoundEntry[]) => void;
  /** Extra action next to each created sound in the summary ("Reproducir ahora", "Ver ficha"…). */
  renderCreatedAction?: (entry: SoundEntry, close: () => void) => ReactNode;
  /** Close the dialog as soon as every file was uploaded without errors. */
  autoCloseOnSuccess?: boolean;
}

export interface SoundUploadModalProps extends SoundUploadOptions {
  open: boolean;
  onClose: () => void;
  /** Files to start with. */
  files: File[];
}

/** Upload one or many audio files and create a library sound for each. */
export function SoundUploadModal(props: SoundUploadModalProps) {
  if (!props.open) return null;
  return <UploadDialog {...props} />;
}

function UploadDialog({
  onClose,
  files,
  defaultType = 'music',
  types: typesProp,
  multiple = true,
  title,
  extraCategoryIds,
  onUploaded,
  renderCreatedAction,
  autoCloseOnSuccess = false,
}: SoundUploadModalProps) {
  const typesKey = (typesProp ?? []).join(',');
  const types = useMemo<SoundType[]>(() => {
    const list = SOUND_TYPES.filter((t) => typesKey.split(',').includes(t));
    return list.length > 0 ? list : [...SOUND_TYPES];
  }, [typesKey]);
  const fallbackType: SoundType = types.includes(defaultType) ? defaultType : types[0] ?? 'effect';
  const confirm = useConfirm();
  const { tree } = useCategories('sound');
  const moods = useMemo(() => moodOptions(tree), [tree]);

  const [rows, setRows] = useState<UploadRow[]>([]);
  const rowsRef = useRef<UploadRow[]>([]);
  rowsRef.current = rows;
  const urlsRef = useRef(new Set<string>());
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [batch, setBatch] = useState<{ total: number; finished: number } | null>(null);

  const patchRow = useCallback((key: string, patch: Partial<UploadRow> | ((row: UploadRow) => Partial<UploadRow>)) => {
    setRows((prev) => {
      const next = prev.map((r) => (r.key === key ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r));
      rowsRef.current = next;
      return next;
    });
  }, []);

  const revoke = useCallback((url: string) => {
    if (!urlsRef.current.has(url)) return;
    URL.revokeObjectURL(url);
    urlsRef.current.delete(url);
  }, []);

  const addFiles = useCallback(
    (list: File[]) => {
      const accepted: File[] = [];
      const rejected: string[] = [];
      const tooBig: string[] = [];
      for (const raw of list) {
        const file = normalizeAudioFile(raw);
        if (!file) rejected.push(raw.name);
        else if (file.size > MAX_UPLOAD_BYTES) tooBig.push(raw.name);
        else accepted.push(file);
      }
      if (rejected.length > 0) {
        toast.warning(rejected.length === 1 ? 'Formato de audio no compatible' : `${rejected.length} archivos con formato no compatible`, {
          description: `${rejected.slice(0, 3).join(', ')}${rejected.length > 3 ? '…' : ''} · Formatos: ${AUDIO_FORMATS_LABEL}.`,
        });
      }
      if (tooBig.length > 0) {
        toast.warning(`Demasiado grande (máximo ${formatBytes(MAX_UPLOAD_BYTES)})`, { description: tooBig.slice(0, 3).join(', ') });
      }
      const current = rowsRef.current;
      const room = multiple ? accepted : accepted.slice(0, 1);
      if (room.length === 0) return;
      const created: UploadRow[] = room.map((file) => {
        const previewUrl = URL.createObjectURL(file);
        urlsRef.current.add(previewUrl);
        const soundType = guessSoundType(file.name, null, types, fallbackType);
        return {
          key: `upl-${++rowSeq}`,
          file,
          previewUrl,
          name: soundNameFromFile(file.name),
          soundType,
          typeTouched: false,
          loop: soundType !== 'effect',
          loopTouched: false,
          moodIds: [],
          durationSec: null,
          status: 'ready',
          error: null,
          uploadedUrl: null,
          entry: null,
        };
      });
      let next: UploadRow[];
      if (multiple) {
        next = [...current, ...created];
      } else {
        for (const r of current) if (r.status !== 'done') revoke(r.previewUrl);
        next = [...current.filter((r) => r.status === 'done'), ...created];
      }
      rowsRef.current = next;
      setRows(next);
      for (const row of created) {
        void detectAudioDuration(row.previewUrl).then((durationSec) => {
          patchRow(row.key, (r) => {
            const soundType = r.typeTouched ? r.soundType : guessSoundType(r.file.name, durationSec, types, fallbackType);
            return { durationSec, soundType, loop: r.loopTouched ? r.loop : soundType !== 'effect' };
          });
        });
      }
    },
    [multiple, types, fallbackType, patchRow, revoke],
  );

  const lastFiles = useRef<File[] | null>(null);
  useEffect(() => {
    if (files === lastFiles.current) return;
    lastFiles.current = files;
    if (files.length > 0) addFiles(files);
  }, [files, addFiles]);

  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      stopSoundPreview();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const removeRow = (key: string) => {
    const row = rowsRef.current.find((r) => r.key === key);
    if (!row) return;
    stopSoundPreview();
    revoke(row.previewUrl);
    const next = rowsRef.current.filter((r) => r.key !== key);
    rowsRef.current = next;
    setRows(next);
  };

  const setType = (key: string, soundType: SoundType) =>
    patchRow(key, (r) => ({ soundType, typeTouched: true, loop: r.loopTouched ? r.loop : soundType !== 'effect' }));

  const setAllTypes = (soundType: SoundType) => {
    setRows((prev) => {
      const next = prev.map((r) =>
        r.status === 'ready' || r.status === 'error' ? { ...r, soundType, typeTouched: true, loop: r.loopTouched ? r.loop : soundType !== 'effect' } : r,
      );
      rowsRef.current = next;
      return next;
    });
  };

  // ----- upload -------------------------------------------------------------

  const processRow = async (key: string): Promise<SoundEntry | null> => {
    const row = rowsRef.current.find((r) => r.key === key);
    if (!row) return null;
    try {
      let url = row.uploadedUrl;
      if (!url) {
        patchRow(key, { status: 'uploading', error: null });
        const res = await api.uploads.upload(row.file);
        url = res.url;
        patchRow(key, { uploadedUrl: url });
      }
      patchRow(key, { status: 'saving', error: null });
      const latest = rowsRef.current.find((r) => r.key === key) ?? row;
      const entry = await api.library.create<'sound'>({
        kind: 'sound',
        name: latest.name.trim().slice(0, SOUND_NAME_MAX) || soundNameFromFile(latest.file.name),
        description: '',
        imageUrl: null,
        tags: [],
        categoryIds: [...new Set([...(extraCategoryIds ?? []), ...latest.moodIds])],
        data: {
          url,
          soundType: latest.soundType,
          loop: latest.loop,
          volume: DEFAULT_VOLUME,
          durationSec: latest.durationSec,
        },
      });
      patchRow(key, { status: 'done', entry, error: null });
      return entry;
    } catch (err) {
      patchRow(key, { status: 'error', error: errorMessage(err, 'No se pudo subir el archivo') });
      return null;
    }
  };

  const uploadAll = async () => {
    if (busy) return;
    const keys = rowsRef.current.filter((r) => r.status === 'ready' || r.status === 'error').map((r) => r.key);
    if (keys.length === 0) return;
    stopSoundPreview();
    setBusy(true);
    setBatch({ total: keys.length, finished: 0 });
    const queue = [...keys];
    const created: SoundEntry[] = [];
    const worker = async () => {
      for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
        const entry = await processRow(key);
        if (entry) created.push(entry);
        setBatch((b) => (b ? { ...b, finished: b.finished + 1 } : b));
      }
    };
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, keys.length) }, worker));
    setBusy(false);
    const failed = keys.length - created.length;
    if (created.length > 0) {
      notifySoundLibraryChanged();
      onUploaded?.(created);
    }
    if (failed === 0) {
      if (autoCloseOnSuccess) {
        toast.success(created.length === 1 ? `«${created[0]!.name}» añadido a la biblioteca` : `${created.length} sonidos añadidos a la biblioteca`);
        onClose();
      }
    } else {
      toast.error(failed === 1 ? 'Un archivo no se pudo subir' : `${failed} archivos no se pudieron subir`, {
        description: 'Revisa el mensaje de cada uno y pulsa «Reintentar».',
      });
    }
  };

  // ----- close ----------------------------------------------------------------

  const pending = rows.filter((r) => r.status === 'ready' || r.status === 'error');
  const done = rows.filter((r) => r.status === 'done');

  const close = async () => {
    if (busy) return;
    if (pending.length > 0) {
      const ok = await confirm({
        title: 'Descartar archivos',
        message: `${plural(pending.length, 'archivo no se ha subido', 'archivos no se han subido')} todavía. ¿Cerrar sin subirlos?`,
        confirmLabel: 'Descartar',
        danger: true,
      });
      if (!ok) return;
    }
    onClose();
  };

  // ----- drop -----------------------------------------------------------------

  // Events from this portal bubble through the React tree: stop them so panels below do not react.
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = busy ? 'none' : 'copy';
    if (!over && !busy) setOver(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setOver(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    if (!busy) addFiles(Array.from(e.dataTransfer.files));
  };

  const totalBytes = rows.reduce((sum, r) => sum + r.file.size, 0);
  const progress = batch ? Math.round((batch.finished / Math.max(1, batch.total)) * 100) : 0;
  const allDone = rows.length > 0 && pending.length === 0 && !busy;
  const singleType = types.length === 1 ? types[0]! : null;
  const heading = title ?? (singleType ? `Subir ${SOUND_TYPE_UI[singleType].label.toLowerCase()}` : multiple ? 'Subir sonidos' : 'Subir sonido');

  const footer = (
    <>
      {busy && batch ? (
        <div className="mr-auto flex min-w-[10rem] flex-1 items-center gap-3" aria-live="polite">
          <div className="h-2 flex-1 overflow-hidden rounded-full border border-ink-600 bg-ink-950">
            <div className="h-full rounded-full bg-gradient-to-r from-gold-600 to-gold-300 transition-[width] duration-300" style={{ width: `${Math.max(6, progress)}%` }} />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-parchment-300">
            {batch.finished} de {batch.total}
          </span>
        </div>
      ) : (
        (multiple || rows.length === 0) && (
          <Button variant="ghost" size="sm" icon={<Plus />} className="mr-auto" onClick={() => inputRef.current?.click()}>
            {rows.length === 0 ? 'Elegir archivos' : 'Añadir más'}
          </Button>
        )
      )}
      {allDone ? (
        <Button variant="primary" icon={<Check />} onClick={onClose}>
          Listo
        </Button>
      ) : (
        <>
          <Button variant="ghost" disabled={busy} onClick={() => void close()}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<Upload />} loading={busy} disabled={pending.length === 0} onClick={() => void uploadAll()}>
            {busy
              ? 'Subiendo…'
              : pending.some((r) => r.status === 'error') && pending.every((r) => r.status === 'error')
                ? `Reintentar (${pending.length})`
                : pending.length <= 1
                  ? 'Subir sonido'
                  : `Subir ${pending.length} sonidos`}
          </Button>
        </>
      )}
    </>
  );

  return (
    <Modal
      open
      onClose={() => void close()}
      title={heading}
      subtitle={
        rows.length > 0
          ? `${plural(rows.length, 'archivo', 'archivos')} · ${formatBytes(totalBytes)}${done.length > 0 ? ` · ${done.length} en la biblioteca` : ''}`
          : `${AUDIO_FORMATS_LABEL} · máximo ${formatBytes(MAX_UPLOAD_BYTES)} por archivo`
      }
      icon={<Upload />}
      size="lg"
      closeOnBackdrop={false}
      closeOnEsc={!busy}
      footer={footer}
    >
      <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className="relative flex min-h-[12rem] flex-col gap-3">
        {rows.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={clsx(
              'flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition',
              over ? 'border-gold-400 bg-gold-500/10' : 'border-ink-500 bg-ink-950/40 hover:border-gold-700 hover:bg-ink-800/60',
            )}
          >
            <FileAudio className="h-9 w-9 text-gold-400" />
            <span className="font-display text-base font-semibold text-parchment-50">Arrastra aquí tus archivos de audio</span>
            <span className="text-sm text-parchment-300">o haz clic para elegirlos{multiple ? ' (puedes elegir varios)' : ''}</span>
            <span className="text-xs text-parchment-500">{AUDIO_FORMATS_LABEL}</span>
          </button>
        ) : (
          <>
            {multiple && types.length > 1 && pending.length > 1 && !busy && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-600/60 bg-ink-950/40 px-3 py-2">
                <span className="text-xs font-semibold text-parchment-300">Marcar todos como:</span>
                {types.map((t) => {
                  const Icon = SOUND_TYPE_UI[t].icon;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAllTypes(t)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800/80 px-2.5 py-1 text-xs text-parchment-200 transition hover:border-gold-600 hover:text-gold-200"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {SOUND_TYPE_UI[t].label}
                    </button>
                  );
                })}
              </div>
            )}
            <ul className="flex flex-col gap-2">
              {rows.map((row) => (
                <RowCard
                  key={row.key}
                  row={row}
                  types={types}
                  moods={moods}
                  locked={busy}
                  onName={(name) => patchRow(row.key, { name })}
                  onType={(t) => setType(row.key, t)}
                  onLoop={(loop) => patchRow(row.key, { loop, loopTouched: true })}
                  onMoods={(moodIds) => patchRow(row.key, { moodIds })}
                  onRemove={() => removeRow(row.key)}
                  onRetry={() => void uploadAll()}
                  createdAction={row.entry && renderCreatedAction ? renderCreatedAction(row.entry, () => void close()) : null}
                />
              ))}
            </ul>
            {multiple && !busy && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={clsx(
                  'flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-3 text-sm transition',
                  over ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'border-ink-600 text-parchment-400 hover:border-gold-700 hover:text-parchment-100',
                )}
              >
                <Plus className="h-4 w-4" /> Añadir más archivos (o arrástralos aquí)
              </button>
            )}
          </>
        )}
        {over && rows.length > 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl border-2 border-dashed border-gold-400 bg-ink-950/80 backdrop-blur-[1px]">
            <span className="flex items-center gap-2 font-display text-lg text-gold-200">
              <Upload className="h-5 w-5" /> Suelta para añadirlos
            </span>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={AUDIO_ACCEPT}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.target.value = '';
          addFiles(list);
        }}
      />
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Row card
// ---------------------------------------------------------------------------

interface RowCardProps {
  row: UploadRow;
  types: SoundType[];
  moods: CategoryNode[];
  locked: boolean;
  onName: (name: string) => void;
  onType: (type: SoundType) => void;
  onLoop: (loop: boolean) => void;
  onMoods: (ids: string[]) => void;
  onRemove: () => void;
  onRetry: () => void;
  createdAction: ReactNode;
}

function RowCard({ row, types, moods, locked, onName, onType, onLoop, onMoods, onRemove, onRetry, createdAction }: RowCardProps) {
  const playing = useSoundPreviewPlaying(row.key);
  const editable = !locked && (row.status === 'ready' || row.status === 'error');
  const working = row.status === 'uploading' || row.status === 'saving';
  const TypeIcon = SOUND_TYPE_UI[row.soundType].icon;
  const meta = [row.file.name, formatBytes(row.file.size), row.durationSec !== null ? formatDuration(row.durationSec) : null].filter(Boolean).join(' · ');

  const preview = (
    <IconButton
      icon={playing ? <Pause /> : <Play />}
      title={playing ? 'Pausar' : 'Escuchar'}
      size="sm"
      variant="secondary"
      active={playing}
      onClick={() => toggleSoundPreview(row.key, row.previewUrl, { volume: DEFAULT_VOLUME, soundType: row.soundType })}
    />
  );

  if (row.status === 'done' && row.entry) {
    return (
      <li className="flex animate-fade-in flex-wrap items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/[0.06] px-3 py-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
          <Check className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-parchment-50">{row.entry.name}</div>
          <div className="flex items-center gap-1.5 truncate text-[11px] text-parchment-400">
            <TypeIcon className="h-3 w-3 shrink-0" />
            {SOUND_TYPE_UI[row.entry.data.soundType].label}
            {row.entry.data.loop && (
              <>
                {' · '}
                <Repeat className="h-3 w-3 shrink-0" /> bucle
              </>
            )}
            {row.entry.data.durationSec ? ` · ${formatDuration(row.entry.data.durationSec)}` : ''}
          </div>
        </div>
        {preview}
        {createdAction}
      </li>
    );
  }

  return (
    <li
      className={clsx(
        'flex flex-col gap-2.5 rounded-xl border px-3 py-2.5 transition-colors',
        row.status === 'error' ? 'border-blood-500/60 bg-blood-500/[0.06]' : working ? 'border-gold-600/50 bg-gold-500/[0.05]' : 'border-ink-600/70 bg-ink-950/40',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={clsx(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border [&>svg]:h-4 [&>svg]:w-4',
            row.status === 'error' ? 'border-blood-500/60 text-blood-300' : 'border-ink-500 bg-ink-800 text-gold-300',
          )}
        >
          {working ? <Spinner size="xs" /> : row.status === 'error' ? <CircleAlert /> : <TypeIcon />}
        </span>
        <div className="min-w-0 flex-1">
          <TextInput
            size="sm"
            value={row.name}
            maxLength={SOUND_NAME_MAX}
            disabled={!editable}
            aria-label={`Nombre de ${row.file.name}`}
            placeholder={soundNameFromFile(row.file.name)}
            onValueChange={onName}
          />
          <div className="mt-1 truncate text-[11px] text-parchment-500" title={row.file.name}>
            {working ? (row.status === 'uploading' ? 'Subiendo archivo…' : 'Guardando en la biblioteca…') : meta}
          </div>
        </div>
        {preview}
        <IconButton icon={<Trash2 />} title="Quitar de la lista" size="sm" variant="danger" disabled={!editable} onClick={onRemove} />
      </div>

      {working && (
        <div className="h-1 overflow-hidden rounded-full bg-ink-800" aria-hidden>
          <div className="h-full w-full animate-shimmer bg-[linear-gradient(90deg,transparent,#e9c063,transparent)] bg-[length:200%_100%]" />
        </div>
      )}

      {row.status === 'error' && row.error && (
        <div className="flex items-center gap-2 rounded-md bg-blood-500/10 px-2.5 py-1.5 text-xs text-blood-200">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{row.error}</span>
          {!locked && (
            <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={onRetry}>
              Reintentar
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-[2.625rem]">
        {types.length > 1 ? (
          <Tabs<SoundType>
            variant="pills"
            size="sm"
            aria-label="Tipo de sonido"
            value={row.soundType}
            onChange={(t) => editable && onType(t)}
            items={types.map((t) => {
              const Icon = SOUND_TYPE_UI[t].icon;
              return { id: t, label: SOUND_TYPE_UI[t].label, icon: <Icon />, title: SOUND_TYPE_UI[t].hint, disabled: !editable };
            })}
          />
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-parchment-300">
            <TypeIcon className="h-3.5 w-3.5 text-gold-400" /> {SOUND_TYPE_UI[row.soundType].label}
          </span>
        )}
        <Toggle size="sm" label="En bucle" checked={row.loop} disabled={!editable} onChange={onLoop} title="Se repite al terminar" />
      </div>

      {moods.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pl-[2.625rem]">
          <span className="mr-0.5 text-[11px] text-parchment-400">Ánimo (opcional):</span>
          {moods.map((m) => {
            const active = row.moodIds.includes(m.id);
            const color = m.color ?? '#e9c063';
            const emoji = emojiOf(m.icon);
            return (
              <button
                key={m.id}
                type="button"
                disabled={!editable}
                aria-pressed={active}
                onClick={() => onMoods(active ? row.moodIds.filter((id) => id !== m.id) : [...row.moodIds, m.id])}
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition disabled:opacity-50',
                  !active && 'border-ink-500 bg-ink-800/60 text-parchment-300 hover:border-ink-400 hover:text-parchment-100',
                )}
                style={active ? { color, borderColor: withAlpha(color, 0.6), backgroundColor: withAlpha(color, 0.15) } : undefined}
              >
                {emoji && <span aria-hidden>{emoji}</span>}
                {m.name}
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Picker + modal controller
// ---------------------------------------------------------------------------

export interface SoundUploader {
  /** Opens the native file picker; the dialog appears with the chosen files. */
  pick: () => void;
  /** Opens the dialog with these files (e.g. dropped on a panel). */
  openWith: (files: File[]) => void;
  /** Render once: hidden input + dialog. */
  element: ReactNode;
}

export function useSoundUploader(options: SoundUploadOptions = {}): SoundUploader {
  const [files, setFiles] = useState<File[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const multiple = options.multiple !== false;

  const pick = useCallback(() => inputRef.current?.click(), []);
  const openWith = useCallback((list: File[]) => {
    if (list.length > 0) setFiles(list);
  }, []);

  const element = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={AUDIO_ACCEPT}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (list.length > 0) setFiles(list);
        }}
      />
      <SoundUploadModal {...options} open={files !== null} files={files ?? []} onClose={() => setFiles(null)} />
    </>
  );

  return { pick, openWith, element };
}

export interface SoundUploadButtonProps extends SoundUploadOptions {
  label?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
  block?: boolean;
  epic?: boolean;
  disabled?: boolean;
  buttonTitle?: string;
}

/** Button that opens the file picker and then the upload dialog. */
export function SoundUploadButton({ label, variant = 'secondary', size = 'md', icon, className, block, epic, disabled, buttonTitle, ...options }: SoundUploadButtonProps) {
  const uploader = useSoundUploader(options);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        icon={icon ?? <Upload />}
        className={className}
        block={block}
        epic={epic}
        disabled={disabled}
        title={buttonTitle ?? `Sube tus propios archivos de audio (${AUDIO_FORMATS_LABEL})`}
        onClick={uploader.pick}
      >
        {label ?? 'Subir sonidos'}
      </Button>
      {uploader.element}
    </>
  );
}
