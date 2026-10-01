import {
  SPELL_ANIMATIONS,
  customInventoryItem,
  inventoryItemFromEntry,
  newId,
  type HeroAdjustField,
  type HeroData,
  type HeroSheet,
  type HeroSpell,
  type InventoryItem,
  type LimitedUse,
  type LiveState,
  type SpellSlotState,
  type Token,
} from '@wailers/shared';
import {
  addItemTo,
  clamp,
  heroPlayerId,
  idList,
  isHeroOwner,
  itemLabel,
  joinNames,
  loadEntry,
  longText,
  markEntryUsed,
  oneOf,
  plainObject,
  quantityValue,
  reqBool,
  reqId,
  reqInt,
  reqNum,
  reqText,
  requireHero,
  requireToken,
  round2,
  sanitizeInventoryItem,
  sanitizeItemPatch,
  statusLabel,
  statusValue,
  syncHeroTokens,
  takeItem,
  urlOrNull,
} from '../helpers';
import { HandlerError, type HandlerCtx, type HandlerModule, type LogInput, type SessionManagerApi } from '../types';

/*
 * Hero sheet, resources and inventory handlers. Every change is an explicit action
 * (DM, or the owner for their own resources when the campaign allows it).
 */

const ADJUST_FIELDS: readonly HeroAdjustField[] = ['hp', 'tempHp', 'maxHp', 'mana', 'maxMana', 'gold', 'xp', 'level', 'ac'];
const MAX_VALUE = 1_000_000_000;

function heroNames(state: LiveState, ids: string[]): string[] {
  return ids.map((id) => state.heroes[id]?.name ?? id);
}

/** Inventory/gold news are private unless players may see other inventories. */
function privateVisibility(state: LiveState, hero: HeroSheet): Pick<LogInput, 'visibility' | 'targetUserId'> {
  if (state.visibility.global.canSeeOthersInventory) return { visibility: 'all' };
  const playerId = heroPlayerId(state, hero);
  return playerId ? { visibility: 'user', targetUserId: playerId } : { visibility: 'dm' };
}

function requireResourceRights(ctx: HandlerCtx, hero: HeroSheet): void {
  if (ctx.isDm) return;
  const state = ctx.session.state;
  if (!isHeroOwner(state, hero, ctx.userId)) throw new HandlerError('Ese héroe no es tuyo');
  if (!ctx.session.campaign.rules.playersCanEditOwnResources) {
    throw new HandlerError('En esta campaña solo el DM puede modificar los recursos');
  }
}

function currencyShort(ctx: HandlerCtx): string {
  const currency = ctx.session.campaign.rules.currency;
  return currency.short || currency.name || 'po';
}

function manaName(ctx: HandlerCtx): string {
  return ctx.session.campaign.rules.magic.manaName || 'recurso';
}

// ---------------------------------------------------------------------------
// Sanitizers for hero:update
// ---------------------------------------------------------------------------

function sanitizeSpell(raw: unknown): HeroSpell {
  const obj = plainObject(raw, 'hechizo');
  return {
    id: typeof obj.id === 'string' && obj.id.trim() !== '' && obj.id.length <= 100 ? obj.id : newId('hsp'),
    entryId: typeof obj.entryId === 'string' && obj.entryId !== '' ? obj.entryId.slice(0, 100) : null,
    name: reqText(obj.name, 'nombre del hechizo', 120, 1),
    level: obj.level === undefined ? 0 : reqInt(obj.level, 'nivel del hechizo', 0, 9),
    manaCost: obj.manaCost === undefined ? 0 : reqInt(obj.manaCost, 'coste', 0, 100000),
    slotLevel: obj.slotLevel === undefined ? 0 : reqInt(obj.slotLevel, 'nivel de espacio', 0, 9),
    animation: obj.animation === undefined ? 'arcane' : oneOf(SPELL_ANIMATIONS, obj.animation, 'animación'),
    description: obj.description === undefined ? '' : longText(obj.description, 'descripción', 8000),
    prepared: obj.prepared === undefined ? true : reqBool(obj.prepared, 'preparado'),
  };
}

function sanitizeSlots(raw: unknown): SpellSlotState[] {
  if (!Array.isArray(raw)) throw new HandlerError('Valor no válido para «espacios de conjuro»');
  const byLevel = new Map<number, SpellSlotState>();
  for (const item of raw) {
    const obj = plainObject(item, 'espacio de conjuro');
    const level = reqInt(obj.level, 'nivel de espacio', 1, 9);
    const max = reqInt(obj.max, 'máximo de espacios', 0, 99);
    const used = obj.used === undefined ? 0 : reqInt(obj.used, 'espacios gastados', 0, max);
    byLevel.set(level, { level, max, used: clamp(used, 0, max) });
  }
  return [...byLevel.values()].sort((a, b) => a.level - b.level);
}

