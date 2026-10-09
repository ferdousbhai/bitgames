/** All sound is synthesized with Web Audio: nothing to download. Starts after the first tap or key. */

// C major pentatonic: every combination sounds friendly.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093]

// Three little tunes as scale-step patterns (null = rest). Steps index into PENTA.
const PENTA = [196, 220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880]
const SONGS = {
  garage: {
    bpm: 104,
    melody: [7, null, 9, null, 10, 9, 7, null, 5, null, 7, null, 4, null, null, null, 5, null, 7, null, 9, 7, 5, null, 4, null, 2, null, 4, null, null, null],
    bass: [0, 3, 1, 4],
    vol: 0.06,
    type: 'sine',
  },
  flight: {
    bpm: 112,
    melody: [7, 9, 10, null, 9, 7, 9, null, 10, 11, 10, 9, 7, null, null, null, 5, 7, 9, null, 7, 5, 4, null, 5, 7, 5, 4, 2, null, 4, null],
    bass: [0, 0, 3, 4],
    vol: 0.055,
    type: 'triangle',
  },
  dance: {
    // A gentle little dance: about 100 bpm, triangle tone, no claps
    bpm: 100,
    melody: [7, 9, 7, 4, 7, 9, 10, null, 10, 9, 7, 9, 7, 4, 5, null, 7, 9, 7, 4, 7, 9, 10, 11, 10, 9, 7, 5, 7, null, null, null],
    bass: [0, 3, 4, 3],
    vol: 0.05,
    type: 'triangle',
  },
}
const BASS_ROOTS = [130.81, 174.61, 110, 196, 146.83]

