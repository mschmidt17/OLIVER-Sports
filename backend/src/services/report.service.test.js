import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { generateJson } from '../ai/index.js';

// La IA se simula: estos tests prueban la orquestación (flujos, caché y errores),
// no al modelo. La respuesta depende de qué prompt se le pidió.
vi.mock('../ai/index.js', () => ({
  generateJson: vi.fn(),
  currentModelId: () => 'test/model',
}));

// Base temporal con el seed real: los tests no tocan data/oliver.db.
// DB_PATH se fija antes de importar la conexión (por eso los import dinámicos).
const dbPath = path.join(os.tmpdir(), `oliver-report-service-${process.pid}.db`);
process.env.DB_PATH = dbPath;
await import('../db/seed.js');
const { default: db } = await import('../db/connection.js');
const { generateSessionReport, PlayerNotInSessionError } = await import('./report.service.js');

const TEAM_RESPONSE = {
  summary: 'Partido exigente para el equipo.',
  highlights: [
    { player_id: 5, reason: 'Gran despliegue.' },
    { player_id: 10, reason: 'Muy rápido.' },
  ],
  alerts: [{ player_id: 5, comment: 'Controlar su recuperación.' }],
};

const PLAYER_RESPONSE = {
  summary: 'Hiciste una buena sesión.',
  positives: [{ metric: 'max_speed_kmh', text: 'Mantuviste el ritmo.' }],
  improvements: [],
  alert_comment: 'Descansá bien y avisá si sentís molestias.',
};

function fakeModel({ userPrompt }) {
  const isPlayerPrompt = userPrompt.startsWith('Datos del jugador');
  return Promise.resolve(JSON.stringify(isPlayerPrompt ? PLAYER_RESPONSE : TEAM_RESPONSE));
}

// Contexto que recibió el modelo en la llamada número `call` (0 = la primera).
function contextSentToModel(call = 0) {
  const { userPrompt } = generateJson.mock.calls[call][0];
  return JSON.parse(userPrompt.slice(userPrompt.indexOf('{')));
}

function teamReport(options = {}) {
  return generateSessionReport(103, { language: 'es', audience: 'coach', refresh: false, ...options });
}

function playerReport(playerId, options = {}) {
  return generateSessionReport(103, {
    language: 'es', audience: 'player', playerId, refresh: false, ...options,
  });
}

function cachedRows() {
  return db.prepare('SELECT player_id, language, audience, prompt_version FROM reports ORDER BY player_id').all();
}

beforeEach(() => {
  db.exec('DELETE FROM reports');
  generateJson.mockReset();
  generateJson.mockImplementation(fakeModel);
});

afterAll(() => {
  db.close();
  fs.rmSync(dbPath, { force: true });
});

describe('informe colectivo (coach): sin cambios de comportamiento', () => {
  it('resumen, destacados y alertas completados desde la base', async () => {
    const report = await teamReport();

    expect(report.audience).toBe('coach');
    expect(report.prompt_version).toBe('session-report-v4');
    expect(report.summary).toBe('Partido exigente para el equipo.');
    expect(report.highlights.map((highlight) => [highlight.player_id, highlight.name])).toEqual([
      [5, 'Santiago Molina'],
      [10, 'Bruno Acosta'],
    ]);
    // Las alertas salen del código: están todas, aunque el modelo comentó solo una.
    expect(report.alerts.map((alert) => alert.player_id)).toEqual([1, 2, 5, 6, 10]);
    expect(report.alerts.find((alert) => alert.player_id === 5).comment).toBe('Controlar su recuperación.');
    expect(report.alerts.find((alert) => alert.player_id === 1).comment).toBeNull();
    expect(report.missing_data.map((missing) => [missing.player_id, missing.metric])).toEqual([
      [9, 'rpe'],
      [9, 'workload_au'],
    ]);
  });

  it('cada destacado trae el nivel más alto de sus alertas, calculado en código', async () => {
    // Sesión 103: el 5 tiene una crítica y advertencias, el 1 solo una advertencia, el 7 ninguna.
    generateJson.mockResolvedValueOnce(JSON.stringify({
      ...TEAM_RESPONSE,
      highlights: [
        { player_id: 5, reason: 'Gran despliegue.' },
        { player_id: 1, reason: 'Buen ritmo.' },
        { player_id: 7, reason: 'Sesión sólida.' },
      ],
    }));

    const report = await teamReport();
    expect(report.highlights.map((highlight) => [highlight.player_id, highlight.alert_level])).toEqual([
      [5, 'critical'],
      [1, 'warning'],
      [7, null],
    ]);
  });

  it('el prompt pide explicar las alertas de un destacado y escribir números con dígitos', async () => {
    await teamReport();
    const { systemInstruction } = generateJson.mock.calls[0][0];
    expect(systemInstruction).toMatch(/destacado aparece en "alerts"/);
    expect(systemInstruction).toMatch(/usá dígitos/);
  });

  it('el modelo recibe a todos los jugadores de la sesión', async () => {
    await teamReport();
    expect(contextSentToModel().players).toHaveLength(12);
  });
});

