import { useId, useMemo, type CSSProperties, type ReactElement } from 'react';
import clsx from 'clsx';
import { d100Parts, seededRandom } from './diceUtils';

/** SVG polyhedron silhouettes for each die type (visual only). */

export interface DieStyle {
  from: string;
  to: string;
  edge: string;
  text: string;
}

const DIE_STYLES: Record<number, DieStyle> = {
  2: { from: '#c99a3a', to: '#553f14', edge: '#f8e4ae', text: '#fff8e1' },
  4: { from: '#2fa36b', to: '#0b3521', edge: '#9af2c6', text: '#f2fff8' },
  6: { from: '#cf4a3f', to: '#4a120e', edge: '#f6b4ab', text: '#fff4f2' },
  8: { from: '#3586d2', to: '#0d2742', edge: '#aedaff', text: '#f2f9ff' },
  10: { from: '#8d66f2', to: '#25135e', edge: '#d8c9ff', text: '#f7f3ff' },
  12: { from: '#d6782f', to: '#4a2209', edge: '#ffd3a6', text: '#fff7ef' },
  20: { from: '#43372a', to: '#0b0a08', edge: '#e9c063', text: '#f3d58a' },
  100: { from: '#22a092', to: '#08302c', edge: '#a3f2e8', text: '#effffd' },
};

const FALLBACK_STYLE: DieStyle = { from: '#5a5146', to: '#1c1915', edge: '#cdb98f', text: '#fbf6ea' };

export function dieStyle(sides: number): DieStyle {
  return DIE_STYLES[sides] ?? FALLBACK_STYLE;
}

type Pt = [number, number];

