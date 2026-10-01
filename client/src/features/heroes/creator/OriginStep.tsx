import { Spinner } from '../../../components/ui/Spinner';
import { CategoryTree } from '../../library/CategoryTree';
import { SectionTitle } from '../../library/common';
import type { HeroFacets } from '../heroUtils';
import { findNode, subclassOptions, type CreatorState, type OriginOptions } from './state';
import { ChipChoice, IssueList, Note, OptionGrid, StepIntro, categoryEmoji } from './ui';

export interface OriginStepProps {
  state: CreatorState;
  onChange: (patch: Partial<CreatorState>) => void;
  facets: HeroFacets;
  options: OriginOptions;
  loading: boolean;
  /** The campaign limits races / classes. */
  restricted: { races: boolean; classes: boolean };
  issues: string[];
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function OriginStep({ state, onChange, facets, options, loading, restricted, issues }: OriginStepProps) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" label="Cargando razas y clases…" showLabel />
      </div>
    );
  }

  const race = findNode(options.races, state.raceId);
  const classNode = findNode(options.classes, state.classId);
  const subraces = race?.children ?? [];
  const subclasses = subclassOptions(facets, classNode);
  const raceAccent = facets.race?.color ?? '#16a085';
  const classAccent = facets.class?.color ?? '#d4a63f';
  const knownFacets = [facets.race, facets.class, facets.subclass, facets.alignment, facets.role].filter(Boolean);
  const noFacets = knownFacets.length === 0 && facets.others.length === 0;

  return (
    <div className="flex flex-col gap-7">
      <div>
        <StepIntro title="Raza y clase">Elige de dónde viene tu héroe y cuál es su oficio. El DM puede limitar las opciones de cada campaña.</StepIntro>
        <IssueList messages={issues} />
        {noFacets && (
          <Note tone="warning">
            Todavía no hay categorías de héroes. El DM puede crear facetas como «Raza» o «Clase» desde «Gestionar categorías» en la biblioteca;
            mientras tanto puedes continuar sin elegirlas.
          </Note>
        )}
      </div>

      {facets.race && (
        <section>
          <SectionTitle aside={restricted.races ? <span className="text-[11px] text-gold-300">Limitadas por la campaña</span> : undefined}>
            {facets.race.name}
          </SectionTitle>
          <div className="mt-3">
            {options.races.length === 0 ? (
              <Note>La faceta «{facets.race.name}» no tiene opciones disponibles.</Note>
            ) : (
              <OptionGrid
                aria-label={facets.race.name}
                options={options.races}
                value={state.raceId}
                accent={raceAccent}
                caption={(n) => (n.children.length ? plural(n.children.length, 'variante', 'variantes') : null)}
                onSelect={(raceId) => onChange({ raceId, subraceId: null })}
              />
            )}
          </div>
          {subraces.length > 0 && (
            <div className="mt-3 animate-fade-in rounded-lg border border-ink-600/60 bg-ink-950/30 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-parchment-400">Variante de {race?.name} (opcional)</div>
              <ChipChoice
                options={subraces}
                selected={state.subraceId ? [state.subraceId] : []}
                accent={race?.color ?? raceAccent}
                onToggle={(id) => onChange({ subraceId: state.subraceId === id ? null : id })}
              />
            </div>
          )}
        </section>
      )}

      {facets.class && (
        <section>
          <SectionTitle aside={restricted.classes ? <span className="text-[11px] text-gold-300">Limitadas por la campaña</span> : undefined}>
            {facets.class.name}
          </SectionTitle>
          <div className="mt-3">
            {options.classes.length === 0 ? (
              <Note>La faceta «{facets.class.name}» no tiene opciones disponibles.</Note>
            ) : (
              <OptionGrid
                aria-label={facets.class.name}
                options={options.classes}
                value={state.classId}
                accent={classAccent}
                caption={(n) => (n.children.length && !facets.subclass ? plural(n.children.length, 'subclase', 'subclases') : null)}
                onSelect={(classId) => onChange({ classId, subclassId: null, hitDie: null, hpMax: null })}
              />
            )}
          </div>
          {classNode && subclasses.length > 0 && (
            <div className="mt-3 animate-fade-in rounded-lg border border-ink-600/60 bg-ink-950/30 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-parchment-400">
                {categoryEmoji(classNode.icon) && <span aria-hidden>{categoryEmoji(classNode.icon)}</span>}
                {facets.subclass?.name ?? 'Subclase'} de {classNode.name} (opcional)
              </div>
              <ChipChoice
                options={subclasses}
                selected={state.subclassId ? [state.subclassId] : []}
                accent={classNode.color ?? classAccent}
                onToggle={(id) => onChange({ subclassId: state.subclassId === id ? null : id })}
              />
            </div>
          )}
        </section>
      )}

      {facets.alignment && options.alignments.length > 0 && (
        <section>
          <SectionTitle>{facets.alignment.name} (opcional)</SectionTitle>
          <div className="mt-3">
            <OptionGrid
              size="sm"
              aria-label={facets.alignment.name}
              options={options.alignments}
              value={state.alignmentId}
              accent={facets.alignment.color ?? '#7f8c8d'}
              onSelect={(alignmentId) => onChange({ alignmentId })}
            />
          </div>
        </section>
      )}

      {facets.role && options.roles.length > 0 && (
        <section>
          <SectionTitle>{facets.role.name} (opcional, varios)</SectionTitle>
          <div className="mt-3">
            <ChipChoice
              multi
              aria-label={facets.role.name}
              options={options.roles}
              selected={state.roleIds}
              accent={facets.role.color ?? '#2980b9'}
              onToggle={(id) =>
                onChange({ roleIds: state.roleIds.includes(id) ? state.roleIds.filter((r) => r !== id) : [...state.roleIds, id] })
              }
            />
          </div>
        </section>
      )}

      {facets.others.length > 0 && (
        <section>
          <SectionTitle>Otras categorías (opcional)</SectionTitle>
          <div className="mt-3">
            <CategoryTree
              kind="hero"
              mode="pick"
              defaultExpanded="all"
              facetIds={facets.others.map((f) => f.id)}
              value={state.extraCategoryIds}
              onChange={(extraCategoryIds) => onChange({ extraCategoryIds })}
            />
          </div>
        </section>
      )}
    </div>
  );
}
