import { useState } from 'react';
import {
  METRICS, LEVELS, indexAlerts, cellMark, byShirtNumber, sessionTypeLabel, formatDate, shortName,
} from '../metrics.js';
import { InfoIcon, ClockIcon } from './icons.jsx';

// Cuántos jugadores se muestran antes del "+N más".
const VISIBLE_PLAYERS = 2;

// Cada jugador una vez, con cuántas celdas tiene. Primero los más afectados
// (más celdas) y, a igualdad, por número de camiseta, como la tabla.
function playersWithCount(cellPlayers) {
  const countById = new Map(); // player_id -> { player, count }
  for (const player of cellPlayers) {
    const entry = countById.get(player.player_id) ?? { player, count: 0 };
    entry.count += 1;
    countById.set(player.player_id, entry);
  }
  return [...countById.values()]
    .sort((a, b) => b.count - a.count || byShirtNumber(a.player, b.player));
}

// "Molina (2)" si tiene más de una celda; si no, solo "Molina".
function playerLabel({ player, count }) {
  return count > 1 ? `${shortName(player.name)} (${count})` : shortName(player.name);
}

// "Molina (2), Romero (2) +3 más". Solo se recorta si quedan 2 o
// más afuera: "+1 más" ocupa casi lo mismo que el nombre que esconde.
// Ojo: "+N" cuenta jugadores; el número grande del indicador cuenta celdas.
function PlayerList({ cellPlayers }) {
  const [expanded, setExpanded] = useState(false);
  const players = playersWithCount(cellPlayers);
  const hiddenCount = players.length - VISIBLE_PLAYERS;
  const canCollapse = hiddenCount >= 2;
  const visible = canCollapse && !expanded ? players.slice(0, VISIBLE_PLAYERS) : players;

  return (
    <p className="summary-players">
      {visible.map(playerLabel).join(', ')}
      {canCollapse && (
        <button
          type="button"
          className="link-button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'ver menos' : `+${hiddenCount} más`}
        </button>
      )}
    </p>
  );
}

// Un indicador del resumen: ícono, número, etiqueta y, debajo, los jugadores.
// Los de nivel (crítico / advertencia) solo toman color si hay celdas con ese
// nivel; con 0 se ven en gris, para no alarmar sin motivo.
function SummaryItem({ label, cells, level, icon }) {
  const count = cells.length;
  const isActive = count > 0 && level;

  return (
    <li className={isActive ? `summary-item level-${level}` : 'summary-item'}>
      <span className="summary-icon" aria-hidden="true">{icon}</span>
      <span className="summary-count">{count}</span>
      <span className="summary-label">{label}</span>
      {count > 0 && <PlayerList cellPlayers={cells} />}
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
    {
      label: 'Críticas',
      cells: playersOfCells((c) => c.alert?.level === 'critical'),
      level: 'critical',
      icon: LEVELS.critical.icon,
    },
    {
      label: 'Advertencias',
      cells: playersOfCells((c) => c.alert?.level === 'warning'),
      level: 'warning',
      icon: LEVELS.warning.icon,
    },
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
        <h2>{session.title}</h2>
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
