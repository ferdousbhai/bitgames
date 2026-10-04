"""
Star Catcher models: builds everything procedurally and exports ../public/models/space.glb.

Run with:   blender --background --python models.py
Preview:    blender --background --python models.py -- --preview /some/scratch/preview.png
            (exports first, then lays the models out in a row and renders a PNG)

Every model is one top-level node, centred on its origin, about 1-2.5 units tall, facing
Blender -Y (three.js +Z, toward the game camera). Node names the game relies on:

  rocket          the player's rocket, nose up (+Z here, +Y in three.js)
    rocket_flame  thruster flame; origin at its top, so scaling Y stretches it downward
    rocket_pilot  the kitten pilot in the porthole (the game wiggles it)
    rocket_nozzle exhaust bell (the game reads its position for the trail)
  star            chunky smiling gold star (worth 1)
    star_body     the star's yellow mesh; the game swaps its material for pink/rainbow stars
  gem             faceted blue crystal (worth 3)
  magnet          red horseshoe magnet power-up (pulls stars in)
  heart           puffy pink heart power-up (double stars for a while)
  rock            sleepy space rock: a soft obstacle, bumping it just makes the rocket dizzy
  ufo             friendly flying saucer that drifts past and drops stars
    ufo_lights    the blinking lights ring
  planet_moon, planet_ring, planet_candy, planet_ice, planet_jungle
                  backdrop worlds visited one after another (radius 1)
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "models", "space.glb")

random.seed(7)


# --- Helpers ---------------------------------------------------------------------

def rgb(hex_color):
    h = hex_color.lstrip("#")
    # sRGB -> linear, so colours match what we pick
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


def root(name):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    return o


def sphere(name, r, loc, parent, mat, scale=(1, 1, 1), seg=24, rings=12, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return link(o, parent, mat)


def cylinder(name, r, depth, loc, parent, mat, verts=24, rot=(0, 0, 0), r2=None, smooth=True):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return link(o, parent, mat, smooth)


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


def lathe(name, profile, parent, mat, seg=32):
    """Spin a list of (radius, z) points around Z. Radius 0 points become poles."""
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
    """Deletes the vertices of obj's mesh for which drop(co) is true."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if drop(v.co)], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()


def set_origin(obj, point):
    """Move the object's origin to `point` (world space) without moving the mesh."""
    offset = Vector(point) - obj.location
    obj.data.transform(Matrix.Translation(-offset))
    obj.location += offset


def eye(name, loc, parent, r=0.07, mats=None, squash=0.55):
    """A glossy black eye with a white sparkle, looking out along -Y."""
    e = sphere(name, r, loc, parent, mats["eye"], scale=(1, squash, 1.15), seg=16, rings=8)
    sphere(name + "_shine", r * 0.38, (loc[0] + r * 0.35, loc[1] - r * squash * 0.85, loc[2] + r * 0.45),
           parent, mats["shine"], scale=(1, 0.5, 1), seg=10, rings=6)
    return e


