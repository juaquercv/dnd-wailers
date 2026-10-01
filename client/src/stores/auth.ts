import { create } from 'zustand';
import type { ClaimRequest, UserDTO } from '@wailers/shared';
import { api, ApiRequestError, setHttpToken } from '../api/http';
import { getSocket, setSocketToken } from '../api/socket';
import { toast } from '../components/ui/toast';
import { clearLastSessionId, useSessionStore } from './session';
import { setSettingsUser } from './settings';

/**
 * Passwordless user claims.
 * The token lives in sessionStorage (one user per tab) with a copy in localStorage so a new tab
 * can resume the same user when it is not connected anywhere else.
 */
export type AuthStatus = 'idle' | 'restoring' | 'ready' | 'anonymous';

const CLAIM_KEY = 'wailers.claim';

interface StoredClaim {
  userId: string;
  token: string;
}

interface AuthState {
  user: UserDTO | null;
  token: string | null;
  status: AuthStatus;
  /** userId currently being claimed (login screen feedback). */
  claimingUserId: string | null;
  /** Claim a user from the login screen. Throws ApiRequestError (Spanish message) on failure. */
  claim: (userId: string) => Promise<UserDTO>;
  /** Called once at app start. */
  restore: () => Promise<void>;
  /** Release the user on the server, clear storages and go back to the login screen. */
  logout: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Storage helpers (storage may be unavailable: private mode, disabled cookies…)
// ---------------------------------------------------------------------------

function readClaim(storage: Storage | undefined): StoredClaim | null {
  try {
    const raw = storage?.getItem(CLAIM_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as StoredClaim).userId === 'string' &&
      typeof (parsed as StoredClaim).token === 'string'
    ) {
      return { userId: (parsed as StoredClaim).userId, token: (parsed as StoredClaim).token };
    }
  } catch {
    /* ignore corrupted / unavailable storage */
  }
  return null;
}

function writeClaim(claim: StoredClaim): void {
  const raw = JSON.stringify(claim);
  try {
    sessionStorage.setItem(CLAIM_KEY, raw);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(CLAIM_KEY, raw);
  } catch {
    /* ignore */
  }
}

function safeSession(): Storage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

