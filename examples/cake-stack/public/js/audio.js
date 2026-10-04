/** Every sound is synthesized with Web Audio: nothing to download. */

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12)
const PENTA = [0, 2, 4, 7, 9]
const penta = (step, base = 72) => NOTE(base + PENTA[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5))

// Each birthday friend says hello in its own little voice.
const VOICES = {
  bear: (s, t) =>
    s.tone({ at: t, type: 'sawtooth', dur: 0.55, gain: 0.18, freq: [[0, 170], [0.15, 230], [0.55, 150]], filter: { type: 'lowpass', freq: 900 }, vibrato: { rate: 8, depth: 6 } }),
  bunny: (s, t) => {
    s.tone({ at: t, type: 'sine', dur: 0.35, gain: 0.3, freq: [[0, 260], [0.12, 900], [0.35, 600]], vibrato: { rate: 22, depth: 40 } })
    s.tone({ at: t, type: 'sine', dur: 0.08, gain: 0.25, freq: [[0, 140], [0.08, 60]] })
  },
  cat: (s, t) =>
    s.tone({ at: t, type: 'sawtooth', dur: 0.62, gain: 0.16, freq: [[0, 560], [0.18, 820], [0.62, 520]],
      filter: { type: 'bandpass', freq: [[0, 900], [0.2, 2200], [0.62, 1100]], Q: 3 }, vibrato: { rate: 7, depth: 12 } }),
  puppy: (s, t) => {
    for (const d of [0, 0.2]) {
      s.tone({ at: t + d, type: 'square', dur: 0.14, gain: 0.22, freq: [[0, 520], [0.03, 430], [0.14, 210]], filter: { type: 'bandpass', freq: 1000, Q: 1.2 } })
      s.noise({ at: t + d, dur: 0.07, gain: 0.12, filter: { type: 'bandpass', freq: 1400, Q: 1 } })
    }
  },
  panda: (s, t) => s.tone({ at: t, type: 'triangle', dur: 0.5, gain: 0.3, freq: [[0, 330], [0.15, 440], [0.5, 300]], vibrato: { rate: 9, depth: 14 } }),
  pig: (s, t) => {
    for (const d of [0, 0.22]) s.tone({ at: t + d, type: 'square', dur: 0.16, gain: 0.2, freq: [[0, 300], [0.16, 190]], filter: { type: 'bandpass', freq: 750, Q: 5 } })
  },
  fox: (s, t) => {
    for (const d of [0, 0.16]) s.tone({ at: t + d, type: 'triangle', dur: 0.12, gain: 0.26, freq: [[0, 760], [0.04, 1400], [0.12, 900]] })
  },
  chick: (s, t) => {
    for (const d of [0, 0.13, 0.26]) s.tone({ at: t + d, type: 'sine', dur: 0.09, gain: 0.18, freq: [[0, 2300], [0.04, 3100], [0.09, 2500]] })
  },
}

// Happy Birthday (public domain): [midi note, beats]
const BIRTHDAY = [
  [67, 0.75], [67, 0.25], [69, 1], [67, 1], [72, 1], [71, 2],
  [67, 0.75], [67, 0.25], [69, 1], [67, 1], [74, 1], [72, 2],
  [67, 0.75], [67, 0.25], [79, 1], [76, 1], [72, 1], [71, 1], [69, 2],
  [77, 0.75], [77, 0.25], [76, 1], [72, 1], [74, 1], [72, 3],
]

// A gentle bakery waltz for the music box
const WALTZ = [0, 2, 4, 4, 3, 2, 1, 3, 5, 5, 4, 2, 0, 2, 4, 7, 5, 4, 3, 2, 1, 2, 1, 0]
const WALTZ_BASS = [0, 0, -3, -3, -1, -1, 0, -5]

export class Sound {
  constructor() {
    this.ctx = null
    this.muted = false
    this.musicOn = true
    this.nextBeat = 0
    this.beat = 0
  }

