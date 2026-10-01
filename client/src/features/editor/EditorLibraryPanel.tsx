import { Hand } from 'lucide-react';
import { LibraryBrowser } from '../library/LibraryBrowser';
import { useEditorStore } from './editorStore';

/** Library browser (creatures and items) whose entries can be dragged onto the map. */
export function EditorLibraryPanel() {
  const campaignId = useEditorStore((s) => s.campaignId);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-ink-700/80 bg-gold-500/5 px-3 py-2 text-[11px] leading-snug text-gold-200/90">
        <Hand className="h-3.5 w-3.5 shrink-0 text-gold-400" aria-hidden />
        Arrastra enemigos, NPCs u objetos al mapa
      </div>
      <div className="min-h-0 flex-1">
        <LibraryBrowser kinds={['creature', 'item']} compact draggable campaignId={campaignId ?? undefined} className="h-full" />
      </div>
    </div>
  );
}
