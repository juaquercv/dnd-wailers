import { useMemo } from 'react';
import {
  createRuleSystem,
  isOwnHero,
  type HeroSheet,
  type LiveState,
  type RuleSystem,
  type SessionPlayer,
  type Token,
  type VisibilitySettings,
} from '@wailers/shared';
import { useDisplayState, useSessionStore } from '../../../stores/session';

const FALLBACK_RULES: RuleSystem = createRuleSystem('none');

/** Everything a game panel needs to decide what to show and what can be edited. */
export interface PanelContext {
  /** State to render (complete for the DM, filtered for players and for the DM preview). */
  state: LiveState | null;
  effective: VisibilitySettings | null;
  rules: RuleSystem;
  /** True when this client is the DM (host), even while previewing as a player. */
  isDm: boolean;
  /** DM editing controls are available (DM and not previewing as a player). */
  canManage: boolean;
  isPreview: boolean;
  /** Perspective user: the player, the previewed player, or the DM. */
  viewerId: string | null;
  /** The real user of this client. */
  meUserId: string | null;
  hostUserId: string | null;
}

export function usePanelContext(): PanelContext {
  const role = useSessionStore((s) => s.view?.role ?? null);
  const meUserId = useSessionStore((s) => s.view?.meUserId ?? null);
  const rules = useSessionStore((s) => s.campaign?.rules ?? null);
  const { state, effective, asUserId, isPreview } = useDisplayState();
  return useMemo(() => {
    const isDm = role === 'dm';
    return {
      state,
      effective,
      rules: rules ?? FALLBACK_RULES,
      isDm,
      canManage: isDm && !isPreview,
      isPreview,
      viewerId: asUserId ?? meUserId,
      meUserId,
      hostUserId: state?.hostUserId ?? null,
    };
  }, [role, meUserId, rules, state, effective, asUserId, isPreview]);
}

/** The hero belongs to the perspective user (player, or the player being previewed by the DM). */
export function viewerOwnsHero(ctx: PanelContext, hero: HeroSheet): boolean {
  if (!ctx.state || !ctx.viewerId || ctx.viewerId === ctx.hostUserId) return false;
  return isOwnHero(ctx.state, hero, ctx.viewerId);
}

/** A real player (not the DM preview) acting on their own hero. */
export function actsAsOwner(ctx: PanelContext, hero: HeroSheet): boolean {
  return !ctx.isDm && viewerOwnsHero(ctx, hero);
}

/** Mana / slots / limited uses: DM always; the owner only when the campaign allows it. */
export function canEditResources(ctx: PanelContext, hero: HeroSheet): boolean {
  return ctx.canManage || (actsAsOwner(ctx, hero) && ctx.rules.playersCanEditOwnResources);
}

/** Inventory and gold of other heroes are hidden for players without permission. */
export function canSeeInventoryOf(ctx: PanelContext, hero: HeroSheet): boolean {
  if (ctx.isDm && !ctx.isPreview) return true;
  if (viewerOwnsHero(ctx, hero)) return true;
  return ctx.effective?.canSeeOthersInventory ?? false;
}

/** The player sitting on a hero (if any). */
export function playerOfHero(state: LiveState, heroId: string): SessionPlayer | null {
  return Object.values(state.players).find((p) => p.heroId === heroId) ?? null;
}

/** Live token of a hero (first match). */
export function heroTokenOf(state: LiveState, heroId: string): Token | null {
  return Object.values(state.tokens).find((t) => t.kind === 'hero' && t.heroId === heroId) ?? null;
}

/** Players with a selected hero, ordered by join time. */
export function partyMembers(state: LiveState): { player: SessionPlayer; hero: HeroSheet }[] {
  return Object.values(state.players)
    .filter((p) => p.heroId && state.heroes[p.heroId])
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.name.localeCompare(b.name, 'es'))
    .map((player) => ({ player, hero: state.heroes[player.heroId!]! }));
}

/** Display color for a user: session player color, else the gold accent (DM / unknown). */
export function userColor(state: LiveState | null, userId: string | null | undefined, fallback = '#e9c063'): string {
  if (!state || !userId) return fallback;
  return state.players[userId]?.color ?? fallback;
}
