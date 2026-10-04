"""
Paint Splash models: builds the four painter animals, the pickups and the three
playgrounds procedurally, then exports the files the game loads:

  ../public/models/painters.glb   one top-level node per animal with its roller
  ../public/models/props.glb      the pickups (paint bucket, rainbow and water puddles)
  ../public/models/place_*.glb    the scenery around each playground (one file each)

Run headless from this folder (no Blender window needed):

    blender --background --python models.py
    blender --background --python models.py -- --preview /tmp/out   # also renders preview PNGs

Coordinates: Blender Z is up. A painter faces -Y (three.js +Z after the Y-up
glTF export) and stands on z = 0. The paintable playground is the rectangle
x in [-16, 16], y in [-11, 11]; the game draws that ground itself, so the
scenery only goes around it (tall things behind, at +Y, low things in front).

Names the game relies on
------------------------
painters.glb top-level nodes: painter_hedgehog, painter_piglet, painter_chick, painter_kitten
  <root>/body     the animal and the roller handle (origin at the feet)
  <root>/roller   the roller drum, origin on its axle (spins about local X)
  Material "paint": the roller cover and the paint splats on the animal; the
  game clones it per player and tints it with that player's colour.

props.glb top-level nodes:
  bucket          paint bucket with a smiley face; material "bucket_paint" is tinted by the game
  puddle_rainbow  a flat rainbow puddle (radius ~1.1)
  puddle_water    a blue water puddle with a rubber duck (radius ~1.2)

place_square.glb, place_farm.glb, place_toys.glb: one top-level node each (place_square, place_farm, place_toys)
  <place>/scenery        everything that just stands there
  <place>/house_*        town houses (copies sharing six meshes; the game merges all static nodes)
  <place>/obstacle_*     things inside the playground painters roll around
                         (the game makes a round collider from the bounds)
  <place>/sails          farm windmill sails, origin on the hub (spins about three.js Z)
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

HALF_W, HALF_D = 16.0, 11.0


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


def root(name, parent=None, loc=(0, 0, 0)):
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


def xform(bm, loc=(0, 0, 0), scale=(1, 1, 1), rot=None):
    m = Matrix.Translation(Vector(loc)) @ (rot.to_4x4() if rot else Matrix()) @ Matrix.Diagonal((*scale, 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)


def sphere(name, r, loc, mat, parent=None, scale=(1, 1, 1), segs=16, rings=10, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    xform(bm, loc, scale, rot)
    return mesh_obj(name, bm, mat, parent)


def cylinder(name, r1, r2, depth, loc, mat, parent=None, segs=16, rot=None, smooth=True, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=depth)
    xform(bm, loc, scale, rot)
    o = mesh_obj(name, bm, mat, parent, smooth)
    if smooth:
        # Caps stay flat, sides smooth.
        for p in o.data.polygons:
            p.use_smooth = abs(p.normal.z) < 0.9 if not rot else True
    return o


def box(name, size, loc, mat, parent=None, bevel=0.06, rot=None, segments=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segments, affect="EDGES", profile=0.5)
    xform(bm, loc, (1, 1, 1), rot)
    o = mesh_obj(name, bm, mat, parent, smooth=False)
    return o


def prism_roof(name, w, d, h, loc, mat, parent=None, overhang=0.2):
    bm = bmesh.new()
    w2, d2 = w / 2 + overhang, d / 2 + overhang
    pts = [(-w2, -d2, 0), (w2, -d2, 0), (0, -d2, h), (-w2, d2, 0), (w2, d2, 0), (0, d2, h)]
    v = [bm.verts.new(Vector(p) + Vector(loc)) for p in pts]
    for f in ((0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)):
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, mat, parent, smooth=False)


def tube(name, points, radius, mat, parent=None, sides=8, radii=None):
    bm = bmesh.new()
    rings = []
    pts = [Vector(p) for p in points]
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = d.cross(Vector((0, 0, 1)))
        if side.length < 1e-4:
            side = d.cross(Vector((1, 0, 0)))
        side.normalize()
        up = side.cross(d).normalized()
        r = radii[i] if radii else radius
        rings.append([bm.verts.new(p + r * (math.cos(2 * math.pi * k / sides) * side + math.sin(2 * math.pi * k / sides) * up))
                      for k in range(sides)])
    for i in range(len(rings) - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    # Round caps
    for ring, p in ((rings[0], pts[0]), (rings[-1], pts[-1])):
        c = bm.verts.new(p)
        for k in range(sides):
            bm.faces.new((ring[k], ring[(k + 1) % sides], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, mat, parent)


def lathe(name, profile, mat, parent=None, segments=24, loc=(0, 0, 0), mats_by_ring=None):
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
    for m in (mat if isinstance(mat, (list, tuple)) else [mat]):
        o.data.materials.append(m)
    return o


def blob(name, R, loc, mat, parent=None, lumps=7, amount=0.25, seed=1, flat=0.12, segs=20):
    """A flat splat shape (paint puddles and splats): a squashed disc with a wobbly rim."""
    rnd = random.Random(seed)
    phases = [(rnd.uniform(0, 6.28), rnd.uniform(0.4, 1.0)) for _ in range(3)]

    def rad(a):
        return R * (1 + amount * sum(w * math.sin(a * (lumps + i * 2) + ph) for i, (ph, w) in enumerate(phases)) / 2)

    bm = bmesh.new()
    top = bm.verts.new((0, 0, flat))
    bot = bm.verts.new((0, 0, 0))
    ring_t = [bm.verts.new((rad(2 * math.pi * k / segs) * math.cos(2 * math.pi * k / segs),
                            rad(2 * math.pi * k / segs) * math.sin(2 * math.pi * k / segs), flat * 0.75)) for k in range(segs)]
    ring_b = [bm.verts.new((v.co.x * 1.04, v.co.y * 1.04, 0)) for v in ring_t]
    for k in range(segs):
        k2 = (k + 1) % segs
        bm.faces.new((top, ring_t[k], ring_t[k2]))
        bm.faces.new((ring_t[k], ring_b[k], ring_b[k2], ring_t[k2]))
        bm.faces.new((bot, ring_b[k2], ring_b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    xform(bm, loc)
    return mesh_obj(name, bm, mat, parent)


def join(objs, name, parent=None):
    """One mesh per node (one draw per material) keeps tablets happy."""
    objs = [o for o in objs if o and o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    # Bake parents in so the join keeps world positions.
    for o in objs:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    if len(objs) > 1:
        bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = name
    j.data.name = name
    if parent:
        mw = j.matrix_world.copy()
        j.parent = parent
        j.matrix_world = mw
    return j


def set_origin(obj, point):
    """Moves an object's origin to `point` (world) without moving its mesh."""
    p = Vector(point)
    local = obj.matrix_world.inverted() @ p
    obj.data.transform(Matrix.Translation(-local))
    obj.matrix_world = obj.matrix_world @ Matrix.Translation(local)


# --- Faces --------------------------------------------------------------------------------

def face_mats():
    return {
        "eye": material("eye", "#2b2140", roughness=0.25),
        "shine": material("shine", "#ffffff", roughness=0.3, emission="#ffffff", strength=0.5),
        "cheek": material("cheek", "#ff8fb1", roughness=0.7),
        "white": material("white", "#ffffff", roughness=0.5),
    }


def on_sphere(c, R, yaw, pitch, lift=0.0, scale=(1, 1, 1)):
    """Point on an ellipsoid's surface: yaw left/right of the front (-Y), pitch up/down."""
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    return Vector(c) + Vector((d.x * scale[0], d.y * scale[1], d.z * scale[2])) * (R + lift)


def rot_to(direction):
    """Rotation that turns local -Y towards `direction` (so flattened shapes hug a surface)."""
    d = Vector(direction)
    return d.to_track_quat("-Y", "Z" if abs(d.normalized().z) < 0.95 else "X").to_matrix()


