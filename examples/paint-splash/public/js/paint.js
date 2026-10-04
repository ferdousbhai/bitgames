import * as THREE from 'three'
import { rng } from './util.js'

/**
 * The paint on the ground: a grid of 8 cm cells over the playground, shown
 * through one small RGBA texture the ground shader samples (bilinear filtering
 * plus a smoothstep in the shader turns the cells into smooth, round edges).
 *
 * Every device in a room gets the same paint events (roller strokes, bucket
 * splats, water washes) but not always in the same order. Each cell keeps the
 * event that "wins" it — the latest game time, then a fixed tie-break — so
 * every device ends with exactly the same picture, whatever order the events
 * arrived in.
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

export const SEAT_COLORS = ['#ff4d8d', '#3a86ff', '#ffbe0b', '#2ec27e']
export const SEAT_NAMES = ['pink', 'blue', 'yellow', 'green']
export const RAINBOW = ['#ff595e', '#ff9f1c', '#ffd23f', '#8ac926', '#2ec4b6', '#9b5de5']
/** Colour index per cell: 0 none, 1..4 the seats, 5..10 rainbow stripes. */
const hexRgb = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16))
const PALETTE = [[0, 0, 0], ...[...SEAT_COLORS, ...RAINBOW].map(hexRgb)]

// Ranks: who wins a tie at the same millisecond (higher wins). Owner = rank >> 2.
const KIND_STROKE = 0
const KIND_SPLAT = 1
const KIND_WASH = 2

export class PaintMap {
  constructor() {
    const n = NX * NZ
    this.time = new Uint32Array(n)
    this.rank = new Uint8Array(n)
    this.color = new Uint8Array(n)
    this.mask = new Uint8Array(n)
    this.rgba = new Uint8Array(n * 4)
    this.counts = new Int32Array(5)
    this.paintable = n
    this.texture = new THREE.DataTexture(this.rgba, NX, NZ, THREE.RGBAFormat, THREE.UnsignedByteType)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.magFilter = THREE.LinearFilter
    this.texture.minFilter = THREE.LinearFilter
    this.texture.generateMipmaps = false
    this.texture.needsUpdate = true
    this.dirty = false
    this.reset([])
  }

  /** Clears the paint; `obstacles` ({x, z, r}) are left out of the picture. */
  reset(obstacles) {
    this.time.fill(0)
    this.rank.fill(0)
    this.color.fill(0)
    this.rgba.fill(0)
    this.mask.fill(0)
    for (const o of obstacles) this.cells(o.x, o.z, o.r + 0.05, (i) => (this.mask[i] = 1))
    let masked = 0
    for (let i = 0; i < this.mask.length; i++) masked += this.mask[i]
    this.paintable = this.mask.length - masked
    this.counts.fill(0)
    this.counts[0] = this.paintable
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

  /** Writes one cell if this event beats the one there. Returns the owner it took the cell from (or -1). */
  write(i, t, rank, color) {
    if (this.mask[i]) return -1
    const ot = this.time[i]
    if (t < ot) return -1
    const orank = this.rank[i]
    if (t === ot && (rank < orank || (rank === orank && color <= this.color[i]))) return -1
    const before = orank >> 2
    this.counts[before]--
    this.counts[rank >> 2]++
    this.time[i] = t
    this.rank[i] = rank
    this.color[i] = color
    const c = PALETTE[color]
    const k = i * 4
    this.rgba[k] = c[0]
    this.rgba[k + 1] = c[1]
    this.rgba[k + 2] = c[2]
    this.rgba[k + 3] = color ? 255 : 0
    this.dirty = true
    return before
  }

  /**
   * A roller rolling from (x0, z0) to (x1, z1): a stripe ROLLER_R either side.
   * Rainbow rollers paint six stripes across their width. Returns the number
   * of cells taken from other painters (for the "colour swapper" award).
   */
  stroke(t, seat, x0, z0, x1, z1, rainbow) {
    const dx = x1 - x0, dz = z1 - z0
    const L2 = dx * dx + dz * dz
    if (L2 < 1e-6) return 0
    const L = Math.sqrt(L2)
    const r = ROLLER_R
    const owner = seat + 1
    const rank = owner * 4 + KIND_STROKE
    let swaps = 0
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2
    this.cells(mx, mz, L / 2 + r, (i, cx, cz) => {
      const px = cx - x0, pz = cz - z0
      const u = Math.max(0, Math.min(1, (px * dx + pz * dz) / L2))
      const ex = px - u * dx, ez = pz - u * dz
      if (ex * ex + ez * ez > r * r) return
      let color = owner
      if (rainbow) {
        const side = (px * -dz + pz * dx) / L
        color = 5 + Math.max(0, Math.min(5, Math.floor(((side + r) / (2 * r)) * 6)))
      }
      const before = this.write(i, t, rank, color)
      if (before > 0 && before !== owner) swaps++
    })
    return swaps
  }

  /** A wobbly blob of radius ~R plus a ring of droplets (bucket splats and water washes). */
  blob(t, rank, color, x, z, R, seed, droplets) {
    const rnd = rng(seed)
    const p = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28]
    const lobes = 5 + Math.floor(rnd() * 3)
    let swaps = 0
    const owner = rank >> 2
    const take = (i) => {
      const before = this.write(i, t, rank, color)
      if (owner && before > 0 && before !== owner) swaps++
    }
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
    return swaps
  }

  splat(t, seat, x, z, seed) {
    return this.blob(t, (seat + 1) * 4 + KIND_SPLAT, seat + 1, x, z, SPLAT_R, seed, 9)
  }

  wash(t, x, z, seed) {
    this.blob(t, KIND_WASH, 0, x, z, WASH_R, seed, 5)
  }

  /** Who owns the paint at a point: 0 nobody, seat + 1, or -1 outside / under an obstacle. */
  ownerAt(x, z) {
    const i = Math.floor((x + HALF_W) / CELL)
    const j = Math.floor((z + HALF_D) / CELL)
    if (i < 0 || j < 0 || i >= NX || j >= NZ) return -1
    const k = j * NX + i
    return this.mask[k] ? -1 : this.rank[k] >> 2
  }

  /** Share (0..1) of the playground each seat has painted. */
  shares() {
    return [1, 2, 3, 4].map((o) => this.counts[o] / this.paintable)
  }

  upload() {
    if (!this.dirty) return
    this.dirty = false
    this.texture.needsUpdate = true
  }
}

/**
 * The ground material: a tiled base texture with the paint texture laid over
 * it (the paint is glossier, with a slightly darker rim like real wet paint).
 * The ground geometry must be in world space, flat at y = 0.
 */
export function groundMaterial(baseMap, paintTexture) {
  const mat = new THREE.MeshStandardMaterial({ map: baseMap, roughness: 0.9, metalness: 0 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.paintMap = { value: paintTexture }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPaintUv;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvPaintUv = vec2((position.x + ${HALF_W.toFixed(1)}) / ${(2 * HALF_W).toFixed(1)}, (position.z + ${HALF_D.toFixed(1)}) / ${(2 * HALF_D).toFixed(1)});`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D paintMap;\nvarying vec2 vPaintUv;')
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
        diffuseColor.rgb = mix(diffuseColor.rgb, pcol, paintA);`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.38, paintA);')
  }
  return mat
}
