import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import {
  Backpack,
  Copy,
  Crown,
  Dices,
  Eye,
  EyeOff,
  Flag,
  Flame,
  Footprints,
  Hand,
  HeartCrack,
  HeartPulse,
  LocateFixed,
  Minus,
  Move,
  Pencil,
  Plus,
  Radar,
  RotateCcw,
  RotateCw,
  Route,
  ScrollText,
  Sparkles,
  Swords,
  Trash2,
  UserRound,
  Zap,
} from 'lucide-react';
import {
  actionBudget,
  economyApplies,
  isOwnHeroToken,
  moveBudget,
  ROLL_VISIBILITY_LABELS,
  STATUSES,
  tokenHp,
  type LiveState,
  type RollMode,
  type RollVisibility,
  type Token,
} from '@wailers/shared';
import { Button } from '../../components/ui/Button';
import { useContextMenu, type ContextMenuItem } from '../../components/ui/ContextMenu';
import { Modal } from '../../components/ui/Modal';
import { NumberInput } from '../../components/ui/NumberInput';
import { Select } from '../../components/ui/Select';
import { TextInput } from '../../components/ui/TextInput';
import { toast } from '../../components/ui/toast';
import { emitUiEvent } from '../../lib/uiEvents';
import { useSessionStore } from '../../stores/session';
import { DicePoolBuilder, effectivePoolMode } from '../dice/DicePoolBuilder';
import { poolFormula, prettyFormula, type DicePool } from '../dice/dicePool';
import {
  addToInitiative,
  adjustHp,
  adjustUsage,
  duplicateTokens,
  goToZone,
  isInInitiative,
  moveTokensNear,
  playerForToken,
  removeTokens,
  requestRoll,
  revealWithEntrance,
  rotateTokens,
  send,
  setHidden,
  setHp,
  setStatus,
  setTorch,
  tokensByIds,
  transferTokens,
  turnEntryOf,
} from './map/actions';
import { useGameUi } from './map/gameUi';
import { freeMoveBlock, OFF_TURN_TURN_REASON, playerEconomyNow } from './map/ownEconomy';
import { levelLabel, sortedLevels, zoneTree } from './map/zoneTree';

export interface MenuAnchor {
  clientX: number;
  clientY: number;
}

export interface TokenMenuOptions {
  /** Item token next to the player's hero (can be picked up now). */
  pickable?: boolean;
}

export interface TokenContextMenuApi {
  /**
   * Opens the context menu of a token at a client position. DM: a token outside the current selection is
   * acted on alone and the selection is kept, so it can be brought next to that token.
   */
  open: (anchor: MenuAnchor, tokenId: string, opts?: TokenMenuOptions) => void;
  /** Dialogs launched from the menu ("Fijar PV…", "Personalizada…"): render once. */
  dialogs: ReactNode;
}

interface HpDialogState {
  tokenIds: string[];
  title: string;
  initial: number;
}

interface RollDialogState {
  userId: string;
  heroName: string;
}

const QUICK_ROLLS: { label: string; title: string }[] = [
  { label: '1d20', title: 'Tirada de 1d20' },
  { label: 'Percepción (1d20)', title: 'Percepción' },
  { label: 'Sigilo (1d20)', title: 'Sigilo' },
  { label: 'Salvación (1d20)', title: 'Salvación' },
];

function statusesOf(state: LiveState, token: Token): string[] {
  if (token.kind === 'hero' && token.heroId) {
    const hero = state.heroes[token.heroId];
    if (hero) return hero.data.statuses;
  }
  return token.statuses;
}

function pingAt(token: Token): void {
  void send('ping', { zoneId: token.zoneId, levelId: token.levelId, x: token.x, y: token.y }, 'No se pudo enviar el ping');
}

