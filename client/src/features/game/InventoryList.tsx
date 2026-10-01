import { useMemo, useState, type DragEvent, type MouseEvent } from 'react';
import clsx from 'clsx';
import {
  ArrowLeftRight,
  Backpack,
  Coins,
  EyeOff,
  Gift,
  Handshake,
  Minus,
  Ellipsis,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Scale,
  Shield,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { inventoryLoad, RARITY_INFO, type HeroSheet, type InventoryItem, type LibraryEntry } from '@wailers/shared';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useContextMenu, type ContextMenuItem } from '../../components/ui/ContextMenu';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { withAlpha } from '../../components/ui/Badge';
import { formatGold, formatNumber, formatWeight } from '../../lib/format';
import { setItemDrag } from '../../lib/dnd';
import { send, sendAll, useDraft } from './panels/actions';
import { AddItemModal } from './panels/AddItemModal';
import { actsAsOwner, canSeeInventoryOf, partyMembers, usePanelContext, type PanelContext } from './panels/context';
import { useItemDropTarget } from './panels/itemDrop';
import { draftFromItem, ItemFormModal, type ItemDraft } from './panels/ItemForm';
import { TradeDialog } from './TradeDialog';

export interface InventoryListProps {
  heroId?: string;
  tokenId?: string;
  readOnly?: boolean;
}

type Source = { kind: 'hero'; hero: HeroSheet } | { kind: 'loot'; tokenId: string; tokenName: string };

/**
 * Hero inventory or token loot. DM: quantities, edit, remove, give, drag & drop, "Añadir objeto".
 * Owner (player): read-only with "Ofrecer intercambio". Nothing is ever applied automatically.
 */
