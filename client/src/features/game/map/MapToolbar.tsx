import clsx from 'clsx';
import { LocateFixed, Maximize, Radar, Sun, SunDim, ZoomIn, ZoomOut } from 'lucide-react';
import { IconButton } from '../../../components/ui/IconButton';
import { gameCamera, useGameCamera } from './camera';
import { useGameUi } from './gameUi';

export interface MapToolbarProps {
  /** DM controls (lighting preview). */
  dmControls: boolean;
  /** Own token to center on (players). */
  onCenterOwn?: (() => void) | null;
  className?: string;
}

/** Floating camera / mode controls of the game map (bottom-right corner). */
export function MapToolbar({ dmControls, onCenterOwn, className }: MapToolbarProps) {
  const scale = useGameCamera((s) => s.scale);
  const pingMode = useGameUi((s) => s.pingMode);
  const realLighting = useGameUi((s) => s.realLighting);
  // Steps aside while a token is dragged under it.
  const dragging = useGameUi((s) => s.tokenDragging);
  return (
    <div
      className={clsx(
        'flex flex-col items-center gap-1 rounded-xl border border-ink-600/80 bg-ink-900/85 p-1 shadow-panel backdrop-blur transition-opacity',
        dragging ? 'pointer-events-none opacity-30' : 'pointer-events-auto',
        className,
      )}
    >
      <IconButton icon={<ZoomIn />} title="Acercar" size="sm" onClick={() => gameCamera.zoomBy(1.25)} />
      <span className="select-none text-[10px] font-semibold tabular-nums text-parchment-400" title="Zoom actual">
        {Math.round(scale * 100)}%
      </span>
      <IconButton icon={<ZoomOut />} title="Alejar" size="sm" onClick={() => gameCamera.zoomBy(0.8)} />
      <span className="my-0.5 h-px w-6 bg-ink-600" aria-hidden />
      <IconButton icon={<Maximize />} title="Ajustar vista (F)" size="sm" onClick={() => gameCamera.fit()} />
      {onCenterOwn && <IconButton icon={<LocateFixed />} title="Centrar en mi ficha" size="sm" onClick={onCenterOwn} />}
      <IconButton
        icon={<Radar />}
        title={pingMode ? 'Desactivar modo ping (P)' : 'Modo ping: toca el mapa para señalar (P · Alt+clic)'}
        size="sm"
        active={pingMode}
        onClick={() => useGameUi.getState().togglePingMode()}
      />
      {dmControls && (
        <IconButton
          icon={realLighting ? <Sun /> : <SunDim />}
          title={realLighting ? 'Iluminación: como la ven los jugadores' : 'Iluminación atenuada para el DM (clic: ver como los jugadores)'}
          size="sm"
          active={realLighting}
          onClick={() => useGameUi.getState().setRealLighting(!realLighting)}
        />
      )}
    </div>
  );
}
