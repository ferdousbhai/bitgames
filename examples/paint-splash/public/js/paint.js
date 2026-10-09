import * as THREE from 'three'
import { mixToyPaint } from './colour-model.js'
import { rng } from './util.js'

const hexRgb = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16))

/**
 * The paint on the ground: a grid of 8 cm cells over the playground, shown
 * through one small RGBA texture the ground shader samples (bilinear filtering
 * plus a smoothstep in the shader turns the cells into smooth, round edges).
 *
 * Every device in a room gets the same paint events (roller strokes, bucket
 * splats, water washes) but not always in the same order; see PaintMap for how
 * every device still ends with exactly the same picture.
 */
export const HALF_W = 16
export const HALF_D = 11
export const CELL = 0.08
export const NX = Math.round((2 * HALF_W) / CELL)
export const NZ = Math.round((2 * HALF_D) / CELL)
/** Half the width of the stripe a roller paints. */
export const ROLLER_R = 0.92
export const SPLAT_R = 3.1
export const WASH_R = 2.3

/**
 * The paint is the colour studio's red, yellow and blue toy paints (colour-model.js),
 * kept as bits: 1 red, 2 yellow, 4 blue. A cell's colour is the mix of the bits on it.
 */
export const RED = 1
export const YELLOW = 2
export const BLUE = 4
export const PRIMARIES = [RED, YELLOW, BLUE]
const WORDS = ['red', 'yellow', 'blue']
const bitsOf = (mask) => PRIMARIES.filter((bit) => mask & bit)
/** Every colour the ground can show, by bits: { hex, word, recipe (bits), rgb }. */
export const MIXES = Array.from({ length: 8 }, (_, mask) => {
  const toy = mixToyPaint(PRIMARIES.map((bit) => (mask & bit ? 1 : 0)))
  const word = !mask ? 'nothing' : toy.name === 'Earthy mixture' ? 'brown' : toy.name.replace(' mixture', '').toLowerCase()
  return { mask, hex: toy.hex, word, recipe: bitsOf(mask), rgb: hexRgb(toy.hex) }
})
/** The colours made by mixing (two or three paints), in the order a child usually finds them. */
export const MIXED = [RED | YELLOW, YELLOW | BLUE, RED | BLUE, RED | YELLOW | BLUE]
/** "Red and yellow made orange!" */
export function mixWords(mask) {
  const names = bitsOf(mask).map((bit) => WORDS[PRIMARIES.indexOf(bit)])
  const list = names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(' and ')
  return `${list[0].toUpperCase()}${list.slice(1)} made ${MIXES[mask].word}!`
}
/** Each seat starts with one paint (a child can change pots while painting). */
export const SEAT_PAINT = [RED, YELLOW, BLUE, RED]
export const SEAT_COLORS = SEAT_PAINT.map((bit) => MIXES[bit].hex)
/** The rainbow roller (quick round only) paints a colour wheel: six stripes of paint bits. */
const RAINBOW_BITS = [RED, RED | YELLOW, YELLOW, YELLOW | BLUE, BLUE, RED | BLUE]
export const RAINBOW = RAINBOW_BITS.map((mask) => MIXES[mask].hex)
/**
 * Paint stays wet this long. A different paint rolled over wet paint mixes with it;
 * over dry paint it simply paints over the top, as with real paint.
 */
