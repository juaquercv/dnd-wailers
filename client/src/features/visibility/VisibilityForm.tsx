import type { VisibilitySettings } from '@wailers/shared';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface VisibilityFormProps {
  value: Partial<VisibilitySettings>;
  base?: VisibilitySettings;
  onChange: (patch: Partial<VisibilitySettings>) => void;
  allowInherit?: boolean;
}

/** Placeholder — replaced by the game-map agent. */
export function VisibilityForm(props: VisibilityFormProps) {
  const mode = props.value.visionMode ?? props.base?.visionMode;
  return (
    <UnderConstruction
      title="Ajustes de visibilidad"
      compact
      detail={mode ? `Visión: ${mode}${props.allowInherit ? ' (hereda)' : ''}` : undefined}
    />
  );
}
