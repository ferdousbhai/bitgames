import * as THREE from 'three'
import { clockTime, tangramPieces } from './challenges.js'

export function runSpatial(challenge, game, api) {
  if (challenge.mode === 'clock') clock(challenge, game, api)
  else if (challenge.mode === 'rotate') {
    if (challenge.tangram) tangram(challenge, api)
    else rotate(challenge, game, api)
  } else if (challenge.mode === 'fraction') fraction(challenge, game, api)
  else if (challenge.mode === 'mirror') {
    if (challenge.snowflake) snowflake(challenge, game, api)
    else mirror(challenge, game, api)
  } else return false
  return true
}

/** A touch target with no visible base, for labels and hit areas over 3D pieces. */
function hiddenTile(api, options) {
  const tile = api.tile(options)
  tile.base.visible = false
  return tile
}

/** A flat bevelled slab from [x, z] vertices, lying in the board plane. */
function polygon(api, vertices, colour) {
  const shape = new THREE.Shape()
  vertices.forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)))
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.11, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.018, bevelSegments: 1, steps: 1,
  })
  geometry.rotateX(Math.PI / 2)
  return api.mesh(geometry, colour)
}

/** A closed outline through [x, z] points at height y. */
function outline(api, points, y, colour) {
  return api.polyline([...points, points[0]].map(([x, z]) => new THREE.Vector3(x, y, z)), colour)
}

const FULL_TURN = Math.PI * 2
const HANDS = [
  { name: 'clock-hour-hand', length: 1.05, width: 0.15, y: 0.29, colour: '#9d8dce' },
  { name: 'clock-minute-hand', length: 1.6, width: 0.075, y: 0.4, colour: '#edaa77' },
]
const CLOCK_REWARDS = { 'cuckoo-clock-garden': 'bird', 'space-station-schedule': 'rocket', 'bunny-bedtime': 'rabbit', 'bakery-alarm': 'bread' }

function clock(challenge, game, api) {
  const minutesOn = challenge.level > 0
  let hour = 12
  let minute = 0
  let dragHand = null
  let firstPoint = true

  api.place(api.mesh(new THREE.CylinderGeometry(2.25, 2.25, 0.17, 64), '#fff3df'), 0, 0.13, 0)
  const ring = api.place(api.mesh(new THREE.TorusGeometry(2.26, 0.065, 8, 64), game.accent), 0, 0.23, 0)
  ring.rotation.x = Math.PI / 2
  for (let n = 1; n <= 12; n++) {
    const angle = n / 12 * FULL_TURN
    hiddenTile(api, { x: Math.sin(angle) * 1.86, z: -Math.cos(angle) * 1.86, size: 0.32, depth: 0.32, label: String(n), thin: true, visual: true })
  }
  const hands = HANDS.map(({ name, length, width, y, colour }) => {
    const root = new THREE.Group()
    api.place(api.block(width, 0.09, length, colour), 0, y, -length / 2, root)
    // The round tip is what the child grabs.
    api.place(api.mesh(new THREE.SphereGeometry(0.13, 12, 8), colour), 0, y, -length, root)
    root.name = name
    api.board.add(root)
    return root
  })
  const status = api.readout('12:00')
  const angles = () => [(hour % 12 + minute / 60) / 12 * FULL_TURN, minute / 60 * FULL_TURN]

  function update() {
    angles().forEach((angle, i) => { hands[i].rotation.y = -angle })
    status.textContent = clockTime(hour, minute)
    hands[0].userData.hour = hour
    hands[1].userData.minute = minute
    api.invalidate()
  }

  /** The hand whose tip is under the finger, or null. Level 0 only moves the hour hand. */
  function grabbedHand(p) {
    const distances = angles().map((angle, i) =>
      Math.hypot(p.x - Math.sin(angle) * HANDS[i].length, p.z + Math.cos(angle) * HANDS[i].length))
    const nearest = distances[1] < distances[0] ? 1 : 0
    return distances[nearest] < 0.5 && (minutesOn || nearest === 0) ? nearest : null
  }

  api.action('Hour −', () => {
    hour = hour === 1 ? 12 : hour - 1
    update()
  })
  api.action('Hour +', () => {
    hour = hour === 12 ? 1 : hour + 1
    update()
  })
  if (minutesOn) {
    api.action('Minute −', () => {
      minute = (minute + 45) % 60
      update()
    })
    api.action('Minute +', () => {
      minute = (minute + 15) % 60
      update()
    })
  }
  api.onTrace((p) => {
    if (!p) return
    if (firstPoint) {
      firstPoint = false
      dragHand = grabbedHand(p)
    }
    // Ignore the centre, where the angle is unstable.
    if (dragHand === null || Math.hypot(p.x, p.z) < 0.45) return
    const turn = ((Math.atan2(p.x, -p.z) + FULL_TURN) % FULL_TURN) / FULL_TURN
    if (dragHand === 0) hour = Math.round(turn * 12) % 12 || 12
    else minute = Math.round(turn * 4) % 4 * 15
    update()
  }, {
    planeHeight: 0.35,
    onStart: () => {
      firstPoint = true
      dragHand = null
    },
    onEnd: () => { dragHand = null },
  })
  api.action('Check time ✓', () => {
    if (hour !== challenge.hour || minute !== challenge.minute) {
      api.feedback('The purple short hand shows hours; the orange long hand shows minutes. Try again.')
      return
    }
    const name = CLOCK_REWARDS[game.id]
    const reward = api.actor(name, 0.8, 0, 2.9, 0.3)
    api.animate(1.25, (t) => {
      reward.position.y = 0.3 + Math.sin(t * Math.PI) * (name === 'rocket' ? 2 : 0.5)
      reward.rotation.y = Math.sin(t * Math.PI) * 0.45
    })
    api.success(challenge.fact)
  }, { primary: true })
  api.hint(minutesOn
    ? 'Drag a coloured hand by its round tip, or use the hour and minute buttons.'
    : 'Drag the short purple hand by its round tip, or use the hour buttons.')
  update()
}

