import { useRef, useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { RotateCcw } from 'lucide-react';
import { defaultSlotsTable } from '@wailers/shared';
import { Button } from '../../../../components/ui/Button';
import { useConfirm } from '../../../../components/ui/ConfirmDialog';

export interface SlotsTableEditorProps {
  table: number[][];
  onChange: (table: number[][]) => void;
}

const LEVELS = 20;
const SPELL_LEVELS = 9;
const MAX_SLOTS = 20;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

function normalizedTable(table: number[][]): number[][] {
  return Array.from({ length: LEVELS }, (_, r) =>
    Array.from({ length: SPELL_LEVELS }, (_, c) => {
      const v = table[r]?.[c];
      return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
    }),
  );
}

function sameTable(a: number[][], b: number[][]): boolean {
  return a.every((row, r) => row.every((v, c) => v === b[r]?.[c]));
}

/**
 * Compact 20 × 9 grid: rows = character level, columns = spell level.
 * Arrow keys move between cells; Enter goes down; digits replace the value.
 */
export function SlotsTableEditor({ table, onChange }: SlotsTableEditorProps) {
  const confirm = useConfirm();
  const rootRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<{ r: number; c: number } | null>(null);
  const data = normalizedTable(table);
  const isStandard = sameTable(data, defaultSlotsTable());

  const setCell = (r: number, c: number, value: number) => {
    const next = data.map((row) => [...row]);
    next[r]![c] = Math.min(MAX_SLOTS, Math.max(0, value));
    onChange(next);
  };

  const focusCell = (r: number, c: number) => {
    const rr = Math.min(LEVELS - 1, Math.max(0, r));
    const cc = Math.min(SPELL_LEVELS - 1, Math.max(0, c));
    const el = rootRef.current?.querySelector<HTMLInputElement>(`[data-cell="${rr}-${cc}"]`);
    el?.focus();
    el?.select();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    const input = e.currentTarget;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd = input.selectionStart === input.value.length;
    const allSelected = input.selectionStart === 0 && input.selectionEnd === input.value.length;
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        focusCell(r - 1, c);
        break;
      case 'ArrowDown':
      case 'Enter':
        e.preventDefault();
        focusCell(r + 1, c);
        break;
      case 'ArrowLeft':
        if (atStart || allSelected) {
          e.preventDefault();
          focusCell(r, c - 1);
        }
        break;
      case 'ArrowRight':
        if (atEnd || allSelected) {
          e.preventDefault();
          focusCell(r, c + 1);
        }
        break;
      case '+':
        e.preventDefault();
        setCell(r, c, (data[r]?.[c] ?? 0) + 1);
        break;
      case '-':
        e.preventDefault();
        setCell(r, c, (data[r]?.[c] ?? 0) - 1);
        break;
      default:
        break;
    }
  };

  const restore = async () => {
    const ok = await confirm({
      title: 'Restaurar tabla estándar',
      message: 'Se sustituirá la tabla actual por la de un lanzador completo de D&D 5e (niveles 1 a 20).',
      confirmLabel: 'Restaurar',
    });
    if (ok) onChange(defaultSlotsTable());
  };

  const totalAt20 = data[LEVELS - 1]?.reduce((s, v) => s + v, 0) ?? 0;

  return (
    <div ref={rootRef} className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-parchment-400">
          Filas: nivel del personaje · Columnas: nivel del hechizo. Usa las flechas para moverte y <span className="text-parchment-200">+ / −</span> para
          sumar o restar.
        </p>
        <Button size="sm" variant="secondary" icon={<RotateCcw />} onClick={() => void restore()} disabled={isStandard}>
          Restaurar tabla estándar
        </Button>
      </div>
      <div className="scroll-thin overflow-x-auto rounded-lg border border-ink-600 bg-ink-950/50">
        <table className="w-full border-collapse text-center text-xs tabular-nums">
          <thead>
            <tr className="bg-ink-800/80 text-[10px] uppercase tracking-wider text-parchment-300">
              <th scope="col" className="sticky left-0 z-[1] bg-ink-800 px-2 py-1.5 text-left font-semibold">
                Nivel
              </th>
              {ROMAN.map((label, c) => (
                <th
                  key={label}
                  scope="col"
                  className={clsx('px-1 py-1.5 font-semibold', focus?.c === c && 'text-gold-300')}
                  title={`Hechizos de nivel ${c + 1}`}
                >
                  {label}
                </th>
              ))}
              <th scope="col" className="px-2 py-1.5 font-semibold text-parchment-400">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, r) => {
              const total = row.reduce((s, v) => s + v, 0);
              return (
                <tr key={r} className={clsx('border-t border-ink-700/70', focus?.r === r ? 'bg-gold-500/[0.06]' : r % 2 ? 'bg-ink-900/40' : undefined)}>
                  <th
                    scope="row"
                    className={clsx(
                      'sticky left-0 z-[1] bg-ink-900 px-2 py-0.5 text-left font-semibold',
                      focus?.r === r ? 'text-gold-300' : 'text-parchment-300',
                    )}
                  >
                    {r + 1}
                  </th>
                  {row.map((value, c) => (
                    <td key={c} className="p-0.5">
                      <input
                        data-cell={`${r}-${c}`}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label={`Espacios de nivel ${c + 1} para personajes de nivel ${r + 1}`}
                        value={String(value)}
                        onFocus={(e) => {
                          setFocus({ r, c });
                          e.currentTarget.select();
                        }}
                        onBlur={() => setFocus((f) => (f && f.r === r && f.c === c ? null : f))}
                        onKeyDown={(e) => onKeyDown(e, r, c)}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(-2);
                          setCell(r, c, digits === '' ? 0 : parseInt(digits, 10));
                        }}
                        className={clsx(
                          'h-6 w-8 rounded border border-transparent bg-transparent text-center outline-none transition',
                          'hover:border-ink-500 focus:border-gold-500 focus:bg-ink-950 focus:ring-1 focus:ring-gold-500/40',
                          value === 0 ? 'text-parchment-400/40' : 'font-semibold text-parchment-50',
                        )}
                      />
                    </td>
                  ))}
                  <td className="px-2 text-parchment-400">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-parchment-400">
        {isStandard ? 'Tabla estándar de lanzador completo.' : 'Tabla personalizada.'} A nivel 20: {totalAt20} espacios en total.
      </p>
    </div>
  );
}
