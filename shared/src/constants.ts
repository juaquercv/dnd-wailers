// Shared constants. Labels are user-facing (Spanish); keys are stable identifiers.

export const APP_NAME = 'D&D Wailers';

export const SEED_USERS = [
  { id: 'adriel', name: 'Adriel', color: '#e2b04a' },
  { id: 'juan', name: 'Juan', color: '#4aa3e2' },
  { id: 'patrick', name: 'Patrick', color: '#5fd07a' },
  { id: 'javier', name: 'Javier', color: '#d0605f' },
  { id: 'campos', name: 'Campos', color: '#b07ae2' },
] as const;

/** Seconds a disconnected user stays locked before being released (overridable by env on the server). */
export const DEFAULT_USER_RELEASE_SECONDS = 60;

export const ENTRY_KINDS = ['creature', 'item', 'spell', 'zone', 'sound', 'hero'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const ENTRY_KIND_LABELS: Record<EntryKind, { singular: string; plural: string; icon: string }> = {
  creature: { singular: 'Enemigo/NPC', plural: 'Enemigos y NPCs', icon: 'skull' },
  item: { singular: 'Objeto', plural: 'Objetos', icon: 'sword' },
  spell: { singular: 'Hechizo', plural: 'Hechizos', icon: 'sparkles' },
  zone: { singular: 'Zona/Mapa', plural: 'Zonas y mapas', icon: 'map' },
  sound: { singular: 'Sonido', plural: 'Sonidos', icon: 'music' },
  hero: { singular: 'Héroe', plural: 'Héroes', icon: 'shield' },
};

export const RARITIES = ['common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_INFO: Record<Rarity, { label: string; color: string; rank: number }> = {
  common: { label: 'Común', color: '#b8b8b8', rank: 0 },
  uncommon: { label: 'Poco común', color: '#4fc24f', rank: 1 },
  rare: { label: 'Raro', color: '#3d8bff', rank: 2 },
  very_rare: { label: 'Muy raro', color: '#a35cff', rank: 3 },
  legendary: { label: 'Legendario', color: '#ff9b2f', rank: 4 },
  artifact: { label: 'Artefacto', color: '#e8473f', rank: 5 },
};

export const CREATURE_SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;
export type CreatureSize = (typeof CREATURE_SIZES)[number];

/** cells = default token diameter in grid cells. */
export const SIZE_INFO: Record<CreatureSize, { label: string; cells: number; rank: number }> = {
  tiny: { label: 'Diminuto', cells: 0.5, rank: 0 },
  small: { label: 'Pequeño', cells: 1, rank: 1 },
  medium: { label: 'Mediano', cells: 1, rank: 2 },
  large: { label: 'Grande', cells: 2, rank: 3 },
  huge: { label: 'Enorme', cells: 3, rank: 4 },
  gargantuan: { label: 'Gargantuesco', cells: 4, rank: 5 },
};

export interface StatusDef {
  key: string;
  label: string;
  icon: string; // emoji, rendered on tokens
  color: string;
}

export const STATUSES: StatusDef[] = [
  { key: 'poisoned', label: 'Envenenado', icon: '☠️', color: '#6abf3a' },
  { key: 'stunned', label: 'Aturdido', icon: '💫', color: '#e6d14a' },
  { key: 'paralyzed', label: 'Paralizado', icon: '⚡', color: '#f0e05a' },
  { key: 'blinded', label: 'Cegado', icon: '🙈', color: '#888888' },
  { key: 'charmed', label: 'Hechizado', icon: '💕', color: '#ff7ab8' },
  { key: 'frightened', label: 'Asustado', icon: '😱', color: '#9b6bff' },
  { key: 'prone', label: 'Derribado', icon: '🛌', color: '#b08a5a' },
  { key: 'restrained', label: 'Apresado', icon: '⛓️', color: '#9a9a9a' },
  { key: 'invisible', label: 'Invisible', icon: '👻', color: '#c8f0ff' },
  { key: 'burning', label: 'En llamas', icon: '🔥', color: '#ff6a2a' },
  { key: 'frozen', label: 'Congelado', icon: '❄️', color: '#7fd6ff' },
  { key: 'bleeding', label: 'Sangrando', icon: '🩸', color: '#d0312d' },
  { key: 'blessed', label: 'Bendecido', icon: '✨', color: '#ffe680' },
  { key: 'concentrating', label: 'Concentrado', icon: '🧠', color: '#8ab4ff' },
  { key: 'unconscious', label: 'Inconsciente', icon: '💤', color: '#5a5a7a' },
  { key: 'dead', label: 'Muerto', icon: '💀', color: '#444444' },
];

export const WEATHER_TYPES = ['none', 'rain', 'storm', 'snow', 'fog', 'embers'] as const;
export type WeatherType = (typeof WEATHER_TYPES)[number];
export const WEATHER_LABELS: Record<WeatherType, string> = {
  none: 'Despejado',
  rain: 'Lluvia',
  storm: 'Tormenta',
  snow: 'Nieve',
  fog: 'Niebla',
  embers: 'Ceniza y brasas',
};

export const LIGHTING_PRESETS = ['day', 'dusk', 'night', 'dark'] as const;
export type LightingPreset = (typeof LIGHTING_PRESETS)[number];
/** darkness: alpha of the darkness overlay (0 = full daylight). */
export const LIGHTING_INFO: Record<LightingPreset, { label: string; darkness: number; tint: string }> = {
  day: { label: 'Día', darkness: 0, tint: '#000000' },
  dusk: { label: 'Atardecer', darkness: 0.35, tint: '#3a1c05' },
  night: { label: 'Noche', darkness: 0.65, tint: '#050b24' },
  dark: { label: 'Oscuridad total', darkness: 0.92, tint: '#000000' },
};

export const SPELL_ANIMATIONS = ['fire', 'ice', 'lightning', 'heal', 'arcane', 'poison', 'holy', 'shadow'] as const;
export type SpellAnimation = (typeof SPELL_ANIMATIONS)[number];
export const SPELL_ANIMATION_LABELS: Record<SpellAnimation, string> = {
  fire: 'Fuego',
  ice: 'Hielo',
  lightning: 'Relámpago',
  heal: 'Curación',
  arcane: 'Arcano',
  poison: 'Veneno',
  holy: 'Sagrado',
  shadow: 'Sombra',
};

export const SOUND_TYPES = ['music', 'ambience', 'effect'] as const;
export type SoundType = (typeof SOUND_TYPES)[number];
export const SOUND_TYPE_LABELS: Record<SoundType, string> = {
  music: 'Música',
  ambience: 'Ambiente',
  effect: 'Efecto',
};

export const ZONE_TYPES = ['exterior', 'interior', 'dungeon', 'city', 'subzone'] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];
export const ZONE_TYPE_LABELS: Record<ZoneType, string> = {
  exterior: 'Exterior',
  interior: 'Interior',
  dungeon: 'Mazmorra',
  city: 'Ciudad',
  subzone: 'Sub-zona',
};

