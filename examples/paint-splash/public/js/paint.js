import * as THREE from 'three'
import { rng } from './util.js'

const hexRgb = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16))

/**
 * The paint on the ground: a grid of 8 cm cells over the playground, shown
 * through one small RGBA colour texture the ground shader samples (bilinear filtering
 * plus a smoothstep in the shader turns the cells into smooth, round edges).
 *
 * Every device in a room gets the same paint events (roller strokes, bucket
 * splats, water washes) but not always in the same order; see PaintMap for how
 * every device still ends with exactly the same picture.
 */
export const HALF_W = 16
export const HALF_D = 11
export const CELL = 0.06
export const NX = Math.round((2 * HALF_W) / CELL)
export const NZ = Math.round((2 * HALF_D) / CELL)
/** Half the width of the stripe a roller paints. */
export const ROLLER_R = 0.92
export const SPLAT_R = 3.1
export const WASH_R = 2.3

/**
 * The paint is toy red, yellow and blue, kept as bits: 1 red, 2 yellow, 4 blue. A cell's colour
 * is the mix of the bits on it (red and yellow make orange). Only two paints ever mix: a third
 * paint rolled over a wet mix pushes the oldest one out, so the pictures stay bright, never mud.
 */
export const RED = 1
export const YELLOW = 2
export const BLUE = 4
export const PRIMARIES = [RED, YELLOW, BLUE]
/** The rainbow pot: a roller dipped in it paints colour-wheel stripes (not a paint bit of its own). */
export const RAINBOW_POT = 16
/** Every pot a roller can dip in. */
export const POTS = [RED, YELLOW, BLUE, RAINBOW_POT]
/** The toy paint colours by bits (the corners of the old colour studio's model; brown stays for safety, but two paints at most ever mix). */
const HEX = ['#fff9eb', '#eb5063', '#f8d64e', '#f0993e', '#4e8ad5', '#a068b9', '#5fac70', '#7a5236']
/** Every colour the ground can show, by bits: { hex, recipe (bits), rgb }. */
export const MIXES = HEX.map((hex, mask) => ({ mask, hex, recipe: PRIMARIES.filter((bit) => mask & bit), rgb: hexRgb(hex) }))
/** The colours made by mixing two paints: each one makes a little moment the first time a child rolls it. */
export const MIXED = [RED | YELLOW, YELLOW | BLUE, RED | BLUE]
/** A pot's colour for buttons and drips (the rainbow pot shows red, its first stripe). */
export const potHex = (pot) => (pot === RAINBOW_POT ? MIXES[RED].hex : MIXES[pot].hex)
/** Each seat starts with one paint (a child can change pots while painting); the fourth starts on the rainbow. */
export const SEAT_PAINT = [RED, YELLOW, BLUE, RAINBOW_POT]
/** Each seat's own colour (its marker, card and part of the shared bar): the fourth is purple. */
export const SEAT_COLORS = [MIXES[RED].hex, MIXES[YELLOW].hex, MIXES[BLUE].hex, MIXES[RED | BLUE].hex]
/** The rainbow roller paints a colour wheel: six stripes of paint bits. */
const RAINBOW_BITS = [RED, RED | YELLOW, YELLOW, YELLOW | BLUE, BLUE, RED | BLUE]
export const RAINBOW = RAINBOW_BITS.map((mask) => MIXES[mask].hex)
/** Stamp shapes in a unit square (u across, v up, -1..1). */
const STAMPS = {
  star(u, v) {
    const r = Math.hypot(u, v)
    const a = Math.atan2(u, v)
    // Five points: the edge swings between an outer and an inner radius.
    const k = Math.abs(((a / (Math.PI * 2 / 5)) % 1 + 1) % 1 - 0.5) * 2
    return r < 0.42 + 0.5 * k ** 1.6
  },
  heart(u, v) {
    const x = u * 1.15, y = v * 1.15 + 0.15
    const q = x * x + y * y - 0.6
    return q * q * q - x * x * y * y * y < 0
  },
  /** A cow's hoofprint: two little ovals side by side. */
  hoof(u, v) {
    return Math.hypot((Math.abs(u) - 0.3) / 0.24, v / 0.42) < 1
  },
  paw(u, v) {
    if (Math.hypot(u * 0.85, v + 0.3) < 0.48) return true
    return [[-0.55, 0.3], [-0.2, 0.62], [0.2, 0.62], [0.55, 0.3]].some(([a, b]) => Math.hypot(u - a, v - b) < 0.24)
  },
}
export const STAMP_SHAPES = Object.keys(STAMPS)
/** The shapes a stamp token can give a roller. */
export const TOKEN_SHAPES = ['star', 'heart', 'paw']

