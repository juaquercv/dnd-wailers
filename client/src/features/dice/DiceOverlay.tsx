import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import type { RollResult } from '@wailers/shared';
import { useSessionEvent } from '../../lib/eventBus';
import { useSessionStore } from '../../stores/session';
import { useSettingsStore } from '../../stores/settings';
import { RollStage } from './RollStage';
import { setOverlayShowing } from './coveringOverlays';
import { useUserLookup, useViewportSize } from './diceHooks';
import { rollTitle } from './diceUtils';
import { clearPendingRolls, markRollsPending, markRollsRevealed } from './rollReveal';
import './dice.css';

const MAX_QUEUE = 12;
const HOLD_MS = 2600;
const CRIT_HOLD_MS = 3400;
const ROULETTE_HOLD_MS = 3400;
const CUSTOM_HOLD_MS = 2800;
const SHORT_HOLD_MS = 900;
const LEAVE_MS = 240;
/** Safety net: never keep one roll on screen longer than this. */
const MAX_SCENE_MS = 16000;

/**
 * Full-screen, queue-based presentation of every `roll` session event (dice, roulettes, custom dice).
 * Visual only: never modifies anything. Pointer events only on the result card (click or Esc skips).
 */
export function DiceOverlay() {
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const sessionId = useSessionStore((s) => s.sessionId);
  const rollers = useSessionStore((s) => s.rollers);
  const lookup = useUserLookup();
  const viewport = useViewportSize();

  const [queue, setQueue] = useState<RollResult[]>([]);
  const [settledAt, setSettledAt] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const queueRef = useRef<RollResult[]>([]);
  const seen = useRef(new Set<string>());
  const leavingRef = useRef(false);
  const leaveTimer = useRef<number | null>(null);

  const updateQueue = useCallback((fn: (q: RollResult[]) => RollResult[]) => {
    const next = fn(queueRef.current);
    queueRef.current = next;
    // Published synchronously: a `turnStart` handled in the same tick must already see it.
    setOverlayShowing('dice', next.length > 0);
    setQueue(next);
  }, []);

  useEffect(() => {
    updateQueue(() => []);
    setSettledAt(null);
    setLeaving(false);
    leavingRef.current = false;
    seen.current = new Set();
    clearPendingRolls();
  }, [sessionId, updateQueue]);

  useEffect(
    () => () => {
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
      setOverlayShowing('dice', false);
      clearPendingRolls();
    },
    [],
  );

  /** Remove every queued roll at once (no leave animation) and reveal their results. */
  const dropAll = useCallback(() => {
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    leavingRef.current = false;
    markRollsRevealed(queueRef.current.map((r) => r.id));
    updateQueue(() => []);
    setSettledAt(null);
    setLeaving(false);
  }, [updateQueue]);

  // A hidden tab cannot animate (timers and frames are throttled): stop the show and do not pile
  // up stale animations; the results stay in the history.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') dropAll();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [dropAll]);

  useSessionEvent('roll', (event) => {
    const roll = event.roll;
    if (!roll || seen.current.has(roll.id)) return;
    const currentSession = useSessionStore.getState().sessionId;
    if (currentSession && roll.sessionId && roll.sessionId !== currentSession) return;
    seen.current.add(roll.id);
    if (seen.current.size > 400) seen.current = new Set([...seen.current].slice(-200));
    if (document.visibilityState === 'hidden') return;
    markRollsPending([roll.id]);
    updateQueue((q) => {
      const next = [...q, roll];
      // Too many pending: drop the oldest waiting ones (never the one on screen).
      if (next.length > MAX_QUEUE) {
        const dropped = next.splice(1, next.length - MAX_QUEUE);
        markRollsRevealed(dropped.map((r) => r.id));
      }
      return next;
    });
  });

  const advance = useCallback(
    (fast = false, clearAll = false) => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      setLeaving(true);
      const q = queueRef.current;
      // Skipping reveals the result right away (history, log…).
      markRollsRevealed(clearAll ? q.map((r) => r.id) : q.slice(0, 1).map((r) => r.id));
      leaveTimer.current = window.setTimeout(
        () => {
          leaveTimer.current = null;
          leavingRef.current = false;
          setLeaving(false);
          setSettledAt(null);
          updateQueue((cur) => (clearAll ? [] : cur.slice(1)));
        },
        fast || reducedMotion ? 80 : LEAVE_MS,
      );
    },
    [reducedMotion, updateQueue],
  );

  const current = queue[0] ?? null;
  const pending = queue.length - 1;

  // Hold the revealed result for a while (shorter when more rolls are waiting).
  useEffect(() => {
    if (!current || settledAt === null || leaving) return;
    const base =
      current.kind === 'roulette' ? ROULETTE_HOLD_MS : current.kind === 'custom_die' ? CUSTOM_HOLD_MS : current.crit ? CRIT_HOLD_MS : HOLD_MS;
    const hold = pending > 0 ? SHORT_HOLD_MS : base;
    const wait = Math.max(0, settledAt + hold - performance.now());
    const t = window.setTimeout(() => advance(), wait);
    return () => window.clearTimeout(t);
  }, [current, settledAt, leaving, pending, advance]);

  useEffect(() => {
    if (!current) return;
    const t = window.setTimeout(() => advance(true), MAX_SCENE_MS);
    return () => window.clearTimeout(t);
  }, [current, advance]);

  // Esc skips (Shift+Esc skips the whole queue). Captured so it does not close modals underneath.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      advance(true, e.shiftKey);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [current, advance]);

  if (!current || typeof document === 'undefined') return null;

  const targetName = current.visibility === 'player' ? lookup(current.targetUserId)?.name ?? null : null;
  const rollerColor = lookup(current.rollerUserId)?.color ?? null;
  const rollerDef = current.rollerId ? rollers.find((r) => r.id === current.rollerId) ?? null : null;
  const extra = rollerDef && rollerDef.name.trim() !== current.label.trim() ? rollerDef.name : null;
  const wheelSize = Math.round(Math.max(220, Math.min(viewport.height * 0.7, 560, viewport.width - 32, viewport.height - 250)));
  const summary =
    current.kind === 'roulette'
      ? `${current.rollerName}: ${rollTitle(current)} — ${current.segment?.label ?? 'sin resultado'}`
      : current.kind === 'custom_die'
        ? `${current.rollerName}: ${rollTitle(current)} — ${current.face ?? '—'}`
        : `${current.rollerName}: ${rollTitle(current)} — ${current.total ?? '—'}`;

  return createPortal(
    <div
      className={clsx('pointer-events-none fixed inset-0 z-90 flex items-center justify-center overflow-hidden', leaving && 'wl-leaving')}
      data-dice-overlay
    >
      <div className="wl-backdrop absolute inset-0" aria-hidden />
      <div className="relative flex max-h-full w-full flex-col items-center justify-center px-4 py-6">
        <RollStage
          key={current.id}
          roll={current}
          variant="overlay"
          reducedMotion={reducedMotion}
          onSettled={() => {
            setSettledAt(performance.now());
            markRollsRevealed([current.id]);
          }}
          onCardClick={() => advance(true)}
          targetName={targetName}
          rollerColor={rollerColor}
          extra={extra}
          wheelSize={wheelSize}
          hint={pending > 0 ? 'Clic o Esc para continuar · Mayús+Esc salta todas' : 'Clic o Esc para continuar'}
        />
      </div>
      {pending > 0 && (
        <div className="absolute right-4 top-4 rounded-full border border-gold-700/60 bg-ink-900/90 px-3 py-1 text-xs font-semibold text-gold-200 shadow-panel">
          +{pending} {pending === 1 ? 'tirada en cola' : 'tiradas en cola'}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {settledAt !== null ? summary : ''}
      </span>
    </div>,
    document.body,
  );
}
