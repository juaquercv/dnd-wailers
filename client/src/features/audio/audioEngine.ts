import { useSyncExternalStore } from 'react';
import { Howl, Howler } from 'howler';
import { useSettingsStore } from '../../stores/settings';
import { hasUserActivation, onUserGesture } from './activation';

/**
 * Session audio engine (singleton):
 *  - two looping channels ('music', 'ambience') with an equal-power crossfade when the track changes
 *    and a fade-out when they stop;
 *  - one-shot effects ('effects' channel);
 *  - effective volume = settings master × channel volume × DM master × the sound's own volume (0 if muted),
 *    re-applied live whenever the settings change;
 *  - autoplay lock tracking: `locked` is true while the browser blocks playback; any user gesture
 *    (or `unlock()`) resumes it.
 * Short loops are decoded with Web Audio (gapless); long files are streamed with HTML5 Audio.
 */

export type LoopChannel = 'music' | 'ambience';
export type AudioChannel = LoopChannel | 'effects';
export type ChannelStatus = 'idle' | 'loading' | 'playing' | 'blocked' | 'error';

export interface ChannelSnapshot {
  url: string | null;
  label: string | null;
  status: ChannelStatus;
}

export interface AudioEngineSnapshot {
  music: ChannelSnapshot;
  ambience: ChannelSnapshot;
  /** The browser is blocking playback until the user interacts with the page. */
  locked: boolean;
  /** DM master volume currently applied (0..1). */
  dmMaster: number;
}

export interface AudioErrorInfo {
  channel: AudioChannel;
  url: string;
  label: string | null;
}

export interface TrackOptions {
  /** Sound's own volume 0..1 (default 1). */
  volume?: number;
  /** Display name (status and error messages). */
  label?: string | null;
}

export const CROSSFADE_MS = 2500;
export const STOP_FADE_MS = 1500;

const FADE_TICK_MS = 33;
const SFX_CACHE_LIMIT = 24;
const SFX_MAX_LIFETIME_MS = 60_000;
/** Above this estimated decoded size (bytes) a loop is streamed with HTML5 Audio instead of decoded. */
const MAX_DECODED_BYTES = 64 * 1024 * 1024;
const HEAD_TIMEOUT_MS = 1500;

const AUDIO_EXTENSIONS = ['mp3', 'mpeg', 'ogg', 'oga', 'opus', 'wav', 'wave', 'webm', 'weba', 'm4a', 'mp4', 'aac', 'flac', 'caf'];

interface Fade {
  from: number;
  to: number;
  start: number;
  duration: number;
  onDone: (() => void) | null;
}

interface LoopTrack {
  channel: LoopChannel;
  url: string;
  label: string | null;
  own: number;
  howl: Howl | null;
  soundId: number | null;
  html5: boolean;
  /** Fade multiplier 0..1. */
  gain: number;
  fade: Fade | null;
  status: Exclude<ChannelStatus, 'idle'>;
  /** False once it started fading out. */
  active: boolean;
  disposed: boolean;
}

interface ChannelState {
  current: LoopTrack | null;
  outgoing: LoopTrack[];
}

