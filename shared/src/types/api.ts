import type { EntryKind } from '../constants';
import type { Campaign, CampaignSummary, OverviewMap, RuleSystem, SpawnPoint, Zone, ZoneContent, ZoneInput } from './campaign';
import type {
  CategoryDTO,
  LibraryEntry,
  LibraryEntryInput,
  LibraryPage,
  LibraryQuery,
  SavedFilterDTO,
  TagCount,
} from './library';
import type { Roller, RollerInput } from './rollers';
import type { LogEntry, SessionSummary, VisibilitySettings } from './session';

/**
 * REST contract. All routes are prefixed with /api. Authenticated routes require the
 * header `x-user-token: <token>` obtained from POST /api/auth/claim.
 * Errors: HTTP 4xx/5xx with body ApiError (message in Spanish).
 */
export interface ApiError {
  error: string;
  details?: unknown;
}

export interface UserDTO {
  id: string;
  name: string;
  color: string;
}

export interface UserStatusDTO extends UserDTO {
  status: 'available' | 'in_use';
}

export interface ClaimRequest {
  userId: string;
  /** Previously issued token (reload / reconnection). */
  token?: string;
  /** Only succeed when the user has no live connection (used to auto-restore from localStorage in a new tab). */
  resumeOnly?: boolean;
}

export interface ClaimResponse {
  user: UserDTO;
  token: string;
}

export interface CreateCampaignRequest {
  name: string;
  description?: string;
  /** Preset for the rule system. */
  magicMode?: RuleSystem['magic']['mode'];
}

export interface UpdateCampaignRequest {
  name?: string;
  description?: string;
  coverUrl?: string | null;
  tags?: string[];
  rules?: RuleSystem;
  overview?: OverviewMap;
  spawn?: SpawnPoint | null;
  defaultVisibility?: VisibilitySettings;
}

export interface CreateZoneRequest extends ZoneInput {
  name: string;
  /** Create from a library zone template. */
  templateEntryId?: string;
}

export interface SaveZoneAsTemplateRequest {
  name: string;
  description?: string;
  tags?: string[];
  categoryIds?: string[];
}

export interface CreateSessionRequest {
  campaignId: string;
  name?: string;
}

export interface UploadResponse {
  url: string;
  mime: string;
  size: number;
  originalName: string;
}

export interface RollerSearchQuery {
  q?: string;
  tag?: string;
  campaignId?: string;
  kind?: Roller['kind'];
}

/**
 * Endpoint table (method path -> request -> response). Implemented by server/src/http/routes/*,
 * consumed by client/src/api/http.ts.
 *
 *  GET    /api/health                                -> { ok: true }
 *  GET    /api/users                                 -> UserStatusDTO[]                        (public)
 *  POST   /api/auth/claim          ClaimRequest      -> ClaimResponse   409 if in use           (public)
 *  POST   /api/auth/release                          -> { ok: true }
 *  GET    /api/auth/me                               -> UserDTO
 *
 *  POST   /api/uploads             multipart "file"  -> UploadResponse   (images/audio, stored in UPLOADS_DIR, served at /uploads/...)
 *
 *  POST   /api/library/search      LibraryQuery      -> LibraryPage
 *  GET    /api/library/:id                           -> LibraryEntry
 *  POST   /api/library             LibraryEntryInput -> LibraryEntry
 *  PUT    /api/library/:id         LibraryEntryInput -> LibraryEntry
 *  DELETE /api/library/:id                           -> { ok: true }
 *  POST   /api/library/:id/duplicate                 -> LibraryEntry
 *  PUT    /api/library/:id/favorite { favorite: boolean } -> { ok: true }
 *  POST   /api/library/:id/used    { campaignId?: string } -> { ok: true }   (marks recent + campaign usage)
 *  GET    /api/library/tags?kind=&q=                 -> TagCount[]
 *  GET    /api/heroes?ownerId=                       -> LibraryEntry<'hero'>[]
 *
 *  GET    /api/categories?kind=                      -> CategoryDTO[]
 *  POST   /api/categories          CategoryInput     -> CategoryDTO
 *  PUT    /api/categories/:id      Partial<CategoryInput> -> CategoryDTO
 *  DELETE /api/categories/:id                        -> { ok: true }   (children cascade)
 *
 *  GET    /api/saved-filters                         -> SavedFilterDTO[]   (current user)
 *  POST   /api/saved-filters       { name, kind, query } -> SavedFilterDTO
 *  DELETE /api/saved-filters/:id                     -> { ok: true }
 *
 *  GET    /api/campaigns                             -> CampaignSummary[]   (all; client groups "mine" first)
 *  POST   /api/campaigns           CreateCampaignRequest -> Campaign
 *  GET    /api/campaigns/:id                         -> Campaign
 *  PUT    /api/campaigns/:id       UpdateCampaignRequest -> Campaign
 *  DELETE /api/campaigns/:id                         -> { ok: true }
 *  POST   /api/campaigns/:id/duplicate               -> Campaign
 *  GET    /api/campaigns/:id/zones                   -> Zone[]   (full, ordered)
 *  POST   /api/campaigns/:id/zones CreateZoneRequest -> Zone
 *  PUT    /api/campaigns/:id/zones/order { zoneIds: string[] } -> { ok: true }
 *  PUT    /api/zones/:id           ZoneInput         -> Zone   (autosave; neighbors are made reciprocal by the server)
 *  DELETE /api/zones/:id                             -> { ok: true }   (also deletes its sub-zones, clears references)
 *  POST   /api/zones/:id/duplicate                   -> Zone
 *  POST   /api/zones/:id/template  SaveZoneAsTemplateRequest -> LibraryEntry<'zone'>
 *  GET    /api/campaigns/:id/sessions                -> SessionSummary[]   (saved/resumable sessions of a campaign)
 *
 *  GET    /api/campaigns/:id/rollers                 -> Roller[]
 *  POST   /api/campaigns/:id/rollers RollerInput     -> Roller
 *  POST   /api/campaigns/:id/rollers/import { rollerId: string } -> Roller   (independent copy)
 *  GET    /api/rollers?q=&tag=&campaignId=&kind=     -> Roller[]   (roulette library across campaigns)
 *  PUT    /api/rollers/:id         RollerInput       -> Roller
 *  DELETE /api/rollers/:id                           -> { ok: true }
 *
 *  GET    /api/sessions                              -> SessionSummary[]   (active: lobby/playing)
 *  POST   /api/sessions            CreateSessionRequest -> SessionSummary
 *  POST   /api/sessions/:id/resume                   -> SessionSummary   (host only; paused/ended -> lobby)
 *  DELETE /api/sessions/:id                          -> { ok: true }   (host only)
 *  GET    /api/sessions/:id/log?type=&limit=         -> LogEntry[]   (filtered by visibility for the caller)
 */
export interface CategoryInput {
  kind: EntryKind;
  name: string;
  parentId?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export type {
  Campaign,
  CampaignSummary,
  CategoryDTO,
  LibraryEntry,
  LibraryEntryInput,
  LibraryPage,
  LibraryQuery,
  LogEntry,
  Roller,
  RollerInput,
  SavedFilterDTO,
  SessionSummary,
  TagCount,
  Zone,
  ZoneContent,
  ZoneInput,
};
