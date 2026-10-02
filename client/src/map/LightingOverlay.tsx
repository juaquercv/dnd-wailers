import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import Konva from 'konva';
import { Layer, Shape } from 'react-konva';
import {
  blockingSegments,
  computeVisibilityPolygon,
  LIGHTING_INFO,
  type LightingPreset,
  type LightSource,
  type Segment,
  type ZoneLevel,
} from '@wailers/shared';
import { usePublishAmbientLighting } from './ambientLighting';
import { clamp, hashString, withAlpha } from './mapUtils';

export interface TokenLight {
  x: number;
  y: number;
  /** px */
  radius: number;
  color: string;
}

export interface LightingOverlayProps {
  level: Pick<ZoneLevel, 'background' | 'walls'>;
  lighting: LightingPreset;
  lights: LightSource[];
  /** Lights carried by tokens (torches). */
  tokenLights: TokenLight[];
  /** Flicker for lights with `flicker` (and gently for token lights). */
  animate?: boolean;
  /** Live door states used for wall occlusion (wall id -> open). */
  doorStates?: Record<string, boolean>;
  /** Clip each light by the walls that block vision (default true). */
  occlusion?: boolean;
}

interface LitSource {
  key: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  intensity: number;
  /** 0 = steady, 1 = full flicker. */
  flicker: number;
  seed: number;
}

const FLICKER_FRAME_MS = 50;
const FLICKER_RADIUS = 0.035;
const FLICKER_INTENSITY = 0.07;

function flickerWave(t: number, seed: number): number {
  return Math.sin(t * 7.1 + seed) * 0.55 + Math.sin(t * 12.7 + seed * 1.7) * 0.3 + Math.sin(t * 23.3 + seed * 2.3) * 0.15;
}

function safeSegments(walls: ZoneLevel['walls'], doorStates: Record<string, boolean> | undefined): Segment[] {
  try {
    return blockingSegments(walls, doorStates);
  } catch {
    return [];
  }
}

function safePolygon(s: LitSource, segments: Segment[], bounds: { width: number; height: number }): number[] | null {
  try {
    const poly = computeVisibilityPolygon({ x: s.x, y: s.y, radius: s.radius * (1 + FLICKER_RADIUS * 1.5), cone: 360, facing: 0 }, segments, bounds);
    return poly.length >= 6 ? poly : null;
  } catch {
    return null;
  }
}

function tracePolygon(c: CanvasRenderingContext2D, poly: number[]): void {
  c.beginPath();
  c.moveTo(poly[0] ?? 0, poly[1] ?? 0);
  for (let i = 2; i + 1 < poly.length; i += 2) c.lineTo(poly[i] ?? 0, poly[i + 1] ?? 0);
  c.closePath();
}

/**
 * `LightingOverlay`: darkness from LIGHTING_INFO (tinted) with radial light holes ('destination-out'),
 * a warm colored glow, optional wall occlusion and flicker. Never listens to events.
 */
