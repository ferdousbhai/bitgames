import * as THREE from 'three'
import * as CANNON from 'cannon'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Damage, separable } from './damage.js'
import { GROUP_CAR, GROUP_DEBRIS, GROUP_PROP, GROUP_STATIC, clamp, damp, ensureIndexed, harmless, solidColor } from './util.js'

// Scratch objects for snapshot playback, which runs every physics step.
const _pos = new THREE.Vector3(), _pos2 = new THREE.Vector3()
const _quat = new THREE.Quaternion(), _quat2 = new THREE.Quaternion()

export const CAR_MODELS = {
  rocket: { name: 'Rocket', emoji: '🚀', power: 1.12, grip: 1.1, colour: '#e8312f' },
  sunny: { name: 'Sunny', emoji: '😎', power: 1.0, grip: 1.0, colour: '#ffd21f' },
  bubbles: { name: 'Bubbles', emoji: '🫧', power: 0.95, grip: 1.05, colour: '#6ec3f4' },
  bruno: { name: 'Bruno Truck', emoji: '🛻', power: 1.05, grip: 0.95, colour: '#ff8a1c' },
  pickle: { name: 'Pickle', emoji: '🥒', power: 0.95, grip: 0.95, colour: '#4cb944' },
  siren: { name: 'Siren', emoji: '🚓', power: 1.05, grip: 1.0, colour: '#262a3b' },
}

const COM_HEIGHT = 0.55
/** Seconds upside down after which a car with no wheel on the ground is lying on its roof, not flying. */
const ROOF_NOT_AIR = 1
/** Milliseconds before the 🔥 turbo can be used again. */
export const TURBO_COOLDOWN = 6000
const WHEEL_ORDER = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']
const WHEEL = { restLength: 0.32, stiffness: 38, frictionSlip: 2.4 }
// cannon scales the spring by the chassis mass, so at rest each of the four
// wheels compresses by g / (4 * stiffness). Mounting the wheels that far up
// leaves them where Blender put them once the car settles.
const WHEEL_MOUNT = WHEEL.restLength - 9.82 / (4 * WHEEL.stiffness)

const NOSE = new CANNON.Vec3(0, 0, -1)
const DOWN = new CANNON.Vec3(0, -1, 0)
const UP = new CANNON.Vec3(0, 1, 0)
const scratch = new CANNON.Vec3()

// Nodes that stay their own (collapsed) mesh: they spin, animate, toggle or glow.
const OWN_MESH = /^(wheel_|light_|face_|extra_lightbar$|extra_booster$)/
/** One shared material for everything opaque: colours live in the vertices, so a car is a handful of draw calls. */
const toyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05 })
const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false })
const glows = (m) => m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.05 && m.emissiveIntensity > 0.3

/** A copy of the mesh's geometry in another space, with its material colour baked into the vertices. */
function colouredGeometry(mesh, matrix) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', mesh.geometry.attributes.position.clone())
  g.setAttribute('normal', mesh.geometry.attributes.normal.clone())
  if (mesh.geometry.index) g.setIndex(mesh.geometry.index.clone())
  ensureIndexed(g).applyMatrix4(matrix)
  return solidColor(g, mesh.material.color ?? new THREE.Color(1, 1, 1))
}

/** Paint that a car's tint recolours. */
const TINTABLE = /^(paint|accent)_/

/**
 * Merges meshes into one geometry. `ranges` records which index range came
 * from which node, so the damage system can hide a piece when it comes loose;
 * `paints` records which vertices carry tintable paint (and its colour).
 */
function mergeMeshes(entries, space) {
  const inv = space.matrixWorld.clone().invert()
  const geometries = []
  const ranges = []
  const paints = []
  let start = 0
  let vertex = 0
  for (const { mesh, name } of entries) {
    const g = colouredGeometry(mesh, inv.clone().multiply(mesh.matrixWorld))
    geometries.push(g)
    const last = ranges[ranges.length - 1]
    if (last?.name === name && last.start + last.count === start) last.count += g.index.count
    else ranges.push({ name, start, count: g.index.count })
    start += g.index.count
    const count = g.attributes.position.count
    const m = mesh.material
    if (TINTABLE.test(m.name)) paints.push({ material: m.name, color: [m.color.r, m.color.g, m.color.b], start: vertex, count })
    vertex += count
  }
  return { geometry: mergeGeometries(geometries), ranges, paints }
}

