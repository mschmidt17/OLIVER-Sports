import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

// Resolvemos la ruta desde /backend para que funcione sin importar
// desde qué carpeta se ejecute el proceso.
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dbPath = path.resolve(backendDir, process.env.DB_PATH || 'data/oliver.db');

// SQLite crea el archivo, pero no la carpeta que lo contiene.
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// SQLite no valida las claves foráneas salvo que se active explícitamente.
db.pragma('foreign_keys = ON');

export default db;
