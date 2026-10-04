"""
Bunny Hop models. Builds every model procedurally and exports two GLBs:

  ../public/models/bunny.glb   the hero, "Pip" the bunny
  ../public/models/world.glb   collectibles, obstacles and scenery, one top-level node each

Run with:  blender --background --python models.py

Axes: Blender +X is "forward" (the bunny runs towards three.js +X), Blender -Y faces the
camera (three.js +Z). Everything stands on its origin at ground level, except carrots,
clouds and the butterfly, which are centred on their origin.

Node names the game relies on (public/js/models.js):

  bunny            root of the hero, at the feet
    bunny_body     body + scarf, pivot at the hips (not animated itself: the game squashes the whole bunny)
    bunny_head     pivot at the neck (nods, tilts)
      bunny_ear_L / bunny_ear_R   pivot at the ear root (flop with spring physics)
      bunny_eyes   both eyes, pivot at their centre (scaled flat to blink)
    bunny_arm_L / bunny_arm_R     front paws, pivot at the shoulder
    bunny_leg_L / bunny_leg_R     hind legs, pivot at the hip (kick back on take-off)
    bunny_tail     pivot at its base (wiggles)
  (_L is the far side, Blender +Y; _R is the side facing the camera)

  carrot, carrot_gold                       collectibles
  log, rock, stump, toadstool, pumpkin, snowman   obstacles to hop over
  tree_round, tree_pine, tree_pine_snow, bush, flower, grass, mushroom_red,
  mushroom_blue, fence, cloud, burrow        scenery
  butterfly with butterfly_wing_L / butterfly_wing_R (flap)

Materials the game recolours per biome, by material name: canopy, pine, bush, grass,
petal, wing.
"""
import math
import os

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "public", "models")


# --- Materials ------------------------------------------------------------------------

def rgb(hex_color):
    h = hex_color.lstrip("#")
    # sRGB -> linear, so colours in the GLB match what we pick here
    return tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (0, 2, 4))


def mat(name, hex_color, rough=0.65, metal=0.0, emit=None):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    if not m.node_tree:
        m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb(hex_color), 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*rgb(emit), 1)
        bsdf.inputs["Emission Strength"].default_value = 0.6
    return m


# --- Mesh helpers ---------------------------------------------------------------------

def link(me, name):
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return o


def bake(o, m, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0)):
    """Bake a transform into the mesh so the object sits at the world origin."""
    o.data.transform(Matrix.Translation(Vector(loc)) @ _rot(rot) @ Matrix.Diagonal((*scale, 1)))
    o.data.materials.clear()
    o.data.materials.append(m)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def _rot(rot):
    return Euler(rot).to_matrix().to_4x4()


def sphere(m, r, loc, scale=(1, 1, 1), rot=(0, 0, 0), seg=20, rings=12):
    me = bpy.data.meshes.new("s")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    bm.to_mesh(me)
    bm.free()
    return bake(link(me, "s"), m, loc, scale, rot)


def ico(m, r, loc, scale=(1, 1, 1), rot=(0, 0, 0), subdiv=2, lumpy=0.0, seed=0.0):
    me = bpy.data.meshes.new("i")
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    if lumpy:
        for v in bm.verts:
            n = noise.noise(v.co * (2.2 / r) + Vector((seed, seed * 1.7, seed * 0.3)))
            v.co *= 1 + lumpy * n
    bm.to_mesh(me)
    bm.free()
    return bake(link(me, "i"), m, loc, scale, rot)


def cyl(m, r, depth, loc, rot=(0, 0, 0), verts=16, r2=None, scale=(1, 1, 1)):
    me = bpy.data.meshes.new("c")
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r,
                          radius2=r if r2 is None else r2, depth=depth)
    bm.to_mesh(me)
    bm.free()
    return bake(link(me, "c"), m, loc, scale, rot)


def torus(m, R, r, loc, rot=(0, 0, 0), seg=24, ring=8, scale=(1, 1, 1)):
    me = bpy.data.meshes.new("t")
    bm = bmesh.new()
    verts = []
    for i in range(seg):
        a = i / seg * math.tau
        row = []
        for j in range(ring):
            b = j / ring * math.tau
            row.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b))))
        verts.append(row)
    for i in range(seg):
        for j in range(ring):
            a, b = verts[i][j], verts[(i + 1) % seg][j]
            c, d = verts[(i + 1) % seg][(j + 1) % ring], verts[i][(j + 1) % ring]
            bm.faces.new((a, b, c, d))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return bake(link(me, "t"), m, loc, scale, rot)


