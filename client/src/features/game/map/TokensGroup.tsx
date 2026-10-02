import { memo } from 'react';
import type Konva from 'konva';
import { Circle, Group, Text } from 'react-konva';
import type { GridConfig, Token } from '@wailers/shared';
import { FONT_EMOJI, MAP_COLORS, TokenSprite, type HpBarMode, type TokenHpInfo } from '../../../map';

/** Mouse click or touch tap on a token. */
export type TokenPointerEvent = Konva.KonvaEventObject<Event>;

/** Stable callbacks shared by every token (they read fresh state through refs). */
export interface TokenHandlers {
  click(tokenId: string, e: TokenPointerEvent, touch: boolean): void;
  dblClick(tokenId: string): void;
  contextMenu(tokenId: string, e: Konva.KonvaEventObject<MouseEvent>): void;
  /** Mouse/touch press on a token (before any drag starts). */
  press(tokenId: string, e: TokenPointerEvent): void;
  dragMove(tokenId: string, x: number, y: number): void;
  dragEnd(tokenId: string, x: number, y: number): void;
}

export interface TokenView {
  token: Token;
  hp: TokenHpInfo;
  showHpBar: HpBarMode;
  draggable: boolean;
  selected: boolean;
  isCurrentTurn: boolean;
  dragPreview: { x: number; y: number } | null;
  highlight: string | null;
  /** Changes when a refused move must snap the sprite back at once (remounts the sprite). */
  revision: number;
  /** Item within reach of the player's hero: a hand badge invites to pick it up. */
  pickable: boolean;
}

interface TokenNodeProps extends Omit<TokenView, 'revision'> {
  grid: GridConfig;
  isDmView: boolean;
  handlers: TokenHandlers;
}

function PickBadge({ token, grid }: { token: Token; grid: GridConfig }) {
  const cell = Math.max(8, grid.size);
  const r = (Math.max(0.25, token.cells || 1) * cell) / 2;
  const badge = Math.max(9, Math.min(15, cell * 0.2));
  return (
    <Group x={token.x + r * 0.72} y={token.y - r * 0.72} listening={false}>
      <Circle radius={badge} fill="rgba(11, 10, 8, 0.92)" stroke={MAP_COLORS.emerald400} strokeWidth={2} shadowColor={MAP_COLORS.emerald400} shadowBlur={8} shadowOpacity={0.8} perfectDrawEnabled={false} />
      <Text x={-badge} y={-badge} width={badge * 2} height={badge * 2} text="✋" fontSize={badge * 1.1} fontFamily={FONT_EMOJI} align="center" verticalAlign="middle" />
    </Group>
  );
}

const TokenNode = memo(function TokenNode({
  token,
  hp,
  showHpBar,
  draggable,
  selected,
  isCurrentTurn,
  dragPreview,
  highlight,
  pickable,
  grid,
  isDmView,
  handlers,
}: TokenNodeProps) {
  const id = token.id;
  return (
    <Group
      onMouseDown={(e) => handlers.press(id, e)}
      onTouchStart={(e) => handlers.press(id, e)}
      onTap={(e) => {
        e.cancelBubble = true;
        handlers.click(id, e, true);
      }}
      onDblTap={(e) => {
        e.cancelBubble = true;
        handlers.dblClick(id);
      }}
    >
      <TokenSprite
        token={token}
        grid={grid}
        hp={hp}
        selected={selected}
        isDmView={isDmView}
        showHpBar={showHpBar}
        draggable={draggable}
        dragPreview={dragPreview}
        highlight={highlight}
        isCurrentTurn={isCurrentTurn}
        onClick={(e) => {
          e.cancelBubble = true;
          handlers.click(id, e, false);
        }}
        onDblClick={(e) => {
          e.cancelBubble = true;
          handlers.dblClick(id);
        }}
        onContextMenu={(e) => {
          e.cancelBubble = true;
          handlers.contextMenu(id, e);
        }}
        onDragMove={(x, y) => handlers.dragMove(id, x, y)}
        onDragEnd={(x, y) => handlers.dragEnd(id, x, y)}
      />
      {pickable && <PickBadge token={token} grid={grid} />}
    </Group>
  );
});

export interface TokensGroupProps {
  views: TokenView[];
  grid: GridConfig;
  isDmView: boolean;
  handlers: TokenHandlers;
}

/** Live tokens of the displayed level (a Group: place it inside a Layer / CombinedLayer). */
export function TokensGroup({ views, grid, isDmView, handlers }: TokensGroupProps) {
  return (
    <Group>
      {views.map(({ revision, ...v }) => (
        <TokenNode key={revision > 0 ? `${v.token.id}:${revision}` : v.token.id} {...v} grid={grid} isDmView={isDmView} handlers={handlers} />
      ))}
    </Group>
  );
}
