import { rectPolygon, sideWalls, type LightSpec, type RectSpec, type WallSpec } from './layouts';
import { createRng } from './rng';
import { flatten, roughen, sampleSpline, type Pt } from './svg';

/**
 * Geometry of "Los Cielos de Latón" (steampunk campaign), shared by the procedural SVG maps and
 * the seeded zone documents so walls, doors, lights, transitions and tokens match the art.
 * All battle maps use the 70 px grid.
 */

export interface BuildingSpec {
  cx: number;
  cy: number;
  w: number;
  h: number;
  roof: 'slate' | 'copper' | 'glass' | 'brick' | 'sawtooth';
  color: string;
}

export interface StallSpec {
  x: number;
  y: number;
  rot: number;
  color: string;
}

const lamp = (x: number, y: number, radius = 190, intensity = 0.75): LightSpec => ({ x, y, radius, color: '#ffd28a', intensity, flicker: true });

/** First/last y of a closed polygon crossing the vertical line x (used for hull spans). */
export function spanAt(poly: Pt[], x: number): [top: number, bottom: number] {
  const ys: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if ((a.x <= x && b.x >= x) || (b.x <= x && a.x >= x)) {
      if (a.x === b.x) ys.push(a.y, b.y);
      else ys.push(a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x));
    }
  }
  if (ys.length < 2) throw new Error(`spanAt: x=${x} fuera del polígono`);
  return [Math.min(...ys), Math.max(...ys)];
}

// ---------------------------------------------------------------------------
// Overview: Archipiélago de los Cielos (2100 x 1400)
// ---------------------------------------------------------------------------

export const SKY_OVERVIEW = {
  width: 2100,
  height: 1400,
  islands: {
    laton: { x: 860, y: 640, rx: 380, ry: 250 },
    fabrica: { x: 820, y: 1110, rx: 200, ry: 120 },
    cobre: { x: 1660, y: 1000, rx: 175, ry: 112 },
    tormentas: { x: 1780, y: 300, rx: 130, ry: 84 },
    faro: { x: 300, y: 1090, rx: 115, ry: 72 },
    vientos: { x: 330, y: 280, rx: 160, ry: 92 },
  },
  places: {
    ciudad: { x: 760, y: 610 },
    puerto: { x: 1150, y: 600 },
    albatros: { x: 1470, y: 430 },
    fabrica: { x: 820, y: 1095 },
  },
  routes: {
    puertoAlbatros: [
      { x: 1190, y: 590 },
      { x: 1300, y: 520 },
      { x: 1420, y: 450 },
    ] as Pt[],
    albatrosTormentas: [
      { x: 1520, y: 410 },
      { x: 1620, y: 340 },
      { x: 1700, y: 310 },
    ] as Pt[],
    puertoCobre: [
      { x: 1180, y: 650 },
      { x: 1350, y: 820 },
      { x: 1560, y: 960 },
    ] as Pt[],
    ciudadVientos: [
      { x: 650, y: 470 },
      { x: 520, y: 360 },
      { x: 420, y: 300 },
    ] as Pt[],
    ciudadFaro: [
      { x: 560, y: 780 },
      { x: 420, y: 930 },
      { x: 330, y: 1040 },
    ] as Pt[],
  },
  cableway: [
    { x: 800, y: 870 },
    { x: 815, y: 990 },
  ] as Pt[],
  compass: { x: 1890, y: 1170, r: 96 },
};

// ---------------------------------------------------------------------------
// Ciudad de Engranajes (2100 x 1400)
// ---------------------------------------------------------------------------

