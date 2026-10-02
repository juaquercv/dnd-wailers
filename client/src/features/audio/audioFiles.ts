import { normalizeText, type SoundType } from '@wailers/shared';

/** Canonical mime per accepted audio extension (what the server stores). */
const EXT_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  flac: 'audio/flac',
  aac: 'audio/aac',
};

/** `accept` attribute for audio pickers. */
export const AUDIO_ACCEPT = `audio/*,${Object.keys(EXT_MIME)
  .map((e) => `.${e}`)
  .join(',')}`;

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
 * Mime type the server accepts for a picked file, or null when it is not audio. Browsers report .webm as
 * video/webm, .m4a as audio/x-m4a or nothing at all, so the extension wins when it is known.
 */
export function audioMimeFor(name: string, reportedType: string): string | null {
  const byExt = EXT_MIME[extOf(name)];
  if (byExt) return byExt;
  return reportedType.toLowerCase().startsWith('audio/') ? reportedType : null;
}

/** The same file with a server-friendly mime type, or null when it is not an audio file. */
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
