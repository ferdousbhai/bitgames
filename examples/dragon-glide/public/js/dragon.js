import * as THREE from 'three'
import { copy } from './models.js'

const { damp, clamp } = THREE.MathUtils

/** Colours for Ember's family waiting at each nest. */
export const LOOKS = {
  mum: { dragon_body: '#c49bff', dragon_belly: '#fff3e0', dragon_wing: '#ffd166', dragon_spike: '#ff7eb9', dragon_horn: '#fff4cf' },
  dad: { dragon_body: '#5fa8ff', dragon_belly: '#fff0c4', dragon_wing: '#ffb36b', dragon_spike: '#ffd23f', dragon_horn: '#fff4cf' },
}

/**
 * A dragon made from the Blender model: flapping wings, wagging tail, blinking eyes and
 * a jaw that opens for a puff of fire. `root` is positioned and banked by the game;
 * `body` inside it faces forward (-Z) while flying.
 */
export class Dragon {
  constructor(template, look) {
    this.root = new THREE.Group()
    this.bank = new THREE.Group()
    this.model = copy(template, look)
    this.model.rotation.y = Math.PI // the model looks at +Z; flying, it looks away from the camera
    this.bank.add(this.model)
    this.root.add(this.bank)
    const get = (n) => this.model.getObjectByName(n)
    this.head = get('dragon_head')
    this.jaw = get('dragon_jaw')
    this.mouth = get('dragon_mouth')
    this.tail = get('dragon_tail')
    this.eyes = [get('dragon_eye_l'), get('dragon_eye_r')]
    this.wings = [get('dragon_wing_l'), get('dragon_wing_r')]
    this.wingBase = this.wings.map((w) => w.rotation.clone())
    this.headBase = this.head.rotation.clone()
    this.tailBase = this.tail.rotation.clone()
    this.jawBase = this.jaw.rotation.x
    this.t = Math.random() * 10
    this.flapRate = 7
    this.flapAmp = 0.55
    this.blink = 2
    this.breath = 0 // > 0 while the mouth is open for fire
    this.spin = 0 // 0..1 for a dizzy spin after a bonk
    this.roll = 0 // 0..1 for a happy barrel roll
    this.hop = 0 // little bounce at the nest
    this.lookX = 0
    this.lookY = 0
  }

  puff() {
    this.breath = 0.35
  }

  bonk() {
    this.spin = 1
  }

  twirl() {
    if (this.roll <= 0) this.roll = 1
  }

  /** vx/vy: how fast the dragon is moving sideways/up, for leaning into turns. */
  update(dt, { vx = 0, vy = 0, flap = 1, glide = false } = {}) {
    this.t += dt
    const t = this.t
    // Wings: big strong flaps, or a calm glide that just ripples
    const rate = glide ? 2.2 : this.flapRate * (0.85 + flap * 0.25)
    const amp = glide ? 0.12 : this.flapAmp * (0.75 + flap * 0.3)
    this.flapPhase = (this.flapPhase ?? 0) + dt * rate
    const f = Math.sin(this.flapPhase)
    this.wings.forEach((w, i) => {
      const side = i === 0 ? -1 : 1
      w.rotation.copy(this.wingBase[i])
      w.rotation.z += side * f * amp
      w.rotation.x = this.wingBase[i].x + Math.cos(this.flapPhase) * 0.12 * (glide ? 0.3 : 1)
    })
    // Body bobs with each flap
    this.model.position.y = -f * 0.08 * (glide ? 0.4 : 1) + (this.hop > 0 ? Math.sin(this.hop * Math.PI) * 0.9 : 0)
    if (this.hop > 0) this.hop = Math.max(0, this.hop - dt * 2.2)

    // Tail wags, more when turning
    this.tail.rotation.set(
      this.tailBase.x + Math.sin(t * 3.1) * 0.12 - vy * 0.02,
      this.tailBase.y + Math.sin(t * 2.3) * 0.25 + vx * 0.03,
      this.tailBase.z,
    )
    // Head looks where we're going
    this.lookX = damp(this.lookX, clamp(vx * 0.05, -0.45, 0.45), 6, dt)
    this.lookY = damp(this.lookY, clamp(vy * 0.04, -0.35, 0.35), 6, dt)
    this.head.rotation.set(this.headBase.x - this.lookY + Math.sin(t * 1.7) * 0.04, this.headBase.y - this.lookX, this.headBase.z + this.lookX * 0.3)

    // Jaw opens for fire
    this.breath = Math.max(0, this.breath - dt)
    const open = this.breath > 0 ? Math.sin((this.breath / 0.35) * Math.PI) : 0
    this.jaw.rotation.x = this.jawBase + open * 0.55

    // Blink every few seconds
    this.blink -= dt
    let lid = 1
    if (this.blink < 0.12) lid = Math.abs(this.blink - 0.06) / 0.06
    if (this.blink <= 0) this.blink = 2 + Math.random() * 3
    for (const e of this.eyes) e.scale.y = Math.max(0.12, lid)

    // Lean into turns, spin when bonked, roll for joy
    let rollZ = clamp(-vx * 0.06, -0.7, 0.7)
    let spinY = 0
    if (this.spin > 0) {
      this.spin = Math.max(0, this.spin - dt * 1.1)
      spinY = (1 - this.spin) ** 0.6 * Math.PI * 4
    }
    if (this.roll > 0) {
      this.roll = Math.max(0, this.roll - dt * 1.3)
      rollZ += (1 - this.roll) ** 2 * Math.PI * 2
    }
    this.bank.rotation.set(clamp(vy * 0.05, -0.45, 0.45), spinY, rollZ)
  }
}
