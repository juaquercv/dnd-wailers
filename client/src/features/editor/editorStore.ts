import { create } from 'zustand';
import {
  LAYER_IDS,
  type Campaign,
  type LayerId,
  type LightSource,
  type FogRegion,
  type OverviewMap,
  type SceneElement,
  type SpawnPoint,
  type TransitionType,
  type UpdateCampaignRequest,
  type Wall,
  type Zone,
  type ZoneInput,
  type ZoneLevel,
  type ZoneNeighbors,
} from '@wailers/shared';
import { api, ApiRequestError } from '../../api/http';

export type EditorTool =
  | 'select'
  | 'pan'
  | 'draw' // freehand path
  | 'line' // polyline path (click points, double-click/Enter to finish)
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'marker'
  | 'wall' // click points to build a polyline wall, double-click/Enter to finish
  | 'light'
  | 'fog' // click points to build a fog polygon
  | 'transition'
  | 'note'
  | 'spawn'
  | 'erase';

export type EditorMode = 'zone' | 'overview' | 'grid' | 'rules' | 'rollers' | 'settings';

export type SelectionItem =
  | { kind: 'element'; id: string }
  | { kind: 'wall'; id: string }
  | { kind: 'light'; id: string }
  | { kind: 'fog'; id: string };

export interface ToolOptions {
  stroke: string;
  fill: string;
  strokeWidth: number;
  fontSize: number;
  opacity: number;
  wallKind: Wall['kind'];
  markerIcon: string;
  markerColor: string;
  transitionType: TransitionType;
  lightRadius: number;
  lightColor: string;
  /** Layer used for new drawings/images/markers. */
  activeLayer: LayerId;
}

interface ZoneHistory {
  past: Zone[];
  future: Zone[];
  lastKey: string | null;
  lastAt: number;
}

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

interface EditorState {
  campaignId: string | null;
  campaign: Campaign | null;
  zones: Zone[];
  loading: boolean;
  loadError: string | null;
  mode: EditorMode;
  currentZoneId: string | null;
  currentLevelId: string | null;
  tool: EditorTool;
  toolOptions: ToolOptions;
  selection: SelectionItem[];
  layerVisible: Record<LayerId, boolean>;
  layerLocked: Record<LayerId, boolean>;
  history: Record<string, ZoneHistory>;
  dirtyZoneIds: string[];
  /** Zone autosave state ('error' while a zone save failed; the zones stay dirty and are sent again). */
  saveState: SaveState;
  saveError: string | null;
  /**
   * Set while campaign fields from a failed save are still unsaved. They are kept and sent again with the
   * next campaign save, a retry, or after the next successful zone autosave when the failure was an outage.
   */
  campaignSaveError: string | null;

  load: (campaignId: string) => Promise<void>;
  setMode: (mode: EditorMode) => void;
  selectZone: (zoneId: string, levelId?: string) => void;
  selectLevel: (levelId: string) => void;
  setTool: (tool: EditorTool) => void;
  setToolOptions: (patch: Partial<ToolOptions>) => void;
  setSelection: (items: SelectionItem[]) => void;
  toggleLayerVisible: (layer: LayerId) => void;
  toggleLayerLocked: (layer: LayerId) => void;

  /**
   * Immutable update of a zone (the recipe receives a deep clone it may mutate).
   * history (default true) pushes an undo snapshot; consecutive updates with the same coalesceKey
   * within 1.5 s share one snapshot (use it for drags/typing). Marks dirty and schedules autosave.
   * history: false is meant for placement edits (grid position, neighbors, order): they are also written
   * into the zone's existing undo/redo snapshots, so undoing an unrelated step never reverts them.
   */
  updateZone: (zoneId: string, recipe: (draft: Zone) => void, opts?: { history?: boolean; coalesceKey?: string }) => void;
  /** Same as updateZone for the current zone + level. */
  updateLevel: (recipe: (level: ZoneLevel, zone: Zone) => void, opts?: { history?: boolean; coalesceKey?: string }) => void;
  addElement: (el: SceneElement) => void;
  updateElement: (id: string, patch: Partial<SceneElement>, opts?: { history?: boolean; coalesceKey?: string }) => void;
  addWall: (wall: Wall) => void;
  addLight: (light: LightSource) => void;
  addFogRegion: (fog: FogRegion) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  /** Flush pending zone saves now. Resolves true when every dirty zone was saved. */
  saveNow: () => Promise<boolean>;

