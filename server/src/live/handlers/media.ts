import {
  LIGHTING_PRESETS,
  SPELL_ANIMATIONS,
  WEATHER_TYPES,
  emptyZoneLiveState,
  normalizeText,
  type AudioState,
  type FxEvent,
  type LiveState,
  type SpellAnimation,
  type Token,
  type ZoneLiveState,
} from '@wailers/shared';
import { prisma } from '../../db';
import { entryInclude, entryToDTO } from '../../services/serializers';
import {
  clamp,
  clampToLevel,
  colorValue,
  gridSize,
  heroTokenForHero,
  heroTokenOf,
  isHeroOwner,
  oneOf,
  optId,
  plainObject,
  playerHero,
  reqId,
  reqNum,
  reqText,
  requireHero,
  requireLevel,
  requirePlaying,
  requireToken,
  requireZone,
  urlOrNull,
  zoneLabel,
} from '../helpers';
import { HandlerError, type HandlerCtx, type HandlerModule, type SessionManagerApi, type SoundRef } from '../types';

/*
 * Audio (music/ambience channels, master volume, one-shot effects) and visual effects
 * (screen fx, weather/lighting overrides, spell animations). Spell casting is animation + log
 * only: it never spends resources or applies damage.
 */

const CHANNELS = ['music', 'ambience'] as const;
type Channel = (typeof CHANNELS)[number];

/** Resolve a sound from the session cache or, if it was created after the session loaded, from the library. */
async function resolveSound(ctx: HandlerCtx, soundIdRaw: unknown): Promise<SoundRef> {
  const soundId = reqId(soundIdRaw, 'sonido');
  const cached = ctx.session.campaign.sounds.get(soundId);
  if (cached) {
    if (!cached.url) throw new HandlerError('Ese sonido no tiene archivo de audio');
    return cached;
  }
  const row = await prisma.libraryEntry.findUnique({ where: { id: soundId }, include: entryInclude(null) });
  if (!row || row.kind !== 'sound') throw new HandlerError('Ese sonido no existe en la biblioteca');
  const entry = entryToDTO<'sound'>(row);
  if (!entry.data.url) throw new HandlerError('Ese sonido no tiene archivo de audio');
  return {
    id: entry.id,
    name: entry.name,
    url: entry.data.url,
    soundType: entry.data.soundType,
    loop: entry.data.loop,
    volume: clamp(Number.isFinite(entry.data.volume) ? entry.data.volume : 0.8, 0, 1),
  };
}

/** Track of the zone the DM is viewing for a channel (used to keep it playing when switching to manual). */
function dmZoneTrack(ctx: HandlerCtx, channel: Channel): AudioState['music'] {
  const view = ctx.session.state.dmView;
  if (!view) return null;
  const zone = ctx.session.campaign.zones.find((z) => z.id === view.zoneId);
  const soundId = channel === 'music' ? zone?.musicSoundId : zone?.ambienceSoundId;
  const sound = soundId ? ctx.session.campaign.sounds.get(soundId) : undefined;
  return sound && sound.url ? { soundId: sound.id, url: sound.url, name: sound.name } : null;
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

async function audioPlay(manager: SessionManagerApi, ctx: HandlerCtx, payload: { channel: Channel; soundId: string | null }): Promise<null> {
  const channel = oneOf(CHANNELS, payload.channel, 'canal');
  const sound = payload.soundId === null || payload.soundId === undefined || payload.soundId === '' ? null : await resolveSound(ctx, payload.soundId);
  const label = channel === 'music' ? 'Música' : 'Ambiente';
  const icon = channel === 'music' ? '🎵' : '🌫️';
  const other: Channel = channel === 'music' ? 'ambience' : 'music';
  const wasZoneMode = ctx.session.state.audio.mode === 'zone';
  const otherSeed = wasZoneMode ? dmZoneTrack(ctx, other) : null;
  manager.mutate(
    ctx.session,
    (s) => {
      s.audio[channel] = sound ? { soundId: sound.id, url: sound.url, name: sound.name } : null;
      // Leaving zone mode keeps the other channel of the DM's zone playing instead of cutting it.
      if (wasZoneMode && s.audio[other] === null) s.audio[other] = otherSeed;
      s.audio.mode = 'manual';
    },
    {
      log: {
        type: 'audio',
        text: sound ? `${icon} ${label}: ${sound.name}` : `${icon} ${label}: silencio`,
        actorUserId: ctx.userId,
        visibility: 'all',
      },
    },
  );
  return null;
}

function audioMode(manager: SessionManagerApi, ctx: HandlerCtx, payload: { mode: 'zone' | 'manual' }): null {
  const mode = oneOf(['zone', 'manual'] as const, payload.mode, 'modo de audio');
  if (ctx.session.state.audio.mode === mode) return null;
  const seeds = mode === 'manual' ? { music: dmZoneTrack(ctx, 'music'), ambience: dmZoneTrack(ctx, 'ambience') } : null;
  manager.mutate(
    ctx.session,
    (s) => {
      s.audio.mode = mode;
      if (seeds) {
        s.audio.music ??= seeds.music;
        s.audio.ambience ??= seeds.ambience;
      }
    },
    {
      log: {
        type: 'audio',
        text: mode === 'zone' ? 'El audio sigue la música de cada zona' : 'El DM elige la música para todos',
        actorUserId: ctx.userId,
        visibility: 'dm',
      },
    },
  );
  return null;
}

function audioMaster(manager: SessionManagerApi, ctx: HandlerCtx, payload: { volume: number }): null {
  const volume = Math.round(clamp(reqNum(payload.volume, 'volumen'), 0, 1) * 1000) / 1000;
  if (ctx.session.state.audio.master === volume) return null;
  manager.mutate(ctx.session, (s) => {
    s.audio.master = volume;
  });
  return null;
}

async function audioSfx(manager: SessionManagerApi, ctx: HandlerCtx, payload: { soundId: string }): Promise<null> {
  const sound = await resolveSound(ctx, payload.soundId);
  manager.emitEvent(ctx.session, { type: 'sfx', url: sound.url, name: sound.name, volume: clamp(sound.volume, 0, 1) }, { kind: 'all' });
  return null;
}

// ---------------------------------------------------------------------------
// Visual effects
// ---------------------------------------------------------------------------

function optNullableText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  const text = reqText(value, label, max);
  return text === '' ? null : text;
}

