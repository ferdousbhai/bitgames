import * as THREE from 'three'
import * as CANNON from 'cannon'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GROUP_CAR, GROUP_DEBRIS, GROUP_PROP, GROUP_STATIC, STATIC_MASK, ensureIndexed, rng, wrap } from './util.js'

/**
 * A Delivery Town side street, in metres: its turning place's centre is
 * `centre` beyond the kerb with radius `pad`, the house's door is `door`
 * beyond that centre, and the lane is `lane` wide.
 */
export const SPUR = { centre: 26, pad: 6.5, door: 4.4, lane: 7 }

let boostMat
/**
 * Two bold yellow arrows on orange, pointing the way you drive, drawn once and
 * shared by every boost pad. The canvas's bottom edge is the pad's front.
 */
function boostMaterial() {
  if (boostMat) return boostMat
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 256
  const g = canvas.getContext('2d')
  g.fillStyle = '#ff6a00'
  g.fillRect(0, 0, 128, 256)
  g.fillStyle = '#fff04a'
  for (const y of [8, 136]) {
    g.beginPath()
    g.moveTo(10, y)
    g.lineTo(64, y + 70)
    g.lineTo(118, y)
    g.lineTo(118, y + 40)
    g.lineTo(64, y + 112)
    g.lineTo(10, y + 40)
    g.closePath()
    g.fill()
  }
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  boostMat = new THREE.MeshStandardMaterial({ map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.55, roughness: 0.5 })
  return boostMat
}

/**
 * A closed loop road. Cities describe the path and decorate the sides; this
 * class builds the road surface, the static colliders and lap progress.
 */
export class Track {
  constructor({ points, width, scene, world, staticMaterial, seed = 1 }) {
    this.scene = scene
    this.world = world
    this.width = width
    this.staticMaterial = staticMaterial
    this.random = rng(seed)
    this.group = new THREE.Group()
    scene.add(this.group)
    this.bodies = []
    this.props = []
    this.ramps = []
    this.boostPads = []
    /** Jumps in detail (take-off lip, gap, landing), for placing star arcs over them. */
    this.jumps = []
    /** Scenery that moves (flags, dinosaurs, the ferry...): `fn(dt, time)` each frame, on the race's clock. */
    this.animators = []
    this.time = 0
    this.mergeBuckets = new Map() // material -> geometries, merged into one mesh at the end

    this.curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal')
    this.length = this.curve.getLength()
    const count = Math.ceil(this.length / 2)
    this.samples = []
    for (let i = 0; i < count; i++) {
      const u = i / count
      const p = this.curve.getPointAt(u)
      const t = this.curve.getTangentAt(u).setY(0).normalize()
      const side = new THREE.Vector3(-t.z, 0, t.x) // right-hand side
      this.samples.push({ p, t, side, dist: u * this.length })
    }
    // Spatial hash of samples for fast "how far from the road is this?" queries.
    this.cell = 16
    this.grid = new Map()
    for (const s of this.samples) this.gridAdd(s.p)
    /** Delivery Town's side streets (see planSpurs); none unless the town asked for them before the city was built. */
    this.spurs = []
    this.planned = !!Track.plan
    if (Track.plan) this.planSpurs(Track.plan)
  }

  /** Set by Delivery Town just before a city is built: `{ seed, count }` side streets to make room for. */
  static plan = null

  /** Adds a road point to the spatial hash (the loop's samples, and side streets' points). */
  gridAdd(p) {
    const key = this.key(p.x, p.z)
    if (!this.grid.has(key)) this.grid.set(key, [])
    this.grid.get(key).push(p)
  }

