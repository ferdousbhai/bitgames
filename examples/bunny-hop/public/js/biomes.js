import { clamp } from './util.js'

/**
 * The trip home: four places, one after another, then Pip's burrow.
 * Each place recolours the shared models (by material name) and picks its own
 * scenery, obstacles and weather.
 *
 * Scenery entries are [model, weight, minScale, maxScale].
 */
export const BIOME_LENGTH = 210
export const START_X = 16 // first carrots and logs appear after this

export const BIOMES = [
  {
    id: 'meadow',
    name: 'Sunny Meadow',
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
    obstacles: ['log', 'rock', 'log'],
    near: [['grass', 4, 0.9, 1.4], ['flower', 3, 0.8, 1.2]],
    side: [['fence', 3, 1, 1], ['bush', 2, 0.7, 1], ['flower', 2, 1, 1.3]],
    mid: [['tree_round', 5, 0.8, 1.15], ['bush', 2, 1, 1.4], ['tree_pine', 1, 0.8, 1]],
    back: [['tree_round', 3, 1.1, 1.5], ['tree_pine', 1, 1, 1.4]],
  },
  {
    id: 'grove',
    name: 'Mushroom Grove',
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
    obstacles: ['toadstool', 'stump', 'toadstool'],
    near: [['grass', 3, 0.9, 1.3], ['flower', 2, 0.8, 1.1], ['toadstool', 1, 0.35, 0.55]],
    side: [['toadstool', 3, 0.5, 0.9], ['bush', 1, 0.7, 1], ['stump', 1, 0.8, 1]],
    mid: [['mushroom_red', 4, 0.8, 1.3], ['mushroom_blue', 4, 0.9, 1.4], ['tree_round', 2, 0.9, 1.1]],
    back: [['mushroom_blue', 2, 1.6, 2.2], ['mushroom_red', 2, 1.5, 2.1], ['tree_pine', 2, 1.1, 1.4]],
  },
  {
    id: 'autumn',
    name: 'Autumn Woods',
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
    near: [['grass', 4, 0.9, 1.3], ['pumpkin', 1, 0.4, 0.6]],
    side: [['pumpkin', 3, 0.6, 0.9], ['fence', 2, 1, 1], ['bush', 2, 0.7, 1]],
    mid: [['tree_round', 6, 0.85, 1.2], ['tree_pine', 2, 0.9, 1.1]],
    back: [['tree_round', 3, 1.1, 1.5], ['tree_pine', 2, 1.1, 1.5]],
  },
  {
    id: 'snow',
    name: 'Snowy Hills',
    emoji: '❄️',
    sky: ['#8fcfff', '#f4faff'],
    fog: '#eef6ff',
    ground: '#f2f7ff',
    path: '#b4cfe8',
    hills: ['#ffffff', '#e6f1fb', '#d8e9f7'],
    hemi: ['#ffffff', '#9fb8d0'],
    sun: ['#ffffff', 2.3],
    recolor: {
      canopy: ['#e6f3fa'],
      bush: ['#a6cdb8'],
      grass: ['#d0e8f2'],
      pine: ['#2f8a68'],
      petal: ['#ffffff', '#bfe6ff'],
      wing: ['#bfe6ff'],
      moss: ['#ffffff'],
    },
    weather: 'snow',
    dust: '#ffffff', // the puffs kicked up by Pip's feet
    hillTrees: ['tree_pine_snow'], // dotted on the near hills (picked at random)
    butterflies: 0,
    obstacles: ['snowman', 'rock', 'snowman'],
    near: [['grass', 2, 0.8, 1.2]],
    side: [['snowman', 2, 0.6, 0.85], ['rock', 2, 0.6, 1], ['tree_pine_snow', 1, 0.4, 0.55]],
    mid: [['tree_pine_snow', 7, 0.8, 1.25], ['tree_round', 1, 0.9, 1.1]],
    back: [['tree_pine_snow', 4, 1.1, 1.6]],
  },
]

export const JOURNEY = BIOMES.length * BIOME_LENGTH
export const HOME_X = JOURNEY + 10

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
