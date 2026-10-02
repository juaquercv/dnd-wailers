import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import clsx from 'clsx';
import { Backpack, ChevronDown, ChevronUp, Dices, DoorClosed, DoorOpen, Hand, Handshake, SkipForward, Swords, WandSparkles } from 'lucide-react';
import { isOwnHeroToken, type HeroSheet, type HeroSpell, type InventoryItem, type RuleSystem } from '@wailers/shared';
import { Avatar } from '../../../components/ui/Avatar';
import { isAnyModalOpen } from '../../../components/ui/Modal';
import { useHotkeys } from '../../../lib/hotkeys';
import { emitUiEvent } from '../../../lib/uiEvents';
import { useSessionStore } from '../../../stores/session';
import { useGameUi } from '../map/gameUi';
import { readPref, writePref } from '../map/useMediaQuery';
import { send } from '../panels/actions';
import { canEditResources, usePanelContext } from '../panels/context';
import { HpBar } from '../panels/HpBar';
import { TradeDialog } from '../TradeDialog';
import { ActionMenu } from './ActionMenu';
import { useHeroEconomy } from './economy';
import { EconomyMeters, turnStatus, TurnStatusPill } from './EconomyMeters';
import { HudPopover } from './HudPopover';
import { ItemsMenu } from './ItemsMenu';
import { nearbyThings, type NearbyThing } from './nearby';
import { SpellsMenu } from './SpellsMenu';

const COLLAPSE_PREF = 'wailers.game.hud.collapsed';
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';

type HudMenu = 'spells' | 'items' | 'action';

function keyboardBusy(): boolean {
  if (isAnyModalOpen()) return true;
  return typeof document !== 'undefined' && document.querySelector('[data-context-menu]') !== null;
}

/**
 * Player action bar at the bottom of the map: hero, turn status, movement and combat actions left, and big
 * buttons for spells, items, combat actions, dice, trades and ending the turn. Only its own controls take
 * pointer events (the map stays usable around it). The DM sees it read-only while previewing a player.
 */
