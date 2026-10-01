import { useId, useMemo } from 'react';
import clsx from 'clsx';
import { CloudSun, Compass, Flag, Grid3x3, Info, Map as MapIcon, NotebookPen, Tag, Trash2 } from 'lucide-react';
import {
  emptyNeighbors,
  LIGHTING_INFO,
  LIGHTING_PRESETS,
  normalizeText,
  WEATHER_LABELS,
  WEATHER_TYPES,
  ZONE_TYPE_LABELS,
  ZONE_TYPES,
  type LightingPreset,
  type WeatherType,
  type Zone,
  type ZoneNeighbors,
  type ZoneType,
} from '@wailers/shared';
import { Button, EmptyState, Field, Select, TagInput, TextArea, TextInput, toast, type SelectOption } from '../../components/ui';
import { useCategories } from '../../stores/categories';
import { useCurrentEditorZone, useEditorStore } from './editorStore';
import { saveCampaign } from './shell/campaignSave';
import { FieldGrid } from './shell/controls';
import { PanelSection } from './shell/PanelSection';
import { SoundPicker } from './shell/SoundPicker';
import { buildZoneTree, descendantIds, zoneSelectOptions } from './shell/zoneTree';

type Direction = keyof ZoneNeighbors;

const DIRECTION_LABELS: Record<Direction, string> = {
  up: 'Arriba (norte)',
  down: 'Abajo (sur)',
  left: 'Izquierda (oeste)',
  right: 'Derecha (este)',
};

const ZONE_TYPE_OPTIONS = ZONE_TYPES.map((t) => ({ value: t, label: ZONE_TYPE_LABELS[t] }));
const WEATHER_OPTIONS = WEATHER_TYPES.map((w) => ({ value: w, label: WEATHER_LABELS[w] }));
const LIGHTING_OPTIONS = LIGHTING_PRESETS.map((l) => ({ value: l, label: LIGHTING_INFO[l].label }));

/** Category names usable as biome suggestions (values under a "biome" facet, or every zone value). */
function useBiomeSuggestions(): string[] {
  const { categories } = useCategories('zone');
  return useMemo(() => {
    const byParent = new Map<string | null, typeof categories>();
    for (const c of categories) {
      const list = byParent.get(c.parentId) ?? [];
      list.push(c);
      byParent.set(c.parentId, list);
    }
    const roots = byParent.get(null) ?? [];
    const facets = roots.filter((r) => {
      const n = normalizeText(r.name);
      return n.includes('bioma') || n.includes('biome');
    });
    const collect = (ids: string[]): string[] => {
      const out: string[] = [];
      const stack = [...ids];
      const seen = new Set<string>();
      while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const child of byParent.get(id) ?? []) {
          out.push(child.name);
          stack.push(child.id);
        }
      }
      return out;
    };
    const names = facets.length > 0 ? collect(facets.map((f) => f.id)) : categories.filter((c) => c.parentId !== null).map((c) => c.name);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'es'));
  }, [categories]);
}

function NeighborCompass({ zone, zones }: { zone: Zone; zones: Zone[] }) {
  const updateZone = useEditorStore((s) => s.updateZone);
  const options = useMemo<SelectOption<string | null>[]>(() => {
    const tops = buildZoneTree(zones)
      .map((n) => n.zone)
      .filter((z) => z.id !== zone.id);
    return [{ value: null, label: '— Ninguna —' }, ...tops.map((z) => ({ value: z.id as string | null, label: z.name || 'Zona sin nombre' }))];
  }, [zones, zone.id]);

  const used = new Map<string, Direction[]>();
  (Object.keys(DIRECTION_LABELS) as Direction[]).forEach((d) => {
    const id = zone.neighbors[d];
    if (id) used.set(id, [...(used.get(id) ?? []), d]);
  });
  const duplicated = Array.from(used.values()).some((dirs) => dirs.length > 1);

  const setNeighbor = (dir: Direction, value: string | null) => {
    updateZone(zone.id, (d) => {
      d.neighbors = { ...d.neighbors, [dir]: value };
    });
  };

  const select = (dir: Direction, className?: string) => (
    <Select<string | null>
      value={zone.neighbors[dir]}
      onChange={(v) => setNeighbor(dir, v)}
      options={options}
      size="sm"
      aria-label={DIRECTION_LABELS[dir]}
      title={DIRECTION_LABELS[dir]}
      containerClassName={className}
    />
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="mx-auto w-full max-w-[13rem]">{select('up')}</div>
      <div className="flex items-center gap-1.5">
        {select('left', 'min-w-0 flex-1')}
        <div
          className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-gold-700/60 bg-[radial-gradient(circle,rgba(212,166,63,0.18),rgba(11,10,8,0.9)_70%)] shadow-[0_0_18px_-6px_rgba(233,192,99,0.6)]"
          title={zone.name}
        >
          <Compass className="h-6 w-6 text-gold-300" aria-hidden />
          <span className="absolute -top-0.5 text-[8px] font-bold text-gold-400">N</span>
          <span className="absolute -bottom-0.5 text-[8px] font-bold text-parchment-400">S</span>
          <span className="absolute -left-0.5 text-[8px] font-bold text-parchment-400">O</span>
          <span className="absolute -right-0.5 text-[8px] font-bold text-parchment-400">E</span>
        </div>
        {select('right', 'min-w-0 flex-1')}
      </div>
      <div className="mx-auto w-full max-w-[13rem]">{select('down')}</div>
      {duplicated && (
        <p className="text-[11px] text-gold-300">Una misma zona aparece en varias direcciones: revisa la vecindad.</p>
      )}
    </div>
  );
}

