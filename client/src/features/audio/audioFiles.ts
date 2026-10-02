import { AUDIO_MIME_TYPES, normalizeText, type SoundType } from '@wailers/shared';

/** Canonical mime per accepted audio extension (mirrors the server upload allow-list). */
const EXT_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  weba: 'audio/webm',
  flac: 'audio/flac',
  aac: 'audio/aac',
};

/** Non-standard audio mime names the server maps to an accepted type. */
const MIME_ALIASES: Record<string, string> = {
  'audio/mp3': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/mpeg3': 'audio/mpeg',
  'audio/x-mpeg-3': 'audio/mpeg',
  'audio/mpg': 'audio/mpeg',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-pn-wav': 'audio/wav',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-mp4': 'audio/mp4',
  'audio/mp4a-latm': 'audio/mp4',
  'audio/x-aac': 'audio/aac',
  'audio/aacp': 'audio/aac',
  'audio/x-hx-aac-adts': 'audio/aac',
  'audio/x-flac': 'audio/flac',
  'audio/opus': 'audio/ogg',
  'audio/x-ogg': 'audio/ogg',
  'audio/vorbis': 'audio/ogg',
  'audio/x-webm': 'audio/webm',
};

/** `accept` attribute for audio pickers: only the formats the server stores. */
export const AUDIO_ACCEPT = [...Object.keys(EXT_MIME).map((e) => `.${e}`), ...AUDIO_MIME_TYPES, ...Object.keys(MIME_ALIASES)].join(',');

/** Reported mime types the server accepts for audio as-is (browsers label .webm as video/webm, .m4a as audio/x-m4a…). */
export const AUDIO_UPLOAD_MIME_TYPES = [...AUDIO_MIME_TYPES, ...Object.keys(MIME_ALIASES), 'video/webm', 'video/ogg', 'application/ogg'];

export const AUDIO_FORMATS_LABEL = 'MP3, OGG, WAV, M4A, WEBM o FLAC';

export const SOUND_NAME_MAX = 120;

/** Clips up to this length without a hint in their name are guessed as effects. */
const EFFECT_MAX_SECONDS = 12;
/** Clips this short are always guessed as effects. */
const SURE_EFFECT_SECONDS = 5;

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/**
 * Mime type the server accepts for a picked file, or null when the format is not supported (e.g. .wma, .mid,
 * .aiff). Browsers report .webm as video/webm, .m4a as audio/x-m4a or nothing at all, so the extension wins
 * when it is known.
 */
export function audioMimeFor(name: string, reportedType: string): string | null {
  const byExt = EXT_MIME[extOf(name)];
  if (byExt) return byExt;
  const lowered = reportedType.split(';')[0]!.trim().toLowerCase();
  const mime = MIME_ALIASES[lowered] ?? lowered;
  return AUDIO_MIME_TYPES.includes(mime) ? mime : null;
}

/** The same file with a server-friendly mime type, or null when it is not a supported audio file. */
export function normalizeAudioFile(file: File): File | null {
  const mime = audioMimeFor(file.name, file.type);
  if (!mime) return null;
  return file.type === mime ? file : new File([file], file.name, { type: mime, lastModified: file.lastModified });
}

/** Readable sound name from a file name: no extension, separators as spaces, first letter upper case. */
export function soundNameFromFile(fileName: string): string {
  const base = fileName
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/_+/g, ' ')
    .replace(/(\S)-(?=\S)/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
  const named = base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Sonido';
  return named.slice(0, SOUND_NAME_MAX);
}

const TYPE_WORDS: [SoundType, string[]][] = [
  [
    'effect',
    ['sfx', 'fx', 'efecto', 'effect', 'golpe', 'hit', 'espada', 'sword', 'puerta', 'door', 'click', 'clic', 'explosion', 'disparo', 'shot', 'gunshot', 'grito', 'scream', 'rugido', 'roar', 'hechizo', 'spell', 'impacto', 'impact', 'trueno', 'thunder', 'moneda', 'monedas', 'coin', 'coins', 'whoosh', 'swoosh', 'stinger'],
  ],
  [
    'ambience',
    ['ambiente', 'ambient', 'ambience', 'atmosfera', 'atmosphere', 'lluvia', 'rain', 'viento', 'wind', 'bosque', 'forest', 'taberna', 'tavern', 'cueva', 'cave', 'oceano', 'ocean', 'olas', 'waves', 'rio', 'river', 'noche', 'night', 'multitud', 'crowd', 'hoguera', 'campfire', 'tormenta', 'storm', 'mercado', 'market', 'pajaros', 'birds', 'grillos', 'crickets'],
  ],
  [
    'music',
    ['musica', 'music', 'tema', 'theme', 'song', 'cancion', 'ost', 'soundtrack', 'bso', 'batalla', 'battle', 'combate', 'combat', 'boss', 'jefe', 'melodia', 'melody', 'vals', 'waltz', 'himno', 'anthem', 'score', 'track'],
  ],
];

/** Sound type hinted by words in the file name ("lluvia_suave.ogg" → ambience). */
export function typeFromWords(fileName: string): SoundType | null {
  const tokens = new Set(
    normalizeText(fileName.replace(/\.[a-z0-9]{2,5}$/i, ''))
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  for (const [type, words] of TYPE_WORDS) if (words.some((w) => tokens.has(w))) return type;
  return null;
}

/**
 * Best guess for a new upload: name hints first, then the duration (short clips are effects),
 * restricted to the allowed types.
 */
export function guessSoundType(fileName: string, durationSec: number | null, types: readonly SoundType[], fallback: SoundType): SoundType {
  const byWord = typeFromWords(fileName);
  let guess: SoundType = byWord ?? fallback;
  if (durationSec !== null) {
    if (durationSec <= SURE_EFFECT_SECONDS) guess = 'effect';
    else if (!byWord) guess = durationSec <= EFFECT_MAX_SECONDS ? 'effect' : fallback === 'effect' ? 'music' : fallback;
  }
  if (types.includes(guess)) return guess;
  return types.includes(fallback) ? fallback : types[0] ?? 'effect';
}

/** Reads the duration of an audio URL in seconds (null when the browser cannot tell). */
export function detectAudioDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.removeAttribute('src');
      audio.load();
      resolve(value !== null && Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : null);
    };
    const timer = setTimeout(() => finish(null), 15000);
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration)) {
        finish(audio.duration);
        return;
      }
      // Some webm/ogg files report Infinity until the end is reached.
      audio.addEventListener('durationchange', () => {
        if (Number.isFinite(audio.duration)) finish(audio.duration);
      });
      audio.currentTime = 1e7;
    });
    audio.addEventListener('error', () => finish(null));
    audio.src = url;
  });
}
