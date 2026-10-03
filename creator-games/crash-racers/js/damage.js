import * as THREE from 'three'
import * as CANNON from 'cannon'
import { GROUP_CAR, GROUP_DEBRIS, GROUP_PROP, GROUP_STATIC, canvasTexture, clamp, noise3, rng } from './util.js'

/**
 * Realistic-ish soft-body damage without a soft-body solver:
 * - Every visible panel is a dense mesh. An impact pushes the vertices around
 *   the contact point inward along the impact direction, with a smooth falloff
 *   and position-based noise so dents look crumpled rather than spherical.
 * - Parts have health. They loosen first (bumper sags, door swings open, hood
 *   pops up, mirror droops), then tear off and become physics debris.
 * - Glass cracks, then shatters into shards. Lights break.
 * - Wheels bend (wobble and pull), then come off; the corner drops and scrapes.
 * All randomness is seeded per impact, so every device shows the same wreck.
 */

const MAX_DENT = 0.7
const crackTexture = canvasTexture(256, 256, (g) => {
  g.clearRect(0, 0, 256, 256)
  g.strokeStyle = 'rgba(255,255,255,0.85)'
  g.lineWidth = 1.4
  const r = rng(7)
  for (let k = 0; k < 3; k++) {
    const cx = 60 + r() * 136, cy = 60 + r() * 136
    for (let i = 0; i < 14; i++) {
      let x = cx, y = cy
      const a = (i / 14) * Math.PI * 2 + r() * 0.3
      g.beginPath()
      g.moveTo(x, y)
      for (let s = 0; s < 6; s++) {
        x += Math.cos(a + (r() - 0.5) * 0.6) * (10 + r() * 18)
        y += Math.sin(a + (r() - 0.5) * 0.6) * (10 + r() * 18)
        g.lineTo(x, y)
      }
      g.stroke()
    }
    for (let ring = 1; ring < 4; ring++) {
      g.beginPath()
      g.arc(cx, cy, ring * 14 + r() * 6, 0, Math.PI * 2)
      g.stroke()
    }
  }
})

/** How each named part reacts once loose. */
const PART_KINDS = {
  bumper_f: 'bumper', bumper_r: 'bumper',
  door_l: 'door', door_r: 'door',
  hood: 'hood',
  mirror_l: 'mirror', mirror_r: 'mirror',
  extra_spoiler: 'extra', extra_sign: 'extra', extra_lightbar: 'extra', extra_rack: 'extra', extra_spare: 'extra',
  extra_plate_f: 'extra', extra_plate_r: 'extra',
}

/**
 * A window or light: its meshes, root-space centre and size, and its own copies
 * of the template's materials so this car can crack or dim them alone.
 */
function piece(object, rootInv) {
  const meshes = []
  object.traverse((o) => o.isMesh && meshes.push(o))
  const materials = meshes.map((m) => (m.material = m.material.clone()))
  const box = new THREE.Box3().setFromObject(object)
  return {
    object, meshes, materials,
    center: box.getCenter(new THREE.Vector3()).applyMatrix4(rootInv),
    radius: box.getSize(new THREE.Vector3()).length() / 2,
  }
}

