import * as THREE from 'three'
import { canvasTexture, rng, wrap } from './util.js'

/**
 * Zoom arches for Race and Bumpers: three times round each loop a white gantry
 * spans the road, with a rainbow arch standing over one lane, a big ⚡ above it
 * and a golden strip on the road leading in. Drive through the rainbow (or, in
 * Easy mode, tap the ⚡ button) for a burst of speed. After the car passes, the
 * rainbow quietly moves to a lane picked at random for next time round. No
 * colliders: cars drive straight through it.
 */
const postGeometry = new THREE.BoxGeometry(0.35, 6.4, 0.35)
const barGeometry = new THREE.BoxGeometry(1, 0.45, 0.45)
const gantryMaterial = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.6 })
const RAINBOW = ['#ff5d6c', '#ffb23f', '#ffe45c', '#7ed957', '#5cc8ff', '#a98bff']

const STRIP_LENGTH = 30
const stripGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
const roadMaterial = (opts) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false, ...opts })
/** The ⚡ fades out from this far from the camera to NEAR, so it never fills the screen under the gantry. */
const FADE_FAR = 22
const FADE_NEAR = 12
/** The rainbow stays until the camera is nearly at it, so the child sees the car go through. */
const ARCH_FAR = 9
const ARCH_NEAR = 3.5

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

function sprite(map, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, fog: false, toneMapped: false }))
  s.scale.set(size, size, 1)
  return s
}

/** A rainbow standing on the road: six half rings, one inside the other, `radius` the outer one. */
function rainbow(radius) {
  const arch = new THREE.Group()
  RAINBOW.forEach((colour, i) => {
    const material = new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.45, roughness: 0.4, transparent: true })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius - i * 0.17, 0.09, 8, 32, Math.PI), material)
    arch.add(ring)
  })
  return arch
}

export function createGates(scene) {
  const group = new THREE.Group()
  group.visible = false
  scene.add(group)
  let gates = []
  let r = Math.random

  /** Places gate `g`'s rainbow, ⚡ and strip over its lane (`g.side`: the road's left -1 or right 1). */
  function place(g) {
    g.tapped = false // Easy mode: the child tapped ⚡ for this gate (kept until the car goes under it)
    const lane = g.at.clone().addScaledVector(g.across, g.side * g.gap)
    g.arch.position.copy(lane).setY(0)
    g.bolt.position.copy(lane).setY(Math.min(5.9, g.radius + 1.9))
    g.strip.position.copy(lane).addScaledVector(g.along, -STRIP_LENGTH / 2 - 1).setY(0.05)
    g.paint.position.copy(lane).addScaledVector(g.along, -STRIP_LENGTH + 2).setY(0.06)
  }

  function clear() {
    for (const g of gates) g.root.traverse((o) => {
      if (o.isSprite || o.geometry === stripGeometry || o.parent === g.arch) o.material.dispose()
      if (o.parent === g.arch) o.geometry.dispose()
    })
    for (const child of [...group.children]) group.remove(child)
    gates = []
  }

  return {
    get gates() { return gates },
    show(value) { group.visible = value },
    clear,

    /** Each frame: the ⚡ and the rainbow fade away right by the camera (they never fill the screen). */
    update(camera) {
      for (const g of gates) {
        const o = Math.min(1, Math.max(0, (g.bolt.position.distanceTo(camera.position) - FADE_NEAR) / (FADE_FAR - FADE_NEAR)))
        g.bolt.material.opacity = o
        g.bolt.material.visible = o > 0.02
        const a = Math.min(1, Math.max(0, (g.arch.position.distanceTo(camera.position) - ARCH_NEAR) / (ARCH_FAR - ARCH_NEAR)))
        g.arch.visible = a > 0.02
        for (const ring of g.arch.children) ring.material.opacity = a
        // A gentle shimmer on the strip, so the lane reads as something good to drive into.
        g.strip.material.opacity = 0.45 + Math.sin(performance.now() / 400 + g.dist) * 0.12
      }
    },

    /** Three gates spread round the loop, clear of ramps and jumps, on straight approaches. Deterministic in `seed`. */
    configure(track, seed) {
      clear()
      r = rng((seed ^ 0x6a7e) >>> 0)
      // A small seed's first numbers lean one way: let the generator settle, so the lane is a true coin toss.
      for (let i = 0; i < 16; i++) r()
      const L = track.length
      // The last gate sits late in the lap, so its burst of speed still counts on the run to the line.
      for (const at of [0.3, 0.6, 0.88]) {
        // From 40 m before its spot to 100 m after (never past the line), the gate goes where the 50 m before it are straightest: on a straight approach no
        // roadside tree stands between the camera and the gate.
        // A ramp or kicker within 90 m after the gate would meet the car mid-burst: such a spot only if nothing else fits.
        let spot = L * at, straightest = Infinity
        for (let d = L * at - 40; d <= Math.min(L * at + 100, L - 25); d += 5) {
          if (track.nearRamp(d, 16)) continue
          const rampAhead = track.ramps.some((r) => wrap(r.dist - r.half - d, L) < 90)
          // Straight on the way in, and not straight into a bend on the way out (a child steering into the lane there met the kerb).
          const bend = track.bendAt(d - 25, 25) + track.bendAt(d + 15, 15) * 0.7 + (rampAhead ? 1 : 0)
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
        const yaw = Math.atan2(f.t.x, f.t.z)
        // Two lanes, a quarter of the road in from each edge; the rainbow spans its half of the road, with room for a car.
        const gap = track.width / 4
        const radius = gap + 0.6
        const arch = rainbow(radius)
        arch.rotation.y = yaw
        const bolt = sprite(pictureTexture('⚡', '#ffd35a'), 2.8)
        const strip = new THREE.Mesh(stripGeometry, roadMaterial({ color: '#ffd35a', opacity: 0.5 }))
        strip.scale.set(gap * 0.9, 1, STRIP_LENGTH)
        const paint = new THREE.Mesh(stripGeometry, roadMaterial({ map: pictureTexture('⚡', '#ffd35a'), opacity: 0.95 }))
        const size = Math.min(2.6, gap * 0.9)
        paint.scale.set(size, 1, size)
        strip.rotation.y = paint.rotation.y = yaw
        strip.renderOrder = paint.renderOrder = 1
        root.add(bar, arch, bolt, strip, paint)
        group.add(root)
        const g = { dist, root, arch, bolt, strip, paint, radius, gap, at: f.p.clone(), across: f.side.clone(), along: f.t.clone(), side: r() < 0.5 ? -1 : 1 }
        place(g)
        gates.push(g)
      }
    },

    /** The car has gone under gate `g`: its rainbow moves to a lane picked at random for next time round. */
    redress(g) {
      g.side = r() < 0.5 ? -1 : 1
      place(g)
    },
  }
}
