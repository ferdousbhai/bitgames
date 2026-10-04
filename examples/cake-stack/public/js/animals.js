import * as THREE from 'three'

/** The birthday friends, one per cake. Each one brings a new flavour to the bakery. */
export const CUSTOMERS = [
  { animal: 'bear', emoji: '🐻', hat: '#ff6fae', layers: 6, unlock: 'strawberry' },
  { animal: 'bunny', emoji: '🐰', hat: '#4dabf7', layers: 7, unlock: 'chocolate' },
  { animal: 'cat', emoji: '🐱', hat: '#69db7c', layers: 8, unlock: 'lemon' },
  { animal: 'puppy', emoji: '🐶', hat: '#ffd23f', layers: 8, unlock: 'mint' },
  { animal: 'panda', emoji: '🐼', hat: '#ff8fab', layers: 9, unlock: 'blueberry' },
  { animal: 'pig', emoji: '🐷', hat: '#b197fc', layers: 10, unlock: 'rainbow' },
  { animal: 'fox', emoji: '🦊', hat: '#4fd1c5', layers: 10 },
  { animal: 'chick', emoji: '🐥', hat: '#ff9f43', layers: 10 },
]

const NECK_Y = 0.45

export class AnimalKit {
  constructor() {
    this.src = {}
  }

  attach(gltf) {
    gltf.scene.traverse((o) => {
      if (o.name.startsWith('animal_') || o.name === 'party_hat') this.src[o.name] = o
      if (o.isMesh) {
        o.castShadow = true
        o.material.envMapIntensity = 0.3
      }
    })
  }

  /** A customer: the animal with its party hat, plus little animation helpers. */
  make(def, { hat = true } = {}) {
    const src = this.src[`animal_${def.animal}`]
    const group = new THREE.Group()
    const rig = new THREE.Group() // bounces and leans inside the group
    group.add(rig)
    let model, head
    if (src) {
      model = src.clone(true)
      model.position.set(0, 0, 0)
      head = model.getObjectByName(`${def.animal}_head`)
    } else {
      model = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12).translate(0, 0.45, 0), new THREE.MeshStandardMaterial({ color: '#c08050' }))
    }
    rig.add(model)
    if (!head) head = new THREE.Group()
    let hatObj = null
    if (hat && this.src.party_hat) {
      hatObj = this.src.party_hat.clone(true)
      hatObj.traverse((m) => {
        if (m.isMesh && m.material.name === 'hat_main') {
          m.material = m.material.clone()
          m.material.color.set(def.hat)
        }
      })
      hatObj.position.set(def.animal === 'bunny' ? 0.0 : 0.05, def.animal === 'chick' ? 0.47 : 0.43, 0)
      hatObj.rotation.z = -0.22
      head.add(hatObj)
    }
    return new Customer(def, group, rig, head, hatObj)
  }
}

export class Customer {
  constructor(def, group, rig, head, hat) {
    Object.assign(this, { def, group, rig, head, hat })
    this.hopT = 1 // 0..1 progress of the current hop
    this.hopH = 0
    this.dance = 0 // seconds of happy dancing left
    this.shake = 0 // seconds of surprised head shaking
    this.lookX = 0
    this.blow = 0 // 0..1 lean toward the cake
    this.blowDir = -1
    this.phase = Math.random() * 10
  }

  get mouthWorld() {
    const p = new THREE.Vector3(0, 0.12, 0.3)
    this.head.updateWorldMatrix(true, false)
    return p.applyMatrix4(this.head.matrixWorld)
  }

  hop(height = 0.25) {
    this.hopT = 0
    this.hopH = height
  }

  cheer(seconds = 1.2) {
    this.dance = Math.max(this.dance, seconds)
    this.hop(0.3)
  }

  surprised() {
    this.shake = 0.6
  }

  update(dt, t, focus) {
    this.phase += dt
    const scale = this.group.scale.x || 1
    // Hop: a little parabola
    let y = 0
    if (this.hopT < 1) {
      this.hopT = Math.min(1, this.hopT + dt * 2.6)
      y = Math.sin(this.hopT * Math.PI) * this.hopH
    }
    this.dance = Math.max(0, this.dance - dt)
    this.shake = Math.max(0, this.shake - dt)
    const dancing = this.dance > 0
    if (dancing && this.hopT >= 1) this.hop(0.18)
    const breathe = Math.sin(this.phase * 2.2) * 0.02
    this.rig.position.y = y / scale
    this.rig.scale.set(1 - breathe * 0.5, 1 + breathe, 1 - breathe * 0.5)
    this.rig.rotation.z = dancing ? Math.sin(this.phase * 9) * 0.18 : Math.sin(this.phase * 1.3) * 0.03
    // Lean and puff when blowing out the candles
    this.rig.rotation.y = this.blowDir * this.blow * 0.9
    this.rig.rotation.x = this.blow * 0.25
    // The head follows the cake (or the moving layer), tilts happily and shakes when surprised
    if (focus) {
      const local = this.group.worldToLocal(focus.clone())
      const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, Math.max(0.6, local.z + 1.2)), -0.7, 0.7)
      const pitch = THREE.MathUtils.clamp(-Math.atan2(local.y - 0.7, 2.2) * 0.6, -0.35, 0.3)
      this.head.rotation.y += (yaw * (1 - this.blow) - this.head.rotation.y) * Math.min(1, dt * 6)
      this.head.rotation.x += (pitch - this.head.rotation.x) * Math.min(1, dt * 6)
    }
    this.head.rotation.z = Math.sin(this.phase * 1.7) * 0.06 + (this.shake > 0 ? Math.sin(this.shake * 40) * 0.25 * this.shake : 0)
    const puff = this.blow > 0.5 ? 1 + (this.blow - 0.5) * 0.16 : 1
    this.head.scale.set(puff, 1 + (puff - 1) * 0.3, puff)
    this.head.position.y = NECK_Y
  }
}
