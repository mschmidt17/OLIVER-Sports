import { useState } from 'react';
import { generateReport } from '../api/client.js';
import { LEVELS, metricLabel, levelLabel, formatValue, formatDate, shortName } from '../metrics.js';
import { ChartIcon, StarIcon, FlagIcon, InfoIcon } from './icons.jsx';

// Textos fijos del informe. El informe se muestra entero en el idioma en que se
// generó; los controles del panel siguen en español, como el resto de la app.
// Los nombres de métricas y niveles en cada idioma están en metrics.js.
const REPORT_TEXT = {
  es: {
    locale: 'es-AR',
    title: 'Informe de análisis de sesión',
    audience: { coach: 'Para el cuerpo técnico', player: 'Para los jugadores' },
    summary: 'Resumen',
    highlights: 'Destacados',
    alerts: 'Alertas',
    missing: 'Sin dato',
    lowMinutes: 'pocos min.',
    noHighlights: 'El modelo no devolvió destacados válidos.',
    noAlerts: 'Ningún jugador alcanzó los umbrales en esta sesión.',
  },
  en: {
    locale: 'en-US',
    title: 'Session analysis report',
    audience: { coach: 'For the coaching staff', player: 'For the players' },
    summary: 'Summary',
    highlights: 'Highlights',
    alerts: 'Alerts',
    missing: 'Missing data',
    lowMinutes: 'low minutes',
    noHighlights: 'The model returned no valid highlights.',
    noAlerts: 'No player reached the thresholds in this session.',
  },
};

// Fecha de la sesión ("YYYY-MM-DD"). En inglés, "Sep 19, 2026": "19/09/2026"
// se confunde con mes/día. Se arma con año, mes y día para no pasar por UTC.
function formatSessionDate(isoDate, language) {
  if (language !== 'en') return formatDate(isoDate);
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { dateStyle: 'medium' });
}

// Fecha y hora de generación, en 24 h: "8/11/26 - 14:01hs" o "Nov 8, 2026 at 14:01".
function formatGeneratedAt(isoDate, language) {
  const date = new Date(isoDate);
  if (language === 'en') {
    const day = date.toLocaleDateString('en-US', { dateStyle: 'medium' });
    const time = date.toLocaleTimeString('en-US', { timeStyle: 'short', hourCycle: 'h23' });
    return `Generated on ${day} at ${time}`;
  }
  const day = date.toLocaleDateString('es-AR', { dateStyle: 'short' });
  const time = date.toLocaleTimeString('es-AR', { timeStyle: 'short', hourCycle: 'h23' });
  return `Generado el ${day} - ${time}hs`;
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
function AlertLevels({ items, language, locale }) {
  const byLevel = Map.groupBy(items, (item) => item.level);
  // Orden de prioridad explícito: LEVELS define etiquetas y colores, no un orden.
  const levels = ['critical', 'warning'].filter((level) => byLevel.has(level));

  return levels.map((level) => (
    <p key={level} className={`alert-line level-${level}`}>
      <span className="level-icon" aria-hidden="true">{LEVELS[level].icon}</span>
      <strong>{levelLabel(level, language)}:</strong>{' '}
      {byLevel.get(level)
        .map((item) => `${metricLabel(item.metric, language)} ${formatValue(item.value, locale)}`)
        .join(' · ')}
    </p>
  ));
}

function ReportSection({ title, icon, children }) {
  return (
    <section className="report-section">
      <h3 className="report-heading">{icon}{title}</h3>
      {children}
    </section>
  );
}

function ReportContent({ session, report, onRegenerate, onClose }) {
  const text = REPORT_TEXT[report.language];
  // Un jugador puede tener varias métricas sin dato: se agrupan en una sola línea.
  const missingByPlayer = Map.groupBy(report.missing_data, (m) => m.player_id);

  return (
    <article className="report" lang={report.language}>
      <header className="report-header">
        <p className="report-brand">
          <span className="report-wordmark">
            <img className="report-logo" src="/favicon.svg" alt="" />
            OLIVER
          </span>
          {text.title}
        </p>
        <p><strong>{session.title}</strong> · {formatSessionDate(session.date, report.language)}</p>
        {/* Destinatario con el que se generó: el selector puede haber cambiado después. */}
        <p>{text.audience[report.audience]}</p>
      </header>

      <div className="report-summary">
        <h3 className="report-heading"><ChartIcon />{text.summary}</h3>
        <p>{report.summary}</p>
      </div>

      <ReportSection title={text.highlights} icon={<StarIcon />}>
        {report.highlights.length === 0 ? (
          <p className="empty">{text.noHighlights}</p>
        ) : (
          <ul className="report-list">
            {report.highlights.map((h) => (
              <li key={h.player_id}>
                <PlayerName player={h} />
                {h.low_minutes && <span className="cell-note">{text.lowMinutes}</span>}
                {h.reason}
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <ReportSection title={text.alerts} icon={<FlagIcon />}>
        {report.alerts.length === 0 ? (
          <p className="empty">{text.noAlerts}</p>
        ) : (
          <ul className="report-list">
            {report.alerts.map((a) => (
              <li key={a.player_id}>
                <PlayerName player={a} />
                <AlertLevels items={a.items} language={report.language} locale={text.locale} />
                {a.comment && <p className="report-comment">{a.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      {missingByPlayer.size > 0 && (
        <ReportSection title={text.missing} icon={<InfoIcon />}>
          <ul className="report-list">
            {[...missingByPlayer].map(([playerId, items]) => (
              <li key={playerId}>
                <PlayerName player={items[0]} />
                {items.map((m) => metricLabel(m.metric, report.language)).join(', ')}
              </li>
            ))}
          </ul>
        </ReportSection>
      )}

      <footer className="report-footer">
        <span title={`${report.model} · prompt ${report.prompt_version}`}>
          {formatGeneratedAt(report.created_at, report.language)}.
        </span>
        <div className="report-actions">
          <button type="button" className="secondary" onClick={onClose}>Cerrar</button>
          <button type="button" className="secondary" onClick={onRegenerate}>Regenerar</button>
        </div>
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
      // El backend devuelve con qué idioma se generó (report.language): el
      // informe se muestra en ese idioma aunque el selector cambie después.
      setReport(await generateReport(session.id, { language, audience, refresh }));
      setStatus('done');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  // Cerrar solo saca el reporte de la vista: sigue guardado en la caché del
  // backend, así que volver a generarlo con las mismas opciones es instantáneo.
  function handleClose() {
    setReport(null);
    setStatus('idle');
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
          Elegí idioma y destinatario, y tocá "Generar reporte". Si ya se generó
          antes con esas opciones, aparece al instante.
        </p>
      )}
      {status === 'loading' && (
        <p className="loading">Generando el reporte con IA, puede tardar unos segundos…</p>
      )}
      {status === 'error' && (
        <p className="error" role="alert">No se pudo generar el reporte: {error}</p>
      )}
      {status === 'done' && (
        <ReportContent
          session={session}
          report={report}
          onRegenerate={() => handleGenerate(true)}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
