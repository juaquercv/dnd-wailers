import { useState } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Building2, Copy, Plus, Star, Trash2, X } from 'lucide-react';
import { createZoneLevel, type Zone, type ZoneLevel } from '@wailers/shared';
import { Button, EmptyState, IconButton, Stepper, TextInput, Tooltip, toast, useConfirm } from '../../components/ui';
import { plural } from '../../lib/format';
import { useCurrentEditorZone, useEditorStore } from './editorStore';
import { saveCampaign } from './shell/campaignSave';
import { InlineEdit } from './shell/InlineEdit';
import { elevationBadge, elevationName } from './shell/labels';
import { cloneLevel, levelCenter, levelContentCount, sortLevelsByElevation } from './shell/levelUtils';

const MIN_ELEVATION = -20;
const MAX_ELEVATION = 50;

/** Points every transition aimed at (zoneId, fromLevelId) to toLevelId instead. Returns true if any changed. */
function retargetTransitions(draft: Zone, zoneId: string, fromLevelId: string, toLevelId: string): boolean {
  let changed = false;
  for (const level of draft.levels) {
    for (const el of level.elements) {
      if (el.type === 'transition' && el.target && el.target.zoneId === zoneId && el.target.levelId === fromLevelId) {
        el.target = { ...el.target, levelId: toLevelId };
        changed = true;
      }
    }
  }
  return changed;
}

function targetsLevel(zone: Zone, zoneId: string, levelId: string): boolean {
  return zone.levels.some((l) =>
    l.elements.some((el) => el.type === 'transition' && el.target?.zoneId === zoneId && el.target.levelId === levelId),
  );
}

/** The level that becomes default when the current default is removed: the one closest to ground floor. */
function pickDefaultLevel(levels: ZoneLevel[]): ZoneLevel | undefined {
  return [...levels].sort((a, b) => Math.abs(a.elevation) - Math.abs(b.elevation) || b.elevation - a.elevation)[0];
}

function ElevationBadge({ elevation, active }: { elevation: number; active: boolean }) {
  return (
    <span
      title={elevationName(elevation)}
      className={clsx(
        'relative z-10 flex h-8 w-9 shrink-0 flex-col items-center justify-center rounded-md border text-[11px] font-bold leading-none tabular-nums',
        active
          ? 'border-gold-500/80 bg-gold-500/20 text-gold-200 shadow-[0_0_12px_-3px_rgba(233,192,99,0.7)]'
          : elevation < 0
            ? 'border-arcane-600/50 bg-arcane-500/10 text-arcane-300'
            : elevation > 0
              ? 'border-sky-600/50 bg-sky-500/10 text-sky-300'
              : 'border-ink-500 bg-ink-800 text-parchment-200',
      )}
    >
      {elevation > 0 ? <ArrowUp className="mb-0.5 h-2.5 w-2.5" aria-hidden /> : elevation < 0 ? <ArrowDown className="mb-0.5 h-2.5 w-2.5" aria-hidden /> : null}
      {elevationBadge(elevation)}
    </span>
  );
}

