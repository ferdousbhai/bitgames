/** Every sound is synthesized with Web Audio: nothing to download. */
const PENTA = [0, 2, 4, 7, 9] // major pentatonic: any run of notes sounds happy
const note = (step, base = 523.25) => base * 2 ** ((PENTA[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5)) / 12)
// A bouncy bath-time tune: melody steps (null = rest) over an oom-pah bass.
const MELODY = [0, 2, 4, null, 4, 5, 4, 2, 0, null, 2, 4, 2, 0, -1, null, 0, 2, 4, null, 7, 5, 4, 2, 4, 2, 0, -1, 0, null, null, null]
const BASS = [0, 3, 2, 1]

export class Audio {
  constructor() {
    this.ctx = null
    this.muted = false
    this.musicOn = true
    this.nextBeat = 0
    this.beat = 0
    this.tempo = 0.22 // seconds per step (calm pass: was 0.16, with a 0.125 party speed-up)
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
    this.musicBus.gain.value = this.musicOn ? 0.2 : 0
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

  setMusic(on) {
    this.musicOn = on
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.2 : 0, this.ctx.currentTime, 0.1)
  }

  burst({ freq, q = 1, gain = 0.4, decay = 0.2, type = 'bandpass', delay = 0, sweep = 0, out }) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.setValueAtTime(freq, t)
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + decay)
    filter.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + decay)
    src.connect(filter).connect(g).connect(out ?? this.master)
    src.start(t, Math.random() * 0.5)
    src.stop(t + decay + 0.05)
  }

  tone({ freq, type = 'sine', gain = 0.2, decay = 0.2, delay = 0, slide = 0, attack = 0.005, out, vibrato = 0 }) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + decay)
    if (vibrato) {
      const lfo = ctx.createOscillator()
      const depth = ctx.createGain()
      lfo.frequency.value = 18
      depth.gain.value = vibrato
      lfo.connect(depth).connect(osc.frequency)
      lfo.start(t)
      lfo.stop(t + decay + 0.05)
    }
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
    osc.connect(g).connect(out ?? this.master)
    osc.start(t)
    osc.stop(t + decay + 0.05)
  }

  /** The rubber duck squeak: a squeezed, wobbly whistle up and back down. */
  squeak(pitch = 1, delay = 0) {
    if (!this.ready) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    osc.type = 'square'
    const f = 950 * pitch * (0.92 + Math.random() * 0.16)
    osc.frequency.setValueAtTime(f * 0.8, t)
    osc.frequency.exponentialRampToValueAtTime(f * 1.35, t + 0.07)
    osc.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.2)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = f * 1.4
    bp.Q.value = 3
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
    g.gain.setValueAtTime(0.21, t + 0.14)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24)
    osc.connect(bp).connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + 0.3)
    this.burst({ freq: f * 2, q: 4, gain: 0.05, decay: 0.15, delay })
  }

  /** BONK: a rubbery thump plus a squeak from each duck. */
  bonk(strength = 1) {
    const s = Math.min(1.5, strength)
    this.tone({ freq: 160, type: 'sine', gain: 0.35 * s, decay: 0.18, slide: -90 })
    this.tone({ freq: 320, type: 'triangle', gain: 0.15 * s, decay: 0.12, slide: 240 })
    this.squeak(1, 0.02)
    this.squeak(1.25, 0.12)
  }

  quack(pitch = 1) {
    if (!this.ready) return
    for (let i = 0; i < 2; i++) {
      const ctx = this.ctx
      const t = ctx.currentTime + i * 0.17
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(330 * pitch, t)
      osc.frequency.exponentialRampToValueAtTime(220 * pitch, t + 0.13)
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.setValueAtTime(1300, t)
      f.frequency.exponentialRampToValueAtTime(700, t + 0.13)
      f.Q.value = 2
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
      osc.connect(f).connect(g).connect(this.master)
      osc.start(t)
      osc.stop(t + 0.2)
    }
  }

  ribbit() {
    for (let i = 0; i < 2; i++) {
      this.tone({ freq: 180, type: 'triangle', gain: 0.16, decay: 0.08, delay: i * 0.12, slide: 120 })
      this.burst({ freq: 600, q: 6, gain: 0.12, decay: 0.08, delay: i * 0.12 })
    }
  }

  splash(big = 1) {
    this.burst({ freq: 900, q: 0.6, gain: 0.45 * big, decay: 0.5 * big, type: 'lowpass', sweep: -500 })
    this.burst({ freq: 3000, q: 0.8, gain: 0.1 * big, decay: 0.35, type: 'highpass' })
    this.tone({ freq: 240, type: 'sine', gain: 0.25, decay: 0.15, slide: -140 })
    for (let i = 0; i < 4; i++) this.tone({ freq: 700 + Math.random() * 900, type: 'sine', gain: 0.06, decay: 0.08, delay: 0.1 + Math.random() * 0.35, slide: 400 })
  }

  plop() {
    this.tone({ freq: 380, type: 'sine', gain: 0.2, decay: 0.12, slide: 500 })
    this.burst({ freq: 1500, q: 2, gain: 0.08, decay: 0.06 })
  }

  /** A bubble pops: a quick rising plip on a note of the scale (`run` walks the scale). */
  bubble(run = 0) {
    this.tone({ freq: 600 + Math.random() * 80, type: 'sine', gain: 0.18, decay: 0.08, slide: 900 })
    this.tone({ freq: note(Math.min(run, 12), 784), type: 'triangle', gain: 0.1, decay: 0.2, delay: 0.03 })
  }

  star() {
    for (let i = 0; i < 6; i++) this.tone({ freq: note(5 + i * 2), type: 'triangle', gain: 0.12, decay: 0.3, delay: i * 0.05 })
  }

  gift() {
    const tune = [0, 2, 4, 7]
    tune.forEach((s, i) => this.tone({ freq: note(s, 523.25), type: 'triangle', gain: 0.1, decay: 0.3, delay: i * 0.09 }))
  }

  power(kind) {
    if (kind === 'giant') {
      for (let i = 0; i < 3; i++) this.tone({ freq: 200 + i * 120, type: 'triangle', gain: 0.22, decay: 0.25, delay: i * 0.1, slide: 150 })
    } else if (kind === 'speedy') {
      this.burst({ freq: 400, q: 1.5, gain: 0.18, decay: 0.5, sweep: 2500 })
      this.tone({ freq: 400, type: 'triangle', gain: 0.08, decay: 0.4, slide: 1200 })
    } else {
      for (let i = 0; i < 5; i++) this.tone({ freq: note(8 + i), type: 'sine', gain: 0.1, decay: 0.5, delay: i * 0.04, vibrato: 12 })
    }
  }

  dash() {
    this.burst({ freq: 700, q: 1.2, gain: 0.3, decay: 0.3, sweep: 2200 })
  }

  boing() {
    this.tone({ freq: 140, type: 'triangle', gain: 0.3, decay: 0.45, slide: 380, vibrato: 30 })
  }

  whee() {
    this.tone({ freq: 500, type: 'sine', gain: 0.18, decay: 0.6, slide: 900, vibrato: 25 })
  }

  click() {
    this.tone({ freq: 660, type: 'triangle', gain: 0.18, decay: 0.12, slide: 300 })
  }

  beep(high = false) {
    // Calm pass: a soft sine and triangle count-in (was a square-wave beep).
    this.tone({ freq: high ? 784 : 523, type: 'sine', gain: 0.16, decay: high ? 0.6 : 0.3 })
    this.tone({ freq: high ? 784 : 523, type: 'triangle', gain: 0.05, decay: high ? 0.5 : 0.25 })
  }

  /** The round is over: a slow rising arpeggio that settles (calm pass: no square wave or crackle). */
  cheer() {
    const tune = [0, 2, 4, 7]
    tune.forEach((s, i) => this.tone({ freq: note(s, 392), type: 'triangle', gain: 0.1, decay: 0.7, delay: i * 0.18, attack: 0.02 }))
    this.chord(0.8)
  }

  /** One soft major chord, played once. */
  chord(delay = 0) {
    ;[0, 2, 4].forEach((s, i) => this.tone({ freq: note(s, 392), type: 'sine', gain: 0.09, decay: 1.6, delay: delay + i * 0.06, attack: 0.04 }))
  }

  /** The music loop, scheduled a little ahead each frame, at one steady, unhurried tempo. */
  updateMusic(playing) {
    if (!this.ready || !playing || !this.musicOn) return
    const ctx = this.ctx
    const step = this.tempo
    if (this.nextBeat < ctx.currentTime) this.nextBeat = ctx.currentTime + 0.05
    while (this.nextBeat < ctx.currentTime + 0.25) {
      const b = this.beat++
      const t = this.nextBeat - ctx.currentTime
      const m = MELODY[b % MELODY.length]
      if (m != null) this.tone({ freq: note(m, 523.25), type: 'triangle', gain: 0.14, decay: 0.3, delay: t, out: this.musicBus })
      const bar = Math.floor(b / 8) % BASS.length
      if (b % 4 === 0) this.tone({ freq: note(BASS[bar], 130.8), type: 'sine', gain: 0.32, decay: 0.25, delay: t, out: this.musicBus })
      if (b % 4 === 2) this.tone({ freq: note(BASS[bar] + 2, 130.8), type: 'sine', gain: 0.2, decay: 0.18, delay: t, out: this.musicBus })
      this.nextBeat += step
    }
  }
}
