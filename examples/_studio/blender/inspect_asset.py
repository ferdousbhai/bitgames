"""Render one shipped toy through Blender CLI into a temporary review directory.

blender --background --python-exit-code 1 --python examples/_studio/blender/inspect_asset.py -- <toybox.glb> <toy-name> /tmp/<render.png>
"""
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
if len(args) != 3:
    raise ValueError('Expected a GLB path, toy name and temporary PNG output path')
asset, name, destination = args
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(Path(asset).resolve()))
root = bpy.data.objects.get(name)
if root is None:
    raise ValueError(f'Missing toy: {name}')
visible = {root, *root.children_recursive}
for obj in bpy.context.scene.objects:
    obj.hide_render = obj not in visible
corners = [obj.matrix_world @ Vector(corner) for obj in visible if obj.type == 'MESH' for corner in obj.bound_box]
if not corners:
    raise ValueError(f'Toy has no mesh: {name}')
low = Vector([min(point[i] for point in corners) for i in range(3)])
high = Vector([max(point[i] for point in corners) for i in range(3)])
center = (low + high) / 2
span = max(high - low)
bpy.ops.object.camera_add(location=center + Vector((2, -4, 2)) * span)
camera = bpy.context.object
camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = span * 1.5
scene = bpy.context.scene
scene.camera = camera
for offset, power in [((2, -3, 4), 400), ((-3, -1, 2), 250)]:
    bpy.ops.object.light_add(type='AREA', location=center + Vector(offset) * span)
    light = bpy.context.object
    light.data.energy = power * span * span
    light.data.size = span * 3
    light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
scene.world.color = (.7, .7, .7)
scene.render.engine = 'CYCLES'
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.render.threads_mode = 'FIXED'
scene.render.threads = 8
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(Path(destination).resolve())
Path(destination).parent.mkdir(parents=True, exist_ok=True)
bpy.ops.render.render(write_still=True)
print(json.dumps({'toy': name, 'bounds': [list(low), list(high)], 'render': destination}))
