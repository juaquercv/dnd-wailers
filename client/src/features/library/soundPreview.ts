import { useSyncExternalStore } from 'react';
import type { SoundType } from '@wailers/shared';
import { getEffectiveVolume, type VolumeChannel } from '../../stores/settings';
import { toast } from '../../components/ui/toast';

/**
 * One shared preview player for library cards and lists: starting a preview stops the previous one.
 */
interface PreviewState {
  id: string | null;
  playing: boolean;
}

let audio: HTMLAudioElement | null = null;
let state: PreviewState = { id: null, playing: false };
const listeners = new Set<() => void>();
const stopHooks = new Set<() => void>();

function emit(next: PreviewState): void {
  state = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function channelForSound(type: SoundType | null | undefined): Exclude<VolumeChannel, 'master'> {
  if (type === 'music') return 'music';
  if (type === 'ambience') return 'ambience';
  return 'effects';
}

export function stopSoundPreview(): void {
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  if (state.id !== null) emit({ id: null, playing: false });
}

/** Register a callback run whenever any preview starts (full players pause themselves). */
export function onPreviewStart(fn: () => void): () => void {
  stopHooks.add(fn);
  return () => {
    stopHooks.delete(fn);
  };
}

export function playSoundPreview(id: string, url: string, opts: { volume?: number; soundType?: SoundType | null } = {}): void {
  if (!url) {
    toast.warning('Este sonido no tiene archivo de audio');
    return;
  }
  for (const fn of stopHooks) fn();
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('ended', () => emit({ id: state.id, playing: false }));
    audio.addEventListener('pause', () => {
      if (state.playing) emit({ id: state.id, playing: false });
    });
    audio.addEventListener('play', () => emit({ id: state.id, playing: true }));
  }
  const vol = Math.max(0, Math.min(1, (opts.volume ?? 1) * getEffectiveVolume(channelForSound(opts.soundType))));
  audio.pause();
  audio.src = url;
  audio.loop = false;
  audio.volume = vol;
  emit({ id, playing: true });
  audio.play().catch(() => {
    emit({ id, playing: false });
    toast.error('No se pudo reproducir el sonido');
  });
}

export function toggleSoundPreview(id: string, url: string, opts: { volume?: number; soundType?: SoundType | null } = {}): void {
  if (state.id === id && state.playing) {
    audio?.pause();
    return;
  }
  playSoundPreview(id, url, opts);
}

export function useSoundPreviewPlaying(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.id === id && state.playing,
    () => false,
  );
}
