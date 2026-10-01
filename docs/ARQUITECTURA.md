# D&D Wailers — Arquitectura

Mesa virtual (VTT) para campañas de D&D simplificadas. **Es una herramienta manual para el DM, no un motor de reglas**: las tiradas solo muestran resultados; el DM ajusta PV, botín, oro y XP a mano con pocos clics.

---

## 1. Stack y decisiones

| Capa | Tecnología | Motivo |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite 5 | Rápido de desarrollar y compilar; tipado compartido con el servidor. |
| Lienzo 2D | **Konva** (`react-konva`) | Arrastrar/soltar, selección, transformaciones y detección de clics listos para el editor y las fichas. Los efectos de partículas (lluvia, nieve, hechizos) se dibujan con un canvas propio superpuesto (ligero, sin dependencia extra). Se eligió Konva sobre PixiJS porque el editor necesita mucha interacción tipo "Google Slides"; PixiJS brilla en rendimiento masivo, que aquí no es necesario. |
| Estilos | Tailwind CSS 3 + fuentes locales (`@fontsource/cinzel`, `@fontsource/inter`) | Tema oscuro "pergamino y oro" coherente; funciona sin Internet en la LAN. |
| Estado cliente | Zustand | Stores pequeños y simples (`auth`, `session`, `editor`, `settings`). |
| Backend | Node.js 22 + TypeScript + **Fastify 5** | Rápido, tipado, plugins oficiales (estáticos, multipart). |
| Tiempo real | Socket.IO 4 | Salas por sesión, reconexión automática, acks tipados. |
| Base de datos | PostgreSQL 16 + Prisma 6 | Migraciones automáticas; documentos JSON tipados para zonas y estado de partida. |
| Búsqueda | `pg_trgm` (trigramas, tolerante a errores) + índice FTS `to_tsvector('simple')` | Columna `searchText` normalizada (minúsculas y **sin acentos**) → no distingue acentos ni mayúsculas. |
| Audio | Howler.js (música/ambiente con *crossfade*) + Web Audio (sonidos de interfaz sintetizados) | |
| Contenedores | Docker Compose: `db` (postgres:16-alpine) + `app` (Node sirve API, sockets y el cliente compilado) | Un solo puerto expuesto, configurable en `.env`. |

Monorepo con *npm workspaces*:

- `shared/` — tipos, contratos de eventos, constantes y lógica pura compartida (dados, ruletas, visión, filtro de vista de jugador, búsqueda). El servidor y el cliente importan el código fuente TypeScript directamente.
- `server/` — API REST, Socket.IO, motor de sesiones en vivo, semillas.
- `client/` — SPA React.

## 2. Arquitectura

```
 Navegador (DM / jugadores, LAN)                    Contenedor "app" (Node 22)
 ┌─────────────────────────────┐   HTTP /api/*      ┌──────────────────────────────────────┐
 │ React SPA                   │ ─────────────────▶ │ Fastify                              │
 │  ├ stores (zustand)         │   /uploads/*       │  ├ rutas REST (biblioteca, campañas, │
 │  ├ Konva: mapa/editor       │ ◀───────────────── │  │  zonas, ruletas, sesiones, subidas)│
 │  ├ overlay FX (canvas)      │                    │  ├ estáticos: cliente + /uploads      │
 │  └ Howler / Web Audio       │   WebSocket        │  ├ Socket.IO                          │
 │                             │ ◀════════════════▶ │  │  └ SessionManager (estado en       │
 └─────────────────────────────┘  session:state     │  │     memoria por sesión, filtrado    │
                                  session:event     │  │     por jugador, persistencia)      │
                                                    │  └ bus de dominio (EventEmitter)      │
                                                    └───────────────┬──────────────────────┘
                                                                    │ Prisma
                                                    ┌───────────────▼──────────────┐
                                                    │ PostgreSQL 16 (+ pg_trgm)    │  volumen db-data
                                                    └──────────────────────────────┘
                                                    Archivos subidos y semillas → volumen uploads (/data/uploads)
```

Principios:

