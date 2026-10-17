// The picture wall: the last few finished paintings, kept on this device. Pictures only, no words.
const STORAGE_KEY = 'paint-splash:gallery'
const KEEP = 3

export function createPictures({ renderer, scene, camera, openButton, onOpen, hideInPicture = () => [] }) {
  let pictures = []
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (Array.isArray(saved)) pictures = saved.filter((p) => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,')).slice(-KEEP)
  } catch {}

  const dialog = document.createElement('dialog')
  dialog.id = 'art-gallery'
  dialog.setAttribute('aria-label', 'My pictures')
  dialog.innerHTML = '<div id="gallery-pictures"></div><button id="gallery-close" aria-label="Back to painting">🎨</button>'
  document.body.append(dialog)
  const list = dialog.querySelector('#gallery-pictures')

  function draw() {
    list.replaceChildren()
    // Newest first, in wobbly frames; an empty wall shows empty frames waiting.
    const shown = [...pictures].reverse()
    for (let i = 0; i < KEEP; i++) {
      const frame = document.createElement('figure')
      frame.style.setProperty('--tilt', `${[-2.5, 1.8, -1.2][i]}deg`)
      frame.style.animationDelay = `${0.08 * i}s`
      if (shown[i]) {
        const img = document.createElement('img')
        img.src = shown[i]
        img.alt = `Painting ${i + 1}`
        frame.append(img)
        if (i === 0) frame.classList.add('newest')
      } else frame.classList.add('empty')
      list.append(frame)
    }
  }

  function show() {
    draw()
    onOpen?.()
    dialog.showModal()
  }

  // Render a fresh frame so the snapshot never catches a cleared drawing buffer
  // (without the confetti and sparkles, so the picture is just the painting).
  // `crop` (CSS pixels: x, y, width, height) keeps just that part of the screen.
  function snapshot(crop) {
    const hidden = hideInPicture().filter((o) => o.visible)
    for (const o of hidden) o.visible = false
    renderer.render(scene, camera)
    for (const o of hidden) o.visible = true
    const source = renderer.domElement
    const k = source.width / source.clientWidth || 1
    const [cx, cy, cw, ch] = crop ? crop.map((n) => n * k) : [0, 0, source.width, source.height]
    const sx = Math.max(0, cx), sy = Math.max(0, cy)
    const sw = Math.min(source.width, cx + cw) - sx, sh = Math.min(source.height, cy + ch) - sy
    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = Math.round((720 * sh) / sw)
    canvas.getContext('2d').drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82)
  }

  /** Keeps the scene as it looks now (or just the `crop` part of it), newest last; returns the picture. */
  function keep(crop) {
    const url = snapshot(crop)
    pictures = [...pictures, url].slice(-KEEP)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pictures))
    } catch {}
    return url
  }

  openButton.onclick = show
  dialog.querySelector('#gallery-close').onclick = () => dialog.close()
  // A tap on the dim backdrop (outside the wall) closes it too.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close() })
  // Keep the painting game's keyboard controls out of the open dialog.
  addEventListener('keydown', (e) => { if (dialog.open) e.stopImmediatePropagation() }, true)

  return {
    get open() { return dialog.open },
    get count() { return pictures.length },
    close: () => dialog.close(),
    keep,
    show,
  }
}