function sanitizeUses(raw: unknown): LimitedUse[] {
  if (!Array.isArray(raw)) throw new HandlerError('Valor no válido para «usos limitados»');
  return raw.slice(0, 100).map((item) => {
    const obj = plainObject(item, 'uso limitado');
    const max = reqInt(obj.max, 'máximo de usos', 0, 999);
    return {
      id: typeof obj.id === 'string' && obj.id.trim() !== '' && obj.id.length <= 100 ? obj.id : newId('use'),
      name: reqText(obj.name, 'nombre del uso', 120, 1),
      max,
      used: obj.used === undefined ? 0 : clamp(reqInt(obj.used, 'usos gastados', 0, 999), 0, max),
      resetOn: obj.resetOn === undefined ? 'long' : oneOf(['short', 'long'] as const, obj.resetOn, 'recuperación'),
    };
  });
}

interface HeroPatch {
  name?: string;
  imageUrl?: string | null;
  level?: number;
  data: Partial<Omit<HeroData, 'hp' | 'resources'>> & {
    hp?: Partial<HeroData['hp']>;
    resources?: { mana?: Partial<HeroData['resources']['mana']>; slots?: SpellSlotState[]; uses?: LimitedUse[] };
  };
}

function sanitizeHeroPatch(raw: Record<string, unknown>, maxLevel: number): HeroPatch {
  const out: HeroPatch = { data: {} };
  const d = out.data;
  if (raw.name !== undefined) out.name = reqText(raw.name, 'nombre', 80, 1);
  if (raw.imageUrl !== undefined) out.imageUrl = urlOrNull(raw.imageUrl, 'imagen');
  if (raw.level !== undefined) out.level = reqInt(raw.level, 'nivel', 1, maxLevel);
  if (raw.abilities !== undefined) {
    const abilities = plainObject(raw.abilities, 'características');
    d.abilities = {};
    for (const [key, value] of Object.entries(abilities).slice(0, 30)) {
      d.abilities[key.slice(0, 30)] = reqInt(value, 'característica', 0, 99);
    }
  }
  if (raw.hp !== undefined) {
    const hp = plainObject(raw.hp, 'PV');
    d.hp = {};
    if (hp.current !== undefined) d.hp.current = reqInt(hp.current, 'PV', 0, 1000000);
    if (hp.max !== undefined) d.hp.max = reqInt(hp.max, 'PV máximos', 0, 1000000);
    if (hp.temp !== undefined) d.hp.temp = reqInt(hp.temp, 'PV temporales', 0, 100000);
  }
  if (raw.ac !== undefined) d.ac = reqInt(raw.ac, 'CA', 0, 99);
  if (raw.speed !== undefined) d.speed = reqText(raw.speed, 'velocidad', 80);
  if (raw.initiativeBonus !== undefined) d.initiativeBonus = reqInt(raw.initiativeBonus, 'iniciativa', -50, 50);
  if (raw.xp !== undefined) d.xp = reqInt(raw.xp, 'XP', 0, MAX_VALUE);
  if (raw.gold !== undefined) d.gold = round2(clamp(reqNum(raw.gold, 'oro'), 0, MAX_VALUE));
  if (raw.inventory !== undefined) {
    if (!Array.isArray(raw.inventory)) throw new HandlerError('Valor no válido para «inventario»');
    const items = raw.inventory.slice(0, 500).map(sanitizeInventoryItem);
    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.id)) it.id = newId('inv');
      seen.add(it.id);
    }
    d.inventory = items;
  }
  if (raw.spells !== undefined) {
    if (!Array.isArray(raw.spells)) throw new HandlerError('Valor no válido para «hechizos»');
    d.spells = raw.spells.slice(0, 300).map(sanitizeSpell);
  }
  if (raw.resources !== undefined) {
    const res = plainObject(raw.resources, 'recursos');
    d.resources = {};
    if (res.mana !== undefined) {
      const mana = plainObject(res.mana, 'recurso mágico');
      d.resources.mana = {};
      if (mana.current !== undefined) d.resources.mana.current = reqInt(mana.current, 'recurso actual', 0, 1000000);
      if (mana.max !== undefined) d.resources.mana.max = reqInt(mana.max, 'recurso máximo', 0, 1000000);
    }
    if (res.slots !== undefined) d.resources.slots = sanitizeSlots(res.slots);
    if (res.uses !== undefined) d.resources.uses = sanitizeUses(res.uses);
  }
  if (raw.statuses !== undefined) {
    if (!Array.isArray(raw.statuses)) throw new HandlerError('Valor no válido para «estados»');
    const statuses: string[] = [];
    for (const s of raw.statuses) {
      const v = statusValue(s);
      if (!statuses.includes(v)) statuses.push(v);
    }
    d.statuses = statuses.slice(0, 40);
  }
  if (raw.visionCells !== undefined) d.visionCells = raw.visionCells === null ? null : clamp(reqNum(raw.visionCells, 'visión'), 0, 200);
  if (raw.notes !== undefined) d.notes = longText(raw.notes, 'notas', 20000);
  return out;
}

