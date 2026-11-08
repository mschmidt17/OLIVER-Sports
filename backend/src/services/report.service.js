import db from '../db/connection.js';
import { getSessionMetrics } from './metrics.service.js';
import { buildContext } from '../domain/buildContext.js';
import { validateReport, InvalidReportError } from '../domain/validateReport.js';
import { generateJson, currentModelId } from '../ai/index.js';
import {
  buildSessionReportPrompt,
  reportSchema,
  PROMPT_VERSION,
} from '../prompts/sessionReport.v1.js';

// Caché en la tabla reports. Clave: sesión + idioma + destinatario + prompt + modelo.
// Se guarda la respuesta cruda del modelo y se valida en cada uso.
const findCachedStmt = db.prepare(`
  SELECT raw_response, created_at FROM reports
  WHERE session_id = @sessionId AND language = @language AND audience = @audience
    AND prompt_version = @promptVersion AND model = @model
`);

// REPLACE: al regenerar, la fila anterior se reemplaza en la misma operación.
const saveStmt = db.prepare(`
  INSERT OR REPLACE INTO reports
    (session_id, language, audience, prompt_version, model, raw_response, created_at)
  VALUES (@sessionId, @language, @audience, @promptVersion, @model, @rawResponse, @createdAt)
`);

// Reporte guardado, validado contra los datos ACTUALES de la sesión con el
// mismo validateReport que una respuesta nueva. Si ya no coincide (por ejemplo,
// menciona un número que cambió), se descarta y se genera otro.
function findValidCachedOutput(key, context) {
  const row = findCachedStmt.get(key);
  if (!row) return null;

  try {
    const aiOutput = validateReport(row.raw_response, context, reportSchema);
    return { aiOutput, createdAt: row.created_at, cached: true };
  } catch (error) {
    if (error instanceof InvalidReportError) return null;
    throw error;
  }
}

// Pide el reporte al modelo, lo valida y recién ahí lo guarda:
// una respuesta inválida nunca queda en caché.
async function generateAndSaveOutput(key, context) {
  const { language, audience } = key;
  const rawResponse = await generateJson(buildSessionReportPrompt(context, { language, audience }));
  const aiOutput = validateReport(rawResponse, context, reportSchema);
  const createdAt = new Date().toISOString();

  saveStmt.run({ ...key, rawResponse, createdAt });
  return { aiOutput, createdAt, cached: false };
}

/**
 * Devuelve el reporte de una sesión. Si ya hay uno guardado con los mismos
 * parámetros lo reutiliza sin llamar a la IA, salvo que refresh sea true.
 * Devuelve null si la sesión no existe (la ruta lo traduce a 404).
 *
 * La caché guarda solo la respuesta del modelo. Jugadores, métricas y alertas
 * se completan siempre desde la base, también cuando el reporte viene de la caché.
 */
export async function generateSessionReport(sessionId, { language, audience, refresh }) {
  const data = getSessionMetrics(sessionId);
  if (!data) return null;

  const context = buildContext({
    session: data.session,
    players: data.players,
    thresholds: data.thresholds,
  });

  const key = {
    sessionId,
    language,
    audience,
    promptVersion: PROMPT_VERSION,
    model: currentModelId(),
  };

  const cached = refresh ? null : findValidCachedOutput(key, context);
  const result = cached ?? (await generateAndSaveOutput(key, context));

  return {
    ...completeReport(result.aiOutput, context, data),
    // Con qué se generó (todo es parte de la clave de caché): el frontend muestra
    // el informe en este idioma aunque el usuario cambie el selector después.
    language: key.language,
    audience: key.audience,
    prompt_version: key.promptVersion,
    model: key.model,
    cached: result.cached,
    created_at: result.createdAt,
  };
}

/**
 * Completa el reporte validado con datos de la base: nombres, números de
 * camiseta y métricas. El modelo nunca los escribe, así no los puede inventar.
 */
function completeReport(report, context, data) {
  const playersById = new Map(data.players.map((p) => [p.player_id, p]));
  const contextById = new Map(context.players.map((p) => [p.player_id, p]));
  const commentsById = new Map(report.alertComments.map((a) => [a.player_id, a.comment]));

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
      items: alerts.map(({ metric, value, level, threshold }) => ({ metric, value, level, threshold })),
    };
  }

  const alertsByPlayer = Map.groupBy(context.alerts, (a) => a.player_id);

  return {
    session: data.session,
    summary: report.summary,
    highlights: report.highlights.map(toHighlight),
    alerts: [...alertsByPlayer].map(toAlert),
    missing_data: context.missing_data.map((m) => ({ ...identify(m.player_id), metric: m.metric })),
  };
}
