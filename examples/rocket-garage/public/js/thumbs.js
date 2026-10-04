import * as THREE from 'three'

const tmpBox = new THREE.Box3()
/** Bounds of only the visible meshes (Box3.setFromObject also counts hidden ones). */
export function visibleBox(obj, out) {
  out.makeEmpty()
  obj.updateMatrixWorld(true)
  const walk = (o) => {
    if (!o.visible) return
    if (o.isMesh) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
      out.union(tmpBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld))
    }
    for (const c of o.children) walk(c)
  }
  walk(obj)
  return out
}

/** Renders little pictures of parts for the tray, with their own small WebGL canvas. */
export class Thumbs {
  constructor(size = 128) {
    this.size = size
    this.canvas = document.createElement('canvas')
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(size, size, false)
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.scene = new THREE.Scene()
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#8a7fb0', 2.2))
    const key = new THREE.DirectionalLight('#fff3e0', 2.6)
    key.position.set(3, 5, 8)
    this.scene.add(key)
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100)
    this.box = new THREE.Box3()
    this.v = new THREE.Vector3()
  }

  /** `obj` is a ready clone; returns a PNG data URL. */
  shot(obj, { turn = -0.45, tilt = 0.12, fill = 0.82 } = {}) {
    const holder = new THREE.Group()
    holder.add(obj)
    holder.rotation.set(tilt, turn, 0)
    this.scene.add(holder)
    holder.updateMatrixWorld(true)
    visibleBox(obj, this.box)
    const c = this.box.getCenter(this.v)
    holder.position.sub(c)
    const size = this.box.getSize(new THREE.Vector3())
    const r = Math.max(size.x, size.y, size.z * 0.6) / 2
    const d = r / Math.tan((this.camera.fov * Math.PI) / 360) / fill
    this.camera.position.set(0, 0, d + size.z / 2)
    this.camera.lookAt(0, 0, 0)
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.render(this.scene, this.camera)
    this.scene.remove(holder)
    return this.canvas.toDataURL('image/png')
  }
}
