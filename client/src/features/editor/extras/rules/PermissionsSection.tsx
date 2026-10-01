import { Dices, Hand, ShieldCheck } from 'lucide-react';
import { Toggle } from '../../../../components/ui/Toggle';
import { InfoNote, SettingsSection } from '../SettingsSection';
import { resourceName, type RuleSectionProps } from './ruleUtils';

/** What players may do on their own during play. */
export function PermissionsSection({ rules, update, id }: RuleSectionProps & { id: string }) {
  const mode = rules.magic.mode;
  const resources =
    mode === 'mana'
      ? `su propio ${resourceName(rules)}`
      : mode === 'slots'
        ? 'sus propios espacios de conjuro'
        : mode === 'uses'
          ? 'sus propios usos limitados'
          : 'sus propios recursos (usos limitados)';
  return (
    <SettingsSection
      id={id}
      icon={<ShieldCheck />}
      title="Permisos de los jugadores"
      description="Lo que cada jugador puede hacer por su cuenta durante la partida."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Toggle
          checked={rules.playersCanRollFreely}
          onChange={(v) =>
            update((d) => {
              d.playersCanRollFreely = v;
            })
          }
          label={
            <span className="inline-flex items-center gap-1.5">
              <Dices className="h-3.5 w-3.5 text-gold-400" />
              Tirar dados libremente
            </span>
          }
          description="Los jugadores pueden lanzar dados públicos desde su bandeja. Las peticiones de tirada del DM funcionan siempre."
        />
        <Toggle
          checked={rules.playersCanEditOwnResources}
          onChange={(v) =>
            update((d) => {
              d.playersCanEditOwnResources = v;
            })
          }
          label={
            <span className="inline-flex items-center gap-1.5">
              <Hand className="h-3.5 w-3.5 text-gold-400" />
              Gestionar sus recursos
            </span>
          }
          description={`Cada jugador puede gastar y ajustar ${resources}.`}
        />
      </div>
      <InfoNote>
        Los jugadores nunca modifican sus puntos de vida, dinero, experiencia ni inventario: eso lo ajusta siempre el DM (salvo los
        trueques entre jugadores).
      </InfoNote>
    </SettingsSection>
  );
}
