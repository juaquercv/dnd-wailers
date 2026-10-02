import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Copy,
  Crosshair,
  EyeOff,
  Flame,
  Gift,
  Hand,
  HeartPulse,
  Info,
  Lightbulb,
  NotebookPen,
  ScrollText,
  Settings2,
  Shield,
  Swords,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { isOwnHeroToken, sessionOptionsOf, tokenHp, type C2SPayloads, type LiveState, type Token, type TurnEntry } from '@wailers/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ColorPicker } from '../../components/ui/ColorPicker';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useContextMenu } from '../../components/ui/ContextMenu';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { ImageUpload } from '../../components/ui/ImageUpload';
import { isAnyModalOpen } from '../../components/ui/Modal';
import { Slider } from '../../components/ui/Slider';
import { Stepper } from '../../components/ui/Stepper';
import { TextArea } from '../../components/ui/TextArea';
import { TextInput } from '../../components/ui/TextInput';
import { Toggle } from '../../components/ui/Toggle';
import { isEditableTarget } from '../../lib/hotkeys';
import { emitUiEvent } from '../../lib/uiEvents';
import { useSessionStore } from '../../stores/session';
import { nearbyThings } from './hud/nearby';
import { send, useDraft } from './panels/actions';
import { usePanelContext, type PanelContext } from './panels/context';
import { CreatureStatBlock } from './panels/CreatureStatBlock';
import { HpBar } from './panels/HpBar';
import { StatusIcons, StatusMenuButton } from './panels/Statuses';
import { SuggestedLoot } from './panels/SuggestedLoot';
import { HeroSheet } from './HeroSheet';
import { InventoryList } from './InventoryList';

export interface TokenDetailsPanelProps {
  tokenId: string;
  onClose: () => void;
}

const KIND_LABEL: Record<Token['kind'], { label: string; tone: 'gold' | 'blood' | 'sky' | 'neutral' }> = {
  hero: { label: 'Héroe', tone: 'gold' },
  creature: { label: 'Enemigo', tone: 'blood' },
  npc: { label: 'NPC', tone: 'sky' },
  item: { label: 'Objeto', tone: 'neutral' },
};

const LIGHT_COLORS = ['#ffb347', '#ffd27a', '#ff7b39', '#fff1c1', '#9ad7ff', '#b28cff', '#7dff9a', '#ff6b6b'];
const RING_COLORS = ['#c43d33', '#e0625a', '#d4a63f', '#e9c063', '#5fd07a', '#4aa3e2', '#a98bff', '#b07ae2', '#cdb98f', '#f3ead6'];

/**
 * Token details drawer (rendered in a portal on the right edge). DM: edit everything about the token,
 * its loot and see the creature sheet. Players: read-only view of what they are allowed to know.
 */
