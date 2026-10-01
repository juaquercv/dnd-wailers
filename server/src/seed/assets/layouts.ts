import { createRng } from './rng';
import { blobPoints, flatten, roughen, type Pt } from './svg';

/**
 * Geometry shared by the procedural map art (maps.ts) and the seeded zone documents
 * (walls, lights, fog regions, transitions, token positions). Keeping both in one place
 * guarantees that walls follow the painted walls and doors sit on painted doors.
 */

export const CELL = 70;

export interface RectSpec {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WallSpec {
  points: number[];
  kind: 'wall' | 'door' | 'window';
  open: boolean;
}

export interface LightSpec {
  x: number;
  y: number;
  radius: number;
  color: string;
  intensity: number;
  flicker: boolean;
}

export interface Opening {
  /** Distance from the side start, px. */
  from: number;
  to: number;
  kind: 'door' | 'window' | 'gap';
}

/** Splits a straight side into wall pieces around doors, windows and gaps (collapsed sections). */
export function sideWalls(a: Pt, b: Pt, openings: Opening[] = []): WallSpec[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const at = (d: number): number[] => [Math.round(a.x + ux * d), Math.round(a.y + uy * d)];
  const sorted = [...openings].sort((p, q) => p.from - q.from);
  const out: WallSpec[] = [];
  let cursor = 0;
  for (const op of sorted) {
    if (op.from > cursor) out.push({ points: [...at(cursor), ...at(op.from)], kind: 'wall', open: false });
    if (op.kind !== 'gap') out.push({ points: [...at(op.from), ...at(op.to)], kind: op.kind, open: false });
    cursor = op.to;
  }
  if (cursor < len) out.push({ points: [...at(cursor), ...at(len)], kind: 'wall', open: false });
  return out;
}

export function rectPolygon(r: RectSpec): number[] {
  return [r.x, r.y, r.x + r.w, r.y, r.x + r.w, r.y + r.h, r.x, r.y + r.h];
}

export function ellipsePolygon(cx: number, cy: number, rx: number, ry: number, count = 20): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    out.push(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Aldea de Brezoscuro (2100 x 1400)
// ---------------------------------------------------------------------------

export interface HouseSpec {
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** degrees */
  rot: number;
  roof: string;
}

export const VILLAGE = {
  width: 2100,
  height: 1400,
  mainRoad: [
    { x: -20, y: 720 },
    { x: 300, y: 705 },
    { x: 620, y: 690 },
    { x: 850, y: 700 },
    { x: 1050, y: 700 },
    { x: 1300, y: 690 },
    { x: 1600, y: 645 },
    { x: 1850, y: 615 },
    { x: 2120, y: 600 },
  ] as Pt[],
  northRoad: [
    { x: 1050, y: 700 },
    { x: 1035, y: 450 },
    { x: 1000, y: 200 },
    { x: 1012, y: -20 },
  ] as Pt[],
  southRoad: [
    { x: 1050, y: 700 },
    { x: 1080, y: 950 },
    { x: 1120, y: 1200 },
    { x: 1150, y: 1420 },
  ] as Pt[],
  plaza: { x: 1050, y: 700, r: 200 },
  well: { x: 1050, y: 700, r: 40 },
  tavern: { cx: 1440, cy: 400, w: 300, h: 200, rot: 0, roof: '#8a3b22' } as HouseSpec,
  tavernDoor: { x: 1400, y: 500 },
  tavernTransition: { x: 1400, y: 548 },
  smithy: { cx: 680, cy: 415, w: 240, h: 170, rot: 0, roof: '#4d4a46' } as HouseSpec,
  forge: { x: 770, y: 565 },
  anvil: { x: 655, y: 572 },
  houses: [
    { cx: 300, cy: 420, w: 170, h: 120, rot: -8, roof: '#7a4a2a' },
    { cx: 330, cy: 1000, w: 170, h: 120, rot: 6, roof: '#6b5236' },
    { cx: 620, cy: 960, w: 150, h: 110, rot: -4, roof: '#8f5a30' },
    { cx: 790, cy: 210, w: 150, h: 120, rot: 4, roof: '#6e3d26' },
    { cx: 1220, cy: 170, w: 150, h: 104, rot: -3, roof: '#7d4b2b' },
    { cx: 1360, cy: 950, w: 180, h: 120, rot: -6, roof: '#7a4a2a' },
    { cx: 1620, cy: 1040, w: 150, h: 120, rot: 10, roof: '#5f3f2a' },
    { cx: 1720, cy: 330, w: 140, h: 110, rot: -5, roof: '#8a5530' },
    { cx: 1900, cy: 430, w: 150, h: 110, rot: 8, roof: '#6b4430' },
    { cx: 840, cy: 1190, w: 140, h: 110, rot: 3, roof: '#7b4f2e' },
  ] as HouseSpec[],
  stalls: [
    { x: 925, y: 580, rot: -40, color: '#b8402f' },
    { x: 1175, y: 580, rot: 40, color: '#2f6fb8' },
    { x: 1180, y: 830, rot: 135, color: '#d9a62e' },
    { x: 915, y: 830, rot: -135, color: '#3f8f4a' },
  ],
  fields: [
    { x: 60, y: 1110, w: 560, h: 250, rot: -2, crop: '#c9a94a' },
    { x: 1260, y: 1180, w: 300, h: 190, rot: 2, crop: '#8fae4a' },
    { x: 1700, y: 760, w: 330, h: 230, rot: 0, crop: '#d8bb5a' },
  ],
  pond: { x: 1830, y: 170, rx: 120, ry: 70 },
  spawn: { x: 1050, y: 810 },
  guards: [
    { x: 175, y: 640 },
    { x: 175, y: 790 },
  ],
  eldric: { x: 1120, y: 640 },
  bruno: { x: 700, y: 610 },
};

// ---------------------------------------------------------------------------
// Taberna El Jabalí Dorado (1680 x 1120, 24 x 16 cells)
// ---------------------------------------------------------------------------

export const TAVERN = (() => {
  const x0 = 70;
  const y0 = 70;
  const x1 = 1610;
  const y1 = 1050;
  const split = 1120;
  const walls: WallSpec[] = [
    // Outer shell with windows and the front door.
    ...sideWalls({ x: x0, y: y0 }, { x: x1, y: y0 }, [{ from: 1260, to: 1330, kind: 'window' }]),
    ...sideWalls({ x: x1, y: y0 }, { x: x1, y: y1 }, [
      { from: 140, to: 210, kind: 'window' },
      { from: 530, to: 600, kind: 'window' },
      { from: 810, to: 880, kind: 'window' },
    ]),
    ...sideWalls({ x: x1, y: y1 }, { x: x0, y: y1 }, [
      { from: 700, to: 770, kind: 'window' },
      { from: 1050, to: 1120, kind: 'door' },
      { from: 1330, to: 1400, kind: 'window' },
    ]),
    ...sideWalls({ x: x0, y: y1 }, { x: x0, y: y0 }, [
      { from: 210, to: 280, kind: 'window' },
      { from: 700, to: 770, kind: 'window' },
    ]),
    // Kitchen and rooms.
    ...sideWalls({ x: split, y: y0 }, { x: split, y: 490 }, [{ from: 70, to: 140, kind: 'door' }]),
    ...sideWalls({ x: split, y: 490 }, { x: x1, y: 490 }),
    ...sideWalls({ x: split, y: 490 }, { x: split, y: y1 }, [
      { from: 70, to: 140, kind: 'door' },
      { from: 420, to: 490, kind: 'door' },
    ]),
    ...sideWalls({ x: split, y: 770 }, { x: x1, y: 770 }),
  ];
  return {
    width: 1680,
    height: 1120,
    shell: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } as RectSpec,
    hall: { x: x0, y: y0, w: split - x0, h: y1 - y0 } as RectSpec,
    kitchen: { x: split, y: y0, w: x1 - split, h: 490 - y0 } as RectSpec,
    room1: { x: split, y: 490, w: x1 - split, h: 280 } as RectSpec,
    room2: { x: split, y: 770, w: x1 - split, h: y1 - 770 } as RectSpec,
    walls,
    frontDoor: { x: 525, y: y1 },
    exitTransition: { x: 525, y: 1085 },
    arrival: { x: 525, y: 975 },
    bar: { x: 630, y: 196, w: 420, h: 56 } as RectSpec,
    backShelf: { x: 640, y: 78, w: 400, h: 34 } as RectSpec,
    fireplace: { x: 70, y: 490, w: 64, h: 140 } as RectSpec,
    tables: [
      { x: 290, y: 300 },
      { x: 290, y: 820 },
      { x: 560, y: 560 },
      { x: 860, y: 540 },
      { x: 820, y: 850 },
    ],
    rug: { x: 420, y: 400, w: 560, h: 300 } as RectSpec,
    kitchenTable: { x: 1240, y: 250, w: 210, h: 90 } as RectSpec,
    oven: { x: 1470, y: 78, w: 130, h: 84 } as RectSpec,
    beds: [
      { x: 1440, y: 505, w: 150, h: 72 },
      { x: 1440, y: 685, w: 150, h: 72 },
      { x: 1420, y: 800, w: 170, h: 120 },
    ] as RectSpec[],
    lights: [
      { x: 140, y: 560, radius: 420, color: '#ff9a3c', intensity: 0.95, flicker: true },
      { x: 150, y: 150, radius: 260, color: '#ffb057', intensity: 0.8, flicker: true },
      { x: 480, y: 130, radius: 260, color: '#ffb057', intensity: 0.8, flicker: true },
      { x: 150, y: 980, radius: 260, color: '#ffb057', intensity: 0.8, flicker: true },
      { x: 1040, y: 980, radius: 280, color: '#ffb057', intensity: 0.8, flicker: true },
      { x: 1530, y: 160, radius: 320, color: '#ff8a3a', intensity: 0.85, flicker: true },
      { x: 1200, y: 560, radius: 220, color: '#ffd28a', intensity: 0.7, flicker: true },
      { x: 1250, y: 840, radius: 220, color: '#ffd28a', intensity: 0.7, flicker: true },
    ] as LightSpec[],
    marta: { x: 840, y: 140 },
    thief: { x: 1300, y: 960 },
  };
})();

// ---------------------------------------------------------------------------
// Bosque de los Susurros (2100 x 1400)
// ---------------------------------------------------------------------------

export const FOREST = {
  width: 2100,
  height: 1400,
  mainPath: [
    { x: -20, y: 760 },
    { x: 250, y: 740 },
    { x: 520, y: 800 },
    { x: 800, y: 725 },
    { x: 1000, y: 690 },
    { x: 1250, y: 700 },
    { x: 1500, y: 660 },
    { x: 1750, y: 620 },
    { x: 2120, y: 640 },
  ] as Pt[],
  southPath: [
    { x: 1250, y: 700 },
    { x: 1200, y: 900 },
    { x: 1100, y: 1100 },
    { x: 1060, y: 1420 },
  ] as Pt[],
  stream: [
    { x: 1560, y: -30 },
    { x: 1520, y: 200 },
    { x: 1620, y: 420 },
    { x: 1585, y: 655 },
    { x: 1700, y: 900 },
    { x: 1640, y: 1150 },
    { x: 1760, y: 1430 },
  ] as Pt[],
  bridge: { x: 1588, y: 652, w: 150, h: 92 },
  clearing: { x: 1100, y: 640, rx: 300, ry: 235 },
  campfire: { x: 1130, y: 640 },
  tents: [
    { x: 1000, y: 545, rot: -15 },
    { x: 1250, y: 540, rot: 18 },
    { x: 1230, y: 770, rot: 160 },
  ],
  fairyRing: { x: 420, y: 420, r: 62 },
  fallenLog: { x: 700, y: 1110, len: 280, rot: 18 },
  wolves: [
    { x: 560, y: 980 },
    { x: 650, y: 1050 },
    { x: 500, y: 1085 },
  ],
  goblins: [
    { x: 1020, y: 660 },
    { x: 1245, y: 655 },
  ],
  shaman: { x: 1130, y: 545 },
  campLight: { x: 1130, y: 640, radius: 340, color: '#ff8c3a', intensity: 0.9, flicker: true } as LightSpec,
};

// ---------------------------------------------------------------------------
// Montañas Cenicientas (2100 x 1400)
// ---------------------------------------------------------------------------

function lavaCracks(): Pt[][] {
  const rng = createRng('montanas-grietas');
  const seeds: { x: number; y: number; a: number; steps: number }[] = [
    { x: 260, y: 1180, a: -0.3, steps: 14 },
    { x: 760, y: 1320, a: -0.9, steps: 12 },
    { x: 1250, y: 1050, a: -2.6, steps: 10 },
    { x: 1250, y: 1050, a: 0.5, steps: 12 },
    { x: 1420, y: 980, a: -1.2, steps: 9 },
    { x: 1900, y: 1250, a: -2.2, steps: 11 },
    { x: 420, y: 300, a: 0.4, steps: 8 },
  ];
  const cracks: Pt[][] = [];
  for (const s of seeds) {
    const pts: Pt[] = [{ x: s.x, y: s.y }];
    let a = s.a;
    let x = s.x;
    let y = s.y;
    for (let i = 0; i < s.steps; i++) {
      a += rng.jitter(0.5);
      const len = rng.range(38, 68);
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      pts.push({ x, y });
      if (rng.chance(0.18) && i > 2) {
        const branch: Pt[] = [{ x, y }];
        let ba = a + (rng.chance(0.5) ? 0.9 : -0.9);
        let bx = x;
        let by = y;
        for (let k = 0; k < 4; k++) {
          ba += rng.jitter(0.4);
          bx += Math.cos(ba) * rng.range(30, 50);
          by += Math.sin(ba) * rng.range(30, 50);
          branch.push({ x: bx, y: by });
        }
        cracks.push(branch);
      }
    }
    cracks.push(pts);
  }
  return cracks;
}

export const MOUNTAINS = {
  width: 2100,
  height: 1400,
  path: [
    { x: -20, y: 760 },
    { x: 260, y: 720 },
    { x: 460, y: 815 },
    { x: 700, y: 760 },
    { x: 900, y: 625 },
    { x: 1150, y: 645 },
    { x: 1350, y: 525 },
    { x: 1520, y: 470 },
    { x: 1700, y: 440 },
    { x: 1775, y: 430 },
  ] as Pt[],
  caveMouth: { x: 1780, y: 330, rx: 135, ry: 88 },
  caveTransition: { x: 1775, y: 432 },
  caveArrival: { x: 1700, y: 520 },
  lavaPool: { x: 1250, y: 1050, rx: 175, ry: 112 },
  cracks: lavaCracks(),
  ogre: { x: 1060, y: 590 },
  orcs: [
    { x: 640, y: 690 },
    { x: 560, y: 820 },
  ],
  elemental: { x: 1250, y: 930 },
  lights: [
    { x: 1250, y: 1050, radius: 460, color: '#ff5a1f', intensity: 0.9, flicker: true },
    { x: 520, y: 1210, radius: 220, color: '#ff6a2a', intensity: 0.6, flicker: true },
    { x: 1700, y: 1150, radius: 240, color: '#ff6a2a', intensity: 0.6, flicker: true },
    { x: 1780, y: 330, radius: 160, color: '#ff7a3a', intensity: 0.45, flicker: true },
  ] as LightSpec[],
};

// ---------------------------------------------------------------------------
// Cueva del Dragón (2100 x 1400)
// ---------------------------------------------------------------------------

const CAVE_COARSE: Pt[] = [
  { x: 0, y: 640 },
  { x: 150, y: 630 },
  { x: 260, y: 560 },
  { x: 330, y: 420 },
  { x: 450, y: 330 },
  { x: 620, y: 300 },
  { x: 780, y: 330 },
  { x: 900, y: 400 },
  { x: 980, y: 520 },
  { x: 1010, y: 620 },
  { x: 1150, y: 600 },
  { x: 1280, y: 560 },
  { x: 1350, y: 380 },
  { x: 1480, y: 240 },
  { x: 1680, y: 190 },
  { x: 1880, y: 230 },
  { x: 2000, y: 360 },
  { x: 2040, y: 560 },
  { x: 2030, y: 780 },
  { x: 1990, y: 980 },
  { x: 1900, y: 1150 },
  { x: 1720, y: 1250 },
  { x: 1520, y: 1240 },
  { x: 1380, y: 1130 },
  { x: 1300, y: 960 },
  { x: 1270, y: 830 },
  { x: 1150, y: 800 },
  { x: 1010, y: 810 },
  { x: 980, y: 940 },
  { x: 900, y: 1080 },
  { x: 760, y: 1170 },
  { x: 580, y: 1190 },
  { x: 400, y: 1130 },
  { x: 290, y: 1010 },
  { x: 240, y: 880 },
  { x: 150, y: 810 },
  { x: 0, y: 800 },
];

export const CAVE = (() => {
  const rng = createRng('cueva-dragon');
  const outline = roughen(rng, CAVE_COARSE, false, 55, 16);
  // Keep the entrance ends exactly on the map edge.
  outline[0] = { x: 0, y: 640 };
  outline[outline.length - 1] = { x: 0, y: 800 };
  const pillars = [
    blobPoints(rng, 520, 560, 46, 40, 9, 0.25),
    blobPoints(rng, 770, 880, 56, 48, 10, 0.25),
    blobPoints(rng, 1460, 1010, 50, 44, 9, 0.25),
    blobPoints(rng, 1880, 420, 40, 36, 8, 0.25),
  ];
  const walls: WallSpec[] = [
    { points: flatten(outline), kind: 'wall', open: false },
    ...pillars.map((p) => ({ points: flatten(p, true), kind: 'wall' as const, open: false })),
  ];
  return {
    width: 2100,
    height: 1400,
    outline,
    pillars,
    walls,
    lavaPool: { x: 600, y: 990, rx: 135, ry: 80 },
    innerLava: { x: 1840, y: 960, rx: 105, ry: 150 },
    hoard: { x: 1680, y: 560, rx: 230, ry: 150 },
    dragon: { x: 1640, y: 790 },
    rats: [
      { x: 430, y: 760 },
      { x: 380, y: 905 },
    ],
    items: {
      orb: { x: 1700, y: 505 },
      ruby: { x: 1580, y: 590 },
      amulet: { x: 1800, y: 600 },
    },
    entryTransition: { x: 35, y: 720 },
    arrival: { x: 140, y: 720 },
    innerFog: [1150, 520, 1300, 170, 2100, 140, 2100, 1300, 1300, 1300, 1180, 860],
    lights: [
      { x: 600, y: 990, radius: 400, color: '#ff5a1f', intensity: 0.9, flicker: true },
      { x: 1840, y: 960, radius: 380, color: '#ff5a1f', intensity: 0.9, flicker: true },
      { x: 1680, y: 560, radius: 240, color: '#ffd27a', intensity: 0.6, flicker: false },
      { x: 70, y: 720, radius: 280, color: '#cfd8ff', intensity: 0.5, flicker: false },
    ] as LightSpec[],
  };
})();

// ---------------------------------------------------------------------------
// Torre del Hechicero (1400 x 1400, two levels)
// ---------------------------------------------------------------------------

export const TOWER = (() => {
  const cx = 700;
  const cy = 700;
  const wallR = 570;
  const segments = 48;
  const doorFrom = 84;
  const doorTo = 96;
  const ringPoint = (deg: number, r = wallR): Pt => ({ x: cx + Math.cos((deg * Math.PI) / 180) * r, y: cy + Math.sin((deg * Math.PI) / 180) * r });
  // Ground floor wall: circle from doorTo around to doorFrom, plus the door chord.
  const arc: Pt[] = [];
  for (let i = 0; i <= segments; i++) {
    const deg = doorTo + (i / segments) * (360 - (doorTo - doorFrom));
    arc.push(ringPoint(deg));
  }
  const groundWalls: WallSpec[] = [
    { points: flatten(arc), kind: 'wall', open: false },
    { points: flatten([ringPoint(doorFrom), ringPoint(doorTo)]), kind: 'door', open: false },
  ];
  // Top floor: low battlements, they do not block vision (windows).
  const battlementRing: Pt[] = [];
  for (let i = 0; i < segments; i++) battlementRing.push(ringPoint((i / segments) * 360, 575));
  const topWalls: WallSpec[] = [{ points: flatten(battlementRing, true), kind: 'window', open: false }];
  return {
    width: 1400,
    height: 1400,
    cx,
    cy,
    wallR,
    innerR: 540,
    outerR: 600,
    doorFrom,
    doorTo,
    groundWalls,
    topWalls,
    stairs: { x: 950, y: 430, r: 112 },
    stairsArrival: { x: 850, y: 500 },
    entrance: { x: 700, y: 1330 },
    desk: { x: 400, y: 720, w: 170, h: 84 },
    alchemy: { x: 860, y: 860, w: 180, h: 80 },
    groundLights: [
      { x: 700, y: 700, radius: 320, color: '#8ab4ff', intensity: 0.75, flicker: false },
      { x: 430, y: 470, radius: 260, color: '#ffb057', intensity: 0.8, flicker: true },
      { x: 990, y: 980, radius: 260, color: '#ffb057', intensity: 0.8, flicker: true },
      { x: 700, y: 1240, radius: 200, color: '#ffb057', intensity: 0.7, flicker: true },
    ] as LightSpec[],
    topLights: [
      { x: 700, y: 700, radius: 560, color: '#a98bff', intensity: 0.85, flicker: false },
      { x: 320, y: 700, radius: 180, color: '#7fd6ff', intensity: 0.7, flicker: false },
      { x: 1080, y: 700, radius: 180, color: '#7fd6ff', intensity: 0.7, flicker: false },
      { x: 700, y: 320, radius: 180, color: '#7fd6ff', intensity: 0.7, flicker: false },
      { x: 700, y: 1080, radius: 180, color: '#7fd6ff', intensity: 0.7, flicker: false },
    ] as LightSpec[],
    skeletons: [
      { x: 620, y: 560 },
      { x: 790, y: 560 },
    ],
    spider: { x: 1020, y: 1000 },
    elemental: { x: 700, y: 700 },
    crystals: [
      { x: 320, y: 700 },
      { x: 1080, y: 700 },
      { x: 700, y: 320 },
      { x: 700, y: 1080 },
    ],
  };
})();

// ---------------------------------------------------------------------------
// Cementerio de Valdris (2100 x 1400)
// ---------------------------------------------------------------------------

export const CEMETERY = {
  width: 2100,
  height: 1400,
  fence: { x: 60, y: 60, w: 1980, h: 1280 } as RectSpec,
  gate: { from: 990, to: 1110 },
  mainPath: [
    { x: 1050, y: 1420 },
    { x: 1050, y: 1200 },
    { x: 1030, y: 900 },
    { x: 1060, y: 600 },
    { x: 1050, y: 360 },
  ] as Pt[],
  branchPath: [
    { x: 1040, y: 800 },
    { x: 800, y: 760 },
    { x: 620, y: 690 },
    { x: 500, y: 650 },
  ] as Pt[],
  chapel: { x: 170, y: 330, w: 310, h: 430 } as RectSpec,
  chapelDoor: { x: 480, y: 650 },
  chapelTransition: { x: 515, y: 650 },
  chapelArrival: { x: 560, y: 650 },
  crypt: { x: 900, y: 110, w: 300, h: 220 } as RectSpec,
  cryptTransition: { x: 1050, y: 365 },
  cryptArrival: { x: 1050, y: 450 },
  mausoleums: [
    { x: 1560, y: 330, w: 170, h: 120 },
    { x: 1660, y: 960, w: 150, h: 110 },
    { x: 690, y: 1110, w: 140, h: 100 },
  ] as RectSpec[],
  deadTrees: [
    { x: 300, y: 1020 },
    { x: 1900, y: 250 },
    { x: 1480, y: 760 },
    { x: 560, y: 200 },
    { x: 1860, y: 1180 },
    { x: 260, y: 160 },
  ],
  zombies: [
    { x: 790, y: 500 },
    { x: 1400, y: 900 },
    { x: 1650, y: 640 },
  ],
  skeletons: [
    { x: 970, y: 430 },
    { x: 1130, y: 430 },
  ],
  spawn: { x: 1050, y: 1250 },
  lights: [
    { x: 985, y: 1330, radius: 230, color: '#ffcc66', intensity: 0.8, flicker: true },
    { x: 1115, y: 1330, radius: 230, color: '#ffcc66', intensity: 0.8, flicker: true },
    { x: 960, y: 360, radius: 260, color: '#6fffd2', intensity: 0.7, flicker: true },
    { x: 1140, y: 360, radius: 260, color: '#6fffd2', intensity: 0.7, flicker: true },
    { x: 330, y: 540, radius: 200, color: '#ffd28a', intensity: 0.5, flicker: true },
  ] as LightSpec[],
};

// ---------------------------------------------------------------------------
// Grid dungeons: Cripta superior / Osario profundo (2100 x 1400, 30 x 20 cells)
// ---------------------------------------------------------------------------

export type CellRect = [x: number, y: number, w: number, h: number];

export interface GridDungeon {
  cols: number;
  rows: number;
  floor: boolean[];
  rooms: Record<string, CellRect>;
  doors: WallSpec[];
  walls: WallSpec[];
}

function buildDungeon(cols: number, rows: number, rooms: Record<string, CellRect>, pillars: [number, number][], doors: [number, number, number, number][]): GridDungeon {
  const floor = new Array<boolean>(cols * rows).fill(false);
  for (const [x, y, w, h] of Object.values(rooms)) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < cols && j < rows) floor[j * cols + i] = true;
  }
  for (const [i, j] of pillars) floor[j * cols + i] = false;
  const isFloor = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < cols && j < rows && floor[j * cols + i] === true;

  // Collect unit boundary edges, then merge collinear runs.
  const horizontal = new Map<number, number[]>(); // y -> list of cell x where an edge exists on top of cell row y
  const vertical = new Map<number, number[]>(); // x -> list of cell y
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (isFloor(i, j - 1) !== isFloor(i, j)) {
        const list = horizontal.get(j) ?? [];
        list.push(i);
        horizontal.set(j, list);
      }
    }
  }
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (isFloor(i - 1, j) !== isFloor(i, j)) {
        const list = vertical.get(i) ?? [];
        list.push(j);
        vertical.set(i, list);
      }
    }
  }
  const walls: WallSpec[] = [];
  for (const [j, xs] of horizontal) {
    xs.sort((a, b) => a - b);
    let start = xs[0]!;
    let prev = start;
    for (let k = 1; k <= xs.length; k++) {
      const cur = xs[k];
      if (cur !== undefined && cur === prev + 1) {
        prev = cur;
        continue;
      }
      walls.push({ points: [start * CELL, j * CELL, (prev + 1) * CELL, j * CELL], kind: 'wall', open: false });
      if (cur !== undefined) {
        start = cur;
        prev = cur;
      }
    }
  }
  for (const [i, ys] of vertical) {
    ys.sort((a, b) => a - b);
    let start = ys[0]!;
    let prev = start;
    for (let k = 1; k <= ys.length; k++) {
      const cur = ys[k];
      if (cur !== undefined && cur === prev + 1) {
        prev = cur;
        continue;
      }
      walls.push({ points: [i * CELL, start * CELL, i * CELL, (prev + 1) * CELL], kind: 'wall', open: false });
      if (cur !== undefined) {
        start = cur;
        prev = cur;
      }
    }
  }
  const doorWalls: WallSpec[] = doors.map(([ax, ay, bx, by]) => ({ points: [ax * CELL, ay * CELL, bx * CELL, by * CELL], kind: 'door', open: false }));
  return { cols, rows, floor, rooms, doors: doorWalls, walls: [...walls, ...doorWalls] };
}

