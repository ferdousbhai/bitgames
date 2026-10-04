"""
Bakes the play mat's felt texture: the plaid of Poly Haven's "Curly Teddy Checkered"
(CC0, by Rico Cilliers and colormass, https://polyhaven.com/a/curly_teddy_checkered)
recoloured to the mat's teal, so the rug reads as a soft checked blanket.

Only the light and dark of the photo is kept; the colour comes from the felt's #4fc6b8.
The game (main.js) tiles it across the felt with world-sized UVs.

Run with:  python3 mat_texture.py   (needs Pillow and numpy; writes ../public/models/mat_felt.jpg)
"""
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
SRC = HERE / "assets" / "curly_teddy_checkered_diff_1k.jpg"
OUT = HERE.parent / "public" / "models" / "mat_felt.jpg"
TEAL = "#4fc6b8"
CONTRAST = 0.55  # 1 keeps the photo's full light and dark; lower is calmer behind the cards
SIZE = (512, 432)  # the photo's 1024 x 864 aspect (0.56 m x 0.47 m)


def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.clip(c, 0, None), 1 / 2.4) - 0.055)


img = Image.open(SRC).convert("RGB").resize(SIZE, Image.LANCZOS)
lin = to_linear(np.asarray(img, dtype=np.float64) / 255)
lum = lin @ np.array([0.2126, 0.7152, 0.0722])
factor = 1 + (lum / lum.mean() - 1) * CONTRAST
teal = to_linear(np.array([int(TEAL[i : i + 2], 16) for i in (1, 3, 5)]) / 255)
out = to_srgb(np.clip(teal * factor[..., None], 0, 1))
Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(OUT, quality=88, optimize=True)
print(OUT, OUT.stat().st_size, "bytes; factor range", factor.min().round(2), factor.max().round(2))
