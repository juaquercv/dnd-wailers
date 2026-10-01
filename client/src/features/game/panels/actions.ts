import { useEffect, useRef, useState } from 'react';
import type { C2SEvent, C2SPayloads, C2SResult } from '@wailers/shared';
import { emitAck } from '../../../api/socket';
import { toast } from '../../../components/ui/toast';

export interface SendOptions {
  /** Toast shown when the server accepts the action. */
  success?: string;
  /** Fallback error text when the server gives no message. */
  error?: string;
}

/**
 * Emit a socket intention with ack. Errors become a toast with the server's Spanish message.
 * Resolves true when the server accepted the action.
 */
export async function send<E extends C2SEvent>(event: E, payload: C2SPayloads[E], opts: SendOptions = {}): Promise<boolean> {
  try {
    await emitAck(event, payload);
    if (opts.success) toast.success(opts.success);
    return true;
  } catch (err) {
    toast.fromError(err, opts.error ?? 'No se pudo completar la acción');
    return false;
  }
}

/** Like send() but returns the ack data (null on error, after toasting it). */
export async function request<E extends C2SEvent>(event: E, payload: C2SPayloads[E], opts: SendOptions = {}): Promise<C2SResult<E> | null> {
  try {
    const data = await emitAck(event, payload);
    if (opts.success) toast.success(opts.success);
    return data;
  } catch (err) {
    toast.fromError(err, opts.error ?? 'No se pudo completar la acción');
    return null;
  }
}

/** Run several intentions one after another; stops at the first failure. */
export async function sendAll(steps: (() => Promise<boolean>)[]): Promise<boolean> {
  for (const step of steps) {
    if (!(await step())) return false;
  }
  return true;
}

/**
 * Local draft of a server value with debounced commit. While the user edits, the draft wins;
 * once committed (and the server echoes back), incoming values replace it again.
 * Used for absolute-value fields where fast repeated clicks must not lose increments.
 */
export function useDraft<T>(serverValue: T, commit: (value: T) => void, delayMs = 450, equals: (a: T, b: T) => boolean = Object.is): [T, (next: T) => void, () => void] {
  const [draft, setDraft] = useState<T>(serverValue);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<T>(serverValue);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const serverRef = useRef(serverValue);
  serverRef.current = serverValue;

  useEffect(() => {
    if (!dirty.current) setDraft(serverValue);
  }, [serverValue]);

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty.current) return;
    dirty.current = false;
    if (!equals(latest.current, serverRef.current)) commitRef.current(latest.current);
  };

  // Commit pending edits when the editor unmounts (flush only reads refs).
  useEffect(() => () => flush(), []);

  const update = (next: T) => {
    latest.current = next;
    dirty.current = true;
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delayMs);
  };

  return [draft, update, flush];
}
