import { useEffect, useState } from 'react';
import { getSessions, getSessionMetrics } from './api/client.js';
import SessionSelector from './components/SessionSelector.jsx';
import SessionHeader from './components/SessionHeader.jsx';
import MetricsTable from './components/MetricsTable.jsx';
import MetricChart from './components/MetricChart.jsx';
import ReportPanel from './components/ReportPanel.jsx';
import Sidebar from './components/Sidebar.jsx';
import { SparkleIcon } from './components/icons.jsx';

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
    <div className="app-shell">
      <Sidebar />

      <div className="app-main">
        <header className="topbar">
          {sessions?.length > 0 && (
            <SessionSelector sessions={sessions} selectedId={sessionId} onChange={setSessionId} />
          )}
        </header>

        <main className="content">
          {error && <p className="error" role="alert">{error}</p>}
          {sessions?.length === 0 && (
            <p className="empty">No hay sesiones cargadas. Corré <code>npm run seed</code> en el backend.</p>
          )}
          {!error && sessionId != null && !metrics && <p className="loading">Cargando métricas…</p>}

          {metrics && (
            <>
              <SessionHeader session={metrics.session} players={metrics.players} alerts={metrics.alerts} />

              {/* En pantallas anchas: datos a la izquierda y reporte a la derecha.
                  En angostas, todo en una columna (el reporte queda al final). */}
              <div className="dashboard-grid">
                <div className="data-column">
                  <section className="panel">
                    <h2 className="section-title">Métricas por jugador</h2>
                    <MetricsTable players={metrics.players} alerts={metrics.alerts} />
                  </section>

                  <section className="panel">
                    <MetricChart
                      players={metrics.players}
                      alerts={metrics.alerts}
                      thresholds={metrics.thresholds}
                    />
                  </section>
                </div>

                <section className="panel">
                  <h2 className="section-title"><SparkleIcon />Reporte con IA</h2>
                  <ReportPanel key={metrics.session.id} session={metrics.session} />
                </section>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
