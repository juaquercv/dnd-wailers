# 🎲 D&D Wailers

Mesa virtual para jugar campañas de D&D simplificadas con tus amigos en la red local. Funciona como unas **diapositivas de Google Slides**: cada lámina es una zona del mapa. El DM controla todo en tiempo real, y hay dados y ruletas con animaciones, música por zona, clima, iluminación y efectos.

> **Filosofía:** es una herramienta **manual** para el DM, no un motor de reglas. Las tiradas solo muestran el resultado; el DM decide y ajusta a mano los PV, el botín, el oro y la XP con pocos clics.

---

## 📋 Requisitos

- **Docker Desktop** (Windows, macOS o Linux): <https://www.docker.com/products/docker-desktop/>. En Windows, actívalo con WSL 2 cuando el instalador lo pida.
- Unos **2 GB** libres en disco.
- Para tus amigos: solo un navegador moderno (Chrome, Edge, Firefox o Safari) en la misma red.

## ⚡ Jugar sin compilar (la forma más rápida)

No hace falta descargar el código: la imagen ya compilada se publica automáticamente en GitHub (`ghcr.io/juaquercv/dnd-wailers`), para PC y para Mac.

1. Instala y abre **Docker Desktop**.
2. Descarga el archivo [`docker-compose.imagen.yml`](https://raw.githubusercontent.com/juaquercv/dnd-wailers/main/docker-compose.imagen.yml) y guárdalo en una carpeta vacía.
3. En esa carpeta, abre una terminal y ejecuta:

   ```bash
   docker compose -f docker-compose.imagen.yml up -d
   ```

4. Abre **<http://localhost:8080>**.

Para **actualizar** a la última versión:

```bash
docker compose -f docker-compose.imagen.yml pull
```

```bash
docker compose -f docker-compose.imagen.yml up -d
```

## 🚀 Puesta en marcha desde el código

1. Abre **Docker Desktop** y espera a que diga que está en marcha.
2. Abre una terminal (PowerShell en Windows) **dentro de la carpeta del proyecto** y ejecuta:

   ```bash
   docker compose up -d --build
   ```

   La primera vez tarda unos minutos, porque descarga y compila todo. Después arranca en segundos.
3. Abre **<http://localhost:8080>** en tu navegador.

No hay más pasos: las migraciones de la base de datos y los **datos de ejemplo** se aplican solos al arrancar. Los datos se guardan en volúmenes de Docker y sobreviven a los reinicios.

Para **detener** la aplicación:

```bash
docker compose down
```

Para **actualizar** después de cambiar el código, vuelve a ejecutar `docker compose up -d --build`.

### Cambiar el puerto

Copia `.env.example` como `.env` y cambia `APP_PORT` (por ejemplo `APP_PORT=9000`). Después ejecuta otra vez `docker compose up -d`.

## 🌐 Jugar con amigos en la red local

1. Averigua la IP de tu equipo. En PowerShell escribe `ipconfig` y busca la «Dirección IPv4» de tu Wi-Fi o Ethernet, por ejemplo `192.168.1.20`.
2. Tus amigos abren **`http://192.168.1.20:8080`**, con tu IP y tu puerto.
3. Si no pueden entrar, **permite el puerto en el Firewall de Windows**. Abre PowerShell **como administrador** y ejecuta:

   ```powershell
   New-NetFirewallRule -DisplayName "D&D Wailers" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
   ```

   Comprueba también que tu red esté marcada como **privada** y no como pública.

## 🧙 Cómo se juega

1. **Elige tu usuario:** Adriel, Juan, Patrick, Javier o Campos. No hay contraseñas. Un usuario que ya está en uso aparece bloqueado con un candado. Se libera al cerrar sesión o un minuto después de desconectarse.
   - Cada pestaña del navegador puede ser un usuario distinto, lo que es útil para probar.
2. **El DM** entra en *Hostear partida*, elige una campaña y pulsa **Crear sesión**. También puede **continuar** una partida guardada.
3. **Los jugadores** entran en *Unirse a partida* y ven la lista de sesiones activas, con la campaña y el DM.
4. **En la sala de espera (lobby):**
   - Cada jugador elige uno de sus héroes, o crea uno nuevo según las reglas de la campaña, y se marca como **Listo**.
   - El DM define el **orden de turnos**: lo ordena a mano arrastrando, o lo sortea con una animación de d20 visible para todos.
   - Hay chat de texto.
   - La campaña permanece oculta hasta que el DM pulsa **Iniciar campaña**.
5. **En la partida:**
   - El DM ve todo: mueve cualquier ficha entre zonas, sub-zonas y pisos, y hace aparecer enemigos u objetos de la biblioteca.
   - Ajusta PV y estados, entrega botín, lanza dados y ruletas (públicas, para un jugador o secretas) o pide tiradas a un jugador.
   - Controla la visión de cada jugador, la música y los efectos.
   - Los jugadores ven solo lo que el DM permite, mueven su propia ficha si tienen permiso, hacen *ping* en el mapa, intercambian objetos y lanzan las tiradas que se les piden.
6. **Guardar y continuar:** *Guardar*, o *Pausar y salir*. Otro día, *Hostear partida → Partidas guardadas → Continuar*.

Si alguien recarga la página, vuelve automáticamente a su sesión y a su personaje.

## 🗺️ Contenido de ejemplo

| Campaña | Estilo | Reglas |
|---|---|---|
| **Los Cielos de Latón** (de Juan) | Steampunk con dirigibles, sin magia | El recurso «**Vapor**» se recarga como el maná, y los «hechizos» son **artilugios**: granada de vapor, bobina Tesla… |
| **Las Criptas de Valdris** (de Adriel) | Fantasía oscura | **Espacios de conjuro** por nivel |

- *Los Cielos de Latón* incluye: Ciudad de Engranajes (punto de inicio), Taller del Inventor (sub-zona), Puerto de Dirigibles, el dirigible «Albatros» con **dos pisos** (cubierta y sala de máquinas), la Fábrica Abandonada con el **Dragón de Latón** escondido, y un **mapa general** del archipiélago.
- La **biblioteca compartida** trae enemigos (dragón incluido), NPCs, objetos de todas las rarezas, hechizos y artilugios, plantillas de zona, música, ambientes y efectos de sonido, y un héroe de ejemplo para cada usuario. Todo está categorizado y etiquetado.
- Cada campaña tiene **ruletas** de ejemplo: «Eventos aleatorios», «Botín», «Clima» y otras más.

Todos los mapas, retratos, iconos, la música y los sonidos de ejemplo **se generan por código** al arrancar por primera vez: no hace falta descargar nada.

## ✍️ Cómo agregar contenido

- **Biblioteca** (*Menú → Biblioteca compartida*):
  - Crea enemigos, NPCs, objetos, hechizos, sonidos, plantillas de zona y héroes con **Nuevo…**.
  - Sube imágenes (PNG, JPG, WebP, GIF, SVG) y audio (MP3, OGG, WAV…), hasta 50 MB por archivo.
  - Gestiona **categorías** (anidables) y **etiquetas**, guarda **filtros** y marca **favoritos**.
  - La búsqueda no distingue mayúsculas ni acentos y tolera errores de escritura: «drgon» encuentra «Dragón».
- **Campañas** (*Menú → Crear / Editar campaña*):
  - **Zonas:** las láminas del panel izquierdo. Puedes reordenarlas arrastrando, duplicarlas, crear sub-zonas o guardarlas como plantilla.
  - **Lienzo:** fondo, cuadrícula cuadrada o hexagonal, dibujo, textos, marcadores, paredes que bloquean la visión, puertas, luces, niebla, transiciones (puertas, entradas, escaleras), notas privadas del DM y el punto de inicio. Arrastra enemigos u objetos desde la pestaña *Biblioteca*.
  - **Niveles / pisos:** sótano, planta baja, torre… se unen con escaleras.
  - **Mapa general y Cuadrícula de zonas:** colocas y enlazas zonas, y defines las vecinas (arriba, abajo, izquierda y derecha).
  - **Reglas:** maná (o «Vapor»), espacios de conjuro o usos limitados; atributos, inventario, moneda, descansos y creación de héroes.
  - **Ruletas y dados:** crea, edita o **importa** de otra campaña. La copia importada es independiente.
  - Todo se **guarda solo** y tiene **deshacer / rehacer**.

## ⌨️ Atajos útiles

| Dónde | Atajo | Acción |
|---|---|---|
| Partida (DM) | `Ctrl + K` | Buscador rápido: hacer aparecer enemigos, entregar objetos, reproducir sonidos |
| Partida | `Alt + clic` | Ping en el mapa |
| Partida | `F` · `P` · `R` | Encuadrar el mapa · modo ping · girar la ficha seleccionada |
| Partida (DM) | `H` · `Supr` | Ocultar/mostrar · eliminar las fichas seleccionadas |
| Iniciativa (DM) | `N` · `Mayús + N` | Turno siguiente · turno anterior |
| Editor | `V H B L R E T M W I F D N S X` | Herramientas (seleccionar, mano, pincel, línea, rectángulo, elipse, texto, marcador, pared, luz, niebla, transición, nota, inicio, borrar) |
| Editor | `Ctrl + Z` · `Ctrl + Y` · `Ctrl + S` · `Ctrl + D` | Deshacer · rehacer · guardar · duplicar |
| Dados | `Esc` | Saltar la animación |

Cada usuario regula su propio **volumen** (general, música, ambiente, efectos e interfaz) en la pestaña *Audio*. El DM tiene además un volumen maestro para todos.

## 💾 Datos y copias de seguridad

Los datos viven en dos volúmenes de Docker: `dnd-wailers_db-data` (base de datos) y `dnd-wailers_uploads` (imágenes y sonidos).

```bash
# Copia de seguridad de la base de datos
docker compose exec db pg_dump -U wailers wailers > respaldo.sql
```

```bash
# Restaurar la copia (con la app en marcha)
docker compose exec -T db psql -U wailers wailers < respaldo.sql
```

```bash
# Borrar TODO y empezar de cero (se vuelven a crear los datos de ejemplo)
docker compose down -v
```

## ☁️ Compartir y publicar

- **Código:** <https://github.com/juaquercv/dnd-wailers>. Cualquiera puede clonarlo y ejecutar `docker compose up -d --build`.
- **Imagen lista para jugar:** cada `git push` a `main` dispara la GitHub Action [`Imagen Docker`](.github/workflows/docker-image.yml). Esta compila la app para PC (amd64) y Mac (arm64) y la publica en `ghcr.io/juaquercv/dnd-wailers:latest`. Los jugadores solo necesitan [`docker-compose.imagen.yml`](docker-compose.imagen.yml) (ver «Jugar sin compilar»).
  - La primera vez, el dueño del repositorio debe hacer pública la imagen: *GitHub → tu perfil → Packages → dnd-wailers → Package settings → Change visibility → Public*.
- **Sin Internet:** también puedes llevar la imagen en un archivo.

  ```bash
  docker save -o dnd-wailers-imagenes.tar dnd-wailers-app postgres:16-alpine
  ```

  En el otro equipo, con la carpeta del proyecto:

  ```bash
  docker load -i dnd-wailers-imagenes.tar
  ```

  ```bash
  docker compose up -d --no-build
  ```

## 🛠️ Modo desarrollo (opcional)

Requiere Node.js 20 o superior.

```bash
npm install
```

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
```

```bash
npm run dev
```

La interfaz se abre en <http://localhost:5173> y la API en el puerto 3000. `npm run dev` usa `scripts/dev.mjs`, que funciona incluso si la ruta contiene `&` (por ejemplo «D&D Wailers»), a diferencia de los atajos `.cmd` de npm en Windows.

Otras órdenes: `npm run typecheck`, `npm test` y `npm run build`. La arquitectura, el modelo de datos y los eventos en tiempo real están documentados en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## 🧯 Solución de problemas

| Problema | Solución |
|---|---|
| `failed to connect to the docker API` | Docker Desktop no está abierto. Ábrelo y espera a que esté en marcha. |
| `port is already allocated` | El puerto 8080 está ocupado. Cambia `APP_PORT` en `.env`. |
| Mis amigos no pueden entrar | Usa la IP de tu equipo, no `localhost`. Abre el puerto en el firewall (ver arriba) y comprueba que estáis en la misma red y que es privada. |
| «Este usuario ya está en uso» | Esa persona sigue conectada o se desconectó hace menos de un minuto. Espera o elige otro usuario. Al cerrar sesión se libera al instante. |
| No se oye nada | Los navegadores bloquean el audio hasta el primer clic: pulsa el aviso «Pulsa para activar el sonido». Revisa también tu volumen en la pestaña *Audio*. |
| La app no arranca tras un cambio | Mira los registros con `docker compose logs app --tail 100`. |
| Quiero los datos de ejemplo otra vez | `docker compose down -v` y después `docker compose up -d`. ⚠️ Esto **borra** todo lo creado. |
