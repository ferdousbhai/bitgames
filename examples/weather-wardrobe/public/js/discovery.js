import * as THREE from 'three'
import { colourHex } from './challenges.js'

const activities = { match, sort, pattern, order, compare, memory, echo }

export function runDiscovery(c, g, a) {
  const run = activities[c.mode]
  if (!run) return false
  run(c, g, a)
  return true
}

// Hop an object to a new place along a small arc.
function move(a, root, to) {
  const from = root.position.clone()
  a.animate(0.65, (t) => {
    root.position.lerpVectors(from, to, t)
    root.position.y += Math.sin(t * Math.PI) * 0.5
  }, root)
}

// --- Match: deliver the piece that matches a request ---------------------------------

function match(c, g, a) {
  const goal = new THREE.Vector3(0, 0.3, -1.7)
  let done = false
  const doorPanels = []

  if (c.variant === 'colour') {
    a.actor('house', 1.7, 0, -2.3)
    a.place(a.block(1, 0.8, 0.8, colourHex[c.target]), 0, 0.7, -1.4)
    a.place(a.block(0.62, 0.08, 0.05, '#605674'), 0, 0.78, -0.975)
  } else if (c.variant === 'shape') {
    // Reuse the shipped castle; a working gate makes the key's purpose visible.
    a.actor('castle', 2.6, 0, -2.45)
    a.place(a.block(1.7, 1.45, 0.15, '#544566'), 0, 0.9, -1.5)
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group()
      hinge.position.set(side * 0.8, 0.9, -0.98)
      a.board.add(hinge)
      const panel = a.block(0.8, 1.4, 0.11, '#d69a5a')
      panel.position.x = -side * 0.4
      hinge.add(panel)
      doorPanels.push({ hinge, side })
    }
    a.place(a.block(1.1, 0.85, 0.15, '#ffe0a0'), 0, 1.7, -0.88)
    const lock = a.shape(c.target, '#544566', 0.8)
    lock.name = 'shape-lock'
    lock.rotation.x = Math.PI / 2
    a.place(lock, 0, 1.7, -0.77)
    goal.set(0, 1.5, -0.72)
    const treasure = a.actor('gem', 0.45, 0, -1.28, 0.38)
    treasure.name = 'castle-treasure'

  } else if (c.variant === 'shadow') {
    a.place(a.block(2.7, 0.08, 2.7, '#fff0d4'), 0, 0.2, -1.7)
    const shadow = a.actor(c.target, 1.7, 0, -1.7, 0.25)
    const silhouette = a.material('#000000')
    silhouette.metalness = 1
    silhouette.roughness = 1
    silhouette.emissive.set('#51455f')
    silhouette.emissiveIntensity = 1
    shadow.traverse((o) => { if (o.isMesh) o.material = silhouette })
    const lamp = a.place(a.mesh(new THREE.ConeGeometry(0.25, 0.5, 16), '#d6b78a'), -2.4, 0.7, -1.5)
    lamp.rotation.z = -Math.PI / 3
  } else {
    drawTracks(a, c.target)
  }

  const cards = a.grid(c.tiles, (value) => ({
    model: c.variant === 'tracks' || c.variant === 'shadow' ? value : c.variant === 'colour' ? 'parcel' : undefined,
    shape: c.variant === 'shape' ? value : undefined,
    tint: c.variant === 'colour' ? colourHex[value] : undefined,
    colour: c.variant === 'colour' ? colourHex[value] : '#fff0df',
    label: c.variant === 'tracks' && value === 'bird' ? 'songbird' : String(value),
    onTap: () => choose(value),
  }), { spacing: 1.85, z: 1.45, size: c.variant === 'tracks' ? 1.7 : 1.5, depth: 1.45 })

  if (c.variant === 'tracks') {
    for (const [i, card] of cards.entries()) {
      if (c.tiles[i] === 'bird') card.button.querySelector('.label').style.paddingInline = '2px'
    }
  }

  if (c.variant === 'shape') {
    // Each key has an unmistakable shape head; stems and teeth are identical.
    for (const card of cards) {
      const head = card.figure
      const key = new THREE.Group()
      head.position.set(0, 0, 0)
      head.scale.setScalar(0.8)
      head.material = a.material('#865fa5')
      key.add(head)
      const shaft = a.block(0.13, 0.12, 0.65, '#efbd64')
      shaft.position.set(0, 0, 0.58)
      key.add(shaft)
      for (const z of [0.62, 0.82]) {
        const tooth = a.block(0.28, 0.12, 0.12, '#efbd64')
        tooth.position.set(0.09, 0, z)
        key.add(tooth)
      }
      card.group.add(key)
      key.position.y = 0.28
      card.figure = key
    }
  }

  function choose(value) {
    if (done) return
    if (value !== c.target) {
      a.feedback(c.variant === 'tracks'
        ? 'Compare the toes, the webbing, or the trail. Try another animal.'
        : c.variant === 'colour'
          ? `That parcel is ${value.toLowerCase()}. Find the ${c.target.toLowerCase()} parcel for this mailbox.`
          : c.variant === 'shape'
            ? `Look at the lock. Find the ${c.target.toLowerCase()} key.`
            : 'Look at the silhouette’s outline. Try another toy.')
      return
    }
    done = true
    const card = cards[c.tiles.indexOf(value)]
    // Moving a separate holder preserves the card's native accessible target.
    const carrier = new THREE.Group()
    a.board.add(carrier)
    carrier.position.copy(card.group.position)
    carrier.add(card.figure)
    card.figure.position.set(0, 0.2, 0)
    move(a, carrier, goal)
    if (c.variant === 'shape') {
      a.animate(0.65, (t) => { card.figure.rotation.x = t * Math.PI / 2 })
      a.later(() => {
        for (const { hinge, side } of doorPanels) {
          a.animate(0.6, (t) => { hinge.rotation.y = side * t * 1.25 })
        }
      }, 650)
    }
    card.enable(false)
    const fallback = c.variant === 'colour'
      ? `The ${c.target.toLowerCase()} parcel reached its matching mailbox!`
      : c.variant === 'shape' ? 'The key fits. The castle door opens!' : 'Your puppet matches its shadow!'
    a.later(() => a.success(c.fact || fallback), c.variant === 'shape' ? 1300 : 750)
  }

  // Dragging shows a copy of the piece; dropping it near the request chooses it.
  for (const [i, card] of cards.entries()) {
    let ghost = null
    const hideGhost = () => { if (ghost) ghost.visible = false }
    a.onDrag(card, {
      move: (p) => {
        if (done) return
        if (!ghost) {
          ghost = new THREE.Group()
          ghost.add(card.figure.clone(true))
          a.board.add(ghost)
        }
        ghost.visible = true
        ghost.position.set(p.x, 0.45, p.z)
      },
      drop: (p) => {
        hideGhost()
        // The raised castle lock needs a screen-space drop, since drag points
        // meet the board plane rather than the lock's vertical face.
        const point = c.variant === 'shape' ? a.screenPoint(p) : null
        const lock = c.variant === 'shape' ? a.screenPoint({ x: goal.x, y: goal.y + 0.2, z: goal.z }) : null
        const edge = c.variant === 'shape' ? a.screenPoint({ x: goal.x + 0.6, y: goal.y + 0.2, z: goal.z }) : null
        const near = c.variant === 'shape'
          ? Math.hypot(point.x - lock.x, point.y - lock.y) < Math.max(32, Math.abs(edge.x - lock.x))
          : Math.hypot(p.x - goal.x, p.z - goal.z) < 1.6
        if (near) choose(c.tiles[i])
      },
      cancel: hideGhost,
    })
  }

  a.hint(c.variant === 'tracks'
    ? 'Look at the marks. Tap their animal, or carry it to the tracks.'
    : c.variant === 'colour'
      ? 'Match the parcel to the mailbox colour. Tap a parcel, or carry it to the mailbox.'
      : c.variant === 'shape'
        ? 'Match the key shape to the castle lock. Tap a key, or carry it to the lock.'
        : 'Look at the silhouette. Tap the matching toy, or carry it to the stage.')
}

