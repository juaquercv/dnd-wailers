import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Lock, UserRound } from 'lucide-react';
import { targetRotation, type DieResult, type RollResult } from '@wailers/shared';
import { Badge } from '../../components/ui/Badge';
import { uiSounds } from '../audio/uiSounds';
import { D6Cube, DieView } from './DieShapes';
import { RouletteWheel } from './RouletteWheel';
import { useCountUp, useElapsed, useThrottled } from './diceHooks';
import { prettyFormula } from './dicePool';
import { hashString, hashUnit, MODE_LABELS, rollBreakdown, rollTitle, seededRandom } from './diceUtils';
import './dice.css';

/**
 * Animated presentation of a roll result (dice, roulette or custom die).
 * Purely visual: it never changes anything in the game.
 */
export interface RollStageProps {
  roll: RollResult;
  /** 'overlay' = big full-screen presentation; 'inline' = inside a panel/modal. */
  variant: 'overlay' | 'inline';
  reducedMotion: boolean;
  /** The result is fully revealed (animations finished). */
  onSettled?: () => void;
  /** Click on the result card (the overlay uses it to skip). */
  onCardClick?: () => void;
  /** Display name of the single player allowed to see a 'player' roll. */
  targetName?: string | null;
  /** Color of the user who rolled. */
  rollerColor?: string | null;
  /** Extra line under the title (e.g. the roller's name). */
  extra?: ReactNode;
  /** Hide visibility badges (local previews). */
  hideVisibility?: boolean;
  /** Extra badge shown next to the others (e.g. "Prueba local"). */
  badge?: ReactNode;
  /** Wheel size in px for roulettes. */
  wheelSize?: number;
  /** Footer hint (overlay: "Clic o Esc para continuar"). */
  hint?: ReactNode;
  /** Dice: time until the last die lands (read once, when the stage mounts). */
  rollMs?: number;
}

export function RollStage(props: RollStageProps) {
  if (props.roll.kind === 'roulette') return <RouletteScene {...props} />;
  if (props.roll.kind === 'custom_die') return <CustomDieScene {...props} />;
  return <DiceScene {...props} />;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function StageHeader({ roll, rollerColor, verb, extra }: { roll: RollResult; rollerColor?: string | null; verb: string; extra?: ReactNode }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-parchment-300">
        <span className="h-2 w-2 shrink-0 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: rollerColor ?? '#e9c063', color: rollerColor ?? '#e9c063' }} />
        <span className="truncate">
          {roll.rollerName}
          {roll.byDm && roll.rollerName.trim().toUpperCase() !== 'DM' ? ' (DM)' : ''} {verb}
        </span>
      </div>
      <div className="mt-1 truncate font-display text-2xl font-bold leading-tight text-parchment-50 [text-shadow:0_2px_10px_rgba(0,0,0,0.8)] sm:text-[1.7rem]">
        {rollTitle(roll)}
      </div>
      {extra && <div className="mt-0.5 truncate text-xs text-parchment-300">{extra}</div>}
    </div>
  );
}

function RollBadges({ roll, targetName, hideVisibility, badge }: { roll: RollResult; targetName?: string | null; hideVisibility?: boolean; badge?: ReactNode }) {
  const items: ReactNode[] = [];
  if (roll.formula) {
    items.push(
      <span key="f" className="chip border-gold-700/50 bg-ink-950/70 font-mono text-gold-200">
        {prettyFormula(roll.formula)}
      </span>,
    );
  }
  if (roll.mode !== 'normal' && roll.kind === 'dice') {
    items.push(
      <Badge key="m" tone={roll.mode === 'advantage' ? 'emerald' : 'blood'}>
        {MODE_LABELS[roll.mode]}
      </Badge>,
    );
  }
  if (!hideVisibility && roll.visibility === 'secret') {
    items.push(
      <Badge key="v" tone="arcane" icon={<Lock />}>
        Secreta
      </Badge>,
    );
  }
  if (!hideVisibility && roll.visibility === 'player') {
    items.push(
      <Badge key="v" tone="sky" icon={<UserRound />}>
        Solo para {targetName ?? 'un jugador'}
      </Badge>,
    );
  }
  if (roll.requestId) {
    items.push(
      <Badge key="r" tone="gold">
        Pedida por el DM
      </Badge>,
    );
  }
  if (badge) items.push(<span key="b">{badge}</span>);
  if (items.length === 0) return null;
  return <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">{items}</div>;
}

