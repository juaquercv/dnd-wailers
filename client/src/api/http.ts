import type {
  Campaign,
  CampaignSummary,
  CategoryDTO,
  CategoryInput,
  ClaimRequest,
  ClaimResponse,
  CreateCampaignRequest,
  CreateSessionRequest,
  CreateZoneRequest,
  EntryKind,
  LibraryEntry,
  LibraryEntryInput,
  LibraryPage,
  LibraryQuery,
  LogEntry,
  LogType,
  Roller,
  RollerInput,
  RollerSearchQuery,
  SavedFilterDTO,
  SaveZoneAsTemplateRequest,
  SessionSummary,
  TagCount,
  UpdateCampaignRequest,
  UploadResponse,
  UserDTO,
  UserStatusDTO,
  Zone,
  ZoneInput,
} from '@wailers/shared';

let authToken: string | null = null;

/** Called by the auth store. */
export function setHttpToken(token: string | null): void {
  authToken = token;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (authToken) headers['x-user-token'] = authToken;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiRequestError('No se pudo conectar con el servidor', 0);
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const obj = data && typeof data === 'object' ? (data as { error?: unknown; details?: unknown }) : null;
    const msg = obj && typeof obj.error === 'string' && obj.error ? obj.error : `Error ${res.status}`;
    throw new ApiRequestError(msg, res.status, obj?.details);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

type Ok = { ok: true };

export const api = {
  health: () => request<{ ok: true }>('GET', '/health'),

  users: {
    list: () => request<UserStatusDTO[]>('GET', '/users'),
  },

  auth: {
    claim: (body: ClaimRequest) => request<ClaimResponse>('POST', '/auth/claim', body),
    release: () => request<Ok>('POST', '/auth/release'),
    me: () => request<UserDTO>('GET', '/auth/me'),
  },

  uploads: {
    upload: (file: File) => {
      const fd = new FormData();
      fd.append('file', file, file.name);
      return request<UploadResponse>('POST', '/uploads', fd);
    },
  },

  library: {
    search: (query: LibraryQuery) => request<LibraryPage>('POST', '/library/search', query),
    get: <K extends EntryKind = EntryKind>(id: string) => request<LibraryEntry<K>>('GET', `/library/${id}`),
    create: <K extends EntryKind>(input: LibraryEntryInput<K>) => request<LibraryEntry<K>>('POST', '/library', input),
    update: <K extends EntryKind>(id: string, input: LibraryEntryInput<K>) => request<LibraryEntry<K>>('PUT', `/library/${id}`, input),
    remove: (id: string) => request<Ok>('DELETE', `/library/${id}`),
    duplicate: (id: string) => request<LibraryEntry>('POST', `/library/${id}/duplicate`),
    setFavorite: (id: string, favorite: boolean) => request<Ok>('PUT', `/library/${id}/favorite`, { favorite }),
    markUsed: (id: string, campaignId?: string) => request<Ok>('POST', `/library/${id}/used`, { campaignId }),
    tags: (kind?: EntryKind, q?: string) => request<TagCount[]>('GET', `/library/tags${qs({ kind, q })}`),
  },

  heroes: {
    list: (ownerId?: string) => request<LibraryEntry<'hero'>[]>('GET', `/heroes${qs({ ownerId })}`),
  },

  categories: {
    list: (kind?: EntryKind) => request<CategoryDTO[]>('GET', `/categories${qs({ kind })}`),
    create: (input: CategoryInput) => request<CategoryDTO>('POST', '/categories', input),
    update: (id: string, patch: Partial<CategoryInput>) => request<CategoryDTO>('PUT', `/categories/${id}`, patch),
    remove: (id: string) => request<Ok>('DELETE', `/categories/${id}`),
  },

  savedFilters: {
    list: () => request<SavedFilterDTO[]>('GET', '/saved-filters'),
    create: (body: { name: string; kind: EntryKind | null; query: LibraryQuery }) =>
      request<SavedFilterDTO>('POST', '/saved-filters', body),
    remove: (id: string) => request<Ok>('DELETE', `/saved-filters/${id}`),
  },

  campaigns: {
    list: () => request<CampaignSummary[]>('GET', '/campaigns'),
    create: (body: CreateCampaignRequest) => request<Campaign>('POST', '/campaigns', body),
    get: (id: string) => request<Campaign>('GET', `/campaigns/${id}`),
    update: (id: string, body: UpdateCampaignRequest) => request<Campaign>('PUT', `/campaigns/${id}`, body),
    remove: (id: string) => request<Ok>('DELETE', `/campaigns/${id}`),
    duplicate: (id: string) => request<Campaign>('POST', `/campaigns/${id}/duplicate`),
    zones: (id: string) => request<Zone[]>('GET', `/campaigns/${id}/zones`),
    createZone: (id: string, body: CreateZoneRequest) => request<Zone>('POST', `/campaigns/${id}/zones`, body),
    reorderZones: (id: string, zoneIds: string[]) => request<Ok>('PUT', `/campaigns/${id}/zones/order`, { zoneIds }),
    sessions: (id: string) => request<SessionSummary[]>('GET', `/campaigns/${id}/sessions`),
    rollers: (id: string) => request<Roller[]>('GET', `/campaigns/${id}/rollers`),
    createRoller: (id: string, body: RollerInput) => request<Roller>('POST', `/campaigns/${id}/rollers`, body),
    importRoller: (id: string, rollerId: string) => request<Roller>('POST', `/campaigns/${id}/rollers/import`, { rollerId }),
  },

  zones: {
    update: (id: string, body: ZoneInput) => request<Zone>('PUT', `/zones/${id}`, body),
    remove: (id: string) => request<Ok>('DELETE', `/zones/${id}`),
    duplicate: (id: string) => request<Zone>('POST', `/zones/${id}/duplicate`),
    saveAsTemplate: (id: string, body: SaveZoneAsTemplateRequest) =>
      request<LibraryEntry<'zone'>>('POST', `/zones/${id}/template`, body),
  },

  rollers: {
    search: (query: RollerSearchQuery) => request<Roller[]>('GET', `/rollers${qs({ ...query })}`),
    update: (id: string, body: RollerInput) => request<Roller>('PUT', `/rollers/${id}`, body),
    remove: (id: string) => request<Ok>('DELETE', `/rollers/${id}`),
  },

  sessions: {
    listActive: () => request<SessionSummary[]>('GET', '/sessions'),
    create: (body: CreateSessionRequest) => request<SessionSummary>('POST', '/sessions', body),
    resume: (id: string) => request<SessionSummary>('POST', `/sessions/${id}/resume`),
    remove: (id: string) => request<Ok>('DELETE', `/sessions/${id}`),
    log: (id: string, params: { type?: LogType; limit?: number } = {}) =>
      request<LogEntry[]>('GET', `/sessions/${id}/log${qs(params)}`),
  },
};

export type Api = typeof api;