export function cellRectPx(r: CellRect): RectSpec {
  return { x: r[0] * CELL, y: r[1] * CELL, w: r[2] * CELL, h: r[3] * CELL };
}

export function cellRectPolygon(r: CellRect): number[] {
  return rectPolygon(cellRectPx(r));
}

export const CRYPT_UPPER = (() => {
  const rooms: Record<string, CellRect> = {
    entry: [12, 1, 6, 5],
    stairsDownCorridor: [14, 6, 2, 4],
    hall: [9, 10, 12, 6],
    westCorridor: [4, 12, 5, 2],
    west: [1, 8, 3, 9],
    nwCorridor: [5, 2, 7, 2],
    nw: [1, 1, 4, 5],
    neCorridor: [18, 3, 4, 2],
    ne: [22, 1, 6, 6],
    eastCorridor: [21, 12, 4, 2],
    east: [25, 9, 4, 8],
  };
  const pillars: [number, number][] = [
    [11, 11],
    [18, 11],
    [11, 14],
    [18, 14],
  ];
  const doors: [number, number, number, number][] = [
    [14, 6, 16, 6],
    [14, 10, 16, 10],
    [4, 12, 4, 14],
    [9, 12, 9, 14],
    [5, 2, 5, 4],
    [22, 3, 22, 5],
    [25, 12, 25, 14],
  ];
  const d = buildDungeon(30, 20, rooms, pillars, doors);
  return {
    ...d,
    width: 2100,
    height: 1400,
    pillars,
    stairsUp: { x: 1050, y: 105 },
    arrivalFromCemetery: { x: 1050, y: 250 },
    stairsDown: { x: 1890, y: 1050 },
    arrivalFromOssuary: { x: 1890, y: 910 },
    sarcophagi: [
      { x: 175, y: 700 },
      { x: 175, y: 880 },
      { x: 175, y: 1060 },
    ],
    lights: [
      { x: 1050, y: 210, radius: 260, color: '#ffb057', intensity: 0.8, flicker: true },
      { x: 700, y: 770, radius: 240, color: '#ffb057', intensity: 0.75, flicker: true },
      { x: 1400, y: 770, radius: 240, color: '#ffb057', intensity: 0.75, flicker: true },
      { x: 1750, y: 280, radius: 230, color: '#6fffd2', intensity: 0.65, flicker: true },
      { x: 1890, y: 760, radius: 200, color: '#ffb057', intensity: 0.7, flicker: true },
    ] as LightSpec[],
    skeletons: [
      { x: 910, y: 950 },
      { x: 1200, y: 950 },
    ],
    rats: [
      { x: 160, y: 790 },
      { x: 210, y: 990 },
    ],
    zombie: { x: 200, y: 250 },
  };
})();