/**
 * Paint stays wet this long. A different paint rolled over wet paint mixes with it;
 * over dry paint it simply paints over the top, as with real paint. Long enough to swap
 * pots and roll back over your own shiny trail; short enough that old trails dry and stay bright.
 */
export const WET_MS = 7000

/**
 * Every cell remembers when each paint last touched it and when water last
 * washed it. Its colour is the paints laid within WET_MS of its latest paint
 * (and after the latest wash). Those are maxima, so every device ends with the
 * same picture whatever order the paint events arrive in.
 */
export class PaintMap {
  constructor() {
    const n = NX * NZ
    this.times = PRIMARIES.map(() => new Uint32Array(n))
    this.washed = new Uint32Array(n)
    this.mix = new Uint8Array(n)
    this.mask = new Uint8Array(n)
    this.rgba = new Uint8Array(n * 4)
    /** When each cell was last painted (tenths of a second, two bytes: red high, green low), for the wet shine. */
    this.wetData = new Uint8Array(n * 2)
    this.counts = new Int32Array(16)
    /** The cell where each colour last appeared (to show where a new mix was found). */
    this.lastAt = new Int32Array(16).fill(-1)
    /** Cells each colour gained from this device's child's own roller (`mine` is their seat, `who` the painter now). */
    this.mineCounts = new Int32Array(16)
    this.mine = -1
    this.who = -1
    this.paintable = n
    this.texture = dataTexture(this.rgba, THREE.RGBAFormat, true)
    this.wetTexture = dataTexture(this.wetData, THREE.RGFormat, false)
    this.now = { value: 0 }
    /** The round's dotted chalk outline, drawn on the ground under the paint (a texture, or a blank one). */
    this.outline = { value: blankTexture() }
    /** How much the outline shows on top of the paint (0 while painting, 1 at the reveal). */
    this.outlineShow = { value: 0 }
    this.dirty = false
    this.reset([])
  }

  /** Clears the paint; `obstacles` ({x, z, r}) are left out of the picture. */
  reset(obstacles) {
    for (const t of this.times) t.fill(0)
    this.washed.fill(0)
    this.mix.fill(0)
    this.rgba.fill(0)
    this.wetData.fill(0)
    this.mask.fill(0)
    this.lastAt.fill(-1)
    this.mineCounts.fill(0)
    for (const o of obstacles) this.cells(o.x, o.z, o.r + 0.05, (i) => (this.mask[i] = 1))
    let masked = 0
    for (let i = 0; i < this.mask.length; i++) masked += this.mask[i]
    this.paintable = this.mask.length - masked
    this.counts.fill(0)
    this.counts[0] = this.paintable
    this.now.value = 0
    this.dirty = true
  }

  /** Calls fn(index, cx, cz) for every cell whose centre is within r of (x, z). */
  cells(x, z, r, fn) {
    const i0 = Math.max(0, Math.floor((x - r + HALF_W) / CELL))
    const i1 = Math.min(NX - 1, Math.floor((x + r + HALF_W) / CELL))
    const j0 = Math.max(0, Math.floor((z - r + HALF_D) / CELL))
    const j1 = Math.min(NZ - 1, Math.floor((z + r + HALF_D) / CELL))
    const r2 = r * r
    for (let j = j0; j <= j1; j++) {
      const cz = -HALF_D + (j + 0.5) * CELL
      for (let i = i0; i <= i1; i++) {
        const cx = -HALF_W + (i + 0.5) * CELL
        const dx = cx - x, dz = cz - z
        if (dx * dx + dz * dz <= r2) fn(j * NX + i, cx, cz)
      }
    }
  }

