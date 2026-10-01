import { useMemo } from 'react';
import { ArrowLeftRight, Crosshair, LogIn, TriangleAlert } from 'lucide-react';
import { newId, type SpawnPoint, type TransitionElement, type Zone, type ZoneLevel } from '@wailers/shared';
import { Button, NumberInput, Select, toast, useConfirm, type SelectOption } from '../../../../components/ui';
import { useEditorStore } from '../../editorStore';
import { FieldGrid } from '../controls';
import { elevationBadge, reciprocalTransitionType } from '../labels';
import { levelCenter, sortLevelsByElevation } from '../levelUtils';
import { zoneSelectOptions } from '../zoneTree';
import { fieldKey } from './common';

/** Level a new target should land on: stairs go to the floor above/below when aiming at the same zone. */
function defaultTargetLevel(targetZone: Zone, el: TransitionElement, zone: Zone, level: ZoneLevel): ZoneLevel | undefined {
  const fallback = targetZone.levels.find((l) => l.id === targetZone.defaultLevelId) ?? targetZone.levels[0];
  if (targetZone.id !== zone.id) return fallback;
  const others = targetZone.levels.filter((l) => l.id !== level.id);
  if (others.length === 0) return fallback;
  if (el.transitionType === 'stairs_up') {
    const above = others.filter((l) => l.elevation > level.elevation).sort((a, b) => a.elevation - b.elevation)[0];
    if (above) return above;
  }
  if (el.transitionType === 'stairs_down') {
    const below = others.filter((l) => l.elevation < level.elevation).sort((a, b) => b.elevation - a.elevation)[0];
    if (below) return below;
  }
  return others.find((l) => l.id === targetZone.defaultLevelId) ?? others[0];
}

export interface TransitionTargetEditorProps {
  el: TransitionElement;
  zone: Zone;
  level: ZoneLevel;
}

