/** Everything the simulation, the view and the menus share. One unit is one Blender unit. */

export const R = 11 // radius of the water
export const DUCK_R = 1.1 // a bumper boat's radius
export const ROUND_TIME = 90 // seconds
export const PARTY_TIME = 15 // the last seconds are a bubble party
export const MAX_PLAYERS = 4

/** The six ducks: colour of the rubber, colour of the boat, and what they wear. */
export const DUCKS = {
  sunny: { emoji: '🐥', body: '#ffd23f', ring: '#ff4d5e', acc: 'acc_tuft' },
  rosie: { emoji: '🎀', body: '#ff9ccb', ring: '#9b5de5', acc: 'acc_bow' },
  sailor: { emoji: '⚓', body: '#7fd3ff', ring: '#244a9e', acc: 'acc_sailor' },
  king: { emoji: '👑', body: '#ffad4d', ring: '#2ec4b6', acc: 'acc_crown' },
  cool: { emoji: '😎', body: '#9be564', ring: '#ff9a2e', acc: 'acc_shades' },
  bloom: { emoji: '🌸', body: '#c9a7ff', ring: '#3ec7a0', acc: 'acc_flower' },
}
export const DUCK_IDS = Object.keys(DUCKS)
export const validDuck = (d) => typeof d === 'string' && Object.hasOwn(DUCKS, d)

/**
 * The places to play. Obstacles are circles in the water: `fixed` ones never
 * move (the bath's big mama duck, the pond's lily pads); the puddle's paper
 * boats drift and can be pushed around.
 */
export const ARENAS = {
  bath: {
    emoji: '🛁',
    color: '#5ec8f2',
    water: { deep: '#2fb2ee', shallow: '#8fe0ff', foam: '#ffffff' },
    sky: ['#fff4fb', '#d7f1ff'],
    obstacles: [{ kind: 'mama', x: 0, z: 0, r: 2.0, fixed: true }],
  },
  pond: {
    emoji: '🐸',
    color: '#6cc24a',
    water: { deep: '#2f9fb8', shallow: '#76d1c3', foam: '#e8fff4' },
    sky: ['#7cc8ff', '#e3f6ff'],
    obstacles: [
      { kind: 'lily', x: -5.2, z: -3.6, r: 1.3, fixed: true, frog: true },
      { kind: 'lily', x: 5.6, z: -2.4, r: 1.3, fixed: true, frog: true },
      { kind: 'lily', x: 0.6, z: 5.4, r: 1.3, fixed: true },
    ],
  },
  puddle: {
    emoji: '🌧️',
    color: '#7e8cc9',
    water: { deep: '#4f86c6', shallow: '#a7c8ec', foam: '#eef4ff' },
    sky: ['#8796b5', '#cfd8e8'],
    rain: true,
    obstacles: [
      { kind: 'boat', x: -4, z: 2, r: 1.0, mass: 1.6 },
      { kind: 'boat', x: 4.5, z: -3, r: 1.0, mass: 1.6 },
    ],
  },
}
export const ARENA_IDS = Object.keys(ARENAS)
export const validArena = (a) => typeof a === 'string' && Object.hasOwn(ARENAS, a)

/** Gift box powers: how long they last and how they show on the HUD. */
export const POWERS = {
  giant: { emoji: '🍄', time: 8 },
  speedy: { emoji: '⚡', time: 7 },
  shield: { emoji: '🛡️', time: 8 },
}
export const POWER_IDS = Object.keys(POWERS)

export const ITEMS = {
  bubble: { points: 1, radius: 0.55 },
  star: { points: 3, radius: 0.6 },
  gift: { points: 0, radius: 0.6 },
}

export const PLAYER_EMOJI = ['🐶', '🐱', '🐰', '🦊', '🐼', '🐯', '🐨', '🐵']

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, t) => a + (b - a) * t
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
/** Shortest signed difference between two angles. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
