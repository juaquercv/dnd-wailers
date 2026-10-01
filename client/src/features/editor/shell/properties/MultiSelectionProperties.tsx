import { Copy, Eye, EyeOff, Lock, LockOpen, MousePointerClick, Trash2, X } from 'lucide-react';
import { LAYER_IDS, LAYER_LABELS, type LayerId } from '@wailers/shared';
import { Button, Select } from '../../../../components/ui';
import { plural } from '../../../../lib/format';
import { useEditorStore } from '../../editorStore';
import { ELEMENT_TYPE_INFO, SELECTION_KIND_INFO } from '../labels';
import { PanelSection } from '../PanelSection';
import type { ResolvedItem } from './common';

const LAYER_OPTIONS = LAYER_IDS.map((id) => ({ value: id, label: LAYER_LABELS[id] }));

/** Summary and bulk actions for a multi-selection. */
export function MultiSelectionProperties({ items }: { items: ResolvedItem[] }) {
  const updateLevel = useEditorStore((s) => s.updateLevel);
  const deleteSelection = useEditorStore((s) => s.deleteSelection);
  const duplicateSelection = useEditorStore((s) => s.duplicateSelection);
  const setSelection = useEditorStore((s) => s.setSelection);

  const elements = items.flatMap((i) => (i.kind === 'element' ? [i.element] : []));
  const elementIds = new Set(elements.map((e) => e.id));
  const counts = new Map<string, { label: string; count: number; Icon: (typeof ELEMENT_TYPE_INFO)['image']['icon'] }>();
  for (const item of items) {
    const info = item.kind === 'element' ? ELEMENT_TYPE_INFO[item.element.type] : SELECTION_KIND_INFO[item.kind];
    const key = item.kind === 'element' ? item.element.type : item.kind;
    const cur = counts.get(key);
    counts.set(key, { label: info.label, count: (cur?.count ?? 0) + 1, Icon: info.icon });
  }

  const allHidden = elements.length > 0 && elements.every((e) => e.hidden);
  const allLocked = elements.length > 0 && elements.every((e) => e.locked);
  const commonLayer = elements.length > 0 && elements.every((e) => e.layer === elements[0]!.layer) ? elements[0]!.layer : null;

  const patchElements = (recipe: (el: (typeof elements)[number]) => void) =>
    updateLevel((level) => {
      for (const el of level.elements) if (elementIds.has(el.id)) recipe(el);
    });

  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-2.5 border-b border-ink-700/80 bg-gradient-to-b from-gold-500/[0.07] to-transparent px-3 py-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold-700/50 bg-gold-500/10 text-gold-300">
          <MousePointerClick className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-400/90">Selección múltiple</div>
          <div className="text-sm font-semibold text-parchment-50">{plural(items.length, 'objeto seleccionado', 'objetos seleccionados')}</div>
        </div>
      </div>

      <PanelSection id="multi-summary" title="Contenido" collapsible={false}>
        <ul className="flex flex-col gap-1">
          {Array.from(counts.entries()).map(([key, { label, count, Icon }]) => (
            <li key={key} className="flex items-center gap-2 text-sm text-parchment-200">
              <Icon className="h-3.5 w-3.5 text-gold-500" aria-hidden />
              <span className="flex-1">{label}</span>
              <span className="rounded-full bg-ink-700 px-1.5 text-[11px] font-bold tabular-nums text-parchment-100">{count}</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            icon={<Copy />}
            disabled={elements.length === 0}
            title={elements.length === 0 ? 'Solo se pueden duplicar elementos del mapa' : 'Duplicar (Ctrl+D)'}
            onClick={duplicateSelection}
          >
            Duplicar
          </Button>
          <Button size="sm" variant="danger" icon={<Trash2 />} onClick={deleteSelection}>
            Eliminar
          </Button>
        </div>
        <Button size="sm" variant="ghost" icon={<X />} onClick={() => setSelection([])} className="self-start">
          Deseleccionar (Esc)
        </Button>
      </PanelSection>

      {elements.length > 0 && (
        <PanelSection id="multi-bulk" title={`Elementos (${elements.length})`}>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              icon={allHidden ? <Eye /> : <EyeOff />}
              onClick={() =>
                patchElements((el) => {
                  el.hidden = !allHidden;
                })
              }
            >
              {allHidden ? 'Mostrar' : 'Ocultar'}
            </Button>
            <Button
              size="sm"
              icon={allLocked ? <LockOpen /> : <Lock />}
              onClick={() =>
                patchElements((el) => {
                  el.locked = !allLocked;
                })
              }
            >
              {allLocked ? 'Desbloquear' : 'Bloquear'}
            </Button>
          </div>
          <Select<LayerId | ''>
            label="Mover a la capa"
            size="sm"
            value={commonLayer ?? ''}
            placeholder="Capas distintas"
            options={LAYER_OPTIONS}
            onChange={(layer) => {
              if (!layer) return;
              patchElements((el) => {
                el.layer = layer;
              });
            }}
          />
          <p className="text-[11px] text-parchment-400">«Ocultar» esconde los elementos a los jugadores; el DM los sigue viendo.</p>
        </PanelSection>
      )}
    </div>
  );
}
