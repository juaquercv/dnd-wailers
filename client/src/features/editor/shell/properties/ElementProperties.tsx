import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  BookOpen,
  Circle,
  ExternalLink,
  EyeOff,
  Link2,
  Link2Off,
  Lock,
  Maximize2,
  Move,
  Palette,
  Settings2,
  Square,
} from 'lucide-react';
import {
  ENTRY_KIND_LABELS,
  LAYER_IDS,
  LAYER_LABELS,
  type ImageElement,
  type LayerId,
  type LibraryEntry,
  type MarkerElement,
  type NoteElement,
  type PathElement,
  type SceneElement,
  type ShapeElement,
  type TextElement,
  type TokenElement,
  type TransitionElement,
  type TransitionType,
  type Zone,
  type ZoneLevel,
} from '@wailers/shared';
import { api } from '../../../../api/http';
import {
  Badge,
  Button,
  ImageUpload,
  NumberInput,
  Select,
  Slider,
  Spinner,
  TextArea,
  TextInput,
  Toggle,
  toast,
} from '../../../../components/ui';
import { useEditorStore } from '../../editorStore';
import { ColorField } from '../ColorSwatch';
import { FieldGrid, Segmented, StatLine } from '../controls';
import { EmojiGrid } from '../EmojiPicker';
import { ELEMENT_TYPE_INFO, elementTitle, NOTE_PALETTE, TRANSITION_TYPE_ICONS, TRANSITION_TYPE_LABELS, TRANSITION_TYPES } from '../labels';
import { readImageSize } from '../levelUtils';
import { PanelSection } from '../PanelSection';
import { deleteItems, fieldKey, PropertyHeader } from './common';
import { TransitionTargetEditor } from './TransitionTargetEditor';

const LAYER_OPTIONS = LAYER_IDS.map((id) => ({ value: id, label: LAYER_LABELS[id] }));
const TRANSITION_OPTIONS = TRANSITION_TYPES.map((t) => ({ value: t, label: `${TRANSITION_TYPE_ICONS[t]} ${TRANSITION_TYPE_LABELS[t]}` }));
const percent = (v: number) => `${Math.round(v * 100)}%`;

type Updater<T extends SceneElement> = (patch: Partial<T>, field?: string) => void;

function useUpdater<T extends SceneElement>(el: T): Updater<T> {
  const updateElement = useEditorStore((s) => s.updateElement);
  return (patch, field) => updateElement(el.id, patch, field ? fieldKey(el.id, field) : undefined);
}

function SizeFields({
  width,
  height,
  onChange,
  min = 4,
  keepRatio,
}: {
  width: number;
  height: number;
  onChange: (patch: { width?: number; height?: number }, field: string) => void;
  min?: number;
  keepRatio?: boolean;
}) {
  const ratio = height !== 0 ? width / height : 1;
  return (
    <FieldGrid>
      <NumberInput
        label="Ancho"
        size="sm"
        integer
        min={min}
        max={20000}
        suffix="px"
        value={Math.round(width)}
        onChange={(w) => onChange(keepRatio && ratio ? { width: w, height: Math.max(min, Math.round(w / ratio)) } : { width: w }, 'width')}
      />
      <NumberInput
        label="Alto"
        size="sm"
        integer
        min={min}
        max={20000}
        suffix="px"
        value={Math.round(height)}
        onChange={(h) => onChange(keepRatio && ratio ? { height: h, width: Math.max(min, Math.round(h * ratio)) } : { height: h }, 'height')}
      />
    </FieldGrid>
  );
}

// ---------------------------------------------------------------------------
// Type-specific editors
// ---------------------------------------------------------------------------

