"""CLI-only toy atelier: named low-poly clay toys, unique island GLBs, and covers.
blender --background --python examples/_studio/blender/build_assets.py -- [game-id ...]
Coordinates use Blender Z-up; glTF exports Y-up. All toys point toward -Y.

Importing this file (as build_workshops.py does) only builds the toy library in
`prototypes`; the games are built when it runs as the main script.
"""
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]

WHITE = '#fff5df'
DARK = '#333653'
PINK = '#f4a7b9'
GREEN = '#9bc58a'
GOLD = '#ffcf70'
BLUE = '#8bbddf'
ORANGE = '#edab72'

# Rotating a part a quarter turn about X stands a ring or cone up to face -Y.
QUARTER_TURN = math.pi / 2

materials = {}


def mat(hex_colour):
    if hex_colour in materials:
        return materials[hex_colour]
    value = hex_colour.lstrip('#')
    rgb = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    # sRGB to linear, to agree with Three.js material colours.
    rgb = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
    material = bpy.data.materials.new(hex_colour)
    material.diffuse_color = (*rgb, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = .38
    materials[hex_colour] = material
    return material


def apply_modifier(o, name, kind, **settings):
    modifier = o.modifiers.new(name, kind)
    for key, value in settings.items():
        setattr(modifier, key, value)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def smooth(o):
    for face in o.data.polygons:
        face.use_smooth = True


def sphere(location, scale, colour):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, location=location)
    o = bpy.context.object
    o.scale = scale
    o.data.materials.append(mat(colour))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    smooth(o)
    return o


def cube(location, scale, colour, bevel=.07):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat(colour))
    if bevel:
        apply_modifier(o, 'soft clay edges', 'BEVEL', width=bevel, segments=3)
        apply_modifier(o, 'weighted normals', 'WEIGHTED_NORMAL')
    return o


def cone(location, radius, depth, colour, top=0):
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=radius, radius2=top, depth=depth, location=location)
    o = bpy.context.object
    o.data.materials.append(mat(colour))
    smooth(o)
    return o


def torus(location, radius, thickness, colour):
    bpy.ops.mesh.primitive_torus_add(major_segments=24, minor_segments=8, location=location,
                                     major_radius=radius, minor_radius=thickness)
    o = bpy.context.object
    o.data.materials.append(mat(colour))
    return o


