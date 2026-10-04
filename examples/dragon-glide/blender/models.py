"""
Dragon Glide models: builds everything procedurally and exports two files:

  ../public/models/dragon.glb   Ember, the chubby baby dragon (the game clones and recolours it for the family)
  ../public/models/world.glb    sky islands, scenery, collectables and obstacles

Run with:   blender --background --python models.py
Preview:    blender --background --python models.py -- --preview /some/scratch/preview.png
Cover:      blender --background --python models.py -- --cover ../public/cover.jpg

Every model is one top-level node centred on its origin, facing Blender -Y (three.js +Z, toward the
camera when the game looks at it from the front). Node and material names the game relies on:

dragon.glb
  dragon               the baby dragon in a flying pose: head at -Y, tail at +Y, about 2.4 units long
    dragon_head        head (origin at the neck), so the game can tilt it toward where Ember is steering
      dragon_eye_l/_r  eyes (origin at their centres; the game squashes them to blink)
      dragon_jaw       lower jaw (origin at the hinge; opens for a fire puff)
      dragon_mouth     empty at the mouth: where the sparkly fire comes from
    dragon_wing_l/_r   wings (origin at the shoulder; rotating about the body axis flaps them)
    dragon_tail        tail (origin at its base; the game wags it)
  materials dragon_body, dragon_belly, dragon_wing, dragon_spike, dragon_horn are recoloured for the family

world.glb
  gem                  faceted crystal (material gem, recoloured for pink and gold gems)
  powerstar            chubby smiling rainbow star (material powerstar)
  hoop                 a ring of fluffy cloud puffs to fly through, radius 2.3 in the XZ plane (material hoop_cloud)
  lantern              paper lantern; lantern_face_sleep / lantern_face_happy are swapped when it is lit
                       (material lantern_paper glows when lit)
  rock                 sleepy floating rock with a grass tuft: a soft obstacle
  island               floating island, top surface at z=0.3, radius ~2.7 (materials island_grass, island_dirt,
                       island_rock, island_flower are recoloured per world)
  tree, pine, lollipop, gumdrop, mushroom   island decorations (lollipop is also a candy obstacle)
  windmill             windmill; windmill_blades spins (origin at the hub, blades in the XZ plane)
  castle               little castle for the sunset isles; tower is a single tall tower used as an obstacle
  nest                 twiggy nest with hatched egg shells, where the dragon family waits
  moon                 sleepy glowing moon for the night sky
  cloud                puffy cloud (material cloud)
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, "..", "public", "models")

random.seed(11)


# --- Helpers ---------------------------------------------------------------------

def rgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (0, 2, 4))


def material(name, hex_color, metallic=0.0, roughness=0.5, emission=None, strength=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if not m.node_tree:
        m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb(hex_color), 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*rgb(emission), 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return m


def link(obj, parent=None, mat=None, smooth=True):
    if mat is not None:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    if obj.type == "MESH":
        for p in obj.data.polygons:
            p.use_smooth = smooth
    return obj


def from_bmesh(name, bm, parent=None, mat=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return link(o, parent, mat, smooth)


def root(name, parent=None, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.parent = parent
    o.location = loc
    return o


def sphere(name, r, loc, parent, mat, scale=(1, 1, 1), seg=20, rings=10, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return link(o, parent, mat)


def cylinder(name, r, depth, loc, parent, mat, verts=16, rot=(0, 0, 0), r2=None, smooth=True):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o = link(o, parent, mat, smooth)
    if smooth:
        # keep the caps flat-looking: split sharp edges
        bevel(o, min(r, depth) * 0.12, 2)
    return o


def box(name, size, loc, parent, mat, rot=(0, 0, 0), round_=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link(o, parent, mat, smooth=True)
    if round_:
        bevel(o, round_, 2)
    return o


def torus(name, major, minor, loc, parent, mat, rot=(0, 0, 0), seg=32, minor_seg=10, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_segments=seg, minor_segments=minor_seg, major_radius=major,
                                     minor_radius=minor, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return link(o, parent, mat)


def bevel(obj, width, segments=3, angle=math.radians(40)):
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    methods = [i.identifier for i in mod.bl_rna.properties["limit_method"].enum_items]
    if "ANGLE" in methods:
        mod.limit_method = "ANGLE"
        mod.angle_limit = angle
    return obj


def lathe(name, profile, parent, mat, seg=24, smooth=True, wobble=None):
    """Spin (radius, z) points around Z. Radius 0 points become poles. wobble(a, z) scales the radius."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r <= 1e-5:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            ring = []
            for i in range(seg):
                a = i / seg * math.tau
                k = wobble(a, z) if wobble else 1.0
                ring.append(bm.verts.new((r * k * math.cos(a), r * k * math.sin(a), z)))
            rings.append(ring)
    for lo, hi in zip(rings, rings[1:]):
        if len(lo) == 1 and len(hi) == 1:
            continue
        if len(lo) == 1:
            for i in range(seg):
                bm.faces.new((lo[0], hi[i], hi[(i + 1) % seg]))
        elif len(hi) == 1:
            for i in range(seg):
                bm.faces.new((lo[(i + 1) % seg], lo[i], hi[0]))
        else:
            for i in range(seg):
                bm.faces.new((lo[i], lo[(i + 1) % seg], hi[(i + 1) % seg], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return from_bmesh(name, bm, parent, mat, smooth)


def slab(name, outline, thick, parent, mat, plane="XY", bevel_w=0.04):
    """An outline extruded into a thin slab with rounded edges. plane XY: outline is (x, y); XZ: (x, z)."""
    bm = bmesh.new()
    if plane == "XY":
        top = [bm.verts.new((x, y, thick / 2)) for x, y in outline]
        bot = [bm.verts.new((x, y, -thick / 2)) for x, y in outline]
    else:
        top = [bm.verts.new((x, -thick / 2, z)) for x, z in outline]
        bot = [bm.verts.new((x, thick / 2, z)) for x, z in outline]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    n = len(outline)
    for i in range(n):
        bm.faces.new((top[i], top[(i + 1) % n], bot[(i + 1) % n], bot[i]))
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = from_bmesh(name, bm, parent, mat, smooth=True)
    if bevel_w:
        bevel(o, bevel_w, 2)
    return o


def trim(obj, drop):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if drop(v.co)], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    return o


def arc(name, loc, parent, mat, width=0.1, thick=0.02, down=False, rot_y=0.0):
    """Half a torus in the XZ plane: a smile (opening up) or, with down=True, a sleepy closed eye."""
    bpy.ops.mesh.primitive_torus_add(major_segments=20, minor_segments=6, major_radius=width, minor_radius=thick,
                                     location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
    o = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    trim(o, (lambda co: co.z < -0.002) if down else (lambda co: co.z > 0.002))
    o.location = loc
    o.rotation_euler = (0, rot_y, 0)
    o.name = name
    return link(o, parent, mat)


def eye(name, loc, parent, m, r=0.08, squash=0.6):
    """A glossy eye looking out along -Y, with its sparkle parented so they blink together."""
    e = sphere(name, r, loc, parent, m["eye"], scale=(0.9, squash, 1.15), seg=16, rings=8)
    s = sphere(name + "_shine", r * 0.36, (loc[0] + r * 0.3, loc[1] - r * squash * 0.8, loc[2] + r * 0.45),
               None, m["shine"], scale=(1, 0.5, 1), seg=8, rings=5)
    s2 = sphere(name + "_shine2", r * 0.16, (loc[0] - r * 0.3, loc[1] - r * squash * 0.85, loc[2] - r * 0.35),
                None, m["shine"], scale=(1, 0.5, 1), seg=6, rings=4)
    # origin of the eye at its centre, sparkles follow it
    for c in (s, s2):
        c.parent = e
        c.location = c.location - e.location
    return e


def face(parent, m, at=(0, -1, 0), scale=1.0, sleepy=False, name="face"):
    """A cute face on a front surface at `at` (the point facing -Y)."""
    x, y, z = at
    s = scale
    g = root(name, parent)
    if sleepy:
        for side in (-1, 1):
            arc(f"{name}_eye_{side}", (x + side * 0.22 * s, y, z + 0.08 * s), g, m["eye"], width=0.08 * s, thick=0.022 * s, down=True)
    else:
        for side in (-1, 1):
            eye(f"{name}_eye_{side}", (x + side * 0.22 * s, y + 0.02 * s, z + 0.1 * s), g, m, r=0.09 * s)
    for side in (-1, 1):
        sphere(f"{name}_cheek_{side}", 0.07 * s, (x + side * 0.36 * s, y + 0.03 * s, z - 0.04 * s), g, m["cheek"],
               scale=(1, 0.4, 0.7), seg=10, rings=5)
    arc(f"{name}_smile", (x, y - 0.005, z - 0.06 * s), g, m["mouth"], width=0.09 * s if not sleepy else 0.06 * s, thick=0.022 * s)
    return g


def shared():
    return {
        "eye": material("eye", "#2a1a3a", roughness=0.15),
        "shine": material("shine", "#ffffff", roughness=0.2, emission="#ffffff", strength=0.8),
        "cheek": material("cheek", "#ff7aa8", roughness=0.6),
        "mouth": material("mouth", "#4a1f33", roughness=0.4),
    }


# --- The dragon -----------------------------------------------------------------

def dragon(m):
    d = root("dragon")
    body_m = material("dragon_body", "#4fcf8c", roughness=0.45)
    belly_m = material("dragon_belly", "#fff0c4", roughness=0.55)
    wing_m = material("dragon_wing", "#ff9ec0", roughness=0.5)
    spike_m = material("dragon_spike", "#ff8a5c", roughness=0.45)
    horn_m = material("dragon_horn", "#fff4cf", roughness=0.4)
    nose_m = material("dragon_nostril", "#2e7d57", roughness=0.5)
    tongue_m = material("dragon_tongue", "#ff5c7a", roughness=0.4)
    claw_m = material("dragon_claw", "#fff8e8", roughness=0.4)

    # Chubby body, lying along Y
    sphere("dragon_torso", 0.5, (0, 0.05, 0), d, body_m, scale=(0.95, 1.22, 0.9), seg=28, rings=14)
    sphere("dragon_tummy", 0.44, (0, -0.02, -0.12), d, belly_m, scale=(0.82, 1.15, 0.78), seg=24, rings=12)
    # Stubby arms and legs
    for s in (-1, 1):
        sphere(f"dragon_arm_{s}", 0.13, (s * 0.3, -0.36, -0.3), d, body_m, scale=(0.9, 1.1, 0.9), seg=12, rings=6)
        for k in (-1, 0, 1):
            sphere(f"dragon_arm_claw_{s}_{k}", 0.03, (s * 0.3 + k * 0.05, -0.47, -0.36), d, claw_m, seg=8, rings=4)
        sphere(f"dragon_leg_{s}", 0.17, (s * 0.33, 0.32, -0.28), d, body_m, scale=(0.9, 1.25, 0.85), seg=14, rings=7)
        sphere(f"dragon_foot_{s}", 0.12, (s * 0.35, 0.5, -0.36), d, belly_m, scale=(0.9, 1.0, 0.55), seg=12, rings=6)
        for k in (-1, 0, 1):
            sphere(f"dragon_toe_{s}_{k}", 0.035, (s * 0.35 + k * 0.055, 0.6, -0.36), d, claw_m, seg=8, rings=4)

    # Back spikes, big to small toward the tail
    for i, (y, z, r) in enumerate([(-0.3, 0.42, 0.11), (-0.05, 0.47, 0.12), (0.2, 0.44, 0.11), (0.42, 0.36, 0.09)]):
        sp = cylinder(f"dragon_spike_{i}", r, r * 2.1, (0, y, z + r * 0.7), d, spike_m, verts=12, r2=0.015, smooth=False)
        sp.rotation_euler = (math.radians(-25 - i * 8), 0, 0)
        link(sp, smooth=True)

    # Head, with its origin at the neck
    head = root("dragon_head", d, (0, -0.45, 0.22))
    hx = lambda p: (p[0], p[1] + 0.45, p[2] - 0.22)  # head-local from body-local
    sphere("dragon_skull", 0.47, hx((0, -0.78, 0.48)), head, body_m, scale=(1.05, 0.95, 0.92), seg=28, rings=14)
    sphere("dragon_snout", 0.3, hx((0, -1.13, 0.33)), head, body_m, scale=(1.05, 0.9, 0.72), seg=24, rings=12)
    sphere("dragon_snout_tip", 0.2, hx((0, -1.24, 0.28)), head, body_m, scale=(1.15, 0.75, 0.68), seg=20, rings=10)
    for s in (-1, 1):
        sphere(f"dragon_nostril_{s}", 0.03, hx((s * 0.08, -1.37, 0.35)), head, nose_m, scale=(1, 0.6, 0.8), seg=8, rings=4)
        eye(f"dragon_eye_{'l' if s < 0 else 'r'}", hx((s * 0.2, -1.12, 0.62)), head, m, r=0.13, squash=0.62)
        # eyebrows: tiny cheerful arches
        sphere(f"dragon_cheek_{s}", 0.075, hx((s * 0.33, -1.06, 0.4)), head, m["cheek"], scale=(1, 0.45, 0.7), seg=10, rings=5)
        # horns, curving back
        h = cylinder(f"dragon_horn_{s}", 0.075, 0.32, hx((s * 0.2, -0.62, 0.92)), head, horn_m, verts=12, r2=0.02, smooth=False)
        h.rotation_euler = (math.radians(-35), s * math.radians(-18), 0)
        link(h, smooth=True)
    # head spike
    hs = cylinder("dragon_head_spike", 0.09, 0.2, hx((0, -0.46, 0.86)), head, spike_m, verts=12, r2=0.015, smooth=False)
    hs.rotation_euler = (math.radians(-40), 0, 0)
    link(hs, smooth=True)
    # smile and a lower jaw that can open
    arc("dragon_smile", hx((0, -1.385, 0.25)), head, m["mouth"], width=0.11, thick=0.024)
    jaw = root("dragon_jaw", head, hx((0, -1.0, 0.2)))
    jx = lambda p: (p[0], p[1] + 1.0, p[2] - 0.2)
    sphere("dragon_chin", 0.2, (0, -0.22, -0.06), jaw, belly_m, scale=(1.0, 0.9, 0.5), seg=16, rings=8)
    sphere("dragon_tongue_tip", 0.07, (0, -0.3, 0.0), jaw, tongue_m, scale=(1.1, 1, 0.45), seg=10, rings=5)
    root("dragon_mouth", head, hx((0, -1.48, 0.28)))

    # Wings: a scalloped membrane on a bony arm, origin at the shoulder
    def wing(name, side):
        w = root(name, d, (side * 0.32, -0.12, 0.28))
        outline = [(0.0, -0.12), (0.4, -0.3), (0.85, -0.32), (1.22, -0.18), (1.28, -0.05),
                   (1.05, 0.12), (0.92, 0.06), (0.78, 0.32), (0.6, 0.2), (0.45, 0.44), (0.25, 0.3), (0.05, 0.36)]
        pts = [(side * x, y * 1.45 + 0.05) for x, y in outline]
        if side < 0:
            pts = list(reversed(pts))
        slab(name + "_skin", pts, 0.06, w, wing_m, plane="XY", bevel_w=0.025)
        # the bony leading edge and a little claw
        bone = cylinder(name + "_bone", 0.045, 1.25, (side * 0.62, -0.25, 0.02), w, body_m, verts=10, rot=(0, math.pi / 2, 0),
                        smooth=True)
        bone.rotation_euler = (0, math.pi / 2, side * math.radians(4))
        sphere(name + "_knuckle", 0.065, (side * 1.24, -0.12, 0.02), w, body_m, seg=12, rings=6)
        c = cylinder(name + "_claw", 0.04, 0.14, (side * 1.3, -0.2, 0.05), w, claw_m, verts=8, r2=0.005, smooth=False)
        c.rotation_euler = (math.radians(70), 0, 0)
        # finger bones toward each scallop
        for k, (fx, fy) in enumerate([(0.92, 0.06 * 1.45 + 0.05), (0.6, 0.2 * 1.45 + 0.05), (0.25, 0.3 * 1.45 + 0.05)]):
            ln = math.hypot(fx - 1.24, fy + 0.12)
            ang = math.atan2(fy + 0.12, fx - 1.24)
            f = cylinder(f"{name}_finger_{k}", 0.02, ln, (side * (1.24 + fx) / 2, (fy - 0.12) / 2, 0.035), w, body_m,
                         verts=8, smooth=True)
            f.rotation_euler = (0, math.pi / 2, side * ang if side > 0 else math.pi - ang)
        w.rotation_euler = (0, side * math.radians(-22), 0)
        return w

    wing("dragon_wing_l", -1)
    wing("dragon_wing_r", 1)

    # Tail: a curling chain of puffs ending in a heart-shaped tip
    tail = root("dragon_tail", d, (0, 0.55, -0.05))
    pts = [(0.27, 0.0, 0.0), (0.22, 0.25, 0.02), (0.17, 0.48, 0.08), (0.13, 0.68, 0.16), (0.1, 0.84, 0.26)]
    for i, (r, y, z) in enumerate(pts):
        sphere(f"dragon_tail_{i}", r, (0, y, z), tail, body_m, scale=(1, 1.25, 0.95), seg=16, rings=8)
        if 0 < i < 4:
            sp = cylinder(f"dragon_tail_spike_{i}", r * 0.4, r * 0.8, (0, y, z + r * 0.9), tail, spike_m, verts=10, r2=0.01,
                          smooth=False)
            sp.rotation_euler = (math.radians(-30), 0, 0)
            link(sp, smooth=True)
    heart = [(0, -0.02), (0.13, 0.08), (0.2, 0.2), (0.15, 0.3), (0.06, 0.29), (0, 0.22),
             (-0.06, 0.29), (-0.15, 0.3), (-0.2, 0.2), (-0.13, 0.08)]
    tip = slab("dragon_tail_tip", heart, 0.08, tail, spike_m, plane="XZ", bevel_w=0.03)
    tip.location = (0, 0.95, 0.22)
    tip.rotation_euler = (math.radians(-15), 0, 0)
    return d


# --- Collectables ----------------------------------------------------------------

def gem(m):
    r = root("gem")
    mat = material("gem", "#4cc9f0", roughness=0.08, metallic=0.1, emission="#1aa0d8", strength=0.35)
    g = lathe("gem_body", [(0, 0.55), (0.28, 0.5), (0.5, 0.22), (0.42, 0.06), (0.0, -0.55)], r, mat, seg=8, smooth=False)
    g.rotation_euler = (math.pi / 2, 0, 0)  # point at the camera, so the facets show
    g.rotation_euler = (0, 0, math.pi / 8)
    return r


def powerstar(m):
    r = root("powerstar")
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.tau / 10
        rad = 0.8 if i % 2 == 0 else 0.42
        pts.append((rad * math.cos(a), rad * math.sin(a)))
    s = slab("powerstar_body", pts, 0.34, r, material("powerstar", "#ffd23f", roughness=0.3, emission="#ffb000", strength=0.5),
             plane="XZ", bevel_w=0.12)
    face(r, m, at=(0, -0.3, 0.02), scale=0.62)
    return r


def hoop(m):
    r = root("hoop")
    mat = material("hoop_cloud", "#ffffff", roughness=0.85)
    puffs = []
    n = 16
    rnd = random.Random(4)
    for i in range(n):
        a = i / n * math.tau
        pr = 0.42 + 0.08 * math.sin(i * 2.3)
        p = sphere("hoop_puff", pr, (2.3 * math.cos(a), rnd.uniform(-0.05, 0.05), 2.3 * math.sin(a)), None, mat, seg=12, rings=7)
        puffs.append(p)
    ring = join(puffs, "hoop_ring")
    ring.parent = r
    # little sparkle studs that catch the light
    star_m = material("hoop_star", "#fff3a0", roughness=0.3, emission="#ffd23f", strength=1.2)
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        sphere(f"hoop_twinkle_{i}", 0.12, (2.3 * math.cos(a), -0.42, 2.3 * math.sin(a)), r, star_m, seg=8, rings=4)
    return r


def lantern(m):
    r = root("lantern")
    paper = material("lantern_paper", "#ff6f59", roughness=0.6)
    cap = material("lantern_cap", "#6b3a2a", roughness=0.6)
    tassel = material("lantern_tassel", "#ffd23f", roughness=0.6)
    lathe("lantern_body", [(0.0, -0.55), (0.32, -0.55), (0.55, -0.3), (0.62, 0.0), (0.55, 0.3), (0.32, 0.55), (0.0, 0.55)],
          r, paper, seg=24, wobble=lambda a, z: 1 + 0.05 * math.cos(12 * a))
    cylinder("lantern_top", 0.34, 0.12, (0, 0, 0.6), r, cap, verts=16)
    cylinder("lantern_bottom", 0.34, 0.12, (0, 0, -0.6), r, cap, verts=16)
    torus("lantern_loop", 0.12, 0.025, (0, 0, 0.78), r, cap, rot=(math.pi / 2, 0, 0), seg=14, minor_seg=5)
    cylinder("lantern_tassel", 0.06, 0.32, (0, 0, -0.84), r, tassel, verts=8, r2=0.1)
    face(r, m, at=(0, -0.6, 0.02), scale=0.8, sleepy=True, name="lantern_face_sleep")
    face(r, m, at=(0, -0.6, 0.02), scale=0.8, sleepy=False, name="lantern_face_happy")
    return r


# --- Obstacles ------------------------------------------------------------------

def rock(m):
    r = root("rock")
    stone = material("rock", "#a99bc9", roughness=0.8)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0)
    o = bpy.context.object
    o.name = "rock_body"
    rnd = random.Random(3)
    for v in o.data.vertices:
        n = v.co.normalized()
        k = 1 + 0.12 * math.sin(n.x * 5 + 1) * math.cos(n.y * 4) + rnd.uniform(-0.04, 0.04)
        v.co = Vector((n.x * k * 1.1, n.y * k * 0.9, n.z * k * 0.85))
    link(o, r, stone, smooth=True)
    grass = material("rock_grass", "#7bd14b", roughness=0.7)
    cap = sphere("rock_grass", 0.92, (0, 0, 0.12), r, grass, scale=(1.1, 0.9, 0.9), seg=20, rings=10)
    trim(cap, lambda co: co.z < 0.45)
    for i in range(5):
        a = i * 1.3
        b = cylinder(f"rock_blade_{i}", 0.07, 0.3, (0.4 * math.cos(a), 0.3 * math.sin(a), 0.9), r, grass, verts=6, r2=0.0,
                     smooth=False)
        b.rotation_euler = (0.3 * math.sin(a), 0.3 * math.cos(a), 0)
    face(r, m, at=(0, -0.83, 0.0), scale=1.3, sleepy=True, name="rock_face")
    return r


# --- Islands and scenery -------------------------------------------------------

def island(m):
    r = root("island")
    grass = material("island_grass", "#79d65a", roughness=0.7)
    dirt = material("island_dirt", "#c98b52", roughness=0.8)
    stone = material("island_rock", "#b08a6a", roughness=0.85)
    flower = material("island_flower", "#ffe066", roughness=0.5)
    edge = lambda a, z: 1 + 0.07 * math.sin(3 * a + 0.5) + 0.04 * math.sin(7 * a)
    lathe("island_top", [(0, 0.32), (1.6, 0.31), (2.3, 0.27), (2.65, 0.15), (2.75, 0.0), (2.68, -0.14)], r, grass, seg=28,
          wobble=edge)
    lathe("island_soil", [(2.68, -0.12), (2.6, -0.35), (2.45, -0.55), (0.0, -0.55)], r, dirt, seg=28, wobble=edge)
    rnd = random.Random(8)
    lathe("island_under", [(2.45, -0.5), (2.2, -1.1), (1.8, -1.8), (1.25, -2.5), (0.7, -3.1), (0.25, -3.6), (0, -3.7)], r,
          stone, seg=20, wobble=lambda a, z: 1 + 0.12 * math.sin(5 * a + z * 2) + 0.06 * math.cos(9 * a - z))
    # a couple of hanging pebbles
    sphere("island_pebble", 0.35, (1.2, 0.4, -3.0), r, stone, scale=(1, 1, 1.2), seg=10, rings=6)
    sphere("island_pebble2", 0.25, (-1.0, -0.6, -2.7), r, stone, seg=10, rings=6)
    # flowers dotted around the edge
    fl = []
    for i in range(9):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(1.4, 2.4)
        fl.append(sphere("f", 0.11, (d * math.cos(a), d * math.sin(a), 0.36), None, flower, scale=(1, 1, 0.6), seg=8, rings=4))
    flowers = join(fl, "island_flowers")
    flowers.parent = r
    return r


def tree(m):
    r = root("tree")
    trunk = material("tree_trunk", "#9c6a3c", roughness=0.8)
    leaf = material("tree_leaf", "#3fb85a", roughness=0.7)
    cylinder("tree_stem", 0.2, 1.4, (0, 0, 0.7), r, trunk, verts=10, r2=0.13)
    puffs = [sphere("p", 0.75, (0, 0, 1.9), None, leaf, seg=16, rings=8),
             sphere("p", 0.55, (0.55, 0.1, 1.6), None, leaf, seg=14, rings=7),
             sphere("p", 0.55, (-0.5, -0.15, 1.65), None, leaf, seg=14, rings=7),
             sphere("p", 0.5, (0.1, -0.45, 2.3), None, leaf, seg=14, rings=7)]
    j = join(puffs, "tree_crown")
    j.parent = r
    return r


def pine(m):
    r = root("pine")
    trunk = material("tree_trunk", "#9c6a3c")
    leaf = material("pine_leaf", "#2f9e6a", roughness=0.7)
    cylinder("pine_stem", 0.16, 0.8, (0, 0, 0.4), r, trunk, verts=8)
    for i, (rad, z) in enumerate([(0.95, 0.75), (0.75, 1.35), (0.5, 1.9)]):
        cylinder(f"pine_layer_{i}", rad, 0.9, (0, 0, z + 0.3), r, leaf, verts=14, r2=0.05)
    return r


def lollipop(m):
    r = root("lollipop")
    stick = material("lolly_stick", "#fff8ee", roughness=0.4)
    a_m = material("lolly_a", "#ff5c9a", roughness=0.25)
    b_m = material("lolly_b", "#fff3f8", roughness=0.25)
    cylinder("lolly_stick", 0.09, 2.6, (0, 0, 1.3), r, stick, verts=10)
    # swirly disc in the XZ plane: rings x segments, faces coloured along a spiral
    bm = bmesh.new()
    rings_n, seg = 8, 36
    R = 1.0
    th = 0.32
    cz = 3.1
    centre_f = bm.verts.new((0, -th / 2, cz))
    centre_b = bm.verts.new((0, th / 2, cz))
    front, back = [], []
    for i in range(1, rings_n + 1):
        rr = R * i / rings_n
        front.append([bm.verts.new((rr * math.cos(t), -th / 2, cz + rr * math.sin(t))) for t in (k / seg * math.tau for k in range(seg))])
        back.append([bm.verts.new((rr * math.cos(t), th / 2, cz + rr * math.sin(t))) for t in (k / seg * math.tau for k in range(seg))])

    def colour(i, k):
        return (int((k / seg * 6) + i * 0.9) % 2)

    faces = []
    for side, centre, rings in (("f", centre_f, front), ("b", centre_b, back)):
        for k in range(seg):
            f = bm.faces.new((centre, rings[0][(k + 1) % seg], rings[0][k]) if side == "f" else (centre, rings[0][k], rings[0][(k + 1) % seg]))
            faces.append((f, colour(0, k)))
        for i in range(rings_n - 1):
            for k in range(seg):
                q = (rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k])
                f = bm.faces.new(q if side == "b" else tuple(reversed(q)))
                faces.append((f, colour(i + 1, k)))
    for k in range(seg):
        f = bm.faces.new((front[-1][k], front[-1][(k + 1) % seg], back[-1][(k + 1) % seg], back[-1][k]))
        faces.append((f, 0))
    for f, c in faces:
        f.material_index = c
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("lolly_candy")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("lolly_candy", me)
    bpy.context.collection.objects.link(o)
    me.materials.append(a_m)
    me.materials.append(b_m)
    o.parent = r
    for p in me.polygons:
        p.use_smooth = False
    bevel(o, 0.08, 2, angle=math.radians(60))
    torus("lolly_bow", 0.16, 0.06, (0, 0, 2.05), r, material("lolly_bow", "#7cc6fe", roughness=0.4), seg=16, minor_seg=6)
    return r


