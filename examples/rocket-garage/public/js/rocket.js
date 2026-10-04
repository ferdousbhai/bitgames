import * as THREE from 'three'
import { PARTS, modelName, part } from './parts.js'
import { visibleBox } from './thumbs.js'

const box = new THREE.Box3()

/**
 * The player's rocket, snapped together from parts.glb pieces.
 *
 *   root      placed by the game; its origin is the rocket's middle
 *   wobbler   shakes, tilts and spins (so the pivot is the middle too)
 *   body      the stacked parts, shifted so the middle sits on the pivot
 */
export class Rocket {
  constructor(models, glowTex) {
    this.models = models
    this.glowTex = glowTex
    this.root = new THREE.Group()
    this.wobbler = new THREE.Group()
    this.root.add(this.wobbler)
    this.body = null
    this.paintMats = {}
    this.flames = []
    this.pops = []
    this.squash = 0
    this.flameLevel = 0
    this.half = 2
    this.minY = 0
    this.width = 1.2
    this.pilot = null
    this.pilotHead = null
    this.cfg = null
    this.t = 0
  }

  paint(slot) {
    if (!this.paintMats[slot]) {
      // Every paint_* material starts from the same look; each slot gets its own copy
      let base = null
      this.models[modelName(slot, PARTS[slot][slot === 'booster' ? 1 : 0].id)].traverse((o) => {
        if (!base && o.isMesh && o.material.name.startsWith('paint')) base = o.material
      })
      this.paintMats[slot] = base.clone()
    }
    return this.paintMats[slot]
  }

  /** Clone a part and give it this rocket's paint. */
  clonePart(slot, id) {
    const name = modelName(slot, id)
    const obj = this.models[name].clone()
    obj.userData.slot = slot
    obj.userData.name = name
    const paintSlot = slot === 'booster' ? 'booster' : slot
    obj.traverse((o) => {
      if (o.isMesh && o.material.name.startsWith('paint') && this.cfgHasPaint(paintSlot)) o.material = this.paint(paintSlot)
    })
    return obj
  }

  cfgHasPaint(slot) {
    return slot in (this.cfg?.colors ?? {})
  }

  setColors(colors) {
    for (const slot in colors) this.paint(slot).color.set(colors[slot])
  }

  /** Rebuild from a rocket description; `changed` names the slot that gets a happy pop. */
  build(cfg, changed = null) {
    this.cfg = cfg
    this.setColors(cfg.colors)
    if (this.body) this.wobbler.remove(this.body)
    const body = new THREE.Group()
    const parts = {}
    const add = (slot, id, y) => {
      const o = this.clonePart(slot, id)
      o.position.y = y
      body.add(o)
      parts[slot] = o
      return o
    }
    const top = (o) => o.getObjectByName(`${o.userData.name}_top`).position.y

    let y = 0
    const fins = add('fins', cfg.fins, y)
    y += top(fins)
    const tank = add('tank', cfg.tank, y)
    tank.updateMatrixWorld(true)
    box.setFromObject(tank)
    const tankHalf = (box.max.x - box.min.x) / 2
    y += top(tank)
    const cabin = add('cabin', cfg.cabin, y)
    y += top(cabin)
    add('nose', cfg.nose, y)

    if (cfg.sticker !== 'none') {
      const anchor = tank.getObjectByName(`${tank.userData.name}_sticker`)
      const st = this.clonePart('sticker', cfg.sticker)
      st.position.copy(anchor.position)
      st.scale.setScalar(1.5)
      tank.add(st)
      parts.sticker = st
    }

    const anchor = cabin.getObjectByName(`${cabin.userData.name}_pilot`)
    const pilot = this.clonePart('pilot', cfg.pilot)
    pilot.position.copy(anchor.position)
    pilot.getObjectByName(`${cfg.pilot}_body`).visible = false
    pilot.getObjectByName(`${cfg.pilot}_helmet`).visible = false
    if (cfg.cabin === 'bubble') pilot.scale.setScalar(1.15)
    cabin.add(pilot)
    parts.pilot = pilot
    this.pilot = pilot
    this.pilotHead = pilot.getObjectByName(`${cfg.pilot}_head`)
    this.pilotBase = pilot.position.clone()

    const b = part('booster', cfg.booster)
    this.boosters = []
    if (cfg.booster !== 'none') {
      for (const s of [-1, 1]) {
        const o = this.clonePart('booster', cfg.booster)
        o.position.set(s * (tankHalf + b.r * 0.72), top(fins) - 0.3, 0)
        o.userData.slot = 'booster'
        body.add(o)
        this.boosters.push(o)
      }
      parts.booster = this.boosters[0]
    }

    // Measure (before the flames) and centre on the pivot
    body.updateMatrixWorld(true)
    visibleBox(body, box)
    this.minY = box.min.y
    this.half = (box.max.y - box.min.y) / 2
    this.width = box.max.x - box.min.x
    body.position.y = -this.minY - this.half
    // Flames: the main engine, then one per booster
    this.flames = []
    const flameAt = (parent, pos, scale) => {
      const f = this.models.flame.clone()
      f.position.copy(pos)
      f.scale.setScalar(scale)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ff9f43', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }))
      glow.position.set(pos.x, pos.y - 0.3 * scale, pos.z)
      glow.scale.setScalar(2.4 * scale)
      parent.add(f, glow)
      this.flames.push({ f, glow, scale, phase: Math.random() * 10 })
    }
    flameAt(fins, fins.getObjectByName(`${fins.userData.name}_flame`).position, 1)

    for (const o of this.boosters) flameAt(o, new THREE.Vector3(0, 0, 0), b.r / 0.3)

    this.body = body
    this.parts = parts
    this.wobbler.add(body)
    this.setFlame(this.flameLevel)

    if (changed) {
      const targets = changed === 'booster' ? this.boosters : [parts[changed]]
      for (const o of targets) if (o) this.pops.push({ o, t: 0, base: o.scale.x })
      this.squash = 1
    }
  }

