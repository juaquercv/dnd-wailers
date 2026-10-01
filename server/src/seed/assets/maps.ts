import { CAVE, CEMETERY, CHAPEL, CROSSROADS, CRYPT_UPPER, FOREST, MOUNTAINS, OSSUARY, OVERVIEW_B, SMALL_CAVE, TAVERN, TOWER, VILLAGE } from './layouts';
import { AIRSHIP, FACTORY, GEAR_CITY, SKY_OVERVIEW, SKY_PORT, WORKSHOP } from './layoutsSteam';
import { buildChapel, buildCryptUpper, buildDragonCave, buildOssuary, buildSmallCave, buildTavern, buildTowerGround, buildTowerTop } from './mapsIndoor';
import { buildCemetery, buildCrossroads, buildForest, buildMountains, buildVillage } from './mapsOutdoor';
import { buildOverviewValdris } from './mapsOverview';
import { buildFactory, buildWorkshop } from './mapsSteamIndoor';
import { buildOverviewSky } from './mapsSteamOverview';
import { buildAirshipDeck, buildAirshipEngine } from './mapsSteamShip';
import { buildGearCity, buildSkyPort } from './mapsSteamTown';

export interface MapSpec {
  /** Path relative to <uploads>/seed. */
  file: string;
  width: number;
  height: number;
  title: string;
  build: () => string;
}

function spec(key: string, title: string, size: { width: number; height: number }, build: () => string): MapSpec {
  return { file: `maps/${key}.svg`, width: size.width, height: size.height, title, build };
}

export const MAP_SPECS = {
  // Los Cielos de Latón (campaign A, steampunk).
  'overview-cielos': spec('overview-cielos-laton', 'Archipiélago de los Cielos', SKY_OVERVIEW, buildOverviewSky),
  'ciudad-engranajes': spec('ciudad-engranajes', 'Ciudad de Engranajes', GEAR_CITY, buildGearCity),
  'taller-inventor': spec('taller-inventor', 'Taller del Inventor', WORKSHOP, buildWorkshop),
  'puerto-dirigibles': spec('puerto-dirigibles', 'Puerto de Dirigibles', SKY_PORT, buildSkyPort),
  'albatros-cubierta': spec('albatros-cubierta', 'El «Albatros» — Cubierta superior', AIRSHIP, buildAirshipDeck),
  'albatros-maquinas': spec('albatros-maquinas', 'El «Albatros» — Sala de máquinas', AIRSHIP, buildAirshipEngine),
  'fabrica-abandonada': spec('fabrica-abandonada', 'Fábrica Abandonada', FACTORY, buildFactory),
  // Las Criptas de Valdris (campaign B).
  'overview-valdris': spec('overview-valdris', 'Valle de Valdris', OVERVIEW_B, buildOverviewValdris),
  cementerio: spec('cementerio-valdris', 'Cementerio de Valdris', CEMETERY, buildCemetery),
  'cripta-superior': spec('cripta-superior', 'Cripta superior', CRYPT_UPPER, buildCryptUpper),
  osario: spec('osario-profundo', 'Osario profundo', OSSUARY, buildOssuary),
  capilla: spec('capilla-ruinas', 'Capilla en ruinas', CHAPEL, buildChapel),
  // Library zone templates (generic fantasy maps).
  aldea: spec('aldea-brezoscuro', 'Aldea', VILLAGE, buildVillage),
  taberna: spec('taberna-jabali-dorado', 'Taberna', TAVERN, buildTavern),
  bosque: spec('bosque-susurros', 'Claro del bosque', FOREST, buildForest),
  montanas: spec('montanas-cenicientas', 'Ladera volcánica', MOUNTAINS, buildMountains),
  'cueva-dragon': spec('cueva-dragon', 'Guarida del dragón', CAVE, buildDragonCave),
  'torre-baja': spec('torre-planta-baja', 'Torre del hechicero — Planta baja', TOWER, buildTowerGround),
  'torre-cima': spec('torre-cima', 'Torre del hechicero — Cima', TOWER, buildTowerTop),
  cruce: spec('cruce-caminos', 'Cruce de caminos', CROSSROADS, buildCrossroads),
  'cueva-pequena': spec('cueva-pequena', 'Cueva pequeña', SMALL_CAVE, buildSmallCave),
} satisfies Record<string, MapSpec>;

export type MapKey = keyof typeof MAP_SPECS;