def cute_face(parts, fm, c, R, scale=(1, 1, 1), eye_size=0.1, spread=0.42, eye_pitch=0.12, mouth=True, cheeks=True):
    for sx in (-1, 1):
        p = on_sphere(c, R, sx * spread, eye_pitch, -0.02, scale)
        n = (p - Vector(c)).normalized()
        r = rot_to(n)
        parts.append(sphere("eye", eye_size, p, fm["eye"], scale=(0.8, 0.45, 1.1), rot=r, segs=12, rings=8))
        parts.append(sphere("shine", eye_size * 0.38, p + n * 0.035 + Vector((0.03 * sx * 0 + 0.025, 0, 0.04)), fm["shine"],
                            scale=(1, 0.6, 1), rot=r, segs=8, rings=6))
        if cheeks:
            q = on_sphere(c, R, sx * (spread + 0.32), eye_pitch - 0.28, -0.02, scale)
            parts.append(sphere("cheek", eye_size * 1.05, q, fm["cheek"], scale=(1.1, 0.3, 0.7), rot=rot_to((q - Vector(c)).normalized()), segs=12, rings=6))
    if mouth:
        pts = []
        for i in range(9):
            u = i / 8
            yaw = (u - 0.5) * 0.42
            pitch = eye_pitch - 0.3 - math.sin(u * math.pi) * 0.09
            pts.append(on_sphere(c, R, yaw, pitch, 0.0, scale))
        parts.append(tube("smile", pts, 0.022, fm["eye"], sides=6))


# --- Painters -----------------------------------------------------------------------------

ROLLER_Y, ROLLER_Z, ROLLER_R, ROLLER_HALF = -0.95, 0.3, 0.3, 0.88


def painter_mats():
    return {
        **face_mats(),
        "paint": material("paint", "#ff4d8d", roughness=0.55),
        "metal": material("handle_metal", "#c9d3e0", metallic=0.6, roughness=0.3),
        "grip": material("handle_grip", "#ff9f1c", roughness=0.5),
        "cap": material("roller_cap", "#6c63ff", roughness=0.4),
    }


def roller_and_handle(rt, m, grip_z=0.78, grip_y=-0.18):
    """The paint roller in front of the animal: drum (own node) and a chunky handle (part of the body)."""
    handle = []
    # Grip bar the paws hold, a pole forward and down, and a yoke over the drum.
    handle.append(tube("grip", [(-0.32, grip_y, grip_z), (0.32, grip_y, grip_z)], 0.06, m["grip"], sides=10))
    yoke_y, yoke_z = ROLLER_Y + 0.12, ROLLER_Z + 0.42
    handle.append(tube("pole", [(0, grip_y, grip_z), (0, (grip_y + yoke_y) / 2, (grip_z + yoke_z) / 2 + 0.04), (0, yoke_y, yoke_z)], 0.045, m["metal"], sides=8))
    handle.append(tube("yoke", [(-ROLLER_HALF - 0.08, ROLLER_Y, ROLLER_Z), (-ROLLER_HALF - 0.08, yoke_y, yoke_z), (ROLLER_HALF + 0.08, yoke_y, yoke_z),
                               (ROLLER_HALF + 0.08, ROLLER_Y, ROLLER_Z)], 0.04, m["metal"], sides=8))
    # Drum: a fluffy cover (the tinted paint), and bright end caps.
    drum = []
    prof = []
    n = 14
    for i in range(n + 1):
        u = i / n
        x = -ROLLER_HALF + u * 2 * ROLLER_HALF
        r = ROLLER_R * (1 - 0.18 * (abs(u - 0.5) * 2) ** 8)
        prof.append((r, x))
    prof = [(0.0, -ROLLER_HALF)] + prof + [(0.0, ROLLER_HALF)]
    d = lathe("drum", prof, m["paint"], segments=22)
    d.data.transform(Matrix.Rotation(math.pi / 2, 4, "Y"))
    d.location = (0, ROLLER_Y, ROLLER_Z)
    drum.append(d)
    for sx in (-1, 1):
        drum.append(cylinder("cap", 0.13, 0.13, 0.08, (sx * (ROLLER_HALF + 0.03), ROLLER_Y, ROLLER_Z), m["cap"],
                             rot=Matrix.Rotation(math.pi / 2, 3, "Y"), segs=14))
    roller = join(drum, f"{rt.name}_roller")
    roller.name = "roller"
    set_origin(roller, (0, ROLLER_Y, ROLLER_Z))
    roller.parent = rt
    return handle


def arms(parts, mat, shoulder_z, body_r, grip_y=-0.18, grip_z=0.78):
    for sx in (-1, 1):
        pts = [(sx * body_r * 0.8, 0.12, shoulder_z), (sx * 0.34, -0.02, shoulder_z - 0.04), (sx * 0.26, grip_y + 0.02, grip_z)]
        parts.append(tube("arm", pts, 0.085, mat, sides=10))
        parts.append(sphere("paw", 0.1, (sx * 0.24, grip_y, grip_z), mat, segs=12, rings=8))


def feet(parts, mat, spread=0.2, y=0.15):
    for sx in (-1, 1):
        parts.append(sphere("foot", 0.14, (sx * spread, y - 0.05, 0.08), mat, scale=(1, 1.35, 0.6), segs=14, rings=8))


def splats(parts, m, spots):
    for i, (p, r) in enumerate(spots):
        n = Vector(p).normalized() if Vector(p).length else Vector((0, -1, 0))
        parts.append(sphere("splat", r, p, m["paint"], scale=(1, 0.35, 0.8), rot=rot_to(n), segs=10, rings=6))


def build_hedgehog(m):
    rt = root("painter_hedgehog")
    fur = material("hedgehog_face", "#f6d7ae", roughness=0.7)
    spike = material("hedgehog_spikes", "#7a5236", roughness=0.8)
    nose = m["eye"]
    parts = []
    body_c, body_r = (0, 0.2, 0.5), 0.4
    head_c, head_r = (0, 0.12, 1.02), 0.4
    parts.append(sphere("body", body_r, body_c, fur, scale=(1, 0.95, 1.05), segs=20, rings=12))
    parts.append(sphere("head", head_r, head_c, fur, segs=22, rings=14))
    # Spiky coat over the back of head and body
    rnd = random.Random(3)
    for c, R, zr in ((head_c, head_r, (-0.2, 1.2)), (body_c, body_r, (-0.6, 0.9))):
        for i in range(70):
            yaw = rnd.uniform(0.95, math.pi * 2 - 0.95)
            pitch = rnd.uniform(*zr)
            base = on_sphere(c, R, yaw, pitch, -0.06)
            n = (base - Vector(c)).normalized()
            n = (n + Vector((0, 0.5, 0.15))).normalized()
            tip = base + n * 0.26
            parts.append(tube("spike", [base, tip], 0.07, spike, sides=5, radii=[0.075, 0.012]))
    # Pointy snout with a shiny nose
    sn = on_sphere(head_c, head_r, 0, -0.12, -0.05)
    parts.append(sphere("snout", 0.16, sn + Vector((0, -0.08, 0)), fur, scale=(0.9, 1.3, 0.8), segs=14, rings=8))
    parts.append(sphere("nose", 0.075, sn + Vector((0, -0.27, 0.02)), nose, segs=10, rings=8))
    for sx in (-1, 1):
        parts.append(sphere("ear", 0.1, on_sphere(head_c, head_r, sx * 0.85, 0.75, -0.03), fur, scale=(1, 0.6, 1), segs=10, rings=6))
    cute_face(parts, m, head_c, head_r, eye_size=0.085, spread=0.38, eye_pitch=0.18, mouth=False)
    arms(parts, fur, 0.68, body_r)
    feet(parts, spike)
    splats(parts, m, [((0.22, -0.22, 1.28), 0.08), ((-0.3, -0.05, 0.42), 0.09)])
    parts += roller_and_handle(rt, m)
    body = join(parts, "body", rt)
    body.name = "body"
    return rt


