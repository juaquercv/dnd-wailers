import {
  emptyEntryData,
  normalizeTags,
  type EntryDataMap,
  type EntryKind,
  type LibraryEntry,
  type LibraryEntryInput,
} from '@wailers/shared';

/** Editable entry, discriminated by kind so `data` narrows. */
export type AnyDraft = { [K in EntryKind]: LibraryEntryInput<K> }[EntryKind];

export type EditorTab =
  | 'general'
  | 'categories'
  | 'stats'
  | 'combat'
  | 'loot'
  | 'properties'
  | 'casting'
  | 'audio'
  | 'content'
  | 'hero-stats'
  | 'resources'
  | 'inventory'
  | 'spells'
  | 'notes';

export interface TabDef {
  id: EditorTab;
  label: string;
}

export function tabsFor(kind: EntryKind): TabDef[] {
  const common: TabDef[] = [
    { id: 'general', label: 'General' },
    { id: 'categories', label: 'Categorías' },
  ];
  switch (kind) {
    case 'creature':
      return [...common, { id: 'stats', label: 'Estadísticas' }, { id: 'combat', label: 'Ataques y rasgos' }, { id: 'loot', label: 'Botín y notas' }];
    case 'item':
      return [...common, { id: 'properties', label: 'Propiedades' }];
    case 'spell':
      return [...common, { id: 'casting', label: 'Lanzamiento' }];
    case 'sound':
      return [...common, { id: 'audio', label: 'Audio' }];
    case 'zone':
      return [...common, { id: 'content', label: 'Contenido' }];
    case 'hero':
      return [
        ...common,
        { id: 'hero-stats', label: 'Atributos' },
        { id: 'resources', label: 'Recursos' },
        { id: 'inventory', label: 'Inventario' },
        { id: 'spells', label: 'Hechizos' },
        { id: 'notes', label: 'Notas' },
      ];
    default:
      return common;
  }
}

/** Facet column defaults for a brand new entry. */
function baseColumns(kind: EntryKind): Partial<LibraryEntryInput> {
  switch (kind) {
    case 'creature':
      return { cr: 1, hp: 10, size: 'medium' };
    case 'item':
      return { rarity: 'common', value: 0, weight: 0 };
    case 'spell':
      return { level: 1 };
    case 'zone':
      return { level: 1 };
    case 'hero':
      return { level: 1, hp: 10 };
    default:
      return {};
  }
}

function emptyInput(kind: EntryKind): LibraryEntryInput {
  return {
    kind,
    name: '',
    description: '',
    imageUrl: null,
    tags: [],
    categoryIds: [],
    ownerId: null,
    originCampaignId: null,
    level: null,
    cr: null,
    hp: null,
    value: null,
    weight: null,
    rarity: null,
    size: null,
    data: emptyEntryData(kind),
  };
}

/** New draft for `kind`, merging caller defaults (data is merged key by key over the empty data). */
export function newDraft(kind: EntryKind, defaults: Partial<LibraryEntryInput> | undefined, userId: string | null): AnyDraft {
  const base = emptyInput(kind);
  const { kind: _ignoredKind, data: defaultData, ...rest } = defaults ?? {};
  const data = { ...(base.data as object), ...((defaultData as object | undefined) ?? {}) } as EntryDataMap[EntryKind];
  const draft: LibraryEntryInput = {
    ...base,
    ...baseColumns(kind),
    ownerId: kind === 'hero' ? userId : null,
    ...rest,
    kind,
    data: structuredClone(data),
  };
  return draft as AnyDraft;
}

export function draftFromEntry(entry: LibraryEntry): AnyDraft {
  const base = emptyInput(entry.kind);
  const draft: LibraryEntryInput = {
    kind: entry.kind,
    name: entry.name,
    description: entry.description ?? '',
    imageUrl: entry.imageUrl,
    tags: [...(entry.tags ?? [])],
    categoryIds: [...(entry.categoryIds ?? [])],
    ownerId: entry.ownerId,
    originCampaignId: entry.originCampaignId,
    level: entry.level,
    cr: entry.cr,
    hp: entry.hp,
    value: entry.value,
    weight: entry.weight,
    rarity: entry.rarity,
    size: entry.size,
    data: structuredClone({ ...(base.data as object), ...((entry.data as object | undefined) ?? {}) }) as EntryDataMap[EntryKind],
  };
  return draft as AnyDraft;
}

