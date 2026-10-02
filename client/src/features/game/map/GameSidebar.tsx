import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  BookOpen,
  Dices,
  Eye,
  MessageSquare,
  Music,
  PanelRightClose,
  ScrollText,
  UserRound,
  Users,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import type { EntryKind, LibraryEntry } from '@wailers/shared';
import { IconButton } from '../../../components/ui/IconButton';
import { useSessionStore } from '../../../stores/session';
import { AudioPanel } from '../../audio/AudioPanel';
import { ChatPanel } from '../../chat/ChatPanel';
import { DicePanel } from '../../dice/DicePanel';
import { EffectsPanel } from '../../fx/EffectsPanel';
import { LibraryBrowser } from '../../library/LibraryBrowser';
import { LogPanel } from '../LogPanel';
import { MyCharacterPanel } from '../MyCharacterPanel';
import { PartyPanel } from '../PartyPanel';
import { TradesPanel } from '../TradesPanel';
import { VisibilityPanel } from '../VisibilityPanel';
import type { GameSidebarTab } from './gameUi';
import { QuickActionsDialog } from './QuickActionsDialog';

/** How a panel uses the sidebar body: 'scroll' = padded scroll area; 'fill' = the panel manages its own height. */
type PanelLayout = 'scroll' | 'fill' | 'fill-padded';

interface TabDef {
  id: GameSidebarTab;
  label: string;
  title: string;
  icon: LucideIcon;
  layout: PanelLayout;
}

const TAB_DEFS: Record<GameSidebarTab, TabDef> = {
  character: { id: 'character', label: 'Personaje', title: 'Mi personaje', icon: UserRound, layout: 'scroll' },
  party: { id: 'party', label: 'Grupo', title: 'El grupo', icon: Users, layout: 'scroll' },
  dice: { id: 'dice', label: 'Dados', title: 'Dados y ruletas', icon: Dices, layout: 'fill' },
  chat: { id: 'chat', label: 'Chat', title: 'Chat', icon: MessageSquare, layout: 'fill' },
  log: { id: 'log', label: 'Registro', title: 'Registro de la partida', icon: ScrollText, layout: 'fill-padded' },
  audio: { id: 'audio', label: 'Audio', title: 'Música y sonido', icon: Music, layout: 'fill' },
  effects: { id: 'effects', label: 'Efectos', title: 'Efectos y clima', icon: Wand2, layout: 'fill' },
  visibility: { id: 'visibility', label: 'Visión', title: 'Lo que ven los jugadores', icon: Eye, layout: 'scroll' },
  library: { id: 'library', label: 'Biblioteca', title: 'Biblioteca', icon: BookOpen, layout: 'fill' },
};

export const DM_TABS: GameSidebarTab[] = ['party', 'dice', 'chat', 'log', 'audio', 'effects', 'visibility', 'library'];
export const PLAYER_TABS: GameSidebarTab[] = ['character', 'party', 'dice', 'chat', 'log', 'audio'];

const LIBRARY_KINDS: EntryKind[] = ['creature', 'item', 'sound', 'spell'];

export interface GameSidebarProps {
  tabs: GameSidebarTab[];
  tab: GameSidebarTab;
  open: boolean;
  /** Draw the panel over the map (narrow screens). */
  overlay: boolean;
  onSelect: (tab: GameSidebarTab) => void;
  onClose: () => void;
  badges: Partial<Record<GameSidebarTab, number>>;
}

/** DM extra for the "Grupo" tab: trades waiting for approval and recent trades. */
function DmPartyTab() {
  const hasTrades = useSessionStore((s) => (s.view?.state.trades.length ?? 0) > 0 || (s.view?.state.options.tradeNeedsApproval ?? false));
  return (
    <div className="space-y-4">
      <PartyPanel />
      {hasTrades && (
        <>
          <div className="divider" />
          <TradesPanel />
        </>
      )}
    </div>
  );
}

function LibraryTab() {
  const campaignId = useSessionStore((s) => s.campaign?.id ?? s.view?.state.campaignId);
  const [entry, setEntry] = useState<LibraryEntry | null>(null);
  return (
    <>
      <LibraryBrowser kinds={LIBRARY_KINDS} compact draggable campaignId={campaignId} onPick={setEntry} pickLabel="Acciones" />
      <QuickActionsDialog entry={entry} onClose={() => setEntry(null)} />
    </>
  );
}

function panelFor(tab: GameSidebarTab, isDm: boolean): ReactNode {
  switch (tab) {
    case 'character':
      return <MyCharacterPanel />;
    case 'party':
      return isDm ? <DmPartyTab /> : <PartyPanel />;
    case 'dice':
      return <DicePanel />;
    case 'chat':
      return <ChatPanel compact />;
    case 'log':
      return <LogPanel />;
    case 'audio':
      return <AudioPanel />;
    case 'effects':
      return <EffectsPanel />;
    case 'visibility':
      return <VisibilityPanel />;
    case 'library':
      return <LibraryTab />;
  }
}

