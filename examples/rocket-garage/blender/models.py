"""
Rocket Garage models: builds everything procedurally and exports two files:

  ../public/models/parts.glb   rocket parts, pilots, flame, flag
  ../public/models/world.glb   garage, clouds, stars, space junk, destination planets

Run with:   blender --background --python models.py
Preview:    blender --background --python models.py -- --preview /some/scratch/dir
            (exports first, then renders parts.png and world.png into that folder)
Cover:      blender --background --python models.py -- --cover ../public/cover.jpg

Blender is Z up and the game camera looks along +Y (three.js: Y up, camera on +Z), so every
model faces Blender -Y. Every top-level node is one model; the game clones them by name.

ROCKET PARTS: origin at the bottom centre of the part. The stack, bottom to top, is
fins -> tank -> cabin -> nose. Each stacking part has an empty child "<name>_top" whose
height is where the next part sits.
  fins_classic, fins_star, fins_wings, fins_fish, fins_legs
      base module with the main nozzle; "<name>_flame" empty = where the flame hangs
  tank_stripes, tank_ball, tank_barrel, tank_box, tank_candy
      "<name>_sticker" empty = front surface point where a sticker goes
  cabin_porthole, cabin_bubble, cabin_tv, cabin_heart
      "<name>_pilot" empty = where the pilot's head centre goes
  nose_cone, nose_dome, nose_party, nose_star, nose_icecream, nose_crown
  booster_small, booster_big, booster_mega, booster_rainbow
      side boosters, origin at the bottom (the flame hangs from there)
  sticker_star, sticker_heart, sticker_bolt, sticker_flower, sticker_paw, sticker_smile
      flat stickers facing the camera, origin at the back centre
Materials named "paint_*" are the part's main colour: the game clones and recolours them.

PILOTS: pilot_cat, pilot_bunny, pilot_puppy, pilot_panda, pilot_frog, pilot_alien
  origin = head centre. Children the game uses (prefix = animal name):
    <a>_head     the head (a group)
    <a>_body     the space-suited body (hidden while sitting in the cabin)
    <a>_arm_l, <a>_arm_r, <a>_leg_l, <a>_leg_r   limbs, origin at the joint
    <a>_helmet   glass bubble (hidden in the cabin)
    <a>_feet     empty at the soles
flame   thruster flame, origin at its top, hanging down
flag    flag on a pole, origin at the pole bottom; flag_cloth is "paint_flag"

WORLD:
  garage           the workshop, floor top at z=0. Children: garage_pad (launch pad, top at
                   z=0.22), garage_robot, garage_robot_arm (waves; origin at shoulder),
                   garage_door_l / garage_door_r (roof hatch halves above the pad)
  cloud_a, cloud_b puffy clouds
  star             smiling collectable star
  junk_satellite, junk_boot, junk_teapot, junk_duck   silly space junk (bumping just spins you)
  dest_moon, dest_mars, dest_ringed, dest_comet, dest_alien
                   destination planets, radius 1, face toward the camera; the rocket lands on top
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

random.seed(7)

# Detail factor for round things: keeps the downloads small while staying smooth on screen
DETAIL = 0.66


def lod(n, lo=6):
    return max(lo, int(round(n * DETAIL)))


# --- Helpers ---------------------------------------------------------------------

def rgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (0, 2, 4))


def material(name, hex_color, metallic=0.0, roughness=0.5, emission=None, strength=1.0, alpha=1.0):
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
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
        methods = [i.identifier for i in m.bl_rna.properties["surface_render_method"].enum_items] \
            if "surface_render_method" in m.bl_rna.properties else []
        if "BLENDED" in methods:
            m.surface_render_method = "BLENDED"
    return m


def link(obj, parent=None, mat=None, smooth=True):
    if mat is not None:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    if smooth and obj.type == "MESH":
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def from_bmesh(name, bm, parent=None, mat=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return link(o, parent, mat, smooth)


def empty(name, parent=None, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.empty_display_size = 0.2
    if parent is not None:
        o.parent = parent
    o.location = loc
    return o


def sphere(name, r, loc, parent, mat, scale=(1, 1, 1), seg=20, rings=10, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=lod(seg, 8), ring_count=lod(rings, 4), radius=r, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return link(o, parent, mat)


def cylinder(name, r, depth, loc, parent, mat, verts=20, rot=(0, 0, 0), r2=None, smooth=True):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return link(o, parent, mat, smooth)


def box(name, size, loc, parent, mat, bev=0.05, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link(o, parent, mat, smooth=bool(bev))
    if bev:
        bevel(o, bev, 2)
    return o


def torus(name, major, minor, loc, parent, mat, rot=(0, 0, 0), seg=32, minor_seg=8, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_segments=lod(seg, 10), minor_segments=lod(minor_seg, 4), major_radius=major,
                                     minor_radius=minor, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return link(o, parent, mat)


def bevel(obj, width, segments=3, angle=math.radians(40)):
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = min(segments, 2)
    if "harden_normals" in mod.bl_rna.properties:
        mod.harden_normals = True
    methods = [i.identifier for i in mod.bl_rna.properties["limit_method"].enum_items]
    if "ANGLE" in methods:
        mod.limit_method = "ANGLE"
        mod.angle_limit = angle
    return obj


def lathe(name, profile, parent, mat, seg=32):
    """Spin a list of (radius, z) points around Z. Radius 0 points become poles."""
    seg = lod(seg, 10)
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r <= 1e-5:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z))
                          for a in (i / seg * math.tau for i in range(seg))])
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
    return from_bmesh(name, bm, parent, mat)


def banded(obj, mats, fn):
    """Give each face a material picked by fn(face centre)."""
    obj.data.materials.clear()
    for mm in mats:
        obj.data.materials.append(mm)
    for p in obj.data.polygons:
        p.material_index = fn(p.center)
    return obj


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    return o


def trim(obj, drop):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if drop(v.co)], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()


def set_origin(obj, point):
    offset = Vector(point) - obj.location
    obj.data.transform(Matrix.Translation(-offset))
    obj.location += offset


def slab(name, outline, thick, parent, mat, bev_w=0.03, axis="Y"):
    """Extrude a 2D outline (x, z) by `thick` along Y (a flat shape facing the camera)."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -thick / 2, z)) for x, z in outline]
    back = [bm.verts.new((x, thick / 2, z)) for x, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        bm.faces.new((front[i], front[(i + 1) % n], back[(i + 1) % n], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = from_bmesh(name, bm, parent, mat, smooth=True)
    if bev_w:
        bevel(o, bev_w, 2)
    return o


def puffy(pts, rim, peak, cz=0.0, cx=0.0):
    """A bmesh of an outline in XZ, thin at the rim and swelling to `peak` at the centre."""
    bm = bmesh.new()
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
    return bm


def star_pts(outer=1.0, inner=0.48, n=5):
    pts = []
    for i in range(n * 2):
        a = math.pi / 2 + i * math.pi / n
        rr = outer if i % 2 == 0 else inner
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return pts


def heart_pts(size=1.0, n=40):
    pts = []
    for i in range(n):
        t = i / n * math.tau
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 17 * size, z / 17 * size + 0.05 * size))
    return pts


def circle_pts(r, n=24, sx=1.0, sz=1.0):
    return [(r * sx * math.cos(i / n * math.tau), r * sz * math.sin(i / n * math.tau)) for i in range(n)]


def eye(name, loc, parent, r=0.07, mats=None, squash=0.55):
    e = sphere(name, r, loc, parent, mats["eye"], scale=(1, squash, 1.15), seg=14, rings=7)
    sphere(name + "_shine", r * 0.38, (loc[0] + r * 0.35, loc[1] - r * squash * 0.85, loc[2] + r * 0.45),
           parent, mats["shine"], scale=(1, 0.5, 1), seg=8, rings=5)
    return e


def smile(name, loc, parent, mat, width=0.12, thick=0.022, tilt=0.0):
    bpy.ops.mesh.primitive_torus_add(major_segments=20, minor_segments=6, major_radius=width, minor_radius=thick,
                                     location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
    o = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    trim(o, lambda co: co.z > 0.002)
    o.location = loc
    o.rotation_euler = (tilt, 0, 0)
    o.name = name
    return link(o, parent, mat)


def shared():
    return {
        "eye": material("eye", "#1d1640", roughness=0.15),
        "shine": material("shine", "#ffffff", roughness=0.2, emission="#ffffff", strength=0.6),
        "cheek": material("cheek", "#ff7aa8", roughness=0.6),
        "mouth": material("mouth", "#3a1f3d", roughness=0.4),
        "white": material("trim_white", "#fff8ee", roughness=0.35),
        "gold": material("trim_gold", "#ffc93c", metallic=0.6, roughness=0.3),
        "steel": material("trim_steel", "#a9b0c8", metallic=0.7, roughness=0.3),
        "navy": material("window_navy", "#24305e", roughness=0.2, emission="#3a4ba8", strength=0.4),
        "glass": material("window_glass", "#c8f1ff", roughness=0.05, alpha=0.3, emission="#9fe7ff", strength=0.15),
        "dark": material("trim_dark", "#3b3355", roughness=0.5),
    }


def face_on(parent, prefix, m, front_y, z=0.0, scale=1.0, sleepy=False):
    """A little face on a surface whose front is at y=front_y."""
    for s in (-1, 1):
        if sleepy:
            smile(f"{prefix}_eye_{s}", (s * 0.12 * scale, front_y - 0.005, z + 0.06 * scale), parent, m["mouth"],
                  width=0.045 * scale, thick=0.012 * scale)
        else:
            eye(f"{prefix}_eye_{s}", (s * 0.11 * scale, front_y, z + 0.05 * scale), parent, r=0.045 * scale, mats=m)
        sphere(f"{prefix}_cheek_{s}", 0.035 * scale, (s * 0.19 * scale, front_y + 0.01, z - 0.03 * scale), parent,
               m["cheek"], scale=(1, 0.4, 0.7), seg=10, rings=5)
    smile(f"{prefix}_smile", (0, front_y - 0.005, z - 0.03 * scale), parent, m["mouth"], width=0.055 * scale,
          thick=0.014 * scale)


# --- Rocket parts ------------------------------------------------------------------

R = 0.6  # standard body radius


def part_root(name, top=None):
    r = empty(name)
    if top is not None:
        empty(f"{name}_top", r, (0, 0, top))
    return r


def base_skirt(r, name, m):
    """The short body ring of a fins module, with the main nozzle under it."""
    lathe(f"{name}_skirt", [(0.0, 0.0), (0.5, 0.0), (0.56, 0.04), (R, 0.16), (R, 0.5), (0.0, 0.5)], r, m["white"], seg=36)
    torus(f"{name}_band", R + 0.005, 0.035, (0, 0, 0.42), r, m["gold"], seg=36, minor_seg=6)
    lathe(f"{name}_nozzle", [(0.0, 0.02), (0.3, 0.02), (0.33, -0.08), (0.4, -0.22), (0.35, -0.24), (0.26, -0.12), (0.0, -0.12)],
          r, m["steel"], seg=24)
    empty(f"{name}_flame", r, (0, 0, -0.2))


def fin_shape(name, outline, parent, mat, angle, thick=0.12, offset=R - 0.08):
    o = slab(name, [(offset + x, z) for x, z in outline], thick, parent, mat, bev_w=0.04)
    o.rotation_euler = (0, 0, angle)
    return o


def fins_classic(m, paint):
    name = "fins_classic"
    r = part_root(name, 0.5)
    base_skirt(r, name, m)
    outline = [(0.0, 0.62), (0.22, 0.42), (0.46, 0.05), (0.52, -0.32), (0.34, -0.26), (0.12, -0.12), (0.0, -0.08)]
    for i, a in enumerate((math.pi, 0.0, math.pi / 2)):
        fin_shape(f"{name}_fin_{i}", outline, r, paint, a)
    return r


def fins_star(m, paint):
    name = "fins_star"
    r = part_root(name, 0.5)
    base_skirt(r, name, m)
    for i, a in enumerate((math.pi, 0.0, math.pi / 2)):
        holder = empty(f"{name}_arm_{i}", r)
        holder.rotation_euler = (0, 0, a)
        slab(f"{name}_strut_{i}", [(R - 0.1, 0.32), (R + 0.2, 0.18), (R + 0.2, 0.02), (R - 0.1, 0.0)], 0.1, holder, paint, 0.03)
        st = from_bmesh(f"{name}_star_{i}", puffy([(x * 0.32 + R + 0.32, z * 0.32 + 0.05) for x, z in star_pts()], 0.06, 0.12,
                                                     cz=0.05, cx=R + 0.32), holder, paint)
        bevel(st, 0.03, 2, angle=math.radians(30))
    return r


def fins_wings(m, paint):
    name = "fins_wings"
    r = part_root(name, 0.5)
    base_skirt(r, name, m)
    wing = [(0.0, 0.55), (0.55, 0.12), (0.95, -0.12), (0.95, -0.26), (0.35, -0.12), (0.0, -0.05)]
    fin_shape(f"{name}_wing_l", wing, r, paint, math.pi, thick=0.1)
    fin_shape(f"{name}_wing_r", wing, r, paint, 0.0, thick=0.1)
    fin_shape(f"{name}_tail", [(0.0, 0.7), (0.3, 0.6), (0.38, 0.0), (0.0, -0.05)], r, paint, math.pi / 2)
    for s in (-1, 1):  # little wingtip lights
        sphere(f"{name}_tip_{s}", 0.07, (s * (R + 0.85), 0, -0.2), r,
               material("light_green" if s > 0 else "light_red", "#5cff8a" if s > 0 else "#ff5c5c", emission="#5cff8a" if s > 0 else "#ff5c5c", strength=1.2),
               seg=10, rings=5)
    return r


def fins_fish(m, paint):
    name = "fins_fish"
    r = part_root(name, 0.5)
    base_skirt(r, name, m)
    # A big fish tail: two curvy lobes splayed sideways
    lobe = [(0.0, 0.5), (0.25, 0.3), (0.5, 0.0), (0.72, -0.45), (0.55, -0.42), (0.3, -0.25), (0.1, -0.1), (0.0, -0.05)]
    fin_shape(f"{name}_lobe_l", lobe, r, paint, math.pi, thick=0.13)
    fin_shape(f"{name}_lobe_r", lobe, r, paint, 0.0, thick=0.13)
    fin_shape(f"{name}_lobe_b", [(0.0, 0.55), (0.25, 0.35), (0.4, -0.3), (0.0, -0.05)], r, paint, math.pi / 2)
    # Scales: little bumps along the skirt
    for i in range(10):
        a = i / 10 * math.tau
        sphere(f"{name}_scale_{i}", 0.08, (R * math.cos(a), R * math.sin(a), 0.28), r, paint, scale=(1, 1, 0.6), seg=10, rings=5)
    return r


def fins_legs(m, paint):
    name = "fins_legs"
    r = part_root(name, 0.5)
    base_skirt(r, name, m)
    shoe = material("shoe_white", "#ffffff", roughness=0.5)
    for i, a in enumerate((math.pi * 0.83, math.pi * 0.17, math.pi * 1.5)):
        holder = empty(f"{name}_leg_{i}", r)
        holder.rotation_euler = (0, 0, a)
        leg = cylinder(f"{name}_shin_{i}", 0.06, 0.62, (R + 0.12, 0, -0.08), holder, m["steel"], verts=10)
        leg.rotation_euler = (0, math.radians(-25), 0)
        sphere(f"{name}_knee_{i}", 0.09, (R - 0.02, 0, 0.18), holder, paint, seg=12, rings=6)
        # A chunky sneaker pointing outwards
        sphere(f"{name}_shoe_{i}", 0.17, (R + 0.3, 0, -0.38), holder, paint, scale=(1.5, 0.95, 0.6), seg=16, rings=8)
        box(f"{name}_sole_{i}", (0.5, 0.3, 0.05), (R + 0.32, 0, -0.46), holder, shoe, bev=0.02)
    return r


def tank_stripes(m, paint):
    name = "tank_stripes"
    r = part_root(name, 1.2)
    lathe(f"{name}_body", [(0.0, 0.0), (R - 0.02, 0.0), (R, 0.04), (R, 1.16), (R - 0.02, 1.2), (0.0, 1.2)], r, paint, seg=36)
    for i, z in enumerate((0.3, 0.9)):
        torus(f"{name}_stripe_{i}", R + 0.005, 0.06, (0, 0, z), r, m["white"], seg=36, minor_seg=6)
    for i in range(8):  # rivets
        a = i / 8 * math.tau + 0.2
        sphere(f"{name}_rivet_{i}", 0.03, ((R + 0.005) * math.cos(a), (R + 0.005) * math.sin(a), 1.08), r, m["steel"], seg=8, rings=4)
    empty(f"{name}_sticker", r, (0, -R - 0.01, 0.6))
    return r


def tank_ball(m, paint):
    name = "tank_ball"
    r = part_root(name, 1.3)
    rr = 0.7
    sphere(f"{name}_body", rr, (0, 0, 0.65), r, paint, scale=(1, 1, 0.93), seg=32, rings=16)
    torus(f"{name}_belt", rr * 0.995, 0.05, (0, 0, 0.65), r, m["white"], seg=36, minor_seg=6)
    cylinder(f"{name}_collar_lo", 0.5, 0.08, (0, 0, 0.04), r, m["steel"], verts=28)
    cylinder(f"{name}_collar_hi", 0.5, 0.08, (0, 0, 1.26), r, m["steel"], verts=28)
    empty(f"{name}_sticker", r, (0, -rr - 0.01, 0.82))
    return r


def tank_barrel(m, paint):
    name = "tank_barrel"
    r = part_root(name, 1.25)
    lathe(f"{name}_body", [(0.0, 0.0), (0.56, 0.0), (0.66, 0.2), (0.72, 0.62), (0.66, 1.05), (0.56, 1.25), (0.0, 1.25)], r, paint, seg=32)
    for i, (z, rr) in enumerate(((0.12, 0.61), (0.62, 0.725), (1.13, 0.61))):
        torus(f"{name}_hoop_{i}", rr, 0.045, (0, 0, z), r, m["gold"], seg=32, minor_seg=6)
    empty(f"{name}_sticker", r, (0, -0.71, 0.88))
    return r


def tank_box(m, paint):
    name = "tank_box"
    r = part_root(name, 1.15)
    b = box(f"{name}_body", (1.12, 1.12, 1.15), (0, 0, 0.575), r, paint, bev=0.16)
    b.modifiers["bevel"].segments = 3
    for i, (x, z) in enumerate(((-0.42, 0.15), (0.42, 0.15), (-0.42, 1.0), (0.42, 1.0))):
        sphere(f"{name}_bolt_{i}", 0.045, (x, -0.565, z), r, m["steel"], seg=10, rings=5)
    # A little hatch on the side, and a pressure dial
    cylinder(f"{name}_dial", 0.12, 0.04, (0.565, -0.25, 0.85), r, m["white"], verts=16, rot=(0, math.pi / 2, 0))
    empty(f"{name}_sticker", r, (0, -0.57, 0.58))
    return r


def tank_candy(m, paint):
    name = "tank_candy"
    r = part_root(name, 1.3)
    body = lathe(f"{name}_body", [(0.0, 0.0), (0.45, 0.0), (0.58, 0.08)] +
                 [(R + 0.04 * math.sin(i / 12 * math.pi * 4), 0.08 + i / 12 * 1.14) for i in range(13)] +
                 [(0.45, 1.3), (0.0, 1.3)], r, paint, seg=36)
    # Candy swirl: diagonal white stripes, picked per face by a twisted angle
    def stripe(c):
        a = math.atan2(c.y, c.x) + c.z * 3.2
        return 1 if (math.sin(a * 3) > 0.35 and 0.06 < c.z < 1.24) else 0
    banded(body, [paint, m["white"]], stripe)
    empty(f"{name}_sticker", r, (0, -0.65, 0.66))
    return r


def cabin_base(name, m, h=0.85):
    r = part_root(name, h)
    return r


def cabin_porthole(m, paint):
    name = "cabin_porthole"
    r = cabin_base(name, m, 0.85)
    lathe(f"{name}_body", [(0.0, 0.0), (R, 0.0), (R, 0.85), (0.0, 0.85)], r, m["white"], seg=36)
    torus(f"{name}_trim", R + 0.005, 0.04, (0, 0, 0.04), r, paint, seg=36, minor_seg=6)
    torus(f"{name}_trim2", R + 0.005, 0.04, (0, 0, 0.81), r, paint, seg=36, minor_seg=6)
    pz, py = 0.43, -R
    torus(f"{name}_frame", 0.31, 0.055, (0, py + 0.01, pz), r, paint, rot=(math.pi / 2, 0, 0), seg=32, minor_seg=8)
    cylinder(f"{name}_glass", 0.3, 0.06, (0, py + 0.06, pz), r, m["navy"], verts=32, rot=(math.pi / 2, 0, 0))
    for i in range(8):
        a = i / 8 * math.tau
        sphere(f"{name}_bolt_{i}", 0.025, (0.31 * math.cos(a), py - 0.05, pz + 0.31 * math.sin(a)), r, m["gold"], seg=8, rings=4)
    empty(f"{name}_pilot", r, (0, py - 0.0, pz - 0.02))
    return r


def cabin_bubble(m, paint):
    name = "cabin_bubble"
    r = cabin_base(name, m, 1.0)
    # Collar, clear glass drum, top collar; the pilot sits inside
    cylinder(f"{name}_floor", R, 0.14, (0, 0, 0.07), r, paint, verts=36)
    cylinder(f"{name}_roof", R, 0.14, (0, 0, 0.93), r, paint, verts=36)
    lathe(f"{name}_glass", [(0.0, 0.14), (R - 0.04, 0.14), (R + 0.04, 0.5), (R - 0.04, 0.86), (0.0, 0.86)], r, m["glass"], seg=36)
    cylinder(f"{name}_seat", 0.3, 0.1, (0, 0.15, 0.2), r, material("seat_red", "#ff5c7a", roughness=0.6), verts=16)
    for s in (-1, 1):
        cylinder(f"{name}_post_{s}", 0.035, 0.75, (s * (R - 0.06), 0.0, 0.5), r, m["steel"], verts=8)
    empty(f"{name}_pilot", r, (0, -0.05, 0.6))
    return r


def cabin_tv(m, paint):
    name = "cabin_tv"
    r = cabin_base(name, m, 0.9)
    lathe(f"{name}_body", [(0.0, 0.0), (R, 0.0), (R, 0.9), (0.0, 0.9)], r, m["white"], seg=36)
    pz, py = 0.46, -R
    frame = box(f"{name}_frame", (0.72, 0.1, 0.62), (0, py + 0.05, pz), r, paint, bev=0.1)
    frame.modifiers["bevel"].segments = 3
    box(f"{name}_glass", (0.58, 0.1, 0.48), (0, py, pz), r, m["navy"], bev=0.08)
    for s in (-1, 1):  # TV knobs
        sphere(f"{name}_knob_{s}", 0.05, (s * 0.28, py - 0.04, pz - 0.36), r, m["gold"], seg=10, rings=5)
        cylinder(f"{name}_aerial_{s}", 0.018, 0.4, (s * 0.25, py + 0.2, 0.98), r, m["steel"], verts=6, rot=(0, s * 0.5, 0))
    empty(f"{name}_pilot", r, (0, py - 0.0, pz - 0.03))
    return r


def cabin_heart(m, paint):
    name = "cabin_heart"
    r = cabin_base(name, m, 0.9)
    lathe(f"{name}_body", [(0.0, 0.0), (R, 0.0), (R, 0.9), (0.0, 0.9)], r, m["white"], seg=36)
    pz, py = 0.42, -R
    outer = slab(f"{name}_frame", [(x, z + pz) for x, z in heart_pts(0.4)], 0.1, r, paint, 0.03)
    outer.location.y = py + 0.04
    inner = slab(f"{name}_glass", [(x, z + pz + 0.01) for x, z in heart_pts(0.31)], 0.1, r, m["navy"], 0.02)
    inner.location.y = py + 0.0
    for i, a in enumerate((0.6, 1.6, 2.6)):
        sphere(f"{name}_dot_{i}", 0.05, (R * math.cos(a + 3.6), R * math.sin(a + 3.6), 0.78), r, paint, seg=10, rings=5)
    empty(f"{name}_pilot", r, (0, py - 0.0, pz - 0.0))
    return r


def nose_cone(m, paint):
    name = "nose_cone"
    r = part_root(name, 1.1)
    lathe(f"{name}_body", [(0.0, 0.0), (R, 0.0), (R - 0.02, 0.12), (0.52, 0.35), (0.4, 0.6), (0.25, 0.85), (0.1, 1.02), (0.0, 1.06)],
          r, paint, seg=36)
    torus(f"{name}_ring", R - 0.005, 0.04, (0, 0, 0.04), r, m["gold"], seg=36, minor_seg=6)
    cylinder(f"{name}_antenna", 0.022, 0.2, (0, 0, 1.13), r, m["steel"], verts=8)
    sphere(f"{name}_bulb", 0.07, (0, 0, 1.25), r, material("bulb_yellow", "#ffd23f", emission="#ffb703", strength=1.5), seg=12, rings=6)
    return r


def nose_dome(m, paint):
    name = "nose_dome"
    r = part_root(name, 0.7)
    s = sphere(f"{name}_body", R, (0, 0, 0), r, paint, scale=(1, 1, 1.05), seg=32, rings=16)
    trim(s, lambda co: co.z < -0.001)
    cylinder(f"{name}_lid", R, 0.02, (0, 0, 0.0), r, paint, verts=32)
    for i in range(6):
        a = i / 6 * math.tau
        sphere(f"{name}_light_{i}", 0.06, (0.43 * math.cos(a), 0.43 * math.sin(a), 0.43),
               r, material("bulb_pink", "#ff8fc7", emission="#ff5ca8", strength=1.2), seg=10, rings=5)
    cylinder(f"{name}_antenna", 0.02, 0.3, (0, 0, 0.72), r, m["steel"], verts=8)
    sphere(f"{name}_bulb", 0.07, (0, 0, 0.9), r, material("bulb_yellow", "#ffd23f"), seg=12, rings=6)
    return r


def nose_party(m, paint):
    name = "nose_party"
    r = part_root(name, 1.3)
    body = lathe(f"{name}_body", [(0.0, 0.0), (R, 0.0)] + [(R * (1 - k / 10) ** 1.1, k / 10 * 1.2) for k in range(1, 11)],
                 r, paint, seg=36)
    banded(body, [paint, m["white"]], lambda c: 1 if int(c.z * 6.5) % 2 else 0)
    # Polka dots and a fluffy pompom
    for i in range(7):
        a = i / 7 * math.tau
        h = 0.3 + (i % 3) * 0.22
        rr = R * (1 - h / 1.2) ** 1.1 + 0.01
        sphere(f"{name}_dot_{i}", 0.05, (rr * math.cos(a), rr * math.sin(a), h), r, m["gold"], scale=(1, 1, 1), seg=8, rings=4)
    puff = material("pompom", "#fff3a0", roughness=0.9)
    for i in range(7):
        a = i / 7 * math.tau
        sphere(f"{name}_pom_{i}", 0.09, (0.08 * math.cos(a), 0.08 * math.sin(a), 1.25 + 0.05 * math.sin(a * 2)), r, puff, seg=10, rings=5)
    sphere(f"{name}_pom_c", 0.12, (0, 0, 1.3), r, puff, seg=12, rings=6)
    return r


def nose_star(m, paint):
    name = "nose_star"
    r = part_root(name, 1.4)
    lathe(f"{name}_body", [(0.0, 0.0), (R, 0.0), (0.55, 0.15), (0.42, 0.4), (0.25, 0.6), (0.08, 0.72), (0.0, 0.74)], r, paint, seg=36)
    torus(f"{name}_ring", R - 0.005, 0.04, (0, 0, 0.04), r, m["white"], seg=36, minor_seg=6)
    cylinder(f"{name}_stick", 0.03, 0.3, (0, 0, 0.8), r, m["gold"], verts=8)
    st = from_bmesh(f"{name}_star", puffy([(x * 0.34, z * 0.34 + 1.1) for x, z in star_pts()], 0.06, 0.14, cz=1.1), r,
                    material("star_gold", "#ffd23f", roughness=0.3, emission="#ff9f1c", strength=0.35))
    bevel(st, 0.03, 2, angle=math.radians(30))
    face_on(r, f"{name}_face", m, -0.15, z=1.09, scale=0.9)
    return r


def nose_icecream(m, paint):
    name = "nose_icecream"
    r = part_root(name, 1.3)
    # The rocket's top is the cone rim; the soft-serve swirl is the paint colour
    cylinder(f"{name}_wafer", R, 0.18, (0, 0, 0.09), r, material("wafer", "#e8a85c", roughness=0.8), verts=36)
    for i, (rr, z) in enumerate(((0.56, 0.3), (0.45, 0.56), (0.32, 0.8), (0.18, 1.0))):
        torus(f"{name}_swirl_{i}", rr, 0.16 - i * 0.02, (0, 0, z), r, paint, rot=(0.12 * (-1) ** i, 0.08, 0), seg=32, minor_seg=10)
    sphere(f"{name}_tip", 0.12, (0, 0, 1.12), r, paint, scale=(1, 1, 1.3), seg=14, rings=7)
    sphere(f"{name}_cherry", 0.12, (0.05, 0, 1.3), r, material("cherry", "#ff2e4d", roughness=0.15), seg=14, rings=7)
    cylinder(f"{name}_stem", 0.012, 0.18, (0.1, 0, 1.47), r, material("stem", "#4caf50"), verts=6, rot=(0, 0.4, 0))
    sprinkle = [material(f"sprinkle_{i}", c, roughness=0.4) for i, c in enumerate(("#ffd23f", "#4cc9f0", "#9b5de5", "#ff5c8a"))]
    rnd = random.Random(4)
    for i in range(18):
        a = rnd.uniform(0, math.tau)
        k = rnd.randint(0, 2)
        rr, z = ((0.6, 0.3), (0.5, 0.58), (0.37, 0.82))[k]
        s = cylinder(f"{name}_sprinkle_{i}", 0.022, 0.1, (rr * math.cos(a), rr * math.sin(a), z + 0.06), r, sprinkle[i % 4], verts=6)
        s.rotation_euler = (rnd.uniform(0, 3), rnd.uniform(0, 3), 0)
    return r


def nose_crown(m, paint):
    name = "nose_crown"
    r = part_root(name, 0.95)
    cylinder(f"{name}_band", R, 0.36, (0, 0, 0.18), r, paint, verts=40)
    for i in range(6):
        a = i / 6 * math.tau + math.pi / 2
        cylinder(f"{name}_point_{i}", 0.17, 0.42, (0.5 * math.cos(a), 0.5 * math.sin(a), 0.55), r, paint, verts=12, r2=0.02)
        sphere(f"{name}_ball_{i}", 0.06, (0.5 * math.cos(a), 0.5 * math.sin(a), 0.8), r, paint, seg=10, rings=5)
    jewels = [material(f"jewel_{i}", c, roughness=0.1, emission=c, strength=0.4) for i, c in enumerate(("#ff3b6b", "#3bb5ff", "#5cff8a"))]
    for i in range(6):
        a = i / 6 * math.tau + math.pi / 2 + math.pi / 6
        sphere(f"{name}_jewel_{i}", 0.08, ((R + 0.01) * math.cos(a), (R + 0.01) * math.sin(a), 0.18), r, jewels[i % 3],
               scale=(1, 1, 1.2), seg=10, rings=5)
    sphere(f"{name}_cushion", 0.48, (0, 0, 0.36), r, material("velvet", "#9b5de5", roughness=0.9), scale=(1, 1, 0.55), seg=24, rings=10)
    return r


def booster(m, name, rr, h, paint, extra=None):
    r = part_root(name)
    lathe(f"{name}_body", [(0.0, 0.1), (rr * 0.8, 0.1), (rr, 0.2), (rr, h - rr * 1.4), (rr * 0.75, h - rr * 0.5),
                           (rr * 0.35, h - rr * 0.1), (0.0, h)], r, paint, seg=20)
    lathe(f"{name}_nozzle", [(0.0, 0.14), (rr * 0.7, 0.14), (rr * 0.85, 0.0), (rr * 0.7, 0.0), (0.0, 0.05)], r, m["steel"], seg=16)
    torus(f"{name}_band", rr + 0.005, 0.03, (0, 0, h * 0.35), r, m["white"], seg=20, minor_seg=5)
    if extra:
        extra(r)
    return r


def boosters(m, paint):
    out = [booster(m, "booster_small", 0.2, 1.0, paint), booster(m, "booster_big", 0.27, 1.35, paint)]

    def mega_extra(r):
        torus("booster_mega_band2", 0.325, 0.03, (0, 0, 1.0), r, m["white"], seg=20, minor_seg=5)
        for i, a in enumerate((0.0, math.pi)):
            fin = slab(f"booster_mega_fin_{i}", [(0.28, 0.5), (0.5, 0.15), (0.52, -0.05), (0.28, 0.12)], 0.06, r, m["gold"], 0.02)
            fin.rotation_euler = (0, 0, a)
        sphere("booster_mega_light", 0.06, (0, -0.32, 1.2), r, material("bulb_yellow", "#ffd23f"), seg=10, rings=5)
    out.append(booster(m, "booster_mega", 0.32, 1.6, paint, mega_extra))

    def rainbow_extra(r):
        body = bpy.data.objects["booster_rainbow_body"]
        cols = [material(f"rainbow_{i}", c, roughness=0.35) for i, c in
                enumerate(("#ff5c5c", "#ff9f43", "#ffd23f", "#5cd65c", "#4cc9f0", "#9b5de5"))]
        banded(body, cols, lambda c: min(5, max(0, int((c.z - 0.1) / 1.45 * 6))))
        st = from_bmesh("booster_rainbow_star", puffy([(x * 0.16, z * 0.16 + 0.75) for x, z in star_pts()], 0.03, 0.07, cz=0.75), r,
                        material("star_gold", "#ffd23f"))
        st.location.y = -0.29
    out.append(booster(m, "booster_rainbow", 0.3, 1.5, paint, rainbow_extra))
    return out


def stickers(m):
    out = []
    specs = {
        "star": (star_pts(0.2, 0.09), "#ffd23f"),
        "heart": (heart_pts(0.19), "#ff5c8a"),
        "bolt": ([(0.04, 0.22), (-0.13, -0.02), (0.0, -0.02), (-0.06, -0.22), (0.14, 0.05), (0.01, 0.05), (0.08, 0.22)], "#ffe14d"),
        "flower": ([((0.13 + 0.07 * math.cos(i / 40 * math.tau * 5)) * math.cos(i / 40 * math.tau),
                     (0.13 + 0.07 * math.cos(i / 40 * math.tau * 5)) * math.sin(i / 40 * math.tau)) for i in range(40)], "#c77dff"),
        "paw": (circle_pts(0.12, 20, 1.1, 0.9), "#8d5a3b"),
        "smile": (circle_pts(0.19, 24), "#ffd23f"),
    }
    for key, (pts, col) in specs.items():
        name = f"sticker_{key}"
        r = empty(name)
        mat = material(f"sticker_{key}_mat", col, roughness=0.35)
        # Sticker: white border, coloured shape slightly in front
        border = slab(f"{name}_border", [(x * 1.18, z * 1.18 + (0.01 if key == "heart" else 0)) for x, z in pts], 0.025, r, m["white"], 0.008)
        border.location.y = -0.012
        st = from_bmesh(f"{name}_shape", puffy(pts, 0.02, 0.045), r, mat)
        st.location.y = -0.03
        if key == "paw":
            st.location.z = -0.03
            for i, (x, z) in enumerate(((-0.13, 0.12), (-0.045, 0.18), (0.045, 0.18), (0.13, 0.12))):
                sphere(f"{name}_toe_{i}", 0.05, (x, -0.04, z), r, mat, scale=(1, 0.45, 1.15), seg=10, rings=5)
        if key == "flower":
            sphere(f"{name}_middle", 0.07, (0, -0.06, 0), r, material("sticker_yellow", "#ffd23f"), scale=(1, 0.4, 1), seg=12, rings=6)
        if key == "smile":
            for s in (-1, 1):
                sphere(f"{name}_eye_{s}", 0.025, (s * 0.06, -0.07, 0.05), r, m["eye"], scale=(1, 0.5, 1.3), seg=8, rings=4)
            smile(f"{name}_mouth", (0, -0.07, 0.0), r, m["mouth"], width=0.08, thick=0.016)
        out.append(r)
    return out


# --- Pilots ------------------------------------------------------------------------

def pilot(m, animal, fur, suit_col, head_extra, muzzle_col=None, nose_col="#ff8fab", head_scale=(1.1, 0.85, 0.95), eye_y=0.03):
    r = empty(f"pilot_{animal}")
    furm = material(f"fur_{animal}", fur, roughness=0.7)
    head = empty(f"{animal}_head", r)
    hr = 0.24
    sphere(f"{animal}_skull", hr, (0, 0, 0), head, furm, scale=head_scale, seg=22, rings=12)
    fy = -hr * head_scale[1]
    for s in (-1, 1):
        eye(f"{animal}_eye_{s}", (s * 0.085, fy + 0.02, eye_y), head, r=0.05, mats=m)
        sphere(f"{animal}_cheek_{s}", 0.04, (s * 0.15, fy + 0.035, -0.06), head, m["cheek"], scale=(1, 0.4, 0.7), seg=10, rings=5)
    if muzzle_col:
        sphere(f"{animal}_muzzle", 0.085, (0, fy + 0.02, -0.06), head, material(f"muzzle_{animal}", muzzle_col, roughness=0.7),
               scale=(1.25, 0.6, 0.8), seg=14, rings=7)
    sphere(f"{animal}_nose", 0.028, (0, fy - 0.025, -0.035), head, material(f"nose_{animal}", nose_col, roughness=0.4), seg=10, rings=5)
    smile(f"{animal}_mouth", (0, fy - 0.02, -0.075), head, m["mouth"], width=0.035, thick=0.01)
    head_extra(head, furm, fy)
    sphere(f"{animal}_helmet", 0.4, (0, 0, 0.02), r, m["glass"], seg=24, rings=12)

    # Space-suited body below the head
    body = empty(f"{animal}_body", r)
    suit = material("suit_white", "#f4f7ff", roughness=0.5)
    trimm = material(f"suit_{animal}", suit_col, roughness=0.45)
    sphere(f"{animal}_torso", 0.21, (0, 0, -0.4), body, suit, scale=(1, 0.85, 1.15), seg=18, rings=9)
    torus(f"{animal}_belt", 0.2, 0.035, (0, 0, -0.47), body, trimm, seg=20, minor_seg=5, scale=(1, 0.85, 1))
    cylinder(f"{animal}_collar", 0.17, 0.06, (0, 0, -0.2), body, trimm, verts=16)
    sphere(f"{animal}_badge", 0.05, (0, -0.18, -0.34), body, material("badge_gold", "#ffd23f", emission="#ffb703", strength=0.4),
           scale=(1, 0.4, 1), seg=10, rings=5)
    box(f"{animal}_pack", (0.26, 0.12, 0.3), (0, 0.2, -0.36), body, trimm, bev=0.05)
    for s, side in ((-1, "l"), (1, "r")):
        arm = empty(f"{animal}_arm_{side}", body, (s * 0.19, 0, -0.3))
        a = cylinder(f"{animal}_sleeve_{side}", 0.055, 0.2, (s * 0.05, 0, -0.08), arm, suit, verts=10)
        a.rotation_euler = (0, s * 0.5, 0)
        sphere(f"{animal}_hand_{side}", 0.065, (s * 0.1, 0, -0.18), arm, furm, seg=10, rings=5)
        leg = empty(f"{animal}_leg_{side}", body, (s * 0.09, 0, -0.58))
        cylinder(f"{animal}_thigh_{side}", 0.065, 0.12, (0, 0, -0.06), leg, suit, verts=10)
        sphere(f"{animal}_boot_{side}", 0.08, (0, -0.03, -0.14), leg, trimm, scale=(1, 1.3, 0.75), seg=12, rings=6)
    empty(f"{animal}_feet", r, (0, 0, -0.78))
    return r


def pilots(m):
    out = []

    def cat_ears(head, furm, fy):
        pink = material("ear_pink", "#ff8fab", roughness=0.6)
        for s in (-1, 1):
            cylinder(f"cat_ear_{s}", 0.09, 0.16, (s * 0.15, 0.0, 0.2), head, furm, verts=10, r2=0.01, rot=(0, s * -0.45, 0))
            cylinder(f"cat_ear_in_{s}", 0.05, 0.1, (s * 0.145, -0.035, 0.19), head, pink, verts=8, r2=0.005, rot=(0, s * -0.45, 0))
            for k in (-1, 1):  # whiskers
                w = cylinder(f"cat_whisker_{s}_{k}", 0.006, 0.14, (s * 0.15, fy + 0.02, -0.05 + k * 0.02), head, m["mouth"], verts=4,
                             rot=(0, math.pi / 2 + s * k * 0.15, 0))
    out.append(pilot(m, "cat", "#ff9f43", "#ff5c7a", cat_ears, muzzle_col="#fff1de"))

    def bunny_ears(head, furm, fy):
        pink = material("ear_pink", "#ff8fab", roughness=0.6)
        for s in (-1, 1):
            sphere(f"bunny_ear_{s}", 0.07, (s * 0.09, 0.02, 0.33), head, furm, scale=(0.85, 0.5, 2.6), seg=12, rings=8, rot=(0, s * 0.18, 0))
            sphere(f"bunny_ear_in_{s}", 0.04, (s * 0.088, -0.015, 0.33), head, pink, scale=(0.8, 0.4, 2.8), seg=10, rings=6, rot=(0, s * 0.18, 0))
        for s in (-1, 1):
            box(f"bunny_tooth_{s}", (0.03, 0.02, 0.04), (s * 0.017, fy + 0.0, -0.1), head, m["white"], bev=0.006)
    out.append(pilot(m, "bunny", "#f3ecff", "#9b5de5", bunny_ears, muzzle_col="#ffffff"))

    def puppy_ears(head, furm, fy):
        brown = material("puppy_brown", "#8d5a3b", roughness=0.7)
        for s in (-1, 1):
            sphere(f"puppy_ear_{s}", 0.08, (s * 0.25, 0.0, 0.02), head, brown, scale=(0.6, 0.6, 1.6), seg=12, rings=6, rot=(0, s * -0.35, 0))
        sphere("puppy_patch", 0.07, (0.085, fy + 0.03, 0.04), head, brown, scale=(1, 0.4, 1), seg=12, rings=6)
    out.append(pilot(m, "puppy", "#e8b878", "#3bb5ff", puppy_ears, muzzle_col="#fff1de", nose_col="#2a1f2d"))

    def panda_ears(head, furm, fy):
        black = material("panda_black", "#2b2838", roughness=0.7)
        for s in (-1, 1):
            sphere(f"panda_ear_{s}", 0.075, (s * 0.18, 0.02, 0.19), head, black, scale=(1, 0.6, 1), seg=12, rings=6)
            sphere(f"panda_patch_{s}", 0.07, (s * 0.085, fy + 0.035, 0.025), head, black, scale=(0.85, 0.4, 1.15), seg=12, rings=6,
                   rot=(0, s * 0.5, 0))
    out.append(pilot(m, "panda", "#ffffff", "#5cd65c", panda_ears, muzzle_col="#ffffff", nose_col="#2a1f2d"))

    def frog_bits(head, furm, fy):
        for s in (-1, 1):
            sphere(f"frog_bump_{s}", 0.09, (s * 0.1, -0.06, 0.15), head, furm, seg=14, rings=7)
    out.append(pilot(m, "frog", "#6bd66b", "#ffd23f", frog_bits, nose_col="#4caf50", head_scale=(1.25, 0.85, 0.8), eye_y=0.12))

    def alien_bits(head, furm, fy):
        pink = material("alien_pink", "#ff8fab", emission="#ff5c8a", strength=0.6)
        for s in (-1, 1):
            cylinder(f"alien_antenna_{s}", 0.014, 0.2, (s * 0.1, 0, 0.27), head, furm, verts=6, rot=(0, s * 0.35, 0))
            sphere(f"alien_antenna_ball_{s}", 0.045, (s * 0.135, 0, 0.37), head, pink, seg=10, rings=5)
    out.append(pilot(m, "alien", "#7bd389", "#9b5de5", alien_bits, nose_col="#5cb86c", head_scale=(1.15, 0.9, 1.05)))
    return out


def flame():
    outer = lathe("flame_outer", [(0.0, 0.0), (0.3, -0.05), (0.33, -0.25), (0.25, -0.55), (0.12, -0.85), (0.0, -1.0)],
                  None, material("flame_orange", "#ff7b00", emission="#ff6a00", strength=2.0), seg=16)
    inner = lathe("flame_inner", [(0.0, 0.0), (0.19, -0.04), (0.21, -0.2), (0.15, -0.42), (0.0, -0.62)],
                  None, material("flame_yellow", "#fff3a0", emission="#ffe066", strength=3.0), seg=16)
    inner.location.y = -0.05
    f = join([outer, inner], "flame")
    return f


def flag(m):
    r = empty("flag")
    cylinder("flag_pole", 0.025, 1.2, (0, 0, 0.6), r, m["steel"], verts=8)
    sphere("flag_top", 0.05, (0, 0, 1.22), r, m["gold"], seg=10, rings=5)
    cloth = empty("flag_cloth", r, (0.02, 0, 1.15))
    # A wavy cloth with a star
    bm = bmesh.new()
    cols, rows = 8, 4
    vs = [[bm.verts.new((i / cols * 0.6, 0.04 * math.sin(i / cols * math.tau), -j / rows * 0.4)) for i in range(cols + 1)] for j in range(rows + 1)]
    for j in range(rows):
        for i in range(cols):
            bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.02)
    from_bmesh("flag_fabric", bm, cloth, material("paint_flag", "#ff5c7a", roughness=0.6))
    st = from_bmesh("flag_star", puffy([(x * 0.11 + 0.3, z * 0.11 - 0.2) for x, z in star_pts()], 0.02, 0.03, cz=-0.2, cx=0.3), cloth,
                    material("star_gold", "#ffd23f"))
    st.location.y = -0.04
    return r


# --- World -------------------------------------------------------------------------

def star(m):
    r = empty("star")
    pts = star_pts()
    body = from_bmesh("star_body", puffy(pts, 0.17, 0.42), r, material("star_gold", "#ffd23f", roughness=0.3, emission="#ff9f1c", strength=0.35))
    bevel(body, 0.09, 3, angle=math.radians(30))
    for s in (-1, 1):
        eye(f"star_eye_{s}", (s * 0.16, -0.36, 0.1), r, r=0.075, mats=m)
        sphere(f"star_cheek_{s}", 0.06, (s * 0.27, -0.31, -0.06), r, m["cheek"], scale=(1, 0.35, 0.7), seg=10, rings=5)
    smile("star_smile", (0, -0.37, -0.06), r, m["mouth"], width=0.09, thick=0.022)
    return r


def cloud(name, seed):
    r = empty(name)
    white = material("cloud_white", "#ffffff", roughness=0.9)
    rnd = random.Random(seed)
    for i, (x, z, s) in enumerate(((0, 0.2, 0.75), (-0.75, 0, 0.55), (0.75, 0.0, 0.6), (-0.35, 0.45, 0.5), (0.4, 0.4, 0.55),
                                   (-1.25, -0.1, 0.38), (1.3, -0.1, 0.4))):
        sphere(f"{name}_puff_{i}", s * rnd.uniform(0.9, 1.1), (x * rnd.uniform(0.9, 1.1), rnd.uniform(-0.15, 0.15), z), r, white,
               scale=(1, 0.75, 0.85), seg=14, rings=7)
    return r


def junk(m):
    out = []
    # Satellite with a sleepy grin
    r = empty("junk_satellite")
    box("sat_body", (0.5, 0.45, 0.5), (0, 0, 0), r, material("sat_gold", "#ffc93c", metallic=0.5, roughness=0.35), bev=0.06)
    panel = material("sat_panel", "#3a6ff0", metallic=0.3, roughness=0.3, emission="#2a4fc0", strength=0.2)
    for s in (-1, 1):
        cylinder(f"sat_arm_{s}", 0.025, 0.3, (s * 0.38, 0, 0), r, m["steel"], verts=6, rot=(0, math.pi / 2, 0))
        box(f"sat_panel_{s}", (0.55, 0.04, 0.32), (s * 0.78, 0, 0), r, panel, bev=0.015)
    cylinder("sat_dish", 0.2, 0.08, (0, 0, 0.32), r, m["white"], verts=16, r2=0.06)
    face_on(r, "sat_face", m, -0.23, z=0.0, scale=1.1)
    out.append(r)
    # A lost boot
    r = empty("junk_boot")
    red = material("boot_red", "#ff5c5c", roughness=0.6)
    cylinder("boot_leg", 0.18, 0.4, (0, 0, 0.15), r, red, verts=16)
    sphere("boot_toe", 0.2, (0.18, 0, -0.08), r, red, scale=(1.5, 0.95, 0.65), seg=16, rings=8)
    box("boot_sole", (0.7, 0.36, 0.06), (0.1, 0, -0.2), r, m["white"], bev=0.025)
    torus("boot_cuff", 0.18, 0.04, (0, 0, 0.35), r, m["white"], seg=16, minor_seg=5)
    for i in range(3):
        cylinder(f"boot_lace_{i}", 0.012, 0.22, (0.05 + i * 0.03, -0.17, 0.12 - i * 0.1), r, m["white"], verts=5, rot=(0, math.pi / 2, 0))
    out.append(r)
    # A teapot
    r = empty("junk_teapot")
    blue = material("teapot_blue", "#7cc6fe", roughness=0.25)
    sphere("teapot_body", 0.3, (0, 0, 0), r, blue, scale=(1.1, 1, 0.85), seg=20, rings=10)
    cylinder("teapot_spout", 0.07, 0.35, (0.38, 0, 0.08), r, blue, verts=10, r2=0.04, rot=(0, 0.9, 0))
    torus("teapot_handle", 0.13, 0.035, (-0.33, 0, 0.03), r, blue, rot=(math.pi / 2, 0, 0), seg=16, minor_seg=5)
    sphere("teapot_lid", 0.15, (0, 0, 0.24), r, m["white"], scale=(1, 1, 0.5), seg=14, rings=6)
    sphere("teapot_knob", 0.05, (0, 0, 0.33), r, m["gold"], seg=8, rings=4)
    face_on(r, "teapot_face", m, -0.29, z=-0.02, scale=1.0, sleepy=True)
    out.append(r)
    # A rubber duck
    r = empty("junk_duck")
    yellow = material("duck_yellow", "#ffd93b", roughness=0.35)
    sphere("duck_body", 0.3, (0, 0, -0.05), r, yellow, scale=(1.3, 0.95, 0.85), seg=18, rings=9)
    sphere("duck_head", 0.18, (0.15, 0, 0.25), r, yellow, seg=16, rings=8)
    sphere("duck_beak", 0.08, (0.15, -0.18, 0.2), r, material("duck_beak", "#ff8c1a", roughness=0.4), scale=(1.3, 1, 0.55), seg=10, rings=5)
    for s in (-1, 1):
        eye(f"duck_eye_{s}", (0.15 + s * 0.07, -0.14, 0.3), r, r=0.035, mats=m)
    sphere("duck_tail", 0.1, (-0.38, 0, 0.08), r, yellow, scale=(1, 0.8, 1), seg=10, rings=5)
    out.append(r)
    return out


def planet_face(r, m, sleepy=False, z=-0.05, scale=1.0):
    def on(x, zz, lift=0.0):
        y = -math.sqrt(max(1 - x * x - zz * zz, 0.0))
        return (x, y - lift, zz)
    for s in (-1, 1):
        if sleepy:
            smile(f"{r.name}_eye_{s}", on(s * 0.28 * scale, z + 0.14 * scale, 0.01), r, m["mouth"], width=0.1 * scale, thick=0.025 * scale)
        else:
            eye(f"{r.name}_eye_{s}", on(s * 0.27 * scale, z + 0.14 * scale, -0.02), r, r=0.1 * scale, mats=m)
        c = sphere(f"{r.name}_cheek_{s}", 0.09 * scale, on(s * 0.47 * scale, z - 0.08 * scale, -0.015), r, m["cheek"],
                   scale=(1, 0.4, 0.65), seg=12, rings=6)
        c.rotation_euler = (0, 0, -s * 0.5)
    smile(f"{r.name}_smile", on(0, z - 0.1 * scale, 0.005), r, m["mouth"], width=0.12 * scale, thick=0.028 * scale)


def on_sphere(theta, phi, rad=1.0):
    """theta: angle from the top (+Z) toward +X; phi: turn around Z (0 = +X side, -90deg = front)."""
    return Vector((rad * math.sin(theta) * math.cos(phi), rad * math.sin(theta) * math.sin(phi), rad * math.cos(theta)))


def stick_on(obj, n):
    obj.rotation_euler = n.normalized().to_track_quat("Z", "Y").to_euler()


def dest_moon(m):
    r = empty("dest_moon")
    sphere("dest_moon_body", 1.0, (0, 0, 0), r, material("moon_cream", "#ece6f7", roughness=0.85), seg=40, rings=20)
    crater = material("moon_crater", "#c9c0e0", roughness=0.9)
    rnd = random.Random(11)
    for i in range(16):
        while True:
            n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
            nn = n.normalized()
            if 0.2 < n.length <= 1 and not (nn.y < -0.5 and abs(nn.z) < 0.55) and nn.z < 0.85:
                break
        s = rnd.uniform(0.1, 0.2)
        c = sphere(f"moon_crater_{i}", s, tuple(nn * 0.98), r, crater, scale=(1, 1, 0.3), seg=14, rings=6)
        stick_on(c, nn)
    planet_face(r, m, sleepy=True)
    return r


def dest_mars(m):
    r = empty("dest_mars")
    a = material("mars_red", "#ff7a4d", roughness=0.8)
    b = material("mars_dark", "#e05a3a", roughness=0.85)
    cap = material("mars_cap", "#fff4ee", roughness=0.6)
    sphere("dest_mars_body", 1.0, (0, 0, 0), r, a, seg=40, rings=20)
    polar = sphere("dest_mars_cap", 1.015, (0, 0, 0), r, cap, seg=32, rings=16)
    trim(polar, lambda co: co.z > -0.8)
    rnd = random.Random(5)
    for i in range(9):
        while True:
            n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.7, 0.8))).normalized()
            if not (n.y < -0.5 and abs(n.z) < 0.55):
                break
        p = sphere(f"mars_patch_{i}", rnd.uniform(0.25, 0.4), tuple(n * 0.93), r, b, scale=(1, 1, 0.25), seg=16, rings=8)
        stick_on(p, n)
    rock = material("mars_rock", "#b8462e", roughness=0.9)
    for i, (th, ph, s) in enumerate(((0.9, -1.0, 0.12), (1.0, -2.2, 0.1), (0.7, 2.0, 0.14), (1.3, -0.4, 0.09), (0.6, -2.6, 0.1))):
        n = on_sphere(th, ph)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=s, location=tuple(n * 0.99))
        o = bpy.context.object
        o.name = f"mars_rock_{i}"
        link(o, r, rock, smooth=False)
    # A friendly little volcano on the side
    n = on_sphere(0.95, -0.15)
    v = cylinder("mars_volcano", 0.28, 0.3, tuple(n * 1.05), r, b, verts=16, r2=0.1)
    stick_on(v, n)
    lava = sphere("mars_lava", 0.1, tuple(n * 1.21), r, material("lava", "#ffb03b", emission="#ff7b00", strength=1.5), scale=(1, 1, 0.4), seg=12, rings=6)
    stick_on(lava, n)
    planet_face(r, m)
    return r


