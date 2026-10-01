import { memo } from 'react';
import type Konva from 'konva';
import { Group } from 'react-konva';
import type { GridConfig, Token } from '@wailers/shared';
import { TokenSprite, type HpBarMode, type TokenHpInfo } from '../../../map';

/** Mouse click or touch tap on a token. */
export type TokenPointerEvent = Konva.KonvaEventObject<Event>;

/** Stable callbacks shared by every token (they read fresh state through refs). */
export interface TokenHandlers {
  click(tokenId: string, e: TokenPointerEvent, touch: boolean): void;
  dblClick(tokenId: string): void;
  contextMenu(tokenId: string, e: Konva.KonvaEventObject<MouseEvent>): void;
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
}

interface TokenNodeProps extends TokenView {
  grid: GridConfig;
  isDmView: boolean;
  handlers: TokenHandlers;
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
  grid,
  isDmView,
  handlers,
}: TokenNodeProps) {
  const id = token.id;
  return (
    <Group
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
      {views.map((v) => (
        <TokenNode key={v.token.id} {...v} grid={grid} isDmView={isDmView} handlers={handlers} />
      ))}
    </Group>
  );
}
