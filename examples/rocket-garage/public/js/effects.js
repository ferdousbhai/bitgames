import * as THREE from 'three'

const glowTextures = {}

/** Soft round glow with a little four-point twinkle, drawn once into a canvas and shared. */
export function makeGlowTexture(twinkle = false) {
  glowTextures[twinkle] ??= drawGlowTexture(twinkle)
  return glowTextures[twinkle]
}

function drawGlowTexture(twinkle) {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const r = size / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.18, 'rgba(255,255,255,0.75)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.18)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  if (twinkle) {
    g.globalCompositeOperation = 'lighter'
    for (const [w, h] of [[size * 0.9, size * 0.06], [size * 0.06, size * 0.9]]) {
      const lg = g.createRadialGradient(r, r, 0, r, r, Math.max(w, h) / 2)
      lg.addColorStop(0, 'rgba(255,255,255,0.9)')
      lg.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = lg
      g.beginPath()
      g.ellipse(r, r, w / 2, h / 2, 0, 0, Math.PI * 2)
      g.fill()
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

let puffTexture = null
/** A soft round puff with a little shading, for smoke and clouds of dust. */
export function makePuffTexture() {
  if (puffTexture) return puffTexture
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const r = size / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.55, 'rgba(255,255,255,0.85)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  puffTexture = new THREE.CanvasTexture(c)
  return puffTexture
}

const POINT_VERT = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  uniform float uScale;
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uScale / -mv.z;
    vTint = tint;
    vAlpha = alpha;
  }
`
const POINT_FRAG = /* glsl */ `
  uniform sampler2D map;
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(vTint * tex.rgb * vAlpha * tex.a, 1.0);
    #include <colorspace_fragment>
  }
`
// Smoke is drawn normally (not added), so white puffs stay soft against a bright sky
const SMOKE_FRAG = /* glsl */ `
  uniform sampler2D map;
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(map, gl_PointCoord);
    float a = vAlpha * tex.a * 0.85;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vTint, a);
    #include <colorspace_fragment>
  }
`

/** One pooled, additive point cloud for every sparkle, exhaust puff and confetti bit. */
export class Particles {
  constructor(scene, max = 700, smoke = false) {
    this.max = max
    this.geo = new THREE.BufferGeometry()
    this.pos = new Float32Array(max * 3)
    this.tint = new Float32Array(max * 3)
    this.size = new Float32Array(max)
    this.alpha = new Float32Array(max)
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage))
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage))
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: smoke ? makePuffTexture() : makeGlowTexture(true) }, uScale: { value: 400 } },
      vertexShader: POINT_VERT,
      fragmentShader: smoke ? SMOKE_FRAG : POINT_FRAG,
      blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })
    this.points = new THREE.Points(this.geo, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = smoke ? 3 : 5
    scene.add(this.points)
    this.p = Array.from({ length: max }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 0, s1: 0, grav: 0, drag: 0 }))
    this.next = 0
    this.color = new THREE.Color()
  }

  setScale(viewHeightPx, fov) {
    this.material.uniforms.uScale.value = viewHeightPx / (2 * Math.tan((fov * Math.PI) / 360))
  }

  /** `color` may be a CSS string or a THREE.Color (cheaper for things emitted every frame). */
  emit(x, y, z, { vx = 0, vy = 0, vz = 0, spread = 1, life = 0.6, size = 0.5, endSize = 0, color = '#fff3a0', grav = 0, drag = 1 } = {}) {
    const i = this.next
    this.next = (this.next + 1) % this.max
    const p = this.p[i]
    p.life = p.max = life * (0.7 + Math.random() * 0.6)
    p.vx = vx + (Math.random() - 0.5) * spread
    p.vy = vy + (Math.random() - 0.5) * spread
    p.vz = vz + (Math.random() - 0.5) * spread * 0.3
    p.s0 = size
    p.s1 = endSize
    p.grav = grav
    p.drag = drag
    this.color.set(color).toArray(this.tint, i * 3)
    this.pos[i * 3] = x
    this.pos[i * 3 + 1] = y
    this.pos[i * 3 + 2] = z
  }

  /** A happy starburst. */
  burst(pos, colors, count = 22, power = 6, size = 0.7) {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + Math.random() * 0.3
      const s = power * (0.5 + Math.random() * 0.6)
      this.emit(pos.x, pos.y, pos.z + 0.3, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, spread: 0.6, life: 0.7, size, endSize: 0,
        color: colors[k % colors.length], grav: -3, drag: 2.2,
      })
    }
  }

  /** Drop every live particle at once. */
  clear() {
    for (const p of this.p) p.life = 0
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i]
      if (p.life <= 0) {
        this.alpha[i] = 0
        continue
      }
      p.life -= dt
      const k = Math.max(p.life / p.max, 0)
      const damp = Math.exp(-p.drag * dt)
      p.vx *= damp
      p.vy = p.vy * damp + p.grav * dt
      p.vz *= damp
      this.pos[i * 3] += p.vx * dt
      this.pos[i * 3 + 1] += p.vy * dt
      this.pos[i * 3 + 2] += p.vz * dt
      this.size[i] = p.s1 + (p.s0 - p.s1) * k
      this.alpha[i] = Math.min(1, k * 2.2)
    }
    for (const name of ['position', 'tint', 'size', 'alpha']) this.geo.attributes[name].needsUpdate = true
  }
}

/** Expanding rings of light when something is caught. */
export class Rings {
  constructor(scene, count = 8) {
    const geo = new THREE.RingGeometry(0.88, 1, 48)
    this.items = Array.from({ length: count }, () => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }))
      m.visible = false
      m.renderOrder = 4
      scene.add(m)
      return { m, life: 0, max: 0.5, size: 2 }
    })
    this.next = 0
  }

  spawn(pos, color = '#fff3a0', size = 2.2, life = 0.38) {
    const r = this.items[this.next]
    this.next = (this.next + 1) % this.items.length
    r.m.position.copy(pos)
    r.m.material.color.set(color)
    r.m.visible = true
    r.life = r.max = life
    r.size = size
  }

  update(dt) {
    for (const r of this.items) {
      if (!r.m.visible) continue
      r.life -= dt
      if (r.life <= 0) {
        r.m.visible = false
        continue
      }
      const k = 1 - r.life / r.max
      r.m.scale.setScalar(0.2 + k * r.size)
      r.m.material.opacity = (1 - k) * (1 - k)
    }
  }
}

/** "+1" bubbles that float up from where a star was caught. */
export class Popups {
  constructor(el, camera) {
    this.el = el
    this.camera = camera
    this.v = new THREE.Vector3()
  }

  show(pos, text, big = false) {
    this.v.copy(pos).project(this.camera)
    const d = document.createElement('div')
    d.className = big ? 'pop big' : 'pop'
    d.textContent = text
    d.style.left = `${(this.v.x * 0.5 + 0.5) * 100}%`
    d.style.top = `${(-this.v.y * 0.5 + 0.5) * 100}%`
    this.el.appendChild(d)
    setTimeout(() => d.remove(), 950)
  }
}
