/**
 * Where the child wants to roll, as a vector on screen (x right, y down, length
 * 0..1). Touch or mouse: press anywhere on the playground and drag; a joystick
 * appears under the finger. Keyboard: arrows or WASD. Gamepads: left stick.
 */
const MAX_PX = 64
const DEAD_PX = 6

export class Input {
  constructor(stickEl, knobEl) {
    this.keys = new Set()
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }
    this.stickEl = stickEl
    this.knobEl = knobEl
    this.enabled = false
    this.listeners = {}
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase()
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
      if (!e.repeat) this.emit('key', k)
      this.keys.add(k)
    })
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()))
    addEventListener('blur', () => {
      this.keys.clear()
      this.release()
    })
    addEventListener('pointerdown', (e) => this.down(e), { passive: false })
    addEventListener('pointermove', (e) => this.move(e), { passive: false })
    addEventListener('pointerup', (e) => e.pointerId === this.stick.id && this.release())
    addEventListener('pointercancel', (e) => e.pointerId === this.stick.id && this.release())
    // iPad: a finger held still would otherwise bring up the magnifier or callout.
    addEventListener('touchstart', (e) => this.enabled && !e.target.closest?.('button, .screen') && e.preventDefault(), { passive: false })
  }

  on(event, fn) {
    ;(this.listeners[event] ??= []).push(fn)
  }

  emit(event, value) {
    for (const fn of this.listeners[event] ?? []) fn(value)
  }

  down(e) {
    if (!this.enabled || this.stick.id !== null) return
    if (e.target.closest?.('button, .screen, .panel')) return
    e.preventDefault()
    this.emit('touch')
    Object.assign(this.stick, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 })
    this.stickEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
    this.knobEl.style.transform = 'translate(0px, 0px)'
    this.stickEl.classList.remove('hidden')
  }

  move(e) {
    if (e.pointerId !== this.stick.id) return
    e.preventDefault()
    let dx = e.clientX - this.stick.ox
    let dy = e.clientY - this.stick.oy
    const d = Math.hypot(dx, dy)
    // Dragging past the edge pulls the stick along, so the finger never runs out of room.
    if (d > MAX_PX * 1.4) {
      const pull = (d - MAX_PX * 1.4) / d
      this.stick.ox += dx * pull
      this.stick.oy += dy * pull
      dx = e.clientX - this.stick.ox
      dy = e.clientY - this.stick.oy
      this.stickEl.style.transform = `translate(${this.stick.ox}px, ${this.stick.oy}px)`
    }
    const len = Math.hypot(dx, dy)
    const k = len < DEAD_PX ? 0 : Math.min(1, (len - DEAD_PX) / (MAX_PX - DEAD_PX)) / len
    this.stick.x = dx * k
    this.stick.y = dy * k
    const show = Math.min(len, MAX_PX) / (len || 1)
    this.knobEl.style.transform = `translate(${dx * show}px, ${dy * show}px)`
  }

  release() {
    this.stick.id = null
    this.stick.x = this.stick.y = 0
    this.stickEl.classList.add('hidden')
  }

  /** { x, y } on screen, length 0..1. */
  read() {
    let x = this.stick.x, y = this.stick.y
    const k = this.keys
    if (k.has('arrowleft') || k.has('a')) x -= 1
    if (k.has('arrowright') || k.has('d')) x += 1
    if (k.has('arrowup') || k.has('w')) y -= 1
    if (k.has('arrowdown') || k.has('s')) y += 1
    for (const pad of gamepads()) {
      if (!pad) continue
      const px = pad.axes[0] ?? 0, py = pad.axes[1] ?? 0
      if (Math.hypot(px, py) > 0.2) {
        x += px
        y += py
      }
      if (pad.buttons[12]?.pressed) y -= 1
      if (pad.buttons[13]?.pressed) y += 1
      if (pad.buttons[14]?.pressed) x -= 1
      if (pad.buttons[15]?.pressed) x += 1
    }
    const len = Math.hypot(x, y)
    if (len > 1) {
      x /= len
      y /= len
    }
    return { x, y }
  }
}

/** Connected gamepads, or none (sandboxed frames on iPad throw instead). */
let padsAllowed = true
function gamepads() {
  if (!padsAllowed) return []
  try {
    return navigator.getGamepads?.() ?? []
  } catch {
    padsAllowed = false
    return []
  }
}