function ImageFields({ el }: { el: ImageElement }) {
  const update = useUpdater(el);
  const [keepRatio, setKeepRatio] = useState(true);
  const [busy, setBusy] = useState(false);

  const replace = async (url: string | null) => {
    if (!url) {
      toast.info('Para quitar la imagen, elimina el elemento (Supr).');
      return;
    }
    setBusy(true);
    const size = await readImageSize(url);
    setBusy(false);
    if (size) {
      // Keep the current width, adopt the new picture's proportions.
      const height = Math.max(4, Math.round((el.width * size.height) / size.width));
      update({ url, height });
    } else {
      update({ url });
    }
  };

  const naturalSize = async () => {
    setBusy(true);
    const size = await readImageSize(el.url);
    setBusy(false);
    if (size) update({ width: size.width, height: size.height });
    else toast.warning('No se pudo leer el tamaño original de la imagen');
  };

  return (
    <>
      <ImageUpload value={el.url} onChange={(url) => void replace(url)} fit="contain" height={110} disabled={busy} />
      <SizeFields width={el.width} height={el.height} keepRatio={keepRatio} onChange={(p, f) => update(p, f)} />
      <div className="flex items-center justify-between gap-2">
        <Toggle size="sm" checked={keepRatio} onChange={setKeepRatio} label="Mantener proporción" />
        <Button size="sm" variant="ghost" icon={<Maximize2 />} loading={busy} onClick={() => void naturalSize()}>
          Original
        </Button>
      </div>
      <Slider label="Opacidad" value={el.opacity} onChange={(opacity) => update({ opacity }, 'opacity')} min={0.05} max={1} step={0.05} formatValue={percent} />
    </>
  );
}

function ShapeFields({ el }: { el: ShapeElement }) {
  const update = useUpdater(el);
  return (
    <>
      <Segmented<ShapeElement['shape']>
        value={el.shape}
        onChange={(shape) => update({ shape })}
        fill
        aria-label="Forma"
        options={[
          { value: 'rect', label: 'Rectángulo', icon: <Square aria-hidden /> },
          { value: 'ellipse', label: 'Elipse', icon: <Circle aria-hidden /> },
        ]}
      />
      <SizeFields width={el.width} height={el.height} onChange={(p, f) => update(p, f)} />
      <FieldGrid>
        <ColorField label="Relleno" value={el.fill} onChange={(fill) => update({ fill }, 'fill')} />
        <ColorField label="Borde" value={el.stroke} onChange={(stroke) => update({ stroke }, 'stroke')} />
      </FieldGrid>
      <Slider
        label="Grosor del borde"
        value={el.strokeWidth}
        onChange={(strokeWidth) => update({ strokeWidth }, 'strokeWidth')}
        min={0}
        max={40}
        step={1}
        formatValue={(v) => `${v}px`}
      />
      <Slider label="Opacidad" value={el.opacity} onChange={(opacity) => update({ opacity }, 'opacity')} min={0.05} max={1} step={0.05} formatValue={percent} />
    </>
  );
}

function PathFields({ el }: { el: PathElement }) {
  const update = useUpdater(el);
  const vertices = Math.floor(el.points.length / 2);
  return (
    <>
      <StatLine>{vertices} puntos</StatLine>
      <ColorField label="Color del trazo" value={el.stroke} onChange={(stroke) => update({ stroke }, 'stroke')} />
      <Slider
        label="Grosor"
        value={el.strokeWidth}
        onChange={(strokeWidth) => update({ strokeWidth }, 'strokeWidth')}
        min={1}
        max={40}
        step={1}
        formatValue={(v) => `${v}px`}
      />
      <Slider label="Opacidad" value={el.opacity} onChange={(opacity) => update({ opacity }, 'opacity')} min={0.05} max={1} step={0.05} formatValue={percent} />
      <div className="flex flex-col gap-2 rounded-lg border border-ink-700 bg-ink-950/40 p-2">
        <Toggle size="sm" checked={el.closed} onChange={(closed) => update({ closed })} label="Cerrar la figura" />
        <Toggle
          size="sm"
          checked={el.fill !== null}
          onChange={(on) => update({ fill: on ? el.fill ?? el.stroke : null, closed: on ? true : el.closed })}
          label="Rellenar"
        />
        {el.fill !== null && <ColorField label="Relleno" value={el.fill} onChange={(fill) => update({ fill }, 'fill')} />}
      </div>
    </>
  );
}

