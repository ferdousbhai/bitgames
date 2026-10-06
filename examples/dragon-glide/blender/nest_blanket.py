"""
The cosy gingham blanket lining the dragon family's nest.

Source: Poly Haven "Fabric Pattern 07" by Rob Tuytel (CC0), colour map variant col_03 at 1k,
https://polyhaven.com/a/fabric_pattern_07, kept in assets/fabric_pattern_07_col_03_1k.jpg.
Its brightness is mapped onto a raspberry-to-cream ramp so it matches the toy palette, and it is
written at 512px to ../public/models/nest-blanket.jpg. The game (public/js/models.js) gives the
nest's lining (material nest_inside) top-down UVs and puts this texture on it.

Run with:   blender --background --python nest_blanket.py
"""
import os

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "assets", "fabric_pattern_07_col_03_1k.jpg")
OUT = os.path.join(HERE, "..", "public", "models", "nest-blanket.jpg")
SIZE = 512
DARK = (0.80, 0.24, 0.46)  # raspberry threads (sRGB 0-1)
LIGHT = (1.0, 0.95, 0.96)  # cream threads

img = bpy.data.images.load(SRC)
img.scale(SIZE, SIZE)
px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
# images load as linear floats; work in sRGB-ish brightness so the ramp reads as painted
lum = (px[:, 0] * 0.2126 + px[:, 1] * 0.7152 + px[:, 2] * 0.0722) ** (1 / 2.2)
lo, hi = np.percentile(lum, 4), np.percentile(lum, 96)
t = np.clip((lum - lo) / max(hi - lo, 1e-4), 0, 1)
t = t * t * (3 - 2 * t)  # firmer checks
for c in range(3):
    srgb = DARK[c] + (LIGHT[c] - DARK[c]) * t
    px[:, c] = srgb ** 2.2  # back to linear for saving
px[:, 3] = 1
out = bpy.data.images.new("nest_blanket", SIZE, SIZE)
out.pixels[:] = px.ravel()
out.filepath_raw = OUT
out.file_format = "JPEG"
bpy.context.scene.render.image_settings.quality = 82
out.save()
print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes)")
