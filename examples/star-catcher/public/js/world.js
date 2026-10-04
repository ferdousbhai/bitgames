import * as THREE from 'three'
import { makeGlowTexture } from './effects.js'

/** The planets visited, in order. Each one tints the sky. */
export const STOPS = [
  { model: 'planet_moon', emoji: '🌙', name: 'Moon', top: '#120c3a', bottom: '#3d2c86', nebula: ['#7b5cff', '#ff8fc7'] },
  { model: 'planet_ring', emoji: '🪐', name: 'Ring Planet', top: '#1d0f3f', bottom: '#8a3f6e', nebula: ['#ff9f43', '#ff6b9d'] },
  { model: 'planet_candy', emoji: '🍭', name: 'Candy Planet', top: '#2a0f45', bottom: '#b04f93', nebula: ['#ff8fc7', '#8ef0c8'] },
  { model: 'planet_ice', emoji: '❄️', name: 'Snowy Planet', top: '#0b1d4d', bottom: '#2f78b8', nebula: ['#7cc6fe', '#c9b6ff'] },
  { model: 'planet_jungle', emoji: '🌍', name: 'Jungle Planet', top: '#0a2338', bottom: '#2a7f78', nebula: ['#6bd66b', '#3ab0ff'] },
]

const STAR_VERT = /* glsl */ `
  attribute float phase;
  attribute float size;
  uniform float uTime;
  uniform float uScroll;
  uniform float uRange;
  uniform float uScale;
  varying float vTwinkle;
  varying float vHue;
  void main() {
    vec3 p = position;
    p.y = mod(p.y - uScroll + uRange * 0.5, uRange) - uRange * 0.5;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vTwinkle = 0.55 + 0.45 * sin(uTime * (1.5 + phase * 2.0) + phase * 40.0);
    vHue = phase;
    gl_PointSize = size * uScale / -mv.z * (0.75 + 0.35 * vTwinkle);
  }
`
const STAR_FRAG = /* glsl */ `
  uniform sampler2D map;
  varying float vTwinkle;
  varying float vHue;
  void main() {
    vec4 tex = texture2D(map, gl_PointCoord);
    vec3 tint = mix(vec3(1.0, 0.95, 0.8), vec3(0.75, 0.85, 1.0), step(0.5, vHue));
    if (vHue > 0.9) tint = vec3(1.0, 0.75, 0.9);
    gl_FragColor = vec4(tint * tex.rgb * tex.a * vTwinkle * 0.75, 1.0);
    #include <colorspace_fragment>
  }
`

const SKY_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }
`
const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  varying vec2 vUv;
  void main() {
    float k = smoothstep(0.0, 1.0, vUv.y);
    gl_FragColor = vec4(mix(uBottom, uTop, k), 1.0);
    #include <colorspace_fragment>
  }
`

