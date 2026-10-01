import {
  POINT_BUY_BUDGET,
  STANDARD_ARRAY,
  abilityModifier,
  emptyHeroData,
  normalizeText,
  pointBuyCost,
  suggestedResources,
  type AbilityScores,
  type AttributeDef,
  type CategoryNode,
  type HeroData,
  type HeroResources,
  type HeroSpell,
  type RuleSystem,
} from '@wailers/shared';
import { allowedOptions, suggestedHitDie, suggestedHp, type HeroFacets, type HitDie } from '../heroUtils';

export type StepId = 'identity' | 'origin' | 'abilities' | 'resources' | 'summary';

export interface StepDef {
  id: StepId;
  label: string;
  short: string;
}

export const STEPS: StepDef[] = [
  { id: 'identity', label: 'Identidad y retrato', short: 'Identidad' },
  { id: 'origin', label: 'Raza y clase', short: 'Origen' },
  { id: 'abilities', label: 'Atributos', short: 'Atributos' },
  { id: 'resources', label: 'Recursos', short: 'Recursos' },
  { id: 'summary', label: 'Resumen', short: 'Resumen' },
];

export type AbilityMethod = RuleSystem['heroCreation']['abilityMethod'];

export const FREE_MIN = 3;
export const FREE_MAX = 20;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;

/** Last 4d6 roll of an attribute (free method), kept for display only. */
export interface AbilityRoll {
  dice: number[];
  /** Index of the discarded die. */
  dropped: number;
}

export interface CreatorState {
  name: string;
  description: string;
  imageUrl: string | null;
  tags: string[];
  raceId: string | null;
  subraceId: string | null;
  classId: string | null;
  subclassId: string | null;
  alignmentId: string | null;
  roleIds: string[];
  extraCategoryIds: string[];
  /** Free and point-buy scores per attribute key. */
  scores: AbilityScores;
  /** Standard array value assigned to each attribute key. */
  assigned: Record<string, number | null>;
  rolls: Record<string, AbilityRoll>;
  level: number;
  /** null = suggested from the class. */
  hitDie: HitDie | null;
  /** null = suggested (hit die + CON). */
  hpMax: number | null;
  /** null = 10 + DEX modifier. */
  ac: number | null;
  /** null = DEX modifier. */
  initiativeBonus: number | null;
  speed: string;
  gold: number;
  usesMagic: boolean;
  /** null = suggested by the rules (per level). */
  manaMax: number | null;
  spells: HeroSpell[];
}

/** Everything the wizard derives from the campaign rules. */
export interface CreatorContext {
  rules: RuleSystem;
  /** Enabled attributes, in rule order. */
  attributes: AttributeDef[];
  method: AbilityMethod;
  /** Level and starting gold come from a campaign (read-only). */
  fromCampaign: boolean;
}

export function createContext(rules: RuleSystem, fromCampaign: boolean): CreatorContext {
  const attributes = rules.attributes.filter((a) => a.enabled);
  return { rules, attributes, method: rules.heroCreation.abilityMethod, fromCampaign };
}

function clampLevel(level: number, rules: RuleSystem): number {
  const max = Math.max(1, Math.min(20, rules.heroCreation.maxLevel || 20));
  return Math.max(1, Math.min(max, Math.round(level || 1)));
}

export function initialState(ctx: CreatorContext): CreatorState {
  const scores: AbilityScores = {};
  for (const a of ctx.attributes) scores[a.key] = ctx.method === 'point_buy' ? POINT_BUY_MIN : 10;
  return {
    name: '',
    description: '',
    imageUrl: null,
    tags: [],
    raceId: null,
    subraceId: null,
    classId: null,
    subclassId: null,
    alignmentId: null,
    roleIds: [],
    extraCategoryIds: [],
    scores,
    assigned: {},
    rolls: {},
    level: clampLevel(ctx.rules.heroCreation.startingLevel, ctx.rules),
    hitDie: null,
    hpMax: null,
    ac: null,
    initiativeBonus: null,
    speed: '9 m',
    gold: Math.max(0, ctx.rules.heroCreation.startingGold || 0),
    usesMagic: ctx.rules.magic.mode !== 'none',
    manaMax: null,
    spells: [],
  };
}

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------

/** Number of standard-array values that must be assigned. */
export function arraySlots(ctx: CreatorContext): number {
  return Math.min(ctx.attributes.length, STANDARD_ARRAY.length);
}

