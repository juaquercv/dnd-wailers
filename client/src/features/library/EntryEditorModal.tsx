import { useMemo, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { ENTRY_KIND_LABELS, type EntryKind, type LibraryEntry, type LibraryEntryInput } from '@wailers/shared';
import { api } from '../../api/http';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Kbd } from '../../components/ui/Kbd';
import { Modal } from '../../components/ui/Modal';
import { Tabs } from '../../components/ui/Tabs';
import { toast } from '../../components/ui/toast';
import { useHotkeys } from '../../lib/hotkeys';
import { useAuthStore } from '../../stores/auth';
import { useUsers } from '../../stores/users';
import { notifySoundLibraryChanged } from '../audio/soundLibrary';
import { CreatureCombatTab, CreatureLootTab, CreatureStatsTab } from './editor/CreatureFields';
import { draftFromEntry, newDraft, tabsFor, toPayload, validateDraft, type AnyDraft, type EditorTab } from './editor/draft';
import { CategoryFields, GeneralFields } from './editor/GeneralFields';
import { HeroInventoryTab, HeroNotesTab, HeroResourcesTab, HeroSpellsTab, HeroStatsTab } from './editor/HeroFields';
import { ItemPropertiesTab, SoundAudioTab, SpellCastingTab, ZoneContentTab } from './editor/KindFields';
import { KindIcon, newEntryLabel } from './meta';
import { useCampaignList } from './useLibrarySearch';

export interface EntryEditorModalProps {
  open: boolean;
  kind: EntryKind;
  entry?: LibraryEntry | null;
  defaults?: Partial<LibraryEntryInput>;
  onClose: () => void;
  onSaved: (entry: LibraryEntry) => void;
}

/** Create / edit any library entry with complete per-kind forms. */
export function EntryEditorModal(props: EntryEditorModalProps) {
  if (!props.open) return null;
  const kind = props.entry?.kind ?? props.kind;
  return <EditorDialog key={`${props.entry?.id ?? 'new'}:${kind}`} {...props} kind={kind} />;
}

