import { VOICE_LENGTH } from './audio.js'

/**
 * One voice at a time: animal calls and spoken words wait their turn, so a name is never said
 * over a moo. Silent (and instant) while muted; words go through the game's one voice (speech.js).
 *
 * The queue never lags behind play: a step can say when it has gone stale (a card's name once that
 * card has turned back or been matched), and stale steps are skipped instead of said late.
 */
export class Talk {
  constructor(sound, voice) {
    this.sound = sound
    this.voice = voice
    this.queue = []
    this.running = false
    this.gen = 0
    this.wake = null // resolves the step that is playing now (clear() cuts it short)
    this.waiters = []
    this.said = new Set()
  }

  /**
   * An animal's call. onStart runs when it actually plays (the sound card's waves pulse then);
   * stale() true means it no longer matters and is skipped.
   */
  call(animal, { baby = false, onStart, droppable = false, stale } = {}) {
    this.push({ animal, baby, onStart, droppable, stale })
  }

  /** Words, spoken after whatever is already queued. Droppable words go first if taps pile up. */
  say(text, { droppable = false, onStart, stale, goal = false } = {}) {
    this.push({ text, droppable, onStart, stale, goal })
  }

  /** The child has started turning cards: a goal still being said has done its job and stops. */
  cutGoal() {
    if (!this.current?.goal) return
    this.voice.hush()
    this.wake?.()
  }

  /** Words said at most once a round (see newRound): a fact heard once does not need repeating. */
  sayOnce(text, options) {
    if (this.said.has(text)) return false
    this.said.add(text)
    this.say(text, options)
    return true
  }

  /** Is these words already waiting to be said? */
  has(text) {
    return this.queue.some((step) => step.text === text)
  }

  /** A fresh board: sayOnce() may say everything again. */
  newRound() {
    this.said.clear()
  }

  push(step) {
    this.queue.push(step)
    this.trim(4)
    if (!this.running) this.run()
  }

  /**
   * Forgets what went stale, then (quick little fingers) drops the oldest droppable steps until at
   * most `keep` are waiting. Lines that are not droppable (what a match taught) always stay.
   */
  trim(keep = 0) {
    this.queue = this.queue.filter((step) => !step.stale?.())
    while (this.queue.length > keep) {
      const i = this.queue.findIndex((s) => s.droppable)
      if (i < 0) break
      this.queue.splice(i, 1)
    }
  }

  /**
   * A clue is coming (a sound card's call, a sleeping baby's word): drops every droppable step
   * waiting, and cuts short a droppable one being said (a long goal line), so the clue is next.
   */
  hurry() {
    this.trim()
    if (this.current?.droppable) {
      this.voice.hush()
      this.wake?.()
    }
  }

  get busy() {
    return this.running
  }

  /** Resolves once everything queued has been said. */
  idle() {
    return this.running ? new Promise((resolve) => this.waiters.push(resolve)) : Promise.resolve()
  }

  /** Stops talking now and forgets what was queued. */
  clear() {
    this.gen++
    this.queue = []
    this.voice.hush()
    this.wake?.()
  }

  async run() {
    this.running = true
    const gen = this.gen
    while (this.queue.length && gen === this.gen) {
      const step = this.queue.shift()
      if (step.stale?.()) continue
      this.current = step
      step.onStart?.()
      if (!this.sound.live) continue
      if (step.animal) {
        this.sound.voice(step.animal, 0, { baby: step.baby })
        await this.pause((VOICE_LENGTH[step.animal] ?? 0.6) + 0.15)
      } else if (step.text) {
        await this.speak(step.text)
      }
    }
    this.current = null
    if (gen === this.gen) this.finish()
    else {
      // clear() ran: a later push may already be waiting for this loop to stop.
      this.finish()
      if (this.queue.length) this.run()
    }
  }

  finish() {
    this.running = false
    const waiters = this.waiters
    this.waiters = []
    for (const resolve of waiters) resolve()
  }

  pause(seconds) {
    return new Promise((resolve) => {
      const id = setTimeout(done, seconds * 1000)
      function done() {
        clearTimeout(id)
        resolve()
      }
      this.wake = done
    })
  }

  speak(text) {
    return new Promise((resolve) => {
      const done = () => setTimeout(resolve, 120) // a breath between words
      this.wake = done // clear() hushes the voice, which then never calls onend
      this.voice.say(text, { onend: done })
    })
  }
}
