import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Map as MapIcon, Plus, RefreshCw, SearchX, TriangleAlert, Users } from 'lucide-react';
import { fuzzyScore, type CampaignSummary } from '@wailers/shared';
import { api } from '../../api/http';
import { AppShell } from '../../components/layout/AppShell';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Kbd } from '../../components/ui/Kbd';
import { isAnyModalOpen } from '../../components/ui/Modal';
import { SearchInput } from '../../components/ui/SearchInput';
import { toast } from '../../components/ui/toast';
import { useHotkeys } from '../../lib/hotkeys';
import { plural } from '../../lib/format';
import { useAuthStore } from '../../stores/auth';
import { useUsers } from '../../stores/users';
import { CampaignCard, CampaignCardSkeleton } from './CampaignCard';
import { NewCampaignModal } from './NewCampaignModal';

const MATCH_THRESHOLD = 0.3;

function campaignEditorPath(campaignId: string): string {
  return `/campanas/${campaignId}/editor`;
}

type BusyMap = Record<string, 'duplicate' | 'delete'>;

function byUpdatedDesc(a: CampaignSummary, b: CampaignSummary): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

/** Route /campanas: the user's campaigns and everybody else's, with search, create, duplicate and delete. */
export default function CampaignListPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const user = useAuthStore((s) => s.user);
  const { users } = useUsers();

  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [busy, setBusy] = useState<BusyMap>({});
  /** campaignId -> rules.magic.manaName (mana campaigns only; the summary does not carry it). */
  const [manaNames, setManaNames] = useState<Record<string, string>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const list = await api.campaigns.list();
      if (seq !== loadSeq.current) return;
      setCampaigns(list);
      setLoading(false);
      // Resource names (e.g. a renamed mana pool) live in the full campaign rules.
      const manaCampaigns = list.filter((c) => c.magicMode === 'mana');
      const results = await Promise.allSettled(manaCampaigns.map((c) => api.campaigns.get(c.id)));
      if (seq !== loadSeq.current) return;
      const names: Record<string, string> = {};
      results.forEach((res) => {
        if (res.status === 'fulfilled') names[res.value.id] = res.value.rules.magic.manaName;
      });
      setManaNames(names);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las campañas');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useHotkeys(
    {
      n: () => {
        if (!isAnyModalOpen()) setNewOpen(true);
      },
      '/': () => {
        if (!isAnyModalOpen()) searchRef.current?.focus();
      },
    },
    { enabled: !newOpen },
  );

  const userColor = useCallback((userId: string) => users.find((u) => u.id === userId)?.color ?? null, [users]);

  const { mine, others, total } = useMemo(() => {
    const list = campaigns ?? [];
    const q = query.trim();
    const scored = q
      ? list
          .map((c) => ({ c, score: fuzzyScore(q, c.name) }))
          .filter((x) => x.score >= MATCH_THRESHOLD)
          .sort((a, b) => b.score - a.score || byUpdatedDesc(a.c, b.c))
          .map((x) => x.c)
      : [...list].sort(byUpdatedDesc);
    return {
      mine: scored.filter((c) => c.ownerId === user?.id),
      others: scored.filter((c) => c.ownerId !== user?.id),
      total: list.length,
    };
  }, [campaigns, query, user?.id]);

  const setBusyFor = (id: string, value: 'duplicate' | 'delete' | null) =>
    setBusy((prev) => {
      const next = { ...prev };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });

  const duplicate = async (campaign: CampaignSummary) => {
    setBusyFor(campaign.id, 'duplicate');
    try {
      const copy = await api.campaigns.duplicate(campaign.id);
      toast.success('Campaña duplicada', {
        description: copy.name,
        action: { label: 'Abrir', onClick: () => navigate(campaignEditorPath(copy.id)) },
      });
      await load();
    } catch (err) {
      toast.fromError(err, 'No se pudo duplicar la campaña');
    } finally {
      setBusyFor(campaign.id, null);
    }
  };

  const remove = async (campaign: CampaignSummary) => {
    const ok = await confirm({
      title: 'Eliminar campaña',
      message: (
        <>
          Se eliminará <strong className="text-parchment-100">«{campaign.name}»</strong> con todas sus zonas, ruletas y
          partidas guardadas. Los elementos de la biblioteca compartida se conservan.
          <span className="mt-2 block font-medium text-blood-300">Esta acción no se puede deshacer.</span>
        </>
      ),
      confirmLabel: 'Eliminar para siempre',
      danger: true,
    });
    if (!ok) return;
    setBusyFor(campaign.id, 'delete');
    try {
      await api.campaigns.remove(campaign.id);
      setCampaigns((prev) => (prev ? prev.filter((c) => c.id !== campaign.id) : prev));
      toast.success(`«${campaign.name}» eliminada`);
    } catch (err) {
      toast.fromError(err, 'No se pudo eliminar la campaña');
    } finally {
      setBusyFor(campaign.id, null);
    }
  };

  const renderGrid = (list: CampaignSummary[]) => (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {list.map((c, i) => (
        <CampaignCard
          key={c.id}
          campaign={c}
          manaName={manaNames[c.id] ?? null}
          isOwner={c.ownerId === user?.id}
          ownerColor={userColor(c.ownerId)}
          index={i}
          busy={busy[c.id] ?? null}
          editorPath={campaignEditorPath(c.id)}
          onDuplicate={() => void duplicate(c)}
          onDelete={() => void remove(c)}
        />
      ))}
    </div>
  );

  const searching = query.trim() !== '';
  const noResults = searching && mine.length === 0 && others.length === 0;

  let content: ReactNode;
  if (loading && !campaigns) {
    content = (
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {[0, 1, 2].map((i) => (
          <CampaignCardSkeleton key={i} />
        ))}
      </div>
    );
  } else if (error && !campaigns) {
    content = (
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
    );
  } else if (noResults) {
    content = (
      <div className="panel">
        <EmptyState
          icon={<SearchX />}
          title={`Ninguna campaña coincide con «${query.trim()}»`}
          description="Prueba con otra palabra: la búsqueda ignora mayúsculas y tildes."
          action={
            <Button variant="secondary" onClick={() => setQuery('')}>
              Limpiar búsqueda
            </Button>
          }
        />
      </div>
    );
  } else {
    content = (
      <div className="space-y-10">
        <Section icon={<Crown />} title="Mis campañas" count={mine.length}>
          {mine.length > 0 ? (
            renderGrid(mine)
          ) : searching ? (
            <p className="text-sm text-parchment-400">Ninguna de tus campañas coincide con la búsqueda.</p>
          ) : (
            <div className="panel">
              <EmptyState
                icon={<MapIcon />}
                title="Aún no has creado ninguna campaña"
                description="Diseña tu mundo zona a zona como si fueran diapositivas, define sus reglas y llévalo a la mesa."
                action={
                  <Button variant="primary" epic icon={<Plus />} onClick={() => setNewOpen(true)}>
                    Crear mi primera campaña
                  </Button>
                }
              />
            </div>
          )}
        </Section>
        <Section icon={<Users />} title="Campañas de otros" count={others.length}>
          {others.length > 0 ? (
            renderGrid(others)
          ) : (
            <p className="rounded-xl border border-dashed border-ink-600 px-4 py-6 text-center text-sm text-parchment-400">
              {searching ? 'Ninguna campaña de otros jugadores coincide con la búsqueda.' : 'Nadie más ha creado campañas todavía.'}
            </p>
          )}
        </Section>
      </div>
    );
  }

  return (
    <AppShell
      title="Campañas"
      subtitle="Crea y edita tus campañas"
      back="/menu"
      actions={
        <Button variant="primary" icon={<Plus />} onClick={() => setNewOpen(true)} title="Nueva campaña (N)">
          <span className="hidden sm:inline">Nueva campaña</span>
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="title-epic text-2xl sm:text-3xl">Tus mundos</h2>
            <p className="mt-1 text-sm text-parchment-300">
              {campaigns
                ? `${plural(total, 'campaña', 'campañas')} en la mesa. Abre una para editar sus zonas, reglas y ruletas.`
                : 'Cargando las campañas de la mesa…'}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:w-80">
            <SearchInput
              ref={searchRef}
              value={query}
              onChange={setQuery}
              placeholder="Buscar campaña por nombre…"
              aria-label="Buscar campaña por nombre"
              className="flex-1"
              hint={<Kbd>/</Kbd>}
            />
          </div>
        </div>
        {content}
      </div>
      <NewCampaignModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(campaign) => {
          setNewOpen(false);
          navigate(campaignEditorPath(campaign.id));
        }}
      />
    </AppShell>
  );
}

function Section({ icon, title, count, children }: { icon: ReactNode; title: string; count: number; children: ReactNode }) {
  return (
    <section>
      <header className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold-700/50 bg-gold-500/10 text-gold-300 [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
        <h2 className="font-display text-lg font-semibold tracking-wide text-gold-200">{title}</h2>
        <Badge tone="gold" size="sm">
          {count}
        </Badge>
        <span aria-hidden className="ml-2 h-px flex-1 bg-gradient-to-r from-gold-700/50 to-transparent" />
      </header>
      {children}
    </section>
  );
}
