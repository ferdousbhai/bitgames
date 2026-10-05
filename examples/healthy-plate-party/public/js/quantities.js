import * as THREE from 'three'

// Reusable toys conserve their number as the child moves them. Round-owned
// meshes and finite animations keep touch exploration bounded on tablets.
export function runQuantity(challenge, game, api) {
  if (challenge.mode === 'arithmetic') {
    if (challenge.operation === 'multiply') bakery(challenge, api)
    else arithmetic(challenge, api)
  } else if (challenge.mode === 'balance') balance(challenge, api)
  else if (challenge.mode === 'measure') measure(challenge, game, api)
  else return false
  return true
}

/** Hops a toy along a short arc to its destination. */
function travel(api, root, destination) {
  const from = root.position.clone()
  api.animate(0.45, (t) => {
    root.position.lerpVectors(from, destination, t)
    root.position.y += Math.sin(t * Math.PI) * 0.3
  }, root)
}

// Addition, subtraction and sharing: the child moves toys into receivers
// before the answer tiles unlock.
function arithmetic(challenge, api) {
  const { operation, item, target } = challenge
  const divide = operation === 'divide'
  const subtract = operation === 'subtract'
  const total = operation === 'add' ? challenge.a + challenge.b : challenge.a
  const groups = divide ? challenge.b : 1
  // Insertion order doubles as the undo history.
  const placed = new Map()
  const toys = []
  const cards = []
  const recipients = []
  let selected = null

  const status = api.readout('Move the toys to tell the story')
  const answers = api.grid(challenge.tiles, (value) => ({
    label: String(value),
    onTap: () => {
      if (!ready()) {
        api.feedback('First move the toys to tell the whole story.')
        return
      }
      api.check(value === target, divide
        ? 'Count one explorer’s share. Each explorer needs the same number.'
        : 'Count the toys in their new places. You can touch each one.')
    },
  }), { spacing: 1.65, z: 3.2, size: 1.2, depth: 1.05 })
  answers.forEach((tile) => tile.enable(false))

  const receiverZ = subtract ? -2.25 : -1.25
  for (let i = 0; i < groups; i++) {
    const x = (i - (groups - 1) / 2) * 1.5
    const recipient = api.tile({
      x,
      z: receiverZ,
      size: groups > 1 ? 1.35 : 5.6,
      depth: 1.9,
      colour: subtract ? '#97cdd8' : i % 2 ? '#e6d6ef' : '#f3ddaa',
      label: divide ? `Explorer ${i + 1}` : '',
      visual: !divide,
      onTap: () => {
        if (selected === null) {
          api.feedback('Choose a star biscuit, then an explorer.')
          return
        }
        put(selected, i)
        selected = null
        cards.forEach((card) => card.select(false))
      },
    })
    recipient.group.name = `quantity-recipient-${i}`
    recipient.group.userData.count = 0
    recipients.push(recipient)
    if (divide) api.actor('rabbit', 0.5, x, receiverZ - 0.7, 0.25)
  }

  // Addition starts with two visibly separate stashes. Other stories start
  // with a compact pool; each miniature has one generous native touch target.
  const columns = Math.min(total, 7)
  for (let i = 0; i < total; i++) {
    let x = i % columns - (columns - 1) / 2
    let z = 0.15 + Math.floor(i / columns) * 0.85
    const secondStash = operation === 'add' && i >= challenge.a
    if (operation === 'add') {
      const index = secondStash ? i - challenge.a : i
      x = (secondStash ? 1.8 : -1.8) + (index % 2 - 0.5) * 0.7
      z = 0.3 + Math.floor(index / 2) * 0.65
    }
    const toy = api.actor(item, 0.4, x, z)
    toy.name = `quantity-toy-${i}`
    toy.userData.home = new THREE.Vector3(x, 0.2, z)
    toys.push(toy)

    const card = api.tile({
      x,
      z,
      size: 0.66,
      depth: 0.6,
      colour: secondStash ? '#f5ccd4' : '#dceacb',
      onTap: () => {
        if (placed.has(i)) remove(i)
        else if (divide) {
          selected = i
          cards.forEach((other, j) => other.select(i === j))
          api.audio.speak('Choose an explorer.')
        } else put(i, 0)
      },
    })
    card.button.setAttribute('aria-label', `${item} ${i + 1}, move or return`)
    cards.push(card)

    api.onDrag(card, {
      move: (p) => {
        if (!placed.has(i)) toy.position.set(p.x, 0.45, p.z)
      },
      drop: (p) => {
        if (placed.has(i)) return
        const index = recipients.findIndex((r) =>
          Math.abs(p.x - r.x) < (groups > 1 ? 0.8 : 3) && Math.abs(p.z - receiverZ) < 1.15)
        if (index >= 0) put(i, index)
        else travel(api, toy, toy.userData.home)
      },
      cancel: () => {
        if (!placed.has(i)) travel(api, toy, toy.userData.home)
      },
    })
  }

  function ready() {
    if (subtract) return placed.size === challenge.b
    return placed.size === total && (!divide || recipients.every((r) => r.group.userData.count === target))
  }

  function update() {
    const counts = Array(groups).fill(0)
    for (const [i, group] of placed) {
      const n = counts[group]++
      // Explorers get a narrow two-wide stack; a single receiver gets rows of six.
      const offsetX = groups > 1 ? (n % 2 - 0.5) * 0.35 : (n % 6 - 2.5) * 0.65
      const offsetZ = groups > 1 ? -0.3 + Math.floor(n / 2) * 0.24 : (Math.floor(n / 6) - 0.5) * 0.42
      travel(api, toys[i], new THREE.Vector3(recipients[group].x + offsetX, 0.22, receiverZ + offsetZ))
    }
    recipients.forEach((r, i) => { r.group.userData.count = counts[i] })
    status.textContent = subtract ? `${placed.size} swam away · ${total - placed.size} remain`
      : divide ? `Shares: ${counts.join(' · ')}`
      : `${placed.size} acorns brought together`
    answers.forEach((tile) => tile.enable(ready()))
    if (ready()) {
      api.hint(divide
        ? 'Every explorer has an equal share. How many does one explorer have?'
        : 'The story is ready. Count the toys, then choose an answer.')
    }
    api.invalidate()
  }

  function put(i, group) {
    if (placed.has(i)) return
    if (subtract && placed.size === challenge.b) {
      api.feedback(`Only ${challenge.b} fish swim away. The others stay.`)
      travel(api, toys[i], toys[i].userData.home)
      return
    }
    placed.set(i, group)
    cards[i].select(true)
    api.audio.note(300 + placed.size * 15)
    update()
  }

  function remove(i) {
    placed.delete(i)
    cards[i].select(false)
    travel(api, toys[i], toys[i].userData.home)
    update()
  }

  api.action('⌫ Undo move', () => {
    const last = [...placed.keys()].at(-1)
    if (last !== undefined) remove(last)
  })
  api.action('↶ Reset', () => api.reset())
  api.hint(divide ? 'Carry stars to explorers, or tap a star then an explorer. Make every share equal.'
    : subtract ? `Tap or carry ${challenge.b} fish into the blue water. See how many stay.`
    : 'Carry or tap the acorns to bring both stashes together.')
}

