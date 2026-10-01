import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowDown, EyeOff, Lock, ScrollText } from 'lucide-react';
import { normalizeText, type LogEntry, type LogType, type RollResult } from '@wailers/shared';
import { withAlpha } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { SearchInput } from '../../components/ui/SearchInput';
import { formatDateTime, formatTime } from '../../lib/format';
import { useSessionStore } from '../../stores/session';
import { useUsers } from '../../stores/users';
import { usePanelContext } from './panels/context';
import { asRollResult, LOG_FILTERS, LOG_TYPE_META, rollBreakdown, type LogFilterId } from './panels/logMeta';

const STICK_THRESHOLD = 48;

/** Session log: every line visible to me, with filters, search and auto-scroll. */
export function LogPanel() {
  const log = useSessionStore((s) => s.log);
  const ctx = usePanelContext();
  const { users } = useUsers();
  const [filter, setFilter] = useState<LogFilterId>('all');
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const seenCount = useRef(0);
  const [unseen, setUnseen] = useState(0);

  const people = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const u of users) map.set(u.id, { name: u.name, color: u.color });
    if (ctx.state) for (const p of Object.values(ctx.state.players)) map.set(p.userId, { name: p.name, color: p.color });
    return map;
  }, [users, ctx.state]);

  const counts = useMemo(() => {
    const byType = new Map<LogType, number>();
    for (const e of log) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    const out: Record<LogFilterId, number> = { all: log.length, rolls: 0, chat: 0, system: 0, hpItems: 0, turns: 0, fx: 0 };
    for (const f of LOG_FILTERS) if (f.types) out[f.id] = f.types.reduce((n, t) => n + (byType.get(t) ?? 0), 0);
    return out;
  }, [log]);

  const visible = useMemo(() => {
    const types = LOG_FILTERS.find((f) => f.id === filter)?.types ?? null;
    const q = normalizeText(query);
    return log.filter((e) => {
      if (types && !types.includes(e.type)) return false;
      if (q && !normalizeText(`${e.actorName ?? ''} ${e.text}`).includes(q)) return false;
      return true;
    });
  }, [log, filter, query]);

  // Keep pinned to the bottom when new lines arrive (unless the user scrolled up).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const added = Math.max(0, visible.length - seenCount.current);
    seenCount.current = visible.length;
    if (stick.current) {
      el.scrollTop = el.scrollHeight;
      setUnseen(0);
    } else if (added > 0) {
      setUnseen((n) => n + added);
    }
  }, [visible]);

  // Filter / search change: jump to the newest lines.
  useEffect(() => {
    stick.current = true;
    setUnseen(0);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filter, query]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
    stick.current = atBottom;
    if (atBottom && unseen > 0) setUnseen(0);
  };

  const jumpToEnd = () => {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = true;
    setUnseen(0);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  return (
    <div className="flex h-full min-h-[18rem] flex-col">
      <div className="shrink-0 space-y-2 pb-2">
        <SearchInput size="sm" value={query} onChange={setQuery} debounceMs={150} placeholder="Buscar en el registro…" />
        <div className="no-scrollbar -mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-0.5" role="tablist" aria-label="Filtrar registro">
          {LOG_FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.id)}
                className={clsx(
                  'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition',
                  active
                    ? 'border-gold-500/70 bg-gold-500/15 text-gold-200 shadow-[0_0_10px_-4px_rgba(233,192,99,0.8)]'
                    : 'border-ink-500 bg-ink-800/70 text-parchment-300 hover:border-ink-400 hover:text-parchment-100',
                )}
              >
                {f.label}
                {counts[f.id] > 0 && <span className={clsx('text-[10px] tabular-nums', active ? 'text-gold-300/80' : 'text-parchment-400')}>{counts[f.id]}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="scroll-thin absolute inset-0 overflow-y-auto pr-1">
          {visible.length === 0 ? (
            <EmptyState
              compact
              icon={<ScrollText />}
              title={log.length === 0 ? 'El registro está en blanco' : 'Nada coincide'}
              description={log.length === 0 ? 'Aquí aparecerán tiradas, cambios de PV, turnos y mensajes.' : 'Prueba con otro filtro o búsqueda.'}
            />
          ) : (
            <ol className="space-y-0.5 py-1">
              {visible.map((entry) => (
                <LogLine key={entry.id} entry={entry} people={people} hostUserId={ctx.hostUserId} />
              ))}
            </ol>
          )}
        </div>
        {unseen > 0 && (
          <button
            type="button"
            onClick={jumpToEnd}
            className="absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 animate-slide-up items-center gap-1 rounded-full border border-gold-500/70 bg-ink-900/95 px-3 py-1 text-xs font-semibold text-gold-200 shadow-glow-gold"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            {unseen === 1 ? '1 nuevo' : `${unseen} nuevos`}
          </button>
        )}
      </div>
    </div>
  );
}

