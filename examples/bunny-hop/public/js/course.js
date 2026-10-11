import * as THREE from 'three'
import { BIOME_LENGTH, BIOMES, FLOWERS, JOURNEY, OBSTACLES, START_X, biomeIndexAt } from './biomes.js'
import { copy } from './models.js'
import { canvasTexture } from './world.js'
import { keepWhere, pick, rand, randInt } from './util.js'

/**
 * Row carrots hang at hop height: Pip only gets one by hopping as it comes (nothing pulls it in),
 * so a well-timed hop matters and a carrot can get away. Running underneath never catches one.
 */
const ROW_Y = 2.8
/**
 * Some carrots grow in the grass instead: Pip munches one only by staying on the ground as it
 * comes, and a hop sails over it. Hopping at everything misses these, so looking (or knowing the
 * pattern) matters.
 */
const GRASS_Y = 0.3
const PICKUP = 1.05 // generous: a carrot this close to the bunny's middle is caught
const AWAY = 1.1 // a row carrot this far behind Pip's middle has got away

/** A soft golden glow with four rays, behind every golden carrot (still: it does not pulse or spin). */
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
  s.scale.setScalar(1.75)
  s.renderOrder = 2
  return s
}

/**
 * One gentle, constant hopping pace for the whole trip (calm pass: it used to ramp from 6.2 to
 * 9.4 by the snow). Callers still pass a position, so a future pace can vary by place.
 */
export const speedAt = () => 6.6

/**
 * Path between the carrots of a counted row: one hop for each (a hop covers about 5 at full pace),
 * with a breath on the ground between, and room to say each number as Pip munches it.
 */
export const ROW_STEP = 6.2
/** Path between the obstacles of a rhythm: evenly spaced, so hopping them makes a steady beat. */
export const BEAT = 8
const GAP = 18 // quiet path between one row or rhythm and the next
const UNITS = 3 // a rhythm plays its pattern three times; the third time stops to ask what comes next
const RHYTHM_MAX = 9 // the longest rhythm (three repeats of three, or the growing pattern): path is kept for it
const RHYTHM_LEN = (RHYTHM_MAX - 1) * BEAT
/**
 * Spare carrots in a basket row: they grow with the order (a 4-basket row has 6), so a child who
 * hops at everything catches too many, and only stopping when the basket is full comes out right.
 */
export const spares = (n) => Math.max(2, Math.ceil(n / 2))
/** Room kept after a row when the trip starts on catching whole rows, in case the child steps up. */
const EXTRA = 2
/** a, then b and c in either order: the place's own obstacle leads, and the others swap from trip to trip. */
function kindsOf(biome) {
  const [a, ...rest] = BIOMES[biome].kinds
  return [a, ...(Math.random() < 0.5 ? rest : rest.reverse())]
}
const shuffled = (list) => list.map((v) => [Math.random(), v]).sort((p, q) => p[0] - q[0]).map(([, v]) => v)

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

/** A little mound of earth under a carrot growing in the grass (a child of the carrot, so it goes with it). */
let moundParts
function mound() {
  moundParts ??= [new THREE.SphereGeometry(0.42, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 1 })]
  const m = new THREE.Mesh(...moundParts)
  m.scale.set(1, 0.28, 0.75)
  m.position.y = -GRASS_Y / 1.1
  m.receiveShadow = true
  return m
}

/**
 * A soft bank of mist over what is still to come in a pattern, once the child has answered:
 * the obstacle or carrot under it shows only as Pip reaches it, so knowing the pattern tells
 * Pip whether to hop or stay down.
 */
let mistMaterial
function mistMarker() {
  if (!mistMaterial) {
    // a dense, blue-grey cloud (it reads on the pale path and on snow) with a soft, still "?" inside:
    // something is hiding here, and the pattern says what
    const map = canvasTexture(128, 96, (g) => {
      for (const [x, y, r] of [[30, 62, 30], [64, 44, 38], [98, 62, 30], [64, 68, 34]]) {
        const grad = g.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, 'rgba(226,232,246,1)')
        grad.addColorStop(0.65, 'rgba(204,214,236,0.92)')
        grad.addColorStop(1, 'rgba(190,202,230,0)')
        g.fillStyle = grad
        g.beginPath()
        g.arc(x, y, r, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = 'rgba(122,110,170,0.55)'
      g.font = '900 46px ui-rounded, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('?', 64, 58)
    })
    mistMaterial = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false })
  }
  const s = new THREE.Sprite(mistMaterial)
  s.scale.set(3.1, 2.35, 1)
  s.renderOrder = 3
  return s
}
const UNMIST = 1.3 // mist lifts this close to Pip: after the moment to choose a hop

