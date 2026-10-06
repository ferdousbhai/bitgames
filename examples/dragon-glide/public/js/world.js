import * as THREE from 'three'
import { makeGlowTexture } from './effects.js'
import { Dragon, LOOKS } from './dragon.js'
import { copy } from './models.js'
import { WORLDS, WORLD_LENGTH, worldAt } from './worlds.js'

const rand = THREE.MathUtils.randFloat
const pick = (list) => list[Math.floor(Math.random() * list.length)]
function weighted(list) {
  let total = 0
  for (const [, w] of list) total += w
  let r = Math.random() * total
  for (const [v, w] of list) if ((r -= w) <= 0) return v
  return list[0][0]
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
    vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0);
    gl_Position = p.xyww;
  }
`
const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform vec3 uFog;
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    vec3 c = mix(uBottom, uTop, smoothstep(-0.05, 0.6, h));
    c = mix(c, uFog, smoothstep(0.05, -0.25, h));
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`

const FALL_VERT = /* glsl */ `
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`
const FALL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uNight;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  vec3 band(float x) {
    float i = floor(x * 6.0);
    if (i < 1.0) return vec3(1.0, 0.36, 0.42);
    if (i < 2.0) return vec3(1.0, 0.62, 0.26);
    if (i < 3.0) return vec3(1.0, 0.87, 0.3);
    if (i < 4.0) return vec3(0.45, 0.88, 0.45);
    if (i < 5.0) return vec3(0.35, 0.7, 1.0);
    return vec3(0.7, 0.5, 1.0);
  }
  void main() {
    vec3 c = band(vUv.x);
    float flow = fract(vUv.y * 5.0 + uTime * 1.6 + sin(vUv.x * 18.0) * 0.08);
    c += smoothstep(0.75, 1.0, flow) * 0.35;
    float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
    float alpha = edge * smoothstep(0.0, 0.35, vUv.y) * 0.9;
    c *= 1.0 + uNight * 0.4;
    gl_FragColor = vec4(c, alpha);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

/**
 * The sky and everything that floats in it that isn't part of the course: islands with
 * trees, windmills and castles, rainbow waterfalls, clouds, the sun or moon, and the nests
 * at the end of each world (with Ember's family waiting in them).
 */
export class World {
  constructor(scene, templates) {
    this.scene = scene
    this.t = templates
    this.time = 0
    this.items = [] // scenery: { obj, z, update? }
    this.nextZ = 0
    this.nests = []

    // Sky dome with a gradient that follows the world colours
    this.top = new THREE.Color(WORLDS[0].top)
    this.bottom = new THREE.Color(WORLDS[0].bottom)
    this.fogColor = new THREE.Color(WORLDS[0].fog)
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { uTop: { value: this.top }, uBottom: { value: this.bottom }, uFog: { value: this.fogColor } },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    })
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.skyMat)
    this.sky.renderOrder = -10
    this.sky.frustumCulled = false
    scene.add(this.sky)
    scene.fog = new THREE.Fog(this.fogColor, 50, 180)

    // Lights
    this.hemi = new THREE.HemisphereLight('#ffffff', '#7fbf6a', 1.5)
    scene.add(this.hemi)
    this.key = new THREE.DirectionalLight('#fff1d6', 2.4)
    this.key.position.set(5, 10, 6)
    scene.add(this.key)
    scene.add(this.key.target)

    // Sun (a soft glow far ahead) and a sleepy moon for the night
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(false), color: '#fff6c9', transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }))
    this.sun.scale.setScalar(70)
    scene.add(this.sun)
    this.moon = templates.moon.clone()
    this.moon.scale.setScalar(9)
    this.moon.traverse((o) => {
      if (o.isMesh) o.material = o.material.clone()
      if (o.isMesh) o.material.fog = false
    })
    this.moon.visible = false
    scene.add(this.moon)

    // Twinkling stars for the night sky: a shell around the camera
    const n = 500
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const y = Math.random() * 0.95 + 0.02
      const r = Math.sqrt(1 - y * y)
      pos.set([Math.cos(a) * r * 300, y * 300, Math.sin(a) * r * 300], i * 3)
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.starMat = new THREE.PointsMaterial({ map: makeGlowTexture(true), size: 7, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, color: '#fff6dc' })
    this.stars = new THREE.Points(sg, this.starMat)
    this.stars.frustumCulled = false
    this.stars.renderOrder = -9
    scene.add(this.stars)

    // Rainbow waterfalls share one material (its time uniform makes them flow)
    this.fallMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uNight: { value: 0 } }]),
      vertexShader: FALL_VERT,
      fragmentShader: FALL_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    })
    const fg = new THREE.PlaneGeometry(1, 1, 1, 12)
    fg.translate(0, -0.5, 0)
    const p = fg.attributes.position
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i)
      p.setZ(i, -Math.pow(-y, 0.6) * 0.18) // curves outward like water pouring over an edge
    }
    this.fallGeo = fg
    this.mistMat = new THREE.SpriteMaterial({ map: makeGlowTexture(false), color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false })

    this.mix = { top: new THREE.Color(), bottom: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), key: new THREE.Color() }
    this.night = 0
    this.density = 1 // lowered on devices that struggle
  }

  reset(startZ) {
    for (const it of this.items) this.scene.remove(it.obj)
    this.items.length = 0
    for (const n of this.nests) this.scene.remove(n.group)
    this.nests.length = 0
    this.nextZ = startZ - 30
    this.startWorld = worldAt(startZ)
    this.applyColors(startZ, true)
  }

  /** Islands and clouds, ahead up to `aheadZ` (distance along the flight). */
  generate(aheadZ, lane) {
    while (this.nextZ < aheadZ) {
      const z = this.nextZ
      const w = WORLDS[worldAt(z)]
      const endZ = (worldAt(z) + 1) * WORLD_LENGTH
      const nearNest = Math.abs(z - endZ) < 30 || Math.abs(z - (endZ - WORLD_LENGTH)) < 12
      // Islands on both sides, below the flight path
      const d = this.density
      for (const side of [-1, 1]) {
        if (Math.random() < 0.7 * d) {
          const minX = nearNest ? 16 : lane.x + 9
          this.island(w, side * rand(minX, minX + 24), rand(-15, -4), z + rand(-4, 4), rand(0.8, 1.6))
        }
      }
      // Far-off islands for depth
      if (Math.random() < 0.3 * d) this.island(w, (Math.random() < 0.5 ? -1 : 1) * rand(32, 70), rand(-30, 10), z + rand(-5, 5), rand(2, 3.5), false)
      // Low islands right under the path
      if (!nearNest && Math.random() < 0.2 * d) this.island(w, rand(-lane.x, lane.x), rand(-14, -10), z, rand(1, 1.6))
      // Clouds: big ones below, small ones rushing past close by
      if (Math.random() < 0.55 * d) this.cloud(rand(-50, 50), rand(-26, -14), z + rand(-5, 5), rand(3, 6))
      if (Math.random() < 0.5 * d) {
        const side = Math.random() < 0.5 ? -1 : 1
        // these drift outward only, so they never wander into Ember's (and the camera's) path
        this.cloud(side * rand(lane.x + 4, lane.x + 14), rand(-2, 12), z + rand(-5, 5), rand(1.2, 2.4), side * rand(0, 0.4))
      }
      if (Math.random() < 0.2 * d) this.cloud(rand(-30, 30), rand(16, 26), z, rand(2, 4))
      this.nextZ += rand(13, 18)
    }
  }

  island(w, x, y, z, s, decorate = true) {
    const g = new THREE.Group()
    const isl = copy(this.t.island, w.island)
    g.add(isl)
    g.rotation.y = Math.random() * Math.PI * 2
    if (decorate) {
      const n = s > 1.2 ? 2 : 1
      for (let i = 0; i < n; i++) {
        const kind = weighted(w.decor)
        const d = copy(this.t[kind], decorRecolor(kind))
        const a = Math.random() * Math.PI * 2
        const r = n > 1 ? rand(0.8, 1.4) : rand(0, 0.6)
        d.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r)
        d.rotation.y = rand(-0.6, 0.6) - g.rotation.y // face the camera
        const ds = kind === 'castle' || kind === 'windmill' ? rand(0.7, 0.85) : rand(0.7, 1.1)
        d.scale.setScalar(ds)
        g.add(d)
        if (kind === 'windmill') {
          const blades = d.getObjectByName('windmill_blades')
          const speed = rand(0.8, 1.6)
          this.items.push({ obj: null, z: -z, spin: blades, speed })
        }
        if (kind === 'gumdrop' || kind === 'mushroom') {
          for (let k = 0; k < 2; k++) {
            const e = copy(this.t[kind], decorRecolor(kind))
            const a2 = Math.random() * Math.PI * 2
            e.position.set(Math.cos(a2) * rand(1.2, 2), 0.3, Math.sin(a2) * rand(1.2, 2))
            e.scale.setScalar(rand(0.5, 0.9))
            g.add(e)
          }
        }
      }
      if (Math.random() < w.waterfalls) this.waterfall(g, s)
    }
    g.position.set(x, y, -z)
    g.scale.setScalar(s)
    this.add(g, z)
    return g
  }

  waterfall(g, s) {
    const fall = new THREE.Mesh(this.fallGeo, this.fallMat)
    const h = rand(9, 16) / s
    const a = Math.random() * Math.PI * 2
    fall.position.set(Math.cos(a) * 2.5, 0.25, Math.sin(a) * 2.5)
    fall.rotation.y = -a + Math.PI / 2
    fall.scale.set(2.2, h, 1)
    fall.renderOrder = 2
    g.add(fall)
    // a little pool and some mist where it leaves the island
    const mist = new THREE.Sprite(this.mistMat)
    mist.position.set(Math.cos(a) * 2.6, 0.2 - h * 0.85, Math.sin(a) * 2.6)
    mist.scale.setScalar(3)
    g.add(mist)
  }

  cloud(x, y, z, s, drift = rand(-0.4, 0.4)) {
    const c = copy(this.t.cloud)
    c.position.set(x, y, -z)
    c.scale.set(s * rand(1, 1.5), s, s)
    c.rotation.y = rand(-0.4, 0.4)
    this.add(c, z, { drift })
  }

  add(obj, z, extra) {
    this.scene.add(obj)
    this.items.push({ obj, z: -z, ...extra })
  }

  /** The nest at the end of world `i`: an island with a twiggy nest and Mum and Dad in it. */
  addNest(i) {
    const z = (i + 1) * WORLD_LENGTH
    const w = WORLDS[i]
    const group = new THREE.Group()
    const isl = copy(this.t.island, { ...w.island, island_grass: w.island.island_grass[0], island_flower: w.island.island_flower[0] })
    isl.scale.setScalar(1.6)
    group.add(isl)
    const nest = copy(this.t.nest)
    nest.scale.setScalar(1.5)
    nest.position.y = 0.45
    group.add(nest)
    const family = []
    for (const [look, x] of [['mum', -1.9], ['dad', 1.9]]) {
      const d = new Dragon(this.t.dragon, LOOKS[look])
      d.root.scale.setScalar(1.45)
      d.root.position.set(x, 1.8, 0.2)
      d.root.rotation.y = Math.PI + (x < 0 ? 0.35 : -0.35)
      group.add(d.root)
      family.push(d)
    }
    // trees around the edge so the nest sits in a little garden
    for (const a of [2.4, 3.6, 0.6]) {
      const kind = w.decor[0][0] === 'castle' ? 'tree' : w.decor[0][0]
      const d = copy(this.t[kind], decorRecolor(kind))
      d.position.set(Math.cos(a) * 3.2, 0.5, -Math.abs(Math.sin(a)) * 2.6)
      d.scale.setScalar(kind === 'windmill' ? 0.8 : 1.1)
      group.add(d)
    }
    group.position.set(0, NEST_Y, -z - 1.1) // a little beyond where Ember lands, so Ember sits in front
    this.scene.add(group)
    const nestObj = { i, z, group, family, cheer: 0 }
    this.nests.push(nestObj)
    return nestObj
  }

  nestFor(i) {
    return this.nests.find((n) => n.i === i)
  }

  /** Sky colours, light and fog drift from one world to the next around each nest. */
  applyColors(z, instant = false) {
    const i = worldAt(z)
    const into = z - i * WORLD_LENGTH
    // blend in from the previous world just after leaving its nest
    const a = WORLDS[Math.max(0, i - 1)]
    const b = WORLDS[i]
    const k = i === this.startWorld ? 1 : THREE.MathUtils.smoothstep(into, 0, 50)
    const m = this.mix
    const lerp = (out, key) => out.set(a[key]).lerp(TMP.set(b[key]), k)
    lerp(m.top, 'top')
    lerp(m.bottom, 'bottom')
    lerp(m.fog, 'fog')
    lerp(m.sun, 'sun')
    m.hemiSky.set(a.hemi[0]).lerp(TMP.set(b.hemi[0]), k)
    m.hemiGround.set(a.hemi[1]).lerp(TMP.set(b.hemi[1]), k)
    m.key.set(a.key[0]).lerp(TMP.set(b.key[0]), k)
    const rate = instant ? 1 : 0.08
    this.top.lerp(m.top, rate)
    this.bottom.lerp(m.bottom, rate)
    this.fogColor.lerp(m.fog, rate)
    this.sun.material.color.lerp(m.sun, rate)
    this.hemi.color.lerp(m.hemiSky, rate)
    this.hemi.groundColor.lerp(m.hemiGround, rate)
    this.hemi.intensity += (a.hemi[2] + (b.hemi[2] - a.hemi[2]) * k - this.hemi.intensity) * rate
    this.key.color.lerp(m.key, rate)
    this.key.intensity += (a.key[1] + (b.key[1] - a.key[1]) * k - this.key.intensity) * rate
    const night = (a.night ? 1 - k : 0) + (b.night ? k : 0)
    this.night += (night - this.night) * rate
    this.worldIndex = i
  }

  update(dt, camera, flightZ) {
    this.time += dt
    this.applyColors(flightZ)
    this.fallMat.uniforms.uTime.value = this.time
    this.fallMat.uniforms.uNight.value = this.night
    // clouds ignore fog, so they take on the night themselves
    this.cloudMat ??= this.t.cloud.getObjectByProperty('isMesh', true).material
    this.cloudMat.color.setRGB(1, 1, 1).lerp(NIGHT_CLOUD, this.night)

    // Sky things follow the camera
    const c = camera.position
    this.sky.position.copy(c)
    this.stars.position.copy(c)
    this.stars.rotation.y = this.time * 0.003
    this.starMat.opacity = this.night * (0.8 + Math.sin(this.time * 2) * 0.1)
    this.stars.visible = this.night > 0.02
    this.sun.position.set(c.x + 40, c.y + 45, c.z - 260)
    this.sun.material.opacity = 0.6 * (1 - this.night)
    this.sun.visible = this.night < 0.98
    this.moon.visible = this.night > 0.05
    // the end card can ask the moon to drift further left, out from behind its stars
    this.moonX = THREE.MathUtils.damp(this.moonX ?? -45, this.moonAside ? -150 : -45, 2, dt)
    this.moon.position.set(c.x + this.moonX, c.y + 38, c.z - 200)
    this.moon.rotation.set(0, 0.25, Math.sin(this.time * 0.4) * 0.08)
    this.moon.scale.setScalar(9 * Math.min(1, this.night * 1.2))
    this.key.position.set(c.x + 5, c.y + 10, c.z + 6)
    this.key.target.position.set(c.x, c.y, c.z - 10)

    // Spin windmills, drift clouds, drop what's behind the camera
    const behind = c.z + 40
    let n = 0
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]
      if (it.z > behind) {
        if (it.obj) this.scene.remove(it.obj)
        continue
      }
      if (it.spin) it.spin.rotation.z += dt * it.speed
      if (it.drift) it.obj.position.x += it.drift * dt
      this.items[n++] = it
    }
    this.items.length = n

    for (const nest of this.nests) {
      if (nest.group.position.z > behind + 30) continue
      for (const [k, d] of nest.family.entries()) {
        const excited = nest.cheer > 0
        d.update(dt, { flap: excited ? 1.2 : 0.2, glide: !excited })
        if (excited && d.hop <= 0 && Math.random() < dt * 2.5) d.hop = 1
        if (excited && Math.random() < dt * 0.6) d.twirl()
        d.root.rotation.y = Math.PI + (k === 0 ? 0.35 : -0.35) + Math.sin(this.time * 1.3 + k) * 0.1
      }
      nest.cheer = Math.max(0, nest.cheer - dt)
    }
    for (let i = this.nests.length - 1; i >= 0; i--) {
      if (this.nests[i].group.position.z > behind + 60) {
        this.scene.remove(this.nests[i].group)
        this.nests.splice(i, 1)
      }
    }
  }
}

export const NEST_Y = -1.6
const TMP = new THREE.Color()
const NIGHT_CLOUD = new THREE.Color('#7f86c4')

/** Some decorations get a little colour variety of their own. */
function decorRecolor(kind) {
  if (kind === 'lollipop') return { lolly_a: ['#ff5c9a', '#4cc9f0', '#9b5de5', '#ff9f1c', '#3ccf8e'] }
  if (kind === 'gumdrop') return { gumdrop: ['#9b5de5', '#ff5c8a', '#3ccf8e', '#ffd23f', '#4cc9f0'] }
  if (kind === 'tree') return { tree_leaf: ['#3fb85a', '#5cc95a', '#8bd14b', '#2fa86a'] }
  if (kind === 'mushroom') return { mushroom_cap: [{ color: '#7cf0ff', emissive: '#45d8ff', emissiveIntensity: 1.3 }, { color: '#ffa8f0', emissive: '#ff6bd5', emissiveIntensity: 1.3 }, { color: '#fff08a', emissive: '#ffd23f', emissiveIntensity: 1.3 }] }
  if (kind === 'castle') return { castle_roof: ['#8a63d2', '#ff6b9d', '#4cc9f0'] }
  return undefined
}
export { decorRecolor, pick }