def dest_ringed(m):
    r = empty("dest_ringed")
    a = material("ring_orange", "#ffb067", roughness=0.6)
    b = material("ring_peach", "#ffd9a8", roughness=0.6)
    c = material("ring_coral", "#ff7b8a", roughness=0.6)
    body = sphere("dest_ringed_body", 1.0, (0, 0, 0), r, None, seg=40, rings=24)
    banded(body, [a, b, c], lambda p: 2 if abs(p.z - 0.45) < 0.1 or abs(p.z + 0.55) < 0.1 else (1 if abs(p.z) > 0.75 or abs(p.z + 0.25) < 0.07 else 0))
    lathe("dest_ringed_band", [(1.35, -0.02), (2.0, -0.02), (2.0, 0.02), (1.35, 0.02), (1.35, -0.02)], r,
          material("ring_band", "#fff0c2", roughness=0.5), seg=64).rotation_euler = (math.radians(-16), math.radians(8), 0)
    lathe("dest_ringed_band2", [(1.5, -0.025), (1.62, -0.025), (1.62, 0.025), (1.5, 0.025), (1.5, -0.025)], r,
          material("ring_band2", "#c9b6ff", roughness=0.5), seg=64).rotation_euler = (math.radians(-16), math.radians(8), 0)
    planet_face(r, m, z=-0.12)
    return r


