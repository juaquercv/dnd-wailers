import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Volume2 } from 'lucide-react';
import { toast } from '../../components/ui/toast';
import { useSessionEvent } from '../../lib/eventBus';
import { useSessionStore } from '../../stores/session';
import { audioEngine, STOP_FADE_MS, useAudioEngineState, type AudioErrorInfo, type LoopChannel } from './audioEngine';
import { useSessionAudio, type SessionTrack } from './useSessionAudio';

const ERROR_TOAST_COOLDOWN_MS = 30_000;
/** How long a new loop waits for its library volume before starting at the default one. */
const VOLUME_WAIT_MS = 1500;

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
  useLoopChannel('music', info.active ? info.music : null);
  useLoopChannel('ambience', info.active ? info.ambience : null);

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

/**
 * Drives one looping channel with the sound's own library volume. A new track waits (briefly) until
 * that volume is known, so a quiet loop never starts at full volume and then drops.
 */
function useLoopChannel(channel: LoopChannel, track: SessionTrack | null): void {
  const url = track?.url ?? null;
  const label = track?.name ?? null;
  const volume = track?.volume ?? null;
  const resolving = !!url && !!track?.resolving;
  const [waitedFor, setWaitedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!resolving || !url) return;
    const timer = setTimeout(() => setWaitedFor(url), VOLUME_WAIT_MS);
    return () => clearTimeout(timer);
  }, [resolving, url]);

  useEffect(() => {
    if (resolving && waitedFor !== url) return;
    audioEngine.setTrack(channel, url, { label, volume: volume ?? undefined });
  }, [channel, url, label, volume, resolving, waitedFor]);
}

/** The local user has roll prompt cards (DM request or turn offer) at the bottom of the screen. */
function useHasRollPrompts(): boolean {
  return useSessionStore((s) => {
    const view = s.view;
    const me = view?.meUserId;
    if (!view || !me) return false;
    return view.state.turnOffer?.userId === me || view.state.rollRequests.some((r) => r.targetUserId === me);
  });
}

/**
 * Floating pill shown while the browser blocks audio until the user interacts with the page. It hides
 * while roll prompts occupy the same spot: clicking one of them is a gesture that unlocks audio too, and
 * the pill must never swallow the click meant for "Lanzar".
 */
function AudioUnlockPill() {
  const { locked } = useAudioEngineState();
  const hasRollPrompts = useHasRollPrompts();
  if (!locked || hasRollPrompts || typeof document === 'undefined') return null;
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
