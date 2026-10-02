import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronDown, Dices, Globe, Hand, Lock, RotateCw, Send, Settings2, Sparkles, Tag, UserRound, X } from 'lucide-react';
import type { RollMode, RollRequest, RollVisibility, Roller } from '@wailers/shared';
import { emitAck } from '../../api/socket';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { Modal } from '../../components/ui/Modal';
import { Select, type SelectOption } from '../../components/ui/Select';
import { TextInput } from '../../components/ui/TextInput';
import { toast } from '../../components/ui/toast';
import { formatRelative } from '../../lib/format';
import { useSessionStore } from '../../stores/session';
import { RollerManager } from '../rollers/RollerManager';
import { DicePoolBuilder, effectivePoolMode } from './DicePoolBuilder';
import { DieGlyph } from './DieShapes';
import { playerLabel, useSessionPlayers, type PlayerOption } from './diceHooks';
import { poolFormula, poolIsEmpty, prettyFormula } from './dicePool';
import { patchDiceTray, useDiceTray, useDiceTraySession, type LastTrayRoll } from './diceTrayStore';
import { MODE_LABELS } from './diceUtils';
import { resolveOffered, useEnsureRollers, useRollerLookup } from './offeredRollers';
import { RollHistory } from './RollHistory';
import { MiniWheel, SegmentStrip } from './RouletteWheel';
import { Segmented, type SegmentedOption } from './Segmented';

/**
 * Live game dice tray. DM: dice table with visibility, campaign rollers, roll requests and live roller
 * editing. Players: requests addressed to them, turn offers and (if the campaign allows) public dice.
 * Every result is only shown, never applied.
 */
export function DicePanel() {
  const role = useSessionStore((s) => s.view?.role ?? null);
  useDiceTraySession();
  if (!role) {
    return (
      <div className="p-3">
        <EmptyState compact icon={<Dices />} title="Conectando con la mesa…" />
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-3">{role === 'dm' ? <DmDice /> : <PlayerDice />}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function Section({
  title,
  icon,
  actions,
  children,
  collapsible = false,
  defaultOpen = true,
  highlight = false,
}: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const heading = (
    <span className="flex min-w-0 items-center gap-2 font-display text-[13px] font-semibold tracking-wide text-parchment-100">
      {icon && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-gold-700/50 bg-ink-800 text-gold-300 [&>svg]:h-3.5 [&>svg]:w-3.5">
          {icon}
        </span>
      )}
      <span className="truncate">{title}</span>
    </span>
  );
  return (
    <section
      className={clsx(
        'rounded-xl border bg-gradient-to-b from-ink-800/70 to-ink-900/70 p-3 shadow-panel',
        highlight ? 'border-gold-600/60 shadow-glow-gold' : 'border-ink-600/70',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex min-w-0 flex-1 items-center gap-1 rounded text-left hover:text-parchment-50"
          >
            {heading}
            <ChevronDown className={clsx('ml-auto h-4 w-4 shrink-0 text-parchment-400 transition-transform', open && 'rotate-180')} />
          </button>
        ) : (
          heading
        )}
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {(!collapsible || open) && <div className="mt-3">{children}</div>}
    </section>
  );
}

interface VisibilityChoice {
  value: RollVisibility;
  label: string;
  hint: string;
  icon: ReactNode;
}

const ROLL_VISIBILITY: VisibilityChoice[] = [
  { value: 'public', label: 'Pública', hint: 'La ven todos', icon: <Globe /> },
  { value: 'player', label: 'Solo un jugador', hint: 'Él y tú', icon: <UserRound /> },
  { value: 'secret', label: 'Secreta', hint: 'Solo tú', icon: <Lock /> },
];

const REQUEST_VISIBILITY: VisibilityChoice[] = [
  { value: 'public', label: 'Pública', hint: 'La ven todos', icon: <Globe /> },
  { value: 'player', label: 'Él y el DM', hint: 'Nadie más', icon: <UserRound /> },
  { value: 'secret', label: 'Secreta', hint: 'Solo tú', icon: <Lock /> },
];

const VISIBILITY_TEXT: Record<RollVisibility, string> = { public: 'pública', player: 'solo un jugador', secret: 'secreta' };

