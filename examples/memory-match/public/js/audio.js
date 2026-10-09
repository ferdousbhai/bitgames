/** Every sound is synthesized with Web Audio: nothing to download. */

// Each animal says hello in its own little voice. Phase 2: the buzzy sawtooth and square waves
// are now triangle waves or sit behind a soft lowpass, so a child can flip cards all morning.
const VOICES = {
  dog: (s, t) => {
    for (const d of [0, 0.2]) {
      s.tone({ at: t + d, type: 'triangle', dur: 0.14, gain: 0.26, freq: [[0, 520], [0.03, 430], [0.14, 210]], filter: { type: 'lowpass', freq: 1400 } })
      s.noise({ at: t + d, dur: 0.06, gain: 0.07, filter: { type: 'bandpass', freq: 1200, Q: 1 } })
    }
  },
  cat: (s, t) =>
    s.tone({ at: t, type: 'triangle', dur: 0.62, gain: 0.22, freq: [[0, 560], [0.18, 820], [0.62, 520]],
      filter: { type: 'lowpass', freq: [[0, 1200], [0.2, 2000], [0.62, 1100]] }, vibrato: { rate: 7, depth: 12 } }),
  frog: (s, t) => {
    s.tone({ at: t, type: 'square', dur: 0.13, gain: 0.15, freq: [[0, 190], [0.13, 160]], am: { rate: 45, depth: 0.9 }, filter: { type: 'lowpass', freq: 650 } })
    s.tone({ at: t + 0.19, type: 'square', dur: 0.16, gain: 0.15, freq: [[0, 240], [0.16, 200]], am: { rate: 50, depth: 0.9 }, filter: { type: 'lowpass', freq: 700 } })
  },
  lion: (s, t) => {
    s.tone({ at: t, type: 'sawtooth', dur: 0.75, gain: 0.15, freq: [[0, 150], [0.15, 190], [0.75, 95]], filter: { type: 'lowpass', freq: [[0, 400], [0.15, 750], [0.75, 300]] }, vibrato: { rate: 9, depth: 8 } })
    s.noise({ at: t, dur: 0.6, gain: 0.06, filter: { type: 'lowpass', freq: 600 } })
  },
  panda: (s, t) =>
    s.tone({ at: t, type: 'triangle', dur: 0.5, gain: 0.3, freq: [[0, 330], [0.15, 440], [0.5, 300]], vibrato: { rate: 9, depth: 14 } }),
  pig: (s, t) => {
    for (const d of [0, 0.22]) s.tone({ at: t + d, type: 'triangle', dur: 0.16, gain: 0.28, freq: [[0, 300], [0.16, 190]], am: { rate: 35, depth: 0.5 }, filter: { type: 'lowpass', freq: 900 } })
  },
  bunny: (s, t) => {
    s.tone({ at: t, type: 'sine', dur: 0.35, gain: 0.3, freq: [[0, 260], [0.12, 900], [0.35, 600]], vibrato: { rate: 22, depth: 40 } })
    s.tone({ at: t, type: 'sine', dur: 0.08, gain: 0.25, freq: [[0, 140], [0.08, 60]] })
  },
  chick: (s, t) => {
    for (const d of [0, 0.13, 0.26]) s.tone({ at: t + d, type: 'sine', dur: 0.09, gain: 0.16, freq: [[0, 2300], [0.04, 3100], [0.09, 2500]] })
  },
  elephant: (s, t) =>
    s.tone({ at: t, type: 'triangle', dur: 0.7, gain: 0.24, freq: [[0, 330], [0.12, 560], [0.7, 520]], filter: { type: 'lowpass', freq: 1500 }, vibrato: { rate: 7, depth: 18 } }),
  fox: (s, t) => {
    for (const d of [0, 0.16]) s.tone({ at: t + d, type: 'triangle', dur: 0.12, gain: 0.24, freq: [[0, 760], [0.04, 1400], [0.12, 900]] })
  },
  penguin: (s, t) => {
    for (const d of [0, 0.2]) s.tone({ at: t + d, type: 'triangle', dur: 0.16, gain: 0.2, freq: [[0, 620], [0.16, 470]], am: { rate: 30, depth: 0.6 }, filter: { type: 'lowpass', freq: 1400 } })
  },
  cow: (s, t) =>
    s.tone({ at: t, type: 'sawtooth', dur: 0.95, gain: 0.16, freq: [[0, 165], [0.3, 215], [0.95, 150]], filter: { type: 'lowpass', freq: [[0, 350], [0.3, 850], [0.95, 380]] }, vibrato: { rate: 5, depth: 4 } }),
}

