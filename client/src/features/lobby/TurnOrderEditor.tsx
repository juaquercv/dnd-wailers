import { useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Dices, EyeOff, GripVertical, Hand, ListOrdered, Play, UserRoundCheck, X } from 'lucide-react';
import type { TurnEntry } from '@wailers/shared';
import { emitAck } from '../../api/socket';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { Tabs } from '../../components/ui/Tabs';
import { toast } from '../../components/ui/toast';
import { useSessionStore } from '../../stores/session';
import { Portrait, useUserDirectory, type UserLookup } from './lobbyUi';

export interface TurnOrderEditorProps {
  compact?: boolean;
}

const TYPE_INFO: Record<TurnEntry['type'], { label: string; color: string }> = {
  player: { label: 'Jugador', color: '#d4a63f' },
  creature: { label: 'Criatura', color: '#c43d33' },
  npc: { label: 'PNJ', color: '#38bdf8' },
  custom: { label: 'Otro', color: '#a98bff' },
};

const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

function entryColor(entry: TurnEntry, lookup: UserLookup): string {
  if (entry.type === 'player' && entry.userId) return lookup(entry.userId).color;
  return TYPE_INFO[entry.type].color;
}

/** Inline initiative value: local draft, committed on blur / Enter (Esc cancels). */
function InitiativeField({ value, name, onCommit, compact }: { value: number | null; name: string; onCommit: (v: number | null) => void; compact: boolean }) {
  const toText = (v: number | null) => (v === null ? '' : String(v));
  const [draft, setDraft] = useState(toText(value));
  const focused = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(toText(value));
  }, [value]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(toText(value));
      return;
    }
    const t = draft.trim();
    const next = t === '' || t === '-' ? null : Number.parseInt(t, 10);
    if (next !== null && !Number.isFinite(next)) {
      setDraft(toText(value));
      return;
    }
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={draft}
      placeholder="—"
      title="Iniciativa (editable)"
      aria-label={`Iniciativa de ${name}`}
      className={clsx('input input-sm text-center font-semibold tabular-nums', compact ? 'w-10 px-1' : 'w-12')}
      onChange={(e) => {
        if (/^-?\d{0,3}$/.test(e.target.value)) setDraft(e.target.value);
      }}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

interface RowProps {
  entry: TurnEntry;
  index: number;
  compact: boolean;
  isCurrent: boolean;
  mine: boolean;
  color: string;
  /** DM controls (initiative edit, remove, set current). */
  dm: boolean;
  showSetCurrent: boolean;
  onRemove?: () => void;
  onInitiative?: (v: number | null) => void;
  onSetCurrent?: () => void;
  /** Drag handle props (sortable rows only). */
  handle?: { ref: (el: HTMLElement | null) => void; props: HTMLAttributes<HTMLElement> } | null;
  dragging?: boolean;
}