  /** Which slot is under the ray, if any. */
  pick(raycaster) {
    if (!this.body) return null
    for (const hit of raycaster.intersectObject(this.body, true)) {
      let o = hit.object
      let visible = true
      let slot = null
      while (o && o !== this.body) {
        if (!o.visible) visible = false
        if (!slot && o.userData.slot) slot = o.userData.slot
        o = o.parent
      }
      if (visible && slot) return slot
    }
    return null
  }

  setFlame(level) {
    this.flameLevel = level
    for (const fl of this.flames) {
      fl.f.visible = level > 0.02
      fl.glow.visible = level > 0.02
    }
  }

  /** Bottom of the rocket relative to the root (for standing it on things). */
  get bottom() {
    return -this.half * this.root.scale.y
  }

  update(dt, time) {
    this.t += dt
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]
      p.t += dt
      const tt = Math.max(0, p.t)
      const k = p.t > 0 && p.t < 0.6 ? 1 + 0.45 * Math.exp(-6 * tt) * Math.cos(tt * 18) : 1
      p.o.scale.setScalar(p.base * k)
      if (p.t >= 0.6) this.pops.splice(i, 1)
    }
    this.squash = Math.max(0, this.squash - dt * 1.6)
    const s = this.squash
    const sq = 1 - 0.07 * s * Math.cos(this.t * 16)
    this.wobbler.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq))

    // Flames flicker; level stretches them
    const L = this.flameLevel
    for (const fl of this.flames) {
      if (!fl.f.visible) continue
      const ph = time * 30 + fl.phase
      const len = (0.4 + L * 0.9) * (1 + Math.sin(ph) * 0.08 + Math.sin(ph * 0.57) * 0.06)
      const wid = (0.6 + L * 0.4) * (1 + Math.sin(ph * 0.77) * 0.05)
      fl.f.scale.set(fl.scale * wid, fl.scale * len, fl.scale * wid)
      fl.glow.material.opacity = (0.35 + L * 0.5) * (0.85 + 0.15 * Math.sin(ph * 0.9))
      fl.glow.scale.setScalar(fl.scale * (1.6 + L * 1.4))
    }

    // The pilot looks about
    if (this.pilotHead) {
      this.pilotHead.rotation.y = Math.sin(time * 0.7) * 0.25
      this.pilotHead.rotation.z = Math.sin(time * 1.3) * 0.08
    }
  }

  /** World positions where exhaust leaves each engine. */
  nozzles(out) {
    out.length = 0
    for (const fl of this.flames) {
      const v = new THREE.Vector3()
      fl.f.getWorldPosition(v)
      out.push(v)
    }
    return out
  }
}
