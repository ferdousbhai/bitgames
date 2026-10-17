/**
 * Sounds: eight animals call with real recordings (sounds/*.mp3, public domain and CC0; sources,
 * licences and the rebuild script are in examples/memory-match/sounds/); everything else is
 * synthesized with Web Audio.
 */

/** Recorded calls, and how long each lasts. Until one has loaded, its synthesized voice stands in. */
export const RECORDED = { elephant: 1.15, lion: 1.75, cat: 0.92, chick: 1.5, frog: 1.2, dog: 0.9, cow: 1.75, pig: 0.65 }

/** A woof, a moo, an oink: a buzzy voice shaped by mouth-like resonances (see Sound.voiced). */
const VOICES = {
  dog: (s, t) => {
    for (const d of [0, 0.26]) {
      s.voiced({ at: t + d, dur: 0.17, gain: 0.55, attack: 0.008, release: 0.11, f0: [[0, 330], [0.04, 430], [0.17, 210]],
        formants: [[[[0, 500], [0.05, 950], [0.17, 450]], 3, 1], [[[0, 1400], [0.17, 1100]], 5, 0.45]] })
      s.noise({ at: t + d, dur: 0.05, gain: 0.08, filter: { type: 'bandpass', freq: 900, Q: 1 } })
    }
  },
  cat: (s, t) =>
    s.voiced({ at: t, dur: 0.75, gain: 0.4, attack: 0.05, release: 0.25, f0: [[0, 520], [0.25, 700], [0.75, 480]], vibrato: { rate: 6, depth: 10 },
      formants: [[[[0, 700], [0.3, 1100], [0.75, 600]], 4, 1], [[[0, 2200], [0.3, 1700], [0.75, 1300]], 6, 0.5]] }),
  frog: (s, t) => {
    for (const [d, f] of [[0, 190], [0.22, 230]]) {
      s.voiced({ at: t + d, dur: 0.15, gain: 0.5, attack: 0.01, release: 0.06, f0: [[0, f], [0.15, f * 0.85]], am: { rate: 48, depth: 0.9 },
        formants: [[700, 4, 1], [1500, 6, 0.6]] })
    }
  },
  lion: (s, t) => {
    s.voiced({ at: t, dur: 0.9, gain: 0.5, attack: 0.08, release: 0.4, f0: [[0, 120], [0.2, 170], [0.9, 85]], am: { rate: 28, depth: 0.5 },
      formants: [[[[0, 350], [0.2, 700], [0.9, 300]], 3, 1], [[[0, 900], [0.9, 700]], 4, 0.4]] })
    s.noise({ at: t, dur: 0.8, gain: 0.08, filter: { type: 'lowpass', freq: 700 } })
  },
  panda: (s, t) =>
    s.voiced({ at: t, dur: 0.5, gain: 0.4, attack: 0.04, release: 0.2, f0: [[0, 300], [0.15, 380], [0.5, 270]], vibrato: { rate: 10, depth: 12 },
      formants: [[700, 4, 1], [1200, 5, 0.5]] }),
  // Oink oink: a short nasal grunt that rises and drops, with a rough flutter
  pig: (s, t) => {
    for (const d of [0, 0.3]) {
      s.voiced({ at: t + d, dur: 0.21, gain: 0.6, attack: 0.012, release: 0.09, f0: [[0, 180], [0.07, 260], [0.21, 160]], am: { rate: 38, depth: 0.7 },
        formants: [[[[0, 400], [0.08, 900], [0.21, 450]], 4, 1], [[[0, 1900], [0.21, 1400]], 7, 0.5], [3000, 9, 0.15]] })
      s.noise({ at: t + d, dur: 0.16, gain: 0.05, filter: { type: 'bandpass', freq: 1100, Q: 2 } })
    }
  },
  // Sniff sniff, then a tiny squeak
  bunny: (s, t) => {
    for (const d of [0, 0.12, 0.24]) s.noise({ at: t + d, dur: 0.07, gain: 0.12, filter: { type: 'highpass', freq: 3500 } })
    s.tone({ at: t + 0.38, type: 'sine', dur: 0.14, gain: 0.16, freq: [[0, 1500], [0.06, 2300], [0.14, 1800]] })
  },
  chick: (s, t) => {
    for (const d of [0, 0.15, 0.3]) s.tone({ at: t + d, type: 'sine', dur: 0.1, gain: 0.16, freq: [[0, 3400], [0.03, 4200], [0.1, 3000]] })
  },
  elephant: (s, t) =>
    s.voiced({ at: t, dur: 0.85, gain: 0.45, attack: 0.03, release: 0.3, f0: [[0, 330], [0.1, 520], [0.85, 470]], vibrato: { rate: 8, depth: 20 },
      formants: [[1000, 3, 1], [2000, 5, 0.6], [3200, 7, 0.3]] }),
  fox: (s, t) => {
    for (const d of [0, 0.18]) {
      s.voiced({ at: t + d, dur: 0.13, gain: 0.45, attack: 0.006, release: 0.08, f0: [[0, 700], [0.04, 1150], [0.13, 800]],
        formants: [[1500, 3, 1], [2800, 5, 0.4]] })
    }
  },
  // A penguin brays like a little donkey: honk, honk, haaa
  penguin: (s, t) => {
    for (const [d, len] of [[0, 0.13], [0.2, 0.13], [0.4, 0.36]]) {
      s.voiced({ at: t + d, dur: len, gain: 0.45, attack: 0.015, release: 0.08, f0: [[0, 430], [len, 360]], am: { rate: 26, depth: 0.45 },
        formants: [[900, 5, 1], [1600, 6, 0.6], [2600, 8, 0.2]] })
    }
  },
  // Mmm-ooo: closed lips first (a low hum), then the mouth opens and the moo swells and falls
  cow: (s, t) => {
    s.voiced({ at: t, dur: 1.2, gain: 0.7, attack: 0.15, release: 0.35, f0: [[0, 105], [0.3, 135], [0.85, 125], [1.2, 92]], vibrato: { rate: 5, depth: 3 },
      formants: [[[[0, 260], [0.35, 640], [1.2, 420]], 4, 1], [[[0, 650], [0.35, 1050], [1.2, 780]], 5, 0.45], [2500, 8, 0.06]] })
    s.tone({ at: t, type: 'sine', dur: 0.35, gain: 0.12, freq: [[0, 105], [0.35, 130]], attack: 0.08 })
  },
  // A fish has no call: three soft bubbles rising.
  fish: (s, t) => {
    for (const [d, f, g] of [[0, 420, 0.2], [0.15, 560, 0.16], [0.28, 700, 0.12]]) s.tone({ at: t + d, type: 'sine', dur: 0.1, gain: g, freq: [[0, f], [0.1, f * 2.2]] })
  },
}

