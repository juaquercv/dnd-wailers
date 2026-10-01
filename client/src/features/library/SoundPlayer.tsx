import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import clsx from 'clsx';
import { Pause, Play, Repeat, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type { SoundType } from '@wailers/shared';
import { formatDuration } from '../../lib/format';
import { useEffectiveVolume } from '../../stores/settings';
import { channelForSound, onPreviewStart, stopSoundPreview } from './soundPreview';

export interface SoundPlayerProps {
  url: string;
  soundType?: SoundType | null;
  /** Initial loop state. */
  loop?: boolean;
  /** Default 0..1 volume of the entry. */
  volume?: number;
  compact?: boolean;
  /** Reports the real duration once the metadata is loaded. */
  onDuration?: (seconds: number) => void;
  className?: string;
}

/** Inline audio player (play/pause, seek, loop, volume) scaled by the user's channel volume. */
export function SoundPlayer({ url, soundType, loop = false, volume = 0.8, compact = false, onDuration, className }: SoundPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [looping, setLooping] = useState(loop);
  const [vol, setVol] = useState(volume);
  const [error, setError] = useState(false);
  const channel = useEffectiveVolume(channelForSound(soundType));
  const onDurationRef = useRef(onDuration);
  onDurationRef.current = onDuration;

  useEffect(() => setLooping(loop), [loop]);
  useEffect(() => setVol(volume), [volume]);

  useEffect(() => {
    const a = new Audio();
    a.preload = 'metadata';
    audioRef.current = a;
    setPlaying(false);
    setCurrent(0);
    setDuration(null);
    setError(false);
    const onTime = () => setCurrent(a.currentTime);
    const onMeta = () => {
      if (Number.isFinite(a.duration)) {
        setDuration(a.duration);
        onDurationRef.current?.(a.duration);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };
    const onError = () => {
      setError(true);
      setPlaying(false);
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onMeta);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    a.addEventListener('error', onError);
    if (url) a.src = url;
    const off = onPreviewStart(() => a.pause());
    return () => {
      off();
      a.pause();
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('durationchange', onMeta);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('error', onError);
      a.removeAttribute('src');
      a.load();
      audioRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = looping;
  }, [looping, url]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, vol * channel));
  }, [vol, channel, url]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a || !url) return;
    if (a.paused) {
      stopSoundPreview();
      setError(false);
      a.play().catch(() => setError(true));
    } else {
      a.pause();
    }
  };

  const restart = () => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = 0;
    setCurrent(0);
  };

  const seekFromPointer = (clientX: number) => {
    const a = audioRef.current;
    const bar = barRef.current;
    if (!a || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    a.currentTime = ratio * duration;
    setCurrent(a.currentTime);
  };

  const onBarPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromPointer(e.clientX);
  };

  const pct = duration ? Math.min(100, (current / duration) * 100) : 0;
  const muted = channel <= 0;

  return (
    <div
      className={clsx(
        'flex flex-col gap-2 rounded-xl border border-sky-500/25 bg-gradient-to-b from-sky-950/30 to-ink-950/60',
        compact ? 'p-2' : 'p-3',
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={toggle}
          disabled={!url}
          title={playing ? 'Pausar' : 'Reproducir'}
          aria-label={playing ? 'Pausar' : 'Reproducir'}
          className={clsx(
            'flex shrink-0 items-center justify-center rounded-full border border-sky-400/50 bg-sky-500/20 text-sky-100 transition hover:bg-sky-500/35 active:scale-95 disabled:opacity-40',
            compact ? 'h-8 w-8' : 'h-10 w-10',
            playing && 'shadow-[0_0_16px_-2px_rgba(90,184,240,0.7)]',
          )}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div
            ref={barRef}
            role="slider"
            tabIndex={0}
            aria-label="Posición de reproducción"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration ?? 0)}
            aria-valuenow={Math.round(current)}
            onPointerDown={onBarPointerDown}
            onPointerMove={(e) => {
              if (e.buttons === 1) seekFromPointer(e.clientX);
            }}
            onKeyDown={(e) => {
              const a = audioRef.current;
              if (!a || !duration) return;
              if (e.key === 'ArrowRight') a.currentTime = Math.min(duration, a.currentTime + 5);
              else if (e.key === 'ArrowLeft') a.currentTime = Math.max(0, a.currentTime - 5);
              else return;
              e.preventDefault();
              setCurrent(a.currentTime);
            }}
            className="group relative h-2 cursor-pointer rounded-full bg-ink-700"
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-500 to-sky-300"
              style={{ width: `${pct}%` }}
            />
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-900 bg-sky-200 opacity-0 shadow transition group-hover:opacity-100"
              style={{ left: `${pct}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-parchment-400">
            <span>{formatDuration(current)}</span>
            {error ? <span className="text-blood-300">No se pudo cargar el audio</span> : <span>{duration ? formatDuration(duration) : '—'}</span>}
          </div>
        </div>
        {!compact && (
          <button
            type="button"
            onClick={restart}
            title="Volver al inicio"
            aria-label="Volver al inicio"
            className="rounded-md p-1.5 text-parchment-400 transition hover:bg-ink-700 hover:text-parchment-100"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setLooping((l) => !l)}
          title={looping ? 'Bucle activado' : 'Bucle desactivado'}
          aria-pressed={looping}
          className={clsx(
            'rounded-md p-1.5 transition hover:bg-ink-700',
            looping ? 'text-sky-300' : 'text-parchment-500 hover:text-parchment-200',
          )}
        >
          <Repeat className="h-4 w-4" />
        </button>
      </div>
      {!compact && (
        <div className="flex items-center gap-2">
          {muted ? (
            <VolumeX className="h-3.5 w-3.5 shrink-0 text-blood-300" aria-hidden />
          ) : (
            <Volume2 className="h-3.5 w-3.5 shrink-0 text-parchment-400" aria-hidden />
          )}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={vol}
            onChange={(e) => setVol(Number(e.target.value))}
            aria-label="Volumen de la vista previa"
            className="range-gold min-w-0 flex-1"
            style={{ '--range-fill': `${Math.round(vol * 100)}%` } as CSSProperties}
          />
          <span className="w-9 text-right text-[10px] tabular-nums text-parchment-400">{Math.round(vol * 100)}%</span>
        </div>
      )}
      {muted && !compact && (
        <p className="text-[10px] text-parchment-400">Tu volumen para este canal está a cero o silenciado (ajústalo en las opciones de audio).</p>
      )}
    </div>
  );
}
