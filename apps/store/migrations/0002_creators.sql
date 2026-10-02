-- Grown-up creators who connect an AI agent through the MCP server.
-- Only a SHA-256 hash of each creator key is stored.
CREATE TABLE creators (
  id          TEXT PRIMARY KEY,
  key_hash    TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0
);

-- One-time upload URLs for binary game files (models, images, sounds).
CREATE TABLE uploads (
  token_hash  TEXT PRIMARY KEY,
  game_id     TEXT NOT NULL,
  path        TEXT NOT NULL,
  expires_at  INTEGER NOT NULL
);

-- Rebuild games to add ownership, private previews and the review states.
-- A game is only shown to children once an admin moves it to 'public'.
PRAGMA defer_foreign_keys = true;

CREATE TABLE games_new (
  id            TEXT PRIMARY KEY,
  creator_id    TEXT REFERENCES creators (id),   -- NULL for games made by BitGames
  title         TEXT NOT NULL,
  tagline       TEXT NOT NULL,
  how_to_play   TEXT NOT NULL,
  emoji         TEXT NOT NULL,
  color         TEXT NOT NULL,
  category      TEXT NOT NULL,
  together      INTEGER NOT NULL DEFAULT 0,
  entry         TEXT NOT NULL DEFAULT 'index.html',
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'public', 'rejected')),
  review_note   TEXT,
  preview_token TEXT NOT NULL UNIQUE,
  featured      INTEGER NOT NULL DEFAULT 0,
  plays         INTEGER NOT NULL DEFAULT 0,
  likes         INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

INSERT INTO games_new (id, title, tagline, how_to_play, emoji, color, category, together, entry, status,
                       preview_token, featured, plays, likes, created_at, updated_at)
SELECT id, title, tagline, how_to_play, emoji, color, category, together, entry, status,
       lower(hex(randomblob(16))), featured, plays, likes, created_at, updated_at
  FROM games;

DROP TABLE games;
ALTER TABLE games_new RENAME TO games;

CREATE INDEX games_public ON games (status, created_at DESC);
CREATE INDEX games_creator ON games (creator_id);