/**
 * The trip is planned as a story, place by place: a counted row of carrots, an obstacle rhythm,
 * a golden carrot to flip for, then a second (bigger or equal) row. Rows grow from 2–3 carrots in
 * the meadow to 5–9 in the snow. Each row and rhythm is shaped as it comes into view, from tiers that
 * follow how the child is doing (shapeRow, shapeRhythm). Pieces are built just ahead of the bunny. A bump never ends the game.
 */
export class Course {
  constructor(scene, templates) {
    this.scene = scene
    this.templates = templates
    this.items = []
    this.events = []
    this.reset()
  }

  /**
   * Clear the course and plan the rest of the trip from x. `maxRow` caps the rows (5 on the 🐢 pace:
   * one ten-frame row); `baskets` keeps room for a full set of spare carrots after every row.
   */
  reset(x = 0, maxRow = Infinity, baskets = false) {
    for (const it of this.items) this.drop(it)
    this.items = []
    this.plan(x, maxRow, baskets)
  }

  plan(x0, maxRow = Infinity, baskets = false) {
    const segments = []
    const golds = []
    const flowers = []
    this.answers = [] // the answers to this trip's "What comes next?", so no answer comes three times running
    this.shapes = [] // the pattern shapes hopped this trip (AB, A🥕🥕…), so each place's pattern is new
    let x = x0 + START_X + 14 // a couple of seconds of plain hopping first, while the tap hint shows
    let first = true
    for (let b = biomeIndexAt(x0); b < BIOMES.length; b++) {
      const biome = BIOMES[b]
      const end = Math.min((b + 1) * BIOME_LENGTH - 4, JOURNEY - 12)
      x = Math.max(x, b * BIOME_LENGTH + 12)
      const [lo, hi] = biome.rows
      const sizes = [randInt(lo, hi), randInt(lo, hi)].map((n) => Math.min(n, maxRow)).sort((p, q) => p - q)
      // every place keeps room for its pattern: when two long basket rows and the rhythm don't all
      // fit, the rows give up spare carrots first (down to two), then carrots, never the pattern
      const rooms = sizes.map((n) => n + (baskets ? spares(n) : EXTRA))
      const most = Math.floor((end - x - RHYTHM_LEN - 2 * GAP) / ROW_STEP) + 2 // the rows' rooms together
      const trim = (i) => (rooms[i] - sizes[i] > (baskets ? 2 : 0) ? (rooms[i]--, true) : sizes[i] > 1 ? (sizes[i]--, rooms[i]--, true) : false)
      while (rooms[0] + rooms[1] > most) {
        const i = rooms[1] >= rooms[0] ? 1 : 0 // the longer row gives first
        if (!trim(i) && !trim(1 - i)) break
      }
      const add = (seg, len) => {
        if (x + len > end) return false
        Object.assign(seg, { x, end: x + len, biome: b })
        segments.push(seg)
        x += len + GAP
        return true
      }
      let rhythmLaid = false
      const row = (n, wanted) => {
        // a row too long for what's left of this place (and its pattern, if still to come) shrinks to
        // fit; `room` is how many carrots fit
        const fit = Math.floor((end - (rhythmLaid ? 0 : RHYTHM_LEN + GAP) - x) / ROW_STEP) + 1
        n = Math.min(n, fit)
        if (n < 1) return
        const room = Math.min(wanted, fit)
        // the trip's first row all hangs up high (hop to catch); after that about two in five grow in
        // the grass, never three in a row, so a row asks for looking, not hopping at everything
        const low = []
        for (let i = 0; i < room; i++) low.push(!first && !(low[i - 1] && low[i - 2]) && Math.random() < 0.4)
        if (add({ kind: 'row', n, planned: n, room, low, got: 0, missed: 0, over: 0, early: 0, hops: 0 }, (room - 1) * ROW_STEP)) first = false
      }
      const rhythm = () => {
        // a rhythm's pattern is chosen when it comes into view (shapeRhythm), from how the child is doing
        if (!add({ kind: 'rhythm', passed: 0, got: 0, missed: 0, bumps: 0 }, RHYTHM_LEN)) return
        rhythmLaid = true
        golds.push(x - GAP / 2)
        // after the pattern, two wild flowers of different colours grow in the grass, either side of
        // the golden carrot: stay down to pick one for Pip's door, or hop on by
        const [c1, c2] = shuffled(Object.keys(FLOWERS))
        flowers.push({ x: x - GAP + 4.5, color: c1 }, { x: x - GAP / 4, color: c2 })
      }
      // each place tells its story in its own order, so no two trips feel the same
      const order = pick([[row, rhythm, row], [rhythm, row, row], [row, row, rhythm]])
      let r = 0
      for (const step of order) step === row ? (row(sizes[r], rooms[r]), r++) : rhythm()
    }
    this.segments = segments
    this.golds = golds
    this.flowers = flowers
    this.spawned = 0
    this.goldsSpawned = 0
    this.flowersSpawned = 0
  }

