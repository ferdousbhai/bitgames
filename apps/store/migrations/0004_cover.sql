-- Path of the game's cover picture (cover.png/.jpg/.webp), shown on tiles; NULL for an emoji tile.
ALTER TABLE games ADD COLUMN cover TEXT;
