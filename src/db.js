/**
 * db.js — base de datos SQLite (better-sqlite3, síncrono) para venta-fichas.
 *
 * Reemplaza el guardado en archivos JSON. Cada "store" sigue exponiendo la MISMA API
 * (load/save/etc.); solo cambia que internamente leen/escriben acá en vez de en disco JSON.
 *
 * Ubicación del archivo:
 *   - DB_PATH (env) si está definido, si no → data/store.sqlite (relativo a la raíz del proyecto).
 *   - En Railway: montar un VOLUME en /app/data para que el archivo persista entre redeploys.
 *
 * Las escrituras de cada store son transaccionales (atómicas): nunca queda la DB a medias.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'store.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // mejor concurrencia + durabilidad
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS systems (
    id          TEXT PRIMARY KEY,
    name        TEXT,
    url         TEXT,
    user        TEXT,
    password    TEXT,
    createdAt   TEXT,
    lastLoginAt TEXT,
    lastLoginOk INTEGER,
    ord         INTEGER
  );
  CREATE TABLE IF NOT EXISTS clientes (
    id            TEXT PRIMARY KEY,
    codigo        TEXT,
    nombreVisible TEXT,
    createdAt     TEXT,
    telegram      TEXT,   -- JSON { chatId, enabled }
    cajas         TEXT,   -- JSON [ {id,usuario,sistema,userId,divisas,montosRapidos,grupoId,notas}, ... ]
    ord           INTEGER
  );
  CREATE TABLE IF NOT EXISTS pedidos (
    id   TEXT PRIMARY KEY,
    data TEXT,            -- JSON del pedido completo
    ord  INTEGER
  );
  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS push_subs (
    endpoint  TEXT PRIMARY KEY,   -- endpoint de la suscripción (único por navegador/dispositivo)
    sub       TEXT,               -- JSON de la PushSubscription completa
    createdAt TEXT
  );
`);

module.exports = { db, DB_PATH };
