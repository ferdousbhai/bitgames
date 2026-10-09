import * as THREE from 'three'
import { BIOMES, HOME_X, biomeIndexAt } from './biomes.js'
import { copy } from './models.js'
import { keepWhere, pick, rand } from './util.js'

const AHEAD = 75 // build scenery this far in front of the camera
const BEHIND = 45 // and drop it this far behind

/**
 * Layers of scenery at different depths. The camera follows the bunny, so the
 * far layers slide by slower than the near ones: parallax for free.
 */
const LAYERS = [
  { key: 'near', z: [3.0, 6.5], gap: [0.5, 1.3], shadow: false, faceCamera: true },
  { key: 'side', z: [-2.2, -3.4], gap: [2.5, 5.5], shadow: true },
  { key: 'mid', z: [-5.5, -12], gap: [1.8, 4], shadow: true },
  { key: 'back', z: [-15, -25], gap: [3.5, 7], shadow: false },
]

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}

/** Pale speckles and little blades, tinted by the material colour. */
const grassTexture = () =>
  canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * w
      const y = Math.random() * h
      const l = 3 + Math.random() * 7
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(0,40,0,0.10)' : 'rgba(255,255,220,0.35)'
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + Math.random() * 3 - 1.5, y - l)
      g.stroke()
    }
  })

/** A dirt path with pebbles, fading softly into the grass at both edges. */
const pathTexture = () =>
  canvasTexture(256, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(0.16, 'rgba(255,255,255,1)')
    grad.addColorStop(0.84, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * w
      const y = h * (0.22 + Math.random() * 0.56)
      g.fillStyle = Math.random() < 0.6 ? 'rgba(120,80,40,0.18)' : 'rgba(255,255,255,0.6)'
      g.beginPath()
      g.ellipse(x, y, 2 + Math.random() * 4, 1.5 + Math.random() * 2.5, 0, 0, Math.PI * 2)
      g.fill()
    }
  })