  carrot(x, y, gold = false, seg = null, index = 0) {
    const obj = copy(this.templates[gold ? 'carrot_gold' : 'carrot'], { shadow: true })
    obj.position.set(x, y, 0)
    obj.scale.setScalar(gold ? 1.45 : 1.1)
    obj.rotation.z = -0.35
    // golden carrots glow and twinkle, so they read as special from far away
    const glow = gold ? halo() : null
    if (glow) this.scene.add(glow)
    // a carrot in the grass stands upright on a little mound of earth, as if it is growing there
    const low = y < 1
    if (low) {
      obj.rotation.z = rand(-0.12, 0.12)
      obj.add(mound())
    }
    this.scene.add(obj)
    const item = { kind: 'carrot', gold, low, obj, glow, x, y, phase: rand(0, 6), seg, index }
    this.items.push(item)
    return item
  }

  /** A wild flower to pick (a petal colour from FLOWERS), standing in the grass on the path. */
  flower(x, color) {
    const obj = copy(this.templates.flower, { recolor: { petal: [FLOWERS[color].hex] }, shadow: true })
    obj.position.set(x, 0, 0)
    obj.scale.setScalar(1.5)
    obj.rotation.y = rand(-0.4, 0.4)
    // on a little mound of earth, like a carrot in the grass: something on a mound is Pip's to pick
    // by staying down (the meadow's own flowers grow straight from the grass, and keep clear of these)
    const m = mound()
    m.position.y = 0
    m.scale.multiplyScalar(1.25 / 1.5)
    obj.add(m)
    this.scene.add(obj)
    const item = { kind: 'flower', color, obj, x, y: GRASS_Y, phase: rand(0, 6) }
    this.items.push(item)
    return item
  }

  obstacle(x, name, seg = null, index = 0) {
    const obj = copy(this.templates[name], { recolor: BIOMES[biomeIndexAt(x)].recolor, shadow: true })
    obj.position.set(x, 0, 0)
    obj.rotation.y = name === 'log' ? rand(-0.15, 0.15) : rand(-0.6, 0.6)
    obj.userData.kind = name // tappable: a poke sets userData.boing, and it wobbles
    this.scene.add(obj)
    const item = { kind: 'obstacle', name, obj, x, ...OBSTACLES[name], hit: false, cleared: false, wobble: 0, seg, index }
    this.items.push(item)
    return item
  }

  /**
   * A row on tier 0 is exactly Pip's order: catch them all. On the basket tiers (1, 2) the row holds
   * more carrots than the basket (spares grow with the order), so the child counts and stops hopping
   * when it is full. A row planned without room for enough spares asks for fewer carrots instead.
   */
  shapeRow(seg, tier) {
    seg.n = seg.planned
    seg.basket = tier > 0 && seg.room >= 4
    if (seg.basket) {
      while (seg.n > 2 && seg.room - seg.n < spares(seg.n)) seg.n--
      seg.count = Math.min(seg.room, seg.n + spares(seg.n))
    } else seg.count = seg.n
    // tier 2 shows only the number: no empty places to match carrots against, so the child keeps count
    seg.counting = seg.basket && tier >= 2
    seg.end = seg.x + (seg.count - 1) * ROW_STEP
  }

