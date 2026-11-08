import { useState } from 'react';
import { METRICS, LEVELS, indexAlerts, cellMark, formatValue } from '../metrics.js';
import { ClockIcon } from './icons.jsx';

// text: columna de texto, alineada a la izquierda. El resto son números y van
// a la derecha (encabezado incluido), para comparar cifras de un vistazo.
const COLUMNS = [
  { key: 'shirt_number', label: '#' },
  { key: 'name', label: 'Jugador', text: true },
  { key: 'position', label: 'Pos.', text: true },
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
      className={level ? `num alert-cell level-${mark.alert.level}` : 'num'}
      title={level ? `${level.label}: alcanzó el umbral de ${formatValue(mark.alert.threshold)}` : undefined}
    >
      {/* Pocos minutos: el reloj del resumen, no una etiqueta de texto, para que la
          columna no se ensanche por una sola fila. El texto queda en el tooltip
          y, oculto a la vista, para el lector de pantalla. */}
      {mark.lowMinutes && (
        <span className="low-minutes" title="Pocos minutos: jugó menos de la mitad de la sesión">
          <ClockIcon />
          <span className="visually-hidden">pocos minutos</span>
        </span>
      )}
      {/* El ícono se oculta al lector de pantalla y el nivel se lee como texto. */}
      {level && (
        <>
          <span className="level-icon" aria-hidden="true">{level.icon} </span>
          <span className="visually-hidden">{level.label} </span>
        </>
      )}
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
                <th
                  key={column.key}
                  className={column.text ? undefined : 'num'}
                  aria-sort={sortInfo?.ariaSort ?? 'none'}
                >
                  <button type="button" onClick={() => handleSort(column.key)}>
                    {column.short ? <abbr title={column.label}>{column.short}</abbr> : column.label}
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
