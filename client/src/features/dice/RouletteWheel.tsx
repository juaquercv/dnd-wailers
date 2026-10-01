import type { RouletteSegment } from '@wailers/shared';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface RouletteWheelProps {
  segments: RouletteSegment[];
  rotation: number;
  durationMs: number;
  size?: number;
  onSpinEnd?: () => void;
}

/** Placeholder — replaced by the dice agent. */
export function RouletteWheel(props: RouletteWheelProps) {
  return (
    <div style={{ width: props.size }}>
      <UnderConstruction title="Ruleta" compact detail={`${props.segments.length} segmentos`} />
    </div>
  );
}
