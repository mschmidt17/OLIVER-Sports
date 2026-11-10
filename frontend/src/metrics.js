// Definiciones compartidas por la tabla, el gráfico y el reporte.

// Métricas en el orden de la tabla. short: abreviatura del encabezado (nombre
// completo en el tooltip). labelEn: nombre para el reporte en inglés.
export const METRICS = [
  { key: 'minutes_played', label: 'Minutos', labelEn: 'Minutes', unit: '' },
  { key: 'total_distance_m', label: 'Distancia', labelEn: 'Distance', unit: 'm' },
  // Es una distancia (metros corridos por encima de cierto umbral de velocidad),
  // no una velocidad: la velocidad es max_speed_kmh. HSR = high-speed running.
  { key: 'high_speed_running_m', label: 'Dist. alta velocidad', labelEn: 'High-speed running', short: 'HSR', unit: 'm' },
  { key: 'sprints', label: 'Sprints', labelEn: 'Sprints', unit: '' },
  { key: 'max_speed_kmh', label: 'Vel. máx.', labelEn: 'Max speed', unit: 'km/h' },
  { key: 'accelerations', label: 'Aceleraciones', labelEn: 'Accelerations', unit: '' },
  // max: la escala tiene techo fijo (RPE va de 1 a 10); el gráfico lo usa para el eje.
  { key: 'rpe', label: 'RPE', labelEn: 'RPE', unit: '', max: 10 },
  { key: 'workload_au', label: 'Carga', labelEn: 'Workload', unit: 'AU' },
];

// Métricas por minuto: las mismas que recibe la IA para comparar jugadores con
// distintos minutos, así el entrenador puede comprobar lo que dice el reporte.
// Llegan del backend como campos del jugador, igual que las demás. No tienen
// umbral: los umbrales del equipo se aplican a los totales (thresholdNote lo
// explica en la leyenda del gráfico).
const PER_MINUTE_NOTE = 'Sin umbral: los umbrales del equipo se aplican a los totales.';

const PER_MINUTE_METRICS = [
  { key: 'distance_m_per_min', label: 'Distancia por minuto', unit: 'm/min', thresholdNote: PER_MINUTE_NOTE },
  { key: 'hsr_m_per_min', label: 'Dist. alta velocidad por minuto', unit: 'm/min', thresholdNote: PER_MINUTE_NOTE },
  { key: 'sprints_per_min', label: 'Sprints por minuto', unit: '', thresholdNote: PER_MINUTE_NOTE },
  { key: 'accelerations_per_min', label: 'Aceleraciones por minuto', unit: '', thresholdNote: PER_MINUTE_NOTE },
];

// Métricas que ofrece el selector del gráfico, en grupos (<optgroup>).
export const CHART_METRIC_GROUPS = [
  { label: 'Totales', metrics: METRICS },
  { label: 'Por minuto jugado', metrics: PER_MINUTE_METRICS },
];

// language: 'es' (por defecto, la app) o 'en' (solo el reporte en inglés).
export function metricLabel(key, language = 'es') {
  const metric = METRICS.find((candidate) => candidate.key === key);
  if (!metric) return key;
  return language === 'en' ? metric.labelEn : metric.label;
}

// Niveles de alerta: el color nunca va solo, siempre con ícono y texto.
// Colores validados por contraste y daltonismo.
export const LEVELS = {
  warning: { label: 'Advertencia', labelEn: 'Warning', icon: '▲', color: '#c98500' },
  critical: { label: 'Crítico', labelEn: 'Critical', icon: '◆', color: '#d93636' },
};

export function levelLabel(level, language = 'es') {
  return language === 'en' ? LEVELS[level].labelEn : LEVELS[level].label;
}

// Apellido (última palabra del nombre): alcanza para identificar a un jugador
// en espacios chicos, como el eje del gráfico o la fila de resumen.
export function shortName(fullName) {
  return fullName.split(' ').at(-1);
}

const SESSION_TYPES = { training: 'Entrenamiento', match: 'Partido' };

export function sessionTypeLabel(type) {
  return SESSION_TYPES[type] ?? type;
}

// Las fechas llegan como "YYYY-MM-DD". Se arman a mano para no pasar por
// new Date(), que las interpreta en UTC y puede mostrar el día anterior.
export function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

// Las alertas las calcula el backend; acá solo se indexan para buscarlas
// rápido por celda (jugador + métrica).
function alertKey(playerId, metric) {
  return `${playerId}:${metric}`;
}

export function indexAlerts(alerts) {
  return new Map(alerts.map((alert) => [alertKey(alert.player_id, alert.metric), alert]));
}

function findAlert(alertIndex, playerId, metric) {
  return alertIndex.get(alertKey(playerId, metric));
}

// Cómo se marca UNA celda de la tabla (jugador + métrica): alerta, "sin dato"
// o "pocos min." (en la celda de minutos). Es la única fuente de esas marcas:
// la tabla la usa para dibujar y el resumen de arriba para contar, así coinciden.
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

// Orden por número de camiseta: el de la tabla por defecto, que repiten el
// gráfico y la fila de resumen para que todo se lea en el mismo orden.
export function byShirtNumber(first, second) {
  return first.shirt_number - second.shirt_number;
}

// locale: el reporte en inglés usa 'en-US' (10,488); en español, 10.488.
export function formatValue(value, locale = 'es-AR') {
  return value.toLocaleString(locale);
}
