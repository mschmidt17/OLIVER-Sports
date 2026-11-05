import { useState } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { METRICS, LEVELS, indexAlerts, findAlert, formatValue } from '../metrics.js';

// Colores del gráfico: azul para valores normales; los de estado
// (warning / crítico) se reservan para alertas, nunca para otra cosa.
// Recharts recibe los colores como props, por eso están acá y no en el CSS
// (son los mismos que --accent, --border y --text-secondary de index.css).
const NORMAL_COLOR = '#2a78d6';
const GRID_COLOR = '#e1e0d9';
const AXIS_COLOR = '#c3c2b7';
const TEXT_SECONDARY = '#52514e';

const REFERENCE_LABEL = { fill: TEXT_SECONDARY, fontSize: 12, position: 'insideTopRight' };

function ChartTooltip({ active, payload, unit }) {
  if (!active || !payload?.length) return null;
  const bar = payload[0].payload;
  const level = LEVELS[bar.level];

  return (
    <div className="chart-tooltip">
      <strong>{bar.name}</strong>
      <div>{bar.value == null ? 'sin dato' : `${formatValue(bar.value)} ${unit}`}</div>
      {level && <div>{level.icon} {level.label}</div>}
    </div>
  );
}

export default function MetricChart({ players, alerts, thresholds }) {
  const [metricKey, setMetricKey] = useState('total_distance_m');
  const metric = METRICS.find((m) => m.key === metricKey);
  const threshold = thresholds[metricKey];
  const alertIndex = indexAlerts(alerts);

  // Mismo orden que la tabla por defecto: por número de camiseta.
  const data = [...players]
    .sort((a, b) => a.shirt_number - b.shirt_number)
    .map((p) => ({
      label: `#${p.shirt_number}`,
      name: p.name,
      value: p[metricKey],
      level: findAlert(alertIndex, p.player_id, metricKey)?.level,
    }));
  const withoutData = data.filter((d) => d.value == null);

  return (
    <div>
      <label className="field">
        Métrica
        <select value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
          {METRICS.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </label>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis dataKey="label" stroke={AXIS_COLOR} tick={{ fill: TEXT_SECONDARY }} tickLine={false} />
          <YAxis stroke={AXIS_COLOR} tick={{ fill: TEXT_SECONDARY }} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip unit={metric.unit} />} cursor={{ fill: '#00000008' }} />

          {/* Una línea por umbral definido: warning siempre, critical solo si existe. */}
          {['warning', 'critical']
            .filter((level) => threshold?.[level] != null)
            .map((level) => {
              const text = `${LEVELS[level].label} ${formatValue(threshold[level])}`;
              return (
                <ReferenceLine
                  key={level}
                  y={threshold[level]}
                  stroke={LEVELS[level].color}
                  label={{ ...REFERENCE_LABEL, value: text }}
                />
              );
            })}

          <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.level ? LEVELS[d.level].color : NORMAL_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="chart-legend">
        <span><span className="swatch" style={{ background: NORMAL_COLOR }} /> Normal</span>
        {Object.values(LEVELS).map((level) => (
          <span key={level.label}>
            <span className="swatch" style={{ background: level.color }} /> {level.icon} {level.label}
          </span>
        ))}
        {!threshold && <span className="muted">Esta métrica no tiene umbral.</span>}
      </p>

      {withoutData.length > 0 && (
        <p className="muted">
          Sin dato (no se grafica): {withoutData.map((d) => `${d.label} ${d.name}`).join(', ')}.
        </p>
      )}
    </div>
  );
}