function applyHeroPatch(hero: HeroSheet, patch: HeroPatch): void {
  if (patch.name !== undefined) hero.name = patch.name;
  if (patch.imageUrl !== undefined) hero.imageUrl = patch.imageUrl;
  if (patch.level !== undefined) hero.level = patch.level;
  const d = patch.data;
  const data = hero.data;
  if (d.abilities !== undefined) data.abilities = { ...data.abilities, ...d.abilities };
  if (d.hp !== undefined) {
    if (d.hp.max !== undefined) data.hp.max = d.hp.max;
    if (d.hp.current !== undefined) data.hp.current = d.hp.current;
    if (d.hp.temp !== undefined) data.hp.temp = d.hp.temp;
  }
  data.hp.current = clamp(data.hp.current, 0, Math.max(0, data.hp.max));
  if (d.ac !== undefined) data.ac = d.ac;
  if (d.speed !== undefined) data.speed = d.speed;
  if (d.initiativeBonus !== undefined) data.initiativeBonus = d.initiativeBonus;
  if (d.xp !== undefined) data.xp = d.xp;
  if (d.gold !== undefined) data.gold = d.gold;
  if (d.inventory !== undefined) data.inventory = d.inventory;
  if (d.spells !== undefined) data.spells = d.spells;
  if (d.resources !== undefined) {
    if (d.resources.mana) {
      if (d.resources.mana.max !== undefined) data.resources.mana.max = d.resources.mana.max;
      if (d.resources.mana.current !== undefined) data.resources.mana.current = d.resources.mana.current;
    }
    if (d.resources.slots !== undefined) data.resources.slots = d.resources.slots;
    if (d.resources.uses !== undefined) data.resources.uses = d.resources.uses;
  }
  data.resources.mana.current = clamp(data.resources.mana.current, 0, Math.max(0, data.resources.mana.max));
  if (d.statuses !== undefined) data.statuses = d.statuses;
  if (d.visionCells !== undefined) data.visionCells = d.visionCells;
  if (d.notes !== undefined) data.notes = d.notes;
}

function maxLevelOf(ctx: HandlerCtx): number {
  const max = ctx.session.campaign.rules.heroCreation.maxLevel;
  return Number.isFinite(max) && max >= 1 ? Math.max(20, Math.min(Math.round(max), 100)) : 20;
}

function heroUpdate(
  manager: SessionManagerApi,
  ctx: HandlerCtx,
  payload: { heroId: unknown; patch: unknown },
): null {
  const state = ctx.session.state;
  const hero = requireHero(state, payload.heroId);
  const raw = plainObject(payload.patch, 'cambios');
  if (!ctx.isDm) {
    if (!isHeroOwner(state, hero, ctx.userId)) throw new HandlerError('Ese héroe no es tuyo');
    const keys = Object.keys(raw).filter((k) => raw[k] !== undefined);
    if (keys.some((k) => k !== 'notes')) throw new HandlerError('Solo puedes editar las notas de tu héroe');
  }
  const patch = sanitizeHeroPatch(raw, maxLevelOf(ctx));
  const logs: LogInput[] = [];
  if (patch.level !== undefined && patch.level !== hero.level) {
    logs.push({
      type: 'system',
      text: `${patch.name ?? hero.name} ${patch.level > hero.level ? 'sube' : 'baja'} a nivel ${patch.level}`,
      actorUserId: ctx.userId,
      visibility: 'all',
    });
  }
  manager.mutate(
    ctx.session,
    (s) => {
      const h = s.heroes[hero.id];
      if (!h) return;
      applyHeroPatch(h, patch);
      syncHeroTokens(s, h.id);
    },
    { heroes: [hero.id], log: logs.length > 0 ? logs : undefined },
  );
  return null;
}

// ---------------------------------------------------------------------------
// hero:adjust / hero:status
// ---------------------------------------------------------------------------

