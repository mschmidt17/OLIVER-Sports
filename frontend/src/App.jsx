import { useEffect, useState } from 'react';
import { getSessions, getSessionMetrics } from './api/client.js';
import SessionSelector from './components/SessionSelector.jsx';
import SessionHeader from './components/SessionHeader.jsx';
import MetricsTable from './components/MetricsTable.jsx';
import MetricChart from './components/MetricChart.jsx';
import ReportPanel from './components/ReportPanel.jsx';

export default function App() {
  const [sessions, setSessions] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);

  // Al abrir: carga las sesiones y selecciona la más reciente.
  useEffect(() => {
    getSessions()
      .then((list) => {
        setSessions(list);
        setSessionId(list.at(-1)?.id ?? null);
      })
      .catch((err) => setError(err.message));
  }, []);

  // Cada vez que cambia la sesión: carga sus métricas.
  // `ignore` evita pisar los datos si el usuario cambia de sesión
  // antes de que llegue la respuesta anterior.
  useEffect(() => {
    if (sessionId == null) return;
    let ignore = false;

    setMetrics(null);
    setError(null);
    getSessionMetrics(sessionId)
      .then((data) => { if (!ignore) setMetrics(data); })
      .catch((err) => { if (!ignore) setError(err.message); });

    return () => { ignore = true; };
  }, [sessionId]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="wordmark">OLIVER</span>
            <span className="brand-view">Análisis de sesión</span>
          </div>
          {sessions?.length > 0 && (
            <SessionSelector sessions={sessions} selectedId={sessionId} onChange={setSessionId} />
          )}
        </div>
      </header>

      <main>
        {error && <p className="error" role="alert">{error}</p>}
        {sessions?.length === 0 && (
          <p className="empty">No hay sesiones cargadas. Corré <code>npm run seed</code> en el backend.</p>
        )}
        {!error && sessionId != null && !metrics && <p className="loading">Cargando métricas…</p>}

        {metrics && (
          <>
            <SessionHeader session={metrics.session} players={metrics.players} alerts={metrics.alerts} />

            <section className="panel">
              <h2 className="section-title">Métricas por jugador</h2>
              <MetricsTable players={metrics.players} alerts={metrics.alerts} />
            </section>

            {/* En pantallas anchas, gráfico y reporte van lado a lado. */}
            <div className="analysis-grid">
              <section className="panel">
                <h2 className="section-title">Comparación por jugador</h2>
                <MetricChart
                  players={metrics.players}
                  alerts={metrics.alerts}
                  thresholds={metrics.thresholds}
                />
              </section>

              <section className="panel">
                <h2 className="section-title">Reporte con IA</h2>
                <ReportPanel key={sessionId} sessionId={sessionId} />
              </section>
            </div>
          </>
        )}
      </main>
    </>
  );
}
