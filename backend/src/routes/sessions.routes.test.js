import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import data from '../../session_data.json' with { type: 'json' };
import { buildContext } from '../domain/buildContext.js';

// Prueba el contrato HTTP de las rutas de sesiones:
// - GET /sessions y GET /sessions/:id/metrics: datos, filtro, orden y errores.
// - POST /sessions/:id/report: validación del body (400) y jugador fuera de la sesión (404).
// La IA se simula.
vi.mock('../ai/index.js', () => ({
  generateJson: vi.fn(({ userPrompt }) => Promise.resolve(JSON.stringify(
    userPrompt.startsWith('Datos del jugador')
      ? { summary: 'Buena sesión.', positives: [{ metric: 'sprints', text: 'Buen ritmo.' }], improvements: [], alert_comment: null }
      : {
        summary: 'Buena sesión.',
        highlights: [{ player_id: 5, reason: 'Bien.' }, { player_id: 10, reason: 'Bien.' }],
        alerts: [],
      },
  ))),
  currentModelId: () => 'test/model',
}));

// Base temporal con el seed real (ver report.service.test.js).
const dbPath = path.join(os.tmpdir(), `oliver-routes-${process.pid}.db`);
process.env.DB_PATH = dbPath;
await import('../db/seed.js');
const { default: db } = await import('../db/connection.js');
const { default: sessionsRouter } = await import('./sessions.routes.js');
const { ORDERABLE_COLUMNS } = await import('../services/metrics.service.js');

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/sessions', sessionsRouter);
  // Igual que server.js para los errores esperados (expose = true).
  app.use((err, req, res, next) => res.status(err.status ?? 500).json({ error: err.message }));

  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://localhost:${server.address().port}`;
});

afterAll(() => {
  server.close();
  db.close();
  fs.rmSync(dbPath, { force: true });
});

