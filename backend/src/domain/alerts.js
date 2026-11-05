// Las alertas se calculan acá, en código, y nunca las decide la IA.
// Umbrales con la misma forma que el JSON:
//   { workload_au: { warning: 600, critical: 750 }, rpe: { warning: 8 }, ... }

// Devuelve 'critical', 'warning' o null. Regla: alcanzar el umbral (>=) ya alerta.
// Se mira primero critical para que un valor no genere dos alertas.
function alertLevel(value, limits) {
  if (limits.critical != null && value >= limits.critical) return 'critical';
  if (value >= limits.warning) return 'warning';
  return null;
}

/**
 * Evalúa cada métrica con umbral para cada jugador y devuelve las alertas.
 * Un valor null no se evalúa: es "sin dato", no 0. (Los datos faltantes
 * se informan aparte, en buildContext.)
 */
export function detectAlerts(players, thresholds) {
  const alerts = [];

  for (const player of players) {
    for (const [metric, limits] of Object.entries(thresholds)) {
      const value = player[metric];
      if (value == null) continue;

      const level = alertLevel(value, limits);
      if (level) {
        alerts.push({
          player_id: player.player_id,
          metric,
          value,
          level,
          threshold: limits[level],
        });
      }
    }
  }

  return alerts;
}