// Authored track silhouettes communicate the clue without a text label.
function drawTracks(a, animal) {
  const colour = '#b99586'
  if (animal === 'snail') {
    const points = Array.from({ length: 35 }, (_, i) => new THREE.Vector3(-2 + i / 8, 0.17, -1.5 + Math.sin(i / 4) * 0.12))
    const curve = new THREE.CatmullRomCurve3(points)
    a.board.add(a.mesh(new THREE.TubeGeometry(curve, 48, 0.065, 6, false), '#bfd69b'))
    return
  }
  const pad = (x, z, radius) => a.place(a.mesh(new THREE.CylinderGeometry(radius, radius, 0.04, 16), colour), x, 0.15, z)
  for (let i = 0; i < 4; i++) {
    const x = -1.8 + i * 1.15
    const z = -1.7 + (i % 2) * 0.35
    if (animal === 'fox') {
      pad(x, z, 0.13)
      for (const dx of [-0.22, -0.075, 0.075, 0.22]) pad(x + dx, z - (Math.abs(dx) < 0.1 ? 0.29 : 0.22), 0.065)
      continue
    }
    if (animal === 'duck') {
      // A webbed fan joins three splayed toes; three visible tips avoid an arrow cue.
      const outline = new THREE.Shape()
      outline.moveTo(-0.07, -0.04)
      outline.lineTo(-0.10, 0.08)
      outline.lineTo(-0.225, 0.30)
      outline.quadraticCurveTo(-0.25, 0.35, -0.21, 0.345)
      outline.lineTo(-0.075, 0.29)
      outline.lineTo(-0.025, 0.425)
      outline.quadraticCurveTo(0, 0.47, 0.025, 0.425)
      outline.lineTo(0.075, 0.29)
      outline.lineTo(0.21, 0.345)
      outline.quadraticCurveTo(0.25, 0.35, 0.225, 0.30)
      outline.lineTo(0.10, 0.08)
      outline.lineTo(0.07, -0.04)
      outline.closePath()
      const web = new THREE.ExtrudeGeometry(outline, { depth: 0.035, bevelEnabled: false })
      web.rotateX(-Math.PI / 2)
      a.place(a.mesh(web, colour), x, 0.145, z)
    }
    else {
      for (const dx of [-0.17, 0, 0.17]) {
        const toe = a.place(a.block(0.045, 0.045, 0.35, colour), x + dx / 2, 0.15, z - 0.1)
        toe.rotation.y = dx * 2.5
      }
      a.place(a.block(0.055, 0.045, 0.25, colour), x, 0.15, z + 0.16)
    }
  }
}

