"""
Crash Racers landmarks: exports ../public/models/props.glb with one top-level node per prop.
Each prop stands on its origin and faces Blender +Y (three.js -Z).

  palm        coconut palm (Ubud)
  gate        one half of a Balinese candi bentar split gate (Ubud); the game mirrors it
  cathedral   Helsinki Cathedral: white, green domes, portico, grand stairs
  tram        Helsinki Artic tram, green and white
  staircase   Montreal outdoor curving staircase up to a balcony

Run with:  blender --background --python props.py
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "models", "props.glb")


def material(name, color, metallic=0.0, roughness=0.7, emission=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if not m.node_tree:
        m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = 1.0
    return m


def rgb(hex_color):
    h = hex_color.lstrip("#")
    # sRGB -> linear, so colours match what we pick
    return tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (0, 2, 4))


def add(obj, parent, mat=None, smooth=False):
    if mat:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    obj.parent = parent
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def box(name, size, loc, parent, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return add(o, parent, mat)


def cylinder(name, r, depth, loc, parent, mat, verts=16, rot=(0, 0, 0), r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return add(o, parent, mat, smooth=True)


def dome(name, r, loc, parent, mat, height=1.0, segments=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=12, radius=r, location=loc)
    o = bpy.context.object
    o.name = name
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.001], context="VERTS")
    for v in bm.verts:
        v.co.z *= height
    bm.to_mesh(o.data)
    bm.free()
    return add(o, parent, mat, smooth=True)


def root(name):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    return o


# --- Palm ------------------------------------------------------------------------

def palm():
    r = root("palm")
    bark = material("palm_bark", rgb("#8a6a48"), roughness=0.9)
    bark_dark = material("palm_bark_dark", rgb("#6b4f33"), roughness=0.9)
    frond = material("palm_frond", rgb("#3f8f2f"), roughness=0.6)
    coconut = material("coconut", rgb("#6b4a2a"), roughness=0.7)
    height, segments = 8.0, 10
    top = Vector((0, 0, 0))
    for i in range(segments):
        t = i / segments
        lean = Vector((0.9 * t * t, 0.2 * t, 0))
        z = height * t
        seg_h = height / segments
        c = cylinder(f"palm_trunk_{i}", 0.26 - 0.08 * t, seg_h * 1.02, (lean.x, lean.y, z + seg_h / 2), r,
                     bark if i % 2 else bark_dark, verts=10, r2=0.23 - 0.08 * t)
        top = Vector((lean.x, lean.y, z + seg_h))
    for k in range(9):
        a = k / 9 * math.pi * 2
        # A frond: a strip bent downwards, with leaflets
        bm = bmesh.new()
        n = 8
        prev = None
        for s in range(n + 1):
            u = s / n
            length = 3.6
            pos = Vector((math.cos(a) * u * length, math.sin(a) * u * length, 0.5 * u - 1.6 * u * u))
            side = Vector((-math.sin(a), math.cos(a), 0)) * (0.5 * math.sin(u * math.pi) + 0.05)
            v1 = bm.verts.new(pos + side)
            v2 = bm.verts.new(pos - side + Vector((0, 0, -0.05)))
            if prev:
                bm.faces.new((prev[0], prev[1], v2, v1))
            prev = (v1, v2)
        me = bpy.data.meshes.new(f"frond_{k}")
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(f"palm_frond_{k}", me)
        bpy.context.collection.objects.link(o)
        o.location = top
        add(o, r, frond)
    for k in range(3):
        a = k / 3 * math.pi * 2
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.17, location=top + Vector((math.cos(a) * 0.25, math.sin(a) * 0.25, -0.3)))
        add(bpy.context.object, r, coconut, smooth=True).name = f"palm_coconut_{k}"
    return r


# --- Candi bentar ---------------------------------------------------------------------

def gate():
    r = root("gate")
    stone = material("paras_stone", rgb("#9a9286"), roughness=0.95)
    dark = material("volcanic_stone", rgb("#55504a"), roughness=0.95)
    brick = material("red_brick", rgb("#a8503a"), roughness=0.9)
    gold = material("gate_gold", rgb("#d9a441"), metallic=0.6, roughness=0.4)
    # Tiers narrow as they rise; the inner (split) face is flat at x = 0.
    tiers = [(3.2, 2.4, 1.2, dark), (2.9, 2.2, 1.0, brick), (2.6, 2.0, 0.35, stone), (2.4, 1.85, 1.0, brick),
             (2.0, 1.6, 0.3, stone), (1.8, 1.4, 0.9, brick), (1.4, 1.15, 0.3, stone), (1.1, 0.9, 0.8, brick),
             (0.8, 0.7, 0.25, stone), (0.55, 0.5, 0.7, brick), (0.3, 0.3, 0.5, stone)]
    z = 0
    for i, (w, d, h, mat) in enumerate(tiers):
        box(f"gate_tier_{i}", (w, d, h), (w / 2, 0, z + h / 2), r, mat)
        # Flame-like corner ornaments on the stone bands
        if mat is stone and i < 9:
            for cx, cy in ((w - 0.12, d / 2 - 0.12), (w - 0.12, -d / 2 + 0.12)):
                cylinder(f"gate_horn_{i}_{cx:.1f}_{cy:.1f}", 0.14, 0.5, (cx, cy, z + h + 0.25), r, stone, verts=6, r2=0.0)
        z += h
    cylinder("gate_top", 0.12, 0.6, (0.15, 0, z + 0.3), r, gold, verts=8, r2=0.0)
    # Steps in front
    for s in range(3):
        box(f"gate_step_{s}", (3.2, 0.5, 0.18), (1.6, 1.4 + s * 0.5, 0.09 + (2 - s) * 0.0), r, dark)
    return r


# --- Helsinki Cathedral -------------------------------------------------------------------

def cathedral():
    r = root("cathedral")
    white = material("cathedral_white", rgb("#f4f2ec"), roughness=0.6)
    stone = material("cathedral_stairs", rgb("#b9b4aa"), roughness=0.9)
    green = material("cathedral_green", rgb("#3f8f6a"), metallic=0.4, roughness=0.35)
    gold = material("cathedral_gold", rgb("#e0b84a"), metallic=0.8, roughness=0.3)
    window = material("cathedral_window", rgb("#4a5a6a"), roughness=0.3)
    # Platform and the grand staircase facing +Y
    box("cath_platform", (34, 34, 3), (0, 0, 1.5), r, stone)
    for s in range(10):
        box(f"cath_stair_{s}", (16, 1.2, 0.3), (0, 17.6 + s * 1.2, 3 - (s + 1) * 0.3), r, stone)
    # Greek-cross body
    box("cath_body_ns", (12, 26, 13), (0, 0, 9.5), r, white)
    box("cath_body_ew", (26, 12, 13), (0, 0, 9.5), r, white)
    # Porticos with columns and pediments on all four arms
    for rot in range(4):
        m = Matrix.Rotation(rot * math.pi / 2, 3, "Z")
        for c in range(6):
            p = m @ Vector((-5 + c * 2, 14.5, 9))
            cylinder(f"cath_col_{rot}_{c}", 0.5, 12, p, r, white, verts=12)
        cap = m @ Vector((0, 14.5, 15.6))
        box(f"cath_entab_{rot}", (12.5, 2.4, 1.2) if rot % 2 == 0 else (2.4, 12.5, 1.2), cap, r, white)
        # Pediment: a triangular prism
        bm = bmesh.new()
        pts = [Vector((-6.4, 0, 0)), Vector((6.4, 0, 0)), Vector((0, 0, 3.2))]
        front = [bm.verts.new(m @ (p + Vector((0, 15.7, 16.2)))) for p in pts]
        back = [bm.verts.new(m @ (p + Vector((0, 13.3, 16.2)))) for p in pts]
        bm.faces.new(front)
        bm.faces.new(list(reversed(back)))
        for i in range(3):
            j = (i + 1) % 3
            bm.faces.new((front[i], back[i], back[j], front[j]))
        me = bpy.data.meshes.new(f"pediment_{rot}")
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(f"cath_pediment_{rot}", me)
        bpy.context.collection.objects.link(o)
        add(o, r, white)
        # Windows
        for wx in (-3, 3):
            box(f"cath_window_{rot}_{wx}", (1.4, 0.2, 3.5) if rot % 2 == 0 else (0.2, 1.4, 3.5), m @ Vector((wx, 13.05, 10)), r, window)
    # Central drum, big green dome, lantern, gold cross
    cylinder("cath_drum", 7.5, 7, (0, 0, 19.5), r, white, verts=32)
    for k in range(16):
        a = k / 16 * math.pi * 2
        cylinder(f"cath_drum_col_{k}", 0.35, 6.5, (math.cos(a) * 7.7, math.sin(a) * 7.7, 19.5), r, white, verts=8)
    dome("cath_dome", 7.6, (0, 0, 23), r, green, height=1.25)
    cylinder("cath_lantern", 1.4, 3, (0, 0, 33.8), r, white, verts=16)
    dome("cath_lantern_dome", 1.5, (0, 0, 35.3), r, green, height=1.3)
    box("cath_cross_v", (0.2, 0.2, 2.2), (0, 0, 38.2), r, gold)
    box("cath_cross_h", (1.0, 0.2, 0.2), (0, 0, 38.6), r, gold)
    # Four small corner domes
    for cx, cy in ((-9, -9), (9, -9), (-9, 9), (9, 9)):
        cylinder(f"cath_small_drum_{cx}_{cy}", 2.2, 4, (cx, cy, 18), r, white, verts=16)
        dome(f"cath_small_dome_{cx}_{cy}", 2.3, (cx, cy, 20), r, green, height=1.3)
        cylinder(f"cath_small_lantern_{cx}_{cy}", 0.45, 1.4, (cx, cy, 23.6), r, gold, verts=8, r2=0.1)
    return r


# --- Helsinki tram -----------------------------------------------------------------------------

def tram():
    r = root("tram")
    green = material("tram_green", rgb("#2f8f4f"), metallic=0.2, roughness=0.4)
    white = material("tram_white", rgb("#f2f2ee"), metallic=0.1, roughness=0.4)
    glass = material("tram_glass", rgb("#1c2a36"), metallic=0.3, roughness=0.15)
    dark = material("tram_dark", rgb("#222222"), roughness=0.7)
    length = 26
    box("tram_lower", (2.5, length, 1.4), (0, 0, 1.0), r, green)
    box("tram_windows", (2.42, length - 1.2, 1.3), (0, 0, 2.35), r, glass)
    box("tram_roof", (2.4, length - 0.6, 0.5), (0, 0, 3.2), r, white)
    for k in range(9):
        box(f"tram_pillar_{k}", (2.5, 0.25, 1.3), (0, -length / 2 + 1.5 + k * 2.9, 2.35), r, white)
    for end in (-1, 1):
        box(f"tram_nose_{end}", (2.3, 0.9, 2.6), (0, end * (length / 2 + 0.2), 1.9), r, white)
        box(f"tram_nose_glass_{end}", (2.0, 0.2, 1.1), (0, end * (length / 2 + 0.6), 2.5), r, glass)
        cylinder(f"tram_light_{end}", 0.15, 0.1, (0.8, end * (length / 2 + 0.66), 1.3), r, material("tram_lamp", (1, 1, 0.9), emission=(1, 1, 0.8)), verts=10, rot=(math.pi / 2, 0, 0))
    # Pantograph
    box("tram_panto_base", (1.2, 1.2, 0.2), (0, 2, 3.55), r, dark)
    box("tram_panto_arm1", (0.1, 0.1, 1.6), (0, 2.3, 4.2), r, dark, rot=(0.5, 0, 0))
    box("tram_panto_bar", (1.6, 0.12, 0.08), (0, 2.6, 4.9), r, dark)
    box("tram_bogies", (2.0, length - 3, 0.4), (0, 0, 0.25), r, dark)
    return r


# --- Montreal staircase -----------------------------------------------------------------------------

def staircase():
    r = root("staircase")
    steel = material("stair_steel", rgb("#2b2b2e"), metallic=0.6, roughness=0.5)
    wood = material("balcony_wood", rgb("#7a5a3c"), roughness=0.8)
    height, steps = 3.6, 15
    # A Montreal flight: starts on the sidewalk (+Y), swoops sideways at the bottom,
    # then climbs straight to the balcony against the building (y = 0).
    def path(t):
        swoop = max(0.0, 1 - t / 0.35)
        x = 1.4 * swoop * swoop
        y = 2.6 * (1 - t) + 0.5
        return Vector((x, y, 0.18 + t * (height - 0.18)))
    tops = []
    for s in range(steps):
        t = s / (steps - 1)
        p = path(t)
        nxt = path(min(1, t + 0.05))
        heading = math.atan2(nxt.x - p.x, -(nxt.y - p.y))
        box(f"stair_step_{s}", (1.0, 0.3, 0.05), p, r, steel, rot=(0, 0, heading))
        for side in (-1, 1):
            post = p + Vector((math.cos(heading) * 0.5 * side, math.sin(heading) * 0.5 * side, 0))
            if s % 2 == 0:
                cylinder(f"stair_post_{s}_{side}", 0.02, 0.9, post + Vector((0, 0, 0.45)), r, steel, verts=6)
            tops.append((side, post + Vector((0, 0, 0.9))))
    # Hand rails: short bars joining successive post tops on each side
    for side in (-1, 1):
        pts = [p for s_, p in tops if s_ == side]
        for k in range(len(pts) - 1):
            a, b = pts[k], pts[k + 1]
            mid = (a + b) / 2
            d = b - a
            bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.025, depth=d.length, location=mid)
            o = bpy.context.object
            o.rotation_mode = "QUATERNION"
            o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
            add(o, r, steel).name = f"stair_rail_{side}_{k}"
    # Balcony across the building front, with railing and two columns
    box("balcony_floor", (3.4, 1.4, 0.12), (0.2, -0.2, height), r, wood)
    for k in range(10):
        cylinder(f"balcony_post_{k}", 0.02, 0.9, (-1.4 + k * 0.36, 0.48, height + 0.45), r, steel, verts=6)
    box("balcony_rail", (3.4, 0.05, 0.05), (0.2, 0.48, height + 0.9), r, steel)
    for cx in (-1.4, 1.8):
        cylinder(f"balcony_column_{cx}", 0.05, height, (cx, 0.45, height / 2), r, steel, verts=8)
    return r


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    roots = [palm(), gate(), cathedral(), tram(), staircase()]
    # Join each prop's parts into one mesh per material, to keep draw calls down.
    for rt in roots:
        children = [c for c in rt.children if c.type == "MESH"]
        bpy.ops.object.select_all(action="DESELECT")
        for c in children:
            c.select_set(True)
        bpy.context.view_layer.objects.active = children[0]
        bpy.ops.object.join()
        joined = bpy.context.object
        joined.name = f"{rt.name}_mesh"
        joined.parent = rt
    bpy.ops.object.select_all(action="SELECT")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    print(f"exported {OUT} ({os.path.getsize(OUT)} bytes)")


main()