/**
 * Right sidebar of the game screen: an icon rail with labels and the active panel.
 * Visited panels stay mounted (hidden) so drafts, scroll positions and filters survive tab switches.
 */
export function GameSidebar({ tabs, tab, open, overlay, onSelect, onClose, badges }: GameSidebarProps) {
  const isDm = useSessionStore((s) => s.view?.role === 'dm');
  const [visited, setVisited] = useState<GameSidebarTab[]>(() => [tab]);
  const active = TAB_DEFS[tab];

  useEffect(() => {
    if (open) setVisited((v) => (v.includes(tab) ? v : [...v, tab]));
  }, [open, tab]);

  // Forget panels of tabs that no longer exist (role change).
  useEffect(() => {
    setVisited((v) => {
      const next = v.filter((t) => tabs.includes(t));
      return next.length === v.length ? v : next;
    });
  }, [tabs]);

  return (
    <div className="relative flex h-full shrink-0">
      <section
        aria-label={active.title}
        className={clsx(
          'flex min-h-0 flex-col border-l border-ink-600/80 bg-ink-900/95 backdrop-blur',
          overlay
            ? 'absolute inset-y-0 right-full z-50 w-[min(23rem,calc(100vw-4rem))] shadow-modal'
            : 'relative w-[22rem] xl:w-[24rem]',
          open ? (overlay ? 'animate-slide-in-right' : '') : 'hidden',
        )}
      >
        <span aria-hidden className="pointer-events-none absolute inset-y-10 left-0 w-px bg-gradient-to-b from-transparent via-gold-600/40 to-transparent" />
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-ink-600/70 px-3">
          <active.icon className="h-4 w-4 shrink-0 text-gold-400" aria-hidden />
          <h2 className="min-w-0 flex-1 truncate font-display text-sm font-semibold uppercase tracking-[0.14em] text-gold-200">{active.title}</h2>
          <IconButton icon={<PanelRightClose />} title="Ocultar panel" size="sm" onClick={onClose} />
        </header>
        <div className="relative min-h-0 flex-1">
          {visited
            .filter((t) => tabs.includes(t))
            .map((t) => {
              const def = TAB_DEFS[t];
              const shown = open && t === tab;
              return (
                <div
                  key={t}
                  role="tabpanel"
                  aria-hidden={!shown}
                  className={clsx(
                    'absolute inset-0',
                    !shown && 'hidden',
                    def.layout === 'scroll' && 'scroll-thin overflow-y-auto p-3',
                    def.layout === 'fill' && 'flex min-h-0 flex-col overflow-hidden',
                    def.layout === 'fill-padded' && 'flex min-h-0 flex-col overflow-hidden p-3',
                  )}
                >
                  {def.layout === 'fill' && t === 'effects' ? (
                    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{panelFor(t, isDm)}</div>
                  ) : (
                    panelFor(t, isDm)
                  )}
                </div>
              );
            })}
        </div>
      </section>

      <nav
        aria-label="Paneles de la partida"
        role="tablist"
        aria-orientation="vertical"
        className="scroll-thin flex w-[3.75rem] shrink-0 flex-col items-stretch gap-0.5 overflow-y-auto border-l border-ink-600/80 bg-ink-950/95 px-1 py-2"
      >
        {tabs.map((id) => {
          const def = TAB_DEFS[id];
          const selected = open && id === tab;
          const badge = badges[id] ?? 0;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              title={def.title}
              onClick={() => (selected ? onClose() : onSelect(id))}
              className={clsx(
                'group relative flex flex-col items-center gap-0.5 rounded-lg px-0.5 py-1.5 text-[9.5px] font-semibold leading-tight transition',
                selected ? 'bg-gold-500/10 text-gold-200' : 'text-parchment-400 hover:bg-ink-800 hover:text-parchment-100',
              )}
            >
              <span
                aria-hidden
                className={clsx(
                  'absolute inset-y-2 left-0 w-0.5 rounded-full bg-gold-400 transition-opacity',
                  selected ? 'opacity-100 shadow-[0_0_8px_rgba(233,192,99,0.8)]' : 'opacity-0',
                )}
              />
              <span className="relative">
                <def.icon className={clsx('h-[18px] w-[18px] transition-transform group-hover:scale-110', selected && 'text-gold-300')} aria-hidden />
                {badge > 0 && (
                  <span className="absolute -right-2.5 -top-2 flex h-4 min-w-[1rem] animate-pop items-center justify-center rounded-full bg-blood-500 px-1 text-[9px] font-bold leading-none text-parchment-50 ring-2 ring-ink-950">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center">{def.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
