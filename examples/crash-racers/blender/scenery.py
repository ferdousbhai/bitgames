"""
Scenery models for the five places (props.py exports them with the landmarks).
Each function adds one Prop; animated props have named parts whose origins are
their pivots (see kit.py). 'tint' faces are recoloured by the game.
"""
import math

import bmesh
from mathutils import Euler, Vector

from kit import cube, curve, cyl, frustum, ico, jitter, lathe, leaf, prism, prop, sphere, torus, tube, xf

CREAM = "#fff1cf"
WHITE = "#ffffff"
BLACK = "#1b1b1f"
BLUSH = "#ff9e9e"


def eyes(p, part, x, y, z, r, look=(0, 1, 0)):
    """Big friendly cartoon eyes on both sides at (±x, y, z), looking along `look`."""
    look = Vector(look).normalized()
    for sx in (-1, 1):
        c = Vector((sx * x, y, z))
        out = Vector((sx * 0.75, 0, 0)) + look  # eyes look forward and a little outwards
        out.normalize()
        p.add(sphere(r, c, segs=12, rings=8), WHITE, part)
        p.add(sphere(r * 0.58, c + out * r * 0.62, segs=10, rings=6), BLACK, part)
        p.add(sphere(r * 0.2, c + out * r * 0.95 + Vector((0, 0, r * 0.3)), segs=6, rings=4), WHITE, part)


def spikes(p, part, pts, size, color, every=1):
    """A row of soft back plates along a list of (point, up) pairs."""
    for i, (pt, up) in enumerate(pts):
        if i % every:
            continue
        s = size * (1 - 0.5 * abs(i / max(1, len(pts) - 1) - 0.4))
        p.add(xf(cyl(s * 0.45, 0.02, s, segs=5), pt - up * 0.15, up.to_track_quat("Z", "Y").to_euler()), color, part, smooth=False)


# --- Dino Valley ------------------------------------------------------------------------


def trex():
    p = prop("trex")
    skin, belly = "tint", CREAM
    p.part("body").part("head", (0, 1.9, 5.3)).part("tail", (0, -1.5, 3.4))
    # Torso tilted nose-up, a creamy tummy, big thighs.
    p.add(sphere(1, (0, 0.2, 3.5), (1.55, 2.3, 1.65), (0.4, 0, 0), 16, 10), skin)
    p.add(sphere(1, (0, 0.85, 3.2), (1.2, 1.7, 1.3), (0.45, 0, 0), 14, 8), belly)
    for sx in (-1, 1):
        p.add(sphere(1, (sx * 1.15, -0.4, 2.8), (0.75, 1.25, 1.3), (0.2, 0, 0), 12, 8), skin)
        p.add(tube([(sx * 1.2, -0.2, 2.2), (sx * 1.25, 0.05, 1.2), (sx * 1.25, 0.25, 0.45)], [0.5, 0.42, 0.4], 10), skin)
        p.add(sphere(1, (sx * 1.25, 0.6, 0.28), (0.6, 0.9, 0.3), segs=12, rings=6), skin)
        for k in (-1, 0, 1):
            p.add(cyl(0.13, 0.0, 0.35, (sx * 1.25 + k * 0.3, 1.4, 0.18), (-math.pi / 2, 0, 0), 6), CREAM)
        # Tiny arms (the best part)
        p.add(tube([(sx * 0.95, 1.6, 3.9), (sx * 1.15, 2.2, 3.55), (sx * 1.05, 2.55, 3.2)], [0.26, 0.22, 0.2], 8), skin)
        p.add(sphere(0.2, (sx * 1.0, 2.7, 3.1), segs=8, rings=6), skin)
    # Neck
    p.add(tube([(0, 1.3, 4.3), (0, 1.8, 5.0), (0, 2.1, 5.5)], [1.05, 0.95, 0.9], 12, cap_start=False), skin)
    # Head: big round skull, snout, smiley jaw, teeth, eyes, nostrils, blushing cheeks.
    p.add(sphere(1, (0, 2.8, 6.15), (1.2, 1.55, 1.1), (0.15, 0, 0), 16, 10), skin, "head")
    p.add(sphere(1, (0, 3.95, 5.9), (1.0, 1.05, 0.78), segs=14, rings=8), skin, "head")
    p.add(sphere(1, (0, 3.35, 5.25), (0.92, 1.4, 0.42), (0.1, 0, 0), 14, 8), belly, "head")
    for x in (-0.55, -0.2, 0.2, 0.55):
        p.add(cyl(0.11, 0.0, 0.3, (x, 4.55 - abs(x) * 0.6, 5.55), (math.pi, 0, 0), 6), WHITE, "head", smooth=False)
    eyes(p, "head", 0.78, 3.05, 6.75, 0.4)
    for sx in (-1, 1):
        p.add(sphere(0.1, (sx * 0.35, 4.92, 6.25), segs=6, rings=4), BLACK, "head")
        p.add(sphere(1, (sx * 0.95, 3.75, 5.75), (0.06, 0.3, 0.2), segs=8, rings=6), BLUSH, "head")
        p.add(sphere(1, (sx * 0.62, 2.85, 7.15), (0.4, 0.22, 0.12), (0, -sx * 0.25, 0), 8, 6), skin, "head")  # brows
    # Tail: a long taper, plates along the spine.
    pts = curve(lambda t: Vector((0.4 * math.sin(t * 2.2), -1.3 - 5.6 * t, 3.4 - 1.9 * t * t - 0.2 * t)), 8)
    p.add(tube(pts, [1.2, 1.05, 0.9, 0.72, 0.55, 0.4, 0.26, 0.14], 12, cap_start=False), skin, "tail")
    plates = "#ffcf4a"
    spikes(p, "tail", [(pts[i] + Vector((0, 0, r * 0.9)), Vector((0, -0.25, 1)).normalized()) for i, r in ((1, 1.05), (3, 0.72), (5, 0.4))], 0.7, plates)
    for t in (0.0, 0.3, 0.6, 0.9):
        a = -0.6 + t * 1.6
        c = Vector((0, 0.2 + math.sin(a) * 2.2, 3.5 + math.cos(a) * 1.5))
        up = Vector((0, math.sin(a) * 0.7, math.cos(a))).normalized()
        spikes(p, "body", [(c, up)], 0.85, plates)
    # Spots
    for x, y, z in ((0.9, -0.6, 4.4), (-1.0, 0.3, 4.6), (0.5, 0.9, 4.9), (-0.6, -1.2, 4.2)):
        p.add(sphere(1, (x, y, z), (0.35, 0.45, 0.18), (0, x * 0.5, 0), 8, 5), "#ffe08a")


