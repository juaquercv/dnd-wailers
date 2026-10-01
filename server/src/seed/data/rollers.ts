import { ROULETTE_PALETTE, newId, type RollerKind, type RouletteSegment } from '@wailers/shared';
import { CAMPAIGN_A_ID, CAMPAIGN_B_ID, rollerId } from './ids';

/** Campaign-owned custom dice and roulettes. Results are visual only; the DM applies anything by hand. */

export interface SeedRoller {
  id: string;
  campaignId: string;
  name: string;
  kind: RollerKind;
  description: string;
  tags: string[];
  active: boolean;
  isTurnRoll: boolean;
  segments: RouletteSegment[];
  formula: string | null;
  faces: string[] | null;
  sortOrder: number;
}

type Seg = [label: string, icon: string | null, color: string, weight: number, description?: string];

const seg = ([label, icon, color, weight, description]: Seg): RouletteSegment => ({ id: newId('seg'), label, icon, color, weight, description: description ?? '' });

function roulette(campaign: 'a' | 'b', key: string, name: string, description: string, tags: string[], segments: Seg[], isTurnRoll = false): Omit<SeedRoller, 'sortOrder'> {
  return {
    id: rollerId(campaign, key),
    campaignId: campaign === 'a' ? CAMPAIGN_A_ID : CAMPAIGN_B_ID,
    name,
    kind: 'roulette',
    description,
    tags,
    active: true,
    isTurnRoll,
    segments: segments.map(seg),
    formula: null,
    faces: null,
  };
}

function dice(campaign: 'a' | 'b', key: string, name: string, description: string, tags: string[], opts: { formula?: string; faces?: string[] }): Omit<SeedRoller, 'sortOrder'> {
  return {
    id: rollerId(campaign, key),
    campaignId: campaign === 'a' ? CAMPAIGN_A_ID : CAMPAIGN_B_ID,
    name,
    kind: 'dice',
    description,
    tags,
    active: true,
    isTurnRoll: false,
    segments: [],
    formula: opts.formula ?? null,
    faces: opts.faces ?? null,
  };
}

const d20Segments: Seg[] = Array.from({ length: 20 }, (_, i) => {
  const n = i + 1;
  const icon = n === 20 ? '⭐' : n === 1 ? '💀' : null;
  const description = n === 20 ? '¡Crítico natural!' : n === 1 ? 'Pifia natural.' : '';
  return [String(n), icon, ROULETTE_PALETTE[i % ROULETTE_PALETTE.length]!, 1, description] as Seg;
});

