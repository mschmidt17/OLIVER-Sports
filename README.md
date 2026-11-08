# ⚽ OLIVER — Mini reporte de sesión con IA

Dashboard para que un cuerpo técnico revise una sesión (entrenamiento o partido):
métricas por jugador en una tabla y un gráfico, resaltado de los valores que
alcanzan los umbrales del equipo, y un reporte escrito por IA que resume la
sesión, destaca jugadores y alerta sobre cargas altas **sin inventar datos**.

- **Backend:** Node.js + Express 5, SQLite (`better-sqlite3`, SQL directo), Zod, Gemini (`@google/genai`), Vitest
- **Frontend:** React + Vite, Recharts, tabla HTML propia

---

## Cómo correrlo

**Requisitos:** Node.js 22 o superior (probado con Node 24) y una API key gratuita
de Gemini ([Google AI Studio](https://aistudio.google.com/apikey)).

> **La app necesita dos procesos corriendo al mismo tiempo, en dos terminales:**
> el backend (paso 1) y el frontend (paso 2). Si solo se levanta el frontend, la
> página carga pero no muestra datos.

### 1. Backend (terminal 1)

```bash
cd backend
npm install
cp .env.example .env     # completar GEMINI_API_KEY
npm run seed             # crea backend/data/oliver.db con los datos de session_data.json
npm run dev              # API en http://localhost:4000
```

- El seed es **obligatorio antes del primer arranque**: crea las tablas y carga los datos.
  Se puede correr las veces que haga falta, porque borra y vuelve a cargar todo
  (incluida la caché de reportes).
- Sin `GEMINI_API_KEY` la app funciona igual (tabla y gráfico); solo el reporte
  responde 503 con un mensaje claro.

Dejar esta terminal abierta: el backend tiene que seguir corriendo.

### 2. Frontend (terminal 2)

Con el backend ya corriendo, en **otra** terminal:

```bash
cd frontend
npm install
npm run dev              # abrir la URL que muestra Vite (por defecto http://localhost:5173)
```

El frontend llama a `/api/...` y Vite lo redirige al backend. El puerto lo toma
de `PORT` en `backend/.env`, así que no hay que configurar nada más.

> El reporte con IA se muestra al costado de los datos si hay espacio; en pantallas
> chicas (o con mucho zoom o escalado) va debajo. Contraer el menú lateral con la
> pestaña de su borde libera espacio y puede llevarlo al costado.

Para apagar cada uno, `Ctrl + C` en su terminal.

### 3. Tests

```bash
cd backend
npm test
```

30 tests unitarios sobre la detección de alertas, el armado del contexto para la IA
y la validación de la respuesta del modelo.

### Variables de entorno (`backend/.env`)

| Variable | Default | Para qué |
|---|---|---|
| `PORT` | `4000` | Puerto de la API (el frontend lo lee para el proxy) |
| `DB_PATH` | `data/oliver.db` | Archivo SQLite, relativo a `backend/` |
| `AI_PROVIDER` | `gemini` | Proveedor de IA |
| `GEMINI_API_KEY` | — | API key de Gemini (nunca se sube al repo) |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | Modelo |
| `AI_TIMEOUT_MS` | `20000` | Tiempo máximo de espera del modelo |

> Si el frontend muestra "No se pudo conectar con el backend", falta levantar el
> backend (paso 1) o se cerró su terminal.

---

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/sessions` | Lista de sesiones: id, fecha, título y tipo |
| GET | `/sessions/:id/metrics` | Métricas de los jugadores, más umbrales y alertas ya calculadas |
| POST | `/sessions/:id/report` | Reporte con IA (usa la caché si ya existe) |

**Filtro y orden de métricas:**

```
GET /sessions/103/metrics?player_id=5
GET /sessions/103/metrics?order_by=total_distance_m&order=desc
```

`order_by` se valida contra una lista blanca de columnas (es lo que evita SQL injection,
porque `ORDER BY` no admite parámetros). Los valores `null` van siempre al final.

**Reporte:**

```bash
curl -X POST http://localhost:4000/sessions/103/report \
  -H "Content-Type: application/json" \
  -d '{ "language": "es", "audience": "coach" }'
```

| Campo del body | Valores | Default |
|---|---|---|
| `language` | `es`, `en` | `es` |
| `audience` | `coach`, `player` | `coach` |
| `refresh` | `true` ignora la caché y genera uno nuevo | `false` |

**Errores:**

| Código | Cuándo |
|---|---|
| 400 | Parámetro o body inválido (mensaje con el detalle) |
| 404 | La sesión no existe |
| 502 | El modelo devolvió una respuesta inválida o con datos inventados |
| 503 | Proveedor de IA saturado (después de reintentar) o sin API key |
| 504 | El modelo no respondió a tiempo |

---

## Estructura de proyecto

```
backend/
├── session_data.json            datos del challenge (fuente del seed)
└── src/
    ├── server.js                app Express y manejo de errores
    ├── db/
    │   ├── schema.sql           tablas
    │   ├── connection.js        conexión a SQLite (carga backend/.env)
    │   └── seed.js              carga session_data.json en la base
    ├── routes/
    │   └── sessions.routes.js   valida con Zod y responde, sin lógica
    ├── services/                acceso a la base y orquestación
    │   ├── metrics.service.js
    │   └── report.service.js
    ├── domain/                  lógica pura, con sus tests (*.test.js)
    │   ├── alerts.js
    │   ├── buildContext.js
    │   └── validateReport.js
    ├── ai/
    │   ├── index.js             proveedor, timeout, reintento y errores
    │   └── geminiClient.js      llamada a Gemini
    └── prompts/
        └── sessionReport.v1.js  prompt versionado + esquema de la respuesta

frontend/public/                 isotipo y logo oficiales de OLIVER (favicon y menú lateral)
frontend/src/
├── App.jsx                      página principal
├── metrics.js                   métricas, niveles de alerta y helpers compartidos
├── api/
│   └── client.js                llamadas al backend
└── components/
    ├── Sidebar.jsx              menú lateral: marca y sección activa
    ├── SessionSelector.jsx      selector de sesión (barra superior)
    ├── SessionHeader.jsx        encabezado de la sesión y bloque de resumen
    ├── MetricsTable.jsx
    ├── MetricChart.jsx
    ├── ReportPanel.jsx          controles y reporte con IA como informe
    └── icons.jsx                íconos SVG propios, sin librería
```

---

## Modelo de IA: Gemini 3.1 Flash-Lite

Elegí **Gemini** porque su tier gratuito admite **salida estructurada con JSON Schema**,
que es la base de la estrategia contra datos inventados. Dentro de Gemini usé
**`gemini-3.1-flash-lite`**:

- **Disponibilidad:** al probar con una API key nueva, `gemini-2.5-flash` ya no estaba habilitado
  para usuarios nuevos, y los Flash más recientes (`3.5`, `3.8`) respondían "high demand"
  o tardaban más de 20 s. Flash-Lite respondió de forma estable.
- **Velocidad:** cada reporte tarda entre 2 y 8 s.
- **Suficiente para la tarea:** el modelo no calcula nada, solo redacta a partir de datos
  ya procesados. No hace falta un modelo grande.
- **Temperatura 0.3:** se busca un reporte fiel a los datos, no creativo.

Se puede cambiar con `GEMINI_MODEL` sin tocar código. El modelo forma parte de la
clave de la caché, así que un cambio de modelo no sirve reportes del anterior.

---

## Decisiones de diseño y trade-offs

### Datos

- Se respetan los IDs originales del JSON.
- Un dato faltante (`rpe` y `workload_au` en `NULL`) es "sin dato" en toda la app, **nunca 0**.
- **Trade-off:** el seed borra y recrea las tablas. Es simple y reproducible, pero en
  un sistema real harían falta migraciones.

### Alertas: se calculan en código, nunca las decide la IA

- **Regla `>=`:** el enunciado dice "superar el umbral", pero tomé que **alcanzarlo**
  ya genera alerta (por ejemplo, RPE 8 con umbral 8). En el contexto de carga física
  me pareció más prudente avisar de más que de menos. Cambiarlo es una línea en
  `domain/alerts.js`.
- Si un valor alcanza `critical`, la alerta es crítica y no se duplica como warning.
- **Una sola fuente:** las calcula el backend (`domain/alerts.js`) y las usan la tabla,
  el gráfico y el reporte. El frontend solo las pinta.

### Contexto para la IA (`domain/buildContext.js`)

Lo que se calcula en código antes de llamar al modelo:

- **Alertas** ya detectadas, con nivel y umbral.
- **Métricas por minuto** (distancia, alta velocidad, sprints, aceleraciones), para que
  un suplente con 28 minutos se compare de forma justa con quien jugó 90.
- **`low_minutes`**: jugó menos del 50% de la sesión.
- **Datos faltantes** listados explícitamente, para que el modelo no interprete un null como 0.
- **Sin nombres:** el modelo solo ve `player_id`.

### Nada de datos inventados

El modelo devuelve JSON con un esquema fijo (`summary`, `highlights` y `alerts`, solo
con `player_id` y textos), y el backend aplica estas barreras:

1. **Esquema:** se pide salida JSON con el esquema y se vuelve a validar con Zod,
   porque el pedido no es una garantía. El esquema se define una sola vez, en Zod,
   y se convierte a JSON Schema para el modelo.
2. **Jugadores:** se descartan los `player_id` que no están en la sesión, y los
   comentarios de alerta para jugadores sin alerta calculada.
3. **Números:** cada número que aparece en los textos tiene que existir en los datos
   de la sesión. Si no existe, la respuesta se rechaza (502).
4. **Nombres, métricas y alertas** se completan desde la base. Las alertas del reporte
   salen del cálculo en código; el modelo solo aporta el comentario. Si se olvida de
   comentar una, igual aparece.

**Trade-offs:**

- El control de números es estricto: si el modelo calcula un porcentaje correcto pero
  que no está en los datos, el reporte se rechaza. El prompt le pide no hacer cálculos,
  así que en las pruebas no pasó.
- No se pueden validar **afirmaciones cualitativas** ("la mayor distancia del equipo")
  ni el tono. Por eso los niveles de alerta que ve el usuario salen de los datos, no del texto.

### Manejo de errores de la IA

- **Timeout** con `AbortController` (504).
- **Un reintento** ante errores temporales: 429 (rate limit) y 503 (modelo saturado).
  El 503 lo agregué al probar en vivo, porque Gemini lo devolvía seguido. Si persiste, 503.
- **Respuesta inválida o con datos inventados:** 502.
- El proveedor se elige con `AI_PROVIDER`. Sumar otro solo requiere un cliente con la
  misma forma; el timeout, el reintento y el mapeo de errores son comunes.

### Prompt versionado

`prompts/sessionReport.v1.js` contiene las instrucciones, las variantes por idioma y
por destinatario, y el esquema de respuesta. Si cambia, se crea `v2` en vez de editar
`v1`, y cada reporte informa con qué versión y modelo se generó (en la interfaz, como
tooltip sobre la fecha: al cuerpo técnico no le aporta y se mantiene a mano para revisar).

### Caché de reportes (bonus)

- **Clave:** sesión + idioma + destinatario + **versión del prompt** + **modelo**. Si
  cambia el prompt o el modelo, no se sirven reportes viejos.
- **Qué se guarda:** solo la respuesta cruda del modelo, y **se revalida en cada uso**
  contra los datos actuales con el mismo `validateReport`. Si ya no coincide, se
  descarta y se genera otra. Nombres y métricas siempre salen de la base.
- **Errores:** solo se guarda una respuesta que pasó la validación.
- `refresh: true` (botón "Regenerar") fuerza un reporte nuevo.
- **Resultado:** un reporte repetido responde en unos 5 ms, contra 2 a 8 s del modelo.

### Otras

- **Orden de la tabla en el navegador:** son 12 filas y así no hay una request por clic.
  El backend igual soporta `order_by` porque lo pide la API.
- **Proxy de Vite en vez de CORS:** el navegador ve un solo origen y no hace falta otra librería.
- **Identidad visual inspirada en OLIVER:** tipografía Rubik y la paleta de su sitio
  (navy y azul), pero con colores planos: un sitio de marketing busca impacto y una
  herramienta de trabajo busca legibilidad. El navy queda en el marco (menú lateral y barra
  superior) y los datos van sobre fondo claro; la marca es el isotipo y el logo oficiales,
  sin modificar. El color se reserva para el significado: el azul solo para lo interactivo
  (el rosa de la marca no se usa, para que no se confunda con una alerta) y los colores de
  alerta, validados por contraste y daltonismo,
  van siempre con ícono y texto y nunca como decoración. Única excepción al azul: el
  reporte con IA usa el azul de marca en tinte suave como identidad (fichas y resumen),
  para distinguir a simple vista lo que generó la IA del resto de los datos.
- **Layout de dashboard:** menú lateral con la marca y la sección activa, barra superior
  con el selector de sesión, el resumen en un único bloque y, debajo, datos (tabla y
  gráfico) a la izquierda y reporte a la derecha. El menú lateral se contrae con una
  pestaña en su borde y deja solo los íconos (con tooltip).
- **El layout depende del espacio del contenido, no de la ventana:** el reporte va al
  costado solo si la tabla entra completa a su lado (área de contenido de 1320px o más:
  unos 910px de tabla y 380px de reporte); si no, va debajo de los datos. La regla es que
  los datos nunca se esconden para hacerle lugar al reporte: para un preparador físico la
  tabla es la herramienta principal y el reporte se consulta a pedido. Se resuelve con una
  *container query* (`@container`) en lugar de una *media query*: responde igual al tamaño
  de pantalla, al zoom, al escalado de Windows y a contraer el menú. En una notebook el
  reporte va debajo; en un monitor de 1920px, al costado. Por debajo de 900px de ventana
  el menú se vuelve una franja arriba.
- **Reporte como informe:** encabezado con la sesión, resumen destacado y secciones
  (Destacados, Alertas, Sin dato). Las alertas de cada jugador se agrupan por nivel
  ("◆ Crítico: Carga 810" / "▲ Advertencia: Distancia 10.488 · RPE 9"), así cada nivel se
  nombra una sola vez con su ícono, color y texto, y cada línea lleva el fondo de su nivel
  como en la tabla. El informe se muestra entero en el idioma en que se generó: en inglés
  cambian títulos, niveles, métricas, números (10,488) y fechas (Sep 19, 2026); el título
  de la sesión queda como está en la base.
- **Tabla compacta con números a la derecha:** cifras de distinto largo (3.900 y 10.488)
  quedan encolumnadas y se comparan de un vistazo; el número y el nombre quedan fijos al
  desplazarse de costado.
- **Puerto 4000:** el 3000 suele estar ocupado por otras apps de desarrollo.
- **Tests unitarios solo de `domain/`:** es donde están las reglas de negocio. Los
  endpoints los probé manualmente y con scripts.

---

## Qué mejoraría con más tiempo

- **Migraciones** en lugar de recrear la base con el seed.
- **Tests de integración** de los endpoints (por ejemplo, con supertest) y del flujo de caché.
- **Evitar llamadas duplicadas al modelo** si llegan dos pedidos iguales al mismo tiempo.
- **Streaming con SSE** para mostrar el reporte a medida que se genera.
- **Reporte de evolución** de un jugador a lo largo de las sesiones.
- **Marcar "sin dato" dentro del gráfico,** en el lugar vacío del jugador. Hoy se explica en
  una nota debajo del gráfico; marcarlo en el lugar requiere dibujar un elemento SVG propio,
  porque Recharts no dibuja nada para un valor `null`.
- **Validación más fina de los textos:** detectar afirmaciones como "la mayor distancia" y
  verificarlas contra los datos.

---

## Cómo usé herramientas de IA para programar

Usé **Claude Code** (Claude) como asistente durante todo el desarrollo:

- **Reglas desde el inicio:** arranqué con un prompt que fijaba el stack cerrado, la
  estructura de carpetas, reglas de código (simple antes que ingenioso, funciones chicas,
  sin abstracciones "por si acaso") y las decisiones de diseño principales (regla `>=`,
  null como "sin dato", la IA solo redacta).
- **Trabajo por fases:** setup, API, lógica previa a la IA, integración con IA, frontend,
  caché y README. Al final de cada fase revisaba qué hacía cada archivo, lo probaba,
  pedía cambios y hacía el commit yo.
- **Decisiones discutidas, no aceptadas sin más:** por ejemplo, el nombre de la carpeta
  `domain/`, dónde va el `.env`, dónde se calculan las alertas y la clave de la caché.
- **Revisiones de calidad:** después de cada fase corrí revisiones automáticas (reutilización,
  simplificación, eficiencia y "altura" de cada solución). Aplicamos lo que simplificaba y
  descartamos, con motivo, lo que agregaba complejidad.
- **Pruebas reales:** además de los tests, se probó contra Gemini real y el dashboard en el
  navegador. Ahí aparecieron problemas que no se veían en el código: el modelo deprecado,
  el 503 por saturación, el puerto 3000 ocupado y un error en el prompt (confundía partido
  con entrenamiento). Antes de entregar, cloné el repo en una carpeta limpia y seguí este
  README: así apareció que `npm install` intentaba compilar `better-sqlite3`, y se resolvió
  con `backend/.npmrc`.
- **`CLAUDE.md`** en la raíz guarda las reglas y decisiones del proyecto para las próximas
  sesiones con la herramienta.

---

## Convención de commits

[Conventional Commits](https://www.conventionalcommits.org/) en español: `tipo: descripción`,
o `tipo(alcance): descripción` cuando ayuda a ubicar el cambio (por ejemplo,
`feat(ui): estilo compacto de tabla y gráfico`).

| Tipo | Uso |
|---|---|
| `feat` | Funcionalidad nueva |
| `fix` | Corrección de un bug |
| `refactor` | Cambio interno sin cambiar el comportamiento |
| `test` | Tests |
| `docs` | Documentación |
| `chore` | Configuración, dependencias, setup |
