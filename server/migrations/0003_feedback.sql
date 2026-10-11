-- Auftrag 4: Meldungen von Testern („Fehler melden / Idee“) und Kennzeichnung von Test-Nutzern.
-- Nur neue Tabelle und eine neue Spalte, bestehende Daten bleiben unverändert.
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,          -- 'bug' | 'idea'
  text TEXT NOT NULL,
  screen TEXT,
  version TEXT,
  device TEXT,
  errors TEXT,                 -- letzte Fehlermeldungen der App (JSON, ohne Gesundheitsdaten)
  done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS feedback_at ON feedback (at);
ALTER TABLE users ADD COLUMN test INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invites ADD COLUMN test INTEGER NOT NULL DEFAULT 0;