export class Damage {
  /**
   * @param car the Car (root, body, vehicle, wheels)
   * @param env { scene, world, effects, audio, debris }
   */
  constructor(car, env) {
    this.car = car
    this.env = env
    this.root = car.root
    /** Accumulated damage: 0 (new) to 1 (wrecked). */
    this.level = 0
    this.deformables = []
    this.parts = []
    this.glass = []
    this.lights = []
    this.root.updateMatrixWorld(true)
    const rootInv = this.root.matrixWorld.clone().invert()

    this.root.traverse((obj) => {
      if (!obj.isMesh) return
      obj.geometry.computeBoundingSphere()
      // Root-space bounds, so an impact can skip meshes it can't reach.
      const bounds = obj.geometry.boundingSphere.clone().applyMatrix4(rootInv.clone().multiply(obj.matrixWorld))
      this.deformables.push({ mesh: obj, original: obj.geometry.attributes.position.array.slice(), bounds })
    })

    for (const child of this.root.children) {
      const name = child.name
      const kind = PART_KINDS[name]
      if (kind) {
        const box = new THREE.Box3().setFromObject(child)
        const center = box.getCenter(new THREE.Vector3()).applyMatrix4(rootInv)
        this.parts.push({
          name, kind, object: child, health: 1, state: 'ok',
          rest: { position: child.position.clone(), quaternion: child.quaternion.clone() },
          center, radius: box.getSize(new THREE.Vector3()).length() / 2,
          swing: 0, swingVel: 0, angle: 0, side: name.endsWith('_l') ? -1 : 1, body: null,
        })
      } else if (name.startsWith('glass')) {
        this.glass.push({ ...piece(child, rootInv), state: 'ok' })
      } else if (name.startsWith('light')) {
        this.lights.push({ ...piece(child, rootInv), broken: false })
      }
    }
    this.crackedGlass = new THREE.MeshStandardMaterial({ color: '#cfe6f2', map: crackTexture, transparent: true, opacity: 0.75, roughness: 0.2, metalness: 0.1 })
    this.smokeTimer = 0
  }

  /**
   * Applies an impact. Point and direction are in the car's local space; the
   * direction points into the car. Speed is the closing speed in m/s.
   */
  impact(point, dir, speed, seed = 1) {
    if (speed < 2.5) return
    const r = rng(seed)
    const force = speed - 2.5
    const radius = clamp(0.4 + force * 0.05, 0.4, 1.4)
    const depth = clamp(force * 0.042, 0, 0.6)
    this.level = clamp(this.level + force * force * 0.0009, 0, 1)
    const dirty = new Set()
    this.dent(point, dir, radius, depth, seed, dirty)
    // Big hits buckle the panels around the impact too, so the crush is ragged, not round.
    if (force > 10) {
      for (let k = 0; k < 3; k++) {
        const jitter = new THREE.Vector3((r() - 0.5) * radius * 1.4, (r() - 0.5) * radius * 0.8, (r() - 0.5) * radius * 1.4)
        const sideDir = dir.clone().add(new THREE.Vector3((r() - 0.5) * 0.8, (r() - 0.5) * 0.6, (r() - 0.5) * 0.8)).normalize()
        this.dent(point.clone().add(jitter), sideDir, radius * 0.45, depth * 0.45, seed + k + 1, dirty)
      }
    }
    for (const geometry of dirty) {
      geometry.attributes.position.needsUpdate = true
      geometry.computeVertexNormals()
      geometry.computeBoundingSphere()
    }

    for (const part of this.parts) {
      if (part.state === 'gone') continue
      const d = part.center.distanceTo(point)
      const reach = radius + part.radius
      if (d > reach) continue
      part.health -= (force / 12) * (1 - d / reach) * (0.7 + r() * 0.6)
      const tearOff = part.health <= 0 || (force > 14 && d < part.radius + 0.3 && r() < 0.6)
      if (tearOff) this.detach(part, dir, speed, r)
      else if (part.health < 0.65 && part.state === 'ok') this.loosen(part, r)
    }
    // Hard hits flex the whole shell: the window facing the impact goes too.
    if (force > 16) {
      const facing = Math.abs(dir.z) > Math.abs(dir.x) ? (dir.z > 0 ? 'glass_f' : 'glass_r') : dir.x > 0 ? 'glass_l' : 'glass_r_side'
      const g = this.glass.find((g) => g.object.name === facing)
      if (g && g.state !== 'gone') force > 20 ? this.shatterGlass(g, dir) : this.crackGlass(g)
    }
    for (const g of this.glass) {
      if (g.state === 'gone') continue
      const d = g.center.distanceTo(point)
      if (d > radius + g.radius * 0.8) continue
      if (force > 12 || (g.state === 'cracked' && force > 5)) this.shatterGlass(g, dir)
      else if (force > 3 && g.state === 'ok') this.crackGlass(g)
    }
    for (const l of this.lights) {
      if (!l.broken && l.center.distanceTo(point) < radius + 0.3 && force > 3) {
        l.broken = true
        l.materials.forEach((m) => {
          m.emissiveIntensity = 0
          m.color.multiplyScalar(0.35)
        })
        this.env.audio.glass(0.4)
      }
    }
    this.car.wheels.forEach((wheel, i) => {
      if (wheel.state === 'gone') return
      const d = wheel.center.distanceTo(point)
      if (d > radius + 0.5) return
      wheel.health -= (force / 20) * (1 - d / (radius + 0.5))
      if (wheel.health <= 0 || (force > 20 && d < 0.6 && r() < 0.45)) this.detachWheel(i, dir, speed)
      else if (wheel.health < 0.6) wheel.bent = Math.min(0.35, (0.6 - wheel.health) * 0.6) * (r() < 0.5 ? -1 : 1)
    })
  }