def longneck():
    p = prop("longneck")
    skin = "tint"
    p.part("body").part("neck", (0, 3.4, 5.6)).part("tail", (0, -3.8, 4.6))
    p.add(sphere(1, (0, 0, 4.7), (2.6, 4.3, 2.5), segs=18, rings=10), skin)
    p.add(sphere(1, (0, 0.5, 3.6), (2.0, 3.3, 1.5), segs=14, rings=8), CREAM)
    for sx in (-1, 1):
        for sy in (-1, 1):
            base = (sx * 1.6, sy * 2.5, 0)
            p.add(cyl(0.95, 0.85, 4.2, base, segs=12), skin)
            p.add(sphere(1, (sx * 1.6, sy * 2.5, 0.25), (1.05, 1.05, 0.4), segs=12, rings=6), skin)
            for k in (-1, 0, 1):
                p.add(sphere(0.2, (sx * 1.6 + k * 0.45, sy * 2.5 + 0.95, 0.2), segs=6, rings=4), CREAM)
    # Neck rising, then arching over sideways (+X), so the head hangs over the road.
    def neck_pt(t):
        return Vector((8.8 * t ** 2.2, 3.2 + 1.2 * t, 5.4 + 9.6 * (1 - (1 - t) ** 2)))
    pts = curve(neck_pt, 10)
    p.add(tube(pts, [1.45 - 0.7 * i / 9 for i in range(10)], 12, cap_start=False, cap_end=False), skin, "neck")
    for i in range(1, 9, 2):  # cream spots along the neck
        t = i / 9
        c = neck_pt(t)
        p.add(sphere(1, c + Vector((0, 0.45 + 0.4 * (1 - t), 0.4)), (0.4, 0.2, 0.3), segs=8, rings=5), "#d8f0a0", "neck")
    # Head looking down at the cars.
    head = pts[-1] + Vector((0.7, 0.1, -0.3))
    p.add(sphere(1, head, (1.15, 0.8, 0.75), (0, 0.5, 0), 14, 8), skin, "neck")
    p.add(sphere(1, head + Vector((0.7, 0, -0.45)), (0.7, 0.65, 0.4), (0, 0.5, 0), 12, 8), skin, "neck")
    for sy in (-1, 1):
        c = head + Vector((0.1, sy * 0.62, 0.25))
        p.add(sphere(0.32, c, segs=12, rings=8), WHITE, "neck")
        p.add(sphere(0.19, c + Vector((0.12, sy * 0.15, -0.12)), segs=10, rings=6), BLACK, "neck")
        p.add(sphere(0.06, c + Vector((0.18, sy * 0.27, -0.0)), segs=6, rings=4), WHITE, "neck")
        p.add(sphere(1, head + Vector((0.65, sy * 0.55, -0.55)), (0.25, 0.08, 0.15), segs=8, rings=5), BLUSH, "neck")
    p.add(tube([head + Vector((1.15, -0.35, -0.6)), head + Vector((1.25, 0, -0.68)), head + Vector((1.15, 0.35, -0.6))], [0.06] * 3, 6), BLACK, "neck")
    # Long whip tail
    tpts = curve(lambda t: Vector((1.8 * math.sin(t * 2.4), -3.6 - 9 * t, 4.6 - 3.6 * t ** 1.3)), 10)
    p.add(tube(tpts, [1.6 - 1.45 * i / 9 for i in range(10)], 12, cap_start=False), skin, "tail")
    for x, y, z in ((1.3, -1.5, 6.6), (-1.1, 0.6, 6.9), (0.7, 1.8, 6.8), (-1.6, -2.0, 6.0), (1.9, 0.9, 5.9)):
        p.add(sphere(1, (x, y, z), (0.6, 0.7, 0.25), (0, x * 0.3, 0), 8, 5), "#d8f0a0")


def triceratops():
    p = prop("triceratops")
    skin = "tint"
    frill_col = "#ff7a59"
    p.part("body").part("head", (0, 2.6, 2.9)).part("tail", (0, -2.6, 2.6))
    p.add(sphere(1, (0, 0, 2.7), (2.0, 3.1, 1.75), segs=16, rings=10), skin)
    p.add(sphere(1, (0, 0.4, 2.0), (1.6, 2.4, 1.05), segs=12, rings=8), CREAM)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.add(cyl(0.6, 0.55, 2.0, (sx * 1.3, sy * 1.7, 0), segs=10), skin)
            p.add(sphere(1, (sx * 1.3, sy * 1.7 + 0.15, 0.2), (0.7, 0.75, 0.3), segs=10, rings=6), skin)
    # Bumps along the back
    for i in range(5):
        y = -1.6 + i * 0.8
        p.add(sphere(1, (0, y, 4.35 - abs(y - 0.2) * 0.12), (0.35, 0.3, 0.3), segs=8, rings=5), frill_col)
    # Head: round face, beak, big frill with knobs, three horns.
    p.add(sphere(1, (0, 3.6, 3.0), (1.35, 1.45, 1.2), segs=14, rings=10), skin, "head")
    p.add(sphere(1, (0, 4.7, 2.65), (0.85, 0.9, 0.8), segs=12, rings=8), skin, "head")
    p.add(cyl(0.6, 0.0, 0.9, (0, 5.35, 2.45), (-math.pi / 2 - 0.5, 0, 0), 10), "#f2c24a", "head")
    frill = lathe([(0.0, 0.0), (2.4, 0.0), (2.5, 0.25), (0.0, 0.32)], 18)
    p.add(xf(frill, (0, 2.45, 4.5), (-1.15, 0, 0)), frill_col, "head")
    for k in range(11):
        a = (k / 10 - 0.5) * math.pi * 1.25
        c = Vector((math.sin(a) * 2.45, -math.cos(a) * 2.45, 0.2))
        c.rotate(Euler((-1.15, 0, 0)))
        p.add(sphere(0.3, Vector((0, 2.45, 4.5)) + c + Vector((0, 0.05, 0)), segs=8, rings=5), CREAM, "head")
    for sx in (-1, 1):
        p.add(cyl(0.28, 0.02, 1.9, (sx * 0.55, 3.9, 3.9), (-1.0, 0, -sx * 0.25), 8), CREAM, "head")
    p.add(cyl(0.22, 0.02, 0.8, (0, 5.15, 3.15), (-0.5, 0, 0), 8), CREAM, "head")
    for sx in (-1, 1):
        c = Vector((sx * 0.95, 4.0, 3.45))
        p.add(sphere(0.36, c, segs=12, rings=8), WHITE, "head")
        p.add(sphere(0.21, c + Vector((sx * 0.13, 0.22, 0.02)), segs=10, rings=6), BLACK, "head")
        p.add(sphere(0.07, c + Vector((sx * 0.2, 0.33, 0.12)), segs=6, rings=4), WHITE, "head")
        p.add(sphere(1, (sx * 0.9, 4.75, 2.55), (0.08, 0.3, 0.2), segs=8, rings=5), BLUSH, "head")
    tpts = curve(lambda t: Vector((0.3 * math.sin(t * 3), -2.4 - 3.8 * t, 2.7 - 1.6 * t * t)), 6)
    p.add(tube(tpts, [1.05, 0.85, 0.65, 0.45, 0.28, 0.12], 10, cap_start=False), skin, "tail")