  /** Browsers only allow audio after a tap or key press. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
      return
    }
    try {
      this.ctx = new AudioContext()
    } catch {
      return
    }
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.8
    const comp = this.ctx.createDynamicsCompressor()
    this.master.connect(comp).connect(this.ctx.destination)
    this.musicBus = this.ctx.createGain()
    this.musicBus.gain.value = 0.2
    this.musicBus.connect(this.master)
    const len = this.ctx.sampleRate
    this.noiseBuf = this.ctx.createBuffer(1, len, len)
    const data = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }

  setMuted(muted) {
    this.muted = muted
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.02)
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0
  }

  get live() {
    return !!this.ctx && this.ctx.state === 'running' && !this.muted
  }

  _env(at, dur, gain, attack = 0.01) {
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(gain, at + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    return g
  }

  _ramp(param, at, points) {
    if (typeof points === 'number') return param.setValueAtTime(points, at)
    param.setValueAtTime(points[0][1], at + points[0][0])
    for (const [t, v] of points.slice(1)) param.exponentialRampToValueAtTime(v, at + t)
  }

  _filter(at, f) {
    const node = this.ctx.createBiquadFilter()
    node.type = f.type
    this._ramp(node.frequency, at, f.freq)
    node.Q.value = f.Q ?? 1
    return node
  }

  _lfo(at, dur, rate, depth, param) {
    const lfo = this.ctx.createOscillator()
    const amount = this.ctx.createGain()
    lfo.frequency.value = rate
    amount.gain.value = depth
    lfo.connect(amount).connect(param)
    lfo.start(at)
    lfo.stop(at + dur + 0.05)
  }

  /** One oscillator note: freq is a number or [[time, hz], ...]. */
  tone({ at, type = 'sine', dur, gain = 0.2, freq, filter, vibrato, attack = 0.01, out }) {
    if (!this.live) return
    const osc = this.ctx.createOscillator()
    osc.type = type
    this._ramp(osc.frequency, at, freq)
    let node = osc
    if (vibrato) this._lfo(at, dur, vibrato.rate, vibrato.depth, osc.frequency)
    if (filter) node = node.connect(this._filter(at, filter))
    node.connect(this._env(at, dur, gain, attack)).connect(out ?? this.master)
    osc.start(at)
    osc.stop(at + dur + 0.05)
  }

  noise({ at, dur, gain = 0.1, filter, attack = 0.005 }) {
    if (!this.live) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    let node = src
    if (filter) node = node.connect(this._filter(at, filter))
    node.connect(this._env(at, dur, gain, attack)).connect(this.master)
    src.start(at, Math.random() * 0.5)
    src.stop(at + dur + 0.05)
  }

  voice(animal, delay = 0) {
    VOICES[animal]?.(this, this.now + delay)
  }

  click() {
    this.tone({ at: this.now, type: 'triangle', dur: 0.12, gain: 0.18, freq: [[0, 660], [0.12, 990]] })
  }

  /** A new layer appears above the cake. */
  appear() {
    this.tone({ at: this.now, type: 'sine', dur: 0.16, gain: 0.14, freq: [[0, 500], [0.16, 820]] })
  }

  /** Whoosh as a layer falls. */
  whoosh() {
    this.noise({ at: this.now, dur: 0.2, gain: 0.1, filter: { type: 'bandpass', freq: [[0, 2400], [0.2, 700]], Q: 1.2 } })
  }

  /** Soft spongy thump as a layer lands; lower for taller cakes. */
  plop(height = 0) {
    const t = this.now
    this.tone({ at: t, type: 'sine', dur: 0.22, gain: 0.4, freq: [[0, 210 - height * 4], [0.22, 70]] })
    this.noise({ at: t, dur: 0.1, gain: 0.14, filter: { type: 'lowpass', freq: 700 } })
  }

  /** Perfect: a sparkling chime that climbs with the streak. */
  perfect(streak = 0) {
    const t = this.now
    const s = Math.min(streak, 10)
    for (let i = 0; i < 4; i++) this.tone({ at: t + i * 0.06, type: 'triangle', dur: 0.35, gain: 0.14, freq: penta(s + i * 2) })
    this.tone({ at: t + 0.24, type: 'sine', dur: 0.5, gain: 0.08, freq: penta(s + 10) })
  }

  /** A good (not perfect) landing: one happy note. */
  good() {
    this.tone({ at: this.now + 0.03, type: 'triangle', dur: 0.25, gain: 0.14, freq: NOTE(76) })
  }

  /** Squishy icing splat. */
  splat() {
    const t = this.now
    this.noise({ at: t, dur: 0.18, gain: 0.3, filter: { type: 'lowpass', freq: [[0, 1800], [0.18, 300]] } })
    this.tone({ at: t, type: 'sine', dur: 0.25, gain: 0.22, freq: [[0, 420], [0.25, 120]] })
  }

  /** A sliver of cake plops onto the counter. */
  blob() {
    this.tone({ at: this.now, type: 'sine', dur: 0.12, gain: 0.18, freq: [[0, 300], [0.12, 140]] })
  }

