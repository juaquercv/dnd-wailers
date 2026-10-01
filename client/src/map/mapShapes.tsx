import { memo } from 'react';
import { Circle, Group, Image as KonvaImage, Line, Rect, Text } from 'react-konva';
import { coverCrop, FONT_DISPLAY, FONT_EMOJI, FONT_SANS, initialsOf, MAP_COLORS, measureTextWidth, shadeColor, useFontsVersion } from './mapUtils';
import { useLoadedImage } from './useLoadedImage';

export interface LabelBoxOptions {
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  paddingX?: number;
  paddingY?: number;
  maxWidth?: number;
}

const LABEL_DEFAULTS = { fontSize: 13, fontFamily: FONT_SANS, fontStyle: 'bold', paddingX: 8, paddingY: 3 } as const;

/** Size of a MapLabel pill (for bounds computations). */
export function labelBoxSize(text: string, opts: LabelBoxOptions = {}): { width: number; height: number; textWidth: number } {
  const fontSize = opts.fontSize ?? LABEL_DEFAULTS.fontSize;
  const fontFamily = opts.fontFamily ?? LABEL_DEFAULTS.fontFamily;
  const fontStyle = opts.fontStyle ?? LABEL_DEFAULTS.fontStyle;
  const paddingX = opts.paddingX ?? LABEL_DEFAULTS.paddingX;
  const paddingY = opts.paddingY ?? LABEL_DEFAULTS.paddingY;
  const raw = measureTextWidth(text, fontSize, fontFamily, fontStyle);
  const textWidth = Math.ceil(opts.maxWidth ? Math.min(raw, opts.maxWidth) : raw) + 1;
  return { width: textWidth + paddingX * 2, height: Math.ceil(fontSize * 1.2) + paddingY * 2, textWidth };
}

export interface MapLabelProps extends LabelBoxOptions {
  text: string;
  /** Horizontal center. */
  x?: number;
  y: number;
  /** Which edge of the pill sits at y. */
  anchor?: 'top' | 'center' | 'bottom';
  textColor?: string;
  background?: string;
  borderColor?: string | null;
  opacity?: number;
  listening?: boolean;
}

/** Rounded "pill" label used for names under tokens, markers, transitions and regions. */
export const MapLabel = memo(function MapLabel({
  text,
  x = 0,
  y,
  anchor = 'top',
  textColor = MAP_COLORS.parchment100,
  background = 'rgba(11, 10, 8, 0.82)',
  borderColor = 'rgba(212, 166, 63, 0.55)',
  opacity = 1,
  listening = false,
  ...opts
}: MapLabelProps) {
  const fontsVersion = useFontsVersion();
  const fontSize = opts.fontSize ?? LABEL_DEFAULTS.fontSize;
  const fontFamily = opts.fontFamily ?? LABEL_DEFAULTS.fontFamily;
  const fontStyle = opts.fontStyle ?? LABEL_DEFAULTS.fontStyle;
  const paddingX = opts.paddingX ?? LABEL_DEFAULTS.paddingX;
  const paddingY = opts.paddingY ?? LABEL_DEFAULTS.paddingY;
  if (!text) return null;
  const box = labelBoxSize(text, opts);
  const top = anchor === 'top' ? y : anchor === 'bottom' ? y - box.height : y - box.height / 2;
  return (
    <Group x={x - box.width / 2} y={top} opacity={opacity} listening={listening}>
      <Rect
        width={box.width}
        height={box.height}
        cornerRadius={box.height / 2}
        fill={background}
        stroke={borderColor ?? undefined}
        strokeWidth={borderColor ? 1 : 0}
        perfectDrawEnabled={false}
      />
      <Text
        key={fontsVersion}
        x={paddingX}
        y={paddingY}
        width={box.textWidth}
        height={Math.ceil(fontSize * 1.2)}
        text={text}
        fontSize={fontSize}
        fontFamily={fontFamily}
        fontStyle={fontStyle}
        fill={textColor}
        align="center"
        verticalAlign="middle"
        wrap="none"
        ellipsis={!!opts.maxWidth}
        perfectDrawEnabled={false}
      />
    </Group>
  );
});

/** Small round badge with a crossed eye: "hidden from players". */
export function EyeOffBadge({ x, y, radius }: { x: number; y: number; radius: number }) {
  const r = Math.max(5, radius);
  return (
    <Group x={x} y={y} listening={false}>
      <Circle radius={r} fill={MAP_COLORS.ink900} stroke={MAP_COLORS.parchment300} strokeWidth={Math.max(1, r * 0.14)} perfectDrawEnabled={false} />
      <Text
        x={-r}
        y={-r}
        width={r * 2}
        height={r * 2}
        text="👁"
        fontSize={r * 1.1}
        fontFamily={FONT_EMOJI}
        align="center"
        verticalAlign="middle"
        opacity={0.85}
      />
      <Line
        points={[-r * 0.62, r * 0.62, r * 0.62, -r * 0.62]}
        stroke={MAP_COLORS.blood400}
        strokeWidth={Math.max(1.5, r * 0.22)}
        lineCap="round"
      />
    </Group>
  );
}

export interface PortraitProps {
  imageUrl: string | null;
  name: string;
  /** Half of the portrait size. */
  radius: number;
  shape?: 'circle' | 'square';
  /** Disc color when there is no image. */
  color: string;
}

/** Image clipped to a circle/rounded square (cover crop) or a colored disc with initials. */
export const Portrait = memo(function Portrait({ imageUrl, name, radius, shape = 'circle', color }: PortraitProps) {
  const image = useLoadedImage(imageUrl);
  const fontsVersion = useFontsVersion();
  const r = Math.max(1, radius);
  const size = r * 2;
  const corner = r * 0.36;
  if (image) {
    return (
      <Group
        clipFunc={(ctx) => {
          if (shape === 'circle') ctx.arc(0, 0, r, 0, Math.PI * 2, false);
          else ctx.roundRect(-r, -r, size, size, corner);
        }}
        listening={false}
      >
        <KonvaImage image={image} x={-r} y={-r} width={size} height={size} crop={coverCrop(image, size, size)} perfectDrawEnabled={false} />
      </Group>
    );
  }
  const initials = initialsOf(name);
  const fontSize = r * (initials.length > 1 ? 0.78 : 0.95);
  return (
    <Group listening={false}>
      {shape === 'circle' ? (
        <Circle radius={r} fillRadialGradientStartPoint={{ x: -r * 0.3, y: -r * 0.35 }} fillRadialGradientStartRadius={0}
          fillRadialGradientEndPoint={{ x: 0, y: 0 }} fillRadialGradientEndRadius={r * 1.1}
          fillRadialGradientColorStops={[0, shadeColor(color, 0.08), 1, shadeColor(color, -0.55)]} perfectDrawEnabled={false} />
      ) : (
        <Rect x={-r} y={-r} width={size} height={size} cornerRadius={corner}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: size }}
          fillLinearGradientColorStops={[0, shadeColor(color, 0.05), 1, shadeColor(color, -0.55)]} perfectDrawEnabled={false} />
      )}
      <Text
        key={fontsVersion}
        x={-r}
        y={-r}
        width={size}
        height={size}
        text={initials}
        fontSize={fontSize}
        fontFamily={FONT_DISPLAY}
        fontStyle="bold"
        fill={MAP_COLORS.parchment50}
        align="center"
        verticalAlign="middle"
        shadowColor="#000000"
        shadowBlur={r * 0.12}
        shadowOpacity={0.8}
        perfectDrawEnabled={false}
      />
    </Group>
  );
});
