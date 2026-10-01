import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Globe, Lock, UserRound } from 'lucide-react';
import type { RollRequest } from '@wailers/shared';
import { emitAck } from '../../api/socket';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { toast } from '../../components/ui/toast';
import { useSessionEvent } from '../../lib/eventBus';
import { useSessionStore } from '../../stores/session';
import { useSettingsStore } from '../../stores/settings';
import { uiSounds } from '../audio/uiSounds';
import { DieGlyph } from './DieShapes';
import { MODE_LABELS } from './diceUtils';
import { resolveOffered, useOfferedRollers } from './offeredRollers';
import { MiniWheel } from './RouletteWheel';
import './dice.css';

const MAX_VISIBLE_REQUESTS = 3;

interface TurnBanner {
  key: number;
  round: number;
  name: string;
}

/**
 * Floating prompts for the local user: roll requests from the DM ("¡Tirar!"), the turn offer of
 * campaign rollers and the dramatic "¡Tu turno!" banner. Rolling only shows results; nothing is applied.
 */
export function RollPrompts() {
  const view = useSessionStore((s) => s.view);
  const sessionId = useSessionStore((s) => s.sessionId);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const offeredState = useOfferedRollers();
  const me = view?.meUserId ?? null;
  const meRef = useRef(me);
  meRef.current = me;

  const requests = useMemo(() => (view && me ? view.state.rollRequests.filter((r) => r.targetUserId === me) : []), [view, me]);
  const offer = view && me && view.state.turnOffer && view.state.turnOffer.userId === me ? view.state.turnOffer : null;
  const offered = useMemo(() => (offer ? resolveOffered(offer.rollerIds, offeredState, sessionId) : []), [offer, offeredState, sessionId]);

  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<TurnBanner | null>(null);

  useSessionEvent('rollRequest', (event) => {
    if (event.request.targetUserId === meRef.current) uiSounds.notify();
  });

  useSessionEvent('turnStart', (event) => {
    if (!meRef.current || event.entry.userId !== meRef.current) return;
    uiSounds.turnStart();
    setBanner({ key: Date.now(), round: event.round, name: event.entry.name });
  });

  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), reducedMotion ? 1600 : 2700);
    return () => window.clearTimeout(t);
  }, [banner, reducedMotion]);

  const fulfill = async (request: RollRequest) => {
    if (busy) return;
    setBusy(request.id);
    try {
      await emitAck('roll:fulfill', { requestId: request.id });
    } catch (err) {
      toast.fromError(err, 'No se pudo lanzar la tirada');
    } finally {
      setBusy(null);
    }
  };

  const rollOffered = async (rollerId: string) => {
    if (busy) return;
    setBusy(`offer:${rollerId}`);
    try {
      await emitAck('roll:roller', { rollerId });
    } catch (err) {
      toast.fromError(err, 'No se pudo lanzar');
    } finally {
      setBusy(null);
    }
  };

  const dismissOffer = async () => {
    if (busy) return;
    setBusy('dismiss');
    try {
      await emitAck('roll:dismissOffer', {});
    } catch (err) {
      toast.fromError(err, 'No se pudo descartar la oferta');
    } finally {
      setBusy(null);
    }
  };

  if (!view || typeof document === 'undefined') return null;

  const visibleRequests = requests.slice(0, MAX_VISIBLE_REQUESTS);
  const hiddenCount = requests.length - visibleRequests.length;

  return createPortal(
    <>
      {(offer || requests.length > 0) && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-60 flex flex-col items-center gap-3 px-3">
          {offer && (
            <div className="wl-card-in wl-prompt-glow pointer-events-auto w-[min(94vw,30rem)] rounded-2xl border border-gold-500/60 bg-ink-900/95 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden>
                  ⚔️
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-base font-semibold text-gold-200">Es tu turno — ¿quieres lanzar…?</div>
                  <div className="text-xs text-parchment-300">Lo que salga es solo informativo: el DM decide si aplica algo.</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {offered.map((o) => (
                  <Button
                    key={o.id}
                    variant="primary"
                    epic
                    loading={busy === `offer:${o.id}`}
                    disabled={busy !== null && busy !== `offer:${o.id}`}
                    icon={
                      o.roller && o.roller.kind === 'roulette' ? (
                        <MiniWheel segments={o.roller.segments} size={18} />
                      ) : (
                        <DieGlyph sides={20} size={18} />
                      )
                    }
                    onClick={() => void rollOffered(o.id)}
                  >
                    {o.name}
                  </Button>
                ))}
                <Button variant="ghost" onClick={() => void dismissOffer()} loading={busy === 'dismiss'} disabled={busy !== null && busy !== 'dismiss'}>
                  Ahora no
                </Button>
              </div>
            </div>
          )}

          {visibleRequests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              rollerName={r.rollerId ? offeredState.known[r.rollerId]?.name ?? null : null}
              busy={busy === r.id}
              disabled={busy !== null && busy !== r.id}
              onRoll={() => void fulfill(r)}
            />
          ))}
          {hiddenCount > 0 && (
            <div className="pointer-events-auto rounded-full border border-gold-700/60 bg-ink-900/90 px-3 py-1 text-xs font-semibold text-gold-200 shadow-panel">
              y {hiddenCount} {hiddenCount === 1 ? 'petición más' : 'peticiones más'}
            </div>
          )}
        </div>
      )}

      {banner && (
        <div key={banner.key} className="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center" aria-live="assertive">
          <div
            className="wl-turn-band absolute inset-x-0 top-1/2 h-44 -translate-y-1/2"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(11,10,8,0.88) 18%, rgba(11,10,8,0.92) 50%, rgba(11,10,8,0.88) 82%, transparent)',
              boxShadow: 'inset 0 1px 0 rgba(233,192,99,0.6), inset 0 -1px 0 rgba(233,192,99,0.6)',
            }}
            aria-hidden
          />
          <div className="wl-turn-banner relative text-center">
            <div className="title-epic text-6xl sm:text-7xl">¡Tu turno!</div>
            <div className="mt-2 text-sm font-semibold uppercase tracking-[0.3em] text-parchment-200">
              Ronda {banner.round} · {banner.name}
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}