function heroAdjust(manager: SessionManagerApi, ctx: HandlerCtx, payload: { heroId: string; field: HeroAdjustField; delta: number }): null {
  const state = ctx.session.state;
  const hero = requireHero(state, payload.heroId);
  const field = oneOf(ADJUST_FIELDS, payload.field, 'campo');
  const rawDelta = reqNum(payload.delta, 'cambio');
  const delta = field === 'gold' ? round2(rawDelta) : Math.round(rawDelta);
  if (delta === 0) return null;

  const next = structuredClone(hero);
  const d = next.data;
  const name = hero.name;
  let log: LogInput | null = null;
  const base = { actorUserId: ctx.userId } as const;

  switch (field) {
    case 'hp': {
      const before = d.hp.current;
      d.hp.current = clamp(before + delta, 0, Math.max(0, d.hp.max));
      if (d.hp.current !== before) {
        const text =
          delta < 0
            ? `${name} recibe ${-delta} de daño (PV ${d.hp.current}/${d.hp.max})`
            : `${name} recupera ${delta} PV (PV ${d.hp.current}/${d.hp.max})`;
        log = { ...base, type: 'hp', text, visibility: 'all' };
      }
      break;
    }
    case 'tempHp': {
      const before = d.hp.temp || 0;
      d.hp.temp = clamp(before + delta, 0, 100000);
      if (d.hp.temp !== before) {
        log = {
          ...base,
          type: 'hp',
          text: `${name} ${delta > 0 ? 'gana' : 'pierde'} ${Math.abs(d.hp.temp - before)} PV temporales (${d.hp.temp})`,
          visibility: 'all',
        };
      }
      break;
    }
    case 'maxHp': {
      const before = d.hp.max;
      d.hp.max = clamp(before + delta, 0, 1000000);
      d.hp.current = Math.min(d.hp.current, d.hp.max);
      if (d.hp.max !== before) log = { ...base, type: 'hp', text: `PV máximos de ${name}: ${d.hp.max}`, visibility: 'all' };
      break;
    }
    case 'mana': {
      const mana = d.resources.mana;
      const before = mana.current;
      mana.current = clamp(before + delta, 0, Math.max(0, mana.max));
      if (mana.current !== before) {
        const text =
          delta < 0
            ? `${name} gasta ${before - mana.current} de ${manaName(ctx)} (${mana.current}/${mana.max})`
            : `${name} recupera ${mana.current - before} de ${manaName(ctx)} (${mana.current}/${mana.max})`;
        log = { ...base, type: 'system', text, visibility: 'all' };
      }
      break;
    }
    case 'maxMana': {
      const mana = d.resources.mana;
      const before = mana.max;
      mana.max = clamp(before + delta, 0, 1000000);
      mana.current = Math.min(mana.current, mana.max);
      if (mana.max !== before) log = { ...base, type: 'system', text: `${manaName(ctx)} máximo de ${name}: ${mana.max}`, visibility: 'all' };
      break;
    }
    case 'gold': {
      const before = d.gold;
      d.gold = round2(clamp(before + delta, 0, MAX_VALUE));
      const diff = round2(d.gold - before);
      if (diff !== 0) {
        log = {
          ...base,
          type: 'loot',
          text: `${name} ${diff > 0 ? 'recibe' : 'pierde'} ${Math.abs(diff)} ${currencyShort(ctx)}`,
          ...privateVisibility(state, hero),
        };
      }
      break;
    }
    case 'xp': {
      const before = d.xp;
      d.xp = clamp(before + delta, 0, MAX_VALUE);
      if (d.xp !== before) {
        log = { ...base, type: 'system', text: `${name} ${delta > 0 ? 'gana' : 'pierde'} ${Math.abs(d.xp - before)} XP`, visibility: 'all' };
      }
      break;
    }
    case 'level': {
      const before = next.level;
      next.level = clamp(before + delta, 1, maxLevelOf(ctx));
      if (next.level !== before) {
        log = { ...base, type: 'system', text: `${name} ${delta > 0 ? 'sube' : 'baja'} a nivel ${next.level}`, visibility: 'all' };
      }
      break;
    }
    case 'ac': {
      const before = d.ac;
      d.ac = clamp(before + delta, 0, 99);
      if (d.ac !== before) log = { ...base, type: 'system', text: `CA de ${name}: ${d.ac}`, visibility: 'all' };
      break;
    }
  }

  manager.mutate(
    ctx.session,
    (s) => {
      const h = s.heroes[hero.id];
      if (!h) return;
      h.level = next.level;
      h.data.hp = next.data.hp;
      h.data.resources.mana = next.data.resources.mana;
      h.data.gold = next.data.gold;
      h.data.xp = next.data.xp;
      h.data.ac = next.data.ac;
      syncHeroTokens(s, h.id);
    },
    { heroes: [hero.id], log: log ?? undefined },
  );
  return null;
}

function heroStatus(manager: SessionManagerApi, ctx: HandlerCtx, payload: { heroId: string; status: string; on: boolean }): null {
  const hero = requireHero(ctx.session.state, payload.heroId);
  const status = statusValue(payload.status);
  const on = reqBool(payload.on, 'activar');
  if (hero.data.statuses.includes(status) === on) return null;
  manager.mutate(
    ctx.session,
    (s) => {
      const h = s.heroes[hero.id];
      if (!h) return;
      h.data.statuses = on ? [...h.data.statuses, status] : h.data.statuses.filter((x) => x !== status);
      syncHeroTokens(s, h.id);
    },
    {
      heroes: [hero.id],
      log: { type: 'system', text: `${hero.name}: ${on ? '+' : '−'} ${statusLabel(status)}`, actorUserId: ctx.userId, visibility: 'all' },
    },
  );
  return null;
}

