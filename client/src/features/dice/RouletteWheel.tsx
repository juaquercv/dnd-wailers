import { useEffect, useId, useMemo, useRef, type CSSProperties } from 'react';
import clsx from 'clsx';
import { segmentArcs, segmentAtRotation, type RouletteSegment, type SegmentArc } from '@wailers/shared';
import { D20Icon } from '../../components/layout/Logo';
import { luminance, WHEEL_EASING_CSS, wheelEase } from './diceUtils';
import './dice.css';

export interface RouletteWheelProps {
  segments: RouletteSegment[];
  /** Clockwise rotation in degrees. Changing it spins the wheel over `durationMs`. */
  rotation: number;
  durationMs: number;
  /** Pixel size (default 320). */
  size?: number;
  /** Fired once when a spin (rotation change) finishes. */
  onSpinEnd?: () => void;
  /** Fired every time a new segment passes under the pointer while spinning (for tick sounds). */
  onSegmentPass?: (segment: RouletteSegment) => void;
  /** Winning segment to highlight with a glow. */
  highlightSegmentId?: string | null;
  className?: string;
}

const C = 100;
const RIM_OUTER = 99;
const RIM_INNER = 91;
const WEDGE_R = 90;
const HUB_R = 17;
/** Average glyph advance (em) of the bold label font. */
const GLYPH_EM = 0.58;
/** Labels shrink down to this size (wheel units) before being truncated with an ellipsis. */
const MIN_LABEL_FONT = 6.2;

function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
}

function wedgePath(r: number, startDeg: number, endDeg: number): string {
  if (endDeg - startDeg >= 359.999) {
    return `M ${C} ${C - r} A ${r} ${r} 0 1 1 ${C} ${C + r} A ${r} ${r} 0 1 1 ${C} ${C - r} Z`;
  }
  const [x1, y1] = polar(r, startDeg);
  const [x2, y2] = polar(r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${C} ${C} L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
}

function truncate(text: string, max: number): string {
  const chars = Array.from(text.trim());
  if (chars.length <= max) return chars.join('');
  if (max <= 1) return '…';
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}

interface LabelLayout {
  arc: SegmentArc;
  text: string | null;
  fontSize: number;
  textX: number;
  anchor: 'start' | 'end';
  rotate: number;
  icon: string | null;
  iconSize: number;
  iconX: number;
  textColor: string;
  strokeColor: string;
}

function layoutLabels(arcs: SegmentArc[]): LabelLayout[] {
  const rInner = HUB_R + 7;
  return arcs.map((arc) => {
    const width = Math.min(arc.endDeg - arc.startDeg, 180);
    const icon = arc.segment.icon?.trim() || null;
    const iconR = 77;
    const iconChord = 2 * iconR * Math.sin(((width / 2) * Math.PI) / 180);
    const iconSize = Math.min(15, iconChord * 0.62);
    const showIcon = !!icon && iconSize >= 4.5;
    const textOuter = showIcon ? iconR - iconSize * 0.75 : 84;
    const midR = (rInner + textOuter) / 2;
    const chord = 2 * midR * Math.sin(((width / 2) * Math.PI) / 180);
    const length = textOuter - rInner;
    const labelLength = Math.max(1, Array.from(arc.segment.label.trim()).length);
    // Largest size the wedge allows; shrink (down to a readable floor) before truncating long labels.
    const maxFont = Math.min(10.5, chord * 0.52);
    const fitFont = length / (labelLength * GLYPH_EM);
    const fontSize = Math.min(maxFont, Math.max(fitFont, Math.min(maxFont, MIN_LABEL_FONT)));
    const maxChars = Math.floor(length / (fontSize * GLYPH_EM));
    const showText = fontSize >= 3.6 && maxChars >= 1 && arc.segment.label.trim().length > 0;
    // Left half: flip so the text is upright when the wheel is at rest.
    const flip = arc.midDeg > 180;
    const light = luminance(arc.segment.color) > 0.6;
    return {
      arc,
      text: showText ? truncate(arc.segment.label, maxChars) : null,
      fontSize,
      textX: flip ? C - textOuter : C + textOuter,
      anchor: flip ? 'start' : 'end',
      rotate: flip ? arc.midDeg + 90 : arc.midDeg - 90,
      icon: showIcon ? icon : null,
      iconSize,
      iconX: flip ? C - iconR : C + iconR,
      textColor: light ? '#1a140c' : '#fffaf0',
      strokeColor: light ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.6)',
    };
  });
}

