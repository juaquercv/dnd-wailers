import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSessionStore } from '../../stores/session';
import { useUsersStore } from '../../stores/users';

export interface PlayerOption {
  userId: string;
  name: string;
  heroName: string | null;
  color: string;
  connected: boolean;
}

/** Players of the current session (the DM excluded), in join order. Uses the real view, never the DM preview. */
export function useSessionPlayers(): PlayerOption[] {
  const view = useSessionStore((s) => s.view);
  return useMemo(() => {
    if (!view) return [];
    const state = view.state;
    return Object.values(state.players)
      .filter((p) => p.userId !== state.hostUserId)
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
      .map((p) => ({
        userId: p.userId,
        name: p.name,
        heroName: p.heroId ? state.heroes[p.heroId]?.name ?? null : null,
        color: p.color,
        connected: p.connected,
      }));
  }, [view]);
}

export function playerLabel(p: PlayerOption): string {
  return p.heroName ? `${p.name} · ${p.heroName}` : p.name;
}

export interface UserInfo {
  name: string;
  color: string;
}

/** Name/color lookup for any user id (session players, then the global user list). */
export function useUserLookup(): (userId: string | null | undefined) => UserInfo | null {
  const players = useSessionStore((s) => s.view?.state.players ?? null);
  const users = useUsersStore((s) => s.users);
  return useCallback(
    (userId) => {
      if (!userId) return null;
      const p = players?.[userId];
      if (p) return { name: p.name, color: p.color };
      const u = users.find((x) => x.id === userId);
      return u ? { name: u.name, color: u.color } : null;
    },
    [players, users],
  );
}

/** Animated number from `from` to `to` once `active` becomes true. */
export function useCountUp(to: number, active: boolean, durationMs: number, from = 0): number {
  const [value, setValue] = useState(active && durationMs <= 0 ? to : from);
  useEffect(() => {
    if (!active) {
      setValue(from);
      return;
    }
    if (durationMs <= 0 || from === to) {
      setValue(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, active, durationMs, from]);
  return value;
}

/** Milliseconds elapsed since mount, refreshed every `intervalMs` until `untilMs` is reached. */
export function useElapsed(untilMs: number, intervalMs = 50): number {
  const [elapsed, setElapsed] = useState(() => (untilMs <= 0 ? untilMs : 0));
  useEffect(() => {
    if (untilMs <= 0) {
      setElapsed(untilMs);
      return;
    }
    const start = performance.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      const e = performance.now() - start;
      if (e >= untilMs) {
        setElapsed(untilMs);
        window.clearInterval(id);
      } else {
        setElapsed(e);
      }
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [untilMs, intervalMs]);
  return elapsed;
}

/** Calls `fn` at most once every `ms` milliseconds. */
export function useThrottled<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  const last = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  return useCallback(
    (...args: A) => {
      const now = performance.now();
      if (now - last.current < ms) return;
      last.current = now;
      fnRef.current(...args);
    },
    [ms],
  );
}

/** Window size, updated on resize. */
export function useViewportSize(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}
