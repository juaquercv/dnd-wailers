import { useMemo } from 'react';
import { Calculator, Dices, PenLine, UserPlus } from 'lucide-react';
import { normalizeText, POINT_BUY_BUDGET, STANDARD_ARRAY, type CategoryNode, type RuleSystem } from '@wailers/shared';
import { Badge } from '../../../../components/ui/Badge';
import { Checkbox } from '../../../../components/ui/Checkbox';
import { NumberInput } from '../../../../components/ui/NumberInput';
import { Spinner } from '../../../../components/ui/Spinner';
import { Toggle } from '../../../../components/ui/Toggle';
import { useCategories } from '../../../../stores/categories';
import { RadioCards } from '../../../campaigns/RadioCards';
import { InfoNote, SettingsSection, SubHeading } from '../SettingsSection';
import type { RuleSectionProps } from './ruleUtils';

type AbilityMethod = RuleSystem['heroCreation']['abilityMethod'];

/** Hero facet roots are matched by name (accent/case-insensitive). */
const RACE_FACET_NAMES = ['raza', 'razas', 'especie', 'especies', 'linaje', 'ascendencia'];
const CLASS_FACET_NAMES = ['clase', 'clases'];

function findFacet(tree: CategoryNode[], names: string[]): CategoryNode | null {
  return tree.find((root) => names.includes(normalizeText(root.name))) ?? null;
}

/** Rules for creating new heroes in this campaign. */
export function HeroCreationSection({ rules, update, id }: RuleSectionProps & { id: string }) {
  const hc = rules.heroCreation;
  const { tree, loading, loaded, error } = useCategories('hero');
  const raceFacet = useMemo(() => findFacet(tree, RACE_FACET_NAMES), [tree]);
  const classFacet = useMemo(() => findFacet(tree, CLASS_FACET_NAMES), [tree]);
  const currency = rules.currency.enabled ? rules.currency.short.trim() || rules.currency.name.trim() : '';

  return (
    <SettingsSection
      id={id}
      icon={<UserPlus />}
      title="Creación de héroes"
      description="Cómo se crean los héroes nuevos para esta campaña. Los héroes existentes de la biblioteca también pueden unirse."
    >
      <Toggle
        checked={hc.allowNew}
        onChange={(v) =>
          update((d) => {
            d.heroCreation.allowNew = v;
          })
        }
        label="Permitir crear héroes nuevos"
        description="Si lo desactivas, los jugadores solo podrán elegir héroes que ya existan."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <NumberInput
          label="Nivel inicial"
          integer
          min={1}
          max={20}
          value={hc.startingLevel}
          onChange={(v) =>
            update((d) => {
              d.heroCreation.startingLevel = v;
              if (d.heroCreation.maxLevel < v) d.heroCreation.maxLevel = v;
            })
          }
        />
        <NumberInput
          label="Nivel máximo"
          integer
          min={1}
          max={20}
          value={hc.maxLevel}
          hint={hc.maxLevel < hc.startingLevel ? undefined : 'Tope de la campaña'}
          error={hc.maxLevel < hc.startingLevel ? 'No puede ser menor que el nivel inicial' : undefined}
          onChange={(v) =>
            update((d) => {
              d.heroCreation.maxLevel = v;
            })
          }
        />
        <NumberInput
          label="Dinero inicial"
          integer
          min={0}
          max={10000000}
          step={10}
          value={hc.startingGold}
          suffix={currency || undefined}
          onChange={(v) =>
            update((d) => {
              d.heroCreation.startingGold = v;
            })
          }
        />
      </div>

      <div className="space-y-2">
        <SubHeading>Método de atributos</SubHeading>
        <RadioCards<AbilityMethod>
          aria-label="Método de atributos"
          columns={3}
          size="sm"
          value={hc.abilityMethod}
          onChange={(v) =>
            update((d) => {
              d.heroCreation.abilityMethod = v;
            })
          }
          options={[
            {
              value: 'free',
              title: 'Libre',
              description: 'Cada jugador escribe sus puntuaciones; el DM las revisa.',
              icon: <PenLine />,
              accent: '#e9c063',
            },
            {
              value: 'standard_array',
              title: 'Matriz estándar',
              description: `Reparte ${STANDARD_ARRAY.join(', ')} entre los atributos.`,
              icon: <Dices />,
              accent: '#38bdf8',
            },
            {
              value: 'point_buy',
              title: 'Compra de puntos',
              description: `${POINT_BUY_BUDGET} puntos para comprar puntuaciones de 8 a 15.`,
              icon: <Calculator />,
              accent: '#a98bff',
            },
          ]}
        />
      </div>

      {loading && !loaded ? (
        <div className="flex items-center gap-2 text-xs text-parchment-400">
          <Spinner size="xs" /> Cargando razas y clases…
        </div>
      ) : error && !loaded ? (
        <InfoNote tone="warning">No se pudieron cargar las categorías de héroes: {error}</InfoNote>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <AllowedList
            title="Razas permitidas"
            facetLabel="Raza"
            facet={raceFacet}
            selected={hc.allowedRaceIds}
            onChange={(ids) =>
              update((d) => {
                d.heroCreation.allowedRaceIds = ids;
              })
            }
          />
          <AllowedList
            title="Clases permitidas"
            facetLabel="Clase"
            facet={classFacet}
            selected={hc.allowedClassIds}
            onChange={(ids) =>
              update((d) => {
                d.heroCreation.allowedClassIds = ids;
              })
            }
          />
        </div>
      )}
    </SettingsSection>
  );
}

function AllowedList({
  title,
  facetLabel,
  facet,
  selected,
  onChange,
}: {
  title: string;
  facetLabel: string;
  facet: CategoryNode | null;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const options = facet?.children ?? [];
  const optionIds = new Set(options.map((o) => o.id));
  const selectedHere = selected.filter((sid) => optionIds.has(sid));
  const all = selected.length === 0;

  const toggle = (catId: string, on: boolean) => {
    const set = new Set(selected);
    if (on) set.add(catId);
    else set.delete(catId);
    onChange([...set]);
  };

  return (
    <div className="space-y-2">
      <SubHeading
        aside={
          all ? (
            <Badge tone="emerald" size="xs">
              Todas
            </Badge>
          ) : (
            <Badge tone="gold" size="xs">
              {selectedHere.length} de {options.length}
            </Badge>
          )
        }
      >
        {title}
      </SubHeading>
      {!facet ? (
        <InfoNote>
          No hay una faceta «{facetLabel}» en las categorías de héroes. Créala en la Biblioteca para poder limitar las opciones.
        </InfoNote>
      ) : options.length === 0 ? (
        <InfoNote>La faceta «{facet.name}» todavía no tiene opciones.</InfoNote>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg border border-ink-600 bg-ink-950/40 p-3 sm:grid-cols-3">
            {options.map((opt) => (
              <Checkbox
                key={opt.id}
                size="sm"
                checked={selected.includes(opt.id)}
                onChange={(on) => toggle(opt.id, on)}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    {opt.icon && !/^[a-z0-9-]+$/i.test(opt.icon) && <span aria-hidden>{opt.icon}</span>}
                    {opt.name}
                  </span>
                }
              />
            ))}
          </div>
          <div className="flex items-center justify-between text-[11px] text-parchment-400">
            <span>Ninguna marcada = todas permitidas.</span>
            {!all && (
              <button type="button" className="text-gold-300 transition hover:text-gold-200" onClick={() => onChange([])}>
                Permitir todas
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
