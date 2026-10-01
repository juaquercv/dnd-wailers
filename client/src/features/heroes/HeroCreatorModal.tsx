import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, Check, Sparkles, Wand2 } from 'lucide-react';
import { createRuleSystem, normalizeTags, type LibraryEntry, type RuleSystem } from '@wailers/shared';
import { api } from '../../api/http';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Kbd } from '../../components/ui/Kbd';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/toast';
import { useHotkeys } from '../../lib/hotkeys';
import { useCategories } from '../../stores/categories';
import { useUser, useUsers } from '../../stores/users';
import { AbilitiesStep } from './creator/AbilitiesStep';
import { HeroPreview } from './creator/HeroPreview';
import { IdentityStep } from './creator/IdentityStep';
import { OriginStep } from './creator/OriginStep';
import { ResourcesStep } from './creator/ResourcesStep';
import {
  STEPS,
  createContext,
  derive,
  findNode,
  heroData,
  initialState,
  isDirty,
  originOptions,
  selectedCategoryIds,
  validate,
  type CreatorState,
  type StepId,
} from './creator/state';
import { IssueList, Note, StepIntro } from './creator/ui';
import { splitHeroFacets } from './heroUtils';

export interface HeroCreatorModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (hero: LibraryEntry<'hero'>) => void;
  /** Campaign rules (null = generic rules: level and starting gold become editable). */
  rules: RuleSystem | null;
  ownerId: string;
  campaignId?: string;
}

/**
 * Step-by-step hero creation: identity → race & class → abilities → resources → summary.
 * Respects the campaign rules (allowed races/classes, ability method, starting level and gold, magic mode).
 * The caller shows the success feedback in onCreated.
 */
export function HeroCreatorModal(props: HeroCreatorModalProps) {
  if (!props.open) return null;
  return <CreatorWizard {...props} />;
}

