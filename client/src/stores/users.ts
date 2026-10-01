import { useEffect } from 'react';
import { create } from 'zustand';
import type { UserStatusDTO } from '@wailers/shared';
import { api } from '../api/http';
import { getSocket } from '../api/socket';

interface UsersState {
  users: UserStatusDTO[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  /** Fetch the list (also starts live updates). */
  load: () => Promise<void>;
}

const ORDER = ['adriel', 'juan', 'patrick', 'javier', 'campos'];

function sortUsers(users: UserStatusDTO[]): UserStatusDTO[] {
  return [...users].sort((a, b) => {
    const ia = ORDER.indexOf(a.id);
    const ib = ORDER.indexOf(b.id);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.name.localeCompare(b.name, 'es');
  });
}

let bound = false;
let inflight: Promise<void> | null = null;

export const useUsersStore = create<UsersState>((set) => ({
  users: [],
  loaded: false,
  loading: false,
  error: null,

  load: () => {
    bindLiveUpdates();
    if (inflight) return inflight;
    set({ loading: true, error: null });
    inflight = api.users
      .list()
      .then((users) => set({ users: sortUsers(users), loaded: true, loading: false, error: null }))
      .catch((err: unknown) =>
        set({ loading: false, error: err instanceof Error ? err.message : 'No se pudo cargar la lista de usuarios' }),
      )
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },
}));

function bindLiveUpdates(): void {
  if (bound) return;
  bound = true;
  const socket = getSocket();
  socket.on('users:status', (users) => {
    useUsersStore.setState({ users: sortUsers(users), loaded: true, loading: false, error: null });
  });
  // After a reconnection (server restart) refresh in case the push was missed.
  socket.on('connect', () => {
    if (useUsersStore.getState().loaded || useUsersStore.getState().error) void useUsersStore.getState().load();
  });
}

/** Users with live availability. Loads on first use. */
export function useUsers(): UsersState {
  const state = useUsersStore();
  useEffect(() => {
    const s = useUsersStore.getState();
    if (!s.loaded && !s.loading) void s.load();
  }, []);
  return state;
}

export function useUser(userId: string | null | undefined): UserStatusDTO | null {
  return useUsersStore((s) => (userId ? s.users.find((u) => u.id === userId) ?? null : null));
}

/** Non-React lookup (e.g. color for a user id). */
export function getUser(userId: string): UserStatusDTO | null {
  return useUsersStore.getState().users.find((u) => u.id === userId) ?? null;
}