export function TokenDetailsPanel({ tokenId, onClose }: TokenDetailsPanelProps) {
  const ctx = usePanelContext();
  const menu = useContextMenu();
  const token = ctx.state?.tokens[tokenId] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (isAnyModalOpen() || menu.isOpen || isEditableTarget(e.target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, menu.isOpen]);

  if (typeof document === 'undefined') return null;

  const kind = token ? KIND_LABEL[token.kind] : null;

  return createPortal(
    <aside
      className="fixed inset-y-0 right-0 z-60 flex w-[min(27rem,100vw)] animate-slide-in-right flex-col border-l border-gold-700/40 bg-ink-900/95 shadow-modal backdrop-blur"
      role="complementary"
      aria-label="Detalles de la ficha"
    >
      <span aria-hidden className="pointer-events-none absolute inset-y-8 left-0 w-px bg-gradient-to-b from-transparent via-gold-400/60 to-transparent" />
      <header className="flex shrink-0 items-center gap-3 border-b border-ink-600/70 px-4 py-3">
        {token ? (
          <>
            <Avatar name={token.name} imageUrl={token.imageUrl} color={token.color} size="lg" ring />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-lg font-semibold leading-6 text-gold-100">{token.name}</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                {kind && (
                  <Badge tone={kind.tone} size="xs">
                    {kind.label}
                  </Badge>
                )}
                {token.hidden && (
                  <Badge tone="outline" size="xs" icon={<EyeOff />}>
                    Oculta
                  </Badge>
                )}
                {token.light && (
                  <Badge tone="gold" size="xs" icon={<Flame />}>
                    Antorcha
                  </Badge>
                )}
              </div>
            </div>
            <IconButton icon={<Crosshair />} title="Centrar el mapa en la ficha" size="sm" onClick={() => emitUiEvent('center-on-token', { tokenId: token.id })} />
          </>
        ) : (
          <div className="flex-1 font-display text-lg text-parchment-300">Ficha</div>
        )}
        <IconButton icon={<X />} title="Cerrar (Esc)" size="sm" onClick={onClose} />
      </header>

      {/* No bottom padding: the DM action bar sticks flush to the bottom edge. */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pt-3">
        {!token || !ctx.state ? (
          <EmptyState
            compact
            icon={<EyeOff />}
            title="La ficha ya no está a la vista"
            description="Se ha eliminado o ha salido de tu campo de visión."
            action={
              <Button size="sm" variant="secondary" onClick={onClose}>
                Cerrar
              </Button>
            }
          />
        ) : ctx.canManage ? (
          // Keyed by token: pending debounced edits are flushed to the right token when the panel switches.
          <DmDetails key={token.id} ctx={ctx} state={ctx.state} token={token} onClose={onClose} />
        ) : (
          <PlayerDetails key={token.id} ctx={ctx} state={ctx.state} token={token} />
        )}
      </div>
    </aside>,
    document.body,
  );
}

// ---------------------------------------------------------------------------

function Section({ icon, title, children, actions }: { icon: ReactNode; title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="border-b border-ink-700/80 py-3 first:pt-0 last:border-b-0">
      <h3 className="mb-2 flex items-center gap-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-gold-300 [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
        <span>{title}</span>
        {actions && <span className="ml-auto flex items-center gap-1 normal-case tracking-normal">{actions}</span>}
      </h3>
      {children}
    </section>
  );
}

function inInitiative(state: LiveState, token: Token): boolean {
  return state.turn.order.some((e) => e.tokenId === token.id || (token.heroId !== null && e.heroId === token.heroId));
}

function initiativeEntryFor(state: LiveState, token: Token): Omit<TurnEntry, 'id'> | null {
  if (token.kind === 'item') return null;
  if (token.kind === 'hero') {
    const hero = token.heroId ? state.heroes[token.heroId] : undefined;
    const owner = token.ownerUserId ?? Object.values(state.players).find((p) => p.heroId === token.heroId)?.userId ?? null;
    return { type: 'player', userId: owner, heroId: token.heroId, tokenId: token.id, name: hero?.name ?? token.name, imageUrl: token.imageUrl ?? hero?.imageUrl ?? null, initiative: null };
  }
  return { type: token.kind === 'npc' ? 'npc' : 'creature', userId: null, heroId: null, tokenId: token.id, name: token.name, imageUrl: token.imageUrl, initiative: null };
}