// ---------------------------------------------------------------------------
// Resources: slots, limited uses, mana
// ---------------------------------------------------------------------------

function heroSlot(manager: SessionManagerApi, ctx: HandlerCtx, payload: { heroId: string; level: number; delta: number }): null {
  const hero = requireHero(ctx.session.state, payload.heroId);
  requireResourceRights(ctx, hero);
  const level = reqInt(payload.level, 'nivel de espacio', 1, 9);
  const delta = reqInt(payload.delta, 'cambio', -99, 99);
  if (delta === 0) return null;
  const slot = hero.data.resources.slots.find((s) => s.level === level);
  if (!slot || slot.max <= 0) throw new HandlerError(`${hero.name} no tiene espacios de conjuro de nivel ${level}`);
  if (delta > 0 && slot.used >= slot.max) throw new HandlerError(`No quedan espacios de nivel ${level}`);
  if (delta < 0 && slot.used <= 0) throw new HandlerError(`Los espacios de nivel ${level} ya están completos`);
  const used = clamp(slot.used + delta, 0, slot.max);
  const changed = Math.abs(used - slot.used);
  const left = slot.max - used;
  const text =
    delta > 0
      ? `${hero.name} gasta ${changed === 1 ? 'un espacio' : `${changed} espacios`} de nivel ${level} (quedan ${left}/${slot.max})`
      : `${hero.name} recupera ${changed === 1 ? 'un espacio' : `${changed} espacios`} de nivel ${level} (${left}/${slot.max})`;
  manager.mutate(
    ctx.session,
    (s) => {
      const target = s.heroes[hero.id]?.data.resources.slots.find((x) => x.level === level);
      if (target) target.used = used;
    },
    { heroes: [hero.id], log: { type: 'system', text, actorUserId: ctx.userId, visibility: 'all' } },
  );
  return null;
}

function heroUse(manager: SessionManagerApi, ctx: HandlerCtx, payload: { heroId: string; useId: string; delta: number }): null {
  const hero = requireHero(ctx.session.state, payload.heroId);
  requireResourceRights(ctx, hero);
  const useId = reqId(payload.useId, 'uso');
  const delta = reqInt(payload.delta, 'cambio', -999, 999);
  if (delta === 0) return null;
  const use = hero.data.resources.uses.find((u) => u.id === useId);
  if (!use) throw new HandlerError('Ese uso limitado no existe');
  if (delta > 0 && use.used >= use.max) throw new HandlerError(`No quedan usos de ${use.name}`);
  if (delta < 0 && use.used <= 0) throw new HandlerError(`${use.name} ya tiene todos sus usos`);
  const used = clamp(use.used + delta, 0, use.max);
  const left = use.max - used;
  const text = delta > 0 ? `${hero.name} usa ${use.name} (quedan ${left}/${use.max})` : `${hero.name} recupera usos de ${use.name} (${left}/${use.max})`;
  manager.mutate(
    ctx.session,
    (s) => {
      const target = s.heroes[hero.id]?.data.resources.uses.find((u) => u.id === useId);
      if (target) target.used = used;
    },
    { heroes: [hero.id], log: { type: 'system', text, actorUserId: ctx.userId, visibility: 'all' } },
  );
  return null;
}

function heroMana(manager: SessionManagerApi, ctx: HandlerCtx, payload: { heroId: string; delta: number }): null {
  const hero = requireHero(ctx.session.state, payload.heroId);
  requireResourceRights(ctx, hero);
  const delta = reqInt(payload.delta, 'cambio', -1000000, 1000000);
  if (delta === 0) return null;
  const mana = hero.data.resources.mana;
  const resource = manaName(ctx);
  if (delta < 0 && mana.current + delta < 0) throw new HandlerError(`${hero.name} no tiene suficiente ${resource} (${mana.current}/${mana.max})`);
  if (delta > 0 && mana.current >= mana.max) throw new HandlerError(`${hero.name} ya tiene todo su ${resource}`);
  const current = clamp(mana.current + delta, 0, Math.max(0, mana.max));
  const changed = Math.abs(current - mana.current);
  const text =
    delta < 0
      ? `${hero.name} gasta ${changed} de ${resource} (${current}/${mana.max})`
      : `${hero.name} recupera ${changed} de ${resource} (${current}/${mana.max})`;
  manager.mutate(
    ctx.session,
    (s) => {
      const h = s.heroes[hero.id];
      if (h) h.data.resources.mana.current = current;
    },
    { heroes: [hero.id], log: { type: 'system', text, actorUserId: ctx.userId, visibility: 'all' } },
  );
  return null;
}

// ---------------------------------------------------------------------------
// hero:rest / hero:regenMana (manual DM actions)
// ---------------------------------------------------------------------------

