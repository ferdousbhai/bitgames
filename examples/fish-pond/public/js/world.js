import * as THREE from 'three'
import { canvasTexture, softDot, starTex } from './effects.js'

/**
 * The lake and everything around it: a sky dome, see-through water with a
 * sandy floor, the far shore (one per place), the sun or moon, clouds and the
 * little things that make each place feel alive (sparkles, fireflies, snow,
 * drifting leaves). Places differ only in data, listed in PLACES.
 */
export const RIG = new THREE.Vector3(0, 0, -5) // where the boat floats
export const FLOOR_Y = -2.4

export const PLACES = {
  lake: {
    emoji: '☀️', name: 'Sunny Lake', shore: 'shore_lake',
    sky: { top: '#4aa8f0', horizon: '#cdeeff', glow: '#fff3c0', stars: 0 },
    fog: '#cfeaff', fogNear: 30, fogFar: 95,
    water: { shallow: '#4fd2d8', deep: '#2a7fc8', sky: '#bfe6ff', sun: '#fffbe8', sparkle: 1.0, near: 0.28 },
    floor: { sand: '#e9d39c', deep: '#7fb6a8', caustic: 0.45 },
    hemi: ['#e8f6ff', '#a3d68f', 1.1], key: ['#fff4e0', 2.1], keyPos: [-6, 10, 8],
    sun: { kind: 'sun', pos: [-0.55, 0.62], scale: 2.1 }, clouds: '#ffffff', extra: 'birds', pads: 7,
  },
  river: {
    emoji: '🌅', name: 'Sunset River', shore: 'shore_river',
    sky: { top: '#6d5bd0', horizon: '#ffb07a', glow: '#ffd27a', stars: 0 },
    fog: '#ffc39b', fogNear: 30, fogFar: 95,
    water: { shallow: '#36b9c8', deep: '#5d55b8', sky: '#ffb08f', sun: '#ffd28a', sparkle: 1.4, near: 0.3 },
    floor: { sand: '#e0bf94', deep: '#8a80a8', caustic: 0.35 },
    hemi: ['#ffd9c2', '#7a6aa0', 1.0], key: ['#ffc290', 2.0], keyPos: [7, 6, 8],
    sun: { kind: 'sun', pos: [0.55, 0.45], scale: 2.6, tint: '#ff9a4d' }, clouds: '#ffc4c4', extra: 'leaves', pads: 5, current: 0.35,
  },
  night: {
    emoji: '🌙', name: 'Starry Night', shore: 'shore_lake',
    sky: { top: '#0d1240', horizon: '#3a3f8f', glow: '#8f9cff', stars: 1 },
    fog: '#283070', fogNear: 30, fogFar: 100,
    water: { shallow: '#2b5d9a', deep: '#141c4f', sky: '#3d4aa0', sun: '#fff3c4', sparkle: 0.8, near: 0.32 },
    floor: { sand: '#5d6a9a', deep: '#2a2f6a', caustic: 0.25 },
    hemi: ['#7c8ce8', '#1f2350', 0.9], key: ['#c8d6ff', 1.3], keyPos: [5, 9, 7],
    sun: { kind: 'moon', pos: [0.55, 0.6], scale: 1.7 }, clouds: null, extra: 'fireflies', pads: 6, night: true,
  },
  // An Arctic sea: narwhals, a whale, snow crabs and jellyfish, with seals resting on the shore
  ice: {
    emoji: '❄️', name: 'Icy Sea', shore: 'shore_ice',
    sky: { top: '#7fb3ea', horizon: '#eef6ff', glow: '#ffffff', stars: 0 },
    fog: '#e6f1ff', fogNear: 28, fogFar: 90,
    water: { shallow: '#3c9ccf', deep: '#1d5a96', sky: '#cfe6ff', sun: '#ffffff', sparkle: 0.6, near: 0.4 },
    floor: { sand: '#b9c9dc', deep: '#6f8fb8', caustic: 0.2 },
    hemi: ['#f2f8ff', '#c1d3ec', 1.2], key: ['#ffffff', 1.7], keyPos: [-5, 9, 8],
    sun: { kind: 'sun', pos: [-0.5, 0.55], scale: 1.6 }, clouds: '#f2f6ff', extra: 'snow', pads: 0, ice: true,
  },
  // A warm, shallow sea: clear turquoise water over sand and coral (blender/models.py build_shore_reef)
  reef: {
    emoji: '🐠', name: 'Coral Reef', shore: 'shore_reef',
    sky: { top: '#3fb3ee', horizon: '#d6fbff', glow: '#fff6cf', stars: 0 },
    fog: '#d2f5fb', fogNear: 30, fogFar: 95,
    water: { shallow: '#4fe0d4', deep: '#1f9fc4', sky: '#c4f3ff', sun: '#fffbe8', sparkle: 0.8, near: 0.2 },
    floor: { sand: '#f3e2b3', deep: '#73cbbf', caustic: 0.55 },
    hemi: ['#ecfdff', '#f0dcae', 1.15], key: ['#fff2dc', 2.0], keyPos: [-6, 10, 8],
    sun: { kind: 'sun', pos: [-0.55, 0.62], scale: 2.0 }, clouds: '#ffffff', extra: 'birds', pads: 0, sea: true,
    // Anemones on the sea floor (three.js x, z): the same spots as REEF_ANEMONES in the builder
    anemones: [[-4.6, 1.2], [4.2, -0.6], [-0.6, 6.4]],
  },
}

