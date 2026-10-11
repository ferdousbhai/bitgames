import * as THREE from 'three'
import { canvasTexture, reducedMotion, rng, wrap } from './util.js'
import { SPUR } from './track.js'

/**
 * Delivery Town: a calm, unraced drive round a city with picture parcels.
 * Each house on the road has a big picture sign (🍎 fruit shop, 🐶 dog's
 * house…) and a resident; each parcel carries the same picture. The houses sit
 * on both sides of the road, out of the order the parcels are listed in, so the
 * child reads the map to choose where to go next. Everything here is runtime
 * geometry and sprites (no new models), with no colliders, and never touches
 * race scoring.
 */
export const KINDS = [
  { id: 'apple', emoji: '🍎', resident: '🐻', house: 'the fruit shop', colour: '#ff6b6b', ask: 'What does a fruit shop sell?',
    gifts: [{ emoji: '🍌', name: 'Bananas', thanks: 'Bananas for the fruit shop. Thank you!' }, { emoji: '🍐', name: 'Pears', thanks: 'Pears are fruit too. Thank you!' }] },
  { id: 'dog', emoji: '🐶', resident: '🐶', house: "the dog's house", colour: '#c98b5a', ask: 'What would a dog like?',
    gifts: [{ emoji: '🦴', name: 'A bone', thanks: 'A bone for the dog. Woof, thank you!' }, { emoji: '🎾', name: 'A ball', thanks: 'A ball to chase. Woof, thank you!' }] },
  { id: 'flower', emoji: '🌸', resident: '🐰', house: 'the florist', colour: '#ff8fc4', ask: 'What does a florist sell?',
    gifts: [{ emoji: '🌷', name: 'Tulips', thanks: 'Tulips for the florist. Thank you!' }, { emoji: '🌱', name: 'Little plants', thanks: 'Little plants grow into flowers. Thank you!' }] },
  { id: 'book', emoji: '📚', resident: '🦉', house: 'the library', colour: '#6c8cff', ask: 'What do you find in a library?',
    gifts: [{ emoji: '📖', name: 'A story book', thanks: 'A new story for the library. Thank you!' }, { emoji: '📕', name: 'A red book', thanks: 'A red book for the shelf. Thank you!' }] },
  { id: 'cake', emoji: '🎂', resident: '🐼', house: 'the birthday house', colour: '#b388eb', ask: 'What do you need for a birthday?',
    gifts: [{ emoji: '🎈', name: 'Balloons', thanks: 'Balloons for the birthday. Thank you!' }, { emoji: '🕯️', name: 'Candles', thanks: 'Candles for the birthday cake. Thank you!' }] },
  { id: 'teddy', emoji: '🧸', resident: '🦊', house: 'the toy shop', colour: '#8ac926', ask: 'What does a toy shop sell?',
    gifts: [{ emoji: '🪁', name: 'A kite', thanks: 'A kite for the toy shop. Thank you!' }, { emoji: '🪀', name: 'A yo-yo', thanks: 'A yo-yo for the toy shop. Thank you!' }] },
]
/**
 * Three tiers, chosen from how the last drives went (see main.js adaptTier):
 * 1. four houses, one parcel each holding something easy to match (a bone for
 *    the dog), and the van carries one parcel at a time;
 * 2. sorting and planning: every house wants two things (the bone and the ball
 *    for the dog), the eight parcels come mixed up, and the van carries two, so
 *    the child packs two that belong together. Road works close one stretch of
 *    the loop, so the road is a line with two ends and the order of the stops
 *    has to be planned on the map;
 * 3. sorting and reading signs: the pairs again, and a one-way street (arrows
 *    painted on the road and on the map, a ⛔ at its far end). The short way
 *    on the map may be the way the arrows forbid, so the child reads the
 *    arrows as well as the distance, and plans the order of the stops.
 */
export const TIERS = [null, { houses: 4, carry: 1 }, { houses: 4, carry: 2, pairs: true, roadworks: true }, { houses: 4, carry: 2, pairs: true, oneWay: true }]
export const TOP_TIER = TIERS.length - 1
/**
 * The side streets' names, as pictures: each has its picture on a sign at its
 * corner and beside its corner on the map. A house at the end of one cannot
 * be seen from the main road, so the map says which street to turn into.
 */
export const STREETS = [{ emoji: '🌈', name: 'Rainbow Street', colour: '#ffd166' }, { emoji: '🌙', name: 'Moon Street', colour: '#9bb7ff' }]
export const HOUSES = 4
/** How much longer a side street is drawn on the map than it is (see townMapLayout). */
const MAP_STRETCH = 1.8
const EMOJI_FONT = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'

