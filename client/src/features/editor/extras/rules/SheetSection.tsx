import { ScrollText } from 'lucide-react';
import { Toggle } from '../../../../components/ui/Toggle';
import { SettingsSection } from '../SettingsSection';
import type { RuleSectionProps } from './ruleUtils';

/** Which stats appear on character sheets. */
export function SheetSection({ rules, update, id }: RuleSectionProps & { id: string }) {
  return (
    <SettingsSection
      id={id}
      icon={<ScrollText />}
      title="Hoja de personaje"
      description="Elige qué estadísticas se muestran en las hojas de héroes y en las fichas del mapa."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Toggle
          checked={rules.showAc}
          onChange={(v) =>
            update((d) => {
              d.showAc = v;
            })
          }
          label="Mostrar clase de armadura (CA)"
          description="La CA de los enemigos solo la ven los jugadores con permiso de ver sus fichas."
        />
        <Toggle
          checked={rules.showSpeed}
          onChange={(v) =>
            update((d) => {
              d.showSpeed = v;
            })
          }
          label="Mostrar velocidad"
          description="Distancia de movimiento por turno."
        />
        <Toggle
          checked={rules.showInitiative}
          onChange={(v) =>
            update((d) => {
              d.showInitiative = v;
            })
          }
          label="Mostrar bonificador de iniciativa"
          description="Útil si los turnos se sortean con dados."
        />
        <Toggle
          checked={rules.xpEnabled}
          onChange={(v) =>
            update((d) => {
              d.xpEnabled = v;
            })
          }
          label="Usar puntos de experiencia (XP)"
          description="Desactívalo si los héroes suben de nivel por hitos."
        />
      </div>
    </SettingsSection>
  );
}
