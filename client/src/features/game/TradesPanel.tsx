import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowRight, Check, Coins, Gavel, Handshake, History, Inbox, Package, Plus, Send, X } from 'lucide-react';
import { RARITY_INFO, type LiveState, type TradeOffer } from '@wailers/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Toggle } from '../../components/ui/Toggle';
import { formatGold, formatRelative } from '../../lib/format';
import { send } from './panels/actions';
import { usePanelContext, type PanelContext } from './panels/context';
import { isPendingTrade, resolveTradeItems, splitTradeNote, TRADE_STATUS } from './panels/tradeUtils';
import { TradeDialog } from './TradeDialog';

const HISTORY_LIMIT = 12;

/** Trades between players. Player: incoming / outgoing / history. DM: approvals + every recent trade. */
export function TradesPanel() {
  const ctx = usePanelContext();
  const { state } = ctx;
  const [offering, setOffering] = useState(false);
  const meId = ctx.viewerId;

  const sorted = useMemo(() => (state ? [...state.trades].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []), [state]);

  if (!state) return null;

  if (ctx.isDm && !ctx.isPreview) return <DmTrades ctx={ctx} state={state} trades={sorted} />;

  const myHeroId = meId ? state.players[meId]?.heroId ?? null : null;
  const incoming = sorted.filter((t) => t.toUserId === meId && t.status === 'pending_target');
  const outgoing = sorted.filter((t) => t.fromUserId === meId && isPendingTrade(t));
  const waitingDm = sorted.filter((t) => t.toUserId === meId && t.status === 'pending_dm');
  const history = sorted.filter((t) => !isPendingTrade(t)).slice(0, HISTORY_LIMIT);
  const hasPartners = Object.values(state.players).some((p) => p.userId !== meId && p.heroId && p.heroId !== myHeroId && state.heroes[p.heroId]);
  const canOffer = !ctx.isDm && !!myHeroId && hasPartners;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.12em] text-gold-300">
          <Handshake className="h-4 w-4" />
          Intercambios
        </h3>
        {canOffer && (
          <Button size="sm" variant="secondary" icon={<Plus />} onClick={() => setOffering(true)}>
            Nuevo
          </Button>
        )}
      </div>

      {incoming.length === 0 && outgoing.length === 0 && waitingDm.length === 0 && history.length === 0 ? (
        <EmptyState
          compact
          icon={<Handshake />}
          title="Sin intercambios"
          description={canOffer ? 'Ofrece objetos u oro a tus compañeros desde aquí o desde tu inventario.' : 'Aquí verás las ofertas entre jugadores.'}
        />
      ) : (
        <>
          {incoming.length > 0 && (
            <Section icon={<Inbox />} title="Te ofrecen" count={incoming.length} highlight>
              {incoming.map((t) => (
                <TradeCard key={t.id} trade={t} state={state} ctx={ctx}>
                  <Button size="sm" variant="ghost" icon={<X />} onClick={() => void send('trade:respond', { tradeId: t.id, accept: false }, { success: 'Oferta rechazada' })}>
                    Rechazar
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Check />}
                    onClick={() =>
                      void send(
                        'trade:respond',
                        { tradeId: t.id, accept: true },
                        { success: state.options.tradeNeedsApproval ? 'Aceptado: falta la aprobación del DM' : 'Intercambio aceptado' },
                      )
                    }
                  >
                    Aceptar
                  </Button>
                </TradeCard>
              ))}
            </Section>
          )}
          {waitingDm.length > 0 && (
            <Section icon={<Gavel />} title="Pendientes del DM" count={waitingDm.length}>
              {waitingDm.map((t) => (
                <TradeCard key={t.id} trade={t} state={state} ctx={ctx} />
              ))}
            </Section>
          )}
          {outgoing.length > 0 && (
            <Section icon={<Send />} title="Tus ofertas" count={outgoing.length}>
              {outgoing.map((t) => (
                <TradeCard key={t.id} trade={t} state={state} ctx={ctx}>
                  {!ctx.isDm && (
                    <Button size="sm" variant="ghost" icon={<X />} onClick={() => void send('trade:cancel', { tradeId: t.id }, { success: 'Oferta cancelada' })}>
                      Cancelar oferta
                    </Button>
                  )}
                </TradeCard>
              ))}
            </Section>
          )}
          {history.length > 0 && (
            <Section icon={<History />} title="Historial" count={history.length} muted>
              {history.map((t) => (
                <TradeCard key={t.id} trade={t} state={state} ctx={ctx} compact />
              ))}
            </Section>
          )}
        </>
      )}

      {offering && <TradeDialog open onClose={() => setOffering(false)} />}
    </div>
  );
}