const textures = new Map()
/** A round picture: the emoji on a white disc ringed in `ring` (drawn once per emoji and colour). */
export function pictureTexture(emoji, ring) {
  const key = emoji + ring
  if (!textures.has(key)) {
    textures.set(key, canvasTexture(256, 256, (g) => {
      g.beginPath()
      g.arc(128, 128, 118, 0, Math.PI * 2)
      g.fillStyle = ring
      g.fill()
      g.lineWidth = 8
      g.strokeStyle = '#2b2d42'
      g.stroke()
      g.beginPath()
      g.arc(128, 128, 92, 0, Math.PI * 2)
      g.fillStyle = '#ffffff'
      g.fill()
      g.font = `128px ${EMOJI_FONT}`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(emoji, 128, 138)
    }, { repeat: [1, 1] }))
  }
  return textures.get(key)
}

/** A bare emoji (a resident, a waving hand). */
function emojiTexture(emoji) {
  const key = 'bare' + emoji
  if (!textures.has(key)) {
    textures.set(key, canvasTexture(128, 128, (g) => {
      g.font = `104px ${EMOJI_FONT}`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(emoji, 64, 72)
    }))
  }
  return textures.get(key)
}

function sprite(map, size, { depthTest = true } = {}) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest, fog: false, toneMapped: false }))
  s.scale.set(size, size, 1)
  return s
}

const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
const kraft = new THREE.MeshStandardMaterial({ color: '#c99a62', roughness: 0.8 })
const ribbon = new THREE.MeshStandardMaterial({ color: '#e63946', roughness: 0.6 })
const poleMaterial = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.7 })
const poleGeometry = new THREE.CylinderGeometry(0.12, 0.14, 4.2, 8)
const padGeometry = new THREE.CircleGeometry(2.1, 28)

/** A brown parcel with a red ribbon and what is inside it pictured on top (a bone, not the dog's house: the child works out where it goes). */
function parcel(item, size = 1) {
  const group = new THREE.Group()
  const box = new THREE.Mesh(boxGeometry, kraft)
  box.scale.set(size, size * 0.8, size)
  box.castShadow = true
  const band = new THREE.Mesh(boxGeometry, ribbon)
  band.scale.set(size * 0.2, size * 0.82, size * 1.02)
  const band2 = new THREE.Mesh(boxGeometry, ribbon)
  band2.scale.set(size * 1.02, size * 0.82, size * 0.2)
  const label = sprite(pictureTexture(item.gift.emoji, '#c99a62'), size * 1.1)
  label.position.y = size * 0.95
  group.add(box, band, band2, label)
  group.userData.label = label
  return group
}

const coneGeometry = new THREE.ConeGeometry(0.42, 1.1, 14)
const coneMaterial = new THREE.MeshStandardMaterial({ color: '#ff7b1c', roughness: 0.7 })
const barGeometry = new THREE.BoxGeometry(1, 0.32, 0.16)
const barMaterial = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.7 })
/** Road works across the road at `dist`: a row of cones, a white bar and a big 🚧 sign (no colliders: the car stops before it). */
function roadworks(track, dist) {
  const g = new THREE.Group()
  const f = track.frameAt(dist)
  const half = track.width / 2
  for (let k = -half + 0.6; k <= half - 0.5; k += 1.6) {
    const cone = new THREE.Mesh(coneGeometry, coneMaterial)
    cone.position.copy(f.p).addScaledVector(f.side, k).setY(0.55)
    cone.castShadow = true
    g.add(cone)
  }
  const bar = new THREE.Mesh(barGeometry, barMaterial)
  bar.scale.x = track.width
  bar.position.copy(f.p).setY(1.25)
  bar.rotation.y = Math.atan2(-f.side.z, f.side.x)
  const sign = sprite(pictureTexture('🚧', '#ff7b1c'), 3)
  sign.position.copy(f.p).setY(3.4)
  g.add(bar, sign)
  return g
}

const arrowTexture = canvasTexture(128, 192, (g) => {
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.moveTo(64, 8)
  g.lineTo(120, 80)
  g.lineTo(84, 80)
  g.lineTo(84, 184)
  g.lineTo(44, 184)
  g.lineTo(44, 80)
  g.lineTo(8, 80)
  g.closePath()
  g.fill()
}, { repeat: [1, 1] })
const arrowMaterial = new THREE.MeshBasicMaterial({ map: arrowTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
const arrowGeometry = new THREE.PlaneGeometry(3.2, 4.8).rotateX(-Math.PI / 2)
const signBack = new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.7 })
const signGeometry = new THREE.CircleGeometry(1.25, 32)

/** A road sign that faces one way only (its back is plain grey), on a post at the kerb. */
function facingSign(track, dist, lateral, facing, emoji, ring) {
  const g = new THREE.Group()
  const f = track.frameAt(dist)
  const at = f.p.clone().addScaledVector(f.side, lateral)
  const pole = new THREE.Mesh(poleGeometry, poleMaterial)
  pole.position.set(at.x, 2.1, at.z)
  const face = new THREE.Mesh(signGeometry, new THREE.MeshBasicMaterial({ map: pictureTexture(emoji, ring), toneMapped: false }))
  const back = new THREE.Mesh(signGeometry, signBack)
  back.rotation.y = Math.PI
  const board = new THREE.Group()
  board.add(face, back)
  board.position.set(at.x, 4.6, at.z)
  // The face looks along `facing` (+1 down the loop, -1 back up it): drivers coming the other way see it.
  board.rotation.y = Math.atan2(f.t.x * facing, f.t.z * facing)
  g.add(pole, board)
  return g
}