def build_piglet(m):
    rt = root("painter_piglet")
    pink = material("piglet_pink", "#ffb3c8", roughness=0.55)
    deep = material("piglet_snout", "#ff8fb1", roughness=0.5)
    parts = []
    body_c, body_r = (0, 0.2, 0.5), 0.44
    head_c, head_r = (0, 0.1, 1.05), 0.42
    parts.append(sphere("body", body_r, body_c, pink, scale=(1.05, 1, 1), segs=20, rings=12))
    parts.append(sphere("head", head_r, head_c, pink, segs=22, rings=14))
    sn = on_sphere(head_c, head_r, 0, -0.15, -0.02)
    parts.append(cylinder("snout", 0.15, 0.15, 0.12, sn + Vector((0, -0.03, 0)), deep, rot=Matrix.Rotation(math.pi / 2, 3, "X"), segs=18, scale=(1.2, 1, 1)))
    for sx in (-1, 1):
        parts.append(sphere("nostril", 0.035, sn + Vector((sx * 0.06, -0.1, 0)), m["eye"], scale=(0.8, 0.5, 1.2), segs=8, rings=6))
        # Floppy triangle ears
        e = on_sphere(head_c, head_r, sx * 0.7, 0.85, -0.04)
        parts.append(tube("ear", [e, e + Vector((sx * 0.14, -0.1, 0.12)), e + Vector((sx * 0.22, -0.2, 0.04))], 0.1, deep, sides=6,
                          radii=[0.11, 0.08, 0.02]))
    cute_face(parts, m, head_c, head_r, eye_size=0.085, spread=0.4, eye_pitch=0.2, mouth=False)
    # Curly tail
    pts = [(0.03 * math.cos(t * 2) * (1 + t), 0.62 + 0.04 * t, 0.55 + 0.05 * math.sin(t * 2)) for t in [i * 0.4 for i in range(10)]]
    parts.append(tube("tail", pts, 0.03, deep, sides=6))
    arms(parts, pink, 0.7, body_r)
    feet(parts, deep)
    splats(parts, m, [((-0.25, -0.2, 1.3), 0.08), ((0.3, -0.12, 0.38), 0.1)])
    parts += roller_and_handle(rt, m)
    join(parts, "body", rt).name = "body"
    return rt


def build_chick(m):
    rt = root("painter_chick")
    yellow = material("chick_yellow", "#ffd93d", roughness=0.6)
    beak = material("chick_beak", "#ff8c1a", roughness=0.4)
    parts = []
    c, R = (0, 0.15, 0.68), 0.6
    parts.append(sphere("body", R, c, yellow, scale=(1, 0.95, 1.08), segs=24, rings=16))
    bk = on_sphere(c, R, 0, 0.0, -0.02, (1, 0.95, 1.08))
    parts.append(tube("beak", [bk + Vector((0, 0.05, 0)), bk + Vector((0, -0.2, -0.02))], 0.1, beak, sides=10, radii=[0.12, 0.01]))
    cute_face(parts, m, c, R, scale=(1, 0.95, 1.08), eye_size=0.095, spread=0.3, eye_pitch=0.22, mouth=False)
    # Tuft on top
    top = Vector(c) + Vector((0, 0, R * 1.08))
    for i, a in enumerate((-0.5, 0, 0.5)):
        parts.append(tube("tuft", [top - Vector((0, 0, 0.05)), top + Vector((a * 0.2, 0.05, 0.16)), top + Vector((a * 0.32, 0.15, 0.2))], 0.035, yellow, sides=6,
                          radii=[0.05, 0.04, 0.01]))
    # Wings reach to the handle
    for sx in (-1, 1):
        parts.append(sphere("wing", 0.2, (sx * 0.56, 0.08, 0.7), yellow, scale=(0.45, 1, 0.8), segs=12, rings=8,
                            rot=Matrix.Rotation(sx * 0.3, 3, "Y")))
    arms(parts, yellow, 0.72, 0.55)
    for sx in (-1, 1):
        parts.append(sphere("foot", 0.13, (sx * 0.2, 0.05, 0.06), beak, scale=(1, 1.5, 0.45), segs=12, rings=6))
    splats(parts, m, [((0.3, -0.35, 1.05), 0.08), ((-0.4, -0.25, 0.5), 0.1)])
    parts += roller_and_handle(rt, m)
    join(parts, "body", rt).name = "body"
    return rt


def build_kitten(m):
    rt = root("painter_kitten")
    orange = material("kitten_orange", "#ffa64d", roughness=0.65)
    cream = material("kitten_cream", "#fff1dc", roughness=0.65)
    stripe = material("kitten_stripe", "#e0731f", roughness=0.65)
    pinky = material("kitten_pink", "#ff8fb1", roughness=0.5)
    parts = []
    body_c, body_r = (0, 0.2, 0.5), 0.4
    head_c, head_r = (0, 0.1, 1.04), 0.43
    hs = (1.1, 1, 0.95)
    parts.append(sphere("body", body_r, body_c, orange, segs=20, rings=12))
    parts.append(sphere("belly", 0.3, on_sphere(body_c, body_r, 0, 0, -0.18), cream, scale=(1, 0.6, 1.1), segs=14, rings=8))
    parts.append(sphere("head", head_r, head_c, orange, scale=hs, segs=22, rings=14))
    mz = on_sphere(head_c, head_r, 0, -0.25, -0.1, hs)
    parts.append(sphere("muzzle", 0.18, mz, cream, scale=(1.3, 0.7, 0.85), segs=14, rings=8))
    parts.append(sphere("nose", 0.04, mz + Vector((0, -0.13, 0.06)), pinky, scale=(1.3, 1, 0.8), segs=8, rings=6))
    for sx in (-1, 1):
        e = on_sphere(head_c, head_r, sx * 0.55, 0.8, -0.08, hs)
        parts.append(tube("ear", [e, e + Vector((sx * 0.06, -0.02, 0.26))], 0.12, orange, sides=4, radii=[0.15, 0.01]))
        parts.append(tube("ear_in", [e + Vector((0, -0.05, 0.02)), e + Vector((sx * 0.05, -0.06, 0.2))], 0.08, pinky, sides=4, radii=[0.09, 0.01]))
        for k in (-1, 1):
            w0 = mz + Vector((sx * 0.14, -0.08, 0.0 + k * 0.03))
            parts.append(tube("whisker", [w0, w0 + Vector((sx * 0.22, 0.0, k * 0.05))], 0.008, m["eye"], sides=4))
    for i, a in enumerate((-0.25, 0, 0.25)):
        p = on_sphere(head_c, head_r, a, 1.0, -0.03, hs)
        parts.append(sphere("stripe", 0.06, p, stripe, scale=(0.6, 1.6, 0.4), segs=8, rings=6))
    cute_face(parts, m, head_c, head_r, scale=hs, eye_size=0.095, spread=0.36, eye_pitch=0.12, mouth=False)
    tail = [(0.2 * math.sin(t), 0.55 + 0.15 * t, 0.25 + 0.42 * t) for t in [i / 8 * 1.4 for i in range(9)]]
    parts.append(tube("tail", tail, 0.07, orange, sides=8, radii=[0.08] * 8 + [0.05]))
    arms(parts, orange, 0.66, body_r)
    feet(parts, cream)
    splats(parts, m, [((0.28, -0.25, 1.25), 0.08), ((-0.25, -0.15, 0.32), 0.09)])
    parts += roller_and_handle(rt, m)
    join(parts, "body", rt).name = "body"
    return rt


def build_painters():
    m = painter_mats()
    return [build_hedgehog(m), build_piglet(m), build_chick(m), build_kitten(m)]


# --- Pickups ---------------------------------------------------------------------------------

