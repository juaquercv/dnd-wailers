import { useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { BedDouble, ChevronDown, Coins, Dices, Footprints, Lock, Shield, Sparkles, Star, Tent, Users } from 'lucide-react';
import {
  economyApplies,
  effectiveVisibility,
  isHeroTurn,
  type HeroSheet as HeroSheetData,
  type LiveState,
  type RuleSystem,
  type SessionPlayer,
} from '@wailers/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Stepper } from '../../components/ui/Stepper';
import { Toggle } from '../../components/ui/Toggle';
import { toast } from '../../components/ui/toast';
import { formatGold, formatNumber } from '../../lib/format';
import { setForEveryone } from '../visibility/playerVisibility';
import { send } from './panels/actions';
import { CombatBar, hasOwnMoveSetting, setPlayerMove, UsageChip } from './panels/CombatControls';
import { canEditResources, canSeeInventoryOf, partyMembers, usePanelContext, viewerOwnsHero, type PanelContext } from './panels/context';
import { HeroChips } from './panels/HeroChips';
import { HpBar } from './panels/HpBar';
import { useItemDropTarget } from './panels/itemDrop';
import { ManaBar, SlotPips, UsePips } from './panels/Resources';
import { RollRequestDialog, type RollRequestTarget } from './panels/RollRequestDialog';
import { StatusIcons, StatusMenuButton } from './panels/Statuses';
import { HeroSheet } from './HeroSheet';

/** One card per player with a hero; DM bulk actions (rests, mana regen, roll requests). */
export function PartyPanel() {
  const ctx = usePanelContext();
  const { state, rules } = ctx;
  const confirm = useConfirm();
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rollTargets, setRollTargets] = useState<RollRequestTarget[] | null>(null);

  const members = useMemo(() => (state ? partyMembers(state) : []), [state]);
  const memberIds = members.map((m) => m.hero.id).join('|');

  // Drop selections of heroes that left the party.
  useEffect(() => {
    setSelected((cur) => cur.filter((id) => members.some((m) => m.hero.id === id)));
    // memberIds is the stable signature of `members`.
  }, [memberIds]);

  if (!state) return null;

  if (members.length === 0) {
    return <EmptyState compact icon={<Users />} title="El grupo está vacío" description="Cuando los jugadores elijan héroe aparecerán aquí." />;
  }

  const manage = ctx.canManage;
  const selectedMembers = members.filter((m) => selected.includes(m.hero.id));
  const allSelected = selectedMembers.length === members.length;

  const rest = async (type: 'short' | 'long') => {
    const rule = rules.rest[type];
    if (!rule.enabled || selectedMembers.length === 0) return;
    const ok = await confirm({
      title: rule.label || (type === 'short' ? 'Descanso corto' : 'Descanso largo'),
      icon: type === 'short' ? <Tent className="h-5 w-5" /> : <BedDouble className="h-5 w-5" />,
      message: <RestSummary rules={rules} type={type} heroes={selectedMembers.map((m) => m.hero)} />,
      confirmLabel: 'Descansar',
    });
    if (!ok) return;
    void send('hero:rest', { heroIds: selectedMembers.map((m) => m.hero.id), type }, { success: `${rule.label || 'Descanso'} aplicado` });
  };

  const regen = () => {
    if (selectedMembers.length === 0) return;
    void send(
      'hero:regenMana',
      { heroIds: selectedMembers.map((m) => m.hero.id) },
      { success: `+${rules.magic.manaRegenPerTurn} ${rules.magic.manaName} a ${selectedMembers.length === 1 ? selectedMembers[0]!.hero.name : `${selectedMembers.length} héroes`}` },
    );
  };

  const toggle = (heroId: string, on: boolean) => setSelected((cur) => (on ? [...new Set([...cur, heroId])] : cur.filter((id) => id !== heroId)));

  return (
    // Bulk bar on top and its own scroll area below (when the parent gives a height; otherwise it just grows).
    <div className="flex h-full min-h-0 flex-col gap-3">
      {manage && <CombatBar className="shrink-0" />}
      {manage && <MovementControl state={state} members={members} />}
      {manage && (
        <div className="shrink-0 rounded-lg border border-ink-600/80 bg-ink-900/95 px-2 py-2 shadow-panel">
          <div className="flex items-center gap-2">
            <Checkbox
              size="sm"
              checked={allSelected}
              indeterminate={selectedMembers.length > 0 && !allSelected}
              onChange={(v) => setSelected(v ? members.map((m) => m.hero.id) : [])}
              label={selectedMembers.length > 0 ? `${selectedMembers.length} seleccionados` : 'Seleccionar todos'}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <BulkButton icon={<Tent />} disabled={selectedMembers.length === 0 || !rules.rest.short.enabled} onClick={() => void rest('short')} title={rules.rest.short.enabled ? undefined : 'Desactivado en las reglas de la campaña'}>
              {rules.rest.short.label || 'Descanso corto'}
            </BulkButton>
            <BulkButton icon={<BedDouble />} disabled={selectedMembers.length === 0 || !rules.rest.long.enabled} onClick={() => void rest('long')} title={rules.rest.long.enabled ? undefined : 'Desactivado en las reglas de la campaña'}>
              {rules.rest.long.label || 'Descanso largo'}
            </BulkButton>
            {rules.magic.mode === 'mana' && (
              <BulkButton
                icon={<Sparkles />}
                disabled={selectedMembers.length === 0 || rules.magic.manaRegenPerTurn <= 0}
                onClick={regen}
                title={`+${rules.magic.manaRegenPerTurn} ${rules.magic.manaName} a cada héroe seleccionado`}
              >
                Regenerar {rules.magic.manaName}
              </BulkButton>
            )}
            <BulkButton
              icon={<Dices />}
              disabled={selectedMembers.length === 0}
              onClick={() => setRollTargets(selectedMembers.map((m) => ({ userId: m.player.userId, name: m.player.name, heroName: m.hero.name })))}
            >
              Pedir tirada…
            </BulkButton>
          </div>
        </div>
      )}

      <div className="scroll-thin -mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pb-1">
        {members.map(({ player, hero }) => (
          <PartyCard
            key={hero.id}
            ctx={ctx}
            player={player}
            hero={hero}
            selected={selected.includes(hero.id)}
            onSelect={(on) => toggle(hero.id, on)}
            expanded={expanded === hero.id}
            onToggleExpand={() => setExpanded((cur) => (cur === hero.id ? null : hero.id))}
          />
        ))}
      </div>

      {manage && <RollRequestDialog open={rollTargets !== null} targets={rollTargets ?? []} onClose={() => setRollTargets(null)} />}
    </div>
  );
}