export const WET_MS = 8000

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
    /** When each cell was last painted (tenths of a second, two bytes), for the wet shine. */
    this.wetData = new Uint8Array(n * 4)
    this.counts = new Int32Array(8)
    /** The cell where each colour last appeared (to show where a new mix was found). */
    this.lastAt = new Int32Array(8).fill(-1)
    this.paintable = n
    this.texture = dataTexture(this.rgba, true)
    this.wetTexture = dataTexture(this.wetData, false)
    this.now = { value: 0 }
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
    this.settle(i)
  }

  /** Works out a cell's colour from its paint and wash times. */
  settle(i) {
    const w = this.washed[i]
    const latest = Math.max(this.times[0][i], this.times[1][i], this.times[2][i])
    let mix = 0
    if (latest > w) for (let k = 0; k < 3; k++) {
      const t = this.times[k][i]
      if (t > w && latest - t <= WET_MS) mix |= PRIMARIES[k]
    }
    const before = this.mix[i]
    const wet = mix ? Math.min(65535, Math.round(latest / 100)) : 0
    const kw = i * 4
    this.wetData[kw] = wet >> 8
    this.wetData[kw + 1] = wet & 255
    this.dirty = true
    if (mix === before) return
    this.counts[before]--
    this.counts[mix]++
    this.lastAt[mix] = i
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
  stroke(t, bits, x0, z0, x1, z1, rainbow) {
    const dx = x1 - x0, dz = z1 - z0
    const L2 = dx * dx + dz * dz
    if (L2 < 1e-6) return
    const L = Math.sqrt(L2)
    const r = ROLLER_R
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2
    this.cells(mx, mz, L / 2 + r, (i, cx, cz) => {
      const px = cx - x0, pz = cz - z0
      const u = Math.max(0, Math.min(1, (px * dx + pz * dz) / L2))
      const ex = px - u * dx, ez = pz - u * dz
      if (ex * ex + ez * ez > r * r) return
      let b = bits
      if (rainbow) {
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
    const take = (i) => this.write(i, t, bits)
    this.cells(x, z, R * 1.35, (i, cx, cz) => {
      const a = Math.atan2(cz - z, cx - x)
      const edge = R * (1 + 0.16 * Math.sin(a * lobes + p[0]) + 0.08 * Math.sin(a * (lobes + 4) + p[1]) + 0.05 * Math.sin(a * 13 + p[2]))
      const dx = cx - x, dz = cz - z
      if (dx * dx + dz * dz <= edge * edge) take(i)
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

  splat(t, bits, x, z, seed) {
    this.blob(t, bits, x, z, SPLAT_R, seed, 9)
  }

  wash(t, x, z, seed) {
    this.blob(t, 0, x, z, WASH_R, seed, 5)
  }

  /** The paint bits at a point: 0 bare, 1..7 a colour, or -1 outside / under an obstacle. */
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

function dataTexture(data, colour) {
  const tex = new THREE.DataTexture(data, NX, NZ, THREE.RGBAFormat, THREE.UnsignedByteType)
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
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPaintUv;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvPaintUv = vec2((position.x + ${HALF_W.toFixed(1)}) / ${(2 * HALF_W).toFixed(1)}, (position.z + ${HALF_D.toFixed(1)}) / ${(2 * HALF_D).toFixed(1)});`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D paintMap;\nuniform sampler2D wetMap;\nuniform float paintNow;\nvarying vec2 vPaintUv;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // Four bilinear taps around the point: a small blur that turns the cell steps into round edges.
        vec2 px = vec2(${(0.7 / NX).toFixed(6)}, ${(0.7 / NZ).toFixed(6)});
        vec4 pc = 0.25 * (texture2D(paintMap, vPaintUv + vec2(-px.x, -px.y)) + texture2D(paintMap, vPaintUv + vec2(px.x, -px.y))
          + texture2D(paintMap, vPaintUv + vec2(-px.x, px.y)) + texture2D(paintMap, vPaintUv + vec2(px.x, px.y)));
        float paintA = smoothstep(0.4, 0.6, pc.a);
        vec3 pcol = pc.rgb / max(pc.a, 0.0001);
        float grain = fract(sin(dot(floor(vPaintUv * vec2(${NX * 2}.0, ${NZ * 2}.0)), vec2(12.9898, 78.233))) * 43758.5453);
        pcol *= 0.95 + 0.07 * grain;
        pcol *= 1.0 - 0.22 * (1.0 - abs(pc.a * 2.0 - 1.0)) * step(0.05, pc.a);
        // Wet paint (laid in the last few seconds) is glossy and a touch brighter; it dries matt.
        vec4 wt = texture2D(wetMap, vPaintUv);
        float laid = floor(wt.r * 255.0 + 0.5) * 256.0 + floor(wt.g * 255.0 + 0.5);
        float paintWet = paintA * step(0.5, laid) * clamp(1.0 - (paintNow - laid) / ${(WET_MS / 100).toFixed(1)}, 0.0, 1.0);
        pcol = mix(pcol, min(pcol * 1.1 + 0.06, vec3(1.0)), paintWet);
        diffuseColor.rgb = mix(diffuseColor.rgb, pcol, paintA);`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(roughnessFactor, 0.5, paintA), 0.06, paintWet);')
  }
  return mat
}
