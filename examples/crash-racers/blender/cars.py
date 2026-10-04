"""
Crash Racers cars. Each car is a subdivided box cage shaped into a toy body,
with the parts the game can damage split off separately, a cartoon face and a
little driver. Exports one GLB per car to ../public/models/car_<name>.glb.

Run with:  blender --background --python cars.py [-- rocket sunny ...]
Set CARS_PREVIEW=/some/dir to also render two preview PNGs per car there.

Node names the game relies on (children of the car_<name> root):
  body            dense shell that dents (the underside is a cheap flat lid)
  cabin           dark inside of the cabin, seen through the windows
  hood, door_l, door_r, bumper_f, bumper_r      parts that loosen and tear off
  mirror_l, mirror_r                            droop, then snap off
  glass_f, glass_r, glass_l, glass_r_side       windows that crack and shatter (open cars have glass_f only)
  wheel_fl, wheel_fr, wheel_rl, wheel_rr        origin at the hub; each has a child hubcap_<xx> that can pop off
  light_f         the eyes: they are the headlights and go dark when smashed
  light_r         tail lights
  face_lids       both eyelids, origin on the line through the eye centres; rotate about X to blink and squint
  face_pupils     both pupils; shift along X to look around
  face_smile, face_frown                         the game shows one of the two
  driver          the little racer
  extra_*         decorations; the ones listed in damage.js tear off
  extra_booster > booster_flame                 rocket's flame, scaled by the game
Blender +Y is the car's front; glTF export turns that into three.js -Z.

File size: the export has no UVs, vertex colours or normals (the game
computes smooth normals on load, and recomputes them after every dent anyway).
The body is dense only where it can dent; its underside is a flat lid.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "models")

# Colours are linear RGB.
CARS = {
    # L, W: length and width. z0: underbody. zb: beltline. zr: roof.
    # zh_f/zh_r: hood height at the nose and at the windshield. zt: trunk height.
    # a1..a4: windshield base, roof front, roof back, rear window base (as -1..1 along the length).
    # r, tire_w: wheel radius and width. cage: body cage segments (x, y, z).
    # tumble: how much the upper body narrows. taper: how round the ends are in plan view.
    # belly: how far the underside curves up at the ends. open: no roof (driver sits in the open).
    "rocket": dict(
        paint=(0.75, 0.01, 0.01), accent=(0.95, 0.95, 0.95), rim=(1.0, 0.55, 0.0), lid="paint",
        L=4.0, W=1.9, z0=0.26, zb=0.9, zr=1.45, zh_f=0.8, zh_r=0.92, zt=0.94,
        a1=0.18, a2=-0.04, a3=-0.38, a4=-0.62, r=0.38, tire_w=0.38, wb=(0.33, -0.31),
        cage=(4, 10, 4), tumble=0.3, taper=0.16, taper_start=0.7, belly=0.04,
        eye=dict(r=0.22, x=0.23, tilt=0.38, open=0.12, pupil=0.5),
        mouth=dict(w=0.34, h=0.2), helmet=(0.95, 0.95, 0.95), visor=True,
        extras=["stripe", "spoiler", "fins", "booster"]),
    "sunny": dict(
        paint=(1.0, 0.62, 0.0), accent=(1.0, 0.18, 0.02), rim=(0.95, 0.95, 0.95), lid="paint", open=True,
        L=4.0, W=1.9, z0=0.26, zb=0.92, zr=0.92, zh_f=0.82, zh_r=0.94, zt=0.94,
        a1=0.22, a2=0.2, a3=-0.5, a4=-0.52, r=0.38, tire_w=0.34, wb=(0.32, -0.31),
        cage=(4, 10, 4), tumble=0.15, taper=0.12, taper_start=0.75, belly=0.06,
        eye=dict(r=0.24, x=0.24, tilt=-0.1, open=0.32, pupil=0.48),
        mouth=dict(w=0.36, h=0.22), sunglasses=True, hair=(0.9, 0.35, 0.05),
        extras=["belt_stripe", "sun", "surfboard", "chrome_bumpers"]),
    "bubbles": dict(
        paint=(0.18, 0.55, 1.0), accent=(1.0, 0.35, 0.6), rim=(1.0, 0.35, 0.6), lid="paint",
        L=3.5, W=1.86, z0=0.26, zb=0.86, zr=1.72, zh_f=0.8, zh_r=0.92, zt=0.86,
        a1=0.44, a2=0.2, a3=-0.34, a4=-0.66, r=0.38, tire_w=0.36, wb=(0.31, -0.3),
        cage=(4, 8, 4), tumble=0.3, taper=0.22, taper_start=0.55, belly=0.1,
        eye=dict(r=0.28, x=0.24, tilt=-0.18, open=0.45, pupil=0.55),
        mouth=dict(w=0.28, h=0.2), hair=(1.0, 0.35, 0.6), bow=True,
        extras=["skirt", "dots", "bubble_wand"]),
    "bruno": dict(
        paint=(1.0, 0.22, 0.0), accent=(0.05, 0.05, 0.06), rim=(0.95, 0.75, 0.05), lid="dark",
        L=4.2, W=2.0, z0=0.56, zb=1.3, zr=2.08, zh_f=1.24, zh_r=1.32, zt=1.34,
        a1=0.32, a2=0.2, a3=-0.16, a4=-0.2, r=0.52, tire_w=0.48, wb=(0.31, -0.3), wheel_out=0.04,
        cage=(5, 10, 5), tumble=0.12, taper=0.05, taper_start=0.86, belly=0.0, truck=True,
        eye=dict(r=0.22, x=0.24, tilt=0.45, open=0.1, pupil=0.5),
        mouth=dict(w=0.4, h=0.22), helmet=(0.05, 0.05, 0.06), beard=True, knobby=True,
        extras=["rocker", "bed", "roof_lamps", "spare_tire", "stacks", "bull_bar"]),
    "pickle": dict(
        paint=(0.16, 0.5, 0.03), accent=(0.06, 0.24, 0.01), rim=(1.0, 0.72, 0.02), lid="paint", open=True,
        L=4.1, W=1.84, z0=0.28, zb=0.94, zr=0.94, zh_f=0.82, zh_r=0.96, zt=0.9,
        a1=0.24, a2=0.22, a3=-0.4, a4=-0.42, r=0.4, tire_w=0.38, wb=(0.3, -0.3),
        cage=(4, 10, 4), tumble=0.25, taper=0.42, taper_start=0.45, belly=0.12,
        eye=dict(r=0.25, x=0.24, tilt=0.0, open=0.3, pupil=0.5),
        mouth=dict(w=0.32, h=0.22), helmet=(1.0, 0.72, 0.02), goggles=True,
        extras=["pickle_stripes", "bumps", "roll_bar", "flag"]),
    "siren": dict(
        paint=(0.9, 0.9, 0.92), accent=(0.02, 0.02, 0.03), rim=(0.02, 0.1, 0.6), lid="accent",
        L=4.1, W=1.9, z0=0.26, zb=0.92, zr=1.6, zh_f=0.82, zh_r=0.94, zt=0.94,
        a1=0.3, a2=0.12, a3=-0.4, a4=-0.58, r=0.38, tire_w=0.36, wb=(0.32, -0.31),
        cage=(4, 10, 4), tumble=0.28, taper=0.1, taper_start=0.8, belly=0.04,
        eye=dict(r=0.22, x=0.24, tilt=0.2, open=0.2, pupil=0.5),
        mouth=dict(w=0.34, h=0.2), cap=(0.02, 0.06, 0.35),
        extras=["police_paint", "light_bar", "stars", "push_bar"]),
}

# glTF exporter enum values are read, not assumed: see export().
PREVIEW = os.environ.get("CARS_PREVIEW")


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, metallic=0.0, roughness=0.4, alpha=1.0, emission=None, strength=1.5):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if not m.node_tree:
        m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    m.diffuse_color = (*color, alpha)
    # Single-sided (exported as doubleSided: false): cheaper, and the cabin liner relies on it.
    m.use_backface_culling = True
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
        for attr in ("surface_render_method", "blend_method"):
            prop = m.bl_rna.properties.get(attr)
            if prop:
                ids = [i.identifier for i in prop.enum_items]
                want = next((i for i in ids if i.startswith("BLEND")), None)
                if want:
                    setattr(m, attr, want)
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return m


def lerp(a, b, t):
    return a + (b - a) * max(0.0, min(1.0, t))


def link(obj):
    bpy.context.collection.objects.link(obj)
    return obj


def from_bmesh(name, bm, mat=None, smooth=True):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = link(bpy.data.objects.new(name, mesh))
    if mat:
        mesh.materials.append(mat)
    if smooth:
        for poly in mesh.polygons:
            poly.use_smooth = True
    return obj


def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def join(objs, name):
    objs = [o for o in objs if o]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = objs[0]
    obj.name = name
    obj.data.name = name
    return obj


def set_origin(obj, point):
    """Moves the object's origin to point (world space) without moving its geometry."""
    offset = Vector(point) - obj.location
    obj.data.transform(Matrix.Translation(-offset))
    obj.location = Vector(point)


