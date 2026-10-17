import * as THREE from 'three'
import { BIOMES, JOURNEY, OBSTACLES, START_X, biomeIndexAt } from './biomes.js'
import { GRAVITY, HOP, SPRING } from './bunny.js'
import { copy } from './models.js'
import { clamp, keepWhere, pick, rand, randInt } from './util.js'

const CARROT_Y = 0.6
const PICKUP = 1.05 // generous: a carrot this close to the bunny's middle is caught
const MAGNET = 1.2 // and carrots this close drift towards the bunny: near, not anywhere, so timing matters
// golden carrots hang up high and pull in a little while Pip is in the air: a hop timed so its top
// meets one gets it, a hop at any old moment sails under it, and a flip always does
const GOLD_Y = 4.1
const GOLD_MAGNET = 1.4
// and a few hang higher still, where only a flip reaches (they pull in only while Pip flips)
const FLIP_GOLD_Y = 4.7
export const STOMP_BOUNCE = 12 // the bounce off the top of a log, rock or hedgehog (see main.js)
const HEDGEHOG = { w: 0.5, h: 0.78 }
const STONE_REACH = 1.2 // a landing this close to a stepping stone is on it
const FALL = 18 // how fast a carrot from a shower drops (a little floatier than Pip)
/** The squat, springy mushroom Pip bounces off: half width and height of its cap. */
const SPRING_PAD = { w: 0.62, h: 0.62 }

/** A soft golden glow with four rays, behind every golden carrot. */
let haloMaterial, bubbleMaterial, bubbleGeometry
function halo() {
  if (!haloMaterial) {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255,240,150,0.95)')
    grad.addColorStop(0.35, 'rgba(255,205,60,0.55)')
    grad.addColorStop(1, 'rgba(255,190,40,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    g.fillStyle = 'rgba(255,255,220,0.9)'
    for (let i = 0; i < 4; i++) {
      g.save()
      g.translate(64, 64)
      g.rotate((i * Math.PI) / 2)
      g.beginPath()
      g.moveTo(0, -62)
      g.quadraticCurveTo(4, -10, 0, 0)
      g.quadraticCurveTo(-4, -10, 0, -62)
      g.fill()
      g.restore()
    }
    const map = new THREE.CanvasTexture(c)
    map.colorSpace = THREE.SRGBColorSpace
    haloMaterial = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
  }
  const s = new THREE.Sprite(haloMaterial)
  s.scale.setScalar(1.75)
  s.renderOrder = 2
  return s
}

/** A gentle speed ramp: from a stroll in the meadow to a brisk hop in the snow. */
export const speedAt = (x) => 6.4 + 1.6 * clamp(x / JOURNEY, 0, 1)

/**
 * Carrots to munch, things to hop over (or bounce off), springy mushrooms and golden carrots,
 * laid out in little patterns just ahead of the bunny. The hit test is forgiving and a bump
 * never ends the game.
 */
export class Course {
  constructor(scene, templates) {
    this.scene = scene
    this.templates = templates
    this.items = []
    this.events = []
    this.reset()
  }

  /** Clear the course; the first pattern starts START_X ahead of x. */
  reset(x = 0) {
    for (const it of this.items) this.drop(it)
    this.items = []
    this.nextX = x + START_X
    this.patterns = 0
    this.last = []
    this.surprises = [] // [{ kind, x }]: the trip's rare moments, each laid out when the path gets there
  }

  carrot(x, y, gold = false, flip = false) {
    const obj = copy(this.templates[gold ? 'carrot_gold' : 'carrot'], { shadow: true })
    obj.position.set(x, y, 0)
    obj.scale.setScalar(gold ? 1.45 : 1.1)
    obj.rotation.z = -0.35
    // golden carrots glow, so they read as special from far away
    const glow = gold ? halo() : null
    if (glow) this.scene.add(glow)
    this.scene.add(obj)
    if (flip) glow.scale.setScalar(2.3)
    const item = { kind: 'carrot', gold, flip, obj, glow, x, y, phase: rand(0, 6) }
    this.items.push(item)
    return item
  }

  obstacle(x, name) {
    const obj = copy(this.templates[name], { recolor: BIOMES[biomeIndexAt(x)].recolor, shadow: true })
    obj.position.set(x, 0, 0)
    obj.rotation.y = name === 'log' ? rand(-0.15, 0.15) : rand(-0.6, 0.6)
    obj.userData.kind = name // tappable: a poke sets userData.boing, and it wobbles
    this.scene.add(obj)
    this.items.push({ kind: 'obstacle', name, obj, x, ...OBSTACLES[name], hit: false, cleared: false, stomped: false, wobble: 0 })
  }

