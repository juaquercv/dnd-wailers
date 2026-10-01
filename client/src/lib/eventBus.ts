import type { SessionEvent, SessionEventType } from '@wailers/shared';

type EventOf<T extends SessionEventType> = Extract<SessionEvent, { type: T }>;
type Listener<T extends SessionEventType> = (event: EventOf<T>) => void;

/**
 * Client-side fan-out of transient session events (rolls, fx, sfx, pings, toasts...).
 * The session store publishes every `session:event`; features subscribe to the types they need.
 * Local-only events (e.g. a UI sound for the local user) can be published too.
 */
class SessionEventBus {
  private listeners = new Map<SessionEventType, Set<(e: SessionEvent) => void>>();

  on<T extends SessionEventType>(type: T, listener: Listener<T>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    const wrapped = listener as unknown as (e: SessionEvent) => void;
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
    };
  }

  publish(event: SessionEvent): void {
    const set = this.listeners.get(event.type);
    if (!set) return;
    for (const l of [...set]) {
      try {
        l(event);
      } catch (err) {
        console.error('[eventBus] listener error', err);
      }
    }
  }
}

export const sessionBus = new SessionEventBus();

/** React helper: subscribe for the component lifetime. */
import { useEffect, useRef } from 'react';

export function useSessionEvent<T extends SessionEventType>(type: T, listener: Listener<T>): void {
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => sessionBus.on(type, (e) => ref.current(e)), [type]);
}
