"""
Bumper Ducks models: builds the rubber ducks, their bumper boats, the pickups
and three arenas procedurally, then exports the files the game loads:

  ../public/models/ducks.glb    a rubber duck, a bumper boat and six hats
  ../public/models/items.glb    star, gift box, lily pad, frog, paper boat
  ../public/models/arenas.glb   the scenery around the water for each arena

Run headless from this folder (no Blender window needed):

    blender --background --python models.py
    blender --background --python models.py -- --cover ../public/cover.jpg   # also renders the cover

Coordinates: Blender Z is up. Everything that has a front faces Blender -Y,
which is three.js +Z after the Y-up glTF export. One Blender unit is one game
unit. The water surface is z = 0 and the arena's water is a circle of radius
11 around the origin (the game draws the water itself).

Names the game relies on
------------------------
ducks.glb top-level nodes:
  duck          rubber duck sitting at the origin (its bottom at z = 0.1)
  boat          round inflatable bumper boat, ring radius 1.1, centred on the origin
  acc_tuft, acc_bow, acc_sailor, acc_crown, acc_shades, acc_flower
                hats and things, already placed for the duck's head (add them to the duck)
Materials (looked up by name and recoloured per duck):
  duck_body     the rubber (white; the game tints it)
  boat_ring     the boat's tube (white; the game tints it)

items.glb top-level nodes:
  star          puffy golden star with a face, standing up, centred on the origin
  gift          present box with a ribbon and a question mark, sitting on z = 0
  lily_pad      floating pad (radius 1.3) with a pink flower
  frog          little green frog sitting on z = 0, facing -Y
  paper_boat    folded paper boat, floating, about 1.6 long

arenas.glb top-level nodes:
  arena_bath    round bathtub rim, tiles, tap, shampoo and foam
  arena_pond    grassy bank, reeds, rocks, trees and flowers
  arena_puddle  muddy edge, autumn leaves, wellies and a snail
  umbrella      the puddle's yellow umbrella (origin at its tip on the ground)
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "public", "models")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
COVER = argv[argv.index("--cover") + 1] if "--cover" in argv else None
R = 11.0  # radius of the water

# --- Helpers -------------------------------------------------------------------------


def rgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (0, 2, 4))


def material(name, color, metallic=0.0, roughness=0.55, emission=None, strength=1.0, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if not m.node_tree:
        m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb(color), 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*rgb(emission), 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
    m.diffuse_color = (*rgb(color), 1)
    return m


M = {}


def mat(key):
    return M[key]


def make_materials():
    spec = {
        "duck_body": ("#ffffff", 0.32),
        "boat_ring": ("#ffffff", 0.3),
        "boat_stripe": ("#ffffff", 0.35),
        "boat_floor": ("#bfe9ff", 0.5),
        "beak": ("#ff8a1f", 0.35),
        "eye_white": ("#ffffff", 0.25),
        "eye_black": ("#1d1630", 0.2),
        "cheek": ("#ff8fb1", 0.6),
        "gold": ("#ffc61a", 0.3),
        "red": ("#ff4d5e", 0.4),
        "pink": ("#ff7ab8", 0.4),
        "navy": ("#244a9e", 0.5),
        "white": ("#ffffff", 0.45),
        "black": ("#1d1630", 0.25),
        "gem_blue": ("#3ec7ff", 0.15),
        "gem_red": ("#ff3d6e", 0.15),
        "leaf": ("#5cc23b", 0.6),
        "leaf_dark": ("#3a9a2c", 0.65),
        "petal": ("#ff9ccb", 0.5),
        "flower_mid": ("#ffd23f", 0.5),
        "gift_box": ("#7b5cff", 0.4),
        "gift_ribbon": ("#ffd23f", 0.35),
        "frog": ("#6fd14a", 0.45),
        "frog_belly": ("#d9f59a", 0.55),
        "paper": ("#fdf8ec", 0.7),
        "paper_line": ("#7ab8ff", 0.7),
        "paper_sail": ("#bfe0ff", 0.7),
        "enamel": ("#fbfcff", 0.18),
        "tile_a": ("#c4e6f5", 0.35),
        "tile_b": ("#f2f9fc", 0.35),
        "grout": ("#b6d3e2", 0.8),
        "chrome": ("#d8e4ee", 0.12),
        "foam": ("#ffffff", 0.8),
        "bottle_pink": ("#ff8fc8", 0.25),
        "bottle_teal": ("#45d6c4", 0.25),
        "soap": ("#ffd6ec", 0.4),
        "mat_lilac": ("#c8a8ff", 0.9),
        "grass": ("#7ccf4a", 0.85),
        "grass_dark": ("#55ad3b", 0.85),
        "mud": ("#8a6244", 0.8),
        "rock": ("#a3a8b5", 0.8),
        "bark": ("#8b5a3c", 0.85),
        "reed": ("#4f9a3a", 0.7),
        "cattail": ("#7a4a2c", 0.8),
        "wood": ("#c98b55", 0.8),
        "flower_red": ("#ff5d6c", 0.5),
        "flower_blue": ("#6fa8ff", 0.5),
        "flower_white": ("#ffffff", 0.5),
        "mushroom": ("#ff5050", 0.4),
        "path": ("#7e8794", 0.85),
        "leaf_orange": ("#ff9a2e", 0.7),
        "leaf_red": ("#e9483f", 0.7),
        "leaf_yellow": ("#ffcc33", 0.7),
        "boot": ("#ff4d5e", 0.25),
        "boot_sole": ("#3b3550", 0.6),
        "umbrella_a": ("#ffd23f", 0.4),
        "umbrella_b": ("#ff9a2e", 0.4),
        "snail_shell": ("#d98a4a", 0.4),
        "snail_body": ("#cfe0a0", 0.5),
        "puddle_grass": ("#69b04a", 0.85),
    }
    for name, (c, r) in spec.items():
        M[name] = material(name, c, roughness=r)
    M["star"] = material("star_gold", "#ffd23f", roughness=0.25, emission="#ffb800", strength=0.35)


def link(obj, parent=None):
    if obj.name not in bpy.context.collection.objects:
        bpy.context.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def root(name):
    return link(bpy.data.objects.new(name, None))


def xf(bm, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    if not isinstance(scale, (tuple, list, Vector)):
        scale = (scale, scale, scale)
    m = Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm


def obj(name, bm, material_key, parent, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new(name, me), parent)
    o.data.materials.append(mat(material_key) if isinstance(material_key, str) else material_key)
    for p in me.polygons:
        p.use_smooth = smooth
    return o


def sphere(r, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), segs=16, rings=10):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    xf(bm, scale=scale)
    return xf(bm, loc, rot)


def ico(r, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), subd=1, jitter=0.0, seed=0):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subd, radius=r)
    if jitter:
        rnd = random.Random(seed)
        for v in bm.verts:
            v.co *= 1 + (rnd.random() - 0.5) * jitter
    xf(bm, scale=scale)
    return xf(bm, loc, rot)


def cyl(r1, r2, depth, loc=(0, 0, 0), rot=(0, 0, 0), segs=12, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=depth)
    xf(bm, scale=scale)
    return xf(bm, loc, rot)


def box(size, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    xf(bm, scale=size)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES", profile=0.5, clamp_overlap=True)
    return xf(bm, loc, rot)


def torus(major, minor, loc=(0, 0, 0), rot=(0, 0, 0), segs=24, sides=10, scale=(1, 1, 1), arc=2 * math.pi):
    bm = bmesh.new()
    full = arc >= 2 * math.pi - 1e-6
    n = segs if full else segs + 1
    rings = []
    for i in range(n):
        a = arc * i / segs
        c, s = math.cos(a), math.sin(a)
        rings.append([bm.verts.new(((major + minor * math.cos(2 * math.pi * k / sides)) * c,
                                    (major + minor * math.cos(2 * math.pi * k / sides)) * s,
                                    minor * math.sin(2 * math.pi * k / sides))) for k in range(sides)])
    for i in range(n if full else n - 1):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(sides):
            bm.faces.new((a[k], b[k], b[(k + 1) % sides], a[(k + 1) % sides]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    xf(bm, scale=scale)
    return xf(bm, loc, rot)


def lathe(profile, segs=32, loc=(0, 0, 0)):
    """Spin (radius, z) points around Z. Radius 0 at an end makes a pole."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r < 1e-5:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * k / segs), r * math.sin(2 * math.pi * k / segs), z)) for k in range(segs)])
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(segs):
            k2 = (k + 1) % segs
            if len(a) == 1:
                bm.faces.new((a[0], b[k], b[k2]))
            elif len(b) == 1:
                bm.faces.new((a[k], b[0], a[k2]))
            else:
                bm.faces.new((a[k], b[k], b[k2], a[k2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return xf(bm, loc)


def star_prism(r_out, r_in, depth, points=5, loc=(0, 0, 0), rot=(0, 0, 0), puff=0.0):
    """A chunky star in the XZ plane (facing -Y), optionally puffed in the middle."""
    bm = bmesh.new()
    front, back = [], []
    for i in range(points * 2):
        a = math.pi / 2 + i * math.pi / points
        r = r_out if i % 2 == 0 else r_in
        x, z = r * math.cos(a), r * math.sin(a)
        front.append(bm.verts.new((x, -depth / 2, z)))
        back.append(bm.verts.new((x, depth / 2, z)))
    cf = bm.verts.new((0, -depth / 2 - puff, 0))
    cb = bm.verts.new((0, depth / 2 + puff, 0))
    n = len(front)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((cf, front[j], front[i]))
        bm.faces.new((cb, back[i], back[j]))
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return xf(bm, loc, rot)


def merge(name, parts, parent=None, smooth=True):
    """parts: list of (bmesh, material_key). One object, one material slot per material."""
    keys = []
    for _, k in parts:
        if k not in keys:
            keys.append(k)
    out = bmesh.new()
    for bm, k in parts:
        me = bpy.data.meshes.new("tmp")
        bm.to_mesh(me)
        bm.free()
        idx = keys.index(k)
        for p in me.polygons:
            p.material_index = idx
        out.from_mesh(me)
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name)
    out.to_mesh(me)
    out.free()
    o = link(bpy.data.objects.new(name, me), parent)
    for k in keys:
        o.data.materials.append(mat(k))
    for p in me.polygons:
        p.use_smooth = smooth
    return o


def eye(x, y, z, r=0.1, look=(0, -1, 0)):
    """White, pupil and a sparkle, facing -Y."""
    parts = [(sphere(r, (x, y, z), scale=(1, 0.6, 1.15), segs=12, rings=8), "eye_white"),
             (sphere(r * 0.62, (x + look[0] * 0.01, y - r * 0.42, z - r * 0.08), scale=(1, 0.5, 1.15), segs=10, rings=6), "eye_black"),
             (sphere(r * 0.24, (x + r * 0.25, y - r * 0.72, z + r * 0.35), segs=6, rings=4), "eye_white")]
    return parts


# --- Ducks -----------------------------------------------------------------------------

HEAD = Vector((0, -0.2, 1.02))
HEAD_R = 0.4


def build_duck():
    rt = root("duck")
    parts = []
    # Body: a plump egg, tail perking up behind.
    parts.append((sphere(0.6, (0, 0.05, 0.48), scale=(1.0, 1.12, 0.72), segs=20, rings=12), "duck_body"))
    parts.append((sphere(0.28, (0, 0.6, 0.7), scale=(0.9, 1.0, 0.9), rot=(math.radians(-35), 0, 0), segs=12, rings=8), "duck_body"))
    # Wings
    for s in (-1, 1):
        parts.append((sphere(0.26, (s * 0.56, 0.12, 0.55), scale=(0.35, 1.1, 0.75), rot=(math.radians(-15), 0, 0), segs=12, rings=8), "duck_body"))
    # Head
    parts.append((sphere(HEAD_R, HEAD, scale=(1, 0.98, 0.95), segs=20, rings=12), "duck_body"))
    # Beak: a smiling flattened bill
    parts.append((sphere(0.2, (0, HEAD.y - 0.4, HEAD.z - 0.08), scale=(1.1, 0.9, 0.42), segs=14, rings=8), "beak"))
    parts.append((sphere(0.16, (0, HEAD.y - 0.36, HEAD.z - 0.17), scale=(1.0, 0.85, 0.32), segs=12, rings=6), "beak"))
    # Eyes and cheeks
    for s in (-1, 1):
        parts += eye(s * 0.16, HEAD.y - 0.31, HEAD.z + 0.1, r=0.1)
        parts.append((sphere(0.07, (s * 0.27, HEAD.y - 0.28, HEAD.z - 0.08), scale=(1, 0.4, 0.7), segs=8, rings=5), "cheek"))
    merge("duck_mesh", parts, rt)
    return rt


def build_boat():
    rt = root("boat")
    parts = []
    # The inflatable tube, in 8 coloured and 8 white segments.
    n = 16
    for i in range(n):
        a0 = 2 * math.pi * i / n
        t = torus(0.86, 0.27, loc=(0, 0, 0.16), rot=(0, 0, a0), segs=3, sides=12, arc=2 * math.pi / n)
        parts.append((t, "boat_ring" if i % 2 == 0 else "boat_stripe"))
    # Floor and a little rim
    parts.append((cyl(0.82, 0.82, 0.12, loc=(0, 0, 0.02), segs=24), "boat_floor"))
    # Grab handles
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        parts.append((torus(0.1, 0.03, loc=(1.12 * math.cos(a), 1.12 * math.sin(a), 0.28), rot=(math.pi / 2, 0, a + math.pi / 2), segs=10, sides=5), "boat_stripe"))
    merge("boat_mesh", parts, rt)
    return rt


def build_accessories():
    top = HEAD + Vector((0, 0, HEAD_R * 0.9))
    out = []

    rt = root("acc_tuft")
    parts = []
    for i, (a, s) in enumerate(((-0.35, 0.9), (0.0, 1.1), (0.35, 0.9))):
        parts.append((sphere(0.07, (top.x + a * 0.25, top.y + 0.02, top.z + 0.1 * s), scale=(0.7, 0.7, 2.2), rot=(0, a, 0), segs=8, rings=6), "duck_body"))
    merge("acc_tuft_mesh", parts, rt)
    out.append(rt)

    rt = root("acc_bow")
    p = top + Vector((0.18, 0.02, 0.0))
    parts = [(sphere(0.18, (p.x - 0.15, p.y, p.z + 0.05), scale=(1.0, 0.45, 0.7), rot=(0, 0.35, 0), segs=12, rings=8), "pink"),
             (sphere(0.18, (p.x + 0.15, p.y, p.z + 0.05), scale=(1.0, 0.45, 0.7), rot=(0, -0.35, 0), segs=12, rings=8), "pink"),
             (sphere(0.08, (p.x, p.y - 0.03, p.z + 0.05), segs=10, rings=6), "pink"),
             (sphere(0.035, (p.x - 0.18, p.y - 0.08, p.z + 0.07), segs=6, rings=4), "white"),
             (sphere(0.035, (p.x + 0.12, p.y - 0.08, p.z + 0.02), segs=6, rings=4), "white")]
    merge("acc_bow_mesh", parts, rt)
    out.append(rt)

    rt = root("acc_sailor")
    parts = [(cyl(0.34, 0.3, 0.16, loc=(top.x, top.y, top.z + 0.02), rot=(math.radians(-8), 0, 0), segs=20), "white"),
             (torus(0.33, 0.06, loc=(top.x, top.y, top.z - 0.05), rot=(math.radians(-8), 0, 0), segs=20, sides=6), "white"),
             (cyl(0.3, 0.3, 0.05, loc=(top.x, top.y + 0.01, top.z + 0.09), rot=(math.radians(-8), 0, 0), segs=20), "navy"),
             (sphere(0.07, (top.x, top.y - 0.33, top.z), scale=(1.3, 0.5, 0.9), segs=8, rings=5), "navy")]
    merge("acc_sailor_mesh", parts, rt)
    out.append(rt)

    rt = root("acc_crown")
    parts = [(cyl(0.24, 0.27, 0.16, loc=(top.x, top.y, top.z + 0.05), segs=10), "gold")]
    for k in range(5):
        a = 2 * math.pi * k / 5 - math.pi / 2
        parts.append((cyl(0.08, 0.0, 0.2, loc=(top.x + 0.24 * math.cos(a), top.y + 0.24 * math.sin(a), top.z + 0.22), segs=6), "gold"))
        parts.append((sphere(0.04, (top.x + 0.24 * math.cos(a), top.y + 0.24 * math.sin(a), top.z + 0.33), segs=6, rings=4), "gold"))
    parts.append((sphere(0.06, (top.x, top.y - 0.26, top.z + 0.05), scale=(1, 0.5, 1), segs=8, rings=5), "gem_red"))
    parts.append((sphere(0.05, (top.x - 0.2, top.y - 0.16, top.z + 0.05), scale=(1, 0.5, 1), segs=8, rings=5), "gem_blue"))
    parts.append((sphere(0.05, (top.x + 0.2, top.y - 0.16, top.z + 0.05), scale=(1, 0.5, 1), segs=8, rings=5), "gem_blue"))
    merge("acc_crown_mesh", parts, rt)
    out.append(rt)

    rt = root("acc_shades")
    ey = HEAD.y - 0.4
    ez = HEAD.z + 0.1
    parts = []
    for s in (-1, 1):
        parts.append((cyl(0.13, 0.13, 0.04, loc=(s * 0.17, ey, ez), rot=(math.pi / 2, 0, 0), segs=14, scale=(1.15, 1, 1)), "black"))
        parts.append((sphere(0.03, (s * 0.12, ey - 0.03, ez + 0.05), segs=6, rings=4), "white"))
        parts.append((box((0.06, 0.4, 0.04), (s * 0.34, ey + 0.2, ez + 0.02), bevel=0.01), "black"))
    parts.append((box((0.12, 0.04, 0.04), (0, ey, ez + 0.03), bevel=0.01), "black"))
    merge("acc_shades_mesh", parts, rt)
    out.append(rt)

    rt = root("acc_flower")
    p = top + Vector((-0.12, 0.05, 0.02))
    parts = [(sphere(0.07, (p.x, p.y, p.z + 0.04), scale=(1, 1, 0.6), segs=10, rings=6), "flower_mid")]
    for k in range(6):
        a = 2 * math.pi * k / 6
        parts.append((sphere(0.08, (p.x + 0.12 * math.cos(a), p.y + 0.12 * math.sin(a), p.z + 0.02), scale=(1.2, 0.8, 0.45), rot=(0, 0, a), segs=8, rings=5), "petal"))
    parts.append((sphere(0.07, (p.x + 0.12, p.y + 0.1, p.z - 0.02), scale=(1.6, 0.7, 0.3), rot=(0, 0, 0.6), segs=8, rings=4), "leaf"))
    merge("acc_flower_mesh", parts, rt)
    out.append(rt)
    return out


# --- Items -----------------------------------------------------------------------------

def face_parts(cx, cy, cz, spread=0.17, r=0.08, smile=0.12):
    parts = []
    for s in (-1, 1):
        parts += eye(cx + s * spread, cy, cz + 0.06, r=r)
        parts.append((sphere(r * 0.7, (cx + s * spread * 1.6, cy + 0.01, cz - 0.08), scale=(1, 0.3, 0.6), segs=8, rings=4), "cheek"))
    t = torus(smile, 0.025, loc=(cx, cy - 0.02, cz - 0.04), rot=(math.pi / 2, 0, 0), segs=10, sides=5, arc=math.pi)
    xf(t, rot=(0, math.pi, 0), loc=(0, 0, 0))
    # torus arc starts at +X; rotated so it's a smile below the eyes
    parts.append((t, "eye_black"))
    return parts


def smile_arc(cx, cy, cz, w=0.12, thick=0.025):
    bm = torus(w, thick, segs=10, sides=5, arc=math.pi)
    # arc in the XY plane from +X to -X through +Y; turn it into XZ, curving down.
    xf(bm, rot=(-math.pi / 2, 0, 0))
    return xf(bm, (cx, cy, cz))


def build_items():
    out = []
    # Star
    rt = root("star")
    parts = [(star_prism(0.75, 0.36, 0.3, puff=0.16), "star")]
    for s in (-1, 1):
        parts += eye(s * 0.15, -0.28, 0.08, r=0.08)
        parts.append((sphere(0.05, (s * 0.27, -0.24, -0.04), scale=(1, 0.3, 0.6), segs=8, rings=4), "cheek"))
    parts.append((smile_arc(0, -0.27, -0.02, 0.1, 0.022), "eye_black"))
    merge("star_mesh", parts, rt)
    out.append(rt)

    # Gift box
    rt = root("gift")
    parts = [(box((0.9, 0.9, 0.8), (0, 0, 0.4), bevel=0.06), "gift_box"),
             (box((0.98, 0.98, 0.18), (0, 0, 0.84), bevel=0.05), "gift_box"),
             (box((0.2, 0.94, 0.82), (0, 0, 0.4)), "gift_ribbon"),
             (box((0.94, 0.2, 0.82), (0, 0, 0.4)), "gift_ribbon"),
             (box((0.22, 1.02, 0.2), (0, 0, 0.84)), "gift_ribbon"),
             (box((1.02, 0.22, 0.2), (0, 0, 0.84)), "gift_ribbon")]
    for s in (-1, 1):
        parts.append((torus(0.16, 0.06, loc=(s * 0.16, 0, 1.02), rot=(math.pi / 2, s * 0.5, 0), segs=12, sides=6), "gift_ribbon"))
    parts.append((sphere(0.08, (0, 0, 0.98), segs=8, rings=6), "gift_ribbon"))
    # A question mark on two sides: a hook over a stem and a dot.
    for side in (-1, 1):
        y = side * 0.47
        hook = torus(0.14, 0.05, segs=12, sides=6, arc=math.pi * 1.5)
        xf(hook, rot=(0, 0, -math.pi / 2))  # start at the bottom middle, curl round to the left
        xf(hook, rot=(math.pi / 2, 0, 0 if side < 0 else math.pi), loc=(0, y, 0.6))
        parts.append((hook, "white"))
        parts.append((box((0.09, 0.06, 0.12), (0.0, y, 0.41)), "white"))
        parts.append((sphere(0.055, (0.0, y, 0.24), scale=(1, 0.6, 1), segs=8, rings=5), "white"))
    merge("gift_mesh", parts, rt)
    out.append(rt)

    # Lily pad with a flower
    rt = root("lily_pad")
    bm = bmesh.new()
    n = 28
    c = bm.verts.new((0, 0, 0.06))
    ring = []
    for i in range(n + 1):
        a = math.radians(14) + (2 * math.pi - math.radians(28)) * i / n
        wob = 1 + 0.04 * math.sin(a * 5)
        ring.append(bm.verts.new((1.3 * wob * math.cos(a - math.pi / 2), 1.3 * wob * math.sin(a - math.pi / 2), 0.04)))
    for i in range(n):
        bm.faces.new((c, ring[i], ring[i + 1]))
    bm.faces.new((c, ring[-1], ring[0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ext = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))
    verts = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, -0.08), verts=verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    parts = [(bm, "leaf")]
    for k in range(5):
        a = 2 * math.pi * k / 5
        parts.append((cyl(0.02, 0.02, 1.0, loc=(0.5 * math.cos(a), 0.5 * math.sin(a), 0.07), rot=(0, math.pi / 2, a), segs=4), "leaf_dark"))
    fp = Vector((0.55, 0.45, 0.1))
    parts.append((sphere(0.12, fp + Vector((0, 0, 0.08)), scale=(1, 1, 0.6), segs=10, rings=6), "flower_mid"))
    for k in range(8):
        a = 2 * math.pi * k / 8
        parts.append((sphere(0.16, fp + Vector((0.16 * math.cos(a), 0.16 * math.sin(a), 0.12)), scale=(1.3, 0.55, 0.5), rot=(0, -0.6, a), segs=8, rings=5), "petal"))
    merge("lily_pad_mesh", parts, rt)
    out.append(rt)

    # Frog
    rt = root("frog")
    parts = [(sphere(0.42, (0, 0.05, 0.32), scale=(1.0, 1.05, 0.75), segs=16, rings=10), "frog"),
             (sphere(0.32, (0, -0.12, 0.26), scale=(0.9, 0.8, 0.7), segs=12, rings=8), "frog_belly")]
    for s in (-1, 1):
        parts.append((sphere(0.15, (s * 0.2, -0.12, 0.62), segs=12, rings=8), "frog"))
        parts += eye(s * 0.2, -0.24, 0.66, r=0.1)
        parts.append((sphere(0.16, (s * 0.38, 0.2, 0.12), scale=(0.8, 1.3, 0.5), segs=10, rings=6), "frog"))
        parts.append((sphere(0.1, (s * 0.26, -0.36, 0.06), scale=(1.2, 1.4, 0.4), segs=8, rings=5), "frog"))
        parts.append((sphere(0.05, (s * 0.3, -0.3, 0.38), scale=(1, 0.4, 0.6), segs=6, rings=4), "cheek"))
    parts.append((smile_arc(0, -0.37, 0.4, 0.15, 0.025), "eye_black"))
    merge("frog_mesh", parts, rt)
    out.append(rt)

    # Paper boat: a folded hull with a tent-shaped sail on top (readable from above), front towards -Y.
    rt = root("paper_boat")
    bm = bmesh.new()
    L, W, H = 1.0, 0.5, 0.42
    v = [bm.verts.new(p) for p in [(-0.6, 0, -0.05), (0.6, 0, -0.05), (-L, -W, H), (L, -W, H), (-L, W, H), (L, W, H)]]
    for f in ((0, 1, 3, 2), (1, 0, 4, 5), (0, 2, 4), (1, 5, 3), (2, 3, 5, 4)):
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    xf(bm, rot=(0, 0, math.pi / 2))
    sail = bmesh.new()
    sv = [sail.verts.new(p) for p in [(-0.55, -W * 0.9, H), (0.55, -W * 0.9, H), (0.55, W * 0.9, H), (-0.55, W * 0.9, H), (0, 0, H + 0.75)]]
    for f in ((0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)):
        sail.faces.new([sv[i] for i in f])
    bmesh.ops.recalc_face_normals(sail, faces=sail.faces)
    xf(sail, rot=(0, 0, math.pi / 2))
    parts = [(bm, "paper"), (sail, "paper_sail"),
             (cyl(0.025, 0.025, 0.5, loc=(0, 0, H + 0.95), segs=4), "bark")]
    flag = bmesh.new()
    fv = [flag.verts.new(p) for p in [(0, 0, H + 1.18), (0, 0, H + 0.92), (0.38, 0, H + 1.05)]]
    flag.faces.new(fv)
    parts.append((flag, "red"))
    merge("paper_boat_mesh", parts, rt, smooth=False)
    out.append(rt)
    return out


# --- Arenas ----------------------------------------------------------------------------

def quad(w, h, loc, vertical=False):
    """A single flat tile: in the XY plane, or upright in the XZ plane facing -Y."""
    bm = bmesh.new()
    pts = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    if vertical:
        bm.faces.new([bm.verts.new((x, 0, z)) for x, z in pts])
    else:
        bm.faces.new([bm.verts.new((x, y, 0)) for x, y in pts])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if vertical and f.normal.y > 0 or not vertical and f.normal.z < 0:
            f.normal_flip()
    return xf(bm, loc)


def ring_positions(n, radius, start=0.0, jitter=0.0, rnd=None, skip_front=False):
    out = []
    for i in range(n):
        a = start + 2 * math.pi * i / n + (rnd.uniform(-jitter, jitter) if rnd else 0)
        if skip_front and -2.2 < a % (2 * math.pi) - 3 * math.pi / 2 < 2.2:
            continue
        out.append((a, radius * math.cos(a), radius * math.sin(a)))
    return out


def build_bath():
    rt = root("arena_bath")
    rnd = random.Random(3)
    parts = []
    # The round tub: inside wall from below the water up over a fat rounded rim and down to the floor.
    prof = [(R - 0.6, -1.4), (R, -0.6), (R + 0.05, 0.2), (R + 0.25, 0.75), (R + 0.6, 0.98), (R + 1.0, 1.0), (R + 1.35, 0.85),
            (R + 1.55, 0.5), (R + 1.55, -1.0), (R + 1.4, -2.6), (R + 1.2, -3.0)]
    parts.append((lathe(prof, segs=64), "enamel"))
    # Tiled floor, a ring of squares around the tub (checker of two blues/whites).
    tile = 3.0
    floor_z = -3.0
    for ix in range(-12, 12):
        for iy in range(-12, 12):
            x, y = (ix + 0.5) * tile, (iy + 0.5) * tile
            d = math.hypot(x, y)
            if d < R + 0.6 or d > 34:
                continue
            parts.append((quad(tile * 0.96, tile * 0.96, (x, y, floor_z)), "tile_a" if (ix + iy) % 2 else "tile_b"))
    parts.append((lathe([(R + 1.0, floor_z - 0.02), (36, floor_z - 0.02)], segs=32), "grout"))
    parts.append((quad(74, 17, (0, 19.08, floor_z + 8), vertical=True), "grout"))
    # Back wall with tiles
    for ix in range(-12, 12):
        for iz in range(0, 6):
            x = (ix + 0.5) * tile
            parts.append((quad(tile * 0.96, tile * 0.96, (x, 19.0, floor_z + (iz + 0.5) * tile), vertical=True), "tile_b" if (ix + iz) % 2 else "tile_a"))
    # Fluffy oval bath mat in front: pom-pom fringe and big soap-bubble dots, so it reads as a toy mat, not a slab.
    mx, my, ma, mb = 0.0, -16.5, 5.4, 2.5
    parts.append((cyl(1, 1, 0.3, loc=(mx, my, floor_z + 0.15), segs=48, scale=(ma, mb, 1)), "mat_lilac"))
    for k in range(30):
        a = 2 * math.pi * k / 30
        parts.append((ico(0.36, (mx + math.cos(a) * (ma + 0.05), my + math.sin(a) * (mb + 0.05), floor_z + 0.3), subd=1, jitter=0.08, seed=k), "white"))
    for (bx, by, br) in [(-3.1, 0.6, 0.75), (-1.2, -0.9, 0.55), (0.6, 0.8, 0.9), (2.6, -0.5, 0.65), (3.6, 1.0, 0.4), (-3.4, -1.1, 0.35), (1.8, 1.6, 0.3)]:
        parts.append((cyl(br, br, 0.06, loc=(mx + bx, my + by, floor_z + 0.32), segs=24), "white"))
        parts.append((cyl(br * 0.62, br * 0.62, 0.07, loc=(mx + bx, my + by, floor_z + 0.33), segs=20), "mat_lilac"))
    # Tap at the back of the rim
    parts.append((cyl(0.35, 0.4, 0.9, loc=(0, R + 0.9, 1.4)), "chrome"))
    tap = torus(1.0, 0.24, segs=12, sides=8, arc=math.pi)
    xf(tap, rot=(math.pi / 2, 0, math.pi / 2), loc=(0, R + 0.0, 1.8))
    parts.append((tap, "chrome"))
    parts.append((cyl(0.3, 0.26, 0.4, loc=(0, R - 1.0, 1.6)), "chrome"))
    for s in (-1, 1):
        parts.append((cyl(0.3, 0.3, 0.25, loc=(s * 1.4, R + 0.9, 1.15)), "chrome"))
        parts.append((sphere(0.28, (s * 1.4, R + 0.9, 1.4), scale=(1, 1, 0.6), segs=12, rings=8), "red" if s < 0 else "gem_blue"))
    # Shampoo bottles and soap on the rim (back right) and a sponge (back left)
    a = math.radians(55)
    bx, by = (R + 0.8) * math.cos(a), (R + 0.8) * math.sin(a)
    parts.append((box((0.9, 0.6, 1.8), (bx, by, 1.9), rot=(0, 0, a), bevel=0.25), "bottle_pink"))
    parts.append((cyl(0.15, 0.15, 0.35, loc=(bx, by, 3.0)), "white"))
    a = math.radians(70)
    bx, by = (R + 0.8) * math.cos(a), (R + 0.8) * math.sin(a)
    parts.append((cyl(0.4, 0.4, 1.4, loc=(bx, by, 1.7), segs=14), "bottle_teal"))
    parts.append((cyl(0.2, 0.12, 0.3, loc=(bx, by, 2.55)), "white"))
    a = math.radians(30)
    parts.append((box((1.0, 0.6, 0.35), ((R + 0.8) * math.cos(a), (R + 0.8) * math.sin(a), 1.2), rot=(0, 0, a + 0.3), bevel=0.15), "soap"))
    a = math.radians(125)
    parts.append((box((1.2, 0.8, 0.5), ((R + 0.8) * math.cos(a), (R + 0.8) * math.sin(a), 1.25), rot=(0, 0, a), bevel=0.12), "gift_ribbon"))
    # Foam piles all around the rim
    for (a, x, y) in ring_positions(14, R + 0.2, start=0.1, jitter=0.15, rnd=rnd):
        for k in range(3):
            parts.append((ico(0.35 + rnd.random() * 0.25, (x + rnd.uniform(-0.4, 0.4), y + rnd.uniform(-0.4, 0.4), 0.85 + rnd.random() * 0.2), subd=1, jitter=0.2, seed=k), "foam"))
    o = merge("arena_bath_mesh", parts, rt)
    return rt


def tree(parts, x, y, z, s, rnd):
    parts.append((cyl(0.35 * s, 0.25 * s, 3.0 * s, loc=(x, y, z + 1.5 * s), segs=8), "bark"))
    for k in range(3):
        parts.append((ico(1.4 * s * (1 - k * 0.15), (x + rnd.uniform(-0.6, 0.6) * s, y + rnd.uniform(-0.6, 0.6) * s, z + (3.2 + k * 0.9) * s), subd=1, jitter=0.25, seed=k), "leaf" if k % 2 else "leaf_dark"))


def flower(parts, x, y, z, key, s=1.0):
    parts.append((cyl(0.03, 0.03, 0.6 * s, loc=(x, y, z + 0.3 * s), segs=4), "leaf_dark"))
    parts.append((sphere(0.09 * s, (x, y, z + 0.62 * s), segs=8, rings=5), "flower_mid"))
    for k in range(5):
        a = 2 * math.pi * k / 5
        parts.append((sphere(0.12 * s, (x + 0.13 * s * math.cos(a), y + 0.13 * s * math.sin(a), z + 0.62 * s), scale=(1, 1, 0.5), segs=6, rings=4), key))


def build_pond():
    rt = root("arena_pond")
    rnd = random.Random(7)
    parts = []
    ground = 0.55
    prof = [(R - 0.8, -1.2), (R - 0.1, -0.3), (R + 0.3, 0.25), (R + 1.0, ground), (40, ground)]
    parts.append((lathe(prof, segs=64), "grass"))
    # Mud bank just at the waterline
    parts.append((torus(R + 0.05, 0.28, loc=(0, 0, 0.02), segs=64, sides=6, scale=(1, 1, 0.45)), "mud"))
    # Rocks
    for (a, x, y) in ring_positions(16, R + 0.5, start=0.2, jitter=0.15, rnd=rnd):
        parts.append((ico(0.35 + rnd.random() * 0.45, (x, y, 0.35), scale=(1.2, 1, 0.7), subd=1, jitter=0.35, seed=int(a * 10)), "rock"))
    # Reeds with cattails in clumps (not at the front so the camera sees the water)
    for (a, x, y) in ring_positions(9, R + 1.3, start=0.4, jitter=0.2, rnd=rnd, skip_front=True):
        for k in range(5):
            h = 1.6 + rnd.random() * 1.0
            px, py = x + rnd.uniform(-0.5, 0.5), y + rnd.uniform(-0.5, 0.5)
            parts.append((cyl(0.045, 0.03, h, loc=(px, py, ground + h / 2), rot=(rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), 0), segs=5), "reed"))
            if k % 2 == 0:
                parts.append((cyl(0.1, 0.1, 0.45, loc=(px, py, ground + h - 0.1), segs=6), "cattail"))
    # Trees behind and to the sides
    for (a, x, y) in ring_positions(11, R + 7, start=0.1, jitter=0.12, rnd=rnd, skip_front=True):
        tree(parts, x, y, ground, 1.1 + rnd.random() * 0.5, rnd)
    # Bushes
    for (a, x, y) in ring_positions(14, R + 3.5, start=0.3, jitter=0.2, rnd=rnd):
        parts.append((ico(0.9 + rnd.random() * 0.4, (x, y, ground + 0.5), scale=(1.3, 1.3, 0.9), subd=1, jitter=0.3, seed=int(a * 7)), "leaf_dark" if rnd.random() < 0.5 else "leaf"))
    # Flowers
    for i in range(40):
        a = rnd.random() * 2 * math.pi
        d = R + 1.6 + rnd.random() * 6
        flower(parts, d * math.cos(a), d * math.sin(a), ground, ("flower_red", "flower_blue", "flower_white", "petal")[i % 4], 1.2)
    # Mushrooms
    for i in range(5):
        a = rnd.random() * 2 * math.pi
        d = R + 2.2 + rnd.random() * 3
        x, y = d * math.cos(a), d * math.sin(a)
        parts.append((cyl(0.12, 0.15, 0.4, loc=(x, y, ground + 0.2), segs=8), "white"))
        parts.append((sphere(0.35, (x, y, ground + 0.4), scale=(1, 1, 0.6), segs=10, rings=6), "mushroom"))
    # A little wooden dock on the right side
    a = math.radians(-20)
    for k in range(6):
        d = R - 1.2 + k * 0.62
        parts.append((box((0.56, 2.4, 0.16), (d * math.cos(a), d * math.sin(a), 0.62), rot=(0, 0, a), bevel=0.03), "wood"))
    for k in (0, 5):
        d = R - 1.2 + k * 0.62
        for s in (-1, 1):
            px, py = d * math.cos(a) - s * 1.1 * math.sin(a), d * math.sin(a) + s * 1.1 * math.cos(a)
            parts.append((cyl(0.14, 0.14, 2.0, loc=(px, py, 0.1), segs=8), "bark"))
    merge("arena_pond_mesh", parts, rt)
    return rt


def leaf(parts, x, y, z, key, a, s=1.0):
    bm = bmesh.new()
    v = [bm.verts.new(p) for p in [(0, -0.4 * s, 0), (0.22 * s, 0, 0.03), (0, 0.4 * s, 0), (-0.22 * s, 0, 0.03)]]
    bm.faces.new(v)
    xf(bm, rot=(0, 0, a), loc=(x, y, z))
    parts.append((bm, key))


def build_puddle():
    rt = root("arena_puddle")
    rnd = random.Random(11)
    parts = []
    ground = 0.4
    prof = [(R - 0.8, -1.0), (R - 0.1, -0.2), (R + 0.4, 0.2), (R + 2.2, ground), (40, ground)]
    parts.append((lathe(prof, segs=64), "puddle_grass"))
    parts.append((torus(R + 0.4, 0.6, loc=(0, 0, 0.0), segs=64, sides=6, scale=(1, 1, 0.45)), "mud"))
    # Pebbles
    for (a, x, y) in ring_positions(26, R + 0.6, start=0.0, jitter=0.1, rnd=rnd):
        parts.append((ico(0.18 + rnd.random() * 0.25, (x, y, 0.22), scale=(1.2, 1, 0.6), subd=1, jitter=0.3, seed=int(a * 13)), "rock" if rnd.random() < 0.7 else "path"))
    # Autumn leaves everywhere on the ground
    for i in range(90):
        a = rnd.random() * 2 * math.pi
        d = R + 0.8 + rnd.random() * 10
        leaf(parts, d * math.cos(a), d * math.sin(a), ground + 0.03, ("leaf_orange", "leaf_red", "leaf_yellow")[i % 3], rnd.random() * 6.3, 1.0 + rnd.random() * 0.6)
    # Path stones behind
    for k in range(9):
        a = math.radians(60 + k * 7)
        d = R + 4 + k * 0.6
        parts.append((cyl(0.7, 0.7, 0.1, loc=(d * math.cos(a), d * math.sin(a), ground + 0.03), segs=10, scale=(1.2, 1, 1)), "path"))
    # Trees (bare-ish autumn colours)
    for (a, x, y) in ring_positions(10, R + 8, start=0.25, jitter=0.12, rnd=rnd, skip_front=True):
        s = 1.1 + rnd.random() * 0.5
        parts.append((cyl(0.35 * s, 0.25 * s, 3.0 * s, loc=(x, y, ground + 1.5 * s), segs=8), "bark"))
        for k in range(3):
            parts.append((ico(1.3 * s * (1 - k * 0.15), (x + rnd.uniform(-0.6, 0.6) * s, y + rnd.uniform(-0.6, 0.6) * s, ground + (3.1 + k * 0.9) * s), subd=1, jitter=0.25, seed=k),
                          ("leaf_orange", "leaf_yellow", "leaf_red")[(k + int(a * 3)) % 3]))
    # Wellies on the left rim
    a = math.radians(160)
    bx, by = (R + 1.6) * math.cos(a), (R + 1.6) * math.sin(a)
    for s in (-1, 1):
        x, y = bx + s * 0.55, by + 0.3 * s
        parts.append((cyl(0.42, 0.45, 1.6, loc=(x, y, ground + 0.9), segs=14), "boot"))
        parts.append((torus(0.42, 0.08, loc=(x, y, ground + 1.7), segs=14, sides=6), "boot"))
        parts.append((box((0.8, 1.3, 0.5), (x, y - 0.35, ground + 0.25), bevel=0.22), "boot"))
        parts.append((box((0.84, 1.36, 0.12), (x, y - 0.35, ground + 0.06), bevel=0.05), "boot_sole"))
    # A snail on the right
    a = math.radians(15)
    sx, sy = (R + 1.5) * math.cos(a), (R + 1.5) * math.sin(a)
    parts.append((sphere(0.3, (sx, sy, ground + 0.15), scale=(2.4, 0.8, 0.6), rot=(0, 0, a + math.pi / 2), segs=12, rings=6), "snail_body"))
    parts.append((torus(0.32, 0.22, loc=(sx, sy, ground + 0.62), rot=(math.pi / 2, 0, a + math.pi / 2), segs=14, sides=8), "snail_shell"))
    parts.append((sphere(0.22, (sx, sy, ground + 0.62), scale=(1, 0.6, 1), rot=(0, 0, a + math.pi / 2), segs=10, rings=6), "snail_shell"))
    hx, hy = sx - 0.65 * math.sin(a + math.pi / 2), sy + 0.65 * math.cos(a + math.pi / 2)
    hx, hy = sx + 0.7 * math.cos(a + math.pi / 2), sy + 0.7 * math.sin(a + math.pi / 2)
    for s in (-1, 1):
        ex, ey = hx + s * 0.12 * math.cos(a), hy + s * 0.12 * math.sin(a)
        parts.append((cyl(0.03, 0.03, 0.4, loc=(ex, ey, ground + 0.45), segs=4), "snail_body"))
        parts.append((sphere(0.07, (ex, ey, ground + 0.66), segs=8, rings=5), "eye_black"))
    # Grass tufts
    for i in range(40):
        a = rnd.random() * 2 * math.pi
        d = R + 1.5 + rnd.random() * 9
        x, y = d * math.cos(a), d * math.sin(a)
        for k in range(3):
            parts.append((cyl(0.06, 0.0, 0.6, loc=(x + k * 0.1, y, ground + 0.3), rot=((k - 1) * 0.3, 0, a), segs=3), "grass_dark"))
    merge("arena_puddle_mesh", parts, rt)

    um = root("umbrella")
    up = []
    canopy_h = 3.6
    n = 8
    for i in range(n):
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        bm = bmesh.new()
        tip = bm.verts.new((0, 0, canopy_h + 0.9))
        segs = 3
        vs = []
        for k in range(segs + 1):
            a = a0 + (a1 - a0) * k / segs
            sag = 0.25 * math.sin(math.pi * k / segs)
            vs.append(bm.verts.new((2.2 * math.cos(a), 2.2 * math.sin(a), canopy_h - 0.1 + sag * 0.3)))
        for k in range(segs):
            bm.faces.new((tip, vs[k], vs[k + 1]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        up.append((bm, "umbrella_a" if i % 2 == 0 else "umbrella_b"))
    up.append((cyl(0.05, 0.05, canopy_h + 1.1, loc=(0, 0, (canopy_h + 1.1) / 2), segs=6), "bark"))
    up.append((sphere(0.12, (0, 0, canopy_h + 1.1), segs=8, rings=5), "umbrella_b"))
    o = merge("umbrella_mesh", up, um, smooth=False)
    # Two-sided look: also add an inner shell flipped
    return [rt, um]


# --- Export & cover --------------------------------------------------------------------

def export(path, roots):
    bpy.ops.object.select_all(action="DESELECT")
    for rt in roots:
        rt.select_set(True)
        for c in rt.children_recursive:
            c.select_set(True)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                              export_texcoords=False)
    print(f"exported {path} ({os.path.getsize(path)} bytes)")


def enum_id(owner, prop, wanted):
    ids = [i.identifier for i in owner.bl_rna.properties[prop].enum_items]
    for w in (wanted if isinstance(wanted, (list, tuple)) else [wanted]):
        if w in ids:
            return w
    raise RuntimeError(f"{prop}: none of {wanted} in {ids}")


def duplicate_tree(rt, name):
    new_root = rt.copy()
    new_root.name = name
    new_root.hide_render = False
    link(new_root)
    for c in rt.children:
        cc = c.copy()
        cc.data = c.data.copy()
        cc.hide_render = False
        link(cc, new_root)
    return new_root


def tinted_copy(rt, name, body_hex, mat_name):
    """Copies a duck or boat with its own coloured rubber (cover only)."""
    cp = duplicate_tree(rt, name)
    m = bpy.data.materials[mat_name].copy()
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb(body_hex), 1)
    for c in cp.children:
        for i, slot in enumerate(c.data.materials):
            if slot and slot.name == mat_name:
                c.data.materials[i] = m
    return cp


def render_cover(path, arenas, ducks, items):
    scene = bpy.context.scene
    for rt in arenas:
        rt.hide_render = rt.name != "arena_pond"
        for c in rt.children_recursive:
            c.hide_render = rt.hide_render
    # Water
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=R + 0.6)
    water = obj("cover_water", bm, material("cover_water", "#3fb8e8", roughness=0.08), None)
    # Ducks in boats
    duck, boat, accs = ducks
    acc = {a.name: a for a in accs}
    crew = [((-3.2, -2.0), 0.5, "#ffd23f", "#ff4d5e", "acc_tuft"),
            ((0.6, -1.4), -0.6, "#ff9ccb", "#9b5de5", "acc_bow"),
            ((-1.1, 1.6), 2.6, "#7fd3ff", "#244a9e", "acc_sailor"),
            ((3.8, 0.8), -1.9, "#9be564", "#ff9a2e", "acc_shades")]
    for i, ((x, y), yaw, body, ring, a) in enumerate(crew):
        b = tinted_copy(boat, f"cv_boat{i}", ring, "boat_ring")
        d = tinted_copy(duck, f"cv_duck{i}", body, "duck_body")
        h = duplicate_tree(acc[a], f"cv_acc{i}")
        tilt = (0.12 if i in (0, 1) else -0.06, 0.1 * (-1) ** i, yaw)
        for o in (b, d, h):
            o.location = (x, y, 0.0 if o is b else 0.12)
            o.rotation_euler = tilt
    star, gift, lily, frog, paper = items
    for i, (x, y, z) in enumerate([(-1.2, -3.6, 1.0), (2.6, -3.1, 1.3), (4.6, 3.4, 1.0)]):
        s = duplicate_tree(star, f"cv_star{i}")
        s.location = (x, y, z)
        s.rotation_euler = (math.radians(-35), 0, 0.3 * (i - 1))
        s.scale = (0.75, 0.75, 0.75)
    g = duplicate_tree(gift, "cv_gift")
    g.location = (-5.2, 0.8, 0.1)
    g.rotation_euler = (0, 0, 0.5)
    lp = duplicate_tree(lily, "cv_lily")
    lp.location = (5.5, -2.5, 0)
    fr = duplicate_tree(frog, "cv_frog")
    fr.location = (5.5, -2.5, 0.08)
    fr.rotation_euler = (0, 0, 0.6)
    bubble = material("cover_bubble", "#ffffff", roughness=0.02, alpha=0.35)
    bubble.blend_method = "BLEND" if hasattr(bubble, "blend_method") else None
    rnd = random.Random(5)
    for i in range(14):
        x, y = rnd.uniform(-7, 7), rnd.uniform(-5, 4)
        obj(f"cv_bubble{i}", sphere(0.22 + rnd.random() * 0.25, (x, y, 0.6 + rnd.random() * 1.2)), bubble, None)
    # Splash drops near the bump
    for i in range(10):
        a = rnd.random() * math.pi * 2
        obj(f"cv_drop{i}", sphere(0.1 + rnd.random() * 0.06, (-1.3 + math.cos(a) * 0.9, -1.8 + math.sin(a) * 0.9, 1.0 + rnd.random() * 1.0)), material("cover_drop", "#bdeeff", roughness=0.05), None)

    cam = link(bpy.data.objects.new("cover_cam", bpy.data.cameras.new("cover_cam")))
    cam.location = (0.3, -10.8, 7.6)
    target = Vector((0.4, -0.3, 0.2))
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = (target - Vector(cam.location)).to_track_quat("-Z", "Y")
    cam.data.lens = 30
    scene.camera = cam
    sun = link(bpy.data.objects.new("cover_sun", bpy.data.lights.new("cover_sun", "SUN")))
    sun.data.energy = 3.8
    sun.data.angle = math.radians(8)
    sun.rotation_euler = (math.radians(40), math.radians(-15), math.radians(-30))
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*rgb("#bfe6ff"), 1)
    bg.inputs["Strength"].default_value = 0.9
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    for vt in ("Standard", "AgX", "Filmic"):
        try:
            scene.view_settings.view_transform = vt
            break
        except TypeError:
            pass
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.render.image_settings.file_format = enum_id(scene.render.image_settings, "file_format", "JPEG")
    scene.render.image_settings.quality = 88
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    make_materials()
    duck = build_duck()
    boat = build_boat()
    accs = build_accessories()
    export(os.path.join(OUT_DIR, "ducks.glb"), [duck, boat, *accs])
    items = build_items()
    export(os.path.join(OUT_DIR, "items.glb"), items)
    arenas = [build_bath(), build_pond(), *build_puddle()]
    export(os.path.join(OUT_DIR, "arenas.glb"), arenas)
    if COVER:
        for a in accs:
            a.hide_render = True
            for c in a.children_recursive:
                c.hide_render = True
        for o in (duck, boat, *items):
            o.hide_render = True
            for c in o.children_recursive:
                c.hide_render = True
        render_cover(os.path.abspath(COVER), arenas, (duck, boat, accs), items)


main()
