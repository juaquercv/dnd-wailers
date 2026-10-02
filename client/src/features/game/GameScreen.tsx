import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, ScanEye, X } from 'lucide-react';
import { isOwnHeroToken, type EntryKind, type LogEntry } from '@wailers/shared';
import { getSocket } from '../../api/socket';
import { toast } from '../../components/ui/toast';
import { useUiEvent } from '../../lib/uiEvents';
import { useDisplayState, useSessionStore } from '../../stores/session';
import { FxOverlay } from '../fx/FxOverlay';
import { QuickSearch } from '../library/QuickSearch';
import { EdgeNavigator } from './EdgeNavigator';
import { GameMap } from './GameMap';
import { PlayerHud } from './hud/PlayerHud';
import { OverviewModal } from './OverviewModal';
import { ProjectionOverlay } from './ProjectionOverlay';
import { SceneScreen } from './SceneScreen';
import { ShowToPlayersDialog } from './ShowToPlayersDialog';
import { TokenDetailsPanel } from './TokenDetailsPanel';
import { useGameHotkeys } from './useGameHotkeys';
import { send } from './map/actions';
import { GameSidebar, DM_TABS, PLAYER_TABS } from './map/GameSidebar';
import { GameTopBar } from './map/GameTopBar';
import { resetGameUi, useGameUi, type GameSidebarTab } from './map/gameUi';
import { InitiativeColumn } from './map/InitiativeColumn';
import { buildQuickActions } from './map/quickActions';
import { readPref, useMediaQuery, writePref } from './map/useMediaQuery';
import { usePreviewZone } from './map/usePreviewZone';
import { ViewportBanners } from './map/ViewportBanners';

const QUICK_KINDS: EntryKind[] = ['creature', 'item', 'sound', 'spell'];
const SIDEBAR_PREF = 'wailers.game.sidebar';
const INITIATIVE_PREF = 'wailers.game.initiative';

interface SidebarPref {
  open: boolean;
  dmTab: GameSidebarTab;
  playerTab: GameSidebarTab;
}

function isSidebarPref(v: unknown): v is SidebarPref {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.open === 'boolean' &&
    typeof o.dmTab === 'string' &&
    (DM_TABS as string[]).includes(o.dmTab) &&
    typeof o.playerTab === 'string' &&
    (PLAYER_TABS as string[]).includes(o.playerTab)
  );
}

const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';