def gumdrop(m):
    r = root("gumdrop")
    mat = material("gumdrop", "#9b5de5", roughness=0.25)
    lathe("gumdrop_body", [(0.0, 0.0), (0.55, 0.0), (0.58, 0.15), (0.48, 0.5), (0.28, 0.75), (0.0, 0.82)], r, mat, seg=20)
    sug = material("gumdrop_sugar", "#ffffff", roughness=0.4)
    rnd = random.Random(2)
    bits = []
    for i in range(10):
        a = rnd.uniform(0, math.tau)
        z = rnd.uniform(0.1, 0.65)
        rad = 0.56 - z * 0.45
        bits.append(sphere("s", 0.04, (rad * math.cos(a), rad * math.sin(a), z), None, sug, seg=6, rings=3))
    j = join(bits, "gumdrop_sugar")
    j.parent = r
    return r


def mushroom(m):
    r = root("mushroom")
    stem = material("mushroom_stem", "#fff1dc", roughness=0.6)
    cap = material("mushroom_cap", "#7cf0ff", roughness=0.4, emission="#45d8ff", strength=1.2)
    dots = material("mushroom_dots", "#ffffff", roughness=0.4, emission="#ffffff", strength=0.6)
    cylinder("mushroom_stem", 0.18, 0.7, (0, 0, 0.35), r, stem, verts=10, r2=0.13)
    c = sphere("mushroom_cap", 0.55, (0, 0, 0.7), r, cap, scale=(1, 1, 0.7), seg=18, rings=9)
    trim(c, lambda co: co.z < -0.04)
    for i in range(5):
        a = i / 5 * math.tau
        sphere(f"mushroom_dot_{i}", 0.08, (0.35 * math.cos(a), 0.35 * math.sin(a), 0.95), r, dots, scale=(1, 1, 0.5), seg=8, rings=4)
    return r