// --- Sort: carry each toy to its home --------------------------------------------------

function sort(c, g, a) {
  const labelOf = (item) => g.props[item]?.label || item
  const done = new Set()
  const history = []
  const counts = c.bins.map(() => 0)
  const status = a.readout(`0 / ${c.items.length} delivered`)
  const showCount = () => { status.textContent = `${done.size} / ${c.items.length} delivered` }
  let selected = null

  const bins = c.bins.map((bin, i) => {
    const target = a.tile({
      x: (i - (c.bins.length - 1) / 2) * 2.35,
      z: -1.7,
      size: 2,
      depth: 2.1,
      colour: i % 2 ? '#dec8ea' : '#cee0bd',
      label: bin,
      onTap: () => {
        if (selected === null) {
          a.feedback('Choose a toy first, then its home.')
          return
        }
        deliver(selected, i)
      },
    })
    target.group.name = `sorting-destination-${i}`
    decorateBin(a, g.id, target.group, i)
    return target
  })

  const toys = []
  const cards = c.items.map(([item], i) => {
    const x = (i % 3 - 1) * 2.05
    const z = 0.65 + Math.floor(i / 3) * 1.25
    const toy = a.actor(g.props[item]?.model || item, 0.67, x, z)
    toy.userData.home = toy.position.clone()
    toys.push(toy)
    const card = a.tile({
      x, z, size: 1.55, depth: 1.1, label: labelOf(item),
      onTap: () => {
        if (done.has(i)) return
        selected = i
        cards.forEach((other, j) => other.select(i === j))
        a.audio.speak(labelOf(item))
      },
    })
    a.onDrag(card, {
      move: (p) => { if (!done.has(i)) toy.position.set(p.x, 0.45, p.z) },
      drop: (p) => {
        if (done.has(i)) return
        const bin = bins.findIndex((t) => Math.abs(p.x - t.x) < 1.05 && Math.abs(p.z - t.z) < 1.2)
        if (bin >= 0) deliver(i, bin)
        else move(a, toy, toy.userData.home)
      },
      cancel: () => { if (!done.has(i)) move(a, toy, toy.userData.home) },
    })
    return card
  })

  function deliver(i, bin) {
    if (done.has(i)) return
    const [item, correct] = c.items[i]
    if (correct !== c.bins[bin]) {
      a.feedback(`Try another home for ${labelOf(item)}.`)
      move(a, toys[i], toys[i].userData.home)
      return
    }
    done.add(i)
    history.push(i)
    toys[i].userData.bin = bin
    // Delivered toys stack two abreast inside their home.
    const n = counts[bin]++
    move(a, toys[i], new THREE.Vector3(bins[bin].x + (n % 2 - 0.5) * 0.58, 0.32, -1.7 + Math.floor(n / 2) * 0.4))
    cards[i].enable(false)
    cards[i].select(false)
    cards[i].label('✓')
    selected = null
    bins[bin].group.userData.count = counts[bin]
    showCount()
    a.audio.happy()
    a.feedback(`${labelOf(item)} belongs with ${correct.toLowerCase()}.`, true)
    if (done.size === c.items.length) {
      a.later(() => { if (done.size === c.items.length) a.success(c.fact) }, 700)
    }
  }

  a.action('⌫ Undo delivery', () => {
    if (!history.length) return
    const i = history.pop()
    const bin = toys[i].userData.bin
    done.delete(i)
    counts[bin]--
    bins[bin].group.userData.count = counts[bin]
    cards[i].enable(true)
    cards[i].label(labelOf(c.items[i][0]))
    move(a, toys[i], toys[i].userData.home)
    showCount()
  })
  a.action('↶ Reset', () => a.reset())
  a.hint('Carry a toy to its home, or tap a toy and then its home. Undo a delivery to explore again.')
}

function decorateBin(a, id, group, i) {
  if (id === 'habitat-hotel') {
    a.place(a.model('house', 0.8), 0, 0.2, -0.6, group)
    a.place(a.block(1.7, 0.035, 0.5, ['#94cddc', '#9bbd8c'][i] || '#e8c19c'), 0, 0.2, 0.4, group)
  } else if (id === 'recycling-robots') {
    a.place(a.model('robot', 0.6), 0, 0.2, -0.6, group)
  } else if (id === 'fruit-veggie-ferry') {
    a.place(a.model('boat', 0.65), 0, 0.2, -0.6, group)
  } else if (id === 'season-suitcase') {
    a.place(a.block(1.6, 0.35, 1.4, i ? '#b6cce4' : '#e9bd91'), 0, 0.27, 0, group)
    a.place(a.mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 16), '#877b97'), 0, 0.55, -0.65, group)
  }
}

