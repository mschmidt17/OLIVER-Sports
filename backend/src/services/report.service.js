import db from '../db/connection.js';
import { getSessionMetrics } from './metrics.service.js';
import { buildContext } from '../domain/buildContext.js';
import {
  validateReport,
  validatePlayerReport,
  InvalidReportError,
} from '../domain/validateReport.js';
import { generateJson, currentModelId } from '../ai/index.js';
import {
  buildSessionReportPrompt,
  reportSchema,
  PROMPT_VERSION as TEAM_PROMPT_VERSION,
} from '../prompts/sessionReport.v3.js';
import {
  buildPlayerReportPrompt,
  playerReportSchema,
  PROMPT_VERSION as PLAYER_PROMPT_VERSION,
} from '../prompts/playerReport.v1.js';

// player_id del informe colectivo en la clave de caché (por qué 0 y no NULL: schema.sql).
const TEAM_REPORT_PLAYER_ID = 0;

// El jugador no participó en la sesión (o no existe): la API responde 404.
export class PlayerNotInSessionError extends Error {
  constructor(playerId, sessionId) {
    super(`El jugador ${playerId} no participó en la sesión ${sessionId}`);
    this.name = 'PlayerNotInSessionError';
    this.status = 404;
    this.expose = true;
  }
}

// Caché en la tabla reports (clave y motivo en schema.sql).
const findCachedStmt = db.prepare(`
  SELECT raw_response, created_at FROM reports
  WHERE session_id = @sessionId AND player_id = @playerId AND language = @language
    AND audience = @audience AND prompt_version = @promptVersion AND model = @model
`);

// REPLACE: al regenerar, la fila anterior se reemplaza en la misma operación.
const saveStmt = db.prepare(`
  INSERT OR REPLACE INTO reports
    (session_id, player_id, language, audience, prompt_version, model, raw_response, created_at)
  VALUES
    (@sessionId, @playerId, @language, @audience, @promptVersion, @model, @rawResponse, @createdAt)
`);

// Reporte guardado, validado contra los datos ACTUALES con la misma función
// que una respuesta nueva (`validate`). Si ya no coincide (por ejemplo,
// menciona un número que cambió), se descarta y se genera otro.
function findValidCachedOutput(key, validate) {
  const row = findCachedStmt.get(key);
  if (!row) return null;

  try {
    return { aiOutput: validate(row.raw_response), createdAt: row.created_at, cached: true };
  } catch (error) {
    if (error instanceof InvalidReportError) return null;
    throw error;
  }
}

// Pide el reporte al modelo, lo valida y recién ahí lo guarda:
// una respuesta inválida nunca queda en caché.
async function generateAndSaveOutput(key, prompt, validate) {
  const rawResponse = await generateJson(prompt);
  const aiOutput = validate(rawResponse);
  const createdAt = new Date().toISOString();

  saveStmt.run({ ...key, rawResponse, createdAt });
  return { aiOutput, createdAt, cached: false };
}

// Usa la caché si hay un reporte válido para la clave; si no (o con refresh), llama a la IA.
async function cachedOrGenerated(key, { prompt, validate, refresh }) {
  const cached = refresh ? null : findValidCachedOutput(key, validate);
  return cached ?? (await generateAndSaveOutput(key, prompt, validate));
}

// Con qué se generó (todo es parte de la clave de caché): el frontend muestra
// el informe en este idioma y con este formato aunque los selectores cambien después.
function generationInfo(key, result) {
  return {
    language: key.language,
    audience: key.audience,
    prompt_version: key.promptVersion,
    model: key.model,
    cached: result.cached,
    created_at: result.createdAt,
  };
}

/**
 * Devuelve el reporte de una sesión según el destinatario:
 * - coach: informe colectivo para el cuerpo técnico.
 * - player: informe individual para el jugador playerId.
 * Si ya hay uno guardado con los mismos parámetros lo reutiliza sin llamar
 * a la IA, salvo que refresh sea true.
 * Devuelve null si la sesión no existe (la ruta lo traduce a 404).
 */
export function generateSessionReport(sessionId, { language, audience, playerId, refresh }) {
  return audience === 'player'
    ? generatePlayerReport(sessionId, { language, playerId, refresh })
    : generateTeamReport(sessionId, { language, refresh });
}