/** Ice-fishing holes: tapping anywhere casts into the nearest one. */
export const HOLES = [
  new THREE.Vector3(-3.4, 0, 0.6),
  new THREE.Vector3(2.9, 0, -0.4),
  new THREE.Vector3(0.2, 0, 3.6),
  new THREE.Vector3(-4.6, 0, 4.8),
  new THREE.Vector3(4.4, 0, 4.2),
]
const HOLE_R = 0.95

const col = (c) => new THREE.Color(c)

// --- Shaders --------------------------------------------------------------------------

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop, uHorizon, uGlow, uSunDir;
uniform float uStars, uTime;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 c = mix(uHorizon, uTop, smoothstep(-0.02, 0.55, h));
  c += uGlow * pow(max(dot(d, uSunDir), 0.0), 6.0) * 0.45;
  if (uStars > 0.0) {
    vec3 q = d * 180.0;
    vec3 cell = floor(q);
    float r = hash(cell);
    float s = step(0.986, r) * (1.0 - smoothstep(0.05, 0.22, length(fract(q) - 0.5)));
    s *= 0.6 + 0.4 * sin(uTime * (1.5 + r * 3.0) + r * 40.0);
    c += vec3(1.0, 0.95, 0.85) * s * uStars * smoothstep(0.02, 0.2, h);
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const WATER_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`
const WATER_FRAG = /* glsl */ `
uniform float uTime, uSparkle, uNear, uFogNear, uFogFar, uFlow;
uniform vec3 uShallow, uDeep, uSky, uSunDir, uSunColor, uFog;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
void main() {
  vec2 p = vWorld.xz + vec2(uTime * uFlow, 0.0);
  float t = uTime;
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 1.1 + t * 1.2) * 0.06;
  g += vec2(-0.5, 0.85) * cos(dot(p, vec2(-0.5, 0.85)) * 1.9 + t * 1.7) * 0.04;
  g += vec2(0.95, -0.3) * cos(dot(p, vec2(0.95, -0.3)) * 3.3 + t * 2.3) * 0.025;
  g += vec2(0.2, 0.98) * cos(dot(p, vec2(0.2, 0.98)) * 5.7 + t * 3.1) * 0.015;
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.5);
  vec3 base = mix(uShallow, uDeep, smoothstep(12.0, 45.0, dist));
  vec3 c = mix(base, uSky, clamp(fres * 1.1, 0.0, 0.85));
  vec3 hv = normalize(uSunDir + v);
  float spec = pow(max(dot(n, hv), 0.0), 220.0) * 2.5;
  // Glitter: tiny cells that wink on and off
  vec2 cell = floor(p * 3.0);
  float r = hash(cell);
  float glint = step(0.985, r) * max(0.0, sin(t * 3.0 + r * 60.0)) * (1.0 - smoothstep(0.1, 0.35, length(fract(p * 3.0) - 0.5)));
  float shine = (spec + glint * 0.8) * uSparkle;
  c += uSunColor * shine;
  float a = mix(uNear, 0.97, clamp(fres * 1.6 + smoothstep(14.0, 40.0, dist), 0.0, 1.0));
  a = clamp(a + shine * 0.5, 0.0, 1.0);
  float f = smoothstep(uFogNear, uFogFar, dist);
  c = mix(c, uFog, f);
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const FLOOR_FRAG = /* glsl */ `
uniform float uTime, uCaustic, uFogNear, uFogFar;
uniform vec3 uSand, uDeep, uFog;
varying vec3 vWorld;
float caustic(vec2 p, float t) {
  float c = 0.0;
  c += sin(p.x * 1.7 + sin(p.y * 1.3 + t) * 1.5 + t * 0.7);
  c += sin(p.y * 1.9 + sin(p.x * 1.1 - t * 0.8) * 1.6 - t * 0.6);
  c += sin((p.x + p.y) * 1.2 + sin(p.x * 0.7 + t) + t * 0.5);
  return pow(max(0.0, 1.0 - abs(c) * 0.55), 6.0);
}
void main() {
  float dist = length(cameraPosition - vWorld);
  vec3 c = mix(uSand, uDeep, smoothstep(8.0, 30.0, dist));
  c += vec3(1.0, 1.0, 0.9) * caustic(vWorld.xz * 0.9, uTime) * uCaustic;
  c = mix(c, uFog, smoothstep(uFogNear, uFogFar, dist));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

// --- World ----------------------------------------------------------------------------

export class World {
  constructor(scene, camera, renderer) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.time = 0
    this.shores = {}
    this.placeName = null

    this.hemi = new THREE.HemisphereLight('#fff', '#888', 1)
    this.key = new THREE.DirectionalLight('#fff', 2)
    this.lantern = new THREE.PointLight('#ffc466', 0, 9, 1.6)
    scene.add(this.hemi, this.key, this.lantern)
    scene.fog = new THREE.Fog('#cfeaff', 30, 95)

    this.skyU = { uTop: { value: col('#4aa8f0') }, uHorizon: { value: col('#cdeeff') }, uGlow: { value: col('#fff') }, uSunDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() }, uStars: { value: 0 }, uTime: { value: 0 } }
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(160, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }),
    )
    this.sky.renderOrder = -10
    this.sky.frustumCulled = false
    scene.add(this.sky)

    this.waterU = {
      uTime: { value: 0 }, uSparkle: { value: 1 }, uNear: { value: 0.3 }, uFogNear: { value: 30 }, uFogFar: { value: 95 }, uFlow: { value: 0 },
      uShallow: { value: col('#4fd2d8') }, uDeep: { value: col('#2a7fc8') }, uSky: { value: col('#bfe6ff') },
      uSunDir: { value: new THREE.Vector3(0, 0.5, -1).normalize() }, uSunColor: { value: col('#fff') }, uFog: { value: col('#cfeaff') },
    }
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 90).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms: this.waterU, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false }),
    )
    this.water.position.set(0, 0, -20)
    this.water.renderOrder = 1
    scene.add(this.water)

    this.floorU = { uTime: { value: 0 }, uCaustic: { value: 0.4 }, uFogNear: { value: 30 }, uFogFar: { value: 95 }, uSand: { value: col('#e9d39c') }, uDeep: { value: col('#7fb6a8') }, uFog: { value: col('#cfeaff') } }
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 90).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms: this.floorU, vertexShader: WATER_VERT, fragmentShader: FLOOR_FRAG }),
    )
    this.floor.position.set(0, FLOOR_Y, -20)
    scene.add(this.floor)

    this.ice = this.makeIce()
    scene.add(this.ice)

    // The boat, bear and bucket all hang off one rig
    this.rig = new THREE.Group()
    this.rig.position.copy(RIG)
    this.rig.scale.setScalar(2.1)
    scene.add(this.rig)

    this.clouds = []
    this.pads = []
    this.weeds = []
    this.makeAmbient()
  }

  makeIce() {
    const S = 1024
    const W = 70 // world units across the texture
    const toPx = (x, z) => [((x + W / 2) / W) * S, ((z + W / 2 + 15) / W) * S] // centred on z = -15
    const tex = canvasTexture(S, S, (g) => {
      g.fillStyle = 'rgba(226, 242, 255, 0.86)'
      g.fillRect(0, 0, S, S)
      // frosty streaks
      for (let i = 0; i < 160; i++) {
        g.strokeStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.3})`
        g.lineWidth = 1 + Math.random() * 3
        g.beginPath()
        let x = Math.random() * S
        let y = Math.random() * S
        g.moveTo(x, y)
        for (let k = 0; k < 4; k++) g.lineTo((x += (Math.random() - 0.5) * 60), (y += (Math.random() - 0.5) * 60))
        g.stroke()
      }
      // clear patches you can peek through
      for (let i = 0; i < 26; i++) {
        const [x, y] = toPx((Math.random() - 0.5) * 22, -4 + Math.random() * 12)
        const r = 20 + Math.random() * 40
        const grad = g.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, 'rgba(0,0,0,0.5)')
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        g.globalCompositeOperation = 'destination-out'
        g.fillStyle = grad
        g.fillRect(x - r, y - r, r * 2, r * 2)
        g.globalCompositeOperation = 'source-over'
      }
      for (const h of HOLES) {
        const [x, y] = toPx(h.x, h.z)
        const r = (HOLE_R / W) * S
        g.globalCompositeOperation = 'destination-out'
        g.fillStyle = '#000'
        g.beginPath()
        g.arc(x, y, r, 0, Math.PI * 2)
        g.fill()
        g.globalCompositeOperation = 'source-over'
      }
    })
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.25, metalness: 0, depthWrite: false })
    const ice = new THREE.Group()
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(W, W).rotateX(-Math.PI / 2), mat)
    sheet.position.set(0, 0.03, -15)
    sheet.renderOrder = 2
    ice.add(sheet)
    // Far ice beyond the texture
    const far = new THREE.Mesh(new THREE.PlaneGeometry(140, 60).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e8f4ff', roughness: 0.3 }))
    far.position.set(0, 0.02, -15 - W / 2 - 29.9)
    ice.add(far)
    const snowMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 })
    for (const h of HOLES) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(HOLE_R + 0.08, 0.16, 8, 28).rotateX(Math.PI / 2), snowMat)
      rim.scale.y = 0.6
      rim.position.set(h.x, 0.05, h.z)
      ice.add(rim)
    }
    ice.visible = false
    return ice
  }

  makeAmbient() {
    // Fireflies, snowflakes and drifting leaves are all little billboards
    const glowMat = new THREE.SpriteMaterial({ map: softDot, color: '#fff27a', blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    this.fireflies = []
    for (let i = 0; i < 28; i++) {
      const s = new THREE.Sprite(glowMat)
      s.userData = { base: new THREE.Vector3((Math.random() * 2 - 1) * (i % 3 ? 10 : 18), 0.5 + Math.random() * 2.2, i % 3 ? -6 + Math.random() * 12 : -22 + Math.random() * 6), phase: Math.random() * 10 }
      s.scale.setScalar(0.35)
      this.fireflies.push(s)
      this.scene.add(s)
    }
    const snowGeo = new THREE.PlaneGeometry(1, 1)
    this.snow = new THREE.InstancedMesh(snowGeo, new THREE.MeshBasicMaterial({ map: softDot, transparent: true, depthWrite: false, color: '#ffffff' }), 160)
    this.snow.frustumCulled = false
    this.snowData = Array.from({ length: 160 }, () => ({ p: new THREE.Vector3((Math.random() * 2 - 1) * 20, Math.random() * 14, -18 + Math.random() * 30), s: 0.08 + Math.random() * 0.12, phase: Math.random() * 10 }))
    this.scene.add(this.snow)
    const leafGeo = new THREE.CircleGeometry(0.16, 5)
    leafGeo.scale(1.6, 0.8, 1)
    this.leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), 40)
    this.leaves.frustumCulled = false
    const leafCols = ['#ff9f43', '#ff6b6b', '#ffd23f', '#ff8fb1'].map((c) => new THREE.Color(c))
    this.leafData = Array.from({ length: 40 }, (_, i) => {
      this.leaves.setColorAt(i, leafCols[i % 4])
      return { p: new THREE.Vector3((Math.random() * 2 - 1) * 18, 1 + Math.random() * 9, -16 + Math.random() * 24), phase: Math.random() * 10, land: 0 }
    })
    this.scene.add(this.leaves)
    // Birds: two flapping wings each
    this.birds = []
    const wingGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.7, 0.05, -0.15, 0.1, 0, 0.25], 3))
    wingGeo.computeVertexNormals()
    const birdMat = new THREE.MeshBasicMaterial({ color: '#4a4a6a', side: THREE.DoubleSide })
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Group()
      const l = new THREE.Mesh(wingGeo, birdMat)
      const r = new THREE.Mesh(wingGeo, birdMat)
      r.scale.x = -1
      b.add(l, r)
      b.userData = { l, r, x: -40 - i * 25, y: 9 + i * 1.5, z: -30 - i * 4, speed: 2.2 + i * 0.4, phase: i }
      this.birds.push(b)
      this.scene.add(b)
    }
    // Twinkles on the water's sun path
    this.twinkle = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: starTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), 24)
    this.twinkle.frustumCulled = false
    this.twinkleData = Array.from({ length: 24 }, () => ({ p: new THREE.Vector3(), age: 9, life: 1 }))
    this.scene.add(this.twinkle)
  }

  /** Called with world.glb; the lake still works without it. */
  attach(gltf) {
    const get = (name) => {
      const o = gltf.scene.getObjectByName(name)
      o?.removeFromParent()
      return o
    }
    this.boat = get('boat')
    this.bear = get('bear')
    this.bucket = get('bucket')
    this.bobberModel = get('bobber')
    if (this.boat) {
      this.boat.position.y = -0.14
      this.rig.add(this.boat)
    }
    if (this.bucket) this.rig.add(this.bucket)
    if (this.bear) {
      this.rig.add(this.bear)
      this.head = this.bear.getObjectByName('bear_head')
      this.armL = this.bear.getObjectByName('bear_arm_l')
      this.rod = this.bear.getObjectByName('rod')
      this.rodTip = this.bear.getObjectByName('rod_tip')
      this.reel = this.bear.getObjectByName('rod_reel')
      this.hats = { sun: this.bear.getObjectByName('bear_hat_sun'), snow: this.bear.getObjectByName('bear_hat_snow'), scarf: this.bear.getObjectByName('bear_scarf') }
    }
    this.sun = get('sun')
    this.moon = get('moon')
    for (const s of [this.sun, this.moon]) {
      if (!s) continue
      this.scene.add(s)
      s.traverse((m) => m.isMesh && (m.material.fog = false))
    }
    for (let i = 0; i < 3; i++) {
      const c = get(`cloud_${i}`)
      if (!c) continue
      for (let k = 0; k < 2; k++) {
        const cloud = k ? c.clone() : c
        cloud.userData = { speed: 0.35 + Math.random() * 0.4, y: 10 + Math.random() * 9, z: -60 - Math.random() * 25 }
        cloud.scale.setScalar(2.2 + Math.random())
        cloud.position.set((Math.random() * 2 - 1) * 60, cloud.userData.y, cloud.userData.z)
        cloud.traverse((m) => m.isMesh && (m.material.fog = false))
        this.scene.add(cloud)
        this.clouds.push(cloud)
      }
    }
    this.cloudMat = this.clouds[0]?.children[0]?.material ?? null
    const pad = get('lilypad')
    const flower = get('lilypad_flower')
    if (pad && flower) {
      for (let i = 0; i < 8; i++) {
        const p = (i % 3 === 0 ? flower : pad).clone()
        p.scale.setScalar(1.1 + Math.random() * 0.7)
        p.rotation.y = Math.random() * 6
        p.userData = { phase: Math.random() * 10 }
        this.pads.push(p)
        this.scene.add(p)
      }
    }
    const bed = get('lakebed')
    if (bed) {
      bed.position.set(0, FLOOR_Y, 0)
      this.scene.add(bed)
    }
    const weed = get('weed')
    if (weed) {
      for (let i = 0; i < 16; i++) {
        const w = weed.clone()
        w.position.set((Math.random() * 2 - 1) * 12, FLOOR_Y, -8 + Math.random() * 15)
        w.scale.setScalar(0.45 + Math.random() * 0.4)
        w.rotation.y = Math.random() * 6
        w.userData.phase = Math.random() * 10
        this.weeds.push(w)
        this.scene.add(w)
      }
    }
    for (const o of [this.boat, this.bear, this.bucket, bed]) {
      o?.traverse((m) => {
        if (m.isMesh) m.material.envMapIntensity = 0.5
      })
    }
    this.glows = []
    this.scene.traverse((o) => {
      if (o.isMesh && (o.material.name === 'lantern_glow' || o.material.name === 'window_glow')) this.glows.push(o.material)
    })
    this.lanternMat = this.boat ? findMat(this.boat, 'lantern_glow') : null
  }

  attachShore(name, gltf) {
    const s = gltf.scene.getObjectByName(name)
    if (!s) return
    s.removeFromParent()
    // Blender's shore sits around y = 26 there, which is z = -26 here
    s.traverse((m) => {
      if (m.isMesh) m.material.envMapIntensity = 0.35
    })
    s.visible = false
    this.scene.add(s)
    this.shores[name] = s
    // Anemones sway softly on the reef floor
    this.anemones ??= []
    s.traverse((o) => {
      if (/^reef_anemone_\d+$/.test(o.name)) this.anemones.push({ o, phase: this.anemones.length * 1.7 })
    })
    s.visible = this.P?.shore === name
  }

  setPlace(name) {
    const P = PLACES[name]
    this.placeName = name
    this.P = P
    const u = this.skyU
    u.uTop.value.set(P.sky.top)
    u.uHorizon.value.set(P.sky.horizon)
    u.uGlow.value.set(P.sky.glow)
    u.uStars.value = P.sky.stars
    this.scene.fog.color.set(P.fog)
    this.scene.fog.near = P.fogNear
    this.scene.fog.far = P.fogFar
    const w = this.waterU
    w.uShallow.value.set(P.water.shallow)
    w.uDeep.value.set(P.water.deep)
    w.uSky.value.set(P.water.sky)
    w.uSunColor.value.set(P.water.sun)
    w.uSparkle.value = P.water.sparkle
    w.uNear.value = P.water.near
    w.uFog.value.set(P.fog)
    w.uFogNear.value = P.fogNear
    w.uFogFar.value = P.fogFar
    w.uFlow.value = P.current ?? 0
    const f = this.floorU
    f.uSand.value.set(P.floor.sand)
    f.uDeep.value.set(P.floor.deep)
    f.uCaustic.value = P.floor.caustic
    f.uFog.value.set(P.fog)
    f.uFogNear.value = P.fogNear
    f.uFogFar.value = P.fogFar
    this.hemi.color.set(P.hemi[0])
    this.hemi.groundColor.set(P.hemi[1])
    this.hemi.intensity = P.hemi[2]
    this.key.color.set(P.key[0])
    this.key.intensity = P.key[1]
    this.key.position.set(...P.keyPos)
    this.scene.environmentIntensity = P.night ? 0.25 : 0.6
    for (const [k, s] of Object.entries(this.shores)) s.visible = k === P.shore
    this.ice.visible = !!P.ice
    if (this.boat) this.boat.visible = !P.ice
    if (this.bucket) this.bucket.visible = !!P.ice
    if (this.bear) this.bear.position.y = P.ice ? 0.46 : 0.22
    if (this.hats) {
      this.hats.sun && (this.hats.sun.visible = name === 'lake' || name === 'river' || name === 'reef')
      this.hats.snow && (this.hats.snow.visible = name === 'ice')
      this.hats.scarf && (this.hats.scarf.visible = name === 'ice')
    }
    this.lantern.intensity = P.night ? 9 : 0
    for (const m of this.glows ?? []) m.emissiveIntensity = P.night ? (m.name === 'lantern_glow' ? 6 : 4) : 0.4
    // Sun or moon
    for (const s of [this.sun, this.moon]) if (s) s.visible = false
    const body = P.sun.kind === 'moon' ? this.moon : this.sun
    this.skyBody = body
    if (body) {
      body.visible = true
      body.traverse((m) => {
        if (!m.isMesh) return
        if (!m.userData.baseEmissive) m.userData.baseEmissive = m.material.emissive.clone()
        m.material.emissive.copy(m.userData.baseEmissive)
        if (P.sun.tint) m.material.emissive.lerp(new THREE.Color(P.sun.tint), 0.6)
      })
    }
    for (const c of this.clouds) c.visible = !!P.clouds
    if (this.cloudMat && P.clouds) {
      this.cloudMat.emissive?.set(P.clouds)
      this.cloudMat.emissiveIntensity = 0.35
      this.cloudMat.color.set(P.clouds)
    }
    for (const fl of this.fireflies) fl.visible = P.extra === 'fireflies'
    this.snow.visible = P.extra === 'snow'
    this.leaves.visible = P.extra === 'leaves'
    for (const b of this.birds) b.visible = P.extra === 'birds'
    for (const w of this.weeds) w.visible = !P.ice
    // Lily pads drift on open water
    this.pads.forEach((p, i) => {
      p.visible = i < P.pads
      if (!p.visible) return
      const spot = [[-9, -6], [8.5, -3], [-7.5, 4.5], [7.8, 6], [-11, 0.5], [11, 1.5], [-3.5, -9], [4, -11]][i]
      p.userData.home = new THREE.Vector3(spot[0], 0.03, spot[1])
      p.position.copy(p.userData.home)
    })
    this.layout()
  }

  /** Puts the sun or moon in the corner of the sky for any screen shape. */
  layout() {
    const body = this.skyBody
    if (!body || !this.P) return
    const cam = this.camera
    const v = new THREE.Vector3(this.P.sun.pos[0], this.P.sun.pos[1], 0.5).unproject(cam)
    const dir = v.sub(cam.position).normalize()
    body.position.copy(cam.position).addScaledVector(dir, 45)
    body.lookAt(cam.position) // its face looks along +Z (Blender -Y)
    this.skyScale = this.P.sun.scale * Math.min(1, Math.max(0.65, cam.aspect))
    this.skyU.uSunDir.value.copy(dir)
    this.waterU.uSunDir.value.set(dir.x, Math.max(0.15, dir.y), dir.z).normalize()
  }

  /** A tap on the sun or moon makes it spin and giggle. */
  poke(raycaster) {
    if (this.skyBody && raycaster.intersectObject(this.skyBody, true).length) {
      this.skySpin = 1
      return 'sky'
    }
    if (this.bear && raycaster.intersectObject(this.bear, true).length) return 'bear'
    if (this.boat?.visible && raycaster.intersectObject(this.boat, true).length) return 'bear'
    return null
  }

  /** The nearest ice hole to a point. */
  nearestHole(p) {
    let best = HOLES[0]
    for (const h of HOLES) if (h.distanceToSquared(p) < best.distanceToSquared(p)) best = h
    return best
  }

  rodTipWorld(out) {
    if (this.rodTip) return this.rodTip.getWorldPosition(out)
    return out.copy(RIG).add(new THREE.Vector3(0, 3, 2))
  }

  update(dt, t, effects) {
    this.time = t
    this.skyU.uTime.value = t
    this.waterU.uTime.value = t
    this.floorU.uTime.value = t
    const P = this.P
    if (!P) return
    // The boat rocks gently
    if (this.boat?.visible) {
      this.rig.rotation.z = Math.sin(t * 0.9) * 0.03
      this.rig.rotation.x = Math.sin(t * 0.7 + 1) * 0.02
      this.rig.position.y = RIG.y + Math.sin(t * 1.1) * 0.05
    } else {
      this.rig.rotation.set(0, 0, 0)
      this.rig.position.y = RIG.y
    }
    if (this.lanternMat && P.night) this.lanternMat.emissiveIntensity = 5 + Math.sin(t * 7) * 0.6 + Math.sin(t * 13) * 0.4
    if (this.boat) this.lantern.position.copy(this.boat.localToWorld(new THREE.Vector3(0, 1.2, -1.0)))
    // Sky friend
    if (this.skyBody) {
      this.skySpin = Math.max(0, (this.skySpin ?? 0) - dt * 0.8)
      const s = this.skyScale * (1 + Math.sin(t * 1.5) * 0.03 + (this.skySpin ?? 0) * 0.25)
      this.skyBody.scale.setScalar(s)
      this.skyBody.rotation.z = Math.sin(t * 0.6) * 0.06 + (this.skySpin ?? 0) ** 2 * Math.PI * 4
    }
    for (const c of this.clouds) {
      if (!c.visible) continue
      c.position.x += c.userData.speed * dt
      if (c.position.x > 75) c.position.x = -75
    }
    // Lily pads bob (and drift with the river's current)
    for (const p of this.pads) {
      if (!p.visible) continue
      p.position.y = 0.03 + Math.sin(t * 1.3 + p.userData.phase) * 0.02
      p.rotation.y += dt * 0.03
      if (P.current) {
        p.position.x += P.current * dt
        if (p.position.x > 16) p.position.x = -16
      }
    }
    for (const a of this.anemones ?? []) {
      if (!a.o.parent?.visible) continue
      a.o.rotation.x = Math.sin(t * 0.7 + a.phase) * 0.06
      a.o.rotation.z = Math.sin(t * 0.55 + a.phase) * 0.06
    }
    for (const w of this.weeds) {
      if (!w.visible) continue
      w.rotation.z = Math.sin(t * 1.1 + w.userData.phase) * 0.12
      w.rotation.x = Math.sin(t * 0.8 + w.userData.phase) * 0.08
    }
    const d = new THREE.Object3D()
    if (P.extra === 'fireflies') {
      for (const f of this.fireflies) {
        const u = f.userData
        f.position.set(u.base.x + Math.sin(t * 0.4 + u.phase) * 1.5, u.base.y + Math.sin(t * 0.9 + u.phase * 2) * 0.5, u.base.z + Math.cos(t * 0.3 + u.phase) * 1.5)
        const glow = 0.5 + 0.5 * Math.sin(t * 2.2 + u.phase * 3)
        f.scale.setScalar(0.25 + glow * 0.55)
      }
    } else if (P.extra === 'snow') {
      this.snowData.forEach((s, i) => {
        s.p.y -= dt * (0.7 + s.s * 3)
        s.p.x += Math.sin(t + s.phase) * dt * 0.4
        if (s.p.y < 0) s.p.y = 14
        d.position.copy(s.p)
        d.quaternion.copy(this.camera.quaternion)
        d.scale.setScalar(s.s * 2.2)
        d.updateMatrix()
        this.snow.setMatrixAt(i, d.matrix)
      })
      this.snow.instanceMatrix.needsUpdate = true
    } else if (P.extra === 'leaves') {
      this.leafData.forEach((l, i) => {
        if (l.p.y > 0.05) {
          l.p.y -= dt * 0.6
          l.p.x += (Math.sin(t * 0.8 + l.phase) * 0.6 + 0.4) * dt
          d.rotation.set(Math.sin(t * 2 + l.phase) * 1.2, t + l.phase, Math.cos(t * 1.7 + l.phase))
        } else {
          // Floating on the river
          l.p.y = 0.04
          l.p.x += (P.current ?? 0.3) * dt
          l.land += dt
          d.rotation.set(-Math.PI / 2, 0, l.phase)
          if (l.land > 12 || l.p.x > 18) {
            l.p.set((Math.random() * 2 - 1) * 18, 6 + Math.random() * 6, -16 + Math.random() * 24)
            l.land = 0
          }
        }
        d.position.copy(l.p)
        d.scale.setScalar(1)
        d.updateMatrix()
        this.leaves.setMatrixAt(i, d.matrix)
      })
      this.leaves.instanceMatrix.needsUpdate = true
    } else if (P.extra === 'birds') {
      for (const b of this.birds) {
        const u = b.userData
        u.x += u.speed * dt
        if (u.x > 50) u.x = -50 - Math.random() * 30
        b.position.set(u.x, u.y + Math.sin(t * 0.7 + u.phase) * 0.8, u.z)
        const flap = Math.sin(t * 9 + u.phase) * 0.6
        u.l.rotation.z = flap
        u.r.rotation.z = -flap
        b.rotation.y = -Math.PI / 2
        b.scale.setScalar(1.3)
      }
    }
    // Sparkles winking on the water
    if (!P.ice) {
      this.twinkleData.forEach((s, i) => {
        s.age += dt
        if (s.age > s.life && Math.random() < dt * 3) {
          s.p.set((Math.random() * 2 - 1) * 12, 0.06, -12 + Math.random() * 18)
          s.age = 0
          s.life = 0.5 + Math.random() * 0.6
        }
        const k = Math.min(1, s.age / s.life)
        const sz = s.age < s.life ? Math.sin(k * Math.PI) * 0.45 : 0
        d.position.copy(s.p)
        d.quaternion.copy(this.camera.quaternion)
        d.scale.setScalar(Math.max(0.0001, sz))
        d.updateMatrix()
        this.twinkle.setMatrixAt(i, d.matrix)
      })
      this.twinkle.instanceMatrix.needsUpdate = true
      this.twinkle.visible = true
    } else this.twinkle.visible = false
    // A fish jumps now and then, far off
    this.jumpIn = (this.jumpIn ?? 6) - dt
    if (this.jumpIn < 0 && effects && !P.ice) {
      this.jumpIn = 6 + Math.random() * 8
      const p = new THREE.Vector3((Math.random() * 2 - 1) * 14, 0, -14 - Math.random() * 6)
      effects.ripple(p, 1.6, 1.6)
      effects.ripple(p, 0.8, 1.0)
    }
  }
}

function findMat(root, name) {
  let m = null
  root.traverse((o) => {
    if (!m && o.isMesh && o.material.name === name) m = o.material
  })
  return m
}