  /** Pushes vertices within `radius` of `point` along `dir`; adds the geometries it changed to `dirty`. */
  dent(point, dir, radius, depth, seed, dirty) {
    const inv = new THREE.Matrix4()
    const rootInv = this.root.matrixWorld.clone().invert()
    const p = new THREE.Vector3()
    const ldir = new THREE.Vector3()
    const v = new THREE.Vector3()
    const o = new THREE.Vector3()
    const wrinkle = 0.35 + (seed % 7) * 0.05
    for (const def of this.deformables) {
      const mesh = def.mesh
      // Out of reach (with slack for dents and loose parts), or torn off.
      if (def.bounds.center.distanceTo(point) > radius + def.bounds.radius + MAX_DENT) continue
      if (!this.isOnCar(mesh)) continue
      // root space -> mesh space
      inv.multiplyMatrices(rootInv, mesh.matrixWorld).invert()
      p.copy(point).applyMatrix4(inv)
      ldir.copy(dir).transformDirection(inv)
      const pos = mesh.geometry.attributes.position
      const arr = pos.array
      const r2 = radius * radius
      for (let i = 0; i < arr.length; i += 3) {
        const dx = arr[i] - p.x, dy = arr[i + 1] - p.y, dz = arr[i + 2] - p.z
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 > r2) continue
        const t = 1 - Math.sqrt(d2) / radius
        const n = noise3(arr[i] * 6, arr[i + 1] * 6, arr[i + 2] * 6)
        let amount = depth * t * t * (0.75 + 0.45 * n)
        // Limit how far any vertex can travel from where it started.
        o.set(def.original[i], def.original[i + 1], def.original[i + 2])
        v.set(arr[i], arr[i + 1], arr[i + 2])
        const moved = v.distanceTo(o)
        amount = Math.min(amount, Math.max(0, MAX_DENT - moved))
        if (amount <= 0) continue
        arr[i] += ldir.x * amount + n * amount * wrinkle * 0.6
        arr[i + 1] += ldir.y * amount + noise3(arr[i] * 9, 3, arr[i + 2] * 9) * amount * wrinkle * 0.5
        arr[i + 2] += ldir.z * amount - n * amount * wrinkle * 0.6
        dirty.add(mesh.geometry)
      }
    }
  }

  isOnCar(obj) {
    for (let o = obj; o; o = o.parent) if (o === this.root) return true
    return false
  }

  loosen(part, r) {
    part.state = 'loose'
    const o = part.object
    if (part.kind === 'door') part.swing = part.side * (0.35 + r() * 0.5)
    else if (part.kind === 'hood') part.swing = -(0.15 + r() * 0.25)
    else if (part.kind === 'bumper') {
      part.swing = (r() < 0.5 ? -1 : 1) * (0.12 + r() * 0.15)
      o.position.y -= 0.06
    } else if (part.kind === 'mirror') part.swing = part.side * 0.9
    this.env.audio.clunk(0.5)
  }

  /** World-space direction pointing out of the car, away from a hit coming from `dir`. */
  outward(dir) {
    return new THREE.Vector3().copy(dir).negate().transformDirection(this.root.matrixWorld)
  }

  detach(part, dir, speed, r) {
    if (part.state === 'gone') return
    part.state = 'gone'
    const { velocity, angularVelocity } = this.car.body
    const pushOut = this.outward(dir)
    const vel = new THREE.Vector3(velocity.x, velocity.y, velocity.z)
      .multiplyScalar(0.8)
      .addScaledVector(pushOut, 1.5 + speed * 0.12)
      .add(new THREE.Vector3((r() - 0.5) * 3, 1.5 + r() * 3, (r() - 0.5) * 3))
    part.body = this.env.debris.throw(part.object, vel, new THREE.Vector3(angularVelocity.x + (r() - 0.5) * 12, (r() - 0.5) * 12, (r() - 0.5) * 12))
    this.env.audio.clunk(1)
  }

  detachWheel(index, dir, speed) {
    const wheel = this.car.wheels[index]
    if (wheel.state === 'gone') return
    wheel.state = 'gone'
    this.car.dropWheel(index)
    const { velocity } = this.car.body
    const pushOut = this.outward(dir)
    const vel = new THREE.Vector3(velocity.x, velocity.y, velocity.z).addScaledVector(pushOut, 2 + speed * 0.15).add(new THREE.Vector3(0, 2, 0))
    wheel.debris = this.env.debris.throw(wheel.object, vel, new THREE.Vector3((Math.random() - 0.5) * 20, 0, 0), { wheel: wheel.radius })
    this.env.audio.clunk(1)
  }

  crackGlass(g) {
    g.state = 'cracked'
    g.meshes.forEach((m) => (m.material = this.crackedGlass))
    this.env.audio.glass(0.5)
  }

  shatterGlass(g, dir) {
    g.state = 'gone'
    g.object.visible = false
    const world = g.center.clone().applyMatrix4(this.root.matrixWorld)
    const v = this.car.body.velocity
    this.env.effects.shatter(world, new THREE.Vector3(v.x, v.y, v.z).multiplyScalar(0.7).add(this.outward(dir).multiplyScalar(2)))
    this.env.audio.glass(1)
  }

  /** Loose parts swing on their hinges; damaged engines smoke. */
  update(dt, accel) {
    for (const part of this.parts) {
      if (part.state !== 'loose') continue
      const o = part.object
      // A spring toward the loose angle, kicked around by the car's acceleration.
      const kick = part.kind === 'door' ? -accel.z * 0.03 * part.side : part.kind === 'hood' ? accel.z * 0.01 : accel.x * 0.02
      part.swingVel += ((part.swing - part.angle) * 30 + kick * 20) * dt
      part.swingVel *= 1 - Math.min(1, dt * 4)
      part.angle = part.angle + part.swingVel * dt
      o.quaternion.copy(part.rest.quaternion)
      if (part.kind === 'door') o.rotateY(part.angle)
      else if (part.kind === 'hood') o.rotateX(part.angle)
      else o.rotateZ(part.angle) // bumpers sag, mirrors droop
    }
    if (this.level > 0.45) {
      this.smokeTimer -= dt
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.2 - this.level * 0.1
        const front = this.car.dims.length / 2 - 0.6
        const p = new THREE.Vector3(0, this.car.dims.hoodHeight + 0.1, -front).applyMatrix4(this.root.matrixWorld)
        const v = this.car.body.velocity
        const dark = clamp((this.level - 0.45) * 1.8, 0, 1)
        const shade = Math.round(220 - dark * 190)
        this.env.effects.puff(p, new THREE.Vector3(v.x * 0.3, 1.2 + Math.random(), v.z * 0.3), {
          color: `rgb(${shade},${shade},${shade})`,
          size: 0.3 + this.level * 0.7,
          life: 1.2 + this.level,
        })
        if (this.level > 0.85) this.env.effects.flame(p)
      }
    }
  }

  dispose() {
    for (const m of [...this.glass, ...this.lights].flatMap((p) => p.materials)) m.dispose()
    this.crackedGlass.dispose()
  }

  repair() {
    this.level = 0
    for (const def of this.deformables) {
      def.mesh.geometry.attributes.position.array.set(def.original)
      def.mesh.geometry.attributes.position.needsUpdate = true
      def.mesh.geometry.computeVertexNormals()
    }
    for (const part of this.parts) {
      if (part.state === 'gone') this.env.debris.recall(part.object, part.body, this.root)
      part.state = 'ok'
      part.health = 1
      part.angle = 0
      part.swingVel = 0
      part.body = null
      part.object.position.copy(part.rest.position)
      part.object.quaternion.copy(part.rest.quaternion)
    }
    for (const g of this.glass) {
      g.state = 'ok'
      g.object.visible = true
      g.meshes.forEach((m, i) => (m.material = g.materials[i]))
    }
    for (const l of this.lights) {
      if (l.broken) l.materials.forEach((m) => {
        m.emissiveIntensity = 1
        m.color.multiplyScalar(1 / 0.35)
      })
      l.broken = false
    }
    this.car.wheels.forEach((wheel, i) => {
      if (wheel.state === 'gone') this.env.debris.recall(wheel.object, wheel.debris, this.root)
      wheel.state = 'ok'
      wheel.health = 1
      wheel.bent = 0
      wheel.debris = null
      this.car.restoreWheel(i)
    })
  }
}

