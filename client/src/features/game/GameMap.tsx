import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import clsx from 'clsx';
import type Konva from 'konva';
import { DoorOpen, Eye, EyeOff, LocateFixed, Map as MapIcon, Maximize, Move, Radar, Shield, Users } from 'lucide-react';
import {
  allowedZoneIds,
  decodeExplored,
  emptyZoneLiveState,
  filterZoneForPlayer,
  isOwnHeroToken,
  LAYER_IDS,
  markExplored,
  pointInAnyPolygon,
  pointInPolygon,
  tokenHp,
  visibleAreas,
  type LayerId,
  type LightingPreset,
  type LiveState,
  type Point,
  type SceneElementType,
  type SessionZone,
  type Token,
  type TransitionElement,
  type VisibilitySettings,
  type Wall,
  type ZoneLevel,
  type ZoneLiveState,
} from '@wailers/shared';
import { emitQuiet } from '../../api/socket';
import { useContextMenu, type ContextMenuItem } from '../../components/ui/ContextMenu';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { toast } from '../../components/ui/toast';
import { DND_ITEM, hasDragType, peekEntryDrag, peekItemDrag, readEntryDrag, readItemDrag } from '../../lib/dnd';
import { emitUiEvent, useUiEvent } from '../../lib/uiEvents';
import {
  CombinedLayer,
  FogRegionsLayer,
  GridLayer,
  LevelBackground,
  LevelStack,
  LightingOverlay,
  MAP_COLORS,
  MapStage,
  PingLayer,
  SceneElementsLayer,
  TRANSITION_STYLES,
  VisionMask,
  WallsLayer,
  type HpBarMode,
  type MapMouseEvent,
  type MapPoint,
  type MapStageHandle,
  type TokenHpInfo,
  type TokenLight,
} from '../../map';
import { useDisplayState, useSessionStore } from '../../stores/session';
import { MapFxLayer } from '../fx/MapFxLayer';
import { api } from '../../api/http';
import { useTokenContextMenu } from './TokenContextMenu';
import { goToZone, request, send, sendMany, spellFxAt, transferTokens } from './map/actions';
import { gameCamera, useGameCamera } from './map/camera';
import { unrevealedFogPolygons } from './map/fog';
import { facingTowards, findFreeSpots, placeToken, pointInTransition, tokenAtPoint } from './map/geometry';
import { useGameUi } from './map/gameUi';
import { MarqueeRect, SPELL_COLORS, StageTapBinder, TargetReticle, type MarqueeBox } from './map/Indicators';
import { MapToolbar } from './map/MapToolbar';
import { buildQuickActions } from './map/quickActions';
import { TokensGroup, type TokenHandlers, type TokenPointerEvent, type TokenView } from './map/TokensGroup';
import { TransitionHotspots, type TransitionPointerEvent } from './map/TransitionHotspots';
import { useRemoteDrags } from './map/useRemoteDrags';
import { findLevel, levelLabel } from './map/zoneTree';

const DM_LAYERS: LayerId[] = [...LAYER_IDS];
const PLAYER_LAYERS: LayerId[] = LAYER_IDS.filter((l) => l !== 'notes');
const LIVE_EXCLUDE: SceneElementType[] = ['token'];
const ZERO_OFFSET = { x: 0, y: 0 };
const EMPTY_ZONE_STATE: ZoneLiveState = emptyZoneLiveState();
const DRAG_EMIT_MS = 66;
const MARQUEE_THRESHOLD_PX = 5;

/** The DM sees the lighting one step softer unless "real lighting" is enabled. */
const DM_LIGHTING: Record<LightingPreset, LightingPreset> = { day: 'day', dusk: 'day', night: 'dusk', dark: 'dusk' };

const KIND_ORDER: Record<Token['kind'], number> = { item: 0, creature: 1, npc: 1, hero: 2 };

function sameHp(a: TokenHpInfo, b: TokenHpInfo): boolean {
  return a.hp === b.hp && a.maxHp === b.maxHp && a.temp === b.temp && a.ratio === b.ratio;
}