function heroRest(manager: SessionManagerApi, ctx: HandlerCtx, payload: { heroIds: string[]; type: 'short' | 'long' }): null {
  const state = ctx.session.state;
  const type = oneOf(['short', 'long'] as const, payload.type, 'tipo de descanso');
  const heroIds = idList(payload.heroIds, 'héroes', 1, 50);
  for (const id of heroIds) requireHero(state, id);
  const rule = ctx.session.campaign.rules.rest[type];
  if (!rule.enabled) throw new HandlerError(`El ${rule.label.toLowerCase() || 'descanso'} está desactivado en esta campaña`);
  const pct = clamp(Number.isFinite(rule.restoreHpPct) ? rule.restoreHpPct : 0, 0, 100);
  const icon = type === 'long' ? '🌙' : '☕';
  manager.mutate(
    ctx.session,
    (s) => {
      for (const id of heroIds) {
        const h = s.heroes[id];
        if (!h) continue;
        const hp = h.data.hp;
        hp.current = clamp(hp.current + Math.round((hp.max * pct) / 100), 0, Math.max(0, hp.max));
        const mana = h.data.resources.mana;
        if (rule.restoreMana === 'full') mana.current = mana.max;
        else if (rule.restoreMana === 'half') mana.current = Math.min(mana.max, mana.current + Math.ceil(mana.max / 2));
        if (rule.restoreSlots) for (const slot of h.data.resources.slots) slot.used = 0;
        if (rule.resetUses) {
          for (const use of h.data.resources.uses) {
            if (use.resetOn === 'short' || type === 'long') use.used = 0;
          }
        }
        syncHeroTokens(s, id);
      }
    },
    {
      heroes: heroIds,
      log: { type: 'system', text: `${icon} ${rule.label || (type === 'long' ? 'Descanso largo' : 'Descanso corto')}: ${joinNames(heroNames(state, heroIds))}`, actorUserId: ctx.userId, visibility: 'all' },
    },
  );
  return null;
}

function heroRegenMana(manager: SessionManagerApi, ctx: HandlerCtx, payload: { heroIds: string[] }): null {
  const state = ctx.session.state;
  const magic = ctx.session.campaign.rules.magic;
  const heroIds = idList(payload.heroIds, 'héroes', 1, 50);
  for (const id of heroIds) requireHero(state, id);
  if (magic.mode !== 'mana') throw new HandlerError(`Esta campaña no usa ${manaName(ctx)}`);
  const amount = Math.max(0, Math.round(magic.manaRegenPerTurn));
  if (amount <= 0) throw new HandlerError(`La regeneración de ${manaName(ctx)} está configurada a 0`);
  manager.mutate(
    ctx.session,
    (s) => {
      for (const id of heroIds) {
        const mana = s.heroes[id]?.data.resources.mana;
        if (mana) mana.current = clamp(mana.current + amount, 0, Math.max(0, mana.max));
      }
    },
    {
      heroes: heroIds,
      log: { type: 'system', text: `${manaName(ctx)} +${amount}: ${joinNames(heroNames(state, heroIds))}`, actorUserId: ctx.userId, visibility: 'all' },
    },
  );
  return null;
}

// ---------------------------------------------------------------------------
// Inventory & loot
// ---------------------------------------------------------------------------

/** Build the item to add (library entry or custom). Library loads happen before any mutation. */
async function buildNewItem(
  payload: { entryId?: string; item?: Partial<InventoryItem>; quantity?: number },
): Promise<{ item: InventoryItem; stackable: boolean; entryId: string | null }> {
  const quantity = quantityValue(payload.quantity);
  if (payload.entryId !== undefined && payload.entryId !== null && payload.entryId !== '') {
    const entry = await loadEntry(payload.entryId, ['item'] as const, 'Solo se pueden entregar objetos de la biblioteca');
    const item = inventoryItemFromEntry(entry, quantity);
    const extra = sanitizeItemPatch(payload.item);
    if (extra.notes !== undefined) item.notes = extra.notes;
    if (extra.equipped !== undefined) item.equipped = extra.equipped;
    return { item, stackable: entry.data.stackable, entryId: entry.id };
  }
  if (payload.item === undefined || payload.item === null) throw new HandlerError('Indica qué objeto quieres añadir');
  const patch = sanitizeItemPatch(payload.item);
  if (!patch.name) throw new HandlerError('El objeto necesita un nombre');
  return { item: customInventoryItem({ ...patch, quantity }), stackable: true, entryId: null };
}

/** Add to a list: library stackables merge with the same entry, custom items with identical stacks. */
function addNewItem(list: InventoryItem[], built: { item: InventoryItem; stackable: boolean; entryId: string | null }): void {
  if (built.entryId !== null) {
    if (built.stackable) {
      const existing = list.find((it) => it.entryId === built.entryId && !it.equipped);
      if (existing) {
        existing.quantity = Math.min(existing.quantity + built.item.quantity, 999999);
        return;
      }
    }
    list.push(built.item);
    return;
  }
  addItemTo(list, built.item);
}

