import { Hourglass, Info, Sparkles } from 'lucide-react';
import { NumberInput } from '../../../../components/ui/NumberInput';
import { TextInput } from '../../../../components/ui/TextInput';
import { Toggle } from '../../../../components/ui/Toggle';
import { MagicModePicker } from '../../../campaigns/magicModes';
import { InfoNote, SettingsSection, SubHeading } from '../SettingsSection';
import { resourceName, type RuleSectionProps } from './ruleUtils';
import { SlotsTableEditor } from './SlotsTableEditor';

/** Magic system: mode, resource pool (name, regeneration, per level) and the spell slots table. */
export function MagicSection({ rules, update, id }: RuleSectionProps & { id: string }) {
  const magic = rules.magic;
  const name = resourceName(rules);
  const example = magic.manaPerLevel * 3;

  return (
    <SettingsSection
      id={id}
      icon={<Sparkles />}
      title="Sistema de magia"
      description="Decide qué recurso gastan los personajes para usar sus poderes. Cambiarlo no borra los valores guardados en los héroes."
    >
      <MagicModePicker
        value={magic.mode}
        manaName={magic.manaName}
        onChange={(mode) =>
          update((d) => {
            d.magic.mode = mode;
          })
        }
      />

      {magic.mode === 'mana' && (
        <div className="animate-fade-in space-y-4">
          <SubHeading>Reserva de {name}</SubHeading>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Nombre del recurso"
              value={magic.manaName}
              maxLength={24}
              placeholder="Maná"
              hint="Así aparecerá en las hojas, los botones y el registro."
              onValueChange={(v) =>
                update((d) => {
                  d.magic.manaName = v;
                })
              }
              onBlur={() => {
                if (!magic.manaName.trim()) {
                  update((d) => {
                    d.magic.manaName = 'Maná';
                  });
                }
              }}
            />
            <NumberInput
              label={`${name} por nivel de personaje`}
              integer
              min={0}
              max={999}
              value={magic.manaPerLevel}
              hint={`Máximo sugerido al crear héroes: nivel × valor (nivel 3 → ${example}).`}
              onChange={(v) =>
                update((d) => {
                  d.magic.manaPerLevel = v;
                })
              }
            />
            <NumberInput
              label="Regeneración por turno"
              integer
              min={0}
              max={999}
              value={magic.manaRegenPerTurn}
              hint={`Puntos que recupera cada héroe al pulsar «Regenerar ${name}».`}
              onChange={(v) =>
                update((d) => {
                  d.magic.manaRegenPerTurn = v;
                })
              }
            />
            <div className="flex items-end">
              <Toggle
                checked={magic.manaAutoRegen}
                onChange={(v) =>
                  update((d) => {
                    d.magic.manaAutoRegen = v;
                  })
                }
                label="Regenerar al inicio de cada turno"
                description="Desactivado: el DM regenera a mano cuando quiera."
              />
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-arcane-500/30 bg-arcane-500/[0.07] px-3 py-2.5">
            <span className="text-xs text-parchment-300">Vista previa:</span>
            <span className="inline-flex items-center gap-2 rounded-md border border-arcane-500/40 bg-ink-950/60 px-2.5 py-1 text-sm">
              <Sparkles className="h-3.5 w-3.5 text-arcane-400" />
              <span className="font-semibold tabular-nums text-arcane-300">
                {Math.max(0, example - magic.manaRegenPerTurn)} / {example}
              </span>
              <span className="text-parchment-200">{name}</span>
            </span>
            <span className="text-[11px] text-parchment-400">(héroe de nivel 3)</span>
          </div>
        </div>
      )}

      {magic.mode === 'slots' && (
        <div className="animate-fade-in space-y-3">
          <SubHeading>Espacios de conjuro por nivel</SubHeading>
          <SlotsTableEditor
            table={magic.slotsTable}
            onChange={(table) =>
              update((d) => {
                d.magic.slotsTable = table;
              })
            }
          />
        </div>
      )}

      {magic.mode === 'uses' && (
        <InfoNote icon={<Hourglass />}>
          Cada héroe lleva una lista de usos limitados (por ejemplo, una habilidad de clase o un objeto con cargas) con su máximo y el
          descanso que los reinicia. Configura abajo, en <strong className="text-parchment-100">Descansos</strong>, qué descanso los
          reinicia.
        </InfoNote>
      )}

      {magic.mode === 'none' && (
        <InfoNote icon={<Info />}>
          Las hojas de personaje no mostrarán reservas mágicas ni espacios de conjuro. Los héroes conservan sus valores por si los usas en
          otra campaña.
        </InfoNote>
      )}
    </SettingsSection>
  );
}
