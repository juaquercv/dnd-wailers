import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowLeft,
  Building2,
  Dices,
  GalleryVerticalEnd,
  Grid3x3,
  LayoutTemplate,
  Library,
  Map as MapIcon,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Layers,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import { APP_NAME, type Campaign, type Zone, type ZoneNeighbors } from '@wailers/shared';
import { Button, EmptyState, IconButton, Tabs, toast, type TabItem } from '../../components/ui';
import { D20Icon, FullScreenLoader } from '../../components/layout';
import { formatHotkey } from '../../lib/hotkeys';
import { RollerManager } from '../rollers/RollerManager';
import { CampaignSettingsPanel } from './CampaignSettingsPanel';
import { EditorCanvas } from './EditorCanvas';
import { EditorLibraryPanel } from './EditorLibraryPanel';
import { useEditorStore, type EditorMode } from './editorStore';
import { EditorToolbar } from './EditorToolbar';
import { LayersPanel } from './LayersPanel';
import { LevelsPanel } from './LevelsPanel';
import { OverviewEditor } from './OverviewEditor';
import { PropertiesPanel } from './PropertiesPanel';
import { RulesEditor } from './RulesEditor';
import { hasUnsavedWork, retrySave, saveCampaign } from './shell/campaignSave';
import { InlineEdit } from './shell/InlineEdit';
import { SaveIndicator, useSaveStatus } from './shell/SaveIndicator';
import { stopSoundPreview } from './shell/SoundPicker';
import { TemplatePickerModal } from './shell/TemplateModals';
import { useZoneActions } from './shell/zoneActions';
import { SlidesPanel } from './SlidesPanel';
import { useEditorHotkeys } from './useEditorHotkeys';
import { ZoneGridEditor } from './ZoneGridEditor';
import { ZoneSettingsPanel } from './ZoneSettingsPanel';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Boolean UI preference kept in localStorage (storage may be unavailable). */
function usePersistentFlag(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : raw === '1';
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next ? '1' : '0');
      } catch {
        /* storage unavailable: keep it in memory only */
      }
    },
    [key],
  );
  return [value, set];
}

const MODE_TABS: { id: EditorMode; label: string; icon: ReactNode }[] = [
  { id: 'zone', label: 'Zonas', icon: <GalleryVerticalEnd /> },
  { id: 'overview', label: 'Mapa general', icon: <MapIcon /> },
  { id: 'grid', label: 'Cuadrícula de zonas', icon: <Grid3x3 /> },
  { id: 'rules', label: 'Reglas', icon: <ScrollText /> },
  { id: 'rollers', label: 'Ruletas y dados', icon: <Dices /> },
  { id: 'settings', label: 'Ajustes', icon: <Settings /> },
];

type RightTab = 'properties' | 'layers' | 'levels' | 'zone' | 'library';

