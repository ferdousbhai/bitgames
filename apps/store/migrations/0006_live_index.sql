-- The store lists live games, newest first.
DROP INDEX IF EXISTS games_public;
CREATE INDEX games_live ON games (live, created_at DESC);
