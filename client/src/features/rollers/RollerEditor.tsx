import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Dices, Disc3, Palette, Plus, RotateCw, Save, Scale, Trash2 } from 'lucide-react';
import {
  normalizeDeg,
  parseFormula,
  pickWeighted,
  segmentProbabilities,
  targetRotation,
  type Roller,
  type RollerKind,
  type RouletteSegment,
} from '@wailers/shared';
import { api } from '../../api/http';
import { Button } from '../../components/ui/Button';
import { ColorPicker } from '../../components/ui/ColorPicker';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { IconButton } from '../../components/ui/IconButton';
import { Kbd } from '../../components/ui/Kbd';
import { Modal } from '../../components/ui/Modal';
import { NumberInput } from '../../components/ui/NumberInput';
import { TagInput } from '../../components/ui/TagInput';
import { TextArea } from '../../components/ui/TextArea';
import { TextInput } from '../../components/ui/TextInput';
import { Toggle } from '../../components/ui/Toggle';
import { toast } from '../../components/ui/toast';
import { useHotkeys } from '../../lib/hotkeys';
import { formatNumber } from '../../lib/format';
import { useSettingsStore } from '../../stores/settings';
import { uiSounds } from '../audio/uiSounds';
import { DieGlyph } from '../dice/DieShapes';
import { FORMULA_EXAMPLES } from '../dice/diceUtils';
import { useThrottled } from '../dice/diceHooks';
import { RouletteWheel } from '../dice/RouletteWheel';
import { Segmented } from '../dice/Segmented';
import {
  draftFromRoller,
  draftSignature,
  draftToInput,
  equalizeWeights,
  hasErrors,
  MAX_FACES,
  MAX_SEGMENTS,
  moveItem,
  newSegment,
  spreadColors,
  validateDraft,
  type RollerDraft,
} from './rollerUtils';

export interface RollerEditorProps {
  open: boolean;
  campaignId: string;
  /** null = create a new roller of `initialKind`. */
  roller: Roller | null;
  initialKind: RollerKind;
  /** Tags already used in the campaign (autocomplete). */
  tagSuggestions: string[];
  onClose: () => void;
  onSaved: (roller: Roller) => void;
}

/** Create/edit modal for a campaign roulette or custom die. Remount (key) per roller. */
export function RollerEditor(props: RollerEditorProps) {
  if (!props.open) return null;
  return <RollerEditorInner {...props} />;
}

function pct(p: number): string {
  return `${formatNumber(p * 100, p > 0 && p < 0.1 ? 1 : 0)} %`;
}

function formulaRange(formula: string): { min: number; max: number; avg: number } | null {
  try {
    const parsed = parseFormula(formula);
    let min = parsed.modifier;
    let max = parsed.modifier;
    let avg = parsed.modifier;
    for (const t of parsed.terms) {
      const kept = t.keep ? t.keep.n : t.count;
      if (t.sign > 0) {
        min += kept;
        max += kept * t.sides;
      } else {
        min -= kept * t.sides;
        max -= kept;
      }
      avg += t.sign * kept * ((t.sides + 1) / 2);
    }
    return { min, max, avg };
  } catch {
    return null;
  }
}