async function inventoryAdd(
  manager: SessionManagerApi,
  ctx: HandlerCtx,
  payload: { heroId: string; entryId?: string; item?: Partial<InventoryItem>; quantity?: number },
): Promise<null> {
  requireHero(ctx.session.state, payload.heroId);
  const built = await buildNewItem(payload);
  const hero = requireHero(ctx.session.state, payload.heroId);
  manager.mutate(
    ctx.session,
    (s) => {
      const h = s.heroes[hero.id];
      if (h) addNewItem(h.data.inventory, built);
    },
    {
      heroes: [hero.id],
      log: {
        type: 'item',
        text: `El DM entrega ${itemLabel(built.item.name, built.item.quantity)} a ${hero.name}`,
        actorUserId: ctx.userId,
        ...privateVisibility(ctx.session.state, hero),
      },
    },
  );
  if (built.entryId) void markEntryUsed(built.entryId, ctx.session.state.campaignId, ctx.userId);
  return null;
}

function inventoryRemove(manager: SessionManagerApi, ctx: HandlerCtx, payload: { heroId: string; itemId: string; quantity?: number }): null {
  const hero = requireHero(ctx.session.state, payload.heroId);
  const itemId = reqId(payload.itemId, 'objeto');
  const item = hero.data.inventory.find((it) => it.id === itemId);
  if (!item) throw new HandlerError('Ese objeto ya no está en el inventario');
  const quantity = payload.quantity === undefined || payload.quantity === null ? item.quantity : Math.min(quantityValue(payload.quantity), item.quantity);
  manager.mutate(
    ctx.session,
    (s) => {
      const h = s.heroes[hero.id];
      if (h) takeItem(h.data.inventory, itemId, quantity);
    },
    {
      heroes: [hero.id],
      log: {
        type: 'item',
        text: `Se retira ${itemLabel(item.name, quantity)} del inventario de ${hero.name}`,
        actorUserId: ctx.userId,
        ...privateVisibility(ctx.session.state, hero),
      },
    },
  );
  return null;
}

function inventoryUpdate(
  manager: SessionManagerApi,
  ctx: HandlerCtx,
  payload: { heroId: string; itemId: string; patch: Partial<InventoryItem> },
): null {
  const hero = requireHero(ctx.session.state, payload.heroId);
  const itemId = reqId(payload.itemId, 'objeto');
  if (!hero.data.inventory.some((it) => it.id === itemId)) throw new HandlerError('Ese objeto ya no está en el inventario');
  const patch = sanitizeItemPatch(payload.patch);
  if (Object.keys(patch).length === 0) return null;
  manager.mutate(
    ctx.session,
    (s) => {
      const item = s.heroes[hero.id]?.data.inventory.find((it) => it.id === itemId);
      if (item) Object.assign(item, patch);
    },
    { heroes: [hero.id] },
  );
  return null;
}

type Container = { kind: 'hero'; hero: HeroSheet } | { kind: 'token'; token: Token };

function resolveContainer(state: LiveState, raw: unknown, label: string): Container {
  const obj = plainObject(raw, label);
  const hasHero = obj.heroId !== undefined && obj.heroId !== null && obj.heroId !== '';
  const hasToken = obj.tokenId !== undefined && obj.tokenId !== null && obj.tokenId !== '';
  if (hasHero === hasToken) throw new HandlerError(`Indica un héroe o una ficha como ${label}`);
  if (hasHero) return { kind: 'hero', hero: requireHero(state, obj.heroId) };
  return { kind: 'token', token: requireToken(state, obj.tokenId) };
}

function containerList(state: LiveState, c: Container): InventoryItem[] | null {
  if (c.kind === 'hero') return state.heroes[c.hero.id]?.data.inventory ?? null;
  return state.tokens[c.token.id]?.loot ?? null;
}

function containerName(c: Container): string {
  return c.kind === 'hero' ? c.hero.name : c.token.name;
}

