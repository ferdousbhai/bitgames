"""
Cake Stack models: cake layers, toppers, a cake stand, birthday customers and a
cosy bakery, all built procedurally (no textures) and exported to ../public/models/:

  cake.glb       cake layers, the cake stand and every topper
  animals.glb    the birthday customers and their party hat
  bakery.glb     the shop: floor, striped wall, shelves of treats, window, bunting, counter

Run headless from this folder (no Blender window needed):

    blender --background --python models.py
    blender --background --python models.py -- --preview /tmp/dir   # also renders previews
    blender --background --python models.py -- --cover ../public/cover.jpg

Coordinates: Blender Z is up and -Y faces the camera (three.js +Z after the Y-up
glTF export). Everything stands on its origin.

Names the game relies on
------------------------
cake.glb top-level nodes:
  cake_layer          one round layer, diameter 1 (radius 0.5), origin at the bottom
                      centre; stacks every LAYER_STEP = 0.3 (its iced top is at 0.305).
                      Materials the game tints per flavour: layer_sponge, layer_filling,
                      layer_icing (the drippy top).
  cake_layer_rainbow  the same shape with baked rainbow_0..4 sponge bands and layer_icing
  cake_stand          pedestal stand, top surface at STAND_TOP = 0.31, plate radius 0.95
  topper_candle       striped candle (material candle_wax is tinted by the game,
                      candle_stripe stays white). Child node candle_flame has its origin
                      at the wick so the game can flicker and blow it out.
  topper_cherry, topper_strawberry, topper_heart, topper_star, topper_cream
                      decorations, origin at the base, about 0.12-0.2 tall. Heart and
                      star stand upright facing -Y; the game turns them outward to stick
                      them on a layer's side.
  topper_sprinkles    a scatter of sprinkles over a radius-0.42 disc, lying flat at z = 0

animals.glb top-level nodes:
  animal_<name>       root of each customer, origin between its feet, facing -Y.
                      Children <name>_body (origin at the feet) and <name>_head
                      (origin at the neck, NECK_Z = 0.45, so rotating it nods the head).
                      Names: bear bunny cat puppy panda pig fox chick
  party_hat           cone hat, origin at its base; material hat_main is tinted per customer

bakery.glb top-level nodes:
  bakery              floor (z = FLOOR_Z = -1.2), back wall, shelves and treats, window,
                      bunting and lamps
  counter             the shop counter, top surface at z = 0, front edge at y = -0.8
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

DETAIL = 0.75
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "models")
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

LAYER_STEP = 0.3
STAND_TOP = 0.31
FLOOR_Z = -1.2


# --- Materials -----------------------------------------------------------------------

def srgb(hex_color):
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
    mat("leaf", "#4cbf56", rough=0.5)
    mat("stem", "#6b8f3a", rough=0.6)


# --- Geometry -------------------------------------------------------------------------

def face_rot(normal):
    return Vector(normal).normalized().to_track_quat("Z", "Y").to_matrix()


def rot3(r):
    if r is None:
        return Matrix.Identity(3)
    if isinstance(r, Matrix):
        return r
    return Euler([math.radians(a) for a in r]).to_matrix()


def surf(c, r, d):
    d = Vector(d).normalized()
    t = 1 / math.sqrt(sum((d[i] / r[i]) ** 2 for i in range(3)))
    return Vector(c) + d * t


def surf_normal(c, r, p):
    g = Vector([(p[i] - c[i]) / r[i] ** 2 for i in range(3)])
    return g.normalized()


BEVEL_AFFECT_EDGES = None


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
            t = (pts[(i + 1) % n] - pts[i - 1]) if closed else (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)])
            tangents.append(t.normalized())
        ref = Vector((0, 0, 1)) if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
        normal = (ref - tangents[0] * ref.dot(tangents[0])).normalized()
        rings, new_verts = [], []
        for i in range(n):
            t = tangents[i]
            normal = (normal - t * normal.dot(t)).normalized()
            bi = t.cross(normal)
            ring = [self.bm.verts.new(pts[i] + (normal * math.cos(2 * math.pi * k / segs) + bi * math.sin(2 * math.pi * k / segs)) * radii[i])
                    for k in range(segs)]
            rings.append(ring)
            new_verts += ring
        for i in range(n if closed else n - 1):
            a, b = rings[i], rings[(i + 1) % n]
            for k in range(segs):
                self.bm.faces.new((a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]))
        if not closed:
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

    def plane(self, m, center, size, upright=False):
        """A flat rectangle: lying down (facing +Z) or upright facing -Y."""
        w, h = size[0] / 2, size[1] / 2
        pts = [(-w, -h), (w, -h), (w, h), (-w, h)]
        c = Vector(center)
        vs = [self.bm.verts.new(c + (Vector((x, 0, y)) if upright else Vector((x, y, 0)))) for x, y in pts]
        f = self.bm.faces.new(vs if not upright else list(reversed(vs)))
        f.material_index = self._slot(m)
        f.smooth = False
        return {f}

    def rows(self, m, rows, closed=True, matrix=None, sharp=None):
        """Skin consecutive rows of points. A row is a single point (a pole) or a ring of n points."""
        vrows = [[self.bm.verts.new(p) for p in row] for row in rows]
        for a, b in zip(vrows, vrows[1:]):
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                n = len(b)
                for k in range(n if closed else n - 1):
                    self.bm.faces.new((a[0], b[k], b[(k + 1) % n]))
            elif len(b) == 1:
                n = len(a)
                for k in range(n if closed else n - 1):
                    self.bm.faces.new((a[(k + 1) % n], a[k], b[0]))
            else:
                n = len(a)
                for k in range(n if closed else n - 1):
                    self.bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
        verts = [v for r in vrows for v in r]
        return self._finish(verts, m, matrix or Matrix.Identity(4), sharp=sharp)

    def lathe(self, m, profile, segs=32, center=(0, 0, 0), radial=None, sharp=None):
        """Spin (r, z) points around Z. radial(theta, z) can scale the radius per angle."""
        c = Vector(center)
        rows = []
        for r, z in profile:
            if r < 1e-6:
                rows.append([c + Vector((0, 0, z))])
            else:
                row = []
                for k in range(segs):
                    a = 2 * math.pi * k / segs
                    rr = r * (radial(a, z) if radial else 1)
                    row.append(c + Vector((rr * math.cos(a), rr * math.sin(a), z)))
                rows.append(row)
        return self.rows(m, rows, sharp=sharp)

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


def root(name, *children):
    r = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(r)
    for c in children:
        c.parent = r
    return r


def circle(rx, ry, z, n, cy=0, cx=0):
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        x, y = cx + math.cos(a) * rx, cy + math.sin(a) * ry
        pts.append((x, y) if z is None else (x, y, z))
    return pts


def star(r_out, r_in, points=5, rot=90):
    pts = []
    for k in range(points * 2):
        a = math.radians(rot + 180 * k / points)
        r = r_out if k % 2 == 0 else r_in
        pts.append((r * math.cos(a), r * math.sin(a)))
    return pts


def heart_outline(size, n=48):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 17 * size, (y + 2) / 17 * size))
    pts.reverse()  # counter-clockwise
    return pts


UPRIGHT = Matrix.Rotation(math.radians(90), 4, "X")  # turns an XY outline to face -Y


# --- Cake -----------------------------------------------------------------------------------

def drip_fn(seed, count=11):
    rnd = random.Random(seed)
    drips = []
    for k in range(count):
        a = (k + rnd.uniform(-0.3, 0.3)) / count * 2 * math.pi
        drips.append((a, rnd.uniform(0.04, 0.115), rnd.uniform(0.12, 0.2)))

    def d(theta):
        total = 0.018
        for a, length, width in drips:
            u = (theta - a + math.pi) % (2 * math.pi) - math.pi
            u /= width
            if abs(u) < 1:
                total = max(total, 0.018 + length * (1 - u * u) ** 0.7)
        return total
    return d


def icing_cap(P, m, seed, segs=72, top=0.305):
    drip = drip_fn(seed)
    rows = [[(0, 0, top + 0.004)]]
    for r, z in ((0.22, top + 0.002), (0.4, top - 0.002), (0.47, top - 0.008), (0.5, top - 0.02), (0.513, top - 0.036)):
        rows.append([(r * math.cos(2 * math.pi * k / segs), r * math.sin(2 * math.pi * k / segs), z) for k in range(segs)])
    base = top - 0.036
    for frac, r, extra in ((0.5, 0.516, 0.0), (0.92, 0.516, 0.0), (1.0, 0.508, 0.012), (1.0, 0.49, 0.008)):
        row = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            z = base - drip(a) * frac - extra
            row.append((r * math.cos(a), r * math.sin(a), z))
        rows.append(row)
    P.rows(m, rows)


def cake_layer():
    sponge = mat("layer_sponge", "#f6d68b", rough=0.85)
    filling = mat("layer_filling", "#fff3e0", rough=0.5)
    icing = mat("layer_icing", "#fff3e0", rough=0.3)
    P = Part()
    P.lathe(sponge, [(0, 0), (0.46, 0), (0.492, 0.008), (0.5, 0.03), (0.5, 0.118), (0.0, 0.118)], segs=56)
    P.lathe(filling, [(0.492, 0.112), (0.507, 0.12), (0.511, 0.138), (0.507, 0.156), (0.492, 0.164)], segs=56)
    P.lathe(sponge, [(0.0, 0.158), (0.5, 0.158), (0.5, 0.29), (0.0, 0.29)], segs=56)
    icing_cap(P, icing, seed=4)
    return root("cake_layer", P.build("cake_layer_mesh"))


def cake_layer_rainbow():
    bands = [mat(f"rainbow_{i}", c, rough=0.8) for i, c in enumerate(["#ff6b6b", "#ffa94d", "#ffe066", "#69db7c", "#74c0fc"])]
    icing = M("layer_icing")
    P = Part()
    P.lathe(bands[0], [(0, 0), (0.46, 0), (0.492, 0.008), (0.5, 0.03), (0.5, 0.058), (0.0, 0.058)], segs=56)
    for i in range(1, 5):
        z0, z1 = 0.058 * i, 0.058 * (i + 1)
        P.lathe(bands[i], [(0.0, z0), (0.5, z0), (0.5, z1), (0.0, z1)], segs=56)
    icing_cap(P, icing, seed=9)
    return root("cake_layer_rainbow", P.build("cake_layer_rainbow_mesh"))


def cake_stand():
    white = mat("stand_white", "#fffaf3", rough=0.25)
    trim = mat("stand_trim", "#ff9ec4", rough=0.35)
    doily = mat("doily", "#ffffff", rough=0.7)
    P = Part()
    prof = [(0, 0), (0.4, 0), (0.43, 0.015), (0.42, 0.045), (0.3, 0.07), (0.12, 0.1), (0.085, 0.14), (0.085, 0.19),
            (0.14, 0.22), (0.7, 0.245), (0.93, 0.27), (0.95, 0.285), (0.93, 0.3), (0.0, 0.3)]
    P.lathe(white, prof, segs=64)
    for k in range(28):
        a = 2 * math.pi * k / 28
        P.sphere(trim, (math.cos(a) * 0.95, math.sin(a) * 0.95, 0.278), 0.028, segs=10, rings=6)
    P.tube(trim, circle(0.3, 0.3, 0.05, 32), 0.022, segs=8, closed=True)
    # Lacy doily: a scalloped disc with a ring of holes suggested by dots
    pts = []
    n = 120
    for k in range(n):
        a = 2 * math.pi * k / n
        r = 0.8 + 0.035 * abs(math.sin(a * 12))
        pts.append((r * math.cos(a), r * math.sin(a)))
    P.prism(doily, pts, 0.3, STAND_TOP, sharp=None)
    for k in range(24):
        a = 2 * math.pi * (k + 0.5) / 24
        P.sphere(mat("doily_dot", "#ffe3ee", rough=0.7), (math.cos(a) * 0.74, math.sin(a) * 0.74, STAND_TOP), (0.022, 0.022, 0.004), segs=8, rings=4)
    return root("cake_stand", P.build("cake_stand_mesh"))


def topper_candle():
    wax = mat("candle_wax", "#7bc8ff", rough=0.4)
    stripe = mat("candle_stripe", "#ffffff", rough=0.4)
    P = Part()
    P.cone(wax, (0, 0, 0), (0, 0, 1), 0.032, 0.032, 0.26, segs=16, sharp=60)
    pts = [(0.034 * math.cos(t), 0.034 * math.sin(t), 0.01 + t / (2 * math.pi) * 0.06) for t in [k * 0.35 for k in range(65)]]
    P.tube(stripe, [p for p in pts if p[2] < 0.255], 0.009, segs=6)
    P.tube(M("black"), [(0, 0, 0.255), (0, 0, 0.29), (0.004, 0, 0.3)], 0.006, segs=6)
    body = P.build("candle_body")
    F = Part()
    flame = mat("candle_flame", "#ffb52e", rough=0.4, emit=3.0)
    F.lathe(flame, [(0, 0.29), (0.02, 0.296), (0.028, 0.315), (0.022, 0.34), (0.01, 0.36), (0, 0.375)], segs=14)
    F.lathe(mat("flame_core", "#fff6c2", rough=0.4, emit=4.0), [(0, 0.292), (0.011, 0.3), (0.013, 0.312), (0.007, 0.33), (0, 0.338)], segs=10)
    fl = F.build("candle_flame", (0, 0, 0.29))
    r = root("topper_candle", body, fl)
    return r


def topper_cherry():
    P = Part()
    P.sphere(mat("cherry", "#e0233d", rough=0.15), (0, 0, 0.065), (0.07, 0.07, 0.065), segs=20, rings=12)
    P.sphere(M("shine"), (-0.03, -0.045, 0.1), 0.012, segs=8, rings=6)
    P.tube(M("stem"), [(0, 0, 0.12), (0.01, 0, 0.16), (0.035, 0.0, 0.2), (0.06, 0, 0.215)], 0.007, segs=6)
    P.sphere(M("leaf"), (0.07, 0, 0.215), (0.035, 0.012, 0.018), rot=(0, -20, 0), segs=10, rings=6)
    return root("topper_cherry", P.build("topper_cherry_mesh"))


def topper_strawberry():
    berry = mat("strawberry", "#ff4d6d", rough=0.35)
    P = Part()
    prof = [(0, 0), (0.025, 0.006), (0.05, 0.03), (0.068, 0.07), (0.07, 0.1), (0.06, 0.125), (0.035, 0.137), (0, 0.14)]
    P.lathe(berry, prof, segs=18)
    seed = mat("seed", "#ffe28a", rough=0.4)
    for i in range(4):
        z = 0.03 + i * 0.027
        rr = [0.048, 0.064, 0.07, 0.066][i]
        for k in range(7):
            a = 2 * math.pi * (k + 0.5 * (i % 2)) / 7
            P.sphere(seed, (rr * math.cos(a), rr * math.sin(a), z), (0.007, 0.007, 0.01), segs=6, rings=4)
    for k in range(5):
        a = 2 * math.pi * k / 5
        d = Vector((math.cos(a), math.sin(a), 0.4))
        P.sphere(M("leaf"), Vector((0, 0, 0.14)) + d * 0.03, (0.04, 0.016, 0.008), rot=face_rot(Vector((0, 0, 1))) @ Matrix.Rotation(a, 3, "Z"), segs=8, rings=5)
    P.tube(M("stem"), [(0, 0, 0.14), (0, 0, 0.17)], 0.008, segs=6)
    return root("topper_strawberry", P.build("topper_strawberry_mesh"))


def topper_heart():
    P = Part()
    P.prism(mat("heart_pink", "#ff5c9a", rough=0.3), heart_outline(0.09), -0.02, 0.02, bevel=0.014, sharp=None,
            matrix=Matrix.Translation((0, 0, 0.085)) @ UPRIGHT)
    return root("topper_heart", P.build("topper_heart_mesh"))


def topper_star():
    P = Part()
    P.prism(mat("star_gold", "#ffd23f", rough=0.25, metallic=0.4), star(0.09, 0.042), -0.02, 0.02, bevel=0.012, sharp=None,
            matrix=Matrix.Translation((0, 0, 0.09)) @ UPRIGHT)
    return root("topper_star", P.build("topper_star_mesh"))


def topper_cream():
    P = Part()
    prof = [(0, 0), (0.075, 0.0), (0.08, 0.02), (0.07, 0.045), (0.05, 0.07), (0.03, 0.095), (0.012, 0.12), (0, 0.135)]
    P.lathe(mat("whipped_cream", "#fffaf2", rough=0.45), prof, segs=40,
            radial=lambda a, z: 1 + 0.16 * math.cos(6 * a + z * 40))
    return root("topper_cream", P.build("topper_cream_mesh"))


def topper_sprinkles():
    rnd = random.Random(11)
    cols = [mat(f"sprinkle_{i}", c, rough=0.4) for i, c in
            enumerate(["#ff5c8a", "#ffd23f", "#4dabf7", "#69db7c", "#b197fc", "#ffffff"])]
    P = Part()
    for i in range(70):
        r = 0.42 * math.sqrt(rnd.random())
        a = rnd.random() * 2 * math.pi
        c = Vector((r * math.cos(a), r * math.sin(a), 0.012))
        yaw = rnd.random() * math.pi
        d = Vector((math.cos(yaw), math.sin(yaw), 0)) * 0.022
        P.tube(cols[i % len(cols)], [c - d, c + d], 0.009, segs=5)
    return root("topper_sprinkles", P.build("topper_sprinkles_mesh"))


def build_cake():
    return [cake_layer(), cake_layer_rainbow(), cake_stand(), topper_candle(), topper_cherry(), topper_strawberry(),
            topper_heart(), topper_star(), topper_cream(), topper_sprinkles()]


# --- Animals (same toy kit as Memory Match) ---------------------------------------------------

HC = Vector((0, 0, 0.66))
HR = (0.31, 0.27, 0.27)
BC = Vector((0, 0.02, 0.27))
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


def bow_tie(B, m):
    for s in (-1, 1):
        B.cone(m, (0, -0.2, 0.44), (s, -0.15, 0), 0.0, 0.05, 0.07, squash=(1, 0.7), segs=10)
    B.sphere(m, (0, -0.205, 0.44), 0.025, segs=10, rings=6)


def finish_animal(name, B, H):
    body = B.build(f"{name}_body", (0, 0, 0))
    head = H.build(f"{name}_head", NECK)
    return root(f"animal_{name}", body, head)


def bear():
    fur, light = mat("bear_fur", "#b97a4b"), mat("bear_belly", "#f1d0a8")
    B, H = Part(), Part()
    standard_body(B, fur, belly=light, feet=light)
    bow_tie(B, M("red"))
    H.sphere(fur, HC, HR, segs=28, rings=16)
    for s in (-1, 1):
        H.sphere(fur, HC + Vector((s * 0.22, 0.02, 0.2)), (0.09, 0.06, 0.09), segs=14, rings=10)
        H.sphere(light, HC + Vector((s * 0.22, -0.02, 0.2)), (0.055, 0.035, 0.055), segs=12, rings=8)
    eyes(H, up=0.12)
    mc, mr = HC + Vector((0, -0.19, -0.08)), (0.12, 0.08, 0.08)
    H.sphere(light, mc, mr, segs=18, rings=10)
    H.sphere(M("nose"), surf(mc, mr, (0, -1, 0.6)), (0.04, 0.028, 0.028), segs=12, rings=8)
    mouth(H, mc, mr, width=0.05, z=-0.25, sag=0.02)
    cheeks(H, spread=0.7)
    return finish_animal("bear", B, H)


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


def puppy():
    fur, dark = mat("dog_fur", "#d99a5b"), mat("dog_ear", "#8a5636")
    B, H = Part(), Part()
    standard_body(B, fur, belly=M("cream"))
    B.tube(fur, [(0, 0.2, 0.2), (0, 0.29, 0.3), (0.02, 0.32, 0.42), (0.05, 0.3, 0.5)], [0.045, 0.042, 0.036, 0.03], segs=10)
    B.tube(mat("collar_blue", "#4d9bff", rough=0.4), circle(0.16, 0.15, 0.475, 20, cy=0.02), 0.03, segs=8, closed=True)
    B.sphere(M("gold"), (0, -0.17, 0.43), (0.04, 0.02, 0.045), segs=12, rings=8)
    H.sphere(fur, HC, HR, segs=28, rings=16)
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
    return finish_animal("puppy", B, H)


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
    curl = [(0.03 * math.cos(t * 2.2), 0.22 + 0.02 * t, 0.26 + 0.03 * math.sin(t * 2.2) + 0.01 * t) for t in [k * 0.4 for k in range(9)]]
    B.tube(skin, curl, 0.016, segs=8)
    bow_tie(B, mat("bow_purple", "#9b6cf0", rough=0.4))
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


def chick():
    fluff = mat("chick_fluff", "#ffd83b")
    B, H = Part(), Part()
    standard_body(B, fluff, feet=M("orange"), arms=fluff)
    for s in (-1, 1):
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


def party_hat():
    main, stripe, pom = mat("hat_main", "#ff6fae", rough=0.45), mat("hat_stripe", "#ffffff", rough=0.45), mat("hat_pom", "#ffd23f", rough=0.6)
    P = Part()
    faces = P.cone(main, (0, 0, 0), (0, 0, 1), 0.12, 0.0, 0.3, segs=24, sharp=None)
    s = P._slot(stripe)
    for f in faces:
        c = f.calc_center_median()
        if 0.02 < c.z < 0.29 and int((c.z * 22 + math.atan2(c.y, c.x) / (2 * math.pi) * 2) % 2) == 0:
            f.material_index = s
    P.sphere(pom, (0, 0, 0.31), 0.045, segs=12, rings=8)
    P.tube(pom, circle(0.12, 0.12, 0.005, 24), 0.018, segs=6, closed=True)
    return root("party_hat", P.build("party_hat_mesh"))


ANIMALS = [bear, bunny, cat, puppy, panda, pig, fox, chick]


# --- Bakery ------------------------------------------------------------------------------------

def cupcake(P, x, y, z, s, frost, rnd):
    wrap = mat("cupcake_wrap", "#8fd3fe", rough=0.5)
    P.lathe(wrap, [(0, 0), (0.12 * s, 0), (0.15 * s, 0.13 * s), (0.0, 0.13 * s)], segs=12, center=(x, y, z),
            radial=lambda a, zz: 1 + 0.06 * abs(math.cos(a * 6)))
    P.lathe(frost, [(0.16 * s, 0.12 * s), (0.17 * s, 0.17 * s), (0.13 * s, 0.22 * s), (0.08 * s, 0.27 * s), (0.03 * s, 0.31 * s), (0, 0.32 * s)],
            segs=15, center=(x, y, z), radial=lambda a, zz: 1 + 0.12 * math.cos(5 * a + zz / s * 30))
    P.sphere(M("cherry"), (x, y, z + 0.34 * s), 0.045 * s, segs=10, rings=6)


def standing_donut(x, y, z, s, icing_mat, rnd):
    D = Part()
    dough = mat("donut_dough", "#e0a25e", rough=0.7)
    D.tube(dough, circle(0.14, 0.14, 0, 16), 0.075, segs=8, closed=True)
    D.tube(icing_mat, [(p[0], p[1], 0.03) for p in circle(0.14, 0.14, 0, 16)], 0.06, segs=8, closed=True)
    for k in range(6):
        a = rnd.random() * 2 * math.pi
        rr = 0.14 + rnd.uniform(-0.04, 0.04)
        D.sphere(M(f"sprinkle_{k % 5}"), (rr * math.cos(a), rr * math.sin(a), 0.09), (0.012, 0.03, 0.01), rot=(0, 0, math.degrees(rnd.random() * 3)), segs=6, rings=4)
    return D


def jar(P, x, y, z, s, cookie_mat):
    glass = mat("jar_glass", "#d8f3ff", rough=0.08)
    P.lathe(glass, [(0, 0), (0.17 * s, 0), (0.19 * s, 0.03 * s), (0.19 * s, 0.4 * s), (0.15 * s, 0.44 * s), (0.0, 0.44 * s)], segs=14, center=(x, y, z))
    P.lathe(mat("jar_lid", "#ff8fab", rough=0.4), [(0, 0.44 * s), (0.16 * s, 0.44 * s), (0.17 * s, 0.5 * s), (0.0, 0.5 * s)], segs=14, center=(x, y, z))
    P.sphere(mat("jar_lid", "#ff8fab"), (x, y, z + 0.53 * s), 0.04 * s, segs=10, rings=6)
    for k in range(3):
        P.box(cookie_mat, (x, y - 0.17 * s, z + (0.1 + k * 0.11) * s), (0.22 * s, 0.03 * s, 0.09 * s), bevel=0.02 * s, segments=1,
              rot=(90, 0, (k - 1) * 12))


def macarons(P, x, y, z, s, rnd):
    cols = [mat("mac_pink", "#ffa8c5", rough=0.5), mat("mac_mint", "#a8e6cf", rough=0.5), mat("mac_lemon", "#ffe599", rough=0.5),
            mat("mac_lilac", "#cdb4ff", rough=0.5)]
    for k in range(3):
        c = cols[(k + int(x * 3)) % 4]
        zz = z + k * 0.11 * s
        P.lathe(c, [(0, zz), (0.1 * s, zz + 0.004 * s), (0.11 * s, zz + 0.03 * s), (0.1 * s, zz + 0.05 * s), (0.105 * s, zz + 0.06 * s),
                    (0.11 * s, zz + 0.08 * s), (0.09 * s, zz + 0.1 * s), (0, zz + 0.105 * s)], segs=14, center=(x, y, 0))
        P.lathe(M("cream"), [(0.098 * s, zz + 0.048 * s), (0.104 * s, zz + 0.055 * s), (0.098 * s, zz + 0.062 * s)], segs=14, center=(x, y, 0))


def loaf(P, x, y, z, s):
    crust = mat("bread_crust", "#d9904a", rough=0.7)
    P.sphere(crust, (x, y, z + 0.1 * s), (0.25 * s, 0.13 * s, 0.13 * s), segs=20, rings=12)
    for k in (-1, 0, 1):
        P.sphere(mat("bread_cut", "#f5d7a1", rough=0.8), (x + k * 0.1 * s, y - 0.02 * s, z + 0.21 * s), (0.03 * s, 0.1 * s, 0.012 * s),
                 rot=(0, 0, 25), segs=6, rings=4)


def mini_cake(P, x, y, z, s, sponge, icing):
    P.lathe(sponge, [(0, 0), (0.2 * s, 0), (0.2 * s, 0.18 * s), (0, 0.18 * s)], segs=20, center=(x, y, z))
    P.lathe(icing, [(0, 0.2 * s), (0.18 * s, 0.2 * s), (0.21 * s, 0.17 * s), (0.21 * s, 0.13 * s), (0.19 * s, 0.12 * s)], segs=20,
            center=(x, y, z))
    P.sphere(M("cherry"), (x, y, z + 0.24 * s), 0.04 * s, segs=10, rings=6)


def build_bakery():
    global DETAIL
    DETAIL = 0.5
    rnd = random.Random(5)
    P = Part()
    # Checkered floor
    tiles = [mat("floor_a", "#fff1e6", rough=0.7), mat("floor_b", "#f7c6d9", rough=0.7)]
    for i in range(-14, 14):
        for j in range(-10, 4):
            P.plane(tiles[(i + j) % 2], (i + 0.5, j + 0.5, FLOOR_Z), (1, 1))
    # Striped wallpaper from floor to ceiling, a chair rail and a wainscot
    stripes = [mat("wall_a", "#fff4e8", rough=0.9), mat("wall_b", "#ffe1ea", rough=0.9)]
    for i in range(-28, 28):
        P.plane(stripes[i % 2], (i * 0.5 + 0.25, 3.2, 5.0), (0.5, 12.4), upright=True)
    P.box(mat("wainscot", "#b5e8e0", rough=0.6), (0, 3.15, FLOOR_Z + 0.75), (28, 0.12, 1.5), bevel=0.02, segments=1)
    P.box(M("white"), (0, 3.07, FLOOR_Z + 1.52), (28, 0.12, 0.1), bevel=0.03, segments=2)
    P.box(M("white"), (0, 3.07, 10.7), (28, 0.2, 0.3), bevel=0.04, segments=2)
    # Shelves on both sides, full of treats
    wood = mat("shelf_wood", "#d9a066", rough=0.6)
    frosts = [mat("frost_pink", "#ff9ec4", rough=0.45), mat("frost_mint", "#a8e6cf", rough=0.45),
              mat("frost_choc", "#8a5a3c", rough=0.45), mat("frost_lemon", "#ffe066", rough=0.45), mat("frost_lilac", "#cdb4ff", rough=0.45)]
    mat("cherry", "#e0233d", rough=0.15)
    for k, c in enumerate(["#ff5c8a", "#ffd23f", "#4dabf7", "#69db7c", "#b197fc"]):
        mat(f"sprinkle_{k}", c, rough=0.4)
    cookie = mat("cookie", "#d69a5a", rough=0.7)
    sponges = [mat("mini_sponge", "#f6d68b", rough=0.8), mat("mini_choc", "#7a4a2e", rough=0.8)]
    donuts = []
    for side in (-1, 1):
        for level, z in enumerate((1.4, 2.9, 4.4)):
            x0, x1 = (2.4, 7.4) if side > 0 else (-7.4, -2.4)
            P.box(wood, ((x0 + x1) / 2, 2.85, z), (x1 - x0, 0.6, 0.1), bevel=0.03, segments=2)
            for bx in (x0 + 0.3, x1 - 0.3):
                P.box(wood, (bx, 3.0, z - 0.18), (0.08, 0.3, 0.3), bevel=0.02, segments=1)
            x = x0 + 0.5
            while x < x1 - 0.4:
                kind = rnd.choice(["cupcake", "cupcake", "donut", "jar", "macaron", "loaf", "cake"])
                s = rnd.uniform(1.0, 1.2)
                zt = z + 0.05
                if kind == "cupcake":
                    cupcake(P, x, 2.8, zt, s * 1.3, rnd.choice(frosts), rnd)
                    x += 0.55
                elif kind == "donut":
                    D = standing_donut(0, 0, 0, s, rnd.choice(frosts), rnd)
                    donuts.append((D, Matrix.Translation((x, 2.8, zt + 0.22 * s)) @ Matrix.Rotation(math.radians(80), 4, "X") @ Matrix.Diagonal((s, s, s, 1))))
                    x += 0.55
                elif kind == "jar":
                    jar(P, x, 2.85, zt, s, cookie)
                    x += 0.55
                elif kind == "macaron":
                    macarons(P, x, 2.8, zt, s * 1.1, rnd)
                    x += 0.45
                elif kind == "loaf":
                    loaf(P, x + 0.05, 2.8, zt, s * 1.2)
                    x += 0.7
                else:
                    mini_cake(P, x + 0.05, 2.8, zt, s * 1.2, rnd.choice(sponges), rnd.choice(frosts))
                    x += 0.6
    # Round window high in the middle, with sky and fluffy clouds
    wz = 7.2
    P.lathe(mat("window_sky", "#9fdcff", rough=0.4, emit=0.6), [(0, 0), (1.25, 0)], segs=40, center=(0, 3.18, wz),
            sharp=None)
    P.tube(M("white"), [(math.cos(a) * 1.3, 3.1, wz + math.sin(a) * 1.3) for a in [2 * math.pi * k / 40 for k in range(40)]], 0.12, segs=10, closed=True)
    P.box(M("white"), (0, 3.12, wz), (2.5, 0.06, 0.08), bevel=0)
    P.box(M("white"), (0, 3.12, wz), (0.08, 0.06, 2.5), bevel=0)
    cloud = mat("cloud", "#ffffff", rough=0.9, emit=0.4)
    for cx, cz, cs in ((-0.5, 0.35, 1.0), (0.55, -0.4, 0.8)):
        for dx, dz, r in ((-0.22, 0, 0.17), (0, 0.08, 0.22), (0.22, 0, 0.16)):
            P.sphere(cloud, (cx + dx * cs, 3.17, wz + cz + dz * cs), (r * cs, 0.03, r * cs * 0.85), segs=12, rings=6)
    P.tube(M("white"), [(-1.7, 3.1, wz - 1.45), (1.7, 3.1, wz - 1.45)], 0.08, segs=8)
    # Bunting across the wall
    flag_cols = [mat("flag_pink", "#ff6fae", rough=0.6), mat("flag_yellow", "#ffd23f", rough=0.6), mat("flag_mint", "#4fd1c5", rough=0.6),
                 mat("flag_purple", "#9b6cf0", rough=0.6), mat("flag_orange", "#ff9f43", rough=0.6)]
    for row, (bz, span) in enumerate(((9.2, 13.0), (4.9, 4.4))):
        n = 40 if row == 0 else 18
        pts = []
        for k in range(n + 1):
            u = k / n
            x = -span + 2 * span * u
            sag = 0.55 * math.sin(math.pi * ((u * (4 if row == 0 else 1)) % 1))
            pts.append((x, 2.95, bz - sag))
        P.tube(M("white"), pts, 0.02, segs=5)
        for k in range(1, n):
            if k % 2:
                continue
            p = Vector(pts[k])
            tri = [(-0.17, 0), (0.17, 0), (0, -0.36)]
            P.prism(flag_cols[(k // 2) % 5], [(a, b) for a, b in tri], -0.01, 0.01,
                    matrix=Matrix.Translation(p + Vector((0, -0.01, 0))) @ UPRIGHT)
    # Pendant lamps hanging from the ceiling
    for lx in (-4.6, 4.6):
        P.tube(M("black"), [(lx, 2.2, 11), (lx, 2.2, 8.9)], 0.02, segs=5)
        P.lathe(mat("lamp_shade", "#ffcf6e", rough=0.4), [(0.05, 8.95), (0.35, 8.6), (0.55, 8.35), (0.56, 8.32), (0.0, 8.32)], segs=24,
                center=(lx, 2.2, 0))
        P.sphere(mat("bulb", "#fff6c2", rough=0.3, emit=3.0), (lx, 2.2, 8.3), 0.12, segs=12, rings=8)
    # Potted plants on the floor by the counter ends
    for px in (-7.2, 7.2):
        P.lathe(mat("pot", "#ff9f7a", rough=0.6), [(0, FLOOR_Z), (0.3, FLOOR_Z), (0.4, FLOOR_Z + 0.6), (0.43, FLOOR_Z + 0.65), (0.0, FLOOR_Z + 0.65)],
                segs=20, center=(px, 1.8, 0))
        for k in range(7):
            a = 2 * math.pi * k / 7
            tip = Vector((px + 0.45 * math.cos(a), 1.8 + 0.3 * math.sin(a), FLOOR_Z + 1.5 + 0.2 * math.sin(k)))
            P.sphere(M("leaf"), (Vector((px, 1.8, FLOOR_Z + 0.7)) + tip) / 2, (0.09, 0.09, 0.42), rot=face_rot(tip - Vector((px, 1.8, FLOOR_Z + 0.7))), segs=10, rings=8)
    objs = [P.build("bakery_mesh")]
    for i, (D, mtx) in enumerate(donuts):
        bmesh.ops.transform(D.bm, matrix=mtx, verts=D.bm.verts[:])
        objs.append(D.build(f"bakery_donut_{i}"))
    # Fold the donuts into the main mesh so the bakery is one draw per material.
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    mesh = bpy.context.view_layer.objects.active
    mesh.name = "bakery_mesh"
    return root("bakery", mesh)


def build_counter():
    global DETAIL
    P = Part()
    P.box(mat("counter_top", "#fffaf5", rough=0.25), (0, 0, -0.06), (12.4, 1.8, 0.12), bevel=0.04, segments=2)
    P.box(mat("counter_body", "#8fd3c7", rough=0.55), (0, 0.05, -0.65), (12, 1.5, 1.1), bevel=0.03, segments=1)
    panel = mat("counter_panel", "#b5ece2", rough=0.55)
    for k in range(-5, 6):
        P.box(panel, (k * 1.05, -0.72, -0.64), (0.85, 0.06, 0.8), bevel=0.04, segments=2)
        P.sphere(mat("counter_dot", "#ff9ec4", rough=0.4), (k * 1.05, -0.76, -0.64), (0.07, 0.03, 0.07), segs=10, rings=6)
    P.box(mat("counter_kick", "#5fb8aa", rough=0.6), (0, -0.6, FLOOR_Z + 0.06), (12, 0.1, 0.12), bevel=0.02, segments=1)
    # Scalloped trim along the counter's front edge
    trim = mat("counter_trim", "#ff9ec4", rough=0.45)
    for k in range(-20, 21):
        P.sphere(trim, (k * 0.3, -0.86, -0.13), (0.15, 0.03, 0.08), segs=10, rings=6)
    root_ = root("counter", P.build("counter_mesh"))
    DETAIL = 0.75
    return root_


# --- Export and preview -----------------------------------------------------------------------

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


FLAVOURS = [("#f7d98f", "#fff3e0", "#fffaf0"), ("#ffc2d4", "#ff5c8a", "#ff8fb8"), ("#8a5a3c", "#ffe0c2", "#5a3420"),
            ("#ffe680", "#fffbe0", "#fff07a"), ("#b8f0d8", "#ffffff", "#4fd1b5"), ("#d2c7ff", "#ffffff", "#8f7cf7")]


def tinted_copy(r, tints):
    """Duplicate a root and its children with recoloured material copies (preview only)."""
    nr = r.copy()
    bpy.context.collection.objects.link(nr)
    for c in r.children:
        nc = c.copy()
        nc.data = c.data.copy()
        bpy.context.collection.objects.link(nc)
        nc.parent = nr
        for i, m in enumerate(nc.data.materials):
            if m and m.name in tints:
                m2 = m.copy()
                bsdf = next(n for n in m2.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
                bsdf.inputs["Base Color"].default_value = (*srgb(tints[m.name]), 1)
                nc.data.materials[i] = m2
    return nr


def setup_render(res=(1280, 720)):
    scene = bpy.context.scene
    for candidate in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = candidate
            break
        except TypeError:
            continue
    scene.render.resolution_x, scene.render.resolution_y = res
    vt = [i.identifier for i in scene.view_settings.bl_rna.properties["view_transform"].enum_items]
    if "Standard" in vt:
        scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("world")
    scene.world = world
    if not world.node_tree:
        world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*srgb("#ffe8ef"), 1)
    bg.inputs["Strength"].default_value = 0.55
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 4.2
    sun.rotation_euler = Euler((math.radians(50), math.radians(-8), math.radians(-25)))
    scene.collection.objects.link(sun)
    fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "SUN"))
    fill.data.energy = 1.0
    fill.rotation_euler = Euler((math.radians(70), math.radians(20), math.radians(40)))
    scene.collection.objects.link(fill)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    return scene, cam


def shoot(scene, cam, path, loc, target, lens=40, fmt="PNG"):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    scene.render.image_settings.file_format = next(i.identifier for i in scene.render.image_settings.bl_rna.properties["file_format"].enum_items if i.identifier == fmt)
    if fmt == "JPEG":
        scene.render.image_settings.quality = 88
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


def compose_scene(cake, animals):
    """A finished birthday cake on the counter with its customer (used by the previews and the cover)."""
    by = {r.name: r for r in cake}
    stand = by["cake_stand"]
    widths = [1.3, 1.3, 1.25, 1.2, 1.2, 1.12, 1.05, 1.0]
    z = STAND_TOP
    top = None
    for i, w in enumerate(widths):
        src = by["cake_layer_rainbow"] if i == 5 else by["cake_layer"]
        sp, fi, ic = FLAVOURS[i % len(FLAVOURS)]
        L = tinted_copy(src, {"layer_sponge": sp, "layer_filling": fi, "layer_icing": ic if i != 5 else "#ffffff"})
        L.location = (0.02 * math.sin(i * 1.7), 0, z)
        L.scale = (w, w, 1)
        z += LAYER_STEP
        top = (L.location.x, w)
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        rr = top[1] * 0.3
        cols = ["#7bc8ff", "#ff8fab", "#ffd23f", "#8ce99a", "#b197fc"]
        c = tinted_copy(by["topper_candle"], {"candle_wax": cols[k]})
        c.location = (top[0] + rr * math.cos(a), rr * math.sin(a), z + 0.005)
    for k in range(10):
        a = 2 * math.pi * k / 10
        dl = by["topper_cream"].copy() if k else by["topper_cream"]
        if k:
            bpy.context.collection.objects.link(dl)
            for ch in by["topper_cream"].children:
                cc = ch.copy()
                bpy.context.collection.objects.link(cc)
                cc.parent = dl
        dl.location = (top[0] + top[1] * 0.43 * math.cos(a), top[1] * 0.43 * math.sin(a), z)
    by["topper_sprinkles"].location = (top[0], 0, z)
    by["topper_sprinkles"].scale = (top[1] * 0.7, top[1] * 0.7, 1)
    for nm, (x, zz) in (("topper_strawberry", (0.0, STAND_TOP + 0.15 + 3 * LAYER_STEP)), ("topper_heart", (0.0, STAND_TOP + 0.12 + 5 * LAYER_STEP))):
        o = by[nm]
        o.location = (x, -0.63, zz)
    for r in cake:
        if r.name in ("cake_layer", "cake_layer_rainbow", "topper_candle", "topper_cherry", "topper_star"):
            r.hide_render = True
            for c in r.children:
                c.hide_render = True
    return z


def main():
    global BEVEL_AFFECT_EDGES
    bpy.ops.wm.read_factory_settings(use_empty=True)
    BEVEL_AFFECT_EDGES = _bevel_affect_edges()
    palette()
    os.makedirs(OUT, exist_ok=True)
    cake = build_cake()
    export(cake, "cake.glb")
    animals = [make() for make in ANIMALS]
    hat = party_hat()
    export(animals + [hat], "animals.glb")
    bakery = [build_bakery(), build_counter()]
    export(bakery, "bakery.glb")

    preview_dir = ARGS[ARGS.index("--preview") + 1] if "--preview" in ARGS else None
    cover = ARGS[ARGS.index("--cover") + 1] if "--cover" in ARGS else None
    if not (preview_dir or cover):
        return
    scene, cam = setup_render()
    top = compose_scene(cake, animals)
    for i, a in enumerate(animals):
        a.location = (100, 0, 0)
    bear_ = next(a for a in animals if a.name == "animal_bear")
    bear_.location = (1.55, 0.2, 0)
    bear_.scale = (1.5, 1.5, 1.5)
    bear_.rotation_euler = (0, 0, math.radians(-22))
    hat.location = (1.55 - 0.04, 0.2, 0.0 + 0.95 * 1.5)
    hat.scale = (1.5, 1.5, 1.5)
    hat.rotation_euler = (0, math.radians(12), 0)
    bunny_ = next(a for a in animals if a.name == "animal_bunny")
    bunny_.location = (-1.6, 0.3, 0)
    bunny_.scale = (1.35, 1.35, 1.35)
    bunny_.rotation_euler = (0, 0, math.radians(22))
    # Confetti in the air
    rnd = random.Random(2)
    conf = Part()
    cols = [mat(f"conf_{i}", c, rough=0.5) for i, c in enumerate(["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#ff6b9d", "#2ec4b6", "#9b5de5"])]
    for i in range(140):
        p = (rnd.uniform(-3.2, 3.2), rnd.uniform(-1.5, 0.8), rnd.uniform(0.2, 4.2))
        conf.box(cols[i % len(cols)], p, (0.08, 0.05, 0.004), bevel=0, rot=(rnd.uniform(0, 360), rnd.uniform(0, 360), rnd.uniform(0, 360)))
    conf.build("confetti")
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)
        shoot(scene, cam, os.path.join(preview_dir, "cake.png"), (0, -8.5, 3.2), (0, 0, 1.6), lens=40)
        shoot(scene, cam, os.path.join(preview_dir, "close.png"), (0.5, -4.2, 2.6), (0.4, 0, 1.6), lens=40)
    if cover:
        shoot(scene, cam, os.path.abspath(cover), (0, -8.2, 2.9), (0, 0, 1.75), lens=40, fmt="JPEG")


main()
