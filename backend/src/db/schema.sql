-- Se borra todo antes de crear: así el seed se puede correr varias veces.
-- Orden inverso a las dependencias (primero las tablas hijas).
DROP TABLE IF EXISTS player_sessions;
DROP TABLE IF EXISTS thresholds;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS teams;

CREATE TABLE teams (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  sport TEXT NOT NULL
);

CREATE TABLE players (
  id           INTEGER PRIMARY KEY,
  team_id      INTEGER NOT NULL REFERENCES teams(id),
  name         TEXT NOT NULL,
  position     TEXT NOT NULL,
  shirt_number INTEGER NOT NULL
);

CREATE TABLE sessions (
  id           INTEGER PRIMARY KEY,
  team_id      INTEGER NOT NULL REFERENCES teams(id),
  date         TEXT NOT NULL,  -- formato ISO: YYYY-MM-DD
  title        TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('training', 'match')),
  duration_min INTEGER NOT NULL
);

-- Una fila por jugador por sesión.
-- rpe y workload_au pueden ser NULL (el jugador no reportó el esfuerzo).
CREATE TABLE player_sessions (
  session_id           INTEGER NOT NULL REFERENCES sessions(id),
  player_id            INTEGER NOT NULL REFERENCES players(id),
  minutes_played       INTEGER NOT NULL,
  total_distance_m     INTEGER NOT NULL,
  high_speed_running_m INTEGER NOT NULL,
  sprints              INTEGER NOT NULL,
  max_speed_kmh        REAL    NOT NULL,
  accelerations        INTEGER NOT NULL,
  rpe                  INTEGER,
  workload_au          INTEGER,
  PRIMARY KEY (session_id, player_id)
);

-- critical es NULL salvo para workload_au.
CREATE TABLE thresholds (
  team_id  INTEGER NOT NULL REFERENCES teams(id),
  metric   TEXT NOT NULL,
  warning  REAL NOT NULL,
  critical REAL,
  PRIMARY KEY (team_id, metric)
);