def dest_comet(m):
    r = empty("dest_comet")
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0, location=(0, 0, 0))
    o = bpy.context.object
    o.name = "dest_comet_body"
    for v in o.data.vertices:
        n = v.co.normalized()
        d = 1.0 + 0.06 * math.sin(n.x * 6 + 1) * math.cos(n.y * 5) * (0 if n.y < -0.4 else 1)
        v.co = n * d
    link(o, r, material("comet_ice", "#aee6ff", roughness=0.35))
    crystal = material("comet_crystal", "#e0fbff", roughness=0.05, emission="#7fe3ff", strength=0.6)
    for i, (th, ph, s) in enumerate(((0.8, -2.3, 0.18), (0.75, 2.4, 0.22), (1.1, -0.5, 0.15), (0.9, 0.6, 0.2), (1.3, -2.8, 0.14))):
        n = on_sphere(th, ph)
        c = cylinder(f"comet_crystal_{i}", s * 0.5, s * 2.2, tuple(n * (1.0 + s * 0.8)), r, crystal, verts=6, r2=0.0, smooth=False)
        stick_on(c, n)
    # The glowing tail streams off behind
    tail = material("comet_tail", "#bff4ff", roughness=0.5, emission="#8fe9ff", strength=1.0, alpha=0.45)
    for i, (rr, l, off) in enumerate(((0.9, 4.0, 0.0), (0.6, 3.0, 0.35), (0.5, 2.6, -0.4))):
        t = cylinder(f"comet_tail_{i}", rr, l, (0, 0, 0), r, tail, verts=16, r2=0.02)
        t.data.transform(Matrix.Translation((0, 0, l / 2)))
        t.rotation_euler = (math.radians(-70), math.radians(70 + off * 30), 0)
        t.location = (0.2, 0.4 + off * 0.2, off * 0.4)
    planet_face(r, m)
    return r