/**
 * Once per template:
 * - The GLBs ship without normals to stay small: compute smooth ones (GLTFLoader turned flat shading on for them).
 * - Cut draw calls. Everything that only moves with the car (body, doors, hood, bumpers, mirrors,
 *   driver, decorations) is merged into one vertex-coloured mesh, `intact`, and the glass into one
 *   mesh per glass material (`panes_*`). Their own nodes stay hidden until the damage system
 *   separates them (a door swings open, a window cracks). Nodes that animate keep their own mesh,
 *   collapsed to one draw call each; a wheel's hubcap is part of its wheel's mesh until it pops off.
 */
const prepared = new WeakSet()
export function prepareTemplate(template) {
  if (prepared.has(template)) return
  prepared.add(template)
  template.traverse((o) => {
    if (!o.isMesh) return
    if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals()
    if (o.material.flatShading) {
      o.material.flatShading = false
      o.material.needsUpdate = true
    }
  })
  template.updateMatrixWorld(true)
  const opaque = []
  const clear = new Map() // material -> entries
  for (const node of [...template.children]) {
    if (OWN_MESH.test(node.name)) {
      collapseNode(node)
      continue
    }
    node.traverse((o) => {
      if (!o.isMesh) return
      if (o.material.transparent) {
        if (!clear.has(o.material)) clear.set(o.material, [])
        clear.get(o.material).push({ mesh: o, name: node.name })
      } else opaque.push({ mesh: o, name: node.name })
    })
    node.visible = false
    // Drawn only as part of the merged mesh, ever: no own copy to dent (see cloneTemplate).
    if (!separable(node.name)) node.traverse((o) => o.isMesh && (o.userData.mergedOnly = true))
  }
  const proxy = (name, entries, material) => {
    const { geometry, ranges, paints } = mergeMeshes(entries, template)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    Object.assign(mesh.userData, { ranges, paints })
    template.add(mesh)
  }
  proxy('intact', opaque, toyMaterial)
  let i = 0
  for (const [material, entries] of clear) proxy(`panes_${i++}`, entries, material)
}

/** Turns a node's plain opaque meshes (and its hubcap) into one mesh; glowing ones stay as they are. */
function collapseNode(node) {
  const hubcapNode = node.children.find((c) => c.name.startsWith('hubcap'))
  const entries = []
  node.traverse((o) => {
    if (!o.isMesh || o.material.transparent || glows(o.material)) return
    entries.push({ mesh: o, name: hubcapNode && isInside(o, hubcapNode) ? 'hubcap' : 'own' })
  })
  if (entries.length < 2) return
  const { geometry, ranges, paints } = mergeMeshes(entries, node)
  for (const { mesh, name } of entries) {
    if (name === 'hubcap') continue
    // A node that is itself a mesh stays (it is the node) but never draws; its merged copy does.
    if (mesh === node) {
      mesh.material = hiddenMaterial
      mesh.userData.mergedOnly = true
    } else mesh.removeFromParent()
  }
  // A hubcap is its own node under the wheel, kept hidden to throw when it pops off.
  if (hubcapNode) hubcapNode.visible = false
  const merged = new THREE.Mesh(geometry, toyMaterial)
  merged.name = `${node.name}_merged`
  Object.assign(merged.userData, { ranges, paints })
  node.add(merged)
}

function isInside(obj, ancestor) {
  for (let o = obj; o; o = o.parent) if (o === ancestor) return true
  return false
}

/**
 * A second (third…) child on the same car gets it in another colour: the paint
 * blends towards a bright tint (works on black and white paint too, unlike a hue shift).
 */
const TINTS = ['#ffffff', '#1e90ff', '#ff4fa3', '#36c25b'].map((c) => new THREE.Color(c))
const tinted = (name, color, n) => color.lerp(TINTS[n % TINTS.length], name.startsWith('paint_') ? 0.75 : 0.35)

