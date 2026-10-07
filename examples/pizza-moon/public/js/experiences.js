import * as THREE from 'three'
import { colourHex, colourMixes } from './challenges.js'

// Concrete demonstrations for the first reference games. Geometry is owned by
// the round; animation and pointer subscriptions are owned by the engine.
export function runExperience(c, g, a) {
  if (c.mode === 'collect') collect(c, g, a)
  else if (c.mode === 'mix') mix(c, g, a)
  else if (c.mode === 'experiment') experiment(c, g, a)
  else return false
  return true
}

// --- Collect: tap or carry the right number of toys to a destination -------------

const collectionSpots = {
  'firefly-lanterns': 'lantern',
  'orchard-baskets': 'basket',
  'moon-pebbles': 'rocket',
  'coral-cleanup': 'coral',
}

function collect(c, g, a) {
  const lantern = g.id === 'firefly-lanterns'
  const spotZ = -2.35
  const objects = Array.from({ length: c.total }, () => c.item)
  if (c.distractor) objects.splice(1, 0, c.distractor)
  const selected = new Set()
  const counter = a.readout(`0 / ${c.target}`)
  let doneButton

  const cards = a.grid(objects, (name, i) => ({ model: name, label: '', onTap: () => toggle(i) }), {
    columns: Math.min(4, objects.length),
    spacing: 1.5,
    z: 1.25,
    size: 1.15,
    depth: 1.15,
  })
  const receiver = a.tile({ model: collectionSpots[g.id], x: 0, z: spotZ, size: 1.8, scale: 2.35, label: '', visual: true })
  receiver.base.visible = false
  receiver.group.name = 'collection-destination'
  const centre = new THREE.Vector3(0, 0.4, spotZ)

  // The lantern has a faint glass shell and a light that brightens with each firefly.
  let glow
  if (lantern) {
    const glass = a.mesh(new THREE.CylinderGeometry(0.55, 0.58, 1.45, 24, 1, true), '#fff6c4')
    glass.material.transparent = true
    glass.material.opacity = 0.1
    glass.material.depthWrite = false
    glass.position.set(centre.x, 1, centre.z)
    a.board.add(glass)
    glow = new THREE.PointLight('#cfff84', 0, 7, 2)
    glow.position.set(0, 1, spotZ)
    a.board.add(glow)
  }

  // Each card has a small hidden copy that travels to and rests in the collection spot.
  const cargo = objects.map((name) => {
    const copy = a.actor(name, lantern ? 0.28 : 0.38)
    copy.visible = false
    return copy
  })

  function arrange() {
    for (const [n, i] of [...selected].entries()) {
      // Golden-angle spiral, stacked in layers of three.
      const angle = n * 2.399
      const destination = centre.clone()
      destination.x += Math.sin(angle) * 0.34
      destination.z += Math.cos(angle) * 0.25
      destination.y = lantern ? 0.45 + (n % 3) * 0.38 : 0.35 + (n % 3) * 0.12
      const copy = cargo[i]
      const origin = copy.position.clone()
      a.animate(0.55, (t) => copy.position.lerpVectors(origin, destination, t), copy)
    }
    if (glow) glow.intensity = Math.min(3, (selected.size / c.target) * 2.5)
    counter.textContent = `${selected.size} / ${c.target}`
    doneButton?.classList.toggle('collect-ready', selected.size === c.target)
    a.invalidate()
  }

  function toggle(i, fromDrag = false) {
    if (objects[i] !== c.item) {
      a.feedback('Leave the shell in its animal’s home. Look for a bottle.')
      return
    }
    const card = cards[i]
    const copy = cargo[i]
    if (selected.has(i)) {
      selected.delete(i)
      copy.visible = false
      card.figure.visible = true
      card.label('')
    } else {
      selected.add(i)
      copy.visible = true
      // A dragged copy is already under the finger; a tapped one starts from its card.
      if (!fromDrag) copy.position.set(card.group.position.x, 0.3, card.group.position.z)
      card.figure.visible = false
      card.label('✓')
    }
    const collected = selected.has(i)
    card.select(collected)
    card.button.setAttribute('aria-label', `${objects[i]}, ${collected ? 'collected' : 'available'}`)
    arrange()
    a.audio.note(262 + selected.size * 35)
    a.audio.speak(selected.size === c.target ? `${selected.size}. Tap Done.` : String(selected.size))
  }

  for (const [i, card] of cards.entries()) {
    const restore = () => {
      if (selected.has(i)) return
      cargo[i].visible = false
      card.figure.visible = true
    }
    a.onDrag(card, {
      move: (p) => {
        if (selected.has(i)) return
        cargo[i].visible = true
        cargo[i].position.set(p.x, 0.5, p.z)
        card.figure.visible = false
      },
      drop: (p) => {
        if (!selected.has(i) && Math.hypot(p.x, p.z - spotZ) < 1.4) toggle(i, true)
        restore()
      },
      cancel: restore,
    })
  }

  a.hint(lantern ? 'Tap fireflies, or carry them to the lantern. Tap a tick to let one go.' : 'Tap to collect, or carry a toy to the collection spot. Tap a tick to undo.')
  doneButton = a.action(
    'Done ✓',
    () => {
      if (selected.size !== c.target) {
        a.feedback(`There are ${selected.size}. We need ${c.target}. Add one or tap a tick to undo.`)
        return
      }
      if (glow) glow.intensity = 4
      if (g.id === 'moon-pebbles') {
        const initial = receiver.figure.position.y
        a.animate(1.8, (t) => { receiver.figure.position.y = initial + t * 2 })
      }
      if (g.id === 'coral-cleanup') {
        const scale = receiver.figure.scale.x
        a.animate(0.8, (t) => receiver.figure.scale.setScalar(scale * (1 + t * 0.25)))
      }
      a.success(c.fact)
    },
    { primary: true },
  )
  a.action('↶ Reset', () => a.reset())
}