function TurnRowView({ entry, index, compact, isCurrent, mine, color, dm, showSetCurrent, onRemove, onInitiative, onSetCurrent, handle, dragging }: RowProps) {
  const type = TYPE_INFO[entry.type];
  return (
    <div
      className={clsx(
        'group flex items-center rounded-lg border transition-colors',
        compact ? 'gap-1.5 px-1.5 py-1' : 'gap-2.5 px-2 py-1.5',
        dragging
          ? 'border-gold-400/80 bg-ink-700 shadow-glow-gold'
          : isCurrent
            ? 'border-gold-500/70 bg-gradient-to-r from-gold-500/20 to-ink-800/80'
            : mine
              ? 'border-gold-700/40 bg-ink-800/80'
              : 'border-ink-600/80 bg-ink-800/60 hover:border-ink-500',
      )}
    >
      {handle && (
        <button
          type="button"
          ref={handle.ref}
          {...handle.props}
          className="-ml-0.5 flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-parchment-400 hover:bg-ink-700 hover:text-gold-300 active:cursor-grabbing"
          title="Arrastra para reordenar"
          aria-label={`Mover a ${entry.name}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <span
        className={clsx(
          'flex shrink-0 items-center justify-center rounded-full font-display font-bold tabular-nums',
          compact ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-xs',
          isCurrent ? 'bg-gold-sheen text-ink-950 shadow-glow-gold' : 'border border-ink-500 bg-ink-900 text-parchment-300',
        )}
        aria-label={`Posición ${index + 1}`}
      >
        {isCurrent ? <Play className="h-3 w-3 fill-current" /> : index + 1}
      </span>
      <Portrait name={entry.name} imageUrl={entry.imageUrl} color={color} size={compact ? 26 : 34} shape="circle" glow={isCurrent} />
      <div className="min-w-0 flex-1">
        <div className={clsx('truncate font-medium', compact ? 'text-xs' : 'text-sm', isCurrent ? 'text-gold-100' : 'text-parchment-100')}>
          {entry.name}
          {mine && <span className="ml-1 text-[10px] font-normal text-gold-300">(tú)</span>}
        </div>
        {!compact && (
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: type.color }}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            {type.label}
          </div>
        )}
      </div>
      {dm && onInitiative ? (
        <InitiativeField value={entry.initiative} name={entry.name} onCommit={onInitiative} compact={compact} />
      ) : (
        <span
          className={clsx(
            'shrink-0 rounded-md border border-ink-500 bg-ink-900 text-center font-semibold tabular-nums text-parchment-100',
            compact ? 'min-w-[1.75rem] px-1 text-[11px]' : 'min-w-[2.25rem] px-1.5 py-0.5 text-xs',
          )}
          title="Iniciativa"
        >
          {entry.initiative ?? '—'}
        </span>
      )}
      {dm && (
        <div className="flex shrink-0 items-center opacity-70 transition-opacity group-hover:opacity-100">
          {showSetCurrent && !isCurrent && onSetCurrent && (
            <IconButton icon={<Play />} title={`Dar el turno a ${entry.name}`} size="xs" onClick={onSetCurrent} />
          )}
          {onRemove && <IconButton icon={<X />} title={`Quitar a ${entry.name} del orden`} size="xs" variant="danger" onClick={onRemove} />}
        </div>
      )}
    </div>
  );
}

function SortableTurnRow(props: Omit<RowProps, 'handle' | 'dragging'> & { sortable: boolean }) {
  const { sortable, ...rest } = props;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.entry.id,
    disabled: !sortable,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined, position: 'relative' }}
      className={clsx(isDragging && 'opacity-95')}
    >
      <TurnRowView
        {...rest}
        dragging={isDragging}
        handle={
          sortable
            ? { ref: setActivatorNodeRef, props: { ...attributes, ...((listeners ?? {}) as HTMLAttributes<HTMLElement>) } }
            : null
        }
      />
    </li>
  );
}

async function run(action: Promise<unknown>, fallback: string): Promise<boolean> {
  try {
    await action;
    return true;
  } catch (err) {
    toast.fromError(err, fallback);
    return false;
  }
}

/** Turn order: DM edits mode / order (drag & drop in manual mode) / draws; players read it when allowed. */
export function TurnOrderEditor({ compact = false }: TurnOrderEditorProps) {
  const turn = useSessionStore((s) => s.view?.state.turn ?? null);
  const status = useSessionStore((s) => s.view?.state.status ?? 'lobby');
  const isDm = useSessionStore((s) => s.view?.role === 'dm');
  const meUserId = useSessionStore((s) => s.view?.meUserId ?? '');
  const canSee = useSessionStore((s) => s.view?.effective.canSeeInitiative ?? false);
  const lookup = useUserDirectory();

  const [optimistic, setOptimistic] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<'mode' | 'random' | 'sync' | null>(null);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const serverSig = turn ? turn.order.map((e) => e.id).join('|') : '';
  useEffect(() => {
    setOptimistic(null);
  }, [serverSig]);
  useEffect(
    () => () => {
      if (revertTimer.current) clearTimeout(revertTimer.current);
    },
    [],
  );

  const entries = useMemo(() => {
    if (!turn) return [];
    if (!optimistic) return turn.order;
    const byId = new Map(turn.order.map((e) => [e.id, e]));
    const ordered = optimistic.map((id) => byId.get(id)).filter((e): e is TurnEntry => !!e);
    return ordered.length === turn.order.length ? ordered : turn.order;
  }, [turn, optimistic]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!turn) return null;

  const inGame = status !== 'lobby';
  const currentId = inGame ? turn.order[turn.currentIndex]?.id ?? null : null;
  const manual = turn.mode === 'manual';

  const header = inGame && entries.length > 0 && (
    <div className="flex items-center justify-between text-[11px] text-parchment-300">
      <span className="font-display font-semibold uppercase tracking-[0.14em] text-gold-300">Ronda {turn.round}</span>
      <span>
        Turno de <strong className="text-parchment-100">{turn.order[turn.currentIndex]?.name ?? '—'}</strong>
      </span>
    </div>
  );

  // ---------------------------------------------------------------- players
  if (!isDm) {
    if (!canSee) {
      return (
        <EmptyState
          compact
          icon={<EyeOff />}
          title="Orden de turnos oculto"
          description="El DM mantiene el orden de turnos en secreto."
          className={compact ? 'py-4' : undefined}
        />
      );
    }
    if (entries.length === 0) {
      return (
        <EmptyState
          compact
          icon={<ListOrdered />}
          title="Sin orden de turnos"
          description="El DM aún no ha preparado el orden de turnos."
          className={compact ? 'py-4' : undefined}
        />
      );
    }
    return (
      <div className={clsx('flex flex-col', compact ? 'gap-1.5' : 'gap-2')}>
        {header}
        <ol className={clsx('flex flex-col', compact ? 'gap-1' : 'gap-1.5')} aria-label="Orden de turnos">
          {entries.map((entry, i) => (
            <li key={entry.id}>
              <TurnRowView
                entry={entry}
                index={i}
                compact={compact}
                isCurrent={entry.id === currentId}
                mine={entry.userId === meUserId}
                color={entryColor(entry, lookup)}
                dm={false}
                showSetCurrent={false}
              />
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // ---------------------------------------------------------------- DM
  const setMode = async (mode: 'manual' | 'random') => {
    if (mode === turn.mode || busy) return;
    setBusy('mode');
    await run(emitAck('turn:setMode', { mode }), 'No se pudo cambiar el modo de turnos');
    setBusy(null);
  };

  const randomize = async () => {
    if (busy) return;
    setBusy('random');
    await run(emitAck('turn:randomize', {}), 'No se pudo sortear el orden');
    setBusy(null);
  };

  const syncPlayers = async () => {
    if (busy) return;
    setBusy('sync');
    const ok = await run(emitAck('turn:syncPlayers', {}), 'No se pudo sincronizar a los jugadores');
    if (ok) toast.success('Jugadores sincronizados con el orden de turnos');
    setBusy(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = entries.map((x) => x.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    setOptimistic(next);
    if (revertTimer.current) clearTimeout(revertTimer.current);
    emitAck('turn:setOrder', { order: next })
      .then(() => {
        // The broadcast normally replaces the optimistic order; fall back to the server truth if it never comes.
        revertTimer.current = setTimeout(() => setOptimistic(null), 1500);
      })
      .catch((err: unknown) => {
        setOptimistic(null);
        toast.fromError(err, 'No se pudo reordenar el turno');
      });
  };

  const removeEntry = (entry: TurnEntry) => {
    void run(emitAck('turn:remove', { entryId: entry.id }), 'No se pudo quitar del orden');
  };

  const setInitiative = (entry: TurnEntry, initiative: number | null) => {
    void run(emitAck('turn:update', { entryId: entry.id, patch: { initiative } }), 'No se pudo guardar la iniciativa');
  };

  const setCurrent = (entry: TurnEntry) => {
    void run(emitAck('turn:setCurrent', { entryId: entry.id }), 'No se pudo cambiar el turno');
  };

  const actionButton = (key: 'random' | 'sync', label: string, icon: ReactNode, onClick: () => void, variant: 'primary' | 'secondary') =>
    compact ? (
      <IconButton
        key={key}
        icon={icon}
        title={label}
        size="sm"
        variant={variant}
        loading={busy === key}
        disabled={busy !== null && busy !== key}
        onClick={onClick}
      />
    ) : (
      <Button key={key} size="sm" variant={variant} icon={icon} loading={busy === key} disabled={busy !== null && busy !== key} onClick={onClick}>
        {label}
      </Button>
    );

  return (
    <div className={clsx('flex flex-col', compact ? 'gap-2' : 'gap-3')}>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          variant="pills"
          size="sm"
          aria-label="Modo del orden de turnos"
          value={turn.mode}
          onChange={(m) => void setMode(m)}
          items={[
            { id: 'manual', label: 'Manual', icon: <Hand />, title: 'Ordenas tú arrastrando', disabled: busy === 'mode' },
            { id: 'random', label: 'Aleatorio', icon: <Dices />, title: 'Sorteo con d20 visible para todos', disabled: busy === 'mode' },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5">
          {!manual &&
            actionButton('random', 'Sortear orden', <Dices />, () => void randomize(), 'primary')}
          {actionButton('sync', 'Sincronizar jugadores', <UserRoundCheck />, () => void syncPlayers(), 'secondary')}
        </div>
      </div>
      {!compact && (
        <p className="-mt-1 text-[11px] leading-snug text-parchment-400">
          {manual
            ? 'Arrastra a los participantes para fijar el orden. Puedes anotar la iniciativa a mano.'
            : 'Cada participante tira un d20 en un sorteo animado que verán todos los jugadores.'}
        </p>
      )}
      {header}

      {entries.length === 0 ? (
        <EmptyState
          compact
          icon={<ListOrdered />}
          title="Nadie en el orden de turnos"
          description="Pulsa «Sincronizar jugadores» para añadir a los aventureros de la sala."
          className="rounded-lg border border-dashed border-ink-500/70"
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
          <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <ol className={clsx('flex flex-col', compact ? 'gap-1' : 'gap-1.5')} aria-label="Orden de turnos">
              {entries.map((entry, i) => (
                <SortableTurnRow
                  key={entry.id}
                  entry={entry}
                  index={i}
                  compact={compact}
                  sortable={manual}
                  isCurrent={entry.id === currentId}
                  mine={false}
                  color={entryColor(entry, lookup)}
                  dm
                  showSetCurrent={inGame}
                  onRemove={() => removeEntry(entry)}
                  onInitiative={(v) => setInitiative(entry, v)}
                  onSetCurrent={() => setCurrent(entry)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      {!compact && entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-parchment-400">
          <Badge size="xs" tone="outline">
            {entries.length} {entries.length === 1 ? 'participante' : 'participantes'}
          </Badge>
          {!manual && entries.some((e) => e.initiative === null) && <span>Hay participantes sin iniciativa: sortea para asignarla.</span>}
        </div>
      )}
    </div>
  );
}
