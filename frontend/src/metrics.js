// Definiciones compartidas por la tabla, el gráfico y el reporte.

// Métricas que se muestran, en orden, con su etiqueta y unidad.
// Minutos no lleva unidad: la etiqueta ya la dice.
export const METRICS = [
  { key: 'minutes_played', label: 'Minutos', unit: '' },
  { key: 'total_distance_m', label: 'Distancia', unit: 'm' },
  // Es una distancia (metros corridos por encima de cierto umbral de velocidad),
  // no una velocidad: la velocidad es max_speed_kmh.
  { key: 'high_speed_running_m', label: 'Dist. alta velocidad', unit: 'm' },
  { key: 'sprints', label: 'Sprints', unit: '' },
  { key: 'max_speed_kmh', label: 'Vel. máx.', unit: 'km/h' },
  { key: 'accelerations', label: 'Aceleraciones', unit: '' },
  // max: la escala tiene techo fijo (RPE va de 1 a 10); el gráfico lo usa para el eje.
  { key: 'rpe', label: 'RPE', unit: '', max: 10 },
  { key: 'workload_au', label: 'Carga', unit: 'AU' },
];

export function metricLabel(key) {
  return METRICS.find((m) => m.key === key)?.label ?? key;
}

// Niveles de alerta: el color nunca va solo, siempre con ícono y texto.
// Colores validados (contraste y daltonismo) contra fondo blanco; el rosa
// de la marca OLIVER no se usa acá para que no se confunda con una alerta.
export const LEVELS = {
  warning: { label: 'Advertencia', icon: '▲', color: '#c98500' },
  critical: { label: 'Crítico', icon: '◆', color: '#d93636' },
};

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

// Devuelve la alerta de esa celda, o undefined si no tiene.
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
export function byShirtNumber(a, b) {
  return a.shirt_number - b.shirt_number;
}

export function formatValue(value) {
  return value.toLocaleString('es-AR');
}