/** The colour a child calls a car ("the red one"), as painted: for its name tag and its minimap dot. */
export const carColour = (model, tint = 0) => {
  const c = new THREE.Color(CAR_MODELS[model].colour)
  return '#' + (tint > 0 ? tinted('paint_', c, tint) : c).getHexString()
}

/**
 * Repaints a car instance in tint `n`: its own copies of the paint materials
 * (for parts drawn on their own, like a swinging door), and the paint's
 * vertices in the merged meshes. Returns the materials it made.
 */
function tintCar(root, n) {
  const copies = new Map()
  const swap = (m) => {
    if (!m || !TINTABLE.test(m.name)) return m
    if (!copies.has(m)) {
      const c = m.clone()
      tinted(m.name, c.color, n)
      copies.set(m, c)
    }
    return copies.get(m)
  }
  const colour = new THREE.Color()
  root.traverse((o) => {
    if (!o.isMesh) return
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material)
    const a = o.geometry.attributes.color?.array
    for (const { material, color, start, count } of o.userData.paints ?? []) {
      tinted(material, colour.fromArray(color), n)
      for (let i = start * 3; i < (start + count) * 3; i += 3) colour.toArray(a, i)
    }
  })
  return [...copies.values()]
}

/** Shadows only from the shell and the wheels: the rest would cost a shadow-pass draw each. */
const CASTS_SHADOW = /^(intact|wheel_)/

/**
 * Makes an instance of a car template with its own geometry, so dents (and a
 * tint) stay on this car. Meshes that never draw (`mergedOnly`) share the
 * template's: they're never dented, and never disposed with the car.
 */
function cloneTemplate(template) {
  prepareTemplate(template)
  const root = template.clone(true)
  for (const child of root.children) {
    const shadow = CASTS_SHADOW.test(child.name)
    child.traverse((o) => {
      if (o.isMesh) {
        if (!o.userData.mergedOnly) o.geometry = o.geometry.clone()
        o.castShadow = shadow
        o.receiveShadow = true
      }
    })
  }
  return root
}

/**
 * The cartoon bits: eyes that blink, squint when hurt and look where the car
 * steers, a grin that turns to a frown, flashing police lights and the
 * rocket's booster flame. All optional.
 */
class Face {
  constructor(root) {
    const get = (name) => root.getObjectByName(name)
    this.lids = get('face_lids')
    this.pupils = get('face_pupils')
    this.pupilX = this.pupils?.position.x ?? 0
    // How far the pupils can slide: a quarter of an eye.
    this.pupilReach = 0
    if (this.pupils) this.pupilReach = new THREE.Box3().setFromObject(get('light_f')).getSize(new THREE.Vector3()).y * 0.12
    this.smile = get('face_smile')
    this.frown = get('face_frown')
    if (this.frown) this.frown.visible = false
    this.flame = get('booster_flame')
    this.flameBase = this.flame?.scale.clone()
    this.blinkAt = 1 + Math.random() * 3
    this.time = Math.random() * 10
    // Police lights: this car's own copies of the red and blue materials, so they flash alone.
    this.flashers = []
    get('extra_lightbar')?.traverse((o) => {
      if (o.isMesh && /light_(red|blue)/.test(o.material.name)) {
        o.material = o.material.clone()
        this.flashers.push({ material: o.material, red: o.material.name.includes('red'), base: o.material.emissiveIntensity })
      }
    })
  }