  /**
   * The fewest carrots Pip could be asked for across the whole trip, whatever tier the child moves to
   * on the way: each row's order as a whole row or as a basket (which may ask for fewer, to leave room
   * for spares). Patterns count none, as some patterns are all obstacles. Perfect play always brings
   * home at least this many, so a winter goal set below it can always be met.
   */
  surest() {
    return this.segments.reduce((sum, seg) => {
      if (seg.kind !== 'row') return sum
      let n = seg.planned
      if (seg.room >= 4) while (n > 2 && seg.room - n < spares(n)) n--
      return sum + Math.min(seg.planned, n)
    }, 0)
  }

  /**
   * The pattern ladder. Every pattern mixes the place's obstacles (hop!) with carrots growing in the
   * grass (stay down and munch), so a pattern is also a rhythm of hops and rests.
   * Tier 0: two answers, from eight shapes so the places don't all sound alike: with a carrot (A🥕,
   * 🥕A, AA🥕, A🥕🥕, A🥕A) or, at most once a trip, two obstacles (AB, AAB); a shape comes once a trip
   * while there are others left (`this.shapes`). Tier 1: ABC, ACB, ABB or ACC,
   * with all three as answers. Tier 2: a growing pattern, where repeating the last group is not the
   * answer: AB, AAB, AAA? (one more a) or AB, AAB, AAA then ? (the b that closes it), or AB, ABB, ABB? (b).
   * Tiers 0 and 1 ask about any step of the pattern: one of the second go, once the whole pattern and
   * the start of its repeat have gone by, or the first step of the third go, after two whole goes.
   * The answer is a carrot about half the time, and never the same thing three times running
   * (`this.answers`), so the pattern has to be read: no one picture is usually right.
   */
  shapeRhythm(seg, tier) {
    seg.kinds ??= kindsOf(seg.biome) // kept if the rhythm is shaped again, so its first obstacle never changes
    const [a, b] = seg.kinds
    const c = 'carrot'
    // every way this rhythm could go at this tier, weighted so each pattern is equally likely
    const options = []
    if (tier >= 2) {
      for (const [p, q] of [[a, c], [a, b]]) {
        const growA = [[p, q], [p, p, q], [p, p, p, q]]
        options.push({ groups: growA, unit: [p, q], growing: p, ask: 7, w: 0.3 }, { groups: growA, unit: [p, q], growing: p, ask: 8, w: 0.3 })
        options.push({ groups: [[p, q], [p, q, q], [p, q, q, q]], unit: [p, q], growing: q, ask: 8, w: 0.4 })
      }
    } else {
      // [unit, weight]: the two-obstacle shapes are a little rarer, as a pattern of hops and rests is the heart of it
      const units = tier
        ? [[a, b, c], [a, c, b], [a, b, b], [a, c, c]].map((u) => [u, 1])
        : [[[a, c], 1], [[c, a], 1], [[a, a, c], 1], [[a, c, c], 1], [[a, c, a], 1], [[a, b], 0.7], [[a, a, b], 0.7]]
      for (const [unit, w] of units) {
        const n = unit.length
        for (let ask = n + 1; ask <= 2 * n; ask++) options.push({ groups: Array.from({ length: UNITS }, () => unit), unit, growing: null, ask, w: w / n })
      }
    }
    for (const o of options) {
      o.answer = o.groups.flat()[o.ask]
      // the shape, with the carrot kept apart from the obstacles: A🥕🥕 and ABB are different shapes
      const letters = new Map()
      o.shape = o.unit.map((k) => (k === c ? 'c' : letters.get(k) ?? (letters.set(k, 'AB'[letters.size]), letters.get(k)))).join('') + (o.growing ? `+${o.growing === o.unit[0] ? 1 : 2}@${o.ask}` : '')
    }
    const [p1, p2] = this.answers?.slice(-2) ?? []
    const shapes = this.shapes ?? []
    const keep = (o) =>
      !(p1 && p1 === p2 && o.answer === p1) &&
      !shapes.includes(o.shape) &&
      !(o.unit.every((k) => k !== c) && !o.growing && shapes.some((sh) => !sh.includes('c'))) &&
      // shaped again (the child's tier changed as it was cued): the first step in view stays as it was
      !(seg.first && o.groups[0][0] !== seg.first)
    const pool = [keep, (o) => !(seg.first && o.groups[0][0] !== seg.first), () => true].map((f) => options.filter(f)).find((l) => l.length)
    let r = Math.random() * pool.reduce((sum, o) => sum + o.w, 0)
    const chosen = pool.find((o) => (r -= o.w) < 0) ?? pool[0]
    const { groups } = chosen
    seg.first ??= groups[0][0]
    seg.shape = chosen.shape
    seg.unit = chosen.unit
    seg.growing = chosen.growing
    seg.ask = chosen.ask
    // tier 0's first pattern of the trip offers just its own two pictures; after that a third joins
    // (the place's other obstacle or a carrot), so a lucky tap is one in three, not a coin toss
    const opener = this.segments.find((s) => s.kind === 'rhythm') === seg
    seg.choices = shuffled(tier || !opener ? [a, b, c] : [...new Set(chosen.unit)])
    seg.items = groups.flat()
    seg.starts = groups.map((_, g) => groups.slice(0, g).flat().length) // where each group begins, for the strip
    seg.carrots = seg.items.filter((name) => name === c).length
    // with only two pictures (tier 0's first pattern), a first miss brings in a third, so the second go is still a choice
    seg.spare = seg.choices.length < 3 ? [a, b, c].find((k) => !seg.unit.includes(k)) : null
    seg.end = seg.x + (seg.items.length - 1) * BEAT
  }

