import type { WeatherType, LightingPreset, SpellAnimation } from './constants';
import type { UserStatusDTO } from './types/api';
import type { HeroData, InventoryItem } from './types/library';
import type { ZoneVision } from './types/campaign';
import type { Roller, RollMode, RollResult, RollVisibility } from './types/rollers';
import type {
  FxEvent,
  LogEntry,
  Projection,
  SessionEvent,
  SessionOptions,
  SessionSummary,
  SessionView,
  SessionZonesPayload,
  Token,
  TurnEntry,
  VisibilitySettings,
} from './types/session';

/**
 * Socket.IO contract.
 *
 * Connection: io({ auth: { token } }). Sockets without a valid token are "anonymous": they only
 * receive `users:status` and `sessions:list`. Every client->server event takes (payload, ack) and the
 * server ALWAYS answers through ack with AckResult. "DM" = session host; the server rejects DM-only
 * events from players with { ok: false, error: 'Solo el DM puede hacer esto' }.
 *
 * Rooms (server side): `session:<id>` (all members), `session:<id>:dm` (host sockets), `user:<userId>`.
 */
export type AckResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export type HeroAdjustField = 'hp' | 'tempHp' | 'maxHp' | 'mana' | 'maxMana' | 'gold' | 'xp' | 'level' | 'ac';

export interface C2SPayloads {
  // --- session lifecycle ---------------------------------------------------
  /** Join (or rejoin after reload) a session as host or player. */
  'session:join': { sessionId: string };
  'session:leave': Record<string, never>;
  /** DM: lobby -> playing. Spawns hero tokens at the campaign spawn point. */
  'session:start': Record<string, never>;
  /** DM: persist now. */
  'session:save': Record<string, never>;
  /** DM: save and close (status paused, resumable). */
  'session:pause': Record<string, never>;
  /** DM: finish (status ended). */
  'session:end': Record<string, never>;
  'session:setOptions': { patch: Partial<SessionOptions> };

  // --- lobby --------------------------------------------------------------
  'lobby:selectHero': { heroId: string | null };
  'lobby:setReady': { ready: boolean };
  /** DM: remove a player from the session. */
  'lobby:kick': { userId: string };

  // --- chat ---------------------------------------------------------------
  /** toUserId = whisper (sender, target and DM see it). */
  'chat:send': { text: string; toUserId?: string | null };

  // --- turn order (DM) ----------------------------------------------------
  'turn:setMode': { mode: 'manual' | 'random' };
  /** Random draw with d20 animation for everyone (event 'initiativeDraw'). Includes all current entries. */
  'turn:randomize': Record<string, never>;
  /** Reorder by entry ids. */
  'turn:setOrder': { order: string[] };
  'turn:next': Record<string, never>;
  'turn:prev': Record<string, never>;
  'turn:setCurrent': { entryId: string };
  /** Insert an entry (e.g. an enemy token) at index (default end). */
  'turn:add': { entry: Omit<TurnEntry, 'id'>; index?: number };
  'turn:remove': { entryId: string };
  'turn:update': { entryId: string; patch: Partial<Pick<TurnEntry, 'name' | 'initiative' | 'imageUrl'>> };
  /** Rebuild player entries from the current players (keeps non-player entries). */
  'turn:syncPlayers': Record<string, never>;

  // --- tokens -------------------------------------------------------------
  /** DM: spawn creature/npc/item tokens from a library entry. */
  'token:spawn': { entryId: string; zoneId: string; levelId: string; x: number; y: number; hidden?: boolean; count?: number; dramatic?: boolean };
  /** DM: (re)place hero tokens of the given players (default all with hero) at a point (default spawn). */
  'token:placeHeroes': { userIds?: string[]; target?: { zoneId: string; levelId: string; x: number; y: number } };
  /** DM any token; player only own hero token when canMoveOwnToken. */
  'token:move': { tokenId: string; x: number; y: number; facing?: number };
  /** Transient drag preview (throttled ~15/s by the client). */
  'token:drag': { tokenId: string; x: number; y: number };
  /** Move tokens to another zone / sub-zone / level. x/y default: transition target or level center. Players: own token through neighbors/transitions only when canMoveOwnToken. */
  'token:transfer': { tokenIds: string[]; zoneId: string; levelId: string; x?: number; y?: number };
  /** DM: edit token fields (name, hidden, statuses, cells, color, light, notes, ac, hp, maxHp, facing...). */
  'token:update': { tokenId: string; patch: Partial<Omit<Token, 'id' | 'kind' | 'heroId' | 'entryId'>> };
  /** DM: quick HP. For hero tokens it edits the hero sheet. */
  'token:hp': { tokenId: string; delta?: number; set?: number };
  'token:status': { tokenId: string; status: string; on: boolean };
  'token:remove': { tokenId: string };
  'token:duplicate': { tokenId: string };

