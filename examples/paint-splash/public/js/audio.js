/** Every sound is synthesized with Web Audio: nothing to download. */
const PENTA = [0, 2, 4, 7, 9]
const note = (step, base = 523.25) => base * 2 ** ((PENTA[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5)) / 12)
// A bouncy little tune (pentatonic steps; null is a rest) over an oom-pah bass.
const MELODY = [0, 2, 4, 2, 5, 4, 2, null, 4, 5, 7, 5, 4, 2, 0, null, 2, 2, 4, 5, 7, 7, 5, 4, 5, 4, 2, 0, 1, 2, 0, null]
const BASS = [0, -3, -1, -2]

export class Audio {
  constructor() {
    this.ctx = null
    this.muted = false
    this.musicOn = true
    this.nextBeat = 0
    this.beat = 0
    this.lastBump = 0
  }

  /** Browsers only allow sound after a tap or key press, so this runs on the first one. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running' && !document.hidden) this.ctx.resume().catch(() => {})
      return
    }
    try {
      this.ctx = new AudioContext()
    } catch {
      return
    }
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.8
    this.master.connect(this.ctx.destination)
    this.musicBus = this.ctx.createGain()
    this.musicBus.gain.value = this.musicOn ? 0.2 : 0
    this.musicBus.connect(this.master)
    const len = this.ctx.sampleRate
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    // The roller's soft "shhh" on the ground, louder the faster it rolls.
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const f = this.ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 900
    f.Q.value = 0.6
    this.rollGain = this.ctx.createGain()
    this.rollGain.gain.value = 0
    src.connect(f).connect(this.rollGain).connect(this.master)
    src.start()
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running'
  }

  setHidden(hidden) {
    if (!this.ctx) return
    if (hidden) this.ctx.suspend().catch(() => {})
    else this.ctx.resume().catch(() => {})
  }

  setMuted(muted) {
    this.muted = muted
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05)
  }

  setMusic(on) {
    this.musicOn = on
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.2 : 0, this.ctx.currentTime, 0.1)
  }

  burst({ freq, q = 1, gain = 0.4, decay = 0.2, type = 'bandpass', delay = 0 }) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    filter.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + decay)
    src.connect(filter).connect(g).connect(this.master)
    src.start(t, Math.random() * 0.5)
    src.stop(t + decay + 0.05)
  }

  tone({ freq, type = 'sine', gain = 0.2, decay = 0.2, delay = 0, slide = 0, attack = 0.005, out }) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + decay)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
    osc.connect(g).connect(out ?? this.master)
    osc.start(t)
    osc.stop(t + decay + 0.05)
  }

  /** Rolling noise follows the local painter's speed (0..1). */
  roll(amount) {
    if (!this.rollGain) return
    this.rollGain.gain.setTargetAtTime(amount * 0.12, this.ctx.currentTime, 0.08)
  }

  click() {
    this.tone({ freq: 660, type: 'triangle', gain: 0.18, decay: 0.12, slide: 300 })
  }

  /** A paint bucket: a wet SPLOSH and a happy rising run. */
  splash(near = 1) {
    this.tone({ freq: 220, type: 'sine', gain: 0.5 * near, decay: 0.35, slide: -150 })
    this.burst({ freq: 700, q: 0.8, gain: 0.6 * near, decay: 0.45, type: 'lowpass' })
    this.burst({ freq: 2400, q: 1.5, gain: 0.25 * near, decay: 0.25, delay: 0.03 })
    for (let i = 0; i < 4; i++) this.tone({ freq: note(3 + i), type: 'triangle', gain: 0.12 * near, decay: 0.2, delay: 0.12 + i * 0.06 })
  }

  /** A rainbow puddle: a sparkly glissando. */
  rainbow() {
    for (let i = 0; i < 9; i++) this.tone({ freq: note(i, 392), type: 'sine', gain: 0.13, decay: 0.3, delay: i * 0.04 })
  }

  /** Water: bloop bloop and a rubber duck squeak. */
  water(near = 1) {
    this.tone({ freq: 400, type: 'sine', gain: 0.3 * near, decay: 0.15, slide: 500 })
    this.tone({ freq: 500, type: 'sine', gain: 0.25 * near, decay: 0.15, slide: 600, delay: 0.12 })
    this.burst({ freq: 1500, q: 0.7, gain: 0.25 * near, decay: 0.35, type: 'highpass', delay: 0.05 })
    this.tone({ freq: 1400, type: 'square', gain: 0.05 * near, decay: 0.12, slide: 500, delay: 0.3 })
  }

