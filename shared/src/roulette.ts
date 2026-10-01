import type { Rng } from './ids';
import type { RouletteSegment } from './types/rollers';

function validWeight(segment: RouletteSegment): number {
  const w = segment.weight;
  return typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 0;
}

function validSegments(segments: RouletteSegment[]): RouletteSegment[] {
  return segments.filter((s) => validWeight(s) > 0);
}

/** Weighted pick. Segments with weight <= 0 are ignored. Throws (Spanish message) if none is valid. */
export function pickWeighted(segments: RouletteSegment[], rng: Rng): RouletteSegment {
  const valid = validSegments(segments);
  if (valid.length === 0) throw new Error('La ruleta no tiene ningún segmento con peso mayor que 0');
  const total = valid.reduce((sum, s) => sum + validWeight(s), 0);
  const r = rng();
  const target = Math.min(Math.max(Number.isFinite(r) ? r : 0, 0), 1) * total;
  let acc = 0;
  for (const s of valid) {
    acc += validWeight(s);
    if (target < acc) return s;
  }
  return valid[valid.length - 1]!;
}

export interface SegmentArc {
  segment: RouletteSegment;
  /** Degrees, clockwise from 12 o'clock (0..360). */
  startDeg: number;
  endDeg: number;
  midDeg: number;
}

/** Arc layout proportional to weight (visual size matches probability). Zero-weight segments omitted. */
export function segmentArcs(segments: RouletteSegment[]): SegmentArc[] {
  const valid = validSegments(segments);
  const total = valid.reduce((sum, s) => sum + validWeight(s), 0);
  if (total <= 0) return [];
  const arcs: SegmentArc[] = [];
  let acc = 0;
  valid.forEach((segment, i) => {
    const startDeg = (acc / total) * 360;
    acc += validWeight(segment);
    const endDeg = i === valid.length - 1 ? 360 : (acc / total) * 360;
    arcs.push({ segment, startDeg, endDeg, midDeg: (startDeg + endDeg) / 2 });
  });
  return arcs;
}

/** Normalizes degrees into [0, 360). */
export function normalizeDeg(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Angle in wheel coordinates (clockwise from the wheel's 12 o'clock) under the fixed top pointer. */
export function pointerAngle(rotation: number): number {
  return normalizeDeg(360 - normalizeDeg(rotation));
}

/** Segment under the top pointer for a wheel rotated clockwise by `rotation` degrees (null if empty). */
export function segmentAtRotation(segments: RouletteSegment[], rotation: number): RouletteSegment | null {
  const arcs = segmentArcs(segments);
  if (arcs.length === 0) return null;
  const angle = pointerAngle(rotation);
  for (const arc of arcs) if (angle >= arc.startDeg && angle < arc.endDeg) return arc.segment;
  return arcs[arcs.length - 1]!.segment;
}

/**
 * Final wheel rotation (degrees, clockwise, always > 0) such that the fixed pointer at 12 o'clock
 * lands inside the chosen segment once the wheel (drawn with segmentArcs at rotation 0) is rotated.
 * `jitter` in [0,1) selects the position inside the arc (kept away from the borders by 10%),
 * `spins` full turns are added for drama.
 */
export function targetRotation(segments: RouletteSegment[], segmentId: string, jitter: number, spins = 6): number {
  const arcs = segmentArcs(segments);
  const arc = arcs.find((a) => a.segment.id === segmentId);
  if (!arc) throw new Error('El segmento elegido no existe en la ruleta');
  const j = Number.isFinite(jitter) ? Math.min(Math.max(jitter, 0), 1) : 0.5;
  const width = arc.endDeg - arc.startDeg;
  const margin = width * 0.1;
  const angle = arc.startDeg + margin + j * (width - 2 * margin);
  const base = normalizeDeg(360 - angle);
  const turns = Number.isFinite(spins) ? Math.max(0, Math.floor(spins)) : 0;
  const rotation = turns * 360 + base;
  return rotation > 0 ? rotation : rotation + 360;
}

/** Probability (0..1) of each segment id, for display in editors. */
export function segmentProbabilities(segments: RouletteSegment[]): Record<string, number> {
  const total = segments.reduce((sum, s) => sum + validWeight(s), 0);
  const out: Record<string, number> = {};
  for (const s of segments) out[s.id] = total > 0 ? (out[s.id] ?? 0) + validWeight(s) / total : 0;
  return out;
}