  /** A squat, springy mushroom on the path: run into it and Pip bounces sky high. */
  spring(x) {
    const obj = copy(this.templates.mushroom_blue, { shadow: true })
    obj.position.set(x, 0, 0)
    obj.scale.set(0.62, 0.32, 0.62)
    obj.userData.kind = 'mushroom_blue'
    this.scene.add(obj)
    this.items.push({ kind: 'spring', obj, x, ...SPRING_PAD, used: false, wobble: 0 })
  }

  /** Carrots along the path a hop (or a spring's bounce) takes from x, from take-off to landing. */
  arc(x, speed, count, vy = HOP, from = 0.12) {
    const air = (2 * vy) / GRAVITY
    for (let i = 0; i < count; i++) {
      const t = from + (i / (count - 1)) * (air - 2 * from)
      this.carrot(x + speed * t, vy * t - (GRAVITY * t * t) / 2 + CARROT_Y)
    }
  }

  /** Lay out the next little pattern; returns how much path it used. */
  pattern(x) {
    const biome = BIOMES[biomeIndexAt(x)]
    const speed = speedAt(x)
    const n = this.patterns++
    const thing = () => pick(biome.obstacles)
    const takeoff = speed * (HOP / GRAVITY) // a hop's top is this far past where it starts
    // The first few show the game: carrots on the ground, a log with carrots over it, then a spring.
    // After that a random mix, never the same pattern twice running.
    const kinds = ['ground', 'over', 'single', 'stairs', 'double', 'gold', 'spring', 'shower', 'puddle', 'flip', 'chain', 'bubbles', 'roller', 'brook']
    const weights = {
      ground: 1.6, over: 2.6, single: 1, stairs: 1.3, double: n > 6 ? 1.3 : 0, gold: 1.3, spring: 1.6, shower: n > 4 ? 0.6 : 0,
      puddle: 1.4, flip: n > 3 ? 0.9 : 0, chain: n > 5 ? 1 : 0, bubbles: n > 2 ? 1 : 0, roller: n > 4 ? 0.5 : 0, brook: n > 4 ? 0.5 : 0,
    }
    // each place has its favourite moments, so the four places play differently
    for (const [k, more] of Object.entries(biome.favour)) weights[k] *= more
    // and never one of the last two patterns again
    const fresh = (k) => !this.last.includes(k)
    let kind = ['ground', 'over', 'over', 'spring'][n]
    if (!kind) {
      let r = Math.random() * kinds.reduce((sum, k) => sum + (fresh(k) ? weights[k] : 0), 0)
      kind = kinds.find((k) => fresh(k) && (r -= weights[k]) < 0) ?? 'over'
    }
    this.last = [kind, this.last[0]]
    if (kind === 'ground') {
      const count = randInt(4, 6)
      for (let i = 0; i < count; i++) this.carrot(x + i * 1.3, CARROT_Y)
      return count * 1.3
    }
    if (kind === 'over') {
      this.obstacle(x + 3, thing())
      this.arc(x + 3 - takeoff, speed, randInt(4, 5))
      return 6
    }
    if (kind === 'single') {
      this.obstacle(x + 2, thing())
      return 4
    }
    if (kind === 'stairs') {
      // a staircase in the air: hop, then flip, to reach the top
      const ys = [0.6, 1.4, 2.2, 2.9, 3.4, 2.9, 2.2, 1.4]
      ys.forEach((y, i) => this.carrot(x + i * 1.2, y))
      return ys.length * 1.2
    }
    if (kind === 'double') {
      // two hops in a row, with room to land between
      const gap = speed * 0.8 + 3.5
      this.obstacle(x + 2, thing())
      this.obstacle(x + 2 + gap, thing())
      this.carrot(x + 2 + gap / 2, CARROT_Y)
      return gap + 5
    }
    if (kind === 'spring') {
      // a springy mushroom, and a rainbow of carrots along the big bounce it gives
      this.spring(x + 2)
      this.arc(x + 2, speed, 7, SPRING, 0.25)
      return 4 + speed * ((2 * SPRING) / GRAVITY)
    }
    if (kind === 'shower') {
      // a golden carrot up high on its own: catch it and carrots rain down ahead
      this.carrot(x + 3, GOLD_Y, true)
      return 8 + speed * 2.2
    }
    if (kind === 'roller') {
      // one hedgehog rolling along the path to meet Pip, with a carrot over it
      this.hedgehog(x + 12)
      this.carrot(x + 12, 2.5)
      return 14
    }
    if (kind === 'brook') {
      // a little brook with two stepping stones a hop apart (hop both, no splash: perfect!)
      const hop = speed * ((2 * HOP) / GRAVITY)
      const stones = [x + 3, x + 3 + hop]
      this.water(x + 2, hop + 2.2, stones)
      this.carrot(stones[1] - hop / 2, 2.4)
      return 5 + hop
    }
    if (kind === 'bubbles') {
      // a drift of soap bubbles over the path, high and low: hop into them to pop them, each a note
      for (let i = 0; i < 7; i++) this.bubble(x + 2 + i * 1.5, 0.9 + Math.abs(Math.sin(i * 1.3)) * 2.2)
      return 4 + 7 * 1.5
    }
    if (kind === 'puddle') {
      // a puddle across the path: run through it for a splash, or hop in for a big one
      const len = rand(2.2, 3)
      this.water(x + 2, len)
      this.arc(x + 2 + len / 2 - takeoff, speed, 4)
      return 4 + len
    }
    if (kind === 'flip') {
      // a big golden carrot so high only a flip reaches it, over a log
      this.obstacle(x + 3, thing())
      this.carrot(x + 3 + speed * 0.12, FLIP_GOLD_Y, true, true)
      return 6
    }
    if (kind === 'chain') {
      // three low things spaced for a bounce off each in turn: bounce all three and carrots rain down
      const step = speed * ((2 * STOMP_BOUNCE) / GRAVITY)
      for (let i = 0; i < 3; i++) {
        this.obstacle(x + 2 + i * step, i === 1 ? thing() : 'log')
        this.carrot(x + 2 + i * step + step / 2, 2.6)
      }
      return 4 + step * 2.5
    }
    // a golden carrot up high over an obstacle: hop and flip!
    this.obstacle(x + 3, thing())
    this.carrot(x + 3, GOLD_Y, true)
    this.carrot(x + 3 - speed * 0.25, 2.3)
    this.carrot(x + 3 + speed * 0.25, 2.3)
    return 6
  }