function SpawnInfo({ zone }: { zone: Zone }) {
  const spawn = useEditorStore((s) => s.campaign?.spawn ?? null);
  const zones = useEditorStore((s) => s.zones);
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const selectZone = useEditorStore((s) => s.selectZone);
  const here = spawn?.zoneId === zone.id;
  const spawnZone = spawn ? zones.find((z) => z.id === spawn.zoneId) ?? null : null;
  const spawnLevel = here ? zone.levels.find((l) => l.id === spawn?.levelId) ?? null : null;

  return (
    <div className="flex flex-col gap-2">
      <div
        className={clsx(
          'flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs leading-snug',
          here ? 'border-emerald-600/50 bg-emerald-500/10 text-emerald-200' : 'border-ink-600 bg-ink-950/50 text-parchment-300',
        )}
      >
        <Flag className={clsx('mt-0.5 h-3.5 w-3.5 shrink-0', here ? 'text-emerald-300' : 'text-parchment-400')} aria-hidden />
        <div className="min-w-0 flex-1">
          {here ? (
            <>
              Los héroes aparecen en esta zona
              {spawnLevel ? (
                <>
                  , en <strong>«{spawnLevel.name}»</strong>
                </>
              ) : null}
              .
            </>
          ) : spawnZone ? (
            <>
              El punto de aparición está en <strong className="text-parchment-100">«{spawnZone.name}»</strong>.
            </>
          ) : (
            <>La campaña todavía no tiene punto de aparición.</>
          )}
          <span className="mt-1 block text-[11px] text-parchment-400">Usa la herramienta Spawn (S) para colocarlo.</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant={tool === 'spawn' ? 'primary' : 'secondary'} icon={<Flag />} onClick={() => setTool('spawn')}>
          Herramienta Spawn
        </Button>
        {spawn && !here && spawnZone && (
          <Button size="sm" variant="ghost" icon={<MapIcon />} onClick={() => selectZone(spawnZone.id, spawn.levelId)}>
            Ir a la zona
          </Button>
        )}
        {here && spawn && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 />}
            className="hover:text-blood-300"
            onClick={() => {
              void saveCampaign({ spawn: null });
              toast.info('Punto de aparición eliminado');
            }}
          >
            Quitar
          </Button>
        )}
      </div>
    </div>
  );
}

