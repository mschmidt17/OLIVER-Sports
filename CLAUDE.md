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
npm test         # Vitest: tests unitarios de src/domain/

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
  routes/    sessions.routes.js — solo reciben, validan con Zod y responden
  services/  metrics.service.js, report.service.js — acceso a la base y orquestación
  domain/    alerts.js, buildContext.js, validateReport.js — lógica pura, con tests al lado (*.test.js)
  ai/        index.js (proveedor, timeout, reintento, errores), geminiClient.js
  prompts/   sessionReport.v1.js — prompt versionado + esquema Zod de la respuesta
frontend/src
  api/client.js, metrics.js (definiciones compartidas), components/
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
- **Contexto para la IA**: sin nombres, solo `player_id`; métricas por minuto;
  `low_minutes` si jugó menos del 50% de la sesión; alertas ya calculadas.
- **Validación del reporte**: Zod + descarte de `player_id` que no están en la sesión
  + rechazo (502) si el texto menciona números que no existen en los datos.
  Nombres, métricas y alertas siempre se completan desde la base.
- **Errores de IA**: timeout con AbortController (504), un reintento ante 429/503
  (si persiste, 503), respuesta inválida (502).
- **Caché**: tabla `reports`, clave sesión + idioma + destinatario + versión del prompt
  + modelo. Guarda la respuesta cruda del modelo y la revalida en cada uso.
  `refresh: true` en el body fuerza un reporte nuevo.
- **Prompt**: si cambian las instrucciones o el formato, crear `sessionReport.v2.js`
  en lugar de editar v1.
- **Puerto**: el backend usa 4000 (el 3000 suele estar ocupado).
- **Identidad visual** (inspirada en OLIVER): Rubik; navy `#001c26` solo en el marco
  (menú lateral y barra superior); azul `#2378f8` para lo interactivo; rosa `#e04080`
  solo como acento junto a la marca en el menú, **nunca en el área de datos** (tampoco
  en el reporte); warning `#c98500` y crítico `#d93636`, siempre con ícono y texto
  (validados por contraste y daltonismo), y nunca como decoración. Sin degradados.
- **Layout**: menú lateral (marca + "Análisis de sesión"), barra superior con el
  selector de sesión, resumen en un único bloque, y debajo datos (tabla y gráfico)
  a la izquierda y reporte a la derecha desde 1400px; en una columna por debajo.

## Forma de trabajo

- Trabajar por fases. Al terminar cada una: explicar qué hace cada archivo,
  cómo probarlo, proponer un mensaje de commit, y esperar el OK.
- Commits con Conventional Commits en español (`feat:`, `fix:`, `refactor:`,
  `chore:`, `test:`, `docs:`), con alcance opcional (`feat(ui):`). El autor hace los commits.