  /** Lays paint `bits` on a cell at game time t (bits 0 = a water wash). */
  write(i, t, bits) {
    if (this.mask[i]) return
    if (!bits) {
      if (t <= this.washed[i]) return
      this.washed[i] = t
    } else {
      let changed = false
      for (let k = 0; k < 3; k++) {
        if (bits & PRIMARIES[k] && t > this.times[k][i]) {
          this.times[k][i] = t
          changed = true
        }
      }
      if (!changed) return
    }
    this.single = bits && !(bits & (bits - 1))
    this.settle(i)
  }

  /** Works out a cell's colour from its paint and wash times. */
  settle(i) {
    const w = this.washed[i]
    const T = this.times
    const latest = Math.max(T[0][i], T[1][i], T[2][i])
    let mix = 0, oldest = -1
    if (latest > w) for (let k = 0; k < 3; k++) {
      const t = T[k][i]
      if (!(t > w && latest - t <= WET_MS)) continue
      mix |= PRIMARIES[k]
      if (oldest < 0 || t < T[oldest][i]) oldest = k
    }
    // Three wet paints: the oldest is pushed out (a tie keeps the lower bits, the same on every device).
    if (mix === 7) mix &= ~PRIMARIES[oldest]
    const before = this.mix[i]
    const wet = mix ? Math.min(65535, Math.round(latest / 100)) : 0
    const kw = i * 2
    this.wetData[kw] = wet >> 8
    this.wetData[kw + 1] = wet & 255
    this.dirty = true
    if (mix === before) return
    this.counts[before]--
    this.counts[mix]++
    this.lastAt[mix] = i
    // Only a real mix counts as found (one paint rolled over another), not the rainbow's ready-made stripes.
    if (this.who >= 0 && this.who === this.mine && this.single) this.mineCounts[mix]++
    this.mix[i] = mix
    const c = MIXES[mix].rgb
    const k = i * 4
    this.rgba[k] = c[0]
    this.rgba[k + 1] = c[1]
    this.rgba[k + 2] = c[2]
    this.rgba[k + 3] = mix ? 255 : 0
  }

  /**
   * A roller rolling from (x0, z0) to (x1, z1): a stripe ROLLER_R either side, in
   * paint `bits`. Rainbow rollers paint six colour-wheel stripes across their width.
   */
  stroke(t, bits, x0, z0, x1, z1, rainbow, r = ROLLER_R) {
    const dx = x1 - x0, dz = z1 - z0
    const L2 = dx * dx + dz * dz
    if (L2 < 1e-6) return
    const L = Math.sqrt(L2)
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2
    this.cells(mx, mz, L / 2 + r, (i, cx, cz) => {
      const px = cx - x0, pz = cz - z0
      const u = Math.max(0, Math.min(1, (px * dx + pz * dz) / L2))
      const ex = px - u * dx, ez = pz - u * dz
      if (ex * ex + ez * ez > r * r) return
      let b = bits
      if (rainbow || bits === RAINBOW_POT) {
        const side = (px * -dz + pz * dx) / L
        b = RAINBOW_BITS[Math.max(0, Math.min(5, Math.floor(((side + r) / (2 * r)) * 6)))]
      }
      this.write(i, t, b)
    })
  }

