"""
Crash Racers scenery: exports ../public/models/props.glb with one top-level node per prop.
Each prop stands on its origin and faces Blender +Y (three.js -Z). Animated props
have named part nodes whose origins are their pivots (see scenery.py).

  palm        coconut palm (Ubud)
  gate        one half of a Balinese candi bentar split gate (Ubud); the game mirrors it
  cathedral   Helsinki Cathedral: white, green domes, portico, grand stairs
  tram        Helsinki Artic tram, green and white
  staircase   Montreal outdoor curving staircase up to a balcony
  ...and the rest of the scenery in scenery.py (trees, temples, dinosaurs, stadium...).

Everything is coloured from one palette texture (kit.py), so the game draws a
whole place's Blender scenery in a handful of draw calls.

Run with:  blender --background --python props.py
Previews:  PREVIEW=/some/dir [ONLY=trex,palm] blender --background --python props.py
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import scenery  # noqa: E402
from kit import cube, cyl, leaf, prism, prop, sphere, tube  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "models", "props.glb")


# --- Palm ------------------------------------------------------------------------


def palm():
    p = prop("palm")
    height, segments = 8.0, 10
    top = Vector((0, 0, 0))
    for i in range(segments):
        t = i / segments
        seg_h = height / segments
        lean = Vector((0.9 * t * t, 0.2 * t, height * t))
        p.add(cyl(0.26 - 0.08 * t, 0.23 - 0.08 * t, seg_h * 1.02, lean, segs=8), "#8a6a48" if i % 2 else "#6b4f33")
        top = Vector((lean.x, lean.y, lean.z + seg_h))
    for k in range(9):
        a = k / 9 * math.tau
        p.add(leaf(3.6, 1.0, droop=0.45, segs=8, loc=top, rot=(0, -0.15, a), fold=0.2, lobes=6), "leafy:" + ("#3f8f2f" if k % 2 else "#4fa83a"), smooth=False)
    for k in range(3):
        a = k / 3 * math.tau
        p.add(sphere(0.18, top + Vector((math.cos(a) * 0.25, math.sin(a) * 0.25, -0.3)), segs=8, rings=6), "#6b4a2a")


# --- Candi bentar ---------------------------------------------------------------------


def gate():
    p = prop("gate")
    stone, dark, brick, gold = "#9a9286", "#55504a", "#a8503a", "#e0b040"
    # Tiers narrow as they rise; the inner (split) face is flat at x = 0.
    tiers = [(3.2, 2.4, 1.2, dark), (2.9, 2.2, 1.0, brick), (2.6, 2.0, 0.35, stone), (2.4, 1.85, 1.0, brick),
             (2.0, 1.6, 0.3, stone), (1.8, 1.4, 0.9, brick), (1.4, 1.15, 0.3, stone), (1.1, 0.9, 0.8, brick),
             (0.8, 0.7, 0.25, stone), (0.55, 0.5, 0.7, brick), (0.3, 0.3, 0.5, stone)]
    z = 0
    for i, (w, d, h, c) in enumerate(tiers):
        p.add(cube((w, d, h), (w / 2, 0, z + h / 2)), c, smooth=False)
        if c == stone and i < 9:  # flame-like corner ornaments on the stone bands
            for cx, cy in ((w - 0.12, d / 2 - 0.12), (w - 0.12, -d / 2 + 0.12)):
                p.add(cyl(0.14, 0.0, 0.5, (cx, cy, z + h), segs=6), stone, smooth=False)
        z += h
    p.add(cyl(0.12, 0.0, 0.6, (0.15, 0, z), segs=8), gold, smooth=False)
    for s in range(3):
        p.add(cube((3.2, 0.5, 0.18), (1.6, 1.4 + s * 0.5, 0.09)), dark, smooth=False)


# --- Helsinki Cathedral -------------------------------------------------------------------


def cathedral():
    p = prop("cathedral")
    white, stone, green, gold, window = "#f4f2ec", "#b9b4aa", "gloss:#3f8f6a", "gloss:#e0b84a", "gloss:#4a5a6a"
    p.add(cube((34, 34, 3), (0, 0, 1.5)), stone, smooth=False)
    for s in range(10):
        p.add(cube((16, 1.2, 0.3), (0, 17.6 + s * 1.2, 3 - (s + 1) * 0.3)), stone, smooth=False)
    p.add(cube((12, 26, 13), (0, 0, 9.5)), white, smooth=False)
    p.add(cube((26, 12, 13), (0, 0, 9.5)), white, smooth=False)
    for rot in range(4):
        m = Matrix.Rotation(rot * math.pi / 2, 3, "Z")
        for c in range(6):
            q = m @ Vector((-5 + c * 2, 14.5, 3))
            p.add(cyl(0.5, 0.5, 12, q, segs=10), white)
        p.add(cube((12.5, 2.4, 1.2), m @ Vector((0, 14.5, 15.6)), (0, 0, rot * math.pi / 2)), white, smooth=False)
        p.add(prism([(-6.4, 0), (6.4, 0), (0, 3.2)], 2.4, m @ Vector((0, 14.5, 16.2)), (0, 0, rot * math.pi / 2)), white, smooth=False)
        for wx in (-3, 3):
            p.add(cube((1.4, 0.2, 3.5), m @ Vector((wx, 13.05, 10)), (0, 0, rot * math.pi / 2)), window, smooth=False)
    p.add(cyl(7.5, 7.5, 7, (0, 0, 16), segs=24), white)
    for k in range(16):
        a = k / 16 * math.tau
        p.add(cyl(0.35, 0.35, 6.5, (math.cos(a) * 7.7, math.sin(a) * 7.7, 16.25), segs=6), white)
    p.add(kit.lathe([(7.6, 0), (7.2, 3.5), (5.6, 7), (3.2, 9), (0, 9.5)], 20, (0, 0, 23)), green)
    p.add(cyl(1.4, 1.4, 3, (0, 0, 32.3), segs=12), white)
    p.add(kit.lathe([(1.5, 0), (1.1, 1.3), (0, 1.9)], 12, (0, 0, 35.3)), green)
    p.add(cube((0.2, 0.2, 2.2), (0, 0, 38.2)), gold, smooth=False)
    p.add(cube((1.0, 0.2, 0.2), (0, 0, 38.6)), gold, smooth=False)
    for cx, cy in ((-9, -9), (9, -9), (-9, 9), (9, 9)):
        p.add(cyl(2.2, 2.2, 4, (cx, cy, 16), segs=12), white)
        p.add(kit.lathe([(2.3, 0), (2.0, 1.5), (1.2, 2.6), (0, 3.0)], 12, (cx, cy, 20)), green)
        p.add(cyl(0.45, 0.1, 1.4, (cx, cy, 22.9), segs=8), gold)


# --- Helsinki tram -----------------------------------------------------------------------------


def tram():
    p = prop("tram")
    green, white, glass, dark = "gloss:#2f8f4f", "#f2f2ee", "gloss:#1c2a36", "#222222"
    length = 26
    p.add(cube((2.5, length, 1.4), (0, 0, 1.0), bevel=0.08), green, smooth=False)
    p.add(cube((2.42, length - 1.2, 1.3), (0, 0, 2.35)), glass, smooth=False)
    p.add(cube((2.4, length - 0.6, 0.5), (0, 0, 3.2), bevel=0.12), white, smooth=False)
    for k in range(9):
        p.add(cube((2.5, 0.25, 1.3), (0, -length / 2 + 1.5 + k * 2.9, 2.35)), white, smooth=False)
    for end in (-1, 1):
        p.add(cube((2.3, 0.9, 2.6), (0, end * (length / 2 + 0.2), 1.9), bevel=0.15), white, smooth=False)
        p.add(cube((2.0, 0.2, 1.1), (0, end * (length / 2 + 0.6), 2.5)), glass, smooth=False)
        p.add(cyl(0.15, 0.15, 0.1, (0.8, end * (length / 2 + 0.62), 1.3), (math.pi / 2, 0, 0), 8), "glow:#fff4c0")
    p.add(cube((1.2, 1.2, 0.2), (0, 2, 3.55)), dark, smooth=False)
    p.add(cube((0.1, 0.1, 1.6), (0, 2.3, 4.2), (0.5, 0, 0)), dark, smooth=False)
    p.add(cube((1.6, 0.12, 0.08), (0, 2.6, 4.9)), dark, smooth=False)
    p.add(cube((2.0, length - 3, 0.4), (0, 0, 0.25)), dark, smooth=False)


# --- Montreal staircase -----------------------------------------------------------------------------


def staircase():
    p = prop("staircase")
    steel, wood = "#2b2b2e", "#7a5a3c"
    height, steps = 3.6, 15

    # Starts on the sidewalk (+Y), swoops sideways at the bottom, then climbs to the balcony (y = 0).
    def path(t):
        swoop = max(0.0, 1 - t / 0.35)
        return Vector((1.4 * swoop * swoop, 2.6 * (1 - t) + 0.5, 0.18 + t * (height - 0.18)))

    tops = {-1: [], 1: []}
    for s in range(steps):
        t = s / (steps - 1)
        q = path(t)
        nxt = path(min(1, t + 0.05))
        heading = math.atan2(nxt.x - q.x, -(nxt.y - q.y))
        p.add(cube((1.0, 0.3, 0.05), q, (0, 0, heading)), steel, smooth=False)
        for side in (-1, 1):
            post = q + Vector((math.cos(heading) * 0.5 * side, math.sin(heading) * 0.5 * side, 0))
            if s % 2 == 0:
                p.add(cyl(0.025, 0.025, 0.9, post, segs=4), steel, smooth=False)
            tops[side].append(post + Vector((0, 0, 0.9)))
    for side in (-1, 1):
        p.add(tube(tops[side], [0.03] * len(tops[side]), 4, cap_start=False, cap_end=False), steel, smooth=False)
    p.add(cube((3.4, 1.4, 0.12), (0.2, -0.2, height)), wood, smooth=False)
    for k in range(10):
        p.add(cyl(0.025, 0.025, 0.9, (-1.4 + k * 0.36, 0.48, height), segs=4), steel, smooth=False)
    p.add(cube((3.4, 0.05, 0.05), (0.2, 0.48, height + 0.9)), steel, smooth=False)
    for cx in (-1.4, 1.8):
        p.add(cyl(0.05, 0.05, height, (cx, 0.45, 0), segs=6), steel, smooth=False)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    only = [n for n in os.environ.get("ONLY", "").split(",") if n]
    for fn in [palm, gate, cathedral, tram, staircase] + scenery.ALL:
        if not only or fn.__name__ in only:
            fn()
    kit.stats()
    preview_dir = os.environ.get("PREVIEW")
    roots = kit.build_objects(os.path.join(preview_dir or bpy.app.tempdir, "palette.png"))
    if preview_dir:
        kit.preview(roots, preview_dir, 420)
    else:
        kit.export(OUT, roots)
        kit.quantize(OUT)


main()
