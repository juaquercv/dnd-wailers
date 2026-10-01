import { useState, type ReactNode, type Ref } from 'react';
import clsx from 'clsx';
import { ChevronDown, FilterX, History, Star } from 'lucide-react';
import {
  CREATURE_SIZES,
  RARITIES,
  RARITY_INFO,
  SIZE_INFO,
  SOUND_TYPES,
  SOUND_TYPE_LABELS,
  SPELL_ANIMATIONS,
  SPELL_ANIMATION_LABELS,
  type CampaignSummary,
  type CreatureSize,
  type EntryKind,
  type Rarity,
  type UserStatusDTO,
} from '@wailers/shared';
import { withAlpha } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { NumberInput } from '../../components/ui/NumberInput';
import { SearchInput } from '../../components/ui/SearchInput';
import { Select } from '../../components/ui/Select';
import { Tabs } from '../../components/ui/Tabs';
import { TagInput } from '../../components/ui/TagInput';
import { Toggle } from '../../components/ui/Toggle';
import { CategoryTree } from './CategoryTree';
import {
  RANGES_BY_KIND,
  activeFilterCount,
  clearFilters,
  getRange,
  withDataEquals,
  withRange,
  type FilterState,
  type RangeDef,
} from './filters';

export interface FilterSidebarProps {
  kind: EntryKind;
  filters: FilterState;
  onChange: (next: FilterState) => void;
  campaigns: CampaignSummary[];
  users: UserStatusDTO[];
  /** Render the search box at the top (desktop sidebar). */
  showSearch?: boolean;
  searchRef?: Ref<HTMLInputElement>;
  className?: string;
}

function Section({
  title,
  children,
  defaultOpen = true,
  active = false,
  onClear,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  active?: boolean;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen || active);
  return (
    <section className="border-b border-ink-600/50 pb-3 last:border-b-0">
      <div className="flex items-center gap-2 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-300/90 transition hover:text-gold-200"
        >
          <ChevronDown className={clsx('h-3.5 w-3.5 shrink-0 transition-transform', !open && '-rotate-90')} />
          <span className="truncate">{title}</span>
          {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400 shadow-[0_0_6px_rgba(233,192,99,0.8)]" />}
        </button>
        {active && onClear && (
          <button type="button" onClick={onClear} className="text-[10px] font-semibold uppercase tracking-wider text-parchment-400 hover:text-gold-200">
            Quitar
          </button>
        )}
      </div>
      {open && <div className="animate-fade-in">{children}</div>}
    </section>
  );
}

function ChipToggle({
  active,
  onClick,
  color,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  color?: string;
  children: ReactNode;
  title?: string;
}) {
  const c = color ?? '#e9c063';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition active:scale-95',
        !active && 'border-ink-500 bg-ink-800/80 text-parchment-300 hover:border-ink-400 hover:text-parchment-100',
      )}
      style={active ? { borderColor: withAlpha(c, 0.7), backgroundColor: withAlpha(c, 0.18), color: c, boxShadow: `0 0 12px -4px ${withAlpha(c, 0.8)}` } : undefined}
    >
      {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c }} />}
      {children}
    </button>
  );
}