/**
 * DM: freedom of movement for everyone. The switch means the same as "Pueden moverse" in the players tab:
 * it sets the value for everyone and drops personal exceptions; the cards below then add exceptions.
 */
function MovementControl({ state, members }: { state: LiveState; members: { player: SessionPlayer; hero: HeroSheetData }[] }) {
  const all = state.visibility.global.canMoveOwnToken;
  const own = members.filter((m) => hasOwnMoveSetting(state, m.player.userId));
  const [busy, setBusy] = useState(false);
  const apply = async (allow: boolean) => {
    setBusy(true);
    const ok = await setForEveryone('canMoveOwnToken', allow);
    setBusy(false);
    if (ok) toast.success(allow ? 'Ahora todos pueden mover su ficha' : 'Movimiento bloqueado para todos');
  };
  const exceptions = own.map((m) => `${m.player.name} (${effectiveVisibility(state, m.player.userId).canMoveOwnToken ? 'sí' : 'no'})`).join(', ');
  return (
    <div className={clsx('shrink-0 rounded-xl border px-2.5 py-2', all ? 'border-emerald-600/40 bg-emerald-500/5' : 'border-amber-500/50 bg-amber-500/10')}>
      <Toggle
        size="sm"
        labelFirst
        checked={all}
        disabled={busy}
        onChange={(v) => void apply(v)}
        label={
          <span className="flex items-center gap-1.5 font-semibold">
            {all ? <Footprints className="h-3.5 w-3.5 text-emerald-300" aria-hidden /> : <Lock className="h-3.5 w-3.5 text-amber-300" aria-hidden />}
            {all ? (own.length > 0 ? 'Los jugadores pueden mover su ficha*' : 'Los jugadores pueden mover su ficha') : own.length > 0 ? 'Movimiento bloqueado*' : 'Movimiento de los jugadores bloqueado'}
          </span>
        }
        description={
          own.length > 0
            ? `*Excepto quien tiene su propio permiso: ${exceptions}. Este interruptor lo aplica a todos por igual.`
            : 'Para todos a la vez. Cambia a un jugador concreto en su tarjeta.'
        }
      />
      {own.length > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void apply(all)}
          className="mt-1 text-[11px] font-semibold text-gold-300 underline-offset-2 hover:text-gold-200 hover:underline disabled:opacity-50"
        >
          Aplicar a todos por igual
        </button>
      )}
    </div>
  );
}