  generate(aheadX) {
    while (this.nextX < aheadX && this.nextX < JOURNEY - 12) {
      const special = this.surprises.find((sp) => !sp.laid && this.nextX >= sp.x)
      if (special) special.laid = true
      const used = special ? this.special(special.kind, this.nextX) : this.pattern(this.nextX)
      const speed = speedAt(this.nextX)
      this.nextX += used + speed * rand(0.5, 1) + 1.5
    }
  }

  /**
   * A rare surprise: a balloon to float away on above a line of carrots, three springs in a row
   * under a rainbow, stepping stones over a stream, or hedgehogs rolling along the path. (The
   * friend who hops along is the game's.)
   */
  special(kind, x) {
    const speed = speedAt(x)
    if (kind === 'stream') {
      // a stream across the path, with stepping stones a hop apart and a carrot over each
      const hop = speed * ((2 * HOP) / GRAVITY)
      const stones = [0, 1, 2, 3].map((i) => x + 3 + i * hop)
      this.water(x + 2, hop * 3 + 2, stones)
      for (const sx of stones.slice(1)) this.carrot(sx - hop / 2, 2.4)
      this.carrot(stones[3] + hop / 2, 2.4, true)
      return 6 + hop * 3
    }
    if (kind === 'heart') {
      // rare: a spring, and a big heart of carrots round the top of its bounce
      const top = x + 2 + speed * (SPRING / GRAVITY)
      const high = (SPRING * SPRING) / (2 * GRAVITY) + 0.75
      this.spring(x + 2)
      this.arc(x + 2, speed, 7, SPRING, 0.25)
      for (let i = 0; i < 18; i++) {
        const t = (i / 18) * Math.PI * 2
        const hx = 16 * Math.sin(t) ** 3
        const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
        this.carrot(top + hx * 0.11, high + hy * 0.11)
      }
      return 4 + speed * ((2 * SPRING) / GRAVITY)
    }
    if (kind === 'goldstairs') {
      // rare: a long staircase of carrots up into the sky, ending in the flip-only golden carrot
      const ys = [0.6, 1.2, 1.8, 2.4, 3, 3.5, 3.9, 4.3]
      ys.forEach((y, i) => this.carrot(x + 2 + i * 1.1, y))
      this.carrot(x + 2 + ys.length * 1.1 + 0.6, FLIP_GOLD_Y + 0.1, true, true)
      return 6 + ys.length * 1.1
    }
    if (kind === 'hedgehogs') {
      // three hedgehogs come rolling along the path towards Pip: hop over, or bounce off their backs
      for (let i = 0; i < 3; i++) {
        this.hedgehog(x + 14 + i * 9)
        this.carrot(x + 14 + i * 9, 2.5)
      }
      return 14 + 9 * 3
    }
    if (kind === 'balloon') {
      this.balloon(x + 3)
      // the carrots hang along the balloon's path, a gentle wave up where Pip floats
      for (let i = 0; i < 14; i++) this.carrot(x + 3 + speed * (0.9 + i * 0.27), 3.3 + Math.sin(i * 0.8) * 0.35)
      return 6 + speed * 5.5
    }
    const step = 4 + speed * ((2 * SPRING) / GRAVITY)
    for (let i = 0; i < 3; i++) {
      this.spring(x + 2 + i * step)
      this.arc(x + 2 + i * step, speed, 7, SPRING, 0.25)
    }
    this.rainbow(x + 2 + step * 1.5, step * 1.9)
    return 4 + step * 3
  }

