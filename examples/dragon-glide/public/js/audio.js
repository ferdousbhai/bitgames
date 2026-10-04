/**
 * Every sound is synthesized with Web Audio: nothing to download. The context is only
 * created after the first tap or key press, as browsers require. Music and sound
 * effects can be switched off separately.
 */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28]
const hz = (semitones, base = 523.25) => base * 2 ** (semitones / 12)

const load = (key, fallback) => {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}
const save = (key, on) => {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {}
}

export class Sound {
  constructor() {
    this.ctx = null
    this.muted = load('dragon-glide.muted', false)
    this.musicOn = load('dragon-glide.music', true)
    this.playing = false
    this.song = null
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
    const ctx = this.ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0.8
    const comp = ctx.createDynamicsCompressor()
    this.master.connect(comp).connect(ctx.destination)
    this.sfx = ctx.createGain()
    this.sfx.gain.value = this.muted ? 0 : 1
    this.sfx.connect(this.master)
    this.musicBus = ctx.createGain()
    this.musicBus.gain.value = this.musicOn ? 0.3 : 0
    this.musicBus.connect(this.master)
    // a soft echo for sparkly things
    this.echo = ctx.createDelay(1)
    this.echo.delayTime.value = 0.21
    const fb = ctx.createGain()
    fb.gain.value = 0.3
    const wet = ctx.createGain()
    wet.gain.value = 0.3
    this.echo.connect(fb).connect(this.echo)
    this.echo.connect(wet).connect(this.sfx)
    const len = ctx.sampleRate
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this.startWind()
    this.timer = setInterval(() => this.schedule(), 90)
  }

