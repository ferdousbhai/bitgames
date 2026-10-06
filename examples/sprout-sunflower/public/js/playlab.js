import * as THREE from 'three'

const activities = { pitch, rhythm, build, tenframe, spell, rhyme }

export function runPlaylab(c, g, a) {
  const run = activities[c.mode]
  if (!run) return false
  run(c, g, a)
  return true
}

// --- Pitch: hear high and low voices, or compose a melody ------------------------------

function pitch(c, g, a) {
  const heard = new Set()
  const song = []
  let composing = false
  let busy = false
  // Read by the browser tests.
  a.board.userData.composition = { song, get composing() { return composing }, get playing() { return busy } }
  const status = a.readout('Listen to every sound')
  const showHeard = () => { status.textContent = `${heard.size} / ${c.notes.length} sounds heard` }

  function sound(i) {
    const pad = pads[i]
    a.audio.note(c.notes[i], 0.7)
    pad.flash(true)
    a.later(() => pad.flash(false), 700)
    a.animate(0.7, (p) => { pad.figure.position.y = restHeights[i] + Math.sin(p * Math.PI * 6) * 0.06 }, pad.figure)
  }

  function showSong() {
    status.textContent = song.length ? `My melody: ${song.map((i) => i + 1).join(' · ')}` : 'Touch voices to make your melody'
  }

  const pads = a.grid(c.notes, (frequency, i) => ({
    label: `Listen ${i + 1}`,
    model: g.subject === 'birds' ? 'bird' : 'gem',
    size: 1.8,
    depth: 1.8,
    onTap: () => {
      if (busy) return
      if (composing) {
        if (song.length === 12) {
          a.feedback('Twelve sounds make your melody. Undo to try another ending.')
          return
        }
        song.push(i)
        sound(i)
        showSong()
        return
      }
      heard.add(i)
      sound(i)
      showHeard()
      // Answers unlock once every voice has been heard.
      choices.forEach((b) => { b.disabled = heard.size < c.notes.length })
    },
  }), { spacing: 2.5, z: -0.8 })
  const restHeights = pads.map((t) => t.figure.position.y)

  // Crystals show a model wave whose frequency follows the note.
  if (g.subject === 'crystals') {
    pads.forEach((t, i) => {
      const points = Array.from({ length: 65 }, (_, n) =>
        new THREE.Vector3(-0.7 + n / 64 * 1.4, 0.22, Math.sin(n / 64 * Math.PI * 4 * (c.notes[i] / 220)) * 0.17))
      const wave = a.polyline(points, '#8273aa')
      wave.position.z = 1
      t.group.add(wave)
    })
  }

  const choices = c.notes.map((_, i) => a.action(`Choose ${i + 1}`,
    () => a.check(i === c.target, 'Listen again. Higher pitch means faster vibration; it is different from louder sound.'),
    { disabled: true }))

  a.action('Compose my melody', (button) => {
    if (busy) return
    composing = !composing
    button.setAttribute('aria-pressed', String(composing))
    a.prompt(composing ? 'Compose a melody with high and low voices.' : c.prompt)
    choices.forEach((choice) => { choice.hidden = composing })
    if (composing) showSong()
    else showHeard()
  }, { pressed: false })
  a.action('♫ Play my melody', () => {
    if (!composing || busy) return
    if (!song.length) {
      a.feedback('Touch a voice to begin your melody.')
      return
    }
    const sequence = [...song]
    busy = true
    pads.forEach((t) => t.enable(false))
    sequence.forEach((i, n) => a.later(() => {
      sound(i)
      status.textContent = `${n + 1} / ${sequence.length}`
    }, n * 800))
    a.later(() => {
      busy = false
      pads.forEach((t) => t.enable(true))
      showSong()
    }, sequence.length * 800)
  })
  a.action('⌫ Undo sound', () => {
    if (composing && !busy) {
      song.pop()
      showSong()
    }
  })
  a.action('Clear my melody', () => {
    if (composing && !busy) {
      song.length = 0
      showSong()
    }
  })
  a.hint(g.subject === 'birds'
    ? 'Touch each bird to hear its voice. Compare pitch or compose your own melody.'
    : 'Touch each crystal. The model waves show faster or slower vibration using the same volume setting.')
}

