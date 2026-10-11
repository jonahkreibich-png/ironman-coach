-- Mehrbenutzer-Fähigkeit: jeder Datensatz gehört einem Nutzer. Der bisherige einzige Nutzer wird Nutzer 1.
-- Vorher immer ein Backup ziehen (scripts/db-backup) und die Migration an einer Kopie testen.

-- Nutzer. features: Freischaltungen pro Nutzer (z. B. {"ai": true}) für spätere Bezahlfunktionen.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  features TEXT NOT NULL DEFAULT '{}',
  invited_by INTEGER,
  created_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO users (id, name, role, features, created_at) VALUES (1, 'Nutzer 1', 'admin', '{}', CAST(strftime('%s', 'now') AS INTEGER) * 1000);

-- Einladungscodes für Tester (nur der Admin erzeugt sie). Ohne Code keine Registrierung.
CREATE TABLE IF NOT EXISTS invites (
  code_hash TEXT PRIMARY KEY,
  created_by INTEGER NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by INTEGER,
  used_at INTEGER
);

-- Geräte und Kopplungscodes gehören einem Nutzer
ALTER TABLE devices ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS devices_user ON devices (user_id);
ALTER TABLE pair_codes ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;

-- Datensätze: Primärschlüssel jetzt (user_id, kind, key)
CREATE TABLE records_v2 (
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  data TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL,
  src TEXT,
  PRIMARY KEY (user_id, kind, key)
);
INSERT INTO records_v2 (user_id, kind, key, data, updated_at, deleted, rev) SELECT 1, kind, key, data, updated_at, deleted, rev FROM records;
DROP TABLE records;
ALTER TABLE records_v2 RENAME TO records;
CREATE INDEX IF NOT EXISTS records_user_rev ON records (user_id, rev);

-- Backups pro Nutzer
CREATE TABLE backups_v2 (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);
INSERT INTO backups_v2 (user_id, day, created_at, data) SELECT 1, day, created_at, data FROM backups;
DROP TABLE backups;
ALTER TABLE backups_v2 RENAME TO backups;

-- Werte pro Nutzer (letzter Abruf, Zeitstempel der Läufe usw.). meta bleibt für Globales (rev).
CREATE TABLE IF NOT EXISTS user_meta (
  user_id INTEGER NOT NULL,
  k TEXT NOT NULL,
  v TEXT,
  PRIMARY KEY (user_id, k)
);
INSERT OR IGNORE INTO user_meta (user_id, k, v) SELECT 1, k, v FROM meta WHERE k <> 'rev';
DELETE FROM meta WHERE k <> 'rev';

-- Push pro Nutzer
ALTER TABLE push_subs ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;
CREATE TABLE push_log_v2 (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  day TEXT NOT NULL,
  type TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day, key)
);
INSERT INTO push_log_v2 (user_id, key, day, type, sent_at) SELECT 1, key, day, type, sent_at FROM push_log;
DROP TABLE push_log;
ALTER TABLE push_log_v2 RENAME TO push_log;
CREATE TABLE push_queue_v2 (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
INSERT INTO push_queue_v2 (user_id, key, type, payload, created_at) SELECT 1, key, type, payload, created_at FROM push_queue;
DROP TABLE push_queue;
ALTER TABLE push_queue_v2 RENAME TO push_queue;

-- Verbindungen zu Diensten (OAuth). Tokens nur verschlüsselt (Schlüssel TOKEN_KEY als Cloudflare-Secret).
CREATE TABLE IF NOT EXISTS connections (
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  token_enc TEXT,
  expires_at INTEGER,
  scope TEXT,
  account TEXT,
  cursor TEXT,
  last_sync_at INTEGER,
  last_ok_at INTEGER,
  last_error TEXT,
  stats TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider)
);
-- Für Webhooks: welcher Nutzer gehört zu welchem Konto beim Dienst
CREATE INDEX IF NOT EXISTS connections_account ON connections (provider, account);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  verifier TEXT,
  return_to TEXT,
  created_at INTEGER NOT NULL
);

-- Widerrufbare Schlüssel für den iPhone-Kurzbefehl (nur Hash gespeichert)
CREATE TABLE IF NOT EXISTS ingest_keys (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at INTEGER NOT NULL,
  last_used INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0
);

-- Große Rohdaten (Verläufe aus .fit-Dateien), werden nicht an alle Geräte synchronisiert, sondern bei Bedarf geladen
CREATE TABLE IF NOT EXISTS blobs (
  user_id INTEGER NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Verbrauch des KI-Coachs pro Nutzer und Tag (für Budget und Anzeige)
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  messages INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_micro INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE error_log ADD COLUMN user_id INTEGER;