  // --- heroes / inventory (DM; players limited by rules) --------------------
  /** DM: patch hero sheet fields. Players may only patch `notes` of their own hero. */
  'hero:update': { heroId: string; patch: Partial<HeroData> & { name?: string; imageUrl?: string | null; level?: number } };
  'hero:adjust': { heroId: string; field: HeroAdjustField; delta: number };
  'hero:status': { heroId: string; status: string; on: boolean };
  /** Spell slots: delta used (+1 = spend one). Players allowed when playersCanEditOwnResources. */
  'hero:slot': { heroId: string; level: number; delta: number };
  /** Limited uses: delta used. Players allowed when playersCanEditOwnResources. */
  'hero:use': { heroId: string; useId: string; delta: number };
  /** Mana spend/restore by players on their own hero when playersCanEditOwnResources. */
  'hero:mana': { heroId: string; delta: number };
  /** DM: apply campaign rest rules to heroes (manual action). */
  'hero:rest': { heroIds: string[]; type: 'short' | 'long' };
  /** DM: give manaRegenPerTurn to heroes. */
  'hero:regenMana': { heroIds: string[] };
  /** DM: add an item to a hero (from library entry or custom). */
  'inventory:add': { heroId: string; entryId?: string; item?: Partial<InventoryItem>; quantity?: number };
  'inventory:remove': { heroId: string; itemId: string; quantity?: number };
  'inventory:update': { heroId: string; itemId: string; patch: Partial<InventoryItem> };
  /** DM: move items between heroes and/or token loot. */
  'inventory:transfer': {
    from: { heroId?: string; tokenId?: string };
    to: { heroId?: string; tokenId?: string };
    itemId: string;
    quantity?: number;
  };
  /** DM: register loot on a token (from library or custom). */
  'loot:add': { tokenId: string; entryId?: string; item?: Partial<InventoryItem>; quantity?: number };
  'loot:remove': { tokenId: string; itemId: string };

  // --- trades between players -----------------------------------------------
  'trade:offer': { toUserId: string; items: { itemId: string; quantity: number }[]; gold: number; note?: string };
  'trade:respond': { tradeId: string; accept: boolean };
  /** DM approval when options.tradeNeedsApproval. */
  'trade:approve': { tradeId: string; approve: boolean };
  'trade:cancel': { tradeId: string };

  // --- visibility (DM) ---------------------------------------------------
  'vis:setGlobal': { patch: Partial<VisibilitySettings> };
  /** patch null = clear all overrides for that player. */
  'vis:setPlayer': { userId: string; patch: Partial<VisibilitySettings> | null };
  'fog:reveal': { zoneId: string; regionId: string; revealed: boolean };
  /** Clear explored memory (all players if userId omitted; all levels if levelId omitted). */
  'fog:resetExplored': { userId?: string; levelId?: string };
  'door:toggle': { zoneId: string; wallId: string; open: boolean };
  'view:dm': { zoneId: string; levelId: string };
  'show:open': { projection: Omit<Projection, 'id'> };
  'show:close': Record<string, never>;

  // --- interaction ------------------------------------------------------
  'ping': { zoneId: string; levelId: string; x: number; y: number };

  // --- dice & roulettes ---------------------------------------------------
  /** DM any; players only public and when playersCanRollFreely (or answering a request via roll:fulfill). */
  'roll:dice': { formula: string; label?: string; mode?: RollMode; visibility?: RollVisibility; targetUserId?: string | null };
  /** Roll a campaign roller (roulette/custom die). Players: only offered turn rollers on their turn. */
  'roll:roller': { rollerId: string; visibility?: RollVisibility; targetUserId?: string | null };
  /** DM asks a player to roll; the player gets a button. */
  'roll:request': { targetUserId: string; label: string; formula?: string; rollerId?: string; mode?: RollMode; visibility?: RollVisibility };
  /** Player executes a pending request (animation for everyone allowed by its visibility). */
  'roll:fulfill': { requestId: string };
  'roll:cancel': { requestId: string };
  /** Player dismisses the turn offer. */
  'roll:dismissOffer': Record<string, never>;

