import * as THREE from 'three'
import { canvasTexture, softDot } from './effects.js'
import { LANE } from './lane.js'
import { mergeByMaterial } from './merge.js'

/**
 * The three lanes' surroundings, built from world.glb (blender/models.py):
 * Igloo Village by day, Northern Lights at night, and Fishy Bay at sunset.
 */
export const THEMES = {
  village: {
    name: 'Igloo Village',
    emoji: '🏠',
    pins: 'snowman',
    sky: ['#3fa5f2', '#9fd6ff', '#eef9ff'],
    fog: ['#e3f3ff', 35, 110],
    hemi: ['#e4f4ff', '#b8d4ff', 1.0],
    sun: ['#fff4e0', 2.3],
    env: 0.55,
    exposure: 1.0,
    night: false,
  },
  aurora: {
    name: 'Northern Lights',
    emoji: '🌌',
    pins: 'snowman',
    sky: ['#040824', '#122060', '#2a4590'],
    fog: ['#16245a', 30, 100],
    hemi: ['#7d94f0', '#1c2560', 0.7],
    sun: ['#b4c4ff', 1.15],
    env: 0.22,
    exposure: 1.0,
    night: true,
  },
  bay: {
    name: 'Fishy Bay',
    emoji: '🐟',
    pins: 'fish',
    sky: ['#4f9fe0', '#ffb8a8', '#ffe2b8'],
    fog: ['#ffd9c4', 45, 140],
    hemi: ['#ffe8d8', '#9ec8ff', 0.95],
    sun: ['#ffd6b0', 2.1],
    env: 0.5,
    exposure: 1.0,
    night: false,
  },
}

const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
    void main(){ float h = vP.y;
      vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, h)) : mix(bottom, mid, smoothstep(-0.05, 0.12, h));
      gl_FragColor = vec4(c, 1.0); }`,
})

const auroraMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  fog: false,
  uniforms: { time: { value: 0 } },
  vertexShader: `uniform float time; varying vec2 vUv;
    void main(){ vUv = uv; vec3 p = position;
      p.z += sin(p.x * 0.08 + time * 0.4) * 6.0 + sin(p.x * 0.21 - time * 0.3) * 2.0;
      p.y += sin(p.x * 0.05 + time * 0.25) * 2.0;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
  fragmentShader: `uniform float time; varying vec2 vUv;
    void main(){
      float streak = 0.7 + 0.3 * sin(vUv.x * 60.0 + sin(vUv.x * 9.0 + time * 0.7) * 3.0);
      float fade = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.3, 1.0, vUv.y));
      float ends = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
      vec3 green = vec3(0.25, 1.0, 0.6);
      vec3 pink = vec3(0.8, 0.35, 1.0);
      vec3 c = mix(green, pink, smoothstep(0.3, 0.95, vUv.y));
      gl_FragColor = vec4(c * streak * fade * ends * 0.5, 1.0); }`,
})

export class Scenery {
  constructor(scene, { hemi, sun, renderer }) {
    this.scene = scene
    this.hemi = hemi
    this.sunLight = sun
    this.renderer = renderer
    this.tpl = {}
    this.props = new THREE.Group()
    scene.add(this.props)
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMaterial)
    scene.add(this.sky)

