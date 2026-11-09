# OLIVER — Mini reporte de sesión con IA

Dashboard de análisis de rendimiento deportivo para que un cuerpo técnico pueda revisar una sesión de entrenamiento o partido: consultar métricas individuales, identificar alertas de carga y generar un reporte con IA.

El proyecto está desarrollado a partir del challenge técnico de OLIVER. La solución cubre el flujo completo: carga de datos, API, visualización y generación de reportes, con especial atención a los datos incompletos y a evitar información inventada por el modelo.

## Funcionalidades

- Selector de sesión.
- Tabla de métricas por jugador, con ordenamiento por columna.
- Gráfico de métricas seleccionables por jugador.
- Alertas visuales según los umbrales del equipo.
- Reportes con IA en español o inglés: un informe colectivo para el cuerpo técnico o un informe individual para un jugador.
- Estados de carga, error y ausencia de datos en la interfaz.
- Caché de reportes para evitar llamadas repetidas al modelo.

## Stack tecnológico

| Área | Tecnologías |
|---|---|
| Backend | Node.js, Express 5, SQLite (`better-sqlite3`), SQL directo |
| Validación | Zod |
| Frontend | React, Vite, Recharts |
| IA | Gemini 3.1 Flash-Lite (`@google/genai`) |
| Tests | Vitest |

---

## Cómo ejecutar el proyecto

### Requisitos

