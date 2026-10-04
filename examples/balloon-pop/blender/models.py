"""
Balloon Pop models: builds every balloon and the background world procedurally,
then exports two files the game loads:

  ../public/models/balloons.glb   one top-level node per balloon kind
  ../public/models/world.glb      the countryside the balloons float over

Run headless from this folder (no Blender window needed):

    blender --background --python models.py
    blender --background --python models.py -- --preview /tmp/out   # also renders preview PNGs

Coordinates: Blender Z is up and -Y faces the camera (three.js +Z after the
Y-up glTF export). Balloons stand with their knot at about z = -1.3 and their
string hanging below it, centred on the origin so the game can sway them there.

Names the game relies on
------------------------
balloons.glb top-level nodes:
  balloon_round    classic teardrop balloon
  balloon_smile    teardrop balloon with a happy face
  balloon_heart    puffy heart
  balloon_star     puffy five-point star (the "pop everything" power-up)
  balloon_bunny    bunny head with ears and a face
  balloon_rainbow  striped balloon (splits into little balloons)
  balloon_gold     smiling teardrop balloon wearing a crown (worth 5)
Materials (looked up by name in the game):
  balloon_skin     the rubber; the game tints it per balloon
  (every other material keeps its baked colour: string, face, stripes, ears)

world.glb top-level nodes:
  landscape        hills, trees, houses, windmill body, flowers, fence
  windmill_sails   the sails, origin on the hub so the game can spin them
  hot_air_balloon  drifting background balloon with basket
  cloud_0..cloud_2 puffy clouds to drift across the sky
  sun              smiling sun with rays (faces the camera)
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
    """Read an enum's identifiers rather than trusting a hardcoded one."""
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


def root(name):
    return link(bpy.data.objects.new(name, None))


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


def lathe(name, profile, mat, parent=None, segments=28, loc=(0, 0, 0), mats_by_ring=None):
    """Spin a (radius, z) profile around Z. Radius 0 at either end becomes a pole."""
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        if r < 1e-5:
            rings.append([bm.verts.new((loc[0], loc[1], loc[2] + z))])
        else:
            rings.append([bm.verts.new((loc[0] + r * math.cos(2 * math.pi * k / segments),
                                        loc[1] + r * math.sin(2 * math.pi * k / segments), loc[2] + z))
                          for k in range(segments)])
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
    if isinstance(mat, (list, tuple)):
        for m in mat:
            o.data.materials.append(m)
    elif mat:
        o.data.materials.append(mat)
    return o


def uv_sphere(name, r, loc, mat, parent=None, scale=(1, 1, 1), segs=16, rings=10, rot=None):
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
    o = mesh_obj(name, bm, mat, parent, smooth)
    return o


def rounded_box(name, size, loc, mat, parent=None, bevel=0.08, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES", profile=0.5)
    m = Matrix.Translation(loc) @ (rot.to_4x4() if rot else Matrix())
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    o = mesh_obj(name, bm, mat, parent, smooth=False)
    # Smooth only the bevels; flat faces stay crisp.
    for p in o.data.polygons:
        p.use_smooth = p.area < size[0] * size[1] * 0.2 and p.area < size[1] * size[2] * 0.2
    return o


def prism_roof(name, w, d, h, loc, mat, parent=None, overhang=0.15):
    bm = bmesh.new()
    w2, d2 = w / 2 + overhang, d / 2 + overhang
    pts = [(-w2, -d2, 0), (w2, -d2, 0), (0, -d2, h), (-w2, d2, 0), (w2, d2, 0), (0, d2, h)]
    v = [bm.verts.new(Vector(p) + Vector(loc)) for p in pts]
    for f in ((0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)):
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, mat, parent, smooth=False)


def tube(name, points, radius, mat, parent=None, sides=6):
    """A thin tube along a polyline (strings and ropes)."""
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
        rings.append([bm.verts.new(p + radius * (math.cos(2 * math.pi * k / sides) * side + math.sin(2 * math.pi * k / sides) * up))
                      for k in range(sides)])
    for i in range(len(rings) - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, mat, parent)