/** A side street's name sign: its picture on a post at the corner, beside the lane, seen from both ways along the road. */
function streetSign(track, spur, street) {
  const g = new THREE.Group()
  const at = spur.mouth.clone().addScaledVector(spur.t, 7 / 2 + 1.3).addScaledVector(spur.u, 1.2)
  const pole = new THREE.Mesh(poleGeometry, poleMaterial)
  pole.position.set(at.x, 2.1, at.z)
  pole.castShadow = true
  const board = sprite(pictureTexture(street.emoji, street.colour), 2.6)
  board.position.set(at.x, 4.9, at.z)
  g.add(pole, board)
  return g
}

/**
 * Tier 3's one-way street: white arrows painted along it every dozen metres,
 * a blue ⬆️ sign where traffic may enter, and a ⛔ facing anyone who tries to
 * come in at the other end.
 */
function oneWayStreet(track, { from, span, dir }) {
  const g = new THREE.Group()
  for (let d = 6; d < span - 4; d += 10) {
    const f = track.frameAt(from + d)
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial)
    arrow.position.copy(f.p).setY(0.08)
    arrow.rotation.y = Math.atan2(-f.t.x * dir, -f.t.z * dir)
    g.add(arrow)
  }
  const half = track.width / 2 + 1.4
  // Where the arrows begin, the sign faces the drivers allowed in; at the other end ⛔ faces the ones who are not.
  const [enter, exit] = dir > 0 ? [from, from + span] : [from + span, from]
  // Each on the right-hand kerb of the drivers it speaks to.
  g.add(facingSign(track, enter - dir * 2, half * dir, -dir, '⬆️', '#3a86ff'))
  g.add(facingSign(track, exit + dir * 2, -half * dir, dir, '⛔', '#ffffff'))
  return g
}

/**
 * The shortest plan for visiting every house from `start` with no signs at all
 * (every order, each leg either way round the loop): the way (1 or -1) it
 * first drives along the stretch { from, span }, or 0 if it never does.
 */
function plainPlanCrossing(L, start, dists, { from, span }) {
  let best = Infinity, crossing = 0
  const walk = (at, left, length, first) => {
    if (length >= best) return
    if (!left.length) {
      best = length
      crossing = first
      return
    }
    for (const k of left) {
      for (const dir of [1, -1]) {
        const len = wrap((dists[k] - at) * dir, L)
        const a = dir > 0 ? at : at - len
        const hit = wrap(from - a, L) < len || wrap(a - from, L) < span
        walk(dists[k], left.filter((j) => j !== k), length + len, first || (hit ? dir : 0))
      }
    }
  }
  walk(start, dists.map((d, i) => i), 0, 0)
  return crossing
}

