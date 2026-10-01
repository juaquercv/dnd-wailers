import { useEffect, useState } from 'react';
import { BookMarked, LayoutTemplate } from 'lucide-react';
import type { LibraryEntry, Zone } from '@wailers/shared';
import { api } from '../../../api/http';
import { Button, Modal, TagInput, TextArea, TextInput, toast } from '../../../components/ui';
import { LibraryBrowser } from '../../library/LibraryBrowser';
import { useEditorStore } from '../editorStore';

export interface SaveTemplateModalProps {
  zone: Zone | null;
  onClose: () => void;
}

/** "Guardar como plantilla": stores a copy of the zone in the shared library. */
export function SaveTemplateModal({ zone, onClose }: SaveTemplateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!zone) return;
    setName(zone.name);
    setDescription('');
    setTags(zone.tags);
  }, [zone]);

  const submit = async () => {
    if (!zone) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.warning('La plantilla necesita un nombre');
      return;
    }
    setSaving(true);
    try {
      // The template copies what the server has: flush pending edits first.
      await useEditorStore.getState().saveNow();
      const entry = await api.zones.saveAsTemplate(zone.id, { name: trimmed, description: description.trim(), tags });
      toast.success(`Plantilla «${entry.name}» guardada en la biblioteca`, {
        description: 'Podrás usarla al crear zonas en cualquier campaña.',
      });
      onClose();
    } catch (err) {
      toast.fromError(err, 'No se pudo guardar la plantilla');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={zone !== null}
      onClose={() => !saving && onClose()}
      title="Guardar como plantilla"
      subtitle={zone ? `Se guardará una copia de «${zone.name}» con todos sus niveles` : undefined}
      icon={<BookMarked />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<BookMarked />} loading={saving} onClick={() => void submit()}>
            Guardar plantilla
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextInput label="Nombre" value={name} onValueChange={setName} maxLength={80} required data-autofocus />
        <TextArea
          label="Descripción"
          value={description}
          onValueChange={setDescription}
          rows={3}
          placeholder="Una posada de dos plantas con sótano…"
          maxLength={2000}
        />
        <TagInput label="Etiquetas" value={tags} onChange={setTags} kind="zone" />
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

export interface TemplatePickerModalProps {
  open: boolean;
  onClose: () => void;
  /** Parent for the new zone (sub-zone from template). */
  parentZoneId?: string | null;
}

/** "Nueva zona › Desde plantilla": pick a zone template from the library. */
export function TemplatePickerModal({ open, onClose, parentZoneId = null }: TemplatePickerModalProps) {
  const campaignId = useEditorStore((s) => s.campaignId);
  const [creating, setCreating] = useState(false);

  const pick = async (entry: LibraryEntry) => {
    if (creating) return;
    setCreating(true);
    try {
      const zone = await useEditorStore
        .getState()
        .createZone({ templateEntryId: entry.id, name: entry.name, parentZoneId: parentZoneId ?? undefined });
      if (zone) {
        void api.library.markUsed(entry.id, campaignId ?? undefined).catch(() => undefined);
        toast.success(`Zona «${zone.name}» creada desde la plantilla`);
        onClose();
      }
    } catch (err) {
      toast.fromError(err, 'No se pudo crear la zona');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !creating && onClose()}
      size="xl"
      title="Nueva zona desde plantilla"
      subtitle="Elige un mapa de la biblioteca: se copiará con todos sus niveles, paredes, luces y notas."
      icon={<LayoutTemplate />}
      bodyClassName="p-0"
      className="h-[min(48rem,calc(100vh-2rem))]"
    >
      <div className="relative flex h-full min-h-[24rem] flex-col">
        <LibraryBrowser
          kinds={['zone']}
          initialKind="zone"
          onPick={(entry) => void pick(entry)}
          pickLabel="Usar plantilla"
          className="min-h-0 flex-1"
        />
        {creating && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink-950/70 backdrop-blur-sm">
            <span className="font-display text-sm uppercase tracking-[0.2em] text-gold-300">Creando zona…</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
