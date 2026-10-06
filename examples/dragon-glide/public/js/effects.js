import * as THREE from 'three'

const glowTextures = {}

/** Soft round glow (optionally with a four-point twinkle), drawn once into a canvas and shared. */
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
  grad.addColorStop(0.2, 'rgba(255,255,255,0.8)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.2)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  if (twinkle) {
    g.globalCompositeOperation = 'lighter'
    for (const [w, h] of [[size * 0.95, size * 0.07], [size * 0.07, size * 0.95]]) {
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

/** A round confetti/dot texture with a hard edge, for things that should read on a bright sky. */
let dotTexture
function makeDotTexture() {
  if (dotTexture) return dotTexture
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  g.fillStyle = '#fff'
  g.beginPath()
  g.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2)
  g.fill()
  dotTexture = new THREE.CanvasTexture(c)
  return dotTexture
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
    gl_PointSize = min(size * uScale / -mv.z, 140.0);
    vTint = tint;
    // fade out anything about to touch the camera, so nothing smears across the screen
    vAlpha = alpha * smoothstep(1.5, 5.0, -mv.z);
  }
`
const GLOW_FRAG = /* glsl */ `
  uniform sampler2D map;
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(vTint * tex.rgb * vAlpha * tex.a, 1.0);
    #include <colorspace_fragment>
  }
`
const DOT_FRAG = /* glsl */ `
  uniform sampler2D map;
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(map, gl_PointCoord);
    if (tex.a * vAlpha < 0.05) discard;
    gl_FragColor = vec4(vTint, tex.a * vAlpha);
    #include <colorspace_fragment>
  }
`

/**
 * One pooled point cloud. `glow` clouds add light (sparkles, fire); the other kind is
 * solid coloured dots (confetti, puffs) that still show up against a bright sky.
 */
export class Particles {
  constructor(scene, { max = 800, glow = true } = {}) {
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
      uniforms: { map: { value: glow ? makeGlowTexture(true) : makeDotTexture() }, uScale: { value: 400 } },
      vertexShader: POINT_VERT,
      fragmentShader: glow ? GLOW_FRAG : DOT_FRAG,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
      transparent: true,
    })
    this.points = new THREE.Points(this.geo, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = glow ? 6 : 5
    scene.add(this.points)
    this.p = Array.from({ length: max }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 0, s1: 0, grav: 0, drag: 0 }))
    this.next = 0
    this.live = 0
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
    p.vz = vz + (Math.random() - 0.5) * spread
    p.s0 = size
    p.s1 = endSize
    p.grav = grav
    p.drag = drag
    this.color.set(color).toArray(this.tint, i * 3)
    this.pos[i * 3] = x
    this.pos[i * 3 + 1] = y
    this.pos[i * 3 + 2] = z
    this.live = 1
  }

  /** A happy starburst in every direction. */
  burst(pos, colors, count = 22, power = 6, size = 0.6, { vz = 0, grav = -2 } = {}) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2
      const b = Math.acos(Math.random() * 2 - 1)
      const s = power * (0.5 + Math.random() * 0.6)
      this.emit(pos.x, pos.y, pos.z, {
        vx: Math.sin(b) * Math.cos(a) * s, vy: Math.sin(b) * Math.sin(a) * s, vz: Math.cos(b) * s + vz, spread: 0.5, life: 0.8,
        size, endSize: 0, color: colors[k % colors.length], grav, drag: 2,
      })
    }
  }

  update(dt) {
    if (!this.live) return
    let any = 0
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i]
      if (p.life <= 0) {
        this.alpha[i] = 0
        continue
      }
      any = 1
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
      this.alpha[i] = Math.min(1, k * 2.5)
    }
    this.live = any
    for (const name of ['position', 'tint', 'size', 'alpha']) this.geo.attributes[name].needsUpdate = true
  }
}

/** Expanding rings of light when a hoop is flown through or a gem is caught. */
export class Rings {
  constructor(scene, count = 10) {
    const geo = new THREE.RingGeometry(0.86, 1, 48)
    this.items = Array.from({ length: count }, () => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide }))
      m.visible = false
      m.renderOrder = 4
      scene.add(m)
      return { m, life: 0, max: 0.5, size: 2 }
    })
    this.next = 0
  }

  /** On a dark sky the rings shine (added light) instead of fading to grey. */
  setGlow(on) {
    for (const r of this.items) {
      r.m.material.blending = on ? THREE.AdditiveBlending : THREE.NormalBlending
      r.m.material.needsUpdate = true
    }
  }

  spawn(pos, color = '#fff3a0', size = 2.2, life = 0.4) {
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
      r.m.scale.setScalar(0.3 + k * r.size)
      r.m.material.opacity = (1 - k) * 0.9
    }
  }
}

/** "+1" bubbles that float up from where something was caught. */
export class Popups {
  constructor(el, camera) {
    this.el = el
    this.camera = camera
    this.v = new THREE.Vector3()
  }

  show(pos, text, kind = '') {
    this.v.copy(pos).project(this.camera)
    if (this.v.z > 1) return
    const d = document.createElement('div')
    d.className = `pop ${kind}`
    d.textContent = text
    d.style.left = `${Math.min(92, Math.max(8, (this.v.x * 0.5 + 0.5) * 100))}%`
    d.style.top = `${Math.min(90, Math.max(12, (-this.v.y * 0.5 + 0.5) * 100))}%`
    this.el.appendChild(d)
    setTimeout(() => d.remove(), 1000)
  }
}