  /** A wobbly blob of radius ~R plus a ring of droplets (bucket splats and water washes). */
  blob(t, bits, x, z, R, seed, droplets) {
    const rnd = rng(seed)
    const p = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28]
    const lobes = 5 + Math.floor(rnd() * 3)
    // A splat covers what was under it in its own colour (a wash just before it), so splats stay bright;
    // only rolled stripes mix with wet paint. A rainbow splat is a pinwheel: six colour-wheel slices.
    const cover = (i, b) => {
      this.write(i, t - 1, 0)
      this.write(i, t, b)
    }
    const take = !bits
      ? (i) => this.write(i, t, 0)
      : bits === RAINBOW_POT
        ? (i, cx, cz) => cover(i, RAINBOW_BITS[Math.floor(((Math.atan2(cz - z, cx - x) + p[0] + Math.PI * 4) / (Math.PI / 3)) % 6)])
        : (i) => cover(i, bits)
    this.cells(x, z, R * 1.35, (i, cx, cz) => {
      const a = Math.atan2(cz - z, cx - x)
      const edge = R * (1 + 0.16 * Math.sin(a * lobes + p[0]) + 0.08 * Math.sin(a * (lobes + 4) + p[1]) + 0.05 * Math.sin(a * 13 + p[2]))
      const dx = cx - x, dz = cz - z
      if (dx * dx + dz * dz <= edge * edge) take(i, cx, cz)
    })
    for (let k = 0; k < droplets; k++) {
      const a = rnd() * Math.PI * 2
      const d = R * (1.15 + rnd() * 0.6)
      const r = R * (0.08 + rnd() * 0.13)
      this.cells(x + Math.cos(a) * d, z + Math.sin(a) * d, r, take)
      // A little trail joining the droplet to the blob
      const mid = R * 0.95 + (d - R) * 0.45
      this.cells(x + Math.cos(a) * mid, z + Math.sin(a) * mid, r * 0.6, take)
    }
  }

  /** A bucket splat (or, with `r`, a smaller tapped splat). */
  splat(t, bits, x, z, seed, r = SPLAT_R) {
    this.blob(t, bits, x, z, r, seed, r < SPLAT_R ? 7 : 9)
  }

  /**
   * A stamp printed by a stamp roller: a star, a heart or a paw print, `size` metres from middle to
   * edge, always upright as the child sees it (its top toward the far side of the playground).
   */
  stamp(t, bits, x, z, shape, size = 1) {
    const inside = STAMPS[shape]
    if (!inside) return
    const take = bits === RAINBOW_POT ? RAINBOW_BITS[Math.abs(Math.round(x * 3 + z * 5)) % 6] : bits
    this.cells(x, z, size, (i, cx, cz) => {
      // u across the screen, v up the screen (the far side is -z).
      if (!inside((cx - x) / size, (z - cz) / size)) return
      // A print covers what's under it, so the shape stays crisp.
      this.write(i, t - 1, 0)
      this.write(i, t, take)
    })
  }

  wash(t, x, z, seed) {
    this.blob(t, 0, x, z, WASH_R, seed, 5)
  }

  /** The paint bits at a point: 0 bare, 1..15 a colour, or -1 outside / under an obstacle. */
  mixAt(x, z) {
    const i = Math.floor((x + HALF_W) / CELL)
    const j = Math.floor((z + HALF_D) / CELL)
    if (i < 0 || j < 0 || i >= NX || j >= NZ) return -1
    const k = j * NX + i
    return this.mask[k] ? -1 : this.mix[k]
  }

  /** How much of the playground has paint on it (0..1). */
  coverage() {
    return 1 - this.counts[0] / this.paintable
  }

  /** Where a cell is, in the world. */
  cellCentre(i) {
    return { x: -HALF_W + ((i % NX) + 0.5) * CELL, z: -HALF_D + (Math.floor(i / NX) + 0.5) * CELL }
  }

  upload() {
    if (!this.dirty) return
    this.dirty = false
    this.texture.needsUpdate = true
    this.wetTexture.needsUpdate = true
  }
}

function blankTexture() {
  const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat)
  tex.needsUpdate = true
  return tex
}

