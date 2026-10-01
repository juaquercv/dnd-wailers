import { describe, expect, it } from 'vitest';
import {
  normalizeDeg,
  pickWeighted,
  pointerAngle,
  segmentArcs,
  segmentAtRotation,
  segmentProbabilities,
  targetRotation,
} from '../roulette';
import { seededRng, segment } from './helpers';

describe('pickWeighted', () => {
  it('follows the weights (seeded statistical check)', () => {
    const segs = [segment('a', 1), segment('b', 2), segment('c', 7)];
    const rng = seededRng(1234);
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const n = 30000;
    for (let i = 0; i < n; i++) counts[pickWeighted(segs, rng).id]!++;
    expect(counts.a! / n).toBeCloseTo(0.1, 1);
    expect(counts.b! / n).toBeCloseTo(0.2, 1);
    expect(counts.c! / n).toBeCloseTo(0.7, 1);
    expect(Math.abs(counts.a! / n - 0.1)).toBeLessThan(0.015);
    expect(Math.abs(counts.c! / n - 0.7)).toBeLessThan(0.015);
  });

  it('never picks zero or negative weights', () => {
    const segs = [segment('zero', 0), segment('neg', -3), segment('ok', 1), segment('nan', Number.NaN)];
    const rng = seededRng(5);
    for (let i = 0; i < 1000; i++) expect(pickWeighted(segs, rng).id).toBe('ok');
  });

  it('handles rng boundaries', () => {
    const segs = [segment('a', 1), segment('b', 1)];
    expect(pickWeighted(segs, () => 0).id).toBe('a');
    expect(pickWeighted(segs, () => 0.4999).id).toBe('a');
    expect(pickWeighted(segs, () => 0.5).id).toBe('b');
    expect(pickWeighted(segs, () => 0.999999).id).toBe('b');
    expect(pickWeighted(segs, () => 1).id).toBe('b');
  });

  it('throws a Spanish error when nothing is pickable', () => {
    expect(() => pickWeighted([], Math.random)).toThrow(/segmento/);
    expect(() => pickWeighted([segment('a', 0)], Math.random)).toThrow(/peso/);
  });
});

describe('segmentArcs', () => {
  it('lays out contiguous arcs proportional to weight, clockwise from 12 o’clock', () => {
    const arcs = segmentArcs([segment('a', 1), segment('b', 1), segment('c', 2)]);
    expect(arcs.map((a) => a.segment.id)).toEqual(['a', 'b', 'c']);
    expect(arcs[0]).toMatchObject({ startDeg: 0, endDeg: 90, midDeg: 45 });
    expect(arcs[1]).toMatchObject({ startDeg: 90, endDeg: 180, midDeg: 135 });
    expect(arcs[2]).toMatchObject({ startDeg: 180, endDeg: 360, midDeg: 270 });
  });

  it('omits zero-weight segments and ends exactly at 360', () => {
    const arcs = segmentArcs([segment('a', 1), segment('z', 0), segment('b', 2), segment('c', 4)]);
    expect(arcs.map((a) => a.segment.id)).toEqual(['a', 'b', 'c']);
    expect(arcs[arcs.length - 1]!.endDeg).toBe(360);
    for (let i = 1; i < arcs.length; i++) expect(arcs[i]!.startDeg).toBeCloseTo(arcs[i - 1]!.endDeg, 10);
  });

  it('returns [] when there is nothing to draw', () => {
    expect(segmentArcs([])).toEqual([]);
    expect(segmentArcs([segment('a', 0)])).toEqual([]);
  });
});