  wobble() {
    this.tone({ at: this.now, type: 'sine', dur: 0.5, gain: 0.12, freq: 260, vibrato: { rate: 9, depth: 50 } })
  }

  grow() {
    const t = this.now
    for (let i = 0; i < 5; i++) this.tone({ at: t + i * 0.05, type: 'sine', dur: 0.2, gain: 0.1, freq: penta(i + 5) })
  }

  /** Toppers popping onto the cake. */
  pop(delay = 0, step = 0) {
    const t = this.now + delay
    this.tone({ at: t, type: 'sine', dur: 0.12, gain: 0.25, freq: [[0, 320 + step * 30], [0.1, 980 + step * 60]] })
  }

  match() {
    const t = this.now
    this.noise({ at: t, dur: 0.25, gain: 0.16, filter: { type: 'highpass', freq: 2500 } })
    this.tone({ at: t + 0.05, type: 'sine', dur: 0.3, gain: 0.06, freq: 1800, vibrato: { rate: 20, depth: 100 } })
  }

  blow() {
    const t = this.now
    this.noise({ at: t, dur: 0.9, gain: 0.3, attack: 0.15, filter: { type: 'bandpass', freq: [[0, 600], [0.4, 1400], [0.9, 500]], Q: 0.8 } })
  }

  puffOut(i = 0) {
    const t = this.now
    this.noise({ at: t, dur: 0.12, gain: 0.1, filter: { type: 'highpass', freq: 3000 } })
    this.tone({ at: t, type: 'sine', dur: 0.1, gain: 0.08, freq: penta(i + 3) })
  }

  /** Party horn and a cheer. */
  cheer() {
    const t = this.now
    this.tone({ at: t, type: 'sawtooth', dur: 0.7, gain: 0.12, freq: [[0, 300], [0.15, 520], [0.7, 500]], filter: { type: 'lowpass', freq: 1800 }, vibrato: { rate: 14, depth: 14 } })
    this.noise({ at: t + 0.1, dur: 1.2, gain: 0.12, attack: 0.2, filter: { type: 'bandpass', freq: 1600, Q: 0.6 } })
    for (let i = 0; i < 10; i++) this.tone({ at: t + 0.4 + i * 0.07, type: 'sine', dur: 0.15, gain: 0.06, freq: NOTE(84 + ((i * 7) % 12)) })
  }

  /** Happy Birthday on a little music box. Returns how long it lasts. */
  birthday() {
    const t = this.now + 0.1
    const beat = 0.32
    let at = 0
    for (const [n, b] of BIRTHDAY) {
      this.tone({ at: t + at, type: 'triangle', dur: b * beat + 0.25, gain: 0.2, freq: NOTE(n) })
      this.tone({ at: t + at, type: 'sine', dur: b * beat + 0.3, gain: 0.07, freq: NOTE(n + 12) })
      at += b * beat
    }
    return at
  }

  /** New level fanfare. */
  fanfare() {
    const t = this.now
    const tune = [[72, 0, 0.12], [76, 0.13, 0.12], [79, 0.26, 0.12], [84, 0.4, 0.45]]
    for (const [n, d, len] of tune) {
      this.tone({ at: t + d, type: 'square', dur: len, gain: 0.07, freq: NOTE(n), filter: { type: 'lowpass', freq: 2500 } })
      this.tone({ at: t + d, type: 'triangle', dur: len + 0.1, gain: 0.15, freq: NOTE(n - 12) })
    }
  }

  /** The music box waltz, scheduled a little ahead each frame. */
  updateMusic(playing) {
    if (!this.live || !this.musicOn || !playing) return
    const ctx = this.ctx
    if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + 0.05
    while (this.nextBeat < ctx.currentTime + 0.25) {
      const b = this.beat++
      const at = this.nextBeat
      this.tone({ at, type: 'sine', dur: 0.55, gain: 0.2, freq: penta(WALTZ[b % WALTZ.length], 76), out: this.musicBus })
      if (b % 3 === 0) this.tone({ at, type: 'triangle', dur: 0.9, gain: 0.26, freq: penta(WALTZ_BASS[(b / 3) % 8], 48), out: this.musicBus })
      else this.tone({ at, type: 'sine', dur: 0.3, gain: 0.08, freq: penta(WALTZ_BASS[Math.floor(b / 3) % 8] + 5, 48), out: this.musicBus })
      this.nextBeat += 0.24
    }
  }
}