def metaball_mesh(name, elements, mat, parent=None, resolution=0.07, scale=(1, 1, 1), loc=(0, 0, 0)):
    """Blobby shape from metaball elements: (type, co, radius, size_xyz, rotation-quaternion|None)."""
    mb = bpy.data.metaballs.new(name + "_mb")
    mb.resolution = resolution
    mb.render_resolution = resolution
    for kind, co, radius, size, quat in elements:
        el = mb.elements.new()
        el.type = enum_id(el, "type", kind)
        el.co = co
        el.radius = radius
        if size:
            el.size_x, el.size_y, el.size_z = size
        if quat is not None:
            el.rotation = quat
    o = link(bpy.data.objects.new(name + "_mbobj", mb))
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    targets = [i.identifier for i in bpy.ops.object.convert.get_rna_type().properties["target"].enum_items]
    bpy.ops.object.convert(target="MESH" if "MESH" in targets else targets[0])
    m = bpy.context.view_layer.objects.active
    m.name = name
    me = m.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(loc) @ Matrix.Diagonal((*scale, 1)), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    me.materials.clear()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    m.parent = parent
    return m


def quat_y(angle):
    """Rotation about Blender Y (the axis pointing away from the camera)."""
    return Matrix.Rotation(angle, 4, "Y").to_quaternion()


def join_children(rt):
    """One mesh per root (one draw per material) keeps phones happy."""
    kids = [c for c in rt.children if c.type == "MESH"]
    if len(kids) < 2:
        return kids[0] if kids else None
    bpy.ops.object.select_all(action="DESELECT")
    for c in kids:
        c.select_set(True)
    bpy.context.view_layer.objects.active = kids[0]
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = f"{rt.name}_mesh"
    j.data.name = j.name
    j.parent = rt
    return j


# --- Balloons -------------------------------------------------------------------------

def face_mats():
    """Eyes, sparkles and cheeks, shared by the balloon faces and the sun."""
    return {
        "eye": material("face_eye", "#2b2140", roughness=0.25),
        "shine": material("face_shine", "#ffffff", roughness=0.3, emission="#ffffff", strength=0.6),
        "cheek": material("face_cheek", "#ff8fb1", roughness=0.7),
    }


def mats():
    return {
        "skin": material("balloon_skin", "#ffffff", roughness=0.22),
        "string": material("balloon_string", "#fff4e0", roughness=0.8),
        **face_mats(),
        "ear": material("bunny_ear_pink", "#ffc2d6", roughness=0.5),
        "nose": material("bunny_nose", "#ff6b9d", roughness=0.4),
        "crown": material("crown_gold", "#ffc83d", metallic=0.85, roughness=0.22),
        "gems": [material("gem_pink", "#ff3d8b", roughness=0.15, emission="#ff3d8b", strength=0.25),
                 material("gem_blue", "#3d8bff", roughness=0.15, emission="#3d8bff", strength=0.25)],
        "stripes": [material(f"rainbow_{i}", c, roughness=0.22) for i, c in
                    enumerate(["#ff595e", "#ff9f1c", "#ffd23f", "#8ac926", "#2ec4b6", "#6c63ff"])],
    }


def teardrop_profile(height=1.15, width=1.0, steps=22):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        a = t * math.pi
        r = math.sin(a) * width * (1.0 - 0.18 * t * t)
        r = math.hypot(r, 0.075 * t ** 6)  # a little neck instead of a point
        z = math.cos(a) * height - 0.12 * t ** 3
        pts.append((r, z))
    return pts


def knot_and_string(rt, m, base_z, wiggle_seed=0.0, length=2.1):
    # Knot: a little bulb with a flared lip, the same rubber as the balloon.
    prof = [(0.0, base_z + 0.04), (0.07, base_z), (0.06, base_z - 0.06), (0.12, base_z - 0.12), (0.15, base_z - 0.17),
            (0.11, base_z - 0.22), (0.0, base_z - 0.23)]
    lathe(f"{rt.name}_knot", prof, m["skin"], rt, segments=14)
    pts = []
    n = 14
    for i in range(n + 1):
        u = i / n
        z = base_z - 0.2 - u * length
        x = 0.12 * math.sin(u * 7.0 + wiggle_seed) * u
        y = 0.06 * math.cos(u * 5.0 + wiggle_seed) * u
        pts.append((x, y, z))
    tube(f"{rt.name}_string", pts, 0.018, m["string"], rt, sides=5)