// --- Rhythm: copy beats and quiet rests, or compose a rhythm ---------------------------

function rhythm(c, g, a) {
  const rain = g.subject === 'rain'
  const chosen = c.pattern.map(() => false)
  const status = a.readout('Watch the beats and quiet rests')
  let busy = false
  let composing = false
  // Read by the browser tests.
  a.board.userData.composition = { song: chosen, get composing() { return composing }, get playing() { return busy } }

  const drum = a.tile({ x: 0, z: -1.5, size: 1.9, depth: 1.9, model: g.subject === 'drum' ? 'drum' : 'leaf', onTap: () => hit() })
  const drumHeight = drum.figure.scale.y
  const drop = a.mesh(new THREE.SphereGeometry(0.12, 12, 8), '#93bfd8')
  drop.position.set(0, 1.4, -1.5)
  drop.visible = false
  a.board.add(drop)

  // The drum squashes; in the rain game a drop also falls onto the leaf.
  function hit() {
    a.audio.note(rain ? 560 : 150, 0.16, 0, rain ? 'sine' : 'triangle')
    a.animate(0.25, (t) => {
      drum.figure.scale.y = drumHeight * (1 - Math.sin(t * Math.PI) * 0.13)
      if (rain) {
        drop.visible = t < 1
        drop.position.y = 1.4 - t * 1.1
      }
    }, drum)
  }

  const pads = a.grid(c.pattern, (_, i) => ({
    label: '—',
    size: 1,
    depth: 1.2,
    colour: '#efe5d2',
    onTap: (t) => {
      if (busy) return
      chosen[i] = !chosen[i]
      t.label(chosen[i] ? '♫' : '—')
      t.select(chosen[i])
      if (chosen[i]) hit()
    },
  }), { columns: c.pattern.length, spacing: 1.2, z: 0.8 })
  pads.forEach((t) => t.enable(false))

  function play(pattern, finish) {
    if (busy) return
    busy = true
    pads.forEach((t) => t.enable(false))
    status.textContent = 'Listen to the loop'
    pattern.forEach((beat, i) => {
      a.later(() => {
        pads[i].flash(true)
        status.textContent = beat ? 'Beat' : 'Quiet rest'
        if (beat) hit()
      }, i * 600)
      a.later(() => pads[i].flash(false), i * 600 + 450)
    })
    a.later(() => {
      busy = false
      pads.forEach((t) => t.enable(true))
      status.textContent = 'Your turn'
      finish?.()
    }, pattern.length * 600 + 100)
  }

  a.action('♫ Hear pattern', () => play(c.pattern))
  a.action('Play my rhythm', () => play([...chosen], () => {
    if (composing) {
      a.feedback('Your own rhythm has beats and quiet rests. Change a step to explore another rhythm.', true)
    } else {
      a.check(chosen.every((beat, i) => beat === c.pattern[i]), 'Listen for each beat and each quiet rest. Touch a beat to add or remove it.')
    }
  }), { primary: true })
  a.action('Compose my rhythm', (button) => {
    if (busy) return
    composing = !composing
    button.setAttribute('aria-pressed', String(composing))
    a.prompt(composing ? 'Make your own rhythm. Choose beats and quiet rests.' : c.prompt)
    pads.forEach((t) => t.enable(true))
    status.textContent = composing ? 'Create beats and quiet rests' : 'Copy the demonstration'
  }, { pressed: false })
  a.action('Clear my rhythm', () => {
    if (busy) return
    chosen.fill(false)
    pads.forEach((t) => {
      t.label('—')
      t.select(false)
    })
  })
  a.action('Play drum', () => hit())
  a.action('↶ Reset', () => a.reset())
  a.hint('Touch the steps to place beats. Leave quiet rests empty. Touch the drum to explore its sound.')
  a.later(() => { if (!composing && !busy) play(c.pattern) }, 500)
}

// --- Build: stack floors to match a small floor plan -----------------------------------

const townColours = ['#dcb38e', '#aed0c9', '#d8bbd8', '#c4cf9f']

