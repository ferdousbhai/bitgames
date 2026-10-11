import * as THREE from 'three'
import { describeMix } from './colour-studio.js'
import { tintToyPaint } from './colour-model.js'
import { rng } from './util.js'
import { listWords } from './speech.js'

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
 * The top step adds a white pot (bit 8): white in a mix makes its tint (red and white make pink).
 */
export const RED = 1
export const YELLOW = 2
export const BLUE = 4
export const WHITE = 8
export const PRIMARIES = [RED, YELLOW, BLUE]
/** Every pot a roller can dip in: the three paints, and white for tints. */
export const POTS = [RED, YELLOW, BLUE, WHITE]
const WORDS = ['red', 'yellow', 'blue', 'white']
const bitsOf = (mask) => POTS.filter((bit) => mask & bit)
/** Every colour the ground can show, by bits: { hex, word, recipe (bits), rgb }. */
export const MIXES = []
for (let mask = 0; mask < 16; mask++) {
  const base = mask & ~WHITE
  let hex, word
  if (!(mask & WHITE)) {
    const toy = describeMix(PRIMARIES.map((bit) => (mask & bit ? 1 : 0)))
    hex = toy.hex
    word = mask ? toy.base.toLowerCase() : 'nothing'
  } else if (!base) [hex, word] = ['#ffffff', 'white'] // a touch brighter than the paint in tints, so white alone shows on the pale ground
  else {
    const tint = tintToyPaint(MIXES[base].hex, MIXES[base].word[0].toUpperCase() + MIXES[base].word.slice(1))
    hex = tint.hex
    word = tint.name.toLowerCase()
  }
  MIXES.push({ mask, hex, word, recipe: bitsOf(mask), rgb: hexRgb(hex) })
}
/** The colours made by mixing (two or three paints), in the order a child usually finds them. */
export const MIXED = [RED | YELLOW, YELLOW | BLUE, RED | BLUE, RED | YELLOW | BLUE]
/** The tints the top step asks for: a paint or a mix, made light with white. */
export const TINTS = [RED | WHITE, BLUE | WHITE, RED | BLUE | WHITE, YELLOW | BLUE | WHITE, RED | YELLOW | WHITE]
/**
 * Ratios (the top step): a two-paint mix with more of one paint, made by laying that paint again over the
 * wet mix (yellow, red, then yellow again: a yellowish orange). A cell remembers which paint it leans to
 * (`PaintMap.lean`); a request or a result names such a colour by a code, its bits plus the paint it
 * leans to times 16 (`ratioCode`). Codes under 16 are plain mixes.
 */
