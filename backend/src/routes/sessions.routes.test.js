import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// Prueba el contrato HTTP de POST /sessions/:id/report: validación del body (400)
// y jugador fuera de la sesión (404). La IA se simula.
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
