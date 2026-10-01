import { Crosshair, Crown, UserRound } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { emitUiEvent } from '../../lib/uiEvents';
import { heroTokenOf, usePanelContext } from './panels/context';
import { HeroSheet } from './HeroSheet';
import { TradesPanel } from './TradesPanel';

/** Player sidebar: own sheet (spells with "Lanzar"), quick camera centering and trades. */
export function MyCharacterPanel() {
  const ctx = usePanelContext();
  const { state } = ctx;

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

  const heroId = ctx.viewerId ? state.players[ctx.viewerId]?.heroId ?? null : null;
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

  return (
    <div className="space-y-4">
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