function Particles({ seed, count, distance }: { seed: number; count: number; distance: number }) {
  const items = useMemo(() => {
    const rnd = seededRandom(seed ^ 0x9e3779b9);
    return Array.from({ length: count }, () => {
      const a = rnd() * Math.PI * 2;
      const d = distance * (0.45 + rnd() * 0.75);
      return {
        dx: Math.cos(a) * d,
        dy: Math.sin(a) * d - distance * 0.15,
        size: 4 + rnd() * 9,
        dur: 900 + rnd() * 800,
        delay: rnd() * 260,
      };
    });
  }, [seed, count, distance]);
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0" aria-hidden>
      {items.map((p, i) => (
        <span
          key={i}
          className="wl-particle"
          style={
            {
              '--wl-dx': `${p.dx.toFixed(1)}px`,
              '--wl-dy': `${p.dy.toFixed(1)}px`,
              '--wl-p-size': `${p.size.toFixed(1)}px`,
              '--wl-p-dur': `${Math.round(p.dur)}ms`,
              '--wl-p-delay': `${Math.round(p.delay)}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function Crack({ width }: { width: number }) {
  return (
    <svg
      className="wl-crack pointer-events-none absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 overflow-visible"
      width={width}
      height={width * 0.5}
      viewBox="0 0 300 150"
      aria-hidden
    >
      <path
        d="M0 78 L38 66 L62 88 L98 52 L126 84 L152 60 L176 92 L210 58 L236 80 L268 64 L300 74"
        fill="none"
        stroke="#fff4f2"
        strokeWidth={3.2}
        strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 0 6px rgba(224,98,90,0.95)) drop-shadow(0 0 14px rgba(196,61,51,0.8))' }}
      />
      <path d="M98 52 L92 24 L104 8 M152 60 L160 30 M176 92 L170 120 L182 142 M236 80 L248 108" fill="none" stroke="#ef8f88" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Standard dice
// ---------------------------------------------------------------------------

/** Dice drawn on the table; the rest are summarised (they always count in the total). */
const MAX_VISIBLE_DICE = 12;

export const DEFAULT_OVERLAY_ROLL_MS = 3500;
const DEFAULT_INLINE_ROLL_MS = 2400;
const REDUCED_ROLL_MS = 450;

function dieSizeFor(count: number, variant: 'overlay' | 'inline'): number {
  if (variant === 'overlay') {
    if (count <= 1) return 148;
    if (count <= 2) return 132;
    if (count <= 4) return 112;
    if (count <= 6) return 96;
    if (count <= 9) return 84;
    return 72;
  }
  if (count <= 2) return 88;
  if (count <= 4) return 74;
  if (count <= 6) return 64;
  if (count <= 9) return 54;
  return 46;
}

interface DieTrack {
  /** Index in roll.dice. */
  index: number;
  die: DieResult;
  /** ms after mount when the die stops on its real value. */
  landAt: number;
  /** Random faces shown while rolling: value[i] from times[i]. */
  times: number[];
  values: number[];
  start: { sx: string; sy: string; rot: string };
}

/** Faces shown while a die rolls: changes fast at first and slows down until it lands. */
function faceSchedule(sides: number, final: number, landMs: number, seed: number): { times: number[]; values: number[] } {
  const rnd = seededRandom(seed ^ 0x5bd1e995);
  const minGap = Math.max(35, Math.min(60, landMs / 40));
  const maxGap = Math.max(minGap * 2, Math.min(380, landMs / 7));
  const times: number[] = [];
  const values: number[] = [];
  let t = 0;
  let prev = 0;
  while (t < landMs) {
    const gap = minGap + (maxGap - minGap) * Math.pow(t / landMs, 2.2);
    let v = 1 + Math.floor(rnd() * sides);
    if (sides > 2 && v === prev) v = (v % sides) + 1;
    times.push(t);
    values.push(v);
    prev = v;
    t += gap;
    if (t + gap * 0.5 > landMs) break;
  }
  // The last random face differs from the result, so the landing is noticeable.
  const last = values.length - 1;
  if (last >= 0 && sides > 1 && values[last] === final) values[last] = (final % sides) + 1;
  return { times, values };
}

function faceIndexAt(track: DieTrack, elapsed: number): number {
  let i = 0;
  while (i + 1 < track.times.length && track.times[i + 1]! <= elapsed) i++;
  return i;
}

function visibleIndices(dice: DieResult[], critIndex: number): number[] {
  const out = dice.slice(0, MAX_VISIBLE_DICE).map((_, i) => i);
  if (critIndex >= MAX_VISIBLE_DICE) out[MAX_VISIBLE_DICE - 1] = critIndex;
  return out;
}

function buildTracks(dice: DieResult[], indices: number[], seed: number, rollMs: number, overlay: boolean, reduced: boolean): DieTrack[] {
  const rnd = seededRandom(seed);
  const count = indices.length;
  const spread = count <= 1 ? 0 : Math.min(reduced ? 140 : 950, rollMs * 0.3);
  const order = indices.map((_, k) => k);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const rank: number[] = new Array<number>(count).fill(0);
  order.forEach((k, r) => {
    rank[k] = r;
  });
  return indices.map((index, k) => {
    const die = dice[index]!;
    const landAt = count <= 1 ? rollMs : rollMs - spread + (rank[k]! / (count - 1)) * spread;
    const side = rnd() < 0.5 ? -1 : 1;
    const start = overlay
      ? { sx: `${(side * (16 + rnd() * 30)).toFixed(1)}vw`, sy: `${(-(30 + rnd() * 24)).toFixed(1)}vh`, rot: `${Math.round(side * (620 + rnd() * 560))}deg` }
      : { sx: `${Math.round(side * (60 + rnd() * 120))}px`, sy: `${Math.round(-(110 + rnd() * 90))}px`, rot: `${Math.round(side * (480 + rnd() * 420))}deg` };
    const schedule = faceSchedule(die.sides, die.value, landAt, (seed + index * 7919) >>> 0);
    return { index, die, landAt, start, ...schedule };
  });
}

function RollingIndicator({ progress, big }: { progress: number; big: boolean }) {
  return (
    <span className={clsx('flex flex-col items-center gap-2', big ? 'py-2' : 'py-1')}>
      <span className={clsx('wl-dots flex items-end gap-1.5 text-gold-300', big ? 'h-12' : 'h-9')} aria-hidden>
        <span />
        <span />
        <span />
      </span>
      <span className="h-1 w-28 overflow-hidden rounded-full bg-ink-700">
        <span className="block h-full rounded-full bg-gold-sheen transition-[width] duration-100 ease-linear" style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
      </span>
    </span>
  );
}

function DiceScene({ roll, variant, reducedMotion, onSettled, onCardClick, targetName, rollerColor, extra, hideVisibility, badge, hint, rollMs: rollMsProp }: RollStageProps) {
  const dice = roll.dice;
  const overlay = variant === 'overlay';
  const [rollMs] = useState(() => (reducedMotion ? REDUCED_ROLL_MS : rollMsProp ?? (overlay ? DEFAULT_OVERLAY_ROLL_MS : DEFAULT_INLINE_ROLL_MS)));
  const seed = useMemo(() => hashString(roll.id), [roll.id]);
  const critIndex = useMemo(() => (roll.crit ? dice.findIndex((d) => d.sides === 20 && !d.dropped) : -1), [roll.crit, dice]);
  const indices = useMemo(() => visibleIndices(dice, critIndex), [dice, critIndex]);
  const tracks = useMemo(() => buildTracks(dice, indices, seed, rollMs, overlay, reducedMotion), [dice, indices, seed, rollMs, overlay, reducedMotion]);
  const lastTrack = useMemo(() => tracks.reduce<DieTrack | null>((a, t) => (!a || t.landAt > a.landAt ? t : a), null), [tracks]);
  const hiddenCount = dice.length - indices.length;

  const allLanded = lastTrack ? lastTrack.landAt : 0;
  const countMs = reducedMotion ? 0 : 700;
  const critAt = allLanded + countMs + (reducedMotion ? 0 : 120);
  const settleAt = critAt + (roll.crit && !reducedMotion ? 750 : 150);

  const elapsed = useElapsed(settleAt + 20, 33);
  const allDone = elapsed >= allLanded;
  const showDropped = elapsed >= allLanded + 180;
  const critOn = roll.crit !== null && elapsed >= critAt;
  const total = useCountUp(roll.total ?? 0, allDone, countMs);
  const size = dieSizeFor(indices.length, variant);
  const breakdown = rollBreakdown(roll);
  const onSettledRef = useLatest(onSettled);
  const perRow = indices.length <= 6 ? Math.max(1, indices.length) : Math.ceil(indices.length / 2);
  const rowWidth = perRow * (size + (overlay ? 22 : 12)) + 24;

  const sfx = useRef({ shake: false, shake2: false, landed: 0, landSounds: 0, lastLandAt: 0, tickIdx: -1, crit: false, settled: false });
  useEffect(() => {
    const f = sfx.current;
    if (!f.shake) {
      f.shake = true;
      if (tracks.length > 0) uiSounds.diceShake();
    }
    if (!f.shake2 && !reducedMotion && rollMs >= 2000 && elapsed >= rollMs * 0.25) {
      f.shake2 = true;
      uiSounds.diceShake();
    }
    const landed = tracks.reduce((n, t) => n + (elapsed >= t.landAt ? 1 : 0), 0);
    if (landed > f.landed) {
      f.landed = landed;
      const now = performance.now();
      if (f.landSounds < 5 && now - f.lastLandAt > 110) {
        f.landSounds += 1;
        f.lastLandAt = now;
        uiSounds.diceLand();
      }
    }
    if (lastTrack && lastTrack.die.sides !== 6 && !reducedMotion && elapsed < lastTrack.landAt) {
      const i = faceIndexAt(lastTrack, elapsed);
      if (i !== f.tickIdx) {
        f.tickIdx = i;
        const next = lastTrack.times[i + 1] ?? lastTrack.landAt;
        if (i > 0 && next - lastTrack.times[i]! >= 130) uiSounds.tick();
      }
    }
    if (!f.crit && critOn) {
      f.crit = true;
      if (roll.crit === 'success') uiSounds.critSuccess();
      else uiSounds.critFail();
    }
    if (!f.settled && elapsed >= settleAt) {
      f.settled = true;
      onSettledRef.current?.();
    }
  });

  return (
    <>
      {/* Outside the shaking wrapper: a transformed ancestor would turn `fixed` into a local box. */}
      {critOn && roll.crit === 'fail' && (
        <div className={clsx('wl-flash-red z-0', overlay ? 'fixed inset-0' : 'absolute -inset-4 rounded-2xl')} aria-hidden />
      )}
      <div className={clsx('relative flex w-full flex-col items-center', critOn && roll.crit === 'fail' && !reducedMotion && 'wl-shake')}>
        <div className="relative z-[1] flex w-full flex-col items-center justify-center" style={{ minHeight: tracks.length > 0 ? size + 28 : 0 }}>
          {critOn && roll.crit === 'success' && (
            <>
              <div className="wl-rays" style={{ '--wl-rays-size': overlay ? '680px' : '360px' } as CSSProperties} aria-hidden />
              <div className="wl-rays-core" style={{ '--wl-rays-size': overlay ? '680px' : '360px' } as CSSProperties} aria-hidden />
            </>
          )}
          <div
            className={clsx('relative flex flex-wrap items-center justify-center', overlay ? 'gap-x-[22px] gap-y-5 px-4' : 'gap-3 px-2')}
            style={{ maxWidth: `min(${overlay ? '94vw' : '100%'}, ${rowWidth}px)` }}
          >
            {tracks.map((track) => {
              const { die, index } = track;
              const landed = elapsed >= track.landAt;
              const dropped = die.dropped && showDropped;
              const glow = critOn && index === critIndex ? (roll.crit === 'success' ? 'wl-die-glow-gold' : 'wl-die-glow-blood') : null;
              const shown = landed ? die.value : track.values[faceIndexAt(track, elapsed)] ?? die.value;
              return (
                <div
                  key={index}
                  className="wl-die"
                  style={
                    {
                      width: size,
                      height: size,
                      '--wl-sx': track.start.sx,
                      '--wl-sy': track.start.sy,
                      '--wl-rot': die.sides === 6 ? '0deg' : track.start.rot,
                      '--wl-hop': `${Math.round(size * (overlay ? 0.42 : 0.34))}px`,
                      animationDuration: `${Math.max(1, Math.round(track.landAt))}ms`,
                      animationName: reducedMotion ? 'wl-fade-in' : undefined,
                    } as CSSProperties
                  }
                  title={landed ? (die.dropped ? `${die.value} (descartado)` : String(die.value)) : undefined}
                >
                  <div className={clsx('h-full w-full', landed && 'wl-die-land', dropped && 'wl-die-dropped', glow)}>
                    {die.sides === 6 ? (
                      <D6Cube value={die.value} size={size} durationMs={reducedMotion ? 0 : track.landAt} seed={(seed + index * 31) >>> 0} />
                    ) : (
                      <DieView sides={die.sides} value={shown} size={size} />
                    )}
                  </div>
                  {landed && !reducedMotion && <span className="wl-die-impact" aria-hidden />}
                  {dropped && <span className="wl-die-strike" aria-hidden />}
                </div>
              );
            })}
          </div>
          {hiddenCount > 0 && (
            <div className={clsx('relative z-[2] rounded-full border border-gold-700/60 bg-ink-900/90 px-3 py-1 text-xs font-semibold text-gold-200 shadow-panel', overlay ? 'mt-4' : 'mt-3')}>
              +{hiddenCount} {hiddenCount === 1 ? 'dado más' : 'dados más'} (cuentan en el total)
            </div>
          )}
          {critOn && roll.crit === 'success' && <Particles seed={seed} count={overlay ? 34 : 18} distance={overlay ? 300 : 150} />}
          {critOn && roll.crit === 'fail' && <Crack width={overlay ? Math.min(420, size * Math.max(1, tracks.length) + 140) : 240} />}
        </div>

        {critOn && (
          <div
            className={clsx(
              'relative z-[3] font-display font-black uppercase',
              overlay ? 'mt-3 text-5xl sm:text-6xl' : 'mt-2 text-3xl',
              roll.crit === 'success' ? 'wl-crit-text title-epic' : 'wl-fail-text text-blood-400 [text-shadow:0_0_24px_rgba(196,61,51,0.85),0_3px_0_#45130f]',
            )}
          >
            {roll.crit === 'success' ? '¡CRÍTICO!' : '¡PIFIA!'}
          </div>
        )}

        <div
          role={onCardClick ? 'button' : undefined}
          tabIndex={onCardClick ? 0 : undefined}
          onClick={onCardClick}
          onKeyDown={(e) => {
            if (onCardClick && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onCardClick();
            }
          }}
          className={clsx(
            'wl-card-in pointer-events-auto relative z-[3] text-center',
            overlay
              ? 'mt-5 w-[min(92vw,30rem)] cursor-pointer rounded-2xl border border-gold-600/50 bg-ink-900/92 px-6 py-4 shadow-modal backdrop-blur'
              : 'mt-4 w-full rounded-xl border border-ink-500 bg-ink-950/60 px-4 py-3',
            roll.crit === 'success' && critOn && 'border-gold-400 shadow-glow-gold',
            roll.crit === 'fail' && critOn && 'border-blood-500 shadow-glow-blood',
          )}
        >
          <StageHeader roll={roll} rollerColor={rollerColor} verb="lanza" extra={extra} />
          <div className="mt-2 flex flex-col items-center">
            <span className="label mb-0">{allDone ? 'Total' : 'Rodando…'}</span>
            {allDone ? (
              <span
                className={clsx(
                  'wl-total-pop font-display font-bold leading-none tabular-nums',
                  overlay ? 'text-6xl sm:text-7xl' : 'text-5xl',
                  critOn && roll.crit === 'success' ? 'title-epic' : critOn && roll.crit === 'fail' ? 'text-blood-400' : 'text-parchment-50',
                )}
              >
                {total}
              </span>
            ) : (
              <RollingIndicator progress={allLanded > 0 ? elapsed / allLanded : 1} big={overlay} />
            )}
          </div>
          {breakdown && allDone && <div className="mt-2 break-words font-mono text-xs text-parchment-300">{breakdown}</div>}
          <RollBadges roll={roll} targetName={targetName} hideVisibility={hideVisibility} badge={badge} />
          {hint && <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-parchment-400/80">{hint}</div>}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Roulette
// ---------------------------------------------------------------------------

function RouletteScene({ roll, variant, reducedMotion, onSettled, onCardClick, targetName, rollerColor, extra, hideVisibility, badge, wheelSize, hint }: RollStageProps) {
  const overlay = variant === 'overlay';
  const segments = useMemo(() => roll.segments ?? [], [roll.segments]);
  const winner = roll.segment;
  const spinMs = reducedMotion ? 900 : 4500;
  const target = useMemo(() => {
    if (!winner) return null;
    try {
      return targetRotation(segments, winner.id, hashUnit(roll.id), 6);
    } catch {
      return null;
    }
  }, [segments, winner, roll.id]);
  const [rotation, setRotation] = useState(0);
  const [landed, setLanded] = useState(target === null);
  const onSettledRef = useLatest(onSettled);
  const tick = useThrottled(() => uiSounds.tick(), 40);

  useEffect(() => {
    if (target === null) {
      const t = window.setTimeout(() => onSettledRef.current?.(), 200);
      return () => window.clearTimeout(t);
    }
    uiSounds.diceShake();
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setRotation(target));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [target, onSettledRef]);

  const settleTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
  }, []);

  const handleSpinEnd = () => {
    if (landed) return;
    setLanded(true);
    uiSounds.diceLand();
    settleTimer.current = window.setTimeout(() => onSettledRef.current?.(), 380);
  };

  const size = wheelSize ?? (overlay ? 480 : 280);
  const color = winner?.color ?? '#e9c063';

  const cardInteraction = onCardClick
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: onCardClick,
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onCardClick();
          }
        },
      }
    : {};

  return (
    <div className="relative flex w-full flex-col items-center">
      <div
        {...cardInteraction}
        className={clsx(
          'wl-card-in pointer-events-auto mb-4',
          overlay ? 'cursor-pointer rounded-xl border border-ink-500/70 bg-ink-900/85 px-5 py-2 shadow-panel backdrop-blur' : '',
        )}
      >
        <StageHeader roll={roll} rollerColor={rollerColor} verb="gira la ruleta" extra={extra} />
      </div>

      <RouletteWheel
        segments={segments}
        rotation={rotation}
        durationMs={spinMs}
        size={size}
        onSpinEnd={handleSpinEnd}
        onSegmentPass={tick}
        highlightSegmentId={landed && winner ? winner.id : null}
      />

      <div className={clsx('relative z-[2] flex w-full justify-center', overlay ? '-mt-12 min-h-[8.5rem]' : 'mt-3 min-h-[6rem]')}>
        {landed && (
          <div
            {...cardInteraction}
            className={clsx(
              'wl-banner-in pointer-events-auto relative overflow-hidden text-center',
              overlay ? 'w-[min(92vw,32rem)] cursor-pointer rounded-2xl border-2 bg-ink-900/95 px-6 py-4 backdrop-blur' : 'w-full rounded-xl border-2 bg-ink-950/70 px-4 py-3',
            )}
            style={{ borderColor: color, boxShadow: `0 0 0 1px rgba(0,0,0,0.6), 0 0 44px -8px ${color}, 0 30px 60px -24px rgba(0,0,0,0.95)` }}
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
            <span aria-hidden className="pointer-events-none absolute inset-0 opacity-25" style={{ background: `radial-gradient(ellipse at 50% 0%, ${color}, transparent 70%)` }} />
            {winner ? (
              <div className="relative">
                {winner.icon && <div className={clsx('leading-none drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)]', overlay ? 'text-5xl' : 'text-4xl')}>{winner.icon}</div>}
                <div className={clsx('title-epic mt-1 break-words', overlay ? 'text-3xl' : 'text-2xl')}>{winner.label}</div>
                {winner.description && <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-parchment-200">{winner.description}</p>}
              </div>
            ) : (
              <div className="relative text-sm text-parchment-300">La ruleta no tiene un resultado válido.</div>
            )}
            <RollBadges roll={roll} targetName={targetName} hideVisibility={hideVisibility} badge={badge} />
            {hint && <div className="relative mt-2 text-[10px] uppercase tracking-[0.18em] text-parchment-400/80">{hint}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom die (labelled faces)
// ---------------------------------------------------------------------------

function faceFontSize(text: string, big: boolean): number {
  const len = Array.from(text).length;
  const k = big ? 1 : 0.72;
  if (len <= 3) return 64 * k;
  if (len <= 7) return 36 * k;
  if (len <= 12) return 28 * k;
  if (len <= 20) return 22 * k;
  return 17 * k;
}

function CustomDieScene({ roll, variant, reducedMotion, onSettled, onCardClick, targetName, rollerColor, extra, hideVisibility, badge, hint }: RollStageProps) {
  const overlay = variant === 'overlay';
  const faces = useMemo(() => roll.faces ?? [], [roll.faces]);
  const finalFace = roll.face ?? faces[0] ?? '?';
  const seed = useMemo(() => hashString(roll.id), [roll.id]);
  const [shown, setShown] = useState(() => (faces.length > 0 ? faces[seed % faces.length]! : finalFace));
  const [flip, setFlip] = useState(0);
  const [landed, setLanded] = useState(false);
  const onSettledRef = useLatest(onSettled);

  useEffect(() => {
    const totalMs = reducedMotion ? 220 : 3000;
    const rnd = seededRandom(seed);
    let elapsed = 0;
    let delay = 55;
    let last = -1;
    let timer = 0;
    uiSounds.diceShake();
    const step = () => {
      if (elapsed >= totalMs || faces.length < 2) {
        setShown(finalFace);
        setFlip((k) => k + 1);
        setLanded(true);
        uiSounds.diceLand();
        timer = window.setTimeout(() => onSettledRef.current?.(), 420);
        return;
      }
      let idx = Math.floor(rnd() * faces.length);
      if (idx === last) idx = (idx + 1) % faces.length;
      last = idx;
      setShown(faces[idx]!);
      setFlip((k) => k + 1);
      elapsed += delay;
      delay *= 1.14;
      timer = window.setTimeout(step, delay);
    };
    timer = window.setTimeout(step, 40);
    return () => window.clearTimeout(timer);
  }, [faces, finalFace, seed, reducedMotion, onSettledRef]);

  const boxSize = overlay ? 220 : 150;
  const tilt = landed ? 0 : ((flip % 2 === 0 ? 1 : -1) * (4 + (flip % 3) * 3));
  const index = faces.indexOf(finalFace);

  return (
    <div className="relative flex w-full flex-col items-center">
      <div
        className={clsx('relative transition-transform duration-150', landed && 'wl-die-land')}
        style={{ width: boxSize, height: boxSize, transform: `rotate(${tilt}deg)`, perspective: 600 }}
      >
        {landed && <div className="wl-rays" style={{ '--wl-rays-size': `${boxSize * 2.4}px` } as CSSProperties} aria-hidden />}
        <div
          key={flip}
          className={clsx(
            'relative flex h-full w-full items-center justify-center overflow-hidden rounded-[22%] border-[3px] p-4 text-center',
            !landed && 'wl-rune-flip',
            landed && 'wl-die-glow-gold',
          )}
          style={{
            borderColor: '#e9c063',
            background: 'radial-gradient(circle at 30% 22%, #4a3f2f 0%, #1c1915 55%, #0b0a08 100%)',
            boxShadow: 'inset 0 0 0 6px rgba(11,10,8,0.65), inset 0 0 0 7px rgba(233,192,99,0.35), inset 0 -10px 30px rgba(0,0,0,0.6), 0 24px 50px -18px rgba(0,0,0,0.95)',
          }}
        >
          <span
            className="break-words font-display font-bold leading-tight text-gold-200 [text-shadow:0_2px_0_rgba(0,0,0,0.7),0_0_18px_rgba(233,192,99,0.35)]"
            style={{ fontSize: faceFontSize(shown, overlay) }}
          >
            {shown}
          </span>
        </div>
      </div>

      <div
        role={onCardClick ? 'button' : undefined}
        tabIndex={onCardClick ? 0 : undefined}
        onClick={onCardClick}
        onKeyDown={(e) => {
          if (onCardClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onCardClick();
          }
        }}
        className={clsx(
          'wl-card-in pointer-events-auto relative z-[3] text-center',
          overlay
            ? 'mt-6 w-[min(92vw,30rem)] cursor-pointer rounded-2xl border border-gold-600/50 bg-ink-900/92 px-6 py-4 shadow-modal backdrop-blur'
            : 'mt-4 w-full rounded-xl border border-ink-500 bg-ink-950/60 px-4 py-3',
          landed && 'shadow-glow-gold',
        )}
      >
        <StageHeader roll={roll} rollerColor={rollerColor} verb="lanza el dado" extra={extra} />
        <div className={clsx('mt-2 break-words font-display font-bold', overlay ? 'text-3xl' : 'text-2xl', landed ? 'title-epic wl-total-pop' : 'text-parchment-400')}>
          {landed ? finalFace : '…'}
        </div>
        {landed && faces.length > 0 && index >= 0 && (
          <div className="mt-1 text-xs text-parchment-400">
            Cara {index + 1} de {faces.length}
          </div>
        )}
        <RollBadges roll={roll} targetName={targetName} hideVisibility={hideVisibility} badge={badge} />
        {hint && <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-parchment-400/80">{hint}</div>}
      </div>
    </div>
  );
}
