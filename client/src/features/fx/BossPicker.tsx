import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Crown, RefreshCw, Skull, Swords, X } from 'lucide-react';
import type { LibraryEntry } from '@wailers/shared';
import { api } from '../../api/http';
import { emitAck } from '../../api/socket';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { SearchInput } from '../../components/ui/SearchInput';
import { Select, type SelectOption } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { TextInput } from '../../components/ui/TextInput';
import { toast } from '../../components/ui/toast';
import { formatCr, formatNumber } from '../../lib/format';
import { PanelSection } from '../audio/PanelSection';
import { useSoundSearch } from '../audio/soundLibrary';

type CreatureEntry = LibraryEntry<'creature'>;

const PAGE_SIZE = 12;

function isCreature(entry: LibraryEntry): entry is CreatureEntry {
  return entry.kind === 'creature';
}

function defaultSubtitle(entry: CreatureEntry): string {
  return entry.cr !== null ? `Desafío ${formatCr(entry.cr)}` : '';
}

interface CreatureSearchState {
  items: CreatureEntry[];
  loading: boolean;
  error: string | null;
}

/** Library creatures matching `q` (strongest first when there is no query). */
function useCreatureSearch(q: string, nonce: number): CreatureSearchState {
  const [state, setState] = useState<CreatureSearchState>({ items: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    const text = q.trim();
    setState((s) => ({ ...s, loading: true, error: null }));
    api.library
      .search({
        kind: 'creature',
        q: text || undefined,
        sort: text ? 'relevance' : 'cr',
        order: 'desc',
        pageSize: PAGE_SIZE,
      })
      .then((page) => {
        if (!cancelled) setState({ items: page.items.filter(isCreature), loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error && err.message ? err.message : 'No se pudieron cargar las criaturas';
        setState((s) => ({ ...s, loading: false, error: message }));
      });
    return () => {
      cancelled = true;
    };
  }, [q, nonce]);

  return state;
}

interface BossDraft {
  entryId: string;
  name: string;
  subtitle: string;
  imageUrl: string | null;
}

/** DM: search a creature in the library and launch the cinematic boss entrance for everyone. */
export function BossSection() {
  const [query, setQuery] = useState('');
  const [nonce, setNonce] = useState(0);
  const { items, loading, error } = useCreatureSearch(query, nonce);
  const [draft, setDraft] = useState<BossDraft | null>(null);
  const [soundId, setSoundId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sounds = useSoundSearch('effect', '');

  const soundOptions = useMemo<SelectOption<string | null>[]>(
    () => [{ value: null, label: 'Sin sonido' }, ...sounds.items.map((s) => ({ value: s.id, label: s.name }))],
    [sounds.items],
  );

  const pick = (entry: CreatureEntry) => {
    setDraft({ entryId: entry.id, name: entry.name, subtitle: defaultSubtitle(entry), imageUrl: entry.imageUrl });
  };

  const launch = async () => {
    if (!draft || sending) return;
    const name = draft.name.trim();
    if (!name) {
      toast.warning('Escribe un nombre para la aparición');
      return;
    }
    const sound = soundId ? sounds.items.find((s) => s.id === soundId) ?? null : null;
    setSending(true);
    try {
      await emitAck('fx:trigger', {
        fx: {
          kind: 'boss',
          name,
          subtitle: draft.subtitle.trim() || null,
          imageUrl: draft.imageUrl,
          soundUrl: sound?.data.url || null,
        },
      });
    } catch (err) {
      toast.fromError(err, 'No se pudo lanzar la aparición');
    } finally {
      setSending(false);
    }
  };

  return (
    <PanelSection
      title="Aparición de jefe"
      icon={<Crown />}
      description="Presentación cinematográfica a pantalla completa para todos los jugadores."
      aside={<IconButton icon={<RefreshCw />} title="Recargar criaturas" size="xs" onClick={() => setNonce((n) => n + 1)} />}
    >
      {draft ? (
        <div className="flex flex-col gap-2.5 rounded-xl border border-gold-700/50 bg-gradient-to-b from-blood-700/20 to-ink-900/80 p-3 shadow-[inset_0_1px_0_rgba(243,234,214,0.05)]">
          <div className="flex items-center gap-3">
            <Avatar name={draft.name || '?'} imageUrl={draft.imageUrl} size="lg" ring color="#c43d33" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-sm font-semibold text-gold-200">{draft.name || 'Sin nombre'}</div>
              <div className="truncate text-xs text-parchment-400">{draft.subtitle || 'Sin subtítulo'}</div>
            </div>
            <IconButton icon={<X />} title="Elegir otra criatura" size="sm" onClick={() => setDraft(null)} />
          </div>
          <TextInput
            size="sm"
            label="Nombre"
            value={draft.name}
            maxLength={120}
            onValueChange={(name) => setDraft((d) => (d ? { ...d, name } : d))}
          />
          <TextInput
            size="sm"
            label="Subtítulo"
            placeholder="Ej.: Desafío 17, Señor de la forja…"
            value={draft.subtitle}
            maxLength={200}
            onValueChange={(subtitle) => setDraft((d) => (d ? { ...d, subtitle } : d))}
          />
          <Select<string | null>
            size="sm"
            label="Sonido (opcional)"
            value={soundId}
            onChange={setSoundId}
            options={soundOptions}
            disabled={sounds.loading && sounds.items.length === 0}
          />
          <Button variant="primary" epic block icon={<Swords />} loading={sending} onClick={() => void launch()}>
            ¡Que aparezca!
          </Button>
        </div>
      ) : (
        <>
          <SearchInput value={query} onChange={setQuery} debounceMs={250} size="sm" placeholder="Buscar criatura…" />
          <div className="scroll-thin max-h-60 overflow-y-auto rounded-lg border border-ink-600/70 bg-ink-950/40 p-1">
            {loading && items.length === 0 ? (
              <div className="flex justify-center py-6">
                <Spinner size="sm" showLabel label="Buscando criaturas…" />
              </div>
            ) : error && items.length === 0 ? (
              <EmptyState compact icon={<Skull />} title="No se pudo cargar" description={error} />
            ) : items.length === 0 ? (
              <EmptyState
                compact
                icon={<Skull />}
                title={query ? 'Sin resultados' : 'No hay criaturas'}
                description={query ? 'Prueba con otras palabras.' : 'Añade enemigos en la Biblioteca para usarlos aquí.'}
              />
            ) : (
              <ul className={clsx('flex flex-col gap-0.5 transition-opacity', loading && 'opacity-60')}>
                {items.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => pick(entry)}
                      title={entry.description || entry.name}
                      className="group flex w-full items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-gold-700/70 hover:bg-ink-800/80"
                    >
                      <Avatar name={entry.name} imageUrl={entry.imageUrl} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-parchment-100 group-hover:text-parchment-50">{entry.name}</span>
                        <span className="block truncate text-[11px] text-parchment-400">
                          {[
                            entry.cr !== null ? `Desafío ${formatCr(entry.cr)}` : null,
                            entry.hp !== null ? `${formatNumber(entry.hp)} PV` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Criatura'}
                        </span>
                      </span>
                      <Crown className="h-4 w-4 shrink-0 text-parchment-400 opacity-0 transition group-hover:text-gold-300 group-hover:opacity-100" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </PanelSection>
  );
}