/**
 * Informe colectivo. La caché guarda solo la respuesta del modelo. Jugadores,
 * métricas y alertas se completan siempre desde la base, también desde la caché.
 */
async function generateTeamReport(sessionId, { language, refresh }) {
  const data = getSessionMetrics(sessionId);
  if (!data) return null;

  const context = buildContext(data);
  const key = {
    sessionId,
    playerId: TEAM_REPORT_PLAYER_ID,
    language,
    audience: 'coach',
    promptVersion: TEAM_PROMPT_VERSION,
    model: currentModelId(),
  };

  const result = await cachedOrGenerated(key, {
    prompt: buildSessionReportPrompt(context, { language }),
    validate: (raw) => validateReport(raw, context, reportSchema),
    refresh,
  });

  return { ...completeTeamReport(result.aiOutput, context, data), ...generationInfo(key, result) };
}

/**
 * Informe individual. Las métricas se piden ya filtradas por jugador, así el
 * contexto (y por lo tanto la IA y la validación de números) solo tiene sus datos.
 * Lanza PlayerNotInSessionError si el jugador no participó en la sesión.
 */
async function generatePlayerReport(sessionId, { language, playerId, refresh }) {
  const data = getSessionMetrics(sessionId, { playerId });
  if (!data) return null;
  if (data.players.length === 0) throw new PlayerNotInSessionError(playerId, sessionId);

  const context = buildContext(data);
  const key = {
    sessionId,
    playerId,
    language,
    audience: 'player',
    promptVersion: PLAYER_PROMPT_VERSION,
    model: currentModelId(),
  };

  const result = await cachedOrGenerated(key, {
    prompt: buildPlayerReportPrompt(context, { language }),
    validate: (raw) => validatePlayerReport(raw, context, playerReportSchema),
    refresh,
  });

  return { ...completePlayerReport(result.aiOutput, context, data), ...generationInfo(key, result) };
}

// Una alerta tal como la muestra el reporte: el nivel y el valor salen del código.
function toAlertItem({ metric, value, level, threshold }) {
  return { metric, value, level, threshold };
}

/**
 * Completa el reporte validado con datos de la base: nombres, números de
 * camiseta y métricas. El modelo nunca los escribe, así no los puede inventar.
 */
function completeTeamReport(report, context, data) {
  const playersById = new Map(data.players.map((player) => [player.player_id, player]));
  const contextById = new Map(context.players.map((playerContext) => [playerContext.player_id, playerContext]));
  const commentsById = new Map(report.alertComments.map((alertComment) => [alertComment.player_id, alertComment.comment]));

  function identify(playerId) {
    const { name, shirt_number, position } = playersById.get(playerId);
    return { player_id: playerId, name, shirt_number, position };
  }

  function toHighlight({ player_id, reason }) {
    const { minutes_played, low_minutes, metrics, per_minute } = contextById.get(player_id);
    return { ...identify(player_id), reason, minutes_played, low_minutes, metrics, per_minute };
  }

  // Las alertas salen del cálculo en código, no del modelo: así no falta
  // ninguna aunque el modelo se olvide de comentarla (comment queda en null).
  function toAlert([playerId, alerts]) {
    return {
      ...identify(playerId),
      comment: commentsById.get(playerId) ?? null,
      items: alerts.map(toAlertItem),
    };
  }

  const alertsByPlayer = Map.groupBy(context.alerts, (alert) => alert.player_id);

  return {
    session: data.session,
    summary: report.summary,
    highlights: report.highlights.map(toHighlight),
    alerts: [...alertsByPlayer].map(toAlert),
    missing_data: context.missing_data.map((missing) => ({ ...identify(missing.player_id), metric: missing.metric })),
  };
}

/**
 * Completa el informe individual con los datos del jugador desde la base.
 * Las alertas y los datos faltantes salen del cálculo en código, no del modelo.
 */
function completePlayerReport(report, context, data) {
  // El jugador del contexto ya trae id, posición, minutos y métricas;
  // nombre y camiseta no se le mandan al modelo, así que salen de la base.
  const [{ name, shirt_number }] = data.players;

  return {
    session: data.session,
    player: { ...context.players[0], name, shirt_number },
    summary: report.summary,
    positives: report.positives,
    improvements: report.improvements,
    alerts: context.alerts.map(toAlertItem),
    alert_comment: report.alertComment,
    missing_data: context.missing_data.map((missing) => missing.metric),
  };
}
