"""
Penguin Bowling models: builds the penguin, the pins and the snowy scenery
procedurally, then exports three files the game loads:

  ../public/models/penguin.glb   the bowler (also cloned for the cheering crowd)
  ../public/models/pins.glb      snowman pin and fish pin
  ../public/models/world.glb     igloos, trees, icebergs, a whale, lanterns, sky friends

Run headless from this folder (no Blender window needed):

    blender --background --python models.py
    blender --background --python models.py -- --preview /tmp/out   # also renders preview PNGs

Coordinates: Blender Z is up and -Y faces the camera (three.js +Z after the
Y-up glTF export). Every model faces -Y, so in the game it faces +Z.

Names the game relies on
------------------------
penguin.glb:
  penguin                 root, origin at the middle of the body (feet at z = -0.45)
    penguin_body          body, belly, scarf
    penguin_head          pivot at the neck (z = 0.17): head, face, beak, hat
    penguin_flipper_L/R   pivots at the shoulders
    penguin_foot_L/R      pivots at the heels
  Materials: penguin_scarf (the game tints it per penguin; the hat band uses it too)

pins.glb (origin at the middle of the pin, 0.72 tall: z from -0.36 to 0.36):
  pin_snowman             three snowballs, a beanie and a scarf
  pin_fish                a chubby fish standing on its tail
  Materials: pin_tint (snowman scarf + hat, tinted per pin), fish_skin (tinted per pin)

world.glb top-level nodes (each sits on z = 0 at its origin):
  igloo        dome of ice blocks with a doorway; window material igloo_glow (lit at night)
  pine_tree    snowy pine
  iceberg_0/1  chunky floating ice (origin at the water line)
  whale        smiling whale, origin at the water line
  lantern      post with a glowing lantern (material lantern_glow)
  ice_arch     an ice-block arch with bunting that frames the pin deck (6 wide inside)
  cloud_0/1    puffy clouds
  sun          smiling sun (faces the camera)
  moon         smiling crescent moon (faces the camera)
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "public", "models")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None


# --- Helpers -------------------------------------------------------------------------

def rgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (0, 2, 4))


def material(name, color, metallic=0.0, roughness=0.6, emission=None, strength=1.0):
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
    m.diffuse_color = (*rgb(color), 1)
    return m


def enum_id(owner, prop, wanted):
    ids = [i.identifier for i in owner.bl_rna.properties[prop].enum_items]
    for w in (wanted if isinstance(wanted, (list, tuple)) else [wanted]):
        if w in ids:
            return w
    raise RuntimeError(f"{prop}: none of {wanted} in {ids}")


def link(obj, parent=None):
    if obj.name not in bpy.context.collection.objects:
        bpy.context.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def root(name, loc=(0, 0, 0), parent=None):
    o = link(bpy.data.objects.new(name, None), parent)
    o.location = loc
    return o


def mesh_obj(name, bm, mat=None, parent=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new(name, me), parent)
    if mat:
        o.data.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = smooth
    return o


def lathe(name, profile, mat, parent=None, segments=24, loc=(0, 0, 0), scale=(1, 1, 1), mats_by_ring=None):
    """Spin a (radius, z) profile around Z. Radius 0 at either end becomes a pole."""
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        if r < 1e-5:
            rings.append([bm.verts.new((loc[0], loc[1], loc[2] + z * scale[2]))])
        else:
            rings.append([bm.verts.new((loc[0] + scale[0] * r * math.cos(2 * math.pi * k / segments),
                                        loc[1] + scale[1] * r * math.sin(2 * math.pi * k / segments),
                                        loc[2] + z * scale[2])) for k in range(segments)])
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(segments):
            k2 = (k + 1) % segments
            if len(a) == 1:
                f = bm.faces.new((a[0], b[k2], b[k]))
            elif len(b) == 1:
                f = bm.faces.new((a[k], a[k2], b[0]))
            else:
                f = bm.faces.new((a[k], a[k2], b[k2], b[k]))
            if mats_by_ring:
                f.material_index = mats_by_ring(i)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_obj(name, bm, None, parent)
    for m in (mat if isinstance(mat, (list, tuple)) else [mat]):
        if m:
            o.data.materials.append(m)
    return o


def sphere(name, r, loc, mat, parent=None, scale=(1, 1, 1), segs=16, rings=10, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    m = Matrix.Diagonal((*scale, 1))
    if rot:
        m = rot.to_4x4() @ m
    bmesh.ops.transform(bm, matrix=Matrix.Translation(loc) @ m, verts=bm.verts)
    return mesh_obj(name, bm, mat, parent)


def cylinder(name, r1, r2, depth, loc, mat, parent=None, segs=12, rot=None, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=depth)
    m = Matrix.Translation(loc) @ (rot.to_4x4() if rot else Matrix())
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return mesh_obj(name, bm, mat, parent, smooth)


def torus(name, R, r, loc, mat, parent=None, segs=24, sides=8, scale=(1, 1, 1), rot=None):
    bm = bmesh.new()
    rings = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        c, s = math.cos(a), math.sin(a)
        rings.append([bm.verts.new(((R + r * math.cos(2 * math.pi * k / sides)) * c,
                                    (R + r * math.cos(2 * math.pi * k / sides)) * s,
                                    r * math.sin(2 * math.pi * k / sides))) for k in range(sides)])
    for i in range(segs):
        a, b = rings[i], rings[(i + 1) % segs]
        for k in range(sides):
            k2 = (k + 1) % sides
            bm.faces.new((a[k], b[k], b[k2], a[k2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    m = Matrix.Diagonal((*scale, 1))
    if rot:
        m = rot.to_4x4() @ m
    bmesh.ops.transform(bm, matrix=Matrix.Translation(loc) @ m, verts=bm.verts)
    return mesh_obj(name, bm, mat, parent)


def rounded_box(name, size, loc, mat, parent=None, bevel=0.06, rot=None, segments=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segments, affect="EDGES", profile=0.5)
    m = Matrix.Translation(loc) @ (rot.to_4x4() if rot else Matrix())
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    o = mesh_obj(name, bm, mat, parent, smooth=False)
    big = min(size[0] * size[1], size[1] * size[2], size[0] * size[2]) * 0.2
    for p in o.data.polygons:
        p.use_smooth = p.area < big
    return o


def tube(name, points, radius, mat, parent=None, sides=6, taper=None):
    bm = bmesh.new()
    rings = []
    pts = [Vector(p) for p in points]
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = d.cross(Vector((0, 1, 0)))
        if side.length < 1e-4:
            side = d.cross(Vector((1, 0, 0)))
        side.normalize()
        up = side.cross(d).normalized()
        rr = radius * (taper(i / (len(pts) - 1)) if taper else 1)
        rings.append([bm.verts.new(p + rr * (math.cos(2 * math.pi * k / sides) * side + math.sin(2 * math.pi * k / sides) * up))
                      for k in range(sides)])
    for i in range(len(rings) - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, mat, parent)


def cone(name, r, h, loc, mat, parent=None, segs=12, rot=None, smooth=True):
    return cylinder(name, r, 0.0, h, loc, mat, parent, segs, rot, smooth)


def join_meshes(objs, name, parent):
    objs = [o for o in objs if o and o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for c in objs:
        c.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = name
    j.data.name = name
    j.parent = parent
    return j


def join_children(rt, name=None):
    kids = [c for c in rt.children if c.type == "MESH"]
    if not kids:
        return None
    return join_meshes(kids, name or f"{rt.name}_mesh", rt)


def pivot_part(name, parent, pivot, build):
    """Build meshes in model space, join them, then hang them under an empty at
    `pivot` (so the game can rotate the part around that point)."""
    tmp = root(name + "_tmp")
    build(tmp)
    j = join_children(tmp, name + "_mesh")
    j.data.transform(Matrix.Translation(-Vector(pivot)))
    piv = root(name, pivot, parent)
    j.parent = piv
    bpy.data.objects.remove(tmp)
    return piv


def face_mats():
    return {
        "eye": material("face_eye", "#2b2140", roughness=0.25),
        "shine": material("face_shine", "#ffffff", roughness=0.3, emission="#ffffff", strength=0.6),
        "cheek": material("face_cheek", "#ff8fb1", roughness=0.7),
    }


def face(rt, m, c, R, spread=0.35, size=0.12, smile=0.35, eye_z=0.12, smile_z=-0.12, cheek=True, mouth=True, prefix="f",
         surface=None):
    """Eyes, smile and cheeks on the front (-Y) of a sphere centred at c with radius R.
    spread/size/smile are fractions of R."""
    c = Vector(c)

    def on(x, z, lift=0.0):
        x, z = x * R, z * R
        if surface:
            return Vector((c.x + x, surface(x, z) - lift, c.z + z))
        y = -math.sqrt(max(R * R - x * x - z * z, 0.0))
        return c + Vector((x, y - lift, z))

    s = size * R
    for sx in (-1, 1):
        p = on(sx * spread, eye_z, 0.0)
        sphere(f"{prefix}_eye_{sx}", s, p, m["eye"], rt, scale=(0.85, 0.5, 1.15), segs=12, rings=8)
        sphere(f"{prefix}_shine_{sx}", s * 0.38, p + Vector((0.3 * s, -0.42 * s, 0.4 * s)), m["shine"], rt,
               scale=(1, 0.5, 1), segs=8, rings=6)
        if cheek:
            sphere(f"{prefix}_cheek_{sx}", s * 1.05, on(sx * (spread + 0.2), smile_z + 0.02, -0.01 * R), m["cheek"], rt,
                   scale=(1.15, 0.35, 0.75), segs=10, rings=6)
    if mouth:
        pts = []
        for i in range(9):
            u = i / 8
            x = (u - 0.5) * smile
            z = smile_z - math.sin(u * math.pi) * smile * 0.32
            pts.append(on(x, z, 0.0))
        tube(f"{prefix}_smile", pts, 0.022 * R / 0.25, m["eye"], rt, sides=6)


# --- Penguin --------------------------------------------------------------------------

def build_penguin():
    fm = face_mats()
    black = material("penguin_black", "#26334d", roughness=0.45)
    white = material("penguin_white", "#fbfbff", roughness=0.5)
    beak = material("penguin_beak", "#ffa62b", roughness=0.4)
    scarf = material("penguin_scarf", "#ff4d6d", roughness=0.75)
    pom = material("penguin_pom", "#ffffff", roughness=0.9)
    m = {**fm}
    rt = root("penguin")

    # Body: a chubby egg, belly bulging forward.
    def body(p):
        prof = []
        for i in range(21):
            t = i / 20
            a = t * math.pi
            z = 0.2 - (1 - math.cos(a)) * 0.31
            r = math.sin(a) * (0.30 + 0.06 * t)
            prof.append((r, z))
        lathe("p_body", prof, black, p, segments=28)
        sphere("p_belly", 0.3, (0, -0.12, -0.13), white, p, scale=(0.9, 0.85, 1.02), segs=24, rings=14)
        torus("p_scarf", 0.235, 0.065, (0, 0, 0.16), scarf, p, segs=28, sides=10, scale=(1, 1, 0.9))
        tube("p_scarf_tail", [(0.12, -0.2, 0.15), (0.17, -0.25, 0.04), (0.2, -0.26, -0.07)], 0.055, scarf, p, sides=8,
             taper=lambda u: 1 - 0.25 * u)
        sphere("p_tailfeather", 0.09, (0, 0.27, -0.33), black, p, scale=(1.2, 0.7, 0.6), segs=12, rings=8)
    tmp = root("penguin_body_tmp")
    body(tmp)
    j = join_children(tmp, "penguin_body")
    j.parent = rt
    bpy.data.objects.remove(tmp)

    neck = (0, 0, 0.17)

    def head(p):
        hc = (0, 0, 0.42)
        sphere("h_head", 0.26, hc, black, p, segs=28, rings=16)
        # White face mask: two cheeks that meet under the beak.
        for sx in (-1, 1):
            sphere(f"h_mask_{sx}", 0.15, (sx * 0.085, -0.13, 0.39), white, p, scale=(1.0, 0.8, 1.15), segs=18, rings=12)
        face(p, m, (0, 0.01, 0.42), 0.27, spread=0.32, size=0.17, smile=0.0, eye_z=0.08, smile_z=-0.18, mouth=False, prefix="h")
        cone("h_beak", 0.065, 0.11, (0, -0.31, 0.37), beak, p, segs=12, rot=Matrix.Rotation(math.radians(90), 3, "X"))
        sphere("h_beak_base", 0.07, (0, -0.26, 0.37), beak, p, scale=(1.1, 0.6, 0.8), segs=12, rings=8)
        # Beanie: a band in the scarf colour, a white cap and a pom-pom.
        lathe("h_hat", [(0.0, 0.74), (0.08, 0.73), (0.16, 0.7), (0.215, 0.65), (0.24, 0.59), (0.245, 0.56)], pom, p, segments=28)
        torus("h_hat_band", 0.235, 0.045, (0, 0, 0.565), scarf, p, segs=28, sides=8)
        sphere("h_pom", 0.075, (0, 0, 0.76), scarf, p, segs=12, rings=8)
    pivot_part("penguin_head", rt, neck, head)

    for sx, side in ((-1, "L"), (1, "R")):
        sh = (sx * 0.27, 0, 0.06)

        def flipper(p, sx=sx):
            sphere(f"fl_{sx}", 0.2, (sx * 0.33, 0.0, -0.1), black, p, scale=(0.32, 0.6, 1.0), segs=16, rings=10,
                   rot=Matrix.Rotation(sx * math.radians(18), 3, "Y"))
        pivot_part(f"penguin_flipper_{side}", rt, sh, flipper)

        heel = (sx * 0.12, 0.0, -0.42)

        def foot(p, sx=sx):
            sphere(f"ft_{sx}", 0.1, (sx * 0.13, -0.1, -0.43), beak, p, scale=(1.0, 1.4, 0.38), segs=14, rings=8,
                   rot=Matrix.Rotation(-sx * math.radians(14), 3, "Z"))
            for t in (-1, 0, 1):
                sphere(f"ft_toe_{sx}_{t}", 0.045, (sx * 0.13 + t * 0.055, -0.23, -0.435), beak, p, scale=(1, 1, 0.6), segs=8, rings=6)
        pivot_part(f"penguin_foot_{side}", rt, heel, foot)
    return rt


# --- Pins -----------------------------------------------------------------------------

def build_snowman_pin():
    fm = face_mats()
    snow = material("pin_snow", "#f4f9ff", roughness=0.85)
    coal = material("pin_coal", "#2b2140", roughness=0.4)
    carrot = material("pin_carrot", "#ff8c1a", roughness=0.5)
    tint = material("pin_tint", "#ff4d6d", roughness=0.75)
    rt = root("pin_snowman")
    sphere("s_bottom", 0.19, (0, 0, -0.18), snow, rt, scale=(1, 1, 0.95), segs=24, rings=14)
    sphere("s_middle", 0.155, (0, 0, 0.02), snow, rt, segs=22, rings=12)
    hc = (0, 0, 0.19)
    sphere("s_head", 0.12, hc, snow, rt, segs=22, rings=12)
    face(rt, fm, hc, 0.122, spread=0.38, size=0.16, smile=0.75, eye_z=0.18, smile_z=-0.28, prefix="s")
    cone("s_nose", 0.03, 0.11, (0, -0.16, 0.18), carrot, rt, segs=10, rot=Matrix.Rotation(math.radians(90), 3, "X"))
    for i, z in enumerate((0.06, -0.01, -0.14)):
        r = 0.155 if z > -0.1 else 0.19
        cz = 0.02 if z > -0.1 else -0.18
        y = -math.sqrt(max(r * r - (z - cz) ** 2, 0)) - 0.005
        sphere(f"s_button_{i}", 0.022, (0, y, z), coal, rt, scale=(1, 0.6, 1), segs=8, rings=6)
    torus("s_scarf", 0.115, 0.04, (0, 0, 0.1), tint, rt, segs=24, sides=8)
    tube("s_scarf_tail", [(0.07, -0.1, 0.09), (0.1, -0.15, 0.02), (0.11, -0.17, -0.05)], 0.035, tint, rt, sides=8)
    lathe("s_hat", [(0.0, 0.345), (0.06, 0.335), (0.1, 0.3), (0.12, 0.26), (0.125, 0.24)], tint, rt, segments=20)
    torus("s_hat_band", 0.118, 0.03, (0, 0, 0.245), snow, rt, segs=20, sides=8)
    sphere("s_pom", 0.04, (0, 0, 0.355), snow, rt, segs=10, rings=8)
    join_children(rt, "pin_snowman_mesh")
    return rt


def build_fish_pin():
    fm = face_mats()
    skin = material("fish_skin", "#4cc9f0", roughness=0.35)
    belly = material("fish_belly", "#fff6d6", roughness=0.5)
    fin = material("fish_fin", "#ffb703", roughness=0.45)
    rt = root("pin_fish")
    # Body: tall chubby drop, widest just above the middle.
    prof = []
    for i in range(23):
        t = i / 22
        a = t * math.pi
        z = 0.36 - (1 - math.cos(a)) * 0.29
        r = math.sin(a) * 0.17 * (1 - 0.35 * t * t)
        prof.append((r, z))
    lathe("f_body", prof, skin, rt, segments=26, scale=(1, 0.85, 1))
    sphere("f_belly", 0.13, (0, -0.06, 0.02), belly, rt, scale=(0.95, 0.75, 1.3), segs=20, rings=12)
    face(rt, fm, (0, 0.0, 0.17), 0.15, spread=0.42, size=0.2, smile=0.0, eye_z=0.2, cheek=True, mouth=False, prefix="f")
    torus("f_lips", 0.03, 0.016, (0, -0.158, 0.075), material("fish_lips", "#ff6b9d", roughness=0.4), rt,
          segs=14, sides=6, rot=Matrix.Rotation(math.radians(90), 3, "X"))
    # Tail fin: a fan splayed out as the foot.
    for sx in (-1, 1):
        sphere(f"f_tail_{sx}", 0.13, (sx * 0.1, 0.0, -0.31), fin, rt, scale=(1.0, 0.45, 0.4), segs=14, rings=8,
               rot=Matrix.Rotation(sx * math.radians(25), 3, "Y"))
    cylinder("f_stem", 0.06, 0.09, 0.08, (0, 0, -0.27), skin, rt, segs=14)
    # Dorsal fin on the back, little side fins.
    sphere("f_dorsal", 0.1, (0, 0.13, 0.12), fin, rt, scale=(0.25, 0.8, 1.0), segs=12, rings=8,
           rot=Matrix.Rotation(math.radians(-20), 3, "X"))
    for sx in (-1, 1):
        sphere(f"f_side_{sx}", 0.07, (sx * 0.17, -0.02, -0.02), fin, rt, scale=(0.3, 0.6, 1.0), segs=10, rings=8,
               rot=Matrix.Rotation(sx * math.radians(35), 3, "Y"))
    # Spots
    for i, (x, z) in enumerate(((0.1, 0.25), (-0.12, 0.15), (0.13, -0.05))):
        sphere(f"f_spot_{i}", 0.025, (x, 0.07, z), belly, rt, scale=(0.6, 1, 1), segs=8, rings=6)
    join_children(rt, "pin_fish_mesh")
    return rt


# --- World ---------------------------------------------------------------------------

def world_mats():
    return {
        "snow": material("snow", "#f4f9ff", roughness=0.9),
        "ice": material("ice_block", "#d6f1ff", roughness=0.25),
        "ice2": material("ice_block_dark", "#b6e2fa", roughness=0.25),
        "door": material("igloo_door", "#3d4f78", roughness=0.8),
        "glow": material("igloo_glow", "#ffd27a", roughness=0.6, emission="#ffb84d", strength=0.0),
        "pine": material("pine", "#2f9e6e", roughness=0.7),
        "pine2": material("pine_light", "#46b97f", roughness=0.7),
        "trunk": material("trunk", "#8a5a3c", roughness=0.8),
        "berg": material("iceberg", "#e8f7ff", roughness=0.3),
        "berg2": material("iceberg_blue", "#9fd8f5", roughness=0.25),
        "whale": material("whale", "#4a7fd6", roughness=0.4),
        "whale_belly": material("whale_belly", "#dbeaff", roughness=0.5),
        "post": material("lantern_post", "#5b4a7a", roughness=0.6),
        "lglow": material("lantern_glow", "#ffcf6b", roughness=0.5, emission="#ffb03b", strength=2.0),
        "cloud": material("cloud", "#ffffff", roughness=0.9),
        "sun": material("sun", "#ffd23f", roughness=0.5, emission="#ffb703", strength=0.6),
        "moon": material("moon", "#fff3c4", roughness=0.6, emission="#fff0b0", strength=0.8),
        "flags": [material(f"flag_{i}", c, roughness=0.7) for i, c in
                  enumerate(["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#9b5de5"])],
        "rope": material("rope", "#7a6a8a", roughness=0.8),
    }


def build_igloo(wm):
    rt = root("igloo")
    R = 1.5
    rows = 7
    prof = []
    for i in range(rows * 2 + 1):
        a = (i / (rows * 2)) * math.pi / 2
        prof.append((R * math.cos(a), R * math.sin(a) * 0.95))
    prof[-1] = (0.0, R * 0.95)
    # Alternating light/dark rings read as rows of ice blocks.
    lathe("igloo_dome", prof, [wm["ice"], wm["ice2"]], rt, segments=32,
          mats_by_ring=lambda i: 1 if (i % 2 == 1 and i < rows * 2) else 0)
    # Doorway tunnel facing -Y
    prof_t = []
    for i in range(13):
        a = math.pi * i / 12
        prof_t.append((0.62 * math.cos(a), 0.62 * math.sin(a) * 1.1))
    bm = bmesh.new()
    rings = []
    for y in (-0.9, -1.75):
        rings.append([bm.verts.new((x, y, z)) for (x, z) in prof_t])
    for k in range(len(prof_t) - 1):
        bm.faces.new((rings[0][k], rings[0][k + 1], rings[1][k + 1], rings[1][k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    t = mesh_obj("igloo_tunnel", bm, wm["ice"], rt)
    sol = t.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.18
    bpy.context.view_layer.objects.active = t
    bpy.ops.object.select_all(action="DESELECT")
    t.select_set(True)
    bpy.ops.object.modifier_apply(modifier=sol.name)
    # Dark doorway
    bm = bmesh.new()
    v = [bm.verts.new((x * 0.86, -1.74, z * 0.86)) for (x, z) in prof_t]
    bm.faces.new(v)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh_obj("igloo_doorway", bm, wm["door"], rt, smooth=False)
    # Two round windows that glow at night.
    for sx in (-1, 1):
        a = math.radians(55)
        p = Vector((sx * math.sin(a) * R * 0.86, -math.cos(a) * R * 0.86, 0.75))
        sphere(f"igloo_window_{sx}", 0.2, p, wm["glow"], rt, scale=(1, 0.45, 1), segs=14, rings=8,
               rot=Matrix.Rotation(-sx * a, 3, "Z"))
    # Snow cap on top
    sphere("igloo_cap", 0.55, (0, 0, R * 0.92), wm["snow"], rt, scale=(1, 1, 0.35), segs=20, rings=8)
    join_children(rt)
    return rt


def build_pine(wm):
    rt = root("pine_tree")
    cylinder("pine_trunk", 0.16, 0.13, 0.6, (0, 0, 0.3), wm["trunk"], rt, segs=10)
    for i, (r, z, h) in enumerate(((1.0, 0.5, 1.3), (0.8, 1.15, 1.15), (0.58, 1.75, 1.0))):
        cone(f"pine_layer_{i}", r, h, (0, 0, z + h / 2), wm["pine"] if i % 2 == 0 else wm["pine2"], rt, segs=14)
        cone(f"pine_snow_{i}", r * 0.62, h * 0.5, (0, 0, z + h * 0.78), wm["snow"], rt, segs=14)
    sphere("pine_star_snow", 0.12, (0, 0, 2.75), wm["snow"], rt, segs=10, rings=6)
    join_children(rt)
    return rt


def jagged(name, base_r, height, mat, parent, seed, mat2=None):
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    for v in bm.verts:
        d = 0.8 + rnd.random() * 0.35
        x, y, z = v.co * d
        z = z * height if z > 0 else z * 0.35
        v.co = Vector((x * base_r, y * base_r, z))
    o = mesh_obj(name, bm, mat, parent, smooth=False)
    if mat2:
        o.data.materials.append(mat2)
        for p in o.data.polygons:
            if p.center.z < 0.15 * height:
                p.material_index = 1
    return o


def build_iceberg(wm, i):
    rt = root(f"iceberg_{i}")
    if i == 0:
        jagged("berg_a", 2.6, 2.4, wm["berg"], rt, 5, wm["berg2"])
        o = jagged("berg_b", 1.4, 3.8, wm["berg"], rt, 9, wm["berg2"])
        o.data.transform(Matrix.Translation((0.9, 0.4, 0)))
    else:
        jagged("berg_c", 2.0, 1.4, wm["berg"], rt, 13, wm["berg2"])
    join_children(rt)
    return rt


def build_whale(wm):
    fm = face_mats()
    rt = root("whale")
    sphere("w_body", 1.0, (0, 0, 0.1), wm["whale"], rt, scale=(1.0, 1.6, 0.75), segs=28, rings=16)
    sphere("w_belly", 0.9, (0, -0.25, -0.05), wm["whale_belly"], rt, scale=(0.9, 1.4, 0.55), segs=24, rings=12)
    face(rt, fm, (0, -0.92, 0.22), 0.75, spread=0.42, size=0.15, smile=0.55, eye_z=0.22, smile_z=-0.12, prefix="w")
    # Tail rising behind
    tube("w_tail", [(0, 1.4, 0.1), (0, 1.9, 0.4), (0, 2.1, 0.9)], 0.22, wm["whale"], rt, sides=10, taper=lambda u: 1 - 0.5 * u)
    for sx in (-1, 1):
        sphere(f"w_fluke_{sx}", 0.42, (sx * 0.38, 2.15, 1.05), wm["whale"], rt, scale=(1.0, 0.35, 0.3), segs=14, rings=8,
               rot=Matrix.Rotation(sx * math.radians(20), 3, "Y"))
    join_children(rt)
    return rt


def build_lantern(wm):
    rt = root("lantern")
    cylinder("l_post", 0.07, 0.07, 1.8, (0, 0, 0.9), wm["post"], rt, segs=10)
    tube("l_arm", [(0, 0, 1.7), (0.25, 0, 1.85), (0.45, 0, 1.8)], 0.04, wm["post"], rt, sides=6)
    lathe("l_glow", [(0.0, 1.62), (0.12, 1.6), (0.19, 1.45), (0.17, 1.3), (0.1, 1.24), (0.0, 1.23)], wm["lglow"], rt,
          segments=16, loc=(0.45, 0, 0))
    cylinder("l_cap", 0.14, 0.04, 0.08, (0.45, 0, 1.66), wm["post"], rt, segs=12)
    sphere("l_snow", 0.15, (0, 0, 1.0), wm["snow"], rt, scale=(1, 1, 0.1), segs=8, rings=4)
    join_children(rt)
    return rt


def build_arch(wm):
    rt = root("ice_arch")
    w = 3.0  # half inside width
    for sx in (-1, 1):
        for k in range(5):
            mat = wm["ice"] if k % 2 == 0 else wm["ice2"]
            rounded_box(f"arch_block_{sx}_{k}", (0.7, 0.7, 0.56), (sx * (w + 0.35), 0, 0.28 + k * 0.56), mat, rt, bevel=0.07)
        sphere(f"arch_snow_{sx}", 0.45, (sx * (w + 0.35), 0, 2.85), wm["snow"], rt, scale=(1, 1, 0.45), segs=16, rings=8)
    # Curved top: blocks along an arc
    n = 13
    rx, rz = w + 0.35, 1.1
    for k in range(n):
        a = math.pi * (k + 0.5) / n
        x = -math.cos(a) * rx
        z = 2.8 + math.sin(a) * rz
        # Tilt each block along the ellipse's tangent so neighbours meet.
        tx, tz = math.sin(a) * rx, math.cos(a) * rz
        rot = Matrix.Rotation(-math.atan2(tz, tx), 3, "Y")
        rounded_box(f"arch_top_{k}", (0.9, 0.66, 0.5), (x, 0, z), wm["ice"] if k % 2 else wm["ice2"], rt, bevel=0.07, rot=rot)
    # Bunting under the arch
    pts = []
    m = 16
    for k in range(m + 1):
        u = k / m
        x = (u - 0.5) * 2 * w
        z = 2.7 - math.sin(u * math.pi) * 0.45
        pts.append((x, -0.36, z))
    tube("arch_rope", pts, 0.02, wm["rope"], rt, sides=5)
    for k in range(1, m):
        x, y, z = pts[k]
        bm = bmesh.new()
        a = bm.verts.new((x - 0.16, y, z))
        b = bm.verts.new((x + 0.16, y, z))
        c = bm.verts.new((x, y, z - 0.36))
        bm.faces.new((a, b, c))
        o = mesh_obj(f"arch_flag_{k}", bm, wm["flags"][k % len(wm["flags"])], rt, smooth=False)
        sol = o.modifiers.new("s", "SOLIDIFY")
        sol.thickness = 0.03
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.ops.object.modifier_apply(modifier=sol.name)
    join_children(rt)
    return rt


def build_cloud(wm, i):
    rnd = random.Random(20 + i)
    rt = root(f"cloud_{i}")
    n = 5 + i
    for k in range(n):
        u = k / (n - 1) - 0.5
        r = 0.9 + rnd.random() * 0.5 - abs(u) * 0.8
        sphere(f"cl_{i}_{k}", r, (u * 4.2, rnd.random() * 0.3, 0.35 + rnd.random() * 0.3 - abs(u) * 0.3), wm["cloud"], rt,
               scale=(1, 0.8, 0.8), segs=16, rings=10)
    join_children(rt)
    return rt


def build_sun(wm):
    fm = face_mats()
    rt = root("sun")
    sphere("sun_disc", 1.4, (0, 0, 0), wm["sun"], rt, scale=(1, 0.45, 1), segs=28, rings=14)
    for k in range(12):
        a = 2 * math.pi * k / 12
        cone(f"sun_ray_{k}", 0.3, 0.6, (math.cos(a) * 1.85, 0, math.sin(a) * 1.85), wm["sun"], rt, segs=8,
             rot=Matrix.Rotation(-a + math.pi / 2, 3, "Y") @ Matrix.Rotation(0, 3, "X"))
    def disc(x, z):
        return -0.63 * math.sqrt(max(0.0, 1 - (x * x + z * z) / 1.96))
    face(rt, fm, (0, 0, 0), 1.0, spread=0.42, size=0.17, smile=0.6, eye_z=0.2, smile_z=-0.2, prefix="sun", surface=disc)
    join_children(rt)
    return rt


def build_moon(wm):
    fm = face_mats()
    rt = root("moon")
    # Crescent: a ring of spheres along an arc, thick in the middle.
    pts = []
    n = 22
    for k in range(n + 1):
        u = k / n
        a = math.radians(-120 + 240 * u)
        pts.append((math.cos(a) * 1.0 - 0.35, 0, math.sin(a) * 1.0))
    tube("moon_body", pts, 0.42, wm["moon"], rt, sides=14, taper=lambda u: 0.25 + 0.75 * math.sin(u * math.pi))
    # Face on the inner middle of the crescent
    sphere("moon_eye", 0.08, (0.58, -0.38, 0.16), fm["eye"], rt, scale=(0.85, 0.5, 1.2), segs=10, rings=8)
    sphere("moon_shine", 0.027, (0.6, -0.42, 0.19), fm["shine"], rt, segs=8, rings=6)
    sphere("moon_cheek", 0.085, (0.8, -0.36, -0.02), fm["cheek"], rt, scale=(1.1, 0.4, 0.7), segs=10, rings=6)
    tube("moon_smile", [(0.42, -0.38, -0.04), (0.5, -0.4, -0.12), (0.62, -0.39, -0.12)], 0.025, fm["eye"], rt, sides=6)
    join_children(rt)
    return rt


def build_world():
    wm = world_mats()
    roots = [build_igloo(wm), build_pine(wm), build_iceberg(wm, 0), build_iceberg(wm, 1), build_whale(wm),
             build_lantern(wm), build_arch(wm), build_cloud(wm, 0), build_cloud(wm, 1), build_sun(wm), build_moon(wm)]
    return roots


# --- Export & preview -------------------------------------------------------------

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


def render(path, cam_loc, cam_target, lens=35, res=(1280, 720)):
    scene = bpy.context.scene
    cam = bpy.data.objects.get("preview_cam") or link(bpy.data.objects.new("preview_cam", bpy.data.cameras.new("preview_cam")))
    cam.location = cam_loc
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = (Vector(cam_target) - Vector(cam_loc)).to_track_quat("-Z", "Y")
    cam.data.lens = lens
    scene.camera = cam
    if not bpy.data.objects.get("preview_sun"):
        sun = link(bpy.data.objects.new("preview_sun", bpy.data.lights.new("preview_sun", "SUN")))
        sun.data.energy = 3.5
        sun.rotation_euler = (math.radians(50), math.radians(-20), math.radians(-30))
    world = scene.world or bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*rgb("#9fd8ff"), 1)
    bg.inputs["Strength"].default_value = 1.0
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        try:
            scene.render.engine = "BLENDER_EEVEE_NEXT"
        except TypeError:
            pass
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.image_settings.file_format = enum_id(scene.render.image_settings, "file_format", "PNG")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


def clear(roots):
    for rt in roots:
        for o in [rt, *rt.children_recursive]:
            bpy.data.objects.remove(o)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    peng = build_penguin()
    export(os.path.join(OUT_DIR, "penguin.glb"), [peng])
    pins = [build_snowman_pin(), build_fish_pin()]
    export(os.path.join(OUT_DIR, "pins.glb"), pins)
    if PREVIEW:
        os.makedirs(PREVIEW, exist_ok=True)
        peng.location = (-0.9, 0, 0.45)
        pins[0].location = (0.1, 0, 0.36)
        pins[1].location = (0.8, 0, 0.36)
        render(os.path.join(PREVIEW, "characters.png"), (0, -3.2, 0.7), (0, 0, 0.4), lens=40)
        peng.rotation_euler = (0, 0, math.radians(150))
        render(os.path.join(PREVIEW, "characters_back.png"), (0, -3.2, 0.7), (0, 0, 0.4), lens=40)
    clear([peng, *pins])
    world = build_world()
    export(os.path.join(OUT_DIR, "world.glb"), world)
    if PREVIEW:
        for i, rt in enumerate(world):
            rt.location = ((i % 6 - 2.5) * 7, (i // 6) * 9, 0 if i < 7 else 3)
        render(os.path.join(PREVIEW, "world.png"), (0, -30, 12), (0, 4, 1), lens=30)
        for rt in world:
            rt.location = (0, 200, 0)
        for name, x in (("whale", -4), ("sun", 0), ("moon", 4)):
            bpy.data.objects[name].location = (x, 0, 1)
        render(os.path.join(PREVIEW, "friends.png"), (0, -9, 1.5), (0, 0, 1), lens=35)


main()