def face(rt, m, center_z, front_y, spread=0.3, size=0.11, smile_w=0.26, surface=None):
    """Eyes, smile and cheeks, placed on the camera side (-Y) of the surface."""
    def on(x, z, lift=0.0):
        y = surface(x, z) if surface else front_y
        return Vector((x, y - lift, z))

    for sx in (-1, 1):
        p = on(sx * spread, center_z + 0.1, 0.02)
        uv_sphere(f"{rt.name}_eye_{sx}", size, p, m["eye"], rt, scale=(0.85, 0.45, 1.15), segs=12, rings=8)
        uv_sphere(f"{rt.name}_shine_{sx}", size * 0.36, p + Vector((0.035, -0.05, 0.045)), m["shine"], rt,
                  scale=(1, 0.5, 1), segs=8, rings=6)
        uv_sphere(f"{rt.name}_cheek_{sx}", size * 1.05, on(sx * (spread + 0.16), center_z - 0.12, 0.0), m["cheek"], rt,
                  scale=(1.1, 0.3, 0.7), segs=12, rings=6)
    pts = []
    for i in range(9):
        u = i / 8
        x = (u - 0.5) * smile_w * 2
        z = center_z - 0.13 - math.sin(u * math.pi) * smile_w * 0.45
        pts.append(on(x, z, 0.015))
    tube(f"{rt.name}_smile", pts, 0.028, m["eye"], rt, sides=6)


def balloon_round(m, name="balloon_round", with_face=False):
    rt = root(name)
    lathe(f"{name}_body", teardrop_profile(), m["skin"], rt, segments=30)
    knot_and_string(rt, m, -1.24, wiggle_seed=0.3)
    if with_face:
        # Front surface of the teardrop near the equator: radius ~ width.
        def surface(x, z):
            t = math.acos(max(-1, min(1, z / 1.15))) / math.pi
            r = math.sin(t * math.pi) * (1 - 0.18 * t * t)
            return -math.sqrt(max(r * r - x * x, 0.0))
        face(rt, m, 0.05, -0.95, spread=0.3, size=0.12, smile_w=0.24, surface=surface)
    return rt


def balloon_rainbow(m):
    rt = root("balloon_rainbow")
    prof = teardrop_profile(steps=24)
    bands = len(m["stripes"])
    lathe("balloon_rainbow_body", prof, m["stripes"], rt, segments=30,
          mats_by_ring=lambda i: min(bands - 1, int(i / (len(prof) - 1) * bands)))
    knot_and_string(rt, m, -1.24, wiggle_seed=1.2)
    return rt