export const GEAR_CITY = {
  width: 2100,
  height: 1400,
  avenue: { y: 960, h: 160 },
  southStreet: { x: 1050, w: 130 },
  plaza: { x: 1050, y: 620, r: 210 },
  clockTower: { x: 1050, y: 250, size: 230 },
  workshop: { cx: 480, cy: 640, w: 380, h: 240, roof: 'brick', color: '#8a3e2a' } as BuildingSpec,
  workshopDoor: { x: 480, y: 760 },
  workshopTransition: { x: 480, y: 800 },
  workshopArrival: { x: 480, y: 855 },
  buildings: [
    { cx: 170, cy: 220, w: 220, h: 200, roof: 'slate', color: '#4a5560' },
    { cx: 500, cy: 230, w: 300, h: 220, roof: 'sawtooth', color: '#5a4a44' },
    { cx: 790, cy: 260, w: 160, h: 200, roof: 'copper', color: '#4f9a84' },
    { cx: 150, cy: 640, w: 180, h: 280, roof: 'slate', color: '#3e4852' },
    { cx: 760, cy: 600, w: 110, h: 220, roof: 'brick', color: '#7a3424' },
    { cx: 1400, cy: 230, w: 260, h: 220, roof: 'slate', color: '#4a5560' },
    { cx: 1760, cy: 220, w: 340, h: 220, roof: 'sawtooth', color: '#5a4a44' },
    { cx: 2010, cy: 300, w: 100, h: 300, roof: 'slate', color: '#3e4852' },
    { cx: 1560, cy: 620, w: 320, h: 240, roof: 'glass', color: '#6a7a6a' },
    { cx: 1880, cy: 640, w: 280, h: 260, roof: 'copper', color: '#4f9a84' },
    { cx: 180, cy: 1240, w: 280, h: 220, roof: 'brick', color: '#8a3e2a' },
    { cx: 560, cy: 1230, w: 340, h: 240, roof: 'slate', color: '#4a5560' },
    { cx: 850, cy: 1250, w: 160, h: 200, roof: 'copper', color: '#4f9a84' },
    { cx: 1300, cy: 1240, w: 260, h: 220, roof: 'slate', color: '#3e4852' },
    { cx: 1660, cy: 1230, w: 360, h: 240, roof: 'sawtooth', color: '#5a4a44' },
    { cx: 1990, cy: 1240, w: 180, h: 220, roof: 'brick', color: '#7a3424' },
  ] as BuildingSpec[],
  rails: [
    { x: -20, y: 960 },
    { x: 600, y: 960 },
    { x: 1200, y: 960 },
    { x: 1700, y: 960 },
    { x: 2120, y: 960 },
  ] as Pt[],
  railBranch: [
    { x: 1330, y: 960 },
    { x: 1160, y: 975 },
    { x: 1070, y: 1070 },
    { x: 1050, y: 1220 },
    { x: 1050, y: 1420 },
  ] as Pt[],
  tram: { x: 330, y: 960 },
  pipes: [
    [
      { x: 650, y: 200 },
      { x: 935, y: 200 },
    ],
    [
      { x: 1450, y: 340 },
      { x: 1450, y: 500 },
    ],
    [
      { x: 620, y: 760 },
      { x: 620, y: 1110 },
    ],
    [
      { x: 1620, y: 740 },
      { x: 1620, y: 1110 },
    ],
    [
      { x: 1300, y: 868 },
      { x: 1520, y: 868 },
      { x: 1560, y: 845 },
      { x: 2120, y: 845 },
    ],
  ] as Pt[][],
  vents: [
    { x: 520, y: 1005 },
    { x: 760, y: 925 },
    { x: 1420, y: 1005 },
    { x: 1820, y: 925 },
    { x: 1110, y: 1280 },
  ] as Pt[],
  stalls: [
    { x: 1215, y: 495, rot: 40, color: '#b8673a' },
    { x: 885, y: 495, rot: -40, color: '#2f6f6a' },
    { x: 885, y: 745, rot: -140, color: '#8a2a2a' },
  ] as StallSpec[],
  spawn: { x: 1050, y: 780 },
  bartolome: { x: 1250, y: 560 },
  guards: [
    { x: 975, y: 405 },
    { x: 1125, y: 405 },
  ],
  rats: [
    { x: 1400, y: 1050 },
    { x: 1460, y: 1030 },
  ],
  drone: { x: 1640, y: 400 },
  lights: [
    lamp(140, 865),
    lamp(420, 865),
    lamp(760, 865),
    lamp(1340, 865),
    lamp(1640, 865),
    lamp(1920, 865),
    lamp(140, 1055),
    lamp(440, 1055),
    lamp(760, 1055),
    lamp(1420, 1055),
    lamp(1700, 1055),
    lamp(1960, 1055),
    lamp(900, 470, 170),
    lamp(1200, 470, 170),
    lamp(900, 770, 170),
    lamp(1200, 770, 170),
    lamp(1170, 1180, 170),
    lamp(930, 1330, 170),
    { x: 1050, y: 250, radius: 260, color: '#ffe2a0', intensity: 0.6, flicker: false },
    { x: 480, y: 640, radius: 210, color: '#ff9a4a', intensity: 0.55, flicker: true },
  ] as LightSpec[],
};