function moveToItems(targets: Token[]): ContextMenuItem[] {
  const s = useSessionStore.getState();
  const items: ContextMenuItem[] = [];
  const allIn = (zoneId: string, levelId: string) => targets.every((t) => t.zoneId === zoneId && t.levelId === levelId);
  const doMove = async (zoneId: string, levelId: string) => {
    const zone = s.zonesById[zoneId];
    const level = zone?.levels.find((l) => l.id === levelId);
    const ok = await transferTokens(targets, { zoneId, levelId }, { quiet: true });
    if (ok > 0 && zone) {
      const where = `${zone.name}${zone.levels.length > 1 && level ? ` · ${levelLabel(level)}` : ''}`;
      toast.success(`${targets.length === 1 ? targets[0]!.name : `${ok} fichas`} → ${where}`, {
        action: { label: 'Ir allí', onClick: () => goToZone(zoneId, levelId) },
      });
    }
  };
  for (const { zone, depth } of zoneTree(s.zones)) {
    const prefix = depth > 0 ? `${'· '.repeat(depth)}` : '';
    if (zone.levels.length <= 1) {
      const level = zone.levels[0];
      if (!level) continue;
      items.push({
        label: `${prefix}${zone.name}`,
        disabled: allIn(zone.id, level.id),
        onClick: () => void doMove(zone.id, level.id),
      });
    } else {
      items.push({
        label: `${prefix}${zone.name}`,
        children: sortedLevels(zone.levels).map((level) => ({
          label: levelLabel(level),
          disabled: allIn(zone.id, level.id),
          onClick: () => void doMove(zone.id, level.id),
        })),
      });
    }
  }
  if (items.length === 0) items.push({ label: 'No hay otras zonas', disabled: true });
  return items;
}

function cellsText(n: number): string {
  return `${n} ${n === 1 ? 'casilla' : 'casillas'}`;
}

/** "Combate y turno" submenu: turn, initiative and the hero's movement / combat actions this turn. */
function combatItems(state: LiveState, token: Token, targets: Token[]): ContextMenuItem[] {
  const n = targets.length;
  const suffix = n > 1 ? ` (${n})` : '';
  const items: ContextMenuItem[] = [];
  const allInInitiative = targets.every((t) => isInInitiative(state, t));
  if (n === 1) {
    const entry = turnEntryOf(state, token);
    const current = state.turn.order[state.turn.currentIndex] ?? null;
    const isCurrent = !!entry && current?.id === entry.id;
    items.push({
      label: isCurrent ? 'Ya es su turno' : entry ? 'Dar el turno' : 'Dar el turno (no está en la iniciativa)',
      icon: <Flag />,
      disabled: !entry || isCurrent,
      onClick: () => {
        if (!entry) return;
        void send('turn:setCurrent', { entryId: entry.id }, 'No se pudo dar el turno').then((ok) => ok && toast.success(`Turno de ${token.name}`));
      },
    });
  }
  items.push({
    label: allInInitiative ? 'Ya en la iniciativa' : `Añadir a la iniciativa${suffix}`,
    icon: <Swords />,
    disabled: allInInitiative,
    onClick: () => void addToInitiative(targets),
  });
  const heroIds = [...new Set(targets.flatMap((t) => (t.kind === 'hero' && t.heroId && state.heroes[t.heroId] ? [t.heroId] : [])))];
  // Movement / action limits only exist while combat is on (usage resets when it starts).
  if (heroIds.length === 0 || !economyApplies(state)) return items;
  const one = heroIds.length === 1 ? heroIds[0]! : null;
  const who = one ? state.heroes[one]!.name : `${heroIds.length} héroes`;
  const grant = (patch: { bonusMoveDelta?: number; bonusActionsDelta?: number; reset?: boolean }, text: string) => {
    void Promise.all(heroIds.map((id) => adjustUsage(id, patch))).then((oks) => {
      if (oks.some(Boolean)) toast.success(text);
    });
  };
  items.push({ separator: true });
  if (one) {
    const move = moveBudget(state, one);
    const acts = actionBudget(state, one);
    items.push({
      heading: true,
      label: `Le quedan ${move.left} de ${cellsText(move.max)} · ${acts.left} de ${acts.max} ${acts.max === 1 ? 'acción' : 'acciones'}`,
    });
  }
  items.push(
    {
      label: 'Restablecer movimiento y acciones',
      icon: <RotateCcw />,
      onClick: () => grant({ reset: true }, `${who}: movimiento y acciones restablecidos`),
    },
    { label: '+1 acción de combate', icon: <Zap />, onClick: () => grant({ bonusActionsDelta: 1 }, `${who}: +1 acción de combate este turno`) },
    {
      label: 'Más movimiento',
      icon: <Footprints />,
      children: [1, 2, 3, 5].map((cells) => ({
        label: `+${cellsText(cells)}`,
        onClick: () => grant({ bonusMoveDelta: cells }, `${who}: +${cellsText(cells)} de movimiento este turno`),
      })),
    },
  );
  return items;
}

