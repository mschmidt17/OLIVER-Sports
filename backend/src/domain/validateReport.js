// Valida la respuesta del modelo contra los datos reales de la sesión.
// Es la barrera que impide que el reporte invente jugadores o números.

// La respuesta del modelo no sirve: la API responde 502 (Bad Gateway).
export class InvalidReportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidReportError';
    this.status = 502;
    this.expose = true;
  }
}

// El reporte destaca 2 o 3 jugadores (lo pide el enunciado).
const MIN_HIGHLIGHTS = 2;

function parseJson(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    throw new InvalidReportError('El modelo devolvió un JSON inválido');
  }
}

// Parsea el texto del modelo y lo valida contra el esquema Zod del prompt.
function parseWithSchema(rawText, schema) {
  const result = schema.safeParse(parseJson(rawText));
  if (!result.success) {
    throw new InvalidReportError('La respuesta del modelo no tiene el formato esperado');
  }
  return result.data;
}

// Deja solo los elementos de jugadores permitidos y, si el modelo
// repite un jugador, se queda con la primera aparición.
function keepAllowedPlayers(items, allowedIds) {
  const seen = new Set();
  return items.filter((item) => {
    if (!allowedIds.has(item.player_id) || seen.has(item.player_id)) return false;
    seen.add(item.player_id);
    return true;
  });
}

const NUMBER_PATTERN = /\d+(?:[.,]\d+)*/g;

// Un número escrito en el texto puede leerse de dos formas:
// "10.488" como decimal (10.488) o con separador de miles (10488).
// Se acepta si alguna de las dos lecturas existe en los datos.
function readingsOf(numberText) {
  return [
    Number(numberText.replace(',', '.')),
    Number(numberText.replace(/[.,]/g, '')),
  ];
}

// Junta todos los números de un valor, incluidos los que aparecen dentro
// de textos (por ejemplo, la fecha de la sesión).
function collectNumbers(value, found = new Set()) {
  if (typeof value === 'number') {
    found.add(value);
  } else if (typeof value === 'string') {
    for (const match of value.match(NUMBER_PATTERN) ?? []) found.add(Number(match));
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectNumbers(item, found);
  }
  return found;
}

// Números que un texto puede citar: los de la sesión (duración, fecha, umbrales)
// y los medidos de los jugadores indicados. El player_id no cuenta: es un
// identificador, no un dato, y el prompt prohíbe escribirlo.
function knownNumbers(context, players) {
  const found = collectNumbers([context.session, context.thresholds]);
  for (const player of players) {
    collectNumbers([player.minutes_played, player.metrics, player.per_minute], found);
  }
  return found;
}

// Lanza InvalidReportError si alguno de los textos tiene un número
// que no está en `known`. `source` nombra esos datos en el mensaje.
function assertOnlyKnownNumbers(texts, known, source = 'los datos') {
  const unknownNumbers = texts
    .flatMap((text) => text.match(NUMBER_PATTERN) ?? [])
    .filter((match) => !readingsOf(match).some((reading) => known.has(reading)));

  if (unknownNumbers.length > 0) {
    throw new InvalidReportError(
      `El reporte menciona números que no están en ${source}: ${unknownNumbers.join(', ')}`,
    );
  }
}

// Un texto sobre un jugador (motivo de destacado o comentario de alerta) solo
// puede citar números suyos o de la sesión: así no se le atribuye el dato de otro.
function assertPlayerNumbers(text, playerId, context) {
  const player = context.players.find((candidate) => candidate.player_id === playerId);
  assertOnlyKnownNumbers([text], knownNumbers(context, [player]), `los datos del jugador ${playerId}`);
}

/**
 * Valida el texto crudo del modelo contra el contexto de la sesión.
 * `schema` es el esquema Zod del prompt que generó la respuesta.
 * - JSON inválido o con formato incorrecto  -> InvalidReportError (502).
 * - Un número que no existe en los datos     -> InvalidReportError (502).
 *   En destacados y alertas, solo valen los números de ese jugador y de la sesión.
 * - player_id que no está en la sesión        -> se descarta ese elemento.
 * - Menos de 2 destacados tras el descarte    -> InvalidReportError (502).
 * - Comentario de alerta para un jugador sin alerta calculada -> se descarta.
 */
export function validateReport(rawText, context, schema) {
  const data = parseWithSchema(rawText, schema);

  const sessionPlayerIds = new Set(context.players.map((player) => player.player_id));
  const alertedPlayerIds = new Set(context.alerts.map((alert) => alert.player_id));

  const report = {
    summary: data.summary,
    highlights: keepAllowedPlayers(data.highlights, sessionPlayerIds),
    alertComments: keepAllowedPlayers(data.alerts, alertedPlayerIds),
  };

  // El esquema cuenta los destacados antes de este descarte: si el modelo
  // inventó jugadores, pueden quedar menos de los que pide el reporte.
  if (report.highlights.length < MIN_HIGHLIGHTS) {
    throw new InvalidReportError(
      `El reporte tiene menos de ${MIN_HIGHLIGHTS} destacados válidos`,
    );
  }

  // El resumen habla del equipo: puede citar cualquier dato de la sesión.
  assertOnlyKnownNumbers([report.summary], knownNumbers(context, context.players));
  for (const highlight of report.highlights) {
    assertPlayerNumbers(highlight.reason, highlight.player_id, context);
  }
  for (const alertComment of report.alertComments) {
    assertPlayerNumbers(alertComment.comment, alertComment.player_id, context);
  }
  return report;
}

/**
 * Valida el informe individual de un jugador. `context` es el de buildContext
 * con ese único jugador: un número de un compañero no está ahí y se rechaza.
 * - JSON inválido o con formato incorrecto  -> InvalidReportError (502).
 * - Un número que no existe en sus datos     -> InvalidReportError (502).
 * - Positivo sobre una métrica con alerta    -> se descarta (no es un logro).
 * - Ningún positivo válido tras el descarte  -> InvalidReportError (502).
 * - Comentario de alerta sin alertas calculadas -> se descarta (queda null).
 */
export function validatePlayerReport(rawText, context, schema) {
  const data = parseWithSchema(rawText, schema);
  const alertedMetrics = new Set(context.alerts.map((alert) => alert.metric));

  const report = {
    summary: data.summary,
    positives: data.positives.filter((positive) => !alertedMetrics.has(positive.metric)),
    improvements: data.improvements,
    alertComment: context.alerts.length > 0 ? data.alert_comment : null,
  };

  if (report.positives.length === 0) {
    throw new InvalidReportError('El informe no tiene puntos positivos válidos');
  }

  assertOnlyKnownNumbers([
    report.summary,
    ...report.positives.map((positive) => positive.text),
    ...report.improvements,
    report.alertComment ?? '',
  ], knownNumbers(context, context.players));
  return report;
}
