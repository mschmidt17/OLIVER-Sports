# CLAUDE.md

Instrucciones para Claude Code en este repositorio.

## Proyecto

Challenge técnico de OLIVER: mini reporte de sesión deportiva con IA.
Carga `backend/session_data.json` en SQLite, expone una API, muestra un dashboard
(tabla, gráfico, resaltado de umbrales) y genera un reporte con Gemini sin datos inventados.

El autor lo defiende en una entrevista técnica: **el código tiene que ser simple,
legible y explicable línea por línea.**

## Comandos

```bash
# Backend (desde backend/)
npm install
npm run seed     # crea/recrea backend/data/oliver.db (obligatorio antes del primer arranque)
npm run dev      # API en http://localhost:4000 (PORT en backend/.env)
npm test         # Vitest: domain/, ai/index.js, report.service y la ruta del reporte
                 # (estos dos con una base SQLite temporal y la IA simulada)

# Frontend (desde frontend/)
npm install
npm run dev      # Vite; /api se redirige al backend (vite.config.js lee PORT de backend/.env)
npm run build
```

Configuración: copiar `backend/.env.example` a `backend/.env` y completar `GEMINI_API_KEY`.
Nunca commitear `.env` ni la base (`*.db`).

## Stack (cerrado: no agregar librerías sin preguntar)

- Backend: Node.js + Express 5, JavaScript ES modules
- Base: SQLite con `better-sqlite3`, SQL directo, sin ORM
- Validación: Zod 4
- IA: Gemini con `@google/genai`, salida JSON con esquema
- Frontend: React + Vite, Recharts, tabla HTML propia
- Tests: Vitest

## Estructura

```
backend/src
  db/        schema.sql, connection.js (carga backend/.env), seed.js
  routes/    sessions.routes.js (+ .test.js) — solo reciben, validan con Zod y responden
  services/  metrics.service.js, report.service.js (+ .test.js) — acceso a la base y orquestación
  domain/    alerts.js, buildContext.js, validateReport.js — lógica pura, con tests al lado (*.test.js)
  ai/        index.js (proveedor, timeout, reintento, errores) + index.test.js, geminiClient.js
  prompts/   un prompt por tipo de informe, cada uno con su PROMPT_VERSION y esquema Zod:
             sessionReport.v3.js (colectivo, coach) y playerReport.v1.js (individual, player).
             Solo los prompts en uso: las versiones anteriores quedan en el historial de git.
frontend/src
  api/client.js, metrics.js (definiciones compartidas), components/
frontend/public
  favicon.svg, favicon-32x32.png — isotipo de OLIVER (pestaña y menú lateral)
  logo-oliver-sports-white.webp — logo oficial en blanco (menú lateral)
docs/images
  capturas del dashboard usadas en el README (no forman parte de la app)
```

La carpeta de lógica pura se llama `domain/` (no `lib/`).

## Reglas de código

1. Simple antes que ingenioso. Nada de abstracciones "por si acaso".
2. Funciones chicas, una responsabilidad, nombres descriptivos.
3. Comentarios breves en español, solo donde el "por qué" no es obvio.
4. Las rutas solo reciben y responden; la lógica va en services y domain.
5. Ante dos opciones, elegir la más fácil de explicar y mencionar la alternativa.
6. No crear archivos fuera de la estructura sin preguntar.
7. Funciones con nombre (componentes, helpers) con `function`; callbacks inline con arrow.

## Decisiones de diseño (no cambiar sin consultar)

- **Alertas**: se calculan en código (`domain/alerts.js`), nunca las decide la IA.
  Regla `>=` contra el umbral; critical tiene prioridad sobre warning.
  Un valor null no se evalúa y se informa como "sin dato", nunca como 0.
- **Tipos de informe** (un solo endpoint, `POST /sessions/:id/report`):
  `audience: "coach"` (default) es el informe colectivo (resumen del equipo, 2–3
  destacados, alertas); `audience: "player"` + `player_id` es un informe individual
  (resumen, 1–3 positivos, 0–2 mejoras, comentario de alertas) sin comparar con
  compañeros. `player_id` es obligatorio con player y se rechaza (400) con coach;
  si el jugador no participó en la sesión, 404. Es una interpretación del
  parámetro del challenge, documentada en el README.