function dmItems(
  state: LiveState,
  token: Token,
  targets: Token[],
  gridSize: number,
  openHp: (d: HpDialogState) => void,
  openRoll: (d: RollDialogState) => void,
  bringSelection: Token[],
): ContextMenuItem[] {
  const n = targets.length;
  const suffix = n > 1 ? ` (${n})` : '';
  const living = targets.filter((t) => t.kind !== 'item');
  const hp = token.kind !== 'item' ? tokenHp(state, token) : null;
  const heading =
    n > 1
      ? `${token.name} y ${n - 1} más`
      : `${token.name}${hp && hp.hp !== null && hp.maxHp !== null ? ` · PV ${hp.hp}/${hp.maxHp}` : ''}`;
  const allHidden = targets.every((t) => t.hidden);
  const allLit = targets.every((t) => t.light !== null);
  const playerId = n === 1 ? playerForToken(state, token) : null;
  // A hero token is only taken off the map (its sheet stays); other tokens are deleted.
  const heroCount = targets.filter((t) => t.kind === 'hero').length;
  const removeLabel = heroCount === n ? 'Retirar del mapa' : heroCount > 0 ? 'Quitar del mapa' : 'Eliminar';

  const items: ContextMenuItem[] = [{ heading: true, label: heading }];
  if (bringSelection.length > 0) {
    items.push(
      {
        label: `Traer aquí la selección (${bringSelection.length})`,
        icon: <Move />,
        onClick: () =>
          void moveTokensNear(bringSelection, { zoneId: token.zoneId, levelId: token.levelId, x: token.x, y: token.y }).then(
            (ok) => ok > 0 && toast.success(`${ok === 1 ? bringSelection[0]!.name : `${ok} fichas`} junto a ${token.name}`),
          ),
      },
      { separator: true },
    );
  }
  if (living.length > 0) {
    items.push(
      {
        label: `Puntos de vida${suffix}`,
        icon: <HeartPulse />,
        children: [
          { label: '−1 PV', icon: <Minus />, onClick: () => void adjustHp(living, -1) },
          { label: '−5 PV', icon: <HeartCrack />, onClick: () => void adjustHp(living, -5) },
          { label: '+1 PV', icon: <Plus />, onClick: () => void adjustHp(living, 1) },
          { label: '+5 PV', icon: <HeartPulse />, onClick: () => void adjustHp(living, 5) },
          { separator: true },
          {
            label: 'Fijar PV…',
            icon: <Pencil />,
            onClick: () =>
              openHp({
                tokenIds: living.map((t) => t.id),
                title: living.length === 1 ? living[0]!.name : `${living.length} fichas`,
                initial: hp?.hp ?? 0,
              }),
          },
        ],
      },
      {
        label: 'Estados',
        icon: <Sparkles />,
        children: STATUSES.map((st) => {
          const on = targets.every((t) => statusesOf(state, t).includes(st.key));
          return {
            label: `${st.icon}  ${st.label}`,
            checked: on,
            onClick: () => void setStatus(targets, st.key, !on),
          };
        }),
      },
      { label: 'Combate y turno', icon: <Swords />, children: combatItems(state, token, targets) },
    );
  }
  items.push({
    label: allHidden ? `Mostrar a jugadores${suffix}` : `Ocultar a jugadores${suffix}`,
    icon: allHidden ? <Eye /> : <EyeOff />,
    shortcut: 'H',
    onClick: () => void setHidden(targets, !allHidden),
  });
  if (n === 1 && token.hidden && (token.kind === 'creature' || token.kind === 'npc')) {
    // The big boss moment in one click: reveal + cinematic entrance (with a roar when available).
    items.push({ label: 'Mostrar con entrada dramática', icon: <Crown />, onClick: () => void revealWithEntrance(token) });
  }
  items.push({
    label: allLit ? 'Apagar antorcha' : 'Encender antorcha',
    icon: <Flame />,
    onClick: () => void setTorch(targets, !allLit, gridSize),
  });
  if (n === 1 && token.kind === 'hero') {
    items.push({
      label: 'Pedir tirada',
      icon: <Dices />,
      disabled: !playerId,
      children: playerId
        ? [
            ...QUICK_ROLLS.map((r) => ({
              label: r.label,
              onClick: () => void requestRoll(playerId, r.title, '1d20'),
            })),
            { separator: true },
            { label: 'Personalizada…', icon: <Pencil />, onClick: () => openRoll({ userId: playerId, heroName: token.name }) },
          ]
        : undefined,
    });
  }
  items.push(
    { label: `Mover a otra zona${suffix}`, icon: <Route />, children: moveToItems(targets) },
    { separator: true },
    { label: 'Botín y detalles', icon: <Backpack />, onClick: () => emitUiEvent('open-token', { tokenId: token.id }) },
    { label: 'Centrar', icon: <LocateFixed />, onClick: () => emitUiEvent('center-on-token', { tokenId: token.id }) },
    { label: `Duplicar${suffix}`, icon: <Copy />, onClick: () => void duplicateTokens(targets) },
    { label: `${removeLabel}${suffix}`, icon: <Trash2 />, danger: true, shortcut: 'Supr', onClick: () => void removeTokens(targets, true) },
  );
  return items;
}