export function InventoryList({ heroId, tokenId, readOnly = false }: InventoryListProps) {
  const ctx = usePanelContext();
  const { state, rules } = ctx;
  const confirm = useConfirm();
  const hero = heroId ? state?.heroes[heroId] ?? null : null;
  const token = !heroId && tokenId ? state?.tokens[tokenId] ?? null : null;
  const source: Source | null = hero ? { kind: 'hero', hero } : token ? { kind: 'loot', tokenId: token.id, tokenName: token.name } : null;
  const manage = ctx.canManage && !readOnly;
  const owner = hero ? actsAsOwner(ctx, hero) : false;
  const visible = hero ? canSeeInventoryOf(ctx, hero) : ctx.canManage;
  const items = hero ? hero.data.inventory : token ? token.loot : [];
  const currencyShort = rules.currency.short || 'po';

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [trade, setTrade] = useState<{ itemId: string | null } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const dropTarget = hero ? { heroId: hero.id } : token ? { tokenId: token.id } : {};
  const { over, dropProps } = useItemDropTarget(dropTarget, manage && !!source);

  const canTrade = useMemo(() => {
    if (!owner || !state || !hero) return false;
    return Object.values(state.players).some((p) => p.userId !== ctx.viewerId && p.heroId && p.heroId !== hero.id && state.heroes[p.heroId]);
  }, [owner, state, hero, ctx.viewerId]);

  if (!state || !source) {
    return <EmptyState compact icon={<Package />} title="No disponible" description="Este inventario ya no está en la partida." />;
  }

  if (!visible) {
    return (
      <EmptyState
        compact
        icon={<EyeOff />}
        title={source.kind === 'hero' ? 'Inventario oculto' : 'Botín desconocido'}
        description={source.kind === 'hero' ? 'El DM no permite ver los inventarios de otros héroes.' : 'Solo el DM conoce lo que lleva encima.'}
      />
    );
  }

  const removeItem = async (item: InventoryItem) => {
    const ok = await confirm({
      title: source.kind === 'hero' ? 'Quitar del inventario' : 'Quitar del botín',
      message: (
        <>
          Se quitará <strong className="text-parchment-50">{item.name}</strong>
          {item.quantity > 1 ? ` (×${item.quantity})` : ''} {source.kind === 'hero' ? `de ${source.hero.name}` : `de ${source.tokenName}`}.
        </>
      ),
      confirmLabel: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    if (source.kind === 'hero') await send('inventory:remove', { heroId: source.hero.id, itemId: item.id });
    else await send('loot:remove', { tokenId: source.tokenId, itemId: item.id });
  };

  /** Loot has no update event: replace the entry (remove + register again with the new values). */
  const replaceLoot = (item: InventoryItem, draft: ItemDraft) => {
    if (source.kind !== 'loot') return Promise.resolve(false);
    const tokenIdValue = source.tokenId;
    return sendAll([
      () => send('loot:remove', { tokenId: tokenIdValue, itemId: item.id }),
      () => send('loot:add', { tokenId: tokenIdValue, item: { ...draft, entryId: item.entryId }, quantity: draft.quantity }),
    ]);
  };

  const setQuantity = async (item: InventoryItem, quantity: number) => {
    if (quantity <= 0) {
      await removeItem(item);
      return;
    }
    if (source.kind === 'hero') await send('inventory:update', { heroId: source.hero.id, itemId: item.id, patch: { quantity } });
    else await replaceLoot(item, { ...draftFromItem(item), quantity });
  };

  const saveEdit = async (draft: ItemDraft): Promise<boolean> => {
    if (!editing) return false;
    if (source.kind === 'hero') return send('inventory:update', { heroId: source.hero.id, itemId: editing.id, patch: draft });
    return replaceLoot(editing, draft);
  };

  const addEntry = (entry: LibraryEntry, quantity: number) =>
    source.kind === 'hero'
      ? send('inventory:add', { heroId: source.hero.id, entryId: entry.id, quantity }, { success: `${entry.name} añadido a ${source.hero.name}` })
      : send('loot:add', { tokenId: source.tokenId, entryId: entry.id, quantity }, { success: `${entry.name} registrado como botín` });

  const addCustom = (draft: ItemDraft) =>
    source.kind === 'hero'
      ? send('inventory:add', { heroId: source.hero.id, item: draft, quantity: draft.quantity }, { success: `${draft.name} añadido a ${source.hero.name}` })
      : send('loot:add', { tokenId: source.tokenId, item: draft, quantity: draft.quantity }, { success: `${draft.name} registrado como botín` });

  const totalValue = items.reduce((sum, it) => sum + (it.value || 0) * it.quantity, 0);
  const from = source.kind === 'hero' ? { heroId: source.hero.id } : { tokenId: source.tokenId };

  return (
    <div
      {...dropProps}
      className={clsx(
        'relative rounded-lg transition',
        over && 'bg-gold-500/5 ring-2 ring-gold-400/60 ring-offset-2 ring-offset-ink-900',
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-parchment-300">
          {source.kind === 'hero' ? <Backpack className="h-3.5 w-3.5 text-gold-400" /> : <Gift className="h-3.5 w-3.5 text-gold-400" />}
          {source.kind === 'hero' ? 'Inventario' : 'Botín registrado'}
          <span className="rounded-full bg-ink-700 px-1.5 text-[10px] font-bold text-parchment-200">{items.length}</span>
        </span>
        {rules.currency.enabled && totalValue > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-parchment-400" title="Valor total">
            <Coins className="h-3 w-3 text-gold-500" />
            {formatGold(totalValue, true, currencyShort)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {canTrade && (
            <Button size="sm" variant="secondary" icon={<Handshake />} onClick={() => setTrade({ itemId: null })}>
              Ofrecer intercambio
            </Button>
          )}
          {manage && (
            <Button size="sm" variant="secondary" icon={<PackagePlus />} onClick={() => setAdding(true)}>
              Añadir objeto
            </Button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div
          className={clsx(
            'rounded-lg border border-dashed px-3 py-5 text-center text-xs',
            over ? 'border-gold-400 text-gold-200' : 'border-ink-500 text-parchment-400',
          )}
        >
          {source.kind === 'hero' ? 'La mochila está vacía.' : 'Sin botín registrado.'}
          {manage && <span className="mt-1 block text-[11px] text-parchment-400/80">Arrastra aquí objetos de la biblioteca o de otros inventarios.</span>}
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <InventoryRow
              key={item.id}
              item={item}
              ctx={ctx}
              source={source}
              from={from}
              manage={manage}
              owner={owner && canTrade}
              currencyShort={currencyShort}
              expanded={expanded === item.id}
              onToggleExpand={() => setExpanded((cur) => (cur === item.id ? null : item.id))}
              onQuantity={(q) => void setQuantity(item, q)}
              onEdit={() => setEditing(item)}
              onRemove={() => void removeItem(item)}
              onOffer={() => setTrade({ itemId: item.id })}
            />
          ))}
        </ul>
      )}

      {over && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-1 flex justify-center">
          <span className="translate-y-full rounded-full border border-gold-500/60 bg-ink-900 px-2 py-0.5 text-[10px] font-semibold text-gold-200 shadow-glow-gold">
            Suelta para {source.kind === 'hero' ? `dárselo a ${source.hero.name}` : 'registrarlo como botín'} (Mayús: solo 1)
          </span>
        </div>
      )}

      {source.kind === 'hero' && <LoadMeter hero={source.hero} ctx={ctx} />}

      {manage && (
        <AddItemModal
          open={adding}
          targetName={source.kind === 'hero' ? source.hero.name : `${source.tokenName} (botín)`}
          campaignId={state.campaignId}
          currencyShort={currencyShort}
          allowEquip={source.kind === 'hero'}
          onClose={() => setAdding(false)}
          onAddEntry={addEntry}
          onAddCustom={addCustom}
        />
      )}
      {manage && editing && (
        <ItemFormModal
          open
          title={`Editar ${editing.name}`}
          initial={draftFromItem(editing)}
          allowEquip={source.kind === 'hero'}
          currencyShort={currencyShort}
          onClose={() => setEditing(null)}
          onSubmit={saveEdit}
        />
      )}
      {trade && <TradeDialog open onClose={() => setTrade(null)} initialItemId={trade.itemId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface InventoryRowProps {
  item: InventoryItem;
  ctx: PanelContext;
  source: Source;
  from: { heroId?: string; tokenId?: string };
  manage: boolean;
  owner: boolean;
  currencyShort: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onQuantity: (quantity: number) => void;
  onEdit: () => void;
  onRemove: () => void;
  onOffer: () => void;
}

function InventoryRow({ item, ctx, source, from, manage, owner, currencyShort, expanded, onToggleExpand, onQuantity, onEdit, onRemove, onOffer }: InventoryRowProps) {
  const menu = useContextMenu();
  const [quantity, setQuantity] = useDraft(item.quantity, onQuantity, 380);
  const rarity = item.rarity ? RARITY_INFO[item.rarity] : null;
  const nameColor = rarity && item.rarity !== 'common' ? rarity.color : undefined;
  const hasDetails = !!(item.description || item.notes);

  const giveTargets = useMemo(() => {
    if (!ctx.state) return [];
    const members = partyMembers(ctx.state).map((m) => m.hero);
    const extra = Object.values(ctx.state.heroes).filter((h) => !members.some((m) => m.id === h.id));
    return [...members, ...extra].filter((h) => source.kind !== 'hero' || h.id !== source.hero.id);
  }, [ctx.state, source]);

  const giveItems = (): ContextMenuItem[] =>
    giveTargets.map((h) => {
      const transfer = (q?: number) =>
        void send('inventory:transfer', { from, to: { heroId: h.id }, itemId: item.id, quantity: q }, { success: `${item.name} → ${h.name}` });
      return item.quantity > 1
        ? {
            label: h.name,
            children: [
              { label: `Todo (×${item.quantity})`, onClick: () => transfer() },
              { label: 'Solo 1', onClick: () => transfer(1) },
            ],
          }
        : { label: h.name, onClick: () => transfer() };
    });

  const menuItems = (): ContextMenuItem[] => {
    if (!manage) return owner ? [{ label: 'Ofrecer en intercambio', icon: <Handshake />, onClick: onOffer }] : [];
    const list: ContextMenuItem[] = [{ heading: true, label: item.name }];
    if (giveTargets.length > 0) {
      list.push({
        label: source.kind === 'hero' ? 'Dar a…' : 'Entregar a…',
        icon: <ArrowLeftRight />,
        children: giveItems(),
      });
    }
    list.push({ label: 'Editar…', icon: <Pencil />, onClick: onEdit });
    if (source.kind === 'hero') {
      list.push({
        label: item.equipped ? 'Desequipar' : 'Equipar',
        icon: <Shield />,
        onClick: () => void send('inventory:update', { heroId: source.hero.id, itemId: item.id, patch: { equipped: !item.equipped } }),
      });
    }
    list.push({ separator: true });
    if (item.quantity > 1) list.push({ label: 'Quitar uno', icon: <Minus />, onClick: () => setQuantity(item.quantity - 1) });
    list.push({ label: source.kind === 'hero' ? 'Quitar del inventario' : 'Quitar del botín', icon: <Trash2 />, danger: true, onClick: onRemove });
    return list;
  };

  const openMenu = (e: MouseEvent) => {
    const items = menuItems();
    if (items.length === 0) return;
    menu.open(e, items);
  };

  const openMenuAtButton = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    menu.openAt(r.right - 192, r.bottom + 4, menuItems());
  };

  const onDragStart = (e: DragEvent<HTMLLIElement>) => {
    setItemDrag(e, { itemId: item.id, from });
  };

  const unitWeight = item.weight || 0;
  const unitValue = item.value || 0;

  return (
    <li
      draggable={manage}
      onDragStart={manage ? onDragStart : undefined}
      onContextMenu={manage || owner ? openMenu : undefined}
      className={clsx(
        'group rounded-lg border bg-ink-800/60 transition',
        expanded ? 'border-gold-700/50 bg-ink-800' : 'border-ink-600/60 hover:border-ink-500 hover:bg-ink-800/90',
        manage && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <ItemThumb item={item} />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          title={hasDetails ? 'Ver detalles' : item.name}
        >
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-parchment-100" style={nameColor ? { color: nameColor } : undefined}>
              {item.name}
            </span>
            {item.equipped && (
              <span title="Equipado" className="shrink-0 text-gold-400">
                <Shield className="h-3 w-3" fill="currentColor" fillOpacity={0.25} />
              </span>
            )}
          </span>
          <span className="flex items-center gap-2 text-[10px] text-parchment-400">
            {unitWeight > 0 && (
              <span className="inline-flex items-center gap-0.5" title={`Peso total: ${formatWeight(unitWeight * item.quantity)}`}>
                <Scale className="h-2.5 w-2.5" />
                {formatWeight(unitWeight)}
              </span>
            )}
            {ctx.rules.currency.enabled && unitValue > 0 && (
              <span className="inline-flex items-center gap-0.5" title={`Valor total: ${formatGold(unitValue * item.quantity, false, currencyShort)}`}>
                <Coins className="h-2.5 w-2.5" />
                {formatGold(unitValue, true, currencyShort)}
              </span>
            )}
            {rarity && <span style={{ color: rarity.color }}>{rarity.label}</span>}
          </span>
        </button>

        {manage ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded text-parchment-400 opacity-0 transition hover:bg-ink-600 hover:text-parchment-50 focus:opacity-100 group-hover:opacity-100"
              onClick={() => (quantity <= 1 ? onRemove() : setQuantity(quantity - 1))}
              title={quantity <= 1 ? 'Quitar' : 'Quitar uno'}
              aria-label="Quitar uno"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="min-w-[2rem] text-center text-xs font-semibold tabular-nums text-parchment-100">×{formatNumber(quantity, 0)}</span>
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded text-parchment-400 opacity-0 transition hover:bg-ink-600 hover:text-parchment-50 focus:opacity-100 group-hover:opacity-100"
              onClick={() => setQuantity(quantity + 1)}
              title="Añadir uno"
              aria-label="Añadir uno"
            >
              <Plus className="h-3 w-3" />
            </button>
            <IconButton icon={<Ellipsis />} title="Acciones" size="xs" onClick={openMenuAtButton} />
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            {item.quantity !== 1 && <span className="text-xs font-semibold tabular-nums text-parchment-200">×{formatNumber(item.quantity, 0)}</span>}
            {owner && (
              <IconButton
                icon={<Handshake />}
                title="Ofrecer en intercambio"
                size="xs"
                className="opacity-60 group-hover:opacity-100"
                onClick={onOffer}
              />
            )}
          </div>
        )}
      </div>
      {expanded && (
        <div className="animate-fade-in space-y-1 border-t border-ink-600/60 px-3 py-2 text-xs leading-relaxed text-parchment-300">
          {item.description ? <p className="whitespace-pre-line">{item.description}</p> : <p className="italic text-parchment-400">Sin descripción.</p>}
          {item.notes && (
            <p className="text-parchment-200">
              <span className="font-semibold text-gold-300">Notas: </span>
              {item.notes}
            </p>
          )}
          {(unitWeight > 0 || unitValue > 0) && item.quantity > 1 && (
            <p className="text-[11px] text-parchment-400">
              Total: {formatWeight(unitWeight * item.quantity)}
              {ctx.rules.currency.enabled ? ` · ${formatGold(unitValue * item.quantity, false, currencyShort)}` : ''}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function ItemThumb({ item }: { item: InventoryItem }) {
  const [broken, setBroken] = useState(false);
  const color = item.rarity ? RARITY_INFO[item.rarity].color : '#a8946b';
  if (item.imageUrl && !broken) {
    return (
      <img
        src={item.imageUrl}
        alt=""
        draggable={false}
        onError={() => setBroken(true)}
        className="h-8 w-8 shrink-0 rounded-md border object-cover"
        style={{ borderColor: withAlpha(color, 0.6) }}
      />
    );
  }
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border"
      style={{ color, borderColor: withAlpha(color, 0.5), backgroundColor: withAlpha(color, 0.1) }}
    >
      <Package className="h-4 w-4" />
    </span>
  );
}

/** Carried load vs the campaign limit (warning only — never blocks). */
function LoadMeter({ hero, ctx }: { hero: HeroSheet; ctx: PanelContext }) {
  const inv = ctx.rules.inventory;
  const load = inventoryLoad(hero.data);
  if (inv.mode === 'none') {
    if (load.weight <= 0) return null;
    return (
      <p className="mt-2 flex items-center gap-1 text-[11px] text-parchment-400">
        <Scale className="h-3 w-3" /> Peso total: {formatWeight(load.weight)}
      </p>
    );
  }
  const used = inv.mode === 'weight' ? load.weight : load.slots;
  const limit = inv.mode === 'weight' ? inv.maxWeight : inv.maxSlots;
  const ratio = limit > 0 ? used / limit : 0;
  const over = limit > 0 && used > limit;
  const label =
    inv.mode === 'weight'
      ? `${formatNumber(load.weight)} / ${formatNumber(limit)} kg`
      : `${formatNumber(load.slots, 0)} / ${formatNumber(limit, 0)} espacios`;
  return (
    <div className="mt-2.5" title={over ? 'Sobrecargado: el DM decide las consecuencias' : 'Carga'}>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className={clsx('flex items-center gap-1 font-semibold uppercase tracking-wider', over ? 'text-blood-400' : 'text-parchment-400')}>
          {over ? <TriangleAlert className="h-3 w-3" /> : <Scale className="h-3 w-3" />}
          {over ? 'Sobrecargado' : 'Carga'}
        </span>
        <span className={clsx('tabular-nums', over ? 'font-semibold text-blood-300' : 'text-parchment-300')}>{label}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-950/80">
        <div
          className={clsx(
            'h-full rounded-full transition-[width] duration-500',
            over ? 'animate-pulse bg-blood-500' : ratio > 0.85 ? 'bg-gold-500' : 'bg-emerald-500/80',
          )}
          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
        />
      </div>
    </div>
  );
}