function DmTrades({ ctx, state, trades }: { ctx: PanelContext; state: LiveState; trades: TradeOffer[] }) {
  const confirm = useConfirm();
  const approvals = trades.filter((t) => t.status === 'pending_dm');
  const open = trades.filter((t) => t.status === 'pending_target');
  const recent = trades.filter((t) => !isPendingTrade(t)).slice(0, HISTORY_LIMIT * 2);

  const reject = async (t: TradeOffer) => {
    const ok = await confirm({ title: 'Rechazar intercambio', message: 'Los objetos y el oro se quedan donde estaban.', confirmLabel: 'Rechazar', danger: true });
    if (ok) await send('trade:approve', { tradeId: t.id, approve: false }, { success: 'Intercambio rechazado' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.12em] text-gold-300">
          <Handshake className="h-4 w-4" />
          Intercambios
        </h3>
      </div>
      <Toggle
        size="sm"
        checked={state.options.tradeNeedsApproval}
        onChange={(v) => void send('session:setOptions', { patch: { tradeNeedsApproval: v } })}
        label="Requieren mi aprobación"
        description="Tras aceptar el destinatario, el intercambio espera a que lo apruebes."
        disabled={!ctx.canManage}
      />
      {approvals.length === 0 && open.length === 0 && recent.length === 0 ? (
        <EmptyState compact icon={<Handshake />} title="Sin intercambios" description="Las ofertas entre jugadores aparecerán aquí." />
      ) : (
        <>
          {approvals.length > 0 && (
            <Section icon={<Gavel />} title="Esperan tu aprobación" count={approvals.length} highlight>
              {approvals.map((t) => (
                <TradeCard key={t.id} trade={t} state={state} ctx={ctx}>
                  <Button size="sm" variant="ghost" icon={<X />} onClick={() => void reject(t)}>
                    Rechazar
                  </Button>
                  <Button size="sm" variant="primary" icon={<Check />} onClick={() => void send('trade:approve', { tradeId: t.id, approve: true }, { success: 'Intercambio aprobado' })}>
                    Aprobar
                  </Button>
                </TradeCard>
              ))}
            </Section>
          )}
          {open.length > 0 && (
            <Section icon={<Send />} title="Esperando al destinatario" count={open.length}>
              {open.map((t) => (
                <TradeCard key={t.id} trade={t} state={state} ctx={ctx} />
              ))}
            </Section>
          )}
          {recent.length > 0 && (
            <Section icon={<History />} title="Recientes" count={recent.length} muted>
              {recent.map((t) => (
                <TradeCard key={t.id} trade={t} state={state} ctx={ctx} compact />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ icon, title, count, highlight, muted, children }: { icon: ReactNode; title: string; count: number; highlight?: boolean; muted?: boolean; children: ReactNode }) {
  return (
    <section>
      <h4
        className={clsx(
          'mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] [&>svg]:h-3.5 [&>svg]:w-3.5',
          highlight ? 'text-gold-300' : muted ? 'text-parchment-400' : 'text-parchment-300',
        )}
      >
        {icon}
        {title}
        <span className={clsx('rounded-full px-1.5 text-[10px] font-bold', highlight ? 'bg-gold-500/25 text-gold-200' : 'bg-ink-700 text-parchment-300')}>{count}</span>
      </h4>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function TradeCard({ trade, state, ctx, compact = false, children }: { trade: TradeOffer; state: LiveState; ctx: PanelContext; compact?: boolean; children?: ReactNode }) {
  const fromPlayer = state.players[trade.fromUserId];
  const toPlayer = state.players[trade.toUserId];
  const fromHero = state.heroes[trade.fromHeroId];
  const toHero = state.heroes[trade.toHeroId];
  const items = resolveTradeItems(state, trade);
  const { text, summary } = splitTradeNote(trade.note);
  const allResolved = items.every((i) => i.name !== null);
  const status = TRADE_STATUS[trade.status];
  const currencyShort = ctx.rules.currency.short || 'po';
  const pending = isPendingTrade(trade);

  const party = (name: string | undefined, heroName: string | undefined, imageUrl: string | null | undefined, color: string | undefined) => (
    <span className="flex min-w-0 items-center gap-1.5">
      <Avatar name={heroName ?? name ?? '?'} imageUrl={imageUrl ?? null} color={color} size={compact ? 'xs' : 'sm'} />
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-parchment-100">{heroName ?? 'Héroe'}</span>
        {!compact && (
          <span className="block truncate text-[10px]" style={{ color }}>
            {name ?? 'Jugador'}
          </span>
        )}
      </span>
    </span>
  );

  return (
    <article
      className={clsx(
        'rounded-lg border transition',
        compact ? 'border-ink-600/60 bg-ink-800/40 px-2.5 py-1.5' : 'border-ink-500/70 bg-ink-800/70 px-3 py-2.5',
        pending && !compact && 'border-gold-700/50 shadow-[0_0_18px_-10px_rgba(233,192,99,0.7)]',
      )}
    >
      <div className="flex items-center gap-2">
        {party(fromPlayer?.name, fromHero?.name, fromHero?.imageUrl, fromPlayer?.color)}
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gold-500" />
        {party(toPlayer?.name, toHero?.name, toHero?.imageUrl, toPlayer?.color)}
        <Badge tone={status.tone} size="xs" className="ml-auto">
          {status.label}
        </Badge>
      </div>

      <div className={clsx('flex flex-wrap items-center gap-1', compact ? 'mt-1' : 'mt-2')}>
        {allResolved || !summary ? (
          items.map((i) => (
            <span
              key={i.itemId}
              className="chip"
              style={i.rarity && i.rarity !== 'common' ? { color: RARITY_INFO[i.rarity].color } : undefined}
            >
              <Package className="h-3 w-3" />
              {i.name ?? 'Objeto oculto'}
              {i.quantity > 1 && <span className="text-parchment-400">×{i.quantity}</span>}
            </span>
          ))
        ) : (
          <span className="chip max-w-full">
            <Package className="h-3 w-3 shrink-0" />
            <span className="truncate" title={summary}>
              {summary}
            </span>
          </span>
        )}
        {trade.gold > 0 && (allResolved || !summary) && (
          <span className="chip border-gold-700/60 text-gold-300">
            <Coins className="h-3 w-3" />
            {formatGold(trade.gold, false, currencyShort)}
          </span>
        )}
      </div>

      {text && !compact && <p className="mt-2 whitespace-pre-line border-l-2 border-gold-700/50 pl-2 text-xs italic text-parchment-300">{text}</p>}

      <div className={clsx('flex items-center gap-2', compact ? 'mt-0.5' : 'mt-2')}>
        <time className="text-[10px] text-parchment-400" dateTime={trade.createdAt} title={new Date(trade.createdAt).toLocaleString('es-ES')}>
          {formatRelative(trade.createdAt)}
        </time>
        {children && <div className="ml-auto flex items-center gap-1.5">{children}</div>}
      </div>
    </article>
  );
}