export const OSSUARY = (() => {
  const rooms: Record<string, CellRect> = {
    landing: [24, 12, 5, 5],
    eastCorridor: [18, 12, 6, 2],
    throne: [6, 3, 12, 11],
    niche1: [2, 5, 3, 3],
    niche1Link: [5, 6, 1, 1],
    niche2: [2, 10, 3, 3],
    niche2Link: [5, 11, 1, 1],
    southLink: [11, 14, 2, 1],
    gallery: [9, 15, 6, 3],
    northCorridor: [20, 4, 2, 8],
    vault: [19, 1, 5, 3],
  };
  const pillars: [number, number][] = [
    [8, 5],
    [15, 5],
    [8, 11],
    [15, 11],
  ];
  const doors: [number, number, number, number][] = [
    [18, 12, 18, 14],
    [11, 15, 13, 15],
    [20, 4, 22, 4],
  ];
  const d = buildDungeon(30, 20, rooms, pillars, doors);
  return {
    ...d,
    width: 2100,
    height: 1400,
    pillars,
    stairsUp: { x: 1890, y: 1050 },
    arrival: { x: 1890, y: 930 },
    throneSeat: { x: 840, y: 290 },
    lich: { x: 840, y: 370 },
    skeletons: [
      { x: 640, y: 560 },
      { x: 1040, y: 560 },
      { x: 840, y: 840 },
    ],
    zombies: [
      { x: 770, y: 1160 },
      { x: 950, y: 1160 },
    ],
    rat: { x: 245, y: 455 },
    lights: [
      { x: 560, y: 300, radius: 300, color: '#7fffd4', intensity: 0.75, flicker: true },
      { x: 1120, y: 300, radius: 300, color: '#7fffd4', intensity: 0.75, flicker: true },
      { x: 1750, y: 900, radius: 230, color: '#ffb057', intensity: 0.75, flicker: true },
      { x: 1500, y: 140, radius: 170, color: '#ffd27a', intensity: 0.6, flicker: false },
      { x: 840, y: 1150, radius: 200, color: '#7fffd4', intensity: 0.55, flicker: true },
    ] as LightSpec[],
  };
})();

