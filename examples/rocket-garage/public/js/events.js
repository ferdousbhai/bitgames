import * as THREE from 'three'

/**
 * The little things met on the way to each place, built from simple runtime shapes (plus the
 * Moon and the alien from the GLBs): ice crystals near the Comet, glowing hoops near the Ring
 * Planet, a flying saucer near the Alien Planet, and the rare rainbow shooting star.
 */
export function makeEventModels(models, glowTex) {
  const out = {}

  // Moon: a small smiling moonlet to bounce off
  out.moonlet = models.dest_moon.clone()

  // Comet: an icy crystal that counts as two stars
  const ice = new THREE.Group()
  const iceMat = new THREE.MeshStandardMaterial({ color: '#c9f6ff', emissive: '#6fd6ff', emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.92, flatShading: true })
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), iceMat)
  gem.scale.set(0.8, 1.35, 0.8)
  ice.add(gem)
  ice.add(glow(glowTex, '#9fe8ff', 2.2, 0.55))
  out.ice = ice

  // Ring Planet: a glowing hoop, lying nearly flat so the rocket flies up through it
  const hoop = new THREE.Group()
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.13, 10, 56), new THREE.MeshStandardMaterial({ color: '#ffe0b0', emissive: '#ffb76b', emissiveIntensity: 0.45, roughness: 0.4 }))
  const inner = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.06, 8, 56), new THREE.MeshStandardMaterial({ color: '#d9c7ff', emissive: '#a98bff', emissiveIntensity: 0.5, roughness: 0.4 }))
  for (const m of [band, inner]) m.rotation.x = Math.PI / 2 - 0.42
  hoop.add(band, inner)
  out.hoop = hoop

  // Mars: an empty marker; the swirl itself is drawn with dust particles
  out.swirl = new THREE.Group()

  // Alien Planet: a flying saucer with a friend waving in its dome
  const ufo = new THREE.Group()
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14), new THREE.MeshStandardMaterial({ color: '#c9c3e6', metalness: 0.55, roughness: 0.3 }))
  hull.scale.set(1.35, 0.3, 1.35)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.07, 8, 40), new THREE.MeshStandardMaterial({ color: '#8a7fc2', metalness: 0.4, roughness: 0.35 }))
  rim.rotation.x = Math.PI / 2
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#bff7d8', transparent: true, opacity: 0.38, roughness: 0.05, depthWrite: false }))
  dome.position.y = 0.18
  dome.renderOrder = 2
  const rider = models.pilot_alien.clone()
  for (const n of ['alien_body', 'alien_helmet']) {
    const o = rider.getObjectByName(n)
    if (o) o.visible = false
  }
  rider.scale.setScalar(0.62)
  rider.position.y = 0.05
  const lights = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#8ef0c8', emissiveIntensity: 1.2 }))
    l.name = 'ufo_light'
    l.position.set(Math.cos(a) * 1.15, -0.06, Math.sin(a) * 1.15)
    lights.push(l)
  }
  ufo.add(hull, rim, rider, dome, ...lights)
  out.ufo = ufo

  // The rare rainbow shooting star
  const rainbow = new THREE.Group()
  rainbow.add(models.star.clone())
  rainbow.add(glow(glowTex, '#ffffff', 3.4, 0.8))
  out.rainbow = rainbow

  return out
}

function glow(tex, color, size, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }))
  s.scale.setScalar(size)
  return s
}

/**
 * Star pictures for the garage wall. Each dot lights after a few stars are caught; the lines
 * join up when the picture is whole. Points are in a unit square, 0,0 at the bottom left.
 */
export const PICTURES = [
  {
    // a rocket
    dots: [[0.5, 0.96], [0.32, 0.68], [0.68, 0.68], [0.32, 0.3], [0.68, 0.3], [0.12, 0.08], [0.88, 0.08], [0.5, 0.5]],
    lines: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [3, 4], [1, 7], [2, 7]],
    color: '#ffd23f',
  },
  {
    // a cat's face
    dots: [[0.15, 0.95], [0.32, 0.7], [0.68, 0.7], [0.85, 0.95], [0.9, 0.4], [0.5, 0.05], [0.1, 0.4], [0.5, 0.38]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]],
    color: '#ff9f43',
  },
  {
    // a heart
    dots: [[0.5, 0.72], [0.28, 0.95], [0.06, 0.74], [0.18, 0.4], [0.5, 0.06], [0.82, 0.4], [0.94, 0.74], [0.72, 0.95]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0]],
    color: '#ff8fc7',
  },
  {
    // a star
    dots: [[0.5, 0.98], [0.62, 0.64], [0.98, 0.62], [0.7, 0.4], [0.8, 0.04], [0.5, 0.25], [0.2, 0.04], [0.3, 0.4], [0.02, 0.62], [0.38, 0.64]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 0]],
    color: '#8ef0c8',
  },
  {
    // a fish
    dots: [[0.05, 0.5], [0.3, 0.82], [0.62, 0.78], [0.78, 0.5], [0.62, 0.22], [0.3, 0.18], [0.96, 0.85], [0.96, 0.15], [0.25, 0.55]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [3, 6], [6, 7], [7, 3]],
    color: '#3bb5ff',
  },
]
/** Stars caught for each dot of a wall picture. */
export const STARS_PER_DOT = 3

/** Where the stars caught so far have got to: which picture, and how many of its dots are lit. */
export function pictureAt(total) {
  let left = Math.max(0, Math.floor(total / STARS_PER_DOT))
  let n = 0
  for (;;) {
    const pic = PICTURES[n % PICTURES.length]
    if (left < pic.dots.length) return { n, pic, lit: left }
    // A finished picture stays up, whole, until the first dot of the next one
    if (left === pic.dots.length) return { n, pic, lit: left }
    left -= pic.dots.length
    n++
  }
}
