import { useEffect, useState } from 'react';
import { BookMarked, Check, Gem, ListPlus } from 'lucide-react';
import type { InventoryItem, LibraryEntry, SuggestedLoot as SuggestedLootRow } from '@wailers/shared';
import { api } from '../../../api/http';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';
import { send } from './actions';

export interface SuggestedLootProps {
  tokenId: string;
  entryId: string;
  /** Loot already registered on the token (to mark rows as done). */
  loot: InventoryItem[];
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; rows: SuggestedLootRow[] };

/**
 * "Botín sugerido (referencia)" from the creature's library entry. Nothing is added unless the DM
 * presses "Registrar".
 */
export function SuggestedLoot({ tokenId, entryId, loot }: SuggestedLootProps) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    setLoad({ status: 'loading' });
    setDone([]);
    api.library
      .get(entryId)
      .then((entry: LibraryEntry) => {
        if (!alive) return;
        const data = entry.kind === 'creature' ? (entry as LibraryEntry<'creature'>).data : null;
        setLoad({ status: 'ready', rows: Array.isArray(data?.suggestedLoot) ? data.suggestedLoot : [] });
      })
      .catch((err: unknown) => {
        if (alive) setLoad({ status: 'error', message: err instanceof Error ? err.message : 'No se pudo cargar la criatura' });
      });
    return () => {
      alive = false;
    };
  }, [entryId]);

  const register = async (row: SuggestedLootRow) => {
    setBusy(row.id);
    const ok = await send(
      'loot:add',
      row.entryId
        ? { tokenId, entryId: row.entryId, quantity: Math.max(1, row.quantity) }
        : { tokenId, item: { name: row.name, notes: row.notes }, quantity: Math.max(1, row.quantity) },
      { success: `${row.name} registrado como botín` },
    );
    setBusy(null);
    if (ok) setDone((d) => [...d, row.id]);
    return ok;
  };

  if (load.status === 'loading') {
    return (
      <div className="flex justify-center py-3">
        <Spinner size="sm" label="Cargando botín sugerido…" />
      </div>
    );
  }
  if (load.status === 'error') return <p className="text-xs text-blood-300">{load.message}</p>;
  if (load.rows.length === 0) return <p className="text-xs italic text-parchment-400">La criatura no tiene botín sugerido en la biblioteca.</p>;

  const isRegistered = (row: SuggestedLootRow) =>
    done.includes(row.id) || (row.entryId ? loot.some((l) => l.entryId === row.entryId) : loot.some((l) => l.name === row.name));
  const pending = load.rows.filter((r) => !isRegistered(r));

  return (
    <div className="space-y-1.5">
      <ul className="space-y-1">
        {load.rows.map((row) => {
          const registered = isRegistered(row);
          return (
            <li key={row.id} className="flex items-center gap-2 rounded-md border border-dashed border-ink-500/80 bg-ink-900/40 px-2 py-1.5">
              {row.entryId ? <BookMarked className="h-3.5 w-3.5 shrink-0 text-gold-500" /> : <Gem className="h-3.5 w-3.5 shrink-0 text-parchment-400" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-parchment-100">
                  {row.name}
                  {row.quantity > 1 && <span className="ml-1 text-parchment-400">×{row.quantity}</span>}
                </div>
                {row.notes && <div className="truncate text-[10px] italic text-parchment-400" title={row.notes}>{row.notes}</div>}
              </div>
              {registered ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300">
                  <Check className="h-3 w-3" />
                  Registrado
                </span>
              ) : (
                <Button size="sm" variant="ghost" loading={busy === row.id} onClick={() => void register(row)}>
                  Registrar
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {pending.length > 1 && (
        <Button
          size="sm"
          variant="secondary"
          icon={<ListPlus />}
          block
          onClick={() =>
            void (async () => {
              for (const row of pending) if (!(await register(row))) break;
            })()
          }
        >
          Registrar todo ({pending.length})
        </Button>
      )}
    </div>
  );
}
