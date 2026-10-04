import * as THREE from 'three'

/** A small canvas drawn once and used as a texture. */
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const dotTexture = () =>
  canvasTexture(64, 64, (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.55, 'rgba(255,255,255,0.95)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, w, w)
  })

const starTexture = () =>
  canvasTexture(64, 64, (g, w) => {
    g.translate(w / 2, w / 2)
    g.beginPath()
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 12 : 30
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    g.closePath()
    g.fillStyle = '#fff'
    g.fill()
  })

/**
 * Many little sprites in one draw call: splash drops, foam and sparkles.
 * Each has a colour, size, velocity, gravity and lifetime.
 */
class Particles {
  constructor(scene, texture, max = 500, blending = THREE.NormalBlending) {
    this.max = max
    this.list = []
    const geo = new THREE.BufferGeometry()
    this.pos = new Float32Array(max * 3)
    this.col = new Float32Array(max * 4)
    this.size = new Float32Array(max)
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage))
    this.geo = geo
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, scale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending,
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec4 color;
        uniform float scale;
        varying vec4 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec4 vColor;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor.rgb, vColor.a * t.a);
          #include <colorspace_fragment>
        }`,
    })
    this.material = material
    this.points = new THREE.Points(geo, material)
    this.points.frustumCulled = false
    scene.add(this.points)
  }

  spawn(x, y, z, vx, vy, vz, { color = '#ffffff', size = 0.4, life = 0.8, gravity = -14, drag = 0, grow = 0 } = {}) {
    if (this.list.length >= this.max) this.list.shift()
    const c = new THREE.Color(color)
    this.list.push({ x, y, z, vx, vy, vz, c, size, life, max: life, gravity, drag, grow })
  }

  update(dt) {
    const keep = []
    for (const p of this.list) {
      p.life -= dt
      if (p.life <= 0) continue
      p.vy += p.gravity * dt
      if (p.drag) {
        const k = Math.exp(-p.drag * dt)
        p.vx *= k
        p.vz *= k
        p.vy *= k
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      // Drops that fall back into the water vanish there.
      if (p.y < 0.02 && p.gravity < 0) continue
      p.size += p.grow * dt
      keep.push(p)
    }
    this.list = keep
    const n = keep.length
    for (let i = 0; i < n; i++) {
      const p = keep[i]
      this.pos[i * 3] = p.x
      this.pos[i * 3 + 1] = p.y
      this.pos[i * 3 + 2] = p.z
      this.col[i * 4] = p.c.r
      this.col[i * 4 + 1] = p.c.g
      this.col[i * 4 + 2] = p.c.b
      this.col[i * 4 + 3] = Math.min(1, (p.life / p.max) * 2.5)
      this.size[i] = p.size
    }
    this.geo.setDrawRange(0, n)
    for (const name of ['position', 'color', 'size']) this.geo.attributes[name].needsUpdate = true
  }

  clear() {
    this.list = []
  }
}

export class Effects {
  constructor(scene, camera, labels) {
    this.camera = camera
    this.labels = labels
    this.drops = new Particles(scene, dotTexture(), 700)
    this.stars = new Particles(scene, starTexture(), 200)
    this.shake = 0
  }

  setScale(px) {
    this.drops.material.uniforms.scale.value = px
    this.stars.material.uniforms.scale.value = px
  }

  /** A splash: a crown of drops thrown up and out. */
  splash(x, z, strength = 1, color = '#e9fbff') {
    const n = Math.round(14 + strength * 16)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const s = (1.5 + Math.random() * 3) * (0.6 + strength * 0.5)
      this.drops.spawn(x + Math.cos(a) * 0.6, 0.2, z + Math.sin(a) * 0.6, Math.cos(a) * s, 3 + Math.random() * 5 * strength, Math.sin(a) * s, {
        color: Math.random() < 0.3 ? '#ffffff' : color,
        size: 0.25 + Math.random() * 0.3,
        life: 1.2,
      })
    }
  }

  /** Dizzy stars that pop out of a bonk. */
  bonkStars(x, z, strength = 1) {
    const colors = ['#ffd23f', '#ff9ccb', '#7fd3ff', '#ffffff']
    const n = Math.round(6 + strength * 5)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const s = 2 + Math.random() * 3
      this.stars.spawn(x, 1.4, z, Math.cos(a) * s, 3 + Math.random() * 4, Math.sin(a) * s, {
        color: colors[i % colors.length],
        size: 0.5 + Math.random() * 0.4,
        life: 0.9,
        gravity: -9,
      })
    }
  }

  sparkle(x, y, z, color = '#fff3b0', n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const s = 1 + Math.random() * 2.5
      this.stars.spawn(x, y, z, Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s, { color, size: 0.35 + Math.random() * 0.35, life: 0.7, gravity: -2, drag: 2 })
    }
  }

  /** Bubble pop: a ring of tiny droplets. */
  pop(x, y, z) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      this.drops.spawn(x, y, z, Math.cos(a) * 3, 0.5 + Math.random(), Math.sin(a) * 3, { color: i % 2 ? '#ffffff' : '#c9f1ff', size: 0.18, life: 0.35, gravity: -3, drag: 4 })
    }
  }

  /** Foam left behind a paddling boat. */
  wake(x, z, speed) {
    this.drops.spawn(x + (Math.random() - 0.5) * 0.6, 0.06, z + (Math.random() - 0.5) * 0.6, 0, 0, 0, {
      color: '#ffffff',
      size: 0.3 + Math.min(0.5, speed * 0.04),
      life: 0.8,
      gravity: 0,
      grow: 0.5,
    })
  }

  confetti(w = 10) {
    const colors = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff9ccb']
    for (let i = 0; i < 90; i++) {
      this.stars.spawn((Math.random() - 0.5) * w * 2, 6 + Math.random() * 4, (Math.random() - 0.5) * w * 1.5, (Math.random() - 0.5) * 4, Math.random() * 5, (Math.random() - 0.5) * 4, {
        color: colors[i % colors.length],
        size: 0.5 + Math.random() * 0.5,
        life: 2.6,
        gravity: -5,
        drag: 0.6,
      })
    }
  }

  rainOn(x, z) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2
      this.drops.spawn(x, 0.1, z, Math.cos(a) * 1.2, 2 + Math.random() * 1.5, Math.sin(a) * 1.2, { color: '#e6f0ff', size: 0.16, life: 0.5 })
    }
  }

  /** A word or number that pops up from a spot in the world and floats away. */
  label(text, pos, { color = '#fff', size = 'normal' } = {}) {
    const v = new THREE.Vector3(pos.x, pos.y ?? 1.8, pos.z).project(this.camera)
    if (v.z > 1) return
    const el = document.createElement('div')
    el.className = `float ${size}`
    el.textContent = text
    el.style.left = `${((v.x + 1) / 2) * 100}%`
    el.style.top = `${((1 - v.y) / 2) * 100}%`
    el.style.color = color
    this.labels.appendChild(el)
    setTimeout(() => el.remove(), 1100)
  }

  update(dt) {
    this.drops.update(dt)
    this.stars.update(dt)
    this.shake = Math.max(0, this.shake - dt * 1.8)
  }

  clear() {
    this.drops.clear()
    this.stars.clear()
    this.labels.textContent = ''
  }
}