  /**
   * Where the path forks, the child chose a patch of `size` carrots: that patch becomes the row. Pip's
   * basket still holds `seg.n`, so a patch with one too many asks him to stop at full, and one with
   * too few can't fill it.
   */
  layPatch(seg, size) {
    seg.patch = size
    seg.basket = true
    seg.count = Math.min(size, seg.room)
    seg.end = seg.x + (seg.count - 1) * ROW_STEP
    for (let i = 0; i < seg.count; i++) this.carrot(seg.x + i * ROW_STEP, seg.low[i] ? GRASS_Y : ROW_Y, false, seg, i)
  }

  /** Builds a planned row or rhythm on the path, shaped by `tier` ({ row, pattern }). */
  build(seg, tier) {
    seg.shaped = seg.kind === 'row' ? tier.row : tier.pattern
    if (seg.kind === 'row') {
      // a fork's carrots wait for the child to choose a patch (see `layPatch`)
      if (seg.fork) {
        if (seg.patch) return this.layPatch(seg, seg.patch)
        return this.shapeRow(seg, tier.row)
      }
      this.shapeRow(seg, tier.row)
      for (let i = 0; i < seg.count; i++) this.carrot(seg.x + i * ROW_STEP, seg.low[i] ? GRASS_Y : ROW_Y, false, seg, i)
      return
    }
    this.shapeRhythm(seg, tier.pattern)
    seg.items.forEach((name, i) => {
      const x = seg.x + i * BEAT
      const it = name === 'carrot' ? this.carrot(x, GRASS_Y, false, seg, i) : this.obstacle(x, name, seg, i)
      // the "?" stands in for the hidden step; the steps after it stay out of sight until the answer
      if (i < seg.ask) return
      it.obj.visible = false
      it.hidden = true
      if (i === seg.ask) {
        it.marker = askMarker()
        it.marker.position.set(x, 1.1, 0)
        this.scene.add(it.marker)
      }
    })
  }

  /**
   * Builds the planned rows and rhythms that are coming into view. A row or rhythm is shaped for
   * the tier of the moment, and shaped again when it is cued (see `reshape`).
   */
  generate(aheadX, tier = { row: 0, pattern: 0 }) {
    while (this.spawned < this.segments.length && this.segments[this.spawned].x < aheadX) {
      const seg = this.segments[this.spawned++]
      seg.built = true
      this.build(seg, tier)
    }
    while (this.goldsSpawned < this.golds.length && this.golds[this.goldsSpawned] < aheadX) {
      // a golden carrot up high: flip for it!
      this.carrot(this.golds[this.goldsSpawned++], 4.5, true)
    }
    while (this.flowersSpawned < this.flowers.length && this.flowers[this.flowersSpawned].x < aheadX) {
      const { x, color } = this.flowers[this.flowersSpawned++]
      this.flower(x, color)
    }
  }

