-- Datenbank für Ironman Coach. Kann mehrfach ausgeführt werden.

-- Geräte: nur der SHA-256-Hash des Geräte-Schlüssels wird gespeichert
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen INTEGER
);

-- Kopplungscodes, 10 Minuten gültig, einmal verwendbar
CREATE TABLE IF NOT EXISTS pair_codes (
  code_hash TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Fehlversuche beim Koppeln (Schutz gegen Raten)
CREATE TABLE IF NOT EXISTS pair_attempts (
  ts INTEGER NOT NULL
);

-- Ein Datensatz pro Session, Trend-Tag, Ernährungstag usw.
-- rev steigt bei jeder Änderung, damit Geräte nur Neues abholen.
CREATE TABLE IF NOT EXISTS records (
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  data TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL,
  PRIMARY KEY (kind, key)
);
CREATE INDEX IF NOT EXISTS records_rev ON records (rev);

-- Zähler für rev
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT
);
INSERT OR IGNORE INTO meta (k, v) VALUES ('rev', '0');

-- Tägliche Sicherung des kompletten Stands
CREATE TABLE IF NOT EXISTS backups (
  day TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  data TEXT NOT NULL
);

-- Push-Mitteilungen (Phase 5)
CREATE TABLE IF NOT EXISTS push_subs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS push_log (
  key TEXT NOT NULL,
  day TEXT NOT NULL,
  type TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (day, key)
);
CREATE TABLE IF NOT EXISTS push_queue (
  key TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- Schlankes Fehlerprotokoll (App und Server). Nur Meldung, Stelle, Version, Ansicht. Keine Gesundheitsdaten.
CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  source TEXT NOT NULL,
  msg TEXT NOT NULL,
  place TEXT,
  version TEXT,
  view TEXT
);