def windmill(m):
    r = root("windmill")
    wall = material("windmill_wall", "#fff4e0", roughness=0.6)
    roof = material("windmill_roof", "#ff6b6b", roughness=0.5)
    wood = material("windmill_wood", "#a0673a", roughness=0.7)
    sail = material("windmill_sail", "#fffaf2", roughness=0.7)
    lathe("windmill_tower", [(0, 0), (1.0, 0), (0.95, 0.2), (0.75, 2.8), (0.72, 3.0), (0, 3.0)], r, wall, seg=20)
    lathe("windmill_cap", [(0, 2.95), (0.92, 2.95), (0.9, 3.15), (0.6, 3.7), (0.25, 4.1), (0, 4.2)], r, roof, seg=20)
    box("windmill_door", (0.5, 0.2, 0.8), (0, -0.92, 0.4), r, wood, round_=0.05)
    box("windmill_window", (0.4, 0.15, 0.4), (0, -0.82, 1.9), r, material("windmill_glass", "#7cc6fe", roughness=0.1), round_=0.06)
    # A happy face under the roof
    face(r, m, at=(0, -0.78, 2.45), scale=0.9)
    blades = root("windmill_blades", r, (0, -0.95, 3.2))
    cylinder("windmill_hub", 0.22, 0.4, (0, 0.05, 0), blades, roof, verts=12, rot=(math.pi / 2, 0, 0))
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        arm = root(f"windmill_arm_{i}", blades)
        arm.rotation_euler = (0, -a, 0)
        box(f"windmill_spar_{i}", (2.3, 0.08, 0.1), (1.25, 0, 0), arm, wood, round_=0.02)
        box(f"windmill_sailcloth_{i}", (1.7, 0.05, 0.5), (1.4, -0.05, 0.3), arm, sail, round_=0.02)
    return r


