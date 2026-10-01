import type { LiveState, Rarity, TradeOffer } from '@wailers/shared';
import type { BadgeTone } from '../../../components/ui/Badge';

/**
 * Players without "ver inventarios de otros" receive other heroes' inventories empty, so the offer's
 * item ids cannot be resolved by the recipient. The offer note therefore carries a readable summary
 * line (marked with this prefix) that the trades panel shows when the items cannot be resolved.
 */
export const TRADE_SUMMARY_MARK = '📦 ';

/** Server limit for trade notes (characters, after trimming). */
export const TRADE_NOTE_MAX = 300;
/** Characters reserved for the player's own words; the rest is for the summary line. */
export const TRADE_NOTE_TEXT_MAX = 180;

function clip(text: string, max: number): string {
  if (max <= 0) return '';
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Player note + summary line, always within TRADE_NOTE_MAX (the summary is shortened if needed). */
export function composeTradeNote(note: string, summary: string): string {
  const text = clip(note.trim(), TRADE_NOTE_TEXT_MAX);
  if (!summary) return text;
  const prefix = text ? `${text}\n${TRADE_SUMMARY_MARK}` : TRADE_SUMMARY_MARK;
  return `${prefix}${clip(summary, TRADE_NOTE_MAX - prefix.length)}`;
}

export function splitTradeNote(note: string): { text: string; summary: string | null } {
  const lines = note.split('\n');
  const summaryLine = lines.find((l) => l.startsWith(TRADE_SUMMARY_MARK)) ?? null;
  const text = lines
    .filter((l) => !l.startsWith(TRADE_SUMMARY_MARK))
    .join('\n')
    .trim();
  return { text, summary: summaryLine ? summaryLine.slice(TRADE_SUMMARY_MARK.length).trim() : null };
}

export const TRADE_STATUS: Record<TradeOffer['status'], { label: string; tone: BadgeTone }> = {
  pending_target: { label: 'Esperando respuesta', tone: 'sky' },
  pending_dm: { label: 'Esperando al DM', tone: 'gold' },
  accepted: { label: 'Completado', tone: 'emerald' },
  rejected: { label: 'Rechazado', tone: 'blood' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
};

export function isPendingTrade(t: TradeOffer): boolean {
  return t.status === 'pending_target' || t.status === 'pending_dm';
}

export interface ResolvedTradeItem {
  itemId: string;
  quantity: number;
  name: string | null;
  rarity: Rarity | null;
}

/** Item names from the offering hero's inventory, when visible to this client. */
export function resolveTradeItems(state: LiveState, trade: TradeOffer): ResolvedTradeItem[] {
  const inventory = state.heroes[trade.fromHeroId]?.data.inventory ?? [];
  return trade.items.map((it) => {
    const found = inventory.find((i) => i.id === it.itemId);
    return { itemId: it.itemId, quantity: it.quantity, name: found?.name ?? null, rarity: found?.rarity ?? null };
  });
}