def smooth(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = True


# --- Primitives -------------------------------------------------------------------------

def sphere(loc, radius, mat, seg=16, rings=8, scale=(1, 1, 1), align=None, name="s"):
    """UV sphere; `align` turns its local Z towards that direction."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=radius)
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    if align is not None:
        q = Vector((0, 0, 1)).rotation_difference(Vector(align).normalized())
        bmesh.ops.rotate(bm, cent=Vector(), matrix=q.to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return from_bmesh(name, bm, mat)


def cylinder(loc, radius, depth, mat, seg=16, axis="Z", radius2=None, bevel=0.0, bevel_seg=2, name="c"):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=radius,
                          radius2=radius if radius2 is None else radius2, depth=depth)
    obj = from_bmesh(name, bm, mat)
    if bevel:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = bevel_seg
        mod.limit_method = "ANGLE"
        apply_all(obj)
        smooth(obj)
    rot = {"X": Matrix.Rotation(math.pi / 2, 4, "Y"), "Y": Matrix.Rotation(-math.pi / 2, 4, "X"), "Z": Matrix.Identity(4)}[axis]
    obj.data.transform(rot)
    obj.data.transform(Matrix.Translation(Vector(loc)))
    return obj


def box(loc, size, mat, bevel=0.04, seg=2, cuts=(0, 0, 0), bend=0.0, name="b"):
    """Rounded box. `cuts` adds edge loops per axis (for bending); `bend` curves it back along x (y -= bend * x^2)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for axis, n in enumerate(cuts):
        for i in range(1, n + 1):
            co = Vector((0, 0, 0))
            co[axis] = -0.5 + i / (n + 1)
            no = Vector((0, 0, 0))
            no[axis] = 1
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    obj = from_bmesh(name, bm, mat, smooth=False)
    if bevel:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = seg
        mod.limit_method = "ANGLE"
        apply_all(obj)
    smooth(obj)
    if bend:
        for v in obj.data.vertices:
            v.co.y -= bend * v.co.x * v.co.x
    obj.data.transform(Matrix.Translation(Vector(loc)))
    return obj


def tube(points, radius, mat, name="t", res=3, closed=False, sides=6):
    """A round tube along points (world space)."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = max(0, sides // 2 - 2)
    curve.use_fill_caps = True
    curve.resolution_u = res
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for sp, p in zip(spline.points, points):
        sp.co = (*p, 1)
    spline.use_cyclic_u = closed
    obj = link(bpy.data.objects.new(name, curve))
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    bpy.data.objects.remove(obj)
    bpy.data.curves.remove(curve)
    out = link(bpy.data.objects.new(name, mesh))
    mesh.materials.clear()
    mesh.materials.append(mat)
    smooth(out)
    return out


def star(loc, normal, radius, depth, mat, up=(0, 0, 1), name="star"):
    """A chunky five-pointed star lying on a surface."""
    bm = bmesh.new()
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        rr = radius if i % 2 == 0 else radius * 0.45
        pts.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), 0)))
    face = bm.faces.new(pts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, vec=(0, 0, depth), verts=[g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = from_bmesh(name, bm, mat, smooth=False)
    n = Vector(normal).normalized()
    # local Z -> normal, local Y -> up projected on the surface
    upv = (Vector(up) - n * n.dot(Vector(up))).normalized()
    x = upv.cross(n)
    rot = Matrix((x, upv, n)).transposed().to_4x4()
    obj.data.transform(rot)
    obj.data.transform(Matrix.Translation(Vector(loc)))
    return obj


# --- Body -------------------------------------------------------------------------------

def top_height(p, v):
    """Height of the car's top surface at length position v (-1 rear .. 1 front)."""
    a1, a2, a3, a4 = p["a1"], p["a2"], p["a3"], p["a4"]
    if v >= a1:
        t = (v - a1) / (1 - a1)
        return lerp(p["zh_r"], p["zh_f"], t) + 0.03 * math.cos(t * math.pi / 2)
    if p.get("open"):
        if v >= a4:
            return p["zb"] - 0.02
        return lerp(p["zt"] - 0.08, p["zt"], (v + 1) / (a4 + 1))
    if v >= a2:
        return lerp(p["zr"], p["zh_r"], (v - a2) / (a1 - a2))
    if v >= a3:
        mid = (a2 + a3) / 2
        return p["zr"] + 0.02 * (1 - ((v - mid) / ((a2 - a3) / 2 + 1e-6)) ** 2)
    if v >= a4:
        return lerp(p["zt"], p["zr"], (v - a4) / (a3 - a4 + 1e-6))
    return lerp(p["zt"] - 0.06, p["zt"], (v + 1) / (a4 + 1))


def wheel_ys(p):
    return (p["L"] * p["wb"][0], p["L"] * p["wb"][1])


def wheel_x(p):
    """Distance from the centre line to the middle of each tyre."""
    return p["W"] / 2 - p["tire_w"] / 2 + p.get("wheel_out", 0.0) - 0.04


def build_body(p):
    nx, ny, nz = p["cage"]
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    for axis, n in ((0, nx), (1, ny), (2, nz)):
        for i in range(1, n):
            co = Vector((0, 0, 0))
            co[axis] = -1 + 2 * i / n
            no = Vector((0, 0, 0))
            no[axis] = 1
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
    belt_fraction = 0.6
    for vert in bm.verts:
        u, v, w = vert.co.x, vert.co.y, vert.co.z  # each in -1..1
        t = (w + 1) / 2
        end = max(0.0, (abs(v) - p["taper_start"]) / (1 - p["taper_start"]))
        z0 = p["z0"] + p["belly"] * end * end
        top = top_height(p, v)
        lower_top = min(top, p["zb"])
        if t <= belt_fraction:
            z = lerp(z0, lower_top, t / belt_fraction)
        else:
            z = lerp(lower_top, top, (t - belt_fraction) / (1 - belt_fraction))
        tumble = max(0.0, min(1.0, (z - p["zb"]) / max(0.01, p["zr"] - p["zb"])))
        width = p["W"] / 2 * (1 - p["tumble"] * tumble)
        width *= 1 - p["taper"] * end * end
        vert.co = Vector((u * width, v * p["L"] / 2, z))
    obj = from_bmesh("body", bm, smooth=False)
    sub = obj.modifiers.new("smooth", "SUBSURF")
    sub.levels = 2
    sub.render_levels = 2
    apply_all(obj)
    # Wheel wells: one combined cutter in a single boolean is far more robust than four.
    cutters = []
    inner = wheel_x(p) - p["tire_w"] / 2 - 0.07
    depth = 2 * (p["W"] / 2 + 0.3 - inner)
    for x_side in (-1, 1):
        for y in wheel_ys(p):
            cutters.append(cylinder((x_side * (inner + depth / 2), y, p["r"] + 0.02), p["r"] + 0.07, depth, None, seg=32, axis="X"))
    cutter = join(cutters, "cutter")
    boolean = obj.modifiers.new("arches", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.object = cutter
    boolean.solver = "EXACT"
    apply_all(obj)
    bpy.data.objects.remove(cutter)
    obj.data.materials.clear()

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    half_w = p["W"] / 2

    def is_stray(c):
        if abs(c.x) > half_w + 0.02 or c.z < p["z0"] - 0.03:
            return True
        return any(math.hypot(c.y - y, c.z - (p["r"] + 0.02)) < p["r"] + 0.05 for y in wheel_ys(p)) and abs(c.x) > inner + 0.01

    stray = [f for f in bm.faces if is_stray(f.calc_center_median()) or any(abs(v.co.x) > half_w + 0.02 for v in f.verts)]
    bmesh.ops.delete(bm, geom=stray, context="FACES")
    # Nobody dents the underside: swap the dense floor for one flat lid.
    floor_z = p["z0"] + p["belly"] + 0.08
    floor = [f for f in bm.faces if f.normal.z < -0.5 and f.calc_center_median().z < floor_z]
    bmesh.ops.delete(bm, geom=floor, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    boundary = [e for e in bm.edges if e.is_boundary]
    bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.validate()
    smooth(obj)
    return obj


def split_faces(body, name, predicate, offset, under=None):
    """
    Copies the body faces matching predicate (and their materials) into a new
    object, pushed out along their normals. `under` is a material index for the
    body faces left underneath, or "delete" to cut a hole there.
    """
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.faces.ensure_lookup_table()
    picked = [f for f in bm.faces if predicate(f.calc_center_median(), f.normal)]
    if not picked:
        bm.free()
        return None
    smooth_outline(bm, picked)
    copy = bmesh.new()
    vmap = {}
    for f in picked:
        verts = []
        for v in f.verts:
            if v.index not in vmap:
                vmap[v.index] = copy.verts.new(v.co + v.normal * offset)
            verts.append(vmap[v.index])
        nf = copy.faces.new(verts)
        nf.material_index = f.material_index
        nf.smooth = True
    if under == "delete":
        bmesh.ops.delete(bm, geom=picked, context="FACES")
    elif under is not None:
        for f in picked:
            f.material_index = under
    bm.to_mesh(body.data)
    bm.free()
    obj = from_bmesh(name, copy)
    for m in body.data.materials:
        obj.data.materials.append(m)
    return obj


def smooth_outline(bm, faces, rounds=4):
    """Rounds off the stair-stepped outline of a face selection (moving the body's verts with it)."""
    chosen = set(faces)
    edges = [e for e in bm.edges if sum(f in chosen for f in e.link_faces) == 1]
    nbrs = {}
    for e in edges:
        a, b = e.verts
        nbrs.setdefault(a, []).append(b)
        nbrs.setdefault(b, []).append(a)
    for _ in range(rounds):
        new = {v: v.co * 0.5 + (n[0].co + n[1].co) * 0.25 for v, n in nbrs.items() if len(n) == 2}
        for v, co in new.items():
            v.co = co
    bm.normal_update()


def paint_faces(body, index, predicate):
    for poly in body.data.polygons:
        if predicate(Vector(poly.center), Vector(poly.normal)):
            poly.material_index = index


def cabin_liner(body, p, mat):
    """A dark, inward-facing copy of the cabin, seen through the windows (and visible from inside only)."""
    half = p["L"] / 2
    bm = bmesh.new()
    bm.from_mesh(body.data)
    keep = lambda c: p["a4"] - 0.08 < c.y / half < p["a1"] + 0.06 and c.z > p["zb"] - 0.3
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(f.calc_center_median())], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    center = Vector((0, (p["a1"] + p["a4"]) / 2 * half, (p["zb"] + p["zr"]) / 2))
    for v in bm.verts:
        v.co = center + (v.co - center) * Vector((0.9, 0.95, 0.9))
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    obj = from_bmesh("cabin", bm, mat)
    dec = obj.modifiers.new("lighter", "DECIMATE")
    dec.ratio = 0.12
    apply_all(obj)
    obj.data.validate()
    return obj


# --- Wheels -----------------------------------------------------------------------------

def wheel(name, p, location, mats):
    r, tw = p["r"], p["tire_w"]
    side = 1 if location[0] > 0 else -1
    x0, y0, z0 = location
    tire = cylinder((0, 0, 0), r, tw, mats["tire"], seg=28, axis="X", bevel=min(0.11, tw * 0.33), bevel_seg=3)
    pieces = [tire]
    if p.get("knobby"):
        for i in range(12):
            a = i / 12 * math.pi * 2
            k = box((0, math.cos(a) * (r - 0.01), math.sin(a) * (r - 0.01)), (tw * 0.8, 0.15, 0.09), mats["tire"], bevel=0)
            k.data.transform(Matrix.Translation(Vector((0, math.cos(a) * 0.0, 0))))
            # turn the knob to sit tangent to the tread
            bm = bmesh.new()
            bm.from_mesh(k.data)
            c = Vector((0, math.cos(a) * (r - 0.01), math.sin(a) * (r - 0.01)))
            bmesh.ops.rotate(bm, cent=c, matrix=Matrix.Rotation(a + math.pi / 2, 3, "X"), verts=bm.verts)
            bm.to_mesh(k.data)
            bm.free()
            pieces.append(k)
    # Coloured dish rim, a little proud of the sidewall
    rim = cylinder((side * (tw / 2 - 0.03), 0, 0), r * 0.62, 0.08, mats["rim"], seg=24, axis="X", bevel=0.025, bevel_seg=2)
    pieces.append(rim)
    w = join(pieces, name)
    for v in w.data.vertices:
        v.co += Vector(location)
    w.location = (0, 0, 0)
    set_origin(w, location)
    # Chrome hubcap dome: its own node so it can pop off.
    cap = sphere((x0 + side * (tw / 2 + 0.01), y0, z0), r * 0.36, mats["chrome"], seg=14, rings=6, scale=(0.45, 1, 1), name="hubcap")
    nub = sphere((x0 + side * (tw / 2 + 0.07), y0, z0), r * 0.11, mats["rim"], seg=8, rings=4, scale=(0.6, 1, 1), name="nub")
    cap = join([cap, nub], "hubcap_" + name.split("_")[1])
    set_origin(cap, (x0 + side * (tw / 2 + 0.02), y0, z0))
    cap.parent = w
    cap.matrix_parent_inverse = w.matrix_world.inverted()
    return w


# --- Face and driver --------------------------------------------------------------------

class Surface:
    def __init__(self, obj):
        depsgraph = bpy.context.evaluated_depsgraph_get()
        self.bvh = BVHTree.FromObject(obj, depsgraph)

    def hit(self, origin, direction):
        loc, normal, _, _ = self.bvh.ray_cast(Vector(origin), Vector(direction).normalized())
        return loc, normal

    def front(self, x, z):
        return self.hit((x, 10, z), (0, -1, 0))

    def back(self, x, z):
        return self.hit((x, -10, z), (0, 1, 0))

    def top(self, x, y):
        return self.hit((x, y, 10), (0, 0, -1))

    def side(self, sgn, y, z):
        return self.hit((sgn * 10, y, z), (-sgn, 0, 0))


def build_face(p, surf, mats):
    e = p["eye"]
    re = e["r"]
    W = p["W"]
    parts = []
    eyes, centers, lids, pupils = [], [], [], []
    nose_y = surf.front(0, p["zh_f"] - 0.12)[0].y
    for side, tag in ((-1, "l"), (1, "r")):
        # Frog-style: sitting on the front of the hood, bulging up out of it
        x = side * e["x"] * W
        y = nose_y - re * e.get("back", 1.0)
        c = surf.top(x, y)[0] + Vector((0, 0, re * e.get("rise", 0.35)))
        centers.append(c)
        eyes.append(sphere(c, re, mats["eye"], seg=20, rings=12, name="eye"))
        # Pupil with a twinkle, looking ahead and a touch inwards
        gaze = Vector((-side * 0.08, 1, 0.05)).normalized()
        pr = re * e["pupil"]
        pupil = sphere(c + gaze * (re - pr * 0.18), pr, mats["pupil"], seg=16, rings=8, scale=(1, 1, 0.42), align=gaze, name="pupil")
        twinkle = sphere(c + gaze * (re + 0.005) + Vector((side * 0.25 * pr, 0, 0.35 * pr)), pr * 0.28, mats["twinkle"], seg=8, rings=4,
                         scale=(1, 1, 0.5), align=gaze, name="twinkle")
        pupils += [pupil, twinkle]
        # Eyelid: a dome over the top of the eye, tilted for attitude (tilt > 0 frowns inwards).
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=re * 1.08)
        t = e["tilt"]
        nrm = Vector((-side * math.sin(t), 0, math.cos(t)))
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=nrm * re * e["open"], plane_no=nrm, clear_inner=True)
        edges = [ed for ed in bm.edges if ed.is_boundary]
        bmesh.ops.holes_fill(bm, edges=edges, sides=0)
        bmesh.ops.translate(bm, vec=c, verts=bm.verts)
        lids.append(from_bmesh(f"lid_{tag}", bm, mats[p["lid"]]))
    # Both eyes sit at the same height and depth, so one node each blinks (rotate X) and looks (shift X).
    mid = (centers[0] + centers[1]) / 2
    for objs, nname in ((lids, "face_lids"), (pupils, "face_pupils")):
        o = join(objs, nname)
        set_origin(o, mid)
        parts.append(o)
    eyes_obj = join(eyes, "light_f")
    parts.append(eyes_obj)

    # Mouth: an open grin with a tongue (shown) and a wobbly frown (hidden until it hurts).
    m = p["mouth"]
    # On the nose, between the bumper top and the hood's front edge
    lo, hi = p["z0"] + 0.24, p["zh_f"] - 0.06
    mh = min(m["h"], (hi - lo) * 0.85)
    zc = (lo + hi) / 2
    mw = m["w"]
    ns, nt = 12, 4
    bm = bmesh.new()
    grid = []
    for i in range(ns + 1):
        s = -1 + 2 * i / ns
        row = []
        top = zc + mh * 0.5 + mh * 0.12 * s * s
        bottom = zc - mh * 0.5 + mh * 1.1 * s * s
        bottom = min(bottom, top)
        for j in range(nt + 1):
            zz = lerp(bottom, top, j / nt)
            loc, n = surf.front(s * mw, zz)
            row.append(bm.verts.new(loc + n * 0.012))
        grid.append(row)
    for i in range(ns):
        for j in range(nt):
            quad = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]
            if len({tuple(round(c, 4) for c in v.co) for v in quad}) >= 3:
                try:
                    bm.faces.new(quad)
                except ValueError:
                    pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
    bm.normal_update()
    # A little thickness so it reads from the side
    ext = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    bmesh.ops.translate(bm, vec=(0, -0.01, 0), verts=[g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    grin = from_bmesh("grin", bm, mats["mouth"])
    tloc, tn = surf.front(0, zc - mh * 0.15)
    tongue = sphere(tloc + tn * 0.012, mw * 0.32, mats["tongue"], seg=12, rings=6, scale=(1, 0.55, 0.3), align=tn, name="tongue")
    smile = join([grin, tongue], "face_smile")
    set_origin(smile, (0, tloc.y, zc))
    parts.append(smile)
    pts = []
    for i in range(9):
        s = -1 + 2 * i / 8
        zz = zc + mh * 0.25 - mh * 0.55 * s * s + 0.015 * math.sin(s * 9)
        loc, n = surf.front(s * mw * 0.75, zz)
        pts.append(loc + n * 0.02)
    frown = tube(pts, 0.03, mats["mouth"], name="face_frown")
    set_origin(frown, (0, tloc.y, zc))
    parts.append(frown)
    return parts, centers


def build_driver(p, mats, seat):
    """A chunky little racer, facing +Y. `seat` is where the bottom sits."""
    x, y, z = seat
    pieces = []
    shirt = mats["accent_paint"] if "accent_paint" in mats else mats["dark"]
    pieces.append(sphere((x, y, z + 0.22), 0.27, shirt, seg=14, rings=8, scale=(1.05, 0.8, 1.0), name="torso"))
    hz = z + 0.66
    hr = 0.22
    pieces.append(sphere((x, y, hz), hr, mats["skin"], seg=16, rings=10, name="head"))
    for side in (-1, 1):
        # Eyes and cheeks
        pieces.append(sphere((x + side * 0.075, y + hr * 0.92, hz + 0.02), 0.035, mats["pupil"], seg=8, rings=5, scale=(0.8, 0.5, 1.1), name="deye"))
        pieces.append(sphere((x + side * 0.12, y + hr * 0.8, hz - 0.06), 0.035, mats["cheek"], seg=8, rings=4, scale=(1, 0.5, 0.7), name="cheek"))
    pieces.append(tube([(x - 0.06, y + hr * 0.95, hz - 0.07), (x, y + hr * 0.99, hz - 0.1), (x + 0.06, y + hr * 0.95, hz - 0.07)],
                       0.012, mats["pupil"], name="dsmile", sides=4))
    if p.get("helmet"):
        hm = material("helmet", p["helmet"], roughness=0.3)
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=hr * 1.12)
        # Open at the face: cut a window looking forwards
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, -hr * 0.1), plane_no=(0, 0, 1), clear_inner=True)
        face_cut = [f for f in bm.faces if f.calc_center_median().y > hr * 0.55 and f.calc_center_median().z < hr * 0.55]
        bmesh.ops.delete(bm, geom=face_cut, context="FACES")
        bmesh.ops.translate(bm, vec=(x, y, hz), verts=bm.verts)
        helmet = from_bmesh("helmet", bm, hm)
        mod = helmet.modifiers.new("thick", "SOLIDIFY")
        mod.thickness = 0.025
        apply_all(helmet)
        pieces.append(helmet)
        stripe = mats["accent_paint"] if p["helmet"] != p["accent"] else mats["paint"]
        pieces.append(tube([(x, y + hr * 0.75, hz + hr * 0.9), (x, y, hz + hr * 1.16), (x, y - hr * 1.0, hz + hr * 0.7)], 0.03, stripe, name="hstripe", sides=4))
        if p.get("visor"):
            pieces.append(box((x, y + hr * 0.9, hz + hr * 0.62), (hr * 1.7, 0.05, 0.07), mats["pupil"], bevel=0.02, seg=1, cuts=(3, 0, 0), bend=1.2, name="visor"))
        if p.get("goggles"):
            gm = mats["chrome"]
            for side in (-1, 1):
                pieces.append(cylinder((x + side * 0.085, y + hr * 0.98, hz + hr * 0.55), 0.06, 0.04, gm, seg=12, axis="Y", name="goggle"))
            pieces.append(tube([(x - hr * 1.12, y + hr * 0.2, hz + hr * 0.55), (x - 0.12, y + hr * 0.85, hz + hr * 0.55),
                                (x + 0.12, y + hr * 0.85, hz + hr * 0.55), (x + hr * 1.12, y + hr * 0.2, hz + hr * 0.55)], 0.015, mats["dark"], name="strap", sides=4))
    if p.get("cap"):
        cm = material("police_cap", p["cap"], roughness=0.5)
        pieces.append(cylinder((x, y, hz + hr * 0.75), hr * 1.02, 0.16, cm, seg=16, radius2=hr * 1.1, bevel=0.03, name="cap"))
        pieces.append(box((x, y + hr * 0.75, hz + hr * 0.5), (hr * 1.6, hr * 0.8, 0.03), mats["dark"], bevel=0.015, seg=1, name="brim"))
        pieces.append(star((x, y + hr * 0.98, hz + hr * 0.85), (0, 1, 0.2), 0.05, 0.015, mats["gold"], name="badge"))
    if p.get("hair"):
        hm = material("hair", p["hair"], roughness=0.6)
        for k in range(9):
            a = k / 9 * math.pi * 2
            pieces.append(sphere((x + math.cos(a) * hr * 0.75, y - 0.05 + math.sin(a) * hr * 0.55, hz + hr * 0.62), hr * 0.42, hm, seg=10, rings=6, name="curl"))
        if p.get("bow"):
            for side in (-1, 1):
                pieces.append(sphere((x + side * 0.09, y + 0.02, hz + hr * 1.12), 0.08, mats["accent_paint"], seg=10, rings=6, scale=(1.2, 0.5, 0.8), name="bow"))
    if p.get("sunglasses"):
        for side in (-1, 1):
            pieces.append(box((x + side * 0.08, y + hr * 0.95, hz + 0.03), (0.13, 0.03, 0.08), mats["pupil"], bevel=0.02, seg=1, name="shade"))
        # Sun hat
        sh = material("sunhat", (0.95, 0.85, 0.5), roughness=0.7)
        pieces.append(cylinder((x, y, hz + hr * 0.8), hr * 1.9, 0.03, sh, seg=20, bevel=0.012, name="brim"))
        pieces.append(sphere((x, y, hz + hr * 0.82), hr * 0.95, sh, seg=14, rings=6, scale=(1, 1, 0.75), name="crown"))
        pieces.append(cylinder((x, y, hz + hr * 0.95), hr * 0.93, 0.07, mats["accent_paint"], seg=14, name="band"))
    if p.get("beard"):
        pieces.append(sphere((x, y + hr * 0.6, hz - hr * 0.55), hr * 0.62, material("beard", (0.12, 0.05, 0.02), roughness=0.8), seg=12, rings=6,
                             scale=(1.1, 0.7, 0.75), name="beard"))
    # Steering wheel
    pieces.append(tube([(x + 0.17 * math.cos(a), y + 0.42, z + 0.42 + 0.17 * math.sin(a)) for a in [i / 12 * math.pi * 2 for i in range(12)]],
                       0.022, mats["dark"], name="steer", closed=True, sides=4))
    for side in (-1, 1):
        pieces.append(tube([(x + side * 0.24, y + 0.05, z + 0.36), (x + side * 0.2, y + 0.28, z + 0.33), (x + side * 0.15, y + 0.42, z + 0.42)],
                           0.05, shirt, name="arm", sides=6))
        pieces.append(sphere((x + side * 0.15, y + 0.42, z + 0.42), 0.055, mats["skin"], seg=8, rings=5, name="hand"))
    drv = join(pieces, "driver")
    set_origin(drv, seat)
    return drv


