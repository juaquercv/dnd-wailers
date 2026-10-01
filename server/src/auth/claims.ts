import { newId, type UserDTO, type UserStatusDTO } from '@wailers/shared';
import { bus } from '../bus';
import { config } from '../config';
import { prisma } from '../db';

/**
 * Password-less user locking.
 *
 * A user is "in use" while it has a claim: from the moment it is claimed, while any socket is
 * attached, and during a grace period (USER_RELEASE_SECONDS) after the last socket detaches.
 * A claim that never gets a socket is also released after the grace period.
 */

export type ClaimFailureCode = 'unknown_user' | 'in_use';

export type ClaimResult = { ok: true; token: string } | { ok: false; reason: string; code: ClaimFailureCode };

export const CLAIM_REASONS = {
  unknownUser: 'Ese usuario no existe',
  inUse: 'Este usuario ya está en uso',
  timeout: 'Tu usuario se liberó por inactividad. Vuelve a elegirlo para continuar.',
  logout: 'Se cerró la sesión de este usuario.',
  removed: 'Este usuario ya no existe.',
} as const;

interface ClaimRecord {
  userId: string;
  token: string;
  sockets: Set<string>;
  releaseTimer: NodeJS.Timeout | null;
  claimedAt: number;
}

export interface ClaimRegistryOptions {
  releaseSeconds: number;
  loadUsers?: () => Promise<UserDTO[]>;
}

type ChangeListener = () => void;
type ReleaseListener = (userId: string, reason: string) => void;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function byName(a: UserDTO, b: UserDTO): number {
  return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
}

export class ClaimRegistry {
  private readonly users = new Map<string, UserDTO>();
  private readonly byUser = new Map<string, ClaimRecord>();
  private readonly byToken = new Map<string, string>();
  private readonly changeListeners = new Set<ChangeListener>();
  private readonly releaseListeners = new Set<ReleaseListener>();

  constructor(private readonly options: ClaimRegistryOptions) {}

  // --- known users -----------------------------------------------------------

  /** Replace the known users. Claims of users that no longer exist are released. */
  setUsers(users: UserDTO[]): void {
    const nextIds = new Set(users.map((u) => u.id));
    let changed = users.length !== this.users.size;
    for (const user of users) {
      const prev = this.users.get(user.id);
      if (!prev || prev.name !== user.name || prev.color !== user.color) changed = true;
    }
    for (const id of [...this.byUser.keys()]) {
      if (!nextIds.has(id)) this.release(id, CLAIM_REASONS.removed);
    }
    this.users.clear();
    for (const user of users) this.users.set(user.id, { id: user.id, name: user.name, color: user.color });
    if (changed) this.emitChange();
  }

  /** Reload the known users from the database (no-op when no loader is configured). */
  async refreshUsers(): Promise<void> {
    if (!this.options.loadUsers) return;
    this.setUsers(await this.options.loadUsers());
  }

  hasUser(userId: string): boolean {
    return this.users.has(userId);
  }

  getUser(userId: string): UserDTO | null {
    const user = this.users.get(userId);
    return user ? { ...user } : null;
  }

  listUsers(): UserDTO[] {
    return [...this.users.values()].map((u) => ({ ...u })).sort(byName);
  }

  statuses(): UserStatusDTO[] {
    return this.listUsers().map((u) => ({ ...u, status: this.byUser.has(u.id) ? 'in_use' : 'available' }));
  }

  // --- claims ------------------------------------------------------------------