function clientPoint(e: TransitionPointerEvent | TokenPointerEvent): { x: number; y: number } {
  const evt = e.evt;
  if (evt instanceof MouseEvent) return { x: evt.clientX, y: evt.clientY };
  if (typeof TouchEvent !== 'undefined' && evt instanceof TouchEvent) {
    const touch = evt.changedTouches[0] ?? evt.touches[0];
    if (touch) return { x: touch.clientX, y: touch.clientY };
  }
  const stage = e.target.getStage();
  const p = stage?.getPointerPosition();
  const rect = stage?.container().getBoundingClientRect();
  return p && rect ? { x: rect.left + p.x, y: rect.top + p.y } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

function boxFrom(a: Point, b: Point): MarqueeBox {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** Live map of the game screen: the zone/level the user is looking at, with tokens and every interaction. */
export function GameMap() {
  const view = useSessionStore((s) => s.view);
  const zones = useSessionStore((s) => s.zones);
  const zonesById = useSessionStore((s) => s.zonesById);
  const viewZone = useSessionStore((s) => s.viewZone);
  const { state, effective, asUserId, isPreview } = useDisplayState();
  const isDm = view?.role === 'dm';
  const rawZone = viewZone ? zonesById[viewZone.zoneId] ?? null : null;
  const zone = useMemo(() => (rawZone && isDm && isPreview ? filterZoneForPlayer(rawZone) : rawZone), [rawZone, isDm, isPreview]);
  const level = findLevel(zone, viewZone?.levelId);
  // "Ver como jugador": a zone the player does not receive at all is not shown as an empty map.
  const fullState = view?.state ?? null;
  const previewBlocked = useMemo(() => {
    if (!isDm || !isPreview || !asUserId || !fullState || !rawZone) return false;
    return !allowedZoneIds(fullState, zones, asUserId).includes(rawZone.id);
  }, [isDm, isPreview, asUserId, fullState, zones, rawZone]);

  if (!view || !state || !effective) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <Spinner size="lg" label="Cargando el mapa…" showLabel />
      </div>
    );
  }
  if (previewBlocked && rawZone && asUserId) {
    return <PreviewBlockedZone state={view.state} userId={asUserId} zoneName={rawZone.name} />;
  }
  if (!zone || !level) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="panel max-w-md">
          <EmptyState
            icon={<MapIcon />}
            title={isDm ? (zones.length === 0 ? 'La campaña no tiene zonas' : 'Elige una zona') : 'Esperando al DM…'}
            description={
              isDm
                ? zones.length === 0
                  ? 'Crea zonas en el editor de campaña para jugar sobre el mapa.'
                  : 'Selecciona una zona en el navegador superior.'
                : 'Tu ficha todavía no está en ningún mapa. El DM te situará en cuanto empiece la escena.'
            }
          />
        </div>
      </div>
    );
  }
  return (
    <LiveMap
      isDm={isDm}
      isPreview={isPreview}
      meUserId={view.meUserId}
      state={state}
      effective={effective}
      asUserId={asUserId}
      zone={zone}
      level={level}
      zones={zones}
    />
  );
}

/** DM preview of a player looking at a zone that player does not receive. */
function PreviewBlockedZone({ state, userId, zoneName }: { state: LiveState; userId: string; zoneName: string }) {
  const name = state.players[userId]?.name ?? 'Este jugador';
  const own = Object.values(state.tokens).find((t) => isOwnHeroToken(state, t, userId)) ?? null;
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div className="panel max-w-md">
        <EmptyState
          icon={<EyeOff />}
          title="Este jugador no ve esta zona"
          description={`${name} no recibe nada de «${zoneName}»: solo ve las zonas donde están sus fichas (o las del grupo con visión compartida), salvo que le permitas ver otras zonas.`}
          action={
            <>
              {own && (
                <Button variant="primary" size="sm" icon={<LocateFixed />} onClick={() => goToZone(own.zoneId, own.levelId, { x: own.x, y: own.y })}>
                  Ir a su zona
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => useSessionStore.getState().setViewAs(null)}>
                Salir de la vista previa
              </Button>
            </>
          }
        />
      </div>
    </div>
  );
}

interface LiveMapProps {
  isDm: boolean;
  isPreview: boolean;
  meUserId: string;
  /** Display state (filtered for players and for the DM preview). */
  state: LiveState;
  effective: VisibilitySettings;
  asUserId: string | null;
  zone: SessionZone;
  level: ZoneLevel;
  zones: SessionZone[];
}

interface MarqueeGesture {
  start: Point;
  current: Point;
  additive: boolean;
  active: boolean;
}

