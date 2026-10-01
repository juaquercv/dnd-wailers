import { EyeOff, Flame, Gift, MapPin, Music, PackageOpen, Sparkles, Swords, Volume2, Wind } from 'lucide-react';
import type { EntryKind, LibraryEntry } from '@wailers/shared';
import { toast } from '../../../components/ui/toast';
import { useSessionStore } from '../../../stores/session';
import type { QuickAction } from '../../library/QuickSearch';
import { addToInitiative, request, send, spellFxAt, viewCenterPoint, waitForTokens } from './actions';
import { placeToken } from './geometry';
import { findLevel } from './zoneTree';

function isKind<K extends EntryKind>(entry: LibraryEntry, kind: K): entry is LibraryEntry<K> {
  return entry.kind === kind;
}

/** Center of the DM view snapped to the grid, or null (with a toast) when no map is shown. */
function spawnPoint(): { zoneId: string; levelId: string; x: number; y: number; gridSize: number } | null {
  const center = viewCenterPoint();
  const s = useSessionStore.getState();
  const zone = center ? s.zonesById[center.zoneId] : null;
  const level = findLevel(zone, center?.levelId);
  if (!center || !zone || !level) {
    toast.warning('Abre una zona del mapa para colocar elementos');
    return null;
  }
  const p = placeToken({ x: center.x, y: center.y }, 1, level);
  return { zoneId: zone.id, levelId: level.id, x: p.x, y: p.y, gridSize: level.grid.size };
}

async function spawnAtCenter(entry: LibraryEntry, opts: { hidden?: boolean; dramatic?: boolean; initiative?: boolean } = {}): Promise<void> {
  const at = spawnPoint();
  if (!at) return;
  const ids = await request(
    'token:spawn',
    { entryId: entry.id, zoneId: at.zoneId, levelId: at.levelId, x: at.x, y: at.y, hidden: opts.hidden, dramatic: opts.dramatic },
    'No se pudo colocar en el mapa',
  );
  if (!ids || ids.length === 0) return;
  if (opts.hidden) toast.success(`${entry.name} aparece oculto a los jugadores`);
  else if (!opts.dramatic) toast.success(`${entry.name} aparece en el mapa`);
  useSessionStore.getState().selectTokens(ids);
  if (opts.initiative) {
    const tokens = await waitForTokens(ids);
    if (tokens.length > 0) await addToInitiative(tokens);
  }
}

/** Party heroes (heroes chosen by the session players). */
function partyHeroes(): { heroId: string; name: string }[] {
  const state = useSessionStore.getState().view?.state;
  if (!state) return [];
  const out: { heroId: string; name: string }[] = [];
  for (const p of Object.values(state.players)) {
    if (!p.heroId) continue;
    const hero = state.heroes[p.heroId];
    if (hero) out.push({ heroId: hero.id, name: hero.name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * DM quick actions for a library entry (Ctrl+K palette and the library tab).
 * Everything is an explicit DM action: nothing is applied automatically.
 */
export function buildQuickActions(entry: LibraryEntry): QuickAction[] {
  if (isKind(entry, 'creature')) {
    return [
      { id: 'spawn', label: 'Colocar en el centro de la vista', icon: <MapPin />, run: () => void spawnAtCenter(entry) },
      { id: 'spawn-hidden', label: 'Colocar oculto', icon: <EyeOff />, run: () => void spawnAtCenter(entry, { hidden: true }) },
      { id: 'spawn-dramatic', label: 'Aparición dramática', icon: <Flame />, run: () => void spawnAtCenter(entry, { dramatic: true }) },
      {
        id: 'spawn-initiative',
        label: 'Colocar y añadir a la iniciativa',
        icon: <Swords />,
        run: () => void spawnAtCenter(entry, { initiative: true }),
      },
    ];
  }
  if (isKind(entry, 'item')) {
    const give: QuickAction[] = partyHeroes().map((h) => ({
      id: `give-${h.heroId}`,
      label: `Entregar a ${h.name}`,
      icon: <Gift />,
      run: () => {
        void send('inventory:add', { heroId: h.heroId, entryId: entry.id, quantity: 1 }, 'No se pudo entregar el objeto').then((ok) => {
          if (ok) toast.success(`${h.name} recibe ${entry.name}`);
        });
      },
    }));
    return [
      ...give,
      { id: 'drop', label: 'Soltar en el mapa', icon: <PackageOpen />, run: () => void spawnAtCenter(entry) },
    ];
  }
  if (isKind(entry, 'sound')) {
    const type = entry.data.soundType;
    if (type === 'music' || type === 'ambience') {
      const channel = type;
      return [
        {
          id: `play-${channel}`,
          label: channel === 'music' ? 'Poner como música' : 'Poner como ambiente',
          icon: channel === 'music' ? <Music /> : <Wind />,
          run: () => {
            void send('audio:play', { channel, soundId: entry.id }, 'No se pudo reproducir').then((ok) => {
              if (ok) toast.success(`${channel === 'music' ? 'Música' : 'Ambiente'}: ${entry.name}`);
            });
          },
        },
      ];
    }
    return [
      {
        id: 'sfx',
        label: 'Reproducir efecto',
        icon: <Volume2 />,
        run: () => void send('audio:sfx', { soundId: entry.id }, 'No se pudo reproducir el efecto'),
      },
    ];
  }
  if (isKind(entry, 'spell')) {
    return [
      {
        id: 'spell-fx',
        label: 'Animación en el centro',
        icon: <Sparkles />,
        run: () => {
          const at = spawnPoint();
          if (!at) return;
          void spellFxAt(entry.data.animation, at, entry.name, at.gridSize);
        },
      },
    ];
  }
  return [];
}
