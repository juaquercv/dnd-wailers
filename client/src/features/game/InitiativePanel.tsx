import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import clsx from 'clsx';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  EyeOff,
  GripVertical,
  HeartPulse,
  Minus,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Shuffle,
  Skull,
  Swords,
  Trash2,
  TriangleAlert,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { tokenHp, type HeroSheet, type LiveState, type SessionZone, type Token, type TurnEntry } from '@wailers/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { useContextMenu, type ContextMenuItem } from '../../components/ui/ContextMenu';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { Kbd } from '../../components/ui/Kbd';
import { isEditableTarget } from '../../lib/hotkeys';
import { emitUiEvent } from '../../lib/uiEvents';
import { useSessionStore } from '../../stores/session';
import { isTurnEntryMasked } from './map/fog';
import { send } from './panels/actions';
import { heroTokenOf, partyMembers, usePanelContext, type PanelContext } from './panels/context';
import { HpBar, type HpInfo } from './panels/HpBar';
import { PromptDialog, type PromptField } from './panels/PromptDialog';
import { StatusIcons } from './panels/Statuses';

interface EntryView {
  entry: TurnEntry;
  name: string;
  imageUrl: string | null;
  color: string;
  token: Token | null;
  hero: HeroSheet | null;
  hp: HpInfo | null;
  statuses: string[];
  /** Players cannot see this creature right now (hidden or out of sight). */
  masked: boolean;
}

type PromptState =
  | { kind: 'custom' }
  | { kind: 'rename'; entry: TurnEntry }
  | { kind: 'initiative'; entry: TurnEntry }
  | { kind: 'hp'; token: Token };

function buildView(state: LiveState, entry: TurnEntry, playerPerspective: boolean, zonesById: Record<string, SessionZone>): EntryView {
  if (entry.type === 'player' || entry.heroId) {
    const hero = entry.heroId ? state.heroes[entry.heroId] ?? null : null;
    const token = hero ? heroTokenOf(state, hero.id) : null;
    const hp: HpInfo | null = hero
      ? {
          hp: hero.data.hp.current,
          maxHp: hero.data.hp.max,
          temp: hero.data.hp.temp || 0,
          ratio: hero.data.hp.max > 0 ? Math.min(1, Math.max(0, hero.data.hp.current / hero.data.hp.max)) : null,
        }
      : null;
    return {
      entry,
      name: entry.name || hero?.name || 'Héroe',
      imageUrl: entry.imageUrl ?? hero?.imageUrl ?? null,
      color: (entry.userId && state.players[entry.userId]?.color) || '#e9c063',
      token,
      hero,
      hp,
      statuses: hero?.data.statuses ?? [],
      masked: false,
    };
  }
  // Players never learn about creatures they cannot see: hidden, out of sight or under unrevealed fog.
  const masked = playerPerspective && isTurnEntryMasked(state, entry, zonesById);
  const token = !masked && entry.tokenId ? state.tokens[entry.tokenId] ?? null : null;
  return {
    entry,
    name: masked ? 'Criatura desconocida' : entry.name,
    imageUrl: masked ? null : entry.imageUrl ?? token?.imageUrl ?? null,
    color: masked ? '#4a4239' : token?.color ?? (entry.type === 'npc' ? '#5fa8d3' : entry.type === 'custom' ? '#a98bff' : '#c43d33'),
    token,
    hero: null,
    hp: token ? tokenHp(state, token) : null,
    statuses: token?.statuses ?? [],
    masked,
  };
}

