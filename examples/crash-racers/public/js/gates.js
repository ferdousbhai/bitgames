import * as THREE from 'three'
import { KINDS, pictureTexture } from './houses.js'
import { rng } from './util.js'

/**
 * Present gates for Race and Bumpers: three times round each loop a white gantry
 * spans the road. A house's picture sits on top (🐶), and over each lane hangs
 * a present (🦴 over one, 📖 over the other; three lanes and three presents on
 * the harder step). The child steers (or, in Easy
 * mode, taps the present) to drive under the one that house would like. It is
 * the game's matching lesson inside the race: no colliders. The right lane gives
 * a doorbell, a wave and (racing) a short gift of speed; the other lane simply
 * gives no gift, and the house asks its question. After the car passes, the
 * gate quietly takes a new house and two new presents for the next time round.
 *
 * The top step (`mapped`) moves the house off the gantry and onto the map: the
 * gantry shows 🗺️, and the child finds which house lives at the gate coming up
 * from its pin on the minimap before choosing its present.
 */
const postGeometry = new THREE.BoxGeometry(0.35, 6.4, 0.35)
const barGeometry = new THREE.BoxGeometry(1, 0.45, 0.45)
const gantryMaterial = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.6 })

/** Easy off: a soft coloured strip on the road leading to each present, with the present painted at its start. */
const STRIP_COLOURS = { [-1]: '#6ec6ff', 0: '#ffd35a', 1: '#ff9fbf' }
const STRIP_LENGTH = 30
const stripGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
function flat(material) {
  const m = new THREE.Mesh(stripGeometry, material)
  m.renderOrder = 1
  return m
}
const roadMaterial = (opts) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false, ...opts })
/** Sprites fade out from this far from the camera to NEAR, so a present never fills the screen as the car goes under it. */
const FADE_FAR = 22
const FADE_NEAR = 12

function sprite(map, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, fog: false, toneMapped: false }))
  s.scale.set(size, size, 1)
  return s
}

