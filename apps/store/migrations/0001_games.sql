CREATE TABLE games (
  id          TEXT PRIMARY KEY,               -- url slug, e.g. "balloon-pop"
  title       TEXT NOT NULL,
  tagline     TEXT NOT NULL,                  -- one short sentence a child can read
  how_to_play TEXT NOT NULL,
  emoji       TEXT NOT NULL,
  color       TEXT NOT NULL,                  -- tile colour, hex
  category    TEXT NOT NULL,
  together    INTEGER NOT NULL DEFAULT 0,     -- 1 when it can be played with others
  entry       TEXT NOT NULL DEFAULT 'index.html',
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'public')),
  featured    INTEGER NOT NULL DEFAULT 0,
  plays       INTEGER NOT NULL DEFAULT 0,
  likes       INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX games_public ON games (status, created_at DESC);