function LiveMap({ isDm, isPreview, meUserId, state, effective, asUserId, zone, level, zones }: LiveMapProps) {
  const asPlayer = !isDm || isPreview;
  const dmView = isDm && !isPreview;
  const stageRef = useRef<MapStageHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectedIds = useSessionStore((s) => s.selectedTokenIds);
  const pingMode = useGameUi((s) => s.pingMode);
  const cast = useGameUi((s) => s.cast);
  const realLighting = useGameUi((s) => s.realLighting);
  const flashTokenId = useGameUi((s) => s.flashTokenId);
  const contextMenu = useContextMenu();
  const tokenMenu = useTokenContextMenu(level.grid.size);
  const modeActive = pingMode || cast !== null;
  const fitKey = `${zone.id}:${level.id}`;
  const zoneState = state.zoneStates[zone.id] ?? EMPTY_ZONE_STATE;
  const doorStates = zoneState.doors;
  const revealed = zoneState.revealedFog;

  // --- camera store ------------------------------------------------------------
  useEffect(() => {
    useGameCamera.getState().setHandle(stageRef.current);
    return () => {
      useGameCamera.getState().setHandle(null);
      useGameCamera.getState().setTarget(null);
    };
  }, []);

  useEffect(() => {
    useGameCamera.getState().setTarget({
      zoneId: zone.id,
      levelId: level.id,
      width: level.background.width,
      height: level.background.height,
      grid: level.grid,
    });
  }, [zone.id, level.id, level.background.width, level.background.height, level.grid]);

  // --- tokens of this level -------------------------------------------------------
  const unrevealedFog = useMemo(() => (asPlayer ? unrevealedFogPolygons(level, revealed) : []), [asPlayer, level, revealed]);

  const levelTokens = useMemo(() => {
    const list = Object.values(state.tokens).filter((t) => {
      if (t.zoneId !== zone.id || t.levelId !== level.id) return false;
      // Players never see non-hero tokens hidden by unrevealed fog regions.
      if (unrevealedFog.length > 0 && t.kind !== 'hero' && pointInAnyPolygon({ x: t.x, y: t.y }, unrevealedFog)) return false;
      return true;
    });
    return list.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  }, [state.tokens, zone.id, level.id, unrevealedFog]);

  // Hero token the camera follows: the own one, or the previewed player's one in "Ver como jugador".
  const followToken = useMemo(
    () => (asPlayer && asUserId ? levelTokens.find((t) => isOwnHeroToken(state, t, asUserId)) ?? null : null),
    [asPlayer, asUserId, levelTokens, state],
  );
  const ownToken = isDm ? null : followToken;

  // HP objects are reused while unchanged so memoized sprites do not re-render.
  const hpCache = useRef(new Map<string, TokenHpInfo>());
  const hpById = useMemo(() => {
    const next = new Map<string, TokenHpInfo>();
    for (const t of levelTokens) {
      const fresh = tokenHp(state, t);
      const prev = hpCache.current.get(t.id);
      next.set(t.id, prev && sameHp(prev, fresh) ? prev : fresh);
    }
    hpCache.current = next;
    return next;
  }, [levelTokens, state]);

  const currentEntry = state.turn.order[state.turn.currentIndex] ?? null;
  const remoteDrags = useRemoteDrags(meUserId, state.tokens);
  const [groupDrag, setGroupDrag] = useState<{ leaderId: string; dx: number; dy: number } | null>(null);
  const [dropHoverId, setDropHoverId] = useState<string | null>(null);
  const dropHoverRef = useRef<string | null>(null);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const coneMatters = dmView
    ? state.visibility.global.visionCone < 360 || Object.values(state.visibility.perPlayer).some((p) => (p.visionCone ?? 360) < 360)
    : effective.visionCone < 360;

  const hpMode = (t: Token): HpBarMode => {
    if (dmView) return 'exact';
    if (t.kind === 'item') return 'none';
    if (t.kind === 'hero') return 'exact';
    return effective.enemyHp === 'exact' ? 'exact' : effective.enemyHp === 'bar' ? 'bar' : 'none';
  };

  const canDrag = (t: Token): boolean => {
    if (modeActive) return false;
    if (isDm) return true;
    return t.kind === 'hero' && effective.canMoveOwnToken && isOwnHeroToken(state, t, meUserId);
  };

  const views: TokenView[] = levelTokens.map((t) => {
    let dragPreview = remoteDrags[t.id] ?? null;
    if (groupDrag && groupDrag.leaderId !== t.id && selectedSet.has(t.id)) {
      dragPreview = { x: t.x + groupDrag.dx, y: t.y + groupDrag.dy };
    }
    const isCurrentTurn =
      !!currentEntry && (currentEntry.tokenId ? currentEntry.tokenId === t.id : !!currentEntry.heroId && currentEntry.heroId === t.heroId);
    return {
      token: t,
      hp: hpById.get(t.id) ?? tokenHp(state, t),
      showHpBar: hpMode(t),
      draggable: canDrag(t),
      selected: selectedSet.has(t.id),
      isCurrentTurn,
      dragPreview,
      highlight: t.id === dropHoverId ? MAP_COLORS.emerald400 : t.id === flashTokenId ? MAP_COLORS.gold300 : null,
    };
  });

  // Prune selections of tokens that disappeared.
  useEffect(() => {
    const s = useSessionStore.getState();
    const keep = s.selectedTokenIds.filter((id) => !!state.tokens[id]);
    if (keep.length !== s.selectedTokenIds.length) s.selectTokens(keep);
  }, [state.tokens]);

  // --- lighting & vision ---------------------------------------------------------------
  const baseLighting = zoneState.lighting ?? zone.lighting;
  const lighting = dmView && !realLighting ? DM_LIGHTING[baseLighting] : baseLighting;

  const lightsKey = levelTokens
    .filter((t) => t.light && t.light.radius > 0)
    .map((t) => `${Math.round(t.x)},${Math.round(t.y)},${t.light!.radius},${t.light!.color}`)
    .join('|');
  const tokenLights = useMemo<TokenLight[]>(
    () =>
      lightsKey
        ? lightsKey.split('|').map((part) => {
            const [x, y, radius, color] = part.split(',');
            return { x: Number(x), y: Number(y), radius: Number(radius), color: color ?? '#ffb347' };
          })
        : [],
    [lightsKey],
  );

  const limitedVision = asPlayer && (effective.visionMode === 'vision' || effective.visionMode === 'explored');
  const visionPolygons = useMemo(() => {
    if (!limitedVision || !asUserId) return [] as number[][];
    try {
      return visibleAreas(state, zones, asUserId)[level.id] ?? [];
    } catch {
      return [] as number[][];
    }
  }, [limitedVision, asUserId, state, zones, level.id]);

  const exploredEncoded = asUserId ? state.explored[asUserId]?.[level.id] : undefined;
  const explored = useMemo(() => {
    if (!asPlayer || effective.visionMode !== 'explored') return null;
    const grid = decodeExplored(exploredEncoded, level);
    // What is visible right now counts as explored even before the server stores it.
    markExplored(grid, visionPolygons);
    return grid;
  }, [asPlayer, effective.visionMode, exploredEncoded, level, visionPolygons]);

  // --- transitions -----------------------------------------------------------------------
  const transitions = useMemo(
    () =>
      level.elements.filter((el): el is TransitionElement => {
        if (el.type !== 'transition') return false;
        if (dmView) return true;
        if (el.hidden || !el.target) return false;
        return !(unrevealedFog.length > 0 && pointInAnyPolygon({ x: el.x, y: el.y }, unrevealedFog));
      }),
    [level.elements, dmView, unrevealedFog],
  );

  const activeTransition =
    !isDm && ownToken && effective.canMoveOwnToken ? transitions.find((tr) => tr.target && pointInTransition(ownToken, tr)) ?? null : null;

  // --- marquee / reticle -------------------------------------------------------------------
  const marqueeRef = useRef<MarqueeGesture | null>(null);
  const [marquee, setMarquee] = useState<MarqueeBox | null>(null);
  const [reticle, setReticle] = useState<Point | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingFrame = useRef<{ marquee?: MarqueeBox | null; reticle?: Point | null; group?: { leaderId: string; dx: number; dy: number } | null }>({});
  const suppressClickRef = useRef(false);
  const lastDragEmit = useRef(0);

  const scheduleFrame = (patch: typeof pendingFrame.current) => {
    Object.assign(pendingFrame.current, patch);
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const p = pendingFrame.current;
      pendingFrame.current = {};
      if ('marquee' in p) setMarquee(p.marquee ?? null);
      if ('reticle' in p) setReticle(p.reticle ?? null);
      if ('group' in p) setGroupDrag(p.group ?? null);
    });
  };

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!cast) setReticle(null);
  }, [cast]);

  // --- actions -------------------------------------------------------------------------------
  const pingAt = (p: Point) => {
    void send('ping', { zoneId: zone.id, levelId: level.id, x: p.x, y: p.y }, 'No se pudo enviar el ping');
  };

  const castAt = (p: Point) => {
    const c = useGameUi.getState().cast;
    if (!c) return;
    useGameUi.getState().setCast(null);
    void send(
      'spell:cast',
      { heroId: c.heroId, spellName: c.spellName, animation: c.animation, zoneId: zone.id, levelId: level.id, x: p.x, y: p.y },
      'No se pudo lanzar el hechizo',
    );
  };

  const handleEmptyPress = (world: Point, mods: { alt: boolean; shift: boolean }) => {
    const ui = useGameUi.getState();
    if (ui.cast) {
      castAt(world);
      return;
    }
    if (ui.pingMode || mods.alt) {
      pingAt(world);
      return;
    }
    if (!mods.shift) useSessionStore.getState().clearSelection();
  };

  const autoFacing = (t: Token, dest: Point): number | null => {
    if (t.kind !== 'hero' || !coneMatters) return null;
    if (Math.hypot(dest.x - t.x, dest.y - t.y) < Math.max(8, level.grid.size) * 0.5) return null;
    return facingTowards(t, dest);
  };

  const finishDrag = (tokenId: string, x: number, y: number) => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingFrame.current = {};
    setGroupDrag(null);
    const t = state.tokens[tokenId];
    if (!t) return;
    const dest = placeToken({ x, y }, t.cells, level);
    const moves: { tokenId: string; x: number; y: number; facing?: number }[] = [];
    const facing = autoFacing(t, dest);
    if (Math.hypot(dest.x - t.x, dest.y - t.y) >= 0.5 || facing !== null) {
      moves.push(facing !== null ? { tokenId, x: dest.x, y: dest.y, facing } : { tokenId, x: dest.x, y: dest.y });
    }
    const s = useSessionStore.getState();
    if (isDm && s.selectedTokenIds.length > 1 && s.selectedTokenIds.includes(tokenId)) {
      const dx = x - t.x;
      const dy = y - t.y;
      for (const id of s.selectedTokenIds) {
        if (id === tokenId) continue;
        const f = state.tokens[id];
        if (!f || f.zoneId !== zone.id || f.levelId !== level.id) continue;
        const p = placeToken({ x: f.x + dx, y: f.y + dy }, f.cells, level);
        if (Math.hypot(p.x - f.x, p.y - f.y) >= 0.5) moves.push({ tokenId: id, x: p.x, y: p.y });
      }
    }
    if (moves.length > 0) void sendMany('token:move', moves, 'No se pudo mover la ficha');
  };

  const actions = {
    click: (tokenId: string, e: TokenPointerEvent, touch: boolean) => {
      const t = state.tokens[tokenId];
      if (!t) return;
      const mouse = !touch && e.evt instanceof MouseEvent ? e.evt : null;
      const ui = useGameUi.getState();
      if (ui.cast) {
        castAt({ x: t.x, y: t.y });
        return;
      }
      if (ui.pingMode || mouse?.altKey) {
        pingAt({ x: t.x, y: t.y });
        return;
      }
      const store = useSessionStore.getState();
      if (mouse?.shiftKey) {
        if (store.selectedTokenIds.includes(tokenId)) store.selectTokens(store.selectedTokenIds.filter((id) => id !== tokenId));
        else store.selectTokens([tokenId], true);
      } else {
        store.selectTokens([tokenId]);
      }
    },
    dblClick: (tokenId: string) => {
      if (useGameUi.getState().cast || useGameUi.getState().pingMode) return;
      emitUiEvent('open-token', { tokenId });
    },
    contextMenu: (tokenId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
      if (useGameUi.getState().cancelModes()) return;
      tokenMenu.open({ clientX: e.evt.clientX, clientY: e.evt.clientY }, tokenId);
    },
    dragMove: (tokenId: string, x: number, y: number) => {
      const now = performance.now();
      if (now - lastDragEmit.current >= DRAG_EMIT_MS) {
        lastDragEmit.current = now;
        emitQuiet('token:drag', { tokenId, x, y });
      }
      const s = useSessionStore.getState();
      if (isDm && s.selectedTokenIds.length > 1 && s.selectedTokenIds.includes(tokenId)) {
        const t = state.tokens[tokenId];
        if (t) scheduleFrame({ group: { leaderId: tokenId, dx: x - t.x, dy: y - t.y } });
      }
    },
    dragEnd: finishDrag,
    transition: (el: TransitionElement, e: TransitionPointerEvent) => {
      const client = clientPoint(e);
      if (isDm) openTransitionMenu(el, client);
      else if (activeTransition && activeTransition.id === el.id) void takeTransition(el);
      else toast.info(`Acerca tu ficha a «${el.label || TRANSITION_STYLES[el.transitionType].label}» para usarla`);
    },
    stageTap: (stage: Konva.Stage) => {
      const p = stage.getPointerPosition();
      const h = stageRef.current;
      if (!p || !h) return;
      handleEmptyPress(h.screenToWorld(p), { alt: false, shift: false });
    },
  };
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const handlers = useMemo<TokenHandlers>(
    () => ({
      click: (id, e, touch) => actionsRef.current.click(id, e, touch),
      dblClick: (id) => actionsRef.current.dblClick(id),
      contextMenu: (id, e) => actionsRef.current.contextMenu(id, e),
      dragMove: (id, x, y) => actionsRef.current.dragMove(id, x, y),
      dragEnd: (id, x, y) => actionsRef.current.dragEnd(id, x, y),
    }),
    [],
  );
  const onTransition = useCallback((el: TransitionElement, e: TransitionPointerEvent) => actionsRef.current.transition(el, e), []);
  const onStageTap = useCallback((stage: Konva.Stage) => actionsRef.current.stageTap(stage), []);

  const takeTransition = async (el: TransitionElement) => {
    if (!ownToken || !el.target) return;
    await send(
      'token:transfer',
      { tokenIds: [ownToken.id], zoneId: el.target.zoneId, levelId: el.target.levelId },
      'No puedes usar este paso ahora',
    );
  };

  function openTransitionMenu(el: TransitionElement, client: { x: number; y: number }) {
    const s = useSessionStore.getState();
    const full = s.view?.state ?? state;
    const style = TRANSITION_STYLES[el.transitionType];
    const label = el.label || style.label;
    const target = el.target;
    const targetZone = target ? s.zonesById[target.zoneId] ?? null : null;
    const targetLevel = target && targetZone ? targetZone.levels.find((l) => l.id === target.levelId) ?? null : null;
    const items: ContextMenuItem[] = [{ heading: true, label: `${style.icon} ${label}` }];
    if (!target || !targetZone || !targetLevel) {
      items.push({ label: target ? 'El destino ya no existe' : 'Sin destino configurado', icon: <DoorOpen />, disabled: true });
    } else {
      const dest = `${targetZone.name}${targetZone.levels.length > 1 ? ` · ${levelLabel(targetLevel)}` : ''}`;
      const selection = s.selectedTokenIds.map((id) => full.tokens[id]).filter((t): t is Token => !!t);
      const party = Object.values(full.tokens).filter((t) => t.kind === 'hero');
      const travel = async (tokens: Token[]) => {
        const ok = await transferTokens(tokens, { zoneId: target.zoneId, levelId: target.levelId, x: target.x, y: target.y });
        if (ok > 0) goToZone(target.zoneId, target.levelId, { x: target.x, y: target.y });
      };
      items.push(
        { heading: true, label: `→ ${dest}` },
        {
          label: `Mover fichas seleccionadas (${selection.length})`,
          icon: <Users />,
          disabled: selection.length === 0,
          onClick: () => void travel(selection),
        },
        {
          label: `Mover a todo el grupo (${party.length})`,
          icon: <Shield />,
          disabled: party.length === 0,
          onClick: () => void travel(party),
        },
        { separator: true },
        { label: 'Ver el destino', icon: <Eye />, onClick: () => goToZone(target.zoneId, target.levelId, { x: target.x, y: target.y }) },
      );
    }
    contextMenu.openAt(client.x, client.y, items);
  }

  const moveSelectionTo = (world: Point) => {
    const s = useSessionStore.getState();
    const moving = s.selectedTokenIds.map((id) => state.tokens[id]).filter((t): t is Token => !!t && t.zoneId === zone.id && t.levelId === level.id);
    if (moving.length === 0) return;
    const ids = new Set(moving.map((t) => t.id));
    const occupied = levelTokens.filter((t) => !ids.has(t.id)).map((t) => ({ x: t.x, y: t.y }));
    const spots = findFreeSpots(world, moving.length, level, occupied);
    void sendMany(
      'token:move',
      moving.map((t, i) => ({ tokenId: t.id, x: spots[i]!.x, y: spots[i]!.y })),
      'No se pudo mover la selección',
    );
  };

  const openMapMenu = (world: Point, clientX: number, clientY: number) => {
    const items: ContextMenuItem[] = [
      { heading: true, label: `${zone.name}${zone.levels.length > 1 ? ` · ${levelLabel(level)}` : ''}` },
      { label: 'Hacer ping aquí', icon: <Radar />, shortcut: 'Alt+clic', onClick: () => pingAt(world) },
    ];
    if (dmView) {
      const selection = useSessionStore
        .getState()
        .selectedTokenIds.filter((id) => state.tokens[id]?.zoneId === zone.id && state.tokens[id]?.levelId === level.id);
      if (selection.length > 0) {
        items.push({ label: `Mover selección aquí (${selection.length})`, icon: <Move />, onClick: () => moveSelectionTo(world) });
      }
      const withHero = Object.values(state.players).filter((p) => p.heroId && p.userId !== state.hostUserId).length;
      if (withHero > 0) {
        items.push({
          label: 'Traer aquí a los héroes',
          icon: <Users />,
          onClick: () =>
            void send(
              'token:placeHeroes',
              { target: { zoneId: zone.id, levelId: level.id, x: world.x, y: world.y } },
              'No se pudo colocar a los héroes',
            ).then((ok) => ok && toast.success('Los héroes aparecen en este punto')),
        });
      }
      const shown = new Set(revealed);
      for (const region of level.fogRegions) {
        if (region.points.length < 6 || !pointInPolygon(world, region.points)) continue;
        const isShown = shown.has(region.id);
        const name = region.name || 'Región de niebla';
        items.push({
          label: isShown ? `Ocultar «${name}»` : `Revelar «${name}»`,
          icon: isShown ? <EyeOff /> : <Eye />,
          onClick: () => void send('fog:reveal', { zoneId: zone.id, regionId: region.id, revealed: !isShown }, 'No se pudo cambiar la niebla'),
        });
      }
    }
    items.push(
      { separator: true },
      { label: 'Centrar vista aquí', icon: <LocateFixed />, onClick: () => stageRef.current?.centerOn(world.x, world.y) },
      { label: 'Ajustar vista', icon: <Maximize />, shortcut: 'F', onClick: () => stageRef.current?.fitToView() },
    );
    contextMenu.openAt(clientX, clientY, items);
  };

  // --- stage handlers ------------------------------------------------------------------------
  const endMarquee = useCallback(() => {
    window.removeEventListener('mouseup', windowUpRef.current);
    const m = marqueeRef.current;
    marqueeRef.current = null;
    scheduleFrame({ marquee: null });
    if (!m || !m.active) return;
    suppressClickRef.current = true;
    const box = boxFrom(m.start, m.current);
    const ids = levelTokensRef.current
      .filter((t) => t.x >= box.x && t.x <= box.x + box.width && t.y >= box.y && t.y <= box.y + box.height)
      .map((t) => t.id);
    useSessionStore.getState().selectTokens(ids, m.additive);
    // scheduleFrame only touches refs and state setters.
  }, []);
  const windowUpRef = useRef<() => void>(() => undefined);
  windowUpRef.current = endMarquee;
  const levelTokensRef = useRef(levelTokens);
  levelTokensRef.current = levelTokens;

  const onStageMouseDown = (e: MapMouseEvent, world: MapPoint) => {
    suppressClickRef.current = false;
    if (e.evt.button !== 0 || e.target !== e.target.getStage()) return;
    if (!isDm || modeActive || e.evt.altKey) return;
    marqueeRef.current = { start: world, current: world, additive: e.evt.shiftKey, active: false };
    window.addEventListener('mouseup', windowUpRef.current);
  };

  const onStageMouseMove = (_e: MapMouseEvent, world: MapPoint) => {
    const m = marqueeRef.current;
    if (m) {
      m.current = world;
      if (!m.active) {
        const scale = stageRef.current?.getScale() ?? 1;
        if (Math.hypot(world.x - m.start.x, world.y - m.start.y) * scale >= MARQUEE_THRESHOLD_PX) m.active = true;
      }
      if (m.active) scheduleFrame({ marquee: boxFrom(m.start, m.current) });
    }
    if (useGameUi.getState().cast) scheduleFrame({ reticle: world });
  };

  const onStageMouseUp = (_e: MapMouseEvent, world: MapPoint) => {
    const m = marqueeRef.current;
    if (m) {
      m.current = world;
      endMarquee();
    }
  };

  const onStageClick = (e: MapMouseEvent, world: MapPoint) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    handleEmptyPress(world, { alt: e.evt.altKey, shift: e.evt.shiftKey });
  };

  const onStageContextMenu = (e: MapMouseEvent, world: MapPoint) => {
    if (useGameUi.getState().cancelModes()) return;
    if (e.target !== e.target.getStage()) return;
    openMapMenu(world, e.evt.clientX, e.evt.clientY);
  };

  // --- drag & drop from panels (DM) ------------------------------------------------------------
  const setHover = (id: string | null) => {
    if (dropHoverRef.current === id) return;
    dropHoverRef.current = id;
    setDropHoverId(id);
  };

  const onDragOver = (e: DragEvent) => {
    const item = peekItemDrag() !== null || hasDragType(e, DND_ITEM);
    const entry = item ? null : peekEntryDrag();
    if (!item && entry?.kind !== 'item') {
      setHover(null);
      return;
    }
    const world = gameCamera.clientToWorld(e.clientX, e.clientY);
    if (!world) return;
    const target = tokenAtPoint(levelTokens, world, level.grid, item ? undefined : (t) => t.kind === 'hero');
    setHover(target?.id ?? null);
  };

  const onDrop = (e: DragEvent, world: MapPoint) => {
    setHover(null);
    if (!isDm) return;
    if (hasDragType(e, DND_ITEM)) {
      const item = readItemDrag(e);
      if (!item) return;
      const target = tokenAtPoint(levelTokens, world, level.grid);
      if (!target) {
        toast.info('Suelta el objeto sobre una ficha para entregarlo');
        return;
      }
      if (target.kind === 'hero' && target.heroId) {
        if (item.from.heroId === target.heroId) return;
        void send('inventory:transfer', { from: item.from, to: { heroId: target.heroId }, itemId: item.itemId }, 'No se pudo entregar el objeto').then(
          (ok) => ok && toast.success(`Objeto entregado a ${target.name}`),
        );
      } else {
        if (item.from.tokenId === target.id) return;
        void send('inventory:transfer', { from: item.from, to: { tokenId: target.id }, itemId: item.itemId }, 'No se pudo mover el objeto').then(
          (ok) => ok && toast.success(`Objeto añadido al botín de ${target.name}`),
        );
      }
      return;
    }
    const entry = readEntryDrag(e);
    if (!entry) return;
    const spawnAt = async (hidden = false) => {
      const p = placeToken(world, 1, level);
      const ids = await request(
        'token:spawn',
        { entryId: entry.id, zoneId: zone.id, levelId: level.id, x: p.x, y: p.y, hidden },
        'No se pudo colocar en el mapa',
      );
      if (ids && ids.length > 0) useSessionStore.getState().selectTokens(ids);
    };
    switch (entry.kind) {
      case 'creature':
        void spawnAt(e.shiftKey);
        break;
      case 'item': {
        const hero = tokenAtPoint(levelTokens, world, level.grid, (t) => t.kind === 'hero' && !!t.heroId);
        if (hero && hero.heroId) {
          const heroId = hero.heroId;
          void send('inventory:add', { heroId, entryId: entry.id, quantity: 1 }, 'No se pudo entregar el objeto').then(
            (ok) => ok && toast.success(`${hero.name} recibe ${entry.name}`),
          );
        } else {
          void spawnAt(e.shiftKey);
        }
        break;
      }
      case 'sound':
        // Same action as the quick search: music / ambience go to their channel, effects play once.
        void api.library
          .get<'sound'>(entry.id)
          .then((full) => buildQuickActions(full)[0]?.run())
          .catch((err: unknown) => toast.fromError(err, 'No se pudo cargar el sonido'));
        break;
      case 'spell':
        void api.library
          .get<'spell'>(entry.id)
          .then((full) => spellFxAt(full.data.animation, { zoneId: zone.id, levelId: level.id, x: world.x, y: world.y }, full.name, level.grid.size))
          .catch((err: unknown) => toast.fromError(err, 'No se pudo cargar el hechizo'));
        break;
      default:
        toast.info(`«${entry.name}» no se puede soltar en el mapa`);
    }
  };

  const onWrapperDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (next instanceof Node && wrapperRef.current?.contains(next)) return;
    setHover(null);
  };

  // --- UI events & camera ------------------------------------------------------------------------
  useEffect(() => {
    const focus = useGameUi.getState().consumeFocus(zone.id, level.id);
    if (focus) {
      return gameCamera.whenReady((h) => h.centerOn(focus.x, focus.y, focus.scale ?? Math.max(h.getScale(), gameCamera.scaleForCells(18) ?? 0)));
    }
    const own = followToken;
    if (own) return gameCamera.whenReady((h) => h.centerOn(own.x, own.y, gameCamera.scaleForCells(12)));
    return undefined;
    // Only on zone/level changes (initial mount included).
  }, [fitKey]);

  // Players (and the DM preview): follow the hero token when it arrives on the displayed level (transfers,
  // DM moves between zones). The zone list and the state can arrive in any order, so the zone switch alone
  // is not enough.
  const followLoc = followToken ? `${asUserId ?? ''}|${followToken.zoneId}:${followToken.levelId}` : null;
  const lastFollowLocRef = useRef<string | null>(followLoc);
  useEffect(() => {
    const prev = lastFollowLocRef.current;
    lastFollowLocRef.current = followLoc;
    const own = followToken;
    if (!followLoc || followLoc === prev || !own) return undefined;
    return gameCamera.whenReady((h) => h.centerOn(own.x, own.y, gameCamera.scaleForCells(12)));
    // Only when the followed token changes level (or the previewed player changes).
  }, [followLoc]);

  useUiEvent('center-on-token', ({ tokenId }) => {
    const full = useSessionStore.getState().view?.state;
    const t = state.tokens[tokenId] ?? (isDm ? full?.tokens[tokenId] : undefined);
    if (!t) {
      toast.info('Esa ficha no está a la vista');
      return;
    }
    useGameUi.getState().flashToken(t.id);
    if (t.zoneId !== zone.id || t.levelId !== level.id) {
      if (!useSessionStore.getState().zonesById[t.zoneId]) {
        toast.info('Esa ficha está en una zona que no puedes ver');
        return;
      }
      goToZone(t.zoneId, t.levelId, { x: t.x, y: t.y });
      return;
    }
    const h = stageRef.current;
    if (h) h.centerOn(t.x, t.y, Math.max(h.getScale(), gameCamera.scaleForCells(18) ?? 0));
  });

  useUiEvent('game-fit', () => stageRef.current?.fitToView());

  const toggleDoor = (wall: Wall) => {
    const open = doorStates[wall.id] ?? wall.open;
    void send('door:toggle', { zoneId: zone.id, wallId: wall.id, open: !open }, 'No se pudo cambiar la puerta');
  };

  const castColor = cast ? SPELL_COLORS[cast.animation] : MAP_COLORS.gold400;
  const castRadius = Math.max(16, level.grid.size * 1.5);

  return (
    <div
      ref={wrapperRef}
      className={clsx('absolute inset-0', modeActive && '[&_canvas]:!cursor-crosshair')}
      onDragLeave={onWrapperDragLeave}
    >
      <MapStage
        ref={stageRef}
        worldWidth={Math.max(1, level.background.width)}
        worldHeight={Math.max(1, level.background.height)}
        initialFit
        fitKey={fitKey}
        panWithRightButton
        onStageMouseDown={onStageMouseDown}
        onStageMouseMove={onStageMouseMove}
        onStageMouseUp={onStageMouseUp}
        onStageClick={onStageClick}
        onStageContextMenu={onStageContextMenu}
        onDrop={isDm ? onDrop : undefined}
        onDragOver={isDm ? onDragOver : undefined}
        onViewChange={(v) => useGameCamera.getState().setScale(v.scale)}
        background="#070605"
      >
        <LevelStack zone={zone} currentLevelId={level.id} viewOffset={ZERO_OFFSET} viewer={dmView ? 'dm' : 'player'} revealedFog={revealed} />
        <CombinedLayer listening={false}>
          <LevelBackground level={level} />
          <SceneElementsLayer level={level} layers={dmView ? DM_LAYERS : PLAYER_LAYERS} showHidden={dmView} excludeTypes={LIVE_EXCLUDE} />
          <GridLayer level={level} />
          <FogRegionsLayer regions={level.fogRegions} revealed={revealed} mode={dmView ? 'dm' : 'player'} />
        </CombinedLayer>
        <CombinedLayer>
          <TransitionHotspots
            transitions={transitions}
            activeId={activeTransition?.id ?? null}
            interactive={!modeActive}
            onActivate={onTransition}
          />
          {dmView && <WallsLayer walls={level.walls} doorStates={doorStates} onDoorToggle={toggleDoor} />}
          <TokensGroup views={views} grid={level.grid} isDmView={dmView} handlers={handlers} />
          {marquee && <MarqueeRect box={marquee} />}
          <StageTapBinder onTap={onStageTap} />
        </CombinedLayer>
        <LightingOverlay level={level} lighting={lighting} lights={level.lights} tokenLights={tokenLights} animate doorStates={doorStates} />
        {/* Spell fx below the vision mask: players never see effects in areas they cannot see. */}
        <MapFxLayer zoneId={zone.id} levelId={level.id} />
        {asPlayer && <VisionMask level={level} mode={effective.visionMode} polygons={visionPolygons} explored={explored} />}
        <CombinedLayer listening={false}>
          <PingLayer zoneId={zone.id} levelId={level.id} />
          {cast && reticle && <TargetReticle x={reticle.x} y={reticle.y} radius={castRadius} color={castColor} />}
        </CombinedLayer>
      </MapStage>

      <div className="pointer-events-none absolute bottom-3 right-3 z-20">
        <MapToolbar
          dmControls={dmView}
          onCenterOwn={ownToken ? () => emitUiEvent('center-on-token', { tokenId: ownToken.id }) : null}
        />
      </div>

      {activeTransition && activeTransition.target && !modeActive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-20 flex justify-center pl-4 pr-16">
          <Button
            variant="primary"
            size="lg"
            epic
            className="pointer-events-auto max-w-full animate-pop shadow-glow-gold"
            icon={<span aria-hidden>{TRANSITION_STYLES[activeTransition.transitionType].icon}</span>}
            onClick={() => void takeTransition(activeTransition)}
            title={`Usar ${activeTransition.label || TRANSITION_STYLES[activeTransition.transitionType].label}`}
          >
            Usar {activeTransition.label || TRANSITION_STYLES[activeTransition.transitionType].label}
          </Button>
        </div>
      )}

      {tokenMenu.dialogs}
    </div>
  );
}