function playerItems(state: LiveState, token: Token, meUserId: string, canMoveOwn: boolean, opts: TokenMenuOptions): ContextMenuItem[] {
  const own = isOwnHeroToken(state, token, meUserId);
  const items: ContextMenuItem[] = [{ heading: true, label: token.name }];
  if (own) {
    // Turning costs no movement, but it needs the DM's permission and, in combat, the hero's own turn.
    const block = freeMoveBlock(
      canMoveOwn,
      playerEconomyNow(token.heroId ?? state.players[meUserId]?.heroId ?? null),
      OFF_TURN_TURN_REASON,
    );
    items.push(
      { label: 'Ver mi ficha', icon: <ScrollText />, onClick: () => useGameUi.getState().openSidebarTab('character') },
      { label: 'Centrar', icon: <LocateFixed />, onClick: () => emitUiEvent('center-on-token', { tokenId: token.id }) },
      {
        label: 'Girar',
        icon: <RotateCw />,
        disabled: block !== null,
        children:
          block === null
            ? [
                { label: 'Girar a la derecha', icon: <RotateCw />, shortcut: 'R', onClick: () => void rotateTokens([token], 45) },
                { label: 'Girar a la izquierda', icon: <RotateCcw />, shortcut: 'Mayús+R', onClick: () => void rotateTokens([token], -45) },
              ]
            : undefined,
      },
    );
    if (block !== null) items.push({ label: <span className="whitespace-normal text-xs leading-snug">{block}</span>, disabled: true });
  } else {
    if (token.kind === 'item') {
      items.push({
        label: opts.pickable ? `Recoger «${token.name}»` : 'Recoger (acércate a una casilla)',
        icon: <Hand />,
        disabled: !opts.pickable,
        onClick: () =>
          void send('token:pickup', { tokenId: token.id }, 'No se pudo recoger el objeto').then((ok) => ok && toast.success(`Recoges «${token.name}»`)),
      });
    }
    items.push(
      { label: 'Ver detalles', icon: <UserRound />, onClick: () => emitUiEvent('open-token', { tokenId: token.id }) },
      { label: 'Centrar', icon: <LocateFixed />, onClick: () => emitUiEvent('center-on-token', { tokenId: token.id }) },
    );
  }
  items.push({ separator: true }, { label: 'Hacer ping aquí', icon: <Radar />, onClick: () => pingAt(token) });
  return items;
}

