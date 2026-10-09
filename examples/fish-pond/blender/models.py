"""
Fish Pond models: builds every creature and the lake world procedurally, then
exports two files the game loads:

  ../public/models/creatures.glb   one top-level node per catchable creature
  ../public/models/world.glb       the bear, boat, rod, bobber, sky friends and lake floor
  ../public/models/shore_*.glb     one far shore per place (loaded when that place is visited)

Run headless from this folder (no Blender window needed):

    blender --background --python models.py
    blender --background --python models.py -- --preview /tmp/out   # also renders preview PNGs
    blender --background --python models.py -- --out /tmp/glb        # exploratory build, shipped files untouched

Coordinates: Blender Z is up and -Y faces the camera (three.js +Z after the
Y-up glTF export).

Names the game relies on
------------------------
creatures.glb top-level nodes (each faces +X, its "nose", and sits on its origin):
  goldfish, bluefish, clownfish, pufferfish, crab, octopus, turtle, trout,
  jellyfish, narwhal, boot, duck, chest, goldenfish, whale
  <id>_tail        tail pivot (fish, whale, narwhal, turtle): the game wags it
  pufferfish_spikes the spikes, scaled up when the puffer puffs
  chest_lid        lid pivot on the back hinge: rotate about Z to open
Materials:
  jelly_glow       glowing jellyfish bell (brighter at night)
  gold_shiny       golden fish and coins (sparkly)

world.glb top-level nodes (shore_* nodes live in their own shore_*.glb):
  bear             sitting bear facing -Y (three +Z), origin at the seat
    bear_head      head pivot at the neck
    bear_arm_l     waving arm pivot at the shoulder
    bear_hat_sun   yellow bucket hat      (game toggles per place)
    bear_hat_snow  red beanie             (game toggles per place)
    bear_scarf     striped scarf          (game toggles per place)
    rod            fishing rod pivot at the paw; rotate X to swing
      rod_reel     reel pivot (spins while reeling)
      rod_tip      empty at the rod tip, where the line starts
  boat             rowboat, bow toward -Y, seat top at (0, 0.1, 0.36)
  bucket           upturned bucket the bear sits on for ice fishing (top at z 0.44)
  bobber           red and white float, origin at the waterline
  lilypad, lilypad_flower   floating pads
  weed             a seaweed strand, origin at its base
  lakebed          pebbles, rocks, shells and starfish on the lake floor (z = 0)
  shore_lake       hills, pines, a cabin with a dock (also used at night)
  shore_river      reeds, a willow, a stone bridge and a barn for the sunset river
  shore_ice        snowy hills, snowy pines, an igloo, a snowman and penguins
  shore_reef       a warm sea: palms, a beach hut and a lighthouse on the shore, and a coral
                   garden on the sea floor (y = FLOOR_Y) with three anemones
    reef_anemone_0..2  anemone pivots on the floor (the game sways them gently)
  sun, moon        smiling sky friends (face -Y)
  cloud_0..cloud_2 puffy clouds
Materials (looked up by name in the game):
  lantern_glow     boat lantern (lit at night)
  window_glow      cabin and barn windows (lit at night)
"""
import json
import math
import os
import random
import struct
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, Quaternion
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
# --out DIR writes the GLBs somewhere else (exploratory builds); the default is the shipped folder.
OUT_DIR = argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(HERE, "..", "public", "models")
PREVIEW = argv[argv.index("--preview") + 1] if "--preview" in argv else None
TAU = math.tau


# --- Helpers -------------------------------------------------------------------------

def rgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (0, 2, 4))


def material(name, color, metallic=0.0, roughness=0.6, emission=None, strength=1.0, double=False):
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
    m.use_backface_culling = not double
    return m


def link(obj, parent=None):
    if obj.name not in bpy.context.collection.objects:
        bpy.context.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
        # Geometry is built in world space; pivots are never rotated, so undo their offset.
        obj.matrix_parent_inverse = Matrix.Translation(-world_loc(parent))
    return obj


def world_loc(o):
    p = Vector((0, 0, 0))
    while o is not None:
        p += o.location
        o = o.parent
    return p


def root(name):
    return link(bpy.data.objects.new(name, None))


def pivot(name, parent, at):
    """An empty the game can rotate, placed at world position `at`."""
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.parent = parent
    o.location = Vector(at) - world_loc(parent)
    return o


def mesh_obj(name, bm, mat=None, parent=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new(name, me), parent)
    if isinstance(mat, (list, tuple)):
        for mm in mat:
            o.data.materials.append(mm)
    elif mat:
        o.data.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = smooth
    return o


def xform(bm, loc=(0, 0, 0), scale=(1, 1, 1), rot=None):
    m = Matrix.Diagonal((*scale, 1))
    if rot is not None:
        r = rot.to_matrix().to_4x4() if isinstance(rot, Quaternion) else rot.to_4x4()
        m = r @ m
    bmesh.ops.transform(bm, matrix=Matrix.Translation(loc) @ m, verts=bm.verts)


def sphere(name, r, loc, mat, parent=None, scale=(1, 1, 1), segs=14, rings=8, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    xform(bm, loc, scale, rot)
    return mesh_obj(name, bm, mat, parent)


def ico(name, r, loc, mat, parent=None, scale=(1, 1, 1), sub=1, rot=None, smooth=False, jitter=0.0, rnd=None):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    if jitter and rnd:
        for v in bm.verts:
            v.co *= 1 + rnd.uniform(-jitter, jitter)
    xform(bm, loc, scale, rot)
    return mesh_obj(name, bm, mat, parent, smooth)


def cylinder(name, r1, r2, depth, loc, mat, parent=None, segs=12, rot=None, smooth=True, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=depth)
    xform(bm, loc, scale, rot)
    return mesh_obj(name, bm, mat, parent, smooth)


def between(name, a, b, r1, r2, mat, parent=None, segs=10):
    """A (tapered) cylinder from point a to point b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    q = d.to_track_quat("Z", "Y")
    return cylinder(name, r1, r2, d.length, (a + b) / 2, mat, parent, segs=segs, rot=q)


def rounded_box(name, size, loc, mat, parent=None, bevel=0.05, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES", profile=0.5)
    xform(bm, loc, (1, 1, 1), rot)
    o = mesh_obj(name, bm, mat, parent, smooth=False)
    big = min(size[0] * size[1], size[1] * size[2], size[0] * size[2]) * 0.3
    for p in o.data.polygons:
        p.use_smooth = p.area < big
    return o


def lathe(name, profile, mat, parent=None, segments=24, loc=(0, 0, 0), mats_by_ring=None, xf=None, smooth=True):
    """Spin a (radius, z) profile around Z. Radius 0 at either end becomes a pole."""
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        if r < 1e-5:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(TAU * k / segments), r * math.sin(TAU * k / segments), z))
                          for k in range(segments)])
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(segments):
            k2 = (k + 1) % segments
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                f = bm.faces.new((a[0], b[k2], b[k]))
            elif len(b) == 1:
                f = bm.faces.new((a[k], a[k2], b[0]))
            else:
                f = bm.faces.new((a[k], a[k2], b[k2], b[k]))
            if mats_by_ring:
                f.material_index = mats_by_ring(i)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if xf is not None:
        bmesh.ops.transform(bm, matrix=xf, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return mesh_obj(name, bm, mat, parent, smooth)


def tube(name, points, radius, mat, parent=None, sides=6, radii=None, caps=True):
    """A tube along a polyline; `radii` tapers it point by point."""
    bm = bmesh.new()
    rings = []
    pts = [Vector(p) for p in points]
    prev_side = None
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        ref = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
        side = d.cross(ref).normalized() if prev_side is None else (prev_side - d * prev_side.dot(d)).normalized()
        prev_side = side
        up = side.cross(d).normalized()
        r = radii[i] if radii else radius
        rings.append([bm.verts.new(p + r * (math.cos(TAU * k / sides) * side + math.sin(TAU * k / sides) * up))
                      for k in range(sides)])
    for i in range(len(rings) - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    if caps:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, mat, parent)


def slab(name, pts, rim, peak, mat, parent=None, center=None, xf=None, smooth=True):
    """A pillowy flat shape from an outline in the XZ plane (fins, flukes, petals, stars).
    The outline must be star-shaped about `center`."""
    bm = bmesh.new()
    cx = center[0] if center else sum(p[0] for p in pts) / len(pts)
    cz = center[1] if center else sum(p[1] for p in pts) / len(pts)
    front = [bm.verts.new((x, -rim, z)) for x, z in pts]
    back = [bm.verts.new((x, rim, z)) for x, z in pts]
    cf = bm.verts.new((cx, -peak, cz))
    cb = bm.verts.new((cx, peak, cz))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((cf, front[j], front[i]))
        bm.faces.new((cb, back[i], back[j]))
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if xf is not None:
        bmesh.ops.transform(bm, matrix=xf, verts=bm.verts)
    return mesh_obj(name, bm, mat, parent, smooth)


def T(loc=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, s=(1, 1, 1)):
    """Translation @ rotation (Z, Y, X order) @ scale, for slab/lathe transforms."""
    r = Matrix.Rotation(rz, 4, "Z") @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rx, 4, "X")
    return Matrix.Translation(loc) @ r @ Matrix.Diagonal((*s, 1))


def finish(node):
    """Join each node's mesh children into one mesh (one draw per material), keeping pivots."""
    for c in list(node.children):
        if c.type == "EMPTY":
            finish(c)
    kids = [c for c in node.children if c.type == "MESH"]
    if len(kids) < 2:
        if kids:
            kids[0].name = kids[0].data.name = f"{node.name}_mesh"
        return
    bpy.ops.object.select_all(action="DESELECT")
    for c in kids:
        c.select_set(True)
    bpy.context.view_layer.objects.active = kids[0]
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = j.data.name = f"{node.name}_mesh"


# --- Faces: features stuck onto a surface with ray casts ------------------------------

def bvh(obj):
    me = obj.data
    return BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])


class Face:
    """Eyes, smiles and cheeks placed on a body mesh by casting rays at it."""

    def __init__(self, target, m, parent):
        self.tree = bvh(target)
        self.m = m
        self.parent = parent

    @staticmethod
    def ray(center, d):
        """Origin and direction for a ray aimed at `center` from outside, along direction d."""
        d = Vector(d).normalized()
        return Vector(center) + d * 4, -d

    def hit(self, origin, direction):
        loc, nrm, _, _ = self.tree.ray_cast(Vector(origin), Vector(direction).normalized())
        if loc is None:
            return Vector(origin), -Vector(direction).normalized()
        if nrm.dot(Vector(direction)) > 0:
            nrm = -nrm
        return loc, nrm

    def eye(self, name, origin, direction, size, squash=0.5, tall=1.2, sleepy=False):
        loc, n = self.hit(origin, direction)
        q = n.to_track_quat("-Y", "Z")
        if sleepy:
            return self.arc(name, origin, direction, size * 0.9, size * 0.5, size * 0.3, up=True)
        sphere(name, size, loc - n * size * 0.1, self.m["eye"], self.parent, scale=(0.9, squash, tall), segs=12, rings=8, rot=q)
        sh = loc + n * size * squash * 0.8 + q @ Vector((size * 0.32, 0, size * 0.45))
        sphere(name + "_shine", size * 0.34, sh, self.m["shine"], self.parent, scale=(1, 0.5, 1), segs=8, rings=6, rot=q)
        return loc, n

    def arc(self, name, origin, direction, w, depth, thick, up=False, mat=None):
        """A curved line on the surface: a smile (or a closed sleepy eye with up=True)."""
        c, n = self.hit(origin, direction)
        q = n.to_track_quat("-Y", "Z")
        right, upv = q @ Vector((1, 0, 0)), q @ Vector((0, 0, 1))
        pts = []
        for i in range(9):
            u = i / 8
            p = c + right * (u - 0.5) * 2 * w + upv * (math.sin(u * math.pi) * depth * (1 if up else -1))
            loc, nn = self.hit(p + n * 1.0, -n)
            pts.append(loc + nn * thick * 0.4)
        return tube(name, pts, thick, mat or self.m["eye"], self.parent, sides=6)

    def cheek(self, name, origin, direction, size):
        loc, n = self.hit(origin, direction)
        q = n.to_track_quat("-Y", "Z")
        sphere(name, size, loc, self.m["cheek"], self.parent, scale=(1.1, 0.28, 0.75), segs=12, rings=6, rot=q)


def face_mats():
    return {
        "eye": material("face_eye", "#231a3a", roughness=0.2),
        "shine": material("face_shine", "#ffffff", roughness=0.3, emission="#ffffff", strength=0.8),
        "cheek": material("face_cheek", "#ff8fb1", roughness=0.7),
        "white": material("face_white", "#ffffff", roughness=0.4),
    }


# --- Creatures ------------------------------------------------------------------------
# Each faces +X. Fish bodies are lathed along X and squeezed sideways.

def fish_profile(L, H, steps=20, tail_r=0.07, bias=1.4, round_=0.6):
    pts = [(0.0, -L / 2 - 0.01)]
    for i in range(steps + 1):
        u = i / steps
        r = H * math.sin(math.pi * u ** bias) ** round_ if u < 1 else 0.0
        r = max(r, tail_r * (1 - u) ** 2) if u < 1 else 0.0
        pts.append((r, -L / 2 + u * L))
    return pts


def r_at(profile, x):
    for (r0, x0), (r1, x1) in zip(profile, profile[1:]):
        if x0 <= x <= x1 and x1 > x0:
            return r0 + (r1 - r0) * (x - x0) / (x1 - x0)
    return 0.0


ROT_ZX = Matrix.Rotation(math.pi / 2, 4, "Y")  # lathe axis Z -> X


def fish_body(rt, name, L, H, width, mats, mats_by_ring=None, bias=1.4, round_=0.6, steps=20):
    prof = fish_profile(L, H, steps=steps, bias=bias, round_=round_)
    body = lathe(f"{name}_body", prof, mats, rt, segments=18, mats_by_ring=mats_by_ring,
                 xf=Matrix.Diagonal((1, width, 1, 1)) @ ROT_ZX)
    return body, prof