const TANGRAM_COLOURS = ['#e6ab94', '#e6ce87', '#aacaac', '#a9c8de', '#b7a6d5', '#e5aabe', '#a7d7cb']
// Quarter turns after which a piece looks the same; triangles need the exact turn.
const TANGRAM_SYMMETRY = { square: 1, parallelogram: 2 }

function tangram(challenge, api) {
  const turns = [...challenge.turns]
  const placed = new Set()
  const sources = []
  const previews = []
  const outlines = []
  const holders = []
  let chosen = 0
  const status = api.readout('Choose a piece, turn it, and fit it')

  for (const [i, { name, vertices }] of tangramPieces.entries()) {
    const centre = vertices.reduce((sum, [x, z]) => [sum[0] + x / vertices.length, sum[1] + z / vertices.length], [0, 0])
    const local = vertices.map(([x, z]) => [(x - centre[0]) * 0.8, (z - centre[1]) * 0.8])
    const x = 1.55 + (centre[0] - 2) * 0.8
    const z = (centre[1] - 2) * 0.8

    outlines.push(api.place(polygon(api, local, '#c6c5d5'), x, 0.19, z))
    api.place(outline(api, local, 0, '#6c6485'), x, 0.215, z)
    // The holder is the full-size piece: carried during a drag, then left in place once fitted.
    const holder = new THREE.Group()
    holder.add(polygon(api, local, TANGRAM_COLOURS[i]))
    api.place(holder, x, 0.32, z)
    holder.visible = false
    holder.name = `tangram-piece-${i}`
    holders.push(holder)

    const source = api.tile({ x: -3.15 + (i % 2) * 1.25, z: -2.05 + Math.floor(i / 2) * 1.35, size: 1.05, depth: 1.05, onTap: () => choose(i) })
    const preview = api.place(polygon(api, local, TANGRAM_COLOURS[i]), 0, 0.23, 0, source.group)
    preview.scale.setScalar(0.4)
    previews.push(preview)
    sources.push(source)
    source.button.setAttribute('aria-label', `Choose ${name} ${i + 1}`)

    const slot = hiddenTile(api, { x, z, size: 0.58, depth: 0.58, thin: true, onTap: () => fit(chosen, i) })
    slot.button.setAttribute('aria-label', `Tangram outline ${i + 1}`)

    api.onDrag(source, {
      move: (p) => {
        if (placed.has(i)) return
        choose(i)
        holder.visible = true
        holder.position.set(p.x, 0.35, p.z)
        holder.rotation.y = turns[i] * Math.PI / 2
      },
      drop: (p) => {
        if (placed.has(i)) return
        holder.visible = false
        if (Math.hypot(p.x - x, p.z - z) < 0.85) fit(i, i)
        else api.feedback('Carry the piece to its matching grey outline.')
      },
      cancel: () => {
        if (!placed.has(i)) holder.visible = false
      },
    })
  }

  function choose(i) {
    if (placed.has(i)) return
    chosen = i
    sources.forEach((source, j) => source.select(i === j))
    status.textContent = `${tangramPieces[i].name} · ${placed.size} / 7 fitted`
    api.invalidate()
  }

  function update() {
    previews.forEach((preview, i) => { preview.rotation.y = turns[i] * Math.PI / 2 })
    api.invalidate()
  }

  function turnChosen(quarterTurns) {
    if (placed.has(chosen)) return
    turns[chosen] = (turns[chosen] + quarterTurns) % 4
    update()
  }

  function fit(piece, slot) {
    if (placed.has(piece)) return
    if (piece !== slot) {
      api.feedback('Look at the outline’s shape and size. This piece belongs in a different space.')
      return
    }
    if (turns[piece] % (TANGRAM_SYMMETRY[tangramPieces[piece].name] || 4) !== 0) {
      api.feedback('This is the right space. Turn the piece to match its outline.')
      return
    }
    placed.add(piece)
    const holder = holders[piece]
    holder.position.copy(outlines[piece].position)
    holder.position.y = 0.32
    holder.rotation.y = 0
    holder.visible = true
    outlines[piece].visible = false
    previews[piece].visible = false
    sources[piece].enable(false)
    sources[piece].select(false)
    api.audio.happy()
    if (placed.size === 7) api.success('Seven pieces make one square: five triangles, a square, and a parallelogram.')
    else choose(sources.findIndex((_, i) => !placed.has(i)))
  }

  api.action('↶ Turn left', () => turnChosen(3))
  api.action('Turn right ↷', () => turnChosen(1))
  api.action('Try matching outline', () => fit(chosen, chosen))
  api.action('↶ Reset', () => api.reset())
  api.hint('Choose a coloured piece. Turn it, then carry it to its grey outline or tap the outline.')
  update()
  choose(0)
}

