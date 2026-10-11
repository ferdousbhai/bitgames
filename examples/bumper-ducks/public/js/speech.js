// One calm voice per game: spoken words wait their turn instead of cutting each other off.
// say() queues by default; sayNow() (or { interrupt: true }) clears what is waiting first.
// onend runs when the words finish (or a fallback timer, for browsers that never fire end),
// but not for words cut short by hush().
/** "red, yellow and blue": one list style for everything the games say. */
export const listWords = new Intl.ListFormat('en-GB', { type: 'conjunction' })

/** Counting aloud stops here; past it a soft tick and the picture carry the count. */
export const COUNT_ALOUD = 5

export function createVoice({ muted = false, rate = 0.85, pitch = 1.05 } = {}) {
  const canSpeak = 'speechSynthesis' in window
  let pending = 0
  let gen = 0
  // Sentences already said this round: sayOnce() skips them so the voice never nags
  const said = new Set()

  function hush() {
    gen++
    pending = 0
    if (canSpeak) speechSynthesis.cancel()
  }

  function say(text, { interrupt = false, onend } = {}) {
    if (interrupt) hush()
    if (!text || muted || !canSpeak) {
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
    /** Says this only once per round (see newRound): goals, hints and number bonds never repeat. */
    sayOnce(text, options) {
      if (said.has(text)) {
        options?.onend?.()
        return false
      }
      said.add(text)
      say(text, options)
      return true
    },
    /** Starts a fresh round: sayOnce() may say everything again. */
    newRound() { said.clear() },
    /**
     * Counts one more thing: says the number aloud up to `aloud` (5 by default), then stays quiet,
     * so the picture and a soft tick do the counting. Returns true when the number was spoken.
     */
    count(n, { aloud = COUNT_ALOUD, interrupt = true } = {}) {
      if (n > aloud) return false
      say(String(n), { interrupt })
      return true
    },
    /** The game's sound switch: muting also stops words already playing. */
    setMuted(on) {
      muted = on
      if (on) hush()
    },
    get speaking() { return pending > 0 },
  }
}