// --- Mix: pour two paints into a vessel and stir -----------------------------------

const vesselModels = { cauldron: 'cauldron', smoothie: 'cup', jellyfish: 'jellyfish', planet: 'planet' }
const paints = ['Red', 'Yellow', 'Blue']
const paintNotes = { Red: 262, Yellow: 330, Blue: 392 }
// Toy materials that keep their colour when the whole jellyfish or planet is painted.
const unpaintedMaterials = ['#333653', '#fff5df', '#ffcf70']
// The bottle's glass material, which a carried bottle shows in its paint colour.
const bottleGlass = '#8bbddf'

function mix(c, g, a) {
  const chosen = []
  let busy = false
  const vessel = vesselModels[g.vessel]
  const potZ = -0.5
  const nearPot = (p) => Math.hypot(p.x, p.z - potZ) < 1.4

  const pot = a.tile({ model: vessel, x: 0, z: potZ, size: 2, scale: 2.35, visual: true })
  pot.base.visible = false
  const swatch = a.tile({ shape: 'Circle', colour: colourHex[c.target], label: `Make ${c.target}`, x: 3, z: -1.5, size: 1.4, visual: true })
  swatch.button.setAttribute('aria-label', `Target colour: ${c.target}`)

  // Open vessels show a pool of paint; the jellyfish and planet are painted themselves.
  const liquidRadius = vessel === 'cup' ? 0.54 : 0.78
  const liquid = a.mesh(new THREE.CylinderGeometry(liquidRadius, liquidRadius, 0.07, 32), '#fff4de')
  liquid.name = 'mix-liquid'
  liquid.position.set(0, 1.3, potZ)
  liquid.visible = vessel === 'cauldron' || vessel === 'cup'
  a.board.add(liquid)
  const painted = []
  if (!liquid.visible) {
    pot.figure.traverse((o) => {
      if (o.isMesh && !unpaintedMaterials.includes(o.material.name)) {
        o.material = a.material(o.material.color)
        painted.push(o.material)
      }
    })
  }

  const droplets = Array.from({ length: 7 }, () => {
    const drop = a.mesh(new THREE.SphereGeometry(0.055, 16, 8), '#fff4de')
    drop.visible = false
    a.board.add(drop)
    return drop
  })
  const status = a.readout('Choose two paint colours')
  const sources = a.grid(
    paints,
    (colour) => ({ model: 'bottle', tint: colourHex[colour], colour: colourHex[colour], label: colour, size: 1.3, onTap: () => pour(colour) }),
    { spacing: 2.35, z: 2.15 },
  )
  const stir = a.action('↻ Stir mixture', () => stirPaint(), { primary: true, disabled: true })

  function pour(colour) {
    if (chosen.length === 2 || busy) return
    chosen.push(colour)
    const source = sources[paints.indexOf(colour)]
    source.select(true)
    status.textContent = chosen.join(' + ')
    stir.disabled = chosen.length !== 2

    // Tip the bottle and arc a stream of droplets into the vessel.
    const oldRotation = source.figure.rotation.z
    a.animate(0.7, (t) => { source.figure.rotation.z = oldRotation + Math.sin(t * Math.PI) * 0.55 }, source.figure)
    a.animate(
      0.7,
      (t) => {
        droplets.forEach((drop, i) => {
          const p = (t + i / 7) % 1
          drop.visible = t > 0 && t < 1
          drop.material.color.set(colourHex[colour])
          drop.position.set(THREE.MathUtils.lerp(source.x, 0, p), 1.1 + Math.sin(p * Math.PI) * 1.1, THREE.MathUtils.lerp(source.z, potZ, p))
        })
      },
      droplets,
    )
    a.audio.note(paintNotes[colour], 0.3)
  }

  sources.forEach((source, i) => {
    const colour = paints[i]
    const ghost = a.actor('bottle', 0.8)
    ghost.visible = false
    ghost.traverse((o) => {
      if (o.isMesh && o.material.name === bottleGlass) o.material = a.material(colourHex[colour])
    })
    const hide = () => {
      ghost.visible = false
    }
    a.onDrag(source, {
      move: (p) => {
        if (chosen.length === 2) return
        ghost.visible = true
        ghost.position.set(p.x, 0.7, p.z)
      },
      drop: (p) => {
        hide()
        if (nearPot(p)) pour(colour)
        else a.feedback('Carry a bottle to the middle, or tap its colour.')
      },
      cancel: hide,
    })
  })

  function stirPaint() {
    if (chosen.length !== 2 || busy) return
    busy = true
    stir.disabled = true
    // Two different primaries make their secondary; the same colour twice stays the same.
    const mixed = colourMixes.find(([first, second]) => chosen.includes(first) && chosen.includes(second))
    const result = mixed ? mixed[2] : chosen[0]
    const start = liquid.material.color.clone()
    const end = new THREE.Color(colourHex[result])
    a.animate(1.1, (t) => {
      liquid.material.color.lerpColors(start, end, t)
      for (const material of painted) material.color.lerpColors(start, end, t)
      droplets.forEach((drop, i) => {
        const angle = t * Math.PI * 4 + (i * Math.PI * 2) / 7
        drop.visible = t > 0 && t < 1
        drop.material.color.copy(end)
        drop.position.set(Math.sin(angle) * 0.45, 1.4 + Math.sin(t * Math.PI) * 0.25, potZ + Math.cos(angle) * 0.45)
      })
    })
    a.later(() => {
      status.textContent = `${chosen.join(' + ')} = ${result}`
      if (result !== c.target) {
        busy = false
        a.feedback(`You made ${result.toLowerCase()}. We need ${c.target.toLowerCase()}. Empty the mixture and try another recipe.`)
        return
      }
      if (vessel === 'jellyfish') {
        const y = pot.figure.position.y
        a.animate(1.5, (t) => { pot.figure.position.y = y + t * 0.65 })
      }
      a.success(c.fact)
    }, 1150)
  }

  // Stirring: one and a half turns of a finger around the pot mixes the paint.
  let lastAngle = null
  let arc = 0
  a.onTrace(
    (p) => {
      if (chosen.length !== 2 || busy || !p || !nearPot(p)) {
        lastAngle = null
        return
      }
      const angle = Math.atan2(p.z - potZ, p.x)
      if (lastAngle !== null) {
        const step = angle - lastAngle
        arc += Math.abs(Math.atan2(Math.sin(step), Math.cos(step)))
        if (arc > Math.PI * 1.5) stirPaint()
      }
      lastAngle = angle
    },
    { ignoreTargets: true, planeHeight: 1.3 },
  )
  a.hint('Tap or carry two paint bottles to the middle. Stir in a circle, or press Stir mixture.')
  a.action('↶ Empty mixture', () => a.reset())
}