const FRACTION_COLOURS = { watermelon: '#eb979b', pizza: '#f4d282', quilt: '#cfc0e4' }

function fraction(challenge, game, api) {
  const n = challenge.denominator
  const restColour = FRACTION_COLOURS[game.food]
  const watermelon = game.food === 'watermelon'
  const selected = new Set()
  const pieces = []
  const status = api.readout(`0 / ${n}`)

  // Lifts or lowers one part and colours it as part of the share.
  function toggle(i, tile) {
    if (selected.has(i)) selected.delete(i)
    else selected.add(i)
    const chosen = selected.has(i)
    tile.select(chosen)
    const root = pieces[i]
    const from = root.position.y
    api.animate(0.2, (t) => { root.position.y = THREE.MathUtils.lerp(from, chosen ? 0.45 : 0.15, t) }, root)
    root.children[0].material.color.set(chosen ? game.accent : restColour)
    status.textContent = `${selected.size} / ${n}`
    api.audio.note(320 + i * 30)
  }

  if (challenge.rect) {
    const rows = Math.ceil(n / 2)
    api.place(api.block(3.2, 0.12, rows * 0.77 + 0.1, '#fff3df'), 0, 0.05, 0)
    for (let i = 0; i < n; i++) {
      const x = (i % 2 - 0.5) * 1.45
      const z = (Math.floor(i / 2) - (rows - 1) / 2) * 0.77
      const root = new THREE.Group()
      root.add(api.block(1.33, 0.1, 0.66, restColour))
      api.place(root, x, 0.15, z)
      pieces.push(root)
      root.add(outline(api, [[-0.57, -0.24], [0.57, -0.24], [0.57, 0.24], [-0.57, 0.24]], 0.075, '#fff5e5'))
      const patch = hiddenTile(api, { x, z, size: 1.3, depth: 0.68, thin: true, onTap: (tile) => toggle(i, tile) })
      patch.button.setAttribute('aria-label', `Quilt patch ${i + 1}`)
    }
  } else {
    api.place(api.mesh(new THREE.CylinderGeometry(2.14, 2.14, 0.11, 64), '#fff2df'), 0, 0.05, 0)
    const wedge = (radius, height, start, colour) =>
      api.mesh(new THREE.CylinderGeometry(radius, radius, height, 48, 1, false, start, FULL_TURN / n - 0.014), colour)
    for (let i = 0; i < n; i++) {
      const start = i / n * FULL_TURN
      const middle = start + Math.PI / n
      const root = api.place(new THREE.Group(), 0, 0.15, 0)
      pieces.push(root)
      root.add(wedge(watermelon ? 1.76 : 1.96, 0.14, start, restColour))
      if (watermelon) api.place(wedge(1.98, 0.07, start, '#8fc095'), 0, -0.04, 0, root)
      // Seeds on watermelon, toppings on pizza.
      for (const radius of [0.7, 1.2]) {
        const dot = api.mesh(new THREE.SphereGeometry(watermelon ? 0.035 : 0.1, 10, 6), watermelon ? '#514157' : '#df918b')
        dot.scale.y = 0.25
        api.place(dot, Math.sin(middle) * radius, 0.1, Math.cos(middle) * radius, root)
      }
      const slice = hiddenTile(api, { x: Math.sin(middle) * 1.25, z: Math.cos(middle) * 1.25, size: 0.62, depth: 0.62, thin: true, onTap: (tile) => toggle(i, tile) })
      slice.button.setAttribute('aria-label', `Equal slice ${i + 1}`)
    }
  }

  api.action('Check share ✓', () => {
    const { numerator } = challenge
    if (selected.size !== numerator) {
      api.feedback(`Choose ${numerator} of the ${n} equal parts. You have ${selected.size}.`)
      return
    }
    const gcd = (x, y) => (y ? gcd(y, x % y) : x)
    const divisor = gcd(numerator, n)
    const simpler = divisor > 1 ? ` The same share is ${numerator / divisor}/${n / divisor}.` : ''
    api.success(`${numerator}/${n} of the ${game.food}.${simpler} Every part is equal in size.`)
  }, { primary: true })
  api.action('↶ Reset', () => api.reset())
  api.hint('Touch equal pieces to lift your share. Touch again to put a piece back.')
}

