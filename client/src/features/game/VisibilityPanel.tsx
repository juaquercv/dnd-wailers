import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  ChevronDown,
  CloudFog,
  DoorClosed,
  DoorOpen,
  Eye,
  EyeOff,
  Globe2,
  Handshake,
  History,
  ScanEye,
  UserCog,
  X,
} from 'lucide-react';
import type { VisibilitySettings, Wall } from '@wailers/shared';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Select } from '../../components/ui/Select';
import { Toggle } from '../../components/ui/Toggle';
import { toast } from '../../components/ui/toast';
import { useSessionStore } from '../../stores/session';
import { VisibilityForm } from '../visibility/VisibilityForm';
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

/** DM visibility controls: global and per-player settings, fog, exploration memory, doors and options. */
export function VisibilityPanel() {
  const view = useSessionStore((s) => s.view);
  const zonesById = useSessionStore((s) => s.zonesById);
  const viewZone = useSessionStore((s) => s.viewZone);
  const viewAsUserId = useSessionStore((s) => s.viewAsUserId);
  const setViewAs = useSessionStore((s) => s.setViewAs);
  const confirm = useConfirm();
  const [pickedPlayer, setPickedPlayer] = useState<string | null>(null);
  const [resetPlayer, setResetPlayer] = useState<string>('');
  const [resetLevelOnly, setResetLevelOnly] = useState(false);

  const state = view?.state ?? null;
  const players = useMemo(
    () => (state ? Object.values(state.players).sort((a, b) => a.name.localeCompare(b.name, 'es')) : []),
    [state],
  );

  if (!view || !state) return null;
  if (view.role !== 'dm') {
    return <EmptyState compact icon={<EyeOff />} title="Solo para el DM" description="La visibilidad la controla el director de juego." />;
  }

  const global = state.visibility.global;
  const playerId = pickedPlayer && state.players[pickedPlayer] ? pickedPlayer : players[0]?.userId ?? null;
  const overrides: Partial<VisibilitySettings> = playerId ? state.visibility.perPlayer[playerId] ?? {} : {};
  const overrideCount = Object.values(overrides).filter((v) => v !== undefined).length;
  const zone = viewZone ? zonesById[viewZone.zoneId] ?? null : null;
  const level = findLevel(zone, viewZone?.levelId);
  const zoneState = zone ? state.zoneStates[zone.id] : undefined;
  const revealed = new Set(zoneState?.revealedFog ?? []);
  const doorStates = zoneState?.doors ?? {};
  const regions = level?.fogRegions ?? [];
  const doors = level?.walls.filter((w) => w.kind === 'door') ?? [];
  const playerName = (id: string | null) => (id ? state.players[id]?.name ?? id : '');
  const heroName = (id: string) => {
    const heroId = state.players[id]?.heroId;
    return heroId ? state.heroes[heroId]?.name ?? null : null;
  };
  const playerOptions = players.map((p) => ({
    value: p.userId,
    label: `${p.name}${heroName(p.userId) ? ` · ${heroName(p.userId)}` : ''}${state.visibility.perPlayer[p.userId] ? ' ★' : ''}`,
  }));

  const setGlobal = (patch: Partial<VisibilitySettings>) => {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<VisibilitySettings>;
    if (Object.keys(clean).length === 0) return;
    void send('vis:setGlobal', { patch: clean }, 'No se pudo cambiar la visibilidad');
  };

  const setPlayer = async (patch: Partial<VisibilitySettings>) => {
    if (!playerId) return;
    // The server merges per-player patches; a null value removes that override. sceneImageUrl is the
    // exception (null is a real value: black screen), so clearing it rebuilds the whole override set.
    const wire: Record<string, unknown> = {};
    let rebuild = false;
    for (const [k, v] of Object.entries(patch) as [keyof VisibilitySettings, VisibilitySettings[keyof VisibilitySettings] | undefined][]) {
      if (v !== undefined) wire[k] = v;
      else if (k === 'sceneImageUrl') rebuild = k in overrides;
      else if (k in overrides) wire[k] = null;
    }
    if (rebuild) {
      const rest: Partial<VisibilitySettings> = { ...overrides };
      delete rest.sceneImageUrl;
      for (const [k, v] of Object.entries(wire)) {
        if (v === null) delete (rest as Record<string, unknown>)[k];
        else (rest as Record<string, unknown>)[k] = v;
      }
      const ok = await send('vis:setPlayer', { userId: playerId, patch: null }, 'No se pudo cambiar la visibilidad del jugador');
      if (!ok || Object.keys(rest).length === 0) return;
      await send('vis:setPlayer', { userId: playerId, patch: rest }, 'No se pudo cambiar la visibilidad del jugador');
      return;
    }
    if (Object.keys(wire).length === 0) return;
    // Null values are part of the wire protocol (remove override) even though the TS type has no null.
    await send('vis:setPlayer', { userId: playerId, patch: wire as Partial<VisibilitySettings> }, 'No se pudo cambiar la visibilidad del jugador');
  };

  const clearPlayer = () => {
    if (!playerId) return;
    void send('vis:setPlayer', { userId: playerId, patch: null }, 'No se pudieron quitar las personalizaciones').then((ok) => {
      if (ok) toast.success(`${playerName(playerId)} vuelve a usar los ajustes globales`);
    });
  };

  const revealAll = (on: boolean) => {
    if (!zone) return;
    const targets = regions.filter((r) => revealed.has(r.id) !== on);
    void sendMany('fog:reveal', targets.map((r) => ({ zoneId: zone.id, regionId: r.id, revealed: on })), 'No se pudo cambiar la niebla');
  };

  const resetExplored = async () => {
    const who = resetPlayer ? playerName(resetPlayer) : 'todos los jugadores';
    const where = resetLevelOnly && level ? ` en «${levelLabel(level)}»` : '';
    const ok = await confirm({
      title: 'Reiniciar memoria de exploración',
      message: `Se olvidará lo que ${resetPlayer ? `${who} ha` : 'han'} explorado${where}. Volverán a ver solo lo que tengan delante.`,
      confirmLabel: 'Reiniciar',
      danger: true,
    });
    if (!ok) return;
    const payload: { userId?: string; levelId?: string } = {};
    if (resetPlayer) payload.userId = resetPlayer;
    if (resetLevelOnly && level) payload.levelId = level.id;
    const done = await send('fog:resetExplored', payload, 'No se pudo reiniciar la exploración');
    if (done) toast.success(`Memoria de exploración reiniciada para ${who}`);
  };

  return (
    <div className="space-y-3">
      <Section icon={<Globe2 />} title="Ajustes globales">
        <VisibilityForm value={global} onChange={setGlobal} />
      </Section>

      <Section
        icon={<UserCog />}
        title="Por jugador"
        badge={overrideCount > 0 ? <Badge tone="gold" size="xs">{overrideCount}</Badge> : undefined}
        defaultOpen={false}
      >
        {players.length === 0 || !playerId ? (
          <EmptyState compact title="Sin jugadores" description="Cuando se unan jugadores podrás personalizar lo que ve cada uno." />
        ) : (
          <div className="space-y-3">
            <Select label="Jugador" value={playerId} onChange={(v) => setPickedPlayer(v)} options={playerOptions} size="sm" />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={viewAsUserId === playerId ? 'primary' : 'secondary'}
                icon={<ScanEye />}
                onClick={() => setViewAs(viewAsUserId === playerId ? null : playerId)}
              >
                {viewAsUserId === playerId ? 'Salir de la vista previa' : `Ver como ${playerName(playerId)}`}
              </Button>
              <Button size="sm" variant="ghost" icon={<X />} disabled={overrideCount === 0} onClick={clearPlayer}>
                Quitar personalizaciones
              </Button>
            </div>
            <VisibilityForm key={playerId} value={overrides} base={global} allowInherit onChange={(p) => void setPlayer(p)} />
          </div>
        )}
      </Section>

      <Section
        icon={<CloudFog />}
        title={level ? `Niebla · ${levelLabel(level)}` : 'Niebla'}
        badge={regions.length > 0 ? <Badge size="xs">{`${regions.filter((r) => revealed.has(r.id)).length}/${regions.length}`}</Badge> : undefined}
      >
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
      </Section>

      <Section icon={<History />} title="Memoria de exploración" defaultOpen={false}>
        <div className="space-y-3">
          <p className="text-xs leading-snug text-parchment-400">
            En el modo «Solo lo explorado» cada jugador recuerda lo que ha visto. Puedes borrarlo (por ejemplo, tras un hechizo de olvido o al cambiar el mapa).
          </p>
          <Select
            label="Jugadores"
            size="sm"
            value={resetPlayer}
            onChange={setResetPlayer}
            options={[{ value: '', label: 'Todos los jugadores' }, ...players.map((p) => ({ value: p.userId, label: p.name }))]}
          />
          {level && <Checkbox size="sm" checked={resetLevelOnly} onChange={setResetLevelOnly} label={`Solo «${levelLabel(level)}»`} />}
          <Button size="sm" variant="danger" icon={<History />} onClick={() => void resetExplored()}>
            Reiniciar memoria
          </Button>
        </div>
      </Section>

      <Section icon={<DoorOpen />} title="Puertas" badge={doors.length > 0 ? <Badge size="xs">{doors.length}</Badge> : undefined} defaultOpen={doors.length > 0}>
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
      </Section>

      <Section icon={<Handshake />} title="Opciones de la partida" defaultOpen={false}>
        <Toggle
          checked={state.options.tradeNeedsApproval}
          onChange={(v) => void send('session:setOptions', { patch: { tradeNeedsApproval: v } }, 'No se pudo cambiar la opción')}
          label="Los intercambios requieren aprobación del DM"
          description="Los trueques entre jugadores esperan tu visto bueno antes de completarse."
        />
      </Section>

      <Section icon={<ScanEye />} title="Ver como jugador">
        {players.length === 0 ? (
          <p className="text-xs text-parchment-400">Aún no hay jugadores en la partida.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={viewAsUserId === null ? 'primary' : 'ghost'} onClick={() => setViewAs(null)}>
              Vista del DM
            </Button>
            {players.map((p) => (
              <Button
                key={p.userId}
                size="sm"
                variant={viewAsUserId === p.userId ? 'primary' : 'secondary'}
                onClick={() => setViewAs(viewAsUserId === p.userId ? null : p.userId)}
              >
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
                {p.name}
              </Button>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