// ---------------------------------------------------------------------------
// Puerto de Dirigibles (2100 x 1400)
// ---------------------------------------------------------------------------

export interface ShipSpec {
  cx: number;
  cy: number;
  len: number;
  wid: number;
  envelope: string;
  trim: string;
  name: string;
}

export const SKY_PORT = (() => {
  const rng = createRng('puerto-borde');
  const coarse: Pt[] = [
    { x: 940, y: -40 },
    { x: 905, y: 140 },
    { x: 935, y: 262 },
    { x: 900, y: 420 },
    { x: 932, y: 560 },
    { x: 905, y: 700 },
    { x: 935, y: 860 },
    { x: 900, y: 1000 },
    { x: 930, y: 1150 },
    { x: 896, y: 1290 },
    { x: 925, y: 1440 },
  ];
  const edge = roughen(rng, coarse, false, 40, 9);
  return {
    width: 2100,
    height: 1400,
    edge,
    land: [{ x: -40, y: -40 }, ...edge, { x: -40, y: 1440 }] as Pt[],
    quayX: 700,
    piers: [
      { x0: 860, x1: 1770, y: 330, h: 110 },
      { x0: 860, x1: 1770, y: 1070, h: 110 },
    ],
    ships: {
      gaviota: { cx: 1390, cy: 150, len: 780, wid: 210, envelope: '#d8c8a8', trim: '#2f6f6a', name: 'GAVIOTA DE HIERRO' } as ShipSpec,
      albatros: { cx: 1420, cy: 700, len: 920, wid: 300, envelope: '#e8d8b0', trim: '#8a2a2a', name: 'ALBATROS' } as ShipSpec,
      urraca: { cx: 1390, cy: 1255, len: 700, wid: 200, envelope: '#3a3236', trim: '#c0392b', name: 'LA URRACA' } as ShipSpec,
    },
    towers: [
      { x: 1830, y: 330, r: 62 },
      { x: 1830, y: 1070, r: 62 },
      { x: 1960, y: 700, r: 66 },
    ],
    gangway: { x: 1300, y0: 385, y1: 590, w: 56 },
    gangwayTransition: { x: 1300, y: 470 },
    arrivalFromShip: { x: 1300, y: 330 },
    cranes: [
      { x: 780, y: 480, rot: -28, boom: 300 },
      { x: 780, y: 930, rot: 28, boom: 300 },
    ],
    warehouses: [
      { cx: 250, cy: 190, w: 360, h: 230, roof: 'sawtooth', color: '#5a4a44' },
      { cx: 250, cy: 480, w: 360, h: 220, roof: 'slate', color: '#4a5560' },
      { cx: 250, cy: 950, w: 360, h: 230, roof: 'copper', color: '#4f9a84' },
      { cx: 250, cy: 1230, w: 360, h: 220, roof: 'slate', color: '#3e4852' },
    ] as BuildingSpec[],
    road: [
      { x: -20, y: 700 },
      { x: 400, y: 705 },
      { x: 700, y: 700 },
      { x: 905, y: 700 },
    ] as Pt[],
    rail: [
      { x: 600, y: -20 },
      { x: 600, y: 1420 },
    ] as Pt[],
    guard: { x: 820, y: 700 },
    pirates: [
      { x: 1180, y: 1060 },
      { x: 1420, y: 1080 },
      { x: 1640, y: 1060 },
    ],
    drone: { x: 1660, y: 470 },
    fog: rectPolygon({ x: 945, y: 1012, w: 1155, h: 388 }),
    lights: [
      lamp(1000, 278),
      lamp(1400, 278),
      lamp(1720, 382),
      lamp(1000, 1122),
      lamp(1400, 1018),
      lamp(1720, 1122),
      lamp(860, 560, 180),
      lamp(860, 860, 180),
      lamp(450, 700, 200),
      { x: 1830, y: 330, radius: 120, color: '#ff4a3a', intensity: 0.7, flicker: false },
      { x: 1830, y: 1070, radius: 120, color: '#ff4a3a', intensity: 0.7, flicker: false },
      { x: 1960, y: 700, radius: 130, color: '#ff4a3a', intensity: 0.7, flicker: false },
    ] as LightSpec[],
  };
})();