  update(dt, car) {
    this.time += dt
    const hurt = car.damage.level
    // Blink every few seconds; squint more as the car gets wrecked.
    let close = Math.min(0.6, hurt * 0.75)
    if (this.time > this.blinkAt) {
      const t = this.time - this.blinkAt
      if (t < 0.16) close = Math.max(close, Math.sin((t / 0.16) * Math.PI))
      else this.blinkAt = this.time + 2 + Math.random() * 4
    }
    if (this.lids) this.lids.rotation.x = -close
    // Look into the turn (left is -x), and dizzily wander when badly hurt.
    if (this.pupils) {
      const look = clamp(car.steerAngle * 2.5, -1, 1) + (hurt > 0.6 ? Math.sin(this.time * 7) * 0.6 : 0)
      this.pupils.position.x = this.pupilX - look * this.pupilReach
    }
    if (this.smile) {
      const sad = hurt > 0.4
      this.smile.visible = !sad
      if (this.frown) this.frown.visible = sad
    }
    if (this.flame && this.flame.parent?.parent === car.root) {
      const flicker = 0.85 + Math.sin(this.time * 41) * 0.1 + Math.sin(this.time * 23) * 0.08
      const s = car.turboActive ? 2.6 : car.controls.throttle > 0 ? 1 : 0.55
      this.flame.scale.set(this.flameBase.x * (0.8 + 0.2 * s), this.flameBase.y * (0.8 + 0.2 * s), this.flameBase.z * s * flicker)
    }
    if (this.flashers.length) {
      const redOn = Math.floor(this.time * 5) % 2 === 0
      for (const f of this.flashers) f.material.emissiveIntensity = f.base * (f.red === redOn ? 1.6 : 0.15)
    }
  }

  dispose() {
    for (const f of this.flashers) f.material.dispose()
  }
}

export class Car {
  /**
   * @param opts.model key of CAR_MODELS
   * @param opts.template loaded GLB root for the model
   * @param opts.env { scene, world, effects, audio, debris }
   * @param opts.remote true when another device simulates this car
   * @param opts.tint 0 for the car's own colours, 1+ for another paint job (two children on the same car)
   */
  constructor({ id, model, template, env, remote = false, tint = 0 }) {
    this.id = id
    this.model = model
    this.spec = CAR_MODELS[model]
    this.env = env
    this.remote = remote
    this.controls = { steer: 0, throttle: 0, brake: 0 }
    this.root = cloneTemplate(template)
    this.tintMaterials = tint > 0 ? tintCar(this.root, tint) : []
    this.root.position.set(0, 0, 0)
    this.root.rotation.set(0, 0, 0)
    env.scene.add(this.root)

    const bodyBox = new THREE.Box3().setFromObject(this.root.getObjectByName('body'))
    const hood = this.root.getObjectByName('hood')
    this.dims = {
      width: bodyBox.max.x - bodyBox.min.x,
      length: bodyBox.max.z - bodyBox.min.z,
      bottom: bodyBox.min.y,
      top: bodyBox.max.y,
      hoodHeight: hood ? new THREE.Box3().setFromObject(hood).max.y : bodyBox.max.y * 0.6,
    }

    // Chassis: a low box for the body and a narrower one for the cabin. The body
    // box starts about a wheel's height up (the wheels carry the car), so its
    // underside doesn't scrape and catch where ramps meet the road.
    const { width, length, top } = this.dims
    const bottom = Math.max(this.dims.bottom, 0.38)
    const belt = bottom + (top - bottom) * 0.55
    this.body = new CANNON.Body({
      mass: 1100,
      material: env.carMaterial,
      angularDamping: 0.35,
      linearDamping: 0.02,
      collisionFilterGroup: GROUP_CAR,
      collisionFilterMask: GROUP_STATIC | GROUP_CAR | GROUP_DEBRIS | GROUP_PROP,
      type: remote ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC,
    })
    this.body.addShape(
      new CANNON.Box(new CANNON.Vec3(width / 2, (belt - bottom) / 2, length / 2)),
      new CANNON.Vec3(0, (belt + bottom) / 2 - COM_HEIGHT, 0),
    )
    this.body.addShape(
      new CANNON.Box(new CANNON.Vec3(width * 0.38, (top - belt) / 2, length * 0.24)),
      new CANNON.Vec3(0, (top + belt) / 2 - COM_HEIGHT, length * 0.04),
    )
    this.body.car = this
    env.world.addBody(this.body)

    this.wheels = WHEEL_ORDER.map((name) => {
      const object = this.root.getObjectByName(name)
      const box = new THREE.Box3().setFromObject(object)
      return {
        name, object,
        radius: (box.max.y - box.min.y) / 2,
        rest: object.position.clone(),
        center: object.position.clone(),
        front: name.includes('f'),
        health: 1, bent: 0, state: 'ok', spin: 0,
      }
    })

    if (!remote) {
      // The right axis (x) and up axis (y) put cannon's forward at -Z, the car's nose.
      this.vehicle = new CANNON.RaycastVehicle({ chassisBody: this.body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 })
      for (const w of this.wheels) {
        this.vehicle.addWheel({
          radius: w.radius,
          directionLocal: new CANNON.Vec3(0, -1, 0),
          axleLocal: new CANNON.Vec3(-1, 0, 0),
          chassisConnectionPointLocal: new CANNON.Vec3(w.rest.x, w.rest.y - COM_HEIGHT + WHEEL_MOUNT, w.rest.z),
          suspensionRestLength: WHEEL.restLength,
          suspensionStiffness: WHEEL.stiffness,
          dampingRelaxation: 2.6,
          dampingCompression: 4.2,
          maxSuspensionForce: 200000,
          maxSuspensionTravel: 0.35,
          frictionSlip: WHEEL.frictionSlip * this.spec.grip,
          rollInfluence: 0.04,
        })
      }
      this.vehicle.addToWorld(env.world)
    }

    this.damage = new Damage(this, env)
    this.face = new Face(this.root)
    this.lastVelocity = new CANNON.Vec3()
    this.accel = new THREE.Vector3()
    /** Front-wheel angle in radians; positive turns left. */
    this.steerAngle = 0
    this.turboTime = 0
    this.turboCooldown = 0
    this.hitAccumulator = null
    /** Recovery timers (seconds): the game puts a car back on the road when one runs too long. */
    this.upsideDownTime = 0
    this.stuckTime = 0
    this.offRoadTime = 0
    /** Progress along the road and when it was last made, to spot a car getting nowhere. */
    this.headway = null
    /** Seconds with every wheel off the ground, and how far the car has spun meanwhile (radians). */
    this.airTime = 0
    this.airSpin = 0
    this.snapshots = []
    if (!remote) this.body.addEventListener('collide', (e) => this.onCollide(e))
  }