function TextFields({ el }: { el: TextElement }) {
  const update = useUpdater(el);
  return (
    <>
      <TextArea label="Texto" value={el.text} onValueChange={(text) => update({ text }, 'text')} rows={3} autoResize maxRows={10} />
      <Slider
        label="Tamaño de letra"
        value={el.fontSize}
        onChange={(fontSize) => update({ fontSize }, 'fontSize')}
        min={8}
        max={240}
        step={1}
        formatValue={(v) => `${v}px`}
      />
      <ColorField label="Color" value={el.color} onChange={(color) => update({ color }, 'color')} />
    </>
  );
}

function MarkerFields({ el }: { el: MarkerElement }) {
  const update = useUpdater(el);
  return (
    <>
      <TextInput label="Etiqueta" size="sm" value={el.label} maxLength={60} onValueChange={(label) => update({ label }, 'label')} placeholder="Taberna del Grifo…" />
      <ColorField label="Color" value={el.color} onChange={(color) => update({ color }, 'color')} />
      <div>
        <span className="label">Icono</span>
        <EmojiGrid value={el.icon} onChange={(icon) => update({ icon })} />
      </div>
    </>
  );
}

const entryCache = new Map<string, Promise<LibraryEntry>>();

function useLibraryEntry(id: string): { entry: LibraryEntry | null; status: 'loading' | 'ready' | 'missing' } {
  const [state, setState] = useState<{ id: string; entry: LibraryEntry | null; status: 'loading' | 'ready' | 'missing' }>({
    id,
    entry: null,
    status: 'loading',
  });
  useEffect(() => {
    let alive = true;
    setState({ id, entry: null, status: 'loading' });
    let p = entryCache.get(id);
    if (!p) {
      p = api.library.get(id);
      entryCache.set(id, p);
      p.catch(() => entryCache.delete(id));
    }
    p.then((entry) => alive && setState({ id, entry, status: 'ready' })).catch(() => alive && setState({ id, entry: null, status: 'missing' }));
    return () => {
      alive = false;
    };
  }, [id]);
  return state.id === id ? state : { entry: null, status: 'loading' };
}

