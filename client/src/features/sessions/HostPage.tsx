import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowRight,
  ChevronDown,
  Crown,
  DoorOpen,
  History,
  Layers,
  Map as MapIcon,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ScrollText,
  Trash2,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { normalizeText, type CampaignSummary, type SessionSummary } from '@wailers/shared';
import { api } from '../../api/http';
import { getSocket } from '../../api/socket';
import { AppShell } from '../../components/layout/AppShell';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { Modal } from '../../components/ui/Modal';
import { SearchInput } from '../../components/ui/SearchInput';
import { Spinner } from '../../components/ui/Spinner';
import { TextInput } from '../../components/ui/TextInput';
import { toast } from '../../components/ui/toast';
import { Toggle } from '../../components/ui/Toggle';
import { formatDate, formatRelative, plural } from '../../lib/format';
import { useHotkeys } from '../../lib/hotkeys';
import { useAuthStore } from '../../stores/auth';
import { MAGIC_MODE_INFO, magicModeLabel, SectionTitle, SessionStatusBadge, useUserDirectory, type UserLookup } from '../lobby/lobbyUi';

const SHOW_OTHERS_KEY = 'wailers.host.showOthers';

function readShowOthers(): boolean {
  try {
    return localStorage.getItem(SHOW_OTHERS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeShowOthers(v: boolean): void {
  try {
    localStorage.setItem(SHOW_OTHERS_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Campaign resource names keyed by `id@updatedAt` (summaries only carry the magic mode). */
const manaNameCache = new Map<string, Promise<string | null>>();

/** The campaign's own name for its mana-like resource, loaded lazily for mana campaigns. */
function useManaName(campaign: CampaignSummary): string | null {
  const enabled = campaign.magicMode === 'mana';
  const key = `${campaign.id}@${campaign.updatedAt}`;
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) {
      setName(null);
      return;
    }
    let cancelled = false;
    let pending = manaNameCache.get(key);
    if (!pending) {
      pending = api.campaigns
        .get(campaign.id)
        .then((c) => (c.rules.magic.mode === 'mana' ? c.rules.magic.manaName.trim() || null : null))
        .catch(() => {
          manaNameCache.delete(key);
          return null;
        });
      manaNameCache.set(key, pending);
    }
    void pending.then((value) => {
      if (!cancelled) setName(value);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, campaign.id]);
  return enabled ? name : null;
}

function byUpdated<T extends { updatedAt: string }>(a: T, b: T): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function isActive(s: SessionSummary): boolean {
  return s.status === 'lobby' || s.status === 'playing';
}

/** "Adriel (Thorin), Patrick" */
function playersLine(players: SessionSummary['players']): string {
  return players.map((p) => (p.heroName ? `${p.name} (${p.heroName})` : p.name)).join(', ');
}

function PlayerAvatars({ players, lookup, max = 5 }: { players: SessionSummary['players']; lookup: UserLookup; max?: number }) {
  if (players.length === 0) return <span className="text-xs italic text-parchment-400">Sin jugadores</span>;
  const shown = players.slice(0, max);
  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {shown.map((p) => {
          const look = lookup(p.userId, p.name);
          return (
            <Avatar
              key={p.userId}
              name={p.name}
              color={look.color}
              size="sm"
              status={p.connected ? 'online' : null}
              title={p.heroName ? `${p.name} — ${p.heroName}` : `${p.name} — sin héroe`}
              className="ring-2 ring-ink-900"
            />
          );
        })}
      </div>
      {players.length > max && <span className="ml-2 text-xs text-parchment-400">+{players.length - max}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create session modal
// ---------------------------------------------------------------------------

function CreateSessionModal({
  campaign,
  activeMine,
  onClose,
}: {
  campaign: CampaignSummary;
  /** Active sessions of this campaign hosted by me. */
  activeMine: SessionSummary[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(() => `${campaign.name} · ${formatDate(new Date())}`);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const session = await api.sessions.create({ campaignId: campaign.id, name: trimmed });
      toast.success('¡Sala de espera abierta!', { description: 'Los jugadores ya pueden unirse desde «Unirse a partida».' });
      navigate(`/sesion/${session.id}`);
    } catch (err) {
      toast.fromError(err, 'No se pudo crear la sesión');
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      size="md"
      icon={<Crown />}
      title="Crear sesión"
      subtitle={campaign.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" epic icon={<DoorOpen />} loading={busy} disabled={!trimmed} onClick={() => void submit()}>
            Abrir sala de espera
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => void submit(e)}>
        <TextInput
          label="Nombre de la sesión"
          value={name}
          onValueChange={setName}
          maxLength={80}
          required
          data-autofocus
          onFocus={(e) => e.currentTarget.select()}
          hint="Los jugadores verán este nombre al buscar partidas activas."
          error={trimmed ? undefined : 'Escribe un nombre para la sesión'}
        />
        {campaign.zoneCount === 0 && (
          <div className="flex items-start gap-2.5 rounded-lg border border-gold-600/50 bg-gold-500/10 p-3 text-sm text-parchment-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" aria-hidden />
            <div>
              Esta campaña aún no tiene zonas: el mapa estará vacío.{' '}
              <Link to={`/campanas/${campaign.id}/editor`} className="font-semibold text-gold-300 underline-offset-2 hover:underline">
                Abrir el editor
              </Link>
            </div>
          </div>
        )}
        {activeMine.length > 0 && (
          <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm text-parchment-200">
            <p>Ya tienes {activeMine.length === 1 ? 'una partida activa' : `${activeMine.length} partidas activas`} de esta campaña:</p>
            <ul className="mt-2 space-y-1.5">
              {activeMine.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <SessionStatusBadge status={s.status} size="xs" short />
                  <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                  <Button size="sm" variant="secondary" iconRight={<ArrowRight />} onClick={() => navigate(`/sesion/${s.id}`)} disabled={busy}>
                    Continuar
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Saved sessions of a campaign
// ---------------------------------------------------------------------------

function SavedSessionRow({
  session,
  meUserId,
  lookup,
  busy,
  onContinue,
  onDelete,
}: {
  session: SessionSummary;
  meUserId: string;
  lookup: UserLookup;
  busy: 'continue' | 'delete' | null;
  onContinue: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const isHost = session.hostUserId === meUserId;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-ink-600/80 bg-ink-900/70 p-3 transition hover:border-ink-500 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <SessionStatusBadge status={session.status} size="xs" short className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-parchment-50" title={session.name}>
            {session.name}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-parchment-400">
            <span title={session.updatedAt}>Actualizada {formatRelative(session.updatedAt)}</span>
            {!isHost && (
              <span className="inline-flex items-center gap-1">
                · <Crown className="h-3 w-3 text-gold-500" aria-hidden /> DM: {session.hostName}
              </span>
            )}
            {session.hasStarted && <span>· Iniciada</span>}
          </div>
          {session.players.length > 0 && (
            <div className="mt-1 truncate text-xs text-parchment-300" title={playersLine(session.players)}>
              {playersLine(session.players)}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 md:justify-end">
        <PlayerAvatars players={session.players} lookup={lookup} />
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          {isHost ? (
            <>
              <Button size="sm" variant="primary" icon={<Play />} loading={busy === 'continue'} disabled={busy !== null} onClick={onContinue}>
                Continuar
              </Button>
              <IconButton
                icon={<Trash2 />}
                title="Eliminar partida"
                variant="danger"
                size="sm"
                loading={busy === 'delete'}
                disabled={busy !== null}
                onClick={onDelete}
              />
            </>
          ) : isActive(session) ? (
            <Button size="sm" variant="secondary" iconRight={<ArrowRight />} onClick={() => navigate(`/sesion/${session.id}`)}>
              Unirse
            </Button>
          ) : (
            <span className="text-xs italic text-parchment-400" title="Solo el DM que la creó puede continuarla">
              Solo su DM puede continuarla
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function CampaignRow({
  campaign,
  mine,
  meUserId,
  activeSessions,
  lookup,
  index,
  onCreate,
  onSessionsChanged,
}: {
  campaign: CampaignSummary;
  mine: boolean;
  meUserId: string;
  activeSessions: SessionSummary[];
  lookup: UserLookup;
  index: number;
  onCreate: () => void;
  onSessionsChanged: () => void;
}) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<SessionSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ id: string; kind: 'continue' | 'delete' } | null>(null);
  const [coverOk, setCoverOk] = useState(true);
  const magic = MAGIC_MODE_INFO[campaign.magicMode];
  const manaName = useManaName(campaign);

  const loadSaved = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.campaigns.sessions(campaign.id);
      setSaved([...list].sort(byUpdated));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las partidas guardadas');
    } finally {
      setLoading(false);
    }
  }, [campaign.id]);

  // Keep an open list fresh when sessions change elsewhere (live pushes).
  const activeSig = activeSessions.map((s) => `${s.id}:${s.status}:${s.updatedAt}`).join('|');
  useEffect(() => {
    if (open && saved !== null) void loadSaved();
    // Only reacts to changes of the active sessions of this campaign.
  }, [activeSig]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && saved === null && !loading) void loadSaved();
  };

  const continueSession = async (s: SessionSummary) => {
    setBusy({ id: s.id, kind: 'continue' });
    try {
      if (s.status === 'paused' || s.status === 'ended') await api.sessions.resume(s.id);
      navigate(`/sesion/${s.id}`);
    } catch (err) {
      toast.fromError(err, 'No se pudo continuar la partida');
      setBusy(null);
    }
  };

  const deleteSession = async (s: SessionSummary) => {
    const ok = await confirm({
      title: 'Eliminar partida',
      message: (
        <>
          Se eliminará «<strong className="text-parchment-100">{s.name}</strong>» con su estado guardado y su registro.
          {isActive(s) && ' La partida está activa ahora mismo.'} Los héroes conservan su progreso en la biblioteca. Esta acción no se puede
          deshacer.
        </>
      ),
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    setBusy({ id: s.id, kind: 'delete' });
    try {
      await api.sessions.remove(s.id);
      setSaved((list) => (list ? list.filter((x) => x.id !== s.id) : list));
      toast.success('Partida eliminada');
      onSessionsChanged();
    } catch (err) {
      toast.fromError(err, 'No se pudo eliminar la partida');
    } finally {
      setBusy(null);
    }
  };

  const activeMineCount = activeSessions.filter((s) => s.hostUserId === meUserId).length;

  return (
    <article className="panel animate-slide-up overflow-hidden" style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}>
      <div className="flex flex-col sm:flex-row">
        <div className="relative h-36 shrink-0 overflow-hidden border-b border-ink-600/70 sm:h-auto sm:min-h-[11rem] sm:w-60 sm:border-b-0 sm:border-r">
          {campaign.coverUrl && coverOk ? (
            <img
              src={campaign.coverUrl}
              alt=""
              draggable={false}
              onError={() => setCoverOk(false)}
              className="absolute inset-0 h-full w-full object-cover transition duration-500 hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_30%_20%,rgba(212,166,63,0.25),transparent_60%),radial-gradient(ellipse_at_80%_90%,rgba(138,99,240,0.2),transparent_60%)]">
              <MapIcon className="h-14 w-14 text-gold-500/40" aria-hidden />
            </div>
          )}
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent" />
          {activeSessions.length > 0 && (
            <span className="absolute left-2 top-2">
              <Badge tone="emerald" size="xs" dot className="backdrop-blur">
                {activeSessions.length === 1 ? 'Partida en curso' : `${activeSessions.length} partidas en curso`}
              </Badge>
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
          <div className="flex min-w-0 flex-wrap items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate font-display text-xl font-semibold text-parchment-50" title={campaign.name}>
              {campaign.name}
            </h3>
            {!mine && (
              <Badge tone="outline" size="sm" icon={<Crown />}>
                de {campaign.ownerName}
              </Badge>
            )}
          </div>
          {campaign.description && <p className="line-clamp-2 text-sm leading-relaxed text-parchment-300">{campaign.description}</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={magic.tone} size="sm" icon={magic.icon} title="Sistema de recursos de la campaña">
              {magicModeLabel(campaign.magicMode, manaName)}
            </Badge>
            <Badge size="sm" icon={<Layers />}>
              {plural(campaign.zoneCount, 'zona', 'zonas')}
            </Badge>
            {campaign.tags.slice(0, 3).map((t) => (
              <Badge key={t} tone="outline" size="xs">
                #{t}
              </Badge>
            ))}
            <span className="text-xs text-parchment-400">· editada {formatRelative(campaign.updatedAt)}</span>
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            <Button variant="primary" epic icon={<Plus />} onClick={onCreate}>
              Crear sesión
            </Button>
            <Button
              variant="ghost"
              icon={<History />}
              iconRight={<ChevronDown className={clsx('transition-transform duration-200', open && 'rotate-180')} />}
              onClick={toggle}
              aria-expanded={open}
            >
              Partidas guardadas{saved ? ` (${saved.length})` : ''}
              {!saved && activeMineCount > 0 ? ` · ${activeMineCount} activa${activeMineCount === 1 ? '' : 's'}` : ''}
            </Button>
            {mine && (
              <Link to={`/campanas/${campaign.id}/editor`} className="btn btn-ghost btn-sm ml-auto" title="Abrir en el editor de campañas">
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Editar
              </Link>
            )}
          </div>
        </div>
      </div>

      {open && (
        <div className="animate-fade-in border-t border-ink-600/70 bg-ink-950/40 p-3 sm:p-4">
          {loading && saved === null ? (
            <div className="flex justify-center py-6">
              <Spinner size="md" showLabel label="Cargando partidas guardadas…" />
            </div>
          ) : error && saved === null ? (
            <EmptyState
              compact
              icon={<TriangleAlert />}
              title="No se pudieron cargar las partidas"
              description={error}
              action={
                <Button size="sm" icon={<RefreshCw />} onClick={() => void loadSaved()}>
                  Reintentar
                </Button>
              }
            />
          ) : saved && saved.length === 0 ? (
            <EmptyState
              compact
              icon={<ScrollText />}
              title="Sin partidas guardadas"
              description="Crea una sesión para empezar la aventura; se guardará automáticamente."
            />
          ) : (
            <ul className={clsx('space-y-2', loading && 'opacity-70')}>
              {(saved ?? []).map((s) => (
                <SavedSessionRow
                  key={s.id}
                  session={s}
                  meUserId={meUserId}
                  lookup={lookup}
                  busy={busy?.id === s.id ? busy.kind : null}
                  onContinue={() => void continueSession(s)}
                  onDelete={() => void deleteSession(s)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** Route /hostear — choose a campaign, create a session or continue a saved one. */
export default function HostPage() {
  const user = useAuthStore((s) => s.user);
  const meUserId = user?.id ?? '';
  const navigate = useNavigate();
  const lookup = useUserDirectory();

  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [active, setActive] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(readShowOthers);
  const [query, setQuery] = useState('');
  const [createFor, setCreateFor] = useState<CampaignSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, act] = await Promise.all([api.campaigns.list(), api.sessions.listActive().catch(() => [] as SessionSummary[])]);
      setCampaigns(list);
      setActive(act);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las campañas');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshActive = useCallback(() => {
    api.sessions
      .listActive()
      .then(setActive)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
    const socket = getSocket();
    const onList = (list: SessionSummary[]) => setActive(list);
    socket.on('sessions:list', onList);
    return () => {
      socket.off('sessions:list', onList);
    };
  }, [load]);

  useHotkeys({ r: () => void load() });

  const setOthers = (v: boolean) => {
    setShowOthers(v);
    writeShowOthers(v);
  };

  const { mine, others } = useMemo(() => {
    const q = normalizeText(query);
    const match = (c: CampaignSummary) =>
      !q || normalizeText(`${c.name} ${c.description} ${c.ownerName} ${c.tags.join(' ')}`).includes(q);
    const all = campaigns ?? [];
    return {
      mine: all.filter((c) => c.ownerId === meUserId && match(c)).sort(byUpdated),
      others: all.filter((c) => c.ownerId !== meUserId && match(c)).sort(byUpdated),
    };
  }, [campaigns, query, meUserId]);

  const activeByCampaign = useMemo(() => {
    const map = new Map<string, SessionSummary[]>();
    for (const s of active) {
      const list = map.get(s.campaignId) ?? [];
      list.push(s);
      map.set(s.campaignId, list);
    }
    return map;
  }, [active]);

  const myActive = useMemo(() => active.filter((s) => s.hostUserId === meUserId).sort(byUpdated), [active, meUserId]);
  const totalMine = (campaigns ?? []).filter((c) => c.ownerId === meUserId).length;
  const totalOthers = (campaigns ?? []).length - totalMine;

  const renderRows = (list: CampaignSummary[], areMine: boolean) => (
    <div className="flex flex-col gap-4">
      {list.map((c, i) => (
        <CampaignRow
          key={c.id}
          index={i}
          campaign={c}
          mine={areMine}
          meUserId={meUserId}
          activeSessions={activeByCampaign.get(c.id) ?? []}
          lookup={lookup}
          onCreate={() => setCreateFor(c)}
          onSessionsChanged={refreshActive}
        />
      ))}
    </div>
  );

  return (
    <AppShell
      title="Hostear partida"
      subtitle="Dirige la mesa como DM"
      back="/menu"
      actions={
        <>
          <IconButton icon={<RefreshCw />} title="Actualizar (R)" size="sm" loading={loading} onClick={() => void load()} />
          <Link to="/campanas" className="btn btn-secondary btn-sm hidden sm:inline-flex">
            <MapIcon className="h-3.5 w-3.5" aria-hidden />
            Mis campañas
          </Link>
        </>
      }
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="min-w-0 flex-1">
            <h2 className="title-epic text-3xl">Elige la aventura</h2>
            <p className="mt-1 text-sm text-parchment-300">Crea una sala de espera para una campaña o continúa una partida guardada.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar campaña…" size="sm" className="sm:w-56" aria-label="Buscar campaña" />
            <Toggle size="sm" checked={showOthers} onChange={setOthers} label="Mostrar campañas de otros jugadores" />
          </div>
        </div>

        {myActive.length > 0 && (
          <section className="flex flex-col gap-3" aria-label="Tus partidas en curso">
            <SectionTitle icon={<Play />}>Tus partidas en curso</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              {myActive.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => navigate(`/sesion/${s.id}`)}
                  className="card-hover group flex items-center gap-3 rounded-xl border border-gold-700/50 bg-gradient-to-r from-gold-700/20 to-ink-900/90 p-3 text-left"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gold-500/50 bg-ink-950/60 text-gold-300">
                    <Crown className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-semibold text-parchment-50">{s.name}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-parchment-300">
                      <SessionStatusBadge status={s.status} size="xs" short />
                      <span className="truncate">{s.campaignName}</span>
                      <span className="inline-flex shrink-0 items-center gap-1">
                        <Users className="h-3 w-3" aria-hidden />
                        {s.players.length}
                      </span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-gold-400 transition-transform group-hover:translate-x-1" aria-hidden />
                </button>
              ))}
            </div>
          </section>
        )}

        {error && !campaigns ? (
          <div className="panel">
            <EmptyState
              icon={<TriangleAlert />}
              title="No se pudieron cargar las campañas"
              description={error}
              action={
                <Button variant="primary" icon={<RefreshCw />} onClick={() => void load()}>
                  Reintentar
                </Button>
              }
            />
          </div>
        ) : campaigns === null ? (
          <div className="flex flex-col gap-4" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-44 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <section className="flex flex-col gap-3" aria-label="Tus campañas">
              <SectionTitle icon={<MapIcon />} aside={<span className="text-xs text-parchment-400">{plural(mine.length, 'campaña', 'campañas')}</span>}>
                Tus campañas
              </SectionTitle>
              {mine.length > 0 ? (
                renderRows(mine, true)
              ) : (
                <div className="panel">
                  <EmptyState
                    icon={<MapIcon />}
                    title={query ? 'Ninguna campaña coincide' : 'Aún no tienes campañas'}
                    description={
                      query
                        ? 'Prueba con otro término de búsqueda.'
                        : 'Crea una campaña para poder hostear partidas, o muestra las campañas de otros jugadores.'
                    }
                    action={
                      !query && (
                        <>
                          <Link to="/campanas" className="btn btn-primary">
                            <Plus className="h-4 w-4" aria-hidden />
                            Crear campaña
                          </Link>
                          {!showOthers && totalOthers > 0 && (
                            <Button variant="secondary" onClick={() => setOthers(true)}>
                              Mostrar campañas de otros jugadores
                            </Button>
                          )}
                        </>
                      )
                    }
                  />
                </div>
              )}
            </section>

            {showOthers && (
              <section className="flex flex-col gap-3" aria-label="Campañas de otros jugadores">
                <SectionTitle icon={<Users />} aside={<span className="text-xs text-parchment-400">{plural(others.length, 'campaña', 'campañas')}</span>}>
                  Campañas de otros jugadores
                </SectionTitle>
                {others.length > 0 ? (
                  renderRows(others, false)
                ) : (
                  <p className="rounded-lg border border-dashed border-ink-500 px-4 py-6 text-center text-sm text-parchment-400">
                    {query ? 'Ninguna campaña de otros jugadores coincide con la búsqueda.' : 'Nadie más ha creado campañas todavía.'}
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {createFor && (
        <CreateSessionModal
          key={createFor.id}
          campaign={createFor}
          activeMine={(activeByCampaign.get(createFor.id) ?? []).filter((s) => s.hostUserId === meUserId)}
          onClose={() => setCreateFor(null)}
        />
      )}
    </AppShell>
  );
}
