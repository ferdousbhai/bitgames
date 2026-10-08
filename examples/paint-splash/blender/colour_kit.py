"""Rebuild Paint Splash's bottle and cup without the retired toy library.

blender --background --threads 8 --python-exit-code 1 --python examples/paint-splash/blender/colour_kit.py
For inspection only, append: -- --output /tmp/colour-kit.glb
The geometry and palette are retained from the original workshop builder.
"""
import argparse
import math
import sys
from pathlib import Path

import bpy

WHITE = '#fff5df'
PINK = '#f4a7b9'
BLUE = '#8bbddf'
materials = {}


def material(colour):
    if colour not in materials:
        value = colour.lstrip('#')
        rgb = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        rgb = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
        mat = bpy.data.materials.new(colour)
        mat.diffuse_color = (*rgb, 1)
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*rgb, 1)
        shader.inputs['Roughness'].default_value = .38
        materials[colour] = mat
    return materials[colour]


def modifier(obj, name, kind, **settings):
    mod = obj.modifiers.new(name, kind)
    for key, value in settings.items():
        setattr(mod, key, value)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def cone(location, radius, depth, colour, top, vertices=24, fill='NGON'):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=top,
                                    depth=depth, location=location, end_fill_type=fill)
    obj = bpy.context.object
    obj.data.materials.append(material(colour))
    if fill != 'NOTHING':
        for face in obj.data.polygons:
            face.use_smooth = True
    return obj


def ring(location, radius, thickness, colour):
    bpy.ops.mesh.primitive_torus_add(major_segments=24, minor_segments=8,
                                    location=location, major_radius=radius, minor_radius=thickness)
    obj = bpy.context.object
    obj.data.materials.append(material(colour))
    return obj


def bottle():
    cone((0, 0, .3), .14, .5, BLUE, .14)
    cone((0, 0, .65), .055, .25, BLUE, .055)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, .77))
    obj = bpy.context.object
    obj.scale = (.13, .13, .05)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material(WHITE))
    modifier(obj, 'soft clay edges', 'BEVEL', width=.07, segments=3)
    modifier(obj, 'weighted normals', 'WEIGHTED_NORMAL')


def cup():
    pot = cone((0, 0, .48), .24, .72, PINK, .34, vertices=32, fill='NOTHING')
    modifier(pot, 'thick pottery', 'SOLIDIFY', thickness=.055)
    ring((0, 0, .84), .34, .045, WHITE)
    cone((0, 0, .1), .24, .08, PINK, .24)
    ring((.44, 0, .53), .19, .04, PINK).rotation_euler[0] = math.pi / 2


def build(output):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials.clear()
    toys = []
    for name, make in [('bottle', bottle), ('cup', cup)]:
        before = set(bpy.context.scene.objects)
        make()
        parts = [obj for obj in bpy.context.scene.objects if obj not in before]
        bpy.ops.object.select_all(action='DESELECT')
        for obj in parts:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = name
        bpy.context.scene.cursor.location = (0, 0, 0)
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        toys.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in toys:
        obj.select_set(True)
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
                              export_yup=True, export_cameras=False, export_lights=False,
                              export_texcoords=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'public/models/colour-kit.glb')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    build(args.output.resolve())
