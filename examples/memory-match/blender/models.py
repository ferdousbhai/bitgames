"""
Memory Match models: a set of chubby toy animals, the card the game flips, and
the playroom table the cards are dealt on. Everything is built procedurally
from spheres, cones and swept tubes (no textures), with smooth shading and
glTF-friendly Principled BSDF colors, and exported to ../public/models/:

  animals.glb   one root per animal
  card.glb      the card
  setting.glb   the table, the play mat and a few toys

Run with:  blender --background --python models.py
Preview:   blender --background --python models.py -- --preview /tmp/dir
           (also renders animals_0.png, animals_1.png, closeup.png, card.png and
           setting.png into that dir)

Node names the game relies on:
  animal_<name>          root of each animal, origin between its feet, facing
                         Blender -Y (three.js +Z, toward the camera)
    <name>_body          body, legs, arms and tail; origin at the feet
    <name>_head          head with its face and ears; origin at the neck, so
                         rotating it nods and tilts the head
  card                   root of the card: 1.0 x 1.3 lying flat, 0.08 thick,
                         centred on the origin, back (star) facing up
    card_mesh            materials: card_back, card_star, card_edge,
                         card_front and card_spot (the round spot on the face,
                         which the game tints per animal)
  table, mat             table top (top surface at height 0) and play mat (a
                         6 x 6 rug lying on the table, 0.03 thick) that the
                         game stretches to fit the board
  prop_blocks, prop_ball, prop_rings, prop_crayons, prop_bear
                         toys the game sets around the board; origin at the base

Animal names: dog cat frog lion panda pig bunny chick elephant fox penguin cow
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# Sphere detail. Smooth shading hides the facets; lower keeps the GLBs small.
DETAIL = 0.72

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "models")


# --- Materials -----------------------------------------------------------------------

def srgb(hex_color):
    """'#rrggbb' to the linear RGB Blender (and glTF baseColorFactor) expects."""
    h = hex_color.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


_mats = {}


def mat(name, hex_color, rough=0.55, metallic=0.0, emit=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    if not m.node_tree:
        m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*srgb(hex_color), 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*srgb(hex_color), 1)
        bsdf.inputs["Emission Strength"].default_value = emit
    m.diffuse_color = (*srgb(hex_color), 1)
    _mats[name] = m
    return m


def M(name):
    return _mats[name]


def palette():
    # Shared bits of every face, so all the animals feel like one toy set.
    mat("eye", "#1d1b2e", rough=0.12)
    mat("shine", "#ffffff", rough=0.2, emit=0.6)
    mat("blush", "#ff8fb1", rough=0.7)
    mat("nose", "#2a2230", rough=0.25)
    mat("mouth", "#6b2737", rough=0.5)
    mat("tongue", "#ff6f91", rough=0.45)
    mat("pink", "#ffb3c7", rough=0.6)
    mat("cream", "#fff3df", rough=0.6)
    mat("white", "#fbfaf6", rough=0.55)
    mat("black", "#2c2c3a", rough=0.5)
    mat("orange", "#ff9a1f", rough=0.45)
    mat("gold", "#ffcf3f", rough=0.25, metallic=0.6)
    mat("red", "#ef3e4a", rough=0.4)
    mat("tooth", "#ffffff", rough=0.3)


# --- Geometry -------------------------------------------------------------------------

def face_rot(normal):
    """Rotation that points local +Z along normal, keeping local +Y as close to world up as it can."""
    return Vector(normal).normalized().to_track_quat("Z", "Y").to_matrix()


def rot3(r):
    if r is None:
        return Matrix.Identity(3)
    if isinstance(r, Matrix):
        return r
    return Euler([math.radians(a) for a in r]).to_matrix()


def surf(c, r, d):
    """Point on the ellipsoid (centre c, radii r) in direction d from its centre."""
    d = Vector(d).normalized()
    t = 1 / math.sqrt(sum((d[i] / r[i]) ** 2 for i in range(3)))
    return Vector(c) + d * t


def surf_normal(c, r, p):
    g = Vector([(p[i] - c[i]) / r[i] ** 2 for i in range(3)])
    return g.normalized()


class Part:
    """Accumulates primitives into one bmesh, one material slot per material."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []

    def _slot(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _finish(self, verts, m, matrix, sharp=None):
        bmesh.ops.transform(self.bm, matrix=matrix, verts=verts)
        faces = {f for v in verts for f in v.link_faces}
        slot = self._slot(m)
        for f in faces:
            f.material_index = slot
            f.smooth = True
        if sharp is not None:
            edges = {e for f in faces for e in f.edges}
            for e in edges:
                if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(sharp):
                    e.smooth = False
        return faces

    def sphere(self, m, center, radii, rot=None, segs=20, rings=12):
        segs, rings = max(8, round(segs * DETAIL)), max(6, round(rings * DETAIL))
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=segs, v_segments=rings, radius=1.0)
        r = radii if isinstance(radii, (tuple, list)) else (radii, radii, radii)
        mtx = Matrix.Translation(center) @ rot3(rot).to_4x4() @ Matrix.Diagonal((*r, 1))
        return self._finish(res["verts"], m, mtx)

    def cone(self, m, base, direction, r1, r2, length, squash=(1, 1), segs=16, twist=0.0, sharp=50):
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs,
                                    radius1=r1, radius2=r2, depth=length)
        mtx = (Matrix.Translation(base) @ face_rot(direction).to_4x4() @ Matrix.Rotation(twist, 4, "Z")
               @ Matrix.Diagonal((squash[0], squash[1], 1, 1)) @ Matrix.Translation((0, 0, length / 2)))
        return self._finish(res["verts"], m, mtx, sharp=sharp)

    def box(self, m, center, size, bevel=0.05, rot=None, segments=3, sharp=50):
        before = set(self.bm.verts)
        res = bmesh.ops.create_cube(self.bm, size=1.0)
        for v in res["verts"]:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        if bevel:
            edges = list({e for v in res["verts"] for e in v.link_edges})
            bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=segments, profile=0.5,
                            affect=BEVEL_AFFECT_EDGES, clamp_overlap=True)
        verts = [v for v in self.bm.verts if v not in before]
        return self._finish(verts, m, Matrix.Translation(center) @ rot3(rot).to_4x4(), sharp=sharp)

    def tube(self, m, pts, radii, segs=12, closed=False, sharp=None):
        pts = [Vector(p) for p in pts]
        n = len(pts)
        if not isinstance(radii, (list, tuple)):
            radii = [radii] * n
        tangents = []
        for i in range(n):
            if closed:
                t = pts[(i + 1) % n] - pts[i - 1]
            else:
                t = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
            tangents.append(t.normalized())
        ref = Vector((0, 0, 1)) if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
        normal = (ref - tangents[0] * ref.dot(tangents[0])).normalized()
        rings = []
        new_verts = []
        for i in range(n):
            t = tangents[i]
            normal = (normal - t * normal.dot(t)).normalized()
            bi = t.cross(normal)
            ring = []
            for k in range(segs):
                a = 2 * math.pi * k / segs
                v = self.bm.verts.new(pts[i] + (normal * math.cos(a) + bi * math.sin(a)) * radii[i])
                ring.append(v)
            rings.append(ring)
            new_verts += ring
        span = n if closed else n - 1
        for i in range(span):
            a, b = rings[i], rings[(i + 1) % n]
            for k in range(segs):
                self.bm.faces.new((a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]))
        if not closed:
            # Rounded ends: a small fan pulled out along the tangent.
            for ring, t, p, r in ((rings[0], -tangents[0], pts[0], radii[0]), (rings[-1], tangents[-1], pts[-1], radii[-1])):
                tip = self.bm.verts.new(p + t * r * 0.7)
                new_verts.append(tip)
                for k in range(segs):
                    self.bm.faces.new((ring[k], ring[(k + 1) % segs], tip))
        return self._finish(new_verts, m, Matrix.Identity(4), sharp=sharp)

    def prism(self, m, outline, z0, z1, bevel=0.0, sharp=40, matrix=None):
        """Extrudes a 2D outline (counter-clockwise, in XY) from z0 to z1."""
        before = set(self.bm.verts)
        bottom = [self.bm.verts.new((x, y, z0)) for x, y in outline]
        top = [self.bm.verts.new((x, y, z1)) for x, y in outline]
        n = len(outline)
        caps = [self.bm.faces.new(list(reversed(bottom))), self.bm.faces.new(top)]
        for k in range(n):
            self.bm.faces.new((bottom[k], bottom[(k + 1) % n], top[(k + 1) % n], top[k]))
        if bevel:
            rim = list({e for f in caps for e in f.edges})
            bmesh.ops.bevel(self.bm, geom=rim, offset=bevel, segments=3, profile=0.5,
                            affect=BEVEL_AFFECT_EDGES, clamp_overlap=True)
        verts = [v for v in self.bm.verts if v not in before]
        return self._finish(verts, m, matrix or Matrix.Identity(4), sharp=sharp)

    def slab(self, m, w, h, r, z0, z1, bevel=0.02, steps=3, corner_steps=6, matrix=None, sharp=None):
        """Rounded-rectangle tile (a disc when w == h == 2r) with evenly rounded rims: rings of
        inset outlines stacked along a quarter-circle profile, so corners never pinch."""
        bevel = min(bevel, (z1 - z0) / 2, r * 0.95)
        levels = []
        for k in range(steps + 1):  # bottom rim
            a = math.pi / 2 * (1 - k / steps)
            levels.append((bevel * (1 - math.cos(a)), z0 + bevel * (1 - math.sin(a))))
        for k in range(steps + 1):  # top rim
            a = math.pi / 2 * k / steps
            levels.append((bevel * (1 - math.cos(a)), z1 - bevel * (1 - math.sin(a))))
        rings = []
        for inset, z in levels:
            ring = [self.bm.verts.new((x, y, z)) for x, y in rounded_rect(w - 2 * inset, h - 2 * inset, r - inset, corner_steps)]
            rings.append(ring)
        n = len(rings[0])
        for a, b in zip(rings, rings[1:]):
            if a[0].co.z == b[0].co.z and a[0].co.xy == b[0].co.xy:
                continue
            for k in range(n):
                self.bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
        self.bm.faces.new(list(reversed(rings[0])))
        self.bm.faces.new(rings[-1])
        verts = [v for ring in rings for v in ring]
        # Merge the duplicate ring where the two rims meet when the side wall has no height.
        bmesh.ops.remove_doubles(self.bm, verts=verts, dist=1e-6)
        verts = [v for v in verts if v.is_valid]
        return self._finish(verts, m, matrix or Matrix.Identity(4), sharp=sharp)

    def build(self, name, origin=(0, 0, 0)):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        bmesh.ops.translate(self.bm, vec=-Vector(origin), verts=self.bm.verts[:])
        mesh = bpy.data.meshes.new(name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for m in self.mats:
            mesh.materials.append(m)
        obj = bpy.data.objects.new(name, mesh)
        obj.location = origin
        bpy.context.collection.objects.link(obj)
        return obj


def _bevel_affect_edges():
    items = [i.identifier for i in bpy.types.BevelModifier.bl_rna.properties["affect"].enum_items]
    return next(i for i in items if "EDGE" in i)


BEVEL_AFFECT_EDGES = None


def rounded_rect(w, h, r, steps=6):
    """Counter-clockwise outline of a rounded rectangle centred on the origin."""
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for k in range(steps + 1):
            a = math.radians(a0 + 90 * k / steps)
            p = (cx + r * math.cos(a), cy + r * math.sin(a))
            if not pts or math.dist(p, pts[-1]) > 1e-6:
                pts.append(p)
    if math.dist(pts[0], pts[-1]) < 1e-6:
        pts.pop()
    return pts


def circle(rx, ry, z, n, cy=0):
    """n points around a closed ellipse (centre (0, cy)) at height z; z=None gives 2D points for prisms."""
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        x, y = math.cos(a) * rx, cy + math.sin(a) * ry
        pts.append((x, y) if z is None else (x, y, z))
    return pts


def star(r_out, r_in, points=5, rot=90):
    pts = []
    for k in range(points * 2):
        a = math.radians(rot + 180 * k / points)
        r = r_out if k % 2 == 0 else r_in
        pts.append((r * math.cos(a), r * math.sin(a)))
    return pts


# --- Animal kit ------------------------------------------------------------------------

HC = Vector((0, 0, 0.66))       # head centre
HR = (0.31, 0.27, 0.27)         # head radii (x wide, y deep, z tall); the face looks toward -Y
BC = Vector((0, 0.02, 0.27))    # body centre
BR = (0.22, 0.2, 0.25)
NECK = (0, 0, 0.45)


def eyes(H, c=HC, r=HR, spread=0.36, up=0.1, size=1.0, lift=0.0):
    for s in (-1, 1):
        p = surf(c, r, (s * spread, -1, up))
        n = surf_normal(c, r, p)
        H.sphere(M("eye"), p + n * (lift - 0.008), (0.043 * size, 0.056 * size, 0.03 * size), rot=face_rot(n), segs=16, rings=10)
        side = Vector((s, 0, 0))
        H.sphere(M("shine"), p + n * (lift + 0.02 * size) + Vector((0, 0, 0.022 * size)) + side * 0.012 * size, 0.014 * size, segs=8, rings=6)


def cheeks(H, c=HC, r=HR, spread=0.64, down=-0.2):
    for s in (-1, 1):
        p = surf(c, r, (s * spread, -1, down))
        n = surf_normal(c, r, p)
        H.sphere(M("blush"), p, (0.055, 0.036, 0.012), rot=face_rot(n), segs=14, rings=8)


def mouth(H, c, r, width=0.07, z=-0.28, sag=0.03, rad=0.0085, m=None, dy=0.004, steps=9):
    """A little smile drawn on the front of the ellipsoid (c, r); z is relative to its height."""
    pts = []
    for i in range(steps):
        t = -1 + 2 * i / (steps - 1)
        x = t * width
        zz = c[2] + z * r[2] - sag * (1 - t * t)
        inside = max(0.0, 1 - (x / r[0]) ** 2 - ((zz - c[2]) / r[2]) ** 2)
        pts.append(Vector((x, c[1] - r[1] * math.sqrt(inside) - dy, zz)))
    H.tube(m or M("mouth"), pts, rad, segs=8)


def standard_body(B, fur, belly=None, feet=None, arms=None, body_c=BC, body_r=BR):
    B.sphere(fur, body_c, body_r, segs=24, rings=14)
    if belly:
        B.sphere(belly, body_c + Vector((0, -0.075, -0.02)), (body_r[0] * 0.74, body_r[1] * 0.78, body_r[2] * 0.76), segs=20, rings=12)
    for s in (-1, 1):
        B.sphere(feet or fur, (s * 0.11, -0.06, 0.055), (0.085, 0.11, 0.065), segs=16, rings=10)
        B.sphere(arms or fur, (s * (body_r[0] - 0.01), -0.04, body_c[2] + 0.04), (0.065, 0.07, 0.115), rot=(0, s * 28, 0), segs=14, rings=10)


def finish_animal(name, B, H):
    root = bpy.data.objects.new(f"animal_{name}", None)
    bpy.context.collection.objects.link(root)
    body = B.build(f"{name}_body", (0, 0, 0))
    head = H.build(f"{name}_head", NECK)
    body.parent = root
    head.parent = root
    return root


def dog():
    fur, dark = mat("dog_fur", "#d99a5b"), mat("dog_ear", "#8a5636")
    B, H = Part(), Part()
    standard_body(B, fur, belly=M("cream"))
    B.tube(fur, [(0, 0.2, 0.2), (0, 0.29, 0.3), (0.02, 0.32, 0.42), (0.05, 0.3, 0.5)], [0.045, 0.042, 0.036, 0.03], segs=10)
    B.tube(M("red"), circle(0.16, 0.15, 0.475, 20, cy=0.02), 0.03, segs=8, closed=True)
    B.sphere(M("gold"), (0, -0.17, 0.43), (0.04, 0.02, 0.045), segs=12, rings=8)
    H.sphere(fur, HC, HR, segs=28, rings=16)
    # Brown patch over one eye, cream muzzle, big nose and a tongue
    p = surf(HC, HR, (0.36, -1, 0.12))
    H.sphere(dark, p, (0.09, 0.1, 0.03), rot=face_rot(surf_normal(HC, HR, p)), segs=14, rings=8)
    eyes(H, lift=0.006)
    mc, mr = HC + Vector((0, -0.2, -0.09)), (0.14, 0.1, 0.09)
    H.sphere(M("cream"), mc, mr, segs=20, rings=12)
    H.sphere(M("nose"), surf(mc, mr, (0, -1, 0.5)), (0.055, 0.04, 0.038), segs=14, rings=8)
    H.sphere(M("tongue"), mc + Vector((0, -0.07, -0.08)), (0.04, 0.025, 0.045), segs=12, rings=8)
    mouth(H, mc, mr, width=0.06, z=-0.05, sag=0.02)
    cheeks(H, spread=0.7, down=-0.15)
    for s in (-1, 1):
        H.sphere(dark, HC + Vector((s * 0.3, 0.02, -0.02)), (0.07, 0.11, 0.2), rot=(0, s * -18, 0), segs=16, rings=10)
    return finish_animal("dog", B, H)


def cat():
    fur, stripe = mat("cat_fur", "#ffae5c"), mat("cat_stripe", "#e9822f")
    B, H = Part(), Part()
    standard_body(B, fur, belly=M("cream"), feet=M("cream"))
    B.tube(fur, [(0.04, 0.2, 0.1), (0.14, 0.32, 0.12), (0.2, 0.36, 0.26), (0.18, 0.36, 0.42), (0.1, 0.36, 0.5)], [0.04, 0.04, 0.038, 0.036, 0.032], segs=10)
    H.sphere(fur, HC, HR, segs=28, rings=16)
    for k, x in enumerate((-0.08, 0, 0.08)):
        p = surf(HC, HR, (x, -0.35, 1))
        H.sphere(stripe, p, (0.022, 0.08 if k == 1 else 0.065, 0.01), rot=face_rot(surf_normal(HC, HR, p)), segs=10, rings=6)
    eyes(H)
    mc, mr = HC + Vector((0, -0.2, -0.1)), (0.12, 0.08, 0.075)
    H.sphere(M("cream"), mc, mr, segs=18, rings=10)
    H.cone(M("pink"), surf(mc, mr, (0, -1, 0.9)) + Vector((0, -0.005, 0.02)), (0, 0, -1), 0.035, 0.0, 0.035, squash=(1, 0.6), segs=10)
    for s in (-1, 1):
        H.tube(M("mouth"), [(s * 0.004, -0.29, 0.58), (s * 0.03, -0.295, 0.565), (s * 0.055, -0.285, 0.575)], 0.008, segs=6)
        for k in (-1, 0, 1):
            H.tube(M("eye"), [(s * 0.12, -0.26, 0.6 + k * 0.022), (s * 0.3, -0.24, 0.62 + k * 0.05)], 0.0045, segs=5)
        base = surf(HC, HR, (s * 0.55, -0.05, 0.85))
        d = Vector((s * 0.45, 0.05, 1))
        H.cone(fur, base - d.normalized() * 0.03, d, 0.12, 0.0, 0.2, squash=(1, 0.6), segs=14)
        H.cone(M("pink"), base - d.normalized() * 0.02 + Vector((0, -0.035, 0)), d, 0.075, 0.0, 0.14, squash=(1, 0.3), segs=12)
    cheeks(H, spread=0.66)
    return finish_animal("cat", B, H)


def frog():
    skin, light = mat("frog_skin", "#5fcf4b"), mat("frog_belly", "#d9f7a1")
    B, H = Part(), Part()
    standard_body(B, skin, belly=light)
    for s in (-1, 1):  # wide webbed feet
        B.sphere(skin, (s * 0.15, -0.1, 0.04), (0.11, 0.12, 0.045), rot=(0, 0, s * 20), segs=14, rings=8)
    c, r = Vector((0, 0, 0.62)), (0.34, 0.27, 0.22)
    H.sphere(skin, c, r, segs=28, rings=16)
    for s in (-1, 1):
        bump = Vector((s * 0.15, -0.04, 0.8))
        H.sphere(skin, bump, 0.105, segs=18, rings=12)
        H.sphere(M("white"), bump + Vector((0, -0.04, 0.01)), 0.085, segs=18, rings=12)
        H.sphere(M("eye"), bump + Vector((0, -0.115, 0.01)), (0.042, 0.02, 0.05), segs=12, rings=8)
        H.sphere(M("shine"), bump + Vector((s * 0.012, -0.135, 0.032)), 0.013, segs=8, rings=6)
        H.sphere(M("nose"), surf(c, r, (s * 0.12, -1, 0.35)), 0.012, segs=8, rings=6)
    mouth(H, c, r, width=0.2, z=-0.05, sag=0.06, rad=0.012)
    cheeks(H, c, r, spread=0.8, down=-0.15)
    return finish_animal("frog", B, H)


def lion():
    fur, mane = mat("lion_fur", "#f6c04a"), mat("lion_mane", "#d86a2a")
    B, H = Part(), Part()
    standard_body(B, fur, belly=M("cream"))
    B.tube(fur, [(0, 0.2, 0.15), (0.06, 0.32, 0.18), (0.14, 0.38, 0.28), (0.18, 0.38, 0.38)], 0.025, segs=8)
    B.sphere(mane, (0.19, 0.38, 0.42), (0.055, 0.055, 0.07), segs=12, rings=8)
    c, r = HC, (0.27, 0.24, 0.25)
    # Mane: a ring of puffs around the face plus a back disc
    H.sphere(mane, c + Vector((0, 0.08, 0)), (0.33, 0.14, 0.33), segs=24, rings=14)
    for k in range(14):
        a = 2 * math.pi * k / 14
        H.sphere(mane, c + Vector((math.cos(a) * 0.3, 0.02, math.sin(a) * 0.3)), (0.1, 0.1, 0.1), segs=14, rings=10)
    H.sphere(fur, c, r, segs=28, rings=16)
    for s in (-1, 1):
        e = c + Vector((s * 0.2, -0.03, 0.2))
        H.sphere(fur, e, (0.07, 0.05, 0.07), segs=12, rings=8)
        H.sphere(M("pink"), e + Vector((0, -0.025, 0)), (0.04, 0.03, 0.045), segs=12, rings=8)
    eyes(H, c, r, spread=0.38)
    mc, mr = c + Vector((0, -0.18, -0.09)), (0.12, 0.08, 0.075)
    H.sphere(M("cream"), mc, mr, segs=18, rings=10)
    H.cone(mat("lion_nose", "#8a4a2e", rough=0.3), surf(mc, mr, (0, -1, 0.8)) + Vector((0, -0.005, 0.02)), (0, 0, -1), 0.04, 0.0, 0.035, squash=(1, 0.6), segs=10)
    mouth(H, mc, mr, width=0.05, z=-0.15, sag=0.02)
    cheeks(H, c, r, spread=0.7)
    return finish_animal("lion", B, H)


def panda():
    white, black = M("white"), M("black")
    B, H = Part(), Part()
    B.sphere(white, BC, BR, segs=24, rings=14)
    B.tube(black, circle(0.2, 0.185, 0.43, 20, cy=0.02), 0.05, segs=10, closed=True)
    for s in (-1, 1):
        B.sphere(black, (s * 0.11, -0.06, 0.06), (0.09, 0.115, 0.075), segs=16, rings=10)
        B.sphere(black, (s * 0.205, -0.05, 0.32), (0.075, 0.08, 0.13), rot=(0, s * 28, 0), segs=14, rings=10)
    B.sphere(white, (0, 0.21, 0.13), 0.05, segs=10, rings=8)
    H.sphere(white, HC, HR, segs=28, rings=16)
    for s in (-1, 1):
        H.sphere(black, HC + Vector((s * 0.22, 0.02, 0.2)), (0.085, 0.06, 0.085), segs=14, rings=10)
        p = surf(HC, HR, (s * 0.36, -1, 0.05))
        n = surf_normal(HC, HR, p)
        H.sphere(black, p, (0.07, 0.095, 0.03), rot=face_rot(n) @ Matrix.Rotation(math.radians(-s * 30), 3, "Z"), segs=16, rings=10)
    eyes(H, spread=0.36, up=0.08, size=0.85, lift=0.016)
    mc, mr = HC + Vector((0, -0.19, -0.1)), (0.11, 0.08, 0.07)
    H.sphere(white, mc, mr, segs=18, rings=10)
    H.sphere(M("nose"), surf(mc, mr, (0, -1, 0.6)), (0.04, 0.03, 0.028), segs=12, rings=8)
    mouth(H, mc, mr, width=0.04, z=-0.2, sag=0.015)
    cheeks(H, spread=0.7, down=-0.25)
    return finish_animal("panda", B, H)


def pig():
    skin, snout = mat("pig_skin", "#ffa8c0"), mat("pig_snout", "#f47d9c")
    B, H = Part(), Part()
    standard_body(B, skin, feet=snout)
    curl = [(0.03 * math.cos(t * 2.2) + 0.0, 0.22 + 0.02 * t, 0.26 + 0.03 * math.sin(t * 2.2) + 0.01 * t) for t in [k * 0.4 for k in range(9)]]
    B.tube(skin, curl, 0.016, segs=8)
    H.sphere(skin, HC, HR, segs=28, rings=16)
    eyes(H, up=0.15)
    base = surf(HC, HR, (0, -1, -0.15))
    H.cone(snout, base + Vector((0, 0.03, 0)), (0, -1, 0), 0.105, 0.1, 0.07, squash=(1, 0.78), segs=20, sharp=60)
    for s in (-1, 1):
        H.sphere(mat("pig_nostril", "#9c3b5a", rough=0.5), base + Vector((s * 0.035, -0.1, 0.0)), (0.017, 0.012, 0.026), segs=10, rings=6)
        e = surf(HC, HR, (s * 0.5, -0.05, 0.85))
        d = Vector((s * 0.55, -0.35, 1))
        H.cone(skin, e - d.normalized() * 0.03, d, 0.12, 0.0, 0.19, squash=(1, 0.45), segs=12)
        H.cone(snout, e - d.normalized() * 0.02 + Vector((0, -0.035, 0)), d, 0.075, 0.0, 0.13, squash=(1, 0.3), segs=10)
    mouth(H, HC, HR, width=0.05, z=-0.62, sag=0.02)
    cheeks(H, spread=0.72, down=-0.1)
    return finish_animal("pig", B, H)


def bunny():
    fur = mat("bunny_fur", "#c9b8f0")
    B, H = Part(), Part()
    standard_body(B, fur, belly=M("white"), feet=M("white"))
    B.sphere(M("white"), (0, 0.22, 0.16), 0.075, segs=14, rings=10)
    H.sphere(fur, HC, HR, segs=28, rings=16)
    for s in (-1, 1):
        base = HC + Vector((s * 0.1, 0.02, 0.2))
        tilt = Euler((math.radians(-8), math.radians(s * 12), 0)).to_matrix()
        H.sphere(fur, base + tilt @ Vector((0, 0, 0.24)), (0.08, 0.05, 0.25), rot=tilt, segs=16, rings=12)
        H.sphere(M("pink"), base + tilt @ Vector((0, -0.03, 0.24)), (0.05, 0.03, 0.19), rot=tilt, segs=14, rings=10)
    eyes(H)
    mc, mr = HC + Vector((0, -0.2, -0.1)), (0.1, 0.07, 0.065)
    H.sphere(M("white"), mc, mr, segs=18, rings=10)
    H.sphere(M("pink"), surf(mc, mr, (0, -1, 0.7)), (0.03, 0.022, 0.022), segs=10, rings=6)
    for s in (-1, 1):
        H.box(M("tooth"), mc + Vector((s * 0.014, -0.065, -0.075)), (0.024, 0.012, 0.04), bevel=0.004, segments=1)
    cheeks(H, spread=0.7)
    return finish_animal("bunny", B, H)


def chick():
    fluff = mat("chick_fluff", "#ffd83b")
    B, H = Part(), Part()
    standard_body(B, fluff, feet=M("orange"), arms=fluff)
    for s in (-1, 1):  # little wings instead of arms
        B.sphere(fluff, (s * 0.22, 0.0, 0.3), (0.05, 0.12, 0.13), rot=(15, 0, s * 20), segs=14, rings=10)
    c, r = HC + Vector((0, 0, -0.02)), (0.28, 0.26, 0.26)
    H.sphere(fluff, c, r, segs=28, rings=16)
    for k, a in enumerate((-25, 0, 25)):
        d = Euler((0, math.radians(a), 0)).to_matrix() @ Vector((0, 0, 1))
        H.sphere(fluff, c + Vector((0, 0, r[2] - 0.01)) + d * 0.05, (0.03, 0.03, 0.08), rot=(0, a, 0), segs=10, rings=8)
    eyes(H, c, r, spread=0.34, up=0.12)
    beak_base = surf(c, r, (0, -1, -0.05))
    H.cone(M("orange"), beak_base + Vector((0, 0.03, 0.012)), (0, -1, 0.15), 0.06, 0.0, 0.12, squash=(1.2, 0.6), segs=12)
    H.cone(M("orange"), beak_base + Vector((0, 0.03, -0.012)), (0, -1, -0.25), 0.045, 0.0, 0.08, squash=(1.1, 0.5), segs=12)
    cheeks(H, c, r, spread=0.72, down=-0.18)
    return finish_animal("chick", B, H)


def elephant():
    skin = mat("elephant_skin", "#9fb7d6")
    B, H = Part(), Part()
    standard_body(B, skin, feet=skin)
    for s in (-1, 1):
        for k in (-1, 0, 1):
            B.sphere(M("white"), (s * 0.11 + k * 0.035, -0.165, 0.035), 0.016, segs=8, rings=6)
    B.tube(skin, [(0, 0.2, 0.2), (0, 0.27, 0.15), (0, 0.3, 0.08)], 0.015, segs=6)
    H.sphere(skin, HC, (0.3, 0.27, 0.27), segs=28, rings=16)
    for s in (-1, 1):
        ear = HC + Vector((s * 0.32, 0.06, 0.02))
        tilt = Euler((0, 0, math.radians(s * 25))).to_matrix()
        H.sphere(skin, ear, (0.2, 0.035, 0.22), rot=tilt, segs=20, rings=12)
        H.sphere(M("pink"), ear + tilt @ Vector((0, -0.02, 0)), (0.14, 0.025, 0.16), rot=tilt, segs=18, rings=10)
        H.cone(M("tooth"), HC + Vector((s * 0.09, -0.22, -0.13)), (s * 0.3, -1, -0.4), 0.022, 0.0, 0.07, segs=10)
    eyes(H, spread=0.4, up=0.16)
    trunk = [(0, -0.2, 0.62), (0, -0.28, 0.56), (0, -0.33, 0.47), (0, -0.37, 0.4), (0, -0.43, 0.37), (0, -0.48, 0.39), (0, -0.51, 0.44)]
    H.tube(skin, trunk, [0.085, 0.075, 0.066, 0.058, 0.052, 0.048, 0.046], segs=14)
    H.sphere(mat("elephant_tip", "#86a0c2"), (0, -0.52, 0.46), (0.04, 0.03, 0.04), segs=10, rings=6)
    cheeks(H, spread=0.7, down=-0.12)
    return finish_animal("elephant", B, H)


def fox():
    fur, dark = mat("fox_fur", "#f2762e"), mat("fox_dark", "#4a2a2a")
    B, H = Part(), Part()
    standard_body(B, fur, belly=M("white"), feet=dark, arms=fur)
    tail = [(0.04, 0.2, 0.12), (0.16, 0.32, 0.18), (0.25, 0.36, 0.32), (0.27, 0.34, 0.46)]
    B.tube(fur, tail, [0.05, 0.1, 0.11, 0.085], segs=14)
    B.sphere(M("white"), (0.27, 0.34, 0.5), (0.08, 0.08, 0.09), segs=14, rings=10)
    H.sphere(fur, HC, HR, segs=28, rings=16)
    for s in (-1, 1):
        H.sphere(M("white"), HC + Vector((s * 0.11, -0.16, -0.1)), (0.14, 0.1, 0.11), segs=18, rings=10)
        base = surf(HC, HR, (s * 0.45, -0.05, 0.85))
        d = Vector((s * 0.3, 0.0, 1))
        H.cone(fur, base - d.normalized() * 0.04, d, 0.14, 0.0, 0.26, squash=(1, 0.5), segs=14)
        H.cone(dark, base + d.normalized() * 0.15, d, 0.065, 0.0, 0.1, squash=(1, 0.6), segs=12)
        H.cone(M("white"), base - d.normalized() * 0.03 + Vector((0, -0.04, 0)), d, 0.09, 0.0, 0.17, squash=(1, 0.3), segs=12)
    eyes(H, spread=0.38, up=0.16)
    H.cone(M("white"), HC + Vector((0, -0.18, -0.06)), (0, -1, -0.1), 0.09, 0.03, 0.13, squash=(1, 0.8), segs=16, sharp=70)
    H.sphere(M("nose"), HC + Vector((0, -0.32, -0.07)), (0.035, 0.028, 0.03), segs=12, rings=8)
    cheeks(H, spread=0.75, down=-0.05)
    return finish_animal("fox", B, H)


def penguin():
    navy = mat("penguin_navy", "#34406b")
    B, H = Part(), Part()
    B.sphere(navy, BC, BR, segs=24, rings=14)
    B.sphere(M("white"), BC + Vector((0, -0.07, -0.02)), (0.17, 0.16, 0.21), segs=20, rings=12)
    for s in (-1, 1):
        B.sphere(M("orange"), (s * 0.1, -0.08, 0.03), (0.08, 0.11, 0.035), segs=14, rings=8)
        B.sphere(navy, (s * 0.22, 0.0, 0.28), (0.04, 0.09, 0.16), rot=(0, s * 25, 0), segs=14, rings=10)
    H.sphere(navy, HC, HR, segs=28, rings=16)
    for s in (-1, 1):
        H.sphere(M("white"), HC + Vector((s * 0.1, -0.12, -0.0)), (0.15, 0.17, 0.2), segs=18, rings=12)
    eyes(H, spread=0.32, up=0.08, lift=0.01)
    H.cone(M("orange"), HC + Vector((0, -0.27, -0.05)), (0, -1, -0.15), 0.06, 0.0, 0.1, squash=(1.3, 0.7), segs=12)
    cheeks(H, spread=0.68, down=-0.22)
    return finish_animal("penguin", B, H)


def cow():
    white, spot = M("white"), mat("cow_spot", "#3a3340")
    B, H = Part(), Part()
    standard_body(B, white, feet=spot)
    for d in ((1, -0.3, 0.3), (-0.8, 0.2, -0.2), (0.2, 1, 0.5), (-1, -0.2, 0.6)):
        p = surf(BC, BR, d)
        B.sphere(spot, p, (0.08, 0.065, 0.025), rot=face_rot(surf_normal(BC, BR, p)), segs=14, rings=8)
    B.tube(white, [(0, 0.2, 0.25), (0.05, 0.27, 0.2), (0.08, 0.3, 0.1)], 0.015, segs=6)
    B.sphere(spot, (0.08, 0.3, 0.08), 0.03, segs=10, rings=6)
    B.tube(M("red"), circle(0.16, 0.15, 0.475, 20, cy=0.02), 0.022, segs=8, closed=True)
    B.sphere(M("gold"), (0, -0.18, 0.41), 0.05, segs=14, rings=10)
    H.sphere(white, HC, HR, segs=28, rings=16)
    p = surf(HC, HR, (-0.5, -0.6, 0.6))
    H.sphere(spot, p, (0.11, 0.09, 0.03), rot=face_rot(surf_normal(HC, HR, p)), segs=14, rings=8)
    eyes(H, up=0.14, lift=0.004)
    mc, mr = HC + Vector((0, -0.16, -0.13)), (0.2, 0.13, 0.11)
    H.sphere(M("pink"), mc, mr, segs=20, rings=12)
    for s in (-1, 1):
        H.sphere(mat("cow_nostril", "#c76b86"), surf(mc, mr, (s * 0.4, -1, 0.15)), (0.022, 0.012, 0.03), segs=10, rings=6)
        H.cone(M("cream"), HC + Vector((s * 0.14, 0.0, 0.22)), (s * 0.6, 0, 1), 0.04, 0.012, 0.13, segs=10)
        H.sphere(white, HC + Vector((s * 0.33, 0.02, 0.06)), (0.13, 0.05, 0.065), rot=(0, s * -20, 0), segs=14, rings=8)
        H.sphere(M("pink"), HC + Vector((s * 0.34, -0.015, 0.06)), (0.09, 0.03, 0.04), rot=(0, s * -20, 0), segs=12, rings=8)
    mouth(H, mc, mr, width=0.06, z=-0.35, sag=0.015)
    return finish_animal("cow", B, H)


ANIMALS = [dog, cat, frog, lion, panda, pig, bunny, chick, elephant, fox, penguin, cow]


# --- Card and setting --------------------------------------------------------------------

def card():
    W, D, T = 1.0, 1.3, 0.08
    C = Part()
    # Slab: assign faces by which way they point after building.
    faces = C.slab(mat("card_edge", "#fffaf0", rough=0.45), W, D, 0.14, -T / 2, T / 2, bevel=0.025, corner_steps=8)
    back, front = mat("card_back", "#7d6bff", rough=0.4), mat("card_front", "#fff7e8", rough=0.6)
    for f in faces:
        if not f.is_valid:
            continue
        f.normal_update()
        nz = f.normal.z
        if nz > 0.99:
            f.material_index = C._slot(back)
        elif nz < -0.99:
            f.material_index = C._slot(front)
    # Back: a lighter inset panel with a raised star; front: a round spot for the animal to stand on
    C.slab(mat("card_panel", "#9a8cff", rough=0.4), W - 0.16, D - 0.16, 0.09, T / 2 - 0.004, T / 2 + 0.006, bevel=0.005, steps=2)
    C.prism(mat("card_star", "#ffd23f", rough=0.3), star(0.27, 0.12), T / 2, T / 2 + 0.03, bevel=0.01, sharp=30)
    for k in range(8):
        a = 2 * math.pi * k / 8 + math.pi / 8
        C.sphere(mat("card_dot", "#ffffff", rough=0.4), (math.cos(a) * 0.33, math.sin(a) * 0.45, T / 2 + 0.006), (0.03, 0.03, 0.01), segs=10, rings=6)
    C.slab(mat("card_spot", "#ffffff", rough=0.5), 0.72, 0.72, 0.36, -T / 2 - 0.008, -T / 2 + 0.004, bevel=0.005, steps=2, corner_steps=10)
    root = bpy.data.objects.new("card", None)
    bpy.context.collection.objects.link(root)
    C.build("card_mesh").parent = root
    return root


def setting():
    objs = []
    # Table: wide planks in two warm woods, top surface at z = 0
    T = Part()
    woods = [mat("wood_a", "#e2a96b", rough=0.6), mat("wood_b", "#d39557", rough=0.6)]
    for k in range(10):
        x = -9 + k * 2 + 1
        T.box(woods[k % 2], (x, 0, -0.2), (1.96, 18, 0.4), bevel=0.04, segments=2)
    objs.append(T.build("table"))
    # Play mat: a 6 x 6 felt rug with a sunny border
    R = Part()
    R.slab(mat("mat_border", "#ffcf4a", rough=0.85), 6, 6, 0.5, 0, 0.02, bevel=0.01, steps=2, corner_steps=8)
    R.slab(mat("mat_felt", "#4fc6b8", rough=0.95), 5.6, 5.6, 0.35, 0.0, 0.03, bevel=0.01, steps=2, corner_steps=8)
    for k in range(28):  # stitched dashes around the felt
        t = k / 28
        side, u = int(t * 4), (t * 4) % 1
        x, y = [(-2.6 + 5.2 * u, -2.6), (2.6, -2.6 + 5.2 * u), (2.6 - 5.2 * u, 2.6), (-2.6, 2.6 - 5.2 * u)][side]
        R.box(mat("mat_stitch", "#ffffff", rough=0.8), (x, y, 0.031), (0.16 if side % 2 == 0 else 0.03, 0.03 if side % 2 == 0 else 0.16, 0.006), bevel=0, sharp=None)
    objs.append(R.build("mat"))

    # Toy blocks: two stacked plus one leaning, each with a raised shape on top
    P = Part()
    colors = [("block_red", "#ff5d6c"), ("block_blue", "#4d9bff"), ("block_green", "#6ad35a")]
    places = [((0, 0, 0.25), 0), ((0.04, 0.02, 0.75), 15), ((0.62, -0.1, 0.25), -20)]
    shapes = [star(0.17, 0.08), circle(0.15, 0.15, None, 24), [(0, 0.17), (-0.16, -0.12), (0.16, -0.12)]]
    for (name, col), (pos, yaw), shape in zip(colors, places, shapes):
        mtx = Matrix.Translation(pos) @ Matrix.Rotation(math.radians(yaw), 4, "Z")
        P.box(mat(name, col, rough=0.4), pos, (0.5, 0.5, 0.5), bevel=0.06, rot=(0, 0, yaw))
        top = mat("block_yellow", "#ffd23f", rough=0.4) if name == "block_blue" else M("white")
        P.prism(top, shape, 0.24, 0.27, bevel=0.012, matrix=mtx)
    objs.append(P.build("prop_blocks"))

    # Beach ball: six coloured gores and white caps
    Bl = Part()
    gores = [mat(n, c, rough=0.3) for n, c in (("ball_red", "#ff4f5e"), ("ball_yellow", "#ffd23f"), ("ball_blue", "#3fa2ff"))]
    faces = Bl.sphere(M("white"), (0, 0, 0.42), 0.42, segs=36, rings=18)
    for f in faces:
        c = f.calc_center_median() - Vector((0, 0, 0.42))
        if abs(c.z) < 0.36:
            g = int(((math.atan2(c.y, c.x) + math.pi) / (2 * math.pi)) * 6) % 6
            if g % 2 == 0:
                f.material_index = Bl._slot(gores[(g // 2) % 3])
    objs.append(Bl.build("prop_ball"))

    # Stacking rings on a peg
    S = Part()
    S.slab(mat("rings_base", "#b388ff", rough=0.4), 0.8, 0.8, 0.4, 0, 0.1, bevel=0.035, corner_steps=7)
    S.cone(mat("rings_peg", "#f3e1c0", rough=0.5), (0, 0, 0.08), (0, 0, 1), 0.06, 0.05, 0.8, segs=12)
    rings = [("ring_1", "#ff5d6c", 0.36), ("ring_2", "#ff9f1c", 0.31), ("ring_3", "#ffd23f", 0.26), ("ring_4", "#6ad35a", 0.21), ("ring_5", "#4d9bff", 0.17)]
    z = 0.18
    for name, col, R0 in rings:
        tr = 0.08
        S.tube(mat(name, col, rough=0.35), circle(R0 - tr, R0 - tr, z, 28), tr, segs=12, closed=True)
        z += tr * 1.9
    S.sphere(mat("rings_top", "#ff6fae", rough=0.35), (0, 0, z + 0.02), 0.09, segs=16, rings=10)
    objs.append(S.build("prop_rings"))

    # Crayons lying on the table
    Cr = Part()
    for k, (name, col) in enumerate((("crayon_red", "#ff4f5e"), ("crayon_blue", "#3f8cff"), ("crayon_green", "#4fc34a"), ("crayon_purple", "#a56bff"))):
        m = mat(name, col, rough=0.5)
        yaw = math.radians(-20 + k * 14)
        d = Vector((math.cos(yaw), math.sin(yaw), 0))
        o = Vector((0, k * 0.17 - 0.25, 0.06))
        Cr.cone(m, o - d * 0.35, d, 0.06, 0.06, 0.6, segs=12, sharp=60)
        Cr.cone(M("white"), o - d * 0.18, d, 0.064, 0.064, 0.28, segs=12, sharp=60)
        Cr.cone(m, o + d * 0.25, d, 0.06, 0.012, 0.14, segs=12, sharp=60)
    objs.append(Cr.build("prop_crayons"))

    # A little teddy bear sitting by the board (same toy style as the cards' animals)
    fur = mat("bear_fur", "#b97a4b")
    Te = Part()
    Te.sphere(fur, (0, 0, 0.3), (0.26, 0.24, 0.28), segs=22, rings=14)
    Te.sphere(mat("bear_belly", "#f1d0a8"), (0, -0.08, 0.27), (0.18, 0.17, 0.2), segs=18, rings=12)
    for s in (-1, 1):
        Te.sphere(fur, (s * 0.15, -0.12, 0.08), (0.09, 0.14, 0.08), segs=14, rings=10)
        Te.sphere(fur, (s * 0.24, -0.04, 0.34), (0.07, 0.07, 0.13), rot=(0, s * 30, 0), segs=14, rings=10)
    hc, hr = Vector((0, 0, 0.72)), (0.27, 0.24, 0.24)
    Te.sphere(fur, hc, hr, segs=24, rings=14)
    for s in (-1, 1):
        Te.sphere(fur, hc + Vector((s * 0.2, 0.02, 0.18)), (0.08, 0.05, 0.08), segs=12, rings=8)
        Te.sphere(M("bear_belly"), hc + Vector((s * 0.2, -0.02, 0.18)), (0.05, 0.03, 0.05), segs=12, rings=8)
    eyes(Te, hc, hr, spread=0.34, up=0.12, size=0.9)
    mc, mr = hc + Vector((0, -0.18, -0.08)), (0.1, 0.07, 0.07)
    Te.sphere(M("bear_belly"), mc, mr, segs=16, rings=10)
    Te.sphere(M("nose"), surf(mc, mr, (0, -1, 0.6)), (0.035, 0.025, 0.025), segs=10, rings=6)
    Te.tube(M("red"), [(-0.12, -0.21, 0.5), (0, -0.25, 0.48), (0.12, -0.21, 0.5)], 0.03, segs=8)
    Te.sphere(M("red"), (0, -0.25, 0.48), 0.05, segs=10, rings=8)
    objs.append(Te.build("prop_bear"))
    return objs


# --- Export and preview --------------------------------------------------------------------

def select_tree(roots):
    bpy.ops.object.select_all(action="DESELECT")
    for r in roots:
        r.select_set(True)
        for c in r.children_recursive:
            c.select_set(True)


def export(roots, filename):
    select_tree(roots)
    path = os.path.join(OUT, filename)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_texcoords=False)
    polys = sum(len(o.data.polygons) for r in roots for o in [r, *r.children_recursive] if o.type == "MESH")
    print(f"exported {path}: {polys} faces, {os.path.getsize(path) // 1024} KB")


def preview(out_dir, animals, card_root, setting_objs):
    scene = bpy.context.scene
    engines = [i.identifier for i in scene.render.bl_rna.properties["engine"].enum_items]
    for candidate in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = candidate
            break
        except TypeError:
            continue
    print("preview engine", scene.render.engine, engines)
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    world = bpy.data.worlds.new("world")
    scene.world = world
    if not world.node_tree:
        world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*srgb("#cfeff0"), 1)
    bg.inputs["Strength"].default_value = 0.9
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.5
    sun = bpy.data.objects.new("sun", sun_data)
    sun.rotation_euler = Euler((math.radians(45), math.radians(-10), math.radians(-30)))
    scene.collection.objects.link(sun)
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    def shoot(name, objs_visible, loc, target):
        for o in scene.objects:
            if o.type in ("MESH", "EMPTY"):
                o.hide_render = o not in objs_visible
        cam.location = loc
        d = Vector(target) - Vector(loc)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(out_dir, name)
        bpy.ops.render.render(write_still=True)

    for half in (0, 1):
        group = animals[half * 6:half * 6 + 6]
        for i, root in enumerate(group):
            root.location = (i - 2.5) * 0.95, 0, 0
        vis = [o for r in group for o in (r, *r.children)]
        shoot(f"animals_{half}.png", vis, (0, -7.6, 3.2), (0, 0, 0.45))
    for i, root in enumerate(animals[:4]):
        root.location = (i - 1.5) * 0.8, 0, 0
    vis4 = [o for r in animals[:4] for o in (r, *r.children)]
    shoot("closeup.png", vis4, (0, -3.0, 1.3), (0, 0, 0.5))
    for root in animals:
        root.location = (0, 0, 0)
    card_root.location = (0, 0, 0.5)
    flipped = card_root.copy()
    scene.collection.objects.link(flipped)
    m2 = card_root.children[0].copy()
    scene.collection.objects.link(m2)
    m2.parent = flipped
    flipped.location = (1.3, 0, 0.5)
    flipped.rotation_euler = (0, math.pi, 0)
    shoot("card.png", [card_root, flipped, card_root.children[0], m2], (0.65, -2.6, 2.4), (0.65, 0, 0.5))
    xs = {"prop_blocks": (-2.6, -2.2), "prop_ball": (2.6, -2.4), "prop_rings": (2.8, 2.4), "prop_crayons": (-2.8, 2.6), "prop_bear": (3.6, 0)}
    for o in setting_objs:
        if o.name in xs:
            o.location = (*xs[o.name], 0.03)
    shoot("setting.png", setting_objs, (0, -8.5, 7.5), (0, 0, 0))


def main():
    global BEVEL_AFFECT_EDGES
    bpy.ops.wm.read_factory_settings(use_empty=True)
    BEVEL_AFFECT_EDGES = _bevel_affect_edges()
    palette()
    os.makedirs(OUT, exist_ok=True)
    animals = [make() for make in ANIMALS]
    export(animals, "animals.glb")
    card_root = card()
    export([card_root], "card.glb")
    setting_objs = setting()
    export(setting_objs, "setting.glb")
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if "--preview" in args:
        preview(args[args.index("--preview") + 1], animals, card_root, setting_objs)


main()
