import * as THREE from 'three'
import { KINDS, pictureTexture } from './town.js'
import { rng } from './util.js'

/**
 * Present gates for Race and Bumpers: three times round each loop a white gantry
 * spans the road. A house's picture sits on top (🐶), and over each lane hangs
 * a present (🦴 over one, 📖 over the other). The child steers (or, in Easy
 * mode, taps the present) to drive under the one that house would like. It is
 * the Delivery Town lesson inside the race: no colliders, nothing to win; the
 * right lane rolls on smoothly with a doorbell and a wave, and the other lane
 * has a soft puddle that slows the car for a moment. After the car passes, the
 * gate quietly takes a new house and two new presents for the next time round.
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

  /** A new house and two presents for gate `g`: one the house would like, one from another house, on a random side. */
  function dress(g) {
    const kinds = shuffled()
    // Never a house that is on a gate now (this one's last, or the other gate's), so each gate brings someone new.
    const pick = kinds.find((k) => k !== g.kindIndex && gates.every((o) => o.kindIndex !== k) && !recent.includes(k)) ?? kinds.find((k) => k !== g.kindIndex && gates.every((o) => o.kindIndex !== k))
    recent = [pick, ...recent].slice(0, 2)
    // The wrong present comes from a house that has not lent one lately (never the same distractor twice running).
    const other = kinds.find((k) => k !== pick && !recentWrong.includes(k)) ?? kinds.find((k) => k !== pick)
    recentWrong = [other, ...recentWrong].slice(0, 2)
    // The harder tier uses each house's second present (pears, candles): sorting by kind, not by look.
    const gift = KINDS[pick].gifts[hard ? 1 : 0]
    const wrong = KINDS[other].gifts[hard ? (r() < 0.5 ? 0 : 1) : 0]
    g.kindIndex = pick
    g.kind = KINDS[pick]
    g.tapped = 0 // the present the child tapped for this gate (Easy mode), kept until the car goes under it
    g.hard = hard
    g.side = r() < 0.5 ? -1 : 1 // the lane (road's left -1, right 1) with the present the house would like
    g.lanes = g.side > 0 ? { [-1]: wrong, [1]: gift } : { [-1]: gift, [1]: wrong }
    g.house.material.map = pictureTexture(g.kind.emoji, g.kind.colour)
    g.left.material.map = pictureTexture(g.lanes[-1].emoji, '#ffffff')
    g.right.material.map = pictureTexture(g.lanes[1].emoji, '#ffffff')
    for (const s of [g.house, g.left, g.right]) s.material.needsUpdate = true
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
    configure(track, seed, { harder = false } = {}) {
      clear()
      recent = []
      recentWrong = []
      r = rng((seed ^ 0x6a7e) >>> 0)
      // A small seed's first numbers lean one way: let the generator settle, so the right lane is a true coin toss.
      for (let i = 0; i < 16; i++) r()
      hard = harder
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
        const lane = track.width / 4
        const left = sprite(null, 3.4)
        left.position.copy(f.p).addScaledVector(f.side, -lane).setY(4.6)
        const right = sprite(null, 3.4)
        right.position.copy(f.p).addScaledVector(f.side, lane).setY(4.6)
        root.add(bar, house, left, right)
        group.add(root)
        const g = { dist, root, house, left, right, kindIndex: -1 }
        dress(g)
        gates.push(g)
      }
    },

    /** The harder presents (pears, candles) from the next gate dressed on, or the easier ones again. */
    setHard(value) {
      hard = value
    },
    get hard() { return hard },

    /** The car has gone under gate `g`: it gets a new house and new presents for next time round. */
    redress(g) {
      dress(g)
    },
  }
}
