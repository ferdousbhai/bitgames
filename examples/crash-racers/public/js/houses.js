import { canvasTexture } from './util.js'

/**
 * The houses of the present gates (see gates.js): each has a picture (🍎 the
 * fruit shop, 🐶 the dog's house…), a resident who waves, a question to think
 * about, and two presents it would like (an easy one and a harder one).
 */
export const KINDS = [
  { id: 'apple', emoji: '🍎', resident: '🐻', house: 'the fruit shop', colour: '#ff6b6b', ask: 'What does a fruit shop sell?',
    gifts: [{ emoji: '🍌', name: 'Bananas' }, { emoji: '🍐', name: 'Pears' }] },
  { id: 'dog', emoji: '🐶', resident: '🐶', house: "the dog's house", colour: '#c98b5a', ask: 'What would a dog like?',
    gifts: [{ emoji: '🦴', name: 'A bone' }, { emoji: '🎾', name: 'A ball' }] },
  { id: 'flower', emoji: '🌸', resident: '🐰', house: 'the florist', colour: '#ff8fc4', ask: 'What does a florist sell?',
    gifts: [{ emoji: '🌷', name: 'Tulips' }, { emoji: '🌱', name: 'Little plants' }] },
  { id: 'book', emoji: '📚', resident: '🦉', house: 'the library', colour: '#6c8cff', ask: 'What do you find in a library?',
    gifts: [{ emoji: '📖', name: 'A story book' }, { emoji: '📕', name: 'A red book' }] },
  { id: 'cake', emoji: '🎂', resident: '🐼', house: 'the birthday house', colour: '#b388eb', ask: 'What do you need for a birthday?',
    gifts: [{ emoji: '🎈', name: 'Balloons' }, { emoji: '🕯️', name: 'Candles' }] },
  { id: 'teddy', emoji: '🧸', resident: '🦊', house: 'the toy shop', colour: '#8ac926', ask: 'What does a toy shop sell?',
    gifts: [{ emoji: '🪁', name: 'A kite' }, { emoji: '🪀', name: 'A yo-yo' }] },
]

const EMOJI_FONT = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
const textures = new Map()
/** A round picture: the emoji on a white disc ringed in `ring` (drawn once per emoji and colour). */
export function pictureTexture(emoji, ring) {
  const key = emoji + ring
  if (!textures.has(key)) {
    textures.set(key, canvasTexture(256, 256, (g) => {
      g.beginPath()
      g.arc(128, 128, 118, 0, Math.PI * 2)
      g.fillStyle = ring
      g.fill()
      g.lineWidth = 8
      g.strokeStyle = '#2b2d42'
      g.stroke()
      g.beginPath()
      g.arc(128, 128, 92, 0, Math.PI * 2)
      g.fillStyle = '#ffffff'
      g.fill()
      g.font = `128px ${EMOJI_FONT}`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(emoji, 128, 138)
    }, { repeat: [1, 1] }))
  }
  return textures.get(key)
}