// --- Pattern: fill the gap in a repeating or growing row -------------------------------

const patternModels = { '🦋': 'butterfly', '🌸': 'flower', '🌿': 'leaf', '🚃': 'train', '📦': 'parcel', '🌳': 'tree' }
const beadColours = { '🔴': '#ee939b', '🔵': '#89bde1', '🟡': '#edcf83' }

function pattern(c, g, a) {
  const row = new THREE.Group()
  a.board.add(row)
  const length = c.pattern.length
  const spacing = Math.min(1.12, 7 / length)
  const numberLabel = (value) => typeof value === 'number' ? String(value) : ''
  let done = false

  // Puts the 3D token for a pattern value on a tile.
  function addToken(group, value) {
    const token = g.id === 'bead-bridge'
      ? a.mesh(new THREE.SphereGeometry(0.32, 16, 8), beadColours[value])
      : a.model(patternModels[value] || 'star', 0.58)
    token.position.y = 0.23
    group.add(token)
    return token
  }

  const slots = c.pattern.map((value, i) => {
    const slot = a.tile({
      x: (i - (length - 1) / 2) * spacing,
      z: -1.2,
      size: 0.8,
      depth: 0.95,
      label: i === c.gap ? '?' : numberLabel(value),
      colour: i === c.gap ? g.accent : '#fff2df',
      visual: true,
    })
    row.add(slot.group)
    if (i !== c.gap) addToken(slot.group, value)
    return slot
  })
  if (g.id === 'constellation-code') {
    a.board.add(a.polyline(slots.map((t) => new THREE.Vector3(t.x, 0.14, -1.2)), '#c8c4ea'))
  }
  if (g.id === 'bead-bridge') {
    const deck = a.block(7.4, 0.12, 0.45, '#d7bb97')
    deck.position.set(0, 0.1, -1.2)
    row.add(deck)
  }

  const choices = a.grid(c.tiles, (value) => ({
    label: numberLabel(value),
    size: 1.55,
    depth: 1.55,
    onTap: () => {
      if (done) return
      if (value !== c.target) {
        a.feedback('Say the pattern from the beginning. What belongs in the empty place?')
        return
      }
      done = true
      const token = addToken(slots[c.gap].group, value)
      slots[c.gap].label(numberLabel(value))
      const scale = token.scale.x
      a.animate(0.8, (t) => token.scale.setScalar(scale * (0.15 + 0.85 * t)), token)
      if (g.id === 'bead-bridge') {
        const snail = a.actor('snail', 0.45, -3.5, -1.2, 0.3)
        move(a, snail, new THREE.Vector3(3.5, 0.3, -1.2))
      }
      if (g.id === 'train-carriage-rhythm') a.animate(1, (t) => { row.position.x = t * 1.2 })
      if (g.id === 'butterfly-patterns') a.animate(1, (t) => { row.position.y = Math.sin(t * Math.PI) * 0.4 })
      a.success(c.fact)
    },
  }), { spacing: 2.05, z: 1.5 })
  choices.forEach((t, i) => {
    addToken(t.group, c.tiles[i])
    t.button.setAttribute('aria-label', String(c.tiles[i]))
  })

  a.hint(g.kind === 'number'
    ? 'Find the same number step between neighbours. Fill the gap.'
    : 'Find the part that repeats. Look on both sides of the empty place.')
}

// --- Order: tell a life cycle or routine from beginning to end -------------------------

function order(c, g, a) {
  const chosen = []
  const status = a.readout('Beginning → middle → end')
  const timeline = c.stages.map((_, i) => a.tile({
    x: (i - 1.5) * 1.8, z: -1.8, size: 1.5, depth: 1.5, visual: true, label: String(i + 1), colour: '#dfebd0',
  }))

  c.tiles.forEach((stage, i) => {
    const index = c.stages.indexOf(stage)
    const x = (i % 2 - 0.5) * 3.2
    const z = 0.1 + Math.floor(i / 2) * 1.5
    const model = a.actor(g.lifeModels[index], 0.85, x, z)
    const card = a.tile({
      x, z, size: 2.5, depth: 1.4, label: stage,
      onTap: () => {
        if (chosen.includes(stage)) return
        if (index !== chosen.length) {
          a.feedback('What comes before that? Choose the next stage of the story.')
          return
        }
        chosen.push(stage)
        card.enable(false)
        card.select(true)
        move(a, model, new THREE.Vector3(timeline[index].x, 0.25, -1.8))
        // Stage labels start with an emoji; the readout keeps only the words.
        status.textContent = chosen.map((s) => s.split(' ').slice(1).join(' ')).join(' → ')
        a.audio.speak(g.stageFacts[index])
        if (chosen.length === c.stages.length) a.later(() => a.success(c.fact), 750)
      },
    })
  })

  a.action('↶ Reset', () => a.reset())
  a.hint('Watch the models as the story grows. Choose its first stage, then what happens next.')
}

// --- Compare: find the biggest, longest, deepest or largest ----------------------------

