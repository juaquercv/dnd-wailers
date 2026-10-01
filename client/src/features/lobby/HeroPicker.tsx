import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Check, Plus, RefreshCw, ShieldQuestion, Swords, UserRound } from 'lucide-react';
import type { LibraryEntry } from '@wailers/shared';
import { api } from '../../api/http';
import { emitAck } from '../../api/socket';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { toast } from '../../components/ui/toast';
import { useCategories } from '../../stores/categories';
import { useSessionStore } from '../../stores/session';
import { uiSounds } from '../audio/uiSounds';
import { HeroCreatorModal } from '../heroes/HeroCreatorModal';
import { HeroCard, heroRuleWarnings } from './HeroCard';
import { useSessionPlayers } from './lobbyUi';

type HeroEntry = LibraryEntry<'hero'>;

function byRecent(a: HeroEntry, b: HeroEntry): number {
  return b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name, 'es');
}

/** Current player's panel: choose one of my heroes (or create one) and toggle "¡Listo!". */
export function HeroPicker() {
  const meUserId = useSessionStore((s) => s.view?.meUserId ?? '');
  const campaignId = useSessionStore((s) => s.view?.state.campaignId ?? '');
  const campaign = useSessionStore((s) => s.campaign);
  const rules = campaign?.rules ?? null;
  const players = useSessionPlayers();
  const me = players.find((p) => p.userId === meUserId) ?? null;
  const liveHero = useSessionStore((s) => (me?.heroId ? s.view?.state.heroes[me.heroId] ?? null : null));
  const { byId } = useCategories('hero');

  const [heroes, setHeroes] = useState<HeroEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Hero id being selected (null = clearing); undefined when idle. */
  const [pending, setPending] = useState<string | null | undefined>(undefined);
  const [readyBusy, setReadyBusy] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);

  const load = useCallback(async () => {
    if (!meUserId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api.heroes.list(meUserId);
      setHeroes([...list].sort(byRecent));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar tus héroes');
    } finally {
      setLoading(false);
    }
  }, [meUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const select = async (heroId: string | null) => {
    if (!me || pending !== undefined) return;
    if (me.ready) {
      toast.info('Cancela «¡Listo!» para cambiar de héroe');
      return;
    }
    if (me.heroId === heroId) return;
    setPending(heroId);
    try {
      await emitAck('lobby:selectHero', { heroId });
      if (heroId) uiSounds.reveal();
    } catch (err) {
      toast.fromError(err, 'No se pudo elegir el héroe');
    } finally {
      setPending(undefined);
    }
  };

  const toggleReady = async () => {
    if (!me || readyBusy) return;
    if (!me.heroId && !me.ready) {
      toast.warning('Elige un héroe antes de marcarte como listo');
      return;
    }
    setReadyBusy(true);
    try {
      await emitAck('lobby:setReady', { ready: !me.ready });
      if (!me.ready) uiSounds.notify();
    } catch (err) {
      toast.fromError(err, 'No se pudo cambiar tu estado');
    } finally {
      setReadyBusy(false);
    }
  };

  const onCreated = (hero: HeroEntry) => {
    setCreatorOpen(false);
    setHeroes((list) => [hero, ...(list ?? []).filter((h) => h.id !== hero.id)]);
    toast.success(`¡${hero.name} se une a la aventura!`);
    void select(hero.id);
  };

  const allowNew = rules?.heroCreation.allowNew ?? false;
  const selectedId = me?.heroId ?? null;
  const ready = !!me?.ready && !!selectedId;

  // A hero chosen elsewhere (e.g. before a reload) that is not in my library list anymore still shows up.
  const list = useMemo(() => {
    const base = heroes ?? [];
    if (!liveHero || base.some((h) => h.id === liveHero.id)) return base;
    const asEntry: HeroEntry = {
      id: liveHero.id,
      kind: 'hero',
      name: liveHero.name,
      description: '',
      imageUrl: liveHero.imageUrl,
      tags: [],
      categoryIds: liveHero.categoryIds,
      ownerId: liveHero.ownerId,
      ownerName: null,
      originCampaignId: null,
      originCampaignName: null,
      usedInCampaigns: [],
      level: liveHero.level,
      cr: null,
      hp: liveHero.data.hp.max,
      value: null,
      weight: null,
      rarity: null,
      size: null,
      isFavorite: false,
      lastUsedAt: null,
      createdAt: '',
      updatedAt: '',
      data: liveHero.data,
    };
    return [asEntry, ...base];
  }, [heroes, liveHero]);

  const selectedName = liveHero?.name ?? list.find((h) => h.id === selectedId)?.name ?? null;

  if (!me) {
    return (
      <section className="panel">
        <EmptyState compact icon={<UserRound />} title="Entrando en la sala…" description="Esperando a que el servidor confirme tu plaza." />
      </section>
    );
  }

  return (
    <section className="panel flex flex-col overflow-hidden" aria-label="Elige tu héroe">
      <div className="panel-header">
        <span className="flex items-center gap-2">
          <Swords className="h-4 w-4" aria-hidden />
          Elige tu héroe
        </span>
        <IconButton icon={<RefreshCw />} title="Recargar mis héroes" size="sm" loading={loading} onClick={() => void load()} />
      </div>

      <div className="p-4">
        <p className="mb-3 text-xs leading-relaxed text-parchment-300">
          Tu héroe conserva su progreso entre campañas; sus recursos se adaptan a las reglas de esta partida al empezar.
          {ready && <span className="ml-1 text-gold-300">Cancela «¡Listo!» si quieres cambiarlo.</span>}
        </p>

        {error && !heroes ? (
          <EmptyState
            compact
            icon={<ShieldQuestion />}
            title="No se pudieron cargar tus héroes"
            description={error}
            action={
              <Button size="sm" icon={<RefreshCw />} onClick={() => void load()}>
                Reintentar
              </Button>
            }
          />
        ) : heroes === null ? (
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-[5.5rem] rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            compact
            icon={<UserRound />}
            title="Aún no tienes héroes"
            description={
              allowNew
                ? 'Crea tu primer héroe para esta aventura.'
                : 'Esta campaña no permite crear héroes nuevos. Pide al DM que te ayude o crea uno en la Biblioteca.'
            }
            action={
              allowNew ? (
                <Button variant="primary" icon={<Plus />} onClick={() => setCreatorOpen(true)}>
                  Crear héroe nuevo
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" role="listbox" aria-label="Tus héroes">
            {list.map((hero) => {
              const selected = hero.id === selectedId;
              return (
                <HeroCard
                  key={hero.id}
                  hero={hero}
                  color={me.color}
                  selected={selected}
                  busy={pending === hero.id}
                  disabled={ready && !selected}
                  warnings={heroRuleWarnings(hero, rules, byId)}
                  onClick={selected ? undefined : () => void select(hero.id)}
                />
              );
            })}
            {allowNew && (
              <button
                type="button"
                onClick={() => setCreatorOpen(true)}
                disabled={ready}
                className="group flex min-h-[5.5rem] items-center justify-center gap-3 rounded-xl border border-dashed border-gold-700/60 bg-gold-500/[0.04] p-3 text-sm font-semibold text-gold-300 transition hover:border-gold-500 hover:bg-gold-500/10 hover:text-gold-200 disabled:pointer-events-none disabled:opacity-40"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold-600/60 bg-ink-900 transition group-hover:scale-110 group-hover:shadow-glow-gold">
                  <Plus className="h-5 w-5" />
                </span>
                Crear héroe nuevo
              </button>
            )}
          </div>
        )}
      </div>

      <div
        className={clsx(
          'sticky bottom-0 mt-auto flex flex-col gap-3 border-t px-4 py-3 backdrop-blur sm:flex-row sm:items-center',
          ready ? 'border-emerald-500/40 bg-emerald-950/40' : 'border-ink-600/70 bg-ink-950/70',
        )}
      >
        <div className="min-w-0 flex-1 text-sm">
          {selectedId ? (
            <span className="text-parchment-200">
              Jugarás con <strong className="font-display text-gold-200">{selectedName ?? 'tu héroe'}</strong>
              {selectedId && !ready && (
                <button
                  type="button"
                  className="ml-2 text-xs text-parchment-400 underline-offset-2 hover:text-parchment-100 hover:underline disabled:opacity-50"
                  disabled={pending !== undefined}
                  onClick={() => void select(null)}
                >
                  Quitar
                </button>
              )}
            </span>
          ) : (
            <span className="text-parchment-400">Elige un héroe para poder marcarte como listo.</span>
          )}
        </div>
        {ready ? (
          <Button
            size="lg"
            epic
            icon={<Check />}
            loading={readyBusy}
            onClick={() => void toggleReady()}
            title="Pulsa para dejar de estar listo"
            className="border-emerald-400/60 bg-emerald-600/90 text-parchment-50 shadow-[0_0_24px_-6px_rgba(16,185,129,0.8)] hover:bg-emerald-500"
          >
            ✔ ¡Listo!
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            epic
            loading={readyBusy}
            disabled={!selectedId || pending !== undefined}
            onClick={() => void toggleReady()}
            className={clsx(selectedId && 'animate-glow-pulse')}
          >
            ¡Listo!
          </Button>
        )}
      </div>

      <HeroCreatorModal
        open={creatorOpen}
        onClose={() => setCreatorOpen(false)}
        onCreated={onCreated}
        rules={rules}
        ownerId={meUserId}
        campaignId={campaignId || undefined}
      />
    </section>
  );
}
