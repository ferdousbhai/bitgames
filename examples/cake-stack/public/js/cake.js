import * as THREE from 'three'

/**
 * The cake kit: layers, the stand and toppers from models/cake.glb (built by
 * blender/models.py). A layer has diameter 1, so its x/z scale is its width.
 */
export const STEP = 0.3 // height of one layer
export const STAND_TOP = 0.31 // top of the cake stand
export const START_W = 1.3 // width of the first layer
export const MIN_W = 0.42 // narrower than this and the cake is finished

export const FLAVOURS = {
  vanilla: { emoji: '🍦', sponge: '#f7d98f', filling: '#fff3e0', icing: '#fffaf0' },
  strawberry: { emoji: '🍓', sponge: '#ffc2d4', filling: '#ff5c8a', icing: '#ff8fb8' },
  chocolate: { emoji: '🍫', sponge: '#8a5a3c', filling: '#ffe0c2', icing: '#5a3420' },
  lemon: { emoji: '🍋', sponge: '#ffe680', filling: '#fffbe0', icing: '#fff07a' },
  mint: { emoji: '🍃', sponge: '#b8f0d8', filling: '#ffffff', icing: '#4fd1b5' },
  blueberry: { emoji: '🫐', sponge: '#d2c7ff', filling: '#ffffff', icing: '#8f7cf7' },
  rainbow: { emoji: '🌈', rainbow: true, sponge: '#ff6b6b', filling: '#ffffff', icing: '#ffffff' },
}

const TOPPERS = ['topper_candle', 'topper_cherry', 'topper_strawberry', 'topper_heart', 'topper_star', 'topper_cream', 'topper_sprinkles']

export class CakeKit {
  constructor() {
    this.src = {}
    this.mats = new Map()
  }

  attach(gltf) {
    for (const name of ['cake_layer', 'cake_layer_rainbow', 'cake_stand', ...TOPPERS]) {
      const o = gltf.scene.getObjectByName(name)
      if (!o) continue
      o.traverse((m) => {
        if (!m.isMesh) return
        m.castShadow = true
        m.receiveShadow = name === 'cake_layer' || name === 'cake_layer_rainbow' || name === 'cake_stand'
        m.material.envMapIntensity = 0.35
      })
      o.position.set(0, 0, 0)
      this.src[name] = o
    }
  }

  /** One material per flavour and part, shared by every layer of that flavour. */
  material(base, flavour, part) {
    const key = `${flavour}:${part}`
    let m = this.mats.get(key)
    if (!m) {
      m = base.clone()
      m.color.set(FLAVOURS[flavour][part])
      if (part === 'icing') m.roughness = 0.28
      this.mats.set(key, m)
    }
    return m
  }

  /**
   * A layer: a group (moved and wobbled by the game) holding the scaled cake body
   * and an unscaled decor group for things stuck on its side.
   */
  layer(flavour) {
    const f = FLAVOURS[flavour]
    const group = new THREE.Group()
    let body
    const src = f.rainbow ? this.src.cake_layer_rainbow : this.src.cake_layer
    if (src) {
      body = src.clone(true)
      body.traverse((m) => {
        if (!m.isMesh) return
        const n = m.material.name
        if (n === 'layer_sponge') m.material = this.material(m.material, flavour, 'sponge')
        else if (n === 'layer_filling') m.material = this.material(m.material, flavour, 'filling')
        else if (n === 'layer_icing') m.material = this.material(m.material, flavour, 'icing')
      })
    } else {
      body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, STEP, 32).translate(0, STEP / 2, 0), new THREE.MeshStandardMaterial({ color: f.icing }))
      body.castShadow = body.receiveShadow = true
    }
    const decor = new THREE.Group()
    group.add(body, decor)
    return { group, body, decor, flavour, x: 0, w: START_W }
  }

  /** The moving layer gets its own materials so it can glow when lined up. */
  glowCopy(layer) {
    const mats = []
    layer.body.traverse((m) => {
      if (!m.isMesh) return
      m.material = m.material.clone()
      mats.push(m.material)
    })
    return mats
  }

  /** Back to the shared flavour materials once it has landed. */
  unglow(layer) {
    const f = layer.flavour
    layer.body.traverse((m) => {
      if (!m.isMesh) return
      const n = m.material.name
      const part = n === 'layer_sponge' ? 'sponge' : n === 'layer_filling' ? 'filling' : n === 'layer_icing' ? 'icing' : null
      const old = m.material
      if (part) m.material = this.material(old, f, part)
      else if (this.src.cake_layer_rainbow) {
        // Rainbow bands keep their own colours: find the original material by name.
        this.src.cake_layer_rainbow.traverse((o) => {
          if (o.isMesh && o.material.name === n) m.material = o.material
        })
      }
      if (m.material !== old) old.dispose()
    })
  }

  stand() {
    if (this.src.cake_stand) return this.src.cake_stand.clone(true)
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.4, STAND_TOP, 32).translate(0, STAND_TOP / 2, 0), new THREE.MeshStandardMaterial({ color: '#ffffff' }))
    m.receiveShadow = true
    return m
  }

  topper(name, tint) {
    const src = this.src[name]
    if (!src) return new THREE.Group()
    const o = src.clone(true)
    if (tint) {
      o.traverse((m) => {
        if (m.isMesh && m.material.name === 'candle_wax') {
          m.material = m.material.clone()
          m.material.color.set(tint)
        }
      })
    }
    return o
  }
}