export function pointBuySpent(state: CreatorState, ctx: CreatorContext): number {
  let spent = 0;
  for (const a of ctx.attributes) {
    const cost = pointBuyCost(state.scores[a.key] ?? POINT_BUY_MIN);
    spent += Number.isFinite(cost) ? cost : 0;
  }
  return spent;
}

/** Final ability scores of the hero for the enabled attributes. */
export function finalAbilities(state: CreatorState, ctx: CreatorContext): AbilityScores {
  const out: AbilityScores = {};
  for (const a of ctx.attributes) {
    if (ctx.method === 'standard_array') out[a.key] = state.assigned[a.key] ?? 10;
    else if (ctx.method === 'point_buy') out[a.key] = Math.max(POINT_BUY_MIN, Math.min(POINT_BUY_MAX, state.scores[a.key] ?? POINT_BUY_MIN));
    else out[a.key] = Math.max(FREE_MIN, Math.min(FREE_MAX, state.scores[a.key] ?? 10));
  }
  return out;
}

/** Modifier of a classic ability when the campaign uses it (0 otherwise). */
function modOf(abilities: AbilityScores, key: string): number {
  const v = abilities[key];
  return typeof v === 'number' ? abilityModifier(v) : 0;
}

// ---------------------------------------------------------------------------
// Origin options
// ---------------------------------------------------------------------------

export interface OriginOptions {
  races: CategoryNode[];
  classes: CategoryNode[];
  alignments: CategoryNode[];
  roles: CategoryNode[];
}

export function originOptions(facets: HeroFacets, rules: RuleSystem): OriginOptions {
  return {
    races: allowedOptions(facets.race, rules.heroCreation.allowedRaceIds),
    classes: allowedOptions(facets.class, rules.heroCreation.allowedClassIds),
    alignments: facets.alignment?.children ?? [],
    roles: facets.role?.children ?? [],
  };
}

export function findNode(nodes: CategoryNode[], id: string | null): CategoryNode | null {
  if (!id) return null;
  for (const n of nodes) {
    if (n.id === id) return n;
    const inner = findNode(n.children, id);
    if (inner) return inner;
  }
  return null;
}

/**
 * Subclasses for the chosen class: a dedicated "Subclase" facet (grouped by class name when it has such
 * groups) or, otherwise, the children of the class value itself.
 */
export function subclassOptions(facets: HeroFacets, classNode: CategoryNode | null): CategoryNode[] {
  if (!classNode) return [];
  if (facets.subclass) {
    const wanted = normalizeText(classNode.name);
    const group = facets.subclass.children.find((c) => normalizeText(c.name) === wanted);
    if (group) return group.children;
    const looksGrouped = facets.subclass.children.some((c) => c.children.length > 0);
    return looksGrouped ? [] : facets.subclass.children;
  }
  return classNode.children;
}

// ---------------------------------------------------------------------------
// Derived sheet values
// ---------------------------------------------------------------------------

export interface DerivedSheet {
  abilities: AbilityScores;
  className: string | null;
  hitDie: HitDie;
  suggestedHitDie: HitDie;
  suggestedHpMax: number;
  hpMax: number;
  suggestedAc: number;
  ac: number;
  suggestedInitiative: number;
  initiativeBonus: number;
  suggestedMana: number;
  resources: HeroResources;
  showSpells: boolean;
}