def crown(rt, m, base_z, r=0.54, band=0.26, spike=0.34, points=5, tilt=12.0, segs=60, thick=0.045):
    """A little king's crown: a zigzag band with balls on the tips and gems on the front."""
    bm = bmesh.new()
    front = -math.pi / 2  # one tip faces the camera (-Y)

    def top(k):
        u = ((k / segs - front / (2 * math.pi)) * points + 0.5) % 1.0  # 0 between points, 0.5 on a tip
        return band + spike * (1 - abs(u * 2 - 1))

    rings = []
    for (rad, at_top) in ((r, False), (r, True), (r - thick, True), (r - thick, False)):
        ring = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            rr = rad + (0.04 * top(k) / (band + spike) if at_top else 0.0)  # flares outward a little
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), (top(k) if at_top else 0.0))))
        rings.append(ring)
    for i in range(4):
        a_, b_ = rings[i], rings[(i + 1) % 4]
        for k in range(segs):
            k2 = (k + 1) % segs
            bm.faces.new((a_[k], a_[k2], b_[k2], b_[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    tilt_m = Matrix.Translation((0, 0, base_z)) @ Matrix.Rotation(math.radians(tilt), 4, "Y")
    bmesh.ops.transform(bm, matrix=tilt_m, verts=bm.verts)
    mesh_obj(f"{rt.name}_crown", bm, m["crown"], rt, smooth=True)
    for p in range(points):
        a = front + 2 * math.pi * p / points  # where top() peaks
        tip = Vector(((r + 0.04) * math.cos(a), (r + 0.04) * math.sin(a), band + spike + 0.03))
        uv_sphere(f"{rt.name}_crown_tip_{p}", 0.07, tilt_m @ tip, m["crown"], rt, segs=10, rings=6)
    # Gems around the band, the biggest one facing the camera (-Y)
    for j, deg in enumerate((-90, -90 - 50, -90 + 50)):
        a = math.radians(deg)
        p = tilt_m @ Vector(((r + 0.012) * math.cos(a), (r + 0.012) * math.sin(a), band * 0.52))
        size = 0.09 if j == 0 else 0.065
        uv_sphere(f"{rt.name}_gem_{j}", size, p, m["gems"][j % 2 if j else 0], rt, scale=(1, 0.55, 1),
                  rot=Matrix.Rotation(a + math.pi / 2, 3, "Z"), segs=10, rings=6)


def balloon_gold(m):
    """The 5-point balloon: shiny gold (tinted in the game) with a smile and a crown."""
    rt = balloon_round(m, "balloon_gold", with_face=True)
    crown(rt, m, 0.92)
    return rt


def pillow(name, R, depth, mat, parent, segs=48, rings=16):
    """A puffy balloon from an outline: R(phi) is the outline radius in the XZ plane
    (phi = 0 along +X, counter-clockwise towards +Z). The poles face the camera and
    the back, so each ring is a smaller copy of the outline. Returns (object, surface)
    where surface(x, z) gives the front skin's Y for placing faces."""
    bm = bmesh.new()
    front = bm.verts.new((0, -depth, 0))
    back = bm.verts.new((0, depth, 0))
    phis = [2 * math.pi * k / segs for k in range(segs)]
    radii = [R(p) for p in phis]
    ring_verts = []
    for i in range(1, rings):
        th = math.pi * i / rings
        ring_verts.append([bm.verts.new((radii[k] * math.sin(th) * math.cos(p), -depth * math.cos(th),
                                         radii[k] * math.sin(th) * math.sin(p))) for k, p in enumerate(phis)])
    for k in range(segs):
        k2 = (k + 1) % segs
        bm.faces.new((front, ring_verts[0][k2], ring_verts[0][k]))
        bm.faces.new((back, ring_verts[-1][k], ring_verts[-1][k2]))
        for i in range(len(ring_verts) - 1):
            a, b = ring_verts[i], ring_verts[i + 1]
            bm.faces.new((a[k], a[k2], b[k2], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_obj(name, bm, mat, parent)

    def surface(x, z):
        s_ = math.hypot(x, z) / max(R(math.atan2(z, x) % (2 * math.pi)), 1e-3)
        return -depth * math.sqrt(max(0.0, 1 - s_ * s_))
    return o, surface


def polar_table(points, center, bins=360, smooth=6):
    """Radius-by-angle lookup for a closed outline that is star-shaped about center."""
    table = [None] * bins
    for (x, z) in points:
        a = math.atan2(z - center[1], x - center[0]) % (2 * math.pi)
        b = int(a / (2 * math.pi) * bins) % bins
        r = math.hypot(x - center[0], z - center[1])
        table[b] = r if table[b] is None else max(table[b], r)
    for i in range(bins):  # fill gaps
        if table[i] is None:
            j = 1
            while table[(i - j) % bins] is None and table[(i + j) % bins] is None:
                j += 1
            table[i] = table[(i - j) % bins] or table[(i + j) % bins]
    sm = [sum(table[(i + d) % bins] for d in range(-smooth, smooth + 1)) / (2 * smooth + 1) for i in range(bins)]

    def R(phi):
        f = (phi % (2 * math.pi)) / (2 * math.pi) * bins
        i = int(f) % bins
        return sm[i] + (sm[(i + 1) % bins] - sm[i]) * (f - int(f))
    return R


def balloon_heart(m):
    rt = root("balloon_heart")
    sc = 1 / 15.5
    pts = []
    for i in range(2000):
        t = 2 * math.pi * i / 2000
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x * sc, (z + 2.5) * sc))
    R = polar_table(pts, (0, 0), smooth=8)
    body, surface = pillow("balloon_heart_body", R, 0.62, m["skin"], rt, segs=64, rings=16)
    bottom = -R(1.5 * math.pi)
    knot_and_string(rt, m, bottom + 0.06, wiggle_seed=2.0, length=2.3)
    face(rt, m, 0.05, 0, spread=0.3, size=0.11, smile_w=0.2, surface=surface)
    return rt


def balloon_star(m):
    rt = root("balloon_star")

    def R(phi):
        f = (1 + math.cos(5 * (phi - math.pi / 2))) / 2
        return 0.62 + 0.62 * f ** 1.6
    body, surface = pillow("balloon_star_body", R, 0.5, m["skin"], rt, segs=80, rings=14)
    # The knot hangs between the two bottom points.
    knot_and_string(rt, m, -R(1.5 * math.pi) + 0.06, wiggle_seed=3.1, length=2.3)
    face(rt, m, 0.04, 0, spread=0.22, size=0.1, smile_w=0.17, surface=surface)
    return rt


def balloon_bunny(m):
    rt = root("balloon_bunny")
    els = [
        ("BALL", (0, 0, 0), 1.08, None, None),
        ("ELLIPSOID", (0, 0.0, -0.32), 0.62, (1.25, 0.95, 0.75), None),
    ]
    for sx in (-1, 1):
        els.append(("CAPSULE", (sx * 0.38, 0.05, 1.05), 0.34, (0.55, 0.35, 0.35), quat_y(math.radians(-90 + sx * 14))))
    body = metaball_mesh("balloon_bunny_body", els, m["skin"], rt, resolution=0.06, scale=(1, 0.85, 1))
    # Pink inner ears, a nose, and the face
    for sx in (-1, 1):
        uv_sphere(f"balloon_bunny_inner_{sx}", 0.13, (sx * 0.39, -0.27, 1.05), m["ear"], rt, scale=(1, 0.35, 3.0),
                  rot=Matrix.Rotation(math.radians(-sx * 14), 3, "Y"), segs=12, rings=8)
    face(rt, m, -0.05, -0.74, spread=0.27, size=0.11, smile_w=0.17)
    uv_sphere("balloon_bunny_nose", 0.08, (0, -0.8, -0.03), m["nose"], rt, scale=(1.2, 0.6, 0.8), segs=10, rings=6)
    bottom = min((body.matrix_world @ v.co).z for v in body.data.vertices)
    knot_and_string(rt, m, bottom + 0.05, wiggle_seed=4.2, length=2.2)
    return rt


def build_balloons():
    m = mats()
    roots = [balloon_round(m), balloon_round(m, "balloon_smile", with_face=True), balloon_heart(m),
             balloon_star(m), balloon_bunny(m), balloon_rainbow(m), balloon_gold(m)]
    for rt in roots:
        join_children(rt)
    return roots


# --- World ----------------------------------------------------------------------------

def hill(name, cx, cy, rx, ry, h, mat, parent, segs=32):
    """A smooth mound: a squashed half-sphere sunk into the ground."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=14, radius=1)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.25], context="VERTS")
    bmesh.ops.transform(bm, matrix=Matrix.Translation((cx, cy, 0)) @ Matrix.Diagonal((rx, ry, h, 1)), verts=bm.verts)
    return mesh_obj(name, bm, mat, parent)


def tree(rt, name, x, y, z, s, wm):
    cylinder(f"{name}_trunk", 0.16 * s, 0.12 * s, 1.1 * s, (x, y, z + 0.55 * s), wm["bark"], rt, segs=8)
    leaf = wm["leaf"] if (int(x * 7) % 3) else wm["leaf2"]
    uv_sphere(f"{name}_crown", 0.75 * s, (x, y, z + 1.55 * s), leaf, rt, scale=(1, 1, 1.05), segs=12, rings=8)
    uv_sphere(f"{name}_crown2", 0.48 * s, (x + 0.42 * s, y - 0.1 * s, z + 1.25 * s), leaf, rt, segs=10, rings=6)
    uv_sphere(f"{name}_crown3", 0.42 * s, (x - 0.45 * s, y - 0.05 * s, z + 1.3 * s), leaf, rt, segs=10, rings=6)


def pine(rt, name, x, y, z, s, wm):
    cylinder(f"{name}_trunk", 0.12 * s, 0.1 * s, 0.6 * s, (x, y, z + 0.3 * s), wm["bark"], rt, segs=8)
    for k in range(3):
        cylinder(f"{name}_tier{k}", (0.9 - k * 0.22) * s, 0.05 * s, (1.0 - k * 0.1) * s,
                 (x, y, z + (0.95 + k * 0.55) * s), wm["pine"], rt, segs=12)


def house(rt, name, x, y, z, s, wall, roof, wm):
    rounded_box(f"{name}_walls", (1.6 * s, 1.3 * s, 1.2 * s), (x, y, z + 0.6 * s), wall, rt, bevel=0.06 * s)
    prism_roof(f"{name}_roof", 1.6 * s, 1.3 * s, 0.85 * s, (x, y, z + 1.2 * s), roof, rt, overhang=0.14 * s)
    rounded_box(f"{name}_door", (0.38 * s, 0.06 * s, 0.62 * s), (x, y - 0.66 * s, z + 0.31 * s), wm["door"], rt, bevel=0.03 * s)
    for sx in (-1, 1):
        rounded_box(f"{name}_win{sx}", (0.32 * s, 0.06 * s, 0.32 * s), (x + sx * 0.5 * s, y - 0.66 * s, z + 0.72 * s),
                    wm["window"], rt, bevel=0.03 * s)
    rounded_box(f"{name}_chimney", (0.22 * s, 0.22 * s, 0.6 * s), (x + 0.42 * s, y + 0.2 * s, z + 1.75 * s), wm["brick"], rt,
                bevel=0.02 * s)


def flower(rt, name, x, y, z, color_mat, wm, s=1.0):
    cylinder(f"{name}_stem", 0.025 * s, 0.025 * s, 0.4 * s, (x, y, z + 0.2 * s), wm["leaf"], rt, segs=5)
    for k in range(5):
        a = k * 2 * math.pi / 5
        uv_sphere(f"{name}_petal{k}", 0.09 * s, (x + math.cos(a) * 0.1 * s, y - 0.02, z + 0.42 * s + math.sin(a) * 0.1 * s),
                  color_mat, rt, scale=(1, 0.5, 1), segs=6, rings=4)
    uv_sphere(f"{name}_mid", 0.07 * s, (x, y - 0.05, z + 0.42 * s), wm["sunny"], rt, scale=(1, 0.6, 1), segs=6, rings=4)


def world_mats():
    return {
        "grass": material("grass", "#7fd35b", roughness=0.9),
        "grass2": material("grass_far", "#a6e07a", roughness=0.9),
        "grass3": material("grass_near", "#5cbf4a", roughness=0.9),
        "leaf": material("leaf", "#3fae4a", roughness=0.8),
        "leaf2": material("leaf_light", "#6cc551", roughness=0.8),
        "pine": material("pine", "#2f8f5b", roughness=0.8),
        "bark": material("bark", "#9a6a43", roughness=0.9),
        "door": material("door", "#8a5a3c", roughness=0.7),
        "window": material("window", "#bfe9ff", roughness=0.2, emission="#fff3b0", strength=0.25),
        "brick": material("brick", "#c96a4a", roughness=0.9),
        "white": material("white_paint", "#fffaf0", roughness=0.7),
        "pink": material("pink_paint", "#ffb3c8", roughness=0.7),
        "yellow": material("yellow_paint", "#ffe08a", roughness=0.7),
        "roof_red": material("roof_red", "#e8505b", roughness=0.6),
        "roof_blue": material("roof_blue", "#5b7cfa", roughness=0.6),
        "roof_purple": material("roof_purple", "#9b6cf0", roughness=0.6),
        "cloud": material("cloud", "#ffffff", roughness=0.95),
        "sunny": material("sun_yellow", "#ffd23f", roughness=0.5, emission="#ffcf3a", strength=1.2),
        "sun_ray": material("sun_ray", "#ffb22e", roughness=0.5, emission="#ffa51f", strength=1.0),
        "fence": material("fence", "#fff1dc", roughness=0.8),
        "basket": material("basket", "#b27a45", roughness=0.9),
        "rope": material("rope", "#7a5a3a", roughness=0.9),
        "hab": [material(f"hab_{i}", c, roughness=0.5) for i, c in
                enumerate(["#ff595e", "#ffd23f", "#2ec4b6", "#ffffff"])],
        "petals": [material(f"petal_{i}", c, roughness=0.6) for i, c in
                   enumerate(["#ff6b9d", "#ffffff", "#b388ff", "#ff9f1c"])],
    }


def build_landscape(wm):
    rt = root("landscape")
    # Far, middle and near rows of hills. +Y is away from the camera.
    far = [(-30, 34, 16, 6, 9), (-8, 38, 18, 6, 11), (16, 36, 16, 6, 9.5), (38, 34, 15, 6, 8.5), (-48, 36, 14, 6, 8)]
    for i, (x, y, rx, ry, h) in enumerate(far):
        hill(f"hill_far_{i}", x, y, rx, ry, h, wm["grass2"], rt)
    mid = [(-22, 18, 11, 5, 4.5), (-2, 20, 12, 5, 5.2), (19, 18, 11, 5, 4.6), (38, 19, 10, 5, 4.2), (-40, 19, 10, 5, 4.0)]
    for i, (x, y, rx, ry, h) in enumerate(mid):
        hill(f"hill_mid_{i}", x, y, rx, ry, h, wm["grass"], rt)
    near = [(-14, 6, 10, 4, 2.0), (6, 7, 11, 4, 2.4), (26, 6, 10, 4, 2.0), (-32, 6, 9, 4, 1.8), (44, 6, 9, 4, 1.8)]
    for i, (x, y, rx, ry, h) in enumerate(near):
        hill(f"hill_near_{i}", x, y, rx, ry, h, wm["grass3"], rt)
    # A flat meadow under it all
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((0, 25, -0.02)) @ Matrix.Diagonal((90, 30, 1, 1)), verts=bm.verts)
    mesh_obj("meadow", bm, wm["grass"], rt, smooth=False)

    # Houses on the middle hills
    house(rt, "house_a", -6, 17, 3.1, 1.6, wm["white"], wm["roof_red"], wm)
    house(rt, "house_b", 2.5, 18.5, 3.6, 1.4, wm["yellow"], wm["roof_blue"], wm)
    house(rt, "house_c", 20, 17, 3.2, 1.5, wm["pink"], wm["roof_purple"], wm)
    house(rt, "house_d", -24, 17, 3.0, 1.4, wm["yellow"], wm["roof_red"], wm)
    # Trees scattered over the hills
    trees = [(-11, 16, 2.8, 1.5), (-15, 17.5, 3.4, 1.7), (8, 17, 3.6, 1.5), (13, 16, 2.6, 1.4), (26, 17, 2.6, 1.6),
             (-30, 17, 2.4, 1.6), (33, 18, 2.4, 1.3), (-19, 5.5, 1.0, 1.4), (14, 6.5, 1.0, 1.5), (31, 5.5, 0.9, 1.3),
             (-37, 6, 0.6, 1.4), (40, 6, 0.6, 1.4)]
    for i, (x, y, z, s) in enumerate(trees):
        tree(rt, f"tree_{i}", x, y, z, s, wm)
    pines = [(-34, 33, 7.0, 2.2), (-26, 32, 8.0, 2.0), (0, 35, 9.5, 2.3), (24, 33, 7.5, 2.1), (45, 32, 6.0, 2.0),
             (-3, 19, 4.6, 1.3), (16, 18.5, 3.9, 1.2)]
    for i, (x, y, z, s) in enumerate(pines):
        pine(rt, f"pine_{i}", x, y, z, s, wm)

    # Windmill tower on the right middle hill (sails exported separately)
    cylinder("mill_tower", 1.1, 0.7, 4.2, (31, 18, 2.6 + 2.1), wm["white"], rt, segs=16)
    cylinder("mill_cap", 0.95, 0.0, 1.1, (31, 18, 2.6 + 4.75), wm["roof_red"], rt, segs=16)
    rounded_box("mill_door", (0.5, 0.1, 0.8), (31, 17.1, 2.6 + 0.4), wm["door"], rt, bevel=0.04)

    # Fence along the near hills and flowers in front
    for i in range(-24, 25):
        x = i * 1.0
        rounded_box(f"fence_post_{i}", (0.14, 0.14, 0.9), (x * 1.6, 2.0, 0.45), wm["fence"], rt, bevel=0)
    for k, z in enumerate((0.35, 0.7)):
        rounded_box(f"fence_rail_{k}", (77, 0.08, 0.12), (0, 2.08, z), wm["fence"], rt, bevel=0)
    rnd = random.Random(7)
    for i in range(26):
        x = rnd.uniform(-36, 36)
        flower(rt, f"flower_{i}", x, rnd.uniform(0.6, 1.6), 0, wm["petals"][i % 4], wm, s=rnd.uniform(1.0, 1.5))
    join_children(rt)
    return rt


def build_windmill_sails(wm):
    rt = root("windmill_sails")
    rt.location = (31, 16.9, 2.6 + 4.1)
    cylinder("sail_hub", 0.22, 0.22, 0.35, (0, 0, 0), wm["roof_red"], rt, segs=12,
             rot=Matrix.Rotation(math.pi / 2, 3, "X"))
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        r = Matrix.Rotation(a, 3, "Y")
        rounded_box(f"sail_arm_{k}", (0.12, 0.08, 2.6), r @ Vector((0, 0, 1.3)), wm["bark"], rt, bevel=0.02, rot=r)
        rounded_box(f"sail_cloth_{k}", (0.6, 0.04, 1.9), r @ Vector((0.36, 0.03, 1.55)), wm["white"], rt, bevel=0.02, rot=r)
    join_children(rt)
    return rt


def build_cloud(wm, i, rnd):
    rt = root(f"cloud_{i}")
    els = []
    n = 5 + i
    for k in range(n):
        x = (k - (n - 1) / 2) * 0.85
        els.append(("BALL", (x, 0, rnd.uniform(-0.1, 0.25) + (0.45 if 0 < k < n - 1 else 0)), rnd.uniform(0.9, 1.25), None, None))
    els.append(("ELLIPSOID", (0, 0, -0.25), 1.0, ((n * 0.85) / 2, 0.7, 0.45), None))
    metaball_mesh(f"cloud_{i}_mesh", els, wm["cloud"], rt, resolution=0.16, scale=(1, 0.6, 0.85))
    return rt


def build_sun(wm):
    rt = root("sun")
    # Disc facing the camera (-Y), with puffy rays around it.
    uv_sphere("sun_disc", 1.4, (0, 0, 0), wm["sunny"], rt, scale=(1, 0.45, 1), segs=28, rings=14)
    for k in range(12):
        a = k * 2 * math.pi / 12
        r = Matrix.Rotation(-a, 3, "Y")
        cylinder(f"sun_ray_{k}", 0.28, 0.02, 0.6, r @ Vector((0, 0.15, 1.85)), wm["sun_ray"], rt, segs=10, rot=r)
    m = face_mats()

    def surface(x, z):
        return -0.45 * math.sqrt(max(1.4 ** 2 - x * x - z * z, 0.0))
    face(rt, m, 0.0, -0.6, spread=0.45, size=0.17, smile_w=0.42, surface=surface)
    join_children(rt)
    return rt


def build_hot_air_balloon(wm):
    rt = root("hot_air_balloon")
    prof = []
    steps = 24
    for i in range(steps + 1):
        t = i / steps
        a = t * math.pi * 0.86
        r = math.sin(a) * 1.6 * (1 - 0.35 * t * t)
        z = 2.4 + math.cos(a) * 1.9 - 0.4 * t ** 2
        prof.append((r, z))
    prof.append((0.5, 0.75))
    prof.append((0.0, 0.75))
    # Vertical gores in alternating colours: material by segment, not by ring.
    segs = 24
    o = lathe("hab_envelope", prof, wm["hab"], rt, segments=segs)
    for p in o.data.polygons:
        ang = math.atan2(p.center.y, p.center.x) % (2 * math.pi)
        p.material_index = int(ang / (2 * math.pi) * segs) % 4 if p.center.z > 0.9 else 1
    rounded_box("hab_basket", (0.7, 0.7, 0.55), (0, 0, -0.1), wm["basket"], rt, bevel=0.07)
    for sx in (-1, 1):
        for sy in (-1, 1):
            tube(f"hab_rope_{sx}_{sy}", [(sx * 0.3, sy * 0.3, 0.15), (sx * 0.45, sy * 0.45, 0.8)], 0.025, wm["rope"], rt, sides=4)
    join_children(rt)
    return rt


def build_world():
    wm = world_mats()
    rnd = random.Random(3)
    roots = [build_landscape(wm), build_windmill_sails(wm), build_hot_air_balloon(wm), build_sun(wm)]
    roots += [build_cloud(wm, i, rnd) for i in range(3)]
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


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    balloons = build_balloons()
    export(os.path.join(OUT_DIR, "balloons.glb"), balloons)
    if PREVIEW:
        os.makedirs(PREVIEW, exist_ok=True)
        for i, rt in enumerate(balloons):
            rt.location = ((i - (len(balloons) - 1) / 2) * 2.6, 0, 0)
        # Tint the shared skin for the preview only (the game tints per balloon).
        skin = next(n for n in bpy.data.materials["balloon_skin"].node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        skin.inputs["Base Color"].default_value = (*rgb("#ff6b9d"), 1)
        render(os.path.join(PREVIEW, "balloons.png"), (0, -21, 0.2), (0, 0, -0.4), lens=40)
    for rt in balloons:
        for o in [rt, *rt.children_recursive]:
            bpy.data.objects.remove(o)
    world = build_world()
    export(os.path.join(OUT_DIR, "world.glb"), world)
    if PREVIEW:
        bpy.data.objects["cloud_0"].location = (-8, 30, 13)
        bpy.data.objects["cloud_1"].location = (6, 30, 16)
        bpy.data.objects["cloud_2"].location = (14, 25, 10)
        bpy.data.objects["sun"].location = (-12, 40, 16)
        bpy.data.objects["hot_air_balloon"].location = (10, 28, 9)
        # Matches the game camera: three (0, 0, 14) looking at the origin, fov 50 -> Blender (0, -14, 0).
        # The game shifts the world down by WORLD_Y so the hills sit at the bottom.
        render(os.path.join(PREVIEW, "world.png"), (0, -14, 7.5), (0, 0, 7.5), lens=18 / math.tan(math.radians(25)) * (9 / 16))


main()
