import * as THREE from 'three'
import { canvasTexture, reducedMotion, rng } from './util.js'

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
  { id: 'apple', emoji: '🍎', resident: '🐻', parcel: 'The apple parcel', house: 'the fruit shop', thanks: 'Apples for the fruit shop. Thank you!', colour: '#ff6b6b' },
  { id: 'dog', emoji: '🐶', resident: '🐶', parcel: 'The dog parcel', house: "the dog's house", thanks: 'A bone for the dog. Woof, thank you!', colour: '#c98b5a' },
  { id: 'flower', emoji: '🌸', resident: '🐰', parcel: 'The flower parcel', house: 'the florist', thanks: 'Flowers for the florist. Thank you!', colour: '#ff8fc4' },
  { id: 'book', emoji: '📚', resident: '🦉', parcel: 'The book parcel', house: 'the library', thanks: 'New books for the library. Thank you!', colour: '#6c8cff' },
  { id: 'cake', emoji: '🎂', resident: '🐼', parcel: 'The cake parcel', house: 'the birthday house', thanks: 'A cake for the birthday house. Thank you!', colour: '#ffbe0b' },
  { id: 'teddy', emoji: '🧸', resident: '🦊', parcel: 'The teddy parcel', house: 'the toy shop', thanks: 'A teddy for the toy shop. Thank you!', colour: '#8ac926' },
]
export const HOUSES = 4
const EMOJI_FONT = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'

