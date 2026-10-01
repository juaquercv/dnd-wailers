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
import { api } from '../../api/http';

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
  saveState: SaveState;
  saveError: string | null;

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

  /** Flush pending saves now. */
  saveNow: () => Promise<void>;

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
/** Zone saves run one after another: a save requested while another is in flight waits for it. */
let saveChain: Promise<void> = Promise.resolve();
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

  const flushZones = async (): Promise<void> => {
    const ids = get().dirtyZoneIds;
    if (ids.length === 0) return;
    set({ saveState: 'saving', saveError: null, dirtyZoneIds: [] });
    let neighborsTouched = false;
    try {
      for (const id of ids) {
        const zone = get().zones.find((z) => z.id === id);
        if (!zone) continue;
        const body = zoneSaveBody(zone);
        // Neighbor edits are made reciprocal server-side, so other zones change too.
        if (body.neighbors) neighborsTouched = true;
        // The server's zone schema accepts partial neighbors (merged with the stored ones).
        const saved = await api.zones.update(id, body as ZoneInput);
        savedNeighbors.set(id, { ...saved.neighbors });
        set((s) => ({
          zones: s.zones.map((z) => (z.id === id && !s.dirtyZoneIds.includes(id) ? { ...z, neighbors: saved.neighbors, updatedAt: saved.updatedAt } : z)),
        }));
      }
      if (neighborsTouched) await get().refreshZones();
      // A removed level (e.g. an undone "new level") makes the server move the spawn that was on it.
      const spawn = get().campaign?.spawn;
      const spawnZone = spawn && ids.includes(spawn.zoneId) ? get().zones.find((z) => z.id === spawn.zoneId) : undefined;
      if (spawn && spawnZone && !spawnZone.levels.some((l) => l.id === spawn.levelId)) {
        await syncCampaign().catch((err: unknown) => console.warn('[editor] No se pudo recargar la campaña:', err));
      }
      set((s) => ({ saveState: s.dirtyZoneIds.length ? 'dirty' : 'saved' }));
    } catch (err) {
      set((s) => ({
        saveState: 'error',
        saveError: err instanceof Error ? err.message : String(err),
        dirtyZoneIds: Array.from(new Set([...s.dirtyZoneIds, ...ids])),
      }));
    }
  };

  const flushCampaign = async (campaignId: string): Promise<void> => {
    campaignSaveTimer = null;
    const body = pendingCampaignPatch;
    const waiters = campaignSaveWaiters;
    pendingCampaignPatch = {};
    campaignSaveWaiters = [];
    inFlightCampaignPatch = { ...inFlightCampaignPatch, ...body };
    campaignFlushes += 1;
    const settle = () => {
      campaignFlushes -= 1;
      if (campaignFlushes === 0) inFlightCampaignPatch = {};
    };
    let ok = true;
    try {
      // A spawn on a just-created level or zone needs that zone on the server first.
      if (body.spawn) await get().saveNow();
      const saved = await api.campaigns.update(campaignId, body);
      settle();
      // Patches made while the request was in flight stay on top until their own save.
      if (get().campaignId === campaignId) {
        set({ campaign: { ...saved, ...inFlightCampaignPatch, ...pendingCampaignPatch } as Campaign });
      }
    } catch (err) {
      settle();
      ok = false;
      set({ saveState: 'error', saveError: err instanceof Error ? err.message : String(err) });
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

    load: async (campaignId) => {
      set({ loading: true, loadError: null, campaignId, history: {}, dirtyZoneIds: [], selection: [] });
      try {
        const [campaign, zones] = await Promise.all([api.campaigns.get(campaignId), api.campaigns.zones(campaignId)]);
        const sorted = sortZones(zones);
        rememberNeighbors(sorted);
        const first = sorted[0] ?? null;
        set({
          campaign,
          zones: sorted,
          loading: false,
          currentZoneId: first?.id ?? null,
          currentLevelId: first?.defaultLevelId ?? null,
          saveState: 'saved',
        });
      } catch (err) {
        set({ loading: false, loadError: err instanceof Error ? err.message : String(err) });
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