def fish_face(rt, body, m, L, H, eye_x, eye_z=0.12, eye=0.1, smile=True, smile_w=0.07):
    f = Face(body, m, rt)
    for s in (-1, 1):
        f.eye(f"{rt.name}_eye{s}", (eye_x, s * 3, eye_z * H / 0.45), (0, -s, 0), eye * H / 0.45, squash=0.45)
        if smile:
            f.arc(f"{rt.name}_smile{s}", (L / 2 - 0.07, s * 3, -0.07 * H / 0.45), (0, -s, 0), smile_w, 0.03, 0.016)
        f.cheek(f"{rt.name}_cheek{s}", (eye_x - 0.02, s * 3, -0.1 * H / 0.45), (0, -s, 0), 0.055 * H / 0.45)
    return f


def tail_fin(rt, name, at, mat, size=1.0, forked=True, upright=True):
    piv = pivot(f"{name}_tail", rt, at)
    s = size
    if forked:
        pts = [(0, 0.09), (-0.16, 0.26), (-0.33, 0.36), (-0.3, 0.14), (-0.24, 0), (-0.3, -0.14), (-0.33, -0.36),
               (-0.16, -0.26), (0, -0.09)]
    else:
        pts = [(0, 0.08), (-0.14, 0.22), (-0.3, 0.3), (-0.36, 0.15), (-0.38, 0), (-0.36, -0.15), (-0.3, -0.3),
               (-0.14, -0.22), (0, -0.08)]
    pts = [(x * s, z * s) for x, z in pts]
    rot = 0 if upright else math.pi / 2
    slab(f"{name}_tailfin", pts, 0.02 * s, 0.06 * s, mat, piv, center=(-0.12 * s, 0),
         xf=T(at, rx=rot))
    return piv


def dorsal(rt, name, x, z, mat, size=1.0, sweep=1.0):
    pts = [(0.18, 0), (0.08, 0.1), (-0.04 * sweep, 0.19), (-0.15 * sweep, 0.16), (-0.17, 0.0)]
    pts = [(px * size, pz * size) for px, pz in pts]
    slab(f"{name}_dorsal", pts, 0.015 * size, 0.035 * size, mat, rt, center=(0, 0.06 * size), xf=T((x, 0, z)))


def side_fins(rt, name, x, z, y, mat, size=1.0):
    pts = [(0.02, 0.05), (-0.1, 0.06), (-0.2, 0.0), (-0.12, -0.05), (0.02, -0.04)]
    pts = [(px * size, pz * size) for px, pz in pts]
    for s in (-1, 1):
        slab(f"{name}_fin{s}", pts, 0.012 * size, 0.03 * size, mat, rt, center=(-0.07 * size, 0),
             xf=T((x, s * y, z), rx=s * -0.6, rz=s * 0.5))


def creature_goldfish(m):
    rt = root("goldfish")
    orange = material("goldfish_orange", "#ff8a1f", roughness=0.35)
    fin = material("goldfish_fin", "#ffb35c", roughness=0.4)
    belly = material("goldfish_belly", "#ffd38a", roughness=0.4)
    L, H = 0.95, 0.4
    body, prof = fish_body(rt, "goldfish", L, H, 0.7, [orange, belly], mats_by_ring=lambda i: 0)
    fish_face(rt, body, m, L, H, eye_x=0.22)
    tail_fin(rt, "goldfish", (-L / 2 + 0.04, 0, 0.02), fin, size=1.25, forked=False)
    dorsal(rt, "goldfish", -0.02, H * 0.85, fin, 1.0)
    side_fins(rt, "goldfish", 0.12, -0.12, 0.2, fin)
    return rt


def creature_goldenfish(m):
    rt = root("goldenfish")
    gold = material("gold_shiny", "#ffc93c", metallic=0.85, roughness=0.22, emission="#ffb000", strength=0.25)
    fin = material("goldenfish_fin", "#fff0a0", metallic=0.4, roughness=0.3, emission="#ffd23f", strength=0.3)
    gem = material("goldenfish_gem", "#ff4f8b", roughness=0.15, emission="#ff2f6b", strength=0.4)
    L, H = 0.95, 0.42
    body, prof = fish_body(rt, "goldenfish", L, H, 0.7, gold)
    fish_face(rt, body, m, L, H, eye_x=0.22)
    tail_fin(rt, "goldenfish", (-L / 2 + 0.04, 0, 0.02), fin, size=1.35, forked=False)
    side_fins(rt, "goldenfish", 0.12, -0.12, 0.2, fin)
    # A little crown instead of a dorsal fin
    cz = H * 0.92
    lathe("goldenfish_crown", [(0.13, cz - 0.04), (0.14, cz + 0.05), (0.12, cz + 0.06), (0.11, cz - 0.02)], gold, rt,
          segments=20, loc=(0.02, 0, 0))
    for k in range(5):
        a = TAU * k / 5
        p = Vector((0.02 + 0.13 * math.cos(a), 0.13 * math.sin(a), cz + 0.05))
        cylinder(f"goldenfish_point{k}", 0.045, 0.0, 0.12, p + Vector((0, 0, 0.05)), gold, rt, segs=8)
        sphere(f"goldenfish_ball{k}", 0.025, p + Vector((0, 0, 0.12)), gold, rt, segs=8, rings=5)
    sphere("goldenfish_gem", 0.035, (0.02, -0.14, cz + 0.02), gem, rt, segs=10, rings=6)
    return rt


def creature_bluefish(m):
    rt = root("bluefish")
    blue = material("bluefish_blue", "#3d8bff", roughness=0.35)
    dark = material("bluefish_dark", "#1f4fb8", roughness=0.4)
    yellow = material("bluefish_yellow", "#ffd23f", roughness=0.4)
    L, H = 0.9, 0.48
    body, prof = fish_body(rt, "bluefish", L, H, 0.55, blue, bias=1.25, round_=0.55)
    fish_face(rt, body, m, L, H, eye_x=0.2)
    tail_fin(rt, "bluefish", (-L / 2 + 0.04, 0, 0.0), yellow, size=1.1, forked=True)
    dorsal(rt, "bluefish", -0.05, H * 0.8, dark, 1.25, sweep=1.3)
    # belly fin
    slab("bluefish_anal", [(0.12, 0), (0.0, -0.12), (-0.16, -0.1), (-0.16, 0)], 0.012, 0.03, dark, rt,
         center=(-0.03, -0.04), xf=T((-0.05, 0, -H * 0.75)))
    side_fins(rt, "bluefish", 0.1, -0.1, 0.17, yellow)
    return rt


def creature_clownfish(m):
    rt = root("clownfish")
    orange = material("clown_orange", "#ff7b1c", roughness=0.35)
    white = material("clown_white", "#ffffff", roughness=0.35)
    black = material("clown_black", "#2b2140", roughness=0.4)
    L, H = 0.9, 0.36
    steps = 30

    def band(i):
        u = (i - 0.5) / (steps + 1)
        for c in (0.2, 0.52, 0.8):
            d = abs(u - c)
            if d < 0.045:
                return 1
            if d < 0.065:
                return 2
        return 0
    body, prof = fish_body(rt, "clownfish", L, H, 0.65, [orange, white, black], mats_by_ring=band, steps=steps,
                           bias=1.3)
    fish_face(rt, body, m, L, H, eye_x=0.26, eye_z=0.1)
    tip = material("clown_fin", "#ff9a3c", roughness=0.4)
    tail_fin(rt, "clownfish", (-L / 2 + 0.04, 0, 0.0), tip, size=1.0, forked=False)
    dorsal(rt, "clownfish", -0.02, H * 0.88, tip, 1.0)
    side_fins(rt, "clownfish", 0.1, -0.1, 0.18, tip)
    return rt


def creature_trout(m):
    rt = root("trout")
    green = material("trout_green", "#7fae6a", roughness=0.4)
    pink = material("trout_pink", "#ff7aa8", roughness=0.35)
    spot = material("trout_spot", "#3d5a3a", roughness=0.5)
    fin = material("trout_fin", "#b8d38f", roughness=0.4)
    L, H = 1.15, 0.32
    body, prof = fish_body(rt, "trout", L, H, 0.6, green, bias=1.3)
    # Rainbow stripe along each side, stuck to the skin
    f = Face(body, m, rt)
    for s in (-1, 1):
        pts = []
        for i in range(12):
            x = -L / 2 + 0.12 + i * (L - 0.3) / 11
            loc, n = f.hit((x, s * 3, -0.02), (0, -s, 0))
            pts.append(loc + n * 0.01)
        r = [0.012 + 0.045 * math.sin(math.pi * i / 11) for i in range(12)]
        tube(f"trout_stripe{s}", pts, 0.04, pink, rt, sides=8, radii=r)
        rnd = random.Random(5 + s)
        for k in range(9):
            x = rnd.uniform(-0.3, 0.25)
            z = rnd.uniform(0.04, 0.14)
            loc, n = f.hit((x, s * 3, z), (0, -s, 0))
            sphere(f"trout_spot{s}_{k}", 0.022, loc, spot, rt, scale=(1, 0.4, 1), segs=8, rings=5,
                   rot=n.to_track_quat("-Y", "Z"))
    fish_face(rt, body, m, L, H, eye_x=0.33, eye_z=0.08)
    tail_fin(rt, "trout", (-L / 2 + 0.04, 0, 0.0), fin, size=1.05, forked=True)
    dorsal(rt, "trout", 0.0, H * 0.85, fin, 0.9)
    side_fins(rt, "trout", 0.2, -0.1, 0.15, fin)
    return rt


def creature_pufferfish(m):
    rt = root("pufferfish")
    skin = material("puffer_skin", "#ffd36b", roughness=0.45)
    belly = material("puffer_belly", "#fff4d6", roughness=0.5)
    spot = material("puffer_spot", "#c98a3a", roughness=0.5)
    spike = material("puffer_spike", "#fff0c2", roughness=0.4)
    fin = material("puffer_fin", "#ffb84d", roughness=0.4)
    R = 0.42
    body = sphere("pufferfish_body", R, (0, 0, 0), skin, rt, scale=(1.05, 0.95, 0.95), segs=24, rings=14)
    sphere("pufferfish_belly", R * 0.9, (0.03, 0, -0.06), belly, rt, scale=(1.0, 0.92, 0.95), segs=20, rings=12)
    f = Face(body, m, rt)
    rnd = random.Random(9)
    for k in range(10):
        a, b = rnd.uniform(-2.6, 2.6), rnd.uniform(0.1, 0.9)
        d = Vector((math.cos(a) * math.cos(b) * 0.7 - 0.3, math.sin(a) * math.cos(b), math.sin(b)))
        loc, n = f.hit(d * 3, -d)
        if loc.x > 0.2 and loc.z < 0.25:
            continue
        sphere(f"puffer_spot{k}", 0.05, loc, spot, rt, scale=(1, 0.3, 1), segs=8, rings=5, rot=n.to_track_quat("-Y", "Z"))
    spikes = pivot("pufferfish_spikes", rt, (0, 0, 0))
    for k in range(34):
        # Fibonacci sphere, skipping the face
        y = 1 - 2 * (k + 0.5) / 34
        rr = math.sqrt(1 - y * y)
        a = k * 2.39996
        d = Vector((math.cos(a) * rr, y, math.sin(a) * rr))
        d = Vector((d.x, d.z, d.y))
        if d.x > 0.55 and abs(d.y) < 0.75 and d.z > -0.5:
            continue
        base = Vector((d.x * R * 1.05, d.y * R * 0.95, d.z * R * 0.95))
        cylinder(f"puffer_spike{k}", 0.035, 0.0, 0.13, base + d * 0.04, spike, spikes, segs=6,
                 rot=d.to_track_quat("Z", "Y"))
    for s in (-1, 1):
        f.eye(f"puffer_eye{s}", (3, s * 0.95, 0.42), (-1, -s * 0.32, -0.14), 0.1, squash=0.45)
        f.cheek(f"puffer_cheek{s}", (3, s * 1.25, -0.25), (-1, -s * 0.4, 0.08), 0.06)
    # little "o" mouth
    loc, n = f.hit((3, 0, -0.18), (-1, 0, 0.06))
    lathe("puffer_mouth", [(0.0, -0.01), (0.045, 0.0), (0.05, 0.03), (0.03, 0.04), (0.0, 0.035)],
          material("puffer_lips", "#ff7a8a", roughness=0.4), rt, segments=14,
          xf=Matrix.Translation(loc) @ n.to_track_quat("Z", "Y").to_matrix().to_4x4())
    tail_fin(rt, "pufferfish", (-R * 1.0, 0, 0.0), fin, size=0.7, forked=False)
    side_fins(rt, "pufferfish", 0.0, -0.05, R * 0.85, fin, size=0.9)
    return rt


def creature_crab(m):
    rt = root("crab")
    red = material("crab_red", "#ff5a4f", roughness=0.4)
    light = material("crab_light", "#ffb3a0", roughness=0.5)
    body = sphere("crab_body", 0.36, (0, 0, 0.0), red, rt, scale=(0.9, 1.15, 0.6), segs=22, rings=12)
    sphere("crab_under", 0.32, (0, 0, -0.06), light, rt, scale=(0.85, 1.1, 0.4), segs=18, rings=8)
    f = Face(body, m, rt)
    for s in (-1, 1):
        # Eye stalks with eyes on top
        between(f"crab_stalk{s}", (0.18, s * 0.12, 0.12), (0.24, s * 0.15, 0.36), 0.035, 0.03, red, rt)
        sphere(f"crab_eyeball{s}", 0.09, (0.25, s * 0.15, 0.4), m["white"], rt, segs=14, rings=8)
        sphere(f"crab_pupil{s}", 0.055, (0.32, s * 0.16, 0.41), m["eye"], rt, scale=(0.6, 1, 1.1), segs=10, rings=6)
        sphere(f"crab_shine{s}", 0.02, (0.355, s * 0.14, 0.44), m["shine"], rt, segs=6, rings=4)
        f.cheek(f"crab_cheek{s}", *Face.ray((0, 0, 0), (1, s * 0.8, 0.1)), 0.06)
        # Claws
        arm = [(0.1, s * 0.34, 0.0), (0.26, s * 0.5, 0.04), (0.42, s * 0.5, 0.1)]
        tube(f"crab_arm{s}", arm, 0.05, red, rt, sides=8)
        claw = Vector((0.5, s * 0.5, 0.14))
        sphere(f"crab_claw{s}", 0.13, claw, red, rt, scale=(1.2, 0.8, 0.9), segs=14, rings=8)
        sphere(f"crab_pincer_a{s}", 0.07, claw + Vector((0.14, 0, 0.06)), red, rt, scale=(1.5, 0.6, 0.6), segs=10, rings=6,
               rot=Matrix.Rotation(-0.4, 3, "Y"))
        sphere(f"crab_pincer_b{s}", 0.06, claw + Vector((0.13, 0, -0.05)), red, rt, scale=(1.4, 0.6, 0.6), segs=10, rings=6,
               rot=Matrix.Rotation(0.4, 3, "Y"))
        # Legs
        for k in range(3):
            x = -0.12 - k * 0.1
            leg = [(x, s * 0.3, -0.02), (x - 0.04, s * 0.5, 0.06), (x - 0.08, s * 0.62, -0.14)]
            tube(f"crab_leg{s}_{k}", leg, 0.03, red, rt, sides=6, radii=[0.035, 0.03, 0.015])
    f.arc("crab_smile", *Face.ray((0, 0, 0), (1, 0, 0.1)), 0.09, 0.04, 0.018)
    return rt