function RangeField({ def, filters, onChange }: { def: RangeDef; filters: FilterState; onChange: (f: FilterState) => void }) {
  const { min, max } = getRange(filters, def.key);
  const invalid = min !== null && max !== null && min > max;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-medium text-parchment-300">{def.label}</span>
        {(min !== null || max !== null) && (
          <button
            type="button"
            onClick={() => onChange(withRange(filters, def.key, null, null))}
            className="text-[10px] text-parchment-400 hover:text-gold-200"
          >
            Quitar
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <NumberInput
          nullable
          size="sm"
          value={min}
          min={0}
          integer={def.integer}
          placeholder="Mín."
          suffix={def.suffix}
          aria-label={`${def.label} mínimo`}
          containerClassName="flex-1"
          onChange={(v) => onChange(withRange(filters, def.key, v, max))}
        />
        <span className="text-parchment-500">–</span>
        <NumberInput
          nullable
          size="sm"
          value={max}
          min={0}
          integer={def.integer}
          placeholder="Máx."
          suffix={def.suffix}
          aria-label={`${def.label} máximo`}
          containerClassName="flex-1"
          onChange={(v) => onChange(withRange(filters, def.key, min, v))}
        />
      </div>
      {invalid ? (
        <p className="mt-1 text-[10px] text-blood-300">El mínimo es mayor que el máximo.</p>
      ) : (
        def.hint && <p className="mt-1 text-[10px] text-parchment-500">{def.hint}</p>
      )}
    </div>
  );
}

/** Left sidebar with every library filter for one kind. */
export function FilterSidebar({ kind, filters, onChange, campaigns, users, showSearch = true, searchRef, className }: FilterSidebarProps) {
  const count = activeFilterCount(filters, kind);
  const data = filters.dataEquals ?? {};
  const ranges = RANGES_BY_KIND[kind];
  const rangesActive = ranges.some((r) => {
    const v = getRange(filters, r.key);
    return v.min !== null || v.max !== null;
  });

  const toggleIn = <T extends string>(list: T[] | undefined, value: T): T[] =>
    list?.includes(value) ? list.filter((v) => v !== value) : [...(list ?? []), value];

  const npcMode = data.isNpc === true ? 'npc' : data.isNpc === false ? 'enemy' : 'all';
  const kindSpecificActive =
    (filters.rarity?.length ?? 0) > 0 || (filters.size?.length ?? 0) > 0 || Object.keys(data).length > 0;

  return (
    <div className={clsx('flex flex-col', className)}>
      {showSearch && (
        <div className="pb-3">
          <SearchInput
            ref={searchRef}
            value={filters.q ?? ''}
            onChange={(q) => onChange({ ...filters, q })}
            debounceMs={250}
            placeholder="Buscar por nombre, etiqueta…"
            aria-label="Buscar en la biblioteca"
          />
          <p className="mt-1.5 px-0.5 text-[10px] leading-snug text-parchment-500">
            Tolera erratas, tildes y mayúsculas. Busca también en descripción, etiquetas y categorías.
          </p>
        </div>
      )}

      <Section
        title="Categorías"
        active={(filters.categoryIds?.length ?? 0) > 0}
        onClear={() => onChange({ ...filters, categoryIds: [] })}
      >
        <CategoryTree
          key={kind}
          kind={kind}
          mode="filter"
          value={filters.categoryIds ?? []}
          onChange={(categoryIds) => onChange({ ...filters, categoryIds })}
          defaultExpanded="first"
        />
        <p className="mt-2 text-[10px] leading-snug text-parchment-500">
          Dentro de una misma faceta basta con cumplir una opción; entre facetas se deben cumplir todas. Incluye subcategorías.
        </p>
      </Section>

      <Section title="Etiquetas" active={(filters.tags?.length ?? 0) > 0} onClear={() => onChange({ ...filters, tags: [] })}>
        <TagInput
          size="sm"
          kind={kind}
          value={filters.tags ?? []}
          onChange={(tags) => onChange({ ...filters, tags })}
          placeholder="#etiqueta…"
          hint="Deben coincidir todas."
        />
      </Section>

      {kind !== 'zone' && kind !== 'hero' && (
        <Section
          title={kind === 'item' ? 'Rareza y propiedades' : kind === 'creature' ? 'Tamaño y tipo' : kind === 'spell' ? 'Propiedades' : 'Tipo de sonido'}
          active={kindSpecificActive}
          onClear={() => {
            const next = { ...filters };
            delete next.rarity;
            delete next.size;
            delete next.dataEquals;
            onChange(next);
          }}
        >
          {kind === 'item' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                {RARITIES.map((r: Rarity) => (
                  <ChipToggle
                    key={r}
                    active={filters.rarity?.includes(r) ?? false}
                    color={RARITY_INFO[r].color}
                    onClick={() => onChange({ ...filters, rarity: toggleIn(filters.rarity, r) })}
                  >
                    {RARITY_INFO[r].label}
                  </ChipToggle>
                ))}
              </div>
              <Toggle
                size="sm"
                label="Solo mágicos"
                checked={data.magic === true}
                onChange={(v) => onChange(withDataEquals(filters, 'magic', v ? true : null))}
              />
              <Toggle
                size="sm"
                label="Requiere sintonización"
                checked={data.attunement === true}
                onChange={(v) => onChange(withDataEquals(filters, 'attunement', v ? true : null))}
              />
            </div>
          )}
          {kind === 'creature' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                {CREATURE_SIZES.map((s: CreatureSize) => (
                  <ChipToggle
                    key={s}
                    active={filters.size?.includes(s) ?? false}
                    onClick={() => onChange({ ...filters, size: toggleIn(filters.size, s) })}
                  >
                    {SIZE_INFO[s].label}
                  </ChipToggle>
                ))}
              </div>
              <Tabs
                variant="pills"
                size="sm"
                fill
                aria-label="Enemigos o NPCs"
                value={npcMode}
                onChange={(v) => onChange(withDataEquals(filters, 'isNpc', v === 'all' ? null : v === 'npc'))}
                items={[
                  { id: 'all', label: 'Todos' },
                  { id: 'enemy', label: 'Enemigos' },
                  { id: 'npc', label: 'Solo NPCs' },
                ]}
              />
            </div>
          )}
          {kind === 'spell' && (
            <div className="flex flex-col gap-3">
              <Select<string | null>
                size="sm"
                label="Animación"
                value={typeof data.animation === 'string' ? data.animation : null}
                onChange={(v) => onChange(withDataEquals(filters, 'animation', v))}
                options={[
                  { value: null, label: 'Cualquiera' },
                  ...SPELL_ANIMATIONS.map((a) => ({ value: a, label: SPELL_ANIMATION_LABELS[a] })),
                ]}
              />
              <Toggle
                size="sm"
                label="Requiere concentración"
                checked={data.concentration === true}
                onChange={(v) => onChange(withDataEquals(filters, 'concentration', v ? true : null))}
              />
            </div>
          )}
          {kind === 'sound' && (
            <div className="flex flex-col gap-3">
              <Select<string | null>
                size="sm"
                aria-label="Tipo de sonido"
                value={typeof data.soundType === 'string' ? data.soundType : null}
                onChange={(v) => onChange(withDataEquals(filters, 'soundType', v))}
                options={[{ value: null, label: 'Todos los tipos' }, ...SOUND_TYPES.map((t) => ({ value: t, label: SOUND_TYPE_LABELS[t] }))]}
              />
              <Toggle
                size="sm"
                label="Solo bucles"
                checked={data.loop === true}
                onChange={(v) => onChange(withDataEquals(filters, 'loop', v ? true : null))}
              />
            </div>
          )}
        </Section>
      )}

      {ranges.length > 0 && (
        <Section
          title="Rangos"
          active={rangesActive}
          onClear={() => onChange(ranges.reduce((f, r) => withRange(f, r.key, null, null), filters))}
        >
          <div className="flex flex-col gap-3">
            {ranges.map((r) => (
              <RangeField key={r.key} def={r} filters={filters} onChange={onChange} />
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Origen"
        active={!!filters.campaignId || !!filters.ownerId}
        onClear={() => {
          const next = { ...filters };
          delete next.campaignId;
          delete next.ownerId;
          onChange(next);
        }}
      >
        <div className="flex flex-col gap-3">
          <Select<string | null>
            size="sm"
            label="Campaña"
            hint="Creado en la campaña o usado en ella."
            value={filters.campaignId ?? null}
            onChange={(v) => {
              const next = { ...filters };
              if (v) next.campaignId = v;
              else delete next.campaignId;
              onChange(next);
            }}
            options={[{ value: null, label: 'Cualquier campaña' }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]}
          />
          {kind === 'hero' && (
            <Select<string | null>
              size="sm"
              label="Jugador"
              value={filters.ownerId ?? null}
              onChange={(v) => {
                const next = { ...filters };
                if (v) next.ownerId = v;
                else delete next.ownerId;
                onChange(next);
              }}
              options={[{ value: null, label: 'Cualquier jugador' }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
            />
          )}
        </div>
      </Section>

      <Section title="Personal" active={!!filters.favoritesOnly || !!filters.recentOnly}>
        <div className="flex flex-col gap-2.5">
          <Toggle
            size="sm"
            label={
              <span className="inline-flex items-center gap-1.5">
                <Star className="h-3 w-3 text-gold-300" /> Solo favoritos
              </span>
            }
            checked={!!filters.favoritesOnly}
            onChange={(v) => {
              const next = { ...filters };
              if (v) next.favoritesOnly = true;
              else delete next.favoritesOnly;
              onChange(next);
            }}
          />
          <Toggle
            size="sm"
            label={
              <span className="inline-flex items-center gap-1.5">
                <History className="h-3 w-3 text-sky-300" /> Usados recientemente
              </span>
            }
            checked={!!filters.recentOnly}
            onChange={(v) => {
              const next = { ...filters };
              if (v) next.recentOnly = true;
              else delete next.recentOnly;
              onChange(next);
            }}
          />
        </div>
      </Section>

      <div className="pt-3">
        <Button
          variant="ghost"
          size="sm"
          block
          icon={<FilterX />}
          disabled={count === 0}
          onClick={() => onChange(clearFilters(filters))}
        >
          {count > 0 ? `Limpiar filtros (${count})` : 'Sin filtros activos'}
        </Button>
      </div>
    </div>
  );
}
