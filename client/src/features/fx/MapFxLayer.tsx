import { useCallback, useEffect, useRef } from 'react';
import Konva from 'konva';
import { Shape } from 'react-konva';
import { useSessionEvent } from '../../lib/eventBus';
import { MapLayerShell } from '../../map/MapLayer';
import { absoluteScale } from '../../map/mapUtils';
import { useSettingsStore } from '../../stores/settings';
import { uiSounds } from '../audio/uiSounds';
import { createSpell, drawSpell, spellEndsAt, type SpellInstance } from './spellFx';

export interface MapFxLayerProps {
  zoneId: string;
  levelId: string;
}

/** Simultaneous spells kept on screen (older ones are dropped first). */
const MAX_SPELLS = 16;

/**
 * Spell animations in WORLD coordinates. A Konva Layer (listening=false) placed directly inside
 * MapStage (or a Group inside a CombinedLayer). It listens to `fx` spell events of this zone/level and
 * redraws every active spell from a single Shape driven by a Konva.Animation that stops when idle.
 */
export function MapFxLayer({ zoneId, levelId }: MapFxLayerProps) {
  const shapeRef = useRef<Konva.Shape>(null);
  const spellsRef = useRef<SpellInstance[]>([]);
  const animRef = useRef<Konva.Animation | null>(null);

  const ensureAnimation = useCallback(() => {
    const layer = shapeRef.current?.getLayer();
    if (!layer) return;
    if (!animRef.current) {
      animRef.current = new Konva.Animation(() => {
        const now = performance.now();
        spellsRef.current = spellsRef.current.filter((s) => now < spellEndsAt(s));
        // This frame clears the canvas; stop afterwards (not while Konva iterates its animation list).
        if (spellsRef.current.length === 0) {
          queueMicrotask(() => {
            if (spellsRef.current.length === 0) animRef.current?.stop();
          });
        }
        return true;
      }, layer);
    }
    if (!animRef.current.isRunning()) animRef.current.start();
  }, []);

  useSessionEvent('fx', ({ fx }) => {
    if (fx.kind !== 'spell' || fx.zoneId !== zoneId || fx.levelId !== levelId) return;
    if (!Number.isFinite(fx.x) || !Number.isFinite(fx.y)) return;
    const spell = createSpell(fx, performance.now(), useSettingsStore.getState().reducedMotion);
    spellsRef.current = [...spellsRef.current.slice(-(MAX_SPELLS - 1)), spell];
    uiSounds.whoosh();
    ensureAnimation();
  });

  // Switching zone/level drops the spells of the previous map.
  useEffect(() => {
    spellsRef.current = [];
    shapeRef.current?.getLayer()?.batchDraw();
  }, [zoneId, levelId]);

  useEffect(
    () => () => {
      animRef.current?.stop();
      animRef.current = null;
      spellsRef.current = [];
    },
    [],
  );

  const sceneFunc = useCallback((ctx: Konva.Context, shape: Konva.Shape) => {
    const spells = spellsRef.current;
    if (spells.length === 0) return;
    const c = ctx._context;
    const u = 1 / absoluteScale(shape);
    const top = shape.getAbsoluteTransform().copy().invert().point({ x: 0, y: 0 }).y;
    const now = performance.now();
    for (const spell of spells) {
      c.save();
      try {
        drawSpell(c, spell, now, { u, top });
      } finally {
        c.restore();
      }
    }
  }, []);

  return (
    <MapLayerShell listening={false}>
      <Shape ref={shapeRef} sceneFunc={sceneFunc} listening={false} perfectDrawEnabled={false} />
    </MapLayerShell>
  );
}