  // --- audio & effects (DM) ----------------------------------------------
  'audio:play': { channel: 'music' | 'ambience'; soundId: string | null };
  'audio:mode': { mode: 'zone' | 'manual' };
  'audio:master': { volume: number };
  'audio:sfx': { soundId: string };
  'fx:trigger': { fx: FxEvent };
  'fx:weather': { zoneId: string; weather: WeatherType | null };
  'fx:lighting': { zoneId: string; lighting: LightingPreset | null };
  /**
   * Hero (owner or DM) casts a spell: animation + log only, no automatic effect on targets.
   * During combat with the turn economy, a player's cast on their own turn spends 1 combat action
   * (rejected when none is left); `free: true` (DM only) never spends.
   */
  'spell:cast': {
    heroId?: string;
    tokenId?: string;
    spellName: string;
    animation: SpellAnimation;
    zoneId: string;
    levelId: string;
    x: number;
    y: number;
    free?: boolean;
  };

  // --- turn economy (movement + combat actions per turn) -------------------
  /** DM: start/stop combat. Starting resets every hero's usage and announces the current turn. */
  'combat:set': { active: boolean };
  /** Player: end their own turn (only when the current turn entry is theirs). Same effect as turn:next. */
  'turn:endMine': Record<string, never>;
  /** DM: adjust a hero's usage this turn. `reset` zeroes moved/actions; deltas change bonusMove/bonusActions or moved/actions. */
  'usage:adjust': { heroId: string; reset?: boolean; movedDelta?: number; actionsDelta?: number; bonusMoveDelta?: number; bonusActionsDelta?: number };
  /** Owner or DM: spend one combat action with a label (e.g. "Ataque con espada"). Log only. */
  'action:use': { heroId: string; label: string };
  /** Owner or DM: use an inventory item (costs 1 combat action in combat; `consume` removes 1 unit). Log only, no automatic effect. */
  'item:use': { heroId: string; itemId: string; consume?: boolean };
  /** Player: pick up an item token next to their hero (free action) — the item goes to their inventory. */
  'token:pickup': { tokenId: string };
  /** Player: open/close a door next to their hero (free action). */
  'door:use': { zoneId: string; wallId: string };
  /** DM: move several tokens at once (right-click "Mover selección aquí"). Same zone/level as each token. */
  'token:moveMany': { moves: { tokenId: string; x: number; y: number }[] };
  /** DM: live override of a zone's vision (null = back to the zone default). */
  'zone:vision': { zoneId: string; vision: ZoneVision | null };
}

export interface C2SResults {
  'session:join': SessionView;
  'roll:dice': RollResult;
  'roll:roller': RollResult;
  'roll:fulfill': RollResult;
  'token:spawn': string[];
  'chat:send': LogEntry;
}

export type C2SEvent = keyof C2SPayloads;
export type C2SResult<E extends C2SEvent> = E extends keyof C2SResults ? C2SResults[E] : null;

export type ClientToServerEvents = {
  [E in C2SEvent]: (payload: C2SPayloads[E], ack: (res: AckResult<C2SResult<E>>) => void) => void;
};

export interface ServerToClientEvents {
  /** Public: user availability for the login screen. */
  'users:status': (users: UserStatusDTO[]) => void;
  /** Public: active sessions for the join screen. */
  'sessions:list': (sessions: SessionSummary[]) => void;
  /** Full (filtered) live state; sent on join and after each mutation (coalesced). */
  'session:state': (view: SessionView) => void;
  /** Zone documents for the session (filtered for players); sent on join and when zones or allowed zones change. */
  'session:zones': (payload: SessionZonesPayload) => void;
  /** Transient events (rolls, fx, sfx, pings, toasts...). */
  'session:event': (event: SessionEvent) => void;
  /** New log line visible to this user. */
  'session:log': (entry: LogEntry) => void;
  /** DM only: campaign rollers changed (live editing). */
  'session:rollers': (rollers: Roller[]) => void;
  /** The user's claim was released (timeout/logout elsewhere); client must return to login. */
  'auth:revoked': (reason: string) => void;
}

export interface SocketData {
  userId: string | null;
  userName: string | null;
  token: string | null;
  sessionId: string | null;
}
