import {
  METRICS, LEVELS, indexAlerts, cellMark, byShirtNumber, sessionTypeLabel, formatDate, shortName,
} from '../metrics.js';
import { InfoIcon, ClockIcon } from './icons.jsx';

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

// Un indicador del resumen: ícono, número, etiqueta y, debajo, los jugadores.
// Los de nivel (crítico / advertencia) solo toman color e ícono si hay celdas
// con ese nivel; con 0 se ven neutros, para no alarmar sin motivo.
function SummaryItem({ label, cells, level, icon }) {
  const count = cells.length;
  const activeLevel = count > 0 && level ? LEVELS[level] : null;

  return (
    <li className={activeLevel ? `summary-item level-${level}` : 'summary-item'}>
      <p className="summary-headline">
        <span className="summary-icon" aria-hidden="true">{activeLevel ? activeLevel.icon : icon}</span>
        <span className="summary-count">{count}</span>
        {label}
      </p>
      {count > 0 && <p className="summary-players">{namesWithCount(cells)}</p>}
    </li>
  );
}

// Encabezado de la sesión y bloque de resumen. Cada número cuenta celdas de la
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
    { label: 'Críticas', cells: playersOfCells((c) => c.alert?.level === 'critical'), level: 'critical' },
    { label: 'Advertencias', cells: playersOfCells((c) => c.alert?.level === 'warning'), level: 'warning' },
    { label: 'Datos faltantes', cells: playersOfCells((c) => c.missing), icon: <InfoIcon /> },
    { label: 'Pocos minutos', cells: playersOfCells((c) => c.lowMinutes), icon: <ClockIcon /> },
  ];

  return (
    <div className="session-header">
      <div>
        <p className="session-meta">
          {sessionTypeLabel(session.type)} · {formatDate(session.date)} · {session.duration_min} min
          · {players.length} jugadores
        </p>
        <h1>{session.title}</h1>
      </div>

      <section className="panel summary" aria-labelledby="summary-title">
        <h2 id="summary-title" className="section-label">Resumen de la sesión</h2>
        <ul className="summary-list">
          {summary.map((item) => <SummaryItem key={item.label} {...item} />)}
        </ul>
      </section>
    </div>
  );
}
