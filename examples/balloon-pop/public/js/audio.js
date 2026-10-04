/** Every sound is synthesized with Web Audio: nothing to download. */
const PENTA = [0, 2, 4, 7, 9] // major pentatonic: any run of notes sounds happy
const MELODY = [0, 2, 4, 2, 5, 4, 2, 0, 1, 3, 5, 3, 7, 5, 4, 2]
const BASS = [0, 0, -2, -2, -3, -3, -1, -1]
const note = (step, base = 523.25) => base * 2 ** ((PENTA[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5)) / 12)

export class Audio {
  constructor() {
    this.ctx = null
    this.muted = false
    this.musicOn = true
    this.nextBeat = 0
    this.beat = 0
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
    this.musicBus.gain.value = 0.22
    this.musicBus.connect(this.master)
    const len = this.ctx.sampleRate
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running'
  }

  setMuted(muted) {
    this.muted = muted
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05)
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

  /** The pop: a snap of noise, a rubbery thump and a note that climbs with the combo. */
  pop(combo = 0, size = 1) {
    this.burst({ freq: 2200, q: 0.7, gain: 0.55, decay: 0.07, type: 'highpass' })
    this.burst({ freq: 900, q: 1.2, gain: 0.35 * size, decay: 0.12 })
    this.tone({ freq: 180 / size, type: 'sine', gain: 0.35, decay: 0.12, slide: -110 })
    this.tone({ freq: note(Math.min(combo, 14)), type: 'triangle', gain: 0.16, decay: 0.25, delay: 0.02 })
  }

  sparkle() {
    for (let i = 0; i < 5; i++) this.tone({ freq: note(5 + i * 2), type: 'sine', gain: 0.12, decay: 0.35, delay: i * 0.05 })
  }

  boom() {
    this.tone({ freq: 120, type: 'sine', gain: 0.5, decay: 0.6, slide: -80 })
    this.burst({ freq: 400, q: 0.6, gain: 0.5, decay: 0.7, type: 'lowpass' })
    for (let i = 0; i < 8; i++) this.burst({ freq: 3000 + Math.random() * 3000, q: 3, gain: 0.12, decay: 0.08, delay: 0.15 + Math.random() * 0.5 })
  }

  rainbow() {
    for (let i = 0; i < 8; i++) this.tone({ freq: note(i), type: 'triangle', gain: 0.13, decay: 0.3, delay: i * 0.045 })
  }

  levelUp() {
    const tune = [0, 2, 4, 5, 4, 7]
    tune.forEach((s, i) => this.tone({ freq: note(s, 392), type: 'square', gain: 0.07, decay: 0.28, delay: i * 0.11 }))
    tune.forEach((s, i) => this.tone({ freq: note(s, 392) * 2, type: 'triangle', gain: 0.09, decay: 0.3, delay: i * 0.11 }))
    this.burst({ freq: 5000, q: 1, gain: 0.15, decay: 0.6, delay: 0.66, type: 'highpass' })
  }

  click() {
    this.tone({ freq: 660, type: 'triangle', gain: 0.18, decay: 0.12, slide: 300 })
  }

  giggle() {
    for (let i = 0; i < 4; i++) this.tone({ freq: 700 + i * 90, type: 'sine', gain: 0.12, decay: 0.09, delay: i * 0.08, slide: 200 })
  }

  /** The hot-air balloon's burner: a soft roar of air, then a happy rising toot. */
  whoosh() {
    this.burst({ freq: 500, q: 0.8, gain: 0.35, decay: 0.55, type: 'lowpass' })
    this.burst({ freq: 1400, q: 1.5, gain: 0.12, decay: 0.4, delay: 0.05 })
    ;[0, 2, 4].forEach((s, i) => this.tone({ freq: note(s + 5), type: 'triangle', gain: 0.12, decay: 0.25, delay: 0.25 + i * 0.09 }))
  }

  /** The windmill whirling: a quick spiral of notes over a breezy swish. */
  whirr() {
    this.burst({ freq: 1800, q: 0.9, gain: 0.18, decay: 0.7 })
    for (let i = 0; i < 6; i++) this.tone({ freq: note(i * 2 - 2), type: 'sine', gain: 0.1, decay: 0.16, delay: i * 0.06, slide: 120 })
  }

  /** A soft, silly "baa" from a tapped sheep: a wobbly reedy note through a vowel-ish filter. */
  baa(pitch = 1) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(330 * pitch, t)
    osc.frequency.linearRampToValueAtTime(300 * pitch, t + 0.55)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 9
    const depth = ctx.createGain()
    depth.gain.value = 14 * pitch
    lfo.connect(depth).connect(osc.frequency)
    const vowel = ctx.createBiquadFilter()
    vowel.type = 'bandpass'
    vowel.frequency.setValueAtTime(700, t)
    vowel.frequency.linearRampToValueAtTime(1100, t + 0.12)
    vowel.Q.value = 1.6
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.05)
    g.gain.setValueAtTime(0.35, t + 0.35)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    osc.connect(vowel).connect(g).connect(this.master)
    osc.start(t)
    lfo.start(t)
    osc.stop(t + 0.65)
    lfo.stop(t + 0.65)
  }

  /** A gentle music-box loop, scheduled a little ahead each frame. */
  updateMusic(playing) {
    if (!this.ready || !this.musicOn || !playing) return
    const ctx = this.ctx
    if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + 0.05
    while (this.nextBeat < ctx.currentTime + 0.25) {
      const b = this.beat++
      const t = this.nextBeat - ctx.currentTime
      if (b % 2 === 0) this.tone({ freq: note(MELODY[(b / 2) % 16], 523.25), type: 'sine', gain: 0.18, decay: 0.5, delay: t, out: this.musicBus })
      if (b % 4 === 0) this.tone({ freq: note(BASS[(b / 4) % 8], 130.8), type: 'triangle', gain: 0.25, decay: 0.8, delay: t, out: this.musicBus })
      this.nextBeat += 0.19
    }
  }
}
