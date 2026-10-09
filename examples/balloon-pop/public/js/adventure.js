// Optional learning missions are driven by real game events, not weighted scores.
// Each option is { emoji, label, pace?, goal?, target?, sequence?, accept?(data, count), reward }.
// Without accept, every event counts. Pass the game's own voice (speech.js) so mission words queue
// with the game's words instead of cutting them off; renderChoice draws the choice button.
import { createVoice } from './speech.js'

export function createAdventure({ id, anchor, hud, options, celebrate, renderProgress, renderChoice, isMuted = () => false, voice = createVoice({ isMuted, rate: 0.82 }) }) {
  const storageKey = `${id}:adventure`
  let selected = 0
  let count = 0
  let done = false
  let enabled = true
  try {
    const saved = Number(localStorage.getItem(storageKey))
    if (Number.isInteger(saved) && saved >= 0 && saved < options.length) selected = saved
  } catch {}

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'adventure-choice'
  button.id = 'adventure-choice'
  anchor.before(button)

  const goal = document.createElement('div')
  goal.className = 'adventure-goal'
  goal.id = 'adventure-goal'
  goal.setAttribute('role', 'status')
  goal.setAttribute('aria-live', 'polite')
  hud.append(goal)

  const speak = (text) => voice.say(text)
  for (const buttonId of ['home', 'sound', 'mute']) document.getElementById(buttonId)?.addEventListener('click', () => voice.hush())

  function update() {
    const option = options[selected]
    if (renderChoice) renderChoice(button, option)
    else button.textContent = `${option.emoji} ${option.label}`
    button.setAttribute('aria-label', `Adventure: ${option.label}. Tap to choose another.`)
    goal.hidden = !option.goal || !enabled
    goal.textContent = option.goal ? `${done ? '★ ' : ''}${option.goal} · ${count} / ${option.target}` : ''
    renderProgress?.(goal, option, count)
  }

  function begin() {
    count = 0
    done = false
    update()
  }

  function select(index, { silent = false } = {}) {
    selected = ((index % options.length) + options.length) % options.length
    try { localStorage.setItem(storageKey, String(selected)) } catch {}
    begin()
    // Choosing is tap feedback: each new choice replaces the last one's words
    if (!silent) voice.say(options[selected].goal || options[selected].label, { interrupt: true })
  }

  button.onclick = () => select(selected + 1)
  update()

  return {
    enable(value) {
      enabled = value
      button.disabled = !value
      update()
    },
    get option() { return options[selected] },
    get selected() { return selected },
    select,
    get pace() { return options[selected].pace || 1 },
    get progress() { return count },
    get complete() { return done },
    begin,
    // Counts one game event toward the mission; a sequence mission names the expected next step on a miss.
    event(data) {
      const option = options[selected]
      if (!enabled || !option.goal || done) return
      if (option.accept && !option.accept(data, count)) {
        if (option.sequence) speak(`Next: ${option.sequence[count]}`)
        return
      }
      count++
      if (count === option.target) {
        done = true
        update()
        celebrate?.(option.reward)
        speak(option.reward)
      } else {
        update()
        speak(String(count))
      }
    },
  }
}
