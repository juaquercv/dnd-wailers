import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Crown, Globe, History, Lock, UserRound } from 'lucide-react';
import type { RollResult } from '@wailers/shared';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatTime } from '../../lib/format';
import { useSessionStore } from '../../stores/session';
import { DieGlyph } from './DieShapes';
import { useUserLookup } from './diceHooks';
import { isRollResult, MODE_LABELS, rollBreakdown, rollTitle } from './diceUtils';
import { MiniWheel } from './RouletteWheel';

export interface RollHistoryProps {
  compact?: boolean;
}

type Filter = 'all' | 'mine' | 'dm';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'mine', label: 'Mías' },
  { id: 'dm', label: 'DM' },
];

const PAGE = 40;

/** Roll log of the session (newest first) with filters. Read-only. */
export function RollHistory({ compact = false }: RollHistoryProps) {
  const log = useSessionStore((s) => s.log);
  const me = useSessionStore((s) => s.view?.meUserId ?? null);
  const lookup = useUserLookup();
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);

  const rolls = useMemo(() => {
    const out: { roll: RollResult; at: string; logId: string }[] = [];
    for (let i = log.length - 1; i >= 0; i--) {
      const entry = log[i]!;
      if (entry.type !== 'roll' || !isRollResult(entry.data)) continue;
      out.push({ roll: entry.data, at: entry.at, logId: entry.id });
    }
    return out;
  }, [log]);

  const filtered = useMemo(() => {
    if (filter === 'mine') return rolls.filter((r) => r.roll.rollerUserId === me);
    if (filter === 'dm') return rolls.filter((r) => r.roll.byDm);
    return rolls;
  }, [rolls, filter, me]);

  const visible = filtered.slice(0, limit);

  return (
    <div className={clsx('flex min-h-0 flex-col', compact ? 'gap-2' : 'gap-3')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-parchment-300">
          <History className="h-3.5 w-3.5 text-gold-400" />
          Historial
          {rolls.length > 0 && <span className="text-parchment-400">({rolls.length})</span>}
        </div>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Filtrar tiradas">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filter === f.id}
              onClick={() => {
                setFilter(f.id);
                setLimit(PAGE);
              }}
              className={clsx(
                'rounded-full border px-2 py-0.5 text-[11px] font-semibold transition',
                filter === f.id
                  ? 'border-gold-600/70 bg-gold-500/15 text-gold-200'
                  : 'border-ink-500 bg-ink-800 text-parchment-300 hover:border-ink-400 hover:text-parchment-100',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          compact
          icon={<History />}
          title={rolls.length === 0 ? 'Aún no hay tiradas' : 'Nada con este filtro'}
          description={rolls.length === 0 ? 'Las tiradas de dados y ruletas aparecerán aquí.' : undefined}
        />
      ) : (
        <ul className={clsx('flex flex-col', compact ? 'gap-1.5' : 'gap-2')}>
          {visible.map(({ roll, at, logId }) => (
            <RollRow key={logId} roll={roll} at={at} compact={compact} color={lookup(roll.rollerUserId)?.color ?? null} targetName={lookup(roll.targetUserId)?.name ?? null} />
          ))}
        </ul>
      )}

      {filtered.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="self-center rounded-md px-3 py-1 text-xs font-semibold text-gold-300 transition hover:bg-ink-700 hover:text-gold-200"
        >
          Mostrar más ({filtered.length - limit})
        </button>
      )}
    </div>
  );
}

function VisibilityIcon({ roll, targetName }: { roll: RollResult; targetName: string | null }) {
  if (roll.visibility === 'secret') {
    return (
      <span title="Secreta (solo DM)" className="text-arcane-300">
        <Lock className="h-3.5 w-3.5" aria-label="Secreta" />
      </span>
    );
  }
  if (roll.visibility === 'player') {
    return (
      <span title={`Privada: solo para ${targetName ?? 'un jugador'}`} className="text-sky-300">
        <UserRound className="h-3.5 w-3.5" aria-label="Privada" />
      </span>
    );
  }
  return (
    <span title="Pública" className="text-parchment-400">
      <Globe className="h-3.5 w-3.5" aria-label="Pública" />
    </span>
  );
}

