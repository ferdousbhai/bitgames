// A deliberately simplified artist's red/yellow/blue toy model. It is not a
// spectral pigment simulation or coloured-light mixing. Relative drop counts
// interpolate eight authored paint colours; actual paints vary by pigment.

// The corners of a red/yellow/blue cube: bit 1 = red, bit 2 = yellow, bit 4 = blue.
const CORNERS = [
  [255, 249, 235], // none: paper white
  [235, 80, 99], // red
  [248, 214, 78], // yellow
  [240, 153, 62], // red + yellow: orange
  [78, 138, 213], // blue
  [160, 104, 185], // red + blue: purple
  [95, 172, 112], // yellow + blue: green
  [122, 82, 54], // all three: earthy brown
]
export const MAX_DROPS = 12
const sum = (numbers) => numbers.reduce((a, b) => a + b, 0)

/** Mixes three drop counts [red, yellow, blue] into { hex, name, drops }. */
export function mixToyPaint(drops) {
  const valid = drops.length === 3 && drops.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_DROPS) && sum(drops) <= MAX_DROPS
  if (!valid) throw new RangeError('Use three bounded drop counts.')
  const max = Math.max(...drops)
  if (!max) return { hex: '#fff9eb', name: 'Empty cup', drops: 0 }

  // Trilinear interpolation between the corners, by each paint's share of the strongest.
  const [r, y, b] = drops.map((n) => n / max)
  const channels = [0, 0, 0]
  CORNERS.forEach((corner, index) => {
    const weight = (index & 1 ? r : 1 - r) * (index & 2 ? y : 1 - y) * (index & 4 ? b : 1 - b)
    corner.forEach((channel, j) => { channels[j] += channel * weight })
  })
  const used = drops.filter((n) => n > 0).length
  // Any drop of the third paint muddies a mixture, as real paint does: three-paint mixtures sit
  // close to brown, tinted by whichever paint there is more of (1 red, 1 yellow, 2 blue is a bluish
  // brown, not a slate blue). The less even the recipe, the more of the strongest paint shows.
  if (used === 3) {
    const pull = 0.25 + 0.75 * Math.min(r, y, b)
    channels.forEach((channel, j) => { channels[j] = channel + (CORNERS[7][j] - channel) * pull })
  }
  const hex = '#' + channels.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')

  let name
  if (used === 3) name = 'Earthy mixture'
  else if (used === 1) name = ['Red', 'Yellow', 'Blue'][drops.findIndex((n) => n > 0)]
  else if (!r) name = 'Green mixture'
  else if (!y) name = 'Purple mixture'
  else name = 'Orange mixture'
  return { hex, name, drops: sum(drops) }
}