function DmDetails({ ctx, state, token, onClose }: { ctx: PanelContext; state: LiveState; token: Token; onClose: () => void }) {
  const confirm = useConfirm();
  const gridSize = useSessionStore((s) => s.zonesById[token.zoneId]?.levels.find((l) => l.id === token.levelId)?.grid.size ?? 70);
  const isHero = token.kind === 'hero' && !!token.heroId;
  const isCreature = token.kind === 'creature' || token.kind === 'npc';
  const hp = tokenHp(state, token);

  const update = (patch: Parameters<typeof updateToken>[1]) => void updateToken(token.id, patch);

  const [name, setName] = useState(token.name);
  useEffect(() => setName(token.name), [token.name]);
  const [notes, setNotes, flushNotes] = useDraft(token.notes, (v) => update({ notes: v }), 800);
  const [maxHp, setMaxHp] = useDraft(token.maxHp ?? 0, (v) => update({ maxHp: Math.max(0, v) }));
  const [tempHp, setTempHp] = useDraft(token.tempHp || 0, (v) => update({ tempHp: Math.max(0, v) }));
  const [ac, setAc] = useDraft(token.ac ?? 10, (v) => update({ ac: v }));
  const [cells, setCells] = useDraft(token.cells, (v) => update({ cells: v }));
  const [color, setColor] = useDraft(token.color, (v) => update({ color: v }), 400);
  const [facing, setFacing] = useState(token.facing);
  useEffect(() => setFacing(token.facing), [token.facing]);
  const lightCells = token.light ? Math.round((token.light.radius / gridSize) * 2) / 2 : 4;
  const [lightRadius, setLightRadius] = useState(lightCells);
  useEffect(() => setLightRadius(lightCells), [lightCells]);
  const [lightColor, setLightColor] = useDraft(token.light?.color ?? LIGHT_COLORS[0]!, (v) => {
    if (token.light) update({ light: { radius: token.light.radius, color: v } });
  }, 400);

  const already = inInitiative(state, token);
  const entry = initiativeEntryFor(state, token);

  const remove = async () => {
    const ok = await confirm({
      title: isHero ? `¿Retirar a ${token.name} del mapa?` : 'Eliminar ficha',
      message: isHero
        ? `La ficha de ${token.name} desaparecerá del mapa. Su hoja de personaje no se toca.`
        : `${token.name} se eliminará de la partida${token.loot.length > 0 ? ' junto con su botín registrado' : ''}.`,
      confirmLabel: isHero ? 'Retirar' : 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    const success = isHero ? `${token.name} se retira del mapa` : `Ficha eliminada: ${token.name}`;
    if (await send('token:remove', { tokenId: token.id }, { success })) onClose();
  };

  return (
    <div>
      <Section icon={<Settings2 />} title="Ficha en el mapa">
        <div className="grid grid-cols-[88px_1fr] gap-3">
          <ImageUpload value={token.imageUrl} onChange={(url) => update({ imageUrl: url })} aspect="square" round allowUrl={false} />
          <div className="min-w-0 space-y-2">
            <TextInput
              label="Nombre"
              size="sm"
              value={name}
              onValueChange={setName}
              onBlur={() => {
                const v = name.trim();
                if (v && v !== token.name) update({ name: v });
                else setName(token.name);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
            <Toggle
              size="sm"
              checked={token.hidden}
              onChange={(v) => update({ hidden: v })}
              label={token.hidden ? 'Oculta a los jugadores' : 'Visible para los jugadores'}
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stepper label="Tamaño (casillas)" size="sm" value={cells} min={0.5} max={10} step={0.5} bigStep={1} onChange={(v) => setCells(v)} />
          <Slider
            label="Orientación"
            min={0}
            max={315}
            step={45}
            value={facing}
            onChange={setFacing}
            onCommit={(v) => update({ facing: v })}
            formatValue={(v) => `${v}°`}
          />
        </div>
        <ColorPicker className="mt-3" label="Color del aro" size="sm" palette={RING_COLORS} value={color} onChange={setColor} />
        <div className="mt-3 rounded-lg border border-ink-600/70 bg-ink-800/40 p-2.5">
          <Toggle
            size="sm"
            checked={!!token.light}
            onChange={(on) => update({ light: on ? { radius: Math.round(4 * gridSize), color: lightColor } : null })}
            label="Lleva una antorcha"
            description="Ilumina a su alrededor en mapas oscuros."
          />
          {token.light && (
            <div className="mt-2.5 space-y-2.5">
              <Slider
                label="Radio de luz"
                icon={<Lightbulb className="h-3.5 w-3.5" />}
                min={1}
                max={20}
                step={0.5}
                value={lightRadius}
                onChange={setLightRadius}
                onCommit={(v) => update({ light: { radius: Math.round(v * gridSize), color: token.light?.color ?? lightColor } })}
                formatValue={(v) => `${v} casillas`}
              />
              <ColorPicker size="sm" palette={LIGHT_COLORS} value={lightColor} onChange={setLightColor} allowCustom={false} />
            </div>
          )}
        </div>
      </Section>

      {token.kind !== 'item' && (
        <Section icon={<HeartPulse />} title="Combate">
          <HpBar size="lg" info={hp} />
          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2.5">
            <Stepper
              label="PV actuales"
              size="sm"
              tone="hp"
              value={hp.hp ?? 0}
              min={0}
              max={hp.maxHp ?? undefined}
              onChange={(_next, delta) => void send('token:hp', { tokenId: token.id, delta })}
              title="Mayús: ±5 · clic en el valor para fijarlo"
            />
            {isHero ? (
              <>
                <Stepper label="PV máximos" size="sm" tone="hp" value={hp.maxHp ?? 0} min={1} onChange={(_n, delta) => void send('hero:adjust', { heroId: token.heroId!, field: 'maxHp', delta })} />
                <Stepper label="PV temporales" size="sm" value={hp.temp} min={0} onChange={(_n, delta) => void send('hero:adjust', { heroId: token.heroId!, field: 'tempHp', delta })} />
                <Stepper
                  label="CA"
                  size="sm"
                  value={state.heroes[token.heroId!]?.data.ac ?? 10}
                  min={0}
                  max={40}
                  onChange={(_n, delta) => void send('hero:adjust', { heroId: token.heroId!, field: 'ac', delta })}
                />
              </>
            ) : (
              <>
                <Stepper label="PV máximos" size="sm" tone="hp" value={maxHp} min={0} onChange={(v) => setMaxHp(v)} />
                <Stepper label="PV temporales" size="sm" value={tempHp} min={0} onChange={(v) => setTempHp(v)} />
                <Stepper label="CA" size="sm" value={ac} min={0} max={40} onChange={(v) => setAc(v)} />
              </>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1">
            <StatusIcons statuses={isHero ? state.heroes[token.heroId!]?.data.statuses ?? token.statuses : token.statuses} labels onRemove={(status) => void send('token:status', { tokenId: token.id, status, on: false })} />
            <StatusMenuButton
              active={isHero ? state.heroes[token.heroId!]?.data.statuses ?? token.statuses : token.statuses}
              onToggle={(status, on) => void send('token:status', { tokenId: token.id, status, on })}
            />
          </div>
        </Section>
      )}

      {isCreature && (
        <Section icon={<ScrollText />} title="Hoja de la criatura">
          {token.stats ? (
            <CreatureStatBlock stats={token.stats} attributes={ctx.rules.attributes} ac={token.ac} />
          ) : (
            <p className="text-xs italic text-parchment-400">Sin hoja de estadísticas (ficha creada a mano).</p>
          )}
        </Section>
      )}

      {isHero && (
        <Section icon={<UserRound />} title="Hoja del héroe">
          <HeroSheet heroId={token.heroId!} />
        </Section>
      )}

      {!isHero && (
        <Section icon={<Gift />} title="Botín">
          <InventoryList tokenId={token.id} />
          {isCreature && token.entryId && (
            <div className="mt-3">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-parchment-400">Botín sugerido (referencia)</div>
              <SuggestedLoot tokenId={token.id} entryId={token.entryId} loot={token.loot} />
            </div>
          )}
        </Section>
      )}

      <Section icon={<NotebookPen />} title="Notas del DM">
        <TextArea value={notes} onValueChange={setNotes} onBlur={flushNotes} rows={3} autoResize maxRows={12} placeholder="Solo tú las ves." />
      </Section>

      <div className="sticky bottom-0 -mx-4 mt-1 flex flex-wrap gap-1.5 border-t border-ink-600/70 bg-ink-900/95 px-4 py-2.5 backdrop-blur">
        {entry && (
          <Button size="sm" variant="secondary" icon={<Swords />} disabled={already} onClick={() => void send('turn:add', { entry }, { success: `${token.name} se une a la iniciativa` })} title={already ? 'Ya está en la iniciativa' : undefined}>
            {already ? 'En la iniciativa' : 'Añadir a la iniciativa'}
          </Button>
        )}
        {!isHero && (
          <Button size="sm" variant="ghost" icon={<Copy />} onClick={() => void send('token:duplicate', { tokenId: token.id }, { success: 'Ficha duplicada' })}>
            Duplicar
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={<Trash2 />} className="ml-auto text-blood-300 hover:text-blood-200" onClick={() => void remove()}>
          {isHero ? 'Retirar' : 'Eliminar'}
        </Button>
      </div>
    </div>
  );
}

function updateToken(tokenId: string, patch: C2SPayloads['token:update']['patch']) {
  return send('token:update', { tokenId, patch });
}

function PlayerDetails({ ctx, state, token }: { ctx: PanelContext; state: LiveState; token: Token }) {
  const isHero = token.kind === 'hero' && !!token.heroId && !!state.heroes[token.heroId];
  const isCreature = token.kind === 'creature' || token.kind === 'npc';
  const hp = tokenHp(state, token);
  const statuses = isHero ? state.heroes[token.heroId!]!.data.statuses : token.statuses;

  if (isHero) {
    return (
      <div className="pb-4">
        <HeroSheet heroId={token.heroId!} />
      </div>
    );
  }

  return (
    <div className="pb-4">
      {token.kind !== 'item' && (
        <Section icon={<HeartPulse />} title="Estado">
          <HpBar size="lg" info={hp} unknownLabel="No sabes cuánta vida le queda" />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-parchment-300">
            {token.ac !== null && (
              <span className="inline-flex items-center gap-1">
                <Shield className="h-3.5 w-3.5 text-gold-400" />
                CA {token.ac}
              </span>
            )}
            <StatusIcons statuses={statuses} labels />
          </div>
        </Section>
      )}
      {isCreature && (
        <Section icon={<ScrollText />} title="Hoja de la criatura">
          {token.stats ? (
            <CreatureStatBlock stats={token.stats} attributes={ctx.rules.attributes} ac={token.ac} />
          ) : (
            <EmptyState compact icon={<Info />} title="Información desconocida" description="Tu héroe no sabe nada más de esta criatura." />
          )}
        </Section>
      )}
      {token.kind === 'item' && <ItemTokenPickup ctx={ctx} state={state} token={token} />}
    </div>
  );
}

/** Player view of an item token: "Recoger" when it is next to their hero (free action). */
function ItemTokenPickup({ ctx, state, token }: { ctx: PanelContext; state: LiveState; token: Token }) {
  const zonesById = useSessionStore((s) => s.zonesById);
  const [busy, setBusy] = useState(false);
  const allowed = sessionOptionsOf(state).playersCanPickUp;
  const viewer = ctx.viewerId;
  const hero = viewer ? Object.values(state.tokens).find((t) => isOwnHeroToken(state, t, viewer)) ?? null : null;
  const near = !!hero && nearbyThings(state, zonesById, hero).some((n) => n.kind === 'item' && n.token.id === token.id);
  const description = !allowed
    ? 'Un objeto en el mapa. Pide al DM que te lo entregue.'
    : near
      ? 'Está a tu alcance. Recogerlo es gratis: no gasta acción ni movimiento.'
      : 'Acércate a él para recogerlo (no gasta acción).';
  const pickUp = async () => {
    setBusy(true);
    await send('token:pickup', { tokenId: token.id }, { success: `Recoges: ${token.name}`, error: 'No se pudo recoger el objeto' });
    setBusy(false);
  };
  return (
    <EmptyState
      compact
      icon={<Gift />}
      title={token.name}
      description={description}
      action={
        allowed && near && !ctx.isDm ? (
          <Button size="sm" variant="primary" icon={<Hand />} loading={busy} onClick={() => void pickUp()}>
            Recoger
          </Button>
        ) : undefined
      }
    />
  );
}

