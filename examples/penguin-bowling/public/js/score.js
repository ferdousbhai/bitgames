/**
 * A short game of bowling: five frames, each a list of how many pins each slide knocked over.
 * There is no running score. The last frame keeps a real tenth frame's fresh rack and extra slide
 * after a strike or spare.
 */
export const FRAMES = 5

export class ScoreCard {
  constructor() {
    this.count = FRAMES
    this.reset()
  }

  reset(count = this.count) {
    this.count = count
    this.frames = Array.from({ length: count }, () => [])
    this.frame = 0
  }

  get roll() {
    return this.frames[this.frame]?.length ?? 0
  }

  get over() {
    return this.frame >= this.count
  }

  /**
   * Record a roll. Returns what happens next:
   *   { strike, spare, resetPins, frameDone, gameOver }
   */
  add(pins) {
    const f = this.frames[this.frame]
    const last = this.frame === this.count - 1
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
}
