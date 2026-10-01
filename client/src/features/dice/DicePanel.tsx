import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  ChevronDown,
  Dices,
  Globe,
  Hand,
  Lock,
  RotateCw,
  Send,
  Settings2,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import { supportsAdvantage, type RollMode, type RollRequest, type RollVisibility, type Roller } from '@wailers/shared';
import { emitAck } from '../../api/socket';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { Modal } from '../../components/ui/Modal';
import { Select, type SelectOption } from '../../components/ui/Select';
import { Stepper } from '../../components/ui/Stepper';
import { TextInput } from '../../components/ui/TextInput';
import { toast } from '../../components/ui/toast';
import { formatRelative } from '../../lib/format';
import { useSessionStore } from '../../stores/session';
import { RollerManager } from '../rollers/RollerManager';
import { DieGlyph } from './DieShapes';
import { playerLabel, useSessionPlayers, type PlayerOption } from './diceHooks';
import { combineFormula, FORMULA_EXAMPLES, formulaError, MODE_LABELS, QUICK_DICE } from './diceUtils';
import { resolveOffered, useOfferedRollers } from './offeredRollers';
import { RollHistory } from './RollHistory';
import { MiniWheel, SegmentStrip } from './RouletteWheel';
import { Segmented, type SegmentedOption } from './Segmented';

/**
 * Live game dice tray. DM: free dice with visibility, campaign rollers, roll requests and live roller
 * editing. Players: requests addressed to them, turn offers and (if the campaign allows) public free dice.
 * Every result is only shown, never applied.
 */
export function DicePanel() {
  const role = useSessionStore((s) => s.view?.role ?? null);
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
    <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-parchment-300">
      {icon && <span className="text-gold-400 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
      <span className="truncate">{title}</span>
    </span>
  );
  return (
    <section className={clsx('rounded-xl border bg-ink-900/60 p-2.5', highlight ? 'border-gold-600/60 shadow-glow-gold' : 'border-ink-600/70')}>
      <div className="flex items-center justify-between gap-2">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex min-w-0 flex-1 items-center gap-1 rounded text-left hover:text-parchment-100"
          >
            {heading}
            <ChevronDown className={clsx('ml-auto h-3.5 w-3.5 shrink-0 text-parchment-400 transition-transform', open && 'rotate-180')} />
          </button>
        ) : (
          heading
        )}
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {(!collapsible || open) && <div className="mt-2.5">{children}</div>}
    </section>
  );
}

const MODE_OPTIONS: SegmentedOption<RollMode>[] = [
  { value: 'normal', label: MODE_LABELS.normal },
  { value: 'advantage', label: MODE_LABELS.advantage, title: 'Ventaja: se tiran dos d20 y se queda el mayor' },
  { value: 'disadvantage', label: MODE_LABELS.disadvantage, title: 'Desventaja: se tiran dos d20 y se queda el menor' },
];

const VISIBILITY_OPTIONS: SegmentedOption<RollVisibility>[] = [
  { value: 'public', label: 'Pública', icon: <Globe />, title: 'Todos ven la tirada' },
  { value: 'player', label: 'Un jugador', icon: <UserRound />, title: 'Solo la ve un jugador (y tú)' },
  { value: 'secret', label: 'Secreta', icon: <Lock />, title: 'Solo la ves tú' },
];

const REQUEST_VISIBILITY_OPTIONS: SegmentedOption<RollVisibility>[] = [
  { value: 'public', label: 'Pública', icon: <Globe />, title: 'Todos verán el resultado' },
  { value: 'player', label: 'Él y el DM', icon: <UserRound />, title: 'Solo el jugador y tú veréis el resultado' },
  { value: 'secret', label: 'Secreta', icon: <Lock />, title: 'Solo tú verás el resultado' },
];

function playerOptions(players: PlayerOption[]): SelectOption<string>[] {
  return players.map((p) => ({ value: p.userId, label: `${playerLabel(p)}${p.connected ? '' : ' (desconectado)'}` }));
}