  setMuted(muted) {
    this.muted = muted
    save('dragon-glide.muted', muted)
    if (this.ctx) this.sfx.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05)
  }

  setMusic(on) {
    this.musicOn = on
    save('dragon-glide.music', on)
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.3 : 0, this.ctx.currentTime, 0.1)
  }

  suspend() {
    this.ctx?.suspend().catch(() => {})
  }

  /** One enveloped oscillator note. */
  note(freq, { at = 0, len = 0.15, type = 'sine', gain = 0.2, slide = 0, attack = 0.005, out, echo = false } = {}) {
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
    osc.connect(g).connect(out ?? this.sfx)
    if (echo) g.connect(this.echo)
    osc.start(t)
    osc.stop(t + len + 0.02)
    return osc
  }

  hiss({ at = 0, len = 0.08, freq = 2500, q = 1.5, gain = 0.2, type = 'bandpass', sweep = 0 } = {}) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime + at
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(freq, t)
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + len)
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, len / 3))
    g.gain.exponentialRampToValueAtTime(0.0001, t + len)
    src.connect(f).connect(g).connect(this.sfx)
    src.start(t, Math.random() * 0.5)
    src.stop(t + len + 0.02)
  }

  // --- Wind: a soft rushing noise that follows the flying speed ------------------------

  startWind() {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    this.windFilter = ctx.createBiquadFilter()
    this.windFilter.type = 'bandpass'
    this.windFilter.frequency.value = 500
    this.windFilter.Q.value = 0.7
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0
    src.connect(this.windFilter).connect(this.windGain).connect(this.sfx)
    src.start()
  }

  wind(level) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.windGain.gain.setTargetAtTime(0.025 + level * 0.05, t, 0.3)
    this.windFilter.frequency.setTargetAtTime(380 + level * 700, t, 0.3)
  }

  // --- Effects -------------------------------------------------------------------------

  flap() {
    this.hiss({ len: 0.16, freq: 420, q: 0.8, gain: 0.05, type: 'lowpass', sweep: 0.6 })
  }

  gem(combo, big) {
    const step = PENTA[Math.min(combo, PENTA.length - 1)]
    this.note(hz(step), { len: 0.25, type: 'triangle', gain: 0.13, echo: true })
    this.note(hz(step + 12), { at: 0.03, len: 0.18, gain: 0.05 })
    if (big) [7, 12, 16].forEach((s, i) => this.note(hz(step + s), { at: 0.06 + i * 0.05, len: 0.3, type: 'triangle', gain: 0.08, echo: true }))
  }

  hoop(combo) {
    this.hiss({ len: 0.45, freq: 800, q: 0.9, gain: 0.12, sweep: 3 })
    const base = Math.min(combo, 6) * 2
    ;[0, 4, 7, 12].forEach((s, i) => this.note(hz(s + base, 392), { at: 0.04 + i * 0.06, len: 0.35, type: 'triangle', gain: 0.1, echo: true }))
  }

  whiff() {
    this.hiss({ len: 0.3, freq: 600, q: 0.8, gain: 0.06, sweep: 0.5 })
  }

  fire() {
    this.hiss({ len: 0.35, freq: 900, q: 0.6, gain: 0.16, type: 'lowpass', sweep: 0.35 })
    this.note(330, { len: 0.25, type: 'sawtooth', gain: 0.025, slide: 0.5 })
    for (let i = 0; i < 4; i++) this.note(hz(24 + PENTA[i * 2]), { at: 0.05 + i * 0.04, len: 0.08, gain: 0.03 })
  }

  pop() {
    this.note(520, { len: 0.12, gain: 0.2, slide: 2.5 })
    this.hiss({ len: 0.05, freq: 3000, q: 1, gain: 0.12 })
    ;[0, 4, 7, 12, 16].forEach((s, i) => this.note(hz(s + 7), { at: 0.08 + i * 0.045, len: 0.22, type: 'triangle', gain: 0.07, echo: true }))
  }

  lantern() {
    this.hiss({ len: 0.25, freq: 1200, q: 0.7, gain: 0.08, type: 'lowpass', sweep: 0.5 })
    ;[0, 7, 12, 19].forEach((s, i) => this.note(hz(s, 659.25), { at: 0.05 + i * 0.07, len: 0.6, type: 'sine', gain: 0.07, echo: true }))
  }

  bonk() {
    const o = this.note(300, { len: 0.5, type: 'sine', gain: 0.22, slide: 0.55 })
    if (o) {
      const lfo = this.ctx.createOscillator()
      const depth = this.ctx.createGain()
      lfo.frequency.value = 13
      depth.gain.value = 30
      lfo.connect(depth).connect(o.frequency)
      lfo.start()
      lfo.stop(this.ctx.currentTime + 0.55)
    }
    this.note(620, { at: 0.02, len: 0.2, type: 'triangle', gain: 0.05, slide: 0.6 })
    // little birdies tweeting round the dizzy head
    for (let i = 0; i < 3; i++) this.note(2200 + i * 200, { at: 0.35 + i * 0.12, len: 0.07, gain: 0.03, slide: 1.3 })
  }

  power() {
    for (let i = 0; i < 10; i++) this.note(hz(PENTA[i]), { at: i * 0.045, len: 0.25, type: 'triangle', gain: 0.09, echo: true })
    this.hiss({ len: 0.8, freq: 1500, q: 0.6, gain: 0.08, sweep: 3 })
  }

  powerDown() {
    ;[12, 7, 4, 0].forEach((s, i) => this.note(hz(s), { at: i * 0.07, len: 0.2, type: 'triangle', gain: 0.06 }))
  }

  fanfare() {
    ;[0, 4, 7, 12, 7, 12, 16].forEach((s, i) => this.note(hz(s, 392), { at: i * 0.12, len: 0.32, type: 'triangle', gain: 0.12, echo: true }))
    ;[0, 4, 7, 12].forEach((s, i) => this.note(hz(s, 392), { at: i * 0.12, len: 0.32, type: 'square', gain: 0.03 }))
    ;[0, 7, 12].forEach((s) => this.note(hz(s, 196), { at: 0.84, len: 1.2, type: 'sine', gain: 0.1 }))
  }

  /** A happy family of dragons going "rawr!" */
  rawr(pitch = 1) {
    this.note(180 * pitch, { len: 0.35, type: 'sawtooth', gain: 0.04, slide: 1.6 })
    this.note(360 * pitch, { len: 0.35, type: 'triangle', gain: 0.08, slide: 1.4 })
    this.hiss({ len: 0.3, freq: 700 * pitch, q: 2, gain: 0.05, sweep: 1.5 })
  }

  finish() {
    const tune = [0, 4, 7, 12, 7, 12, 16, 19, 24]
    tune.forEach((s, i) => this.note(hz(s, 392), { at: i * 0.11, len: 0.3, type: 'triangle', gain: 0.13, echo: true }))
    ;[0, 7, 12].forEach((s) => this.note(hz(s, 196), { at: 0.9, len: 1.4, type: 'sine', gain: 0.1 }))
  }

  click() {
    this.note(880, { len: 0.06, type: 'triangle', gain: 0.1 })
  }

  // --- Music: a gentle loop that changes with each world, scheduled slightly ahead -----

  play(song) {
    this.song = song
    this.playing = !!song
    if (song && this.ctx) this.nextBeat = Math.max(this.nextBeat, this.ctx.currentTime + 0.1)
  }

  schedule() {
    if (!this.ctx || !this.playing || !this.song || this.ctx.state !== 'running') return
    const song = this.song
    const beatLen = 60 / song.tempo / 2 // eighth notes
    if (this.nextBeat < this.ctx.currentTime) this.nextBeat = this.ctx.currentTime + 0.05
    while (this.nextBeat < this.ctx.currentTime + 0.3) {
      const at = this.nextBeat - this.ctx.currentTime
      const bar = Math.floor(this.beat / 8) % song.chords.length
      const step = this.beat % 8
      const chord = song.chords[bar]
      const out = this.musicBus
      if (step === 0 || step === 4) this.note(hz(chord[0] - 24), { at, len: 0.5, type: 'triangle', gain: 0.2, out })
      if (step === 2 || step === 6) {
        this.note(hz(chord[1] - 12), { at, len: 0.25, type: 'sine', gain: 0.06, out })
        this.note(hz(chord[2] - 12), { at, len: 0.25, type: 'sine', gain: 0.05, out })
      }
      // a melody that drifts over the chord tones, like a breeze
      if (Math.random() < (step % 2 ? 0.25 : 0.6)) {
        const tone = chord[Math.floor(Math.random() * 3)] + (Math.random() < 0.35 ? 12 : 0)
        this.note(hz(tone), { at, len: 0.3, type: song.wave, gain: song.wave === 'square' ? 0.03 : 0.08, out })
      }
      this.nextBeat += beatLen
      this.beat++
    }
  }
}