const ICE_WHITE = '#edf6fa'

// One arm's motif is reflected across its spine and repeated on all six arms.
function snowflake(challenge, game, api) {
  const { rings, pattern } = challenge
  const motif = Array(rings).fill(false)
  const branches = []
  const pads = []
  let free = false

  const root = new THREE.Group()
  root.name = 'snowflake'
  api.board.add(root)
  api.place(api.mesh(new THREE.CylinderGeometry(3.55, 3.55, 0.08, 6), '#d5e8ef'), 0, 0.02, 0, root)
  const status = api.readout('One reflected motif · six matching arms')

  for (let arm = 0; arm < 6; arm++) {
    const holder = new THREE.Group()
    holder.rotation.y = arm * Math.PI / 3
    holder.name = `snowflake-arm-${arm}`
    root.add(holder)
    branches.push([])
    pads.push([])
    api.place(api.block(0.095, 0.1, 3.05, '#fff7e6'), 0, 0.16, -1.52, holder)
    for (let ring = 0; ring < rings; ring++) {
      const radius = 0.85 + ring * 0.65
      // [left twin, right twin]; update() colours them.
      branches[arm].push([-1, 1].map((side) => {
        const branch = api.place(api.block(0.1, 0.1, 0.63, ICE_WHITE), side * 0.22, 0.2, -radius - 0.16, holder)
        branch.rotation.y = side * Math.PI / 4
        return branch
      }))
      const pad = hiddenTile(api, {
        x: 0.44, z: -radius - 0.26, size: 0.57, depth: 0.57, thin: true,
        onTap: () => {
          motif[ring] = !motif[ring]
          update()
          api.audio.note(340 + ring * 65)
        },
      })
      holder.add(pad.group)
      pad.button.setAttribute('aria-label', `Snowflake arm ${arm + 1} branch ${ring + 1}`)
      pads[arm].push(pad)
    }
  }

  function update() {
    branches.forEach((pairs, arm) => pairs.forEach(([left, right], i) => {
      // The left twins show the model to copy, or mirror the child's own design.
      left.material.color.set((free ? motif[i] : pattern[i]) ? game.accent : ICE_WHITE)
      right.material.color.set(motif[i] ? game.accent : ICE_WHITE)
      pads[arm][i].select(motif[i])
    }))
    root.userData.motif = [...motif]
    root.userData.free = free
    status.textContent = `${motif.filter(Boolean).length} chosen branches × six arms`
    api.invalidate()
  }

  const check = api.action('Check snowflake ✓', () => {
    if (free) {
      api.feedback('Your own motif repeats six times. Each arm has reflected twins.', true)
      return
    }
    if (!motif.every((v, i) => v === pattern[i])) {
      api.feedback('Match each coloured branch with its twin across an arm’s white spine. A change repeats on all six arms.')
      return
    }
    api.animate(1.2, (t) => { root.rotation.y = Math.sin(t * Math.PI) * Math.PI / 6 }, root)
    api.success('One reflected motif makes six matching arms. Each copy is turned by one sixth of a full turn.')
  }, { primary: true })
  api.action('Make my own snowflake', (button) => {
    free = !free
    button.setAttribute('aria-pressed', String(free))
    api.prompt(free ? 'Make your own six-armed snowflake.' : challenge.prompt)
    check.textContent = free ? 'Admire my snowflake' : 'Check snowflake ✓'
    api.hint(free
      ? 'Choose any branches. Your design is reflected and repeated around the centre.'
      : 'Copy the coloured branches across each arm’s white spine.')
    update()
  })
  api.action('↶ Reset', () => api.reset())
  api.hint('Touch a branch beside any white spine. The same change appears on all six arms. Match its reflected twin.')
  update()
}

