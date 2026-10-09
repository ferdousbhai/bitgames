import * as THREE from 'three'

// A native modal owns focus and pauses only the original game's drawing. Each
// preview draws on change; it does not start a second animation loop.
export function createStudioDialog({ id, title, html, openButton, onOpen, onClose, voice }) {
  const dialog = document.createElement('dialog')
  dialog.id = id
  dialog.className = 'learning-studio panel'
  dialog.setAttribute('aria-labelledby', `${id}-title`)
  dialog.innerHTML = `<div class="studio-heading"><h2 id="${id}-title">${title}</h2><button class="studio-close" aria-label="Close studio">✕</button></div>${html}`
  document.body.append(dialog)

  dialog.querySelector('.studio-close').onclick = () => dialog.close()
  // A closed studio stops talking
  dialog.addEventListener('close', () => {
    voice?.hush()
    onClose?.()
  })
  openButton.addEventListener('click', () => {
    dialog.showModal()
    onOpen?.()
  })
  // Keep the game's keyboard controls out of the open studio.
  const guard = (e) => { if (dialog.open) e.stopImmediatePropagation() }
  addEventListener('keydown', guard, true)
  addEventListener('keyup', guard, true)

  return {
    dialog,
    get open() { return dialog.open },
    close: () => dialog.close(),
  }
}

/** A small shadowed tabletop scene, drawn on demand into the studio's canvas. */
export function createStudioView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25))
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#fff0df')
  scene.add(new THREE.HemisphereLight('#fffdf5', '#bda9c1', 2))
  const light = new THREE.DirectionalLight('#fff7db', 3)
  light.position.set(-3, 7, 5)
  light.castShadow = true
  light.shadow.mapSize.set(512, 512)
  Object.assign(light.shadow.camera, { left: -6, right: 6, top: 5, bottom: -5, near: 0.1, far: 20 })
  light.shadow.bias = -0.001
  scene.add(light)

  const table = new THREE.Mesh(new THREE.BoxGeometry(10, 0.08, 8), new THREE.MeshStandardMaterial({ color: '#fff0df', roughness: 1 }))
  table.position.set(0, -0.09, 0)
  table.receiveShadow = true
  scene.add(table)

  const camera = new THREE.OrthographicCamera(-5, 5, 3, -3, 0.1, 60)
  camera.position.set(7, 9, 12)
  camera.lookAt(0, 0.4, 0.6)

  // Everything added through mesh()/material()/own() is disposed on the next clear().
  const root = new THREE.Group()
  scene.add(root)
  const owned = new Set()
  let draws = 0
  let width = 0
  let height = 0

  function material(colour) {
    const m = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.42 })
    owned.add(m)
    return m
  }
  function mesh(geometry, colour) {
    owned.add(geometry)
    const object = new THREE.Mesh(geometry, material(colour))
    object.castShadow = object.receiveShadow = true
    root.add(object)
    return object
  }
  function own(object) {
    object.traverse((o) => {
      if (!o.isMesh) return
      owned.add(o.geometry)
      for (const m of [o.material].flat()) owned.add(m)
    })
    return object
  }
  function clear() {
    root.clear()
    for (const resource of owned) resource.dispose()
    owned.clear()
  }
  function render() {
    const box = canvas.getBoundingClientRect()
    if (!box.width || !box.height) return
    if (box.width !== width || box.height !== height) {
      width = box.width
      height = box.height
      renderer.setSize(width, height, false)
    }
    // Keep the whole table in view at any aspect ratio.
    const aspect = width / height
    const halfHeight = Math.max(2.65, 5 / aspect)
    camera.left = -halfHeight * aspect
    camera.right = halfHeight * aspect
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.updateProjectionMatrix()
    renderer.render(scene, camera)
    draws++
  }

  // Redraw once per frame at most while the dialog is open and resizing.
  const isOpen = () => canvas.closest('dialog')?.open
  let resizeFrame = 0
  new ResizeObserver(() => {
    if (!isOpen() || resizeFrame) return
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0
      if (isOpen()) render()
    })
  }).observe(canvas)

  return { root, mesh, material, own, clear, render, get draws() { return draws } }
}