def dest_alien(m):
    r = empty("dest_alien")
    body = sphere("dest_alien_body", 1.0, (0, 0, 0), r, None, seg=40, rings=20)
    g = material("alien_grass", "#9be564", roughness=0.7)
    p = material("alien_purple", "#b48cff", roughness=0.6)
    banded(body, [g, p], lambda c: 1 if math.sin(c.x * 3.5) * math.sin(c.y * 3.5 + 1) * math.sin(c.z * 3.5 + 2) > 0.12 else 0)
    stalk = material("mush_stalk", "#fff1de", roughness=0.7)
    caps = [material("mush_red", "#ff5c7a", roughness=0.5), material("mush_teal", "#3fd5c5", roughness=0.5), material("mush_yellow", "#ffd23f", roughness=0.5)]
    dot = m["white"]
    door = material("door_purple", "#6c3fb5", roughness=0.5)
    lit = material("window_lit", "#fff3a0", emission="#ffd23f", strength=1.2)
    for i, (th, ph, s) in enumerate(((0.95, -2.5, 1.0), (0.85, -0.55, 0.85), (0.8, 1.9, 0.9))):
        n = on_sphere(th, ph)
        house = empty(f"alien_house_{i}", r)
        house.location = n * 0.97
        stick_on(house, n)
        house.scale = (s, s, s)
        cylinder(f"alien_house_stalk_{i}", 0.17, 0.36, (0, 0, 0.18), house, stalk, verts=14)
        cap = sphere(f"alien_house_cap_{i}", 0.3, (0, 0, 0.36), house, caps[i], scale=(1, 1, 0.65), seg=18, rings=9)
        trim(cap, lambda co: co.z < -0.04)
        for k in range(5):
            a = k / 5 * math.tau
            sphere(f"alien_house_dot_{i}_{k}", 0.045, (0.22 * math.cos(a), 0.22 * math.sin(a), 0.45), house, dot, scale=(1, 1, 0.5), seg=8, rings=4)
        box(f"alien_house_door_{i}", (0.1, 0.04, 0.16), (0, -0.165, 0.09), house, door, bev=0.03)
        sphere(f"alien_house_window_{i}", 0.04, (0.1, -0.15, 0.24), house, lit, scale=(1, 0.4, 1), seg=8, rings=4)
    # Lollipop trees
    for i, (th, ph) in enumerate(((1.15, -1.3), (1.05, 2.7), (1.25, 0.3))):
        n = on_sphere(th, ph)
        t = empty(f"alien_tree_{i}", r)
        t.location = n * 0.98
        stick_on(t, n)
        cylinder(f"alien_tree_trunk_{i}", 0.03, 0.3, (0, 0, 0.15), t, stalk, verts=6)
        sphere(f"alien_tree_top_{i}", 0.13, (0, 0, 0.36), t, caps[(i + 1) % 3], seg=12, rings=6)
    planet_face(r, m)
    return r