  /** Two painters bump: a rubbery boing. */
  bump() {
    const now = performance.now()
    if (now - this.lastBump < 300) return
    this.lastBump = now
    this.tone({ freq: 180, type: 'sine', gain: 0.3, decay: 0.3, slide: 260 })
    this.tone({ freq: 600, type: 'triangle', gain: 0.08, decay: 0.15, slide: -200, delay: 0.05 })
  }

  /** Each animal's own voice. */
  voice(animal) {
    switch (animal) {
      case 'hedgehog':
        for (let i = 0; i < 3; i++) this.tone({ freq: 1500 + i * 150, type: 'sine', gain: 0.12, decay: 0.07, slide: 400, delay: i * 0.08 })
        break
      case 'piglet':
        this.tone({ freq: 220, type: 'sawtooth', gain: 0.12, decay: 0.18, slide: -60 })
        this.tone({ freq: 240, type: 'sawtooth', gain: 0.1, decay: 0.15, slide: -60, delay: 0.2 })
        break
      case 'chick':
        this.tone({ freq: 2200, type: 'sine', gain: 0.12, decay: 0.08, slide: 900 })
        this.tone({ freq: 2400, type: 'sine', gain: 0.12, decay: 0.08, slide: 900, delay: 0.12 })
        break
      default:
        this.tone({ freq: 600, type: 'triangle', gain: 0.16, decay: 0.45, slide: 300, attack: 0.08 })
        this.tone({ freq: 900, type: 'sine', gain: 0.06, decay: 0.45, slide: -200, attack: 0.1 })
    }
  }

  beep(high = false) {
    this.tone({ freq: high ? 988 : 659, type: 'triangle', gain: 0.2, decay: high ? 0.5 : 0.22 })
    if (high) this.tone({ freq: 1318, type: 'sine', gain: 0.12, decay: 0.5, delay: 0.05 })
  }

  tick() {
    this.tone({ freq: 880, type: 'triangle', gain: 0.07, decay: 0.08 })
  }

  whoosh() {
    this.burst({ freq: 500, q: 0.5, gain: 0.35, decay: 1.2, type: 'lowpass' })
    this.tone({ freq: 200, type: 'sine', gain: 0.15, decay: 1.2, slide: 600, attack: 0.3 })
  }

  /** The picture is revealed: a little fanfare. */
  fanfare() {
    const tune = [0, 2, 4, 5, 4, 5, 7]
    const times = [0, 0.12, 0.24, 0.36, 0.6, 0.72, 0.84]
    tune.forEach((s, i) => this.tone({ freq: note(s, 392), type: 'square', gain: 0.06, decay: i === 6 ? 0.8 : 0.22, delay: times[i] }))
    tune.forEach((s, i) => this.tone({ freq: note(s, 392) * 2, type: 'triangle', gain: 0.1, decay: i === 6 ? 0.9 : 0.25, delay: times[i] }))
    this.burst({ freq: 5000, q: 1, gain: 0.15, decay: 0.8, delay: 0.84, type: 'highpass' })
  }

  /** A gentle bouncy loop, scheduled a little ahead each frame. */
  updateMusic(playing, fast = false) {
    if (!this.ready || !this.musicOn || !playing) return
    const ctx = this.ctx
    if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + 0.05
    const step = fast ? 0.14 : 0.17
    while (this.nextBeat < ctx.currentTime + 0.25) {
      const b = this.beat++
      const t = this.nextBeat - ctx.currentTime
      const m = MELODY[b % MELODY.length]
      if (m != null) this.tone({ freq: note(m, 523.25), type: 'triangle', gain: 0.16, decay: 0.22, delay: t, out: this.musicBus })
      const bar = Math.floor(b / 8) % BASS.length
      if (b % 4 === 0) this.tone({ freq: note(BASS[bar], 130.8), type: 'sine', gain: 0.35, decay: 0.3, delay: t, out: this.musicBus })
      if (b % 4 === 2) {
        this.tone({ freq: note(BASS[bar] + 2, 261.6), type: 'triangle', gain: 0.1, decay: 0.12, delay: t, out: this.musicBus })
        this.tone({ freq: note(BASS[bar] + 4, 261.6), type: 'triangle', gain: 0.08, decay: 0.12, delay: t, out: this.musicBus })
      }
      this.nextBeat += step
    }
  }
}
