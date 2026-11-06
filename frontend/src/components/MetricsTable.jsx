import { useState } from 'react';
import { METRICS, LEVELS, indexAlerts, cellMark, formatValue } from '../metrics.js';

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

// Dibuja la celda según su marca (ver cellMark en metrics.js).
function MetricCell({ value, mark }) {
  if (mark.missing) {
    return <td className="num no-data">sin dato</td>;
  }

  const level = mark.alert && LEVELS[mark.alert.level];
  return (
    <td
      className={level ? `num cell-${mark.alert.level}` : 'num'}
      title={level ? `${level.label}: alcanzó el umbral de ${formatValue(mark.alert.threshold)}` : undefined}
    >
      {mark.lowMinutes && <span className="cell-note">pocos min.</span>}
      {level && <span className="level-icon" aria-label={level.label}>{level.icon} </span>}
      {formatValue(value)}
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
                <th key={column.key} aria-sort={sortInfo?.ariaSort ?? 'none'}>
                  <button type="button" onClick={() => handleSort(column.key)}>
                    {column.label}
                    {column.unit && <span className="unit"> ({column.unit})</span>}
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
              <td className="player-name">{player.name}</td>
              <td><span className="position-tag">{player.position}</span></td>
              {METRICS.map((metric) => (
                <MetricCell
                  key={metric.key}
                  value={player[metric.key]}
                  mark={cellMark(player, metric.key, alertIndex)}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