function build(c, g, a) {
  const castle = g.subject === 'castle'
  const heights = c.heights.map(() => 0)
  const history = []
  const centre = c.level === 0 ? 1 : 0.5
  const padSize = c.level === 0 ? 1.8 : 1.55
  const helpText = 'Use the small floor plan to match each building’s position and height.'
  let free = false

  // The blueprint: a small labelled plan at the back of the board.
  c.heights.forEach((height, i) => {
    const [x, z] = c.positions[i]
    const plan = a.tile({ x: (x - centre) * 1.2, z: -2.25 + z * 0.65, size: 0.9, depth: 0.8, label: String(height), visual: true, colour: '#f0e7d0' })
    const marker = a.block(0.45, 0.07, 0.45, g.accent)
    marker.position.set(0, 0.2, 0)
    plan.group.add(marker)
  })

  // Each building has four hidden floors and a roof; tapping its pad shows one more floor.
  const floors = []
  const roofs = []
  const pads = c.heights.map((_, i) => {
    const [x, z] = c.positions[i]
    const wx = (x - centre) * 2.35
    const wz = 0.2 + z * 1.9
    const pad = a.tile({
      x: wx, z: wz, size: padSize, depth: padSize, label: '0',
      onTap: () => {
        history.push([i, heights[i]])
        heights[i] = (heights[i] + 1) % 5
        update(i)
      },
    })
    floors.push(Array.from({ length: 4 }, (_, n) => {
      const floor = a.block(1, 0.42, 1, castle ? '#c2aed6' : townColours[i])
      floor.position.set(wx, 0.38 + n * 0.43, wz)
      floor.visible = false
      a.board.add(floor)
      const pane = a.block(0.23, 0.2, 0.025, '#e9ddac')
      pane.position.set(0, 0, 0.512)
      floor.add(pane)
      return floor
    }))
    const roof = a.mesh(new THREE.ConeGeometry(0.83, 0.38, 4), castle ? '#a898c0' : '#e5acaa')
    roof.rotation.y = Math.PI / 4
    roof.position.set(wx, 0.65, wz)
    roof.visible = false
    a.board.add(roof)
    roofs.push(roof)
    return pad
  })

  function update(i) {
    floors[i].forEach((floor, n) => { floor.visible = n < heights[i] })
    roofs[i].visible = heights[i] > 0
    roofs[i].position.y = 0.5 + heights[i] * 0.43
    pads[i].label(String(heights[i]))
    a.audio.note(262 + heights[i] * 70)
    a.invalidate()
  }

  a.action('⌫ Undo block', () => {
    if (!history.length) return
    const [i, height] = history.pop()
    heights[i] = height
    update(i)
  })
  const check = a.action('Check blueprint ✓', () => {
    if (free) {
      a.feedback('Your own little neighbourhood. Keep building or go home whenever you like.', true)
      return
    }
    a.check(heights.every((v, i) => v === c.heights[i]),
      'Match both the position and the height in the small plan. Each tap adds a floor; Undo removes your last change.')
  }, { primary: true })
  a.action('Free building', (button) => {
    free = !free
    button.setAttribute('aria-pressed', String(free))
    check.textContent = free ? 'Admire my creation' : 'Check blueprint ✓'
    a.hint(free ? 'Make your own town. Try different heights and use Undo to change it.' : helpText)
  })
  a.action('↶ Reset', () => a.reset())
  a.hint(helpText)
}

// --- Ten frame: fill the ten spaces with the asked number ------------------------------

