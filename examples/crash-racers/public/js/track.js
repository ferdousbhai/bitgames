import * as THREE from 'three'
import * as CANNON from 'cannon'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GROUP_CAR, GROUP_DEBRIS, GROUP_PROP, GROUP_STATIC, STATIC_MASK, ensureIndexed, rng, wrap } from './util.js'

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
    this.samples.forEach((s, i) => {
      const key = this.key(s.p.x, s.p.z)
      if (!this.grid.has(key)) this.grid.set(key, [])
      this.grid.get(key).push(i)
    })
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
        for (const i of list) {
          const p = this.samples[i].p
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
  clearOfRamps(dist, margin = 3) {
    for (const ramp of this.ramps) {
      const offset = this.offset(dist, ramp.dist)
      if (Math.abs(offset) < ramp.half + margin) return wrap(ramp.dist + ramp.half + margin, this.length)
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
      // Leave room after any ramp or jump already here.
      if (this.nearRamp(d, half + 20)) continue
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

  finish() {
    for (const { material, castShadow, geometries } of this.mergeBuckets.values()) {
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
