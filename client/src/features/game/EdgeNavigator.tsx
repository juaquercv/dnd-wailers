import { useState } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, type LucideIcon } from 'lucide-react';
import { isOwnHeroToken, type Point, type Token } from '@wailers/shared';
import { toast } from '../../components/ui/toast';
import { useDisplayState, useSessionStore } from '../../stores/session';
import { goToZone, send, sendMany } from './map/actions';
import { distanceToEdge, findFreeSpots, mirroredEdgePoint, placeToken, type EdgeDirection } from './map/geometry';
import { useGameUi } from './map/gameUi';
import { findLevel } from './map/zoneTree';

const EDGES: { dir: EdgeDirection; icon: LucideIcon; className: string }[] = [
  { dir: 'up', icon: ArrowUp, className: 'left-1/2 top-3 -translate-x-1/2' },
  { dir: 'right', icon: ArrowRight, className: 'right-3 top-1/2 -translate-y-1/2 flex-row-reverse' },
  { dir: 'down', icon: ArrowDown, className: 'bottom-3 left-1/2 -translate-x-1/2' },
  { dir: 'left', icon: ArrowLeft, className: 'left-3 top-1/2 -translate-y-1/2' },
];

const NEAR_EDGE_CELLS = 2;

/**
 * Arrows on the viewport edges towards the neighbor zones of the current one.
 * DM: moves the selection (or every hero on this level) to the mirrored edge of the neighbor and follows them.
 * Player: appears when the own token is near that edge and moving is allowed.
 */
