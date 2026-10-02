import type { VisibilitySettings, VisionMode, ZoneVision } from '@wailers/shared';

/** Personal vision of a player: follow the zone their hero is in, or a fixed mode set by the DM. */
export type VisionChoice = 'follow' | VisionMode;

export const VISION_CHOICES: { value: VisionChoice; label: string; hint: string }[] = [
  { value: 'follow', label: 'Sigue la zona', hint: 'Ve según la zona donde está su héroe (lo normal).' },
  { value: 'all', label: 'Todo', hint: 'Ve todo el mapa, esté donde esté.' },
  { value: 'explored', label: 'Explorado', hint: 'Lo que tiene delante y, atenuado, lo que ya recorrió.' },
  { value: 'vision', label: 'Limitada', hint: 'Solo lo que su héroe tiene delante, hasta un radio.' },
  { value: 'none', label: 'Nada', hint: 'Pantalla negra o una imagen de escena.' },
];

export const VISION_TITLES: Record<VisionMode, string> = {
  all: 'Todo visible',
  explored: 'Explorado (recuerda lo visto)',
  vision: 'Poca visión',
  none: 'Nada (pantalla negra)',
};

export const VISION_HINTS: Record<VisionMode, string> = {
  all: 'Ven todo el mapa de la zona.',
  explored: 'Ven lo que tienen delante y, atenuado, lo que ya recorrieron.',
  vision: 'Solo ven lo que su héroe tiene delante, hasta un radio.',
  none: 'Pantalla negra o la imagen de escena que elijas.',
};

/** Keys that make up the vision of a player (cleared together by "Sigue la zona"). */
export const VISION_KEYS = ['visionMode', 'visionRadius', 'visionCone'] as const satisfies readonly (keyof VisibilitySettings)[];

export const DEFAULT_ZONE_RADIUS = 4;

export function cellsLabel(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${String(v).replace('.', ',')} ${v === 1 ? 'casilla' : 'casillas'}`;
}

export function coneLabel(deg: number): string {
  return deg >= 360 ? '360° (completa)' : `${Math.round(deg)}°`;
}

export function isLimitedMode(mode: VisionMode): boolean {
  return mode === 'vision' || mode === 'explored';
}

/** Lower-case phrase describing what a player sees with these values. */
export function visionPhrase(mode: VisionMode, radius: number, cone: number, sceneImageUrl: string | null): string {
  const inCone = cone < 360 ? `, en cono de ${Math.round(cone)}°` : '';
  switch (mode) {
    case 'all':
      return 'todo el mapa';
    case 'explored':
      return `lo que tiene delante (${cellsLabel(radius)}${inCone}) y lo ya explorado`;
    case 'vision':
      return `poca visión (${cellsLabel(radius)}${inCone})`;
    case 'none':
      return sceneImageUrl ? 'nada, solo una imagen de escena' : 'nada, pantalla negra';
  }
}

export function zoneVisionSummary(v: ZoneVision | null | undefined): string {
  if (!v) return 'Sin visión propia';
  if (v.mode === 'all') return 'Todo visible';
  const cone = v.cone < 360 ? ` · cono ${Math.round(v.cone)}°` : '';
  return `${v.mode === 'explored' ? 'Explorado' : 'Poca visión'} · ${cellsLabel(v.radius)}${cone}`;
}

export function sameZoneVision(a: ZoneVision | null | undefined, b: ZoneVision | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (a.mode !== b.mode) return false;
  if (a.mode === 'all') return true;
  return a.radius === b.radius && a.cone === b.cone;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
