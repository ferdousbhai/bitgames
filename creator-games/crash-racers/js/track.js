import * as THREE from 'three'
import * as CANNON from 'cannon'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GROUP_CAR, GROUP_DEBRIS, GROUP_PROP, GROUP_STATIC, STATIC_MASK, rng, wrap } from './util.js'

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

  addStaticBox(center, size, yaw, material, { visual = true, castShadow = true } = {}) {
    const body = this.staticBox(center, size.clone().multiplyScalar(0.5), new CANNON.Quaternion().setFromEuler(0, yaw, 0))
    if (visual && material) {
      const geo = new THREE.BoxGeometry(size.x, size.y, size.z)
      geo.rotateY(yaw)
      geo.translate(center.x, center.y, center.z)
      this.addGeometry(geo, material, castShadow)
    }
    return body
  }

  /** Collects static geometry per material; finish() merges each bucket into one draw call. */
  addGeometry(geometry, material, castShadow = true) {
    const key = material.uuid + (castShadow ? 's' : '')
    if (!this.mergeBuckets.has(key)) this.mergeBuckets.set(key, { material, castShadow, geometries: [] })
    const g = geometry.index ? geometry.toNonIndexed() : geometry
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
    this.mergeBuckets.get(key).geometries.push(g)
  }

  /** Adds a copy of an object's meshes (e.g. a Blender prop) as static decoration. */
  addObject(object, position, yaw, scale = 1, castShadow = true) {
    const holder = new THREE.Object3D()
    holder.position.copy(position)
    holder.rotation.y = yaw
    holder.scale.setScalar(scale)
    holder.updateMatrixWorld(true)
    object.updateMatrixWorld(true)
    object.traverse((o) => {
      if (!o.isMesh) return
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld).applyMatrix4(holder.matrixWorld)
      this.addGeometry(g, o.material, castShadow)
    })
  }

  /** How much the road turns over `span` metres either side of `dist` (0 = straight). */
  bendAt(dist, span = 30) {
    const a = this.sampleAt(dist - span).t, b = this.sampleAt(dist + span).t
    return 1 - (a.x * b.x + a.z * b.z)
  }

  /** A slanted ramp on the road; drive over it to fly. Moved to the straightest road nearby. */
  addRamp(dist, { length = 7, width = 5, height = 1.4, lateral = 0, material }) {
    let best = dist, bestBend = Infinity
    for (let d = dist - 90; d <= dist + 90; d += 5) {
      // Never on the start straight, where the cars line up.
      const fromStart = Math.min(wrap(d, this.length), this.length - wrap(d, this.length))
      if (fromStart < 70) continue
      const bend = this.bendAt(d)
      if (bend < bestBend) {
        bestBend = bend
        best = d
      }
    }
    dist = wrap(best, this.length)
    const s = this.sampleAt(dist)
    const yaw = this.alongAt(s)
    const angle = Math.atan2(height, length)
    const slope = Math.hypot(height, length)
    const center = s.p.clone().addScaledVector(s.side, lateral)
    this.ramps.push({ dist, lateral })
    const q = new CANNON.Quaternion().setFromEuler(-angle, yaw, 0, 'YXZ')
    const body = this.staticBox(new THREE.Vector3(center.x, height / 2 - 0.22, center.z), new THREE.Vector3(width / 2, 0.25, slope / 2), q)
    const geo = new THREE.BoxGeometry(width, 0.5, slope)
    const mesh = new THREE.Mesh(geo, material)
    mesh.position.copy(body.position)
    mesh.quaternion.set(q.x, q.y, q.z, q.w)
    mesh.castShadow = mesh.receiveShadow = true
    this.group.add(mesh)
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

  update() {
    for (const p of this.props) {
      if (p.body.sleepState === CANNON.Body.SLEEPING) continue
      p.mesh.position.copy(p.body.position)
      p.mesh.quaternion.copy(p.body.quaternion)
    }
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
}