export class Audio {
  constructor() {
    this.ctx = null
    this.muted = false
    this.musicOn = true
    this.song = 'garage'
    this.step = 0
    this.next = 0
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}) // WebKit can refuse the audio device; play on silently
      return
    }
    try {
      this.ctx = new AudioContext()
    } catch {
      return
    }
    const ctx = this.ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.8
    const comp = ctx.createDynamicsCompressor()
    this.master.connect(comp).connect(ctx.destination)
    this.sfx = ctx.createGain()
    this.sfx.connect(this.master)
    this.music = ctx.createGain()
    this.music.gain.value = this.musicOn ? 1 : 0
    this.music.connect(this.master)
    this.echo = ctx.createDelay(1)
    this.echo.delayTime.value = 0.21
    const fb = ctx.createGain()
    fb.gain.value = 0.25
    const wet = ctx.createGain()
    wet.gain.value = 0.3
    this.echo.connect(fb).connect(this.echo)
    this.echo.connect(wet).connect(this.master)
    const len = ctx.sampleRate
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this.startEngine()
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
    if (this.music) this.music.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.1)
  }

  suspend() {
    this.ctx?.suspend().catch(() => {})
  }

  tone(freq, { when = 0, dur = 0.35, type = 'sine', vol = 0.18, echo = true, slide = 0, attack = 0.012, out = this.sfx } = {}) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime + when
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(out)
    if (echo) g.connect(this.echo)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  noiseBurst({ when = 0, dur = 0.2, vol = 0.1, type = 'bandpass', freq = 1200, to = 0, q = 1, out = this.sfx } = {}) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime + when
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = type
    f.Q.value = q
    f.frequency.setValueAtTime(freq, t)
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(out)
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.05)
  }

  click() {
    this.tone(880, { dur: 0.1, vol: 0.09, echo: false })
  }

  /** A part clicks into place: a clunk and a happy pop. */
  snap(pitch = 0) {
    if (!this.ctx) return
    this.noiseBurst({ dur: 0.06, vol: 0.18, freq: 2500, q: 2 })
    this.tone(180, { dur: 0.12, vol: 0.2, type: 'triangle', slide: 0.5, echo: false })
    this.tone(SCALE[2 + (pitch % 6)], { when: 0.05, dur: 0.25, vol: 0.12, type: 'triangle' })
    this.tone(SCALE[4 + (pitch % 6)], { when: 0.11, dur: 0.3, vol: 0.1 })
  }

  /** Bloop, for paint. */
  paint() {
    this.tone(300, { dur: 0.18, vol: 0.16, slide: 2.4, echo: false })
    this.tone(760, { when: 0.1, dur: 0.14, vol: 0.08, slide: 1.4 })
  }

  /** A soft "not yet". Never harsh. */
  nope() {
    this.tone(392, { dur: 0.16, vol: 0.09, type: 'triangle', echo: false })
    this.tone(330, { when: 0.13, dur: 0.22, vol: 0.09, type: 'triangle', echo: false })
  }

  /** A sparkly chime when a new planet comes within reach. */
  reach() {
    ;[0, 2, 4, 7].forEach((k, i) => this.tone(SCALE[k], { when: i * 0.07, dur: 0.35, vol: 0.09 }))
  }

  /** Dice rattle for "surprise me". */
  rattle() {
    for (let i = 0; i < 7; i++) this.noiseBurst({ when: i * 0.05, dur: 0.04, vol: 0.12, freq: 1800 + Math.random() * 1500, q: 4 })
  }

  beep(last = false) {
    this.tone(last ? 784 : 523.25, { dur: last ? 0.6 : 0.35, vol: 0.09, type: 'sine', echo: !!last })
  }

  /** Big rumble and whoosh at lift-off. */
  liftoff() {
    if (!this.ctx) return
    this.noiseBurst({ dur: 2.6, vol: 0.16, type: 'lowpass', freq: 120, to: 700, q: 0.7 })
    this.noiseBurst({ when: 0.2, dur: 1.8, vol: 0.05, type: 'bandpass', freq: 400, to: 1800, q: 2 })
    this.tone(90, { dur: 1.6, vol: 0.12, type: 'triangle', slide: 2.5, echo: false })
  }

  /** step 0..5 comes from where the star was caught, so catching never climbs into a frenzy. */
  catch(step) {
    if (!this.ctx) return
    const n = SCALE[Math.min(step, SCALE.length - 1)]
    this.tone(n, { dur: 0.3, vol: 0.1 })
    this.tone(n * 2, { dur: 0.16, vol: 0.05, type: 'triangle', echo: false })
  }

  turbo() {
    if (!this.ctx) return
    this.tone(260, { dur: 0.6, vol: 0.07, type: 'triangle', slide: 4, echo: false })
    ;[0, 2, 4, 5, 7, 9].forEach((k, i) => this.tone(SCALE[Math.min(k, 10)], { when: 0.1 + i * 0.06, dur: 0.35, vol: 0.1, type: 'triangle' }))
  }

  /** A soft cartoon boing for bumping space junk. */
  boing() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(320, t)
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.5)
    lfo.frequency.value = 14
    lfoGain.gain.value = 30
    lfo.connect(lfoGain).connect(osc.frequency)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    osc.connect(g).connect(this.sfx)
    osc.start(t)
    lfo.start(t)
    osc.stop(t + 0.65)
    lfo.stop(t + 0.65)
  }

  /** Slide whistle: up for hopping out, down for landing. */
  whistle(up = true) {
    this.tone(up ? 500 : 1400, { dur: 0.45, vol: 0.1, slide: up ? 2.6 : 0.4, type: 'sine', attack: 0.04 })
  }

  thump() {
    this.tone(110, { dur: 0.25, vol: 0.18, type: 'sine', slide: 0.5, echo: false })
    this.noiseBurst({ dur: 0.3, vol: 0.12, type: 'lowpass', freq: 600, to: 150 })
  }

  whoosh(dur = 1) {
    this.noiseBurst({ dur, vol: 0.1, type: 'bandpass', freq: 300, to: 2200, q: 3 })
  }

  fanfare() {
    if (!this.ctx) return
    // One soft chord, played once
    ;[523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, { when: i * 0.16, dur: 0.7, vol: 0.08, type: 'sine' }))
    ;[523.25, 659.25, 783.99].forEach((f) => this.tone(f, { when: 0.55, dur: 1.2, vol: 0.05, type: 'triangle' }))
  }

  /** Sparkle for each newly unlocked part. */
  unlock1(i) {
    this.tone(SCALE[(i * 2) % 9 + 2], { dur: 0.4, vol: 0.1 })
    this.tone(SCALE[(i * 2) % 9 + 2] * 2, { when: 0.05, dur: 0.3, vol: 0.04 })
  }

  startEngine() {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 200
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(f).connect(g).connect(this.sfx)
    src.start()
    this.engine = { f, g }
  }

  /** Thruster rumble: 0 = off, 1 = full. */
  setEngine(level) {
    if (!this.engine) return
    const t = this.ctx.currentTime
    this.engine.g.gain.setTargetAtTime(level * 0.16, t, 0.12)
    this.engine.f.frequency.setTargetAtTime(150 + level * 380, t, 0.2)
  }

  playSong(name) {
    if (this.song === name) return
    this.song = name
    this.step = 0
  }

  /** Scheduled a little ahead every frame. */
  updateMusic() {
    if (!this.ready || !this.musicOn) return
    const ctx = this.ctx
    const song = SONGS[this.song]
    if (!song) return
    const beat = 60 / song.bpm / 2
    if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.05
    while (this.next < ctx.currentTime + 0.3) {
      const s = this.step++
      const t = this.next - ctx.currentTime
      const m = song.melody[s % song.melody.length]
      if (m !== null) this.tone(PENTA[m] * 2, { when: t, dur: song.type === 'square' ? 0.18 : 0.42, vol: song.vol * (song.type === 'square' ? 0.55 : 1), type: song.type, echo: false, attack: 0.01, out: this.music })
      if (s % 4 === 0) {
        const root = BASS_ROOTS[song.bass[(s / 8) % song.bass.length | 0]]
        this.tone(root, { when: t, dur: 0.5, vol: 0.09, type: 'triangle', echo: false, attack: 0.01, out: this.music })
        if (s % 8 === 4) this.tone(root * 1.5, { when: t, dur: 0.35, vol: 0.05, type: 'triangle', echo: false, out: this.music })
      }
      if (song.clap && s % 4 === 2) this.noiseBurst({ when: t, dur: 0.08, vol: 0.06, freq: 1800, q: 1.5, out: this.music })
      this.next += beat
    }
  }
}