function TokenFields({ el }: { el: TokenElement }) {
  const update = useUpdater(el);
  const { entry, status } = useLibraryEntry(el.entryId);
  return (
    <>
      <div className="flex items-center gap-2.5 rounded-lg border border-ink-600 bg-ink-950/50 p-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gold-700/60 bg-ink-800">
          {el.imageUrl || entry?.imageUrl ? (
            <img src={el.imageUrl ?? entry?.imageUrl ?? ''} alt="" className="h-full w-full object-cover" />
          ) : (
            <BookOpen className="h-4 w-4 text-gold-400" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-parchment-400">
            {ENTRY_KIND_LABELS[el.entryKind].singular} de la biblioteca
          </div>
          {status === 'loading' ? (
            <Spinner size="xs" label="Cargando…" showLabel />
          ) : status === 'missing' ? (
            <div className="flex items-center gap-1 text-xs text-blood-300">
              <Link2Off className="h-3 w-3" aria-hidden />
              Ya no está en la biblioteca
            </div>
          ) : (
            <div className="flex items-center gap-1 truncate text-sm font-semibold text-parchment-50">
              <Link2 className="h-3 w-3 shrink-0 text-gold-500" aria-hidden />
              <span className="truncate">{entry?.name}</span>
            </div>
          )}
        </div>
        {status === 'ready' && (
          <a
            href={`/biblioteca/${el.entryKind}`}
            target="_blank"
            rel="noreferrer"
            title="Abrir la biblioteca en otra pestaña"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-parchment-300 transition hover:bg-ink-700 hover:text-gold-200"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      <TextInput
        label="Etiqueta"
        size="sm"
        value={el.label}
        maxLength={60}
        placeholder={entry?.name ?? 'Nombre visible'}
        onValueChange={(label) => update({ label }, 'label')}
      />
      <NumberInput
        label="Tamaño (casillas de diámetro)"
        size="sm"
        min={0.25}
        max={12}
        step={0.5}
        value={el.cells}
        onChange={(cells) => update({ cells }, 'cells')}
      />
      <Toggle
        size="sm"
        checked={el.startHidden}
        onChange={(startHidden) => update({ startHidden })}
        label="Empieza oculta"
        description="La ficha viva aparece oculta para los jugadores hasta que el DM la muestre."
      />
      <ImageUpload
        label="Retrato (opcional)"
        value={el.imageUrl}
        onChange={(imageUrl) => update({ imageUrl })}
        aspect="square"
        round
        height={88}
        className="w-[88px]"
      />
      <StatLine>Al cargar la zona en una partida se convierte en una ficha viva con los datos de la biblioteca.</StatLine>
    </>
  );
}

function TransitionFields({ el, zone, level }: { el: TransitionElement; zone: Zone; level: ZoneLevel }) {
  const update = useUpdater(el);
  return (
    <>
      <Select<TransitionType>
        label="Tipo"
        size="sm"
        value={el.transitionType}
        options={TRANSITION_OPTIONS}
        onChange={(transitionType) => update({ transitionType })}
      />
      <TextInput
        label="Etiqueta"
        size="sm"
        value={el.label}
        maxLength={60}
        placeholder={TRANSITION_TYPE_LABELS[el.transitionType]}
        onValueChange={(label) => update({ label }, 'label')}
      />
      <SizeFields width={el.width} height={el.height} min={8} onChange={(p, f) => update(p, f)} />
      <div className="rounded-lg border border-gold-700/40 bg-gold-500/[0.04] p-2.5">
        <div className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-300">Destino</div>
        <TransitionTargetEditor el={el} zone={zone} level={level} />
      </div>
    </>
  );
}

function NoteFields({ el }: { el: NoteElement }) {
  const update = useUpdater(el);
  return (
    <>
      <TextArea
        label="Nota"
        value={el.text}
        onValueChange={(text) => update({ text }, 'text')}
        rows={4}
        autoResize
        maxRows={14}
        placeholder="Trampa en el tercer escalón…"
      />
      <ColorField label="Color" value={el.color} palette={NOTE_PALETTE} onChange={(color) => update({ color }, 'color')} />
      <StatLine>Las notas del DM nunca se envían a los jugadores.</StatLine>
    </>
  );
}

function TypeFields({ el, zone, level }: { el: SceneElement; zone: Zone; level: ZoneLevel }): ReactNode {
  switch (el.type) {
    case 'image':
      return <ImageFields el={el} />;
    case 'shape':
      return <ShapeFields el={el} />;
    case 'path':
      return <PathFields el={el} />;
    case 'text':
      return <TextFields el={el} />;
    case 'marker':
      return <MarkerFields el={el} />;
    case 'token':
      return <TokenFields el={el} />;
    case 'transition':
      return <TransitionFields el={el} zone={zone} level={level} />;
    case 'note':
      return <NoteFields el={el} />;
  }
}

// ---------------------------------------------------------------------------
// Element panel
// ---------------------------------------------------------------------------

/** Full property editor of one scene element. */
export function ElementProperties({ el, zone, level }: { el: SceneElement; zone: Zone; level: ZoneLevel }) {
  const updateElement = useEditorStore((s) => s.updateElement);
  const updateLevel = useEditorStore((s) => s.updateLevel);
  const duplicateSelection = useEditorStore((s) => s.duplicateSelection);
  const setSelection = useEditorStore((s) => s.setSelection);
  const layerLocked = useEditorStore((s) => s.layerLocked);
  const info = ELEMENT_TYPE_INFO[el.type];

  const update = (patch: Partial<SceneElement>, field?: string) =>
    updateElement(el.id, patch, field ? fieldKey(el.id, field) : undefined);

  const restack = (where: 'front' | 'back') =>
    updateLevel((l) => {
      const i = l.elements.findIndex((e) => e.id === el.id);
      if (i < 0) return;
      const [item] = l.elements.splice(i, 1);
      if (!item) return;
      if (where === 'front') l.elements.push(item);
      else l.elements.unshift(item);
    });

  const index = level.elements.findIndex((e) => e.id === el.id);
  const sameLayer = level.elements.filter((e) => e.layer === el.layer);
  const isFront = sameLayer[sameLayer.length - 1]?.id === el.id;
  const isBack = sameLayer[0]?.id === el.id;

  return (
    <div className="flex flex-col">
      <PropertyHeader
        icon={info.icon}
        kindLabel={info.label}
        title={elementTitle(el)}
        meta={
          <>
            <Badge size="xs" tone="outline">
              {LAYER_LABELS[el.layer] ?? el.layer}
            </Badge>
            {el.hidden && (
              <Badge size="xs" tone="arcane" icon={<EyeOff />}>
                Oculto
              </Badge>
            )}
            {(el.locked || layerLocked[el.layer]) && (
              <Badge size="xs" tone="gold" icon={<Lock />}>
                {el.locked ? 'Bloqueado' : 'Capa bloqueada'}
              </Badge>
            )}
          </>
        }
        onDuplicate={() => {
          setSelection([{ kind: 'element', id: el.id }]);
          duplicateSelection();
        }}
        onDelete={() => deleteItems([{ kind: 'element', id: el.id }])}
      />

      <PanelSection id={`el-type-${el.type}`} title={info.label} icon={<Palette />}>
        <TypeFields el={el} zone={zone} level={level} />
      </PanelSection>

      <PanelSection id="el-position" title="Posición" icon={<Move />}>
        <FieldGrid cols={3}>
          <NumberInput label="X" size="sm" value={Math.round(el.x)} onChange={(x) => update({ x }, 'x')} integer />
          <NumberInput label="Y" size="sm" value={Math.round(el.y)} onChange={(y) => update({ y }, 'y')} integer />
          <NumberInput
            label="Giro"
            size="sm"
            min={-360}
            max={360}
            suffix="°"
            value={Math.round(el.rotation)}
            onChange={(rotation) => update({ rotation }, 'rotation')}
            integer
          />
        </FieldGrid>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" icon={<ArrowUpToLine />} disabled={isFront || index < 0} onClick={() => restack('front')}>
            Al frente
          </Button>
          <Button size="sm" variant="ghost" icon={<ArrowDownToLine />} disabled={isBack || index < 0} onClick={() => restack('back')}>
            Al fondo
          </Button>
        </div>
      </PanelSection>

      <PanelSection id="el-general" title="General" icon={<Settings2 />}>
        <TextInput
          label="Nombre interno"
          size="sm"
          value={el.name}
          maxLength={80}
          placeholder="Para reconocerlo en el editor"
          onValueChange={(name) => update({ name }, 'name')}
        />
        <Select<LayerId> label="Capa" size="sm" value={el.layer} options={LAYER_OPTIONS} onChange={(layer) => update({ layer })} />
        <div className={clsx('flex flex-col gap-2 rounded-lg border p-2', el.hidden ? 'border-arcane-600/50 bg-arcane-500/5' : 'border-ink-700 bg-ink-950/40')}>
          <Toggle
            size="sm"
            checked={el.hidden}
            onChange={(hidden) => update({ hidden })}
            label="Oculto para jugadores"
            description="Solo el DM lo ve, semitransparente."
          />
          <Toggle
            size="sm"
            checked={el.locked}
            onChange={(locked) => update({ locked })}
            label="Bloqueado"
            description="Evita moverlo o transformarlo en el mapa por accidente."
          />
        </div>
      </PanelSection>
    </div>
  );
}