/** Destination picker of a transition: zone → level → x/y, plus "go there" and "create the way back". */
export function TransitionTargetEditor({ el, zone, level }: TransitionTargetEditorProps) {
  const zones = useEditorStore((s) => s.zones);
  const updateElement = useEditorStore((s) => s.updateElement);
  const updateZone = useEditorStore((s) => s.updateZone);
  const selectZone = useEditorStore((s) => s.selectZone);
  const setSelection = useEditorStore((s) => s.setSelection);
  const confirm = useConfirm();

  const target = el.target;
  const targetZone = target ? zones.find((z) => z.id === target.zoneId) ?? null : null;
  const targetLevel = target && targetZone ? targetZone.levels.find((l) => l.id === target.levelId) ?? null : null;

  const zoneOptions = useMemo<SelectOption<string | null>[]>(
    () => [
      { value: null, label: '— Sin destino —' },
      ...zoneSelectOptions(zones).map((o) => ({ ...o, value: o.value as string | null })),
    ],
    [zones],
  );
  const levelOptions = useMemo<SelectOption<string>[]>(
    () =>
      targetZone
        ? sortLevelsByElevation(targetZone.levels).map((l) => ({
            value: l.id,
            label: `${l.name} (${elevationBadge(l.elevation)})${l.id === targetZone.defaultLevelId ? ' ★' : ''}`,
          }))
        : [],
    [targetZone],
  );

  const setTarget = (next: SpawnPoint | null, field?: string) =>
    updateElement(el.id, { target: next }, field ? fieldKey(el.id, field) : undefined);

  const pickZone = (zoneId: string | null) => {
    if (!zoneId) {
      setTarget(null);
      return;
    }
    const z = zones.find((x) => x.id === zoneId);
    const lvl = z ? defaultTargetLevel(z, el, zone, level) : undefined;
    if (!z || !lvl) return;
    setTarget({ zoneId: z.id, levelId: lvl.id, ...levelCenter(lvl) });
  };

  const pickLevel = (levelId: string) => {
    if (!targetZone) return;
    const lvl = targetZone.levels.find((l) => l.id === levelId);
    if (lvl) setTarget({ zoneId: targetZone.id, levelId: lvl.id, ...levelCenter(lvl) });
  };

  const goToTarget = () => {
    if (!targetZone || !targetLevel || !target) return;
    selectZone(targetZone.id, targetLevel.id);
  };

  const createWayBack = async () => {
    if (!target || !targetZone || !targetLevel) return;
    const exists = targetLevel.elements.some(
      (e) => e.type === 'transition' && e.target?.zoneId === zone.id && e.target.levelId === level.id,
    );
    if (exists) {
      const ok = await confirm({
        title: 'Ya hay una transición de vuelta',
        message: `«${targetLevel.name}» ya tiene una transición que lleva aquí. ¿Crear otra igualmente?`,
        confirmLabel: 'Crear otra',
      });
      if (!ok) return;
    }
    const sameZone = targetZone.id === zone.id;
    const back: TransitionElement = {
      id: newId('el'),
      type: 'transition',
      layer: el.layer,
      x: Math.round(target.x),
      y: Math.round(target.y),
      rotation: el.rotation,
      hidden: el.hidden,
      locked: false,
      name: '',
      transitionType: reciprocalTransitionType(el.transitionType),
      width: el.width,
      height: el.height,
      label: `Volver a ${sameZone ? level.name : zone.name}`,
      target: { zoneId: zone.id, levelId: level.id, x: Math.round(el.x), y: Math.round(el.y) },
    };
    const targetZoneId = targetZone.id;
    const targetLevelId = targetLevel.id;
    updateZone(targetZoneId, (d) => {
      const l = d.levels.find((x) => x.id === targetLevelId);
      if (l) l.elements.push(back);
    });
    toast.success(sameZone ? `Transición de vuelta creada en «${targetLevel.name}»` : `Transición de vuelta creada en «${targetZone.name}» (${targetLevel.name})`, {
      action: {
        label: 'Ver',
        onClick: () => {
          selectZone(targetZoneId, targetLevelId);
          setSelection([{ kind: 'element', id: back.id }]);
        },
      },
    });
  };

  const sameSpot = target && target.zoneId === zone.id && target.levelId === level.id;

  return (
    <div className="flex flex-col gap-2.5">
      <Select<string | null>
        label="Zona de destino"
        size="sm"
        value={targetZone ? targetZone.id : null}
        options={zoneOptions}
        onChange={pickZone}
      />
      {target && !targetZone && (
        <p className="flex items-start gap-1.5 text-[11px] text-blood-300">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          La zona de destino ya no existe. Elige otra.
        </p>
      )}
      {targetZone && target && (
        <>
          <Select<string>
            label="Nivel"
            size="sm"
            value={targetLevel ? targetLevel.id : ''}
            options={levelOptions}
            onChange={pickLevel}
            placeholder="El nivel ya no existe"
          />
          <FieldGrid>
            <NumberInput
              label="Llegada X"
              size="sm"
              integer
              min={0}
              max={targetLevel?.background.width}
              suffix="px"
              value={Math.round(target.x)}
              onChange={(x) => setTarget({ ...target, x }, 'target-x')}
            />
            <NumberInput
              label="Llegada Y"
              size="sm"
              integer
              min={0}
              max={targetLevel?.background.height}
              suffix="px"
              value={Math.round(target.y)}
              onChange={(y) => setTarget({ ...target, y }, 'target-y')}
            />
          </FieldGrid>
          {sameSpot && <p className="text-[11px] text-gold-300">El destino es este mismo nivel: funcionará como un atajo.</p>}
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              icon={<Crosshair />}
              disabled={!targetLevel}
              onClick={() => targetLevel && setTarget({ ...target, ...levelCenter(targetLevel) })}
            >
              Centro del nivel
            </Button>
            <Button size="sm" variant="ghost" icon={<LogIn />} disabled={!targetLevel} onClick={goToTarget}>
              Ir al destino
            </Button>
          </div>
          <Button size="sm" icon={<ArrowLeftRight />} disabled={!targetLevel} onClick={() => void createWayBack()} block>
            Crear transición de vuelta
          </Button>
        </>
      )}
      {!target && (
        <p className="text-[11px] leading-snug text-parchment-400">
          Sin destino, la transición es solo decorativa. Elige una zona (o este mismo lugar en otro nivel para escaleras).
        </p>
      )}
    </div>
  );
}