def ptero():
    p = prop("ptero")
    skin, membrane = "tint", "#ffc79a"
    p.part("body").part("wing_l", (-0.45, 0.2, 0.1)).part("wing_r", (0.45, 0.2, 0.1))
    p.add(sphere(1, (0, 0, 0), (0.55, 1.3, 0.55), segs=12, rings=8), skin)
    p.add(sphere(1, (0, 0.2, -0.2), (0.4, 0.9, 0.35), segs=10, rings=6), CREAM)
    p.add(sphere(1, (0, 1.6, 0.35), (0.55, 0.65, 0.5), segs=12, rings=8), skin)
    p.add(cyl(0.3, 0.0, 1.5, (0, 2.0, 0.25), (-math.pi / 2 + 0.15, 0, 0), 8), "#f2c24a")  # beak
    p.add(cyl(0.22, 0.0, 1.3, (0, 1.4, 0.6), (math.pi / 2 + 0.5, 0, 0), 6), "#ff7a59")  # crest
    for sx in (-1, 1):
        c = Vector((sx * 0.38, 1.85, 0.55))
        p.add(sphere(0.2, c, segs=10, rings=6), WHITE)
        p.add(sphere(0.12, c + Vector((sx * 0.08, 0.1, 0.02)), segs=8, rings=5), BLACK)
        p.add(tube([(sx * 0.25, -0.6, -0.4), (sx * 0.3, -1.2, -0.7)], [0.1, 0.08], 6), skin)
    p.add(tube([(0, -1.2, 0), (0, -2.2, 0.1)], [0.25, 0.05], 8, cap_start=False), skin)
    # Wings: a bony leading edge and a membrane, spread along ±X.
    for side, part in ((1, "wing_r"), (-1, "wing_l")):
        outline = [(0.0, 0.5), (2.2, 0.75), (4.6, 0.3), (6.2, -0.5), (4.2, -0.4), (2.6, -1.1), (1.0, -1.0), (0.0, -0.8)]
        bm = prism([(x, y) for x, y in outline], 0.1, rot=(math.pi / 2, 0, 0))  # XZ outline -> XY plane
        xf(bm, (side * 0.45, 0.2, 0.1), (0, 0, 0), (side, 1, 1))
        if side < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        p.add(bm, membrane, part, smooth=False)
        edge = [Vector((side * (0.45 + x), 0.2 + y, 0.12 + 0.15 * math.sin(x / 6.2 * math.pi))) for x, y in ((0, 0.5), (2.2, 0.75), (4.6, 0.3), (6.2, -0.5))]
        p.add(tube(edge, [0.16, 0.13, 0.1, 0.05], 6), skin, part)