  /**
   * Water across the path from x, `len` long: a puddle, or a stream with stepping stones (their
   * x positions). Running or landing in it splashes; landing on a stone plinks.
   */
  water(x, len, stones = []) {
    const snowy = BIOMES[biomeIndexAt(x)].weather === 'snow'
    const obj = new THREE.Group()
    const shape = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshStandardMaterial({ color: snowy ? '#3f8fd6' : '#4aa8ec', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9, depthWrite: false }),
    )
    shape.rotation.x = -Math.PI / 2
    shape.scale.set(len / 2, stones.length ? 2.2 : 1.3, 1)
    shape.position.set(len / 2, 0.035, 0)
    shape.renderOrder = 1
    obj.add(shape)
    for (const sx of stones) {
      // round, grey and standing proud of the water, so they read as somewhere to land
      const stone = copy(this.templates.rock, { recolor: { stone: [snowy ? '#6f7c8c' : '#a9b2bd'], moss: [snowy ? '#ffffff' : '#7cc243'] }, shadow: true })
      stone.scale.set(1, 0.6, 1)
      stone.position.set(sx - x, 0, 0)
      obj.add(stone)
    }
    obj.position.set(x, 0, 0)
    this.scene.add(obj)
    this.items.push({ kind: 'water', obj, x: x + len, x0: x, x1: x + len, stones, cool: 0, hits: new Set(), wet: 0, done: false })
  }

  /** A soap bubble floating over the path: it pops when Pip touches it. */
  bubble(x, y) {
    bubbleMaterial ??= new THREE.MeshPhysicalMaterial({
      color: '#d6f1ff', emissive: '#9fd8ff', emissiveIntensity: 0.3, roughness: 0.05, transparent: true, opacity: 0.55,
      iridescence: 1, iridescenceIOR: 1.3, sheen: 1, sheenColor: '#ffc8f0', depthWrite: false,
    })
    const obj = new THREE.Mesh(bubbleGeometry ??= new THREE.SphereGeometry(0.42, 20, 14), bubbleMaterial)
    obj.position.set(x, y, 0)
    obj.renderOrder = 2
    obj.userData.kind = 'bubble'
    this.scene.add(obj)
    this.items.push({ kind: 'bubble', obj, x, y, phase: rand(0, 6) })
  }

  /** A curled-up hedgehog that rolls along the path towards Pip. */
  hedgehog(x) {
    const { obj, ball } = makeHedgehog()
    obj.position.set(x, 0, 0)
    this.scene.add(obj)
    this.items.push({ kind: 'obstacle', name: 'hedgehog', obj, ball, x, ...HEDGEHOG, hit: false, cleared: false, stomped: false, wobble: 0, rolling: true })
  }

  /** A balloon on a string, bobbing over the path: run into it and Pip floats up and away. */
  balloon(x) {
    const color = pick(BALLOONS)
    const obj = makeBalloon(color)
    obj.position.set(x, 0.6, 0)
    this.scene.add(obj)
    this.items.push({ kind: 'balloon', obj, x, color, phase: rand(0, 6), used: false, wobble: 0 })
  }

  /** A soft rainbow arching over a stretch of path, behind it. */
  rainbow(x, span) {
    const obj = makeRainbow(span)
    obj.position.set(x, 0, -6)
    this.scene.add(obj)
    this.items.push({ kind: 'scenery', obj, x: x + span / 2 })
  }

  /**
   * A bump knocks a couple of carrots out of Pip's basket: they tumble forward onto the path just
   * ahead, so he can munch them back up if he stays on the ground.
   */
  scatter(x, count) {
    for (let i = 0; i < count; i++) {
      const it = this.carrot(x + 0.3, 1.3)
      it.vy = rand(5, 7)
      it.vx = 3 + i * 1.4
      it.wait = 0.5
      it.obj.rotation.z = rand(-1, 1)
    }
  }

  /** A golden carrot's surprise: carrots tumble out of the sky onto the path just ahead of Pip. */
  shower(x, speed, count = 6) {
    for (let i = 0; i < count; i++) {
      const it = this.carrot(x + speed * (1.3 + i * 0.3), rand(4.2, 5.4))
      it.vy = rand(-1, 0)
      it.obj.rotation.z = rand(-1, 1)
    }
  }

  /**
   * Animates the course and drops what's behind behindX. With a bunny ({ x, y, vy, grounded, tumbling })
   * it also catches carrots and checks for bumps, bounces and springs; pass null to only animate.
   * Returns this frame's events (carrot / bump / stomp / spring); the array is reused next frame.
   */
  update(dt, bunny, time, behindX) {
    const events = this.events
    events.length = 0
    keepWhere(this.items, (it) => {
      const o = it.obj
      if (it.kind === 'carrot') {
        if (it.vy !== undefined) {
          // falling from a shower (or tossed out in a bump): drop, land with a little bounce, then settle
          it.vy -= FALL * dt
          it.y += it.vy * dt
          if (it.vx) {
            it.x += it.vx * dt
            o.position.x = it.x
          }
          if (it.y <= CARROT_Y) {
            it.y = CARROT_Y
            it.vy = Math.abs(it.vy) > 3 ? -it.vy * 0.35 : undefined
            it.vx = it.vy === undefined ? 0 : it.vx * 0.5
            if (it.vy === undefined) o.rotation.z = -0.35
          }
          o.position.y = it.y
        } else {
          o.position.y = it.y + Math.sin(time * 3 + it.phase) * 0.08
        }
        o.rotation.y += dt * (it.gold ? 3 : 2)
        if (it.glow) {
          it.glow.position.set(it.x, o.position.y + 0.15, -0.3)
          it.glow.scale.setScalar((it.flip ? 2.3 : 1.75) + Math.sin(time * 2 + it.phase) * 0.12)
        }
        if (bunny && this.eat(it, bunny, dt, events)) return false
      } else if (it.kind === 'balloon') {
        if (!it.used) {
          o.position.y = 0.6 + Math.sin(time * 1.8 + it.phase) * 0.15
          o.rotation.z = Math.sin(time * 1.3 + it.phase) * 0.08
          if (bunny && Math.abs(it.x - bunny.x) < 0.9 && bunny.y < 2.2 && !bunny.tumbling) {
            it.used = true
            events.push({ type: 'balloon', obj: o, color: it.color })
            return false // Pip holds it now: the game carries it along
          }
        }
      } else if (it.kind === 'bubble') {
        o.position.y = it.y + Math.sin(time * 1.5 + it.phase) * 0.2
        o.scale.setScalar(1 + Math.sin(time * 3 + it.phase) * 0.04)
        if (bunny && Math.hypot(it.x - bunny.x, o.position.y - (bunny.y + 0.75)) < 0.95) {
          events.push({ type: 'bubble', pos: o.position.clone() })
          this.scene.remove(o)
          return false
        }
      } else if (it.kind === 'water') {
        if (bunny) this.splash(it, bunny, dt, events)
      } else if (it.kind !== 'scenery') {
        if (it.rolling && bunny && it.x - bunny.x < 26) {
          // a hedgehog rolls towards Pip, turning as it goes (it stops once he is past)
          const v = it.x > bunny.x - 2 ? 2.4 : 0
          it.x -= v * dt
          o.position.x = it.x
          it.ball.rotation.z += (v * dt) / 0.52
        }
        if (bunny) it.kind === 'spring' ? this.boing(it, bunny, events) : this.bump(it, bunny, events)
        if (o.userData.boing) {
          o.userData.boing = 0
          it.wobble = 1
        }
        if (it.wobble > 0) {
          it.wobble = Math.max(0, it.wobble - dt * 1.5)
          const w = Math.sin(it.wobble * 30) * 0.18 * it.wobble
          const [sx, sy] = it.kind === 'spring' ? [0.62, 0.32] : [1, 1]
          o.scale.set(sx * (1 - w * 0.5), sy * (1 + w), sx * (1 - w * 0.5))
          o.rotation.z = w * 0.4
        }
      }
      if (it.x < behindX) {
        this.drop(it)
        return false
      }
      return true
    })
    return events
  }

  drop(it) {
    this.scene.remove(it.obj)
    if (it.glow) this.scene.remove(it.glow)
  }

  /** The logs, pumpkins, snowmen and springs on the path, for taps. */
  obstacles() {
    return this.items.filter((it) => it.kind !== 'carrot' && it.kind !== 'scenery').map((it) => it.obj)
  }

  /** Returns true when the bunny munches this carrot. */
  eat(it, bunny, dt, events) {
    const o = it.obj
    if (it.wait > 0) {
      it.wait -= dt
      return false
    }
    const cx = bunny.x
    const cy = bunny.y + 0.75
    let dx = it.x - cx
    let dy = o.position.y - cy
    const d = Math.hypot(dx, dy)
    const goldReach = bunny.grounded || (it.flip && bunny.jumps < 2) ? PICKUP : bunny.rapidFlip ? 2.7 : GOLD_MAGNET
    if (d < (it.gold ? goldReach : MAGNET) && dx > -0.8) {
      // drift towards the bunny so near misses still count
      const pull = Math.min(1, dt * (it.gold && bunny.rapidFlip ? 12 : 7))
      it.x -= dx * pull
      it.y -= dy * pull
      o.position.x = it.x
      dx = it.x - cx
      dy = it.y - cy
    }
    if (Math.hypot(dx, dy) >= PICKUP) return false
    events.push({ type: 'carrot', gold: it.gold, flip: it.flip, pos: o.position.clone() })
    this.drop(it)
    return true
  }

  /**
   * Running into a spring, taking off from it, or coming down anywhere near it bounces Pip sky
   * high, once: a hop that would land just past it is pulled onto it, so holding or tapping away
   * never skips a spring.
   */
  boing(it, bunny, events) {
    if (it.used || bunny.tumbling) return
    const dx = it.x - bunny.x
    const onIt = Math.abs(dx) < it.w && bunny.y < it.h + 0.15
    const dropping = bunny.vy <= 0.5 && bunny.y < 1.6 && dx > -(it.w + 0.3) && dx < it.w + 1.2
    if (onIt || dropping) {
      it.used = true
      it.wobble = 1
      events.push({ type: 'spring', pos: it.obj.position.clone() })
    }
  }

  /** The stepping stone (index) within reach of x in a stream: generous, so a landing snaps to it. */
  stoneAt(it, x) {
    let best = -1
    it.stones.forEach((sx, i) => {
      if (Math.abs(sx - x) < STONE_REACH && (best < 0 || Math.abs(sx - x) < Math.abs(it.stones[best] - x))) best = i
    })
    return best
  }

  /**
   * Pip running through water splashes now and then; once he is past a stream with every stone
   * hopped (the first may be skipped) and no splash after the first, it was perfect.
   */
  splash(it, bunny, dt, events) {
    it.cool -= dt
    if (!it.done && bunny.x > it.x1) {
      it.done = true
      // (a stream's first stone may be skipped; a brook's two both count)
      if (it.stones.length && it.hits.size >= Math.max(2, it.stones.length - 1) && it.wet === 0) events.push({ type: 'perfect', pos: new THREE.Vector3(it.x1, 1, 0) })
    }
    if (!bunny.grounded || bunny.x < it.x0 || bunny.x > it.x1 || this.stoneAt(it, bunny.x) >= 0) return
    if (it.cool <= 0) {
      it.cool = 0.4
      if (it.hits.size) it.wet++
      events.push({ type: 'splash', big: false, pos: new THREE.Vector3(bunny.x, 0.1, 0) })
    }
  }

  /**
   * Pip has just landed at x (called by the game from the bunny's own landing, so a hop straight
   * on from the landing still counts): a plink on a stepping stone, or a big splash in water.
   */
  landing(x) {
    for (const it of this.items) {
      if (it.kind !== 'water' || x < it.x0 || x > it.x1) continue
      const stone = this.stoneAt(it, x)
      if (stone >= 0) {
        it.hits.add(stone)
        return { type: 'stone', step: stone, pos: new THREE.Vector3(it.stones[stone], 0.45, 0) }
      }
      if (it.hits.size) it.wet++
      it.cool = 0.4
      return { type: 'splash', big: true, pos: new THREE.Vector3(x, 0.1, 0) }
    }
    return null
  }

  bump(it, bunny, events) {
    if (it.hit || it.cleared) return
    const o = it.obj
    const dx = it.x - bunny.x
    // dropping onto the top of one: a happy bounce off it, never a bump
    if (!it.stomped && bunny.vy < 0 && Math.abs(dx) < it.w + 0.2 && bunny.y > it.h * 0.55 && bunny.y < it.h + 0.2) {
      it.stomped = true
      it.cleared = true
      it.wobble = 1
      events.push({ type: 'stomp', pos: o.position.clone(), name: it.name, h: it.h })
    } else if (!bunny.tumbling && Math.abs(dx) < it.w * 0.7 + 0.25 && bunny.y < it.h * 0.55) {
      it.hit = true
      it.wobble = 1
      events.push({ type: 'bump', pos: o.position.clone() })
    } else if (dx < -(it.w + 0.3)) {
      it.cleared = true
    }
  }
}