function parseFx(manager: SessionManagerApi, ctx: HandlerCtx, raw: unknown): FxEvent {
  const obj = plainObject(raw, 'efecto');
  const kind = oneOf(['shake', 'flash', 'spell', 'boss'] as const, obj.kind, 'tipo de efecto');
  switch (kind) {
    case 'shake':
      return {
        kind,
        intensity: clamp(obj.intensity === undefined ? 1 : reqNum(obj.intensity, 'intensidad'), 0, 100),
        durationMs: Math.round(clamp(obj.durationMs === undefined ? 600 : reqNum(obj.durationMs, 'duración'), 50, 10000)),
      };
    case 'flash':
      return {
        kind,
        color: obj.color === undefined ? '#ffffff' : colorValue(obj.color, 'color'),
        durationMs: Math.round(clamp(obj.durationMs === undefined ? 400 : reqNum(obj.durationMs, 'duración'), 50, 10000)),
      };
    case 'spell': {
      const { zone, level } = requireLevel(manager, ctx.session, obj.zoneId, obj.levelId);
      const point = clampToLevel(level, { x: reqNum(obj.x, 'x'), y: reqNum(obj.y, 'y') });
      const hasFrom = typeof obj.fromX === 'number' && typeof obj.fromY === 'number' && Number.isFinite(obj.fromX) && Number.isFinite(obj.fromY);
      const from = hasFrom ? clampToLevel(level, { x: obj.fromX as number, y: obj.fromY as number }) : null;
      return {
        kind,
        animation: oneOf(SPELL_ANIMATIONS, obj.animation, 'animación'),
        zoneId: zone.id,
        levelId: level.id,
        x: point.x,
        y: point.y,
        fromX: from ? from.x : null,
        fromY: from ? from.y : null,
        radius: clamp(obj.radius === undefined ? gridSize(level) * 1.5 : reqNum(obj.radius, 'radio'), 5, 5000),
        label: optNullableText(obj.label, 'etiqueta', 120),
      };
    }
    case 'boss':
      return {
        kind,
        name: reqText(obj.name, 'nombre', 120, 1),
        subtitle: optNullableText(obj.subtitle, 'subtítulo', 200),
        imageUrl: urlOrNull(obj.imageUrl, 'imagen'),
        soundUrl: urlOrNull(obj.soundUrl, 'sonido'),
      };
  }
}

function fxTrigger(manager: SessionManagerApi, ctx: HandlerCtx, payload: { fx: FxEvent }): null {
  const fx = parseFx(manager, ctx, payload.fx);
  manager.emitEvent(ctx.session, { type: 'fx', fx }, { kind: 'all' });
  if (fx.kind === 'boss') {
    void manager
      .log(ctx.session, { type: 'fx', text: `⚔️ ¡Aparece ${fx.name}!`, actorUserId: ctx.userId, visibility: 'all' })
      .catch((err: unknown) => console.error('[live] No se pudo registrar el efecto', err));
  }
  return null;
}

function zoneState(state: LiveState, zoneId: string): ZoneLiveState {
  const existing = state.zoneStates[zoneId];
  if (existing) return existing;
  const created = emptyZoneLiveState();
  state.zoneStates[zoneId] = created;
  return created;
}

