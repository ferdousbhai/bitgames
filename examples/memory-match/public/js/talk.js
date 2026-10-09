import { VOICE_LENGTH } from './audio.js'

/**
 * One voice at a time: animal calls and spoken words wait their turn, so a name is never said
 * over a moo. Silent (and instant) while muted; words go through the game's one voice (speech.js).
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
  }

  /** An animal's call. onStart runs when it actually plays (the sound card's waves pulse then). */
  call(animal, { baby = false, onStart, droppable = false } = {}) {
    this.push({ animal, baby, onStart, droppable })
  }

  /** Words, spoken after whatever is already queued. Droppable words go first if taps pile up. */
  say(text, { droppable = false } = {}) {
    this.push({ text, droppable })
  }

  push(step) {
    this.queue.push(step)
    // Quick little fingers: keep the queue short by dropping the oldest name.
    while (this.queue.length > 4) {
      const i = this.queue.findIndex((s) => s.droppable)
      if (i < 0) break
      this.queue.splice(i, 1)
    }
    if (!this.running) this.run()
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
      step.onStart?.()
      if (!this.sound.live) continue
      if (step.animal) {
        this.sound.voice(step.animal, 0, { baby: step.baby })
        await this.pause((VOICE_LENGTH[step.animal] ?? 0.6) + 0.15)
      } else if (step.text) {
        await this.speak(step.text)
      }
    }
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