function RollerEditorInner({ campaignId, roller, initialKind, tagSuggestions, onClose, onSaved }: RollerEditorProps) {
  const confirm = useConfirm();
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const [draft, setDraft] = useState<RollerDraft>(() => draftFromRoller(roller, initialKind));
  const initialSignature = useRef(draftSignature(draft));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<RouletteSegment | null>(null);
  const pendingResult = useRef<RouletteSegment | null>(null);
  const tick = useThrottled(() => uiSounds.tick(), 40);

  const errors = useMemo(() => validateDraft(draft), [draft]);
  const visibleErrors = showErrors ? errors : {};
  const probabilities = useMemo(() => segmentProbabilities(draft.segments), [draft.segments]);
  const dirty = draftSignature(draft) !== initialSignature.current;
  const isNew = roller === null;

  const patch = (p: Partial<RollerDraft>) => setDraft((d) => ({ ...d, ...p }));
  const patchSegment = (id: string, p: Partial<RouletteSegment>) =>
    setDraft((d) => ({ ...d, segments: d.segments.map((s) => (s.id === id ? { ...s, ...p } : s)) }));

  const requestClose = async () => {
    if (saving) return;
    if (dirty) {
      const ok = await confirm({
        title: 'Descartar cambios',
        message: 'Tienes cambios sin guardar. ¿Quieres descartarlos?',
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
    if (hasErrors(errors)) {
      toast.error('Revisa los campos marcados en rojo');
      return;
    }
    setSaving(true);
    try {
      const input = draftToInput(draft);
      const saved = roller ? await api.rollers.update(roller.id, input) : await api.campaigns.createRoller(campaignId, input);
      toast.success(roller ? 'Cambios guardados' : draft.kind === 'roulette' ? 'Ruleta creada' : 'Dado creado');
      initialSignature.current = draftSignature(draft);
      onSaved(saved);
    } catch (err) {
      toast.fromError(err, 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  useHotkeys({ 'mod+enter': () => void save() }, { allowInInputs: true });

  const setKind = (kind: RollerKind) => {
    setDraft((d) => ({
      ...d,
      kind,
      segments: kind === 'roulette' && d.segments.length === 0 ? Array.from({ length: 4 }, (_, i) => newSegment(i, 4)) : d.segments,
    }));
  };

  const addSegment = () =>
    setDraft((d) => (d.segments.length >= MAX_SEGMENTS ? d : { ...d, segments: [...d.segments, newSegment(d.segments.length, d.segments.length + 1)] }));

  const testSpin = () => {
    if (spinning) return;
    let winner: RouletteSegment;
    try {
      winner = pickWeighted(draft.segments, Math.random);
    } catch (err) {
      toast.fromError(err, 'La ruleta no tiene segmentos válidos');
      return;
    }
    const fullTurns = rotation - normalizeDeg(rotation);
    const next = fullTurns + 360 + targetRotation(draft.segments, winner.id, Math.random(), reducedMotion ? 2 : 5);
    pendingResult.current = winner;
    setSpinResult(null);
    setSpinning(true);
    uiSounds.diceShake();
    setRotation(next);
  };

  const spinMs = reducedMotion ? 700 : 3600;

  const range = draft.kind === 'dice' && draft.diceMode === 'formula' ? formulaRange(draft.formula) : null;
  const mainSides = useMemo(() => {
    if (draft.kind !== 'dice' || draft.diceMode !== 'formula') return 6;
    try {
      return parseFormula(draft.formula).terms[0]?.sides ?? 20;
    } catch {
      return 20;
    }
  }, [draft.kind, draft.diceMode, draft.formula]);

  const title = isNew ? (draft.kind === 'roulette' ? 'Nueva ruleta' : 'Nuevo dado') : `Editar «${roller.name}»`;

  return (
    <Modal
      open
      onClose={() => void requestClose()}
      size="xl"
      title={title}
      subtitle="Los resultados solo se muestran: el DM aplica a mano lo que quiera."
      icon={draft.kind === 'roulette' ? <Disc3 /> : <Dices />}
      footer={
        <>
          <span className="mr-auto hidden items-center gap-1.5 text-xs text-parchment-400 sm:inline-flex">
            <Kbd combo="mod+enter" /> guardar
          </span>
          <Button variant="ghost" onClick={() => void requestClose()} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" icon={<Save />} loading={saving} onClick={() => void save()}>
            {isNew ? 'Crear' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Left: form */}
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <TextInput
              label="Nombre"
              required
              value={draft.name}
              maxLength={80}
              onValueChange={(name) => patch({ name })}
              error={visibleErrors.name}
              data-autofocus
            />
            <div>
              <span className="label">Tipo</span>
              <Segmented
                value={draft.kind}
                onChange={setKind}
                ariaLabel="Tipo"
                options={[
                  { value: 'roulette', label: 'Ruleta', icon: <Disc3 /> },
                  { value: 'dice', label: 'Dado', icon: <Dices /> },
                ]}
                className="py-1"
              />
            </div>
          </div>
          <TextArea
            label="Descripción"
            rows={2}
            autoResize
            maxRows={5}
            value={draft.description}
            placeholder="Para qué sirve, cuándo se usa…"
            onValueChange={(description) => patch({ description })}
          />
          <TagInput label="Etiquetas" value={draft.tags} onChange={(tags) => patch({ tags })} noRemoteSuggestions suggestions={tagSuggestions} placeholder="viaje, botín, combate…" />
          <div className="grid gap-3 rounded-lg border border-ink-600/70 bg-ink-950/40 p-3 sm:grid-cols-2">
            <Toggle checked={draft.active} onChange={(active) => patch({ active })} label="Activa" description="Aparece en los menús rápidos de la partida." />
            <Toggle checked={draft.isTurnRoll} onChange={(isTurnRoll) => patch({ isTurnRoll })} label="De turno" description="Se ofrece a cada jugador al empezar su turno." />
          </div>

          {draft.kind === 'roulette' ? (
            <SegmentsEditor
              segments={draft.segments}
              probabilities={probabilities}
              rowErrors={visibleErrors.segmentRows ?? {}}
              error={visibleErrors.segments}
              onPatch={patchSegment}
              onChange={(segments) => patch({ segments })}
              onAdd={addSegment}
            />
          ) : (
            <div className="space-y-3">
              <div>
                <span className="label">Cómo se tira</span>
                <Segmented
                  value={draft.diceMode}
                  onChange={(diceMode) =>
                    setDraft((d) => ({ ...d, diceMode, faces: diceMode === 'faces' && d.faces.length === 0 ? ['Cara 1', 'Cara 2', 'Cara 3', 'Cara 4', 'Cara 5', 'Cara 6'] : d.faces }))
                  }
                  ariaLabel="Modo del dado"
                  options={[
                    { value: 'formula', label: 'Fórmula de dados', icon: <Dices /> },
                    { value: 'faces', label: 'Caras personalizadas', icon: <Palette /> },
                  ]}
                />
              </div>
              {draft.diceMode === 'formula' ? (
                <div className="space-y-2">
                  <TextInput
                    label="Fórmula"
                    value={draft.formula}
                    onValueChange={(formula) => patch({ formula })}
                    className="font-mono"
                    placeholder="2d6+3"
                    spellCheck={false}
                    error={draft.formula.trim() ? errors.formula : visibleErrors.formula}
                    hint="Ejemplos: 1d20+5, 2d6+3, 4d6kh3 (quedarse con los 3 mayores), 1d8+1d6+2, d% (d100)."
                  />
                  <div className="flex flex-wrap gap-1">
                    {['1d20', ...FORMULA_EXAMPLES].map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => patch({ formula: ex })}
                        className="rounded-full border border-ink-600 bg-ink-800 px-2 py-0.5 font-mono text-[11px] text-parchment-300 transition hover:border-gold-700 hover:text-gold-200"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <FacesEditor faces={draft.faces} rowErrors={visibleErrors.faceRows ?? {}} error={visibleErrors.faces} onChange={(faces) => patch({ faces })} />
              )}
            </div>
          )}
        </div>

        {/* Right: live preview */}
        <aside className="min-w-0">
          <div className="sticky top-0 space-y-3 rounded-xl border border-ink-600/70 bg-ink-950/50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-parchment-300">Vista previa</div>
            {draft.kind === 'roulette' ? (
              <div className="flex flex-col items-center gap-3">
                <RouletteWheel
                  segments={draft.segments}
                  rotation={rotation}
                  durationMs={spinning ? spinMs : 0}
                  size={268}
                  onSegmentPass={spinning ? tick : undefined}
                  highlightSegmentId={spinResult?.id ?? null}
                  onSpinEnd={() => {
                    if (!spinning) return;
                    setSpinning(false);
                    setSpinResult(pendingResult.current);
                    uiSounds.diceLand();
                  }}
                />
                <Button size="sm" icon={<RotateCw />} onClick={testSpin} disabled={spinning || draft.segments.length === 0}>
                  {spinning ? 'Girando…' : 'Probar giro'}
                </Button>
                <div className="min-h-[3.5rem] w-full text-center">
                  {spinResult ? (
                    <div className="animate-pop rounded-lg border px-3 py-2" style={{ borderColor: spinResult.color, backgroundColor: `${spinResult.color}22` }}>
                      <div className="text-sm font-semibold text-parchment-50">
                        {spinResult.icon ? `${spinResult.icon} ` : ''}
                        {spinResult.label}
                      </div>
                      {spinResult.description && <div className="mt-0.5 text-xs text-parchment-300">{spinResult.description}</div>}
                    </div>
                  ) : (
                    <p className="text-xs text-parchment-400">Prueba local: no se envía a ninguna partida.</p>
                  )}
                </div>
              </div>
            ) : draft.diceMode === 'formula' ? (
              <div className="flex flex-col items-center gap-2 py-2 text-center">
                <DieGlyph sides={mainSides} size={92} />
                <div className="font-mono text-lg text-gold-200">{draft.formula.trim() || '—'}</div>
                {range ? (
                  <div className="text-sm text-parchment-300">
                    Resultado entre <strong className="text-parchment-50">{range.min}</strong> y <strong className="text-parchment-50">{range.max}</strong>
                    <div className="text-xs text-parchment-400">Media aproximada: {formatNumber(range.avg, 1)}</div>
                  </div>
                ) : (
                  <div className="text-xs text-blood-300">Fórmula inválida</div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-center py-1">
                  <div
                    className="flex h-24 w-24 items-center justify-center rounded-[22%] border-[3px] border-gold-400 p-2 text-center font-display text-sm font-bold text-gold-200"
                    style={{ background: 'radial-gradient(circle at 30% 22%, #4a3f2f 0%, #1c1915 55%, #0b0a08 100%)' }}
                  >
                    <span className="line-clamp-3 break-words">{draft.faces[0]?.trim() || '?'}</span>
                  </div>
                </div>
                <p className="text-center text-xs text-parchment-400">
                  {draft.faces.length} {draft.faces.length === 1 ? 'cara' : 'caras'}
                  {draft.faces.length > 0 && ` · cada una ${pct(1 / draft.faces.length)}`}
                </p>
                <div className="flex max-h-48 flex-wrap justify-center gap-1 overflow-y-auto">
                  {draft.faces.map((f, i) => (
                    <span key={i} className="chip max-w-full">
                      <span className="truncate">{f.trim() || '—'}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Roulette segments
// ---------------------------------------------------------------------------

function SegmentsEditor({
  segments,
  probabilities,
  rowErrors,
  error,
  onPatch,
  onChange,
  onAdd,
}: {
  segments: RouletteSegment[];
  probabilities: Record<string, number>;
  rowErrors: Record<string, string>;
  error?: string;
  onPatch: (id: string, p: Partial<RouletteSegment>) => void;
  onChange: (segments: RouletteSegment[]) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label mb-0">
          Segmentos ({segments.length}/{MAX_SEGMENTS})
        </span>
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="ghost" icon={<Palette />} onClick={() => onChange(spreadColors(segments))} disabled={segments.length === 0}>
            Repartir colores
          </Button>
          <Button size="sm" variant="ghost" icon={<Scale />} onClick={() => onChange(equalizeWeights(segments))} disabled={segments.length === 0}>
            Igualar pesos
          </Button>
          <Button size="sm" icon={<Plus />} onClick={onAdd} disabled={segments.length >= MAX_SEGMENTS}>
            Añadir
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-parchment-400">
        El peso indica lo probable que es cada segmento (un peso 2 sale el doble que un peso 1). El tamaño en la ruleta es proporcional.
      </p>
      {error && (
        <p role="alert" className="text-xs text-blood-400">
          {error}
        </p>
      )}
      <ol className="space-y-1.5">
        {segments.map((s, i) => (
          <SegmentRow
            key={s.id}
            index={i}
            count={segments.length}
            segment={s}
            probability={probabilities[s.id] ?? 0}
            error={rowErrors[s.id]}
            onPatch={(p) => onPatch(s.id, p)}
            onMove={(dir) => onChange(moveItem(segments, i, i + dir))}
            onRemove={() => onChange(segments.filter((x) => x.id !== s.id))}
          />
        ))}
      </ol>
      {segments.length > 0 && segments.length < MAX_SEGMENTS && (
        <Button size="sm" variant="ghost" block icon={<Plus />} onClick={onAdd} className="border border-dashed border-ink-500">
          Añadir segmento
        </Button>
      )}
    </div>
  );
}

function SegmentRow({
  index,
  count,
  segment,
  probability,
  error,
  onPatch,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  segment: RouletteSegment;
  probability: number;
  error?: string;
  onPatch: (p: Partial<RouletteSegment>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <li className={clsx('rounded-lg border bg-ink-800/50 p-2', error ? 'border-blood-500/70' : 'border-ink-600/70')}>
      <div className="flex items-center gap-1.5">
        <span className="w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums text-parchment-400">{index + 1}</span>
        <ColorSwatch color={segment.color} onChange={(color) => onPatch({ color })} />
        <input
          value={segment.icon ?? ''}
          onChange={(e) => onPatch({ icon: e.target.value ? e.target.value : null })}
          placeholder="🙂"
          maxLength={8}
          aria-label="Icono (emoji)"
          title="Icono (emoji opcional)"
          className="input input-sm w-10 shrink-0 px-1 text-center text-base"
        />
        <input
          value={segment.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder="Texto del segmento"
          maxLength={80}
          aria-label="Texto del segmento"
          aria-invalid={error ? true : undefined}
          className={clsx('input input-sm min-w-0 flex-1', error && !segment.label.trim() && 'input-error')}
        />
        <NumberInput
          size="sm"
          value={segment.weight}
          min={0}
          max={1000}
          step={1}
          onChange={(weight) => onPatch({ weight })}
          aria-label="Peso"
          title="Peso (probabilidad relativa)"
          className="w-14 text-center"
          containerClassName="shrink-0"
        />
        <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-gold-300" title="Probabilidad">
          {pct(probability)}
        </span>
        <div className="flex shrink-0 items-center">
          <IconButton size="xs" icon={<ArrowUp />} title="Subir" disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton size="xs" icon={<ArrowDown />} title="Bajar" disabled={index === count - 1} onClick={() => onMove(1)} />
          <IconButton size="xs" variant="danger" icon={<Trash2 />} title="Eliminar segmento" onClick={onRemove} />
        </div>
      </div>
      <input
        value={segment.description}
        onChange={(e) => onPatch({ description: e.target.value })}
        placeholder="Descripción opcional: qué significa este resultado"
        maxLength={300}
        aria-label="Descripción del segmento"
        className="input input-sm ml-[1.625rem] mt-1.5 w-[calc(100%-1.625rem)] text-[11px]"
      />
      {error && <p className="ml-[1.625rem] mt-1 text-[11px] text-blood-400">{error}</p>}
    </li>
  );
}

/** Color swatch that opens a small popover with the palette + custom picker. */
function ColorSwatch({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
    }
  };
  return (
    <div ref={ref} className="relative shrink-0" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-label="Color del segmento"
        aria-expanded={open}
        title="Cambiar color"
        onClick={() => setOpen((o) => !o)}
        className="h-7 w-7 rounded-md border border-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ring-gold-400/70 transition hover:scale-105 focus-visible:ring-2"
        style={{ backgroundColor: color }}
      />
      {open && (
        <div className="absolute left-0 top-full z-60 mt-1 w-64 animate-scale-in rounded-lg border border-ink-500 bg-ink-900 p-2.5 shadow-modal">
          <ColorPicker value={color} onChange={onChange} size="sm" />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Listo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom die faces
// ---------------------------------------------------------------------------

function FacesEditor({
  faces,
  rowErrors,
  error,
  onChange,
}: {
  faces: string[];
  rowErrors: Record<number, string>;
  error?: string;
  onChange: (faces: string[]) => void;
}) {
  const [bulk, setBulk] = useState<string | null>(null);
  const setFace = (i: number, value: string) => onChange(faces.map((f, k) => (k === i ? value : f)));
  const addBulk = () => {
    const lines = (bulk ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setBulk(null);
      return;
    }
    onChange([...faces, ...lines].slice(0, MAX_FACES));
    setBulk(null);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label mb-0">
          Caras ({faces.length}/{MAX_FACES})
        </span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setBulk((b) => (b === null ? '' : null))}>
            {bulk === null ? 'Añadir varias' : 'Cerrar'}
          </Button>
          <Button size="sm" icon={<Plus />} disabled={faces.length >= MAX_FACES} onClick={() => onChange([...faces, `Cara ${faces.length + 1}`])}>
            Añadir cara
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-parchment-400">Todas las caras tienen la misma probabilidad.</p>
      {error && (
        <p role="alert" className="text-xs text-blood-400">
          {error}
        </p>
      )}
      {bulk !== null && (
        <div className="space-y-2 rounded-lg border border-ink-600 bg-ink-950/40 p-2">
          <TextArea rows={4} value={bulk} onValueChange={setBulk} placeholder={'Una cara por línea, por ejemplo:\n🌟 Fortuna\n💀 Desgracia'} />
          <div className="flex justify-end">
            <Button size="sm" variant="primary" onClick={addBulk}>
              Añadir caras
            </Button>
          </div>
        </div>
      )}
      <ol className="space-y-1.5">
        {faces.map((f, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums text-parchment-400">{i + 1}</span>
            <input
              value={f}
              onChange={(e) => setFace(i, e.target.value)}
              placeholder="Texto de la cara"
              maxLength={60}
              aria-label={`Cara ${i + 1}`}
              className={clsx('input input-sm min-w-0 flex-1', rowErrors[i] && 'input-error')}
            />
            <IconButton size="xs" icon={<ArrowUp />} title="Subir" disabled={i === 0} onClick={() => onChange(moveItem(faces, i, i - 1))} />
            <IconButton size="xs" icon={<ArrowDown />} title="Bajar" disabled={i === faces.length - 1} onClick={() => onChange(moveItem(faces, i, i + 1))} />
            <IconButton size="xs" variant="danger" icon={<Trash2 />} title="Eliminar cara" onClick={() => onChange(faces.filter((_, k) => k !== i))} />
          </li>
        ))}
      </ol>
    </div>
  );
}
