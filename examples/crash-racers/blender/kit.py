"""
Toy-box modelling kit for the Crash Racers scenery (props.py builds the models).

Every piece is coloured from one shared palette texture: a face's UVs point at
the centre of its colour's swatch. So a whole place's Blender scenery needs
only a few materials (matte, gloss, glow, plus a plain white 'tint' the game
recolours), and the game merges it into a few draw calls.

A Prop is a root node with one mesh per named part. A part's origin is its
pivot, so the game can bob a head or flap a wing by rotating that node.
Blender axes: +Y is the model's front (three.js -Z), +Z is up.
"""
import math
import os
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

GRID = 16  # swatches per row; 16 x 16 colours
SWATCH = 8  # pixels per swatch
KINDS = ("matte", "gloss", "glow", "tint", "leafy")  # leafy: matte, two-sided

_palette = {}  # hex -> index


def swatch(hex_color):
    """UV of the centre of a colour's swatch, registering the colour on first use."""
    h = hex_color.lower()
    if h not in _palette:
        _palette[h] = len(_palette)
        if len(_palette) > GRID * GRID:
            raise ValueError("palette full")
    i = _palette[h]
    return ((i % GRID + 0.5) / GRID, (i // GRID + 0.5) / GRID)


def parse(color):
    """'#rrggbb' (matte), 'gloss:#rrggbb', 'glow:#rrggbb' or 'tint'."""
    if color == "tint":
        return "tint", "#ffffff"
    if ":" in color:
        kind, hex_color = color.split(":")
        return kind, hex_color
    return "matte", color


# --- Pieces: each returns a fresh bmesh -------------------------------------------------


def xf(bm, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    """Scale, then rotate (XYZ Euler, radians), then move."""
    if not isinstance(scale, (tuple, list, Vector)):
        scale = (scale, scale, scale)
    m = Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm


def cube(size, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    xf(bm, scale=size)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)
    return xf(bm, loc, rot)


def sphere(r, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), segs=12, rings=8):
    bm = bmesh.new()
    # Capped detail: these are toys seen from a racing car, and the file must stay small.
    bmesh.ops.create_uvsphere(bm, u_segments=min(segs, 12), v_segments=min(rings, 8), radius=r)
    xf(bm, scale=scale)
    return xf(bm, loc, rot)


def ico(r, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), subd=1, jitter=0.0, seed=0):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subd, radius=r)
    if jitter:
        rnd = random.Random(seed)
        for v in bm.verts:
            v.co *= 1 + (rnd.random() - 0.5) * jitter
    xf(bm, scale=scale)
    return xf(bm, loc, rot)