def creature_octopus(m):
    rt = root("octopus")
    pink = material("octo_pink", "#c77dff", roughness=0.45)
    spots = material("octo_spot", "#e9c2ff", roughness=0.5)
    head = sphere("octopus_head", 0.38, (0, 0, 0.32), pink, rt, scale=(1, 1, 1.12), segs=22, rings=14)
    f = Face(head, m, rt)
    rnd = random.Random(4)
    for k in range(7):
        a = rnd.uniform(-2.8, 2.8)
        b = rnd.uniform(0.3, 1.1)
        d = Vector((math.cos(a) * math.cos(b), math.sin(a) * math.cos(b), math.sin(b)))
        if d.x > 0.4:
            d.x = -d.x
        loc, n = f.hit(Vector((0, 0, 0.32)) + d * 3, -d)
        sphere(f"octo_spot{k}", 0.05, loc, spots, rt, scale=(1, 0.3, 1), segs=8, rings=5, rot=n.to_track_quat("-Y", "Z"))
    for s in (-1, 1):
        f.eye(f"octo_eye{s}", *Face.ray((0, 0, 0.32), (1, s * 0.38, 0.22)), 0.1)
        f.cheek(f"octo_cheek{s}", *Face.ray((0, 0, 0.32), (1, s * 0.75, -0.2)), 0.06)
    f.arc("octo_smile", *Face.ray((0, 0, 0.32), (1, 0, -0.25)), 0.09, 0.05, 0.02)
    for k in range(8):
        a = TAU * (k + 0.5) / 8
        pts, radii = [], []
        for i in range(9):
            u = i / 8
            r = 0.2 + u * 0.38
            curl = u * u * 1.6
            pts.append((math.cos(a) * r + math.cos(a + 1.5) * 0.06 * math.sin(u * 5),
                        math.sin(a) * r + math.sin(a + 1.5) * 0.06 * math.sin(u * 5),
                        0.1 - u * 0.24 + curl * 0.12 * u))
            radii.append(0.085 * (1 - u * 0.75))
        tube(f"octo_arm{k}", pts, 0.08, pink, rt, sides=8, radii=radii)
    return rt


def creature_turtle(m):
    rt = root("turtle")
    shell = material("turtle_shell", "#4caf50", roughness=0.4)
    patch = material("turtle_patch", "#8bd36b", roughness=0.4)
    skin = material("turtle_skin", "#a8e07a", roughness=0.5)
    rimm = material("turtle_rim", "#f2d38a", roughness=0.5)
    dome = lathe("turtle_shell", [(0.0, 0.32), (0.18, 0.3), (0.32, 0.22), (0.42, 0.1), (0.46, 0.0), (0.44, -0.04), (0.0, -0.04)],
                 shell, rt, segments=28, xf=Matrix.Diagonal((1.1, 0.9, 1, 1)))
    torus_pts = [(0.48 * 1.1 * math.cos(TAU * k / 32), 0.48 * 0.9 * math.sin(TAU * k / 32), 0.0) for k in range(33)]
    tube("turtle_rim", torus_pts, 0.05, rimm, rt, sides=8, caps=False)
    f = Face(dome, m, rt)
    for k, (a, b) in enumerate([(0, 1.5), (0.0, 0.7), (2.1, 0.7), (-2.1, 0.7), (1.05, 0.55), (-1.05, 0.55), (3.14, 0.6)]):
        d = Vector((math.cos(a) * math.cos(b), math.sin(a) * math.cos(b), math.sin(b)))
        loc, n = f.hit(d * 3, -d)
        sphere(f"turtle_patch{k}", 0.12, loc, patch, rt, scale=(1, 0.22, 1), segs=6, rings=4, rot=n.to_track_quat("-Y", "Z"))
    head = sphere("turtle_head", 0.17, (0.58, 0, 0.08), skin, rt, scale=(1.15, 1, 0.95), segs=18, rings=10)
    fh = Face(head, m, rt)
    for s in (-1, 1):
        fh.eye(f"turtle_eye{s}", *Face.ray((0.58, 0, 0.08), (1, s * 0.75, 0.5)), 0.05, squash=0.45)
        fh.cheek(f"turtle_cheek{s}", *Face.ray((0.58, 0, 0.08), (0.8, s * 0.9, -0.1)), 0.035)
    fh.arc("turtle_smile", *Face.ray((0.58, 0, 0.08), (1, 0, -0.15)), 0.06, 0.03, 0.013)
    for sx in (1, -1):
        for s in (-1, 1):
            sphere(f"turtle_flipper{sx}{s}", 0.12, (sx * 0.3, s * 0.45, -0.03), skin, rt, scale=(1.4, 0.8, 0.35), segs=12, rings=6,
                   rot=Matrix.Rotation(s * sx * 0.5, 3, "Z"))
    piv = pivot("turtle_tail", rt, (-0.5, 0, 0.0))
    cylinder("turtle_tailcone", 0.06, 0.0, 0.16, (-0.56, 0, 0.0), skin, piv, segs=8, rot=Matrix.Rotation(-math.pi / 2, 3, "Y"))
    return rt


def creature_jellyfish(m):
    rt = root("jellyfish")
    glow = material("jelly_glow", "#ff9ee6", roughness=0.3, emission="#ff6bd6", strength=0.6)
    inner = material("jelly_inner", "#ffd1f4", roughness=0.3, emission="#ffb3ef", strength=0.4)
    tent = material("jelly_tentacle", "#d7a3ff", roughness=0.4, emission="#b06bff", strength=0.5)
    prof = [(0.0, 0.42), (0.16, 0.4), (0.3, 0.32), (0.4, 0.18), (0.44, 0.04), (0.46, -0.02), (0.4, 0.0), (0.0, 0.04)]
    bell = lathe("jellyfish_bell", prof, glow, rt, segments=28)
    # Frilly rim
    pts = []
    for k in range(49):
        a = TAU * k / 48
        r = 0.44 + 0.03 * math.sin(a * 12)
        pts.append((r * math.cos(a), r * math.sin(a), -0.02 + 0.025 * math.cos(a * 12)))
    tube("jellyfish_frill", pts, 0.035, inner, rt, sides=6, caps=False)
    sphere("jellyfish_core", 0.2, (0, 0, 0.18), inner, rt, scale=(1, 1, 0.8), segs=14, rings=8)
    f = Face(bell, m, rt)
    for s in (-1, 1):
        f.eye(f"jelly_eye{s}", *Face.ray((0, 0, 0.12), (1, s * 0.42, 0.3)), 0.075)
        f.cheek(f"jelly_cheek{s}", *Face.ray((0, 0, 0.12), (1, s * 0.7, 0.05)), 0.05)
    f.arc("jelly_smile", *Face.ray((0, 0, 0.12), (1, 0, 0.05)), 0.07, 0.04, 0.016)
    for k in range(7):
        a = TAU * k / 7 + 0.3
        r = 0.18 + (k % 2) * 0.12
        ln = 0.55 + (k % 3) * 0.12
        pts = [(r * math.cos(a) + 0.04 * math.sin(i * 1.4 + k), r * math.sin(a) + 0.04 * math.cos(i * 1.4 + k), -0.02 - i * ln / 7)
               for i in range(8)]
        tube(f"jelly_tent{k}", pts, 0.03, tent, rt, sides=6, radii=[0.035 * (1 - i / 9) for i in range(8)])
    return rt


def creature_narwhal(m):
    rt = root("narwhal")
    grey = material("narwhal_blue", "#8fb3d9", roughness=0.4)
    belly = material("narwhal_belly", "#f4f8ff", roughness=0.5)
    spot = material("narwhal_spot", "#5e83b0", roughness=0.5)
    tusk = material("narwhal_tusk", "#fff5d6", roughness=0.35)
    L, H = 1.1, 0.34
    body, prof = fish_body(rt, "narwhal", L, H, 0.95, grey, bias=1.1, round_=0.5)
    sphere("narwhal_belly", H * 0.8, (0.06, 0, -0.15), belly, rt, scale=(1.4, 0.95, 0.5), segs=16, rings=8)
    f = Face(body, m, rt)
    rnd = random.Random(2)
    for k in range(8):
        x, z, s = rnd.uniform(-0.35, 0.15), rnd.uniform(0.08, 0.28), rnd.choice((-1, 1))
        loc, n = f.hit((x, s * 3, z), (0, -s, 0))
        sphere(f"narwhal_spot{k}", 0.03, loc, spot, rt, scale=(1, 0.3, 1), segs=8, rings=5, rot=n.to_track_quat("-Y", "Z"))
    fish_face(rt, body, m, L, H, eye_x=0.3, eye_z=0.06, eye=0.085)
    # Spiral tusk
    pts, radii = [], []
    for i in range(16):
        u = i / 15
        pts.append((L / 2 - 0.05 + u * 0.55, 0.012 * math.cos(u * 30), 0.06 + u * 0.12 + 0.012 * math.sin(u * 30)))
        radii.append(0.045 * (1 - u) + 0.004)
    tube("narwhal_tusk", pts, 0.04, tusk, rt, sides=7, radii=radii)
    piv = pivot("narwhal_tail", rt, (-L / 2 + 0.03, 0, 0.0))
    fl = [(0.0, 0.05), (-0.1, 0.18), (-0.24, 0.3), (-0.26, 0.18), (-0.2, 0.0), (-0.26, -0.18), (-0.24, -0.3), (-0.1, -0.18),
          (0.0, -0.05)]
    slab("narwhal_fluke", fl, 0.02, 0.05, grey, piv, center=(-0.1, 0), xf=T((-L / 2 + 0.03, 0, 0.0), rx=math.pi / 2))
    side_fins(rt, "narwhal", 0.15, -0.12, 0.28, grey, 1.1)
    return rt


def creature_whale(m):
    rt = root("whale")
    blue = material("whale_blue", "#4f7cff", roughness=0.4)
    belly = material("whale_belly", "#e6f0ff", roughness=0.5)
    L, H = 1.6, 0.58
    body, prof = fish_body(rt, "whale", L, H, 0.95, blue, bias=1.05, round_=0.45)
    # Grooved belly: a few pale stripes under the chin
    sphere("whale_belly", H * 0.8, (0.18, 0, -0.26), belly, rt, scale=(1.3, 0.92, 0.45), segs=20, rings=10)
    f = Face(body, m, rt)
    for s in (-1, 1):
        f.eye(f"whale_eye{s}", (0.42, s * 3, 0.02), (0, -s, 0), 0.085, squash=0.45)
        f.cheek(f"whale_cheek{s}", (0.48, s * 3, -0.13), (0, -s, 0), 0.075)
        f.arc(f"whale_smile{s}", (0.68, s * 3, -0.15), (0, -s, 0), 0.12, 0.05, 0.02)
        # flippers
        slab(f"whale_flipper{s}", [(0.08, 0.04), (-0.08, 0.06), (-0.3, -0.02), (-0.12, -0.08), (0.06, -0.05)], 0.02, 0.04, blue,
             rt, center=(-0.06, 0), xf=T((0.15, s * 0.5, -0.25), rx=s * -0.9, rz=s * 0.5))
    # blowhole
    sphere("whale_blowhole", 0.04, (0.25, 0, H * 0.97), material("whale_dark", "#2f4fb0", roughness=0.4), rt,
           scale=(1.4, 1, 0.4), segs=10, rings=5)
    piv = pivot("whale_tail", rt, (-L / 2 + 0.06, 0, 0.0))
    fl = [(0.0, 0.07), (-0.12, 0.26), (-0.3, 0.45), (-0.34, 0.28), (-0.26, 0.0), (-0.34, -0.28), (-0.3, -0.45), (-0.12, -0.26),
          (0.0, -0.07)]
    slab("whale_fluke", fl, 0.025, 0.07, blue, piv, center=(-0.13, 0), xf=T((-L / 2 + 0.06, 0, 0.05), rx=math.pi / 2))
    return rt


def creature_boot(m):
    rt = root("boot")
    leather = material("boot_leather", "#9b6a43", roughness=0.7)
    sole = material("boot_sole", "#4a3428", roughness=0.8)
    lace = material("boot_lace", "#fff1c9", roughness=0.7)
    weed = material("boot_weed", "#5cb85c", roughness=0.6)
    rounded_box("boot_shaft", (0.36, 0.34, 0.6), (-0.14, 0, 0.32), leather, rt, bevel=0.08)
    toe = sphere("boot_toe", 0.24, (0.16, 0, 0.12), leather, rt, scale=(1.5, 0.75, 0.6), segs=20, rings=10)
    rounded_box("boot_sole", (0.82, 0.38, 0.08), (0.06, 0, -0.03), sole, rt, bevel=0.035)
    rounded_box("boot_heel", (0.22, 0.34, 0.1), (-0.2, 0, -0.1), sole, rt, bevel=0.03)
    lathe("boot_opening", [(0.0, 0.6), (0.14, 0.61), (0.17, 0.64), (0.16, 0.67), (0.0, 0.62)], sole, rt, segments=16,
          loc=(-0.14, 0, 0), xf=Matrix.Diagonal((1.15, 1.1, 1, 1)))
    for k in range(4):
        z = 0.2 + k * 0.1
        tube(f"boot_lace{k}", [(0.04 - k * 0.02, -0.12, z), (0.06 - k * 0.02, 0, z + 0.03), (0.04 - k * 0.02, 0.12, z)], 0.018, lace, rt,
             sides=5)
    # A strand of pond weed hanging from the top
    pts = [(-0.02, -0.17, 0.62), (0.04, -0.2, 0.55), (0.06, -0.22, 0.42), (0.03, -0.22, 0.3), (0.06, -0.21, 0.2)]
    tube("boot_weed", pts, 0.03, weed, rt, sides=6, radii=[0.03, 0.035, 0.03, 0.025, 0.015])
    f = Face(toe, m, rt)
    for s in (-1, 1):
        f.eye(f"boot_eye{s}", *Face.ray((0.16, 0, 0.12), (0.7, s * 0.35, 0.65)), 0.06)
    f.arc("boot_smile", *Face.ray((0.16, 0, 0.12), (1, 0, 0.1)), 0.07, 0.035, 0.016)
    return rt