    // Snowfield all around
    this.snowMat = new THREE.MeshStandardMaterial({ color: '#f2f8ff', roughness: 1 })
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.snowMat)
    this.ground.rotation.x = -Math.PI / 2
    this.ground.position.set(0, -0.3, -50)
    this.ground.receiveShadow = true
    scene.add(this.ground)

    // An ice floe for the bay, with the sea around it
    const floe = new THREE.CylinderGeometry(1, 1.04, 1, 48)
    this.floe = new THREE.Mesh(floe, this.snowMat)
    this.floe.scale.set(13, 0.6, 26)
    this.floe.position.set(0, -0.6, -8)
    this.floe.receiveShadow = true
    scene.add(this.floe)
    const waves = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#3f8fd8'
      g.fillRect(0, 0, w, h)
      g.strokeStyle = 'rgba(255,255,255,0.35)'
      g.lineWidth = 3
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * w
        const y = Math.random() * h
        g.beginPath()
        g.arc(x, y, 10 + Math.random() * 10, Math.PI * 1.15, Math.PI * 1.85)
        g.stroke()
      }
    })
    waves.wrapS = waves.wrapT = THREE.RepeatWrapping
    waves.repeat.set(30, 30)
    this.waves = waves
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: waves, roughness: 0.2, metalness: 0.1 }))
    this.water.rotation.x = -Math.PI / 2
    this.water.position.set(0, -0.75, -50)
    scene.add(this.water)

    // Stars and aurora for the night
    const starPos = []
    for (let i = 0; i < 500; i++) {
      const a = Math.random() * Math.PI * 2
      const y = 0.08 + Math.random() * 0.92
      const r = Math.sqrt(1 - y * y)
      starPos.push(Math.cos(a) * r * 250, y * 250, Math.sin(a) * r * 250)
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3))
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ map: softDot, size: 4, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false, color: '#fff8e0' }))
    scene.add(this.stars)
    this.aurora = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(160, 22, 80, 1), auroraMaterial)
      m.position.set((i - 1) * 25, 26 + i * 6, -90 - i * 25)
      m.rotation.y = (i - 1) * 0.25
      this.aurora.add(m)
    }
    scene.add(this.aurora)

    // Warm halos around the lanterns at night, so the lane looks lamp-lit.
    this.halos = new THREE.Group()
    this.haloMat = new THREE.SpriteMaterial({ map: softDot, color: '#ffb547', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    scene.add(this.halos)

    this.clouds = []
    this.bobbers = []
    this.whale = null
    this.spoutIn = 3
    this.onSpout = null
  }

  attach(gltf) {
    for (const n of ['igloo', 'pine_tree', 'iceberg_0', 'iceberg_1', 'whale', 'lantern', 'ice_arch', 'cloud_0', 'cloud_1', 'sun', 'moon']) {
      const o = gltf.scene.getObjectByName(n)
      if (!o) continue
      o.traverse((m) => {
        if (!m.isMesh) return
        // Only the lane's actors cast shadows; scenery stays cheap to draw.
        m.castShadow = false
        m.receiveShadow = false
        m.material.envMapIntensity = 0.35
        if (m.material.name === 'cloud') {
          m.material.emissive.set('#ffffff')
          m.material.emissiveIntensity = 0.3
        }
        if (m.material.name === 'igloo_glow') this.iglooGlow = m.material
        if (m.material.name === 'lantern_glow') this.lanternGlow = m.material
      })
      this.tpl[n] = o
    }
  }

  place(name, x, z, { rot = 0, s = 1, y = -0.3 } = {}) {
    const t = this.tpl[name]
    if (!t) return null
    const o = t.clone(true)
    o.position.set(x, y, z)
    o.rotation.set(0, rot, 0)
    o.scale.setScalar(s)
    this.props.add(o)
    return o
  }

  setTheme(name) {
    const th = THEMES[name] ?? THEMES.village
    this.theme = name
    skyMaterial.uniforms.top.value.set(th.sky[0])
    skyMaterial.uniforms.mid.value.set(th.sky[1])
    skyMaterial.uniforms.bottom.value.set(th.sky[2])
    this.scene.fog = new THREE.Fog(...th.fog)
    this.hemi.color.set(th.hemi[0])
    this.hemi.groundColor.set(th.hemi[1])
    this.hemi.intensity = th.hemi[2]
    this.sunLight.color.set(th.sun[0])
    this.sunLight.intensity = th.sun[1]
    this.scene.environmentIntensity = th.env
    this.renderer.toneMappingExposure = th.exposure
    this.stars.visible = this.aurora.visible = th.night
    const bay = name === 'bay'
    this.water.visible = this.floe.visible = bay
    this.ground.visible = !bay
    // Moonlit snow is blue, not grey, so the Night lane reads as night.
    this.snowMat.color.set(th.night ? '#8796d4' : '#f2f8ff')
    if (this.iglooGlow) this.iglooGlow.emissiveIntensity = th.night ? 3.2 : 0
    if (this.lanternGlow) this.lanternGlow.emissiveIntensity = th.night ? 5 : 0.4
    this.halos.clear()

    this.props.traverse((o) => o.isMesh && o.name.startsWith('merged_') && o.geometry.dispose())
    this.props.clear()
    this.clouds = []
    this.bobbers = []
    this.whale = null
    this.sun = null
    // The ice arch frames the pins in every lane.
    this.place('ice_arch', 0, LANE.deckEnd - 0.2, { y: -0.05 })
    // Lanterns line the lane
    for (const z of [-1.5, -6, -10.5]) {
      this.place('lantern', -(LANE.half + LANE.gutter + 2.4), z, { rot: 0 })
      this.place('lantern', LANE.half + LANE.gutter + 2.4, z, { rot: Math.PI })
      if (th.night) {
        for (const sx of [-1, 1]) {
          const h = new THREE.Sprite(this.haloMat)
          h.position.set(sx * (LANE.half + LANE.gutter + 2.4 - 0.45), 1.12, z)
          h.scale.setScalar(1.6)
          h.userData.ph = z * 1.7 + sx
          this.halos.add(h)
        }
      }
    }
    const sideTrees = [[-5.5, -3.5, 1.1], [6, -5.5, 1.2], [-9, -12, 1.4], [9.5, -15, 1.3], [-5.6, -20, 1.2], [5.2, -21.5, 1.3], [-12, -24, 1.6], [12, -27, 1.5], [-2.5, -27, 1.4], [3, -30, 1.7], [-16, -9, 1.5], [16, -8, 1.4], [-8, -32, 1.8], [9, -36, 1.8]]
    if (name !== 'bay') {
      for (const [x, z, s] of sideTrees) this.place('pine_tree', x, z, { s, rot: x * 1.3 })
      this.place('igloo', -7.5, -7.5, { rot: 0.7, s: 1.1 })
      this.place('igloo', 8, -11, { rot: -0.7, s: 1.2 })
      this.place('igloo', -7, -18, { rot: 0.45, s: 1.0 })
      this.place('igloo', 11.5, -2, { rot: -1.1, s: 1.0 })
      this.place('igloo', 0.5, -24, { rot: 0, s: 1.3 })
    } else {
      for (const [x, z, s] of [[-6.5, -4, 1.0], [7, -9, 1.1], [-6, -17, 1.2], [5.5, -20, 1.0]]) this.place('pine_tree', x, z, { s, rot: x })
      this.place('igloo', -8, -10, { rot: 0.7, s: 1.1 })
      this.place('igloo', 8.5, -15, { rot: -0.6, s: 1.0 })
      const bergs = [['iceberg_0', -16, -26, 1.4], ['iceberg_1', 17, -30, 1.6], ['iceberg_0', 22, -55, 2.2], ['iceberg_1', -28, -50, 2], ['iceberg_1', 0, -60, 2.4]]
      for (const [n, x, z, s] of bergs) {
        const o = this.place(n, x, z, { s, rot: x * 0.3, y: -0.7 })
        if (o) this.bobbers.push({ o, y: -0.7, ph: x })
      }
      this.whale = this.place('whale', -9, -40, { rot: 0.5, s: 1.6, y: -0.6 })
      if (this.whale) this.bobbers.push({ o: this.whale, y: -0.6, ph: 0, whale: true })
    }
    // Sky friends
    if (th.night) {
      this.place('moon', 11, -70, { y: 15, s: 4.5, rot: -0.2 })
    } else {
      const sun = this.place('sun', bay ? 12 : -22, -80, { y: bay ? 9 : 26, s: 4, rot: bay ? -0.15 : 0.25 })
      this.sun = sun
      for (let i = 0; i < 4; i++) {
        const c = this.place(`cloud_${i % 2}`, -40 + i * 26, -75 - (i % 2) * 10, { y: 16 + (i % 3) * 5, s: 2.2 + (i % 2) * 0.6 })
        if (c) {
          c.userData.speed = 0.6 + i * 0.15
          this.clouds.push(c)
          if (bay) c.traverse((m) => m.isMesh && m.material.name === 'cloud' && (m.material = m.material.clone(), m.material.color.set('#ffe1e8')))
        }
      }
    }
    // Everything that stands still becomes one mesh per material.
    const moving = new Set([...this.clouds, ...this.bobbers.map((b) => b.o), this.sun].filter(Boolean))
    mergeByMaterial(this.props, moving)
  }

  update(dt, t) {
    auroraMaterial.uniforms.time.value = t
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt
      if (c.position.x > 70) c.position.x = -70
    }
    if (this.water.visible) this.waves.offset.set(t * 0.01, t * 0.004)
    for (const b of this.bobbers) {
      b.o.position.y = b.y + Math.sin(t * 0.8 + b.ph) * (b.whale ? 0.25 : 0.12)
      if (b.whale) b.o.rotation.z = Math.sin(t * 0.6) * 0.06
    }
    if (this.whale) {
      this.spoutIn -= dt
      if (this.spoutIn <= 0) {
        this.spoutIn = 4 + Math.random() * 3
        const p = this.whale.position.clone()
        p.y += 2.3
        this.onSpout?.(p)
      }
    }
    for (const h of this.halos.children) h.scale.setScalar(1.6 + Math.sin(t * 2.3 + h.userData.ph) * 0.08)
    if (this.sun) this.sun.rotation.z = Math.sin(t * 0.6) * 0.06
  }
}
