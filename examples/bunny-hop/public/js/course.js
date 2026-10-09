import * as THREE from 'three'
import { BIOME_LENGTH, BIOMES, JOURNEY, OBSTACLES, START_X, biomeIndexAt } from './biomes.js'
import { copy } from './models.js'
import { canvasTexture } from './world.js'
import { keepWhere, pick, rand, randInt } from './util.js'

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

/** Path between the carrots of a counted row: room to say each number as Pip munches it. */
export const ROW_STEP = 4.4
/** Path between the obstacles of a rhythm: evenly spaced, so hopping them makes a steady beat. */
export const BEAT = 8
const GAP = 20 // quiet path between one row or rhythm and the next
const UNITS = 3 // a rhythm plays its pattern three times; the third time may stop to ask what comes next

/** A soft "?" bubble that stands where the next obstacle of a pattern is hidden. */
let askMaterial
function askMarker() {
  if (!askMaterial) {
    const map = canvasTexture(128, 128, (g) => {
      g.fillStyle = 'rgba(255,255,255,0.92)'
      g.strokeStyle = '#ffcf1a'
      g.lineWidth = 10
      g.beginPath()
      g.arc(64, 64, 52, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.fillStyle = '#7a4fc2'
      g.font = '900 78px ui-rounded, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('?', 64, 70)
    })
    askMaterial = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false })
  }
  const s = new THREE.Sprite(askMaterial)
  s.scale.setScalar(1.5)
  s.renderOrder = 3
  return s
}

/**
 * The trip is planned as a story, place by place: a counted row of carrots, an obstacle rhythm,
 * a golden carrot to flip for, then a second (bigger or equal) row. Rows grow from 2–3 carrots in
 * the meadow to 6–10 in the snow. Pieces are built just ahead of the bunny. A bump never ends the game.
 */
export class Course {
  constructor(scene, templates) {
    this.scene = scene
    this.templates = templates
    this.items = []
    this.events = []
    this.reset()
  }

  /** Clear the course and plan the rest of the trip from x. `maxRow` caps the rows (5 on the 🐢 pace: one ten-frame row). */
  reset(x = 0, maxRow = Infinity) {
    for (const it of this.items) this.scene.remove(it.obj, ...(it.glow ? [it.glow] : []), ...(it.marker ? [it.marker] : []))
    this.items = []
    this.plan(x, maxRow)
  }

  plan(x0, maxRow = Infinity) {
    const segments = []
    const golds = []
    let x = x0 + START_X + 14 // a couple of seconds of plain hopping first, while the tap hint shows
    for (let b = biomeIndexAt(x0); b < BIOMES.length; b++) {
      const biome = BIOMES[b]
      const end = Math.min((b + 1) * BIOME_LENGTH - 4, JOURNEY - 12)
      x = Math.max(x, b * BIOME_LENGTH + 12)
      const [lo, hi] = biome.rows
      const sizes = [randInt(lo, hi), randInt(lo, hi)].map((n) => Math.min(n, maxRow)).sort((p, q) => p - q)
      const add = (seg, len) => {
        if (x + len > end) return false
        Object.assign(seg, { x, end: x + len, biome: b })
        segments.push(seg)
        x += len + GAP
        return true
      }
      const row = (n) => {
        // a row too long for what's left of this place shrinks to fit
        n = Math.min(n, Math.floor((end - x) / ROW_STEP) + 1)
        if (n >= 1) add({ kind: 'row', n, got: 0 }, (n - 1) * ROW_STEP)
      }
      row(sizes[0])
      const unit = pick(biome.rhythms)
      const items = Array.from({ length: unit.length * UNITS }, (_, i) => unit[i % unit.length])
      // Ask about one obstacle in the third repeat, once the pattern has been seen twice.
      if (add({ kind: 'rhythm', unit, items, ask: unit.length * 2 + randInt(0, unit.length - 1), passed: 0 }, (items.length - 1) * BEAT)) {
        golds.push(x - GAP / 2)
      }
      row(sizes[1])
    }
    this.segments = segments
    this.golds = golds
    this.spawned = 0
    this.goldsSpawned = 0
  }

