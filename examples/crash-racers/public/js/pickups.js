import * as THREE from 'three'
import { canvasTexture, clamp, rng, wrap } from './util.js'

/**
 * Stars along the road (and in arcs over the jumps) and mystery boxes.
 * The layout comes from the race seed, so every device shows the same one.
 * Collecting is per car: each child sees every star until they grab it
 * themselves, and stars come back each lap. Two InstancedMeshes draw it all.
 */

const STAR_REACH = { along: 1.6, across: 1.9, up: 2.2 }
const BOX_REACH = { along: 1.8, across: 1.8, up: 2.4 }
/** Seconds before a car can open the same box again (the box looks gone to that car meanwhile). */
const BOX_RESPAWN = 5
const BOX_PRIZES = ['turbo', 'wave', 'fix', 'stars']
/** Only items within this many metres along the road of a car are checked. */
const NEAR = 6
const local = {} // scratch for Track.localTo

/** Item indices sorted by distance along the road, for finding what's near a car quickly. */
const byDist = (items) => items.map((_, i) => i).sort((a, b) => items[a].dist - items[b].dist)

function starGeometry() {
  const shape = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.2 : 0.48
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2
    shape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r)
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 })
  geo.center()
  return geo
}

const boxTexture = () =>
  canvasTexture(128, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 128, 128)
    ;['#ff6b9d', '#ffbe0b', '#8ac926', '#2ec4b6', '#6c63ff'].forEach((c, i) => grad.addColorStop(i / 4, c))
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    g.strokeStyle = 'rgba(255,255,255,0.9)'
    g.lineWidth = 8
    g.strokeRect(4, 4, 120, 120)
    g.font = '900 92px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#ffffff'
    g.strokeStyle = 'rgba(0,0,0,0.35)'
    g.lineWidth = 6
    g.strokeText('?', 64, 70)
    g.fillText('?', 64, 70)
  })

