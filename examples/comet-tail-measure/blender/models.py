"""Rebuild this adventure with Blender's CLI from any working directory."""
import runpy, sys
from pathlib import Path
sys.argv = ['models.py', '--', 'comet-tail-measure']
runpy.run_path(str(Path(__file__).resolve().parents[2] / '_studio' / 'blender' / 'build_assets.py'), run_name='__main__')