export class World {
  constructor(scene, models) {
    this.scene = scene
    this.models = models
    this.scroll = 0
    this.time = 0
    this.stop = 0
    this.top = new THREE.Color(STOPS[0].top)
    this.bottom = new THREE.Color(STOPS[0].bottom)

    // Sky gradient: a full-screen quad drawn behind everything
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { uTop: { value: this.top.clone() }, uBottom: { value: this.bottom.clone() } },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      depthWrite: false,
      depthTest: false,
    })
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.skyMat)
    sky.frustumCulled = false
    sky.renderOrder = -10
    scene.add(sky)

    // Three layers of twinkling stars scrolling at different speeds
    const tex = makeGlowTexture(true)
    this.layers = []
    for (const [z, count, size, speed] of [[-60, 260, 1.0, 0.18], [-30, 120, 0.7, 0.45], [-12, 36, 0.38, 1.0]]) {
      const range = 2 * Math.tan((25 * Math.PI) / 180) * (16 - z) * 1.3
      const width = range * 2.4
      const pos = new Float32Array(count * 3)
      const phase = new Float32Array(count)
      const sizes = new Float32Array(count)
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * width
        pos[i * 3 + 1] = (Math.random() - 0.5) * range
        pos[i * 3 + 2] = z + (Math.random() - 0.5) * 4
        phase[i] = Math.random()
        sizes[i] = size * (0.5 + Math.random() * Math.random() * 1.6)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1))
      geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
      const mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: tex }, uTime: { value: 0 }, uScroll: { value: 0 }, uRange: { value: range }, uScale: { value: 400 } },
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      })
      const pts = new THREE.Points(geo, mat)
      pts.frustumCulled = false
      pts.renderOrder = -5
      scene.add(pts)
      this.layers.push({ mat, speed })
    }

    // Soft coloured nebula clouds far behind
    const glow = makeGlowTexture(false)
    this.nebulae = []
    for (let i = 0; i < 6; i++) {
      const m = new THREE.SpriteMaterial({ map: glow, color: '#7b5cff', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
      const s = new THREE.Sprite(m)
      s.scale.setScalar(30 + Math.random() * 25)
      s.position.set((Math.random() - 0.5) * 70, (Math.random() - 0.5) * 60, -70)
      s.renderOrder = -6
      scene.add(s)
      this.nebulae.push(s)
    }

    // The planets on the journey, one approaching at a time
    this.planets = STOPS.map((stop, i) => {
      const p = models[stop.model].clone()
      const holder = new THREE.Group()
      holder.add(p)
      holder.visible = false
      holder.userData = { side: i % 2 === 0 ? 1 : -1, leaving: -1, spin: p }
      scene.add(holder)
      return holder
    })
    this.shown = 0 // smoothed progress toward the next stop

    // Little things drifting far behind: a sense of speed and depth
    this.drifters = []
    this.drifterTimer = 2
    this.setStop(0, true)
  }

  setStop(index, instant = false) {
    const prev = this.planets[(this.stop + STOPS.length) % STOPS.length]
    if (!instant && prev.visible) prev.userData.leaving = 0
    this.stop = index
    const s = STOPS[index % STOPS.length]
    this.top.set(s.top)
    this.bottom.set(s.bottom)
    if (instant) {
      this.skyMat.uniforms.uTop.value.copy(this.top)
      this.skyMat.uniforms.uBottom.value.copy(this.bottom)
    }
    this.nebulae.forEach((n, i) => n.material.color.set(s.nebula[i % 2]))
    const next = this.planets[index % STOPS.length]
    next.visible = true
    next.userData.leaving = -1
    this.shown = 0
  }

  addDrifter(view) {
    const here = STOPS[this.stop % STOPS.length].model
    const choices = STOPS.map((s) => s.model).filter((n) => n !== here)
    const name = choices[(Math.random() * choices.length) | 0]
    const o = this.models[name].clone()
    const z = -34 - Math.random() * 16
    const depthScale = (16 - z) / 16
    o.scale.setScalar(1.1 + Math.random() * 0.8)
    o.position.set((Math.random() * 2 - 1) * view.w * depthScale * 0.95, view.h * depthScale + 3, z)
    o.userData = { speed: 0.5 + Math.random() * 0.4, spin: (Math.random() - 0.5) * 0.6, limit: -view.h * depthScale - 4 }
    this.scene.add(o)
    this.drifters.push(o)
  }

  /** `cruise` is how fast the rocket is flying; `progress` 0..1 toward the next planet. */
  update(dt, cruise, progress, view) {
    this.time += dt
    this.scroll += dt * cruise
    for (const l of this.layers) {
      l.mat.uniforms.uTime.value = this.time
      l.mat.uniforms.uScroll.value = this.scroll * l.speed
    }
    const k = 1 - Math.exp(-dt * 1.2)
    this.skyMat.uniforms.uTop.value.lerp(this.top, k)
    this.skyMat.uniforms.uBottom.value.lerp(this.bottom, k)
    for (const n of this.nebulae) {
      n.position.y -= dt * cruise * 0.05
      if (n.position.y < -45) n.position.y += 90
    }

    // The next planet glides down into view as stars are collected
    this.shown += (progress - this.shown) * (1 - Math.exp(-dt * 2))
    const z = -26
    const depth = (16 - z) / 16
    for (let i = 0; i < this.planets.length; i++) {
      const p = this.planets[i]
      if (!p.visible) continue
      const scale = Math.min(5, view.w * depth * 0.4)
      p.scale.setScalar(scale)
      p.userData.spin.rotation.y = Math.sin(this.time * 0.25 + i) * 0.35
      const x = p.userData.side * view.w * depth * 0.6
      if (p.userData.leaving >= 0) {
        p.userData.leaving += dt
        const t = p.userData.leaving
        p.position.set(x, view.h * depth * 0.1 - t * t * 4 - t * 3, z)
        if (p.position.y < -view.h * depth - scale * 2) p.visible = false
      } else if (i === this.stop % STOPS.length) {
        const e = this.shown
        p.position.set(x, view.h * depth * (1.05 - 0.95 * e) + scale * (1 - e), z)
      } else {
        p.visible = false
      }
    }

    // Drifters
    this.drifterTimer -= dt
    if (this.drifterTimer <= 0 && this.drifters.length < 2) {
      this.addDrifter(view)
      this.drifterTimer = 7 + Math.random() * 6
    }
    for (let i = this.drifters.length - 1; i >= 0; i--) {
      const d = this.drifters[i]
      d.position.y -= dt * cruise * d.userData.speed * 0.35
      d.rotation.y += dt * d.userData.spin
      d.rotation.z += dt * d.userData.spin * 0.5
      if (d.position.y < d.userData.limit) {
        this.scene.remove(d)
        this.drifters.splice(i, 1)
      }
    }
  }

  setScale(viewHeightPx, fov) {
    const s = viewHeightPx / (2 * Math.tan((fov * Math.PI) / 360))
    for (const l of this.layers) l.mat.uniforms.uScale.value = s
  }
}
