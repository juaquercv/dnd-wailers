import { newId, type SceneElement, type ZoneLevel } from '@wailers/shared';

/** Levels sorted top floor first (elevation desc), keeping the stored order for equal elevations. */
export function sortLevelsByElevation(levels: ZoneLevel[]): ZoneLevel[] {
  return levels
    .map((level, index) => ({ level, index }))
    .sort((a, b) => b.level.elevation - a.level.elevation || a.index - b.index)
    .map((x) => x.level);
}

/** Deep copy of a level with fresh ids for the level and everything inside it. */
export function cloneLevel(level: ZoneLevel, name: string): ZoneLevel {
  const copy = structuredClone(level);
  copy.id = newId('lvl');
  copy.name = name;
  copy.elements = copy.elements.map((el) => ({ ...el, id: newId('el') }) as SceneElement);
  copy.walls = copy.walls.map((w) => ({ ...w, id: newId('wall') }));
  copy.lights = copy.lights.map((l) => ({ ...l, id: newId('light') }));
  copy.fogRegions = copy.fogRegions.map((f) => ({ ...f, id: newId('fog') }));
  return copy;
}

export function levelCenter(level: Pick<ZoneLevel, 'background'>): { x: number; y: number } {
  return { x: Math.round(level.background.width / 2), y: Math.round(level.background.height / 2) };
}

/** Number of things drawn on a level (elements, walls, lights and fog regions). */
export function levelContentCount(level: ZoneLevel): number {
  return level.elements.length + level.walls.length + level.lights.length + level.fogRegions.length;
}

/** Loads an image to read its natural size (null when it fails or has no intrinsic size). */
export function readImageSize(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (value: { width: number; height: number } | null) => {
      img.onload = null;
      img.onerror = null;
      resolve(value);
    };
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      done(width > 0 && height > 0 ? { width, height } : null);
    };
    img.onerror = () => done(null);
    img.decoding = 'async';
    img.src = url;
  });
}
