import { detectAlerts } from './alerts.js';

// Por debajo de este porcentaje de la sesión, el jugador "jugó poco".
const LOW_MINUTES_RATIO = 0.5;

// Única definición de la regla: la usan el contexto para la IA y la API de métricas.
// Sin dato de minutos no se puede afirmar que jugó poco (en JS, null < 45 es true).
export function isLowMinutes(minutesPlayed, durationMin) {
  return minutesPlayed != null && minutesPlayed < durationMin * LOW_MINUTES_RATIO;
}

const RAW_METRICS = [
  'total_distance_m',
  'high_speed_running_m',
  'sprints',
  'max_speed_kmh',
  'accelerations',
  'rpe',
  'workload_au',
];

// Métricas de volumen que se normalizan por minuto jugado, con el nombre del
// valor por minuto. Así un suplente con 28 minutos se compara de forma justa con quien jugó 90.
const PER_MINUTE_NAMES = {
  total_distance_m: 'distance_m_per_min',
  high_speed_running_m: 'hsr_m_per_min',
  sprints: 'sprints_per_min',
  accelerations: 'accelerations_per_min',
};

function round2(value) {
  return Math.round(value * 100) / 100;
}

function pick(source, keys) {
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}

// Única definición del cálculo: la usan el contexto para la IA y la API de métricas,
// así el dashboard muestra exactamente los valores en los que se apoya el reporte.
export function perMinuteMetrics(player) {
  const result = {};
  for (const [metric, name] of Object.entries(PER_MINUTE_NAMES)) {
    const value = player[metric];
    // Sin minutos o sin dato no hay cociente posible: null, nunca 0.
    result[name] = player.minutes_played > 0 && value != null
      ? round2(value / player.minutes_played)
      : null;
  }
  return result;
}

// Se lo decimos explícito al modelo para que no interprete un null como 0.
function findMissingData(players) {
  const missing = [];
  for (const player of players) {
    for (const metric of RAW_METRICS) {
      if (player[metric] == null) missing.push({ player_id: player.player_id, metric });
    }
  }
  return missing;
}

function buildPlayerContext(player, durationMin) {
  return {
    player_id: player.player_id,
    position: player.position,
    minutes_played: player.minutes_played,
    low_minutes: isLowMinutes(player.minutes_played, durationMin),
    metrics: pick(player, RAW_METRICS),
    per_minute: perMinuteMetrics(player),
  };
}

/**
 * Arma el contexto que se le envía al modelo.
 * No incluye nombres: el modelo trabaja con player_id y el backend
 * completa nombres y números después, desde la base.
 */
export function buildContext({ session, players, thresholds }) {
  return {
    session: {
      id: session.id,
      date: session.date,
      title: session.title,
      type: session.type,
      duration_min: session.duration_min,
    },
    thresholds,
    players: players.map((player) => buildPlayerContext(player, session.duration_min)),
    alerts: detectAlerts(players, thresholds),
    missing_data: findMissingData(players),
  };
}
