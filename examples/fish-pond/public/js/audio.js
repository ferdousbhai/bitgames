/** Every sound is synthesized with Web Audio: nothing to download. */
const PENTA = [0, 2, 4, 7, 9] // major pentatonic: any run of notes sounds happy
const note = (step, base = 523.25) => base * 2 ** ((PENTA[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5)) / 12)

/** A gentle lullaby per place: melody steps, bass steps and seconds per beat. */
const TUNES = {
  lake: { melody: [0, 2, 4, 2, 5, 4, 2, 0, 1, 2, 4, 7, 5, 4, 2, 1], bass: [0, 0, -2, -2, -3, -3, -1, -1], beat: 0.24, base: 523.25, wave: 'sine' },
  river: { melody: [4, 2, 1, 2, 4, 5, 4, 2, 0, 1, 2, 4, 2, 1, 0, -1], bass: [0, -3, -2, -1, 0, -3, -1, -1], beat: 0.27, base: 493.88, wave: 'triangle' },
  night: { melody: [0, -1, 0, 2, 1, 0, -1, -3, -2, -1, 0, 1, 2, 1, 0, -1], bass: [0, 0, -3, -3, -2, -2, -1, -1], beat: 0.34, base: 440, wave: 'sine' },
  ice: { melody: [7, 5, 4, 5, 7, 9, 7, 5, 4, 2, 4, 5, 4, 2, 0, 2], bass: [0, -2, -3, -1, 0, -2, -1, -1], beat: 0.26, base: 587.33, wave: 'sine' },
  reef: { melody: [2, 4, 5, 4, 2, 1, 2, 4, 7, 5, 4, 2, 1, 0, 1, 2], bass: [0, -2, -3, -2, 0, -3, -1, -1], beat: 0.3, base: 523.25, wave: 'triangle' },
}

export class Audio {
  constructor() {
    this.ctx = null
    this.muted = false
    this.musicOn = true
    this.nextBeat = 0
    this.beat = 0
    this.tune = TUNES.lake
    this.place = 'lake'
    this.ambientIn = 0
  }

  /** Browsers only allow sound after a tap or key press, so this runs on the first one. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {})
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
    this.ambBus = this.ctx.createGain()
    this.ambBus.gain.value = 0.0
    this.ambBus.connect(this.master)
    const len = this.ctx.sampleRate * 2
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this.startWater()
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running'
  }

  setMuted(muted) {
    this.muted = muted
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05)
  }

  setMusic(on) {
    this.musicOn = on
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.2 : 0, this.ctx.currentTime, 0.1)
  }

  setPlace(place) {
    this.place = place
    this.tune = TUNES[place] ?? TUNES.lake
    this.beat = 0
  }

  /** Lapping water: looping filtered noise whose loudness drifts slowly. */
  startWater() {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 520
    const g = ctx.createGain()
    g.gain.value = 0.18
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.18
    const depth = ctx.createGain()
    depth.gain.value = 0.1
    lfo.connect(depth).connect(g.gain)
    src.connect(lp).connect(g).connect(this.ambBus)
    src.start()
    lfo.start()
  }