export function EdgeNavigator() {
  const role = useSessionStore((s) => s.view?.role ?? null);
  const meUserId = useSessionStore((s) => s.view?.meUserId ?? null);
  const zonesById = useSessionStore((s) => s.zonesById);
  const viewZone = useSessionStore((s) => s.viewZone);
  const selectedIds = useSessionStore((s) => s.selectedTokenIds);
  const casting = useGameUi((s) => s.cast !== null);
  const { state, effective } = useDisplayState();
  const [busy, setBusy] = useState<EdgeDirection | null>(null);

  const zone = viewZone ? zonesById[viewZone.zoneId] ?? null : null;
  const level = findLevel(zone, viewZone?.levelId);
  if (!zone || !level || !state || !effective || !meUserId || casting) return null;
  const isDm = role === 'dm';
  const cell = level.grid.size > 0 ? level.grid.size : 70;

  const ownTokens = isDm
    ? []
    : Object.values(state.tokens).filter(
        (t) => t.zoneId === zone.id && t.levelId === level.id && isOwnHeroToken(state, t, meUserId),
      );

  const dmTokensToMove = (): Token[] => {
    const full = useSessionStore.getState().view?.state ?? state;
    const onLevel = (t: Token) => t.zoneId === zone.id && t.levelId === level.id;
    const selected = selectedIds.map((id) => full.tokens[id]).filter((t): t is Token => !!t && onLevel(t));
    if (selected.length > 0) return selected;
    return Object.values(full.tokens).filter((t) => t.kind === 'hero' && onLevel(t));
  };

  const travelDm = async (dir: EdgeDirection, neighborId: string) => {
    const neighbor = zonesById[neighborId];
    const target = findLevel(neighbor, neighbor?.defaultLevelId);
    if (!neighbor || !target) return;
    const tokens = dmTokensToMove();
    if (tokens.length === 0) {
      goToZone(neighbor.id, target.id);
      return;
    }
    const full = useSessionStore.getState().view?.state ?? state;
    const moving = new Set(tokens.map((t) => t.id));
    const occupied: Point[] = Object.values(full.tokens)
      .filter((t) => t.zoneId === neighbor.id && t.levelId === target.id && !moving.has(t.id))
      .map((t) => ({ x: t.x, y: t.y }));
    const spots = tokens.map((t) => {
      const wanted = placeToken(mirroredEdgePoint(t, dir, level, target), t.cells, target);
      const spot = findFreeSpots(wanted, 1, target, occupied)[0] ?? wanted;
      occupied.push(spot);
      return spot;
    });
    setBusy(dir);
    const ok = await sendMany(
      'token:transfer',
      tokens.map((t, i) => ({ tokenIds: [t.id], zoneId: neighbor.id, levelId: target.id, x: spots[i]!.x, y: spots[i]!.y })),
      'No se pudo viajar a la zona vecina',
    );
    setBusy(null);
    if (ok === 0) return;
    const cx = spots.reduce((sum, p) => sum + p.x, 0) / spots.length;
    const cy = spots.reduce((sum, p) => sum + p.y, 0) / spots.length;
    goToZone(neighbor.id, target.id, { x: cx, y: cy });
    toast.success(`${tokens.length === 1 ? tokens[0]!.name : `${ok} fichas`} → ${neighbor.name}`);
  };

  const travelPlayer = async (dir: EdgeDirection, neighborId: string, token: Token) => {
    const neighbor = zonesById[neighborId];
    const target = findLevel(neighbor, neighbor?.defaultLevelId);
    setBusy(dir);
    if (neighbor && target) {
      const p = placeToken(mirroredEdgePoint(token, dir, level, target), token.cells, target);
      await send('token:transfer', { tokenIds: [token.id], zoneId: neighbor.id, levelId: target.id, x: p.x, y: p.y }, 'No puedes salir por aquí');
    } else {
      // The neighbor zone is not known to this player yet: the server picks its default level and position.
      await send('token:transfer', { tokenIds: [token.id], zoneId: neighborId, levelId: '' }, 'No puedes salir por aquí');
    }
    setBusy(null);
  };

  const arrows = EDGES.flatMap(({ dir, icon: Icon, className }) => {
    const neighborId = zone.neighbors[dir];
    if (!neighborId || neighborId === zone.id) return [];
    const neighbor = zonesById[neighborId] ?? null;
    if (isDm) {
      if (!neighbor) return [];
      const count = dmTokensToMove().length;
      const title =
        count > 0
          ? `Mover ${count === 1 ? '1 ficha' : `${count} fichas`} a ${neighbor.name}`
          : `Ver ${neighbor.name} (no hay héroes en este nivel)`;
      return [{ dir, Icon, className, label: neighbor.name, title, emphasis: false, run: () => void travelDm(dir, neighborId) }];
    }
    if (!effective.canMoveOwnToken) return [];
    const near = ownTokens.find((t) => distanceToEdge(t, dir, level) <= NEAR_EDGE_CELLS * cell);
    if (!near) return [];
    const name = neighbor?.name ?? 'Zona contigua';
    return [{ dir, Icon, className, label: name, title: `Viajar a ${name}`, emphasis: true, run: () => void travelPlayer(dir, neighborId, near) }];
  });

  if (arrows.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {arrows.map((a) => (
        <button
          key={a.dir}
          type="button"
          title={a.title}
          disabled={busy !== null}
          onClick={a.run}
          className={clsx(
            'group pointer-events-auto absolute flex max-w-[16rem] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-panel backdrop-blur transition disabled:opacity-60',
            a.emphasis
              ? 'animate-pop border-gold-500/80 bg-ink-900/90 text-gold-200 shadow-glow-gold hover:bg-ink-800'
              : 'border-gold-700/40 bg-ink-900/70 text-parchment-200 opacity-80 hover:border-gold-500 hover:bg-ink-800 hover:text-gold-200 hover:opacity-100',
            a.className,
          )}
        >
          <a.Icon
            className={clsx(
              'h-3.5 w-3.5 shrink-0 text-gold-400 transition-transform',
              a.dir === 'up' && 'group-hover:-translate-y-0.5',
              a.dir === 'down' && 'group-hover:translate-y-0.5',
              a.dir === 'left' && 'group-hover:-translate-x-0.5',
              a.dir === 'right' && 'group-hover:translate-x-0.5',
            )}
            aria-hidden
          />
          <span className="truncate font-display tracking-wide">{a.label}</span>
        </button>
      ))}
    </div>
  );
}