/** Turn order sidebar: round counter, current turn, DM controls (next/prev, reorder, draw, add/remove). */
export function InitiativePanel() {
  const ctx = usePanelContext();
  const { state, effective } = ctx;
  const viewZoneId = useSessionStore((s) => s.viewZone?.zoneId ?? null);
  const zonesById = useSessionStore((s) => s.zonesById);
  const menu = useContextMenu();
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [editingInit, setEditingInit] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const order = state?.turn.order ?? [];
  const orderSig = order.map((e) => e.id).join('|');
  useEffect(() => setLocalOrder(null), [orderSig]);

  const playerPerspective = !ctx.isDm || ctx.isPreview;
  const views = useMemo(() => {
    if (!state) return [];
    const byId = new Map(state.turn.order.map((e) => [e.id, e]));
    const ids = localOrder ?? state.turn.order.map((e) => e.id);
    return ids
      .map((id) => byId.get(id))
      .filter((e): e is TurnEntry => !!e)
      .map((e) => buildView(state, e, playerPerspective, zonesById));
  }, [state, localOrder, playerPerspective, zonesById]);

  const currentId = state ? state.turn.order[state.turn.currentIndex]?.id ?? null : null;

  // Players who pick a hero mid-game get a token but no turn entry until the DM syncs (the players turn:syncPlayers adds).
  const manageOrder = ctx.canManage;
  const missingPlayers = useMemo(() => {
    if (!state || !manageOrder) return [];
    const inOrder = new Set(state.turn.order.filter((e) => e.type === 'player' && e.userId).map((e) => e.userId));
    return partyMembers(state).filter(({ player }) => player.userId !== state.hostUserId && !inOrder.has(player.userId));
  }, [state, manageOrder]);
  const [syncing, setSyncing] = useState(false);
  const syncPlayers = async () => {
    setSyncing(true);
    await send('turn:syncPlayers', {}, { success: 'Jugadores sincronizados' });
    setSyncing(false);
  };

  // Keep the current entry in view.
  useEffect(() => {
    if (!currentId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-entry-id="${window.CSS.escape(currentId)}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!state) return null;

  if (playerPerspective && effective && !effective.canSeeInitiative && !ctx.canManage) {
    return <EmptyState compact icon={<EyeOff />} title="Iniciativa oculta" description="El DM no comparte el orden de turnos." />;
  }

  const manage = ctx.canManage;

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = views.map((v) => v.entry.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    setLocalOrder(next);
    void send('turn:setOrder', { order: next }).then((ok) => {
      if (!ok) setLocalOrder(null);
    });
  };

  const centerOn = (v: EntryView) => {
    const token = v.token;
    if (token) emitUiEvent('center-on-token', { tokenId: token.id });
  };

  const candidates = Object.values(state.tokens)
    .filter((t) => (t.kind === 'creature' || t.kind === 'npc') && (!viewZoneId || t.zoneId === viewZoneId))
    .filter((t) => !state.turn.order.some((e) => e.tokenId === t.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const addToken = (t: Token) =>
    send('turn:add', {
      entry: { type: t.kind === 'npc' ? 'npc' : 'creature', userId: null, heroId: null, tokenId: t.id, name: t.name, imageUrl: t.imageUrl, initiative: null },
    });

  const openAddMenu = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const items: ContextMenuItem[] = [{ heading: true, label: 'Fichas de esta zona' }];
    if (candidates.length === 0) items.push({ label: 'No quedan criaturas por añadir', disabled: true });
    for (const t of candidates.slice(0, 30)) {
      items.push({
        label: `${t.name}${t.hidden ? ' (oculta)' : ''}`,
        icon: t.kind === 'npc' ? <UserRound /> : <Skull />,
        onClick: () => void addToken(t),
      });
    }
    if (candidates.length > 1) {
      items.push({
        label: `Añadir todas (${candidates.length})`,
        icon: <Users />,
        onClick: () => {
          void (async () => {
            for (const t of candidates) if (!(await addToken(t))) break;
          })();
        },
      });
    }
    items.push({ separator: true });
    items.push({ label: 'Entrada personalizada…', icon: <Pencil />, onClick: () => setPrompt({ kind: 'custom' }) });
    items.push({ label: 'Sincronizar jugadores', icon: <RefreshCw />, onClick: () => void syncPlayers() });
    menu.openAt(Math.max(8, r.left), r.bottom + 4, items);
  };

  const rowMenu = (v: EntryView): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [{ heading: true, label: v.name }];
    items.push({ label: 'Dar el turno', icon: <Play />, onClick: () => void send('turn:setCurrent', { entryId: v.entry.id }) });
    if (v.token) items.push({ label: 'Centrar en la ficha', icon: <Crosshair />, onClick: () => centerOn(v) });
    items.push({ label: 'Cambiar iniciativa…', icon: <Swords />, onClick: () => setPrompt({ kind: 'initiative', entry: v.entry }) });
    items.push({ label: 'Renombrar…', icon: <Pencil />, onClick: () => setPrompt({ kind: 'rename', entry: v.entry }) });
    if (v.token && v.token.kind !== 'item') {
      const tokenId = v.token.id;
      const token = v.token;
      items.push({
        label: 'Puntos de vida',
        icon: <HeartPulse />,
        children: [
          { label: '−5', onClick: () => void send('token:hp', { tokenId, delta: -5 }) },
          { label: '−1', onClick: () => void send('token:hp', { tokenId, delta: -1 }) },
          { label: '+1', onClick: () => void send('token:hp', { tokenId, delta: 1 }) },
          { label: '+5', onClick: () => void send('token:hp', { tokenId, delta: 5 }) },
          { separator: true },
          { label: 'Fijar PV…', onClick: () => setPrompt({ kind: 'hp', token }) },
        ],
      });
    }
    items.push({ separator: true });
    items.push({ label: 'Quitar de la iniciativa', icon: <Trash2 />, danger: true, onClick: () => void send('turn:remove', { entryId: v.entry.id }) });
    return items;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!manage || isEditableTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      void send(e.shiftKey ? 'turn:prev' : 'turn:next', {});
    }
  };

  const current = views.find((v) => v.entry.id === currentId) ?? null;
  const myTurn =
    !!current &&
    !!ctx.viewerId &&
    ctx.viewerId !== ctx.hostUserId &&
    (current.entry.userId === ctx.viewerId || (!!current.hero && state.players[ctx.viewerId]?.heroId === current.hero.id));

  const Row = manage ? SortableInitiativeRow : InitiativeRow;
  const list = (
    <ol ref={listRef} className="space-y-1.5">
      {views.map((v, index) => (
        <Row
          key={v.entry.id}
          view={v}
          index={index}
          current={v.entry.id === currentId}
          manage={manage}
          ctx={ctx}
          editingInit={editingInit === v.entry.id}
          onEditInit={(on) => setEditingInit(on ? v.entry.id : null)}
          onClick={() => centerOn(v)}
          onSetCurrent={() => void send('turn:setCurrent', { entryId: v.entry.id })}
          onRemove={() => void send('turn:remove', { entryId: v.entry.id })}
          onContextMenu={(e) => menu.open(e, rowMenu(v))}
        />
      ))}
    </ol>
  );

  const promptConfig = (): { title: string; fields: PromptField[]; confirm: string; submit: (v: Record<string, string>) => Promise<boolean> } | null => {
    if (!prompt) return null;
    const num = (s: string): number | null => (s.trim() === '' ? null : Math.round(Number(s.replace(',', '.'))));
    switch (prompt.kind) {
      case 'custom':
        return {
          title: 'Entrada personalizada',
          confirm: 'Añadir',
          fields: [
            { key: 'name', label: 'Nombre', placeholder: 'Trampa de pinchos, refuerzos…', required: true },
            { key: 'initiative', label: 'Iniciativa (opcional)', type: 'number', placeholder: '—' },
          ],
          submit: (v) =>
            send('turn:add', {
              entry: { type: 'custom', userId: null, heroId: null, tokenId: null, name: v.name ?? '', imageUrl: null, initiative: num(v.initiative ?? '') },
            }),
        };
      case 'rename':
        return {
          title: 'Renombrar entrada',
          confirm: 'Guardar',
          fields: [{ key: 'name', label: 'Nombre', initial: prompt.entry.name, required: true }],
          submit: (v) => send('turn:update', { entryId: prompt.entry.id, patch: { name: v.name ?? prompt.entry.name } }),
        };
      case 'initiative':
        return {
          title: `Iniciativa de ${prompt.entry.name}`,
          confirm: 'Guardar',
          fields: [
            {
              key: 'initiative',
              label: 'Valor',
              type: 'number',
              initial: prompt.entry.initiative === null ? '' : String(prompt.entry.initiative),
              hint: 'Déjalo vacío para quitar el valor.',
            },
          ],
          submit: (v) => send('turn:update', { entryId: prompt.entry.id, patch: { initiative: num(v.initiative ?? '') } }),
        };
      case 'hp':
        return {
          title: `PV de ${prompt.token.name}`,
          confirm: 'Fijar',
          fields: [
            {
              key: 'hp',
              label: prompt.token.maxHp !== null ? `PV actuales (máx. ${prompt.token.maxHp})` : 'PV actuales',
              type: 'number',
              initial: prompt.token.hp === null ? '' : String(prompt.token.hp),
              required: true,
            },
          ],
          submit: (v) => send('token:hp', { tokenId: prompt.token.id, set: Math.max(0, num(v.hp ?? '') ?? 0) }),
        };
    }
  };
  const pc = promptConfig();

  return (
    <div className="flex h-full min-h-0 flex-col outline-none" tabIndex={manage ? 0 : undefined} onKeyDown={onKeyDown} aria-label="Iniciativa">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <div className="relative flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-full border border-gold-600/70 bg-gradient-to-b from-ink-700 to-ink-900 shadow-glow-gold" title="Ronda actual">
          <span className="text-[8px] font-semibold uppercase leading-none tracking-[0.15em] text-gold-400">Ronda</span>
          <span className="font-display text-lg font-bold leading-none text-gold-200">{state.turn.round}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-parchment-400">{state.turn.mode === 'random' ? 'Orden sorteado' : 'Orden manual'}</div>
          <div className="truncate font-display text-sm font-semibold text-parchment-50" title={current ? `Turno de ${current.name}` : undefined}>
            {current ? (
              <>
                Turno de <span className="text-gold-300">{current.name}</span>
              </>
            ) : views.length > 0 ? (
              'Sin turno activo'
            ) : (
              'Sin combatientes'
            )}
          </div>
        </div>
        {myTurn && (
          <span className="shrink-0 animate-pop rounded-full border border-gold-400/70 bg-gold-500/20 px-2 py-0.5 font-display text-[11px] font-bold uppercase tracking-wider text-gold-100 shadow-glow-gold">
            ¡Tu turno!
          </span>
        )}
        {manage && <IconButton icon={<UserPlus />} title="Añadir a la iniciativa" size="sm" variant="secondary" onClick={openAddMenu} />}
      </div>

      {manage && missingPlayers.length > 0 && views.length > 0 && (
        <div role="status" className="mb-2 flex shrink-0 animate-fade-in items-start gap-2 rounded-lg border border-gold-600/50 bg-gold-500/10 px-2.5 py-2 text-[11px] leading-snug text-parchment-200">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-gold-400" aria-hidden />
          <span className="min-w-0 flex-1">
            <strong className="text-parchment-50">{missingPlayers.map(({ player, hero }) => `${player.name} (${hero.name})`).join(', ')}</strong>{' '}
            {missingPlayers.length === 1 ? 'ya tiene héroe pero no está' : 'ya tienen héroe pero no están'} en la iniciativa.
          </span>
          <button
            type="button"
            className="shrink-0 font-semibold text-gold-300 underline-offset-2 hover:text-gold-200 hover:underline disabled:opacity-50"
            disabled={syncing}
            onClick={() => void syncPlayers()}
            title="Añadir a la iniciativa a los jugadores que ya tienen héroe"
          >
            Sincronizar
          </button>
        </div>
      )}

      <div className="scroll-thin -mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {views.length === 0 ? (
          <EmptyState
            compact
            icon={<Swords />}
            title="La iniciativa está vacía"
            description={manage ? 'Sincroniza a los jugadores y añade criaturas de la zona.' : 'El DM aún no ha preparado el orden de turnos.'}
            action={
              manage ? (
                <>
                  <Button size="sm" variant="secondary" icon={<RefreshCw />} loading={syncing} onClick={() => void syncPlayers()}>
                    Sincronizar jugadores
                  </Button>
                  <Button size="sm" variant="ghost" icon={<UserPlus />} onClick={openAddMenu}>
                    Añadir
                  </Button>
                </>
              ) : undefined
            }
          />
        ) : manage ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={views.map((v) => v.entry.id)} strategy={verticalListSortingStrategy}>
              {list}
            </SortableContext>
          </DndContext>
        ) : (
          list
        )}
      </div>

      {manage && (
        <div className="mt-2 shrink-0 space-y-1.5 border-t border-ink-600/70 pt-2">
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="secondary" icon={<ChevronLeft />} onClick={() => void send('turn:prev', {})} disabled={views.length === 0} title="Turno anterior (Mayús+N)">
              Anterior
            </Button>
            <Button
              size="sm"
              variant="primary"
              epic
              className="flex-1"
              iconRight={<ChevronRight />}
              onClick={() => void send('turn:next', {})}
              disabled={views.length === 0}
              title="Siguiente turno (N)"
            >
              Siguiente
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" icon={<Shuffle />} className="flex-1" onClick={() => void send('turn:randomize', {})} disabled={views.length === 0} title="Tirar iniciativa para todos (d20 con animación)">
              Sortear
            </Button>
            <Button size="sm" variant="ghost" icon={<UserPlus />} className="flex-1" onClick={openAddMenu}>
              Añadir
            </Button>
          </div>
          <p className="hidden text-center text-[10px] text-parchment-400 sm:block" title="Atajos con el panel enfocado">
            <Kbd>N</Kbd> siguiente · <Kbd>Mayús</Kbd>+<Kbd>N</Kbd> anterior
          </p>
        </div>
      )}

      {pc && (
        <PromptDialog
          open
          title={pc.title}
          icon={<Swords />}
          fields={pc.fields}
          confirmLabel={pc.confirm}
          onClose={() => setPrompt(null)}
          onSubmit={(v) => pc.submit(v)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface InitiativeRowProps {
  view: EntryView;
  index: number;
  current: boolean;
  manage: boolean;
  ctx: PanelContext;
  editingInit: boolean;
  onEditInit: (on: boolean) => void;
  onClick: () => void;
  onSetCurrent: () => void;
  onRemove: () => void;
  onContextMenu: (e: MouseEvent) => void;
  /** dnd-kit bindings (DM rows rendered inside the sortable context). */
  sortable?: ReturnType<typeof useSortable>;
}

/** DM row: registers with the sortable context and delegates rendering. */
function SortableInitiativeRow(props: Omit<InitiativeRowProps, 'sortable'>) {
  const sortable = useSortable({ id: props.view.entry.id });
  return <InitiativeRow {...props} sortable={sortable} />;
}

function InitiativeRow({ view, index, current, manage, ctx, editingInit, onEditInit, onClick, onSetCurrent, onRemove, onContextMenu, sortable }: InitiativeRowProps) {
  const { entry, token } = view;
  const style = sortable
    ? { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, zIndex: sortable.isDragging ? 10 : undefined }
    : undefined;
  const creature = !!token && (token.kind === 'creature' || token.kind === 'npc');
  const isOwn = !!view.hero && ctx.state?.players[ctx.viewerId ?? '']?.heroId === view.hero.id;
  const typeIcon =
    entry.type === 'player' ? null : entry.type === 'npc' ? <UserRound className="h-3 w-3" /> : entry.type === 'custom' ? <Pencil className="h-3 w-3" /> : <Skull className="h-3 w-3" />;

  return (
    <li
      ref={sortable?.setNodeRef}
      style={style}
      data-entry-id={entry.id}
      onContextMenu={manage ? onContextMenu : undefined}
      onDoubleClick={manage ? onSetCurrent : undefined}
      className={clsx(
        'group relative flex items-center gap-2 rounded-lg border py-1.5 pr-1.5 transition-[background-color,border-color,box-shadow] duration-300',
        sortable ? 'pl-4' : 'pl-1.5',
        current
          ? 'border-gold-400/80 bg-gradient-to-r from-gold-500/20 via-ink-800/90 to-ink-800/90 shadow-[0_0_0_1px_rgba(233,192,99,0.35),0_0_22px_-4px_rgba(233,192,99,0.65)]'
          : 'border-ink-600/70 bg-ink-800/60 hover:border-ink-500 hover:bg-ink-800',
        sortable?.isDragging && 'opacity-90 shadow-modal',
        view.masked && 'opacity-70',
      )}
    >
      {current && <span aria-hidden className="absolute -left-[3px] top-1/2 h-6 w-1 -translate-y-1/2 animate-glow-pulse rounded-full bg-gold-300" />}
      {sortable ? (
        // Drag handle over the left padding: it takes no width from the name.
        <button
          type="button"
          className="absolute inset-y-0 left-0 flex w-4 cursor-grab items-center justify-center rounded-l-lg text-parchment-400/50 transition hover:bg-ink-700/60 hover:text-parchment-100 active:cursor-grabbing"
          aria-label={`Reordenar ${view.name}`}
          title="Arrastra para reordenar"
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical className="h-3 w-3" />
        </button>
      ) : (
        <span className="w-3.5 shrink-0 text-center text-[10px] font-semibold tabular-nums text-parchment-400">{index + 1}</span>
      )}

      <button type="button" className="shrink-0" onClick={onClick} title={view.token ? 'Centrar el mapa en la ficha' : view.name} disabled={!view.token}>
        <Avatar name={view.masked ? '?' : view.name} imageUrl={view.imageUrl} color={view.color} size="sm" ring={current} />
      </button>

      <button type="button" className="min-w-0 flex-1 text-left" onClick={onClick} disabled={!view.token}>
        <span className="flex items-center gap-1">
          {typeIcon && <span className="shrink-0 text-parchment-400">{typeIcon}</span>}
          <span className={clsx('truncate text-sm font-medium', current ? 'text-gold-100' : 'text-parchment-100', isOwn && 'underline decoration-gold-500/60 underline-offset-2')}>
            {view.name}
          </span>
          {token?.hidden && manage && <EyeOff className="h-3 w-3 shrink-0 text-parchment-400" aria-label="Oculta a los jugadores" />}
        </span>
        {view.hp && view.hp.ratio !== null && !view.masked && <HpBar info={view.hp} size="xs" className="mt-1" />}
        {view.statuses.length > 0 && !view.masked && <StatusIcons statuses={view.statuses} size="xs" max={5} className="mt-1" />}
      </button>

      <InitiativeValue value={entry.initiative} editable={manage} editing={editingInit} onEditing={onEditInit} entryId={entry.id} current={current} />

      {manage && !editingInit && (
        // Floating quick actions (hover / keyboard focus): they overlay the row instead of taking width.
        <div className="pointer-events-none absolute right-11 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 rounded-md border border-ink-500/80 bg-ink-900/95 p-0.5 opacity-0 shadow-panel transition duration-150 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
          {creature && token && (
            <>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded text-blood-300 transition hover:bg-blood-600/30"
                title="−1 PV (Mayús: −5)"
                aria-label={`Dañar a ${view.name}`}
                onClick={(e) => void send('token:hp', { tokenId: token.id, delta: e.shiftKey ? -5 : -1 })}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded text-emerald-300 transition hover:bg-emerald-600/30"
                title="+1 PV (Mayús: +5)"
                aria-label={`Curar a ${view.name}`}
                onClick={(e) => void send('token:hp', { tokenId: token.id, delta: e.shiftKey ? 5 : 1 })}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <span aria-hidden className="mx-0.5 h-4 w-px bg-ink-500" />
            </>
          )}
          {!current && <IconButton icon={<Play />} title="Dar el turno (doble clic en la fila)" size="xs" onClick={onSetCurrent} />}
          <IconButton icon={<X />} title="Quitar de la iniciativa" size="xs" variant="danger" onClick={onRemove} />
        </div>
      )}
    </li>
  );
}

function InitiativeValue({
  value,
  editable,
  editing,
  onEditing,
  entryId,
  current,
}: {
  value: number | null;
  editable: boolean;
  editing: boolean;
  onEditing: (on: boolean) => void;
  entryId: string;
  current: boolean;
}) {
  const [text, setText] = useState('');
  /** Value shown between the commit and the server echo (undefined = show the real value). */
  const [optimistic, setOptimistic] = useState<number | null | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Set once the edit is closed (Enter / Escape) so a trailing blur does nothing. */
  const cancelled = useRef(false);

  useEffect(() => {
    if (!editing) return;
    cancelled.current = false;
    setText(value === null ? '' : String(value));
    const input = inputRef.current;
    if (input) {
      input.focus({ preventScroll: true });
      input.select();
    }
    // Initialise only when editing starts: a server echo must not overwrite what is being typed.
  }, [editing]);

  // The server echo (or any newer value) replaces the optimistic one.
  useEffect(() => setOptimistic(undefined), [value]);

  const commit = () => {
    if (cancelled.current) return;
    // Enter commits and unmounts the input; the blur that may follow must not send it twice.
    cancelled.current = true;
    onEditing(false);
    const raw = text.trim().replace(',', '.');
    const next = raw === '' ? null : Math.round(Number(raw));
    if (next !== null && !Number.isFinite(next)) return;
    if (next === value) return;
    setOptimistic(next);
    void send('turn:update', { entryId, patch: { initiative: next } }).then((ok) => {
      if (!ok) setOptimistic(undefined);
    });
  };

  const shown = optimistic !== undefined ? optimistic : value;

  const badge = clsx(
    'flex h-8 w-9 shrink-0 items-center justify-center rounded-md border font-display text-sm font-bold tabular-nums',
    current ? 'border-gold-400/70 bg-gold-500/15 text-gold-200' : 'border-ink-500 bg-ink-950/60 text-parchment-100',
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={text}
        autoFocus
        inputMode="numeric"
        aria-label="Iniciativa"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') {
            cancelled.current = true;
            onEditing(false);
          }
        }}
        className="input h-8 w-11 shrink-0 px-1 py-0 text-center text-sm font-bold tabular-nums"
      />
    );
  }

  return editable ? (
    <button type="button" className={clsx(badge, 'transition hover:border-gold-500')} title="Clic para editar la iniciativa" onClick={() => onEditing(true)}>
      {shown ?? '—'}
    </button>
  ) : (
    <span className={badge} title="Iniciativa">
      {shown ?? '—'}
    </span>
  );
}