function sortedActive(rollers: Roller[]): Roller[] {
  return rollers
    .filter((r) => r.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'));
}

// ---------------------------------------------------------------------------
// Dice tray (shared by DM and players)
// ---------------------------------------------------------------------------

interface TrayProps {
  busy: boolean;
  /** Called with the final formula (modifier included) and the effective mode. */
  onRoll: (formula: string, mode: RollMode, label: string) => void;
  /** Extra controls (visibility) rendered before the roll button. */
  children?: ReactNode;
  note?: ReactNode;
}

function DiceTray({ busy, onRoll, children, note }: TrayProps) {
  const [formula, setFormula] = useState('');
  const [modifier, setModifier] = useState(0);
  const [mode, setMode] = useState<RollMode>('normal');
  const [label, setLabel] = useState('');
  const [touched, setTouched] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  const finalFormula = combineFormula(formula, modifier);
  const error = formula.trim() ? formulaError(finalFormula) : touched ? 'Escribe una fórmula, por ejemplo 2d6+3' : null;
  const advantageApplies = formula.trim() ? supportsAdvantage(finalFormula) : true;

  const fire = (raw: string) => {
    const err = formulaError(raw);
    if (err) {
      toast.error(err);
      return;
    }
    setLast(raw);
    onRoll(raw, supportsAdvantage(raw) ? mode : 'normal', label.trim());
  };

  const quick = (sides: number, append: boolean) => {
    if (append) {
      const term = `1d${sides}`;
      setFormula((f) => (f.trim() ? `${f.trim()}+${term}` : term));
      return;
    }
    fire(combineFormula(`1d${sides}`, modifier));
  };

  const submit = () => {
    setTouched(true);
    if (!formula.trim()) {
      toast.error('Escribe una fórmula, por ejemplo 2d6+3');
      return;
    }
    fire(finalFormula);
  };

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-4 gap-1.5">
        {QUICK_DICE.map((sides) => (
          <button
            key={sides}
            type="button"
            disabled={busy}
            onClick={(e) => quick(sides, e.shiftKey)}
            title={`Lanzar 1d${sides}${modifier ? ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}` : ''} (Mayús+clic: añadir a la fórmula)`}
            className="group flex flex-col items-center gap-0.5 rounded-lg border border-ink-600 bg-ink-800/70 px-1 pb-1 pt-1.5 transition duration-150 hover:-translate-y-0.5 hover:border-gold-600/70 hover:bg-ink-700 hover:shadow-glow-gold active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
          >
            <DieGlyph sides={sides} size={34} className="transition duration-300 group-hover:rotate-12 group-hover:scale-110" />
            <span className="text-[11px] font-semibold text-parchment-200">d{sides === 100 ? '100' : sides}</span>
          </button>
        ))}
        <button
          type="button"
          disabled={busy || !last}
          onClick={() => last && fire(last)}
          title={last ? `Repetir ${last}` : 'Aún no has lanzado nada'}
          className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink-500 bg-ink-900/60 px-1 py-1.5 text-parchment-300 transition hover:border-gold-600/70 hover:text-gold-200 disabled:pointer-events-none disabled:opacity-40"
        >
          <RotateCw className="h-5 w-5" />
          <span className="max-w-full truncate text-[10px] font-semibold">{last ?? 'Repetir'}</span>
        </button>
      </div>

      <TextInput
        size="sm"
        label="Fórmula"
        value={formula}
        placeholder="2d6+3, 4d6kh3, 1d20+5…"
        className="font-mono"
        error={error}
        onValueChange={(v) => setFormula(v)}
        onBlur={() => formula.trim() && setTouched(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        spellCheck={false}
        autoComplete="off"
      />
      <div className="flex flex-wrap gap-1">
        {FORMULA_EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setFormula(ex)}
            className="rounded-full border border-ink-600 bg-ink-800 px-2 py-0.5 font-mono text-[10px] text-parchment-300 transition hover:border-gold-700 hover:text-gold-200"
          >
            {ex}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <Stepper label="Modificador" size="sm" value={modifier} min={-99} max={99} onChange={(v) => setModifier(v)} format={(v) => (v > 0 ? `+${v}` : String(v))} />
        <div className="min-w-0 flex-1">
          <span className="label">Modo</span>
          <Segmented value={mode} onChange={setMode} options={MODE_OPTIONS} ariaLabel="Modo de tirada" />
        </div>
      </div>
      {mode !== 'normal' && !advantageApplies && (
        <p className="text-[11px] text-parchment-400">La ventaja y la desventaja solo se aplican a fórmulas con un único d20.</p>
      )}

      <TextInput size="sm" label="Etiqueta (opcional)" value={label} placeholder="Ataque con espada, Percepción…" maxLength={80} onValueChange={setLabel} />

      {children}

      <Button variant="primary" epic block loading={busy} icon={<Dices />} onClick={submit}>
        {formula.trim() && !error ? `Lanzar ${finalFormula}` : 'Lanzar'}
      </Button>
      {note && <p className="text-center text-[11px] text-parchment-400">{note}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DM
// ---------------------------------------------------------------------------

function DmDice() {
  const campaignId = useSessionStore((s) => s.view?.state.campaignId ?? '');
  const rollers = useSessionStore((s) => s.rollers);
  const requests = useSessionStore((s) => s.view?.state.rollRequests ?? null);
  const players = useSessionPlayers();
  const [visibility, setVisibility] = useState<RollVisibility>('public');
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);

  const active = useMemo(() => sortedActive(rollers), [rollers]);
  const target = visibility === 'player' ? targetUserId : null;
  const targetValid = visibility !== 'player' || (!!targetUserId && players.some((p) => p.userId === targetUserId));

  const checkTarget = (): boolean => {
    if (targetValid) return true;
    toast.error('Elige a qué jugador va dirigida la tirada');
    return false;
  };

  const rollDice = async (formula: string, mode: RollMode, label: string) => {
    if (!checkTarget()) return;
    setBusy('dice');
    try {
      await emitAck('roll:dice', { formula, mode, label: label || undefined, visibility, targetUserId: target });
    } catch (err) {
      toast.fromError(err, 'No se pudo lanzar la tirada');
    } finally {
      setBusy(null);
    }
  };

  const rollRoller = async (roller: Roller) => {
    if (!checkTarget()) return;
    setBusy(roller.id);
    try {
      await emitAck('roll:roller', { rollerId: roller.id, visibility, targetUserId: target });
    } catch (err) {
      toast.fromError(err, 'No se pudo lanzar');
    } finally {
      setBusy(null);
    }
  };

  const visibilityControls = (
    <div className="space-y-1.5">
      <span className="label">Visibilidad</span>
      <Segmented value={visibility} onChange={setVisibility} options={VISIBILITY_OPTIONS} ariaLabel="Visibilidad de la tirada" />
      {visibility === 'player' &&
        (players.length > 0 ? (
          <Select<string | null>
            size="sm"
            aria-label="Jugador que verá la tirada"
            value={targetUserId}
            onChange={setTargetUserId}
            placeholder="Elige un jugador…"
            options={playerOptions(players)}
          />
        ) : (
          <p className="text-[11px] text-blood-300">No hay jugadores en la partida.</p>
        ))}
    </div>
  );

  return (
    <>
      <Section title="Tirar dados" icon={<Dices />}>
        <DiceTray busy={busy === 'dice'} onRoll={(f, m, l) => void rollDice(f, m, l)}>
          {visibilityControls}
        </DiceTray>
      </Section>

      <Section
        title="Dados y ruletas de la campaña"
        icon={<Sparkles />}
        actions={<IconButton size="xs" icon={<Settings2 />} title="Gestionar ruletas" onClick={() => setManaging(true)} />}
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
                      {r.faces && r.faces.length > 0 ? `${r.faces.length} caras` : r.formula ?? '—'}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-parchment-400">Se lanzan con la visibilidad elegida arriba.</p>
          </>
        )}
        <Button size="sm" variant="ghost" block className="mt-2" icon={<Settings2 />} onClick={() => setManaging(true)}>
          Gestionar ruletas
        </Button>
      </Section>

      <RequestForm players={players} rollers={active} />

      {requests && requests.length > 0 && <PendingRequests requests={requests} players={players} rollers={rollers} />}

      <Section title="Tiradas" icon={<Dices />}>
        <RollHistory compact />
      </Section>

      <Modal
        open={managing}
        onClose={() => setManaging(false)}
        size="xl"
        title="Dados y ruletas de la campaña"
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
  const [target, setTarget] = useState<string | null>(null);
  const [source, setSource] = useState<'formula' | 'roller'>('formula');
  const [formula, setFormula] = useState('1d20');
  const [rollerId, setRollerId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<RollMode>('normal');
  const [visibility, setVisibility] = useState<RollVisibility>('public');
  const [sending, setSending] = useState(false);

  const roller = rollerId ? rollers.find((r) => r.id === rollerId) ?? null : null;
  const fError = source === 'formula' ? formulaError(formula) : null;

  const send = async () => {
    const targets = target === ALL_PLAYERS ? players.map((p) => p.userId) : target && players.some((p) => p.userId === target) ? [target] : [];
    if (targets.length === 0) {
      toast.error('Elige a qué jugador pedirle la tirada');
      return;
    }
    if (source === 'formula' && fError) {
      toast.error(fError);
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
            formula: source === 'formula' ? formula.trim() : undefined,
            rollerId: source === 'roller' && roller ? roller.id : undefined,
            mode: source === 'formula' && supportsAdvantage(formula) ? mode : 'normal',
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

  return (
    <Section title="Pedir tirada" icon={<Hand />} collapsible defaultOpen={false}>
      {players.length === 0 ? (
        <p className="text-xs text-parchment-400">Cuando haya jugadores en la partida podrás pedirles tiradas.</p>
      ) : (
        <div className="space-y-2.5">
          <Select<string | null> size="sm" label="Jugador" value={target} onChange={setTarget} placeholder="Elige un jugador…" options={targetOptions} />
          <div>
            <span className="label">Qué debe tirar</span>
            <Segmented
              value={source}
              onChange={setSource}
              ariaLabel="Tipo de tirada pedida"
              options={[
                { value: 'formula', label: 'Fórmula', icon: <Dices /> },
                { value: 'roller', label: 'Ruleta o dado', icon: <Sparkles /> },
              ]}
            />
          </div>
          {source === 'formula' ? (
            <>
              <TextInput size="sm" value={formula} onValueChange={setFormula} className="font-mono" placeholder="1d20+3" error={fError} aria-label="Fórmula pedida" spellCheck={false} />
              <div>
                <span className="label">Modo</span>
                <Segmented value={mode} onChange={setMode} options={MODE_OPTIONS} ariaLabel="Modo de la tirada pedida" />
              </div>
            </>
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
          <TextInput size="sm" label="Etiqueta" value={label} onValueChange={setLabel} maxLength={80} placeholder={source === 'roller' && roller ? roller.name : 'Percepción, Salvación de Destreza…'} />
          <div>
            <span className="label">Quién verá el resultado</span>
            <Segmented value={visibility} onChange={setVisibility} options={REQUEST_VISIBILITY_OPTIONS} ariaLabel="Visibilidad del resultado" />
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
    <Section title={`Peticiones pendientes (${requests.length})`} icon={<Hand />} highlight>
      <ul className="space-y-1.5">
        {requests.map((r) => {
          const p = players.find((x) => x.userId === r.targetUserId);
          const what = r.formula ?? (r.rollerId ? rollers.find((x) => x.id === r.rollerId)?.name ?? 'ruleta' : '—');
          return (
            <li key={r.id} className="flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-800/60 px-2 py-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p?.color ?? '#a8946b' }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-parchment-100">
                  {p ? p.name : 'Jugador'} · {r.label}
                </div>
                <div className="flex flex-wrap items-center gap-1 text-[10px] text-parchment-400">
                  <span className="font-mono text-gold-300/90">{what}</span>
                  {r.mode !== 'normal' && (
                    <Badge size="xs" tone={r.mode === 'advantage' ? 'emerald' : 'blood'}>
                      {MODE_LABELS[r.mode]}
                    </Badge>
                  )}
                  {r.source === 'turn' && <Badge size="xs" tone="gold">De turno</Badge>}
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
  const sessionId = useSessionStore((s) => s.sessionId);
  const rules = useSessionStore((s) => s.campaign?.rules ?? null);
  const offeredState = useOfferedRollers();
  const [busy, setBusy] = useState<string | null>(null);

  const me = view?.meUserId ?? null;
  const requests = useMemo(() => (view && me ? view.state.rollRequests.filter((r) => r.targetUserId === me) : []), [view, me]);
  const offer = view && me && view.state.turnOffer?.userId === me ? view.state.turnOffer : null;
  const offered = useMemo(() => (offer ? resolveOffered(offer.rollerIds, offeredState, sessionId) : []), [offer, offeredState, sessionId]);

  const run = async (key: string, fn: () => Promise<unknown>, fallback: string) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast.fromError(err, fallback);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {requests.length > 0 && (
        <Section title="El DM te pide" icon={<Hand />} highlight>
          <ul className="space-y-1.5">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg border border-gold-700/50 bg-ink-800/70 px-2 py-1.5">
                <span className="text-xl leading-none" aria-hidden>
                  🎲
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-parchment-50">{r.label || 'Tirada'}</div>
                  <div className="flex flex-wrap items-center gap-1 text-[10px] text-parchment-400">
                    <span className="font-mono text-gold-300/90">{r.formula ?? (r.rollerId ? offeredState.known[r.rollerId]?.name ?? 'ruleta' : '—')}</span>
                    {r.mode !== 'normal' && (
                      <Badge size="xs" tone={r.mode === 'advantage' ? 'emerald' : 'blood'}>
                        {MODE_LABELS[r.mode]}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  epic
                  loading={busy === r.id}
                  disabled={busy !== null && busy !== r.id}
                  onClick={() => void run(r.id, () => emitAck('roll:fulfill', { requestId: r.id }), 'No se pudo lanzar la tirada')}
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
                icon={o.roller?.kind === 'roulette' ? <MiniWheel segments={o.roller.segments} size={18} /> : <DieGlyph sides={20} size={18} />}
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
        <Section title="Tirar dados" icon={<Dices />}>
          <DiceTray
            busy={busy === 'dice'}
            note="Tus tiradas libres son públicas: todos verán el resultado."
            onRoll={(formula, mode, label) =>
              void run('dice', () => emitAck('roll:dice', { formula, mode, label: label || undefined, visibility: 'public' }), 'No se pudo lanzar la tirada')
            }
          />
        </Section>
      ) : (
        rules && (
          <Section title="Tirar dados" icon={<Dices />}>
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
