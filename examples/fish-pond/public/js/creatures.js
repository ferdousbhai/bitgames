import * as THREE from 'three'

/**
 * Everything that can be caught, built from models/creatures.glb (see
 * blender/models.py). Every model faces +X, so a heading angle turns it.
 *
 * stars: 1 common, 2 special, 3 rare. `places` weights how often each place
 * sends it to the bobber. `how` decides how it comes to the bobber:
 *   swim     swims over under the water (you can watch it coming)
 *   surface  bobs along on top of the water
 *   deep     hidden in the deep: only a trail of bubbles comes
 *   whale    a big shadow glides in from far away
 *
 * Habitats (Phase 2, 2026-10-09): every real animal is caught only where it really lives.
 *   lake, river, night  fresh water: goldfish, trout, turtle, frog, crayfish, pond snail
 *   ice (Icy Sea)       cold sea: whale, narwhal, ringed seal, Arctic cod, snow crabs, jellyfish, octopus
 *   reef (Coral Reef)   warm sea: clownfish, pufferfish, octopus, crabs, jellyfish
 * Jellyfish live in every ocean, from warm reefs to icy seas, and many make their own light,
 * so the glow jellyfish lives in both seas (not in the fresh night pond).
 * Blue Fish, Golden Fish, the toy duck, the boot and the treasure are pretend or rubbish, so
 * they can turn up anywhere (their field notes say so). Every creature has at least one place.
 *
 * Round 2 (2026-10-11): the frog and the crayfish join the fresh-water places, so Bear's idea riddles
 * there are a real sort (not a fish: turtle, frog, crayfish; breathes air: turtle, frog; no bones:
 * crayfish), and the reef's swimmers include its crab.
 *
 * Round 3 (2026-10-11): a ramshorn pond snail joins the fresh water. It keeps close under a lily pad
 * (main.js spawnAmbient), so knowing where snails live tells you where to cast. It widens the sort:
 * a shell but no claws, breathes air but no bones.
 *
 * Round 6 (2026-10-11): the Icy Sea was thin (two Blue Fish, a narwhal, a jellyfish, a crab), so "a fish"
 * and "no bones" were hardly a choice there. The Arctic cod, the real small fish of the icy sea, joins it,
 * and so does the octopus (octopuses live in every ocean, the Arctic too).
 *   Arctic cod   https://en.wikipedia.org/wiki/Polar_cod (Arctic seas; brown back with dark dots; a chin barbel;
 *                three dorsal fins as in all cods; food for narwhals, seals and seabirds)
 *   Arctic octopus https://en.wikipedia.org/wiki/Bathypolypus_arcticus (North Atlantic and Arctic seas)
 *
 * Round 8 (2026-10-11): in the Icy Sea "a fish" was only ever the cod and "breathes air" only ever the
 * narwhal, so the idea riddles there had one answer and two clues could hardly be made. The ringed seal,
 * the small seal of the Arctic sea (already resting on the ice shore), joins the water: grey with ringed
 * spots, not a fish, breathes air. Now "breathes air" is narwhal or seal, and two clues can tell them
 * apart ("breathes air and has no tusk", "breathes air and is blue").
 *   ringed seal  https://www.fisheries.noaa.gov/species/ringed-seal (Arctic; dark spots in light rings; keeps
 *                breathing holes open in the ice with the strong claws on its front flippers)
 */