function VisibilityPicker({ value, onChange, choices, ariaLabel }: { value: RollVisibility; onChange: (v: RollVisibility) => void; choices: VisibilityChoice[]; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-3 gap-1.5">
      {choices.map((c) => {
        const active = c.value === value;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(c.value)}
            className={clsx(
              'flex min-w-0 flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-center transition [&_svg]:h-4 [&_svg]:w-4',
              active
                ? c.value === 'secret'
                  ? 'border-arcane-400/70 bg-arcane-500/15 text-arcane-300 shadow-glow-arcane'
                  : c.value === 'player'
                    ? 'border-sky-400/60 bg-sky-500/10 text-sky-200'
                    : 'border-gold-500/70 bg-gold-500/10 text-gold-200 shadow-glow-gold'
                : 'border-ink-600 bg-ink-900/60 text-parchment-300 hover:border-ink-400 hover:text-parchment-100',
            )}
          >
            {c.icon}
            <span className="text-[11px] font-semibold leading-tight">{c.label}</span>
            <span className={clsx('text-[10px] leading-tight', active ? 'opacity-80' : 'text-parchment-400')}>{c.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

function playerOptions(players: PlayerOption[]): SelectOption<string>[] {
  return players.map((p) => ({ value: p.userId, label: `${playerLabel(p)}${p.connected ? '' : ' (desconectado)'}` }));
}

function sortedActive(rollers: Roller[]): Roller[] {
  return rollers
    .filter((r) => r.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'));
}

function ModeBadge({ mode }: { mode: RollMode }) {
  if (mode === 'normal') return null;
  return (
    <Badge size="xs" tone={mode === 'advantage' ? 'emerald' : 'blood'}>
      {MODE_LABELS[mode]}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Dice table (shared by DM and players)
// ---------------------------------------------------------------------------

interface TrayRoll {
  formula: string;
  mode: RollMode;
  label: string;
}

interface TrayProps {
  busy: boolean;
  /** `repeat` = sent from "Repetir última tirada". */
  onRoll: (roll: TrayRoll, repeat: boolean) => void;
  /** Extra controls (DM visibility) rendered before the roll button. */
  children?: ReactNode;
  note?: ReactNode;
  /** Extra text for the repeat button (e.g. the visibility used). */
  lastSuffix?: string | null;
}

function DiceTray({ busy, onRoll, children, note, lastSuffix }: TrayProps) {
  const pool = useDiceTray((s) => s.pool);
  const mode = useDiceTray((s) => s.mode);
  const label = useDiceTray((s) => s.label);
  const last = useDiceTray((s) => s.last);
  const formula = poolFormula(pool);

  const roll = () => {
    if (busy) return;
    if (!formula) {
      toast.info(poolIsEmpty(pool) ? 'Añade dados a la mesa para tirar' : 'Añade al menos un dado: el bono solo no se tira');
      return;
    }
    onRoll({ formula, mode: effectivePoolMode(pool, mode), label: label.trim() }, false);
  };

  return (
    <div className="space-y-3">
      <DicePoolBuilder
        pool={pool}
        onChange={(next) => patchDiceTray({ pool: next })}
        mode={mode}
        onModeChange={(m) => patchDiceTray({ mode: m })}
      />

      {children}

      <TextInput
        size="sm"
        value={label}
        placeholder="¿Para qué es? (opcional) · Ataque, Percepción…"
        maxLength={80}
        aria-label="Etiqueta de la tirada (opcional)"
        icon={<Tag />}
        onValueChange={(v) => patchDiceTray({ label: v })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            roll();
          }
        }}
      />

      <div className="space-y-1.5">
        <Button
          variant="primary"
          size="lg"
          epic
          block
          loading={busy}
          disabled={!formula}
          icon={<Dices />}
          onClick={roll}
          className="h-12 text-base shadow-glow-gold"
        >
          ¡Tirar!
        </Button>
        {!formula && <p className="text-center text-[11px] text-parchment-400">Pon al menos un dado en la mesa.</p>}
        <button
          type="button"
          disabled={busy || !last}
          onClick={() => last && onRoll({ formula: last.formula, mode: last.mode, label: last.label }, true)}
          title={last ? `Volver a tirar ${prettyFormula(last.formula)}` : 'Aún no has tirado nada'}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-ink-500 bg-ink-900/50 px-2.5 py-2 text-left text-xs font-semibold text-parchment-300 transition hover:border-gold-600/70 hover:text-gold-200 disabled:pointer-events-none disabled:opacity-40"
        >
          <RotateCw className="h-4 w-4 shrink-0" />
          <span className="shrink-0">Repetir última tirada</span>
          {last && (
            <span className="ml-auto min-w-0 truncate text-right font-mono text-[11px] font-normal text-gold-300/90">
              {prettyFormula(last.formula)}
              {last.mode !== 'normal' ? ` · ${MODE_LABELS[last.mode]}` : ''}
              {lastSuffix ? ` · ${lastSuffix}` : ''}
            </span>
          )}
        </button>
      </div>
      {note && <p className="text-center text-[11px] text-parchment-400">{note}</p>}
    </div>
  );
}

function rememberLast(roll: TrayRoll, visibility: RollVisibility, targetUserId: string | null): void {
  const last: LastTrayRoll = { ...roll, visibility, targetUserId };
  patchDiceTray({ last });
}

// ---------------------------------------------------------------------------
// DM
// ---------------------------------------------------------------------------

function DmDice() {
  const campaignId = useSessionStore((s) => s.view?.state.campaignId ?? '');
  const rollers = useSessionStore((s) => s.rollers);
  const requests = useSessionStore((s) => s.view?.state.rollRequests ?? null);
  const players = useSessionPlayers();
  const visibility = useDiceTray((s) => s.visibility);
  const targetUserId = useDiceTray((s) => s.targetUserId);
  const last = useDiceTray((s) => s.last);
  const [busy, setBusy] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);

  const active = useMemo(() => sortedActive(rollers), [rollers]);
  const isValidTarget = (id: string | null) => !!id && players.some((p) => p.userId === id);

  const checkTarget = (vis: RollVisibility, target: string | null): boolean => {
    if (vis !== 'player' || isValidTarget(target)) return true;
    toast.error('Elige a qué jugador va dirigida la tirada');
    return false;
  };

  const rollDice = async (roll: TrayRoll, repeat: boolean) => {
    const vis = repeat && last ? last.visibility : visibility;
    const target = vis === 'player' ? (repeat && last ? last.targetUserId : targetUserId) : null;
    if (!checkTarget(vis, target)) return;
    setBusy('dice');
    try {
      await emitAck('roll:dice', { formula: roll.formula, mode: roll.mode, label: roll.label || undefined, visibility: vis, targetUserId: target });
      rememberLast(roll, vis, target);
    } catch (err) {
      toast.fromError(err, 'No se pudo lanzar la tirada');
    } finally {
      setBusy(null);
    }
  };

  const rollRoller = async (roller: Roller) => {
    const target = visibility === 'player' ? targetUserId : null;
    if (!checkTarget(visibility, target)) return;
    setBusy(roller.id);
    try {
      await emitAck('roll:roller', { rollerId: roller.id, visibility, targetUserId: target });
    } catch (err) {
      toast.fromError(err, 'No se pudo lanzar');
    } finally {
      setBusy(null);
    }
  };

  const lastTargetName = last?.visibility === 'player' ? players.find((p) => p.userId === last.targetUserId)?.name ?? null : null;
  const lastSuffix = last ? (last.visibility === 'player' && lastTargetName ? `solo ${lastTargetName}` : VISIBILITY_TEXT[last.visibility]) : null;

  const visibilityControls = (
    <div className="space-y-1.5">
      <span className="label mb-0">¿Quién ve el resultado?</span>
      <VisibilityPicker value={visibility} onChange={(v) => patchDiceTray({ visibility: v })} choices={ROLL_VISIBILITY} ariaLabel="Visibilidad de la tirada" />
      {visibility === 'player' &&
        (players.length > 0 ? (
          <Select<string | null>
            size="sm"
            aria-label="Jugador que verá la tirada"
            value={isValidTarget(targetUserId) ? targetUserId : null}
            onChange={(v) => patchDiceTray({ targetUserId: v })}
            placeholder="Elige el jugador…"
            options={playerOptions(players)}
          />
        ) : (
          <p className="text-[11px] text-blood-300">No hay jugadores en la partida.</p>
        ))}
    </div>
  );

  return (
    <>
      <Section title="Mesa de dados" icon={<Dices />}>
        <DiceTray busy={busy === 'dice'} onRoll={(r, repeat) => void rollDice(r, repeat)} lastSuffix={lastSuffix}>
          {visibilityControls}
        </DiceTray>
      </Section>

      {requests && requests.length > 0 && <PendingRequests requests={requests} players={players} rollers={rollers} />}

      <RequestForm players={players} rollers={active} />

      <Section
        title="Ruletas y dados de la campaña"
        icon={<Sparkles />}
        actions={<IconButton size="xs" icon={<Settings2 />} title="Gestionar ruletas y dados" onClick={() => setManaging(true)} />}
      >
        {active.length === 0 ? (
          <EmptyState
            compact
            icon={<Sparkles />}
            title="No hay ruletas activas"
            description="Crea ruletas y dados especiales o activa alguno."
            action={
              <Button size="sm" icon={<Settings2 />} onClick={() => setManaging(true)}>
                Gestionar ruletas
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              {active.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void rollRoller(r)}
                  title={r.description || r.name}
                  className="group flex min-w-0 flex-col gap-1 rounded-lg border border-ink-600 bg-ink-800/70 px-2 py-1.5 text-left transition hover:border-gold-600/70 hover:bg-ink-700 hover:shadow-glow-gold active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {r.kind === 'roulette' ? (
                      <MiniWheel segments={r.segments} size={20} className="transition duration-500 group-hover:rotate-90" />
                    ) : (
                      <DieGlyph sides={r.faces && r.faces.length > 0 ? 6 : 20} size={20} />
                    )}
                    <span className="truncate text-xs font-semibold text-parchment-100">{r.name}</span>
                  </span>
                  {r.kind === 'roulette' ? (
                    <SegmentStrip segments={r.segments} className="h-1" />
                  ) : (
                    <span className="truncate font-mono text-[10px] text-gold-300/90">
                      {r.faces && r.faces.length > 0 ? `${r.faces.length} caras` : prettyFormula(r.formula) || '—'}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-parchment-400">
              Se lanzan con la visibilidad elegida en la mesa de dados ({VISIBILITY_TEXT[visibility]}).
            </p>
          </>
        )}
      </Section>

      <Section title="Tiradas" icon={<Dices />}>
        <RollHistory compact />
      </Section>

      <Modal
        open={managing}
        onClose={() => setManaging(false)}
        size="xl"
        title="Ruletas y dados de la campaña"
        subtitle="Los cambios se aplican al instante en la partida."
        icon={<Settings2 />}
      >
        <div className="h-[min(70vh,760px)]">{campaignId && <RollerManager campaignId={campaignId} live />}</div>
      </Modal>
    </>
  );
}

const ALL_PLAYERS = '__all__';

function RequestForm({ players, rollers }: { players: PlayerOption[]; rollers: Roller[] }) {
  const pool = useDiceTray((s) => s.requestPool);
  const mode = useDiceTray((s) => s.requestMode);
  const [target, setTarget] = useState<string | null>(null);
  const [source, setSource] = useState<'dice' | 'roller'>('dice');
  const [rollerId, setRollerId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [visibility, setVisibility] = useState<RollVisibility>('public');
  const [sending, setSending] = useState(false);

  const roller = rollerId ? rollers.find((r) => r.id === rollerId) ?? null : null;
  const formula = poolFormula(pool);

  const send = async () => {
    const targets = target === ALL_PLAYERS ? players.map((p) => p.userId) : target && players.some((p) => p.userId === target) ? [target] : [];
    if (targets.length === 0) {
      toast.error('Elige a qué jugador pedirle la tirada');
      return;
    }
    if (source === 'dice' && !formula) {
      toast.error('Pon al menos un dado en la mesa de la petición');
      return;
    }
    if (source === 'roller' && !roller) {
      toast.error('Elige una ruleta o un dado de la campaña');
      return;
    }
    const finalLabel = label.trim() || (source === 'roller' && roller ? roller.name : 'Tirada');
    setSending(true);
    try {
      const results = await Promise.allSettled(
        targets.map((userId) =>
          emitAck('roll:request', {
            targetUserId: userId,
            label: finalLabel,
            formula: source === 'dice' && formula ? formula : undefined,
            rollerId: source === 'roller' && roller ? roller.id : undefined,
            mode: source === 'dice' ? effectivePoolMode(pool, mode) : 'normal',
            visibility,
          }),
        ),
      );
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed.length === 0) {
        toast.success(targets.length > 1 ? `Petición enviada a ${targets.length} jugadores` : 'Petición enviada');
        setLabel('');
      } else {
        toast.fromError(failed[0]!.reason, 'No se pudo enviar la petición');
      }
    } finally {
      setSending(false);
    }
  };

  const targetOptions: SelectOption<string | null>[] = [
    ...(players.length > 1 ? [{ value: ALL_PLAYERS, label: 'Todos los jugadores' }] : []),
    ...playerOptions(players),
  ];

  const sourceOptions: SegmentedOption<'dice' | 'roller'>[] = [
    { value: 'dice', label: 'Dados', icon: <Dices /> },
    { value: 'roller', label: 'Ruleta o dado especial', icon: <Sparkles /> },
  ];

  return (
    <Section title="Pedir tirada a un jugador" icon={<Hand />} collapsible defaultOpen={false}>
      {players.length === 0 ? (
        <p className="text-xs text-parchment-400">Cuando haya jugadores en la partida podrás pedirles tiradas.</p>
      ) : (
        <div className="space-y-3">
          <Select<string | null> size="sm" label="¿A quién?" value={target} onChange={setTarget} placeholder="Elige un jugador…" options={targetOptions} />
          <div>
            <span className="label">¿Qué debe tirar?</span>
            <Segmented value={source} onChange={setSource} ariaLabel="Tipo de tirada pedida" options={sourceOptions} />
          </div>
          {source === 'dice' ? (
            <DicePoolBuilder
              compact
              pool={pool}
              onChange={(next) => patchDiceTray({ requestPool: next })}
              mode={mode}
              onModeChange={(m) => patchDiceTray({ requestMode: m })}
              emptyHint="Elige los dados que tendrá que tirar."
            />
          ) : rollers.length === 0 ? (
            <p className="text-[11px] text-parchment-400">No hay ruletas activas en la campaña.</p>
          ) : (
            <Select<string | null>
              size="sm"
              aria-label="Ruleta o dado pedido"
              value={rollerId}
              onChange={setRollerId}
              placeholder="Elige una ruleta o dado…"
              options={rollers.map((r) => ({ value: r.id, label: `${r.kind === 'roulette' ? '🎡' : '🎲'} ${r.name}` }))}
            />
          )}
          <TextInput
            size="sm"
            label="Etiqueta"
            value={label}
            onValueChange={setLabel}
            maxLength={80}
            placeholder={source === 'roller' && roller ? roller.name : 'Percepción, Salvación de Destreza…'}
          />
          <div className="space-y-1.5">
            <span className="label mb-0">¿Quién verá el resultado?</span>
            <VisibilityPicker value={visibility} onChange={setVisibility} choices={REQUEST_VISIBILITY} ariaLabel="Visibilidad del resultado" />
          </div>
          <Button variant="primary" block icon={<Send />} loading={sending} onClick={() => void send()}>
            Pedir tirada
          </Button>
        </div>
      )}
    </Section>
  );
}

function PendingRequests({ requests, players, rollers }: { requests: RollRequest[]; players: PlayerOption[]; rollers: Roller[] }) {
  const [cancelling, setCancelling] = useState<string | null>(null);
  const cancel = async (id: string) => {
    setCancelling(id);
    try {
      await emitAck('roll:cancel', { requestId: id });
    } catch (err) {
      toast.fromError(err, 'No se pudo cancelar la petición');
    } finally {
      setCancelling(null);
    }
  };
  return (
    <Section title={`Esperando tiradas (${requests.length})`} icon={<Hand />} highlight>
      <ul className="space-y-1.5">
        {requests.map((r) => {
          const p = players.find((x) => x.userId === r.targetUserId);
          const what = r.formula ? prettyFormula(r.formula) : r.rollerId ? rollers.find((x) => x.id === r.rollerId)?.name ?? 'ruleta' : '—';
          return (
            <li key={r.id} className="flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-800/60 px-2 py-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p?.color ?? '#a8946b' }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-parchment-100">
                  {p ? p.name : 'Jugador'} · {r.label}
                </div>
                <div className="flex flex-wrap items-center gap-1 text-[10px] text-parchment-400">
                  <span className="font-mono text-gold-300/90">{what}</span>
                  <ModeBadge mode={r.mode} />
                  {r.source === 'turn' && (
                    <Badge size="xs" tone="gold">
                      De turno
                    </Badge>
                  )}
                  <span>· {formatRelative(r.createdAt)}</span>
                </div>
              </div>
              <IconButton size="xs" variant="danger" icon={<X />} title="Cancelar petición" loading={cancelling === r.id} onClick={() => void cancel(r.id)} />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

function PlayerDice() {
  const view = useSessionStore((s) => s.view);
  const rules = useSessionStore((s) => s.campaign?.rules ?? null);
  const lookupRoller = useRollerLookup();
  const [busy, setBusy] = useState<string | null>(null);

  const me = view?.meUserId ?? null;
  const requests = useMemo(() => (view && me ? view.state.rollRequests.filter((r) => r.targetUserId === me) : []), [view, me]);
  const offer = view && me && view.state.turnOffer?.userId === me ? view.state.turnOffer : null;
  const offered = useMemo(() => (offer ? resolveOffered(offer.rollerIds, lookupRoller) : []), [offer, lookupRoller]);
  const wantedRollerIds = useMemo(
    () => [...(offer?.rollerIds ?? []), ...requests.map((r) => r.rollerId).filter((id): id is string => !!id)],
    [offer, requests],
  );
  useEnsureRollers(wantedRollerIds);

  const run = async (key: string, fn: () => Promise<unknown>, fallback: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(key);
    try {
      await fn();
      return true;
    } catch (err) {
      toast.fromError(err, fallback);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const rollFree = async (roll: TrayRoll) => {
    const ok = await run(
      'dice',
      () => emitAck('roll:dice', { formula: roll.formula, mode: roll.mode, label: roll.label || undefined, visibility: 'public' }),
      'No se pudo lanzar la tirada',
    );
    if (ok) rememberLast(roll, 'public', null);
  };

  return (
    <>
      {requests.length > 0 && (
        <Section title="El DM te pide una tirada" icon={<Hand />} highlight>
          <ul className="space-y-1.5">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center gap-2.5 rounded-lg border border-gold-700/50 bg-ink-800/70 px-2.5 py-2">
                <DieGlyph sides={20} size={30} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-parchment-50">{r.label || 'Tirada'}</div>
                  <div className="flex flex-wrap items-center gap-1 text-[11px] text-parchment-400">
                    <span className="font-mono text-gold-300/90">
                      {r.formula ? prettyFormula(r.formula) : r.rollerId ? lookupRoller(r.rollerId)?.name ?? 'ruleta o dado del DM' : '—'}
                    </span>
                    <ModeBadge mode={r.mode} />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  epic
                  loading={busy === r.id}
                  disabled={busy !== null && busy !== r.id}
                  onClick={() =>
                    void run(
                      r.id,
                      async () => {
                        const result = await emitAck('roll:fulfill', { requestId: r.id });
                        if (result.visibility === 'secret') toast.info('Tirada enviada: solo el DM verá el resultado');
                      },
                      'No se pudo lanzar la tirada',
                    )
                  }
                >
                  ¡Tirar!
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {offer && (
        <Section title="Es tu turno" icon={<Sparkles />} highlight>
          <p className="mb-2 text-xs text-parchment-300">¿Quieres lanzar…?</p>
          <div className="flex flex-col gap-1.5">
            {offered.map((o) => (
              <Button
                key={o.id}
                variant="primary"
                block
                loading={busy === `offer:${o.id}`}
                disabled={busy !== null && busy !== `offer:${o.id}`}
                icon={o.roller?.kind === 'roulette' ? <MiniWheel segments={o.roller.segments} size={18} /> : <DieGlyph sides={o.roller?.faces && o.roller.faces.length > 0 ? 6 : 20} size={18} />}
                onClick={() => void run(`offer:${o.id}`, () => emitAck('roll:roller', { rollerId: o.id }), 'No se pudo lanzar')}
              >
                {o.name}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              block
              loading={busy === 'dismiss'}
              disabled={busy !== null && busy !== 'dismiss'}
              onClick={() => void run('dismiss', () => emitAck('roll:dismissOffer', {}), 'No se pudo descartar la oferta')}
            >
              Ahora no
            </Button>
          </div>
        </Section>
      )}

      {rules?.playersCanRollFreely ? (
        <Section title="Mesa de dados" icon={<Dices />}>
          <DiceTray busy={busy === 'dice'} note="Tus tiradas son públicas: todos verán el resultado." onRoll={(roll) => void rollFree(roll)} />
        </Section>
      ) : (
        rules && (
          <Section title="Mesa de dados" icon={<Dices />}>
            <p className="text-xs leading-relaxed text-parchment-300">
              En esta campaña el DM no permite tiradas libres. Cuando te pida una tirada aparecerá aquí con el botón «¡Tirar!».
            </p>
          </Section>
        )
      )}

      <Section title="Tiradas" icon={<Dices />}>
        <RollHistory compact />
      </Section>
    </>
  );
}
