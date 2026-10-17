import { clamp } from './util.js'

/**
 * The trip home: four places, one after another, then Pip's burrow.
 * Each place recolours the shared models (by material name) and picks its own
 * scenery, obstacles and weather.
 *
 * Scenery entries are [model, weight, minScale, maxScale].
 */
export let BIOME_LENGTH = 210
export const START_X = 16 // first carrots and logs appear after this

export const BIOMES = [
  {
    id: 'meadow',
    emoji: '🌼',
    sky: ['#5fb8ff', '#d9f2ff'],
    fog: '#d4efff',
    ground: '#8fd65a',
    path: '#efcf92',
    hills: ['#79c95a', '#9bd96b', '#6bbf63'],
    hemi: ['#e6f6ff', '#6aa84f'],
    sun: ['#fff1d6', 2.6],
    recolor: {
      canopy: ['#6cc644', '#7fd34e', '#58b83c'],
      bush: ['#58b33a'],
      grass: ['#7bd14b'],
      pine: ['#2f9e5b'],
      petal: ['#ff6b9d', '#ffd23f', '#ffffff', '#b28dff', '#ff8a3d'],
      wing: ['#ffb703', '#ff6b9d', '#7ad3ff'],
    },
    weather: 'petals',
    dust: '#f0dcb4', // the puffs kicked up by Pip's feet
    hillTrees: ['tree_pine', 'tree_round'], // dotted on the near hills (picked at random)
    butterflies: 3,
    // the things on the path to hop over (or bounce off the top of)
    obstacles: ['log', 'rock', 'stump'],
    favour: { bubbles: 2.5, puddle: 2, ground: 1.3 }, // patterns this place has more of (see Course.pattern)
    near: [['grass', 4, 0.9, 1.4], ['flower', 3, 0.8, 1.2]],
    side: [['fence', 3, 1, 1], ['bush', 2, 0.7, 1], ['flower', 2, 1, 1.3]],
    mid: [['tree_round', 5, 0.8, 1.15], ['bush', 2, 1, 1.4], ['tree_pine', 1, 0.8, 1]],
    back: [['tree_round', 3, 1.1, 1.5], ['tree_pine', 1, 1, 1.4]],
  },
  {
    id: 'grove',
    emoji: '🍄',
    sky: ['#8f86ff', '#ffd1ea'],
    fog: '#ecd3f2',
    ground: '#74c98f',
    path: '#e3c39a',
    hills: ['#5aa982', '#7dbf8e', '#6fa7a0'],
    hemi: ['#f3e2ff', '#4f8f73'],
    sun: ['#ffe4f3', 2.2],
    recolor: {
      canopy: ['#3fb68b', '#55c4a0'],
      bush: ['#34a382'],
      grass: ['#6ad39a'],
      pine: ['#2b8f73'],
      petal: ['#7ae3ff', '#ff9de2', '#c3a6ff'],
      wing: ['#7ae3ff', '#c3a6ff'],
    },
    weather: 'fireflies',
    dust: '#f0dcb4', // the puffs kicked up by Pip's feet
    hillTrees: [], // dotted on the near hills (picked at random)
    butterflies: 2,
    obstacles: ['toadstool', 'stump', 'rock'],
    favour: { spring: 2.5, chain: 1.6, bubbles: 1.5 }, // patterns this place has more of (see Course.pattern)
    near: [['grass', 3, 0.9, 1.3], ['flower', 2, 0.8, 1.1]],
    side: [['bush', 2, 0.7, 1], ['flower', 3, 1, 1.3], ['grass', 2, 1, 1.3]],
    mid: [['mushroom_red', 4, 0.8, 1.3], ['mushroom_blue', 4, 0.9, 1.4], ['tree_round', 2, 0.9, 1.1], ['toadstool', 1, 1.2, 1.6]],
    back: [['mushroom_blue', 2, 1.6, 2.2], ['mushroom_red', 2, 1.5, 2.1], ['tree_pine', 2, 1.1, 1.4]],
  },
  {
    id: 'autumn',
    emoji: '🍂',
    sky: ['#6fbcff', '#ffe2b8'],
    fog: '#ffe6c8',
    ground: '#c9c45c',
    path: '#dca866',
    hills: ['#d99a3a', '#c7b04a', '#e0803a'],
    hemi: ['#fff1dc', '#9a7a3a'],
    sun: ['#ffd9a8', 2.6],
    recolor: {
      canopy: ['#ff8c2a', '#ffb83a', '#e8513a', '#f2c230'],
      bush: ['#d9662e'],
      grass: ['#c9b54a'],
      pine: ['#3f8a4f'],
      petal: ['#ff6b4a', '#ffd23f'],
      wing: ['#ff8c2a', '#ffd23f'],
    },
    weather: 'leaves',
    dust: '#f0dcb4', // the puffs kicked up by Pip's feet
    hillTrees: ['tree_pine', 'tree_round'], // dotted on the near hills (picked at random)
    butterflies: 2,
    obstacles: ['pumpkin', 'log', 'stump'],
    favour: { roller: 4, puddle: 1.6, stairs: 1.4 }, // patterns this place has more of (see Course.pattern)
    near: [['grass', 4, 0.9, 1.3]],
    side: [['fence', 3, 1, 1], ['bush', 3, 0.7, 1]],
    mid: [['tree_round', 6, 0.85, 1.2], ['tree_pine', 2, 0.9, 1.1], ['pumpkin', 2, 1, 1.4]],
    back: [['tree_round', 3, 1.1, 1.5], ['tree_pine', 2, 1.1, 1.5]],
  },
  {
    id: 'snow',
    emoji: '❄️',
    // a deep blue sky and cool blue snow, so white snowmen and snowy trees stand out
    sky: ['#4aa8f5', '#e2f2ff'],
    fog: '#e4f0fc',
    ground: '#cfe0f4',
    path: '#5786bd', // a trodden blue track, darker than the snow either side
    hills: ['#ffffff', '#e3eefa', '#cfe2f5'],
    hemi: ['#ffffff', '#88a9d0'],
    sun: ['#ffffff', 2.3],
    recolor: {
      bush: ['#a6cdb8'],
      grass: ['#d0e8f2'],
      pine: ['#2f8a68'],
      petal: ['#ffffff', '#bfe6ff'],
      wing: ['#bfe6ff'],
      moss: ['#ffffff'],
    },
    weather: 'snow',
    dust: '#ffffff', // the puffs kicked up by Pip's feet
    hillTrees: ['tree_pine_snow', 'tree_pine_snow', 'tree_round_snow'], // dotted on the near hills (picked at random)
    butterflies: 0,
    obstacles: ['snowman', 'rock', 'log'],
    favour: { brook: 4, flip: 1.5, stairs: 1.4 }, // patterns this place has more of (see Course.pattern)
    near: [['grass', 3, 0.8, 1.2]],
    side: [['tree_pine_snow', 2, 0.4, 0.55], ['fence', 2, 1, 1], ['bush', 1, 0.7, 1]],
    mid: [['tree_pine_snow', 6, 0.8, 1.25], ['tree_round_snow', 2, 0.9, 1.1]],
    back: [['tree_pine_snow', 4, 1.1, 1.6]],
  },
]

