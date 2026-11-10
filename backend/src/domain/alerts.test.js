import { describe, it, expect } from 'vitest';
import data from '../../session_data.json' with { type: 'json' };
import { detectAlerts } from './alerts.js';

function alertsFor(sessionId) {
  const session = data.sessions.find((session) => session.id === sessionId);
  return detectAlerts(session.player_sessions, data.thresholds);
}

// IDs de jugadores con alerta para una métrica y un nivel, ordenados.
function playerIds(alerts, metric, level) {
  return alerts
    .filter((alert) => alert.metric === metric && alert.level === level)
    .map((alert) => alert.player_id)
    .sort((first, second) => first - second);
}

describe('detectAlerts con session_data.json', () => {
  it('sesión 101: ninguna alerta', () => {
    expect(alertsFor(101)).toEqual([]);
  });

  it('sesión 102: workload y RPE warning para 5 y 10', () => {
    const alerts = alertsFor(102);

    expect(playerIds(alerts, 'workload_au', 'warning')).toEqual([5, 10]);
    expect(playerIds(alerts, 'rpe', 'warning')).toEqual([5, 10]);
    expect(alerts).toHaveLength(4);
  });

  it('sesión 103: alertas por métrica y nivel', () => {
    const alerts = alertsFor(103);

    expect(playerIds(alerts, 'workload_au', 'critical')).toEqual([5, 10]);
    expect(playerIds(alerts, 'workload_au', 'warning')).toEqual([1, 2, 6]);
    expect(playerIds(alerts, 'rpe', 'warning')).toEqual([2, 5, 10]);
    expect(playerIds(alerts, 'total_distance_m', 'warning')).toEqual([5]);
    expect(playerIds(alerts, 'sprints', 'warning')).toEqual([10]);
    expect(alerts).toHaveLength(10);
  });

  it('sesión 103: jugador 9 no se evalúa en RPE ni workload (null)', () => {
    expect(alertsFor(103).filter((alert) => alert.player_id === 9)).toEqual([]);
  });
});

describe('detectAlerts: reglas de umbral', () => {
  const thresholds = { workload_au: { warning: 600, critical: 750 } };

  it('alcanzar exactamente el umbral genera alerta (>=)', () => {
    const alerts = detectAlerts([{ player_id: 1, workload_au: 600 }], thresholds);
    expect(alerts).toEqual([
      { player_id: 1, metric: 'workload_au', value: 600, level: 'warning', threshold: 600 },
    ]);
  });

  it('un valor critical genera una sola alerta, no también warning', () => {
    const alerts = detectAlerts([{ player_id: 1, workload_au: 750 }], thresholds);
    expect(alerts).toEqual([
      { player_id: 1, metric: 'workload_au', value: 750, level: 'critical', threshold: 750 },
    ]);
  });

  it('por debajo del umbral no hay alerta', () => {
    expect(detectAlerts([{ player_id: 1, workload_au: 599 }], thresholds)).toEqual([]);
  });

  it('un valor null no se evalúa ni rompe la comparación', () => {
    expect(detectAlerts([{ player_id: 1, workload_au: null }], thresholds)).toEqual([]);
  });
});