function RequestCard({
  request,
  rollerName,
  busy,
  disabled,
  onRoll,
}: {
  request: RollRequest;
  rollerName: string | null;
  busy: boolean;
  disabled: boolean;
  onRoll: () => void;
}) {
  const what = request.formula ?? (request.rollerId ? rollerName ?? 'ruleta del DM' : 'tirada');
  return (
    <div className="wl-card-in wl-prompt-glow pointer-events-auto flex w-[min(94vw,30rem)] items-center gap-3 rounded-2xl border border-gold-500/60 bg-ink-900/95 px-4 py-3 backdrop-blur">
      <span className="shrink-0 text-3xl leading-none" aria-hidden>
        🎲
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-400">El DM te pide:</div>
        <div className="truncate font-display text-lg font-semibold leading-tight text-parchment-50" title={`${request.label} (${what})`}>
          {request.label || 'Tirada'} <span className="font-sans text-sm font-normal text-parchment-300">({what})</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {request.mode !== 'normal' && (
            <Badge size="xs" tone={request.mode === 'advantage' ? 'emerald' : 'blood'}>
              {MODE_LABELS[request.mode]}
            </Badge>
          )}
          <Badge
            size="xs"
            tone={request.visibility === 'secret' ? 'arcane' : request.visibility === 'player' ? 'sky' : 'neutral'}
            icon={request.visibility === 'secret' ? <Lock /> : request.visibility === 'player' ? <UserRound /> : <Globe />}
          >
            {request.visibility === 'secret' ? 'Solo la verá el DM' : request.visibility === 'player' ? 'Solo tú y el DM' : 'Pública'}
          </Badge>
        </div>
      </div>
      <Button variant="primary" size="lg" epic loading={busy} disabled={disabled} onClick={onRoll} className={clsx('shrink-0')}>
        ¡Tirar!
      </Button>
    </div>
  );
}
