-- Games now run on their creators' own Cloudflare accounts. BitGames keeps the
-- catalog and pins the exact Worker version that was reviewed:
--   live_url / live_manifest     the approved version children play, and the
--                                SHA-256 of its bitgames.json file list
--   review_url / review_manifest a submitted version waiting for review
--   verified_at                  when the live version's files were last re-checked
-- `cover` is the cover picture's path inside the version, or NULL.
ALTER TABLE games ADD COLUMN live_url TEXT;
ALTER TABLE games ADD COLUMN live_manifest TEXT;
ALTER TABLE games ADD COLUMN review_url TEXT;
ALTER TABLE games ADD COLUMN review_manifest TEXT;
ALTER TABLE games ADD COLUMN review_cover TEXT;
ALTER TABLE games ADD COLUMN verified_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE games DROP COLUMN bytes;
DROP TABLE uploads;
-- Files hosted by BitGames are gone, so nothing is live until a version is approved.
UPDATE games SET live = 0, status = 'draft', cover = NULL;