def build_props():
    fm = face_mats()
    tin = material("bucket_tin", "#e8eef7", metallic=0.3, roughness=0.35)
    paint = material("bucket_paint", "#ff4d8d", roughness=0.35)
    band = material("bucket_band", "#6c63ff", roughness=0.4)
    out = []

    rt = root("bucket")
    parts = []
    prof = [(0.0, 0.0), (0.42, 0.0), (0.46, 0.04), (0.55, 0.8), (0.6, 0.82), (0.6, 0.88), (0.54, 0.88), (0.5, 0.86)]
    parts.append(lathe("pail", prof, tin, segments=24))
    parts.append(cylinder("paint_top", 0.53, 0.53, 0.04, (0, 0, 0.8), paint, segs=24))
    parts.append(cylinder("band", 0.515, 0.535, 0.12, (0, 0, 0.62), band, segs=24))
    # Drips over the rim
    wall = lambda z: 0.44 + 0.11 * z / 0.8 + 0.015  # the pail's outside radius at height z
    for i, a in enumerate((0.3, 1.2, 2.3, 3.4, 4.3, 5.5)):
        L = 0.18 + 0.12 * ((i * 7) % 3)
        x, y = math.cos(a), math.sin(a)
        zs = [0.86, 0.86 - L * 0.5, 0.86 - L]
        pts = [(wall(min(z, 0.8)) * x, wall(min(z, 0.8)) * y, z) for z in zs]
        parts.append(tube("drip", pts, 0.05, paint, sides=8, radii=[0.05, 0.04, 0.045]))
        parts.append(sphere("drop", 0.055, (wall(zs[2]) * x, wall(zs[2]) * y, zs[2]), paint, scale=(1, 1, 1.2), segs=10, rings=6))
    handle = [(0.6 * math.cos(t), 0, 0.85 + 0.45 * math.sin(t)) for t in [i / 12 * math.pi for i in range(13)]]
    parts.append(tube("handle", handle, 0.03, band, sides=6))
    cute_face(parts, fm, (0, 0, 0.42), 0.5, eye_size=0.08, spread=0.3, eye_pitch=0.0)
    join(parts, "bucket_mesh", rt)
    out.append(rt)

    rt = root("puddle_rainbow")
    cols = ["#ff595e", "#ff9f1c", "#ffd23f", "#8ac926", "#2ec4b6", "#6c63ff"]
    parts = []
    for i, c in enumerate(cols):
        mat = material(f"rainbow_{i}", c, roughness=0.2)
        parts.append(blob(f"ring{i}", 1.15 - i * 0.17, (0, 0, i * 0.012), mat, lumps=5, amount=0.12, seed=4, flat=0.03, segs=28))
    join(parts, "puddle_rainbow_mesh", rt)
    out.append(rt)

    rt = root("puddle_water")
    water = material("water", "#58b4ff", roughness=0.08)
    light = material("water_light", "#bfe6ff", roughness=0.08)
    duck = material("duck", "#ffd93d", roughness=0.4)
    beak = material("duck_beak", "#ff8c1a", roughness=0.4)
    parts = [blob("water", 1.2, (0, 0, 0), water, lumps=6, amount=0.18, seed=9, flat=0.04, segs=28)]
    for i, (x, y, r) in enumerate(((-0.45, 0.3, 0.22), (0.5, -0.35, 0.16), (0.2, 0.55, 0.12))):
        parts.append(blob("glint", r, (x, y, 0.035), light, lumps=4, amount=0.2, seed=i, flat=0.012, segs=12))
    parts.append(sphere("duck_body", 0.22, (0.1, 0.05, 0.14), duck, scale=(1, 1.3, 0.7), segs=14, rings=8))
    parts.append(sphere("duck_head", 0.14, (0.1, -0.15, 0.36), duck, segs=14, rings=8))
    parts.append(sphere("duck_beak", 0.07, (0.1, -0.29, 0.34), beak, scale=(1.1, 1, 0.5), segs=10, rings=6))
    parts.append(sphere("duck_tail", 0.07, (0.1, 0.33, 0.24), duck, scale=(0.8, 1, 1.2), segs=8, rings=6))
    for sx in (-1, 1):
        parts.append(sphere("duck_eye", 0.025, (0.1 + sx * 0.07, -0.25, 0.4), fm["eye"], segs=8, rings=6))
    join(parts, "puddle_water_mesh", rt)
    out.append(rt)
    return out


# --- Places ------------------------------------------------------------------------------------

def tree(parts, x, y, s, leaf, trunk, rnd):
    parts.append(cylinder("trunk", 0.18 * s, 0.14 * s, 1.6 * s, (x, y, 0.8 * s), trunk, segs=8))
    for i in range(4):
        a = i * 2.1 + rnd.uniform(0, 1)
        parts.append(sphere("leaf", (0.75 + rnd.uniform(0, 0.25)) * s, (x + 0.45 * s * math.cos(a), y + 0.45 * s * math.sin(a), (2.0 + 0.35 * (i % 2)) * s),
                            leaf, segs=9, rings=6))
    parts.append(sphere("leaf", 0.75 * s, (x, y, 2.75 * s), leaf, segs=9, rings=6))


def flower(parts, x, y, petal, mats):
    parts.append(cylinder("stem", 0.03, 0.03, 0.35, (x, y, 0.17), mats["stem"], segs=4, smooth=False))
    parts.append(sphere("petals", 0.16, (x, y, 0.37), petal, scale=(1, 1, 0.35), segs=8, rings=4))
    parts.append(sphere("middle", 0.06, (x, y, 0.42), mats["mid"], segs=6, rings=3))


def house(parts, x, y, w, d, h, wall, roof, mats, face_dir=-1, door=True, rot=0.0):
    """A chunky row house; its front (windows, door) faces -Y (or +X/-X when rotated)."""
    R = Matrix.Rotation(rot, 3, "Z")
    c = Vector((x, y, 0))

    def P(lx, ly, lz):
        return c + R @ Vector((lx, ly, lz))
    parts.append(box("wall", (w, d, h), P(0, 0, h / 2), wall, bevel=0.08, rot=R, segments=1))
    roof_o = prism_roof("roof", w, d, 1.3, (0, 0, 0), roof, overhang=0.25)
    roof_o.data.transform(R.to_4x4())
    roof_o.location = P(0, 0, h)
    parts.append(roof_o)
    rows = max(1, int((h - 1.0) / 1.5))
    cols = max(1, int(w / 1.5))
    for r_ in range(rows):
        for k in range(cols):
            lx = (k - (cols - 1) / 2) * (w / cols)
            lz = 1.6 + r_ * 1.5 if not door or r_ > 0 or abs(lx) > 0.6 else None
            if lz is None:
                continue
            parts.append(box("window", (0.62, 0.1, 0.78), P(lx, -d / 2 - 0.02, lz), mats["glass"], bevel=0, rot=R))
            parts.append(box("box", (0.76, 0.2, 0.16), P(lx, -d / 2 - 0.1, lz - 0.48), mats["planter"], bevel=0, rot=R))
            parts.append(sphere("bloom", 0.2, P(lx, -d / 2 - 0.12, lz - 0.38), mats["blooms"][(k + r_) % 4], scale=(1.6, 0.6, 0.5), segs=6, rings=3))
    if door:
        parts.append(box("door", (0.9, 0.12, 1.5), P(0, -d / 2 - 0.02, 0.75), mats["door"], bevel=0.06, rot=R))
        parts.append(sphere("knob", 0.06, P(0.25, -d / 2 - 0.1, 0.75), mats["knob"], segs=6, rings=4))
        parts.append(box("step", (1.2, 0.4, 0.15), P(0, -d / 2 - 0.2, 0.07), mats["trim"], bevel=0.03, rot=R))


def lamp(parts, x, y, mats):
    parts.append(cylinder("post", 0.08, 0.1, 3.0, (x, y, 1.5), mats["iron"], segs=8))
    parts.append(sphere("lamp", 0.28, (x, y, 3.2), mats["lamp"], segs=10, rings=8))
    parts.append(cylinder("hat", 0.05, 0.32, 0.2, (x, y, 3.48), mats["iron"], segs=8))