def slab(name, vertices, colour, thickness):
    """A flat polygon, solidified into a thick tile."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [tuple(range(len(vertices)))])
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(mat(colour))
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    apply_modifier(o, 'thick', 'SOLIDIFY', thickness=thickness)
    return o


def eyes(z=.75, y=-.31, spacing=.13):
    for x in [-spacing, spacing]:
        sphere((x, y, z), (.045, .025, .06), DARK)
        sphere((x - .01, y - .023, z + .02), (.014, .008, .017), WHITE)
    sphere((0, y - .025, z - .12), (.05, .025, .022), PINK)


def leaf(location, size=1, colour=GREEN):
    o = sphere(location, (.16 * size, .38 * size, .055 * size), colour)
    o.rotation_euler[1] = .3
    return o


def objects_since(before):
    return [o for o in bpy.context.scene.objects if o not in before]


def select_only(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)


def show(o, visible):
    o.hide_set(not visible)
    o.hide_render = not visible


def export_selected(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                              export_yup=True, export_cameras=False, export_lights=False)


ANIMAL_COLOURS = {
    'rabbit': WHITE, 'fox': ORANGE, 'bear': '#c79872', 'frog': GREEN, 'penguin': DARK,
    'duck': GOLD, 'bird': BLUE, 'dino': '#9ac1aa', 'robot': BLUE,
    # Animal Alphabet's word friends.
    'cat': '#bdb6cf', 'dog': '#d0a77c', 'pig': '#f6b9c6', 'hen': WHITE, 'bat': '#857aa3',
}
RED = '#e5604f'
FRUIT_COLOURS = {'apple': '#ee887e', 'pear': '#bbd587', 'strawberry': '#e9829b', 'acorn': '#bc916c', 'egg': WHITE}


def build_animal(name):
    colour = ANIMAL_COLOURS[name]
    if name == 'robot':
        cube((0, 0, .4), (.48, .4, .5), colour)
        cube((0, 0, .85), (.6, .43, .42), colour)
        cone((0, 0, 1.15), .025, .2, GOLD)
        sphere((0, 0, 1.27), (.08,) * 3, PINK)
    else:
        sphere((0, 0, .35), (.36, .3, .4), colour)
        sphere((0, -.03, .8), (.37, .32, .31), colour)
    for x in [-.19, .19]:
        sphere((x, -.14, .1), (.13, .19, .1), GOLD if name == 'hen' else colour)
    if name in ['cat', 'dog', 'pig', 'hen', 'bat']:
        build_word_friend(name, colour)
    if name == 'rabbit':
        for x in [-.17, .17]:
            sphere((x, 0, 1.24), (.105, .09, .36), WHITE)
            sphere((x, -.08, 1.27), (.054, .024, .23), PINK)
    if name in ['bear', 'fox']:
        for x in [-.25, .25]:
            if name == 'fox':
                cone((x, 0, 1.15), .16, .36, ORANGE)
            else:
                sphere((x, 0, 1.06), (.14, .1, .14), colour)
        sphere((0, -.32, .68), (.22, .1, .12), WHITE)
        sphere((0, -.41, .73), (.055,) * 3, DARK)
    if name == 'penguin':
        sphere((0, -.25, .35), (.24, .06, .3), WHITE)
        cone((0, -.35, .7), .07, .18, ORANGE).rotation_euler[0] = QUARTER_TURN
    if name in ['duck', 'bird']:
        sphere((0, -.36, .74), (.12, .15, .05), ORANGE)
        for x in [-.37, .37]:
            sphere((x, 0, .4), (.09, .23, .16), colour)
    if name == 'dino':
        sphere((0, .38, .35), (.15, .55, .15), colour)
        for z in [.45, .65, .85]:
            cone((0, .23, z), .09, .15, GOLD)
    eyes(.85, -.34, .14)


def build_word_friend(name, colour):
    """Features that turn the clay body into a cat, dog, pig, hen or bat."""
    if name == 'cat':
        for side in [-1, 1]:
            cone((side * .22, 0, 1.12), .13, .3, colour)
            cone((side * .22, -.06, 1.1), .07, .18, PINK)
            for z in [.66, .72]:
                sphere((side * .3, -.3, z), (.13, .008, .008), DARK).rotation_euler[1] = side * (z - .69) * 4
        sphere((0, -.3, .67), (.15, .08, .085), WHITE)
        tail = cone((.24, .3, .55), .07, .62, colour, .045)
        tail.rotation_euler[1] = -.35
    if name == 'dog':
        for side in [-1, 1]:
            ear = sphere((side * .35, -.02, .86), (.1, .13, .25), '#8d6648')
            ear.rotation_euler[1] = side * -.25
        sphere((0, -.3, .68), (.19, .12, .12), WHITE)
        sphere((0, -.42, .73), (.065, .04, .05), DARK)
        sphere((.2, -.12, .42), (.12, .2, .14), '#8d6648')
        cone((0, .36, .5), .06, .32, colour, .03).rotation_euler[0] = -.6
    if name == 'pig':
        for side in [-1, 1]:
            cone((side * .21, -.02, 1.09), .11, .2, colour).rotation_euler[0] = .45
            sphere((side * .045, -.43, .71), (.025, .012, .035), '#b86a7c')
        cone((0, -.36, .71), .13, .12, '#ef9eb0', .13).rotation_euler[0] = QUARTER_TURN
        torus((0, .33, .42), .07, .025, colour).rotation_euler[0] = QUARTER_TURN
    if name == 'hen':
        for y, z in [(-.08, 1.11), (.03, 1.15), (.14, 1.1)]:
            sphere((0, y, z), (.05, .07, .09), RED)
        cone((0, -.37, .76), .07, .16, GOLD).rotation_euler[0] = QUARTER_TURN
        sphere((0, -.33, .6), (.045, .03, .07), RED)
        for side in [-1, 1]:
            sphere((side * .36, .03, .42), (.09, .24, .17), '#f1e2c2')
        sphere((0, .34, .62), (.16, .1, .22), WHITE).rotation_euler[0] = -.4
    if name == 'bat':
        for side in [-1, 1]:
            cone((side * .2, 0, 1.14), .12, .32, colour)
            for x, z, size in [(.5, .62, .3), (.72, .5, .2)]:
                wing = sphere((side * x, .05, z), (size, .05, size * .75), '#5e5180')
                wing.rotation_euler[1] = side * -.35
            cone((side * .06, -.33, .6), .02, .06, WHITE).rotation_euler[0] = math.pi
        sphere((0, -.24, .36), (.22, .07, .26), '#b0a4cb')


def build_critter(name):
    if name in ['bee', 'firefly']:
        sphere((0, 0, .4), (.24, .4, .23), GOLD if name == 'bee' else '#71789a')
        if name == 'bee':
            for y in [-.12, .12]:
                torus((0, y, .4), .22, .035, DARK).rotation_euler[0] = QUARTER_TURN
        else:
            lantern = sphere((0, .2, .41), (.235, .24, .22), '#dafe7a')
            shader = lantern.data.materials[0].node_tree.nodes.get('Principled BSDF')
            shader.inputs['Emission Color'].default_value = (.55, .9, .16, 1)
            shader.inputs['Emission Strength'].default_value = .7
        for x in [-.24, .24]:
            sphere((x, .07, .66), (.22, .25, .055), WHITE)
        eyes(.46, -.36, .095)
    if name == 'butterfly':
        for side in [-1, 1]:
            sphere((side * .27, 0, .45), (.26, .1, .3), PINK)
            sphere((side * .25, 0, .18), (.2, .09, .18), '#b7a4e0')
            sphere((side * .29, -.1, .49), (.075, .02, .1), GOLD)
        sphere((0, -.01, .38), (.07, .13, .35), DARK)
        eyes(.6, -.14, .038)
    if name == 'fish':
        sphere((0, 0, .45), (.45, .16, .25), ORANGE)
        cone((.45, 0, .45), .21, .25, ORANGE).rotation_euler[1] = QUARTER_TURN
        eyes(.5, -.15, .11)
    if name == 'turtle':
        sphere((0, 0, .28), (.4, .44, .25), GREEN)
        sphere((0, -.45, .22), (.18, .2, .17), GREEN)
        for x in [-.33, .33]:
            for y in [-.28, .28]:
                sphere((x, y, .1), (.15, .18, .09), GREEN)
        sphere((0, 0, .35), (.33, .36, .2), '#b6d399')
        eyes(.27, -.6, .08)
    if name == 'snail':
        sphere((0, 0, .12), (.21, .46, .12), GOLD)
        sphere((0, .1, .4), (.3, .3, .3), PINK)
        torus((0, -.18, .4), .18, .045, '#cf899e').rotation_euler[0] = QUARTER_TURN
        for x in [-.1, .1]:
            cone((x, -.35, .42), .025, .35, GOLD)
            sphere((x, -.35, .62), (.06,) * 3, WHITE)
            sphere((x, -.395, .62), (.028,) * 3, DARK)


def build_pot(name):
    """The open cauldron and the smoothie cup share one hollow, rimmed shape."""
    if name == 'cauldron':
        body, rim, bottom, top = '#766991', GOLD, .34, .52
    else:
        body, rim, bottom, top = PINK, WHITE, .24, .34
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=bottom, radius2=top, depth=.72,
                                    end_fill_type='NOTHING', location=(0, 0, .48))
    pot = bpy.context.object
    pot.data.materials.append(mat(body))
    apply_modifier(pot, 'thick pottery', 'SOLIDIFY', thickness=.055)
    torus((0, 0, .84), top, .045, rim)
    cone((0, 0, .1), bottom, .08, body, bottom)
    if name == 'cauldron':
        for x in [-.62, .62]:
            torus((x, 0, .65), .15, .035, GOLD).rotation_euler[0] = QUARTER_TURN
        for x, y in [(-.25, -.2), (.25, -.2), (0, .26)]:
            sphere((x, y, .08), (.09, .09, .12), body)
    else:
        torus((.44, 0, .53), .19, .04, PINK).rotation_euler[0] = QUARTER_TURN


def build_shapes(name):
    """Every toy that is not an animal, critter or pot."""
    if name == 'ribbon':
        cube((0, 0, .07), (.34, 1.35, .08), PINK, .025)
        for y in [-.55, -.3, -.05, .2, .45]:
            cube((0, y, .115), (.12, .025, .01), GOLD, .002)
        torus((0, .56, .21), .22, .045, PINK).rotation_euler[0] = QUARTER_TURN
    elif name == 'lantern':
        cone((0, 0, .09), .4, .16, GOLD, .4)
        cone((0, 0, 1.05), .38, .16, GOLD, .3)
        for x in [-.29, .29]:
            for y in [-.29, .29]:
                cone((x, y, .57), .025, .95, GOLD, .025)
        torus((0, 0, 1.28), .2, .035, GOLD).rotation_euler[0] = QUARTER_TURN
        torus((0, 0, .15), .37, .025, WHITE)
        torus((0, 0, .98), .36, .025, WHITE)
    elif name == 'jellyfish':
        sphere((0, 0, .78), (.47, .4, .3), '#e2b3e7')
        for i in range(6):
            a = i * math.pi / 3
            for j in range(5):
                sphere((math.cos(a) * (.2 + j * .02), math.sin(a) * .2, .58 - j * .09), (.038, .038, .07), '#b89edd')
        eyes(.83, -.37, .13)
    elif name == 'magnet':
        for i in range(15):
            a = i / 14 * math.pi
            sphere((math.cos(a) * .35, 0, .55 + math.sin(a) * .35), (.085, .085, .085), '#e87883')
        for x in [-.35, .35]:
            cube((x, 0, .39), (.16, .16, .27), WHITE, .025)
            cube((x, 0, .26), (.16, .16, .08), BLUE if x < 0 else ORANGE, .02)
    elif name == 'paperclip':
        for r in [.13, .21]:
            o = torus((0, 0, .24), r, .022, '#a5b4c8')
            o.scale.y = .55
            o.rotation_euler[0] = QUARTER_TURN
    elif name in ['screw', 'nail']:
        cone((0, 0, .36), .055, .65, '#a5b4c8', .035)
        cone((0, 0, .72), .15, .065, '#dbe2ed', .15)
        if name == 'screw':
            for z in [.16, .25, .34, .43, .52, .61]:
                torus((0, 0, z), .065, .018, '#dbe2ed')
    elif name == 'wood':
        cone((0, 0, .24), .2, .48, '#bd906c', .2)
        for r in [.08, .14, .18]:
            torus((0, 0, .487), r, .007, '#e8c7a0')
    elif name == 'teddy':
        sphere((0, 0, .3), (.28, .23, .3), '#cfa383')
        sphere((0, 0, .65), (.28, .22, .25), '#cfa383')
        for x in [-.22, .22]:
            sphere((x, 0, .83), (.09, .065, .1), '#cfa383')
            sphere((x, -.03, .12), (.13, .16, .1), '#cfa383')
            sphere((x, 0, .4), (.12, .12, .19), '#cfa383')
        eyes(.7, -.22, .1)
    elif name == 'sponge':
        cube((0, 0, .21), (.55, .4, .3), GOLD)
        for x, y in [(-.17, -.12), (.14, -.08), (0, .12)]:
            sphere((x, y, .365), (.045, .04, .008), '#dfa858')
    elif name == 'marble':
        sphere((0, 0, .24), (.24,) * 3, BLUE)
        sphere((-.065, -.21, .31), (.065, .02, .07), WHITE)
    elif name == 'sun':
        sphere((0, 0, .5), (.3, .12, .3), GOLD)
        for i in range(8):
            a = i * math.pi / 4
            sphere((math.sin(a) * .44, 0, .5 + math.cos(a) * .44), (.05, .06, .05), ORANGE)
        eyes(.55, -.13, .12)
    elif name == 'candy':
        sphere((0, 0, .25), (.18, .12, .18), PINK)
        for x in [-.23, .23]:
            cone((x, 0, .25), .1, .17, BLUE).rotation_euler[1] = QUARTER_TURN
    elif name == 'soil':
        sphere((0, 0, .12), (.4, .3, .12), '#997962')
        for x, y in [(-.2, -.1), (.1, .1), (.22, -.1)]:
            sphere((x, y, .24), (.05, .05, .04), '#caa689')
    elif name == 'paint':
        cone((0, 0, .25), .25, .4, PINK, .25)
        torus((0, 0, .46), .25, .025, WHITE)
        torus((0, 0, .55), .2, .025, GOLD).rotation_euler[0] = QUARTER_TURN
    elif name in ['jar', 'can']:
        cone((0, 0, .35), .24, .6, BLUE if name == 'jar' else '#b6c1cc', .24)
        torus((0, 0, .66), .24, .035, WHITE)
        if name == 'jar':
            cone((0, 0, .71), .26, .08, PINK, .26)
        else:
            for z in [.15, .35, .55]:
                torus((0, 0, z), .242, .013, '#dce3eb')
    elif name == 'newspaper':
        cube((0, 0, .07), (.6, .8, .08), WHITE, .025)
        for y in [-.25, -.14, -.03, .08, .19]:
            cube((0, y, .118), (.42, .025, .01), '#8991a3', .005)
        cube((-.1, .3, .118), (.23, .12, .012), BLUE, .01)
    elif name == 'spoon':
        cube((0, .16, .06), (.09, .65, .065), '#b8c6d2', .025)
        sphere((0, -.26, .08), (.18, .23, .035), '#b8c6d2')
    elif name == 'broccoli':
        cone((0, 0, .3), .07, .55, GREEN, .11)
        for location in [(-.19, 0, .61), (.19, 0, .61), (0, -.16, .62), (0, .15, .66), (0, 0, .81)]:
            sphere(location, (.23, .2, .18), '#85b593')
    elif name == 'cabbage':
        sphere((0, 0, .33), (.32, .31, .32), '#b4ce8c')
        for i in range(6):
            a = i * math.pi / 3
            leaf((math.sin(a) * .19, math.cos(a) * .19, .2), .7, '#89b58d')
    elif name == 'gloves':
        for x in [-.21, .21]:
            cube((x, 0, .1), (.24, .3, .12), PINK, .06)
            cube((x, .16, .08), (.22, .12, .09), WHITE, .03)
            for dx in [-.075, -.025, .025, .075]:
                cube((x + dx, -.21, .1), (.045, .2, .1), PINK, .02)
            thumb_x = x + (.14 if x > 0 else -.14)
            cube((thumb_x, -.04, .1), (.1, .16, .1), PINK, .04)
    elif name == 'scarf':
        cube((0, 0, .1), (.22, .85, .12), '#b9abd9')
        cube((.18, -.1, .18), (.22, .7, .12), '#b9abd9')
        for y in [-.28, 0, .25]:
            cube((0, y, .168), (.23, .04, .014), WHITE, .005)
    elif name == 'coat':
        cube((0, 0, .25), (.5, .18, .65), BLUE, .1)
        for x in [-.33, .33]:
            sleeve = cube((x, 0, .37), (.2, .18, .5), BLUE, .07)
            sleeve.rotation_euler[1] = .3 if x < 0 else -.3
        for z in [.12, .26, .4]:
            sphere((0, -.1, z), (.025, .015, .025), GOLD)
        torus((0, 0, .63), .12, .04, WHITE)
    elif name == 'sandal':
        sphere((0, 0, .05), (.18, .4, .05), '#edb894')
        for x in [-.1, .1]:
            strap = cube((x, -.06, .13), (.04, .45, .05), BLUE, .02)
            strap.rotation_euler[2] = .38 if x < 0 else -.38
    elif name == 'glasses':
        for x in [-.18, .18]:
            sphere((x, 0, .06), (.17, .12, .045), '#5b617c')
            torus((x, 0, .08), .15, .025, GOLD).scale.y = .75
        cube((0, 0, .08), (.1, .03, .04), GOLD, .015)
    elif name == 'hat':
        cone((0, 0, .1), .48, .05, '#e8c391', .48)
        cone((0, 0, .28), .27, .33, '#e8c391', .23)
        torus((0, 0, .15), .273, .035, PINK)
    elif name == 'bed':
        cube((0, 0, .25), (.6, .85, .22), '#bc9479')
        cube((0, 0, .4), (.59, .8, .16), WHITE)
        cube((0, .05, .5), (.57, .55, .1), BLUE)
        cube((0, -.28, .54), (.42, .2, .1), WHITE)
        for x in [-.27, .27]:
            cube((x, -.4, .4), (.06, .06, .6), '#bc9479')
    elif name == 'washstand':
        cube((0, 0, .3), (.65, .5, .6), PINK)
        sphere((0, 0, .63), (.26, .19, .06), BLUE)
        cone((0, .14, .78), .025, .35, '#b8c6d2', .025)
        cube((0, .06, .93), (.05, .2, .05), '#b8c6d2', .02)
    elif name == 'bowl':
        sphere((0, 0, .22), (.35, .35, .2), PINK)
        cone((0, 0, .4), .32, .03, WHITE, .32)
        for x, y in [(-.12, 0), (.1, -.1), (.04, .13)]:
            sphere((x, y, .44), (.08, .08, .045), GOLD)
        cube((.25, .08, .53), (.035, .5, .03), WHITE, .01).rotation_euler[0] = .7
    elif name == 'toothbrush':
        cube((0, 0, .1), (.08, .8, .1), BLUE, .04)
        cube((0, -.35, .2), (.13, .26, .1), WHITE, .035)
        for y in [-.44, -.36, -.28]:
            cube((0, y, .275), (.11, .025, .055), WHITE, .01)
    elif name == 'sunflowerseed':
        sphere((0, 0, .12), (.13, .28, .12), DARK)
        for x in [-.06, 0, .06]:
            cube((x, 0, .224), (.013, .28, .01), WHITE, .004)
    elif name == 'sprout':
        sphere((0, 0, .07), (.3, .25, .07), '#ac8b73')
        cone((0, 0, .3), .025, .5, GREEN, .025)
        leaf((-.15, 0, .45), .45)
        leaf((.15, 0, .48), .45)
    elif name == 'sunflower':
        cone((0, 0, .6), .035, 1.2, GREEN, .025)
        leaf((-.16, 0, .4), .6)
        leaf((.14, 0, .7), .6)
        for i in range(12):
            a = i * math.pi / 6
            sphere((math.sin(a) * .26, 0, 1.35 + math.cos(a) * .26), (.12, .055, .12), GOLD)
        sphere((0, -.02, 1.35), (.21, .07, .21), '#a58264')
    elif name == 'frogspawn':
        for x, y in [(-.2, 0), (0, 0), (.2, 0), (-.1, -.2), (.1, -.2), (-.1, .2), (.1, .2)]:
            sphere((x, y, .1), (.115, .115, .07), '#cbded0')
            sphere((x, y, .17), (.045, .045, .02), DARK)
    elif name == 'leafeggs':
        leaf((0, 0, .05), 1)
        for x, y in [(-.06, -.1), (.03, 0), (-.03, .13)]:
            sphere((x, y, .12), (.045, .05, .05), WHITE)
    elif name in ['tadpole', 'froglet']:
        sphere((0, 0, .16), (.18, .25, .15), '#85ad91')
        cone((0, .4, .11), .07, .7, '#85ad91', .018).rotation_euler[0] = QUARTER_TURN
        for x in [-.07, .07]:
            sphere((x, -.18, .21), (.025, .025, .025), DARK)
        if name == 'froglet':
            for x in [-.25, .25]:
                sphere((x, .08, .12), (.2, .08, .06), '#85ad91')
    elif name == 'caterpillar':
        for i in range(6):
            sphere((0, (i - 2.5) * .16, .13), (.13, .13, .13), GREEN)
        for x in [-.05, .05]:
            sphere((x, -.48, .19), (.025, .02, .03), DARK)
    elif name == 'chrysalis':
        cone((0, 0, .73), .024, .3, '#aa8f74', .024)
        sphere((0, 0, .37), (.16, .14, .35), '#aab58b')
        for z in [.15, .3, .45]:
            torus((0, 0, z), .13, .012, '#879672')
    elif name == 'owl':
        sphere((0, 0, .45), (.35, .25, .45), '#bba8cd')
        for x in [-.16, .16]:
            sphere((x, -.23, .6), (.16, .06, .18), WHITE)
            sphere((x, -.288, .61), (.065, .02, .075), DARK)
            cone((x, 0, .97), .08, .2, '#bba8cd')
        cone((0, -.28, .43), .07, .17, GOLD).rotation_euler[0] = QUARTER_TURN
        for x in [-.27, .27]:
            sphere((x, 0, .44), (.12, .24, .3), '#9e8fb7')
    elif name == 'lemon':
        sphere((0, 0, .25), (.22, .3, .23), GOLD)
    elif name == 'umbrella':
        cone((0, 0, .43), .025, .85, WHITE, .025)
        sphere((0, 0, .87), (.42, .42, .18), BLUE)
        for i in range(6):
            a = i * math.pi / 3
            sphere((math.sin(a) * .38, math.cos(a) * .38, .81), (.065, .065, .065), PINK)
        torus((.07, 0, .08), .07, .024, WHITE).rotation_euler[0] = QUARTER_TURN
    elif name == 'boots':
        for x in [-.17, .17]:
            cone((x, 0, .31), .12, .55, BLUE, .12)
            sphere((x, -.13, .08), (.13, .26, .08), BLUE)
            torus((x, 0, .59), .12, .025, GOLD)
    elif name == 'pizza':
        cone((0, 0, .07), .5, .14, '#dfbd8e', .5)
        cone((0, 0, .155), .45, .035, GOLD, .45)
        for i in range(6):
            a = i * math.pi / 3
            sphere((math.sin(a) * .3, math.cos(a) * .3, .18), (.075, .075, .018), '#e58f87')
    elif name == 'watermelon':
        sphere((0, 0, .15), (.52, .52, .15), GREEN)
        cone((0, 0, .28), .45, .035, PINK, .45)
        for i in range(8):
            a = i * math.pi / 4
            sphere((math.sin(a) * .3, math.cos(a) * .3, .305), (.018, .032, .01), DARK)
    elif name == 'quilt':
        for x in range(4):
            for y in range(3):
                patch = [PINK, BLUE, GOLD, GREEN][(x + y) % 4]
                cube(((x - 1.5) * .24, (y - 1) * .24, .07), (.23, .23, .07), patch, .025)
    elif name == 'clock':
        sphere((0, 0, .6), (.48, .1, .48), WHITE)
        torus((0, 0, .6), .48, .035, GOLD).rotation_euler[0] = QUARTER_TURN
        for hour in range(12):
            a = hour * math.pi / 6
            sphere((math.sin(a) * .39, -.11, .6 + math.cos(a) * .39), (.02, .02, .02), DARK)
        cube((0, -.12, .75), (.025, .025, .31), '#a591c9')
        cube((.12, -.14, .6), (.26, .025, .025), ORANGE)
        sphere((0, -.15, .6), (.035, .025, .035), GOLD)
    elif name == 'key':
        torus((0, 0, .75), .2, .045, GOLD).rotation_euler[0] = QUARTER_TURN
        cube((0, 0, .39), (.065, .09, .5), GOLD, .03)
        cube((.1, 0, .22), (.25, .09, .065), GOLD, .025)
    elif name == 'tangram':
        pieces = [
            [(0, 0), (4, 0), (2, 2)], [(0, 0), (2, 2), (0, 4)], [(4, 4), (2, 4), (4, 2)], [(2, 2), (3, 1), (3, 3)],
            [(0, 4), (1, 3), (2, 4)], [(2, 2), (3, 3), (2, 4), (1, 3)], [(4, 0), (4, 2), (3, 3), (3, 1)],
        ]
        colours = [PINK, BLUE, GOLD, GREEN, '#bbaad5', ORANGE, '#a5d4c7']
        for corners, colour in zip(pieces, colours):
            slab('tangram-piece', [((x - 2) * .22, (y - 2) * .22, .07) for x, y in corners], colour, .055)
    elif name == 'ladybird':
        sphere((0, 0, .24), (.48, .3, .24), PINK)
        sphere((-.46, 0, .16), (.2, .22, .15), DARK)
        for x in [-.25, -.12, 0, .12, .25]:
            for y in [-.14, .14]:
                sphere((x, y, .44), (.04, .04, .01), DARK)
        for y in [-.09, .09]:
            sphere((-.55, y, .28), (.035, .035, .025), WHITE)
    elif name == 'suitcase':
        cube((0, 0, .35), (.7, .25, .6), BLUE, .08)
        torus((0, 0, .74), .14, .025, GOLD).rotation_euler[0] = QUARTER_TURN
    elif name == 'giraffe':
        sphere((0, 0, .7), (.38, .22, .25), GOLD)
        for x in [-.23, .23]:
            for y in [-.13, .13]:
                cone((x, y, .3), .055, .6, GOLD, .055)
        cone((-.23, 0, 1.24), .1, 1.15, GOLD, .085)
        sphere((-.27, -.035, 1.88), (.23, .14, .16), GOLD)
        for x in [-.37, -.2]:
            cone((x, .025, 2.08), .025, .18, ORANGE, .025)
            sphere((x, .025, 2.18), (.045,) * 3, ORANGE)
        for spot in [(-.23, -.095, 1), (-.22, -.09, 1.28), (-.23, -.09, 1.55), (-.1, -.21, .75), (.12, -.21, .68), (.28, -.14, .77)]:
            sphere(spot, (.065, .02, .075), '#bc916c')
        sphere((-.34, -.155, 1.91), (.033, .015, .038), DARK)
        sphere((-.09, -.08, 1.85), (.03, .025, .025), DARK)
    elif name == 'tree':
        cone((0, 0, .55), .13, 1.1, '#b0886e', .08)
        for location, scale in [((0, 0, 1.25), (.55, .5, .6)), ((-.3, 0, 1.05), (.35, .4, .4)), ((.3, 0, 1.15), (.35, .4, .45))]:
            sphere(location, scale, GREEN)
    elif name == 'flower':
        cone((0, 0, .4), .025, .8, GREEN)
        leaf((.15, 0, .25), .5)
        for i in range(6):
            a = i * math.pi / 3
            sphere((math.cos(a) * .2, math.sin(a) * .2, .84), (.14, .14, .065), PINK)
        sphere((0, 0, .87), (.13, .13, .08), GOLD)
    elif name == 'mushroom':
        cone((0, 0, .22), .12, .4, WHITE, .09)
        sphere((0, 0, .46), (.4, .4, .17), PINK)
        sphere((-.12, -.22, .55), (.065, .065, .02), WHITE)
        sphere((.19, -.08, .58), (.07, .07, .02), WHITE)
    elif name in FRUIT_COLOURS:
        colour = FRUIT_COLOURS[name]
        sphere((0, 0, .3), (.27, .25, .33 if name in ['pear', 'egg'] else .26), colour)
        if name == 'pear':
            sphere((0, 0, .55), (.16, .17, .2), colour)
        if name == 'acorn':
            sphere((0, 0, .49), (.3, .28, .12), '#826956')
        if name != 'egg':
            cone((0, 0, .62), .03, .2, '#9c8067')
            leaf((.1, 0, .66), .4)
        if name == 'strawberry':
            for seed in [(-.1, -.22, .4), (.1, -.22, .25), (0, -.24, .33)]:
                sphere(seed, (.02, .02, .035), GOLD)
    elif name == 'carrot':
        cone((0, 0, .28), .2, .55, ORANGE)
        leaf((0, 0, .65), .6)
        leaf((.08, 0, .62), .6)
    elif name == 'leaf':
        leaf((0, 0, .08), 1)
    elif name == 'stone':
        sphere((0, 0, .2), (.35, .28, .22), '#bbc3ce')
    elif name == 'gem':
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.4, location=(0, 0, .4))
        o = bpy.context.object
        o.scale = (.8, .8, 1.35)
        o.data.materials.append(mat('#ab99de'))
    elif name == 'star':
        points = []
        for i in range(10):
            a = i * math.pi / 5
            r = .4 if i % 2 == 0 else .19
            points.append((math.sin(a) * r, -.04, .46 + math.cos(a) * r))
        slab('star', points, GOLD, .12)
    elif name == 'planet':
        sphere((0, 0, .5), (.35,) * 3, '#bbace2')
        torus((0, 0, .5), .51, .035, GOLD).rotation_euler[0] = .3
    elif name == 'rocket':
        cone((0, 0, .5), .22, .85, WHITE, .16)
        cone((0, 0, 1.1), .23, .4, PINK)
        sphere((0, -.2, .72), (.115, .035, .115), BLUE)
        for x in [-.25, .25]:
            cube((x, 0, .17), (.12, .3, .35), PINK)
        cone((0, 0, .05), .13, .3, GOLD)
    elif name in ['house', 'castle']:
        cube((0, 0, .45), (.85, .7, .9), '#ead2ba')
        cone((0, 0, 1.12), .7, .55, PINK, 0)
        cube((0, -.36, .3), (.24, .03, .46), '#a789ba')
        cube((.25, -.36, .67), (.18, .03, .2), BLUE)
        if name == 'castle':
            for x in [-.6, .6]:
                cone((x, 0, .6), .22, 1.2, '#d5c2e4', .22)
                cone((x, 0, 1.35), .32, .45, '#a7a5d9')
    elif name == 'train':
        cube((0, 0, .4), (.6, 1, .4), PINK)
        cube((0, .25, .8), (.6, .45, .6), BLUE)
        cone((0, -.35, .7), .1, .4, DARK, .1)
        for x in [-.35, .35]:
            for y in [-.3, .3]:
                sphere((x, y, .2), (.08, .16, .16), DARK)
    elif name == 'boat':
        sphere((0, 0, .2), (.3, .6, .18), ORANGE)
        cone((0, 0, .65), .025, 1.1, WHITE)
        cube((.2, 0, .85), (.4, .06, .5), PINK)
    elif name == 'shell':
        for i in range(7):
            a = (i - 3) * .22
            sphere((math.sin(a) * .17, 0, .24), (.055, .15, .29), PINK).rotation_euler[1] = -a
    elif name == 'coral':
        for x, height in [(-.25, .4), (0, .6), (.25, .4)]:
            cone((x, 0, height / 2), .07, height, PINK, .055)
            sphere((x, 0, height), (.1, .1, .12), PINK)
        cube((0, 0, .15), (.6, .12, .1), PINK)
    elif name == 'bottle':
        cone((0, 0, .3), .14, .5, BLUE, .14)
        cone((0, 0, .65), .055, .25, BLUE, .055)
        cube((0, 0, .77), (.13, .13, .05), WHITE)
    elif name == 'basket':
        cube((0, 0, .22), (.65, .55, .4), '#dcb689')
        torus((0, 0, .4), .3, .035, '#b28e6c').rotation_euler[0] = QUARTER_TURN
    elif name == 'parcel':
        cube((0, 0, .3), (.55, .55, .55), ORANGE)
        cube((0, -.283, .3), (.1, .01, .56), WHITE)
        cube((0, 0, .582), (.1, .56, .01), WHITE)
    elif name == 'book':
        cube((0, 0, .17), (.55, .7, .18), WHITE)
        cube((0, 0, .28), (.6, .75, .06), PINK)
        cube((0, 0, .06), (.6, .75, .06), PINK)
    elif name == 'bread':
        sphere((0, 0, .2), (.25, .45, .2), '#e7bc82')
    elif name == 'drum':
        cone((0, 0, .3), .3, .5, PINK, .3)
        cone((0, 0, .56), .31, .035, WHITE, .31)
        torus((0, 0, .58), .3, .025, GOLD)
    elif name == 'gear':
        torus((0, 0, .1), .25, .09, BLUE)
    elif name == 'kite':
        cube((0, 0, .4), (.5, .06, .5), PINK).rotation_euler[1] = math.pi / 4
        cone((0, 0, .1), .02, .5, GOLD)
    elif name == 'cloud':
        for x, z, size in [(-.3, .2, .23), (0, .3, .35), (.32, .2, .24)]:
            sphere((x, 0, z), (size, .23, size), WHITE)
    else:
        raise ValueError('Unknown toy ' + name)


def toy(name):
    """Model one toy from clay parts and join them into a single object named after it."""
    before = set(bpy.context.scene.objects)
    if name in ANIMAL_COLOURS:
        build_animal(name)
    elif name in ['bee', 'firefly', 'butterfly', 'fish', 'turtle', 'snail']:
        build_critter(name)
    elif name in ['cauldron', 'cup']:
        build_pot(name)
    else:
        build_shapes(name)
    parts = objects_since(before)
    select_only(parts)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return o


TOYS = [
    'ribbon', 'pizza', 'watermelon', 'quilt', 'clock', 'key', 'tangram', 'ladybird', 'suitcase', 'lemon',
    'umbrella', 'boots', 'owl', 'jar', 'can', 'newspaper', 'spoon', 'broccoli', 'cabbage', 'gloves', 'scarf',
    'coat', 'sandal', 'glasses', 'hat', 'bed', 'washstand', 'bowl', 'toothbrush', 'sunflowerseed', 'sprout',
    'sunflower', 'frogspawn', 'leafeggs', 'tadpole', 'froglet', 'caterpillar', 'chrysalis', 'giraffe',
    'lantern', 'cauldron', 'cup', 'jellyfish', 'magnet', 'screw', 'nail', 'paperclip', 'wood', 'teddy',
    'sponge', 'marble', 'sun', 'candy', 'soil', 'paint', 'rabbit', 'fox', 'bear', 'frog', 'penguin', 'duck',
    'bird', 'dino', 'robot', 'bee', 'firefly', 'butterfly', 'fish', 'turtle', 'snail', 'tree', 'flower',
    'mushroom', 'apple', 'pear', 'strawberry', 'acorn', 'egg', 'carrot', 'leaf', 'stone', 'gem', 'star',
    'planet', 'rocket', 'house', 'castle', 'train', 'boat', 'shell', 'coral', 'bottle', 'basket', 'parcel',
    'book', 'bread', 'drum', 'gear', 'kite', 'cloud', 'cat', 'dog', 'pig', 'hen', 'bat',
]

# Build the whole library once, hidden. Each game exports only the toys it uses,
# which keeps iPad downloads, GPU allocations and the repository small.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
prototypes = {name: toy(name) for name in TOYS}
for prototype in prototypes.values():
    show(prototype, False)

VESSEL_TOYS = {'cauldron': 'cauldron', 'smoothie': 'cup', 'jellyfish': 'jellyfish', 'planet': 'planet'}
EXPERIMENT_HEROES = {'magnet': 'magnet', 'float': 'boat', 'grow': 'flower'}
# Toys a game's code loads beyond the ones named in its design.
MODE_TOYS = {
    'match': ['parcel', 'rocket', 'tree', 'rabbit', 'boat', 'fox', 'bird', 'duck', 'snail'],
    'path': ['stone'],
    'experiment': ['magnet', 'flower', 'wood', 'stone'],
    'pitch': ['bird'],
    'build': ['parcel'],
}
GAME_TOYS = {
    'bead-bridge': ['snail'], 'sleepy-owl-lullaby': ['owl'], 'picnic-pairs': ['apple', 'pear', 'strawberry'],
    'frog-choir': ['frog'], 'butterfly-patterns': ['leaf'], 'firefly-lanterns': ['lantern'],
    'giraffe-ruler': ['giraffe'], 'bridge-builder': ['boat'], 'garden-fence': ['flower'],
    'word-rocket': ['rocket'], 'animal-alphabet': ['fox', 'cat', 'dog', 'pig', 'hen', 'bat'], 'picnic-word-basket': ['basket'],
    'rhyming-river': ['frog', 'leaf'],
    # Clock games: the character who keeps the time.
    'cuckoo-clock-garden': ['bird'], 'space-station-schedule': ['rocket'], 'bunny-bedtime': ['rabbit'],
    'bakery-alarm': ['bread'],
}
COVER_HEROES = {
    'firefly-lanterns': 'lantern', 'rainbow-postoffice': 'parcel', 'shape-locksmith': 'key',
    'footprint-detective': 'fox', 'shadow-theatre': 'rabbit', 'habitat-hotel': 'house',
    'recycling-robots': 'robot', 'fruit-veggie-ferry': 'boat', 'season-suitcase': 'suitcase',
    'butterfly-patterns': 'butterfly', 'bead-bridge': 'gem', 'train-carriage-rhythm': 'train',
    'constellation-code': 'star', 'cloud-number-race': 'cloud', 'ribbon-tailor': 'ribbon',
    'picnic-pairs': 'basket', 'planet-pairs': 'planet', 'tool-twins': 'gear', 'letter-buddies': 'book',
    'butterfly-mirrors': 'butterfly', 'sound-wave-lab': 'gem', 'birdsong-tuner': 'bird', 'frog-choir': 'frog',
    'crystal-cave-echo': 'gem', 'robot-dance-code': 'robot', 'sleepy-owl-lullaby': 'owl',
    'giraffe-ruler': 'giraffe', 'bridge-builder': 'boat', 'garden-fence': 'flower', 'comet-tail-measure': 'star',
    'gem-turner': 'key', 'rocket-docking': 'rocket', 'tangram-turntable': 'tangram', 'snowflake-studio': 'star',
    'castle-window-symmetry': 'castle', 'robot-reflections': 'robot', 'word-rocket': 'rocket',
    'animal-alphabet': 'fox', 'picnic-word-basket': 'basket', 'rhyming-river': 'frog',
    'weather-wardrobe': 'coat', 'kindness-cafe': 'bear', 'healthy-plate-party': 'broccoli',
    'senses-safari': 'teddy', 'drum-beat-builder': 'drum', 'rain-drop-rhythm': 'leaf',
    'toy-town-builder': 'house', 'castle-block-blueprints': 'castle', 'ladybird-dot-party': 'ladybird',
}


def toybox_toys(g):
    needed = set(g['scenery']) | {'rabbit', 'star', 'gem'}
    needed.update(g.get('lifeModels', []))
    needed.update(g.get('storyToys', []))
    needed.update(prop['model'] for prop in g.get('props', {}).values())
    for field in ['hero', 'item', 'goal', 'obstacle', 'distractor']:
        if g.get(field) in prototypes:
            needed.add(g[field])
    needed.update(item[0] for item in g.get('items', []) if item[0] in prototypes)
    needed.update(MODE_TOYS.get(g['mode'], []))
    needed.update(GAME_TOYS.get(g['id'], []))
    if g['mode'] == 'mix':
        needed.update(['bottle', VESSEL_TOYS[g['vessel']]])
    if g['mode'] == 'experiment':
        needed.update(entry[2] for entry in g['sets'])
    return needed


def cover_hero(g):
    if g['mode'] == 'order':
        return g['lifeModels'][-1]
    if g['mode'] == 'clock':
        return 'clock'
    if g['mode'] == 'fraction':
        return g['food']
    if g['mode'] == 'mix':
        return VESSEL_TOYS[g['vessel']]
    if g['mode'] == 'experiment':
        return EXPERIMENT_HEROES[g['property']]
    if g['id'] in COVER_HEROES:
        return COVER_HEROES[g['id']]
    hero = g.get('hero', g.get('item', g['scenery'][-1]))
    return hero if hero in prototypes else 'rabbit'


def place(name, location, size=1, angle=0):
    """Place a visible copy of a library toy; copies share the toy's mesh."""
    o = prototypes[name].copy()
    bpy.context.collection.objects.link(o)
    show(o, True)
    o.location = location
    o.scale = (size, size, size)
    o.rotation_euler[2] = angle
    return o


