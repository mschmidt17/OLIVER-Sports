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
  return <strong>#{player.shirt_number} {player.name}</strong>;
}

function AlertItem({ item }) {
  const level = LEVELS[item.level];
  return (
    <span className={`badge badge-${item.level}`}>
      {level.icon} {metricLabel(item.metric)}: {formatValue(item.value)} ({level.label})
    </span>
  );
}

function ReportContent({ report, onRegenerate }) {
  return (
    <div className="report">
      <p>{report.summary}</p>

      <h3>Jugadores destacados</h3>
      {report.highlights.length === 0 ? (
        <p className="empty">El modelo no devolvió destacados válidos.</p>
      ) : (
        <ul>
          {report.highlights.map((h) => (
            <li key={h.player_id}>
              <PlayerName player={h} />
              {h.low_minutes && <span className="muted"> (jugó pocos minutos)</span>}: {h.reason}
            </li>
          ))}
        </ul>
      )}

      <h3>Alertas</h3>
      {report.alerts.length === 0 ? (
        <p className="empty">Ningún jugador superó los umbrales en esta sesión.</p>
      ) : (
        <ul>
          {report.alerts.map((a) => (
            <li key={a.player_id}>
              <PlayerName player={a} />{' '}
              {a.items.map((item) => <AlertItem key={item.metric} item={item} />)}
              {a.comment && <div>{a.comment}</div>}
            </li>
          ))}
        </ul>
      )}

      {report.missing_data.length > 0 && (
        <>
          <h3>Datos faltantes</h3>
          <ul>
            {report.missing_data.map((m) => (
              <li key={`${m.player_id}-${m.metric}`}>
                <PlayerName player={m} />: {metricLabel(m.metric)} sin dato
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="report-footer muted">
        <span>
          {report.cached ? 'Reporte guardado' : 'Reporte generado'} el {formatDateTime(report.created_at)}
          {' · '}{report.model} · prompt {report.prompt_version}
        </span>
        <button type="button" onClick={onRegenerate}>Regenerar</button>
      </p>
    </div>
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
          Todavía no hay un reporte para esta sesión. Elegí idioma y destinatario, y tocá "Generar reporte".
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