  /**
   * Claim a user.
   * - free user: claimed; a provided token is adopted (clients survive a server restart).
   * - in use with the same token: ok (same browser reconnecting).
   * - in use with another token: fails.
   * - resumeOnly: only succeeds when the user has no connected socket and is either free or
   *   claimed with the very same token (restoring a tab from localStorage).
   */
  claim(userId: string, token?: string | null, resumeOnly = false): ClaimResult {
    if (!this.users.has(userId)) return { ok: false, reason: CLAIM_REASONS.unknownUser, code: 'unknown_user' };
    const provided = typeof token === 'string' && token.length > 0 ? token : null;
    const existing = this.byUser.get(userId);

    if (existing) {
      const sameToken = provided !== null && provided === existing.token;
      if (!sameToken) return { ok: false, reason: CLAIM_REASONS.inUse, code: 'in_use' };
      if (resumeOnly && existing.sockets.size > 0) return { ok: false, reason: CLAIM_REASONS.inUse, code: 'in_use' };
      if (existing.sockets.size === 0 && !existing.releaseTimer) this.startReleaseTimer(existing);
      return { ok: true, token: existing.token };
    }

    const adopt =
      provided !== null && TOKEN_PATTERN.test(provided) && !this.byToken.has(provided) ? provided : null;
    const record: ClaimRecord = {
      userId,
      token: adopt ?? newId('tok'),
      sockets: new Set(),
      releaseTimer: null,
      claimedAt: Date.now(),
    };
    this.byUser.set(userId, record);
    this.byToken.set(record.token, userId);
    this.startReleaseTimer(record);
    this.emitChange();
    return { ok: true, token: record.token };
  }

  /** Free a user immediately. Returns false when it was not claimed. */
  release(userId: string, reason: string): boolean {
    const record = this.byUser.get(userId);
    if (!record) return false;
    this.clearReleaseTimer(record);
    this.byUser.delete(userId);
    this.byToken.delete(record.token);
    for (const listener of [...this.releaseListeners]) {
      try {
        listener(userId, reason);
      } catch (err) {
        console.error('[claims] Error en un oyente de liberación:', err);
      }
    }
    this.emitChange();
    return true;
  }

  userIdForToken(token: string | null | undefined): string | null {
    if (!token) return null;
    return this.byToken.get(token) ?? null;
  }

  /** Token of the current claim (server-side use only). */
  tokenForUser(userId: string): string | null {
    return this.byUser.get(userId)?.token ?? null;
  }

  /** Register a live socket for the claimed user. Returns false when the user is not claimed. */
  attachSocket(userId: string, socketId: string): boolean {
    const record = this.byUser.get(userId);
    if (!record) return false;
    record.sockets.add(socketId);
    this.clearReleaseTimer(record);
    return true;
  }

  /** Unregister a socket; when the last one leaves the grace-period timer starts. */
  detachSocket(userId: string, socketId: string): void {
    const record = this.byUser.get(userId);
    if (!record || !record.sockets.delete(socketId)) return;
    if (record.sockets.size === 0) this.startReleaseTimer(record);
  }

  isInUse(userId: string): boolean {
    return this.byUser.has(userId);
  }

  isConnected(userId: string): boolean {
    const record = this.byUser.get(userId);
    return !!record && record.sockets.size > 0;
  }

  /** Called whenever the in-use status of any user changes (claim, release, user list change). */
  onChange(listener: ChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** Called when a claim is released (timeout, logout, removal). */
  onReleased(listener: ReleaseListener): () => void {
    this.releaseListeners.add(listener);
    return () => this.releaseListeners.delete(listener);
  }

  /** Drop every timer (graceful shutdown). Claims are kept so in-flight requests still resolve. */
  dispose(): void {
    for (const record of this.byUser.values()) this.clearReleaseTimer(record);
  }

  // --- internals ---------------------------------------------------------------

  private startReleaseTimer(record: ClaimRecord): void {
    this.clearReleaseTimer(record);
    const timer = setTimeout(() => {
      record.releaseTimer = null;
      if (this.byUser.get(record.userId) !== record || record.sockets.size > 0) return;
      this.release(record.userId, CLAIM_REASONS.timeout);
    }, this.options.releaseSeconds * 1000);
    timer.unref();
    record.releaseTimer = timer;
  }

  private clearReleaseTimer(record: ClaimRecord): void {
    if (record.releaseTimer) {
      clearTimeout(record.releaseTimer);
      record.releaseTimer = null;
    }
  }

  private emitChange(): void {
    for (const listener of [...this.changeListeners]) {
      try {
        listener();
      } catch (err) {
        console.error('[claims] Error en un oyente de cambios:', err);
      }
    }
    bus.emit('users:changed', {});
  }
}

export const claims = new ClaimRegistry({
  releaseSeconds: config.userReleaseSeconds,
  loadUsers: async () => {
    const rows = await prisma.user.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, color: true } });
    return rows;
  },
});
