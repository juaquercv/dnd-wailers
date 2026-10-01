import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  Backpack,
  Camera,
  Coins,
  Crosshair,
  Eye,
  Footprints,
  Gauge,
  Heart,
  NotebookPen,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  Star,
  Swords,
  Trash2,
  UserRound,
  WandSparkles,
} from 'lucide-react';
import {
  formatModifier,
  newId,
  slotsForLevel,
  type HeroSheet as HeroSheetData,
  type LimitedUse,
  type RuleSystem,
} from '@wailers/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { ImageUpload } from '../../components/ui/ImageUpload';
import { Modal } from '../../components/ui/Modal';
import { NumberInput } from '../../components/ui/NumberInput';
import { Select } from '../../components/ui/Select';
import { Stepper } from '../../components/ui/Stepper';
import { Tabs, type TabItem } from '../../components/ui/Tabs';
import { TextArea } from '../../components/ui/TextArea';
import { TextInput } from '../../components/ui/TextInput';
import { formatGold, formatNumber } from '../../lib/format';
import { emitUiEvent } from '../../lib/uiEvents';
import { send, useDraft } from './panels/actions';
import { AbilityGrid } from './panels/AbilityGrid';
import {
  actsAsOwner,
  canEditResources,
  canSeeInventoryOf,
  heroTokenOf,
  playerOfHero,
  usePanelContext,
  viewerOwnsHero,
} from './panels/context';
import { HeroChips } from './panels/HeroChips';
import { HpBar } from './panels/HpBar';
import { ManaBar, SlotPips, UsePips } from './panels/Resources';
import { SpellList } from './panels/SpellList';
import { StatusIcons, StatusMenuButton } from './panels/Statuses';
import { InventoryList } from './InventoryList';

export interface HeroSheetProps {
  heroId: string;
}

type SheetTab = 'stats' | 'inventory' | 'powers' | 'notes';

/**
 * Full live character sheet. Editing rights come from the role and the campaign rules:
 * DM edits everything; the owner edits notes and (when allowed) mana / slots / limited uses.
 */
