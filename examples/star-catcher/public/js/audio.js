/** All sound is synthesized with Web Audio: nothing to download. Starts after the first tap or key. */

// C major pentatonic, two octaves and a bit: every combination sounds friendly.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093]
const MUSIC = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25]

export class Audio {
  constructor() {
    this.ctx = null
    this.muted = false
    this.musicStep = 0
    this.musicNext = 0
    this.melody = 2
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
    const ctx = this.ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.8
    const comp = ctx.createDynamicsCompressor()
    this.master.connect(comp).connect(ctx.destination)
    this.sfx = ctx.createGain()
    this.sfx.connect(this.master)
    this.music = ctx.createGain()
    this.music.gain.value = 0.32
    this.music.connect(this.master)
    // A soft echo, shared by everything sparkly
    this.echo = ctx.createDelay(1)
    this.echo.delayTime.value = 0.23
    const fb = ctx.createGain()
    fb.gain.value = 0.28
    const wet = ctx.createGain()
    wet.gain.value = 0.35
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

  suspend() {
    this.ctx?.suspend().catch(() => {})
  }

  /** A short bell-like note, on the effects bus unless `out` says otherwise. */
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

  /** A bright little "tink" as a star is caught, pitched by where it was caught (low left, high right). */
  catch(step) {
    if (!this.ctx) return
    const n = SCALE[Math.min(step, SCALE.length - 1)]
    this.tone(n, { dur: 0.22, vol: 0.13, type: 'triangle', slide: 1.06 })
    this.tone(n * 2, { dur: 0.12, vol: 0.05, echo: false })
  }

  /** A star landing in the picture: one bell per star, a step up the scale each time, so every picture is a little tune. */
  light(n) {
    if (!this.ctx) return
    const f = SCALE[(n - 1) % SCALE.length]
    this.tone(f, { dur: 0.7, vol: 0.1, attack: 0.02 })
    this.tone(f * 1.5, { dur: 0.5, vol: 0.03, type: 'triangle', when: 0.04, echo: false })
  }

  /** The big pink star bursts: a quick sparkly run up the scale. */
  sparkle() {
    if (!this.ctx) return
    ;[0, 2, 4, 5, 7, 9].forEach((k, i) => this.tone(SCALE[k], { when: i * 0.05, dur: 0.3, vol: 0.08, type: 'triangle' }))
  }

  /** The picture is whole and wakes up: a shimmering sweep and a warm chord. */
  wake() {
    if (!this.ctx) return
    SCALE.forEach((f, i) => this.tone(f, { when: i * 0.035, dur: 0.4, vol: 0.05, type: 'sine' }))
    ;[392, 523.25, 659.25, 783.99].forEach((f) => this.tone(f, { when: 0.4, dur: 1.4, vol: 0.05, attack: 0.06, type: 'triangle' }))
  }

  /** Each star creature's own little sound (on waking, and when tapped). */
  voice(id) {
    if (!this.ctx) return
    if (id === 'cat') return this.meow()
    if (id === 'bear') {
      // A friendly low "hrrm-hm"
      this.tone(150, { dur: 0.35, vol: 0.2, type: 'triangle', slide: 0.8, attack: 0.04, echo: false })
      this.tone(190, { when: 0.3, dur: 0.3, vol: 0.18, type: 'triangle', slide: 0.75, attack: 0.03, echo: false })
    } else if (id === 'fish') {
      // Bubbles: quick blips sliding up
      for (let i = 0; i < 4; i++) this.tone(500 + Math.random() * 500, { when: i * 0.09, dur: 0.08, vol: 0.12, slide: 2.2, echo: false })
    } else if (id === 'bird') {
      // Tweet-tweet
      ;[0, 0.16].forEach((w) => this.tone(1900, { when: w, dur: 0.1, vol: 0.09, slide: 1.5, echo: false }))
      this.tone(2300, { when: 0.34, dur: 0.16, vol: 0.08, slide: 0.7 })
    } else if (id === 'bunny') {
      // A springy boing up
      this.tone(300, { dur: 0.25, vol: 0.14, slide: 2.6, echo: false })
      this.tone(600, { when: 0.12, dur: 0.18, vol: 0.06, type: 'triangle', slide: 1.6, echo: false })
    } else if (id === 'butterfly') {
      // A soft high flutter
      for (let i = 0; i < 6; i++) this.tone(SCALE[5 + (i % 4)], { when: i * 0.06, dur: 0.18, vol: 0.05, type: 'triangle' })
    }
  }

  /** A star (or a zoo treat) twinkling into the sky: two soft high notes. */
  twinkle() {
    if (!this.ctx) return
    this.tone(SCALE[7], { dur: 0.25, vol: 0.05, type: 'triangle' })
    this.tone(SCALE[9], { when: 0.08, dur: 0.3, vol: 0.04, type: 'triangle' })
  }

  /** A planet's friendly sneeze: a rising "ah…" and a soft, breathy "choo!". */
  achoo() {
    if (!this.ctx) return
    this.tone(330, { dur: 0.4, vol: 0.09, type: 'triangle', slide: 1.5, attack: 0.08, echo: false })
    const ctx = this.ctx
    const t = ctx.currentTime + 0.48
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 1.5
    f.frequency.setValueAtTime(2600, t)
    f.frequency.exponentialRampToValueAtTime(900, t + 0.25)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
    src.connect(f).connect(g).connect(this.sfx)
    src.start(t)
    src.stop(t + 0.3)
    this.tone(520, { when: 0.5, dur: 0.2, vol: 0.06, type: 'triangle', slide: 0.6, echo: false })
  }

  /** A bubble popping as Kitty catches the star inside it. */
  pop() {
    if (!this.ctx) return
    this.tone(700, { dur: 0.07, vol: 0.14, slide: 0.4, echo: false })
    this.tone(1400, { when: 0.02, dur: 0.06, vol: 0.06, type: 'triangle', slide: 1.8, echo: false })
  }

  /** A candy star bouncing off the bottom of the sky: a soft "bip", lower each bounce. */
  bip(n) {
    if (!this.ctx) return
    this.tone(SCALE[Math.max(0, 6 - n * 2)] * 0.5, { dur: 0.12, vol: 0.06, type: 'triangle', slide: 1.3, echo: false })
  }

  /** The friendly UFO's beep-boop when it is tapped. */
  beep() {
    if (!this.ctx) return
    this.tone(880, { dur: 0.1, vol: 0.08, type: 'square', echo: false })
    this.tone(660, { when: 0.12, dur: 0.1, vol: 0.08, type: 'square', echo: false })
    this.tone(1320, { when: 0.24, dur: 0.18, vol: 0.06, type: 'square', slide: 1.3 })
  }

  /** A soft cartoon boing for bumping a sleepy rock: no harsh crash. */
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
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    osc.connect(g).connect(this.sfx)
    osc.start(t)
    lfo.start(t)
    osc.stop(t + 0.65)
    lfo.stop(t + 0.65)
  }

