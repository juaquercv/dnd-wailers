import { useCallback, useEffect, useRef } from 'react';
import Konva from 'konva';
import { Shape } from 'react-konva';
import { useSessionEvent } from '../lib/eventBus';
import { MapLayerShell } from './MapLayer';
import { absoluteScale, clamp, easeOutCubic, FONT_SANS, MAP_COLORS, withAlpha } from './mapUtils';

export interface PingLayerProps {
  zoneId: string;
  levelId: string;
}

interface ActivePing {
  id: number;
  x: number;
  y: number;
  color: string;
  name: string;
  start: number;
}

const PING_MS = 1500;
const RING_COUNT = 3;
const RING_DELAY_MS = 200;
const RING_MS = 1100;
/** Max ring radius in screen px (pings keep the same on-screen size at any zoom). */
const RING_RADIUS_PX = 56;
const EDGE_INSET_PX = 28;
const MAX_PINGS = 24;

let pingSeq = 0;

function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

function drawLabel(c: CanvasRenderingContext2D, text: string, x: number, y: number, u: number, color: string, alpha: number): void {
  const fontSize = 13 * u;
  c.font = `bold ${fontSize}px ${FONT_SANS}`;
  const tw = c.measureText(text).width;
  const padX = 8 * u;
  const h = fontSize * 1.25 + 6 * u;
  const w = tw + padX * 2;
  c.globalAlpha = alpha;
  roundRectPath(c, x - w / 2, y - h, w, h, h / 2);
  c.fillStyle = 'rgba(11, 10, 8, 0.88)';
  c.fill();
  c.lineWidth = 1.5 * u;
  c.strokeStyle = color;
  c.stroke();
  c.fillStyle = MAP_COLORS.parchment100;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, x, y - h / 2 + 0.5 * u);
}

/**
 * `PingLayer`: listens to `ping` session events for this zone/level and animates expanding rings
 * (1.5 s) in the user's color with their name. Off-screen pings show an arrow at the viewport edge.
 */
export function PingLayer({ zoneId, levelId }: PingLayerProps) {
  const shapeRef = useRef<Konva.Shape>(null);
  const pingsRef = useRef<ActivePing[]>([]);
  const animRef = useRef<Konva.Animation | null>(null);

  const ensureAnimation = useCallback(() => {
    const layer = shapeRef.current?.getLayer();
    if (!layer) return;
    if (!animRef.current) {
      animRef.current = new Konva.Animation(() => {
        const now = performance.now();
        pingsRef.current = pingsRef.current.filter((p) => now - p.start < PING_MS);
        // This frame clears the canvas; stop afterwards (not while Konva iterates its animation list).
        if (pingsRef.current.length === 0) {
          queueMicrotask(() => {
            if (pingsRef.current.length === 0) animRef.current?.stop();
          });
        }
        return true;
      }, layer);
    }
    if (!animRef.current.isRunning()) animRef.current.start();
  }, []);

  useSessionEvent('ping', (event) => {
    if (event.zoneId !== zoneId || event.levelId !== levelId) return;
    pingSeq += 1;
    pingsRef.current = [
      ...pingsRef.current.slice(-(MAX_PINGS - 1)),
      { id: pingSeq, x: event.x, y: event.y, color: event.color || MAP_COLORS.gold400, name: event.name, start: performance.now() },
    ];
    ensureAnimation();
  });

  // Switching zone/level drops pings that belong to the previous map.
  useEffect(() => {
    pingsRef.current = [];
    shapeRef.current?.getLayer()?.batchDraw();
  }, [zoneId, levelId]);

  useEffect(
    () => () => {
      animRef.current?.stop();
      animRef.current = null;
    },
    [],
  );

  const sceneFunc = useCallback((ctx: Konva.Context, shape: Konva.Shape) => {
    const pings = pingsRef.current;
    if (pings.length === 0) return;
    const stage = shape.getStage();
    if (!stage) return;
    const c = ctx._context;
    const now = performance.now();
    const u = 1 / absoluteScale(shape);
    const transform = shape.getAbsoluteTransform();
    const inverse = transform.copy().invert();
    const sw = stage.width();
    const sh = stage.height();

    c.save();
    for (const p of pings) {
      const elapsed = now - p.start;
      if (elapsed < 0 || elapsed >= PING_MS) continue;
      const t = elapsed / PING_MS;
      const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      const screen = transform.point({ x: p.x, y: p.y });
      const offscreen = screen.x < 0 || screen.y < 0 || screen.x > sw || screen.y > sh;

      if (offscreen) {
        // arrow at the viewport edge pointing to the ping
        const ex = clamp(screen.x, EDGE_INSET_PX, sw - EDGE_INSET_PX);
        const ey = clamp(screen.y, EDGE_INSET_PX, sh - EDGE_INSET_PX);
        const at = inverse.point({ x: ex, y: ey });
        const angle = Math.atan2(screen.y - ey, screen.x - ex);
        const pulse = 1 + 0.15 * Math.sin(elapsed / 90);
        c.save();
        c.translate(at.x, at.y);
        c.rotate(angle);
        c.globalAlpha = fade;
        c.beginPath();
        c.moveTo(14 * u * pulse, 0);
        c.lineTo(-8 * u, -9 * u);
        c.lineTo(-4 * u, 0);
        c.lineTo(-8 * u, 9 * u);
        c.closePath();
        c.fillStyle = p.color;
        c.shadowColor = p.color;
        c.shadowBlur = 10;
        c.fill();
        c.restore();
        const below = ey < sh / 2;
        const labelAt = inverse.point({ x: ex, y: below ? ey + 40 : ey - 16 });
        drawLabel(c, p.name, labelAt.x, labelAt.y, u, p.color, fade);
        continue;
      }

      for (let k = 0; k < RING_COUNT; k++) {
        const local = (elapsed - k * RING_DELAY_MS) / RING_MS;
        if (local <= 0 || local >= 1) continue;
        const radius = (6 + (RING_RADIUS_PX - 6) * easeOutCubic(local)) * u;
        c.globalAlpha = Math.pow(1 - local, 1.4) * fade;
        c.beginPath();
        c.arc(p.x, p.y, radius, 0, Math.PI * 2);
        c.lineWidth = (4 - 2.5 * local) * u;
        c.strokeStyle = p.color;
        c.shadowColor = p.color;
        c.shadowBlur = 12;
        c.stroke();
      }
      c.shadowBlur = 0;
      // center dot
      c.globalAlpha = fade;
      c.beginPath();
      c.arc(p.x, p.y, 6 * u * (1 + 0.25 * Math.sin(elapsed / 80)), 0, Math.PI * 2);
      c.fillStyle = p.color;
      c.fill();
      c.lineWidth = 2 * u;
      c.strokeStyle = withAlpha('#ffffff', 0.9);
      c.stroke();
      drawLabel(c, p.name, p.x, p.y - 18 * u, u, p.color, fade);
    }
    c.restore();
  }, []);

  return (
    <MapLayerShell listening={false}>
      <Shape ref={shapeRef} sceneFunc={sceneFunc} listening={false} perfectDrawEnabled={false} />
    </MapLayerShell>
  );
}
