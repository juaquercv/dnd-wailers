import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  ChevronDown,
  CloudFog,
  DoorClosed,
  DoorOpen,
  Eye,
  EyeOff,
  Gavel,
  History,
  MapPinned,
  ScanEye,
  UserRound,
  X,
} from 'lucide-react';
import { sessionOptionsOf, type SessionOptions, type Wall } from '@wailers/shared';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Select } from '../../components/ui/Select';
import { Toggle } from '../../components/ui/Toggle';
import { toast } from '../../components/ui/toast';
import { useSessionStore } from '../../stores/session';
import { EveryoneCard } from '../visibility/EveryoneCard';
import { PlayerCard } from '../visibility/PlayerCard';
import { playerIds } from '../visibility/playerVisibility';
import { zoneVisionSummary } from '../visibility/visionText';
import { zoneVisionInForce } from '../visibility/zoneVision';
import { ZoneVisionSection } from '../visibility/ZoneVisionSection';
import { send, sendMany } from './map/actions';
import { gameCamera } from './map/camera';
import { findLevel, levelLabel } from './map/zoneTree';

function Section({
  icon,
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-ink-600/80 bg-ink-900/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="text-gold-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="min-w-0 flex-1 truncate font-display text-xs font-semibold uppercase tracking-[0.12em] text-gold-300">{title}</span>
        {badge}
        <ChevronDown className={clsx('h-4 w-4 shrink-0 text-parchment-400 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <div className="border-t border-ink-600/70 px-3 py-3">{children}</div>}
    </section>
  );
}

function SubHeading({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-parchment-300 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-gold-500">
      {icon}
      {children}
    </h4>
  );
}

function centroid(points: number[]): { x: number; y: number } | null {
  const n = Math.floor(points.length / 2);
  if (n === 0) return null;
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += points[2 * i] ?? 0;
    y += points[2 * i + 1] ?? 0;
  }
  return { x: x / n, y: y / n };
}

function doorMidpoint(wall: Wall): { x: number; y: number } | null {
  const pts = wall.points;
  if (pts.length < 4) return null;
  const mid = Math.floor(pts.length / 4) * 2;
  const ax = pts[mid - 2] ?? pts[0]!;
  const ay = pts[mid - 1] ?? pts[1]!;
  const bx = pts[mid] ?? pts[2]!;
  const by = pts[mid + 1] ?? pts[3]!;
  return { x: (ax + bx) / 2, y: (ay + by) / 2 };
}

const RULES: { key: keyof Required<SessionOptions>; label: string; description: string }[] = [
  {
    key: 'turnEconomy',
    label: 'Limitar movimiento y acciones en combate',
    description: 'En combate cada héroe se mueve solo en su turno, hasta su movimiento, y gasta sus acciones de combate. Fuera de combate se mueven libremente.',
  },
  {
    key: 'playersCanPickUp',
    label: 'Los jugadores pueden recoger objetos',
    description: 'Recoger un objeto junto a su héroe es gratis: no gasta movimiento ni acciones.',
  },
  {
    key: 'playersCanUseDoors',
    label: 'Los jugadores pueden usar puertas',
    description: 'Abrir o cerrar una puerta junto a su héroe es gratis.',
  },
  {
    key: 'tradeNeedsApproval',
    label: 'Los intercambios requieren aprobación',
    description: 'Los intercambios nunca gastan turno; con esto activo esperan tu visto bueno.',
  },
];

/**
 * DM "Jugadores y visión": what each player can do and see (movement, vision that follows the zone or a
 * personal one, screen permissions), the vision of the current zone, fog, doors and the session rules.
 */
export function VisibilityPanel() {
  const view = useSessionStore((s) => s.view);
  const zonesById = useSessionStore((s) => s.zonesById);
  const viewZone = useSessionStore((s) => s.viewZone);
  const viewAsUserId = useSessionStore((s) => s.viewAsUserId);
  const setViewAs = useSessionStore((s) => s.setViewAs);
  const confirm = useConfirm();
  const [resetPlayer, setResetPlayer] = useState<string>('');
  const [resetLevelOnly, setResetLevelOnly] = useState(false);

  const state = view?.state ?? null;
  const ids = useMemo(() => (state ? playerIds(state) : []), [state]);

  if (!view || !state) return null;
  if (view.role !== 'dm') {
    return <EmptyState compact icon={<EyeOff />} title="Solo para el DM" description="Lo que ve cada jugador lo decide el director de juego." />;
  }

  const zone = viewZone ? zonesById[viewZone.zoneId] ?? null : null;
  const level = findLevel(zone, viewZone?.levelId);
  const zoneState = zone ? state.zoneStates[zone.id] : undefined;
  const revealed = new Set(zoneState?.revealedFog ?? []);
  const doorStates = zoneState?.doors ?? {};
  const regions = level?.fogRegions ?? [];
  const doors = level?.walls.filter((w) => w.kind === 'door') ?? [];
  const options = sessionOptionsOf(state);
  const playerName = (id: string) => state.players[id]?.name ?? id;
  const previewName = viewAsUserId ? state.players[viewAsUserId]?.name ?? null : null;
  const zoneVision = zone ? zoneVisionInForce(state, zone) : null;
  const zoneLive = zone ? !!state.zoneStates[zone.id]?.vision : false;

  const revealAll = (on: boolean) => {
    if (!zone) return;
    const targets = regions.filter((r) => revealed.has(r.id) !== on);
    void sendMany('fog:reveal', targets.map((r) => ({ zoneId: zone.id, regionId: r.id, revealed: on })), 'No se pudo cambiar la niebla');
  };

  const resetExplored = async () => {
    const who = resetPlayer ? playerName(resetPlayer) : 'todos los jugadores';
    const where = resetLevelOnly && level ? ` en «${levelLabel(level)}»` : '';
    const ok = await confirm({
      title: 'Olvidar lo explorado',
      message: `Se olvidará lo que ${resetPlayer ? `${who} ha` : 'han'} explorado${where}. En las zonas con visión «Explorado» volverán a ver solo lo que tengan delante.`,
      confirmLabel: 'Olvidar',
      danger: true,
    });
    if (!ok) return;
    const payload: { userId?: string; levelId?: string } = {};
    if (resetPlayer) payload.userId = resetPlayer;
    if (resetLevelOnly && level) payload.levelId = level.id;
    const done = await send('fog:resetExplored', payload, 'No se pudo reiniciar la exploración');
    if (done) toast.success(`Memoria de exploración borrada para ${who}`);
  };

  const setOption = (key: keyof Required<SessionOptions>, value: boolean) => {
    void send('session:setOptions', { patch: { [key]: value } }, 'No se pudo cambiar la regla');
  };

  return (
    <div className="space-y-3">
      {previewName && (
        <div className="flex items-center gap-2 rounded-xl border border-arcane-500/60 bg-arcane-500/10 px-3 py-2 shadow-glow-arcane">
          <ScanEye className="h-4 w-4 shrink-0 text-arcane-300" aria-hidden />
          <span className="min-w-0 flex-1 text-xs leading-snug text-parchment-100">
            Estás viendo la partida como <strong className="text-arcane-300">{previewName}</strong>
          </span>
          <Button size="sm" variant="secondary" icon={<X />} onClick={() => setViewAs(null)}>
            Volver
          </Button>
        </div>
      )}

      <p className="px-0.5 text-[11px] leading-snug text-parchment-400">
        Todos empiezan viendo todo el mapa. Cada jugador ve según la zona donde está su héroe: si una zona tiene poca visión (una cueva…), al entrar la
        pierde y al salir la recupera.
      </p>

      <EveryoneCard state={state} />

      <Section icon={<UserRound />} title="Jugadores" badge={ids.length > 0 ? <Badge size="xs">{ids.length}</Badge> : undefined}>
        {ids.length === 0 ? (
          <EmptyState compact title="Sin jugadores" description="Cuando se unan jugadores podrás decidir qué puede hacer y ver cada uno." />
        ) : (
          <div className="space-y-2.5">
            {ids.map((id) => (
              <PlayerCard key={id} state={state} userId={id} defaultOpen={ids.length === 1} />
            ))}
          </div>
        )}
      </Section>

      <Section
        icon={<MapPinned />}
        title={zone ? `Zona actual: ${zone.name}` : 'Zona actual'}
        badge={
          zone ? (
            <Badge size="xs" tone={zoneLive ? 'arcane' : zoneVision && zoneVision.mode !== 'all' ? 'gold' : 'neutral'}>
              {zoneVision ? zoneVisionSummary(zoneVision).split(' · ')[0] : 'Valor inicial'}
            </Badge>
          ) : undefined
        }
      >
        {zone ? (
          <ZoneVisionSection key={zone.id} state={state} zone={zone} />
        ) : (
          <p className="text-xs text-parchment-400">Elige una zona en la barra superior.</p>
        )}
      </Section>

      <Section
        icon={<CloudFog />}
        title="Niebla y puertas"
        badge={regions.length + doors.length > 0 ? <Badge size="xs">{regions.length + doors.length}</Badge> : undefined}
        defaultOpen={regions.length + doors.length > 0}
      >
        <div className="space-y-4">
          <div>
            <SubHeading icon={<CloudFog />}>
              Niebla{level ? ` · ${levelLabel(level)}` : ''}
              {regions.length > 0 && <span className="ml-auto font-normal normal-case tracking-normal text-parchment-400">{`${regions.filter((r) => revealed.has(r.id)).length}/${regions.length} reveladas`}</span>}
            </SubHeading>
            {!zone || regions.length === 0 ? (
              <p className="text-xs text-parchment-400">Este nivel no tiene regiones de niebla. Créalas en el editor de la campaña.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" icon={<Eye />} onClick={() => revealAll(true)} disabled={regions.every((r) => revealed.has(r.id))}>
                    Revelar todo
                  </Button>
                  <Button size="sm" variant="ghost" icon={<EyeOff />} onClick={() => revealAll(false)} disabled={!regions.some((r) => revealed.has(r.id))}>
                    Ocultar todo
                  </Button>
                </div>
                <ul className="space-y-1">
                  {regions.map((r) => {
                    const on = revealed.has(r.id);
                    const c = centroid(r.points);
                    return (
                      <li key={r.id} className="flex items-center gap-2 rounded-lg border border-ink-600/70 bg-ink-800/50 px-2.5 py-1.5">
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left text-sm text-parchment-100 hover:text-gold-200"
                          title="Centrar en el mapa"
                          onClick={() => c && gameCamera.centerOn(c.x, c.y)}
                        >
                          {r.name || 'Región sin nombre'}
                        </button>
                        <Badge size="xs" tone={on ? 'emerald' : 'arcane'}>
                          {on ? 'Revelada' : 'Oculta'}
                        </Badge>
                        <Toggle
                          size="sm"
                          checked={on}
                          title={on ? 'Ocultar a los jugadores' : 'Revelar a los jugadores'}
                          onChange={(v) => void send('fog:reveal', { zoneId: zone.id, regionId: r.id, revealed: v }, 'No se pudo cambiar la niebla')}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <div>
            <SubHeading icon={<DoorOpen />}>Puertas</SubHeading>
            {!zone || doors.length === 0 ? (
              <p className="text-xs text-parchment-400">No hay puertas en este nivel.</p>
            ) : (
              <ul className="space-y-1">
                {doors.map((d, i) => {
                  const open = doorStates[d.id] ?? d.open;
                  const mid = doorMidpoint(d);
                  return (
                    <li key={d.id} className="flex items-center gap-2 rounded-lg border border-ink-600/70 bg-ink-800/50 px-2.5 py-1.5">
                      {open ? <DoorOpen className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden /> : <DoorClosed className="h-4 w-4 shrink-0 text-gold-500" aria-hidden />}
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-sm text-parchment-100 hover:text-gold-200"
                        title="Centrar en el mapa"
                        onClick={() => mid && gameCamera.centerOn(mid.x, mid.y)}
                      >
                        Puerta {i + 1}
                        <span className="ml-1.5 text-xs text-parchment-400">{open ? 'abierta' : 'cerrada'}</span>
                      </button>
                      <Toggle
                        size="sm"
                        checked={open}
                        title={open ? 'Cerrar' : 'Abrir'}
                        onChange={(v) => void send('door:toggle', { zoneId: zone.id, wallId: d.id, open: v }, 'No se pudo cambiar la puerta')}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <SubHeading icon={<History />}>Memoria de exploración</SubHeading>
            <div className="space-y-2.5">
              <p className="text-xs leading-snug text-parchment-400">
                En las zonas con visión «Explorado» cada jugador recuerda lo que ya vio. Puedes hacer que lo olvide (un hechizo de olvido, un mapa que cambia…).
              </p>
              <Select
                label="Jugadores"
                size="sm"
                value={resetPlayer}
                onChange={setResetPlayer}
                options={[{ value: '', label: 'Todos los jugadores' }, ...ids.map((id) => ({ value: id, label: playerName(id) }))]}
              />
              {level && <Checkbox size="sm" checked={resetLevelOnly} onChange={setResetLevelOnly} label={`Solo «${levelLabel(level)}»`} />}
              <Button size="sm" variant="danger" icon={<History />} onClick={() => void resetExplored()}>
                Olvidar lo explorado
              </Button>
            </div>
          </div>
        </div>
      </Section>

      <Section icon={<Gavel />} title="Reglas de la partida">
        <div className="space-y-3">
          {RULES.map((r) => (
            <Toggle key={r.key} checked={options[r.key]} onChange={(v) => setOption(r.key, v)} label={r.label} description={r.description} />
          ))}
        </div>
      </Section>
    </div>
  );
}
