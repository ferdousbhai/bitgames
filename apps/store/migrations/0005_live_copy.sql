-- Published games get a separate live copy of their files (live/<id>/...), so a
-- creator can keep editing the draft (games/<id>/...) while the approved version
-- stays playable. `status` now describes the draft; `live` says whether a
-- reviewed version is in the store.
ALTER TABLE games ADD COLUMN live INTEGER NOT NULL DEFAULT 0;
-- Title/tagline/etc. changes to a live game wait here until they are reviewed.
ALTER TABLE games ADD COLUMN pending_info TEXT;
UPDATE games SET live = 1 WHERE status = 'public';
