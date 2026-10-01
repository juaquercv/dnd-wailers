import { useEffect, useState } from 'react';
import { useMapViewSource } from '../../../map';

/**
 * Current zoom of the enclosing MapStage, updated only when it changes noticeably
 * (panning does not re-render). Use it to keep overlays at a constant screen size.
 */
export function useMapScale(tolerance = 0.01): number {
  const source = useMapViewSource();
  const [scale, setScale] = useState(() => source?.getView().scale ?? 1);

  useEffect(() => {
    if (!source) return undefined;
    let current = source.getView().scale;
    setScale(current);
    return source.subscribe((view) => {
      if (Math.abs(view.scale - current) / Math.max(current, 1e-6) > tolerance) {
        current = view.scale;
        setScale(view.scale);
      }
    });
  }, [source, tolerance]);

  return scale;
}
