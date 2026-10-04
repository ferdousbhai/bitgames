ALTER TABLE creators ADD COLUMN recovery_hash TEXT;
CREATE UNIQUE INDEX creators_recovery ON creators (recovery_hash);

-- A shipment records the exact allowed files and metadata, independently of the
-- mutable game's latest shipment. Review decisions compare its id atomically.
CREATE TABLE game_versions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  upstream_url TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  info_json TEXT NOT NULL,
  cover TEXT,
  file_count INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'approved', 'rejected', 'withdrawn')),
  review_note TEXT
);
CREATE INDEX game_versions_game ON game_versions(game_id, created_at DESC);
ALTER TABLE games ADD COLUMN play_version TEXT;
ALTER TABLE games ADD COLUMN review_version TEXT;
ALTER TABLE games ADD COLUMN live_version TEXT;

ALTER TABLE games ADD COLUMN revision TEXT NOT NULL DEFAULT '';
UPDATE games SET revision = lower(hex(randomblob(16)));
