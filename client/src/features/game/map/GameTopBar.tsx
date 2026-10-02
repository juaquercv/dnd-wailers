import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Ban, DoorOpen, Eye, MapPinned, MoreVertical, Pause, Presentation, Save, ScanEye, Search } from 'lucide-react';
import { emitAck } from '../../../api/socket';
import { D20Icon } from '../../../components/layout/Logo';
import { Button } from '../../../components/ui/Button';
import { useConfirm } from '../../../components/ui/ConfirmDialog';
import { useContextMenu, type ContextMenuItem } from '../../../components/ui/ContextMenu';
import { IconButton } from '../../../components/ui/IconButton';
import { Kbd } from '../../../components/ui/Kbd';
import { Select, type SelectOption } from '../../../components/ui/Select';
import { toast } from '../../../components/ui/toast';
import { useDisplayState, useSessionStore } from '../../../stores/session';
import { markSelfExit } from '../../lobby/lobbyUi';
import { ZoneNavigator } from '../ZoneNavigator';
import { currencyNoun, joinWords } from '../panels/currencyText';
import { send } from './actions';

export interface GameTopBarProps {
  onQuickSearch: () => void;
  onShowToPlayers: () => void;
  onOverview: () => void;
}

function ConnectionDot() {
  const connected = useSessionStore((s) => s.socketConnected);
  return (
    <span
      className="relative flex h-2.5 w-2.5 shrink-0"
      title={connected ? 'Conectado con el servidor' : 'Sin conexión: reconectando…'}
      role="status"
      aria-label={connected ? 'Conectado' : 'Sin conexión'}
    >
      {!connected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blood-400 opacity-70" />}
      <span
        className={clsx(
          'relative inline-flex h-2.5 w-2.5 rounded-full',
          connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-blood-500',
        )}
      />
    </span>
  );
}

/** Top bar of the game table: session title, zone navigator, DM tools and connection state. */
export function GameTopBar({ onQuickSearch, onShowToPlayers, onOverview }: GameTopBarProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const menu = useContextMenu();
  const isDm = useSessionStore((s) => s.view?.role === 'dm');
  const sessionName = useSessionStore((s) => s.view?.state.name ?? '');
  const campaignName = useSessionStore((s) => s.campaign?.name ?? '');
  const rules = useSessionStore((s) => s.campaign?.rules ?? null);
  const hostUserId = useSessionStore((s) => s.view?.state.hostUserId ?? null);
  const playersRecord = useSessionStore((s) => s.view?.state.players);
  const viewAsUserId = useSessionStore((s) => s.viewAsUserId);
  const setViewAs = useSessionStore((s) => s.setViewAs);
  const hasOverview = useSessionStore((s) => !!s.overview && (!!s.overview.imageUrl || s.overview.pins.length > 0));
  const { effective } = useDisplayState();
  const moreRef = useRef<HTMLButtonElement>(null);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const players = useMemo(
    () =>
      Object.values(playersRecord ?? {})
        .filter((p) => p.userId !== hostUserId)
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [playersRecord, hostUserId],
  );

  const viewAsOptions = useMemo<SelectOption<string>[]>(
    () => [{ value: '', label: 'Vista del DM' }, ...players.map((p) => ({ value: p.userId, label: `Como ${p.name}`, group: 'Ver como jugador' }))],
    [players],
  );

  const canSeeOverview = isDm ? hasOverview : !!effective?.canSeeOverview && hasOverview;

  const save = async () => {
    setSaving(true);
    // The server confirms with its own «Partida guardada» toast event.
    await send('session:save', {}, 'No se pudo guardar la partida');
    setSaving(false);
  };

  const pauseAndExit = async () => {
    const ok = await confirm({
      title: 'Pausar y salir',
      message: 'Se guardará la partida y todos volverán al menú. Podrás reanudarla más tarde desde «Hostear partida».',
      confirmLabel: 'Pausar partida',
      icon: <Pause className="h-5 w-5" />,
    });
    if (!ok) return;
    setLeaving(true);
    markSelfExit();
    try {
      await emitAck('session:pause', {});
      toast.success('Partida pausada y guardada');
      navigate('/hostear');
    } catch (err) {
      toast.fromError(err, 'No se pudo pausar la partida');
    } finally {
      setLeaving(false);
    }
  };

  const endSession = async () => {
    const money = currencyNoun(rules);
    const progress = joinWords(['inventario', ...(money ? [money] : []), ...(rules?.xpEnabled ? ['experiencia'] : [])]);
    const ok = await confirm({
      title: 'Terminar la sesión',
      message: `La partida terminará para todos y no se podrá reanudar. Los héroes conservan su progreso (${progress}).`,
      confirmLabel: 'Terminar sesión',
      danger: true,
      icon: <Ban className="h-5 w-5" />,
    });
    if (!ok) return;
    setLeaving(true);
    markSelfExit();
    try {
      await emitAck('session:end', {});
      toast.success('Sesión terminada');
      navigate('/menu');
    } catch (err) {
      toast.fromError(err, 'No se pudo terminar la sesión');
    } finally {
      setLeaving(false);
    }
  };

  const leaveAsPlayer = async () => {
    const ok = await confirm({
      title: 'Salir de la partida',
      message: 'Volverás al menú. Podrás unirte de nuevo mientras la partida siga abierta.',
      confirmLabel: 'Salir',
      icon: <DoorOpen className="h-5 w-5" />,
    });
    if (ok) navigate('/menu');
  };

  const openMore = () => {
    const anchor = moreRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const items: ContextMenuItem[] = [];
    if (isDm) {
      items.push(
        { heading: true, label: 'Ver como' },
        { label: 'Vista del DM', icon: <Eye />, checked: viewAsUserId === null, onClick: () => setViewAs(null) },
        ...players.map((p) => ({
          label: p.name,
          icon: <ScanEye />,
          checked: viewAsUserId === p.userId,
          onClick: () => setViewAs(p.userId),
        })),
        { separator: true },
        { label: 'Buscar en la biblioteca', icon: <Search />, shortcut: 'Ctrl+K', onClick: onQuickSearch },
        { label: 'Mostrar a jugadores', icon: <Presentation />, onClick: onShowToPlayers },
        { label: 'Mapa general', icon: <MapPinned />, disabled: !hasOverview, onClick: onOverview },
        { label: 'Guardar ahora', icon: <Save />, onClick: () => void save() },
        { separator: true },
        { label: 'Pausar y salir', icon: <Pause />, onClick: () => void pauseAndExit() },
        { label: 'Terminar sesión', icon: <Ban />, danger: true, onClick: () => void endSession() },
      );
    } else {
      if (canSeeOverview) items.push({ label: 'Mapa general', icon: <MapPinned />, onClick: onOverview });
      items.push({ label: 'Salir de la partida', icon: <DoorOpen />, onClick: () => void leaveAsPlayer() });
    }
    menu.openAt(anchor.right - 224, anchor.bottom + 6, items);
  };

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-ink-600/80 bg-ink-900/95 px-2 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.9)] backdrop-blur sm:gap-3 sm:px-3">
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold-600/50 to-transparent" />
      <D20Icon size={26} className="hidden shrink-0 sm:block" />
      <div className="hidden min-w-0 max-w-[13rem] md:block">
        <h1 className="truncate font-display text-sm font-semibold leading-5 tracking-wide text-parchment-50" title={sessionName}>
          {sessionName || 'Partida'}
        </h1>
        {campaignName && <p className="truncate text-[11px] leading-4 text-parchment-400">{campaignName}</p>}
      </div>
      <span className="divider-vertical hidden h-7 md:block" aria-hidden />

      <div className="flex min-w-0 flex-1 items-center">
        <ZoneNavigator className="min-w-0" />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {isDm && players.length > 0 && (
          <div className="hidden items-center gap-1.5 lg:flex">
            <ScanEye className={clsx('h-4 w-4', viewAsUserId ? 'text-arcane-300' : 'text-parchment-400')} aria-hidden />
            <Select
              size="sm"
              value={viewAsUserId ?? ''}
              onChange={(v) => setViewAs(v || null)}
              options={viewAsOptions}
              className={clsx('w-40', viewAsUserId && 'border-arcane-500/70 text-arcane-200')}
              aria-label="Ver como"
              title="Ver la mesa exactamente como la ve un jugador"
            />
          </div>
        )}

        {isDm && (
          <>
            <Button size="sm" variant="secondary" icon={<Search />} onClick={onQuickSearch} title="Buscar en la biblioteca (Ctrl+K)" className="hidden md:inline-flex">
              <span className="hidden xl:inline">Buscar</span>
              <Kbd combo="mod+k" className="ml-1 hidden 2xl:inline-flex" />
            </Button>
            <Button size="sm" variant="secondary" icon={<Presentation />} onClick={onShowToPlayers} title="Mostrar a jugadores" className="hidden md:inline-flex">
              <span className="hidden xl:inline">Mostrar</span>
            </Button>
            <Button size="sm" variant="secondary" icon={<MapPinned />} onClick={onOverview} disabled={!hasOverview} title="Mapa general" className="hidden md:inline-flex">
              <span className="hidden xl:inline">Mapa general</span>
            </Button>
            <Button size="sm" variant="ghost" icon={<Save />} loading={saving} onClick={() => void save()} title="Guardar la partida ahora" className="hidden sm:inline-flex">
              <span className="hidden xl:inline">Guardar</span>
            </Button>
          </>
        )}

        {!isDm && canSeeOverview && (
          <Button size="sm" variant="secondary" icon={<MapPinned />} onClick={onOverview} title="Mapa general" className="hidden sm:inline-flex">
            <span className="hidden lg:inline">Mapa general</span>
          </Button>
        )}

        <IconButton ref={moreRef} icon={<MoreVertical />} title={isDm ? 'Más opciones' : 'Opciones'} size="sm" loading={leaving} onClick={openMore} />
        <ConnectionDot />
      </div>
    </header>
  );
}