const ISH = { [RED]: 'reddish', [YELLOW]: 'yellowish', [BLUE]: 'bluish' }
export const ratioCode = (mask, lean) => mask | (lean << 4)
export const RATIOS = {}
for (const mask of [RED | YELLOW, YELLOW | BLUE, RED | BLUE]) for (const lean of bitsOf(mask)) {
  const other = mask & ~lean
  const toy = describeMix(PRIMARIES.map((bit) => (bit === lean ? 2 : bit === other ? 1 : 0)))
  const code = ratioCode(mask, lean)
  RATIOS[code] = { mask, lean, hex: toy.hex, word: `${ISH[lean]} ${MIXES[mask].word}`, recipe: [lean, other, lean], rgb: hexRgb(toy.hex) }
}
export const RATIO_CODES = Object.keys(RATIOS).map(Number)
/** Any colour a request can name: a mix by its bits, or a ratio by its code. */
export const colourOf = (code) => (code >= 16 ? RATIOS[code] : MIXES[code])
/** "Red and yellow made orange!", "Two yellows and one red made yellowish orange!" */
export function mixWords(mask) {
  if (mask >= 16) {
    const { lean, recipe, word } = RATIOS[mask]
    return `Two ${MIXES[lean].word}s and one ${MIXES[recipe[1]].word} made ${word}!`
  }
  const list = listWords.format(bitsOf(mask).map((bit) => WORDS[POTS.indexOf(bit)]))
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
 * over dry paint it simply paints over the top, as with real paint. Long enough to lay a
 * whole coat of each paint over a big shape (three coats for brown) before the first dries.
 */
export const WET_MS = 12000

/**
 * Every cell remembers when each paint last touched it and when water last
 * washed it. Its colour is the paints laid within WET_MS of its latest paint
 * (and after the latest wash). Those are maxima, so every device ends with the
 * same picture whatever order the paint events arrive in.
 */
export class PaintMap {
  constructor() {
    const n = NX * NZ
    this.times = POTS.map(() => new Uint32Array(n))
    this.washed = new Uint32Array(n)
    /** Painted request shapes are kept safe from this game time on (0 = open to paint). */
    this.locked = new Uint32Array(n)
    this.mix = new Uint8Array(n)
    this.mask = new Uint8Array(n)
    /** The paint a two-paint cell has more of (0: even), laid again over the wet mix: shown as its ratio colour. */
    this.lean = new Uint8Array(n)
    /** Cells shown softened (dry paint off the shapes): display only, the paint itself is unchanged. */
    this.soft = new Uint8Array(n)
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
    this.dirty = false
    this.reset([])
  }

  /** Clears the paint; `obstacles` ({x, z, r}) are left out of the picture. */
  reset(obstacles) {
    for (const t of this.times) t.fill(0)
    this.washed.fill(0)
    this.locked.fill(0)
    this.mix.fill(0)
    this.rgba.fill(0)
    this.wetData.fill(0)
    this.mask.fill(0)
    this.lean.fill(0)
    this.soft.fill(0)
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
    if (this.mask[i] || (this.locked[i] && t > this.locked[i] + 1)) return
    if (!bits) {
      if (t <= this.washed[i]) return
      this.washed[i] = t
    } else {
      // One paint laid again over a wet two-paint mix whose other paint went on after it: more of this
      // paint (yellow, red, yellow again: a yellowish orange). Laid over a mix leaning the other way, it evens it out.
      let lean = -1
      const mix = this.mix[i]
      if ((bits === RED || bits === YELLOW || bits === BLUE) && mix & bits && RATIOS[ratioCode(mix, bits)]) {
        const other = mix & ~bits
        const to = this.times[POTS.indexOf(other)][i]
        if (to > this.times[POTS.indexOf(bits)][i] && t > to && t - to <= WET_MS) lean = this.lean[i] === other ? 0 : bits
      }
      let changed = false
      for (let k = 0; k < 4; k++) {
        if (bits & POTS[k] && t > this.times[k][i]) {
          this.times[k][i] = t
          changed = true
        }
      }
      if (!changed) return
      if (lean >= 0) return void this.settle(i, lean)
    }
    this.settle(i)
  }

  /** Gives a two-paint cell more of one paint (`lean`, 0 for even), shown in its ratio colour. */
  setLean(i, lean) {
    this.settle(i, lean)
  }

  /** Works out a cell's colour from its paint and wash times (`lean`: the paint it now has more of; otherwise kept while its mix stays). */
  settle(i, lean = -1) {
    const w = this.washed[i]
    const T = this.times
    const latest = Math.max(T[0][i], T[1][i], T[2][i], T[3][i])
    let mix = 0
    if (latest > w) for (let k = 0; k < 4; k++) {
      const t = T[k][i]
      if (t > w && latest - t <= WET_MS) mix |= POTS[k]
    }
    const before = this.mix[i]
    const wet = mix ? Math.min(65535, Math.round(latest / 100)) : 0
    const kw = i * 2
    this.wetData[kw] = wet >> 8
    this.wetData[kw + 1] = wet & 255
    this.dirty = true
    const was = this.lean[i]
    const now = lean >= 0 && RATIOS[ratioCode(mix, lean)] ? lean : mix === before && lean < 0 ? was : 0
    this.lean[i] = now
    if (mix === before && now === was && !this.soft[i]) return
    if (mix !== before) {
      this.counts[before]--
      this.counts[mix]++
      this.lastAt[mix] = i
      if (this.who >= 0 && this.who === this.mine) this.mineCounts[mix]++
      this.mix[i] = mix
    }
    // Fresh paint shows in its true colour again.
    this.soft[i] = 0
    const c = (now ? RATIOS[ratioCode(mix, now)] : MIXES[mix]).rgb
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

  /**
   * Softens paint that is not part of a painted shape: its colour fades toward a quiet grey by
   * `amountAt(x, z)` (0 keeps it bright), so the coloured-in shapes stand out. Only paint last laid at
   * or before game time `before` softens (so wet paint stays true while it can still mix), and only
   * the colour shown changes, never the paint itself. Fresh paint on a cell shows bright again.
   */
  soften(amountAt, before = Infinity) {
    const [R, Y, B, W] = this.times
    for (let i = 0; i < this.mix.length; i++) {
      if (!this.mix[i] || this.locked[i] || this.soft[i]) continue
      if (Math.max(R[i], Y[i], B[i], W[i]) > before) continue
      const { x, z } = this.cellCentre(i)
      const amount = amountAt(x, z)
      if (!(amount > 0)) continue
      // Toward a soft grey of the paint's own lightness, not toward white: a dry red trail goes a dusty
      // rose, never pink, so light colours (made with white) stay special to the shapes that asked for them.
      const k = i * 4
      const grey = 0.75 * (0.299 * this.rgba[k] + 0.587 * this.rgba[k + 1] + 0.114 * this.rgba[k + 2]) + 0.25 * 220
      for (let c = 0; c < 3; c++) this.rgba[k + c] = Math.round(this.rgba[k + c] + (grey - this.rgba[k + c]) * amount)
      this.soft[i] = 1
      this.dirty = true
    }
  }

  /** The cell index at a point, or -1 outside the playground. */
  index(x, z) {
    const i = Math.floor((x + HALF_W) / CELL)
    const j = Math.floor((z + HALF_D) / CELL)
    return i < 0 || j < 0 || i >= NX || j >= NZ ? -1 : j * NX + i
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
