-- Total size of each game's files, kept up to date on every write, so the
-- per-creator storage cap can be checked without listing every game in R2.
ALTER TABLE games ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0;