function safeLocal(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function removeKey(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Drops stored claims; the localStorage copy only when it holds the same token (another tab may own a newer one). */
function clearClaims(token: string | null): void {
  removeKey(safeSession(), CLAIM_KEY);
  const local = readClaim(safeLocal());
  if (local && (token === null || local.token === token)) removeKey(safeLocal(), CLAIM_KEY);
}

/** `forceReconnect`: new socket handshake even when the token did not change. */
function applyToken(token: string | null, forceReconnect = false): void {
  setHttpToken(token);
  setSocketToken(token, forceReconnect);
}

// ---------------------------------------------------------------------------
// Navigation bridge (stores cannot use hooks)
// ---------------------------------------------------------------------------

type NavigateFn = (to: string, opts?: { replace?: boolean }) => void;
let navigator: NavigateFn | null = null;

/** Registered by App inside the router so the store can redirect after logout/revocation. */
export function bindAuthNavigator(fn: NavigateFn | null): void {
  navigator = fn;
}

function goToLogin(): void {
  if (navigator) navigator('/', { replace: true });
  else if (typeof window !== 'undefined' && window.location.pathname !== '/') window.location.assign('/');
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let restorePromise: Promise<void> | null = null;
let socketBound = false;
/** True while logout() runs: its own release triggers `auth:revoked`, which must not re-claim the user. */
let loggingOut = false;

async function requestClaim(body: ClaimRequest): Promise<{ user: UserDTO; token: string }> {
  const res = await api.auth.claim(body);
  return { user: res.user, token: res.token };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  status: 'idle',
  claimingUserId: null,

  claim: async (userId) => {
    bindSocket();
    set({ claimingUserId: userId });
    try {
      // Reuse a stored token for this same user (reload / reconnection keeps the claim).
      const stored = readClaim(safeSession()) ?? readClaim(safeLocal());
      const token = stored && stored.userId === userId ? stored.token : undefined;
      const res = await requestClaim({ userId, token });
      writeClaim({ userId: res.user.id, token: res.token });
      applyToken(res.token);
      set({ user: res.user, token: res.token, status: 'ready', claimingUserId: null });
      return res.user;
    } catch (err) {
      set({ claimingUserId: null });
      if (err instanceof ApiRequestError && err.status === 409) {
        throw new ApiRequestError(err.message || 'Ese aventurero ya está en uso', err.status, err.details);
      }
      throw err;
    }
  },

  restore: () => {
    if (restorePromise) return restorePromise;
    bindSocket();
    set({ status: 'restoring' });
    restorePromise = (async () => {
      const fromSession = readClaim(safeSession());
      const fromLocal = fromSession ? null : readClaim(safeLocal());
      const stored = fromSession ?? fromLocal;
      if (!stored) {
        applyToken(null);
        set({ status: 'anonymous', user: null, token: null });
        return;
      }
      try {
        const res = await requestClaim(
          fromSession ? { userId: stored.userId, token: stored.token } : { userId: stored.userId, token: stored.token, resumeOnly: true },
        );
        writeClaim({ userId: res.user.id, token: res.token });
        applyToken(res.token);
        set({ user: res.user, token: res.token, status: 'ready' });
      } catch (err) {
        // 409 = in use elsewhere: this tab's claim is stale. A resumeOnly failure leaves the shared copy alone.
        if (fromSession && err instanceof ApiRequestError && err.status !== 0) clearClaims(stored.token);
        applyToken(null);
        set({ status: 'anonymous', user: null, token: null });
      }
    })();
    return restorePromise;
  },

  logout: async () => {
    const { token, user } = get();
    loggingOut = true;
    try {
      const session = useSessionStore.getState();
      if (session.sessionId) await session.leave().catch(() => undefined);
      if (token) await api.auth.release(token).catch(() => undefined);
      clearClaims(token);
      if (user) clearLastSessionId(user.id);
      applyToken(null);
      set({ user: null, token: null, status: 'anonymous', claimingUserId: null });
    } finally {
      loggingOut = false;
    }
    goToLogin();
  },
}));

// Each claimed user keeps their own preferences (volumes…), even with several users in one browser.
useAuthStore.subscribe((state, prev) => {
  if (state.user?.id !== prev.user?.id) setSettingsUser(state.user?.id ?? null);
});

let revoking = false;
/** Recent silent re-claims: a server that keeps forgetting the token must not cause an endless loop. */
let reclaimTimes: number[] = [];
const RECLAIM_WINDOW_MS = 30_000;
const MAX_RECLAIMS_PER_WINDOW = 3;

function isCurrentClaim(userId: string, token: string): boolean {
  const s = useAuthStore.getState();
  return !loggingOut && s.status === 'ready' && s.user?.id === userId && s.token === token;
}

/**
 * Silent re-claim after `auth:revoked` (server restart, claim expired while offline); otherwise back to login.
 * The server keeps treating the current socket as anonymous, so it always reconnects afterwards.
 */
async function handleRevoked(): Promise<void> {
  const { user, token, status } = useAuthStore.getState();
  if (revoking || loggingOut || status !== 'ready' || !user || !token) return;
  revoking = true;
  try {
    const now = Date.now();
    reclaimTimes = reclaimTimes.filter((t) => now - t < RECLAIM_WINDOW_MS);
    let res: { user: UserDTO; token: string } | null = null;
    if (reclaimTimes.length < MAX_RECLAIMS_PER_WINDOW) {
      reclaimTimes.push(now);
      res = await requestClaim({ userId: user.id, token, resumeOnly: true }).catch(() => null);
    }
    if (!isCurrentClaim(user.id, token)) {
      // Logged out (or another user was chosen) meanwhile: give back the claim just taken.
      const latest = useAuthStore.getState();
      const keptHere = !loggingOut && latest.status === 'ready' && latest.token === res?.token;
      if (res && !keptHere) void api.auth.release(res.token).catch(() => undefined);
      return;
    }
    if (res) {
      writeClaim({ userId: res.user.id, token: res.token });
      applyToken(res.token, true);
      useAuthStore.setState({ user: res.user, token: res.token, status: 'ready' });
      return;
    }
    clearClaims(token);
    useSessionStore.getState().reset();
    applyToken(null);
    useAuthStore.setState({ user: null, token: null, status: 'anonymous', claimingUserId: null });
    toast.warning('Tu usuario fue liberado. Vuelve a elegir tu aventurero.');
    goToLogin();
  } finally {
    revoking = false;
  }
}

function bindSocket(): void {
  if (socketBound) return;
  socketBound = true;
  const socket = getSocket();
  socket.on('auth:revoked', () => {
    void handleRevoked();
  });
}

/** Whole auth state + actions. */
export function useAuth(): AuthState {
  return useAuthStore();
}

/** Current claimed user (null when anonymous). */
export function useCurrentUser(): UserDTO | null {
  return useAuthStore((s) => s.user);
}

/** Token for non-React code. */
export function getAuthToken(): string | null {
  return useAuthStore.getState().token;
}
