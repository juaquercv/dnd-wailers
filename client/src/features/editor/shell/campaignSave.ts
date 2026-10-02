import { create } from 'zustand';
import type { UpdateCampaignRequest } from '@wailers/shared';
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

/** True while a zone or campaign save failed and its changes are still unsaved. */
export function hasSaveError(): boolean {
  const s = useEditorStore.getState();
  return s.saveState === 'error' || s.campaignSaveError !== null;
}

/** Message of the current save error (zones first, then campaign), or null. */
export function currentSaveError(): string | null {
  const s = useEditorStore.getState();
  return s.saveState === 'error' ? s.saveError : s.campaignSaveError;
}

/** True while anything is unsaved or being saved (including campaign fields kept from a failed save). */
export function hasUnsavedWork(): boolean {
  const s = useEditorStore.getState();
  return (
    s.dirtyZoneIds.length > 0 ||
    s.saveState === 'dirty' ||
    s.saveState === 'saving' ||
    hasSaveError() ||
    useCampaignSaveStore.getState().pending
  );
}

/**
 * Retry after a save error: flush the dirty zones, then send again the campaign fields kept from a failed
 * save. Resolves true when everything is saved.
 */
export async function retrySave(): Promise<boolean> {
  const store = useEditorStore;
  if (!(await store.getState().saveNow())) return false;
  // Every dirty zone was just saved: a zone error left over from before is stale.
  const zones = store.getState();
  if (zones.saveState === 'error') store.setState({ saveState: zones.dirtyZoneIds.length > 0 ? 'dirty' : 'saved', saveError: null });
  // An empty patch sends the kept fields (the store merges them into every campaign save).
  if (store.getState().campaignSaveError !== null && !(await saveCampaign({}))) return false;
  return !hasSaveError();
}
