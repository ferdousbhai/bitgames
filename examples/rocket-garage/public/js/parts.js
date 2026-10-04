/**
 * Everything you can build with, and where you fly. `at` is the destination whose visit
 * unlocks a part (-1 = in the garage from the start). Models live in models/parts.glb.
 */

export const DESTS = [
  { id: 'moon', emoji: '🌙', name: 'Moon', model: 'dest_moon', sky: ['#1b1446', '#3a2a7a'], dust: '#e9e4f5' },
  { id: 'mars', emoji: '🔴', name: 'Mars', model: 'dest_mars', sky: ['#2a1035', '#6a2a50'], dust: '#ffb08a' },
  { id: 'ringed', emoji: '🪐', name: 'Ring Planet', model: 'dest_ringed', sky: ['#24124a', '#5c3a8a'], dust: '#ffe0b0' },
  { id: 'comet', emoji: '☄️', name: 'Comet', model: 'dest_comet', sky: ['#0d1a45', '#1f4a7a'], dust: '#c8f4ff' },
  { id: 'alien', emoji: '👽', name: 'Alien Planet', model: 'dest_alien', sky: ['#1a0f3d', '#3d1f6a'], dust: '#c9ffb0' },
]

// Bottom to top is fins, tank, cabin, nose; boosters ride the sides, the sticker sits on the tank
export const SLOTS = [
  { id: 'nose', paint: true },
  { id: 'cabin', paint: true },
  { id: 'pilot', paint: false },
  { id: 'tank', paint: true },
  { id: 'sticker', paint: false },
  { id: 'fins', paint: true },
  { id: 'booster', paint: true },
]

/** power: how much farther it flies. wobble: how silly the flight is. */
export const PARTS = {
  nose: [
    { id: 'cone', at: -1 },
    { id: 'dome', at: -1 },
    { id: 'party', at: 0 },
    { id: 'star', at: 1 },
    { id: 'icecream', at: 2, wobble: 0.15 },
    { id: 'crown', at: 4 },
  ],
  cabin: [
    { id: 'porthole', at: -1 },
    { id: 'bubble', at: -1 },
    { id: 'tv', at: 1 },
    { id: 'heart', at: 3 },
  ],
  pilot: [
    { id: 'cat', at: -1 },
    { id: 'bunny', at: -1 },
    { id: 'puppy', at: 0 },
    { id: 'panda', at: 2 },
    { id: 'frog', at: 3 },
    { id: 'alien', at: 4 },
  ],
  tank: [
    { id: 'stripes', at: -1 },
    { id: 'ball', at: -1, wobble: 0.2 },
    { id: 'barrel', at: 0, wobble: 0.1 },
    { id: 'candy', at: 2, wobble: 0.1 },
    { id: 'box', at: 3, wobble: 0.25 },
  ],
  sticker: [
    { id: 'none', at: -1 },
    { id: 'star', at: -1 },
    { id: 'heart', at: -1 },
    { id: 'bolt', at: 1 },
    { id: 'flower', at: 2 },
    { id: 'paw', at: 3 },
    { id: 'smile', at: 4 },
  ],
  fins: [
    { id: 'classic', at: -1 },
    { id: 'wings', at: 0 },
    { id: 'star', at: 1, wobble: 0.1 },
    { id: 'fish', at: 2, wobble: 0.35 },
    { id: 'legs', at: 3, wobble: 0.45 },
  ],
  booster: [
    { id: 'none', at: -1, power: 0 },
    { id: 'small', at: -1, power: 1, r: 0.2 },
    { id: 'big', at: 1, power: 2, r: 0.27 },
    { id: 'mega', at: 2, power: 3, r: 0.32 },
    { id: 'rainbow', at: 3, power: 4, r: 0.3 },
  ],
}

export const COLORS = ['#ff4f6d', '#ff9f43', '#ffd23f', '#5cd65c', '#2ec4b6', '#3bb5ff', '#9b5de5', '#ff8fc7', '#ffffff', '#4a4063']

export const DEFAULT_ROCKET = {
  nose: 'cone',
  cabin: 'porthole',
  pilot: 'cat',
  tank: 'stripes',
  sticker: 'star',
  fins: 'classic',
  booster: 'none',
  colors: { nose: '#ff4f6d', cabin: '#ffd23f', tank: '#3bb5ff', fins: '#ff4f6d', booster: '#ff9f43' },
}

export function part(slot, id) {
  return PARTS[slot].find((p) => p.id === id) ?? PARTS[slot][0]
}

export function modelName(slot, id) {
  if (slot === 'pilot') return `pilot_${id}`
  return `${slot}_${id}`
}

/** Index of the destination this rocket reaches without any turbo. */
export function reach(rocket) {
  return Math.min(DESTS.length - 1, part('booster', rocket.booster).power ?? 0)
}

/** 0 = rock steady, about 1 = a gloriously silly wobble. */
export function wobble(rocket) {
  let w = 0.12
  for (const slot of ['nose', 'tank', 'fins']) w += part(slot, rocket[slot]).wobble ?? 0
  if (rocket.booster === 'none') w += 0.08
  return Math.min(w, 1)
}

export function isUnlocked(p, visited) {
  return p.at < 0 || !!visited[p.at]
}

/** Parts that become available when destination `d` is first visited. */
export function unlocksAt(d) {
  const out = []
  for (const slot in PARTS) for (const p of PARTS[slot]) if (p.at === d) out.push({ slot, id: p.id })
  return out
}

/** Make a saved rocket safe to use: unknown parts fall back to defaults. */
export function sanitize(r, visited) {
  const out = { ...DEFAULT_ROCKET, colors: { ...DEFAULT_ROCKET.colors } }
  if (!r || typeof r !== 'object') return out
  for (const slot in PARTS) {
    const p = PARTS[slot].find((q) => q.id === r[slot])
    if (p && isUnlocked(p, visited)) out[slot] = p.id
  }
  if (r.colors && typeof r.colors === 'object') {
    for (const k in out.colors) if (COLORS.includes(r.colors[k])) out.colors[k] = r.colors[k]
  }
  return out
}