def cyl(r1, r2, h, loc=(0, 0, 0), rot=(0, 0, 0), segs=12, caps=True):
    """A cylinder or cone standing on its base at `loc` (before rotation, the base is at z=0)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=h)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    return xf(bm, loc, rot)


def torus(R, r, loc=(0, 0, 0), rot=(0, 0, 0), segs=16, rsegs=6, scale=(1, 1, 1)):
    bm = bmesh.new()
    rings = []
    for i in range(segs):
        a = i / segs * math.tau
        c, s = math.cos(a), math.sin(a)
        ring = []
        for j in range(rsegs):
            b = j / rsegs * math.tau
            rr = R + r * math.cos(b)
            ring.append(bm.verts.new((c * rr, s * rr, r * math.sin(b))))
        rings.append(ring)
    for i in range(segs):
        a, b = rings[i], rings[(i + 1) % segs]
        for j in range(rsegs):
            k = (j + 1) % rsegs
            bm.faces.new((a[j], b[j], b[k], a[k]))
    xf(bm, scale=scale)
    return xf(bm, loc, rot)


def tube(points, radii, segs=10, cap_start=True, cap_end=True, squash=(1.0, 1.0)):
    """
    A smooth tube through `points` with a radius per point, using parallel-transport
    frames so it never twists. Ends are rounded off with little domes.
    `squash` scales the cross-section (side, up) for flattened tails and necks.
    """
    pts = [Vector(p) for p in points]
    n = len(pts)
    bm = bmesh.new()
    tangents = []
    for i in range(n):
        t = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        tangents.append(t.normalized())
    ref = Vector((1, 0, 0)) if abs(tangents[0].x) < 0.9 else Vector((0, 0, 1))
    normal = (ref - tangents[0] * ref.dot(tangents[0])).normalized()
    frames = []
    for i in range(n):
        if i:
            q = tangents[i - 1].rotation_difference(tangents[i])
            normal = q @ normal
            normal = (normal - tangents[i] * normal.dot(tangents[i])).normalized()
        frames.append((normal.copy(), tangents[i].cross(normal).normalized()))

    def ring(c, r, f):
        x, y = f
        return [bm.verts.new(c + (x * math.cos(a) * squash[0] + y * math.sin(a) * squash[1]) * r)
                for a in (k / segs * math.tau for k in range(segs))]

    rings = [ring(pts[i], radii[i], frames[i]) for i in range(n)]

    def dome(index, direction):
        c, r, f = pts[index], radii[index], frames[index]
        prev = rings[index]
        for step in (1, 2):
            a = step / 3 * math.pi / 2
            nxt = ring(c + tangents[index] * direction * math.sin(a) * r * 0.8, r * math.cos(a), f)
            for k in range(segs):
                kk = (k + 1) % segs
                quad = (prev[k], prev[kk], nxt[kk], nxt[k])
                bm.faces.new(quad if direction > 0 else tuple(reversed(quad)))
            prev = nxt
        tip = bm.verts.new(c + tangents[index] * direction * r * 0.8)
        for k in range(segs):
            kk = (k + 1) % segs
            tri = (prev[k], prev[kk], tip)
            bm.faces.new(tri if direction > 0 else tuple(reversed(tri)))

    for i in range(n - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(segs):
            kk = (k + 1) % segs
            bm.faces.new((a[k], a[kk], b[kk], b[k]))
    if cap_end:
        dome(n - 1, 1)
    if cap_start:
        dome(0, -1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def curve(fn, count):
    """Samples `fn(t)` for t in 0..1 into `count` points."""
    return [fn(i / (count - 1)) for i in range(count)]


def lathe(profile, segs=16, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), cap_bottom=True, cap_top=True, jitter=0.0, seed=0, arc=None):
    """Surface of revolution of [(radius, z), ...] from bottom to top; `arc=(a0, a1)` makes just one sector (a gore)."""
    bm = bmesh.new()
    rnd = random.Random(seed)
    rings = []
    closed = arc is None
    for r, z in profile:
        ring = []
        for k in range(segs if closed else segs + 1):
            a = k / segs * math.tau if closed else arc[0] + (arc[1] - arc[0]) * k / segs
            rr = r * (1 + (rnd.random() - 0.5) * jitter) if r > 0 else 0
            ring.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(segs):
            kk = (k + 1) % len(a)
            quad = [a[k], a[kk], b[kk], b[k]]
            if len({tuple(round(c, 6) for c in v.co) for v in quad}) >= 3:
                bm.faces.new(quad)
    if not closed:
        cap_bottom = cap_top = False
    if cap_bottom and profile[0][0] > 0:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top and profile[-1][0] > 0:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    xf(bm, scale=scale)
    return xf(bm, loc, rot)


def frustum(bottom, top, h, loc=(0, 0, 0), rot=(0, 0, 0)):
    """A box-shaped frustum: (half x, half y) at the bottom and at the top, `h` high, base at z=0."""
    bm = bmesh.new()
    b = [bm.verts.new((sx * bottom[0], sy * bottom[1], 0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    t = [bm.verts.new((sx * top[0], sy * top[1], h)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bm.faces.new(list(reversed(b)))
    bm.faces.new(t)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((b[i], b[j], t[j], t[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return xf(bm, loc, rot)


def prism(poly, depth, loc=(0, 0, 0), rot=(0, 0, 0)):
    """A 2D outline [(x, z), ...] in the XZ plane, extruded `depth` along Y (centred)."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -depth / 2, z)) for x, z in poly]
    back = [bm.verts.new((x, depth / 2, z)) for x, z in poly]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return xf(bm, loc, rot)


