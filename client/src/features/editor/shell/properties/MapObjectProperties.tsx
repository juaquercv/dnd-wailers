import { CloudFog, DoorOpen, Lightbulb, Move, Sparkles } from 'lucide-react';
import type { FogRegion, LightSource, Wall } from '@wailers/shared';
import { NumberInput, Slider, TextInput, Toggle } from '../../../../components/ui';
import { plural } from '../../../../lib/format';
import { ColorField } from '../ColorSwatch';
import { FieldGrid, Segmented, StatLine } from '../controls';
import { LIGHT_PALETTE, SELECTION_KIND_INFO, WALL_KIND_INFO, WALL_KINDS } from '../labels';
import { PanelSection } from '../PanelSection';
import { deleteItems, polylineLength, PropertyHeader, useLevelObjectUpdaters } from './common';

export function WallProperties({ wall, gridSize }: { wall: Wall; gridSize: number }) {
  const { updateWall } = useLevelObjectUpdaters();
  const info = WALL_KIND_INFO[wall.kind];
  const segments = Math.max(0, Math.floor(wall.points.length / 2) - 1);
  const length = polylineLength(wall.points);
  return (
    <div className="flex flex-col">
      <PropertyHeader
        icon={info.icon}
        kindLabel={SELECTION_KIND_INFO.wall.label}
        title={info.label}
        onDelete={() => deleteItems([{ kind: 'wall', id: wall.id }])}
      />
      <PanelSection id="wall-kind" title="Tipo" icon={<DoorOpen />}>
        <Segmented<Wall['kind']>
          value={wall.kind}
          onChange={(kind) => updateWall(wall.id, { kind, open: kind === 'door' ? wall.open : false })}
          fill
          aria-label="Tipo de pared"
          options={WALL_KINDS.map((k) => {
            const KindIcon = WALL_KIND_INFO[k].icon;
            return { value: k, label: WALL_KIND_INFO[k].label, icon: <KindIcon aria-hidden /> };
          })}
        />
        <StatLine>{info.description}</StatLine>
        {wall.kind === 'door' && (
          <Toggle
            size="sm"
            checked={wall.open}
            onChange={(open) => updateWall(wall.id, { open })}
            label="Abierta al empezar"
            description="Estado inicial de la puerta en la partida; el DM la abre o cierra con un clic."
          />
        )}
        <StatLine>
          {plural(segments, 'tramo', 'tramos')} · {Math.round(length)} px ({(length / Math.max(1, gridSize)).toFixed(1).replace('.', ',')}{' '}
          casillas)
        </StatLine>
      </PanelSection>
    </div>
  );
}

export function LightProperties({ light, gridSize }: { light: LightSource; gridSize: number }) {
  const { updateLight } = useLevelObjectUpdaters();
  return (
    <div className="flex flex-col">
      <PropertyHeader
        icon={Lightbulb}
        kindLabel={SELECTION_KIND_INFO.light.label}
        title={`Radio ${Math.round(light.radius)} px`}
        onDelete={() => deleteItems([{ kind: 'light', id: light.id }])}
      />
      <PanelSection id="light-props" title="Luz" icon={<Sparkles />}>
        <Slider
          label="Radio"
          value={light.radius}
          onChange={(radius) => updateLight(light.id, { radius }, 'radius')}
          min={20}
          max={2000}
          step={5}
          formatValue={(v) => `${Math.round(v)} px · ${(v / Math.max(1, gridSize)).toFixed(1).replace('.', ',')} c`}
        />
        <ColorField label="Color" value={light.color} palette={LIGHT_PALETTE} onChange={(color) => updateLight(light.id, { color }, 'color')} />
        <Slider
          label="Intensidad"
          value={light.intensity}
          onChange={(intensity) => updateLight(light.id, { intensity }, 'intensity')}
          min={0.05}
          max={1}
          step={0.05}
        />
        <Toggle
          size="sm"
          checked={light.flicker}
          onChange={(flicker) => updateLight(light.id, { flicker })}
          label="Parpadeo"
          description="Titila como una antorcha o una vela."
        />
      </PanelSection>
      <PanelSection id="light-position" title="Posición" icon={<Move />}>
        <FieldGrid>
          <NumberInput label="X" size="sm" integer value={Math.round(light.x)} onChange={(x) => updateLight(light.id, { x }, 'x')} />
          <NumberInput label="Y" size="sm" integer value={Math.round(light.y)} onChange={(y) => updateLight(light.id, { y }, 'y')} />
        </FieldGrid>
      </PanelSection>
    </div>
  );
}

export function FogProperties({ fog }: { fog: FogRegion }) {
  const { updateFog } = useLevelObjectUpdaters();
  const vertices = Math.floor(fog.points.length / 2);
  return (
    <div className="flex flex-col">
      <PropertyHeader
        icon={CloudFog}
        kindLabel={SELECTION_KIND_INFO.fog.label}
        title={fog.name || 'Sin nombre'}
        onDelete={() => deleteItems([{ kind: 'fog', id: fog.id }])}
      />
      <PanelSection id="fog-props" title="Región de niebla" icon={<CloudFog />}>
        <TextInput
          label="Nombre"
          size="sm"
          value={fog.name}
          maxLength={60}
          placeholder="Sala del tesoro…"
          onValueChange={(name) => updateFog(fog.id, { name }, 'name')}
          hint="El DM verá este nombre al revelar la región durante la partida."
        />
        <StatLine>{plural(vertices, 'vértice', 'vértices')}. Los jugadores no ven lo que hay dentro hasta que el DM la revela.</StatLine>
      </PanelSection>
    </div>
  );
}
