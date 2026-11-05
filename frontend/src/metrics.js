// Definiciones compartidas por la tabla, el gráfico y el reporte.

// Métricas que se muestran, en orden, con su etiqueta y unidad.
export const METRICS = [
  { key: 'minutes_played', label: 'Minutos', unit: 'min' },
  { key: 'total_distance_m', label: 'Distancia', unit: 'm' },
  { key: 'high_speed_running_m', label: 'Alta velocidad', unit: 'm' },
  { key: 'sprints', label: 'Sprints', unit: '' },
  { key: 'max_speed_kmh', label: 'Vel. máx.', unit: 'km/h' },
  { key: 'accelerations', label: 'Aceleraciones', unit: '' },
  { key: 'rpe', label: 'RPE', unit: '' },
  { key: 'workload_au', label: 'Carga', unit: 'AU' },
];

export function metricLabel(key) {
  return METRICS.find((m) => m.key === key)?.label ?? key;
}

// Niveles de alerta: el color nunca va solo, siempre con ícono y texto.
export const LEVELS = {
  warning: { label: 'Warning', icon: '▲', color: '#fab219' },
  critical: { label: 'Crítico', icon: '◆', color: '#d03b3b' },
};

// Las alertas las calcula el backend; acá solo se indexan para buscarlas
// rápido por celda (jugador + métrica).
function alertKey(playerId, metric) {
  return `${playerId}:${metric}`;
}

export function indexAlerts(alerts) {
  return new Map(alerts.map((alert) => [alertKey(alert.player_id, alert.metric), alert]));
}

// Devuelve la alerta de esa celda, o undefined si no tiene.
export function findAlert(alertIndex, playerId, metric) {
  return alertIndex.get(alertKey(playerId, metric));
}

export function formatValue(value) {
  return value.toLocaleString('es-AR');
}
