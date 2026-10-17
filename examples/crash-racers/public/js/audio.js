// The menu music box: a pentatonic tune (semitones above G4) over a slow bass walk.
const MUSIC_TUNE = [0, 4, 7, 9, 7, 4, 2, 4, 0, 2, 4, 7, 9, 12, 9, 7]
const MUSIC_BASS = [0, 2, 4, 7, 9, 12]

/** All sound is synthesized with Web Audio: no sound files to download. */
export class Audio {
  constructor() {
    this.ctx = null
    this.engine = null
    this.lastCrash = 0
    this.muted = false
    this.nextBeat = 0
    this.beat = 0
  }

  /** The 🔊 switch: everything (engine, effects, music) fades to silence and back. */
  setMuted(muted) {
    this.muted = muted
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.05)
  }

  /** Browsers only allow audio after a tap or key press. */
  unlock() {
    if (this.ctx) {
      if (!document.hidden && this.ctx.state !== 'running') this.ctx.resume().catch(() => {})
      return
    }
    try {
      this.ctx = new AudioContext()
    } catch {
      return
    }
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.7
    this.master.connect(this.ctx.destination)
    const len = this.ctx.sampleRate
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }

  /** Hidden tab or app in the background: stop making sound (and using the CPU for it). */
  setHidden(hidden) {
    if (!this.ctx) return
    if (hidden) this.ctx.suspend().catch(() => {})
    else this.ctx.resume().catch(() => {})
  }

  get ready() {
    return !!this.ctx
  }

  noiseSource() {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    return src
  }

  startEngine() {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    // A soft hum (triangle and sine), never a buzz.
    osc.type = 'triangle'
    osc2.type = 'sine'
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 600
    const gain = ctx.createGain()
    gain.gain.value = 0
    osc.connect(filter)
    osc2.connect(filter)
    filter.connect(gain).connect(this.master)
    osc.start()
    osc2.start()
    this.engine = { osc, osc2, filter, gain }
  }

  /**
   * Engine pitch follows speed; throttle opens it up a little. Starts the engine once audio is unlocked.
   * On a calm road (Easy mode) it is a low, quiet purr with no gear changes.
   */
  updateEngine(speed, throttle, calm = false) {
    if (!this.ctx) return
    if (!this.engine) this.startEngine()
    const t = this.ctx.currentTime
    const rpm = calm ? 55 + speed * 2.4 : 45 + (speed % 9) * 9 + speed * 2.2
    this.engine.osc.frequency.setTargetAtTime(rpm, t, 0.08)
    this.engine.osc2.frequency.setTargetAtTime(rpm * 0.5, t, 0.08)
    this.engine.filter.frequency.setTargetAtTime(calm ? 260 + throttle * 160 + speed * 6 : 380 + throttle * 520 + speed * 14, t, 0.12)
    this.engine.gain.gain.setTargetAtTime(calm ? 0.035 + throttle * 0.02 : 0.05 + throttle * 0.04, t, 0.15)
  }

  /** Off the track (menus, lobby): fade the engine out until the next race. */
  idleEngine() {
    if (this.engine) this.engine.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2)
  }

  burst({ freq, q = 1, gain = 0.5, decay = 0.4, type = 'bandpass', delay = 0 }) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const src = this.noiseSource()
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    filter.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + decay)
    src.connect(filter).connect(g).connect(this.master)
    src.start(t, Math.random())
    src.stop(t + decay + 0.05)
  }

  tone({ freq, type = 'sine', gain = 0.2, decay = 0.2, delay = 0, slide = 0 }) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + decay)
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + decay)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + decay + 0.05)
  }

  /** Crunch: a low thump, metal noise and a tinny ring, scaled by the impact. */
  crash(speed, near = true) {
    const now = performance.now()
    if (now - this.lastCrash < 60) return
    this.lastCrash = now
    // Calm pass: about half the old loudness, and the tinny high ring is softer
    const v = Math.min(1, speed / 25) * (near ? 1 : 0.4)
    this.tone({ freq: 90, type: 'sine', gain: 0.32 * v, decay: 0.35, slide: -50 })
    this.burst({ freq: 900, q: 0.6, gain: 0.32 * v, decay: 0.25 + v * 0.4 })
    this.burst({ freq: 2600, q: 4, gain: 0.08 * v, decay: 0.3 + v * 0.3, delay: 0.02 })
    if (v > 0.5) this.burst({ freq: 300, q: 0.8, gain: 0.22 * v, decay: 0.6, delay: 0.05 })
  }

  glass(strength = 1) {
    for (let i = 0; i < 6 * strength; i++) this.tone({ freq: 2500 + Math.random() * 2500, type: 'triangle', gain: 0.04, decay: 0.15 + Math.random() * 0.3, delay: Math.random() * 0.25 })
    this.burst({ freq: 5000, q: 2, gain: 0.12 * strength, decay: 0.3 })
  }

  clunk(strength = 1) {
    this.tone({ freq: 160, type: 'triangle', gain: 0.12 * strength, decay: 0.15, slide: -80 })
    this.burst({ freq: 1400, q: 3, gain: 0.15 * strength, decay: 0.2 })
  }

  scrape(intensity) {
    if (intensity > 0.2) this.burst({ freq: 2500 + Math.random() * 1500, q: 6, gain: 0.08 * intensity, decay: 0.12 })
  }

  /** A car landing from a jump: a deep thud and some dust noise. */
  thump(strength = 1) {
    this.tone({ freq: 70, type: 'sine', gain: 0.32 * strength, decay: 0.3, slide: -30 })
    this.burst({ freq: 400, q: 0.7, gain: 0.15 * strength, decay: 0.3, type: 'lowpass' })
  }

  splash() {
    this.burst({ freq: 700, q: 0.7, gain: 0.25, decay: 0.4, type: 'lowpass' })
  }

  /** A friendly two-note toot (triangle, not a square-wave blare). */
  horn() {
    this.tone({ freq: 392, type: 'triangle', gain: 0.1, decay: 0.45 })
    this.tone({ freq: 494, type: 'triangle', gain: 0.08, decay: 0.45 })
  }

  beep(high = false) {
    this.tone({ freq: high ? 784 : 523, type: 'triangle', gain: 0.1, decay: high ? 0.6 : 0.25 })
  }

  cheer() {
    // One gentle rising chord
    ;[523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, type: 'sine', gain: 0.08, decay: 0.9, delay: i * 0.12 }))
  }

  whoosh() {
    this.burst({ freq: 500, q: 0.5, gain: 0.3, decay: 0.8, type: 'lowpass' })
  }

  /** A star: a soft ding that walks round a five-note scale along a line of stars (it never climbs forever). */
  coin(streak = 0) {
    const f = 784 * Math.pow(2, [0, 2, 4, 7, 9][streak % 5] / 12)
    this.tone({ freq: f, type: 'sine', gain: 0.07, decay: 0.12 })
    this.tone({ freq: f * 1.5, type: 'triangle', gain: 0.05, decay: 0.25, delay: 0.06 })
  }

  /** A mystery box opening: a quick rising arpeggio. */
  box() {
    ;[392, 494, 587, 784].forEach((f, i) => this.tone({ freq: f, type: 'triangle', gain: 0.07, decay: 0.2, delay: i * 0.07 }))
  }

  /** Easy mode: a springy cartoon boing for a friendly bump (no crunch), a little different every time. */
  bump(strength = 1) {
    const now = performance.now()
    if (now - this.lastCrash < 250) return
    this.lastCrash = now
    const f = 180 + Math.random() * 120
    this.tone({ freq: f, type: 'sine', gain: 0.14 * strength, decay: 0.35, slide: f * 0.9 })
    this.tone({ freq: f * 2, type: 'triangle', gain: 0.04 * strength, decay: 0.2, slide: -f })
  }

  /** Through a rainbow: a rushing whoosh under a quick sparkly run up the scale. */
  zoom() {
    this.burst({ freq: 700, q: 0.6, gain: 0.32, decay: 0.9, type: 'lowpass' })
    this.tone({ freq: 330, type: 'triangle', gain: 0.08, decay: 0.6, slide: 500 })
    ;[784, 988, 1175, 1568].forEach((f, i) => this.tone({ freq: f, type: 'sine', gain: 0.06, decay: 0.3, delay: 0.05 + i * 0.06 }))
  }

  /** A tap on the ⚡ button: a bright little blip. */
  tap() {
    this.tone({ freq: 880, type: 'sine', gain: 0.09, decay: 0.15, slide: 400 })
  }

  /** The child passed a car: a cheeky rising zip. */
  overtake() {
    this.tone({ freq: 440, type: 'triangle', gain: 0.08, decay: 0.22, slide: 440 })
    this.tone({ freq: 660, type: 'sine', gain: 0.06, decay: 0.25, delay: 0.12, slide: 330 })
  }

  /** The child dropped a place: a soft "aww" slide down, nothing harsh. */
  overtaken() {
    this.tone({ freq: 420, type: 'sine', gain: 0.05, decay: 0.35, slide: -160 })
  }

  /** A win: a little brass-ish fanfare (triangles), da-da-da-daaa. */
  fanfare() {
    const notes = [[523, 0], [523, 0.14], [523, 0.28], [698, 0.44], [880, 0.78], [784, 0.96], [1047, 1.14]]
    for (const [f, at] of notes) {
      this.tone({ freq: f, type: 'triangle', gain: 0.1, decay: at > 1 ? 1.2 : 0.22, delay: at })
      this.tone({ freq: f / 2, type: 'sine', gain: 0.06, decay: at > 1 ? 1.2 : 0.22, delay: at })
    }
  }

  /** The horn shockwave: a big honk and a whoomp. */
  wave() {
    this.horn()
    this.tone({ freq: 120, type: 'sine', gain: 0.25, decay: 0.6, slide: -80 })
    this.burst({ freq: 300, q: 0.6, gain: 0.2, decay: 0.7, type: 'lowpass' })
  }

  /**
   * A soft music-box loop for the menus and the podium (called every frame; `on` false lets it rest).
   * Slow pentatonic notes over a low drone, well under the effects.
   */
  updateMusic(on) {
    if (!this.ctx || !on || this.ctx.state !== 'running') {
      if (this.ctx) this.nextBeat = 0
      return
    }
    const now = this.ctx.currentTime
    if (this.nextBeat < now) this.nextBeat = now + 0.1
    while (this.nextBeat < now + 0.3) {
      const b = this.beat++
      const at = this.nextBeat - now
      const n = MUSIC_TUNE[b % MUSIC_TUNE.length]
      this.tone({ freq: 392 * Math.pow(2, n / 12), type: 'sine', gain: 0.035, decay: 0.7, delay: at })
      if (b % 4 === 0) this.tone({ freq: 98 * Math.pow(2, MUSIC_BASS[(b / 4) % 4] / 12), type: 'triangle', gain: 0.04, decay: 1.6, delay: at })
      this.nextBeat += 0.42
    }
  }
}
