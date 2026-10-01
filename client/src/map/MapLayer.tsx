import { createContext, useContext, type ReactNode } from 'react';
import { Group, Layer } from 'react-konva';

const CombinedLayerContext = createContext(false);

export interface CombinedLayerProps {
  children: ReactNode;
  listening?: boolean;
}

/**
 * Optional optimization: one Konva Layer (one canvas) for several map primitives. Inside it, LevelStack,
 * LevelBackground, GridLayer, SceneElementsLayer, WallsLayer, LightsLayer, FogRegionsLayer and PingLayer
 * render as Groups. VisionMask and LightingOverlay always need their own canvas: keep them outside.
 */
export function CombinedLayer({ children, listening = true }: CombinedLayerProps) {
  return (
    <Layer listening={listening}>
      <CombinedLayerContext.Provider value>{children}</CombinedLayerContext.Provider>
    </Layer>
  );
}

/** Root of a map primitive: its own Layer, or a Group when placed inside a CombinedLayer. */
export function MapLayerShell({ listening, children }: { listening: boolean; children: ReactNode }) {
  const combined = useContext(CombinedLayerContext);
  if (combined) return <Group listening={listening}>{children}</Group>;
  return <Layer listening={listening}>{children}</Layer>;
}
