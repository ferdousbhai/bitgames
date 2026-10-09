// Optional learning missions are driven by real game events, not weighted scores.
// Each option is { emoji, label, pictures?, caption?, icon?, pace?, goal?, target?, sequence?,
// hint?(count), accept?(data, count), reward }. Without accept, every event counts.
// The game's voice (speech.js) is required so mission words queue with the game's own words.
// announce(text, kind) decides what is said ('choice' | 'count' | 'reward' | 'hint'); it defaults
// to saying everything. renderChoice decorates the default button; renderProgress replaces the
// default picture row (the goal's aria-label is already set). place(button) puts the button somewhere other than just before anchor.
export function createAdventure({ id, anchor, place = (button) => anchor.before(button), hud, options, voice, celebrate, renderProgress, renderChoice, goalWords = false, announce = (text, kind) => voice.say(text, { interrupt: kind === 'choice' }) }) {
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
  place(button)

  const goal = document.createElement('div')
  goal.className = 'adventure-goal'
  goal.id = 'adventure-goal'
  goal.setAttribute('role', 'status')
  goal.setAttribute('aria-live', 'polite')
  hud.append(goal)

  const span = (className, content) => {
    const el = document.createElement('span')
    el.className = className
    if (content instanceof Node) el.append(content)
    else el.textContent = content
    return el
  }

  /** Pictures, caption and a ↻ that says "tap for another". */
  function drawChoice(option) {
    const pictures = span('adventure-pictures', option.pictures ?? option.emoji)
    pictures.setAttribute('aria-hidden', 'true')
    const next = span('adventure-next', '↻')
    next.setAttribute('aria-hidden', 'true')
    button.replaceChildren(pictures, span('adventure-caption', option.caption ?? option.label), next)
  }

  /** One picture per step, lit as the child gets it, then the count (or a star when done). */
  function drawProgress(option) {
    if (!option.icon) {
      goal.textContent = `${done ? '★ ' : ''}${option.goal} · ${count} / ${option.target}`
      return
    }
    const row = span('adventure-steps', '')
    row.setAttribute('aria-hidden', 'true')
    for (let i = 0; i < option.target; i++) {
      const icon = typeof option.icon === 'function' ? option.icon() : option.icon
      row.append(span(`adventure-step${i < count ? ' adventure-got' : ''}${i === count - 1 ? ' adventure-new' : ''}`, icon))
    }
    const tally = document.createElement('b')
    tally.textContent = done ? '⭐' : `${count} / ${option.target}`
    goal.replaceChildren(...(goalWords ? [span('adventure-goal-words', option.goal)] : []), row, tally)
  }

  function update() {
    const option = options[selected]
    drawChoice(option)
    renderChoice?.(button, option)
    button.setAttribute('aria-label', `Adventure: ${option.label}. Tap to choose another.`)
    goal.hidden = !option.goal || !enabled
    goal.classList.toggle('adventure-done', done)
    if (!option.goal) return
    goal.setAttribute('aria-label', `${option.goal}: ${count} of ${option.target}`)
    if (renderProgress) renderProgress(goal, option, count)
    else drawProgress(option)
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
    if (!silent) announce(options[selected].goal || options[selected].label, 'choice')
  }

  button.onclick = () => select(selected + 1)
  update()

  return {
    enable(value) {
      enabled = value
      button.hidden = !value
      update()
    },
    get option() { return options[selected] },
    get selected() { return selected },
    select,
    get pace() { return options[selected].pace || 1 },
    get progress() { return count },
    get complete() { return done },
    begin,
    /**
     * Counts one game event toward the mission and says what happened.
     * Returns 'counted', 'done', 'rejected' (a sequence step out of order), or null when no mission counts.
     */
    event(data) {
      const option = options[selected]
      if (!enabled || !option.goal || done) return null
      if (option.accept && !option.accept(data, count)) {
        if (option.sequence) announce(option.hint?.(count) ?? `Next: ${option.sequence[count]}`, 'hint')
        return 'rejected'
      }
      count++
      done = count === option.target
      update()
      if (done) {
        celebrate?.(option.reward)
        announce(option.reward, 'reward')
        return 'done'
      }
      announce(String(count), 'count')
      return 'counted'
    },
  }
}