def garage(m):
    r = empty("garage")
    # Checkered floor
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=26, y_segments=14, size=1.0)
    for v in bm.verts:
        v.co.x *= 13
        v.co.y = v.co.y * 7 - 3.5
    floor = from_bmesh("garage_floor", bm, r, None, smooth=False)
    t1 = material("floor_a", "#d9e4f5", roughness=0.6)
    t2 = material("floor_b", "#b7c6e6", roughness=0.6)
    banded(floor, [t1, t2], lambda c: (int(math.floor(c.x)) + int(math.floor(c.y))) % 2)

    # Back wall with panel stripes and a roof edge
    wall_h = 8.0
    wall = box("garage_wall", (26, 0.3, wall_h), (0, 3.6, wall_h / 2), r, None, bev=0)
    wa = material("wall_cream", "#fff0d6", roughness=0.8)
    wb = material("wall_peach", "#ffd8b0", roughness=0.8)
    banded(wall, [wa, wb], lambda c: 1 if c.z < 1.2 else 0)
    stripe = material("wall_stripe", "#ff9f6b", roughness=0.7)
    box("garage_wall_stripe", (26, 0.32, 0.14), (0, 3.6, 1.2), r, stripe, bev=0)
    for i in range(-6, 7):
        box(f"garage_wall_post_{i}", (0.16, 0.36, wall_h), (i * 2.2, 3.5, wall_h / 2), r, wb, bev=0)
    # Roof beam with hazard stripes, and the hatch doors that slide apart for take-off
    beam = box("garage_beam", (26, 1.0, 0.5), (0, 3.2, wall_h + 0.1), r, None, bev=0)
    yellow = material("hazard_yellow", "#ffd23f", roughness=0.5)
    black = material("hazard_black", "#3b3355", roughness=0.5)
    banded(beam, [yellow, black], lambda c: int(math.floor((c.x + c.z) * 1.5)) % 2)
    banded_door = material("door_blue", "#5b8def", roughness=0.5)
    for s, side in ((-1, "l"), (1, "r")):
        d = box(f"garage_door_{side}", (2.4, 0.2, 2.6), (s * 1.2, 3.2, wall_h + 1.5), r, banded_door, bev=0.06)
        set_origin(d, (s * 0.0, 3.2, wall_h + 1.5))

    # Big round window with sky and a cloud
    win = empty("garage_window", r, (-4.6, 3.42, 5.0))
    torus("garage_window_frame", 1.2, 0.14, (0, 0, 0), win, material("frame_teal", "#2ec4b6", roughness=0.4), rot=(math.pi / 2, 0, 0), seg=40, minor_seg=8)
    cylinder("garage_window_sky", 1.15, 0.05, (0, 0.05, 0), win, material("window_sky", "#8fd3ff", emission="#8fd3ff", strength=0.5), verts=40, rot=(math.pi / 2, 0, 0))
    for i, (x, z, s) in enumerate(((-0.3, -0.2, 0.3), (0.05, -0.1, 0.38), (0.4, -0.25, 0.28))):
        sphere(f"garage_window_cloud_{i}", s, (x, 0.0, z), win, material("cloud_white", "#ffffff", roughness=0.9), scale=(1, 0.2, 0.8), seg=12, rings=6)
    box("garage_window_bar_h", (2.3, 0.08, 0.08), (0, -0.04, 0), win, material("frame_teal", "#2ec4b6"), bev=0)
    box("garage_window_bar_v", (0.08, 0.08, 2.3), (0, -0.04, 0), win, material("frame_teal", "#2ec4b6"), bev=0)

    # Poster: a planet with a ring
    post = empty("garage_poster", r, (4.6, 3.42, 4.6))
    box("garage_poster_paper", (1.8, 0.04, 2.3), (0, 0, 0), post, material("poster_navy", "#2a2266", roughness=0.7), bev=0.02)
    pl = sphere("garage_poster_planet", 0.45, (0, -0.05, 0.15), post, material("ring_orange", "#ffb067"), scale=(1, 0.3, 1), seg=20, rings=10)
    torus("garage_poster_ring", 0.72, 0.04, (0, -0.1, 0.15), post, material("ring_band", "#fff0c2"), rot=(0, 0.35, 0), scale=(1, 0.3, 0.35), seg=32, minor_seg=5)
    for i, (x, z) in enumerate(((-0.6, 0.8), (0.55, 0.85), (-0.5, -0.6), (0.6, -0.5), (0.0, -0.85))):
        sphere(f"garage_poster_star_{i}", 0.06, (x, -0.04, z), post, material("star_gold", "#ffd23f"), scale=(1, 0.4, 1), seg=8, rings=4)

    # Pegboard with tools
    peg = empty("garage_peg", r, (8.5, 3.42, 3.3))
    box("garage_peg_board", (3.0, 0.06, 1.8), (0, 0, 0), peg, material("peg_wood", "#e3b27a", roughness=0.8), bev=0.03)
    red = material("tool_red", "#ff5c5c", roughness=0.4)
    for i, x in enumerate((-1.0, -0.3, 0.4, 1.1)):
        box(f"garage_tool_handle_{i}", (0.12, 0.08, 0.7), (x, -0.08, -0.15), peg, red if i % 2 else material("tool_blue", "#4c8dff", roughness=0.4), bev=0.04)
        if i % 2:
            torus(f"garage_tool_head_{i}", 0.13, 0.05, (x, -0.08, 0.32), peg, m["steel"], rot=(math.pi / 2, 0, 0), seg=16, minor_seg=5)
        else:
            box(f"garage_tool_head_{i}", (0.42, 0.12, 0.16), (x, -0.08, 0.3), peg, m["steel"], bev=0.03)

    # Shelf with paint cans and a spare nose cone on the left
    shelf = empty("garage_shelf", r, (-8.4, 3.2, 2.6))
    box("garage_shelf_plank", (3.4, 0.6, 0.12), (0, 0, 0), shelf, material("peg_wood", "#e3b27a"), bev=0.03)
    box("garage_shelf_plank2", (3.4, 0.6, 0.12), (0, 0, 1.4), shelf, material("peg_wood", "#e3b27a"), bev=0.03)
    for i, (x, c) in enumerate(((-1.2, "#ff5c7a"), (-0.6, "#ffd23f"), (0.0, "#3bb5ff"), (0.6, "#5cd65c"))):
        cylinder(f"garage_can_{i}", 0.22, 0.42, (x, 0, 0.27), shelf, material(f"can_{i}", c, roughness=0.4), verts=16)
        torus(f"garage_can_lid_{i}", 0.2, 0.03, (x, 0, 0.48), shelf, m["steel"], seg=16, minor_seg=4)
    lathe("garage_spare_nose", [(0.0, 0.06), (0.4, 0.06), (0.3, 0.4), (0.15, 0.62), (0.0, 0.68)], shelf, material("can_0", "#ff5c7a"), seg=20).location = (1.3, 0, 0)
    for i, x in enumerate((-1.1, -0.2, 0.7)):
        sphere(f"garage_bolt_jar_{i}", 0.22, (x, 0, 1.68), shelf, m["glass"], scale=(1, 1, 1.15), seg=14, rings=7)
        sphere(f"garage_bolt_jar_in_{i}", 0.14, (x, 0, 1.62), shelf, m["gold"] if i % 2 else m["steel"], seg=10, rings=5)

    # Launch pad with hazard ring
    pad = empty("garage_pad", r)
    pbody = cylinder("garage_pad_body", 1.7, 0.22, (0, 0, 0.11), pad, None, verts=48)
    banded(pbody, [material("pad_grey", "#8d93ab", roughness=0.5), yellow, black],
           lambda c: 0 if c.z > 0.2 and math.hypot(c.x, c.y) < 1.45 else (1 if int(math.floor(math.atan2(c.y, c.x) / math.tau * 24)) % 2 else 2))
    cylinder("garage_pad_top", 1.35, 0.03, (0, 0, 0.225), pad, material("pad_top", "#c9d2e8", roughness=0.4), verts=48)
    for i in range(8):
        a = i / 8 * math.tau
        sphere(f"garage_pad_light_{i}", 0.06, (1.55 * math.cos(a), 1.55 * math.sin(a), 0.23), pad,
               material("pad_light", "#ff5c5c", emission="#ff3b3b", strength=1.5), seg=8, rings=4)

    # Gantry tower on the right
    gt = empty("garage_gantry", r, (3.3, 0.6, 0))
    gred = material("gantry_red", "#ff5c5c", roughness=0.45)
    for x in (-0.35, 0.35):
        for y in (-0.35, 0.35):
            cylinder(f"garage_gantry_post_{x}_{y}", 0.07, 6.5, (x, y, 3.25), gt, gred, verts=8)
    for k in range(9):
        z = 0.6 + k * 0.7
        box(f"garage_gantry_rung_{k}", (0.8, 0.07, 0.07), (0, -0.35, z), gt, m["white"], bev=0)
        box(f"garage_gantry_rung_b_{k}", (0.8, 0.07, 0.07), (0, 0.35, z), gt, m["white"], bev=0)
    box("garage_gantry_arm", (1.4, 0.18, 0.18), (-0.9, 0, 3.3), gt, gred, bev=0.03)
    sphere("garage_gantry_beacon", 0.14, (0, 0, 6.6), gt, material("pad_light", "#ff5c5c"), seg=12, rings=6)

    # Toolbox on the floor
    tb = empty("garage_toolbox", r, (-3.6, -0.8, 0))
    box("garage_toolbox_body", (1.2, 0.6, 0.6), (0, 0, 0.3), tb, red, bev=0.06)
    box("garage_toolbox_lid", (1.24, 0.64, 0.12), (0, 0, 0.64), tb, material("tool_red_dark", "#e04848"), bev=0.04)
    torus("garage_toolbox_handle", 0.22, 0.04, (0, 0, 0.72), tb, m["steel"], rot=(math.pi / 2, 0, 0), seg=16, minor_seg=5)
    box("garage_toolbox_latch", (0.16, 0.05, 0.12), (0, -0.31, 0.54), tb, m["gold"], bev=0.02)
    # Tyre stack
    for i in range(3):
        torus(f"garage_tyre_{i}", 0.42, 0.16, (-5.4, 0.4, 0.17 + i * 0.32), r, material("tyre", "#3b3355", roughness=0.8), seg=24, minor_seg=8)

    # Robot helper
    rb = empty("garage_robot", r, (5.2, -0.6, 0))
    teal = material("robot_teal", "#4fd1c5", roughness=0.35)
    box("garage_robot_body", (0.8, 0.6, 0.8), (0, 0, 0.9), rb, teal, bev=0.12)
    cylinder("garage_robot_neck", 0.08, 0.2, (0, 0, 1.38), rb, m["steel"], verts=8)
    head = box("garage_robot_head", (0.85, 0.6, 0.6), (0, 0, 1.75), rb, m["white"], bev=0.15)
    box("garage_robot_screen", (0.66, 0.05, 0.42), (0, -0.29, 1.75), rb, m["navy"], bev=0.06)
    glow = material("robot_eye", "#8ef0c8", emission="#5cffc0", strength=2.0)
    for s in (-1, 1):
        sphere(f"garage_robot_eye_{s}", 0.07, (s * 0.15, -0.32, 1.8), rb, glow, scale=(1, 0.4, 1.3), seg=10, rings=5)
        cylinder(f"garage_robot_wheel_{s}", 0.22, 0.14, (s * 0.3, 0, 0.22), rb, material("tyre", "#3b3355"), verts=16, rot=(0, math.pi / 2, 0))
    smile("garage_robot_smile", (0, -0.32, 1.66), rb, glow, width=0.1, thick=0.018)
    box("garage_robot_base", (0.6, 0.5, 0.25), (0, 0, 0.4), rb, m["steel"], bev=0.05)
    cylinder("garage_robot_antenna", 0.02, 0.25, (0, 0, 2.15), rb, m["steel"], verts=6)
    sphere("garage_robot_antenna_ball", 0.07, (0, 0, 2.3), rb, material("bulb_pink", "#ff8fc7", emission="#ff5ca8", strength=1.2), seg=10, rings=5)
    sphere("garage_robot_badge", 0.08, (0.2, -0.31, 1.05), rb, material("star_gold", "#ffd23f"), scale=(1, 0.4, 1), seg=10, rings=5)
    arm_l = empty("garage_robot_arm_l", rb, (-0.48, 0, 1.15))
    cylinder("garage_robot_arm_l_tube", 0.07, 0.5, (0, 0, -0.25), arm_l, m["steel"], verts=8)
    sphere("garage_robot_arm_l_hand", 0.12, (0, 0, -0.52), arm_l, teal, seg=10, rings=5)
    arm = empty("garage_robot_arm", rb, (0.48, 0, 1.15))
    cylinder("garage_robot_arm_tube", 0.07, 0.5, (0, 0, -0.25), arm, m["steel"], verts=8)
    sphere("garage_robot_arm_hand", 0.12, (0, 0, -0.52), arm, teal, seg=10, rings=5)
    # Wrench in the waving hand
    box("garage_robot_wrench", (0.08, 0.06, 0.4), (0, -0.05, -0.75), arm, m["steel"], bev=0.02)
    return r