// Multiplication: fill equal trays one bun at a time, then count them all.
function bakery(challenge, api) {
  const trayCount = challenge.a
  const perTray = challenge.b
  const filled = Array(trayCount).fill(0)
  const buns = []
  const status = api.readout(`0 buns · ${trayCount} empty trays`)
  const answers = api.grid(challenge.tiles, (value) => ({
    label: String(value),
    onTap: () => api.check(value === challenge.target, 'Count each tray’s buns, then combine the equal groups.'),
  }), { spacing: 1.65, z: 2.7, size: 1.2, depth: 1.05 })
  answers.forEach((tile) => tile.enable(false))

  for (let i = 0; i < trayCount; i++) {
    const x = (i - (trayCount - 1) / 2) * 1.55
    const tray = api.tile({
      x,
      z: -0.6,
      size: 1.4,
      depth: 2.7,
      colour: i % 2 ? '#e6d5ee' : '#f6deaf',
      label: `0 / ${perTray}`,
      onTap: () => {
        if (filled[i] === perTray) return
        const index = filled[i]++
        const bun = buns[i][index]
        bun.visible = true
        travel(api, bun, new THREE.Vector3(x + (index % 2 - 0.5) * 0.48, 0.25, -1.35 + Math.floor(index / 2) * 0.65))
        tray.label(`${filled[i]} / ${perTray}`)
        tray.select(filled[i] === perTray)
        api.audio.note(300 + filled[i] * 30)
        const total = filled.reduce((sum, n) => sum + n, 0)
        status.textContent = `${trayCount} trays · ${total} buns`
        if (filled.every((n) => n === perTray)) {
          answers.forEach((tile) => tile.enable(true))
          api.hint(`${trayCount} equal groups of ${perTray}. How many buns altogether?`)
        }
      },
    })
    tray.button.setAttribute('aria-label', `Fill tray ${i + 1}`)
    buns.push(Array.from({ length: perTray }, () => {
      const bun = api.actor(challenge.item, 0.4, 0, 1.4)
      bun.visible = false
      return bun
    }))
  }
  api.action('↶ Reset', () => api.reset())
  api.hint(`Tap a tray to add a bun. Fill every tray with ${perTray} buns.`)
}