def castle(m):
    r = root("castle")
    stone = material("castle_wall", "#ffe3c4", roughness=0.7)
    roof = material("castle_roof", "#8a63d2", roughness=0.5)
    flag = material("castle_flag", "#ff5c8a", roughness=0.6)
    door = material("castle_door", "#8a5a3a", roughness=0.7)
    win = material("castle_window", "#ffd23f", roughness=0.4, emission="#ffb000", strength=1.5)
    box("castle_keep", (2.2, 1.6, 2.2), (0, 0, 1.1), r, stone, round_=0.08)
    for i in range(5):
        box(f"castle_merlon_{i}", (0.3, 0.3, 0.3), (-0.88 + i * 0.44, -0.72, 2.35), r, stone, round_=0.04)
    box("castle_door", (0.6, 0.12, 0.9), (0, -0.8, 0.45), r, door, round_=0.1)
    box("castle_window_c", (0.3, 0.1, 0.4), (0, -0.8, 1.55), r, win, round_=0.06)
    for sx in (-1, 1):
        cylinder(f"castle_tower_{sx}", 0.6, 3.2, (sx * 1.35, 0, 1.6), r, stone, verts=16)
        cylinder(f"castle_cone_{sx}", 0.78, 1.4, (sx * 1.35, 0, 3.9), r, roof, verts=16, r2=0.02)
        cylinder(f"castle_pole_{sx}", 0.03, 0.6, (sx * 1.35, 0, 4.85), r, door, verts=6)
        slab(f"castle_flag_{sx}", [(0, 0), (0.45, -0.12), (0, -0.25)], 0.04, r, flag, plane="XZ", bevel_w=0.01).location = (sx * 1.35, 0, 5.15)
        box(f"castle_window_{sx}", (0.22, 0.1, 0.36), (sx * 1.35, -0.58, 2.2), r, win, round_=0.06)
    cylinder("castle_mid", 0.55, 1.2, (0, 0.2, 2.8), r, stone, verts=16)
    cylinder("castle_mid_cone", 0.72, 1.3, (0, 0.2, 4.05), r, roof, verts=16, r2=0.02)
    return r