def bench(parts, x, y, rot, mats):
    R = Matrix.Rotation(rot, 3, "Z")
    c = Vector((x, y, 0))
    for k in range(3):
        parts.append(box("slat", (1.8, 0.14, 0.06), c + R @ Vector((0, -0.18 + k * 0.18, 0.5)), mats["wood"], bevel=0.02, rot=R))
    parts.append(box("back", (1.8, 0.06, 0.4), c + R @ Vector((0, 0.24, 0.8)), mats["wood"], bevel=0.02, rot=R))
    for sx in (-1, 1):
        parts.append(box("leg", (0.08, 0.5, 0.5), c + R @ Vector((sx * 0.75, 0, 0.25)), mats["iron"], bevel=0.02, rot=R))


def bunting(parts, a, b, sag, flags, mats):
    a, b = Vector(a), Vector(b)
    pts = [a.lerp(b, i / 16) - Vector((0, 0, sag * math.sin(math.pi * i / 16))) for i in range(17)]
    parts.append(tube("string", pts, 0.02, mats["iron"], sides=4))
    n = flags
    for i in range(1, n):
        u = i / n
        p = a.lerp(b, u) - Vector((0, 0, sag * math.sin(math.pi * u)))
        d = (b - a).normalized() * 0.22
        bm = bmesh.new()
        v = [bm.verts.new(p - d), bm.verts.new(p + d), bm.verts.new(p - Vector((0, 0, 0.5)))]
        bm.faces.new(v)
        o = mesh_obj("flag", bm, mats["blooms"][i % len(mats["blooms"])], smooth=False)
        parts.append(o)


def common_mats():
    return {
        "leaf": material("leaf", "#6cc644", roughness=0.8),
        "leaf2": material("leaf_dark", "#3fa34d", roughness=0.8),
        "trunk": material("trunk", "#8a5a3c", roughness=0.9),
        "stem": material("stem", "#3fa34d", roughness=0.8),
        "mid": material("flower_mid", "#ffd23f", roughness=0.6),
        "blooms": [material("bloom_pink", "#ff6b9d", roughness=0.6), material("bloom_blue", "#6c9bff", roughness=0.6),
                   material("bloom_yellow", "#ffd23f", roughness=0.6), material("bloom_purple", "#b18cff", roughness=0.6)],
        "glass": material("window_glass", "#bfe3ff", roughness=0.1, emission="#bfe3ff", strength=0.15),
        "trim": material("trim", "#ffffff", roughness=0.6),
        "planter": material("planter", "#c97b52", roughness=0.8),
        "door": material("door", "#6c63ff", roughness=0.5),
        "knob": material("knob", "#ffd23f", metallic=0.6, roughness=0.3),
        "iron": material("iron", "#3d405b", roughness=0.5),
        "lamp": material("lamp_glow", "#fff4c2", emission="#fff0a0", strength=1.2),
        "wood": material("wood", "#c98a55", roughness=0.7),
        "stone": material("stone", "#e6e1d8", roughness=0.8),
        "water": material("fountain_water", "#58b4ff", roughness=0.08),
        **face_mats(),
    }


def build_square(cm):
    rt = root("place_square")
    rnd = random.Random(7)
    parts = []
    walls = [material(f"wall_{i}", c, roughness=0.75) for i, c in enumerate(["#ffb5a7", "#ffe08a", "#a8e6cf", "#b8c0ff", "#ffc6ff", "#9bf6ff"])]
    roofs = [material(f"roof_{i}", c, roughness=0.6) for i, c in enumerate(["#e85d75", "#5b7bd5", "#f08a4b"])]
    # Six house designs, each one mesh shared by every copy (linked duplicates
    # export as one glTF mesh used by many nodes, which keeps the file small).
    designs = []
    for k in range(6):
        w = (3.4, 4.0, 4.6)[k % 3]
        h = (4.2, 5.4, 6.4, 5.0, 4.6, 6.0)[k]
        hp = []
        house(hp, 0, 0, w, 4, h, walls[k], roofs[k % 3], cm)
        designs.append((w, join(hp, f"house_design{k}")))
    placed = []

    def put(k, x, y, rot):
        w, src = designs[k]
        o = link(bpy.data.objects.new(f"house_{len(placed)}", src.data), rt)
        o.location = (x, y, 0)
        o.rotation_euler = (0, 0, rot)
        placed.append(o)
        return w
    # Back row of houses (behind the square, facing it)
    x = -21.0
    i = 0
    while x < 21:
        k = (i * 5 + 1) % 6
        w = designs[k][0]
        put(k, x + w / 2, 14.5, 0)
        x += w + 0.1
        i += 1
    # Side rows, turned to face the square
    for side in (-1, 1):
        y = -6.0
        while y < 12:
            k = (i * 5 + 1) % 6
            w = designs[k][0]
            put(k, side * 21.0, y + w / 2, -side * math.pi / 2)
            y += w + 0.1
            i += 1
    for _, src in designs:
        bpy.data.objects.remove(src)
    for (tx, ty) in ((-18.5, -9), (18.5, -9), (-18.5, 11), (18.5, 11), (-8, 12.2), (8, 12.2)):
        tree(parts, tx, ty, 1.0, cm["leaf"], cm["trunk"], rnd)
    for (lx, ly) in ((-12, 12), (0, 12.2), (12, 12), (-17.2, 0), (17.2, 0)):
        lamp(parts, lx, ly, cm)
    bench(parts, -4, 12.3, 0, cm)
    bench(parts, 4, 12.3, 0, cm)
    # Flower beds along the front edge (low, so the camera sees over them)
    for k in range(18):
        fx = -16 + k * (32 / 17)
        parts.append(box("bed", (1.5, 0.6, 0.3), (fx, -12.0, 0.15), cm["planter"], bevel=0.05))
        for j in range(3):
            flower(parts, fx - 0.45 + j * 0.45, -12.0, cm["blooms"][(k + j) % 4], cm)
    bunting(parts, (-19, 12.4, 4.6), (19, 12.4, 4.6), 0.8, 26, cm)
    # Kerb around the square
    for sx, sy, w, d in ((0, -11.3, 32.8, 0.4), (0, 11.3, 32.8, 0.4), (-16.2, 0, 0.4, 22.2), (16.2, 0, 0.4, 22.2)):
        parts.append(box("kerb", (w, d, 0.16), (sx, sy, 0.08), cm["stone"], bevel=0.04))
    join(parts, "scenery", rt)

    # Fountain in the middle: painters roll round it.
    f = []
    f.append(cylinder("basin", 1.7, 1.75, 0.55, (0, 0, 0.27), cm["stone"], segs=28))
    f.append(cylinder("pool", 1.5, 1.5, 0.05, (0, 0, 0.52), cm["water"], segs=28))
    f.append(cylinder("column", 0.25, 0.3, 1.4, (0, 0, 1.1), cm["stone"], segs=14))
    f.append(cylinder("bowl", 0.75, 0.3, 0.3, (0, 0, 1.75), cm["stone"], segs=20))
    f.append(cylinder("bowl_water", 0.66, 0.66, 0.04, (0, 0, 1.89), cm["water"], segs=20))
    f.append(sphere("spout", 0.22, (0, 0, 2.1), cm["water"], scale=(1, 1, 1.6), segs=12, rings=8))
    for k in range(8):
        a = k * math.pi / 4
        f.append(tube("jet", [(0.1 * math.cos(a), 0.1 * math.sin(a), 2.3), (0.55 * math.cos(a), 0.55 * math.sin(a), 2.45), (1.1 * math.cos(a), 1.1 * math.sin(a), 0.6)],
                      0.05, cm["water"], sides=5))
    join(f, "obstacle_fountain", rt)
    return rt


def fence_run(parts, a, b, wood, step=1.6):
    a, b = Vector(a), Vector(b)
    L = (b - a).length
    n = max(1, int(L / step))
    for i in range(n + 1):
        p = a.lerp(b, i / n)
        parts.append(box("post", (0.16, 0.16, 0.95), p + Vector((0, 0, 0.47)), wood, bevel=0))
    ang = math.atan2(b.y - a.y, b.x - a.x)
    R = Matrix.Rotation(ang, 3, "Z")
    for z in (0.4, 0.75):
        parts.append(box("rail", (L, 0.08, 0.14), (a + b) / 2 + Vector((0, 0, z)), wood, bevel=0.02, rot=R, segments=1))


