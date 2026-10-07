"""The colour workshop's tablecloth: Poly Haven's CC0 Gingham Check, recoloured lavender and cream.
blender --background --python-exit-code 1 --python examples/paint-splash/blender/tablecloth.py

The woven gingham's brightness picks a colour between the game's lavender and a warm cream, so the
cloth matches Paint Splash's purple and stays soft enough not to compete with the mixed paints.
"""
from pathlib import Path

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'assets' / 'gingham_check_diffuse_512.jpg'
OUTPUT = HERE.parent / 'public' / 'models' / 'tablecloth.jpg'
DARK = np.array([0.80, 0.70, 0.95])  # lavender checks (display values)
LIGHT = np.array([1.0, 0.97, 0.91])  # cream


source = bpy.data.images.load(str(SOURCE))
source.colorspace_settings.name = 'Non-Color'  # read the stored bytes as they are
width, height = source.size
pixels = np.array(source.pixels[:], dtype=np.float32).reshape(height, width, 4)
brightness = pixels[..., :3] @ np.array([0.2126, 0.7152, 0.0722])
amount = np.clip((brightness - 0.12) / (0.62 - 0.12), 0, 1)[..., None]
colour = DARK + (LIGHT - DARK) * amount

out = bpy.data.images.new('tablecloth', width, height)
out.colorspace_settings.name = 'Non-Color'
out.pixels[:] = np.concatenate([colour, np.ones((height, width, 1))], axis=2).astype(np.float32).ravel()
out.filepath_raw = str(OUTPUT)
out.file_format = 'JPEG'
scene = bpy.context.scene
scene.render.image_settings.quality = 86
out.save(filepath=str(OUTPUT), quality=86)
print('Tablecloth written:', OUTPUT, flush=True)