export const CREATURES = [
  { id: 'goldfish', name: 'Goldfish', stars: 1, size: 0.9, how: 'swim', places: { lake: 10, river: 5, night: 5 } },
  { id: 'bluefish', name: 'Blue Fish', stars: 1, size: 0.95, how: 'swim', places: { lake: 8, river: 5, night: 6, ice: 5 } },
  { id: 'clownfish', name: 'Clownfish', stars: 1, size: 0.85, how: 'swim', places: { reef: 10 } },
  { id: 'trout', name: 'Rainbow Trout', stars: 1, size: 1.1, how: 'swim', places: { river: 10, lake: 1.5, night: 3 } },
  { id: 'duck', name: 'Rubber Duck', stars: 1, size: 0.75, how: 'surface', places: { lake: 2.5, river: 3, night: 2, ice: 1.5, reef: 1.5 } },
  { id: 'boot', name: 'Old Boot', stars: 1, size: 0.8, how: 'deep', places: { lake: 2.5, river: 3, night: 2.5, ice: 2, reef: 2 } },
  { id: 'pufferfish', name: 'Pufferfish', stars: 2, size: 0.85, how: 'swim', places: { reef: 5 } },
  { id: 'crab', name: 'Crab', stars: 2, size: 0.85, how: 'swim', places: { reef: 4, ice: 3 } },
  { id: 'turtle', name: 'Turtle', stars: 2, size: 1.0, how: 'swim', places: { lake: 3, river: 3.5, night: 3 } },
  { id: 'octopus', name: 'Octopus', stars: 2, size: 0.9, how: 'swim', places: { reef: 4, ice: 2.5 } },
  { id: 'jellyfish', name: 'Glow Jellyfish', stars: 2, size: 0.9, how: 'swim', places: { reef: 4, ice: 3 } },
  { id: 'narwhal', name: 'Baby Narwhal', stars: 2, size: 1.2, how: 'swim', places: { ice: 7 } },
  { id: 'goldenfish', name: 'Golden Fish', stars: 3, size: 0.95, how: 'swim', places: { lake: 0.8, river: 0.8, night: 0.8, ice: 0.8, reef: 0.8 } },
  { id: 'chest', name: 'Treasure Chest', stars: 3, size: 0.8, how: 'deep', places: { lake: 0.8, river: 0.8, night: 0.9, ice: 0.8, reef: 0.9 } },
  { id: 'whale', name: 'Friendly Whale', stars: 3, size: 2.4, how: 'whale', places: { ice: 1.2 } },
  { id: 'frog', name: 'Frog', stars: 2, size: 0.8, how: 'swim', places: { lake: 3, river: 2.5, night: 4 } },
  { id: 'crayfish', name: 'Crayfish', stars: 2, size: 1.05, how: 'swim', places: { lake: 2.5, river: 3.5, night: 2.5 } },
  { id: 'snail', name: 'Pond Snail', stars: 2, size: 0.75, how: 'swim', places: { lake: 2.5, river: 2, night: 2.5 } },
  { id: 'cod', name: 'Arctic Cod', stars: 1, size: 0.95, how: 'swim', places: { ice: 8 } },
  { id: 'seal', name: 'Ringed Seal', stars: 2, size: 1.1, how: 'swim', places: { ice: 4 } },
]
export const BY_ID = Object.fromEntries(CREATURES.map((c) => [c.id, c]))

/** The common fish that swim about in each place while you wait. */
export const AMBIENT = {
  lake: ['goldfish', 'bluefish', 'trout', 'turtle', 'frog', 'crayfish', 'snail'],
  river: ['trout', 'goldfish', 'bluefish', 'turtle', 'crayfish', 'frog', 'snail'],
  night: ['goldfish', 'bluefish', 'trout', 'turtle', 'frog', 'crayfish', 'snail'],
  ice: ['cod', 'bluefish', 'narwhal', 'seal', 'jellyfish', 'crab', 'octopus'],
  reef: ['clownfish', 'pufferfish', 'clownfish', 'octopus', 'jellyfish', 'crab'],
}

const MAX_LUCK = 8

/**
 * Rarity roll: brand-new creatures and long waits for a rare one both tip the odds. `boost` lets the
 * open water lean toward what Bear's riddle asks for (main.js sendBiter).
 */
export function roll(place, book, luck, boost = () => 1) {
  const options = CREATURES.filter((c) => c.places[place])
  const weights = options.map((c) => {
    let w = c.places[place] * boost(c)
    if (!book[c.id]) w *= 2.2
    // The wait for a rare one helps a little, but never more than double (no ever-growing pity)
    if (c.stars === 3) w *= 1 + Math.min(luck, MAX_LUCK) * 0.12
    return w
  })
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < options.length; i++) if ((r -= weights[i]) <= 0) return options[i]
  return options[0]
}

const SWIM_Y = -0.8
/** Wandering swimmers keep about this far apart (in water units), so each is easy to tap. */
const SPACE = 2.2
const SPOT = new THREE.Vector3()
/** The light watery tint swimmers keep (see vivid). */
const WATERY = new THREE.Color('#5fc4d0')
/** Creatures look bigger in the water than their book size, so little eyes can spot them. */
export const SWIM_SCALE = 1.6

export class Creatures {
  constructor(scene) {
    this.scene = scene
    this.templates = {}
    this.units = {}
    this.centers = {}
    this.swimmers = []
    this.vividMats = new Map()
    this.bounds = { x: () => 6, zMin: -3, zMax: 7.5, avoid: new THREE.Vector3(0, 0, -5), avoidR: 3.4 }
  }

  attach(gltf) {
    for (const c of CREATURES) {
      const node = gltf.scene.getObjectByName(c.id)
      if (!node) continue
      node.removeFromParent()
      node.position.set(0, 0, 0)
      node.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(node)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      // Wrap so the creature's middle sits on the origin and scale 1 means "one unit long".
      const wrap = new THREE.Group()
      node.position.sub(center)
      wrap.add(node)
      this.templates[c.id] = wrap
      this.units[c.id] = 1 / Math.max(size.x, size.y, size.z)
      this.centers[c.id] = center
      node.traverse((o) => {
        if (o.isMesh) o.material.envMapIntensity = 0.6
      })
    }
  }

