import { describe, it, expect } from 'vitest';
import data from '../../session_data.json' with { type: 'json' };
import { buildContext } from './buildContext.js';
import { validateReport, validatePlayerReport, InvalidReportError } from './validateReport.js';
import { reportSchema } from '../prompts/sessionReport.v4.js';
import { playerReportSchema } from '../prompts/playerReport.v1.js';

// Contexto real de la sesión 103: jugadores 1 a 12; alertas para 1, 2, 5, 6 y 10.
const session = data.sessions.find((session) => session.id === 103);
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
    expect(report.highlights.map((highlight) => highlight.player_id)).toEqual([5, 10]);
    expect(report.alertComments).toEqual([
      { player_id: 5, comment: 'Carga muy alta, conviene recuperación.' },
    ]);
  });

  it('JSON inválido -> InvalidReportError con status 502', () => {
    let error;
    try {
      validate('esto no es JSON');
    } catch (thrown) {
      error = thrown;
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
    expect(validate(raw).highlights.map((highlight) => highlight.player_id)).toEqual([5, 10]);
  });

  it('si tras el descarte quedan menos de 2 destacados -> InvalidReportError', () => {
    const raw = modelResponse({
      highlights: [
        { player_id: 5, reason: 'Gran despliegue.' },
        { player_id: 99, reason: 'Jugador inventado.' },
      ],
    });
    expect(() => validate(raw)).toThrow(/menos de 2 destacados/);
  });

  it('descarta comentarios de alerta para jugadores sin alerta calculada', () => {
    // El jugador 7 (arquero) está en la sesión pero no tiene ninguna alerta.
    const raw = modelResponse({
      alerts: [
        { player_id: 5, comment: 'Carga alta.' },
        { player_id: 7, comment: 'Alerta inventada.' },
      ],
    });
    expect(validate(raw).alertComments.map((alertComment) => alertComment.player_id)).toEqual([5]);
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

  it('el player_id no cuenta como dato: 3 solo es el id de un jugador', () => {
    const raw = modelResponse({ summary: '3 jugadores superaron la carga recomendada.' });
    expect(() => validate(raw)).toThrow(/datos: 3$/);
  });
});

describe('validateReport: números atribuidos a otro jugador', () => {
  it('rechaza en un destacado un número de otro jugador (29 sprints son del 10, no del 7)', () => {
    const raw = modelResponse({
      highlights: [
        { player_id: 5, reason: 'Recorrió 10488 metros.' },
        { player_id: 7, reason: 'Hizo 29 sprints.' },
      ],
    });
    expect(() => validate(raw)).toThrow(/jugador 7: 29/);
  });

  it('rechaza en un comentario de alerta un número de otro jugador (810 no es del 1)', () => {
    const raw = modelResponse({ alerts: [{ player_id: 1, comment: 'Llegó a 810 de carga.' }] });
    expect(() => validate(raw)).toThrow(/jugador 1: 810/);
  });

  it('en un destacado acepta sus datos, sus valores por minuto y los de la sesión', () => {
    const raw = modelResponse({
      highlights: [
        { player_id: 5, reason: 'En 90 minutos llegó a 810, por encima del umbral de 750.' },
        { player_id: 10, reason: 'Hizo 29 sprints.' },
      ],
    });
    expect(() => validate(raw)).not.toThrow();
  });
});

// Informe individual: contexto de la sesión 103 con un solo jugador, como lo
// arma el service con las métricas ya filtradas por player_id.
function playerContext(playerId) {
  return buildContext({
    session,
    players: session.player_sessions.filter((player) => player.player_id === playerId),
    thresholds: data.thresholds,
  });
}

function positive(metric, text) {
  return { metric, text };
}

function validatePlayer(playerId, overrides = {}) {
  const raw = JSON.stringify({
    summary: 'Hiciste una sesión completa de 90 minutos.',
    positives: [positive('max_speed_kmh', 'Llegaste a una buena velocidad máxima.')],
    improvements: [],
    alert_comment: null,
    ...overrides,
  });
  return validatePlayerReport(raw, playerContext(playerId), playerReportSchema);
}

describe('validatePlayerReport: formato', () => {
  it('acepta un informe completo (jugador 5: positivos, mejoras y alerta)', () => {
    const report = validatePlayer(5, {
      positives: [positive('accelerations', 'Hiciste 58 aceleraciones.')],
      improvements: ['Podés sumar más sprints en la próxima sesión.'],
      alert_comment: 'Sentiste un esfuerzo muy alto: descansá bien.',
    });
    expect(report).toEqual({
      summary: 'Hiciste una sesión completa de 90 minutos.',
      positives: [positive('accelerations', 'Hiciste 58 aceleraciones.')],
      improvements: ['Podés sumar más sprints en la próxima sesión.'],
      alertComment: 'Sentiste un esfuerzo muy alto: descansá bien.',
    });
  });

  it('sin aspectos a mejorar es válido (0 a 2)', () => {
    expect(validatePlayer(7).improvements).toEqual([]);
  });

  it('sin puntos positivos -> InvalidReportError', () => {
    expect(() => validatePlayer(7, { positives: [] })).toThrow(InvalidReportError);
  });

  it('más de 3 positivos o más de 2 mejoras -> InvalidReportError', () => {
    const fourPositives = ['a', 'b', 'c', 'd'].map((text) => positive('sprints', text));
    expect(() => validatePlayer(7, { positives: fourPositives })).toThrow(InvalidReportError);
    expect(() => validatePlayer(7, { improvements: ['a', 'b', 'c'] })).toThrow(InvalidReportError);
  });

  it('positivo con una métrica que no existe -> InvalidReportError', () => {
    const raw = { positives: [positive('goles', 'Hiciste goles.')] };
    expect(() => validatePlayer(7, raw)).toThrow(InvalidReportError);
  });

  it('falta alert_comment -> InvalidReportError (debe venir, aunque sea null)', () => {
    const raw = JSON.stringify({
      summary: 'Bien.', positives: [positive('sprints', 'Bien.')], improvements: [],
    });
    expect(() => validatePlayerReport(raw, playerContext(7), playerReportSchema))
      .toThrow(InvalidReportError);
  });
});

describe('validatePlayerReport: alertas', () => {
  it('jugador sin alertas (7): descarta el comentario de alerta inventado', () => {
    const report = validatePlayer(7, { alert_comment: 'Cuidado con el esfuerzo.' });
    expect(report.alertComment).toBeNull();
  });

  it('jugador con alertas (5): conserva el comentario', () => {
    const report = validatePlayer(5, { alert_comment: 'Descansá y avisá si sentís molestias.' });
    expect(report.alertComment).toBe('Descansá y avisá si sentís molestias.');
  });

  it('descarta un positivo sobre una métrica con alerta (jugador 5: distancia)', () => {
    const report = validatePlayer(5, {
      positives: [
        positive('total_distance_m', 'Recorriste 10488 metros.'),
        positive('accelerations', 'Hiciste 58 aceleraciones.'),
      ],
    });
    expect(report.positives).toEqual([positive('accelerations', 'Hiciste 58 aceleraciones.')]);
  });

  it('si todos los positivos tenían alerta -> InvalidReportError', () => {
    const raw = { positives: [positive('workload_au', 'Trabajaste mucho.')] };
    expect(() => validatePlayer(5, raw)).toThrow(/puntos positivos válidos/);
  });
});

describe('validatePlayerReport: números', () => {
  it('acepta números de sus propios datos (jugador 11: 28 minutos, 76 m por minuto)', () => {
    expect(() => validatePlayer(11, {
      summary: 'Jugaste 28 minutos.',
      positives: [positive('total_distance_m', 'Mantuviste un ritmo de 76 metros por minuto.')],
    })).not.toThrow();
  });

  it('rechaza un número de un compañero: el contexto solo tiene al jugador', () => {
    // 10488 es la distancia del jugador 5, no del 7.
    const raw = { positives: [positive('total_distance_m', 'Recorriste 10488 metros.')] };
    expect(() => validatePlayer(7, raw)).toThrow(/10488/);
  });

  it('rechaza un número inventado en un aspecto a mejorar', () => {
    expect(() => validatePlayer(7, { improvements: ['Intentá llegar a 15 sprints.'] }))
      .toThrow(/15/);
  });

  it('no valida números de un comentario de alerta descartado', () => {
    // El jugador 7 no tiene alertas: el comentario se descarta antes de revisarlo.
    expect(validatePlayer(7, { alert_comment: 'Tomá 37 litros de agua.' }).alertComment).toBeNull();
  });
});
