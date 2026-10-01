import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import type { InitiativeDraw } from '@wailers/shared';
import { Avatar } from '../../components/ui/Avatar';
import { useSessionEvent } from '../../lib/eventBus';
import { useSessionStore } from '../../stores/session';
import { useSettingsStore } from '../../stores/settings';
import { uiSounds } from '../audio/uiSounds';
import { DieSvg } from './DieShapes';
import { useElapsed } from './diceHooks';
import { hashString, ordinal, seededRandom } from './diceUtils';
import './dice.css';

interface DrawEvent {
  key: number;
  draws: InitiativeDraw[];
  order: string[];
}

const HOLD_AFTER_SORT_MS = 5000;

/** Full-screen "Orden de turnos" animation for the random initiative draw (visual only). */
export function InitiativeDrawOverlay() {
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const sessionId = useSessionStore((s) => s.sessionId);
  const [event, setEvent] = useState<DrawEvent | null>(null);

  useEffect(() => setEvent(null), [sessionId]);

  useSessionEvent('initiativeDraw', (e) => {
    if (e.draws.length === 0) return;
    setEvent({ key: Date.now(), draws: e.draws, order: e.order });
  });

  if (!event || typeof document === 'undefined') return null;
  return createPortal(
    <DrawScene key={event.key} draws={event.draws} order={event.order} reducedMotion={reducedMotion} onClose={() => setEvent(null)} />,
    document.body,
  );
}

