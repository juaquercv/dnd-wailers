import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Volume2 } from 'lucide-react';
import { toast } from '../../components/ui/toast';
import { useSessionEvent } from '../../lib/eventBus';
import { audioEngine, STOP_FADE_MS, useAudioEngineState, type AudioErrorInfo } from './audioEngine';
import { useSessionAudio } from './useSessionAudio';

const ERROR_TOAST_COOLDOWN_MS = 30_000;

const CHANNEL_NOUN: Record<AudioErrorInfo['channel'], string> = {
  music: 'la música',
  ambience: 'el sonido ambiente',
  effects: 'el efecto de sonido',
};

function errorMessage(info: AudioErrorInfo): string {
  const noun = CHANNEL_NOUN[info.channel];
  return info.label ? `No se pudo reproducir ${noun} «${info.label}»` : `No se pudo reproducir ${noun}`;
}

/**
 * Session audio driver (mounted once by SessionPage): plays the music/ambience this client should hear,
 * the DM's sound effects, applies the DM master volume and shows the autoplay unlock pill.
 */
export function AudioController() {
  const info = useSessionAudio();
  const musicUrl = info.active ? info.music?.url ?? null : null;
  const musicLabel = info.music?.name ?? null;
  const ambienceUrl = info.active ? info.ambience?.url ?? null : null;
  const ambienceLabel = info.ambience?.name ?? null;

  useEffect(() => {
    audioEngine.setTrack('music', musicUrl, { label: musicLabel });
  }, [musicUrl, musicLabel]);

  useEffect(() => {
    audioEngine.setTrack('ambience', ambienceUrl, { label: ambienceLabel });
  }, [ambienceUrl, ambienceLabel]);

  useEffect(() => {
    audioEngine.setDmMaster(info.master);
  }, [info.master]);

  useSessionEvent('sfx', (event) => {
    audioEngine.playSfx(event.url, event.volume, event.name);
  });

  useEffect(() => {
    const lastShown = new Map<string, number>();
    return audioEngine.onError((err) => {
      const now = Date.now();
      const last = lastShown.get(err.url) ?? 0;
      if (now - last < ERROR_TOAST_COOLDOWN_MS) return;
      lastShown.set(err.url, now);
      toast.warning(errorMessage(err), { description: 'Comprueba que el archivo de audio existe y es compatible.' });
    });
  }, []);

  // Leaving the session fades everything out.
  useEffect(() => () => audioEngine.stopAll(STOP_FADE_MS), []);

  return <AudioUnlockPill />;
}

/** Floating pill shown while the browser blocks audio until the user interacts with the page. */
function AudioUnlockPill() {
  const { locked } = useAudioEngineState();
  if (!locked || typeof document === 'undefined') return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-90 flex justify-center px-4">
      <button
        type="button"
        onClick={() => audioEngine.unlock()}
        className="group pointer-events-auto flex animate-slide-up items-center gap-3 rounded-full border border-gold-500/60 bg-ink-900/95 py-2 pl-2 pr-5 shadow-glow-gold backdrop-blur transition hover:border-gold-400 hover:bg-ink-800"
      >
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gold-500/20 text-gold-300">
          <span aria-hidden className="absolute inset-0 animate-ping rounded-full border border-gold-400/60" />
          <Volume2 className="h-4 w-4" aria-hidden />
        </span>
        <span className="font-display text-sm font-semibold tracking-wide text-parchment-50 group-hover:text-gold-200">
          Pulsa para activar el sonido
        </span>
      </button>
    </div>,
    document.body,
  );
}