def lathe(m, profile, loc=(0, 0, 0), seg=24, rfn=None, steps=3, scale=(1, 1, 1), rot=(0, 0, 0)):
    """Surface of revolution around Z. profile: [(radius, z)], bottom to top; radius 0 makes a pole.
    rfn(radius, theta, z) can wobble the radius (pumpkin lobes, carrot ridges)."""
    pts = []
    for k in range(len(profile) - 1):
        (r0, z0), (r1, z1) = profile[k], profile[k + 1]
        for s in range(steps):
            t = s / steps
            pts.append((r0 + (r1 - r0) * t, z0 + (z1 - z0) * t))
    pts.append(profile[-1])
    me = bpy.data.meshes.new("l")
    bm = bmesh.new()
    rings = []
    for r, z in pts:
        if r < 1e-5:
            rings.append([bm.verts.new((0, 0, z))])
            continue
        ring = []
        for i in range(seg):
            th = i / seg * math.tau
            rr = rfn(r, th, z) if rfn else r
            ring.append(bm.verts.new((rr * math.cos(th), rr * math.sin(th), z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        for i in range(seg):
            j = (i + 1) % seg
            if len(a) == 1:
                bm.faces.new((a[0], b[i], b[j]))
            elif len(b) == 1:
                bm.faces.new((a[i], b[0], a[j]))
            else:
                bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return bake(link(me, "l"), m, loc, scale, rot)


def rounded_box(m, size, loc, rot=(0, 0, 0), bevel=0.04):
    me = bpy.data.meshes.new("b")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bm.to_mesh(me)
    bm.free()
    o = link(me, "b")
    o.data.transform(Matrix.Diagonal((*size, 1)))
    mod = o.modifiers.new("bevel", "BEVEL")
    mod.width = bevel
    mod.segments = 3
    dg = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.clear()
    o.data = baked
    return bake(o, m, loc, (1, 1, 1), rot)


def join(parts, name, sharp_deg=55):
    """One mesh per part (several materials allowed); hard edges above sharp_deg stay crisp."""
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    limit = math.radians(sharp_deg)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0) < limit
    bm.to_mesh(o.data)
    bm.free()
    return o


def empty(name, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    o.location = loc
    bpy.context.collection.objects.link(o)
    return o


def pivot(o, p, parent=None, parent_pivot=(0, 0, 0)):
    """Move the object's origin to world point p and hang it from parent (which has no rotation)."""
    p = Vector(p)
    o.data.transform(Matrix.Translation(-p))
    o.parent = parent
    o.location = p - Vector(parent_pivot)
    return o


def on_ellipsoid(center, radii, direction, lift=0.0):
    d = Vector(direction).normalized()
    # scale a unit direction onto the ellipsoid surface
    k = 1 / math.sqrt(sum((d[i] / radii[i]) ** 2 for i in range(3)))
    n = Vector((d[0] / radii[0] ** 2, d[1] / radii[1] ** 2, d[2] / radii[2] ** 2)).normalized()
    return Vector(center) + d * k + n * lift, n


# --- The bunny ------------------------------------------------------------------------

def bunny():
    fur = mat("fur", "#f0b47a", rough=0.85)
    cream = mat("cream", "#fff6e8", rough=0.85)
    pink = mat("ear_pink", "#ff9fba", rough=0.7)
    nose = mat("nose", "#ff5f8f", rough=0.35)
    blush = mat("blush", "#ffb0c4", rough=0.9)
    eye = mat("eye", "#2a1a17", rough=0.12)
    shine = mat("eye_shine", "#ffffff", rough=0.2, emit="#ffffff")
    tooth = mat("tooth", "#ffffff", rough=0.4)
    scarf = mat("scarf", "#36a8ff", rough=0.6)
    scarf_dot = mat("scarf_dot", "#ffffff", rough=0.6)

    root = empty("bunny")

    # Body: a soft pear with a cream tummy, wearing a little blue scarf
    body_c, body_r = Vector((0.0, 0.0, 0.6)), (0.5, 0.43, 0.48)
    parts = [sphere(fur, 1, body_c, body_r, seg=28, rings=18)]
    tummy, n = on_ellipsoid(body_c, body_r, (0.85, -0.2, -0.1), lift=-0.12)
    parts.append(sphere(cream, 1, tummy, (0.17, 0.26, 0.3), rot=(0, 0, math.atan2(n.y, n.x)), seg=20))
    # scarf: a ring round the neck, tilted so it shows under the chin, knotted on the camera side
    parts.append(torus(scarf, 0.34, 0.09, (0.22, 0, 0.95), rot=(0, math.radians(35), 0), seg=28, ring=10, scale=(1.0, 1.06, 1)))
    knot = Vector((0.12, -0.37, 1.0))
    parts.append(sphere(scarf, 0.085, knot, (0.9, 0.7, 1), seg=12, rings=8))
    parts.append(rounded_box(scarf, (0.28, 0.05, 0.12), knot + Vector((-0.15, -0.03, -0.08)), rot=(0.2, 0.55, 0.25), bevel=0.02))
    parts.append(rounded_box(scarf, (0.22, 0.05, 0.11), knot + Vector((-0.1, -0.05, -0.18)), rot=(0.1, 0.95, 0.15), bevel=0.02))
    for q in ((-0.06, -0.41, 0.93), (-0.01, -0.43, 0.82)):
        parts.append(sphere(scarf_dot, 0.024, q, (1, 0.5, 1), seg=8, rings=6))
    pivot(join(parts, "bunny_body"), (0, 0, 0.25), root)

    # Head
    head_c, head_r = Vector((0.43, 0, 1.24)), (0.4, 0.42, 0.37)
    parts = [sphere(fur, 1, head_c, head_r, seg=28, rings=18)]
    for s in (-1, 1):
        muzzle, n = on_ellipsoid(head_c, head_r, (1, 0.28 * s, -0.42), lift=-0.06)
        parts.append(sphere(cream, 0.13, muzzle, (1, 1, 0.85), seg=16, rings=10))
        cheek, n = on_ellipsoid(head_c, head_r, (0.55, 0.85 * s, -0.25), lift=-0.01)
        parts.append(sphere(blush, 0.085, cheek, (0.35, 1, 0.75), rot=(0, 0, math.atan2(n.y, n.x)), seg=12, rings=8))
    tip, n = on_ellipsoid(head_c, head_r, (1, 0, -0.2), lift=0.03)
    parts.append(sphere(nose, 0.062, tip, (0.8, 1.25, 0.85), seg=12, rings=8))
    parts.append(rounded_box(tooth, (0.04, 0.1, 0.075), tip + Vector((-0.04, 0, -0.16)), bevel=0.012))
    head = pivot(join(parts, "bunny_head"), (0.32, 0, 0.98), root)

    # Eyes: big glossy beads with sparkles, kept apart so the game can blink them
    parts = []
    eye_pts = []
    for s in (-1, 1):
        e, n = on_ellipsoid(head_c, head_r, (0.72, 0.58 * s, 0.18), lift=-0.02)
        eye_pts.append(e)
        parts.append(sphere(eye, 0.088, e, (0.55, 0.85, 1.12), rot=(0, 0, math.atan2(n.y, n.x)), seg=16, rings=12))
        flat = Vector((1, 0, 0)).rotation_difference(n).to_euler()
        parts.append(sphere(shine, 0.03, e + n * 0.04 + Vector((0.0, 0, 0.035)), (0.4, 1, 1), rot=flat, seg=10, rings=6))
        parts.append(sphere(shine, 0.015, e + n * 0.044 + Vector((0.02, 0, -0.03)), (0.4, 1, 1), rot=flat, seg=8, rings=4))
    centre = (eye_pts[0] + eye_pts[1]) / 2
    pivot(join(parts, "bunny_eyes"), centre, head, head.location)

    # Ears: long and soft, with pink insides; pivot at the root so they can flop
    for s, side in ((1, "L"), (-1, "R")):
        parts = [
            sphere(fur, 1, (0, 0, 0.42), (0.08, 0.15, 0.46), seg=18, rings=14),
            sphere(pink, 1, (0.045, 0, 0.44), (0.05, 0.095, 0.37), seg=16, rings=12),
        ]
        ear = join(parts, f"bunny_ear_{side}")
        ear.data.transform(_rot((s * -0.22, -0.2, s * -0.25)))
        base = Vector((0.36, 0.16 * s, 1.5))
        ear.data.transform(Matrix.Translation(base))
        pivot(ear, base, head, head.location)

    # Front paws
    for s, side in ((1, "L"), (-1, "R")):
        parts = [sphere(fur, 1, (0.33, 0.2 * s, 0.32), (0.11, 0.1, 0.17), rot=(0, -0.4, 0), seg=14, rings=10),
                 sphere(cream, 1, (0.4, 0.2 * s, 0.17), (0.12, 0.095, 0.085), seg=14, rings=10)]
        pivot(join(parts, f"bunny_arm_{side}"), (0.28, 0.2 * s, 0.45), root)

    # Hind legs: chunky thighs with big feet
    for s, side in ((1, "L"), (-1, "R")):
        parts = [sphere(fur, 1, (-0.14, 0.3 * s, 0.33), (0.25, 0.14, 0.24), seg=18, rings=12),
                 sphere(cream, 1, (0.02, 0.31 * s, 0.085), (0.27, 0.12, 0.085), seg=18, rings=10)]
        pivot(join(parts, f"bunny_leg_{side}"), (-0.12, 0.3 * s, 0.4), root)

    # Puffy tail
    parts = [ico(cream, 0.17, (-0.52, 0, 0.62), subdiv=2, lumpy=0.18, seed=3.0)]
    for dx, dy, dz in ((0.05, 0.08, 0.06), (0.04, -0.08, 0.05), (-0.04, 0, 0.1)):
        parts.append(ico(cream, 0.09, (-0.52 + dx, dy, 0.62 + dz), subdiv=2, lumpy=0.1, seed=dx * 9))
    pivot(join(parts, "bunny_tail", sharp_deg=180), (-0.44, 0, 0.6), root)
    return root


# --- Collectibles ---------------------------------------------------------------------

def carrot(name, body_mat, leaf_mat):
    root = empty(name)
    ridge = lambda r, th, z: r * (1 + 0.05 * math.sin(z * 55) + 0.02 * math.sin(th * 5))
    prof = [(0, -0.42), (0.04, -0.34), (0.085, -0.2), (0.125, -0.04), (0.155, 0.12), (0.165, 0.22), (0.14, 0.3), (0.07, 0.34), (0, 0.35)]
    parts = [lathe(body_mat, prof, seg=18, rfn=ridge, steps=3)]
    for k in range(3):
        a = (k - 1) * 0.45
        parts.append(sphere(leaf_mat, 1, (math.sin(a) * 0.11, 0, 0.5), (0.055, 0.03, 0.2), rot=(0, a, 0), seg=10, rings=8))
    parts.append(sphere(leaf_mat, 1, (0, 0.05, 0.47), (0.04, 0.03, 0.15), rot=(-0.5, 0, 0), seg=10, rings=8))
    join(parts, f"{name}_mesh").parent = root
    return root


# --- Obstacles ------------------------------------------------------------------------

def log():
    root = empty("log")
    bark = mat("bark", "#9a6235", rough=0.95)
    inner = mat("wood_inner", "#f4cf92", rough=0.8)
    ring = mat("wood_ring", "#d79b55", rough=0.8)
    moss = mat("moss", "#7cc243", rough=0.9)
    r, L = 0.34, 1.5
    knobbly = lambda rr, th, z: rr * (1 + 0.05 * math.sin(th * 7 + z * 3) + 0.03 * math.sin(th * 13))
    parts = [lathe(bark, [(0, -L / 2), (r * 0.9, -L / 2), (r, -L / 2 + 0.04), (r, L / 2 - 0.04), (r * 0.9, L / 2), (0, L / 2)],
                   seg=22, rfn=knobbly, steps=4, rot=(math.pi / 2, 0, 0), loc=(0, 0, r))]
    for s in (-1, 1):
        parts.append(cyl(inner, r * 0.86, 0.02, (0, s * (L / 2 + 0.005), r), rot=(math.pi / 2, 0, 0), verts=22))
        parts.append(torus(ring, r * 0.55, 0.012, (0, s * (L / 2 + 0.016), r), rot=(math.pi / 2, 0, 0), seg=22, ring=4))
        parts.append(torus(ring, r * 0.28, 0.012, (0, s * (L / 2 + 0.016), r), rot=(math.pi / 2, 0, 0), seg=16, ring=4))
    parts.append(ico(moss, 0.2, (0.05, 0.25, r * 2 - 0.02), (1.3, 1.6, 0.35), lumpy=0.3, seed=1))
    parts += mushroom_parts(0.18, (0.1, -0.35, r * 1.9), mat("cap_red", "#ff4b4b", rough=0.45))
    join(parts, "log_mesh").parent = root
    return root


def rock():
    root = empty("rock")
    stone = mat("stone", "#a6b1bf", rough=0.9)
    moss = mat("moss", "#7cc243", rough=0.9)
    parts = [ico(stone, 0.42, (0, 0, 0.3), (1.2, 1.0, 0.85), subdiv=3, lumpy=0.16, seed=7.0),
             ico(stone, 0.22, (0.45, -0.2, 0.14), (1, 1, 0.75), subdiv=2, lumpy=0.2, seed=2.0),
             ico(moss, 0.28, (-0.08, 0.05, 0.62), (1.3, 1.2, 0.3), subdiv=2, lumpy=0.35, seed=4.0)]
    join(parts, "rock_mesh", sharp_deg=180).parent = root
    return root


def stump():
    root = empty("stump")
    bark = mat("bark", "#9a6235", rough=0.95)
    inner = mat("wood_inner", "#f4cf92", rough=0.8)
    ring = mat("wood_ring", "#d79b55", rough=0.8)
    wob = lambda rr, th, z: rr * (1 + 0.06 * math.sin(th * 6) * (1.2 - z))
    parts = [lathe(bark, [(0, 0), (0.58, 0), (0.46, 0.12), (0.4, 0.3), (0.4, 0.55), (0, 0.55)], seg=24, rfn=wob)]
    parts.append(cyl(inner, 0.36, 0.02, (0, 0, 0.555), verts=24))
    for rr in (0.25, 0.13):
        parts.append(torus(ring, rr, 0.012, (0, 0, 0.566), seg=20, ring=4))
    for k in range(4):
        a = k / 4 * math.tau + 0.4
        parts.append(sphere(bark, 1, (math.cos(a) * 0.5, math.sin(a) * 0.5, 0.06), (0.22, 0.09, 0.08), rot=(0, 0.3, a), seg=12, rings=8))
    parts += mushroom_parts(0.16, (0.38, -0.3, 0.0), mat("cap_red", "#ff4b4b", rough=0.45))
    join(parts, "stump_mesh").parent = root
    return root


def mushroom_parts(height, loc, cap_mat, dots=True, stem_mat=None):
    stem_mat = stem_mat or mat("stem", "#fff1d6", rough=0.7)
    gill = mat("gill", "#f2dcb8", rough=0.8)
    dot = mat("dot", "#ffffff", rough=0.6)
    x, y, z = loc
    h = height
    R = h * 0.62
    parts = [lathe(stem_mat, [(0, 0), (h * 0.2, 0), (h * 0.22, h * 0.15), (h * 0.17, h * 0.45), (h * 0.15, h * 0.7), (0, h * 0.7)],
                   loc=(x, y, z), seg=14)]
    cz = z + h * 0.62
    parts.append(cyl(gill, R * 0.95, h * 0.03, (x, y, cz + h * 0.005), verts=24))
    # cap: the upper part of a squashed sphere, slightly past the equator for a curled rim
    cap = sphere(cap_mat, 1, (0, 0, 0), (R, R, h * 0.48), seg=24, rings=14)
    bm = bmesh.new()
    bm.from_mesh(cap.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -h * 0.05], context="VERTS")
    bm.to_mesh(cap.data)
    bm.free()
    cap.data.transform(Matrix.Translation((x, y, cz + h * 0.04)))
    parts.append(cap)
    if dots:
        for k, (ph, th) in enumerate(((0.25, 0.2), (0.6, -1.9), (0.62, 1.3), (0.9, -0.7), (0.95, 0.9), (0.85, 2.6), (0.55, 3.6), (1.0, -2.6))):
            d = Vector((math.sin(ph) * math.cos(th), math.sin(ph) * math.sin(th), math.cos(ph)))
            p, n = on_ellipsoid((x, y, cz + h * 0.04), (R, R, h * 0.48), d, lift=-0.004 * h)
            s = h * (0.09 if k % 2 else 0.065)
            parts.append(sphere(dot, s, p, (1, 1, 0.35), rot=Vector((0, 0, 1)).rotation_difference(n).to_euler(), seg=10, rings=6))
    return parts


def mushroom(name, height, cap_hex, dots=True, stem_hex="#fff1d6"):
    root = empty(name)
    parts = mushroom_parts(height, (0, 0, 0), mat(f"cap_{name}", cap_hex, rough=0.45), dots=dots,
                           stem_mat=mat(f"stem_{name}", stem_hex, rough=0.7))
    join(parts, f"{name}_mesh").parent = root
    return root


def pumpkin():
    root = empty("pumpkin")
    orange = mat("pumpkin", "#ff8a1f", rough=0.55)
    stem = mat("pumpkin_stem", "#6b8f2a", rough=0.8)
    leaf = mat("leaf", "#4caf3a", rough=0.7)
    lobes = lambda r, th, z: r * (0.86 + 0.14 * abs(math.cos(th * 4)))
    parts = [lathe(orange, [(0, 0.05), (0.25, 0.0), (0.42, 0.1), (0.48, 0.28), (0.42, 0.46), (0.22, 0.56), (0.06, 0.53), (0, 0.5)],
                   seg=48, rfn=lobes, steps=3)]
    parts.append(cyl(stem, 0.05, 0.18, (0.02, 0, 0.6), rot=(0, 0.3, 0), verts=8, r2=0.035))
    parts.append(sphere(leaf, 1, (-0.1, -0.08, 0.56), (0.16, 0.09, 0.02), rot=(0.2, -0.2, 0.6), seg=12, rings=6))
    join(parts, "pumpkin_mesh").parent = root
    return root


def snowman():
    root = empty("snowman")
    snow = mat("snow", "#f7fbff", rough=0.9)
    coal = mat("coal", "#2d2d35", rough=0.6)
    nose = mat("carrot_nose", "#ff8a1f", rough=0.6)
    scarf = mat("snowman_scarf", "#ff4d6d", rough=0.7)
    hat = mat("hat", "#3a3a4a", rough=0.6)
    parts = [ico(snow, 0.32, (0, 0, 0.29), (1, 1, 0.92), subdiv=3, lumpy=0.04),
             ico(snow, 0.22, (0, 0, 0.72), subdiv=3, lumpy=0.04, seed=2)]
    for s in (-1, 1):
        p, n = on_ellipsoid((0, 0, 0.72), (0.22, 0.22, 0.22), (s * 0.4, -1, 0.25))
        parts.append(sphere(coal, 0.03, p, seg=8, rings=6))
    p, n = on_ellipsoid((0, 0, 0.72), (0.22, 0.22, 0.22), (0, -1, -0.05))
    parts.append(cyl(nose, 0.04, 0.16, p + Vector((0, -0.06, 0)), rot=(math.pi / 2, 0, 0), verts=10, r2=0.0))
    for k in range(3):
        p, n = on_ellipsoid((0, 0, 0.29), (0.32, 0.32, 0.3), (0, -1, 0.5 - k * 0.35))
        parts.append(sphere(coal, 0.028, p, seg=8, rings=6))
    parts.append(torus(scarf, 0.19, 0.055, (0, 0, 0.53), seg=24, ring=8))
    parts.append(rounded_box(scarf, (0.1, 0.05, 0.22), (0.12, -0.15, 0.43), rot=(0, 0.2, 0.3), bevel=0.02))
    parts.append(cyl(hat, 0.2, 0.025, (0, 0, 0.9), verts=20))
    parts.append(cyl(hat, 0.13, 0.17, (0, 0, 0.99), verts=20))
    parts.append(cyl(scarf, 0.133, 0.035, (0, 0, 0.93), verts=20))
    twig = mat("twig", "#7a4b2a", rough=0.9)
    for s in (-1, 1):
        parts.append(cyl(twig, 0.018, 0.34, (s * 0.42, 0, 0.42), rot=(0, s * -1.0, 0), verts=6, r2=0.01))
    join(parts, "snowman_mesh").parent = root
    return root


# --- Scenery --------------------------------------------------------------------------

def tree_round():
    root = empty("tree_round")
    trunk = mat("trunk", "#8a5a33", rough=0.95)
    canopy = mat("canopy", "#6cc644", rough=0.8)
    parts = [lathe(trunk, [(0, 0), (0.3, 0), (0.22, 0.2), (0.17, 1.2), (0.15, 1.9), (0, 1.9)], seg=12)]
    parts.append(cyl(trunk, 0.07, 0.6, (0.25, 0, 1.6), rot=(0, 0.8, 0), verts=8, r2=0.04))
    for (x, y, z, r, sd) in ((0, 0, 2.5, 1.0, 1), (0.6, 0.2, 2.15, 0.7, 2), (-0.6, -0.1, 2.2, 0.72, 3), (0.1, -0.3, 3.05, 0.7, 4), (-0.2, 0.45, 2.7, 0.7, 5)):
        parts.append(ico(canopy, r, (x, y, z), subdiv=2, lumpy=0.12, seed=sd))
    join(parts, "tree_round_mesh", sharp_deg=180).parent = root
    return root


def tree_pine(snowy=False):
    name = "tree_pine_snow" if snowy else "tree_pine"
    root = empty(name)
    trunk = mat("trunk", "#8a5a33", rough=0.95)
    pine = mat("pine", "#2f9e5b", rough=0.8)
    snow = mat("snow", "#f7fbff", rough=0.9)
    parts = [cyl(trunk, 0.16, 0.8, (0, 0, 0.4), verts=10, r2=0.12)]
    wav = lambda r, th, z: r * (1 + 0.07 * math.sin(th * 7))
    for i in range(4):
        R = 1.15 - i * 0.24
        base = 0.55 + i * 0.68
        top = base + 1.05 - i * 0.08
        parts.append(lathe(pine, [(0, base + 0.18), (R * 0.95, base), (R, base + 0.05), (R * 0.45, base + (top - base) * 0.55), (0, top)],
                           seg=14, rfn=wav, steps=2))
        if snowy:
            h = top - base
            parts.append(lathe(snow, [(0, base + h * 0.35), (R * 0.52, base + h * 0.42), (R * 0.56, base + h * 0.5),
                                      (R * 0.3, base + h * 0.75), (0, top + 0.02)], seg=14, rfn=wav, steps=2))
    join(parts, f"{name}_mesh").parent = root
    return root


def bush():
    root = empty("bush")
    leaf = mat("bush", "#58b33a", rough=0.85)
    berry = mat("berry", "#ff3d6e", rough=0.3)
    parts = []
    for (x, y, z, r, sd) in ((0, 0, 0.45, 0.6, 1), (0.55, 0.05, 0.32, 0.45, 2), (-0.55, 0, 0.32, 0.47, 3), (0.2, -0.25, 0.3, 0.38, 4)):
        parts.append(ico(leaf, r, (x, y, z), (1, 1, 0.85), subdiv=2, lumpy=0.12, seed=sd))
    for k, (x, z) in enumerate(((-0.3, 0.7), (0.25, 0.75), (0.6, 0.5), (-0.7, 0.45), (0.0, 0.4), (0.35, 0.3))):
        p, n = on_ellipsoid((x * 0.6, 0, 0.4), (0.9, 0.55, 0.55), (x, -1, z - 0.4))
        parts.append(sphere(berry, 0.055, p, seg=8, rings=6))
    join(parts, "bush_mesh", sharp_deg=180).parent = root
    return root


def flower():
    root = empty("flower")
    stem = mat("flower_stem", "#4caf3a", rough=0.7)
    petal = mat("petal", "#ff6b9d", rough=0.6)
    centre = mat("flower_centre", "#ffd23f", rough=0.5)
    parts = [cyl(stem, 0.025, 0.5, (0, 0, 0.25), verts=6)]
    parts.append(sphere(stem, 1, (0.08, 0, 0.18), (0.1, 0.03, 0.04), rot=(0, -0.6, 0), seg=8, rings=6))
    parts.append(sphere(stem, 1, (-0.08, 0, 0.26), (0.1, 0.03, 0.04), rot=(0, 0.6, 0), seg=8, rings=6))
    for k in range(6):
        a = k / 6 * math.tau
        parts.append(sphere(petal, 1, (math.cos(a) * 0.1, -0.02, 0.55 + math.sin(a) * 0.1), (0.08, 0.025, 0.05), rot=(0, -a, 0), seg=10, rings=6))
    parts.append(sphere(centre, 0.06, (0, -0.04, 0.55), (1, 0.6, 1), seg=10, rings=8))
    join(parts, "flower_mesh", sharp_deg=180).parent = root
    return root


def grass():
    root = empty("grass")
    g = mat("grass", "#7bd14b", rough=0.8)
    parts = []
    for k in range(7):
        a = (k - 3) * 0.28
        h = 0.32 + 0.12 * math.cos(k * 1.7)
        parts.append(cyl(g, 0.045, h, (math.sin(a) * h * 0.4, (k % 3 - 1) * 0.05, h * 0.45), rot=(0, a, 0), verts=4, r2=0.0, scale=(1, 0.35, 1)))
    join(parts, "grass_mesh").parent = root
    return root


def fence():
    root = empty("fence")
    wood = mat("fence_wood", "#e0a868", rough=0.85)
    parts = []
    for x in (-0.95, 0.95):
        parts.append(rounded_box(wood, (0.14, 0.14, 0.9), (x, 0, 0.45), bevel=0.03))
        parts.append(cyl(wood, 0.1, 0.12, (x, 0, 0.95), verts=4, r2=0.0, rot=(0, 0, math.pi / 4)))
    for z in (0.35, 0.68):
        parts.append(rounded_box(wood, (2.1, 0.07, 0.14), (0, -0.09, z), bevel=0.025))
    join(parts, "fence_mesh").parent = root
    return root


def cloud():
    root = empty("cloud")
    white = mat("cloud", "#ffffff", rough=1.0, emit="#e8f4ff")
    parts = []
    for (x, z, r) in ((0, 0.25, 1.0), (1.0, 0.0, 0.75), (-1.0, 0.0, 0.8), (0.5, 0.45, 0.7), (-0.45, 0.4, 0.75), (1.7, -0.15, 0.5), (-1.75, -0.15, 0.5)):
        parts.append(ico(white, r, (x, 0, z), (1, 0.75, 0.85), subdiv=2, lumpy=0.06, seed=x + z))
    join(parts, "cloud_mesh", sharp_deg=180).parent = root
    return root


def butterfly():
    root = empty("butterfly")
    body = mat("butterfly_body", "#3a2a3a", rough=0.6)
    wing = mat("wing", "#ffb703", rough=0.5)
    spot = mat("wing_spot", "#ffffff", rough=0.5)
    b = join([sphere(body, 1, (0, 0, 0), (0.16, 0.035, 0.035), seg=10, rings=6),
              sphere(body, 0.045, (0.17, 0, 0.01), seg=8, rings=6)], "butterfly_body")
    b.parent = root
    for s, side in ((1, "L"), (-1, "R")):
        parts = [sphere(wing, 1, (0.06, 0.15 * s, 0), (0.12, 0.15, 0.012), rot=(0, 0, s * 0.4), seg=14, rings=6),
                 sphere(wing, 1, (-0.07, 0.11 * s, 0), (0.08, 0.1, 0.012), rot=(0, 0, s * -0.3), seg=12, rings=6),
                 sphere(spot, 1, (0.07, 0.18 * s, 0.006), (0.035, 0.035, 0.012), seg=8, rings=4)]
        w = join(parts, f"butterfly_wing_{side}", sharp_deg=180)
        w.parent = root
    return root


def burrow():
    """Pip's home at the end of the trip: a grassy mound with a round door, facing the camera."""
    root = empty("burrow")
    turf = mat("turf", "#74c947", rough=0.9)
    dirt = mat("dirt", "#a8743f", rough=0.95)
    door = mat("door", "#e85d4a", rough=0.6)
    frame = mat("door_frame", "#f4cf92", rough=0.8)
    knob = mat("knob", "#ffd23f", rough=0.3, metal=0.5)
    window = mat("window", "#ffe9a8", rough=0.3, emit="#ffd77a")
    R, H = 1.9, 1.45
    parts = [ico(turf, 1, (0, 0, 0), (R, R * 0.9, H), subdiv=3, lumpy=0.04, seed=5)]
    dz = 0.62
    p, n = on_ellipsoid((0, 0, 0), (R, R * 0.9, H), (0, -1, dz / H * 0.9))
    rot = (math.pi / 2 - 0.2, 0, 0)
    parts.append(cyl(dirt, 0.68, 0.3, p + Vector((0, 0.08, 0)), rot=rot, verts=28))
    parts.append(torus(frame, 0.6, 0.08, p + Vector((0, -0.08, 0)), rot=rot, seg=28, ring=8))
    parts.append(cyl(door, 0.55, 0.06, p + Vector((0, -0.05, 0)), rot=rot, verts=28))
    for k in (-1, 0, 1):
        parts.append(rounded_box(frame, (0.04, 0.03, 0.85), p + Vector((k * 0.22, -0.09, 0.0)), rot=(-0.2, 0, 0), bevel=0.01))
    parts.append(sphere(knob, 0.06, p + Vector((0.32, -0.14, 0.0)), seg=10, rings=8))
    for s in (-1, 1):
        q, n = on_ellipsoid((0, 0, 0), (R, R * 0.9, H), (s * 0.75, -1, 0.75))
        parts.append(sphere(window, 0.2, q, (1, 0.3, 1), rot=(0, 0, math.atan2(n.y, n.x) + math.pi / 2), seg=16, rings=8))
        parts.append(torus(frame, 0.2, 0.04, q, rot=(math.pi / 2, 0, math.atan2(n.y, n.x) + math.pi / 2), seg=20, ring=6))
    # chimney with a puff of smoke is the game's job; the chimney is ours
    parts.append(cyl(mat("brick", "#d9654f", rough=0.9), 0.17, 0.6, (0.7, 0.3, 1.45), verts=12))
    parts.append(cyl(mat("brick", "#d9654f", rough=0.9), 0.21, 0.1, (0.7, 0.3, 1.78), verts=12))
    for k, (x, y) in enumerate(((-1.2, -0.9), (1.3, -0.7), (-0.4, -1.2), (0.6, -1.25))):
        q, n = on_ellipsoid((0, 0, 0), (R, R * 0.9, H), (x, y, 0.35))
        col = mat(f"burrow_flower_{k % 2}", "#ff6b9d" if k % 2 else "#ffffff", rough=0.6)
        for j in range(5):
            a = j / 5 * math.tau
            parts.append(sphere(col, 0.06, q + Vector((math.cos(a) * 0.07, -0.02, math.sin(a) * 0.07)), seg=8, rings=4))
        parts.append(sphere(mat("flower_centre", "#ffd23f"), 0.04, q + Vector((0, -0.05, 0)), seg=8, rings=4))
    join(parts, "burrow_mesh").parent = root
    return root


# --- Export ---------------------------------------------------------------------------

def export(roots, filename):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for r in roots:
        for o in [r, *r.children_recursive]:
            o.select_set(True)
    path = os.path.abspath(os.path.join(OUT_DIR, filename))
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    print(f"exported {path} ({os.path.getsize(path)} bytes)")


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    hero = bunny()
    export([hero], "bunny.glb")
    world = [
        carrot("carrot", mat("carrot", "#ff8a1f", rough=0.5), mat("carrot_leaf", "#4caf3a", rough=0.7)),
        carrot("carrot_gold", mat("gold", "#ffc21a", rough=0.3, metal=0.35, emit="#ff9d00"), mat("gold_leaf", "#b8e65a", rough=0.4, emit="#6a9a10")),
        log(), rock(), stump(), mushroom("toadstool", 0.75, "#ff6a3d"), pumpkin(), snowman(),
        tree_round(), tree_pine(), tree_pine(snowy=True), bush(), flower(), grass(), fence(), cloud(), butterfly(), burrow(),
        mushroom("mushroom_red", 2.6, "#ff4b4b"), mushroom("mushroom_blue", 2.0, "#8a6cff", stem_hex="#e8f0ff"),
    ]
    export(world, "world.glb")


main()