// ---------------------------------------------------------------------------
// Capilla en ruinas (1680 x 1120)
// ---------------------------------------------------------------------------

export const CHAPEL = (() => {
  const left = 380;
  const right = 1300;
  const top = 300;
  const bottom = 1050;
  const apse = { x: 840, y: top, r: 220 };
  const apsePts: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    apsePts.push({ x: apse.x + Math.cos(a) * apse.r, y: apse.y + Math.sin(a) * apse.r });
  }
  const walls: WallSpec[] = [
    ...sideWalls({ x: left, y: bottom }, { x: left, y: top }, [
      { from: 410, to: 550, kind: 'gap' },
      { from: 620, to: 690, kind: 'window' },
    ]),
    ...sideWalls({ x: left, y: top }, { x: apse.x - apse.r, y: top }),
    { points: flatten(apsePts), kind: 'wall', open: false },
    ...sideWalls({ x: apse.x + apse.r, y: top }, { x: right, y: top }),
    ...sideWalls({ x: right, y: top }, { x: right, y: bottom }, [
      { from: 100, to: 170, kind: 'window' },
      { from: 460, to: 580, kind: 'gap' },
    ]),
    ...sideWalls({ x: right, y: bottom }, { x: left, y: bottom }, [{ from: 410, to: 510, kind: 'door' }]),
  ];
  return {
    width: 1680,
    height: 1120,
    nave: { x: left, y: top, w: right - left, h: bottom - top } as RectSpec,
    apse,
    apsePts,
    walls,
    gaps: [
      { x: left, y: bottom - 550, w: 0, h: 140 },
      { x: right, y: top + 460, w: 0, h: 120 },
    ],
    altar: { x: 730, y: 230, w: 220, h: 70 } as RectSpec,
    door: { x: 840, y: bottom },
    exitTransition: { x: 840, y: 1085 },
    arrival: { x: 840, y: 970 },
    lights: [
      { x: 840, y: 330, radius: 280, color: '#ffd28a', intensity: 0.8, flicker: true },
      { x: 700, y: 700, radius: 330, color: '#9fb4ff', intensity: 0.4, flicker: false },
      { x: 1180, y: 470, radius: 180, color: '#ffd28a', intensity: 0.55, flicker: true },
    ] as LightSpec[],
    spider: { x: 900, y: 190 },
    skeleton: { x: 600, y: 650 },
    zombie: { x: 1120, y: 820 },
  };
})();

