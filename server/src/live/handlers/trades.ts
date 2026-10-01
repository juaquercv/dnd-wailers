import { newId, type HeroSheet, type LiveState, type TradeOffer } from '@wailers/shared';
import {
  addItemTo,
  isPlayer,
  itemLabel,
  joinNames,
  optText,
  playerHero,
  playerName,
  reqId,
  reqNum,
  round2,
  takeItem,
  toast,
} from '../helpers';
import { HandlerError, type HandlerCtx, type HandlerModule, type LogInput, type SessionManagerApi } from '../types';

/*
 * Trades between players: the offering player gives items and/or gold to another player.
 * Flow: offer (pending_target) → target accepts → [DM approval when options.tradeNeedsApproval
 * (pending_dm)] → executed atomically after re-validating availability.
 */

const MAX_TRADES = 30;
const PENDING: TradeOffer['status'][] = ['pending_target', 'pending_dm'];

function currencyShort(ctx: HandlerCtx): string {
  const currency = ctx.session.campaign.rules.currency;
  return currency.short || currency.name || 'po';
}

/** Keep the last MAX_TRADES offers, dropping finished ones first. */
function pruneTrades(state: LiveState): void {
  while (state.trades.length > MAX_TRADES) {
    const index = state.trades.findIndex((t) => !PENDING.includes(t.status));
    state.trades.splice(index >= 0 ? index : 0, 1);
  }
}

function requireTrade(state: LiveState, tradeId: unknown): TradeOffer {
  const id = reqId(tradeId, 'intercambio');
  const trade = state.trades.find((t) => t.id === id);
  if (!trade) throw new HandlerError('Ese intercambio ya no existe');
  return trade;
}

/** Aggregate requested quantities per inventory item (duplicates in the payload are merged). */
function normalizeItems(raw: unknown): { itemId: string; quantity: number }[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new HandlerError('Valor no válido para «objetos»');
  if (raw.length > 50) throw new HandlerError('Demasiados objetos en un solo intercambio');
  const totals = new Map<string, number>();
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) throw new HandlerError('Valor no válido para «objetos»');
    const { itemId, quantity } = entry as { itemId?: unknown; quantity?: unknown };
    const id = reqId(itemId, 'objeto');
    const q = Math.floor(reqNum(quantity, 'cantidad'));
    if (q < 1) throw new HandlerError('La cantidad debe ser al menos 1');
    totals.set(id, (totals.get(id) ?? 0) + q);
  }
  return [...totals.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
}

/** Null when the trade can be executed now, else the Spanish reason. */
function tradeProblem(state: LiveState, trade: TradeOffer, currency: string): string | null {
  const from = state.heroes[trade.fromHeroId];
  const to = state.heroes[trade.toHeroId];
  if (!from || !to) return 'uno de los héroes ya no está en la partida';
  if (state.players[trade.fromUserId]?.heroId !== trade.fromHeroId || state.players[trade.toUserId]?.heroId !== trade.toHeroId) {
    return 'los jugadores ya no llevan esos héroes';
  }
  for (const req of trade.items) {
    const item = from.data.inventory.find((it) => it.id === req.itemId);
    if (!item) return `${from.name} ya no tiene ese objeto`;
    if (item.quantity < req.quantity) return `${from.name} ya no tiene ${itemLabel(item.name, req.quantity)}`;
  }
  if (trade.gold > from.data.gold) return `${from.name} ya no tiene ${trade.gold} ${currency}`;
  return null;
}

/** Labels of what the trade moves ("Poción ×2", "30 po"). */
function tradeLabels(from: HeroSheet, trade: TradeOffer, currency: string): string[] {
  const labels = trade.items.map((req) => {
    const item = from.data.inventory.find((it) => it.id === req.itemId);
    return itemLabel(item?.name ?? 'objeto', req.quantity);
  });
  if (trade.gold > 0) labels.push(`${trade.gold} ${currency}`);
  return labels;
}

/**
 * Execute an accepted trade (re-validated). On failure the trade is cancelled and a
 * HandlerError explains why. `actorUserId` is who triggered the execution.
 */