/** Fortune wheel: weighted wedges, golden rim with pegs, fixed hub and top pointer. */
export function RouletteWheel({
  segments,
  rotation,
  durationMs,
  size = 320,
  onSpinEnd,
  onSegmentPass,
  highlightSegmentId = null,
  className,
}: RouletteWheelProps) {
  const uid = useId().replace(/:/g, '');
  const arcs = useMemo(() => segmentArcs(segments), [segments]);
  const labels = useMemo(() => layoutLabels(arcs), [arcs]);

  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const onSpinEndRef = useRef(onSpinEnd);
  onSpinEndRef.current = onSpinEnd;
  const onPassRef = useRef(onSegmentPass);
  onPassRef.current = onSegmentPass;
  const prevRotation = useRef(rotation);
  const finishRef = useRef<(() => void) | null>(null);
  const pointerRef = useRef<SVGGElement>(null);
  const lastFlick = useRef(0);

  useEffect(() => {
    const from = prevRotation.current;
    prevRotation.current = rotation;
    if (from === rotation) return;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (finishRef.current === finish) finishRef.current = null;
      onSpinEndRef.current?.();
    };
    finishRef.current = finish;

    if (durationMs <= 0) {
      const id = requestAnimationFrame(finish);
      return () => {
        cancelAnimationFrame(id);
        if (finishRef.current === finish) finishRef.current = null;
      };
    }

    const start = performance.now();
    let lastId = segmentAtRotation(segmentsRef.current, from)?.id ?? null;
    let raf = requestAnimationFrame(function loop(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const current = from + (rotation - from) * wheelEase(t);
      const seg = segmentAtRotation(segmentsRef.current, current);
      if (seg && seg.id !== lastId) {
        lastId = seg.id;
        onPassRef.current?.(seg);
        if (now - lastFlick.current > 70 && pointerRef.current && typeof pointerRef.current.animate === 'function') {
          lastFlick.current = now;
          pointerRef.current.animate(
            [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-16deg)' }, { transform: 'rotate(0deg)' }],
            { duration: 140, easing: 'ease-out' },
          );
        }
      }
      if (t < 1) raf = requestAnimationFrame(loop);
    });
    const fallback = window.setTimeout(finish, durationMs + 400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
      if (finishRef.current === finish) finishRef.current = null;
    };
  }, [rotation, durationMs]);

  const rimId = `wheel-rim-${uid}`;
  const shadeId = `wheel-shade-${uid}`;
  const hubId = `wheel-hub-${uid}`;
  const pointerId = `wheel-ptr-${uid}`;
  const glowId = `wheel-glow-${uid}`;
  const pegId = `wheel-peg-${uid}`;

  const boundaries = arcs.length > 1 ? arcs.map((a) => a.startDeg) : [];
  const pegStep = boundaries.length > 48 ? Math.ceil(boundaries.length / 48) : 1;
  const pegs = boundaries.length > 0 ? boundaries.filter((_, i) => i % pegStep === 0) : Array.from({ length: 12 }, (_, i) => i * 30);
  const highlighted = highlightSegmentId ? arcs.find((a) => a.segment.id === highlightSegmentId) ?? null : null;

  const spinStyle: CSSProperties = {
    transform: `rotate(${rotation}deg)`,
    transition: durationMs > 0 ? `transform ${durationMs}ms ${WHEEL_EASING_CSS}` : 'none',
    willChange: 'transform',
  };

  return (
    <div
      className={clsx('relative shrink-0 select-none', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={highlighted ? `Ruleta: ${highlighted.segment.label}` : `Ruleta con ${arcs.length} segmentos`}
    >
      <div
        aria-hidden
        className="absolute inset-[1%] rounded-full"
        style={{ boxShadow: '0 22px 60px -18px rgba(0,0,0,0.95), 0 0 46px -10px rgba(233,192,99,0.45)' }}
      />
      {highlighted && (
        <div
          aria-hidden
          className="wl-wheel-halo absolute -inset-[3%] rounded-full"
          style={{ background: `radial-gradient(circle, transparent 58%, ${highlighted.segment.color}55 68%, transparent 74%)` }}
        />
      )}

      {/* Rotating part */}
      <div
        className="absolute inset-0"
        style={spinStyle}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === 'transform') finishRef.current?.();
        }}
      >
        <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden className="block">
          <defs>
            <linearGradient id={rimId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fcf1d2" />
              <stop offset="0.3" stopColor="#e9c063" />
              <stop offset="0.6" stopColor="#b0852b" />
              <stop offset="0.85" stopColor="#f3d58a" />
              <stop offset="1" stopColor="#7d5d1d" />
            </linearGradient>
            <radialGradient id={shadeId} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.2" />
              <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.02" />
              <stop offset="0.82" stopColor="#000000" stopOpacity="0.08" />
              <stop offset="1" stopColor="#000000" stopOpacity="0.5" />
            </radialGradient>
            <radialGradient id={pegId} cx="0.35" cy="0.3" r="0.7">
              <stop offset="0" stopColor="#fffbe8" />
              <stop offset="0.5" stopColor="#e9c063" />
              <stop offset="1" stopColor="#7d5d1d" />
            </radialGradient>
            <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <circle cx={C} cy={C} r={RIM_OUTER} fill={`url(#${rimId})`} />
          <circle cx={C} cy={C} r={RIM_INNER + 0.6} fill="#0b0a08" />
          <circle cx={C} cy={C} r={WEDGE_R} fill="#0b0a08" />

          {arcs.length === 0 ? (
            <>
              <circle cx={C} cy={C} r={WEDGE_R} fill="#27231d" />
              <text x={C} y={C + 40} textAnchor="middle" fontSize={9} fill="#a8946b" fontFamily="Inter, sans-serif">
                Sin segmentos
              </text>
            </>
          ) : (
            arcs.map((arc) => (
              <path
                key={arc.segment.id}
                d={wedgePath(WEDGE_R, arc.startDeg, arc.endDeg)}
                fill={arc.segment.color}
                style={{ opacity: highlighted && highlighted.segment.id !== arc.segment.id ? 0.45 : 1, transition: 'opacity 500ms ease' }}
              />
            ))
          )}

          <circle cx={C} cy={C} r={WEDGE_R} fill={`url(#${shadeId})`} pointerEvents="none" />

          {arcs.length > 1 &&
            arcs.map((arc) => {
              const [x, y] = polar(WEDGE_R, arc.startDeg);
              return (
                <line
                  key={`sep-${arc.segment.id}`}
                  x1={C}
                  y1={C}
                  x2={x}
                  y2={y}
                  stroke="rgba(11,10,8,0.55)"
                  strokeWidth={0.9}
                />
              );
            })}

          {labels.map((l) => (
            <g key={`lbl-${l.arc.segment.id}`} transform={`rotate(${l.rotate} ${C} ${C})`} pointerEvents="none">
              {l.icon && (
                <text
                  x={l.iconX}
                  y={C}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={l.iconSize}
                  transform={`rotate(${l.anchor === 'end' ? 90 : -90} ${l.iconX} ${C})`}
                >
                  {l.icon}
                </text>
              )}
              {l.text && (
                <text
                  x={l.textX}
                  y={C}
                  textAnchor={l.anchor}
                  dominantBaseline="central"
                  fontSize={l.fontSize}
                  fontWeight={700}
                  fontFamily="Inter, system-ui, sans-serif"
                  fill={l.textColor}
                  stroke={l.strokeColor}
                  strokeWidth={Math.max(0.6, l.fontSize * 0.14)}
                  paintOrder="stroke"
                  letterSpacing={0.1}
                >
                  {l.text}
                </text>
              )}
            </g>
          ))}

          {highlighted && (
            <path
              d={wedgePath(WEDGE_R - 1, highlighted.startDeg, highlighted.endDeg)}
              className="wl-wheel-win"
              fill="#ffffff"
              stroke="#fff8e1"
              strokeWidth={2.2}
              strokeLinejoin="round"
              filter={`url(#${glowId})`}
              pointerEvents="none"
            />
          )}

          <circle cx={C} cy={C} r={RIM_INNER} fill="none" stroke="rgba(11,10,8,0.85)" strokeWidth={1.4} />
          {pegs.map((deg, i) => {
            const [x, y] = polar((RIM_OUTER + RIM_INNER) / 2, deg);
            return <circle key={`peg-${i}`} cx={x} cy={y} r={2} fill={`url(#${pegId})`} stroke="rgba(51,38,12,0.9)" strokeWidth={0.5} />;
          })}
        </svg>
      </div>

      {/* Static part: hub + pointer */}
      <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden className="pointer-events-none absolute inset-0 block overflow-visible">
        <defs>
          <radialGradient id={hubId} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#fcf1d2" />
            <stop offset="0.45" stopColor="#d4a63f" />
            <stop offset="1" stopColor="#553f14" />
          </radialGradient>
          <linearGradient id={pointerId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fcf1d2" />
            <stop offset="0.45" stopColor="#e9c063" />
            <stop offset="1" stopColor="#7d5d1d" />
          </linearGradient>
        </defs>
        <circle cx={C} cy={C + 1.5} r={HUB_R + 1} fill="rgba(0,0,0,0.5)" />
        <circle cx={C} cy={C} r={HUB_R} fill={`url(#${hubId})`} stroke="#33260c" strokeWidth={1} />
        <circle cx={C} cy={C} r={HUB_R - 3.2} fill="#13110e" stroke="rgba(243,213,138,0.6)" strokeWidth={0.8} />
        <g transform={`translate(${C - 11} ${C - 11})`}>
          <D20Icon size={22} showNumber={false} />
        </g>
        <g ref={pointerRef} style={{ transformBox: 'fill-box', transformOrigin: '50% 18%' }}>
          <path d={`M ${C - 9} 0.5 L ${C + 9} 0.5 L ${C} 22 Z`} fill="rgba(0,0,0,0.45)" transform="translate(1.2 1.6)" />
          <path d={`M ${C - 9} 0.5 L ${C + 9} 0.5 L ${C} 22 Z`} fill={`url(#${pointerId})`} stroke="#33260c" strokeWidth={1} strokeLinejoin="round" />
          <circle cx={C} cy={5.5} r={2.6} fill="#13110e" stroke="#f3d58a" strokeWidth={0.8} />
        </g>
      </svg>
    </div>
  );
}