export const LAYER_IDS = ['background', 'terrain', 'objects', 'tokens', 'fog', 'lighting', 'walls', 'notes'] as const;
export type LayerId = (typeof LAYER_IDS)[number];
export const LAYER_LABELS: Record<LayerId, string> = {
  background: 'Fondo',
  terrain: 'Terreno',
  objects: 'Objetos y decoración',
  tokens: 'Fichas',
  fog: 'Niebla de guerra',
  lighting: 'Iluminación',
  walls: 'Paredes (bloquean visión)',
  notes: 'Notas privadas del DM',
};

export const STANDARD_DICE = [4, 6, 8, 10, 12, 20, 100] as const;

export const DEFAULT_ABILITIES = [
  { key: 'str', label: 'Fuerza', short: 'FUE' },
  { key: 'dex', label: 'Destreza', short: 'DES' },
  { key: 'con', label: 'Constitución', short: 'CON' },
  { key: 'int', label: 'Inteligencia', short: 'INT' },
  { key: 'wis', label: 'Sabiduría', short: 'SAB' },
  { key: 'cha', label: 'Carisma', short: 'CAR' },
] as const;

export const ROULETTE_PALETTE = [
  '#c0392b', '#d35400', '#f39c12', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#2c3e50',
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#7f8c8d',
];

/** Upload limits (bytes). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
export const AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/flac'];
