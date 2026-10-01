import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ChevronRight, CornerDownRight, FolderPlus, FolderTree, Info, Pencil, Plus, Smile, Trash2 } from 'lucide-react';
import { ENTRY_KIND_LABELS, ROULETTE_PALETTE, type CategoryDTO, type CategoryNode, type EntryKind } from '@wailers/shared';
import { api } from '../../api/http';
import { Button } from '../../components/ui/Button';
import { ColorPicker } from '../../components/ui/ColorPicker';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { toast } from '../../components/ui/toast';
import { useCategories, useCategoriesStore } from '../../stores/categories';
import { Popover } from './common';
import { KindIcon } from './meta';

export interface CategoryManagerProps {
  open: boolean;
  kind: EntryKind;
  onClose: () => void;
}

const EMOJIS = [
  '⚔️', '🗡️', '🏹', '🛡️', '🪓', '🔨', '🔱', '🪄', '📜', '📖', '🧪', '💍', '📿', '💎', '💰', '🗝️',
  '🔥', '❄️', '⚡', '🌊', '🌪️', '☠️', '💀', '☀️', '🌙', '✨', '🔮', '🧿', '👁️', '🧠', '💚', '🩸',
  '🐉', '🐺', '🕷️', '🦇', '🐍', '🧟', '👹', '😈', '🧙', '🧝', '🧔', '🧚', '🤖', '⚙️', '🌲', '⛰️',
  '🕳️', '🏰', '🏜️', '🐸', '🌿', '🍄', '🎻', '🎭', '🎯', '👑', '⭐', '🤝', '⚖️', '🗺️', '🎒', '🍖',
];

function InlineInput({
  initial = '',
  placeholder,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const done = useRef(false);
  const submit = () => {
    if (done.current) return;
    done.current = true;
    const v = text.trim();
    if (!v || v === initial.trim()) onCancel();
    else onSubmit(v);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      done.current = true;
      onCancel();
    }
  };
  return (
    <input
      autoFocus
      value={text}
      maxLength={60}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={submit}
      onFocus={(e) => e.currentTarget.select()}
      className="input input-sm min-w-0 flex-1"
    />
  );
}

type PopoverKind = 'icon' | 'color' | 'move';

/** Tree editor for the categories of one kind (facets = roots). */
export function CategoryManager({ open, kind, onClose }: CategoryManagerProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={<FolderTree />}
      title={`Categorías · ${ENTRY_KIND_LABELS[kind].plural}`}
      subtitle="Los cambios se aplican a toda la biblioteca compartida."
      footer={
        <Button variant="primary" onClick={onClose}>
          Hecho
        </Button>
      }
    >
      {open && <ManagerBody kind={kind} />}
    </Modal>
  );
}