# --- Build & export --------------------------------------------------------------

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def export(path, roots):
    bpy.ops.object.select_all(action="DESELECT")
    def sel(o):
        o.select_set(True)
        for c in o.children:
            sel(c)
    for o in roots:
        sel(o)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                              export_texcoords=False)
    print(f"exported {path} ({os.path.getsize(path)} bytes)")


def build():
    clear()
    m = shared()
    paint = {k: material(f"paint_{k}", c, roughness=0.35) for k, c in
             (("fins", "#ff4f6d"), ("tank", "#3bb5ff"), ("cabin", "#ffc93c"), ("nose", "#ff4f6d"), ("booster", "#ff9f43"))}
    parts = [fins_classic(m, paint["fins"]), fins_star(m, paint["fins"]), fins_wings(m, paint["fins"]),
             fins_fish(m, paint["fins"]), fins_legs(m, paint["fins"]),
             tank_stripes(m, paint["tank"]), tank_ball(m, paint["tank"]), tank_barrel(m, paint["tank"]),
             tank_box(m, paint["tank"]), tank_candy(m, paint["tank"]),
             cabin_porthole(m, paint["cabin"]), cabin_bubble(m, paint["cabin"]), cabin_tv(m, paint["cabin"]), cabin_heart(m, paint["cabin"]),
             nose_cone(m, paint["nose"]), nose_dome(m, paint["nose"]), nose_party(m, paint["nose"]), nose_star(m, paint["nose"]),
             nose_icecream(m, paint["nose"]), nose_crown(m, paint["nose"])]
    parts += boosters(m, paint["booster"])
    parts += stickers(m)
    parts += pilots(m)
    parts += [flame(), flag(m)]
    world = [garage(m), cloud("cloud_a", 1), cloud("cloud_b", 2), star(m)] + junk(m) + \
            [dest_moon(m), dest_mars(m), dest_ringed(m), dest_comet(m), dest_alien(m)]
    os.makedirs(MODELS, exist_ok=True)
    export(os.path.join(MODELS, "parts.glb"), parts)
    export(os.path.join(MODELS, "world.glb"), world)
    return parts, world