function pts(list: Pt[]): string {
  return list.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

function regular(n: number, r: number, startDeg = -90, cx = 50, cy = 50): Pt[] {
  return Array.from({ length: n }, (_, k) => {
    const a = ((startDeg + (k * 360) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt;
  });
}

interface Paint {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinejoin?: 'round';
  transform?: string;
}

interface ShapeDef {
  /** Renders the outline with the given paint props. */
  outline: (props: Paint) => ReactElement;
  /** Inner "front face" polygon (subtle highlight), optional. */
  face: string | null;
  /** Facet line path. */
  facets: string;
  textY: number;
  fontSize: number;
}

function polygonShape(points: Pt[], face: Pt[] | null, facetLines: [Pt, Pt][], textY: number, fontSize: number): ShapeDef {
  const p = pts(points);
  return {
    outline: (props) => <polygon points={p} {...props} />,
    face: face ? pts(face) : null,
    facets: facetLines.map(([a, b]) => `M${a[0].toFixed(2)},${a[1].toFixed(2)} L${b[0].toFixed(2)},${b[1].toFixed(2)}`).join(' '),
    textY,
    fontSize,
  };
}

function shapeFor(sides: number): ShapeDef {
  switch (sides) {
    case 2:
      return {
        outline: (props) => <circle cx={50} cy={50} r={45} {...props} />,
        face: null,
        facets: 'M50,13 A37,37 0 1 1 49.99,13',
        textY: 51,
        fontSize: 38,
      };
    case 3:
    case 4: {
      const outer: Pt[] = [
        [50, 5],
        [96, 88],
        [4, 88],
      ];
      const inner: Pt[] = [
        [50, 30],
        [76, 78],
        [24, 78],
      ];
      return polygonShape(
        outer,
        inner,
        [
          [outer[0]!, inner[0]!],
          [outer[1]!, inner[1]!],
          [outer[2]!, inner[2]!],
        ],
        63,
        28,
      );
    }
    case 6:
      return {
        outline: (props) => <rect x={8} y={8} width={84} height={84} rx={16} {...props} />,
        face: null,
        facets: 'M22,16 H78 Q84,16 84,22 V78 Q84,84 78,84 H22 Q16,84 16,78 V22 Q16,16 22,16 Z',
        textY: 52,
        fontSize: 44,
      };
    case 8: {
      const outer: Pt[] = [
        [50, 3],
        [96, 50],
        [50, 97],
        [4, 50],
      ];
      const inner: Pt[] = [
        [50, 17],
        [84, 63],
        [16, 63],
      ];
      return polygonShape(
        outer,
        inner,
        [
          [inner[0]!, outer[0]!],
          [inner[1]!, outer[1]!],
          [inner[2]!, outer[3]!],
          [inner[1]!, outer[2]!],
          [inner[2]!, outer[2]!],
        ],
        49,
        25,
      );
    }
    case 10:
    case 100: {
      const outer: Pt[] = [
        [50, 3],
        [96, 45],
        [50, 97],
        [4, 45],
      ];
      const inner: Pt[] = [
        [50, 14],
        [79, 47],
        [50, 79],
        [21, 47],
      ];
      return polygonShape(
        outer,
        inner,
        [
          [inner[0]!, outer[0]!],
          [inner[1]!, outer[1]!],
          [inner[2]!, outer[2]!],
          [inner[3]!, outer[3]!],
        ],
        48,
        sides === 100 ? 22 : 26,
      );
    }
    case 12: {
      const outer = regular(10, 47);
      const inner = regular(5, 27);
      return polygonShape(
        outer,
        inner,
        inner.map((p, k) => [p, outer[k * 2]!] as [Pt, Pt]),
        53,
        25,
      );
    }
    case 20: {
      const outer: Pt[] = [
        [50, 4.7],
        [89, 27.3],
        [89, 72.7],
        [50, 95.3],
        [10.9, 72.7],
        [10.9, 27.3],
      ];
      const inner: Pt[] = [
        [50, 21.9],
        [73.4, 62.5],
        [26.6, 62.5],
      ];
      return polygonShape(
        outer,
        inner,
        [
          [outer[0]!, inner[0]!],
          [outer[1]!, inner[1]!],
          [outer[5]!, inner[2]!],
          [outer[1]!, inner[0]!],
          [outer[5]!, inner[0]!],
          [inner[1]!, outer[2]!],
          [inner[2]!, outer[4]!],
          [inner[1]!, outer[3]!],
          [inner[2]!, outer[3]!],
        ],
        49,
        21,
      );
    }
    default: {
      const outer = regular(10, 47, -90);
      const inner = regular(10, 31, -72);
      return polygonShape(
        outer,
        inner,
        inner.map((p, k) => [p, outer[k]!] as [Pt, Pt]),
        51,
        24,
      );
    }
  }
}

export interface DieSvgProps {
  sides: number;
  /** Text shown on the face. */
  value: string | number;
  size: number;
  /** Style override (d100 tens die uses the d100 palette on a d10 body). */
  styleSides?: number;
  className?: string;
  style?: CSSProperties;
  /** Underline 6 and 9 to tell them apart. Default true for dice with 8+ sides. */
  underline69?: boolean;
}

/** One die silhouette with its value. */
export function DieSvg({ sides, value, size, styleSides, className, style, underline69 }: DieSvgProps) {
  const uid = useId().replace(/:/g, '');
  const shape = useMemo(() => shapeFor(sides), [sides]);
  const st = dieStyle(styleSides ?? sides);
  const text = String(value);
  const scale = text.length <= 2 ? 1 : text.length === 3 ? 0.78 : 0.6;
  const fontSize = shape.fontSize * scale;
  const showUnderline = (underline69 ?? sides >= 8) && (text === '6' || text === '9');
  const bodyId = `die-b-${uid}`;
  const glossId = `die-g-${uid}`;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={clsx('overflow-visible', className)} style={style} aria-hidden>
      <defs>
        <linearGradient id={bodyId} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={st.from} />
          <stop offset="1" stopColor={st.to} />
        </linearGradient>
        <radialGradient id={glossId} cx="0.3" cy="0.2" r="0.8">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.42" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.07" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {shape.outline({ fill: 'rgba(0,0,0,0.45)', transform: 'translate(2.5 3.5)' })}
      {shape.outline({ fill: `url(#${bodyId})`, stroke: st.edge, strokeWidth: 2.6, strokeLinejoin: 'round' })}
      {shape.face && <polygon points={shape.face} fill="#ffffff" fillOpacity={0.07} stroke={st.edge} strokeOpacity={0.55} strokeWidth={1.3} strokeLinejoin="round" />}
      {shape.facets && <path d={shape.facets} fill="none" stroke={st.edge} strokeOpacity={0.42} strokeWidth={1.3} strokeLinecap="round" />}
      {shape.outline({ fill: `url(#${glossId})` })}
      <text
        x={50}
        y={shape.textY}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Cinzel, Georgia, serif"
        fontWeight={700}
        fontSize={fontSize}
        fill={st.text}
        stroke="rgba(0,0,0,0.55)"
        strokeWidth={2.4}
        paintOrder="stroke"
      >
        {text}
      </text>
      {showUnderline && (
        <rect x={50 - fontSize * 0.28} y={shape.textY + fontSize * 0.46} width={fontSize * 0.56} height={Math.max(1.6, fontSize * 0.07)} rx={1} fill={st.text} />
      )}
    </svg>
  );
}

export interface DieViewProps {
  sides: number;
  value: number;
  size: number;
  className?: string;
}

/** Die visual for a value; d100 is drawn as a pair of percentile d10s. */
export function DieView({ sides, value, size, className }: DieViewProps) {
  if (sides === 100) {
    const { tens, units } = d100Parts(value);
    const s = size * 0.68;
    return (
      <span className={clsx('relative inline-block', className)} style={{ width: size, height: size }}>
        <DieSvg sides={10} styleSides={100} value={tens} size={s} className="absolute left-0 top-0" />
        <DieSvg sides={10} value={units} size={s} underline69 className="absolute bottom-0 right-0" />
      </span>
    );
  }
  return <DieSvg sides={sides} value={value} size={size} className={className} />;
}

/** Small die glyph for buttons (d100 shows "%"). */
export function DieGlyph({ sides, size = 40, className }: { sides: number; size?: number; className?: string }) {
  if (sides === 100) return <DieSvg sides={100} value="%" size={size} className={className} />;
  return <DieSvg sides={sides} value={sides} size={size} className={className} underline69={false} />;
}

// ---------------------------------------------------------------------------
// 3D d6 with pips
// ---------------------------------------------------------------------------

const PIP_LAYOUT: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Pips({ n, size }: { n: number; size: number }) {
  const cells = PIP_LAYOUT[n] ?? [];
  const pip = Math.max(5, size * 0.17);
  return (
    <div className="grid h-full w-full grid-cols-3 grid-rows-3 place-items-center p-[14%]">
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className="rounded-full"
          style={
            cells.includes(i)
              ? {
                  width: pip,
                  height: pip,
                  background: 'radial-gradient(circle at 35% 30%, #ffffff, #f3ead6 55%, #cdb98f)',
                  boxShadow: 'inset 0 -1px 2px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.25)',
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}

const FACE_TRANSFORMS = ['rotateY(0deg)', 'rotateY(180deg)', 'rotateY(90deg)', 'rotateY(-90deg)', 'rotateX(90deg)', 'rotateX(-90deg)'];

/** Values for [front, back, right, left, top, bottom] so that front = value and opposite faces sum 7. */
function cubeFaces(value: number): number[] {
  const v = Math.min(6, Math.max(1, Math.round(value)));
  const pairs = [
    [1, 6],
    [2, 5],
    [3, 4],
  ].filter((p) => !p.includes(v));
  const a = pairs[0]!;
  const b = pairs[1]!;
  return [v, 7 - v, a[0]!, a[1]!, b[0]!, b[1]!];
}

export interface D6CubeProps {
  value: number;
  size: number;
  /** Tumble duration; 0 shows the final face immediately. */
  durationMs: number;
  seed: number;
  className?: string;
}

/** CSS 3D cube that tumbles and lands showing `value` on its front face. */
export function D6Cube({ value, size, durationMs, seed, className }: D6CubeProps) {
  const faces = cubeFaces(value);
  const spin = useMemo(() => {
    const rnd = seededRandom(seed);
    const sign = () => (rnd() < 0.5 ? -1 : 1);
    return {
      rx: (2 + Math.floor(rnd() * 3)) * 360 * sign(),
      ry: (1 + Math.floor(rnd() * 3)) * 360 * sign(),
      rz: Math.floor(rnd() * 2) * 360 * sign(),
    };
  }, [seed]);
  const st = dieStyle(6);
  const half = size / 2;
  const cubeStyle = {
    '--wl-rx': `${spin.rx}deg`,
    '--wl-ry': `${spin.ry}deg`,
    '--wl-rz': `${spin.rz}deg`,
    animationDuration: `${Math.max(1, durationMs)}ms`,
    animationName: durationMs > 0 ? undefined : 'none',
  } as CSSProperties;

  return (
    <div className={clsx('wl-cube-scene', className)} style={{ width: size, height: size }}>
      <div className="wl-cube" style={cubeStyle}>
        {faces.map((n, i) => (
          <div
            key={i}
            className="wl-cube-face"
            style={{
              transform: `${FACE_TRANSFORMS[i]} translateZ(${half}px)`,
              background: `radial-gradient(circle at 30% 22%, ${st.from}, ${st.to} 92%)`,
              border: `2px solid ${st.edge}99`,
              boxShadow: 'inset 0 0 14px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.18)',
            }}
          >
            <Pips n={n} size={size} />
          </div>
        ))}
      </div>
    </div>
  );
}
