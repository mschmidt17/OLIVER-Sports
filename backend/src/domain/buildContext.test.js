import { describe, it, expect } from 'vitest';
import data from '../../session_data.json' with { type: 'json' };
import { buildContext, isLowMinutes } from './buildContext.js';
import { detectAlerts } from './alerts.js';

// Arma la misma entrada que va a recibir buildContext desde el service:
// métricas de la sesión + datos del jugador (incluido el nombre).
function inputFor(sessionId) {
  const session = data.sessions.find((s) => s.id === sessionId);
  const players = session.player_sessions.map((ps) => ({
    ...data.players.find((p) => p.id === ps.player_id),
    ...ps,
  }));
  return { session, players, thresholds: data.thresholds };
}

function contextFor(sessionId) {
  return buildContext(inputFor(sessionId));
}

function playerIn(context, playerId) {
  return context.players.find((p) => p.player_id === playerId);
}

describe('buildContext', () => {
  it('jugador 11 en la sesión 103: low_minutes = true (28 de 90)', () => {
    expect(playerIn(contextFor(103), 11).low_minutes).toBe(true);
  });

  it('jugador 8 en la sesión 103: 62 de 90 no es low_minutes', () => {
    expect(playerIn(contextFor(103), 8).low_minutes).toBe(false);
  });

  it('en la sesión 101 nadie tiene low_minutes', () => {
    expect(contextFor(101).players.some((p) => p.low_minutes)).toBe(false);
  });

  it('calcula métricas por minuto redondeadas a 2 decimales', () => {
    // Jugador 11: 2128 m / 28 min = 76 m/min; 4 sprints / 28 = 0.142... -> 0.14
    expect(playerIn(contextFor(103), 11).per_minute).toEqual({
      distance_m_per_min: 76,
      hsr_m_per_min: 6.71,
      sprints_per_min: 0.14,
      accelerations_per_min: 0.43,
    });
  });

  it('jugador 9 en la sesión 103: rpe y workload siguen en null, no en 0', () => {
    const player = playerIn(contextFor(103), 9);
    expect(player.metrics.rpe).toBeNull();
    expect(player.metrics.workload_au).toBeNull();
  });

  it('informa los datos faltantes por separado (jugador 9, sesión 103)', () => {
    expect(contextFor(103).missing_data).toEqual([
      { player_id: 9, metric: 'rpe' },
      { player_id: 9, metric: 'workload_au' },
    ]);
  });

  it('sin datos faltantes, missing_data queda vacío', () => {
    expect(contextFor(101).missing_data).toEqual([]);
  });

  it('incluye las alertas tal como las calcula detectAlerts', () => {
    const input = inputFor(103);
    expect(buildContext(input).alerts).toEqual(detectAlerts(input.players, input.thresholds));
  });

  it('no envía nombres al modelo: solo player_id', () => {
    const context = contextFor(103);
    expect(JSON.stringify(context)).not.toContain('Franco Medina');
    expect(playerIn(context, 11)).not.toHaveProperty('name');
  });

  it('con 0 minutos jugados las métricas por minuto son null', () => {
    const context = buildContext({
      session: { id: 1, duration_min: 90 },
      players: [{ player_id: 1, minutes_played: 0, total_distance_m: 0, sprints: 0 }],
      thresholds: {},
    });
    expect(context.players[0].per_minute.distance_m_per_min).toBeNull();
    expect(context.players[0].low_minutes).toBe(true);
  });
});

describe('isLowMinutes', () => {
  it('menos del 50% de la sesión es pocos minutos; exactamente el 50% no', () => {
    expect(isLowMinutes(44, 90)).toBe(true);
    expect(isLowMinutes(45, 90)).toBe(false);
    expect(isLowMinutes(90, 90)).toBe(false);
    expect(isLowMinutes(null, 90)).toBe(false); // sin dato no es "pocos minutos"
  });
});