interface ActiveSfx {
  howl: Howl;
  id: number;
  own: number;
  timer: ReturnType<typeof setTimeout>;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

function extensionOf(url: string): string | null {
  const data = /^data:audio\/([^;,]+)/i.exec(url);
  if (data?.[1]) return data[1].toLowerCase();
  const clean = url.split(/[?#]/, 1)[0] ?? '';
  const m = /\.([a-z0-9]+)$/i.exec(clean);
  return m?.[1] ? m[1].toLowerCase() : null;
}

/** Howler picks the codec from the extension; unknown URLs are declared as mp3 (browsers sniff content). */
function formatFor(url: string): string[] {
  const ext = extensionOf(url);
  return [ext && AUDIO_EXTENSIONS.includes(ext) ? ext : 'mp3'];
}

/** Rough decoded-size multiplier (decoded PCM float32 vs file bytes). */
function decodeFactor(url: string, contentType: string | null): number {
  const ext = extensionOf(url) ?? '';
  const type = (contentType ?? '').toLowerCase();
  if (['wav', 'wave'].includes(ext) || type.includes('wav')) return 2.2;
  if (ext === 'flac' || type.includes('flac')) return 4;
  return 20;
}

const streamDecisions = new Map<string, Promise<boolean>>();

/** Decides (once per URL) whether a loop should be streamed (HTML5) rather than decoded (Web Audio). */
function shouldStream(url: string): Promise<boolean> {
  const cached = streamDecisions.get(url);
  if (cached) return cached;
  const decision = (async () => {
    if (url.startsWith('data:') || url.startsWith('blob:') || typeof fetch !== 'function') return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
    try {
      const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
      const length = Number(res.headers.get('content-length'));
      if (!res.ok || !Number.isFinite(length) || length <= 0) return false;
      return length * decodeFactor(url, res.headers.get('content-type')) > MAX_DECODED_BYTES;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  })();
  streamDecisions.set(url, decision);
  return decision;
}

/** Equal-power curve so crossfades keep a constant perceived loudness. */
function fadeValue(f: Fade, p: number): number {
  if (f.to >= f.from) return f.from + (f.to - f.from) * Math.sin((p * Math.PI) / 2);
  return f.to + (f.from - f.to) * Math.cos((p * Math.PI) / 2);
}

type HowlerWithInternals = typeof Howler & { _autoResume?: () => void };

class AudioEngine {
  private channels: Record<LoopChannel, ChannelState> = {
    music: { current: null, outgoing: [] },
    ambience: { current: null, outgoing: [] },
  };
  private dmMaster = 1;
  private sfxBlocked = false;
  private sfxCache = new Map<string, Howl>();
  private activeSfx = new Set<ActiveSfx>();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private errorListeners = new Set<(info: AudioErrorInfo) => void>();
  private watchedContexts = new WeakSet<AudioContext>();
  private snapshot: AudioEngineSnapshot;

  constructor() {
    this.snapshot = this.buildSnapshot();
    if (typeof window === 'undefined') return;
    useSettingsStore.subscribe((state, prev) => {
      if (state.volumes !== prev.volumes || state.muted !== prev.muted) this.applyAllVolumes();
    });
    onUserGesture(() => {
      if (this.snapshot.locked) this.unlock();
    });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Desired track for a looping channel (null = fade out). Same URL keeps playing (only volume/label update). */
  setTrack(channel: LoopChannel, url: string | null, opts: TrackOptions = {}): void {
    const ch = this.channels[channel];
    const own = clamp01(opts.volume ?? 1);
    const cur = ch.current;

    if (url && cur && cur.url === url && cur.status !== 'error') {
      cur.own = own;
      if (opts.label !== undefined) cur.label = opts.label;
      this.applyVolume(cur);
      this.emit();
      return;
    }

    if (cur) this.retire(cur, url ? CROSSFADE_MS : STOP_FADE_MS);
    ch.current = null;

    if (!url) {
      this.emit();
      return;
    }

    // Switching back to a track that is still fading out: fade it back in instead of reloading.
    const revived = ch.outgoing.find((t) => t.url === url && !t.disposed && t.status === 'playing');
    if (revived) {
      ch.outgoing = ch.outgoing.filter((t) => t !== revived);
      revived.active = true;
      revived.own = own;
      if (opts.label !== undefined) revived.label = opts.label;
      ch.current = revived;
      this.startFade(revived, 1, CROSSFADE_MS * (1 - revived.gain));
      this.emit();
      return;
    }

    const track: LoopTrack = {
      channel,
      url,
      label: opts.label ?? null,
      own,
      howl: null,
      soundId: null,
      html5: false,
      gain: 0,
      fade: null,
      status: 'loading',
      active: true,
      disposed: false,
    };
    ch.current = track;
    this.emit();
    void this.loadTrack(track);
  }

  /** Fade out both looping channels (used when leaving a session). */
  stopAll(fadeMs: number = STOP_FADE_MS): void {
    for (const channel of ['music', 'ambience'] as const) {
      const ch = this.channels[channel];
      if (ch.current) this.retire(ch.current, fadeMs);
      ch.current = null;
    }
    this.sfxBlocked = false;
    this.emit();
  }

  /** One-shot effect. Skipped (not queued) while the browser blocks audio. */
  playSfx(url: string, volume = 1, label: string | null = null): void {
    if (!url || Howler.noAudio) return;
    const ctx = this.ensureContext();
    if (ctx && ctx.state !== 'running' && !hasUserActivation()) {
      this.sfxBlocked = true;
      this.emit();
      return;
    }
    let howl = this.sfxCache.get(url);
    if (howl) {
      // refresh LRU position
      this.sfxCache.delete(url);
      this.sfxCache.set(url, howl);
    } else {
      const created = new Howl({ src: [url], format: formatFor(url), preload: true, volume: 0 });
      created.on('loaderror', () => {
        this.sfxCache.delete(url);
        created.unload();
        this.reportError({ channel: 'effects', url, label });
      });
      this.sfxCache.set(url, created);
      howl = created;
      this.evictSfx();
    }
    const id = howl.play();
    if (typeof id !== 'number') return;
    const own = clamp01(volume);
    const h = howl;
    const entry: ActiveSfx = {
      howl: h,
      id,
      own,
      timer: setTimeout(() => this.activeSfx.delete(entry), SFX_MAX_LIFETIME_MS),
    };
    this.activeSfx.add(entry);
    h.volume(this.channelVolume('effects') * own, id);
    const done = () => {
      clearTimeout(entry.timer);
      this.activeSfx.delete(entry);
    };
    h.once('end', done, id);
    h.once('stop', done, id);
    h.once('playerror', done, id);
  }

  /** DM master volume (state.audio.master). */
  setDmMaster(volume: number): void {
    const v = clamp01(volume);
    if (v === this.dmMaster) return;
    this.dmMaster = v;
    this.applyAllVolumes();
    this.emit();
  }

  /** Resume playback after the autoplay lock (call from a user gesture). */
  unlock(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    // Lets Howler flush plays it queued while the context was suspended.
    const internals = Howler as HowlerWithInternals;
    if (typeof internals._autoResume === 'function') internals._autoResume.call(Howler);
    this.sfxBlocked = false;
    for (const channel of ['music', 'ambience'] as const) {
      const track = this.channels[channel].current;
      if (!track || track.status !== 'blocked' || !track.howl) continue;
      track.status = 'loading';
      if (track.html5) {
        track.soundId = track.howl.play();
        this.applyVolume(track);
      }
    }
    this.emit();
  }

  getSnapshot = (): AudioEngineSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  onError(listener: (info: AudioErrorInfo) => void): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  // -------------------------------------------------------------------------
  // Loops
  // -------------------------------------------------------------------------

  private async loadTrack(track: LoopTrack): Promise<void> {
    if (Howler.noAudio) {
      track.status = 'error';
      this.emit();
      return;
    }
    const html5 = await shouldStream(track.url);
    if (track.disposed) return;
    track.html5 = html5;
    const howl = new Howl({ src: [track.url], format: formatFor(track.url), html5, loop: true, preload: true, volume: 0 });
    track.howl = howl;
    howl.on('loaderror', () => {
      if (track.disposed) return;
      track.status = 'error';
      this.reportError({ channel: track.channel, url: track.url, label: track.label });
      this.dispose(track);
      this.emit();
    });
    howl.on('playerror', () => {
      if (track.disposed) return;
      track.status = 'blocked';
      this.emit();
    });
    howl.on('play', () => {
      if (track.disposed) return;
      const wasPlaying = track.status === 'playing';
      track.status = 'playing';
      this.sfxBlocked = false;
      if (!wasPlaying && track.active) this.startFade(track, 1, CROSSFADE_MS);
      this.applyVolume(track);
      this.emit();
    });
    const ctx = this.ensureContext();
    track.soundId = howl.play();
    this.applyVolume(track);
    if (!html5 && ctx && ctx.state !== 'running' && !hasUserActivation()) track.status = 'blocked';
    this.emit();
  }

  /** Fade a track out and unload it afterwards. */
  private retire(track: LoopTrack, fadeMs: number): void {
    track.active = false;
    const ch = this.channels[track.channel];
    if (!ch.outgoing.includes(track)) ch.outgoing.push(track);
    if (track.status !== 'playing' || track.gain <= 0.001) {
      this.dispose(track);
      return;
    }
    this.startFade(track, 0, fadeMs * track.gain, () => this.dispose(track));
  }

  private dispose(track: LoopTrack): void {
    if (track.disposed) {
      return;
    }
    track.disposed = true;
    track.fade = null;
    const ch = this.channels[track.channel];
    ch.outgoing = ch.outgoing.filter((t) => t !== track);
    if (track.howl) {
      const howl = track.howl;
      track.howl = null;
      howl.off();
      howl.stop();
      howl.unload();
    }
  }

  private startFade(track: LoopTrack, to: number, duration: number, onDone: (() => void) | null = null): void {
    track.fade = { from: track.gain, to, start: performance.now(), duration: Math.max(0, duration), onDone };
    if (duration <= 0) {
      this.stepFade(track, performance.now());
      return;
    }
    if (!this.ticker) this.ticker = setInterval(this.tick, FADE_TICK_MS);
  }

  /** Advances one track's fade. Returns true while it is still fading. */
  private stepFade(track: LoopTrack, now: number): boolean {
    const f = track.fade;
    if (!f) return false;
    const p = f.duration > 0 ? Math.min(1, Math.max(0, (now - f.start) / f.duration)) : 1;
    track.gain = clamp01(fadeValue(f, p));
    this.applyVolume(track);
    if (p < 1) return true;
    track.fade = null;
    f.onDone?.();
    return false;
  }

  private tick = (): void => {
    const now = performance.now();
    let fading = false;
    for (const channel of ['music', 'ambience'] as const) {
      const ch = this.channels[channel];
      const tracks = ch.current ? [ch.current, ...ch.outgoing] : [...ch.outgoing];
      for (const track of tracks) {
        if (this.stepFade(track, now)) fading = true;
      }
    }
    if (!fading && this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  };

  // -------------------------------------------------------------------------
  // Volumes
  // -------------------------------------------------------------------------

  private channelVolume(channel: AudioChannel): number {
    const s = useSettingsStore.getState();
    if (s.muted) return 0;
    return clamp01(s.volumes.master * s.volumes[channel] * this.dmMaster);
  }

  private applyVolume(track: LoopTrack): void {
    if (!track.howl || track.soundId === null) return;
    track.howl.volume(clamp01(this.channelVolume(track.channel) * track.own * track.gain), track.soundId);
  }

  private applyAllVolumes(): void {
    for (const channel of ['music', 'ambience'] as const) {
      const ch = this.channels[channel];
      if (ch.current) this.applyVolume(ch.current);
      for (const t of ch.outgoing) this.applyVolume(t);
    }
    const effects = this.channelVolume('effects');
    for (const sfx of this.activeSfx) sfx.howl.volume(clamp01(effects * sfx.own), sfx.id);
  }

  // -------------------------------------------------------------------------
  // Effects cache
  // -------------------------------------------------------------------------

  private evictSfx(): void {
    if (this.sfxCache.size <= SFX_CACHE_LIMIT) return;
    const inUse = new Set<Howl>([...this.activeSfx].map((s) => s.howl));
    for (const [url, howl] of this.sfxCache) {
      if (this.sfxCache.size <= SFX_CACHE_LIMIT) break;
      if (inUse.has(howl)) continue;
      this.sfxCache.delete(url);
      howl.unload();
    }
  }

  // -------------------------------------------------------------------------
  // Context / notifications
  // -------------------------------------------------------------------------

  /** Howler creates its AudioContext lazily; make sure it exists and watch its state. */
  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!Howler.ctx) Howler.volume();
    const ctx = Howler.ctx ?? null;
    if (ctx && !this.watchedContexts.has(ctx)) {
      this.watchedContexts.add(ctx);
      ctx.addEventListener('statechange', () => {
        if (ctx.state === 'running') this.sfxBlocked = false;
        this.emit();
      });
    }
    return ctx;
  }

  private reportError(info: AudioErrorInfo): void {
    for (const listener of [...this.errorListeners]) {
      try {
        listener(info);
      } catch (err) {
        console.error('[audio] error listener failed', err);
      }
    }
  }

  private buildSnapshot(): AudioEngineSnapshot {
    const channel = (name: LoopChannel): ChannelSnapshot => {
      const t = this.channels[name].current;
      return t ? { url: t.url, label: t.label, status: t.status } : { url: null, label: null, status: 'idle' };
    };
    const music = channel('music');
    const ambience = channel('ambience');
    return {
      music,
      ambience,
      locked: this.sfxBlocked || music.status === 'blocked' || ambience.status === 'blocked',
      dmMaster: this.dmMaster,
    };
  }

  private emit(): void {
    const next = this.buildSnapshot();
    const prev = this.snapshot;
    if (
      prev.locked === next.locked &&
      prev.dmMaster === next.dmMaster &&
      sameChannel(prev.music, next.music) &&
      sameChannel(prev.ambience, next.ambience)
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of [...this.listeners]) listener();
  }
}

function sameChannel(a: ChannelSnapshot, b: ChannelSnapshot): boolean {
  return a.url === b.url && a.label === b.label && a.status === b.status;
}

export const audioEngine = new AudioEngine();

/** Reactive engine state (channel status, autoplay lock). */
export function useAudioEngineState(): AudioEngineSnapshot {
  return useSyncExternalStore(audioEngine.subscribe, audioEngine.getSnapshot, audioEngine.getSnapshot);
}
