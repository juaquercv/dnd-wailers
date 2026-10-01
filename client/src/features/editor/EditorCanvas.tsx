import { useEditorStore } from './editorStore';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

/** Placeholder — replaced by the editor-canvas agent (reads everything from editorStore). */
export function EditorCanvas() {
  const tool = useEditorStore((s) => s.tool);
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <UnderConstruction title="Lienzo del editor" detail={`Herramienta: ${tool}`} />
    </div>
  );
}
