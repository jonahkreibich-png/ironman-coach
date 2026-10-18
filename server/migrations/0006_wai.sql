-- Auftrag 16: Verbrauch der kostenlosen KI (Workers AI) je Tag (UTC, wie das Gratis-Kontingent) und Person
CREATE TABLE IF NOT EXISTS wai_usage (
  day TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  questions INTEGER NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0,
  neurons REAL NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  fallbacks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, user_id)
);