/** Small static wheel preview (no labels), e.g. in lists. */
export function MiniWheel({ segments, size = 28, className }: { segments: RouletteSegment[]; size?: number; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const arcs = useMemo(() => segmentArcs(segments), [segments]);
  const rimId = `mini-rim-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" className={clsx('shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id={rimId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3d58a" />
          <stop offset="1" stopColor="#7d5d1d" />
        </linearGradient>
      </defs>
      <circle cx={C} cy={C} r={99} fill={`url(#${rimId})`} />
      <circle cx={C} cy={C} r={88} fill="#13110e" />
      {arcs.map((arc) => (
        <path key={arc.segment.id} d={wedgePath(86, arc.startDeg, arc.endDeg)} fill={arc.segment.color} stroke="rgba(11,10,8,0.5)" strokeWidth={arcs.length > 24 ? 0 : 2} />
      ))}
      <circle cx={C} cy={C} r={20} fill={`url(#${rimId})`} stroke="#33260c" strokeWidth={3} />
    </svg>
  );
}

/** Horizontal color strip proportional to segment weights. */
export function SegmentStrip({ segments, className }: { segments: RouletteSegment[]; className?: string }) {
  const arcs = segmentArcs(segments);
  return (
    <div className={clsx('flex h-1.5 w-full overflow-hidden rounded-full bg-ink-700', className)} aria-hidden>
      {arcs.map((arc) => (
        <span
          key={arc.segment.id}
          className="h-full border-r border-ink-950/40 last:border-r-0"
          style={{ width: `${((arc.endDeg - arc.startDeg) / 360) * 100}%`, backgroundColor: arc.segment.color }}
          title={arc.segment.label}
        />
      ))}
    </div>
  );
}
