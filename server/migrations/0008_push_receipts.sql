-- Auftrag 33: Mitteilungen bis aufs Gerät nachverfolgen. Bisher war nur bekannt, ob Apple bzw. Google eine Mitteilung angenommen hat,
-- nicht, ob sie auf dem Gerät angekommen ist. Je Mitteilung und Gerät: gesendet, Antwort des Push-Dienstes (angenommen?) und die
-- Empfangsbestätigung des Service Workers (received_at). token: zufälliger Empfangs-Schlüssel, den nur diese Mitteilung enthält
-- (der Service Worker hat keinen Geräte-Schlüssel). Keine Inhalte der Mitteilung.
CREATE TABLE IF NOT EXISTS push_deliveries (
  user_id INTEGER NOT NULL,
  mid TEXT NOT NULL,
  device_id TEXT NOT NULL,
  day TEXT NOT NULL,
  type TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  status INTEGER,
  accepted INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  token TEXT NOT NULL,
  received_at INTEGER,
  PRIMARY KEY (user_id, mid, device_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS push_deliveries_token ON push_deliveries (token);
CREATE INDEX IF NOT EXISTS push_deliveries_day ON push_deliveries (user_id, day);
-- Kennung der Mitteilung im Protokoll (Tag|Schlüssel bzw. Test-Kennung)
ALTER TABLE push_log ADD COLUMN mid TEXT;
-- fällig, aber nicht verschickt (Ruhezeit, Tageslimit): steht im Protokoll als „geplant“, zählt nicht zum Tageslimit
ALTER TABLE push_log ADD COLUMN skipped TEXT;
-- verworfene Anmeldung: Ende der Adresse (die App erkennt so, ob ihre Anmeldung die verworfene ist) und Grund „ersetzt“
ALTER TABLE push_gone ADD COLUMN end_tail TEXT;
