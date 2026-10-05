"""Build the original games' workshop props using the maintained Blender toy library.
blender --background --python-exit-code 1 --python examples/_studio/blender/build_workshops.py
"""
import runpy
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Run as a library (not as __main__), so only the toy prototypes are built.
library = runpy.run_path(str(HERE / 'build_assets.py'))
kit = [library['prototypes'][name] for name in ['bottle', 'cup']]
for toy in kit:
    library['show'](toy, True)
library['select_only'](kit)
output = HERE.parents[1] / 'paint-splash' / 'public' / 'models' / 'colour-kit.glb'
library['export_selected'](output)
print('Workshop kit built:', output, flush=True)