/** How long each call lasts (seconds), so speech can wait until the animal has finished. */
export const VOICE_LENGTH = { dog: 0.36, cat: 0.65, frog: 0.38, lion: 0.78, panda: 0.52, pig: 0.4, bunny: 0.38, chick: 0.38, elephant: 0.72, fox: 0.3, penguin: 0.38, cow: 0.98 }

/** Scales a frequency (a number or [[time, hz], ...]) by k. */
const scaleFreq = (f, k) => (typeof f === 'number' ? f * k : f.map(([t, v]) => [t, v * k]))

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12)

export class Sound {
  constructor() {
    this.ctx = null
    this.muted = false
    this.lastTick = 0
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
    return !!this.ctx && !this.muted
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

  /** Wobbles param by ±depth at rate Hz for the length of a note. */
  _lfo(at, dur, rate, depth, param) {
    const lfo = this.ctx.createOscillator()
    const amount = this.ctx.createGain()
    lfo.frequency.value = rate
    amount.gain.value = depth
    lfo.connect(amount).connect(param)
    lfo.start(at)
    lfo.stop(at + dur + 0.05)
  }

  /** One oscillator note: freq is a number or [[time, hz], ...]. Like noise(), silent until unlocked or while muted. */
  tone({ at, type = 'sine', dur, gain = 0.2, freq, filter, vibrato, am, attack = 0.01 }) {
    if (!this.live) return
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = type
    this._ramp(osc.frequency, at, freq)
    let node = osc
    if (vibrato) this._lfo(at, dur, vibrato.rate, vibrato.depth, osc.frequency)
    if (filter) node = node.connect(this._filter(at, filter))
    const env = this._env(at, dur, gain, attack)
    node = node.connect(env)
    if (am) {
      const trem = ctx.createGain()
      trem.gain.value = 1 - am.depth / 2
      this._lfo(at, dur, am.rate, am.depth / 2, trem.gain)
      node = node.connect(trem)
    }
    node.connect(this.master)
    osc.start(at)
    osc.stop(at + dur + 0.05)
  }

  noise({ at, dur, gain = 0.1, filter }) {
    if (!this.live) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    let node = src
    if (filter) node = node.connect(this._filter(at, filter))
    node.connect(this._env(at, dur, gain, 0.005)).connect(this.master)
    src.start(at, Math.random() * 0.5)
    src.stop(at + dur + 0.05)
  }

  /** An animal's call. A baby calls higher and softer: the same voice, pitched up. */
  voice(animal, delay = 0, { baby = false } = {}) {
    if (!baby) return VOICES[animal]?.(this, this.now + delay)
    const k = 1.45
    const small = {
      tone: (o) => this.tone({ ...o, gain: o.gain * 0.75, freq: scaleFreq(o.freq, k), filter: o.filter && { ...o.filter, freq: scaleFreq(o.filter.freq, k) } }),
      noise: (o) => this.noise({ ...o, gain: o.gain * 0.6 }),
    }
    VOICES[animal]?.(small, this.now + delay)
  }

  flip() {
    const t = this.now
    this.noise({ at: t, dur: 0.16, gain: 0.16, filter: { type: 'bandpass', freq: [[0, 900], [0.16, 4200]], Q: 1.4 } })
    this.tone({ at: t + 0.33, type: 'triangle', dur: 0.06, gain: 0.12, freq: 1400 })
  }

  pop(delay = 0) {
    const t = this.now + delay
    this.tone({ at: t, type: 'sine', dur: 0.14, gain: 0.3, freq: [[0, 320], [0.1, 980]] })
  }

  tick() {
    if (!this.live || this.now - this.lastTick < 0.04) return
    this.lastTick = this.now
    this.tone({ at: this.now, type: 'triangle', dur: 0.05, gain: 0.08, freq: 1700 + Math.random() * 500 })
  }

  tap() {
    this.tone({ at: this.now, type: 'sine', dur: 0.09, gain: 0.18, freq: [[0, 600], [0.09, 900]] })
  }

  /** Each toy around the mat has its own sound. */
  toy(name) {
    const t = this.now
    if (name === 'prop_ball') {
      // boing, boing, boing
      for (let k = 0; k < 3; k++) {
        const at = t + k * 0.43
        this.tone({ at, type: 'sine', dur: 0.32, gain: 0.26 * 0.7 ** k, freq: [[0, 180], [0.08, 420], [0.32, 260]], vibrato: { rate: 18, depth: 30 } })
      }
    } else if (name === 'prop_bear') {
      // a squeaky toy: squee-squee
      for (const d of [0, 0.22]) this.tone({ at: t + d, type: 'triangle', dur: 0.18, gain: 0.16, freq: [[0, 900], [0.06, 1500], [0.18, 1100]], filter: { type: 'bandpass', freq: 1600, Q: 2 } })
    } else if (name === 'prop_rings') {
      // the rings ring: a little xylophone run
      ;[60, 64, 67, 72, 76].forEach((n, i) => this.tone({ at: t + i * 0.07, type: 'triangle', dur: 0.35, gain: 0.18, freq: NOTE(n + 12) }))
    } else if (name === 'prop_blocks') {
      // wooden clacks
      for (const d of [0, 0.62, 0.7]) {
        this.tone({ at: t + d, type: 'sine', dur: 0.08, gain: 0.3, freq: [[0, 900], [0.08, 500]] })
        this.noise({ at: t + d, dur: 0.04, gain: 0.12, filter: { type: 'bandpass', freq: 2500, Q: 3 } })
      }
    } else {
      // crayons: a quick scribble
      for (let k = 0; k < 4; k++) this.noise({ at: t + k * 0.09, dur: 0.08, gain: 0.14, filter: { type: 'bandpass', freq: 3000 + k * 600, Q: 4 } })
      this.tone({ at: t + 0.38, type: 'sine', dur: 0.14, gain: 0.18, freq: [[0, 700], [0.14, 1300]] })
    }
  }

  match() {
    const t = this.now
    ;[72, 76, 79].forEach((n, i) => this.tone({ at: t + i * 0.1, type: 'triangle', dur: 0.4, gain: 0.13, freq: NOTE(n) }))
  }

  miss() {
    const t = this.now
    this.tone({ at: t, type: 'sine', dur: 0.2, gain: 0.18, freq: [[0, NOTE(67)], [0.2, NOTE(65)]] })
    this.tone({ at: t + 0.2, type: 'sine', dur: 0.28, gain: 0.16, freq: [[0, NOTE(64)], [0.28, NOTE(60)]] })
  }

  /** The board is finished: one soft, rolled chord, played once. */
  fanfare() {
    const t = this.now
    ;[60, 64, 67, 72].forEach((n, i) => this.tone({ at: t + i * 0.09, type: 'sine', dur: 1.6, gain: 0.1, freq: NOTE(n), attack: 0.06 }))
    this.tone({ at: t, type: 'triangle', dur: 1.8, gain: 0.06, freq: NOTE(48), attack: 0.1 })
  }
}