function compare(c, g, a) {
  const hints = {
    size: 'Compare from the same ground line.',
    length: 'Start both ribbons at the same mark.',
    depth: 'Look at the shared surface line above all the fish.',
    number: 'Count the passengers or compare the cloud numbers.',
  }
  const successes = {
    size: () => `You found the ${c.greater ? 'biggest' : 'smallest'} dinosaur.`,
    length: () => `This ribbon is the ${c.greater ? 'longest' : 'shortest'} from the same starting mark.`,
    depth: () => `${c.greater ? 'The deepest fish is farthest from' : 'The shallowest fish is nearest'} the same surface.`,
    number: (value) => `${value} is ${c.greater ? 'more' : 'fewer'} than the other passenger counts.`,
  }

  if (c.variant === 'depth') {
    const tank = a.block(7.4, 0.05, 4.4, '#9ed7de')
    tank.position.y = 0.05
    a.board.add(tank)
    a.board.add(a.polyline([new THREE.Vector3(-3.7, 0.22, -2), new THREE.Vector3(3.7, 0.22, -2)], '#fff4d6'))
    a.tile({ x: 0, z: -2.5, label: 'Water surface', visual: true, thin: true, size: 2 }).base.visible = false
  }

  const roots = []
  const cards = a.grid(c.values, (value, i) => ({
    label: c.variant === 'number' ? String(value) : '',
    size: 1.7,
    depth: c.variant === 'depth' ? 3.8 : 2.5,
    onTap: () => {
      if (value !== c.target) {
        a.feedback(hints[c.variant])
        return
      }
      a.animate(0.8, (t) => { roots[i].position.y = 0.22 + Math.sin(t * Math.PI) * 0.5 }, roots[i])
      a.success(successes[c.variant](value))
    },
  }), { spacing: 2.05, z: 0 })

  for (const [i, t] of cards.entries()) {
    const v = c.values[i]
    const root = new THREE.Group()
    root.position.set(t.x, 0.22, 0)
    a.board.add(root)
    roots.push(root)
    if (c.variant === 'size') root.add(a.model('dino', 0.6 + v * 0.34))
    if (c.variant === 'number') {
      root.add(a.model('cloud', 1.4))
      for (let n = 0; n < v; n++) {
        const passenger = a.mesh(new THREE.SphereGeometry(0.09, 10, 6), n % 2 ? '#edc584' : '#a5b8db')
        passenger.position.set((n % 4 - 1.5) * 0.26, 0.55 + Math.floor(n / 4) * 0.2, 0.1)
        root.add(passenger)
      }
    }
    if (c.variant === 'length') {
      const ruler = a.block(0.08, 0.08, 2.25, '#bdb2c9')
      ruler.position.set(-0.55, 0, 0)
      const ribbon = a.block(0.38, 0.09, v * 0.53, g.accent)
      ribbon.position.set(0, 0.12, -1.1 + v * 0.53 / 2)
      const start = a.block(1.05, 0.04, 0.06, '#6e6683')
      start.position.z = -1.1
      root.add(ruler, ribbon, start)
    }
    if (c.variant === 'depth') {
      const fish = a.model('fish', 0.6)
      fish.position.z = -1.8 + v * 0.85
      root.add(fish)
      t.base.visible = false
    }
    t.button.setAttribute('aria-label', c.variant === 'number' ? String(v) : `${c.variant === 'depth' ? 'Fish' : 'Choice'} ${i + 1}`)
  }

  if (c.variant === 'size') {
    a.board.add(a.polyline([new THREE.Vector3(-4, 0.2, 0.55), new THREE.Vector3(4, 0.2, 0.55)], '#a39171'))
  }
}

// --- Memory: turn over cards to find pairs ---------------------------------------------

const cardNames = {
  '🍎': 'apple', '🍐': 'pear', '🍓': 'strawberry', '🥕': 'carrot', '🍋': 'lemon', '🍇': 'grapes',
  '🧑‍🍳': 'chef', '🥣': 'mixing bowl', '🧑‍🌾': 'gardener', '🌱': 'seedling', '🧑‍🎨': 'painter', '🖌️': 'paintbrush',
  '🧑‍🚒': 'firefighter', '🚒': 'fire engine', '🧑‍🔧': 'mechanic', '🔧': 'spanner', '🧑‍✈️': 'pilot', '✈️': 'aeroplane',
}
const nameOf = (text) => cardNames[text] || text
const planetColours = { Mercury: '#b5b5b9', Venus: '#e7c292', Earth: '#91bce2', Mars: '#d7947e', Jupiter: '#d2b6a2', Saturn: '#e1d0a0' }
const helperColours = { '🧑‍🍳': '#f4ecda', '🧑‍🌾': '#99bd8b', '🧑‍🎨': '#b7a0d2', '🧑‍🚒': '#e29b8e', '🧑‍🔧': '#95b9ce', '🧑‍✈️': '#788ba8' }
const picnicModels = { '🍎': 'apple', '🍐': 'pear', '🍓': 'strawberry' }

// Letter Buddies names a card "big D" or "little d". Speech says each letter on its own, as a
// capital, so a voice reads its name ("ay"), never a word ("uh" for a lone a).
const isLetter = (text) => /^[A-Za-z]$/.test(text)
const letterName = (text) => `${text === text.toUpperCase() ? 'big' : 'little'} ${text}`
const sayLetter = (text) => [text === text.toUpperCase() ? 'Big' : 'Little', text.toUpperCase()]
const capital = (words) => words[0].toUpperCase() + words.slice(1)

