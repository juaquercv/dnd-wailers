import { useEffect, useMemo, useRef, useState } from 'react';
import type { Token } from '@wailers/shared';
import { useSessionEvent } from '../../../lib/eventBus';

interface RemoteDrag {
  x: number;
  y: number;
  at: number;
  /** Token position when the drag started (a different position means the move landed). */
  baseX: number;
  baseY: number;
}

const STALE_MS = 1400;
const SWEEP_MS = 350;

/**
 * Drag previews of tokens being dragged by other users ('tokenDrag' events), keyed by token id.
 * A preview disappears when the token lands (its position changes) or after a short silence.
 */
export function useRemoteDrags(meUserId: string | null, tokens: Record<string, Token>): Record<string, { x: number; y: number }> {
  const dragsRef = useRef(new Map<string, RemoteDrag>());
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const [version, setVersion] = useState(0);
  const rafRef = useRef<number | null>(null);

  const bump = () => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setVersion((v) => v + 1);
    });
  };

  useSessionEvent('tokenDrag', (event) => {
    if (event.userId === meUserId) return;
    const token = tokensRef.current[event.tokenId];
    if (!token) return;
    const prev = dragsRef.current.get(event.tokenId);
    dragsRef.current.set(event.tokenId, {
      x: event.x,
      y: event.y,
      at: performance.now(),
      baseX: prev?.baseX ?? token.x,
      baseY: prev?.baseY ?? token.y,
    });
    bump();
  });

  // Drop previews whose token moved (the drop arrived) or vanished.
  useEffect(() => {
    let changed = false;
    for (const [id, d] of dragsRef.current) {
      const t = tokens[id];
      if (!t || Math.abs(t.x - d.baseX) > 0.5 || Math.abs(t.y - d.baseY) > 0.5) {
        dragsRef.current.delete(id);
        changed = true;
      }
    }
    if (changed) bump();
  }, [tokens]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = performance.now();
      let changed = false;
      for (const [id, d] of dragsRef.current) {
        if (now - d.at > STALE_MS) {
          dragsRef.current.delete(id);
          changed = true;
        }
      }
      if (changed) bump();
    }, SWEEP_MS);
    return () => {
      window.clearInterval(timer);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  return useMemo(() => {
    const out: Record<string, { x: number; y: number }> = {};
    for (const [id, d] of dragsRef.current) out[id] = { x: d.x, y: d.y };
    return out;
    // `version` is the change signal for the mutable map.
  }, [version]);
}