// ---------------------------------------------------------------------------
// Templates: Cruce de caminos (1400 x 1400) and Cueva pequeña (1400 x 980)
// ---------------------------------------------------------------------------

export const CROSSROADS = {
  width: 1400,
  height: 1400,
  roadA: [
    { x: -20, y: 720 },
    { x: 400, y: 700 },
    { x: 700, y: 700 },
    { x: 1000, y: 690 },
    { x: 1420, y: 700 },
  ] as Pt[],
  roadB: [
    { x: 690, y: -20 },
    { x: 700, y: 400 },
    { x: 700, y: 700 },
    { x: 720, y: 1000 },
    { x: 700, y: 1420 },
  ] as Pt[],
  signpost: { x: 800, y: 600 },
  shrine: { x: 470, y: 480 },
};

const SMALL_CAVE_COARSE: Pt[] = [
  { x: 0, y: 420 },
  { x: 120, y: 400 },
  { x: 220, y: 250 },
  { x: 420, y: 150 },
  { x: 700, y: 120 },
  { x: 950, y: 170 },
  { x: 1150, y: 300 },
  { x: 1260, y: 480 },
  { x: 1230, y: 700 },
  { x: 1080, y: 860 },
  { x: 820, y: 900 },
  { x: 560, y: 880 },
  { x: 320, y: 800 },
  { x: 180, y: 620 },
  { x: 100, y: 560 },
  { x: 0, y: 560 },
];

