/**
 * Keyboard, touch, mouse and gamepad, merged into a paddle direction on the
 * screen ({ x: right, y: down }, length up to 1) and a dash press.
 *
 * Touch: put a finger down anywhere on the water and drag; a little joystick
 * appears under it. The 💨 button dashes. Every finger is tracked, so one can
 * steer while another taps dash. Touch events (not pointer events) with
 * preventDefault, because iPad browsers otherwise cancel a held finger for
 * their press-and-hold menu.
 */
export class Input {
  constructor({ stick, knob, dashButton, enabled }) {
    this.keys = new Set()
    this.stick = stick
    this.knob = knob
    this.dashButton = dashButton
    this.enabled = enabled // () => true while the game wants steering
    this.joy = null // { id, x0, y0, x, y }
    this.dashQueued = false
    this.onDash = null
    this.padDash = false
    this.radius = 60

    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase()
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
      if ((k === ' ' || k === 'shift' || k === 'enter') && !e.repeat) this.dash()
      this.keys.add(k)
    })
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()))
    addEventListener('blur', () => {
      this.keys.clear()
      this.endJoy()
    })

    const dashDown = (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.dash()
      dashButton.classList.add('pressed')
      setTimeout(() => dashButton.classList.remove('pressed'), 150)
    }
    dashButton.addEventListener('touchstart', dashDown, { passive: false })
    dashButton.addEventListener('mousedown', dashDown)

    // The joystick: touch...
    const free = (el) => !el?.closest?.('button, a, input, .screen, .no-joy')
    addEventListener(
      'touchstart',
      (e) => {
        if (!this.enabled()) return
        for (const t of e.changedTouches) {
          if (this.joy || !free(document.elementFromPoint(t.clientX, t.clientY))) continue
          e.preventDefault()
          this.startJoy(t.identifier, t.clientX, t.clientY)
        }
      },
      { passive: false },
    )
    addEventListener(
      'touchmove',
      (e) => {
        if (!this.joy) return
        e.preventDefault()
        for (const t of e.changedTouches) if (t.identifier === this.joy.id) this.moveJoy(t.clientX, t.clientY)
      },
      { passive: false },
    )
    const touchEnd = (e) => {
      for (const t of e.changedTouches) if (this.joy && t.identifier === this.joy.id) this.endJoy()
    }
    addEventListener('touchend', touchEnd)
    addEventListener('touchcancel', touchEnd)
    // ...and mouse (drag on the water works like the joystick).
    addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !this.enabled() || this.joy || !free(e.target)) return
      this.startJoy('mouse', e.clientX, e.clientY)
    })
    addEventListener('mousemove', (e) => {
      if (this.joy?.id === 'mouse') this.moveJoy(e.clientX, e.clientY)
    })
    addEventListener('mouseup', () => {
      if (this.joy?.id === 'mouse') this.endJoy()
    })
  }

  dash() {
    if (!this.enabled()) return
    this.dashQueued = true
    this.onDash?.()
  }

  /** True once per dash press. */
  takeDash() {
    const d = this.dashQueued
    this.dashQueued = false
    return d
  }

  startJoy(id, x, y) {
    this.radius = Math.max(44, Math.min(70, Math.min(innerWidth, innerHeight) * 0.11))
    this.joy = { id, x0: x, y0: y, x, y }
    this.stick.style.transform = `translate(${x}px, ${y}px)`
    this.stick.style.setProperty('--r', `${this.radius}px`)
    this.knob.style.transform = 'translate(0px, 0px)'
    this.stick.classList.add('on')
  }

  moveJoy(x, y) {
    const j = this.joy
    let dx = x - j.x0
    let dy = y - j.y0
    const len = Math.hypot(dx, dy)
    // Dragging past the edge drags the joystick along, so it never runs out of room.
    if (len > this.radius * 1.4) {
      const k = (len - this.radius * 1.4) / len
      j.x0 += dx * k
      j.y0 += dy * k
      dx = x - j.x0
      dy = y - j.y0
      this.stick.style.transform = `translate(${j.x0}px, ${j.y0}px)`
    }
    j.x = x
    j.y = y
    const l = Math.hypot(dx, dy)
    const k = l > this.radius ? this.radius / l : 1
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`
  }

  endJoy() {
    this.joy = null
    this.stick.classList.remove('on')
  }

  /** The paddle direction on screen: x right, y down, length 0..1. */
  read() {
    if (this.override) return this.override
    let x = 0
    let y = 0
    const k = this.keys
    if (k.has('arrowleft') || k.has('a')) x -= 1
    if (k.has('arrowright') || k.has('d')) x += 1
    if (k.has('arrowup') || k.has('w')) y -= 1
    if (k.has('arrowdown') || k.has('s')) y += 1
    if (this.joy) {
      const dx = (this.joy.x - this.joy.x0) / this.radius
      const dy = (this.joy.y - this.joy.y0) / this.radius
      const l = Math.hypot(dx, dy)
      if (l > 0.18) {
        x += dx / Math.max(1, l)
        y += dy / Math.max(1, l)
      }
    }
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue
      if (Math.hypot(pad.axes[0], pad.axes[1]) > 0.2) {
        x += pad.axes[0]
        y += pad.axes[1]
      }
      if (pad.buttons[12]?.pressed) y -= 1
      if (pad.buttons[13]?.pressed) y += 1
      if (pad.buttons[14]?.pressed) x -= 1
      if (pad.buttons[15]?.pressed) x += 1
      const pressed = pad.buttons[0]?.pressed || pad.buttons[1]?.pressed || pad.buttons[7]?.pressed
      if (pressed && !this.padDash) this.dash()
      this.padDash = pressed
    }
    const l = Math.hypot(x, y)
    if (l > 1) {
      x /= l
      y /= l
    }
    return { x, y }
  }
}