/** Torn-off parts as physics bodies. Old pieces fade away to keep the frame rate up. */
export class Debris {
  constructor(scene, world, max = 40) {
    this.scene = scene
    this.world = world
    this.max = max
    this.items = []
  }

  throw(object, velocity, angularVelocity, { wheel } = {}) {
    object.updateMatrixWorld(true)
    const box = new THREE.Box3()
    // Bounds in the object's own space
    const inv = object.matrixWorld.clone().invert()
    object.traverse((o) => {
      if (!o.isMesh) return
      o.geometry.computeBoundingBox()
      box.union(o.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(o.matrixWorld)))
    })
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    this.scene.attach(object)
    const body = new CANNON.Body({
      mass: clamp(size.x * size.y * size.z * 120, 4, 40),
      linearDamping: 0.05,
      angularDamping: 0.15,
      collisionFilterGroup: GROUP_DEBRIS,
      collisionFilterMask: GROUP_STATIC | GROUP_CAR | GROUP_DEBRIS | GROUP_PROP,
    })
    if (wheel) {
      const shape = new CANNON.Cylinder(wheel, wheel, 0.26, 12)
      body.addShape(shape, new CANNON.Vec3(center.x, center.y, center.z), new CANNON.Quaternion().setFromEuler(0, 0, Math.PI / 2))
    } else {
      body.addShape(new CANNON.Box(new CANNON.Vec3(Math.max(0.03, size.x / 2), Math.max(0.03, size.y / 2), Math.max(0.03, size.z / 2))), new CANNON.Vec3(center.x, center.y, center.z))
    }
    body.position.copy(object.position)
    body.quaternion.copy(object.quaternion)
    body.velocity.set(velocity.x, velocity.y, velocity.z)
    body.angularVelocity.set(angularVelocity.x, angularVelocity.y, angularVelocity.z)
    this.world.addBody(body)
    this.items.push({ object, body, age: 0 })
    if (this.items.length > this.max) this.remove(this.items[0])
    return body
  }

  /** Puts a part back on its car (used by repair). */
  recall(object, body, root) {
    const item = this.items.find((it) => it.object === object)
    if (item) {
      this.world.removeBody(item.body)
      this.items.splice(this.items.indexOf(item), 1)
    } else if (body) this.world.removeBody(body)
    object.visible = true
    object.scale.setScalar(1)
    root.add(object)
  }

  remove(item) {
    this.world.removeBody(item.body)
    item.object.removeFromParent()
    this.items.splice(this.items.indexOf(item), 1)
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]
      item.age += dt
      item.object.position.copy(item.body.position)
      item.object.quaternion.copy(item.body.quaternion)
      if (item.age > 40) {
        const s = Math.max(0, 1 - (item.age - 40) / 2)
        item.object.scale.setScalar(s)
        if (s === 0) this.remove(item)
      }
    }
  }

  clear() {
    while (this.items.length) this.remove(this.items[0])
  }
}
