import { useId } from 'react';
import type { GridPair } from './gridModel';

export interface GridConnectionsProps {
  pairs: GridPair[];
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  gap: number;
}

const GOLD = '#e9c063';
const AMBER = '#f59e0b';
const PENDING = 'rgba(205, 185, 143, 0.45)';

/** SVG overlay drawing arrows in the gaps between adjacent zones of the board. */
export function GridConnections({ pairs, cols, rows, cellW, cellH, gap }: GridConnectionsProps) {
  const uid = useId().replace(/:/g, '');
  const gold = `gz-gold-${uid}`;
  const amber = `gz-amber-${uid}`;
  const glow = `gz-glow-${uid}`;
  const width = Math.max(0, cols * (cellW + gap) - gap);
  const height = Math.max(0, rows * (cellH + gap) - gap);
  const inset = 3;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none absolute left-0 top-0 z-10 overflow-visible"
      aria-hidden
    >
      <defs>
        <marker id={gold} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={GOLD} />
        </marker>
        <marker id={amber} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={AMBER} />
        </marker>
        <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {pairs.map((pair) => {
        let x1: number;
        let y1: number;
        let x2: number;
        let y2: number;
        if (pair.orientation === 'h') {
          x1 = pair.ax * (cellW + gap) + cellW + inset;
          x2 = (pair.ax + 1) * (cellW + gap) - inset;
          y1 = y2 = pair.ay * (cellH + gap) + cellH / 2;
        } else {
          x1 = x2 = pair.ax * (cellW + gap) + cellW / 2;
          y1 = pair.ay * (cellH + gap) + cellH + inset;
          y2 = (pair.ay + 1) * (cellH + gap) - inset;
        }
        if (pair.state === 'pending') {
          return (
            <g key={pair.key}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={PENDING} strokeWidth={2} strokeDasharray="3 4" strokeLinecap="round" />
              <circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={2.5} fill={PENDING} />
            </g>
          );
        }
        if (pair.state === 'oneway') {
          const [sx, sy, ex, ey] = pair.forward ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
          return (
            <line
              key={pair.key}
              x1={sx}
              y1={sy}
              x2={ex}
              y2={ey}
              stroke={AMBER}
              strokeWidth={2.5}
              strokeLinecap="round"
              markerEnd={`url(#${amber})`}
            />
          );
        }
        return (
          <line
            key={pair.key}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={GOLD}
            strokeWidth={2.5}
            strokeLinecap="round"
            filter={`url(#${glow})`}
            markerStart={`url(#${gold})`}
            markerEnd={`url(#${gold})`}
          />
        );
      })}
    </svg>
  );
}

/** Legend swatches matching the overlay. */
export function ConnectionSwatch({ state }: { state: 'linked' | 'oneway' | 'pending' }) {
  const color = state === 'linked' ? GOLD : state === 'oneway' ? AMBER : PENDING;
  return (
    <svg width={30} height={10} viewBox="0 0 30 10" aria-hidden className="shrink-0">
      <line
        x1={4}
        y1={5}
        x2={26}
        y2={5}
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={state === 'pending' ? '3 4' : undefined}
      />
      {state !== 'pending' && <path d="M22,1.5 L28,5 L22,8.5 z" fill={color} />}
      {state === 'linked' && <path d="M8,1.5 L2,5 L8,8.5 z" fill={color} />}
    </svg>
  );
}