- **Contexto para la IA**: sin nombres, solo `player_id`; métricas por minuto;
  `low_minutes` si jugó menos del 50% de la sesión; alertas ya calculadas.
  El individual usa el mismo `buildContext` con las métricas ya filtradas por jugador.
- **Validación del reporte**: Zod + descarte de `player_id` que no están en la sesión
  + rechazo (502) si el texto menciona números que no existen en los datos.
  En el individual: cada positivo declara su `metric` y se descarta si esa métrica
  tiene alerta (0 positivos válidos → 502); sin alertas, el comentario de alerta se descarta.
  Nombres, métricas y alertas siempre se completan desde la base.
- **Errores de IA**: timeout con AbortController (504), un reintento ante 429/503
  (si persiste, 503), respuesta inválida (502).
- **Caché**: tabla `reports`, clave sesión + `player_id` + idioma + destinatario
  + versión del prompt + modelo. El colectivo usa `player_id = 0`, nunca NULL (en SQLite
  dos NULL no son iguales en una clave: INSERT OR REPLACE duplicaría filas). Guarda la
  respuesta cruda del modelo y la revalida en cada uso.
  `refresh: true` en el body fuerza un reporte nuevo. Si cambia `schema.sql`, hay que
  volver a correr el seed.
- **Prompt**: si cambian las instrucciones o el formato, crear una versión nueva
  (`sessionReport.vN+1.js`, `playerReport.vN+1.js`, con su `PROMPT_VERSION`) en lugar
  de editar la vigente, y borrar la anterior: en el repo quedan solo los prompts en uso
  y el historial queda en git.
- **Puerto**: el backend usa 4000 (el 3000 suele estar ocupado).
- **Identidad visual** (inspirada en OLIVER): Rubik; navy `#001c26` solo en el marco
  (menú lateral y barra superior); azul `#2378f8` para lo interactivo; rosa `#e04080`
  hoy no se usa (si vuelve, solo en el marco y **nunca en el área de datos** ni en el
  reporte); warning `#c98500` y crítico `#d93636`, siempre con ícono y texto
  (validados por contraste y daltonismo), y nunca como decoración. Sin degradados.
  La marca en el menú es el isotipo y el logo oficiales (tomados de oliversports.ai),
  sin modificarlos: el isotipo en su azul (coincide con `#2378f8`, es la marca, no algo
  interactivo) y el logo en blanco para el fondo navy.
  Única excepción al azul: el **reporte con IA** usa el azul en tinte suave como
  identidad (fichas de íconos y de jugador, fondo del resumen). Dentro del reporte, cada
  línea de alerta lleva el fondo de su nivel, igual que las celdas de la tabla.
- **Idioma del reporte**: el informe se muestra entero en el idioma en que se generó
  (títulos, niveles, métricas, números y fechas); los controles de la app siguen en
  español. Los textos fijos están en `REPORT_TEXT` (ReportPanel.jsx); los nombres de
  métricas y niveles en inglés, en `labelEn` de `METRICS`/`LEVELS` (metrics.js), junto
  al español. El backend devuelve `language` y `audience` con el reporte: el formato
  (colectivo o individual), el idioma y "Regenerar" salen del informe recibido, no de
  los selectores. Los datos
  (título de la sesión, nombres) no se traducen: se muestran como están en la base.
- **Layout**: menú lateral (marca + "Análisis de sesión"), barra superior con el
  selector de sesión, resumen en un único bloque, y debajo datos (tabla y gráfico)
  a la izquierda y reporte a la derecha solo si la tabla entra completa a su lado
  (contenido ≥ 1320px, `@container` sobre `.content`, no `@media`); si no, en una
  columna con el reporte al final. Los datos nunca se esconden por el reporte. Menú lateral
  contraíble con una pestaña en el borde.

## Forma de trabajo

- Trabajar por fases. Al terminar cada una: explicar qué hace cada archivo,
  cómo probarlo, proponer un mensaje de commit, y esperar el OK.
- Commits con Conventional Commits en español (`feat:`, `fix:`, `refactor:`,
  `chore:`, `test:`, `docs:`), con alcance opcional (`feat(ui):`). El autor hace los commits.
