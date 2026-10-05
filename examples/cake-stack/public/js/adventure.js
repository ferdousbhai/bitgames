// Optional learning missions are driven by real game events, not weighted scores.
// Each option is { emoji, label, pace?, goal?, target?, sequence?, accept?(data, count), reward }.
// Without accept, every event counts.
export function createAdventure({ id, anchor, hud, options, celebrate, renderProgress, isMuted = () => false }) {
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

  const canSpeak = 'speechSynthesis' in window
  const hush = () => { if (canSpeak) speechSynthesis.cancel() }
  function speak(text) {
    if (isMuted() || !canSpeak) return
    speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = 0.82
    speechSynthesis.speak(utterance)
  }
  for (const buttonId of ['home', 'sound', 'mute']) document.getElementById(buttonId)?.addEventListener('click', hush)
  document.addEventListener('visibilitychange', () => { if (document.hidden) hush() })

  function update() {
    const option = options[selected]
    button.textContent = `${option.emoji} ${option.label}`
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

  button.onclick = () => {
    selected = (selected + 1) % options.length
    try { localStorage.setItem(storageKey, String(selected)) } catch {}
    begin()
    speak(options[selected].goal || options[selected].label)
  }
  update()

  return {
    enable(value) {
      enabled = value
      button.disabled = !value
      update()
    },
    get option() { return options[selected] },
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
