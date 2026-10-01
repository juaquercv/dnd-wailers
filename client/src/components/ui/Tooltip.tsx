import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  /** Allow multi-line content up to ~16rem wide. */
  wrap?: boolean;
  disabled?: boolean;
}

const SIDE: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2 translate-y-1 group-hover/tt:translate-y-0 group-focus-within/tt:translate-y-0',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2 -translate-y-1 group-hover/tt:translate-y-0 group-focus-within/tt:translate-y-0',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2 translate-x-1 group-hover/tt:translate-x-0 group-focus-within/tt:translate-x-0',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2 -translate-x-1 group-hover/tt:translate-x-0 group-focus-within/tt:translate-x-0',
};

/** Pure-CSS tooltip shown on hover / keyboard focus. */
export function Tooltip({ content, children, side = 'top', className, wrap = false, disabled = false }: TooltipProps) {
  if (disabled || content === null || content === undefined || content === '') return <>{children}</>;
  return (
    <span className={clsx('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={clsx(
          'tooltip-bubble delay-150 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          wrap && 'w-max max-w-[16rem] whitespace-normal',
          SIDE[side],
        )}
      >
        {content}
      </span>
    </span>
  );
}
