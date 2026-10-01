import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import {
  Backpack,
  Copy,
  Dices,
  Eye,
  EyeOff,
  Flame,
  HeartCrack,
  HeartPulse,
  LocateFixed,
  Minus,
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
} from 'lucide-react';
import {
  effectiveVisibility,
  isOwnHeroToken,
  isValidFormula,
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
import {
  addToInitiative,
  adjustHp,
  duplicateTokens,
  goToZone,
  isInInitiative,
  playerForToken,
  removeTokens,
  requestRoll,
  rotateTokens,
  send,
  setHidden,
  setHp,
  setStatus,
  setTorch,
  tokensByIds,
  transferTokens,
} from './map/actions';
import { useGameUi } from './map/gameUi';
import { levelLabel, sortedLevels, zoneTree } from './map/zoneTree';

export interface MenuAnchor {
  clientX: number;
  clientY: number;
}

export interface TokenContextMenuApi {
  /** Opens the context menu of a token at a client position. */
  open: (anchor: MenuAnchor, tokenId: string) => void;
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

function dmItems(
  state: LiveState,
  token: Token,
  targets: Token[],
  gridSize: number,
  openHp: (d: HpDialogState) => void,
  openRoll: (d: RollDialogState) => void,
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
  const allInInitiative = targets.every((t) => isInInitiative(state, t));
  const playerId = n === 1 ? playerForToken(state, token) : null;

  const items: ContextMenuItem[] = [{ heading: true, label: heading }];
  if (living.length > 0) {
    items.push(
      { label: `−1 PV${suffix}`, icon: <Minus />, onClick: () => void adjustHp(living, -1) },
      { label: `−5 PV${suffix}`, icon: <HeartCrack />, onClick: () => void adjustHp(living, -5) },
      { label: `+1 PV${suffix}`, icon: <Plus />, onClick: () => void adjustHp(living, 1) },
      { label: `+5 PV${suffix}`, icon: <HeartPulse />, onClick: () => void adjustHp(living, 5) },
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
      { separator: true },
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
    );
  }
  items.push(
    {
      label: allHidden ? `Mostrar a jugadores${suffix}` : `Ocultar a jugadores${suffix}`,
      icon: allHidden ? <Eye /> : <EyeOff />,
      shortcut: 'H',
      onClick: () => void setHidden(targets, !allHidden),
    },
    {
      label: allLit ? 'Apagar antorcha' : 'Encender antorcha',
      icon: <Flame />,
      onClick: () => void setTorch(targets, !allLit, gridSize),
    },
    {
      label: allInInitiative ? 'Ya en la iniciativa' : `Añadir a la iniciativa${suffix}`,
      icon: <Swords />,
      disabled: allInInitiative,
      onClick: () => void addToInitiative(targets),
    },
  );
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
    { label: `Mover a${suffix}`, icon: <Route />, children: moveToItems(targets) },
    { separator: true },
    { label: 'Botín y detalles', icon: <Backpack />, onClick: () => emitUiEvent('open-token', { tokenId: token.id }) },
    { label: 'Centrar', icon: <LocateFixed />, onClick: () => emitUiEvent('center-on-token', { tokenId: token.id }) },
    { label: `Duplicar${suffix}`, icon: <Copy />, onClick: () => void duplicateTokens(targets) },
    { label: `Eliminar${suffix}`, icon: <Trash2 />, danger: true, shortcut: 'Supr', onClick: () => void removeTokens(targets, true) },
  );
  return items;
}

function playerItems(state: LiveState, token: Token, meUserId: string): ContextMenuItem[] {
  const own = isOwnHeroToken(state, token, meUserId);
  const items: ContextMenuItem[] = [{ heading: true, label: token.name }];
  if (own) {
    const canMove = effectiveVisibility(state, meUserId).canMoveOwnToken;
    items.push(
      { label: 'Ver mi ficha', icon: <ScrollText />, onClick: () => useGameUi.getState().openSidebarTab('character') },
      { label: 'Centrar', icon: <LocateFixed />, onClick: () => emitUiEvent('center-on-token', { tokenId: token.id }) },
      {
        label: 'Girar',
        icon: <RotateCw />,
        disabled: !canMove,
        children: canMove
          ? [
              { label: 'Girar a la derecha', icon: <RotateCw />, shortcut: 'R', onClick: () => void rotateTokens([token], 45) },
              { label: 'Girar a la izquierda', icon: <RotateCcw />, shortcut: 'Mayús+R', onClick: () => void rotateTokens([token], -45) },
            ]
          : undefined,
      },
    );
  } else {
    items.push(
      { label: 'Ver detalles', icon: <UserRound />, onClick: () => emitUiEvent('open-token', { tokenId: token.id }) },
      { label: 'Centrar', icon: <LocateFixed />, onClick: () => emitUiEvent('center-on-token', { tokenId: token.id }) },
    );
  }
  items.push({ separator: true }, { label: 'Hacer ping aquí', icon: <Radar />, onClick: () => pingAt(token) });
  return items;
}

/** Token context menu (DM: quick HP, statuses, visibility, initiative, rolls, moves...; players: own token actions). */
export function useTokenContextMenu(gridSize: number): TokenContextMenuApi {
  const menu = useContextMenu();
  const [hpDialog, setHpDialog] = useState<HpDialogState | null>(null);
  const [rollDialog, setRollDialog] = useState<RollDialogState | null>(null);
  const { openAt } = menu;

  const open = useCallback(
    (anchor: MenuAnchor, tokenId: string) => {
      const s = useSessionStore.getState();
      const view = s.view;
      if (!view) return;
      const state = view.state;
      const token = state.tokens[tokenId];
      if (!token) return;
      if (view.role === 'dm') {
        const inSelection = s.selectedTokenIds.includes(tokenId);
        if (!inSelection) s.selectTokens([tokenId]);
        const ids = inSelection ? s.selectedTokenIds : [tokenId];
        const targets = tokensByIds(ids);
        if (targets.length === 0) return;
        openAt(anchor.clientX, anchor.clientY, dmItems(state, token, targets, gridSize, setHpDialog, setRollDialog));
      } else {
        openAt(anchor.clientX, anchor.clientY, playerItems(state, token, view.meUserId));
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

const MODE_OPTIONS: { value: RollMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'advantage', label: 'Ventaja' },
  { value: 'disadvantage', label: 'Desventaja' },
];

const VISIBILITY_OPTIONS: { value: RollVisibility; label: string }[] = (Object.keys(ROLL_VISIBILITY_LABELS) as RollVisibility[]).map(
  (v) => ({ value: v, label: ROLL_VISIBILITY_LABELS[v] }),
);

function CustomRollDialog({ state, onClose }: { state: RollDialogState | null; onClose: () => void }) {
  return (
    <Modal open={!!state} onClose={onClose} size="sm" icon={<Dices />} title="Pedir tirada personalizada" subtitle={state ? `Para ${state.heroName}` : undefined}>
      {state && <CustomRollForm key={state.userId} state={state} onClose={onClose} />}
    </Modal>
  );
}

function CustomRollForm({ state, onClose }: { state: RollDialogState; onClose: () => void }) {
  const [label, setLabel] = useState('Tirada');
  const [formula, setFormula] = useState('1d20');
  const [mode, setMode] = useState<RollMode>('normal');
  const [visibility, setVisibility] = useState<RollVisibility>('public');
  const [busy, setBusy] = useState(false);
  const valid = isValidFormula(formula.trim());
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    const ok = await requestRoll(state.userId, label.trim() || `Tirada de ${formula.trim()}`, formula.trim(), mode, visibility);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <TextInput label="Motivo" value={label} onValueChange={setLabel} placeholder="Percepción, Atletismo…" autoFocus />
      <TextInput
        label="Fórmula"
        value={formula}
        onValueChange={setFormula}
        placeholder="1d20+3"
        error={formula.trim() && !valid ? 'Fórmula no válida (ej. 1d20+3, 2d6)' : undefined}
      />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Modo" value={mode} onChange={setMode} options={MODE_OPTIONS} />
        <Select label="Visibilidad" value={visibility} onChange={setVisibility} options={VISIBILITY_OPTIONS} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={busy} disabled={!valid} icon={<Dices />}>
          Pedir tirada
        </Button>
      </div>
    </form>
  );
}
