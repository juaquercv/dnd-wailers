import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Pause, Play, Star } from 'lucide-react';
import type { LibraryEntry } from '@wailers/shared';
import { withAlpha } from '../../components/ui/Badge';
import { useCategoriesStore } from '../../stores/categories';
import { KIND_ACCENT, KindIcon, asAny, entryImage } from './meta';
import { toggleSoundPreview, useSoundPreviewPlaying } from './soundPreview';

// ---------------------------------------------------------------------------
// Thumbnail
// ---------------------------------------------------------------------------

export interface EntryThumbProps {
  entry: LibraryEntry;
  /** Pixel size (square). Omit to fill the parent. */
  size?: number;
  round?: boolean;
  className?: string;
  iconClassName?: string;
}

/** Entry image with a themed fallback (kind icon over the kind accent). */
export function EntryThumb({ entry, size, round = false, className, iconClassName }: EntryThumbProps) {
  const url = entryImage(entry);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  const accent = KIND_ACCENT[entry.kind] ?? '#d4a63f';
  const style: CSSProperties | undefined = size ? { width: size, height: size } : undefined;
  const shape = round ? 'rounded-full' : size && size <= 40 ? 'rounded-md' : 'rounded-lg';
  if (url && !broken) {
    return (
      <span className={clsx('relative block shrink-0 overflow-hidden bg-ink-800', shape, !size && 'h-full w-full', className)} style={style}>
        <img
          src={url}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  return (
    <span
      className={clsx('relative flex shrink-0 items-center justify-center overflow-hidden', shape, !size && 'h-full w-full', className)}
      style={{
        ...style,
        background: `radial-gradient(circle at 50% 35%, ${withAlpha(accent, 0.32)}, ${withAlpha(accent, 0.08)} 55%, rgba(11,10,8,0.9) 100%)`,
      }}
      aria-hidden
    >
      <span
        className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:repeating-linear-gradient(45deg,#f3ead6_0_1px,transparent_1px_10px)]"
        aria-hidden
      />
      <KindIcon
        kind={entry.kind}
        className={clsx('relative drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]', iconClassName ?? (size && size <= 40 ? 'h-4 w-4' : 'h-1/3 w-1/3'))}
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Category chips & tags
// ---------------------------------------------------------------------------

export function CategoryChip({ id, size = 'sm', onRemove }: { id: string; size?: 'xs' | 'sm'; onRemove?: () => void }) {
  const cat = useCategoriesStore((s) => s.byId[id]);
  const pathName = useCategoriesStore((s) => s.pathName);
  if (!cat) return null;
  const color = cat.color ?? '#a8946b';
  return (
    <span
      title={pathName(id, true)}
      className={clsx(
        'inline-flex max-w-full items-center gap-1 rounded-full border font-medium',
        size === 'xs' ? 'px-1.5 py-px text-[10px] leading-4' : 'px-2 py-0.5 text-[11px] leading-4',
      )}
      style={{ borderColor: withAlpha(color, 0.45), backgroundColor: withAlpha(color, 0.12), color: '#f3ead6' }}
    >
      {cat.icon ? <span className="shrink-0 leading-none">{cat.icon}</span> : <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
      <span className="truncate">{cat.name}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Quitar ${cat.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-0.5 rounded-full px-0.5 text-parchment-300 transition hover:bg-black/30 hover:text-parchment-50"
        >
          ×
        </button>
      )}
    </span>
  );
}

/** Category chips (deepest first, most specific values), limited to `max` with a "+N". */
export function CategoryChips({ ids, max = 3, size = 'sm', className }: { ids: string[]; max?: number; size?: 'xs' | 'sm'; className?: string }) {
  const byId = useCategoriesStore((s) => s.byId);
  const known = ids.filter((id) => byId[id]);
  // Hide a category when one of its descendants is also present (keep the most specific).
  const parents = new Set<string>();
  for (const id of known) {
    let cur = byId[id]?.parentId ?? null;
    const guard = new Set<string>();
    while (cur && !guard.has(cur)) {
      guard.add(cur);
      parents.add(cur);
      cur = byId[cur]?.parentId ?? null;
    }
  }
  const visible = known.filter((id) => !parents.has(id));
  if (visible.length === 0) return null;
  const shown = visible.slice(0, max);
  return (
    <div className={className ?? 'flex flex-wrap items-center gap-1'}>
      {shown.map((id) => (
        <CategoryChip key={id} id={id} size={size} />
      ))}
      {visible.length > shown.length && (
        <span className="text-[10px] font-semibold text-parchment-400" title={visible.slice(max).map((id) => byId[id]?.name ?? '').join(', ')}>
          +{visible.length - shown.length}
        </span>
      )}
    </div>
  );
}

export function TagList({ tags, max = 3, className }: { tags: string[]; max?: number; className?: string }) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  return (
    <div className={className ?? 'flex flex-wrap items-center gap-x-1.5 gap-y-0.5'}>
      {shown.map((t) => (
        <span key={t} className="text-[11px] text-parchment-400">
          <span className="text-gold-600">#</span>
          {t}
        </span>
      ))}
      {tags.length > shown.length && <span className="text-[10px] text-parchment-500">+{tags.length - shown.length}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small buttons
// ---------------------------------------------------------------------------

export function FavoriteButton({
  active,
  onToggle,
  size = 'md',
  className,
}: {
  active: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        onToggle();
      }}
      title={active ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      aria-label={active ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      aria-pressed={active}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full transition active:scale-90',
        size === 'sm' ? 'h-6 w-6' : 'h-8 w-8',
        active
          ? 'text-gold-300 drop-shadow-[0_0_6px_rgba(233,192,99,0.7)] hover:text-gold-200'
          : 'text-parchment-300/80 hover:bg-black/40 hover:text-gold-200',
        className,
      )}
    >
      <Star className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}

/** Play/pause through the shared preview player (sound entries only). */
export function SoundPreviewButton({ entry, size = 'md', className }: { entry: LibraryEntry; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const playing = useSoundPreviewPlaying(entry.id);
  const e = asAny(entry);
  if (e.kind !== 'sound') return null;
  const dims = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-12 w-12' : 'h-9 w-9';
  const icon = size === 'lg' ? 'h-5 w-5' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        toggleSoundPreview(e.id, e.data?.url ?? '', { volume: e.data?.volume, soundType: e.data?.soundType });
      }}
      title={playing ? 'Detener vista previa' : 'Escuchar vista previa'}
      aria-label={playing ? 'Detener vista previa' : 'Escuchar vista previa'}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-sky-400/50 bg-ink-950/70 text-sky-100 backdrop-blur transition hover:scale-105 hover:bg-sky-500/30 active:scale-95',
        playing && 'bg-sky-500/30 shadow-[0_0_18px_-2px_rgba(90,184,240,0.8)]',
        dims,
        className,
      )}
    >
      {playing ? <Pause className={icon} /> : <Play className={clsx(icon, 'ml-0.5')} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Popover (portal, fixed position, closes on outside click / Esc)
// ---------------------------------------------------------------------------

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement>;
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
  /** Fixed width in px (default: auto). */
  width?: number;
}

const GAP = 6;
const MARGIN = 8;

export function Popover({ open, onClose, anchorRef, children, align = 'start', className, width }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const a = anchor.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = align === 'end' ? a.right - p.width : a.left;
      left = Math.max(MARGIN, Math.min(left, vw - p.width - MARGIN));
      let top = a.bottom + GAP;
      if (top + p.height > vh - MARGIN && a.top - GAP - p.height >= MARGIN) top = a.top - GAP - p.height;
      top = Math.max(MARGIN, Math.min(top, vh - p.height - MARGIN));
      setPos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }));
    };
    place();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    if (ro && panelRef.current) ro.observe(panelRef.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('touchstart', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('touchstart', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, anchorRef]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={panelRef}
      className={clsx(
        'fixed z-90 animate-fade-in rounded-xl border border-ink-500 bg-ink-900/95 p-1.5 shadow-modal backdrop-blur',
        className,
      )}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width, visibility: pos ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Section title used in details and forms. */
export function SectionTitle({ children, icon, aside, className }: { children: ReactNode; icon?: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      {icon && <span className="text-gold-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <h3 className="font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-gold-300">{children}</h3>
      <span className="h-px flex-1 bg-gradient-to-r from-gold-700/60 to-transparent" aria-hidden />
      {aside}
    </div>
  );
}
