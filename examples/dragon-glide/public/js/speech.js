// One calm voice per game: spoken words wait their turn instead of cutting each other off.
// say() queues by default; sayNow() (or { interrupt: true }) clears what is waiting first.
// onend runs when the words finish (or a fallback timer, for browsers that never fire end),
// but not for words cut short by hush().
export function createVoice({ isMuted = () => false, rate = 0.85, pitch = 1.05 } = {}) {
  const canSpeak = 'speechSynthesis' in window
  let pending = 0
  let waiters = []
  let gen = 0

  function settle() {
    if (pending > 0) return
    const done = waiters
    waiters = []
    for (const resolve of done) resolve()
  }

  function hush() {
    gen++
    pending = 0
    if (canSpeak) speechSynthesis.cancel()
    settle()
  }

  function say(text, { interrupt = false, onend } = {}) {
    if (interrupt) hush()
    if (!text || isMuted() || !canSpeak) {
      onend?.()
      return
    }
    const myGen = gen
    const words = new SpeechSynthesisUtterance(text)
    words.lang = 'en-US'
    words.rate = rate
    words.pitch = pitch
    pending++
    let ended = false
    // Some browsers never fire onend (no voices installed): never wait longer than the words need.
    const fallback = setTimeout(finish, (2 + pending * 1.5 + text.length * 0.09) * 1000)
    function finish() {
      if (ended) return
      ended = true
      clearTimeout(fallback)
      // Words cut short by hush() belong to a scene that was left: their onend no longer applies
      if (myGen !== gen) return
      pending = Math.max(0, pending - 1)
      onend?.()
      settle()
    }
    words.onend = words.onerror = finish
    speechSynthesis.speak(words)
  }

  addEventListener('pagehide', hush)
  document.addEventListener('visibilitychange', () => { if (document.hidden) hush() })

  return {
    say,
    /** Tap feedback: says this now, dropping anything still waiting. */
    sayNow: (text, options) => say(text, { ...options, interrupt: true }),
    hush,
    get speaking() { return pending > 0 },
    /** Resolves once everything queued has been said (or hushed). */
    idle: () => (pending > 0 ? new Promise((resolve) => waiters.push(resolve)) : Promise.resolve()),
  }
}
