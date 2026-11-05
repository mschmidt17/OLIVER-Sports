import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

// Resolvemos la ruta desde /backend para que funcione sin importar
// desde qué carpeta se ejecute el proceso.
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dbPath = path.resolve(backendDir, process.env.DB_PATH || 'oliver.db');

const db = new Database(dbPath);

// SQLite no valida las claves foráneas salvo que se active explícitamente.
db.pragma('foreign_keys = ON');

export default db;
