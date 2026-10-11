import * as THREE from 'three'
import { KINDS, pictureTexture } from './town.js'
import { rng } from './util.js'

/**
 * Present gates for Race and Bumpers: three times round each loop a white gantry
 * spans the road. A house's picture sits on top (🐶), and over each lane hangs
 * a present (🦴 over one, 📖 over the other; three lanes and three presents on
 * the harder step). The child steers (or, in Easy
 * mode, taps the present) to drive under the one that house would like. It is
 * the Delivery Town lesson inside the race: no colliders, nothing to win; the
 * right lane rolls on smoothly with a doorbell and a wave, and the other lane
 * has a soft puddle that slows the car for a moment. After the car passes, the
 * gate quietly takes a new house and two new presents for the next time round.
 *
 * The top step (`mapped`) moves the house off the gantry and onto the map: the
 * gantry shows 🗺️, and the child finds which house lives at the gate coming up
 * from its pin on the minimap before choosing its present.
 */
const postGeometry = new THREE.BoxGeometry(0.35, 6.4, 0.35)
const barGeometry = new THREE.BoxGeometry(1, 0.45, 0.45)
const gantryMaterial = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.6 })

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
      s.visible = sides.includes(side)
      if (!s.visible) continue
      s.position.copy(g.at).addScaledVector(g.across, side * gap).setY(4.6)
      s.scale.set(size, size, 1)
      s.material.map = pictureTexture(g.lanes[side].emoji, '#ffffff')
      s.material.needsUpdate = true
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
    for (const g of gates) g.root.traverse((o) => o.isSprite && o.material.dispose())
    for (const child of [...group.children]) group.remove(child)
    gates = []
  }

  return {
    get gates() { return gates },
    show(value) { group.visible = value },
    clear,

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
      for (const at of [0.27, 0.53, 0.8]) {
        const dist = track.clearOfRamps(L * at, 16)
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
        group.add(root)
        gates.push({ dist, root, house, presents, at: f.p.clone(), across: f.side.clone(), width: track.width, kindIndex: -1 })
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
