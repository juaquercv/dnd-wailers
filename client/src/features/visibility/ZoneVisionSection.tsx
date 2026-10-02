import { useState } from 'react';
import { Info, RotateCcw, Save, Sun } from 'lucide-react';
import type { LiveState, SessionZone, ZoneVision } from '@wailers/shared';
import { api } from '../../api/http';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { toast } from '../../components/ui/toast';
import { useSessionStore } from '../../stores/session';
import { send } from '../game/map/actions';
import { hasOverride, heroTokenOf, playerIds, playerVisionInfo } from './playerVisibility';
import { cellsLabel, DEFAULT_ZONE_RADIUS, isLimitedMode, sameZoneVision, VISION_TITLES, zoneVisionSummary } from './visionText';
import { savedZoneVision } from './zoneVision';
import { ZoneVisionFields } from './ZoneVisionFields';

/** Resolves true once `check` passes on the live state (false after the timeout). */
function waitForState(check: (state: LiveState) => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const read = () => useSessionStore.getState().view?.state ?? null;
    const initial = read();
    if (initial && check(initial)) {
      resolve(true);
      return;
    }
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      unsubscribe();
      window.clearTimeout(timer);
      resolve(ok);
    };
    const unsubscribe = useSessionStore.subscribe(() => {
      const s = read();
      if (s && check(s)) finish(true);
    });
    const timer = window.setTimeout(() => finish(false), timeoutMs);
  });
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/** DM: vision of the zone being viewed (live change, back to the zone value, save it in the campaign). */
export function ZoneVisionSection({ state, zone }: { state: LiveState; zone: SessionZone }) {
  const zonesById = useSessionStore((s) => s.zonesById);
  const [saving, setSaving] = useState(false);
  const live = state.zoneStates[zone.id]?.vision ?? null;
  const saved = savedZoneVision(state, zone);
  const inForce = live ?? saved;
  const global = state.visibility.global;
  const startMode = global.visionMode === 'none' ? null : global.visionMode;

  const here = playerIds(state)
    .filter((id) => heroTokenOf(state, id)?.zoneId === zone.id)
    .map((id) => ({
      id,
      info: playerVisionInfo(state, id, (zid) => zonesById[zid]?.name ?? null),
      personal: hasOverride(state.visibility.perPlayer[id], 'visionMode'),
    }));
  const ownRadius = here.filter((h) => !h.personal && h.info.radiusSource === 'hero' && isLimitedMode(h.info.mode));
  const changed = live !== null && !sameZoneVision(live, saved);

  const setLive = (vision: ZoneVision | null) => {
    void send('zone:vision', { zoneId: zone.id, vision }, 'No se pudo cambiar la visión de la zona');
  };

  const saveAsDefault = async () => {
    if (!live) return;
    setSaving(true);
    try {
      await api.zones.update(zone.id, { vision: live });
    } catch (err) {
      toast.fromError(err, 'No se pudo guardar la visión de la zona');
      return;
    } finally {
      setSaving(false);
    }
    toast.success(`«${zone.name}» guarda esta visión`, { description: 'También se usará en las próximas partidas de la campaña.' });
    const synced = await waitForState((s) => sameZoneVision(s.zoneVision?.[zone.id] ?? null, live), 4000);
    if (synced) void send('zone:vision', { zoneId: zone.id, vision: null });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] leading-snug text-parchment-300">
        {live ? (
          <>
            <Badge tone="arcane" size="xs">
              Cambio en vivo
            </Badge>
            <span>Valor de la zona: {zoneVisionSummary(saved)}</span>
          </>
        ) : saved ? (
          <>
            <Badge tone="gold" size="xs">
              Valor de la zona
            </Badge>
            <span>Configurado en el editor de la campaña</span>
          </>
        ) : (
          <>
            <Badge size="xs">Valor inicial</Badge>
            <span>La zona no tiene visión propia: {VISION_TITLES[global.visionMode].toLowerCase()}</span>
          </>
        )}
      </div>

      <ZoneVisionFields value={inForce} onChange={setLive} fallbackMode={startMode} defaultRadius={saved?.radius ?? DEFAULT_ZONE_RADIUS} />

      {live && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<RotateCcw />} onClick={() => setLive(null)} title={`Vuelve a: ${zoneVisionSummary(saved)}`}>
            Volver al valor de la zona
          </Button>
          {changed && (
            <Button size="sm" variant="ghost" icon={<Save />} loading={saving} onClick={() => void saveAsDefault()} title="Guarda esta visión en la campaña">
              Guardar como valor de la zona
            </Button>
          )}
        </div>
      )}

      {!inForce && global.visionMode !== 'all' && (
        <div className="flex items-center gap-2 rounded-lg border border-ink-600/70 bg-ink-950/50 px-2.5 py-1.5">
          <span className="min-w-0 flex-1 text-[11px] leading-snug text-parchment-300">
            En las zonas sin visión propia los jugadores empiezan con «{VISION_TITLES[global.visionMode]}».
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon={<Sun />}
            onClick={() => void send('vis:setGlobal', { patch: { visionMode: 'all' } }, 'No se pudo cambiar el valor inicial')}
          >
            Todo visible
          </Button>
        </div>
      )}

      <p className="flex items-start gap-2 text-[11px] leading-snug text-parchment-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden />
        <span>
          Los jugadores que entren en esta zona usarán esta visión salvo que tengan una visión personal. Al salir, recuperan la de la zona a la que
          vayan.
        </span>
      </p>

      <div>
        <h5 className="label mb-1">En esta zona</h5>
        {here.length === 0 ? (
          <p className="text-[11px] text-parchment-400">No hay héroes de jugadores aquí.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {here.map(({ id, info, personal }) => {
              const p = state.players[id]!;
              const limited = isLimitedMode(info.mode);
              return (
                <li
                  key={id}
                  className="flex items-center gap-1.5 rounded-full border border-ink-600 bg-ink-800/70 py-0.5 pl-0.5 pr-2 text-[11px] text-parchment-100"
                  title={
                    personal
                      ? `Tiene una visión personal (${info.phrase}): la de la zona no le afecta`
                      : `Ve ${info.phrase}${info.radiusNote ? ` · ${info.radiusNote}` : ''}`
                  }
                >
                  <Avatar name={p.name} color={p.color} size="xs" />
                  {p.name}
                  {personal ? (
                    <span className="text-gold-300">· visión personal</span>
                  ) : (
                    limited && (
                      <span className={info.radiusSource === 'default' ? 'text-parchment-400' : 'text-sky-300'}>
                        · {cellsLabel(info.radius)}
                        {info.radiusSource === 'hero' ? ' (visión propia)' : info.radiusSource === 'personal' ? ' (radio personal)' : ''}
                      </span>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {ownRadius.length > 0 && (
          <p className="mt-1.5 flex items-start gap-2 text-[11px] leading-snug text-sky-200/90">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden />
            <span>
              {joinNames(ownRadius.map((h) => state.players[h.id]!.name))} {ownRadius.length === 1 ? 'tiene' : 'tienen'} visión propia en su ficha
              (p. ej. visión en la oscuridad): {ownRadius.length === 1 ? 've' : 'ven'} hasta su radio, no el de la zona.
            </span>
          </p>
        )}
      </div>
      {Object.keys(zonesById).length > 1 && (
        <p className="text-[11px] leading-snug text-parchment-400">Cambia de zona en la barra superior para ajustar otra.</p>
      )}
    </div>
  );
}