/** Settings of the current zone: identity, hierarchy, neighbors, ambience, tags, DM notes and spawn. */
export function ZoneSettingsPanel() {
  const { zone } = useCurrentEditorZone();
  const zones = useEditorStore((s) => s.zones);
  const updateZone = useEditorStore((s) => s.updateZone);
  const setMode = useEditorStore((s) => s.setMode);
  const biomes = useBiomeSuggestions();
  const biomeListId = useId();

  const parentOptions = useMemo<SelectOption<string | null>[]>(() => {
    if (!zone) return [];
    const exclude = descendantIds(zones, zone.id);
    exclude.add(zone.id);
    const list = zoneSelectOptions(zones, { exclude }).map((o) => ({ ...o, value: o.value as string | null }));
    return [{ value: null, label: 'Ninguna (zona principal)' }, ...list];
  }, [zones, zone]);

  if (!zone) {
    return <EmptyState compact icon={<MapIcon />} title="Sin zona" description="Elige o crea una zona para editar sus ajustes." />;
  }

  const patch = (recipe: (d: Zone) => void, coalesceKey?: string) =>
    updateZone(zone.id, recipe, coalesceKey ? { coalesceKey: `${coalesceKey}:${zone.id}` } : undefined);

  const changeParent = (parentId: string | null) => {
    const hadNeighbors = Object.values(zone.neighbors).some(Boolean) || zone.gridPos !== null;
    patch((d) => {
      d.parentZoneId = parentId;
      if (parentId) {
        // Sub-zones are reached through transitions, not through the zone grid.
        d.neighbors = emptyNeighbors();
        d.gridPos = null;
        if (d.zoneType === 'exterior') d.zoneType = 'subzone';
      }
    });
    if (parentId) {
      const parent = zones.find((z) => z.id === parentId);
      toast.success(`Ahora es una sub-zona de «${parent?.name ?? 'la zona'}»`, {
        description: hadNeighbors ? 'Se ha quitado de la cuadrícula de zonas y de su vecindad.' : undefined,
      });
    } else {
      toast.success('Ahora es una zona principal');
    }
  };

  const isSubzone = zone.parentZoneId !== null && zones.some((z) => z.id === zone.parentZoneId);

  return (
    <div className="flex flex-col">
      <PanelSection id="zone-identity" title="Zona" icon={<MapIcon />}>
        <TextInput
          label="Nombre"
          size="sm"
          value={zone.name}
          maxLength={80}
          onValueChange={(v) =>
            patch((d) => {
              d.name = v;
            }, 'zone-name')
          }
          onBlur={() => {
            if (!zone.name.trim())
              patch((d) => {
                d.name = 'Zona sin nombre';
              });
          }}
        />
        <FieldGrid>
          <Select<ZoneType>
            label="Tipo"
            size="sm"
            value={zone.zoneType}
            options={ZONE_TYPE_OPTIONS}
            onChange={(v) =>
              patch((d) => {
                d.zoneType = v;
              })
            }
          />
          <Field label="Bioma" htmlFor={`${biomeListId}-input`}>
            <input
              id={`${biomeListId}-input`}
              list={biomeListId}
              value={zone.biome}
              maxLength={60}
              placeholder="Bosque, cueva…"
              onChange={(e) =>
                patch((d) => {
                  d.biome = e.target.value;
                }, 'zone-biome')
              }
              className="input input-sm"
            />
            <datalist id={biomeListId}>
              {biomes.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
        </FieldGrid>
        <Select<string | null>
          label="Zona padre"
          size="sm"
          value={zone.parentZoneId && zones.some((z) => z.id === zone.parentZoneId) ? zone.parentZoneId : null}
          options={parentOptions}
          onChange={changeParent}
          hint="Las sub-zonas (casas, cuevas…) cuelgan de otra zona y se llega a ellas con transiciones."
        />
      </PanelSection>

      <PanelSection id="zone-neighbors" title="Zonas vecinas" icon={<Compass />}>
        {isSubzone ? (
          <p className="flex items-start gap-2 text-[11px] leading-snug text-parchment-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden />
            Las sub-zonas no tienen vecinas: se entra y se sale de ellas con transiciones (puertas, entradas, escaleras…).
          </p>
        ) : (
          <>
            <NeighborCompass zone={zone} zones={zones} />
            <p className="text-[11px] leading-snug text-parchment-400">
              La vecindad es recíproca: si eliges una zona a la derecha, esta zona quedará a su izquierda.
            </p>
            <Button size="sm" variant="ghost" icon={<Grid3x3 />} onClick={() => setMode('grid')} className="self-start">
              Organizar en la cuadrícula de zonas
            </Button>
          </>
        )}
      </PanelSection>

      <PanelSection id="zone-ambience" title="Ambientación" icon={<CloudSun />}>
        <SoundPicker
          label="Música"
          soundType="music"
          value={zone.musicSoundId}
          onChange={(v) =>
            patch((d) => {
              d.musicSoundId = v;
            })
          }
        />
        <SoundPicker
          label="Ambiente"
          soundType="ambience"
          value={zone.ambienceSoundId}
          onChange={(v) =>
            patch((d) => {
              d.ambienceSoundId = v;
            })
          }
        />
        <FieldGrid>
          <Select<WeatherType>
            label="Clima inicial"
            size="sm"
            value={zone.weather}
            options={WEATHER_OPTIONS}
            onChange={(v) =>
              patch((d) => {
                d.weather = v;
              })
            }
          />
          <Select<LightingPreset>
            label="Iluminación"
            size="sm"
            value={zone.lighting}
            options={LIGHTING_OPTIONS}
            onChange={(v) =>
              patch((d) => {
                d.lighting = v;
              })
            }
          />
        </FieldGrid>
        <p className="text-[11px] leading-snug text-parchment-400">El DM puede cambiar el clima y la luz durante la partida.</p>
      </PanelSection>

      <PanelSection id="zone-tags" title="Etiquetas" icon={<Tag />}>
        <TagInput
          value={zone.tags}
          onChange={(tags) =>
            patch((d) => {
              d.tags = tags;
            })
          }
          kind="zone"
          size="sm"
        />
      </PanelSection>

      <PanelSection id="zone-notes" title="Notas del DM" icon={<NotebookPen />}>
        <TextArea
          value={zone.notes}
          onValueChange={(v) =>
            patch((d) => {
              d.notes = v;
            }, 'zone-notes')
          }
          rows={5}
          autoResize
          maxRows={14}
          placeholder="Secretos, ganchos de aventura, PNJ importantes… (los jugadores no lo ven)"
          aria-label="Notas del DM"
        />
      </PanelSection>

      <PanelSection id="zone-spawn" title="Punto de aparición" icon={<Flag />}>
        <SpawnInfo zone={zone} />
      </PanelSection>
    </div>
  );
}
