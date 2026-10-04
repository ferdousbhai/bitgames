/** Tiny time-based tweens driven by the game loop, so everything pauses with the page. */
const active = []

/**
 * Calls update(t) every frame with t going 0 → 1 over dur seconds (exactly 1 on the last call)
 * and resolves when done. A new tween with the same tag replaces the running one.
 */
export function tween(dur, update, { delay = 0, tag } = {}) {
  if (tag) {
    const i = active.findIndex((tw) => tw.tag === tag)
    if (i >= 0) active.splice(i, 1)
  }
  return new Promise((resolve) => active.push({ dur, update, delay, tag, t: 0, resolve }))
}

export const wait = (seconds) => tween(seconds, () => {})

/** Drops every running tween (their promises never resolve). */
export function clearTweens() {
  active.length = 0
}

export function updateTweens(dt) {
  const list = active.splice(0, active.length)
  for (const tw of list) {
    if (tw.delay > 0) {
      tw.delay -= dt
      active.push(tw)
      continue
    }
    tw.t = Math.min(1, tw.t + dt / Math.max(tw.dur, 1e-4))
    tw.update(tw.t)
    if (tw.t < 1) active.push(tw)
    else tw.resolve()
  }
}

export const ease = {
  outCubic: (t) => 1 - (1 - t) ** 3,
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => {
    const c = 1.9
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
  },
}
