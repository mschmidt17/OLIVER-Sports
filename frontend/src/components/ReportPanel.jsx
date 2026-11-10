import { useState } from 'react';
import { generateReport } from '../api/client.js';
import {
  LEVELS, metricLabel, levelLabel, formatValue, formatDate, shortName, byShirtNumber,
} from '../metrics.js';
import { ChartIcon, StarIcon, FlagIcon, InfoIcon, TrendUpIcon } from './icons.jsx';

// Textos fijos del informe. El informe se muestra entero en el idioma en que se
// generó; los controles del panel siguen en español, como el resto de la app.
// Los nombres de métricas y niveles en cada idioma están en metrics.js.
const REPORT_TEXT = {
  es: {
    locale: 'es-AR',
    title: 'Informe de análisis de sesión',
    audience: { coach: 'Para el cuerpo técnico', player: 'Informe individual del jugador' },
    summary: 'Resumen',
    highlights: 'Destacados',
    positives: 'Puntos positivos',
    improvements: 'Aspectos a mejorar',
    alerts: 'Alertas',
    missing: 'Sin dato',
    lowMinutes: 'pocos min.',
    minutes: 'min',
    noAlerts: 'Ningún jugador alcanzó los umbrales en esta sesión.',
    noPlayerAlerts: 'Sin alertas en esta sesión.',
  },
  en: {
    locale: 'en-US',
    title: 'Session analysis report',
    audience: { coach: 'For the coaching staff', player: 'Individual player report' },
    summary: 'Summary',
    highlights: 'Highlights',
    positives: 'Strengths',
    improvements: 'Areas to improve',
    alerts: 'Alerts',
    missing: 'Missing data',
    lowMinutes: 'low minutes',
    minutes: 'min',
    noAlerts: 'No player reached the thresholds in this session.',
    noPlayerAlerts: 'No alerts in this session.',
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

// Encabezado y pie comunes a los dos informes (colectivo e individual).
// El destinatario es con el que se generó: el selector puede haber cambiado después.
function ReportFrame({ session, report, onRegenerate, onClose, children }) {
  const text = REPORT_TEXT[report.language];

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
        <p>{text.audience[report.audience]}</p>
      </header>

      {children}

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

// Informe colectivo para el cuerpo técnico.
function TeamReport({ report }) {
  const text = REPORT_TEXT[report.language];
  // Un jugador puede tener varias métricas sin dato: se agrupan en una sola línea.
  const missingByPlayer = Map.groupBy(report.missing_data, (missing) => missing.player_id);

  return (
    <>
      <div className="report-summary">
        <h3 className="report-heading"><ChartIcon />{text.summary}</h3>
        <p>{report.summary}</p>
      </div>

      <ReportSection title={text.highlights} icon={<StarIcon />}>
        {/* Siempre hay 2 o 3: el backend rechaza un reporte con menos. */}
        <ul className="report-list">
          {report.highlights.map((highlight) => (
            <li key={highlight.player_id}>
              <PlayerName player={highlight} />
              {highlight.low_minutes && <span className="cell-note">{text.lowMinutes}</span>}
              {highlight.reason}
            </li>
          ))}
        </ul>
      </ReportSection>

      <ReportSection title={text.alerts} icon={<FlagIcon />}>
        {report.alerts.length === 0 ? (
          <p className="empty">{text.noAlerts}</p>
        ) : (
          <ul className="report-list">
            {report.alerts.map((alert) => (
              <li key={alert.player_id}>
                <PlayerName player={alert} />
                <AlertLevels items={alert.items} language={report.language} locale={text.locale} />
                {alert.comment && <p className="report-comment">{alert.comment}</p>}
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
                {items.map((missing) => metricLabel(missing.metric, report.language)).join(', ')}
              </li>
            ))}
          </ul>
        </ReportSection>
      )}
    </>
  );
}

// Informe individual: solo los datos del jugador. Identidad, alertas y datos
// faltantes vienen de la base; resumen, positivos y mejoras, del modelo.
function PlayerReport({ report }) {
  const text = REPORT_TEXT[report.language];
  const { player } = report;

  return (
    <>
      {/* Nombre completo: es el único jugador del informe (no hace falta abreviar). */}
      <p className="report-player-line">
        <strong className="report-player">#{player.shirt_number} {player.name}</strong>
        {player.position} · {player.minutes_played} {text.minutes}
        {player.low_minutes && <span className="cell-note">{text.lowMinutes}</span>}
      </p>

      <div className="report-summary">
        <h3 className="report-heading"><ChartIcon />{text.summary}</h3>
        <p>{report.summary}</p>
      </div>

      <ReportSection title={text.positives} icon={<StarIcon />}>
        {/* Siempre hay al menos uno: el backend rechaza un informe sin positivos. */}
        <ul className="report-list">
          {/* Listas fijas (no se reordenan): el índice alcanza como key. */}
          {report.positives.map((positive, index) => <li key={index}>{positive.text}</li>)}
        </ul>
      </ReportSection>

      {/* Son opcionales (0 a 2): sin fundamento en los datos, la sección no aparece. */}
      {report.improvements.length > 0 && (
        <ReportSection title={text.improvements} icon={<TrendUpIcon />}>
          <ul className="report-list">
            {report.improvements.map((improvement, index) => <li key={index}>{improvement}</li>)}
          </ul>
        </ReportSection>
      )}

      <ReportSection title={text.alerts} icon={<FlagIcon />}>
        {report.alerts.length === 0 ? (
          <p className="empty">{text.noPlayerAlerts}</p>
        ) : (
          <ul className="report-list">
            <li>
              <AlertLevels items={report.alerts} language={report.language} locale={text.locale} />
              {report.alert_comment && <p className="report-comment">{report.alert_comment}</p>}
            </li>
          </ul>
        )}
      </ReportSection>

      {report.missing_data.length > 0 && (
        <ReportSection title={text.missing} icon={<InfoIcon />}>
          <p>{report.missing_data.map((metric) => metricLabel(metric, report.language)).join(', ')}</p>
        </ReportSection>
      )}
    </>
  );
}

// El padre le pasa key={session.id}: al cambiar de sesión el panel se
// monta de nuevo y vuelve al estado inicial, sin lógica extra.
export default function ReportPanel({ session, players }) {
  const [language, setLanguage] = useState('es');
  const [audience, setAudience] = useState('coach');
  const [playerId, setPlayerId] = useState(''); // '' = ningún jugador elegido
  const [status, setStatus] = useState('idle'); // idle | loading | error | done
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const isPlayerReport = audience === 'player';
  // El informe individual necesita un jugador; el colectivo, no.
  const needsPlayer = isPlayerReport && playerId === '';
  const canGenerate = status !== 'loading' && !needsPlayer;

  // Si ya hay un reporte guardado para estos parámetros, el backend lo
  // devuelve sin llamar a la IA. refresh = true fuerza uno nuevo.
  // "Regenerar" usa los parámetros del informe en pantalla, no los selectores,
  // que pueden haber cambiado después de generarlo.
  async function handleGenerate(params, refresh = false) {
    setStatus('loading');
    try {
      // El backend devuelve con qué idioma y destinatario se generó: el informe
      // se muestra así aunque los selectores cambien después.
      setReport(await generateReport(session.id, { ...params, refresh }));
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
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="field">
          Destinatario
          <select value={audience} onChange={(event) => setAudience(event.target.value)}>
            <option value="coach">Cuerpo técnico</option>
            <option value="player">Jugador (individual)</option>
          </select>
        </label>
        {isPlayerReport && (
          <label className="field">
            Jugador
            <select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>
              <option value="" disabled>Elegí un jugador</option>
              {players.toSorted(byShirtNumber).map((player) => (
                <option key={player.player_id} value={player.player_id}>#{player.shirt_number} {player.name}</option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="primary"
          onClick={() => handleGenerate({
            language,
            audience,
            playerId: isPlayerReport ? Number(playerId) : undefined,
          })}
          disabled={!canGenerate}
        >
          {status === 'loading' ? 'Generando…' : 'Generar reporte'}
        </button>
      </div>

      {status === 'idle' && (
        <p className="empty">
          {needsPlayer
            ?'Elegí el jugador para generar su informe individual.'
            : 'Elegí idioma y destinatario, y tocá "Generar reporte". Si ya se generó antes con esas opciones, aparece al instante.'}
        </p>
      )}
      {status === 'loading' && (
        <p className="loading">Generando el reporte con IA, puede tardar unos segundos…</p>
      )}
      {status === 'error' && (
        <p className="error" role="alert">No se pudo generar el reporte: {error}</p>
      )}
      {/* El formato depende del informe recibido (report.audience), no del selector. */}
      {status === 'done' && (
        <ReportFrame
          session={session}
          report={report}
          onRegenerate={() => handleGenerate({
            language: report.language,
            audience: report.audience,
            playerId: report.player?.player_id,
          }, true)}
          onClose={handleClose}
        >
          {report.audience === 'player' ? <PlayerReport report={report} /> : <TeamReport report={report} />}
        </ReportFrame>
      )}
    </div>
  );
}