def animal_cow(parts, x, y, rot, cm):
    white = material("cow_white", "#ffffff", roughness=0.7)
    black = material("cow_spot", "#3d3d4a", roughness=0.7)
    pink = material("cow_nose", "#ffb3c8", roughness=0.6)
    R = Matrix.Rotation(rot, 3, "Z")
    c = Vector((x, y, 0))

    def P(lx, ly, lz):
        return c + R @ Vector((lx, ly, lz))
    parts.append(sphere("body", 0.75, P(0, 0.3, 1.05), white, scale=(0.85, 1.35, 0.8), rot=R, segs=16, rings=10))
    for (sx, sy) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        parts.append(cylinder("leg", 0.13, 0.12, 0.7, P(sx * 0.35, 0.3 + sy * 0.55, 0.35), white, segs=8))
        parts.append(cylinder("hoof", 0.14, 0.14, 0.12, P(sx * 0.35, 0.3 + sy * 0.55, 0.06), black, segs=8))
    for (sx, sy, sz, r) in ((0.5, 0.2, 1.3, 0.3), (-0.55, 0.6, 1.1, 0.28), (0.1, 0.9, 1.5, 0.25)):
        parts.append(sphere("spot", r, P(sx * 0.95, sy, sz), black, scale=(0.5, 1, 0.8), rot=R, segs=8, rings=6))
    hc = P(0, -0.85, 1.45)
    parts.append(sphere("head", 0.45, hc, white, scale=(1, 0.95, 0.95), segs=16, rings=10))
    parts.append(sphere("muzzle", 0.32, hc + R @ Vector((0, -0.3, -0.18)), pink, scale=(1.15, 0.8, 0.75), segs=12, rings=8))
    for sx in (-1, 1):
        parts.append(sphere("nostril", 0.05, hc + R @ Vector((sx * 0.12, -0.55, -0.15)), black, segs=6, rings=4))
        parts.append(sphere("eye", 0.07, hc + R @ Vector((sx * 0.2, -0.38, 0.12)), cm["eye"], scale=(0.8, 0.6, 1.1), segs=8, rings=6))
        parts.append(sphere("shine", 0.025, hc + R @ Vector((sx * 0.2 + 0.02, -0.43, 0.15)), cm["shine"], segs=6, rings=4))
        parts.append(tube("horn", [hc + R @ Vector((sx * 0.25, 0, 0.35)), hc + R @ Vector((sx * 0.42, 0, 0.55))], 0.06, cm["trim"], sides=6, radii=[0.07, 0.02]))
        parts.append(sphere("ear", 0.13, hc + R @ Vector((sx * 0.5, 0.05, 0.2)), white, scale=(1.4, 0.5, 0.7), segs=8, rings=6))


def animal_sheep(parts, x, y, rot, cm):
    wool = material("sheep_wool", "#fbf8f0", roughness=0.9)
    dark = material("sheep_face", "#4a4458", roughness=0.7)
    R = Matrix.Rotation(rot, 3, "Z")
    c = Vector((x, y, 0))

    def P(lx, ly, lz):
        return c + R @ Vector((lx, ly, lz))
    for k in range(9):
        a = k * 0.7
        parts.append(sphere("wool", 0.38, P(0.35 * math.cos(a), 0.2 + 0.45 * math.sin(a * 1.3), 0.85 + 0.15 * math.sin(a * 2)), wool, segs=10, rings=6))
    for (sx, sy) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        parts.append(cylinder("leg", 0.07, 0.07, 0.6, P(sx * 0.25, 0.2 + sy * 0.35, 0.3), dark, segs=6))
    hc = P(0, -0.45, 1.05)
    parts.append(sphere("head", 0.27, hc, dark, scale=(0.9, 1.1, 1), segs=12, rings=8))
    parts.append(sphere("tuft", 0.2, hc + R @ Vector((0, 0.05, 0.22)), wool, segs=8, rings=6))
    for sx in (-1, 1):
        parts.append(sphere("eye", 0.055, hc + R @ Vector((sx * 0.12, -0.24, 0.05)), cm["white"], segs=8, rings=6))
        parts.append(sphere("pupil", 0.03, hc + R @ Vector((sx * 0.12, -0.29, 0.05)), cm["eye"], segs=6, rings=4))
        parts.append(sphere("ear", 0.1, hc + R @ Vector((sx * 0.3, 0.05, 0.05)), dark, scale=(1.5, 0.5, 0.6), segs=8, rings=4))


