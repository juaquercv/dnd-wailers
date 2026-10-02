import { Crosshair, Crown, UserRound } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { emitUiEvent } from '../../lib/uiEvents';
import { useHeroEconomy } from './hud/economy';
import { EconomyMeters, turnStatus, TurnStatusPill } from './hud/EconomyMeters';
import { heroTokenOf, usePanelContext } from './panels/context';
import { HeroSheet } from './HeroSheet';
import { TradesPanel } from './TradesPanel';

/** Player sidebar: turn status, own sheet (spells with "Lanzar", items with "Usar"), camera centering and trades. */
export function MyCharacterPanel() {
  const ctx = usePanelContext();
  const { state } = ctx;
  const heroId = state && ctx.viewerId ? state.players[ctx.viewerId]?.heroId ?? null : null;
  const eco = useHeroEconomy(ctx.isDm && !ctx.isPreview ? null : heroId);

  if (!state) return null;

  if (ctx.isDm && !ctx.isPreview) {
    return (
      <EmptyState
        compact
        icon={<Crown />}
        title="Eres el DM"
        description="Tus héroes son todos los del grupo: consulta sus hojas desde el panel «Grupo»."
      />
    );
  }

  const hero = heroId ? state.heroes[heroId] ?? null : null;

  if (!hero) {
    return (
      <EmptyState
        compact
        icon={<UserRound />}
        title="Sin personaje"
        description={state.status === 'lobby' ? 'Elige un héroe en la sala de espera para verlo aquí.' : 'No tienes un héroe en esta partida. Pídele al DM que te asigne uno.'}
      />
    );
  }

  const token = heroTokenOf(state, hero.id);
  const status = eco ? turnStatus(eco, ctx.effective?.canMoveOwnToken ?? true) : null;

  return (
    <div className="space-y-4">
      {eco && status && (
        <div className="space-y-2 rounded-xl border border-ink-600/80 bg-ink-800/50 px-2.5 py-2">
          <TurnStatusPill tone={status.tone} text={status.text} hint={status.hint} />
          <p className="text-[11px] leading-snug text-parchment-400">{status.hint}</p>
          <EconomyMeters eco={eco} />
        </div>
      )}
      <Button
        variant="secondary"
        size="sm"
        block
        icon={<Crosshair />}
        disabled={!token}
        title={token ? undefined : 'Tu ficha no está en el mapa'}
        onClick={() => token && emitUiEvent('center-on-token', { tokenId: token.id })}
      >
        Centrar en mi ficha
      </Button>
      <HeroSheet heroId={hero.id} />
      <div className="divider" />
      <TradesPanel />
    </div>
  );
}
