-- Shipping a version makes it playable right away at the creator's own link
-- (/try/<preview_token>). Review only decides whether it is listed in the store.
--   play_url  the latest shipped version, played at the creator's link; review never clears it
ALTER TABLE games ADD COLUMN play_url TEXT;
UPDATE games SET play_url = COALESCE(review_url, live_url);