function ManagerBody({ kind }: { kind: EntryKind }) {
  const { tree, byId, loading, loaded, descendantsOf } = useCategories(kind);
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newFacet, setNewFacet] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.map((f) => f.id)));
  const [expandedInit, setExpandedInit] = useState(tree.length > 0);
  if (!expandedInit && tree.length > 0) {
    setExpandedInit(true);
    setExpanded(new Set(tree.map((f) => f.id)));
  }
  const [popover, setPopover] = useState<{ type: PopoverKind; id: string } | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);

  const refresh = () => useCategoriesStore.getState().refresh();

  const run = async (id: string, fn: () => Promise<unknown>, success?: string) => {
    setBusyId(id);
    try {
      await fn();
      await refresh();
      if (success) toast.success(success);
    } catch (err) {
      toast.fromError(err, 'No se pudo guardar la categoría');
    } finally {
      setBusyId(null);
    }
  };

  const siblingsOf = (parentId: string | null): CategoryDTO[] =>
    Object.values(byId)
      .filter((c) => c.kind === kind && c.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'));

  const nextSort = (parentId: string | null) => siblingsOf(parentId).reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1;

  const expand = (id: string) => setExpanded((prev) => new Set(prev).add(id));
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const createFacet = async () => {
    const name = newFacet.trim();
    if (!name) return;
    await run('new-facet', () => api.categories.create({ kind, name, parentId: null, sortOrder: nextSort(null) }), `Faceta «${name}» creada`);
    setNewFacet('');
  };

  const createChild = (parentId: string, name: string) => {
    setAddingTo(null);
    expand(parentId);
    void run(parentId, () => api.categories.create({ kind, name, parentId, sortOrder: nextSort(parentId) }), `«${name}» añadida`);
  };

  const rename = (id: string, name: string) => {
    setEditingId(null);
    void run(id, () => api.categories.update(id, { name }));
  };

  const reorder = (node: CategoryDTO, dir: -1 | 1) => {
    const sibs = siblingsOf(node.parentId);
    const idx = sibs.findIndex((s) => s.id === node.id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= sibs.length) return;
    const order = [...sibs];
    const [moved] = order.splice(idx, 1);
    if (moved) order.splice(target, 0, moved);
    const updates = order.map((c, i) => ({ c, i })).filter(({ c, i }) => c.sortOrder !== i);
    void run(node.id, () => Promise.all(updates.map(({ c, i }) => api.categories.update(c.id, { sortOrder: i }))));
  };

  const moveTo = (node: CategoryDTO, parentId: string | null) => {
    setPopover(null);
    if (parentId) expand(parentId);
    const target = parentId ? byId[parentId]?.name ?? '' : null;
    void run(
      node.id,
      () => api.categories.update(node.id, { parentId, sortOrder: nextSort(parentId) }),
      target ? `«${node.name}» movida a «${target}»` : `«${node.name}» es ahora una faceta`,
    );
  };

  const remove = async (node: CategoryNode) => {
    const desc = descendantsOf(node.id).length;
    const ok = await confirm({
      title: `Eliminar «${node.name}»`,
      message: (
        <>
          {desc > 0 ? `También se eliminarán sus ${desc} subcategorías. ` : ''}Los elementos de la biblioteca dejarán de estar clasificados en
          ellas. Esta acción no se puede deshacer.
        </>
      ),
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    await run(node.id, () => api.categories.remove(node.id), `«${node.name}» eliminada`);
  };

  const openPopover = (type: PopoverKind, id: string) => (e: MouseEvent<HTMLElement>) => {
    anchorRef.current = e.currentTarget;
    setPopover((p) => (p && p.id === id && p.type === type ? null : { type, id }));
  };

  const popoverNode = popover ? byId[popover.id] ?? null : null;

  // Parents a node can move to: any category of this kind except itself and its descendants.
  const moveTargets = useMemo(() => {
    if (!popoverNode || popover?.type !== 'move') return [];
    const banned = new Set([popoverNode.id, ...descendantsOf(popoverNode.id)]);
    const out: { node: CategoryNode; depth: number }[] = [];
    const visit = (n: CategoryNode, depth: number) => {
      if (banned.has(n.id)) return;
      out.push({ node: n, depth });
      n.children.forEach((c) => visit(c, depth + 1));
    };
    tree.forEach((f) => visit(f, 0));
    return out;
  }, [popoverNode, popover, tree, descendantsOf]);

  const renderNode = (node: CategoryNode, depth: number) => {
    const isFacet = node.parentId === null;
    const open = expanded.has(node.id);
    const busy = busyId === node.id;
    const sibs = siblingsOf(node.parentId);
    const pos = sibs.findIndex((s) => s.id === node.id);
    return (
      <li key={node.id}>
        <div
          className={clsx(
            'group flex items-center gap-1 rounded-lg py-1 pr-1.5 transition',
            isFacet ? 'bg-ink-800/60 hover:bg-ink-800' : 'hover:bg-ink-800/60',
            popover?.id === node.id && 'bg-ink-800',
          )}
          style={{ paddingLeft: 4 + depth * 18 }}
        >
          {node.children.length > 0 || addingTo === node.id ? (
            <button
              type="button"
              onClick={() => toggleExpand(node.id)}
              aria-label={open ? 'Contraer' : 'Expandir'}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-parchment-400 hover:bg-ink-700 hover:text-parchment-100"
            >
              <ChevronRight className={clsx('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
            </button>
          ) : (
            <span className="w-6 shrink-0" />
          )}
          <button
            type="button"
            onClick={openPopover('icon', node.id)}
            title="Cambiar icono"
            aria-label={`Icono de ${node.name}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-base leading-none transition hover:border-ink-500 hover:bg-ink-700"
          >
            {node.icon || <Smile className="h-3.5 w-3.5 text-parchment-500" />}
          </button>
          <button
            type="button"
            onClick={openPopover('color', node.id)}
            title="Cambiar color"
            aria-label={`Color de ${node.name}`}
            className="flex h-7 w-5 shrink-0 items-center justify-center rounded-md transition hover:bg-ink-700"
          >
            <span
              className={clsx('h-3 w-3 rounded-full border', node.color ? 'border-black/40' : 'border-dashed border-parchment-500')}
              style={node.color ? { backgroundColor: node.color } : undefined}
            />
          </button>
          {editingId === node.id ? (
            <InlineInput initial={node.name} onSubmit={(name) => rename(node.id, name)} onCancel={() => setEditingId(null)} />
          ) : (
            <button
              type="button"
              onDoubleClick={() => setEditingId(node.id)}
              onClick={() => node.children.length > 0 && toggleExpand(node.id)}
              title="Doble clic para renombrar"
              className={clsx(
                'min-w-0 flex-1 truncate rounded px-1 text-left',
                isFacet ? 'font-display text-sm font-semibold tracking-wide text-gold-200' : 'text-sm text-parchment-100',
              )}
            >
              {node.name}
              {node.children.length > 0 && <span className="ml-1.5 text-[10px] font-normal text-parchment-500">{node.children.length}</span>}
            </button>
          )}
          {isFacet && editingId !== node.id && (
            <span className="hidden shrink-0 rounded border border-gold-700/50 px-1 text-[9px] font-bold uppercase tracking-wider text-gold-400 sm:inline">Faceta</span>
          )}
          {busy ? (
            <Spinner size="xs" className="mx-1" />
          ) : (
            <div className="flex shrink-0 items-center opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
              <RowAction title="Renombrar" onClick={() => setEditingId(node.id)} icon={<Pencil />} />
              <RowAction
                title={isFacet ? 'Añadir valor' : 'Añadir subcategoría'}
                onClick={() => {
                  setAddingTo(node.id);
                  expand(node.id);
                }}
                icon={<Plus />}
              />
              <RowAction title="Subir" disabled={pos <= 0} onClick={() => reorder(node, -1)} icon={<ArrowUp />} />
              <RowAction title="Bajar" disabled={pos < 0 || pos >= sibs.length - 1} onClick={() => reorder(node, 1)} icon={<ArrowDown />} />
              <RowAction title="Mover a…" onClick={openPopover('move', node.id)} icon={<CornerDownRight />} />
              <RowAction title="Eliminar" danger onClick={() => void remove(node)} icon={<Trash2 />} />
            </div>
          )}
        </div>
        {open && (
          <ul>
            {node.children.map((c) => renderNode(c, depth + 1))}
            {addingTo === node.id && (
              <li className="flex items-center gap-1.5 py-1 pr-1.5" style={{ paddingLeft: 4 + (depth + 1) * 18 + 24 }}>
                <InlineInput
                  placeholder={isFacet ? 'Nuevo valor…' : 'Nueva subcategoría…'}
                  onSubmit={(name) => createChild(node.id, name)}
                  onCancel={() => setAddingTo(null)}
                />
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-lg border border-sky-500/25 bg-sky-500/[0.06] px-3 py-2 text-xs leading-relaxed text-parchment-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
        <span>
          Las categorías raíz son <strong>facetas</strong> (p. ej. «Hábitat») y sus hijas son los valores, que pueden anidarse. Al filtrar se
          cumple <em>cualquiera</em> dentro de una faceta y <em>todas</em> entre facetas. Doble clic en un nombre para renombrarlo.
        </span>
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void createFacet();
        }}
      >
        <input
          value={newFacet}
          onChange={(e) => setNewFacet(e.target.value)}
          maxLength={60}
          placeholder="Nueva faceta (p. ej. «Región»)…"
          aria-label="Nombre de la nueva faceta"
          className="input flex-1"
        />
        <Button type="submit" variant="secondary" icon={<FolderPlus />} disabled={!newFacet.trim()} loading={busyId === 'new-facet'}>
          Añadir faceta
        </Button>
      </form>

      {!loaded && loading ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" label="Cargando categorías…" showLabel />
        </div>
      ) : tree.length === 0 ? (
        <EmptyState
          compact
          icon={<KindIcon kind={kind} />}
          title="Sin categorías"
          description="Crea la primera faceta para empezar a clasificar."
        />
      ) : (
        <ul className="flex flex-col gap-1">{tree.map((f) => renderNode(f, 0))}</ul>
      )}

      <Popover open={!!popover && !!popoverNode} onClose={() => setPopover(null)} anchorRef={anchorRef} width={popover?.type === 'color' ? 280 : 300}>
        {popover && popoverNode && popover.type === 'icon' && (
          <div className="p-1.5">
            <div className="mb-2 flex items-center gap-2">
              <input
                defaultValue={popoverNode.icon ?? ''}
                maxLength={8}
                placeholder="Emoji"
                aria-label="Emoji personalizado"
                className="input input-sm w-24 text-center text-base"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const v = e.currentTarget.value.trim();
                    setPopover(null);
                    void run(popoverNode.id, () => api.categories.update(popoverNode.id, { icon: v || null }));
                  }
                }}
              />
              <span className="text-[10px] text-parchment-400">Escribe uno y pulsa Intro, o elige:</span>
            </div>
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    setPopover(null);
                    void run(popoverNode.id, () => api.categories.update(popoverNode.id, { icon: em }));
                  }}
                  className={clsx('flex h-8 w-8 items-center justify-center rounded-md text-lg transition hover:bg-ink-700', popoverNode.icon === em && 'bg-gold-500/20')}
                >
                  {em}
                </button>
              ))}
            </div>
            {popoverNode.icon && (
              <button
                type="button"
                className="mt-2 w-full rounded-md px-2 py-1 text-xs text-parchment-300 hover:bg-ink-700"
                onClick={() => {
                  setPopover(null);
                  void run(popoverNode.id, () => api.categories.update(popoverNode.id, { icon: null }));
                }}
              >
                Quitar icono
              </button>
            )}
          </div>
        )}
        {popover && popoverNode && popover.type === 'color' && (
          <div className="p-1.5">
            <ColorEditor
              initial={popoverNode.color ?? '#a8946b'}
              onCommit={(color) => void run(popoverNode.id, () => api.categories.update(popoverNode.id, { color }))}
            />
            {popoverNode.color && (
              <button
                type="button"
                className="mt-2 w-full rounded-md px-2 py-1 text-xs text-parchment-300 hover:bg-ink-700"
                onClick={() => {
                  setPopover(null);
                  void run(popoverNode.id, () => api.categories.update(popoverNode.id, { color: null }));
                }}
              >
                Sin color
              </button>
            )}
          </div>
        )}
        {popover && popoverNode && popover.type === 'move' && (
          <div className="flex max-h-72 flex-col">
            <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-parchment-400">Mover «{popoverNode.name}» a…</div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
              {popoverNode.parentId !== null && (
                <button
                  type="button"
                  onClick={() => moveTo(popoverNode, null)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gold-200 hover:bg-ink-700"
                >
                  <FolderTree className="h-3.5 w-3.5" /> Raíz (convertir en faceta)
                </button>
              )}
              {moveTargets.map(({ node, depth }) => (
                <button
                  key={node.id}
                  type="button"
                  disabled={node.id === popoverNode.parentId}
                  onClick={() => moveTo(popoverNode, node.id)}
                  className="flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm text-parchment-100 hover:bg-ink-700 disabled:cursor-default disabled:opacity-40"
                  style={{ paddingLeft: 8 + depth * 14 }}
                >
                  {node.icon && <span className="text-sm leading-none">{node.icon}</span>}
                  <span className={clsx('truncate', depth === 0 && 'font-semibold text-gold-200')}>{node.name}</span>
                  {node.id === popoverNode.parentId && <span className="ml-auto text-[10px] text-parchment-500">actual</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </Popover>
    </div>
  );
}

function RowAction({ title, onClick, icon, danger, disabled }: { title: string; onClick: (e: MouseEvent<HTMLElement>) => void; icon: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'flex h-6 w-6 items-center justify-center rounded transition disabled:opacity-25 [&>svg]:h-3.5 [&>svg]:w-3.5',
        danger ? 'text-parchment-400 hover:bg-blood-600/20 hover:text-blood-300' : 'text-parchment-400 hover:bg-ink-700 hover:text-parchment-50',
      )}
    >
      {icon}
    </button>
  );
}

/** Color picker that commits after the user stops changing it (the native picker fires continuously). */
function ColorEditor({ initial, onCommit }: { initial: string; onCommit: (color: string) => void }) {
  const [value, setValue] = useState(initial);
  const committed = useRef(initial);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (value === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = value;
      commitRef.current(value);
    }, 450);
    return () => clearTimeout(timer);
  }, [value]);

  // Flush a pending change when the popover closes.
  useEffect(
    () => () => {
      if (valueRef.current !== committed.current) commitRef.current(valueRef.current);
    },
    [],
  );

  return <ColorPicker size="sm" palette={ROULETTE_PALETTE} value={value} onChange={setValue} />;
}
