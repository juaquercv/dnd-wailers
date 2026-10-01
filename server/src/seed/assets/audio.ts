import { bosque, cueva, fuegoDeCampamento, lluvia } from './ambience';
import { criptaSilenciosa, himnoDelDragon, tabernaAlegre, tamboresDeGuerra } from './music';
import { persecucionEnLasNubes, salaDeMaquinas, valsDeVapor, vientoEnCubierta } from './musicSteam';
import { soundFile } from './paths';
import { bolaDeFuego, choqueDeEspadas, curacion, golpe, monedas, pasoDePagina, puertaQueCruje, rugidoDeDragon, trueno } from './sfx';
import { disparoDePistola, engranajes, helices, silbatoDeVapor } from './sfxSteam';
import { SAMPLE_RATE, samplesFor, type Buf } from './synth';

/** Registry of every synthesized sound file (exact lengths so durations are known without rendering). */

export interface AudioSpec {
  file: string;
  seconds: number;
  loop: boolean;
  build: () => Buf;
}

function spec(key: string, seconds: number, loop: boolean, render: () => Buf): AudioSpec {
  return {
    file: soundFile(key),
    seconds: samplesFor(seconds) / SAMPLE_RATE,
    loop,
    build: () => {
      const raw = render();
      const n = samplesFor(seconds);
      if (raw.length === n) return raw;
      const out = new Float32Array(n);
      out.set(raw.subarray(0, Math.min(n, raw.length)));
      return out;
    },
  };
}

export const AUDIO_SPECS = {
  'taberna-alegre': spec('taberna-alegre', 20, true, tabernaAlegre),
  'tambores-de-guerra': spec('tambores-de-guerra', 19.2, true, tamboresDeGuerra),
  'cripta-silenciosa': spec('cripta-silenciosa', 24, true, criptaSilenciosa),
  'himno-del-dragon': spec('himno-del-dragon', 24, true, himnoDelDragon),
  bosque: spec('ambiente-bosque', 16, true, bosque),
  lluvia: spec('ambiente-lluvia', 12, true, lluvia),
  cueva: spec('ambiente-cueva', 16, true, cueva),
  'fuego-de-campamento': spec('ambiente-fuego-de-campamento', 12, true, fuegoDeCampamento),
  'choque-de-espadas': spec('choque-de-espadas', 1.4, false, choqueDeEspadas),
  'efecto-bola-de-fuego': spec('bola-de-fuego', 2.6, false, bolaDeFuego),
  'puerta-que-cruje': spec('puerta-que-cruje', 2.6, false, puertaQueCruje),
  'rugido-de-dragon': spec('rugido-de-dragon', 3.0, false, rugidoDeDragon),
  trueno: spec('trueno', 3.0, false, trueno),
  curacion: spec('curacion', 2.2, false, curacion),
  monedas: spec('monedas', 1.2, false, monedas),
  golpe: spec('golpe', 0.5, false, golpe),
  'paso-de-pagina': spec('paso-de-pagina', 0.7, false, pasoDePagina),
  // Los Cielos de Latón (steampunk).
  'vals-de-vapor': spec('vals-de-vapor', 24, true, valsDeVapor),
  'persecucion-en-las-nubes': spec('persecucion-en-las-nubes', 19.2, true, persecucionEnLasNubes),
  'sala-de-maquinas': spec('ambiente-sala-de-maquinas', 16, true, salaDeMaquinas),
  'viento-en-cubierta': spec('ambiente-viento-en-cubierta', 16, true, vientoEnCubierta),
  'silbato-de-vapor': spec('silbato-de-vapor', 2.6, false, silbatoDeVapor),
  engranajes: spec('engranajes', 2.0, false, engranajes),
  'disparo-de-pistola': spec('disparo-de-pistola', 1.4, false, disparoDePistola),
  helices: spec('helices', 3.2, false, helices),
} satisfies Record<string, AudioSpec>;

export type AudioKey = keyof typeof AUDIO_SPECS;