function RollRow({ roll, at, compact, color, targetName }: { roll: RollResult; at: string; compact: boolean; color: string | null; targetName: string | null }) {
  const breakdown = rollBreakdown(roll);
  const firstSides = roll.dice[0]?.sides ?? 20;
  return (
    <li
      className={clsx(
        'relative overflow-hidden rounded-lg border bg-ink-900/70',
        compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
        roll.crit === 'success' ? 'border-gold-500/60' : roll.crit === 'fail' ? 'border-blood-500/60' : 'border-ink-600/80',
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-0.5" style={{ backgroundColor: color ?? '#7d5d1d' }} />
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0">
          {roll.kind === 'roulette' ? (
            <MiniWheel segments={roll.segments ?? []} size={compact ? 22 : 26} />
          ) : (
            <DieGlyph sides={roll.kind === 'custom_die' ? 6 : firstSides} size={compact ? 22 : 26} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-parchment-400">
            <span className="truncate font-semibold" style={{ color: color ?? undefined }}>
              {roll.rollerName}
            </span>
            {roll.byDm && <Crown className="h-3 w-3 shrink-0 text-gold-400" aria-label="DM" />}
            <span>·</span>
            <time dateTime={at}>{formatTime(at)}</time>
            <span className="ml-auto flex items-center">
              <VisibilityIcon roll={roll} targetName={targetName} />
            </span>
          </div>
          <div className="mt-0.5 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className={clsx('truncate font-medium text-parchment-100', compact ? 'text-sm' : 'text-[15px]')} title={rollTitle(roll)}>
                {rollTitle(roll)}
              </div>
              {(roll.formula || roll.mode !== 'normal') && (
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  {roll.formula && <span className="font-mono text-[11px] text-gold-300">{roll.formula}</span>}
                  {roll.mode !== 'normal' && roll.kind === 'dice' && (
                    <Badge size="xs" tone={roll.mode === 'advantage' ? 'emerald' : 'blood'}>
                      {MODE_LABELS[roll.mode]}
                    </Badge>
                  )}
                </div>
              )}
            </div>
            {roll.kind === 'dice' && roll.total !== null && (
              <span
                className={clsx(
                  'shrink-0 font-display font-bold leading-none tabular-nums',
                  compact ? 'text-2xl' : 'text-3xl',
                  roll.crit === 'success' ? 'title-epic' : roll.crit === 'fail' ? 'text-blood-400' : 'text-parchment-50',
                )}
              >
                {roll.total}
              </span>
            )}
          </div>
          {breakdown && <div className="mt-1 break-words font-mono text-[11px] text-parchment-400">{breakdown}</div>}
          {roll.kind === 'roulette' && roll.segment && (
            <div className="mt-1.5">
              <span
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold text-parchment-50"
                style={{ borderColor: roll.segment.color, backgroundColor: `${roll.segment.color}33` }}
                title={roll.segment.description || roll.segment.label}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: roll.segment.color }} />
                {roll.segment.icon && <span aria-hidden>{roll.segment.icon}</span>}
                <span className="truncate">{roll.segment.label}</span>
              </span>
              {!compact && roll.segment.description && <p className="mt-1 text-xs text-parchment-300">{roll.segment.description}</p>}
            </div>
          )}
          {roll.kind === 'custom_die' && roll.face && (
            <div className="mt-1.5">
              <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-gold-600/60 bg-gold-500/10 px-2 py-0.5 text-xs font-semibold text-gold-200">
                <span className="truncate">{roll.face}</span>
              </span>
            </div>
          )}
          {roll.crit && (
            <div className="mt-1.5">
              <Badge size="xs" tone={roll.crit === 'success' ? 'gold' : 'blood'}>
                {roll.crit === 'success' ? '¡Crítico!' : '¡Pifia!'}
              </Badge>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