export interface FieldError {
  key: string;
  tab: EditorTab;
  message: string;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Spanish validation messages; keys map to fields, tabs let the modal jump to the first problem. */
export function validateDraft(d: AnyDraft): FieldError[] {
  const out: FieldError[] = [];
  const push = (key: string, tab: EditorTab, message: string) => out.push({ key, tab, message });
  const name = d.name.trim();
  if (!name) push('name', 'general', 'El nombre es obligatorio.');
  else if (name.length > 120) push('name', 'general', 'El nombre no puede superar 120 caracteres.');
  if ((d.description ?? '').length > 8000) push('description', 'general', 'La descripción es demasiado larga (máximo 8000 caracteres).');

  switch (d.kind) {
    case 'creature': {
      if (isNum(d.cr) && (d.cr < 0 || d.cr > 30)) push('cr', 'general', 'El desafío debe estar entre 0 y 30.');
      if (!isNum(d.hp) || d.hp < 1) push('hp', 'general', 'Los puntos de vida deben ser al menos 1.');
      if (!isNum(d.data.ac) || d.data.ac < 0 || d.data.ac > 40) push('data.ac', 'stats', 'La clase de armadura debe estar entre 0 y 40.');
      if (!isNum(d.data.xp) || d.data.xp < 0) push('data.xp', 'stats', 'La experiencia no puede ser negativa.');
      if (d.data.tokenCells !== null && (!isNum(d.data.tokenCells) || d.data.tokenCells <= 0 || d.data.tokenCells > 12))
        push('data.tokenCells', 'stats', 'El tamaño de ficha debe estar entre 0,5 y 12 casillas.');
      for (const [k, v] of Object.entries(d.data.abilities ?? {})) {
        if (!isNum(v) || v < 1 || v > 30) push(`ability.${k}`, 'stats', 'Las puntuaciones de característica van de 1 a 30.');
      }
      for (const a of d.data.attacks) if (!a.name.trim()) push(`attack.${a.id}`, 'combat', 'Cada ataque necesita un nombre.');
      for (const t of d.data.traits) if (!t.name.trim()) push(`trait.${t.id}`, 'combat', 'Cada rasgo necesita un nombre.');
      for (const l of d.data.suggestedLoot) {
        if (!l.name.trim()) push(`loot.${l.id}`, 'loot', 'Cada objeto del botín necesita un nombre.');
        else if (!isNum(l.quantity) || l.quantity < 1) push(`loot.${l.id}`, 'loot', 'La cantidad debe ser al menos 1.');
      }
      break;
    }
    case 'item': {
      if (isNum(d.value) && d.value < 0) push('value', 'general', 'El valor no puede ser negativo.');
      if (isNum(d.weight) && d.weight < 0) push('weight', 'general', 'El peso no puede ser negativo.');
      if (!isNum(d.data.slots) || d.data.slots < 0) push('data.slots', 'properties', 'Los espacios no pueden ser negativos.');
      if (d.data.charges !== null && (!isNum(d.data.charges) || d.data.charges < 0)) push('data.charges', 'properties', 'Las cargas no pueden ser negativas.');
      if (d.data.armorClass !== null && (!isNum(d.data.armorClass) || d.data.armorClass < 0)) push('data.armorClass', 'properties', 'La clase de armadura no puede ser negativa.');
      break;
    }
    case 'spell': {
      if (!isNum(d.level) || d.level < 0 || d.level > 9) push('level', 'general', 'El nivel del hechizo va de 0 (truco) a 9.');
      if (!isNum(d.data.manaCost) || d.data.manaCost < 0) push('data.manaCost', 'casting', 'El coste no puede ser negativo.');
      if (!isNum(d.data.slotLevel) || d.data.slotLevel < 0 || d.data.slotLevel > 9) push('data.slotLevel', 'casting', 'El nivel de espacio va de 0 a 9.');
      break;
    }
    case 'sound': {
      if (!d.data.url) push('data.url', 'audio', 'Sube un archivo de audio.');
      if (!isNum(d.data.volume) || d.data.volume < 0 || d.data.volume > 1) push('data.volume', 'audio', 'El volumen debe estar entre 0 y 100 %.');
      break;
    }
    case 'zone': {
      if (!d.data.content || !Array.isArray(d.data.content.levels) || d.data.content.levels.length === 0)
        push('content', 'content', 'La plantilla no tiene niveles. Créala desde el editor de campañas.');
      break;
    }
    case 'hero': {
      if (!d.ownerId) push('ownerId', 'general', 'Elige el jugador dueño del héroe.');
      if (!isNum(d.level) || d.level < 1 || d.level > 20) push('level', 'general', 'El nivel debe estar entre 1 y 20.');
      const hp = d.data.hp;
      if (!isNum(hp.max) || hp.max < 1) push('data.hp.max', 'hero-stats', 'Los PV máximos deben ser al menos 1.');
      else if (!isNum(hp.current) || hp.current < 0 || hp.current > hp.max) push('data.hp.current', 'hero-stats', 'Los PV actuales deben estar entre 0 y el máximo.');
      if (!isNum(hp.temp) || hp.temp < 0) push('data.hp.temp', 'hero-stats', 'Los PV temporales no pueden ser negativos.');
      if (!isNum(d.data.ac) || d.data.ac < 0 || d.data.ac > 40) push('data.ac', 'hero-stats', 'La clase de armadura debe estar entre 0 y 40.');
      if (!isNum(d.data.gold) || d.data.gold < 0) push('data.gold', 'hero-stats', 'El oro no puede ser negativo.');
      if (!isNum(d.data.xp) || d.data.xp < 0) push('data.xp', 'hero-stats', 'La experiencia no puede ser negativa.');
      const moveCells = d.data.moveCells;
      if (moveCells !== null && moveCells !== undefined && (!isNum(moveCells) || moveCells < 0 || moveCells > 100))
        push('data.moveCells', 'hero-stats', 'El movimiento por turno va de 0 a 100 casillas (vacío = según la velocidad).');
      const actionsPerTurn = d.data.actionsPerTurn;
      if (actionsPerTurn !== undefined && (!isNum(actionsPerTurn) || actionsPerTurn < 0 || actionsPerTurn > 10))
        push('data.actionsPerTurn', 'hero-stats', 'Las acciones de combate por turno van de 0 a 10.');
      for (const [k, v] of Object.entries(d.data.abilities ?? {})) {
        if (!isNum(v) || v < 1 || v > 30) push(`ability.${k}`, 'hero-stats', 'Las puntuaciones de característica van de 1 a 30.');
      }
      const mana = d.data.resources.mana;
      if (mana.max < 0 || mana.current < 0 || mana.current > mana.max) push('mana', 'resources', 'El recurso actual debe estar entre 0 y el máximo.');
      for (const s of d.data.resources.slots) {
        if (s.used < 0 || s.max < 0 || s.used > s.max) push(`slot.${s.level}`, 'resources', `Espacios de nivel ${s.level}: los usados no pueden superar el máximo.`);
      }
      for (const u of d.data.resources.uses) {
        if (!u.name.trim()) push(`use.${u.id}`, 'resources', 'Cada uso limitado necesita un nombre.');
        else if (u.max < 1 || u.used < 0 || u.used > u.max) push(`use.${u.id}`, 'resources', 'Los usos gastados deben estar entre 0 y el máximo.');
      }
      for (const it of d.data.inventory) {
        if (!it.name.trim()) push(`inv.${it.id}`, 'inventory', 'Cada objeto necesita un nombre.');
        else if (!isNum(it.quantity) || it.quantity < 1) push(`inv.${it.id}`, 'inventory', 'La cantidad debe ser al menos 1.');
      }
      for (const s of d.data.spells) if (!s.name.trim()) push(`spell.${s.id}`, 'spells', 'Cada hechizo necesita un nombre.');
      break;
    }
  }
  return out;
}

/**
 * Final payload: trimmed text, normalized tags, derived and irrelevant facet columns cleaned.
 * A null owner is omitted for non-hero kinds so the server keeps the stored author (or uses the requester on create).
 */
export function toPayload(d: AnyDraft): LibraryEntryInput {
  const owner = d.ownerId ? { ownerId: d.ownerId } : {};
  const base = {
    name: d.name.trim(),
    description: (d.description ?? '').trim(),
    imageUrl: d.imageUrl ?? null,
    tags: normalizeTags(d.tags ?? []),
    categoryIds: [...new Set(d.categoryIds ?? [])],
    originCampaignId: d.originCampaignId ?? null,
    level: null as number | null,
    cr: null as number | null,
    hp: null as number | null,
    value: null as number | null,
    weight: null as number | null,
    rarity: null as LibraryEntryInput['rarity'],
    size: null as LibraryEntryInput['size'],
  };
  switch (d.kind) {
    case 'creature':
      return { ...base, ...owner, kind: 'creature', cr: d.cr ?? null, hp: d.hp ?? null, size: d.size ?? null, data: d.data };
    case 'item':
      return { ...base, ...owner, kind: 'item', rarity: d.rarity ?? null, value: d.value ?? null, weight: d.weight ?? null, data: d.data };
    case 'spell':
      return { ...base, ...owner, kind: 'spell', level: d.level ?? 0, data: d.data };
    case 'zone':
      return { ...base, ...owner, kind: 'zone', level: d.data.content?.levels?.length ?? d.level ?? 1, data: d.data };
    case 'sound':
      return { ...base, ...owner, kind: 'sound', data: d.data };
    case 'hero':
      return { ...base, ...owner, kind: 'hero', level: d.level ?? 1, hp: d.data.hp.max, data: d.data };
  }
}