// Found pairs: soft colours apart from every memory game's accent and the lilac card cover.
const pairColours = ['#bfdc86', '#93c4ea', '#eda3c0', '#b9a7ee']

function memory(c, g, a) {
  // Picnic Pairs shows only the picture; the other games also name the face-up card.
  const showsName = ['letter-buddies', 'tool-twins', 'planet-pairs'].includes(g.id)
  const letters = c.cards.every((card) => isLetter(card.text))
  const completion = {
    'tool-twins': 'Helpers use different tools for different jobs.',
    'letter-buddies': 'Every big letter found its little-letter buddy!',
  }[g.id] || 'You remembered every pair!'
  const figures = []
  const covers = []
  let open = []
  let busy = false
  let matched = 0
  let misses = 0
  let lastTap = Date.now()

  // A big letter and its little buddy, shown and said together: "Big D, little d."
  const buddies = (i) => {
    const [big, little] = c.cards.filter((card) => card.pair === c.cards[i].pair).map((card) => card.text)
      .sort((x, y) => Number(x !== x.toUpperCase()) - Number(y !== y.toUpperCase()))
    return { big: letterName(big), little: letterName(little), spoken: [...sayLetter(big), ...sayLetter(little)] }
  }

  function reveal(i, show) {
    const name = nameOf(c.cards[i].text)
    figures[i].visible = show
    covers[i].visible = !show
    cards[i].label(show ? (showsName ? name : '') : '?')
    cards[i].button.setAttribute('aria-label', show ? (letters ? letterName(name) : name) : `Hidden card ${i + 1}`)
    cards[i].select(show)
    a.invalidate()
  }

  // A child who stops for a while hears what to do next, once until they tap again.
  const nudge = () => a.later(() => {
    if (matched === cards.length) return
    if (busy || document.hidden || Date.now() - lastTap < 18000) return nudge()
    lastTap = Date.now()
    const text = matched ? 'Turn over two more cards. Show a pair can help you.' : 'Tap a card to turn it over.'
    a.feedback(text)
    nudge()
  }, 20000)
  nudge()

  // Six cards sit in two even rows of three rather than four over two.
  const cards = a.grid(c.cards, (card, i) => ({
    label: '?',
    colour: g.accent,
    onTap: () => {
      if (busy || cards[i].matched || open.includes(i)) return
      lastTap = Date.now()
      reveal(i, true)
      a.audio.speak(letters ? sayLetter(card.text) : nameOf(card.text))
      open.push(i)
      if (open.length < 2) return
      busy = true
      const [x, y] = open
      if (c.cards[x].pair === c.cards[y].pair) {
        cards[x].matched = cards[y].matched = true
        matched += 2
        misses = 0
        const done = matched === cards.length
        if (letters) {
          const pair = buddies(x)
          if (done) a.success(`${capital(pair.big)}, ${pair.little}. ${completion}`, [...pair.spoken, completion])
          else a.feedback(`${capital(pair.big)}, ${pair.little}. Buddies!`, true, [...pair.spoken, 'Buddies!'])
        }
        if (!(letters && done)) a.audio.happy()
        // A found pair hops and takes on its own shared colour, so the two read as one family
        // and stand apart from the next two cards a child turns over.
        for (const i of [x, y]) {
          cards[i].select(false)
          cards[i].base.material.color.set(pairColours[c.cards[x].pair % pairColours.length])
          cards[i].hop()
        }
        a.animate(0.5, (t) => { figures[x].position.y = figures[y].position.y = 0.35 + Math.sin(t * Math.PI) * 0.2 })
        a.later(() => {
          open = []
          busy = false
          if (done && !letters) a.success(completion)
        }, 550)
      } else {
        misses += 1
        const help = misses >= 3 ? ' Show a pair can help you.' : ''
        a.later(() => {
          reveal(x, false)
          reveal(y, false)
          open = []
          busy = false
          if (letters) {
            // Name the buddy the first card is looking for, so a miss still teaches the pair.
            const first = c.cards[x].text
            const partner = c.cards.find((card, i) => i !== x && card.pair === c.cards[x].pair).text
            a.feedback(`${capital(letterName(first))} goes with ${letterName(partner)}. Keep looking!${help}`, false,
              [...sayLetter(first), 'goes with', ...sayLetter(partner), `Keep looking!${help}`])
          } else {
            a.feedback(`Different cards. Now you know where they live.${help}`)
          }
        }, 1000)
      }
    },
  }), { columns: c.cards.length === 6 ? 3 : 4, spacing: 1.65, size: 1.4, depth: 1.5 })

  cards.forEach((t, i) => {
    // A letter card has no picture: its letter fills the card instead.
    if (letters) t.button.classList.add('letter-card')
    const figure = memoryFigure(a, g.id, c.cards[i].text)
    figure.visible = false
    t.group.add(figure)
    figures.push(figure)
    const cloth = a.block(1.25, 0.055, 1.15, g.id === 'picnic-pairs' ? '#c7dbaa' : '#cfbadc')
    cloth.position.y = 0.3
    t.group.add(cloth)
    covers.push(cloth)
  })

  a.action('Show a pair', () => {
    if (busy || open.length) return
    const x = cards.findIndex((t) => !t.matched)
    if (x < 0) return
    const y = c.cards.findIndex((card, i) => i !== x && !cards[i].matched && card.pair === c.cards[x].pair)
    busy = true
    lastTap = Date.now()
    reveal(x, true)
    reveal(y, true)
    if (letters) {
      const pair = buddies(x)
      a.feedback(`Look: ${pair.big} and ${pair.little}. Remember their two places.`, false,
        ['Look.', ...pair.spoken, 'Remember their two places.'])
    } else {
      a.feedback('Look at this pair. Remember its two places.')
    }
    a.later(() => {
      if (!cards[x].matched) {
        reveal(x, false)
        reveal(y, false)
      }
      busy = false
    }, 2200)
  })
  a.action('↶ Reset', () => a.reset())
}