export function HeroSheet({ heroId }: HeroSheetProps) {
  const ctx = usePanelContext();
  const { state, rules } = ctx;
  const [tab, setTab] = useState<SheetTab>('stats');
  const [imageOpen, setImageOpen] = useState(false);
  const hero = state?.heroes[heroId] ?? null;

  if (!state || !hero) {
    return <EmptyState compact icon={<UserRound />} title="Héroe no disponible" description="Esta hoja ya no forma parte de la partida." />;
  }

  const manage = ctx.canManage;
  const owner = actsAsOwner(ctx, hero);
  const ownsView = viewerOwnsHero(ctx, hero);
  const resEdit = canEditResources(ctx, hero);
  const player = playerOfHero(state, hero.id);
  const token = heroTokenOf(state, hero.id);
  const d = hero.data;
  const showNotes = manage || ownsView;
  const showPowers = d.spells.length > 0 || manage;
  const invVisible = canSeeInventoryOf(ctx, hero);
  const adjust = (field: Parameters<typeof adjustHero>[1], delta: number) => adjustHero(hero.id, field, delta);

  const tabs: TabItem<SheetTab>[] = [
    { id: 'stats', label: 'Atributos', icon: <Gauge /> },
    { id: 'inventory', label: 'Inventario', icon: <Backpack />, badge: invVisible && d.inventory.length > 0 ? d.inventory.length : undefined },
  ];
  if (showPowers) tabs.push({ id: 'powers', label: 'Poderes', icon: <WandSparkles />, badge: d.spells.length > 0 ? d.spells.length : undefined });
  if (showNotes) tabs.push({ id: 'notes', label: 'Notas', icon: <NotebookPen /> });
  const activeTab: SheetTab = tabs.some((t) => t.id === tab) ? tab : 'stats';

  return (
    <div className="space-y-3">
      {/* Header ----------------------------------------------------------- */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <Avatar name={hero.name} imageUrl={hero.imageUrl} color={player?.color} size="xl" ring status={player ? (player.connected ? 'online' : 'offline') : null} />
          {manage && (
            <button
              type="button"
              onClick={() => setImageOpen(true)}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-parchment-50 opacity-0 transition hover:opacity-100 focus:opacity-100"
              title="Cambiar retrato"
              aria-label="Cambiar retrato"
            >
              <Camera className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {manage ? (
            <EditableName value={hero.name} onCommit={(name) => void send('hero:update', { heroId: hero.id, patch: { name } })} />
          ) : (
            <h3 className="truncate font-display text-lg font-bold leading-7 text-gold-100">{hero.name}</h3>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {manage ? (
              <span className="inline-flex items-center gap-1.5 text-parchment-300">
                Nivel
                <Stepper size="sm" value={hero.level} min={1} max={Math.max(20, rules.heroCreation.maxLevel)} onChange={(_n, delta) => void adjust('level', delta)} title="Nivel" />
              </span>
            ) : (
              <span className="rounded-full border border-gold-700/60 bg-gold-500/10 px-2 py-0.5 font-semibold text-gold-200">Nivel {hero.level}</span>
            )}
            {player && (
              <span className="inline-flex items-center gap-1 truncate" style={{ color: player.color }}>
                <span className={clsx('h-1.5 w-1.5 rounded-full', player.connected ? 'bg-emerald-400' : 'bg-ink-400')} />
                {player.name}
              </span>
            )}
            {token && (
              <IconButton icon={<Crosshair />} title="Centrar el mapa en su ficha" size="xs" onClick={() => emitUiEvent('center-on-token', { tokenId: token.id })} />
            )}
          </div>
          <HeroChips categoryIds={hero.categoryIds} className="mt-1.5" size="xs" />
        </div>
      </div>

      {/* Hit points ------------------------------------------------------- */}
      <Block icon={<Heart />} title="Puntos de vida" tone="blood">
        <HpBar
          size="lg"
          info={{ hp: d.hp.current, maxHp: d.hp.max, temp: d.hp.temp || 0, ratio: d.hp.max > 0 ? Math.min(1, Math.max(0, d.hp.current / d.hp.max)) : null }}
        />
        {manage && (
          <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
            <Stepper label="Actuales" size="sm" tone="hp" value={d.hp.current} min={0} max={d.hp.max} onChange={(_n, delta) => void adjust('hp', delta)} />
            <Stepper label="Máximos" size="sm" tone="hp" value={d.hp.max} min={1} onChange={(_n, delta) => void adjust('maxHp', delta)} />
            <Stepper label="Temporales" size="sm" value={d.hp.temp || 0} min={0} onChange={(_n, delta) => void adjust('tempHp', delta)} />
          </div>
        )}
      </Block>

      {/* Combat stats ----------------------------------------------------- */}
      {(rules.showAc || rules.showSpeed || rules.showInitiative) && (
        <div className="grid grid-cols-3 gap-1.5">
          {rules.showAc && (
            <StatCard icon={<Shield />} label="CA">
              {manage ? (
                <Stepper size="sm" value={d.ac} min={0} max={40} onChange={(_n, delta) => void adjust('ac', delta)} title="Clase de armadura" />
              ) : (
                <span className="font-display text-xl font-bold text-parchment-50">{d.ac}</span>
              )}
            </StatCard>
          )}
          {rules.showSpeed && (
            <StatCard icon={<Footprints />} label="Velocidad">
              {manage ? (
                <InlineText value={d.speed} placeholder="9 m" onCommit={(speed) => void send('hero:update', { heroId: hero.id, patch: { speed } })} />
              ) : (
                <span className="truncate text-sm font-semibold text-parchment-50">{d.speed || '—'}</span>
              )}
            </StatCard>
          )}
          {rules.showInitiative && (
            <StatCard icon={<Swords />} label="Iniciativa">
              {manage ? (
                <InitiativeBonus heroId={hero.id} value={d.initiativeBonus} />
              ) : (
                <span className="font-display text-xl font-bold text-parchment-50">{formatModifier(d.initiativeBonus)}</span>
              )}
            </StatCard>
          )}
        </div>
      )}

      {/* Statuses --------------------------------------------------------- */}
      {(d.statuses.length > 0 || manage) && (
        <div className="flex flex-wrap items-center gap-1">
          <StatusIcons
            statuses={d.statuses}
            labels
            onRemove={manage ? (status) => void send('hero:status', { heroId: hero.id, status, on: false }) : undefined}
          />
          {manage && <StatusMenuButton active={d.statuses} onToggle={(status, on) => void send('hero:status', { heroId: hero.id, status, on })} />}
        </div>
      )}

      {/* Resources -------------------------------------------------------- */}
      <ResourcesBlock hero={hero} rules={rules} resEdit={resEdit} manage={manage} />

      {/* Wealth & experience ---------------------------------------------- */}
      {(rules.currency.enabled || rules.xpEnabled) && (
        <div className="grid grid-cols-2 gap-1.5">
          {rules.currency.enabled && (
            <StatCard icon={<Coins />} label={rules.currency.name || 'Oro'} tone="gold">
              {manage ? (
                <Stepper
                  size="sm"
                  tone="gold"
                  value={d.gold}
                  min={0}
                  onChange={(_n, delta) => void adjust('gold', delta)}
                  format={(v) => formatGold(v, true, null)}
                  suffix={rules.currency.short}
                  title={rules.currency.name}
                />
              ) : invVisible ? (
                <span className="text-sm font-semibold text-gold-200">{formatGold(d.gold, false, rules.currency.short)}</span>
              ) : (
                <span className="text-xs italic text-parchment-400">Oculto</span>
              )}
            </StatCard>
          )}
          {rules.xpEnabled && (
            <StatCard icon={<Star />} label="Experiencia" tone="xp">
              {manage ? (
                <Stepper size="sm" tone="xp" value={d.xp} min={0} step={10} bigStep={100} onChange={(_n, delta) => void adjust('xp', delta)} format={(v) => formatNumber(v, 0)} title="Puntos de experiencia" />
              ) : (
                <span className="text-sm font-semibold text-emerald-300">{formatNumber(d.xp, 0)} PX</span>
              )}
            </StatCard>
          )}
        </div>
      )}

      {/* Tabs ------------------------------------------------------------- */}
      <div>
        <Tabs<SheetTab> items={tabs} value={activeTab} onChange={setTab} size="sm" aria-label="Secciones de la hoja" />
        <div className="pt-3">
          {activeTab === 'stats' && (
            <div className="space-y-3">
              <AbilityGrid
                attributes={rules.attributes}
                abilities={d.abilities}
                onChange={manage ? (abilities) => void send('hero:update', { heroId: hero.id, patch: { abilities } }) : undefined}
              />
              {manage && <VisionField heroId={hero.id} value={d.visionCells} />}
              {!manage && d.visionCells !== null && (
                <p className="flex items-center gap-1.5 text-xs text-parchment-300">
                  <Eye className="h-3.5 w-3.5 text-gold-400" />
                  Visión: {d.visionCells} casillas
                </p>
              )}
            </div>
          )}
          {activeTab === 'inventory' && <InventoryList heroId={hero.id} />}
          {activeTab === 'powers' && (
            <SpellList hero={hero} rules={rules} canCast={manage || owner} canSpend={resEdit} manage={manage} campaignId={state.campaignId} />
          )}
          {activeTab === 'notes' && <NotesEditor heroId={hero.id} value={d.notes} editable={manage || owner} />}
        </div>
      </div>

      {manage && (
        <Modal open={imageOpen} onClose={() => setImageOpen(false)} title={`Retrato de ${hero.name}`} icon={<Camera />} size="sm">
          <ImageUpload
            value={hero.imageUrl}
            round
            aspect="square"
            onChange={(url) => {
              void send('hero:update', { heroId: hero.id, patch: { imageUrl: url } });
              setImageOpen(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function adjustHero(heroId: string, field: 'hp' | 'tempHp' | 'maxHp' | 'mana' | 'maxMana' | 'gold' | 'xp' | 'level' | 'ac', delta: number) {
  if (delta === 0) return Promise.resolve(true);
  return send('hero:adjust', { heroId, field, delta });
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Block({ icon, title, tone = 'gold', actions, children }: { icon: ReactNode; title: string; tone?: 'gold' | 'blood' | 'arcane'; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-ink-600/70 bg-ink-800/50 px-3 py-2.5">
      <h4
        className={clsx(
          'mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] [&>svg]:h-3.5 [&>svg]:w-3.5',
          tone === 'blood' ? 'text-blood-300' : tone === 'arcane' ? 'text-arcane-300' : 'text-gold-300',
        )}
      >
        {icon}
        <span className="truncate">{title}</span>
        {actions && <span className="ml-auto flex items-center gap-1 normal-case tracking-normal">{actions}</span>}
      </h4>
      {children}
    </section>
  );
}

function StatCard({ icon, label, tone = 'default', children }: { icon: ReactNode; label: string; tone?: 'default' | 'gold' | 'xp'; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 rounded-lg border border-ink-600/70 bg-gradient-to-b from-ink-800 to-ink-900 px-1.5 py-2 text-center">
      <span
        className={clsx(
          'flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] [&>svg]:h-3 [&>svg]:w-3',
          tone === 'gold' ? 'text-gold-400' : tone === 'xp' ? 'text-emerald-400' : 'text-parchment-300',
        )}
      >
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <div className="flex min-h-[1.75rem] max-w-full items-center justify-center">{children}</div>
    </div>
  );
}

function EditableName({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : value;
  const commit = () => {
    setFocused(false);
    const name = text.trim();
    if (name && name !== value) onCommit(name);
  };
  return (
    <input
      value={shown}
      aria-label="Nombre del héroe"
      onFocus={() => {
        setText(value);
        setFocused(true);
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          setText(value);
          setFocused(false);
          e.currentTarget.blur();
        }
      }}
      className="-ml-1 w-full truncate rounded-md border border-transparent bg-transparent px-1 font-display text-lg font-bold leading-7 text-gold-100 transition hover:border-ink-500 focus:border-gold-500 focus:bg-ink-950/60 focus:outline-none"
    />
  );
}

function InlineText({ value, placeholder, onCommit }: { value: string; placeholder?: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  return (
    <input
      value={focused ? text : value}
      placeholder={placeholder}
      aria-label="Velocidad"
      onFocus={() => {
        setText(value);
        setFocused(true);
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const v = text.trim();
        if (v !== value) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className="w-full min-w-0 rounded-md border border-ink-500 bg-ink-950/60 px-1.5 py-0.5 text-center text-sm font-semibold text-parchment-50 focus:border-gold-500 focus:outline-none"
    />
  );
}

function InitiativeBonus({ heroId, value }: { heroId: string; value: number }) {
  const [draft, setDraft] = useDraft(value, (v) => void send('hero:update', { heroId, patch: { initiativeBonus: v } }));
  return <Stepper size="sm" value={draft} min={-10} max={20} onChange={(next) => setDraft(next)} format={formatModifier} title="Bonificador de iniciativa" />;
}

function VisionField({ heroId, value }: { heroId: string; value: number | null }) {
  const [draft, setDraft] = useDraft<number | null>(value, (v) => void send('hero:update', { heroId, patch: { visionCells: v } }), 700);
  return (
    <NumberInput
      nullable
      label="Visión propia (casillas)"
      hint="Vacío = radio de visión de la sesión (p. ej. visión en la oscuridad)."
      size="sm"
      min={0}
      max={60}
      value={draft}
      onChange={setDraft}
    />
  );
}

function NotesEditor({ heroId, value, editable }: { heroId: string; value: string; editable: boolean }) {
  const [draft, setDraft, flush] = useDraft(value, (notes) => void send('hero:update', { heroId, patch: { notes } }), 800);
  if (!editable) {
    return value ? <p className="whitespace-pre-line text-sm leading-relaxed text-parchment-200">{value}</p> : <p className="text-xs italic text-parchment-400">Sin notas.</p>;
  }
  return (
    <TextArea
      value={draft}
      onValueChange={setDraft}
      onBlur={flush}
      rows={6}
      autoResize
      maxRows={18}
      placeholder="Pistas, nombres, deudas pendientes…"
      hint="Se guarda solo mientras escribes."
    />
  );
}

// ---------------------------------------------------------------------------
// Resources by campaign magic mode
// ---------------------------------------------------------------------------

function ResourcesBlock({ hero, rules, resEdit, manage }: { hero: HeroSheetData; rules: RuleSystem; resEdit: boolean; manage: boolean }) {
  const confirm = useConfirm();
  const mode = rules.magic.mode;
  const res = hero.data.resources;
  if (mode === 'none') return null;

  if (mode === 'mana') {
    return (
      <Block icon={<Sparkles />} title={rules.magic.manaName || 'Recurso'} tone="arcane">
        <ManaBar
          name={rules.magic.manaName || 'Recurso'}
          current={res.mana.current}
          max={res.mana.max}
          onDelta={resEdit ? (delta) => void send('hero:mana', { heroId: hero.id, delta }) : undefined}
          onMaxDelta={manage ? (delta) => void adjustHero(hero.id, 'maxMana', delta) : undefined}
        />
      </Block>
    );
  }

  if (mode === 'slots') {
    const recalc = async () => {
      const ok = await confirm({
        title: 'Ajustar espacios al nivel',
        message: `Se recalculan los espacios máximos de ${hero.name} según la tabla de la campaña para el nivel ${hero.level}. Los espacios gastados se conservan.`,
        confirmLabel: 'Ajustar',
      });
      if (!ok) return;
      const slots = slotsForLevel(rules, hero.level).map((s) => {
        const prev = res.slots.find((p) => p.level === s.level);
        return { ...s, used: Math.min(prev?.used ?? 0, s.max) };
      });
      void send('hero:update', { heroId: hero.id, patch: { resources: { ...res, slots } } }, { success: 'Espacios ajustados' });
    };
    return (
      <Block
        icon={<Sparkles />}
        title="Espacios de conjuro"
        tone="arcane"
        actions={manage ? <IconButton icon={<RefreshCw />} title="Ajustar al nivel del héroe" size="xs" onClick={() => void recalc()} /> : undefined}
      >
        <SlotPips slots={res.slots} onUse={resEdit ? (level, delta) => void send('hero:slot', { heroId: hero.id, level, delta }) : undefined} />
      </Block>
    );
  }

  return <UsesBlock hero={hero} resEdit={resEdit} manage={manage} />;
}

function UsesBlock({ hero, resEdit, manage }: { hero: HeroSheetData; resEdit: boolean; manage: boolean }) {
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [max, setMax] = useState(1);
  const [resetOn, setResetOn] = useState<LimitedUse['resetOn']>('long');
  const res = hero.data.resources;

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    const use: LimitedUse = { id: newId('use'), name: n, max: Math.max(1, max), used: 0, resetOn };
    const ok = await send('hero:update', { heroId: hero.id, patch: { resources: { ...res, uses: [...res.uses, use] } } });
    if (ok) {
      setName('');
      setMax(1);
      setAdding(false);
    }
  };

  const remove = async (use: LimitedUse) => {
    const ok = await confirm({ title: 'Quitar uso limitado', message: `Se quitará «${use.name}» de la hoja de ${hero.name}.`, confirmLabel: 'Quitar', danger: true });
    if (ok) void send('hero:update', { heroId: hero.id, patch: { resources: { ...res, uses: res.uses.filter((u) => u.id !== use.id) } } });
  };

  return (
    <Block
      icon={<Sparkles />}
      title="Usos limitados"
      tone="arcane"
      actions={manage && !adding ? <IconButton icon={<Plus />} title="Añadir uso limitado" size="xs" onClick={() => setAdding(true)} /> : undefined}
    >
      <UsePips
        uses={res.uses}
        onUse={resEdit ? (useId, delta) => void send('hero:use', { heroId: hero.id, useId, delta }) : undefined}
        renderActions={manage ? (use) => <IconButton icon={<Trash2 />} title={`Quitar ${use.name}`} size="xs" variant="danger" onClick={() => void remove(use)} /> : undefined}
      />
      {adding && (
        <form
          className="mt-2 grid grid-cols-[1fr_4.5rem] gap-2 rounded-md border border-ink-600 bg-ink-900/60 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <TextInput size="sm" label="Nombre" value={name} onValueChange={setName} placeholder="Furia, Inspiración…" autoFocus />
          <NumberInput size="sm" label="Usos" integer min={1} max={20} value={max} onChange={setMax} />
          <Select<LimitedUse['resetOn']>
            size="sm"
            label="Se recupera con"
            value={resetOn}
            onChange={setResetOn}
            options={[
              { value: 'short', label: 'Descanso corto' },
              { value: 'long', label: 'Descanso largo' },
            ]}
            containerClassName="col-span-2"
          />
          <div className="col-span-2 flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button size="sm" variant="primary" type="submit" disabled={!name.trim()}>
              Añadir
            </Button>
          </div>
        </form>
      )}
    </Block>
  );
}
