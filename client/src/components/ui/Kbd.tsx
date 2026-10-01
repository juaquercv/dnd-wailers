import type { ReactNode } from 'react';
import clsx from 'clsx';
import { hotkeyParts, IS_MAC } from '../../lib/hotkeys';

export interface KbdProps {
  /** Literal content, e.g. <Kbd>Esc</Kbd>. */
  children?: ReactNode;
  /** Or a hotkey combo rendered as keycaps, e.g. combo="mod+k". */
  combo?: string;
  className?: string;
}

const KEYCAP =
  'inline-flex min-w-[1.4em] items-center justify-center rounded border border-ink-500 border-b-[2px] bg-ink-800 px-1.5 py-px font-sans text-[10px] font-semibold leading-4 text-parchment-200 shadow-[inset_0_-1px_0_rgba(0,0,0,0.4)]';

/** Keyboard key cap. */
export function Kbd({ children, combo, className }: KbdProps) {
  if (combo) {
    const parts = hotkeyParts(combo);
    return (
      <span className={clsx('inline-flex items-center gap-0.5', className)} aria-label={parts.join(' + ')}>
        {parts.map((p, i) => (
          <kbd key={`${p}-${i}`} className={KEYCAP}>
            {p}
          </kbd>
        ))}
      </span>
    );
  }
  return <kbd className={clsx(KEYCAP, className)}>{children}</kbd>;
}

/** Platform name of the "mod" key ("Ctrl" or "⌘"). */
export const MOD_KEY_LABEL = IS_MAC ? '⌘' : 'Ctrl';
