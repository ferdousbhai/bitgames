import * as THREE from 'three'
import * as CANNON from 'cannon'
import { Damage } from './damage.js'
import { GROUP_CAR, GROUP_DEBRIS, GROUP_PROP, GROUP_STATIC, clamp, damp, harmless } from './util.js'

// Scratch objects for snapshot playback, which runs every physics step.
const _pos = new THREE.Vector3(), _pos2 = new THREE.Vector3()
const _quat = new THREE.Quaternion(), _quat2 = new THREE.Quaternion()

export const CAR_MODELS = {
  rocket: { name: 'Rocket', emoji: '🏎️', power: 1.12, grip: 1.1 },
  sunny: { name: 'Sunny Taxi', emoji: '🚕', power: 1.0, grip: 1.0 },
  bubbles: { name: 'Bubbles', emoji: '🫧', power: 0.95, grip: 1.05 },
  bruno: { name: 'Bruno Jeep', emoji: '🚙', power: 1.05, grip: 0.95 },
  pickle: { name: 'Pickle Van', emoji: '🚐', power: 0.95, grip: 0.95 },
  siren: { name: 'Siren', emoji: '🚓', power: 1.05, grip: 1.0 },
}

const COM_HEIGHT = 0.55
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

/** Makes an instance of a car template with its own geometry, so dents stay on this car. */
function cloneTemplate(template) {
  const root = template.clone(true)
  root.traverse((o) => {
    if (o.isMesh) {
      o.geometry = o.geometry.clone()
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  return root
}

export class Car {
  /**
   * @param opts.model key of CAR_MODELS
   * @param opts.template loaded GLB root for the model
   * @param opts.env { scene, world, effects, audio, debris }
   * @param opts.remote true when another device simulates this car
   */
  constructor({ id, model, template, env, remote = false }) {
    this.id = id
    this.model = model
    this.spec = CAR_MODELS[model]
    this.env = env
    this.remote = remote
    this.controls = { steer: 0, throttle: 0, brake: 0 }
    this.root = cloneTemplate(template)
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

    // Chassis: a low box for the body and a narrower one for the cabin.
    const { width, length, bottom, top } = this.dims
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
    this.lastVelocity = new CANNON.Vec3()
    this.accel = new THREE.Vector3()
    /** Front-wheel angle in radians; positive turns left. */
    this.steerAngle = 0
    this.turboTime = 0
    this.turboCooldown = 0
    this.hitAccumulator = null
    this.upsideDownTime = 0
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

  place(position, yaw) {
    this.body.position.set(position.x, position.y + COM_HEIGHT + 0.2, position.z)
    this.body.quaternion.setFromEuler(0, yaw, 0)
    this.body.velocity.setZero()
    this.body.angularVelocity.setZero()
    this.body.wakeUp()
    this.syncVisual()
  }

  /** Runs before each physics step. */
  drive(dt) {
    if (this.remote) return this.followSnapshots()
    const { steer, throttle, brake } = this.controls
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
      if (fwdSpeed > 1) braking = 45 * brake
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
    this.body.applyForce(this.body.quaternion.vmult(DOWN, scratch).scale(speed * speed * 4, scratch))

    // How long the car has been on its roof, so the game can put it back on its wheels.
    if (this.body.quaternion.vmult(UP, scratch).y < 0.3) this.upsideDownTime += dt
    else this.upsideDownTime = 0
  }

  /** Runs after each physics step. */
  afterStep(dt) {
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

  applyHit({ speed, world, local, dir, normal, other }) {
    const seed = Math.floor(Math.random() * 1e9)
    // Hitting another car shares the blow; walls take it all.
    const otherCar = other.car
    const effective = otherCar ? speed * 0.85 : speed
    this.damage.impact(local, dir, effective, seed)
    // A jolt: big hits lift and twist the car a little, like the chassis kicking back.
    if (effective > 10) {
      const kick = Math.min(1, (effective - 10) / 20)
      this.body.angularVelocity.x += (Math.random() - 0.5) * 2.5 * kick
      this.body.angularVelocity.z += (Math.random() - 0.5) * 3 * kick
      this.body.velocity.y += 1.5 * kick
    }
    this.env.effects.sparkBurst(world, normal.negate(), effective)
    this.env.effects.addShake(this.isPlayer ? Math.min(1, effective / 25) : 0)
    this.env.audio.crash(effective, this.isPlayer)
    this.onHit?.({ local, dir, speed: effective, seed, otherCar })
  }

  /** Two seconds of extra push. Returns false while recharging. */
  boost() {
    if (this.turboCooldown > performance.now()) return false
    this.turboTime = 2
    this.turboCooldown = performance.now() + 6000
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
  }

  // --- Networking ---------------------------------------------------------

  snapshot() {
    const b = this.body
    return {
      p: [b.position.x, b.position.y, b.position.z].map((n) => +n.toFixed(3)),
      q: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w].map((n) => +n.toFixed(4)),
      v: [b.velocity.x, b.velocity.y, b.velocity.z].map((n) => +n.toFixed(2)),
      s: +this.steerAngle.toFixed(2),
      b: this.turboActive ? 1 : 0,
    }
  }

  /** `s` is a freshly decoded message, so it is stamped in place. */
  pushSnapshot(s) {
    s.time = performance.now()
    this.snapshots.push(s)
    if (this.snapshots.length > 30) this.snapshots.shift()
  }

  /** Remote cars play back snapshots ~100 ms behind, so motion stays smooth. */
  followSnapshots() {
    const renderTime = performance.now() - 100
    const snaps = this.snapshots
    if (snaps.length === 0) return
    let a = snaps[0], b = snaps[snaps.length - 1]
    for (let i = 0; i < snaps.length - 1; i++) {
      if (snaps[i].time <= renderTime && snaps[i + 1].time >= renderTime) {
        a = snaps[i]
        b = snaps[i + 1]
        break
      }
    }
    const span = b.time - a.time
    const t = span > 0 ? clamp((renderTime - a.time) / span, 0, 1.5) : 1
    const pos = _pos.fromArray(a.p).lerp(_pos2.fromArray(b.p), t)
    const q = _quat.fromArray(a.q).slerp(_quat2.fromArray(b.q), Math.min(t, 1))
    const body = this.body
    // Kinematic bodies need a velocity so collisions with local cars push properly.
    body.velocity.set(b.v[0], b.v[1], b.v[2])
    body.position.set(pos.x, pos.y, pos.z)
    body.quaternion.set(q.x, q.y, q.z, q.w)
    this.steerAngle = b.s
    this.turboTime = b.b ? 0.1 : 0
  }

  dispose() {
    this.vehicle?.removeFromWorld(this.env.world)
    this.env.world.removeBody(this.body)
    this.root.removeFromParent()
    // Geometry is per car (dents); materials are shared with the template except the damage system's and tags'.
    this.root.traverse((o) => {
      if (o.isMesh) o.geometry.dispose()
      if (o.isSprite) {
        o.material.map?.dispose()
        o.material.dispose()
      }
    })
    this.damage.dispose()
  }
}