# --- Car --------------------------------------------------------------------------------

def build_car(name, p):
    reset()
    ex = p["extras"]
    mats = {
        "paint": material(f"paint_{name}", p["paint"], roughness=0.32),
        "accent_paint": material(f"accent_{name}", p["accent"], roughness=0.32),
        "interior": material("interior", (0.03, 0.03, 0.04), roughness=0.9),
        "engine": material("engine", (0.12, 0.12, 0.13), metallic=0.6, roughness=0.5),
        "glass": material("glass", (0.45, 0.7, 0.85), roughness=0.05, alpha=0.32),
        "tire": material("tire", (0.035, 0.035, 0.04), roughness=0.85),
        "rim": material("rim", p["rim"], roughness=0.3),
        "chrome": material("chrome", (0.9, 0.9, 0.92), metallic=1.0, roughness=0.15),
        "dark": material("dark_plastic", (0.05, 0.05, 0.06), roughness=0.6),
        "eye": material("eye_white", (1, 1, 0.97), roughness=0.15, emission=(1, 0.97, 0.85), strength=0.6),
        "pupil": material("pupil", (0.01, 0.01, 0.015), roughness=0.1),
        "twinkle": material("twinkle", (1, 1, 1), roughness=0.1),
        "mouth": material("mouth", (0.12, 0.01, 0.02), roughness=0.6),
        "tongue": material("tongue", (1.0, 0.25, 0.3), roughness=0.5),
        "taillight": material("taillight", (0.8, 0.02, 0.02), roughness=0.2, emission=(1, 0.05, 0.03), strength=2.0),
        "skin": material("skin", (1.0, 0.62, 0.42), roughness=0.6),
        "cheek": material("cheek", (1.0, 0.3, 0.3), roughness=0.6),
        "gold": material("gold", (1.0, 0.7, 0.1), metallic=0.8, roughness=0.25),
        "seat": material("seat", (0.55, 0.22, 0.1), roughness=0.7),
    }
    mats["lid_paint"] = mats["paint"]
    mats["accent"] = mats["accent_paint"]
    L, W = p["L"], p["W"]
    half = L / 2
    vy = lambda co: co.y / half  # position along the length, -1..1
    a1, a2, a3, a4, zb, z0 = p["a1"], p["a2"], p["a3"], p["a4"], p["zb"], p["z0"]
    is_open = p.get("open", False)

    body = build_body(p)
    for key in ("paint", "interior", "engine", "accent_paint", "seat"):  # material indices 0..4
        body.data.materials.append(mats[key])
    PAINT, INTERIOR, ENGINE, ACCENT, SEAT = range(5)
    paint_faces(body, INTERIOR, lambda c, n: n.z < -0.7 and c.z < z0 + p["belly"] + 0.1)

    # Paint jobs, before splitting, so the hood and doors carry them too
    if "stripe" in ex:
        paint_faces(body, ACCENT, lambda c, n: abs(c.x) < 0.17 and n.z > 0.2 and abs(c.x) > 0.07)
    if "belt_stripe" in ex:
        paint_faces(body, ACCENT, lambda c, n: zb - 0.2 < c.z < zb - 0.1 and abs(n.z) < 0.6)
    if "skirt" in ex:
        paint_faces(body, ACCENT, lambda c, n: c.z < z0 + 0.16 + p["belly"] * max(0, abs(vy(c)) - 0.5) and n.z > -0.7)
    if "rocker" in ex:
        paint_faces(body, ACCENT, lambda c, n: c.z < z0 + 0.22 and n.z > -0.7)
    if "pickle_stripes" in ex:
        zc = (z0 + zb) / 2
        paint_faces(body, ACCENT, lambda c, n: n.z > -0.7 and int((math.atan2(c.z - zc, c.x) + math.pi) / (math.pi / 9)) % 2 == 0
                    and abs(math.atan2(c.z - zc, c.x) - math.pi / 2) > 0.2)
    if "police_paint" in ex:
        paint_faces(body, ACCENT, lambda c, n: n.z > -0.7 and (abs(vy(c)) > 0.42 or c.z < z0 + 0.22))
    if is_open:
        # The cockpit: seats inside the open top
        paint_faces(body, SEAT, lambda c, n: n.z > 0.5 and a4 + 0.04 < vy(c) < a1 - 0.02 and abs(c.x) < W * 0.4)
    if p.get("truck"):
        # Bed liner on the flat deck behind the cab
        paint_faces(body, INTERIOR, lambda c, n: n.z > 0.6 and vy(c) < a4 - 0.04 and abs(c.x) < W * 0.42 and vy(c) > -0.95)

    parts = [body]
    surf = Surface(body)  # before any holes are cut
    if not is_open:
        parts.append(cabin_liner(body, p, mats["interior"]))

    glass = mats["glass"]
    b_pillar = (a2 + a3) / 2
    if not is_open:
        def side_window(c, n, side):
            v = vy(c)
            return (side * n.x > 0.4 and side * n.x > abs(n.y) and c.z > zb + 0.05 and c.z < p["zr"] - 0.06 and a4 + 0.07 < v < a1 - 0.06
                    and abs(v - b_pillar) > 0.04)
        specs = [
            ("glass_f", lambda c, n: n.y > 0.25 and n.z > 0.15 and a2 + 0.02 < vy(c) < a1 - 0.02 and abs(c.x) < W * 0.34),
            ("glass_r", lambda c, n: n.y < -0.25 and c.z > zb + 0.05 and a4 + 0.0 < vy(c) < a3 - 0.0 and abs(c.x) < W * 0.32 and c.z < p["zr"] - 0.04),
            ("glass_l", lambda c, n: side_window(c, n, -1)),
            ("glass_r_side", lambda c, n: side_window(c, n, 1)),
        ]
        for glass_name, pred in specs:
            g = split_faces(body, glass_name, pred, 0.004, under="delete")
            if g:
                g.data.materials.clear()
                g.data.materials.append(glass)
                parts.append(g)
    else:
        parts += open_windshield(p, surf, mats)

    # Doors: below the windows, between the wheels; hinged at the front edge
    wy_f, wy_r = wheel_ys(p)
    door_front = min(a1, (wy_f - p["r"] - 0.12) / half)
    door_back = max(a3 + 0.05, (wy_r + p["r"] + 0.12) / half) if not p.get("truck") else max(a4 + 0.02, (wy_r + p["r"] + 0.12) / half)
    door_top = zb - 0.03
    door_bottom = z0 + (0.26 if "rocker" in ex else 0.16)
    for door_name, side in (("door_l", -1), ("door_r", 1)):
        d = split_faces(body, door_name, lambda c, n, s=side: s * n.x > 0.6 and door_bottom < c.z < door_top and door_back < vy(c) < door_front,
                        0.01, under=INTERIOR)
        if d:
            if "stars" in ex:
                dc = Vector((side * W / 2, (door_front + door_back) / 2 * half, (door_bottom + door_top) / 2 + 0.03))
                loc, n = surf.side(side, dc.y, dc.z)
                st = star(loc + n * 0.012, n, 0.2, 0.03, mats["gold"])
                d = join([d, st], door_name)
            set_origin(d, (side * W / 2, door_front * half, (z0 + zb) / 2))
            parts.append(d)

    # Face, pupils, lids, mouth; the eyes are the headlights (light_f)
    face, eye_centers = build_face(p, surf, mats)
    parts += face

    # Hood: top faces in front of the windshield, stopping short of the eyes; hinged at the back
    eye_back = (min(c.y for c in eye_centers) - p["eye"]["r"] * 1.15) / half
    h = split_faces(body, "hood", lambda c, n: n.z > 0.55 and a1 + 0.05 < vy(c) < eye_back and abs(c.x) < W * 0.4, 0.008, under=ENGINE)
    if h:
        if "sun" in ex:
            hc_y = (a1 + 0.05 + eye_back) / 2 * half
            loc, n = surf.top(0, hc_y)
            sm = material("sun", (1.0, 0.85, 0.05), roughness=0.3, emission=(1.0, 0.6, 0.0), strength=0.4)
            sun = [cylinder((0, 0, 0), 0.26, 0.04, sm, seg=20, bevel=0.015)]
            for i in range(10):
                a = i / 10 * math.pi * 2
                ray = cylinder((math.cos(a) * 0.38, math.sin(a) * 0.38, 0), 0.07, 0.03, sm, seg=3, radius2=0.07)
                ray.data.transform(Matrix.Translation(Vector((0, 0, 0))))
                # stretch into a pointy ray
                bm = bmesh.new()
                bm.from_mesh(ray.data)
                for v in bm.verts:
                    off = v.co.xy - Vector((math.cos(a) * 0.38, math.sin(a) * 0.38))
                    radial = off.dot(Vector((math.cos(a), math.sin(a))))
                    v.co.x += math.cos(a) * radial * 0.8
                    v.co.y += math.sin(a) * radial * 0.8
                bm.to_mesh(ray.data)
                bm.free()
                sun.append(ray)
            sun.append(sphere((0.07, 0.08, 0.025), 0.025, mats["pupil"], seg=8, rings=4, name="se"))
            sun.append(sphere((-0.07, 0.08, 0.025), 0.025, mats["pupil"], seg=8, rings=4, name="se"))
            sun.append(tube([(-0.09, -0.02, 0.025), (0, -0.09, 0.025), (0.09, -0.02, 0.025)], 0.014, mats["pupil"], name="ss", sides=4))
            s = join(sun, "sun")
            q = Vector((0, 0, 1)).rotation_difference(n)
            s.data.transform(q.to_matrix().to_4x4())
            s.data.transform(Matrix.Translation(loc + n * 0.02))
            h = join([h, s], "hood")
        set_origin(h, (0, (a1 + 0.05) * half, p["zh_r"]))
        parts.append(h)


    # Bumpers, bent to follow the nose
    bz = z0 + 0.09
    bh = 0.19
    bumper_mat = mats["chrome"] if "chrome_bumpers" in ex else mats["dark"]
    for bname, sgn in (("bumper_f", 1), ("bumper_r", -1)):
        hit = (surf.front if sgn > 0 else surf.back)(0, bz + 0.05)[0]
        hit2 = (surf.front if sgn > 0 else surf.back)(W * 0.4, bz + 0.05)[0]
        bend = max(0.0, abs(hit.y - hit2.y) / (W * 0.4) ** 2) * 0.8
        bw = W * 0.96
        b = box((0, 0, 0), (bw, 0.22, bh), bumper_mat, bevel=0.07, seg=2, cuts=(5, 0, 0), bend=bend)
        if sgn < 0:
            b.data.transform(Matrix.Rotation(math.pi, 4, "Z"))
        b.data.transform(Matrix.Translation(Vector((0, hit.y + sgn * 0.06, bz))))
        pieces = [b]
        if sgn > 0 and "bull_bar" in ex:
            y0 = hit.y + 0.12
            pieces.append(tube([(-W * 0.34, y0, bz), (-W * 0.34, y0 + 0.03, bz + 0.55), (-W * 0.2, y0 + 0.04, bz + 0.68), (W * 0.2, y0 + 0.04, bz + 0.68),
                                (W * 0.34, y0 + 0.03, bz + 0.55), (W * 0.34, y0, bz)], 0.045, mats["chrome"], name="bar", sides=8))
        if sgn > 0 and "push_bar" in ex:
            y0 = hit.y + 0.12
            for side in (-1, 1):
                pieces.append(tube([(side * W * 0.16, y0, bz), (side * W * 0.16, y0 + 0.02, bz + 0.32)], 0.04, mats["dark"], name="pb", sides=6))
            pieces.append(tube([(-W * 0.16, y0 + 0.02, bz + 0.3), (W * 0.16, y0 + 0.02, bz + 0.3)], 0.04, mats["dark"], name="pb", sides=6))
        b = join(pieces, bname)
        set_origin(b, (0, hit.y + sgn * 0.06, bz))
        parts.append(b)

    # Tail lights: round, on the back corners
    tails = []
    for side in (-1, 1):
        tz = max(bz + bh / 2 + 0.16, min(p["zt"], zb) - 0.14)
        loc, n = surf.back(side * W * 0.33, tz)
        tails.append(sphere(loc - n * 0.03, 0.12, mats["taillight"], seg=14, rings=7, scale=(1, 1, 0.45), align=n, name="tail"))
    parts.append(join(tails, "light_r"))

    # Wheels
    r = p["r"]
    wx = wheel_x(p)
    for wname, x, y in (("wheel_fl", -1, wy_f), ("wheel_fr", 1, wy_f), ("wheel_rl", -1, wy_r), ("wheel_rr", 1, wy_r)):
        parts.append(wheel(wname, p, (x * wx, y, r), mats))

    # Driver
    if is_open:
        seat = (0, (a1 + a4) / 2 * half - 0.05, zb - 0.38)
    else:
        seat = (0, (a2 + a3) / 2 * half + 0.15, p["zr"] - 1.02)
    parts.append(build_driver(p, mats, seat))
    if is_open:
        # Seat back behind the driver
        parts.append(box((0, seat[1] - 0.32, zb + 0.05), (W * 0.62, 0.16, 0.6), mats["seat"], bevel=0.06, seg=2, name="extra_seat"))

    parts += build_extras(name, p, surf, mats, seat)

    # Side mirrors (break off easily)
    for side, mname in ((-1, "mirror_l"), (1, "mirror_r")):
        my = (a1 - 0.02) * half if not is_open else (a1 - 0.03) * half
        loc, n = surf.side(side, my, zb - 0.02)
        mm = mats["accent_paint"] if "police_paint" in ex or "rocker" in ex else mats["paint"]
        m = box((loc.x + side * 0.12, my, zb + 0.06), (0.16, 0.08, 0.13), mm, bevel=0.035, seg=2, name=mname)
        stalk = tube([(loc.x - side * 0.02, my, zb - 0.02), (loc.x + side * 0.1, my, zb + 0.04)], 0.02, mats["dark"], name="stalk", sides=4)
        m = join([m, stalk], mname)
        set_origin(m, (loc.x, my, zb - 0.02))
        parts.append(m)
    plate_mat = material("plate", (0.95, 0.95, 0.9), roughness=0.4)
    rb = next(o for o in parts if o.name == "bumper_r")
    parts.append(box((0, rb.location.y - 0.12, bz + 0.02), (0.46, 0.02, 0.13), plate_mat, bevel=0.01, seg=1, name="extra_plate_r"))

    # Group under one root and export
    root = link(bpy.data.objects.new(f"car_{name}", None))
    for o in parts:
        o.parent = root
    if PREVIEW:
        preview(name, root, parts)
    export(name, root, parts)