export function LightingOverlay({ level, lighting, lights, tokenLights, animate = false, doorStates, occlusion = true }: LightingOverlayProps) {
  const layerRef = useRef<Konva.Layer>(null);
  const timeRef = useRef(0);
  const info = LIGHTING_INFO[lighting] ?? LIGHTING_INFO.day;
  const darkness = clamp(info.darkness, 0, 1);
  const width = Math.max(1, level.background.width);
  const height = Math.max(1, level.background.height);
  // The lower floors of the 2.5D stack (LevelStack) are outside this rect: they take the same base darkness.
  usePublishAmbientLighting(info.tint, darkness);

  const doorKey = doorStates
    ? Object.keys(doorStates)
        .sort()
        .map((k) => `${k}:${doorStates[k] ? 1 : 0}`)
        .join('|')
    : '';
  const doorStatesRef = useRef(doorStates);
  doorStatesRef.current = doorStates;
  const segments = useMemo(
    () => (occlusion && level.walls.length > 0 ? safeSegments(level.walls, doorStatesRef.current) : []),
    [occlusion, level.walls, doorKey],
  );

  const sources = useMemo<LitSource[]>(() => {
    const out: LitSource[] = [];
    for (const l of lights) {
      if (l.radius <= 0 || l.intensity <= 0) continue;
      out.push({
        key: l.id,
        x: l.x,
        y: l.y,
        radius: l.radius,
        color: l.color || '#ffb347',
        intensity: clamp(l.intensity, 0, 1),
        flicker: l.flicker ? 1 : 0,
        seed: (hashString(l.id) % 1000) / 37,
      });
    }
    tokenLights.forEach((t, i) => {
      if (t.radius <= 0) return;
      out.push({
        key: `token-${i}`,
        x: t.x,
        y: t.y,
        radius: t.radius,
        color: t.color || '#ffb347',
        intensity: 1,
        flicker: 0.6,
        seed: (hashString(`${i}:${t.color}`) % 1000) / 37,
      });
    });
    return out;
  }, [lights, tokenLights]);

  const polygons = useMemo(
    () => sources.map((s) => (segments.length > 0 ? safePolygon(s, segments, { width, height }) : null)),
    [sources, segments, width, height],
  );

  const flickering = animate && darkness > 0 && sources.some((s) => s.flicker > 0);

  const sceneFunc = useCallback(
    (ctx: Konva.Context) => {
      const c = ctx._context;
      const t = timeRef.current;
      c.save();
      c.fillStyle = withAlpha(info.tint, darkness);
      c.fillRect(0, 0, width, height);
      // Light belongs to the current level: its glow never spills onto the lower floors peeking out around it.
      c.beginPath();
      c.rect(0, 0, width, height);
      c.clip();

      const lit = sources.map((s, i) => {
        const wave = flickering && s.flicker > 0 ? flickerWave(t, s.seed) * s.flicker : 0;
        const wave2 = flickering && s.flicker > 0 ? flickerWave(t * 1.3, s.seed + 11) * s.flicker : 0;
        return {
          s,
          poly: polygons[i] ?? null,
          r: Math.max(1, s.radius * (1 + FLICKER_RADIUS * wave)),
          intensity: clamp(s.intensity * (1 + FLICKER_INTENSITY * wave2), 0, 1),
        };
      });

      // carve light holes into the darkness
      c.globalCompositeOperation = 'destination-out';
      for (const { s, poly, r, intensity } of lit) {
        c.save();
        if (poly) {
          tracePolygon(c, poly);
          c.clip();
        }
        const g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
        g.addColorStop(0, `rgba(0, 0, 0, ${intensity})`);
        g.addColorStop(0.45, `rgba(0, 0, 0, ${intensity * 0.85})`);
        g.addColorStop(0.8, `rgba(0, 0, 0, ${intensity * 0.3})`);
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(s.x, s.y, r, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }

      // warm colored glow inside the lit areas
      c.globalCompositeOperation = 'source-over';
      const glowStrength = 0.22 * Math.min(1, darkness * 1.6);
      for (const { s, poly, r, intensity } of lit) {
        c.save();
        if (poly) {
          tracePolygon(c, poly);
          c.clip();
        }
        const g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 0.9);
        g.addColorStop(0, withAlpha(s.color, glowStrength * intensity));
        g.addColorStop(0.6, withAlpha(s.color, glowStrength * intensity * 0.45));
        g.addColorStop(1, withAlpha(s.color, 0));
        c.fillStyle = g;
        c.beginPath();
        c.arc(s.x, s.y, r * 0.9, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      c.restore();
    },
    [info.tint, darkness, width, height, sources, polygons, flickering],
  );

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const canvas = layer.getCanvas();
    if (canvas.getPixelRatio() !== 1) {
      canvas.setPixelRatio(1);
      layer.batchDraw();
    }
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!flickering || !layer) return;
    let last = -1;
    const anim = new Konva.Animation((frame) => {
      if (!frame) return false;
      if (last >= 0 && frame.time - last < FLICKER_FRAME_MS) return false;
      last = frame.time;
      timeRef.current = frame.time / 1000;
      return true;
    }, layer);
    anim.start();
    return () => {
      anim.stop();
    };
  }, [flickering]);

  return (
    <Layer ref={layerRef} listening={false}>
      {darkness > 0 && <Shape sceneFunc={sceneFunc} listening={false} perfectDrawEnabled={false} />}
    </Layer>
  );
}
