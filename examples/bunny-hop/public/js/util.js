import * as THREE from 'three'

/** Small helpers shared by the other modules. */
export const clamp = THREE.MathUtils.clamp
export const rand = THREE.MathUtils.randFloat // a random number between a and b
export const pick = (list) => list[Math.floor(Math.random() * list.length)]

/**
 * How far to ease towards a target this frame, the same at any frame rate
 * (what THREE.MathUtils.damp uses). Higher `rate` = snappier.
 */
export const easeStep = (rate, dt) => 1 - Math.exp(-rate * dt)

/** Drop the items `keep` says no to, in place (no new array every frame). */
export function keepWhere(list, keep) {
  let n = 0
  for (let i = 0; i < list.length; i++) if (keep(list[i])) list[n++] = list[i]
  list.length = n
}
