import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface VolumeControlsProps {
  compact?: boolean;
}

/** Placeholder — replaced by the audio-fx agent. */
export function VolumeControls(props: VolumeControlsProps) {
  return <UnderConstruction title="Volumen" compact={props.compact} />;
}