// ---------------------------------------------------------------------------
// El Dirigible «Albatros» (2100 x 1400, two levels sharing the hull outline)
// ---------------------------------------------------------------------------

export const AIRSHIP = (() => {
  const side: Pt[] = [
    { x: 240, y: 520 },
    { x: 420, y: 462 },
    { x: 700, y: 436 },
    { x: 1000, y: 428 },
    { x: 1300, y: 432 },
    { x: 1560, y: 458 },
    { x: 1760, y: 530 },
    { x: 1900, y: 622 },
    { x: 1966, y: 700 },
    { x: 1900, y: 778 },
    { x: 1760, y: 870 },
    { x: 1560, y: 942 },
    { x: 1300, y: 968 },
    { x: 1000, y: 972 },
    { x: 700, y: 964 },
    { x: 420, y: 938 },
    { x: 240, y: 880 },
  ];
  const hull = sampleSpline(side, 8).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  const quarterdeckX = 520;
  const gate = { from: 1260, to: 1340 };
  const qd = spanAt(hull, quarterdeckX);
  const sternBulkhead = 520;
  const bowBulkhead = 1520;
  const sb = spanAt(hull, sternBulkhead);
  const bb = spanAt(hull, bowBulkhead);
  // Deck railings (do not block vision): the whole hull except the boarding gate on the port side.
  const topRail = hull.filter((p) => p.y < 700 || p.x < 300);
  const gateSplit = (pts: Pt[]): Pt[][] => {
    const before = pts.filter((p) => p.x <= gate.from && p.y < 700);
    const after = pts.filter((p) => p.x >= gate.to && p.y < 700);
    return [before, after];
  };
  const [railA, railB] = gateSplit(topRail);
  const bottomRail = hull.filter((p) => p.y > 700);
  const deckWalls: WallSpec[] = [
    { points: flatten([{ x: 240, y: 880 }, { x: 240, y: 520 }, ...railA!]), kind: 'window', open: false },
    { points: flatten([...railB!, { x: 1966, y: 700 }, ...bottomRail.filter((p) => p.x > 1900).sort((a, b) => b.x - a.x)]), kind: 'window', open: false },
    { points: flatten(bottomRail.filter((p) => p.x <= 1900).sort((a, b) => b.x - a.x)), kind: 'window', open: false },
    ...sideWalls({ x: quarterdeckX, y: qd[0] }, { x: quarterdeckX, y: qd[1] }, [
      { from: 70, to: 140, kind: 'gap' },
      { from: qd[1] - qd[0] - 140, to: qd[1] - qd[0] - 70, kind: 'gap' },
    ]).map((w) => ({ ...w, kind: 'window' as const })),
    // Bridge house (blocks vision): door east, windows north and south.
    ...sideWalls({ x: 600, y: 600 }, { x: 820, y: 600 }, [{ from: 75, to: 145, kind: 'window' }]),
    ...sideWalls({ x: 820, y: 600 }, { x: 820, y: 800 }, [{ from: 65, to: 135, kind: 'door' }]),
    ...sideWalls({ x: 820, y: 800 }, { x: 600, y: 800 }, [{ from: 75, to: 145, kind: 'window' }]),
    ...sideWalls({ x: 600, y: 800 }, { x: 600, y: 600 }),
  ];
  const engineWalls: WallSpec[] = [
    { points: flatten([...hull, hull[0]!]), kind: 'wall', open: false },
    ...sideWalls({ x: sternBulkhead, y: sb[0] }, { x: sternBulkhead, y: sb[1] }, [{ from: 700 - sb[0] - 40, to: 700 - sb[0] + 40, kind: 'door' }]),
    ...sideWalls({ x: bowBulkhead, y: bb[0] }, { x: bowBulkhead, y: bb[1] }, [{ from: 700 - bb[0] - 40, to: 700 - bb[0] + 40, kind: 'door' }]),
  ];
  const bowHold: Pt[] = [{ x: bowBulkhead, y: bb[0] }, ...hull.filter((p) => p.x > bowBulkhead && p.y < 700), { x: 1966, y: 700 }, ...hull.filter((p) => p.x > bowBulkhead && p.y > 700), { x: bowBulkhead, y: bb[1] }];
  return {
    width: 2100,
    height: 1400,
    hull,
    gate,
    quarterdeckX,
    sternBulkhead,
    bowBulkhead,
    deckWalls,
    engineWalls,
    bowHoldFog: flatten(bowHold),
    envelope: { cx: 1100, cy: 700, rx: 920, ry: 370 },
    bridge: { x: 600, y: 600, w: 220, h: 200 } as RectSpec,
    helm: { x: 340, y: 700 },
    hatch: { x: 1250, y: 700, size: 140 },
    pylonX: 1060,
    cannonsX: [930, 1160, 1420, 1640],
    gateTransition: { x: 1300, y: 485 },
    arrivalFromPort: { x: 1300, y: 560 },
    stairsArrivalDeck: { x: 1250, y: 820 },
    stairsArrivalEngine: { x: 1250, y: 820 },
    deckLights: [
      { x: 330, y: 600, radius: 200, color: '#ffcf7a', intensity: 0.8, flicker: true },
      { x: 330, y: 800, radius: 200, color: '#ffcf7a', intensity: 0.8, flicker: true },
      { x: 900, y: 520, radius: 200, color: '#ffcf7a', intensity: 0.75, flicker: true },
      { x: 900, y: 880, radius: 200, color: '#ffcf7a', intensity: 0.75, flicker: true },
      { x: 1460, y: 560, radius: 200, color: '#ffcf7a', intensity: 0.75, flicker: true },
      { x: 1460, y: 840, radius: 200, color: '#ffcf7a', intensity: 0.75, flicker: true },
      { x: 1720, y: 700, radius: 220, color: '#ffe2a0', intensity: 0.8, flicker: false },
      { x: 1800, y: 575, radius: 110, color: '#ff3a2a', intensity: 0.8, flicker: false },
      { x: 1800, y: 825, radius: 110, color: '#3aff7a', intensity: 0.8, flicker: false },
      { x: 710, y: 700, radius: 150, color: '#ffe2a0', intensity: 0.6, flicker: false },
      { x: 1250, y: 700, radius: 140, color: '#ff8a3a', intensity: 0.5, flicker: true },
    ] as LightSpec[],
    engineLights: [
      { x: 600, y: 560, radius: 320, color: '#ff7a2a', intensity: 0.9, flicker: true },
      { x: 600, y: 840, radius: 320, color: '#ff7a2a', intensity: 0.9, flicker: true },
      { x: 780, y: 700, radius: 260, color: '#ffe2a0', intensity: 0.7, flicker: false },
      { x: 1250, y: 560, radius: 240, color: '#ffe2a0', intensity: 0.7, flicker: false },
      { x: 1250, y: 860, radius: 220, color: '#ffe2a0', intensity: 0.65, flicker: false },
      { x: 380, y: 700, radius: 230, color: '#ffb057', intensity: 0.6, flicker: true },
      { x: 1720, y: 700, radius: 240, color: '#ffd28a', intensity: 0.55, flicker: true },
    ] as LightSpec[],
    captain: { x: 340, y: 780 },
    boarders: {
      captain: { x: 1720, y: 700 },
      pirates: [
        { x: 1580, y: 590 },
        { x: 1580, y: 810 },
      ],
    },
    rats: [
      { x: 330, y: 560 },
      { x: 400, y: 850 },
    ],
    saboteur: { x: 1800, y: 640 },
    coal: { x: 360, y: 820 },
  };
})();