// A beam balance: the left pan holds the target, the child adds weights to the right.
function balance(challenge, api) {
  const { target, item } = challenge
  const capacity = target + 6
  const weights = []
  let sum = challenge.base

  const pivot = api.place(new THREE.Group(), 0, 1.3, 0)
  pivot.add(api.block(5.5, 0.15, 0.24, '#b398ca'))
  api.place(api.mesh(new THREE.CylinderGeometry(0.5, 0.65, 1.15, 3), '#e1b980'), 0, 0.55, 0)
  const pans = [-2.35, 2.35].map((x, i) => {
    const pan = api.place(new THREE.Group(), x, 1.15, 0)
    pan.name = i ? 'balance-right' : 'balance-left'
    pan.add(api.block(2, 0.13, 1.65, i ? '#e3d5f2' : '#daebcc'))
    return pan
  })
  // Both pans get a fixed pool of toys; the right pan shows the first `sum`.
  const loads = pans.map((pan, i) => Array.from({ length: i ? capacity : target }, (_, n) => {
    const toy = api.actor(item, 0.28, (n % 4 - 1.5) * 0.38, -0.5 + Math.floor(n / 4) * 0.35, 0.1, pan)
    toy.visible = !i || n < sum
    return toy
  }))
  const labels = pans.map((pan, i) => api.tile({
    x: pan.position.x, z: 1.4, label: String(i ? sum : target), size: 1.35, depth: 0.7, thin: true, visual: true,
  }))
  labels.forEach((tile) => { tile.base.visible = false })
  const status = api.readout(`Left ${target} · Right ${sum}`)

  function update() {
    const angle = THREE.MathUtils.clamp((target - sum) * 0.04, -0.2, 0.2)
    const from = pivot.rotation.z
    api.animate(0.4, (t) => {
      pivot.rotation.z = THREE.MathUtils.lerp(from, angle, t)
      // Each pan hangs from its end of the tilted beam.
      for (const pan of pans) pan.position.y = 1.15 + pan.position.x * Math.sin(pivot.rotation.z)
    }, pivot)
    loads[1].forEach((toy, i) => { toy.visible = i < sum })
    labels[1].label(String(sum))
    status.textContent = `Left ${target} · Right ${sum}`
    api.invalidate()
  }

  for (const n of challenge.tiles) {
    api.action(`+ ${n}`, () => {
      if (sum + n > capacity) {
        api.feedback('The pan is full. Undo a weight to try another combination.')
        return
      }
      weights.push(n)
      sum += n
      api.audio.note(300 + sum * 15)
      update()
    })
  }
  api.action('⌫ Undo', () => {
    if (weights.length) sum -= weights.pop()
    update()
  })
  api.action('Check balance ✓', () => {
    if (sum === target) {
      api.success(`${challenge.base}${weights.map((n) => ` + ${n}`).join('')} = ${target}. Both pans carry the same weight.`)
    } else {
      api.feedback(sum > target
        ? 'The right pan is lower and heavier. Undo a weight.'
        : 'The left pan is lower and heavier. Add to the right pan.')
    }
  }, { primary: true })
  api.action('↶ Reset', () => api.reset())
  api.hint('Watch both pans move. Add or undo weights to bring the beam level.')
  update()
}