// --- Experiment: predict, then watch a magnet, water, or plant test -----------------

const observations = {
  magnet: ['It moved towards the magnet', 'It stayed on the table'],
  float: ['It floats at the surface', 'It sinks below the surface'],
  grow: ['The supplied plant grew', 'This supply did not help the plant grow'],
}

// A labelled flower pot whose plant starts small, for the growing comparison.
function plantPot(a, x, label) {
  const base = a.mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.5, 24), '#edab9b')
  base.position.set(x, 0.35, 1)
  a.board.add(base)
  const plant = a.actor('flower', 1.4, x, 1, 0.62)
  plant.scale.setScalar(0.25)
  a.tile({ x, z: 1.5, label, size: 1.5, visual: true }).base.visible = false
  return plant
}

function experiment(c, g, a) {
  let prediction = null
  let testing = false
  const status = a.readout('First make a prediction')
  const bench = a.block(5.8, 0.18, 3.1, '#f1e5d6')
  bench.position.y = 0.1
  a.board.add(bench)
  const object = a.tile({ model: c.toy, label: c.object.replace(/^\S+\s/, ''), x: 1.2, z: 0, size: 1.6, scale: 1.25, visual: true })
  object.base.visible = false
  object.group.name = 'experiment-object'

  let magnet, testPlant
  if (c.property === 'magnet') {
    magnet = a.actor('magnet', 1.5, -2.3, 0, 0.3)
    magnet.rotation.z = Math.PI / 2
    magnet.name = 'experiment-magnet'
    a.hint('Predict, then watch the magnet move closer. The material determines what happens.')
  } else if (c.property === 'float') {
    const water = a.block(4.5, 0.07, 2.5, '#7ec9df')
    water.position.set(0, 0.85, 0)
    water.material.transparent = true
    water.material.opacity = 0.62
    water.material.depthWrite = false
    a.board.add(water)
    object.group.position.set(0, 1.4, 0)
    a.hint('Predict, then watch the object enter the water. Look at the surface line.')
  } else {
    object.group.position.set(0, 0, -1.2)
    plantPot(a, -1.5, 'Comparison')
    testPlant = plantPot(a, 1.5, 'With your supply')
    a.hint('Compare two pretend plants over several days. Change one supply; keep the other conditions the same.')
  }

  const yes = a.action('Yes', () => choose(true), { pressed: false })
  const no = a.action('No', () => choose(false), { pressed: false })
  function choose(value) {
    if (testing) return
    prediction = value
    yes.setAttribute('aria-pressed', String(value))
    no.setAttribute('aria-pressed', String(!value))
    status.textContent = `Your prediction: ${value ? 'Yes' : 'No'}`
  }

  const test = a.action(
    'Test it! ✨',
    () => {
      if (prediction === null) {
        a.feedback('First make a prediction: yes or no.')
        return
      }
      if (testing) return
      testing = true
      yes.disabled = no.disabled = test.disabled = true
      if (c.property === 'magnet') {
        a.animate(1.3, (t) => {
          magnet.position.x = THREE.MathUtils.lerp(-2.3, -0.3, t)
          if (c.target) object.group.position.x = THREE.MathUtils.lerp(1.2, 0.25, t * t)
        })
        status.textContent = 'Watch the object as the magnet approaches'
      } else if (c.property === 'float') {
        a.animate(1.3, (t) => { object.group.position.y = THREE.MathUtils.lerp(1.4, c.target ? 0.68 : 0.05, t) })
        status.textContent = 'Look: does it stay at the surface or sink?'
      } else {
        a.animate(1.3, (t) => testPlant.scale.setScalar(0.25 + (c.target ? 0.75 : 0) * t))
        status.textContent = 'Several days later…'
      }
      a.later(() => {
        status.textContent = observations[c.property][c.target ? 0 : 1]
        const outcome = prediction === c.target ? 'Your prediction matched the observation.' : 'You discovered something new.'
        a.success(`${outcome} ${c.fact}`)
        a.action('↶ Repeat experiment', () => a.reset())
      }, 1450)
    },
    { primary: true },
  )
}
