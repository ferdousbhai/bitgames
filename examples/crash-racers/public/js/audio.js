/** All sound is synthesized with Web Audio: no sound files to download. */
export class Audio {
  constructor() {
    this.ctx = null
    this.engine = null
    this.lastCrash = 0
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
    this.master.gain.value = 0.7
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
    osc.type = 'sawtooth'
    osc2.type = 'square'
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

  /** Engine pitch follows speed; throttle opens it up. Starts the engine once audio is unlocked. */
  updateEngine(speed, throttle) {
    if (!this.ctx) return
    if (!this.engine) this.startEngine()
    const t = this.ctx.currentTime
    const gearSpeed = speed % 9
    const rpm = 45 + gearSpeed * 9 + speed * 2.2
    this.engine.osc.frequency.setTargetAtTime(rpm, t, 0.05)
    this.engine.osc2.frequency.setTargetAtTime(rpm * 0.5, t, 0.05)
    this.engine.filter.frequency.setTargetAtTime(400 + throttle * 900 + speed * 20, t, 0.08)
    this.engine.gain.gain.setTargetAtTime(0.05 + throttle * 0.05, t, 0.1)
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
    const v = Math.min(1, speed / 25) * (near ? 1 : 0.4)
    this.tone({ freq: 90, type: 'sine', gain: 0.6 * v, decay: 0.35, slide: -50 })
    this.burst({ freq: 900, q: 0.6, gain: 0.7 * v, decay: 0.25 + v * 0.5 })
    this.burst({ freq: 3200, q: 4, gain: 0.25 * v, decay: 0.4 + v * 0.4, delay: 0.02 })
    if (v > 0.5) this.burst({ freq: 300, q: 0.8, gain: 0.5 * v, decay: 0.8, delay: 0.05 })
  }

  glass(strength = 1) {
    for (let i = 0; i < 6 * strength; i++) this.tone({ freq: 2500 + Math.random() * 3500, type: 'triangle', gain: 0.06, decay: 0.15 + Math.random() * 0.3, delay: Math.random() * 0.25 })
    this.burst({ freq: 6000, q: 2, gain: 0.25 * strength, decay: 0.3 })
  }

  clunk(strength = 1) {
    this.tone({ freq: 160, type: 'square', gain: 0.12 * strength, decay: 0.15, slide: -80 })
    this.burst({ freq: 1400, q: 3, gain: 0.15 * strength, decay: 0.2 })
  }

  scrape(intensity) {
    if (intensity > 0.2) this.burst({ freq: 2500 + Math.random() * 1500, q: 6, gain: 0.08 * intensity, decay: 0.12 })
  }

  /** A car landing from a jump: a deep thud and some dust noise. */
  thump(strength = 1) {
    this.tone({ freq: 70, type: 'sine', gain: 0.5 * strength, decay: 0.3, slide: -30 })
    this.burst({ freq: 400, q: 0.7, gain: 0.25 * strength, decay: 0.3, type: 'lowpass' })
  }

  splash() {
    this.burst({ freq: 700, q: 0.7, gain: 0.25, decay: 0.4, type: 'lowpass' })
  }

  horn() {
    this.tone({ freq: 392, type: 'square', gain: 0.12, decay: 0.45 })
    this.tone({ freq: 494, type: 'square', gain: 0.1, decay: 0.45 })
  }

  beep(high = false) {
    this.tone({ freq: high ? 880 : 440, type: 'square', gain: 0.15, decay: high ? 0.6 : 0.25 })
  }

  cheer() {
    ;[523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ freq: f, type: 'triangle', gain: 0.15, decay: 0.3, delay: i * 0.09 }))
  }

  whoosh() {
    this.burst({ freq: 500, q: 0.5, gain: 0.3, decay: 0.8, type: 'lowpass' })
  }

  /** A star: a bright ding that climbs with a streak of stars. */
  coin(streak = 0) {
    const f = 988 * Math.pow(2, Math.min(streak, 12) / 12)
    this.tone({ freq: f, type: 'square', gain: 0.07, decay: 0.08 })
    this.tone({ freq: f * 1.5, type: 'triangle', gain: 0.1, decay: 0.25, delay: 0.06 })
  }

  /** A mystery box opening: a quick rising arpeggio. */
  box() {
    ;[392, 494, 587, 784, 988].forEach((f, i) => this.tone({ freq: f, type: 'square', gain: 0.07, decay: 0.12, delay: i * 0.05 }))
  }

  /** The horn shockwave: a big honk and a whoomp. */
  wave() {
    this.horn()
    this.tone({ freq: 120, type: 'sine', gain: 0.5, decay: 0.6, slide: -80 })
    this.burst({ freq: 300, q: 0.6, gain: 0.4, decay: 0.7, type: 'lowpass' })
  }

  /** The last seconds of the finish countdown. */
  tick() {
    this.tone({ freq: 660, type: 'triangle', gain: 0.08, decay: 0.08 })
  }
}