def around(count, radius, start=0):
    """Evenly spaced (x, y, angle) points on a circle around the island."""
    for i in range(count):
        a = start + i / count * math.tau
        yield math.cos(a) * radius, math.sin(a) * radius, a


def build_theme(theme):
    """Theme architecture changes the silhouette and material of each world."""
    if theme in ['ocean', 'pond', 'harbour']:
        cone((0, 0, .008), 3.4, .022, '#89cdd4', 3.4)
        for x, y, _ in around(4, 3.15, .4):
            torus((x, y, .025), .28, .015, '#c2e9e7')
    if theme == 'harbour':
        for i in range(11):
            cube(((i - 5) * .49, 0, .05), (.46, 3.8, .07), '#e5c39f', .025)
    if theme == 'space':
        torus((0, 0, .018), 4.55, .018, '#b2a6d6')
        for x, y, _ in around(6, 3.3, .2):
            torus((x, y, .02), .22, .04, '#9a91bd')
    if theme == 'arctic':
        for x, y, _ in around(6, 4.5):
            cone((x, y, -.14), .58, .38, '#d5e5f5', .45)
    if theme == 'railway':
        for r in [3.5, 3.72]:
            torus((0, 0, .04), r, .025, '#8990a0')
        for x, y, a in around(32, 3.61):
            cube((x, y, .018), (.42, .075, .025), '#c2a580', .01).rotation_euler[2] = a
    if theme == 'theatre':
        for x in [-3.1, 3.1]:
            cone((x, 2.5, 1), .13, 2, '#ad718e', .13)
            for i in range(4):
                cone((x + (i - 1.5) * .18, 2.65, 1.05), .15, 1.9, '#d799b2', .15)
        cube((0, 2.6, 2.08), (6.6, .22, .2), '#ad718e')
    if theme == 'castle':
        for x in [-3, 3]:
            cone((x, 2.45, .7), .35, 1.4, '#d9c7e6', .35)
            cone((x, 2.45, 1.62), .46, .5, '#b093c4')
        cube((0, 2.8, .48), (5.6, .22, .9), '#e4d6eb')
        for x in range(-3, 4):
            cube((x * .8, 2.8, 1.05), (.42, .25, .3), '#e4d6eb')
    if theme == 'workshop':
        for x, y, _ in around(6, 3.7):
            cube((x, y, .025), (.36, .36, .05), '#b9d6d9')
    if theme == 'library':
        for x in [-3.1, 3.1]:
            cube((x, 2.5, .7), (1.1, .5, 1.4), '#b7987d')
            for i, colour in enumerate([PINK, BLUE, GOLD, GREEN, '#bfaad8']):
                cube((x + (i - 2) * .17, 2.18, .8), (.12, .08, .6), colour)
    if theme == 'bakery':
        for i in range(8):
            cube(((i - 3.5) * .6, 2.7, .1), (.58, .6, .08), WHITE if i % 2 else PINK, .025)
    if theme == 'sky':
        for x, y, _ in around(6, 4.15):
            sphere((x, y, .14), (.6, .5, .18), WHITE)


