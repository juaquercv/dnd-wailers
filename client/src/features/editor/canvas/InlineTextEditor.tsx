import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import type { MarkerElement, NoteElement, SceneElement, TextElement, ZoneLevel } from '@wailers/shared';
import { FONT_DISPLAY, FONT_SANS, MAP_COLORS, type MapStageHandle } from '../../../map';
import { measureTextBlock } from '../../../map/mapUtils';
import { useCanvasUi, type CanvasView } from './canvasUiStore';
import { NOTE_COLOR, NOTE_SIZE } from './factories';
import { findElementNode } from './useCanvasController';

const TEXT_LINE_HEIGHT = 1.15;
const NOTE_TEXT = { x: 12, y: 30, width: NOTE_SIZE.width - 24, height: NOTE_SIZE.height - 30 - 14, fontSize: 14, lineHeight: 1.25 };
const MARKER_FONT = 13;

type EditableElement = TextElement | NoteElement | MarkerElement;

function isEditable(el: SceneElement | undefined): el is EditableElement {
  return !!el && (el.type === 'text' || el.type === 'note' || el.type === 'marker');
}

interface EditorBoxProps {
  el: EditableElement;
  isNew: boolean;
  view: CanvasView;
  mapRef: RefObject<MapStageHandle>;
  onCommit(id: string, value: string, isNew: boolean): void;
}

function initialValue(el: EditableElement): string {
  return el.type === 'marker' ? el.label : el.text;
}

function EditorBox({ el, isNew, view, mapRef, onCommit }: EditorBoxProps) {
  const [value, setValue] = useState(() => initialValue(el));
  const doneRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const fieldRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommit(el.id, valueRef.current, isNew);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // Focus once; new elements start with their placeholder text selected.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.focus({ preventScroll: true });
    if (isNew || el.type === 'text') field.select();
    else field.setSelectionRange(field.value.length, field.value.length);
  }, [isNew, el.type]);

  // While editing a text, its canvas node is hidden so the glyphs are not drawn twice.
  useEffect(() => {
    if (el.type !== 'text') return;
    const node = findElementNode(mapRef.current?.getStage(), el.id);
    if (!node) return;
    node.visible(false);
    node.getLayer()?.batchDraw();
    return () => {
      node.visible(true);
      node.getLayer()?.batchDraw();
    };
  }, [el.id, el.type, mapRef]);

  // Commit if the editor is torn down by something else (zone change, unmount).
  useEffect(() => () => finishRef.current(), []);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      finish();
    } else if (e.key === 'Enter' && (el.type === 'marker' || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      finish();
    }
  };

  const s = view.scale;
  const origin = { x: el.x * s + view.x, y: el.y * s + view.y };
  const wrapper: CSSProperties = {
    position: 'absolute',
    left: origin.x,
    top: origin.y,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    transformOrigin: '0 0',
    zIndex: 20,
  };

  if (el.type === 'text') {
    const fontSize = Math.max(4, el.fontSize);
    const m = measureTextBlock(value || ' ', fontSize, FONT_DISPLAY, TEXT_LINE_HEIGHT);
    const width = Math.max(m.width + fontSize * 0.8, fontSize * 2) * s;
    const height = Math.max(1, value.split('\n').length) * fontSize * TEXT_LINE_HEIGHT * s;
    return (
      <div style={wrapper}>
        <textarea
          ref={fieldRef}
          value={value}
          spellCheck={false}
          aria-label="Editar texto"
          onChange={(e) => setValue(e.target.value)}
          onBlur={finish}
          onKeyDown={onKeyDown}
          className="scroll-thin block resize-none overflow-hidden whitespace-pre rounded-sm border-0 bg-ink-950/25 p-0 outline-none ring-1 ring-gold-400/80 ring-offset-2 ring-offset-transparent"
          style={{
            width,
            height,
            fontFamily: FONT_DISPLAY,
            fontSize: fontSize * s,
            lineHeight: TEXT_LINE_HEIGHT,
            color: el.color || MAP_COLORS.parchment100,
            caretColor: MAP_COLORS.gold300,
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.75)',
          }}
        />
      </div>
    );
  }

  if (el.type === 'note') {
    return (
      <div style={wrapper}>
        <textarea
          ref={fieldRef}
          value={value}
          placeholder="Escribe la nota…"
          aria-label="Editar nota del DM"
          onChange={(e) => setValue(e.target.value)}
          onBlur={finish}
          onKeyDown={onKeyDown}
          className="scroll-thin absolute block resize-none rounded-sm border-0 p-0 outline-none ring-2 ring-gold-500/70 placeholder:text-[#3b2f12]/50"
          style={{
            left: NOTE_TEXT.x * s,
            top: NOTE_TEXT.y * s,
            width: NOTE_TEXT.width * s,
            height: NOTE_TEXT.height * s,
            fontFamily: FONT_SANS,
            fontSize: NOTE_TEXT.fontSize * s,
            lineHeight: NOTE_TEXT.lineHeight,
            color: '#3b2f12',
            background: el.color || NOTE_COLOR,
          }}
        />
      </div>
    );
  }

  // marker label: pill input centered under the pin tip
  const fontSize = MARKER_FONT * s;
  const width = Math.max(140, measureTextBlock(value || 'Etiqueta', MARKER_FONT, FONT_SANS, 1.2, 'bold').width + 40) * s;
  return (
    <div style={wrapper}>
      <input
        ref={fieldRef}
        value={value}
        placeholder="Etiqueta del marcador"
        aria-label="Editar etiqueta del marcador"
        onChange={(e) => setValue(e.target.value)}
        onBlur={finish}
        onKeyDown={onKeyDown}
        maxLength={80}
        className="absolute block rounded-full border border-gold-500/80 bg-ink-950/95 text-center font-bold text-parchment-100 shadow-modal outline-none placeholder:font-normal placeholder:text-parchment-400 focus:ring-2 focus:ring-gold-400/40"
        style={{
          left: -width / 2,
          top: 4 * s,
          width,
          height: Math.max(14, (MARKER_FONT * 1.2 + 8) * s),
          fontFamily: FONT_SANS,
          fontSize,
          padding: `0 ${8 * s}px`,
        }}
      />
    </div>
  );
}

/** HTML overlay to edit texts, note bodies and marker labels in place (follows pan/zoom). */
export function InlineTextEditor({ level, mapRef, onCommit }: { level: ZoneLevel; mapRef: RefObject<MapStageHandle>; onCommit(id: string, value: string, isNew: boolean): void }) {
  const editing = useCanvasUi((s) => s.editing);
  const view = useCanvasUi((s) => s.view);
  const el = editing ? level.elements.find((e) => e.id === editing.id) : undefined;
  if (!editing || !isEditable(el)) return null;
  return <EditorBox key={editing.id} el={el} isNew={editing.isNew} view={view} mapRef={mapRef} onCommit={onCommit} />;
}