  /**
   * A point on the model, given in builder (Blender) coordinates [x, y, z], as a point in the
   * group returned by make(). Blender x stays x, z becomes up and -y faces the camera.
   */
  featurePoint(id, at, out = new THREE.Vector3()) {
    out.set(at[0], at[2], -at[1])
    if (this.centers[id]) out.sub(this.centers[id])
    return out
  }

  /** A fresh creature group, scaled so `size` is its length. */
  make(id, size = BY_ID[id].size) {
    const t = this.templates[id]
    const model = t ? t.clone(true) : fallback()
    const unit = this.units[id] ?? 1
    model.scale.setScalar(size * unit)
    const parts = {}
    model.traverse((o) => {
      if (o.name.endsWith('_tail')) parts.tail = o
      if (o.name === 'pufferfish_spikes') parts.spikes = o
      if (o.name === 'chest_lid') parts.lid = o
    })
    return { group: model, id, info: BY_ID[id], parts, unit, baseScale: size * unit }
  }

  // --- Swimmers -----------------------------------------------------------------

  /**
   * Seen through the tinted water, colours wash out: under the lake's cyan an orange goldfish reads
   * as tan, and a colour riddle must match what the child sees. So swimmers are drawn just after the
   * water (and before the ice sheet) in a copy of their materials with only a light watery tint.
   * On the stage they wear the real ones again.
   */
  vivid(group, on) {
    group.traverse((o) => {
      if (!o.isMesh) return
      o.userData.real ??= o.material
      const real = o.userData.real
      o.renderOrder = on ? 1.5 : 0
      if (!on) return void (o.material = real)
      let v = this.vividMats.get(real)
      if (!v) {
        v = real.clone()
        v.transparent = true
        if (v.color) v.color.lerp(WATERY, 0.14)
        this.vividMats.set(real, v)
      }
      o.material = v
    })
  }

  spawnSwimmer(id, pos, opts = {}) {
    const c = this.make(id, (opts.size ?? BY_ID[id].size) * SWIM_SCALE)
    this.vivid(c.group, true)
    const s = {
      ...c,
      pos: pos.clone(),
      heading: Math.random() * Math.PI * 2,
      speed: 0.7 + Math.random() * 0.4,
      target: new THREE.Vector3(),
      mode: opts.mode ?? 'wander', // wander | approach | nibble | flee | hold
      phase: Math.random() * 10,
      depth: opts.depth ?? SWIM_Y - Math.random() * 0.35,
      retarget: 0,
      age: 0,
      home: opts.home ?? null, // a clownfish stays close to its anemone, the snail to its lily pad
    }
    s.pos.y = opts.y ?? s.depth
    this.pickTarget(s)
    this.scene.add(c.group)
    this.place(s, 0)
    this.swimmers.push(s)
    return s
  }

  remove(s) {
    s.group.removeFromParent()
    const i = this.swimmers.indexOf(s)
    if (i >= 0) this.swimmers.splice(i, 1)
  }

  clear() {
    for (const s of [...this.swimmers]) this.remove(s)
  }

  randomSpot(out = new THREE.Vector3()) {
    const b = this.bounds
    for (let i = 0; i < 20; i++) {
      const z = b.zMin + Math.random() * (b.zMax - b.zMin)
      const w = b.x(z)
      out.set((Math.random() * 2 - 1) * w, 0, z)
      if (Math.hypot(out.x - b.avoid.x, out.z - b.avoid.z) > b.avoidR) break
    }
    return out
  }

  pickTarget(s) {
    if (s.home) {
      const a = Math.random() * Math.PI * 2
      // A clownfish circles its anemone; the pond snail creeps about under the edge of its lily pad
      const r = s.homeR ? s.homeR * (0.45 + Math.random() * 0.6) : 0.5 + Math.random() * 1.1
      s.target.set(s.home.x + Math.cos(a) * r, 0, s.home.z + Math.sin(a) * r)
    } else {
      // Somewhere clear of the others, so swimmers don't bunch up and a tap picks the one meant
      let best = -1
      for (let i = 0; i < 6; i++) {
        this.randomSpot(SPOT)
        let near = Infinity
        for (const o of this.swimmers) if (o !== s && !o.home) near = Math.min(near, o.target.distanceTo(SPOT), Math.hypot(o.pos.x - SPOT.x, o.pos.z - SPOT.z))
        if (near > best) {
          best = near
          s.target.copy(SPOT)
        }
        if (near > 3.2) break
      }
    }
    s.retarget = 4 + Math.random() * 5
  }