export let JOURNEY = BIOMES.length * BIOME_LENGTH
export let HOME_X = JOURNEY + 10

const ORDER = [...BIOMES]
/**
 * Each trip visits the places in a new order, so Pip's burrow (at the end of the last place) sits
 * in the meadow, the grove, the autumn woods or the snow: the snow comes last only about a third of
 * the time.
 * The order is chosen as the menu shows, so the menu is the first place.
 */
export function shuffleTrip() {
  const mix = (list) => list.map((b) => [Math.random(), b]).sort((p, q) => p[0] - q[0]).map(([, b]) => b)
  const roll = () => (Math.random() < 0.15 ? [...mix(ORDER.slice(0, 3)), ORDER[3]] : mix(ORDER))
  // never the same route twice running, and never starting where the last trip started
  let order = roll()
  while (order[0] === BIOMES[0]) order = roll()
  BIOMES.splice(0, BIOMES.length, ...order)
}

export function biomeIndexAt(x) {
  return clamp(Math.floor(x / BIOME_LENGTH), 0, BIOMES.length - 1)
}

/** Hop-over obstacles: half width along the path and height, for the (forgiving) hit test. */
export const OBSTACLES = {
  log: { w: 0.34, h: 0.68 },
  rock: { w: 0.5, h: 0.62 },
  stump: { w: 0.42, h: 0.57 },
  toadstool: { w: 0.3, h: 0.75 },
  pumpkin: { w: 0.45, h: 0.6 },
  snowman: { w: 0.3, h: 0.85 },
}


/** Little hoppers visit the same four places on a shorter route. */
export function setTripLength(gentle) {
  BIOME_LENGTH = gentle ? 78 : 210
  JOURNEY = BIOMES.length * BIOME_LENGTH
  HOME_X = JOURNEY + 10
}