def tower(m):
    r = root("tower")
    stone = material("castle_wall", "#ffe3c4")
    roof = material("castle_roof", "#8a63d2")
    flag = material("castle_flag", "#ff5c8a")
    win = material("castle_window", "#ffd23f")
    band = material("tower_band", "#f5c79e", roughness=0.7)
    lathe("tower_body", [(0, 0), (1.0, 0), (0.9, 0.3), (0.85, 5.0), (1.05, 5.1), (1.05, 5.5), (0, 5.5)], r, stone, seg=20)
    for z in (1.6, 3.3):
        torus(f"tower_band_{z}", 0.87, 0.07, (0, 0, z), r, band, seg=24, minor_seg=6)
    cylinder("tower_cone", 1.25, 2.0, (0, 0, 6.5), r, roof, verts=20, r2=0.03)
    cylinder("tower_pole", 0.04, 0.8, (0, 0, 7.8), r, material("castle_door", "#8a5a3a"), verts=6)
    f = slab("tower_flag", [(0, 0), (0.7, -0.17), (0, -0.36)], 0.05, r, flag, plane="XZ", bevel_w=0.015)
    f.location = (0, 0, 8.18)
    for i, z in enumerate((2.4, 4.2)):
        box(f"tower_window_{i}", (0.34, 0.1, 0.5), (0, -0.86, z), r, win, round_=0.08)
    face(r, m, at=(0, -0.88, 3.2), scale=1.1)
    return r