export function PlayerHud() {
  const ctx = usePanelContext();
  const { state, rules, effective } = ctx;
  const zonesById = useSessionStore((s) => s.zonesById);
  const casting = useGameUi((s) => s.cast !== null);
  const readOnly = ctx.isDm;
  const viewerId = ctx.viewerId;
  const heroId = state && viewerId ? state.players[viewerId]?.heroId ?? null : null;
  const hero = state && heroId ? state.heroes[heroId] ?? null : null;
  const eco = useHeroEconomy(hero?.id ?? null);

  const [collapsed, setCollapsed] = useState<boolean>(() => readPref<boolean>(COLLAPSE_PREF, false, isBoolean));
  const [menu, setMenu] = useState<HudMenu | null>(null);
  const [trade, setTrade] = useState<{ itemId: string | null } | null>(null);
  const [ending, setEnding] = useState(false);
  const spellsRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);

  const token = useMemo(() => {
    if (!state || !viewerId || !hero) return null;
    return Object.values(state.tokens).find((t) => t.kind === 'hero' && (t.heroId === hero.id || isOwnHeroToken(state, t, viewerId))) ?? null;
  }, [state, viewerId, hero]);

  const nearby = useMemo(() => (state && token ? nearbyThings(state, zonesById, token) : []), [state, zonesById, token]);

  const canGive = useMemo(() => {
    if (!state || !viewerId || !hero) return false;
    return Object.values(state.players).some((p) => p.userId !== viewerId && p.heroId && p.heroId !== hero.id && state.heroes[p.heroId]);
  }, [state, viewerId, hero]);

  // Aiming a spell needs the map: close the menus.
  useEffect(() => {
    if (casting) setMenu(null);
  }, [casting]);

  const toggleCollapsed = () => {
    setMenu(null);
    setCollapsed((c) => {
      writePref(COLLAPSE_PREF, !c);
      return !c;
    });
  };

  const showSpells = !!hero && (hero.data.spells.length > 0 || rules.magic.mode !== 'none');
  const endTurnVisible = !!eco && eco.combat && eco.myTurn && !readOnly;

  const openMenu = (m: HudMenu) => {
    if (collapsed) {
      setCollapsed(false);
      writePref(COLLAPSE_PREF, false);
    }
    setMenu((cur) => (cur === m ? null : m));
  };
  const openDice = () => {
    setMenu(null);
    useGameUi.getState().openSidebarTab('dice');
  };
  const openTrade = (itemId: string | null) => {
    setMenu(null);
    setTrade({ itemId });
  };
  const endTurn = async () => {
    if (ending) return;
    setEnding(true);
    await send('turn:endMine', {}, { success: 'Turno terminado', error: 'No se pudo terminar el turno' });
    setEnding(false);
  };

  const hotkeyActions: (() => void)[] = [];
  if (showSpells) hotkeyActions.push(() => openMenu('spells'));
  hotkeyActions.push(() => openMenu('items'), () => openMenu('action'), openDice);
  if (canGive) hotkeyActions.push(() => openTrade(null));
  const bindings: Record<string, () => void> = {};
  hotkeyActions.forEach((run, i) => {
    bindings[String(i + 1)] = () => {
      if (!keyboardBusy()) run();
    };
  });
  useHotkeys(bindings, { enabled: !!hero && !readOnly && !casting, preventDefault: false });

  if (!state || !hero || !eco) return null;

  const canMove = effective?.canMoveOwnToken ?? true;
  const status = turnStatus(eco, canMove);
  const d = hero.data;
  const hpInfo = { hp: d.hp.current, maxHp: d.hp.max, temp: d.hp.temp || 0, ratio: d.hp.max > 0 ? Math.min(1, Math.max(0, d.hp.current / d.hp.max)) : null };
  const player = viewerId ? state.players[viewerId] ?? null : null;
  const center = () => token && emitUiEvent('center-on-token', { tokenId: token.id });
  let key = 0;
  const nextKey = () => String(++key);

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[11] flex max-w-[calc(100%-4.75rem)] flex-col items-start gap-1.5">
      {nearby.length > 0 && <NearbyChips things={nearby} readOnly={readOnly} />}

      {collapsed ? (
        <section
          aria-label="Tu héroe"
          className="pointer-events-auto flex max-w-full animate-fade-in items-center gap-2 rounded-full border border-gold-700/50 bg-ink-950/90 py-1 pl-1 pr-1.5 shadow-panel backdrop-blur"
        >
          <button type="button" onClick={center} disabled={!token} title={token ? 'Centrar el mapa en mi ficha' : hero.name} className="shrink-0">
            <Avatar name={hero.name} imageUrl={hero.imageUrl} color={player?.color} size="sm" ring />
          </button>
          <div className="w-20 min-w-0 shrink">
            <p className="truncate text-xs font-semibold text-parchment-50">{hero.name}</p>
            <HpBar size="xs" info={hpInfo} />
          </div>
          <TurnStatusPill tone={status.tone} text={status.text} hint={status.hint} className="max-w-[11rem]" />
          {endTurnVisible && (
            <button
              type="button"
              onClick={() => void endTurn()}
              disabled={ending}
              className="flex shrink-0 items-center gap-1 rounded-full border border-gold-400/70 bg-gold-sheen px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wider text-ink-950 shadow-glow-gold transition hover:brightness-110 disabled:opacity-60"
              title="Terminar mi turno"
            >
              <SkipForward className="h-3.5 w-3.5" aria-hidden />
              Terminar
            </button>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-parchment-300 transition hover:bg-ink-700 hover:text-parchment-50"
            title="Mostrar la barra de acciones"
            aria-label="Mostrar la barra de acciones"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        </section>
      ) : (
        <section
          aria-label="Tu héroe"
          className={clsx(
            'pointer-events-auto w-[27rem] max-w-full animate-slide-up rounded-2xl border bg-ink-950/90 p-2.5 shadow-modal backdrop-blur transition-colors',
            eco.combat && eco.myTurn ? 'border-gold-500/70' : 'border-gold-700/40',
          )}
        >
          <div className="flex items-start gap-2.5">
            <button type="button" onClick={center} disabled={!token} title={token ? 'Centrar el mapa en mi ficha' : 'Tu ficha no está en el mapa'} className="shrink-0">
              <Avatar name={hero.name} imageUrl={hero.imageUrl} color={player?.color} size={46} ring />
            </button>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="min-w-0 flex-1 truncate font-display text-[15px] font-bold leading-5 text-gold-100" title={hero.name}>
                  {hero.name}
                  <span className="ml-1.5 font-sans text-[10px] font-semibold text-gold-400/80">Nv {hero.level}</span>
                </h3>
                <TurnStatusPill tone={status.tone} text={status.text} hint={status.hint} className="max-w-[12rem] shrink" />
              </div>
              <HpBar size="sm" info={hpInfo} />
              <ResourceLine hero={hero} rules={rules} />
            </div>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-parchment-400 transition hover:bg-ink-700 hover:text-parchment-50"
              title="Ocultar la barra de acciones"
              aria-label="Ocultar la barra de acciones"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {eco.combat && <EconomyMeters eco={eco} className="mt-2 rounded-xl border border-ink-600/70 bg-ink-900/70 px-2.5 py-1.5" />}

          <div className="mt-2 flex flex-wrap gap-1.5">
            {showSpells && (
              <HudButton
                buttonRef={spellsRef}
                icon={<WandSparkles />}
                label="Hechizos"
                hotkey={readOnly ? undefined : nextKey()}
                active={menu === 'spells'}
                badge={d.spells.length || undefined}
                tone="arcane"
                onClick={() => openMenu('spells')}
              />
            )}
            <HudButton
              buttonRef={itemsRef}
              icon={<Backpack />}
              label="Objetos"
              hotkey={readOnly ? undefined : nextKey()}
              active={menu === 'items'}
              badge={d.inventory.length || undefined}
              onClick={() => openMenu('items')}
            />
            <HudButton
              buttonRef={actionRef}
              icon={<Swords />}
              label="Acción"
              hotkey={readOnly ? undefined : nextKey()}
              active={menu === 'action'}
              tone="blood"
              onClick={() => openMenu('action')}
            />
            <HudButton icon={<Dices />} label="Dados" hotkey={readOnly ? undefined : nextKey()} onClick={openDice} />
            {canGive && (
              <HudButton
                icon={<Handshake />}
                label="Intercambiar"
                hotkey={readOnly ? undefined : nextKey()}
                disabled={readOnly}
                title="Ofrecer objetos u oro a un compañero (no gasta acción)"
                onClick={() => openTrade(null)}
              />
            )}
            {endTurnVisible && (
              <button
                type="button"
                onClick={() => void endTurn()}
                disabled={ending}
                title="Pasar el turno al siguiente"
                className="flex h-[3.4rem] min-w-[5rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border border-gold-400/80 bg-gold-sheen px-2 font-display text-[11px] font-bold uppercase tracking-wider text-ink-950 shadow-glow-gold transition hover:brightness-110 disabled:opacity-60 [&_svg]:h-5 [&_svg]:w-5"
              >
                <SkipForward aria-hidden />
                Terminar turno
              </button>
            )}
          </div>
        </section>
      )}

      <HudPopover
        open={menu === 'spells'}
        onClose={() => setMenu(null)}
        anchorRef={spellsRef}
        icon={<WandSparkles />}
        title="Hechizos"
        subtitle={<SpellsSubtitle hero={hero} rules={rules} />}
        width={360}
      >
        <SpellsMenu
          hero={hero}
          rules={rules}
          eco={eco}
          canSpend={!readOnly && canEditResources(ctx, hero)}
          readOnly={readOnly}
          onCast={(spell: HeroSpell) => {
            setMenu(null);
            emitUiEvent('cast-request', { heroId: hero.id, spellName: spell.name, animation: spell.animation });
          }}
        />
      </HudPopover>
      <HudPopover
        open={menu === 'items'}
        onClose={() => setMenu(null)}
        anchorRef={itemsRef}
        icon={<Backpack />}
        title="Objetos"
        subtitle={canGive ? 'Usar queda registrado y el DM aplica el efecto · dar es gratis' : 'Usar queda registrado y el DM aplica el efecto'}
        width={380}
      >
        <ItemsMenu hero={hero} rules={rules} eco={eco} readOnly={readOnly} canGive={canGive} onGive={(item: InventoryItem) => openTrade(item.id)} />
      </HudPopover>
      <HudPopover
        open={menu === 'action'}
        onClose={() => setMenu(null)}
        anchorRef={actionRef}
        icon={<Swords />}
        title="Acción de combate"
        subtitle="Anuncia lo que haces; luego tira los dados si hace falta"
        width={340}
      >
        <ActionMenu heroId={hero.id} eco={eco} readOnly={readOnly} onDone={() => setMenu(null)} />
      </HudPopover>
      {trade && <TradeDialog open onClose={() => setTrade(null)} initialItemId={trade.itemId} />}
    </div>
  );
}

