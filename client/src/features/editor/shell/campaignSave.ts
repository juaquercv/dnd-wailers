import { create } from 'zustand';
import type { Campaign, UpdateCampaignRequest } from '@wailers/shared';
import { useEditorStore } from '../editorStore';

/**
 * Thin wrapper around editorStore.updateCampaign that tracks whether a (debounced) campaign
 * save is still pending, so the save indicator can show "Guardando…" for campaign edits too.
 * Every call resolves once the debounced batch holding its patch has been sent (true when saved).
 */
interface CampaignSaveState {
  pending: boolean;
}

export const useCampaignSaveStore = create<CampaignSaveState>(() => ({ pending: false }));

let seq = 0;

export async function saveCampaign(patch: UpdateCampaignRequest): Promise<boolean> {
  const mine = ++seq;
  useCampaignSaveStore.setState({ pending: true });
  try {
    return await useEditorStore.getState().updateCampaign(patch);
  } finally {
    if (mine === seq) useCampaignSaveStore.setState({ pending: false });
  }
}

/** Every editable campaign field (used to re-send the whole campaign after a failed save). */
export function fullCampaignPatch(c: Campaign): UpdateCampaignRequest {
  return {
    name: c.name,
    description: c.description,
    coverUrl: c.coverUrl,
    tags: c.tags,
    rules: c.rules,
    overview: c.overview,
    spawn: c.spawn,
    defaultVisibility: c.defaultVisibility,
  };
}

/** True while anything is unsaved or being saved. */
export function hasUnsavedWork(): boolean {
  const s = useEditorStore.getState();
  return (
    s.dirtyZoneIds.length > 0 ||
    s.saveState === 'dirty' ||
    s.saveState === 'saving' ||
    s.saveState === 'error' ||
    useCampaignSaveStore.getState().pending
  );
}

/** Retry after a save error: flush dirty zones and re-send the campaign. Resolves true on success. */
export async function retrySave(): Promise<boolean> {
  const store = useEditorStore;
  const before = store.getState();
  store.setState({ saveState: before.dirtyZoneIds.length > 0 ? 'dirty' : 'saving', saveError: null });
  if (before.dirtyZoneIds.length > 0) await store.getState().saveNow();
  if (store.getState().saveState === 'error') return false;
  const campaign = store.getState().campaign;
  if (campaign) {
    store.setState({ saveState: 'saving' });
    if (!(await saveCampaign(fullCampaignPatch(campaign)))) return false;
  }
  const after = store.getState();
  if (after.saveState === 'error') return false;
  store.setState({ saveState: after.dirtyZoneIds.length > 0 ? 'dirty' : 'saved', saveError: null });
  return true;
}
