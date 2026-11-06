import { useState } from 'react';
import { generateReport } from '../api/client.js';
import { LEVELS, metricLabel, formatValue } from '../metrics.js';

// Fecha y hora en formato de 24 h ("5/11/26, 16:40"), sin depender
// de cómo el navegador formatee por defecto.
function formatDateTime(isoDate) {
  return new Date(isoDate).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    hourCycle: 'h23',
  });
}

function PlayerName({ player }) {
  return (
    <span className="report-player">
      <strong>#{player.shirt_number} {player.name}</strong>
      <span className="position-tag">{player.position}</span>
    </span>
  );
}

function AlertItem({ item }) {
  const level = LEVELS[item.level];
  return (
    <span className={`badge badge-${item.level}`}>
      {level.icon} {metricLabel(item.metric)} {formatValue(item.value)} · {level.label}
    </span>
  );
}

// Una sección del informe: etiqueta en mayúsculas y su contenido.
function ReportSection({ title, children }) {
  return (
    <section className="report-section">
      <h3 className="section-label">{title}</h3>
      {children}
    </section>
  );
}

function ReportContent({ report, onRegenerate }) {
  // Un jugador puede tener varias métricas sin dato: se agrupan en una sola línea.
  const missingByPlayer = Map.groupBy(report.missing_data, (m) => m.player_id);

  return (
    <article className="report">
      <p className="report-summary">{report.summary}</p>

      <ReportSection title="Destacados">
        {report.highlights.length === 0 ? (
          <p className="empty">El modelo no devolvió destacados válidos.</p>
        ) : (
          <ul className="report-list">
            {report.highlights.map((h) => (
              <li key={h.player_id}>
                <PlayerName player={h} />
                {h.low_minutes && <span className="cell-note">pocos min.</span>}
                <p>{h.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <ReportSection title="Alertas">
        {report.alerts.length === 0 ? (
          <p className="empty">Ningún jugador alcanzó los umbrales en esta sesión.</p>
        ) : (
          <ul className="report-list">
            {report.alerts.map((a) => (
              <li key={a.player_id}>
                <PlayerName player={a} />
                <div className="badges">
                  {a.items.map((item) => <AlertItem key={item.metric} item={item} />)}
                </div>
                {a.comment && <p>{a.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      {missingByPlayer.size > 0 && (
        <ReportSection title="Sin dato">
          <ul className="report-list">
            {[...missingByPlayer].map(([playerId, items]) => (
              <li key={playerId}>
                <PlayerName player={items[0]} />
                <p>{items.map((m) => metricLabel(m.metric)).join(', ')}</p>
              </li>
            ))}
          </ul>
        </ReportSection>
      )}

      <footer className="report-footer">
        <span>
          {report.cached ? 'Guardado' : 'Generado'} el {formatDateTime(report.created_at)}
          {' · '}{report.model} · prompt {report.prompt_version}
        </span>
        <button type="button" className="secondary" onClick={onRegenerate}>Regenerar</button>
      </footer>
    </article>
  );
}

// El padre le pasa key={sessionId}: al cambiar de sesión el panel se
// monta de nuevo y vuelve al estado inicial, sin lógica extra.
export default function ReportPanel({ sessionId }) {
  const [language, setLanguage] = useState('es');
  const [audience, setAudience] = useState('coach');
  const [status, setStatus] = useState('idle'); // idle | loading | error | done
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  // Si ya hay un reporte guardado para estos parámetros, el backend lo
  // devuelve sin llamar a la IA. refresh = true fuerza uno nuevo.
  async function handleGenerate(refresh = false) {
    setStatus('loading');
    try {
      setReport(await generateReport(sessionId, { language, audience, refresh }));
      setStatus('done');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  return (
    <div>
      <div className="controls">
        <label className="field">
          Idioma
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="field">
          Destinatario
          <select value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="coach">Cuerpo técnico</option>
            <option value="player">Jugadores</option>
          </select>
        </label>
        <button
          type="button"
          className="primary"
          onClick={() => handleGenerate()}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? 'Generando…' : 'Generar reporte'}
        </button>
      </div>

      {status === 'idle' && (
        <p className="empty">
          Todavía no hay un reporte para esta sesión. Elegí idioma y destinatario,
          y tocá "Generar reporte".
        </p>
      )}
      {status === 'loading' && (
        <p className="loading">Generando el reporte con IA, puede tardar unos segundos…</p>
      )}
      {status === 'error' && (
        <p className="error" role="alert">No se pudo generar el reporte: {error}</p>
      )}
      {status === 'done' && (
        <ReportContent report={report} onRegenerate={() => handleGenerate(true)} />
      )}
    </div>
  );
}
