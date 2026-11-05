import { useState } from 'react';
import { METRICS, LEVELS, indexAlerts, findAlert, formatValue } from '../metrics.js';

const COLUMNS = [
  { key: 'shirt_number', label: '#' },
  { key: 'name', label: 'Jugador' },
  { key: 'position', label: 'Pos.' },
  ...METRICS,
];

const ASCENDING_FIRST = ['shirt_number', 'name', 'position'];

const SORT_DIRECTIONS = {
  asc: { ariaSort: 'ascending', arrow: '▲' },
  desc: { ariaSort: 'descending', arrow: '▼' },
};

// Los null ("sin dato") van siempre al final, en cualquier dirección.
function sortPlayers(players, { key, direction }) {
  return [...players].sort((p1, p2) => {
    const a = p1[key];
    const b = p2[key];
    if (a == null) return b == null ? 0 : 1;
    if (b == null) return -1;

    const result = typeof a === 'string' ? a.localeCompare(b, 'es') : a - b;
    return direction === 'asc' ? result : -result;
  });
}

function MetricCell({ value, alert }) {
  if (value == null) {
    return <td className="num no-data">sin dato</td>;
  }
  if (!alert) {
    return <td className="num">{formatValue(value)}</td>;
  }

  const level = LEVELS[alert.level];
  return (
    <td
      className={`num cell-${alert.level}`}
      title={`${level.label}: alcanzó el umbral de ${formatValue(alert.threshold)}`}
    >
      <span className="level-icon" aria-label={level.label}>{level.icon}</span> {formatValue(value)}
    </td>
  );
}

export default function MetricsTable({ players, alerts }) {
  const [sort, setSort] = useState({ key: 'shirt_number', direction: 'asc' });
  const alertIndex = indexAlerts(alerts);

  // Clic en otra columna: las métricas arrancan de mayor a menor (lo que más
  // interesa ver primero); el resto, ascendente. Clic en la misma: invierte.
  function handleSort(key) {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: ASCENDING_FIRST.includes(key) ? 'asc' : 'desc' };
    });
  }

  if (players.length === 0) {
    return <p className="empty">Esta sesión no tiene jugadores cargados.</p>;
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            {COLUMNS.map((column) => {
              const sortInfo = sort.key === column.key ? SORT_DIRECTIONS[sort.direction] : null;
              return (
                <th
                  key={column.key}
                  aria-sort={sortInfo?.ariaSort ?? 'none'}
                >
                  <button type="button" onClick={() => handleSort(column.key)}>
                    {column.label}
                    {column.unit && <span className="unit"> {column.unit}</span>}
                    <span className="sort-arrow">{sortInfo?.arrow}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortPlayers(players, sort).map((player) => (
            <tr key={player.player_id}>
              <td className="num">{player.shirt_number}</td>
              <td>{player.name}</td>
              <td>{player.position}</td>
              {METRICS.map((metric) => (
                <MetricCell
                  key={metric.key}
                  value={player[metric.key]}
                  alert={findAlert(alertIndex, player.player_id, metric.key)}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
