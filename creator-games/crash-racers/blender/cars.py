"""
Crash Racers cars. Builds each car from a subdivided box cage shaped into a
body, then splits off the parts the game can damage separately, and exports
one GLB per car to ../models/car_<name>.glb.

Run with:  blender --background --python cars.py
(Or paste into Blender MCP's execute_blender_code, one car at a time.)

Node names the game relies on:
  body            dense shell that dents
  hood, door_l, door_r, bumper_f, bumper_r      parts that loosen and tear off
  glass_f, glass_r, glass_l, glass_r_side       windows that crack and shatter
  wheel_fl, wheel_fr, wheel_rl, wheel_rr        origin at the hub
  light_f, light_r                              head and tail lights
  extra_*                                       decorations (spoiler, roof sign, ...)
Blender +Y is the car's front; glTF export turns that into three.js -Z.
"""
import math
import os

import bmesh
import bpy
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models")

CARS = {
    # L, W: length and width. z0: underbody. zb: beltline. zr: roof.
    # zh_f/zh_r: hood height at the nose and at the windshield. zt: trunk height.
    # a1..a4: windshield base, roof front, roof back, rear window base (as -1..1 along the length).
    "rocket": dict(color=(0.85, 0.05, 0.04), L=4.3, W=1.86, z0=0.16, zb=0.72, zr=1.12, zh_f=0.55, zh_r=0.74, zt=0.72,
                   a1=0.22, a2=-0.05, a3=-0.35, a4=-0.62, r=0.34, extras=["spoiler"]),
    "sunny": dict(color=(0.98, 0.72, 0.02), L=4.5, W=1.8, z0=0.2, zb=0.9, zr=1.45, zh_f=0.78, zh_r=0.92, zt=0.92,
                  a1=0.32, a2=0.12, a3=-0.38, a4=-0.55, r=0.33, extras=["taxi_sign"]),
    "bubbles": dict(color=(0.35, 0.72, 0.95), L=3.7, W=1.68, z0=0.22, zb=0.82, zr=1.5, zh_f=0.6, zh_r=0.86, zt=0.7,
                    a1=0.4, a2=0.12, a3=-0.2, a4=-0.5, r=0.32, extras=[]),
    "bruno": dict(color=(0.18, 0.55, 0.2), L=4.4, W=1.92, z0=0.36, zb=1.12, zr=1.86, zh_f=1.02, zh_r=1.14, zt=1.14,
                  a1=0.36, a2=0.24, a3=-0.92, a4=-0.97, r=0.42, extras=["spare_tire", "roof_rack"]),
    "pickle": dict(color=(0.72, 0.35, 0.86), L=4.8, W=1.9, z0=0.24, zb=1.0, zr=1.85, zh_f=0.86, zh_r=1.02, zt=1.02,
                   a1=0.52, a2=0.3, a3=-0.92, a4=-0.97, r=0.36, extras=[]),
    "siren": dict(color=(0.95, 0.95, 0.97), L=4.6, W=1.84, z0=0.2, zb=0.88, zr=1.42, zh_f=0.76, zh_r=0.9, zt=0.9,
                  a1=0.3, a2=0.1, a3=-0.36, a4=-0.55, r=0.34, extras=["light_bar", "police_doors"]),
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, metallic=0.0, roughness=0.5, alpha=1.0, emission=None, coat=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if not m.node_tree:
        m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
        for attr, value in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(m, attr, value)
            except (AttributeError, TypeError):
                pass
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = 2.0
    return m


def lerp(a, b, t):
    return a + (b - a) * max(0.0, min(1.0, t))


def top_height(p, v):
    """Height of the car's top surface at length position v (-1 rear .. 1 front)."""
    if v >= p["a1"]:
        return lerp(p["zh_r"], p["zh_f"], (v - p["a1"]) / (1 - p["a1"])) + 0.03 * math.cos((v - p["a1"]) / (1 - p["a1"]) * math.pi / 2)
    if v >= p["a2"]:
        return lerp(p["zr"], p["zh_r"], (v - p["a2"]) / (p["a1"] - p["a2"]))
    if v >= p["a3"]:
        mid = (p["a2"] + p["a3"]) / 2
        return p["zr"] + 0.02 * (1 - ((v - mid) / ((p["a2"] - p["a3"]) / 2 + 1e-6)) ** 2)
    if v >= p["a4"]:
        return lerp(p["zt"], p["zr"], (v - p["a4"]) / (p["a3"] - p["a4"] + 1e-6))
    return lerp(p["zt"] - 0.06, p["zt"], (v + 1) / (p["a4"] + 1))


def build_body(p):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=7, use_grid_fill=True)
    belt_fraction = 0.6
    for vert in bm.verts:
        u, v, w = vert.co.x, vert.co.y, vert.co.z  # each in -1..1
        t = (w + 1) / 2
        top = top_height(p, v)
        lower_top = min(top, p["zb"])
        if t <= belt_fraction:
            z = lerp(p["z0"], lower_top, t / belt_fraction)
        else:
            z = lerp(lower_top, top, (t - belt_fraction) / (1 - belt_fraction))
        tumble = max(0.0, min(1.0, (z - p["zb"]) / max(0.01, p["zr"] - p["zb"])))
        width = p["W"] / 2 * (1 - 0.26 * tumble)
        nose = max(0.0, (abs(v) - 0.82) / 0.18)
        width *= 1 - 0.07 * nose * nose
        vert.co = Vector((u * width, v * p["L"] / 2, z))
    mesh = bpy.data.meshes.new("body")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("body", mesh)
    bpy.context.collection.objects.link(obj)
    sub = obj.modifiers.new("smooth", "SUBSURF")
    sub.levels = 2
    sub.render_levels = 2
    apply_all(obj)
    # Wheel wells: one combined cutter in a single boolean is far more robust than four.
    cutters = []
    for x_side in (-1, 1):
        for y in wheel_ys(p):
            bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=p["r"] + 0.07, depth=0.9,
                                                location=(x_side * p["W"] / 2, y, p["r"] + 0.02), rotation=(0, math.pi / 2, 0))
            cutters.append(bpy.context.object)
    bpy.ops.object.select_all(action="DESELECT")
    for c in cutters:
        c.select_set(True)
    bpy.context.view_layer.objects.active = cutters[0]
    bpy.ops.object.join()
    cutter = cutters[0]
    boolean = obj.modifiers.new("arches", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.object = cutter
    boolean.solver = "EXACT"
    apply_all(obj)
    bpy.data.objects.remove(cutter)
    # Safety net: drop any stray geometry outside the body's width.
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    def is_stray(c):
        if abs(c.x) > p["W"] / 2 + 0.02 or c.z < p["z0"] - 0.03:
            return True
        # Leftovers inside a wheel well
        return any(math.hypot(c.y - y, c.z - (p["r"] + 0.02)) < p["r"] + 0.04 for y in wheel_ys(p)) and abs(c.x) > p["W"] / 2 - 0.45
    stray = [f for f in bm.faces if is_stray(f.calc_center_median()) or any(abs(v.co.x) > p["W"] / 2 + 0.02 for v in f.verts)]
    bmesh.ops.delete(bm, geom=stray, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    # Booleans copy the cutters' (empty) material slots; start clean.
    obj.data.materials.clear()
    obj.data.validate()
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()
    return obj


def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def wheel_ys(p):
    return (p["L"] * 0.32, -p["L"] * 0.31)


def split_faces(body, name, predicate, offset, under_material_index=None):
    """Copies the body faces matching predicate into a new object, pushed out along their normals."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.faces.ensure_lookup_table()
    picked = [f for f in bm.faces if predicate(f.calc_center_median(), f.normal)]
    if not picked:
        bm.free()
        return None
    copy = bmesh.new()
    vmap = {}
    for f in picked:
        verts = []
        for v in f.verts:
            if v.index not in vmap:
                vmap[v.index] = copy.verts.new(v.co + v.normal * offset)
            verts.append(vmap[v.index])
        copy.faces.new(verts)
        if under_material_index is not None:
            f.material_index = under_material_index
    bm.to_mesh(body.data)
    bm.free()
    mesh = bpy.data.meshes.new(name)
    copy.to_mesh(mesh)
    copy.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()
    return obj


def set_origin(obj, point):
    """Moves the object's origin to point (world space) without moving its geometry."""
    offset = Vector(point) - obj.location
    obj.data.transform(__import__("mathutils").Matrix.Translation(-offset))
    obj.location = Vector(point)


def rounded_box(name, size, location, mat, bevel=0.05, cuts=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    bm.to_mesh(obj.data)
    bm.free()
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = bevel
    mod.segments = 3
    apply_all(obj)
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def wheel(name, p, location, mats):
    r = p["r"]
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=r, depth=0.26, location=location, rotation=(0, math.pi / 2, 0))
    tire = bpy.context.object
    mod = tire.modifiers.new("bevel", "BEVEL")
    mod.width = 0.07
    mod.segments = 4
    apply_all(tire)
    tire.data.materials.append(mats["tire"])
    bpy.ops.object.shade_smooth()
    side = 1 if location[0] > 0 else -1
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r * 0.62, depth=0.06, location=(location[0] + side * 0.11, location[1], location[2]),
                                        rotation=(0, math.pi / 2, 0))
    rim = bpy.context.object
    rim.data.materials.append(mats["chrome"])
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=r * 0.2, depth=0.08, location=(location[0] + side * 0.14, location[1], location[2]),
                                        rotation=(0, math.pi / 2, 0))
    hub = bpy.context.object
    hub.data.materials.append(mats["dark"])
    for o in (tire, rim, hub):
        o.select_set(True)
    bpy.context.view_layer.objects.active = tire
    bpy.ops.object.join()
    tire.name = name
    tire.data.name = name
    set_origin(tire, location)
    return tire