  createZone: (opts?: { parentZoneId?: string | null; name?: string; templateEntryId?: string }) => Promise<Zone | null>;
  duplicateZone: (zoneId: string) => Promise<void>;
  deleteZone: (zoneId: string) => Promise<void>;
  reorderZones: (zoneIds: string[]) => Promise<void>;
  /** Replace zones after server-side changes (e.g. reciprocal neighbors). Keeps local dirty zones. */
  refreshZones: () => Promise<void>;

  /**
   * Optimistic campaign patch, saved debounced (600 ms) together with other patches of the same batch.
   * Every call resolves when its batch is saved: true on success, false when the request failed.
   */
  updateCampaign: (patch: UpdateCampaignRequest) => Promise<boolean>;
}

const HISTORY_LIMIT = 100;
const AUTOSAVE_MS = 800;

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let campaignSaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingCampaignPatch: UpdateCampaignRequest = {};
/** Callers waiting for the pending (debounced) campaign batch; all of them resolve when it is sent. */
let campaignSaveWaiters: ((ok: boolean) => void)[] = [];
/** Campaign patches whose request is still in flight (kept on top of reloaded campaigns). */
let inFlightCampaignPatch: UpdateCampaignRequest = {};
let campaignFlushes = 0;
/** Campaign fields whose save failed and that were put back into pendingCampaignPatch (unsaved until a save succeeds). */
const failedCampaignFields = new Set<string>();
/** Whether the last campaign failure looked like an outage (no connection, 5xx): retried after the next zone save. */
let campaignFailureRetryable = false;
/** Field -> number of the latest campaign flush that sent it (an older failed flush never re-queues a newer value). */
const campaignFieldFlush = new Map<string, number>();
let campaignFlushSeq = 0;
/** Bumped by load(): saves of a previously loaded campaign no longer touch the editor state. */
let loadGeneration = 0;
/** Zone saves run one after another: a save requested while another is in flight waits for it. */
let saveChain: Promise<unknown> = Promise.resolve();
/** zoneId -> neighbors as last known on the server. */
const savedNeighbors = new Map<string, ZoneNeighbors>();

const NEIGHBOR_DIRS = ['up', 'down', 'left', 'right'] as const satisfies readonly (keyof ZoneNeighbors)[];

function rememberNeighbors(zones: Zone[]): void {
  for (const z of zones) savedNeighbors.set(z.id, { ...z.neighbors });
}

/**
 * Placement of a zone (neighbor links per direction, grid position, slide order, parent). It also changes
 * outside the undo history: grid editor, server-side neighbor reciprocity, reordering, deleted zones.
 */
interface PlacementPatch {
  neighbors?: Partial<ZoneNeighbors>;
  gridPos?: Zone['gridPos'];
  order?: number;
  parentZoneId?: string | null;
}

/** Placement fields that differ from `from` to `to` (null when none). */
function placementDiff(from: Zone, to: Zone): PlacementPatch | null {
  const patch: PlacementPatch = {};
  const neighbors: Partial<ZoneNeighbors> = {};
  for (const dir of NEIGHBOR_DIRS) if (from.neighbors[dir] !== to.neighbors[dir]) neighbors[dir] = to.neighbors[dir];
  if (Object.keys(neighbors).length > 0) patch.neighbors = neighbors;
  if (JSON.stringify(from.gridPos) !== JSON.stringify(to.gridPos)) patch.gridPos = to.gridPos;
  if (from.order !== to.order) patch.order = to.order;
  if (from.parentZoneId !== to.parentZoneId) patch.parentZoneId = to.parentZoneId;
  return Object.keys(patch).length > 0 ? patch : null;
}

function applyPlacement(zone: Zone, patch: PlacementPatch): Zone {
  return {
    ...zone,
    neighbors: patch.neighbors ? { ...zone.neighbors, ...patch.neighbors } : zone.neighbors,
    gridPos: patch.gridPos !== undefined ? patch.gridPos : zone.gridPos,
    order: patch.order ?? zone.order,
    parentZoneId: patch.parentZoneId !== undefined ? patch.parentZoneId : zone.parentZoneId,
  };
}