async function postReport(sessionId, body) {
  const response = await fetch(`${baseUrl}/sessions/${sessionId}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function getJson(pathWithQuery) {
  const response = await fetch(baseUrl + pathWithQuery);
  return { status: response.status, body: await response.json() };
}

function playerIds(players) {
  return players.map((player) => player.player_id);
}

// Sesión 103: tiene alertas, un jugador sin RPE ni carga (9) y uno con pocos minutos (11).
const SESSION_ID = 103;
const sessionData = data.sessions.find((session) => session.id === SESSION_ID);

// Regla de orden de la API, escrita aparte del SQL para comprobarlo: los valores
// null van al final en cualquier dirección y, a igual valor, ordena por player_id.
function compareLikeApi(first, second, column, order) {
  const firstValue = first[column];
  const secondValue = second[column];

  if (firstValue == null && secondValue == null) return first.player_id - second.player_id;
  if (firstValue == null) return 1;
  if (secondValue == null) return -1;
  if (firstValue === secondValue) return first.player_id - second.player_id;

  const ascending = firstValue < secondValue ? -1 : 1;
  return order === 'desc' ? -ascending : ascending;
}

// Todas las combinaciones columna + dirección: una columna nueva en
// ORDERABLE_COLUMNS queda cubierta sin escribir otro test.
const ORDER_CASES = ORDERABLE_COLUMNS.flatMap((column) => [[column, 'asc'], [column, 'desc']]);

describe('GET /sessions', () => {
  it('lista las sesiones con id, fecha, título y tipo, ordenadas por fecha', async () => {
    const { status, body } = await getJson('/sessions');

    const expected = data.sessions
      .map(({ id, date, title, type }) => ({ id, date, title, type }))
      .sort((first, second) => first.date.localeCompare(second.date));
    expect(status).toBe(200);
    expect(body).toEqual(expected);
  });
});

describe('GET /sessions/:id/metrics: datos', () => {
  it('devuelve todos los jugadores de la sesión, por player_id, con los valores del JSON', async () => {
    const { status, body } = await getJson(`/sessions/${SESSION_ID}/metrics`);

    const expectedIds = playerIds(sessionData.player_sessions).sort((first, second) => first - second);
    expect(status).toBe(200);
    expect(playerIds(body.players)).toEqual(expectedIds);
    for (const row of sessionData.player_sessions) {
      const { player_id, ...metrics } = row;
      expect(body.players.find((player) => player.player_id === player_id)).toMatchObject(metrics);
    }
  });

  it('incluye la sesión, los umbrales del equipo y las alertas ya calculadas', async () => {
    const { body } = await getJson(`/sessions/${SESSION_ID}/metrics`);

    expect(body.session).toMatchObject({ id: SESSION_ID, duration_min: sessionData.duration_min });
    expect(Object.keys(body.thresholds).sort()).toEqual(Object.keys(data.thresholds).sort());
    expect(body.alerts.length).toBeGreaterThan(0);
  });

  it('un dato faltante llega como null, no como 0 (jugador 9: rpe y carga)', async () => {
    const { body } = await getJson(`/sessions/${SESSION_ID}/metrics?player_id=9`);
    expect(body.players[0]).toMatchObject({ rpe: null, workload_au: null });
  });

  it('marca low_minutes en quien jugó menos de la mitad (jugador 11: 28 de 90)', async () => {
    const { body } = await getJson(`/sessions/${SESSION_ID}/metrics`);
    const lowMinutesIds = body.players.filter((player) => player.low_minutes);
    expect(playerIds(lowMinutesIds)).toEqual([11]);
  });

  it('los valores por minuto de cada jugador son los mismos que recibe la IA', async () => {
    const { body } = await getJson(`/sessions/${SESSION_ID}/metrics`);
    const context = buildContext({
      session: sessionData,
      players: sessionData.player_sessions,
      thresholds: data.thresholds,
    });

    for (const playerContext of context.players) {
      const player = body.players.find((candidate) => candidate.player_id === playerContext.player_id);
      expect(player).toMatchObject(playerContext.per_minute);
    }
  });
});

describe('GET /sessions/:id/metrics: filtro por jugador', () => {
  it('player_id deja solo a ese jugador y sus alertas', async () => {
    const { status, body } = await getJson(`/sessions/${SESSION_ID}/metrics?player_id=5`);

    expect(status).toBe(200);
    expect(playerIds(body.players)).toEqual([5]);
    expect(body.alerts.length).toBeGreaterThan(0);
    expect(body.alerts.every((alert) => alert.player_id === 5)).toBe(true);
  });

  it('un jugador que no participó devuelve la lista vacía (es un filtro, no un recurso)', async () => {
    const { status, body } = await getJson(`/sessions/${SESSION_ID}/metrics?player_id=99`);

    expect(status).toBe(200);
    expect(body.players).toEqual([]);
    expect(body.alerts).toEqual([]);
  });
});

describe('GET /sessions/:id/metrics: orden', () => {
  it.each(ORDER_CASES)('order_by=%s&order=%s', async (column, order) => {
    const { body: unordered } = await getJson(`/sessions/${SESSION_ID}/metrics`);
    const { status, body } = await getJson(`/sessions/${SESSION_ID}/metrics?order_by=${column}&order=${order}`);

    const expected = unordered.players.toSorted((first, second) => compareLikeApi(first, second, column, order));
    expect(status).toBe(200);
    expect(playerIds(body.players)).toEqual(playerIds(expected));
  });

  it('sin dato va al final en las dos direcciones (jugador 9 sin RPE)', async () => {
    for (const order of ['asc', 'desc']) {
      const { body } = await getJson(`/sessions/${SESSION_ID}/metrics?order_by=rpe&order=${order}`);
      expect(body.players.at(-1).player_id).toBe(9);
    }
  });

  it('order_by sin order ordena de menor a mayor', async () => {
    const { body: withoutOrder } = await getJson(`/sessions/${SESSION_ID}/metrics?order_by=sprints`);
    const { body: ascending } = await getJson(`/sessions/${SESSION_ID}/metrics?order_by=sprints&order=asc`);
    expect(playerIds(withoutOrder.players)).toEqual(playerIds(ascending.players));
  });

  it('filtro y orden se combinan', async () => {
    const { status, body } = await getJson(`/sessions/${SESSION_ID}/metrics?player_id=5&order_by=sprints&order=desc`);
    expect(status).toBe(200);
    expect(playerIds(body.players)).toEqual([5]);
  });
});

describe('GET /sessions/:id/metrics: parámetros inválidos', () => {
  it('order_by fuera de la lista blanca -> 400 con las columnas permitidas', async () => {
    const { status, body } = await getJson(`/sessions/${SESSION_ID}/metrics?order_by=goals`);
    expect(status).toBe(400);
    expect(body.error).toBe(`order_by: debe ser una de: ${ORDERABLE_COLUMNS.join(', ')}`);
  });

  it('un intento de inyección SQL en order_by -> 400 y la base queda intacta', async () => {
    const injection = encodeURIComponent('name; DROP TABLE players');
    const { status } = await getJson(`/sessions/${SESSION_ID}/metrics?order_by=${injection}`);
    expect(status).toBe(400);

    const { body } = await getJson(`/sessions/${SESSION_ID}/metrics`);
    expect(body.players).toHaveLength(sessionData.player_sessions.length);
  });

  it('order distinto de asc o desc -> 400', async () => {
    const { status, body } = await getJson(`/sessions/${SESSION_ID}/metrics?order_by=sprints&order=up`);
    expect(status).toBe(400);
    expect(body.error).toBe('order: debe ser asc o desc');
  });

  it('player_id que no es un entero positivo -> 400', async () => {
    for (const playerId of ['abc', '0', '-1', '2.5', '']) {
      const { status, body } = await getJson(`/sessions/${SESSION_ID}/metrics?player_id=${playerId}`);
      expect(status).toBe(400);
      expect(body.error).toMatch(/^player_id: /);
    }
  });

  it('un parámetro repetido -> 400 (no se elige uno al azar)', async () => {
    const { status } = await getJson(`/sessions/${SESSION_ID}/metrics?order_by=sprints&order=asc&order=desc`);
    expect(status).toBe(400);
  });

  it('id de sesión que no es un entero positivo -> 400', async () => {
    const { status, body } = await getJson('/sessions/abc/metrics');
    expect(status).toBe(400);
    expect(body.error).toMatch(/^id: /);
  });

  it('sesión inexistente -> 404', async () => {
    const { status, body } = await getJson('/sessions/999/metrics');
    expect(status).toBe(404);
    expect(body.error).toBe('La sesión 999 no existe');
  });
});

describe('POST /sessions/:id/report: validación del body', () => {
  it('sin audience usa coach (comportamiento por defecto)', async () => {
    const { status, body } = await postReport(103, { language: 'es' });
    expect(status).toBe(200);
    expect(body.audience).toBe('coach');
  });

  it('coach con player_id -> 400', async () => {
    const { status, body } = await postReport(103, { audience: 'coach', player_id: 5 });
    expect(status).toBe(400);
    expect(body.error).toBe('player_id: no corresponde cuando audience es coach (el informe es colectivo)');
  });

  it('player sin player_id -> 400', async () => {
    const { status, body } = await postReport(103, { audience: 'player' });
    expect(status).toBe(400);
    expect(body.error).toBe('player_id: es obligatorio cuando audience es player');
  });

  it('player_id que no es un entero positivo -> 400', async () => {
    for (const playerId of ['5', 0, 2.5, true]) {
      const { status } = await postReport(103, { audience: 'player', player_id: playerId });
      expect(status).toBe(400);
    }
  });

  it('audience desconocida -> 400', async () => {
    const { status, body } = await postReport(103, { audience: 'fan' });
    expect(status).toBe(400);
    expect(body.error).toBe('audience: debe ser uno de: coach, player');
  });
});

describe('POST /sessions/:id/report: informe individual', () => {
  it('player con player_id válido -> 200 con el informe del jugador', async () => {
    const { status, body } = await postReport(103, { language: 'en', audience: 'player', player_id: 5 });
    expect(status).toBe(200);
    expect(body).toMatchObject({ audience: 'player', language: 'en', player: { player_id: 5 } });
  });

  it('jugador que no participó en la sesión -> 404 con mensaje claro', async () => {
    const { status, body } = await postReport(103, { audience: 'player', player_id: 99 });
    expect(status).toBe(404);
    expect(body.error).toBe('El jugador 99 no participó en la sesión 103');
  });

  it('sesión inexistente -> 404', async () => {
    const { status, body } = await postReport(999, { audience: 'player', player_id: 5 });
    expect(status).toBe(404);
    expect(body.error).toBe('La sesión 999 no existe');
  });
});
