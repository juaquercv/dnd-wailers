import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Eye, Shield, Users, type LucideIcon } from 'lucide-react';
import { isOwnHeroToken, type OverviewMap, type Point, type Token } from '@wailers/shared';
import { useContextMenu, type ContextMenuItem } from '../../components/ui/ContextMenu';
import { toast } from '../../components/ui/toast';
import { useDisplayState, useSessionStore } from '../../stores/session';
import { useHeroEconomy } from './hud/economy';
import { goToZone, send, sendMany } from './map/actions';
import { distanceToEdge, findFreeSpots, mirroredEdgePoint, placeToken, type EdgeDirection } from './map/geometry';
import { useGameUi } from './map/gameUi';
import { freeMoveBlock } from './map/ownEconomy';
import { findLevel } from './map/zoneTree';

const EDGES: { dir: EdgeDirection; icon: LucideIcon; className: string }[] = [
  { dir: 'up', icon: ArrowUp, className: 'left-1/2 top-2 -translate-x-1/2' },
  { dir: 'right', icon: ArrowRight, className: 'right-2 top-1/2 -translate-y-1/2 flex-row-reverse' },
  { dir: 'down', icon: ArrowDown, className: 'bottom-2 left-1/2 -translate-x-1/2' },
  { dir: 'left', icon: ArrowLeft, className: 'left-2 top-1/2 -translate-y-1/2' },
];

const NEAR_EDGE_CELLS = 2;

/**
 * Players only receive the zones they may see, so the neighbor across an edge is usually unknown to them.
 * Its full document is never fetched (it holds DM notes and hidden elements): the arrow takes its label from
 * the overview pin the player may already see, and the server picks the arrival point on the mirrored edge.
 */
function overviewPinLabel(overview: OverviewMap | null, zoneId: string): string | null {
  const pin = overview?.pins.find((p) => p.zoneId === zoneId && !!p.label?.trim());
  return pin?.label?.trim() || null;
}

/**
 * Arrows on the viewport edges towards the neighbor zones of the current one.
 * DM: a compact arrow that opens a menu (move the selection, the whole party, or just look) — a stray click
 * never moves anybody. Player: appears when the own token is near that edge and moving is allowed.
 * The arrows step aside while a token is being dragged so they never get in the way of a drop.
 */
