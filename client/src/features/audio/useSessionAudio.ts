import { useMemo } from 'react';
import type { AudioState, SessionStatus } from '@wailers/shared';
import { useSessionStore } from '../../stores/session';
import { useSoundName } from './soundLibrary';

export interface SessionTrack {
  url: string;
  soundId: string | null;
  name: string | null;
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

/**
 * Tracks this client should hear: in 'manual' mode the DM's tracks for everyone; in 'zone' mode the
 * music/ambience of the zone this client is viewing (the DM uses its own view).
 */
export function useSessionAudio(): SessionAudioInfo {
  const status = useSessionStore((s) => s.view?.state.status ?? null);
  const audio = useSessionStore((s) => s.view?.state.audio ?? null);
  const zone = useSessionStore((s) => (s.viewZone ? s.zonesById[s.viewZone.zoneId] ?? null : null));
  const mode: AudioState['mode'] = audio?.mode ?? 'zone';
  const zoneMusicName = useSoundName(mode === 'zone' && zone?.musicUrl ? zone.musicSoundId : null);
  const zoneAmbienceName = useSoundName(mode === 'zone' && zone?.ambienceUrl ? zone.ambienceSoundId : null);

  return useMemo<SessionAudioInfo>(() => {
    let music: SessionTrack | null = null;
    let ambience: SessionTrack | null = null;
    if (mode === 'manual') {
      if (audio?.music) music = { url: audio.music.url, soundId: audio.music.soundId, name: audio.music.name };
      if (audio?.ambience) ambience = { url: audio.ambience.url, soundId: audio.ambience.soundId, name: audio.ambience.name };
    } else if (zone) {
      if (zone.musicUrl) music = { url: zone.musicUrl, soundId: zone.musicSoundId, name: zoneMusicName };
      if (zone.ambienceUrl) ambience = { url: zone.ambienceUrl, soundId: zone.ambienceSoundId, name: zoneAmbienceName };
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
  }, [status, audio, zone, mode, zoneMusicName, zoneAmbienceName]);
}
