import * as THREE from 'three'

export function runStory(c, g, a) {
  if (c.mode !== 'choice') return false
  choice(c, g, a)
  return true
}

// Answer tiles start with an emoji; these name the toy model it stands for.
const iconToys = {
  '☂️': 'umbrella', '🧤': 'gloves', '👒': 'hat', '🥾': 'boots', '🕶️': 'glasses', '🩴': 'sandal',
  '🧣': 'scarf', '🥦': 'broccoli', '🍐': 'pear', '💧': 'cup',
}
const toyFor = (tile) => iconToys[tile.split(' ')[0]]

const senseObjects = ['drum', 'flower', 'butterfly', 'teddy', 'lemon']
const senseNotes = [
  'Listen to the drum’s sound.',
  'Imagine the scent of a real flower.',
  'Look at the colours and wing shapes.',
  'A real soft toy lets us explore texture with touch.',
  'Imagine the taste of a lemon.',
]

const retries = {
  kindness: 'Ask what your friend needs first. Then choose an action that helps now.',
  food: 'Think about which food or routine the story asks for.',
  weather: 'Think about the object, the weather, and the body part in the story.',
  senses: 'Think about the object, the weather, and the body part in the story.',
}
const hints = {
  kindness: 'There can be more than one caring answer. Ask, listen, and help together.',
  weather: 'Imagine your explorer outside. What matches this weather?',
  food: 'Choose the food or routine asked for. Different foods belong in a varied day.',
  senses: 'Explore the object, then think about which sense the story asks about.',
}

function choice(c, g, a) {
  const story = { 'weather-wardrobe': 'weather', 'kindness-cafe': 'kindness', 'healthy-plate-party': 'food' }[g.id] || 'senses'
  // Every fourth kindness story starts with a spill that a good answer cleans up.
  const spill = story === 'kindness' && c.storyIndex % 4 === 2
  const characters = story === 'kindness' ? ['bear', 'rabbit', 'fox', 'turtle'] : ['rabbit']
  const friend = a.actor(characters[c.storyIndex % characters.length], 1.4, 0, -1.7)
  let busy = false
  let spillMark = null

  if (story === 'weather') {
    const sky = c.prompt.includes('Snow') ? '#edf2fb' : c.prompt.includes('Sun') ? '#edcd85' : '#aebdcf'
    const cloud = a.mesh(new THREE.SphereGeometry(0.55, 20, 12), sky)
    cloud.scale.y = 0.4
    cloud.position.set(-2, 1, -2)
    a.board.add(cloud)
    if (c.prompt.includes('Rain') || c.prompt.includes('Puddles')) {
      for (let i = 0; i < 6; i++) {
        const drop = a.mesh(new THREE.SphereGeometry(0.035, 8, 6), '#9cc7de')
        drop.scale.y = 2.5
        drop.position.set(-2.5 + i * 0.2, 0.6 + (i % 3) * 0.2, -2)
        a.board.add(drop)
      }
    }
  } else if (story === 'kindness') {
    const table = a.block(2.5, 0.15, 1.3, '#d3b38f')
    table.position.set(0, 0.5, -0.7)
    a.board.add(table)
    a.actor('cup', 0.5, 1, -0.6, 0.58)
    if (spill) {
      spillMark = a.mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.015, 24), '#dea6b5')
      spillMark.position.set(-0.5, 0.59, -0.6)
      a.board.add(spillMark)
    }
  } else if (story === 'food') {
    const plate = a.mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.11, 48), '#fff3df')
    plate.position.set(0, 0.2, -1.3)
    a.board.add(plate)
    friend.position.x = -2.8
    a.actor('bread', 0.65, -0.7, -1.7, 0.28)
    a.actor('pear', 0.65, 0.55, -1.7, 0.28)
  } else {
    friend.position.x = -2.7
    const sense = c.storyIndex % 5
    const object = a.actor(senseObjects[sense], 1, 0, -1.6)
    a.action('Explore object', () => {
      a.animate(0.8, (t) => {
        object.rotation.y = Math.sin(t * Math.PI) * 0.5
        object.position.y = 0.2 + Math.sin(t * Math.PI) * 0.25
      }, object)
      if (sense === 0) a.audio.note(330, 0.65)
      a.feedback(senseNotes[sense], true)
    })
  }

  const successes = {
    kindness: (tile) => `${tile.replace(/^[^\p{L}\p{N}]+\s/u, '')}. Asking and helping together gives your friend a choice.`,
    food: () => 'A varied plate includes different foods. You helped with this part of the story.',
    weather: () => 'Your explorer is dressed for this weather!',
    senses: () => 'Our senses help us notice different things about the same world.',
  }

  const cards = a.grid(c.tiles, (tile) => ({
    label: tile,
    size: 2.25,
    depth: 1.9,
    onTap: (t) => {
      if (busy) return
      if (!c.acceptable.includes(tile)) {
        a.feedback(retries[story])
        return
      }
      busy = true
      const toy = toyFor(tile)
      if (story === 'weather' && toy) {
        // The chosen clothing flies over to the explorer.
        const item = a.actor(toy, 0.7, t.x, t.z)
        const start = item.position.clone()
        const end = new THREE.Vector3(0.4, 0.9, -1.7)
        a.animate(0.8, (p) => item.position.lerpVectors(start, end, p), item)
      }
      if (story === 'food' && toy) a.actor(toy, 0.7, 0.5, -0.7, 0.28)
      if (spillMark) spillMark.visible = false
      a.animate(0.8, (p) => { friend.position.y = 0.2 + Math.sin(p * Math.PI) * 0.3 }, friend)
      a.success(successes[story](tile))
    },
  }), { columns: 3, spacing: 2.6, z: 1.2 })

  if (story === 'weather' || story === 'food') {
    cards.forEach((t, i) => {
      const name = toyFor(c.tiles[i])
      if (!name || !g.storyToys.includes(name)) return
      const toy = a.model(name, 0.6)
      toy.position.y = 0.2
      t.group.add(toy)
    })
  }

  a.action('🔈 Hear story', () => a.audio.speak(c.prompt))
  a.hint(hints[story])
}