  carrot(x, y, gold = false, seg = null, index = 0) {
    const obj = copy(this.templates[gold ? 'carrot_gold' : 'carrot'], { shadow: true })
    obj.position.set(x, y, 0)
    obj.scale.setScalar(gold ? 1.45 : 1.1)
    obj.rotation.z = -0.35
    // golden carrots glow and twinkle, so they read as special from far away
    const glow = gold ? halo() : null
    if (glow) this.scene.add(glow)
    this.scene.add(obj)
    this.items.push({ kind: 'carrot', gold, obj, glow, x, y, phase: rand(0, 6), seg, index })
  }

  obstacle(x, name, seg = null, index = 0, hidden = false) {
    const obj = copy(this.templates[name], { recolor: BIOMES[biomeIndexAt(x)].recolor, shadow: true })
    obj.position.set(x, 0, 0)
    obj.rotation.y = name === 'log' ? rand(-0.15, 0.15) : rand(-0.6, 0.6)
    obj.userData.kind = name // tappable: a poke sets userData.boing, and it wobbles
    obj.visible = !hidden
    const marker = hidden ? askMarker() : null
    if (marker) {
      marker.position.set(x, 1.1, 0)
      this.scene.add(marker)
    }
    this.scene.add(obj)
    this.items.push({ kind: 'obstacle', name, obj, x, ...OBSTACLES[name], hit: false, cleared: false, wobble: 0, seg, index, marker })
  }

  /** Builds the planned rows and rhythms that are coming into view. */
  generate(aheadX) {
    while (this.spawned < this.segments.length && this.segments[this.spawned].x < aheadX) {
      const seg = this.segments[this.spawned++]
      if (seg.kind === 'row') for (let i = 0; i < seg.n; i++) this.carrot(seg.x + i * ROW_STEP, CARROT_Y, false, seg, i)
      else seg.items.forEach((name, i) => this.obstacle(seg.x + i * BEAT, name, seg, i, i === seg.ask))
    }
    while (this.goldsSpawned < this.golds.length && this.golds[this.goldsSpawned] < aheadX) {
      // a golden carrot up high: flip for it!
      this.carrot(this.golds[this.goldsSpawned++], 4.5, true)
    }
  }

  /** Shows the obstacle a pattern was hiding behind its "?" (after the child has guessed). */
  reveal(seg) {
    const it = this.items.find((o) => o.seg === seg && o.index === seg.ask)
    if (!it || it.obj.visible) return null
    it.obj.visible = true
    it.wobble = 1
    if (it.marker) this.scene.remove(it.marker)
    it.marker = null
    return it.obj.position
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
        if (it.marker) it.marker.position.y = 1.1 + Math.sin(time * 2 + it.x) * 0.12
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
        if (it.marker) this.scene.remove(it.marker)
        return false
      }
      return true
    })
    return events
  }

  /** The logs, pumpkins and snowmen on the path, for taps. */
  obstacles() {
    return this.items.filter((it) => it.kind === 'obstacle' && it.obj.visible).map((it) => it.obj)
  }

  /** Returns true when the bunny munches this carrot. */
  eat(it, bunny, dt, events) {
    const o = it.obj
    const cx = bunny.x
    const cy = bunny.y + 0.75
    let dx = it.x - cx
    let dy = o.position.y - cy
    const d = Math.hypot(dx, dy)
    // A counted row is always caught whole: its carrots fly to Pip even mid-hop, so the count is true.
    const row = it.seg && dx < MAGNET
    if (row || (d < (it.gold ? PICKUP : MAGNET) && dx > -0.8)) {
      // drift towards the bunny so near misses still count
      const pull = Math.min(1, dt * (row ? 12 : 7))
      it.x -= dx * pull
      it.y -= dy * pull
      o.position.x = it.x
      dx = it.x - cx
      dy = it.y - cy
    }
    if (Math.hypot(dx, dy) >= PICKUP && !(row && dx < -0.4)) return false
    events.push({ type: 'carrot', gold: it.gold, pos: o.position.clone(), seg: it.seg })
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
      events.push({ type: 'bump', pos: o.position.clone(), seg: it.seg, index: it.index, name: it.name })
    } else if (dx < -(it.w + 0.3)) {
      it.cleared = true
      events.push({ type: 'cleared', pos: o.position.clone(), seg: it.seg, index: it.index, name: it.name })
    }
  }
}