def render_setup(path, w, h):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "CYCLES"
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = 24
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.filepath = path
    try:
        scene.view_settings.view_transform = "Standard"
    except TypeError:
        pass


def add_light(scene, energy=3.5, rot=(math.radians(55), math.radians(-25), math.radians(-25))):
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = energy
    so = bpy.data.objects.new("sun", sun)
    scene.collection.objects.link(so)
    so.rotation_euler = rot
    return so


def set_world(scene, color, strength=1.0):
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*rgb(color), 1)
    bg.inputs["Strength"].default_value = strength


def hide(objs, hidden=True):
    for o in objs:
        o.hide_render = hidden
        for c in o.children_recursive:
            c.hide_render = hidden


def preview(parts, world, folder):
    """Lay the models out in rows and render them, to check the look."""
    scene = bpy.context.scene
    hide(world)
    per_row = 11
    rows = [parts[i:i + per_row] for i in range(0, len(parts), per_row)]
    for ri, row in enumerate(rows):
        for ci, q in enumerate(row):
            q.location = ((ci - (len(row) - 1) / 2) * 1.9, 0, -ri * 2.4)
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 22
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0, -30, -len(rows) * 1.2 + 1.8)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    scene.camera = cam
    add_light(scene)
    set_world(scene, "#2a2266", 1.2)
    render_setup(os.path.join(folder, "parts.png"), 1800, 1000)
    bpy.ops.render.render(write_still=True)
    hide(parts)
    hide(world, False)
    world[0].location = (0, 0, -1)
    for i, q in enumerate(world[1:]):
        q.location = ((i - 5) * 2.4, -2, 6.5)
    cam_data.type = "PERSP"
    cam_data.lens = 24
    cam.location = (0, -15, 5)
    cam.rotation_euler = (math.radians(84), 0, 0)
    render_setup(os.path.join(folder, "world.png"), 1600, 900)
    bpy.ops.render.render(write_still=True)
    print("previews written to", folder)