export function createTown(scene) {
  const group = new THREE.Group()
  group.visible = false
  scene.add(group)
  let houses = []
  let parcels = [] // { house, gift }: one per house in tier 1, two per house in tier 2
  let tray = [] // parcel indices in the order the child sees them
  let carry = 1 // how many parcels the van holds at once
  let load = [] // parcel indices in the van, in the order they were packed
  let delivered = new Set() // parcel indices handed over
  let order = [] // house indices, in the order the child first handed something over there
  let route = [] // [x, z] points the child drove, for the recap
  let inside = -1 // the house the car is at now (so each arrival counts once)
  let roof = null // the packed parcels riding on the car's roof
  let closed = null // tier 2: where cones close the road (a distance along the loop), or null
  let oneWay = null // tier 3: { from, span, dir }: the stretch from `from` to `from + span` may only be driven in direction `dir`
  const flights = []
  let time = 0

  function clear() {
    group.traverse((o) => o.isSprite && o.material.dispose())
    for (const child of [...group.children]) group.remove(child)
    houses = []
    parcels = []
    tray = []
    load = []
    delivered = new Set()
    closed = null
    oneWay = null
    order = []
    route = []
    inside = -1
    flights.length = 0
    roof?.removeFromParent()
    roof = null
  }

  /** The packed parcels sit side by side on the roof. */
  function dressRoof(car) {
    roof?.traverse((o) => o.isSprite && o.material.dispose())
    roof?.removeFromParent()
    roof = null
    if (!load.length || !car) return
    roof = new THREE.Group()
    load.forEach((p, k) => {
      const box = parcel(parcels[p], 0.85)
      box.position.x = (k - (load.length - 1) / 2) * 1.05
      roof.add(box)
    })
    roof.position.set(0, car.dims.top + 0.45, 0.4)
    car.root.add(roof)
  }

  /** Every parcel for house `i` handed over. */
  const complete = (i) => houses[i].wants.every((p) => delivered.has(p))

  return {
    get houses() { return houses },
    get parcels() { return parcels },
    /** Where the road is closed for road works (tier 2), as a distance along the loop, or null. */
    get closed() { return closed },
    /** Tier 3's one-way street { from, span, dir } (along the loop), or null. */
    get oneWay() { return oneWay },
    get carry() { return carry },
    get load() { return load },
    /** The house the car is beside right now, or -1. */
    get at() { return inside },
    get order() { return order },
    get route() { return route },
    /** Houses that have everything they wanted, for the ticks on the map. */
    get finished() { return houses.map((h, i) => i).filter(complete) },
    complete,
    isDelivered: (p) => delivered.has(p),
    get done() { return parcels.length > 0 && delivered.size === parcels.length },
    /** The parcel list as the child sees it: never the order of the houses on the road (and in tier 2, never a pair side by side). */
    get tray() { return tray },
    show(value) { group.visible = value; if (roof) roof.visible = value },

    /** Lays out this drive's houses. Deterministic in `seed`, so friends in the same town see the same houses. */
    configure(track, seed, tier = 1, { behind = false } = {}) {
      clear()
      const r = rng((seed ^ 0x70f7) >>> 0)
      const count = TIERS[tier]?.houses ?? HOUSES
      // Four (or all six) of the kinds, shuffled onto spots spread round the loop.
      const kinds = KINDS.map((k, i) => i).sort(() => r() - 0.5).slice(0, count)
      const places = kinds.slice().sort(() => r() - 0.5)
      // Never in the same order as the parcel list (which is sorted by picture): the map has to be read.
      if (places.every((k, i) => i === 0 || places[i - 1] < k)) places.push(places.shift())
      const L = track.length
      const xs = track.samples.map((s) => s.p.x), zs = track.samples.map((s) => s.p.z)
      // Pins on the paper map are about a sixth of the town wide: houses closer than that would cover each other.
      const minApart = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 0.16
      const start = L - 8
      // Side streets the city made room for (track.planSpurs): a house stands at the end of each.
      const spurs = (track.spurs ?? []).slice(0, Math.min(STREETS.length, count))
      const nearJunction = (d, m) => spurs.some((sp) => Math.abs(track.offset(d, sp.dist)) < m)
      // The gaps between evenly spread houses (never the start's own), in a seeded order: road works and the one-way street use one clear of the junctions.
      const gaps = Array.from({ length: count - 1 }, (_, k) => (L * (k + 1)) / count).sort(() => r() - 0.5)
      // Tier 2: road works close the loop in one of the gaps.
      if (TIERS[tier]?.roadworks) {
        const at = gaps.map((g) => track.clearOfRamps(g, 14))
        closed = at.find((d) => !nearJunction(d, 28)) ?? at[0]
      }
      // Tier 3: a one-way street over one of the gaps, either way round.
      if (TIERS[tier]?.oneWay) {
        const span = (L / count) * 0.62
        const from = gaps.map((g) => wrap(g - span / 2, L)).find((f) => !spurs.some((sp) => wrap(sp.dist - f + 14, L) < span + 28)) ?? wrap(gaps[0] - span / 2, L)
        oneWay = { from, span, dir: r() < 0.5 ? 1 : -1 }
      }
      const onOneWay = (d) => oneWay && wrap(d - oneWay.from + 10, L) < oneWay.span + 20
      // Where the houses go: one at the end of each side street, the rest spread round the loop as far from each other (and the start) as they can be.
      const slots = spurs.map((spur, j) => ({ dist: spur.dist, spur, street: STREETS[j], pin: spur.door }))
      // A child who already finds the short way in tier 1: one house stands a little way behind the start, so the
      // first real choice is often ↩️ (a short way back) against driving all the way round. Unless a street is already there.
      if (behind && tier === 1 && !slots.some((q) => wrap(start - q.dist, L) < 100)) {
        for (let back = 44; back <= 96; back += 4) {
          const d = wrap(start - back, L)
          if (track.nearRamp(d, 6) || nearJunction(d, 16)) continue
          const p = track.sampleAt(d).p
          if (!slots.every((q) => Math.hypot(q.pin.x - p.x, q.pin.z - p.z) >= minApart)) continue
          slots.push({ dist: d, pin: p })
          break
        }
      }
      while (slots.length < count) {
        // Any spot well away from the others (at least half as far as the furthest one is): a spread-out town that still varies from seed to seed.
        const spots = []
        for (let d = 2; d < L; d += 4) {
          if (track.nearRamp(d, 6) || Math.abs(track.offset(d, start)) <= 20 || nearJunction(d, 16) || onOneWay(d)) continue
          if (closed != null && Math.abs(track.offset(d, closed)) <= 22) continue
          const p = track.sampleAt(d).p
          if (!slots.every((q) => Math.hypot(q.pin.x - p.x, q.pin.z - p.z) >= minApart)) continue
          spots.push({ d, gap: Math.min(Math.abs(track.offset(d, start)), ...slots.map((q) => Math.abs(track.offset(d, q.dist)))) })
        }
        const far = Math.max(0, ...spots.map((q) => q.gap))
        const good = spots.filter((q) => q.gap >= far * 0.55)
        const best = good.length ? good[Math.floor(r() * good.length)].d : track.clearOfRamps((L * (slots.length + 0.5)) / count, 6)
        slots.push({ dist: best, pin: track.sampleAt(best).p })
      }
      slots.sort((a, b) => a.dist - b.dist)
      const firstSide = r() < 0.5 ? -1 : 1
      places.forEach((kindIndex, i) => {
        const kind = KINDS[kindIndex]
        const { dist, spur, street } = slots[i]
        const sign = spur ? spur.sign : i % 2 ? -firstSide : firstSide
        const f = track.frameAt(dist)
        // The doorstep, and which ways are "away from the road" and "along it" there: by the kerb, or on a side street's turning place.
        const out = spur ? spur.u.clone() : f.side.clone().multiplyScalar(sign)
        const along = spur ? spur.t.clone() : f.t.clone()
        const door = spur ? spur.door.clone() : f.p.clone().addScaledVector(out, track.width / 2 + 1.2)
        const beyond = (metres, sideways = 0) => door.clone().addScaledVector(out, metres).addScaledVector(along, sideways)
        const house = new THREE.Group()
        // A coloured doorstep: where the parcel is left.
        kind.padMaterial ??= new THREE.MeshStandardMaterial({ color: kind.colour, roughness: 0.9 })
        const pad = new THREE.Mesh(padGeometry, kind.padMaterial)
        pad.rotation.x = -Math.PI / 2
        pad.position.set(door.x, spur ? 0.08 : 0.04, door.z)
        pad.receiveShadow = true
        // A tall post with the house's big picture, seen from far down the road.
        const postAt = beyond(1.4)
        const pole = new THREE.Mesh(poleGeometry, poleMaterial)
        pole.position.set(postAt.x, 2.1, postAt.z)
        pole.castShadow = true
        const sign3d = sprite(pictureTexture(kind.emoji, kind.colour), 3.4)
        sign3d.position.set(postAt.x, 5.6, postAt.z)
        // The resident waits beside the doorstep and waves when the parcel arrives.
        const residentAt = beyond(2.4, 1.6)
        const resident = sprite(emojiTexture(kind.resident), 2)
        resident.position.set(residentAt.x, 1.05, residentAt.z)
        const hand = sprite(emojiTexture('👋'), 1.3)
        hand.position.set(residentAt.x, 2.5, residentAt.z)
        hand.visible = false
        house.add(pad, pole, sign3d, resident, hand)
        // A side street's name sign at its corner: the picture the map shows at the same corner.
        if (spur) house.add(streetSign(track, spur, street))
        group.add(house)
        houses.push({ kind, kindIndex, wants: [], dist, x: door.x, z: door.z, sign, resident, hand, wave: 0, residentY: 1.05, spur: spur ?? null, street: street ?? null })
      })
      // Tier 3: the arrows forbid the way the plain shortest plan would cross the one-way street, so they must be read, not just the distances.
      if (oneWay) oneWay.dir = -(plainPlanCrossing(L, start, houses.map((h) => h.dist), oneWay) || -oneWay.dir)
      if (closed != null) group.add(roadworks(track, closed))
      if (oneWay) group.add(oneWayStreet(track, oneWay))
      // Tier 1: one easy gift per house. Tier 2: both of the house's gifts.
      carry = TIERS[tier]?.carry ?? 1
      houses.forEach((h, i) => {
        for (const gift of TIERS[tier]?.pairs ? h.kind.gifts : h.kind.gifts.slice(0, 1)) {
          h.wants.push(parcels.length)
          parcels.push({ house: i, gift })
        }
      })
      tray = parcels.map((p, i) => i).sort((a, b) => houses[parcels[a].house].kindIndex - houses[parcels[b].house].kindIndex)
      if (TIERS[tier]?.pairs) {
        // Mixed up, with no pair side by side: which two go together is the child's to work out.
        for (let tries = 0; tries < 50; tries++) {
          tray.sort(() => r() - 0.5)
          if (tray.every((p, k) => k === 0 || parcels[tray[k - 1]].house !== parcels[p].house)) break
        }
      }
    },

    /** Packs the van: `list` is the parcels it now carries (at most `carry`). Their pictures ride on the car's roof. */
    pack(list, car) {
      load = list.slice(0, carry)
      dressRoof(car)
    },

    /** Which house the car has just reached (each arrival once, until the car drives away), or -1. */
    arrive(position, reach) {
      let at = -1
      houses.forEach((h, i) => {
        if (Math.hypot(position.x - h.x, position.z - h.z) <= reach) at = i
      })
      if (at === inside) return -1
      inside = at
      return at
    },

    /** Hands parcel `p` over: it hops from the roof to the doorstep, and the resident waves. */
    deliver(p, car, { byFriend = false } = {}) {
      const index = parcels[p].house
      const h = houses[index]
      delivered.add(p)
      if (!order.includes(index)) order.push(index)
      if (load.includes(p)) this.pack(load.filter((q) => q !== p), car)
      const box = parcel(parcels[p], 0.8)
      // A friend's parcel drops gently onto the doorstep from just above it (their van is in their own town).
      const from = car && !byFriend ? new THREE.Vector3(car.root.position.x, car.root.position.y + car.dims.top + 0.4, car.root.position.z) : new THREE.Vector3(h.x, 3, h.z)
      box.position.copy(from)
      group.add(box)
      // A pair sits side by side on the doorstep.
      const to = new THREE.Vector3(h.x, 0.4, h.z)
      if (h.wants.length > 1) to.x += (h.wants.indexOf(p) - 0.5) * 1.1
      flights.push({ box, from, to, t: 0 })
      this.waveAt(index)
    },

    /** The resident waves (again). */
    waveAt(index) {
      houses[index].wave = 3
    },

    /** Keeps the driven path (a point every couple of metres) for the route recap. */
    record(position) {
      const last = route[route.length - 1]
      const gap = last ? Math.hypot(position.x - last[0], position.z - last[1]) : Infinity
      if (gap < 2 || route.length >= 6000) return
      // Put back on the road (or turned round) far away: the line breaks rather than cutting across the map.
      if (last && gap > 15) route.push(null)
      route.push([position.x, position.z])
    },

    update(dt) {
      time += dt
      const still = reducedMotion.matches
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i]
        f.t = Math.min(1, f.t + dt / (still ? 0.01 : 1.1))
        f.box.position.lerpVectors(f.from, f.to, f.t)
        f.box.position.y += Math.sin(f.t * Math.PI) * 2.2
        if (f.t >= 1) flights.splice(i, 1)
      }
      for (const h of houses) {
        h.wave = Math.max(0, h.wave - dt)
        h.hand.visible = h.wave > 0
        // A slow, friendly wave: the hand rocks and the resident gives a little hop.
        h.hand.material.rotation = still ? 0 : Math.sin(time * 6) * 0.35 * Math.min(1, h.wave)
        h.resident.position.y = h.residentY + (still || !h.wave ? 0 : Math.abs(Math.sin(time * 4)) * 0.25)
      }
    },

    clear,
  }
}

