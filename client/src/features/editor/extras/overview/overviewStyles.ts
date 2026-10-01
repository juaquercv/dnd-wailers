import type { OverviewLink, OverviewMap, OverviewPin, Zone, ZoneType } from '@wailers/shared';

/** HTML5 drag type for zones dragged from the overview side list onto the map. */
export const DND_ZONE = 'application/x-wailers-zone';

export interface ZoneDragPayload {
  zoneId: string;
}

export function readZoneDrag(dataTransfer: DataTransfer | null): ZoneDragPayload | null {
  const raw = dataTransfer?.getData(DND_ZONE);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof (parsed as { zoneId?: unknown }).zoneId === 'string') {
      return { zoneId: (parsed as { zoneId: string }).zoneId };
    }
  } catch {
    /* not ours */
  }
  return null;
}

export interface PinTypeStyle {
  label: string;
  color: string;
  /** Default icon when the pin has none. */
  icon: string;
}

export const PIN_TYPE_STYLES: Record<ZoneType, PinTypeStyle> = {
  exterior: { label: 'Exterior', color: '#4fae63', icon: '🌲' },
  interior: { label: 'Interior', color: '#d9a441', icon: '🏠' },
  dungeon: { label: 'Mazmorra', color: '#c4483d', icon: '💀' },
  city: { label: 'Ciudad', color: '#4a8fd9', icon: '🏰' },
  subzone: { label: 'Sub-zona', color: '#9a7cf0', icon: '🚪' },
};

/** Style used for pins whose zone was deleted. */
export const ORPHAN_PIN_STYLE: PinTypeStyle = { label: 'Zona eliminada', color: '#6b6258', icon: '❔' };

export type LinkStyle = OverviewLink['style'];

export interface LinkStyleDef {
  label: string;
  description: string;
  color: string;
  /** Darker underlay for contrast on any background. */
  casing: string;
  /** Screen px. */
  width: number;
  /** Screen px; null = solid. */
  dash: number[] | null;
  lineCap: 'butt' | 'round';
}

export const LINK_STYLES: Record<LinkStyle, LinkStyleDef> = {
  road: {
    label: 'Camino',
    description: 'Calzada o camino principal',
    color: '#8b5a2b',
    casing: '#2a1a0b',
    width: 6,
    dash: null,
    lineCap: 'round',
  },
  path: {
    label: 'Sendero',
    description: 'Senda estrecha o rastro',
    color: '#d6b98c',
    casing: 'rgba(24, 16, 8, 0.8)',
    width: 4,
    dash: [12, 9],
    lineCap: 'butt',
  },
  sea: {
    label: 'Ruta marítima',
    description: 'Travesía por mar o río',
    color: '#4aa3e2',
    casing: 'rgba(6, 18, 36, 0.8)',
    width: 4,
    dash: [16, 10],
    lineCap: 'butt',
  },
  secret: {
    label: 'Paso secreto',
    description: 'Pasaje oculto o atajo desconocido',
    color: '#b096ff',
    casing: 'rgba(18, 10, 36, 0.75)',
    width: 5,
    dash: [0.1, 11],
    lineCap: 'round',
  },
};

export const LINK_STYLE_ORDER: LinkStyle[] = ['road', 'path', 'sea', 'secret'];

/** Emoji palette offered for pin icons. */
export const PIN_ICON_CHOICES = [
  '📍', '🏰', '🏯', '🏠', '🏘️', '🛖', '⛪', '🏛️', '🗼', '🏚️',
  '🌲', '🌳', '⛰️', '🏔️', '🌋', '🏜️', '🏝️', '🌊', '⚓', '⛵',
  '🕳️', '💀', '⚰️', '🐉', '⚔️', '🛡️', '🔥', '❄️', '🌙', '⭐',
  '💎', '🗝️', '🍺', '⛏️', '🧭', '🚪', '⚙️', '🎈', '🗺️', '❓',
];

export function zoneTypeOf(zone: Zone | undefined): ZoneType {
  return zone?.zoneType ?? 'exterior';
}

export function pinStyleFor(zone: Zone | undefined): PinTypeStyle {
  return zone ? PIN_TYPE_STYLES[zoneTypeOf(zone)] : ORPHAN_PIN_STYLE;
}

export function pinLabel(pin: OverviewPin, zone: Zone | undefined): string {
  const custom = pin.label?.trim();
  if (custom) return custom;
  return zone?.name ?? ORPHAN_PIN_STYLE.label;
}

export function pinIcon(pin: OverviewPin, zone: Zone | undefined): string {
  const custom = pin.icon?.trim();
  if (custom) return custom;
  return pinStyleFor(zone).icon;
}

/** Deep copy for immutable updates. */
export function cloneOverview(overview: OverviewMap): OverviewMap {
  return {
    imageUrl: overview.imageUrl,
    width: overview.width,
    height: overview.height,
    pins: overview.pins.map((p) => ({ ...p })),
    links: overview.links.map((l) => ({ ...l })),
  };
}

export function clampToWorld(overview: Pick<OverviewMap, 'width' | 'height'>, x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(Math.min(Math.max(x, 0), Math.max(1, overview.width))),
    y: Math.round(Math.min(Math.max(y, 0), Math.max(1, overview.height))),
  };
}

/** Natural size of an image URL (null for unreadable or size-less images such as some SVGs). */
export function readImageSize(url: string, timeoutMs = 15000): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (value: { width: number; height: number } | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      finish(width > 0 && height > 0 ? { width, height } : null);
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}

/** Overview world limits (px). */
export const OVERVIEW_MIN_SIZE = 400;
export const OVERVIEW_MAX_SIZE = 16000;