def open_windshield(p, surf, mats):
    """A curved windshield with a chrome frame, for the open cars."""
    W, half = p["W"], p["L"] / 2
    y_base = p["a1"] * half
    base_z = surf.top(0, y_base)[0].z - 0.02
    h = 0.42
    lean = 0.35  # radians back
    nx, nz = 10, 3
    bm = bmesh.new()
    grid = []
    for i in range(nx + 1):
        s = -1 + 2 * i / nx
        row = []
        for j in range(nz + 1):
            t = j / nz
            x = s * W * 0.38
            y = y_base - t * h * math.sin(lean) - 0.18 * s * s
            z = base_z + t * h * math.cos(lean)
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for i in range(nx):
        for j in range(nz):
            bm.faces.new([grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]])
    edge = [grid[i][0].co.copy() for i in range(nx + 1)] + [grid[nx][j].co.copy() for j in range(1, nz + 1)] + \
           [grid[i][nz].co.copy() for i in range(nx - 1, -1, -1)] + [grid[0][j].co.copy() for j in range(nz - 1, 0, -1)]
    g = from_bmesh("glass_f", bm, mats["glass"])
    sol = g.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = 0.012
    apply_all(g)
    frame = tube([tuple(c) for c in edge], 0.03, mats["chrome"], name="extra_frame", closed=True, sides=6)
    return [g, frame]


