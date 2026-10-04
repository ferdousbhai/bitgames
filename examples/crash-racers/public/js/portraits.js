import * as THREE from 'three'

const W = 240, H = 168, SS = 2 // picture size, rendered at twice the size and scaled down for smooth edges

/**
 * A picture of each Blender car, for the car picker and the podium: a child
 * who can't read the names picks the car they'll actually see on the road.
 * Rendered once with the game's own renderer (no second WebGL context), into
 * an sRGB render target, then copied out as a PNG data URL.
 */
export function carPortraits(renderer, templates) {
  const out = {}
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a7a9a', 1.6))
  const key = new THREE.DirectionalLight('#ffffff', 2.4)
  key.position.set(-4, 7, -5)
  scene.add(key)
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100)
  const target = new THREE.WebGLRenderTarget(W * SS, H * SS, { colorSpace: THREE.SRGBColorSpace })
  const pixels = new Uint8Array(W * SS * H * SS * 4)
  const big = Object.assign(document.createElement('canvas'), { width: W * SS, height: H * SS })
  const small = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const bigG = big.getContext('2d')
  const smallG = small.getContext('2d')
  const clearColor = renderer.getClearColor(new THREE.Color())
  const clearAlpha = renderer.getClearAlpha()
  renderer.setClearColor(0x000000, 0)
  try {
    for (const [name, template] of Object.entries(templates)) {
      const car = template.clone(true)
      car.position.set(0, 0, 0)
      car.rotation.set(0, 0, 0)
      car.getObjectByName('face_frown')?.removeFromParent()
      scene.add(car)
      car.updateMatrixWorld(true)
      // Front three-quarter view (the car faces -z), framed to fill the picture.
      const box = new THREE.Box3().setFromObject(car)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const dist = (Math.max(size.x, size.z) * 0.62 + size.y * 0.5) / Math.tan(THREE.MathUtils.degToRad(15)) * 0.62
      camera.position.set(center.x - dist * 0.62, center.y + dist * 0.42, center.z - dist * 0.66)
      camera.lookAt(center.x, center.y - size.y * 0.08, center.z)
      renderer.setRenderTarget(target)
      renderer.clear()
      renderer.render(scene, camera)
      renderer.readRenderTargetPixels(target, 0, 0, W * SS, H * SS, pixels)
      scene.remove(car)
      // WebGL rows run bottom-up.
      const image = bigG.createImageData(W * SS, H * SS)
      const row = W * SS * 4
      for (let y = 0; y < H * SS; y++) image.data.set(pixels.subarray((H * SS - 1 - y) * row, (H * SS - y) * row), y * row)
      bigG.putImageData(image, 0, 0)
      smallG.clearRect(0, 0, W, H)
      smallG.drawImage(big, 0, 0, W, H)
      out[name] = small.toDataURL('image/png')
    }
  } catch (err) {
    console.warn('Car pictures failed; using emoji instead.', err)
  } finally {
    renderer.setRenderTarget(null)
    renderer.setClearColor(clearColor, clearAlpha)
    target.dispose()
  }
  return out
}