// ---------------------------------------------------------------------------
// Taller del Inventor (1680 x 1120, 24 x 16 cells)
// ---------------------------------------------------------------------------

export const WORKSHOP = (() => {
  const x0 = 70;
  const y0 = 70;
  const x1 = 1610;
  const y1 = 1050;
  const split = 1190;
  const mid = 490;
  const walls: WallSpec[] = [
    ...sideWalls({ x: x0, y: y0 }, { x: x1, y: y0 }, [
      { from: 210, to: 280, kind: 'window' },
      { from: 630, to: 700, kind: 'window' },
      { from: 1260, to: 1330, kind: 'window' },
    ]),
    ...sideWalls({ x: x1, y: y0 }, { x: x1, y: y1 }, [
      { from: 140, to: 210, kind: 'window' },
      { from: 630, to: 700, kind: 'window' },
    ]),
    ...sideWalls({ x: x1, y: y1 }, { x: x0, y: y1 }, [
      { from: 210, to: 280, kind: 'window' },
      { from: 660, to: 730, kind: 'window' },
      { from: 1050, to: 1120, kind: 'door' },
    ]),
    ...sideWalls({ x: x0, y: y1 }, { x: x0, y: y0 }, [
      { from: 140, to: 210, kind: 'window' },
      { from: 700, to: 770, kind: 'window' },
    ]),
    ...sideWalls({ x: split, y: y0 }, { x: split, y: y1 }, [
      { from: 210, to: 280, kind: 'door' },
      { from: 630, to: 700, kind: 'door' },
    ]),
    ...sideWalls({ x: split, y: mid }, { x: x1, y: mid }),
  ];
  return {
    width: 1680,
    height: 1120,
    shell: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } as RectSpec,
    hall: { x: x0, y: y0, w: split - x0, h: y1 - y0 } as RectSpec,
    store: { x: split, y: y0, w: x1 - split, h: mid - y0 } as RectSpec,
    office: { x: split, y: mid, w: x1 - split, h: y1 - mid } as RectSpec,
    walls,
    frontDoor: { x: 525, y: y1 },
    exitTransition: { x: 525, y: 1085 },
    arrival: { x: 525, y: 975 },
    bench: { x: 160, y: 88, w: 470, h: 74 } as RectSpec,
    lathe: { x: 720, y: 92, w: 220, h: 70 } as RectSpec,
    tesla: { x: 1090, y: 190 },
    dynamo: { x: 950, y: 270 },
    furnace: { x: 70, y: 380, w: 110, h: 190 } as RectSpec,
    anvil: { x: 260, y: 470 },
    blueprintTable: { x: 520, y: 390, w: 380, h: 190 } as RectSpec,
    assemblyTable: { x: 210, y: 680, w: 300, h: 180 } as RectSpec,
    shelves: [
      { x: 620, y: 1000, w: 230, h: 42 },
      { x: 960, y: 1000, w: 220, h: 42 },
      { x: 1200, y: 80, w: 42, h: 390 },
      { x: 1560, y: 80, w: 42, h: 300 },
    ] as RectSpec[],
    safe: { x: 1500, y: 420 },
    desk: { x: 1250, y: 560, w: 210, h: 84 } as RectSpec,
    bed: { x: 1430, y: 850, w: 160, h: 180 } as RectSpec,
    lights: [
      { x: 300, y: 300, radius: 270, color: '#ffcf7a', intensity: 0.8, flicker: true },
      { x: 720, y: 300, radius: 270, color: '#ffcf7a', intensity: 0.8, flicker: true },
      { x: 450, y: 780, radius: 260, color: '#ffcf7a', intensity: 0.8, flicker: true },
      { x: 860, y: 780, radius: 260, color: '#ffcf7a', intensity: 0.8, flicker: true },
      { x: 130, y: 475, radius: 420, color: '#ff7a2a', intensity: 0.9, flicker: true },
      { x: 1090, y: 190, radius: 260, color: '#8ad8ff', intensity: 0.75, flicker: true },
      { x: 1400, y: 280, radius: 240, color: '#ffcf7a', intensity: 0.7, flicker: true },
      { x: 1355, y: 600, radius: 220, color: '#ffe2a0', intensity: 0.75, flicker: true },
      { x: 1400, y: 900, radius: 210, color: '#ffcf7a', intensity: 0.65, flicker: true },
    ] as LightSpec[],
    ada: { x: 720, y: 640 },
    rat: { x: 1450, y: 330 },
    plans: { x: 1355, y: 690 },
    arm: { x: 400, y: 770 },
  };
})();

