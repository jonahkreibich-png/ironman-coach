-- Auftrag 5: Posteingang für Meldungen (Status, Antwort, Screenshot, freigegebene Daten), Konto-Wiederherstellung,
-- Löschfristen für Backups. Nur neue Spalten und Tabellen, bestehende Daten bleiben unverändert.
ALTER TABLE feedback ADD COLUMN status TEXT NOT NULL DEFAULT 'neu';      -- 'neu' | 'arbeit' | 'erledigt'
ALTER TABLE feedback ADD COLUMN screenshot TEXT;                          -- verkleinertes Bild (data:image/jpeg;base64,…)
ALTER TABLE feedback ADD COLUMN shared TEXT;                              -- vom Nutzer für diese Meldung freigegebene Trainingsdaten (JSON)
ALTER TABLE feedback ADD COLUMN reply TEXT;
ALTER TABLE feedback ADD COLUMN reply_at INTEGER;
ALTER TABLE feedback ADD COLUMN reply_seen INTEGER NOT NULL DEFAULT 0;
UPDATE feedback SET status = 'erledigt' WHERE done = 1;
CREATE INDEX IF NOT EXISTS feedback_user ON feedback (user_id);
-- Wiederherstellungscode je Nutzer (nur der Hash), damit ein verlorenes Gerät nicht das Konto kostet
CREATE TABLE IF NOT EXISTS recovery (
  user_id INTEGER PRIMARY KEY,
  code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- Gelöschte Konten: Backups werden nach Frist endgültig entfernt (nur Nutzer-Nummer und Zeitpunkt)
CREATE TABLE IF NOT EXISTS deleted_users (
  user_id INTEGER PRIMARY KEY,
  deleted_at INTEGER NOT NULL,
  purge_after INTEGER NOT NULL
);
-- App-Version je Gerät (für den Betreiber: welche Version ein Tester gerade nutzt)
ALTER TABLE devices ADD COLUMN version TEXT;