/** Campaign A — "Los Cielos de Latón" (steampunk, seed v2). */
const ROLLERS_A: Omit<SeedRoller, 'sortOrder'>[] = [
  roulette('a', 'eventos', 'Eventos aleatorios', 'Qué ocurre durante un viaje en dirigible o al llegar a una isla.', ['#steampunk', 'viaje', 'eventos'], [
    ['¡Abordaje pirata!', '🏴‍☠️', '#c0392b', 2, 'Un ancla de abordaje se clava en la barandilla: piratas del cielo.'],
    ['Avería en la caldera', '🔥', '#d35400', 2, 'La presión se dispara: alguien tiene que bajar a la sala de máquinas.'],
    ['Mercader del aire', '🛒', '#f39c12', 2, 'Un dirigible mercante ofrece piezas y carbón a buen precio.'],
    ['Tormenta eléctrica', '⛈️', '#2c3e50', 1, 'Rayos entre las nubes: los artilugios eléctricos fallan con un 1-2 en 1d6.'],
    ['Patrulla de autómatas', '🤖', '#7f8c8d', 2, 'La Guardia de Latón pide salvoconductos.'],
    ['Corriente favorable', '🌬️', '#16a085', 2, 'El viaje dura la mitad de lo previsto.'],
    ['Señal de auxilio', '🆘', '#e74c3c', 1, 'Una bengala roja en la niebla: un dirigible a la deriva.'],
    ['Cielo en calma', '☁️', '#95a5a6', 3, 'Nada ocurre. Solo nubes y el zumbido de las hélices.'],
  ]),
  roulette('a', 'botin', 'Botín', 'Qué encuentran los héroes al registrar una bodega, un autómata o un pirata. El DM lo añade a mano.', ['#steampunk', 'botín', 'tesoro'], [
    ['Monedas de latón (3d10)', '🪙', '#f1c40f', 4],
    ['Cartuchos', '🔫', '#7f8c8d', 3],
    ['Botiquín de campaña', '🩹', '#e74c3c', 3],
    ['Engranajes de precisión', '⚙️', '#b8860b', 3, 'Valen 5 coronas de latón para cualquier inventor.'],
    ['Granada de vapor', '💣', '#d35400', 2],
    ['Pieza de artilugio poco común', '🔧', '#2ecc71', 1],
    ['Artilugio raro', '🌟', '#3498db', 0.5],
    ['Solo chatarra y hollín', '🗑️', '#2c3e50', 2],
  ]),
  roulette('a', 'clima', 'Clima', 'El tiempo en el Archipiélago de los Cielos.', ['#steampunk', 'clima', 'viaje'], [
    ['Despejado', '☀️', '#f1c40f', 4],
    ['Niebla industrial', '🌫️', '#95a5a6', 3, 'Visibilidad reducida a 6 casillas sobre las ciudades.'],
    ['Tormenta eléctrica', '⛈️', '#2c3e50', 1, 'Rayos entre los dirigibles: cuidado con los pararrayos.'],
    ['Corriente ascendente', '🌀', '#16a085', 2, 'Los dirigibles ganan altura sin gastar carbón.'],
    ['Lluvia de hollín', '🌑', '#34495e', 2, 'El hollín de las fábricas lo mancha todo. Desventaja en Percepción a distancia.'],
    ['Viento cruzado', '🌬️', '#3498db', 2, 'Pilotar exige una prueba de Destreza CD 12.'],
    ['Mar de nubes en calma', '☁️', '#bdc3c7', 2],
  ]),
  roulette('a', 'averias', 'Averías del dirigible', 'Qué se rompe cuando el dirigible recibe un golpe o fuerza las máquinas. Solo narrativo: el DM decide qué aplica.', ['#steampunk', 'dirigible', 'averías'], [
    ['Fuga de vapor', '💨', '#bdc3c7', 3, 'La velocidad se reduce a la mitad hasta repararla (Herramientas de mecánico CD 12).'],
    ['Hélice atascada', '🌀', '#7f8c8d', 2, 'El dirigible gira sin control un asalto.'],
    ['Timón bloqueado', '🧭', '#8e44ad', 2, 'Solo puede avanzar en línea recta.'],
    ['Pérdida de gas en la envoltura', '🎈', '#e67e22', 1, 'Pierde altura poco a poco: hay que parchear la envoltura.'],
    ['Caldera sobrecalentada', '🔥', '#c0392b', 1, 'Tira el Dado de la caldera.'],
    ['Cable de amarre roto', '🪢', '#d35400', 2, 'Algo (o alguien) cuelga del costado.'],
    ['Brújula enloquecida', '🧲', '#2980b9', 1, 'Desventaja en las pruebas de navegación hasta repararla.'],
    ['Sin averías', '✅', '#27ae60', 3, '¡Las remachadoras de Latón hicieron un buen trabajo!'],
  ]),
  roulette('a', 'd20', 'Ruleta D20', 'Un d20 en forma de ruleta para los momentos más dramáticos.', ['d20', 'dramático'], d20Segments),
  roulette('a', 'encuentros', 'Encuentros en el aire', 'Encuentros aleatorios entre islas y rutas de dirigibles.', ['#steampunk', 'encuentros', 'combate'], [
    ['Piratas del cielo (1d4+1)', '🏴‍☠️', '#c0392b', 3],
    ['Drones vigía (1d3)', '🛸', '#3498db', 2],
    ['Capitana «Cuervo Rojo»', '🐦', '#8e1a1a', 0.5, 'Con su tripulación al completo. Prefiere negociar un peaje.'],
    ['Gárgolas de chatarra (1d2)', '🦇', '#7f8c8d', 1],
    ['Mercante a la deriva', '🎈', '#f39c12', 2, '¿Abandonado... o una trampa?'],
    ['Patrulla de la Guardia de Latón', '🤖', '#95a5a6', 2],
    ['Banco de nubes de tormenta', '⛈️', '#2c3e50', 1],
    ['Ratas mecánicas en la bodega (2d4)', '🐀', '#6d4c41', 2],
  ]),
  roulette('a', 'destino-turno', 'Destino del turno', 'Se ofrece a cada jugador al empezar su turno. Lo que salga lo aplica el DM si quiere.', ['#steampunk', 'turno', 'destino'], [
    ['Presión al máximo', '♨️', '#e67e22', 1, 'Recuperas 1d4 de Vapor (lo aplica el DM).'],
    ['Golpe de suerte', '🍀', '#2ecc71', 1, '+2 a tu próxima tirada.'],
    ['Nada especial', '😐', '#7f8c8d', 3],
    ['Engranaje suelto', '⚙️', '#8e44ad', 1, 'Desventaja en la primera tirada de este turno.'],
    ['Segundo aire', '❤️', '#e74c3c', 1, 'Recuperas 1d4 PV (lo aplica el DM).'],
    ['Ráfaga de viento', '🌬️', '#3498db', 1, '+3 m de velocidad este turno.'],
  ], true),
  dice('a', 'dado-caldera', 'Dado de la caldera', 'Dado de seis caras para cuando alguien fuerza una caldera o un artilugio. Cada cara tiene la misma probabilidad; el DM decide las consecuencias.', ['#steampunk', 'caldera', 'artilugios'], {
    faces: ['🔥 Presión máxima', '💨 Fuga de vapor', '⚙️ Engranaje suelto', '🛡️ Válvula estable', '⚡ Chispazo', '💥 ¡Explosión!'],
  }),
  dice('a', 'escape-vapor', 'Escape de vapor', 'Daño de una tubería que revienta o de una trampa de vapor en la fábrica.', ['#steampunk', 'trampa', 'daño'], { formula: '2d6+2' }),
];

