import { useState } from 'react';
import { generateReport } from '../api/client.js';
import { LEVELS, metricLabel, formatValue, formatDate, shortName } from '../metrics.js';
import { ChartIcon, StarIcon, FlagIcon, InfoIcon } from './icons.jsx';

// Fecha y hora en formato de 24 h ("5/11/26, 16:40"), sin depender
// de cómo el navegador formatee por defecto.
function formatDateTime(isoDate) {
  return new Date(isoDate).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    hourCycle: 'h23',
  });
}

// "#6 Molina": número y apellido alcanzan dentro del informe; la posición
// y el nombre completo ya están en la tabla.
function PlayerName({ player }) {
  return <strong className="report-player">#{player.shirt_number} {shortName(player.name)}</strong>;
}

// Las alertas de un jugador agrupadas por nivel, crítico primero:
//   ◆ Crítico: Carga 810
//   ▲ Advertencia: Distancia 10.488 · RPE 9
// Así cada nivel se nombra una sola vez, con ícono, color y texto.
function AlertLevels({ items }) {
  const byLevel = Map.groupBy(items, (item) => item.level);
  // Orden de prioridad explícito: LEVELS define etiquetas y colores, no un orden.
  const levels = ['critical', 'warning'].filter((level) => byLevel.has(level));

  return levels.map((level) => (
    <p key={level} className={`alert-line level-${level}`}>
      <span className="level-icon" aria-hidden="true">{LEVELS[level].icon}</span>
      <strong>{LEVELS[level].label}:</strong>{' '}
      {byLevel.get(level).map((item) => `${metricLabel(item.metric)} ${formatValue(item.value)}`).join(' · ')}
    </p>
  ));
}

// Una sección del informe: título con ícono y su contenido.
function ReportSection({ title, icon, children }) {
  return (
    <section className="report-section">
      <h3 className="report-heading">{icon}{title}</h3>
      {children}
    </section>
  );
}

function ReportContent({ session, report, onRegenerate }) {
  // Un jugador puede tener varias métricas sin dato: se agrupan en una sola línea.
  const missingByPlayer = Map.groupBy(report.missing_data, (m) => m.player_id);

  return (
    <article className="report">
      <header className="report-header">
        <p className="report-brand">
          <span className="report-wordmark">OLIVER</span>
          Informe de análisis de sesión
        </p>
        <p><strong>{session.title}</strong> · {formatDate(session.date)}</p>
      </header>

      <div className="report-summary">
        <h3 className="report-heading"><ChartIcon />Resumen</h3>
        <p>{report.summary}</p>
      </div>

      <ReportSection title="Destacados" icon={<StarIcon />}>
        {report.highlights.length === 0 ? (
          <p className="empty">El modelo no devolvió destacados válidos.</p>
        ) : (
          <ul className="report-list">
            {report.highlights.map((h) => (
              <li key={h.player_id}>
                <PlayerName player={h} />
                {h.low_minutes && <span className="cell-note">pocos min.</span>}
                {h.reason}
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <ReportSection title="Alertas" icon={<FlagIcon />}>
        {report.alerts.length === 0 ? (
          <p className="empty">Ningún jugador alcanzó los umbrales en esta sesión.</p>
        ) : (
          <ul className="report-list">
            {report.alerts.map((a) => (
              <li key={a.player_id}>
                <PlayerName player={a} />
                <AlertLevels items={a.items} />
                {a.comment && <p className="report-comment">{a.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      {missingByPlayer.size > 0 && (
        <ReportSection title="Sin dato" icon={<InfoIcon />}>
          <ul className="report-list">
            {[...missingByPlayer].map(([playerId, items]) => (
              <li key={playerId}>
                <PlayerName player={items[0]} />
                {items.map((m) => metricLabel(m.metric)).join(', ')}
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

// El padre le pasa key={session.id}: al cambiar de sesión el panel se
// monta de nuevo y vuelve al estado inicial, sin lógica extra.
export default function ReportPanel({ session }) {
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
      setReport(await generateReport(session.id, { language, audience, refresh }));
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
        <ReportContent session={session} report={report} onRegenerate={() => handleGenerate(true)} />
      )}
    </div>
  );
}