1. **El servidor es la autoridad**: cada sesión vive en memoria (`LiveState`) dentro del `SessionManager`; los clientes envían intenciones (`token:move`, `roll:dice`…), el servidor valida permisos, muta el estado y difunde.
2. **Filtrado por jugador en el servidor**: cada jugador recibe una vista filtrada (`buildPlayerView` en `shared/src/view.ts`): sin fichas ocultas, sin enemigos fuera de su visión, PV de enemigos según permiso, sin notas del DM, sin inventarios ajenos si no está permitido. La misma función pura la usa el DM para "Ver como jugador X".
3. **Difusión coalescida**: tras cada mutación el servidor envía el estado completo filtrado (`session:state`) con un retardo de ~30 ms que agrupa cambios. Con ≤ 6 usuarios en LAN es simple y robusto. Los eventos efímeros (tiradas, efectos, pings, arrastres) van por `session:event`.
4. **Persistencia**: el estado se guarda en `GameSession.state` (JSON) con *debounce* de 2 s, al pausar y al terminar. Los cambios de hojas de héroe se escriben de vuelta en la biblioteca (los héroes se reutilizan entre campañas).
5. **Sin automatismos de reglas**: ningún resultado de dado/ruleta modifica nada. Los botones de descanso o regenerar maná son acciones manuales explícitas del DM.

## 3. Estructura de carpetas

```
D&D Wailers/
├─ docker-compose.yml        # db + app; puerto ${APP_PORT}
├─ Dockerfile                # build multi-etapa (cliente + servidor)
├─ .env.example              # APP_PORT, credenciales de Postgres, timeout de usuario
├─ package.json              # workspaces
├─ README.md
├─ docs/ARQUITECTURA.md
├─ shared/src/
│  ├─ constants.ts           # rarezas, tamaños, estados, clima, iluminación, capas…
│  ├─ ids.ts                 # ids y aleatoriedad segura (crypto)
│  ├─ defaults.ts            # fábricas: zona, nivel, héroe vacío, visibilidad por defecto…
│  ├─ rules.ts               # sistema de reglas por campaña (maná / espacios de conjuro)
│  ├─ dice.ts  roulette.ts   # fórmulas (2d6+3, ventaja) y ruletas ponderadas
│  ├─ grid.ts  vision.ts     # cuadrícula cuadrada/hex, polígono de visión, memoria de niebla
│  ├─ search.ts              # normalización sin acentos, etiquetas
│  ├─ view.ts                # filtro de vista por jugador
│  ├─ events.ts              # contrato Socket.IO
│  └─ types/                 # library, campaign, rollers, session, api
├─ server/
│  ├─ prisma/schema.prisma + migrations/
│  └─ src/
│     ├─ index.ts            # arranque: semillas → HTTP + sockets en 0.0.0.0
│     ├─ config.ts  db.ts  bus.ts
│     ├─ auth/claims.ts      # bloqueo de usuarios (sin contraseña)
│     ├─ http/               # app Fastify + rutas REST
│     ├─ services/           # serializadores y lógica de dominio (búsqueda…)
│     ├─ realtime/socket.ts  # Socket.IO: autenticación, presencia
│     ├─ live/               # SessionManager + manejadores por dominio
│     └─ seed/               # usuarios, categorías, biblioteca, campañas, mapas SVG y audio generados
└─ client/src/
   ├─ api/ (http.ts, socket.ts)  stores/  lib/  components/ui/
   ├─ map/                   # primitivas Konva compartidas por editor y partida
   └─ features/
      ├─ auth/ menu/ sessions/ lobby/ chat/
      ├─ library/ heroes/ campaigns/ editor/ rollers/
      ├─ game/ visibility/ dice/ audio/ fx/
```

## 4. Modelo de datos

### Tablas (Prisma)

| Tabla | Contenido |
|---|---|
| `User` | Adriel, Juan, Patrick, Javier, Campos (id = nombre en minúsculas, color). |
| `Category` | Árbol por tipo de elemento (`kind`). Las raíces son **facetas** ("Tipo de criatura", "Hábitat", "Tipo de objeto"…), sus hijos son valores y pueden anidarse (Arma › Cuerpo a cuerpo › Espada). Editables por el DM. |
| `LibraryEntry` | **Biblioteca única** para `creature` (enemigos/NPC), `item`, `spell`, `zone` (plantillas), `sound` y `hero`. Columnas de faceta indexadas: `level`, `cr`, `hp`, `value`, `weight`, `rarity`, `size`; `tags String[]` (GIN); `data Json` con la mecánica específica; `searchText` normalizado (índices trigram y FTS); `ownerId`, `originCampaignId`. |
| `EntryCategory` | N:M elemento ↔ categoría. |
| `EntryUsage` | Campañas en las que se usó un elemento (indicador de origen/uso). |
| `Favorite`, `RecentUse` | Favoritos y "usados recientemente" por usuario. |
| `SavedFilter` | Filtros guardados (p. ej. "Jefes CR 10+ de cueva"). |
| `Campaign` | Nombre, dueño, `rules` (RuleSystem), `overview` (mapa general), `spawn`, `defaultVisibility`. |
| `Zone` | Una "lámina": orden, `parentZoneId` (sub-zonas), `gridPos` y `neighbors` (arriba/abajo/izquierda/derecha), música/ambiente, clima, iluminación y `levels` (JSON con los niveles/pisos). |
| `Roller` | Dados y ruletas personalizados **de una campaña** (segmentos con color, peso e icono), `active`, `isTurnRoll`, `copiedFromId` (copias independientes). |
| `GameSession` | Partida: host, estado (`lobby`/`playing`/`paused`/`ended`) y `state` (LiveState completo). |
| `SessionLog` | Registro de eventos y chat con visibilidad (`all`/`dm`/`user`). |