/** Writes a placement change made outside the history into every undo/redo snapshot of the zone. */
function carryIntoHistory(history: Record<string, ZoneHistory>, zoneId: string, patch: PlacementPatch | null): Record<string, ZoneHistory> {
  const h = history[zoneId];
  if (!patch || !h || (h.past.length === 0 && h.future.length === 0)) return history;
  return {
    ...history,
    [zoneId]: { ...h, past: h.past.map((z) => applyPlacement(z, patch)), future: h.future.map((z) => applyPlacement(z, patch)) },
  };
}

/** PUT body of a zone; `neighbors` may be partial (the server merges it with the stored links). */
type ZoneSaveBody = Omit<ZoneInput, 'neighbors'> & { neighbors?: Partial<ZoneNeighbors> };

/**
 * Only the neighbor directions edited locally (vs. the last known server state) are sent, so a stale copy
 * never overwrites links the server mirrored from another zone.
 */
function zoneSaveBody(zone: Zone): ZoneSaveBody {
  const { neighbors: _neighbors, ...input } = zoneToInput(zone);
  const known = savedNeighbors.get(zone.id);
  const changed: Partial<ZoneNeighbors> = {};
  for (const dir of NEIGHBOR_DIRS) if (!known || known[dir] !== zone.neighbors[dir]) changed[dir] = zone.neighbors[dir];
  return Object.keys(changed).length > 0 ? { ...input, neighbors: changed } : input;
}

/** Drops what points to zones that no longer exist (overview pins and their links, the spawn), as the server does. */
function withoutMissingZones<T extends { overview?: OverviewMap; spawn?: SpawnPoint | null }>(value: T, live: ReadonlySet<string>): T {
  let next = value;
  const overview = value.overview;
  if (overview) {
    const pins = overview.pins.filter((p) => live.has(p.zoneId));
    if (pins.length !== overview.pins.length) {
      const pinIds = new Set(pins.map((p) => p.id));
      const links = overview.links.filter((l) => pinIds.has(l.fromPinId) && pinIds.has(l.toPinId));
      next = { ...next, overview: { ...overview, pins, links } };
    }
  }
  if (value.spawn && !live.has(value.spawn.zoneId)) next = { ...next, spawn: null };
  return next;
}

function allLayers<T>(value: T): Record<LayerId, T> {
  return Object.fromEntries(LAYER_IDS.map((l) => [l, value])) as Record<LayerId, T>;
}

function zoneToInput(z: Zone): ZoneInput {
  const { id: _id, campaignId: _c, createdAt: _cr, updatedAt: _u, ...rest } = z;
  return rest;
}

function sortZones(zones: Zone[]): Zone[] {
  return [...zones].sort((a, b) => a.order - b.order);
}

/** Transition targets of a zone keyed by element id. */
function transitionTargets(zone: Zone): Map<string, SpawnPoint | null> {
  const out = new Map<string, SpawnPoint | null>();
  for (const level of zone.levels) for (const el of level.elements) if (el.type === 'transition') out.set(el.id, el.target);
  return out;
}

/**
 * Dirty zones in save order: a zone goes after the dirty zones its transitions lead to, because the server
 * moves a transition whose target level does not exist yet (e.g. a level created in the same batch).
 */
function zoneSaveOrder(ids: string[], zones: Zone[]): string[] {
  const byId = new Map(zones.map((z) => [z.id, z]));
  const batch = new Set(ids);
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const zone = byId.get(id);
    if (zone) for (const target of transitionTargets(zone).values()) if (target && target.zoneId !== id && batch.has(target.zoneId)) visit(target.zoneId);
    order.push(id);
  };
  for (const id of ids) visit(id);
  return order;
}

/** True when the server stored a different target for a transition whose target level matches `concerned`. */
function targetsMoved(sent: Zone, saved: Zone, concerned: (zoneId: string, levelId: string) => boolean): boolean {
  const stored = transitionTargets(saved);
  for (const [id, target] of transitionTargets(sent)) {
    if (!target || !concerned(target.zoneId, target.levelId)) continue;
    const now = stored.get(id);
    if (!now || now.zoneId !== target.zoneId || now.levelId !== target.levelId) return true;
  }
  return false;
}

function isOutage(err: unknown): boolean {
  const status = err instanceof ApiRequestError ? err.status : 0;
  return status === 0 || status >= 500;
}