function EditorDialog({ kind, entry, defaults, onClose, onSaved }: EntryEditorModalProps) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [draft, setDraft] = useState<AnyDraft>(() => (entry ? draftFromEntry(entry) : newDraft(kind, defaults, userId)));
  const initialJson = useRef<string>(JSON.stringify(draft));
  const [tab, setTab] = useState<EditorTab>('general');
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const campaigns = useCampaignList();
  const { users } = useUsers();
  const confirm = useConfirm();

  const draftJson = useMemo(() => JSON.stringify(draft), [draft]);
  const dirty = draftJson !== initialJson.current;
  const problems = useMemo(() => validateDraft(draft), [draft]);
  const errors = useMemo<Record<string, string>>(() => {
    if (!showErrors) return {};
    const out: Record<string, string> = {};
    for (const p of problems) if (!out[p.key]) out[p.key] = p.message;
    return out;
  }, [problems, showErrors]);
  const errorTabs = useMemo(() => new Set(showErrors ? problems.map((p) => p.tab) : []), [problems, showErrors]);

  const tabs = tabsFor(draft.kind);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'general';

  const requestClose = async () => {
    if (saving) return;
    if (dirty) {
      const ok = await confirm({
        title: '¿Descartar los cambios?',
        message: 'Hay cambios sin guardar en este elemento. Si cierras ahora se perderán.',
        confirmLabel: 'Descartar',
        cancelLabel: 'Seguir editando',
        danger: true,
      });
      if (!ok) return;
    }
    onClose();
  };

  const save = async () => {
    if (saving) return;
    setShowErrors(true);
    const first = problems[0];
    if (first) {
      setTab(first.tab);
      toast.warning('Revisa los campos marcados', { description: first.message });
      return;
    }
    setSaving(true);
    try {
      const payload = toPayload(draft);
      const saved = entry ? await api.library.update(entry.id, payload) : await api.library.create(payload);
      initialJson.current = draftJson;
      if (saved.kind === 'sound') notifySoundLibraryChanged();
      toast.success(entry ? 'Cambios guardados' : 'Añadido a la biblioteca', { description: saved.name });
      onSaved(saved);
    } catch (err) {
      toast.fromError(err, 'No se pudo guardar el elemento');
    } finally {
      setSaving(false);
    }
  };

  useHotkeys({ 'mod+enter, mod+s': () => void save() }, { allowInInputs: true });

  const counts: Partial<Record<EditorTab, number>> = {
    categories: draft.categoryIds?.length ?? 0,
  };
  if (draft.kind === 'hero') {
    counts.inventory = draft.data.inventory.length;
    counts.spells = draft.data.spells.length;
  }
  if (draft.kind === 'creature') counts.combat = draft.data.attacks.length + draft.data.traits.length;

  const renderTab = () => {
    if (activeTab === 'general') return <GeneralFields draft={draft} onChange={setDraft} errors={errors} campaigns={campaigns} users={users} />;
    if (activeTab === 'categories') return <CategoryFields draft={draft} onChange={setDraft} />;
    switch (draft.kind) {
      case 'creature':
        if (activeTab === 'stats') return <CreatureStatsTab draft={draft} onChange={setDraft} errors={errors} />;
        if (activeTab === 'combat') return <CreatureCombatTab draft={draft} onChange={setDraft} errors={errors} />;
        if (activeTab === 'loot') return <CreatureLootTab draft={draft} onChange={setDraft} errors={errors} />;
        break;
      case 'item':
        if (activeTab === 'properties') return <ItemPropertiesTab draft={draft} onChange={setDraft} errors={errors} />;
        break;
      case 'spell':
        if (activeTab === 'casting') return <SpellCastingTab draft={draft} onChange={setDraft} errors={errors} />;
        break;
      case 'sound':
        if (activeTab === 'audio') return <SoundAudioTab draft={draft} onChange={setDraft} errors={errors} />;
        break;
      case 'zone':
        if (activeTab === 'content') return <ZoneContentTab draft={draft} errors={errors} />;
        break;
      case 'hero':
        if (activeTab === 'hero-stats') return <HeroStatsTab draft={draft} onChange={setDraft} errors={errors} />;
        if (activeTab === 'resources') return <HeroResourcesTab draft={draft} onChange={setDraft} errors={errors} />;
        if (activeTab === 'inventory') return <HeroInventoryTab draft={draft} onChange={setDraft} errors={errors} />;
        if (activeTab === 'spells') return <HeroSpellsTab draft={draft} onChange={setDraft} errors={errors} />;
        if (activeTab === 'notes') return <HeroNotesTab draft={draft} onChange={setDraft} errors={errors} />;
        break;
    }
    return null;
  };

  return (
    <Modal
      open
      onClose={() => void requestClose()}
      size="xl"
      icon={<KindIcon kind={draft.kind} />}
      title={entry ? `Editar «${entry.name}»` : newEntryLabel(draft.kind)}
      subtitle={
        entry
          ? `${ENTRY_KIND_LABELS[draft.kind].singular} · los cambios afectan a todas las campañas que lo usen.`
          : `${ENTRY_KIND_LABELS[draft.kind].singular} para la biblioteca compartida.`
      }
      bodyClassName="p-0"
      className="h-[min(52rem,calc(100vh-2rem))]"
      footer={
        <>
          <span className="mr-auto hidden items-center gap-1.5 text-xs text-parchment-400 sm:inline-flex">
            <Kbd combo="mod+enter" /> para guardar
            {dirty && <span className="ml-2 inline-flex items-center gap-1 text-gold-300">● Cambios sin guardar</span>}
          </span>
          <Button variant="ghost" onClick={() => void requestClose()} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<Save />} loading={saving} onClick={() => void save()}>
            {entry ? 'Guardar cambios' : 'Crear'}
          </Button>
        </>
      }
    >
      <div className="sticky top-0 z-10 bg-ink-900/95 px-5 pt-1 backdrop-blur">
        <Tabs<EditorTab>
          aria-label="Secciones del formulario"
          value={activeTab}
          onChange={setTab}
          items={tabs.map((t) => ({
            id: t.id,
            label: (
              <span className="inline-flex items-center gap-1.5">
                {t.label}
                {errorTabs.has(t.id) && <span className="h-2 w-2 rounded-full bg-blood-400 shadow-[0_0_6px_rgba(224,98,90,0.9)]" aria-label="con errores" />}
              </span>
            ),
            badge: counts[t.id] ? counts[t.id] : undefined,
          }))}
        />
      </div>
      <div key={activeTab} className="animate-fade-in px-5 py-5">
        {renderTab()}
      </div>
    </Modal>
  );
}
