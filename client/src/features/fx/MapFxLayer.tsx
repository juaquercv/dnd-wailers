import { Layer } from 'react-konva';

export interface MapFxLayerProps {
  zoneId: string;
  levelId: string;
}

/** Placeholder — replaced by the audio-fx agent. Must stay a Konva Layer (it lives inside MapStage). */
export function MapFxLayer(props: MapFxLayerProps) {
  return <Layer listening={false} name={`fx-${props.zoneId}-${props.levelId}`} />;
}