def aim_at(o, target):
    o.rotation_euler = (target - o.location).to_track_quat('-Z', 'Y').to_euler()


def build_game(g):
    scene = bpy.context.scene
    out = ROOT / g['id'] / 'public'
    before = set(scene.objects)
    random.seed(g['seed'])

    # A thick, bevelled diorama with an open central play stage.
    cone((0, 0, -.22), 4.8, .38, g['ground'], 4.8)
    cone((0, 0, -.52), 4.63, .32, '#f1d5b4', 4.63)
    cone((0, 0, -.73), 4.42, .14, '#d6bba9', 4.42)
    build_theme(g['theme'])
    for i, (x, y, _) in enumerate(around(11, 3.95)):
        name = g['scenery'][i % len(g['scenery'])]
        size = random.uniform(.65, 1.05)
        angle = random.uniform(-.4, .4)
        # Letters and numerals start at their top line, right against the back of the stage:
        # keep the spot behind the middle clear so no toy crowds stroke 1's number.
        if g.get('trace') in ['letter', 'number'] and y > 3 and abs(x) < 1.2:
            continue
        place(name, (x, y, 0), size, angle)
    for _ in range(22):
        a = random.random() * math.tau
        r = random.uniform(3.2, 4.5)
        sphere((math.cos(a) * r, math.sin(a) * r, .03), (.06, .06, .045), g['accent'])

    # Export only the environment. The toys are instantiated by the game engine.
    select_only(objects_since(before))
    export_selected(out / 'models' / 'world.glb')
    needed = [prototypes[name] for name in toybox_toys(g)]
    for o in needed:
        show(o, True)
    select_only(needed)
    export_selected(out / 'models' / 'toybox.glb')
    for o in needed:
        show(o, False)

    # A cover composed from the game's own diorama and toys.
    place(cover_hero(g), (0, -.6, .05), 1.65)
    place(g['scenery'][1], (-1.65, -.15, 0), 1.25, .2)
    place(g['scenery'][2], (1.7, -.1, .05), 1.25, -.3)
    for i in range(7):
        place('star', ((i - 3) * .57, 1.05, .28 + math.sin(i) * .1), .45)
    # Title and educational subtitle are real Blender text, rendered with the toys.
    for text, z, size in [(g['title'], 2.8, .42), (g['skill'], 2.25, .18)]:
        bpy.ops.object.text_add(location=(0, 1.8, z), rotation=(QUARTER_TURN, 0, 0))
        label = bpy.context.object.data
        label.body = text
        label.align_x = 'CENTER'
        label.size = size
        label.extrude = .005
        label.bevel_depth = .003
        label.materials.append(mat(WHITE))
    bpy.ops.object.camera_add(location=(7, -12, 10))
    camera = bpy.context.object
    aim_at(camera, Vector((0, 0, .65)))
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 12.3
    scene.camera = camera
    for location, power, size in [((-3, -4, 9), 1400, 7), ((5, 3, 7), 1100, 5)]:
        bpy.ops.object.light_add(type='AREA', location=location)
        light = bpy.context.object
        light.data.energy = power
        light.data.shape = 'DISK'
        light.data.size = size
        aim_at(light, Vector((0, 0, 0)))
    cube((0, 0, -.94), (200, 200, .1), g['sky'], 0)
    scene.render.filepath = str(out / 'cover.jpg')
    bpy.ops.render.render(write_still=True)
    print('BUILT ' + g['id'], flush=True)

    for o in objects_since(before):
        bpy.data.objects.remove(o, do_unlink=True)


def configure_renderer(scene):
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 720
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 90
    scene.view_settings.view_transform = 'AgX'
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes['Background']
    background.inputs[0].default_value = (.75, .8, 1, 1)
    background.inputs[1].default_value = .65
    # Render with a small bounded CPU pool; a full workstation may run other agents.
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 8


if __name__ == '__main__':
    wanted = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    designs = json.loads((ROOT / '_studio' / 'designs.json').read_text())
    designs = [g for g in designs if not wanted or g['id'] in wanted]
    configure_renderer(bpy.context.scene)
    for design in designs:
        build_game(design)
    print('Finished ' + str(len(designs)) + ' Blender adventures.', flush=True)
