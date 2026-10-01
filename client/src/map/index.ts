// Shared Konva map primitives (campaign editor + live game).

export { MapStage, MAP_MAX_SCALE, MAP_MIN_SCALE } from './MapStage';
export type { MapMouseEvent, MapPoint, MapStageHandle, MapStageProps } from './MapStage';

export { CombinedLayer } from './MapLayer';
export type { CombinedLayerProps } from './MapLayer';

export { MapViewContext, useMapView, useMapViewSource } from './mapView';
export type { MapViewSource, MapViewState } from './mapView';

export { LevelBackground, LevelBackgroundGroup } from './LevelBackground';
export type { LevelBackgroundProps } from './LevelBackground';

export { GridLayer, GridShape } from './GridLayer';
export type { GridLayerProps } from './GridLayer';

export { SceneElementsGroup, SceneElementsLayer, TRANSITION_STYLES, elementBounds, transformPatch } from './SceneElementsLayer';
export type { ElementPatch, SceneElementsGroupProps, SceneElementsLayerProps } from './SceneElementsLayer';

export { TokenSprite } from './TokenSprite';
export type { HpBarMode, TokenHpInfo, TokenSpriteProps } from './TokenSprite';

export { WallsLayer } from './WallsLayer';
export type { WallsLayerProps } from './WallsLayer';

export { LightsLayer } from './LightsLayer';
export type { LightsLayerProps } from './LightsLayer';

export { FogRegionsLayer } from './FogRegionsLayer';
export type { FogRegionsLayerProps, FogRegionsMode } from './FogRegionsLayer';

export { VisionMask } from './VisionMask';
export type { VisionMaskProps } from './VisionMask';

export { LightingOverlay } from './LightingOverlay';
export type { LightingOverlayProps, TokenLight } from './LightingOverlay';

export { LevelStack } from './LevelStack';
export type { LevelStackProps, LevelStackViewer } from './LevelStack';

export { PingLayer } from './PingLayer';
export type { PingLayerProps } from './PingLayer';

export { getCachedImage, preloadImage, useImageStatus, useLoadedImage } from './useLoadedImage';
export type { ImageState, ImageStatus } from './useLoadedImage';

export { EyeOffBadge, MapLabel, Portrait, labelBoxSize } from './mapShapes';
export type { MapLabelProps, PortraitProps } from './mapShapes';

export {
  FONT_DISPLAY,
  FONT_EMOJI,
  FONT_SANS,
  MAP_COLORS,
  hpColor,
  iconToEmoji,
  initialsOf,
  setStageCursor,
  statusInfo,
  useFontsVersion,
  withAlpha,
} from './mapUtils';