function executeTrade(manager: SessionManagerApi, ctx: HandlerCtx, trade: TradeOffer): void {
  const state = ctx.session.state;
  const currency = currencyShort(ctx);
  const problem = tradeProblem(state, trade, currency);
  if (problem) {
    manager.mutate(
      ctx.session,
      (s) => {
        const t = s.trades.find((x) => x.id === trade.id);
        if (t) t.status = 'cancelled';
      },
      {
        log: {
          type: 'trade',
          text: `Intercambio anulado: ${problem}`,
          actorUserId: trade.fromUserId,
          visibility: 'user',
          targetUserId: trade.toUserId,
        },
      },
    );
    toast(manager, ctx.session, { kind: 'dmAnd', userIds: [trade.fromUserId, trade.toUserId] }, 'warning', `Intercambio anulado: ${problem}`);
    throw new HandlerError(`El intercambio ya no es válido: ${problem}`);
  }

  const from = state.heroes[trade.fromHeroId]!;
  const to = state.heroes[trade.toHeroId]!;
  const labels = tradeLabels(from, trade, currency);
  const log: LogInput = {
    type: 'trade',
    text: `🤝 ${from.name} entrega ${joinNames(labels)} a ${to.name}`,
    actorUserId: trade.fromUserId,
    visibility: 'user',
    targetUserId: trade.toUserId,
  };
  manager.mutate(
    ctx.session,
    (s) => {
      const giver = s.heroes[trade.fromHeroId];
      const receiver = s.heroes[trade.toHeroId];
      const t = s.trades.find((x) => x.id === trade.id);
      if (!giver || !receiver || !t) return;
      for (const req of trade.items) {
        const piece = takeItem(giver.data.inventory, req.itemId, req.quantity);
        if (piece) addItemTo(receiver.data.inventory, piece);
      }
      if (trade.gold > 0) {
        giver.data.gold = round2(giver.data.gold - trade.gold);
        receiver.data.gold = round2(receiver.data.gold + trade.gold);
      }
      t.status = 'accepted';
    },
    { heroes: [trade.fromHeroId, trade.toHeroId], log },
  );
  toast(manager, ctx.session, { kind: 'users', userIds: [trade.fromUserId] }, 'success', `${to.name} acepta tu intercambio`);
  toast(manager, ctx.session, { kind: 'users', userIds: [trade.toUserId] }, 'success', `Recibes ${joinNames(labels)} de ${from.name}`);
}

// ---------------------------------------------------------------------------

function tradeOffer(
  manager: SessionManagerApi,
  ctx: HandlerCtx,
  payload: { toUserId: string; items: { itemId: string; quantity: number }[]; gold: number; note?: string },
): null {
  const state = ctx.session.state;
  if (ctx.isDm) throw new HandlerError('El DM no participa en los intercambios entre jugadores');
  const fromHero = playerHero(state, ctx.userId);
  if (!fromHero) throw new HandlerError('Necesitas un héroe para intercambiar');
  const toUserId = reqId(payload.toUserId, 'jugador');
  if (toUserId === ctx.userId) throw new HandlerError('No puedes intercambiar contigo mismo');
  if (!isPlayer(state, toUserId)) throw new HandlerError('Ese jugador no está en la partida');
  const toHero = playerHero(state, toUserId);
  if (!toHero) throw new HandlerError(`${playerName(ctx.session, toUserId)} todavía no tiene héroe`);
  if (toHero.id === fromHero.id) throw new HandlerError('No puedes intercambiar con tu propio héroe');

  const items = normalizeItems(payload.items);
  for (const req of items) {
    const item = fromHero.data.inventory.find((it) => it.id === req.itemId);
    if (!item) throw new HandlerError('Ese objeto no está en tu inventario');
    if (item.quantity < req.quantity) throw new HandlerError(`Solo tienes ${itemLabel(item.name, item.quantity)}`);
  }
  const currency = currencyShort(ctx);
  const gold = payload.gold === undefined || payload.gold === null ? 0 : round2(reqNum(payload.gold, 'oro'));
  if (gold < 0) throw new HandlerError('La cantidad de oro no puede ser negativa');
  if (gold > fromHero.data.gold) throw new HandlerError(`No tienes tanto ${currency} (tienes ${fromHero.data.gold})`);
  if (items.length === 0 && gold <= 0) throw new HandlerError('Añade algún objeto o algo de oro al intercambio');
  const note = optText(payload.note, 'nota', 300) ?? '';

  const trade: TradeOffer = {
    id: newId('trade'),
    fromUserId: ctx.userId,
    fromHeroId: fromHero.id,
    toUserId,
    toHeroId: toHero.id,
    items,
    gold,
    status: 'pending_target',
    note,
    createdAt: new Date().toISOString(),
  };
  const labels = tradeLabels(fromHero, trade, currency);
  manager.mutate(
    ctx.session,
    (s) => {
      s.trades.push(trade);
      pruneTrades(s);
    },
    {
      log: {
        type: 'trade',
        text: `${fromHero.name} ofrece ${joinNames(labels)} a ${toHero.name}`,
        actorUserId: ctx.userId,
        visibility: 'user',
        targetUserId: toUserId,
      },
    },
  );
  toast(manager, ctx.session, { kind: 'users', userIds: [toUserId] }, 'info', `${fromHero.name} te ofrece un intercambio`);
  return null;
}

