-- Auftrag 31: Mitteilungen ehrlich nachverfolgen. Bisher galt jede Mitteilung als „gesendet“, auch wenn Apple sie abgelehnt hat,
-- und die Antwort des Push-Dienstes wurde nirgends gespeichert.
-- Je Anmeldung (Gerät): letzte Antwort (HTTP-Status, Grund), letzte erfolgreiche Zustellung, Fehler in Folge.
ALTER TABLE push_subs ADD COLUMN last_status INTEGER;
ALTER TABLE push_subs ADD COLUMN last_at INTEGER;
ALTER TABLE push_subs ADD COLUMN last_ok_at INTEGER;
ALTER TABLE push_subs ADD COLUMN fails INTEGER NOT NULL DEFAULT 0;
ALTER TABLE push_subs ADD COLUMN last_error TEXT;
-- Je Mitteilung: an wie viele Geräte sie wirklich zugestellt wurde (Push-Dienst hat angenommen)
ALTER TABLE push_log ADD COLUMN delivered INTEGER;
-- Abgelaufene Anmeldungen (404/410 bzw. falscher Schlüssel): das Gerät bekommt beim nächsten Öffnen „nicht aktiv – erneut erlauben“
CREATE TABLE IF NOT EXISTS push_gone (
  user_id INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  status INTEGER,
  reason TEXT,
  PRIMARY KEY (user_id, device_id)
);