### Documentos JSON principales

- **ZoneLevel** (`shared/src/types/campaign.ts`): fondo (imagen, tamaño), cuadrícula (cuadrada/hex, tamaño, visible, *snap*), `elements` (imágenes, formas, trazos, textos, marcadores, fichas de diseño, transiciones, notas del DM; cada uno con su **capa**: fondo, terreno, objetos, fichas, niebla, iluminación, paredes, notas), `walls` (bloquean visión; puertas abribles; ventanas no bloquean), `lights` (antorchas) y `fogRegions` (zonas ocultas hasta que el DM las revela).
- **RuleSystem**: modo mágico (`mana`, `slots`, `uses`, `none`), atributos activables, inventario por peso/espacios, moneda, descansos, reglas de creación de héroes.
- **LiveState** (`shared/src/types/session.ts`): jugadores, hojas de héroe en vivo, fichas (posición por zona/nivel, PV, estados, botín registrado), iniciativa, estado por zona (niebla revelada, puertas, clima/luz), visibilidad global y por jugador, memoria de exploración por jugador y nivel (bitset base64), peticiones de tirada, oferta de tirada de turno, audio, proyección y trueques.

### Categorías, etiquetas y búsqueda

- Facetas predefinidas (semillas) por tipo: criaturas (tipo, rol, hábitat, afinidad elemental, resistencias, debilidades), objetos (tipo › subtipo), héroes (raza, clase, subclase, alineamiento, rol en el grupo), hechizos (escuela, tipo de daño, rol, clases), zonas (bioma, tipo) y sonidos (estado de ánimo). Rareza, tamaño, CR, nivel, PV, valor y peso son columnas para poder filtrar por rangos y ordenar.
- Filtro por categorías: **OR dentro de la misma faceta, AND entre facetas**, incluyendo subcategorías.
- Etiquetas libres normalizadas (`#volcán` → `volcan`), con autocompletado.
- Búsqueda: `searchText ILIKE '%q%'` ∪ `word_similarity(q, searchText) > umbral` ∪ FTS, ordenando por relevancia.

## 5. Eventos de Socket.IO

Contrato completo y tipado en `shared/src/events.ts`. Todos los eventos cliente→servidor llevan *ack* `{ ok, data | error }`.

| Grupo | Eventos (cliente → servidor) | Quién |
|---|---|---|
| Sesión | `session:join`, `session:leave`, `session:start`, `session:save`, `session:pause`, `session:end`, `session:setOptions` | DM (join/leave: todos) |
| Lobby | `lobby:selectHero`, `lobby:setReady`, `lobby:kick` | jugador / DM |
| Chat | `chat:send` (con susurro opcional) | todos |
| Turnos | `turn:setMode`, `turn:randomize`, `turn:setOrder`, `turn:next`, `turn:prev`, `turn:setCurrent`, `turn:add`, `turn:remove`, `turn:update`, `turn:syncPlayers` | DM |
| Fichas | `token:spawn`, `token:placeHeroes`, `token:move`, `token:drag`, `token:transfer`, `token:update`, `token:hp`, `token:status`, `token:remove`, `token:duplicate` | DM; jugador mueve la suya si tiene permiso |
| Héroes e inventario | `hero:update`, `hero:adjust`, `hero:status`, `hero:slot`, `hero:use`, `hero:mana`, `hero:rest`, `hero:regenMana`, `inventory:add/remove/update/transfer`, `loot:add/remove` | DM; jugador solo recursos propios si la campaña lo permite |
| Trueques | `trade:offer`, `trade:respond`, `trade:approve`, `trade:cancel` | jugadores (+ aprobación opcional del DM) |
| Visibilidad | `vis:setGlobal`, `vis:setPlayer`, `fog:reveal`, `fog:resetExplored`, `door:toggle`, `view:dm`, `show:open`, `show:close` | DM |
| Interacción | `ping` | todos |
| Dados/ruletas | `roll:dice`, `roll:roller`, `roll:request`, `roll:fulfill`, `roll:cancel`, `roll:dismissOffer` | DM; jugador: peticiones, ruletas de turno y dados libres si se permite |
| Audio/efectos | `audio:play`, `audio:mode`, `audio:master`, `audio:sfx`, `fx:trigger`, `fx:weather`, `fx:lighting`, `spell:cast` | DM (`spell:cast` también el dueño del héroe) |