def build_extras(name, p, surf, mats, seat):
    ex = p["extras"]
    W, half = p["W"], p["L"] / 2
    a2, a3 = p["a2"], p["a3"]
    out = []
    roof_y = (a2 + a3) / 2 * half
    if "spoiler" in ex:
        top = surf.top(0, -half + 0.3)[0]
        wing = box((0, -half + 0.3, top.z + 0.3), (W * 0.92, 0.36, 0.06), mats["accent_paint"], bevel=0.025, seg=2, cuts=(3, 0, 0), bend=-0.06, name="wing")
        legs = [box((s * W * 0.28, -half + 0.32, top.z + 0.14), (0.06, 0.18, 0.3), mats["dark"], bevel=0.02, seg=1, name="leg") for s in (-1, 1)]
        out.append(join([wing] + legs, "extra_spoiler"))
    if "fins" in ex:
        fins = []
        for s in (-1, 1):
            base = surf.top(s * W * 0.3, -half + 0.45)[0]
            bm = bmesh.new()
            pts = [(0, 0.5, 0), (0, -0.25, 0), (0, -0.45, 0.55), (0, -0.2, 0.55)]
            vs = [bm.verts.new(c) for c in pts]
            f = bm.faces.new(vs)
            ext = bmesh.ops.extrude_face_region(bm, geom=[f])
            bmesh.ops.translate(bm, vec=(0.06, 0, 0), verts=[gg for gg in ext["geom"] if isinstance(gg, bmesh.types.BMVert)])
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            fin = from_bmesh("fin", bm, mats["accent_paint"], smooth=False)
            mod = fin.modifiers.new("bevel", "BEVEL")
            mod.width = 0.025
            mod.segments = 2
            apply_all(fin)
            smooth(fin)
            fin.data.transform(Matrix.Rotation(-s * 0.15, 4, "Y"))
            fin.data.transform(Matrix.Translation(Vector((base.x - 0.03, base.y, base.z - 0.06))))
            fins.append(fin)
        out.append(join(fins, "extra_fins"))
    if "booster" in ex:
        z = p["zt"] - 0.26
        back = surf.back(0, z)[0]
        y = back.y - 0.1
        body = cylinder((0, y, z), 0.2, 0.36, mats["chrome"], seg=20, axis="Y", radius2=0.16, bevel=0.03)
        ring = cylinder((0, y - 0.2, z), 0.24, 0.06, mats["accent_paint"], seg=20, axis="Y", bevel=0.02)
        nozzle = cylinder((0, y - 0.32, z), 0.15, 0.22, mats["dark"], seg=20, axis="Y", radius2=0.22, bevel=0.02)
        booster = join([body, ring, nozzle], "extra_booster")
        set_origin(booster, (0, y, z))
        fm = material("flame", (1.0, 0.45, 0.02), roughness=0.5, emission=(1.0, 0.4, 0.02), strength=4.0)
        outer = cylinder((0, y - 0.62, z), 0.15, 0.4, fm, seg=14, axis="Y", radius2=0.0)
        outer.data.transform(Matrix.Translation(Vector((0, 0, 0))))
        # cone points backwards (-Y): create_cone puts radius1 at -depth/2 along local Z, which became +Y
        bm = bmesh.new()
        bm.from_mesh(outer.data)
        bmesh.ops.rotate(bm, cent=Vector((0, y - 0.62, z)), matrix=Matrix.Rotation(math.pi, 3, "Z"), verts=bm.verts)
        bm.to_mesh(outer.data)
        bm.free()
        core = cylinder((0, y - 0.55, z), 0.09, 0.26, fm, seg=10, axis="Y", radius2=0.0)
        bm = bmesh.new()
        bm.from_mesh(core.data)
        bmesh.ops.rotate(bm, cent=Vector((0, y - 0.52, z)), matrix=Matrix.Rotation(math.pi, 3, "Z"), verts=bm.verts)
        bm.to_mesh(core.data)
        bm.free()
        flame = join([outer, core], "booster_flame")
        set_origin(flame, (0, y - 0.38, z))
        flame.parent = booster
        flame.matrix_parent_inverse = booster.matrix_world.inverted()
        out.append(booster)
    if "surfboard" in ex:
        sb = material("surfboard", (0.0, 0.75, 0.75), roughness=0.3)
        board = sphere((0, 0, 0), 1, sb, seg=16, rings=10, scale=(0.26, 0.05, 0.85), name="board")
        stripe = box((0, 0.045, 0), (0.08, 0.02, 1.5), mats["accent_paint"], bevel=0.008, seg=1, name="bstripe")
        s = join([board, stripe], "extra_surfboard")
        s.data.transform(Matrix.Rotation(0.35, 4, "Y") @ Matrix.Rotation(-0.25, 4, "X"))
        s.data.transform(Matrix.Translation(Vector((W * 0.2, seat[1] - 0.65, p["zb"] + 0.45))))
        set_origin(s, (W * 0.2, seat[1] - 0.65, p["zb"]))
        out.append(s)
    if "dots" in ex:
        dot_mat = material("bubble_dot", (0.85, 0.95, 1.0), roughness=0.08)
        dots = []
        spots = [(-1, -0.75, 0.62), (-1, -0.55, 0.44), (-1, 0.72, 0.5), (1, -0.75, 0.62), (1, -0.55, 0.44), (1, 0.72, 0.5),
                 (-1, -0.82, 0.38), (1, -0.82, 0.38)]
        for s, v, zf in spots:
            z = p["z0"] + (p["zb"] - p["z0"]) * zf
            loc, n = surf.side(s, v * half, z)
            if loc is None:
                continue
            rr = 0.09 + 0.05 * ((v * 7) % 1)
            dots.append(sphere(loc - n * rr * 0.2, rr, dot_mat, seg=12, rings=6, scale=(1, 1, 0.55), align=n, name="dot"))
        out.append(join(dots, "extra_dots"))
    if "bubble_wand" in ex:
        top = surf.top(0, roof_y - 0.25)[0]
        bm_ = material("bubble", (0.75, 0.9, 1.0), roughness=0.02, alpha=0.4)
        stick = tube([(0.25, top.y, top.z - 0.02), (0.3, top.y - 0.05, top.z + 0.45)], 0.025, mats["accent_paint"], name="stick", sides=6)
        ring = tube([(0.3 + 0.12 * math.cos(a), top.y - 0.05, top.z + 0.57 + 0.12 * math.sin(a)) for a in [i / 12 * math.pi * 2 for i in range(12)]],
                    0.022, mats["accent_paint"], name="ring", closed=True, sides=4)
        b1 = sphere((0.42, top.y - 0.25, top.z + 0.85), 0.2, bm_, seg=16, rings=10, name="bub")
        b2 = sphere((0.2, top.y - 0.45, top.z + 1.08), 0.12, bm_, seg=12, rings=8, name="bub")
        w = join([stick, ring, b1, b2], "extra_bubble")
        set_origin(w, (0.25, top.y, top.z))
        out.append(w)
    if "roof_lamps" in ex:
        top = surf.top(0, roof_y)[0]
        lamp = material("lamp", (1, 0.95, 0.6), roughness=0.1, emission=(1, 0.9, 0.5), strength=1.2)
        bar = [box((0, top.y + 0.2, top.z + 0.1), (W * 0.62, 0.1, 0.08), mats["dark"], bevel=0.03, seg=1, name="lb")]
        for i in range(4):
            x = (-1.5 + i) * W * 0.15
            bar.append(cylinder((x, top.y + 0.27, top.z + 0.2), 0.1, 0.1, mats["dark"], seg=14, axis="Y", bevel=0.02))
            bar.append(cylinder((x, top.y + 0.33, top.z + 0.2), 0.08, 0.03, lamp, seg=14, axis="Y"))
        for s in (-1, 1):
            bar.append(box((s * W * 0.3, top.y + 0.15, top.z + 0.03), (0.06, 0.08, 0.14), mats["dark"], bevel=0.02, seg=1, name="lf"))
        out.append(join(bar, "extra_rack"))
    if "spare_tire" in ex:
        bed_y = (p["a4"] * half - half) / 2
        top = surf.top(0, bed_y)[0]
        spare = wheel("extra_spare", dict(p, r=p["r"] * 0.85, tire_w=0.34, knobby=False), (0, bed_y, top.z + p["r"] * 0.85), mats)
        spare.rotation_euler = (0, 0, math.pi / 2)
        bpy.context.view_layer.objects.active = spare
        # tilt it back against the cab
        spare.rotation_euler = (0.35, 0, math.pi / 2)
        out.append(spare)
    if "stacks" in ex:
        top = surf.top(W * 0.4, p["a4"] * half - 0.12)[0]
        st = []
        for s in (-1, 1):
            y = p["a4"] * half - 0.15
            st.append(cylinder((s * W * 0.4, y, p["zb"] + 0.3), 0.07, 0.75, mats["chrome"], seg=12, bevel=0.015))
            st.append(cylinder((s * W * 0.4, y, p["zb"] + 0.7), 0.085, 0.08, mats["dark"], seg=12, bevel=0.015))
        out.append(join(st, "extra_stacks"))
    if "roll_bar" in ex:
        y = seat[1] - 0.42
        z = p["zb"]
        out.append(tube([(-W * 0.36, y, z - 0.1), (-W * 0.33, y, z + 0.7), (-W * 0.22, y, z + 0.92), (W * 0.22, y, z + 0.92), (W * 0.33, y, z + 0.7),
                         (W * 0.36, y, z - 0.1)], 0.05, mats["dark"], name="extra_rollbar", sides=8))
    if "flag" in ex:
        y = -half + 0.5
        x = -W * 0.24
        top = surf.top(x, y)[0]
        fm = material("flag", (1.0, 0.85, 0.05), roughness=0.5)
        pole = tube([(x, y, top.z - 0.03), (x, y - 0.05, top.z + 1.25)], 0.014, mats["dark"], name="pole", sides=4)
        bm = bmesh.new()
        pts = [(x, y - 0.05, top.z + 1.24), (x, y - 0.5, top.z + 1.12), (x, y - 0.05, top.z + 0.98)]
        vs = [bm.verts.new(c) for c in pts]
        bm.faces.new(vs)
        flag = from_bmesh("pennant", bm, fm, smooth=False)
        mod = flag.modifiers.new("thick", "SOLIDIFY")
        mod.thickness = 0.02
        apply_all(flag)
        f = join([pole, flag], "extra_flag")
        set_origin(f, (x, y, top.z))
        out.append(f)
    if "bumps" in ex:
        bump_mat = material("pickle_bump", (0.35, 0.72, 0.06), roughness=0.5)
        bumps = []
        import random
        rnd = random.Random(4)
        for k in range(26):
            s = -1 if k % 2 else 1
            v = rnd.choice([rnd.uniform(-0.92, -0.45), rnd.uniform(0.62, 0.9)])
            ang = rnd.uniform(0.15, 1.2)
            zc = (p["z0"] + p["zb"]) / 2
            origin = Vector((s * math.cos(ang) * 5, v * half, zc + math.sin(ang) * 5))
            loc, n = surf.hit(origin, Vector((0, v * half, zc)) - origin)
            if loc is None:
                continue
            rr = rnd.uniform(0.045, 0.08)
            bumps.append(sphere(loc - n * rr * 0.25, rr, bump_mat, seg=8, rings=5, scale=(1, 1, 0.6), align=n, name="bump"))
        out.append(join(bumps, "extra_bumps"))
    if "light_bar" in ex:
        top = surf.top(0, roof_y)[0]
        z = top.z + 0.06
        red = material("light_red", (1.0, 0.05, 0.05), roughness=0.2, emission=(1.0, 0.05, 0.05), strength=3.0)
        blue = material("light_blue", (0.1, 0.3, 1.0), roughness=0.2, emission=(0.1, 0.3, 1.0), strength=3.0)
        pieces = [box((0, top.y, z), (1.15, 0.3, 0.06), mats["dark"], bevel=0.025, seg=1, name="base")]
        pieces.append(box((-0.3, top.y, z + 0.1), (0.5, 0.26, 0.16), red, bevel=0.06, seg=2, name="red"))
        pieces.append(box((0.3, top.y, z + 0.1), (0.5, 0.26, 0.16), blue, bevel=0.06, seg=2, name="blue"))
        pieces.append(cylinder((0, top.y + 0.02, z + 0.1), 0.08, 0.16, mats["chrome"], seg=12, axis="Y", bevel=0.02))
        lb = join(pieces, "extra_lightbar")
        set_origin(lb, (0, top.y, z))
        out.append(lb)
    return out


