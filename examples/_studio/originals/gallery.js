// Artwork stays on this device. A bounded, small gallery is optional storage.
const STORAGE_KEY = 'paint-splash:gallery'
const KEEP = 3

export function createGallery({ renderer, scene, camera, openButton, saveButton, onOpen }) {
  let pictures = []
  let persistent = true
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (Array.isArray(saved)) pictures = saved.filter((p) => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,')).slice(-KEEP)
  } catch {
    persistent = false
  }

  const dialog = document.createElement('dialog')
  dialog.id = 'art-gallery'
  dialog.innerHTML = '<h2>🖼️ My pictures</h2><div id="gallery-pictures"></div><p id="gallery-note"></p><button id="gallery-close">🎨 Back to painting</button>'
  document.body.append(dialog)
  const list = dialog.querySelector('#gallery-pictures')
  const note = dialog.querySelector('#gallery-note')

  function draw() {
    list.replaceChildren()
    for (const [i, url] of pictures.entries()) {
      const frame = document.createElement('figure')
      const img = document.createElement('img')
      img.src = url
      img.alt = `Our playground painting ${i + 1}`
      const caption = document.createElement('figcaption')
      caption.textContent = i === pictures.length - 1 ? '✨' : '' // the newest picture sparkles
      caption.setAttribute('aria-hidden', 'true')
      frame.append(img, caption)
      list.append(frame)
    }
    if (!pictures.length) list.innerHTML = '<div class="gallery-empty"><span class="gallery-steps" aria-hidden="true">🎨 ➜ 📷 ➜ 🖼️</span>Paint a playground, then touch the camera to keep a picture.</div>'
    note.textContent = persistent ? 'Your last three pictures stay on this device.' : 'Your pictures are kept for this visit.'
  }

  function show() {
    draw()
    onOpen?.()
    dialog.showModal()
  }

  // Render a fresh frame so the snapshot never catches a cleared drawing buffer.
  function snapshot() {
    renderer.render(scene, camera)
    const source = renderer.domElement
    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = Math.round((720 * source.height) / source.width)
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82)
  }

  openButton.onclick = show
  dialog.querySelector('#gallery-close').onclick = () => dialog.close()
  saveButton.onclick = () => {
    pictures = [...pictures, snapshot()].slice(-KEEP)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pictures))
      persistent = true
    } catch {
      persistent = false
    }
    show()
  }
  // Keep the painting game's keyboard controls out of the open dialog.
  addEventListener('keydown', (e) => { if (dialog.open) e.stopImmediatePropagation() }, true)

  return {
    get open() { return dialog.open },
    get count() { return pictures.length },
    close: () => dialog.close(),
  }
}