function tenframe(c, g, a) {
  const ladybird = g.id === 'ladybird-dot-party'
  const chosen = new Set()
  const toys = []
  const status = a.readout(`0 / ${c.target}`)

  if (ladybird) {
    const shell = a.mesh(new THREE.SphereGeometry(1, 32, 16), '#e49396')
    shell.scale.set(3.5, 0.4, 1.7)
    shell.position.y = 0.05
    a.board.add(shell)
    const head = a.mesh(new THREE.SphereGeometry(0.55, 20, 12), '#5c536e')
    head.position.set(-3.65, 0.22, 0)
    a.board.add(head)
    for (const z of [-0.28, 0.28]) {
      const eye = a.mesh(new THREE.SphereGeometry(0.1, 12, 8), '#fff4df')
      eye.position.set(-3.92, 0.54, z)
      a.board.add(eye)
    }
    a.board.add(a.polyline([new THREE.Vector3(-3, 0.47, 0), new THREE.Vector3(3, 0.47, 0)], '#87596b'))
  } else {
    const nest = a.mesh(new THREE.TorusGeometry(3.15, 0.15, 8, 48), '#b79a7c')
    nest.rotation.x = Math.PI / 2
    nest.scale.y = 0.58
    nest.position.y = 0.1
    a.board.add(nest)
  }

  const spaces = a.grid(Array.from({ length: 10 }, (_, i) => i), (i) => ({
    label: '',
    size: 1.1,
    depth: 1.1,
    colour: ladybird ? '#f0b6b2' : '#eee0bd',
    onTap: (t) => {
      if (chosen.has(i)) chosen.delete(i)
      else chosen.add(i)
      toys[i].visible = chosen.has(i)
      t.select(chosen.has(i))
      a.audio.speak(String(chosen.size))
      status.textContent = `${chosen.size} / ${c.target}`
      a.invalidate()
    },
  }), { columns: 5, spacing: 1.3 })

  spaces.forEach((t, i) => {
    const root = new THREE.Group()
    root.position.set(t.x, ladybird ? 0.45 : 0.2, t.z)
    root.visible = false
    a.board.add(root)
    if (ladybird) {
      root.add(a.mesh(new THREE.SphereGeometry(0.23, 16, 8), '#51465f'))
      t.base.material.transparent = true
      t.base.material.opacity = 0.25
    } else {
      root.add(a.model('egg', 0.62))
    }
    toys.push(root)
    t.button.setAttribute('aria-label', `Ten-frame space ${i + 1}`)
  })

  a.action('Check nest ✓', () => {
    if (chosen.size !== c.target) {
      a.feedback(`You have ${chosen.size}. We need ${c.target}. Fill five across the first row, then the next row.`)
      return
    }
    // Eggs hatch into baby dinosaurs.
    if (!ladybird) {
      for (const i of chosen) {
        toys[i].children[0].visible = false
        const baby = a.model('dino', 0.55)
        toys[i].add(baby)
        const scale = baby.scale.x
        a.animate(0.65, (p) => baby.scale.setScalar(scale * (0.2 + 0.8 * p)), baby)
      }
    }
    const extra = c.target > 5 ? ` Five in a row and ${c.target - 5} more make ${c.target}.` : ''
    a.success(`${c.target} filled and ${10 - c.target} empty make ten.${extra}`)
  }, { primary: true })
  a.action('↶ Reset', () => a.reset())
  a.hint(ladybird
    ? 'Touch the ten spaces to add or remove real spots. Notice the groups of five.'
    : 'Touch the ten spaces to add or remove eggs. Count once, then see what you remember.')
}

// --- Spell: choose a word's letters from left to right ---------------------------------
// Tiles show lowercase letters, as children first build words; the voice says letter names.
// A wrong letter is named and the word repeated; a second miss or a long pause makes
// the next letter glow.

const spellReceivers = { 'word-rocket': 'rocket', 'animal-alphabet': 'fox' }

