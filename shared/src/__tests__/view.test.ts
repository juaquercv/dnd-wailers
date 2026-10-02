import { describe, expect, it } from 'vitest';
import type { LiveState, VisibilitySettings } from '../types/session';
import {
  allowedZoneIds,
  buildPlayerView,
  effectiveVisibility,
  filterZoneForPlayer,
  heroTokenPlayerId,
  isOwnHero,
  isOwnHeroToken,
  tokenHp,
  visibleAreas,
  visionCellsFor,
  visionConeFor,
  visionTokensFor,
} from '../view';
import { pointInAnyPolygon } from '../vision';
import { element, fixture, level, sessionZone, token, wall, zone } from './helpers';

function withVisibility(state: LiveState, patch: Partial<VisibilitySettings>): LiveState {
  state.visibility.global = { ...state.visibility.global, ...patch };
  return state;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

describe('effectiveVisibility', () => {
  it('returns the global settings when there are no overrides', () => {
    const { state } = fixture();
    expect(effectiveVisibility(state, 'juan')).toEqual(state.visibility.global);
    expect(effectiveVisibility(state, 'juan')).not.toBe(state.visibility.global);
  });

  it('merges per-player overrides, ignoring undefined values', () => {
    const { state } = fixture();
    state.visibility.perPlayer.juan = { visionMode: 'vision', enemyHp: undefined, sceneImageUrl: null };
    state.visibility.global.sceneImageUrl = '/uploads/escena.png';
    const eff = effectiveVisibility(state, 'juan');
    expect(eff.visionMode).toBe('vision');
    expect(eff.enemyHp).toBe(state.visibility.global.enemyHp);
    expect(eff.sceneImageUrl).toBeNull();
    expect(effectiveVisibility(state, 'patrick').visionMode).toBe('all');
  });
});

describe('vision sources and allowed zones', () => {
  it('uses only own hero tokens without shared vision', () => {
    const { state } = fixture();
    withVisibility(state, { sharedVision: false });
    expect(visionTokensFor(state, 'juan').map((t) => t.id)).toEqual(['t_juan']);
    expect(visionTokensFor(state, 'patrick').map((t) => t.id)).toEqual(['t_pat']);
    expect(visionTokensFor(state, 'nobody')).toEqual([]);
  });

  it('uses every hero token with shared vision', () => {
    const { state } = fixture();
    withVisibility(state, { sharedVision: true });
    expect(visionTokensFor(state, 'juan').map((t) => t.id).sort()).toEqual(['t_juan', 't_pat']);
  });

  it('keeps the own hidden hero as a source but never another player hidden hero', () => {
    const { state, zones } = fixture();
    withVisibility(state, { sharedVision: true, canSeeOtherZones: false });
    state.tokens.t_pat!.hidden = true;
    expect(visionTokensFor(state, 'juan').map((t) => t.id)).toEqual(['t_juan']);
    expect(allowedZoneIds(state, zones, 'juan')).toEqual(['A']);
    expect(visionTokensFor(state, 'patrick').map((t) => t.id).sort()).toEqual(['t_juan', 't_pat']);
    withVisibility(state, { sharedVision: false });
    state.tokens.t_juan!.hidden = true;
    expect(visionTokensFor(state, 'juan').map((t) => t.id)).toEqual(['t_juan']);
  });

  it('finds the player of a hero token: who selected the hero, else the owner in the session', () => {
    const { state } = fixture();
    expect(heroTokenPlayerId(state, state.tokens.t_juan!)).toBe('juan');
    expect(heroTokenPlayerId(state, { ...state.tokens.t_juan!, ownerUserId: null })).toBe('juan');
    state.players.patrick!.heroId = 'h_juan';
    state.players.juan!.heroId = null;
    expect(heroTokenPlayerId(state, state.tokens.t_juan!)).toBe('patrick');
    expect(heroTokenPlayerId(state, { ...state.tokens.t_pat!, heroId: null })).toBe('patrick');
    expect(heroTokenPlayerId(state, { ...state.tokens.t_pat!, heroId: null, ownerUserId: 'nadie' })).toBeNull();
    expect(heroTokenPlayerId(state, state.tokens.t_gob!)).toBeNull();
  });

  it('recognises own hero tokens by owner or selected hero', () => {
    const { state } = fixture();
    const t = token({ id: 'x', kind: 'hero', heroId: 'h_juan', zoneId: 'A', levelId: 'lvl_A', x: 0, y: 0 });
    expect(isOwnHeroToken(state, t, 'juan')).toBe(true);
    expect(isOwnHeroToken(state, t, 'patrick')).toBe(false);
    expect(isOwnHeroToken(state, { ...t, kind: 'creature' }, 'juan')).toBe(false);
    expect(isOwnHero(state, state.heroes.h_juan!, 'juan')).toBe(true);
    expect(isOwnHero(state, state.heroes.h_pat!, 'juan')).toBe(false);
  });

  it('allows the zones of the vision tokens, or all zones with canSeeOtherZones', () => {
    const { state, zones } = fixture();
    withVisibility(state, { sharedVision: false, canSeeOtherZones: false });
    expect(allowedZoneIds(state, zones, 'juan')).toEqual(['A']);
    withVisibility(state, { sharedVision: true });
    expect(allowedZoneIds(state, zones, 'juan').sort()).toEqual(['A', 'B']);
    withVisibility(state, { canSeeOtherZones: true });
    expect(allowedZoneIds(state, zones, 'juan').sort()).toEqual(['A', 'B', 'C']);
    withVisibility(state, { visionMode: 'none' });
    expect(allowedZoneIds(state, zones, 'juan')).toEqual([]);
  });
});

describe('visibleAreas', () => {
  it('is empty for "all" and "none"', () => {
    const { state, zones } = fixture();
    withVisibility(state, { visionMode: 'all' });
    expect(visibleAreas(state, zones, 'juan')).toEqual({});
    withVisibility(state, { visionMode: 'none' });
    expect(visibleAreas(state, zones, 'juan')).toEqual({});
  });

  it('computes polygons per level using the effective radius (cells -> px)', () => {
    const { state, zones } = fixture();
    withVisibility(state, { visionMode: 'vision', sharedVision: false, visionRadius: 6 });
    const areas = visibleAreas(state, zones, 'juan');
    expect(Object.keys(areas)).toEqual(['lvl_A']);
    const polys = areas.lvl_A!;
    expect(polys).toHaveLength(1);
    expect(pointInAnyPolygon({ x: 780, y: 500 }, polys)).toBe(true);
    expect(pointInAnyPolygon({ x: 820, y: 500 }, polys)).toBe(false);
  });

  it('prefers the hero visionCells and honours the cone and facing', () => {
    const { state, zones } = fixture();
    withVisibility(state, { visionMode: 'vision', sharedVision: false, visionRadius: 6 });
    state.heroes.h_juan!.data.visionCells = 1;
    let polys = visibleAreas(state, zones, 'juan').lvl_A!;
    expect(pointInAnyPolygon({ x: 540, y: 500 }, polys)).toBe(true);
    expect(pointInAnyPolygon({ x: 600, y: 500 }, polys)).toBe(false);

    state.heroes.h_juan!.data.visionCells = null;
    withVisibility(state, { visionCone: 90 });
    state.tokens.t_juan!.facing = 180;
    polys = visibleAreas(state, zones, 'juan').lvl_A!;
    expect(pointInAnyPolygon({ x: 400, y: 500 }, polys)).toBe(true);
    expect(pointInAnyPolygon({ x: 600, y: 500 }, polys)).toBe(false);
  });

  it('lets a per-player radius override the hero visionCells, but not the global radius', () => {
    const { state, zones } = fixture();
    withVisibility(state, { visionMode: 'vision', sharedVision: false, visionRadius: 1 });
    state.heroes.h_juan!.data.visionCells = 8;
    // Global radius 1: the hero still sees 8 cells (400 px).
    let polys = visibleAreas(state, zones, 'juan').lvl_A!;
    expect(pointInAnyPolygon({ x: 850, y: 500 }, polys)).toBe(true);
    expect(visionCellsFor(state, state.tokens.t_juan!, effectiveVisibility(state, 'juan'), 'juan')).toBe(8);

    // Explicit radius for juan: wins over the hero visionCells.
    state.visibility.perPlayer.juan = { visionRadius: 1 };
    polys = visibleAreas(state, zones, 'juan').lvl_A!;
    expect(pointInAnyPolygon({ x: 540, y: 500 }, polys)).toBe(true);
    expect(pointInAnyPolygon({ x: 600, y: 500 }, polys)).toBe(false);
    expect(visionCellsFor(state, state.tokens.t_juan!, effectiveVisibility(state, 'juan'), 'juan')).toBe(1);
    expect(buildPlayerView(state, zones, 'juan').tokens.t_gob).toBeUndefined();

    // The player view (own perPlayer entry only) computes the same areas as the server.
    const view = buildPlayerView(state, zones, 'juan');
    expect(visibleAreas(view, zones, 'juan')).toEqual(visibleAreas(state, zones, 'juan'));

    // Another player's override does not change juan's vision.
    state.visibility.perPlayer = { patrick: { visionRadius: 1 } };
    expect(pointInAnyPolygon({ x: 850, y: 500 }, visibleAreas(state, zones, 'juan').lvl_A!)).toBe(true);
  });

  it('with shared vision, the radius follows the hero, not the viewer', () => {
    const { state, zones } = fixture();
    withVisibility(state, { visionMode: 'vision', sharedVision: true, visionRadius: 6 });
    state.heroes.h_pat!.data.visionCells = 8;
    const sees = (userId: string, levelId: string, x: number, y: number) =>
      pointInAnyPolygon({ x, y }, visibleAreas(state, zones, userId)[levelId] ?? []);

    // juan has a short radius: it limits only his own hero, not what he sees through patrick.
    state.visibility.perPlayer = { juan: { visionRadius: 1 } };
    expect(sees('juan', 'lvl_A', 540, 500)).toBe(true);
    expect(sees('juan', 'lvl_A', 600, 500)).toBe(false);
    expect(sees('juan', 'lvl_B', 580, 200)).toBe(true);
    expect(visionCellsFor(state, state.tokens.t_pat!, effectiveVisibility(state, 'juan'), 'juan')).toBe(8);
    // ...and patrick, looking through juan, gets juan's limited sight.
    expect(sees('patrick', 'lvl_A', 600, 500)).toBe(false);
    expect(sees('patrick', 'lvl_B', 580, 200)).toBe(true);
    expect(visionCellsFor(state, state.tokens.t_juan!, effectiveVisibility(state, 'patrick'), 'patrick')).toBe(1);

    // patrick is blinded: the whole group loses what patrick's hero saw; juan keeps his own radius.
    state.visibility.perPlayer = { patrick: { visionRadius: 1, enemyHp: 'hidden', visionMode: 'all' } };
    expect(sees('juan', 'lvl_B', 240, 200)).toBe(true);
    expect(sees('juan', 'lvl_B', 260, 200)).toBe(false);
    expect(sees('juan', 'lvl_A', 780, 500)).toBe(true);
    expect(visionCellsFor(state, state.tokens.t_pat!, effectiveVisibility(state, 'juan'), 'juan')).toBe(1);

    // The player view carries only the vision shape of the others, and computes the same areas.
    const view = buildPlayerView(state, zones, 'juan');
    expect(view.visibility.perPlayer).toEqual({ patrick: { visionRadius: 1 } });
    expect(visibleAreas(view, zones, 'juan')).toEqual(visibleAreas(state, zones, 'juan'));
    withVisibility(state, { sharedVision: false });
    expect(buildPlayerView(state, zones, 'juan').visibility.perPlayer).toEqual({});
  });

  it('with shared vision, the cone follows the hero, not the viewer', () => {
    const { state, zones } = fixture();
    withVisibility(state, { visionMode: 'vision', sharedVision: true, visionRadius: 6 });
    const sees = (userId: string, levelId: string, x: number, y: number) =>
      pointInAnyPolygon({ x, y }, visibleAreas(state, zones, userId)[levelId] ?? []);

    // patrick's hero looks to the right with a 90° cone; juan sees through it the same way.
    state.visibility.perPlayer = { patrick: { visionCone: 90 } };
    expect(sees('juan', 'lvl_B', 300, 200)).toBe(true);
    expect(sees('juan', 'lvl_B', 100, 200)).toBe(false);
    expect(sees('juan', 'lvl_A', 400, 500)).toBe(true);
    expect(visionConeFor(state, state.tokens.t_pat!, effectiveVisibility(state, 'juan'), 'juan')).toBe(90);
    expect(visionConeFor(state, state.tokens.t_juan!, effectiveVisibility(state, 'juan'), 'juan')).toBe(360);

    // juan's own cone does not narrow what he sees through patrick.
    state.visibility.perPlayer = { juan: { visionCone: 90 } };
    expect(sees('juan', 'lvl_A', 400, 500)).toBe(false);
    expect(sees('juan', 'lvl_B', 100, 200)).toBe(true);
    expect(sees('patrick', 'lvl_A', 400, 500)).toBe(false);

    const view = buildPlayerView(state, zones, 'patrick');
    expect(view.visibility.perPlayer).toEqual({ juan: { visionCone: 90 } });
    expect(visibleAreas(view, zones, 'patrick')).toEqual(visibleAreas(state, zones, 'patrick'));
  });

  it('a hero token nobody plays uses its own vision or the global one, never the viewer override', () => {
    const { state, zones } = fixture();
    withVisibility(state, { visionMode: 'vision', sharedVision: true, visionRadius: 6 });
    delete state.players.patrick;
    state.visibility.perPlayer = { juan: { visionRadius: 1, visionCone: 90 } };
    expect(heroTokenPlayerId(state, state.tokens.t_pat!)).toBeNull();
    const eff = effectiveVisibility(state, 'juan');
    expect(visionCellsFor(state, state.tokens.t_pat!, eff, 'juan')).toBe(6);
    expect(visionConeFor(state, state.tokens.t_pat!, eff, 'juan')).toBe(360);
    expect(pointInAnyPolygon({ x: 100, y: 200 }, visibleAreas(state, zones, 'juan').lvl_B!)).toBe(true);
  });

  it('respects walls and door states', () => {
    const { state, zones } = fixture();
    withVisibility(state, { visionMode: 'vision', sharedVision: false });
    zones[0]!.levels[0]!.walls = [wall('door1', [570, 300, 570, 700], 'door', false)];
    expect(pointInAnyPolygon({ x: 600, y: 500 }, visibleAreas(state, zones, 'juan').lvl_A!)).toBe(false);
    state.zoneStates.A = { revealedFog: [], doors: { door1: true }, weather: null, lighting: null };
    expect(pointInAnyPolygon({ x: 600, y: 500 }, visibleAreas(state, zones, 'juan').lvl_A!)).toBe(true);
  });

  it('ignores tokens whose zone or level is unknown', () => {
    const { state } = fixture();
    withVisibility(state, { visionMode: 'vision' });
    expect(visibleAreas(state, [], 'juan')).toEqual({});
  });
});

describe('buildPlayerView', () => {
  it('returns the very same state for the host', () => {
    const { state, zones } = fixture();
    expect(buildPlayerView(state, zones, 'dm')).toBe(state);
  });

  it('never mutates the input and returns independent copies', () => {
    const { state, zones } = fixture();
    withVisibility(state, { visionMode: 'vision', enemyHp: 'hidden' });
    state.explored = { juan: { lvl_A: 'AAAA' }, patrick: { lvl_B: 'BBBB' } };
    const snapshot = JSON.stringify(state);
    deepFreeze(state);
    const view = buildPlayerView(state, zones, 'juan');
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(Object.isFrozen(view.heroes.h_juan)).toBe(false);
    view.heroes.h_juan!.data.inventory.push(view.heroes.h_juan!.data.inventory[0]!);
    view.players.juan!.ready = false;
    expect(state.heroes.h_juan!.data.inventory).toHaveLength(1);
    expect(state.players.juan!.ready).toBe(true);
  });

  it('removes hidden tokens and tokens from zones the player may not see', () => {
    const { state, zones } = fixture();
    withVisibility(state, { visionMode: 'all', sharedVision: true, canSeeOtherZones: false });
    const ids = Object.keys(buildPlayerView(state, zones, 'juan').tokens).sort();
    expect(ids).toEqual(['t_far', 't_gob', 't_item', 't_juan', 't_npc', 't_pat']);
    withVisibility(state, { canSeeOtherZones: true });
    expect(Object.keys(buildPlayerView(state, zones, 'juan').tokens)).toContain('t_other');
    withVisibility(state, { canSeeOtherZones: false, sharedVision: false });
    expect(Object.keys(buildPlayerView(state, zones, 'juan').tokens).sort()).toEqual(['t_far', 't_gob', 't_item', 't_juan', 't_npc']);
  });

  it('keeps the own hero token when hidden, so the player still sees through it', () => {
    const { state, zones } = fixture();
    withVisibility(state, { visionMode: 'vision', sharedVision: false, visionRadius: 6, canSeeOtherZones: true });
    state.tokens.t_juan!.hidden = true;
    const view = buildPlayerView(state, zones, 'juan');
    expect(view.tokens.t_juan).toBeDefined();
    expect(view.tokens.t_gob).toBeDefined();
    const areas = visibleAreas(view, zones, 'juan');
    expect(areas.lvl_A).toHaveLength(1);
    expect(areas).toEqual(visibleAreas(state, zones, 'juan'));
    // Other players never receive it.
    withVisibility(state, { visionMode: 'all', sharedVision: true });
    expect(buildPlayerView(state, zones, 'patrick').tokens.t_juan).toBeUndefined();
  });

  it('with shared vision, a hidden hero of another player is neither sent nor a vision source', () => {
    const { state, zones } = fixture();
    withVisibility(state, { visionMode: 'vision', sharedVision: true, visionRadius: 6, canSeeOtherZones: true });
    state.tokens.t_pat!.hidden = true;
    const view = buildPlayerView(state, zones, 'juan');
    expect(view.tokens.t_pat).toBeUndefined();
    expect(visibleAreas(view, zones, 'juan')).toEqual(visibleAreas(state, zones, 'juan'));
    expect(Object.keys(visibleAreas(state, zones, 'juan'))).toEqual(['lvl_A']);
  });

  it('in "vision" mode drops non-hero tokens outside the visible area but keeps heroes', () => {
    const { state, zones } = fixture();
    withVisibility(state, { visionMode: 'vision', sharedVision: true, visionRadius: 6 });
    const tokens = buildPlayerView(state, zones, 'juan').tokens;
    expect(Object.keys(tokens).sort()).toEqual(['t_gob', 't_item', 't_juan', 't_npc', 't_pat']);
  });

  it('in "explored" mode applies the same current-vision rule', () => {
    const { state, zones } = fixture();
    withVisibility(state, { visionMode: 'explored', sharedVision: false });
    const tokens = buildPlayerView(state, zones, 'juan').tokens;
    expect(Object.keys(tokens).sort()).toEqual(['t_gob', 't_item', 't_juan', 't_npc']);
  });

  it('hides enemies behind walls in vision mode', () => {
    const { state, zones } = fixture();
    withVisibility(state, { visionMode: 'vision', sharedVision: false });
    zones[0]!.levels[0]!.walls = [wall('w1', [570, 300, 570, 700])];
    const tokens = buildPlayerView(state, zones, 'juan').tokens;
    expect(tokens.t_gob).toBeUndefined();
    expect(tokens.t_item).toBeDefined();
  });

  it('drops every token in "none" mode', () => {
    const { state, zones } = fixture();
    withVisibility(state, { visionMode: 'none' });
    expect(buildPlayerView(state, zones, 'juan').tokens).toEqual({});
  });

  it('hides all tokens while in the lobby', () => {
    const { state, zones } = fixture();
    state.status = 'lobby';
    withVisibility(state, { visionMode: 'all', canSeeOtherZones: true });
    const view = buildPlayerView(state, zones, 'juan');
    expect(view.tokens).toEqual({});
    expect(view.status).toBe('lobby');
    expect(Object.keys(view.heroes).sort()).toEqual(['h_juan', 'h_pat']);
  });

  it('enemyHp "exact" keeps hp and maxHp', () => {
    const { state, zones } = fixture();
    withVisibility(state, { enemyHp: 'exact' });
    const gob = buildPlayerView(state, zones, 'juan').tokens.t_gob!;
    expect(gob.hp).toBe(7);
    expect(gob.maxHp).toBe(10);
    expect(gob.tempHp).toBe(3);
  });

  it('enemyHp "bar" sends only a ratio rounded to 0.1', () => {
    const { state, zones } = fixture();
    withVisibility(state, { enemyHp: 'bar' });
    state.tokens.t_far!.hp = 1;
    state.tokens.t_far!.maxHp = 100;
    state.tokens.t_hidden!.hidden = false;
    state.tokens.t_hidden!.hp = 0;
    const tokens = buildPlayerView(state, zones, 'juan').tokens;
    expect(tokens.t_gob).toMatchObject({ hp: null, maxHp: null, hpRatio: 0.7, tempHp: 0 });
    expect(tokens.t_npc).toMatchObject({ hp: null, maxHp: null, hpRatio: 0.4 });
    // A living creature never shows an empty bar; a dead one does.
    expect(tokens.t_far!.hpRatio).toBe(0.1);
    expect(tokens.t_hidden!.hpRatio).toBe(0);
  });

  it('enemyHp "hidden" removes every HP value', () => {
    const { state, zones } = fixture();
    withVisibility(state, { enemyHp: 'hidden' });
    const gob = buildPlayerView(state, zones, 'juan').tokens.t_gob!;
    expect(gob).toMatchObject({ hp: null, maxHp: null, hpRatio: null, tempHp: 0 });
  });

  it('never applies enemy HP rules to hero or item tokens', () => {
    const { state, zones } = fixture();
    withVisibility(state, { enemyHp: 'hidden' });
    const tokens = buildPlayerView(state, zones, 'juan').tokens;
    expect(tokens.t_pat).toMatchObject({ hp: 20, maxHp: 30 });
    expect(tokens.t_juan).toMatchObject({ hp: 20, maxHp: 30, tempHp: 2 });
  });

  it('strips enemy stats and AC unless canSeeEnemyDetails', () => {
    const { state, zones } = fixture();
    withVisibility(state, { canSeeEnemyDetails: false });
    let gob = buildPlayerView(state, zones, 'juan').tokens.t_gob!;
    expect(gob.stats).toBeNull();
    expect(gob.ac).toBeNull();
    withVisibility(state, { canSeeEnemyDetails: true });
    gob = buildPlayerView(state, zones, 'juan').tokens.t_gob!;
    expect(gob.stats).toEqual(state.tokens.t_gob!.stats);
    expect(gob.ac).toBe(13);
  });

  it('clears notes and loot on every token', () => {
    const { state, zones } = fixture();
    state.tokens.t_juan!.notes = 'nota';
    state.tokens.t_juan!.loot = state.tokens.t_gob!.loot;
    const tokens = buildPlayerView(state, zones, 'juan').tokens;
    for (const t of Object.values(tokens)) {
      expect(t.notes).toBe('');
      expect(t.loot).toEqual([]);
    }
    expect(state.tokens.t_gob!.notes).toBe('Lleva la llave');
    expect(state.tokens.t_item!.loot).toHaveLength(1);
  });

  it('hides other heroes inventory and gold unless allowed, never the own hero', () => {
    const { state, zones } = fixture();
    withVisibility(state, { canSeeOthersInventory: false });
    let view = buildPlayerView(state, zones, 'juan');
    expect(view.heroes.h_juan).toEqual(state.heroes.h_juan);
    const other = view.heroes.h_pat!;
    expect(other.data.inventory).toEqual([]);
    expect(other.data.gold).toBe(0);
    expect(other.name).toBe(state.heroes.h_pat!.name);
    expect(other.level).toBe(3);
    expect(other.data.hp).toEqual(state.heroes.h_pat!.data.hp);
    expect(other.data.statuses).toEqual(['blessed']);
    expect(other.data.resources).toEqual(state.heroes.h_pat!.data.resources);
    expect(other.data.notes).toBe('');

    withVisibility(state, { canSeeOthersInventory: true });
    view = buildPlayerView(state, zones, 'juan');
    expect(view.heroes.h_pat!.data.inventory).toHaveLength(1);
    expect(view.heroes.h_pat!.data.gold).toBe(120);
  });

  it('empties the initiative order unless canSeeInitiative', () => {
    const { state, zones } = fixture();
    state.turn = {
      mode: 'manual',
      order: [{ id: 'e1', type: 'creature', userId: null, heroId: null, tokenId: 't_gob', name: 'Goblin', imageUrl: null, initiative: 12 }],
      currentIndex: 0,
      round: 3,
    };
    withVisibility(state, { canSeeInitiative: false });
    let view = buildPlayerView(state, zones, 'juan');
    expect(view.turn.order).toEqual([]);
    expect(view.turn.currentIndex).toBe(0);
    expect(view.turn.round).toBe(3);
    withVisibility(state, { canSeeInitiative: true });
    view = buildPlayerView(state, zones, 'juan');
    expect(view.turn.order).toHaveLength(1);
  });

  it('anonymizes initiative entries of hidden creatures, in game and in the lobby', () => {
    const { state, zones } = fixture();
    withVisibility(state, { canSeeInitiative: true });
    state.tokens.t_juan!.hidden = true;
    state.turn = {
      mode: 'manual',
      order: [
        { id: 'e1', type: 'npc', userId: null, heroId: null, tokenId: 't_hidden', name: 'Jefe secreto', imageUrl: '/boss.svg', initiative: 18 },
        { id: 'e2', type: 'creature', userId: null, heroId: null, tokenId: 't_gob', name: 'Goblin', imageUrl: '/gob.svg', initiative: 12 },
        { id: 'e3', type: 'player', userId: 'juan', heroId: 'h_juan', tokenId: 't_juan', name: 'Héroe juan', imageUrl: null, initiative: 10 },
        { id: 'e4', type: 'custom', userId: null, heroId: null, tokenId: null, name: 'Trampa', imageUrl: null, initiative: 5 },
      ],
      currentIndex: 0,
      round: 2,
    };
    const snapshot = JSON.stringify(state.turn);
    for (const status of ['playing', 'lobby'] as const) {
      state.status = status;
      const view = buildPlayerView(state, zones, 'patrick');
      expect(view.turn.currentIndex).toBe(0);
      expect(view.turn.order.map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
      expect(view.turn.order[0]).toEqual({
        id: 'e1',
        type: 'creature',
        userId: null,
        heroId: null,
        tokenId: 't_hidden',
        name: 'Criatura desconocida',
        imageUrl: null,
        initiative: null,
      });
      expect(view.turn.order.slice(1)).toEqual(state.turn.order.slice(1));
      expect(JSON.stringify(view.turn)).not.toContain('Jefe secreto');
      expect(JSON.stringify(view.turn)).not.toContain('/boss.svg');
    }
    expect(JSON.stringify(state.turn)).toBe(snapshot);
    // The DM keeps the full entry.
    expect(buildPlayerView(state, zones, 'dm').turn.order[0]!.name).toBe('Jefe secreto');
  });

  it('keeps only the player own explored data, roll requests, trades and overrides', () => {
    const { state, zones } = fixture();
    state.explored = { juan: { lvl_A: 'AAAA' }, patrick: { lvl_B: 'BBBB' } };
    const request = (id: string, targetUserId: string) => ({
      id,
      sessionId: 's1',
      targetUserId,
      requestedBy: 'dm',
      label: 'Percepción',
      formula: '1d20',
      rollerId: null,
      mode: 'normal' as const,
      visibility: 'public' as const,
      source: 'dm' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    state.rollRequests = [request('r1', 'juan'), request('r2', 'patrick')];
    const trade = (id: string, fromUserId: string, toUserId: string) => ({
      id,
      fromUserId,
      fromHeroId: 'h1',
      toUserId,
      toHeroId: 'h2',
      items: [],
      gold: 5,
      status: 'pending_target' as const,
      note: '',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    state.trades = [trade('t1', 'juan', 'patrick'), trade('t2', 'patrick', 'juan'), trade('t3', 'patrick', 'campos')];
    state.visibility.perPlayer = { juan: { enemyHp: 'exact' }, patrick: { enemyHp: 'hidden' } };

    const view = buildPlayerView(state, zones, 'juan');
    expect(view.explored).toEqual({ juan: { lvl_A: 'AAAA' } });
    expect(view.rollRequests.map((r) => r.id)).toEqual(['r1']);
    expect(view.trades.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(view.visibility.perPlayer).toEqual({ juan: { enemyHp: 'exact' } });
    expect(view.visibility.global).toEqual(state.visibility.global);

    const campos = buildPlayerView(state, zones, 'campos');
    expect(campos.explored).toEqual({});
    expect(campos.rollRequests).toEqual([]);
    expect(campos.trades.map((t) => t.id)).toEqual(['t3']);
    expect(campos.visibility.perPlayer).toEqual({});
  });

  it('keeps the turn offer only for its player', () => {
    const { state, zones } = fixture();
    state.turnOffer = { userId: 'juan', rollerIds: ['r1'] };
    expect(buildPlayerView(state, zones, 'juan').turnOffer).toEqual({ userId: 'juan', rollerIds: ['r1'] });
    expect(buildPlayerView(state, zones, 'patrick').turnOffer).toBeNull();
  });

  it('targets projections', () => {
    const { state, zones } = fixture();
    const base = { id: 'p1', kind: 'image' as const, title: 'Mapa', zoneId: null, levelId: null, imageUrl: '/x.png', entry: null };
    state.projection = { ...base, targets: 'all' };
    expect(buildPlayerView(state, zones, 'juan').projection).toEqual(state.projection);
    state.projection = { ...base, targets: ['juan'] };
    expect(buildPlayerView(state, zones, 'juan').projection).toEqual(state.projection);
    expect(buildPlayerView(state, zones, 'patrick').projection).toBeNull();
    state.projection = { ...base, targets: [] };
    expect(buildPlayerView(state, zones, 'juan').projection).toBeNull();
  });

  it('keeps zone states, players and other session data', () => {
    const { state, zones } = fixture();
    state.zoneStates = { A: { revealedFog: ['f1'], doors: { d1: true }, weather: 'rain', lighting: 'night' } };
    const view = buildPlayerView(state, zones, 'juan');
    expect(view.zoneStates).toEqual(state.zoneStates);
    expect(view.players).toEqual(state.players);
    expect(view.audio).toEqual(state.audio);
    expect(view.sessionId).toBe('s1');
    expect(view.hostUserId).toBe('dm');
  });
});

describe('filterZoneForPlayer', () => {
  it('removes DM notes, note elements, hidden elements and design-time tokens', () => {
    const lvl = level('l1', {
      elements: [
        element({ id: 'keep', type: 'marker' }),
        element({ id: 'text', type: 'text' }),
        element({ id: 'note', type: 'note' }),
        element({ id: 'notesLayer', type: 'text', layer: 'notes' }),
        element({ id: 'hidden', type: 'marker', hidden: true }),
        element({ id: 'tok', type: 'token' }),
      ],
      fogRegions: [{ id: 'fog1', name: 'Cripta', points: [0, 0, 10, 0, 10, 10] }],
      walls: [wall('w1', [0, 0, 10, 10])],
    });
    const z = sessionZone(zone('Z', [lvl]));
    const snapshot = JSON.stringify(z);
    const filtered = filterZoneForPlayer(z);
    expect(filtered.notes).toBe('');
    expect(filtered.levels[0]!.elements.map((e) => e.id)).toEqual(['keep', 'text']);
    expect(filtered.levels[0]!.fogRegions).toHaveLength(1);
    expect(filtered.levels[0]!.walls).toHaveLength(1);
    expect(JSON.stringify(z)).toBe(snapshot);
    expect(filtered).not.toBe(z);
  });
});

describe('tokenHp', () => {
  it('reads hero HP from the hero sheet', () => {
    const { state } = fixture();
    state.tokens.t_juan!.hp = 999;
    expect(tokenHp(state, state.tokens.t_juan!)).toEqual({ hp: 20, maxHp: 30, temp: 2, ratio: 20 / 30 });
  });

  it('falls back to the token when the hero sheet is missing', () => {
    const { state } = fixture();
    const t = { ...state.tokens.t_juan!, heroId: 'missing' };
    expect(tokenHp(state, t)).toEqual({ hp: 20, maxHp: 30, temp: 2, ratio: 20 / 30 });
  });

  it('reads creature HP from the token, or the approximate ratio', () => {
    const { state } = fixture();
    expect(tokenHp(state, state.tokens.t_gob!)).toEqual({ hp: 7, maxHp: 10, temp: 3, ratio: 0.7 });
    const bar = { ...state.tokens.t_gob!, hp: null, maxHp: null, hpRatio: 0.4, tempHp: 0 };
    expect(tokenHp(state, bar)).toEqual({ hp: null, maxHp: null, temp: 0, ratio: 0.4 });
    const hidden = { ...bar, hpRatio: null };
    expect(tokenHp(state, hidden)).toEqual({ hp: null, maxHp: null, temp: 0, ratio: null });
    const overheal = { ...state.tokens.t_gob!, hp: 15, maxHp: 10 };
    expect(tokenHp(state, overheal).ratio).toBe(1);
  });

  it('item tokens have no HP', () => {
    const { state } = fixture();
    expect(tokenHp(state, { ...state.tokens.t_item!, hp: 5, maxHp: 5 })).toEqual({ hp: null, maxHp: null, temp: 0, ratio: null });
  });
});
