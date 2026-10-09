import * as THREE from 'three'
import { makeGlowTexture } from './effects.js'
import { numberTexture, treasureMesh } from './goals.js'
import { copy, tinted } from './models.js'
import { WORLDS, WORLD_LENGTH, worldAt } from './worlds.js'

const rand = THREE.MathUtils.randFloat
const { clamp } = THREE.MathUtils
const pick = (list) => list[Math.floor(Math.random() * list.length)]

export const GEMS = {
  blue: { look: null, points: 1, colors: ['#7cdcff', '#bdeaff', '#ffffff'] },
  pink: { look: { gem: { color: '#ff7eb9', emissive: '#ff2e88', emissiveIntensity: 0.35 } }, points: 1, colors: ['#ff8fc7', '#ffd1e8', '#ffffff'] },
  gold: { look: { gem: { color: '#ffd23f', emissive: '#ffa000', emissiveIntensity: 0.45 } }, points: 1, colors: ['#ffe066', '#fff3a0', '#ffffff'] },
  big: { look: { gem: { color: '#8ef0c8', emissive: '#2ec4b6', emissiveIntensity: 0.5 } }, points: 5, colors: ['#8ef0c8', '#ffffff', '#ffd23f'] },
}
const LANTERN_COLORS = ['#ff6f59', '#ffb347', '#ff7eb9', '#7cc6fe', '#b28dff']

