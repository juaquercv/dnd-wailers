import {
  ENTRY_KINDS,
  ENTRY_KIND_LABELS,
  RARITY_INFO,
  SIZE_INFO,
  SOUND_TYPE_LABELS,
  ZONE_TYPE_LABELS,
  type EntryKind,
  type LibraryEntry,
  type LiveState,
  type Projection,
  type RuleSystem,
} from '@wailers/shared';
import { formatCr, formatGold, formatNumber, formatWeight } from '../../../lib/format';

export type ProjectionEntry = NonNullable<Projection['entry']>;
type Detail = ProjectionEntry['details'][number];

function isKind<K extends EntryKind>(entry: LibraryEntry, kind: K): entry is LibraryEntry<K> {
  return entry.kind === kind;
}

function push(out: Detail[], label: string, value: string | number | null | undefined): void {
  if (value === null || value === undefined) return;
  const text = typeof value === 'number' ? formatNumber(value) : value.trim();
  if (!text || text === '—') return;
  out.push({ label, value: text.slice(0, 1000) });
}

/** Spanish label of an entry kind stored as a free string in projections. */
export function entryKindLabel(kind: string): string {
  return (ENTRY_KINDS as readonly string[]).includes(kind) ? ENTRY_KIND_LABELS[kind as EntryKind].singular : kind;
}

/** Key facts of a library entry, as label/value rows, for showing it to the players. */
export function entryDetails(entry: LibraryEntry, rules: RuleSystem | null): Detail[] {
  const out: Detail[] = [];
  if (isKind(entry, 'creature')) {
    push(out, 'Desafío', entry.cr !== null ? formatCr(entry.cr) : null);
    push(out, 'Puntos de vida', entry.hp);
    push(out, 'Clase de armadura', entry.data.ac);
    push(out, 'Tamaño', entry.size ? SIZE_INFO[entry.size]?.label ?? null : null);
    push(out, 'Velocidad', entry.data.speed);
    if (entry.data.resistances.length > 0) push(out, 'Resistencias', entry.data.resistances.join(', '));
    if (entry.data.weaknesses.length > 0) push(out, 'Debilidades', entry.data.weaknesses.join(', '));
    if (entry.data.immunities.length > 0) push(out, 'Inmunidades', entry.data.immunities.join(', '));
  } else if (isKind(entry, 'item')) {
    push(out, 'Rareza', entry.rarity ? RARITY_INFO[entry.rarity]?.label ?? null : null);
    const currency = rules?.currency.enabled ? rules.currency.short || rules.currency.name : 'po';
    push(out, 'Valor', entry.value !== null ? formatGold(entry.value, false, currency) : null);
    push(out, 'Peso', entry.weight !== null ? formatWeight(entry.weight) : null);
    push(out, 'Daño', entry.data.damage);
    push(out, 'Clase de armadura', entry.data.armorClass);
    push(out, 'Cargas', entry.data.charges);
    if (entry.data.attunement) push(out, 'Sintonía', 'Requiere sintonización');
    push(out, 'Efectos', entry.data.effects);
  } else if (isKind(entry, 'spell')) {
    const level = entry.level ?? entry.data.slotLevel;
    push(out, 'Nivel', level === null || level === undefined ? null : level <= 0 ? 'Truco' : `Nivel ${level}`);
    push(out, 'Escuela', entry.data.school);
    push(out, 'Tiempo de lanzamiento', entry.data.castingTime);
    push(out, 'Alcance', entry.data.range);
    push(out, 'Duración', entry.data.duration);
    push(out, 'Componentes', entry.data.components);
    if (entry.data.concentration) push(out, 'Concentración', 'Sí');
    if (rules?.magic.mode === 'mana' && entry.data.manaCost > 0) {
      push(out, `Coste (${rules.magic.manaName.trim() || 'recurso'})`, entry.data.manaCost);
    }
    const damage = [entry.data.damage, entry.data.damageType].filter((s) => s && s.trim()).join(' ');
    push(out, 'Daño', damage);
  } else if (isKind(entry, 'hero')) {
    push(out, 'Nivel', entry.level);
    push(out, 'Puntos de vida', entry.data.hp.max);
    push(out, 'Clase de armadura', entry.data.ac);
    push(out, 'Velocidad', entry.data.speed);
  } else if (isKind(entry, 'sound')) {
    push(out, 'Tipo', SOUND_TYPE_LABELS[entry.data.soundType] ?? null);
  } else if (isKind(entry, 'zone')) {
    push(out, 'Tipo', ZONE_TYPE_LABELS[entry.data.content.zoneType] ?? null);
    push(out, 'Niveles', entry.data.content.levels.length);
  }
  return out.slice(0, 40);
}

/** Text shown as the entry description (falls back to the spell effect or item effects). */
export function entryDescription(entry: LibraryEntry): string {
  if (entry.description.trim()) return entry.description.trim();
  if (isKind(entry, 'spell')) return entry.data.effect.trim();
  if (isKind(entry, 'item')) return entry.data.effects.trim();
  return '';
}

/** Snapshot of a library entry for a projection (`show:open` kind 'entry'). */
export function entrySnapshot(
  entry: LibraryEntry,
  rules: RuleSystem | null,
  opts: { description: boolean; details: boolean },
): ProjectionEntry {
  return {
    kind: entry.kind,
    name: entry.name,
    imageUrl: entry.imageUrl,
    description: opts.description ? entryDescription(entry).slice(0, 10000) : '',
    details: opts.details ? entryDetails(entry, rules) : [],
  };
}

/** "todos" or the names of the targeted players. */
export function projectionTargetsLabel(projection: Pick<Projection, 'targets'>, state: LiveState | null): string {
  if (projection.targets === 'all') return 'todos';
  const names = projection.targets.map((id) => state?.players[id]?.name ?? id);
  if (names.length <= 1) return names[0] ?? 'nadie';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}