function fxWeather(manager: SessionManagerApi, ctx: HandlerCtx, payload: { zoneId: string; weather: (typeof WEATHER_TYPES)[number] | null }): null {
  const zone = requireZone(manager, ctx.session, payload.zoneId);
  const weather = payload.weather === null || payload.weather === undefined ? null : oneOf(WEATHER_TYPES, payload.weather, 'clima');
  manager.mutate(ctx.session, (s) => {
    zoneState(s, zone.id).weather = weather;
  });
  return null;
}

function fxLighting(manager: SessionManagerApi, ctx: HandlerCtx, payload: { zoneId: string; lighting: (typeof LIGHTING_PRESETS)[number] | null }): null {
  const zone = requireZone(manager, ctx.session, payload.zoneId);
  const lighting = payload.lighting === null || payload.lighting === undefined ? null : oneOf(LIGHTING_PRESETS, payload.lighting, 'iluminación');
  manager.mutate(ctx.session, (s) => {
    zoneState(s, zone.id).lighting = lighting;
  });
  return null;
}

// ---------------------------------------------------------------------------
// spell:cast
// ---------------------------------------------------------------------------

async function spellCast(
  manager: SessionManagerApi,
  ctx: HandlerCtx,
  payload: { heroId?: string; tokenId?: string; spellName: string; animation: SpellAnimation; zoneId: string; levelId: string; x: number; y: number },
): Promise<null> {
  const state = ctx.session.state;
  requirePlaying(ctx);
  const spellName = reqText(payload.spellName, 'hechizo', 120, 1);
  const animation = oneOf(SPELL_ANIMATIONS, payload.animation, 'animación');
  const { zone, level } = requireLevel(manager, ctx.session, payload.zoneId, payload.levelId);
  const point = clampToLevel(level, { x: reqNum(payload.x, 'x'), y: reqNum(payload.y, 'y') });
  const heroIdRaw = optId(payload.heroId, 'héroe');
  const tokenIdRaw = optId(payload.tokenId, 'ficha');

  let hero = heroIdRaw ? requireHero(state, heroIdRaw) : null;
  let caster: Token | undefined = tokenIdRaw ? requireToken(state, tokenIdRaw) : undefined;

  if (!ctx.isDm) {
    hero ??= playerHero(state, ctx.userId);
    if (!hero) throw new HandlerError('Necesitas un héroe para lanzar hechizos');
    if (!isHeroOwner(state, hero, ctx.userId)) throw new HandlerError('Ese héroe no es tuyo');
    if (caster && (caster.kind !== 'hero' || caster.heroId !== hero.id)) throw new HandlerError('Solo puedes lanzar desde tu propia ficha');
    const wanted = normalizeText(spellName);
    if (!hero.data.spells.some((s) => normalizeText(s.name) === wanted)) throw new HandlerError(`${hero.name} no conoce ese hechizo`);
  } else if (caster && caster.kind === 'hero' && caster.heroId && !hero) {
    hero = state.heroes[caster.heroId] ?? null;
  }

  if (!caster && hero) caster = (ctx.isDm ? undefined : heroTokenOf(state, ctx.userId)) ?? heroTokenForHero(state, hero.id);
  const sameLevel = caster !== undefined && caster.zoneId === zone.id && caster.levelId === level.id;
  const casterName = hero?.name ?? caster?.name ?? null;

  const fx: FxEvent = {
    kind: 'spell',
    animation,
    zoneId: zone.id,
    levelId: level.id,
    x: point.x,
    y: point.y,
    fromX: sameLevel ? caster!.x : null,
    fromY: sameLevel ? caster!.y : null,
    radius: gridSize(level) * 1.5,
    label: spellName,
  };
  manager.emitEvent(ctx.session, { type: 'fx', fx }, { kind: 'all' });

  const hiddenCaster = caster !== undefined && caster.hidden;
  const text = casterName ? `✨ ${casterName} lanza ${spellName}` : `✨ Se lanza ${spellName} en ${zoneLabel(zone, level)}`;
  try {
    await manager.log(ctx.session, { type: 'fx', text, actorUserId: ctx.userId, visibility: hiddenCaster ? 'dm' : 'all' });
  } catch (err) {
    console.error('[live] No se pudo registrar el hechizo', err);
  }
  return null;
}

export const registerMediaHandlers: HandlerModule = (socket, manager) => {
  manager.register(socket, 'audio:play', (ctx, payload) => audioPlay(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'audio:mode', (ctx, payload) => audioMode(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'audio:master', (ctx, payload) => audioMaster(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'audio:sfx', (ctx, payload) => audioSfx(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'fx:trigger', (ctx, payload) => fxTrigger(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'fx:weather', (ctx, payload) => fxWeather(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'fx:lighting', (ctx, payload) => fxLighting(manager, ctx, payload), { dmOnly: true });
  manager.register(socket, 'spell:cast', (ctx, payload) => spellCast(manager, ctx, payload));
};
