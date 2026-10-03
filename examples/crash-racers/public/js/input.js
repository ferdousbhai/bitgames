import { clamp } from './util.js'

/**
 * Keyboard, touch and gamepad, merged into { steer, throttle, brake }.
 * "Easy gas" (on by default) keeps the car moving so little hands only steer.
 */
export class Input {
  constructor(root) {
    this.keys = new Set()
    this.touch = { left: false, right: false, gas: false, brake: false }
    this.easyGas = true
    this.listeners = {}
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault()
      if (!e.repeat) this.emit('key', e.key.toLowerCase())
      this.keys.add(e.key.toLowerCase())
    })
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()))
    addEventListener('blur', () => this.keys.clear())
    this.bindTouch(root)
  }

  on(event, fn) {
    ;(this.listeners[event] ??= []).push(fn)
  }

  emit(event, value) {
    for (const fn of this.listeners[event] ?? []) fn(value)
  }

  /**
   * On-screen buttons and touch steering. Mouse clicks use pointer events.
   * Touches use touch events with preventDefault, because iPad browsers
   * (all WebKit) otherwise cancel a held button for their press-and-hold menu,
   * and a pointer event can't stop that. Every finger is tracked, so a child
   * can steer and press gas at once, slide between ◀ and ▶, or touch the left
   * or right half of the road to steer.
   */
  bindTouch(root) {
    const buttons = [...root.querySelectorAll('[data-touch]')]
    const hold = (name, on) => {
      if (name in this.touch) this.touch[name] = on
    }
    for (const el of buttons) {
      const name = el.dataset.touch
      const set = (on) => (e) => {
        if (e.pointerType === 'touch') return
        e.preventDefault()
        if (name in this.touch) hold(name, on)
        else if (on) this.emit('button', name)
        el.classList.toggle('pressed', on)
      }
      el.addEventListener('pointerdown', set(true))
      el.addEventListener('pointerup', set(false))
      el.addEventListener('pointercancel', set(false))
      el.addEventListener('pointerleave', set(false))
    }

    /** What a finger at (x, y) does: a data-touch button, a half of the road, or null for menus and other UI. */
    const targetAt = (x, y) => {
      const el = document.elementFromPoint(x, y)
      if (!el) return null
      const button = el.closest('[data-touch]')
      if (button) return button
      if (el.closest('button, a, input, .screen')) return null
      return x < innerWidth / 2 ? 'left' : 'right'
    }
    const update = (e) => {
      const held = new Set()
      for (const t of e.touches) {
        const target = targetAt(t.clientX, t.clientY)
        if (target) held.add(target)
      }
      for (const t of e.type === 'touchstart' ? e.changedTouches : []) {
        const target = targetAt(t.clientX, t.clientY)
        if (target && typeof target !== 'string' && !(target.dataset.touch in this.touch)) this.emit('button', target.dataset.touch)
      }
      for (const name of ['left', 'right', 'gas', 'brake']) {
        const button = buttons.find((b) => b.dataset.touch === name)
        const pressed = held.has(button)
        hold(name, pressed || held.has(name))
        button?.classList.toggle('pressed', pressed)
      }
      for (const b of buttons) if (!(b.dataset.touch in this.touch)) b.classList.toggle('pressed', held.has(b))
    }
    const onTouch = (e) => {
      // Leave menus alone so their buttons still click; everything in the game view is ours.
      if ([...e.changedTouches].some((t) => targetAt(t.clientX, t.clientY))) e.preventDefault()
      update(e)
    }
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) addEventListener(type, onTouch, { passive: false })
  }

  read() {
    if (this.override) return this.override
    const k = this.keys
    let steer = 0, throttle = 0, brake = 0
    if (k.has('arrowleft') || k.has('a') || this.touch.left) steer -= 1
    if (k.has('arrowright') || k.has('d') || this.touch.right) steer += 1
    const gasKey = k.has('arrowup') || k.has('w') || this.touch.gas
    const brakeKey = k.has('arrowdown') || k.has('s') || this.touch.brake || k.has(' ')
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue
      if (Math.abs(pad.axes[0]) > 0.15) steer += pad.axes[0]
      if (pad.buttons[0]?.pressed || pad.buttons[7]?.value > 0.2) throttle = Math.max(throttle, pad.buttons[7]?.value || 1)
      if (pad.buttons[1]?.pressed || pad.buttons[6]?.value > 0.2) brake = Math.max(brake, pad.buttons[6]?.value || 1)
    }
    if (gasKey) throttle = 1
    if (brakeKey) brake = 1
    if (this.easyGas && !brake && !throttle) throttle = 0.85
    return { steer: clamp(steer, -1, 1), throttle: brake ? 0 : throttle, brake }
  }
}