def nest(m):
    r = root("nest")
    twig_a = material("nest_twig", "#a8703f", roughness=0.85)
    twig_b = material("nest_twig_light", "#d39a5f", roughness=0.85)
    lathe("nest_bowl", [(0, 0.05), (1.3, 0.12), (1.6, 0.5), (1.55, 0.6), (1.2, 0.35), (0, 0.3)], r,
          material("nest_inside", "#7a4a26", roughness=0.9), seg=24)
    rnd = random.Random(9)
    twigs = {0: [], 1: []}
    for i in range(46):
        a = i / 46 * math.tau + rnd.uniform(-0.1, 0.1)
        z = rnd.uniform(0.15, 0.62)
        rad = 1.5 + rnd.uniform(-0.12, 0.1)
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=rnd.uniform(0.05, 0.08), depth=rnd.uniform(0.9, 1.4),
                                            location=(rad * math.cos(a), rad * math.sin(a), z),
                                            rotation=(rnd.uniform(1.2, 1.9), rnd.uniform(-0.4, 0.4), a + rnd.uniform(-0.3, 0.3)))
        twigs[i % 2].append(bpy.context.object)
    for k, mat in ((0, twig_a), (1, twig_b)):
        j = join(twigs[k], f"nest_twigs_{k}")
        link(j, r, mat, smooth=False)
    shell = material("nest_shell", "#fff6e6", roughness=0.4)
    spots = material("nest_spots", "#8fd3ff", roughness=0.5)
    for i, (x, y, rot) in enumerate([(-0.6, 0.5, 0.5), (0.7, 0.35, -0.6)]):
        s = sphere(f"nest_shell_{i}", 0.38, (0, 0, 0), None, shell, scale=(1, 1, 1.25), seg=16, rings=10)
        trim(s, lambda co: co.z > 0.05)
        # zig-zag top edge
        s.location = (x, y, 0.75)
        s.rotation_euler = (rot, 0, rot)
        link(s, r)
        for k in range(3):
            a = k * 2.1
            sphere(f"nest_spot_{i}_{k}", 0.07, (x + 0.33 * math.cos(a), y + 0.33 * math.sin(a), 0.62), r, spots,
                   scale=(1, 1, 0.5), seg=6, rings=3)
    return r