function CreatorWizard({ onClose, onCreated, rules, ownerId, campaignId }: HeroCreatorModalProps) {
  const effectiveRules = useMemo(() => rules ?? createRuleSystem(), [rules]);
  const ctx = useMemo(() => createContext(effectiveRules, rules !== null), [effectiveRules, rules]);
  const [initial] = useState<CreatorState>(() => initialState(ctx));
  const [state, setState] = useState<CreatorState>(initial);
  const [step, setStep] = useState<StepId>('identity');
  const [checked, setChecked] = useState<Set<StepId>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  useUsers();
  const owner = useUser(ownerId);
  const ownerName = owner?.name ?? null;
  const ownerColor = owner?.color ?? null;

  const { tree, facetOf, loading, loaded } = useCategories('hero');
  const hc = effectiveRules.heroCreation;
  const facets = useMemo(
    () => splitHeroFacets(tree, facetOf, hc.allowedRaceIds, hc.allowedClassIds),
    [tree, facetOf, hc.allowedRaceIds, hc.allowedClassIds],
  );
  const options = useMemo(() => originOptions(facets, effectiveRules), [facets, effectiveRules]);
  const classNode = findNode(options.classes, state.classId) ?? (facets.class ? findNode(facets.class.children, state.classId) : null);
  const sheet = derive(state, ctx, classNode);
  const issues = validate(state, ctx, options, sheet);
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const isLast = step === 'summary';

  const patch = (p: Partial<CreatorState>) => setState((s) => ({ ...s, ...p }));
  const issuesOf = (id: StepId) => issues.filter((i) => i.step === id).map((i) => i.message);
  const visibleIssues = (id: StepId) => (checked.has(id) ? issuesOf(id) : []);
  const reachable = (index: number) => STEPS.slice(0, index).every((s) => issuesOf(s.id).length === 0);

  const goTo = (id: StepId) => setStep(id);

  const next = () => {
    const own = issuesOf(step);
    if (own.length > 0) {
      setChecked((c) => new Set(c).add(step));
      toast.warning(own[0]!);
      return;
    }
    const target = STEPS[stepIndex + 1];
    if (target) goTo(target.id);
  };

  const back = () => {
    const target = STEPS[stepIndex - 1];
    if (target) goTo(target.id);
  };

  const create = async () => {
    if (saving) return;
    const first = issues[0];
    if (first) {
      setChecked(new Set(STEPS.map((s) => s.id)));
      goTo(first.step);
      toast.warning(first.message);
      return;
    }
    setSaving(true);
    try {
      const hero = await api.library.create<'hero'>({
        kind: 'hero',
        name: state.name.trim(),
        description: state.description.trim(),
        imageUrl: state.imageUrl,
        tags: normalizeTags(state.tags),
        categoryIds: selectedCategoryIds(state),
        ...(ownerId ? { ownerId } : {}),
        originCampaignId: campaignId ?? null,
        level: state.level,
        hp: sheet.hpMax,
        data: heroData(state, sheet),
      });
      onCreated(hero);
    } catch (err) {
      toast.fromError(err, 'No se pudo crear el héroe');
      setSaving(false);
    }
  };

  const requestClose = async () => {
    if (saving) return;
    if (isDirty(state, initial)) {
      const ok = await confirm({
        title: '¿Descartar el héroe?',
        message: 'Perderás todo lo que has elegido hasta ahora.',
        confirmLabel: 'Descartar',
        cancelLabel: 'Seguir creando',
        danger: true,
      });
      if (!ok) return;
    }
    onClose();
  };

  useHotkeys(
    {
      'mod+enter': () => {
        if (isLast) void create();
        else next();
      },
    },
    { allowInInputs: true },
  );

  const restricted = { races: hc.allowedRaceIds.length > 0, classes: hc.allowedClassIds.length > 0 };

  const renderStep = () => {
    switch (step) {
      case 'identity':
        return <IdentityStep state={state} onChange={patch} ownerName={ownerName} ownerColor={ownerColor} issues={visibleIssues('identity')} />;
      case 'origin':
        return (
          <OriginStep
            state={state}
            onChange={patch}
            facets={facets}
            options={options}
            loading={!loaded && loading}
            restricted={restricted}
            issues={visibleIssues('origin')}
          />
        );
      case 'abilities':
        return <AbilitiesStep state={state} onChange={patch} ctx={ctx} issues={visibleIssues('abilities')} />;
      case 'resources':
        return <ResourcesStep state={state} onChange={patch} ctx={ctx} sheet={sheet} campaignId={campaignId} issues={visibleIssues('resources')} />;
      case 'summary':
        return (
          <div>
            <StepIntro title="Todo listo">Revisa la ficha antes de crear a tu héroe. Podrás editarla después desde la biblioteca.</StepIntro>
            <IssueList messages={checked.has('summary') ? issues.map((i) => i.message) : []} />
            {issues.length > 0 && !checked.has('summary') && (
              <div className="mb-4">
                <Note tone="warning">
                  Faltan datos:{' '}
                  {issues.map((i, n) => (
                    <span key={i.message}>
                      {n > 0 && ' · '}
                      <button type="button" className="font-semibold text-gold-200 underline-offset-2 hover:underline" onClick={() => goTo(i.step)}>
                        {i.message}
                      </button>
                    </span>
                  ))}
                </Note>
              </div>
            )}
            <div className="rounded-2xl border border-gold-700/40 bg-gradient-to-b from-ink-800/80 to-ink-900 p-5 shadow-[0_0_40px_-20px_rgba(233,192,99,0.6)]">
              <HeroPreview state={state} sheet={sheet} ctx={ctx} ownerName={ownerName} ownerColor={ownerColor} full />
            </div>
          </div>
        );
    }
  };

  return (
    <Modal
      open
      onClose={() => void requestClose()}
      size="xl"
      icon={<Wand2 />}
      title="Crear héroe"
      subtitle={`${ownerName ? `Para ${ownerName} · ` : ''}${rules ? 'Reglas de la campaña' : 'Reglas genéricas (podrás adaptarlo a cada campaña)'}`}
      bodyClassName="p-0"
      className="h-[min(50rem,calc(100vh-2rem))]"
      footer={
        <>
          <span className="mr-auto hidden items-center gap-1.5 text-xs text-parchment-400 sm:inline-flex">
            Paso {stepIndex + 1} de {STEPS.length} · <Kbd combo="mod+enter" /> {isLast ? 'crear' : 'siguiente'}
          </span>
          <Button variant="ghost" icon={<ArrowLeft />} onClick={back} disabled={stepIndex === 0 || saving}>
            Atrás
          </Button>
          {isLast ? (
            <Button variant="primary" epic icon={<Sparkles />} loading={saving} onClick={() => void create()}>
              Crear héroe
            </Button>
          ) : (
            <Button variant="primary" iconRight={<ArrowRight />} onClick={next}>
              Siguiente
            </Button>
          )}
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <nav aria-label="Pasos" className="shrink-0 border-b border-ink-600/60 bg-ink-950/40 px-4 py-3 sm:px-6">
          <ol className="flex items-center gap-1 sm:gap-2">
            {STEPS.map((s, i) => {
              const active = s.id === step;
              const done = i < stepIndex && issuesOf(s.id).length === 0;
              const canGo = i <= stepIndex || reachable(i);
              return (
                <li key={s.id} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
                  <button
                    type="button"
                    disabled={!canGo}
                    onClick={() => goTo(s.id)}
                    aria-current={active ? 'step' : undefined}
                    className={clsx(
                      'group flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-left transition disabled:cursor-not-allowed',
                      canGo && !active && 'hover:bg-ink-800/70',
                    )}
                  >
                    <span
                      className={clsx(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition',
                        active
                          ? 'border-gold-300 bg-gold-sheen text-ink-950 shadow-[0_0_14px_-2px_rgba(233,192,99,0.8)]'
                          : done
                            ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                            : checked.has(s.id) && issuesOf(s.id).length > 0
                              ? 'border-blood-500/60 bg-blood-500/15 text-blood-300'
                              : 'border-ink-500 bg-ink-800 text-parchment-400',
                      )}
                    >
                      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                    </span>
                    <span className={clsx('hidden truncate text-xs font-medium md:block', active ? 'text-gold-200' : 'text-parchment-300')}>{s.short}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <span className={clsx('h-px min-w-[0.75rem] flex-1 transition-colors', i < stepIndex ? 'bg-gold-600/60' : 'bg-ink-600')} aria-hidden />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="scroll-thin min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
            <div key={step} className="animate-slide-up">
              {renderStep()}
            </div>
          </div>
          {!isLast && (
            <aside className="scroll-thin hidden min-h-0 overflow-y-auto border-l border-ink-600/60 bg-ink-950/40 px-4 py-5 lg:block">
              <div className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-parchment-500">Vista previa</div>
              <HeroPreview state={state} sheet={sheet} ctx={ctx} ownerName={ownerName} ownerColor={ownerColor} />
            </aside>
          )}
        </div>
      </div>
    </Modal>
  );
}