describe('pointer helpers', () => {
  it('normalizes degrees and computes the pointer angle in wheel coordinates', () => {
    expect(normalizeDeg(-30)).toBe(330);
    expect(normalizeDeg(720)).toBe(0);
    expect(pointerAngle(0)).toBe(0);
    expect(pointerAngle(90)).toBe(270);
    expect(pointerAngle(360 * 3 + 300)).toBe(60);
  });

  it('finds the segment under the pointer', () => {
    const segs = [segment('a', 1), segment('b', 1), segment('c', 1), segment('d', 1)];
    expect(segmentAtRotation(segs, 0)!.id).toBe('a');
    // Rotating the wheel 45° clockwise brings the end of the last quarter under the pointer.
    expect(segmentAtRotation(segs, 45)!.id).toBe('d');
    expect(segmentAtRotation(segs, 315)!.id).toBe('a');
    expect(segmentAtRotation(segs, 225)!.id).toBe('b');
    expect(segmentAtRotation([], 10)).toBeNull();
  });
});

describe('targetRotation', () => {
  it('lands the pointer inside the chosen segment for many random wheels', () => {
    const rng = seededRng(777);
    for (let iter = 0; iter < 3000; iter++) {
      const count = 1 + Math.floor(rng() * 12);
      const segs = Array.from({ length: count }, (_, i) => segment(`s${i}`, rng() < 0.1 ? 0 : 0.05 + rng() * 10));
      const valid = segs.filter((s) => s.weight > 0);
      if (valid.length === 0) continue;
      const chosen = valid[Math.floor(rng() * valid.length)]!;
      const jitter = rng();
      const spins = Math.floor(rng() * 10);
      const rotation = targetRotation(segs, chosen.id, jitter, spins);

      expect(rotation).toBeGreaterThan(0);
      expect(Math.floor(rotation / 360)).toBe(spins);
      expect(segmentAtRotation(segs, rotation)!.id).toBe(chosen.id);

      const arc = segmentArcs(segs).find((a) => a.segment.id === chosen.id)!;
      const angle = (360 - (rotation % 360)) % 360;
      const width = arc.endDeg - arc.startDeg;
      expect(angle - arc.startDeg).toBeGreaterThanOrEqual(width * 0.1 - 1e-6);
      expect(arc.endDeg - angle).toBeGreaterThanOrEqual(width * 0.1 - 1e-6);
    }
  });

  it('uses the default of 6 spins and is always positive', () => {
    const segs = [segment('a', 1), segment('b', 1)];
    const r = targetRotation(segs, 'a', 0.5);
    expect(r).toBeGreaterThan(6 * 360);
    expect(r).toBeLessThan(7 * 360);
    expect(targetRotation(segs, 'a', 0, 0)).toBeGreaterThan(0);
    expect(targetRotation([segment('only', 1)], 'only', 0.5, 0)).toBe(180);
  });

  it('jitter moves the landing point across the arc, away from the borders', () => {
    const segs = [segment('a', 1), segment('b', 1), segment('c', 1), segment('d', 1)];
    // Segment b spans 90..180; usable range 99..171.
    expect(pointerAngle(targetRotation(segs, 'b', 0, 0))).toBeCloseTo(99, 6);
    expect(pointerAngle(targetRotation(segs, 'b', 0.5, 0))).toBeCloseTo(135, 6);
    expect(pointerAngle(targetRotation(segs, 'b', 0.999999, 0))).toBeCloseTo(171, 3);
  });

  it('throws for unknown or zero-weight segments', () => {
    const segs = [segment('a', 1), segment('z', 0)];
    expect(() => targetRotation(segs, 'nope', 0.5)).toThrow(/segmento/);
    expect(() => targetRotation(segs, 'z', 0.5)).toThrow(/segmento/);
  });
});

describe('segmentProbabilities', () => {
  it('returns normalized probabilities including zero-weight ids', () => {
    const probs = segmentProbabilities([segment('a', 1), segment('b', 3), segment('z', 0)]);
    expect(probs.a).toBeCloseTo(0.25, 10);
    expect(probs.b).toBeCloseTo(0.75, 10);
    expect(probs.z).toBe(0);
    expect(Object.values(probs).reduce((s, p) => s + p, 0)).toBeCloseTo(1, 10);
  });

  it('is all zeros when no segment has weight', () => {
    expect(segmentProbabilities([segment('a', 0), segment('b', -1)])).toEqual({ a: 0, b: 0 });
    expect(segmentProbabilities([])).toEqual({});
  });
});
