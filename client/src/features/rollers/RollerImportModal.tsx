import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, Dices, Disc3, Download, Import, RefreshCw, Search } from 'lucide-react';
import type { CampaignSummary, Roller } from '@wailers/shared';
import { api } from '../../api/http';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { SearchInput } from '../../components/ui/SearchInput';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { toast } from '../../components/ui/toast';
import { DieGlyph } from '../dice/DieShapes';
import { errorMessage } from '../dice/diceUtils';
import { MiniWheel } from '../dice/RouletteWheel';
import { Segmented } from '../dice/Segmented';
import { rollerSummary, tagCounts } from './rollerUtils';

export interface RollerImportModalProps {
  open: boolean;
  /** Destination campaign (its own rollers are excluded from the results). */
  campaignId: string;
  /** Rollers already in the destination campaign (to flag previous imports). */
  existing: Roller[];
  onClose: () => void;
  onImported: (roller: Roller) => void;
}

type KindFilter = 'all' | 'roulette' | 'dice';

/** Browse dice and roulettes of other campaigns and import independent copies. */
export function RollerImportModal(props: RollerImportModalProps) {
  if (!props.open) return null;
  return <ImportInner {...props} />;
}

function ImportInner({ campaignId, existing, onClose, onImported }: RollerImportModalProps) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>('all');
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [results, setResults] = useState<Roller[]>([]);
  const [tagPool, setTagPool] = useState<{ tag: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(() => new Set());
  const [reloadKey, setReloadKey] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    api.campaigns
      .list()
      .then((list) => {
        if (!cancelled) setCampaigns(list.filter((c) => c.id !== campaignId).sort((a, b) => a.name.localeCompare(b.name, 'es')));
      })
      .catch(() => {
        if (!cancelled) setCampaigns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  useEffect(() => {
    const s = ++seq.current;
    setLoading(true);
    setError(null);
    api.rollers
      .search({ q: query.trim() || undefined, tag: tag ?? undefined, campaignId: source ?? undefined, kind: kind === 'all' ? undefined : kind })
      .then((list) => {
        if (s !== seq.current) return;
        const others = list.filter((r) => r.campaignId !== campaignId);
        setResults(others);
        if (!tag) setTagPool(tagCounts(others).slice(0, 16));
      })
      .catch((err: unknown) => {
        if (s === seq.current) setError(errorMessage(err, 'No se pudo buscar en otras campañas'));
      })
      .finally(() => {
        if (s === seq.current) setLoading(false);
      });
  }, [query, tag, source, kind, campaignId, reloadKey]);

  const alreadyImported = useMemo(() => {
    const ids = new Set(imported);
    for (const r of existing) if (r.copiedFromId) ids.add(r.copiedFromId);
    return ids;
  }, [existing, imported]);

  const doImport = async (r: Roller) => {
    setImporting(r.id);
    try {
      const copy = await api.campaigns.importRoller(campaignId, r.id);
      onImported(copy);
      setImported((prev) => new Set(prev).add(r.id));
      toast.success('Copia independiente importada', { description: copy.name });
    } catch (err) {
      toast.fromError(err, 'No se pudo importar');
    } finally {
      setImporting(null);
    }
  };

  const campaignOptions = [{ value: null, label: 'Todas las campañas' }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))];

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={<Import />}
      title="Importar de otra campaña"
      subtitle="Se crea una copia independiente: los cambios en la copia no afectan al original."
      bodyClassName="p-0"
    >
      <div className="flex max-h-[calc(100vh-11rem)] min-h-[24rem] flex-col">
        <div className="space-y-2.5 border-b border-ink-600/70 px-5 py-3">
          <div className="flex flex-wrap items-end gap-2">
            <SearchInput
              value={query}
              onChange={setQuery}
              debounceMs={250}
              autoFocus
              size="sm"
              placeholder="Buscar ruletas y dados…"
              className="min-w-[12rem] flex-1"
            />
            <Select<string | null> size="sm" value={source} onChange={setSource} options={campaignOptions} aria-label="Campaña de origen" containerClassName="w-56" />
            <Segmented
              fill={false}
              value={kind}
              onChange={setKind}
              ariaLabel="Tipo"
              options={[
                { value: 'all', label: 'Todo' },
                { value: 'roulette', label: 'Ruletas', icon: <Disc3 /> },
                { value: 'dice', label: 'Dados', icon: <Dices /> },
              ]}
            />
          </div>
          {tagPool.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {tagPool.map(({ tag: t, count }) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTag((cur) => (cur === t ? null : t))}
                  aria-pressed={tag === t}
                  className={clsx(
                    'rounded-full border px-2 py-0.5 text-[11px] font-semibold transition',
                    tag === t ? 'border-gold-500/70 bg-gold-500/15 text-gold-200' : 'border-ink-500 bg-ink-800 text-parchment-300 hover:text-parchment-100',
                  )}
                >
                  <span className="text-gold-500">#</span>
                  {t} <span className="text-parchment-400">{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading && results.length === 0 ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" showLabel label="Buscando…" />
            </div>
          ) : error ? (
            <EmptyState
              compact
              icon={<Search />}
              title="No se pudo buscar"
              description={error}
              action={
                <Button size="sm" icon={<RefreshCw />} onClick={() => setReloadKey((k) => k + 1)}>
                  Reintentar
                </Button>
              }
            />
          ) : results.length === 0 ? (
            <EmptyState compact icon={<Search />} title="No hay resultados" description="Prueba con otras palabras, otra campaña u otra etiqueta." />
          ) : (
            <ul className={clsx('grid gap-3 sm:grid-cols-2', loading && 'opacity-60 transition-opacity')}>
              {results.map((r) => (
                <ImportCard key={r.id} roller={r} imported={alreadyImported.has(r.id)} busy={importing === r.id} disabled={importing !== null && importing !== r.id} onImport={() => void doImport(r)} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ImportCard({ roller, imported, busy, disabled, onImport }: { roller: Roller; imported: boolean; busy: boolean; disabled: boolean; onImport: () => void }) {
  const previewSegments = roller.segments.slice(0, 6);
  const extraSegments = roller.segments.length - previewSegments.length;
  const faces = roller.faces ?? [];
  return (
    <li className="flex flex-col rounded-xl border border-ink-600/80 bg-ink-900/70 p-3 transition hover:border-gold-700/60">
      <div className="flex items-start gap-3">
        {roller.kind === 'roulette' ? <MiniWheel segments={roller.segments} size={52} /> : <DieGlyph sides={faces.length > 0 ? 6 : 20} size={52} />}
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[15px] font-semibold text-parchment-50" title={roller.name}>
            {roller.name}
          </div>
          <div className="truncate text-[11px] text-parchment-400">
            {roller.campaignName} · {rollerSummary(roller)}
          </div>
          {roller.description && <p className="mt-1 line-clamp-2 text-xs text-parchment-300">{roller.description}</p>}
        </div>
      </div>

      {roller.kind === 'roulette' ? (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {previewSegments.map((s) => (
            <span key={s.id} className="inline-flex max-w-[11rem] items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] text-parchment-100" style={{ borderColor: `${s.color}aa`, backgroundColor: `${s.color}26` }}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              {s.icon && <span aria-hidden>{s.icon}</span>}
              <span className="truncate">{s.label}</span>
            </span>
          ))}
          {extraSegments > 0 && <span className="chip text-[11px]">+{extraSegments} más</span>}
        </div>
      ) : faces.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {faces.slice(0, 6).map((f, i) => (
            <span key={i} className="chip max-w-[10rem] text-[11px]">
              <span className="truncate">{f}</span>
            </span>
          ))}
          {faces.length > 6 && <span className="chip text-[11px]">+{faces.length - 6} más</span>}
        </div>
      ) : (
        <div className="mt-2.5">
          <span className="chip border-gold-700/50 font-mono text-gold-200">{roller.formula ?? '—'}</span>
        </div>
      )}

      {roller.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {roller.tags.map((t) => (
            <span key={t} className="text-[11px] text-parchment-400">
              <span className="text-gold-600">#</span>
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-end gap-2 pt-3">
        {imported && (
          <Badge tone="emerald" size="xs" icon={<Check />}>
            Ya importada
          </Badge>
        )}
        <Button size="sm" variant={imported ? 'secondary' : 'primary'} icon={<Download />} loading={busy} disabled={disabled} onClick={onImport}>
          Importar copia
        </Button>
      </div>
    </li>
  );
}