const textures = new Map()
/** A round picture: the emoji on a white disc ringed in `ring` (drawn once per emoji and colour). */
function pictureTexture(emoji, ring) {
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

/** A brown parcel with a red ribbon and its picture on top: the same picture as its house. */
function parcel(kind, size = 1) {
  const group = new THREE.Group()
  const box = new THREE.Mesh(boxGeometry, kraft)
  box.scale.set(size, size * 0.8, size)
  box.castShadow = true
  const band = new THREE.Mesh(boxGeometry, ribbon)
  band.scale.set(size * 0.2, size * 0.82, size * 1.02)
  const band2 = new THREE.Mesh(boxGeometry, ribbon)
  band2.scale.set(size * 1.02, size * 0.82, size * 0.2)
  const label = sprite(pictureTexture(kind.emoji, kind.colour), size * 1.1)
  label.position.y = size * 0.95
  group.add(box, band, band2, label)
  group.userData.label = label
  return group
}

export function createTown(scene) {
  const group = new THREE.Group()
  group.visible = false
  scene.add(group)
  let houses = []
  let chosen = -1 // index into houses of the parcel in the van (-1: none chosen)
  let order = [] // house indices, in the order the child delivered them
  let route = [] // [x, z] points the child drove, for the recap
  let inside = -1 // the house the car is at now (so each arrival counts once)
  let roof = null // the chosen parcel riding on the car's roof
  const flights = []
  let time = 0

  function clear() {
    group.traverse((o) => o.isSprite && o.material.dispose())
    for (const child of [...group.children]) group.remove(child)
    houses = []
    order = []
    route = []
    chosen = -1
    inside = -1
    flights.length = 0
    roof?.removeFromParent()
    roof = null
  }

  return {
    get houses() { return houses },
    get chosen() { return chosen },
    /** The house the car is beside right now, or -1. */
    get at() { return inside },
    get order() { return order },
    get route() { return route },
    get done() { return houses.length > 0 && order.length === houses.length },
    /** The parcel list as the child sees it: the picture order, which is never the order of the houses on the road. */
    get tray() { return houses.map((h, i) => i).sort((a, b) => houses[a].kindIndex - houses[b].kindIndex) },
    show(value) { group.visible = value; if (roof) roof.visible = value },

    /** Lays out this drive's houses. Deterministic in `seed`, so friends in the same town see the same houses. */
    configure(track, seed) {
      clear()
      const r = rng((seed ^ 0x70f7) >>> 0)
      // Four of the six kinds, shuffled onto spots spread round the loop.
      const kinds = KINDS.map((k, i) => i).sort(() => r() - 0.5).slice(0, HOUSES)
      const places = kinds.slice().sort(() => r() - 0.5)
      // Never in the same order as the parcel list (which is sorted by picture): the map has to be read.
      if (places.every((k, i) => i === 0 || places[i - 1] < k)) places.push(places.shift())
      const firstSide = r() < 0.5 ? -1 : 1
      places.forEach((kindIndex, i) => {
        const kind = KINDS[kindIndex]
        const dist = track.clearOfRamps(track.length * (0.16 + i * 0.22 + (r() - 0.5) * 0.06), 6)
        const sign = i % 2 ? -firstSide : firstSide
        const f = track.frameAt(dist)
        const at = (lateral) => f.p.clone().addScaledVector(f.side, sign * lateral)
        const door = at(track.width / 2 + 1.2)
        const house = new THREE.Group()
        // A coloured doorstep by the kerb: where the parcel is left.
        kind.padMaterial ??= new THREE.MeshStandardMaterial({ color: kind.colour, roughness: 0.9 })
        const pad = new THREE.Mesh(padGeometry, kind.padMaterial)
        pad.rotation.x = -Math.PI / 2
        pad.position.set(door.x, 0.04, door.z)
        pad.receiveShadow = true
        // A tall post with the house's big picture, seen from far down the road.
        const postAt = at(track.width / 2 + 2.6)
        const pole = new THREE.Mesh(poleGeometry, poleMaterial)
        pole.position.set(postAt.x, 2.1, postAt.z)
        pole.castShadow = true
        const sign3d = sprite(pictureTexture(kind.emoji, kind.colour), 3.4)
        sign3d.position.set(postAt.x, 5.6, postAt.z)
        // The resident waits beside the doorstep and waves when the parcel arrives.
        const residentAt = at(track.width / 2 + 3.6).addScaledVector(f.t, 1.6)
        const resident = sprite(emojiTexture(kind.resident), 2)
        resident.position.set(residentAt.x, 1.05, residentAt.z)
        const hand = sprite(emojiTexture('👋'), 1.3)
        hand.position.set(residentAt.x, 2.5, residentAt.z)
        hand.visible = false
        house.add(pad, pole, sign3d, resident, hand)
        group.add(house)
        houses.push({ kind, kindIndex, dist, x: door.x, z: door.z, sign, resident, hand, wave: 0, residentY: 1.05 })
      })
    },

    /** The child picked a parcel (a house index), or -1 for none. Its picture rides on the car's roof. */
    choose(index, car) {
      chosen = index
      roof?.removeFromParent()
      roof?.userData.label.material.dispose()
      roof = null
      if (index < 0 || !car) return
      roof = parcel(houses[index].kind, 0.9)
      roof.position.set(0, car.dims.top + 0.45, 0.4)
      car.root.add(roof)
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

    /** Hands the parcel over: it hops from the roof to the doorstep, and the resident waves. */
    deliver(index, car) {
      const h = houses[index]
      if (!order.includes(index)) order.push(index)
      if (chosen === index) this.choose(-1)
      const box = parcel(h.kind, 0.8)
      const from = car ? new THREE.Vector3(car.root.position.x, car.root.position.y + car.dims.top + 0.4, car.root.position.z) : new THREE.Vector3(h.x, 2, h.z)
      box.position.copy(from)
      group.add(box)
      flights.push({ box, from, to: new THREE.Vector3(h.x, 0.4, h.z), t: 0 })
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
  const xs = track.samples.map((s) => s.p.x), zs = track.samples.map((s) => s.p.z)
  for (const h of houses) {
    xs.push(h.x)
    zs.push(h.z)
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
  return { px, pz }
}

/**
 * Draws the town as a paper map: the road, every house as its picture, and
 * optionally the chosen house ringed in gold, the route driven, and numbered
 * stops in delivery order. The child's car goes on top with drawMapCar.
 */
export function drawTownMap(g, size, track, houses, { chosen = -1, route = null, order = null, layout = townMapLayout(size, track, houses) } = {}) {
  const { px, pz } = layout
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

  if (route?.length > 1) {
    g.strokeStyle = 'rgba(255,107,157,0.85)'
    g.lineWidth = size * 0.016
    g.setLineDash([size * 0.02, size * 0.016])
    g.beginPath()
    let pen = false
    for (const point of route) {
      if (!point) pen = false
      else {
        g[pen ? 'lineTo' : 'moveTo'](px(point[0]), pz(point[1]))
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
      g.fillText('🚚', px(start[0]), pz(start[1]))
    }
  }

  const r = size * 0.062
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  houses.forEach((h, i) => {
    const x = px(h.x), y = pz(h.z)
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
    const x = px(h.x) + r * 0.85, y = pz(h.z) - r * 0.85
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
export function drawMapCar(g, size, { px, pz }, player, heading) {
  const x = px(player.x), y = pz(player.z)
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
