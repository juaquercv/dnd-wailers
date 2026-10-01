import type { SoundType } from '@wailers/shared';
import { AUDIO_SPECS, type AudioKey } from '../assets/audio';
import { seedUrl, soundIconFile } from '../assets/paths';
import { cat } from './categories';
import { entryId } from './ids';
import { seedEntry, type SeedEntry } from './types';

/** Seeded sounds: procedurally synthesized music loops, ambiences and effects. */

type Mood = 'Combate' | 'Misterio' | 'Calma' | 'Épico' | 'Terror';

interface SoundDef {
  key: AudioKey;
  name: string;
  description: string;
  soundType: SoundType;
  moods: Mood[];
  tags: string[];
  volume: number;
  origin?: 'A' | 'B';
  /** Seed version that introduced the sound (default 1). */
  since?: number;
}

const DEFS: SoundDef[] = [
  { key: 'taberna-alegre', name: 'Taberna alegre', description: 'Jiga de laúd con arpegios punteados, flauta y percusión ligera. Perfecta para tabernas y aldeas.', soundType: 'music', moods: ['Calma'], tags: ['taberna', 'aldea', 'laúd', 'alegre'], volume: 0.55 },
  { key: 'tambores-de-guerra', name: 'Tambores de guerra', description: 'Tambores taiko, metales graves en ostinato y trompas heroicas. Para combates intensos.', soundType: 'music', moods: ['Combate'], tags: ['combate', 'tambores', 'batalla'], volume: 0.6 },
  { key: 'cripta-silenciosa', name: 'Cripta silenciosa', description: 'Zumbidos graves, viento entre lápidas, campanas disonantes y susurros. Misterio y terror.', soundType: 'music', moods: ['Misterio', 'Terror'], tags: ['cripta', 'terror', 'campanas', 'no-muertos'], volume: 0.6, origin: 'B' },
  { key: 'himno-del-dragon', name: 'Himno del dragón', description: 'Coro épico, timbales y trompas en re menor. Para la aparición de un jefe o el clímax de la campaña.', soundType: 'music', moods: ['Épico', 'Combate'], tags: ['épico', 'jefe', 'dragón', 'coro'], volume: 0.65 },
  { key: 'bosque', name: 'Bosque', description: 'Viento entre las ramas, hojas que crujen y pájaros lejanos.', soundType: 'ambience', moods: ['Calma'], tags: ['bosque', 'naturaleza', 'pájaros', 'viento'], volume: 0.5 },
  { key: 'lluvia', name: 'Lluvia', description: 'Lluvia constante con gotas sobre tejados y charcos.', soundType: 'ambience', moods: ['Calma', 'Misterio'], tags: ['lluvia', 'clima', 'tormenta'], volume: 0.5 },
  { key: 'cueva', name: 'Cueva', description: 'Rumor grave de la roca, viento lejano y gotas de agua con eco.', soundType: 'ambience', moods: ['Misterio'], tags: ['cueva', 'mazmorra', 'eco', 'subterráneo'], volume: 0.55 },
  { key: 'fuego-de-campamento', name: 'Fuego de campamento', description: 'Crepitar de leña, chasquidos y el rugido suave de las llamas.', soundType: 'ambience', moods: ['Calma'], tags: ['fuego', 'campamento', 'chimenea', 'descanso'], volume: 0.5 },
  { key: 'choque-de-espadas', name: 'Choque de espadas', description: 'Dos aceros que chocan con un roce metálico.', soundType: 'effect', moods: ['Combate'], tags: ['espadas', 'metal', 'ataque'], volume: 0.8 },
  { key: 'efecto-bola-de-fuego', name: 'Bola de fuego', description: 'Silbido creciente seguido de una explosión ardiente.', soundType: 'effect', moods: ['Combate', 'Épico'], tags: ['fuego', 'explosión', 'hechizo'], volume: 0.85 },
  { key: 'puerta-que-cruje', name: 'Puerta que cruje', description: 'Una vieja puerta de madera que se abre lentamente y golpea al final.', soundType: 'effect', moods: ['Misterio', 'Terror'], tags: ['puerta', 'crujido', 'mazmorra'], volume: 0.8 },
  { key: 'rugido-de-dragon', name: 'Rugido de dragón', description: 'Un rugido gutural y desgarrado que hace temblar las paredes.', soundType: 'effect', moods: ['Épico', 'Terror'], tags: ['dragón', 'rugido', 'jefe'], volume: 0.9 },
  { key: 'trueno', name: 'Trueno', description: 'Chasquido de rayo seguido de un trueno que rueda por el valle.', soundType: 'effect', moods: ['Épico'], tags: ['trueno', 'tormenta', 'rayo'], volume: 0.85 },
  { key: 'curacion', name: 'Curación', description: 'Campanillas ascendentes y un coro suave lleno de luz.', soundType: 'effect', moods: ['Calma'], tags: ['curación', 'magia', 'luz'], volume: 0.75 },
  { key: 'monedas', name: 'Monedas', description: 'Un puñado de monedas que tintinean al caer sobre la mesa.', soundType: 'effect', moods: ['Calma'], tags: ['monedas', 'oro', 'botín', 'comercio'], volume: 0.75 },
  { key: 'golpe', name: 'Golpe', description: 'Impacto seco y contundente.', soundType: 'effect', moods: ['Combate'], tags: ['golpe', 'impacto', 'puñetazo'], volume: 0.85 },
  { key: 'paso-de-pagina', name: 'Paso de página', description: 'El susurro de una página de pergamino al pasar.', soundType: 'effect', moods: ['Calma', 'Misterio'], tags: ['libro', 'página', 'pergamino'], volume: 0.7 },
  // Los Cielos de Latón (steampunk, seed v2).
  { key: 'vals-de-vapor', name: 'Vals de vapor', description: 'Vals de caja de música y acordeón sobre un suave compás de pistones. Para la ciudad, los mercados y los momentos de calma.', soundType: 'music', moods: ['Calma'], tags: ['#steampunk', 'vals', 'caja de música', 'ciudad'], volume: 0.55, origin: 'A', since: 2 },
  { key: 'persecucion-en-las-nubes', name: 'Persecución en las nubes', description: 'Ritmo trepidante de percusión metálica con metales en ostinato. Para abordajes, duelos en cubierta y persecuciones entre dirigibles.', soundType: 'music', moods: ['Combate', 'Épico'], tags: ['#steampunk', 'combate', 'dirigibles', 'persecución'], volume: 0.6, origin: 'A', since: 2 },
  { key: 'sala-de-maquinas', name: 'Sala de máquinas', description: 'Zumbido grave de motores, golpes de pistón y siseos de vapor.', soundType: 'ambience', moods: ['Misterio'], tags: ['#steampunk', 'máquinas', 'pistones', 'fábrica'], volume: 0.5, origin: 'A', since: 2 },
  { key: 'viento-en-cubierta', name: 'Viento en cubierta', description: 'Viento a gran altura, cuerdas que crujen, lona que restalla y hélices lejanas.', soundType: 'ambience', moods: ['Calma'], tags: ['#steampunk', 'viento', 'dirigible', 'cielo'], volume: 0.5, origin: 'A', since: 2 },
  { key: 'silbato-de-vapor', name: 'Silbato de vapor', description: 'El silbido potente de una caldera a presión o de un dirigible que zarpa.', soundType: 'effect', moods: ['Épico'], tags: ['#steampunk', 'silbato', 'vapor', 'alarma'], volume: 0.8, origin: 'A', since: 2 },
  { key: 'engranajes', name: 'Engranajes', description: 'Mecanismo de relojería y engranajes que encajan con un chasquido.', soundType: 'effect', moods: ['Misterio'], tags: ['#steampunk', 'engranajes', 'mecanismo', 'relojería'], volume: 0.75, origin: 'A', since: 2 },
  { key: 'disparo-de-pistola', name: 'Disparo de pistola', description: 'Detonación seca de una pistola de vapor con eco metálico.', soundType: 'effect', moods: ['Combate'], tags: ['#steampunk', 'disparo', 'pistola', 'combate'], volume: 0.85, origin: 'A', since: 2 },
  { key: 'helices', name: 'Hélices', description: 'Hélices que arrancan y aceleran hasta un zumbido constante.', soundType: 'effect', moods: ['Épico'], tags: ['#steampunk', 'hélices', 'dirigible', 'despegue'], volume: 0.8, origin: 'A', since: 2 },
];

export function soundId(key: AudioKey): string {
  return entryId('sound', key);
}

export const SOUND_ENTRIES: SeedEntry<'sound'>[] = DEFS.map((d) => {
  const spec = AUDIO_SPECS[d.key];
  return seedEntry<'sound'>({
    id: soundId(d.key),
    kind: 'sound',
    name: d.name,
    description: d.description,
    imageUrl: seedUrl(soundIconFile(d.key)),
    tags: d.tags,
    categoryIds: d.moods.map((m) => cat('sound', 'Estado de ánimo', m)),
    origin: d.origin ?? null,
    since: d.since ?? 1,
    data: {
      url: seedUrl(spec.file),
      soundType: d.soundType,
      loop: spec.loop,
      volume: d.volume,
      durationSec: Math.round(spec.seconds * 100) / 100,
    },
  });
});