export const SMALL_CAVE = (() => {
  const rng = createRng('cueva-pequena');
  const outline = roughen(rng, SMALL_CAVE_COARSE, false, 50, 14);
  outline[0] = { x: 0, y: 420 };
  outline[outline.length - 1] = { x: 0, y: 560 };
  const pillar = blobPoints(rng, 600, 450, 50, 44, 9, 0.25);
  return {
    width: 1400,
    height: 980,
    outline,
    pillar,
    walls: [
      { points: flatten(outline), kind: 'wall', open: false },
      { points: flatten(pillar, true), kind: 'wall', open: false },
    ] as WallSpec[],
    pool: { x: 900, y: 600, rx: 125, ry: 80 },
    mushrooms: { x: 430, y: 700 },
    lights: [
      { x: 430, y: 700, radius: 220, color: '#7fffb0', intensity: 0.7, flicker: false },
      { x: 900, y: 600, radius: 240, color: '#6fd0ff', intensity: 0.6, flicker: false },
      { x: 60, y: 490, radius: 220, color: '#cfd8ff', intensity: 0.5, flicker: false },
    ] as LightSpec[],
  };
})();

// ---------------------------------------------------------------------------
// Overview maps (2000 x 1300)
// ---------------------------------------------------------------------------

export const OVERVIEW_B = {
  width: 2000,
  height: 1300,
  places: {
    cementerio: { x: 820, y: 760 },
    cripta: { x: 1200, y: 560 },
    capilla: { x: 640, y: 860 },
    ruinas: { x: 330, y: 1010 },
  },
  road: [
    { x: -10, y: 1130 },
    { x: 330, y: 1010 },
    { x: 560, y: 900 },
    { x: 820, y: 760 },
    { x: 1000, y: 660 },
    { x: 1200, y: 560 },
  ] as Pt[],
  swamp: { x: 1530, y: 1010, rx: 330, ry: 190 },
  deadForest: { x: 420, y: 470, rx: 300, ry: 200 },
  hills: { x: 1300, y: 250, rx: 450, ry: 140 },
};