function inventoryTransfer(
  manager: SessionManagerApi,
  ctx: HandlerCtx,
  payload: { from: { heroId?: string; tokenId?: string }; to: { heroId?: string; tokenId?: string }; itemId: string; quantity?: number },
): null {
  const state = ctx.session.state;
  const from = resolveContainer(state, payload.from, 'origen');
  const to = resolveContainer(state, payload.to, 'destino');
  const sameContainer =
    (from.kind === 'hero' && to.kind === 'hero' && from.hero.id === to.hero.id) ||
    (from.kind === 'token' && to.kind === 'token' && from.token.id === to.token.id);
  if (sameContainer) throw new HandlerError('El origen y el destino son el mismo');
  const itemId = reqId(payload.itemId, 'objeto');
  const sourceList = containerList(state, from) ?? [];
  const item = sourceList.find((it) => it.id === itemId);
  if (!item) throw new HandlerError('Ese objeto ya no está ahí');
  const quantity = payload.quantity === undefined || payload.quantity === null ? item.quantity : Math.min(quantityValue(payload.quantity), item.quantity);
  const label = itemLabel(item.name, quantity);

  let log: LogInput;
  if (from.kind === 'hero' && to.kind === 'hero') {
    log = { type: 'item', text: `${to.hero.name} recibe ${label} de ${from.hero.name}`, actorUserId: ctx.userId, visibility: 'all' };
  } else if (from.kind === 'token' && to.kind === 'hero') {
    log = {
      type: 'loot',
      text: `${to.hero.name} recoge ${label} de ${from.token.name}`,
      actorUserId: ctx.userId,
      visibility: from.token.hidden ? 'dm' : 'all',
    };
  } else if (from.kind === 'hero' && to.kind === 'token') {
    const playerId = heroPlayerId(state, from.hero);
    log = {
      type: 'item',
      text: `${from.hero.name} deja ${label} en ${to.token.name}`,
      actorUserId: ctx.userId,
      ...(playerId ? { visibility: 'user' as const, targetUserId: playerId } : { visibility: 'dm' as const }),
    };
  } else {
    log = { type: 'loot', text: `Botín movido: ${label} de ${containerName(from)} a ${containerName(to)}`, actorUserId: ctx.userId, visibility: 'dm' };
  }

  const heroes = [from, to].filter((c): c is { kind: 'hero'; hero: HeroSheet } => c.kind === 'hero').map((c) => c.hero.id);
  manager.mutate(
    ctx.session,
    (s) => {
      const src = containerList(s, from);
      const dst = containerList(s, to);
      if (!src || !dst) return;
      const piece = takeItem(src, itemId, quantity);
      if (piece) addItemTo(dst, piece);
    },
    { heroes: heroes.length > 0 ? heroes : undefined, log },
  );
  return null;
}

async function lootAdd(
  manager: SessionManagerApi,
  ctx: HandlerCtx,
  payload: { tokenId: string; entryId?: string; item?: Partial<InventoryItem>; quantity?: number },
): Promise<null> {
  requireToken(ctx.session.state, payload.tokenId);
  const built = await buildNewItem(payload);
  const token = requireToken(ctx.session.state, payload.tokenId);
  manager.mutate(
    ctx.session,
    (s) => {
      const t = s.tokens[token.id];
      if (t) addNewItem(t.loot, built);
    },
    {
      log: {
        type: 'loot',
        text: `Botín en ${token.name}: ${itemLabel(built.item.name, built.item.quantity)}`,
        actorUserId: ctx.userId,
        visibility: 'dm',
      },
    },
  );
  if (built.entryId) void markEntryUsed(built.entryId, ctx.session.state.campaignId, ctx.userId);
  return null;
}

function lootRemove(manager: SessionManagerApi, ctx: HandlerCtx, payload: { tokenId: string; itemId: string }): null {
  const token = requireToken(ctx.session.state, payload.tokenId);
  const itemId = reqId(payload.itemId, 'objeto');
  const item = token.loot.find((it) => it.id === itemId);
  if (!item) throw new HandlerError('Ese objeto ya no está en el botín');
  manager.mutate(
    ctx.session,
    (s) => {
      const t = s.tokens[token.id];
      if (t) t.loot = t.loot.filter((it) => it.id !== itemId);
    },
    { log: { type: 'loot', text: `Se quita ${itemLabel(item.name, item.quantity)} del botín de ${token.name}`, actorUserId: ctx.userId, visibility: 'dm' } },
  );
  return null;
}

// ---------------------------------------------------------------------------

export const registerHeroHandlers: HandlerModule = (socket, manager) => {
  manager.register(socket, 'hero:update', (ctx, payload) => heroUpdate(manager, ctx, payload));
  manager.register(socket, 'hero:adjust', (ctx, payload) => heroAdjust(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'hero:status', (ctx, payload) => heroStatus(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'hero:slot', (ctx, payload) => heroSlot(manager, ctx, payload));
  manager.register(socket, 'hero:use', (ctx, payload) => heroUse(manager, ctx, payload));
  manager.register(socket, 'hero:mana', (ctx, payload) => heroMana(manager, ctx, payload));
  manager.register(socket, 'hero:rest', (ctx, payload) => heroRest(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'hero:regenMana', (ctx, payload) => heroRegenMana(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'inventory:add', (ctx, payload) => inventoryAdd(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'inventory:remove', (ctx, payload) => inventoryRemove(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'inventory:update', (ctx, payload) => inventoryUpdate(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'inventory:transfer', (ctx, payload) => inventoryTransfer(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'loot:add', (ctx, payload) => lootAdd(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'loot:remove', (ctx, payload) => lootRemove(manager, ctx, payload), { dmOnly: true });
};