def build_farm(cm):
    rt = root("place_farm")
    rnd = random.Random(11)
    parts = []
    red = material("barn_red", "#e5484d", roughness=0.7)
    white = cm["trim"]
    roof = material("barn_roof", "#5a4a6b", roughness=0.6)
    fence = material("fence_wood", "#f2e2c4", roughness=0.8)
    hay = material("hay", "#f5c84c", roughness=0.9)
    hay_dark = material("hay_dark", "#d9a634", roughness=0.9)
    silo = material("silo", "#b8c4d6", metallic=0.3, roughness=0.4)
    grass = material("bush", "#5cb85c", roughness=0.8)
    # Barn behind the field, its big doors facing the painters
    bx, by = -7.0, 16.5
    parts.append(box("barn", (8, 6, 5), (bx, by, 2.5), red, bevel=0.1))
    # The roof's gable faces the field (-Y).
    parts.append(prism_roof("barn_roof", 8, 6, 2.8, (bx, by, 5), roof, overhang=0.35))
    for sx in (-1, 1):
        parts.append(box("door", (1.6, 0.15, 3.0), (bx + sx * 0.85, by - 3.05, 1.5), red, bevel=0.04))
        parts.append(box("x1", (0.15, 0.1, 3.3), (bx + sx * 0.85, by - 3.15, 1.5), white, bevel=0.02, rot=Matrix.Rotation(sx * 0.5, 3, "Y")))
        parts.append(box("x2", (0.15, 0.1, 3.3), (bx + sx * 0.85, by - 3.15, 1.5), white, bevel=0.02, rot=Matrix.Rotation(-sx * 0.5, 3, "Y")))
    parts.append(box("frame", (3.6, 0.12, 0.2), (bx, by - 3.12, 3.05), white, bevel=0.03))
    parts.append(box("loft", (1.4, 0.12, 1.2), (bx, by - 3.05, 4.4), white, bevel=0.05))
    # Silo
    parts.append(cylinder("silo", 1.5, 1.5, 7, (bx + 6.0, by + 0.5, 3.5), silo, segs=20))
    parts.append(sphere("silo_top", 1.5, (bx + 6.0, by + 0.5, 7), red, scale=(1, 1, 0.6), segs=20, rings=10))
    # Windmill
    wx, wy = 12.0, 16.0
    parts.append(cylinder("mill", 1.6, 1.0, 6.5, (wx, wy, 3.25), white, segs=16))
    parts.append(cylinder("mill_cap", 1.2, 0.2, 1.4, (wx, wy, 7.2), red, segs=16))
    parts.append(box("mill_door", (0.8, 0.2, 1.4), (wx, wy - 1.45, 0.7), red, bevel=0.05))
    # Hay stack and fields
    for k, (hx, hy) in enumerate(((3.0, 15.0), (4.6, 15.4), (3.8, 14.6))):
        parts.append(cylinder("bale", 0.8, 0.8, 1.2, (hx, hy, 0.8), hay, rot=Matrix.Rotation(math.pi / 2, 3, "X"), segs=16))
    for (tx, ty, s) in ((-19, 9, 1.2), (-20, -2, 1.0), (19.5, 8, 1.1), (20, -4, 1.0), (-16, 15, 1.2), (17, 13.5, 0.9), (-21, 14, 1.0), (21, 16, 1.2)):
        tree(parts, tx, ty, s, cm["leaf"] if rnd.random() < 0.5 else cm["leaf2"], cm["trunk"], rnd)
    # Apples on the trees
    for k in range(10):
        tx, ty = rnd.choice(((-19, 9), (19.5, 8), (-16, 15)))
        a = rnd.uniform(0, 6.28)
        parts.append(sphere("apple", 0.13, (tx + 0.9 * math.cos(a), ty + 0.9 * math.sin(a), 2.3 + rnd.uniform(-0.3, 0.6)), red, segs=8, rings=6))
    # Fence round the field (low at the front)
    for (a, b) in (((-16.6, -11.6, 0), (16.6, -11.6, 0)), ((-16.6, 11.6, 0), (16.6, 11.6, 0)),
                   ((-16.6, -11.6, 0), (-16.6, 11.6, 0)), ((16.6, -11.6, 0), (16.6, 11.6, 0))):
        fence_run(parts, a, b, fence)
    # Bushes and flowers outside the fence
    for k in range(24):
        a = rnd.uniform(0, 2 * math.pi)
        x = math.cos(a) * 19.5
        y = max(-14.5, min(13, math.sin(a) * 14.5))
        if abs(x) < 17.4 and abs(y) < 12.4:
            continue
        parts.append(sphere("bush", 0.6 + rnd.uniform(0, 0.4), (x, y, 0.3), grass, scale=(1, 1, 0.75), segs=10, rings=6))
    for k in range(30):
        fx, fy = rnd.uniform(-17, 17), rnd.uniform(-14.5, -12.3)
        flower(parts, fx, fy, cm["blooms"][k % 4], cm)
    animal_cow(parts, -19.5, 3.0, -math.pi / 2 + 0.3, cm)
    animal_cow(parts, 19.5, 2.0, math.pi / 2 - 0.3, cm)
    animal_sheep(parts, -18.8, -6.5, -math.pi / 2, cm)
    animal_sheep(parts, 18.6, -7.0, math.pi / 2 + 0.4, cm)
    animal_sheep(parts, 1.0, 13.6, 0.2, cm)
    join(parts, "scenery", rt)

    # Windmill sails: own node, origin on the hub, spun by the game.
    s = []
    hub = Vector((wx, wy - 1.35, 6.3))
    s.append(cylinder("hub", 0.3, 0.3, 0.3, hub, red, rot=Matrix.Rotation(math.pi / 2, 3, "X"), segs=12))
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        d = Vector((math.cos(a), 0, math.sin(a)))
        s.append(tube("arm", [hub, hub + d * 3.0], 0.07, fence, sides=6))
        side = Vector((-d.z, 0, d.x))
        bm = bmesh.new()
        v = [bm.verts.new(hub + d * 0.7), bm.verts.new(hub + d * 3.0), bm.verts.new(hub + d * 3.0 + side * 0.9), bm.verts.new(hub + d * 0.7 + side * 0.9)]
        bm.faces.new(v)
        s.append(mesh_obj("sail", bm, white, smooth=False))
    sails = join(s, "sails", rt)
    set_origin(sails, hub)

    # Round hay bales inside the field: painters roll around them.
    for k, (hx, hy) in enumerate(((-8.0, -3.0), (8.5, 4.0))):
        b = [cylinder("bale", 1.0, 1.0, 1.3, (hx, hy, 0.65), hay, segs=20)]
        for z in (0.35, 0.95):
            b.append(cylinder("band", 1.02, 1.02, 0.08, (hx, hy, z), hay_dark, segs=20))
        b.append(lathe("swirl", [(0.0, 1.31), (0.6, 1.31), (0.62, 1.3)], hay_dark, segments=20, loc=(hx, hy, 0)))
        join(b, f"obstacle_bale{k}", rt)
    return rt


def toy_block(parts, x, y, z, s, color, mark, cm, rot=0.0):
    R = Matrix.Rotation(rot, 3, "Z")
    c = Vector((x, y, z + s / 2))
    parts.append(box("block", (s, s, s), c, color, bevel=s * 0.08, rot=R))
    # A raised shape on every side
    for (n, up) in (((0, -1, 0), (0, 0, 1)), ((0, 1, 0), (0, 0, 1)), ((1, 0, 0), (0, 0, 1)), ((-1, 0, 0), (0, 0, 1)), ((0, 0, 1), (0, 1, 0))):
        nv = R @ Vector(n)
        p = c + nv * (s / 2 + 0.01)
        rq = rot_to(nv)
        parts.append(cylinder("mark", s * 0.28, s * 0.28, s * 0.05, p, mark, rot=rq @ Matrix.Rotation(math.pi / 2, 3, "X"), segs=5 if (n[0] + n[1]) % 2 else 16))


