import { create } from 'zustand';

/** User preferences, persisted in localStorage per claimed user (browser-wide copy before choosing a user). */
export interface Volumes {
  master: number;
  music: number;
  ambience: number;
  effects: number;
  ui: number;
}

export type VolumeChannel = keyof Volumes;
export type LibraryView = 'grid' | 'list';

export interface SettingsData {
  volumes: Volumes;
  muted: boolean;
  libraryView: LibraryView;
  reducedMotion: boolean;
  showGridLabels: boolean;
}

interface SettingsState extends SettingsData {
  setVolume: (channel: VolumeChannel, value: number) => void;
  setVolumes: (patch: Partial<Volumes>) => void;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  setLibraryView: (view: LibraryView) => void;
  setReducedMotion: (value: boolean) => void;
  setShowGridLabels: (value: boolean) => void;
  reset: () => void;
}

const STORAGE_KEY = 'wailers.settings';
/** Key in use: `wailers.settings.<userId>` once a user is claimed, so users sharing a browser keep their own volumes. */
let storageKey = STORAGE_KEY;

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function defaults(): SettingsData {
  return {
    volumes: { master: 0.8, music: 0.6, ambience: 0.6, effects: 0.8, ui: 0.5 },
    muted: false,
    libraryView: 'grid',
    reducedMotion: prefersReducedMotion(),
    showGridLabels: false,
  };
}

function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

function load(): SettingsData {
  const base = defaults();
  try {
    // A user without own preferences yet starts from this browser's shared ones.
    const raw = localStorage.getItem(storageKey) ?? (storageKey !== STORAGE_KEY ? localStorage.getItem(STORAGE_KEY) : null);
    if (!raw) return base;
    const p: unknown = JSON.parse(raw);
    if (!p || typeof p !== 'object') return base;
    const o = p as Partial<Record<keyof SettingsData, unknown>>;
    const vol = (o.volumes && typeof o.volumes === 'object' ? o.volumes : {}) as Partial<Record<VolumeChannel, unknown>>;
    return {
      volumes: {
        master: clamp01(vol.master, base.volumes.master),
        music: clamp01(vol.music, base.volumes.music),
        ambience: clamp01(vol.ambience, base.volumes.ambience),
        effects: clamp01(vol.effects, base.volumes.effects),
        ui: clamp01(vol.ui, base.volumes.ui),
      },
      muted: typeof o.muted === 'boolean' ? o.muted : base.muted,
      libraryView: o.libraryView === 'list' || o.libraryView === 'grid' ? o.libraryView : base.libraryView,
      reducedMotion: typeof o.reducedMotion === 'boolean' ? o.reducedMotion : base.reducedMotion,
      showGridLabels: typeof o.showGridLabels === 'boolean' ? o.showGridLabels : base.showGridLabels,
    };
  } catch {
    return base;
  }
}

function save(data: SettingsData): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
  } catch {
    /* storage full or unavailable: preferences stay in memory */
  }
}

function pick(s: SettingsState): SettingsData {
  return {
    volumes: s.volumes,
    muted: s.muted,
    libraryView: s.libraryView,
    reducedMotion: s.reducedMotion,
    showGridLabels: s.showGridLabels,
  };
}

function applyReducedMotion(value: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('reduce-motion', value);
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...load(),
  setVolume: (channel, value) => set((s) => ({ volumes: { ...s.volumes, [channel]: clamp01(value, s.volumes[channel]) } })),
  setVolumes: (patch) =>
    set((s) => {
      const next = { ...s.volumes };
      for (const [k, v] of Object.entries(patch) as [VolumeChannel, number][]) next[k] = clamp01(v, s.volumes[k]);
      return { volumes: next };
    }),
  setMuted: (muted) => set({ muted }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setLibraryView: (libraryView) => set({ libraryView }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setShowGridLabels: (showGridLabels) => set({ showGridLabels }),
  reset: () => set(defaults()),
}));

// Persist + side effects.
applyReducedMotion(useSettingsStore.getState().reducedMotion);
useSettingsStore.subscribe((state, prev) => {
  save(pick(state));
  if (state.reducedMotion !== prev.reducedMotion) applyReducedMotion(state.reducedMotion);
});

/** Switch to the preferences of the claimed user (null = browser-wide ones). Called by the auth store. */
export function setSettingsUser(userId: string | null): void {
  const key = userId ? `${STORAGE_KEY}.${userId}` : STORAGE_KEY;
  if (key === storageKey) return;
  storageKey = key;
  useSettingsStore.setState(load());
}

// Keep tabs of the same user in sync.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === storageKey) useSettingsStore.setState(load());
  });
}

/**
 * Final 0..1 volume for a channel: 0 when muted, otherwise master × channel.
 * (The DM's session master volume is applied on top by the audio feature.)
 */
export function getEffectiveVolume(channel: Exclude<VolumeChannel, 'master'>): number {
  const s = useSettingsStore.getState();
  if (s.muted) return 0;
  return s.volumes.master * s.volumes[channel];
}

export function useEffectiveVolume(channel: Exclude<VolumeChannel, 'master'>): number {
  return useSettingsStore((s) => (s.muted ? 0 : s.volumes.master * s.volumes[channel]));
}

export function useSettings(): SettingsState {
  return useSettingsStore();
}
