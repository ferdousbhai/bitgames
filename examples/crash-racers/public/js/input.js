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

  bindTouch(root) {
    for (const el of root.querySelectorAll('[data-touch]')) {
      const name = el.dataset.touch
      const set = (v) => (e) => {
        e.preventDefault()
        if (name in this.touch) this.touch[name] = v
        else if (v) this.emit('button', name)
        el.classList.toggle('pressed', v)
      }
      el.addEventListener('pointerdown', set(true))
      el.addEventListener('pointerup', set(false))
      el.addEventListener('pointercancel', set(false))
      el.addEventListener('pointerleave', set(false))
    }
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
