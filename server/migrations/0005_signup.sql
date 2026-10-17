-- Auftrag 15: Konto ohne Einladung (beim ersten „Verbinden“). Nur Zeitpunkt und gehashte Adresse für die Grenzen gegen Missbrauch.
CREATE TABLE IF NOT EXISTS signups (
  ts INTEGER NOT NULL,
  ip_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS signups_ts ON signups (ts);