Servidor → cliente: `users:status`, `sessions:list` (públicos), `session:state` (vista filtrada), `session:zones` (zonas filtradas), `session:event` (tirada, ping, fx, sfx, toast, sorteo de iniciativa, petición de tirada, inicio de turno, arrastre, expulsión, fin), `session:log`, `session:rollers` (DM), `auth:revoked`.

Salas: `session:<id>`, `session:<id>:dm`, `user:<userId>`. Cada sesión es independiente, por lo que varias partidas pueden correr a la vez sin interferir.

## 6. API REST

Tabla completa en `shared/src/types/api.ts`. Resumen: `/api/users`, `/api/auth/*`, `/api/uploads`, `/api/library/*` (búsqueda `POST /api/library/search`), `/api/categories`, `/api/saved-filters`, `/api/heroes`, `/api/campaigns/*`, `/api/zones/*`, `/api/rollers`, `/api/sessions/*`.

## 7. Usuarios, sesiones y reconexión

- Al elegir usuario el servidor emite un *token* (sin contraseña) que el cliente guarda en `sessionStorage` (cada pestaña puede ser un usuario distinto) y una copia en `localStorage` para restaurar en pestañas nuevas.
- Un usuario está **en uso** mientras tenga algún socket conectado o durante el periodo de gracia tras desconectarse (`USER_RELEASE_SECONDS`, 60 s por defecto). Cerrar sesión lo libera al instante.
- Al recargar, el cliente recupera su token, reclama de nuevo su usuario y vuelve a unirse a la última sesión (y a su héroe).

## 8. Decisiones ante ambigüedades

- **"Fichas de enemigos"** en los permisos se interpreta como la **hoja de estadísticas** (CA, ataques…); las fichas en el mapa siempre siguen las reglas de visión.
- **Visión "Solo explorado"** = lo visible ahora a plena luz + lo explorado atenuado; **"Solo lo que tiene delante"** = solo lo visible ahora. Los enemigos solo se envían a un jugador si están dentro de su área visible.
- **Música por zona**: en modo "zona" cada cliente reproduce la música de la zona que está viendo (crossfade al cambiar); el DM puede forzar una pista para todos (modo manual).
- Las **sub-zonas** son zonas con `parentZoneId`; las escaleras entre pisos son transiciones dentro de la misma zona hacia otro nivel.
- Los **héroes** conservan su progreso (inventario, oro, XP, nivel) entre campañas; al entrar en una campaña se adaptan sus recursos mágicos a sus reglas sin borrar nada.
- **Jugadores**: pueden lanzar dados libres públicos (configurable por campaña) y gastar su propio maná/espacios si la campaña lo permite; nunca tocan PV, oro, XP ni inventario (salvo trueques).
- **Regeneración de maná**: botón manual del DM; opcionalmente automática al inicio del turno (desactivada por defecto).
- **Seguridad**: pensada para una LAN de confianza; el filtrado de datos sensibles (notas del DM, fichas ocultas, tiradas secretas) se hace en el servidor, el enmascarado visual de la niebla en el cliente.
- **Campaña de ejemplo steampunk sin magia** (petición del usuario): «Los Cielos de Latón» usa el modo de reglas `mana`, para cumplir el criterio de una campaña con maná, pero el recurso se llama **«Vapor»** (`rules.magic.manaName`) y sus «hechizos» son **artilugios**: entradas de tipo hechizo con escuela «Artilugio» y la faceta «Tecnología». La interfaz nunca escribe «Maná» fijo: siempre muestra el nombre del recurso de la campaña.
- **Semillas versionadas**: `AppMeta.seedVersion`. La versión 2 sustituye la antigua campaña de fantasía por la steampunk en bases de datos ya existentes, sin tocar el resto del contenido.
- **Imagen Docker reducida**: la etapa final solo contiene el servidor y el cliente compilados, el esquema y las migraciones, y las dependencias de producción del servidor.
- **Modo desarrollo**: `scripts/dev.mjs` arranca la API y Vite llamando a Node directamente, porque los atajos `.cmd` de npm fallan en Windows si la ruta contiene `&`. `docker-compose.dev.yml` expone PostgreSQL en `127.0.0.1:5433`.
