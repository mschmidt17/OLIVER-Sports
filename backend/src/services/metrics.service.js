import db from '../db/connection.js';
import { detectAlerts } from '../domain/alerts.js';
import { isLowMinutes } from '../domain/buildContext.js';

// Lista blanca de columnas por las que se puede ordenar.
// ORDER BY no admite parámetros (?), así que la columna se interpola en el SQL:
// solo es seguro si el valor sale de esta lista.
export const ORDERABLE_COLUMNS = [
  'name',
  'shirt_number',
  'minutes_played',
  'total_distance_m',
  'high_speed_running_m',
  'sprints',
  'max_speed_kmh',
  'accelerations',
  'rpe',
  'workload_au',
];

// Las consultas fijas se preparan una sola vez al cargar el módulo.
const listSessionsStmt = db.prepare(
  'SELECT id, date, title, type FROM sessions ORDER BY date'
);
const findSessionStmt = db.prepare(
  'SELECT id, date, title, type, duration_min FROM sessions WHERE id = ?'
);

// Los umbrales son del equipo; se llega a ellos a través de la sesión.
const sessionThresholdsStmt = db.prepare(`
  SELECT t.metric, t.warning, t.critical
  FROM thresholds t
  JOIN sessions s ON s.team_id = t.team_id
  WHERE s.id = ?
`);

export function listSessions() {
  return listSessionsStmt.all();
}

function findSession(sessionId) {
  return findSessionStmt.get(sessionId);
}

/**
 * Umbrales de la sesión con la misma forma que el JSON original,
 * que es la que usa domain/alerts.js:
 *   { workload_au: { warning: 600, critical: 750 }, rpe: { warning: 8, critical: null } }
 */
function getSessionThresholds(sessionId) {
  const thresholds = {};
  for (const row of sessionThresholdsStmt.all(sessionId)) {
    thresholds[row.metric] = { warning: row.warning, critical: row.critical };
  }
  return thresholds;
}

function buildOrderBy(orderBy, order) {
  if (!orderBy) return 'ORDER BY ps.player_id ASC';

  // La ruta ya valida order_by, pero el service no confía en quien lo llama.
  if (!ORDERABLE_COLUMNS.includes(orderBy)) {
    throw new Error(`Columna de orden no permitida: ${orderBy}`);
  }
  const direction = order === 'desc' ? 'DESC' : 'ASC';

  // NULLS LAST: un jugador sin RPE no debe aparecer primero ni último "por valor".
  // El desempate por player_id deja un orden estable.
  return `ORDER BY ${orderBy} ${direction} NULLS LAST, ps.player_id ASC`;
}

/**
 * Métricas de los jugadores de una sesión, con los umbrales del equipo,
 * las alertas ya calculadas (domain/alerts.js) y low_minutes por jugador.
 * Así el frontend solo pinta: las reglas de negocio viven en domain/.
 * Devuelve null si la sesión no existe (la ruta lo traduce a 404).
 */
export function getSessionMetrics(sessionId, { playerId, orderBy, order } = {}) {
  const session = findSession(sessionId);
  if (!session) return null;

  const playerFilter = playerId ? 'AND ps.player_id = @playerId' : '';

  const sql = `
    SELECT
      ps.player_id, p.name, p.position, p.shirt_number,
      ps.minutes_played, ps.total_distance_m, ps.high_speed_running_m,
      ps.sprints, ps.max_speed_kmh, ps.accelerations, ps.rpe, ps.workload_au
    FROM player_sessions ps
    JOIN players p ON p.id = ps.player_id
    WHERE ps.session_id = @sessionId ${playerFilter}
    ${buildOrderBy(orderBy, order)}
  `;

  const players = db
    .prepare(sql)
    .all({ sessionId, playerId })
    .map((p) => ({ ...p, low_minutes: isLowMinutes(p.minutes_played, session.duration_min) }));
  const thresholds = getSessionThresholds(sessionId);

  return { session, thresholds, players, alerts: detectAlerts(players, thresholds) };
}
