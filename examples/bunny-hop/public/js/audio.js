/**
 * Every sound is synthesized with Web Audio: nothing to download. The context
 * is only created after the first tap or key press, as browsers require.
 */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]
const hz = (semitones, base = 523.25) => base * 2 ** (semitones / 12)

export class Sound {
  constructor() {
    this.ctx = null
    this.muted = false
    try {
      this.muted = localStorage.getItem('bunnyhop.muted') === '1'
    } catch {}
    this.musicOn = false
    this.nextBeat = 0
    this.beat = 0
  }

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
    this.master.connect(this.ctx.destination)
    this.musicBus = this.ctx.createGain()
    this.musicBus.gain.value = 0.32
    this.musicBus.connect(this.master)
    const len = this.ctx.sampleRate * 0.5
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this.timer = setInterval(() => this.schedule(), 90)
  }

  setMuted(muted) {
    this.muted = muted
    try {
      localStorage.setItem('bunnyhop.muted', muted ? '1' : '0')
    } catch {}
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05)
  }

  suspend() {
    this.ctx?.suspend().catch(() => {})
  }

  /** One enveloped oscillator note. */
  note(freq, { at = 0, len = 0.15, type = 'sine', gain = 0.2, slide = 0, attack = 0.005, out } = {}) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime + at
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + len)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + len)
    osc.connect(g).connect(out ?? this.master)
    osc.start(t)
    osc.stop(t + len + 0.02)
    return osc
  }

  hiss({ at = 0, len = 0.08, freq = 2500, q = 1.5, gain = 0.2 } = {}) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime + at
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + len)
    src.connect(f).connect(g).connect(this.master)
    src.start(t, Math.random() * 0.3)
    src.stop(t + len + 0.02)
  }

  hop(double) {
    if (double) {
      this.note(520, { len: 0.22, type: 'triangle', gain: 0.18, slide: 2.4 })
      this.note(1040, { at: 0.05, len: 0.16, type: 'sine', gain: 0.08, slide: 1.6 })
    } else {
      this.note(260, { len: 0.16, type: 'sine', gain: 0.22, slide: 2.6 })
      this.note(520, { len: 0.1, type: 'triangle', gain: 0.06, slide: 1.8 })
    }
  }

  land() {
    this.note(150, { len: 0.09, gain: 0.18, slide: 0.5 })
    this.hiss({ len: 0.06, freq: 600, gain: 0.05 })
  }

  munch(combo) {
    this.hiss({ len: 0.05, freq: 3200, q: 2, gain: 0.12 })
    this.hiss({ at: 0.06, len: 0.05, freq: 2600, q: 2, gain: 0.1 })
    const step = PENTA[Math.min(combo, PENTA.length - 1)]
    this.note(hz(step), { at: 0.01, len: 0.18, type: 'triangle', gain: 0.13 })
    this.note(hz(step + 12), { at: 0.04, len: 0.12, gain: 0.05 })
  }

  gold() {
    ;[0, 4, 7, 12, 16].forEach((s, i) => this.note(hz(s), { at: i * 0.06, len: 0.35, type: 'triangle', gain: 0.12 }))
    for (let i = 0; i < 6; i++) this.note(hz(24 + PENTA[i % 5]), { at: 0.1 + i * 0.04, len: 0.12, gain: 0.04 })
  }

  bonk() {
    // a soft cartoon "boing", never harsh
    const o = this.note(330, { len: 0.45, type: 'sine', gain: 0.2, slide: 0.55 })
    if (o) {
      const lfo = this.ctx.createOscillator()
      const depth = this.ctx.createGain()
      lfo.frequency.value = 14
      depth.gain.value = 30
      lfo.connect(depth).connect(o.frequency)
      lfo.start()
      lfo.stop(this.ctx.currentTime + 0.5)
    }
    this.note(660, { at: 0.02, len: 0.2, type: 'triangle', gain: 0.05, slide: 0.6 })
  }

  nice() {
    this.note(hz(7), { len: 0.1, type: 'triangle', gain: 0.08 })
    this.note(hz(12), { at: 0.08, len: 0.16, type: 'triangle', gain: 0.08 })
  }

  fanfare() {
    ;[0, 4, 7, 12].forEach((s, i) => this.note(hz(s, 392), { at: i * 0.12, len: 0.3, type: 'square', gain: 0.045 }))
    ;[0, 4, 7, 12].forEach((s, i) => this.note(hz(s, 392), { at: i * 0.12, len: 0.32, type: 'triangle', gain: 0.1 }))
  }

  finish() {
    const tune = [0, 4, 7, 12, 7, 12, 16, 19, 24]
    tune.forEach((s, i) => this.note(hz(s, 392), { at: i * 0.11, len: 0.28, type: 'triangle', gain: 0.13 }))
    ;[0, 7, 12].forEach((s) => this.note(hz(s, 196), { at: 0.9, len: 1.2, type: 'sine', gain: 0.1 }))
  }

  click() {
    this.note(880, { len: 0.06, type: 'triangle', gain: 0.1 })
  }

  // --- Background music: a gentle plucky loop, scheduled slightly ahead -----------------

  music(on) {
    this.musicOn = on
    if (on && this.ctx) this.nextBeat = Math.max(this.nextBeat, this.ctx.currentTime + 0.1)
  }

  schedule() {
    if (!this.ctx || !this.musicOn || this.ctx.state !== 'running') return
    const beatLen = 60 / 116 / 2 // eighth notes
    if (this.nextBeat < this.ctx.currentTime) this.nextBeat = this.ctx.currentTime + 0.05
    // I - V - vi - IV in C
    const chords = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]]
    while (this.nextBeat < this.ctx.currentTime + 0.3) {
      const at = this.nextBeat - this.ctx.currentTime
      const bar = Math.floor(this.beat / 8) % 4
      const step = this.beat % 8
      const chord = chords[bar]
      if (step % 4 === 0) this.note(hz(chord[0] - 24, 523.25), { at, len: 0.4, type: 'triangle', gain: 0.22, out: this.musicBus })
      if (step === 2 || step === 6) this.note(hz(chord[1] - 12), { at, len: 0.12, type: 'sine', gain: 0.08, out: this.musicBus })
      // a little melody that wanders over the chord tones
      if (Math.random() < (step % 2 ? 0.35 : 0.7)) {
        const tone = chord[Math.floor(Math.random() * 3)] + (Math.random() < 0.3 ? 12 : 0)
        this.note(hz(tone), { at, len: 0.22, type: 'triangle', gain: 0.1, out: this.musicBus })
      }
      this.nextBeat += beatLen
      this.beat++
    }
  }
}