interface LogLineProps {
  entry: LogEntry;
  people: Map<string, { name: string; color: string }>;
  hostUserId: string | null;
}

const LogLine = memo(function LogLine({ entry, people, hostUserId }: LogLineProps) {
  const meta = LOG_TYPE_META[entry.type] ?? LOG_TYPE_META.system;
  const actor = entry.actorUserId ? people.get(entry.actorUserId) : undefined;
  const actorName = entry.actorName ?? actor?.name ?? null;
  const actorColor = entry.actorUserId === hostUserId ? '#e9c063' : actor?.color ?? '#cdb98f';
  const roll = entry.type === 'roll' ? asRollResult(entry.data) : null;
  const target = entry.targetUserId ? people.get(entry.targetUserId)?.name ?? (entry.targetUserId === hostUserId ? 'DM' : null) : null;
  const isChat = entry.type === 'chat';

  return (
    <li
      className={clsx(
        'group flex gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-ink-800/70',
        entry.visibility === 'dm' && 'bg-arcane-500/[0.06]',
        entry.visibility === 'user' && 'bg-sky-500/[0.05]',
      )}
    >
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border [&>svg]:h-3 [&>svg]:w-3"
        style={{ color: meta.color, borderColor: withAlpha(meta.color, 0.35), backgroundColor: withAlpha(meta.color, 0.1) }}
        title={meta.label}
      >
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          {actorName && (
            <span className="truncate text-xs font-semibold" style={{ color: actorColor }}>
              {actorName}
            </span>
          )}
          {entry.visibility === 'dm' && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-arcane-300" title="Solo lo ve el DM">
              <EyeOff className="h-2.5 w-2.5" />
              solo DM
            </span>
          )}
          {entry.visibility === 'user' && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-sky-300" title="Privado">
              <Lock className="h-2.5 w-2.5" />
              {isChat ? (target ? `susurro a ${target}` : 'susurro') : target ? `para ${target}` : 'privado'}
            </span>
          )}
          <time className="ml-auto shrink-0 text-[10px] tabular-nums text-parchment-400/80" dateTime={entry.at} title={formatDateTime(entry.at)}>
            {formatTime(entry.at)}
          </time>
        </div>
        <p className={clsx('whitespace-pre-line break-words text-xs leading-snug', isChat ? 'text-parchment-50' : 'text-parchment-200')}>{entry.text}</p>
        {roll && <RollDetails roll={roll} />}
      </div>
    </li>
  );
});

function RollDetails({ roll }: { roll: RollResult }) {
  const breakdown = rollBreakdown(roll);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {roll.kind === 'dice' && typeof roll.total === 'number' && (
        <span
          className={clsx(
            'inline-flex min-w-[1.75rem] items-center justify-center rounded-md border px-1.5 font-display text-sm font-bold tabular-nums',
            roll.crit === 'success'
              ? 'border-emerald-400/70 bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_-4px_rgba(52,211,153,0.9)]'
              : roll.crit === 'fail'
                ? 'border-blood-500/70 bg-blood-500/15 text-blood-300'
                : 'border-gold-600/60 bg-gold-500/10 text-gold-200',
          )}
        >
          {roll.total}
        </span>
      )}
      {breakdown && <code className="truncate font-mono text-[10px] text-parchment-400">{breakdown}</code>}
      {roll.mode !== 'normal' && roll.kind === 'dice' && (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">{roll.mode === 'advantage' ? 'Ventaja' : 'Desventaja'}</span>
      )}
      {roll.crit === 'success' && <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">¡Crítico!</span>}
      {roll.crit === 'fail' && <span className="text-[10px] font-bold uppercase tracking-wider text-blood-300">Pifia</span>}
      {roll.kind === 'roulette' && roll.segment && (
        <span
          className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
          style={{ color: roll.segment.color, borderColor: withAlpha(roll.segment.color, 0.6), backgroundColor: withAlpha(roll.segment.color, 0.14) }}
          title={roll.segment.description || undefined}
        >
          {roll.segment.icon && <span aria-hidden>{roll.segment.icon}</span>}
          <span className="truncate">{roll.segment.label}</span>
        </span>
      )}
      {roll.kind === 'custom_die' && roll.face && (
        <span className="inline-flex items-center rounded-md border border-gold-600/60 bg-gold-500/10 px-2 py-0.5 text-[11px] font-semibold text-gold-200">{roll.face}</span>
      )}
    </div>
  );
}
