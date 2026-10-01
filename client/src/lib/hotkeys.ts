import { useEffect, useRef } from 'react';

/**
 * Keyboard shortcuts.
 *
 * Combo syntax: modifiers + key joined by "+", several combos separated by ",".
 *   'mod+k', 'mod+z', 'mod+shift+z', 'mod+y', 'delete', 'backspace', 'escape', 'space', 'a', '1', 'shift+?'
 * `mod` = Ctrl on Windows/Linux, ⌘ on macOS (either is accepted everywhere).
 */
export type HotkeyHandler = (e: KeyboardEvent) => void;

export interface HotkeyOptions {
  /** Default true. */
  enabled?: boolean;
  /** Fire while typing in inputs/textareas/contenteditable. Default false. */
  allowInInputs?: boolean;
  /** Call preventDefault on match. Default true. */
  preventDefault?: boolean;
  /** Ignore auto-repeated keydown events. Default false. */
  ignoreRepeat?: boolean;
  /** Listen in the capture phase (fires before bubbling handlers). Default false. */
  capture?: boolean;
}

interface ParsedCombo {
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  del: 'delete',
  space: ' ',
  spacebar: ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  return: 'enter',
  plus: '+',
  comma: ',',
};

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

const parseCache = new Map<string, ParsedCombo[]>();

/** Parse "mod+shift+z, mod+y" into combos. */
export function parseHotkey(combos: string): ParsedCombo[] {
  const cached = parseCache.get(combos);
  if (cached) return cached;
  const out: ParsedCombo[] = [];
  for (const raw of combos.split(',')) {
    const combo = raw.trim().toLowerCase();
    if (!combo) continue;
    // Allow "+" as a key: "mod++" -> parts ["mod", "+"]
    const parts = combo.endsWith('++') ? [...combo.slice(0, -2).split('+'), '+'] : combo.split('+');
    const parsed: ParsedCombo = { mod: false, ctrl: false, meta: false, shift: false, alt: false, key: '' };
    for (const part of parts) {
      const p = part.trim();
      if (p === 'mod') parsed.mod = true;
      else if (p === 'ctrl' || p === 'control') parsed.ctrl = true;
      else if (p === 'meta' || p === 'cmd' || p === 'command') parsed.meta = true;
      else if (p === 'shift') parsed.shift = true;
      else if (p === 'alt' || p === 'option') parsed.alt = true;
      else parsed.key = KEY_ALIASES[p] ?? p;
    }
    if (parsed.key) out.push(parsed);
  }
  parseCache.set(combos, out);
  return out;
}

function isAlnum(key: string): boolean {
  return /^[a-z0-9]$/.test(key);
}

function matchesCombo(e: KeyboardEvent, c: ParsedCombo): boolean {
  const key = (e.key ?? '').toLowerCase();
  let keyOk = key === c.key;
  // Layout-independent fallback for letters/digits (Alt/Shift may change e.key).
  if (!keyOk && isAlnum(c.key)) {
    const code = /^[a-z]$/.test(c.key) ? `Key${c.key.toUpperCase()}` : `Digit${c.key}`;
    keyOk = e.code === code;
  }
  if (!keyOk) return false;

  if (c.mod) {
    if (!(e.ctrlKey || e.metaKey)) return false;
  } else if (c.ctrl !== e.ctrlKey || c.meta !== e.metaKey) {
    return false;
  }
  if (c.alt !== e.altKey) return false;
  // Symbols such as "?" or "+" usually need Shift implicitly; only enforce Shift for named/alnum keys.
  const symbol = c.key.length === 1 && !isAlnum(c.key) && c.key !== ' ';
  if (!symbol && c.shift !== e.shiftKey) return false;
  if (symbol && c.shift && !e.shiftKey) return false;
  return true;
}

/** True if the keyboard event matches any combo in `combos`. */
export function matchHotkey(e: KeyboardEvent, combos: string): boolean {
  return parseHotkey(combos).some((c) => matchesCombo(e, c));
}

/** True for inputs, textareas, selects and contenteditable elements. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
  }
  return false;
}

/**
 * Bind shortcuts for the component lifetime. `bindings` may change every render (kept in a ref).
 * The first matching binding wins.
 */
export function useHotkeys(bindings: Record<string, HotkeyHandler>, opts: HotkeyOptions = {}): void {
  const ref = useRef(bindings);
  ref.current = bindings;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const enabled = opts.enabled ?? true;
  const capture = opts.capture ?? false;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.key === 'Process' || e.key === 'Unidentified') return;
      const o = optsRef.current;
      if (o.ignoreRepeat && e.repeat) return;
      if (!o.allowInInputs && isEditableTarget(e.target)) return;
      for (const [combos, handler] of Object.entries(ref.current)) {
        if (matchHotkey(e, combos)) {
          if (o.preventDefault ?? true) e.preventDefault();
          handler(e);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, capture);
    return () => window.removeEventListener('keydown', onKeyDown, capture);
  }, [enabled, capture]);
}

const KEY_LABELS: Record<string, string> = {
  ' ': 'Espacio',
  escape: 'Esc',
  delete: 'Supr',
  backspace: '⌫',
  enter: 'Intro',
  tab: 'Tab',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  pageup: 'RePág',
  pagedown: 'AvPág',
  home: 'Inicio',
  end: 'Fin',
};

/** Human label parts for a combo (first combo only): 'mod+shift+z' → ['Ctrl', 'Mayús', 'Z']. */
export function hotkeyParts(combos: string): string[] {
  const c = parseHotkey(combos)[0];
  if (!c) return [];
  const parts: string[] = [];
  if (c.mod) parts.push(IS_MAC ? '⌘' : 'Ctrl');
  if (c.ctrl) parts.push('Ctrl');
  if (c.meta) parts.push(IS_MAC ? '⌘' : 'Meta');
  if (c.alt) parts.push(IS_MAC ? '⌥' : 'Alt');
  if (c.shift) parts.push(IS_MAC ? '⇧' : 'Mayús');
  const label = KEY_LABELS[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key.charAt(0).toUpperCase() + c.key.slice(1));
  parts.push(label);
  return parts;
}

/** 'mod+shift+z' → "Ctrl+Mayús+Z" (or "⌘⇧Z" on macOS). */
export function formatHotkey(combos: string): string {
  const parts = hotkeyParts(combos);
  return IS_MAC ? parts.join('') : parts.join('+');
}
