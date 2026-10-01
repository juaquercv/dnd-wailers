import { useState } from 'react';
import { Grid3x3, Hexagon, ImageIcon, Layers, Maximize2, Square } from 'lucide-react';
import type { GridConfig, Zone, ZoneLevel } from '@wailers/shared';
import { Button, ImageUpload, NumberInput, Slider, Toggle, toast } from '../../../../components/ui';
import { plural } from '../../../../lib/format';
import { useEditorStore } from '../../editorStore';
import { ColorField } from '../ColorSwatch';
import { FieldGrid, Segmented, StatLine } from '../controls';
import { elevationBadge, elevationName } from '../labels';
import { readImageSize } from '../levelUtils';
import { PanelSection } from '../PanelSection';

const BACKGROUND_PALETTE = ['#2b2a24', '#1c1915', '#0b0a08', '#3b2f22', '#2f3a24', '#1f2e3a', '#3a2430', '#4a4239', '#5b4a32', '#24333a', '#6b5b45', '#f3ead6'];
const GRID_PALETTE = ['#000000', '#ffffff', '#f3d58a', '#e9c063', '#cdb98f', '#4a4239', '#7fd6ff', '#a98bff'];

const MIN_SIZE = 200;
const MAX_SIZE = 20000;

/** Properties of the current level, shown when nothing is selected: background and grid. */
export function LevelProperties({ zone, level }: { zone: Zone; level: ZoneLevel }) {
  const updateLevel = useEditorStore((s) => s.updateLevel);
  const [reading, setReading] = useState(false);
  const bg = level.background;
  const grid = level.grid;

  const setGrid = (patch: Partial<GridConfig>, field?: string) =>
    updateLevel(
      (l) => {
        l.grid = { ...l.grid, ...patch };
      },
      field ? { coalesceKey: `grid:${level.id}:${field}` } : undefined,
    );

  const setBackgroundImage = async (url: string | null) => {
    if (!url) {
      updateLevel((l) => {
        l.background.url = null;
      });
      return;
    }
    setReading(true);
    const size = await readImageSize(url);
    setReading(false);
    updateLevel((l) => {
      l.background.url = url;
      if (size) {
        l.background.width = size.width;
        l.background.height = size.height;
      }
    });
    if (size) toast.success(`Fondo ajustado a ${size.width} × ${size.height} px`);
    else toast.info('No se pudo leer el tamaño de la imagen: ajusta el ancho y el alto a mano.');
  };

  const applyNaturalSize = async () => {
    if (!bg.url) return;
    setReading(true);
    const size = await readImageSize(bg.url);
    setReading(false);
    if (!size) {
      toast.warning('No se pudo leer el tamaño original de la imagen');
      return;
    }
    updateLevel((l) => {
      l.background.width = size.width;
      l.background.height = size.height;
    });
    toast.success(`Tamaño original: ${size.width} × ${size.height} px`);
  };

  const cols = Math.max(0, Math.floor((bg.width - grid.offsetX) / Math.max(1, grid.size)));
  const rows = Math.max(0, Math.floor((bg.height - grid.offsetY) / Math.max(1, grid.size)));
  const stats = [
    plural(level.elements.length, 'elemento', 'elementos'),
    plural(level.walls.length, 'pared', 'paredes'),
    plural(level.lights.length, 'luz', 'luces'),
    plural(level.fogRegions.length, 'región de niebla', 'regiones de niebla'),
  ].join(' · ');

  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-2.5 border-b border-ink-700/80 bg-gradient-to-b from-gold-500/[0.07] to-transparent px-3 py-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold-700/50 bg-gold-500/10 text-xs font-bold text-gold-300">
          {elevationBadge(level.elevation)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-400/90">
            Nivel · {elevationName(level.elevation)}
          </div>
          <div className="truncate text-sm font-semibold text-parchment-50">{level.name}</div>
          <StatLine className="mt-0.5">{stats}</StatLine>
        </div>
      </div>
      <p className="flex items-center gap-1.5 border-b border-ink-700/80 px-3 py-2 text-[11px] text-parchment-400">
        <Layers className="h-3.5 w-3.5 shrink-0 text-gold-500" aria-hidden />
        Selecciona algo en el mapa para editar sus propiedades. {zone.levels.length > 1 ? 'Cambia de nivel en la pestaña Niveles.' : ''}
      </p>

      <PanelSection id="level-background" title="Fondo" icon={<ImageIcon />}>
        <ImageUpload
          value={bg.url}
          onChange={(url) => void setBackgroundImage(url)}
          fit="contain"
          height={130}
          hint="El mapa de este nivel (PNG, JPG, WEBP o SVG)"
          disabled={reading}
        />
        {bg.url && (
          <Button size="sm" variant="ghost" icon={<Maximize2 />} loading={reading} onClick={() => void applyNaturalSize()} className="self-start">
            Usar el tamaño original de la imagen
          </Button>
        )}
        <FieldGrid>
          <NumberInput
            label="Ancho"
            size="sm"
            integer
            min={MIN_SIZE}
            max={MAX_SIZE}
            step={10}
            suffix="px"
            value={bg.width}
            onChange={(width) =>
              updateLevel(
                (l) => {
                  l.background.width = width;
                },
                { coalesceKey: `bg:${level.id}:w` },
              )
            }
          />
          <NumberInput
            label="Alto"
            size="sm"
            integer
            min={MIN_SIZE}
            max={MAX_SIZE}
            step={10}
            suffix="px"
            value={bg.height}
            onChange={(height) =>
              updateLevel(
                (l) => {
                  l.background.height = height;
                },
                { coalesceKey: `bg:${level.id}:h` },
              )
            }
          />
        </FieldGrid>
        <ColorField
          label="Color de fondo"
          value={bg.color}
          palette={BACKGROUND_PALETTE}
          onChange={(color) =>
            updateLevel(
              (l) => {
                l.background.color = color;
              },
              { coalesceKey: `bg:${level.id}:color` },
            )
          }
        />
      </PanelSection>

      <PanelSection id="level-grid" title="Cuadrícula" icon={<Grid3x3 />} aside={grid.type === 'square' ? `${cols} × ${rows}` : undefined}>
        <Segmented<GridConfig['type']>
          value={grid.type}
          onChange={(type) => setGrid({ type })}
          fill
          aria-label="Tipo de cuadrícula"
          options={[
            { value: 'square', label: 'Cuadrada', icon: <Square aria-hidden /> },
            { value: 'hex', label: 'Hexagonal', icon: <Hexagon aria-hidden /> },
          ]}
        />
        <div className="flex flex-col gap-2 rounded-lg border border-ink-700 bg-ink-950/40 p-2">
          <Toggle size="sm" checked={grid.show} onChange={(show) => setGrid({ show })} label="Mostrar cuadrícula" />
          <Toggle
            size="sm"
            checked={grid.snap}
            onChange={(snap) => setGrid({ snap })}
            label="Ajustar a la cuadrícula"
            description="Los elementos y fichas encajan en las casillas al moverlos."
          />
        </div>
        <NumberInput
          label={grid.type === 'hex' ? 'Tamaño del hexágono' : 'Tamaño de la casilla'}
          size="sm"
          integer
          min={10}
          max={600}
          suffix="px"
          value={grid.size}
          onChange={(size) => setGrid({ size }, 'size')}
        />
        <FieldGrid>
          <NumberInput
            label="Desplaz. X"
            size="sm"
            min={-grid.size}
            max={grid.size}
            suffix="px"
            value={grid.offsetX}
            onChange={(offsetX) => setGrid({ offsetX }, 'offsetX')}
          />
          <NumberInput
            label="Desplaz. Y"
            size="sm"
            min={-grid.size}
            max={grid.size}
            suffix="px"
            value={grid.offsetY}
            onChange={(offsetY) => setGrid({ offsetY }, 'offsetY')}
          />
        </FieldGrid>
        <ColorField label="Color de las líneas" value={grid.color} palette={GRID_PALETTE} onChange={(color) => setGrid({ color }, 'color')} />
        <Slider
          label="Opacidad de las líneas"
          value={grid.opacity}
          onChange={(opacity) => setGrid({ opacity }, 'opacity')}
          min={0.05}
          max={1}
          step={0.05}
        />
      </PanelSection>
    </div>
  );
}
