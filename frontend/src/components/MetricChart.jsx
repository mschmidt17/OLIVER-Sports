import { useState } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import {
  METRICS, LEVELS, indexAlerts, cellMark, byShirtNumber, formatValue, shortName,
} from '../metrics.js';

// Colores del gráfico: azul para valores normales; los de estado
// (advertencia / crítico) se reservan para alertas, nunca para otra cosa.
// Recharts recibe los colores como props, por eso están acá y no en el CSS
// (son los mismos que --blue, --line, --line-strong y --text-secondary de index.css).
const NORMAL_COLOR = '#2378f8';
const GRID_COLOR = '#e3e6e8';
const AXIS_COLOR = '#c5ccd0';
const TEXT_SECONDARY = '#5b6870';
const HOVER_FILL = '#001c260a'; // navy de la marca, casi transparente

const TICK = { fill: TEXT_SECONDARY, fontSize: 12 };
const REFERENCE_LABEL = { fill: TEXT_SECONDARY, fontSize: 12, position: 'insideTopRight' };

function ChartTooltip({ active, payload, metric }) {
  if (!active || !payload?.length) return null;
  const bar = payload[0].payload;
  const level = LEVELS[bar.level];

  return (
    <div className="chart-tooltip">
      <strong>#{bar.shirt} {bar.name}</strong>
      <div>
        {metric.label}: {bar.value == null ? 'sin dato' : `${formatValue(bar.value)} ${metric.unit}`.trim()}
      </div>
      {level && <div>{level.icon} {level.label}</div>}
    </div>
  );
}

// Marcas del eje para una escala fija: 5 tramos iguales (10 -> 0, 2, 4, 6, 8, 10).
function fixedScaleTicks(max) {
  return [0, 1, 2, 3, 4, 5].map((step) => (max / 5) * step);
}

// Explica el hueco en el gráfico: "Mateo Suárez no tiene dato de RPE en esta
// sesión, por eso no tiene barra." No se dibuja una barra en 0 porque sería falso.
function missingDataNote(withoutData, metric) {
  const names = new Intl.ListFormat('es').format(withoutData.map((d) => d.name)); // "A y B"
  const verb = withoutData.length === 1 ? 'tiene' : 'tienen';
  return `${names} no ${verb} dato de ${metric.label} en esta sesión, por eso no ${verb} barra.`;
}

export default function MetricChart({ players, alerts, thresholds }) {
  const [metricKey, setMetricKey] = useState('total_distance_m');
  const metric = METRICS.find((m) => m.key === metricKey);
  const threshold = thresholds[metricKey];
  const alertIndex = indexAlerts(alerts);

  // El color de cada barra sale de cellMark, la misma marca que usa la tabla.
  const data = [...players]
    .sort(byShirtNumber)
    .map((p) => ({
      id: p.player_id,
      label: shortName(p.name),
      shirt: p.shirt_number,
      name: p.name,
      value: p[metricKey],
      level: cellMark(p, metricKey, alertIndex).alert?.level,
    }));
  const withoutData = data.filter((d) => d.value == null);

  // Niveles con umbral definido para esta métrica (advertencia y, a veces, crítico).
  // Se usan para las líneas del gráfico y para la leyenda: si un nivel no tiene
  // umbral, no puede haber barras de ese color y no se anuncia.
  const thresholdLevels = ['warning', 'critical'].filter((level) => threshold?.[level] != null);

  return (
    <div>
      {/* El título vive acá y no en App: así comparte fila con el selector de métrica. */}
      <div className="panel-header">
        <h2 className="section-title">Comparación por jugador</h2>
        <label className="field field-inline">
          Métrica
          <select value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Título del eje Y: qué se mide y en qué unidad. */}
      <p className="chart-axis-title">
        {metric.label}
        {metric.unit && ` (${metric.unit})`}
      </p>

      <ResponsiveContainer width="100%" height={300} debounce={200}>
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />

          <XAxis
            dataKey="label"
            interval={0}
            stroke={AXIS_COLOR}
            tick={TICK}
            tickLine={false}
          />
          {/* Formato 12.000, como la tabla. Arrow porque Recharts pasa (valor, índice)
              y el índice entraría como locale de formatValue. */}
          {/* Con escala fija (RPE 1-10) el eje termina en su máximo real, con marcas
              parejas (0, 2, 4… 10); si no, Recharts lo calcula solo. */}
          <YAxis
            domain={[0, metric.max ?? 'auto']}
            ticks={metric.max ? fixedScaleTicks(metric.max) : undefined}
            tickFormatter={(value) => formatValue(value)}
            width={56}
            stroke={AXIS_COLOR}
            tick={TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ fill: HOVER_FILL }} />

          {thresholdLevels.map((level) => {
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

          <Bar dataKey="value" maxBarSize={32} radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.id} fill={d.level ? LEVELS[d.level].color : NORMAL_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="chart-legend">
        <span><span className="swatch" style={{ background: NORMAL_COLOR }} /> Normal</span>
        {thresholdLevels.map((level) => (
          <span key={level}>
            <span className="swatch" style={{ background: LEVELS[level].color }} />
            {' '}{LEVELS[level].icon} {LEVELS[level].label}
          </span>
        ))}
        {!threshold && <span className="muted">Esta métrica no tiene umbral.</span>}
      </p>

      {withoutData.length > 0 && (
        <p className="muted">{missingDataNote(withoutData, metric)}</p>
      )}
    </div>
  );
}
