import { useMemo } from 'react';
import type { AudioState, SessionStatus } from '@wailers/shared';
import { useSessionStore } from '../../stores/session';
import { useSoundInfo, type SoundInfo } from './soundLibrary';

export interface SessionTrack {
  url: string;
  soundId: string | null;
  name: string | null;
  /** The library sound's own volume 0..1 (null: no library entry, or not loaded yet). */
  volume: number | null;
  /** True while the library entry (name / volume) is still loading for the first time. */
  resolving: boolean;
}

export interface SessionAudioInfo {
  status: SessionStatus | null;
  /** Audio only plays while the session is in progress (not in the lobby). */
  active: boolean;
  mode: AudioState['mode'];
  /** Zone this client is viewing (source of the tracks in 'zone' mode). */
  zoneName: string | null;
  music: SessionTrack | null;
  ambience: SessionTrack | null;
  /** DM master volume (0..1). */
  master: number;
}

function track(url: string, soundId: string | null, name: string | null, info: SoundInfo | null | undefined): SessionTrack {
  return { url, soundId, name: name ?? info?.name ?? null, volume: info?.volume ?? null, resolving: info === undefined };
}

/**
 * Tracks this client should hear: in 'manual' mode the DM's tracks for everyone; in 'zone' mode the
 * music/ambience of the zone this client is viewing (the DM uses its own view). Each track carries the
 * library sound's own volume, like the effects do.
 */
export function useSessionAudio(): SessionAudioInfo {
  const status = useSessionStore((s) => s.view?.state.status ?? null);
  const audio = useSessionStore((s) => s.view?.state.audio ?? null);
  const zone = useSessionStore((s) => (s.viewZone ? s.zonesById[s.viewZone.zoneId] ?? null : null));
  const mode: AudioState['mode'] = audio?.mode ?? 'zone';
  const musicSoundId = mode === 'manual' ? audio?.music?.soundId || null : zone?.musicUrl ? zone.musicSoundId : null;
  const ambienceSoundId = mode === 'manual' ? audio?.ambience?.soundId || null : zone?.ambienceUrl ? zone.ambienceSoundId : null;
  const musicInfo = useSoundInfo(musicSoundId);
  const ambienceInfo = useSoundInfo(ambienceSoundId);

  return useMemo<SessionAudioInfo>(() => {
    let music: SessionTrack | null = null;
    let ambience: SessionTrack | null = null;
    if (mode === 'manual') {
      if (audio?.music) music = track(audio.music.url, audio.music.soundId, audio.music.name, musicInfo);
      if (audio?.ambience) ambience = track(audio.ambience.url, audio.ambience.soundId, audio.ambience.name, ambienceInfo);
    } else if (zone) {
      if (zone.musicUrl) music = track(zone.musicUrl, zone.musicSoundId, null, musicInfo);
      if (zone.ambienceUrl) ambience = track(zone.ambienceUrl, zone.ambienceSoundId, null, ambienceInfo);
    }
    return {
      status,
      active: status === 'playing',
      mode,
      zoneName: zone?.name ?? null,
      music,
      ambience,
      master: audio?.master ?? 1,
    };
  }, [status, audio, zone, mode, musicInfo, ambienceInfo]);
}