def preview(name, root, parts):
    """Renders a front three-quarter and a back three-quarter view of the car."""
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        pass
    vt = scene.view_settings.bl_rna.properties["view_transform"]
    ids = [i.identifier for i in vt.enum_items]
    for want in ("Standard", "Filmic"):
        if want in ids:
            scene.view_settings.view_transform = want
            break
    for o in parts:
        if o.name == "face_frown":
            o.hide_render = True
        if o.name == "cabin" or o.name.startswith("glass"):
            o.visible_shadow = False
    scene.render.resolution_x = 900
    scene.render.resolution_y = 640
    sun, cam = kit.stage((0.55, 0.7, 0.9), (0.7, 0.2, 0.8))
    ground = link(bpy.data.objects.new("ground", bpy.data.meshes.new("ground")))
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=12)
    bm.to_mesh(ground.data)
    bm.free()
    ground.data.materials.append(material("ground", (0.25, 0.4, 0.2), roughness=0.9))
    cam.data.lens = 50
    target = Vector((0, 0, 0.75))
    for tag, pos in (("front", (5.2, 6.4, 2.6)), ("back", (-4.6, -6.6, 3.0)), ("side", (8.0, 0.0, 1.2))):
        cam.location = pos
        cam.rotation_euler = (target - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEW, f"{name}_{tag}.png")
        bpy.ops.render.render(write_still=True)
    for o in (sun, ground, cam):
        bpy.data.objects.remove(o)


def export(name, root, parts):
    path = os.path.join(OUT, f"car_{name}.glb")
    opts = dict(export_texcoords=False, export_normals=False, export_tangents=False, export_attributes=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties
    vc = props.get("export_vertex_color")
    if vc:
        ids = [i.identifier for i in vc.enum_items]
        if "NONE" in ids:
            opts["export_vertex_color"] = "NONE"
    kit.write_glb(path, [root], **opts)
    verts = {o.name: len(o.data.vertices) for o in root.children_recursive if o.type == "MESH"}
    print(f"exported {path}: {os.path.getsize(path)} bytes, {sum(verts.values())} verts")
    print("  " + ", ".join(f"{k}={v}" for k, v in sorted(verts.items(), key=lambda kv: -kv[1])))


if __name__ == "__main__":
    only = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(CARS)
    for car_name in only:
        build_car(car_name, CARS[car_name])