  setAmbient(on) {
    if (this.ambBus) this.ambBus.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.5)
  }

  burst({ freq, q = 1, gain = 0.4, decay = 0.2, type = 'bandpass', delay = 0, attack = 0, out, sweep = 0 }) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.setValueAtTime(freq, t)
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + decay)
    filter.Q.value = q
    const g = ctx.createGain()
    if (attack) {
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(gain, t + attack)
    } else g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + decay)
    src.connect(filter).connect(g).connect(out ?? this.master)
    src.start(t, Math.random() * 1.5)
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

  click() {
    this.tone({ freq: 660, type: 'triangle', gain: 0.18, decay: 0.12, slide: 300 })
  }

  /** The rod swishes through the air. */
  cast() {
    this.burst({ freq: 900, q: 0.8, gain: 0.25, decay: 0.32, attack: 0.08, sweep: 2600 })
    for (let i = 0; i < 6; i++) this.tone({ freq: 1800 + i * 120, type: 'triangle', gain: 0.02, decay: 0.03, delay: 0.1 + i * 0.05 })
  }

  plop() {
    this.tone({ freq: 520, type: 'sine', gain: 0.35, decay: 0.16, slide: -330 })
    this.burst({ freq: 1400, q: 1.2, gain: 0.15, decay: 0.1, delay: 0.02 })
  }

  nibble() {
    this.tone({ freq: 900, type: 'sine', gain: 0.14, decay: 0.07, slide: -400 })
  }

  /** Something bit: a deep bloop and a bright "ding ding!" */
  bite() {
    this.tone({ freq: 300, type: 'sine', gain: 0.45, decay: 0.3, slide: -180 })
    this.burst({ freq: 700, q: 1, gain: 0.25, decay: 0.2 })
    this.tone({ freq: note(7), type: 'triangle', gain: 0.2, decay: 0.25, delay: 0.08 })
    this.tone({ freq: note(9), type: 'triangle', gain: 0.2, decay: 0.35, delay: 0.2 })
  }

  splash(big = 1) {
    this.burst({ freq: 1800, q: 0.6, gain: 0.4 * big, decay: 0.45, type: 'highpass' })
    this.burst({ freq: 500, q: 0.8, gain: 0.45 * big, decay: 0.35, type: 'lowpass' })
    this.tone({ freq: 220, type: 'sine', gain: 0.3, decay: 0.2, slide: -120 })
    for (let i = 0; i < 6; i++) this.tone({ freq: 900 + Math.random() * 1200, type: 'sine', gain: 0.05, decay: 0.06, delay: 0.15 + Math.random() * 0.4, slide: -300 })
  }

  /** The reel clicks round quickly. */
  reel() {
    for (let i = 0; i < 6; i++) this.burst({ freq: 2400, q: 4, gain: 0.06, decay: 0.03, delay: i * 0.07 })
  }

  /** A catch: a short, soft music-box arpeggio (one note longer for rarer finds). */
  fanfare(stars = 1) {
    const tune = [0, 2, 4, 5, 7]
    const n = 2 + Math.min(stars, 3)
    for (let i = 0; i < n; i++) this.tone({ freq: note(tune[i], 392), type: 'sine', gain: 0.1, decay: 0.5, delay: i * 0.16 })
    this.tone({ freq: note(tune[n - 1], 392) / 2, type: 'triangle', gain: 0.06, decay: 1.0, delay: n * 0.16 })
  }

  /** A prize: one gentle chord, played once. */
  chord() {
    for (const [i, step] of [0, 2, 4].entries()) this.tone({ freq: note(step, 392), type: 'sine', gain: 0.08, decay: 1.6, attack: 0.08, delay: i * 0.05 })
  }

  sparkle(delay = 0) {
    for (let i = 0; i < 6; i++) this.tone({ freq: note(8 + i * 2), type: 'sine', gain: 0.08, decay: 0.35, delay: delay + i * 0.06 })
  }

  /** A brand new sticker for the book. */
  newOne() {
    this.tone({ freq: note(10), type: 'triangle', gain: 0.14, decay: 0.2, delay: 0.0 })
    this.tone({ freq: note(12), type: 'triangle', gain: 0.14, decay: 0.4, delay: 0.1 })
  }

  giggle() {
    for (let i = 0; i < 5; i++) this.tone({ freq: 760 + (i % 2) * 160 + i * 40, type: 'sine', gain: 0.1, decay: 0.08, delay: i * 0.075, slide: 220 })
  }

  bubbles() {
    for (let i = 0; i < 4; i++) this.tone({ freq: 500 + Math.random() * 500, type: 'sine', gain: 0.07, decay: 0.08, delay: i * 0.09, slide: 500 })
  }

  thump() {
    this.tone({ freq: 160, type: 'sine', gain: 0.35, decay: 0.15, slide: -60 })
    this.tone({ freq: note(5), type: 'triangle', gain: 0.1, decay: 0.15, delay: 0.03 })
  }

  puff() {
    this.tone({ freq: 200, type: 'triangle', gain: 0.22, decay: 0.45, slide: 500, attack: 0.05 })
    this.burst({ freq: 800, q: 0.7, gain: 0.15, decay: 0.4, attack: 0.1, sweep: 1500 })
  }

  creak() {
    this.tone({ freq: 140, type: 'triangle', gain: 0.08, decay: 0.4, slide: 90, attack: 0.05 })
    this.sparkle(0.3)
  }

  whale() {
    this.tone({ freq: 180, type: 'sine', gain: 0.25, decay: 1.0, slide: 140, attack: 0.15 })
    this.tone({ freq: 270, type: 'sine', gain: 0.12, decay: 0.9, slide: -60, attack: 0.2, delay: 0.3 })
    this.burst({ freq: 2500, q: 0.5, gain: 0.2, decay: 0.8, type: 'highpass', delay: 0.4, attack: 0.1 })
  }

  /** Little background life: birds by day, crickets at night, a breeze on the ice. */
  updateAmbient(dt, playing) {
    if (!this.ready || !playing) return
    this.ambientIn -= dt
    if (this.ambientIn > 0) return
    const p = this.place
    if (p === 'night') {
      for (let i = 0; i < 3; i++) this.tone({ freq: 3400, type: 'sine', gain: 0.018, decay: 0.05, delay: i * 0.1, out: this.ambBus })
      this.ambientIn = 2.5 + Math.random() * 3
    } else if (p === 'reef') {
      // A slow wave washing on the far beach
      this.burst({ freq: 500, q: 0.5, gain: 0.07, decay: 2.6, attack: 1.2, out: this.ambBus, sweep: 250 })
      this.ambientIn = 4 + Math.random() * 4
    } else if (p === 'ice') {
      this.burst({ freq: 700, q: 0.6, gain: 0.08, decay: 2.2, attack: 0.9, out: this.ambBus, sweep: 400 })
      this.ambientIn = 3 + Math.random() * 4
    } else {
      const f = p === 'river' ? 2200 : 2600 + Math.random() * 800
      const n = 2 + ((Math.random() * 3) | 0)
      for (let i = 0; i < n; i++) this.tone({ freq: f + i * 120, type: 'sine', gain: 0.04, decay: 0.09, delay: i * 0.11, slide: 900, out: this.ambBus })
      this.ambientIn = 2.5 + Math.random() * 4
    }
  }

  /** A gentle music-box loop, scheduled a little ahead each frame. */
  updateMusic(playing) {
    if (!this.ready || !this.musicOn || !playing) return
    const ctx = this.ctx
    const tune = this.tune
    if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + 0.05
    while (this.nextBeat < ctx.currentTime + 0.3) {
      const b = this.beat++
      const t = this.nextBeat - ctx.currentTime
      if (b % 2 === 0) this.tone({ freq: note(tune.melody[(b / 2) % 16], tune.base), type: tune.wave, gain: 0.17, decay: 0.6, delay: t, out: this.musicBus })
      if (b % 4 === 0) this.tone({ freq: note(tune.bass[(b / 4) % 8], tune.base / 4), type: 'triangle', gain: 0.24, decay: 0.9, delay: t, out: this.musicBus })
      if (b % 8 === 6) this.tone({ freq: note(tune.melody[(b / 2 + 3) % 16] + 5, tune.base), type: 'sine', gain: 0.05, decay: 0.4, delay: t, out: this.musicBus })
      this.nextBeat += tune.beat
    }
  }
}