/** Live game table: top bar, initiative, the map (or the scene screen) and the sidebar panels. */
export function GameScreen() {
  const isDm = useSessionStore((s) => s.view?.role === 'dm');
  const meUserId = useSessionStore((s) => s.view?.meUserId ?? null);
  const campaignId = useSessionStore((s) => s.campaign?.id ?? s.view?.state.campaignId ?? undefined);
  const viewAsUserId = useSessionStore((s) => s.viewAsUserId);
  const viewAsName = useSessionStore((s) => (s.viewAsUserId ? s.view?.state.players[s.viewAsUserId]?.name ?? null : null));
  const combat = useSessionStore((s) => s.view?.state.status === 'playing' && s.view.state.turn.combat === true);
  const pendingDmTrades = useSessionStore((s) => (s.view?.role === 'dm' ? s.view.state.trades.filter((t) => t.status === 'pending_dm').length : 0));
  const { effective, isPreview } = useDisplayState();
  const wide = useMediaQuery('(min-width: 1024px)');
  const roomy = useMediaQuery('(min-width: 1280px)');

  const tabs = isDm ? DM_TABS : PLAYER_TABS;
  const [sidebar, setSidebar] = useState<SidebarPref>(() =>
    readPref<SidebarPref>(SIDEBAR_PREF, { open: true, dmTab: 'party', playerTab: 'character' }, isSidebarPref),
  );
  const [initiativeOpen, setInitiativeOpen] = useState<boolean>(() =>
    readPref<boolean>(INITIATIVE_PREF, typeof window !== 'undefined' ? window.innerWidth >= 1280 : true, isBoolean),
  );
  const [quickOpen, setQuickOpen] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [openTokenId, setOpenTokenId] = useState<string | null>(null);
  const [chatUnread, setChatUnread] = useState(0);

  const tab: GameSidebarTab = isDm ? sidebar.dmTab : sidebar.playerTab;
  const sidebarOverlay = !wide;
  const initiativeOverlay = !roomy;
  const sceneMode = !!effective && effective.visionMode === 'none' && (!isDm || isPreview);
  const showInitiative = isDm || !!effective?.canSeeInitiative;

  // Narrow screens start with the panels closed so the map is visible.
  const firstLayout = useRef(true);
  useEffect(() => {
    if (!firstLayout.current) return;
    firstLayout.current = false;
    if (!wide) setSidebar((s) => ({ ...s, open: false }));
    if (!roomy) setInitiativeOpen(false);
    // Only on mount.
  }, []);

  const updateSidebar = useCallback(
    (patch: { open?: boolean; tab?: GameSidebarTab }) => {
      setSidebar((s) => {
        const next: SidebarPref = { ...s, open: patch.open ?? s.open };
        if (patch.tab) {
          if (isDm) next.dmTab = patch.tab;
          else next.playerTab = patch.tab;
        }
        writePref(SIDEBAR_PREF, next);
        return next;
      });
    },
    [isDm],
  );

  const setInitiative = useCallback(
    (open: boolean) => {
      setInitiativeOpen(open);
      writePref(INITIATIVE_PREF, open);
      // Only one overlay drawer at a time on small screens.
      if (open && sidebarOverlay) updateSidebar({ open: false });
    },
    [sidebarOverlay, updateSidebar],
  );

  const selectTab = useCallback(
    (next: GameSidebarTab) => {
      updateSidebar({ open: true, tab: next });
      if (initiativeOverlay && initiativeOpen) setInitiativeOpen(false);
    },
    [updateSidebar, initiativeOverlay, initiativeOpen],
  );

  // Sidebar requests from other components (e.g. "Ver mi ficha" in the token menu).
  const sidebarRequest = useGameUi((s) => s.sidebarRequest);
  useEffect(() => {
    if (!sidebarRequest) return;
    if (tabs.includes(sidebarRequest.tab)) selectTab(sidebarRequest.tab);
    // The nonce identifies each request.
  }, [sidebarRequest?.nonce]);

  // Leaving the table resets transient modes.
  useEffect(() => () => resetGameUi(), []);

  // The previewed player left the session: back to the DM view.
  const previewGone = useSessionStore((s) => !!s.viewAsUserId && !!s.view && !s.view.state.players[s.viewAsUserId]);
  useEffect(() => {
    if (previewGone) useSessionStore.getState().setViewAs(null);
  }, [previewGone]);
  // The preview shows the zone where the previewed player's hero stands.
  usePreviewZone();

  // --- chat unread badge --------------------------------------------------------
  const chatVisible = sidebar.open && tab === 'chat';
  const chatVisibleRef = useRef(chatVisible);
  chatVisibleRef.current = chatVisible;
  const meRef = useRef(meUserId);
  meRef.current = meUserId;
  useEffect(() => {
    if (chatVisible) setChatUnread(0);
  }, [chatVisible]);
  useEffect(() => {
    const socket = getSocket();
    const onLog = (entry: LogEntry) => {
      if (entry.type !== 'chat' || entry.actorUserId === meRef.current || chatVisibleRef.current) return;
      setChatUnread((n) => n + 1);
    };
    socket.on('session:log', onLog);
    return () => {
      socket.off('session:log', onLog);
    };
  }, []);

  const badges = useMemo<Partial<Record<GameSidebarTab, number>>>(
    () => ({ chat: chatUnread, party: pendingDmTrades }),
    [chatUnread, pendingDmTrades],
  );

  // --- cross-feature UI events ------------------------------------------------------
  useUiEvent('open-token', ({ tokenId }) => setOpenTokenId(tokenId));
  useUiEvent('open-quicksearch', () => {
    if (isDm) setQuickOpen(true);
  });
  useUiEvent('cast-request', (req) => {
    const s = useSessionStore.getState();
    const view = s.view;
    if (!view) return;
    if (sceneMode) {
      // No map to aim at: the spell goes off where the caster stands, which the client only knows
      // when the view carries the caster's own hero token.
      const state = view.state;
      const own = Object.values(state.tokens).find((t) => t.kind === 'hero' && (t.heroId === req.heroId || isOwnHeroToken(state, t, view.meUserId)));
      if (!own) {
        toast.info('Tu ficha no está a la vista: pide al DM que lance el hechizo por ti o que coloque tu ficha en el mapa');
        return;
      }
      void send(
        'spell:cast',
        { heroId: req.heroId, spellName: req.spellName, animation: req.animation, zoneId: own.zoneId, levelId: own.levelId, x: own.x, y: own.y },
        'No se pudo lanzar el hechizo',
      );
      return;
    }
    useGameUi.getState().setCast({ heroId: req.heroId, spellName: req.spellName, animation: req.animation });
    // Let the player see the map while aiming.
    if (sidebarOverlay) updateSidebar({ open: false });
    if (initiativeOverlay) setInitiativeOpen(false);
  });

  const openQuickSearch = useCallback(() => setQuickOpen(true), []);
  useGameHotkeys({ onQuickSearch: openQuickSearch });

  // Tabs that disappeared (role change) fall back to the first one.
  useEffect(() => {
    if (!tabs.includes(tab)) updateSidebar({ tab: tabs[0] });
  }, [tabs, tab, updateSidebar]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-ink-950">
      <GameTopBar onQuickSearch={openQuickSearch} onShowToPlayers={() => setShowOpen(true)} onOverview={() => setOverviewOpen(true)} />

      {isDm && viewAsUserId && (
        <div
          role="status"
          className="relative z-20 flex shrink-0 items-center justify-center gap-3 border-b border-arcane-500/50 bg-gradient-to-r from-arcane-700/40 via-arcane-600/50 to-arcane-700/40 px-3 py-1.5 text-sm text-arcane-100 shadow-glow-arcane"
        >
          <ScanEye className="h-4 w-4 shrink-0 text-arcane-300" aria-hidden />
          <span className="min-w-0 truncate">
            Vista previa como <strong className="font-semibold text-parchment-50">{viewAsName ?? 'jugador'}</strong>
            <span className="hidden text-arcane-200/80 sm:inline"> · ves la partida como la ve este jugador</span>
          </span>
          <button
            type="button"
            onClick={() => useSessionStore.getState().setViewAs(null)}
            className="flex shrink-0 items-center gap-1 rounded-full border border-arcane-400/50 bg-ink-950/40 px-2.5 py-0.5 text-xs font-semibold text-parchment-100 transition hover:bg-ink-950/70"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Salir de la vista previa
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {showInitiative && <InitiativeColumn open={initiativeOpen} overlay={initiativeOverlay} onOpenChange={setInitiative} />}

        <main id="game-viewport" className="relative min-w-0 flex-1 overflow-hidden bg-[#070605]">
          {sceneMode ? <SceneScreen /> : <GameMap />}
          <FxOverlay />
          {!sceneMode && <EdgeNavigator />}
          <ProjectionOverlay />
          {!sceneMode && <ViewportBanners />}
          {combat && (
            <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] animate-fade-in shadow-[inset_0_0_90px_-24px_rgba(196,61,51,0.65)]" />
          )}
          {(!isDm || isPreview) && <PlayerHud />}
          {isDm && isPreview && sceneMode && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
              <span className="flex items-center gap-2 rounded-full border border-arcane-500/50 bg-ink-950/85 px-3 py-1 text-xs text-arcane-100">
                <Eye className="h-3.5 w-3.5" aria-hidden />
                Este jugador no ve el mapa (visión «Nada»)
              </span>
            </div>
          )}
        </main>

        <GameSidebar
          tabs={tabs}
          tab={tabs.includes(tab) ? tab : tabs[0]!}
          open={sidebar.open}
          overlay={sidebarOverlay}
          onSelect={selectTab}
          onClose={() => updateSidebar({ open: false })}
          badges={badges}
        />
      </div>

      {isDm && (
        <>
          <QuickSearch
            open={quickOpen}
            onClose={() => setQuickOpen(false)}
            kinds={QUICK_KINDS}
            campaignId={campaignId}
            placeholder="Buscar enemigos, objetos, sonidos, hechizos…"
            actionsFor={buildQuickActions}
          />
          <ShowToPlayersDialog open={showOpen} onClose={() => setShowOpen(false)} />
        </>
      )}
      <OverviewModal open={overviewOpen} onClose={() => setOverviewOpen(false)} />
      {openTokenId && <TokenDetailsPanel key={openTokenId} tokenId={openTokenId} onClose={() => setOpenTokenId(null)} />}
    </div>
  );
}
