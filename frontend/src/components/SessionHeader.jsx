import {
  METRICS, LEVELS, indexAlerts, cellMark, byShirtNumber, sessionTypeLabel, formatDate, shortName,
} from '../metrics.js';

// "Molina (2), Romero (2), Ríos, Álvarez, Acosta (2)": cada jugador una vez, con
// cuántas celdas tiene si son más de una. Los números suman el total de arriba.
function namesWithCount(cellPlayers) {
  const countById = new Map(); // player_id -> { player, count }
  for (const player of [...cellPlayers].sort(byShirtNumber)) {
    const entry = countById.get(player.player_id) ?? { player, count: 0 };
    entry.count += 1;
    countById.set(player.player_id, entry);
  }
  return [...countById.values()]
    .map(({ player, count }) => (count > 1 ? `${shortName(player.name)} (${count})` : shortName(player.name)))
    .join(', ');
}

// Encabezado de la sesión y fila de resumen. Cada número cuenta celdas de la
// tabla, con la misma función que usa la tabla para marcarlas (cellMark): así
// lo que dice el resumen es exactamente lo que se ve resaltado abajo.
export default function SessionHeader({ session, players, alerts }) {
  const alertIndex = indexAlerts(alerts);
  const cells = players.flatMap((player) =>
    METRICS.map((metric) => ({ player, ...cellMark(player, metric.key, alertIndex) })),
  );
  // Jugador de cada celda que cumple la condición (uno por celda).
  const playersOfCells = (condition) => cells.filter(condition).map((cell) => cell.player);

  const summary = [
    { label: 'Alertas críticas', cells: playersOfCells((c) => c.alert?.level === 'critical'), level: 'critical' },
    { label: 'Advertencias', cells: playersOfCells((c) => c.alert?.level === 'warning'), level: 'warning' },
    { label: 'Datos faltantes', cells: playersOfCells((c) => c.missing) },
    { label: 'Con pocos minutos', cells: playersOfCells((c) => c.lowMinutes) },
  ];

  return (
    <div className="session-header">
      <p className="eyebrow">
        {sessionTypeLabel(session.type)} · {formatDate(session.date)} · {session.duration_min} min
        · {players.length} jugadores
      </p>
      <h1>{session.title}</h1>

      <dl className="summary">
        {summary.map((item) => {
          const count = item.cells.length;
          // El ícono y el color de nivel solo aparecen si hay celdas con ese nivel.
          const level = count > 0 ? LEVELS[item.level] : null;
          return (
            <div key={item.label} className={level ? `summary-item summary-${item.level}` : 'summary-item'}>
              <dt>{item.label}</dt>
              <dd>
                {level && <span className="level-icon" aria-hidden="true">{level.icon} </span>}
                {count}
              </dd>
              {count > 0 && <dd className="summary-players">{namesWithCount(item.cells)}</dd>}
            </div>
          );
        })}
      </dl>
    </div>
  );
}