  /** Home at last: a happy little fanfare. */
  fanfare() {
    if (!this.ctx) return
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((f, i) => this.tone(f, { when: i * 0.16, dur: 0.6, vol: 0.08, type: 'sine' }))
    ;[523.25, 659.25, 783.99].forEach((f) => this.tone(f, { when: 0.5, dur: 1.1, vol: 0.07, type: 'triangle' }))
  }

  whoosh(dur = 1.2) {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 3
    f.frequency.setValueAtTime(300, t)
    f.frequency.exponentialRampToValueAtTime(1800, t + dur * 0.5)
    f.frequency.exponentialRampToValueAtTime(400, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.08, t + dur * 0.4)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(this.sfx)
    src.start(t)
    src.stop(t + dur + 0.05)
  }

  /** Kitty's happy little meow when someone taps the rocket. */
  meow() {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const f = ctx.createBiquadFilter()
    const g = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(620, t)
    osc.frequency.exponentialRampToValueAtTime(980, t + 0.12)
    osc.frequency.exponentialRampToValueAtTime(560, t + 0.42)
    f.type = 'bandpass'
    f.Q.value = 2.5
    f.frequency.setValueAtTime(1200, t)
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.12)
    f.frequency.exponentialRampToValueAtTime(900, t + 0.42)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.04)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
    osc.connect(f).connect(g).connect(this.sfx)
    osc.start(t)
    osc.stop(t + 0.5)
  }

  /** A planet's giggle: three bouncy notes sliding up. */
  boop() {
    if (!this.ctx) return
    ;[392, 494, 587.33].forEach((f, i) => this.tone(f, { when: i * 0.09, dur: 0.18, vol: 0.13, type: 'triangle', slide: 1.25, echo: false }))
  }

  click() {
    this.tone(880, { dur: 0.12, vol: 0.1, echo: false })
  }

  /** A soft low rumble from the thruster; louder when moving fast. */
  startEngine() {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 220
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(f).connect(g).connect(this.sfx)
    src.start()
    this.engine = { f, g }
  }

  updateEngine(on, speed) {
    if (!this.engine) return
    const t = this.ctx.currentTime
    this.engine.g.gain.setTargetAtTime(on ? 0.03 + Math.min(speed, 12) * 0.003 : 0, t, 0.15)
    this.engine.f.frequency.setTargetAtTime(200 + Math.min(speed, 12) * 40, t, 0.15)
  }

  /** Gentle music-box tune, scheduled a little ahead of time. */
  updateMusic() {
    if (!this.ready) return
    const ctx = this.ctx
    const beat = 60 / 96 / 2
    if (this.musicNext < ctx.currentTime) this.musicNext = ctx.currentTime + 0.05
    while (this.musicNext < ctx.currentTime + 0.3) {
      const step = this.musicStep++
      const t = this.musicNext - ctx.currentTime
      // Wandering melody that leans toward the home note
      if (step % 2 === 0 || Math.random() < 0.3) {
        this.melody = Math.max(0, Math.min(MUSIC.length - 1, this.melody + [-2, -1, -1, 0, 1, 1, 2][(Math.random() * 7) | 0]))
        if (step % 16 === 0) this.melody = [0, 2, 4][(step / 16) % 3]
        this.musicNote(MUSIC[this.melody] * 2, t, 0.5, 0.05)
      }
      if (step % 8 === 0) {
        const root = [130.81, 110, 174.61, 196][(step / 8) % 4]
        this.musicNote(root, t, 1.6, 0.07)
        this.musicNote(root * 1.5, t + beat, 1.2, 0.035)
      }
      this.musicNext += beat
    }
  }

  musicNote(freq, when, dur, vol) {
    this.tone(freq, { when, dur, vol, echo: false, attack: 0.02, out: this.music })
  }
}
