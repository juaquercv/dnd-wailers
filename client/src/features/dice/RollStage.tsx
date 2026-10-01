import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Lock, UserRound } from 'lucide-react';
import { targetRotation, type RollResult } from '@wailers/shared';
import { Badge } from '../../components/ui/Badge';
import { uiSounds } from '../audio/uiSounds';
import { D6Cube, DieView } from './DieShapes';
import { RouletteWheel } from './RouletteWheel';
import { useCountUp, useElapsed, useThrottled } from './diceHooks';
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
          {roll.byDm ? ' (DM)' : ''} {verb}
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
        {roll.formula}
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

function dieSizeFor(count: number, variant: 'overlay' | 'inline'): number {
  if (variant === 'overlay') {
    if (count <= 2) return 124;
    if (count <= 4) return 106;
    if (count <= 8) return 86;
    if (count <= 16) return 66;
    if (count <= 32) return 52;
    return 40;
  }
  if (count <= 2) return 84;
  if (count <= 4) return 72;
  if (count <= 8) return 58;
  if (count <= 16) return 46;
  return 34;
}

function DiceScene({ roll, variant, reducedMotion, onSettled, onCardClick, targetName, rollerColor, extra, hideVisibility, badge, hint }: RollStageProps) {
  const dice = roll.dice;
  const n = dice.length;
  const overlay = variant === 'overlay';
  const tumbleMs = reducedMotion ? 160 : 1150;
  const stagger = reducedMotion || n <= 1 ? 0 : Math.min(90, 520 / (n - 1));
  const landAt = (i: number) => tumbleMs + i * stagger;
  const allLanded = n > 0 ? landAt(n - 1) : 0;
  const countMs = reducedMotion ? 0 : 650;
  const critAt = allLanded + countMs + (reducedMotion ? 0 : 120);
  const settleAt = critAt + (roll.crit && !reducedMotion ? 750 : 150);

  const elapsed = useElapsed(settleAt + 20, 55);
  const allDone = elapsed >= allLanded;
  const showDropped = elapsed >= allLanded + 160;
  const critOn = roll.crit !== null && elapsed >= critAt;
  const total = useCountUp(roll.total ?? 0, allDone, countMs);
  const size = dieSizeFor(n, variant);
  const seed = useMemo(() => hashString(roll.id), [roll.id]);
  const critIndex = useMemo(() => (roll.crit ? dice.findIndex((d) => d.sides === 20 && !d.dropped) : -1), [roll.crit, dice]);
  const breakdown = rollBreakdown(roll);
  const onSettledRef = useLatest(onSettled);

  const starts = useMemo(() => {
    const rnd = seededRandom(seed);
    return dice.map(() => {
      const side = rnd() < 0.5 ? -1 : 1;
      return overlay
        ? { sx: `${(side * (18 + rnd() * 30)).toFixed(1)}vw`, sy: `${(-(28 + rnd() * 26)).toFixed(1)}vh`, rot: `${Math.round(side * (540 + rnd() * 600))}deg` }
        : { sx: `${Math.round(side * (60 + rnd() * 120))}px`, sy: `${Math.round(-(110 + rnd() * 90))}px`, rot: `${Math.round(side * (420 + rnd() * 480))}deg` };
    });
  }, [seed, dice, overlay]);

  const flags = useRef({ shake: false, land: false, crit: false, settled: false });
  useEffect(() => {
    const f = flags.current;
    if (!f.shake) {
      f.shake = true;
      if (n > 0) uiSounds.diceShake();
    }
    if (!f.land && n > 0 && elapsed >= landAt(0)) {
      f.land = true;
      uiSounds.diceLand();
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

  const tickIndex = Math.floor(elapsed / 70);

  return (
    <>
      {/* Outside the shaking wrapper: a transformed ancestor would turn `fixed` into a local box. */}
      {critOn && roll.crit === 'fail' && (
        <div className={clsx('wl-flash-red z-0', overlay ? 'fixed inset-0' : 'absolute -inset-4 rounded-2xl')} aria-hidden />
      )}
      <div className={clsx('relative flex w-full flex-col items-center', critOn && roll.crit === 'fail' && !reducedMotion && 'wl-shake')}>
        <div className="relative z-[1] flex w-full items-center justify-center" style={{ minHeight: n > 0 ? size + 24 : 0 }}>
          {critOn && roll.crit === 'success' && (
            <>
              <div className="wl-rays" style={{ '--wl-rays-size': overlay ? '680px' : '360px' } as CSSProperties} aria-hidden />
              <div className="wl-rays-core" style={{ '--wl-rays-size': overlay ? '680px' : '360px' } as CSSProperties} aria-hidden />
            </>
          )}
          <div className={clsx('relative flex flex-wrap items-center justify-center', overlay ? 'max-w-[min(92vw,980px)] gap-x-5 gap-y-4 px-4' : 'max-w-full gap-3 px-2')}>
            {dice.map((die, i) => {
              const landed = elapsed >= landAt(i);
              const dropped = die.dropped && showDropped;
              const glow = critOn && i === critIndex ? (roll.crit === 'success' ? 'wl-die-glow-gold' : 'wl-die-glow-blood') : null;
              const start = starts[i]!;
              const faceSeed = (seed + i * 7919 + tickIndex * 104729) >>> 0;
              const shown = landed ? die.value : Math.floor(seededRandom(faceSeed)() * die.sides) + 1;
              return (
                <div
                  key={i}
                  className="wl-die"
                  style={
                    {
                      width: size,
                      height: size,
                      '--wl-sx': start.sx,
                      '--wl-sy': start.sy,
                      '--wl-rot': die.sides === 6 ? '0deg' : start.rot,
                      animationDuration: `${Math.max(1, landAt(i))}ms`,
                    } as CSSProperties
                  }
                  title={die.dropped ? `${die.value} (descartado)` : String(die.value)}
                >
                  <div className={clsx('h-full w-full transition-transform', landed && 'wl-die-land', dropped && 'wl-die-dropped', glow)}>
                    {die.sides === 6 ? (
                      <D6Cube value={die.value} size={size} durationMs={reducedMotion ? 0 : landAt(i)} seed={(seed + i * 31) >>> 0} />
                    ) : (
                      <DieView sides={die.sides} value={shown} size={size} />
                    )}
                  </div>
                  {dropped && <span className="wl-die-strike" aria-hidden />}
                </div>
              );
            })}
          </div>
          {critOn && roll.crit === 'success' && <Particles seed={seed} count={overlay ? 34 : 18} distance={overlay ? 300 : 150} />}
          {critOn && roll.crit === 'fail' && <Crack width={overlay ? Math.min(420, size * Math.max(1, n) + 140) : 240} />}
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
            <span className="label mb-0">Total</span>
            <span
              key={allDone ? 'final' : 'rolling'}
              className={clsx(
                'font-display font-bold leading-none tabular-nums',
                overlay ? 'text-6xl sm:text-7xl' : 'text-5xl',
                allDone && 'wl-total-pop',
                critOn && roll.crit === 'success' ? 'title-epic' : critOn && roll.crit === 'fail' ? 'text-blood-400' : 'text-parchment-50',
              )}
            >
              {allDone ? total : '…'}
            </span>
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
    const totalMs = reducedMotion ? 220 : 1750;
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
