import { useLayoutEffect, useRef } from 'react';
import type Konva from 'konva';
import { Transformer } from 'react-konva';
import type { SceneElement, SceneElementType } from '@wailers/shared';
import { MAP_COLORS } from '../../../map';
import { findElementNode } from './useCanvasController';

/** Element types that can be resized/rotated with the transformer. */
export const TRANSFORMABLE_TYPES: ReadonlySet<SceneElementType> = new Set<SceneElementType>([
  'image',
  'shape',
  'path',
  'text',
  'marker',
  'transition',
  'note',
]);

/** Types whose size comes from the transformer scale (markers and notes only rotate). */
const RESIZABLE_TYPES: ReadonlySet<SceneElementType> = new Set<SceneElementType>(['image', 'shape', 'path', 'text', 'transition']);

const ALL_ANCHORS = ['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right'];
const CORNER_ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315];
const MIN_BOX_PX = 8;

export interface SelectionTransformerProps {
  /** Selected, editable elements to attach (only transformable types are used). */
  elements: SceneElement[];
  /** Changes whenever the level content changes so the frame is re-measured and nodes re-attached. */
  version: unknown;
}

/** Konva.Transformer framing the selected elements (resize + rotate; the layer converts scale on transform end). */
export function SelectionTransformer({ elements, version }: SelectionTransformerProps) {
  const trRef = useRef<Konva.Transformer>(null);
  const targets = elements.filter((el) => TRANSFORMABLE_TYPES.has(el.type));
  const idsKey = targets.map((el) => el.id).join('|');

  useLayoutEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const stage = tr.getStage();
    const nodes: Konva.Node[] = [];
    for (const id of idsKey ? idsKey.split('|') : []) {
      const node = findElementNode(stage, id);
      if (node) nodes.push(node);
    }
    tr.nodes(nodes);
    if (nodes.length > 0) tr.forceUpdate();
    tr.getLayer()?.batchDraw();
  }, [idsKey, version]);

  const types = new Set(targets.map((el) => el.type));
  const resizable = targets.some((el) => RESIZABLE_TYPES.has(el.type));
  const hasText = types.has('text');
  const keepRatio = hasText || types.has('image');

  return (
    <Transformer
      ref={trRef}
      rotateEnabled
      resizeEnabled={resizable}
      enabledAnchors={hasText ? CORNER_ANCHORS : ALL_ANCHORS}
      keepRatio={keepRatio}
      shiftBehavior={keepRatio ? 'inverted' : 'default'}
      rotationSnaps={ROTATION_SNAPS}
      rotationSnapTolerance={6}
      rotateAnchorOffset={26}
      ignoreStroke
      padding={4}
      flipEnabled={false}
      anchorSize={9}
      anchorCornerRadius={2}
      anchorFill={MAP_COLORS.ink900}
      anchorStroke={MAP_COLORS.gold400}
      anchorStrokeWidth={1.5}
      borderStroke={MAP_COLORS.gold400}
      borderStrokeWidth={1.5}
      borderDash={[5, 3]}
      boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < MIN_BOX_PX || Math.abs(newBox.height) < MIN_BOX_PX ? oldBox : newBox)}
    />
  );
}