/** How long each call lasts (seconds), so an animal bobs for as long as it calls. */
export const VOICE_LENGTH = { dog: 0.45, cat: 0.75, frog: 0.4, lion: 0.9, panda: 0.52, pig: 0.52, bunny: 0.52, chick: 0.4, elephant: 0.85, fox: 0.32, penguin: 0.78, cow: 1.2, fish: 0.4, ...RECORDED }

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12)

export class Sound {
  constructor() {
    this.ctx = null
    this.muted = false
    this.lastTick = 0
    this.samples = {} // animal -> decoded AudioBuffer
    this.sampleData = {} // animal -> fetched bytes, decoded once audio is unlocked
  }

  /** Fetches the recorded calls (decoding waits for unlock: an AudioContext needs a tap first). */
  load(base = './sounds/') {
    for (const name of Object.keys(RECORDED)) {
      fetch(`${base}${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((bytes) => {
          if (!bytes) return
          this.sampleData[name] = bytes
          this.decode()
        })
        .catch(() => {}) // the synthesized voice stands in
    }
  }

  decode() {
    if (!this.ctx) return
    for (const [name, bytes] of Object.entries(this.sampleData)) {
      delete this.sampleData[name]
      this.ctx.decodeAudioData(bytes).then((buf) => (this.samples[name] = buf), () => {})
    }
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
    this.decode()
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

  /** An animal's call: its recording when there is one, else its synthesized voice. A baby (pitch > 1) calls higher. */
  voice(animal, delay = 0, pitch = 1) {
    const buf = this.samples[animal]
    if (!buf) return VOICES[animal]?.(pitch === 1 ? this : this.pitched(pitch), this.now + delay)
    if (!this.live) return
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = pitch
    const g = this.ctx.createGain()
    g.gain.value = 0.6 // the recordings are denser than the synthesized calls: roughly matched by RMS
    src.connect(g).connect(this.master)
    src.start(this.now + delay)
  }

  /** This sound set with every pitch (and resonance) raised by k, for a baby's voice. */
  pitched(k) {
    const up = (f) => (typeof f === 'number' ? f * k : f.map(([t, v]) => [t, v * k]))
    return {
      tone: (o) => this.tone({ ...o, gain: o.gain * 0.8, freq: up(o.freq), filter: o.filter && { ...o.filter, freq: up(o.filter.freq) } }),
      noise: (o) => this.noise({ ...o, gain: o.gain * 0.6 }),
      voiced: (o) => this.voiced({ ...o, gain: o.gain * 0.8, f0: up(o.f0), formants: o.formants.map(([f, q, g]) => [up(f), q, g]) }),
    }
  }

  /**
   * A voiced sound: a buzzy source (f0, a number or [[time, hz], ...]) through a few resonances
   * (formants: [freq, Q, gain], freq a number or a curve), like a throat and mouth.
   */
  voiced({ at, dur, gain = 0.4, f0, formants, attack = 0.02, release = 0.1, vibrato, am }) {
    if (!this.live) return
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    this._ramp(osc.frequency, at, f0)
    if (vibrato) this._lfo(at, dur, vibrato.rate, vibrato.depth, osc.frequency)
    const env = ctx.createGain()
    gain *= 1.4 // the resonances pass only part of the buzz
    env.gain.setValueAtTime(0.0001, at)
    env.gain.exponentialRampToValueAtTime(gain, at + attack)
    env.gain.setValueAtTime(gain, at + Math.max(attack, dur - release))
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    let out = env
    if (am) {
      const trem = ctx.createGain()
      trem.gain.value = 1 - am.depth / 2
      this._lfo(at, dur, am.rate, am.depth / 2, trem.gain)
      env.connect(trem)
      out = trem
    }
    out.connect(this.master)
    for (const [freq, Q, g] of formants) {
      const bp = this._filter(at, { type: 'bandpass', freq, Q })
      const level = ctx.createGain()
      level.gain.value = g
      osc.connect(bp).connect(level).connect(env)
    }
    osc.start(at)
    osc.stop(at + dur + 0.05)
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
    if (name === 'prop_theme') {
      // a cheerful little bell
      ;[84, 88, 91].forEach((n, i) => this.tone({ at: t + i * 0.08, type: 'sine', dur: 0.5, gain: 0.12, freq: NOTE(n) }))
      return
    }
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

  /** Not a pair: a puzzled little "uh-oh?" that rises at the end, never a buzzer. */
  miss() {
    const t = this.now
    this.tone({ at: t, type: 'sine', dur: 0.16, gain: 0.16, freq: [[0, NOTE(67)], [0.16, NOTE(64)]] })
    this.tone({ at: t + 0.19, type: 'sine', dur: 0.22, gain: 0.14, freq: [[0, NOTE(62)], [0.22, NOTE(66)]], vibrato: { rate: 6, depth: 8 } })
  }

  /** A golden card glitters as it turns up: a quick high twinkle. */
  shimmer() {
    const t = this.now
    ;[96, 100, 103, 108].forEach((n, i) => this.tone({ at: t + i * 0.05, type: 'sine', dur: 0.25, gain: 0.06, freq: NOTE(n) }))
  }

  /** A golden pair found: a bright music-box run up and back down. */
  chime() {
    const t = this.now
    ;[79, 84, 88, 91, 96, 91, 96].forEach((n, i) => this.tone({ at: t + i * 0.08, type: 'triangle', dur: 0.4, gain: 0.1, freq: NOTE(n) }))
  }

  /** A hidden animal's peekaboo: a tiny tee-hee. */
  giggle() {
    const t = this.now
    ;[0, 0.11, 0.22].forEach((d, i) => this.tone({ at: t + d, type: 'sine', dur: 0.08, gain: 0.1, freq: [[0, 900 + i * 120], [0.08, 1300 + i * 120]] }))
  }

  /** A party blower: a short, rising toot. */
  toot() {
    this.tone({ at: this.now, type: 'sawtooth', dur: 0.32, gain: 0.07, freq: [[0, 520], [0.08, 880], [0.32, 820]], filter: { type: 'lowpass', freq: 2200 }, vibrato: { rate: 14, depth: 18 } })
  }

  /** A conga drum: a soft low thump (accent: a higher one to end the bar). */
  drum(accent = false) {
    const f = accent ? 220 : 140
    this.tone({ at: this.now, type: 'sine', dur: 0.18, gain: 0.22, freq: [[0, f], [0.18, f * 0.55]] })
  }

  /** A springy boing for a big jump. */
  boing() {
    this.tone({ at: this.now, type: 'sine', dur: 0.45, gain: 0.24, freq: [[0, 160], [0.1, 460], [0.45, 300]], vibrato: { rate: 16, depth: 26 } })
  }

  /** One xylophone note, i steps up a C major scale (the finale's wave of hops). */
  note(i) {
    const scale = [0, 2, 4, 5, 7, 9, 11]
    const n = 72 + scale[i % 7] + 12 * Math.floor(i / 7)
    this.tone({ at: this.now, type: 'triangle', dur: 0.35, gain: 0.15, freq: NOTE(n) })
    this.tone({ at: this.now, type: 'sine', dur: 0.12, gain: 0.06, freq: NOTE(n + 12) })
  }

  /** The board is finished: a short, bouncy tune, played once. */
  fanfare() {
    const t = this.now
    ;[[0, 67], [0.14, 72], [0.28, 76], [0.42, 79], [0.62, 76], [0.76, 84]].forEach(([d, n], i, all) =>
      this.tone({ at: t + d, type: 'triangle', dur: i === all.length - 1 ? 0.7 : 0.18, gain: 0.13, freq: NOTE(n) }))
    ;[48, 55].forEach((n, i) => this.tone({ at: t + i * 0.42, type: 'sine', dur: 0.4, gain: 0.1, freq: NOTE(n) }))
  }
}
