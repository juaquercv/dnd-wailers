import { useCallback, useRef } from 'react';
import { DEFAULT_ABILITIES, normalizeText, type AttributeDef, type RuleSystem } from '@wailers/shared';

export type RulesUpdater = (recipe: (draft: RuleSystem) => void) => void;

export interface RuleSectionProps {
  rules: RuleSystem;
  update: RulesUpdater;
}

/** Immutable updates of a RuleSystem: the recipe mutates a deep copy that is emitted with onChange. */
export function useRulesUpdater(rules: RuleSystem, onChange: (rules: RuleSystem) => void): RulesUpdater {
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  return useCallback((recipe) => {
    const draft = structuredClone(rulesRef.current);
    recipe(draft);
    rulesRef.current = draft;
    onChangeRef.current(draft);
  }, []);
}

const BUILT_IN_KEYS = new Set<string>(DEFAULT_ABILITIES.map((a) => a.key));

/** Standard abilities (FUE, DES…) can be disabled and renamed but not removed. */
export function isBuiltInAttribute(attr: AttributeDef): boolean {
  return BUILT_IN_KEYS.has(attr.key);
}

/** Stable identifier derived from a label ("Cordura" -> "cordura"), unique among `existing`. */
export function attributeKeyFrom(label: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  const base =
    normalizeText(label)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'atributo';
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Default abbreviation: first three letters in uppercase. */
export function shortFrom(label: string): string {
  const letters = label.trim().replace(/\s+/g, '');
  return letters.slice(0, 3).toUpperCase();
}

/** Display name of the campaign resource (mana renamed by the campaign), never empty. */
export function resourceName(rules: RuleSystem): string {
  return rules.magic.manaName.trim() || 'Recurso';
}