function DrawScene({ draws, order, reducedMotion, onClose }: { draws: InitiativeDraw[]; order: string[]; reducedMotion: boolean; onClose: () => void }) {
  const n = draws.length;
  const landAt = (i: number) => (reducedMotion ? 150 + i * 40 : 950 + i * 320);
  const allLanded = landAt(n - 1);
  const sortAt = allLanded + (reducedMotion ? 250 : 800);
  const closeAt = sortAt + HOLD_AFTER_SORT_MS;
  const elapsed = useElapsed(closeAt, 60);
  const sorted = elapsed >= sortAt;

  /** Final rank (0-based) of each entry: the server order first, then any draw it did not list. */
  const rankOf = useMemo(() => {
    const ranks = new Map<string, number>();
    order.forEach((id) => {
      if (!ranks.has(id) && draws.some((d) => d.entryId === id)) ranks.set(id, ranks.size);
    });
    [...draws]
      .sort((a, b) => b.roll - a.roll)
      .forEach((d) => {
        if (!ranks.has(d.entryId)) ranks.set(d.entryId, ranks.size);
      });
    return ranks;
  }, [draws, order]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const rects = useRef(new Map<string, DOMRect>());
  const flipped = useRef(false);
  const sounds = useRef({ start: false, landed: new Set<number>(), sort: false });

  useEffect(() => {
    if (elapsed >= closeAt) onCloseRef.current();
  }, [elapsed, closeAt]);

  // Sounds.
  useEffect(() => {
    const s = sounds.current;
    if (!s.start) {
      s.start = true;
      uiSounds.diceShake();
    }
    for (let i = 0; i < n; i++) {
      if (elapsed >= landAt(i) && !s.landed.has(i)) {
        s.landed.add(i);
        if (s.landed.size === 1 || !reducedMotion) uiSounds.diceLand();
      }
    }
    if (sorted && !s.sort) {
      s.sort = true;
      uiSounds.whoosh();
    }
  });

  // FLIP: cards change their CSS `order` when sorted; animate from the previous positions.
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>();
    nodes.current.forEach((el, id) => next.set(id, el.getBoundingClientRect()));
    if (sorted && !flipped.current) {
      flipped.current = true;
      const prev = rects.current;
      nodes.current.forEach((el, id) => {
        const a = prev.get(id);
        const b = next.get(id);
        if (!a || !b || typeof el.animate !== 'function') return;
        const dx = a.left - b.left;
        const dy = a.top - b.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(1.04)` }, { transform: 'translate(0px, 0px) scale(1)' }], {
          duration: reducedMotion ? 1 : 760,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
          delay: reducedMotion ? 0 : (rankOf.get(id) ?? 0) * 45,
          fill: 'backwards',
        });
      });
    }
    rects.current = next;
  });

  // Click anywhere or Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const tick = Math.floor(elapsed / 70);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Orden de turnos"
      onClick={() => onCloseRef.current()}
      className="fixed inset-0 z-90 flex animate-fade-in cursor-pointer flex-col items-center justify-center overflow-y-auto bg-black/80 px-4 py-8 backdrop-blur-[3px]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 animate-glow-pulse rounded-full bg-gold-500/10 blur-3xl"
      />
      <div className="relative text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.32em] text-gold-400">Sorteo de iniciativa</div>
        <h2 className="title-epic mt-1 text-4xl sm:text-5xl">Orden de turnos</h2>
        <p className="mt-2 text-sm text-parchment-300">{sorted ? '¡Que comience la batalla!' : 'Cada combatiente lanza su d20…'}</p>
      </div>

      <div className="relative mt-8 flex max-w-6xl flex-wrap items-stretch justify-center gap-4">
        {draws.map((d, i) => {
          const landed = elapsed >= landAt(i);
          const rank = rankOf.get(d.entryId) ?? i;
          const shown = landed ? d.roll : Math.floor(seededRandom((hashString(d.entryId) + tick * 7919) >>> 0)() * 20) + 1;
          const natural20 = landed && d.roll === 20;
          const natural1 = landed && d.roll === 1;
          return (
            <div
              key={d.entryId}
              ref={(el) => {
                if (el) nodes.current.set(d.entryId, el);
                else nodes.current.delete(d.entryId);
              }}
              style={{ order: sorted ? rank : i, animationDelay: sorted ? undefined : `${i * 90}ms` }}
              className={clsx(
                'relative flex w-36 flex-col items-center rounded-2xl border bg-ink-900/95 px-3 pb-3 pt-4 text-center shadow-panel',
                !sorted && 'wl-deal',
                sorted && rank === 0 ? 'border-gold-400 shadow-glow-gold' : 'border-ink-500/80',
              )}
            >
              {sorted && (
                <span
                  className={clsx(
                    'wl-rank-in absolute -left-2.5 -top-2.5 flex h-9 min-w-[2.25rem] items-center justify-center rounded-full border-2 px-1.5 font-display text-sm font-bold',
                    rank === 0 ? 'border-gold-300 bg-gold-sheen text-ink-950' : 'border-gold-700 bg-ink-800 text-gold-200',
                  )}
                  style={{ animationDelay: reducedMotion ? undefined : `${700 + rank * 90}ms` }}
                >
                  {ordinal(rank + 1)}
                </span>
              )}
              <Avatar name={d.name} imageUrl={d.imageUrl} size="xl" ring={sorted && rank === 0} />
              <div className="mt-2 w-full truncate font-display text-sm font-semibold text-parchment-50" title={d.name}>
                {d.name}
              </div>
              <div className="mt-2 flex h-16 items-center justify-center">
                <div
                  className={clsx(
                    !landed && !reducedMotion && 'wl-d20-spin',
                    landed && 'wl-die-land',
                    natural20 && 'wl-die-glow-gold',
                    natural1 && 'wl-die-glow-blood',
                  )}
                >
                  <DieSvg sides={20} value={shown} size={58} />
                </div>
              </div>
              {landed && (
                <div className={clsx('mt-1 text-[11px] font-semibold uppercase tracking-[0.16em]', natural20 ? 'text-gold-300' : natural1 ? 'text-blood-300' : 'text-parchment-400')}>
                  {natural20 ? '¡20 natural!' : natural1 ? '1 natural' : `Saca ${d.roll}`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="relative mt-8 text-[11px] uppercase tracking-[0.2em] text-parchment-400">Clic o Esc para cerrar</div>
    </div>
  );
}
