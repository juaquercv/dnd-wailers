import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Disc3, Headphones, Map as MapIcon, Music, Play, Radio, RefreshCw, SlidersHorizontal, Square, Volume2, Wind, Zap } from 'lucide-react';
import { SOUND_TYPE_LABELS } from '@wailers/shared';
import { emitAck } from '../../api/socket';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { SearchInput } from '../../components/ui/SearchInput';
import { Slider } from '../../components/ui/Slider';
import { Spinner } from '../../components/ui/Spinner';
import { Tabs } from '../../components/ui/Tabs';
import { toast } from '../../components/ui/toast';
import { formatDuration } from '../../lib/format';
import { useIsDm, useSessionStore } from '../../stores/session';
import { audioEngine, type LoopChannel } from './audioEngine';
import { NowPlaying } from './NowPlaying';
import { PanelSection } from './PanelSection';
import { useSoundSearch, type SoundEntry } from './soundLibrary';
import { VolumeControls } from './VolumeControls';

const MASTER_DEBOUNCE_MS = 200;
const FIRE_FEEDBACK_MS = 650;

/** Music & sound sidebar. DM: full control of the session audio. Players: what is playing + own volumes. */
export function AudioPanel() {
  const isDm = useIsDm();
  return (
    <div className="scroll-thin flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-3">
      <PanelSection title="Sonando ahora" icon={<Disc3 />}>
        <NowPlaying canControl={isDm} />
      </PanelSection>
      {isDm && (
        <>
          <ModeSection />
          <TrackSection />
          <MasterVolumeSection />
          <SoundboardSection />
        </>
      )}
      <PanelSection
        title={isDm ? 'Mi volumen' : 'Volumen'}
        icon={<SlidersHorizontal />}
        description={isDm ? 'Solo afecta a lo que oyes tú en este dispositivo.' : 'Ajusta lo que oyes en este dispositivo.'}
      >
        <VolumeControls compact={isDm} />
      </PanelSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

function ModeSection() {
  const mode = useSessionStore((s) => s.view?.state.audio.mode ?? 'zone');
  const [busy, setBusy] = useState(false);

  const change = async (next: 'zone' | 'manual') => {
    if (next === mode || busy) return;
    setBusy(true);
    try {
      await emitAck('audio:mode', { mode: next });
    } catch (err) {
      toast.fromError(err, 'No se pudo cambiar el modo de audio');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelSection
      title="Modo de música"
      icon={<Radio />}
      aside={busy ? <Spinner size="xs" /> : null}
      description={
        mode === 'zone'
          ? 'Cada jugador oye la música y el ambiente de la zona que está viendo.'
          : 'Todos oyen las pistas que elijas aquí, estén donde estén.'
      }
    >
      <Tabs
        variant="pills"
        size="sm"
        fill
        value={mode}
        onChange={(next) => void change(next)}
        aria-label="Modo de música"
        items={[
          { id: 'zone', label: 'Música por zona', icon: <MapIcon /> },
          { id: 'manual', label: 'Manual para todos', icon: <Headphones /> },
        ]}
      />
    </PanelSection>
  );
}

// ---------------------------------------------------------------------------
// Music / ambience pickers
// ---------------------------------------------------------------------------

function TrackSection() {
  const [channel, setChannel] = useState<LoopChannel>('music');
  const [query, setQuery] = useState('');
  const audio = useSessionStore((s) => s.view?.state.audio ?? null);
  const { items, loading, error, reload } = useSoundSearch(channel, query);
  const [busyId, setBusyId] = useState<string | null>(null);
  const manual = audio?.mode === 'manual';
  const current = channel === 'music' ? audio?.music ?? null : audio?.ambience ?? null;

  const play = async (entry: SoundEntry) => {
    if (busyId) return;
    setBusyId(entry.id);
    try {
      if (!manual) {
        await emitAck('audio:mode', { mode: 'manual' });
        toast.info('Modo manual activado', { description: 'Todos oirán las pistas que elijas.' });
      }
      await emitAck('audio:play', { channel, soundId: entry.id });
    } catch (err) {
      toast.fromError(err, 'No se pudo reproducir la pista');
    } finally {
      setBusyId(null);
    }
  };

  const stop = async () => {
    if (busyId) return;
    setBusyId('__stop__');
    try {
      await emitAck('audio:play', { channel, soundId: null });
    } catch (err) {
      toast.fromError(err, 'No se pudo detener la pista');
    } finally {
      setBusyId(null);
    }
  };

  const label = SOUND_TYPE_LABELS[channel].toLowerCase();

  return (
    <PanelSection
      title="Pistas"
      icon={<Music />}
      aside={<IconButton icon={<RefreshCw />} title="Recargar lista" size="xs" onClick={reload} />}
    >
      <Tabs
        size="sm"
        fill
        value={channel}
        onChange={setChannel}
        aria-label="Canal"
        items={[
          { id: 'music', label: 'Música', icon: <Music /> },
          { id: 'ambience', label: 'Ambiente', icon: <Wind /> },
        ]}
      />
      <SearchInput value={query} onChange={setQuery} debounceMs={250} size="sm" placeholder={`Buscar ${label}…`} />
      <div className="scroll-thin max-h-64 overflow-y-auto rounded-lg border border-ink-600/70 bg-ink-950/40 p-1">
        {loading && items.length === 0 ? (
          <div className="flex justify-center py-6">
            <Spinner size="sm" showLabel label="Cargando pistas…" />
          </div>
        ) : error && items.length === 0 ? (
          <EmptyState compact icon={<Music />} title="No se pudo cargar" description={error} />
        ) : items.length === 0 ? (
          <EmptyState
            compact
            icon={channel === 'music' ? <Music /> : <Wind />}
            title={query ? 'Sin resultados' : `No hay pistas de ${label}`}
            description={query ? 'Prueba con otras palabras.' : 'Añade sonidos en la Biblioteca para usarlos aquí.'}
          />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {items.map((entry) => {
              const isCurrent = manual && current?.soundId === entry.id;
              return (
                <li
                  key={entry.id}
                  onDoubleClick={() => void play(entry)}
                  className={clsx(
                    'group flex items-center gap-2.5 rounded-md border px-2 py-1.5 transition-colors',
                    isCurrent ? 'border-gold-600/60 bg-gold-500/10' : 'border-transparent hover:border-ink-500 hover:bg-ink-800/70',
                  )}
                  title={entry.description || entry.name}
                >
                  <SoundThumb entry={entry} fallback={channel === 'music' ? <Music /> : <Wind />} active={isCurrent} />
                  <div className="min-w-0 flex-1">
                    <div className={clsx('truncate text-sm', isCurrent ? 'font-semibold text-gold-200' : 'text-parchment-100')}>{entry.name}</div>
                    <div className="truncate text-[11px] text-parchment-400">
                      {[entry.data.durationSec ? formatDuration(entry.data.durationSec) : null, ...entry.tags.slice(0, 3).map((t) => `#${t}`)]
                        .filter(Boolean)
                        .join(' · ') || SOUND_TYPE_LABELS[channel]}
                    </div>
                  </div>
                  {isCurrent ? (
                    <IconButton
                      icon={<Square />}
                      title="Detener para todos"
                      size="sm"
                      variant="danger"
                      loading={busyId === '__stop__'}
                      onClick={() => void stop()}
                    />
                  ) : (
                    <IconButton
                      icon={<Play />}
                      title="Reproducir para todos"
                      size="sm"
                      variant="secondary"
                      loading={busyId === entry.id}
                      disabled={busyId !== null && busyId !== entry.id}
                      onClick={() => void play(entry)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PanelSection>
  );
}

function SoundThumb({ entry, fallback, active }: { entry: SoundEntry; fallback: ReactNode; active?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className={clsx(
        'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border [&>svg]:h-4 [&>svg]:w-4',
        active ? 'border-gold-500/70 text-gold-300' : 'border-ink-500 text-parchment-400',
        'bg-ink-800',
      )}
    >
      {entry.imageUrl && !broken ? (
        <img src={entry.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        fallback
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DM master volume
// ---------------------------------------------------------------------------

function MasterVolumeSection() {
  const serverValue = useSessionStore((s) => s.view?.state.audio.master ?? 1);
  const [value, setValue] = useState(serverValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(serverValue);
  const editingUntil = useRef(0);

  useEffect(() => {
    if (!timer.current && Date.now() > editingUntil.current) setValue(serverValue);
  }, [serverValue]);

  const send = (volume: number) => {
    emitAck('audio:master', { volume }).catch((err: unknown) => toast.fromError(err, 'No se pudo cambiar el volumen maestro'));
  };

  const flush = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    send(latest.current);
  };

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        send(latest.current);
      }
    },
    [],
  );

  const onChange = (v: number) => {
    setValue(v);
    latest.current = v;
    editingUntil.current = Date.now() + 800;
    // Instant feedback for the DM; everyone else follows when the server broadcasts it.
    audioEngine.setDmMaster(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      send(latest.current);
    }, MASTER_DEBOUNCE_MS);
  };

  return (
    <PanelSection title="Volumen maestro" icon={<Volume2 />} description="Se aplica a la música, el ambiente y los efectos de todos los jugadores.">
      <Slider value={value} onChange={onChange} onCommit={flush} icon={<Volume2 />} aria-label="Volumen maestro para todos" />
    </PanelSection>
  );
}

// ---------------------------------------------------------------------------
// Sound effects board
// ---------------------------------------------------------------------------

function SoundboardSection() {
  const [query, setQuery] = useState('');
  const { items, loading, error, reload } = useSoundSearch('effect', query);
  const [fired, setFired] = useState<{ id: string; n: number } | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    },
    [],
  );

  const fire = (entry: SoundEntry) => {
    setFired((f) => ({ id: entry.id, n: (f?.n ?? 0) + 1 }));
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setFired(null), FIRE_FEEDBACK_MS);
    emitAck('audio:sfx', { soundId: entry.id }).catch((err: unknown) => toast.fromError(err, 'No se pudo lanzar el efecto'));
  };

  return (
    <PanelSection
      title="Efectos de sonido"
      icon={<Zap />}
      description="Pulsa un efecto para que suene para todos."
      aside={<IconButton icon={<RefreshCw />} title="Recargar efectos" size="xs" onClick={reload} />}
    >
      <SearchInput value={query} onChange={setQuery} debounceMs={250} size="sm" placeholder="Buscar efectos…" />
      {loading && items.length === 0 ? (
        <div className="flex justify-center py-6">
          <Spinner size="sm" showLabel label="Cargando efectos…" />
        </div>
      ) : error && items.length === 0 ? (
        <EmptyState compact icon={<Zap />} title="No se pudo cargar" description={error} />
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon={<Zap />}
          title={query ? 'Sin resultados' : 'No hay efectos de sonido'}
          description={query ? 'Prueba con otras palabras.' : 'Añade sonidos de tipo «Efecto» en la Biblioteca.'}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(6.75rem,1fr))] gap-1.5">
          {items.map((entry) => {
            const isFired = fired?.id === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => fire(entry)}
                title={entry.description || entry.name}
                className={clsx(
                  'group relative flex min-h-[3.25rem] items-center gap-2 overflow-hidden rounded-lg border px-2 py-1.5 text-left transition duration-150 active:scale-[0.97]',
                  isFired
                    ? 'border-gold-400/80 bg-gold-500/20 shadow-glow-gold'
                    : 'border-ink-500 bg-ink-800/80 hover:border-gold-700 hover:bg-ink-700',
                )}
              >
                {isFired && <span key={fired.n} aria-hidden className="absolute inset-0 animate-ping rounded-lg border-2 border-gold-300/60" />}
                <SoundThumb entry={entry} fallback={<Zap />} active={isFired} />
                <span className="line-clamp-2 min-w-0 flex-1 text-xs font-medium leading-tight text-parchment-100 group-hover:text-parchment-50">
                  {entry.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </PanelSection>
  );
}