  /** Point the model along its heading and wiggle it like it's swimming. */
  place(s, t, wiggle = 1) {
    const g = s.group
    g.position.copy(s.pos)
    const how = s.info.how
    if (s.id === 'jellyfish') {
      g.position.y += Math.sin(t * 2 + s.phase) * 0.12
      g.rotation.set(0, s.heading, 0)
      const p = 1 + Math.sin(t * 4 + s.phase) * 0.06 * wiggle
      g.scale.set(s.baseScale * p, s.baseScale / p, s.baseScale * p)
      return
    }
    g.rotation.set(Math.sin(t * 3 + s.phase) * 0.06 * wiggle, s.heading + Math.sin(t * 5 + s.phase) * 0.08 * wiggle, 0)
    if (how === 'surface') {
      g.position.y = 0.02 + Math.sin(t * 2.5 + s.phase) * 0.04
      g.rotation.x = Math.sin(t * 2 + s.phase) * 0.08
    }
    if (s.parts.tail) {
      const wag = Math.sin(t * (6 + s.speed * 4) + s.phase) * 0.45 * wiggle
      if (s.id === 'whale' || s.id === 'narwhal') s.parts.tail.rotation.z = wag * 0.6
      else if (s.id === 'crayfish') s.parts.tail.rotation.z = wag * 0.25
      else s.parts.tail.rotation.y = wag
    }
    if (s.id === 'octopus' || s.id === 'crab' || s.id === 'crayfish' || s.id === 'frog') g.position.y += Math.sin(t * 3 + s.phase) * 0.08
  }

  /** Turn smoothly toward a point and swim at it; returns the distance left. */
  steer(s, to, dt, speed, turn = 2.5) {
    const dx = to.x - s.pos.x
    const dz = to.z - s.pos.z
    const want = Math.atan2(-dz, dx)
    let diff = want - s.heading
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    s.heading += THREE.MathUtils.clamp(diff, -turn * dt, turn * dt)
    const go = speed * dt * (0.4 + 0.6 * Math.max(0, Math.cos(diff)))
    s.pos.x += Math.cos(s.heading) * go
    s.pos.z -= Math.sin(s.heading) * go
    return Math.hypot(dx, dz)
  }

  update(dt, t) {
    const b = this.bounds
    for (let i = this.swimmers.length - 1; i >= 0; i--) {
      const s = this.swimmers[i]
      s.age += dt
      if (s.mode === 'wander') {
        s.retarget -= dt
        const d = this.steer(s, s.target, dt, s.speed, 1.2)
        if (d < 0.6 || s.retarget < 0) this.pickTarget(s)
        // Keep clear of the boat
        const ax = s.pos.x - b.avoid.x
        const az = s.pos.z - b.avoid.z
        const ad = Math.hypot(ax, az)
        if (ad < b.avoidR) {
          s.pos.x += (ax / ad) * (b.avoidR - ad) * dt * 2
          s.pos.z += (az / ad) * (b.avoidR - ad) * dt * 2
        }
        s.pos.y += (s.depth - s.pos.y) * Math.min(1, dt * 1.5)
        // A gentle nudge apart from any swimmer too close (homes keep theirs: the snail stays by its pad)
        if (!s.home) {
          for (const o of this.swimmers) {
            if (o === s || o.mode !== 'wander') continue
            const ox = s.pos.x - o.pos.x
            const oz = s.pos.z - o.pos.z
            const od = Math.hypot(ox, oz)
            if (od > 0.01 && od < SPACE) {
              s.pos.x += (ox / od) * (SPACE - od) * dt * 0.8
              s.pos.z += (oz / od) * (SPACE - od) * dt * 0.8
            }
          }
        }
      } else if (s.mode === 'flee') {
        // Swim off giggling, and come back to wandering a little later
        s.fleeFor -= dt
        this.steer(s, s.target, dt, s.speed * 2.6, 4)
        s.pos.y += (s.depth - 0.4 - s.pos.y) * Math.min(1, dt)
        if (s.fleeFor <= 0) {
          if (s.vanish) {
            this.remove(s)
            continue
          }
          s.mode = 'wander'
          this.pickTarget(s)
        }
      }
      // approach / nibble / hold are driven by the fishing code in main.js
      this.place(s, t, s.mode === 'hold' ? 0.3 : 1)
    }
  }
}

function fallback() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshStandardMaterial({ color: '#ff9f1c' }))
  body.scale.set(1, 0.6, 0.5)
  g.add(body)
  return g
}