/** Where the town sits on a square map `size` pixels wide: map positions for world x and z. */
export function townMapLayout(size, track, houses) {
  // A side street is drawn longer than it is (as a street map would), so it reads as a street and not as a dot beside the road.
  const spurs = houses.map((h) => h.spur).filter(Boolean)
  const kerb = track.width / 2
  // Only the street itself (its lane, turning place and house) is stretched: a point further along the
  // same line, across the town, stays exactly where it is, so the loop and its houses are drawn true.
  const end = kerb + SPUR.centre + SPUR.pad + 3
  const stretch = (x, z) => {
    for (const sp of spurs) {
      const dx = x - sp.origin.x, dz = z - sp.origin.z
      const l = dx * sp.u.x + dz * sp.u.z, a = dx * sp.t.x + dz * sp.t.z
      if (l > kerb && l < end && Math.abs(a) < SPUR.pad + 4) {
        const k = (MAP_STRETCH - 1) * (l - kerb)
        return [x + sp.u.x * k, z + sp.u.z * k]
      }
    }
    return [x, z]
  }
  const xs = track.samples.map((s) => s.p.x), zs = track.samples.map((s) => s.p.z)
  for (const h of houses) {
    const [x, z] = stretch(h.x, h.z)
    xs.push(x)
    zs.push(z)
  }
  const minX = Math.min(...xs), minZ = Math.min(...zs)
  const pad = size * 0.12
  const span = Math.max(Math.max(...xs) - minX, Math.max(...zs) - minZ)
  const scale = (size - pad * 2) / span
  // Centre the town in the square.
  const offX = pad + (size - pad * 2 - (Math.max(...xs) - minX) * scale) / 2
  const offZ = pad + (size - pad * 2 - (Math.max(...zs) - minZ) * scale) / 2
  const px = (x) => offX + (x - minX) * scale
  const pz = (z) => offZ + (z - minZ) * scale
  /** Map position of world point (x, z), side streets drawn long. */
  const at = (x, z) => {
    const [sx, sz] = stretch(x, z)
    return [px(sx), pz(sz)]
  }
  return { px, pz, at }
}