def smile(name, loc, parent, mat, width=0.12, thick=0.022, tilt=0.0):
    """Half a torus standing in the XZ plane, opening upward: a cheerful mouth."""
    bpy.ops.mesh.primitive_torus_add(major_segments=24, minor_segments=8, major_radius=width, minor_radius=thick,
                                     location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
    o = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    trim(o, lambda co: co.z > 0.002)
    o.location = loc
    o.rotation_euler = (tilt, 0, 0)
    o.name = name
    return link(o, parent, mat)


def sleepy_eye(name, loc, parent, mat, width=0.07, thick=0.018):
    """A closed, sleepy eye: a little downward arc."""
    return smile(name, loc, parent, mat, width=width, thick=thick)


# --- Shared materials ------------------------------------------------------------

def shared():
    return {
        "eye": material("eye", "#1d1640", roughness=0.15),
        "shine": material("shine", "#ffffff", roughness=0.2, emission="#ffffff", strength=0.6),
        "cheek": material("cheek", "#ff7aa8", roughness=0.6),
        "mouth": material("mouth", "#3a1f3d", roughness=0.4),
    }


# --- Rocket ----------------------------------------------------------------------

def rocket(m):
    r = root("rocket")
    cream = material("rocket_white", "#fff6e8", roughness=0.35)
    red = material("rocket_red", "#ff4f6d", roughness=0.35)
    teal = material("rocket_teal", "#2ec4b6", roughness=0.35)
    gold = material("rocket_gold", "#ffc93c", metallic=0.6, roughness=0.3)
    navy = material("rocket_navy", "#24305e", roughness=0.25, emission="#3a4ba8", strength=0.4)
    grey = material("rocket_grey", "#8d93ab", metallic=0.7, roughness=0.35)

    # Body: a plump egg-shaped hull
    body = lathe("rocket_body", [
        (0.0, -0.92), (0.30, -0.92), (0.46, -0.85), (0.58, -0.6), (0.64, -0.25), (0.64, 0.1),
        (0.6, 0.38), (0.53, 0.58),
    ], r, cream, seg=40)
    # Nose cone, red, rounded tip
    nose = lathe("rocket_nose", [
        (0.535, 0.56), (0.5, 0.7), (0.42, 0.9), (0.3, 1.08), (0.17, 1.22), (0.06, 1.3), (0.0, 1.32),
    ], r, red, seg=40)
    # Little antenna ball on the tip
    cylinder("rocket_antenna", 0.025, 0.2, (0, 0, 1.4), r, grey, verts=10)
    sphere("rocket_antenna_ball", 0.08, (0, 0, 1.52), r, material("rocket_bulb", "#ffd23f", emission="#ffb703", strength=1.5))
    # Stripes
    torus("rocket_band", 0.645, 0.05, (0, 0, -0.42), r, teal, seg=48, minor_seg=10)
    torus("rocket_band_top", 0.56, 0.04, (0, 0, 0.56), r, gold, seg=48, minor_seg=8)

    # Fins: a curvy outline extruded and beveled, three around the body (one at the back)
    def fin(name, angle):
        bm = bmesh.new()
        outline = [(0.0, 0.25), (0.25, 0.05), (0.52, -0.38), (0.6, -0.78), (0.42, -0.72), (0.18, -0.6), (0.0, -0.55)]
        top = [bm.verts.new((0.5 + x, 0.07, z - 0.35)) for x, z in outline]
        bot = [bm.verts.new((0.5 + x, -0.07, z - 0.35)) for x, z in outline]
        bm.faces.new(top)
        bm.faces.new(list(reversed(bot)))
        n = len(outline)
        for i in range(n):
            bm.faces.new((top[i], top[(i + 1) % n], bot[(i + 1) % n], bot[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        o = from_bmesh(name, bm, r, red, smooth=True)
        bevel(o, 0.05, 3)
        o.rotation_euler = (0, 0, angle)
        return o

    fin("rocket_fin_l", math.pi)            # points -X
    fin("rocket_fin_r", 0.0)                # points +X
    fin("rocket_fin_back", math.pi / 2)     # points +Y (away from camera)

    # Nozzle bell
    lathe("rocket_nozzle", [(0.0, -0.9), (0.3, -0.9), (0.33, -1.0), (0.4, -1.12), (0.36, -1.14), (0.27, -1.04), (0.0, -1.04)], r, grey, seg=32)

    # Porthole: a big gold-rimmed window so Kitty reads at phone size. The glass and a gold
    # collar reach back into the hull, so there is no gap when the rocket banks and rolls.
    pz = 0.09
    py = -0.6
    torus("rocket_window_frame", 0.4, 0.065, (0, py, pz), r, gold, rot=(math.pi / 2, 0, 0), seg=48, minor_seg=12)
    cylinder("rocket_window_collar", 0.45, 0.3, (0, py + 0.17, pz), r, gold, verts=48, rot=(math.pi / 2, 0, 0))
    cylinder("rocket_window", 0.4, 0.3, (0, py + 0.15, pz), r, navy, verts=48, rot=(math.pi / 2, 0, 0))
    pilot = root("rocket_pilot")
    pilot.parent = r
    pilot.location = (0, py - 0.02, pz - 0.06)
    pilot.scale = (1.55, 1.55, 1.55)
    fur = material("pilot_fur", "#ff9f43", roughness=0.7)
    muzzle = material("pilot_muzzle", "#fff1de", roughness=0.7)
    pink = material("pilot_pink", "#ff8fab", roughness=0.6)
    sphere("pilot_head", 0.19, (0, 0, 0), pilot, fur, scale=(1.1, 0.7, 0.95))
    for s in (-1, 1):
        cylinder(f"pilot_ear_{s}", 0.08, 0.14, (s * 0.12, 0.0, 0.18), pilot, fur, verts=12, r2=0.01,
                 rot=(0, s * -0.45, 0))
        cylinder(f"pilot_ear_in_{s}", 0.045, 0.09, (s * 0.115, -0.03, 0.17), pilot, pink, verts=10, r2=0.005,
                 rot=(0, s * -0.45, 0))
        eye(f"pilot_eye_{s}", (s * 0.075, -0.115, 0.03), pilot, r=0.045, mats=m)
        sphere(f"pilot_cheek_{s}", 0.035, (s * 0.13, -0.105, -0.05), pilot, m["cheek"], scale=(1, 0.4, 0.7), seg=12, rings=6)
    sphere("pilot_muzzle", 0.07, (0, -0.12, -0.05), pilot, muzzle, scale=(1.2, 0.6, 0.8), seg=16, rings=8)
    sphere("pilot_nose", 0.022, (0, -0.165, -0.025), pilot, pink, seg=10, rings=6)
    # Bubble helmet rim: a white ring around the kitten
    torus("pilot_helmet", 0.235, 0.018, (0, 0.0, 0.02), pilot, material("pilot_helmet", "#e8f6ff", roughness=0.2),
          rot=(math.pi / 2, 0, 0), seg=32, minor_seg=6)

    # Flame: outer orange, inner yellow; origin at its top so the game can stretch it
    outer = lathe("flame_outer", [(0.0, -1.0), (0.3, -1.05), (0.33, -1.25), (0.25, -1.55), (0.12, -1.85), (0.0, -2.0)],
                  None, material("flame_orange", "#ff7b00", emission="#ff6a00", strength=2.0), seg=20)
    inner = lathe("flame_inner", [(0.0, -1.0), (0.19, -1.04), (0.21, -1.2), (0.15, -1.42), (0.0, -1.62)],
                  None, material("flame_yellow", "#fff3a0", emission="#ffe066", strength=3.0), seg=20)
    inner.location.y = -0.05  # slightly in front so it reads from the camera
    flame = join([outer, inner], "rocket_flame")
    flame.parent = r
    set_origin(flame, (0, 0, -1.02))
    return r


# --- Collectables -----------------------------------------------------------------

def puffy(pts, rim, peak, cz=0.0):
    """A bmesh of an outline in XZ, rim thick at the edge and swelling to peak at (0, cz)."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -rim, z)) for x, z in pts]
    back = [bm.verts.new((x, rim, z)) for x, z in pts]
    cf = bm.verts.new((0, -peak, cz))
    cb = bm.verts.new((0, peak, cz))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((cf, front[j], front[i]))
        bm.faces.new((cb, back[i], back[j]))
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def star_mesh(name, outer=1.0, inner=0.48, rim=0.17, peak=0.42):
    """A puffy 5-point star in XZ: thick in the middle, thinner at the points, facing -Y."""
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        rr = outer if i % 2 == 0 else inner
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    o = from_bmesh(name, puffy(pts, rim, peak))
    bevel(o, 0.09, 3, angle=math.radians(30))
    return o, pts, rim, peak


def front_depth(pts, rim, peak, x, z):
    """How far forward (-Y) the star's front face is at (x, z)."""
    ang = math.atan2(z, x)
    rho = math.hypot(x, z)
    for i in range(10):
        (x1, z1), (x2, z2) = pts[i], pts[(i + 1) % 10]
        # Intersect the ray from the centre with this edge
        dx, dz = x2 - x1, z2 - z1
        ux, uz = math.cos(ang), math.sin(ang)
        det = ux * -dz - uz * -dx
        if abs(det) < 1e-9:
            continue
        t = (x1 * -dz - z1 * -dx) / det
        s = (ux * z1 - uz * x1) / det
        if t > 0 and 0 <= s <= 1:
            return -(peak - (peak - rim) * rho / t)
    return -rim


def star(m):
    r = root("star")
    body, pts, rim, peak = star_mesh("star_body")
    link(body, r, material("star_gold", "#ffd23f", roughness=0.3, emission="#ff9f1c", strength=0.35))
    for s in (-1, 1):
        x, z = s * 0.16, 0.1
        eye(f"star_eye_{s}", (x, front_depth(pts, rim, peak, x, z) - 0.01, z), r, r=0.075, mats=m)
        x, z = s * 0.27, -0.06
        sphere(f"star_cheek_{s}", 0.06, (x, front_depth(pts, rim, peak, x, z) + 0.01, z), r, m["cheek"],
               scale=(1, 0.35, 0.7), seg=12, rings=6)
    smile("star_smile", (0, front_depth(pts, rim, peak, 0, -0.06) - 0.015, -0.06), r, m["mouth"], width=0.09, thick=0.022)
    return r


def gem(m):
    r = root("gem")
    bm = bmesh.new()
    n = 8
    table = [bm.verts.new((0.32 * math.cos(i / n * math.tau), 0.32 * math.sin(i / n * math.tau), 0.42)) for i in range(n)]
    girdle = [bm.verts.new((0.62 * math.cos((i + 0.5) / n * math.tau), 0.62 * math.sin((i + 0.5) / n * math.tau), 0.15)) for i in range(n)]
    tip = bm.verts.new((0, 0, -0.75))
    bm.faces.new(table)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((table[i], girdle[i], table[j]))
        bm.faces.new((girdle[i], girdle[j], table[j]))
        bm.faces.new((girdle[i], tip, girdle[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    g = from_bmesh("gem_body", bm, r, material("gem_blue", "#4cc9f0", metallic=0.1, roughness=0.12, emission="#2a7fff", strength=0.45), smooth=False)
    bevel(g, 0.02, 1, angle=math.radians(10))
    g.rotation_euler = (0, 0, math.pi / 8)
    # A white glint facet
    sphere("gem_glint", 0.06, (-0.14, -0.3, 0.3), r, m["shine"], scale=(1, 0.4, 1), seg=10, rings=6)
    return r


def magnet(m):
    r = root("magnet")
    red = material("magnet_red", "#ff3b5c", roughness=0.35)
    steel = material("magnet_steel", "#e9eef7", metallic=0.8, roughness=0.25)
    bpy.ops.mesh.primitive_torus_add(major_segments=32, minor_segments=14, major_radius=0.42, minor_radius=0.17,
                                     location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
    arc = bpy.context.object
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    trim(arc, lambda co: co.z < -0.001)
    arc.name = "magnet_arc"
    link(arc, r, red)
    arc.location.z = 0.2
    for s in (-1, 1):
        bevel(cylinder(f"magnet_leg_{s}", 0.17, 0.4, (s * 0.42, 0, 0.0), r, red, verts=20), 0.03, 2)
        bevel(cylinder(f"magnet_tip_{s}", 0.175, 0.26, (s * 0.42, 0, -0.33), r, steel, verts=20), 0.03, 2)
    # Eyes sit on the arc's front surface
    eye("magnet_eye_l", (-0.12, -0.17, 0.55), r, r=0.06, mats=m)
    eye("magnet_eye_r", (0.12, -0.17, 0.55), r, r=0.06, mats=m)
    return r


def heart(m):
    r = root("heart")
    pink = material("heart_pink", "#ff5c8a", roughness=0.3, emission="#ff2e63", strength=0.3)
    # Two lobes and a point, smoothed together with subdivision
    pts = []
    for i in range(48):
        t = i / 48 * math.tau
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 17 * 0.75, z / 17 * 0.75 + 0.05))
    h = from_bmesh("heart_body", puffy(pts, 0.16, 0.36, cz=0.05), r, pink)
    bevel(h, 0.12, 3, angle=math.radians(25))
    sphere("heart_shine", 0.09, (-0.3, -0.3, 0.32), r, m["shine"], scale=(1, 0.4, 0.7), seg=12, rings=6)
    return r


def rock(m):
    r = root("rock")
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=0.8, location=(0, 0, 0))
    o = bpy.context.object
    o.name = "rock_body"
    rnd = random.Random(3)
    bumps = [(Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized(), rnd.uniform(0.05, 0.12)) for _ in range(9)]
    for v in o.data.vertices:
        n = v.co.normalized()
        d = 1.0 + 0.08 * math.sin(n.x * 5 + 1) * math.cos(n.z * 4)
        for c, depth in bumps:
            if n.y > -0.5 or c.y > -0.3:  # keep the face area smooth
                k = max(0.0, n.dot(c) - 0.9) * 10
                d -= depth * k
        v.co = n * 0.8 * d
    o.scale = (1.15, 0.9, 0.95)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link(o, r, material("rock_lilac", "#9d8fc7", roughness=0.85))
    # Craters: darker flattened discs on the side and top
    crater = material("rock_crater", "#7a6ca8", roughness=0.9)
    for loc, s in (((0.62, -0.25, 0.35), 0.16), ((-0.55, -0.2, 0.42), 0.12), ((0.35, 0.3, 0.6), 0.14), ((-0.7, 0.1, -0.2), 0.13)):
        n = Vector(loc).normalized()
        c = sphere("rock_crater", s, tuple(n * 0.74), r, crater, scale=(1, 1, 0.35), seg=12, rings=6)
        c.rotation_euler = n.to_track_quat("Z", "Y").to_euler()
    # Sleepy face
    for s in (-1, 1):
        sleepy_eye(f"rock_eye_{s}", (s * 0.22, -0.74, 0.12), r, m["mouth"], width=0.08)
        sphere(f"rock_cheek_{s}", 0.07, (s * 0.38, -0.66, -0.06), r, m["cheek"], scale=(1, 0.4, 0.7), seg=12, rings=6)
    sphere("rock_mouth", 0.05, (0, -0.74, -0.12), r, m["mouth"], scale=(1, 0.5, 0.8), seg=12, rings=6)
    return r


def ufo(m):
    r = root("ufo")
    silver = material("ufo_silver", "#e3ebf7", metallic=0.25, roughness=0.3)
    purple = material("ufo_purple", "#9b5de5", roughness=0.35)
    glass = material("ufo_glass", "#bfefff", roughness=0.05, alpha=0.38, emission="#9fe7ff", strength=0.2)
    green = material("alien_green", "#7bd389", roughness=0.55)
    lathe("ufo_hull", [(0.0, -0.32), (0.4, -0.3), (0.85, -0.12), (1.05, 0.0), (0.9, 0.1), (0.55, 0.18), (0.0, 0.2)], r, silver, seg=48)
    torus("ufo_rim", 1.0, 0.06, (0, 0, 0.0), r, purple, seg=48)
    # Lights: one joined mesh so the game can blink it
    bulbs = [sphere("ufo_bulb", 0.08, (0.9 * math.cos(a), 0.9 * math.sin(a), 0.06), None,
                    material("ufo_light", "#ffe66d", emission="#ffd23f", strength=2.0), seg=12, rings=6)
             for a in (i / 10 * math.tau for i in range(10))]
    lights = join(bulbs, "ufo_lights")
    lights.parent = r
    # Alien pal
    sphere("alien_head", 0.26, (0, -0.02, 0.42), r, green, scale=(1, 0.9, 0.95))
    for s in (-1, 1):
        eye(f"alien_eye_{s}", (s * 0.1, -0.24, 0.47), r, r=0.065, mats=m)
        cylinder(f"alien_antenna_{s}", 0.015, 0.22, (s * 0.12, 0, 0.72), r, green, verts=8, rot=(0, s * 0.35, 0))
        sphere(f"alien_antenna_ball_{s}", 0.045, (s * 0.16, 0, 0.83), r, material("alien_pink", "#ff8fab", emission="#ff5c8a", strength=0.6), seg=10, rings=6)
    smile("alien_smile", (0, -0.25, 0.36), r, m["mouth"], width=0.07, thick=0.018)
    dome = sphere("ufo_dome", 0.45, (0, 0, 0.18), r, glass, seg=32, rings=12)
    trim(dome, lambda co: co.z < -0.001)
    return r


# --- Planets ------------------------------------------------------------------------

def banded_sphere(name, parent, mats, band_fn, seg=40, rings=20):
    """A UV sphere whose faces pick a material by latitude: band_fn(z) -> material index."""
    o = sphere(name, 1.0, (0, 0, 0), parent, None, seg=seg, rings=rings)
    o.data.materials.clear()
    for mm in mats:
        o.data.materials.append(mm)
    for p in o.data.polygons:
        p.material_index = band_fn(p.center)
    return o


def face(r, m, rad=1.0, sleepy=False, scale=1.0):
    """A big friendly face on the front (-Y) of a planet of radius `rad`."""
    def on_surface(x, z, lift=0.0):
        y = -math.sqrt(max(rad * rad - x * x - z * z, 0.0))
        return (x, y - lift, z)
    for s in (-1, 1):
        if sleepy:
            sleepy_eye(f"{r.name}_eye_{s}", on_surface(s * 0.3 * scale, 0.12 * scale, 0.01), r, m["mouth"], width=0.11 * scale, thick=0.025 * scale)
        else:
            eye(f"{r.name}_eye_{s}", on_surface(s * 0.28 * scale, 0.14 * scale, -0.02), r, r=0.1 * scale, mats=m)
        c = sphere(f"{r.name}_cheek_{s}", 0.09 * scale, on_surface(s * 0.48 * scale, -0.08 * scale, -0.015), r, m["cheek"], scale=(1, 0.4, 0.65), seg=12, rings=6)
        c.rotation_euler = (0, 0, -s * 0.5)
    smile(f"{r.name}_smile", on_surface(0, -0.1 * scale, 0.005), r, m["mouth"], width=0.12 * scale, thick=0.028 * scale)


def planet_moon(m):
    r = root("planet_moon")
    base = material("moon_cream", "#e9e4f5", roughness=0.85)
    crater = material("moon_crater", "#c5bddc", roughness=0.9)
    sphere("planet_moon_body", 1.0, (0, 0, 0), r, base, seg=40, rings=20)
    rnd = random.Random(11)
    for _ in range(14):
        while True:
            n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
            if 0.2 < n.length <= 1 and not (n.normalized().y < -0.55 and abs(n.normalized().z) < 0.5):
                break
        n.normalize()
        s = rnd.uniform(0.1, 0.22)
        c = sphere("moon_crater", s, tuple(n * 0.97), r, crater, scale=(1, 1, 0.3), seg=16, rings=8)
        c.rotation_euler = n.to_track_quat("Z", "Y").to_euler()
    face(r, m, sleepy=True)
    return r


def planet_ring(m):
    r = root("planet_ring")
    a = material("ring_orange", "#ff9f43", roughness=0.6)
    b = material("ring_peach", "#ffc68a", roughness=0.6)
    c = material("ring_coral", "#ff6b6b", roughness=0.6)
    banded_sphere("planet_ring_body", r, [a, b, c],
                  lambda p: 2 if abs(p.z - 0.45) < 0.12 or abs(p.z + 0.5) < 0.1 else (1 if abs(p.z) > 0.7 or abs(p.z + 0.15) < 0.08 else 0))
    lathe("planet_ring_band", [(1.35, -0.02), (2.05, -0.02), (2.05, 0.02), (1.35, 0.02), (1.35, -0.02)], r,
          material("ring_band", "#fff0c2", roughness=0.5), seg=64).rotation_euler = (math.radians(14), math.radians(-14), 0)
    lathe("planet_ring_band2", [(1.5, -0.025), (1.62, -0.025), (1.62, 0.025), (1.5, 0.025), (1.5, -0.025)], r,
          material("ring_band2", "#ffb3c6", roughness=0.5), seg=64).rotation_euler = (math.radians(14), math.radians(-14), 0)
    return r


def planet_candy(m):
    r = root("planet_candy")
    pink = material("candy_pink", "#ff8fc7", roughness=0.35)
    white = material("candy_white", "#fff5fb", roughness=0.35)
    mint = material("candy_mint", "#8ef0c8", roughness=0.35)

    def band(p):
        k = int((p.z + 1.0) * 4.5) % 4
        return (0, 1, 0, 2)[k]
    banded_sphere("planet_candy_body", r, [pink, white, mint], band, seg=48, rings=24)
    # Sprinkles
    cols = [material(f"sprinkle_{i}", c, roughness=0.4) for i, c in enumerate(("#ffd23f", "#4cc9f0", "#9b5de5", "#ff5c8a"))]
    rnd = random.Random(5)
    for i in range(22):
        n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized()
        if n.y < -0.6 and abs(n.z) < 0.45:
            continue
        s = cylinder("sprinkle", 0.035, 0.16, tuple(n * 1.0), r, cols[i % 4], verts=8)
        s.rotation_euler = (rnd.uniform(0, 3), rnd.uniform(0, 3), rnd.uniform(0, 3))
    face(r, m, scale=0.9)
    return r


def planet_ice(m):
    r = root("planet_ice")
    blue = material("ice_blue", "#7cc6fe", roughness=0.25)
    snow = material("ice_snow", "#f4fbff", roughness=0.5)
    deep = material("ice_deep", "#5aa9e6", roughness=0.25)
    banded_sphere("planet_ice_body", r, [blue, snow, deep],
                  lambda p: 1 if abs(p.z) > 0.78 else (2 if abs(p.z + 0.3) < 0.1 or abs(p.z - 0.42) < 0.06 else 0), seg=48, rings=24)
    # A woolly hat for the chilly planet: pom-pom on top of the snow cap
    hat = material("ice_hat", "#ff5c8a", roughness=0.7)
    cap = sphere("ice_hat", 1.04, (0, 0, 0), r, hat, seg=40, rings=20)
    trim(cap, lambda co: co.z < 0.6)
    torus("ice_hat_band", 0.84, 0.11, (0, 0, 0.6), r, material("ice_hat_band", "#fff5fb", roughness=0.9), seg=40, minor_seg=10)
    sphere("ice_pompom", 0.22, (0, 0, 1.12), r, material("ice_pom", "#fff5fb", roughness=0.9), seg=16, rings=8)
    face(r, m, scale=0.85)
    return r


def planet_jungle(m):
    r = root("planet_jungle")
    sea = material("jungle_sea", "#3ab0ff", roughness=0.3)
    land = material("jungle_green", "#6bd66b", roughness=0.7)
    sphere("planet_jungle_body", 1.0, (0, 0, 0), r, sea, seg=40, rings=20)
    rnd = random.Random(21)
    for i in range(9):
        n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized()
        s = rnd.uniform(0.3, 0.5)
        c = sphere("jungle_land", s, tuple(n * 0.9), r, land, scale=(1, 1, 0.4), seg=16, rings=8)
        c.rotation_euler = n.to_track_quat("Z", "Y").to_euler()
    # Fluffy cloud ring
    cloud = material("jungle_cloud", "#ffffff", roughness=0.8)
    for i in range(7):
        a = i / 7 * math.tau
        sphere("cloud", rnd.uniform(0.14, 0.22), (1.12 * math.cos(a), 1.12 * math.sin(a), 0.35 * math.sin(a * 2)), r, cloud, seg=12, rings=6)
    return r


# --- Build & export --------------------------------------------------------------

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build():
    clear()
    m = shared()
    roots = [rocket(m), star(m), gem(m), magnet(m), heart(m), rock(m), ufo(m),
             planet_moon(m), planet_ring(m), planet_candy(m), planet_ice(m), planet_jungle(m)]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                              export_texcoords=False)
    faces = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
    print(f"exported {OUT} ({faces} base faces, {os.path.getsize(OUT)} bytes)")
    return roots


def preview(roots, path):
    """Lay the models out in a row and render them, to check the look."""
    scene = bpy.context.scene
    sizes = {"rocket": 2.4, "planet_ring": 4.4, "planet": 2.6, "ufo": 2.4}
    rows = [roots[:6], roots[6:]]
    for row_i, row in enumerate(rows):
        widths = [next((v for k, v in sizes.items() if q.name.startswith(k)), 2.0) + 0.3 for q in row]
        x = -sum(widths) / 2
        for q, w in zip(row, widths):
            q.location = (x + w / 2, 0, -row_i * 3.4)
            x += w
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 19
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0, -20, -1.5)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    scene.camera = cam
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.5
    so = bpy.data.objects.new("sun", sun)
    scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(60), math.radians(-25), math.radians(-20))
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*rgb("#2a2266"), 1)
    bg.inputs["Strength"].default_value = 1.2
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 640
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "CYCLES"
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = 16
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"preview written to {path}")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    built = build()
    if "--preview" in argv:
        preview(built, argv[argv.index("--preview") + 1])
