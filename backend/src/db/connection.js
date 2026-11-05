import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';

// Las rutas se resuelven desde /backend para que funcione sin importar
// desde qué carpeta se ejecute el proceso.
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Único lugar donde se carga backend/.env. Todo módulo que usa la base
// (server, seed) pasa por acá antes de leer process.env.
dotenv.config({ path: path.join(backendDir, '.env'), quiet: true });

const dbPath = path.resolve(backendDir, process.env.DB_PATH || 'data/oliver.db');

// SQLite crea el archivo, pero no la carpeta que lo contiene.
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// SQLite no valida las claves foráneas salvo que se active explícitamente.
db.pragma('foreign_keys = ON');

export default db;