const PANE = '#f8efe8'

// The left half shows the pattern; the child colours the right half to reflect it.
function mirror(challenge, game, api) {
  const { pattern } = challenge
  const n = challenge.size
  const spacing = 0.9
  const selected = Array(pattern.length).fill(false)
  const cells = []
  const subject = new THREE.Group()
  api.board.add(subject)

  if (game.id === 'butterfly-mirrors') {
    for (const side of [-1, 1]) {
      const wing = [[0.25, -1.75], [1.9, -2.6], [4.1, -1.6], [4.1, 1.2], [2.1, 2.5], [0.25, 1.65]].map(([x, z]) => [side * x, z])
      api.place(polygon(api, wing, '#e8c9e4'), 0, 0.13, 0, subject)
    }
    api.place(api.block(0.28, 0.3, 4.4, '#8a749c'), 0, 0.22, 0, subject)
    for (const x of [-0.13, 0.13]) {
      const feeler = api.place(api.block(0.05, 0.1, 0.6, '#8a749c'), x, 0.32, -2.45, subject)
      feeler.rotation.y = x < 0 ? -0.35 : 0.35
    }
  } else if (game.id === 'castle-window-symmetry') {
    api.place(api.block(n * spacing * 2 + 0.8, 0.13, n * 1.05 + 0.55, '#9b85b6'), 0, 0.07, 0, subject)
  } else if (game.id === 'robot-reflections') {
    api.place(api.block(n * spacing * 2 + 0.8, 0.15, n * 1.05 + 0.65, '#a0b9c5'), 0, 0.1, 0, subject)
    for (const x of [-n * spacing - 0.3, n * spacing + 0.3]) api.place(api.block(0.2, 0.3, 1.4, '#edca86'), x, 0.2, 0, subject)
  }

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const z = (y - (n - 1) / 2) * 1.05
      const left = api.tile({ x: -(n - x) * spacing + 0.08, z, size: 0.72, depth: 0.84, colour: pattern[y * n + x] ? game.accent : PANE, visual: true })
      // Column x on the right mirrors column n - 1 - x on the left.
      const reflected = y * n + n - 1 - x
      const right = api.tile({
        x: (x + 1) * spacing - 0.08, z, size: 0.72, depth: 0.84, colour: PANE,
        onTap: (tile) => {
          selected[reflected] = !selected[reflected]
          tile.select(selected[reflected])
          api.audio.note(selected[reflected] ? 440 : 330)
          api.invalidate()
        },
      })
      right.button.setAttribute('aria-label', `Mirror row ${y + 1}, column ${x + 1}`)
      subject.add(left.group, right.group)
      cells.push(left, right)
      if (game.id === 'castle-window-symmetry') {
        for (const tile of [left, right]) {
          tile.base.material.transparent = true
          tile.base.material.opacity = 0.85
        }
      }
    }
  }
  subject.add(api.polyline([new THREE.Vector3(0, 0.28, -2.5), new THREE.Vector3(0, 0.28, 2.5)], '#6c6385'))

  api.action('Check mirror ✓', () => {
    if (!selected.every((v, i) => v === pattern[i])) {
      api.feedback('Find each twin the same distance from the middle line. The top stays at the top.')
      return
    }
    if (game.id === 'butterfly-mirrors') {
      api.animate(1, (t) => {
        subject.position.y = Math.sin(t * Math.PI) * 0.8
        subject.rotation.z = Math.sin(t * Math.PI) * 0.08
      })
    } else if (game.id === 'castle-window-symmetry') {
      for (const tile of cells) {
        tile.base.material.emissive.copy(tile.base.material.color)
        tile.base.material.emissiveIntensity = 0.28
      }
    } else if (game.id === 'robot-reflections') {
      api.animate(0.8, (t) => { subject.rotation.y = Math.sin(t * Math.PI) * 0.07 })
    }
    api.success('Every coloured part has a reflected twin. Both halves match across the middle line.')
  }, { primary: true })
  api.action('↶ Reset', () => api.reset())
  api.hint('Touch the empty half to colour its reflected twins. Touch again to clear a colour.')
}

