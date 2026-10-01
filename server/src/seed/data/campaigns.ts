import { createRuleSystem, defaultVisibility, newId, type OverviewMap, type RuleSystem, type SpawnPoint, type VisibilitySettings } from '@wailers/shared';
import { CEMETERY, OVERVIEW_B } from '../assets/layouts';
import { GEAR_CITY, SKY_OVERVIEW } from '../assets/layoutsSteam';
import { cat } from './categories';
import { CAMPAIGN_A_ID, CAMPAIGN_B_ID } from './ids';
import { mapUrl, type SeedZone } from './zoneKit';
import { A, buildZonesA } from './zonesA';
import { B, buildZonesB } from './zonesB';

/** The two seeded campaigns with their overview maps, spawn points, rules and visibility defaults. */

export interface SeedCampaign {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  ownerId: string;
  rules: RuleSystem;
  overview: OverviewMap;
  spawn: SpawnPoint;
  defaultVisibility: VisibilitySettings;
  tags: string[];
  zones: SeedZone[];
}

/** Campaign A — "Los Cielos de Latón": steampunk with airships and no magic. Vapor is the mana resource. */
function campaignA(): SeedCampaign {
  const places = SKY_OVERVIEW.places;
  const pins = {
    ciudad: { id: newId('pin'), zoneId: A.ciudad.zone, ...places.ciudad, label: 'Ciudad de Engranajes', icon: '⚙️' },
    puerto: { id: newId('pin'), zoneId: A.puerto.zone, ...places.puerto, label: 'Puerto de Dirigibles', icon: '⚓' },
    albatros: { id: newId('pin'), zoneId: A.albatros.zone, ...places.albatros, label: 'El Dirigible «Albatros»', icon: '🎈' },
    fabrica: { id: newId('pin'), zoneId: A.fabrica.zone, ...places.fabrica, label: 'Fábrica Abandonada', icon: '🏭' },
  };
  const rules = createRuleSystem('mana');
  rules.magic.manaName = 'Vapor';
  rules.magic.manaPerLevel = 8;
  rules.magic.manaRegenPerTurn = 3;
  rules.currency = { enabled: true, name: 'Coronas de latón', short: 'cl' };
  rules.heroCreation.startingLevel = 3;
  rules.heroCreation.startingGold = 60;
  rules.heroCreation.allowedClassIds = ['Ingeniero', 'Aeronauta', 'Pistolero', 'Mecánico', 'Inventor', 'Duelista', 'Guerrero', 'Pícaro'].map((c) => cat('hero', 'Clase', c));
  rules.heroCreation.allowedRaceIds = ['Humano', 'Elfo', 'Enano', 'Mediano', 'Gnomo', 'Semiorco', 'Semielfo', 'Autómata'].map((r) => cat('hero', 'Raza', r));
  return {
    id: CAMPAIGN_A_ID,
    name: 'Los Cielos de Latón',
    description:
      'Sobre un mar infinito de nubes flotan las islas-ciudad del Archipiélago de los Cielos, unidas por rutas de dirigibles. En la Ciudad de Engranajes, la ingeniera Ada Volta ha descubierto que alguien ha vuelto a encender el Dragón de Latón, una máquina de guerra olvidada en la Fábrica Abandonada. Los héroes deberán recuperar los planos del dirigible «Albatros», sobrevivir a los piratas de la capitana «Cuervo Rojo» y detener al coloso de vapor antes de que reduzca la ciudad a chatarra.',
    coverUrl: mapUrl('overview-cielos'),
    ownerId: 'juan',
    rules,
    overview: {
      imageUrl: mapUrl('overview-cielos'),
      width: SKY_OVERVIEW.width,
      height: SKY_OVERVIEW.height,
      pins: Object.values(pins),
      links: [
        { id: newId('link'), fromPinId: pins.ciudad.id, toPinId: pins.puerto.id, style: 'road' },
        { id: newId('link'), fromPinId: pins.puerto.id, toPinId: pins.albatros.id, style: 'sea' },
        { id: newId('link'), fromPinId: pins.ciudad.id, toPinId: pins.fabrica.id, style: 'path' },
      ],
    },
    spawn: { zoneId: A.ciudad.zone, levelId: A.ciudad.level, x: GEAR_CITY.spawn.x, y: GEAR_CITY.spawn.y },
    defaultVisibility: { ...defaultVisibility(), visionMode: 'all', enemyHp: 'bar', canSeeOthersInventory: true },
    tags: ['#steampunk', '#dirigibles', 'aventura', 'nivel 3-5', 'vapor'],
    zones: buildZonesA(),
  };
}

function campaignB(): SeedCampaign {
  const pins = {
    cementerio: { id: newId('pin'), zoneId: B.cementerio.zone, ...OVERVIEW_B.places.cementerio, label: 'Cementerio de Valdris', icon: '⚰️' },
    cripta: { id: newId('pin'), zoneId: B.cripta.zone, ...OVERVIEW_B.places.cripta, label: 'Cripta de Valdris', icon: '💀' },
  };
  const rules = createRuleSystem('slots');
  rules.heroCreation.startingLevel = 3;
  rules.rest.short.restoreHpPct = 20;
  return {
    id: CAMPAIGN_B_ID,
    name: 'Las Criptas de Valdris',
    description:
      'En el valle de Valdris los muertos ya no descansan. El antiguo señor del valle, convertido en liche, despierta a su ejército desde el Osario profundo. Una campaña de terror gótico entre niebla, tumbas abiertas y criptas olvidadas.',
    coverUrl: mapUrl('overview-valdris'),
    ownerId: 'adriel',
    rules,
    overview: {
      imageUrl: mapUrl('overview-valdris'),
      width: OVERVIEW_B.width,
      height: OVERVIEW_B.height,
      pins: Object.values(pins),
      links: [{ id: newId('link'), fromPinId: pins.cementerio.id, toPinId: pins.cripta.id, style: 'path' }],
    },
    spawn: { zoneId: B.cementerio.zone, levelId: B.cementerio.level, x: CEMETERY.spawn.x, y: CEMETERY.spawn.y },
    defaultVisibility: { ...defaultVisibility(), visionMode: 'explored', visionRadius: 6, enemyHp: 'hidden' },
    tags: ['terror', 'no-muertos', 'mazmorra', 'espacios de conjuro'],
    zones: buildZonesB(),
  };
}

export function buildCampaigns(): SeedCampaign[] {
  return [campaignA(), campaignB()];
}