def moon(m):
    r = root("moon")
    mat = material("moon", "#fff3c4", roughness=0.6, emission="#ffe9a0", strength=0.9)
    sphere("moon_body", 1.0, (0, 0, 0), r, mat, seg=32, rings=16)
    crater = material("moon_crater", "#f2dca0", roughness=0.7, emission="#e8cf88", strength=0.6)
    for i, (x, z, s) in enumerate([(0.5, 0.5, 0.18), (-0.55, 0.45, 0.13), (0.3, -0.6, 0.15), (-0.6, -0.35, 0.1)]):
        y = -math.sqrt(max(0.0, 1 - x * x - z * z)) + 0.03
        sphere(f"moon_crater_{i}", s, (x, y, z), r, crater, scale=(1, 0.35, 1), seg=10, rings=5)
    face(r, m, at=(0, -0.98, -0.05), scale=1.6, sleepy=True, name="moon_face")
    # a nightcap!
    cap = material("moon_cap", "#5b7cfa", roughness=0.7)
    c = cylinder("moon_cap", 0.75, 1.3, (0.35, 0, 1.15), r, cap, verts=16, r2=0.05)
    c.rotation_euler = (0, math.radians(-35), 0)
    sphere("moon_pompom", 0.17, (1.0, 0, 1.55), r, material("moon_pom", "#ffffff", roughness=0.9), seg=10, rings=5)
    return r


def cloud(m):
    r = root("cloud")
    mat = material("cloud", "#ffffff", roughness=0.9)
    rnd = random.Random(6)
    puffs = [sphere("c", 1.0, (0, 0, 0), None, mat, seg=14, rings=8)]
    for i in range(6):
        a = i / 6 * math.tau
        puffs.append(sphere("c", rnd.uniform(0.55, 0.8), (1.1 * math.cos(a) * 1.4, 0.5 * math.sin(a), rnd.uniform(-0.25, 0.2)),
                            None, mat, seg=12, rings=7))
    j = join(puffs, "cloud_puffs")
    j.scale = (1, 1, 0.75)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    j.parent = r
    return r



# --- Fewer draw calls: merge each model's parts that share a material ---------------

KEEP = {"dragon_head", "dragon_jaw", "dragon_wing_l", "dragon_wing_r", "dragon_tail", "dragon_eye_l", "dragon_eye_r",
        "dragon_mouth", "windmill_blades", "lantern_face_sleep", "lantern_face_happy"}


def merge_parts(model):
    """Joins meshes with the same single material inside each kept node (the parts the game moves)."""
    groups = {}

    def walk(o, owner):
        for c in list(o.children):
            if c.name in KEEP:
                walk(c, c)
            else:
                if c.type == "MESH" and len(c.data.materials) == 1:
                    groups.setdefault((owner.name, c.data.materials[0].name), []).append(c)
                walk(c, owner)
    walk(model, model)
    for (owner, _), objs in groups.items():
        if len(objs) < 2:
            continue
        # bake modifiers (join would drop them) and move every part straight under the owner
        own = bpy.data.objects[owner]
        bpy.context.view_layer.update()
        for o in objs:
            bpy.ops.object.select_all(action="DESELECT")
            bpy.context.view_layer.objects.active = o
            o.select_set(True)
            for mod in list(o.modifiers):
                bpy.ops.object.modifier_apply(modifier=mod.name)
            mw = o.matrix_world.copy()
            o.parent = own
            o.matrix_world = mw
        bpy.context.view_layer.update()
        joined = join(objs, objs[0].name)
        joined.parent = own
    # drop empty helper nodes left with no children (face roots etc. stay if they still hold parts)

# --- Build & export --------------------------------------------------------------

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def export(roots, path):
    bpy.ops.object.select_all(action="DESELECT")
    for q in roots:
        for o in [q, *q.children_recursive]:
            o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                              export_texcoords=False)
    print(f"exported {path} ({os.path.getsize(path)} bytes)")


def build():
    clear()
    m = shared()
    os.makedirs(MODELS, exist_ok=True)
    dr = dragon(m)
    merge_parts(dr)
    export([dr], os.path.join(MODELS, "dragon.glb"))
    world = [gem(m), powerstar(m), hoop(m), lantern(m), rock(m), island(m), tree(m), pine(m), lollipop(m), gumdrop(m),
             mushroom(m), windmill(m), castle(m), tower(m), nest(m), moon(m), cloud(m)]
    for q in world:
        merge_parts(q)
    export(world, os.path.join(MODELS, "world.glb"))
    return [dr] + world


