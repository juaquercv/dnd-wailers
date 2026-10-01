import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import clsx from 'clsx';
import { Music, Play, Square } from 'lucide-react';
import type { LibraryEntry, SoundType } from '@wailers/shared';
import { api } from '../../../api/http';
import { Select, toast, type SelectOption } from '../../../components/ui';
import { getEffectiveVolume } from '../../../stores/settings';

// ---------------------------------------------------------------------------
// Shared preview player (one sound at a time across every picker)
// ---------------------------------------------------------------------------

let previewAudio: HTMLAudioElement | null = null;
let previewId: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function stopSoundPreview(): void {
  if (previewAudio) {
    previewAudio.pause();
    previewAudio.src = '';
    previewAudio = null;
  }
  if (previewId !== null) {
    previewId = null;
    emit();
  }
}

function playSoundPreview(entry: LibraryEntry<'sound'>): void {
  stopSoundPreview();
  const channel = entry.data.soundType === 'music' ? 'music' : entry.data.soundType === 'ambience' ? 'ambience' : 'effects';
  const audio = new Audio(entry.data.url);
  audio.volume = Math.max(0, Math.min(1, getEffectiveVolume(channel) * (entry.data.volume ?? 1)));
  audio.addEventListener('ended', () => {
    if (previewAudio === audio) stopSoundPreview();
  });
  audio.addEventListener('error', () => {
    if (previewAudio === audio) {
      stopSoundPreview();
      toast.error('No se pudo reproducir el sonido');
    }
  });
  previewAudio = audio;
  previewId = entry.id;
  emit();
  void audio.play().catch(() => {
    if (previewAudio === audio) stopSoundPreview();
  });
}

function usePreviewId(): string | null {
  return useSyncExternalStore(subscribe, () => previewId);
}

// ---------------------------------------------------------------------------
// Sound lists (cached per type for the page lifetime)
// ---------------------------------------------------------------------------

const soundCache = new Map<SoundType, Promise<LibraryEntry<'sound'>[]>>();

function loadSounds(soundType: SoundType): Promise<LibraryEntry<'sound'>[]> {
  let p = soundCache.get(soundType);
  if (!p) {
    p = api.library
      .search({ kind: 'sound', dataEquals: { soundType }, sort: 'name', order: 'asc', pageSize: 200 })
      .then((page) => page.items.filter((e): e is LibraryEntry<'sound'> => e.kind === 'sound'));
    p.catch(() => soundCache.delete(soundType));
    soundCache.set(soundType, p);
  }
  return p;
}

export interface SoundPickerProps {
  label: string;
  soundType: Extract<SoundType, 'music' | 'ambience'>;
  value: string | null;
  onChange: (soundId: string | null) => void;
  className?: string;
}

/** Library sound select (music or ambience) with a ▶ preview button. */
export function SoundPicker({ label, soundType, value, onChange, className }: SoundPickerProps) {
  const [sounds, setSounds] = useState<LibraryEntry<'sound'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [extra, setExtra] = useState<LibraryEntry<'sound'> | null>(null);
  const playing = usePreviewId();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadSounds(soundType)
      .then((list) => alive && setSounds(list))
      .catch(() => alive && setSounds([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [soundType]);

  // A sound picked elsewhere (other type filter, deleted list…) is fetched to show its name.
  useEffect(() => {
    if (!value || loading || sounds.some((s) => s.id === value)) {
      setExtra(null);
      return;
    }
    let alive = true;
    api.library
      .get<'sound'>(value)
      .then((entry) => alive && setExtra(entry))
      .catch(() => alive && setExtra(null));
    return () => {
      alive = false;
    };
  }, [value, loading, sounds]);

  useEffect(() => () => stopSoundPreview(), []);

  const all = useMemo(() => (extra ? [extra, ...sounds] : sounds), [extra, sounds]);
  const options = useMemo<SelectOption<string | null>[]>(() => {
    const none: SelectOption<string | null> = { value: null, label: soundType === 'music' ? 'Sin música' : 'Sin ambiente' };
    const list = all.map((s) => ({ value: s.id as string | null, label: s.name }));
    if (value && !all.some((s) => s.id === value)) list.unshift({ value, label: loading ? 'Cargando…' : 'Sonido no disponible' });
    return [none, ...list];
  }, [all, soundType, value, loading]);

  const current = value ? all.find((s) => s.id === value) ?? null : null;
  const isPlaying = current !== null && playing === current.id;

  return (
    <div className={clsx('min-w-0', className)}>
      <span className="label flex items-center gap-1.5">
        <Music className="h-3 w-3 text-gold-500" aria-hidden />
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <Select<string | null>
          value={value}
          onChange={(v) => {
            stopSoundPreview();
            onChange(v);
          }}
          options={options}
          size="sm"
          aria-label={label}
          containerClassName="min-w-0 flex-1"
          disabled={loading && sounds.length === 0 && !value}
        />
        <button
          type="button"
          disabled={!current}
          onClick={() => (isPlaying ? stopSoundPreview() : current && playSoundPreview(current))}
          title={isPlaying ? 'Detener' : 'Escuchar'}
          aria-label={isPlaying ? `Detener ${current?.name ?? ''}` : `Escuchar ${current?.name ?? ''}`}
          className={clsx(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition disabled:pointer-events-none disabled:opacity-35',
            isPlaying
              ? 'border-gold-500 bg-gold-500/20 text-gold-200 shadow-glow-gold'
              : 'border-ink-500 bg-ink-700 text-parchment-200 hover:border-gold-600 hover:text-gold-200',
          )}
        >
          {isPlaying ? <Square className="h-3 w-3 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
        </button>
      </div>
      {!loading && sounds.length === 0 && (
        <p className="mt-1 text-[11px] text-parchment-400">
          No hay sonidos de este tipo en la biblioteca. Súbelos desde la sección Sonidos.
        </p>
      )}
    </div>
  );
}