def build_toys(cm):
    rt = root("place_toys")
    rnd = random.Random(5)
    parts = []
    wall = material("wallpaper", "#ffe3ee", roughness=0.9)
    wall2 = material("wallpaper_dots", "#ffc2d9", roughness=0.9)
    skirting = material("skirting", "#ffffff", roughness=0.6)
    sky = material("window_sky", "#9fd8ff", roughness=0.3, emission="#bfe6ff", strength=0.4)
    shelf = material("shelf", "#a5d8ff", roughness=0.6)
    bear = material("teddy", "#c98a55", roughness=0.9)
    bear_l = material("teddy_light", "#f2d1a8", roughness=0.9)
    cols = [material(f"toy_{i}", c, roughness=0.45) for i, c in enumerate(["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93", "#ff9f1c"])]
    # Walls behind and at the sides
    parts.append(box("back_wall", (46, 0.6, 9), (0, 15.5, 4.5), wall, bevel=0))
    for sx in (-1, 1):
        parts.append(box("side_wall", (0.6, 32, 9), (sx * 22.5, 0, 4.5), wall, bevel=0))
        parts.append(box("skirt", (0.3, 31, 0.5), (sx * 22.1, 0, 0.25), skirting, bevel=0.03))
    parts.append(box("skirt", (45, 0.3, 0.5), (0, 15.1, 0.25), skirting, bevel=0.03))
    # Polka dots on the wallpaper
    for k in range(60):
        x, z = rnd.uniform(-21, 21), rnd.uniform(1, 8.5)
        parts.append(cylinder("dot", 0.25, 0.25, 0.06, (x, 15.18, z), wall2, rot=Matrix.Rotation(math.pi / 2, 3, "X"), segs=8, smooth=False))
    # A window with sky and clouds
    parts.append(box("window", (6, 0.3, 4), (6, 15.15, 5), skirting, bevel=0.1))
    parts.append(box("pane", (5.4, 0.3, 3.4), (6, 15.05, 5), sky, bevel=0.0))
    parts.append(box("bar_v", (0.2, 0.4, 3.4), (6, 15.0, 5), skirting, bevel=0.03))
    parts.append(box("bar_h", (5.4, 0.4, 0.2), (6, 15.0, 5), skirting, bevel=0.03))
    for (cx, cz) in ((4.4, 5.8), (7.6, 4.5)):
        for k in range(3):
            parts.append(sphere("cloud", 0.35 + 0.1 * (k == 1), (cx + (k - 1) * 0.45, 14.85, cz + 0.1 * (k == 1)), skirting, scale=(1, 0.3, 0.8), segs=10, rings=6))
    # Bookshelf with books
    parts.append(box("shelf", (6, 1.2, 5), (-10, 14.6, 2.5), shelf, bevel=0.08))
    for row, z in enumerate((0.6, 2.2, 3.8)):
        x = -12.6
        while x < -7.6:
            w = rnd.uniform(0.25, 0.5)
            h = rnd.uniform(0.9, 1.3)
            parts.append(box("book", (w, 0.9, h), (x + w / 2, 14.1, z + h / 2), cols[rnd.randrange(6)], bevel=0))
            x += w + 0.05
    # Teddy bear sitting by the wall
    tx, ty = -17.5, 13.0
    parts.append(sphere("tbody", 1.3, (tx, ty, 1.3), bear, scale=(1, 0.9, 1.05), segs=18, rings=12))
    parts.append(sphere("tbelly", 0.85, (tx, ty - 0.6, 1.2), bear_l, scale=(1, 0.5, 1.1), segs=14, rings=8))
    hc = (tx, ty - 0.2, 3.1)
    parts.append(sphere("thead", 1.0, hc, bear, segs=18, rings=12))
    parts.append(sphere("tmuzzle", 0.42, (tx, ty - 1.05, 2.85), bear_l, scale=(1.1, 0.7, 0.8), segs=12, rings=8))
    parts.append(sphere("tnose", 0.14, (tx, ty - 1.35, 3.0), cm["eye"], scale=(1.3, 0.8, 0.9), segs=10, rings=6))
    for sx in (-1, 1):
        parts.append(sphere("tear", 0.38, (tx + sx * 0.8, ty - 0.1, 3.85), bear, scale=(1, 0.6, 1), segs=12, rings=8))
        parts.append(sphere("tear_in", 0.22, (tx + sx * 0.8, ty - 0.3, 3.85), bear_l, scale=(1, 0.4, 1), segs=10, rings=6))
        parts.append(sphere("teye", 0.12, (tx + sx * 0.36, ty - 1.0, 3.35), cm["eye"], scale=(0.9, 0.5, 1.1), segs=10, rings=6))
        parts.append(sphere("tshine", 0.045, (tx + sx * 0.36 + 0.04, ty - 1.08, 3.42), cm["shine"], segs=6, rings=4))
        parts.append(sphere("tarm", 0.42, (tx + sx * 1.25, ty - 0.5, 1.6), bear, scale=(0.8, 0.8, 1.3), segs=12, rings=8))
        parts.append(sphere("tleg", 0.5, (tx + sx * 0.7, ty - 1.1, 0.45), bear, scale=(0.9, 1.3, 0.8), segs=12, rings=8))
        parts.append(sphere("tpad", 0.32, (tx + sx * 0.7, ty - 1.7, 0.45), bear_l, scale=(1, 0.3, 1), segs=10, rings=6))
    parts.append(sphere("bow", 0.3, (tx, ty - 0.95, 2.25), cols[0], scale=(1.6, 0.6, 0.8), segs=10, rings=6))
    # Big beach ball and stacked blocks in the corners
    ball = [material(f"ball_{i}", c, roughness=0.3) for i, c in enumerate(["#ff595e", "#ffffff", "#1982c4", "#ffca3a"])]
    bl = lathe("ball", [(0.0, -1.2)] + [(1.2 * math.sin(math.pi * i / 12), -1.2 * math.cos(math.pi * i / 12)) for i in range(1, 12)] + [(0.0, 1.2)],
          ball, segments=24, loc=(18.5, 13, 1.2))
    bl.data.transform(Matrix.Translation((-18.5, -13, -1.2)))
    bl.data.transform(Matrix.Rotation(math.pi / 2, 4, "X"))
    bl.data.transform(Matrix.Translation((18.5, 13, 1.2)))
    for idx, p in enumerate(bl.data.polygons):
        ang = math.atan2(p.center.z - 1.2, p.center.x - 18.5)
        p.material_index = int(((ang + math.pi) / (2 * math.pi)) * 8) % 4
    parts.append(bl)
    for k, (x, y, z, s) in enumerate(((19.5, -9, 0, 1.6), (19.6, -7.2, 0, 1.4), (19.4, -8.1, 1.5, 1.3), (-19.5, -8, 0, 1.6), (-19.6, -6.3, 0, 1.2))):
        toy_block(parts, x, y, z, s, cols[k % 6], cols[(k + 3) % 6], cm, rot=rnd.uniform(-0.3, 0.3))
    # Crayons lying in front (low)
    for k in range(7):
        x = -9 + k * 3.0
        c = cols[k % 6]
        parts.append(cylinder("crayon", 0.22, 0.22, 2.0, (x, -12.6, 0.22), c, rot=Matrix.Rotation(math.pi / 2, 3, "Y") @ Matrix.Rotation(0.1 * k, 3, "X"), segs=10))
        parts.append(tube("tip", [(x + 1.0, -12.6, 0.22), (x + 1.45, -12.6, 0.22)], 0.2, c, sides=10, radii=[0.21, 0.04]))
        parts.append(cylinder("wrap", 0.23, 0.23, 1.2, (x - 0.1, -12.6, 0.22), skirting, rot=Matrix.Rotation(math.pi / 2, 3, "Y"), segs=10))
    # Toy train along the right wall
    for k in range(3):
        y = 4 - k * 2.8
        parts.append(box("car", (1.2, 2.2, 1.0), (20.5, y, 0.75), cols[k + 1], bevel=0.12))
        for sy in (-0.6, 0.6):
            for sx in (-0.65, 0.65):
                parts.append(cylinder("wheel", 0.3, 0.3, 0.15, (20.5 + sx, y + sy, 0.3), cm["iron"], rot=Matrix.Rotation(math.pi / 2, 3, "Y"), segs=12))
    parts.append(cylinder("chimney", 0.25, 0.35, 0.8, (20.5, 4.5, 1.6), cols[0], segs=10))
    # Paper edges (tape) at the corners of the big sheet the children paint on
    tape = material("tape", "#fff3b0", roughness=0.8)
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box("tape", (1.4, 0.5, 0.03), (sx * 15.8, sy * 10.8, 0.03), tape, bevel=0.0, rot=Matrix.Rotation(sx * sy * 0.78, 3, "Z")))
    join(parts, "scenery", rt)

    # Two giant blocks on the paper to roll round
    for k, (x, y, s) in enumerate(((-7.5, 3.5, 2.0), (7.0, -3.5, 2.0))):
        b = []
        toy_block(b, x, y, 0, s, cols[k * 3], cols[k * 3 + 1], cm, rot=0.4 * (k * 2 - 1))
        join(b, f"obstacle_block{k}", rt)
    return rt


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
    for rt in roots:
        for c in rt.children_recursive:
            if c.type == "MESH":
                print(f"  {rt.name}/{c.name}: {len(c.data.vertices)} verts, {len(c.data.polygons)} faces")


def render(path, cam_loc, cam_target, lens=35, res=(1280, 720), bg="#9fd8ff"):
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
        sun.rotation_euler = (math.radians(40), math.radians(-20), math.radians(-30))
    world = scene.world or bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    b = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    b.inputs["Color"].default_value = (*rgb(bg), 1)
    b.inputs["Strength"].default_value = 1.0
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
        for o in [*rt.children_recursive, rt]:
            bpy.data.objects.remove(o)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    only = argv[argv.index("--only") + 1].split(",") if "--only" in argv else ["painters", "props", "places"]

    if "painters" in only:
        painters = build_painters()
        export(os.path.join(OUT_DIR, "painters.glb"), painters)
        if PREVIEW:
            os.makedirs(PREVIEW, exist_ok=True)
            for i, rt in enumerate(painters):
                rt.location = ((i - 1.5) * 2.4, 0, 0)
            render(os.path.join(PREVIEW, "painters.png"), (2, -9, 4), (0, 0, 0.6), lens=45)
        clear(painters)

    if "props" in only:
        props = build_props()
        export(os.path.join(OUT_DIR, "props.glb"), props)
        if PREVIEW:
            for i, rt in enumerate(props):
                rt.location = ((i - 1) * 3, 0, 0)
            render(os.path.join(PREVIEW, "props.png"), (0, -7, 4), (0, 0, 0.3), lens=40)
        clear(props)

    if "places" in only:
        cm = common_mats()
        places = [build_square(cm), build_farm(cm), build_toys(cm)]
        # One file per playground: only the one being played is downloaded.
        for rt in places:
            export(os.path.join(OUT_DIR, f"{rt.name}.glb"), [rt])
        if PREVIEW:
            for i, rt in enumerate(places):
                for o in places:
                    o.hide_render = o is not rt
                    for c in o.children_recursive:
                        c.hide_render = o is not rt
                render(os.path.join(PREVIEW, f"{rt.name}.png"), (0, -30, 22), (0, 2, 0), lens=24)


main()