function SpellsSubtitle({ hero, rules }: { hero: HeroSheet; rules: RuleSystem }) {
  const mode = rules.magic.mode;
  if (mode === 'mana') {
    const m = hero.data.resources.mana;
    return (
      <>
        {rules.magic.manaName}: <strong className="text-arcane-200">{m.current}</strong> / {m.max} · elige uno y apunta en el mapa
      </>
    );
  }
  return <>Elige uno y apunta en el mapa (Esc cancela)</>;
}

interface HudButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  hotkey?: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  badge?: number;
  tone?: 'default' | 'arcane' | 'blood';
  buttonRef?: RefObject<HTMLButtonElement>;
}

const TONE_ICON: Record<NonNullable<HudButtonProps['tone']>, string> = {
  default: 'text-gold-300',
  arcane: 'text-arcane-300',
  blood: 'text-blood-300',
};

function HudButton({ icon, label, onClick, hotkey, active, disabled, title, badge, tone = 'default', buttonRef }: HudButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={active}
      title={title ?? (hotkey ? `${label} (${hotkey})` : label)}
      className={clsx(
        'group relative flex h-[3.4rem] min-w-[3.9rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45',
        active
          ? 'border-gold-400/80 bg-gold-500/15 text-gold-100 shadow-[0_0_14px_-4px_rgba(233,192,99,0.7)]'
          : 'border-ink-500 bg-ink-800/90 text-parchment-100 hover:border-gold-600 hover:bg-ink-700',
      )}
    >
      <span className={clsx('transition-transform group-hover:scale-110 [&>svg]:h-5 [&>svg]:w-5', TONE_ICON[tone])}>{icon}</span>
      <span className="max-w-full truncate leading-tight">{label}</span>
      {hotkey && (
        <span aria-hidden className="absolute left-1 top-0.5 text-[9px] font-bold text-parchment-400/70">
          {hotkey}
        </span>
      )}
      {badge !== undefined && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-ink-600 px-1 text-[9px] font-bold leading-none text-parchment-100 ring-2 ring-ink-950">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

/** Mana / spell slots / limited uses in one compact line. */
function ResourceLine({ hero, rules }: { hero: HeroSheet; rules: RuleSystem }) {
  const res = hero.data.resources;
  const mode = rules.magic.mode;
  const chips: { key: string; text: string; title: string }[] = [];
  if (mode === 'slots') {
    for (const s of [...res.slots].filter((x) => x.max > 0).sort((a, b) => a.level - b.level)) {
      chips.push({ key: `s${s.level}`, text: `${s.level}º ${Math.max(0, s.max - s.used)}/${s.max}`, title: `Espacios de nivel ${s.level}: quedan ${Math.max(0, s.max - s.used)} de ${s.max}` });
    }
  }
  if (mode === 'uses' || res.uses.length > 0) {
    for (const u of res.uses.slice(0, 3)) {
      chips.push({ key: u.id, text: `${u.name} ${Math.max(0, u.max - u.used)}/${u.max}`, title: `${u.name}: quedan ${Math.max(0, u.max - u.used)} de ${u.max}` });
    }
  }
  if (mode !== 'mana' && chips.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {mode === 'mana' && (
        <span className="flex min-w-[9rem] flex-1 items-center gap-1.5" title={`${rules.magic.manaName}: ${res.mana.current} de ${res.mana.max}`}>
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-arcane-300">{rules.magic.manaName}</span>
          <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-800">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-arcane-600 to-arcane-400 transition-[width] duration-300"
              style={{ width: `${res.mana.max > 0 ? Math.round(Math.min(1, res.mana.current / res.mana.max) * 100) : 0}%` }}
            />
          </span>
          <span className="shrink-0 text-[10px] font-semibold tabular-nums text-parchment-200">
            {res.mana.current}/{res.mana.max}
          </span>
        </span>
      )}
      {chips.map((c) => (
        <span key={c.key} title={c.title} className="rounded-full border border-arcane-500/40 bg-arcane-500/10 px-1.5 py-px text-[10px] font-semibold tabular-nums text-arcane-200">
          {c.text}
        </span>
      ))}
    </div>
  );
}

/** Free actions next to the hero: pick up items and open/close doors. */
function NearbyChips({ things, readOnly }: { things: NearbyThing[]; readOnly: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (thing: NearbyThing) => {
    setBusy(thing.key);
    if (thing.kind === 'item') {
      await send('token:pickup', { tokenId: thing.token.id }, { success: `Recoges: ${thing.token.name}`, error: 'No se pudo recoger el objeto' });
    } else {
      await send('door:use', { zoneId: thing.zoneId, wallId: thing.wall.id }, { success: thing.open ? 'Cierras la puerta' : 'Abres la puerta', error: 'No se pudo usar la puerta' });
    }
    setBusy(null);
  };
  return (
    <div className="pointer-events-auto flex max-w-full animate-fade-in flex-wrap items-center gap-1.5" role="group" aria-label="Cerca de ti">
      {things.slice(0, 4).map((thing) => {
        const Icon = thing.kind === 'item' ? Hand : thing.open ? DoorClosed : DoorOpen;
        const label = thing.kind === 'item' ? `Recoger ${thing.token.name}` : thing.open ? 'Cerrar la puerta' : 'Abrir la puerta';
        return (
          <button
            key={thing.key}
            type="button"
            disabled={readOnly || busy !== null}
            onClick={() => void run(thing)}
            title={`${label} · acción gratuita: no gasta acción ni movimiento`}
            className="flex max-w-[16rem] items-center gap-1.5 rounded-full border border-emerald-500/50 bg-ink-950/90 py-1 pl-2 pr-2.5 text-xs font-semibold text-emerald-100 shadow-panel backdrop-blur transition hover:border-emerald-400 hover:bg-emerald-500/15 disabled:opacity-60"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />
            <span className="truncate">{label}</span>
            <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-200">gratis</span>
          </button>
        );
      })}
    </div>
  );
}