export class World {
  constructor(scene, templates) {
    this.scene = scene
    this.templates = templates

    this.skyUniforms = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } }
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.skyUniforms,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = clamp(vP.y * 2.2 + 0.05, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, t), 1.0);\n#include <colorspace_fragment>\n}',
      }),
    )
    this.sky.renderOrder = -1
    scene.add(this.sky)
    scene.fog = new THREE.Fog('#ffffff', 40, 105)

    this.hemi = new THREE.HemisphereLight('#ffffff', '#6aa84f', 1.15)
    scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight('#ffffff', 2.4)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    Object.assign(this.sun.shadow.camera, { left: -22, right: 22, top: 16, bottom: -16, near: 1, far: 60 })
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.02
    scene.add(this.sun, this.sun.target)

    // Ground and path stay under the camera; they snap by whole texture tiles,
    // so the texture looks fixed to the world while they follow along.
    this.tile = 8
    const grass = grassTexture()
    grass.repeat.set(400 / this.tile, 128 / this.tile)
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 128), new THREE.MeshLambertMaterial({ map: grass }))
    this.ground.rotation.x = -Math.PI / 2
    this.ground.position.z = -24
    this.ground.receiveShadow = true
    scene.add(this.ground)
    const dirt = pathTexture()
    dirt.repeat.set(400 / this.tile, 1)
    this.path = new THREE.Mesh(new THREE.PlaneGeometry(400, 3.2), new THREE.MeshLambertMaterial({ map: dirt, transparent: true, depthWrite: false }))
    this.path.rotation.x = -Math.PI / 2
    this.path.position.y = 0.02
    this.path.receiveShadow = true
    scene.add(this.path)

    this.hillGeo = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2)
    this.hillMats = new Map()

    this.palette = this.paletteOf(BIOMES[0])
    this.target = this.paletteOf(BIOMES[0])
    this.items = []
    this.butterflies = []
    this.butterflyBiome = -1
    this.box = new THREE.Box3()
    this.v = new THREE.Vector3()
    this.clouds = []
    for (let i = 0; i < 7; i++) {
      const c = copy(templates.cloud)
      c.scale.setScalar(rand(1.8, 3.2))
      c.position.set(rand(-60, 60), rand(13, 22), rand(-70, -55))
      c.userData.drift = rand(0.3, 0.8)
      scene.add(c)
      this.clouds.push(c)
    }
    this.reset()
  }

  paletteOf(b) {
    const C = (c) => new THREE.Color(c)
    return {
      skyTop: C(b.sky[0]), skyBottom: C(b.sky[1]), fog: C(b.fog), ground: C(b.ground), path: C(b.path),
      hemiSky: C(b.hemi[0]), hemiGround: C(b.hemi[1]), sun: C(b.sun[0]), sunI: b.sun[1],
    }
  }

  reset(x = 0) {
    for (const it of this.items) this.scene.remove(it)
    this.items = []
    this.spawnX = Object.fromEntries(LAYERS.map((l) => [l.key, x - 40 + rand(0, 3)]))
    this.resetX = x
    this.hillX = [x - 80, x - 90]
    this.home = null
    for (const f of this.butterflies) this.scene.remove(f)
    this.butterflies = []
    this.butterflyBiome = -1
    this.butterflyX = null
    this.biome = biomeIndexAt(x)
    this.target = this.paletteOf(BIOMES[this.biome])
    this.blendPalette(1)
  }

  hillMaterial(color) {
    let m = this.hillMats.get(color)
    if (!m) this.hillMats.set(color, (m = new THREE.MeshLambertMaterial({ color })))
    return m
  }

  add(obj) {
    this.scene.add(obj)
    this.items.push(obj)
    return obj
  }

  spawnLayer(layer, x) {
    // Keep the menu close-up clear: a flower right in front of the camera looked like a big dark
    // blur behind the mission chip and the Play button.
    if (layer.key === 'near' && Math.abs(x - this.resetX) < 5) return 0
    const b = BIOMES[biomeIndexAt(x)]
    const choices = b[layer.key]
    let total = 0
    for (const c of choices) total += c[1]
    let r = Math.random() * total
    const [name, , s0, s1] = choices.find((c) => (r -= c[1]) < 0) ?? choices[0]
    const obj = copy(this.templates[name], { recolor: b.recolor, shadow: layer.shadow })
    obj.scale.setScalar(rand(s0, s1))
    obj.position.set(x, 0, rand(layer.z[0], layer.z[1]))
    // fences run along the path; near things, flowers and snowmen face the camera; the rest turn any way
    const faceCamera = layer.faceCamera || name === 'flower' || name === 'snowman'
    obj.rotation.y = name === 'fence' ? rand(-0.05, 0.05) : faceCamera ? rand(-0.5, 0.5) : rand(0, Math.PI * 2)
    obj.userData.sway = name === 'flower' || name === 'grass' ? rand(0, 6) : null
    this.tag(obj, name)
    this.add(obj)
    // fences join up into a row
    if (name === 'fence') {
      for (let k = 1; k < 3; k++) {
        const f = copy(this.templates.fence, { shadow: true })
        f.position.set(x + k * 2.05, 0, obj.position.z)
        this.tag(f, 'fence')
        this.add(f)
      }
      return 6
    }
    return 0
  }

  spawnHills(row, x) {
    const b = BIOMES[biomeIndexAt(x)]
    const w = row ? rand(16, 28) : rand(9, 16)
    const h = row ? rand(7, 13) : rand(3.5, 7)
    const m = new THREE.Mesh(this.hillGeo, this.hillMaterial(pick(b.hills)))
    m.scale.set(w, h, row ? rand(8, 12) : rand(5, 8))
    m.position.set(x, -0.2, row ? rand(-58, -50) : rand(-38, -30))
    m.receiveShadow = false
    this.add(m)
    // a few trees dotted on the near hills
    if (!row && b.hillTrees.length && Math.random() < 0.7) {
      const name = pick(b.hillTrees)
      for (let k = 0; k < 3; k++) {
        const t = copy(this.templates[name], { recolor: b.recolor })
        const dx = rand(-0.6, 0.6) * w
        const dz = m.scale.z * 0.5
        t.position.set(x + dx, h * Math.sqrt(Math.max(0, 1 - (dx / w) ** 2 - 0.25)) - 0.5, m.position.z + dz)
        t.scale.setScalar(rand(1.2, 1.8))
        this.add(t)
      }
    }
    return w * rand(0.9, 1.3)
  }

  placeHome() {
    const home = copy(this.templates.burrow, { shadow: true })
    home.scale.setScalar(1.35)
    home.position.set(HOME_X + 1.6, 0, -2.7)
    this.tag(home, 'burrow')
    this.add(home)
    for (let k = 0; k < 8; k++) {
      const f = copy(this.templates.flower, { recolor: BIOMES[0].recolor })
      f.position.set(HOME_X - 3 + k * 0.9 + rand(-0.2, 0.2), 0, rand(-1.2, -1.6))
      f.userData.sway = rand(0, 6)
      this.tag(f, 'flower')
      this.add(f)
    }
    this.home = home
  }

  /** Scenery a tap can poke: it remembers what it is and its size, for the wobble. */
  tag(obj, kind) {
    obj.userData.kind = kind
    obj.userData.s = obj.scale.x
    obj.userData.boing = 0
  }

  /**
   * The bit of scenery (or butterfly) under a tap, or null. Forgiving taps
   * that land near something still count. Pokes it into a wobble and
   * returns { kind, obj, top } (top: a point near the top of it, for effects).
   * `extra`: more tappable things (the obstacles on the path).
   */
  poke(raycaster, camera, sx, sy, forgiving = true, extra = []) {
    const list = this.items.filter((it) => it.userData.kind).concat(extra)
    for (const f of this.butterflies) if (!f.userData.leaving) list.push(f)
    const owner = (o) => {
      while (o && !o.userData.kind) o = o.parent
      return o
    }
    let obj = owner(raycaster.intersectObjects(list, true)[0]?.object)
    const box = this.box
    if (!obj && forgiving) {
      // nothing right under the finger: take the nearest thing within reach
      let best = Math.max(36, Math.min(innerWidth, innerHeight) * 0.07)
      for (const it of list) {
        box.setFromObject(it).getCenter(this.v).project(camera)
        if (this.v.z > 1) continue
        const d = Math.hypot(((this.v.x + 1) / 2) * innerWidth - sx, ((1 - this.v.y) / 2) * innerHeight - sy)
        if (d < best) {
          best = d
          obj = it
        }
      }
    }
    if (!obj) return null
    const u = obj.userData
    if (u.kind === 'butterfly') u.scare = 1
    else u.boing = 1
    box.setFromObject(obj)
    const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y + (box.max.y - box.min.y) * 0.75, (box.min.z + box.max.z) / 2)
    return { kind: u.kind, obj, top }
  }

  /** Smoke comes out of the chimney here. */
  chimney(out) {
    return out.set(0.7, 1.95, -0.3).multiplyScalar(this.home.scale.x).add(this.home.position)
  }

  blendPalette(k) {
    const p = this.palette
    const t = this.target
    for (const key of ['skyTop', 'skyBottom', 'fog', 'ground', 'path', 'hemiSky', 'hemiGround', 'sun']) p[key].lerp(t[key], k)
    p.sunI += (t.sunI - p.sunI) * k
    this.skyUniforms.top.value.copy(p.skyTop)
    this.skyUniforms.bottom.value.copy(p.skyBottom)
    this.scene.fog.color.copy(p.fog)
    this.ground.material.color.copy(p.ground)
    this.path.material.color.copy(p.path)
    this.hemi.color.copy(p.hemiSky)
    this.hemi.groundColor.copy(p.hemiGround)
    this.sun.color.copy(p.sun)
    this.sun.intensity = p.sunI
  }

  updateButterflies(dt, bunnyX, time, biomeIdx) {
    const b = BIOMES[biomeIdx]
    if (biomeIdx !== this.butterflyBiome) {
      this.butterflyBiome = biomeIdx
      for (const f of this.butterflies) f.userData.leaving = true
      for (let i = 0; i < b.butterflies; i++) {
        const f = copy(this.templates.butterfly, { recolor: b.recolor })
        f.scale.setScalar(2.2)
        f.userData = { kind: 'butterfly', phase: rand(0, 6), ox: rand(2, 8), oz: rand(-3, -1.2), oy: rand(1.8, 3.2), x: bunnyX + 25 + i * 6, rise: 0, scare: 0 }
        f.position.set(f.userData.x, 2, 0)
        f.userData.wings = [f.getObjectByName('butterfly_wing_L'), f.getObjectByName('butterfly_wing_R')]
        this.scene.add(f)
        this.butterflies.push(f)
      }
    }
    // they keep up with Pip (rather than trailing behind round his head), then drift about
    const moved = bunnyX - (this.butterflyX ?? bunnyX)
    this.butterflyX = bunnyX
    keepWhere(this.butterflies, (f) => {
      const u = f.userData
      if (!u.leaving) u.x += moved
      // flutter along with the bunny, a little ahead, drifting about
      const goal = u.leaving ? f.position.x - 1 : bunnyX + u.ox + Math.sin(time * 0.4 + u.phase) * 2
      u.x = THREE.MathUtils.damp(u.x, goal, u.leaving ? 0.2 : 1.2, dt)
      if (u.leaving) u.rise += dt * 2
      // a poked butterfly darts up in a little loop, then settles back
      u.scare = Math.max(0, u.scare - dt * 0.8)
      const dart = Math.sin(u.scare * Math.PI) * 1.6
      f.position.set(u.x + Math.sin(u.scare * 9) * u.scare * 0.6, u.oy + Math.sin(time * 2.3 + u.phase) * 0.5 + u.rise + dart, u.oz + Math.sin(time * 0.9 + u.phase) * 0.8)
      // flying along the path, rolled a little towards the camera, so the wings
      // show their colours and spots (seen head-on they'd look like a fly)
      f.rotation.set(0.5, Math.sin(time * 0.9 + u.phase) * 0.45, 0)
      // wings beat between flat-ish and raised high, so they show from the side
      u.beat = (u.beat ?? 0) + dt * (20 + u.scare * 30)
      const flap = 0.9 + Math.sin(u.beat + u.phase) * 0.65
      u.wings[0].rotation.x = flap
      u.wings[1].rotation.x = -flap
      if (u.leaving && f.position.y > 12) {
        this.scene.remove(f)
        return false
      }
      return true
    })
  }

  update(dt, camX, bunnyX, time) {
    // Biome colours ease in as the bunny arrives
    const idx = biomeIndexAt(bunnyX)
    if (idx !== this.biome) {
      this.biome = idx
      this.target = this.paletteOf(BIOMES[idx])
    }
    this.blendPalette(Math.min(1, dt * 0.9))

    const snap = Math.round(camX / this.tile) * this.tile
    this.ground.position.x = snap
    this.path.position.x = snap
    this.sky.position.set(camX, 0, 0)
    this.sun.position.set(bunnyX - 6, 16, 12)
    this.sun.target.position.set(bunnyX + 5, 0, -4)

    for (const layer of LAYERS) {
      while (this.spawnX[layer.key] < camX + AHEAD && this.spawnX[layer.key] < HOME_X + 30) {
        const x = this.spawnX[layer.key]
        // keep the home's lawn clear
        const extra = Math.abs(x - HOME_X - 1) < 6 && layer.key !== 'back' && layer.key !== 'near' ? 0 : this.spawnLayer(layer, x)
        this.spawnX[layer.key] += rand(layer.gap[0], layer.gap[1]) + extra
      }
    }
    for (let row = 0; row < 2; row++) {
      while (this.hillX[row] < camX + AHEAD + 40) this.hillX[row] += this.spawnHills(row, this.hillX[row])
    }
    if (!this.home && camX + AHEAD > HOME_X) this.placeHome()

    // Drop what's far behind; sway the flowers
    keepWhere(this.items, (it) => {
      if (it.position.x < camX - BEHIND - (it.position.z < -25 ? 60 : 0)) {
        this.scene.remove(it)
        return false
      }
      const u = it.userData
      if (u.sway != null) it.rotation.z = Math.sin(time * 2 + u.sway) * 0.08
      if (u.boing > 0) {
        // poked: a springy squash and stretch about the base
        u.boing = Math.max(0, u.boing - dt * 1.3)
        const w = Math.sin(u.boing * 26) * 0.25 * u.boing
        it.scale.set(u.s * (1 - w * 0.5), u.s * (1 + w), u.s * (1 - w * 0.5))
        if (u.sway == null) it.rotation.z = w * 0.25
      }
      return true
    })

    for (const c of this.clouds) {
      c.position.x += c.userData.drift * dt
      if (c.position.x < camX - 90) c.position.x += 180
      if (c.position.x > camX + 90) c.position.x -= 180
    }
    this.updateButterflies(dt, bunnyX, time, idx)
  }
}
