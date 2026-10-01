import { useMemo } from 'react';
import type { Zone } from '@wailers/shared';
import { toast, useConfirm } from '../../../components/ui';
import { plural } from '../../../lib/format';
import { useEditorStore } from '../editorStore';
import { descendantIds } from './zoneTree';

export interface ZoneActions {
  createBlank: (parentZoneId?: string | null) => Promise<Zone | null>;
  duplicate: (zone: Zone) => Promise<void>;
  remove: (zone: Zone) => Promise<boolean>;
  rename: (zone: Zone, name: string) => void;
}

/** Zone-level commands with confirmation and feedback toasts (shared by the slides panel and the page). */
export function useZoneActions(): ZoneActions {
  const confirm = useConfirm();
  return useMemo<ZoneActions>(
    () => ({
      createBlank: async (parentZoneId = null) => {
        try {
          const zone = await useEditorStore.getState().createZone({ parentZoneId });
          if (zone) toast.success(parentZoneId ? `Sub-zona «${zone.name}» creada` : `Zona «${zone.name}» creada`);
          return zone;
        } catch (err) {
          toast.fromError(err, 'No se pudo crear la zona');
          return null;
        }
      },

      duplicate: async (zone) => {
        try {
          await useEditorStore.getState().duplicateZone(zone.id);
          toast.success(`«${zone.name}» duplicada`);
        } catch (err) {
          toast.fromError(err, 'No se pudo duplicar la zona');
        }
      },

      remove: async (zone) => {
        const state = useEditorStore.getState();
        const subs = descendantIds(state.zones, zone.id);
        const ok = await confirm({
          title: 'Eliminar zona',
          message:
            subs.size > 0
              ? `Se eliminará «${zone.name}» y también ${subs.size === 1 ? 'su sub-zona' : `sus ${plural(subs.size, 'sub-zona', 'sub-zonas')}`}, con todos sus niveles. No se puede deshacer.`
              : `Se eliminará «${zone.name}» con todos sus niveles. No se puede deshacer.`,
          confirmLabel: 'Eliminar zona',
          danger: true,
        });
        if (!ok) return false;
        try {
          const spawn = useEditorStore.getState().campaign?.spawn;
          // The server also removes the zone's overview pins and the spawn inside it; the store reloads the campaign.
          await state.deleteZone(zone.id);
          if (spawn && (spawn.zoneId === zone.id || subs.has(spawn.zoneId))) {
            toast.info('El punto de aparición estaba en la zona eliminada: colócalo de nuevo con la herramienta «Punto de aparición» (S).');
          }
          toast.success(`Zona «${zone.name}» eliminada`);
          return true;
        } catch (err) {
          toast.fromError(err, 'No se pudo eliminar la zona');
          return false;
        }
      },

      rename: (zone, name) => {
        useEditorStore.getState().updateZone(zone.id, (d) => {
          d.name = name;
        });
      },
    }),
    [confirm],
  );
}