/** DM: per-player freedom of movement, live. */
function MoveToggle({ state, player }: { state: LiveState; player: SessionPlayer }) {
  const canMove = effectiveVisibility(state, player.userId).canMoveOwnToken;
  const own = hasOwnMoveSetting(state, player.userId);
  return (
    <div
      className={clsx(
        'flex items-center gap-2 rounded-lg border px-2 py-1',
        canMove ? 'border-emerald-600/40 bg-emerald-500/5' : 'border-amber-500/60 bg-amber-500/10',
      )}
    >
      {canMove ? <Footprints className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden /> : <Lock className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />}
      <span className={clsx('min-w-0 flex-1 truncate text-xs font-semibold', canMove ? 'text-emerald-100' : 'text-amber-100')}>
        {canMove ? 'Puede moverse' : 'No puede moverse'}
        <span className="ml-1.5 text-[10px] font-normal text-parchment-400">{own ? '· solo este jugador' : '· como todos'}</span>
      </span>
      <Toggle
        size="sm"
        checked={canMove}
        onChange={(v) => void setPlayerMove(state, player, v)}
        title={canMove ? `Bloquear el movimiento de ${player.name}` : `Dejar que ${player.name} mueva su ficha`}
      />
    </div>
  );
}

function BulkButton({ icon, children, disabled, onClick, title }: { icon: ReactNode; children: ReactNode; disabled?: boolean; onClick: () => void; title?: string }) {
  return (
    <Button size="sm" variant="secondary" icon={icon} disabled={disabled} onClick={onClick} title={title}>
      {children}
    </Button>
  );
}

/** What a rest restores, so the DM confirms knowingly (it is still a manual action). */
function RestSummary({ rules, type, heroes }: { rules: RuleSystem; type: 'short' | 'long'; heroes: HeroSheetData[] }) {
  const r = rules.rest[type];
  const lines: string[] = [];
  if (r.restoreHpPct >= 100) lines.push('Recuperan todos los puntos de vida.');
  else if (r.restoreHpPct > 0) lines.push(`Recuperan el ${r.restoreHpPct} % de sus PV máximos.`);
  if (rules.magic.mode === 'mana' && r.restoreMana !== 'none') {
    lines.push(`${rules.magic.manaName}: se recupera ${r.restoreMana === 'full' ? 'por completo' : 'la mitad del máximo'}.`);
  }
  if (rules.magic.mode === 'slots' && r.restoreSlots) lines.push('Recuperan todos los espacios de conjuro.');
  const hasUses = rules.magic.mode === 'uses' || heroes.some((h) => h.data.resources.uses.length > 0);
  if (r.resetUses && hasUses) lines.push(type === 'long' ? 'Se reinician todos los usos limitados.' : 'Se reinician los usos de descanso corto.');
  if (lines.length === 0) lines.push('Según las reglas de la campaña, este descanso no restaura nada.');
  return (
    <div className="space-y-2">
      <ul className="list-disc space-y-0.5 pl-4">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="text-xs text-parchment-400">
        Héroes: <span className="text-parchment-200">{heroes.map((h) => h.name).join(', ')}</span>
      </p>
    </div>
  );
}