def leaf(length, width, droop=0.4, segs=6, loc=(0, 0, 0), rot=(0, 0, 0), fold=0.15, lobes=0):
    """A single-sided leaf along +X that droops down, folded along its midrib; `lobes` notches the edge like a fern frond."""
    bm = bmesh.new()
    top = []
    n = max(segs, lobes * 2)
    for s in range(n + 1):
        u = s / n
        x = u * length
        z = droop * length * (0.6 * u - 1.0 * u * u)
        w = width * math.sin(min(1.0, u * 1.15) * math.pi) * 0.5 + 0.01
        if lobes and s % 2:
            w *= 0.45
        top.append((bm.verts.new((x, -w, z - fold * w)), bm.verts.new((x, 0, z)), bm.verts.new((x, w, z - fold * w))))
    for s in range(n):
        for k in range(2):
            bm.faces.new((top[s][k], top[s][k + 1], top[s + 1][k + 1], top[s + 1][k]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return xf(bm, loc, rot)


def jitter(bm, amount, seed=0):
    rnd = random.Random(seed)
    for v in bm.verts:
        v.co += Vector(((rnd.random() - 0.5) * amount, (rnd.random() - 0.5) * amount, (rnd.random() - 0.5) * amount))
    return bm


# --- Props ------------------------------------------------------------------------------------


class Prop:
    def __init__(self, name):
        self.name = name
        self.parts = {}  # part -> (pivot, bmesh)
        self.order = []

    def part(self, name, pivot=(0, 0, 0)):
        if name not in self.parts:
            self.parts[name] = (Vector(pivot), bmesh.new())
            self.order.append(name)
        return self

    def add(self, bm, color, part="body", smooth=True):
        """Merges a piece into a part, coloured `color` ('#hex', 'gloss:#hex', 'glow:#hex' or 'tint')."""
        self.part(part)
        kind, hex_color = parse(color)
        uv = swatch(hex_color)
        layer = bm.loops.layers.uv.verify()
        for f in bm.faces:
            f.smooth = smooth
            f.material_index = KINDS.index(kind)
            for loop in f.loops:
                loop[layer].uv = uv
        me = bpy.data.meshes.new("tmp")
        bm.to_mesh(me)
        bm.free()
        self.parts[part][1].from_mesh(me)
        bpy.data.meshes.remove(me)
        return self


_props = []


def prop(name):
    p = Prop(name)
    _props.append(p)
    return p


# --- Materials and export ----------------------------------------------------------------------


def _palette_image(path):
    size = GRID * SWATCH
    img = bpy.data.images.new("palette", size, size, alpha=False)
    px = [0.0] * (size * size * 4)
    for hex_color, i in _palette.items():
        h = hex_color.lstrip("#")
        rgb = [int(h[k:k + 2], 16) / 255 for k in (0, 2, 4)]  # byte images take sRGB values as is
        cx, cy = (i % GRID) * SWATCH, (i // GRID) * SWATCH
        for y in range(cy, cy + SWATCH):
            for x in range(cx, cx + SWATCH):
                o = (y * size + x) * 4
                px[o:o + 4] = (*rgb, 1.0)
    img.pixels[:] = px
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


def _materials(img):
    mats = {}
    for kind in KINDS:
        m = bpy.data.materials.new("palette_" + kind if kind != "tint" else "tint")
        m.use_nodes = True
        nodes = m.node_tree.nodes
        bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
        m.use_backface_culling = kind != "leafy"  # glTF doubleSided only for leaves
        bsdf.inputs["Roughness"].default_value = {"matte": 0.8, "gloss": 0.3, "glow": 0.6, "tint": 0.85, "leafy": 0.75}[kind]
        bsdf.inputs["Metallic"].default_value = {"gloss": 0.25}.get(kind, 0.0)
        if kind != "tint":
            tex = nodes.new("ShaderNodeTexImage")
            tex.image = img
            tex.interpolation = next(i.identifier for i in tex.bl_rna.properties["interpolation"].enum_items if i.identifier.lower() == "closest")
            m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
            if kind == "glow":
                m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
                bsdf.inputs["Emission Strength"].default_value = 1.0
        else:
            bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
        mats[kind] = m
    return mats


def build_objects(scratch_png):
    """Turns every Prop into a root empty with one mesh object per part (origin at its pivot)."""
    img = _palette_image(scratch_png)
    mats = _materials(img)
    roots = []
    for p in _props:
        root = bpy.data.objects.new(p.name, None)
        bpy.context.collection.objects.link(root)
        for part in p.order:
            pivot, bm = p.parts[part]
            bmesh.ops.translate(bm, vec=-pivot, verts=bm.verts)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
            used = sorted({f.material_index for f in bm.faces})
            remap = {k: i for i, k in enumerate(used)}
            for f in bm.faces:
                f.material_index = remap[f.material_index]
            me = bpy.data.meshes.new(f"{p.name}_{part}")
            bm.to_mesh(me)
            bm.free()
            for k in used:
                me.materials.append(mats[KINDS[k]])
            o = bpy.data.objects.new(f"{p.name}_{part}" if len(p.order) > 1 or part != "body" else f"{p.name}_mesh", me)
            bpy.context.collection.objects.link(o)
            o.parent = root
            o.location = pivot
        roots.append(root)
    return roots


def write_glb(path, roots, **options):
    """Exports the roots and everything under them (nothing else) as a GLB. Shared with cars.py."""
    bpy.ops.object.select_all(action="DESELECT")
    for r in roots:
        r.select_set(True)
        for c in r.children_recursive:
            c.select_set(True)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, **options)


def export(path, roots):
    write_glb(path, roots, export_vertex_color="NONE", export_animations=False)
    print(f"exported {path} ({os.path.getsize(path)} bytes, {len(_palette)} colours)")


def stats():
    for p in _props:
        tris = sum(len(f.verts) - 2 for _, bm in p.parts.values() for f in bm.faces)
        print(f"  {p.name:16s} {tris:6d} tris  parts={p.order}")


# --- Previews ---------------------------------------------------------------------------------


def stage(sky, sun_rotation):
    """A sky-coloured world, a sun and the scene camera for preview renders (shared with cars.py). Returns (sun, camera)."""
    scene = bpy.context.scene
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*sky, 1)
    bg.inputs["Strength"].default_value = 0.9
    scene.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = sun_rotation
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    return sun, cam


def preview(roots, out_dir, size=480, tint=(0.35, 0.75, 0.3)):
    """Renders each root on its own from a three-quarter view (for checking the models)."""
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = scene.render.resolution_y = size
    m = bpy.data.materials.get("tint")
    if m:  # the game recolours tint; show it green here
        next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (*tint, 1)
    scene.render.film_transparent = False
    _, cam = stage((0.55, 0.7, 0.85), (0.8, 0.2, 0.9))
    for r in roots:
        for o in roots:
            hide = o is not r
            o.hide_render = hide
            for c in o.children_recursive:
                c.hide_render = hide
        pts = [c.matrix_world @ Vector(b) for c in r.children_recursive if c.type == "MESH" for b in c.bound_box]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        centre = (lo + hi) / 2
        radius = (hi - lo).length / 2
        d = Vector((0.75, 1.0, 0.55)).normalized()
        cam.location = centre + d * radius * 2.6
        cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
        cam.data.clip_end = radius * 10
        scene.render.filepath = os.path.join(out_dir, f"{r.name}.png")
        bpy.ops.render.render(write_still=True)


# --- Shrinking the GLB ------------------------------------------------------------------------------


def quantize(path):
    """
    Repacks a GLB with KHR_mesh_quantization (which three.js's GLTFLoader reads
    natively): normals as normalized bytes and UVs as normalized shorts. Palette
    UVs and toy-like normals don't need floats, and it saves about a third.
    """
    import json
    import struct

    import numpy as np

    data = open(path, "rb").read()
    jlen = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + jlen])
    bin_start = 20 + jlen + 8
    blob = data[bin_start:bin_start + struct.unpack_from("<I", data, 20 + jlen)[0]]
    views, accessors = doc["bufferViews"], doc["accessors"]
    comp = {5126: (np.float32, 4), 5123: (np.uint16, 2), 5125: (np.uint32, 4), 5121: (np.uint8, 1)}
    ncomp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
    kind = {}  # accessor -> how to repack
    for mesh in doc["meshes"]:
        for prim in mesh["primitives"]:
            for name, a in prim["attributes"].items():
                kind[a] = "normal" if name == "NORMAL" else "uv" if name.startswith("TEXCOORD") else "raw"
            kind[prim["indices"]] = "index"
    out = bytearray()
    new_views = []

    def push(raw, target=None, stride=None):
        while len(out) % 4:
            out.append(0)
        v = {"buffer": 0, "byteOffset": len(out), "byteLength": len(raw)}
        if target:
            v["target"] = target
        if stride:
            v["byteStride"] = stride
        out.extend(raw)
        new_views.append(v)
        return len(new_views) - 1

    for i, acc in enumerate(accessors):
        view = views[acc["bufferView"]]
        dtype, size = comp[acc["componentType"]]
        n = ncomp[acc["type"]]
        start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        arr = np.frombuffer(blob, dtype=dtype, count=acc["count"] * n, offset=start).reshape(acc["count"], n)
        k = kind.get(i, "raw")
        if k == "normal":
            q = np.zeros((acc["count"], 4), np.int8)
            q[:, :3] = np.clip(np.round(arr * 127), -127, 127)
            acc.update(bufferView=push(q.tobytes(), 34962, 4), componentType=5120, normalized=True)
            acc.pop("min", None), acc.pop("max", None)
        elif k == "uv":
            q = np.clip(np.round(arr * 65535), 0, 65535).astype(np.uint16)
            acc.update(bufferView=push(q.tobytes(), 34962), componentType=5123, normalized=True)
            acc.pop("min", None), acc.pop("max", None)
        else:
            acc["bufferView"] = push(arr.tobytes(), 34963 if k == "index" else 34962 if k == "raw" and i in kind else None)
        acc.pop("byteOffset", None)
    for img in doc.get("images", []):
        v = views[img["bufferView"]]
        img["bufferView"] = push(blob[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])
    doc["bufferViews"] = new_views
    while len(out) % 4:
        out.append(0)
    doc["buffers"] = [{"byteLength": len(out)}]
    for key in ("extensionsUsed", "extensionsRequired"):
        doc[key] = sorted(set(doc.get(key, [])) | {"KHR_mesh_quantization"})
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out))
    glb += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(out), 0x004E4942) + bytes(out)
    open(path, "wb").write(glb)
    print(f"quantized {path} ({len(glb)} bytes)")