// The surprises' models, built from simple shapes (the burrow keeps one of each it has met).
export const BALLOONS = ['#ff6b9d', '#ffcf1a', '#36a8ff', '#b28dff']

/** A curled-up hedgehog: { obj, ball } (the ball turns as it rolls). */
export function makeHedgehog() {
  const obj = new THREE.Group()
  const ball = new THREE.Group()
  ball.position.y = 0.42
  const spikeMat = new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.8 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 14), new THREE.MeshStandardMaterial({ color: '#c99a6b', roughness: 0.7 }))
  ball.add(body)
  const spike = new THREE.ConeGeometry(0.07, 0.22, 6)
  for (let i = 0; i < 46; i++) {
    // spread over the back (not the tummy, where the face peeks out)
    const y = 1 - (i / 45) * 1.6
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const a = i * 2.4
    const dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)
    if (dir.x < -0.55 && Math.abs(dir.y) < 0.5) continue
    const m = new THREE.Mesh(spike, spikeMat)
    m.position.copy(dir).multiplyScalar(0.4)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    ball.add(m)
  }
  const face = new THREE.Group()
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color: '#f0d2ac', roughness: 0.6 }))
  snout.position.set(-0.4, 0, 0)
  const dark = new THREE.MeshStandardMaterial({ color: '#2b1d14', roughness: 0.4 })
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), dark)
  nose.position.set(-0.52, 0.02, 0)
  face.add(snout, nose)
  for (const z of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), dark)
    eye.position.set(-0.34, 0.12, z)
    face.add(eye)
  }
  ball.add(face)
  obj.add(ball)
  obj.scale.setScalar(1.25)
  obj.traverse((o) => (o.castShadow = o.isMesh))
  obj.userData.kind = 'hedgehog'
  return { obj, ball }
}

/** A balloon on a string; the string hangs down to 0.48 below the group's origin. */
export function makeBalloon(color) {
  const obj = new THREE.Group()
  const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: 0.15 })
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), skin)
  ball.scale.y = 1.15
  ball.position.y = 1.55
  ball.castShadow = true
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 10), skin)
  knot.position.y = 0.88
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }))
  string.position.y = 0.17
  obj.add(ball, knot, string)
  obj.userData.kind = 'balloon'
  return obj
}

/** A soft rainbow, `span` across. */
export function makeRainbow(span) {
  const obj = new THREE.Group()
  const colors = ['#ff6b6b', '#ff9f1c', '#ffd23f', '#8ac926', '#36a8ff', '#b28dff']
  colors.forEach((color, i) => {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(span / 2 - i * 0.55, 0.28, 6, 48, Math.PI),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false }),
    )
    obj.add(band)
  })
  obj.scale.set(1, 0.42, 1)
  return obj
}