describe('informe individual (player)', () => {
  it('jugador con datos completos y alertas (5)', async () => {
    const report = await playerReport(5);

    expect(report.audience).toBe('player');
    expect(report.prompt_version).toBe('player-report-v1');
    expect(report.player).toMatchObject({
      player_id: 5, name: 'Santiago Molina', shirt_number: 6, position: 'MF',
      minutes_played: 90, low_minutes: false,
    });
    expect(report.player.metrics.total_distance_m).toBe(10488);
    expect(report.summary).toBe('Hiciste una buena sesión.');
    expect(report.positives).toEqual([{ metric: 'max_speed_kmh', text: 'Mantuviste el ritmo.' }]);
    expect(report.improvements).toEqual([]);
    // Nivel y valor de cada alerta salen del código, no del modelo.
    expect(report.alerts).toContainEqual({
      metric: 'workload_au', value: 810, level: 'critical', threshold: 750,
    });
    expect(report.alert_comment).toBe('Descansá bien y avisá si sentís molestias.');
    expect(report.missing_data).toEqual([]);
  });

  it('el modelo recibe solo los datos del jugador elegido', async () => {
    await playerReport(5);
    const context = contextSentToModel();
    expect(context.players.map((player) => player.player_id)).toEqual([5]);
    expect(context.alerts.every((alert) => alert.player_id === 5)).toBe(true);
  });

  it('jugador sin alertas (7): sin alertas y sin comentario, aunque el modelo lo escriba', async () => {
    const report = await playerReport(7);
    expect(report.alerts).toEqual([]);
    expect(report.alert_comment).toBeNull();
  });

  it('jugador con métricas faltantes (9): null, nunca 0, y listadas como sin dato', async () => {
    const report = await playerReport(9);
    expect(report.player.metrics.rpe).toBeNull();
    expect(report.player.metrics.workload_au).toBeNull();
    expect(report.missing_data).toEqual(['rpe', 'workload_au']);
  });

  it('jugador con pocos minutos (11): low_minutes en la respuesta y en el contexto', async () => {
    const report = await playerReport(11);
    expect(report.player).toMatchObject({ minutes_played: 28, low_minutes: true });
    expect(contextSentToModel().players[0].low_minutes).toBe(true);
  });

  it('jugador que no participó (o no existe) -> 404, sin llamar a la IA', async () => {
    const error = await playerReport(99).catch((thrown) => thrown);
    expect(error).toBeInstanceOf(PlayerNotInSessionError);
    expect(error.status).toBe(404);
    expect(error.message).toBe('El jugador 99 no participó en la sesión 103');
    expect(generateJson).not.toHaveBeenCalled();
  });

  it('sesión inexistente -> null (la ruta responde 404)', async () => {
    const report = await generateSessionReport(999, {
      language: 'es', audience: 'player', playerId: 5, refresh: false,
    });
    expect(report).toBeNull();
  });

  it('una respuesta del modelo con números de otro jugador se rechaza (502)', async () => {
    // 10488 es la distancia del jugador 5; el informe es del 7.
    generateJson.mockResolvedValue(JSON.stringify({
      ...PLAYER_RESPONSE,
      positives: [{ metric: 'total_distance_m', text: 'Recorriste 10488 metros.' }],
      alert_comment: null,
    }));
    await expect(playerReport(7)).rejects.toMatchObject({ status: 502 });
    expect(cachedRows()).toEqual([]); // una respuesta inválida no queda en caché
  });
});

describe('caché', () => {
  it('cada jugador tiene su propia entrada; el mismo jugador se sirve de la caché', async () => {
    await playerReport(5);
    await playerReport(7);
    const again = await playerReport(5);

    expect(generateJson).toHaveBeenCalledTimes(2);
    expect(again.cached).toBe(true);
    expect(again.player.player_id).toBe(5);
    expect(cachedRows().map((row) => row.player_id)).toEqual([5, 7]);
  });

  it('el colectivo se guarda con player_id 0 y no se mezcla con los individuales', async () => {
    await teamReport();
    await playerReport(5);
    const team = await teamReport();

    expect(team.cached).toBe(true);
    expect(team.audience).toBe('coach');
    expect(cachedRows().map((row) => [row.player_id, row.audience])).toEqual([
      [0, 'coach'],
      [5, 'player'],
    ]);
  });

  it('refresh regenera y reemplaza la fila: no se acumulan duplicados (colectivo e individual)', async () => {
    await teamReport();
    await teamReport({ refresh: true });
    await playerReport(5);
    await playerReport(5, { refresh: true });

    expect(generateJson).toHaveBeenCalledTimes(4);
    expect(cachedRows()).toHaveLength(2);
  });

  it('cada idioma es una entrada distinta y el prompt pide ese idioma', async () => {
    const es = await playerReport(5, { language: 'es' });
    const en = await playerReport(5, { language: 'en' });

    expect(generateJson).toHaveBeenCalledTimes(2);
    expect([es.language, en.language]).toEqual(['es', 'en']);
    expect(generateJson.mock.calls[1][0].systemInstruction).toContain('Write the entire report in English.');
  });

  it('un reporte guardado con otra versión del prompt no se reutiliza', async () => {
    await playerReport(5);
    db.prepare("UPDATE reports SET prompt_version = 'player-report-v0'").run();
    const report = await playerReport(5);

    expect(report.cached).toBe(false);
    expect(generateJson).toHaveBeenCalledTimes(2);
  });

  it('un reporte guardado que ya no valida se descarta y se genera otro', async () => {
    await playerReport(7);
    db.prepare("UPDATE reports SET raw_response = 'no es JSON'").run();
    const report = await playerReport(7);

    expect(report.cached).toBe(false);
    expect(generateJson).toHaveBeenCalledTimes(2);
  });
});
