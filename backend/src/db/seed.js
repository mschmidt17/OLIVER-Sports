import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './connection.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(currentDir, 'schema.sql');
const dataPath = path.resolve(currentDir, '../../session_data.json');

function readSessionData() {
  return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
}

function createTables() {
  db.exec(fs.readFileSync(schemaPath, 'utf-8'));
}

function insertTeam(team) {
  db.prepare('INSERT INTO teams (id, name, sport) VALUES (?, ?, ?)')
    .run(team.id, team.name, team.sport);
}

function insertPlayers(players, teamId) {
  const insert = db.prepare(`
    INSERT INTO players (id, team_id, name, position, shirt_number)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const player of players) {
    insert.run(player.id, teamId, player.name, player.position, player.shirt_number);
  }
}

function insertSessions(sessions, teamId) {
  const insertSession = db.prepare(`
    INSERT INTO sessions (id, team_id, date, title, type, duration_min)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  // Parámetros con nombre: cada fila del JSON ya tiene esas claves.
  const insertPlayerSession = db.prepare(`
    INSERT INTO player_sessions (
      session_id, player_id, minutes_played, total_distance_m,
      high_speed_running_m, sprints, max_speed_kmh, accelerations,
      rpe, workload_au
    ) VALUES (
      @session_id, @player_id, @minutes_played, @total_distance_m,
      @high_speed_running_m, @sprints, @max_speed_kmh, @accelerations,
      @rpe, @workload_au
    )
  `);

  for (const session of sessions) {
    insertSession.run(session.id, teamId, session.date, session.title, session.type, session.duration_min);
    for (const row of session.player_sessions) {
      insertPlayerSession.run({ session_id: session.id, ...row });
    }
  }
}

function insertThresholds(thresholds, teamId) {
  const insert = db.prepare(`
    INSERT INTO thresholds (team_id, metric, warning, critical)
    VALUES (?, ?, ?, ?)
  `);
  for (const [metric, limits] of Object.entries(thresholds)) {
    // ?? null: si el JSON no trae critical, se guarda NULL (no undefined).
    insert.run(teamId, metric, limits.warning, limits.critical ?? null);
  }
}

function seed() {
  const data = readSessionData();
  const teamId = data.team.id;

  // Todo en una transacción, incluida la creación de tablas (en SQLite es
  // transaccional): si algo falla, la base queda como estaba.
  const loadAll = db.transaction(() => {
    createTables();
    insertTeam(data.team);
    insertPlayers(data.players, teamId);
    insertSessions(data.sessions, teamId);
    insertThresholds(data.thresholds, teamId);
  });
  loadAll();

  const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  console.log('Seed OK:', {
    teams: count('teams'),
    players: count('players'),
    sessions: count('sessions'),
    player_sessions: count('player_sessions'),
    thresholds: count('thresholds'),
  });
}

seed();