/** Campaign B — "Las Criptas de Valdris". */
const ROLLERS_B: Omit<SeedRoller, 'sortOrder'>[] = [
  roulette('b', 'eventos', 'Eventos aleatorios', 'Qué perturba la noche en el valle de Valdris.', ['eventos', 'terror'], [
    ['Gemido entre las tumbas', '👻', '#7f8c8d', 2],
    ['Cuervo mensajero', '🐦', '#2c3e50', 1, 'Un cuervo deja caer un trozo de pergamino con una advertencia.'],
    ['Niebla espesa', '🌫️', '#bdc3c7', 3, 'La visión se reduce a 3 casillas.'],
    ['Tumba abierta', '⚰️', '#8e44ad', 2, 'Algo ha salido de aquí hace poco.'],
    ['Luz fantasmal', '🕯️', '#1abc9c', 2, 'Una luz verde guía hacia la cripta.'],
    ['Peregrino perdido', '🧎', '#e67e22', 1, '¿Vivo o muerto?'],
    ['Campana que suena sola', '🔔', '#f39c12', 1],
    ['Silencio absoluto', '🤫', '#34495e', 2],
  ]),
  roulette('b', 'botin', 'Botín', 'Lo que se encuentra en tumbas y sarcófagos.', ['botín', 'tumbas'], [
    ['Monedas antiguas (3d6)', '🪙', '#f1c40f', 4],
    ['Reliquia de plata', '⚜️', '#bdc3c7', 2],
    ['Agua bendita', '💧', '#3498db', 2],
    ['Pergamino de los muertos', '📜', '#8e44ad', 1],
    ['Joya funeraria', '💍', '#9b59b6', 1],
    ['Huesos y polvo', '🦴', '#7f8c8d', 3],
    ['Arma ceremonial', '🗡️', '#c0392b', 1],
  ]),
  roulette('b', 'clima', 'Clima', 'La noche en Valdris nunca es tranquila.', ['clima', 'noche'], [
    ['Luna llena', '🌕', '#f1c40f', 2],
    ['Niebla', '🌫️', '#bdc3c7', 4],
    ['Llovizna', '🌦️', '#3498db', 2],
    ['Tormenta eléctrica', '⛈️', '#2c3e50', 1],
    ['Helada', '❄️', '#1abc9c', 1],
    ['Viento aullante', '🌬️', '#7f8c8d', 2],
  ]),
  roulette('b', 'susurros', 'Susurros de la cripta', 'Tirada de turno: la cripta habla a cada héroe al empezar su turno.', ['turno', 'terror'], [
    ['Te observan', '👁️', '#8e44ad', 1, 'Una voz susurra tu nombre: desventaja en Sabiduría este turno.'],
    ['Luz piadosa', '🕯️', '#f1c40f', 1, '+1 a la CA este turno.'],
    ['Escalofrío', '💀', '#7f8c8d', 1, 'Pierdes 1 PV por el frío (lo aplica el DM).'],
    ['Silencio', '😶', '#34495e', 3, 'Nada ocurre.'],
    ['Fe renovada', '✝️', '#ecf0f1', 1, 'Ventaja en tu próxima tirada de salvación.'],
    ['Sangre fría', '🩸', '#c0392b', 1, '+1d4 a tu próximo ataque.'],
  ], true),
];

export const SEED_ROLLERS: SeedRoller[] = [...ROLLERS_A.map((r, i) => ({ ...r, sortOrder: i })), ...ROLLERS_B.map((r, i) => ({ ...r, sortOrder: i }))];