/**
 * Draws the town as a paper map: the road, every house as its picture, and
 * optionally the chosen house ringed in gold, the route driven, and numbered
 * stops in delivery order. The child's car goes on top with drawMapCar.
 */
export function drawTownMap(g, size, track, houses, { chosen = -1, route = null, plan = null, order = null, closed = null, oneWay = null, layout = townMapLayout(size, track, houses) } = {}) {
  const { px, pz, at } = layout
  g.clearRect(0, 0, size, size)
  g.fillStyle = '#fbf3dc'
  g.beginPath()
  g.roundRect(0, 0, size, size, size * 0.08)
  g.fill()
  const road = new Path2D()
  track.samples.forEach((s, i) => road[i ? 'lineTo' : 'moveTo'](px(s.p.x), pz(s.p.z)))
  road.closePath()
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.strokeStyle = '#6e6784'
  g.lineWidth = size * 0.055
  g.stroke(road)
  g.strokeStyle = '#fffdf6'
  g.lineWidth = size * 0.032
  g.stroke(road)

  // Side streets: a short road off the loop to its house, with the street's picture at the corner.
  for (const h of houses) {
    if (!h.spur) continue
    const { origin, centre, t } = h.spur
    const [cx, cz] = at(centre.x, centre.z)
    const lane = new Path2D()
    lane.moveTo(px(origin.x), pz(origin.z))
    lane.lineTo(cx, cz)
    const ends = new Path2D()
    ends.arc(cx, cz, size * 0.03, 0, Math.PI * 2)
    g.strokeStyle = '#6e6784'
    g.lineWidth = size * 0.045
    g.stroke(lane)
    g.fillStyle = '#6e6784'
    g.fill(ends)
    g.strokeStyle = '#fffdf6'
    g.lineWidth = size * 0.026
    g.stroke(lane)
    const inner = new Path2D()
    inner.arc(cx, cz, size * 0.021, 0, Math.PI * 2)
    g.fillStyle = '#fffdf6'
    g.fill(inner)
    // The street's picture on a little round sign beside its corner.
    const mx = (px(origin.x) + cx) / 2, mz = (pz(origin.z) + cz) / 2
    const ox = px(origin.x + t.x) - px(origin.x), oz = pz(origin.z + t.z) - pz(origin.z)
    const on = Math.hypot(ox, oz) || 1
    const sx = mx + (ox / on) * size * 0.07, sz = mz + (oz / on) * size * 0.07
    g.beginPath()
    g.arc(sx, sz, size * 0.046, 0, Math.PI * 2)
    g.fillStyle = h.street.colour
    g.fill()
    g.lineWidth = Math.max(1.5, size * 0.006)
    g.strokeStyle = '#2b2d42'
    g.stroke()
    g.font = `${Math.round(size * 0.058)}px ${EMOJI_FONT}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#2b2d42'
    g.fillText(h.street.emoji, sx, sz + size * 0.004)
  }

  if (oneWay) {
    // The one-way street: a blue stretch of road with white arrows the way it may be driven.
    const along = []
    for (let d = 0; d <= oneWay.span; d += 3) along.push(track.sampleAt(oneWay.from + d).p)
    g.strokeStyle = '#3a86ff'
    g.lineWidth = size * 0.04
    g.beginPath()
    along.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](px(p.x), pz(p.z)))
    g.stroke()
    g.fillStyle = '#ffffff'
    const a = size * 0.02
    for (let d = oneWay.span * 0.2; d < oneWay.span; d += oneWay.span * 0.3) {
      const s = track.sampleAt(oneWay.from + d)
      const x = px(s.p.x), y = pz(s.p.z)
      const dx = px(s.p.x + s.t.x * oneWay.dir) - x, dy = pz(s.p.z + s.t.z * oneWay.dir) - y
      const n = Math.hypot(dx, dy) || 1
      const ux = dx / n, uy = dy / n
      g.beginPath()
      g.moveTo(x + ux * a * 1.3, y + uy * a * 1.3)
      g.lineTo(x - ux * a + uy * a, y - uy * a - ux * a)
      g.lineTo(x - ux * a - uy * a, y - uy * a + ux * a)
      g.closePath()
      g.fill()
    }
    // ⛔ beside the end that may not be entered.
    const end = track.sampleAt(oneWay.dir > 0 ? oneWay.from + oneWay.span : oneWay.from)
    g.font = `${Math.round(size * 0.06)}px ${EMOJI_FONT}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const ox = px(end.p.x + end.side.x * 9) - px(end.p.x), oz = pz(end.p.z + end.side.z * 9) - pz(end.p.z)
    const on = Math.hypot(ox, oz) || 1
    g.fillText('⛔', px(end.p.x) + (ox / on) * size * 0.07, pz(end.p.z) + (oz / on) * size * 0.07)
  }

  if (plan?.length > 1) {
    // The recap: the short plan as a wide soft gold band under the way the child drove.
    g.strokeStyle = 'rgba(255,190,11,0.55)'
    g.lineWidth = size * 0.05
    g.beginPath()
    let pen = false
    for (const point of plan) {
      if (!point) pen = false
      else {
        g[pen ? 'lineTo' : 'moveTo'](...at(point[0], point[1]))
        pen = true
      }
    }
    g.stroke()
  }

  if (closed != null) {
    // Road works: an orange bar across the road and a 🚧 beside it. No car gets past.
    const s = track.sampleAt(closed)
    const reach = size * 0.05
    const cx = px(s.p.x), cy = pz(s.p.z)
    const dx = px(s.p.x + s.side.x) - cx, dy = pz(s.p.z + s.side.z) - cy
    const n = Math.hypot(dx, dy) || 1
    g.strokeStyle = '#2b2d42'
    g.lineWidth = size * 0.03
    g.beginPath()
    g.moveTo(cx - (dx / n) * reach, cy - (dy / n) * reach)
    g.lineTo(cx + (dx / n) * reach, cy + (dy / n) * reach)
    g.stroke()
    g.strokeStyle = '#ff7b1c'
    g.lineWidth = size * 0.018
    g.stroke()
    g.font = `${Math.round(size * 0.075)}px ${EMOJI_FONT}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('🚧', cx + (dx / n) * reach * 2, cy + (dy / n) * reach * 2)
  }

  if (route?.length > 1) {
    g.strokeStyle = 'rgba(255,107,157,0.85)'
    g.lineWidth = size * 0.016
    g.setLineDash([size * 0.02, size * 0.016])
    g.beginPath()
    let pen = false
    for (const point of route) {
      if (!point) pen = false
      else {
        g[pen ? 'lineTo' : 'moveTo'](...at(point[0], point[1]))
        pen = true
      }
    }
    g.stroke()
    g.setLineDash([])
    // Where the drive began.
    const start = route.find(Boolean)
    if (start) {
      g.font = `${Math.round(size * 0.06)}px ${EMOJI_FONT}`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('🚚', ...at(start[0], start[1]))
    }
  }

  const r = size * 0.062
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  houses.forEach((h, i) => {
    const [x, y] = at(h.x, h.z)
    const delivered = order ? order.includes(i) : false
    const isChosen = i === chosen
    g.beginPath()
    g.arc(x, y, isChosen ? r * 1.35 : r, 0, Math.PI * 2)
    g.fillStyle = isChosen ? '#ffbe0b' : h.kind.colour
    g.fill()
    g.lineWidth = Math.max(2, size * 0.008)
    g.strokeStyle = '#2b2d42'
    g.stroke()
    g.beginPath()
    g.arc(x, y, r * 0.78, 0, Math.PI * 2)
    g.fillStyle = '#ffffff'
    g.fill()
    g.font = `${Math.round(r * 1.05)}px ${EMOJI_FONT}`
    g.fillText(h.kind.emoji, x, y + r * 0.06)
    if (delivered && !route) {
      // Delivered: a small green tick.
      g.beginPath()
      g.arc(x + r * 0.8, y - r * 0.8, r * 0.42, 0, Math.PI * 2)
      g.fillStyle = '#5fae1e'
      g.fill()
      g.fillStyle = '#ffffff'
      g.font = `bold ${Math.round(r * 0.6)}px system-ui, sans-serif`
      g.fillText('✓', x + r * 0.8, y - r * 0.78)
    }
  })

  // The recap: each stop numbered in the order the child chose.
  order?.forEach((house, n) => {
    if (!route) return
    const h = houses[house]
    const [hx, hy] = at(h.x, h.z)
    const x = hx + r * 0.85, y = hy - r * 0.85
    g.beginPath()
    g.arc(x, y, r * 0.55, 0, Math.PI * 2)
    g.fillStyle = '#ff6b9d'
    g.fill()
    g.lineWidth = Math.max(2, size * 0.006)
    g.strokeStyle = '#ffffff'
    g.stroke()
    g.fillStyle = '#ffffff'
    g.font = `900 ${Math.round(r * 0.75)}px system-ui, sans-serif`
    g.fillText(String(n + 1), x, y + r * 0.04)
  })
}

/** The child's car on the town map: an arrow in its colour, pointing the way it faces. */
export function drawMapCar(g, size, { at }, player, heading) {
  const [x, y] = at(player.x, player.z)
  const s = size * 0.045
  g.save()
  g.translate(x, y)
  // The way the car is pointing, so "turn round" and "keep going" can be read off the map.
  g.rotate(Math.atan2(heading.z, heading.x) + Math.PI / 2)
  g.beginPath()
  g.moveTo(0, -s * 1.25)
  g.lineTo(s * 0.9, s * 0.8)
  g.lineTo(0, s * 0.35)
  g.lineTo(-s * 0.9, s * 0.8)
  g.closePath()
  g.fillStyle = player.colour
  g.fill()
  g.lineWidth = Math.max(2, size * 0.01)
  g.strokeStyle = '#ffffff'
  g.stroke()
  g.restore()
}