def find(name):
    return bpy.data.objects[name]


def place_part(name, z, x=0.0, y=0.0):
    o = find(name)
    o.location = (x, y, z)
    return o


def cover(parts, world, path):
    """A cheerful 1280x720 cover: a wacky rocket on the garage pad, a planet and stars."""
    scene = bpy.context.scene
    keep = {"garage", "star", "cloud_a", "cloud_b", "junk_duck", "fins_classic", "tank_candy",
            "cabin_porthole", "nose_party", "booster_big", "sticker_star", "pilot_cat", "flame"}
    for o in parts + world:
        hide([o], o.name not in keep)
        if o.name not in keep:
            o.location = (0, 0, -100)

    def dup(name):
        src = find(name)
        o = src.copy()
        scene.collection.objects.link(o)
        def kids(a, b):
            for c in a.children:
                cc = c.copy()
                scene.collection.objects.link(cc)
                cc.parent = b
                kids(c, cc)
        kids(src, o)
        return o

    lift = 0.7  # just lifting off the pad
    base = 0.22 + 0.48 + lift
    place_part("fins_classic", base)
    place_part("tank_candy", base + 0.5)
    place_part("cabin_porthole", base + 1.8)
    place_part("nose_party", base + 2.65)
    st = place_part("sticker_star", base + 0.5 + 0.66, y=-0.66)
    st.scale = (1.3, 1.3, 1.3)
    place_part("pilot_cat", base + 1.8 + 0.41, y=-0.6)
    find("cat_body").hide_render = True
    for c in find("cat_body").children_recursive:
        c.hide_render = True
    find("cat_helmet").hide_render = True
    place_part("booster_big", base + 0.2, x=-0.82)
    dup("booster_big").location = (0.82, 0, base + 0.2)
    f = place_part("flame", base - 0.2)
    f.scale = (1.0, 1.0, 1.1)
    for x in (-0.82, 0.82):
        ff = dup("flame") if x > 0 else find("flame").copy()
        if x < 0:
            scene.collection.objects.link(ff)
        ff.location = (x, 0, base + 0.2)
        ff.scale = (0.8, 0.8, 0.9)

    def paint(name, col):
        mat = bpy.data.materials[name]
        bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = (*rgb(col), 1)
    paint("paint_tank", "#3bb5ff")
    paint("paint_nose", "#ff8fc7")
    paint("paint_booster", "#ffd23f")
    paint("paint_cabin", "#2ec4b6")
    paint("paint_fins", "#ff4f6d")

    # Smoke billowing round the pad
    for i, (x, y, z, sc, name) in enumerate(((-1.9, -0.2, 0.55, 1.0, "cloud_a"), (1.9, -0.1, 0.5, 1.05, "cloud_b"),
                                            (-0.9, -1.0, 0.35, 0.75, "cloud_b"), (1.0, -1.1, 0.3, 0.7, "cloud_a"))):
        o = find(name) if i < 2 else dup(name)
        o.location = (x, y, z)
        o.scale = (sc, sc, sc * 0.8)
    for i, (x, z, sc) in enumerate(((-2.6, 4.6, 0.36), (2.5, 3.6, 0.32), (-3.3, 2.7, 0.26), (3.1, 5.3, 0.3), (1.7, 5.6, 0.22))):
        o = find("star") if i == 0 else dup("star")
        o.location = (x, -1.2, z)
        o.scale = (sc, sc, sc)
        o.rotation_euler = (0, 0.25 * (-1) ** i, 0)
    du = find("junk_duck")
    du.location = (-3.5, -1.6, 0.45)
    du.scale = (1.3, 1.3, 1.3)
    du.rotation_euler = (0, 0, 0.5)
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 28
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0, -10.5, 3.3)
    cam.rotation_euler = (math.radians(86), 0, 0)
    scene.camera = cam
    add_light(scene, 3.2, (math.radians(50), math.radians(-20), math.radians(-30)))
    set_world(scene, "#bfe6ff", 0.9)
    png = os.path.splitext(path)[0] + "_tmp.png"
    render_setup(png, 1280, 720)
    bpy.ops.render.render(write_still=True)
    # Convert to JPEG
    img = bpy.data.images.load(png)
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 88
    img.save_render(path, scene=scene)
    os.remove(png)
    print("cover written to", path)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p, w = build()
    if "--preview" in argv:
        preview(p, w, argv[argv.index("--preview") + 1])
    if "--cover" in argv:
        cover(p, w, os.path.abspath(argv[argv.index("--cover") + 1]))