// The hidden picture under a memory card. Letter Buddies has no picture, only the name.
function memoryFigure(a, id, text) {
  const root = new THREE.Group()
  const add = (object, x, y, z = 0) => {
    object.position.set(x, y, z)
    root.add(object)
    return object
  }
  const sphere = (radius, colour, widthSegments = 12, heightSegments = 8) =>
    a.mesh(new THREE.SphereGeometry(radius, widthSegments, heightSegments), colour)

  if (id === 'planet-pairs') {
    root.add(sphere(0.31, planetColours[text], 20, 12))
    if (text === 'Saturn') {
      add(a.mesh(new THREE.TorusGeometry(0.45, 0.035, 8, 28), '#c4b99e'), 0, 0).rotation.x = 1.3
    }
    if (text === 'Earth') {
      for (const [x, y] of [[-0.13, 0.13], [0.17, -0.13]]) add(sphere(0.12, '#9cc99b'), x, y, 0.27).scale.z = 0.35
    }
  } else if (id === 'picnic-pairs') {
    if (picnicModels[text]) {
      root.add(a.model(picnicModels[text], 0.6))
    } else if (text === '🥕') {
      add(a.mesh(new THREE.ConeGeometry(0.13, 0.55, 12), '#eeaa77'), 0, 0.26).rotation.z = Math.PI
      add(a.block(0.2, 0.22, 0.06, '#a7c790'), 0, 0.6)
    } else if (text === '🍋') {
      add(sphere(0.25, '#ebd387', 16), 0, 0).scale.y = 1.25
    } else {
      for (let i = 0; i < 7; i++) add(sphere(0.1, '#ae99cb'), (i % 3 - 1) * 0.15, Math.floor(i / 3) * 0.16)
    }
  } else if (id === 'tool-twins') {
    if (text.startsWith('🧑')) {
      add(sphere(0.18, '#e2b9a0', 16), 0, 0.55)
      add(a.block(0.35, 0.36, 0.22, helperColours[text]), 0, 0.2)
      add(a.mesh(new THREE.CylinderGeometry(0.18, 0.21, text === '🧑‍🍳' ? 0.25 : 0.09, 16), helperColours[text]), 0, 0.76)
    } else if (text === '🥣') {
      add(a.mesh(new THREE.CylinderGeometry(0.3, 0.18, 0.22, 20, 1, true), '#deb1c0'), 0, 0.15)
      add(a.mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.025, 20), '#ead2a2'), 0, 0.25)
    } else if (text === '🌱') {
      add(a.block(0.035, 0.4, 0.035, '#91b890'), 0, 0.25)
      for (const x of [-0.14, 0.14]) add(sphere(0.13, '#91b890'), x, 0.42).scale.set(1, 0.3, 0.65)
    } else if (text === '🖌️') {
      add(a.block(0.06, 0.55, 0.06, '#bb9278'), 0, 0.28)
      add(a.block(0.16, 0.2, 0.1, '#ddb798'), 0, 0.6)
    } else if (text === '🔧') {
      add(a.block(0.09, 0.5, 0.09, '#b5c0cd'), 0, 0.25)
      for (const x of [-0.1, 0.1]) add(a.block(0.065, 0.17, 0.08, '#b5c0cd'), x, 0.56)
      add(a.block(0.22, 0.06, 0.08, '#b5c0cd'), 0, 0.46)
    } else if (text === '🚒') {
      add(a.block(0.55, 0.28, 0.3, '#e69a90'), 0, 0.25)
      for (const x of [-0.19, 0.19]) for (const z of [-0.16, 0.16]) add(sphere(0.08, '#647086'), x, 0.1, z)
      add(a.block(0.5, 0.035, 0.12, '#ddd7cc'), 0, 0.43)
    } else {
      add(a.block(0.1, 0.12, 0.65, '#ece4d4'), 0, 0.3)
      add(a.block(0.6, 0.035, 0.16, '#a6bad2'), 0, 0.3)
      add(a.block(0.25, 0.03, 0.1, '#a6bad2'), 0, 0.4, 0.25)
    }
  }
  root.position.y = 0.35
  return root
}