export function createGates(scene) {
  const group = new THREE.Group()
  group.visible = false
  scene.add(group)
  let gates = []
  let r = Math.random
  let hard = false
  let mapped = false
  let strips = false
  let recent = [] // the houses the last few gates had, so the same pair does not come straight back
  let recentWrong = [] // the houses whose presents were the wrong ones lately, so each gate brings a new distractor

  /** A fair, seeded shuffle of the house indices (Fisher–Yates). */
  function shuffled() {
    const order = KINDS.map((k, i) => i)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    return order
  }

  /** A new house for gate `g`: never one on a gate now (this one's last, or another gate's), and not one of the last two. */
  function pickHouse(g) {
    const kinds = shuffled()
    const free = (k) => k !== g.kindIndex && gates.every((o) => o.kindIndex !== k)
    const pick = kinds.find((k) => free(k) && !recent.includes(k)) ?? kinds.find(free)
    recent = [pick, ...recent].slice(0, 2)
    g.kindIndex = pick
    g.kind = KINDS[pick]
  }

  /**
   * The presents over the lanes of gate `g`: the one its house would like, on a random lane, and the others from other houses.
   * Easy: two lanes. Harder: three lanes and each house's second present (pears, candles), so it is sorting by kind, not by look.
   * Map: the other presents belong to the houses of the other two gates, so every present has a pin on the map, and only
   * working out which pin comes next gives the answer.
   */
  function dressPresents(g) {
    const pick = g.kindIndex
    const sides = hard ? [-1, 0, 1] : [-1, 1]
    const others = []
    if (mapped) for (const o of gates) if (o !== g && o.kindIndex >= 0 && !others.includes(o.kindIndex)) others.push(o.kindIndex)
    // Otherwise (or to fill up): houses that have not lent a wrong present lately, so each gate brings new distractors.
    for (const k of shuffled()) {
      if (others.length >= sides.length - 1) break
      if (k !== pick && !others.includes(k) && !recentWrong.includes(k)) others.push(k)
    }
    for (const k of shuffled()) if (others.length < sides.length - 1 && k !== pick && !others.includes(k)) others.push(k)
    others.length = sides.length - 1
    recentWrong = [...others, ...recentWrong].slice(0, 3)
    const gift = KINDS[pick].gifts[hard ? 1 : 0]
    const wrongs = others.map((k) => KINDS[k].gifts[hard ? (r() < 0.5 ? 0 : 1) : 0])
    g.tapped = null // the lane the child tapped for this gate (Easy mode), kept until the car goes under it
    g.hard = hard
    g.mapped = mapped
    g.sides = sides
    g.side = sides[Math.floor(r() * sides.length)] // the lane (road's left -1, middle 0, right 1) with the present the house would like
    g.lanes = {}
    for (const side of sides) g.lanes[side] = side === g.side ? gift : wrongs.pop()
    g.house.material.map = mapped ? pictureTexture('🗺️', '#fff5df') : pictureTexture(g.kind.emoji, g.kind.colour)
    g.house.material.needsUpdate = true
    // Two lanes sit a quarter of the road in from each edge; three share the road in thirds.
    const gap = sides.length === 3 ? g.width / 3 : g.width / 4
    const size = Math.min(3.4, gap * 1.15)
    for (const side of [-1, 0, 1]) {
      const s = g.presents[side]
      const strip = g.strips[side], paint = g.paints[side]
      s.visible = sides.includes(side)
      strip.visible = paint.visible = strips && s.visible
      if (!s.visible) continue
      s.position.copy(g.at).addScaledVector(g.across, side * gap).setY(4.6)
      s.scale.set(size, size, 1)
      s.material.map = pictureTexture(g.lanes[side].emoji, '#ffffff')
      s.material.needsUpdate = true
      // The lane's strip runs up to the gate, and its present is painted on the road where the strip starts.
      const lane = g.at.clone().addScaledVector(g.across, side * gap)
      strip.position.copy(lane).addScaledVector(g.along, -STRIP_LENGTH / 2 - 1).setY(0.05)
      strip.scale.set(gap * 0.85, 1, STRIP_LENGTH)
      paint.position.copy(lane).addScaledVector(g.along, -STRIP_LENGTH + 2).setY(0.06)
      paint.scale.set(Math.min(2.6, gap * 0.9), 1, Math.min(2.6, gap * 0.9))
      paint.material.map = pictureTexture(g.lanes[side].emoji, STRIP_COLOURS[side])
      paint.material.needsUpdate = true
    }
  }

  /** A map gate whose wrong presents all still belong to houses on the map is left as it is. */
  function freshen(g) {
    if (!g.mapped || !mapped || g.tapped != null) return
    const pins = gates.filter((o) => o !== g).map((o) => KINDS[o.kindIndex].gifts)
    if (g.sides.some((side) => side !== g.side && !pins.some((gifts) => gifts.includes(g.lanes[side])))) dressPresents(g)
  }

  function dress(g) {
    pickHouse(g)
    dressPresents(g)
  }

  function clear() {
    for (const g of gates) g.root.traverse((o) => (o.isSprite || o.geometry === stripGeometry) && o.material.dispose())
    for (const child of [...group.children]) group.remove(child)
    gates = []
  }

  return {
    get gates() { return gates },
    show(value) { group.visible = value },
    clear,

    /** Each frame: the gate's pictures fade away close to the camera (they never fill the screen at the gantry). */
    update(camera, shownElsewhere = null) {
      for (const g of gates) {
        for (const s of [g.house, g.presents[-1], g.presents[0], g.presents[1]]) {
          // The gate whose house is already on the Easy buttons over the gantry (held sideways) shows its house once.
          const o = g === shownElsewhere && s === g.house ? 0 : Math.min(1, Math.max(0, (s.position.distanceTo(camera.position) - FADE_NEAR) / (FADE_FAR - FADE_NEAR)))
          s.material.opacity = o
          s.material.visible = o > 0.02
        }
      }
    },
    /** Easy off: coloured lane strips with the presents painted on the road, so the choice reads at racing speed. */
    setStrips(value) {
      strips = value
      for (const g of gates) for (const side of [-1, 0, 1]) g.strips[side].visible = g.paints[side].visible = strips && g.presents[side].visible
    },

    /** Three gates spread round the loop, clear of ramps and jumps. Deterministic in `seed`. */
    configure(track, seed, { harder = false, onMap = false } = {}) {
      clear()
      recent = []
      recentWrong = []
      r = rng((seed ^ 0x6a7e) >>> 0)
      // A small seed's first numbers lean one way: let the generator settle, so the right lane is a true coin toss.
      for (let i = 0; i < 16; i++) r()
      hard = harder || onMap
      mapped = onMap
      const L = track.length
      // The last gate sits late in the lap, so a right present there still counts on the run to the line.
      for (const at of [0.3, 0.6, 0.88]) {
        // Within 40 m of its spot, the gate goes where the 50 m before it are straightest: on a straight approach no
        // roadside tree stands between the camera and the gate.
        let spot = L * at, straightest = Infinity
        for (let d = L * at - 40; d <= L * at + 40; d += 5) {
          if (track.nearRamp(d, 16)) continue
          const bend = track.bendAt(d - 25, 25)
          if (bend < straightest) {
            straightest = bend
            spot = d
          }
        }
        const dist = track.clearOfRamps(spot, 16)
        const f = track.frameAt(dist)
        const half = track.width / 2 + 0.6
        const root = new THREE.Group()
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(postGeometry, gantryMaterial)
          post.position.copy(f.p).addScaledVector(f.side, side * half).setY(3.2)
          post.castShadow = true
          root.add(post)
        }
        const bar = new THREE.Mesh(barGeometry, gantryMaterial)
        bar.scale.x = half * 2
        bar.position.copy(f.p).setY(6.2)
        bar.rotation.y = Math.atan2(-f.side.z, f.side.x)
        const house = sprite(null, 4.2)
        house.position.copy(f.p).setY(8.6)
        const presents = { [-1]: sprite(null, 3.4), 0: sprite(null, 3.4), 1: sprite(null, 3.4) }
        root.add(bar, house, presents[-1], presents[0], presents[1])
        const yaw = Math.atan2(f.t.x, f.t.z)
        const strips = {}, paints = {}
        for (const side of [-1, 0, 1]) {
          strips[side] = flat(roadMaterial({ color: STRIP_COLOURS[side], opacity: 0.6 }))
          paints[side] = flat(roadMaterial({ opacity: 0.95 }))
          strips[side].rotation.y = paints[side].rotation.y = yaw
          root.add(strips[side], paints[side])
        }
        group.add(root)
        gates.push({ dist, root, house, presents, strips, paints, at: f.p.clone(), across: f.side.clone(), along: f.t.clone(), width: track.width, kindIndex: -1 })
      }
      // Every gate has its house before any presents are chosen, so map gates can borrow the other gates' houses.
      for (const g of gates) pickHouse(g)
      for (const g of gates) dressPresents(g)
    },

    /** The harder presents (pears, candles) from the next gate dressed on, or the easier ones again. */
    setHard(value) {
      hard = value
    },
    get hard() { return hard },
    /** Houses only on the map from the next gate dressed on (always with the harder presents), or back on the gantry. */
    setMapped(value) {
      mapped = value
      if (value) hard = true
    },
    get mapped() { return mapped },

    /** The car has gone under gate `g`: it gets a new house and new presents for next time round. */
    redress(g) {
      dress(g)
      // On the map step its new house is a new pin: the gates still to come borrow from the pins as they are now.
      for (const o of gates) if (o !== g) freshen(o)
    },
    /** Gate `g` is coming into view: a map gate whose presents no longer all have a pin is dressed again (unless already tapped). */
    freshen,
  }
}