/** Floors of the current zone, top floor first, with add / rename / elevation / duplicate / default / delete. */
export function LevelsPanel() {
  const { zone, level: currentLevel } = useCurrentEditorZone();
  const spawn = useEditorStore((s) => s.campaign?.spawn ?? null);
  const selectLevel = useEditorStore((s) => s.selectLevel);
  const updateZone = useEditorStore((s) => s.updateZone);
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newElevation, setNewElevation] = useState(1);

  if (!zone) {
    return <EmptyState compact icon={<Building2 />} title="Sin zona" description="Elige o crea una zona para gestionar sus niveles." />;
  }

  const sorted = sortLevelsByElevation(zone.levels);
  const maxElevation = Math.max(...zone.levels.map((l) => l.elevation));
  const minElevation = Math.min(...zone.levels.map((l) => l.elevation));

  const openAdd = (elevation: number) => {
    setNewElevation(Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, elevation)));
    setNewName('');
    setAdding(true);
  };

  const addLevel = () => {
    const name = newName.trim() || elevationName(newElevation);
    const created = createZoneLevel(name, newElevation);
    const base = currentLevel ?? zone.levels[0];
    if (base) {
      // Same footprint and grid as the floor being edited, without its picture.
      created.grid = structuredClone(base.grid);
      created.background = { ...base.background, url: null };
    }
    updateZone(zone.id, (d) => {
      d.levels.push(created);
    });
    selectLevel(created.id);
    setAdding(false);
    toast.success(`Nivel «${name}» creado`);
  };

  const rename = (lvl: ZoneLevel, name: string) => {
    updateZone(zone.id, (d) => {
      const target = d.levels.find((l) => l.id === lvl.id);
      if (target) target.name = name;
    });
  };

  const setElevation = (lvl: ZoneLevel, elevation: number) => {
    updateZone(
      zone.id,
      (d) => {
        const target = d.levels.find((l) => l.id === lvl.id);
        if (target) target.elevation = elevation;
      },
      { coalesceKey: `elevation:${lvl.id}` },
    );
  };

  const duplicate = (lvl: ZoneLevel) => {
    const copy = cloneLevel(lvl, `${lvl.name} (copia)`);
    updateZone(zone.id, (d) => {
      const idx = d.levels.findIndex((l) => l.id === lvl.id);
      d.levels.splice(idx >= 0 ? idx + 1 : d.levels.length, 0, copy);
    });
    selectLevel(copy.id);
    toast.success(`Nivel duplicado como «${copy.name}»`);
  };

  const makeDefault = (lvl: ZoneLevel) => {
    updateZone(zone.id, (d) => {
      d.defaultLevelId = lvl.id;
    });
    toast.success(`«${lvl.name}» es ahora el nivel inicial de la zona`);
  };

  const remove = async (lvl: ZoneLevel) => {
    if (zone.levels.length <= 1) return;
    const count = levelContentCount(lvl);
    const ok = await confirm({
      title: 'Eliminar nivel',
      message: (
        <>
          Se eliminará <strong className="text-parchment-100">«{lvl.name}»</strong>
          {count > 0 ? ` con ${plural(count, 'elemento', 'elementos')} (dibujos, paredes, luces y niebla)` : ''}. Las transiciones que
          llevaban a este nivel apuntarán al nivel inicial de la zona.
        </>
      ),
      confirmLabel: 'Eliminar nivel',
      danger: true,
    });
    if (!ok) return;
    const latest = useEditorStore.getState().zones.find((z) => z.id === zone.id);
    if (!latest || latest.levels.length <= 1) return;
    const remaining = latest.levels.filter((l) => l.id !== lvl.id);
    const nextDefault =
      latest.defaultLevelId !== lvl.id && remaining.some((l) => l.id === latest.defaultLevelId)
        ? latest.defaultLevelId
        : pickDefaultLevel(remaining)?.id ?? remaining[0]!.id;
    if (useEditorStore.getState().currentLevelId === lvl.id) selectLevel(nextDefault);
    updateZone(zone.id, (d) => {
      d.levels = d.levels.filter((l) => l.id !== lvl.id);
      d.defaultLevelId = nextDefault;
      retargetTransitions(d, zone.id, lvl.id, nextDefault);
    });
    for (const other of useEditorStore.getState().zones) {
      if (other.id !== zone.id && targetsLevel(other, zone.id, lvl.id)) {
        updateZone(other.id, (d) => {
          retargetTransitions(d, zone.id, lvl.id, nextDefault);
        });
      }
    }
    const nextLevel = remaining.find((l) => l.id === nextDefault);
    if (spawn && spawn.zoneId === zone.id && spawn.levelId === lvl.id && nextLevel) {
      void saveCampaign({ spawn: { zoneId: zone.id, levelId: nextDefault, ...levelCenter(nextLevel) } });
      toast.info(`El punto de aparición se ha movido a «${nextLevel.name}»`);
    }
    toast.success(`Nivel «${lvl.name}» eliminado`);
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-[11px] leading-snug text-parchment-400">
        Cada zona puede tener varios pisos: torres arriba, sótanos abajo. En la partida, los niveles inferiores se ven bajo el actual
        con efecto de profundidad. La <Star className="inline h-3 w-3 fill-gold-400 text-gold-400" aria-label="estrella" /> marca el
        nivel inicial.
      </p>

      <div className="relative flex flex-col gap-1.5">
        <span aria-hidden className="absolute bottom-4 left-[1.6rem] top-4 w-px bg-gradient-to-b from-sky-600/40 via-ink-500 to-arcane-600/40" />
        {sorted.map((lvl) => {
          const active = lvl.id === currentLevel?.id;
          const isDefault = lvl.id === zone.defaultLevelId;
          const count = levelContentCount(lvl);
          const hasSpawn = spawn?.zoneId === zone.id && spawn.levelId === lvl.id;
          return (
            <div
              key={lvl.id}
              role="button"
              tabIndex={0}
              aria-current={active ? 'true' : undefined}
              onClick={() => !active && selectLevel(lvl.id)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                  e.preventDefault();
                  selectLevel(lvl.id);
                }
              }}
              className={clsx(
                'relative rounded-lg border p-1.5 transition',
                active
                  ? 'border-gold-600/70 bg-gradient-to-r from-gold-500/10 to-transparent shadow-[inset_0_0_0_1px_rgba(233,192,99,0.15)]'
                  : 'cursor-pointer border-ink-600/70 bg-ink-950/50 hover:border-ink-500 hover:bg-ink-800/60',
              )}
            >
              <div className="flex items-center gap-2">
                <ElevationBadge elevation={lvl.elevation} active={active} />
                <div className="min-w-0 flex-1">
                  <InlineEdit
                    value={lvl.name}
                    onCommit={(name) => rename(lvl, name)}
                    label="Nombre del nivel"
                    trigger="dblclick"
                    className={clsx('-ml-1.5 max-w-full text-sm', active ? 'font-semibold text-gold-100' : 'text-parchment-100')}
                  />
                  <div className="truncate text-[10px] text-parchment-400">
                    {elevationName(lvl.elevation)} · {plural(count, 'elemento', 'elementos')}
                    {hasSpawn && <span className="text-emerald-300"> · 🚩 aparición</span>}
                  </div>
                </div>
                {isDefault ? (
                  <Tooltip content="Nivel inicial de la zona" side="left">
                    <Star className="h-4 w-4 shrink-0 fill-gold-400 text-gold-400" aria-label="Nivel inicial" />
                  </Tooltip>
                ) : (
                  <IconButton
                    icon={<Star />}
                    title="Usar como nivel inicial"
                    size="xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      makeDefault(lvl);
                    }}
                  />
                )}
              </div>
              {active && (
                <div className="mt-1.5 flex items-center gap-1 border-t border-ink-600/60 pt-1.5" onClick={(e) => e.stopPropagation()}>
                  <Stepper
                    value={lvl.elevation}
                    onChange={(next) => setElevation(lvl, next)}
                    min={MIN_ELEVATION}
                    max={MAX_ELEVATION}
                    size="sm"
                    bigStep={1}
                    format={elevationBadge}
                    title="Altura del nivel (0 = planta baja)"
                  />
                  <span className="ml-0.5 text-[10px] uppercase tracking-wide text-parchment-400">Altura</span>
                  <div className="ml-auto flex items-center gap-0.5">
                    <IconButton icon={<Copy />} title="Duplicar nivel" size="sm" onClick={() => duplicate(lvl)} />
                    <IconButton
                      icon={<Trash2 />}
                      title={zone.levels.length <= 1 ? 'Una zona necesita al menos un nivel' : 'Eliminar nivel'}
                      size="sm"
                      variant="danger"
                      disabled={zone.levels.length <= 1}
                      onClick={() => void remove(lvl)}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {adding ? (
        <form
          className="flex animate-fade-in flex-col gap-2.5 rounded-lg border border-gold-700/50 bg-ink-950/60 p-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            addLevel();
          }}
        >
          <div className="flex items-center justify-between">
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-300">Nuevo nivel</span>
            <IconButton icon={<X />} title="Cancelar" size="xs" onClick={() => setAdding(false)} />
          </div>
          <TextInput
            label="Nombre"
            size="sm"
            value={newName}
            onValueChange={setNewName}
            placeholder={elevationName(newElevation)}
            maxLength={60}
            autoFocus
          />
          <div className="flex items-end justify-between gap-2">
            <Stepper
              label="Altura"
              value={newElevation}
              onChange={(next) => setNewElevation(next)}
              min={MIN_ELEVATION}
              max={MAX_ELEVATION}
              size="sm"
              bigStep={1}
              format={elevationBadge}
            />
            <Button type="submit" size="sm" variant="primary" icon={<Plus />}>
              Crear
            </Button>
          </div>
          <p className="text-[10px] text-parchment-400">Hereda el tamaño y la cuadrícula del nivel actual.</p>
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" icon={<ArrowUp />} onClick={() => openAdd(maxElevation + 1)}>
            Piso superior
          </Button>
          <Button size="sm" icon={<ArrowDown />} onClick={() => openAdd(minElevation - 1)}>
            Sótano
          </Button>
        </div>
      )}
    </div>
  );
}