- Node.js 22 o superior (probado con Node 24).
- Una API key de Gemini: [Google AI Studio](https://aistudio.google.com/apikey).

La aplicación necesita dos procesos ejecutándose al mismo tiempo: el backend y el frontend, cada uno en una terminal diferente.

### 1. Clonar el repositorio

```bash
git clone https://github.com/mschmidt17/OLIVER-Sports.git
cd OLIVER-Sports
```

### 2. Instalar y ejecutar el backend

En la primera terminal:

```bash
cd backend
npm install
cp .env.example .env
```

En Windows CMD, el comando para copiar el archivo es:

```cmd
copy .env.example .env
```

Abrí `backend/.env` y configurá `GEMINI_API_KEY` con tu clave de Gemini. Después ejecutá:

```bash
npm run seed
npm run dev
```

La API queda disponible en `http://localhost:4000`.

**Importante:** el seed debe ejecutarse antes del primer arranque. Crea las tablas y carga los datos de `session_data.json`. Cada ejecución vuelve a cargar los datos desde cero y también elimina la caché de reportes. Si ya tenías una base creada con una versión anterior del proyecto, volvé a correr el seed: la tabla de caché cambió (se agregó `player_id`).

La aplicación puede utilizarse sin `GEMINI_API_KEY`: la tabla y el gráfico siguen funcionando, pero la generación del reporte devuelve un error `503` con un mensaje explicativo.

Dejá esta terminal abierta mientras uses la aplicación.

### 3. Instalar y ejecutar el frontend

En una segunda terminal, desde la raíz del proyecto:

```bash
cd frontend
npm install
npm run dev
```

Abrí la URL que muestra Vite (por defecto, `http://localhost:5173`).

El frontend realiza las llamadas a `/api/...` y Vite las redirige al backend. El proxy utiliza el puerto configurado en `PORT` dentro de `backend/.env`.

Si aparece el mensaje **“No se pudo conectar con el backend”**, verificá que el proceso del backend siga ejecutándose.

Para detener cada proceso, usá `Ctrl + C` en su terminal.

### 4. Ejecutar los tests

Desde la carpeta `backend`:

```bash
npm test
```

La suite incluye tests unitarios sobre la detección de alertas, el armado del contexto para la IA, la validación de la respuesta y el manejo de errores del proveedor (reintentos, timeout y códigos HTTP). También hay tests del servicio de reportes (los dos tipos de informe y la caché) y de la validación del body de `POST /sessions/:id/report`; usan una base SQLite temporal con el seed real, así que no tocan `data/oliver.db`. Gemini está simulado en todos los tests, por lo que no hace falta una API key.

### Variables de entorno

Configuración en `backend/.env`:

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `PORT` | `4000` | Puerto de la API. También se utiliza para configurar el proxy del frontend. |
| `DB_PATH` | `data/oliver.db` | Ubicación de SQLite, relativa a `backend/`. |
| `AI_PROVIDER` | `gemini` | Proveedor de IA. |
| `GEMINI_API_KEY` | — | API key de Gemini. No debe subirse al repositorio. |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | Modelo utilizado. |
| `AI_TIMEOUT_MS` | `20000` | Tiempo máximo de espera del modelo, en milisegundos. |

---

## API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/sessions` | Lista las sesiones (id, fecha, título y tipo). |
| `GET` | `/sessions/:id/metrics` | Devuelve las métricas de los jugadores, los umbrales y las alertas calculadas. |
| `POST` | `/sessions/:id/report` | Genera el reporte con IA o devuelve uno válido desde la caché. |

### Filtrar y ordenar métricas

```http
GET /sessions/103/metrics?player_id=5
GET /sessions/103/metrics?order_by=total_distance_m&order=desc
```

`order_by` se valida contra una lista permitida de columnas antes de construir la consulta SQL. Esto evita interpolar nombres de columna arbitrarios en `ORDER BY`, donde no se pueden utilizar parámetros SQL convencionales. Los valores `null` quedan siempre al final del ordenamiento.

### Generar un reporte

Informe colectivo para el cuerpo técnico:

```bash
curl -X POST http://localhost:4000/sessions/103/report \
  -H "Content-Type: application/json" \
  -d '{ "language": "es", "audience": "coach" }'
```

Informe individual para un jugador:

```bash
curl -X POST http://localhost:4000/sessions/103/report \
  -H "Content-Type: application/json" \
  -d '{ "language": "es", "audience": "player", "player_id": 5 }'
```

| Campo | Valores | Por defecto | Descripción |
|---|---|---|---|
| `language` | `es`, `en` | `es` | Idioma del reporte. |
| `audience` | `coach`, `player` | `coach` | `coach`: informe colectivo. `player`: informe individual (ver [Dos tipos de informe](#dos-tipos-de-informe)). |
| `player_id` | entero positivo | — | Obligatorio con `audience: "player"`; no se acepta con `coach` (400). |
| `refresh` | `true`, `false` | `false` | Con `true`, ignora la caché y genera un reporte nuevo. |

La respuesta incluye siempre `language`, `audience`, `prompt_version`, `model`, `cached` y `created_at`. El resto depende del tipo:

- **coach:** `summary`, `highlights` (2 o 3 jugadores con su motivo), `alerts` (por jugador, con sus niveles y un comentario) y `missing_data`.
- **player:** `player` (identidad, minutos y métricas desde la base), `summary`, `positives` (1 a 3, cada uno con la métrica en la que se apoya), `improvements` (0 a 2), `alerts` (las del jugador), `alert_comment` (`null` si no tiene alertas) y `missing_data`.

### Códigos de respuesta relevantes

| Código | Situación |
|---|---|
| `400` | Parámetro o body inválido (por ejemplo, `player` sin `player_id` o `coach` con `player_id`). La respuesta incluye el detalle de validación. |
| `404` | La sesión no existe, o el jugador pedido no participó en ella. |
| `502` | Respuesta del modelo inválida, contenido que no supera las validaciones o error del proveedor (por ejemplo, API key inválida). |
| `503` | No hay API key configurada, `AI_PROVIDER` tiene un valor desconocido o el proveedor continúa saturado después del reintento. |
| `504` | El modelo superó el tiempo máximo de espera. |

---

## Arquitectura

```text
Frontend (React + Vite)
        |
        | /api/...
        v
Vite proxy (desarrollo)
        |
        v
Backend (Express)
        |
        +------ SQLite
        |         |
        |         +-- sesiones, jugadores y métricas
        |         +-- caché de reportes
        |
        +------ Lógica de dominio
        |         |
        |         +-- detección de alertas
        |         +-- armado del contexto
        |         +-- validación del reporte
        |
        +------ Proveedor de IA
                  |
                  v
              Gemini
```

La lógica de negocio se mantiene separada de las rutas y de la integración con el proveedor de IA. Las rutas validan la entrada y delegan el trabajo en los servicios; las reglas de alertas y validación viven en módulos de dominio independientes.

## Estructura del proyecto

```text
backend/
├── session_data.json
└── src/
    ├── server.js
    ├── db/
    │   ├── schema.sql
    │   ├── connection.js
    │   └── seed.js
    ├── routes/
    │   └── sessions.routes.js
    ├── services/
    │   ├── metrics.service.js
    │   └── report.service.js
    ├── domain/
    │   ├── alerts.js
    │   ├── buildContext.js
    │   └── validateReport.js
    ├── ai/
    │   ├── index.js
    │   └── geminiClient.js
    └── prompts/
        ├── sessionReport.v3.js   (informe colectivo)
        └── playerReport.v1.js    (informe individual)

frontend/
├── public/
└── src/
    ├── App.jsx
    ├── metrics.js
    ├── api/
    │   └── client.js
    └── components/
        ├── Sidebar.jsx
        ├── SessionSelector.jsx
        ├── SessionHeader.jsx
        ├── MetricsTable.jsx
        ├── MetricChart.jsx
        ├── ReportPanel.jsx
        └── icons.jsx
```

---

## Integración con IA

### Dos tipos de informe

El challenge pide que el endpoint acepte `audience` (`coach` | `player`), pero no define qué debe cambiar para cada destinatario. En una primera versión, `player` solo cambiaba el tono: seguía siendo el informe de todo el equipo, con párrafos dirigidos a distintos jugadores, y mostraba al plantel las alertas de carga y esfuerzo de cada compañero.

Decidí interpretar `player` como un **informe individual**, porque eso es lo que le sirve a un jugador:

| | `coach` | `player` |
|---|---|---|
| Lector | Cuerpo técnico | Un jugador (`player_id`) |
| Datos que recibe la IA | Todos los jugadores de la sesión | Solo los del jugador elegido |
| Contenido | Resumen del equipo, 2–3 destacados, alertas con acciones sugeridas | Resumen de su sesión, 1–3 puntos positivos, 0–2 aspectos a mejorar, alertas con una recomendación prudente |
| Tono | Técnico | Segunda persona, sin jerga |
| Prompt | `sessionReport.v3.js` | `playerReport.v1.js` |

Se mantiene un único endpoint porque el challenge pide el parámetro `audience` en él; el servicio separa los dos flujos internamente. La alternativa era una ruta propia (`POST /sessions/:id/players/:playerId/report`), pero dejaba a `audience: "player"` sin un significado claro.

El informe individual no compara al jugador con sus compañeros: el modelo no recibe sus datos. Los aspectos a mejorar son opcionales porque, sin historial ni objetivos individuales, a veces no hay con qué fundamentarlos (un reporte de evolución entre sesiones sería la base para eso).

### Modelo elegido: Gemini 3.1 Flash-Lite

Elegí Gemini porque permite solicitar respuestas estructuradas mediante JSON Schema en su tier gratuito. En las pruebas, `gemini-3.1-flash-lite` ofreció una respuesta suficientemente rápida y estable para este caso.

El modelo no calcula métricas ni determina alertas: recibe información previamente procesada por el backend y se encarga de redactar el reporte. Se configuró una temperatura de `0.3` para priorizar respuestas consistentes y basadas en los datos.

El modelo se puede cambiar mediante `GEMINI_MODEL`, sin modificar el código.

### Contexto que recibe el modelo

Antes de llamar a Gemini, el backend prepara la información necesaria en `domain/buildContext.js`:

- Alertas detectadas previamente, con su nivel y umbral.
- Métricas por minuto (distancia, carrera a alta velocidad, sprints y aceleraciones), para dar contexto cuando los jugadores participaron distinta cantidad de tiempo.
- Indicador `low_minutes` para quienes jugaron menos del 50% de la sesión.
- Datos faltantes identificados explícitamente, para que un `null` no se interprete como cero.
- Identificación de jugadores mediante `player_id`, sin enviar sus nombres al modelo.

Para el informe individual se usa la misma función: las métricas se piden ya filtradas por `player_id` (`getSessionMetrics`), así que el contexto solo contiene a ese jugador, sus alertas y sus datos faltantes.

### Cómo se evita mostrar datos inventados

La integración combina salida estructurada y validaciones posteriores. La respuesta del modelo no se considera confiable solo por haber solicitado un JSON con un esquema.

1. **Estructura:** Gemini recibe un esquema JSON. La respuesta se vuelve a validar con Zod; el esquema se define una sola vez en Zod y se convierte a JSON Schema para el modelo.
2. **Jugadores:** se descartan los `player_id` que no pertenecen a la sesión y los comentarios de alerta asociados a jugadores que no tienen una alerta calculada. Si quedan menos de dos destacados, se rechaza la respuesta.
3. **Números:** cada número mencionado en los textos debe existir en los datos de la sesión. Si no existe, se rechaza la respuesta.
4. **Datos confiables:** nombres, métricas y alertas se completan desde la base de datos. La IA aporta los comentarios, pero no decide qué jugadores tienen alertas. Si el modelo omite una alerta, igualmente se incluye en el reporte.

En el informe individual, además:

- **Números:** como el contexto solo tiene los datos del jugador, un número de un compañero no existe en él y la respuesta se rechaza.
- **Positivos sobre métricas con alerta:** cada punto positivo declara la métrica en la que se apoya. Si esa métrica tiene una alerta, el positivo se descarta: una carga o una distancia por encima del umbral se trata como algo a cuidar, no como un logro. Si no queda ningún positivo válido, se rechaza la respuesta. Lo agregué después de que, en las pruebas, el modelo felicitara a un jugador por una distancia que tenía alerta: la regla estaba en el prompt, pero el prompt no alcanzaba.
- **Comentario de alerta:** si el jugador no tiene alertas calculadas, el comentario se descarta.

**Límite de esta validación:** el control de números es estricto. Por ejemplo, un porcentaje calculado correctamente pero que no exista como valor en los datos puede provocar el rechazo del reporte. Además, no se pueden verificar completamente afirmaciones cualitativas como “la mayor distancia del equipo” o “más de lo habitual”, ni que un positivo hable realmente de la métrica que declara. Por eso, los niveles de alerta que ve el usuario siempre provienen de los cálculos del backend y no del texto generado.

### Prompts versionados

Los prompts están en módulos propios dentro de `backend/src/prompts/`. Hay uno por tipo de informe, cada uno con su versión (`PROMPT_VERSION`) y su esquema de respuesta: `sessionReport.v3.js` (colectivo) y `playerReport.v1.js` (individual). En el repo quedan solo los prompts en uso; las versiones anteriores se pueden ver en el historial de git:

- **v1:** un solo prompt, con una frase de tono por destinatario. Los reportes casi no se diferenciaban.
- **v2:** instrucciones concretas por destinatario, pero `player` seguía siendo un informe colectivo.
- **v3 + playerReport.v1:** el colectivo conserva las instrucciones de v2 para el cuerpo técnico; el informe para el jugador pasa a ser individual, con su propio prompt.

Cada reporte informa qué versión de prompt y qué modelo se utilizaron. Esa información se muestra en la interfaz como tooltip sobre la fecha de generación.

### Manejo de errores

- **Timeout:** se controla con `AbortController`; devuelve `504`.
- **Reintentos:** se realiza un reintento ante errores temporales `429` (rate limit) y `503` (modelo saturado).
- **Respuesta inválida o error del proveedor:** devuelve `502`.
- **Proveedor no disponible:** si falta la API key o el proveedor continúa saturado después del reintento, devuelve `503`.

La selección del proveedor se realiza mediante `AI_PROVIDER`. El timeout, los reintentos y el mapeo de errores son compartidos; para sumar otro proveedor se necesita implementar un cliente con la misma interfaz.

---

## Decisiones de diseño y trade-offs

### Datos incompletos

- Se conservan los IDs originales del JSON.
- Los valores faltantes (`rpe` y `workload_au` en `null`) se muestran como **sin dato**, nunca como `0`.
- El seed recrea las tablas y vuelve a cargar los datos desde el JSON. Es simple y reproducible para el challenge, pero en un sistema real lo reemplazaría por migraciones.

### Alertas calculadas en el backend

Las alertas se calculan en `domain/alerts.js`; no se delegan al modelo. El backend es la única fuente para la tabla, el gráfico y el reporte, mientras que el frontend se ocupa de mostrarlas.

El enunciado habla de superar el umbral. Tomé la decisión de generar una alerta cuando el valor **alcanza o supera** el umbral (`>=`). Por ejemplo, un RPE de 8 con un umbral de 8 genera una alerta. En el contexto de carga física me pareció más prudente avisar también al alcanzar el límite. Si se quisiera cambiar el criterio, está centralizado en `domain/alerts.js`.

Cuando un valor alcanza el nivel `critical`, se muestra como crítico y no se duplica como warning.

### Caché de reportes (bonus)

La caché guarda reportes generados para evitar volver a consultar al modelo cuando se repiten los mismos parámetros.

- **Clave:** sesión + jugador + idioma + destinatario + versión del prompt + modelo.
- **Informe colectivo:** se guarda con `player_id = 0`. No uso `NULL` a propósito: en SQLite dos `NULL` no son iguales dentro de una clave, así que `INSERT OR REPLACE` no reemplazaría la fila anterior (se acumularían duplicados) y la búsqueda con `player_id = NULL` nunca la encontraría. Con `0` y la columna `NOT NULL`, cada combinación tiene una sola fila. Un test lo verifica regenerando ambos tipos de informe.
- **Contenido:** se guarda la respuesta cruda del modelo y se vuelve a validar en cada uso contra los datos actuales.
- **Seguridad de los datos:** solo se almacena una respuesta que superó las validaciones. Los nombres y las métricas se completan desde la base.
- **Regeneración:** `refresh: true` ignora la caché y genera un reporte nuevo.

Incluir la versión del prompt y el modelo en la clave evita reutilizar reportes generados con instrucciones o modelos diferentes. Si una fila guardada ya no supera la validación (por ejemplo, porque cambió el formato de la respuesta), se descarta y se genera un reporte nuevo. Cuando se utiliza la caché, la respuesta se obtiene en pocos milisegundos, frente a los segundos que puede tardar una llamada al modelo.

### Decisiones de frontend y experiencia de uso

- **Ordenamiento local:** la tabla tiene 12 filas, por lo que el ordenamiento se realiza en el navegador y evita una request por cada clic. La API igualmente soporta `order_by`, tal como pide el challenge.
- **Proxy de Vite:** se utiliza para mantener un único origen desde el navegador, sin agregar configuración de CORS.
- **Layout adaptable:** el reporte se muestra al costado de los datos solo cuando hay espacio suficiente para que la tabla entre completa; de lo contrario, se ubica debajo. La decisión se resuelve con una container query, que responde al espacio disponible y no solamente al tamaño de la ventana. El dashboard está pensado para usarse en computadora.
- **Jerarquía visual:** la tabla y las métricas son el foco principal. El reporte tiene un tratamiento visual diferenciado y los estados de alerta se identifican con color, ícono y texto.
- **Datos legibles:** los números están alineados a la derecha y las columnas de jugador y número permanecen fijas al desplazarse horizontalmente.
- **Reporte como informe:** el colectivo se organiza en resumen, destacados, alertas y datos faltantes; el individual, en jugador, resumen, puntos positivos, aspectos a mejorar (solo si los hay), alertas y datos faltantes. Al elegir el destinatario "Jugador" aparece un selector de jugador, y el botón queda deshabilitado hasta elegir uno. El formato, el idioma y "Regenerar" dependen del informe recibido, no de los selectores, que pueden haber cambiado después. Los nombres y el título de la sesión se mantienen como están en la base.

---

## Qué mejoraría con más tiempo

- Incorporar migraciones de base de datos en lugar de recrear las tablas con el seed.
- Ampliar los tests de integración al resto de los endpoints (hoy cubren la validación del body y el servicio de reportes con su caché).
- Incorporar tests del frontend para el ordenamiento, las alertas, los resúmenes y los estados del reporte.
- Evitar llamadas duplicadas al modelo cuando llegan solicitudes iguales en simultáneo.
- Implementar un reporte de evolución de un jugador a lo largo de las sesiones: le daría al informe individual una referencia propia (el jugador contra sí mismo) para fundamentar los aspectos a mejorar.
- Mejorar la representación de los valores faltantes directamente en el gráfico.
- Profundizar la validación semántica de los textos para detectar afirmaciones cualitativas que no se puedan respaldar con los datos.

No implementé streaming con SSE. El reporte se valida completo antes de mostrarse; con streaming, el usuario podría empezar a leer contenido que todavía no pasó las validaciones. Para este caso prioricé la confiabilidad de la información por encima de la velocidad percibida.

---

## Uso de herramientas de IA durante el desarrollo

Utilicé **Claude Code** como asistente durante el desarrollo.

- Definí desde el inicio el stack, la estructura del proyecto, las reglas de código y las decisiones principales.
- Dividí el trabajo en fases: configuración, API, lógica de dominio, integración con IA, frontend, caché y documentación.
- Revisé el código generado, discutí las decisiones técnicas y no incorporé cambios automáticamente: evalué si simplificaban o agregaban complejidad innecesaria.
- Ejecuté tests, probé la integración con Gemini y verifiqué el dashboard en el navegador.
- Antes de entregar, cloné el repositorio en una carpeta limpia y seguí los pasos de este README para comprobar la instalación.

El archivo `CLAUDE.md` de la raíz conserva las reglas y decisiones del proyecto para mantener el contexto de trabajo con la herramienta.

---

## Convención de commits

Se utilizó una convención basada en [Conventional Commits](https://www.conventionalcommits.org/), con descripciones en español. Por ejemplo:

```text
feat(ui): estilo compacto de tabla y gráfico
fix: corregir validación de reporte
test: agregar casos de datos incompletos
docs: actualizar README
```