interface PartyCardProps {
  ctx: PanelContext;
  player: SessionPlayer;
  hero: HeroSheetData;
  selected: boolean;
  onSelect: (on: boolean) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

function PartyCard({ ctx, player, hero, selected, onSelect, expanded, onToggleExpand }: PartyCardProps) {
  const { rules } = ctx;
  const manage = ctx.canManage;
  const mine = viewerOwnsHero(ctx, hero);
  const resEdit = canEditResources(ctx, hero);
  const invVisible = canSeeInventoryOf(ctx, hero);
  const { over, dropProps } = useItemDropTarget({ heroId: hero.id }, manage);
  const d = hero.data;
  const adjust = (field: 'hp' | 'tempHp' | 'gold' | 'xp', delta: number) => {
    if (delta !== 0) void send('hero:adjust', { heroId: hero.id, field, delta });
  };
  const mode = rules.magic.mode;
  const state = ctx.state;
  const heroTurn = !!state && state.turn.combat === true && isHeroTurn(state, hero.id);

  return (
    <article
      {...dropProps}
      className={clsx(
        'relative overflow-hidden rounded-xl border bg-gradient-to-b from-ink-800/90 to-ink-900/90 transition',
        selected ? 'border-gold-500/70 shadow-[0_0_0_1px_rgba(233,192,99,0.3)]' : heroTurn ? 'border-gold-600/60' : 'border-ink-600/80',
        over && 'ring-2 ring-gold-400/70 ring-offset-2 ring-offset-ink-900',
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: player.color, boxShadow: `0 0 12px ${player.color}` }} />
      <div className="space-y-2 py-2.5 pl-3.5 pr-2.5">
        <div className="flex items-start gap-2.5">
          {manage && <Checkbox size="sm" checked={selected} onChange={onSelect} className="mt-3" title="Seleccionar para acciones en grupo" />}
          <Avatar name={hero.name} imageUrl={hero.imageUrl} color={player.color} size="lg" ring={mine} status={player.connected ? 'online' : 'offline'} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h4 className="truncate font-display text-[15px] font-semibold leading-5 text-parchment-50" title={hero.name}>
                {hero.name}
              </h4>
              {mine && <span className="shrink-0 rounded-full bg-gold-500/20 px-1.5 text-[10px] font-bold uppercase tracking-wider text-gold-200">Tú</span>}
              {heroTurn && (
                <span className="shrink-0 animate-pop rounded-full border border-gold-400/70 bg-gold-500/20 px-1.5 text-[10px] font-bold uppercase tracking-wider text-gold-100">
                  {mine ? 'Tu turno' : 'Su turno'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="truncate font-medium" style={{ color: player.color }}>
                {player.name}
              </span>
              <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', player.connected ? 'bg-emerald-400' : 'bg-ink-400')} title={player.connected ? 'Conectado' : 'Desconectado'} />
              <span className="shrink-0 rounded border border-gold-700/50 px-1 text-[10px] font-semibold text-gold-300">Nv {hero.level}</span>
              {rules.showAc && (
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-parchment-300" title="Clase de armadura">
                  <Shield className="h-3 w-3" />
                  {d.ac}
                </span>
              )}
            </div>
            <HeroChips heroId={hero.id} categoryIds={hero.categoryIds} maxFacets={2} size="xs" className="mt-1" />
            {state && economyApplies(state) && (
              <UsageChip state={state} heroId={hero.id} heroName={hero.name} manage={manage} current={heroTurn} className="mt-1" />
            )}
          </div>
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            title={expanded ? 'Ocultar ficha' : 'Ver ficha completa'}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-parchment-300 transition hover:bg-ink-700 hover:text-parchment-50"
          >
            <ChevronDown className={clsx('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')} />
          </button>
        </div>

        <div className="space-y-1.5">
          {manage && state && <MoveToggle state={state} player={player} />}
          <HpBar
            size="sm"
            showText={!manage}
            info={{ hp: d.hp.current, maxHp: d.hp.max, temp: d.hp.temp || 0, ratio: d.hp.max > 0 ? Math.min(1, Math.max(0, d.hp.current / d.hp.max)) : null }}
          />
          {manage && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-blood-300">PV</span>
                <Stepper
                  size="sm"
                  tone="hp"
                  value={d.hp.current}
                  min={0}
                  max={d.hp.max}
                  suffix={`/${d.hp.max}`}
                  onChange={(_n, delta) => adjust('hp', delta)}
                  title="PV (Mayús: ±5; clic en el valor para escribirlo)"
                />
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">Temp.</span>
                <Stepper size="sm" value={d.hp.temp || 0} min={0} onChange={(_n, delta) => adjust('tempHp', delta)} format={(v) => `+${v}`} title="PV temporales" />
              </span>
            </div>
          )}

          {(d.statuses.length > 0 || manage) && (
            <div className="flex flex-wrap items-center gap-1">
              <StatusIcons statuses={d.statuses} size="sm" onRemove={manage ? (status) => void send('hero:status', { heroId: hero.id, status, on: false }) : undefined} />
              {manage && <StatusMenuButton active={d.statuses} onToggle={(status, on) => void send('hero:status', { heroId: hero.id, status, on })} />}
            </div>
          )}

          {mode === 'mana' && (
            <ManaBar
              compact
              name={rules.magic.manaName}
              current={d.resources.mana.current}
              max={d.resources.mana.max}
              onDelta={resEdit ? (delta) => void send('hero:mana', { heroId: hero.id, delta }) : undefined}
            />
          )}
          {mode === 'slots' && d.resources.slots.length > 0 && (
            <SlotPips compact slots={d.resources.slots} onUse={resEdit ? (level, delta) => void send('hero:slot', { heroId: hero.id, level, delta }) : undefined} />
          )}
          {d.resources.uses.length > 0 && (
            <UsePips compact uses={d.resources.uses} onUse={resEdit ? (useId, delta) => void send('hero:use', { heroId: hero.id, useId, delta }) : undefined} />
          )}

          {(rules.currency.enabled || rules.xpEnabled) && (manage || invVisible || rules.xpEnabled) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {rules.currency.enabled &&
                (manage ? (
                  <span className="inline-flex items-center gap-1" title={rules.currency.name}>
                    <Coins className="h-3.5 w-3.5 text-gold-400" />
                    <Stepper size="sm" tone="gold" value={d.gold} min={0} onChange={(_n, delta) => adjust('gold', delta)} format={(v) => formatGold(v, true, null)} suffix={rules.currency.short} />
                  </span>
                ) : invVisible ? (
                  <span className="inline-flex items-center gap-1 text-xs text-gold-200" title={rules.currency.name}>
                    <Coins className="h-3.5 w-3.5 text-gold-400" />
                    {formatGold(d.gold, true, rules.currency.short)}
                  </span>
                ) : null)}
              {rules.xpEnabled &&
                (manage ? (
                  <span className="inline-flex items-center gap-1" title="Experiencia">
                    <Star className="h-3.5 w-3.5 text-emerald-400" />
                    <Stepper size="sm" tone="xp" value={d.xp} min={0} step={10} bigStep={100} onChange={(_n, delta) => adjust('xp', delta)} format={(v) => formatNumber(v, 0)} suffix="PX" />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-300" title="Experiencia">
                    <Star className="h-3.5 w-3.5 text-emerald-400" />
                    {formatNumber(d.xp, 0)} PX
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="animate-fade-in border-t border-ink-600/70 bg-ink-950/30 px-3 py-3">
          <HeroSheet heroId={hero.id} />
        </div>
      )}

      {over && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink-950/60 backdrop-blur-[1px]">
          <span className="rounded-full border border-gold-500/70 bg-ink-900 px-3 py-1 text-xs font-semibold text-gold-200 shadow-glow-gold">Dar a {hero.name}</span>
        </div>
      )}
    </article>
  );
}