function spell(c, g, a) {
  const word = c.word
  const name = word.toLowerCase()
  let spelled = ''
  let misses = 0
  let idle = null
  // A word can name its own toy, e.g. the clay dog who waits to hear its name spelled.
  const receiver = a.actor(c.friend || spellReceivers[g.id] || 'basket', 1.4, 0, -2.15)
  const picture = a.tile({ symbol: c.picture, x: 0, z: -0.5, size: 1.6, depth: 1.4, visual: true })
  const spaces = Array.from({ length: word.length }, (_, i) => a.tile({
    x: (i - (word.length - 1) / 2) * 1.2, z: 0.9, size: 1, depth: 1, label: '_', visual: true, colour: '#f7e5c1',
  }))

  const next = () => word[spelled.length]
  const glow = (on) => letters.forEach((t, i) => t.button.classList.toggle('current', on && c.tiles[i] === next()))
  const question = () => (spelled ? 'Which letter comes next?' : `Which letter does ${name} begin with?`)

  // Help grows with each miss or pause: first the word again, then a glowing letter.
  function help(wrong) {
    misses++
    const intro = wrong ? ['That is', wrong + '.'] : []
    const shown = wrong ? `That is ${wrong.toLowerCase()}. ` : ''
    if (misses < 2) {
      a.feedback(`${shown}Listen: ${name}. ${question()}`, false, [...intro, `Listen: ${name}.`, question()])
    } else {
      glow(true)
      const lead = spelled ? `The next letter in ${name} is` : `${name[0].toUpperCase() + name.slice(1)} begins with`
      a.feedback(`${shown}${lead} ${next().toLowerCase()}. Find the glowing letter.`, false,
        [...intro, lead, next() + '.', 'Find the glowing letter.'])
    }
    wait()
  }
  function wait() {
    clearTimeout(idle)
    if (spelled !== word && misses < 2) idle = a.later(() => help(), 15000)
  }

  const letters = a.grid(c.tiles, (letter) => ({
    label: letter.toLowerCase(),
    size: 1.25,
    depth: 1.1,
    onTap: () => {
      if (spelled === word) return
      if (letter !== next()) {
        help(letter)
        return
      }
      glow(false)
      misses = 0
      spaces[spelled.length].label(letter.toLowerCase())
      spaces[spelled.length].hop()
      spelled += letter
      if (spelled === word) {
        clearTimeout(idle)
        picture.hop()
        // The rocket lifts off; other receivers hop.
        a.animate(1.4, (t) => {
          receiver.position.y = 0.2 + (g.id === 'word-rocket' ? t * 2 : Math.sin(t * Math.PI) * 0.4)
          // A word friend spins round once, happy to hear its name.
          if (c.friend) receiver.rotation.y = t * Math.PI * 2
        }, receiver)
        a.success(`${[...name].join(' – ')} spells ${name}!`, [...word].map((l) => l + '.').concat(`That spells ${name}!`))
        return
      }
      if (spelled.length === 1) {
        a.feedback(`${name[0].toUpperCase() + name.slice(1)} begins with ${name[0]}.`, true,
          [letter + '.', `${name} begins with`, letter + '.'])
      } else {
        // Replace the beginning-sound line with the letters built so far.
        a.feedback(`${[...spelled.toLowerCase()].join(' – ')} … what comes next?`, true, letter + '.')
      }
      wait()
    },
  }), { columns: c.tiles.length, spacing: 1.45, z: 2.45 })

  a.action('🔈 Hear word', () => a.audio.speak(name))
  a.action('⌫ Undo letter', () => {
    if (!spelled || spelled === word) return
    spelled = spelled.slice(0, -1)
    spaces[spelled.length].label('_')
    glow(false)
    misses = 0
    wait()
  })
  a.action('↶ Reset', () => a.reset())
  a.hint('Listen to the word. Tap its letters from left to right. The voice says each letter’s name. Stuck? A letter will glow.')
  wait()
}

// --- Rhyme: hop the frog to the lily pad that rhymes -----------------------------------

function rhyme(c, g, a) {
  const frog = a.actor('frog', 0.8, -3, -1.5)
  a.tile({ label: c.word, x: 0, z: -1.8, size: 1.4, visual: true })
  const water = a.block(7, 0.045, 2.8, '#a8cdd0')
  water.position.y = 0.04
  a.board.add(water)

  a.grid(c.tiles, (word) => ({
    label: word,
    model: 'leaf',
    size: 1.75,
    depth: 1.6,
    colour: '#bad6ae',
    onTap: (t) => {
      a.audio.speak(word.toLowerCase())
      if (word !== c.target) {
        a.feedback(`Listen to the ending of ${c.word.toLowerCase()} and ${word.toLowerCase()}. Try another word.`)
        return
      }
      const from = frog.position.clone()
      const to = new THREE.Vector3(t.x, 0.2, t.z)
      a.animate(0.8, (p) => {
        frog.position.lerpVectors(from, to, p)
        frog.position.y += Math.sin(p * Math.PI) * 0.9
      }, frog)
      a.success(c.fact)
    },
  }), { spacing: 2.2, z: 0.65 })

  a.action('🔈 Hear first word', () => a.audio.speak(c.word.toLowerCase()))
  for (const word of c.tiles) a.action(`Hear ${word}`, () => a.audio.speak(word.toLowerCase()))
  a.hint('Listen to each word separately. Find a word with the same ending sound.')
}