def creature_duck(m):
    rt = root("duck")
    yellow = material("duck_yellow", "#ffd93b", roughness=0.25)
    beak = material("duck_beak", "#ff8c1a", roughness=0.3)
    body = sphere("duck_body", 0.34, (0, 0, 0.0), yellow, rt, scale=(1.25, 1.0, 0.8), segs=22, rings=12)
    cylinder("duck_tailtip", 0.14, 0.0, 0.22, (-0.44, 0, 0.12), yellow, rt, segs=12, rot=Matrix.Rotation(-2.3, 3, "Y"))
    head = sphere("duck_head", 0.23, (0.22, 0, 0.36), yellow, rt, segs=20, rings=12)
    sphere("duck_beak", 0.11, (0.45, 0, 0.32), beak, rt, scale=(1.3, 1.15, 0.45), segs=14, rings=8)
    for s in (-1, 1):
        sphere(f"duck_wing{s}", 0.18, (-0.05, s * 0.3, 0.05), yellow, rt, scale=(1.4, 0.35, 0.75), segs=14, rings=8,
               rot=Matrix.Rotation(0.3, 3, "Y"))
    f = Face(head, m, rt)
    for s in (-1, 1):
        f.eye(f"duck_eye{s}", *Face.ray((0.22, 0, 0.36), (0.75, s * 0.6, 0.35)), 0.055, squash=0.45)
        f.cheek(f"duck_cheek{s}", *Face.ray((0.22, 0, 0.36), (0.6, s * 0.8, -0.15)), 0.04)
    return rt