const BUBBLE_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`
const BUBBLE_FRAG = /* glsl */ `
  uniform float uTime; varying vec3 vN; varying vec3 vV;
  void main() {
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    vec3 rainbow = 0.6 + 0.4 * cos(6.2831 * (f * 1.4 + uTime * 0.15 + vec3(0.0, 0.33, 0.67)));
    float a = 0.08 + pow(f, 2.5) * 0.85;
    vec3 spec = vec3(pow(max(dot(normalize(vN), normalize(vec3(-0.4, 0.6, 0.7))), 0.0), 40.0));
    gl_FragColor = vec4(rainbow + spec, a + spec.r * 0.8);
    #include <colorspace_fragment>
  }`

/**
 * Everything Ember can catch, fly through, light up or bonk into, laid out ahead of the
 * flight in little hand-made patterns. update() moves them and reports what happened.
 */
export class Course {
  constructor(scene, templates, particles) {
    this.scene = scene
    this.t = templates
    this.particles = particles
    this.items = []
    this.fireballs = []
    this.flyers = []
    this.possible = 0
    this.bubbleMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: BUBBLE_VERT,
      fragmentShader: BUBBLE_FRAG,
      transparent: true,
      depthWrite: false,
    })
    this.bubbleGeo = new THREE.SphereGeometry(1, 28, 16)
    const glow = makeGlowTexture(false)
    this.lanternGlow = new THREE.SpriteMaterial({ map: glow, color: '#ffc46b', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })
    this.gemGlow = new THREE.SpriteMaterial({ map: glow, color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })
    this.fireCore = new THREE.SpriteMaterial({ map: glow, color: '#fff3a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    this.fireOuter = new THREE.SpriteMaterial({ map: makeGlowTexture(true), color: '#ff7b2e', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    this.powerGlow = new THREE.SpriteMaterial({ map: glow, color: '#ffe066', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })
    this.world = 0 // the world Ember is in: only its goal rings and treasures show
    this.ringGlow = new THREE.SpriteMaterial({ map: glow, color: '#fff3a0', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })
    this.treasureGlow = new THREE.SpriteMaterial({ map: glow, color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })
    templates.hoop.traverse((o) => {
      if (o.isMesh && o.material.name === 'hoop_cloud') this.hoopCloud ??= o.material
    })
    this.tmp = new THREE.Vector3()
    this.tmp2 = new THREE.Vector3()
  }

  reset(startZ) {
    for (const it of this.items) this.drop(it)
    for (const f of this.fireballs) this.scene.remove(f.obj)
    for (const f of this.flyers) this.scene.remove(f.obj)
    this.items.length = this.fireballs.length = this.flyers.length = 0
    this.nextZ = startZ + 45
    this.possible = 0
    this.powerGiven = new Set()
    this.slots = new Map() // world -> the goal places still to lay out
    this.ringNext = new Map() // world -> the number the next numbered ring shows
    this.holdWorld = -1 // the world whose spare treasures are floating in
  }

  // --- Each world's goal ------------------------------------------------------------

  /** Where a world's numbered rings or treasure groups go: spread evenly between start and nest. */
  slotsFor(wi) {
    if (!this.slots.has(wi)) {
      const goal = WORLDS[wi].goal
      const n = goal ? (goal.type === 'rings' ? goal.groups.length : goal.groups) : 0
      const from = 70
      const to = WORLD_LENGTH - 150
      this.slots.set(wi, Array.from({ length: n }, (_, i) => ({ at: from + ((to - from) * i) / Math.max(1, n - 1), i })))
    }
    return this.slots.get(wi)
  }

  /**
   * A run of numbered rings in a gentle curve. No gems lead into them: they'd sit right in
   * front of the big number as Ember lines up, and the glowing ring already shows the way.
   */
  numberedRings(z, count) {
    let x = this.randX(0.55)
    let y = rand(3, 5.8)
    const gap = 17
    z += 6
    for (let i = 0; i < count; i++) {
      this.numRing(x, y, z + i * gap)
      x = clamp(x + rand(-3, 3), -this.lane.x * 0.7, this.lane.x * 0.7)
      y = clamp(y + rand(-1.8, 1.8), 2.8, 6.2)
    }
    return 6 + (count - 1) * gap + 4
  }

  numRing(x, y, z) {
    const obj = new THREE.Group()
    const ring = copy(this.t.hoop, { hoop_cloud: PALE_RING })
    obj.add(ring)
    const halo = new THREE.Sprite(this.ringGlow)
    halo.scale.setScalar(7.5)
    halo.position.z = -0.3
    halo.visible = false
    obj.add(halo)
    // the number floats in the middle of the ring: Ember flies right through it
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: numberTexture(1), transparent: true, depthWrite: false }))
    label.scale.setScalar(2.9)
    label.renderOrder = 4
    obj.add(label)
    const scale = 1.15
    obj.scale.setScalar(scale)
    const it = this.add('numring', obj, x, y, z, { radius: 2.3 * scale, wi: this.wi, ring, halo, label, number: 0 })
    this.relabel(this.wi)
    return it
  }

  /**
   * Numbers the rings of world `wi` still ahead, nearest first, from the number that comes next.
   * A missed ring is behind Ember now, so the ring after it takes its number: the number waits.
   * Rings past the goal quietly go away.
   */
  relabel(wi) {
    const goal = WORLDS[wi].goal
    let n = this.ringNext.get(wi) ?? 1
    const ahead = this.items.filter((it) => it.type === 'numring' && it.wi === wi && !it.done).sort((a, b) => b.z - a.z)
    for (const it of ahead) {
      const number = n++
      it.off = number > goal.target
      it.obj.visible = !it.off
      if (it.off) continue
      if (it.number !== number) {
        it.number = number
        it.label.material.map = numberTexture(number)
      }
      const next = number === (this.ringNext.get(wi) ?? 1)
      if (it.next !== next) {
        it.next = next
        it.halo.visible = next
        it.label.material.opacity = next ? 1 : 0.75
        const look = next ? GOLD_RING : PALE_RING
        it.ring.traverse((o) => {
          if (o.isMesh && o.material.name === 'hoop_cloud') o.material = tinted(this.hoopCloud, look)
        })
      }
    }
  }

  /** A little group of treasures side by side: the child chooses which one to fly to. */
  treasures(z) {
    const goal = this.w.goal
    const kinds = [...goal.kinds].sort(() => Math.random() - 0.5)
    const n = kinds.length
    const s = Math.min(this.lane.x * 0.78, n === 2 ? 2.6 : 2.8)
    const y = rand(3.4, 5.4)
    kinds.forEach((kind, i) => {
      const x = n === 2 ? (i ? s : -s) : (i - 1) * s
      // three in a little arch, so there is room to fly to the middle one alone
      const dy = n === 3 ? (i === 1 ? 1.1 : -0.7) : rand(-0.5, 0.5)
      this.treasure(kind, x, y + dy, z + 4)
    })
    return 10
  }

  /**
   * Before the nest, while a gathering goal is still open, Ember waits and spare groups float in
   * one after another, so a missed treasure always comes round again. `z` is Ember's distance.
   * The first call clears what was laid out ahead, so nothing else stands in the way.
   */
  spare(z, lane, wi) {
    const want = WORLDS[wi].goal.want
    if (this.holdWorld !== wi) {
      this.holdWorld = wi
      for (const it of this.items) if (it.z < -z && it.z > -(wi + 1) * WORLD_LENGTH) it.gone = true
    }
    if (this.items.some((it) => it.type === 'treasure' && it.drift && !it.gone && it.kind === want && it.z < -z - 1)) return
    this.w = WORLDS[wi]
    this.wi = wi
    this.lane = lane
    const before = this.items.length
    this.treasures(z + 44)
    for (let i = before; i < this.items.length; i++) this.items[i].drift = 9
  }

  treasure(kind, x, y, z) {
    const obj = new THREE.Group()
    const m = treasureMesh(kind)
    m.scale.setScalar(0.95)
    obj.add(m)
    const halo = new THREE.Sprite(this.treasureGlow)
    halo.scale.setScalar(3)
    halo.position.z = -0.2
    obj.add(halo)
    return this.add('treasure', obj, x, y, z, { kind, r: 0.95, spin: m, wi: this.wi })
  }

  // --- Building the course --------------------------------------------------------

  generate(aheadZ, lane) {
    while (this.nextZ < aheadZ) {
      const wi = worldAt(this.nextZ)
      const start = wi * WORLD_LENGTH
      const into = this.nextZ - start
      // keep the run-up to each nest clear, then start again after it
      if (into > WORLD_LENGTH - 85) {
        // past the last nest there is nothing more to lay out
        if (wi === WORLDS.length - 1) return
        this.nextZ = start + WORLD_LENGTH + 45
        continue
      }
      const w = WORLDS[wi]
      this.w = w
      this.wi = wi
      this.lane = lane
      let len
      const hard = Math.min(1, into / 300) // gentle at the start of each world
      const slots = this.slotsFor(wi)
      if (slots.length && slots[0].at <= into + 60) {
        // the world's goal comes first: nothing else is laid over a numbered ring or a treasure group
        const slot = slots.shift()
        len = w.goal.type === 'rings' ? this.numberedRings(this.nextZ, w.goal.groups[slot.i]) : this.treasures(this.nextZ)
      } else if (!this.powerGiven.has(wi) && into > WORLD_LENGTH * 0.45) {
        this.powerGiven.add(wi)
        len = this.power(this.nextZ)
      } else {
        const r = Math.random()
        const pObstacle = 0.1 + hard * (0.14 + wi * 0.04)
        const pLantern = w.lanterns * 0.3
        const pBubble = 0.13
        // in a numbered-ring world the only rings are the numbered ones, so a plain ring never muddles the count
        const pHoop = w.goal?.type === 'rings' ? 0 : 0.26
        if (r < pObstacle) len = this.obstacle(this.nextZ)
        else if (r < pObstacle + pLantern) len = this.lanterns(this.nextZ)
        else if (r < pObstacle + pLantern + pBubble) len = this.bubbles(this.nextZ)
        else if (r < pObstacle + pLantern + pBubble + pHoop) len = this.hoops(this.nextZ)
        else len = pick([this.line, this.wave, this.spiral, this.line]).call(this, this.nextZ)
      }
      this.nextZ += len + rand(9, 15)
    }
  }

  randX(m = 1) {
    return rand(-this.lane.x, this.lane.x) * m
  }

  randY() {
    return rand(this.lane.yMin + 0.6, this.lane.yMax - 0.8)
  }

  add(type, obj, x, y, z, extra = {}) {
    obj.position.set(x, y, -z)
    this.scene.add(obj)
    const it = { type, obj, x, y, z: -z, t: Math.random() * 10, done: false, ...extra }
    // big things get see-through materials of their own, so they can fade once Ember is past
    if (BIG.has(type)) it.mats = seeThrough(obj)
    this.items.push(it)
    return it
  }

  drop(it) {
    this.scene.remove(it.obj)
    if (it.mats) for (const m of it.mats) m.dispose()
    if (it.label) it.label.material.dispose()
  }

  gem(x, y, z, kind = this.w.gem) {
    const g = GEMS[kind]
    const obj = new THREE.Group()
    const m = copy(this.t.gem, g.look)
    obj.add(m)
    const halo = new THREE.Sprite(this.gemGlow)
    halo.scale.setScalar(2.2)
    obj.add(halo)
    obj.scale.setScalar(kind === 'big' ? 1.6 : 1)
    this.possible += g.points
    return this.add('gem', obj, x, y, z, { kind, points: g.points, r: kind === 'big' ? 1.3 : 1.0, spin: m })
  }

  /** A straight line of gems from one spot to another. */
  line(z) {
    const n = 6 + Math.floor(Math.random() * 3)
    const x0 = this.randX(), y0 = this.randY()
    const x1 = clamp(x0 + rand(-4, 4), -this.lane.x, this.lane.x), y1 = clamp(y0 + rand(-3, 3), this.lane.yMin + 0.6, this.lane.yMax - 0.8)
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1)
      this.gem(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, z + i * 3.4, i === n - 1 && Math.random() < 0.35 ? 'big' : undefined)
    }
    return n * 3.4
  }

  /** A swoopy wave of gems. */
  wave(z) {
    const n = 9
    const amp = Math.min(this.lane.x * 0.8, 3.5)
    const y0 = this.randY()
    const phase = Math.random() * Math.PI * 2
    const vertical = Math.random() < 0.4
    const vx = this.randX(0.7)
    for (let i = 0; i < n; i++) {
      const s = Math.sin(phase + i * 0.7)
      if (vertical) this.gem(vx, clamp(4.3 + s * 3, this.lane.yMin + 0.6, this.lane.yMax - 0.6), z + i * 3)
      else this.gem(s * amp, clamp(y0 + Math.cos(phase + i * 0.7) * 1.2, this.lane.yMin + 0.6, this.lane.yMax - 0.6), z + i * 3)
    }
    return n * 3
  }

  /** A corkscrew of gems to spiral through. */
  spiral(z) {
    const n = 12
    const r = Math.min(2.2, this.lane.x * 0.6)
    const cx = this.randX(0.4), cy = 4.2
    for (let i = 0; i < n; i++) {
      const a = i * 0.62
      this.gem(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z + i * 2.3, i === n - 1 ? 'big' : undefined)
    }
    return n * 2.3
  }

  hoop(x, y, z, scale = 1) {
    const obj = copy(this.t.hoop, this.w.hoop)
    obj.scale.setScalar(scale)
    this.possible += 6 // rings in a row are worth more and more
    return this.add('hoop', obj, x, y, z, { radius: 2.3 * scale })
  }

  /** Two to four cloud rings in a gentle curve, with gems showing the way between them. */
  hoops(z) {
    const n = 2 + Math.floor(Math.random() * (this.wi > 0 ? 3 : 2))
    let x = this.randX(0.6), y = rand(2.5, 6)
    const gap = 17
    for (let i = 0; i < n; i++) {
      this.hoop(x, y, z + i * gap)
      if (i < n - 1) {
        const nx = clamp(x + rand(-3.5, 3.5), -this.lane.x * 0.75, this.lane.x * 0.75)
        const ny = clamp(y + rand(-2, 2), 2.5, 6.5)
        for (let k = 1; k <= 3; k++) {
          const f = k / 4
          this.gem(x + (nx - x) * f, y + (ny - y) * f, z + i * gap + gap * f)
        }
        x = nx
        y = ny
      }
    }
    return (n - 1) * gap + 4
  }

  bubble(x, y, z) {
    const obj = new THREE.Group()
    const b = new THREE.Mesh(this.bubbleGeo, this.bubbleMat)
    b.renderOrder = 3
    obj.add(b)
    const g = copy(this.t.gem, GEMS.big.look)
    g.scale.setScalar(0.9)
    obj.add(g)
    obj.scale.setScalar(1.3)
    this.possible += 3
    return this.add('bubble', obj, x, y, z, { r: 1.5, bubble: b, spin: g, fireTarget: true })
  }

  /** Floating gem bubbles: puff fire at them (or fly into them) to pop. */
  bubbles(z) {
    const n = 2 + Math.floor(Math.random() * 2)
    for (let i = 0; i < n; i++) this.bubble(this.randX(), this.randY(), z + i * 9)
    return n * 9
  }

  lantern(x, y, z) {
    const color = pick(LANTERN_COLORS)
    const obj = copy(this.t.lantern, { lantern_paper: { color, emissive: color, emissiveIntensity: 0.25 } })
    obj.scale.setScalar(1.75)
    obj.getObjectByName('lantern_face_happy').visible = false
    const glow = new THREE.Sprite(this.lanternGlow)
    glow.scale.setScalar(0)
    obj.add(glow)
    this.possible += 2
    return this.add('lantern', obj, x, y, z, { r: 1.6, color, glow, fireTarget: true })
  }

  /** A row of sleepy lanterns: light them with fire and they wake up and float away. */
  lanterns(z) {
    const n = 3 + Math.floor(Math.random() * 3)
    const x0 = this.randX(0.7)
    const y0 = rand(3.5, 7)
    const dx = rand(-1.2, 1.2)
    for (let i = 0; i < n; i++) this.lantern(clamp(x0 + dx * i, -this.lane.x, this.lane.x), y0 + Math.sin(i) * 0.8, z + i * 6)
    return n * 6
  }

  power(z) {
    const obj = new THREE.Group()
    const s = copy(this.t.powerstar)
    obj.add(s)
    const glow = new THREE.Sprite(this.powerGlow)
    glow.scale.setScalar(4)
    obj.add(glow)
    obj.scale.setScalar(1.2)
    const x = this.randX(0.5), y = 4.5
    // a trail of gems leads to it
    for (let i = 0; i < 4; i++) this.gem(x * (i / 4), 4.5, z + i * 3)
    this.add('power', obj, x, y, z + 14, { r: 1.5, spin: s })
    return 16
  }

  /** Something to steer around, with gems showing the way past it. */
  obstacle(z) {
    const kind = pick(this.w.obstacles)
    const L = this.lane
    const side = Math.random() < 0.5 ? -1 : 1
    let gx // where the gems go past it
    if (kind === 'rock') {
      const n = Math.random() < 0.5 ? 1 : 2
      for (let i = 0; i < n; i++) {
        const s = rand(1.1, 1.5)
        const obj = copy(this.t.rock, this.w.rock)
        obj.scale.setScalar(s)
        const x = i === 0 ? side * rand(0, L.x * 0.6) : -side * rand(L.x * 0.4, L.x)
        this.add('rock', obj, x, this.randY(), z + 4 + i * 8, { r: 1.0 * s, bob: Math.random() * 6 })
      }
      return 14
    }
    if (kind === 'windmill') {
      const x = side * rand(L.x * 0.35, L.x * 0.8)
      const g = new THREE.Group()
      const isl = copy(this.t.island, { island_grass: this.w.island.island_grass[0], island_dirt: this.w.island.island_dirt, island_rock: this.w.island.island_rock[0], island_flower: this.w.island.island_flower[0] })
      isl.scale.setScalar(1.3)
      g.add(isl)
      const wm = copy(this.t.windmill)
      wm.scale.setScalar(1.5)
      wm.position.y = 0.39
      g.add(wm)
      const hubY = 3.3
      const baseY = hubY - 0.39 - 3.2 * 1.5
      const it = this.add('windmill', g, x, baseY, z + 6, { blades: wm.getObjectByName('windmill_blades'), hubY, hubZ: 0.95 * 1.5, bladeR: 3.3, towerTop: hubY })
      gx = -side * rand(L.x * 0.3, L.x * 0.7)
      it.towerR = 1.4
    } else if (kind === 'tower') {
      const x = side * rand(L.x * 0.2, L.x * 0.7)
      const g = new THREE.Group()
      const isl = copy(this.t.island, { island_grass: this.w.island.island_grass[0], island_dirt: this.w.island.island_dirt, island_rock: this.w.island.island_rock[0], island_flower: this.w.island.island_flower[0] })
      g.add(isl)
      const tw = copy(this.t.tower, decorTower(this.wi))
      tw.scale.setScalar(1.15)
      tw.position.y = 0.3
      g.add(tw)
      const baseY = -4
      this.add('tower', g, x, baseY, z + 6, { towerR: 1.25, towerTop: baseY + 0.3 + 7.3 * 1.15 })
      gx = -side * rand(L.x * 0.35, L.x * 0.8)
    } else {
      // lollipop
      const x = side * rand(L.x * 0.25, L.x * 0.7)
      const lp = copy(this.t.lollipop, { lolly_a: pick(['#ff5c9a', '#4cc9f0', '#9b5de5', '#ff9f1c']) })
      const s = 1.9
      lp.scale.setScalar(s)
      const baseY = -2.2
      this.add('lolly', lp, x, baseY, z + 6, { candyY: baseY + 3.1 * s, candyR: 1.05 * s, stickTop: baseY + 2.1 * s })
      gx = -side * rand(L.x * 0.35, L.x * 0.8)
    }
    const gy = rand(2.5, 5.5)
    for (let i = 0; i < 5; i++) this.gem(gx, gy, z + i * 3)
    return 16
  }

  // --- Fire! -------------------------------------------------------------------------

  /** A sparkly fireball from `from`, flying ahead and curving toward the nearest target. */
  shoot(from, speed) {
    const obj = new THREE.Group()
    const outer = new THREE.Sprite(this.fireOuter)
    outer.scale.setScalar(2.4)
    const core = new THREE.Sprite(this.fireCore)
    core.scale.setScalar(1.2)
    obj.add(outer, core)
    obj.position.copy(from)
    this.scene.add(obj)
    // pick a target: the closest unlit lantern or bubble ahead, near the line of flight
    let best = null
    let bestScore = Infinity
    for (const it of this.items) {
      if (!it.fireTarget || it.done || it.targeted) continue
      const dz = from.z - it.obj.position.z
      if (dz < 3 || dz > 70) continue
      const dxy = Math.hypot(it.obj.position.x - from.x, it.obj.position.y - from.y)
      if (dxy > 4 + dz * 0.12) continue
      const score = dz + dxy * 4
      if (score < bestScore) {
        bestScore = score
        best = it
      }
    }
    if (best) best.targeted = true
    this.fireballs.push({ obj, outer, vel: new THREE.Vector3(0, 0, -(speed + 34)), life: 1.6, target: best, t: 0 })
  }

  // --- Every frame --------------------------------------------------------------------

  /**
   * Moves everything and checks it against the dragon at `p` (which moved from `prevZ`).
   * Returns a list of events for the game to celebrate.
   */
  update(dt, p, prevZ, time, { magnet = false, invulnerable = false, playing = true, behindZ }) {
    const events = []
    this.bubbleMat.uniforms.uTime.value = time
    const R = 0.75 // Ember's size for bumps

    let n = 0
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]
      const o = it.obj
      it.t += dt
      if (it.z > behindZ || it.gone) {
        this.drop(it)
        if (it.targeted) it.targeted = false
        continue
      }
      this.items[n++] = it
      // small things Ember flew past shrink away, so they don't fill the camera
      // (a lit lantern takes longer, so it still drifts up glowing, but it's gone before it reaches the
      // camera, where its big glow used to cover the banner and the counting party)
      if (SMALL.has(it.type) && o.position.z > p.z + 0.5) {
        const k = Math.max(0, 1 - (o.position.z - p.z - 0.5) / (it.type === 'lantern' && it.done ? 6 : 3))
        o.scale.setScalar((it.baseScale ??= o.scale.x) * k)
        if (k <= 0) it.gone = true
        continue
      }
      // rocks, windmills, towers and lollipops Ember has passed fade away, so they never hide
      // Ember (or fill the screen) on their way past the camera
      if (it.mats) {
        const k = clamp(1 - (o.position.z - p.z + 0.5) / 3, 0, 1)
        if (k !== it.fade) {
          it.fade = k
          for (const m of it.mats) m.opacity = k
          o.visible = k > 0
        }
      }
      switch (it.type) {
        case 'gem': {
          it.spin.rotation.y += dt * 2.5
          o.position.y = it.y + Math.sin(it.t * 2.2) * 0.15
          if (!playing) break
          const d = o.position.distanceTo(p)
          if (magnet && d < 9) {
            this.tmp.subVectors(p, o.position).multiplyScalar(Math.min(1, dt * 7))
            it.x += this.tmp.x
            it.y += this.tmp.y
            o.position.x = it.x
            o.position.z += this.tmp.z
          }
          if (d < it.r + R) {
            it.gone = true
            events.push({ type: 'gem', pos: o.position.clone(), points: it.points, kind: it.kind })
          }
          break
        }
        case 'hoop': {
          o.rotation.z = Math.sin(it.t * 0.8) * 0.08
          const pulse = 1 + Math.sin(it.t * 3) * 0.03
          // once Ember is through, the ring pops away before the camera reaches it, so its
          // puffs never fill the whole screen
          const away = it.done ? Math.max(0, 1 - Math.max(0, o.position.z - p.z - 1) / 3.5) : 1
          o.scale.setScalar(pulse * (it.radius / 2.3) * (it.done ? 1 + it.flash : 1) * away)
          o.visible = away > 0
          if (it.done) it.flash = Math.max(0, it.flash - dt * 1.5)
          if (!playing || it.done) break
          if (prevZ > it.z && p.z <= it.z) {
            it.done = true
            it.flash = 0.35
            const d = Math.hypot(p.x - it.x, p.y - it.y)
            if (d < it.radius * 0.95) events.push({ type: 'hoop', pos: o.position.clone() })
            else events.push({ type: 'hoopMiss', pos: o.position.clone() })
          }
          break
        }
        case 'numring': {
          // the next world's rings wait unseen beyond the nest until Ember flies on
          if (it.off || it.wi !== this.world) {
            o.visible = false
            break
          }
          o.rotation.z = Math.sin(it.t * 0.8) * 0.06
          const away = it.done ? Math.max(0, 1 - Math.max(0, o.position.z - p.z - 1) / 3.5) : 1
          o.scale.setScalar(1.15 * (it.done ? 1 + it.flash : 1) * away)
          o.visible = away > 0
          if (it.done) it.flash = Math.max(0, it.flash - dt * 1.5)
          if (!playing || it.done) break
          if (prevZ > it.z && p.z <= it.z) {
            it.done = true
            it.flash = 0.3
            it.halo.visible = false
            const through = Math.hypot(p.x - it.x, p.y - it.y) < it.radius * 0.95
            const number = it.number
            if (through) this.ringNext.set(it.wi, number + 1)
            this.relabel(it.wi)
            // a miss: does another ring ahead now wait with the same number?
            const waits = !through && this.items.some((r) => r.type === 'numring' && r.wi === it.wi && !r.done && !r.off && r.number === number)
            events.push({ type: through ? 'numRing' : 'numMiss', number, waits, pos: o.position.clone() })
          }
          break
        }
        case 'treasure': {
          // a slow sway, never a spin, so the shape always reads
          it.spin.rotation.y = Math.sin(it.t * 1.1) * 0.45
          o.visible = it.wi === this.world
          if (!o.visible) break
          o.position.y = it.y + Math.sin(it.t * 1.6) * 0.18
          // spare treasures float toward Ember while Ember waits before the nest
          if (it.drift) {
            it.z += it.drift * dt
            o.position.z = it.z
          }
          if (playing && o.position.distanceTo(p) < it.r + R) {
            it.gone = true
            events.push({ type: 'treasure', kind: it.kind, pos: o.position.clone() })
          }
          break
        }
        case 'bubble': {
          it.spin.rotation.y += dt * 1.8
          it.bubble.scale.set(1 + Math.sin(it.t * 4) * 0.04, 1 + Math.cos(it.t * 4) * 0.04, 1)
          o.position.y = it.y + Math.sin(it.t * 1.5) * 0.3
          if (playing && o.position.distanceTo(p) < it.r * 1.3 + R) this.pop(it, events)
          break
        }
        case 'lantern': {
          if (it.done) {
            // lit lanterns float gently up and away
            it.y += dt * 1.4
            it.glow.scale.setScalar(Math.min(4.5, it.glow.scale.x + dt * 12) * (1 + Math.sin(it.t * 9) * 0.03))
          }
          o.position.y = it.y + Math.sin(it.t * 1.3) * 0.25
          o.rotation.z = Math.sin(it.t * 1.1) * 0.12
          if (playing && !it.done && o.position.distanceTo(p) < it.r + R) this.light(it, events)
          break
        }
        case 'power': {
          it.spin.rotation.y = Math.sin(it.t * 2) * 0.5
          it.spin.rotation.z = Math.sin(it.t * 1.3) * 0.2
          o.scale.setScalar(1.2 * (1 + Math.sin(it.t * 6) * 0.08))
          if (playing && o.position.distanceTo(p) < it.r + R) {
            it.gone = true
            events.push({ type: 'power', pos: o.position.clone() })
          }
          break
        }
        case 'rock': {
          o.position.y = it.y + Math.sin(it.t * 0.9 + it.bob) * 0.35
          o.rotation.z = Math.sin(it.t * 0.7) * 0.1
          if (it.wobble) {
            it.wobble = Math.max(0, it.wobble - dt)
            o.rotation.z += Math.sin(it.wobble * 30) * it.wobble * 0.5
          }
          if (playing && !invulnerable && !it.hit && o.position.distanceTo(p) < it.r * 0.95 + R) this.bump(it, o.position, events)
          break
        }
        case 'windmill': {
          it.blades.rotation.z += dt * 1.3
          if (!playing || invulnerable || it.hit) break
          const hubZ = it.z + it.hubZ
          const dx = p.x - it.x
          const dy = p.y - it.hubY
          if (Math.abs(p.z - hubZ) < 0.9 + R && Math.hypot(dx, dy) < it.bladeR) this.bump(it, this.tmp2.set(it.x, it.hubY, hubZ), events)
          else if (p.y < it.towerTop && Math.hypot(dx, p.z - it.z) < it.towerR + R) this.bump(it, this.tmp2.set(it.x, p.y, it.z), events)
          break
        }
        case 'tower': {
          if (!playing || invulnerable || it.hit) break
          if (p.y < it.towerTop + 0.6 && Math.hypot(p.x - it.x, p.z - it.z) < it.towerR + R) this.bump(it, this.tmp2.set(it.x, p.y - 0.3, it.z), events)
          break
        }
        case 'lolly': {
          o.rotation.y = Math.sin(it.t * 0.8) * 0.15
          if (!playing || invulnerable || it.hit) break
          const dz = Math.abs(p.z - it.z)
          if (dz < 0.6 + R && Math.hypot(p.x - it.x, p.y - it.candyY) < it.candyR + 0.2) this.bump(it, this.tmp2.set(it.x, it.candyY, it.z), events)
          else if (p.y < it.stickTop && Math.hypot(p.x - it.x, dz) < 0.25 + R) this.bump(it, this.tmp2.set(it.x, p.y, it.z), events)
          break
        }
      }
    }
    this.items.length = n

    // Fireballs fly on, curving toward their target
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i]
      f.life -= dt
      f.t += dt
      const o = f.obj
      const tg = f.target
      if (tg && !tg.done && !tg.gone) {
        this.tmp.subVectors(tg.obj.position, o.position)
        const dist = this.tmp.length()
        const speed = f.vel.length()
        this.tmp.normalize().multiplyScalar(speed)
        f.vel.lerp(this.tmp, Math.min(1, dt * 7))
        if (dist < 1.6) {
          if (tg.type === 'bubble') this.pop(tg, events, true)
          else this.light(tg, events, true)
          f.life = 0
        }
      }
      o.position.addScaledVector(f.vel, dt)
      f.outer.material.rotation = f.t * 6
      const s = 1 + Math.sin(f.t * 30) * 0.12
      o.scale.setScalar(s)
      this.particles.emit(o.position.x, o.position.y, o.position.z, { vx: 0, vy: 0.5, vz: 0, spread: 1.2, life: 0.35, size: 0.9, color: pick(FIRE_COLORS) })
      if (f.life <= 0) {
        if (!tg || tg.done || tg.gone) this.particles.burst(o.position, FIRE_COLORS, 8, 3, 0.6, { grav: 1 })
        if (tg) tg.targeted = false
        this.scene.remove(o)
        this.fireballs.splice(i, 1)
      }
    }

    // Gems released from popped bubbles zoom to Ember
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i]
      f.t += dt * 2.6
      const k = Math.min(1, f.t)
      f.obj.position.lerpVectors(f.from, p, k * k)
      f.obj.position.y += Math.sin(k * Math.PI) * 1.5
      f.obj.rotation.y += dt * 10
      f.obj.scale.setScalar(0.9 * (1 - k * 0.6))
      if (k >= 1) {
        this.scene.remove(f.obj)
        this.flyers.splice(i, 1)
      }
    }
    return events
  }

  pop(it, events, byFire = false) {
    it.gone = true
    events.push({ type: 'bubble', pos: it.obj.position.clone(), byFire })
    const g = copy(this.t.gem, GEMS.big.look)
    g.position.copy(it.obj.position)
    this.scene.add(g)
    this.flyers.push({ obj: g, from: it.obj.position.clone(), t: 0 })
  }

  light(it, events, byFire = false) {
    it.done = true
    it.obj.getObjectByName('lantern_face_sleep').visible = false
    it.obj.getObjectByName('lantern_face_happy').visible = true
    it.obj.traverse((o) => {
      if (o.isMesh && o.material.name === 'lantern_paper') o.material = tinted(o.material, { color: '#fff3c4', emissive: it.color, emissiveIntensity: 1.6 })
    })
    events.push({ type: 'lantern', pos: it.obj.position.clone(), byFire })
  }

  bump(it, at, events) {
    it.hit = true
    it.wobble = 1
    events.push({ type: 'bonk', pos: at.clone() })
  }
}

const SMALL = new Set(['gem', 'bubble', 'lantern', 'power', 'treasure'])
const GOLD_RING = { color: '#ffd23f', emissive: '#ffb300', emissiveIntensity: 0.55 }
const PALE_RING = { color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.2 }
const BIG = new Set(['rock', 'windmill', 'tower', 'lolly'])

/** Gives each mesh of `obj` its own transparent copy of its material and returns them all. */
function seeThrough(obj) {
  const mats = []
  const own = (m) => {
    const c = m.clone()
    c.transparent = true
    mats.push(c)
    return c
  }
  obj.traverse((o) => {
    if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material)
  })
  return mats
}
const FIRE_COLORS = ['#ffd23f', '#ff9f43', '#ff6b6b', '#fff3a0', '#ff7eb9']

function decorTower(wi) {
  return wi === 3 ? { castle_roof: '#5b7cfa', castle_wall: '#d8d4ff' } : { castle_roof: pick(['#8a63d2', '#ff6b9d', '#4cc9f0']) }
}
