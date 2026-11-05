import { getSessionMetrics, getSessionThresholds } from './metrics.service.js';
import { buildContext } from '../domain/buildContext.js';
import { validateReport } from '../domain/validateReport.js';
import { generateJson } from '../ai/index.js';
import {
  buildSessionReportPrompt,
  reportSchema,
  PROMPT_VERSION,
} from '../prompts/sessionReport.v1.js';

/**
 * Genera el reporte de una sesión con IA.
 * `options` = { language, audience }.
 * Devuelve null si la sesión no existe (la ruta lo traduce a 404).
 *
 * Flujo: datos de la base -> contexto -> modelo -> validación -> datos de la base.
 * La IA solo aporta textos; jugadores, métricas y alertas salen siempre de la base.
 */
export async function generateSessionReport(sessionId, options) {
  const data = getSessionMetrics(sessionId);
  if (!data) return null;

  const context = buildContext({
    session: data.session,
    players: data.players,
    thresholds: getSessionThresholds(sessionId),
  });

  const rawText = await generateJson(buildSessionReportPrompt(context, options));
  const report = validateReport(rawText, context, reportSchema);

  return completeReport(report, context, data);
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
    prompt_version: PROMPT_VERSION,
    summary: report.summary,
    highlights: report.highlights.map(toHighlight),
    alerts: [...alertsByPlayer].map(toAlert),
    missing_data: context.missing_data.map((m) => ({ ...identify(m.player_id), metric: m.metric })),
  };
}