def creature_chest(m):
    rt = root("chest")
    wood = material("chest_wood", "#b5651d", roughness=0.6)
    dark = material("chest_dark", "#7a3f12", roughness=0.6)
    gold = material("gold_shiny", "#ffc93c", metallic=0.85, roughness=0.22, emission="#ffb000", strength=0.25)
    gem = material("chest_gem", "#2ec4ff", roughness=0.1, emission="#2ec4ff", strength=0.5)
    W, D, Hh = 0.48, 0.7, 0.36  # depth along X (front at +X)
    rounded_box("chest_box", (W, D, Hh), (0, 0, Hh / 2), wood, rt, bevel=0.03)
    for y in (-0.22, 0.22):
        rounded_box(f"chest_band{y}", (W + 0.03, 0.06, Hh + 0.02), (0, y, Hh / 2), gold, rt, bevel=0.01)
    rounded_box("chest_lock", (0.05, 0.1, 0.12), (W / 2 + 0.02, 0, Hh - 0.05), gold, rt, bevel=0.015)
    gp = pivot("chest_gold", rt, (0, 0, Hh))
    rnd = random.Random(3)
    for k in range(10):
        p = (rnd.uniform(-0.15, 0.15), rnd.uniform(-0.25, 0.25), Hh - 0.02 + rnd.uniform(0, 0.06))
        cylinder(f"chest_coin{k}", 0.06, 0.06, 0.02, p, gold, gp, segs=12, rot=Matrix.Rotation(rnd.uniform(-0.5, 0.5), 3, "X"))
    sphere("chest_gem", 0.06, (0.0, 0.05, Hh + 0.06), gem, gp, segs=10, rings=6)
    lid = pivot("chest_lid", rt, (-W / 2, 0, Hh))
    # Rounded lid: half cylinder along Y, hinge at the back (-X)
    prof = [(W / 2, -D / 2)] + [(W / 2, D / 2)]
    bm = bmesh.new()
    segs = 10
    rows = []
    for yy in (-D / 2, D / 2):
        rows.append([bm.verts.new((W / 2 * math.cos(math.pi * k / segs), yy, Hh + W / 2 * 0.7 * math.sin(math.pi * k / segs)))
                     for k in range(segs + 1)])
    for k in range(segs):
        bm.faces.new((rows[0][k], rows[0][k + 1], rows[1][k + 1], rows[1][k]))
    bm.faces.new(rows[0])
    bm.faces.new(list(reversed(rows[1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh_obj("chest_lid_shell", bm, wood, lid, smooth=True)
    for y in (-0.22, 0.22):
        pts = [(W / 2 * 1.04 * math.cos(math.pi * k / 10), y, Hh + W / 2 * 0.74 * math.sin(math.pi * k / 10)) for k in range(11)]
        tube(f"chest_lidband{y}", pts, 0.03, gold, lid, sides=6)
    rounded_box("chest_rim", (W + 0.02, D + 0.02, 0.04), (0, 0, Hh), dark, lid, bevel=0.01)
    return rt


def build_creatures():
    m = face_mats()
    return [creature_goldfish(m), creature_bluefish(m), creature_clownfish(m), creature_pufferfish(m), creature_crab(m),
            creature_octopus(m), creature_turtle(m), creature_trout(m), creature_jellyfish(m), creature_narwhal(m),
            creature_boot(m), creature_duck(m), creature_chest(m), creature_goldenfish(m), creature_whale(m)]


# --- Bear, boat, rod ------------------------------------------------------------------

def build_bear(m):
    rt = root("bear")
    fur = material("bear_fur", "#a8693f", roughness=0.75)
    cream = material("bear_cream", "#f6dcb4", roughness=0.75)
    pink = material("bear_pink", "#ff9fb5", roughness=0.6)
    nose = material("bear_nose", "#3a2420", roughness=0.3)
    vest = material("bear_vest", "#3fb8a8", roughness=0.6)
    sphere("bear_body", 0.42, (0, 0, 0.42), fur, rt, scale=(1, 0.9, 1.08), segs=22, rings=14)
    sphere("bear_belly", 0.3, (0, -0.25, 0.4), cream, rt, scale=(1, 0.5, 1.1), segs=18, rings=10)
    # A little fishing vest with pockets
    lathe("bear_vest", [(0.44, 0.3), (0.45, 0.45), (0.42, 0.6), (0.34, 0.74), (0.3, 0.76), (0.3, 0.3)], vest, rt, segments=24,
          mats_by_ring=None, xf=Matrix.Diagonal((1.0, 0.92, 1, 1)))
    for s in (-1, 1):
        rounded_box(f"bear_pocket{s}", (0.12, 0.04, 0.1), (s * 0.27, -0.36, 0.48), material("bear_vest_pocket", "#2f9a8c"), rt,
                    bevel=0.015, rot=Matrix.Rotation(s * 0.5, 3, "Z"))
        sphere(f"bear_leg{s}", 0.17, (s * 0.22, -0.3, 0.12), fur, rt, scale=(1, 1.5, 0.9), segs=14, rings=8)
        sphere(f"bear_pad{s}", 0.11, (s * 0.22, -0.54, 0.13), cream, rt, scale=(1, 0.35, 1.05), segs=14, rings=8)
        sphere(f"bear_bean{s}", 0.055, (s * 0.22, -0.58, 0.1), pink, rt, scale=(1, 0.4, 0.8), segs=10, rings=6)
        for t in (-1, 0, 1):
            sphere(f"bear_toe{s}{t}", 0.025, (s * 0.22 + t * 0.045, -0.58, 0.18 - abs(t) * 0.01), pink, rt, scale=(1, 0.4, 1),
                   segs=8, rings=5)
    # Head on a pivot at the neck
    head_p = pivot("bear_head", rt, (0, -0.02, 0.82))
    head = sphere("bear_skull", 0.36, (0, -0.04, 1.1), fur, head_p, scale=(1.08, 0.95, 0.95), segs=24, rings=16)
    sphere("bear_muzzle", 0.15, (0, -0.35, 1.02), cream, head_p, scale=(1.25, 0.75, 0.85), segs=16, rings=10)
    sphere("bear_nose", 0.06, (0, -0.47, 1.08), nose, head_p, scale=(1.35, 0.9, 0.9), segs=12, rings=8)
    sphere("bear_nose_shine", 0.018, (0.02, -0.52, 1.11), m["shine"], head_p, segs=6, rings=4)
    for s in (-1, 1):
        sphere(f"bear_ear{s}", 0.12, (s * 0.27, -0.02, 1.38), fur, head_p, scale=(1, 0.6, 1), segs=14, rings=8)
        sphere(f"bear_ear_in{s}", 0.07, (s * 0.27, -0.08, 1.37), pink, head_p, scale=(1, 0.4, 1), segs=10, rings=6)
    f = Face(head, m, head_p)
    for s in (-1, 1):
        f.eye(f"bear_eye{s}", (s * 0.14, -3, 1.18), (0, 1, 0), 0.06, squash=0.45)
        f.cheek(f"bear_cheek{s}", (s * 0.24, -3, 1.02), (0, 1, 0.05), 0.06)
    fm = Face(bpy.data.objects["bear_muzzle"], m, head_p)
    fm.arc("bear_smile", (0, -3, 0.98), (0, 1, 0), 0.06, 0.035, 0.016)
    # Hats and scarf (the game shows the one that suits the place)
    sun = pivot("bear_hat_sun", head_p, (0, -0.04, 1.36))
    yel = material("hat_yellow", "#ffd23f", roughness=0.6)
    band = material("hat_band", "#ff6b6b", roughness=0.6)
    lathe("hat_sun_crown", [(0.0, 1.62), (0.18, 1.61), (0.25, 1.55), (0.28, 1.4), (0.3, 1.33), (0.0, 1.33)], yel, sun, segments=24,
          loc=(0, -0.04, 0))
    lathe("hat_sun_brim", [(0.27, 1.38), (0.45, 1.33), (0.5, 1.29), (0.47, 1.28), (0.27, 1.33)], yel, sun, segments=28,
          loc=(0, -0.04, 0))
    lathe("hat_sun_band", [(0.284, 1.36), (0.29, 1.42), (0.27, 1.45), (0.265, 1.37)], band, sun, segments=24, loc=(0, -0.04, 0))
    snow = pivot("bear_hat_snow", head_p, (0, -0.04, 1.36))
    red = material("hat_red", "#ff4f6d", roughness=0.8)
    white = material("hat_white", "#ffffff", roughness=0.9)
    lathe("hat_snow_dome", [(0.0, 1.7), (0.15, 1.67), (0.28, 1.56), (0.36, 1.4), (0.38, 1.3), (0.0, 1.3)], red, snow, segments=24,
          loc=(0, -0.04, 0))
    pts = [(0.385 * math.cos(TAU * k / 28), -0.04 + 0.385 * math.sin(TAU * k / 28), 1.3) for k in range(29)]
    tube("hat_snow_band", pts, 0.06, white, snow, sides=8, caps=False)
    sphere("hat_snow_pom", 0.1, (0, -0.04, 1.75), white, snow, segs=12, rings=8)
    scarf = pivot("bear_scarf", rt, (0, -0.02, 0.8))
    stripes = [material("scarf_red", "#ff4f6d", roughness=0.8), white]
    pts = [(0.3 * math.cos(TAU * k / 24), -0.02 + 0.28 * math.sin(TAU * k / 24), 0.8) for k in range(25)]
    tube("scarf_loop", pts, 0.08, stripes[0], scarf, sides=8, caps=False)
    rounded_box("scarf_tail", (0.14, 0.05, 0.36), (0.16, -0.32, 0.6), stripes[0], scarf, bevel=0.03,
                rot=Matrix.Rotation(0.2, 3, "Y"))
    for k in range(3):
        rounded_box(f"scarf_stripe{k}", (0.15, 0.055, 0.04), (0.16 + (k - 1) * -0.02, -0.325, 0.5 + k * 0.1), white, scarf, bevel=0.01,
                    rot=Matrix.Rotation(0.2, 3, "Y"))
    # Arms: the left one waves, the right one holds the rod
    al = pivot("bear_arm_l", rt, (-0.36, -0.05, 0.64))
    tube("bear_arm_l_limb", [(-0.36, -0.05, 0.64), (-0.42, -0.2, 0.48), (-0.36, -0.36, 0.38)], 0.11, fur, al, sides=10)
    sphere("bear_paw_l", 0.11, (-0.36, -0.38, 0.37), fur, al, segs=12, rings=8)
    tube("bear_arm_r_limb", [(0.36, -0.05, 0.64), (0.36, -0.28, 0.54), (0.2, -0.45, 0.5)], 0.11, fur, rt, sides=10)
    sphere("bear_paw_r", 0.11, (0.18, -0.47, 0.5), fur, rt, segs=12, rings=8)
    # Rod: pivot at the paw, pointing forward (-Y) and up
    rod = pivot("rod", rt, (0.18, -0.47, 0.5))
    base = Vector((0.18, -0.47, 0.5))
    d = Vector((0, -0.62, 0.78)).normalized()
    cork = material("rod_cork", "#d9a066", roughness=0.8)
    pole = material("rod_pole", "#ff5f5f", roughness=0.35)
    metal = material("rod_metal", "#c9d2e3", metallic=0.7, roughness=0.3)
    between("rod_handle", base - d * 0.28, base + d * 0.12, 0.045, 0.04, cork, rod)
    between("rod_pole", base + d * 0.12, base + d * 2.2, 0.03, 0.011, pole, rod, segs=8)
    sphere("rod_tipball", 0.025, base + d * 2.2, material("rod_tipball", "#ffd23f", roughness=0.4), rod, segs=8, rings=5)
    for k, t in enumerate((0.7, 1.3, 1.85)):
        p = base + d * t
        pts = [p + Vector((0.035 * math.cos(TAU * i / 10), 0, 0.035 * math.sin(TAU * i / 10))) - Vector((0, 0, 0.04)) for i in range(11)]
        tube(f"rod_guide{k}", pts, 0.008, metal, rod, sides=4, caps=False)
    reel = pivot("rod_reel", rod, base + d * 0.02 + Vector((0.1, 0, 0)))
    rc = base + d * 0.02 + Vector((0.1, 0, 0))
    cylinder("rod_reel_drum", 0.08, 0.08, 0.06, rc, metal, reel, segs=16, rot=Matrix.Rotation(math.pi / 2, 3, "Y"))
    between("rod_reel_handle", rc + Vector((0.035, 0, 0)), rc + Vector((0.05, 0, 0.09)), 0.012, 0.012, metal, reel, segs=6)
    sphere("rod_reel_knob", 0.025, rc + Vector((0.06, 0, 0.1)), material("rod_knob", "#ffd23f", roughness=0.4), reel, segs=8, rings=5)
    pivot("rod_tip", rod, base + d * 2.22)
    return rt


def build_boat(m):
    rt = root("boat")
    paint = material("boat_paint", "#3fa7e0", roughness=0.5)
    stripe = material("boat_stripe", "#ffffff", roughness=0.5)
    wood_a = material("boat_wood", "#c98b52", roughness=0.7, double=True)
    wood_b = material("boat_wood_dark", "#b0743f", roughness=0.7, double=True)
    trim = material("boat_trim", "#fff1d6", roughness=0.6)
    St, K = 16, 12

    def section(u, inset=0.0):
        """Cross-section at u (0 = bow, 1 = stern) as a list of (x, z) from left rim to right rim."""
        w = 0.68 * (1 - (1 - u) ** 2.4) * (1 - 0.2 * u ** 5) - inset
        w = max(w, 0.015)
        depth = 0.48 * (0.55 + 0.45 * math.sin(math.pi * min(1, u * 1.1))) - inset
        top = 0.56 + 0.22 * (1 - u) ** 3
        pts = []
        for k in range(K + 1):
            a = -math.pi / 2 + math.pi * k / K
            pts.append((w * math.sin(a), top - depth * math.cos(a) ** 0.6))
        return pts

    def hull(name, inset, mats, mat_fn, flip):
        bm = bmesh.new()
        rows = []
        for i in range(St + 1):
            u = i / St
            y = -1.45 + u * 2.75
            rows.append([bm.verts.new((x, y, z)) for x, z in section(u, inset)])
        for i in range(St):
            for k in range(K):
                f = bm.faces.new((rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]))
                f.material_index = mat_fn(k)
        tr = bm.faces.new(rows[-1])  # flat stern (transom)
        tr.material_index = mat_fn(K // 2)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if flip:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        return mesh_obj(name, bm, mats, rt)

    hull("boat_hull", 0.0, [paint, stripe], lambda k: 1 if k in (0, 1, K - 1, K - 2) else 0, False)
    hull("boat_inside", 0.05, [wood_a, wood_b], lambda k: k % 2, True)
    # Rim around the top
    rim = []
    for i in range(St + 1):
        u = i / St
        rim.append(Vector((section(u)[0][0], -1.45 + u * 2.75, section(u)[0][1])))
    loop = rim + [Vector((-p.x, p.y, p.z)) for p in reversed(rim)]
    tube("boat_rim", [p + Vector((0, 0, 0.01)) for p in loop] + [loop[0] + Vector((0, 0, 0.01))], 0.045, trim, rt, sides=6,
         caps=False)
    for y, w in ((0.1, 1.24), (-0.8, 0.9), (0.95, 1.18)):
        rounded_box(f"boat_seat{y}", (w, 0.34, 0.06), (0, y, 0.33), wood_b, rt, bevel=0.02)
    # Oars resting in their locks
    for s in (-1, 1):
        a = Vector((s * 0.3, 0.3, 0.6))
        b = Vector((s * 1.6, -0.25, -0.05))
        between(f"boat_oar{s}", a, b, 0.03, 0.03, wood_a, rt, segs=8)
        dvec = (b - a).normalized()
        rounded_box(f"boat_blade{s}", (0.42, 0.18, 0.03), b + dvec * 0.18, wood_b, rt, bevel=0.012,
                    rot=dvec.to_track_quat("X", "Z").to_matrix())
    # Lantern on a pole at the stern
    between("boat_pole", (0, 1.18, 0.4), (0, 1.18, 1.35), 0.025, 0.02, trim, rt, segs=8)
    between("boat_hook", (0, 1.18, 1.35), (0, 1.0, 1.4), 0.018, 0.018, trim, rt, segs=6)
    dark = material("lantern_frame", "#3b3355", roughness=0.4)
    glow = material("lantern_glow", "#ffe9a6", roughness=0.3, emission="#ffcc55", strength=0.5)
    cylinder("lantern_cap", 0.1, 0.03, 0.08, (0, 1.0, 1.3), dark, rt, segs=10)
    sphere("lantern_glass", 0.085, (0, 1.0, 1.2), glow, rt, scale=(1, 1, 1.2), segs=12, rings=8)
    cylinder("lantern_base", 0.08, 0.1, 0.05, (0, 1.0, 1.09), dark, rt, segs=10)
    # Tackle box and a little bucket
    rounded_box("boat_tackle", (0.36, 0.22, 0.18), (0.3, 0.95, 0.45), material("tackle_red", "#ff5f5f", roughness=0.5), rt,
                bevel=0.03)
    rounded_box("boat_tackle_handle", (0.16, 0.04, 0.04), (0.3, 0.95, 0.56), trim, rt, bevel=0.01)
    lathe("boat_bucket", [(0.0, 0.36), (0.12, 0.36), (0.16, 0.58), (0.14, 0.58), (0.1, 0.38), (0.0, 0.38)],
          material("bucket_green", "#7ed957", roughness=0.5), rt, segments=16, loc=(-0.32, 0.95, 0))
    return rt


def build_bucket(m):
    rt = root("bucket")
    metal = material("bucket_metal", "#9fb4d6", metallic=0.5, roughness=0.35)
    ring = material("bucket_ring", "#6f86ad", metallic=0.5, roughness=0.35)
    lathe("bucket_body", [(0.0, 0.44), (0.24, 0.44), (0.33, 0.0), (0.0, 0.0)], metal, rt, segments=24)
    for z, r in ((0.08, 0.32), (0.36, 0.26)):
        pts = [(r * math.cos(TAU * k / 24), r * math.sin(TAU * k / 24), z) for k in range(25)]
        tube(f"bucket_ring{z}", pts, 0.02, ring, rt, sides=6, caps=False)
    pts = [(0.33 * math.cos(a), -0.02, 0.2 - 0.18 * math.sin(a)) for a in [math.pi * k / 10 for k in range(11)]]
    tube("bucket_handle", pts, 0.014, ring, rt, sides=5)
    # A small cushion so it looks comfy
    sphere("bucket_cushion", 0.24, (0, 0, 0.46), material("cushion_pink", "#ff8fb1", roughness=0.8), rt, scale=(1, 1, 0.22),
           segs=16, rings=8)
    return rt


def build_bobber(m):
    rt = root("bobber")
    red = material("bobber_red", "#ff3b4f", roughness=0.25)
    white = material("bobber_white", "#ffffff", roughness=0.3)
    prof = [(0.0, -0.15)] + [(0.15 * math.sin(math.pi * i / 12), -0.15 * math.cos(math.pi * i / 12)) for i in range(1, 12)] + [
        (0.0, 0.15)]
    lathe("bobber_ball", prof, [white, red], rt, segments=20, mats_by_ring=lambda i: 1 if i >= 6 else 0)
    cylinder("bobber_stick", 0.022, 0.016, 0.18, (0, 0, 0.22), material("bobber_yellow", "#ffd23f", roughness=0.4), rt, segs=8)
    cylinder("bobber_stick_low", 0.02, 0.012, 0.1, (0, 0, -0.18), white, rt, segs=8)
    return rt


def build_lilypads():
    pad = material("lily_pad", "#59c25a", roughness=0.55)
    vein = material("lily_vein", "#8fe08a", roughness=0.55)
    out = []
    for name in ("lilypad", "lilypad_flower"):
        rt = root(name)
        pts = []
        for k in range(29):
            a = 0.35 + (TAU - 0.7) * k / 28
            pts.append((0.5 * math.cos(a), 0.5 * math.sin(a)))
        pts.append((0.0, 0.0))
        slab(f"{name}_pad", pts, 0.015, 0.03, pad, rt, center=(-0.12, 0.0), xf=T((0, 0, 0), rx=math.pi / 2))
        for k in range(5):
            a = 0.9 + k * 1.1
            tube(f"{name}_vein{k}", [(-0.05, 0, 0.03), (0.38 * math.cos(a), 0.38 * math.sin(a), 0.035)], 0.012, vein, rt, sides=4)
        if name == "lilypad_flower":
            petal = material("lily_petal", "#ff9fd0", roughness=0.4)
            tipm = material("lily_center", "#ffd23f", roughness=0.4)
            for ring_i, (n, r, tilt) in enumerate(((8, 0.15, 0.6), (6, 0.1, 1.0))):
                for k in range(n):
                    a = TAU * k / n + ring_i * 0.3
                    sphere(f"lily_petal{ring_i}_{k}", 0.09, (-0.1 + r * math.cos(a), r * math.sin(a), 0.1 + ring_i * 0.05), petal, rt,
                           scale=(1.0, 0.45, 0.25), segs=8, rings=5,
                           rot=(Matrix.Rotation(a, 3, "Z") @ Matrix.Rotation(-tilt, 3, "Y")))
            sphere("lily_center", 0.05, (-0.1, 0, 0.16), tipm, rt, segs=10, rings=6)
        out.append(rt)
    return out


def build_weed():
    rt = root("weed")
    mat = material("weed_green", "#3fbf6f", roughness=0.6)
    for b in range(3):
        a = TAU * b / 3
        pts, radii = [], []
        for i in range(9):
            u = i / 8
            pts.append((0.08 * math.cos(a) + 0.1 * math.sin(u * 7 + b), 0.08 * math.sin(a), u * (1.3 + 0.3 * b)))
            radii.append(0.07 * (1 - u * 0.8))
        tube(f"weed_{b}", pts, 0.05, mat, rt, sides=5, radii=radii)
    return rt


def build_lakebed():
    rt = root("lakebed")
    rnd = random.Random(12)
    rock = material("bed_rock", "#8d99ae", roughness=0.85)
    moss = material("bed_moss", "#6fae7a", roughness=0.85)
    shell = material("bed_shell", "#ffd1dc", roughness=0.5)
    star = material("bed_star", "#ff9f5a", roughness=0.6)
    pebble = [material(f"bed_pebble{i}", c, roughness=0.8) for i, c in enumerate(("#c9b79c", "#a3b8c9", "#d9c3a5"))]
    for k in range(26):
        x, y = rnd.uniform(-14, 14), rnd.uniform(-9, 14)
        s = rnd.uniform(0.25, 0.75)
        ico(f"bed_rock{k}", s, (x, y, s * 0.15), rock if k % 3 else moss, rt, scale=(1.2, 1, 0.55), sub=1, jitter=0.18, rnd=rnd)
    for k in range(36):
        x, y = rnd.uniform(-14, 14), rnd.uniform(-9, 14)
        ico(f"bed_pebble{k}", rnd.uniform(0.06, 0.14), (x, y, 0.03), pebble[k % 3], rt, scale=(1.3, 1, 0.5), sub=1)
    for k in range(7):
        x, y = rnd.uniform(-9, 9), rnd.uniform(-6, 10)
        pts = []
        for i in range(10):
            a = TAU * i / 10
            r = 0.3 if i % 2 == 0 else 0.13
            pts.append((r * math.cos(a), r * math.sin(a)))
        slab(f"bed_star{k}", pts, 0.02, 0.06, star, rt, center=(0, 0), xf=T((x, y, 0.04), rx=math.pi / 2, rz=rnd.uniform(0, 6)))
    for k in range(8):
        x, y = rnd.uniform(-10, 10), rnd.uniform(-6, 10)
        prof = [(0.0, 0.0), (0.18, 0.0), (0.16, 0.05), (0.1, 0.1), (0.0, 0.12)]
        lathe(f"bed_shell{k}", prof, shell, rt, segments=10, loc=(x, y, 0.0), xf=Matrix.Diagonal((1, 0.8, 1, 1)), smooth=False)
    return rt


# --- Scenery --------------------------------------------------------------------------

def hill(name, cx, cy, rx, ry, h, mat, parent, segs=13, z0=-0.6, peak=False):
    prof = [(1.0, 0.0), (0.97, 0.25), (0.86, 0.5), (0.68, 0.72), (0.45, 0.88), (0.2, 0.97), (0.0, 1.0)]
    if peak:
        prof = [(1.0, 0.0), (0.78, 0.3), (0.52, 0.6), (0.28, 0.84), (0.1, 0.97), (0.0, 1.0)]
    return lathe(name, [(r, z0 + z * h) for r, z in prof], mat, parent, segments=segs, loc=(cx, cy, 0),
                 xf=Matrix.Diagonal((rx, ry, 1, 1)))


def pine(rt, name, x, y, z, s, leaf, trunk, snow=None):
    cylinder(f"{name}_trunk", 0.18 * s, 0.14 * s, 0.7 * s, (x, y, z + 0.35 * s), trunk, rt, segs=6)
    for i in range(3):
        cz = z + (0.6 + i * 0.75) * s
        r = (1.1 - i * 0.28) * s
        cylinder(f"{name}_cone{i}", r, 0.0, 1.3 * s, (x, y, cz + 0.65 * s), leaf, rt, segs=8, smooth=False)
        if snow:
            cylinder(f"{name}_snow{i}", r * 0.55, 0.0, 0.65 * s, (x, y, cz + 0.98 * s), snow, rt, segs=8, smooth=False)


def round_tree(rt, name, x, y, z, s, leaf, trunk, rnd):
    cylinder(f"{name}_trunk", 0.2 * s, 0.15 * s, 1.2 * s, (x, y, z + 0.6 * s), trunk, rt, segs=6)
    for k in range(3):
        ico(f"{name}_leaf{k}", (0.85 - k * 0.15) * s, (x + rnd.uniform(-0.4, 0.4) * s, y + rnd.uniform(-0.3, 0.3) * s,
                                                    z + (1.6 + k * 0.35) * s), leaf, rt, sub=1, smooth=False)


def cabin(rt, name, x, y, z, s, wall, roof, glow, door):
    rounded_box(f"{name}_walls", (2.2 * s, 1.8 * s, 1.5 * s), (x, y, z + 0.75 * s), wall, rt, bevel=0.06 * s)
    bm = bmesh.new()
    w2, d2, h = 1.3 * s, 1.1 * s, 1.1 * s
    pts = [(-w2, -d2, 0), (w2, -d2, 0), (0, -d2, h), (-w2, d2, 0), (w2, d2, 0), (0, d2, h)]
    v = [bm.verts.new(Vector(p) + Vector((x, y, z + 1.5 * s))) for p in pts]
    for f in ((0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)):
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh_obj(f"{name}_roof", bm, roof, rt, smooth=False)
    rounded_box(f"{name}_door", (0.5 * s, 0.06 * s, 0.85 * s), (x - 0.45 * s, y - 0.91 * s, z + 0.43 * s), door, rt, bevel=0.03 * s)
    for wx in (0.45,):
        rounded_box(f"{name}_win", (0.5 * s, 0.06 * s, 0.45 * s), (x + wx * s, y - 0.91 * s, z + 0.85 * s), glow, rt, bevel=0.03 * s)
    rounded_box(f"{name}_chimney", (0.3 * s, 0.3 * s, 0.8 * s), (x + 0.6 * s, y + 0.3 * s, z + 2.3 * s), roof, rt, bevel=0.03 * s)


def reeds(rt, name, x, y, z, rnd, stem, tip, n=6):
    for k in range(n):
        px, py = x + rnd.uniform(-0.6, 0.6), y + rnd.uniform(-0.3, 0.3)
        h = rnd.uniform(1.2, 2.0)
        lean = rnd.uniform(-0.25, 0.25)
        pts = [(px, py, z), (px + lean * 0.4, py, z + h * 0.5), (px + lean, py, z + h)]
        tube(f"{name}_{k}", pts, 0.035, stem, rt, sides=4, caps=False)
        if tip and k % 2 == 0:
            cylinder(f"{name}_tip{k}", 0.07, 0.07, 0.35, (px + lean * 0.95, py, z + h - 0.1), tip, rt, segs=6)


def scenery_mats():
    return {
        "grass": material("grass", "#7ed957", roughness=0.9),
        "grass2": material("grass_dark", "#5cbf4a", roughness=0.9),
        "far": material("hill_far", "#9fd99a", roughness=0.9),
        "pine": material("pine", "#2f9e5e", roughness=0.8),
        "leaf": material("leaf", "#4cc05a", roughness=0.8),
        "trunk": material("trunk", "#8b5a3c", roughness=0.9),
        "rock": material("shore_rock", "#a7b0c0", roughness=0.85),
        "sand": material("sand", "#f2dfb0", roughness=0.9),
        "wall": material("cabin_wall", "#ffe1b0", roughness=0.8),
        "roof": material("cabin_roof", "#ff6b6b", roughness=0.7),
        "glow": material("window_glow", "#ffe9a6", roughness=0.4, emission="#ffcc55", strength=0.15),
        "door": material("cabin_door", "#8b5a3c", roughness=0.8),
        "plank": material("dock_plank", "#c48a55", roughness=0.85),
        "reed": material("reed", "#6fbf4a", roughness=0.8),
        "cattail": material("cattail", "#7a4a2a", roughness=0.8),
        "snow": material("snow", "#f4f8ff", roughness=0.9),
        "snow2": material("snow_shade", "#dce8fb", roughness=0.9),
        "ice": material("ice_blue", "#bfe3ff", roughness=0.3),
        "mountain": material("mountain", "#8fb0d9", roughness=0.9),
        "stone": material("bridge_stone", "#c9c1b5", roughness=0.9),
        "barn": material("barn_red", "#e0564b", roughness=0.8),
        "willow": material("willow", "#9ad46b", roughness=0.8),
    }


SHORE_Y = 26.0  # the far shore runs along Blender y = 26 (three z = -26)


def build_shore_lake(sm):
    rt = root("shore_lake")
    rnd = random.Random(1)
    # Far mountains and hills
    for i, (x, rx, h) in enumerate(((-34, 16, 13), (-10, 14, 16), (14, 15, 12), (38, 16, 15))):
        hill(f"lake_mtn{i}", x, SHORE_Y + 30, rx, 8, h, sm["mountain"], rt, segs=12, peak=True)
        lathe(f"lake_mtn_cap{i}", [(0.31, 0.68), (0.26, 0.74), (0.1, 0.97), (0.0, 1.0)], sm["snow"], rt, segments=12,
              loc=(x, SHORE_Y + 30 - 0.05, -0.6), xf=Matrix.Diagonal((rx * 1.02, 8.1, h, 1)))
    for i, (x, rx, h) in enumerate(((-30, 13, 6), (-8, 12, 7.5), (12, 13, 6.5), (34, 12, 7))):
        hill(f"lake_hill{i}", x, SHORE_Y + 14, rx, 8, h, sm["far"], rt)
    # Grassy shore bank (front edge right at the water)
    for i, x in enumerate(range(-48, 49, 12)):
        hill(f"lake_bank{i}", x, SHORE_Y + 4.5, 8.5, 5.5, rnd.uniform(1.2, 2.4), sm["grass"], rt)
    # Side banks curving toward the camera
    for s in (-1, 1):
        for i, y in enumerate(range(-6, 27, 9)):
            hill(f"lake_side{s}_{i}", s * (27 + rnd.uniform(-1, 1)), y, 6, 6, rnd.uniform(1.5, 3), sm["grass2"], rt)
            if i % 2 == 0:
                pine(rt, f"lake_side_pine{s}{i}", s * 25, y, 1.2, rnd.uniform(1.0, 1.5), sm["pine"], sm["trunk"])
    for i in range(14):
        x = -40 + i * 6.2 + rnd.uniform(-1.5, 1.5)
        y = SHORE_Y + rnd.uniform(4, 9)
        if abs(x - 6) < 4:
            continue
        if i % 3 == 0:
            round_tree(rt, f"lake_tree{i}", x, y, 1.2, rnd.uniform(1.0, 1.4), sm["leaf"], sm["trunk"], rnd)
        else:
            pine(rt, f"lake_pine{i}", x, y, 1.0, rnd.uniform(1.0, 1.6), sm["pine"], sm["trunk"])
    cabin(rt, "lake_cabin", 6, SHORE_Y + 4.8, 1.3, 1.3, sm["wall"], sm["roof"], sm["glow"], sm["door"])
    # Dock poking into the lake
    for k in range(7):
        rounded_box(f"dock_plank{k}", (1.5, 0.45, 0.12), (3.5, SHORE_Y + 1.5 - k * 0.5, 0.45), sm["plank"], rt, bevel=0.03)
    for sx in (-0.65, 0.65):
        for k in range(3):
            cylinder(f"dock_post{sx}{k}", 0.1, 0.1, 1.2, (3.5 + sx, SHORE_Y + 1.5 - k * 1.4, 0.0), sm["trunk"], rt, segs=6)
    for k in range(12):
        x = -30 + k * 5.3 + rnd.uniform(-1, 1)
        ico(f"lake_rock{k}", rnd.uniform(0.4, 0.9), (x, SHORE_Y + rnd.uniform(0.3, 1.5), 0.1), sm["rock"], rt, scale=(1.3, 1, 0.7),
            jitter=0.15, rnd=rnd)
    for k in range(5):
        reeds(rt, f"lake_reed{k}", -18 + k * 9 + rnd.uniform(-2, 2), SHORE_Y + 0.8, 0.0, rnd, sm["reed"], sm["cattail"], 5)
    return rt


def build_shore_river(sm):
    rt = root("shore_river")
    rnd = random.Random(2)
    for i, (x, rx, h) in enumerate(((-36, 15, 9), (-12, 13, 11), (12, 14, 10), (36, 16, 12))):
        hill(f"river_hill_far{i}", x, SHORE_Y + 22, rx, 8, h, material("river_far", "#c9a0c8", roughness=0.9), rt, segs=12)
    for i, x in enumerate(range(-48, 49, 12)):
        hill(f"river_bank{i}", x, SHORE_Y + 5, 8.5, 6, rnd.uniform(1.4, 2.8), sm["grass"], rt)
    for s in (-1, 1):
        for i, y in enumerate(range(-6, 27, 8)):
            hill(f"river_side{s}_{i}", s * (24 + rnd.uniform(-1, 1)), y, 5.5, 5.5, rnd.uniform(1.4, 2.6), sm["grass2"], rt)
            reeds(rt, f"river_side_reed{s}{i}", s * 19.5, y, 0.0, rnd, sm["reed"], sm["cattail"], 4)
    # Stone arch bridge across the river in the distance
    bx, by = -2.0, SHORE_Y - 1.0
    bm = bmesh.new()
    rows = []
    n = 20
    for k in range(n + 1):
        a = math.pi * k / n
        c = Vector((bx - 6 * math.cos(a), 0, 2.6 * math.sin(a) + 0.2))
        t = Vector((6 * math.sin(a), 0, 2.6 * math.cos(a))).normalized()
        up = Vector((-t.z, 0, t.x))
        rows.append([bm.verts.new(c + Vector((0, by + y, 0)) + up * h) for y, h in ((-0.8, 0.3), (0.8, 0.3), (0.8, -0.3), (-0.8, -0.3))])
    for k in range(n):
        for j in range(4):
            j2 = (j + 1) % 4
            bm.faces.new((rows[k][j], rows[k][j2], rows[k + 1][j2], rows[k + 1][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh_obj("bridge_deck", bm, sm["stone"], rt, smooth=False)
    for k in range(9):
        a = math.pi * k / 8
        cylinder(f"bridge_post{k}", 0.08, 0.08, 0.6, (bx - 6 * math.cos(a), by - 0.75, 2.6 * math.sin(a) + 1.0), sm["trunk"], rt, segs=6)
    # Weeping willows
    for i, (x, y) in enumerate(((-15, SHORE_Y + 3), (13, SHORE_Y + 4), (-21, 8))):
        cylinder(f"willow_trunk{i}", 0.35, 0.25, 3.0, (x, y, 1.5), sm["trunk"], rt, segs=7)
        ico(f"willow_top{i}", 1.8, (x, y, 3.6), sm["willow"], rt, scale=(1.2, 1.0, 0.8), sub=1, smooth=False)
        for k in range(10):
            a = TAU * k / 10
            px, py = x + 1.8 * math.cos(a), y + 1.5 * math.sin(a)
            tube(f"willow_strand{i}_{k}", [(px, py, 3.6), (px * 1.0 + 0.15 * math.cos(a), py + 0.15 * math.sin(a), 2.4),
                                           (px + 0.2 * math.cos(a), py + 0.2 * math.sin(a), 1.2 + rnd.uniform(0, 0.6))], 0.14,
                 sm["willow"], rt, sides=4, radii=[0.3, 0.2, 0.08])
    # Little red barn and a windmill-less silo
    cabin(rt, "river_barn", 11, SHORE_Y + 6, 1.5, 1.5, sm["barn"], material("barn_roof", "#7a4a3a", roughness=0.8), sm["glow"],
          material("barn_door", "#fff1d6", roughness=0.8))
    cylinder("river_silo", 0.9, 0.9, 4.0, (15.5, SHORE_Y + 7, 3.2), material("silo", "#d9d2c5", roughness=0.8), rt, segs=12)
    sphere("river_silo_top", 0.9, (15.5, SHORE_Y + 7, 5.2), sm["barn"], rt, scale=(1, 1, 0.6), segs=12, rings=6)
    for k in range(8):
        reeds(rt, f"river_reed{k}", -26 + k * 7 + rnd.uniform(-1, 1), SHORE_Y + 0.6, 0.0, rnd, sm["reed"], sm["cattail"], 6)
    for k in range(8):
        ico(f"river_rock{k}", rnd.uniform(0.4, 0.8), (-24 + k * 7 + rnd.uniform(-1, 1), SHORE_Y + rnd.uniform(0.3, 1.2), 0.1),
            sm["rock"], rt, scale=(1.3, 1, 0.7), jitter=0.15, rnd=rnd)
    return rt


def build_shore_ice(sm, m):
    rt = root("shore_ice")
    rnd = random.Random(3)
    for i, (x, rx, h) in enumerate(((-34, 16, 14), (-10, 14, 17), (14, 15, 13), (38, 16, 16))):
        hill(f"ice_mtn{i}", x, SHORE_Y + 30, rx, 8, h, sm["snow2"], rt, segs=12, peak=True)
    for i, x in enumerate(range(-48, 49, 12)):
        hill(f"ice_bank{i}", x, SHORE_Y + 5, 8.5, 6, rnd.uniform(1.4, 2.6), sm["snow"], rt)
    for s in (-1, 1):
        for i, y in enumerate(range(-6, 27, 9)):
            hill(f"ice_side{s}_{i}", s * (27 + rnd.uniform(-1, 1)), y, 6, 6, rnd.uniform(1.5, 3), sm["snow"], rt)
            if i % 2 == 1:
                pine(rt, f"ice_side_pine{s}{i}", s * 25, y, 1.2, rnd.uniform(1.0, 1.4), sm["pine"], sm["trunk"], sm["snow"])
    for i in range(12):
        x = -38 + i * 7 + rnd.uniform(-1.5, 1.5)
        if abs(x + 7) < 4 or abs(x - 9) < 3:
            continue
        pine(rt, f"ice_pine{i}", x, SHORE_Y + rnd.uniform(5, 9), 1.0, rnd.uniform(1.0, 1.6), sm["pine"], sm["trunk"], sm["snow"])
    # Igloo
    ix, iy = -7, SHORE_Y + 0.5
    lathe("igloo_dome", [(2.2, 0.0), (2.1, 0.7), (1.8, 1.4), (1.2, 1.95), (0.0, 2.2)], sm["snow"], rt, segments=24, loc=(ix, iy, 0.5))
    for z in (0.75, 1.3, 1.8):
        r = 2.2 * math.sqrt(max(0, 1 - ((z - 0.0) / 2.2) ** 2)) + 0.02
        pts = [(ix + r * math.cos(TAU * k / 20), iy + r * math.sin(TAU * k / 20), 0.5 + z - 0.05) for k in range(21)]
        tube(f"igloo_line{z}", pts, 0.04, sm["snow2"], rt, sides=4, caps=False)
    lathe("igloo_door", [(0.0, 0.0), (0.8, 0.0), (0.8, 0.6), (0.55, 1.05), (0.0, 1.15)], sm["snow"], rt, segments=16,
          loc=(0, 0, 0), xf=Matrix.Translation((ix, iy - 2.1, 0.5)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    sphere("igloo_hole", 0.45, (ix, iy - 3.22, 0.85), material("igloo_dark", "#3a4a7a", roughness=0.9), rt, scale=(1, 0.2, 1.1), segs=12,
           rings=8)
    # Snowman with a smile
    sx, sy = 9, SHORE_Y + 1.5
    sphere("snowman_base", 1.0, (sx, sy, 1.2), sm["snow"], rt, segs=14, rings=9)
    sphere("snowman_mid", 0.72, (sx, sy, 2.6), sm["snow"], rt, segs=14, rings=9)
    head = sphere("snowman_head", 0.52, (sx, sy, 3.6), sm["snow"], rt, segs=14, rings=9)
    f = Face(head, m, rt)
    for s in (-1, 1):
        f.eye(f"snowman_eye{s}", (sx + s * 0.18, sy - 3, 3.72), (0, 1, 0), 0.08, squash=0.5)
        f.cheek(f"snowman_cheek{s}", (sx + s * 0.32, sy - 3, 3.5), (0, 1, 0), 0.08)
    f.arc("snowman_smile", (sx, sy - 3, 3.42), (0, 1, 0), 0.16, 0.08, 0.03)
    cylinder("snowman_nose", 0.08, 0.0, 0.4, (sx, sy - 0.65, 3.58), material("carrot", "#ff8c1a", roughness=0.6), rt, segs=8,
             rot=Matrix.Rotation(math.pi / 2, 3, "X"))
    pts = [(sx + 0.55 * math.cos(TAU * k / 20), sy + 0.55 * math.sin(TAU * k / 20), 3.1) for k in range(21)]
    tube("snowman_scarf", pts, 0.12, material("scarf_blue", "#4d96ff", roughness=0.8), rt, sides=8, caps=False)
    lathe("snowman_hat", [(0.0, 4.0), (0.6, 4.0), (0.6, 4.07), (0.38, 4.07), (0.38, 4.6), (0.0, 4.6)],
          material("hat_dark", "#3b3355", roughness=0.6), rt, segments=16, loc=(sx, sy, 0))
    for s in (-1, 1):
        tube(f"snowman_arm{s}", [(sx + s * 0.6, sy, 2.7), (sx + s * 1.3, sy, 3.2), (sx + s * 1.6, sy, 3.6)], 0.06, sm["trunk"], rt, sides=5)
    # Penguin pals
    black = material("penguin_black", "#2b3150", roughness=0.5)
    belly = material("penguin_belly", "#ffffff", roughness=0.6)
    orange = material("penguin_orange", "#ffa62b", roughness=0.5)
    for i, (px, py, s) in enumerate(((-13, 15, 1.7), (-11.4, 16.2, 1.25), (14, 17, 1.6))):
        body = sphere(f"penguin_body{i}", 0.5 * s, (px, py, 0.6 * s), black, rt, scale=(0.9, 0.85, 1.25), segs=14, rings=8)
        sphere(f"penguin_belly{i}", 0.4 * s, (px, py - 0.18 * s, 0.55 * s), belly, rt, scale=(0.85, 0.6, 1.2), segs=12, rings=8)
        sphere(f"penguin_beak{i}", 0.09 * s, (px, py - 0.46 * s, 0.95 * s), orange, rt, scale=(1.2, 1.4, 0.6), segs=8, rings=5)
        fp = Face(body, m, rt)
        for e in (-1, 1):
            fp.eye(f"penguin_eye{i}{e}", (px + e * 0.13 * s, py - 3, 1.05 * s), (0, 1, 0), 0.06 * s, squash=0.5)
            fp.cheek(f"penguin_cheek{i}{e}", (px + e * 0.24 * s, py - 3, 0.88 * s), (0, 1, 0), 0.05 * s)
            sphere(f"penguin_foot{i}{e}", 0.12 * s, (px + e * 0.15 * s, py - 0.3 * s, 0.03), orange, rt, scale=(1, 1.5, 0.4), segs=8,
                   rings=5)
            sphere(f"penguin_wing{i}{e}", 0.18 * s, (px + e * 0.43 * s, py, 0.6 * s), black, rt, scale=(0.35, 0.8, 1.4), segs=10,
                   rings=6, rot=Matrix.Rotation(e * 0.3, 3, "Y"))
    for k in range(10):
        ico(f"ice_chunk{k}", rnd.uniform(0.4, 0.8), (-30 + k * 6.5 + rnd.uniform(-1, 1), SHORE_Y + rnd.uniform(0, 1), 0.15), sm["ice"],
            rt, scale=(1.3, 1, 0.7), jitter=0.15, rnd=rnd)
    return rt


# --- Coral reef (warm sea) ----------------------------------------------------------
# The reef reuses the shore kit (hill, cabin, rocks) and adds palms, a lighthouse and a
# coral garden on the sea floor. The floor sits at REEF_FLOOR, the same depth as FLOOR_Y
# in public/js/world.js, because the game places this shore at the origin.

REEF_FLOOR = -2.4
# Where the anemones sit (Blender x, y). public/js/world.js PLACES.reef.anemones lists the
# same spots as three.js (x, z = -y) so the clownfish can stay close to home.
REEF_ANEMONES = ((-4.6, -1.2), (4.2, 0.6), (-0.6, -6.4))


def reef_mats():
    return {
        "trunk": material("palm_trunk", "#c9955c", roughness=0.85),
        "frond": material("palm_frond", "#43b85c", roughness=0.8),
        "nut": material("palm_nut", "#7a4a2a", roughness=0.7),
        "island": material("reef_island", "#6fcf7f", roughness=0.9),
        "far": material("reef_far", "#9fdcc0", roughness=0.9),
        "roof": material("hut_roof", "#e8b45a", roughness=0.85),
        "white": material("lighthouse_white", "#fff8ee", roughness=0.7),
        "red": material("lighthouse_red", "#ff6b6b", roughness=0.7),
        "pink": material("coral_pink", "#ff8f8f", roughness=0.7),
        "orange": material("coral_orange", "#ffab5c", roughness=0.7),
        "purple": material("coral_purple", "#b98cff", roughness=0.7),
        "yellow": material("coral_yellow", "#ffd866", roughness=0.75),
        "teal": material("coral_teal", "#5fd3c6", roughness=0.7),
        "teal_dark": material("coral_teal_dark", "#2f8f87", roughness=0.8),
        "rock": material("reef_rock", "#d8b9a3", roughness=0.9),
        "anemone_base": material("anemone_base", "#8a5cd0", roughness=0.6),
        "anemone": material("anemone_tentacle", "#ff8fc8", roughness=0.5),
    }


def palm(rt, name, x, y, z, s, lean, rm, rnd):
    """A leaning palm: a tapered trunk, six drooping fronds and three coconuts."""
    a = rnd.uniform(0, TAU)
    pts = [(x + math.cos(a) * lean * (u / 5) ** 2 * s, y + math.sin(a) * lean * (u / 5) ** 2 * s, z + 4.0 * s * u / 5) for u in range(6)]
    tube(f"{name}_trunk", pts, 0.2 * s, rm["trunk"], rt, sides=6, radii=[(0.24 - 0.02 * k) * s for k in range(6)])
    top = Vector(pts[-1])
    leaf = [(0, 0.06), (0.7, 0.24), (1.6, 0.18), (2.1, 0), (1.6, -0.18), (0.7, -0.24), (0, -0.06)]
    leaf = [(px * s, pz * s) for px, pz in leaf]
    for k in range(6):
        slab(f"{name}_frond{k}", leaf, 0.02 * s, 0.07 * s, rm["frond"], rt, center=(0.9 * s, 0),
             xf=T(top, rx=math.pi / 2, ry=rnd.uniform(0.35, 0.65), rz=a + TAU * k / 6 + rnd.uniform(-0.2, 0.2)))
    for k in range(3):
        b = TAU * k / 3
        sphere(f"{name}_nut{k}", 0.16 * s, top + Vector((0.18 * s * math.cos(b), 0.18 * s * math.sin(b), -0.22 * s)), rm["nut"], rt,
               segs=6, rings=4)


def lighthouse(rt, name, x, y, z, s, rm, sm):
    rings = [(0.9, 0.0), (0.82, 1.0), (0.74, 2.0), (0.66, 3.0), (0.6, 4.0)]
    prof = [(r * s, z + h * s) for r, h in rings]
    lathe(f"{name}_tower", prof, [rm["white"], rm["red"]], rt, segments=12, loc=(x, y, 0), mats_by_ring=lambda i: i % 2, smooth=False)
    cylinder(f"{name}_deck", 0.85 * s, 0.85 * s, 0.15 * s, (x, y, z + 4.07 * s), rm["red"], rt, segs=12)
    cylinder(f"{name}_lamp", 0.42 * s, 0.42 * s, 0.6 * s, (x, y, z + 4.45 * s), sm["glow"], rt, segs=10)
    cylinder(f"{name}_cap", 0.62 * s, 0.0, 0.6 * s, (x, y, z + 5.05 * s), rm["red"], rt, segs=10, smooth=False)


def branch_coral(rt, name, x, y, s, mat, rnd):
    """Antler-like branches fanning up from one foot."""
    base = Vector((x, y, REEF_FLOOR))
    for k in range(5):
        a = TAU * k / 5 + rnd.uniform(-0.3, 0.3)
        out = rnd.uniform(0.25, 0.45) * s
        h = rnd.uniform(0.6, 1.0) * s
        mid = base + Vector((math.cos(a) * out * 0.4, math.sin(a) * out * 0.4, h * 0.5))
        tip = base + Vector((math.cos(a) * out, math.sin(a) * out, h))
        tube(f"{name}_{k}", [base, mid, tip], 0.07 * s, mat, rt, sides=4, radii=[0.1 * s, 0.075 * s, 0.05 * s])


def brain_coral(rt, name, x, y, s, mat, rnd, lift=0.0):
    ico(name, 0.5 * s, (x, y, REEF_FLOOR + lift + 0.12 * s), mat, rt, scale=(1, 1, 0.62), sub=2, jitter=0.08, rnd=rnd, smooth=True)


def fan_coral(rt, name, x, y, s, mat, rnd):
    pts = [(0.06, 0), (0.5, 0.35), (0.62, 0.8), (0.4, 1.15), (0, 1.25), (-0.4, 1.15), (-0.62, 0.8), (-0.5, 0.35), (-0.06, 0)]
    pts = [(px * s, pz * s) for px, pz in pts]
    slab(name, pts, 0.015 * s, 0.03 * s, mat, rt, center=(0, 0.6 * s), xf=T((x, y, REEF_FLOOR), rz=rnd.uniform(-0.5, 0.5)))


def tube_sponge(rt, name, x, y, s, mat, dark, rnd):
    for k in range(3):
        a = TAU * k / 3 + rnd.uniform(-0.3, 0.3)
        h = rnd.uniform(0.5, 0.95) * s
        px, py = x + math.cos(a) * 0.2 * s, y + math.sin(a) * 0.2 * s
        cylinder(f"{name}_{k}", 0.13 * s, 0.16 * s, h, (px, py, REEF_FLOOR + h / 2), mat, rt, segs=8)
        cylinder(f"{name}_hole{k}", 0.11 * s, 0.11 * s, 0.02, (px, py, REEF_FLOOR + h + 0.005), dark, rt, segs=8)


def anemone(rt, name, x, y, s, rm, rnd):
    """A soft anemone the clownfish call home: a short foot and a crown of stubby tentacles.
    Its meshes hang off an empty named `name`, so the game can find it and sway it."""
    piv = pivot(name, rt, (x, y, REEF_FLOOR))
    cylinder(f"{name}_foot", 0.32 * s, 0.4 * s, 0.35 * s, (x, y, REEF_FLOOR + 0.17 * s), rm["anemone_base"], piv, segs=10)
    top = REEF_FLOOR + 0.35 * s
    for ring, (r, n, ln) in enumerate(((0.3, 12, 0.5), (0.16, 7, 0.42))):
        for k in range(n):
            a = TAU * (k + ring * 0.5) / n
            out = Vector((math.cos(a), math.sin(a), 0))
            p0 = Vector((x, y, top)) + out * r * s
            p1 = p0 + out * 0.1 * s + Vector((0, 0, ln * 0.55 * s))
            p2 = p0 + out * (0.22 + rnd.uniform(0, 0.08)) * s + Vector((0, 0, ln * s))
            tube(f"{name}_t{ring}_{k}", [p0, p1, p2], 0.05 * s, rm["anemone"], piv, sides=4, radii=[0.055 * s, 0.045 * s, 0.025 * s])


def build_shore_reef(sm):
    rt = root("shore_reef")
    rnd = random.Random(7)
    rm = reef_mats()
    # Far islands on the horizon, then a green island behind a sandy beach
    for i, (x, rx, h) in enumerate(((-36, 14, 6), (-12, 10, 4.5), (16, 13, 5.5), (40, 12, 4))):
        hill(f"reef_far{i}", x, SHORE_Y + 30, rx, 7, h, rm["far"], rt, segs=12)
    for i, (x, rx, h) in enumerate(((-24, 12, 4.2), (-4, 11, 5.2), (18, 12, 4.4))):
        hill(f"reef_island{i}", x, SHORE_Y + 12, rx, 7, h, rm["island"], rt)
    for i, x in enumerate(range(-48, 49, 12)):
        hill(f"reef_beach{i}", x, SHORE_Y + 4.5, 8.5, 5.5, rnd.uniform(0.7, 1.2), sm["sand"], rt)
    # Sandy spits curving toward the camera, each with a palm or two
    for s in (-1, 1):
        for i, y in enumerate(range(-6, 27, 9)):
            hill(f"reef_side{s}_{i}", s * (27 + rnd.uniform(-1, 1)), y, 6, 6, rnd.uniform(0.8, 1.4), sm["sand"], rt)
            if i % 2 == 0:
                palm(rt, f"reef_side_palm{s}{i}", s * 25.5, y, 0.7, rnd.uniform(0.9, 1.2), 1.4, rm, rnd)
    for i in range(9):
        x = -30 + i * 7.4 + rnd.uniform(-1.2, 1.2)
        if abs(x - 8) < 3.5 or abs(x + 20) < 3:
            continue
        palm(rt, f"reef_palm{i}", x, SHORE_Y + rnd.uniform(3.5, 7), 0.8, rnd.uniform(0.9, 1.3), rnd.uniform(0.8, 1.8), rm, rnd)
    cabin(rt, "reef_hut", 8, SHORE_Y + 5, 0.9, 1.15, sm["wall"], rm["roof"], sm["glow"], sm["door"])
    lighthouse(rt, "reef_lighthouse", -20, SHORE_Y + 5.5, 1.0, 1.0, rm, sm)
    for k in range(9):
        x = -28 + k * 7 + rnd.uniform(-1, 1)
        ico(f"reef_rock{k}", rnd.uniform(0.4, 0.8), (x, SHORE_Y + rnd.uniform(0.3, 1.2), 0.1), sm["rock"], rt, scale=(1.3, 1, 0.7),
            jitter=0.15, rnd=rnd)
    # The coral garden: low coral heads on the sea floor, kept clear of the anemones. Each head is a
    # rocky mound with a brain coral, branching corals, a sea fan and tube sponges around it.
    # Most heads sit on the near side of the boat (Blender -y), where the camera looks through the water.
    heads = ((-8.0, -4.0), (7.5, -4.5), (-3.5, -10.0), (3.5, -9.5), (-10.5, -10.0), (10.0, -11.0), (1.5, -2.5),
             (-9.0, 3.5), (9.0, 5.0), (-2.0, 10.5))
    branch_cols = ("pink", "orange", "purple")
    for h, (hx, hy) in enumerate(heads):
        s = 1.0 + 0.2 * ((h * 7) % 3) / 2
        ico(f"reef_mound{h}", 0.75 * s, (hx, hy, REEF_FLOOR), rm["rock"], rt, scale=(1.4, 1.1, 0.4), sub=1, jitter=0.15, rnd=rnd)
        brain_coral(rt, f"reef_brain{h}", hx + 0.15 * s, hy + 0.1 * s, s * 0.9, rm["yellow" if h % 2 else "orange"], rnd, lift=0.2 * s)
        for k in range(3):
            a = TAU * k / 3 + rnd.uniform(-0.4, 0.4)
            branch_coral(rt, f"reef_branch{h}_{k}", hx + math.cos(a) * 1.0 * s, hy + math.sin(a) * 0.8 * s, s * 0.95,
                         rm[branch_cols[(h + k) % 3]], rnd)
        if h % 2 == 0:
            fan_coral(rt, f"reef_fan{h}", hx - 0.9 * s, hy + 0.7 * s, s, rm["purple" if h % 4 else "pink"], rnd)
        else:
            tube_sponge(rt, f"reef_tube{h}", hx + 0.9 * s, hy + 0.6 * s, s, rm["teal"], rm["teal_dark"], rnd)
    for i, (x, y) in enumerate(REEF_ANEMONES):
        anemone(rt, f"reef_anemone_{i}", x, y, 1.15, rm, rnd)
    return rt


def build_sun(m):
    rt = root("sun")
    face_c = material("sun_face", "#ffd84d", roughness=0.5, emission="#ffcc33", strength=0.6)
    ray = material("sun_ray", "#ffb43b", roughness=0.5, emission="#ffa02b", strength=0.4)
    disk = sphere("sun_disk", 1.0, (0, 0, 0), face_c, rt, scale=(1, 0.45, 1), segs=28, rings=14)
    for k in range(12):
        a = TAU * k / 12
        cylinder(f"sun_ray{k}", 0.24, 0.0, 0.55, (1.38 * math.cos(a), 0.05, 1.38 * math.sin(a)), ray, rt, segs=6,
                 rot=Vector((math.cos(a), 0, math.sin(a))).to_track_quat("Z", "Y"), scale=(1, 0.4, 1))
    f = Face(disk, m, rt)
    for s in (-1, 1):
        f.eye(f"sun_eye{s}", (s * 0.34, -3, 0.15), (0, 1, 0), 0.13, squash=0.45)
        f.cheek(f"sun_cheek{s}", (s * 0.6, -3, -0.2), (0, 1, 0), 0.13)
    f.arc("sun_smile", (0, -3, -0.2), (0, 1, 0), 0.26, 0.13, 0.05)
    return rt


def build_moon(m):
    rt = root("moon")
    mc = material("moon_face", "#fff3c4", roughness=0.6, emission="#ffe9a0", strength=0.7)
    crater = material("moon_crater", "#f2df9a", roughness=0.7, emission="#e8d080", strength=0.4)
    disk = sphere("moon_disk", 1.0, (0, 0, 0), mc, rt, scale=(1, 0.5, 1), segs=28, rings=14)
    f = Face(disk, m, rt)
    for k, (x, z, r) in enumerate(((0.45, 0.5, 0.16), (-0.55, -0.45, 0.12), (0.55, -0.35, 0.1), (-0.25, 0.65, 0.08))):
        loc, n = f.hit((x, -3, z), (0, 1, 0))
        sphere(f"moon_crater{k}", r, loc, crater, rt, scale=(1, 0.3, 1), segs=10, rings=6, rot=n.to_track_quat("-Y", "Z"))
    for s in (-1, 1):
        f.arc(f"moon_eye{s}", (s * 0.3, -3, 0.12), (0, 1, 0), 0.12, 0.07, 0.035)
        f.cheek(f"moon_cheek{s}", (s * 0.55, -3, -0.15), (0, 1, 0), 0.12)
    f.arc("moon_smile", (0, -3, -0.25), (0, 1, 0), 0.16, 0.08, 0.04)
    # Little nightcap
    cap = material("moon_cap", "#6c63ff", roughness=0.7)
    pts, radii = [], []
    for i in range(10):
        u = i / 9
        pts.append((0.2 + u * 0.9, 0.0, 0.75 + math.sin(u * 2.4) * 0.6 - u * u * 0.5))
        radii.append(0.5 * (1 - u) + 0.04)
    tube("moon_cap", pts, 0.3, cap, rt, sides=10, radii=radii)
    sphere("moon_pom", 0.15, (1.12, 0.0, 0.42), material("moon_pom", "#ffffff", roughness=0.8), rt, segs=10, rings=6)
    return rt


def build_cloud(i, rnd):
    rt = root(f"cloud_{i}")
    mat = material("cloud", "#ffffff", roughness=0.9)
    n = 4 + i
    for k in range(n):
        x = (k - (n - 1) / 2) * 0.9 + rnd.uniform(-0.2, 0.2)
        r = 0.9 + 0.5 * math.sin(math.pi * (k + 0.5) / n) + rnd.uniform(-0.1, 0.1)
        sphere(f"cloud_{i}_{k}", r, (x, rnd.uniform(-0.2, 0.2), r * 0.35), mat, rt, scale=(1, 0.6, 0.75), segs=14, rings=8)
    return rt


def build_world():
    m = face_mats()
    sm = scenery_mats()
    rnd = random.Random(3)
    roots = [build_bear(m), build_boat(m), build_bucket(m), build_bobber(m), *build_lilypads(), build_weed(), build_lakebed(),
             build_sun(m), build_moon(m)]
    roots += [build_cloud(i, rnd) for i in range(3)]
    shores = [build_shore_lake(sm), build_shore_river(sm), build_shore_ice(sm, m), build_shore_reef(sm)]
    return roots, shores


# --- Export & preview -------------------------------------------------------------

def read_glb(path):
    with open(path, "rb") as f:
        b = f.read()
    n = struct.unpack("<I", b[12:16])[0]
    return json.loads(b[20:20 + n]), b[20 + n + 8:]


def same_glb(a_path, b_path, tol=1e-3):
    """True when two GLBs hold the same scene: identical JSON, float data equal within `tol`,
    and the same triangles in every index list (in any order)."""
    a, ab = read_glb(a_path)
    b, bb = read_glb(b_path)
    if a != b:
        return False
    for acc in a["accessors"]:
        view = a["bufferViews"][acc["bufferView"]]
        start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        kind = {5126: "f", 5125: "I", 5123: "H", 5121: "B"}[acc["componentType"]]
        count = acc["count"] * {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
        fmt = f"<{count}{kind}"
        end = start + struct.calcsize(fmt)
        va, vb = struct.unpack(fmt, ab[start:end]), struct.unpack(fmt, bb[start:end])
        if kind == "f":
            if any(abs(x - y) > tol for x, y in zip(va, vb)):
                return False
        elif acc["type"] == "SCALAR" and view.get("target") == 34963:
            def tris(v):
                out = []
                for i in range(0, len(v) - 2, 3):
                    t = v[i:i + 3]
                    k = t.index(min(t))
                    out.append(t[k:] + t[:k])
                return sorted(out)
            if tris(va) != tris(vb):
                return False
        elif va != vb:
            return False
    return True


def export(path, roots):
    for rt in roots:
        finish(rt)
    bpy.ops.object.select_all(action="DESELECT")
    for rt in roots:
        rt.select_set(True)
        for c in rt.children_recursive:
            c.select_set(True)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fresh = path[:-4] + ".new.glb"
    bpy.ops.export_scene.gltf(filepath=fresh, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                              export_texcoords=False)
    faces = sum(len(o.data.polygons) for rt in roots for o in rt.children_recursive if o.type == "MESH")
    # Blender's exporter is not byte-for-byte repeatable (triangle order, last-digit normals), so an
    # unchanged model keeps its shipped bytes and only a real change rewrites the file.
    if os.path.exists(path) and same_glb(path, fresh):
        os.remove(fresh)
        print(f"unchanged {path} ({os.path.getsize(path)} bytes, {faces} faces)")
    else:
        os.replace(fresh, path)
        print(f"exported {path} ({os.path.getsize(path)} bytes, {faces} faces)")
    for rt in roots:
        fv = [(len(o.data.polygons), len(o.data.vertices)) for o in rt.children_recursive if o.type == "MESH"]
        print("  STAT", rt.name, sum(a for a, b in fv), sum(b for a, b in fv))


def render(path, cam_loc, cam_target, lens=35, res=(1280, 720), ortho=None, bg="#9fd8ff"):
    scene = bpy.context.scene
    cam = bpy.data.objects.get("preview_cam") or link(bpy.data.objects.new("preview_cam", bpy.data.cameras.new("preview_cam")))
    cam.location = cam_loc
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = (Vector(cam_target) - Vector(cam_loc)).to_track_quat("-Z", "Y")
    cam.data.lens = lens
    if ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ortho
    else:
        cam.data.type = "PERSP"
    scene.camera = cam
    if not bpy.data.objects.get("preview_sun"):
        sun = link(bpy.data.objects.new("preview_sun", bpy.data.lights.new("preview_sun", "SUN")))
        sun.data.energy = 3.5
        sun.rotation_euler = (math.radians(50), math.radians(-20), math.radians(-30))
    world = scene.world or bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bgn = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bgn.inputs["Color"].default_value = (*rgb(bg), 1)
    bgn.inputs["Strength"].default_value = 1.0
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        try:
            scene.render.engine = "BLENDER_EEVEE_NEXT"
        except TypeError:
            pass
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    creatures = build_creatures()
    export(os.path.join(OUT_DIR, "creatures.glb"), creatures)
    if PREVIEW:
        os.makedirs(PREVIEW, exist_ok=True)
        for i, rt in enumerate(creatures):
            rt.location = ((i % 5 - 2) * 1.9, 0, -(i // 5) * 1.6)
            rt.rotation_euler = (0, 0, -0.5)
        render(os.path.join(PREVIEW, "creatures.png"), (0, -14, -1.6), (0, 0, -1.6), ortho=11, res=(1400, 900))
    for rt in creatures:
        for o in [rt, *rt.children_recursive]:
            bpy.data.objects.remove(o)
    world, shores = build_world()
    export(os.path.join(OUT_DIR, "world.glb"), world)
    for sh in shores:
        export(os.path.join(OUT_DIR, f"{sh.name}.glb"), [sh])
    world = world + shores
    if PREVIEW:
        keep = {"bear", "boat", "bucket", "bobber", "lilypad", "lilypad_flower", "weed", "sun", "moon"}
        for rt in world:
            if rt.name.startswith("shore") or rt.name.startswith("cloud") or rt.name == "lakebed":
                for o in [rt, *rt.children_recursive]:
                    o.hide_render = True
        bpy.data.objects["bear"].location = (0, 0.1, 0.36)
        bpy.data.objects["bucket"].location = (2.4, 0, 0)
        bpy.data.objects["bobber"].location = (-2.0, -1, 0.3)
        bpy.data.objects["lilypad"].location = (-2.5, -1, 1.2)
        bpy.data.objects["lilypad_flower"].location = (-2.5, -1, 2.0)
        bpy.data.objects["weed"].location = (3.8, 0, 0)
        bpy.data.objects["sun"].location = (-4, 1, 3.2)
        bpy.data.objects["moon"].location = (4, 1, 3.2)
        render(os.path.join(PREVIEW, "props.png"), (3, -9, 3.5), (0, 0, 1.2), lens=30, res=(1400, 900))
        for rt in world:
            show = rt.name.startswith("shore_lake") or rt.name.startswith("lakebed")
            for o in [rt, *rt.children_recursive]:
                o.hide_render = not show
        render(os.path.join(PREVIEW, "shore_lake.png"), (0, -15, 5.5), (0, 0, 1.5), lens=20)
        for name in ("shore_river", "shore_ice", "shore_reef"):
            for rt in world:
                for o in [rt, *rt.children_recursive]:
                    o.hide_render = rt.name != name
            render(os.path.join(PREVIEW, f"{name}.png"), (0, -15, 5.5), (0, 0, 1.5), lens=20)
        # The reef's coral garden from roughly where the game camera looks down at the water
        render(os.path.join(PREVIEW, "reef_floor.png"), (0, -15.5, 6.2), (0, 3, -2.0), lens=24, bg="#7fe0e0")


main()