// Turn a key in quarter turns until it matches the keyhole.
function rotate(challenge, game, api) {
  const docking = game.id === 'rocket-docking'
  let turn = challenge.initial
  const source = api.tile({ x: -2, z: 0, size: 2.6, depth: 2.6, visual: true, label: 'Your key' })
  const lock = api.tile({ x: 2, z: 0, size: 2.6, depth: 2.6, visual: true, label: 'Keyhole', colour: '#c3b2d6' })

  // A triangular tip, a stem, and a side tooth, so every quarter turn looks different.
  function key(colour) {
    const root = new THREE.Group()
    api.place(api.shape('Triangle', colour, 1.2), 0, 0.25, 0, root)
    api.place(api.block(0.22, 0.16, 0.85, colour), 0, 0.23, 0.65, root)
    api.place(api.block(0.37, 0.16, 0.14, colour), 0.25, 0.23, 0.94, root)
    return root
  }
  const piece = key(game.accent)
  const hole = key('#635671')
  source.group.add(piece)
  lock.group.add(hole)
  hole.rotation.y = challenge.target * Math.PI / 2

  function turnKey(quarterTurns) {
    turn = (turn + quarterTurns) % 4
    piece.rotation.y = turn * Math.PI / 2
    api.invalidate()
  }
  api.action('↶ Turn left', () => turnKey(3))
  api.action('Turn right ↷', () => turnKey(1))
  api.action('Check fit ✓', () => {
    if (turn !== challenge.target) {
      api.feedback('Match the tip, the handle, and the tooth on the side. Turn again.')
      return
    }
    const reward = api.actor(docking ? 'rocket' : 'gem', 1, 2, -1.8, 0.3)
    const start = piece.position.x
    api.animate(1, (t) => {
      piece.position.x = start + 4 * t
      reward.position.y = 0.3 + t * 0.8
    })
    api.success(docking
      ? 'The docking key fits. Your rocket can connect to the station!'
      : 'The crystal key fits. The treasure lock opens!')
  }, { primary: true })
  api.hint('Turn the key until its tip and side tooth match the keyhole.')
  turnKey(0)
}
