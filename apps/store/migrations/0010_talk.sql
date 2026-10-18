-- Talking characters, open to everyone: a device gets a talk pass after a
-- Turnstile check (only a SHA-256 hash of the pass is kept), and replies are
-- counted per UTC day against the pass and the network (a hashed, day-salted
-- address); 'neurons' counts everyone's Workers AI use, in thousandths.

-- An abandoned family sign-in (never deployed) left these empty tables in the
-- production database; nothing uses them.
DROP TABLE IF EXISTS talk_usage;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS kids;
DROP TABLE IF EXISTS households;

CREATE TABLE talk_passes (
  token_hash  TEXT PRIMARY KEY,
  expires_at  INTEGER NOT NULL
);

CREATE TABLE talk_usage (
  day      TEXT NOT NULL,
  who      TEXT NOT NULL,
  amount   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, who)
);