def build_car(name, p):
    reset()
    mats = {
        "paint": material(f"paint_{name}", p["color"], metallic=0.35, roughness=0.28, coat=1.0),
        "interior": material("interior", (0.03, 0.03, 0.035), roughness=0.9),
        "engine": material("engine", (0.12, 0.12, 0.13), metallic=0.6, roughness=0.5),
        "glass": material("glass", (0.15, 0.22, 0.28), metallic=0.1, roughness=0.05, alpha=0.45),
        "tire": material("tire", (0.03, 0.03, 0.03), roughness=0.85),
        "chrome": material("chrome", (0.85, 0.85, 0.88), metallic=1.0, roughness=0.15),
        "dark": material("dark_plastic", (0.06, 0.06, 0.07), roughness=0.6),
        "headlight": material("headlight", (1, 1, 0.95), roughness=0.1, emission=(1, 0.97, 0.85)),
        "taillight": material("taillight", (0.8, 0.02, 0.02), roughness=0.2, emission=(1, 0.05, 0.03)),
        "white": material("white_paint", (0.95, 0.95, 0.96), metallic=0.3, roughness=0.3, coat=1.0),
        "black": material("black_paint", (0.04, 0.04, 0.05), metallic=0.3, roughness=0.3, coat=1.0),
        "yellow": material("sign_yellow", (1, 0.85, 0.1), roughness=0.3, emission=(1, 0.8, 0.1)),
        "blue_light": material("light_blue", (0.1, 0.3, 1.0), roughness=0.2, emission=(0.1, 0.3, 1.0)),
        "red_light": material("light_red", (1.0, 0.05, 0.05), roughness=0.2, emission=(1.0, 0.05, 0.05)),
    }
    body = build_body(p)
    body.data.materials.append(mats["paint"])     # 0
    body.data.materials.append(mats["interior"])  # 1
    body.data.materials.append(mats["engine"])    # 2
    L, W = p["L"], p["W"]
    half = L / 2
    vy = lambda co: co.y / half  # position along the length, -1..1
    a1, a2, a3, a4, zb, z0 = p["a1"], p["a2"], p["a3"], p["a4"], p["zb"], p["z0"]
    b_pillar = (a2 + a3) / 2

    # Underbody is dark
    bm = bmesh.new()
    bm.from_mesh(body.data)
    for f in bm.faces:
        if f.normal.z < -0.7:
            f.material_index = 1
    bm.to_mesh(body.data)
    bm.free()

    parts = [body]
    glass = mats["glass"]
    # Windows: faces above the beltline, away from the pillars
    def side_window(c, n, side):
        v = vy(c)
        return (side * n.x > 0.55 and c.z > zb + 0.04 and c.z < p["zr"] - 0.05 and a4 + 0.06 < v < a1 - 0.05
                and abs(v - b_pillar) > 0.035)
    specs = [
        ("glass_f", lambda c, n: n.y > 0.25 and n.z > 0.15 and a2 + 0.02 < vy(c) < a1 - 0.02 and abs(c.x) < W * 0.36),
        ("glass_r", lambda c, n: n.y < -0.25 and c.z > zb + 0.04 and a4 + 0.02 < vy(c) < a3 - 0.01 and abs(c.x) < W * 0.36),
        ("glass_l", lambda c, n: side_window(c, n, -1)),
        ("glass_r_side", lambda c, n: side_window(c, n, 1)),
    ]
    for glass_name, pred in specs:
        g = split_faces(body, glass_name, pred, 0.006, under_material_index=1)
        if g:
            g.data.materials.append(glass)
            parts.append(g)

    # Doors: below the windows, between the wheels; hinged at the front edge
    door_front, door_back = min(a1, 0.22), max(a3 + 0.05, -0.2)
    for door_name, side in (("door_l", -1), ("door_r", 1)):
        d = split_faces(body, door_name, lambda c, n, s=side: s * n.x > 0.6 and z0 + 0.18 < c.z < zb - 0.02 and door_back < vy(c) < door_front,
                        0.012, under_material_index=1)
        if d:
            mat = mats["paint"]
            if "police_doors" in p["extras"]:
                mat = mats["white"]
            d.data.materials.append(mat)
            set_origin(d, (side * W / 2, door_front * half, (z0 + zb) / 2))
            parts.append(d)

    # Hood: top faces in front of the windshield; hinged at the back
    h = split_faces(body, "hood", lambda c, n: n.z > 0.55 and vy(c) > a1 + 0.05 and abs(c.x) < W * 0.42, 0.01, under_material_index=2)
    if h:
        h.data.materials.append(mats["black"] if "police_doors" in p["extras"] else mats["paint"])
        set_origin(h, (0, (a1 + 0.05) * half, p["zh_r"]))
        parts.append(h)

    if "police_doors" in p["extras"]:
        # Black lower body, white doors and roof, like a classic patrol car
        bm = bmesh.new()
        bm.from_mesh(body.data)
        body.data.materials.append(mats["black"])  # 3
        for f in bm.faces:
            c = f.calc_center_median()
            if f.material_index == 0 and (abs(vy(c)) > 0.45 or c.z < z0 + 0.25):
                f.material_index = 3
        bm.to_mesh(body.data)
        bm.free()

    # Bumpers
    bumper_z = z0 + 0.14
    parts.append(rounded_box("bumper_f", (W * 0.94, 0.22, 0.24), (0, half - 0.02, bumper_z), mats["dark"], bevel=0.06))
    parts.append(rounded_box("bumper_r", (W * 0.94, 0.22, 0.24), (0, -half + 0.02, bumper_z), mats["dark"], bevel=0.06))

    # Lights
    for side in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.13, location=(side * W * 0.34, half - 0.08, p["zh_f"] - 0.06))
        o = bpy.context.object
        o.scale = (1.2, 0.5, 0.7)
        o.data.materials.append(mats["headlight"])
        parts.append(o)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(side * W * 0.36, -half + 0.05, p["zt"] - 0.12))
        o = bpy.context.object
        o.scale = (0.3, 0.08, 0.14)
        o.data.materials.append(mats["taillight"])
        parts.append(o)
    heads = [o for o in parts if o.data.materials and o.data.materials[0] == mats["headlight"]]
    tails = [o for o in parts if o.data.materials and o.data.materials[0] == mats["taillight"]]
    for group, gname in ((heads, "light_f"), (tails, "light_r")):
        bpy.ops.object.select_all(action="DESELECT")
        for o in group:
            o.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bpy.ops.object.join()
        group[0].name = gname
        group[0].data.name = gname
        for o in group[1:]:
            if o in parts:
                parts.remove(o)

    # Wheels
    r = p["r"]
    wy_f, wy_r = wheel_ys(p)
    for wname, x, y in (("wheel_fl", -1, wy_f), ("wheel_fr", 1, wy_f), ("wheel_rl", -1, wy_r), ("wheel_rr", 1, wy_r)):
        parts.append(wheel(wname, p, (x * (W / 2 - 0.14), y, r), mats))

    # Extras
    if "spoiler" in p["extras"]:
        s = rounded_box("extra_spoiler", (W * 0.85, 0.28, 0.05), (0, -half + 0.25, p["zt"] + 0.22), mats["black"], bevel=0.02, cuts=1)
        for side in (-1, 1):
            bpy.ops.mesh.primitive_cube_add(size=1, location=(side * W * 0.3, -half + 0.28, p["zt"] + 0.1))
            leg = bpy.context.object
            leg.scale = (0.05, 0.12, 0.22)
            leg.data.materials.append(mats["black"])
            leg.select_set(True)
        s.select_set(True)
        bpy.context.view_layer.objects.active = s
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bpy.ops.object.join()
        parts.append(s)
    if "taxi_sign" in p["extras"]:
        parts.append(rounded_box("extra_sign", (0.7, 0.3, 0.2), (0, (a2 + a3) / 2 * half, p["zr"] + 0.12), mats["yellow"], bevel=0.05, cuts=1))
    if "light_bar" in p["extras"]:
        bar = rounded_box("extra_lightbar", (0.5, 0.25, 0.14), (-0.27, (a2 + a3) / 2 * half, p["zr"] + 0.09), mats["blue_light"], bevel=0.04, cuts=1)
        red = rounded_box("extra_lightbar_red", (0.5, 0.25, 0.14), (0.27, (a2 + a3) / 2 * half, p["zr"] + 0.09), mats["red_light"], bevel=0.04, cuts=1)
        bpy.ops.object.select_all(action="DESELECT")
        bar.select_set(True)
        red.select_set(True)
        bpy.context.view_layer.objects.active = bar
        bpy.ops.object.join()
        parts.append(bar)
    if "spare_tire" in p["extras"]:
        t = wheel("extra_spare", p, (0, -half - 0.1, p["zb"] - 0.1), mats)
        t.rotation_euler = (0, 0, math.pi / 2)
        parts.append(t)
    if "roof_rack" in p["extras"]:
        rack = rounded_box("extra_rack", (W * 0.7, L * 0.5, 0.06), (0, -0.1, p["zr"] + 0.08), mats["dark"], bevel=0.02, cuts=1)
        parts.append(rack)

    # Side mirrors (break off easily) and license plates
    for side, mname in ((-1, "mirror_l"), (1, "mirror_r")):
        m = rounded_box(mname, (0.2, 0.08, 0.12), (side * (W / 2 * 0.84 + 0.1), (a1 - 0.02) * half, zb + 0.05),
                        mats["black"] if "police_doors" in p["extras"] else mats["paint"], bevel=0.03, cuts=1)
        set_origin(m, (side * W / 2 * 0.84, (a1 - 0.02) * half, zb + 0.05))
        parts.append(m)
    plate_mat = material("plate", (0.95, 0.95, 0.9), roughness=0.4)
    for y, pname in ((half + 0.1, "extra_plate_f"), (-half - 0.1, "extra_plate_r")):
        parts.append(rounded_box(pname, (0.5, 0.02, 0.12), (0, y, z0 + 0.14), plate_mat, bevel=0.01, cuts=0))

    # Group under one root and export
    root = bpy.data.objects.new(f"car_{name}", None)
    bpy.context.collection.objects.link(root)
    for o in parts:
        o.parent = root
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for o in parts:
        o.select_set(True)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"car_{name}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    tris = sum(len(o.data.polygons) for o in parts)
    print(f"exported {path} ({tris} faces, {os.path.getsize(path)} bytes)")


if __name__ == "__main__":
    import sys
    only = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(CARS)
    for car_name in only:
        build_car(car_name, CARS[car_name])