  /**
   * As a row or rhythm is cued, it is shaped again if the child's tier has changed since it was
   * built, so a step up or down shows in the very next row. Only its far end is still out of view:
   * a row's carrots stand where they were (spares come and go at the end), and a rhythm keeps its
   * first obstacle.
   */
  reshape(seg, tier) {
    if (!seg.built || seg.shaped === (seg.kind === 'row' ? tier.row : tier.pattern)) return
    keepWhere(this.items, (it) => {
      if (it.seg !== seg) return true
      this.drop(it)
      return false
    })
    this.build(seg, tier)
  }

  drop(it) {
    this.scene.remove(it.obj)
    if (it.glow) this.scene.remove(it.glow)
    if (it.marker) this.scene.remove(it.marker)
  }

  /**
   * Shows the step a pattern was hiding behind its "?" (after the child has guessed). The steps
   * after it go under mist, each showing only as Pip reaches it, so the pattern says hop or stay.
   */
  reveal(seg) {
    let at = null
    for (const it of this.items) {
      if (it.seg !== seg || !it.hidden) continue
      if (it.marker) this.scene.remove(it.marker)
      it.marker = null
      if (it.index === seg.ask) {
        this.unveil(it)
        at = it.obj.position
      } else {
        it.marker = mistMarker()
        it.marker.position.set(it.x, 1.0, 0.2)
        this.scene.add(it.marker)
        it.misty = true
      }
    }
    return at
  }

  unveil(it) {
    it.hidden = it.misty = false
    it.obj.visible = true
    it.wobble = 1
    if (it.marker) this.scene.remove(it.marker)
    it.marker = null
  }

  /**
   * Animates the course and drops what's behind behindX. With a bunny ({ x, y, grounded, tumbling })
   * it also catches carrots and checks for bumps; pass null to only animate.
   * Returns this frame's events (carrot / missed / bump / cleared / unmist / flower / flowerAhead); the array is reused next frame.
   */
  update(dt, bunny, time, behindX) {
    const events = this.events
    events.length = 0
    keepWhere(this.items, (it) => {
      const o = it.obj
      if (it.misty && bunny && it.x - bunny.x < UNMIST) {
        this.unveil(it)
        events.push({ type: 'unmist', seg: it.seg, index: it.index, pos: o.position.clone() })
      }
      if (it.kind === 'flower') {
        // it nods gently in the breeze; Pip picks it by staying down as it comes
        o.rotation.z = Math.sin(time * 1.3 + it.phase) * 0.06
        if (bunny && !it.seen && it.x - bunny.x < 14) {
          it.seen = true
          events.push({ type: 'flowerAhead', color: it.color })
        }
        if (bunny && Math.abs(it.x - bunny.x) < 0.9 && bunny.y < 0.9) {
          events.push({ type: 'flower', color: it.color, pos: o.position.clone() })
          this.scene.remove(o)
          return false
        }
      } else if (it.kind === 'carrot') {
        // hanging carrots turn slowly; one growing in the grass stays still
        if (!it.low) {
          o.rotation.y += dt * (it.gold ? 1.2 : 1)
          o.position.y = it.y + Math.sin(time * 1.6 + it.phase) * 0.06
        }
        if (it.glow) it.glow.position.set(it.x, o.position.y + 0.15, -0.3)
        if (bunny && this.eat(it, bunny, events)) return false
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
        this.drop(it)
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

  /**
   * Returns true when the bunny munches this carrot. Nothing pulls a carrot in: Pip has to be up
   * where it hangs, or down on the ground for one growing in the grass. A row or pattern carrot left
   * behind has got away (one 'missed' event, and it stays put).
   */
  eat(it, bunny, events) {
    if (it.missed) return false
    const o = it.obj
    const dx = it.x - bunny.x
    // one growing in the grass is munched only with Pip's feet on the ground: a hop that skims it
    // (taking off or landing) goes over it, so staying down is the way to get it
    const reach = it.low && bunny.grounded === false ? false : Math.hypot(dx, o.position.y - (bunny.y + 0.75)) < PICKUP
    if (!reach) {
      if (it.seg && dx < -AWAY) {
        it.missed = true
        events.push({ type: 'missed', seg: it.seg, index: it.index })
      }
      return false
    }
    events.push({ type: 'carrot', gold: it.gold, pos: o.position.clone(), seg: it.seg, index: it.index })
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
