/**
 * Ten-pin scoring. Each frame is a list of how many pins each roll knocked
 * over. Strikes add the next two rolls, spares the next one.
 */
export const FRAMES = 10

export class ScoreCard {
  constructor() {
    this.reset()
  }

  reset() {
    this.frames = Array.from({ length: FRAMES }, () => [])
    this.frame = 0
  }

  get roll() {
    return this.frames[this.frame]?.length ?? 0
  }

  get over() {
    return this.frame >= FRAMES
  }

  /**
   * Record a roll. Returns what happens next:
   *   { strike, spare, resetPins, frameDone, gameOver }
   */
  add(pins) {
    const f = this.frames[this.frame]
    const last = this.frame === FRAMES - 1
    f.push(pins)
    let strike = false
    let spare = false
    let resetPins = false
    let frameDone = false
    if (!last) {
      if (f.length === 1 && pins === 10) strike = frameDone = true
      else if (f.length === 2) {
        spare = f[0] + f[1] === 10
        frameDone = true
      }
    } else {
      // The tenth frame: a strike or spare earns fresh pins and a bonus roll.
      if (f.length === 1) {
        strike = pins === 10
        resetPins = strike
      } else if (f.length === 2) {
        if (f[0] === 10) {
          strike = pins === 10
          resetPins = true
        } else {
          spare = f[0] + f[1] === 10
          resetPins = spare
          frameDone = !spare
        }
        // After a strike then a non-strike, the third roll is at what is left.
        if (f[0] === 10 && pins !== 10) resetPins = false
      } else {
        strike = pins === 10 && (f[1] === 10 || f[0] + f[1] === 10 || f[0] === 10)
        spare = !strike && f[0] === 10 && f[1] !== 10 && f[1] + f[2] === 10
        frameDone = true
      }
    }
    if (frameDone) {
      resetPins = true
      this.frame += 1
    }
    return { strike, spare, resetPins, frameDone, gameOver: this.over }
  }

  /** Running total after each frame, or null while a bonus is still pending. */
  totals() {
    const rolls = this.frames.flat()
    const out = []
    let i = 0
    let sum = 0
    for (let fi = 0; fi < FRAMES; fi++) {
      const f = this.frames[fi]
      if (!f.length) {
        out.push(null)
        continue
      }
      let value = null
      if (fi === FRAMES - 1) {
        const done = f.length === 3 || (f.length === 2 && f[0] + f[1] < 10)
        value = done ? f.reduce((a, b) => a + b, 0) : null
      } else if (f[0] === 10) {
        value = rolls.length > i + 2 ? 10 + rolls[i + 1] + rolls[i + 2] : null
        i += 1
      } else if (f.length === 2) {
        value = f[0] + f[1] === 10 ? (rolls.length > i + 2 ? 10 + rolls[i + 2] : null) : f[0] + f[1]
        i += 2
      } else {
        i += f.length
      }
      if (value === null) {
        out.push(null)
        // Later frames can't show a total before this one is known.
        for (let k = fi + 1; k < FRAMES; k++) out.push(null)
        break
      }
      sum += value
      out.push(sum)
    }
    return out
  }

  /** The total so far, counting pins without waiting for pending bonuses. */
  get total() {
    const t = this.totals()
    let known = 0
    let lastKnown = -1
    t.forEach((v, i) => {
      if (v !== null) {
        known = v
        lastKnown = i
      }
    })
    // Add raw pins of frames whose bonus is still pending, so the number always grows.
    let pending = 0
    for (let fi = lastKnown + 1; fi < FRAMES; fi++) pending += this.frames[fi].reduce((a, b) => a + b, 0)
    return known + pending
  }

  /** Marks for one frame: 'X', '/', '-' or a digit, per roll. */
  marks(fi) {
    const f = this.frames[fi]
    const m = []
    for (let r = 0; r < f.length; r++) {
      const v = f[r]
      const tenth = fi === FRAMES - 1
      const fresh = r === 0 || (tenth && (f[r - 1] === 10 || (r === 2 && f[0] + f[1] === 10 && f[0] !== 10)))
      if (fresh && v === 10) m.push('X')
      else if (!fresh && f[r - 1] + v === 10) m.push('/')
      else m.push(v === 0 ? '-' : String(v))
    }
    return m
  }
}