  get speed() {
    return this.body.velocity.length()
  }

  /** Signed speed along the car's nose (positive = forwards). */
  get forwardSpeed() {
    return this.body.quaternion.vmult(NOSE, scratch).dot(this.body.velocity)
  }

  get turboActive() {
    return this.turboTime > 0
  }

  /** Angle from the car's nose to a point on the ground; positive means it's to the right, like steer +1. */
  angleTo(x, z) {
    const fwd = this.body.quaternion.vmult(NOSE, scratch)
    const dx = x - this.body.position.x, dz = z - this.body.position.z
    return Math.atan2(fwd.x * dz - fwd.z * dx, fwd.x * dx + fwd.z * dz)
  }

  /** Puts the car down on its wheels at rest, with every recovery timer cleared. */
  place(position, yaw) {
    this.body.position.set(position.x, position.y + COM_HEIGHT + 0.2, position.z)
    this.body.quaternion.setFromEuler(0, yaw, 0)
    this.body.velocity.setZero()
    this.body.angularVelocity.setZero()
    this.body.wakeUp()
    this.upsideDownTime = this.stuckTime = this.offRoadTime = 0
    this.airTime = this.airSpin = 0
    this.headway = null
    this.syncVisual()
  }

  /** Runs before each physics step. */
  drive(dt) {
    if (this.remote) return this.followSnapshots()
    const { steer, throttle, brake, hold } = this.controls
    const fwdSpeed = this.forwardSpeed
    const speed = Math.abs(fwdSpeed)
    const damageLoss = 1 - this.damage.level * 0.3
    this.turboTime = Math.max(0, this.turboTime - dt)
    const turbo = this.turboActive
    const enginePower = 7000 * this.spec.power * damageLoss * (turbo ? 2.2 : 1)
    // Part throttle (e.g. Easy mode cruising) tops out lower, so full gas is a real burst of speed.
    const topSpeed = turbo ? 40 : throttle >= 1 ? 30 : 22

    // Steering: generous at low speed, gentle at high speed. Input +1 is right, a negative angle.
    const maxSteer = clamp(0.55 - speed * 0.011, 0.2, 0.55)
    this.steerAngle = damp(this.steerAngle, -steer * maxSteer, 9, dt)
    // Positive engine force drives the car nose-first.
    let force = 0
    let braking = 0
    if (brake > 0) {
      // Held (waiting for GO, or the race is over): brakes only, so the car doesn't creep backwards.
      if (fwdSpeed > 1 || hold) braking = 45 * brake
      else force = -1500 * brake // reverse
    }
    if (throttle > 0) {
      if (fwdSpeed < -1) braking = 45 * throttle
      else force = enginePower * (turbo ? 1 : throttle) * (speed > topSpeed ? 0.05 : 1)
    }
    this.wheels.forEach((w, i) => {
      if (w.state === 'gone') {
        this.vehicle.setBrake(0, i)
        this.vehicle.applyEngineForce(0, i)
        return
      }
      const pull = w.bent * (w.front ? 1 : 0.4)
      this.vehicle.setSteeringValue(w.front ? this.steerAngle + pull * 0.4 : pull * 0.2, i)
      this.vehicle.applyEngineForce(force / 4, i)
      this.vehicle.setBrake(braking, i)
    })

    // Air drag and a little downforce keep the top speed sane and the car planted.
    const v = this.body.velocity
    const drag = 3.2 * speed
    this.body.applyForce(scratch.set(-v.x * drag, 0, -v.z * drag))
    // Downforce only with wheels on the road: in the air it would act like extra gravity and cut jumps short.
    if (this.grounded) this.body.applyForce(this.body.quaternion.vmult(DOWN, scratch).scale(speed * speed * 4, scratch))

    // How long the car has been on its roof, so the game can put it back on its wheels.
    if (this.body.quaternion.vmult(UP, scratch).y < 0.3) this.upsideDownTime += dt
    else this.upsideDownTime = 0
  }

