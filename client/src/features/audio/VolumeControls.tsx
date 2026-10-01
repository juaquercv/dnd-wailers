import type { ReactNode } from 'react';
import clsx from 'clsx';
import { MousePointerClick, Music, Volume1, Volume2, VolumeX, Wind, Zap } from 'lucide-react';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import { useSettingsStore, type VolumeChannel } from '../../stores/settings';
import { uiSounds } from './uiSounds';

export interface VolumeControlsProps {
  compact?: boolean;
}

interface ChannelRow {
  channel: VolumeChannel;
  label: string;
  hint: string;
  icon: ReactNode;
}

const ROWS: ChannelRow[] = [
  { channel: 'master', label: 'General', hint: 'Volumen global de este dispositivo', icon: <Volume2 /> },
  { channel: 'music', label: 'Música', hint: 'Música de la zona o la que elija el DM', icon: <Music /> },
  { channel: 'ambience', label: 'Ambiente', hint: 'Sonidos de fondo: lluvia, bosque, taberna…', icon: <Wind /> },
  { channel: 'effects', label: 'Efectos', hint: 'Efectos de sonido lanzados por el DM', icon: <Zap /> },
  { channel: 'ui', label: 'Interfaz', hint: 'Dados, avisos, turnos y clics', icon: <MousePointerClick /> },
];

/** Personal volume sliders (stored per browser) + mute. Changes apply live to everything playing. */
export function VolumeControls({ compact = false }: VolumeControlsProps) {
  const volumes = useSettingsStore((s) => s.volumes);
  const muted = useSettingsStore((s) => s.muted);
  const setVolume = useSettingsStore((s) => s.setVolume);
  const setMuted = useSettingsStore((s) => s.setMuted);

  // Audible feedback when releasing the interface/general sliders.
  const preview = (channel: VolumeChannel) => {
    if (channel === 'ui' || channel === 'master') uiSounds.tick();
  };

  return (
    <div className={clsx('flex flex-col', compact ? 'gap-2' : 'gap-3.5')}>
      <div
        className={clsx(
          'flex items-center justify-between gap-3 rounded-lg border px-3 transition-colors',
          compact ? 'py-1.5' : 'py-2',
          muted ? 'border-blood-500/50 bg-blood-600/10' : 'border-ink-600/80 bg-ink-950/40',
        )}
      >
        <span className={clsx('flex items-center gap-2 text-sm', muted ? 'text-blood-300' : 'text-parchment-200')}>
          {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume1 className="h-4 w-4" aria-hidden />}
          {muted ? 'Sonido silenciado' : 'Silenciar todo'}
        </span>
        <Toggle checked={muted} onChange={setMuted} size="sm" title={muted ? 'Activar el sonido' : 'Silenciar todo el sonido'} />
      </div>

      <div className={clsx('flex flex-col', compact ? 'gap-1.5' : 'gap-3', muted && 'opacity-50')}>
        {ROWS.map((row) =>
          compact ? (
            <div key={row.channel} className="flex items-center gap-2" title={row.hint}>
              <span className="w-[4.75rem] shrink-0 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-parchment-300">
                {row.label}
              </span>
              <Slider
                className="flex-1"
                value={volumes[row.channel]}
                onChange={(v) => setVolume(row.channel, v)}
                onCommit={() => preview(row.channel)}
                icon={row.icon}
                aria-label={`Volumen: ${row.label}`}
              />
            </div>
          ) : (
            <div key={row.channel} title={row.hint}>
              <Slider
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-parchment-400 [&>svg]:h-3.5 [&>svg]:w-3.5">{row.icon}</span>
                    {row.label}
                  </span>
                }
                value={volumes[row.channel]}
                onChange={(v) => setVolume(row.channel, v)}
                onCommit={() => preview(row.channel)}
                aria-label={`Volumen: ${row.label}`}
              />
            </div>
          ),
        )}
      </div>
    </div>
  );
}
