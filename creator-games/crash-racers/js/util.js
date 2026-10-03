import * as THREE from 'three'

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export const lerp = (a, b, t) => a + (b - a) * t
export const damp = (a, b, rate, dt) => lerp(a, b, smoothing(rate, dt))

/** Small deterministic random generator, so every device builds the same city. */
export function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

/** Cheap 3D value noise in [-1, 1], used to make dents and wrinkles irregular. */
export function noise3(x, y, z) {
  const h = (a, b, c) => {
    let n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
    return n - Math.floor(n)
  }
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = x - xi, yf = y - yi, zf = z - zi
  const s = (t) => t * t * (3 - 2 * t)
  const u = s(xf), v = s(yf), w = s(zf)
  const c = (dx, dy, dz) => h(xi + dx, yi + dy, zi + dz)
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u), x10 = lerp(c(0, 1, 0), c(1, 1, 0), u)
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u), x11 = lerp(c(0, 1, 1), c(1, 1, 1), u)
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 2 - 1
}

export function canvasTexture(width, height, draw, { repeat = [1, 1], srgb = true } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d'), width, height)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(...repeat)
  tex.anisotropy = 4
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Speckled noise fill, the base of most surface textures. */
export function speckle(g, w, h, base, variance, count, size = 2, rand = Math.random) {
  g.fillStyle = base
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < count; i++) {
    const v = (rand() - 0.5) * variance
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`
    g.fillRect(rand() * w, rand() * h, size, size)
  }
}

// Collision groups
export const GROUP_STATIC = 1
export const GROUP_CAR = 2
export const GROUP_DEBRIS = 4
export const GROUP_PROP = 8
/** What static scenery collides with. */
export const STATIC_MASK = GROUP_CAR | GROUP_DEBRIS | GROUP_PROP

/** Debris and props get knocked about but never damage a car. */
export const harmless = (body) => (body.collisionFilterGroup & (GROUP_DEBRIS | GROUP_PROP)) !== 0

/** Fraction to move towards a target this frame for exponential smoothing at `rate` per second. */
export const smoothing = (rate, dt) => 1 - Math.exp(-rate * dt)

/** Wraps a distance along a loop of `length` into 0..length. */
export const wrap = (d, length) => ((d % length) + length) % length