  /** True while any wheel touches the ground (or a ramp). */
  get grounded() {
    return !this.vehicle || this.vehicle.wheelInfos.some((w) => w.isInContact)
  }

  /** Runs after each physics step. */
  afterStep(dt) {
    this.trackAir(dt)
    const v = this.body.velocity
    this.accel.set((v.x - this.lastVelocity.x) / dt, (v.y - this.lastVelocity.y) / dt, (v.z - this.lastVelocity.z) / dt)
    this.lastVelocity.copy(v)
    // Apply a crash a few physics steps after first contact, once the strongest contact is known.
    if (this.hitAccumulator && ++this.hitAccumulator.steps >= 3) {
      const hit = this.hitAccumulator
      this.hitAccumulator = null
      this.applyHit(hit)
    }
  }

  onCollide(e) {
    const other = e.body
    if (harmless(other)) return
    const contact = e.contact
    const speed = Math.abs(contact.getImpactVelocityAlongNormal())
    if (speed < 2.5) return
    // Several contacts fire per crash; keep the strongest within a short window.
    if (this.hitAccumulator && speed <= this.hitAccumulator.speed) return
    // Contact point and normal (pointing into this car), converted to car space
    // now: by the time the hit is applied the car has already bounced.
    const isI = contact.bi === this.body
    const r = isI ? contact.ri : contact.rj
    const n = isI ? contact.ni.negate() : contact.ni.clone()
    const world = new THREE.Vector3(this.body.position.x + r.x, this.body.position.y + r.y, this.body.position.z + r.z)
    const bodyLocal = this.body.vectorToLocalFrame(r)
    const dir = this.body.vectorToLocalFrame(n)
    this.hitAccumulator = {
      speed,
      world,
      local: new THREE.Vector3(bodyLocal.x, bodyLocal.y + COM_HEIGHT, bodyLocal.z), // the car's origin sits COM_HEIGHT below the body's
      dir: new THREE.Vector3(dir.x, dir.y, dir.z),
      normal: new THREE.Vector3(n.x, n.y, n.z),
      other,
      steps: this.hitAccumulator?.steps ?? 0,
    }
  }

