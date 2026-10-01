import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { CircleAlert, Hourglass, Lock, Music, Square, Wind } from 'lucide-react';
import { IconButton } from '../../components/ui/IconButton';
import { Spinner } from '../../components/ui/Spinner';
import { toast } from '../../components/ui/toast';
import { emitAck } from '../../api/socket';
import { audioEngine, useAudioEngineState, type ChannelStatus, type LoopChannel } from './audioEngine';
import { Equalizer } from './Equalizer';
import { useSessionAudio, type SessionTrack } from './useSessionAudio';

export interface NowPlayingProps {
  /** Show DM controls (stop buttons in manual mode). */
  canControl?: boolean;
}

const CHANNEL_INFO: Record<LoopChannel, { label: string; icon: ReactNode }> = {
  music: { label: 'Música', icon: <Music /> },
  ambience: { label: 'Ambiente', icon: <Wind /> },
};

/** "Sonando ahora": what this client is hearing on each looping channel. */
export function NowPlaying({ canControl = false }: NowPlayingProps) {
  const info = useSessionAudio();
  const engine = useAudioEngineState();

  return (
    <div className="overflow-hidden rounded-xl border border-ink-600/80 bg-gradient-to-b from-ink-800/90 to-ink-900/90 shadow-[inset_0_1px_0_rgba(243,234,214,0.05)]">
      {(['music', 'ambience'] as const).map((channel, i) => (
        <NowPlayingRow
          key={channel}
          channel={channel}
          track={info.active ? (channel === 'music' ? info.music : info.ambience) : null}
          status={engine[channel].status}
          canStop={canControl && info.active && info.mode === 'manual'}
          divider={i > 0}
        />
      ))}
      <div className="border-t border-ink-600/70 bg-ink-950/40 px-3 py-1.5 text-[11px] leading-4 text-parchment-400">
        {!info.active
          ? 'El sonido empezará cuando comience la partida.'
          : info.mode === 'manual'
            ? 'Modo manual: el DM elige las pistas para todos.'
            : info.zoneName
              ? `Música de la zona «${info.zoneName}».`
              : 'Música por zona.'}
      </div>
      {engine.locked && (
        <button
          type="button"
          onClick={() => audioEngine.unlock()}
          className="flex w-full items-center gap-2 border-t border-gold-700/50 bg-gold-500/10 px-3 py-2 text-left text-xs font-medium text-gold-200 transition hover:bg-gold-500/20"
        >
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          El navegador ha bloqueado el audio. Pulsa aquí para activarlo.
        </button>
      )}
    </div>
  );
}

interface NowPlayingRowProps {
  channel: LoopChannel;
  track: SessionTrack | null;
  status: ChannelStatus;
  canStop: boolean;
  divider: boolean;
}

function NowPlayingRow({ channel, track, status, canStop, divider }: NowPlayingRowProps) {
  const [stopping, setStopping] = useState(false);
  const meta = CHANNEL_INFO[channel];
  const playing = !!track && status === 'playing';

  const stop = async () => {
    setStopping(true);
    try {
      await emitAck('audio:play', { channel, soundId: null });
    } catch (err) {
      toast.fromError(err, 'No se pudo detener la pista');
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className={clsx('flex items-center gap-3 px-3 py-2.5', divider && 'border-t border-ink-600/60')}>
      <span
        className={clsx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border [&>svg]:h-4 [&>svg]:w-4',
          playing ? 'border-gold-600/60 bg-gold-500/15 text-gold-300 shadow-[0_0_14px_-4px_rgba(233,192,99,0.6)]' : 'border-ink-500 bg-ink-800 text-parchment-400',
        )}
      >
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-parchment-400">{meta.label}</div>
        <div className={clsx('truncate text-sm', track ? 'font-medium text-parchment-50' : 'italic text-parchment-400')}>
          {track ? track.name ?? 'Pista sin nombre' : 'Silencio'}
        </div>
      </div>
      {track && <StatusIndicator status={status} />}
      {canStop && track && (
        <IconButton icon={<Square />} title={`Detener ${meta.label.toLowerCase()} para todos`} size="sm" variant="danger" loading={stopping} onClick={() => void stop()} />
      )}
    </div>
  );
}

function StatusIndicator({ status }: { status: ChannelStatus }) {
  switch (status) {
    case 'playing':
      return (
        <span title="Sonando" className="flex shrink-0 items-center">
          <Equalizer active />
        </span>
      );
    case 'loading':
      return (
        <span title="Cargando…" className="flex shrink-0 items-center">
          <Spinner size="xs" label="Cargando pista…" />
        </span>
      );
    case 'blocked':
      return (
        <span title="Bloqueado por el navegador hasta que pulses en la página" className="flex shrink-0 items-center text-gold-400">
          <Hourglass className="h-4 w-4" aria-hidden />
        </span>
      );
    case 'error':
      return (
        <span title="No se pudo reproducir este archivo" className="flex shrink-0 items-center text-blood-400">
          <CircleAlert className="h-4 w-4" aria-hidden />
        </span>
      );
    default:
      return null;
  }
}