/** Token context menu (DM: HP, statuses, combat, visibility, rolls, moves...; players: own token, pick up items). */
export function useTokenContextMenu(gridSize: number): TokenContextMenuApi {
  const menu = useContextMenu();
  const [hpDialog, setHpDialog] = useState<HpDialogState | null>(null);
  const [rollDialog, setRollDialog] = useState<RollDialogState | null>(null);
  const { openAt } = menu;

  const open = useCallback(
    (anchor: MenuAnchor, tokenId: string, opts: TokenMenuOptions = {}) => {
      const s = useSessionStore.getState();
      const view = s.view;
      if (!view) return;
      const state = view.state;
      const token = state.tokens[tokenId];
      if (!token) return;
      if (view.role === 'dm') {
        const selection = tokensByIds(s.selectedTokenIds);
        const inSelection = selection.some((t) => t.id === tokenId);
        if (!inSelection && selection.length === 0) s.selectTokens([tokenId]);
        const targets = inSelection ? selection : [token];
        const bring = inSelection ? [] : selection;
        openAt(anchor.clientX, anchor.clientY, dmItems(state, token, targets, gridSize, setHpDialog, setRollDialog, bring));
      } else {
        openAt(anchor.clientX, anchor.clientY, playerItems(state, token, view.meUserId, view.effective.canMoveOwnToken, opts));
      }
    },
    [openAt, gridSize],
  );

  const dialogs = (
    <>
      <SetHpDialog state={hpDialog} onClose={() => setHpDialog(null)} />
      <CustomRollDialog state={rollDialog} onClose={() => setRollDialog(null)} />
    </>
  );

  return { open, dialogs };
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function SetHpDialog({ state, onClose }: { state: HpDialogState | null; onClose: () => void }) {
  return (
    <Modal open={!!state} onClose={onClose} size="sm" icon={<HeartPulse />} title="Fijar puntos de vida" subtitle={state?.title}>
      {state && <SetHpForm key={state.tokenIds.join('|')} state={state} onClose={onClose} />}
    </Modal>
  );
}

function SetHpForm({ state, onClose }: { state: HpDialogState; onClose: () => void }) {
  const [value, setValue] = useState(Math.max(0, state.initial));
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await setHp(tokensByIds(state.tokenIds), value);
    setBusy(false);
    if (ok > 0) onClose();
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <NumberInput label="PV actuales" value={value} onChange={setValue} min={0} integer autoFocus />
      <p className="text-xs text-parchment-400">El valor se aplica tal cual: no se calcula ningún daño ni resistencia automáticamente.</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Fijar PV
        </Button>
      </div>
    </form>
  );
}

const VISIBILITY_OPTIONS: { value: RollVisibility; label: string }[] = (Object.keys(ROLL_VISIBILITY_LABELS) as RollVisibility[]).map(
  (v) => ({ value: v, label: ROLL_VISIBILITY_LABELS[v] }),
);

const DEFAULT_REQUEST_POOL: DicePool = { groups: [{ sides: 20, count: 1 }], bonus: 0 };

function CustomRollDialog({ state, onClose }: { state: RollDialogState | null; onClose: () => void }) {
  return (
    <Modal open={!!state} onClose={onClose} size="sm" icon={<Dices />} title="Pedir tirada" subtitle={state ? `Para ${state.heroName}` : undefined}>
      {state && <CustomRollForm key={state.userId} state={state} onClose={onClose} />}
    </Modal>
  );
}

/** Same dice table as the dice panel: pick dice and a flat bonus with buttons (no formula typing). */
function CustomRollForm({ state, onClose }: { state: RollDialogState; onClose: () => void }) {
  const [label, setLabel] = useState('Tirada');
  const [pool, setPool] = useState<DicePool>(DEFAULT_REQUEST_POOL);
  const [mode, setMode] = useState<RollMode>('normal');
  const [visibility, setVisibility] = useState<RollVisibility>('public');
  const [busy, setBusy] = useState(false);
  const formula = poolFormula(pool);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formula) return;
    setBusy(true);
    const ok = await requestRoll(state.userId, label.trim() || `Tirada de ${prettyFormula(formula)}`, formula, effectivePoolMode(pool, mode), visibility);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <TextInput label="Motivo" value={label} onValueChange={setLabel} placeholder="Percepción, Atletismo…" autoFocus />
      <DicePoolBuilder compact pool={pool} onChange={setPool} mode={mode} onModeChange={setMode} emptyHint="Elige los dados que tendrá que tirar." />
      <Select label="¿Quién verá el resultado?" value={visibility} onChange={setVisibility} options={VISIBILITY_OPTIONS} />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={busy} disabled={!formula} icon={<Dices />}>
          Pedir tirada
        </Button>
      </div>
    </form>
  );
}