  key(x, z) {
    return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`
  }

  /** Distance from a point to the road's centre line (approximate, via samples). */
  distanceToRoad(x, z, radius = 2) {
    let best = Infinity
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell)
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) {
        const list = this.grid.get(`${cx + dx},${cz + dz}`)
        if (!list) continue
        for (const p of list) {
          const d = (p.x - x) ** 2 + (p.z - z) ** 2
          if (d < best) best = d
        }
      }
    return Math.sqrt(best)
  }

  /** Where a position is along the loop: sample index, distance travelled and sideways offset. */
  project(pos, hint = -1) {
    let best = -1, bestD = Infinity
    const search = (from, to) => {
      for (let k = from; k <= to; k++) {
        const i = wrap(k, this.samples.length)
        const p = this.samples[i].p
        const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
    }
    if (hint >= 0) search(hint - 25, hint + 25)
    if (best < 0 || bestD > 400) search(0, this.samples.length - 1)
    const s = this.samples[best]
    const lateral = (pos.x - s.p.x) * s.side.x + (pos.z - s.p.z) * s.side.z
    return { index: best, dist: s.dist, lateral, offRoad: Math.abs(lateral) > this.width / 2 + 0.5, distance: Math.sqrt(bestD) }
  }

  /** Yaw that points a car's nose (-Z) along the road at sample `s`. */
  headingAt(s) {
    return Math.atan2(-s.t.x, -s.t.z)
  }

  /** Yaw that lines an object's +Z up with the road at sample `s` (scenery). */
  alongAt(s) {
    return Math.atan2(s.t.x, s.t.z)
  }

  sampleAt(dist) {
    const i = Math.floor((wrap(dist, this.length) / this.length) * this.samples.length)
    return this.samples[i % this.samples.length]
  }

  /**
   * A point `lateral` metres to the side of the road at `dist` (positive = the
   * road's right): `pos`, the road sample `s`, and `toRoad`, the way back to the road.
   */
  beside(dist, lateral) {
    const s = this.sampleAt(dist)
    return { pos: s.p.clone().addScaledVector(s.side, lateral), s, toRoad: s.side.clone().multiplyScalar(-Math.sign(lateral)) }
  }

  /** Start positions: two columns behind the start line. */
  grid4(n) {
    const out = []
    for (let k = 0; k < n; k++) {
      const s = this.sampleAt(this.length - 8 - Math.floor(k / 2) * 9)
      const lateral = (k % 2 === 0 ? -1 : 1) * this.width * 0.22
      out.push({ position: s.p.clone().addScaledVector(s.side, lateral), yaw: this.headingAt(s) })
    }
    return out
  }

  // --- Building blocks ------------------------------------------------------

  /** The road ribbon, with UVs in metres along and 0..1 across. */
  buildRoad(material) {
    this.roadMaterial = material
    const half = this.width / 2
    const y = 0.02
    const positions = [], uvs = [], index = []
    const n = this.samples.length
    for (let i = 0; i <= n; i++) {
      const s = this.samples[i % n]
      const l = s.p.clone().addScaledVector(s.side, -half)
      const r = s.p.clone().addScaledVector(s.side, half)
      positions.push(l.x, y, l.z, r.x, y, r.z)
      const v = (i / n) * this.length / (this.width * 1.2)
      uvs.push(0, v, 1, v)
      if (i < n) {
        const a = i * 2
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) // counter-clockwise from above, so it faces up
      }
    }
    return this.ribbon(positions, uvs, index, material)
  }

  ribbon(positions, uvs, index, material) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geo.setIndex(index)
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, material)
    mesh.receiveShadow = true
    // Road, verges and side streets: flat, never in a side street's way (see carveSpurs).
    mesh.userData.surface = true
    this.group.add(mesh)
    return mesh
  }

  /** A strip running beside the road (sidewalk, curb, verge). */
  buildStrip(material, from, to, y) {
    const positions = [], uvs = [], index = []
    const n = this.samples.length
    for (const sign of [-1, 1]) {
      const base = positions.length / 3
      for (let i = 0; i <= n; i++) {
        const s = this.samples[i % n]
        const a = s.p.clone().addScaledVector(s.side, sign * from)
        const b = s.p.clone().addScaledVector(s.side, sign * to)
        positions.push(a.x, y, a.z, b.x, y, b.z)
        uvs.push(0, i * 0.5, 1, i * 0.5)
        if (i < n) {
          const k = base + i * 2
          if (sign > 0) index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
          else index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
        }
      }
    }
    return this.ribbon(positions, uvs, index, material)
  }

  /** A static collider box. */
  staticBox(center, halfSize, quaternion) {
    const body = new CANNON.Body({ mass: 0, material: this.staticMaterial, collisionFilterGroup: GROUP_STATIC, collisionFilterMask: STATIC_MASK })
    body.addShape(new CANNON.Box(new CANNON.Vec3(halfSize.x, halfSize.y, halfSize.z)))
    body.position.set(center.x, center.y, center.z)
    body.quaternion.copy(quaternion)
    this.world.addBody(body)
    this.bodies.push(body)
    return body
  }

  /** The collider for addStaticBox (scenery may override it to group or drop boxes; null means no box). */
  staticCollider(center, size, yaw) {
    return this.staticBox(center, size.clone().multiplyScalar(0.5), new CANNON.Quaternion().setFromEuler(0, yaw, 0))
  }

  addStaticBox(center, size, yaw, material, { visual = true, castShadow = true } = {}) {
    const body = this.staticCollider(center, size, yaw)
    if (body && visual && material) {
      const geo = new THREE.BoxGeometry(size.x, size.y, size.z)
      geo.rotateY(yaw)
      geo.translate(center.x, center.y, center.z)
      this.addGeometry(geo, material, castShadow)
    }
    return body
  }

  /**
   * Collects static geometry per material; finish() merges each bucket into one
   * draw call. Takes ownership of `geometry`. Everything is kept indexed (a
   * merge needs all or none), so shared vertices aren't expanded into copies.
   */
  addGeometry(geometry, material, castShadow = true) {
    const g = ensureIndexed(geometry)
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
    const { key, shadow } = this.bucket(g, material, castShadow)
    if (!this.mergeBuckets.has(key)) this.mergeBuckets.set(key, { material, castShadow: shadow, geometries: [] })
    this.mergeBuckets.get(key).geometries.push(g)
  }

  /** Which merged draw call a piece of geometry joins (scenery may override it to chunk by area). */
  bucket(geometry, material, castShadow) {
    return { key: material.uuid + (castShadow ? 's' : ''), shadow: castShadow }
  }

  /**
   * The first distance at or after `dist` where a car (about `margin` metres
   * long either way) doesn't overlap a ramp, so a respawned car isn't put
   * inside one and flipped.
   */
  clearOfRamps(dist, margin = 3, dir = 1) {
    for (const ramp of this.ramps) {
      const offset = this.offset(dist, ramp.dist)
      // dir -1: driving the loop backwards (Delivery Town), so clear of the ramp means before it.
      if (Math.abs(offset) < ramp.half + margin) return wrap(ramp.dist + dir * (ramp.half + margin), this.length)
    }
    return wrap(dist, this.length)
  }

  /** True if `dist` is within `pad` metres of a ramp or jump. */
  nearRamp(dist, pad) {
    return this.ramps.some((r) => Math.abs(this.offset(dist, r.dist)) < r.half + pad)
  }

  /** How much the road turns over `span` metres either side of `dist` (0 = straight). */
  bendAt(dist, span = 30) {
    const a = this.sampleAt(dist - span).t, b = this.sampleAt(dist + span).t
    return 1 - (a.x * b.x + a.z * b.z)
  }

  /** How far ahead a driver at `speed` m/s looks along the road. */
  lookAhead(speed) {
    return 9 + speed * 0.9
  }

  /** How sharply the road bends coming up for a driver at `dist` looking `look` metres ahead: decides the safe speed. */
  bendAhead(dist, look) {
    return this.bendAt(dist + look * 1.5, look * 0.5)
  }

  /**
   * The straightest stretch within 90 m of `dist` for something `half` metres
   * long either way, never on the start straight where the cars line up.
   */
  straightNear(dist, half = 0) {
    let best = dist, bestBend = Infinity
    if (Math.min(wrap(dist, this.length), this.length - wrap(dist, this.length)) < 70 + half) {
      throw new Error(`A ramp or jump at ${Math.round(dist)} m would be on the start straight; pick a spot at least ${Math.round(70 + half)} m from the start.`)
    }
    for (let d = dist - 90; d <= dist + 90; d += 5) {
      const fromStart = Math.min(wrap(d, this.length), this.length - wrap(d, this.length))
      if (fromStart < 70 + half) continue
      // Leave room after any ramp or jump already here, and round a side street's junction.
      if (this.nearRamp(d, half + 20) || this.nearSpur(d, half + 16)) continue
      const bend = this.bendAt(d, 30 + half)
      if (bend < bestBend) {
        bestBend = bend
        best = d
      }
    }
    return wrap(best, this.length)
  }

  /**
   * The exact point and direction of the road at `dist` (not snapped to a
   * sample). Ramp pieces are laid out along this straight line, so they meet
   * without steps; ramps only go on straight road.
   */
  frameAt(dist) {
    const u = wrap(dist, this.length) / this.length
    const p = this.curve.getPointAt(u)
    const t = this.curve.getTangentAt(u).setY(0).normalize()
    return { p, t, side: new THREE.Vector3(-t.z, 0, t.x), yaw: Math.atan2(t.x, t.z) }
  }

  /**
   * A tilted slab `along` metres from `frame` along the road: rises along the
   * road for `rise` > 0 (a take-off ramp), falls for `rise` < 0 (a landing).
   * `base` lifts its low end, for building curved ramps from several slabs.
   */
  slab(frame, along, { length, width, rise, lateral, material, base = 0 }) {
    const height = Math.abs(rise)
    const slope = Math.hypot(height, length)
    const center = frame.p.clone().addScaledVector(frame.t, along).addScaledVector(frame.side, lateral)
    const q = new CANNON.Quaternion().setFromEuler(-Math.atan2(rise, length), frame.yaw, 0, 'YXZ')
    const body = this.staticBox(new THREE.Vector3(center.x, base + height / 2 - 0.22, center.z), new THREE.Vector3(width / 2, 0.25, slope / 2), q)
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.5, slope), material)
    mesh.position.copy(body.position)
    mesh.quaternion.set(q.x, q.y, q.z, q.w)
    mesh.castShadow = mesh.receiveShadow = true
    this.group.add(mesh)
  }

  /** A flat block `along` metres from `frame`, its top `height` up. */
  table(frame, along, { length, width, height, lateral, material }) {
    const center = frame.p.clone().addScaledVector(frame.t, along).addScaledVector(frame.side, lateral)
    const q = new CANNON.Quaternion().setFromEuler(0, frame.yaw, 0)
    this.staticBox(new THREE.Vector3(center.x, height / 2, center.z), new THREE.Vector3(width / 2, height / 2, length / 2), q)
    const geo = new THREE.BoxGeometry(width, height, length)
    geo.rotateY(frame.yaw)
    geo.translate(center.x, height / 2, center.z)
    this.addGeometry(geo, material)
  }

  /**
   * A curved take-off ramp starting `along` metres from `frame`: three
   * segments, each steeper than the last (like a real kicker), so a car's nose
   * clears the start and the wheels roll on instead of the bumper catching it.
   */
  kicker(frame, along, { length, width, height, lateral, material }) {
    const part = length / 3
    let base = 0
    for (const share of [0.2, 0.35, 0.45]) {
      this.slab(frame, along + part / 2, { length: part, width, rise: height * share, lateral, material, base })
      base += height * share
      along += part
    }
  }

  /** A take-off ramp on the road; drive over it to fly. Moved to the straightest road nearby. */
  addRamp(dist, { length = 7, width = 5, height = 1.4, lateral = 0, material }) {
    dist = this.straightNear(dist, length / 2)
    this.kicker(this.frameAt(dist), -length / 2, { length, width, height, lateral, material })
    this.ramps.push({ dist, lateral, half: length / 2, width })
  }

  /**
   * A jump: a take-off ramp, a `gap` to fly over, and a landing ramp down.
   * The landing's near side slopes up too, with a flat top (a tabletop), so a
   * car that comes up short bumps onto it and drives on instead of being stuck
   * in the gap or beached on a crest. Calls `fill(dist, center, yaw, frame)`
   * for points along the gap, so a city can put something there to fly over
   * (and knock flying when you fall short). Returns where the jump ended up.
   */
  addJump(dist, { length = 8, height = 1.8, gap = 12, width = 5, lateral = 0, material, fill }) {
    // Gentle enough (about 14°) for a car that stopped on it to drive up.
    const face = height * 4
    const top = 4
    const total = length + gap + face + top + length * 1.4
    dist = this.straightNear(dist, total / 2)
    const frame = this.frameAt(dist)
    let along = -total / 2
    // The take-off ends a little lower than the landing: plenty of air, but cars come down on the landing.
    this.kicker(frame, along, { length, width, height: height * 0.8, lateral, material })
    along += length
    if (fill) {
      for (let d = along + 2; d < along + gap - 1; d += 2.5) {
        fill(dist + d, frame.p.clone().addScaledVector(frame.t, d).addScaledVector(frame.side, lateral), frame.yaw, frame)
      }
    }
    along += gap
    this.slab(frame, along + face / 2, { length: face, width, rise: height, lateral, material })
    along += face
    this.table(frame, along + top / 2, { length: top, width, height, lateral, material })
    along += top
    this.slab(frame, along + length * 0.7, { length: length * 1.4, width, rise: -height, lateral, material })
    // One entry for the whole jump: respawns land clear of it, and bots line up with it.
    this.ramps.push({ dist, lateral, half: total / 2, width })
    this.jumps.push({ lateral, takeoff: dist - total / 2 + length, lip: height * 0.8, gap, face, height })
    return dist
  }

  /** A glowing strip on the road that fires a car's turbo as it drives over. */
  addBoostPad(dist, { lateral = 0, length = 5, width = 3 } = {}) {
    dist = wrap(dist, this.length)
    if (this.nearRamp(dist, length)) {
      // Delivery Town moved a jump round a side street's junction; it has no boost pads to fire anyway.
      if (this.planned) return
      throw new Error(`A boost pad at ${Math.round(dist)} m would be under a ramp or jump.`)
    }
    const s = this.sampleAt(dist)
    const geo = new THREE.PlaneGeometry(width, length)
    geo.rotateX(-Math.PI / 2)
    geo.rotateY(this.alongAt(s))
    const c = s.p.clone().addScaledVector(s.side, lateral)
    geo.translate(c.x, 0.035, c.z)
    const mesh = new THREE.Mesh(geo, boostMaterial())
    this.group.add(mesh)
    this.boostPads.push({ dist, lateral, halfLength: length / 2, halfWidth: width / 2 })
  }

  /** Signed distance along the loop from `b` to `a`, the short way round. */
  offset(a, b) {
    return wrap(a - b + this.length / 2, this.length) - this.length / 2
  }

  /** The boost pad a car at this road position is on, if any. */
  boostPadAt(proj) {
    return this.boostPads.find(
      (pad) =>
        Math.abs(this.offset(proj.dist, pad.dist)) < pad.halfLength &&
        Math.abs(proj.lateral - pad.lateral) < pad.halfWidth,
    )
  }

  /** Knock-over props (cones, crates, snowballs). */
  addProp(mesh, shape, position, mass) {
    const body = new CANNON.Body({ mass, collisionFilterGroup: GROUP_PROP, collisionFilterMask: GROUP_STATIC | GROUP_CAR | GROUP_PROP | GROUP_DEBRIS, linearDamping: 0.1, angularDamping: 0.2, allowSleep: true, sleepSpeedLimit: 0.2 })
    body.addShape(shape)
    body.position.set(position.x, position.y, position.z)
    body.sleep()
    this.world.addBody(body)
    mesh.castShadow = true
    this.scene.add(mesh)
    this.props.push({ mesh, body })
    mesh.position.copy(position)
  }

  /** Walks along both sides placing lots of a given depth; the callback decorates each free lot. */
  lineSides({ offset, spacing, depth, sides = [-1, 1], startAt = 0, skip }, place) {
    for (const sign of sides) {
      for (let d = startAt; d < this.length; d += spacing()) {
        const s = this.sampleAt(d)
        const center = s.p.clone().addScaledVector(s.side, sign * (offset + depth / 2))
        // Keep lots clear of every part of the road, not just the nearest stretch.
        const clearance = this.distanceToRoad(center.x, center.z, 3)
        if (clearance < offset + depth / 2 - 0.5) continue
        if (skip?.(d, sign)) continue
        place({ center, yaw: this.alongAt(s), sign, dist: d, sample: s })
      }
    }
  }

  // --- Side streets (Delivery Town) ------------------------------------------

  /**
   * Plans Delivery Town's side streets before any scenery goes up: short dead
   * ends off the loop, each with a round turning place at its end where a house
   * can stand. Their points join the spatial hash, so the city's buildings,
   * terraces and trees keep clear of them exactly as they keep clear of the
   * road. Junctions go on straight road, away from the start and from each
   * other, on a side with open ground (no other stretch of road nearby).
   * Deterministic in `seed`, so friends in the same town get the same streets.
   */
  planSpurs({ seed, count = 2 }) {
    const r = rng((seed ^ 0x5b0e) >>> 0)
    const L = this.length
    const candidates = []
    for (let d = 0; d < L; d += 6) {
      if (Math.min(d, L - d) < 55 || this.bendAt(d, 16) > 0.025) continue
      for (const sign of [-1, 1]) if (this.spurClear(d, sign)) candidates.push({ d, sign })
    }
    // A fair shuffle: which junctions this drive gets is the seed's.
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
    }
    // A spare or two: a street that turns out to run into the sea or a river is dropped once the city is built (carveSpurs).
    this.wantSpurs = count
    for (const c of candidates) {
      if (this.spurs.length >= count + 3) break
      if (this.spurs.some((o) => Math.abs(this.offset(o.dist, c.d)) < L / 5)) continue
      this.spurs.push(this.makeSpur(c.d, c.sign))
    }
    for (const spur of this.spurs) for (const p of spur.points) this.gridAdd(p)
  }

  /** Is there open ground for a side street at `dist` on side `sign`: no other stretch of road near its lane or its turning place? */
  spurClear(dist, sign) {
    const f = this.frameAt(dist)
    const W = this.width
    const tests = []
    for (let l = W / 2 + 1; l <= W / 2 + SPUR.centre + SPUR.pad + 2; l += 2) tests.push([l, 0])
    for (const along of [-1, 1]) tests.push([W / 2 + SPUR.centre, along * (SPUR.pad + 1.5)])
    for (const [l, along] of tests) {
      const x = f.p.x + f.side.x * sign * l + f.t.x * along, z = f.p.z + f.side.z * sign * l + f.t.z * along
      for (const s of this.samples) {
        const near = Math.abs(this.offset(s.dist, dist)) <= 25
        // Beside its own junction the street simply leaves the road; anywhere else the road must stay well away.
        const need = near ? Math.min(l - 1.5, W / 2 + 6) : W / 2 + 8
        if ((s.p.x - x) ** 2 + (s.p.z - z) ** 2 < need * need) return false
      }
    }
    return true
  }

  makeSpur(dist, sign) {
    const f = this.frameAt(dist)
    const W = this.width
    const u = f.side.clone().multiplyScalar(sign)
    const at = (l, along = 0) => f.p.clone().addScaledVector(u, l).addScaledVector(f.t, along)
    const centre = at(W / 2 + SPUR.centre)
    const points = []
    for (let l = W / 2; l <= W / 2 + SPUR.centre; l += 2) points.push(at(l))
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      points.push(centre.clone().addScaledVector(u, Math.cos(a) * SPUR.pad).addScaledVector(f.t, Math.sin(a) * SPUR.pad))
    }
    return { dist: wrap(dist, this.length), sign, origin: f.p.clone(), t: f.t.clone(), u, mouth: at(W / 2), centre, door: at(W / 2 + SPUR.centre + SPUR.door), points }
  }

  /** True if `dist` is within `pad` metres of a side street's junction. */
  nearSpur(dist, pad) {
    return this.spurs.some((s) => Math.abs(this.offset(dist, s.dist)) < pad + SPUR.lane / 2)
  }

  /**
   * Once the city is built: clears whatever still stands in a side street's
   * way (a shrine, a crate, a lamp: things placed without asking the road),
   * drops a street that would run into something big (the sea, a river, a
   * jump's landing), and lays the street and its turning place in the city's
   * own road surface.
   */
  carveSpurs() {
    const W = this.width
    const box = new THREE.Box3()
    const point = new THREE.Vector3()
    const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
    const edge = (x, z, a, b) => (x - b.x) * (a.z - b.z) - (a.x - b.x) * (z - b.z)
    const inTriangle = (x, z, a, b, c) => {
      const d1 = edge(x, z, a, b), d2 = edge(x, z, b, c), d3 = edge(x, z, c, a)
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
    }
    const extent = (b) => Math.max(b.max.x - b.min.x, b.max.z - b.min.z)
    const kept = []
    for (const spur of this.spurs) {
      // Enough streets already: this spare stays open ground.
      const spare = kept.length >= this.wantSpurs
      const zone = [] // [x, z, radius]: the lane, the turning place and the house's sign behind it
      for (let l = W / 2 + 1; l <= W / 2 + SPUR.centre - 4; l += 2) {
        const p = spur.origin.clone().addScaledVector(spur.u, l)
        zone.push([p.x, p.z, SPUR.lane / 2 + 0.8])
      }
      zone.push([spur.centre.x, spur.centre.z, SPUR.pad + 1])
      const back = spur.origin.clone().addScaledVector(spur.u, W / 2 + SPUR.centre + SPUR.pad + 1.5)
      zone.push([back.x, back.z, 2.5])
      const inZone = (x, z) => zone.some(([cx, cz, rad]) => (x - cx) ** 2 + (z - cz) ** 2 < rad * rad)
      const touches = (b) => zone.some(([cx, cz, rad]) => Math.max(b.min.x - cx, 0, cx - b.max.x) ** 2 + Math.max(b.min.z - cz, 0, cz - b.max.z) ** 2 < rad * rad)
      // Something big in the way: any of its corners inside the street (a mountain, a row of flags), or a flat sheet over it (water).
      const big = (b, geometry, matrix) => {
        const positions = geometry.attributes.position
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i)
          if (matrix) point.applyMatrix4(matrix)
          if (inZone(point.x, point.z)) return true
        }
        if (b.max.y - b.min.y > 1.5) return false
        const index = geometry.index
        const n = index ? index.count : positions.count
        for (let i = 0; i + 2 < n; i += 3) {
          tri.forEach((v, k) => {
            v.fromBufferAttribute(positions, index ? index.getX(i + k) : i + k)
            if (matrix) v.applyMatrix4(matrix)
          })
          if (zone.some(([x, z]) => inTriangle(x, z, ...tri))) return true
        }
        return false
      }
      let ok = !spare && !this.ramps.some((rp) => Math.abs(this.offset(spur.dist, rp.dist)) < rp.half + 16)
      const children = [], pieces = []
      for (const child of this.group.children) {
        if (!ok) break
        if (child.userData.surface || child.isInstancedMesh) continue
        box.setFromObject(child)
        if (box.isEmpty() || !touches(box) || extent(box) > 1000) continue
        if (extent(box) <= 40) children.push(child)
        else child.traverse((o) => { if (o.isMesh && big(box, o.geometry, o.matrixWorld)) ok = false })
      }
      for (const bucket of this.mergeBuckets.values()) {
        if (!ok) break
        for (const g of bucket.geometries) {
          if (!g.boundingBox) g.computeBoundingBox()
          if (!touches(g.boundingBox)) continue
          if (extent(g.boundingBox) <= 40) pieces.push([bucket, g])
          else if (big(g.boundingBox, g)) ok = false
        }
      }
      if (!ok) {
        for (const p of spur.points) {
          const list = this.grid.get(this.key(p.x, p.z))
          list?.splice(list.indexOf(p), 1)
        }
        continue
      }
      for (const child of children) child.removeFromParent()
      for (const [bucket, g] of pieces) {
        g.dispose()
        bucket.geometries.splice(bucket.geometries.indexOf(g), 1)
      }
      for (let i = this.props.length - 1; i >= 0; i--) {
        const { mesh, body } = this.props[i]
        if (!inZone(body.position.x, body.position.z)) continue
        this.world.removeBody(body)
        mesh.removeFromParent()
        this.props.splice(i, 1)
      }
      for (const body of this.bodies) {
        const gone = body.shapes.filter((shape, k) => inZone(body.position.x + body.shapeOffsets[k].x, body.position.z + body.shapeOffsets[k].z))
        for (const shape of gone) body.removeShape(shape)
      }
      kept.push(spur)
    }
    this.spurs = kept
    if (this.roadMaterial) for (const spur of kept) this.buildSpur(spur)
  }

  /** A side street in the road's own surface: a lane off the kerb (lifted over any pavement) and a round turning place. */
  buildSpur(spur) {
    const W = this.width
    const half = SPUR.lane / 2
    const from = W / 2 - 0.4, to = W / 2 + SPUR.centre - SPUR.pad + 1
    const positions = [], uvs = [], index = []
    // Over the pavement at the kerb, then down to the ground.
    const lift = (l) => (l < W / 2 + 4.6 ? 0.13 : l > W / 2 + 6.6 ? 0.04 : 0.13 - ((l - W / 2 - 4.6) / 2) * 0.09)
    let rows = 0
    for (let l = from; l <= to + 0.01; l += 1, rows++) {
      const c = spur.origin.clone().addScaledVector(spur.u, l)
      for (const side of [-1, 1]) {
        const p = c.clone().addScaledVector(spur.t, side * half)
        positions.push(p.x, lift(l), p.z)
      }
      const v = (l - from) / (W * 1.2)
      uvs.push(0, v, 1, v)
    }
    for (let i = 0; i < rows - 1; i++) {
      const a = i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    // Face up whichever way round the street leaves the road.
    const ax = positions[3] - positions[0], az = positions[5] - positions[2]
    const bx = positions[6] - positions[0], bz = positions[8] - positions[2]
    if (az * bx - ax * bz < 0) for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]]
    this.ribbon(positions, uvs, index, this.roadMaterial)
    const pad = new THREE.CircleGeometry(SPUR.pad, 36)
    pad.rotateX(-Math.PI / 2)
    const pos = pad.attributes.position, uv = pad.attributes.uv
    // A plain strip of the road texture (between the edge and the centre lines), in metres like the road.
    for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.14 + (0.14 * (pos.getX(i) + SPUR.pad)) / (2 * SPUR.pad), pos.getZ(i) / (W * 1.2))
    pad.translate(spur.centre.x, 0.045, spur.centre.z)
    const mesh = new THREE.Mesh(pad, this.roadMaterial)
    mesh.receiveShadow = true
    mesh.userData.surface = true
    this.group.add(mesh)
  }

  finish() {
    if (this.spurs.length) this.carveSpurs()
    for (const { material, castShadow, geometries } of this.mergeBuckets.values()) {
      // A side street may have cleared a whole bucket away.
      if (!geometries.length) continue
      const merged = mergeGeometries(geometries, false)
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = castShadow
      mesh.receiveShadow = true
      this.group.add(mesh)
    }
    this.mergeBuckets.clear()
  }

  /** Runs `fn(dt, time)` every frame of the race (see update). */
  animate(fn) {
    this.animators.push(fn)
  }

  /** Per frame: knocked props follow their bodies and the scenery moves. `dt` is game time, so it all follows slow motion. */
  update(dt) {
    for (const p of this.props) {
      if (p.body.sleepState === CANNON.Body.SLEEPING) continue
      p.mesh.position.copy(p.body.position)
      p.mesh.quaternion.copy(p.body.quaternion)
    }
    this.time += dt
    for (const fn of this.animators) fn(dt, this.time)
  }

  /**
   * Removes the city from the world and frees its geometry (a new race builds
   * a fresh one). Materials, textures and geometry marked `userData.shared`
   * are reused across races, so they stay.
   */
  dispose() {
    for (const b of this.bodies) this.world.removeBody(b)
    for (const p of this.props) {
      this.world.removeBody(p.body)
      p.mesh.removeFromParent()
    }
    this.group.removeFromParent()
    const free = (o) => o.isMesh && !o.geometry.userData.shared && o.geometry.dispose()
    this.group.traverse(free)
    for (const p of this.props) p.mesh.traverse(free)
  }

  /**
   * Where a car is relative to a point placed with frameAt(dist) + side * lateral:
   * metres along the road and across it. Exact (not snapped to samples).
   * Pass `out` to reuse an object (it runs for every pickup near every car).
   */
  localTo(pos, item, out = {}) {
    const dx = pos.x - item.x, dz = pos.z - item.z
    out.along = dx * item.tx + dz * item.tz
    out.across = dx * -item.tz + dz * item.tx
    return out
  }
}