export class Pickups {
  constructor(scene) {
    this.scene = scene
    this.stars = []
    this.boxes = []
    this.cars = new Map() // car id -> { stars: Uint8Array, boxes: Float64Array, streak, streakTime }
    this.starGeo = starGeometry()
    this.starMat = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffae00', emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.35 })
    this.boxGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2)
    const map = boxTexture()
    this.boxMat = new THREE.MeshStandardMaterial({ map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.35, roughness: 0.4, transparent: true, opacity: 0.92 })
    this.dummy = new THREE.Object3D()
    this.time = 0
  }

  /** Lays out this race's stars and boxes. Deterministic in `seed`. */
  build(track, seed) {
    this.dispose()
    this.track = track
    const r = rng((seed ^ 0x51a7) >>> 0)
    const half = track.width / 2
    const place = (list, dist, lateral, y, extra = {}) => {
      const f = track.frameAt(dist)
      const p = f.p.clone().addScaledVector(f.side, lateral)
      list.push({ dist: wrap(dist, track.length), x: p.x, z: p.z, y, tx: f.t.x, tz: f.t.z, ...extra })
    }

    // Lines of five stars that weave a little, a short way apart all round the loop.
    for (let d = 35; d < track.length - 25; d += 45 + r() * 30) {
      if (track.nearRamp(d, 10) || track.nearRamp(d + 18, 10)) continue
      const lane = (r() - 0.5) * (track.width - 3.5)
      const weave = (r() - 0.5) * 0.9
      for (let k = 0; k < 5; k++) place(this.stars, d + k * 4, clamp(lane + weave * k, -half + 1.4, half - 1.4), 0.95)
    }
    // An arc of stars over every jump: grab them in the air.
    for (const j of track.jumps) {
      const span = j.gap + j.face * 0.6
      for (let k = 0; k <= 6; k++) {
        const t = k / 6
        place(this.stars, j.takeoff + 1 + t * span, j.lateral, j.lip + 1.0 + Math.sin(t * Math.PI) * (1.6 + j.height * 0.6), { air: true })
      }
    }
    // Rows of mystery boxes across the road at three spots.
    for (let n = 0; n < 3; n++) {
      let d = track.length * (0.18 + n * 0.3) + r() * 40
      for (let tries = 0; tries < 12 && (track.nearRamp(d, 15) || track.boostPadAt({ dist: d, lateral: 0 })); tries++) d += 15
      if (track.nearRamp(d, 15)) continue
      for (const lane of [-1, 0, 1]) place(this.boxes, d, lane * Math.min(3.2, half - 1.6), 1.15, { prize: BOX_PRIZES[Math.floor(r() * BOX_PRIZES.length)] })
    }

    this.starMesh = new THREE.InstancedMesh(this.starGeo, this.starMat, Math.max(1, this.stars.length))
    this.boxMesh = new THREE.InstancedMesh(this.boxGeo, this.boxMat, Math.max(1, this.boxes.length))
    for (const mesh of [this.starMesh, this.boxMesh]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.frustumCulled = false
      mesh.castShadow = false
      this.scene.add(mesh)
    }
    this.starMesh.count = this.stars.length
    this.boxMesh.count = this.boxes.length
    this.starOrder = byDist(this.stars)
    this.boxOrder = byDist(this.boxes)
  }

  stateOf(id) {
    let s = this.cars.get(id)
    if (!s) this.cars.set(id, (s = { stars: new Uint8Array(this.stars.length), boxes: new Float64Array(this.boxes.length), streak: 0, streakTime: 0 }))
    return s
  }

  /** A new lap: the stars come back for this car. */
  newLap(id) {
    this.stateOf(id).stars.fill(0)
  }

  /**
   * Checks what `car` (on the road near `proj`) touches. Calls
   * handlers.onStar(car, star, streak) and handlers.onBox(car, box) for each new one. `now` is game seconds.
   */
  collect(car, proj, now, handlers) {
    if (!this.track) return
    const s = this.stateOf(car.id)
    const pos = car.body.position
    if (now - s.streakTime > 1.5) s.streak = 0
    this.near(this.stars, this.starOrder, proj.dist, (i) => {
      if (s.stars[i] || !this.touches(pos, this.stars[i], STAR_REACH)) return
      s.stars[i] = 1
      s.streakTime = now
      handlers.onStar(car, this.stars[i], s.streak++)
    })
    this.near(this.boxes, this.boxOrder, proj.dist, (i) => {
      if (s.boxes[i] > now || !this.touches(pos, this.boxes[i], BOX_REACH)) return
      s.boxes[i] = now + BOX_RESPAWN
      handlers.onBox(car, this.boxes[i])
    })
  }

  /** Is a car at `pos` within `reach` of an item? */
  touches(pos, item, reach) {
    const l = this.track.localTo(pos, item, local)
    return Math.abs(l.along) < reach.along && Math.abs(l.across) < reach.across && Math.abs(pos.y - item.y) < reach.up
  }

  /** Calls fn(i) for each item within NEAR metres of `dist` along the loop (`order`: the items' indices sorted by dist). */
  near(items, order, dist, fn) {
    const length = this.track.length
    const visit = (from, to) => {
      let lo = 0, hi = order.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (items[order[mid]].dist < from) lo = mid + 1
        else hi = mid
      }
      for (let k = lo; k < order.length && items[order[k]].dist <= to; k++) fn(order[k])
    }
    const from = dist - NEAR, to = dist + NEAR
    // Near the start line the window wraps round the loop.
    if (from < 0) {
      visit(from + length, length)
      visit(0, to)
    } else if (to >= length) {
      visit(from, length)
      visit(0, to - length)
    } else visit(from, to)
  }

  /** Spins and bobs everything; hides what the viewer (`viewerId`) has collected. */
  update(dt, viewerId, now) {
    if (!this.starMesh) return
    this.time += dt
    const seen = this.cars.get(viewerId)
    const d = this.dummy
    const spin = this.time * 3
    for (let i = 0; i < this.stars.length; i++) {
      const it = this.stars[i]
      d.position.set(it.x, it.y + Math.sin(this.time * 3 + i * 0.7) * 0.12, it.z)
      d.rotation.set(0, spin + i * 0.35, 0)
      d.scale.setScalar(seen?.stars[i] ? 0 : 1.1)
      d.updateMatrix()
      this.starMesh.setMatrixAt(i, d.matrix)
    }
    this.starMesh.instanceMatrix.needsUpdate = true
    for (let i = 0; i < this.boxes.length; i++) {
      const it = this.boxes[i]
      // A box pops back in over its last half second.
      const back = seen ? clamp(1 - (seen.boxes[i] - now) / 0.5, 0, 1) : 1
      d.position.set(it.x, it.y + Math.sin(this.time * 2.2 + i) * 0.18, it.z)
      d.rotation.set(0.35, this.time * 1.4 + i, 0.2)
      d.scale.setScalar(back)
      d.updateMatrix()
      this.boxMesh.setMatrixAt(i, d.matrix)
    }
    this.boxMesh.instanceMatrix.needsUpdate = true
  }

  dispose() {
    for (const mesh of [this.starMesh, this.boxMesh]) {
      if (!mesh) continue
      mesh.removeFromParent()
      mesh.dispose()
    }
    this.starMesh = this.boxMesh = null
    this.stars = []
    this.boxes = []
    this.cars.clear()
    this.track = null
  }
}