  /** Physics and damage for a crash; onHit shows it (sparks, sound) and tells everyone. */
  applyHit({ speed, world, local, dir, normal, other }) {
    const seed = Math.floor(Math.random() * 1e9)
    // Hitting another car shares the blow; walls take it all.
    const otherCar = other.car
    // A blow from straight below is the car bottoming out on a landing: a jolt, not a crash.
    const fromBelow = dir.y > 0.7
    const effective = (otherCar ? speed * 0.85 : speed) * (fromBelow ? 0.4 : 1)
    this.damage.impact(local, dir, effective, seed)
    // A jolt: big hits lift and twist the car a little, like the chassis kicking back.
    if (effective > 10) {
      const kick = Math.min(1, (effective - 10) / 20)
      this.body.angularVelocity.x += (Math.random() - 0.5) * 2.5 * kick
      this.body.angularVelocity.z += (Math.random() - 0.5) * 3 * kick
      this.body.velocity.y += 1.5 * kick
    }
    this.onHit?.({ local, dir, speed: effective, seed, otherCar, world, normal: normal.negate() })
  }

  /**
   * Airtime and spin for stunts. On landing after a real jump, calls
   * onLand({ airTime, flips, upright }); flips only count if the car lands on its wheels.
   */
  trackAir(dt) {
    // On its roof the wheels touch nothing either, but that's no jump: a real flip is upside down only briefly.
    if (this.upsideDownTime > ROOF_NOT_AIR) {
      this.airTime = 0
      this.airSpin = 0
      return
    }
    if (!this.grounded) {
      this.airTime += dt
      // Spin around the car's own side (front flips) or nose (barrel rolls) axis.
      const local = this.body.quaternion.conjugate().vmult(this.body.angularVelocity, scratch)
      this.airSpin += Math.max(Math.abs(local.x), Math.abs(local.z)) * dt
      return
    }
    if (this.airTime > 0.45) {
      const upright = this.body.quaternion.vmult(UP, scratch).y > 0.5
      const flips = upright ? Math.floor((this.airSpin + 0.8) / (Math.PI * 2)) : 0
      this.onLand?.({ airTime: this.airTime, flips, upright })
    }
    this.airTime = 0
    this.airSpin = 0
  }

  /** Two seconds of extra push. Returns false while recharging; `free` (boost pads, stunts) ignores the recharge. */
  boost({ free = false, seconds = 2 } = {}) {
    if (!free && this.turboCooldown > performance.now()) return false
    this.turboTime = Math.max(this.turboTime, seconds)
    if (!free) this.turboCooldown = performance.now() + TURBO_COOLDOWN
    return true
  }

  dropWheel(i) {
    if (!this.vehicle) return
    const info = this.vehicle.wheelInfos[i]
    info.radius = 0.08
    info.suspensionRestLength = 0.05
    info.frictionSlip = 0.6
  }

  restoreWheel(i) {
    const w = this.wheels[i]
    w.object.position.copy(w.rest)
    w.object.quaternion.identity()
    if (!this.vehicle) return
    const info = this.vehicle.wheelInfos[i]
    info.radius = w.radius
    info.suspensionRestLength = WHEEL.restLength
    info.frictionSlip = WHEEL.frictionSlip * this.spec.grip
  }