export const useEditorStore = create<EditorState>((set, get) => {
  const scheduleAutosave = () => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      void get().saveNow();
    }, AUTOSAVE_MS);
  };

  const markDirty = (zoneId: string) => {
    set((s) => ({
      dirtyZoneIds: s.dirtyZoneIds.includes(zoneId) ? s.dirtyZoneIds : [...s.dirtyZoneIds, zoneId],
      saveState: s.saveState === 'saving' ? 'saving' : 'dirty',
    }));
    scheduleAutosave();
  };

  /** Reloads the campaign after server-side changes (pins of deleted zones, moved spawn); unsaved patches stay on top. */
  const syncCampaign = async (): Promise<void> => {
    const { campaignId } = get();
    if (!campaignId) return;
    const fresh = await api.campaigns.get(campaignId);
    if (get().campaignId === campaignId) set({ campaign: { ...fresh, ...inFlightCampaignPatch, ...pendingCampaignPatch } as Campaign });
  };

  /**
   * Saves one zone. Links the server changed (reciprocity) replace the stale local ones in every direction not
   * edited again meanwhile, and are written into the zone's undo snapshots (undoing never reverts them).
   */
  const saveZone = async (id: string): Promise<{ sent: Zone; saved: Zone; neighborsSent: boolean } | null> => {
    const sent = get().zones.find((z) => z.id === id);
    if (!sent) return null;
    const body = zoneSaveBody(sent);
    // The server's zone schema accepts partial neighbors (merged with the stored ones).
    const saved = await api.zones.update(id, body as ZoneInput);
    savedNeighbors.set(id, { ...saved.neighbors });
    set((s) => {
      const editedAgain = s.dirtyZoneIds.includes(id);
      let history = s.history;
      const zones = s.zones.map((z) => {
        if (z.id !== id) return z;
        const neighbors = { ...z.neighbors };
        for (const dir of NEIGHBOR_DIRS) if (z.neighbors[dir] === sent.neighbors[dir]) neighbors[dir] = saved.neighbors[dir];
        const next: Zone = { ...z, neighbors, updatedAt: editedAgain ? z.updatedAt : saved.updatedAt };
        history = carryIntoHistory(history, id, placementDiff(z, next));
        return next;
      });
      return { zones, history };
    });
    // Neighbor edits are made reciprocal server-side, so other zones change too.
    return { sent, saved, neighborsSent: !!body.neighbors };
  };

  const flushZones = async (): Promise<boolean> => {
    const ids = get().dirtyZoneIds;
    if (ids.length === 0) return true;
    set({ saveState: 'saving', saveError: null, dirtyZoneIds: [] });
    let neighborsTouched = false;
    try {
      const order = zoneSaveOrder(ids, get().zones);
      const unsaved = new Set(order);
      // The server moves a transition into a level it does not know yet: one into a level of a zone saved later
      // in this batch (only possible in a cycle, see zoneSaveOrder) is sent again once that zone is saved.
      const levelNotSavedYet = (zoneId: string, levelId: string) =>
        unsaved.has(zoneId) && !!get().zones.find((z) => z.id === zoneId)?.levels.some((l) => l.id === levelId);
      const again: string[] = [];
      for (const id of order) {
        unsaved.delete(id);
        const result = await saveZone(id);
        if (!result) continue;
        if (result.neighborsSent) neighborsTouched = true;
        if (targetsMoved(result.sent, result.saved, levelNotSavedYet)) again.push(id);
      }
      for (const id of again) {
        // Edited again meanwhile: its next autosave sends the transition anyway.
        if (get().dirtyZoneIds.includes(id)) continue;
        if ((await saveZone(id))?.neighborsSent) neighborsTouched = true;
      }
      if (neighborsTouched) await get().refreshZones();
      // A removed level (e.g. an undone "new level") makes the server move the spawn that was on it.
      const spawn = get().campaign?.spawn;
      const spawnZone = spawn && ids.includes(spawn.zoneId) ? get().zones.find((z) => z.id === spawn.zoneId) : undefined;
      if (spawn && spawnZone && !spawnZone.levels.some((l) => l.id === spawn.levelId)) {
        await syncCampaign().catch((err: unknown) => console.warn('[editor] No se pudo recargar la campaña:', err));
      }
      set((s) => ({ saveState: s.dirtyZoneIds.length ? 'dirty' : 'saved' }));
      // The server answers again: send the campaign fields kept from a save that failed during the outage.
      const campaignId = get().campaignId;
      if (campaignId && campaignFailureRetryable && !campaignSaveTimer && Object.keys(pendingCampaignPatch).some((f) => failedCampaignFields.has(f))) {
        campaignSaveTimer = setTimeout(() => void flushCampaign(campaignId), 0);
      }
      return true;
    } catch (err) {
      set((s) => ({
        saveState: 'error',
        saveError: err instanceof Error ? err.message : String(err),
        dirtyZoneIds: Array.from(new Set([...s.dirtyZoneIds, ...ids])),
      }));
      return false;
    }
  };

  const flushCampaign = async (campaignId: string): Promise<void> => {
    campaignSaveTimer = null;
    const body = pendingCampaignPatch;
    const waiters = campaignSaveWaiters;
    pendingCampaignPatch = {};
    campaignSaveWaiters = [];
    const generation = loadGeneration;
    const seq = ++campaignFlushSeq;
    for (const field of Object.keys(body)) campaignFieldFlush.set(field, seq);
    /** Fields of this flush that no newer flush has sent since. */
    const latestFields = () => Object.keys(body).filter((field) => campaignFieldFlush.get(field) === seq);
    const stillOpen = () => generation === loadGeneration && get().campaignId === campaignId;
    inFlightCampaignPatch = { ...inFlightCampaignPatch, ...body };
    campaignFlushes += 1;
    const settle = () => {
      // load() resets this bookkeeping when another campaign is opened.
      if (generation !== loadGeneration) return;
      campaignFlushes -= 1;
      if (campaignFlushes === 0) inFlightCampaignPatch = {};
    };
    let ok = true;
    let zonesFailed = false;
    try {
      // A spawn on a just-created level or zone needs that zone on the server first.
      if (body.spawn) zonesFailed = !(await get().saveNow());
      const saved = await api.campaigns.update(campaignId, body);
      settle();
      // Patches made while the request was in flight (or kept from a failed save) stay on top until their own save.
      if (stillOpen()) {
        for (const field of latestFields()) failedCampaignFields.delete(field);
        set({
          campaign: { ...saved, ...inFlightCampaignPatch, ...pendingCampaignPatch } as Campaign,
          ...(failedCampaignFields.size === 0 ? { campaignSaveError: null } : {}),
        });
      }
    } catch (err) {
      settle();
      ok = false;
      if (stillOpen()) {
        // Nothing is dropped: the unsaved fields go back under the newer pending edits and are sent again later.
        const retry = Object.fromEntries(latestFields().map((field) => [field, body[field as keyof UpdateCampaignRequest]])) as UpdateCampaignRequest;
        for (const field of Object.keys(retry)) failedCampaignFields.add(field);
        pendingCampaignPatch = { ...retry, ...pendingCampaignPatch };
        if (failedCampaignFields.size > 0) {
          campaignFailureRetryable = zonesFailed || isOutage(err);
          set({ campaignSaveError: err instanceof Error ? err.message : String(err) });
        }
      }
    }
    for (const resolve of waiters) resolve(ok);
  };

  return {
    campaignId: null,
    campaign: null,
    zones: [],
    loading: false,
    loadError: null,
    mode: 'zone',
    currentZoneId: null,
    currentLevelId: null,
    tool: 'select',
    toolOptions: {
      stroke: '#f5e6c4',
      fill: '#7a5c3a',
      strokeWidth: 4,
      fontSize: 28,
      opacity: 1,
      wallKind: 'wall',
      markerIcon: '📍',
      markerColor: '#e2b04a',
      transitionType: 'door',
      lightRadius: 280,
      lightColor: '#ffb347',
      activeLayer: 'objects',
    },
    selection: [],
    layerVisible: allLayers(true),
    layerLocked: allLayers(false),
    history: {},
    dirtyZoneIds: [],
    saveState: 'saved',
    saveError: null,
    campaignSaveError: null,

    load: async (campaignId) => {
      const previous = get().campaignId;
      if (previous && previous !== campaignId) {
        set({ loading: true, loadError: null });
        // Unsaved work of the previously open campaign gets a last save before its state is replaced.
        await get().saveNow();
        if (campaignSaveTimer) clearTimeout(campaignSaveTimer);
        campaignSaveTimer = null;
        // Also when only callers wait (an empty retry patch): they must always get an answer.
        if (Object.keys(pendingCampaignPatch).length > 0 || campaignSaveWaiters.length > 0) await flushCampaign(previous);
        // Nothing of the previous campaign may be sent to (or shown on) the next one.
        loadGeneration += 1;
        pendingCampaignPatch = {};
        inFlightCampaignPatch = {};
        campaignFlushes = 0;
        failedCampaignFields.clear();
        campaignFieldFlush.clear();
        campaignFailureRetryable = false;
        set({ saveState: 'saved', saveError: null, campaignSaveError: null });
      }
      set({ loading: true, loadError: null, campaignId, history: {}, dirtyZoneIds: [], selection: [] });
      try {
        const [fresh, zones] = await Promise.all([api.campaigns.get(campaignId), api.campaigns.zones(campaignId)]);
        if (get().campaignId !== campaignId) return;
        const sorted = sortZones(zones);
        rememberNeighbors(sorted);
        const first = sorted[0] ?? null;
        set({
          // Fields kept from a failed save of this campaign stay on top until they are saved.
          campaign: { ...fresh, ...inFlightCampaignPatch, ...pendingCampaignPatch } as Campaign,
          zones: sorted,
          loading: false,
          currentZoneId: first?.id ?? null,
          currentLevelId: first?.defaultLevelId ?? null,
          saveState: 'saved',
        });
      } catch (err) {
        if (get().campaignId === campaignId) set({ loading: false, loadError: err instanceof Error ? err.message : String(err) });
      }
    },

    setMode: (mode) => set({ mode, selection: [] }),

    selectZone: (zoneId, levelId) => {
      const zone = get().zones.find((z) => z.id === zoneId);
      if (!zone) return;
      const lvl = levelId && zone.levels.some((l) => l.id === levelId) ? levelId : zone.defaultLevelId;
      set({ currentZoneId: zoneId, currentLevelId: lvl, selection: [], mode: 'zone' });
    },

    selectLevel: (levelId) => set({ currentLevelId: levelId, selection: [] }),
    setTool: (tool) => set({ tool, selection: tool === 'select' ? get().selection : [] }),
    setToolOptions: (patch) => set((s) => ({ toolOptions: { ...s.toolOptions, ...patch } })),
    setSelection: (items) => set({ selection: items }),
    toggleLayerVisible: (layer) => set((s) => ({ layerVisible: { ...s.layerVisible, [layer]: !s.layerVisible[layer] } })),
    toggleLayerLocked: (layer) => set((s) => ({ layerLocked: { ...s.layerLocked, [layer]: !s.layerLocked[layer] } })),

    updateZone: (zoneId, recipe, opts) => {
      const s = get();
      const idx = s.zones.findIndex((z) => z.id === zoneId);
      if (idx < 0) return;
      const prev = s.zones[idx]!;
      const draft = structuredClone(prev);
      recipe(draft);
      const zones = [...s.zones];
      zones[idx] = draft;
      const useHistory = opts?.history ?? true;
      let history = s.history;
      if (useHistory) {
        const h = s.history[zoneId] ?? { past: [], future: [], lastKey: null, lastAt: 0 };
        const now = Date.now();
        const coalesce = !!opts?.coalesceKey && h.lastKey === opts.coalesceKey && now - h.lastAt < 1500;
        const past = coalesce ? h.past : [...h.past, prev].slice(-HISTORY_LIMIT);
        history = { ...s.history, [zoneId]: { past, future: [], lastKey: opts?.coalesceKey ?? null, lastAt: now } };
      } else {
        history = carryIntoHistory(history, zoneId, placementDiff(prev, draft));
      }
      set({ zones, history });
      markDirty(zoneId);
    },

    updateLevel: (recipe, opts) => {
      const { currentZoneId, currentLevelId } = get();
      if (!currentZoneId || !currentLevelId) return;
      get().updateZone(
        currentZoneId,
        (zone) => {
          const level = zone.levels.find((l) => l.id === currentLevelId);
          if (level) recipe(level, zone);
        },
        opts,
      );
    },

    addElement: (el) => {
      get().updateLevel((level) => {
        level.elements.push(el);
      });
      set({ selection: [{ kind: 'element', id: el.id }] });
    },

    updateElement: (id, patch, opts) => {
      get().updateLevel((level) => {
        const i = level.elements.findIndex((e) => e.id === id);
        if (i >= 0) level.elements[i] = { ...level.elements[i]!, ...patch } as SceneElement;
      }, opts);
    },

    addWall: (wall) => {
      get().updateLevel((level) => {
        level.walls.push(wall);
      });
    },

    addLight: (light) => {
      get().updateLevel((level) => {
        level.lights.push(light);
      });
      set({ selection: [{ kind: 'light', id: light.id }] });
    },

    addFogRegion: (fog) => {
      get().updateLevel((level) => {
        level.fogRegions.push(fog);
      });
    },

    deleteSelection: () => {
      const sel = get().selection;
      if (sel.length === 0) return;
      const ids = new Set(sel.map((s) => s.id));
      get().updateLevel((level) => {
        level.elements = level.elements.filter((e) => !ids.has(e.id));
        level.walls = level.walls.filter((w) => !ids.has(w.id));
        level.lights = level.lights.filter((l) => !ids.has(l.id));
        level.fogRegions = level.fogRegions.filter((f) => !ids.has(f.id));
      });
      set({ selection: [] });
    },

    duplicateSelection: () => {
      const sel = get().selection.filter((s) => s.kind === 'element');
      if (sel.length === 0) return;
      const ids = new Set(sel.map((s) => s.id));
      const newSel: SelectionItem[] = [];
      get().updateLevel((level) => {
        for (const el of level.elements.filter((e) => ids.has(e.id))) {
          const copy = { ...structuredClone(el), id: `el_${Math.random().toString(36).slice(2, 12)}`, x: el.x + 30, y: el.y + 30 };
          level.elements.push(copy);
          newSel.push({ kind: 'element', id: copy.id });
        }
      });
      set({ selection: newSel });
    },

    undo: () => {
      const { currentZoneId, history, zones } = get();
      if (!currentZoneId) return;
      const h = history[currentZoneId];
      if (!h || h.past.length === 0) return;
      const prev = h.past[h.past.length - 1]!;
      const current = zones.find((z) => z.id === currentZoneId)!;
      set({
        zones: zones.map((z) => (z.id === currentZoneId ? prev : z)),
        history: { ...history, [currentZoneId]: { past: h.past.slice(0, -1), future: [current, ...h.future], lastKey: null, lastAt: 0 } },
        selection: [],
      });
      if (!prev.levels.some((l) => l.id === get().currentLevelId)) set({ currentLevelId: prev.defaultLevelId });
      markDirty(currentZoneId);
    },

    redo: () => {
      const { currentZoneId, history, zones } = get();
      if (!currentZoneId) return;
      const h = history[currentZoneId];
      if (!h || h.future.length === 0) return;
      const next = h.future[0]!;
      const current = zones.find((z) => z.id === currentZoneId)!;
      set({
        zones: zones.map((z) => (z.id === currentZoneId ? next : z)),
        history: { ...history, [currentZoneId]: { past: [...h.past, current], future: h.future.slice(1), lastKey: null, lastAt: 0 } },
        selection: [],
      });
      if (!next.levels.some((l) => l.id === get().currentLevelId)) set({ currentLevelId: next.defaultLevelId });
      markDirty(currentZoneId);
    },

    canUndo: () => {
      const { currentZoneId, history } = get();
      return !!currentZoneId && (history[currentZoneId]?.past.length ?? 0) > 0;
    },
    canRedo: () => {
      const { currentZoneId, history } = get();
      return !!currentZoneId && (history[currentZoneId]?.future.length ?? 0) > 0;
    },

    saveNow: () => {
      if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
      const run = saveChain.then(flushZones);
      saveChain = run.catch(() => undefined);
      return run;
    },

    createZone: async (opts) => {
      const { campaignId } = get();
      if (!campaignId) return null;
      await get().saveNow();
      const zones = get().zones;
      const parent = opts?.parentZoneId ? zones.find((z) => z.id === opts.parentZoneId) : null;
      const zone = await api.campaigns.createZone(campaignId, {
        name: opts?.name ?? (parent ? `Sub-zona de ${parent.name}` : `Zona ${zones.length + 1}`),
        parentZoneId: opts?.parentZoneId ?? null,
        // A template keeps its own type (the server makes it a sub-zone when it has a parent).
        ...(opts?.templateEntryId ? { templateEntryId: opts.templateEntryId } : { zoneType: parent ? 'subzone' : 'exterior' }),
      });
      await get().refreshZones();
      get().selectZone(zone.id);
      return zone;
    },

    duplicateZone: async (zoneId) => {
      await get().saveNow();
      const copy = await api.zones.duplicate(zoneId);
      await get().refreshZones();
      get().selectZone(copy.id);
    },

    deleteZone: async (zoneId) => {
      await get().saveNow();
      await api.zones.remove(zoneId);
      const remaining = get().zones.filter((z) => z.id !== zoneId && z.parentZoneId !== zoneId);
      set({ zones: remaining });
      await get().refreshZones();
      const cur = get().currentZoneId;
      if (!cur || !get().zones.some((z) => z.id === cur)) {
        const first = get().zones[0];
        set({ currentZoneId: first?.id ?? null, currentLevelId: first?.defaultLevelId ?? null, selection: [] });
      }
      // The server dropped the overview pins of the deleted zones and the spawn inside them: mirror it, then reload.
      const live = new Set(get().zones.map((z) => z.id));
      pendingCampaignPatch = withoutMissingZones(pendingCampaignPatch, live);
      inFlightCampaignPatch = withoutMissingZones(inFlightCampaignPatch, live);
      const campaign = get().campaign;
      if (campaign) set({ campaign: withoutMissingZones(campaign, live) });
      await syncCampaign().catch((err: unknown) => console.warn('[editor] No se pudo recargar la campaña:', err));
    },

    reorderZones: async (zoneIds) => {
      const { campaignId } = get();
      if (!campaignId) return;
      set((s) => {
        let history = s.history;
        const zones = s.zones.map((z) => {
          const order = zoneIds.indexOf(z.id);
          if (order < 0 || order === z.order) return z;
          history = carryIntoHistory(history, z.id, { order });
          return { ...z, order };
        });
        return { zones: sortZones(zones), history };
      });
      await api.campaigns.reorderZones(campaignId, zoneIds);
    },

    refreshZones: async () => {
      const { campaignId } = get();
      if (!campaignId) return;
      const fresh = sortZones(await api.campaigns.zones(campaignId));
      if (get().campaignId !== campaignId) return;
      set((s) => {
        const local = new Map(s.zones.map((z) => [z.id, z]));
        let history = s.history;
        const zones = fresh.map((server) => {
          const mine = local.get(server.id);
          if (!mine) return server;
          let next = server;
          if (s.dirtyZoneIds.includes(server.id)) {
            // Unsaved local edits win, except for links the server changed in directions not edited here.
            const known = savedNeighbors.get(server.id);
            const neighbors = { ...mine.neighbors };
            for (const dir of NEIGHBOR_DIRS) if (known && mine.neighbors[dir] === known[dir]) neighbors[dir] = server.neighbors[dir];
            next = { ...mine, neighbors, order: server.order };
          }
          history = carryIntoHistory(history, server.id, placementDiff(mine, next));
          return next;
        });
        return { zones, history };
      });
      rememberNeighbors(fresh);
    },

    updateCampaign: (patch) => {
      const { campaign } = get();
      if (!campaign) return Promise.resolve(false);
      set({ campaign: { ...campaign, ...patch } as Campaign });
      pendingCampaignPatch = { ...pendingCampaignPatch, ...patch };
      if (campaignSaveTimer) clearTimeout(campaignSaveTimer);
      campaignSaveTimer = setTimeout(() => void flushCampaign(campaign.id), 600);
      return new Promise<boolean>((resolve) => {
        campaignSaveWaiters.push(resolve);
      });
    },
  };
});

/** Current zone + level selectors. */
export function useCurrentEditorZone(): { zone: Zone | null; level: ZoneLevel | null } {
  const zone = useEditorStore((s) => s.zones.find((z) => z.id === s.currentZoneId) ?? null);
  const levelId = useEditorStore((s) => s.currentLevelId);
  const level = zone?.levels.find((l) => l.id === levelId) ?? zone?.levels[0] ?? null;
  return { zone, level };
}