export function EdgeNavigator() {
  const role = useSessionStore((s) => s.view?.role ?? null);
  const meUserId = useSessionStore((s) => s.view?.meUserId ?? null);
  const zonesById = useSessionStore((s) => s.zonesById);
  const viewZone = useSessionStore((s) => s.viewZone);
  const selectedIds = useSessionStore((s) => s.selectedTokenIds);
  const casting = useGameUi((s) => s.cast !== null);
  const dragging = useGameUi((s) => s.tokenDragging);
  const overview = useSessionStore((s) => s.overview);
  const myHeroId = useSessionStore((s) => (s.view?.role === 'player' ? s.view.state.players[s.view.meUserId]?.heroId ?? null : null));
  const economy = useHeroEconomy(myHeroId);
  const { state, effective } = useDisplayState();
  const contextMenu = useContextMenu();
  const [busy, setBusy] = useState<EdgeDirection | null>(null);

  const zone = viewZone ? zonesById[viewZone.zoneId] ?? null : null;
  const level = findLevel(zone, viewZone?.levelId);
  if (!zone || !level || !state || !effective || !meUserId || casting || dragging) return null;
  const isDm = role === 'dm';
  const cell = level.grid.size > 0 ? level.grid.size : 70;

  const ownTokens = isDm
    ? []
    : Object.values(state.tokens).filter(
        (t) => t.zoneId === zone.id && t.levelId === level.id && isOwnHeroToken(state, t, meUserId),
      );

  const fullState = () => useSessionStore.getState().view?.state ?? state;
  const onLevel = (t: Token) => t.zoneId === zone.id && t.levelId === level.id;
  const selectedOnLevel = (): Token[] => {
    const full = fullState();
    return selectedIds.map((id) => full.tokens[id]).filter((t): t is Token => !!t && onLevel(t));
  };
  const heroesOnLevel = (): Token[] => Object.values(fullState().tokens).filter((t) => t.kind === 'hero' && onLevel(t));

  const travelDm = async (dir: EdgeDirection, neighborId: string, tokens: Token[]) => {
    const neighbor = zonesById[neighborId];
    const target = findLevel(neighbor, neighbor?.defaultLevelId);
    if (!neighbor || !target) return;
    if (tokens.length === 0) {
      goToZone(neighbor.id, target.id);
      return;
    }
    const full = fullState();
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

  const openDmMenu = (e: ReactMouseEvent<HTMLButtonElement>, dir: EdgeDirection, neighborId: string) => {
    const neighbor = zonesById[neighborId];
    const target = findLevel(neighbor, neighbor?.defaultLevelId);
    if (!neighbor || !target) return;
    const selection = selectedOnLevel();
    const party = heroesOnLevel();
    const r = e.currentTarget.getBoundingClientRect();
    const items: ContextMenuItem[] = [
      { heading: true, label: `→ ${neighbor.name}` },
      {
        label: selection.length > 0 ? `Mover la selección (${selection.length})` : 'Mover la selección',
        icon: <Users />,
        disabled: selection.length === 0,
        onClick: () => void travelDm(dir, neighborId, selection),
      },
      {
        label: party.length > 0 ? `Mover a todo el grupo (${party.length})` : 'No hay héroes en este nivel',
        icon: <Shield />,
        disabled: party.length === 0,
        onClick: () => void travelDm(dir, neighborId, party),
      },
      { separator: true },
      { label: `Ver ${neighbor.name}`, icon: <Eye />, onClick: () => goToZone(neighbor.id, target.id) },
    ];
    contextMenu.openAt(dir === 'right' ? r.left - 4 : r.left, dir === 'down' ? r.top - 4 : r.bottom + 4, items);
  };

  const travelPlayer = async (dir: EdgeDirection, neighborId: string, token: Token) => {
    setBusy(dir);
    try {
      const neighbor = zonesById[neighborId] ?? null;
      const target = findLevel(neighbor, neighbor?.defaultLevelId);
      if (neighbor && target) {
        const p = placeToken(mirroredEdgePoint(token, dir, level, target), token.cells, target);
        await send('token:transfer', { tokenIds: [token.id], zoneId: neighbor.id, levelId: target.id, x: p.x, y: p.y }, 'No puedes salir por aquí');
        return;
      }
      // Unknown neighbor: an empty level and no point let the server land the token on the mirrored edge.
      await send('token:transfer', { tokenIds: [token.id], zoneId: neighborId, levelId: '' }, 'No puedes salir por aquí');
    } finally {
      setBusy(null);
    }
  };

  // Zone edges are interactions (no movement cost): only the DM's permission and, in combat, the own turn count.
  const playerCanLeave = freeMoveBlock(effective.canMoveOwnToken, economy) === null;

  const arrows = EDGES.flatMap(({ dir, icon: Icon, className }) => {
    const neighborId = zone.neighbors[dir];
    if (!neighborId || neighborId === zone.id) return [];
    const neighbor = zonesById[neighborId] ?? null;
    if (isDm) {
      if (!neighbor) return [];
      return [
        {
          dir,
          Icon,
          className,
          label: neighbor.name,
          title: `${neighbor.name}: mover fichas o ir a ver`,
          emphasis: false,
          run: (e: ReactMouseEvent<HTMLButtonElement>) => openDmMenu(e, dir, neighborId),
        },
      ];
    }
    if (!playerCanLeave) return [];
    // Players leave a zone through its edges only from the zone's main level (server rule).
    if (level.id !== zone.defaultLevelId) return [];
    const near = ownTokens.find((t) => distanceToEdge(t, dir, level) <= NEAR_EDGE_CELLS * cell);
    if (!near) return [];
    const name = neighbor?.name ?? overviewPinLabel(overview, neighborId);
    const label = name ?? 'Zona contigua';
    const title = name ? `Viajar a ${name}` : 'Viajar a la zona contigua';
    return [{ dir, Icon, className, label, title, emphasis: true, run: () => void travelPlayer(dir, neighborId, near) }];
  });

  if (arrows.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {arrows.map((a) => (
        <button
          key={a.dir}
          type="button"
          title={a.title}
          aria-label={a.title}
          disabled={busy !== null}
          onClick={(e) => a.run(e)}
          className={clsx(
            'group pointer-events-auto absolute flex items-center gap-1 rounded-full border shadow-panel backdrop-blur transition disabled:opacity-60',
            a.emphasis
              ? 'max-w-[16rem] animate-pop border-gold-500/80 bg-ink-900/90 px-3 py-1.5 text-xs font-semibold text-gold-200 shadow-glow-gold hover:bg-ink-800'
              : 'max-w-[11rem] border-gold-700/40 bg-ink-900/60 px-2 py-1 text-[11px] text-parchment-300 opacity-70 hover:border-gold-500 hover:bg-ink-800 hover:text-gold-200 hover:opacity-100',
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