  /** Copies the physics pose to the visible car and animates the wheels. */
  syncVisual(dt = 0) {
    const b = this.body
    const offset = b.quaternion.vmult(DOWN, scratch).scale(COM_HEIGHT, scratch)
    this.root.position.set(b.position.x + offset.x, b.position.y + offset.y, b.position.z + offset.z)
    this.root.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w)
    this.root.updateMatrixWorld()
    const fwd = this.forwardSpeed
    this.wheels.forEach((w, i) => {
      if (w.state === 'gone') return
      w.spin -= (fwd / w.radius) * dt
      // The hub hangs one suspension length below its mount point.
      if (this.vehicle) w.object.position.y = w.rest.y + WHEEL_MOUNT - this.vehicle.wheelInfos[i].suspensionLength
      const steer = w.front ? this.steerAngle : 0
      w.object.rotation.set(w.spin, steer + Math.sin(w.spin) * w.bent * 0.3, w.bent * 0.5, 'YXZ')
      w.center.copy(w.object.position)
    })
    this.face.update(dt, this)
  }

  // --- Networking ---------------------------------------------------------

  /**
   * `n` numbers the snapshots so late, out-of-order ones can be dropped, and
   * `t` is the sender's clock (ms) so playback follows the sender's timing
   * rather than network jitter.
   */
  snapshot() {
    const b = this.body
    this.snapshotSeq = (this.snapshotSeq ?? 0) + 1
    return {
      n: this.snapshotSeq,
      t: Math.round(performance.now()),
      p: [b.position.x, b.position.y, b.position.z].map((n) => +n.toFixed(3)),
      q: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w].map((n) => +n.toFixed(4)),
      v: [b.velocity.x, b.velocity.y, b.velocity.z].map((n) => +n.toFixed(2)),
      s: +this.steerAngle.toFixed(2),
      b: this.turboActive ? 1 : 0,
    }
  }

  /** `s` is a freshly decoded message, so it is stamped in place. */
  pushSnapshot(s) {
    const now = performance.now()
    const last = this.snapshots[this.snapshots.length - 1]
    if (last && s.n != null && last.n != null) {
      // Older than what we have: drop it (unless the sender clearly started counting again).
      if (s.n <= last.n && s.n > last.n - 100) return
      if (s.n < last.n) this.snapshots.length = 0
    }
    if (s.t != null) {
      // Map the sender's clock onto ours using the least-delayed message seen, creeping up
      // slowly so a one-off fast message (or clock drift) can't skew playback for good.
      const offset = now - s.t
      this.clockOffset = this.clockOffset == null ? offset : Math.min(this.clockOffset + 0.5, offset)
      s.time = s.t + this.clockOffset
    } else s.time = now
    if (last && s.time <= last.time) s.time = last.time + 1
    this.snapshots.push(s)
    if (this.snapshots.length > 30) this.snapshots.shift()
  }

  /**
   * Remote cars play back snapshots ~100 ms behind, so motion stays smooth.
   * Between two snapshots: interpolate. Past the newest one (a late packet):
   * coast along its velocity for at most 150 ms, then hold.
   */
  followSnapshots() {
    const renderTime = performance.now() - 100
    const snaps = this.snapshots
    if (snaps.length === 0) return
    const newest = snaps[snaps.length - 1]
    const body = this.body
    let a = null, b = null
    for (let i = snaps.length - 2; i >= 0; i--) {
      if (snaps[i].time <= renderTime) {
        a = snaps[i]
        b = snaps[i + 1]
        break
      }
    }
    if (a && renderTime <= b.time) {
      const t = clamp((renderTime - a.time) / Math.max(1, b.time - a.time), 0, 1)
      _pos.fromArray(a.p).lerp(_pos2.fromArray(b.p), t)
      _quat.fromArray(a.q).slerp(_quat2.fromArray(b.q), t)
    } else if (renderTime > newest.time) {
      b = newest
      const ahead = Math.min(renderTime - newest.time, 150) / 1000
      _pos.fromArray(newest.p).addScaledVector(_pos2.fromArray(newest.v), ahead)
      _quat.fromArray(newest.q)
    } else {
      // Still before the oldest snapshot (just joined): hold there.
      b = snaps[0]
      _pos.fromArray(b.p)
      _quat.fromArray(b.q)
    }
    // Kinematic bodies need a velocity so collisions with local cars push properly (none while holding).
    if (renderTime - newest.time > 150) body.velocity.setZero()
    else body.velocity.set(b.v[0], b.v[1], b.v[2])
    body.position.set(_pos.x, _pos.y, _pos.z)
    body.quaternion.set(_quat.x, _quat.y, _quat.z, _quat.w)
    this.steerAngle = b.s
    this.turboTime = b.b ? 0.1 : 0
  }

  dispose() {
    this.vehicle?.removeFromWorld(this.env.world)
    this.env.world.removeBody(this.body)
    this.root.removeFromParent()
    // Geometry is per car (dents); materials are shared with the template except the damage system's and tags'.
    this.root.traverse((o) => {
      if (o.isMesh && !o.userData.mergedOnly) o.geometry.dispose()
      if (o.isSprite) {
        o.material.map?.dispose()
        o.material.dispose()
      }
    })
    this.damage.dispose()
    this.face.dispose()
    for (const m of this.tintMaterials) m.dispose()
  }
}
