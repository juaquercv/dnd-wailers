import type { RuleSystem } from '@wailers/shared';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

export interface RulesEditorProps {
  rules: RuleSystem;
  onChange: (rules: RuleSystem) => void;
}

/** Placeholder — replaced by the editor-extras agent. */
export function RulesEditor(props: RulesEditorProps) {
  return (
    <div className="p-6">
      <UnderConstruction title="Reglas de la campaña" detail={`Modo mágico: ${props.rules.magic.mode}`} />
    </div>
  );
}
