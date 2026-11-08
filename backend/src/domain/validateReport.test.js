import { describe, it, expect } from 'vitest';
import data from '../../session_data.json' with { type: 'json' };
import { buildContext } from './buildContext.js';
import { validateReport, InvalidReportError } from './validateReport.js';
import { reportSchema } from '../prompts/sessionReport.v2.js';

// Contexto real de la sesión 103: jugadores 1 a 12; alertas para 1, 2, 5, 6 y 10.
const session = data.sessions.find((s) => s.id === 103);
const context = buildContext({
  session,
  players: session.player_sessions,
  thresholds: data.thresholds,
});

// Valida contra el contexto de la sesión 103 y el esquema del prompt.
function validate(rawText) {
  return validateReport(rawText, context, reportSchema);
}

// Respuesta válida del modelo; cada test le cambia solo lo que necesita.
function modelResponse(overrides = {}) {
  return JSON.stringify({
    summary: 'Partido de alta exigencia para el equipo.',
    highlights: [
      { player_id: 5, reason: 'Recorrió 10488 metros, la mayor distancia.' },
      { player_id: 10, reason: 'Hizo 29 sprints.' },
    ],
    alerts: [{ player_id: 5, comment: 'Carga muy alta, conviene recuperación.' }],
    ...overrides,
  });
}

describe('validateReport: formato', () => {
  it('acepta una respuesta válida', () => {
    const report = validate(modelResponse());

    expect(report.summary).toBe('Partido de alta exigencia para el equipo.');
    expect(report.highlights.map((h) => h.player_id)).toEqual([5, 10]);
    expect(report.alertComments).toEqual([
      { player_id: 5, comment: 'Carga muy alta, conviene recuperación.' },
    ]);
  });

  it('JSON inválido -> InvalidReportError con status 502', () => {
    let error;
    try {
      validate('esto no es JSON');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(InvalidReportError);
    expect(error.status).toBe(502);
  });

  it('falta un campo obligatorio -> InvalidReportError', () => {
    const raw = JSON.stringify({ summary: 'Sin destacados ni alertas.' });
    expect(() => validate(raw)).toThrow(InvalidReportError);
  });

  it('menos de 2 destacados -> InvalidReportError', () => {
    const raw = modelResponse({ highlights: [{ player_id: 5, reason: 'Gran partido.' }] });
    expect(() => validate(raw)).toThrow(InvalidReportError);
  });

  it('más de 3 destacados -> InvalidReportError', () => {
    const raw = modelResponse({
      highlights: [1, 2, 5, 10].map((id) => ({ player_id: id, reason: 'Buen partido.' })),
    });
    expect(() => validate(raw)).toThrow(InvalidReportError);
  });
});

describe('validateReport: jugadores que no existen', () => {
  it('descarta destacados con player_id fuera de la sesión', () => {
    const raw = modelResponse({
      highlights: [
        { player_id: 5, reason: 'Gran despliegue.' },
        { player_id: 10, reason: 'Muy rápido.' },
        { player_id: 99, reason: 'Jugador inventado.' },
      ],
    });
    expect(validate(raw).highlights.map((h) => h.player_id)).toEqual([5, 10]);
  });

  it('descarta comentarios de alerta para jugadores sin alerta calculada', () => {
    // El jugador 7 (arquero) está en la sesión pero no tiene ninguna alerta.
    const raw = modelResponse({
      alerts: [
        { player_id: 5, comment: 'Carga alta.' },
        { player_id: 7, comment: 'Alerta inventada.' },
      ],
    });
    expect(validate(raw).alertComments.map((a) => a.player_id)).toEqual([5]);
  });

  it('si el modelo repite un jugador, queda una sola vez', () => {
    const raw = modelResponse({
      highlights: [
        { player_id: 5, reason: 'Primera mención.' },
        { player_id: 5, reason: 'Repetido.' },
        { player_id: 10, reason: 'Muy rápido.' },
      ],
    });
    const { highlights } = validate(raw);
    expect(highlights).toEqual([
      { player_id: 5, reason: 'Primera mención.' },
      { player_id: 10, reason: 'Muy rápido.' },
    ]);
  });
});

describe('validateReport: números que no existen', () => {
  it('rechaza un número inventado en el resumen', () => {
    const raw = modelResponse({ summary: 'El equipo recorrió 95000 metros en total.' });
    expect(() => validate(raw)).toThrow(/95000/);
  });

  it('rechaza un número inventado en el motivo de un destacado', () => {
    const raw = modelResponse({
      highlights: [
        { player_id: 5, reason: 'Corrió un 20% más que el resto.' },
        { player_id: 10, reason: 'Hizo 29 sprints.' },
      ],
    });
    expect(() => validate(raw)).toThrow(InvalidReportError);
  });

  it('acepta números que están en los datos, aunque tengan separador de miles', () => {
    const raw = modelResponse({ summary: 'Sesión de 90 minutos; el máximo fue 10.488 metros.' });
    expect(() => validate(raw)).not.toThrow();
  });

  it('acepta decimales de los datos (velocidad máxima 31.6 km/h)', () => {
    const raw = modelResponse({ summary: 'La velocidad máxima fue de 31,6 km/h.' });
    expect(() => validate(raw)).not.toThrow();
  });
});