// ---------------------------------------------------------------------------
// Fábrica Abandonada (2100 x 1400)
// ---------------------------------------------------------------------------

export const FACTORY = (() => {
  const hall = { x: 240, y: 170, w: 1260, h: 1080 } as RectSpec;
  const furnaceRoom = { x: 1500, y: 270, w: 500, h: 880 } as RectSpec;
  const hx1 = hall.x + hall.w;
  const hy1 = hall.y + hall.h;
  const fx1 = furnaceRoom.x + furnaceRoom.w;
  const fy1 = furnaceRoom.y + furnaceRoom.h;
  const walls: WallSpec[] = [
    ...sideWalls({ x: hall.x, y: hall.y }, { x: hx1, y: hall.y }, [
      { from: 160, to: 280, kind: 'gap' },
      { from: 410, to: 480, kind: 'window' },
      { from: 740, to: 880, kind: 'gap' },
      { from: 1010, to: 1080, kind: 'window' },
    ]),
    ...sideWalls({ x: hx1, y: hall.y }, { x: hx1, y: hy1 }, [
      { from: 470, to: 610, kind: 'door' },
      { from: 810, to: 880, kind: 'gap' },
    ]),
    ...sideWalls({ x: hx1, y: hy1 }, { x: hall.x, y: hy1 }, [
      { from: 330, to: 400, kind: 'window' },
      { from: 640, to: 800, kind: 'gap' },
    ]),
    ...sideWalls({ x: hall.x, y: hy1 }, { x: hall.x, y: hall.y }, [
      { from: 160, to: 270, kind: 'gap' },
      { from: 540, to: 610, kind: 'door' },
    ]),
    ...sideWalls({ x: furnaceRoom.x, y: furnaceRoom.y }, { x: fx1, y: furnaceRoom.y }, [{ from: 300, to: 370, kind: 'window' }]),
    ...sideWalls({ x: fx1, y: furnaceRoom.y }, { x: fx1, y: fy1 }),
    ...sideWalls({ x: fx1, y: fy1 }, { x: furnaceRoom.x, y: fy1 }, [{ from: 120, to: 190, kind: 'window' }]),
  ];
  return {
    width: 2100,
    height: 1400,
    hall,
    furnaceRoom,
    walls,
    fog: rectPolygon(furnaceRoom),
    rail: [
      { x: 1050, y: -20 },
      { x: 1050, y: 170 },
      { x: 1050, y: 330 },
    ] as Pt[],
    conveyors: [
      { x: 340, y: 450, len: 1060, gap: [440, 500] as [number, number] },
      { x: 340, y: 700, len: 520, gap: null },
      { x: 420, y: 1030, len: 980, gap: [560, 620] as [number, number] },
    ],
    pit: { x: 930, y: 770, w: 190, h: 170 } as RectSpec,
    catwalks: [
      { x: 880, y: 830, w: 610, h: 56 },
      { x: 1160, y: 480, w: 56, h: 360 },
    ] as RectSpec[],
    presses: [
      { x: 560, y: 600, w: 150, h: 120 },
      { x: 1260, y: 620, w: 150, h: 120 },
    ] as RectSpec[],
    toppledBoiler: { x: 380, y: 880, w: 220, h: 96 } as RectSpec,
    collapse: { x: 900, y: 270, r: 150 },
    puddles: [
      { x: 620, y: 300, rx: 90, ry: 50 },
      { x: 1120, y: 1160, rx: 110, ry: 58 },
      { x: 380, y: 1150, rx: 72, ry: 44 },
      { x: 1360, y: 560, rx: 58, ry: 38 },
    ],
    furnace: { x: 1810, y: 720, r: 135 },
    bigGear: { x: 1640, y: 420, r: 105 },
    slag: [
      { x: 1640, y: 1000, rx: 70, ry: 38 },
      { x: 1900, y: 470, rx: 50, ry: 30 },
    ],
    chimneys: [
      { x: 120, y: 120, r: 80 },
      { x: 1900, y: 1060, r: 60 },
    ],
    scrap: [
      { x: 330, y: 300, r: 70 },
      { x: 1400, y: 1170, r: 60 },
      { x: 1330, y: 300, r: 60 },
      { x: 1950, y: 330, r: 50 },
    ],
    dragon: { x: 1660, y: 720 },
    golem: { x: 1080, y: 640 },
    gargoyles: [
      { x: 300, y: 230 },
      { x: 1440, y: 1190 },
    ],
    rats: [
      { x: 560, y: 1130 },
      { x: 615, y: 1170 },
      { x: 520, y: 1185 },
    ],
    drone: { x: 1050, y: 380 },
    heart: { x: 1880, y: 990 },
    coal: { x: 1720, y: 1090 },
    lights: [
      { x: 1810, y: 720, radius: 560, color: '#ff6a1a', intensity: 0.95, flicker: true },
      { x: 1640, y: 1000, radius: 170, color: '#ff8a2a', intensity: 0.7, flicker: true },
      { x: 1900, y: 470, radius: 140, color: '#ff8a2a', intensity: 0.7, flicker: true },
      { x: 620, y: 300, radius: 200, color: '#7dff6a', intensity: 0.6, flicker: false },
      { x: 1120, y: 1160, radius: 220, color: '#7dff6a', intensity: 0.6, flicker: false },
      { x: 380, y: 1150, radius: 170, color: '#7dff6a', intensity: 0.55, flicker: false },
      { x: 1360, y: 560, radius: 150, color: '#7dff6a', intensity: 0.55, flicker: false },
      { x: 1335, y: 610, radius: 170, color: '#8ad8ff', intensity: 0.7, flicker: true },
      { x: 900, y: 290, radius: 320, color: '#dfe8f0', intensity: 0.55, flicker: false },
      { x: 1050, y: 110, radius: 220, color: '#e8eef2', intensity: 0.45, flicker: false },
    ] as LightSpec[],
  };
})();
