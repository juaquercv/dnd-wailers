import { useCallback, useEffect, useRef, useState } from 'react';

/** Structural equality for JSON-like values; object key order is ignored (JSONB reorders keys). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra).filter((k) => ra[k] !== undefined);
  const kb = Object.keys(rb).filter((k) => rb[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual(ra[k], rb[k])) return false;
  return true;
}

/** How long an emitted value is remembered to recognise late echoes of it. */
const ECHO_WINDOW_MS = 20_000;
const MAX_REMEMBERED = 60;

export interface SyncedValue<T> {
  /** Value to render: the latest local edit, or the external value when it changed from elsewhere. */
  value: T;
  /** Latest value, synchronously (successive edits in the same tick build on each other). */
  latest: () => T;
  /** Local edit that is reported with onCommit. */
  commit: (next: T) => void;
  /** Local edit that is NOT reported (e.g. an invalid intermediate value such as an empty name). */
  setLocal: (next: T) => void;
  /** Drop local state and show the external value again. */
  reset: () => void;
}

/**
 * Local mirror of a document that is saved asynchronously (debounced autosave whose response replaces
 * the store value). Late server echoes of values this component emitted earlier are ignored, so they
 * never undo newer edits; any other external change (server normalisation, reload) is adopted.
 */
export function useSyncedValue<T>(external: T, onCommit: (next: T) => void): SyncedValue<T> {
  const [local, setLocalState] = useState<T>(external);
  const latestRef = useRef<T>(external);
  const externalRef = useRef<T>(external);
  externalRef.current = external;
  const lastSeenExternal = useRef<T>(external);
  const sentRef = useRef<{ value: T; at: number }[]>([]);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    if (Object.is(external, lastSeenExternal.current)) return;
    lastSeenExternal.current = external;
    if (deepEqual(external, latestRef.current)) return;
    const now = Date.now();
    sentRef.current = sentRef.current.filter((s) => now - s.at < ECHO_WINDOW_MS);
    // An older value we emitted ourselves: a stale save response. Keep the newer local edits.
    if (sentRef.current.some((s) => deepEqual(s.value, external))) return;
    latestRef.current = external;
    setLocalState(external);
  }, [external]);

  const commit = useCallback((next: T) => {
    latestRef.current = next;
    setLocalState(next);
    const list = sentRef.current;
    list.push({ value: next, at: Date.now() });
    if (list.length > MAX_REMEMBERED) list.splice(0, list.length - MAX_REMEMBERED);
    onCommitRef.current(next);
  }, []);

  const setLocal = useCallback((next: T) => {
    latestRef.current = next;
    setLocalState(next);
  }, []);

  const reset = useCallback(() => {
    latestRef.current = externalRef.current;
    setLocalState(externalRef.current);
  }, []);

  const latest = useCallback(() => latestRef.current, []);

  return { value: local, latest, commit, setLocal, reset };
}
