import db from '../db/connection.js';

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

export function listSessions() {
  return listSessionsStmt.all();
}

function findSession(sessionId) {
  return findSessionStmt.get(sessionId);
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
 * Métricas de los jugadores de una sesión.
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

  const players = db.prepare(sql).all({ sessionId, playerId });
  return { session, players };
}