def nest():
    p = prop("nest")
    p.part("body").part("baby", (0, 0, 0.55))
    p.add(jitter(torus(1.6, 0.5, (0, 0, 0.3), segs=18, rsegs=6), 0.25, 3), "#8a5a2b", smooth=False)
    p.add(cyl(1.4, 1.4, 0.2, (0, 0, 0.05), segs=14), "#c99a4a", smooth=False)
    for k in range(10):  # straw bits
        a = k / 10 * math.tau
        p.add(cube((0.08, 0.9, 0.08), (math.cos(a) * 1.75, math.sin(a) * 1.75, 0.65), (0.3, 0.2, a)), "#e0b860", smooth=False)
    egg_profile = [(0.0, 0.0), (0.55, 0.15), (0.78, 0.55), (0.8, 0.95), (0.68, 1.4), (0.42, 1.75), (0.0, 1.9)]
    for (x, y, rot, col, spot) in ((-0.65, -0.5, 0.15, "#fff3d6", "#9bd36a"), (0.75, -0.35, -0.2, "#d9f2ff", "#ff9ec4")):
        p.add(lathe(egg_profile, 14, (x, y, 0.15), (rot, -rot, 0)), col)
        for k in range(5):
            a = k * 1.3 + x
            z = 0.5 + (k % 3) * 0.4
            r = 0.78 if z < 1.3 else 0.62
            p.add(sphere(1, (x + math.cos(a) * r, y + math.sin(a) * r, 0.15 + z), (0.16, 0.16, 0.16), segs=6, rings=4), spot)
    # The hatching egg: a cracked bottom half with a zigzag rim; the baby (with a shell hat) pops out.
    rim = []
    for k in range(16):
        a = k / 16 * math.tau
        rim.append((a, 0.95 + (0.18 if k % 2 else -0.12)))
    bm = bmesh.new()
    rings = []
    for r, z in egg_profile[:4]:
        rings.append([bm.verts.new((math.cos(a) * r, math.sin(a) * r, z if z < 0.9 else h)) for a, h in rim])
    for i in range(len(rings) - 1):
        for k in range(16):
            kk = (k + 1) % 16
            bm.faces.new((rings[i][k], rings[i][kk], rings[i + 1][kk], rings[i + 1][k]))
    inner = [bm.verts.new(v.co * 0.9 + Vector((0, 0, 0.06))) for v in rings[-1]]
    for k in range(16):
        kk = (k + 1) % 16
        bm.faces.new((rings[-1][k], rings[-1][kk], inner[kk], inner[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    p.add(xf(bm, (0.05, 0.55, 0.15)), "#ffe0ef", smooth=False)
    # Baby dino (at the pivot, it rises up out of the shell)
    b = Vector((0.05, 0.55, 0.55))
    p.add(tube([b, b + Vector((0, 0.1, 0.7))], [0.42, 0.38], 10, cap_start=True, cap_end=False), "#8fd16a", "baby")
    p.add(sphere(1, b + Vector((0, 0.25, 1.15)), (0.55, 0.6, 0.5), segs=12, rings=8), "#8fd16a", "baby")
    for sx in (-1, 1):
        c = b + Vector((sx * 0.27, 0.62, 1.3))
        p.add(sphere(0.2, c, segs=10, rings=6), WHITE, "baby")
        p.add(sphere(0.12, c + Vector((sx * 0.03, 0.12, 0.02)), segs=8, rings=5), BLACK, "baby")
        p.add(sphere(1, b + Vector((sx * 0.38, 0.7, 1.0)), (0.12, 0.05, 0.08), segs=6, rings=4), BLUSH, "baby")
    hat = lathe([(0.0, 0.0), (0.55, 0.0), (0.5, 0.25), (0.32, 0.45), (0.0, 0.52)], 12)
    p.add(xf(hat, b + Vector((0.05, 0.15, 1.5)), (0.25, 0.3, 0)), "#ffe0ef", "baby", smooth=False)


def volcano():
    p = prop("volcano")
    prof = [(172, -3), (160, 14), (140, 46), (112, 90), (82, 132), (56, 166), (42, 186), (36, 191), (30, 186), (24, 178)]
    p.add(lathe(prof, 22, jitter=0.06, seed=4, cap_top=False), "#7a4f3a", smooth=False)
    p.add(lathe([(178, -3), (168, 10), (150, 30), (138, 40)], 22, jitter=0.05, seed=7, cap_top=False), "#4f8a3a", smooth=False)
    p.add(cyl(26, 26, 1, (0, 0, 180), segs=16), "glow:#ffb02e", smooth=False)
    # Lava rivers running down from the rim.
    for k, a in enumerate((0.5, 1.6, 2.5, 3.6, 4.6, 5.6)):
        pts, radii = [], []
        for z in range(188, 70 + k * 12, -8):
            # radius of the slope at height z, by interpolating the profile
            for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
                if z0 <= z <= z1:
                    r = r0 + (r1 - r0) * (z - z0) / (z1 - z0)
                    break
            wob = a + math.sin(z * 0.05 + k) * 0.06
            pts.append((math.cos(wob) * (r + 0.6), math.sin(wob) * (r + 0.6), z))
            radii.append(3.2 + (188 - z) * 0.02)
        p.add(tube(pts[::2], radii[::2], 5, squash=(1.0, 0.35)), "glow:#ff5a1f", smooth=True)
    for k in range(12):
        a = k / 12 * math.tau + 0.2
        r = 150 + (k % 3) * 12
        p.add(ico(9 + (k % 4) * 3, (math.cos(a) * r, math.sin(a) * r, 16 - (k % 3) * 5), subd=0, jitter=0.35, seed=k), "#5b3a2c", smooth=False)


def fern():
    p = prop("fern")
    for k in range(7):
        a = k / 7 * math.tau + 0.3
        length = 3.2 + (k % 3) * 0.5
        bm = leaf(length, 1.2, droop=0.5, segs=8, lobes=7, fold=0.25)
        xf(bm, (0, 0, 0.35), (0, -0.55 - (k % 2) * 0.2, a))
        p.add(bm, "leafy:" + ("#3f9a3a" if k % 2 else "#58b844"), smooth=False)
    p.add(cyl(0.35, 0.15, 0.6, segs=7), "#6b4f33")
    # Two curled fiddleheads
    for sx in (-1, 1):
        pts = curve(lambda t: Vector((sx * (0.25 + 0.35 * math.sin(t * 4)), 0.1, 0.4 + 1.2 * t - 0.3 * max(0, t - 0.6))), 5)
        p.add(tube(pts, [0.09, 0.08, 0.07, 0.07, 0.12], 6), "#7fd04a")


def tree_jungle():
    p = prop("tree_jungle")
    p.add(tube([(0, 0, 0), (0.15, 0.1, 2.5), (-0.1, 0.0, 5.0), (0.1, 0.1, 6.3)], [0.42, 0.3, 0.26, 0.24], 7, cap_start=False), "#7b5a3a", smooth=False)
    for i, (x, y, z, r, c) in enumerate(((0, 0, 7.2, 2.2, "#2f7a2a"), (1.4, 0.6, 6.6, 1.6, "#3f8f2f"), (-1.3, -0.5, 6.7, 1.7, "#3f8f2f"), (0.2, -1.2, 7.8, 1.5, "#4fa83a"), (-0.3, 1.1, 8.0, 1.4, "#4fa83a"))):
        p.add(ico(r, (x, y, z), (1, 1, 0.85), subd=1, jitter=0.25, seed=i), c, smooth=False)


def tree_birch():
    p = prop("tree_birch")
    p.add(tube([(0, 0, 0), (0.1, 0, 3), (-0.05, 0.05, 6.5)], [0.24, 0.2, 0.14], 7, cap_start=False), "#efebe2", smooth=False)
    for k in range(9):
        z = 0.6 + k * 0.62
        a = k * 2.1
        p.add(cube((0.18, 0.05, 0.07), (math.cos(a) * 0.21, math.sin(a) * 0.21, z), (0, 0, a + math.pi / 2)), "#2a2a2a", smooth=False)
    for i, (x, y, z, r, c) in enumerate(((0, 0, 6.6, 1.6, "#7fbf4a"), (0.6, 0.4, 5.4, 1.3, "#93cf55"), (-0.7, -0.3, 5.6, 1.25, "#6fae3e"), (0.1, -0.2, 7.8, 1.1, "#93cf55"))):
        p.add(ico(r, (x, y, z), (1, 1, 1.25), subd=1, jitter=0.25, seed=10 + i), c, smooth=False)


def tree_maple():
    p = prop("tree_maple")
    p.add(tube([(0, 0, 0), (0.1, 0.1, 2.2), (0.0, 0.0, 3.6)], [0.38, 0.3, 0.25], 7, cap_start=False), "#6b4a33", smooth=False)
    for sx in (-1, 1):
        p.add(tube([(0, 0, 2.6), (sx * 1.2, 0.2, 3.9)], [0.18, 0.12], 6), "#6b4a33", smooth=False)
    blobs = ((0, 0, 5.3, 2.4, "#d9442b"), (1.6, 0.5, 4.6, 1.6, "#f0a020"), (-1.6, -0.4, 4.7, 1.7, "#e8682a"),
             (0.3, -1.4, 5.0, 1.5, "#f0a020"), (-0.4, 1.4, 5.2, 1.5, "#c7362a"), (0.2, 0.1, 6.7, 1.5, "#e8682a"))
    for i, (x, y, z, r, c) in enumerate(blobs):
        p.add(ico(r, (x, y, z), (1, 1, 0.85), subd=1, jitter=0.22, seed=20 + i), c, smooth=False)
    for k in range(7):  # fallen leaves
        a = k * 0.9
        p.add(cyl(0.35, 0.35, 0.03, (math.cos(a) * (1 + k * 0.25), math.sin(a) * (1 + k * 0.25), 0.02), segs=5), ("#f0a020", "#d9442b", "#e8682a")[k % 3], smooth=False)


def tree_round():
    """A rounder, friendlier jungle tree, used for the far-away forests (cheap)."""
    p = prop("tree_round")
    p.add(cyl(0.35, 0.22, 4.5, segs=6), "#7b5a3a", smooth=False)
    p.add(ico(2.4, (0, 0, 5.6), (1, 1, 1.1), subd=1, jitter=0.2, seed=31), "#3f8f2f", smooth=False)
    p.add(ico(1.6, (0.8, -0.6, 7.0), subd=1, jitter=0.2, seed=32), "#4fa83a", smooth=False)


# --- Ubud ------------------------------------------------------------------------------------------

STONE = "#9a9286"
DARK_STONE = "#5c564e"
THATCH = "#2e2a26"
GOLD = "#e0b040"


def shrine():
    """A pelinggih: carved stone plinth, a little red-doored house and a black thatched roof, with offerings."""
    p = prop("shrine")
    p.add(cube((1.6, 1.6, 0.5), (0, 0, 0.25), bevel=0.05), DARK_STONE, smooth=False)
    p.add(cube((1.25, 1.25, 1.0), (0, 0, 1.0), bevel=0.05), "#c9b08a", smooth=False)
    p.add(cube((1.4, 1.4, 0.18), (0, 0, 1.5), bevel=0.03), GOLD, smooth=False)
    p.add(cube((1.05, 1.05, 0.85), (0, 0, 2.0), bevel=0.04), "#a0603a", smooth=False)
    p.add(cube((0.55, 0.06, 0.6), (0, 0.53, 1.98)), "#c0392b", smooth=False)
    p.add(cube((0.06, 0.07, 0.6), (0, 0.55, 1.98)), GOLD, smooth=False)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.add(cyl(0.06, 0.06, 0.5, (sx * 0.5, sy * 0.5, 2.4), segs=6), "#5a3a24", smooth=False)
    p.add(frustum((0.95, 0.95), (0.18, 0.18), 0.75, (0, 0, 2.85)), THATCH, smooth=False)
    p.add(frustum((0.55, 0.55), (0.05, 0.05), 0.6, (0, 0, 3.35)), THATCH, smooth=False)
    p.add(cyl(0.07, 0.0, 0.4, (0, 0, 3.9), segs=6), GOLD, smooth=False)
    # Yellow-and-white cloth wrap and a canang offering on the step.
    p.add(cube((1.3, 1.3, 0.22), (0, 0, 1.15)), "#f2c84b", smooth=False)
    p.add(cube((1.31, 1.31, 0.08), (0, 0, 1.3)), WHITE, smooth=False)
    p.add(cube((0.32, 0.32, 0.06), (0.35, 0.85, 0.53)), "#7fbf4a", smooth=False)
    for k, c in enumerate(("#ff5d8f", "#ffd23f", WHITE, "#ff8c42")):
        p.add(sphere(0.06, (0.27 + (k % 2) * 0.16, 0.77 + (k // 2) * 0.16, 0.6), segs=6, rings=4), c)


def tedung():
    """A ceremonial umbrella (tedung)."""
    p = prop("tedung")
    p.add(cyl(0.05, 0.05, 3.2, segs=6), "#7a5634", smooth=False)
    p.add(lathe([(0.0, 3.6), (0.3, 3.5), (1.0, 3.05), (1.1, 2.95)], 12, cap_bottom=False, cap_top=False), "#f2c230", smooth=False)
    p.add(lathe([(1.1, 2.95), (1.12, 2.7), (1.08, 2.7)], 12, cap_bottom=False, cap_top=False), WHITE, smooth=False)
    p.add(lathe([(1.08, 2.95), (0.0, 3.3)], 12, cap_bottom=False, cap_top=False), "#d9a02a", smooth=False)
    p.add(cyl(0.06, 0.0, 0.35, (0, 0, 3.58), segs=6), GOLD, smooth=False)


def meru():
    """A tall pagoda-like meru tower with eleven black thatched roofs."""
    p = prop("meru")
    p.add(cube((9, 9, 1.4), (0, 0, 0.7), bevel=0.1), DARK_STONE, smooth=False)
    for s in range(4):
        p.add(cube((3.2, 1.0, 0.35), (0, 5.0 + s * 0.6, 1.4 - (s + 1) * 0.35)), DARK_STONE, smooth=False)
    p.add(cube((6, 6, 2.2), (0, 0, 2.5), bevel=0.08), "#c08a5a", smooth=False)
    p.add(cube((6.3, 6.3, 0.35), (0, 0, 3.7)), GOLD, smooth=False)
    p.add(cube((4.2, 4.2, 2.6), (0, 0, 5.1), bevel=0.06), "#a8503a", smooth=False)
    p.add(cube((1.4, 0.1, 2.0), (0, 2.12, 5.0)), "#c0392b", smooth=False)
    p.add(cube((1.6, 0.12, 0.25), (0, 2.14, 6.1)), GOLD, smooth=False)
    z = 6.4
    size = 4.6
    for k in range(9):
        p.add(frustum((size, size), (size * 0.55, size * 0.55), 0.9, (0, 0, z)), THATCH, smooth=False)
        p.add(cube((size * 0.62, size * 0.62, 0.55), (0, 0, z + 1.15)), "#6b4a2a", smooth=False)
        z += 1.42
        size *= 0.86
    p.add(frustum((size, size), (0.1, 0.1), 1.6, (0, 0, z)), THATCH, smooth=False)
    p.add(cyl(0.25, 0.0, 1.3, (0, 0, z + 1.4), segs=8), GOLD, smooth=False)
    p.add(sphere(0.3, (0, 0, z + 1.5), segs=8, rings=6), GOLD)


def monkey():
    p = prop("monkey")
    fur, light, face = "#8a7a66", "#c9b8a0", "#f0b8a0"
    p.add(sphere(1, (0, -0.02, 0.38), (0.27, 0.24, 0.34), segs=12, rings=8), fur)
    p.add(sphere(1, (0, 0.1, 0.33), (0.2, 0.16, 0.24), segs=10, rings=6), light)
    p.add(sphere(0.25, (0, 0.05, 0.85), segs=14, rings=10), fur)
    p.add(sphere(1, (0, 0.21, 0.82), (0.18, 0.1, 0.16), segs=12, rings=8), face)
    p.add(sphere(1, (0, 0.03, 1.07), (0.12, 0.1, 0.07), segs=8, rings=5), "#a8957c")  # tuft
    for sx in (-1, 1):
        p.add(sphere(1, (sx * 0.25, 0.04, 0.88), (0.06, 0.05, 0.08), segs=8, rings=5), face)
        p.add(sphere(0.065, (sx * 0.075, 0.27, 0.88), segs=8, rings=5), BLACK)
        p.add(sphere(0.022, (sx * 0.085, 0.325, 0.905), segs=4, rings=3), WHITE)
        p.add(tube([(sx * 0.2, 0.05, 0.55), (sx * 0.22, 0.2, 0.3), (sx * 0.14, 0.27, 0.05)], [0.07, 0.06, 0.06], 6), fur)
        p.add(sphere(1, (sx * 0.17, 0.12, 0.12), (0.11, 0.2, 0.11), segs=8, rings=5), fur)
    p.add(tube(curve(lambda t: Vector((0.25 * math.sin(t * 3), -0.2 - 0.45 * t, 0.15 + 0.9 * t * t)), 6), [0.05, 0.05, 0.045, 0.04, 0.04, 0.04], 6), fur)


def hut():
    """A bale bengong: a little rice-field hut on stilts with a thatched roof."""
    p = prop("hut")
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.add(cyl(0.1, 0.1, 2.6, (sx * 1.1, sy * 1.1, 0), segs=6), "#6b4a2a", smooth=False)
    p.add(cube((2.6, 2.6, 0.18), (0, 0, 0.8)), "#a07850", smooth=False)
    p.add(frustum((1.9, 1.9), (0.15, 0.15), 1.6, (0, 0, 2.5)), "#c79a4a", smooth=False)
    p.add(frustum((1.95, 1.95), (1.85, 1.85), 0.12, (0, 0, 2.42)), "#a9803a", smooth=False)


def banana():
    p = prop("banana")
    p.add(tube([(0, 0, 0), (0.05, 0, 1.6), (0, 0.05, 3.0)], [0.28, 0.24, 0.2], 7, cap_start=False), "#7a8a3a", smooth=False)
    for k in range(6):
        a = k / 6 * math.tau
        p.add(leaf(2.6, 0.9, droop=0.45, segs=5, loc=(0, 0, 2.9), rot=(0, -0.6 - (k % 2) * 0.25, a), fold=0.1), "leafy:" + ("#5fae3a" if k % 2 else "#73c24a"), smooth=False)
    for k in range(5):
        p.add(sphere(1, (0.25, 0.0, 2.35 - k * 0.12), (0.08, 0.2, 0.06), (0, 0, k * 1.2), 6, 4), "#b8d040")


# --- Helsinki ---------------------------------------------------------------------------------------


def hel_roof():
    """A mansard roof with dormers and chimneys, on a 1 x 1 footprint (the game scales x/y to the building)."""
    p = prop("hel_roof")
    p.add(frustum((0.5, 0.5), (0.42, 0.42), 3.0), "tint", smooth=False)
    p.add(frustum((0.42, 0.42), (0.2, 0.2), 1.2, (0, 0, 3.0)), "tint", smooth=False)
    for k in range(4):
        rot = k * math.pi / 2
        for x in (-0.22, 0.22):
            d = Vector((x, 0.465, 0))
            d.rotate(Euler((0, 0, rot)))
            p.add(cube((0.12, 0.06, 1.5), (d.x, d.y, 1.4), (0, 0, rot)), "#f4f1ea", smooth=False)
            dd = Vector((x, 0.5, 0))
            dd.rotate(Euler((0, 0, rot)))
            p.add(cube((0.07, 0.01, 0.9), (dd.x, dd.y, 1.35), (0, 0, rot)), "gloss:#2c3e55", smooth=False)
            p.add(prism([(-0.075, 0), (0.075, 0), (0, 0.55)], 0.08, (d.x, d.y, 2.15), (0, 0, rot)), "#f4f1ea", smooth=False)
    for x, y in ((-0.25, 0.1), (0.28, -0.12)):
        p.add(cube((0.07, 0.07, 2.0), (x, y, 4.0)), "#a8503a", smooth=False)
        p.add(cube((0.09, 0.09, 0.2), (x, y, 5.05)), "#5b6066", smooth=False)


def hel_gable():
    """A steep gable roof (harbour-house style) on a 1 x 1 footprint, ridge along X, with a little dormer."""
    p = prop("hel_gable")
    p.add(prism([(-0.53, 0), (0.53, 0), (0, 5.5)], 1.04, rot=(0, 0, math.pi / 2)), "tint", smooth=False)
    for sx in (-1, 1):  # white gable ends
        p.add(prism([(-0.5, 0), (0.5, 0), (0, 5.2)], 0.02, (sx * 0.505, 0, 0), (0, 0, math.pi / 2)), "#f4f1ea", smooth=False)
        p.add(cube((0.012, 0.12, 1.1), (sx * 0.52, 0, 1.6)), "gloss:#2c3e55", smooth=False)
    p.add(cube((0.07, 0.07, 1.8), (0.2, 0.1, 4.6)), "#a8503a", smooth=False)


def lamp():
    p = prop("lamp")
    green = "#2b3a2f"
    p.add(cyl(0.22, 0.16, 0.5, segs=8), green, smooth=False)
    p.add(cyl(0.08, 0.07, 4.6, (0, 0, 0.5), segs=8), green)
    p.add(tube([(0, 0, 4.8), (0, 0.4, 5.25), (0, 0.9, 5.2)], [0.05, 0.05, 0.05], 6), green)
    p.add(frustum((0.16, 0.16), (0.24, 0.24), 0.45, (0, 0.9, 4.65)), "glow:#fff2b0", smooth=False)
    p.add(frustum((0.28, 0.28), (0.04, 0.04), 0.25, (0, 0.9, 5.1)), green, smooth=False)


def market():
    """A cluster of Kauppatori market tents: orange roofs, striped awnings, tables of berries and flowers."""
    p = prop("market")
    goods = ("#d9203a", "#2d6fd8", "#f4c430", "#ff7aa8", "#6fbf3a", "#ff8c1a")
    for i, (x, y) in enumerate(((-4.5, -4.5), (4.5, -4.5), (-4.5, 4.5), (4.5, 4.5))):
        for sx in (-1, 1):
            for sy in (-1, 1):
                p.add(cyl(0.06, 0.06, 2.4, (x + sx * 1.7, y + sy * 1.7, 0), segs=5), WHITE, smooth=False)
        p.add(frustum((2.0, 2.0), (0.1, 0.1), 1.4, (x, y, 2.4)), "#f07a2a", smooth=False)
        for k in range(4):
            rot = k * math.pi / 2
            d = Vector((0, 2.02, 0))
            d.rotate(Euler((0, 0, rot)))
            for s in range(3):
                off = Vector((-1.36 + s * 1.36, 0, 0))
                off.rotate(Euler((0, 0, rot)))
                p.add(cube((1.36, 0.04, 0.35), (x + d.x + off.x, y + d.y + off.y, 2.25), (0, 0, rot)), WHITE if s % 2 else "#f07a2a", smooth=False)
        p.add(cube((3.0, 1.2, 0.9), (x, y + 1.0, 0.45)), "#a07850", smooth=False)
        for k in range(4):
            p.add(cube((0.6, 0.5, 0.22), (x - 1.0 + (k % 2) * 1.4 + (k // 2) * 0.3, y + 0.75 + (k // 2) * 0.5, 1.0)), goods[(i + k) % len(goods)], smooth=False)


def ferry():
    """The Suomenlinna ferry: a chubby blue hull, white decks, a yellow funnel and a flag."""
    p = prop("ferry")
    hull = curve(lambda t: Vector((0, -18 + 36 * t, 2.4)), 9)
    p.add(tube(hull, [2.6, 4.2, 4.6, 4.7, 4.7, 4.6, 4.3, 3.4, 1.6], 14, squash=(1.0, 0.62)), "#1f5fa8")
    p.add(cube((8.6, 30, 0.6), (0, -0.5, 4.2), bevel=0.2), "#d8343f", smooth=False)
    p.add(cube((7.4, 24, 3.0), (0, -1.5, 5.9), bevel=0.4), WHITE, smooth=False)
    for sx in (-1, 1):
        p.add(cube((0.1, 21, 1.2), (sx * 3.72, -1.5, 6.3)), "gloss:#1c2a36", smooth=False)
    p.add(cube((5.6, 12, 2.4), (0, -3, 8.6), bevel=0.35), WHITE, smooth=False)
    p.add(cube((5.7, 2.2, 1.0), (0, 2.6, 9.0)), "gloss:#1c2a36", smooth=False)
    p.add(cyl(1.1, 1.0, 3.6, (0, -6, 9.6), segs=12), "#f4c430")
    p.add(cyl(1.02, 1.02, 0.7, (0, -6, 13.2), segs=12), BLACK)
    p.add(cyl(0.08, 0.08, 4.5, (0, 8, 7.4), segs=6), WHITE, smooth=False)
    p.add(cube((0.06, 1.8, 1.1), (0, 7.05, 11.2)), WHITE, smooth=False)
    p.add(cube((0.07, 1.8, 0.3), (0, 7.05, 11.2)), "#1f5fa8", smooth=False)
    p.add(cube((0.07, 0.3, 1.1), (0, 7.45, 11.2)), "#1f5fa8", smooth=False)
    for k in range(5):  # life rings
        p.add(torus(0.4, 0.12, (4.62, -10 + k * 4.5, 4.6), (0, math.pi / 2, 0), 10, 5), "#ff6a00")


def skywheel():
    p = prop("skywheel")
    hub = Vector((0, 0, 24))
    p.part("body").part("wheel", hub)
    for sy in (-1, 1):
        for sx in (-1, 1):
            p.add(tube([(sx * 9, sy * 2.2, 0), (0, sy * 1.4, 24)], [0.55, 0.4], 6, cap_start=False), "#cfd3d8")
    p.add(cube((22, 6, 1.5), (0, 0, 0.75)), "#5b6066", smooth=False)
    p.add(torus(18, 0.45, hub, (math.pi / 2, 0, 0), 32, 5), "#f4f4f4", "wheel")
    p.add(torus(16.8, 0.25, hub, (math.pi / 2, 0, 0), 32, 4), "#f4f4f4", "wheel")
    p.add(cyl(1.2, 1.2, 3.2, hub + Vector((0, -1.6, 0)), (-math.pi / 2, 0, 0), 12), "#cfd3d8", "wheel")
    for k in range(16):
        a = k / 16 * math.tau
        d = Vector((math.cos(a), 0, math.sin(a)))
        p.add(tube([hub + d * 1.0, hub + d * 17.8], [0.12, 0.1], 4, cap_start=False, cap_end=False), "#e8e8e8", "wheel", smooth=False)
        c = hub + d * 18.9
        p.add(cube((2.2, 2.0, 2.4), c), "#1a8f5a" if k % 2 else WHITE, "wheel", smooth=False)
        p.add(cube((2.25, 1.6, 1.0), c + Vector((0, 0, 0.3))), "gloss:#1c2a36", "wheel", smooth=False)


def sailboat():
    p = prop("sailboat")
    p.add(tube(curve(lambda t: Vector((0, -3 + 6 * t, 0.4)), 5), [0.7, 1.2, 1.25, 1.0, 0.3], 10, squash=(1.0, 0.6)), WHITE)
    p.add(cube((1.6, 3.6, 0.1), (0, -0.3, 0.92)), "#a07850", smooth=False)
    p.add(cyl(0.06, 0.05, 7, (0, 0.6, 0.9), segs=6), "#cfcfcf", smooth=False)
    p.add(prism([(0, 0), (0, 6.2), (2.6, 0)], 0.04, (0, 0.5, 1.4), (0, 0, -math.pi / 2)), "#f4f1ea", smooth=False)
    p.add(prism([(0, 0), (0, 5.2), (-1.6, 0)], 0.04, (0, 0.7, 1.5), (0, 0, -math.pi / 2)), "#e63946", smooth=False)


# --- Montreal ---------------------------------------------------------------------------------------


def triplex_trim():
    """
    The street side of a Montreal triplex, laid against a brick box: a fancy
    cornice with brackets, a top-floor balcony and two front doors. Front face
    at y = 0 facing +Y, 12 m wide and 10.5 m high (the game scales it to fit).
    'tint' (the cornice and doors) is painted per house.
    """
    p = prop("triplex_trim")
    p.add(cube((12.3, 0.7, 0.9), (0, 0.3, 10.15)), "tint", smooth=False)
    p.add(cube((12.5, 0.9, 0.25), (0, 0.4, 10.7)), "tint", smooth=False)
    for k in range(9):
        p.add(cube((0.25, 0.6, 0.6), (-5.6 + k * 1.4, 0.4, 9.55)), "#f2efe6", smooth=False)
    # Top-floor balcony: slab, wrought-iron railing and posts.
    p.add(cube((11.4, 1.4, 0.15), (0, 0.7, 7.2)), "#7a5a3c", smooth=False)
    for k in range(29):
        p.add(cube((0.04, 0.04, 0.85), (-5.6 + k * 0.4, 1.35, 7.7)), "#2b2b2e", smooth=False)
    p.add(cube((11.4, 0.07, 0.07), (0, 1.35, 8.12)), "#2b2b2e", smooth=False)
    for sx in (-1, 1):
        p.add(cube((0.07, 1.4, 0.07), (sx * 5.7, 0.7, 8.12)), "#2b2b2e", smooth=False)
        p.add(cube((0.12, 0.12, 7.2), (sx * 5.6, 1.3, 3.6)), "#2b2b2e", smooth=False)
    # Doors with white frames and transoms, a little stoop each.
    for x in (-4.0, 4.0):
        p.add(cube((1.5, 0.12, 2.6), (x, 0.06, 1.3)), "#f2efe6", smooth=False)
        p.add(cube((1.1, 0.16, 2.2), (x, 0.08, 1.15)), "tint", smooth=False)
        p.add(cube((1.0, 0.18, 0.3), (x, 0.09, 2.45)), "gloss:#2c3e55", smooth=False)
        p.add(sphere(0.06, (x + 0.35, 0.2, 1.1), segs=6, rings=4), GOLD)
        p.add(cube((1.8, 0.9, 0.25), (x, 0.45, 0.12)), "#8e8a84", smooth=False)


def olympic():
    """Montreal's Olympic Stadium: the big shell and its leaning tower holding the roof by cables."""
    p = prop("olympic")
    concrete = "#e8e6e1"
    p.add(lathe([(92, 0), (98, 8), (96, 20), (86, 30), (66, 34), (40, 33)], 32, scale=(1, 0.78, 1), cap_bottom=False, cap_top=False), concrete, smooth=False)
    p.add(lathe([(40, 33), (0, 30)], 32, scale=(1, 0.78, 1), cap_bottom=False, cap_top=False), "#d0d6dc", smooth=False)
    for k in range(20):
        a = k / 20 * math.tau
        c = Vector((math.cos(a) * 95, math.sin(a) * 95 * 0.78, 0))
        p.add(xf(cube((4, 10, 22), (0, 0, 11)), c, (0, 0, a - math.pi / 2)), "#d0cdc6", smooth=False)
    top = Vector((52, 0, 168))
    p.add(tube([(108, 0, 0), (96, 0, 60), (78, 0, 120), top], [13, 10, 8, 6.5], 8, cap_start=False), concrete, smooth=False)
    p.add(cube((14, 16, 12), top + Vector((-2, 0, 0)), (0, 0.5, 0), bevel=1.0), "gloss:#2c3e55", smooth=False)
    p.add(cube((15, 17, 2), top + Vector((-2, 0, 7)), (0, 0.5, 0)), concrete, smooth=False)
    for k in range(7):
        a = (k / 6 - 0.5) * 1.6
        end = Vector((math.cos(a + math.pi) * 34, math.sin(a + math.pi) * 26, 33))
        p.add(tube([top + Vector((-5, 0, -2)), end], [0.6, 0.6], 4, cap_start=False, cap_end=False), "#3a3a3a", smooth=False)


def biosphere():
    """The Biosphere: a glassy geodesic ball with white struts."""
    p = prop("biosphere")
    r = 30
    glass = bmesh.new()
    bmesh.ops.create_icosphere(glass, subdivisions=2, radius=r)
    bmesh.ops.delete(glass, geom=[v for v in glass.verts if v.co.z < -0.45 * r], context="VERTS")
    edges = [(e.verts[0].co.copy(), e.verts[1].co.copy()) for e in glass.edges]
    p.add(xf(glass, (0, 0, 0.45 * r)), "gloss:#a9dcef", smooth=False)
    for a, b in edges:
        p.add(xf(cyl(0.35, 0.35, (b - a).length, segs=3, caps=False), a + Vector((0, 0, 0.45 * r)), (b - a).to_track_quat("Z", "Y").to_euler()), WHITE, smooth=False)


# --- Stunt Park --------------------------------------------------------------------------------------


def stadium():
    """
    A grandstand 30 m long facing +Y (the road): five rows of seats rising
    away from it, a striped canopy, and a cheering crowd (its own part, which
    the game bounces).
    """
    p = prop("stadium")
    p.part("body").part("crowd")
    seats = ("#e63946", "#f4c430", "#1d8fe1", "#2a9d8f", "#e63946")
    for k in range(5):
        p.add(cube((30, 2, 1 + k), (0, -k * 2, (1 + k) / 2)), "#d9d4cc", smooth=False)
        p.add(cube((29.6, 1.0, 0.35), (0, -k * 2 + 0.3, 1 + k + 0.17)), seats[k], smooth=False)
    p.add(cube((30.4, 0.3, 1.0), (0, 1.1, 0.5)), "#1d8fe1", smooth=False)
    for sx in (-1, 1):
        p.add(cube((0.5, 10, 7.5), (sx * 15.2, -4, 3.75)), "#d9d4cc", smooth=False)
    for x in (-14, -4.7, 4.7, 14):
        p.add(cyl(0.25, 0.25, 9.5, (x, -9.2, 0), segs=8), "#cfd3d8")
    for k in range(10):
        p.add(xf(cube((3.0, 11.5, 0.3)), (-13.5 + k * 3, -3.6, 9.4), (-0.2, 0, 0)), "#e63946" if k % 2 else WHITE, smooth=False)
    colours = ("#ff5d8f", "#ffd23f", "#4cc9f0", "#7bd389", "#f77f00", "#9b5de5", "#f15bb5", WHITE)
    skin = ("#f1c27d", "#c68642", "#8d5524", "#ffdbac")
    n = 0
    for k in range(5):
        for i in range(13):
            x = -13.2 + i * 2.2 + (k % 2) * 0.9
            if (i * 7 + k * 3) % 5 == 0:
                continue
            base = Vector((x, -k * 2 - 0.3, 1 + k + 0.35))
            p.add(sphere(1, base + Vector((0, 0, 0.45)), (0.38, 0.3, 0.5), segs=6, rings=4), colours[n % len(colours)], "crowd")
            p.add(sphere(0.28, base + Vector((0, 0, 1.15)), segs=6, rings=4), skin[n % len(skin)], "crowd")
            if n % 4 == 0:  # waving arms
                p.add(cube((0.16, 0.16, 0.9), base + Vector((0.42, 0.05, 1.1)), (0, 0.4, 0)), colours[n % len(colours)], "crowd", smooth=False)
            n += 1


def jumbotron():
    """A big screen on two legs. The game paints the screen (front at y=0.56, 14 x 7.6 m, centre 11 m up)."""
    p = prop("jumbotron")
    for sx in (-1, 1):
        p.add(cube((0.9, 0.9, 7.5), (sx * 5, -0.3, 3.75)), "#3a3a44", smooth=False)
        p.add(cube((1.6, 1.6, 0.4), (sx * 5, -0.3, 0.2)), "#2b2b33", smooth=False)
    p.add(cube((15.6, 1.0, 9.0), (0, 0, 11.0), bevel=0.25), "#2b2b33", smooth=False)
    p.add(cube((16.0, 1.2, 0.5), (0, 0, 15.6)), "#f4c430", smooth=False)
    p.add(cube((16.0, 1.2, 0.5), (0, 0, 6.4)), "#f4c430", smooth=False)
    for k in range(8):
        p.add(sphere(0.3, (-7 + k * 2, 0.5, 16.0), segs=8, rings=5), "glow:#fff2b0")


def loop():
    """A giant decorative loop-the-loop, red and yellow, on blue supports (not on the road)."""
    p = prop("loop")
    R, w, n = 11, 7, 28
    for k in range(n):
        a0 = k / n * math.tau
        a1 = (k + 1) / n * math.tau
        mid = (a0 + a1) / 2
        x = (mid / math.tau - 0.5) * 6  # sideways drift, like a real loop
        c = Vector((x, math.sin(mid) * R, R - math.cos(mid) * R + 0.4))
        seg = cube((w, 2 * R * math.sin(math.pi / n) + 0.1, 0.5))
        p.add(xf(seg, c, (mid, 0, 0)), "#e63946" if k % 2 else "#f4c430", smooth=False)
    for sy in (-1, 1):
        p.add(cube((w, 14, 0.5), (sy * 3, sy * 7.5, 0.25)), "#e63946", smooth=False)
        for x in (-3.5, 3.5):
            p.add(cyl(0.35, 0.35, R + 1, (x + sy * 0.0, sy * (R + 0.6), 0), segs=8), "#1d8fe1")
    p.add(cyl(0.6, 0.6, 2 * R, (0, 0, 0), segs=8), "#1d8fe1")
    p.add(sphere(1.4, (0, 0, 2 * R + 1.0), segs=12, rings=8), "#f4c430")


def tires():
    """A wall of stacked tyres, painted alternately."""
    p = prop("tires")
    for i in range(4):
        for k in range(3):
            c = (-2.1 + i * 1.4, 0, 0.22 + k * 0.42)
            p.add(torus(0.45, 0.22, c, segs=9, rsegs=5), "#2a2a2e")
            p.add(torus(0.45, 0.225, c, segs=9, rsegs=3, scale=(1, 1, 0.35)), WHITE if (i + k) % 2 else "#e63946")


def mesa():
    """A layered desert butte with a flat top, 60 m across and 60 m high (scaled by the game)."""
    p = prop("mesa")
    layers = (("#c8642f", 0, 22, 60), ("#e09060", 22, 26, 56), ("#b9552a", 26, 46, 55), ("#e8a070", 46, 50, 50), ("#c86a3a", 50, 60, 49))
    for i, (c, z0, z1, r) in enumerate(layers):
        p.add(lathe([(r + 2, z0), (r, (z0 + z1) / 2), (r - 1, z1)], 14, jitter=0.07, seed=40 + i, cap_bottom=False, cap_top=False), c, smooth=False)
    p.add(lathe([(48, 60), (30, 61), (0, 61.5)], 14, jitter=0.05, seed=50, cap_bottom=False, cap_top=False), "#b89a5a", smooth=False)
    for k in range(6):
        a = k * 1.1
        p.add(ico(5 + k % 3, (math.cos(a) * 62, math.sin(a) * 62, 2), jitter=0.4, seed=60 + k), "#a8512a", smooth=False)


def cactus():
    p = prop("cactus")
    green = "#3f8f46"
    p.add(tube([(0, 0, 0), (0, 0, 2.6), (0, 0, 4.4)], [0.48, 0.46, 0.42], 10, cap_start=False), green)
    for sx, z, h in ((-1, 1.6, 1.6), (1, 2.3, 1.3)):
        p.add(tube([(0, 0, z), (sx * 0.9, 0, z + 0.1), (sx * 1.1, 0, z + 0.7), (sx * 1.1, 0, z + 0.7 + h)], [0.3, 0.3, 0.3, 0.27], 8, cap_start=False), green)
    for k in range(12):  # little ribs/spines
        a = k / 12 * math.tau
        p.add(cube((0.04, 0.04, 3.6), (math.cos(a) * 0.46, math.sin(a) * 0.46, 2.2), (0, 0, a)), "#2f7a36", smooth=False)
    for k, c in enumerate(("#ff5d8f", "#ffd23f", "#ff5d8f")):
        a = k * 2.1
        p.add(sphere(0.16, (math.cos(a) * 0.25, math.sin(a) * 0.25, 4.75), segs=8, rings=5), c)


def balloon():
    """A hot-air balloon with eight bright gores."""
    p = prop("balloon")
    prof = [(0.4, 0.0), (2.2, 2.0), (4.6, 5.5), (5.4, 8.5), (5.0, 11.0), (3.4, 13.0), (0.0, 14.0)]
    cols = ("#e63946", "#f4c430", "#1d8fe1", WHITE)
    for g in range(8):
        a0 = g / 8 * math.tau
        p.add(lathe(prof, 3, arc=(a0, a0 + math.tau / 8)), cols[g % 4])
    p.add(cube((1.4, 1.4, 1.0), (0, 0, -2.6), bevel=0.1), "#a07850", smooth=False)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.add(tube([(sx * 0.6, sy * 0.6, -2.1), (sx * 0.4, sy * 0.4, 0.1)], [0.03, 0.03], 3, cap_start=False, cap_end=False), "#5a3a24", smooth=False)


# --- registry ---------------------------------------------------------------------------------------

SHARED = [tree_jungle, tree_round, tree_birch, tree_maple, fern, cactus]
UBUD = [shrine, tedung, meru, monkey, hut, banana]
HELSINKI = [hel_roof, hel_gable, lamp, market, ferry, skywheel, sailboat]
MONTREAL = [triplex_trim, olympic, biosphere]
DINO = [trex, longneck, triceratops, ptero, nest, volcano]
STUNT = [stadium, jumbotron, loop, tires, mesa, balloon]
ALL = SHARED + UBUD + HELSINKI + MONTREAL + DINO + STUNT
