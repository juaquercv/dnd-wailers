import { CAVE, CEMETERY, CHAPEL, CROSSROADS, CRYPT_UPPER, FOREST, MOUNTAINS, OSSUARY, OVERVIEW_A, OVERVIEW_B, SMALL_CAVE, TAVERN, TOWER, VILLAGE } from './layouts';
import { buildChapel, buildCryptUpper, buildDragonCave, buildOssuary, buildSmallCave, buildTavern, buildTowerGround, buildTowerTop } from './mapsIndoor';
import { buildCemetery, buildCrossroads, buildForest, buildMountains, buildVillage } from './mapsOutdoor';
import { buildOverviewDragon, buildOverviewValdris } from './mapsOverview';

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
  'overview-dragon': spec('overview-dragon', 'Tierras de Brezoscuro', OVERVIEW_A, buildOverviewDragon),
  'overview-valdris': spec('overview-valdris', 'Valle de Valdris', OVERVIEW_B, buildOverviewValdris),
  aldea: spec('aldea-brezoscuro', 'Aldea de Brezoscuro', VILLAGE, buildVillage),
  taberna: spec('taberna-jabali-dorado', 'Taberna El Jabalí Dorado', TAVERN, buildTavern),
  bosque: spec('bosque-susurros', 'Bosque de los Susurros', FOREST, buildForest),
  montanas: spec('montanas-cenicientas', 'Montañas Cenicientas', MOUNTAINS, buildMountains),
  'cueva-dragon': spec('cueva-dragon', 'Cueva del Dragón', CAVE, buildDragonCave),
  'torre-baja': spec('torre-planta-baja', 'Torre del Hechicero — Planta baja', TOWER, buildTowerGround),
  'torre-cima': spec('torre-cima', 'Torre del Hechicero — Cima', TOWER, buildTowerTop),
  cementerio: spec('cementerio-valdris', 'Cementerio de Valdris', CEMETERY, buildCemetery),
  'cripta-superior': spec('cripta-superior', 'Cripta superior', CRYPT_UPPER, buildCryptUpper),
  osario: spec('osario-profundo', 'Osario profundo', OSSUARY, buildOssuary),
  capilla: spec('capilla-ruinas', 'Capilla en ruinas', CHAPEL, buildChapel),
  cruce: spec('cruce-caminos', 'Cruce de caminos', CROSSROADS, buildCrossroads),
  'cueva-pequena': spec('cueva-pequena', 'Cueva pequeña', SMALL_CAVE, buildSmallCave),
} satisfies Record<string, MapSpec>;

export type MapKey = keyof typeof MAP_SPECS;