// Lay equal units end to end between two marks (stacked upwards for the giraffe).
function measure(challenge, game, api) {
  const { target } = challenge
  const unit = 0.68
  const length = target * unit
  const origin = -length / 2
  const vertical = game.id === 'giraffe-ruler'
  const unitX = (i) => origin + (i + 0.5) * unit
  const pieces = []
  let count = 0

  if (vertical) {
    api.actor('giraffe', length, -0.9, 0.4, 0).name = 'measured-giraffe'
    api.place(api.block(3, 0.06, 0.85, '#dac9ab'), 0, 0.025, 0.4)
    api.place(api.block(2.5, 0.05, 0.08, game.accent), 0.1, length, 0.4)
  } else if (game.id === 'bridge-builder') {
    for (const x of [origin - 0.75, -origin + 0.75]) api.place(api.block(1.5, 0.4, 2.2, '#b5d5aa'), x, 0.05, -0.4)
    api.place(api.block(length, 0.05, 1.7, '#91c8d6'), 0, 0.03, -0.4)
  } else if (game.id === 'garden-fence') {
    api.place(api.block(length, 0.15, 1.4, '#b59780'), 0, 0.13, -1)
    for (let i = 0; i < target; i++) api.actor('flower', 0.6, unitX(i), -1.1)
  } else {
    api.place(api.block(length, 0.06, 0.48, '#ddc7ee'), 0, 0.2, -0.4)
    api.actor('star', 0.7, origin - 0.4, -0.4)
    for (let i = 0; i < target; i++) api.place(api.mesh(new THREE.SphereGeometry(0.045, 8, 6), '#fff6bc'), unitX(i), 0.3, -0.4)
  }
  if (!vertical) for (const x of [origin, -origin]) api.place(api.block(0.045, 0.2, 1.1, '#7a7294'), x, 0.24, -0.4)

  // A fixed pool avoids allocating geometry whenever a child adds and undoes.
  for (let i = 0; i < 12; i++) {
    const root = new THREE.Group()
    root.name = `measurement-unit-${i}`
    if (vertical) {
      api.place(api.block(unit * 0.7, unit, 0.6, i % 2 ? '#edb89b' : '#b8d3ae'), 0, unit / 2, 0, root)
      root.position.set(1.1, i * unit, 0.4)
    } else if (game.id === 'garden-fence') {
      for (const dx of [-0.22, 0.22]) api.place(api.block(0.075, 0.55, 0.12, '#f5ead3'), dx, 0.28, 0, root)
      for (const y of [0.18, 0.4]) api.place(api.block(unit, 0.065, 0.1, '#f5ead3'), 0, y, 0, root)
      root.position.set(unitX(i), 0.13, -0.2)
    } else {
      root.add(api.block(unit - 0.018, 0.12, game.id === 'bridge-builder' ? 1.1 : 0.65, i % 2 ? '#f3d7ac' : '#c0d8b4'))
      root.position.set(unitX(i), 0.3, -0.4)
    }
    root.visible = false
    api.board.add(root)
    pieces.push(root)
  }

  const status = api.readout('0 equal units')
  // One extra unit is allowed so the child can see what overshooting looks like.
  const add = api.action('Add a unit +', () => {
    if (count > target) return
    const piece = pieces[count]
    piece.visible = true
    piece.scale.setScalar(0.2)
    api.animate(0.25, (t) => piece.scale.setScalar(0.2 + 0.8 * t), piece)
    count++
    update()
  })
  function update() {
    status.textContent = `${count} equal ${game.unit}`
    add.disabled = count > target
    api.invalidate()
  }
  api.action('⌫ Undo', () => {
    if (count) pieces[--count].visible = false
    update()
  })
  api.action('Check length ✓', () => {
    if (count !== target) {
      api.feedback(count < target
        ? 'Start at the first mark. Add equal units until you reach the other mark.'
        : 'One unit goes past the mark. Undo it.')
      return
    }
    if (game.id === 'bridge-builder') {
      const boat = api.actor('boat', 0.6, origin - 0.5, -0.4, 0.55)
      travel(api, boat, new THREE.Vector3(-origin + 0.5, 0.55, -0.4))
    }
    api.success(challenge.fact)
  }, { primary: true })
  api.action('↶ Reset', () => api.reset())
  api.hint(vertical
    ? 'Stack equal cubes from the ground to the giraffe’s height.'
    : 'Place equal units from the first mark to the last. Each unit touches its neighbour.')
}