function tradeRespond(manager: SessionManagerApi, ctx: HandlerCtx, payload: { tradeId: string; accept: boolean }): null {
  const state = ctx.session.state;
  const trade = requireTrade(state, payload.tradeId);
  if (trade.toUserId !== ctx.userId) throw new HandlerError('Ese intercambio no es para ti');
  if (trade.status !== 'pending_target') throw new HandlerError('Ese intercambio ya no está pendiente');
  if (typeof payload.accept !== 'boolean') throw new HandlerError('Valor no válido para «aceptar»');
  const fromName = state.heroes[trade.fromHeroId]?.name ?? playerName(ctx.session, trade.fromUserId);
  const toName = state.heroes[trade.toHeroId]?.name ?? playerName(ctx.session, trade.toUserId);

  if (!payload.accept) {
    manager.mutate(
      ctx.session,
      (s) => {
        const t = s.trades.find((x) => x.id === trade.id);
        if (t) t.status = 'rejected';
      },
      {
        log: {
          type: 'trade',
          text: `${toName} rechaza el intercambio de ${fromName}`,
          actorUserId: ctx.userId,
          visibility: 'user',
          targetUserId: trade.fromUserId,
        },
      },
    );
    toast(manager, ctx.session, { kind: 'users', userIds: [trade.fromUserId] }, 'warning', `${toName} rechaza tu intercambio`);
    return null;
  }

  if (state.options.tradeNeedsApproval) {
    const problem = tradeProblem(state, trade, currencyShort(ctx));
    if (problem) {
      executeTrade(manager, ctx, trade);
      return null;
    }
    manager.mutate(
      ctx.session,
      (s) => {
        const t = s.trades.find((x) => x.id === trade.id);
        if (t) t.status = 'pending_dm';
      },
      {
        log: {
          type: 'trade',
          text: `${toName} acepta el intercambio de ${fromName}; falta la aprobación del DM`,
          actorUserId: ctx.userId,
          visibility: 'user',
          targetUserId: trade.fromUserId,
        },
      },
    );
    toast(manager, ctx.session, { kind: 'dm' }, 'info', `Intercambio pendiente de aprobación: ${fromName} → ${toName}`);
    toast(manager, ctx.session, { kind: 'users', userIds: [trade.fromUserId] }, 'info', `${toName} acepta tu intercambio; falta la aprobación del DM`);
    return null;
  }

  executeTrade(manager, ctx, trade);
  return null;
}

function tradeApprove(manager: SessionManagerApi, ctx: HandlerCtx, payload: { tradeId: string; approve: boolean }): null {
  const state = ctx.session.state;
  const trade = requireTrade(state, payload.tradeId);
  if (trade.status !== 'pending_dm') throw new HandlerError('Ese intercambio no espera aprobación');
  if (typeof payload.approve !== 'boolean') throw new HandlerError('Valor no válido para «aprobar»');
  if (payload.approve) {
    executeTrade(manager, ctx, trade);
    return null;
  }
  const fromName = state.heroes[trade.fromHeroId]?.name ?? playerName(ctx.session, trade.fromUserId);
  const toName = state.heroes[trade.toHeroId]?.name ?? playerName(ctx.session, trade.toUserId);
  manager.mutate(
    ctx.session,
    (s) => {
      const t = s.trades.find((x) => x.id === trade.id);
      if (t) t.status = 'rejected';
    },
    {
      log: {
        type: 'trade',
        text: `El DM rechaza el intercambio entre ${fromName} y ${toName}`,
        actorUserId: trade.fromUserId,
        visibility: 'user',
        targetUserId: trade.toUserId,
      },
    },
  );
  toast(manager, ctx.session, { kind: 'users', userIds: [trade.fromUserId, trade.toUserId] }, 'warning', 'El DM ha rechazado el intercambio');
  return null;
}

function tradeCancel(manager: SessionManagerApi, ctx: HandlerCtx, payload: { tradeId: string }): null {
  const state = ctx.session.state;
  const trade = requireTrade(state, payload.tradeId);
  if (!ctx.isDm && trade.fromUserId !== ctx.userId) throw new HandlerError('Solo quien ofrece el intercambio puede retirarlo');
  if (!PENDING.includes(trade.status)) throw new HandlerError('Ese intercambio ya no está pendiente');
  const fromName = state.heroes[trade.fromHeroId]?.name ?? playerName(ctx.session, trade.fromUserId);
  manager.mutate(
    ctx.session,
    (s) => {
      const t = s.trades.find((x) => x.id === trade.id);
      if (t) t.status = 'cancelled';
    },
    {
      log: {
        type: 'trade',
        text: ctx.isDm ? `El DM anula la oferta de ${fromName}` : `${fromName} retira su oferta de intercambio`,
        actorUserId: trade.fromUserId,
        visibility: 'user',
        targetUserId: trade.toUserId,
      },
    },
  );
  const notify = ctx.isDm ? [trade.fromUserId, trade.toUserId] : [trade.toUserId];
  toast(manager, ctx.session, { kind: 'users', userIds: notify }, 'info', ctx.isDm ? `El DM anula la oferta de ${fromName}` : `${fromName} retira su oferta`);
  return null;
}

export const registerTradeHandlers: HandlerModule = (socket, manager) => {
  manager.register(socket, 'trade:offer', (ctx, payload) => tradeOffer(manager, ctx, payload));
  manager.register(socket, 'trade:respond', (ctx, payload) => tradeRespond(manager, ctx, payload));
  manager.register(socket, 'trade:approve', (ctx, payload) => tradeApprove(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'trade:cancel', (ctx, payload) => tradeCancel(manager, ctx, payload));
};