const RIGHT_TABS: { id: RightTab; label: string; icon: ReactNode }[] = [
  { id: 'properties', label: 'Propiedades', icon: <SlidersHorizontal /> },
  { id: 'layers', label: 'Capas', icon: <Layers /> },
  { id: 'levels', label: 'Niveles', icon: <Building2 /> },
  { id: 'zone', label: 'Zona', icon: <MapIcon /> },
  { id: 'library', label: 'Biblioteca', icon: <Library /> },
];

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function EditorTopBar({ campaign }: { campaign: Campaign }) {
  const navigate = useNavigate();
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => !!s.currentZoneId && (s.history[s.currentZoneId]?.past.length ?? 0) > 0);
  const canRedo = useEditorStore((s) => !!s.currentZoneId && (s.history[s.currentZoneId]?.future.length ?? 0) > 0);
  const { status } = useSaveStatus();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (useEditorStore.getState().saveState === 'error') {
        const ok = await retrySave();
        if (ok) toast.success('Cambios guardados');
        else toast.error('No se pudieron guardar los cambios', { description: useEditorStore.getState().saveError ?? undefined });
        return;
      }
      const nothingPending = !hasUnsavedWork();
      await useEditorStore.getState().saveNow();
      if (useEditorStore.getState().saveState === 'error') {
        toast.error('No se pudieron guardar los cambios', { description: useEditorStore.getState().saveError ?? undefined });
      } else {
        toast.success(nothingPending ? 'Todo está guardado' : 'Cambios guardados', { duration: 1800 });
      }
    } finally {
      setSaving(false);
    }
  };

  const tabs: TabItem<EditorMode>[] = MODE_TABS.map((t) => ({
    id: t.id,
    icon: t.icon,
    title: t.label,
    label: <span className={clsx(mode === t.id ? 'inline' : 'hidden xl:inline')}>{t.label}</span>,
  }));

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-ink-600/80 bg-ink-900/95 px-2 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.9)] backdrop-blur sm:px-3">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-600/50 to-transparent"
      />
      <IconButton icon={<ArrowLeft />} title="Volver a las campañas" size="sm" onClick={() => navigate('/campanas')} />
      <D20Icon size={26} className="hidden shrink-0 drop-shadow-[0_0_8px_rgba(233,192,99,0.45)] sm:block" />
      <div className="flex min-w-0 max-w-[15rem] flex-col leading-none lg:max-w-[18rem]">
        <span className="pl-0.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-gold-500/80">Editor de campaña</span>
        <InlineEdit
          value={campaign.name}
          onCommit={(name) => void saveCampaign({ name })}
          label="Nombre de la campaña"
          maxLength={80}
          className="-ml-1 font-display text-sm font-semibold tracking-wide text-parchment-50"
        />
      </div>
      <span className="divider-vertical hidden md:block" aria-hidden />
      <div className="flex min-w-0 flex-1 justify-center">
        <Tabs<EditorMode> items={tabs} value={mode} onChange={setMode} variant="pills" size="sm" aria-label="Secciones del editor" />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <SaveIndicator />
        {mode === 'zone' && (
          <div className="hidden items-center sm:flex">
            <IconButton icon={<Undo2 />} title={`Deshacer (${formatHotkey('mod+z')})`} size="sm" disabled={!canUndo} onClick={undo} />
            <IconButton icon={<Redo2 />} title={`Rehacer (${formatHotkey('mod+shift+z')})`} size="sm" disabled={!canRedo} onClick={redo} />
          </div>
        )}
        <Button
          variant="primary"
          size="sm"
          icon={<Save />}
          loading={saving || status === 'saving'}
          onClick={() => void save()}
          title={`Guardar ahora (${formatHotkey('mod+s')})`}
        >
          <span className="hidden md:inline">Guardar</span>
        </Button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Zone workspace (slides · toolbar + canvas · side panel)
// ---------------------------------------------------------------------------

