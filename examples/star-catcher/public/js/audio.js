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
      if (this.ctx.state === 'suspended') this.ctx.resume()
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
    this.ctx?.suspend()
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

  /** Catching climbs the scale while you keep catching quickly. */
  catch(combo, kind) {
    if (!this.ctx) return
    const n = SCALE[Math.min(combo, SCALE.length - 1)]
    if (kind === 'gem') {
      this.tone(n, { dur: 0.5, vol: 0.14 })
      this.tone(n * 2.76, { dur: 0.3, vol: 0.05, when: 0.01 })
      this.tone(n * 1.5, { dur: 0.4, vol: 0.1, when: 0.08 })
    } else if (kind === 'rainbow') {
      ;[0, 2, 4, 5, 7].forEach((k, i) => this.tone(SCALE[Math.min(k + 2, SCALE.length - 1)], { when: i * 0.06, dur: 0.4, vol: 0.12, type: 'triangle' }))
    } else {
      this.tone(n, { dur: 0.32, vol: 0.16 })
      this.tone(n * 2, { dur: 0.18, vol: 0.05, type: 'triangle', echo: false })
    }
  }

  powerUp() {
    if (!this.ctx) return
    this.tone(330, { dur: 0.45, vol: 0.12, type: 'triangle', slide: 3 })
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, { when: 0.12 + i * 0.07, dur: 0.3, vol: 0.1 }))
  }

  powerDown() {
    this.tone(784, { dur: 0.35, vol: 0.06, slide: 0.6, echo: false })
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
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    osc.connect(g).connect(this.sfx)
    osc.start(t)
    lfo.start(t)
    osc.stop(t + 0.65)
    lfo.stop(t + 0.65)
  }

  /** Arriving at a new planet: a happy little fanfare. */
  fanfare() {
    if (!this.ctx) return
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((f, i) => this.tone(f, { when: i * 0.12, dur: 0.5, vol: 0.12, type: 'triangle' }))
    ;[523.25, 659.25, 783.99].forEach((f) => this.tone(f, { when: 0.5, dur: 1.1, vol: 0.07, type: 'triangle' }))
    this.tone(2093, { when: 0.5, dur: 0.6, vol: 0.04 })
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
    this.engine.g.gain.setTargetAtTime(on ? 0.05 + Math.min(speed, 12) * 0.006 : 0, t, 0.15)
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
