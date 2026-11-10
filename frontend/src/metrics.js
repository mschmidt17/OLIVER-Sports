// Definiciones compartidas por la tabla, el gráfico y el reporte.

// Métricas en el orden de la tabla. short: abreviatura del encabezado;
// labelEn: nombre en el reporte en inglés.
export const METRICS = [
  { key: 'minutes_played', label: 'Minutos', labelEn: 'Minutes', unit: '' },
  { key: 'total_distance_m', label: 'Distancia', labelEn: 'Distance', unit: 'm' },
  // HSR (high-speed running): metros corridos a alta velocidad, no una velocidad.
  { key: 'high_speed_running_m', label: 'Dist. alta velocidad', labelEn: 'High-speed running', short: 'HSR', unit: 'm' },
  { key: 'sprints', label: 'Sprints', labelEn: 'Sprints', unit: '' },
  { key: 'max_speed_kmh', label: 'Vel. máx.', labelEn: 'Max speed', unit: 'km/h' },
  { key: 'accelerations', label: 'Aceleraciones', labelEn: 'Accelerations', unit: '' },
  // max: techo de la escala (RPE de 1 a 10), para el eje del gráfico.
  { key: 'rpe', label: 'RPE', labelEn: 'RPE', unit: '', max: 10 },
  { key: 'workload_au', label: 'Carga', labelEn: 'Workload', unit: 'AU' },
];

// Métricas por minuto: las mismas que usa la IA para comparar jugadores con
// distintos minutos, así el entrenador puede verificar el reporte. No tienen
// umbral propio (thresholdNote lo aclara en la leyenda del gráfico).
const PER_MINUTE_NOTE = 'Sin umbral: los umbrales del equipo se aplican a los totales.';

const PER_MINUTE_METRICS = [
  { key: 'distance_m_per_min', label: 'Distancia por minuto', unit: 'm/min', thresholdNote: PER_MINUTE_NOTE },
  { key: 'hsr_m_per_min', label: 'Dist. alta velocidad por minuto', unit: 'm/min', thresholdNote: PER_MINUTE_NOTE },
  { key: 'sprints_per_min', label: 'Sprints por minuto', unit: '', thresholdNote: PER_MINUTE_NOTE },
  { key: 'accelerations_per_min', label: 'Aceleraciones por minuto', unit: '', thresholdNote: PER_MINUTE_NOTE },
];

const TOTALS_GROUP = { label: 'Totales', metrics: METRICS };
const PER_MINUTE_GROUP = { label: 'Por minuto jugado', metrics: PER_MINUTE_METRICS };

// Grupos del selector del gráfico (<optgroup>). Las métricas por minuto solo se
// ofrecen si hay jugadores con distintos minutos: si todos jugaron lo mismo, el
// gráfico sería el de los totales con otra escala.
export function chartMetricGroups(players) {
  const minutesPlayed = new Set(players.map((player) => player.minutes_played));
  return minutesPlayed.size > 1 ? [TOTALS_GROUP, PER_MINUTE_GROUP] : [TOTALS_GROUP];
}

// language: 'es' (la app) o 'en' (el reporte en inglés).
export function metricLabel(key, language = 'es') {
  const metric = METRICS.find((candidate) => candidate.key === key);
  if (!metric) return key;
  return language === 'en' ? metric.labelEn : metric.label;
}

// Niveles de alerta: el color siempre va con ícono y texto (validados por contraste y daltonismo).
export const LEVELS = {
  warning: { label: 'Advertencia', labelEn: 'Warning', icon: '▲', color: '#c98500' },
  critical: { label: 'Crítico', labelEn: 'Critical', icon: '◆', color: '#d93636' },
};

export function levelLabel(level, language = 'es') {
  return language === 'en' ? LEVELS[level].labelEn : LEVELS[level].label;
}

// Apellido (última palabra): para espacios chicos, como el eje del gráfico.
export function shortName(fullName) {
  return fullName.split(' ').at(-1);
}

const SESSION_TYPES = { training: 'Entrenamiento', match: 'Partido' };

export function sessionTypeLabel(type) {
  return SESSION_TYPES[type] ?? type;
}

// "YYYY-MM-DD" -> "DD/MM/YYYY" sin new Date(), que usa UTC y puede correr un día.
export function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

// Las alertas vienen del backend; se indexan por jugador + métrica para buscarlas por celda.
function alertKey(playerId, metric) {
  return `${playerId}:${metric}`;
}

export function indexAlerts(alerts) {
  return new Map(alerts.map((alert) => [alertKey(alert.player_id, alert.metric), alert]));
}

function findAlert(alertIndex, playerId, metric) {
  return alertIndex.get(alertKey(playerId, metric));
}

// Marca de una celda (alerta, "sin dato" o "pocos min."). La usan la tabla para
// dibujar y el resumen para contar, así siempre coinciden.
export function cellMark(player, metricKey, alertIndex) {
  if (player[metricKey] == null) {
    return { missing: true, alert: null, lowMinutes: false };
  }
  return {
    missing: false,
    alert: findAlert(alertIndex, player.player_id, metricKey) ?? null,
    lowMinutes: metricKey === 'minutes_played' && player.low_minutes,
  };
}

// Orden por camiseta: el de la tabla por defecto, que repiten el gráfico y el resumen.
export function byShirtNumber(first, second) {
  return first.shirt_number - second.shirt_number;
}

// locale: 'es-AR' muestra 10.488; 'en-US', 10,488.
export function formatValue(value, locale = 'es-AR') {
  return value.toLocaleString(locale);
}
