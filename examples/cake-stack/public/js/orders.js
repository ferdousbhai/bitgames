// Each birthday friend orders a pictured cake, listed from the bottom layer to the top.
// Early friends ask for short sequences; later friends ask for repeating patterns
// (AB AB, ABC ABC) that a child can say aloud and predict.

const ORDERS = [
  { layers: ['vanilla', 'strawberry', 'strawberry', 'vanilla'] }, // 🐻
  { layers: ['strawberry', 'vanilla', 'strawberry', 'chocolate'] }, // 🐰
  { layers: ['chocolate', 'lemon', 'vanilla', 'lemon', 'chocolate'] }, // 🐱
  { layers: ['mint', 'chocolate', 'mint', 'chocolate', 'mint', 'chocolate'], unit: 2 }, // 🐶 AB AB AB
  { layers: ['blueberry', 'lemon', 'strawberry', 'mint', 'vanilla'] }, // 🐼
  { layers: ['strawberry', 'lemon', 'rainbow', 'strawberry', 'lemon', 'rainbow'], unit: 3 }, // 🐷 ABC ABC
  { layers: ['blueberry', 'lemon', 'blueberry', 'lemon', 'blueberry', 'lemon'], unit: 2 }, // 🦊
  { layers: ['mint', 'strawberry', 'vanilla', 'mint', 'strawberry', 'vanilla'], unit: 3 }, // 🐥
]

const ALL = ['vanilla', 'strawberry', 'chocolate', 'lemon', 'mint', 'blueberry', 'rainbow']

/** The friend's order for this level: { layers, unit } where unit is the pattern length (0 = no pattern). */
export function orderFor(level, random = Math.random) {
  if (level <= ORDERS.length) {
    const o = ORDERS[level - 1]
    return { layers: [...o.layers], unit: o.unit || 0 }
  }
  // After every friend has visited, each new cake is a fresh repeating pattern.
  const unit = random() < 0.5 ? 2 : 3
  const pool = [...ALL]
  const parts = []
  for (let i = 0; i < unit; i++) parts.push(pool.splice((random() * pool.length) | 0, 1)[0])
  const layers = []
  while (layers.length < 6) layers.push(parts[layers.length % unit])
  return { layers, unit }
}

/** "strawberry, vanilla, strawberry, chocolate" */
export const orderWords = (layers) => layers.join(', ')

export const animalName = (animal) => animal.charAt(0).toUpperCase() + animal.slice(1)