export function derive(state: CreatorState, ctx: CreatorContext, classNode: CategoryNode | null): DerivedSheet {
  const abilities = finalAbilities(state, ctx);
  const dexMod = modOf(abilities, 'dex');
  const con = typeof abilities.con === 'number' ? abilities.con : null;
  const className = classNode?.name ?? null;
  const suggestedDie = suggestedHitDie(className);
  const hitDie = state.hitDie ?? suggestedDie;
  const suggestedHpMax = suggestedHp(hitDie, state.level, con);
  const hpMax = state.hpMax ?? suggestedHpMax;
  const suggestedAc = 10 + dexMod;
  const ac = state.ac ?? suggestedAc;
  const initiativeBonus = state.initiativeBonus ?? dexMod;

  const base = suggestedResources(ctx.rules, state.level);
  const mode = ctx.rules.magic.mode;
  const suggestedMana = base.mana.max;
  let resources: HeroResources;
  if (!state.usesMagic || mode === 'none') {
    resources = { mana: { current: 0, max: 0 }, slots: [], uses: [] };
  } else {
    const manaMax = mode === 'mana' ? Math.max(0, state.manaMax ?? suggestedMana) : 0;
    resources = { mana: { current: manaMax, max: manaMax }, slots: mode === 'slots' ? base.slots : [], uses: [] };
  }
  return {
    abilities,
    className,
    hitDie,
    suggestedHitDie: suggestedDie,
    suggestedHpMax,
    hpMax,
    suggestedAc,
    ac,
    suggestedInitiative: dexMod,
    initiativeBonus,
    suggestedMana,
    resources,
    showSpells: mode !== 'none' && state.usesMagic,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface StepIssue {
  step: StepId;
  message: string;
}

export function validate(state: CreatorState, ctx: CreatorContext, options: OriginOptions, sheet: DerivedSheet): StepIssue[] {
  const out: StepIssue[] = [];
  const name = state.name.trim();
  if (!name) out.push({ step: 'identity', message: 'Ponle un nombre a tu héroe.' });
  else if (name.length > 120) out.push({ step: 'identity', message: 'El nombre no puede superar 120 caracteres.' });
  if (state.description.length > 8000) out.push({ step: 'identity', message: 'El trasfondo es demasiado largo (máximo 8000 caracteres).' });

  if (options.races.length > 0 && !state.raceId) out.push({ step: 'origin', message: 'Elige una raza.' });
  if (options.classes.length > 0 && !state.classId) out.push({ step: 'origin', message: 'Elige una clase.' });

  if (ctx.method === 'standard_array') {
    const assigned = ctx.attributes.filter((a) => typeof state.assigned[a.key] === 'number').length;
    if (assigned < arraySlots(ctx)) out.push({ step: 'abilities', message: 'Asigna todos los valores de la tabla estándar.' });
  } else if (ctx.method === 'point_buy') {
    const spent = pointBuySpent(state, ctx);
    if (spent > POINT_BUY_BUDGET) out.push({ step: 'abilities', message: `Has gastado ${spent} puntos de ${POINT_BUY_BUDGET}.` });
  } else {
    const bad = ctx.attributes.some((a) => {
      const v = state.scores[a.key];
      return typeof v !== 'number' || v < FREE_MIN || v > FREE_MAX;
    });
    if (bad) out.push({ step: 'abilities', message: `Cada atributo debe estar entre ${FREE_MIN} y ${FREE_MAX}.` });
  }

  const maxLevel = Math.max(1, Math.min(20, ctx.rules.heroCreation.maxLevel || 20));
  if (state.level < 1 || state.level > maxLevel) out.push({ step: 'resources', message: `El nivel debe estar entre 1 y ${maxLevel}.` });
  if (sheet.hpMax < 1 || sheet.hpMax > 9999) out.push({ step: 'resources', message: 'Los puntos de vida máximos deben ser al menos 1.' });
  if (sheet.ac < 0 || sheet.ac > 40) out.push({ step: 'resources', message: 'La clase de armadura debe estar entre 0 y 40.' });
  if (state.gold < 0) out.push({ step: 'resources', message: 'El oro inicial no puede ser negativo.' });
  return out;
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export function selectedCategoryIds(state: CreatorState): string[] {
  const ids = [state.raceId, state.subraceId, state.classId, state.subclassId, state.alignmentId, ...state.roleIds, ...state.extraCategoryIds];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

export function heroData(state: CreatorState, sheet: DerivedSheet): HeroData {
  const base = emptyHeroData();
  return {
    ...base,
    abilities: sheet.abilities,
    hp: { current: sheet.hpMax, max: sheet.hpMax, temp: 0 },
    ac: sheet.ac,
    speed: state.speed.trim() || base.speed,
    initiativeBonus: sheet.initiativeBonus,
    xp: 0,
    gold: Math.max(0, state.gold),
    inventory: [],
    spells: sheet.showSpells ? state.spells : [],
    resources: sheet.resources,
    statuses: [],
    visionCells: null,
    notes: '',
  };
}

/** True once the user typed or picked anything worth confirming before closing. */
export function isDirty(state: CreatorState, initial: CreatorState): boolean {
  return JSON.stringify(state) !== JSON.stringify(initial);
}
