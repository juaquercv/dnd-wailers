import { create } from 'zustand';
import {
  LAYER_IDS,
  type Campaign,
  type LayerId,
  type LightSource,
  type FogRegion,
  type SceneElement,
  type TransitionType,
  type UpdateCampaignRequest,
  type Wall,
  type Zone,
  type ZoneInput,
  type ZoneLevel,
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

  updateCampaign: (patch: UpdateCampaignRequest) => Promise<void>;
}

const HISTORY_LIMIT = 100;
const AUTOSAVE_MS = 800;

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let campaignSaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingCampaignPatch: UpdateCampaignRequest = {};
/** zoneId -> JSON of neighbors as last known on the server. */
const savedNeighbors = new Map<string, string>();

function rememberNeighbors(zones: Zone[]): void {
  for (const z of zones) savedNeighbors.set(z.id, JSON.stringify(z.neighbors));
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

    saveNow: async () => {
      if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
      const ids = get().dirtyZoneIds;
      if (ids.length === 0) return;
      set({ saveState: 'saving', saveError: null, dirtyZoneIds: [] });
      let neighborsTouched = false;
      try {
        for (const id of ids) {
          const zone = get().zones.find((z) => z.id === id);
          if (!zone) continue;
          const neighborsKey = JSON.stringify(zone.neighbors);
          // Neighbor edits are made reciprocal server-side, so other zones change too.
          if (savedNeighbors.get(id) !== neighborsKey) neighborsTouched = true;
          const saved = await api.zones.update(id, zoneToInput(zone));
          savedNeighbors.set(id, JSON.stringify(saved.neighbors));
          set((s) => ({
            zones: s.zones.map((z) => (z.id === id && !s.dirtyZoneIds.includes(id) ? { ...z, neighbors: saved.neighbors, updatedAt: saved.updatedAt } : z)),
          }));
        }
        if (neighborsTouched) await get().refreshZones();
        set((s) => ({ saveState: s.dirtyZoneIds.length ? 'dirty' : 'saved' }));
      } catch (err) {
        set((s) => ({
          saveState: 'error',
          saveError: err instanceof Error ? err.message : String(err),
          dirtyZoneIds: Array.from(new Set([...s.dirtyZoneIds, ...ids])),
        }));
      }
    },

    createZone: async (opts) => {
      const { campaignId, zones } = get();
      if (!campaignId) return null;
      await get().saveNow();
      const parent = opts?.parentZoneId ? zones.find((z) => z.id === opts.parentZoneId) : null;
      const zone = await api.campaigns.createZone(campaignId, {
        name: opts?.name ?? (parent ? `Sub-zona de ${parent.name}` : `Zona ${zones.length + 1}`),
        parentZoneId: opts?.parentZoneId ?? null,
        zoneType: parent ? 'subzone' : 'exterior',
        templateEntryId: opts?.templateEntryId,
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
    },

    reorderZones: async (zoneIds) => {
      const { campaignId } = get();
      if (!campaignId) return;
      set((s) => ({
        zones: sortZones(s.zones.map((z) => ({ ...z, order: zoneIds.indexOf(z.id) >= 0 ? zoneIds.indexOf(z.id) : z.order }))),
      }));
      await api.campaigns.reorderZones(campaignId, zoneIds);
    },

    refreshZones: async () => {
      const { campaignId } = get();
      if (!campaignId) return;
      const fresh = sortZones(await api.campaigns.zones(campaignId));
      rememberNeighbors(fresh);
      set((s) => {
        const local = new Map(s.zones.map((z) => [z.id, z]));
        const zones = fresh.map((z) => (s.dirtyZoneIds.includes(z.id) && local.has(z.id) ? local.get(z.id)! : z));
        return { zones };
      });
    },

    updateCampaign: async (patch) => {
      const { campaign } = get();
      if (!campaign) return;
      set({ campaign: { ...campaign, ...patch } as Campaign });
      pendingCampaignPatch = { ...pendingCampaignPatch, ...patch };
      if (campaignSaveTimer) clearTimeout(campaignSaveTimer);
      await new Promise<void>((resolve) => {
        campaignSaveTimer = setTimeout(async () => {
          const body = pendingCampaignPatch;
          pendingCampaignPatch = {};
          try {
            const saved = await api.campaigns.update(campaign.id, body);
            set({ campaign: saved });
          } catch (err) {
            set({ saveState: 'error', saveError: err instanceof Error ? err.message : String(err) });
          }
          resolve();
        }, 600);
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