function dataTexture(data, format, colour) {
  const tex = new THREE.DataTexture(data, NX, NZ, format, THREE.UnsignedByteType)
  if (colour) tex.colorSpace = THREE.SRGBColorSpace
  // Colour blends smoothly between cells; the paint times must not be blended.
  tex.magFilter = tex.minFilter = colour ? THREE.LinearFilter : THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

/**
 * The ground material: a tiled base texture with the paint texture laid over
 * it (the paint is glossier, with a slightly darker rim like real wet paint).
 * The ground geometry must be in world space, flat at y = 0.
 */
export function groundMaterial(baseMap, paint) {
  const paintTexture = paint.texture
  const mat = new THREE.MeshStandardMaterial({ map: baseMap, roughness: 0.9, metalness: 0 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.paintMap = { value: paintTexture }
    shader.uniforms.wetMap = { value: paint.wetTexture }
    shader.uniforms.paintNow = paint.now
    shader.uniforms.outlineMap = paint.outline
    shader.uniforms.outlineShow = paint.outlineShow
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPaintUv;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvPaintUv = vec2((position.x + ${HALF_W.toFixed(1)}) / ${(2 * HALF_W).toFixed(1)}, (position.z + ${HALF_D.toFixed(1)}) / ${(2 * HALF_D).toFixed(1)});`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D paintMap;\nuniform sampler2D wetMap;\nuniform sampler2D outlineMap;\nuniform float outlineShow;\nuniform float paintNow;\nvarying vec2 vPaintUv;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // Eight bilinear taps in a ring round the point plus the middle: a soft blur that turns the
        // cell steps into smooth, round edges.
        vec2 px = vec2(${(1 / NX).toFixed(6)}, ${(1 / NZ).toFixed(6)});
        vec4 pc = texture2D(paintMap, vPaintUv) * 0.2;
        for (int k = 0; k < 8; k++) {
          float a = float(k) * 0.785398 + 0.39;
          pc += texture2D(paintMap, vPaintUv + vec2(cos(a), sin(a)) * px * 0.7) * 0.1;
        }
        float paintA = smoothstep(0.42, 0.58, pc.a);
        vec3 pcol = pc.rgb / max(pc.a, 0.0001);
        float grain = fract(sin(dot(floor(vPaintUv * vec2(${NX * 2}.0, ${NZ * 2}.0)), vec2(12.9898, 78.233))) * 43758.5453);
        pcol *= 0.96 + 0.05 * grain;
        pcol *= 1.0 - 0.2 * (1.0 - abs(pc.a * 2.0 - 1.0)) * step(0.05, pc.a);
        // Wet paint (laid in the last few seconds) is glossy and a touch brighter; it dries matt. The paint
        // times can't be blended, so the wetness of four neighbouring cells is worked out and blended instead.
        float paintWet = 0.0;
        vec2 cellUv = vPaintUv * vec2(${NX}.0, ${NZ}.0) - 0.5;
        vec2 f = fract(cellUv);
        vec2 base = (floor(cellUv) + 0.5) / vec2(${NX}.0, ${NZ}.0);
        for (int k = 0; k < 4; k++) {
          vec2 o = vec2(float(k - (k / 2) * 2), float(k / 2));
          vec4 wt = texture2D(wetMap, base + o * px);
          float laid = floor(wt.r * 255.0 + 0.5) * 256.0 + floor(wt.g * 255.0 + 0.5);
          float w = mix(1.0 - f.x, f.x, o.x) * mix(1.0 - f.y, f.y, o.y);
          paintWet += w * step(0.5, laid) * clamp(1.0 - (paintNow - laid) / ${(WET_MS / 100).toFixed(1)}, 0.0, 1.0);
        }
        paintWet *= paintA;
        pcol = mix(pcol, min(pcol * 1.1 + 0.06, vec3(1.0)), paintWet);
        // The chalk outline sits on the ground, so paint rolled over it covers it.
        vec4 oc = texture2D(outlineMap, vPaintUv);
        diffuseColor.rgb = mix(diffuseColor.rgb, oc.rgb, oc.a);
        diffuseColor.rgb = mix(diffuseColor.rgb, pcol, paintA);
        // At the reveal the outline comes back on top, as white chalk dots over the paint.
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), min(1.0, oc.a * 1.6) * outlineShow);`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(roughnessFactor, 0.5, paintA), 0.06, paintWet);')
  }
  return mat
}
