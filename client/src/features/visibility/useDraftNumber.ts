import { useEffect, useRef, useState } from 'react';

/** Slider value kept locally while dragging; committed on release (or after a short pause). */
export function useDraftNumber(value: number, commit: (v: number) => void, delayMs = 600) {
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const flush = (v: number) => {
    clear();
    setDraft(null);
    if (v !== valueRef.current) commitRef.current(v);
  };
  const change = (v: number) => {
    setDraft(v);
    clear();
    timer.current = window.setTimeout(() => flush(v), delayMs);
  };
  useEffect(() => () => clear(), []);
  return { value: draft ?? value, change, flush };
}
