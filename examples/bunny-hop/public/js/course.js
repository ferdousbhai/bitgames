import * as THREE from 'three'
import { BIOMES, JOURNEY, OBSTACLES, START_X, biomeIndexAt } from './biomes.js'
import { GRAVITY, HOP } from './bunny.js'
import { copy } from './models.js'
import { keepWhere, pick, rand } from './util.js'

const CARROT_Y = 0.6
const PICKUP = 1.05 // generous: a carrot this close to the bunny's middle is caught
const MAGNET = 1.6 // and carrots this close drift towards the bunny (not golden ones: those need a flip)

/** A soft golden glow with four twinkle rays, behind every golden carrot. */
let haloMaterial
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
  s.scale.setScalar(1.6)
  s.renderOrder = 2
  return s
}

/**
 * One gentle, constant hopping pace for the whole trip (calm pass: it used to ramp from 6.2 to
 * 9.4 by the snow). Callers still pass a position, so a future pace can vary by place.
 */
export const speedAt = () => 6.6

/**
 * Carrots to munch and things to hop over, laid out in little patterns ahead
 * of the bunny. The hit test is forgiving and a bump never ends the game.
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
    for (const it of this.items) this.scene.remove(it.obj, ...(it.glow ? [it.glow] : []))
    this.items = []
    this.nextX = x + START_X
    this.possible = 0
    this.patterns = 0
  }

  carrot(x, y, gold = false) {
    const obj = copy(this.templates[gold ? 'carrot_gold' : 'carrot'], { shadow: true })
    obj.position.set(x, y, 0)
    obj.scale.setScalar(gold ? 1.45 : 1.1)
    obj.rotation.z = -0.35
    // golden carrots glow and twinkle, so they read as special from far away
    const glow = gold ? halo() : null
    if (glow) this.scene.add(glow)
    this.scene.add(obj)
    this.items.push({ kind: 'carrot', gold, obj, glow, x, y, phase: rand(0, 6) })
    this.possible += gold ? 5 : 1
  }

  obstacle(x, name) {
    const obj = copy(this.templates[name], { recolor: BIOMES[biomeIndexAt(x)].recolor, shadow: true })
    obj.position.set(x, 0, 0)
    obj.rotation.y = name === 'log' ? rand(-0.15, 0.15) : rand(-0.6, 0.6)
    obj.userData.kind = name // tappable: a poke sets userData.boing, and it wobbles
    this.scene.add(obj)
    this.items.push({ kind: 'obstacle', name, obj, x, ...OBSTACLES[name], hit: false, cleared: false, wobble: 0 })
  }

  /** Carrots along the path a hop takes, centred over x. */
  arc(x, speed, count = 4) {
    const t0 = HOP / GRAVITY // time to the top of the hop
    for (let i = 0; i < count; i++) {
      const t = 0.12 + (i / (count - 1)) * (2 * t0 - 0.24)
      this.carrot(x + speed * (t - t0), HOP * t - (GRAVITY * t * t) / 2 + CARROT_Y)
    }
  }

  /** Lay out the next little pattern; returns how much path it used. */
  pattern(x) {
    const biome = BIOMES[biomeIndexAt(x)]
    const speed = speedAt(x)
    const n = this.patterns++
    const pickObstacle = () => pick(biome.obstacles)
    // The first few teach the game: carrots on the ground, then a single log.
    const r = n === 0 ? 0 : n === 1 ? 0.3 : n < 4 ? 0.45 : Math.random()
    if (r < 0.2) {
      const count = 4 + Math.floor(Math.random() * 3)
      for (let i = 0; i < count; i++) this.carrot(x + i * 1.3, CARROT_Y)
      return count * 1.3
    }
    if (r < 0.55) {
      this.obstacle(x + 3, pickObstacle())
      this.arc(x + 3, speed, 4 + (Math.random() < 0.5 ? 1 : 0))
      return 6
    }
    if (r < 0.7) {
      this.obstacle(x + 2, pickObstacle())
      return 4
    }
    if (r < 0.82) {
      // a staircase in the air: hop to reach it
      const ys = [0.6, 1.4, 2.2, 2.6, 2.2, 1.4]
      ys.forEach((y, i) => this.carrot(x + i * 1.2, y))
      return ys.length * 1.2
    }
    if (r < 0.92 && n > 6) {
      // two hops in a row, with room to land between
      const gap = speed * 0.8 + 3.5
      this.obstacle(x + 2, pickObstacle())
      this.obstacle(x + 2 + gap, pickObstacle())
      this.carrot(x + 2 + gap / 2, CARROT_Y)
      return gap + 5
    }
    // a golden carrot up high: double hop!
    this.obstacle(x + 3, pickObstacle())
    this.carrot(x + 3, 4.5, true)
    this.carrot(x + 3 - speed * 0.25, 2.3)
    this.carrot(x + 3 + speed * 0.25, 2.3)
    return 6
  }

  generate(aheadX) {
    while (this.nextX < aheadX && this.nextX < JOURNEY - 12) {
      const used = this.pattern(this.nextX)
      const speed = speedAt(this.nextX)
      this.nextX += used + speed * rand(0.9, 1.5) + 2
    }
  }

  /**
   * Animates the course and drops what's behind behindX. With a bunny ({ x, y, tumbling })
   * it also catches carrots and checks for bumps; pass null to only animate.
   * Returns this frame's events (carrot / bump / cleared); the array is reused next frame.
   */
  update(dt, bunny, time, behindX) {
    const events = this.events
    events.length = 0
    keepWhere(this.items, (it) => {
      const o = it.obj
      if (it.kind === 'carrot') {
        o.rotation.y += dt * (it.gold ? 4 : 2.5)
        o.position.y = it.y + Math.sin(time * 3 + it.phase) * 0.08
        if (it.glow) {
          it.glow.position.set(it.x, o.position.y + 0.15, -0.3)
          it.glow.scale.setScalar(1.7 + Math.sin(time * 5 + it.phase) * 0.25)
          it.glow.material.rotation = time * 0.8
        }
        if (bunny && this.eat(it, bunny, dt, events)) return false
      } else {
        if (bunny) this.bump(it, bunny, events)
        if (o.userData.boing) {
          o.userData.boing = 0
          it.wobble = 1
        }
        if (it.wobble > 0) {
          it.wobble = Math.max(0, it.wobble - dt * 1.5)
          const w = Math.sin(it.wobble * 30) * 0.18 * it.wobble
          o.scale.set(1 - w * 0.5, 1 + w, 1 - w * 0.5)
          o.rotation.z = w * 0.4
        }
      }
      if (it.x < behindX) {
        this.scene.remove(o)
        if (it.glow) this.scene.remove(it.glow)
        return false
      }
      return true
    })
    return events
  }

  /** The logs, pumpkins and snowmen on the path, for taps. */
  obstacles() {
    return this.items.filter((it) => it.kind === 'obstacle').map((it) => it.obj)
  }

  /** Returns true when the bunny munches this carrot. */
  eat(it, bunny, dt, events) {
    const o = it.obj
    const cx = bunny.x
    const cy = bunny.y + 0.75
    let dx = it.x - cx
    let dy = o.position.y - cy
    const d = Math.hypot(dx, dy)
    if (d < (it.gold ? PICKUP : MAGNET) && dx > -0.8) {
      // drift towards the bunny so near misses still count
      const pull = Math.min(1, dt * 7)
      it.x -= dx * pull
      it.y -= dy * pull
      o.position.x = it.x
      dx = it.x - cx
      dy = it.y - cy
    }
    if (Math.hypot(dx, dy) >= PICKUP) return false
    events.push({ type: 'carrot', gold: it.gold, pos: o.position.clone() })
    this.scene.remove(o)
    if (it.glow) this.scene.remove(it.glow)
    return true
  }

  bump(it, bunny, events) {
    if (it.hit || it.cleared) return
    const o = it.obj
    const dx = it.x - bunny.x
    if (!bunny.tumbling && Math.abs(dx) < it.w * 0.7 + 0.25 && bunny.y < it.h * 0.65) {
      it.hit = true
      it.wobble = 1
      events.push({ type: 'bump', pos: o.position.clone() })
    } else if (dx < -(it.w + 0.3)) {
      it.cleared = true
      events.push({ type: 'cleared', pos: o.position.clone() })
    }
  }
}