// --- Echo: copy a sound sequence, or compose a song ------------------------------------

const padColours = ['#d2bfeb', '#a8cfe7', '#b6d8b0', '#edd096']
const moonColours = ['#e7d79e', '#dac2e7', '#b4cbdf']
// Robot dance steps move up, right, down and left on the board.
const danceSteps = [[0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0]]

function echo(c, g, a) {
  const robot = g.id === 'robot-dance-code'
  const song = []
  let input = []
  let playing = false
  let composing = false
  // Read by the browser tests.
  a.board.userData.composition = { song, get composing() { return composing }, get playing() { return playing } }
  const status = a.readout('Watch and listen')
  const figures = []

  const dancerModel = { 'robot-dance-code': ['robot', 1.6], 'sleepy-owl-lullaby': ['owl', 1.5] }[g.id]
  const dancer = dancerModel ? a.actor(...dancerModel, 0, -2) : null
  const rest = dancer?.position.clone()

  function sound(index) {
    const pad = pads[index]
    pad.flash(true)
    a.audio.note(c.notes[index], 0.36, 0, g.id === 'frog-choir' ? 'triangle' : 'sine')
    a.animate(0.45, (t) => { figures[index].position.y = 0.2 + Math.sin(t * Math.PI) * 0.4 }, figures[index])
    if (dancer) {
      const [dx, dz] = robot ? danceSteps[index] : [0, 0]
      a.animate(0.45, (t) => {
        const lift = Math.sin(t * Math.PI)
        dancer.position.set(rest.x + lift * dx, rest.y + lift * 0.18, rest.z + lift * dz)
      }, dancer)
    }
    a.later(() => pad.flash(false), 450)
  }

  function showSong() {
    status.textContent = song.length ? `My song: ${song.map((i) => i + 1).join(' · ')}` : 'Touch sounds to make your song'
  }

  function play() {
    if (playing) return
    const sequence = [...(composing ? song : c.sequence)]
    if (!sequence.length) {
      a.feedback('Touch a sound first to begin your song.')
      return
    }
    playing = true
    input = []
    status.textContent = 'Watch and listen'
    pads.forEach((t) => t.enable(false))
    sequence.forEach((index, i) => a.later(() => {
      sound(index)
      status.textContent = `${i + 1} / ${sequence.length}`
    }, i * 650 + 150))
    a.later(() => {
      playing = false
      pads.forEach((t) => t.enable(true))
      if (composing) {
        showSong()
      } else {
        status.textContent = 'Your turn'
        a.hint('Copy the sounds or the movements. Replay whenever you need.')
      }
    }, sequence.length * 650 + 200)
  }

  const pads = a.grid(c.tokens, (token, i) => ({
    symbol: robot ? token : '',
    colour: padColours[i],
    onTap: () => {
      if (playing) return
      if (composing) {
        if (song.length === 12) {
          a.feedback('Your song has twelve sounds. Undo a sound to try another ending.')
          return
        }
        song.push(i)
        sound(i)
        showSong()
        return
      }
      sound(i)
      if (i !== c.sequence[input.length]) {
        input = []
        status.textContent = 'Start with the first sound'
        a.feedback('Listen again, or replay the demonstration.')
        return
      }
      input.push(i)
      status.textContent = `${input.length} / ${c.sequence.length}`
      if (input.length === c.sequence.length) {
        a.success(robot ? 'Your robot follows the whole dance program!' : 'You remembered the whole song!')
      }
    },
  }), { spacing: 2, z: 0.9, size: 1.55, depth: 1.55 })

  pads.forEach((t, i) => {
    const root = new THREE.Group()
    root.position.y = 0.2
    figures.push(root)
    t.group.add(root)
    if (g.id === 'frog-choir') root.add(a.model('frog', 0.65))
    else if (g.id === 'crystal-cave-echo') root.add(a.model('gem', 0.7))
    else if (g.id === 'sleepy-owl-lullaby') root.add(a.mesh(new THREE.SphereGeometry(0.22, 16, 8), moonColours[i]))
    t.button.setAttribute('aria-label', `${robot ? c.tokens[i] : 'Sound'} ${i + 1}`)
  })

  const replay = a.action('♫ Replay song', () => play())
  a.action('Compose my song', (button) => {
    if (playing) return
    composing = !composing
    input = []
    button.setAttribute('aria-pressed', String(composing))
    a.prompt(composing ? 'Make your own song. Choose its sounds, then listen to it.' : c.prompt)
    replay.textContent = composing ? '♫ Play my song' : '♫ Replay song'
    if (composing) showSong()
    else status.textContent = 'Your turn'
    a.hint(composing
      ? 'Make a song of up to twelve sounds. Replay it or undo the last sound.'
      : 'Copy the demonstration, or replay it whenever you need.')
  }, { pressed: false })
  a.action('⌫ Undo sound', () => {
    if (composing && !playing) {
      song.pop()
      showSong()
    }
  })
  a.action('Clear my song', () => {
    if (composing && !playing) {
      song.length = 0
      showSong()
    }
  })
  a.later(() => { if (!composing && !playing) play() }, 500)
}
