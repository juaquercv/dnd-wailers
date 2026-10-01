import type { ReactNode } from 'react';
import {
  ArrowLeftRight,
  Dices,
  Footprints,
  Gem,
  HeartPulse,
  Info,
  MessageSquare,
  Music,
  Package,
  Sparkles,
  Swords,
} from 'lucide-react';
import { describeRoll, type LogType, type RollResult } from '@wailers/shared';

export const LOG_TYPE_META: Record<LogType, { label: string; icon: ReactNode; color: string }> = {
  chat: { label: 'Chat', icon: <MessageSquare />, color: '#7cc4f2' },
  roll: { label: 'Tirada', icon: <Dices />, color: '#e9c063' },
  system: { label: 'Sistema', icon: <Info />, color: '#cdb98f' },
  hp: { label: 'Puntos de vida', icon: <HeartPulse />, color: '#e0625a' },
  item: { label: 'Objetos', icon: <Package />, color: '#e6a95c' },
  turn: { label: 'Turno', icon: <Swords />, color: '#f3d58a' },
  move: { label: 'Movimiento', icon: <Footprints />, color: '#a8946b' },
  loot: { label: 'Botín', icon: <Gem />, color: '#ff9b2f' },
  trade: { label: 'Intercambio', icon: <ArrowLeftRight />, color: '#5fd07a' },
  fx: { label: 'Efecto', icon: <Sparkles />, color: '#a98bff' },
  audio: { label: 'Audio', icon: <Music />, color: '#c7b4ff' },
};

export type LogFilterId = 'all' | 'rolls' | 'chat' | 'system' | 'hpItems' | 'turns' | 'fx';

export const LOG_FILTERS: { id: LogFilterId; label: string; types: LogType[] | null }[] = [
  { id: 'all', label: 'Todo', types: null },
  { id: 'rolls', label: 'Tiradas', types: ['roll'] },
  { id: 'chat', label: 'Chat', types: ['chat'] },
  { id: 'system', label: 'Sistema', types: ['system', 'move'] },
  { id: 'hpItems', label: 'PV y objetos', types: ['hp', 'item', 'loot', 'trade'] },
  { id: 'turns', label: 'Turnos', types: ['turn'] },
  { id: 'fx', label: 'Efectos', types: ['fx', 'audio'] },
];

/** Narrow the `data` of a roll log line to a RollResult (null when it does not look like one). */
export function asRollResult(data: unknown): RollResult | null {
  if (!data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  if (r.kind !== 'dice' && r.kind !== 'roulette' && r.kind !== 'custom_die') return null;
  if (!Array.isArray(r.dice)) return null;
  return data as RollResult;
}

/** "[14, (3)] + 5 = 19" for dice rolls; null for roulettes / custom dice or malformed data. */
export function rollBreakdown(roll: RollResult): string | null {
  if (roll.kind !== 'dice' || typeof roll.formula !== 'string' || typeof roll.total !== 'number') return null;
  try {
    return describeRoll({
      formula: roll.formula,
      dice: roll.dice,
      modifier: typeof roll.modifier === 'number' ? roll.modifier : 0,
      total: roll.total,
      crit: roll.crit ?? null,
    });
  } catch {
    return null;
  }
}