def lights_and_camera(scene, cam_loc, look, lens=50, ortho=None, sky="#9fd8ff", res=(1600, 900)):
    cam_data = bpy.data.cameras.new("cam")
    if ortho:
        cam_data.type = "ORTHO"
        cam_data.ortho_scale = ortho
    else:
        cam_data.lens = lens
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = cam_loc
    direction = Vector(look) - Vector(cam_loc)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.2
    sun.angle = math.radians(8)
    so = bpy.data.objects.new("sun", sun)
    scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), math.radians(-20), math.radians(-30))
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*rgb(sky), 1)
    bg.inputs["Strength"].default_value = 1.0
    scene.render.resolution_x, scene.render.resolution_y = res
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "CYCLES"
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = 32
    try:
        scene.view_settings.view_transform = "Standard"
    except TypeError:
        pass


def preview(roots, path):
    """Lay the models out in a grid (and Ember from the front, side and back) and render them."""
    scene = bpy.context.scene
    d = roots[0]
    cells = roots[1:]
    for i, q in enumerate(cells):
        col, row = i % 6, i // 6
        q.location = (col * 6.5 - 16, 0, -row * 7 + 2)
    d.location = (24, 0, 0)
    d.scale = (2.2, 2.2, 2.2)
    lights_and_camera(scene, (6, -60, -4), (6, 0, -4), ortho=52)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    # Ember close-ups
    for name, rot in (("front", 0), ("side", 90), ("back", 180)):
        d.location = (0, 0, 0)
        d.scale = (1, 1, 1)
        for q in cells:
            q.location.z = -100
        d.rotation_euler = (0, 0, math.radians(rot))
        lights_and_camera(scene, (0, -20, 3.0), (0, 0, 0.2), ortho=3.6)
        scene.render.filepath = path.replace(".png", f"_{name}.png")
        bpy.ops.render.render(write_still=True)
    print(f"preview written to {path}")


def cover(roots, path):
    """A sky scene for the store card: Ember flying past islands, a windmill and a cloud ring."""
    scene = bpy.context.scene
    by = {q.name: q for q in roots}
    for q in roots:
        if q.name != "dragon":
            for o in [q, *q.children_recursive]:
                o.hide_render = True
    d = by["dragon"]
    d.location = (0.6, 0, 0.2)
    d.rotation_euler = (math.radians(8), 0, math.radians(-28))
    d.scale = (1.15, 1.15, 1.15)
    for n in ("dragon_wing_l", "dragon_wing_r"):
        w = bpy.data.objects[n]
        s = -1 if n.endswith("l") else 1
        w.rotation_euler = (0, s * math.radians(-38), 0)
    bpy.data.objects["dragon_head"].rotation_euler = (math.radians(-6), 0, math.radians(10))

    def copy_tree(name):
        src = by[name]
        new_root = src.copy()
        new_root.hide_render = False
        bpy.context.collection.objects.link(new_root)

        def rec(old, new):
            for c in old.children:
                nc = c.copy()
                nc.hide_render = False
                bpy.context.collection.objects.link(nc)
                nc.parent = new
                rec(c, nc)
        rec(src, new_root)
        return new_root

    def place(name, loc, scale=1.0, rot=0.0):
        o = copy_tree(name)
        o.location = loc
        o.scale = (scale,) * 3
        o.rotation_euler = (0, 0, rot)
        return o

    isl = place("island", (-4.3, 6, -4.0), 1.1)
    place("windmill", (-4.3, 6, -3.7), 0.9, math.radians(20))
    place("island", (5.8, 14, -5.2), 1.5)
    place("tree", (4.8, 14, -4.75), 1.0)
    place("tree", (7.0, 13.2, -4.75), 0.8)
    place("island", (-9, 22, 1.5), 1.2)
    place("castle", (-9, 22, 1.8), 0.9, math.radians(15))
    place("hoop", (4.6, 7, 2.3), 0.8)
    for i, (x, y, z) in enumerate([(1.9, -2.2, 1.0), (2.7, -0.4, 1.5), (3.4, 1.8, 1.9), (4.0, 4.2, 2.2)]):
        place("gem", (x, y, z), 0.55, 0.4 * i)
    place("cloud", (-7, 10, -6), 2.4)
    place("cloud", (9, 18, 4), 2.0)
    place("cloud", (0, 30, -7), 3.0)
    place("lantern", (-1.4, 5, 3.4), 0.6)
    lights_and_camera(scene, (1.0, -8.5, 1.4), (-0.2, 4, 0.3), lens=26, sky="#8fd0ff", res=(1280, 720))
    # render with a transparent sky, then lay it over a soft gradient
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    tmp_png = path + ".tmp.png"
    scene.render.filepath = tmp_png
    bpy.ops.render.render(write_still=True)
    import numpy as np
    img = bpy.data.images.load(tmp_png)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)  # rows bottom to top
    t = np.linspace(0, 1, h)[:, None]
    stops = [(0.0, "#ffe1f0"), (0.45, "#a8dcff"), (1.0, "#4aa8ff")]

    def srgb(c):
        return np.array([int(c[i:i + 2], 16) / 255 for i in (1, 3, 5)], dtype=np.float32)
    sky = np.zeros((h, 1, 3), dtype=np.float32)
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        k = np.clip((t - p0) / (p1 - p0), 0, 1)[..., None]
        m = ((t >= p0) & (t <= p1))[..., None]
        sky = np.where(m, srgb(c0) * (1 - k) + srgb(c1) * k, sky)
    a = px[..., 3:4]
    out = px.copy()
    out[..., :3] = px[..., :3] * a + sky * (1 - a)
    out[..., 3] = 1
    img.pixels[:] = out.ravel()
    img.file_format = "JPEG"
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.quality = 88
    img.save_render(path, scene=scene)
    os.remove(tmp_png)
    print(f"cover written to {path}")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    built = build()
    if "--preview" in argv:
        preview(built, argv[argv.index("--preview") + 1])
    if "--cover" in argv:
        cover(built, argv[argv.index("--cover") + 1])
