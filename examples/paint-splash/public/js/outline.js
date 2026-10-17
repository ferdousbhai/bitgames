import * as THREE from 'three'
import { HALF_D, HALF_W } from './paint.js'

/**
 * Each round's light signature: one big, bold dotted chalk outline on the ground (a heart, a star, a fish
 * or a sun), under the paint, so rolling over it covers it. Just decoration: nothing asks for it. At the
 * reveal it comes back on top and its emoji pops up, so the child sees "we painted a fish!".
 */
const SHAPES = {
  heart: (a) => [16 * Math.sin(a) ** 3 / 17, (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17],
  star: (a) => {
    const r = 0.45 + 0.55 * Math.abs(((a / (Math.PI * 2 / 5)) % 1) - 0.5) * 2
    return [Math.sin(a) * r, Math.cos(a) * r]
  },
  sun: (a) => {
    // A round sun with ten pointed rays.
    const r = 0.68 + 0.32 * Math.max(0, Math.cos(a * 10)) ** 2
    return [Math.sin(a) * r, Math.cos(a) * r]
  },
  fish: (a) => {
    // A body (an ellipse) with a tail at the back.
    const t = a / (Math.PI * 2)
    if (t < 0.8) {
      const b = (t / 0.8) * Math.PI * 2 + 0.55
      return [Math.cos(b) * 0.75 + 0.15, Math.sin(b) * 0.48]
    }
    const k = (t - 0.8) / 0.2
    const pts = [[-0.47, -0.31], [-1, -0.55], [-0.85, 0], [-1, 0.55], [-0.47, 0.31]]
    const i = Math.min(3, Math.floor(k * 4)), f = k * 4 - i
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]
  },
}
export const OUTLINES = Object.keys(SHAPES)
/** The picture each outline is, shown when it pops up at the reveal and on the results. */
export const OUTLINE_EMOJI = { heart: '❤️', star: '⭐', sun: '☀️', fish: '🐟' }
/** How big the outline is, as a share of the playground's depth either side of the middle. */
const SIZE = 0.9

/** The outline in playground metres (x, z), for the robots to keep out of. */
export function outlinePolygon(name) {
  const shape = SHAPES[name]
  if (!shape) return null
  const k = SIZE * HALF_D
  return Array.from({ length: 120 }, (_, i) => {
    const [x, y] = shape((i / 120) * Math.PI * 2)
    return [x * k, -y * k]
  })
}

/** Whether (x, z) is inside a polygon. */
export function insidePolygon(poly, x, z) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** The dotted outline as a texture over the whole playground (canvas top = the far side), drawn under the paint. */
export function buildOutline(name) {
  const shape = SHAPES[name]
  if (!shape) return null
  const W = 1024, H = Math.round((W * HALF_D) / HALF_W)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  const scale = (H / 2) * SIZE
  g.lineWidth = 26
  g.lineCap = 'round'
  g.strokeStyle = 'rgba(140,105,210,0.7)'
  g.setLineDash([4, 38])
  g.beginPath()
  for (let k = 0; k <= 400; k++) {
    const [x, y] = shape((k / 400) * Math.PI * 2)
    const cx = W / 2 + x * scale, cy = H / 2 - y * scale
    if (k) g.lineTo(cx, cy)
    else g.moveTo(cx, cy)
  }
  g.closePath()
  g.stroke()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.flipY = false
  tex.anisotropy = 4
  return tex
}