function CollapsedRail({ side, label, onOpen }: { side: 'left' | 'right'; label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Mostrar ${label.toLowerCase()}`}
      aria-label={`Mostrar ${label.toLowerCase()}`}
      className={clsx(
        'group flex w-9 shrink-0 flex-col items-center gap-3 bg-ink-900/85 py-3 text-parchment-300 transition hover:bg-ink-800 hover:text-gold-200',
        side === 'left' ? 'border-r border-ink-600/80' : 'border-l border-ink-600/80',
      )}
    >
      {side === 'left' ? <PanelLeftOpen className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] [writing-mode:vertical-rl]">{label}</span>
    </button>
  );
}

function SidePanel({ onCollapse }: { onCollapse: () => void }) {
  const [tab, setTab] = useState<RightTab>('properties');
  const [libraryVisited, setLibraryVisited] = useState(false);
  const selectionCount = useEditorStore((s) => s.selection.length);
  const levelCount = useEditorStore((s) => s.zones.find((z) => z.id === s.currentZoneId)?.levels.length ?? 0);
  const prevCount = useRef(selectionCount);

  // Selecting something on the map brings the properties forward (except while browsing the library).
  useEffect(() => {
    if (prevCount.current === 0 && selectionCount > 0) setTab((t) => (t === 'library' ? t : 'properties'));
    prevCount.current = selectionCount;
  }, [selectionCount]);

  useEffect(() => {
    if (tab === 'library') setLibraryVisited(true);
  }, [tab]);

  const items: TabItem<RightTab>[] = RIGHT_TABS.map((t) => ({
    id: t.id,
    icon: t.icon,
    title: t.label,
    label: t.id === tab ? t.label : <span className="sr-only">{t.label}</span>,
    badge: t.id === 'properties' && selectionCount > 0 ? selectionCount : t.id === 'levels' && levelCount > 1 ? levelCount : undefined,
  }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-ink-700/80 px-1.5 pt-1">
        <Tabs<RightTab> items={items} value={tab} onChange={setTab} size="sm" className="min-w-0 flex-1 border-b-0" aria-label="Paneles del editor" />
        <IconButton icon={<PanelRightClose />} title="Ocultar panel" size="xs" onClick={onCollapse} className="mb-1" />
      </div>
      {tab !== 'library' && (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {tab === 'properties' && <PropertiesPanel />}
          {tab === 'layers' && <LayersPanel />}
          {tab === 'levels' && <LevelsPanel />}
          {tab === 'zone' && <ZoneSettingsPanel />}
        </div>
      )}
      {libraryVisited && (
        <div className={clsx('min-h-0 flex-1', tab !== 'library' && 'hidden')}>
          <EditorLibraryPanel />
        </div>
      )}
    </div>
  );
}

function FirstZoneCta() {
  const actions = useZoneActions();
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  return (
    <div className="scroll-thin flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="panel relative max-w-xl overflow-hidden px-8 py-10 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(212,166,63,0.16),transparent_65%)]"
        />
        <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 animate-glow-pulse rounded-full bg-gold-500/10 blur-xl" aria-hidden />
          <D20Icon size={64} className="relative animate-float" />
        </div>
        <h2 className="title-epic relative text-2xl sm:text-3xl">Tu mundo te espera</h2>
        <p className="relative mx-auto mt-3 max-w-md text-sm leading-relaxed text-parchment-300">
          Las zonas son las «diapositivas» de tu campaña: bosques, ciudades, mazmorras… Cada una puede tener varios niveles, paredes que
          bloquean la visión, luces, niebla y transiciones a otras zonas.
        </p>
        <div className="relative mt-7 flex flex-col items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            epic
            icon={<Plus />}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await actions.createBlank(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            Crear la primera zona
          </Button>
          <Button variant="ghost" icon={<LayoutTemplate />} onClick={() => setPicker(true)} disabled={busy}>
            o empezar desde una plantilla
          </Button>
        </div>
      </div>
      <TemplatePickerModal open={picker} onClose={() => setPicker(false)} />
    </div>
  );
}

function ZoneWorkspace() {
  const hasZones = useEditorStore((s) => s.zones.length > 0);
  const [leftOpen, setLeftOpen] = usePersistentFlag('wailers.editor.slidesOpen', true);
  const [rightOpen, setRightOpen] = usePersistentFlag('wailers.editor.panelOpen', true);

  return (
    <div className="flex h-full min-h-0">
      {leftOpen ? (
        <aside className="w-56 shrink-0 border-r border-ink-600/80 bg-ink-900/85 xl:w-60" aria-label="Zonas">
          <SlidesPanel onCollapse={() => setLeftOpen(false)} />
        </aside>
      ) : (
        <CollapsedRail side="left" label="Zonas" onOpen={() => setLeftOpen(true)} />
      )}
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Lienzo">
        {hasZones ? (
          <>
            <EditorToolbar />
            <div className="relative min-h-0 flex-1 overflow-hidden bg-ink-950">
              <EditorCanvas />
            </div>
          </>
        ) : (
          <FirstZoneCta />
        )}
      </section>
      {hasZones &&
        (rightOpen ? (
          <aside className="w-72 shrink-0 border-l border-ink-600/80 bg-ink-900/85 xl:w-80" aria-label="Panel lateral">
            <SidePanel onCollapse={() => setRightOpen(false)} />
          </aside>
        ) : (
          <CollapsedRail side="right" label="Propiedades" onOpen={() => setRightOpen(true)} />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Other modes
// ---------------------------------------------------------------------------

function ScrollPage({ children }: { children: ReactNode }) {
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}

function ModeContent({ mode, campaign, zones }: { mode: Exclude<EditorMode, 'zone'>; campaign: Campaign; zones: Zone[] }) {
  const selectZone = useEditorStore((s) => s.selectZone);
  const updateZone = useEditorStore((s) => s.updateZone);

  const applyGrid = (updates: { id: string; gridPos: Zone['gridPos']; neighbors: ZoneNeighbors }[]) => {
    if (updates.length === 0) return;
    for (const u of updates) {
      // Not undoable per zone: the grid is edited as a whole across many zones.
      updateZone(
        u.id,
        (d) => {
          d.gridPos = u.gridPos;
          d.neighbors = u.neighbors;
        },
        { history: false },
      );
    }
    void useEditorStore
      .getState()
      .saveNow()
      .then(() => {
        if (useEditorStore.getState().saveState === 'error') toast.error('No se pudo guardar la cuadrícula de zonas');
      });
  };

  switch (mode) {
    case 'overview':
      return (
        <div className="relative h-full min-h-0 overflow-auto">
          <OverviewEditor
            campaign={campaign}
            zones={zones}
            onChange={(overview) => void saveCampaign({ overview })}
            onOpenZone={(zoneId) => selectZone(zoneId)}
          />
        </div>
      );
    case 'grid':
      return (
        <div className="relative h-full min-h-0 overflow-auto">
          <ZoneGridEditor zones={zones} onApply={applyGrid} onOpenZone={(zoneId) => selectZone(zoneId)} />
        </div>
      );
    case 'rules':
      return (
        <ScrollPage>
          <RulesEditor rules={campaign.rules} onChange={(rules) => void saveCampaign({ rules })} />
        </ScrollPage>
      );
    case 'rollers':
      return (
        <ScrollPage>
          <RollerManager campaignId={campaign.id} />
        </ScrollPage>
      );
    case 'settings':
      return (
        <ScrollPage>
          <CampaignSettingsPanel campaign={campaign} zones={zones} onChange={(patch) => void saveCampaign(patch)} />
        </ScrollPage>
      );
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** Route /campanas/:campaignId/editor — full-screen campaign editor. */
export default function EditorPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const load = useEditorStore((s) => s.load);
  const loading = useEditorStore((s) => s.loading);
  const loadError = useEditorStore((s) => s.loadError);
  const loadedId = useEditorStore((s) => s.campaignId);
  const campaign = useEditorStore((s) => s.campaign);
  const zones = useEditorStore((s) => s.zones);
  const mode = useEditorStore((s) => s.mode);

  const ready = !!campaignId && !loading && !loadError && loadedId === campaignId && campaign?.id === campaignId;

  useEffect(() => {
    if (!campaignId) return;
    const s = useEditorStore.getState();
    s.setMode('zone');
    s.setTool('select');
    void load(campaignId);
    return () => {
      // Leaving the editor inside the app: flush pending zone edits in the background.
      stopSoundPreview();
      void useEditorStore.getState().saveNow();
    };
  }, [campaignId, load]);

  // Closing / reloading the tab: try to save and warn while anything is unsaved.
  useEffect(() => {
    const flush = () => {
      if (useEditorStore.getState().dirtyZoneIds.length > 0) void useEditorStore.getState().saveNow();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedWork()) return;
      flush();
      e.preventDefault();
      e.returnValue = '';
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!ready || !campaign) return;
    const previous = document.title;
    document.title = `${campaign.name} · Editor · ${APP_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [ready, campaign?.name]);

  useEditorHotkeys({ enabled: ready && mode === 'zone' });

  if (loadError && !loading) {
    const notFound = /no encontr|not found|404/i.test(loadError);
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="panel max-w-lg">
          <EmptyState
            icon={<TriangleAlert />}
            title={notFound ? 'Esta campaña no existe' : 'No se pudo abrir la campaña'}
            description={
              <>
                {notFound ? 'Puede que se haya eliminado. Vuelve a la lista de campañas.' : 'Comprueba la conexión con el servidor y vuelve a intentarlo.'}
                <span className="mt-2 block font-mono text-[11px] text-parchment-400">{loadError}</span>
              </>
            }
            action={
              <>
                {!notFound && campaignId && (
                  <Button variant="primary" icon={<RefreshCw />} onClick={() => void load(campaignId)}>
                    Reintentar
                  </Button>
                )}
                <Button variant="ghost" icon={<ArrowLeft />} onClick={() => navigate('/campanas')}>
                  Volver a campañas
                </Button>
              </>
            }
          />
        </div>
      </div>
    );
  }

  if (!ready || !campaign) return <FullScreenLoader inline label="Abriendo el editor…" className="h-full" />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <EditorTopBar campaign={campaign} />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        {mode === 'zone' ? <ZoneWorkspace /> : <ModeContent mode={mode} campaign={campaign} zones={zones} />}
      </main>
    </div>
  );
}
