// src/db.js
// Database layer: schema creation + connection.
// Uses Node's built-in `node:sqlite` module (experimental, but avoids native
// compilation issues with better-sqlite3 in restricted build environments).

const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const DB_PATH = process.env.KUDOS_DB_PATH || path.join(__dirname, "..", "kudos.db");

function createDatabase(dbPath = DB_PATH) {
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS kudos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL REFERENCES users(id),
      recipient_id INTEGER NOT NULL REFERENCES users(id),
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_visible INTEGER NOT NULL DEFAULT 1,
      moderated_by INTEGER REFERENCES users(id),
      moderated_at TEXT,
      reason_for_moderation TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_kudos_visible_created
      ON kudos (is_visible, created_at);

    CREATE INDEX IF NOT EXISTS idx_kudos_dup_check
      ON kudos (sender_id, recipient_id, created_at);
  `);

  return db;
}

module.exports = { createDatabase, DB_PATH };
